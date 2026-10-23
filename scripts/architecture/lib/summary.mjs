/**
 * The compact architecture map Claude sees at session start (design 4.4).
 * Families of small sibling modules (4 or more under one folder, such as the notation
 * symbols) fold onto one line; their purposes are one `/arch show <x>` away.
 * Trimmed to a character budget: modules first, then flows, then problems.
 */

const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const parentOf = name =>
  name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
const leafOf = name => name.slice(name.lastIndexOf('/') + 1);
const FAMILY_MIN = 4;

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
    deps.get(e.from).push(e.to);
  }
  const violations = problems.filter(p => p.type === 'violation').length;
  const header = `Architecture map · ${
    graph.modules.length
  } modules · ${violations} rule violation${violations === 1 ? '' : 's'} · ${
    problems.length
      ? `${problems.length} problem${problems.length === 1 ? '' : 's'}`
      : 'no problems'
  }`;

  // Families: FAMILY_MIN or more leaf modules (nothing nested under them) in one folder
  // and one plane, such as the notation symbols. Modules with children stay on their own line.
  const hasChildren = new Set(graph.modules.map(m => parentOf(m.name)));
  const familyKey = m => `${m.plane}\u0000${parentOf(m.name)}`;
  const familySize = new Map();
  for (const m of graph.modules) {
    if (parentOf(m.name) && !hasChildren.has(m.name)) {
      familySize.set(familyKey(m), (familySize.get(familyKey(m)) || 0) + 1);
    }
  }
  const inFamily = m =>
    parentOf(m.name) !== '' &&
    !hasChildren.has(m.name) &&
    familySize.get(familyKey(m)) >= FAMILY_MIN;
  const memberList = members => {
    const names = members.map(m => leafOf(m.name));
    return names.length > 12
      ? `${names.slice(0, 12).join(', ')}, +${names.length - 12} more`
      : names.join(', ');
  };

  const moduleLines = (withDeps, perPlaneLimit) => {
    const lines = [];
    for (const plane of graph.planes) {
      const mods = graph.modules.filter(m => m.plane === plane.id);
      if (!mods.length) {
        continue;
      }
      const rows = [];
      const families = new Map();
      for (const m of mods) {
        if (inFamily(m)) {
          const p = parentOf(m.name);
          if (!families.has(p)) {
            families.set(p, []);
            rows.push({ family: p });
          }
          families.get(p).push(m);
        } else {
          rows.push({ module: m });
        }
      }
      const shown = perPlaneLimit ? rows.slice(0, perPlaneLimit) : rows;
      const width = Math.min(
        44,
        Math.max(
          14,
          ...shown.filter(r => r.module).map(r => r.module.name.length),
        ) + 2,
      );
      shown.forEach((row, i) => {
        const label = (i === 0 ? plane.label : '').padEnd(9);
        if (row.family) {
          const members = families.get(row.family);
          const threads = [...new Set(members.map(m => m.thread))].join('/');
          lines.push(
            `${label}${row.family}/ {${memberList(members)}} [${threads}]`,
          );
          return;
        }
        const m = row.module;
        const name =
          m.name.length >= width ? `${m.name}  ` : m.name.padEnd(width);
        const purpose = truncate(m.purpose || '(no purpose yet)', 60);
        const d =
          withDeps && deps.get(m.id)?.length
            ? ` → ${truncate(
                deps
                  .get(m.id)
                  .map(id => leafOf(nameOf(id)))
                  .join(', '),
                48,
              )}`
            : '';
        lines.push(`${label}${name}${purpose} [${m.thread}]${d}`.trimEnd());
      });
      if (shown.length < rows.length) {
        lines.push(
          `${''.padEnd(9)}… +${rows.length - shown.length} more (/arch)`,
        );
      }
    }
    return lines;
  };
  const flowLines = flows.map(
    f => `Flow ${f.name}: ${f.steps.map(s => leafOf(s)).join(' → ')}`,
  );
  const problemLines = problems
    .slice(0, 6)
    .map(p => `! ${truncate(p.message, 160)}`);
  if (problems.length > 6) {
    problemLines.push(`! … +${problems.length - 6} more (/arch check)`);
  }
  const footer =
    'Folded families: /arch show <name> for each part. More: /arch who-uses <x> · deps <x> · impact <x> · path <a> <b> · hot-path · check';

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
  return truncate(
    [header, ...moduleLines(false, 3), footer].join('\n'),
    budget,
  );
}
