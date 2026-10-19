#!/usr/bin/env node
// Round 6 of the versus stills (the owner, 2026-10-15 17:45: "i like your other versus too, just make them unique scenes
// instead of plaigarizing. currently love the sepv3 and challenger and merkava and k2 the most, but experiment all with
// new scenes ... these will be our opengraph foundations and for marketing"). Each new scene is its own module in
// v6/<id>.mjs: it imports what it needs from versus.mjs and adds itself to SCENES (SCENES[id] = () => scene), so
// several authors work at once without touching one file. This runs versus.mjs's own command line over every scene,
// round 6's included:
//   node tools/media-r5/versus/versus6.mjs scenes|check|final|jobs ...   (from the repository root)
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cli } from './versus.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'v6');
// one author's broken module never stops the others' checks: it is named and skipped
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.mjs')).sort()) {
  try { await import(pathToFileURL(join(DIR, f)).href); } catch (e) { console.error(`[versus6] skipped v6/${f}: ${String(e?.message ?? e).split('\n')[0]}`); }
}
cli(process.argv.slice(2));
