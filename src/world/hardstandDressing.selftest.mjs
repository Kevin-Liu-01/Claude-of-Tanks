// hardstandDressing.selftest.mjs — the paved pads' render-only dressing (props lane A, #19, 2026-10-15; the coordinator's
// ruling: no step in the drive surface, the lip at most 2-3 cm proud): only the pads the terrain paves are dressed; over a
// pad nothing stands more than the lip over the graded ground; the lip runs round each pad but where a road runs in or
// another pad continues the paving; the airfield's runway carries its piano keys, stripes and centreline and its edge
// lights stand outside its edge; one baked-material geometry, deterministic, under its triangle cap.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { HARDSTAND_LIP_M, buildHardstandDressing, hardstandIsPaved } from './hardstandDressing.ts';
import { civicUndressedPads } from './civic/plans/index.ts';

const PAVED = ['airfield', 'urban', 'ruinspires', 'railyard', 'cliffbridge']; // (Ronda's pads inside its paved town rect)
const inside = (s, x, z, inset) => {
  const yaw = (s.yawDeg ?? 0) * Math.PI / 180, dx = x - s.x, dz = z - s.z;
  return Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < s.width / 2 - inset && Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) < s.length / 2 - inset;
};
const dressed = [];
for (const mapId of MAP_IDS) {
  const cfg = getMapConfig(mapId), strips = cfg.terrain?.hardstands ?? [];
  const field = createHeightField(1337, cfg), L = field._layout;
  // (the maps lane, 228) a pad a civic area dresses as its town square (civic/plans) takes none of the yard's dressing
  const undressed = civicUndressedPads(mapId);
  const g = buildHardstandDressing(strips, cfg.splat, field, L.roads, L.village, 1337, undressed);
  const paved = strips.filter((s, i) => hardstandIsPaved(cfg.splat, s.x, s.z, L.village) && !undressed.has(i));
  assert.equal(!!g, paved.length > 0, `${mapId}: dressed exactly where the terrain paves a pad`);
  if (!g) continue;
  dressed.push(mapId);
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], 'the baked family\'s attributes');
  const p = g.attributes.position, c = g.attributes.color, tris = p.count / 3;
  assert.ok(tris > 200 && tris <= 8000, `${mapId}: ${tris} triangles under the cap`);
  let onPad = 0, lights = 0, worst = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    assert.ok([x, y, z, c.getX(i), c.getY(i), c.getZ(i)].every(Number.isFinite));
    const h = y - field.getHeightAt(x, z);
    assert.ok(![...undressed].some((i) => inside(strips[i], x, z, -0.3)), `${mapId}: nothing on the civic square's pad`);
    if (strips.some((s) => inside(s, x, z, -0.2))) {
      // on a pad or its edge band: the ruling — never a step in the drive surface
      onPad++; worst = Math.max(worst, h);
      assert.ok(h <= HARDSTAND_LIP_M + 0.006, `${mapId}: a vertex on a pad ${h.toFixed(3)} m over it`);
    } else if (h > 0.08) lights++;
  }
  // every skin over the pad faces up (the film's first cut: the piano keys wound downward drew dark)
  let flat = 0, down = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ys = [0, 1, 2].map((k) => p.getY(i + k) - field.getHeightAt(p.getX(i + k), p.getZ(i + k)));
    if (ys.some((h) => h < 0.004 || h > 0.02)) continue;
    flat++;
    const ux = p.getX(i + 1) - p.getX(i), uz = p.getZ(i + 1) - p.getZ(i), wx = p.getX(i + 2) - p.getX(i), wz = p.getZ(i + 2) - p.getZ(i);
    if (uz * wx - ux * wz <= 0) down++;
  }
  assert.ok(flat > 20 && down === 0, `${mapId}: every skin faces up (${down} of ${flat} down)`);
  assert.ok(onPad > p.count * (mapId === 'airfield' ? 0.6 : 0.97), `${mapId}: the dressing lies on its pads and their edges (${onPad}/${p.count})`);
  assert.ok(HARDSTAND_LIP_M <= 0.03, 'the lip at most 3 cm proud');
  if (mapId === 'airfield') {
    // the runway's lights a step outside its edges (2 x 11, those where an apron meets it left out), its piano keys
    assert.ok(lights > 16 * 30, `the runway's edge lights stand off the paving (${lights} vertices)`);
    const runway = strips.find((s) => s.length >= s.width * 5);
    let keys = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), along = Math.abs(x - runway.x);
      if (along > runway.length / 2 - 36 && along < runway.length / 2 - 6 && c.getX(i) > 0.4) keys++;
    }
    assert.ok(keys > 2 * 16 * 6, `the thresholds' piano keys at both ends (${keys})`);
  } else assert.equal(lights, 0, `${mapId}: nothing stands off a yard`);
  const again = buildHardstandDressing(strips, cfg.splat, field, L.roads, L.village, 1337, undressed);
  assert.deepEqual(again.attributes.position.array, p.array, 'deterministic');
  g.dispose(); again.dispose();
  console.log(`${mapId}: ${tris} triangles, ${paved.length} paved pads, highest over a pad ${worst.toFixed(3)} m`);
}
assert.deepEqual(dressed.sort(), [...PAVED].sort(), 'the paved maps\' pads, and no earth pad');
const src = readFileSync(new URL('./hardstandDressing.ts', import.meta.url), 'utf8');
assert.doesNotMatch(src, /collision|CollisionRecord|setObbShape/, 'render only: no record');
console.log(`hardstandDressing.selftest: ${dressed.length} paved maps dressed, no step over a pad (lip ${HARDSTAND_LIP_M} m), runway marked and lit`);
