/**
 * Answers architecture questions from a built graph:
 * who-uses, deps, impact, path, hot-path, find, and module details.
 */

import { CODE_EXT } from './constants.mjs';
import { makeStepResolver } from './flows.mjs';

export function indexGraph(graph) {
  const modules = new Map(graph.modules.map(m => [m.id, m]));
  const files = new Map(graph.files.map(f => [f.id, f]));
  const out = new Map();
  const inc = new Map();
  for (const e of graph.moduleEdges) {
    if (!out.has(e.from)) {
      out.set(e.from, []);
    }
    out.get(e.from).push(e);
    if (!inc.has(e.to)) {
      inc.set(e.to, []);
    }
    inc.get(e.to).push(e);
  }
  return { graph, modules, files, out, inc };
}

/** Finds modules (and an optional file) matching a name typed by a person. */
export function resolveTarget(idx, query) {
  const q = query.replace(/\/$/, '');
  const exact = idx.modules.get(q) || idx.modules.get(`src/${q}`);
  if (exact) {
    return { modules: [exact] };
  }
  const file = idx.files.get(q) || idx.files.get(`src/${q}`);
  if (file) {
    return { modules: [idx.modules.get(file.module)], file };
  }
  const lower = q.toLowerCase();
  const byName = [...idx.modules.values()].filter(m => {
    const name = m.name.toLowerCase();
    return name === lower || name.replace(CODE_EXT, '') === lower || name.endsWith(`/${lower}`);
  });
  if (byName.length) {
    return { modules: byName };
  }
  const byExport = idx.graph.files.filter(f => (f.exports || []).includes(q));
  if (byExport.length) {
    return { modules: [...new Set(byExport.map(f => f.module))].map(id => idx.modules.get(id)), exportOf: q };
  }
  return { modules: [] };
}

const label = m => `${m.name} [${m.kind} · ${m.plane ?? '—'} · ${m.thread}]`;

export function describeModule(idx, m) {
  const uses = (idx.out.get(m.id) || []).map(e => `${idx.modules.get(e.to)?.name ?? e.to} (${e.kinds.join(', ')})`);
  const usedBy = (idx.inc.get(m.id) || []).map(e => `${idx.modules.get(e.from)?.name ?? e.from} (${e.kinds.join(', ')})`);
  const lines = [`${label(m)}`, `  purpose: ${m.purpose || '(missing)'}`];
  lines.push(`  uses: ${uses.length ? uses.join('; ') : '—'}`);
  lines.push(`  used by: ${usedBy.length ? usedBy.join('; ') : '—'}`);
  if (m.packages?.length) {
    lines.push(`  packages: ${m.packages.join(', ')}`);
  }
  const violations = idx.graph.violations.filter(v => m.files.includes(v.file));
  if (violations.length) {
    lines.push(`  rule violations: ${violations.length}`);
  }
  return lines.join('\n');
}

export function impact(idx, startId) {
  const seen = new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    for (const e of idx.inc.get(id) || []) {
      if (!seen.has(e.from)) {
        seen.set(e.from, seen.get(id) + 1);
        queue.push(e.from);
      }
    }
  }
  seen.delete(startId);
  return [...seen.entries()]
    .map(([id, depth]) => ({ module: idx.modules.get(id), depth }))
    .sort((a, b) => a.depth - b.depth || a.module.id.localeCompare(b.module.id));
}

export function shortestPath(idx, fromId, toId, { directed = true } = {}) {
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (id === toId) {
      break;
    }
    const next = (idx.out.get(id) || []).map(e => ({ id: e.to, e, dir: '→' }));
    if (!directed) {
      next.push(...(idx.inc.get(id) || []).map(e => ({ id: e.from, e, dir: '←' })));
    }
    for (const n of next) {
      if (!prev.has(n.id)) {
        prev.set(n.id, { from: id, e: n.e, dir: n.dir });
        queue.push(n.id);
      }
    }
  }
  if (!prev.has(toId)) {
    return null;
  }
  const steps = [];
  let cur = toId;
  while (prev.get(cur)) {
    steps.unshift({ ...prev.get(cur), to: cur });
    cur = prev.get(cur).from;
  }
  return steps;
}

export function hotPath(idx, flows, config) {
  const resolveStep = makeStepResolver(idx.graph, config);
  const audioFlows = flows.filter(f =>
    f.steps.some(s => ['mic', 'speaker', 'headphones', 'midi'].includes(s.toLowerCase())),
  );
  if (!audioFlows.length) {
    return 'No flow starts at the mic or playback yet. Describe it in docs/architecture/flows.md, e.g.\n## note-feedback\n```flow\nmic -> audio/capture -> audio/detection -> sync/events -> motion/drivers/keyGlow -> motion/scenes/Keyboard -> screen\n```';
  }
  const lines = [];
  for (const f of audioFlows) {
    lines.push(`Flow ${f.name}:`);
    let sawAudio = false;
    for (const step of f.steps) {
      const r = resolveStep(step);
      if (r.module) {
        const m = idx.modules.get(r.module);
        const warn = sawAudio && m.thread === 'js' ? '   ⚠ JS thread inside the hot path' : '';
        if (m.thread === 'audio') {
          sawAudio = true;
        }
        lines.push(`  ${m.name} [${m.thread}]${warn}`);
      } else {
        lines.push(`  ${step}${r.external ? '' : '   ⚠ not a module'}`);
      }
    }
  }
  return lines.join('\n');
}
