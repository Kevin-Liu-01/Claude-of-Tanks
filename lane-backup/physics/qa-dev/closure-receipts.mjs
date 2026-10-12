// physics lane scratch: every registered receipt whose static import closure (relative and repo-rooted specifiers,
// plus file URLs in readFileSync(new URL(...)) calls) reaches one of the changed files.
//   node .qa-dev/closure-receipts.mjs <changed-files.txt> > list.txt
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { SELFTEST_SUITES } from '../tools/selftest-suites.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const changed = new Set(readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((f) => path.join(root, f)));
const SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|new\s+URL\(\s*)['"]([^'"]+)['"]/g;
const memo = new Map();
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
function resolve(from, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = spec.startsWith('/') ? path.join(root, spec) : path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts')]) if (isFile(candidate)) return candidate;
  return null;
}
function reaches(file, stack = new Set()) {
  if (memo.has(file)) return memo.get(file);
  if (stack.has(file)) return false;
  stack.add(file);
  let hit = changed.has(file);
  if (!hit && /\.(ts|mjs|js)$/.test(file)) {
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { text = ''; }
    for (const match of text.matchAll(SPEC)) {
      const target = resolve(file, match[1]);
      if (target && reaches(target, stack)) { hit = true; break; }
    }
  }
  stack.delete(file);
  memo.set(file, hit);
  return hit;
}
const files = [...new Set(Object.values(SELFTEST_SUITES).flat())];
const out = files.filter((f) => existsSync(path.join(root, f)) && reaches(path.join(root, f)));
console.error(`${out.length} of ${files.length} receipts reach the ${changed.size} changed files`);
process.stdout.write(out.join('\n') + '\n');
