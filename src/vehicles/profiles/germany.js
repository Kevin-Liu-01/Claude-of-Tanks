// German Leopard-family derivatives. The owner-supplied GLBs are external
// comparison material only: no source mesh, topology, material, animation or
// texture data enters runtime. Each derivative preserves its donor's complete
// hull, skirts and one suspension-driven smart course, then adds supported
// source-semantic armor and equipment.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildLeo2A4, buildLeo2A6 } from './leopard.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function plate(P, owner, x, y, z, w, h, d, rotation = null, cap = true) {
  const r = rotation || [0, 0, 0];
  const body = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(body, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(detail, KIT.box(w * 0.72, 0.014, Math.max(0.03, d * 0.08)),
    x, y + h * 0.5 + 0.008, z + d * 0.20, r[0], r[1], r[2]);
}

function mirroredSlab(side, lower, upper) {
  const row = (points) => {
    const mapped = points.map(([x, y, z]) => [side * x, y, z]);
    return side < 0 ? [mapped[1], mapped[0], mapped[3], mapped[2]] : mapped;
  };
  return orientedSlab(...row(lower), ...row(upper));
}

function armorCheeks(P, options = {}) {
  const reach = options.reach || 1.54;
  const crest = options.crest || 0.65;
  for (const side of [-1, 1]) {
    P.add('turret', mirroredSlab(side, [
      [0.22, 0.00, 1.94], [reach, 0.04, 1.48],
      [reach + 0.04, 0.06, 0.54], [0.43, 0.00, 0.92],
    ], [
      [0.20, 0.53, 1.78], [reach - 0.18, crest, 1.34],
      [reach - 0.10, crest - 0.04, 0.46], [0.40, 0.56, 0.82],
    ]));
    for (let i = 0; i < 4; i++) {
      plate(P, 'turret', side * (0.66 + i * 0.24), 0.60 - i * 0.014,
        1.38 - i * 0.19, 0.22, 0.18, 0.22,
        [-0.15, side * (0.05 + i * 0.045), side * 0.015], false);
    }
  }
}

function radioPair(P, y, z, seed, spread = 1.03) {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.06, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.78 : 0.66, r: 0.011,
      rake: side * 0.038, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.02, z);
  }
}

function canadianSmoke(P, count, seed, x = 1.31, z = 0.12) {
  for (const side of [-1, 1]) {
    P.add('turret', KIT.box(0.10, 0.24, 0.46), side * (x - 0.05), 0.43, z,
      0, side * 0.14, 0);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.043, len: 0.29, splay: side * 1.04,
      pitch: -0.44, arc: count > 6 ? 0.72 : 0.58, spacing: 0.095,
      slot: 'detail', seed: seed + (side > 0 ? 1 : 0),
    }), side * x, 0.58, z);
  }
}

function roofWeapon(P, x, y, z, seed, scale = 0.82, yaw = 0) {
  P.add('turret', KIT.box(0.50, 0.075, 0.46), x, y, z);
  P.add('turretDark', KIT.box(0.39, 0.020, 0.35), x, y + 0.048, z);
  P.add('turret', KIT.cylY(0.20, 0.22, 0.075, 18), x, y + 0.09, z);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.11,
    shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed,
  }), x, y + 0.11, z, [0, yaw, 0]);
}

function addSideSlat(P, owner, side, options) {
  const body = owner === 'hull' ? 'hullDark' : 'turretDark';
  const rail = owner === 'hull' ? 'hullDetail' : 'turretDetail';
  const outer = options.outer;
  const seat = options.seat;
  const y0 = options.y0;
  const y1 = options.y1;
  const z0 = options.z0;
  const z1 = options.z1;
  const sections = options.sections || 4;
  const sectionLength = (z1 - z0) / sections;
  for (let section = 0; section < sections; section++) {
    const a = z0 + sectionLength * section + 0.025;
    const b = z0 + sectionLength * (section + 1) - 0.025;
    const mid = (a + b) * 0.5;
    const len = b - a;
    for (let row = 0; row < 4; row++) {
      P.add(rail, KIT.box(0.024, 0.028, len), side * outer,
        y0 + (y1 - y0) * row / 3, mid);
    }
    for (const z of [a, b]) {
      P.add(rail, KIT.box(0.028, y1 - y0 + 0.06, 0.028),
        side * outer, (y0 + y1) * 0.5, z);
    }
    for (const z of [a + len * 0.18, b - len * 0.18]) {
      P.add(body, KIT.box(Math.abs(outer - seat) + 0.04, 0.038, 0.040),
        side * ((outer + seat) * 0.5), y0, z);
      P.add(body, KIT.box(Math.abs(outer - seat) + 0.04, 0.038, 0.040),
        side * ((outer + seat) * 0.5), y1, z);
    }
  }
}

function addRearSlat(P, width, y0, y1, z, seatZ) {
  for (let row = 0; row < 4; row++) {
    P.add('turretDetail', KIT.box(width, 0.028, 0.026), 0,
      y0 + (y1 - y0) * row / 3, z);
  }
  for (let i = 0; i < 9; i++) {
    const x = -width * 0.47 + width * 0.94 * i / 8;
    P.add('turretDetail', KIT.box(0.028, y1 - y0 + 0.06, 0.028),
      x, (y0 + y1) * 0.5, z);
    if (i % 2 === 0) P.add('turretDark', KIT.box(0.036, 0.036, Math.abs(z - seatZ) + 0.05),
      x, y0, (z + seatZ) * 0.5);
  }
}

function gunPlant(P, width, depth, coaxX = 0.31) {
  P.addGunExtra(KIT.box(width, 0.52, 0.26), 0, -0.015, 0.39);
  P.addGunExtra(KIT.cylZ(0.21, depth, 20, 0.17), 0, 0, 0.70);
  P.addGunExtraDark(KIT.cylZ(0.038, 0.095, 10), coaxX, 0.075, 0.60);
  for (const side of [-1, 1]) P.addGunExtraDark(KIT.cylZ(0.026, 0.070, 10),
    side * width * 0.34, -0.12, 0.48);
}

function addOTCOPackage(P) {
  // Retain the boxy A4 turret but give this field-modernized variant a dense
  // net/stowage silhouette and a supported roof weapon. The quarantined game
  // extraction supplies only broad visual cues, never topology.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) plate(P, 'turret', side * 1.46,
      0.34 + (i & 1) * 0.025, 0.80 - i * 0.52,
      0.10, 0.34, 0.46, [0, 0, side * 0.035], false);
    P.add('turretCloth', mirroredSlab(side, [
      [0.52, 0.22, 1.62], [1.50, 0.20, 1.20], [1.47, 0.18, -1.92], [0.64, 0.18, -2.05],
    ], [
      [0.48, 0.33, 1.55], [1.48, 0.34, 1.14], [1.45, 0.31, -1.86], [0.61, 0.31, -1.98],
    ]));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.042, len: 0.28, splay: side,
      pitch: -0.42, arc: 0.52, slot: 'detail', seed: 2400 + (side > 0 ? 1 : 0),
    }), side * 1.22, 0.54, 0.08);
  }
  P.add('turretDark', KIT.box(2.20, 0.30, 0.055), 0, 0.34, -2.48);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.14, d: 0.48, h: 0.30, fill: 0.62, rails: 3, seed: 2420,
  }), 0, 0.48, -2.34);
  roofWeapon(P, 0.48, 0.86, -0.72, 2430, 0.82, 0.04);
  radioPair(P, 0.72, -2.40, 2440, 1.05);
  gunPlant(P, 0.78, 0.39);
  P.decal('turret', 'number', 'OTCO', 0.20, [-1.47, 0.39, -0.72], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.42);
}

function buildLeo2A4OTCO(P) {
  buildLeo2A4(P);
  addOTCOPackage(P);
}

function addA4MPackage(P) {
  armorCheeks(P, { reach: 1.60, crest: 0.66 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) plate(P, 'hull', side * 1.89, 1.18,
      2.43 - i * 0.82, 0.07, 0.53, 0.68, [0, 0, side * 0.018], false);
    for (let i = 0; i < 5; i++) plate(P, 'turret', side * 1.57,
      0.42 + (i & 1) * 0.022, 0.44 - i * 0.48,
      0.12, 0.40, 0.40, [0, 0, side * 0.065], true);
    addSideSlat(P, 'hull', side, {
      outer: 2.02, seat: 1.89, y0: 0.92, y1: 1.42, z0: -3.12, z1: 1.30, sections: 5,
    });
    addSideSlat(P, 'turret', side, {
      outer: 1.72, seat: 1.53, y0: 0.22, y1: 0.66, z0: -2.50, z1: -0.54, sections: 3,
    });
  }
  addRearSlat(P, 2.88, 0.22, 0.67, -2.70, -2.48);
  P.add('hullDark', KIT.box(1.82, 0.12, 3.80), 0, 0.26, -0.40);
  P.add('hullDetail', KIT.box(1.58, 0.025, 3.48), 0, 0.33, -0.40);
  canadianSmoke(P, 6, 2460);
  roofWeapon(P, -0.48, 0.90, -0.66, 2470, 0.86, -0.04);
  radioPair(P, 0.76, -2.36, 2480, 1.04);
  gunPlant(P, 0.84, 0.42);
  P.decal('turret', 'number', 'A4M', 0.21, [1.60, 0.42, -0.74], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.47);
}

function buildLeo2A4M(P) {
  buildLeo2A4(P);
  addA4MPackage(P);
}

function addA6MPackage(P) {
  // The A6 donor supplies the correct L/55 and wedge turret. A6M adds mine
  // protection, Canadian slat armor and a denser roof/optics package.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) plate(P, 'hull', side * 1.91, 1.20,
      2.42 - i * 0.82, 0.07, 0.52, 0.68, [0, 0, side * 0.018], false);
    for (let i = 0; i < 5; i++) plate(P, 'turret', side * 1.55,
      0.42 + (i & 1) * 0.022, 0.34 - i * 0.47,
      0.12, 0.39, 0.39, [0, 0, side * 0.07], true);
    addSideSlat(P, 'hull', side, {
      outer: 2.10, seat: 1.91, y0: 0.93, y1: 1.44, z0: -3.10, z1: 1.36, sections: 5,
    });
    addSideSlat(P, 'turret', side, {
      outer: 1.76, seat: 1.53, y0: 0.23, y1: 0.68, z0: -2.58, z1: -0.56, sections: 3,
    });
  }
  addRearSlat(P, 3.02, 0.23, 0.69, -2.82, -2.54);
  P.add('hullDark', KIT.box(1.86, 0.14, 4.10), 0, 0.25, -0.34);
  P.add('hullDetail', KIT.box(1.62, 0.026, 3.76), 0, 0.335, -0.34);
  P.add('turret', KIT.box(1.82, 0.085, 1.22), 0, 0.78, -0.82);
  P.add('turretDark', KIT.box(1.66, 0.018, 1.08), 0, 0.83, -0.82);
  P.add('turret', KIT.box(0.38, 0.08, 0.38), -0.58, 0.84, -0.48);
  P.add('turretDetail', KIT.cylY(0.14, 0.17, 0.30, 16), -0.58, 1.02, -0.48);
  P.add('turretGlass', KIT.box(0.20, 0.10, 0.024), -0.58, 1.03, -0.30);
  canadianSmoke(P, 8, 2600, 1.33, 0.10);
  roofWeapon(P, 0.48, 0.89, -0.63, 2610, 0.88, 0.05);
  radioPair(P, 0.74, -2.42, 2620, 1.06);
  gunPlant(P, 0.88, 0.44);
  P.decal('turret', 'number', 'A6M', 0.21, [-1.58, 0.43, -0.78], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.50);
}

function buildLeo2A6M(P) {
  buildLeo2A6(P);
  // The hand-authored L/55 donor predates the universal measured bore mouth
  // and never published its real local face station.  Without this datum the
  // factory falls back to the spec length and leaves the annulus in front of
  // the tube.  Keep the new A6M's bore seated on the authored 5.5125 m face.
  P.muzzleZ = 5.5125;
  addA6MPackage(P);
}

export const GERMANY_PROFILES = {
  leo2a4_otco: { build: buildLeo2A4OTCO },
  leo2a4m: { build: buildLeo2A4M },
  leo2a6m: { build: buildLeo2A6M },
};
