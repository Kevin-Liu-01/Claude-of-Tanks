#!/usr/bin/env node
// Unused-export scan (owner ruling 2026-09-14: clean up the codebase). Lists every `export`ed
// declaration in src/, tools/, server/ and scripts/ whose name no other file mentions — imports,
// JSDoc, HTML module scripts and receipts all count as a mention, so a listed symbol is safe to
// un-export (or delete when its own file does not use it either: `self 1`). Files that receipts
// hash by source (vehicle profiles, terrain, sky, impact decals, the authority, match placement)
// must keep their text; check the hash receipts before touching them.
//   node tools/unused-exports.mjs            # one line per symbol: <file>  <name>  (self <uses in own file>)
//   node tools/unused-exports.mjs --json     # machine-readable
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const files = [];
const walk = (dir, accept, skip = /node_modules|\.git|\/dist\b|\.qa-/) => {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) { if (!skip.test(path)) walk(path, accept, skip); } else if (accept.test(name)) files.push(path);
  }
};
walk(join(root, 'src'), /\.(ts|mjs|js|html)$/, /node_modules|\.git|\/dist\b|\.qa-|\/docs\b/);
walk(join(root, 'tools'), /\.(ts|mjs|js|html)$/);
walk(join(root, 'server'), /\.(ts|mjs|js)$/);
walk(join(root, 'scripts'), /\.(ts|mjs|js)$/);
walk(join(root, 'public'), /\.html$/);
for (const single of ['index.html', 'vite.config.ts', 'middleware.ts']) {
  try { statSync(join(root, single)); files.push(join(root, single)); } catch { /* absent in this checkout */ }
}

const text = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
const exportRe = /^export\s+(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const results = [];
for (const [file, source] of text) {
  if (/selftest|test-support|\.generated\./.test(file)) continue;
  let match;
  while ((match = exportRe.exec(source))) {
    const name = match[1];
    const mention = new RegExp(`\\b${name}\\b`);
    let used = false;
    for (const [other, otherSource] of text) {
      if (other === file) continue;
      if (mention.test(otherSource)) { used = true; break; }
    }
    if (used) continue;
    const selfUses = (source.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    results.push({ file: relative(root, file), name, selfUses });
  }
}
results.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, unusedExports: results.length, results }, null, 1));
} else {
  console.log(JSON.stringify({ files: files.length, unusedExports: results.length }));
  for (const row of results) console.log(`${row.file}  ${row.name}  (self ${row.selfUses})`);
}
