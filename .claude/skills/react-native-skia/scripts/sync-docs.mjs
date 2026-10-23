#!/usr/bin/env node
/**
 * Rebuilds this skill's references/ folder from the official react-native-skia
 * docs (apps/docs in github.com/wcandillon/react-native-skia) at a release tag,
 * and rewrites the docs index between the markers in SKILL.md.
 *
 *   node .claude/skills/react-native-skia/scripts/sync-docs.mjs --tag v3.5.0
 *   node .claude/skills/react-native-skia/scripts/sync-docs.mjs --tag v3.5.0 --from <dir>
 *
 * Use the tag of the installed version (package.json). --from reads a local
 * copy instead of downloading: <dir>/docs/**, <dir>/sidebars.js and
 * <dir>/LICENSE.md. The docs are read as text; nothing in them is executed.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'wcandillon/react-native-skia';
const SITE = 'https://wcandillon.github.io/react-native-skia/docs';
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REFS_DIR = join(SKILL_DIR, 'references');
const SKILL_FILE = join(SKILL_DIR, 'SKILL.md');
const INDEX_START = '<!-- docs-index:start -->';
const INDEX_END = '<!-- docs-index:end -->';

const args = parseArgs(process.argv.slice(2));
if (!args.tag) {
  console.error(
    'Usage: sync-docs.mjs --tag vX.Y.Z [--from <dir>] [--sha <commit>]',
  );
  process.exit(1);
}

const sourceDir = args.from ?? (await download(args.tag));
const sha = args.sha ?? (await resolveCommit(args.tag));
const rawBase = `https://raw.githubusercontent.com/${REPO}/${args.tag}/apps/docs`;

const docs = readDocs(join(sourceDir, 'docs'));
const bySlug = new Map(docs.map(doc => [doc.slug, doc]));
const byId = new Map(docs.map(doc => [doc.id, doc]));
const sidebar = parseSidebar(
  readFileSync(join(sourceDir, 'sidebars.js'), 'utf8'),
);

rmSync(REFS_DIR, { recursive: true, force: true });
for (const doc of docs) {
  const target = join(REFS_DIR, doc.outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, render(doc));
}
writeFileSync(
  join(SKILL_DIR, 'LICENSE.md'),
  readFileSync(join(sourceDir, 'LICENSE.md'), 'utf8'),
);
updateIndex();
console.log(
  `react-native-skia skill: ${docs.length} pages from ${args.tag}` +
    (sha ? ` (${sha.slice(0, 10)})` : ''),
);

function parseArgs(list) {
  const parsed = {};
  for (let i = 0; i < list.length; i += 2) {
    parsed[list[i].replace(/^--/, '')] = list[i + 1];
  }
  return parsed;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

async function saveText(url, file) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await response.text());
}

async function download(tag) {
  const dir = mkdtempSync(join(tmpdir(), 'skia-docs-'));
  const tree = await getJson(
    `https://api.github.com/repos/${REPO}/git/trees/${tag}?recursive=1`,
  );
  if (tree.truncated) {
    throw new Error('GitHub cut the file list short; retry or use --from.');
  }
  const prefix = 'apps/docs/docs/';
  const pages = tree.tree.filter(
    entry =>
      entry.type === 'blob' &&
      entry.path.startsWith(prefix) &&
      /\.mdx?$/.test(entry.path),
  );
  const raw = path =>
    `https://raw.githubusercontent.com/${REPO}/${tag}/${path}`;
  for (const page of pages) {
    await saveText(
      raw(page.path),
      join(dir, 'docs', page.path.slice(prefix.length)),
    );
  }
  await saveText(raw('apps/docs/sidebars.js'), join(dir, 'sidebars.js'));
  await saveText(raw('LICENSE.md'), join(dir, 'LICENSE.md'));
  return dir;
}

async function resolveCommit(tag) {
  try {
    return (
      await getJson(`https://api.github.com/repos/${REPO}/commits/${tag}`)
    ).sha;
  } catch {
    return undefined;
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) {
    return { meta: {}, body: text };
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^(\w+):\s*(.*)$/.exec(line);
    if (pair) {
      meta[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

/** Every page, with the id the sidebar uses and the slug of its URL. */
function readDocs(root) {
  return walk(root)
    .filter(file => /\.mdx?$/.test(file))
    .map(file => {
      const path = relative(root, file).split(sep).join('/');
      const { meta, body } = splitFrontmatter(readFileSync(file, 'utf8'));
      const dir = posix.dirname(path);
      const name = meta.id ?? posix.basename(path).replace(/\.mdx?$/, '');
      const id = dir === '.' ? name : `${dir}/${name}`;
      return {
        path,
        dir,
        id,
        slug: (meta.slug ?? `/${id}`).replace(/\/$/, ''),
        title: meta.title ?? name,
        body,
        outPath: path.replace(/\.mdx$/, '.md'),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The top-level entries of `tutorialSidebar`, read as text: categories
 * ({ label, items: [...] }) and single pages ({ label, id }).
 */
function parseSidebar(text) {
  const start = text.indexOf('[', text.indexOf('tutorialSidebar'));
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error('Could not find tutorialSidebar in sidebars.js');
  }
  const body = text.slice(start + 1, end);
  const entries = [];
  let depth = 0;
  let from = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') {
      if (depth === 0) {
        from = i;
      }
      depth += 1;
    } else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        entries.push(body.slice(from, i + 1));
      }
    }
  }
  return entries.map(source => {
    const field = name =>
      new RegExp(`${name}:\\s*["']([^"']+)["']`).exec(source)?.[1];
    const items = /items:\s*\[([\s\S]*?)\]/.exec(source);
    const ids = items
      ? [...items[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1])
      : [field('id')];
    return { label: field('label'), ids };
  });
}

function assetUrl(src, doc) {
  if (/^https?:/.test(src)) {
    return src;
  }
  if (src.startsWith('/static/')) {
    return `${rawBase}${src}`;
  }
  if (src.startsWith('/img/')) {
    return `${rawBase}/static${src}`;
  }
  return `${rawBase}/docs/${posix.normalize(posix.join(doc.dir, src))}`;
}

/** `<img src={require("…").default} />` tags become Markdown images. */
function rewriteImages(line, doc) {
  return line.replace(/<img\s([^>]*?)\/?>/g, (tag, attributes) => {
    const src =
      /src=\{require\(["']([^"']+)["']\)(?:\.default)?\}/.exec(
        attributes,
      )?.[1] ?? /src=["']([^"']+)["']/.exec(attributes)?.[1];
    if (!src) {
      return tag;
    }
    const alt =
      /alt=["']([^"']*)["']/.exec(attributes)?.[1] ?? posix.basename(src);
    return `![${alt}](${assetUrl(src, doc)})`;
  });
}

/** Links to other docs pages point to their reference files; images to GitHub. */
function rewriteLinks(line, doc) {
  return line.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
    (whole, bang, text, url, title) => {
      if (/^(https?:|mailto:|#)/.test(url)) {
        return whole;
      }
      if (bang) {
        return `![${text}](${assetUrl(url, doc)}${title})`;
      }
      if (url.startsWith('/docs/')) {
        const [path, anchor] = url.slice('/docs'.length).split('#');
        const target = bySlug.get(path.replace(/\/$/, ''));
        const hash = anchor ? `#${anchor}` : '';
        if (!target) {
          return `[${text}](${SITE}${path}${hash})`;
        }
        const link =
          posix.relative(posix.dirname(doc.outPath), target.outPath) ||
          posix.basename(target.outPath);
        return `[${text}](${link}${hash})`;
      }
      if (/\.(png|jpe?g|gif|svg|webp|mp4)$/i.test(url)) {
        return `[${text}](${assetUrl(url, doc)})`;
      }
      return whole;
    },
  );
}

/** A page with a provenance line; code blocks are copied unchanged. */
function render(doc) {
  const lines = [];
  let inFence = false;
  for (const line of doc.body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      lines.push(line);
    } else if (inFence) {
      lines.push(line);
    } else if (!/^import\s.+\sfrom\s+['"][^'"]+['"];?\s*$/.test(line)) {
      lines.push(rewriteLinks(rewriteImages(line, doc), doc));
    }
  }
  const body = lines.join('\n').trim();
  const licence = posix.relative(
    posix.dirname(`references/${doc.outPath}`),
    'LICENSE.md',
  );
  const header = [
    `# ${doc.title}`,
    '',
    `> react-native-skia **${args.tag}** docs · [online](${SITE}${doc.slug}) · ` +
      `source \`apps/docs/docs/${doc.path}\` · MIT licence, see [LICENSE.md](${licence})`,
  ];
  return `${header.join('\n')}\n\n${body}\n`;
}

/** The `##` headings of a page, outside code blocks. */
function headings(body) {
  const found = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        found.push(heading[1].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));
      }
    }
  }
  return found;
}

function row(doc) {
  const sections = headings(doc.body).join(' · ') || '-';
  return `| [${doc.title}](references/${doc.outPath}) | ${sections.replace(
    /\|/g,
    '\\|',
  )} |`;
}

function updateIndex() {
  const listed = new Set();
  const out = [
    INDEX_START,
    '',
    `Generated by \`scripts/sync-docs.mjs\` from the react-native-skia **${args.tag}** docs` +
      (sha ? ` (commit \`${sha.slice(0, 10)}\`)` : '') +
      `: ${docs.length} pages, in the order of the docs sidebar. ` +
      'Sections are the `##` headings of each page.',
    '',
  ];
  for (const entry of sidebar) {
    out.push(`### ${entry.label}`, '', '| Page | Sections |', '|:--|:--|');
    for (const id of entry.ids) {
      const doc = byId.get(id);
      if (!doc) {
        throw new Error(`sidebars.js lists "${id}", but no page has that id`);
      }
      listed.add(doc);
      out.push(row(doc));
    }
    out.push('');
  }
  const unlisted = docs.filter(doc => !listed.has(doc));
  if (unlisted.length > 0) {
    out.push(
      '### Not in the docs sidebar',
      '',
      'These pages are in the docs folder, but the sidebar of the docs site does not link to them.',
      '',
      '| Page | Sections |',
      '|:--|:--|',
      ...unlisted.map(row),
      '',
    );
  }
  out.push(INDEX_END);

  const skill = readFileSync(SKILL_FILE, 'utf8');
  const start = skill.indexOf(INDEX_START);
  const end = skill.indexOf(INDEX_END);
  if (start < 0 || end < start) {
    throw new Error(`SKILL.md is missing the ${INDEX_START} markers`);
  }
  writeFileSync(
    SKILL_FILE,
    skill.slice(0, start) +
      out.join('\n') +
      skill.slice(end + INDEX_END.length),
  );
}
