// Type 100 (ZTZ-100) — the PLA's next-generation medium tank as paraded in September 2025
// (owner 2026-09-15: "make a chinese type 100, that is a super detailed mix of the puma and
// cv90mk4, just check the image and make it look like that"). Reads from the parade photograph:
// a low, wide, sharply angled hull with a two-facet glacis and layered skirt doors (Puma
// vocabulary), a compact faceted turret with flat cheek modules, twin quadruple launcher pods on
// the turret shoulders, a tall commander's sensor mast rising behind the roof, a compact RWS, a
// 105 mm gun in a boxy mantlet, and PLA digital desert camouflage. First-party procedural build;
// no source model or measurement oracle participates.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.ts';

type Vec3 = readonly [number, number, number];
const { box, cylX, cylY, cylZ, torus, polyMultiLoft } = KIT;

function tag(geometry: THREE.BufferGeometry, part: string): THREE.BufferGeometry {
  geometry.userData.type100 = part;
  return geometry;
}

function mount(P: TankBuilderPort, owner: 'hull' | 'turret', object: THREE.Object3D,
  x: number, y: number, z: number, rotation: Vec3 = [0, 0, 0]): void {
  object.position.set(x, y, z);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
}

/** A sloped armour plate spanning x0..x1 whose outer face runs from (yb, zb) to (yt, zt) in the
 * y/z plane; the inner face sits `thickness` behind it along the plate's inward normal. */
function slopedPlate(x0: number, x1: number, yb: number, zb: number, yt: number, zt: number,
  thickness: number): THREE.BufferGeometry {
  const dz = zt - zb, dy = yt - yb, len = Math.hypot(dz, dy);
  // outward normal of a face rising rearward: (+z, +y) side
  const nz = dy / len, ny = -dz / len;
  const iz = -nz * thickness, iy = -ny * thickness;
  return orientedSlab(
    [x0, yb, zb], [x1, yb, zb], [x1, yb + iy, zb + iz], [x0, yb + iy, zb + iz],
    [x0, yt, zt], [x1, yt, zt], [x1, yt + iy, zt + iz], [x0, yt + iy, zt + iz],
  );
}

// ------------------------------------------------------------------ hull ----
const HULL_ROOF_Y = 1.80;
const SKIRT_X = 1.76;

function buildType100Hull(P: TankBuilderPort): void {
  // lower tub between the tracks, from the belly to the sponson floor
  P.add('hull', tag(box(2.30, 0.86, 6.95), 'tub'), 0, 0.81, -0.15);
  // two-facet glacis over a steep lower bow: the parade tank's nose reads as three planes
  P.add('hull', tag(slopedPlate(-1.15, 1.15, 0.40, 3.42, 1.12, 3.08, 0.12), 'bow'));
  P.add('hull', tag(slopedPlate(-1.15, 1.15, 1.12, 3.08, 1.50, 2.30, 0.11), 'glacis-lower'));
  P.add('hull', tag(slopedPlate(-1.15, 1.15, 1.50, 2.30, HULL_ROOF_Y, 1.30, 0.10), 'glacis-upper'));
  // crowned monocoque over the sponsons: cut plan corners at the bow and stern (Puma vocabulary)
  const plan: [number, number][] = [[-1.16, 1.32], [1.16, 1.32], [1.62, 0.92], [1.62, -3.10],
    [1.40, -3.48], [-1.40, -3.48], [-1.62, -3.10], [-1.62, 0.92]];
  P.add('hull', tag(polyMultiLoft(plan, [{ height: 0.00, inset: 1.00 }, { height: 0.42, inset: 0.985 },
    { height: 0.56, inset: 0.93 }]), 'monocoque'), 0, 1.24, 0);
  // engine deck: dark grille plate with louvres, an exhaust cowl on the right flank
  P.add('hullDark', tag(box(1.90, 0.03, 1.55), 'deck-grille'), 0, HULL_ROOF_Y + 0.02, -2.45);
  for (let i = 0; i < 9; i++) P.add('hullDetail', tag(box(1.72, 0.018, 0.05), 'deck-louvre'), 0, HULL_ROOF_Y + 0.045, -1.78 - i * 0.16);
  P.add('hullDark', tag(box(0.34, 0.20, 0.62), 'exhaust'), 1.42, HULL_ROOF_Y - 0.02, -2.05);
  for (let i = 0; i < 5; i++) P.add('hullDetail', tag(box(0.30, 0.012, 0.04), 'exhaust-louvre'), 1.42, HULL_ROOF_Y + 0.04 + i * 0.03, -2.05 - 0.22 + i * 0.11);
  // driver's hatch front-left with three periscopes and the low bow handrail
  P.addCupola('hull', tag(cylY(0.30, 0.32, 0.055, 20), 'driver-hatch'), -0.62, HULL_ROOF_Y + 0.025, 0.86);
  P.add('hullDark', tag(torus(0.30, 0.013, 20), 'driver-hatch-ring'), -0.62, HULL_ROOF_Y + 0.052, 0.86);
  for (const x of [-0.84, -0.62, -0.40]) KIT.periscope(P, 'hullDetail', x, HULL_ROOF_Y + 0.02, 1.16);
  P.add('hullDark', tag(cylX(0.016, 2.30, 10), 'bow-rail'), 0, HULL_ROOF_Y + 0.12, 1.34);
  for (const x of [-1.05, 0, 1.05]) P.add('hullDark', tag(box(0.026, 0.13, 0.026), 'bow-rail-post'), x, HULL_ROOF_Y + 0.06, 1.34);
  // recessed lamp clusters on the sponson fronts, tow eyes, the glacis tow cable
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.13, r: 0.046, guard: true,
      rake: -0.22, nightKind: 'headlight', seed: 1262 + (side > 0 ? 1 : 0) }), side * 1.38, 1.56, 1.16, [-0.30, side * 0.55, 0]);
    P.add('hullDark', tag(torus(0.075, 0.018, 12), 'tow-eye'), side * 0.86, 0.66, 3.40, Math.PI / 2, 0, 0);
    KIT.liftEye(P, 'hullDetail', side * 1.30, HULL_ROOF_Y + 0.04, -3.30);
  }
  KIT.towCable(P, [[-1.05, 1.50, 2.12], [-0.30, 1.28, 2.78], [0.30, 1.28, 2.78], [1.05, 1.50, 2.12]]);
  // stern: rear plate, two stowage bins, lamp guards
  P.add('hullDark', tag(box(2.30, 0.98, 0.05), 'rear-plate'), 0, 0.98, -3.55);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', tag(box(0.62, 0.36, 0.30), 'rear-bin'), side * 0.78, 1.48, -3.66);
    P.add('hullDark', tag(box(0.14, 0.10, 0.06), 'tail-lamp'), side * 1.20, 1.16, -3.60);
    P.add('hullGlass', tag(box(0.10, 0.06, 0.01), 'tail-lamp-glass'), side * 1.20, 1.16, -3.635);
  }
}

function buildType100RunningGear(P: TankBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, wheelR: 0.34, wheelW: 0.25, wheelY: 0.42, xc: 1.40,
    wheelZs: [2.32, 1.40, 0.48, -0.44, -1.36, -2.28],
    sprocket: { z: -3.02, y: 0.86, r: 0.34 }, idler: { z: 3.00, y: 0.80, r: 0.30 },
    rollerR: 0.085, rollers: [{ z: 1.45, y: 1.05 }, { z: 0.02, y: 1.06 }, { z: -1.42, y: 1.05 }],
    trackW: 0.58, trackTh: 0.09, topY: 1.20, botY: 0.06,
    wheelPattern: 'armored-hub-six', trackPattern: 'compact-ifv', linkPitchM: 0.150, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.52, contactZR: -2.46,
  });
  // layered skirt doors on an armour carrier wall, with the parade tank's chamfered leading door
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', tag(box(0.10, 1.00, 6.30), 'skirt-carrier'), side * 1.68, 1.22, -0.30);
    P.add('hull', tag(box(0.26, 0.16, 6.40), 'fender-cap'), side * 1.56, HULL_ROOF_Y + 0.02, -0.30);
    for (let i = 0; i < 7; i++) {
      const z = 2.10 - i * 0.84;
      if (i === 0) {
        // leading door: its lower front corner is cut back over the idler
        P.addExternalArmor('hull', tag(orientedSlab(
          [side * (SKIRT_X - 0.07), 0.98, z + 0.40], [side * (SKIRT_X + 0.07), 0.98, z + 0.40],
          [side * (SKIRT_X + 0.07), 0.70, z - 0.40], [side * (SKIRT_X - 0.07), 0.70, z - 0.40],
          [side * (SKIRT_X - 0.07), 1.55, z + 0.40], [side * (SKIRT_X + 0.07), 1.55, z + 0.40],
          [side * (SKIRT_X + 0.07), 1.55, z - 0.40], [side * (SKIRT_X - 0.07), 1.55, z - 0.40],
        ), 'skirt-door'));
      } else {
        P.addExternalArmor('hull', tag(box(0.14, 0.86, 0.80), 'skirt-door'), side * SKIRT_X, 1.12, z, 0, 0, side * (i % 2 ? 0.010 : -0.010));
      }
      // painted door face with a raised rim, a dark seam to the next door and four bolts
      P.add('hull', tag(box(0.020, 0.66, 0.62), 'skirt-face'), side * (SKIRT_X + 0.08), 1.14, z);
      if (i > 0) P.add('hullDark', tag(box(0.030, 0.84, 0.030), 'skirt-seam'), side * (SKIRT_X + 0.06), 1.12, z + 0.42);
      for (const y of [0.86, 1.44]) for (const dz of [-0.28, 0.28]) P.add('hullDetail', tag(cylX(0.016, 0.20, 8), 'skirt-bolt'), side * (SKIRT_X + 0.03), y, z + dz);
    }
    P.add('hullRubber', tag(box(0.04, 0.14, 6.20), 'skirt-lip'), side * (SKIRT_X + 0.02), 0.66, -0.30);
    // flank situational-awareness cameras
    for (const z of [1.10, -0.40, -1.90]) {
      P.addEquipment('hull', tag(box(0.10, 0.22, 0.28), 'flank-camera'), side * (SKIRT_X + 0.12), 1.68, z);
      P.addModuleVisual('optics', 'hullGlass', tag(box(0.014, 0.12, 0.16), 'flank-camera-glass'), side * (SKIRT_X + 0.18), 1.68, z);
    }
  }
}

// ---------------------------------------------------------------- turret ----
const ROOF_Y = 0.78;
const GUN_LEN = 4.95;

function buildType100Turret(P: TankBuilderPort): void {
  // low faceted citadel: wide wedge front, parallel flanks, narrowed bustle
  const plan: [number, number][] = [[-0.55, 1.70], [0.55, 1.70], [1.15, 1.20], [1.40, 0.40], [1.40, -1.10],
    [1.05, -1.70], [0.65, -1.85], [-0.65, -1.85], [-1.05, -1.70], [-1.40, -1.10], [-1.40, 0.40], [-1.15, 1.20]];
  P.add('turretDark', tag(cylY(1.28, 1.34, 0.10, 28), 'ring'), 0, -0.05, 0);
  P.add('turret', tag(polyMultiLoft(plan, [{ height: 0.02, inset: 1.00 }, { height: 0.46, inset: 0.975 },
    { height: ROOF_Y, inset: 0.86 }]), 'citadel'));
  // flat cheek modules with a horizontal crease, one per side of the gun bay
  for (const side of [-1, 1]) {
    for (const [y0, y1, out] of [[0.06, 0.40, 0.11], [0.42, 0.74, 0.07]] as const) {
      P.addExternalArmor('turret', tag(orientedSlab(
        [side * 0.58, y0, 1.62 + out], [side * 1.16, y0, 1.12 + out], [side * 1.10, y0, 1.06], [side * 0.58, y0, 1.56],
        [side * 0.58, y1, 1.62 + out], [side * 1.16, y1, 1.12 + out], [side * 1.10, y1, 1.06], [side * 0.58, y1, 1.56],
      ), 'cheek-module'));
    }
    // twin quadruple launcher pods on the shoulders, elevated and splayed outward
    const podX = side * 1.32, podY = 0.60, podZ = 0.52, yaw = side * 0.30;
    P.addEquipment('turret', tag(box(0.30, 0.50, 0.52), 'pod-frame'), podX, podY, podZ, -0.18, yaw, 0);
    for (const dy of [-0.13, 0.13]) {
      for (const dx of [-0.095, 0.095]) {
        P.add('turretDark', tag(cylZ(0.072, 0.62, 16).translate(dx, dy, 0.10), 'pod-tube'), podX, podY, podZ, -0.18, yaw, 0);
        P.add('turretDetail', tag(torus(0.075, 0.011, 16).rotateX(Math.PI / 2).translate(dx, dy, 0.41), 'pod-mouth'), podX, podY, podZ, -0.18, yaw, 0);
      }
    }
    // laser warning receivers at the four roof corners
    for (const z of [1.05, -1.55]) {
      P.addEquipment('turret', tag(box(0.16, 0.14, 0.14), 'lwr'), side * 1.10, ROOF_Y + 0.07, z);
      P.addModuleVisual('optics', 'turretGlass', tag(box(0.10, 0.06, 0.012), 'lwr-glass'), side * 1.10, ROOF_Y + 0.08, z + 0.075);
    }
  }
  // gun: boxy mantlet housing, trunnion, 105 mm tube with thermal sleeve, evacuator and MRS collar
  P.addGunExtra(tag(orientedSlab(
    [-0.30, 0.20, 0.02], [0.30, 0.20, 0.02], [0.24, 0.20, 0.98], [-0.24, 0.20, 0.98],
    [-0.30, 0.66, 0.02], [0.30, 0.66, 0.02], [0.24, 0.62, 0.98], [-0.24, 0.62, 0.98],
  ), 'mantlet'), 0, -0.42, 0);
  P.addGunExtraDark(tag(cylZ(0.150, 0.50, 22), 'trunnion'), 0, 0, 0.55);
  KIT.buildGun(P, { len: GUN_LEN, r: 0.078, sleeve: true, evac: 0.55, evacR: 1.55, collar: true, baseR: 0.150 });
  muzzleBore(P, { len: GUN_LEN, r: 0.078, seg: 20 });
  P.muzzleZ = GUN_LEN;
  // crew: commander's hatch front-left, the gunner's primary sight front-right
  P.addCupola('turret', tag(cylY(0.30, 0.32, 0.06, 20), 'commander-hatch'), -0.60, ROOF_Y + 0.03, 0.55);
  P.add('turretDark', tag(torus(0.30, 0.014, 20), 'commander-hatch-ring'), -0.60, ROOF_Y + 0.06, 0.55);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    KIT.periscope(P, 'turretDetail', -0.60 + Math.sin(a) * 0.36, ROOF_Y + 0.03, 0.55 + Math.cos(a) * 0.36, a);
  }
  P.addEquipment('turret', tag(box(0.44, 0.36, 0.46), 'gunner-sight'), 0.62, ROOF_Y + 0.14, 0.55);
  P.add('turretDark', tag(box(0.46, 0.05, 0.16), 'gunner-sight-hood'), 0.62, ROOF_Y + 0.34, 0.80);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.30, 0.20, 0.016), 'gunner-sight-glass'), 0.62, ROOF_Y + 0.14, 0.79);
  // the commander's independent sensor mast: pedestal, column, boxed head with a wide window, cap and dome
  P.add('turret', tag(cylY(0.22, 0.26, 0.16, 20), 'mast-pedestal'), 0.10, ROOF_Y + 0.08, -0.55);
  P.add('turretDark', tag(cylY(0.10, 0.12, 0.52, 16), 'mast-column'), 0.10, ROOF_Y + 0.42, -0.55);
  P.addEquipment('turret', tag(box(0.44, 0.38, 0.42), 'mast-head'), 0.10, ROOF_Y + 0.87, -0.55);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.28, 0.18, 0.02), 'mast-window'), 0.10, ROOF_Y + 0.88, -0.335);
  P.add('turretDark', tag(box(0.36, 0.03, 0.36), 'mast-cap'), 0.10, ROOF_Y + 1.075, -0.55);
  P.add('turretDetail', tag(cylY(0.09, 0.09, 0.10, 16), 'mast-dome'), 0.10, ROOF_Y + 1.14, -0.55);
  // remote weapon station right-rear, antenna whips on the bustle corners, the bustle rack
  const rws = FITTINGS.openYokeRws({ mats: P.mats, sizeStandard: 'k2b-compact-tower', scale: 0.78, towerRise: 0.10,
    variant: 'korean-twin', ammoSide: 1, sensorSide: -1, caliberMm: 12.7, weaponName: 'Type 100 remote 12.7 mm', seed: 1264 });
  rws.userData.hostVariant = 'type100';
  mount(P, 'turret', rws, 0.72, ROOF_Y + 0.06, -1.05);
  for (const side of [-1, 1]) {
    P.add('turretDark', tag(cylY(0.040, 0.052, 0.09, 10), 'antenna-pot'), side * 1.12, ROOF_Y + 0.045, -1.58);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 0.95 + (side > 0 ? 0.15 : 0), r: 0.010, seed: 1265 + (side > 0 ? 1 : 0) }),
      side * 1.12, ROOF_Y + 0.09, -1.58);
  }
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.80, d: 0.40, h: 0.22, fill: 0.45, rails: 4, seed: 1263 }), 0, 0.44, -2.02);
  P.add('turretDark', tag(box(1.70, 0.12, 0.16), 'bustle-sill'), 0, 0.30, -1.92);
  P.topY = Math.max(P.topY || 0, ROOF_Y + 1.20);
}

function buildType100(P: TankBuilderPort): void {
  buildType100Hull(P);
  buildType100RunningGear(P);
  buildType100Turret(P);
  // PLA star and the hull number on the left bow skirt, as the parade photographs show them
  P.decal('hull', 'star', null, 0.22, [-(SKIRT_X + 0.13), 1.26, 2.30], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '1262', 0.24, [-(SKIRT_X + 0.13), 1.26, 1.62], -Math.PI / 2);
  P.decal('turret', 'star', null, 0.24, [-1.46, 0.40, -0.40], -Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.type100Receipt = Object.freeze({
      architecture: 'type100-parade-r1', glacisFacets: 3, skirtDoorsPerSide: 7, roadWheelsPerSide: 6,
      launcherTubes: 8, sensorMastTopM: ROOF_Y + 1.20, gunLengthM: GUN_LEN,
    });
  }
}

export const TYPE100_PROFILES = Object.freeze({
  type100: Object.freeze({ build: buildType100 }),
}) satisfies VehicleProfileRecord;
