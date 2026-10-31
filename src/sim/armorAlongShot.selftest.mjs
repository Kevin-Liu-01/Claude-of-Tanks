// 267 (Main's ruling, a fleet balance move): a round entering a collision face whose plate cannot meet it — the plate
// faces away from the round (a roof under a level round, a side ahead of the bow), or it is a mantlet or gun notch and
// the entry lies off its window — reads the plate facing the round whose outline the round's line crosses, nearest the
// entry (sim/armor.ts plateAlongShot, sim/armorZones.ts zoneAlongShot), at the face's own angle. nearestPlate let a
// sloped front-top bevel take the roof: a level round met a 45 mm roof where the authored cheek or front stood across
// its path. Held here, on a cell with a bevel: a level round through the bevel reads the front; the controls (above the
// front's outline, top attack, a flank round on the side) keep their plates; a mantlet off its window reads the front,
// over it the mantlet. On the fleet's head-on grids (leo2a5m, t72b3, m1a2_abrams, t90m, kf51_panther; 600 mm, 0/±15/±30):
// every hit whose plate faces its round keeps it, every other reads the plate along its line; the KF51's front-top reads
// its front and, from above, its roof; the Leopard's bevels and its off-window mantlet faces read its cheeks.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';

const { tankPoseFromState, traceTank } = await import('./armor.ts');
const { zoneAlongShot, zonePlates } = await import('./armorZones.ts');
const { gunFaceSplitPlate } = await import('./gunFaceSplit.ts');

const POSE = tankPoseFromState({ pos: new Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const firstFace = (hits) => hits.find((hit) => hit.kind === 'plate' && hit.collisionFace);
const shoot = (armor, from, to) => firstFace(traceTank(new Vector3(...from), new Vector3(...to), POSE, armor, new Set()));

// ---- one cell with a bevel: the front (z = 1, up to y 0.9), the bevel up to the roof (y 1.2, from z 0.2 back)
{
  const plate = (name, verts, mm) => ({ name, kind: 'main', verts, physicalMm: mm, keMm: mm, ceMm: mm });
  // the authored front stands to y 1.0, above the bevel's foot: a level round at y 0.95 meets it as authored
  const front = plate('front', [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]], 600);
  const roof = plate('roof', [[-1, 1.2, 0.2], [1, 1.2, 0.2], [1, 1.2, -1], [-1, 1.2, -1]], 40);
  const side = plate('side_R', [[1, 0, 1], [1, 0, -1], [1, 1.2, -1], [1, 1.2, 1]], 80);
  const sideL = plate('side_L', [[-1, 0, -1], [-1, 0, 1], [-1, 1.2, 1], [-1, 1.2, -1]], 80);
  const rear = plate('rear', [[1, 0, -1], [-1, 0, -1], [-1, 1.2, -1], [1, 1.2, -1]], 40);
  const mantlet = plate('mantlet', [[-0.2, 0.4, 1], [0.2, 0.4, 1], [0.2, 0.7, 1], [-0.2, 0.7, 1]], 450);
  // the cell: x -1..1, a section in (y, z): bottom rear, bottom front, front top (0.9, 1), roof front (1.2, 0.2), roof rear
  const section = [[0, -1], [0, 1], [0.9, 1], [1.2, 0.2], [1.2, -1]];
  const vertices = [...section.map(([y, z]) => [-1, y, z]), ...section.map(([y, z]) => [1, y, z])];
  const quads = [];
  for (let i = 0; i < section.length; i++) quads.push([i, (i + 1) % section.length, section.length + (i + 1) % section.length, section.length + i]);
  const cellFaces = (frontPlate) => {
    const faces = [];
    const add = (indices) => {
      const [a, b, c] = indices.map((i) => new Vector3(...vertices[i]));
      let n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      if (n.dot(centre.clone().sub(new Vector3(0, 0.6, 0))) < 0) { n = n.negate(); indices = [indices[0], indices[2], indices[1]]; }
      // as nearestPlate gives them: the bevel (n.y 0.94) the roof, the front the front, the sides theirs
      const owner = n.x > 0.5 ? side : n.x < -0.5 ? sideL : n.z > 0.9 ? frontPlate : n.y > 0.5 ? roof : n.z < -0.5 ? rear : roof;
      faces.push({ indices, normal: n.toArray(), constant: -n.dot(a), center: centre.toArray(), internal: false, plate: owner });
    };
    for (const [a, b, c, d] of quads) { add([a, b, c]); add([a, c, d]); }
    add([0, 1, 2]); add([0, 2, 3]); add([0, 3, 4]);
    const n = section.length;
    add([n, n + 2, n + 1]); add([n, n + 3, n + 2]); add([n, n + 4, n + 3]);
    return faces;
  };
  const model = (frontPlate) => ({
    hullPlates: [front, roof, side, sideL, rear, mantlet], turretPlates: [], modules: [], crew: [], turretPivot: [0, 0, 0], gunPivot: [0, 0, 0],
    collisionShells: { hull: [{ min: [-1, 0, -1], max: [1, 1.2, 1], vertices, faces: cellFaces(frontPlate) }], turret: [] },
  });
  const armor = model(front);
  const bevel = shoot(armor, [0.3, 0.95, 10], [0.3, 0.95, -10]);
  assert.equal(bevel.collisionFace.plate.name, 'roof', 'the bevel\'s face is the roof\'s (nearestPlate)');
  assert.equal(bevel.plate.name, 'front', 'a level round through the bevel reads the front across its path');
  assert.ok(Math.abs(bevel.impactAngleDeg - (Math.acos(0.3 / Math.hypot(0.3, 0.8)) * 180) / Math.PI) < 0.01,
    `at the bevel's own angle (${bevel.impactAngleDeg.toFixed(2)} deg)`);
  // controls: a round that does meet the roof or the side keeps it
  const over = shoot(armor, [0.3, 1.1, 10], [0.3, 1.1, -10]);
  assert.ok(over.collisionFace.plate.name === 'roof' && over.plate.name === 'roof', 'above the front\'s outline the bevel reads the roof');
  const zBevel = 1 - (0.05 / 0.3) * 0.8;
  const top = shoot(armor, [0.3, 10.95, zBevel], [0.3, -9.05, zBevel]);
  assert.ok(top.collisionFace.plate.name === 'roof' && top.plate.name === 'roof', 'top attack on the bevel reads the roof');
  const dive = shoot(armor, [0.3, 0.95 + 6, zBevel + 6], [0.3, 0.95 - 6, zBevel - 6]);
  assert.ok(dive.collisionFace.plate.name === 'roof' && dive.plate.name === 'roof', 'a 45-degree dive on the bevel reads the roof');
  const flank = shoot(armor, [10, 0.5, 0.5], [-10, 0.5, 0.5]);
  assert.equal(flank.plate.name, 'side_R', 'a flank round on the side reads the side');
  const quarter = shoot(armor, [6, 0.5, 6.2], [-6, 0.5, -5.8]);
  assert.ok(quarter.plate === quarter.collisionFace.plate, `a quartering round keeps the plate facing it (${quarter.plate.name})`);
  const head = shoot(armor, [0.3, 0.5, 10], [0.3, 0.5, -10]);
  assert.equal(head.plate.name, 'front', 'the front reads the front');
  // a mantlet nearestPlate handed the whole front: over its window the mantlet, off it the front
  const gunArmor = model(mantlet);
  const overGun = shoot(gunArmor, [0, 0.55, 10], [0, 0.55, -10]);
  assert.ok(overGun.collisionFace.plate.name === 'mantlet' && overGun.plate.name === 'mantlet', 'over its window the mantlet');
  const offGun = shoot(gunArmor, [0.6, 0.55, 10], [0.6, 0.55, -10]);
  assert.ok(offGun.collisionFace.plate.name === 'mantlet' && offGun.plate.name === 'front', 'off its window the front across the round');
}

// ---- the fleet's head-on grids: every hit whose plate faces its round keeps it; every other reads the plate along it
await import('../vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../vehicles/specs.ts');
const zonesOf = new Map();
const frameZones = (plates) => { let zones = zonesOf.get(plates); if (!zones) { zones = zonePlates(plates); zonesOf.set(plates, zones); } return zones; };
const envelope = (plates) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of plates || []) if ((p.kind || 'main') === 'main') for (const v of p.verts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
  return { min, max };
};
const tally = {};
for (const id of ['leo2a5m', 't72b3', 'm1a2_abrams', 't90m', 'kf51_panther']) {
  const armor = TANK_SPECS[id].armor, pivot = armor.turretPivot || [0, 0, 0];
  const t = envelope(armor.turretPlates), h = envelope(armor.hullPlates);
  const grids = [
    { name: 'turret', x0: t.min[0], x1: t.max[0], y0: Math.max(t.min[1] + pivot[1], t.max[1] + pivot[1] - 0.75), y1: t.max[1] + pivot[1], z: t.max[2] + pivot[2] },
    { name: 'hull', x0: h.min[0], x1: h.max[0], y0: h.min[1], y1: h.max[1], z: h.max[2] },
  ];
  const counts = (tally[id] = { hits: 0, moved: 0, pairs: {}, bevelEntries: [] });
  for (const grid of grids) for (const deg of [0, 15, -15, 30, -30]) {
    const a = (deg * Math.PI) / 180, d = [-Math.sin(a), 0, -Math.cos(a)];
    for (let x = grid.x0 + 0.05; x < grid.x1; x += 0.1) for (let y = grid.y0 + 0.025; y < grid.y1; y += 0.05) {
      const aim = [x, y, grid.z - 0.3];
      const hit = shoot(armor, aim.map((v, k) => v - 25 * d[k]), aim.map((v, k) => v + 6 * d[k]));
      if (!hit) continue;
      counts.hits++;
      const face = hit.collisionFace, px = hit.impactLocalX, py = hit.impactLocalY, pz = hit.impactLocalZ;
      const own = face.gunSplit ? gunFaceSplitPlate(face.gunSplit, px, py, pz) : face.plate;
      const zones = frameZones(hit.impactFrame === 'turret' ? armor.turretPlates : armor.hullPlates);
      const index = zones.findIndex((zone) => zone.plate === own);
      const along = zones[zoneAlongShot(zones, index, px, py, pz, hit.impactLocalDirX, hit.impactLocalDirY, hit.impactLocalDirZ)].plate;
      assert.equal(hit.plate, along, `${id} ${grid.name}@${deg} (${x.toFixed(2)}, ${y.toFixed(3)}): the plate along the round`);
      if (hit.plate === own) continue;
      counts.moved++;
      const key = `${own.name}>${hit.plate.name}`;
      counts.pairs[key] = (counts.pairs[key] || 0) + 1;
      if (id === 'kf51_panther' && deg === 0 && key === 'turret_roof>turret_front') counts.bevelEntries.push({ point: hit.point.clone(), face });
    }
  }
}
const pairs = (id, pattern) => Object.entries(tally[id].pairs).filter(([key]) => pattern.test(key)).reduce((n, [, v]) => n + v, 0);
// the census (267): the KF51's front-top is 56% of its head-on turret hits, the Leopard's bevels 42%
assert.ok(pairs('kf51_panther', /^turret_roof>turret_front$/) > 500, `the KF51's front-top reads its front (${JSON.stringify(tally.kf51_panther.pairs)})`);
assert.ok(pairs('leo2a5m', /^turret_roof>turret_cheek_[LR]$/) > 300, `the Leopard 2A5M's bevels read its cheeks (${JSON.stringify(tally.leo2a5m.pairs)})`);
assert.ok(pairs('leo2a5m', /^mantlet>turret_cheek_[LR]$/) > 0, 'its off-window mantlet faces read its cheeks');
assert.ok(pairs('t72b3', /^turret_roof>turret_cheek_[LR]$/) > 0 && pairs('t90m', /^turret_roof>turret_cheek_[LR]$/) > 0
  && pairs('m1a2_abrams', /^turret_roof>turret_cheek_[LR]$/) > 0, 'the T-72B3\'s, T-90M\'s and M1A2\'s bevels read their cheeks');
for (const id of Object.keys(tally)) assert.ok(tally[id].moved < tally[id].hits / 2, `${id}: most hits keep their face's plate (${tally[id].moved} of ${tally[id].hits})`);
// the KF51's front-top from above (a 60-degree dive from the bow at the same entries) reads its roof
{
  const armor = TANK_SPECS.kf51_panther.armor;
  const down = new Vector3(0, -Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3));
  let same = 0;
  for (const { point, face } of tally.kf51_panther.bevelEntries) {
    const hit = shoot(armor, point.clone().addScaledVector(down, -8).toArray(), point.clone().addScaledVector(down, 3).toArray());
    if (!hit || hit.collisionFace !== face) continue;
    same++;
    assert.equal(hit.plate.name, 'turret_roof', 'a dive on the KF51\'s front-top reads its roof');
  }
  assert.ok(same > 20, `the dives met the same faces (${same} of ${tally.kf51_panther.bevelEntries.length})`);
}
console.log(`armorAlongShot: bevel cell and controls; fleet grids ${Object.entries(tally).map(([id, c]) => `${id} ${c.moved}/${c.hits}`).join(', ')}`);
