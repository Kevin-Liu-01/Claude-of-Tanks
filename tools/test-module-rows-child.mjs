// Child of tools/test-diff.mjs changedTankIds: the ids whose rows each changed module table moved (tools/changed-only/
// steps.mjs TABLES kind 'module'). First-party tooling: Kevin B. Liu.
//
//   node tools/test-module-rows-child.mjs < { root, mergeBase, head, files: { path: [exportName] } }
//     -> { path: [id] | null } on stdout
//
// Each side's text (the merge base's from Git; the head's from Git, or the working tree when head is HEAD) is imported
// with its types stripped and its relative imports bound to `root`: a codec such as auxiliaryRoofGunsCodec.ts is the
// tree's own, and a change to it is a changed path of its own. A row is the JSON of one id's entry, as the changed-only
// rows child reads it (insertion order). A side that cannot be read, or an export that is not a table, is null: every
// id the file holds.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { root, mergeBase, head, files } = JSON.parse(readFileSync(0, 'utf8'));
const textAt = (ref, path) => (ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 })
  : readFileSync(join(root, path), 'utf8'));
const RELATIVE = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;

async function tablesAt(ref, path, exportNames) {
  const source = stripTypeScriptTypes(textAt(ref, path)).replace(RELATIVE,
    (_, lead, quote, specifier) => `${lead}${quote}${pathToFileURL(resolve(root, dirname(path), specifier)).href}${quote}`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return exportNames.map((name) => {
    if (!module[name] || typeof module[name] !== 'object') throw new Error(`${path}: no ${name}`);
    return module[name];
  });
}

const out = {};
for (const [path, exportNames] of Object.entries(files)) {
  try {
    const before = await tablesAt(mergeBase, path, exportNames), after = await tablesAt(head === 'HEAD' ? null : head, path, exportNames);
    const ids = new Set();
    before.forEach((was, index) => {
      const now = after[index];
      for (const id of new Set([...Object.keys(was), ...Object.keys(now)])) if (JSON.stringify(was[id]) !== JSON.stringify(now[id])) ids.add(id);
    });
    out[path] = [...ids].sort();
  } catch {
    out[path] = null;
  }
}
process.stdout.write(JSON.stringify(out));
