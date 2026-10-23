/**
 * Builds the architecture graph from the code: files, modules, planes,
 * connections and rule violations. Output is sorted and has no timestamps,
 * so the same code always produces the same graph.json.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { analyzeFile } from './analyze.mjs';
import { CODE_EXT, NATIVE_EXT } from './constants.mjs';
import { matches, globToRegExp } from './glob.mjs';
import { hash, loadCache, saveCache } from './io.mjs';
import { evaluateRules, patternRulesFor } from './rules.mjs';

export const SCHEMA = 1;
const RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const PLATFORM_EXT = ['.ios', '.android', '.native'];
const ASSET_EXT =
  /\.(?:png|jpe?g|gif|webp|svg|riv|lottie|json|mp3|wav|m4a|aac|ogg|caf|midi?|musicxml|xml|ttf|otf|sksl|frag|glsl)$/i;
const INDEX_FILE = /\/index\.[cm]?[jt]sx?$/;

async function walk(root, rel, config, out) {
  let entries;
  try {
    entries = await readdir(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!matches(`${child}/x`, config.exclude)) {
        await walk(root, child, config, out);
      }
    } else if (isSource(entry.name) && !matches(child, config.exclude)) {
      out.push(child);
    }
  }
}

const isSource = name => CODE_EXT.test(name) || NATIVE_EXT.test(name);

export async function collectFiles(root, config) {
  const out = [];
  for (const r of config.roots) {
    const info = await stat(join(root, r)).catch(() => null);
    if (!info) {
      continue;
    }
    if (info.isDirectory()) {
      await walk(root, r, config, out);
    } else if (isSource(r) && !matches(r, config.exclude)) {
      out.push(r);
    }
  }
  return [...new Set(out)].sort();
}

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function makeResolver(root, config, fileSet) {
  const aliases = Object.entries(config.aliases || {});
  return (fromFile, spec) => {
    let base = null;
    if (
      spec.startsWith('./') ||
      spec.startsWith('../') ||
      spec === '.' ||
      spec === '..'
    ) {
      base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
    } else {
      for (const [alias, target] of aliases) {
        if (spec === alias || spec.startsWith(`${alias}/`)) {
          base = posix.normalize(target + spec.slice(alias.length));
          break;
        }
      }
      if (!base) {
        return { external: packageName(spec) };
      }
    }
    if (ASSET_EXT.test(base)) {
      return { asset: base };
    }
    if (fileSet.has(base)) {
      return { files: [base] };
    }
    for (const ext of RESOLVE_EXT) {
      if (fileSet.has(base + ext)) {
        return { files: [base + ext] };
      }
    }
    const variants = [];
    for (const plat of PLATFORM_EXT) {
      for (const ext of RESOLVE_EXT) {
        if (fileSet.has(base + plat + ext)) {
          variants.push(base + plat + ext);
        }
      }
    }
    if (variants.length) {
      return { files: variants };
    }
    for (const ext of RESOLVE_EXT) {
      if (fileSet.has(`${base}/index${ext}`)) {
        return { files: [`${base}/index${ext}`] };
      }
    }
    const onDisk = [base, ...RESOLVE_EXT.map(ext => base + ext)].some(p =>
      existsSync(join(root, p)),
    );
    return onDisk ? { outside: base } : { unresolved: true };
  };
}

function makeModuleMapper(config, files) {
  const moduleDirs = new Set(
    files
      .filter(
        f =>
          INDEX_FILE.test(f) &&
          config.moduleRoots.some(r => f.startsWith(`${r}/`)),
      )
      .map(f => posix.dirname(f)),
  );
  const folderModules = (config.folderModules || []).map(g => globToRegExp(g));
  return file => {
    if (config.entries.includes(file)) {
      return file;
    }
    const top = file.split('/')[0];
    let dir = posix.dirname(file);
    let folderModule = null;
    while (dir !== '.' && dir !== '') {
      if (moduleDirs.has(dir)) {
        return dir;
      }
      if (!folderModule && folderModules.some(re => re.test(dir))) {
        folderModule = dir;
      }
      dir = posix.dirname(dir);
    }
    if (folderModule) {
      return folderModule;
    }
    if (config.platformModules?.[top] !== undefined) {
      return top;
    }
    return file;
  };
}

export function displayName(id) {
  if (!id.startsWith('src/')) {
    return id;
  }
  return id.slice(4).replace(CODE_EXT, '');
}

function planeFor(config, path) {
  return config.planes.find(p => matches(path, p.match)) || null;
}

function kindFor(config, moduleId, isEntry, isPlatform) {
  if (isEntry) {
    return 'entry';
  }
  if (isPlatform) {
    return 'platform';
  }
  const rule = (config.kinds || []).find(k => matches(moduleId, k.match));
  return rule ? rule.kind : 'module';
}

let toolHashCache = null;
async function toolHash(config) {
  if (!toolHashCache) {
    const analyzer = await readFile(
      fileURLToPath(new URL('./analyze.mjs', import.meta.url)),
      'utf8',
    );
    toolHashCache = hash(analyzer + ts.version + SCHEMA);
  }
  return hash(toolHashCache + JSON.stringify(patternRulesFor(config)));
}

function patternHitsFor(config, file, text) {
  const hits = {};
  for (const rule of patternRulesFor(config)) {
    if (!matches(file, rule.files) || matches(file, rule.except)) {
      continue;
    }
    const re = new RegExp(rule.pattern, 'g');
    const lines = [];
    text.split('\n').forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) {
        lines.push(i + 1);
      }
    });
    if (lines.length) {
      hits[rule.id] = lines;
    }
  }
  return hits;
}

/**
 * @param {object} opts
 * @param {string} opts.root  repo root
 * @param {object} opts.config  architecture config
 * @param {Record<string,string>} [opts.overrides]  file → text to use instead of disk (PreToolUse checks)
 * @param {boolean} [opts.useCache]
 */
export async function buildGraph({
  root,
  config,
  overrides = {},
  useCache = true,
}) {
  const files = await collectFiles(root, config);
  for (const file of Object.keys(overrides)) {
    if (
      isSource(file) &&
      !files.includes(file) &&
      !matches(file, config.exclude)
    ) {
      files.push(file);
    }
  }
  files.sort();

  const th = await toolHash(config);
  const cache = useCache
    ? await loadCache(root, th)
    : { toolHash: th, entries: {} };
  const nextEntries = {};
  const analyses = new Map();
  const patternHits = new Map();
  for (const file of files) {
    if (file in overrides) {
      const text = overrides[file];
      analyses.set(file, analyzeFile(file, text));
      patternHits.set(file, patternHitsFor(config, file, text));
      continue;
    }
    const info = await stat(join(root, file));
    const cached = cache.entries[file];
    if (
      cached &&
      cached.mtimeMs === info.mtimeMs &&
      cached.size === info.size
    ) {
      nextEntries[file] = cached;
    } else {
      const text = await readFile(join(root, file), 'utf8');
      nextEntries[file] = {
        mtimeMs: info.mtimeMs,
        size: info.size,
        analysis: analyzeFile(file, text),
        hits: patternHitsFor(config, file, text),
      };
    }
    analyses.set(file, nextEntries[file].analysis);
    patternHits.set(file, nextEntries[file].hits);
  }
  // Builds with overrides describe a hypothetical edit, so they never update the cache.
  if (useCache && Object.keys(overrides).length === 0) {
    await saveCache(root, { toolHash: th, entries: nextEntries });
  }

  const fileSet = new Set(files);
  const resolve = makeResolver(root, config, fileSet);
  const moduleOf = makeModuleMapper(config, files);

  // Files. Thread: header tag, then barrel → any, then config.threads, then
  // React component or hook → js, then the plane default.
  const configThread = file =>
    (config.threads || []).find(
      t => matches(file, t.match) && !matches(file, t.except),
    )?.thread;
  const autoThread = (file, a) => {
    if (a.lang !== 'code') {
      return null;
    }
    if (a.isBarrel) {
      return 'any';
    }
    return file.endsWith('.tsx') || a.exportsHooks ? 'js' : null;
  };
  const threadOf = (file, a, plane) =>
    a.thread ||
    (a.isBarrel ? 'any' : null) ||
    configThread(file) ||
    autoThread(file, a) ||
    plane?.thread ||
    'js';
  const fileNodes = new Map();
  for (const file of files) {
    const a = analyses.get(file);
    const plane = planeFor(config, file);
    const node = {
      id: file,
      module: moduleOf(file),
      plane: plane ? plane.id : null,
      thread: threadOf(file, a, plane),
      lang: a.lang,
    };
    if (a.isBarrel) {
      node.barrel = true;
    }
    if (a.purpose) {
      node.purpose = a.purpose;
    }
    if (a.exports?.length) {
      node.exports = a.exports;
    }
    if (a.hasWorklets) {
      node.hasWorklets = true;
    }
    if (a.moduleNames?.length) {
      node.nativeModules = a.moduleNames;
    }
    fileNodes.set(file, node);
  }

  // Edges
  const edgeMap = new Map();
  const edgeLines = new Map();
  const edgeNames = new Map();
  const assets = new Set();
  const unresolved = [];
  const packagesByFile = new Map();
  const addEdge = (from, to, kind, extra = {}, line) => {
    const key = `${from}\u0000${to}\u0000${kind}`;
    const prev = edgeMap.get(key);
    if (prev) {
      if (prev.typeOnly && !extra.typeOnly) {
        delete prev.typeOnly;
      }
      if (prev.dynamic && !extra.dynamic) {
        delete prev.dynamic;
      }
      return;
    }
    const edge = { from, to, kind };
    if (extra.typeOnly) {
      edge.typeOnly = true;
    }
    if (extra.dynamic) {
      edge.dynamic = true;
    }
    if (extra.approx) {
      edge.approx = true;
    }
    edgeMap.set(key, edge);
    if (line && !edgeLines.has(`${from}\u0000${to}`)) {
      edgeLines.set(`${from}\u0000${to}`, line);
    }
  };

  const nativeByModuleName = new Map();
  const nativeByClass = new Map();
  for (const [file, a] of analyses) {
    if (a.lang === 'code') {
      continue;
    }
    for (const name of a.moduleNames || []) {
      if (!nativeByModuleName.has(name)) {
        nativeByModuleName.set(name, []);
      }
      nativeByModuleName.get(name).push(file);
    }
    if (a.pkg) {
      const cls = posix.basename(file).replace(/\.\w+$/, '');
      nativeByClass.set(`${a.pkg}.${cls}`, file);
    }
  }

  for (const [file, a] of analyses) {
    if (a.lang === 'code') {
      const localByName = new Map();
      for (const imp of a.imports) {
        const r = resolve(file, imp.spec);
        if (r.files) {
          for (const to of r.files) {
            if (to === file) {
              continue;
            }
            addEdge(
              file,
              to,
              'imports',
              { typeOnly: imp.typeOnly, dynamic: imp.kind === 'dynamic' },
              imp.line,
            );
            const nameKey = `${file}\u0000${to}`;
            if (!edgeNames.has(nameKey)) {
              edgeNames.set(nameKey, new Set());
            }
            for (const n of imp.imported || []) {
              edgeNames.get(nameKey).add(n);
            }
            for (const name of imp.names) {
              if (!localByName.has(name)) {
                localByName.set(name, []);
              }
              localByName.get(name).push(to);
            }
          }
        } else if (r.asset) {
          assets.add(r.asset);
          addEdge(file, r.asset, 'uses-asset');
        } else if (r.external) {
          if (!packagesByFile.has(file)) {
            packagesByFile.set(file, new Set());
          }
          packagesByFile.get(file).add(r.external);
        } else if (r.unresolved) {
          unresolved.push({ file, spec: imp.spec });
        }
      }
      for (const tag of a.jsxTags) {
        for (const to of localByName.get(tag) || []) {
          addEdge(file, to, 'renders');
        }
      }
      for (const name of [...a.nativeSpecs, ...a.nativeUses]) {
        for (const to of nativeByModuleName.get(name) || []) {
          addEdge(file, to, 'calls-native', { approx: true });
        }
      }
    } else {
      // #include "x.h": a path relative to the file first, then any native file whose path
      // ends with it (header search paths), preferring the same top-level folder.
      const top = file.split('/')[0];
      for (const inc of a.includes || []) {
        const relativePath = posix.normalize(
          posix.join(posix.dirname(file), inc),
        );
        if (fileSet.has(relativePath) && relativePath !== file) {
          addEdge(file, relativePath, 'imports', { approx: true });
          continue;
        }
        const bySuffix = files.filter(
          other =>
            other !== file && (other === inc || other.endsWith(`/${inc}`)),
        );
        const sameTop = bySuffix.filter(other => other.split('/')[0] === top);
        for (const other of sameTop.length ? sameTop : bySuffix) {
          addEdge(file, other, 'imports', { approx: true });
        }
      }
      for (const imp of a.imports || []) {
        const to = nativeByClass.get(imp);
        if (to && to !== file) {
          addEdge(file, to, 'imports', { approx: true });
        }
      }
    }
  }

  // JS-only exports (hooks, components), followed through re-exports so a barrel
  // that re-exports a hook counts as exporting it.
  const jsOnly = new Map();
  const resolving = new Set();
  const jsOnlyOf = file => {
    if (jsOnly.has(file)) {
      return jsOnly.get(file);
    }
    const a = analyses.get(file);
    if (!a || a.lang !== 'code') {
      return new Set();
    }
    if (resolving.has(file)) {
      return new Set(a.jsOnlyExports || []);
    }
    resolving.add(file);
    const out = new Set(a.jsOnlyExports || []);
    for (const re of a.reexports || []) {
      for (const target of resolve(file, re.spec).files || []) {
        const theirs = jsOnlyOf(target);
        if (re.star) {
          theirs.forEach(n => out.add(n));
        }
        for (const { name, from } of re.names) {
          if (theirs.has(from)) {
            out.add(name);
          }
        }
      }
    }
    resolving.delete(file);
    jsOnly.set(file, out);
    return out;
  };
  for (const file of files) {
    const names = [...jsOnlyOf(file)].sort();
    if (names.length) {
      fileNodes.get(file).jsOnly = names;
    }
  }

  // Modules
  const modules = new Map();
  for (const file of files) {
    const node = fileNodes.get(file);
    const id = node.module;
    if (!modules.has(id)) {
      const isEntry = config.entries.includes(id);
      const isPlatform = config.platformModules?.[id] !== undefined;
      modules.set(id, {
        id,
        name: displayName(id),
        kind: kindFor(config, id, isEntry, isPlatform),
        plane: null,
        thread: null,
        purpose: null,
        entry: null,
        files: [],
        packages: new Set(),
        assets: new Set(),
        hasWorklets: false,
      });
    }
    const mod = modules.get(id);
    mod.files.push(file);
    const isEntryCandidate =
      file === id || (INDEX_FILE.test(file) && posix.dirname(file) === id);
    if (
      isEntryCandidate &&
      (!mod.entry || (!/\.tsx?$/.test(mod.entry) && /\.tsx?$/.test(file)))
    ) {
      mod.entry = file;
    }
    for (const p of packagesByFile.get(file) || []) {
      mod.packages.add(p);
    }
    if (node.hasWorklets) {
      mod.hasWorklets = true;
    }
  }
  for (const edge of edgeMap.values()) {
    if (edge.kind === 'uses-asset') {
      modules.get(fileNodes.get(edge.from).module)?.assets.add(edge.to);
    }
  }
  const platformPurposes = config.platformModules || {};
  for (const mod of modules.values()) {
    const anchor = mod.entry || mod.files[0];
    const anchorNode = fileNodes.get(anchor);
    const plane = planeFor(config, anchor);
    mod.plane = plane ? plane.id : null;
    // A module whose entry is a barrel shows its plane's thread when any of its files run
    // there (its React host component doesn't change what the module is); otherwise the
    // thread most of its files run on.
    if (anchorNode?.barrel) {
      const counts = new Map();
      for (const f of mod.files) {
        const t = fileNodes.get(f).thread;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
      const [top] = [...counts.entries()].sort(
        (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
      );
      mod.thread = counts.has(plane?.thread)
        ? plane.thread
        : top
        ? top[0]
        : 'js';
    } else {
      mod.thread = anchorNode?.thread || plane?.thread || 'js';
    }
    mod.purpose =
      (mod.entry && fileNodes.get(mod.entry)?.purpose) ||
      mod.files.map(f => fileNodes.get(f).purpose).find(Boolean) ||
      platformPurposes[mod.id] ||
      null;
  }

  // Module edges
  const moduleEdgeMap = new Map();
  for (const edge of edgeMap.values()) {
    if (!fileNodes.has(edge.to)) {
      continue;
    }
    const from = fileNodes.get(edge.from).module;
    const to = fileNodes.get(edge.to).module;
    if (from === to) {
      continue;
    }
    const key = `${from}\u0000${to}`;
    if (!moduleEdgeMap.has(key)) {
      moduleEdgeMap.set(key, { from, to, kinds: new Set() });
    }
    moduleEdgeMap.get(key).kinds.add(edge.kind);
  }

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byEdge = (a, b) =>
    a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to) ||
    (a.kind || '').localeCompare(b.kind || '');

  const moduleList = [...modules.values()].sort(byId).map(m => {
    const out = {
      id: m.id,
      name: m.name,
      kind: m.kind,
      plane: m.plane,
      thread: m.thread,
      purpose: m.purpose,
      entry: m.entry,
      files: m.files.sort(),
    };
    if (m.packages.size) {
      out.packages = [...m.packages].sort();
    }
    if (m.assets.size) {
      out.assets = [...m.assets].sort();
    }
    if (m.hasWorklets) {
      out.hasWorklets = true;
    }
    return out;
  });

  const graph = {
    schema: SCHEMA,
    generator: 'scripts/architecture/build.mjs',
    planes: config.planes.map(p => ({
      id: p.id,
      label: p.label,
      thread: p.thread,
      description: p.description,
      modules: moduleList.filter(m => m.plane === p.id).map(m => m.id),
    })),
    modules: moduleList,
    files: [...fileNodes.values()].sort(byId),
    assets: [...assets].sort(),
    edges: [...edgeMap.values()].sort(byEdge),
    moduleEdges: [...moduleEdgeMap.values()]
      .map(e => ({ from: e.from, to: e.to, kinds: [...e.kinds].sort() }))
      .sort(byEdge),
    unresolved: unresolved.sort(
      (a, b) => a.file.localeCompare(b.file) || a.spec.localeCompare(b.spec),
    ),
    rules: (config.rules || []).map(r => ({
      id: r.id,
      type: r.type,
      description: r.description,
    })),
    violations: [],
  };
  graph.violations = evaluateRules(graph, config, {
    patternHits,
    edgeLines,
    edgeNames,
  });
  return graph;
}

export function serializeGraph(graph) {
  return `${JSON.stringify(graph, null, 2)}\n`;
}
