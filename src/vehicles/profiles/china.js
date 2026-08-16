// Chinese main-battle-tank family.
//
// The owner-supplied ZTZ-85-III, ZTZ-99A and ZTZ-99A2 GLBs are used only as
// fixed visual/metric oracles.  Runtime geometry stays first-party procedural.
// The family deliberately preserves the donor hull, skirts and one native
// suspension-driven track course; all deltas below are supported armor,
// equipment and gun-station additions.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildType59 } from './russia.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function armorCassette(P, owner, x, y, z, w, h, d, rotation = null, seam = true) {
  const r = rotation || [0, 0, 0];
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(bucket, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (seam) {
    P.add(detail, KIT.box(w * 0.72, 0.018, Math.max(0.025, d * 0.07)),
      x, y + h * 0.50 + 0.010, z + d * 0.30, r[0], r[1], r[2]);
  }
}

function addChineseRoofSuite(P, options = {}) {
  const { box, cylY } = KIT;
  const y = options.y ?? 1.08;
  const panoX = options.panoX ?? -0.52;
  const panoZ = options.panoZ ?? -0.62;

  // Broad planted optical foundation, tapered head and forward glass.
  P.add('turret', box(0.42, 0.08, 0.40), panoX, y, panoZ);
  P.add('turretDetail', cylY(0.14, 0.17, 0.30, 14), panoX, y + 0.20, panoZ);
  P.add('turretDark', box(0.25, 0.11, 0.055), panoX, y + 0.22, panoZ + 0.18);
  P.add('turretGlass', box(0.18, 0.075, 0.024), panoX, y + 0.22, panoZ + 0.215);

  // QJC-88 family station on a cupola rather than a floating receiver.
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'nsvt', tone: 'two-tone', scale: options.mgScale ?? 0.82,
    elev: options.elev ?? 0.08, shield: true, ammo: true,
    ring: { r: 0.17, stubs: 3 }, seed: options.seed ?? 990,
  }), options.mgX ?? 0.52, y + 0.01, options.mgZ ?? -0.54,
  [0, options.mgYaw ?? 0.04, 0]);

  for (const side of [-1, 1]) {
    const h = side < 0 ? (options.whipL ?? 0.78) : (options.whipR ?? 0.64);
    P.add('turretDetail', cylY(0.035, 0.045, 0.055, 10),
      side * (options.whipX ?? 1.02), y - 0.06, options.whipZ ?? -1.52);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h, r: 0.012, rake: -side * 0.045,
      seed: (options.seed ?? 990) + 3 + (side > 0 ? 1 : 0),
    }), side * (options.whipX ?? 1.02), y - 0.03, options.whipZ ?? -1.52);
  }
}

function addSmokeBanks(P, x, y, z, count, seed) {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.043, len: 0.30, splay: side * 1.02,
      pitch: -0.44, arc: 0.58, spacing: 0.10, slot: 'detail',
      rotation: [0, 0, -side * 0.12], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

function addRearFuelDrums(P, y, z, seed) {
  const { cylX, box } = KIT;
  for (const side of [-1, 1]) {
    P.add('hull', cylX(0.17, 0.76, 16), side * 0.78, y, z);
    for (const x of [side * 0.52, side * 1.04]) {
      P.add('hullDark', box(0.045, 0.36, 0.20), x, y, z);
    }
  }
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.54, d: 0.36, h: 0.20, fill: 0.28, rails: 2, seed,
  }), 0, y + 0.18, z + 0.12);
}

function addZTZ85IIIPackage(P) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // The oracle is a Type-80/85 transitional machine: retain the low Type-59
  // chassis but bury welded cheek continuations into its cast turret.  The
  // resulting composite mass is broad and low, never a new floating shell.
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 0.24, 0.10, 1.28], [side * 1.34, 0.10, 0.74],
      [side * 1.40, 0.10, -0.30], [side * 0.36, 0.10, 0.42],
      [side * 0.24, 0.58, 1.18], [side * 1.22, 0.60, 0.67],
      [side * 1.28, 0.54, -0.34], [side * 0.36, 0.62, 0.36]));
    for (let i = 0; i < 5; i++) {
      armorCassette(P, 'turret', side * (0.42 + i * 0.21),
        0.54 - i * 0.015, 0.98 - i * 0.13, 0.20, 0.24, 0.22,
        [-0.17, side * (0.04 + i * 0.06), side * 0.025], false);
    }

    // Five full-height skirt cassettes sit on the intact fender shelf.  They
    // stop above the wheel centers and cannot masquerade as a second track.
    for (let i = 0; i < 5; i++) {
      armorCassette(P, 'hull', side * 1.66, 0.98, 0.95 - i * 0.94,
        0.075, 0.48, 0.78, [0, 0, -side * 0.025], false);
      P.add('hullDark', box(0.020, 0.035, 0.62), side * 1.705, 1.18,
        0.95 - i * 0.94);
    }
  }

  // Two-course glacis ERA with a center driver break.
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      armorCassette(P, 'hull', side * (0.24 + i * 0.29), 1.29 - row * 0.04,
        0.98 + row * 0.33, 0.25, 0.10, 0.27, [-0.30, 0, 0], false);
    }
  }

  // Oracle bustle cage: solid backing, supported side returns and fine rails.
  P.add('turret', box(2.30, 0.34, 0.72), 0, 0.46, -1.58);
  P.add('turretDark', box(2.18, 0.30, 0.035), 0, 0.46, -1.96);
  for (const y of [0.30, 0.44, 0.58, 0.72]) {
    P.add('turretDetail', box(2.56, 0.030, 0.035), 0, y, -2.00);
  }
  for (let i = 0; i < 9; i++) {
    P.add('turretDetail', box(0.030, 0.46, 0.035), -1.18 + i * 0.295, 0.51, -2.00);
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.035, 0.68), side * 1.28, 0.72, -1.66);
    P.add('turretDetail', box(0.035, 0.035, 0.68), side * 1.28, 0.30, -1.66);
  }

  addSmokeBanks(P, 1.12, 0.68, 0.08, 5, 8530);
  addChineseRoofSuite(P, { y: 1.10, panoX: -0.48, panoZ: -0.34,
    mgX: 0.54, mgZ: -0.12, mgScale: 0.80, seed: 8500, whipZ: -1.62 });
  P.add('turret', cylY(0.27, 0.29, 0.07, 16), 0.54, 1.07, -0.12);

  // A sealed 125-mm-looking gun root and large IR plant, both gun-owned.
  P.addGunExtra(box(0.70, 0.52, 0.24), 0, 0.00, 0.44);
  P.addGunExtra(cylZ(0.19, 0.34, 16, 0.145), 0, 0.00, 0.66);
  P.addGunExtraDark(cylZ(0.035, 0.08, 10), 0.27, 0.08, 0.58);
  P.addGunExtra(cylZ(0.13, 0.20, 14), -0.34, 0.18, 0.38);
  P.addGunExtraDark(cylZ(0.10, 0.025, 14), -0.34, 0.18, 0.50);

  P.decal('turret', 'number', '85-III', 0.23, [-1.43, 0.42, -0.72], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.42);
}

function buildZTZ85III(P) {
  // The ZTZ-85-III oracle has six medium road-wheel stations, unlike the
  // five large wheels of the Type-59 donor shell.  The donor exposes this
  // opt-in mechanical datum so we retain one smart course instead of adding
  // a static duplicate layer.
  buildType59(P, { runningGear: {
    wheelR: 0.36, wheelY: 0.45,
    wheelZs: [0.66, -0.12, -0.90, -1.68, -2.46, -3.24],
    sprocket: { z: -3.83, y: 0.68, r: 0.24 },
    idler: { z: 1.27, y: 0.64, r: 0.22 },
    contactZF: 0.72, contactZR: -3.24,
  } });
  addZTZ85IIIPackage(P);
}

function addZTZ99AOraclePackage(P) {
  const { box, cylY } = KIT;
  // Reference-specific rear drums and open basket cadence.  These live on
  // the hull powerpack, so they stay fixed when the turret yaws.
  addRearFuelDrums(P, 1.67, -3.72, 9910);

  // Broad wedge modules reinforce—not replace—the certified arrow cheeks.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      armorCassette(P, 'turret', side * (0.48 + i * 0.25),
        0.64 - i * 0.018, 1.16 - i * 0.20, 0.23, 0.25, 0.27,
        [-0.16, side * (0.05 + i * 0.065), side * 0.025], true);
    }
  }

  // Compact commander station and backed laser-warning pair.
  addChineseRoofSuite(P, { y: 1.09, panoX: -0.64, panoZ: -0.84,
    mgX: 0.48, mgZ: -0.43, mgScale: 0.78, seed: 9920, whipZ: -1.78 });
  for (const side of [-1, 1]) {
    P.add('turret', box(0.20, 0.08, 0.19), side * 1.06, 0.87, 0.35);
    P.add('turretGlass', box(0.12, 0.07, 0.022), side * 1.06, 0.88, 0.455);
  }
  P.add('turretDetail', cylY(0.035, 0.045, 0.30, 10), 0.20, 1.16, -1.06);
  P.add('turretDark', box(0.16, 0.05, 0.05), 0.20, 1.32, -1.06);
  P.addGunExtra(box(0.66, 0.48, 0.22), 0, 0.00, 0.40);
  P.decal('turret', 'number', '99A', 0.24, [1.70, 0.42, -0.72], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function addZTZ99A2Package(P) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // A2's defining low rectangular bustle and deep modular side walls.  The
  // side modules overlap the parent shell by 70 mm and terminate in the
  // backed bustle instead of floating as isolated plates.
  P.add('turret', box(2.90, 0.50, 0.92), 0, 0.54, -2.12);
  P.add('turretDark', box(2.76, 0.035, 0.82), 0, 0.81, -2.12);
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 1.22, 0.11, 0.52], [side * 1.70, 0.11, 0.16],
      [side * 1.70, 0.11, -2.22], [side * 1.20, 0.11, -1.82],
      [side * 1.16, 0.69, 0.44], [side * 1.62, 0.64, 0.08],
      [side * 1.62, 0.58, -2.18], [side * 1.14, 0.68, -1.76]));
    for (let i = 0; i < 5; i++) {
      armorCassette(P, 'turret', side * 1.66, 0.40 + (i & 1) * 0.02,
        0.08 - i * 0.47, 0.15, 0.40, 0.40, [0, 0, side * 0.06], true);
    }
    for (let i = 0; i < 6; i++) {
      armorCassette(P, 'hull', side * 1.89, 1.05, 2.18 - i * 0.84,
        0.085, 0.54, 0.66, [0, 0, -side * 0.022], false);
    }
  }

  // Deeper arrowhead ERA: two stepped layers with an open mantlet channel.
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      armorCassette(P, 'turret', side * (0.34 + i * 0.235),
        0.62 - row * 0.20 - i * 0.014,
        1.30 - i * 0.18 - row * 0.16,
        0.22, 0.23, 0.28, [-0.18 + row * 0.05,
          side * (0.04 + i * 0.065), side * 0.025], true);
    }
  }

  // Two glacis rows follow the source's broad chevron without covering the
  // center driver station or entering either terminal track lane.
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      armorCassette(P, 'hull', side * (0.25 + i * 0.32), 1.46 - row * 0.055,
        2.46 + row * 0.36 + (3 - i) * 0.04, 0.29, 0.10, 0.33,
        [-0.24, side * 0.07, 0], true);
    }
  }

  // Dense A2 station suite: armored gunner sight, panoramic commander head,
  // forward shielded RWS and separate wind mast, each on a broad roof seat.
  P.add('turret', box(0.43, 0.10, 0.40), 0.72, 1.08, -0.70);
  P.add('turret', box(0.34, 0.38, 0.32), 0.72, 1.30, -0.70);
  P.add('turretDark', box(0.26, 0.15, 0.035), 0.72, 1.32, -0.515);
  P.add('turretGlass', box(0.18, 0.09, 0.020), 0.72, 1.32, -0.492);
  addChineseRoofSuite(P, { y: 1.12, panoX: -0.55, panoZ: -0.72,
    mgX: 0.48, mgZ: -0.38, mgScale: 0.86, elev: 0.12,
    seed: 9992, whipL: 0.86, whipR: 0.70, whipZ: -1.95 });
  P.add('turret', cylY(0.16, 0.18, 0.14, 14), -0.55, 1.52, -0.72);
  P.add('turretGlass', box(0.18, 0.09, 0.022), -0.55, 1.54, -0.54);
  P.add('turretDetail', cylY(0.022, 0.028, 0.54, 10), 0.12, 1.40, -1.16);
  P.add('turretDark', box(0.13, 0.08, 0.08), 0.12, 1.70, -1.16);
  addSmokeBanks(P, 1.44, 0.60, 0.20, 6, 9998);

  // New closed gun plant around the existing ZPT-98 tube.
  P.addGunExtra(box(0.82, 0.58, 0.25), 0, 0.00, 0.42);
  P.addGunExtra(cylZ(0.23, 0.42, 18, 0.17), 0, 0.00, 0.70);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), 0.30, 0.08, 0.62);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), -0.30, 0.08, 0.62);

  addRearFuelDrums(P, 1.68, -3.74, 9999);
  P.decal('turret', 'number', '99A2', 0.25, [-1.68, 0.42, -0.76], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.78);
}

export const CHINA_PROFILES = {
  ztz85_iii: { build: buildZTZ85III },
  // Same-id canonical donor is safe: buildDonorVariant calls the frozen
  // pre-profile Type-99A constructor, then applies this oracle package.
  type99a: { base: 'type99a', kit: addZTZ99AOraclePackage },
  ztz99a2: { base: 'type99a', kit: addZTZ99A2Package },
};
