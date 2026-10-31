// Minimal glob expansion for the changed-only step table: `dir/*.ext` (one level), `dir/**` (everything below) and
// plain paths. Sorted repository-relative paths of the files that exist. First-party tooling: Kevin B. Liu.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', '.vercel', '.qa-dev', '.qa-map-environment']);
const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };

function toRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { out += '.*'; i++; }
    else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * Whether a file's declaration (steps.mjs DECLARED_DYNAMIC) takes the edge to `path` out of a step's key: `covered` and
 * `modeOnly` name exact paths, `namesOnly` globs (`*.html`) the paths the file only names and never reads.
 */
export function declaredNotInput(declaration, path) {
  if (!declaration) return false;
  if ([...(declaration.covered ?? []), ...(declaration.modeOnly ?? [])].includes(path)) return true;
  return (declaration.namesOnly ?? []).some((pattern) => toRegExp(pattern).test(path));
}

function walk(base, dir, out) {
  let entries;
  try { entries = readdirSync(join(base, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(base, rel, out);
    else if (entry.isFile() || (entry.isSymbolicLink() && isFile(join(base, rel)))) out.push(rel);
  }
}

export function expandGlobs(base, patterns, { exclude = [] } = {}) {
  const excluded = exclude.map(toRegExp);
  const out = new Set();
  for (const pattern of patterns) {
    if (!pattern.includes('*')) { if (isFile(join(base, pattern))) out.add(pattern); continue; }
    const fixed = pattern.slice(0, pattern.indexOf('*'));
    const dir = fixed.includes('/') ? fixed.slice(0, fixed.lastIndexOf('/')) : '';
    const re = toRegExp(pattern), files = [];
    walk(base, dir, files);
    for (const file of files) if (re.test(file)) out.add(file);
  }
  return [...out].filter((file) => !excluded.some((re) => re.test(file))).sort();
}
