/**
 * Data flows written by Claude in docs/architecture/flows.md.
 * Each flow is a `## name` heading followed by a ```flow block of arrow-separated steps.
 * The checker confirms every step exists and every hop is a real connection in the code.
 * A step in square brackets, `[screens/Lesson]`, is a module that wires its two
 * neighbours together when it mounts and runs nothing per frame: its connections
 * are still checked, and hot-path does not count it as a hop.
 */

import { CODE_EXT } from './constants.mjs';

export function parseFlows(text) {
  const flows = [];
  if (!text) {
    return flows;
  }
  let current = null;
  let inBlock = false;
  let otherFence = null;
  let buffer = [];
  text.split('\n').forEach((line, i) => {
    if (otherFence) {
      const close = /^(`{3,}|~{3,})\s*$/.exec(line);
      if (
        close &&
        close[1][0] === otherFence[0] &&
        close[1].length >= otherFence.length
      ) {
        otherFence = null;
      }
      return;
    }
    if (inBlock) {
      if (/^```\s*$/.test(line)) {
        inBlock = false;
        if (current) {
          const written = buffer
            .join(' ')
            .split(/\s*(?:->|→|=>)\s*/)
            .map(s => s.trim())
            .filter(Boolean);
          current.steps = written.map(s =>
            s.replace(/^\[\s*(.+?)\s*\]$/, '$1'),
          );
          current.wiring = written.map(s => /^\[.+\]$/.test(s));
        }
        buffer = [];
      } else {
        buffer.push(line);
      }
      return;
    }
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    const fence = /^(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (heading) {
      // "## name (js ok)" marks a flow that crosses the JS thread on purpose.
      const jsOk = /\(js ok\)\s*$/i.test(heading[1]);
      current = {
        name: heading[1].replace(/\s*\(js ok\)\s*$/i, ''),
        line: i + 1,
        steps: null,
        jsOk,
      };
      flows.push(current);
    } else if (fence && fence[1] === '```' && fence[2] === 'flow') {
      inBlock = true;
    } else if (fence) {
      otherFence = fence[1];
    }
  });
  return flows.filter(f => f.steps && f.steps.length);
}

/** A flow's steps as written: modules that only wire their neighbours keep their [brackets]. */
export function flowStepLabels(flow) {
  return flow.steps.map((s, i) => (flow.wiring?.[i] ? `[${s}]` : s));
}

export function makeStepResolver(graph, config) {
  const externals = new Set(
    (config.flowExternals || []).map(s => s.toLowerCase()),
  );
  const byKey = new Map();
  for (const m of graph.modules) {
    for (const key of [
      m.id,
      m.name,
      m.id.replace(CODE_EXT, ''),
      m.name.replace(CODE_EXT, ''),
    ]) {
      if (!byKey.has(key)) {
        byKey.set(key, m.id);
      }
    }
  }
  return step => {
    if (externals.has(step.toLowerCase())) {
      return { external: true };
    }
    const id = byKey.get(step) || byKey.get(`src/${step}`);
    return id ? { module: id } : { unknown: true };
  };
}

export function checkFlows(graph, flows, config) {
  const problems = [];
  const resolveStep = makeStepResolver(graph, config);
  const connected = new Set();
  for (const e of graph.moduleEdges) {
    connected.add(`${e.from}\u0000${e.to}`);
    connected.add(`${e.to}\u0000${e.from}`);
  }
  for (const flow of flows) {
    let prev = null;
    flow.steps.forEach((step, i) => {
      if (!flow.wiring?.[i]) {
        return;
      }
      const isModule = s => s !== undefined && resolveStep(s).module;
      if (!isModule(flow.steps[i - 1]) || !isModule(flow.steps[i + 1])) {
        problems.push({
          type: 'flow-wiring-misplaced',
          flow: flow.name,
          step,
          message: `Flow "${flow.name}": [${step}] wires its neighbours at mount, so it needs a module on each side.`,
        });
      }
    });
    for (const step of flow.steps) {
      const r = resolveStep(step);
      if (r.unknown) {
        problems.push({
          type: 'flow-unknown-step',
          flow: flow.name,
          step,
          message: `Flow "${
            flow.name
          }" names "${step}", which is not a module or a known outside step (${(
            config.flowExternals || []
          ).join(', ')}).`,
        });
        prev = null;
        continue;
      }
      if (r.module) {
        if (
          prev &&
          prev !== r.module &&
          !connected.has(`${prev}\u0000${r.module}`)
        ) {
          problems.push({
            type: 'flow-missing-connection',
            flow: flow.name,
            from: prev,
            to: r.module,
            message: `Flow "${flow.name}": the code has no connection between ${prev} and ${r.module}.`,
          });
        }
        prev = r.module;
      } else {
        prev = null;
      }
    }
  }
  return problems;
}
