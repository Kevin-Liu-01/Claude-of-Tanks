// First-party procedural AFV family.
//
// The owner-supplied GLBs are six-view silhouette/equipment oracles only.
// Each playable below retains one certified suspension-driven smart course
// from its closest native family, then authors the vehicle-specific hull
// armor, turret, gun plant and supported equipment in project primitives.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildBradley, buildBMP2, buildPuma } from '../modern3.js';
import { T72_PROFILES } from './t72.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function armorTile(P, owner, x, y, z, w, h, d, rotation = null, cap = true) {
  const r = rotation || [0, 0, 0];
  const body = owner === 'hull' ? 'hull' : 'turret';
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(body, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(dark, KIT.box(w * 0.72, 0.016, Math.max(0.025, d * 0.08)),
    x, y + h * 0.50 + 0.010, z + d * 0.22, r[0], r[1], r[2]);
}

function clearUpperStructure(P) {
  P.clear('turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth',
    'gun', 'gunDark', 'gunMount', 'gunMountDark');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) {
    if (child !== P.gunG) P.turretG.remove(child);
  }
  for (const child of [...P.gunG.children]) {
    if (child !== P.recoilG) P.gunG.remove(child);
  }
  for (const child of [...P.recoilG.children]) P.recoilG.remove(child);
}

function roofMG(P, x, y, z, seed, cls = 'mag', yaw = 0, scale = 0.82) {
  P.add('turret', KIT.cylY(0.18, 0.20, 0.075, 16), x, y, z);
  P.add('turretDark', KIT.cylY(0.15, 0.17, 0.020, 16), x, y + 0.047, z);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls, tone: 'two-tone', scale, elev: 0.10,
    shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed,
  }), x, y + 0.07, z, [0, yaw, 0]);
}

function radioPair(P, y, z, seed, spread = 0.92) {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.032, 0.042, 0.060, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.72 : 0.60, r: 0.011,
      rake: -side * 0.04, seed: seed + (side > 0 ? 1 : 0),
    // Sink the fitting's own pot into the broad authored shoe so the whip
    // remains one connected supported component in every yaw mask.
    }), side * spread, y + 0.005, z);
  }
}

function smokePair(P, x, y, z, count, seed, pitch = -0.42) {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.040, len: 0.27, spacing: 0.095,
      splay: side * 1.02, pitch, arc: 0.60, slot: 'detail',
      rotation: [0, 0, -side * 0.10], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

function sideArmorCourse(P, o = {}) {
  const count = o.count || 7;
  for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
    const z = (o.front ?? 2.35) - i * (o.step ?? 0.78);
    armorTile(P, 'hull', side * (o.x ?? 1.68), o.y ?? 1.17, z,
      o.w ?? 0.08, o.h ?? 0.50, o.d ?? 0.66,
      [0, 0, side * (o.rz ?? 0.018)], o.cap !== false);
  }
}

function bowLightPair(P, x, y, z, seed) {
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045,
      shield: true, rake: -0.15, seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z, [-0.14, 0, 0]);
  }
}

function addBMP3Turret(P) {
  const { box, cylY, cylZ, torus, buildGun } = KIT;
  clearUpperStructure(P);
  P.gunG.position.set(0, 0.34, 0.62);

  // Broad, low BMP-3 turntable with a buried front saddle. The lower ring
  // overlaps the donor roof instead of exposing a neck or empty annulus.
  P.add('turret', cylY(1.02, 1.16, 0.34, 26), 0, 0.18, -0.08);
  P.add('turret', cylY(0.84, 1.02, 0.40, 24), 0, 0.48, -0.02);
  P.add('turret', orientedSlab(
    [-0.72, 0.22, 1.00], [0.72, 0.22, 1.00], [0.92, 0.22, 0.22], [-0.92, 0.22, 0.22],
    [-0.55, 0.70, 0.86], [0.55, 0.70, 0.86], [0.76, 0.72, 0.16], [-0.76, 0.72, 0.16]));
  P.addGunExtra(box(0.68, 0.42, 0.28), 0, 0, 0.31);
  P.addGunExtra(cylZ(0.14, 0.34, 18, 0.12), 0, 0, 0.62);
  buildGun(P, { len: 2.72, r: 0.058, sleeve: true, evac: 0.44,
    collar: true, baseR: 0.14 });
  // Parallel 30-mm cannon and coaxial PKT: both pitch with the gun plant.
  P.addGunExtraDark(cylZ(0.037, 2.30, 12), 0.22, 0.03, 1.70);
  P.addGunExtraDark(cylZ(0.022, 1.75, 10), -0.21, 0.02, 1.40);
  P.addGunExtraDark(cylZ(0.052, 0.15, 12), 0.22, 0.03, 2.90);
  P.add('turret', box(0.30, 0.07, 0.30), -0.40, 0.72, -0.18);
  // The source vehicle's primary day/night head is a dominant, fully backed
  // roof feature rather than a tiny blue chip.  A broad shoe, tapered collar,
  // armored head and recessed circular aperture keep it readable from all
  // front quarters without leaving any part on an unsupported stem.
  P.add('turretDetail', cylY(0.14, 0.16, 0.20, 14), -0.40, 0.86, -0.18);
  P.add('turret', box(0.34, 0.34, 0.28), -0.40, 1.06, -0.16, -0.04, 0, 0);
  P.add('turretDark', cylZ(0.115, 0.032, 16), -0.40, 1.08, 0.002,
    Math.PI / 2, 0, 0);
  P.add('turretGlass', cylZ(0.082, 0.038, 16), -0.40, 1.08, 0.022,
    Math.PI / 2, 0, 0);
  P.add('turret', cylY(0.24, 0.26, 0.07, 18), 0.40, 0.73, -0.30);
  // Two overlapping crew stations, periscopes and service lids break up the
  // source vehicle's cast crown without leaving unsupported roof furniture.
  for (const station of [
    { x: -0.39, z: -0.25, r: 0.235, yaw: -0.08 },
    { x: 0.40, z: -0.34, r: 0.255, yaw: 0.11 },
  ]) {
    P.add('turret', cylY(station.r * 0.92, station.r, 0.085, 18),
      station.x, 0.735, station.z);
    P.add('turretDark', torus(station.r * 0.82, 0.014, 18),
      station.x, 0.783, station.z);
    P.add('turret', box(station.r * 1.45, 0.055, station.r * 1.50),
      station.x, 0.805, station.z, 0, station.yaw, 0);
    for (let i = -1; i <= 1; i++) {
      P.add('turretGlass', box(0.078, 0.045, 0.026),
        station.x + i * 0.090, 0.825, station.z + station.r * 0.73,
        0, station.yaw, 0);
    }
  }
  P.add('turret', box(0.38, 0.045, 0.28), 0.00, 0.760, -0.66, 0, 0.04, 0);
  P.add('turretDark', box(0.27, 0.018, 0.05), 0.00, 0.790, -0.52, 0, 0.04, 0);
  // A supported flank collar gives the smoke banks and fittings visible
  // armor seats instead of allowing them to disappear into the dome.
  for (const side of [-1, 1]) {
    armorTile(P, 'turret', side * 0.94, 0.50, 0.27, 0.13, 0.25, 0.36,
      [0, 0, side * 0.09], false);
    armorTile(P, 'turret', side * 0.99, 0.46, -0.14, 0.12, 0.23, 0.34,
      [0, 0, side * 0.07], false);
    P.add('turretDetail', box(0.10, 0.06, 0.46), side * 0.85, 0.69, -0.70,
      0, 0, side * 0.03);
  }
  roofMG(P, 0.40, 0.80, -0.30, 3101, 'mag', 0.03, 0.72);
  smokePair(P, 0.82, 0.58, 0.14, 4, 3110);
  radioPair(P, 0.66, -0.86, 3120, 0.76);
  P.decal('turret', 'number', 'ROK 3', 0.20, [1.03, 0.38, -0.30], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.24);
}

function buildBMP3ROK(P) {
  buildBMP2(P);
  addBMP3Turret(P);
  // Oracle identity: uninterrupted buoyant sponsons, six wheels and a clean
  // low bow. Armor stays above the animated shoe envelope.
  sideArmorCourse(P, { x: 1.61, y: 1.26, h: 0.34, d: 0.58, count: 8,
    front: 2.42, step: 0.70, cap: false });
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    armorTile(P, 'hull', side * (0.32 + i * 0.30), 1.46 - i * 0.025,
      2.35 - i * 0.12, 0.27, 0.085, 0.30, [-0.28, 0, 0], false);
  }
  bowLightPair(P, 1.18, 1.47, 2.88, 3130);

  // The comparison model has a compact low cast fighting station.  Keep the
  // long 100 mm / 30 mm gun plant at authored diameter and length while the
  // entire owned turret package (armor, hatches, optics, smoke, MG and radios)
  // is pulled down around the ring as one coherent assembly.
  P.turretG.scale.x *= 0.90;
  P.turretG.scale.y *= 0.74;
  P.turretG.scale.z *= 0.88;
  P.gunG.scale.x *= 1 / 0.90;
  P.gunG.scale.y *= 1 / 0.74;
  P.gunG.scale.z *= 1 / 0.88;
}

function addUkrainianBradleyPackage(P) {
  const { box } = KIT;
  sideArmorCourse(P, { x: 1.73, y: 1.43, h: 0.58, d: 0.62, count: 8,
    front: 2.42, step: 0.71, rz: 0.012 });
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    armorTile(P, 'hull', side * (0.25 + i * 0.30), 1.57 - row * 0.10,
      2.40 - row * 0.26, 0.27, 0.095, 0.28, [-0.34, 0, 0], false);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    armorTile(P, 'turret', side * 1.17, 0.47, 0.53 - i * 0.42,
      0.12, 0.30, 0.34, [0, 0, side * 0.05], false);
  }
  P.add('turretDark', box(2.18, 0.24, 0.055), 0, 0.35, -1.50);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.12, d: 0.46, h: 0.30, fill: 0.72, rails: 3, seed: 3210,
  }), 0, 0.45, -1.35);
  roofMG(P, -0.42, 0.92, -0.42, 3220, 'mag', -0.08, 0.76);
  radioPair(P, 0.78, -1.40, 3230, 0.98);
  smokePair(P, 1.00, 0.62, 0.18, 4, 3240);
  P.decal('turret', 'number', 'UA B3', 0.21, [-1.24, 0.42, -0.52], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.43);
}

function buildUAM2A3(P) {
  buildBradley(P);
  addUkrainianBradleyPackage(P);
}

function addTerminatorStation(P) {
  const { box, cylY, cylZ, torus } = KIT;
  clearUpperStructure(P);
  P.turretG.position.set(0, 1.43, -0.14);
  P.gunG.position.set(0, 0.34, 0.42);

  // The oracle's Terminator station is a shallow turntable carrying two long
  // horizontal missile pods.  It is not a pair of tall rectangular towers.
  // Keep the bearing buried in the T-72 deck and reserve the skyline for the
  // command sight and two antennas.
  P.add('turret', cylY(0.92, 1.10, 0.18, 26), 0, 0.07, -0.10);
  P.add('turret', orientedSlab(
    [-0.74, 0.10, 0.82], [0.74, 0.10, 0.82], [0.88, 0.10, -0.80], [-0.88, 0.10, -0.80],
    [-0.46, 0.39, 0.70], [0.46, 0.39, 0.70], [0.61, 0.42, -0.68], [-0.61, 0.42, -0.68]));
  P.add('turret', box(0.58, 0.28, 0.84), 0, 0.39, 0.02);
  P.add('turretDark', box(0.46, 0.14, 0.22), 0, 0.39, 0.51);

  // Twin 2A42 cannons share a closed saddle but retain distinct collars and
  // bore mouths.  The plant pitches as one, with no gun geometry left behind.
  for (const side of [-1, 1]) {
    P.addGunExtra(box(0.17, 0.21, 0.28), side * 0.14, 0, 0.25);
    P.addGunExtra(cylZ(0.056, 0.30, 14, 0.045), side * 0.14, 0, 0.52);
    P.add('gun', cylZ(0.035, 2.52, 12), side * 0.14, 0, 1.78);
    P.add('gunDark', cylZ(0.052, 0.16, 12), side * 0.14, 0, 3.10);
    P.add('gunDark', cylZ(0.019, 0.027, 12), side * 0.14, 0, 3.195);
  }
  P.muzzleZ = 3.21;

  // Four Ataka tubes in two long source-shaped horizontal cassettes.  Each
  // cassette has a deep inboard cradle, a tapered upper cover and two visible
  // forward mouths; the aft rail returns into the turntable.
  for (const side of [-1, 1]) {
    P.add('turretDark', box(0.42, 0.16, 0.52), side * 0.67, 0.38, 0.02,
      0, 0, side * 0.06);
    P.add('turret', box(0.44, 0.32, 1.32), side * 0.94, 0.70, 0.08,
      0, 0, side * 0.025);
    P.add('turret', box(0.35, 0.08, 1.18), side * 0.94, 0.90, 0.05,
      0, 0, side * 0.025);
    for (let lane = 0; lane < 2; lane++) {
      const laneX = side * (0.88 + lane * 0.16);
      P.add('turretDark', cylZ(0.073, 1.16, 14), laneX, 0.70, 0.06);
      P.add('turretDetail', cylZ(0.060, 0.028, 14), laneX, 0.70, 0.654);
    }
    P.add('turretDetail', box(0.035, 0.26, 1.02), side * 1.165, 0.70, 0.03,
      0, 0, side * 0.05);
  }

  // Independent command panorama and gunner head, both seated on overlapping
  // rings.  Periscopes, smoke launchers and service lids fill the crown while
  // keeping the weapon station visibly lower than the missile cassettes.
  P.add('turret', cylY(0.20, 0.22, 0.075, 18), -0.22, 0.45, -0.30);
  P.add('turretDark', torus(0.18, 0.013, 18), -0.22, 0.492, -0.30);
  P.add('turret', box(0.36, 0.38, 0.34), -0.22, 0.72, -0.28);
  P.add('turretGlass', box(0.23, 0.13, 0.025), -0.22, 0.75, -0.095);
  P.add('turret', box(0.24, 0.06, 0.25), 0.23, 0.47, -0.24);
  P.add('turretDetail', cylY(0.105, 0.12, 0.25, 14), 0.23, 0.62, -0.24);
  P.add('turretGlass', box(0.14, 0.085, 0.022), 0.23, 0.64, -0.105);
  for (const x of [-0.53, -0.35, 0.35, 0.53]) {
    P.add('turretGlass', box(0.09, 0.042, 0.025), x, 0.47, 0.43);
  }
  smokePair(P, 0.72, 0.42, -0.38, 4, 3310, -0.34);
  radioPair(P, 0.52, -0.62, 3320, 0.62);
  P.decal('turret', 'number', 'BMPT-2', 0.17, [1.13, 0.45, -0.18], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.12);
}

function buildBMPT2(P) {
  T72_PROFILES.t72b3m.build(P);
  addTerminatorStation(P);
  sideArmorCourse(P, { x: 1.73, y: 1.04, h: 0.44, d: 0.62, count: 7,
    front: 2.15, step: 0.76 });
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    armorTile(P, 'hull', side * (0.27 + i * 0.31), 1.25, 2.08,
      0.28, 0.105, 0.34, [-0.29, 0, 0], true);
  }
}

function addUpiorStation(P) {
  const { box, cylY, cylZ, torus, buildGun } = KIT;
  clearUpperStructure(P);
  P.gunG.position.set(0, 0.40, 0.60);
  P.add('turret', cylY(0.96, 1.08, 0.22, 24), 0, 0.10, -0.12);
  P.add('turret', orientedSlab(
    [-0.64, 0.12, 1.08], [0.64, 0.12, 1.08], [0.84, 0.14, -0.82], [-0.84, 0.14, -0.82],
    [-0.42, 0.68, 0.82], [0.42, 0.68, 0.82], [0.62, 0.70, -0.70], [-0.62, 0.70, -0.70]));
  P.addGunExtra(box(0.50, 0.36, 0.26), 0, 0, 0.30);
  P.addGunExtra(cylZ(0.12, 0.32, 16, 0.10), 0, 0, 0.58);
  buildGun(P, { len: 2.82, r: 0.040, sleeve: true, evac: 0.38,
    collar: true, baseR: 0.11 });
  // Source-defining raised missile/sensor head, backed into the cupola.
  P.add('turret', cylY(0.27, 0.30, 0.09, 18), 0.28, 0.73, -0.18);
  P.add('turret', box(0.54, 0.42, 0.46), 0.28, 0.98, -0.04);
  P.add('turretGlass', box(0.34, 0.18, 0.025), 0.28, 1.00, 0.205);
  P.add('turretDark', cylZ(0.055, 0.64, 12), 0.28, 1.11, 0.44);
  // Stepped roof armor and two real crew/service stations replace the former
  // uninterrupted slab. Rings overlap the roof; sights sit on broad shoes.
  for (const station of [
    { x: -0.38, z: -0.30, r: 0.22, yaw: -0.12 },
    { x: 0.34, z: -0.42, r: 0.18, yaw: 0.10 },
  ]) {
    P.add('turret', cylY(station.r * 0.90, station.r, 0.075, 18),
      station.x, 0.705, station.z);
    P.add('turretDark', torus(station.r * 0.80, 0.013, 18),
      station.x, 0.747, station.z);
    P.add('turret', box(station.r * 1.42, 0.055, station.r * 1.48),
      station.x, 0.766, station.z, 0, station.yaw, 0);
  }
  P.add('turret', box(0.42, 0.055, 0.32), -0.02, 0.735, -0.66, 0, -0.04, 0);
  P.add('turretDark', box(0.30, 0.018, 0.045), -0.02, 0.769, -0.49,
    0, -0.04, 0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      armorTile(P, 'turret', side * (0.76 + i * 0.11), 0.48,
        0.36 - i * 0.44, 0.12, 0.24, 0.34,
        [0, 0, side * 0.08], false);
    }
    P.add('turret', box(0.24, 0.18, 0.32), side * 0.64, 0.67, -0.51,
      0, 0, side * 0.04);
    P.add('turretGlass', box(0.15, 0.08, 0.024), side * 0.64, 0.70, -0.33);
  }
  P.add('turretDark', box(1.32, 0.09, 0.055), 0, 0.49, -0.88);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.28, d: 0.34, h: 0.23, fill: 0.60, rails: 3, seed: 3398,
  }), 0, 0.56, -0.82);
  roofMG(P, -0.42, 0.77, -0.26, 3400, 'mag', -0.05, 0.75);
  smokePair(P, 0.83, 0.57, 0.05, 4, 3410);
  radioPair(P, 0.66, -0.72, 3420, 0.78);
  P.decal('turret', 'number', 'UPIOR', 0.19, [-1.02, 0.41, -0.32], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.49);
}

function buildUpior(P) {
  buildBMP2(P);
  addUpiorStation(P);
  sideArmorCourse(P, { x: 1.69, y: 1.14, h: 0.70, d: 0.68, count: 8,
    front: 2.45, step: 0.73, cap: false });
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    armorTile(P, 'hull', side * (0.27 + i * 0.29), 1.48, 2.30 - i * 0.08,
      0.25, 0.10, 0.30, [-0.30, 0, 0], false);
  }
  bowLightPair(P, 1.18, 1.51, 2.84, 3430);
}

function addMarderTurret(P) {
  const { box, cylY, cylZ, torus, lathe, buildGun } = KIT;
  clearUpperStructure(P);
  P.turretG.position.set(0.18, 1.84, -0.05);
  P.gunG.position.set(0, 0.26, 0.43);
  P.add('turret', cylY(0.66, 0.74, 0.14, 22), 0, 0.07, -0.02);
  // One compact rounded fighting-station core replaces the former low
  // rectangular cabinet. Its skirt overlaps the ring and the narrowing
  // crown gives every roof fitting a real seat, matching the source A3's
  // bulbous two-man turret rather than a flat slab.
  P.add('turret', lathe([
    [0.65, 0.00], [0.69, 0.12], [0.62, 0.31], [0.49, 0.48],
    [0.31, 0.58], [0.08, 0.61],
  ], P.q ? 28 : 18, 0.86), 0, 0.04, -0.03);
  P.add('turret', box(0.48, 0.10, 0.42), 0, 0.48, -0.30,
    0, -0.03, 0);
  P.addGunExtra(box(0.38, 0.25, 0.22), 0, 0, 0.25);
  P.addGunExtra(cylZ(0.088, 0.25, 14, 0.072), 0, 0, 0.48);
  buildGun(P, { len: 2.55, r: 0.032, sleeve: true, evac: 0.34,
    collar: true, baseR: 0.09 });
  // MELLS launcher and thermal head on independent broad seats.
  P.add('turretDark', box(0.16, 0.09, 0.30), 0.52, 0.36, 0.01);
  P.add('turret', box(0.28, 0.22, 0.66), 0.64, 0.43, 0.13, 0, 0.04, 0);
  P.add('turretDark', cylZ(0.075, 0.62, 14), 0.64, 0.43, 0.14);
  P.add('turret', box(0.24, 0.06, 0.23), -0.26, 0.47, -0.10);
  P.add('turretDetail', box(0.21, 0.20, 0.19), -0.26, 0.59, -0.10);
  P.add('turretGlass', box(0.14, 0.10, 0.022), -0.26, 0.60, 0.005);
  // Marder A3 source identity: a compact faceted turret wrapped by unequal
  // side service boxes, a ringed command station and a dense optical crown.
  // These pieces overlap the existing shell rather than widening it into a
  // generic MBT turret.
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.38, 0.13, 0.52], [side * 0.61, 0.13, 0.42],
      [side * 0.62, 0.13, -0.43], [side * 0.39, 0.13, -0.53],
      [side * 0.34, 0.40, 0.43], [side * 0.52, 0.40, 0.36],
      [side * 0.53, 0.41, -0.35], [side * 0.35, 0.41, -0.43]));
    P.add('turret', box(0.20, 0.21, 0.34), side * 0.56, 0.32, -0.36,
      0, 0, side * 0.035);
    P.add('turretDark', box(0.025, 0.14, 0.25), side * 0.665, 0.34, -0.36,
      0, 0, side * 0.035);
  }
  P.add('turret', cylY(0.255, 0.275, 0.075, 18), -0.24, 0.46, -0.28);
  P.add('turretDark', torus(0.225, 0.014, 18), -0.24, 0.502, -0.28);
  P.add('turret', box(0.34, 0.055, 0.36), -0.24, 0.523, -0.28, 0, -0.10, 0);
  for (let i = -1; i <= 1; i++) {
    P.add('turretGlass', box(0.070, 0.045, 0.022),
      -0.24 + i * 0.085, 0.545, -0.074, 0, -0.10, 0);
  }
  P.add('turret', box(0.31, 0.055, 0.25), 0.22, 0.485, -0.38, 0, 0.08, 0);
  P.add('turretDark', box(0.22, 0.018, 0.045), 0.22, 0.519, -0.245,
    0, 0.08, 0);
  // Backed rear equipment wall and basket rails close the former empty tail.
  P.add('turret', box(1.02, 0.26, 0.23), 0, 0.29, -0.63);
  P.add('turretDark', box(0.82, 0.13, 0.035), 0, 0.30, -0.756);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.00, d: 0.31, h: 0.22, fill: 0.66, rails: 3, seed: 3497,
  }), 0, 0.47, -0.58);
  roofMG(P, 0.22, 0.49, -0.30, 3500, 'mag', 0.03, 0.62);
  smokePair(P, 0.52, 0.39, 0.08, 3, 3510);
  radioPair(P, 0.45, -0.56, 3520, 0.50);
  P.decal('turret', 'number', 'MARDER', 0.18, [0.79, 0.37, -0.28], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.08);
}

function buildMarder1A3(P) {
  // The Bradley donor supplies the Marder's defining six-station, tall
  // troop-compartment hull and rear ramp more faithfully than the shallower
  // BMP family. Only the native running gear and hull are retained.
  buildBradley(P);
  addMarderTurret(P);
  // The A3's horizontal appliqué rails are passive armor, not invented ERA.
  sideArmorCourse(P, { x: 1.68, y: 1.22, h: 0.42, d: 0.72, count: 8,
    front: 2.42, step: 0.74, cap: false });
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    P.add('hullDetail', KIT.box(0.032, 0.045, 5.25), side * 1.72,
      1.02 + row * 0.18, -0.18);
  }
  bowLightPair(P, 1.16, 1.48, 2.86, 3530);
}

function addM3A3Turret(P) {
  const { box, cylY, cylZ, torus, buildGun } = KIT;
  clearUpperStructure(P);

  // The supplied M3A3 oracle carries a compact, low welded turret.  The
  // former implementation inherited the M2A2's full-height cabinet and then
  // stacked another viewer, two scout heads and a bustle on top; its roof
  // furniture was detailed, but the primary mass was the wrong vehicle.
  // Rebuild the complete upper assembly around one buried ring and a faceted
  // shell, leaving height to the source-defining commander's sight alone.
  P.turretG.position.set(0.04, 1.895, -0.36);
  P.gunG.position.set(-0.10, 0.285, 0.62);
  P.add('turret', cylY(0.70, 0.78, 0.105, 24), 0, 0.015, -0.04);
  P.add('turret', orientedSlab(
    [-0.72, 0.04, 0.98], [0.72, 0.04, 0.98], [0.83, 0.05, -1.02], [-0.83, 0.05, -1.02],
    [-0.49, 0.55, 0.78], [0.49, 0.55, 0.78], [0.64, 0.57, -0.88], [-0.64, 0.57, -0.88]));

  // Overlapping cheek continuations close the gun throat and give the front
  // the Bradley's shallow V instead of a flat rectangular wall.  The dark
  // saddle and round collar are both seated inside those cheeks.
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.13, 0.12, 1.02], [side * 0.57, 0.10, 0.91],
      [side * 0.68, 0.10, 0.42], [side * 0.19, 0.13, 0.50],
      [side * 0.13, 0.48, 0.87], [side * 0.46, 0.51, 0.75],
      [side * 0.54, 0.50, 0.45], [side * 0.18, 0.48, 0.55]));
    P.add('turretDetail', box(0.035, 0.20, 0.42), side * 0.79, 0.31, 0.10,
      0, 0, side * 0.045);
  }
  P.addGunExtra(box(0.46, 0.30, 0.25), 0, 0, 0.27);
  P.addGunExtraDark(cylZ(0.105, 0.34, 18, 0.085), 0, 0, 0.56);
  buildGun(P, { len: 2.42, r: 0.037, sleeve: true, evac: 0.34,
    collar: true, baseR: 0.10 });

  // Source-specific TOW launcher: two real tubes live in one armoured pod,
  // which is carried by a broad flank bracket rather than hovering beside
  // the shell.  The small opposite-side electronics box breaks symmetry.
  P.add('turretDark', box(0.24, 0.16, 0.48), 0.76, 0.38, 0.08);
  P.add('turret', box(0.44, 0.40, 0.74), 0.91, 0.52, 0.10, 0, -0.035, 0.025);
  for (const x of [0.82, 1.00]) {
    P.add('turretDark', cylZ(0.073, 0.69, 14), x, 0.53, 0.12);
    P.add('turretDetail', cylZ(0.060, 0.025, 14), x, 0.53, 0.478);
  }
  P.add('turret', box(0.30, 0.23, 0.44), -0.78, 0.40, -0.20,
    0, 0.025, -0.025);
  P.add('turretGlass', box(0.024, 0.12, 0.25), -0.942, 0.42, -0.12,
    0, 0.025, 0);

  // Two overlapping crew stations and a low periscope cadence articulate the
  // roof.  The tall dual-aperture commander's sight is mounted on a tapered
  // plinth, matching the oracle without turning the entire turret into a box.
  for (const station of [
    { x: -0.31, z: -0.28, r: 0.235, yaw: -0.08 },
    { x: 0.32, z: -0.38, r: 0.205, yaw: 0.10 },
  ]) {
    P.add('turret', cylY(station.r * 0.92, station.r, 0.075, 18),
      station.x, 0.585, station.z);
    P.add('turretDark', torus(station.r * 0.80, 0.014, 18),
      station.x, 0.627, station.z);
    P.add('turret', box(station.r * 1.42, 0.055, station.r * 1.48),
      station.x, 0.648, station.z, 0, station.yaw, 0);
    for (let i = -1; i <= 1; i++) {
      P.add('turretGlass', box(0.066, 0.042, 0.024),
        station.x + i * 0.078, 0.670, station.z + station.r * 0.73,
        0, station.yaw, 0);
    }
  }
  P.add('turret', orientedSlab(
    [-0.55, 0.59, -0.31], [-0.10, 0.59, -0.31], [-0.10, 0.59, 0.08], [-0.55, 0.59, 0.08],
    [-0.49, 0.76, -0.27], [-0.16, 0.76, -0.27], [-0.16, 0.76, 0.02], [-0.49, 0.76, 0.02]));
  P.add('turret', box(0.40, 0.34, 0.34), -0.33, 0.91, -0.08);
  for (const x of [-0.42, -0.24]) {
    P.add('turretGlass', box(0.125, 0.105, 0.025), x, 0.95, 0.102);
    P.add('turretDark', box(0.145, 0.018, 0.045), x, 1.055, 0.065);
  }

  // Aft bins and the open rack stay below the commander's head.  Diagonal
  // braces visibly return every rail into the bustle, so yaw inspection has
  // no unsupported furniture or hidden donor mass.
  P.add('turret', box(1.34, 0.28, 0.34), 0, 0.35, -1.02);
  P.add('turretDark', box(1.10, 0.13, 0.035), 0, 0.36, -1.208);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.46, d: 0.38, h: 0.24, fill: 0.68, rails: 3, seed: 3608,
  }), 0, 0.54, -1.04);
  P.add('turretDetail', box(0.035, 0.24, 0.52), -0.69, 0.45, -1.04,
    0, 0, -0.54);
  P.add('turretDetail', box(0.035, 0.24, 0.52), 0.69, 0.45, -1.04,
    0, 0, 0.54);

  smokePair(P, 0.72, 0.46, 0.28, 4, 3640, -0.36);
  radioPair(P, 0.60, -1.08, 3630, 0.65);
  P.decal('turret', 'number', 'M3A3', 0.18, [0.84, 0.34, -0.50], Math.PI / 2);

  // Retain the source's full-length spaced side armor, but do not duplicate
  // the donor turret or donor bustle above it.
  sideArmorCourse(P, { x: 1.73, y: 1.43, h: 0.58, d: 0.62, count: 8,
    front: 2.42, step: 0.71 });
  P.topY = Math.max(P.topY || 0, 1.12);
}

function buildM3A3(P) {
  buildBradley(P);
  addM3A3Turret(P);
}

function addPumaOraclePackage(P) {
  // Level-C reactive side modules and the high RCT30 observation cadence.
  sideArmorCourse(P, { x: 1.82, y: 1.52, h: 0.66, d: 0.70, count: 8,
    front: 2.55, step: 0.77, rz: 0.010 });
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    armorTile(P, 'hull', side * (0.28 + i * 0.32), 1.72, 2.52 - i * 0.10,
      0.29, 0.11, 0.33, [-0.27, 0, 0], false);
  }
  roofMG(P, -0.38, 0.92, -0.48, 3700, 'mag', -0.04, 0.74);
  radioPair(P, 0.80, -1.56, 3710, 1.00);
  P.add('turret', KIT.box(0.28, 0.07, 0.28), 0.42, 0.90, -0.18);
  P.add('turretDetail', KIT.cylY(0.12, 0.14, 0.32, 14), 0.42, 1.09, -0.18);
  P.add('turretGlass', KIT.box(0.18, 0.12, 0.024), 0.42, 1.11, -0.02);
  P.topY = Math.max(P.topY || 0, 1.52);
}

function buildPumaOracle(P) {
  buildPuma(P);
  // The native hull whip was authored exactly tangent to the deck. Bury its
  // collar into the supporting shoe so mask-based attachment audits see the
  // same continuous load path that is visible in the rendered vehicle.
  for (const child of P.hullG.children) {
    if (child.name === 'fitting_antennaWhip') child.position.y -= 0.04;
  }
  addPumaOraclePackage(P);
}

export const AFV_FAMILY_PROFILES = {
  bmp3_rok: { build: buildBMP3ROK },
  ua_m2a3_bradley: { build: buildUAM2A3 },
  bmpt_terminator2: { build: buildBMPT2 },
  upior_ifv: { build: buildUpior },
  marder1a3: { build: buildMarder1A3 },
  m3a3_bradley: { build: buildM3A3 },
  spz_puma: { build: buildPumaOracle },
};
