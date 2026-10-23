/** Everything that needs fixing in a built graph. No heavy imports, so hooks can use it on graph.json directly. */

import { checkFlows } from './flows.mjs';
import { describeViolation } from './rules.mjs';

export function computeProblems(graph, flows, config) {
  const problems = [];
  for (const v of graph.violations) {
    problems.push({
      type: 'violation',
      file: v.file,
      target: v.target,
      cycle: v.cycle,
      rule: v.rule,
      message: describeViolation(v),
    });
  }
  for (const m of graph.modules) {
    if (!m.purpose) {
      const where = m.entry || m.files[0];
      problems.push({
        type: 'missing-purpose',
        module: m.id,
        file: where,
        files: m.files,
        message: `${m.name} has no purpose. Add a header comment at the top of ${where}: /** @purpose <one line on what it does> */`,
      });
    }
  }
  for (const p of checkFlows(graph, flows, config)) {
    problems.push(p);
  }
  return problems;
}
