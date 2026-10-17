// waterSheetLevels.selftest.mjs — the water sheet holds a canal's level; Monsoon's channel laid smooth (the ground lane,
// 2026-10-17; MASTER #14, the Polders ditch, and #15, Monsoon's channel "a decal pasted on the valley").
//
// 1. Polders and Caldera: every wet corner of the sheet a canal's water reaches stands at that canal's level (the canal's
//    shelf had lifted its bed-plus-depth up the banks), no shore corner beside a canal stands over the canal's water, and
//    a lake's or marsh's corner keeps its bed plus depth (HeightField getWaterBodySurfaceAt names canals only).
// 2. Monsoon's flood channel is laid at Amberford's 0.5 spacing: the bank between cells 0.03 of a radius deep, not 0.21.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { shallowWaterGeometrySteps } from './shallowWater.ts';
import { getMapConfig } from './maps/index.ts';

const rows = [];
for (const id of ['polders', 'caldera']) {
  const cfg = getMapConfig(id), hf = createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg);
  assert.equal(typeof hf.getWaterBodySurfaceAt, 'function', `${id}: the height field names its canals' levels`);
  const steps = shallowWaterGeometrySteps(hf);
  let r = steps.next();
  while (!r.done) r = steps.next();
  assert.ok(r.value, `${id}: a water sheet`);
  const pos = r.value.geometry.getAttribute('position');
  const canals = cfg.terrain.canals ?? [];
  let canalCorners = 0, bodyCorners = 0;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const level = hf.getWaterBodySurfaceAt(x, z);
    if (hf.getWaterMaskAt(x, z) > 0.002) {
      if (level === level) {
        assert.ok(Math.abs(y - level) < 1e-4, `${id} (${x}, ${z}): a canal's corner at its level ${level} (${y})`);
        canalCorners++;
      } else {
        const paddy = hf.getPaddyWaterLevelAt ? hf.getPaddyWaterLevelAt(x, z) : Number.NaN;
        if (paddy === paddy) continue; // (a paddy draws its own level quad)
        assert.ok(Math.abs(y - (hf.getHeightAt(x, z) + hf.getWaterDepthAt(x, z))) < 1e-3, `${id} (${x}, ${z}): a lake's or marsh's corner keeps its bed plus depth`);
        bodyCorners++;
      }
    }
  }
  if (id === 'polders') assert.ok(canals.length >= 4 && canalCorners > 20, `Polders: its canals' corners measured (${canalCorners})`);
  rows.push(`${id} ${canalCorners} canal corners at their level, ${bodyCorners} lake/marsh corners on their bed`);
}
console.log(`waterSheetLevels: ${rows.join('; ')}`);

// ---- 2. Monsoon's channel at 0.5
const channel = getMapConfig('monsoon').terrain.marshes;
let worstGap = 0, pairs = 0;
for (let i = 1; i < channel.length; i++) {
  const a = channel[i - 1], b = channel[i];
  const gap = Math.hypot(b.x - a.x, b.z - a.z) / Math.min(a.r, b.r);
  if (gap < 3) { worstGap = Math.max(worstGap, gap); pairs++; }
}
assert.ok(pairs > 40 && worstGap <= 0.5 + 1e-6, `Monsoon's flood channel cells at most half a radius apart (worst ${worstGap.toFixed(3)} over ${pairs})`);
console.log(`waterSheetLevels: Monsoon's channel at 0.5 (worst gap ${worstGap.toFixed(3)} of a radius, ${pairs} pairs) PASS`);
