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

function addUkrainianRoofRelief(P, o = {}) {
  const { box, cylY } = KIT;
  const y = o.y ?? 0.73;
  const front = o.front ?? 0.32;
  const rear = o.rear ?? -0.92;

  // Thin, overlapping roof panels break up the broad cast/welded crown
  // without becoming a second turret shell.  Every plate crosses the roof
  // datum by at least 18 mm, so the visible top skin has a real planted
  // lower half rather than hovering over the armor.
  for (const [x, z, w, d, ry] of [
    [-0.76, front - 0.18, 0.38, 0.34, 0.12],
    [0.78, front - 0.26, 0.34, 0.30, -0.10],
    [-0.10, rear + 0.18, 0.48, 0.28, 0.04],
    [0.58, rear - 0.02, 0.42, 0.30, -0.08],
  ]) {
    P.add('turret', box(w, 0.055, d), x, y - 0.006, z, 0, ry, 0);
    P.add('turretDark', box(w * 0.82, 0.014, d * 0.76), x, y + 0.028, z, 0, ry, 0);
  }

  // Ventilator mushroom, hatch stop and unequal low periscopes.  These are
  // source-scale fittings, not tower blocks; their broad painted feet bury
  // into the roof and the glass is only on the forward exposed face.
  P.add('turret', cylY(0.14, 0.16, 0.075, 14), -0.06, y + 0.015, rear + 0.42);
  P.add('turretDark', cylY(0.115, 0.13, 0.018, 12), -0.06, y + 0.062, rear + 0.42);
  P.add('turretDetail', box(0.19, 0.07, 0.10), -0.42, y + 0.02, rear + 0.24, 0, 0.18, 0);
  for (const [x, z, ry] of [
    [-0.70, front + 0.02, 0.30], [-0.48, front + 0.13, 0.14],
    [0.34, front + 0.10, -0.10], [0.62, front - 0.02, -0.28],
  ]) {
    P.add('turret', box(0.15, 0.09, 0.11), x, y + 0.005, z, 0, ry, 0);
    P.add('turretDark', box(0.12, 0.045, 0.075), x, y + 0.060, z, 0, ry, 0);
    P.add('turretGlass', box(0.084, 0.036, 0.016), x, y + 0.066,
      z + 0.048, 0, ry, 0);
  }

  // Low rear service rail and two unequal strapped packs complete the roof
  // cadence.  The rail ends return into broad armor shoes, and both packs
  // overlap the crown instead of standing in empty air.
  P.add('turretDark', box(1.56, 0.045, 0.045), 0, y + 0.02, rear - 0.42);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.045, 0.045, 0.48), s * 0.78, y + 0.02, rear - 0.20);
    P.add('turret', box(s < 0 ? 0.38 : 0.46, 0.18, 0.30), s * 0.52,
      y + 0.04, rear - 0.27 + (s > 0 ? 0.04 : -0.03));
    P.add('turretDark', box(0.045, 0.20, 0.32), s * 0.52,
      y + 0.04, rear - 0.27 + (s > 0 ? 0.04 : -0.03));
  }
}

function addT64DonbasKit(P) {
  const { box, cylX, cylZ } = KIT;
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
  // Hull-left auxiliary drum and its two retaining saddles complete the
  // reference's unequal aft service cluster; it remains hull-owned while
  // the twin snorkels above rotate with the turret.
  P.add('hullDetail', cylX(0.15, 0.62, 16), -1.02, 1.28, -2.62);
  for (const x of [-1.22, -0.82]) P.add('hullDark', box(0.045, 0.34, 0.18),
    x, 1.22, -2.62);
  addUkrainianRoofSuite(P, { y: 0.86, panoX: 0.48, panoZ: -0.16,
    mgX: -0.43, mgZ: -0.55, mgScale: 0.82, seed: 6410, whipZ: -1.55 });
  addUkrainianRoofRelief(P, { y: 0.73, front: 0.28, rear: -0.94 });
  // Complete the photographed Donbas chevron by extending the outer return
  // one module farther around each cheek.  The buried painted shoe keeps the
  // added block attached to the casting at every turret yaw.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.23, 0.16, 0.22), s * 1.20, 0.24, 0.37, -0.12, s * 0.70, 0);
    P.add('turretTrack', box(0.26, 0.20, 0.24), s * 1.24, 0.30, 0.34, -0.12, s * 0.70, 0);
    P.add('turretDark', box(0.19, 0.016, 0.17), s * 1.24, 0.408, 0.34, -0.12, s * 0.70, 0);
  }
  P.addGunExtra(box(0.56, 0.32, 0.22), 0, -0.02, 0.34);
  P.decal('turret', 'number', 'UA 64', 0.22, [-1.34, 0.39, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.30);
}

function buildUAT64BV(P) {
  buildT64BV1(P);
  addT64DonbasKit(P);
}

function addT80BVUkraineKit(P) {
  const { box, cylX, cylZ } = KIT;
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
  // The oracle's rear bochki are two real transverse cylinders, not the old
  // squared shelf made from fore-aft drums.  Their three saddles overlap the
  // bustle and the dark end caps expose the cylindrical read in quarters.
  for (let i = 0; i < 2; i++) {
    const z = -1.24 - i * 0.38;
    P.add('turret', cylX(0.145, 1.42, 16), 0, 0.35 + i * 0.015, z);
    for (const x of [-0.52, 0, 0.52]) P.add('turretDark', box(0.055, 0.34, 0.18),
      x, 0.29 + i * 0.015, z);
    for (const s of [-1, 1]) P.add('turretDark', cylX(0.151, 0.025, 16),
      s * 0.722, 0.35 + i * 0.015, z);
  }
  addUkrainianRoofSuite(P, { y: 0.81, panoX: 0.50, panoZ: -0.18,
    mgX: -0.44, mgZ: -0.48, mgScale: 0.84, seed: 8020, whipZ: -1.40 });
  addUkrainianRoofRelief(P, { y: 0.71, front: 0.24, rear: -0.82 });
  // Large Luna searchlight on a broad cheek shoe.  A deep armored rim and
  // inset blue-black lens make it readable without turning it into a loose
  // lamp hung beside the turret.
  P.add('turret', box(0.36, 0.30, 0.22), -0.72, 0.38, 0.88, -0.08, -0.20, 0);
  P.add('turretDetail', cylZ(0.18, 0.25, 16), -0.72, 0.48, 1.00);
  P.add('turretDark', cylZ(0.17, 0.028, 16), -0.72, 0.48, 1.135);
  P.add('turretGlass', cylZ(0.125, 0.035, 16), -0.72, 0.48, 1.155);
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
  addUkrainianRoofRelief(P, { y: 0.73, front: 0.28, rear: -0.92 });
  // Kursk's cast nose carries a broken Kontakt course rather than one
  // featureless shield.  Painted shoes bury in the dome; the darker caps
  // and changing yaw expose four individually legible cassettes per side.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = 0.38 + i * 0.23;
    const z = 1.34 - i * 0.18;
    const yaw = 0.38 + i * 0.08;
    P.add('turret', box(0.28, 0.18, 0.24), s * (x - 0.03), 0.38, z - 0.03,
      -0.18, s * yaw, 0);
    P.add('turretTrack', box(0.32, 0.24, 0.27), s * x, 0.45, z,
      -0.18, s * yaw, 0);
    P.add('turretDark', box(0.24, 0.018, 0.20), s * x, 0.579, z,
      -0.18, s * yaw, 0);
  }
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
    // Duplet is a modular cassette field.  Raised face tiles and recessed
    // seams stop the wing from reading as one smooth, flat slab while the
    // larger carrier remains continuously buried in the welded cheek.
    for (let i = 0; i < 6; i++) {
      const z = 1.16 - i * 0.34;
      const yaw = 0.34 + i * 0.055;
      P.add('turretTrack', box(0.30, 0.24, 0.28), s * (0.82 + i * 0.09),
        0.48 - i * 0.012, z, -0.18, s * yaw, 0);
      P.add('turretDark', box(0.23, 0.018, 0.20), s * (0.82 + i * 0.09),
        0.612 - i * 0.012, z, -0.18, s * yaw, 0);
    }
    // Full-height Duplet skirt cassettes retain the native running gear.
    for (let i = 0; i < 7; i++) addKontaktTile(P, 'hull', s * 1.73,
      1.04, 1.72 - i * 0.62, 0.085, 0.55, 0.52, [0, 0, -s * 0.025], false);
  }
  // Two-course glacis protection with a center driver/sight break.
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    addKontaktTile(P, 'hull', s * (0.24 + i * 0.30), 1.30 - row * 0.04,
      2.20 - row * 0.34, 0.27, 0.105, 0.30, [-0.31, 0, 0], true);
  }
  // Source PNK-6 panoramic head: broad planted pedestal, tapered armored
  // tower and framed glass.  The old narrow rectangular chimney was tall
  // but visually under-massed and made the surrounding roof look empty.
  P.add('turret', box(0.50, 0.11, 0.46), -0.52, 0.79, -0.34);
  P.add('turret', box(0.42, 0.20, 0.38), -0.52, 0.92, -0.34);
  P.add('turretDetail', box(0.36, 0.22, 0.32), -0.52, 1.12, -0.34);
  P.add('turretDark', box(0.30, 0.025, 0.035), -0.52, 1.13, -0.168);
  P.add('turretGlass', box(0.24, 0.15, 0.026), -0.52, 1.13, -0.148);
  P.add('turret', box(0.34, 0.09, 0.34), 0.58, 0.83, -0.62);
  P.add('turretDetail', cylY(0.14, 0.16, 0.25, 14), 0.58, 1.00, -0.62);
  seat(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'two-tone',
    elev: 0.12, shield: true, ammo: true, ring: { r: 0.18, stubs: 3 },
    scale: 1.00, seed: 8401 }),
    0.58, 1.03, -0.58, [0, 0.04, 0]);
  addUkrainianRoofRelief(P, { y: 0.74, front: 0.32, rear: -0.96 });
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
