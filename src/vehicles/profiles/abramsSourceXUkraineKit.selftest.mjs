import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildAbramsX } from './abramsSourceX.ts';
import { getSpec } from '../specs.ts';
import { UA_ERA_PLATE_NAMES } from '../abramsSourceXUkraineEraArmor.ts';

// M1A2 Abrams UA field kit (owner 2026-09-15): the Ukrainian study alone wears Kontakt-1
// cassettes on the turret cheeks, flanks and glacis, ARAT-style skirt cassettes, a roof cage,
// a bustle slat screen, jammer masts and stowage. Parts are captured at the builder port by
// their kit tag, then checked for count, ownership and envelope on the finished tank.

function capture(id) {
  const parts = [];
  registerProfiledBuilders({ [id]: (P) => buildAbramsX(new Proxy(P, {
    get(target, key) {
      if (key === 'add' || key === 'addEquipment') {
        return (bucket, geometry, x = 0, y = 0, z = 0) => {
          if (geometry.userData.uaKit) {
            geometry.computeBoundingBox();
            const b = geometry.boundingBox;
            parts.push({ part: geometry.userData.uaKit, bucket, owner: target.turretG === target.turretG ? null : null,
              min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z],
              method: key });
          }
          return target[key](bucket, geometry, x, y, z);
        };
      }
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  })) });
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', batchStatic: false });
  return { parts, tank };
}

const { parts, tank } = capture('ua_m1a1_x');
const count = (part) => parts.filter((p) => p.part === part).length;
assert.equal(count('turret-brick'), (7 * 3 * 2 + 4 * 3 * 2) * 2, 'flank and cheek cassettes with lids');
assert.equal(count('glacis-brick'), 3 * 5 * 2 * 2, 'two glacis banks with lids');
assert.equal(count('skirt-cassette'), 16, 'eight skirt cassettes per side');
assert.equal(count('skirt-cassette-stud'), 32);
assert.equal(count('cage-post'), 8); assert.equal(count('cage-frame'), 4);
assert.equal(count('cage-rod'), 13 + 21, 'rod lattice over the whole roof');
assert.equal(count('slat'), 27); assert.equal(count('slat-rail'), 2); assert.equal(count('slat-bracket'), 2);
assert.ok(count('jammer') >= 7 && count('crate') === 4 && count('net-roll') === 1 && count('tarp-roll') === 2, 'jammers and stowage');

// envelope: nothing wider than the TUSK urban-armour width, nothing above the antenna top
const turretFrameY = 1.513295;
for (const p of parts) {
  const owner = /skirt|glacis|tarp|track-shoes/.test(p.part) ? 'hull' : 'turret';
  const lift = owner === 'turret' ? turretFrameY : 0;
  assert.ok(Math.max(Math.abs(p.min[0]), Math.abs(p.max[0])) <= 2.04, `${p.part}: inside 4.08 m`);
  assert.ok(p.max[1] + lift <= 3.6, `${p.part}: below the antenna span`);
  assert.ok(p.min[1] + lift >= 0.55, `${p.part}: above the skirt bottom`);
}
// the cage stands on the roof and the slat screen hangs behind the bustle bags
const cage = parts.filter((p) => p.part === 'cage-rod');
assert.ok(Math.min(...cage.map((p) => p.min[1])) + turretFrameY > 2.85, 'cage lattice clears the roof equipment');
const slats = parts.filter((p) => p.part === 'slat');
assert.ok(Math.max(...slats.map((p) => p.max[2])) + .392712 < -3.3, 'slats sit behind the bustle stowage');
const meshes = []; tank.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
assert.ok(meshes.length > 0, 'the kitted tank builds');

// Every cassette seats on the outer face of its gameplay zone (abramsSourceXUkraineEraArmor.ts
// mirrors the kit's planes and course extents): a body centre lies half a cassette behind the
// plate plane, a backing rim (added as equipment, 6 mm off the plane) 74 mm behind it, and both
// project inside the plate rectangle, so a hit on the visible cassette is a hit on the bank.
const armor = getSpec('ua_m1a1_x').armor;
const zones = [...armor.hullPlates.map((plate) => ({ owner: 'hull', plate })),
  ...armor.turretPlates.map((plate) => ({ owner: 'turret', plate }))].filter(({ plate }) => plate.kind === 'era');
// finalized anatomy expands every bank into one record per physical face; all records carry the bank name
assert.deepEqual([...new Set(zones.map((z) => z.plate.name))].sort(), [...UA_ERA_PLATE_NAMES].sort(), 'the eight kit banks are the study\'s only reactive zones');
const frame = (plate) => {
  const [p0, p1, , p3] = plate.verts.map((v) => new T.Vector3(...v));
  const u = p1.clone().sub(p0), v = p3.clone().sub(p0);
  return { p0, u, v, n: u.clone().cross(v).normalize(), uLen: u.length(), vLen: v.length() };
};
const seating = { 'turret-brick': [.035, .080 - .006], 'glacis-brick': [.035, .080 - .006], 'skirt-cassette': [.19032 / 2] };
let seated = 0, rims = 0;
for (const p of parts) {
  const depth = seating[p.part]?.[p.method === 'add' ? 0 : 1];
  if (depth === undefined) continue;
  const owner = /skirt|glacis/.test(p.part) ? 'hull' : 'turret';
  const c = new T.Vector3((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
  const fits = zones.filter((z) => z.owner === owner).map(({ plate }) => {
    const f = frame(plate), d = c.clone().sub(f.p0);
    return { plate, gap: d.dot(f.n), s: d.dot(f.u) / (f.uLen * f.uLen), t: d.dot(f.v) / (f.vLen * f.vLen) };
  }).filter((fit) => Math.abs(fit.gap) < .15 && fit.s > -.001 && fit.s < 1.001 && fit.t > -.001 && fit.t < 1.001);
  const names = [...new Set(fits.map((fit) => fit.plate.name))];
  assert.equal(names.length, 1, `${p.part} at ${c.toArray().map((x) => x.toFixed(3))}: projects inside exactly one ${owner} bank (${names})`);
  assert.ok(fits.some((fit) => Math.abs(fit.gap + depth) < .002), `${p.part}: centre ${depth.toFixed(3)} m behind ${names[0]} (${fits.map((fit) => fit.gap.toFixed(4))})`);
  if (p.method === 'add') seated++; else rims++;
}
assert.equal(seated, 66 + 30 + 16, 'every cassette body is seated on a bank');
assert.equal(rims, 66 + 30, 'every backing rim sits under its bank');
// and the finished tank binds every course to its bank: one owner per zone, kit sectors covered
const binding = tank.root.userData.eraVisualBindingReceipt;
assert.deepEqual([...new Set((binding?.plates || []).map((row) => row.name))].sort(), [...UA_ERA_PLATE_NAMES].sort(), 'eight gameplay zone bindings');
for (const row of binding.plates) {
  assert.ok(row.registered && row.ownerMatches && row.partCount > 0, `${row.name}: bound to visible cassettes`);
  assert.ok(row.visualSectors.length === 1 && /^ua-m1a2-(k1-turret|k1-glacis|skirt)-era$/.test(row.visualSectors[0]), `${row.name}: one kit sector (${row.visualSectors})`);
}
const sectors = new Set(binding.plates.flatMap((row) => row.visualSectors));
assert.deepEqual([...sectors].sort(), ['ua-m1a2-k1-glacis-era', 'ua-m1a2-k1-turret-era', 'ua-m1a2-skirt-era'], 'every kit course is a depletable bank');

// no other study wears the kit
const { parts: plain } = capture('m1a2_x');
assert.equal(plain.length, 0, 'the M1A2 study carries no Ukrainian kit');
console.log(`abramsSourceXUkraineKit: ${parts.length} kit parts on the M1A2 Abrams UA (bricks, skirt cassettes, cage, slats, jammers, stowage), ${seated} cassettes seated on ${new Set(zones.map((z) => z.plate.name)).size} gameplay ERA banks (${zones.length} finalized faces); the M1A2 study stays clean PASS`);
