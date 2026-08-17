// First-party Japanese armored-family derivatives. The owner-supplied GLBs
// remain external silhouette/metric oracles: no source topology is imported.
// Each builder preserves its complete donor hull, skirts and single smart
// running-gear course, then adds source-specific supported armor/equipment.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildType10Native2026 } from '../modern3.js';
import { buildType90 } from './misc.js';

function mount(P, fitting, x, y, z, rotation = null, owner = 'turret') {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function cassette(P, owner, x, y, z, w, h, d, rotation = null, fastener = true) {
  const r = rotation || [0, 0, 0];
  const armor = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(armor, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (fastener) P.add(detail, KIT.box(w * 0.68, 0.014, Math.max(0.025, d * 0.07)),
    x, y + h * 0.5 + 0.009, z + d * 0.25, r[0], r[1], r[2]);
}

function whips(P, y, z, seed, spread = 1.02) {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.036, 0.046, 0.060, 10), side * spread, y, z);
    mount(P, FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.98 : 0.90, r: 0.011,
      rake: side * 0.035, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.025, z);
  }
}

function smoke(P, x, y, z, count, seed, pitch = -0.38) {
  for (const side of [-1, 1]) mount(P, FITTINGS.smokeBank({
    mats: P.mats, count, r: 0.041, len: 0.28, splay: side * 1.02,
    pitch, arc: 0.55, spacing: 0.10, slot: 'detail',
    rotation: [0, 0, -side * 0.10], seed: seed + (side > 0 ? 1 : 0),
  }), side * x, y, z);
}

function roofWeapon(P, x, y, z, seed, scale = 0.78, yaw = 0) {
  P.add('turret', KIT.box(0.46, 0.075, 0.43), x, y, z);
  P.add('turretDark', KIT.box(0.36, 0.020, 0.33), x, y + 0.048, z);
  P.add('turret', KIT.cylY(0.19, 0.21, 0.070, 16), x, y + 0.085, z);
  mount(P, FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.10,
    shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed,
  }), x, y + 0.105, z, [0, yaw, 0]);
}

function joinedBasket(P, width, y, z, depth, seed) {
  P.add('turretDark', KIT.box(width, 0.30, 0.045), 0, y, z - depth * 0.5);
  for (const yy of [y - 0.14, y, y + 0.14])
    P.add('turretDetail', KIT.box(width + 0.18, 0.026, 0.030), 0, yy, z - depth - 0.025);
  for (let i = 0; i < 8; i++) P.add('turretDetail', KIT.box(0.026, 0.38, 0.030),
    -width * 0.47 + i * (width * 0.94 / 7), y, z - depth - 0.025);
  mount(P, FITTINGS.stowageRack({
    mats: P.mats, w: width * 0.76, d: depth * 0.62, h: 0.22,
    fill: 0.45, rails: 3, seed,
  }), 0, y + 0.14, z - depth * 0.50);
}

function buildSTB1(P) {
  const {
    box, cylY, cylZ, torus, lathe, frustum, xform, buildGun,
    buildRunningGear, fenders, headlight, liftEye, periscope, cupola,
  } = KIT;
  const seg = P.q ? 36 : 18;

  // The owner reference is an unusually low, broad STB prototype—not the
  // taller production Type 74.  This is therefore a complete standalone
  // hull, turret and running-gear build.  No Type 74 bucket survives here.
  // Lower tub and the shallow full-width shoulder course.
  P.add('hull', box(1.92, 0.46, 5.78), 0, 0.51, -0.08);
  P.add('hull', box(2.88, 0.12, 4.55), 0, 1.20, -0.18);
  P.add('hull', box(2.82, 0.045, 3.95), 0, 1.295, -0.36);
  for (const side of [-1, 1]) {
    P.add('hull', box(0.47, 0.10, 4.90), side * 1.255, 1.21, -0.10);
    P.add('hull', box(0.055, 0.46, 5.80), side * 0.985, 0.91, -0.08);
  }

  // Needle nose: a swept two-plane upper glacis and tucked lower chin.  The
  // source has a visible center crease and no tall vertical bow wall.
  for (const side of [-1, 1]) {
    const upper = [
      [side * 0.02, 0.78, 2.98], [side * 0.94, 0.80, 2.80],
      [side * 0.94, 0.86, 2.72], [side * 0.02, 0.84, 2.90],
      [side * 0.02, 1.32, 2.12], [side * 0.98, 1.32, 1.96],
      [side * 0.98, 1.28, 1.87], [side * 0.02, 1.28, 2.03],
    ];
    // Mirroring the upper wedge reverses the ring.  Reorder its corners so
    // both halves retain outward-facing winding without changing the crease.
    const u = side < 0
      ? [upper[0], upper[3], upper[2], upper[1], upper[4], upper[7], upper[6], upper[5]]
      : upper;
    P.add('hull', orientedSlab(...u));
    P.add('hull', orientedSlab(
      [side * 0.02, 0.35, 2.78], [side * 0.90, 0.37, 2.61],
      [side * 0.90, 0.43, 2.50], [side * 0.02, 0.41, 2.67],
      [side * 0.02, 0.80, 2.96], [side * 0.94, 0.82, 2.78],
      [side * 0.94, 0.76, 2.68], [side * 0.02, 0.74, 2.86]));
  }
  P.add('hullDetail', box(1.50, 0.035, 0.045), 0, 1.08, 2.48, -0.50, 0, 0);

  // Low squared stern, cooling banks and source-specific external exhaust.
  P.add('hull', box(1.82, 0.79, 0.10), 0, 0.75, -2.98);
  P.add('hull', box(2.72, 0.055, 0.54), 0, 1.31, -2.70);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.62, 0.30, 0.028), side * 0.63, 0.91, -3.04);
    for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.55, 0.018, 0.024),
      side * 0.63, 0.80 + i * 0.055, -3.058);
    P.add('hullDark', box(0.12, 0.10, 0.032), side * 0.96, 1.12, -3.06);
    P.add('hull', box(0.34, 0.16, 0.62), side * 1.29, 1.32, -1.62);
    P.add('hull', box(0.34, 0.13, 0.72), side * 1.29, 1.30, -0.55);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    P.add('hullDark', box(0.78, 0.018, 0.24), side * 0.59, 1.335, -1.65 - i * 0.25);
    P.add('hullDetail', box(0.72, 0.024, 0.028), side * 0.59, 1.348, -1.55 - i * 0.25);
  }

  // Thin broken fenders and fully exposed native track run.  Source has no
  // full-height side skirts; the five suspension stations remain countable.
  fenders(P, 1.02, 1.555, 1.29, -2.78, 2.72, 0.028);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) P.add('hullDetail', box(0.46, 0.025, 0.035),
      side * 1.30, 1.315, -2.45 + i * 0.92);
    P.add('hullDark', box(0.40, 0.10, 0.035), side * 1.31, 1.25, -2.86);
    P.add('hullDark', box(0.42, 0.10, 0.035), side * 1.31, 1.25, 2.72);
  }
  // Driver's hatch, periscopes, twin light clusters, tow fixtures and cable.
  P.add('hull', cylY(0.23, 0.24, 0.040, 16), -0.48, 1.335, 1.64);
  P.add('hullDark', box(0.37, 0.014, 0.045), -0.48, 1.36, 1.64);
  for (const x of [-0.68, -0.48, -0.28]) periscope(P, 'hullDetail', x, 1.37, 1.88);
  for (const side of [-1, 1]) {
    headlight(P, side * 1.06, 1.29, 2.29, -0.28, 0.067);
    headlight(P, side * 0.87, 1.30, 2.34, -0.28, 0.050);
    P.add('hullDetail', torus(0.082, 0.014, 14), side * 0.54, 0.55, 2.82,
      Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', side * 1.18, 1.33, 1.85, side * 0.24);
  }
  P.add('hullDark', box(1.88, 0.29, 0.035), 0, 0.53, 2.84);
  P.add('hullDetail', box(1.62, 0.035, 0.045), 0, 0.69, 2.865);
  mount(P, FITTINGS.towCable({
    mats: P.mats,
    pts: [[-0.95, 1.16, 2.28], [0, 1.29, 2.00], [0.95, 1.16, 2.28]],
    r: 0.017, seed: 1101,
  }), 0, 0, 0, null, 'hull');

  const wheelZs = [1.60, 0.79, -0.02, -0.83, -1.64];
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.86, wheelR: 0.455, wheelW: 0.26,
    wheelY: 0.51, xc: 1.33,
    wheelZs,
    sprocket: { z: -2.55, y: 0.74, r: 0.42 },
    idler: { z: 2.48, y: 0.74, r: 0.42 },
    rollers: [], trackW: 0.55, trackTh: 0.090, topY: 1.16, botY: 0.03,
    deadSag: 0.045, paintedEnds: true, coveredTop: false, arms: true,
  });

  // One high-segment cast shell supplies the silhouette.  Its broad lower
  // shoulder, narrowing crown and stretched plan match the source's organic
  // teardrop turret without a flat donor cylinder or a second armor shell.
  P.add('turret', lathe([
    [0.90, -0.035], [1.14, 0.02], [1.30, 0.10], [1.34, 0.22],
    [1.30, 0.35], [1.15, 0.49], [0.92, 0.61], [0.60, 0.70],
    [0.28, 0.755], [0.015, 0.77],
  ], seg, 1.17), 0, 0, -0.22);
  P.add('turret', box(1.72, 0.13, 1.16), 0, 0.035, -0.62);
  P.add('turretDark', box(1.64, 0.020, 1.08), 0, -0.035, -0.62);
  // Shallow bustle extension is buried into the casting and closes with a
  // backed rear service face—never a free-floating pack.
  P.add('turret', frustum(0.85, -0.55, -1.82, 0.66, -0.64, -1.73, 0.04, 0.41));
  P.add('turret', box(1.24, 0.30, 0.055), 0, 0.26, -1.83);

  // Source flank ventilation arrays, access plates and grab rails.  These
  // break up the casting while remaining flush with its local side envelope.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.25 - i * 0.22;
      P.add('turretDark', box(0.045, 0.27, 0.19), side * 1.175, 0.38, z,
        0, side * 0.07, 0);
      for (let rib = -1; rib <= 1; rib++) P.add('turretDetail',
        box(0.050, 0.018, 0.16), side * 1.202, 0.38 + rib * 0.085, z,
        0, side * 0.07, 0);
      P.add('turretDetail', box(0.052, 0.29, 0.018), side * 1.202, 0.38,
        z - 0.095, 0, side * 0.07, 0);
    }
    P.add('turret', box(0.035, 0.27, 0.37), side * 1.115, 0.29, -0.70,
      0, side * 0.08, 0);
    P.add('turretDetail', box(0.024, 0.024, 0.92), side * 1.115, 0.49, -0.57);
    for (const z of [-0.98, -0.18]) P.add('turretDetail', box(0.10, 0.024, 0.024),
      side * 1.07, 0.49, z);
    liftEye(P, 'turretDetail', side * 0.72, 0.60, 0.42, side * 0.30);
  }

  // The oracle's four-cell cheek grilles are a primary frontal identifier.
  // Each cell has a shallow armor backing and is canted with the casting.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.070, 0.34, 0.70), side * 1.105, 0.40, 0.59,
      0, side * 0.10, 0);
    for (let i = 0; i < 4; i++) {
      const z = 0.84 - i * 0.17;
      P.add('turretDark', box(0.034, 0.25, 0.142), side * 1.153, 0.41, z,
        0, side * 0.10, 0);
      P.add('turretDetail', box(0.040, 0.020, 0.128), side * 1.174, 0.49,
        z, 0, side * 0.10, 0);
      P.add('turretDetail', box(0.040, 0.020, 0.128), side * 1.174, 0.33,
        z, 0, side * 0.10, 0);
    }
  }

  // Signature left-front multi-pane searchlight: solid armored cradle,
  // hood, six luminous panes and a conduit seated back into the cheek.
  P.add('turret', box(0.54, 0.40, 0.38), 0.73, 0.52, 1.04, -0.05, 0, 0);
  P.add('turret', box(0.58, 0.055, 0.13), 0.73, 0.75, 1.15, -0.05, 0, 0);
  P.add('turretDark', box(0.48, 0.33, 0.028), 0.73, 0.52, 1.242);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    P.add('turretGlass', box(0.160, 0.080, 0.018), 0.642 + col * 0.176,
      0.42 + row * 0.112, 1.262);
  }
  P.add('turretDetail', box(0.085, 0.42, 0.085), 0.73, 0.27, 0.92);
  P.add('turretDark', box(0.025, 0.025, 0.76), 1.02, 0.49, 0.62, 0, 0.32, 0);

  // Offset rangefinder blisters and their backed optic faces give the side
  // elevation the same asymmetric equipment cadence as the source print.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.16, 0.24, 0.32), side * 1.08, 0.43, -0.30,
      0, side * 0.08, 0);
    P.add('turretDark', box(0.028, 0.16, 0.22), side * 1.175, 0.44, -0.29,
      0, side * 0.08, 0);
    P.add('turretGlass', box(0.020, 0.09, 0.13), side * 1.193, 0.45, -0.27,
      0, side * 0.08, 0);
  }

  // Two different roof stations, low hatches, periscopes and the source's
  // commander-mounted machine gun keep the crown detailed but not tall.
  cupola(P, 'turret', 0.43, 0.70, -0.38, 0.30, 0.105, 10);
  P.add('turret', cylY(0.245, 0.275, 0.085, 18), 0.43, 0.815, -0.38);
  P.add('turretDark', torus(0.245, 0.014, 24), 0.43, 0.865, -0.38);
  // The source commander station is a low two-tier drum surrounded by
  // individually readable vision blocks, not a featureless roof cylinder.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P.add('turretGlass', box(0.095, 0.075, 0.032),
      0.43 + Math.sin(a) * 0.255, 0.835, -0.38 + Math.cos(a) * 0.255,
      0, a, 0);
  }
  P.add('turret', box(0.29, 0.13, 0.22), 0.43, 0.94, -0.31, -0.04, 0, 0);
  P.add('turretDark', box(0.21, 0.075, 0.025), 0.43, 0.95, -0.184);
  P.add('turretGlass', box(0.15, 0.045, 0.018), 0.43, 0.95, -0.201);
  P.add('turret', cylY(0.245, 0.285, 0.075, 20), -0.43, 0.725, -0.12);
  P.add('turret', cylY(0.205, 0.225, 0.040, 20), -0.43, 0.785, -0.12);
  P.add('turretDark', torus(0.226, 0.014, 24), -0.43, 0.805, -0.12);
  P.add('turretDark', box(0.36, 0.016, 0.034), -0.43, 0.815, -0.12,
    0, 0.08, 0);
  P.add('turretDetail', box(0.055, 0.045, 0.15), -0.20, 0.795, -0.12,
    0, 0.08, 0);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P.add('turretGlass', box(0.075, 0.055, 0.026),
      -0.43 + Math.sin(a) * 0.238, 0.777, -0.12 + Math.cos(a) * 0.238,
      0, a, 0);
  }
  for (const [x, z, yaw] of [[0.14, 0.38, 0], [-0.22, 0.34, 0.15], [0.69, -0.05, -0.2]])
    periscope(P, 'turretDetail', x, 0.80, z, yaw);
  mount(P, FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.70, elev: 0.04,
    shield: false, ammo: true, ring: { r: 0.15, stubs: 3 }, seed: 1110,
  }), 0.43, 0.82, -0.38, [0, -0.05, 0]);
  P.add('turretDark', box(0.11, 0.10, 0.31), 0.43, 0.94, -0.22);
  P.add('turretDark', cylZ(0.018, 0.58, 10), 0.43, 0.96, 0.22, -0.05, 0, 0);
  P.add('turretDark', box(0.15, 0.12, 0.10), 0.56, 0.92, -0.30);

  // The source crown terminates in a broad backed mesh ventilation field.
  // Its shallow shoe overlaps the cast roof so it reads as fitted hardware,
  // not a black decal or a floating grate.
  P.add('turret', box(0.82, 0.055, 0.42), 0, 0.615, -1.15, -0.07, 0, 0);
  P.add('turretDark', box(0.72, 0.030, 0.34), 0, 0.652, -1.15, -0.07, 0, 0);
  for (let i = -3; i <= 3; i++) P.add('turretDetail', box(0.035, 0.020, 0.31),
    i * 0.10, 0.675, -1.15, -0.07, 0, 0);

  // Small supported smoke banks and a continuous bustle basket/cage.  Every
  // rail has a visible return into the turret or its backed rear face.
  for (const side of [-1, 1]) mount(P, FITTINGS.smokeBank({
    mats: P.mats, count: 3, r: 0.040, len: 0.23, splay: side * 0.86,
    pitch: -0.38, arc: 0.48, spacing: 0.09, slot: 'detail', seed: 1120 + side,
  }), side * 0.92, 0.52, -0.72);
  for (const side of [-1, 1]) {
    for (const y of [0.17, 0.39]) P.add('turretDetail', box(0.025, 0.025, 0.88),
      side * 1.20, y, -1.42);
    for (let i = 0; i < 4; i++) P.add('turretDetail', box(0.025, 0.25, 0.025),
      side * 1.20, 0.28, -1.02 - i * 0.28);
    P.add('turretDetail', box(0.24, 0.025, 0.025), side * 1.08, 0.39, -1.86);
  }
  for (const y of [0.17, 0.39]) P.add('turretDetail', box(2.42, 0.025, 0.025),
    0, y, -1.88);
  for (let i = 0; i < 8; i++) P.add('turretDetail', box(0.025, 0.25, 0.025),
    -1.16 + i * (2.32 / 7), 0.28, -1.88);
  mount(P, FITTINGS.stowageRack({
    mats: P.mats, w: 1.72, d: 0.55, h: 0.16, fill: 0.50, rails: 3, seed: 1130,
  }), 0, 0.37, -1.58);
  whips(P, 0.48, -1.56, 1140, 0.83);

  // Rounded cast saddle and long bare L7 tube.  The gun group remains the
  // only pitch owner; the searchlight and all roof equipment yaw with turret.
  P.addGunExtra(box(0.66, 0.38, 0.20), 0, 0, 0.28);
  P.addGunExtra(xform(KIT.sph(0.26, seg), 0, 0, 0, 0, 0, 0,
    [1.48, 0.90, 0.82]), 0, 0, 0.46);
  P.addGunExtra(cylZ(0.145, 0.34, seg, 0.115), 0, 0, 0.66);
  P.addGunExtraDark(cylZ(0.031, 0.10, 10), 0.27, 0.07, 0.50);
  buildGun(P, { len: 4.72, r: 0.062, sleeve: false, evac: 0.46,
    evacR: 1.72, collar: false, baseR: 0.145 });
  P.add('gunDark', cylZ(0.067, 0.075, 12), 0, 0, 4.695);

  P.decal('turret', 'number', 'STB-1', 0.21, [-1.23, 0.31, -0.54], -Math.PI / 2);
  P.topY = 1.04;
}

function addType90APackage(P) {
  const { box, cylY, cylZ, torus } = KIT;
  // Replace the quiet cheek read with joined, faceted NERA carriers and
  // shallow service cassettes. Every carrier overlaps the donor turret core.
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.22, 0.02, 1.22], [side * 1.50, 0.02, 0.78],
      [side * 1.45, 0.03, -0.40], [side * 0.42, 0.03, 0.24],
      [side * 0.20, 0.57, 1.03], [side * 1.31, 0.60, 0.58],
      [side * 1.28, 0.55, -0.48], [side * 0.39, 0.59, 0.16]));
    for (let i = 0; i < 4; i++) cassette(P, 'turret', side * (0.58 + i * 0.25),
      0.60 - i * 0.018, 0.89 - i * 0.17, 0.22, 0.18, 0.21,
      [-0.14, side * (0.04 + i * 0.04), side * 0.02], false);
    // Armored skirt modules remain outside the hull side but above the linked
    // shoe course; they do not replace or hide donor running gear.
    for (let i = 0; i < 6; i++) cassette(P, 'hull', side * 1.70, 1.07,
      1.78 - i * 0.70, 0.055, 0.40, 0.62, null, false);
  }
  // Large panoramic thermal head and shielded low roof weapon.
  P.add('turret', box(0.48, 0.075, 0.46), -0.55, 0.86, -0.22);
  P.add('turretDetail', box(0.38, 0.34, 0.35), -0.55, 1.04, -0.18, -0.05, 0, 0);
  P.add('turretDark', box(0.28, 0.18, 0.032), -0.55, 1.06, 0.03);
  P.add('turretGlass', box(0.20, 0.11, 0.022), -0.55, 1.06, 0.055);
  P.add('turret', cylY(0.27, 0.29, 0.075, 18), 0.50, 0.86, -0.48);
  P.add('turretDark', torus(0.25, 0.014, 18), 0.50, 0.91, -0.48);
  roofWeapon(P, 0.50, 0.92, -0.48, 9010, 0.82, -0.04);

  // The donor's broad welded roof remains the correct Type 90 family mass,
  // but the A package needs a visible service grammar at garage distance.
  // Keep every addition shallow and seated: split hatch, vision blocks,
  // weld courses and access plates all overlap the existing roof plane.
  P.add('turret', cylY(0.27, 0.29, 0.065, 18), -0.43, 0.87, -0.71);
  P.add('turretDark', torus(0.255, 0.014, 18), -0.43, 0.91, -0.71);
  P.add('turret', cylY(0.23, 0.245, 0.030, 18), -0.43, 0.93, -0.71);
  P.add('turretDark', box(0.37, 0.018, 0.034), -0.43, 0.95, -0.71, 0, 0.08, 0);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.72 + i * (Math.PI * 1.44 / 5);
    P.add('turretGlass', box(0.075, 0.055, 0.028),
      -0.43 + Math.sin(a) * 0.275, 0.925, -0.71 + Math.cos(a) * 0.275,
      0, a, 0);
  }
  for (const [z, w] of [[0.72, 1.18], [0.30, 1.52], [-0.20, 1.82], [-0.92, 1.92], [-1.46, 1.68]]) {
    P.add('turretDark', box(w, 0.016, 0.030), 0, 0.862, z);
  }
  for (const [x, z, w, d] of [
    [-0.77, 0.43, 0.38, 0.32], [0.75, 0.34, 0.34, 0.30],
    [-0.82, -1.20, 0.42, 0.30], [0.80, -1.15, 0.38, 0.28],
  ]) {
    P.add('turretDark', box(w + 0.035, 0.020, d + 0.035), x, 0.875, z);
    P.add('turret', box(w, 0.045, d), x, 0.892, z, -0.035, 0, 0);
    P.add('turretDetail', box(w * 0.68, 0.014, 0.025), x, 0.923, z + d * 0.22);
  }

  // Joined flank modules and 360-degree camera/APS heads replace the quiet
  // slab read.  These are NERA/service faces, not a second track or skirt
  // course; their inner faces are buried into the turret shoulders.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = 0.35 - i * 0.38;
      P.add('turretDark', box(0.035, 0.30, 0.33), side * 1.305, 0.48, z,
        0, side * 0.09, 0);
      P.add('turret', box(0.050, 0.26, 0.30), side * 1.325, 0.49, z,
        0, side * 0.09, 0);
      P.add('turretDetail', box(0.054, 0.018, 0.22), side * 1.353, 0.57, z,
        0, side * 0.09, 0);
    }
    P.add('turret', box(0.21, 0.16, 0.23), side * 1.17, 0.69, 0.49,
      -0.06, side * 0.12, 0);
    P.add('turretDark', box(0.022, 0.10, 0.14), side * 1.285, 0.70, 0.51,
      -0.06, side * 0.12, 0);
    P.add('turretGlass', box(0.015, 0.060, 0.080), side * 1.300, 0.71, 0.52,
      -0.06, side * 0.12, 0);
  }
  smoke(P, 1.23, 0.65, 0.08, 5, 9020, -0.44);
  joinedBasket(P, 2.48, 0.47, -1.72, 0.62, 9030);
  whips(P, 0.73, -1.86, 9040, 1.08);
  // Revised Rh-120 plant with broad mask, sleeve, clamp and coax cue.
  P.addGunExtra(box(0.76, 0.50, 0.26), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.19, 0.38, 18, 0.15), 0, 0, 0.67);
  P.addGunExtraDark(cylZ(0.038, 0.10, 10), 0.29, 0.08, 0.58);
  P.decal('turret', 'number', '90-A', 0.20, [1.48, 0.42, -0.78], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.46);
}

function buildType90A(P) {
  buildType90(P);
  addType90APackage(P);
}

function addType10BPackage(P) {
  const { box, cylY, cylZ } = KIT;
  // Sharp modular Type 10B cheek shell. It remains a shallow swept mass and
  // intersects the donor crown, avoiding a second detached turret volume.
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.18, 0.05, 1.46], [side * 1.54, 0.05, 0.80],
      [side * 1.48, 0.05, -0.58], [side * 0.40, 0.05, 0.24],
      [side * 0.16, 0.58, 1.22], [side * 1.30, 0.61, 0.58],
      [side * 1.25, 0.56, -0.65], [side * 0.37, 0.60, 0.15]));
    for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
      cassette(P, 'turret', side * (0.50 + i * 0.23), 0.62 - row * 0.15,
        1.06 - i * 0.16 - row * 0.25, 0.20, 0.14, 0.20,
        [-0.16, side * (0.035 + i * 0.045), side * 0.018], false);
    }
    // High modular side armor is additive over the intact Type 10 skirts and
    // stays clear of the five-wheel smart course.
    for (let i = 0; i < 6; i++) cassette(P, 'hull', side * 1.58, 1.03,
      1.62 - i * 0.68, 0.045, 0.42, 0.60, null, false);
  }
  // Paired EO stations and compact commander's RWS preserve JGSDF asymmetry.
  P.add('turret', box(0.45, 0.075, 0.44), -0.50, 0.88, -0.22);
  P.add('turretDetail', box(0.35, 0.33, 0.32), -0.50, 1.05, -0.17, -0.06, 0, 0);
  P.add('turretDark', box(0.26, 0.17, 0.030), -0.50, 1.06, 0.025);
  P.add('turretGlass', box(0.18, 0.10, 0.020), -0.50, 1.06, 0.048);
  P.add('turret', box(0.34, 0.25, 0.31), 0.70, 0.89, 0.10, -0.08, 0, 0);
  P.add('turretDark', box(0.24, 0.13, 0.026), 0.70, 0.90, 0.285);
  P.add('turretGlass', box(0.16, 0.075, 0.018), 0.70, 0.90, 0.306);
  roofWeapon(P, 0.42, 0.91, -0.58, 10010, 0.78, 0.045);
  smoke(P, 1.23, 0.65, 0.05, 6, 10020, -0.45);
  joinedBasket(P, 2.52, 0.48, -1.74, 0.70, 10030);
  whips(P, 0.74, -1.94, 10040, 1.10);
  // Type 10 Kai 120-mm closed mask and strengthened sleeve.
  P.addGunExtra(box(0.78, 0.50, 0.27), 0, -0.01, 0.40);
  P.addGunExtra(cylZ(0.19, 0.40, 18, 0.15), 0, 0, 0.70);
  P.addGunExtra(cylZ(0.075, 0.22, 12), -0.28, 0.15, 0.47);
  P.addGunExtraDark(cylZ(0.048, 0.045, 12), -0.28, 0.15, 0.60);
  P.addGunExtraDark(cylZ(0.038, 0.10, 10), 0.29, 0.07, 0.61);
  P.decal('turret', 'number', '10-B', 0.20, [-1.48, 0.43, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildType10B(P) {
  buildType10Native2026(P);
  addType10BPackage(P);
}

export const JAPAN_PROFILES = {
  stb1: { build: buildSTB1 },
  type90a: { build: buildType90A },
  type10b: { build: buildType10B },
};
