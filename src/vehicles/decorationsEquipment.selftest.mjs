import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECOR_KITS,
  FLEET_EQUIPMENT_VARIANTS,
  attachTankDecorations,
  decorManifestFor,
  fleetEquipmentNationStyle,
  isDecorRunningGearName,
  resolveDecorMode,
  roofMountEuler,
  roofMountPosition,
  surfaceMountEuler,
} from './decorations.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';

assert.ok(FLEET_EQUIPMENT_VARIANTS.length >= 20,
  `fleet cargo vocabulary has ${FLEET_EQUIPMENT_VARIANTS.length} variants; expected at least 20`);
assert.equal(new Set(FLEET_EQUIPMENT_VARIANTS).size, FLEET_EQUIPMENT_VARIANTS.length,
  'fleet cargo variant ids are unique');
assert.equal(resolveDecorMode({ proceduralOnly: true }), false,
  'unadorned procedural metrology builds remain bare by default');
assert.equal(resolveDecorMode({ proceduralOnly: true, decor: true }), true,
  'the first-party gallery can explicitly show procedural field equipment');

const signatures = new Set();
for (const variant of FLEET_EQUIPMENT_VARIANTS) {
  const parts = DECOR_KITS.cargo({ rng: () => 0.37, v: variant });
  assert.ok(parts.length >= 2, `${variant}: cargo is more than one anonymous primitive`);
  const bounds = new THREE.Box3();
  let vertices = 0;
  for (const part of parts) {
    assert.ok(part.geo.attributes.position?.count > 0, `${variant}: every part owns geometry`);
    part.geo.computeBoundingBox();
    assert.ok(part.geo.boundingBox, `${variant}: every part computes a bounding box`);
    bounds.union(part.geo.boundingBox);
    vertices += part.geo.attributes.position.count;
  }
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 0.08 && size.y > 0.08 && size.z > 0.04,
    `${variant}: cargo has a visible three-dimensional silhouette`);
  signatures.add(`${parts.map((part) => part.mat).join(',')}:${vertices}:`
    + `${size.x.toFixed(3)}:${size.y.toFixed(3)}:${size.z.toFixed(3)}`);
  for (const part of parts) part.geo.dispose();
}
assert.ok(signatures.size >= 20,
  `${signatures.size} distinct geometry/material signatures cover the 20-variant floor`);

const cooler = DECOR_KITS.cargo({ rng: () => 0.37, v: 'beer-cooler-blue' });
const coolerColors = cooler
  .filter((part) => part.mat === 'cans' && part.geo.attributes.color)
  .map((part) => {
    const color = part.geo.attributes.color;
    const sum = [0, 0, 0];
    for (let i = 0; i < color.count; i++) {
      sum[0] += color.getX(i); sum[1] += color.getY(i); sum[2] += color.getZ(i);
    }
    return sum.map((value) => value / color.count);
  });
// 2026-10-06 (tank-accessories round 2): the blind critics read the blue cooler with its grey lid as a toy-coloured
// civilian box; crews carry it in issue colours, an olive-drab body under a lighter olive lid.
assert.ok(coolerColors.some(([r, g, b]) => g >= r && g > b * 1.3),
  'beer cooler owns an olive-drab insulated body');
assert.ok(coolerColors.every(([r, g, b]) => b <= Math.max(r, g)),
  'beer cooler carries no blue anywhere');
const shade = ([r, g, b]) => r + g + b;
assert.ok(Math.max(...coolerColors.map(shade)) - Math.min(...coolerColors.map(shade)) > 0.01,
  'beer cooler owns a separate, lighter lid');
assert.ok(coolerColors.every(([r, g, b]) => Math.max(r, g, b) < 0.78),
  'beer cooler avoids bright high-contrast authored colors');
// round 5 (2026-10-08, the coordinator: "military kit only"): the cooler is an olive insulated container with steel
// latches and pressed ribs; the civilian drain plug and raised lid panel are gone
assert.ok(cooler.length >= 10,
  `the insulated container is a molded body and lid with latches, hinges, grips and pressed ribs (${cooler.length} parts)`);
// 2026-10-05 (tank-accessories lane): molded stock, not twelve-triangle blocks — the body and lid carry filleted
// edges, so their normals take many directions instead of the six axis faces of a box.
const moldedFaces = cooler.filter((part) => part.mat === 'cans').map((part) => {
  const normal = part.geo.attributes.normal;
  const directions = new Set();
  for (let i = 0; i < normal.count; i++) {
    directions.add(`${normal.getX(i).toFixed(2)},${normal.getY(i).toFixed(2)},${normal.getZ(i).toFixed(2)}`);
  }
  return directions.size;
});
assert.ok(moldedFaces.filter((count) => count > 12).length >= 2,
  'cooler body and lid are filleted molded shells (more than twelve normal directions each)');
for (const part of cooler) part.geo.dispose();

// Every cargo variant authors a coarse level (the far LOD and the mobile tier): the same envelope from no more
// triangles, built from an identically seeded stream that both levels consume the same way.
const tri = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
for (const variant of FLEET_EQUIPMENT_VARIANTS) {
  const draws = { 1: 0, 0: 0 };
  const build = (detail) => {
    let a = 0x51f15e;
    const rng = () => { draws[detail]++; a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    return DECOR_KITS.cargo({ rng, v: variant, detail });
  };
  const near = build(1), coarse = build(0);
  const measure = (parts) => {
    const box = new THREE.Box3();
    let triangles = 0;
    for (const part of parts) {
      part.geo.computeBoundingBox();
      box.union(part.geo.boundingBox);
      triangles += tri(part.geo);
    }
    return { box, triangles, size: box.getSize(new THREE.Vector3()) };
  };
  const n = measure(near), c = measure(coarse);
  assert.equal(draws[1], draws[0], `${variant}: near and coarse levels consume the same random draws`);
  assert.ok(c.triangles <= n.triangles, `${variant}: coarse level is no heavier (${c.triangles} vs ${n.triangles})`);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(c.size[axis] >= n.size[axis] * 0.8 && c.size[axis] <= n.size[axis] * 1.05 + 0.01,
      `${variant}: coarse ${axis} envelope ${c.size[axis].toFixed(3)} matches near ${n.size[axis].toFixed(3)}`);
  }
  assert.ok(n.triangles <= 700, `${variant}: near level stays inside the per-piece budget (${n.triangles})`);
  for (const part of [...near, ...coarse]) part.geo.dispose();
}

for (const variant of ['nato-fuel-can', 'blue-water-can', 'twin-can-cradle']) {
  const pair = DECOR_KITS.cargo({ rng: () => 0.37, v: variant });
  const bodies = pair.filter((part) => part.mat === 'cans');
  assert.ok(bodies.length >= 12, `${variant}: portable vessel variant contains a modeled pair`);
  const bounds = new THREE.Box3();
  for (const part of pair) {
    part.geo.computeBoundingBox();
    bounds.union(part.geo.boundingBox);
    part.geo.dispose();
  }
  assert.ok(bounds.max.x - bounds.min.x >= 0.38,
    `${variant}: paired vessels occupy a visibly two-can cradle`);
}

const extinguisher = DECOR_KITS.cargo({
  rng: () => 0.37,
  v: 'fire-extinguisher',
  nation: 'USA',
});
const extinguisherBounds = new THREE.Box3();
for (const part of extinguisher) {
  part.geo.computeBoundingBox();
  extinguisherBounds.union(part.geo.boundingBox);
  part.geo.dispose();
}
const extinguisherSize = extinguisherBounds.getSize(new THREE.Vector3());
assert.ok(extinguisherSize.x > extinguisherSize.y * 1.7,
  'fleet fire extinguishers rest horizontally instead of standing upright');
assert.ok(extinguisherBounds.min.y >= -0.005,
  'horizontal extinguisher and its cradle remain planted at the seat plane');

const nationStyles = new Set([
  'USA', 'UK', 'Germany', 'France', 'Italy', 'Sweden', 'Poland',
  'Russia', 'Ukraine', 'China', 'Israel',
].map((nation) => fleetEquipmentNationStyle(nation)));
assert.equal(nationStyles.size, 11,
  'major fleet nations resolve to distinct field-equipment palette families');
const averageCargoColor = (nation) => {
  const parts = DECOR_KITS.cargo({
    rng: () => 0.37,
    v: 'fifty-cal-ammo-can',
    nation,
  });
  const sums = [0, 0, 0];
  let count = 0;
  for (const part of parts) {
    if (part.mat === 'cans' && part.geo.attributes.color) {
      const color = part.geo.attributes.color;
      for (let i = 0; i < color.count; i++) {
        sums[0] += color.getX(i); sums[1] += color.getY(i); sums[2] += color.getZ(i);
        count++;
      }
    }
    part.geo.dispose();
  }
  return sums.map((value) => value / Math.max(1, count));
};
const americanCargo = averageCargoColor('USA');
const sovietCargo = averageCargoColor('Russia');
assert.ok(americanCargo.some((value, index) => Math.abs(value - sovietCargo[index]) > 0.004),
  'the same shared cargo primitive receives a visibly distinct national finish');

const basket = DECOR_KITS.basket({ rng: () => 0.37, w: 1.35, d: 0.44, h: 0.34 });
assert.ok(basket.length >= 30,
  `shared decorative basket exposes a real lattice and shaped cargo (${basket.length} parts)`);
assert.ok(!basket.some((part) => part.geo instanceof THREE.PlaneGeometry),
  'decorative basket no longer uses opaque/texture-plane proxy walls');
// 2026-10-07 (tank-accessories round 3): the tarp roll's rolled ends are one wound spiral each instead of two
// concentric eight-segment rings each (the critics read those rings as facets), so the canvas parts are the two
// duffels, the tarp roll and its two spiral ends; the floor moves from seven parts to five with the same contents.
assert.ok(basket.filter((part) => part.mat === 'canvas').length >= 5,
  'decorative basket includes shaped packs, flaps, pockets, straps, and a tarp roll');
assert.equal(basket.meta?.basket, true, 'decorative basket retains placement metadata');
for (const part of basket) part.geo.dispose();

const spareTracks = DECOR_KITS.tracks({ rng: () => 0.37, n: 5, linkW: 0.48 });
assert.equal(spareTracks.meta?.continuousCarrier, true,
  'spare-track runs declare a continuous armor carrier');
assert.ok(spareTracks.filter((part) => part.mat === 'kit').length >= 6,
  'spare-track runs include two carrier rails and four welded mounting feet');
const spareTrackBounds = new THREE.Box3();
for (const part of spareTracks) {
  part.geo.computeBoundingBox();
  spareTrackBounds.union(part.geo.boundingBox);
}
assert.ok(spareTrackBounds.min.z < -0.02 && spareTrackBounds.max.z > 0.07,
  'spare-track carrier crosses the seat plane while links project above it');
assert.ok(spareTrackBounds.max.y - spareTrackBounds.min.y < 0.76,
  'five-link run stays compact without separated stair-step links');
for (const normal of [
  new THREE.Vector3(0, 0.62, 0.78),
  new THREE.Vector3(0.94, 0.24, 0.24),
  new THREE.Vector3(-0.91, 0.16, 0.38),
  new THREE.Vector3(0, 0, 1),
]) {
  const mountedNormal = new THREE.Vector3(0, 0, 1)
    .applyEuler(surfaceMountEuler(normal));
  assert.ok(mountedNormal.dot(normal.clone().normalize()) > 0.999999,
    `spare-track mount normal aligns to ${normal.toArray().join(',')}`);
}
for (const part of spareTracks) part.geo.dispose();

// Tow cables are authored along X on a Y=0 clamp plane. Side mounts must
// keep that long axis fore-aft on either side of the hull.
for (const side of [-1, 1]) {
  const normal = new THREE.Vector3(side, 0, 0);
  const rotation = roofMountEuler(normal, Math.PI / 2);
  const run = new THREE.Vector3(1, 0, 0).applyEuler(rotation);
  assert.ok(Math.abs(run.z) > .999999 && Math.abs(run.y) < 1e-6,
    `side ${side}: tow cable runs along the hull`);
  assert.ok(new THREE.Vector3(0, 1, 0).applyEuler(rotation).dot(normal) > .999999,
    `side ${side}: clamp bases face the armor`);
  const oldRun = new THREE.Vector3(1, 0, 0)
    .applyEuler(new THREE.Euler(0, Math.PI / 2, side * 1.35));
  assert.ok(Math.abs(oldRun.y) > .97, 'negative control reproduces the upright cable');
}

const distributed = new Set();
for (const id of ALL_TANK_IDS) {
  // 259: the Strv 103s carry their own period kit (below), never the fleet's cargo pools
  if (id === 'strv103a' || id === 'strv103b') continue;
  // 262: the Type 74 and the STB-1 carry their sourced equipment in their builders (below)
  if (id === 'type74' || id === 'stb1') continue;
  const manifest = decorManifestFor(getSpec(id), () => 0.5);
  const cargo = manifest.filter((row) => row.kit === 'cargo' && (row.p ?? 1) > 0);
  assert.equal(cargo.length, 7, `${id}: deterministic manifest includes a seven-piece field load`);
  assert.equal(new Set(cargo.map((row) => row.v?.v)).size, 7,
    `${id}: equipment set does not repeat the same prop`);
  assert.ok(cargo.every((row) => row.slot[0] === 'fleetCargo'
    && row.slot[1].routes.length >= 4),
  `${id}: equipment owns its required placement route network`);
  assert.ok(cargo.every((row) => row.v?.nation === getSpec(id).nation),
    `${id}: field equipment inherits the vehicle nation palette`);
  const preferred = cargo.map((row) => row.slot[1].routes[0]);
  assert.deepEqual([...new Set(preferred.map((route) => route[0]))].sort(),
    ['hullRearRack', 'turretRear'].sort(),
    `${id}: preferred equipment stays on the bustle and hull rear rack`);
  const routeStations = new Set(cargo.flatMap((row) => row.slot[1].routes.map((route) => route[0])));
  assert.deepEqual([...routeStations].sort(),
    ['fender', 'hullRearRack', 'rearDeck', 'turretRear', 'turretRoof', 'turretSide'].sort(),
    `${id}: fallback network covers aft equipment stations only`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'turretRoof' || args.rear === true)),
  `${id}: every turret-roof fallback is on the rear roof`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'rearDeck' || args.back === true)),
  `${id}: every hull-deck fallback is on the rear engine deck`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'turretSide' || args.rear === true)),
  `${id}: every turret-side fallback stays on the rear quarter`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'fender' || args.zFrac < 0)),
  `${id}: every fender fallback stays aft of the turret`);
  for (const row of cargo) distributed.add(row.v?.v);
}
// 2026-09-23: only the retired curated loadouts (tiger1, t34_85, m4a3e8, isu152, is7,
// merkava4) placed these four variants; the vocabulary stays for future manifests.
// 2026-10-07 (tank-accessories round 4, waves 215 and 217: a cable spool is not crew kit, camp chairs read as toys): no
// loadout carries the reel or the chair.
const UNPLACED_VARIANTS = new Set(['cooler-red', 'twin-can-cradle', 'spare-optics-case', 'thermos-crate', 'cable-reel',
  'folding-chair']);
for (const v of UNPLACED_VARIANTS) assert.ok(!distributed.has(v), `${v}: no playable loadout places it today`);
assert.equal(distributed.size, FLEET_EQUIPMENT_VARIANTS.length - UNPLACED_VARIANTS.size,
  `${distributed.size} cargo variants are visibly distributed across the playable fleet`);

// 259 (owner on the Strv 103s: "make all its deocrations specialized and customized heheh for both a and b"): each
// S-tank carries its own period kit (decorations.ts STRV103_DECOR), every load at a measured flat roof point or on its
// fender, none from the fleet cargo pools and none on the virtual turret rig.
// (a stub spec: this receipt's module graph registers the base fleet only, and the 103A is a Swedish fleet row)
const strvSpec = (id) => ({ id, nation: 'Sweden', era: 'cold-war', armor: { turretless: true } });
for (const [id, kits] of [['strv103a', ['tools', 'tarp', 'bin', 'jerry', 'packs']], ['strv103b', ['camonet', 'jerry', 'bin', 'packs']]]) {
  const manifest = decorManifestFor(strvSpec(id), () => 0.5);
  assert.deepEqual(manifest.map((row) => row.kit), kits, `${id}: its own field kit, in order`);
  assert.ok(manifest.every((row) => (row.p ?? 1) === 1 && (row.slot[0] === 'hullRoof' || row.slot[0] === 'fender')),
    `${id}: every load is always carried, at a measured roof point or on a fender`);
  const roof = manifest.filter((row) => row.slot[0] === 'hullRoof').map((row) => row.slot[1]);
  assert.ok(roof.every((a, i) => roof.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 0.6)),
    `${id}: the roof loads keep 0.6 m apart`);
}
assert.notDeepEqual(decorManifestFor(strvSpec('strv103a'), () => 0.5), decorManifestFor(strvSpec('strv103b'), () => 0.5),
  'the 103A and the 103B carry different kits');

// 262: the production Type 74 keeps only its crew packs in the bustle basket; the trials STB-1 carries no field load
// (stub specs, as above: the Japanese rows register lazily)
const japanSpec = (id) => ({ id, nation: 'Japan', era: 'cold-war' });
assert.deepEqual(decorManifestFor(japanSpec('type74'), () => 0.5).map((row) => [row.kit, row.slot[0]]), [['packs', 'turretRear']],
  'type74: its crew packs in the bustle basket, nothing from the cargo pools');
assert.deepEqual(decorManifestFor(japanSpec('stb1'), () => 0.5), [], 'stb1: the trials prototype carries no field load');

const annotatedRoofHit = {
  p: new THREE.Vector3(-0.80187, 1.82439, -0.19998),
  n: new THREE.Vector3(0.04172, 0.99863, 0.03153).normalize(),
  dist: 0,
};
const strvCanParts = DECOR_KITS.cargo({
  rng: () => 0.37,
  v: 'blue-water-can',
  nation: 'Sweden',
});
const strvCanRotation = roofMountEuler(annotatedRoofHit.n, 0.013);
const mountedUp = new THREE.Vector3(0, 1, 0).applyEuler(strvCanRotation);
assert.ok(mountedUp.dot(annotatedRoofHit.n) > 0.999999,
  'roof cargo base normal follows the annotated Strv roof skin');
const strvCanPosition = roofMountPosition(strvCanParts, annotatedRoofHit, 0.004);
const strvCanBounds = new THREE.Box3();
for (const part of strvCanParts) {
  part.geo.computeBoundingBox();
  strvCanBounds.union(part.geo.boundingBox);
  part.geo.dispose();
}
const strvCanBase = strvCanPosition.clone()
  .addScaledVector(annotatedRoofHit.n, strvCanBounds.min.y);
assert.ok(Math.abs(strvCanBase.sub(annotatedRoofHit.p).dot(annotatedRoofHit.n) + 0.004) < 1e-7,
  'Strv 103B can cradle embeds 4 mm into the roof carrier instead of floating');

// Release 262: the M48A5 is rebuilt from the owner's model with its complete equipment (pattonCast.ts); the era field
// load (a second roof M2, a third whip, a roof lamp, a turret-side tarp, cargo) gives way to the functional smoke pair.
const m48a5_patton = {
  id: 'm48a5_patton', nation: 'USA', era: 'cold-war',
  dims: { widthM: 3.63, heightM: 3.09, hullLengthM: 6.95, overallLengthM: 9.30 },
  armor: { turretless: false },
};
for (const randomValue of [.13, .5, .87]) {
  assert.deepEqual(decorManifestFor(m48a5_patton, () => randomValue),
    [{ kit: 'smoke', p: 1, v: { v: '6' }, slot: ['turretCheekPair', {}] }],
    'the model-authored M48A5 keeps only its smoke pair over its own racks, guns and whips');
}

const uaM1A1 = {
  id: 'ua_m1a1', nation: 'Ukraine', era: 'modern',
  dims: { widthM: 3.66, heightM: 2.44, hullLengthM: 7.93, overallLengthM: 9.83 },
  armor: { turretless: false },
};
const uaCargo = decorManifestFor(uaM1A1, () => 0.5);
assert.equal(uaCargo.length, 1, 'Ukrainian M1A1 generic decor is reduced to one useful cargo item');
assert.equal(uaCargo[0].kit, 'cargo');
assert.equal(uaCargo[0].v?.v, 'twin-can-cradle',
  'Ukrainian M1A1 retains only a paired gas-can cradle');
assert.ok(!uaCargo.some((row) => row.v?.v === 'folding-chair'),
  'Ukrainian M1A1 no longer receives the chair-like field prop');

// Resolve the two real registered variants after the baseline cargo fixture
// sweep, including their independently authored identity and dimensions.
await import('./fleetFactory.ts');
for (const randomValue of [.13, .5, .87]) {
  assert.deepEqual(decorManifestFor(getSpec('tos1a_tagil'), () => randomValue), [],
    'the authored battery never receives static turret-roof hatches or cargo');
}
assert.equal(decorManifestFor(getSpec('griffin_viper'), () => .5)
  .find(row => row.kit === 'cable').slot[0], 'hullSideCable',
'Viper uses its measured horizontal cable seat');
assert.equal(decorManifestFor(getSpec('griffin50mm'), () => .5)
  .find(row => row.kit === 'cable').slot[0], 'hullSideTop',
'Viper repair preserves the source Griffin equipment layout');
const revolutionManifest = decorManifestFor(getSpec('leo2_revolution'), () => 0.5);
assert.deepEqual(revolutionManifest, [{
  kit: 'tools', p: 1, v: { set: ['shovel', 'crowbar'] },
  slot: ['fender', { side: -1, zFrac: -0.31, along: true }],
}], 'Revolution retains only its paired tools on the aft left fender, clear of the RWS and EMES recess');
assert.equal(revolutionManifest.some((row) => row.kit === 'cargo'), false,
  'Revolution has no generic cargo over its source-authored equipment');
assert.deepEqual(decorManifestFor(getSpec('leo2_revolution_proto'), () => 0.5), revolutionManifest,
  'redesigned Proto leaves its authored turret unobstructed and keeps only the fender tools');

// Exercise the real attachment path: no generic cargo or roof weapons may
// return on top of the complete owner-authored prototype turret.
const decorRoot = new THREE.Group();
const decorHull = new THREE.Group();
const decorTurret = new THREE.Group();
decorRoot.add(decorHull, decorTurret);
decorTurret.position.fromArray(getSpec('leo2_revolution_proto').armor.turretPivot);
const decorMaterial = new THREE.MeshBasicMaterial();
const decorHullGeometry = new THREE.BoxGeometry(4, 1.2, 7.72);
const decorTurretGeometry = new THREE.BoxGeometry(3, 1, 3.5);
decorHull.add(new THREE.Mesh(decorHullGeometry, decorMaterial));
decorTurret.add(new THREE.Mesh(decorTurretGeometry, decorMaterial));
const originalKits = { ...DECOR_KITS };
const builtKits = [];
const decorDisposables = [];
try {
  for (const key of Object.keys(originalKits)) DECOR_KITS[key] = () => {
    builtKits.push(key);
    return null;
  };
  assert.ok(attachTankDecorations({
    root: decorRoot, hullG: decorHull, turretG: decorTurret,
    spec: getSpec('leo2_revolution_proto'), engineCtx: null,
    disposables: decorDisposables, opts: { proceduralOnly: true, decor: true },
  }), 'the redesigned Proto runs the real decoration attachment path');
  assert.deepEqual(builtKits, ['tools'], 'runtime decoration does not rebuild the retired roof clutter');
} finally {
  Object.assign(DECOR_KITS, originalKits);
  for (const disposable of decorDisposables) disposable.dispose?.();
  decorHullGeometry.dispose();
  decorTurretGeometry.dispose();
  decorMaterial.dispose();
}

// Decor never probes or seats on running gear, but the track GUARDS (mudguards, side skirts) are hull equipment it
// must seat on and be blocked by (2026-10-05: the bare /track/ caught hullTrackGuardL/R, so a side piece could seat on
// the hull behind a skirt and the skirt's bucket decided admission; burlakFixedSidePaint.selftest is the fleet case).
for (const name of ['gearTrackBandL', 'gearTrackPads', 'gearTrackPadsSimplified', 'trackL', 'track_R',
  'hullRunningGearTrack', 'roadWheelsL', 'sprocketR', 'idlerL', 'returnRollerR']) {
  assert.equal(isDecorRunningGearName(name), true, `${name} is running gear`);
}
for (const name of ['hullTrackGuardL', 'hullTrackGuardR', 'hull', 'turret', 'hullExternalArmor']) {
  assert.equal(isDecorRunningGearName(name), false, `${name} is a decor support and obstacle`);
}

console.log(`decorationsEquipment.selftest: ${FLEET_EQUIPMENT_VARIANTS.length} authored variants, `
  + `${signatures.size} geometry signatures, ${distributed.size} playable-fleet variants passed`);
