// waterBank.selftest.mjs — level water held in its banks (the ground lane, 2026-10-17; MASTER #14 / GW.14 and #15 / GW.15:
// the critics' "tilted water wedge climbing the far bank" at Mangrove, Monsoon's channel "a decal pasted on the valley").
//
// 1. The laws (waterBank.ts): the waterline by inversion is where the shoreline law's wetness reaches the ramp's start;
//    under the water the bed is the level less the depth its coverage holds (plus the lip's share toward the shore); past
//    the waterline the dry shore holds the lip across one sheet cell, then falls away, then stands as authored.
// 2. Real maps: the water sheet (shallowWater.ts) holds each body's level — no triangle of visible water tilts more than
//    10 cm on Mangrove, Fjord, Coastal, Skybridge or Oasis, and only a pinned handful on Saltwind (the bay's seam with the
//    open sea at the west edge), Monsoon, Delta and the Polders (cells where a ditch meets a basin, or an 8 m cell spans
//    two levels); every wet corner of a lake or marsh
//    stands at its level, and the simulation's water top there (the ground plus its depth) agrees with the sheet.
// 3. Monsoon's flood channel is laid at Amberford's 0.5 spacing (its bank 0.03 of a radius deep, not 0.21).
import assert from 'node:assert/strict';
import {
  WATER_BANK_FALL, WATER_BANK_LIP_M, WATER_BANK_PLATEAU_M, WATER_BANK_REACH_M,
  waterBedAt, waterCoverage, waterShoreFloor, waterlineDistance,
} from './waterBank.ts';
import { shorelineWetnessFromDistance } from './shoreline.ts';
import { createHeightField } from './terrain.ts';
import { shallowWaterGeometrySteps } from './shallowWater.ts';
import { getMapConfig } from './maps/index.ts';

// ---- 1. the laws
for (const rampStart of [0.30, 0.40, 0.55]) {
  const marsh = waterlineDistance(0.45, 1, rampStart), lake = waterlineDistance(0.80, 0.96, rampStart);
  assert.ok(Math.abs(shorelineWetnessFromDistance(marsh, false) - rampStart) < 1e-9, 'a marsh\'s waterline: wetness at the ramp\'s start');
  assert.ok(Math.abs(shorelineWetnessFromDistance(lake, true) - rampStart) < 1e-9, 'a lake\'s waterline');
}
assert.equal(waterCoverage(0.78, 0.40, 0.78), 1);
assert.equal(waterCoverage(0.40, 0.40, 0.78), 0);
assert.ok(Math.abs(waterBedAt(-2.3, 0.43, 1) - (-2.73)) < 1e-12, 'under full water the bed is the level less the full depth');
assert.ok(Math.abs(waterBedAt(-2.3, 0.43, 1e-9) - (-2.3 + WATER_BANK_LIP_M)) < 1e-6, 'at the waterline the bed meets the lip');
for (let m = 0.05; m < 1; m += 0.05) {
  assert.ok(waterBedAt(0, 0.43, m) + 0.43 * m * m * (3 - 2 * m) >= -1e-12, 'the bed plus its depth never falls under the level');
}
assert.equal(waterShoreFloor(1, 0), 1 + WATER_BANK_LIP_M);
assert.equal(waterShoreFloor(1, WATER_BANK_PLATEAU_M), 1 + WATER_BANK_LIP_M, 'the lip held across one sheet cell');
assert.ok(Math.abs(waterShoreFloor(1, WATER_BANK_PLATEAU_M + 2) - (1 + WATER_BANK_LIP_M - 2 * WATER_BANK_FALL)) < 1e-12, 'then falling');
assert.equal(waterShoreFloor(1, WATER_BANK_REACH_M + 0.1), -Infinity, 'past its reach the bank stands as authored');
assert.ok(WATER_BANK_PLATEAU_M > 8, 'the plateau spans the sheet\'s 8 m cell');

// ---- 2. real maps
/** Visible tilted triangles (rise over 10 cm, centre over the ground) allowed per map: the cells an 8 m lattice cannot
 *  split (a ditch meeting a basin at another level; two bodies' levels in one cell; Saltwind's bay meeting the open sea at
 *  the edge). Before the bank law: Mangrove 482, Monsoon 380, Delta 533, Polders 365, Fjord 156, Saltwind 139. */
const ALLOWED = { mangrove: 0, fjord: 0, coastal: 0, skybridge: 0, oasis: 0, saltwind: 3, monsoon: 14, delta: 12, polders: 22 };
const rows = [];
for (const [id, allowed] of Object.entries(ALLOWED)) {
  const cfg = getMapConfig(id), hf = createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg);
  assert.equal(typeof hf.getWaterBodySurfaceAt, 'function', `${id}: the height field names its bodies' levels`);
  const steps = shallowWaterGeometrySteps(hf);
  let r = steps.next();
  while (!r.done) r = steps.next();
  const sheet = r.value;
  assert.ok(sheet, `${id}: a water sheet`);
  const pos = sheet.geometry.getAttribute('position'), idx = sheet.geometry.getIndex();
  let visibleTilt = 0, worst = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const vs = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)], ys = vs.map((v) => pos.getY(v));
    const rise = Math.max(...ys) - Math.min(...ys);
    if (rise <= 0.1) continue;
    const cx = (pos.getX(vs[0]) + pos.getX(vs[1]) + pos.getX(vs[2])) / 3, cz = (pos.getZ(vs[0]) + pos.getZ(vs[1]) + pos.getZ(vs[2])) / 3;
    if ((ys[0] + ys[1] + ys[2]) / 3 > hf.getHeightAt(cx, cz) + 0.02) { visibleTilt++; worst = Math.max(worst, rise); }
  }
  assert.ok(visibleTilt <= allowed, `${id}: ${visibleTilt} visible tilted water triangles (allowed ${allowed}, worst ${worst.toFixed(2)} m)`);
  // every fully wet corner of a lake or marsh stands at its body's level, and the simulation's water top agrees there
  let wet = 0, agree = 0;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    if (hf.getWaterMaskAt(x, z) < 0.999) continue;
    const level = hf.getWaterBodySurfaceAt(x, z);
    if (level !== level) continue;
    assert.ok(Math.abs(pos.getY(v) - level) < 1e-4, `${id} (${x}, ${z}): the sheet at its body's level`);
    // (a lake's or a marsh's own water: a canal keeps its own shelf profile, canals.ts carveCanals)
    if ((hf.getOutlandWaterAt?.(x, z)?.wetness ?? 0) < 0.78) continue;
    wet++;
    if (Math.abs(hf.getHeightAt(x, z) + hf.getWaterDepthAt(x, z) - level) < 0.02) agree++;
  }
  assert.ok(wet > 20, `${id}: wet corners measured (${wet})`);
  assert.ok(agree >= wet * 0.95, `${id}: the ground plus its depth is the water's level (${agree} of ${wet} wet corners)`);
  rows.push(`${id} ${visibleTilt}/${allowed} (${agree}/${wet} level)`);
}
console.log(`waterBank: the laws; the sheet level in its banks — ${rows.join(', ')}`);

// ---- 3. Monsoon's channel at 0.5
const monsoon = getMapConfig('monsoon').terrain.marshes;
const channel = monsoon.filter((m) => m.dip !== undefined && m.r >= 29 && m.r <= 58);
let worstGap = 0;
for (let i = 1; i < channel.length; i++) {
  const a = channel[i - 1], b = channel[i];
  const gap = Math.hypot(b.x - a.x, b.z - a.z) / Math.min(a.r, b.r);
  if (gap < 3) worstGap = Math.max(worstGap, gap);
}
assert.ok(worstGap <= 0.5 + 1e-6, `Monsoon's flood channel cells at most half a radius apart (worst ${worstGap.toFixed(3)})`);
console.log(`waterBank: Monsoon's channel at 0.5 (worst gap ${worstGap.toFixed(3)} of a radius) PASS`);
