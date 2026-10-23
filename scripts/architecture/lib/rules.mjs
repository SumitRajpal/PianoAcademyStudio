/**
 * Connection rules (config.rules) evaluated against a built graph.
 * Rule types: forbid-imports, allow-only, public-api, forbid-pattern,
 * thread-boundary, no-cycles.
 */

import { posix } from 'node:path';
import { matches } from './glob.mjs';

const INDEX_RE = /^index\.[cm]?[jt]sx?$/;

export function patternRulesFor(config) {
  return (config.rules || [])
    .filter(r => r.type === 'forbid-pattern')
    .map(r => ({
      id: r.id,
      files: r.files,
      except: r.except,
      pattern: r.pattern,
    }));
}

function isInside(file, dir) {
  return file === dir || file.startsWith(`${dir}/`);
}

/** Nearest ancestor folder of `file` that matches the scope glob. */
function boundaryDir(file, scope) {
  let dir = posix.dirname(file);
  while (dir !== '.' && dir !== '') {
    if (matches(dir, scope)) {
      return dir;
    }
    dir = posix.dirname(dir);
  }
  return null;
}

/** Strongly connected components with more than one file, or a file importing itself. */
export function findCycles(nodes, edges) {
  const adj = new Map(nodes.map(n => [n, []]));
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }
  for (const list of adj.values()) {
    list.sort();
  }
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const result = [];
  const strongConnect = v => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      const selfLoop = scc.length === 1 && (adj.get(v) || []).includes(v);
      if (scc.length > 1 || selfLoop) {
        result.push(scc.sort());
      }
    }
  };
  for (const n of [...nodes].sort()) {
    if (!indices.has(n)) {
      strongConnect(n);
    }
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

export function evaluateRules(
  graph,
  config,
  {
    patternHits = new Map(),
    edgeLines = new Map(),
    edgeNames = new Map(),
  } = {},
) {
  const violations = [];
  const fileById = new Map(graph.files.map(f => [f.id, f]));
  // Native #include links are approximate and follow C++ rules, not module boundaries,
  // so connection rules judge only JS/TS imports.
  const importEdges = graph.edges.filter(
    e => e.kind === 'imports' && fileById.has(e.to) && !e.approx,
  );
  const lineOf = e => edgeLines.get(`${e.from}\u0000${e.to}`);
  const push = (rule, v) =>
    violations.push({
      rule: rule.id,
      ...v,
      message: rule.description,
      fix: rule.fix || null,
    });

  for (const rule of config.rules || []) {
    switch (rule.type) {
      case 'forbid-imports':
        for (const e of importEdges) {
          if (
            matches(e.from, rule.from) &&
            matches(e.to, rule.to) &&
            !matches(e.to, rule.except)
          ) {
            push(rule, { file: e.from, line: lineOf(e), target: e.to });
          }
        }
        break;
      case 'allow-only':
        for (const e of importEdges) {
          if (matches(e.from, rule.from) && !matches(e.to, rule.allow)) {
            push(rule, { file: e.from, line: lineOf(e), target: e.to });
          }
        }
        break;
      case 'public-api':
        for (const e of importEdges) {
          for (const scope of rule.scope || []) {
            const dir = boundaryDir(e.to, scope);
            if (
              dir &&
              !isInside(e.from, dir) &&
              !(
                posix.dirname(e.to) === dir &&
                INDEX_RE.test(posix.basename(e.to))
              )
            ) {
              push(rule, {
                file: e.from,
                line: lineOf(e),
                target: e.to,
                boundary: dir,
              });
              break;
            }
          }
        }
        break;
      case 'thread-boundary':
        // Symbol-aware: importing a hook or component into UI/audio-thread code breaks the
        // rule; importing constants, types or worklets from the same file doesn't. A file
        // that is plain JS-thread code (no hooks or components, e.g. a TurboModule wrapper)
        // breaks it whatever is imported.
        for (const e of importEdges) {
          if (e.typeOnly) {
            continue;
          }
          const from = fileById.get(e.from);
          const to = fileById.get(e.to);
          if (!rule.fromThreads.includes(from?.thread)) {
            continue;
          }
          const names = edgeNames.get(`${e.from}\u0000${e.to}`) || new Set();
          const toJsOnly = new Set(to?.jsOnly || []);
          const symbols = [...names]
            .filter(n => toJsOnly.has(n) || (n === '*' && toJsOnly.size > 0))
            .sort();
          const wholeFile =
            rule.toThreads.includes(to?.thread) &&
            toJsOnly.size === 0 &&
            !to?.barrel;
          if (symbols.length || wholeFile) {
            push(rule, {
              file: e.from,
              line: lineOf(e),
              target: e.to,
              threads: `${from.thread} → ${to.thread}`,
              symbols: symbols.length ? symbols : null,
            });
          }
        }
        break;
      case 'forbid-pattern':
        for (const [file, hits] of patternHits) {
          for (const line of hits?.[rule.id] || []) {
            push(rule, { file, line });
          }
        }
        break;
      case 'no-cycles': {
        const runtime = importEdges.filter(e => !e.typeOnly && !e.dynamic);
        for (const cycle of findCycles([...fileById.keys()], runtime)) {
          push(rule, { file: cycle[0], cycle });
        }
        break;
      }
      default:
        break;
    }
  }

  const key = v =>
    `${v.rule}|${v.file}|${v.line ?? ''}|${v.target ?? ''}|${(
      v.cycle || []
    ).join(',')}`;
  const seen = new Set();
  return violations
    .filter(v => {
      const k = key(v);
      if (seen.has(k)) {
        return false;
      }
      seen.add(k);
      return true;
    })
    .map(v => {
      const out = { rule: v.rule, file: v.file };
      if (v.line) {
        out.line = v.line;
      }
      if (v.target) {
        out.target = v.target;
      }
      if (v.boundary) {
        out.boundary = v.boundary;
      }
      if (v.threads) {
        out.threads = v.threads;
      }
      if (v.symbols) {
        out.symbols = v.symbols;
      }
      if (v.cycle) {
        out.cycle = v.cycle;
      }
      out.message = v.message;
      if (v.fix) {
        out.fix = v.fix;
      }
      return out;
    })
    .sort((a, b) => key(a).localeCompare(key(b)));
}

/** One-line human description of a violation. */
export function describeViolation(v) {
  const where = v.line ? `${v.file}:${v.line}` : v.file;
  if (v.cycle) {
    return `${v.message} Cycle: ${v.cycle.join(' → ')} → ${v.cycle[0]}.${
      v.fix ? ` Fix: ${v.fix}` : ''
    }`;
  }
  const what = v.target
    ? `${where} imports ${v.symbols ? `${v.symbols.join(', ')} from ` : ''}${
        v.target
      }`
    : `${where}`;
  const extra = v.threads
    ? ` (${v.threads})`
    : v.boundary
    ? ` (inside ${v.boundary})`
    : '';
  return `${what}${extra}. ${v.message}${v.fix ? ` Fix: ${v.fix}` : ''}`;
}
