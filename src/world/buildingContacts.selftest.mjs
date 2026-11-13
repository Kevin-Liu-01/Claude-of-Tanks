// buildingContacts.selftest (buildings-271, for the ground lane): the ground contacts a regional build hands the ground
// (buildingContacts.ts through props.ts features.buildings[*].contacts) on two kits' maps, from the headless world build.
// Every door stands on its plinth's outline and faces out of it, every plinth is counter-clockwise from above, the read
// is the same twice (deterministic), and the counts are pinned: a kit or plan change that moves them says so here.
import assert from 'node:assert/strict';

const { buildWorldCollisionData } = await import('../../tools/headlessWorldCollision.mjs');

// map: [buildings carrying contacts, house bodies, ground-floor doors]
const PINS = { autumn: [40, 41, 113], caldera: [35, 40, 34] };

const read = (features) => features.filter((f) => f.contacts).map((f) => f.contacts());
for (const [mapId, [buildings, houses, doors]] of Object.entries(PINS)) {
  let features = [];
  await buildWorldCollisionData(mapId, { inspect: ({ dressing }) => { features = dressing.features?.buildings ?? []; } });
  const first = read(features), again = read(features);
  assert.deepEqual(again, first, `${mapId}: the contacts read the same twice`);
  const bodies = first.flat();
  const doorCount = bodies.reduce((n, c) => n + c.doors.length, 0);
  assert.deepEqual([first.length, bodies.length, doorCount], [buildings, houses, doors], `${mapId}: contacts census [buildings, houses, doors]`);
  for (const c of bodies) {
    assert.equal(c.plinth.length, 4, `${mapId}/${c.kind}: a plinth is four corners`);
    let area = 0;
    for (let i = 0; i < 4; i++) { const [ax, az] = c.plinth[i], [bx, bz] = c.plinth[(i + 1) % 4]; area += ax * bz - bx * az; }
    // counter-clockwise seen from above (+y up): with x east and z south the shoelace sum is negative
    assert.ok(area < 0, `${mapId}/${c.kind}: the plinth runs counter-clockwise from above`);
    assert.ok(c.eave >= 0 && c.apron >= 0, `${mapId}/${c.kind}: eave and apron are lengths`);
    const cx = c.plinth.reduce((a, p) => a + p[0], 0) / 4, cz = c.plinth.reduce((a, p) => a + p[1], 0) / 4;
    for (const d of c.doors) {
      let best = Infinity;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c.plinth[i], [bx, bz] = c.plinth[(i + 1) % 4];
        const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((d.x - ax) * vx + (d.z - az) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(ax + vx * t - d.x, az + vz * t - d.z));
      }
      assert.ok(best <= 0.6, `${mapId}/${c.kind}: a door stands on its plinth's outline (${best.toFixed(2)} m off)`);
      assert.ok(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 1e-6, `${mapId}/${c.kind}: a door's normal is a unit vector`);
      assert.ok((d.x - cx) * d.nx + (d.z - cz) * d.nz > 0, `${mapId}/${c.kind}: a door faces out of its building`);
    }
  }
  console.log(`buildingContacts: ${mapId} ${buildings} buildings, ${houses} bodies, ${doors} doors on their plinths, facing out`);
}
