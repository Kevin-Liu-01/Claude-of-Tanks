import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SNOW_ROCK_HOLD_LINE, snowRockHoldLine } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// Ground lane (2026-10-05, mr2's Glacier round 2: "the col's steep and convex ground stays white"): a snow map's own
// snow-on-rock law — splat.snowRockSlopeDeg / snowRockFadeDeg / snowRockCrest, swapped into the shader text only when a
// map sets them, so every other map compiles today's exact source under today's program key. Pins: the shared line is
// today's (45.6° to 63.9°, crest weight 0.12) and the source carries it once; a map that sets none of the fields gets no
// line (its material the shared source); the degrees' conversion to the shader's 1 − n.y, a field left out at today's
// value; the material's swap and its own key. No GPU or art claim.

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const common = source.slice(source.indexOf('const SPLAT_COMMON_FRAG'), source.indexOf('const SPLAT_NORMAL_FRAG'));
assert.equal(common.split(SNOW_ROCK_HOLD_LINE).length - 1, 1, 'the shared source carries the hold line once');
assert.equal(SNOW_ROCK_HOLD_LINE, 'float hold = 1.0 - smoothstep(0.30, 0.56, slope + (0.5 - gully) * 0.40 - vFold * 0.12);');

// none set: no line — the shared source, the shared key
for (const none of [undefined, null, {}, { midRelief: 0.9 }]) assert.equal(snowRockHoldLine(none), null);
let set = 0;
for (const id of MAP_IDS) {
  const splat = getMapConfig(id).splat;
  const authored = ['snowRockSlopeDeg', 'snowRockFadeDeg', 'snowRockCrest'].some((k) => splat?.[k] !== undefined);
  const line = snowRockHoldLine(splat);
  if (!authored) { assert.equal(line, null, `${id}: no field, no line (its material compiles the shared source)`); continue; }
  set++;
  assert.match(line, /^float hold = 1\.0 - smoothstep\(\d\.\d{4}, \d\.\d{4}, slope \+ \(0\.5 - gully\) \* 0\.40 - vFold \* \d\.\d{4}\);$/, `${id}: its own line`);
}

// the conversion: degrees to 1 − n.y, each field left out at today's value
const slopeOf = (deg) => 1 - Math.cos(deg * Math.PI / 180);
assert.equal(snowRockHoldLine({ snowRockSlopeDeg: 32, snowRockFadeDeg: 50, snowRockCrest: 0.3 }),
  `float hold = 1.0 - smoothstep(${slopeOf(32).toFixed(4)}, ${slopeOf(50).toFixed(4)}, slope + (0.5 - gully) * 0.40 - vFold * 0.3000);`);
assert.equal(snowRockHoldLine({ snowRockSlopeDeg: 32 }), `float hold = 1.0 - smoothstep(${slopeOf(32).toFixed(4)}, 0.5600, slope + (0.5 - gully) * 0.40 - vFold * 0.1200);`);
assert.equal(snowRockHoldLine({ snowRockCrest: 0.25 }), 'float hold = 1.0 - smoothstep(0.3000, 0.5600, slope + (0.5 - gully) * 0.40 - vFold * 0.2500);');
assert.ok(Math.abs(slopeOf(45.573) - 0.30) < 1e-4 && Math.abs(slopeOf(63.896) - 0.56) < 1e-4, "today's law in degrees: 45.6° to 63.9°");
assert.throws(() => snowRockHoldLine({ snowRockSlopeDeg: 50, snowRockFadeDeg: 40 }), /fade must end past its start/);

// the material: the swap only when set, and a swapped source keys its own program
const compact = (t) => t.replace(/\s+/g, ' ');
for (const line of [
  'const snowHold = snowRockHoldLine(S);',
  "'#include <common>\\n' + (snowHold ? _mustReplace(SPLAT_COMMON_FRAG, SNOW_ROCK_HOLD_LINE, snowHold) : SPLAT_COMMON_FRAG));",
  "${snowHold ? `-${snowHold.replace(/[^0-9.]+/g, '_')}` : ''}",
]) assert.ok(compact(source).includes(compact(line)), `the material: ${line}`);

console.log(`snowRockSlope: the shared hold line once, no line for a map without the fields (${MAP_IDS.length - set} maps), ${set} with its own; the degrees' conversion, the material's swap and its own key PASS; no GPU/art claim`);
