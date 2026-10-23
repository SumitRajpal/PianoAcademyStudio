/**
 * Renders docs/architecture/ARCHITECTURE.md from the graph.
 * The generated part is rewritten on every build; the Conventions section
 * (between the arch:conventions markers) belongs to Claude and is kept as is.
 */

const GEN_START = '<!-- arch:generated:start -->';
const GEN_END = '<!-- arch:generated:end -->';
const CONV_START = '<!-- arch:conventions:start -->';
const CONV_END = '<!-- arch:conventions:end -->';

const DEFAULT_CONVENTIONS = `## 7. Conventions

_Claude keeps this list current: decisions that aren't obvious from file names alone._

- Every module (a folder with an \`index.ts\`, or a single file) starts with \`/** @purpose … */\`. Add \`@thread ui|js|audio|native|any\` when it differs from its plane's default.
- \`graph.json\` and the generated sections of this file are rebuilt automatically. Never edit them by hand.
- Data flows live in [flows.md](flows.md) and are checked against the code.`;

const cell = text =>
  String(text ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
const code = text => `\`${text}\``;

export function extractConventions(doc) {
  if (!doc) {
    return null;
  }
  const start = doc.indexOf(CONV_START);
  const end = doc.indexOf(CONV_END);
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return doc.slice(start + CONV_START.length, end).trim();
}

/** The generated region of a doc, for detecting hand edits to it. */
export function extractGenerated(doc) {
  if (!doc) {
    return null;
  }
  const start = doc.indexOf(GEN_START);
  const end = doc.indexOf(GEN_END);
  return start === -1 || end === -1
    ? null
    : doc.slice(start, end + GEN_END.length);
}

function listNames(ids, nameOf, max = 6) {
  if (!ids.length) {
    return '—';
  }
  const names = ids.map(id => code(nameOf(id)));
  return names.length > max
    ? `${names.slice(0, max).join(', ')} +${names.length - max}`
    : names.join(', ');
}

function fileTree(files) {
  const root = {};
  for (const f of files) {
    let node = root;
    for (const part of f.split('/')) {
      node[part] = node[part] || {};
      node = node[part];
    }
  }
  const lines = [];
  const render = (node, indent) => {
    for (const name of Object.keys(node).sort()) {
      let label = name;
      let child = node[name];
      const isDir = Object.keys(child).length > 0;
      if (!isDir) {
        lines.push(`${indent}${label}`);
        continue;
      }
      while (
        Object.keys(child).length === 1 &&
        Object.keys(Object.values(child)[0]).length > 0
      ) {
        const only = Object.keys(child)[0];
        label = `${label}/${only}`;
        child = child[only];
      }
      lines.push(`${indent}${label}/`);
      render(child, `${indent}  `);
    }
  };
  render(root, '');
  return lines.join('\n');
}

function mermaid(graph) {
  const ids = new Map(graph.modules.map((m, i) => [m.id, `m${i}`]));
  const lines = ['flowchart LR'];
  for (const plane of graph.planes) {
    const mods = graph.modules.filter(m => m.plane === plane.id);
    if (!mods.length) {
      continue;
    }
    lines.push(
      `  subgraph plane_${plane.id}["${plane.label} · ${plane.thread}"]`,
    );
    for (const m of mods) {
      lines.push(`    ${ids.get(m.id)}["${m.name.replace(/"/g, "'")}"]`);
    }
    lines.push('  end');
  }
  for (const e of graph.moduleEdges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (!from || !to) {
      continue;
    }
    const approxOnly = e.kinds.every(k => k === 'calls-native');
    const label = e.kinds.includes('renders')
      ? '|renders|'
      : e.kinds.includes('calls-native')
      ? '|native|'
      : '';
    lines.push(`  ${from} ${approxOnly ? '-.->' : '-->'}${label} ${to}`);
  }
  return lines.join('\n');
}

export function renderArchitectureDoc(graph, flows, problems, existingDoc) {
  const nameOf = id => graph.modules.find(m => m.id === id)?.name || id;
  const uses = new Map();
  const usedBy = new Map();
  for (const e of graph.moduleEdges) {
    if (!uses.has(e.from)) {
      uses.set(e.from, []);
    }
    uses.get(e.from).push(e.to);
    if (!usedBy.has(e.to)) {
      usedBy.set(e.to, []);
    }
    usedBy.get(e.to).push(e.from);
  }
  const violationsByRule = new Map();
  for (const v of graph.violations) {
    violationsByRule.set(v.rule, (violationsByRule.get(v.rule) || 0) + 1);
  }

  const out = [];
  out.push('# Architecture', '');
  out.push(
    '> Generated from the code by `npm run arch:build`. Everything between the `arch:generated` markers is rewritten on every build. Claude maintains the Conventions section at the end; the generator leaves it alone.',
    '',
  );
  out.push(GEN_START, '');

  out.push('## 1. Overview', '');
  out.push('| Plane | Thread | Modules | Holds |', '|---|---|---|---|');
  for (const p of graph.planes) {
    out.push(
      `| ${p.label} | ${p.thread} | ${p.modules.length} | ${cell(
        p.description,
      )} |`,
    );
  }
  out.push('');
  out.push(
    problems.length
      ? `**${problems.length} problem${
          problems.length === 1 ? '' : 's'
        }** — see section 5, or run \`npm run arch:check\`.`
      : '**No problems.** Every rule passes, every module has a purpose, and every flow matches the code.',
    '',
  );

  out.push('## 2. Modules', '');
  out.push(
    '| Module | Kind | Plane | Thread | Purpose | Uses | Used by |',
    '|---|---|---|---|---|---|---|',
  );
  for (const m of graph.modules) {
    out.push(
      `| ${code(m.name)} | ${m.kind} | ${m.plane ?? '—'} | ${m.thread} | ${cell(
        m.purpose || '_missing_',
      )} | ${listNames(uses.get(m.id) || [], nameOf)} | ${listNames(
        usedBy.get(m.id) || [],
        nameOf,
      )} |`,
    );
  }
  out.push('');

  out.push('## 3. Connections', '');
  out.push(
    'Solid arrows are imports (labelled when a component is rendered); dashed arrows are JS → native calls.',
    '',
  );
  out.push('```mermaid', mermaid(graph), '```', '');

  out.push('## 4. Flows', '');
  if (!flows.length) {
    out.push('_No flows yet. Add them to [flows.md](flows.md)._', '');
  } else {
    for (const f of flows) {
      out.push(`- **${f.name}:** ${f.steps.join(' → ')}`);
    }
    out.push('');
  }

  out.push('## 5. Rules', '');
  out.push('| Rule | Status |', '|---|---|');
  for (const rule of graph.rules || []) {
    const n = violationsByRule.get(rule.id) || 0;
    out.push(`| ${cell(rule.description)} | ${n ? `✗ ${n}` : '✓'} |`);
  }
  out.push('');
  if (problems.length) {
    out.push('### Problems', '');
    for (const p of problems) {
      out.push(`- ${p.message}`);
    }
    out.push('');
  }

  out.push('## 6. File tree', '');
  out.push('```', fileTree(graph.files.map(f => f.id)), '```', '');
  out.push(GEN_END, '');

  out.push(CONV_START);
  out.push(extractConventions(existingDoc) || DEFAULT_CONVENTIONS);
  out.push(CONV_END, '');
  return out.join('\n');
}
