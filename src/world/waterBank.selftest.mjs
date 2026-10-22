// waterBank.selftest.mjs — level water held in its banks (the ground lane, 2026-10-17; MASTER #14 / GW.14 and #15 / GW.15:
// the critics' "tilted water wedge climbing the far bank" at Mangrove, Monsoon's channel "a decal pasted on the valley";
// finished 2026-10-21 for 230: the banks graded from the water's top, no plateau, no reach cut).
//
// 1. The laws (waterBank.ts): the waterline by inversion is where the shoreline law's wetness reaches the ramp's start;
//    under the water the bed is the level less the depth its coverage holds (plus the lip's share toward the shore); past
//    the waterline the dry shore keeps a lip over the water's top that fades out within a few metres and never lowers it.
// 2. Real maps: the water sheet (shallowWater.ts) holds each body's level — no triangle of visible water tilts more than
//    10 cm on any waterside map but a pinned handful on Monsoon, Delta and the Polders (cells where a ditch meets a basin,
//    or an 8 m cell spans two levels); every wet corner of a lake or marsh stands at its level, and the simulation's water
//    top there (the ground plus its depth) agrees with the sheet. Polders and Caldera (from item/ground-water-227a): every
//    wet corner a canal's water reaches stands at that canal's level.
// 3. The banks are graded, not stepped: through the 10-17 cut's worst banks (Autumn's 2.5 m drop at its reach, Delta's,
//    Monsoon's and Blackglass's, the strands' 0.84 m terrace, Mangrove's ditch behind its berm) the dry shore stands at
//    least the water's top at the waterline and falls no faster than the native bank beside it did.
// 4. Monsoon's flood channel is laid at Amberford's 0.5 spacing (its bank 0.03 of a radius deep, not 0.21).
import assert from 'node:assert/strict';
import {
  WATER_BANK_LIP_FADE_M, WATER_BANK_LIP_M, waterBankLip, waterBedAt, waterCoverage, waterlineDistance,
} from './waterBank.ts';
import { shorelineWetnessFromDistance } from './shoreline.ts';
import { createHeightField } from './terrain.ts';
import { shallowWaterGeometrySteps } from './shallowWater.ts';
import { getMapConfig } from './maps/index.ts';
import { VISIBLE_WATER_MIN } from './visibleWater.ts';

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
assert.equal(waterBankLip(1, 1, 0), 1 + WATER_BANK_LIP_M, 'at the waterline the shore stands the lip over the water');
assert.equal(waterBankLip(1, 1, WATER_BANK_LIP_FADE_M), 1, 'the lip fades out');
assert.ok(waterBankLip(1, 1, WATER_BANK_LIP_FADE_M / 2) > 1 && waterBankLip(1, 1, WATER_BANK_LIP_FADE_M / 2) < 1 + WATER_BANK_LIP_M, 'and falls smoothly');
assert.equal(waterBankLip(1, 3, 0), 3, 'a bank over the water keeps its height');
assert.equal(waterBankLip(1, 1.05, 0), 1 + WATER_BANK_LIP_M, 'the lip tops a low bank up to itself, never past it');
assert.equal(waterBankLip(1, -2, 0), -2 + WATER_BANK_LIP_M, 'and never lifts a shore by more than the lip');
for (let b = 0; b < WATER_BANK_LIP_FADE_M; b += 0.25) {
  assert.ok(waterBankLip(1, 1, b) >= waterBankLip(1, 1, b + 0.25), 'the lip never rises away from the water');
}

// ---- 2. real maps
/** Visible tilted triangles (rise over 10 cm, centre over the ground) allowed per map inside 480 m: the cells an 8 m
 *  lattice cannot split (a canal's silted end beside the basin it drains, a ditch meeting a basin at another level, two
 *  bodies' levels in one cell). Over the square's last 28 m the banks and the sheet fade back to the carve the ring's seam
 *  and the sea apron meet (terrain.ts waterBankEdgeKeep), so a shore crossing the red line keeps its old taper there; those
 *  are counted apart. Before the bank law: Mangrove 482, Monsoon 380, Delta 533, Polders 365, Fjord 156, Saltwind 139;
 *  the 10-17 cut: Saltwind 3, Monsoon 13, Delta 11, Polders 21 (its plateau held the shores); 230: the shore corners hold
 *  their water's level and the mask's discard hides them over dry ground. */
const ALLOWED = { mangrove: 0, fjord: 0, coastal: 0, skybridge: 0, oasis: 0, saltwind: 0, monsoon: 0, delta: 1, polders: 17,
  autumn: 0, blackglass: 0, reservoir: 1 };
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
  let visibleTilt = 0, worst = 0, edgeTilt = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const vs = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)], ys = vs.map((v) => pos.getY(v));
    const rise = Math.max(...ys) - Math.min(...ys);
    if (rise <= 0.1) continue;
    const cx = (pos.getX(vs[0]) + pos.getX(vs[1]) + pos.getX(vs[2])) / 3, cz = (pos.getZ(vs[0]) + pos.getZ(vs[1]) + pos.getZ(vs[2])) / 3;
    if ((ys[0] + ys[1] + ys[2]) / 3 <= hf.getHeightAt(cx, cz) + 0.02) continue;
    // (the sheet's fragment discard, visibleWater.ts: no water is drawn where the mask is under VISIBLE_WATER_MIN; a cell
    // a road dried, Reservoir's at its causeway, follows the ground there)
    if (hf.getWaterMaskAt(cx, cz) < VISIBLE_WATER_MIN) continue;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 480) { edgeTilt++; continue; }
    visibleTilt++; worst = Math.max(worst, rise);
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
  rows.push(`${id} ${visibleTilt}/${allowed} (${edgeTilt} at the edge; ${agree}/${wet} level)`);
}
console.log(`waterBank: the laws; the sheet level in its banks — ${rows.join(', ')}`);

// ---- 2b. canals (folded in from item/ground-water-227a, waterSheetLevels): every wet corner a canal's water reaches
// stands at that canal's level
for (const id of ['polders', 'caldera']) {
  const cfg = getMapConfig(id), hf = createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg);
  const steps = shallowWaterGeometrySteps(hf);
  let r = steps.next();
  while (!r.done) r = steps.next();
  const pos = r.value.geometry.getAttribute('position');
  let canalCorners = 0;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    if (!(hf.getWaterMaskAt(x, z) > 0.002) || (hf.getOutlandWaterAt?.(x, z)?.wetness ?? 0) > 0) continue;
    const level = hf.getWaterBodySurfaceAt(x, z);
    if (level !== level) continue;
    assert.ok(Math.abs(pos.getY(v) - level) < 1e-4, `${id} (${x}, ${z}): a canal's corner at its level ${level} (${pos.getY(v)})`);
    canalCorners++;
  }
  assert.ok(canalCorners > 10, `${id}: canal corners measured (${canalCorners})`);
  rows.push(`${id} canals ${canalCorners} corners level`);
}

// ---- 3. graded, not stepped: each bank from its waterline (the first dry metre) outward 40 m. The 10-17 cut's worst
// banks (pick: the largest lift per map, two per map at least 120 m apart, the direction from the nearest wet cell),
// with the steepest 1 m fall the native bank had there (the 230 base, integ/230 4c75b76e70). The 10-17 cut fell 2.5 m in
// one metre at Autumn and Blackglass (its 16 m reach), 1.6 at Delta, 1.4 at Monsoon, 0.84 on the strands.
const BANKS = [
  ['coastal', 440, -400, -0.7071, -0.7071, 0],
  ['coastal', 368, -312, -1, 0, 0],
  ['autumn', -44, -72, -0.7071, 0.7071, 0.59],
  ['autumn', -336, -268, 0.3162, -0.9487, 0.363],
  ['fjord', 304, 44, -1, 0, 0.007],
  ['fjord', 280, -240, 0, -1, 0],
  ['delta', -340, -340, -0.7071, -0.7071, 0.322],
  ['delta', -76, -112, 0.7682, -0.6402, 0.206],
  ['monsoon', 120, 16, 0.8321, -0.5547, 0.211],
  ['monsoon', -92, -152, 0.5547, -0.8321, 0.22],
  ['blackglass', -20, 96, 0, -1, 0.348],
  ['blackglass', 168, 104, 0, 1, 0.164],
  ['skybridge', -80, 16, -1, 0, 0.217],
  ['skybridge', 0, 196, 0, 1, 0.322],
  ['polders', 128, 264, 0, -1, 0],
  ['polders', 136, -300, 0, -1, 0],
  ['oasis', -188, -44, 0, -1, 0.021],
  ['oasis', -108, 56, 1, 0, 0.063],
  ['mangrove', 52, -264, -0.9899, -0.1414, 0.41],
  ['mangrove', 84, -104, -0.9701, 0.2425, 0.285],
  ['saltwind', -320, 72, 0.4472, 0.8944, 0.006],
  ['saltwind', -384, -120, 1, 0, 0.001],
  ['reservoir', 128, -28, 0, 1, 0.013],
  ['reservoir', 208, -108, 0.7071, -0.7071, 0],
];
const graded = [];
const fields = new Map();
for (const [id, wx, wz, dx, dz, nativeSteep] of BANKS) {
  if (!fields.has(id)) {
    const cfg = getMapConfig(id);
    fields.set(id, createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg));
  }
  const hf = fields.get(id);
  let edge = null;
  for (let t = -12; t <= 20; t += 0.25) if (hf.getWaterMaskAt(wx + dx * t, wz + dz * t) <= 0.002) { edge = t; break; }
  assert.ok(edge !== null, `${id} (${wx}, ${wz}): the bank's waterline`);
  const top = hf.getWaterBodySurfaceAt(wx - dx * 12, wz - dz * 12);
  assert.ok(top === top, `${id} (${wx}, ${wz}): the water's top`);
  let steep = 0, prev = null, low = Infinity;
  for (let t = edge; t <= edge + 40; t += 1) {
    const h = hf.getHeightAt(wx + dx * t, wz + dz * t);
    if (prev !== null) steep = Math.max(steep, prev - h);
    if (t <= edge + 1.5) low = Math.min(low, h);
    prev = h;
  }
  assert.ok(steep <= nativeSteep + 0.12, `${id} (${wx}, ${wz}): the bank falls ${steep.toFixed(3)} m in a metre (native ${nativeSteep})`);
  assert.ok(low >= top - 0.02, `${id} (${wx}, ${wz}): the first dry metre and a half stands at the water's top (${low.toFixed(3)} under ${top.toFixed(3)})`);
  graded.push(steep - nativeSteep);
}
console.log(`waterBank: ${BANKS.length} banks graded from the water's top (worst fall over the native bank's ${Math.max(...graded).toFixed(3)} m) PASS`);
console.log(`waterBank: ${rows.slice(-2).join(', ')}`);

// ---- 4. Monsoon's channel at 0.5
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
