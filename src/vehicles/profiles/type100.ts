// Type 100 (ZTZ-100) — rebuilt 2026-09-16 from the owner's ten RenderHub reference renders of the
// vehicle ("redesign the type 100 completely … use all of these as references"). What the renders
// dictate: a long, low hull with one wide glacis over a steep lower bow and chamfered bow corners,
// vertical upper sides flush with seven bolted skirt panels over a rubber apron, two crew hatches at
// the glacis top, a round intake grille and a louvred deck panel, twin louvred exhaust grilles between
// the tail lamps; a low unmanned turret with a wedge front and a boxed 105 mm mantlet, the gunner's
// sight box right of the gun and the panoramic drum left of it, two roof hatches, four corner sensor
// cubes, twin quad hard-kill pods on the rear roof corners, the tall mast-mounted remote weapon station
// at the rear centre, two whip antennas and a louvred turret-rear grille; PLA digital woodland finish.
// First-party procedural build; no source model participates.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, FITTINGS, orientedSlab, convexSlab, muzzleBore } from './kit.ts';

type Vec3 = readonly [number, number, number];
type XYZ = [number, number, number];
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

/** A sloped armour plate spanning x0..x1 whose outer face runs from (yb, zb) to (yt, zt); the inner
 * face sits `thickness` behind it along the plate's inward normal. */
function slopedPlate(x0: number, x1: number, yb: number, zb: number, yt: number, zt: number,
  thickness: number): THREE.BufferGeometry {
  const dz = zt - zb, dy = yt - yb, len = Math.hypot(dz, dy);
  const nz = dy / len, ny = -dz / len;
  const iz = -nz * thickness, iy = -ny * thickness;
  return orientedSlab(
    [x0, yb, zb], [x1, yb, zb], [x1, yb + iy, zb + iz], [x0, yb + iy, zb + iz],
    [x0, yt, zt], [x1, yt, zt], [x1, yt + iy, zt + iz], [x0, yt + iy, zt + iz],
  );
}

/** A louvred grille: dark backing plate with `count` lighter slats across it (a is the slat length axis). */
function louvres(P: TankBuilderPort, owner: 'hull' | 'turret', part: string, center: XYZ, width: number,
  height: number, count: number, faceNormal: 'z' | 'y', depth = 0.04): void {
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  const detail = owner === 'hull' ? 'hullDetail' : 'turretDetail';
  const [x, y, z] = center;
  if (faceNormal === 'z') {
    P.add(dark, tag(box(width, height, depth), part), x, y, z);
    const pitch = (height - 0.08) / (count - 1);
    for (let i = 0; i < count; i++) {
      P.add(detail, tag(box(width - 0.08, 0.016, depth + 0.02), `${part}-slat`), x, y - (height - 0.08) / 2 + i * pitch, z);
    }
  } else {
    P.add(dark, tag(box(width, depth, height), part), x, y, z);
    const pitch = (height - 0.08) / (count - 1);
    for (let i = 0; i < count; i++) {
      P.add(detail, tag(box(width - 0.08, depth + 0.02, 0.016), `${part}-slat`), x, y, z - (height - 0.08) / 2 + i * pitch);
    }
  }
}

// ------------------------------------------------------------------ hull ----
const HULL_ROOF_Y = 1.80;
const SPONSON_Y = 1.02;
const SIDE_X = 1.70;
const SKIRT_X = 1.76;

function buildType100Hull(P: TankBuilderPort): void {
  // lower tub between the tracks, from the belly to the sponson floor
  P.add('hull', tag(box(2.30, 0.86, 7.30), 'tub'), 0, 0.81, -0.10);
  // steep lower bow, then the single wide glacis rising to the roof (renders 1, 7, 8)
  P.add('hull', tag(slopedPlate(-1.15, 1.15, 0.40, 3.78, SPONSON_Y, 3.50, 0.12), 'bow'));
  P.add('hull', tag(slopedPlate(-1.15, 1.15, SPONSON_Y, 3.50, HULL_ROOF_Y, 1.75, 0.11), 'glacis'));
  // chamfered bow corners between the glacis edge and the vertical upper sides — twisted hexahedra, so
  // they are convex hulls (orientedSlab leaves inward quads on twisted rings; sealed check 2026-09-13)
  for (const s of [-1, 1]) {
    const inward = (p: XYZ): XYZ => [p[0] - s * 0.12, p[1], p[2] - 0.08];
    const a: XYZ = [s * 1.15, SPONSON_Y, 3.50], b: XYZ = [s * SIDE_X, SPONSON_Y, 2.85];
    const c: XYZ = [s * SIDE_X, HULL_ROOF_Y, 1.75], d: XYZ = [s * 1.15, HULL_ROOF_Y, 1.75];
    P.add('hull', tag(convexSlab(a, b, inward(b), inward(a), d, c, inward(c), inward(d)), 'bow-corner'));
    const la: XYZ = [s * 1.15, 0.40, 3.78], lb: XYZ = [s * 1.60, 0.40, 3.28];
    P.add('hull', tag(convexSlab(la, lb, inward(lb), inward(la), a, b, inward(b), inward(a)), 'bow-corner-lower'));
  }
  // upper body: vertical sides flush over the skirt line, cut stern corners, a slight roof chamfer
  const plan: [number, number][] = [[-SIDE_X, 1.75], [SIDE_X, 1.75], [SIDE_X, -3.62], [1.56, -3.75],
    [-1.56, -3.75], [-SIDE_X, -3.62]];
  P.add('hull', tag(polyMultiLoft(plan, [{ height: 0.00, inset: 1.00 }, { height: 0.74, inset: 1.00 },
    { height: HULL_ROOF_Y - SPONSON_Y, inset: 0.97 }]), 'upper-body'), 0, SPONSON_Y, 0);
  // roof panel seams
  for (const x of [-0.75, 0.75]) P.add('hullDark', tag(box(0.02, 0.006, 5.00), 'roof-seam'), x, HULL_ROOF_Y + 0.003, -0.95);
  for (const z of [1.10, -0.60, -2.20]) P.add('hullDark', tag(box(3.20, 0.006, 0.02), 'roof-seam'), 0, HULL_ROOF_Y + 0.003, z);
  // two crew hatches at the glacis top with their periscopes (renders 6, 9)
  for (const [s, scopes] of [[-1, [-0.82, -0.60, -0.38]], [1, [0.50, 0.72]]] as const) {
    P.addCupola('hull', tag(box(0.60, 0.05, 0.56), 'hull-hatch'), s * 0.60, HULL_ROOF_Y + 0.025, 1.28);
    P.add('hullDark', tag(box(0.60, 0.02, 0.04), 'hull-hatch-hinge'), s * 0.60, HULL_ROOF_Y + 0.06, 1.58);
    P.add('hullDark', tag(box(0.10, 0.03, 0.03), 'hull-hatch-handle'), s * 0.60, HULL_ROOF_Y + 0.065, 1.02);
    for (const x of scopes) KIT.periscope(P, 'hullDetail', x, HULL_ROOF_Y + 0.02, 1.66);
  }
  // round intake grille right of the turret ring, louvred deck panel, exhaust grilles at the stern
  P.add('hullDark', tag(cylY(0.32, 0.32, 0.05, 24), 'intake'), 1.10, HULL_ROOF_Y + 0.025, -1.78);
  P.add('hullDark', tag(torus(0.32, 0.014, 24), 'intake-rim'), 1.10, HULL_ROOF_Y + 0.05, -1.78, Math.PI / 2, 0, 0);
  for (const r of [0.10, 0.19, 0.27]) P.add('hullDark', tag(torus(r, 0.006, 20), 'intake-ring'), 1.10, HULL_ROOF_Y + 0.052, -1.78, Math.PI / 2, 0, 0);
  louvres(P, 'hull', 'deck-grille', [0, HULL_ROOF_Y + 0.02, -2.95], 1.80, 1.00, 7, 'y', 0.03);
  for (const s of [-1, 1]) louvres(P, 'hull', 'rear-grille', [s * 0.60, 1.40, -3.78], 0.92, 0.56, 6, 'z');
  // bow handrail loop front-left, lifting eyes, forward sensor cubes
  P.add('hullDark', tag(cylZ(0.016, 0.60, 10), 'bow-rail'), -1.30, HULL_ROOF_Y + 0.16, 1.10);
  for (const z of [1.40, 0.80]) P.add('hullDark', tag(box(0.026, 0.16, 0.026), 'bow-rail-post'), -1.30, HULL_ROOF_Y + 0.08, z);
  for (const s of [-1, 1]) {
    KIT.liftEye(P, 'hullDetail', s * 1.35, HULL_ROOF_Y + 0.04, -3.35);
    KIT.liftEye(P, 'hullDetail', s * 1.35, HULL_ROOF_Y + 0.04, 1.40);
    P.addEquipment('hull', tag(box(0.14, 0.14, 0.14), 'bow-das'), s * 1.52, HULL_ROOF_Y + 0.07, 1.58);
    P.addModuleVisual('optics', 'hullGlass', tag(box(0.08, 0.06, 0.012), 'bow-das-glass'), s * 1.52, HULL_ROOF_Y + 0.07, 1.655);
    // recessed lamp clusters low on the glacis corners, bow and stern tow hooks
    mount(P, 'hull', FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.13, r: 0.046, guard: true,
      rake: -0.60, nightKind: 'headlight', seed: 1262 + (s > 0 ? 1 : 0) }), s * 1.00, 1.10, 3.30, [-0.55, 0, 0]);
    P.add('hullDark', tag(torus(0.075, 0.018, 12), 'tow-hook'), s * 0.80, 0.64, 3.74, Math.PI / 2, 0, 0);
    P.add('hullDark', tag(torus(0.075, 0.018, 12), 'tow-hook'), s * 0.70, 0.72, -3.80, Math.PI / 2, 0, 0);
    // tail lamp clusters at the stern corners: red over amber
    P.add('hullDark', tag(box(0.18, 0.12, 0.06), 'tail-lamp'), s * 1.16, 1.72, -3.78);
    P.addModuleVisual('optics', 'hullGlass', tag(box(0.07, 0.08, 0.012), 'tail-lamp-glass'), s * (1.16 - 0.04), 1.72, -3.815);
    P.addModuleVisual('optics', 'hullGlass', tag(box(0.07, 0.08, 0.012), 'tail-lamp-glass'), s * (1.16 + 0.04), 1.72, -3.815);
  }
  P.add('hullRubber', tag(box(2.30, 0.28, 0.03), 'mud-flap'), 0, 0.48, -3.82);
}

function buildType100RunningGear(P: TankBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, wheelR: 0.34, wheelW: 0.25, wheelY: 0.42, xc: 1.40,
    wheelZs: [2.30, 1.38, 0.46, -0.46, -1.38, -2.30],
    sprocket: { z: -3.05, y: 0.86, r: 0.34 }, idler: { z: 3.05, y: 0.80, r: 0.30 },
    rollerR: 0.085, rollers: [{ z: 1.45, y: 1.05 }, { z: 0.02, y: 1.06 }, { z: -1.42, y: 1.05 }],
    trackW: 0.58, trackTh: 0.09, topY: 1.20, botY: 0.06,
    wheelPattern: 'pressed-eight', trackPattern: 'compact-ifv', linkPitchM: 0.150, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.52, contactZR: -2.50,
  });
  // seven bolted skirt panels a side over a rubber apron, flush under the upper side plate (renders 5, 8)
  for (const s of [-1, 1]) {
    P.addExternalArmor('hull', tag(box(0.10, 1.06, 6.40), 'skirt-carrier'), s * 1.66, 1.03, -0.20);
    P.add('hullDark', tag(box(0.02, 0.03, 5.10), 'skirt-line'), s * (SIDE_X + 0.01), 1.54, -0.80);
    for (let i = 0; i < 7; i++) {
      const z = 2.66 - i * 0.84;
      if (i === 0) {
        // leading panel: its lower front corner is cut back over the idler
        P.addExternalArmor('hull', tag(orientedSlab(
          [s * (SKIRT_X - 0.06), 0.88, z + 0.40], [s * (SKIRT_X + 0.06), 0.88, z + 0.40],
          [s * (SKIRT_X + 0.06), 0.60, z - 0.40], [s * (SKIRT_X - 0.06), 0.60, z - 0.40],
          [s * (SKIRT_X - 0.06), 1.50, z + 0.40], [s * (SKIRT_X + 0.06), 1.50, z + 0.40],
          [s * (SKIRT_X + 0.06), 1.50, z - 0.40], [s * (SKIRT_X - 0.06), 1.50, z - 0.40],
        ), 'skirt-door'));
      } else {
        P.addExternalArmor('hull', tag(box(0.12, 0.90, 0.80), 'skirt-door'), s * SKIRT_X, 1.05, z);
      }
      if (i > 0) P.add('hullDark', tag(box(0.03, 0.90, 0.03), 'skirt-seam'), s * (SKIRT_X + 0.05), 1.05, z + 0.42);
      for (const dz of [-0.30, -0.10, 0.10, 0.30]) P.add('hullDetail', tag(cylX(0.014, 0.16, 8), 'skirt-bolt'), s * (SKIRT_X + 0.02), 1.44, z + dz);
    }
    // short trailing cap over the sprocket
    P.addExternalArmor('hull', tag(box(0.12, 0.62, 0.50), 'skirt-cap'), s * SKIRT_X, 1.19, -3.10);
    P.add('hullRubber', tag(box(0.04, 0.16, 6.40), 'skirt-apron'), s * (SKIRT_X + 0.02), 0.52, -0.20);
  }
}

// ---------------------------------------------------------------- turret ----
const ROOF_Y = 0.62;
const GUN_LEN = 4.95;

function buildType100Turret(P: TankBuilderPort): void {
  // low unmanned citadel: wedge front, vertical flanks, cut bustle corners (renders 2, 6, 9)
  const plan: [number, number][] = [[-0.44, 1.72], [0.44, 1.72], [1.22, 1.05], [1.32, 0.55], [1.32, -1.55],
    [1.06, -1.88], [-1.06, -1.88], [-1.32, -1.55], [-1.32, 0.55], [-1.22, 1.05]];
  P.add('turretDark', tag(cylY(1.30, 1.36, 0.08, 28), 'ring'), 0, -0.04, 0);
  P.add('turret', tag(polyMultiLoft(plan, [{ height: 0.00, inset: 1.00 }, { height: 0.46, inset: 0.99 },
    { height: ROOF_Y, inset: 0.91 }]), 'citadel'));
  for (const s of [-1, 1]) {
    // flat cheek modules with a horizontal crease on the wedge faces
    for (const [y0, y1, out] of [[0.04, 0.32, 0.09], [0.34, 0.58, 0.06]] as const) {
      P.addExternalArmor('turret', tag(orientedSlab(
        [s * 0.46, y0, 1.66 + out], [s * 1.20, y0, 1.02 + out], [s * 1.14, y0, 0.96], [s * 0.46, y0, 1.60],
        [s * 0.46, y1, 1.66 + out], [s * 1.20, y1, 1.02 + out], [s * 1.14, y1, 0.96], [s * 0.46, y1, 1.60],
      ), 'cheek-module'));
    }
    // angled cheek sensor blocks with a window (render 8)
    P.addEquipment('turret', tag(box(0.40, 0.28, 0.34), 'cheek-sensor'), s * 1.02, 0.50, 1.02, 0, s * 0.72, 0);
    P.addModuleVisual('optics', 'turretGlass', tag(box(0.20, 0.12, 0.012).rotateY(s * 0.72), 'cheek-sensor-glass'),
      s * (1.02 + 0.115), 0.50, 1.02 + 0.126);
    // corner sensor cubes on the roof
    for (const z of [1.00, -1.62]) {
      P.addEquipment('turret', tag(box(0.14, 0.14, 0.14), 'das'), s * 1.10, ROOF_Y + 0.07, z);
      P.addModuleVisual('optics', 'turretGlass', tag(box(0.08, 0.06, 0.012), 'das-glass'), s * 1.10, ROOF_Y + 0.07, z + 0.075);
    }
    // twin quad hard-kill pods on the rear roof corners, pitched up and splayed outward (renders 3, 4)
    const podX = s * 1.02, podY = ROOF_Y + 0.20, podZ = -1.05, pitch = -0.38, yaw = s * 0.30;
    P.addEquipment('turret', tag(box(0.34, 0.34, 0.44), 'pod-frame'), podX, podY, podZ, pitch, yaw, 0);
    for (const dy of [-0.10, 0.10]) {
      for (const dx of [-0.10, 0.10]) {
        P.add('turretDark', tag(cylZ(0.085, 0.64, 16).translate(dx, dy, 0.08), 'pod-tube'), podX, podY, podZ, pitch, yaw, 0);
        P.add('turretDark', tag(torus(0.086, 0.008, 16).rotateX(Math.PI / 2).translate(dx, dy, 0.40), 'pod-mouth'), podX, podY, podZ, pitch, yaw, 0);
        P.add('turretDark', tag(cylZ(0.072, 0.012, 16).translate(dx, dy, 0.40), 'pod-cap'), podX, podY, podZ, pitch, yaw, 0);
      }
    }
    // roof hatches with hinge strips and handles
    P.addCupola('turret', tag(box(0.54, 0.04, 0.50), 'turret-hatch'), s * 0.55, ROOF_Y + 0.02, -0.25);
    P.add('turretDark', tag(box(0.54, 0.02, 0.04), 'turret-hatch-hinge'), s * 0.55, ROOF_Y + 0.05, 0.02);
    P.add('turretDark', tag(box(0.10, 0.03, 0.03), 'turret-hatch-handle'), s * 0.55, ROOF_Y + 0.055, -0.48);
    // antennas on the bustle corners, grab handles
    P.add('turretDark', tag(cylY(0.040, 0.052, 0.09, 10), 'antenna-pot'), s * 0.85, ROOF_Y + 0.045, -1.60);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.30 + (s > 0 ? 0.25 : 0), r: 0.010, seed: 1265 + (s > 0 ? 1 : 0) }),
      s * 0.85, ROOF_Y + 0.09, -1.60);
    P.add('turretDark', tag(cylX(0.012, 0.30, 8), 'grab-handle'), s * 0.60, ROOF_Y + 0.08, -1.45);
  }
  // gun: boxed mantlet with a chamfered top, trunnion, 105 mm tube with sleeve, evacuator and collar
  P.addGunExtra(tag(orientedSlab(
    [-0.33, -0.24, 0.02], [0.33, -0.24, 0.02], [0.27, -0.24, 1.00], [-0.27, -0.24, 1.00],
    [-0.33, 0.26, 0.02], [0.33, 0.26, 0.02], [0.27, 0.20, 1.00], [-0.27, 0.20, 1.00],
  ), 'mantlet'), 0, 0, 0);
  P.addGunExtraDark(tag(cylZ(0.150, 0.50, 22), 'trunnion'), 0, 0, 0.55);
  KIT.buildGun(P, { len: GUN_LEN, r: 0.078, sleeve: true, evac: 0.55, evacR: 1.55, collar: true, baseR: 0.150 });
  muzzleBore(P, { len: GUN_LEN, r: 0.078, seg: 20 });
  P.muzzleZ = GUN_LEN;
  // gunner's sight box right of the gun, the panoramic drum left of it, the meteorological mast
  P.addEquipment('turret', tag(box(0.42, 0.30, 0.46), 'gunner-sight'), 0.64, ROOF_Y + 0.15, 1.00);
  P.add('turretDark', tag(box(0.44, 0.05, 0.16), 'gunner-sight-hood'), 0.64, ROOF_Y + 0.32, 1.24);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.28, 0.18, 0.016), 'gunner-sight-glass'), 0.64, ROOF_Y + 0.15, 1.235);
  P.add('turret', tag(cylY(0.20, 0.22, 0.24, 20), 'panoramic-drum'), -0.60, ROOF_Y + 0.12, 0.70);
  P.addEquipment('turret', tag(box(0.30, 0.26, 0.34), 'panoramic-head'), -0.60, ROOF_Y + 0.38, 0.70);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.20, 0.14, 0.014), 'panoramic-glass'), -0.60, ROOF_Y + 0.38, 0.877);
  P.add('turretDark', tag(cylY(0.012, 0.012, 0.40, 8), 'met-mast'), 0.95, ROOF_Y + 0.20, 1.10);
  P.add('turretDark', tag(box(0.12, 0.02, 0.02), 'met-mast-cross'), 0.95, ROOF_Y + 0.40, 1.10);
  // the mast-mounted remote weapon station at the rear centre (renders 3, 4, 8): base, column, cradle,
  // 12.7 mm gun with receiver and flash hider, sensor pod and ammunition box
  const rwsZ = -1.20;
  P.add('turret', tag(box(0.62, 0.22, 0.62), 'rws-base'), 0, ROOF_Y + 0.11, rwsZ);
  P.add('turretDark', tag(box(0.20, 0.52, 0.20), 'rws-column'), 0, ROOF_Y + 0.48, rwsZ);
  P.addEquipment('turret', tag(box(0.44, 0.30, 0.60), 'rws-cradle'), 0, ROOF_Y + 0.95, rwsZ);
  P.add('turretDark', tag(box(0.14, 0.12, 0.44), 'rws-receiver'), 0.12, ROOF_Y + 1.02, rwsZ);
  P.add('turretDark', tag(cylZ(0.028, 1.15, 12), 'rws-barrel'), 0.12, ROOF_Y + 1.02, rwsZ + 0.60);
  P.add('turretDark', tag(cylZ(0.036, 0.10, 12), 'rws-flash-hider'), 0.12, ROOF_Y + 1.02, rwsZ + 1.18);
  P.addEquipment('turret', tag(box(0.18, 0.24, 0.22), 'rws-sensor'), -0.26, ROOF_Y + 0.95, rwsZ + 0.16);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.11, 0.13, 0.012), 'rws-sensor-glass'), -0.26, ROOF_Y + 0.95, rwsZ + 0.276);
  P.addEquipment('turret', tag(box(0.20, 0.18, 0.28), 'rws-ammo'), 0.30, ROOF_Y + 0.93, rwsZ);
  // louvred grille across the turret rear (renders 3, 4)
  louvres(P, 'turret', 'turret-grille', [0, 0.24, -1.89], 1.70, 0.36, 6, 'z');
  P.topY = Math.max(P.topY || 0, ROOF_Y + 1.10);
}

function buildType100(P: TankBuilderPort): void {
  buildType100Hull(P);
  buildType100RunningGear(P);
  buildType100Turret(P);
  // PLA star and hull number on both upper hull sides, the emblem field on both turret flanks
  for (const s of [-1, 1]) {
    P.decal('hull', 'star', null, 0.22, [s * (SIDE_X + 0.012), 1.50, 1.30], s * -Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || 'LZ83', 0.26, [s * (SIDE_X + 0.012), 1.50, 0.50], s * -Math.PI / 2);
    P.decal('turret', 'star', null, 0.24, [s * 1.335, 0.32, 0.20], s * -Math.PI / 2);
  }
  if (P.geometryReceipt) {
    P.hullG.userData.type100Receipt = Object.freeze({
      architecture: 'type100-ztz100-r2', glacisFacets: 2, skirtDoorsPerSide: 7, roadWheelsPerSide: 6,
      launcherTubes: 8, rwsTopM: ROOF_Y + 1.10, gunLengthM: GUN_LEN,
    });
  }
}

export const TYPE100_PROFILES = Object.freeze({
  type100: Object.freeze({ build: buildType100 }),
}) satisfies VehicleProfileRecord;
