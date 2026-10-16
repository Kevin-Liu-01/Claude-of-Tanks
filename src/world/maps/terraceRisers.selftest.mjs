// terraceRisers.selftest.mjs — the terraces' dry-stone risers built along their contours (props lane A, #6, 2026-10-16):
// on a stepped slope (terrain.ts stepTerraces' benches) the coping lies along every riser's top at its tread's level, set
// back over the tread and proud of the face; none on level ground, a lane or where a building stands; the fallen stones
// at the risers' feet; the settlement's zone alone unless asked; fine regional-stone dressing with no collision; sliced;
// deterministic; props.ts lays it before the buckets merge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTerraceRisers, traceTerraceRisers } from './terraceRisers.ts';

const STEP = 2.6;
const smooth = (x, z) => 0.22 * (x + 40) + 0.03 * z;               // a slope rising toward +x
const stepped = (h) => { const t = h / STEP, k = Math.floor(t), f = t - k, r = 0.5;
  const s = f < 1 - r ? 0 : ((f - (1 - r)) / r) ** 2 * (3 - 2 * (f - (1 - r)) / r); return (k + s) * STEP; };
const ground = (x, z) => (x > 25 ? smooth(25, z) : stepped(smooth(x, z)));  // level beyond x 25
const zone = { polygon: [[-40, -30], [40, -30], [40, 30], [-40, 30]], stepM: STEP, feather: 4, settlement: 1 };
const clear = (x, z) => Math.abs(z - 10) > 1.5 && Math.hypot(x + 20, z + 15) > 3;   // a lane at z 10, a house at (-20, -15)

const r = buildTerraceRisers([zone], { ground, clear, tint: [0.9, 0.88, 0.82] });
assert.ok(r && r.coping > 100, `coping laid (${r?.coping})`);
const geoms = r.parts.regionalStone;
assert.equal(geoms.length, 1);
const g = geoms[0], p = g.attributes.position;
assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], 'the kit stone\'s coloured attributes');
assert.equal(g.userData.fine, true, 'fine dressing: drawn in the fine-detail cells');
assert.equal(g.userData.regional, true); assert.equal(g.userData.noCollision, true, 'no collision');
// every vertex near a tread's level or a riser's foot (the coping) or on the ground (the tumble); none past x 25 (level)
let onTread = 0, total = 0;
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
  total++;
  assert.ok(x < 25.5, `nothing on the level ground (${x.toFixed(1)})`);
  assert.ok(Math.abs(z - 10) > 1.2, 'nothing across the lane');
  assert.ok(Math.hypot(x + 20, z + 15) > 2.4, 'nothing where the house stands');
  const n = Math.round((y + 0.1) / STEP);
  if (Math.abs(y - (n * STEP + 0.055)) < 0.05) onTread++;
}
assert.ok(onTread / total > 0.35, `the coping's tops at their treads' levels (${onTread}/${total})`);
// a stone's top sits on its tread and stands proud of the riser: the ground under its back edge level with it, under
// its front well below
let proud = 0, checked = 0;
for (let t = 0; t + 2 < p.count; t += 3) {
  const ys = [p.getY(t), p.getY(t + 1), p.getY(t + 2)];
  if (Math.max(...ys) - Math.min(...ys) > 0.02) continue; // the top faces only
  const x = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, z = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3, y = ys[0];
  checked++;
  if (y - ground(x, z) > -0.02 && y - ground(x, z) < 0.3) proud++;
}
assert.ok(checked > 100 && proud / checked > 0.9, `the coping stands on its tread (${proud}/${checked})`);
assert.ok(r.tumble > 5, `stones shed at the risers' feet (${r.tumble})`);
// a zone outside a settlement is left to its painted risers unless asked
assert.equal(buildTerraceRisers([{ ...zone, settlement: undefined }], { ground, clear, tint: [1, 1, 1] }), null, 'the valley zones wait');
assert.ok(buildTerraceRisers([{ ...zone, settlement: undefined }], { ground, clear, tint: [1, 1, 1], all: true }), 'unless all are asked');
// sliced and deterministic
const it = traceTerraceRisers([zone], { ground, clear, tint: [0.9, 0.88, 0.82] });
let slices = 0, done;
for (;;) { const s = it.next(); if (s.done) { done = s.value; break; } assert.deepEqual(s.value, { fine: true, progress: false, stage: 'terrace-risers' }); slices++; }
assert.ok(slices > 10, `the trace yields to the loading (${slices} slices)`);
assert.deepEqual(done.parts.regionalStone[0].attributes.position.array, p.array, 'deterministic');

const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
const at = props.indexOf('const risers = yield* traceTerraceRisers(riserZones,');
assert.ok(at > 0 && at < props.indexOf('function* mergeMaterialBuckets('), 'props.ts lays the risers before the buckets merge');
assert.ok(props.includes('if (risers) buckets.regionalStone.push(...risers.parts.regionalStone);') && props.includes('!mobileProps && regionalArchitecture'), 'on the kit stone, desktop');
console.log(`terraceRisers.selftest: ${r.coping} coping stones on ${Math.round(r.metres)} m of risers, ${r.tumble} shed, none on the level, the lane or the house; sliced, deterministic, wired`);
