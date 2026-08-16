// Polish armored family.
//
// The three owner-supplied GLBs are fixed local visual/metric oracles only.
// Runtime playables remain first-party procedural. Each builder preserves a
// complete donor hull and one suspension-driven smart course, then authors
// the source-defining Polish armor, roof stations, gun plant and equipment.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildK2 } from '../modern3.js';
import { buildT72B87Native } from './t72.js';
import { buildPT91M } from './t90.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function cassette(P, owner, x, y, z, w, h, d, rotation = null, cap = true) {
  const r = rotation || [0, 0, 0];
  const armor = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(armor, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(detail, KIT.box(w * 0.70, 0.016, Math.max(0.024, d * 0.07)),
    x, y + h * 0.5 + 0.010, z + d * 0.27, r[0], r[1], r[2]);
}

function addPolishWhips(P, y, z, seed, spread = 1.02) {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.034, 0.045, 0.060, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.80 : 0.68, r: 0.012,
      rake: -side * 0.045, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.03, z);
  }
}

function addPolishSmoke(P, x, y, z, count, seed, pitch = -0.42) {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.042, len: 0.29, splay: side * 1.02,
      pitch, arc: 0.58, spacing: 0.10, slot: 'detail',
      rotation: [0, 0, -side * 0.10], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

function addPolishRWS(P, x, y, z, seed, scale = 0.82, yaw = 0.04) {
  const { box, cylY } = KIT;
  P.add('turret', box(0.48, 0.075, 0.46), x, y, z);
  P.add('turretDark', box(0.38, 0.020, 0.36), x, y + 0.048, z);
  P.add('turret', cylY(0.20, 0.22, 0.075, 16), x, y + 0.085, z);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.11,
    shield: true, ammo: true, ring: { r: 0.17, stubs: 3 }, seed,
  }), x, y + 0.11, z, [0, yaw, 0]);
}

function addPL01Package(P) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Full-height modular stealth sides: the panels overlap the intact K2
  // skirt/fender structure but remain outside the animated shoe envelope.
  // Their upper bevel follows the PL-01 oracle's single long shoulder fold.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 2.58 - i * 0.78;
      const h = i === 0 || i === 7 ? 0.82 : 0.94;
      cassette(P, 'hull', side * 1.86, 1.12 + (i % 2) * 0.008, z,
        0.075, h, 0.70, [0, 0, side * (i < 2 ? 0.035 : -0.012)], false);
      P.add('hullDark', box(0.020, 0.040, 0.56), side * 1.905,
        1.48, z);
      P.add('hullDetail', box(0.020, 0.54, 0.025), side * 1.907,
        1.13, z + 0.33);
    }
    // Folded bow shoulder closes into the frontal armor instead of ending
    // as a flat applique plate.
    P.add('hull', slab(
      [side * 0.20, 1.22, 3.52], [side * 1.82, 1.08, 3.24],
      [side * 1.76, 1.16, 2.70], [side * 0.18, 1.16, 2.88],
      [side * 0.18, 1.58, 3.42], [side * 1.72, 1.48, 3.12],
      [side * 1.68, 1.26, 2.70], [side * 0.18, 1.22, 2.91]));
  }
  P.add('hullDark', box(2.72, 0.055, 0.12), 0, 1.22, 3.48, -0.26, 0, 0);
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 3, spacing: 0.12, r: 0.042,
      shield: true, seed: 1010 + (side > 0 ? 1 : 0),
    }), side * 1.17, 1.48, 3.30, [-0.18, 0, 0]);
  }

  // Joined station loft for the source's low diamond turret. These pieces
  // intersect the K2 crown and each other, forming one closed stealth mass.
  P.add('turret', slab(
    [-0.26, -0.03, 2.45], [0.26, -0.03, 2.45], [1.42, -0.03, 0.52], [-1.42, -0.03, 0.52],
    [-0.20, 0.60, 2.20], [0.20, 0.60, 2.20], [1.12, 0.68, 0.34], [-1.12, 0.68, 0.34]));
  P.add('turret', slab(
    [-1.42, -0.03, 0.52], [1.42, -0.03, 0.52], [1.31, 0.02, -2.05], [-1.31, 0.02, -2.05],
    [-1.12, 0.68, 0.34], [1.12, 0.68, 0.34], [1.10, 0.62, -1.91], [-1.10, 0.62, -1.91]));
  P.add('turretDark', box(2.10, 0.025, 1.08), 0, 0.70, -0.78);
  for (const side of [-1, 1]) {
    // Paired EO/thermal heads sit in recessed, backed housings.
    P.add('turret', box(0.42, 0.27, 0.42), side * 0.72, 0.75, 0.22,
      -0.10, side * 0.08, 0);
    P.add('turretDark', box(0.31, 0.16, 0.032), side * 0.72, 0.77, 0.445,
      -0.10, side * 0.08, 0);
    for (const dx of [-0.09, 0.09]) {
      P.add('turretGlass', cylZ(0.055, 0.030, 14), side * 0.72 + dx,
        0.77, 0.468, Math.PI / 2, 0, 0);
    }
    P.add('turretDetail', box(0.035, 0.22, 0.30), side * 0.96, 0.75, 0.18);
  }
  addPolishRWS(P, -0.28, 0.77, -0.94, 1020, 0.78, 0.03);
  addPolishWhips(P, 0.64, -1.72, 1030, 1.00);

  // Closed 120-mm gun plant: faceted mask, oval collar, clamp and bore cue.
  P.addGunExtra(box(0.72, 0.48, 0.28), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.20, 0.38, 18, 0.16), 0, 0, 0.68);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), 0.28, 0.08, 0.58);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), -0.28, 0.08, 0.58);
  P.add('turretDetail', cylY(0.11, 0.12, 0.08, 14), 0.56, 0.73, -0.22);
  P.decal('hull', 'number', 'PL-01', 0.24, [-1.90, 1.18, -0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildPL01(P) {
  buildK2(P);
  addPL01Package(P);
}

function addJaguarPackage(P) {
  const { box, cylY, cylZ, torus } = KIT;
  const slab = orientedSlab;

  // The Jaguar keeps the low cast T-72M1 core but gains Polish applique
  // shoulders and a compact backed bustle. The additions bury into the cast
  // shell instead of producing a second disconnected turret.
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 0.28, 0.03, 1.02], [side * 1.43, 0.03, 0.56],
      [side * 1.30, 0.04, -0.44], [side * 0.46, 0.04, 0.20],
      [side * 0.26, 0.42, 0.91], [side * 1.29, 0.43, 0.49],
      [side * 1.17, 0.40, -0.48], [side * 0.43, 0.44, 0.16]));
    for (let i = 0; i < 4; i++) {
      cassette(P, 'turret', side * (0.48 + i * 0.23), 0.45 - i * 0.014,
        0.78 - i * 0.18, 0.21, 0.20, 0.22,
        [-0.16, side * (0.04 + i * 0.05), side * 0.02], false);
    }
    P.add('turret', box(0.44, 0.34, 0.82), side * 1.05, 0.34, -1.12);
    P.add('turretDark', box(0.34, 0.030, 0.70), side * 1.05, 0.525, -1.12);
  }
  P.add('turret', box(2.14, 0.32, 0.62), 0, 0.36, -1.52);
  P.add('turretDark', box(2.02, 0.27, 0.035), 0, 0.36, -1.85);
  for (const y of [0.22, 0.34, 0.46, 0.58]) P.add('turretDetail',
    box(2.30, 0.026, 0.030), 0, y, -1.89);
  for (let i = 0; i < 8; i++) P.add('turretDetail', box(0.026, 0.38, 0.030),
    -1.06 + i * 0.303, 0.40, -1.89);

  // Source-specific Drawa/thermal suite with a broad local foundation.
  P.add('turret', box(0.45, 0.075, 0.48), -0.55, 0.76, -0.25);
  P.add('turretDetail', box(0.36, 0.28, 0.35), -0.55, 0.91, -0.21);
  P.add('turretDark', box(0.27, 0.15, 0.030), -0.55, 0.94, 0.00);
  P.add('turretGlass', box(0.19, 0.09, 0.020), -0.55, 0.94, 0.022);
  P.add('turret', cylY(0.25, 0.27, 0.065, 18), 0.46, 0.79, -0.45);
  P.add('turretDark', torus(0.24, 0.014, 18), 0.46, 0.83, -0.45);
  addPolishRWS(P, 0.46, 0.83, -0.45, 7220, 0.78, -0.04);
  addPolishSmoke(P, 1.12, 0.58, 0.16, 5, 7230);
  addPolishWhips(P, 0.68, -1.46, 7240, 0.96);

  // Jaguar's sleeved 125-mm root and laser-reference tube.
  P.addGunExtra(box(0.60, 0.48, 0.24), 0, -0.01, 0.36);
  P.addGunExtra(cylZ(0.17, 0.34, 16, 0.14), 0, 0, 0.62);
  P.addGunExtra(cylZ(0.075, 0.23, 12), -0.27, 0.15, 0.45);
  P.addGunExtraDark(cylZ(0.050, 0.05, 12), -0.27, 0.15, 0.58);
  P.addGunExtraDark(cylZ(0.034, 0.09, 10), 0.24, 0.06, 0.56);
  P.decal('turret', 'number', 'JAGUAR', 0.19, [-1.40, 0.35, -0.66], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.25);
}

function buildT72M1Jaguar(P) {
  buildT72B87Native(P, 'b87');
  // The donor's three legacy wheel-face garnish meshes sit on top of the
  // animated road-wheel instances. Jaguar keeps the one suspension-driven
  // smart set and removes only those static cosmetic overlays.
  for (const suffix of ['hull', 'dark', 'detail']) {
    P.hullG.getObjectByName(`gear_t72b87_wheelFace_${suffix}`)?.removeFromParent();
  }
  addJaguarPackage(P);
}

function addTwardyPackage(P) {
  const { box, cylY, cylZ, torus } = KIT;

  // ERAWA-1/2 is the Twardy's principal visual grammar: shallow square
  // cassettes on real carriers, with a driver break and mixed flank pitch.
  P.add('hullDark', box(2.58, 0.045, 0.92), 0, 1.30, 1.90, -0.29, 0, 0);
  for (let row = 0; row < 3; row++) for (let col = -4; col <= 4; col++) {
    if (row === 2 && Math.abs(col) < 2) continue;
    const x = col * 0.285 + (row % 2 ? 0.035 : -0.018);
    cassette(P, 'hull', x, 1.34 - row * 0.055, 1.62 + row * 0.29,
      0.26, 0.095, 0.25, [-0.30, 0, 0], false);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      cassette(P, 'hull', side * 1.82, 1.08, 2.10 - i * 0.70,
        0.065, 0.38, 0.60, [0, 0, side * (i % 2 ? 0.018 : -0.014)], false);
      P.add('hullDark', box(0.018, 0.030, 0.48), side * 1.858, 1.25,
        2.10 - i * 0.70);
    }
    // Dense, stepped ERAWA cheeks on a buried carrier.
    P.add('turretDark', box(0.16, 0.43, 1.32), side * 1.25, 0.34, 0.12,
      0, side * 0.18, side * 0.04);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      cassette(P, 'turret', side * (0.52 + i * 0.24), 0.48 - row * 0.11,
        0.80 - i * 0.13 - row * 0.23, 0.21, 0.17, 0.20,
        [-0.16, side * (0.04 + i * 0.05), side * 0.02], false);
    }
  }

  // Polish Obra/Drawa optical identity, low cupola and shielded WKM-B.
  P.add('turret', box(0.43, 0.075, 0.45), -0.52, 0.82, -0.34);
  P.add('turretDetail', box(0.34, 0.31, 0.34), -0.52, 0.99, -0.30);
  P.add('turretDark', box(0.26, 0.16, 0.030), -0.52, 1.02, -0.10);
  P.add('turretGlass', box(0.18, 0.10, 0.020), -0.52, 1.02, -0.077);
  P.add('turret', cylY(0.27, 0.29, 0.075, 18), 0.49, 0.85, -0.52);
  P.add('turretDark', torus(0.25, 0.014, 18), 0.49, 0.90, -0.52);
  addPolishRWS(P, 0.49, 0.90, -0.52, 9120, 0.84, -0.05);
  addPolishSmoke(P, 1.18, 0.63, 0.04, 6, 9130, -0.46);
  addPolishWhips(P, 0.70, -1.64, 9140, 1.02);

  // Backed Polish bustle/rack termination and hull rear service load.
  P.add('turretDark', box(2.38, 0.32, 0.045), 0, 0.42, -2.12);
  for (const y of [0.26, 0.39, 0.52, 0.65]) P.add('turretDetail',
    box(2.58, 0.028, 0.032), 0, y, -2.16);
  for (let i = 0; i < 9; i++) P.add('turretDetail', box(0.028, 0.42, 0.032),
    -1.20 + i * 0.30, 0.45, -2.16);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.72, d: 0.42, h: 0.24, fill: 0.42,
    rails: 3, seed: 9150,
  }), 0, 0.58, -2.12);

  // Fully closed 125-mm gun plant with coax aperture and clamp cadence.
  P.addGunExtra(box(0.66, 0.52, 0.25), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.18, 0.36, 18, 0.145), 0, 0, 0.66);
  P.addGunExtraDark(cylZ(0.034, 0.09, 10), 0.27, 0.08, 0.57);
  P.addGunExtra(cylZ(0.070, 0.20, 12), -0.28, 0.14, 0.44);
  P.addGunExtraDark(cylZ(0.047, 0.04, 12), -0.28, 0.14, 0.56);
  P.decal('turret', 'number', 'PT-91', 0.22, [1.45, 0.42, -0.72], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.35);
}

function buildPT91Twardy(P) {
  buildPT91M(P);
  addTwardyPackage(P);
}

export const POLAND_PROFILES = {
  t72m1_jaguar: { build: buildT72M1Jaguar },
  pt91_twardy: { build: buildPT91Twardy },
  pl01: { build: buildPL01 },
};
