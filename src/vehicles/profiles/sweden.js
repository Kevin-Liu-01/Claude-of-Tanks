// Swedish armored family.
//
// The owner-supplied Strv 103B, Strv 81 and Strv 122 GLBs are fixed
// visual/metric oracles only. Runtime geometry remains first-party procedural.
// Each build preserves its donor hull and single suspension-driven native
// course, then adds supported Swedish armor, equipment and gun-station cues.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildStrv103 } from './casemate.js';
import { centurionBuild } from './uk.js';
import { buildLeo2A5 } from './leopard.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function plate(P, owner, x, y, z, w, h, d, rotation = null, darkCap = true) {
  const r = rotation || [0, 0, 0];
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(bucket, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (darkCap) P.add(detail, KIT.box(w * 0.72, 0.016, Math.max(0.025, d * 0.08)),
    x, y + h * 0.5 + 0.009, z + d * 0.24, r[0], r[1], r[2]);
}

function addSwedishRadioPair(P, owner, y, z, seed) {
  for (const side of [-1, 1]) {
    const x = side * 0.96;
    P.add(owner === 'hull' ? 'hullDetail' : 'turretDetail',
      KIT.cylY(0.036, 0.046, 0.06, 10), x, y, z);
    mount(P, owner, FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.82 : 0.68, r: 0.012,
      rake: -side * 0.045, seed: seed + (side > 0 ? 1 : 0),
    }), x, y + 0.02, z);
  }
}

function addStrv103BOraclePackage(P) {
  const { box, cylY } = KIT;

  // Source-defining nose protection screen. Two horizontal carriers are
  // planted into the folded dozer/glacis shoulders; the short verticals join
  // them, so the array reads as one supported cage rather than loose rods.
  for (const y of [1.42, 1.78]) {
    P.add('hullDetail', box(2.68, 0.035, 0.035), 0, y, 2.58);
  }
  for (let i = 0; i < 11; i++) {
    const x = -1.25 + i * 0.25;
    P.add('hullDetail', box(0.030, 0.39, 0.030), x, 1.60, 2.58,
      0, 0, (i - 5) * 0.018);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.10, 0.34, 0.12), side * 1.30, 1.60, 2.54);
    // Additional flank service/armor boxes overlap the intact upper hull and
    // stop well above the four-wheel smart course.
    plate(P, 'hull', side * 1.70, 1.48, -0.62, 0.12, 0.42, 0.72,
      [0, 0, side * 0.035], false);
    plate(P, 'hull', side * 1.70, 1.48, -1.40, 0.12, 0.42, 0.66,
      [0, 0, side * 0.035], false);
  }

  // Compact commander station, shielded Ksp 58 and optical crown echo the
  // supplied 103B roof without creating a fake articulating turret.
  P.add('hull', cylY(0.24, 0.26, 0.075, 16), 0.38, 1.96, -0.26);
  P.add('hullDark', KIT.torus(0.235, 0.014, 16), 0.38, 2.01, -0.26);
  mount(P, 'hull', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.78,
    elev: 0.07, shield: true, ammo: true, seed: 10320,
  }), 0.38, 1.98, -0.26, [0, 0.04, 0]);
  P.add('hull', box(0.32, 0.25, 0.28), -0.45, 1.96, -0.22);
  P.add('hullGlass', box(0.18, 0.095, 0.022), -0.45, 1.98, -0.06);
  addSwedishRadioPair(P, 'hull', 1.86, -1.82, 10330);

  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.55, d: 0.44, h: 0.25, fill: 0.42, rails: 3, seed: 10340,
  }), 0, 1.83, -2.42);
  P.decal('hull', 'number', '103B', 0.28, [-1.76, 1.52, -1.22], -Math.PI / 2);
}

function buildStrv103B(P) {
  buildStrv103(P);
  addStrv103BOraclePackage(P);
}

function addStrv81Package(P) {
  const { box, cylX, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Re-form the inherited vertical Centurion box into the oracle's low cast
  // shell. This closed loft overlaps the ring, cheek field and rear body;
  // its narrowed crown produces real sloping armor instead of a flat lid.
  P.add('turret', slab(
    [-1.10, 0.24, 1.20], [1.10, 0.24, 1.20],
    [1.23, 0.26, -1.55], [-1.23, 0.26, -1.55],
    [-0.78, 0.81, 0.95], [0.78, 0.81, 0.95],
    [0.98, 0.78, -1.40], [-0.98, 0.78, -1.40]));
  // Unequal crown plates follow the cast slopes and create the broken roof
  // cadence visible on the supplied Strv 81 rather than one broad rectangle.
  P.add('turret', box(0.74, 0.055, 0.58), -0.39, 0.825, -0.52, 0, -0.08, 0);
  P.add('turret', box(0.58, 0.050, 0.50), 0.39, 0.817, -0.45, 0, 0.10, 0);
  P.add('turretDark', box(0.46, 0.016, 0.08), 0.39, 0.850, -0.18, 0, 0.10, 0);

  // Swedish cheek continuations broaden the inherited Centurion casting but
  // bury into its nose/crown on every edge. They are low, rounded armor
  // shoulders rather than a second turret shell.
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 0.42, -0.20, 1.36], [side * 1.02, -0.20, 1.03],
      [side * 1.18, -0.18, 0.46], [side * 0.66, -0.18, 0.66],
      [side * 0.40, 0.42, 1.30], [side * 0.94, 0.51, 0.98],
      [side * 1.08, 0.56, 0.44], [side * 0.62, 0.50, 0.62]));
    for (let i = 0; i < 3; i++) {
      plate(P, 'turret', side * 1.10, 0.30 + i * 0.025, 0.28 - i * 0.47,
        0.14, 0.34, 0.38, [0, 0, side * 0.08], false);
    }

    // Hull-side applique stays above the wheel tops and is visibly seated on
    // the original full-length skirt/fender architecture.
    for (let i = 0; i < 5; i++) {
      plate(P, 'hull', side * 1.675, 1.11, 1.62 - i * 1.02,
        0.045, 0.42, 0.84, [0, 0, side * 0.018], false);
    }
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 5, r: 0.041, len: 0.27,
      splay: side * 1.00, pitch: -0.42, arc: 0.52,
      slot: 'detail', seed: 8100 + (side > 0 ? 1 : 0),
    }), side * 1.03, 0.55, 0.10);
  }

  // Low Swedish commander cupola, Ksp 58 and twin radio cadence.
  P.add('turret', cylY(0.27, 0.29, 0.08, 18), -0.47, 0.93, -0.52);
  P.add('turretDark', KIT.torus(0.26, 0.014, 18), -0.47, 0.98, -0.52);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.80,
    elev: 0.08, shield: true, ammo: true, seed: 8120,
  }), -0.47, 0.94, -0.52, [0, -0.05, 0]);
  P.add('turret', box(0.34, 0.09, 0.32), 0.47, 0.91, -0.36);
  P.add('turretDetail', cylY(0.12, 0.14, 0.25, 14), 0.47, 1.06, -0.36);
  P.add('turretGlass', box(0.16, 0.085, 0.022), 0.47, 1.07, -0.20);
  // The source's large side ventilator/search housing is a strong profile
  // landmark. Both concentric drums are buried into the cast side wall.
  P.add('turret', cylX(0.21, 0.18, 18, 0.15), 1.13, 0.48, -0.64);
  P.add('turretDark', cylX(0.155, 0.035, 18, 0.12), 1.225, 0.48, -0.64);
  for (let i = 0; i < 6; i++) {
    P.add('turretDetail', box(0.030, 0.22, 0.035), 1.247,
      0.48, -0.64, 0, 0, i * Math.PI / 3);
  }
  addSwedishRadioPair(P, 'turret', 0.78, -1.66, 8130);

  // Periscope cadence and hull lighting keep the early Swedish vehicle
  // mechanically legible at garage distance without inflating its roof.
  for (const [x, z, ry] of [
    [-0.72, -0.40, 0.18], [-0.66, -0.16, 0.08], [-0.43, -0.10, -0.08],
    [0.28, -0.16, 0.10], [0.54, -0.20, -0.16],
  ]) {
    P.add('turretDetail', box(0.13, 0.045, 0.075), x, 0.93, z, 0, ry, 0);
    P.add('turretGlass', box(0.092, 0.022, 0.014), x, 0.956, z + 0.035, 0, ry, 0);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.14, r: 0.050,
      shield: true, seed: 8135 + (side > 0 ? 1 : 0),
    }), side * 0.78, 1.47, 3.06);
    P.add('hullDetail', cylZ(0.035, 0.92, 10), side * 1.26, 1.52, -1.28);
    P.add('hullDark', box(0.10, 0.07, 0.08), side * 1.26, 1.52, -0.84);
    P.add('hullDark', box(0.10, 0.07, 0.08), side * 1.26, 1.52, -1.72);
  }

  // Backed bustle rack and characteristic side tool cages.
  P.add('turretDark', box(2.18, 0.30, 0.06), 0, 0.34, -2.03);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.10, d: 0.48, h: 0.34, fill: 0.38, rails: 3, seed: 8140,
  }), 0, 0.54, -1.90);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.035, 0.64), side * 1.12, 0.56, -1.66);
    P.add('turretDetail', box(0.035, 0.34, 0.035), side * 1.12, 0.40, -1.98);
  }

  // Closed, layered 20-pdr gun plant around the inherited bore.
  P.addGunExtra(box(0.72, 0.55, 0.25), 0, -0.015, 0.35);
  P.addGunExtra(cylZ(0.19, 0.38, 18, 0.145), 0, 0, 0.62);
  P.addGunExtraDark(cylZ(0.035, 0.09, 10), 0.27, 0.07, 0.55);
  P.decal('turret', 'number', '81', 0.25, [1.18, 0.40, -0.66], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.26);
}

function buildStrv81(P) {
  centurionBuild(P, 3);
  addStrv81Package(P);
  // The oracle has a squat cast fighting compartment. Scale the complete
  // turret-owned assembly about its ring, then cancel that scale on the gun
  // group so the 20-pdr tube and mantlet remain circular.
  P.turretG.scale.y *= 0.82;
  P.gunG.scale.y *= 1 / 0.82;
  P.topY = 1.13;
}

function addStrv122Package(P) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Swedish hull-front package: thick upper-glacis wedges and lower shoulder
  // returns overlap the A5 shell while remaining clear of both idler lanes.
  for (const side of [-1, 1]) {
    P.add('hull', slab(
      [side * 0.12, 1.47, 2.36], [side * 1.18, 1.44, 2.48],
      [side * 0.96, 1.28, 3.52], [side * 0.12, 1.30, 3.62],
      [side * 0.12, 1.61, 2.36], [side * 1.18, 1.58, 2.48],
      [side * 0.96, 1.42, 3.52], [side * 0.12, 1.44, 3.62]));
    P.add('hullDark', box(0.025, 0.28, 0.76), side * 0.94, 1.43, 2.74,
      0, 0, side * 0.08);

    // Distinct 122 side armor: eight shallow ceramic cassettes over the
    // donor skirt, stopping above and outside the single native shoe course.
    for (let i = 0; i < 8; i++) {
      plate(P, 'hull', side * 1.84, 1.23, 2.52 - i * 0.73,
        0.055, 0.52, 0.58, [0, 0, side * 0.018], false);
    }

    // Flush turret-side protection and supported rear-corner returns.
    for (let i = 0; i < 5; i++) {
      plate(P, 'turret', side * 1.50, 0.42 + (i & 1) * 0.025,
        0.08 - i * 0.43, 0.13, 0.40, 0.36, [0, 0, side * 0.08], true);
    }
    P.add('turret', slab(
      [side * 1.16, 0.10, -1.52], [side * 1.48, 0.10, -1.62],
      [side * 1.48, 0.12, -2.54], [side * 1.12, 0.12, -2.34],
      [side * 1.12, 0.62, -1.52], [side * 1.42, 0.60, -1.62],
      [side * 1.42, 0.56, -2.50], [side * 1.08, 0.58, -2.30]));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.043, len: 0.30,
      splay: side * 1.04, pitch: -0.44, arc: 0.62,
      slot: 'detail', seed: 12200 + (side > 0 ? 1 : 0),
    }), side * 1.34, 0.58, 0.26);
  }

  // Reinforced roof armor is a defining Strv 122 cue. These closed plates
  // overlap the wedge crown and leave the crew stations visibly seated.
  P.add('turret', box(1.96, 0.10, 1.42), 0, 0.82, -0.74);
  P.add('turretDark', box(1.82, 0.018, 1.28), 0, 0.88, -0.74);
  for (const side of [-1, 1]) {
    P.add('turret', box(0.58, 0.10, 0.66), side * 0.72, 0.88, -0.55);
    P.add('turretDark', box(0.48, 0.018, 0.55), side * 0.72, 0.94, -0.55);
  }

  // Two low crew hatches, surrounding periscopes and roof service boxes sit
  // on the new armor plate. Their feet overlap the crown instead of hovering
  // above it, restoring the dense roof grammar visible on the 122 oracle.
  for (const [x, z, r] of [[0.42, -0.78, 0.26], [-0.28, -0.82, 0.23]]) {
    P.add('turret', cylY(r, r + 0.015, 0.065, 18), x, 0.92, z);
    P.add('turretDark', KIT.torus(r * 0.92, 0.014, 18), x, 0.96, z);
  }
  for (const [x, z, ry] of [
    [0.17, -0.50, -0.12], [0.40, -0.43, -0.04], [0.65, -0.52, 0.10],
    [-0.52, -0.48, 0.14], [-0.73, -0.62, 0.22], [-0.08, -0.45, -0.12],
  ]) {
    P.add('turretDetail', box(0.14, 0.048, 0.078), x, 0.94, z, 0, ry, 0);
    P.add('turretGlass', box(0.098, 0.022, 0.014), x, 0.968, z + 0.036, 0, ry, 0);
  }
  P.add('turret', box(0.34, 0.12, 0.42), 0.78, 0.95, -1.22);
  P.add('turretDark', box(0.28, 0.018, 0.34), 0.78, 1.02, -1.22);
  P.add('turret', box(0.30, 0.10, 0.34), -0.78, 0.94, -1.34);
  P.add('turretDark', box(0.24, 0.018, 0.27), -0.78, 1.00, -1.34);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.12, 0.10, 0.12), side * 1.02, 0.86, -0.12);
    P.add('turretGlass', box(0.075, 0.055, 0.018), side * 1.02, 0.87, -0.05);
    P.add('turretDark', box(0.025, 0.025, 0.22), side * 1.02, 0.81, -0.24);
  }

  // Commander panorama and forward shielded Ksp 58 on broad roof shoes.
  P.add('turret', box(0.38, 0.08, 0.38), -0.58, 0.96, -0.62);
  P.add('turretDetail', cylY(0.14, 0.17, 0.32, 16), -0.58, 1.15, -0.62);
  P.add('turretGlass', box(0.21, 0.10, 0.024), -0.58, 1.16, -0.43);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.84,
    elev: 0.10, shield: true, ammo: true,
    ring: { r: 0.17, stubs: 3 }, seed: 12220,
  }), 0.52, 0.96, -0.50, [0, 0.06, 0]);
  addSwedishRadioPair(P, 'turret', 0.73, -2.18, 12230);

  // Connected rear basket/slat complex. Every rail meets a post, and the
  // posts return into the backed bustle armor.
  P.add('turretDark', box(2.50, 0.34, 0.06), 0, 0.36, -2.78);
  for (const y of [0.26, 0.38, 0.50, 0.62]) {
    P.add('turretDetail', box(2.66, 0.028, 0.032), 0, y, -2.82);
  }
  for (let i = 0; i < 9; i++) {
    P.add('turretDetail', box(0.030, 0.42, 0.032), -1.25 + i * 0.3125, 0.44, -2.82);
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.032, 0.36, 0.62), side * 1.33, 0.44, -2.53);
    P.add('turretDetail', box(0.24, 0.035, 0.035), side * 1.22, 0.26, -2.50);
    P.add('turretDetail', box(0.24, 0.035, 0.035), side * 1.22, 0.62, -2.50);
  }

  // Swedish L/44 gun root: broad buried mask, stepped collar and two visible
  // trunnion fasteners around the inherited barrel/elevation rig.
  P.addGunExtra(box(0.82, 0.58, 0.24), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.22, 0.40, 18, 0.17), 0, 0, 0.68);
  for (const side of [-1, 1]) P.addGunExtraDark(cylZ(0.037, 0.095, 10),
    side * 0.30, 0.08, 0.58);

  P.decal('turret', 'number', '122', 0.25, [-1.56, 0.43, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.54);
}

function buildStrv122(P) {
  buildLeo2A5(P);
  addStrv122Package(P);
}

export const SWEDEN_PROFILES = {
  strv103: { build: buildStrv103B },
  strv81: { build: buildStrv81 },
  strv122: { build: buildStrv122 },
};
