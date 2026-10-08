// The stones a hull drives over (the hitbox lane, 2026-10-08): a stone that rises less than the drive-over line over its
// own ground (rockCollision.ts ROCK_DRIVE_OVER_M) carries no collider, so a shell aimed at it meets the ground behind it,
// never the air over it. On Moon's stones as props.ts places them (the settle's own rule: rockCollisionProfile null), a
// shell from 14 m out and 2.5 m over the ground, aimed 0.3 m into the ground a metre past each drive-over stone's
// centre, from eight sides in turn:
//   - on the authority's world (the map's collision shard, server/dedicatedWorldCollision.ts) and on the solo world (the
//     props' own shell records and the ground) it never stops in the air over the stone (inside the stone's outline,
//     above its top); it meets the ground at the stone or past it, or a rise or something standing elsewhere first;
//   - nine in ten of them are reached, their ground met, from some side (the rest lie in hollows a rim shadows).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { rayCollisionRecord } from './collision.ts';
import { rockCollisionProfile, rockFormOf, rockGroundAt } from './rockCollision.ts';

installWorldBuildFixture();
const [maps, terrain, vegetation, props, models] = await Promise.all([
  import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'), import('./propsModelStore.ts'),
]);
await models.preloadPropModels();
const MAP = 'moon';
const config = maps.getMapConfig(MAP);
const engine = { anisotropy: 4, setupShadowMaterial() {} };
const field = terrain.createHeightField(1337, config);
const flora = vegetation.createVegetation(field, engine, 2001, config);
const dressing = props.createProps(field, engine, 2002, config, flora);
const authority = createDedicatedWorldCollision(MAP);

// the drive-over stones, by the settle's own rule
const stones = [];
const groundFast = rockGroundAt(field);
dressing.group.updateMatrixWorld(true);
dressing.group.traverse((mesh) => {
  if (!/^rock-variant-\d$/.test(mesh.name)) return;
  const form = rockFormOf(mesh.geometry);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const m = new mesh.matrix.constructor(), corner = new Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    if (rockCollisionProfile(form, m.elements, groundFast)) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, top = -Infinity;
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
      corner.set(cx, cy, cz).applyMatrix4(m);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); z0 = Math.min(z0, corner.z); z1 = Math.max(z1, corner.z);
      top = Math.max(top, corner.y);
    }
    stones.push({ x: m.elements[12], z: m.elements[14], box: [x0, z0, x1, z1], top });
  }
});
assert.ok(stones.length >= 50, `${MAP} places drive-over stones (${stones.length})`);

// the solo world's shell ray: the props' live shell records and the ground (map.ts raycast's law)
const soloColliders = dressing.colliders.filter((record) => !record.dead);
const normal = new Vector3();
function soloRay(origin, dir, maxDistance) {
  let best = maxDistance, record = null;
  for (const candidate of soloColliders) {
    if (candidate.max[0] < Math.min(origin.x, origin.x + dir.x * maxDistance) - 1 || candidate.min[0] > Math.max(origin.x, origin.x + dir.x * maxDistance) + 1
      || candidate.max[2] < Math.min(origin.z, origin.z + dir.z * maxDistance) - 1 || candidate.min[2] > Math.max(origin.z, origin.z + dir.z * maxDistance) + 1) continue;
    const d = rayCollisionRecord(origin, dir, candidate, best, normal);
    if (d >= 0 && d < best) { best = d; record = candidate; }
  }
  for (let t = 0; t < best; t += 0.05) {
    if (origin.y + dir.y * t <= field.getHeightAt(origin.x + dir.x * t, origin.z + dir.z * t)) return { kind: 'terrain', dist: t };
  }
  return record ? { kind: 'prop', dist: best, record } : null;
}

let reached = 0, elsewhere = 0;
const origin = new Vector3(), aim = new Vector3(), dir = new Vector3();
for (const stone of stones) {
  let reachedHere = false;
  for (let side = 0; side < 8; side++) {
    const a = (side / 8) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
    aim.set(stone.x + ux, 0, stone.z + uz);
    aim.y = field.getHeightAt(aim.x, aim.z) - 0.3;
    origin.set(stone.x - ux * 14, 0, stone.z - uz * 14);
    origin.y = field.getHeightAt(origin.x, origin.z) + 2.5;
    dir.copy(aim).sub(origin);
    const length = dir.length();
    dir.normalize();
    // the line's distance to the stone's centre (where its ground begins to be "behind" it)
    const atStone = Math.hypot(stone.x - origin.x, stone.z - origin.z) / Math.hypot(dir.x, dir.z) - 0.5;
    for (const [name, hit] of [['authority', authority.raycast(origin, dir, length + 1)], ['solo', soloRay(origin, dir, length + 1)]]) {
      assert.ok(hit, `${MAP} stone (${stone.x.toFixed(1)}, ${stone.z.toFixed(1)}) side ${side}: the ${name} shell meets something`);
      const px = origin.x + dir.x * hit.dist, py = origin.y + dir.y * hit.dist, pz = origin.z + dir.z * hit.dist;
      const overStone = px >= stone.box[0] && px <= stone.box[2] && pz >= stone.box[1] && pz <= stone.box[3] && py > stone.top + 0.05;
      assert.ok(!(hit.kind === 'prop' && overStone),
        `${MAP} stone (${stone.x.toFixed(1)}, ${stone.z.toFixed(1)}) side ${side}: the ${name} shell stopped in the air over a drive-over stone (${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)})`);
      if (name === 'authority') {
        if (hit.kind === 'terrain' && hit.dist >= atStone) reachedHere = true;
        else elsewhere++;
      }
    }
  }
  if (reachedHere) reached++;
  else if (process.env.COT_DRIVE_OVER_DEBUG) {
    const lines = [];
    for (let side = 0; side < 8; side++) {
      const a = (side / 8) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
      aim.set(stone.x + ux, 0, stone.z + uz); aim.y = field.getHeightAt(aim.x, aim.z) - 0.3;
      origin.set(stone.x - ux * 14, 0, stone.z - uz * 14); origin.y = field.getHeightAt(origin.x, origin.z) + 2.5;
      dir.copy(aim).sub(origin); const length = dir.length(); dir.normalize();
      const atStone = Math.hypot(stone.x - origin.x, stone.z - origin.z) / Math.hypot(dir.x, dir.z) - 0.5;
      const hit = authority.raycast(origin, dir, length + 1);
      lines.push(`${side}:${hit?.kind}@${hit?.dist?.toFixed(1)}/${atStone.toFixed(1)}${hit?.record ? ` ${hit.record.kind ?? 'solid'} (${((hit.record.min[0] + hit.record.max[0]) / 2).toFixed(1)},${((hit.record.min[2] + hit.record.max[2]) / 2).toFixed(1)}) top ${hit.record.max[1].toFixed(2)}` : ''}`);
    }
    console.log(`unreached stone (${stone.x.toFixed(1)}, ${stone.z.toFixed(1)}) top ${stone.top.toFixed(2)} ground ${field.getHeightAt(stone.x, stone.z).toFixed(2)}: ${lines.join(' | ')}`);
  }
}
// a stone in a hollow (a crater's floor) is shadowed by its rim from every side: the shells meet the rise first
assert.ok(reached >= stones.length * 0.9, `the drive-over stones are reached, their ground met (${reached} of ${stones.length})`);
console.log(`rockDriveOver.selftest: ${MAP}'s ${stones.length} drive-over stones carry no collider: a shell aimed past each meets the `
  + `ground behind it (authority and solo; ${reached} reached, ${stones.length - reached} in hollows their rims shadow; ${elsewhere} of `
  + `${stones.length * 8} lines met a rise or something standing elsewhere first), none stops in the air over one`);
