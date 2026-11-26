#!/usr/bin/env node
// (274) Re-key release/fingerprints.tsv from 273's keys to 274's without a regen (fingerprint.mjs rekeyManifest): run once
// on the merged tree, before anything else moves; every (step, id) and (step, map) current under 273's keys takes its
// 274 key, the rest stay due for the chain. Then `npm run tank:regen:changed` runs what is left: on the 274 merge, centering
// and icons on every id (their page's i18n.ts moved: localePrefix.ts) and nothing else; the gate stays as main left it.
// Reads the rows once (about a minute of CPU), builds nothing. Delete this tool and KEYS_273 once main's table is
// re-keyed. First-party tooling: Kevin B. Liu.
// (279) --from=274 (the default now): from 274's keys to these, which also mask the marked shader regions
// (shader-text.mjs) and FIELD_DUST_GLSL. On the 279 merge only the GPU steps (centering, icons) stay due, on every id:
// the region markers moved materials.ts's bytes, which their page compiles. --from=273 is 274's re-key.
//
// --base=<rev> (279): the table was recorded at <rev>, and a file steps.mjs SHADER_TEXT declares moved since then only in
// its comments (the region markers, token for token the same code): the old keys are taken on <rev>'s copy of it, so the
// table is current under them. A declared file whose code moved refuses: re-key before that edit, or let the chain run.
//
//   node tools/changed-only/rekey.mjs [--root=<tree>] [--from=274|273] [--base=<rev>] [--dry-run]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGraph } from './graph.mjs';
import { sameTokens } from './shader-text.mjs';
import { SHADER_TEXT, STEPS } from './steps.mjs';
import { computeState, KEYS_273, KEYS_274, readManifest, readRows, rekeyManifest, toolchainOf, writeManifest } from './fingerprint.mjs';

const args = process.argv.slice(2);
const root = resolve(args.find((arg) => arg.startsWith('--root='))?.slice(7) ?? process.cwd());
const FROM = { 273: KEYS_273, 274: KEYS_274 };
const from = args.find((arg) => arg.startsWith('--from='))?.slice(7) ?? '274';
if (!FROM[from]) { console.error(`[rekey] --from=${from}: one of ${Object.keys(FROM).join(', ')}`); process.exit(2); }
const manifest = readManifest(root);
if (!manifest) { console.error('[rekey] no release/fingerprints.tsv here'); process.exit(2); }
if (manifest.toolchain !== toolchainOf(root).toolchain) {
  console.error('[rekey] the table was recorded on another toolchain: re-key on the table\'s (nvm use), where its keys can be current');
  process.exit(2);
}
const base = args.find((arg) => arg.startsWith('--base='))?.slice(7);
const overlay = {};
if (base) for (const file of Object.keys(SHADER_TEXT)) {
  const then = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const now = readFileSync(resolve(root, file), 'utf8');
  if (then === now) continue;
  if (!sameTokens(then, now, file)) { console.error(`[rekey] ${file}: its code moved since ${base}, not only its comments`); process.exit(2); }
  overlay[file] = then;
  console.log(`[rekey] ${file}: the old keys take ${base}'s copy (only its comments moved)`);
}
const rows = readRows(root, process.env);
const before = computeState({ root, rows, config: FROM[from], ...(Object.keys(overlay).length ? { graph: createGraph({ root, overlay }) } : {}) });
const after = computeState({ root, rows });
// the GPU steps key the overlaid files' bytes (their page compiles them): never carried over an older copy
const leave = new Set(Object.keys(overlay).length ? STEPS.filter((step) => step.device === 'gpu').map((step) => step.name) : []);
const report = rekeyManifest(manifest, before, after, { leave });
for (const [name, { carried, left }] of Object.entries(report)) console.log(`[rekey] ${name}: ${carried} carried, ${left} left due`);
if (args.includes('--dry-run')) console.log('[rekey] dry run: nothing written');
else { writeManifest(root, manifest); console.log('[rekey] release/fingerprints.tsv re-keyed; run npm run tank:regen:changed for what is left'); }
