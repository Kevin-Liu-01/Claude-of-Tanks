// Italian tracked-vehicle family.
//
// All geometry in this module is first-party procedural.  The three local
// source drops supplied by the owner are used only as visual/metric oracles:
// no source object, topology, texture, or converted vertex payload ships.
// The Ariete variants intentionally share the certified seven-station native
// course from the Preserie while their armor/equipment packages remain
// immediately distinguishable.  The Carro 45t owns a separate six-station
// exposed-running-gear architecture.

import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.js';
import { buildAriete } from './misc.js';

function addFitting(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function addArieteWarKit(P, mark) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;
  const c2 = mark === 'c2';

  // Source-derived welded cheek packs.  Each lower edge overlaps the parent
  // shell and each inboard edge returns into the gun mask: no stand-off cards.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.34, 0.10, 1.30], [s * 1.27, 0.10, 0.86], [s * 1.34, 0.10, 0.20], [s * 0.42, 0.10, 0.54],
      [s * 0.34, 0.67, 1.22], [s * 1.18, 0.62, 0.78], [s * 1.24, 0.58, 0.18], [s * 0.42, 0.69, 0.48]));
    P.add('turretDark', box(0.025, 0.48, 0.60), s * 1.255, 0.36, 0.49, 0, 0, s * 0.13);

    const sideZs = c2 ? [0.22, -0.24, -0.70, -1.15] : [0.18, -0.34, -0.86];
    sideZs.forEach((z, i) => {
      const h = c2 ? 0.42 : 0.36;
      P.add('turret', box(0.18, h, 0.40), s * 1.37, 0.33 + (i % 2) * 0.025, z, 0, 0, s * 0.10);
      P.add('turretDark', box(0.012, h * 0.82, 0.30), s * 1.465, 0.33, z);
    });

    // Full-height hull shoulder and skirt modules remain above the one native
    // course.  They are armor, never track proxies or corridor fillers.
    P.add('hull', slab(
      [s * 1.55, 1.18, 1.82], [s * 1.73, 1.16, 1.82], [s * 1.73, 1.08, 2.70], [s * 1.47, 1.10, 2.70],
      [s * 1.55, 1.39, 1.82], [s * 1.73, 1.36, 1.82], [s * 1.73, 1.27, 2.70], [s * 1.47, 1.31, 2.70]));
    const skirtCount = c2 ? 7 : 5;
    for (let i = 0; i < skirtCount; i++) {
      const z = 2.05 - i * (c2 ? 0.73 : 0.91);
      P.add('hull', box(0.055, c2 ? 0.53 : 0.43, c2 ? 0.58 : 0.66), s * 1.775,
        c2 ? 1.12 : 1.15, z, 0, 0, s * (c2 ? 0.035 : 0.025));
      P.add('hullDark', box(0.014, 0.028, c2 ? 0.50 : 0.56), s * 1.806,
        c2 ? 1.38 : 1.35, z);
    }
  }

  // Deep bustle armor and a connected basket termination.  The C2 package
  // is longer and carries a second tier; C1 retains the shorter source pack.
  const bustleRear = c2 ? -2.72 : -2.45;
  P.add('turret', box(c2 ? 2.42 : 2.26, c2 ? 0.52 : 0.40, c2 ? 0.74 : 0.58),
    0, c2 ? 0.46 : 0.40, c2 ? -2.18 : -2.04);
  P.add('turretDark', box(c2 ? 2.36 : 2.20, 0.035, 0.70), 0, 0.20, c2 ? -2.18 : -2.04);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.42, 0.035), s * 1.12, 0.43, bustleRear);
    P.add('turretDetail', box(1.12, 0.035, 0.035), s * 0.56, 0.62, bustleRear);
    P.add('turretDetail', box(0.035, 0.035, 0.58), s * 1.12, 0.62, bustleRear + 0.27);
  }
  P.add('turretDetail', box(2.24, 0.035, 0.035), 0, 0.22, bustleRear);

  // Modular glacis ERA with a center driver break.  The blocks sit on the
  // known Ariete upper-glacis plane and do not replace or subtract hull mass.
  for (const s of [-1, 1]) for (let row = 0; row < (c2 ? 2 : 1); row++) {
    for (let i = 0; i < (c2 ? 4 : 3); i++) {
      P.add('hull', box(0.35, 0.10, 0.42), s * (0.28 + i * 0.36), 1.39 - row * 0.055,
        2.25 + row * 0.43, -0.14, 0, 0);
    }
  }

  // Supported light clusters move with the hull, smoke banks and stations
  // with the turret.  C2 has the requested twin roof-gun silhouette.
  for (const s of [-1, 1]) {
    addFitting(P, 'hull', FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.052, seed: 20 }),
      s * 1.35, 1.28, 3.22);
    addFitting(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: c2 ? 5 : 4, splay: s * 1.02,
      pitch: -0.42, slot: 'detail', seed: 30 + (s > 0 ? 1 : 0) }), s * 1.19, 0.48, 0.08);
  }

  if (c2) {
    addFitting(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone',
      elev: 0.11, shield: true, ring: { r: 0.18, stubs: 3 }, scale: 0.82, seed: 41 }),
      0.50, 0.76, -0.93);
    // Compact panoramic sight on a broad armor shoe.
    P.add('turret', box(0.34, 0.08, 0.34), 0.70, 0.81, -0.34);
    P.add('turretDetail', cylY(0.13, 0.15, 0.30, 14), 0.70, 0.99, -0.34);
    P.add('turretGlass', box(0.18, 0.11, 0.025), 0.70, 1.00, -0.18);
    for (const s of [-1, 1]) addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
      h: s < 0 ? 0.64 : 0.54, rake: -s * 0.05, seed: 48 }), s * 1.02, 0.68, -2.28);
  } else {
    P.add('turret', box(0.32, 0.07, 0.30), 0.66, 0.80, -0.28);
    P.add('turretDetail', cylY(0.12, 0.14, 0.23, 14), 0.66, 0.94, -0.28);
    P.add('turretGlass', box(0.16, 0.09, 0.02), 0.66, 0.95, -0.14);
  }

  // Deeper but closed gun mask over the inherited, elevation-correct tube.
  P.addGunExtra(box(c2 ? 0.80 : 0.70, c2 ? 0.54 : 0.48, 0.22), 0, -0.015, 0.42);
  P.addGunExtra(cylZ(c2 ? 0.19 : 0.175, 0.36, 18, 0.145), 0, -0.01, 0.66);
  P.addGunExtraDark(cylZ(0.035, 0.08, 10), 0.26, 0.07, 0.57);

  P.decal('turret', 'number', c2 ? 'C2 01' : 'C1 32', 0.24,
    [-1.30, 0.38, c2 ? -0.78 : -0.58], -Math.PI / 2, 0, -0.02);
  P.topY = c2 ? 1.32 : 1.18;
}

function buildArieteC1(P) {
  buildAriete(P);
  addArieteWarKit(P, 'c1');
}

function buildArieteC2(P) {
  buildAriete(P);
  addArieteWarKit(P, 'c2');
}

function buildCarro45T(P) {
  const { box, cylY, cylZ, torus, frustum, polyMultiLoft, buildGun,
    buildRunningGear, headlight, periscope, liftEye, towCable } = KIT;
  const slab = orientedSlab;

  // Low boat-shaped hull and a steep, continuous upper glacis.  The source
  // prototype has exposed wheels, so no skirt or track-colored hull proxy is
  // authored here.
  P.add('hull', box(2.00, 0.76, 5.80), 0, 0.63, 0.05);
  P.add('hull', box(2.82, 0.16, 5.10), 0, 1.18, 0);
  P.add('hull', box(2.92, 0.055, 2.80), 0, 1.20, -1.52);
  P.add('hull', slab(
    [-1.00, 0.38, 2.34], [1.00, 0.38, 2.34], [0.88, 0.55, 3.34], [-0.88, 0.55, 3.34],
    [-1.46, 1.20, 1.54], [1.46, 1.20, 1.54], [0.92, 1.08, 3.34], [-0.92, 1.08, 3.34]));
  P.add('hull', frustum(0.88, 3.42, 3.08, 0.88, 3.10, 3.08, 0.62, 1.08));
  P.add('hull', box(1.84, 0.58, 0.08), 0, 0.82, -3.24);
  P.add('hullDark', box(1.88, 0.28, 0.035), 0, 0.88, -3.29);
  for (let i = 0; i < 6; i++) P.add('hullDetail', box(1.80, 0.026, 0.035), 0, 0.76 + i * 0.055, -3.31);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.12, 0.22, 5.92), s * 1.48, 1.43, -0.24);
    P.add('hullRubber', box(0.10, 0.18, 0.035), s * 1.68, 1.31, -3.32);
    headlight(P, s * 0.72, 1.15, 2.80, -0.24, 0.055);
    liftEye(P, 'hullDetail', s * 0.78, 0.68, 3.31);
  }
  towCable(P, [[-1.08, 1.10, 2.15], [0, 1.22, 1.78], [1.08, 1.10, 2.15]]);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(2.20, 0.025, 0.045), 0, 1.24, -1.45 - i * 0.24);

  // One native smart course: six large road wheels, elevated front idler and
  // rear drive wheel produce the requested \________/ family silhouette.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.40, wheelW: 0.22, wheelY: 0.47, xc: 1.32,
    wheelZs: [2.10, 1.28, 0.46, -0.36, -1.18, -2.00],
    idler: { z: 3.08, y: 0.82, r: 0.31 }, sprocket: { z: -3.08, y: 0.76, r: 0.34 },
    rollers: [-1.65, -0.55, 0.55, 1.65].map((z) => ({ z, y: 0.92, r: 0.10 })),
    trackW: 0.52, topY: 0.94, botY: 0.055, contactZF: 2.30, contactZR: -2.26,
    paintedEnds: true, coveredTop: false, arms: true, armBucket: 'hullRunningGearDetail',
  });

  P.turretG.position.set(0, 1.20, -0.34);
  const plan = [
    [-0.34, 1.28], [0.34, 1.28], [1.18, 0.70], [1.43, -0.22],
    [1.36, -2.18], [-1.36, -2.18], [-1.43, -0.22], [-1.18, 0.70],
  ];
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.03, inset: 1.0 },
    { height: [0.48, 0.48, 0.62, 0.82, 0.96, 0.96, 0.82, 0.62], inset: 0.99 },
    { height: [0.58, 0.58, 0.72, 0.94, 1.03, 1.03, 0.94, 0.72], inset: 0.86 },
  ]));
  P.add('turretDark', box(2.45, 0.07, 2.95), 0, 0.07, -0.52);
  P.add('turret', box(2.28, 0.08, 1.52), 0, 1.00, -1.20);
  P.add('turret', box(0.74, 0.54, 0.40), 0, 0.49, 1.10);
  P.addGunExtra(box(0.64, 0.56, 0.24), 0, 0.02, 0.42);
  P.addGunExtra(cylZ(0.17, 0.38, 16, 0.13), 0, 0, 0.67);
  buildGun(P, { len: 5.45, r: 0.068, brake: 'double', sleeve: false, evac: 0.56,
    evacR: 1.75, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: 5.45, r: 0.068, brake: 'double' });

  // Prototype-specific sparse roof: twin hatches, left-rear smoke bank,
  // commander MG, long radios and a large side optic in a supported blister.
  for (const [x, z] of [[-0.55, -0.80], [0.55, -0.88]]) {
    P.add('turret', cylY(0.27, 0.29, 0.07, 16), x, 1.04, z);
    P.add('turretDark', torus(0.255, 0.014, 18), x, 1.08, z);
  }
  periscope(P, 'turretDetail', 0.52, 1.10, -0.48);
  P.add('turret', box(0.34, 0.32, 0.34), 1.20, 0.69, 0.30);
  P.add('turretGlass', box(0.028, 0.18, 0.22), 1.38, 0.71, 0.42);
  addFitting(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 5, splay: -1.02,
    pitch: -0.46, slot: 'detail', seed: 70 }), -1.10, 0.74, -0.52);
  addFitting(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
    elev: 0.07, shield: true, scale: 0.82, seed: 72 }), 0.54, 1.10, -0.88);
  for (const s of [-1, 1]) addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats,
    h: s < 0 ? 0.83 : 0.70, rake: -s * 0.05, seed: 74 }), s * 1.02, 1.00, -1.82);
  addFitting(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.86, d: 0.38,
    h: 0.26, fill: 0.35, rails: 2, seed: 76 }), 0, 0.76, -2.24);
  P.decal('turret', 'number', '45T', 0.25, [-1.38, 0.57, -0.60], -Math.PI / 2, 0, 0);
  P.topY = 1.46;
}

export const ITALY_PROFILES = {
  ariete: { build: buildAriete },
  ariete_c1: { build: buildArieteC1 },
  ariete_c2: { build: buildArieteC2 },
  carro45t: { build: buildCarro45T },
};
