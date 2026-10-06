import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLandFieldSample, LAND_CROP, landUseAt, landUseProfileIds, resolveLandUseProfile } from './landUse.ts';

// Ground lane (2026-10-05, the field-structure pass; wave 100: "a random scatter of … blade cards with no rows"): a sown
// crop's tramlines — the sprayer's two wheel tracks, 1.8 m apart and 0.45 m each, a pair every 18–26 m straight down the
// field — are one law in three places: the material draws their soil (terrain.ts), the tall grass and the tufts keep off
// them (tallGrass.ts, vegetation.ts), all through landUse.ts's tramQ. Pins: the twin follows the material's formula on the
// bake's own quantities (six-bit jitter, 16-bit row turn) to a fifth of a half-width; only wheat, barley and a young
// green crop carry them; their share of a sown field is the two tracks' over the period; the material's and the tiers'
// lines. No GPU or art claim.

const SOWN = new Set([LAND_CROP.wheat, LAND_CROP.barley, LAND_CROP.green]);
const s = createLandFieldSample();

/** The material's own tramline distance (terrain.ts), evaluated on the bake's quantities at (x, z). */
function materialDT(sample, x, z) {
  const jit = Math.min(63, Math.round(sample.jitter * 63)) / 63;
  const turn = Math.atan2(sample.rowZ, sample.rowX) / (2 * Math.PI);
  const code = Math.round((turn - Math.floor(turn)) * 65536) & 65535;
  const a = code * (6.2831853 / 65536), rx = Math.cos(a), rz = Math.sin(a);
  const period = 18 + Math.floor(jit * 4) * 2;
  const v = -rz * x + rx * z + jit * 37;
  return Math.abs(v - period * Math.floor(v / period) - period * 0.5);
}

let rng = 0x5eed1234;
const rnd = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
let sownMaps = 0;
for (const id of landUseProfileIds()) {
  const profile = resolveLandUseProfile(id);
  let sown = 0, onTrack = 0, worst = 0;
  for (let k = 0; k < 40000; k++) {
    const x = (rnd() - 0.5) * 1000, z = (rnd() - 0.5) * 1000;
    landUseAt(profile, x, z, s);
    if (!s.active || !SOWN.has(s.crop)) {
      assert.equal(s.tramQ, 1e9, `${id} (${x.toFixed(1)}, ${z.toFixed(1)}): no tramline off a sown crop`);
      continue;
    }
    sown++;
    if (Math.abs(s.tramQ) < 1) onTrack++;
    worst = Math.max(worst, Math.abs(s.tramQ - (materialDT(s, x, z) - 0.9) / 0.225));
  }
  if (!sown) continue;
  sownMaps++;
  assert.ok(worst < 0.2, `${id}: the twin's tramline is the material's within a fifth of a half-width (worst ${worst.toFixed(3)})`);
  // two 0.45 m tracks a period of 18–26 m: 3.5–5 % of a sown field
  const share = onTrack / sown;
  assert.ok(share > 0.025 && share < 0.06, `${id}: the tracks' share of a sown field (${(share * 100).toFixed(2)} %)`);
}
assert.ok(sownMaps >= 5, `every map with sown fields carries tramlines (${sownMaps})`);

// a field without a profile carries none
landUseAt(null, 10, 10, s);
assert.equal(s.tramQ, 1e9, 'no field system: no tramline');

// the material's lines and the tiers' gates
const compact = (t) => t.replace(/\s+/g, ' ');
const terrain = compact(readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8'));
for (const line of [
  'float period = 18.0 + floor(jit * 4.0) * 2.0;',
  'float dT = abs(mod(dot(wp.xz, acrossT) + jit * 37.0, period) - period * 0.5);',
  'float cov = (clamp(dT + 0.5 * fT, 0.675, 1.125) - clamp(dT - 0.5 * fT, 0.675, 1.125)) / fT;',
]) assert.ok(terrain.includes(compact(line)), `the material: ${line}`);
assert.ok(compact(readFileSync(new URL('./tallGrass.ts', import.meta.url), 'utf8')).includes('if (Math.abs(_field.tramQ ?? 1e9) < 1.1) return;'),
  'the tall grass keeps off the tracks');
assert.ok(compact(readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8')).includes('else if (Math.abs(f.tramQ ?? 1e9) < 2.4) return null;'),
  'the tufts keep their half-metre reach off the tracks');

console.log(`tramlines: the twin is the material's on ${sownMaps} maps' sown fields, none off them, the tracks' share, the material's and the tiers' lines PASS; no GPU/art claim`);
