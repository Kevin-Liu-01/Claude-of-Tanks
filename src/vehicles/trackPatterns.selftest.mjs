import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./profiles/t72TrackFinish.selftest.mjs');
await import('./tankFactory.js');
const { ALL_TANK_IDS, TANK_SPECS } = await import('./specs.js');
const {
  TRACK_PATTERN_DEFINITIONS, TRACK_PATTERN_IDS, trackPatternFor,
} = await import('./trackPatterns.ts');

const expected = new Map([
  ['tiger1', 'interleaved-cleat'],
  ['kv2', 'early-cast-steel'],
  ['t90m', 'soviet-single-pin'],
  ['m1a2', 'nato-double-pin'],
  ['merkava4b', 'merkava-heavy'],
  ['m3a3_bradley', 'compact-ifv'],
  ['bmp3', 'eastern-ifv'],
  ['challenger2', 'british-rubber-pad'],
  ['leclerc', 'franco-italian-modular'],
  ['type10', 'japanese-modular'],
  ['strv103', 'hydropneumatic-dead-track'],
  ['t95', 'siege-wide'],
]);
for (const [id, patternId] of expected) {
  assert.equal(trackPatternFor(TANK_SPECS[id]).id, patternId, `${id} track family`);
}

const counts = new Map(TRACK_PATTERN_IDS.map((id) => [id, 0]));
for (const id of ALL_TANK_IDS) {
  const pattern = trackPatternFor(TANK_SPECS[id]);
  assert.ok(TRACK_PATTERN_DEFINITIONS[pattern.id], `${id}: known track pattern`);
  assert.ok(pattern.padCoverage >= 0.90 && pattern.padCoverage <= 0.97,
    `${id}: complete but articulated pad coverage`);
  assert.equal(pattern.shadePalette.length, 3, `${id}: three-tone working-steel palette`);
  assert.equal(new Set(pattern.shadePalette).size, pattern.shadePalette.length,
    `${id}: distinct working-steel shades`);
  counts.set(pattern.id, counts.get(pattern.id) + 1);
}
for (const [id, count] of counts) {
  assert.ok(count > 0, `${id}: family is exercised by the playable fleet`);
}

assert.equal(trackPatternFor(TANK_SPECS.m1a2, null, 'siege-wide').id, 'siege-wide');
assert.throws(() => trackPatternFor(TANK_SPECS.m1a2, null, 'missing-family'),
  /Unknown track pattern/);

// Legacy per-profile switches are forbidden. A family override is explicit;
// detail-mode booleans recreate the fragmented three-paradigm system this
// module replaces.
const vehiclesDir = dirname(fileURLToPath(import.meta.url));
const jsFiles = [];
const visit = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith('.js')) jsFiles.push(path);
  }
};
visit(vehiclesDir);
for (const path of jsFiles) {
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /\b(?:integratedLinks|innerLinks)\s*:/,
    `${path}: deprecated track detail switch`);
  assert.doesNotMatch(source, /\b(?:padGroundCenter|padCornerFloor|padHugZ0)\s*:/,
    `${path}: shoe placement must not diverge from the canonical belt course`);
}

console.log(`[track-patterns] PASS — ${ALL_TANK_IDS.length} tanks across `
  + `${TRACK_PATTERN_IDS.length} centrally resolved families`);
