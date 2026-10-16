/**
 * Minimal glob matching for repo-relative POSIX paths.
 * Supports `**`, `*`, `?`, `{a,b}` and `[...]` classes.
 */

const cache = new Map();

function translate(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        i++;
        if (atSegmentStart && glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        continue;
      }
      const parts = glob.slice(i + 1, end).split(',').map(translate);
      re += `(?:${parts.join('|')})`;
      i = end;
    } else if (c === '[') {
      const end = glob.indexOf(']', i);
      if (end === -1) {
        re += '\\[';
        continue;
      }
      re += glob.slice(i, end + 1);
      i = end;
    } else {
      re += c.replace(/[.+^$()|\\]/g, '\\$&');
    }
  }
  return re;
}

export function globToRegExp(glob) {
  let re = cache.get(glob);
  if (!re) {
    re = new RegExp(`^${translate(glob)}$`);
    cache.set(glob, re);
  }
  return re;
}

export function matches(path, globs) {
  if (!globs) {
    return false;
  }
  const list = Array.isArray(globs) ? globs : [globs];
  return list.some(g => globToRegExp(g).test(path));
}
