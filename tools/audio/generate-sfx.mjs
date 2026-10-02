#!/usr/bin/env node
// tools/audio/generate-sfx.mjs — generate (or reuse) every raw take in the
// sound-effect catalog through ElevenLabs. Raw takes land in the durable
// content-addressed cache (see elevenlabs.mjs); nothing is processed or
// written into the repository here — select-sfx.mjs masters and ships them.
//
//   ELEVENLABS_API_KEY_FILE=… node tools/audio/generate-sfx.mjs [--groups weapons,impacts] [--ids a,b] [--dry] [--budget 20000]
//
// --dry prints the plan and its credit estimate without calling the API.
// --budget stops scheduling new takes once the run has billed that many
// credits (the API's own character-cost header is the meter).

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_CATALOG, catalogSeconds } from './sfx-catalog.mjs';
import { soundEffect, CACHE_ROOT, ElevenLabsError } from './elevenlabs.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const groups = opt('groups')?.split(',') ?? null;
const ids = opt('ids')?.split(',') ?? null;
const budget = Number(opt('budget') || Infinity);
const dry = args.includes('--dry');

const entries = SFX_CATALOG.filter((e) => (!groups || groups.includes(e.group)) && (!ids || ids.includes(e.id)));
console.log(`${entries.length} assets, ${entries.reduce((a, e) => a + e.takes, 0)} takes, ~${Math.round(catalogSeconds(entries) * 10)} credits if nothing is cached`);
if (dry) process.exit(0);

let spent = 0;
let stop = false;
const index = {};
await Promise.all(entries.map(async (entry) => {
  const takes = [];
  for (let take = 0; take < entry.takes; take++) {
    if (stop) break;
    try {
      const result = await soundEffect({
        text: entry.prompt, durationS: entry.dur, promptInfluence: entry.inf,
        loop: entry.loop, take, outputFormat: 'pcm_48000',
      });
      spent += result.cost;
      takes.push(result.file);
      if (spent >= budget) stop = true;
    } catch (error) {
      console.warn(`${entry.id} take ${take}: ${error.message}`);
      if (error instanceof ElevenLabsError && error.quota) { stop = true; break; }
    }
  }
  index[entry.id] = takes;
  console.log(`${entry.id.padEnd(34)} ${takes.length}/${entry.takes} takes`);
}));

mkdirSync(CACHE_ROOT, { recursive: true });
const indexFile = join(CACHE_ROOT, 'sfx-index.json');
const merged = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
Object.assign(merged, index);
writeFileSync(indexFile, JSON.stringify(merged, null, 1));
console.log(`billed ${spent} credits this run; take index → ${indexFile}${stop ? ' (stopped early)' : ''}`);
