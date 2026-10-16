/**
 * The compact architecture map Claude sees at session start (design 4.4).
 * Trimmed to a character budget: modules first, then flows, then problems.
 */

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function renderSummary(graph, flows, problems, { budget = 6000 } = {}) {
  if (!graph) {
    return 'Architecture map: no graph yet. Run `npm run arch:build`.';
  }
  const nameOf = id => graph.modules.find(m => m.id === id)?.name || id;
  const deps = new Map();
  for (const e of graph.moduleEdges) {
    if (!deps.has(e.from)) {
      deps.set(e.from, []);
    }
    deps.get(e.from).push(nameOf(e.to));
  }
  const violations = problems.filter(p => p.type === 'violation').length;
  const header = `Architecture map · ${graph.modules.length} modules · ${violations} rule violation${violations === 1 ? '' : 's'} · ${problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'}` : 'no problems'}`;

  const nameWidth = Math.min(32, Math.max(12, ...graph.modules.map(m => m.name.length)) + 2);
  const moduleLines = (withDeps, perPlaneLimit) => {
    const lines = [];
    for (const plane of graph.planes) {
      const mods = graph.modules.filter(m => m.plane === plane.id);
      if (!mods.length) {
        continue;
      }
      const shown = perPlaneLimit ? mods.slice(0, perPlaneLimit) : mods;
      shown.forEach((m, i) => {
        const label = (i === 0 ? plane.label : '').padEnd(9);
        const purpose = truncate(m.purpose || '(no purpose yet)', 46).padEnd(47);
        const d = withDeps && deps.get(m.id)?.length ? ` → ${truncate(deps.get(m.id).join(', '), 40)}` : '';
        lines.push(`${label}${m.name.padEnd(nameWidth)}${purpose}[${m.thread}]${d}`.trimEnd());
      });
      if (shown.length < mods.length) {
        lines.push(`${''.padEnd(9)}… +${mods.length - shown.length} more (/arch)`);
      }
    }
    return lines;
  };
  const flowLines = flows.map(f => `Flow ${f.name}: ${f.steps.join(' → ')}`);
  const problemLines = problems.slice(0, 6).map(p => `! ${truncate(p.message, 160)}`);
  if (problems.length > 6) {
    problemLines.push(`! … +${problems.length - 6} more (/arch check)`);
  }
  const footer = 'More: /arch who-uses <x> · deps <x> · impact <x> · path <a> <b> · hot-path · check';

  const attempts = [
    [moduleLines(true, 0), flowLines, problemLines],
    [moduleLines(false, 0), flowLines, problemLines],
    [moduleLines(false, 12), flowLines.slice(0, 5), problemLines.slice(0, 4)],
    [moduleLines(false, 5), flowLines.slice(0, 2), problemLines.slice(0, 2)],
  ];
  for (const [mods, fl, pr] of attempts) {
    const text = [
      header,
      ...mods,
      ...(fl.length ? fl : ['Flows: none yet (docs/architecture/flows.md)']),
      ...pr,
      footer,
    ].join('\n');
    if (text.length <= budget) {
      return text;
    }
  }
  return truncate([header, ...moduleLines(false, 3), footer].join('\n'), budget);
}
