// Ukrainian tracked-vehicle family.
//
// The owner-supplied GLBs are fixed-angle visual/metric oracles only.  The
// playable vehicles below remain first-party procedural geometry and reuse
// the certified native running gear of their nearest family member.  Every
// variant kit is additive: no hull, skirt, suspension or track course is
// removed or replaced.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildT64BV1 } from './russia.js';
import { T80_PROFILES } from './t80.js';
import { MISC_PROFILES } from './misc.js';
import { ABRAMS_PROFILES } from './abrams.js';

function seat(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function addKontaktTile(P, owner, x, y, z, w, h, d, rotation = null, detail = true) {
  const { box } = KIT;
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  const r = rotation || [0, 0, 0];
  P.add(bucket, box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (detail) P.add(dark, box(w * 0.72, 0.018, Math.min(0.035, d * 0.20)),
    x, y + h * 0.50 + 0.010, z + d * 0.39, r[0], r[1], r[2]);
}

function addUkrainianRoofSuite(P, o = {}) {
  const { box, cylY } = KIT;
  const y = o.y ?? 0.82;
  const panoX = o.panoX ?? 0.52;
  const panoZ = o.panoZ ?? -0.26;
  P.add('turret', box(0.38, 0.075, 0.36), panoX, y, panoZ);
  P.add('turretDetail', cylY(0.14, 0.16, 0.29, 14), panoX, y + 0.19, panoZ);
  P.add('turretGlass', box(0.20, 0.11, 0.024), panoX, y + 0.21, panoZ + 0.15);
  seat(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: o.mg || 'nsvt',
    tone: 'two-tone', elev: o.elev ?? 0.08, shield: true, ammo: true,
    ring: { r: 0.17, stubs: 3 }, scale: o.mgScale ?? 0.88, seed: o.seed ?? 81 }),
    o.mgX ?? -0.48, y + 0.05, o.mgZ ?? -0.48, [0, o.mgYaw ?? -0.04, 0]);
  for (const s of [-1, 1]) seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
    h: s < 0 ? (o.whipL ?? 0.66) : (o.whipR ?? 0.56), r: 0.013,
    rake: -s * 0.05, seed: (o.seed ?? 81) + 2 + (s > 0 ? 1 : 0) }),
    s * (o.whipX ?? 0.92), y - 0.08, o.whipZ ?? -1.42);
}

function addUkrainianSmoke(P, x, y, z, count = 4, seed = 90) {
  for (const s of [-1, 1]) {
    seat(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count, r: 0.043,
      len: 0.29, splay: s * 1.02, pitch: -0.44, arc: 0.56, spacing: 0.098,
      slot: 'detail', rotation: [0, 0, -s * 0.12], seed: seed + (s > 0 ? 1 : 0) }),
      s * x, y, z);
  }
}

function addT64DonbasKit(P) {
  const { box, cylZ } = KIT;
  // The Donbas oracle's defining two-tier Kontakt-1 side band.  Blocks are
  // seated against the intact source-authored skirt and never enter the
  // suspension corridor.
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = 1.38 - i * 0.43;
    addKontaktTile(P, 'hull', s * 1.705, 1.02, z, 0.075, 0.25, 0.35,
      [0, 0, -s * (0.025 + i * 0.004)], false);
    addKontaktTile(P, 'hull', s * 1.715, 0.78, z, 0.075, 0.18, 0.35,
      [0, 0, -s * 0.025], false);
  }

  // A denser, stepped cheek horseshoe with clear mantlet and sight gaps.
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      const x = s * (0.30 + i * 0.22);
      const z = 1.16 - i * 0.13 - row * 0.20;
      addKontaktTile(P, 'turret', x, 0.50 - row * 0.18, z, 0.20, 0.22, 0.20,
        [-0.20 + row * 0.07, s * (0.04 + i * 0.075), s * 0.025], false);
    }
  }

  // Oracle rear identity: two long snorkel/fuel cylinders, supported at
  // three saddles, plus a shielded Ukrainian field MG station.
  for (const s of [-1, 1]) {
    P.add('turret', cylZ(0.155, 1.48, 16), s * 0.71, 0.39, -1.68);
    for (const z of [-2.16, -1.68, -1.20]) P.add('turretDark', cylZ(0.164, 0.040, 14),
      s * 0.71, 0.39, z);
    P.add('turretDetail', box(0.08, 0.23, 0.12), s * 0.71, 0.26, -1.30);
    P.add('turretDetail', box(0.08, 0.23, 0.12), s * 0.71, 0.26, -2.05);
  }
  addUkrainianRoofSuite(P, { y: 0.86, panoX: 0.48, panoZ: -0.16,
    mgX: -0.43, mgZ: -0.55, mgScale: 0.82, seed: 6410, whipZ: -1.55 });
  P.addGunExtra(box(0.56, 0.32, 0.22), 0, -0.02, 0.34);
  P.decal('turret', 'number', 'UA 64', 0.22, [-1.34, 0.39, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.30);
}

function buildUAT64BV(P) {
  buildT64BV1(P);
  addT64DonbasKit(P);
}

function addT80BVUkraineKit(P) {
  const { box, cylZ } = KIT;
  // Kontakt-1 fan follows the low cast cheek; the centerline remains open
  // for the 2A46 mask and primary sight.
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const x = s * (0.25 + i * 0.19);
      const z = 1.05 - i * 0.105 - row * 0.19;
      addKontaktTile(P, 'turret', x, 0.49 - row * 0.17, z, 0.18, 0.22, 0.18,
        [-0.18 + row * 0.06, s * (0.04 + i * 0.055), s * 0.025], false);
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    addKontaktTile(P, 'hull', s * 1.655, 1.05, 1.44 - i * 0.48,
      0.075, 0.26, 0.40, [0, 0, -s * 0.025], false);
  }
  // Front glacis raft, centered around the driver rather than hiding it.
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    addKontaktTile(P, 'hull', s * (0.24 + i * 0.29), 1.26 - row * 0.04,
      2.08 - row * 0.31, 0.25, 0.10, 0.27, [-0.30, 0, 0], false);
  }
  // Rear drums and protected NSVT follow the actual Ukrainian reference.
  for (const s of [-1, 1]) {
    P.add('turret', cylZ(0.155, 1.36, 16), s * 0.73, 0.36, -1.62);
    P.add('turretDark', cylZ(0.165, 0.045, 14), s * 0.73, 0.36, -2.05);
    P.add('turretDark', cylZ(0.165, 0.045, 14), s * 0.73, 0.36, -1.19);
  }
  addUkrainianRoofSuite(P, { y: 0.81, panoX: 0.50, panoZ: -0.18,
    mgX: -0.44, mgZ: -0.48, mgScale: 0.84, seed: 8020, whipZ: -1.40 });
  addUkrainianSmoke(P, 1.02, 0.65, 0.04, 4, 8030);
  P.addGunExtra(box(0.52, 0.30, 0.22), 0, -0.02, 0.34);
  P.decal('turret', 'number', 'UA 80', 0.22, [1.30, 0.37, -0.72], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.28);
}

function buildUAT80BV(P) {
  T80_PROFILES.t80bv.build(P);
  addT80BVUkraineKit(P);
}

function addT80UKurskKit(P) {
  const { box, cylZ } = KIT;
  // Kontakt-5 wedge shoulders: broad, buried modules, not loose rectangles.
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const x = s * (0.28 + i * 0.235);
    const z = 1.15 - i * 0.16;
    addKontaktTile(P, 'turret', x, 0.46 - i * 0.018, z, 0.24, 0.30, 0.28,
      [-0.24, s * (0.04 + i * 0.07), s * 0.035], true);
  }
  // Matching Kontakt-5 glacis and shallow side modules.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    addKontaktTile(P, 'hull', s * (0.25 + i * 0.31), 1.28, 2.10,
      0.28, 0.11, 0.34, [-0.30, 0, 0], true);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    addKontaktTile(P, 'hull', s * 1.68, 1.03, 1.16 - i * 0.68,
      0.075, 0.36, 0.58, [0, 0, -s * 0.025], false);
  }
  // Tall primary sight, asymmetric roof crates and rolled rear snorkel are
  // the specific Kursk-oracle tells.
  P.add('turret', box(0.32, 0.09, 0.30), 0.55, 0.78, 0.20);
  P.add('turretDetail', box(0.28, 0.45, 0.26), 0.55, 1.02, 0.20);
  P.add('turretGlass', box(0.19, 0.25, 0.024), 0.55, 1.04, 0.345);
  P.add('turret', cylZ(0.14, 1.70, 16), 0, 0.58, -1.50);
  for (const s of [-1, 1]) P.add('turret', box(0.43, 0.38, 0.48),
    s * 1.10, 0.40, -1.05 + (s > 0 ? 0.14 : -0.10));
  addUkrainianRoofSuite(P, { y: 0.83, panoX: -0.40, panoZ: -0.42,
    mgX: -0.54, mgZ: -0.62, mgScale: 0.84, seed: 8040, whipZ: -1.55 });
  addUkrainianSmoke(P, 1.08, 0.62, 0.08, 5, 8050);
  P.addGunExtra(box(0.58, 0.34, 0.24), 0, -0.01, 0.36);
  P.decal('turret', 'number', 'KURSK', 0.20, [-1.32, 0.37, -0.76], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.44);
}

function buildUAT80UKursk(P) {
  MISC_PROFILES.t80u.build(P);
  addT80UKurskKit(P);
}

function addOplotMKit(P) {
  const { box, cylY } = KIT;
  const slab = orientedSlab;
  // Oplot-M welded cheek continuations and Duplet edge modules follow the
  // reference's low arrowhead.  Lower faces overlap the certified T-84
  // shell so all armor has a visible load path.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.26, 0.08, 1.50], [s * 1.34, 0.08, 1.05], [s * 1.48, 0.08, 0.18], [s * 0.42, 0.08, 0.48],
      [s * 0.26, 0.66, 1.38], [s * 1.22, 0.60, 0.92], [s * 1.36, 0.56, 0.14], [s * 0.42, 0.68, 0.42]));
    for (let i = 0; i < 5; i++) addKontaktTile(P, 'turret', s * 1.47,
      0.40 + (i & 1) * 0.025, 0.50 - i * 0.42, 0.16, 0.38, 0.36,
      [0, 0, s * 0.08], true);
    // Full-height Duplet skirt cassettes retain the native running gear.
    for (let i = 0; i < 7; i++) addKontaktTile(P, 'hull', s * 1.73,
      1.04, 1.72 - i * 0.62, 0.085, 0.55, 0.52, [0, 0, -s * 0.025], false);
  }
  // Two-course glacis protection with a center driver/sight break.
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    addKontaktTile(P, 'hull', s * (0.24 + i * 0.30), 1.30 - row * 0.04,
      2.20 - row * 0.34, 0.27, 0.105, 0.30, [-0.31, 0, 0], true);
  }
  // Source's tall panoramic tower and compact remote weapon station.
  P.add('turret', box(0.42, 0.09, 0.39), -0.52, 0.82, -0.34);
  P.add('turretDetail', box(0.32, 0.52, 0.30), -0.52, 1.11, -0.34);
  P.add('turretGlass', box(0.22, 0.31, 0.026), -0.52, 1.13, -0.175);
  P.add('turret', box(0.34, 0.09, 0.34), 0.58, 0.83, -0.62);
  P.add('turretDetail', cylY(0.14, 0.16, 0.25, 14), 0.58, 1.00, -0.62);
  seat(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
    elev: 0.10, shield: true, ammo: true, scale: 0.80, seed: 8401 }),
    0.58, 1.06, -0.72, [0, 0.04, 0]);
  addUkrainianSmoke(P, 1.20, 0.65, 0.04, 5, 8410);
  for (const s of [-1, 1]) seat(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
    h: s < 0 ? 0.76 : 0.64, r: 0.013, rake: -s * 0.05, seed: 8420 + (s > 0 ? 1 : 0) }),
    s * 1.10, 0.74, -2.12);
  P.addGunExtra(box(0.70, 0.40, 0.24), 0, -0.01, 0.38);
  P.decal('turret', 'number', 'OPLOT', 0.22, [1.50, 0.40, -0.84], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.66);
}

function buildUAOplotM(P) {
  T80_PROFILES.t84.build(P);
  addOplotMKit(P);
}

function addCageBar(P, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  P.add('turretDark', KIT.box(w, h, d), x, y, z, rx, ry, rz);
}

function addAbramsDroneCage(P) {
  const t = 0.035;
  const x = 1.66;
  const zFront = 1.18;
  const zRear = -2.68;
  const yBottom = 0.42;
  const yTop = 1.52;

  // Side walls: closed frames plus a fine grid.  Every vertical terminates
  // at both horizontal rails; every wall returns into front/rear corners.
  for (const s of [-1, 1]) {
    addCageBar(P, t, t, zFront - zRear, s * x, yBottom, (zFront + zRear) / 2);
    addCageBar(P, t, t, zFront - zRear, s * x, yTop, (zFront + zRear) / 2);
    for (let i = 0; i <= 6; i++) {
      const z = zRear + i * (zFront - zRear) / 6;
      addCageBar(P, t, yTop - yBottom, t, s * x, (yTop + yBottom) / 2, z);
    }
    for (let i = 1; i <= 3; i++) {
      const y = yBottom + i * (yTop - yBottom) / 4;
      addCageBar(P, t * 0.72, t * 0.72, zFront - zRear, s * (x + 0.002), y, (zFront + zRear) / 2);
    }
    // Broad armor shoes plant the cage into the turret flanks.
    for (const z of [-2.28, -1.28, -0.28, 0.72]) {
      addCageBar(P, 0.16, 0.10, 0.28, s * 1.49, yBottom - 0.01, z, 0, 0, s * 0.10);
    }
  }

  // Rear wall.
  addCageBar(P, x * 2, t, t, 0, yBottom, zRear);
  addCageBar(P, x * 2, t, t, 0, yTop, zRear);
  for (let i = 0; i <= 6; i++) addCageBar(P, t, yTop - yBottom, t,
    -x + i * (2 * x) / 6, (yTop + yBottom) / 2, zRear);
  for (let i = 1; i <= 3; i++) addCageBar(P, x * 2, t * 0.72, t * 0.72,
    0, yBottom + i * (yTop - yBottom) / 4, zRear);

  // Sloped front cage around—not through—the mantlet and gun.  Inner rails
  // stop at x ±0.40, leaving a clean elevation aperture.
  const frontY = [0.48, 0.80, 1.12, 1.44];
  for (const s of [-1, 1]) {
    for (const y of frontY) {
      const z = zFront - (y - yBottom) * 0.28;
      addCageBar(P, x - 0.40, t, t, s * (0.40 + (x - 0.40) / 2), y, z);
    }
    for (let i = 0; i <= 3; i++) {
      const px = s * (0.40 + i * (x - 0.40) / 3);
      addCageBar(P, t, yTop - yBottom, t, px, (yTop + yBottom) / 2, zFront - 0.15, -0.27, 0, 0);
    }
  }

  // Roof canopy: perimeter, longitudinal stringers and transverse grid.
  addCageBar(P, x * 2, t, t, 0, yTop, zFront);
  addCageBar(P, x * 2, t, t, 0, yTop, zRear);
  for (let i = 0; i <= 6; i++) addCageBar(P, t, t, zFront - zRear,
    -x + i * (2 * x) / 6, yTop, (zFront + zRear) / 2);
  for (let i = 1; i <= 5; i++) addCageBar(P, x * 2, t * 0.72, t * 0.72,
    0, yTop, zRear + i * (zFront - zRear) / 6);

  // Small forward-facing EO cluster on a seated center cage crossmember.
  addCageBar(P, 0.56, 0.12, 0.18, 0, 1.28, 0.93);
  P.add('turretGlass', KIT.box(0.22, 0.08, 0.025), 0, 1.29, 1.035);
  P.decal('turret', 'number', 'UA M1', 0.24, [-1.48, 0.32, -0.80], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.58);
}

function buildUAM1A1(P) {
  // buildTejasFamily branches on the source family id.  Present the exact
  // M1A1HA id only for the base build, then restore the Ukrainian identity
  // before attaching the first-party cage and decals.
  const id = P.spec.id;
  P.spec.id = 'm1a1ha';
  try {
    ABRAMS_PROFILES.m1a1ha.build(P, ABRAMS_PROFILES.m1a1ha);
  } finally {
    P.spec.id = id;
  }
  addAbramsDroneCage(P);
}

export const UKRAINE_PROFILES = {
  ua_t64bv: { build: buildUAT64BV },
  ua_t80bv: { build: buildUAT80BV },
  ua_t80u_kursk: { build: buildUAT80UKursk },
  ua_t84_oplot_m: { build: buildUAOplotM },
  ua_m1a1: { build: buildUAM1A1 },
};
