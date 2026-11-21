#!/usr/bin/env node
// (274) Re-key release/fingerprints.tsv from 273's keys to 274's without a regen (fingerprint.mjs rekeyManifest): run once
// on the merged tree, before anything else moves; every (step, id) and (step, map) current under 273's keys takes its
// 274 key, the rest stay due for the chain. Then `npm run tank:regen:changed` runs what is left: on the 274 merge, centering
// and icons on every id (their page's i18n.ts moved: localePrefix.ts) and nothing else; the gate stays as main left it.
// Reads the rows once (about a minute of CPU), builds nothing. Delete this tool and KEYS_273 once main's table is
// re-keyed. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/rekey.mjs [--root=<tree>] [--dry-run]
import { resolve } from 'node:path';
import { computeState, KEYS_273, readManifest, readRows, rekeyManifest, toolchainOf, writeManifest } from './fingerprint.mjs';

const args = process.argv.slice(2);
const root = resolve(args.find((arg) => arg.startsWith('--root='))?.slice(7) ?? process.cwd());
const manifest = readManifest(root);
if (!manifest) { console.error('[rekey] no release/fingerprints.tsv here'); process.exit(2); }
if (manifest.toolchain !== toolchainOf(root).toolchain) {
  console.error('[rekey] the table was recorded on another toolchain: re-key on the table\'s (nvm use), where its keys can be current');
  process.exit(2);
}
const rows = readRows(root, process.env);
const before = computeState({ root, rows, config: KEYS_273 });
const after = computeState({ root, rows });
const report = rekeyManifest(manifest, before, after);
for (const [name, { carried, left }] of Object.entries(report)) console.log(`[rekey] ${name}: ${carried} carried, ${left} left due`);
if (args.includes('--dry-run')) console.log('[rekey] dry run: nothing written');
else { writeManifest(root, manifest); console.log('[rekey] release/fingerprints.tsv re-keyed; run npm run tank:regen:changed for what is left'); }
