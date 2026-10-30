// Chinese main-battle-tank family.
//
// §5.248 GROUND-UP REBUILDS (2026-08-17): ztz99a2 is a complete first-party
// construction measured against its own batch-B print (the ZTZ-85-III's own
// release-263 rebuild lives in profiles/ztz85iii.ts)
// (docs/references/vertex/ztz99a2.json — a WEAK fused
// whole-view instruments, so published dims anchor every frame and the
// prints carry silhouette/proportion truth only).  No donor build is called:
// hulls are station lofts, turrets are connected welded polyMultiLoft
// shells, and every fitting seats on real geometry per BUILD-STANDARD §B.
// The ztz99_longwei oracle package below is a RESIDENT of this module riding the
// frozen canonical Type-99A constructor — it is guard-held and unchanged.

import {addChineseThroatStock,addChineseMovingMantlet} from './chineseGunOpening.ts';
import {addChineseFuelDrum} from './chineseFuelDrum.ts';
import { KIT, FITTINGS, MUDGUARDS, orientedSlab, muzzleBore } from './kit.ts';
import {
  chineseArrowCassette,
  closedIntegratedChevron,
  type ChevronStation,
} from './chineseChevron.ts';
import { loftHull, tubeGun, ruFlaps, widthAnchor } from './russia.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mount } from './fittingMount.ts';
import { smokeSocketsFor } from '../vehicleAuxiliaryGeometry.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { bustleCutZ, ZTZ99A2_BUSTLE_CUT_FRONT_Z, ZTZ99A2_BUSTLE_CUT_REAR_Z } from '../donorBustleCut.ts';
import { buildType59 } from './t54Family.ts';
import { buildZTZ85III } from './ztz85iii.ts';

type Vec3Tuple = [number, number, number];
type Vec2Tuple = [number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';

export interface ChinaBuilderPort extends TankBuilderPort {}


function armorCassette(
  P: ChinaBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  seam = true,
): void {
  const r = rotation || [0, 0, 0];
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.visualEraCluster(`china-layered-${owner}-era`, owner, () => {
  P.add(bucket, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (seam) {
    P.add(detail, KIT.box(w * 0.72, 0.018, Math.max(0.025, d * 0.07)),
      x, y + h * 0.50 + 0.010, z + d * 0.30, r[0], r[1], r[2]);
  }
  });
}

function addSmokeBanks(
  P: ChinaBuilderPort,
  x: number,
  y: number,
  z: number,
  count: number,
  seed: number,
): void {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.043, len: 0.30, splay: side * 1.02,
      pitch: -0.44, arc: 0.58, spacing: 0.10, slot: 'detail',
      rotation: [0, 0, -side * 0.12], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

function addZTZ99A2RearServiceComplex(P: ChinaBuilderPort): void {
  const { box, cylX, cylZ, torus } = KIT;

  // The welded rear wall is armor; everything mounted to it is equipment.
  // Keep the service complex slightly embedded in the shell so the three
  // cabinets, their drip rail and the basket cradle read as one supported
  // installation instead of a second armor slab floating behind the turret.
  // Release 227 (CN critic round 5): the drip rails hung 10 mm over and 9 mm under this slab (y .15-.71); each now
  // overlaps it by 2 mm, the upper rail on its top, the lower rail under its floor.
  P.addEquipment('turret', box(2.18, 0.56, 0.085), 0, 0.43, -1.738);
  P.add('turretDark', box(2.06, 0.030, 0.055), 0, 0.71 - 0.002 + 0.015, -1.782);
  P.add('turretDark', box(2.06, 0.032, 0.055), 0, 0.15 + 0.002 - 0.016, -1.782);
  const cabinets = [
    { x: -0.74, w: 0.52, h: 0.34, y: 0.43 },
    { x: 0, w: 0.66, h: 0.42, y: 0.42 },
    { x: 0.74, w: 0.52, h: 0.34, y: 0.43 },
  ];
  for (const { x, w, h, y } of cabinets) {
    P.addEquipment('turret', box(w, h, 0.18), x, y, -1.82);
    P.add('turretDark', box(w * 0.88, h * 0.84, 0.022), x, y, -1.922);
    P.add('turretDetail', box(w * 0.74, 0.024, 0.030), x, y + h * 0.39, -1.940);
    P.add('turretDetail', box(w * 0.74, 0.024, 0.030), x, y - h * 0.39, -1.940);
  }

  // Louvered central APU/radio door, side access latches and real rear-face
  // fasteners provide the density missing from the marked broad slab.
  for (let row = 0; row < 5; row++) {
    P.add('turretDetail', box(0.46, 0.025, 0.030), 0, 0.30 + row * 0.058, -1.947);
  }
  for (const x of [-0.91, -0.57, 0.57, 0.91]) {
    P.add('turretDetail', box(0.036, 0.12, 0.035), x, 0.43, -1.947);
  }
  // The fasteners stood 19-48 mm off anything, in the cabinet doors' plane above and below the cabinets; they bolt the
  // slab, 2 mm into its rear face (z -1.7805) and inside its flat band clear of the rounded edges.
  for (const x of [-0.99, -0.49, 0.49, 0.99]) {
    for (const y of [0.195, 0.66]) {
      P.add('turretDark', cylZ(0.022, 0.035, 8), x, y, -1.7805 - 0.035 / 2 + 0.002);
    }
  }
  // Transverse recovery/tool tube and two positive straps.  Its ends remain
  // inside the side-return rails and below the antenna collars.
  P.addEquipment('turret', cylX(0.095, 1.88, 14), 0, 0.80, -1.86);
  for (const x of [-0.64, 0.64]) {
    P.add('turretDark', box(0.055, 0.23, 0.23), x, 0.80, -1.86);
  }

  // Rear-facing cable reel and extinguisher bottle are asymmetric on
  // purpose, like the roof fittings, but both have planted cradles.
  P.addEquipment('turret', cylZ(0.155, 0.105, 16), 0.77, 0.48, -2.005);
  P.add('turretDark', torus(0.13, 0.020, 16), 0.77, 0.48, -2.064);
  P.add('turretDark', cylZ(0.030, 0.120, 10), 0.77, 0.48, -2.070);
  P.addEquipment('turret', cylX(0.095, 0.62, 14), -0.69, 0.48, -2.015);
  for (const x of [-0.91, -0.47]) {
    P.add('turretDark', box(0.035, 0.22, 0.22), x, 0.48, -2.015);
  }
  // Cabinet-to-basket load paths and a populated lower tray.  The cases sit
  // inside the existing rail envelope rather than replacing or widening it.
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.055, 0.055, 0.52), side * 1.04, 0.25, -1.98,
      0, side * 0.08, 0);
  }
  for (const x of [-0.78, -0.26, 0.26, 0.78]) {
    P.addEquipment('turret', box(0.39, 0.34, 0.30), x, 0.36, -2.18);
    P.add('turretDark', box(0.055, 0.36, 0.32), x, 0.36, -2.18);
    P.add('turretDetail', box(0.19, 0.035, 0.050), x, 0.54, -2.29);
  }
  P.addEquipment('turret', cylX(0.13, 1.10, 14), -0.43, 0.69, -2.22);
  P.addEquipment('turret', cylX(0.11, 0.92, 14), 0.54, 0.67, -2.19);
}

// §5.266 critic fix (both turrets): the polyMultiLoft crown ring caught sun
// as a pale unpainted ribbon in plan/top-tilt.  Dress the rim with a dark
// weld-trim band: one thin plate per plan edge hugging the lip (2 mm proud
// of the ring — inside AA, mask-neutral) and lapping 7 cm onto the roof.
function crownRimTrim(
  P: ChinaBuilderPort,
  plan: readonly Vec2Tuple[],
  insets: number | readonly number[],
  crowns: number | readonly number[],
): void {
  const n = plan.length;
  const cx = plan.reduce((s, p) => s + p[0], 0) / n;
  const cz = plan.reduce((s, p) => s + p[1], 0) / n;
  const at = (value: number | readonly number[], index: number): number => (
    typeof value === 'number' ? value : value[index]
  );
  const ring = plan.map(([x, z], i) => [
    cx + (x - cx) * at(insets, i), at(crowns, i), cz + (z - cz) * at(insets, i)]);
  const pull = (point: readonly number[], scale: number): Vec3Tuple => [
    point[0] + (cx - point[0]) * scale,
    point[1],
    point[2] + (cz - point[2]) * scale,
  ];
  for (let i = 0; i < n; i++) {
    const a = ring[i]; const b = ring[(i + 1) % n];
    const ao = pull(a, -0.004); const bo = pull(b, -0.004);
    const ai = pull(a, 0.075); const bi = pull(b, 0.075);
    P.add('turretDark', orientedSlab(
      [ao[0], ao[1] - 0.030, ao[2]], [bo[0], bo[1] - 0.030, bo[2]],
      [bi[0], bi[1] + 0.002, bi[2]], [ai[0], ai[1] + 0.002, ai[2]],
      [ao[0], ao[1] - 0.016, ao[2]], [bo[0], bo[1] - 0.016, bo[2]],
      [bi[0], bi[1] + 0.014, bi[2]], [ai[0], ai[1] + 0.014, ai[2]]));
  }
}

// ===========================================================================
// ZTZ-99A2 — GROUND-UP §K BUILD (§5.248, 2026-08-17)
// ===========================================================================
// Published frame (batch-B REG receipts): hull 7.6, overall 11.0 gun forward,
// width 3.7 over skirts, turret roof 2.37 (spec heightM 2.45 = §5.73-1 P95
// with the flat roof plane; silhouette rows carry the drum-inclusive trace).
// Print work order (docs/references/vertex/ztz99a2.json, ring frame z=0 at
// world -0.15): hull -5.15..+2.65 print (=-4.05..+3.75 here, bow trimmed to
// the published 7.6), deck 1.72, DEEP wedge cheeks falling 2.5 -> 2.06 to a
// +1.7 nose, bustle roof 2.45 running to -2.7, forward-left sight head
// (print 2.79), rear-right mast cluster (print 2.99), gun axis 1.95, twin
// rear fuel drums hanging 1.5..2.1 behind the transom.  This tank is
// DISTINCT from the resident ztz99_longwei: longer/deeper cheek wedge, revised
// roof optics, drum rack — and its own frame throughout.
// The lofted hull's plate top line [z, y], stern to bow toe.
// release 240 (the gun-hull lane; the owner: "make sure all tank turrets are clear of hulls, esp tanks like the vt 4a1,
// ztz 99a2, ztz 99a"): the rear deck's crest at 1.685 (the print's 1.72), so the three turrets on this hull, seated over
// the deck round their rings at about 1.70 (turretSeatRace.ts), clear it and its fittings at every bearing
const ZTZ99A2_DECK: readonly (readonly [number, number])[] = [[-4.05, 1.60], [-3.80, 1.68], [-2.05, 1.685],
  [-0.30, 1.68], [1.90, 1.64], [3.55, 1.02]];
/** The half of `points`' convex hull on one side of the plane x = xCut (keep +1: x >= xCut; -1: x <= xCut): the hull
 * of the points on that side and every straddling pair's crossing. Each hull edge is such a pair, so this is exact. */
function convexHalfX(points: readonly Vector3[], xCut: number, keep: number): ConvexGeometry {
  const kept = points.filter((p) => (p.x - xCut) * keep >= 0);
  points.forEach((a, i) => points.slice(i + 1).forEach((b) => {
    const da = a.x - xCut, db = b.x - xCut;
    if (da * db < 0) kept.push(a.clone().lerp(b, da / (da - db)));
  }));
  return new ConvexGeometry(kept);
}

export function buildZTZ99A2Hull(P: ChinaBuilderPort): void {
  const { box, cylY, cylZ, torus, buildRunningGear, headlight, periscope, towCable, liftEye } = KIT;

  // ---- six large-wheel stations, rear drive, covered return run.
  // owner 2026-09-22 ("vt 4a1, ztz 99a2 and ztz 99a2 proto … wheels too big … overlap each other"):
  // r 0.47 on the 0.84 pitch overlapped by 10 cm. The Type 99A family rides six ~720 mm wheels
  // (2R/pitch 0.86, a 12 cm gap); the upper run stays covered under the skirts.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.26, wheelY: 0.43, xc: 1.47,
    dishR: 0.78,
    wheelZs: [2.14, 1.30, 0.46, -0.38, -1.22, -2.06],
    sprocket: { z: -3.05, y: 0.78, r: 0.39 },
    idler: { z: 2.95, y: 0.74, r: 0.36 },
    // FSP-03 2026-09-25: the Type 99A carries four return rollers per side (Army Recognition ZTZ-99A);
    // evenly stationed, r 0.10 under the skirts. The VT-4A1 keeps this certified chassis by owner
    // decision (its published count is 3 or 4 by source; recorded as unresolved in the FSP-03 audit).
    rollers: [-1.60, -0.53, 0.53, 1.60].map((z) => ({ z, y: 0.95, r: 0.10 })),
    trackW: 0.63, topY: 1.24, botY: 0.06,
    paintedEnds: true, coveredTop: true, arms: true,
    contactZF: 2.14, contactZR: -2.06,
  });

  // ---- lofted hull: stern -4.05, bow toe +3.55, rear deck 1.70 (print
  // 1.72), long shallow glacis to the published 7.6 envelope.
  loftHull(P, {
    deck: ZTZ99A2_DECK,
    belly: [[-4.05, 0.70], [-3.35, 0.46], [2.15, 0.46], [3.10, 0.60],
      [3.55, 0.96]],
    wUp: [[-4.05, 1.66], [3.10, 1.66], [3.55, 1.26]],
    wLo: [[-4.05, 1.06], [3.55, 1.06]],
    sponsonY: 1.36,
  });
  // fender shelf: the print carries its full 3.7 width at deck height from
  // stern to bow shoulder — segmented plates bridge sponson edge to the
  // skirt hanger line.
  ([-1, 1] as const).forEach((s) => {
    // a plate the falling bow leaves over air is seated on the hanger line under it (the fore two stood 2-5 cm over it)
    for (let i = 0; i < 12; i++) {
      P.snapGroup('ztz99-fender-plate', () => P.add('hull', box(0.20, 0.032, 0.52), s * 1.755, 1.60, -3.70 + i * 0.575), { reachM: 0.06 });
    }
    // lower tub side strakes: the print's hull side wall hangs to ~0.34
    // at the sponson line while the centre belly stays at 0.46 — real
    // deep-tub side plates, laterally clear of the track lane (§B4).
    for (let i = 0; i < 9; i++) {
      P.add('hull', box(0.055, 0.26, 0.56), s * 1.035, 0.49, -3.20 + i * 0.655);
    }
    // One closed six-station shoulder now overlaps every adjoining system:
    // deck/fender at the rear, first skirt cassette at the outer belt,
    // glacis at the inner edge and the transverse mudguard at the bow. The
    // former eight-corner slab pinched diagonally and exposed daylight from
    // low oblique views; this loft is a single convex structural body.
    const shoulderPlanRight: Vec2Tuple[] = [
      [1.02, 1.36], [1.72, 1.18], [1.84, 2.70],
      [1.84, 3.48], [1.10, 3.48], [0.72, 3.32],
    ];
    // release 265 (main-reds 261: 14 front and 44 sweep strict-clip cells on every tank on this hull): the underside
    // ran straight from the 1.18 m station to the bow's 0.96-0.98 m and sat inside the track's wrap over the idler
    // (z 2.7-3.2, its top 1.16). The shoulder is now cut at x 1.12, 3.5 cm inboard of the track's inner face, into two
    // convex bodies. The inboard one keeps the published shoulder, so the side and plan silhouettes (and the
    // dimensions) stay as they were. The outboard one, over the track, stands its underside at 1.24 m over the idler's
    // station and 1.12-1.14 m at the bow, 2 cm or more clear of the wrap. The transverse guard still hangs to 0.98 m
    // ahead of it. (Raising one convex body across the width, 264's fix, cut the bow's side silhouette.)
    // Its outer faces keep the published lower edge as thin plates outside the track (the blind critics read the raised
    // half's open corner as missing geometry): the outer side face 3 cm outboard of the belt (x 1.815-1.84, 1.18 m
    // at the 2.70 station to 0.98 m at the bow) with its diagonal run aft to x 1.815, and a chamfered nose under the
    // bow face (from x 1.10, inside the inboard half, to the side plate), its underside rising from 0.98 m at the bow
    // to 1.14 m at z 3.20, about 5 cm clear of the wrap. Their tops seat 5 mm into the outboard half.
    const shoulderLowerRight = [1.46, 1.42, 1.18, 0.98, 0.98, 0.96];
    const shoulderLowerOverTrackRight = [1.46, 1.42, 1.24, 1.14, 1.14, 1.12];
    const shoulderUpperRight = [1.62, 1.60, 1.50, 1.40, 1.39, 1.14];
    const shoulderPlan = s > 0
      ? shoulderPlanRight
      : shoulderPlanRight.map(([x, z]) => [-x, z] as Vec2Tuple).reverse();
    const sided = (right: readonly number[]) => (s > 0 ? [...right] : [...right].reverse());
    const shoulderUpper = sided(shoulderUpperRight);
    // Finite welded support faces replace the concave center fan. The twelve
    // authored perimeter corners still define the shoulder, including its
    // fender/guard contacts; no invented center vertex dents either skin.
    const corners = (lower: readonly number[]) => shoulderPlan.flatMap(([x,z],i) => [
      new Vector3(x,lower[i],z),new Vector3(x,shoulderUpper[i],z),
    ]);
    // [x, z, lower, upper] on the right side, mirrored by s
    const plate = (rows: readonly (readonly [number, number, number, number])[]) => new ConvexGeometry(
      rows.flatMap(([x, z, lo, hi]) => [new Vector3(s * x, lo, z), new Vector3(s * x, hi, z)]));
    for (const shoulder of [
      convexHalfX(corners(sided(shoulderLowerRight)), s * 1.12, -s),
      convexHalfX(corners(sided(shoulderLowerOverTrackRight)), s * 1.12, s),
      plate([[1.815, 2.70, 1.18, 1.245], [1.84, 2.70, 1.18, 1.245], [1.84, 3.48, 0.98, 1.145], [1.815, 3.48, 0.98, 1.145]]),
      plate([[1.815, 2.383, 1.230, 1.2825], [1.84, 2.70, 1.18, 1.245], [1.815, 2.70, 1.18, 1.245]]),
      plate([[1.10, 3.20, 1.14, 1.18], [1.815, 3.20, 1.14, 1.18], [1.815, 3.48, 0.98, 1.145], [1.10, 3.48, 0.98, 1.145]]),
    ]) {
      const positions=shoulder.getAttribute('position'),uv:number[]=[];
      for(let i=0;i<positions.count;i++)uv.push(positions.getX(i),positions.getZ(i));
      shoulder.setAttribute('uv',new Float32BufferAttribute(uv,2));
      P.add('hull', shoulder);
    }
  });

  // ---- glacis chevron armor: three raked panel courses with real seam
  // breaks (slope motivates the mass — no tile blanket, no stair steps).
  P.visualEraCluster('ztz99a2-glacis-era', 'hull', () => {
  P.add('hull', orientedSlab(
    [-1.10, 1.64, 1.35], [1.10, 1.64, 1.35], [1.10, 1.60, 1.10], [-1.10, 1.60, 1.10],
    [-0.72, 1.10, 3.40], [0.72, 1.10, 3.40], [0.72, 1.02, 3.22], [-0.72, 1.02, 3.22]));
  for (const s of [-1, 1]) {
    // outboard corners ride ABOVE the idler shoe sweep (§B4: the first cut
    // put the panel toe at y ~1.0 inside the wrap corner — 51 band vox)
    P.add('hull', orientedSlab(
      [s * 1.10, 1.62, 1.28], [s * 1.62, 1.60, 1.02], [s * 1.62, 1.56, 0.82], [s * 1.10, 1.58, 1.06],
      [s * 0.72, 1.08, 3.34], [s * 1.20, 1.22, 2.96], [s * 1.20, 1.16, 2.80], [s * 0.72, 1.00, 3.16]));
    P.add('hullDark', box(0.045, 0.045, 1.30), s * 0.91, 1.37, 2.22, -0.25, s * 0.22, 0);
  }
  // (release 240: the crest course 3.5 cm lower, 1.1 cm over the chevron under it: the ZTZ-99A2's mantlet came down onto
  // it at -3.2 degrees ahead)
  P.add('hull', box(1.90, 0.05, 0.22), 0, 1.595, 1.18, -0.30, 0, 0);
  });
  // driver center station behind the chevron crest (release 240: 3-5.5 cm lower, under the gun's cradle, which ran
  // through its hatch and periscope heads at every pitch on the ZTZ-99A; inside the ring, under the turret at any yaw)
  P.add('hull', box(0.54, 0.05, 0.46), 0, 1.655, 0.62);
  P.add('hullDark', cylY(0.24, 0.24, 0.016, 14), 0, 1.685, 0.60);
  [-0.17, 0.17].forEach((x) => periscope(P, 'hullDetail', x, 1.665, 0.86));
  // bow lights on riser pods + tow points + routed cable
  ([-1, 1] as const).forEach((s) => {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045, rake: -0.22, seed: 9950 + s,
    }), s * 0.95, 1.13, 3.06);
    // §5.266 fix 4: dark bezels + glass lenses tone the pod faces
    for (const dx of [-0.065, 0.065]) {
      P.add('hullDark', cylZ(0.048, 0.014, 12), s * 0.95 + dx, 1.145, 3.115, -0.22, 0, 0);
      P.add('hullGlass', cylZ(0.037, 0.012, 12), s * 0.95 + dx, 1.145, 3.124, -0.22, 0, 0);
    }
    // headlight pair lifted clear of the idler shoe sweep (§B4 voxel margin)
    headlight(P, s * 1.02, 1.18, 3.14, -0.24, 0.042);
    P.add('hullDark', box(0.10, 0.12, 0.15), s * 0.72, 0.66, 3.30, -0.3, 0, 0);
    liftEye(P, 'hullDetail', s * 1.30, 1.42, 2.30);
  });
  towCable(P, [[-1.10, 1.18, 3.06], [-0.42, 1.32, 2.30], [0.48, 1.30, 2.26], [1.10, 1.18, 3.06]]);
  // Broad transverse steel guards replace the detached rubber bow flaps.
  // Their complete rear face is buried 47.5 mm into the new shoulder loft;
  // top and bottom datums exactly match its front stations, so the guard,
  // upper glacis and skirt read as one connected armored shoulder.
  ([-1, 1] as const).forEach((s) => {
    MUDGUARDS.add(P, {
      label: `ztz99a2-front-mudguard-${s < 0 ? 'left' : 'right'}`,
      x: s * 1.47, y: 1.19, z: 3.46,
      thickness: 0.055, length: 0.74, height: 0.42,
      rotation: [0, Math.PI / 2, 0], crown: 0.026,
      frontCut: 0.09, rearCut: 0.025, rake: 0.08,
    });
  });
  ruFlaps(P, { x: 1.47, w: 0.50, rear: [0.86, 0.46], rearZ: -4.02 });

  // ---- heavy side modules: four rigid forward bays with cassette blocks +
  // two rubber rear bays, outer faces on the 3.70 width datum.  §5.266
  // critic fix 1: bay bottoms raised 0.44 -> 0.62 so ~half the wheel run
  // reads side-on (the print's own proportion).
  ([-1, 1] as const).forEach((s) => {
    P.add('hull', box(0.06, 0.16, 6.60), s * 1.79, 1.48, -0.20);
    for (let i = 0; i < 6; i++) {
      const z = 2.42 - i * 1.02;
      const rigid = i < 4;
      P.add(rigid ? 'hull' : 'hullRubber',
        box(0.045, 0.78, 0.96), s * 1.828, 1.01, z);
      P.add('hullDark', box(0.05, 0.06, 0.90), s * 1.829, 1.43, z);
      if (rigid) {
        armorCassette(P, 'hull', s * 1.862, 1.04, z, 0.055, 0.54, 0.78,
          [0, 0, -s * 0.015], true);
        P.add('hullDark', box(0.020, 0.030, 0.62), s * 1.887, 1.27, z);
      }
    }
  });
  widthAnchor(P, 1.85, 1.05, 0.40);

  // ---- rear deck + transom: louvre field, service transom, twin fuel drums
  // on real angle brackets and a center rack (print band 1.5..2.1 at the
  // stern — the silhouette rows in specs carry this overhang).
  // Release 227 (CN critic round 5): the deck falls 40 mm from its -2.05 crest to -3.80, and the field drawn level at
  // the crest stood 5-17 mm over it from the second bar aft, on all three hulls this builder makes (the ZTZ-99A2, its
  // prototype and the VT-4A1). Seated, each slot plate and bar follows the deck line at its station, tilted to the
  // fall: the dark plate 2 mm proud of the deck, the bar's underside 2 mm into it.
  const deckAt = (z: number): [y: number, slope: number] => {
    let i = 1;
    while (i < ZTZ99A2_DECK.length - 1 && ZTZ99A2_DECK[i][0] < z) i++;
    const [z0, y0] = ZTZ99A2_DECK[i - 1], [z1, y1] = ZTZ99A2_DECK[i], slope = (y1 - y0) / (z1 - z0);
    return [y0 + slope * (z - z0), slope];
  };
  const louvre = (bucket: string, g: BufferGeometry, z: number, lift: number) => {
    const [y, slope] = deckAt(z);
    P.add(bucket, g, 0, y + lift, z, -Math.atan(slope), 0, 0);
  };
  Array.from({ length: 7 }, (_, index) => index).forEach((i) => {
    louvre('hullDark', box(2.50, 0.018, 0.075), -2.10 - i * 0.24, 0.002 - 0.009);
    // release 240: 16 mm proud (was 26), under the turrets' sweep; release 264 (main-reds 261): 18 mm deep at 7 mm, so its
    // underside sits 2 mm into the deck (it sat 4 mm in) with the same 16 mm proud top
    louvre('hullDetail', box(2.50, 0.018, 0.026), -2.22 - i * 0.24, 0.007);
  });
  // release 240: the two filler caps lie on the deck line (4 mm into it, 1 cm proud), under the turrets' sweep
  ([[-0.85, -1.75], [0.72, -1.88]] as const).forEach(([x, z]) => {
    P.add('hullDetail', cylY(0.095, 0.095, 0.014, 10), x, deckAt(z)[0] + 0.003, z);
  });
  P.add('hull', box(3.26, 0.94, 0.12), 0, 1.06, -3.99);
  P.add('hullDark', box(2.20, 0.50, 0.035), 0, 1.12, -4.055);
  Array.from({ length: 8 }, (_, index) => index).forEach((i) => {
    P.add('hullDetail', box(0.035, 0.44, 0.042), -1.00 + i * 0.286, 1.12, -4.07);
  });
  ([-1, 1] as const).forEach((s) => {
    // Single-ended drum stock with hollow end hoops, straps and twin angle
    // brackets into the transom. Closed cap overlays previously duplicated
    // the body's x=centre±.40 planes and visibly fought over those pixels.
    // (print band: y 1.5..2.1 hanging aft — the isolated aft-stretch A/B
    // measured +0.4 on the whole gate; the short-whip change in the same
    // batch was the regression and is reverted separately)
    addChineseFuelDrum(P,s*.76,1.79,-4.56,.32,.80);
    for (const dx of [-0.24, 0.24]) {
      P.add('hullDark', box(0.05, 0.68, 0.05), s * (0.76 + dx), 1.77, -4.56);
      P.add('hullDark', box(0.05, 0.10, 0.46), s * (0.76 + dx), 1.52, -4.28, 0.22, 0, 0);
    }
    P.add('hullDark', box(0.12, 0.06, 0.05), s * 1.02, 1.30, -4.06);
    P.add('hullDetail', torus(0.10, 0.021, 12), s * 0.55, 0.92, -4.06, Math.PI / 2, 0, 0);
  });
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.34, h: 0.22, fill: 0.34, rails: 2, seed: 9955,
  }), 0, 1.88, -4.30);

  // These bridge plates close the paired stern service-deck wells. They are
  // hull structure and must travel with the hull when another vehicle uses
  // this exact chassis, rather than being coupled to the A2 turret package.
  ([-1, 1] as const).forEach((side) => {
    P.add('hull', box(0.30, 0.025, 0.42), side * 0.81, 1.38, -4.20);
  });
  P.hullG.userData.ztz99a2HullIntegrationReceipt = Object.freeze({
    architecture: 'ztz99a2-production-chassis-r3',
    shoulderVolumes: 2,
    shoulderStationsPerSide: 6,
    shoulderFrontZM: 3.48,
    frontMudguards: 2,
    frontMudguardsAttachedToShoulders: true,
    frontMudguardShoulderOverlapM: 0.0475,
    floatingBowStiffenersRemoved: true,
    shoulderSkirtJoinGapM: 0,
    endWheelLiftM: 0.10,
    idlerYM: 0.74,
    rearSprocketYM: 0.78,
  });
}

function buildZTZ99A2PrototypeTurret(P: ChinaBuilderPort): void {
  const { box, cylY, torus, periscope, liftEye } = KIT;
  const seg = P.q ? 20 : 14;
  P.gunG.position.set(0, .39, .75);

  // ---- WELDED WEDGE TURRET: one connected shell with the A2's DEEP cheek
  // rake (nose base +1.45 world raking to the +0.66 crown lip), near-vertical
  // side belt, flat 2.45 roof and a long integral bustle.
  P.turretG.position.set(0, 1.56, -0.15);
  // §5.266 critic fix 3: the plan nose broadened toward the print's ~1.0 m
  // arrow chord (was a ~0.6 m pinch).
  const plan99: Vec2Tuple[] = [
    [0.44, 1.58], [1.02, 0.95], [1.46, 0.12], [1.54, -0.60], [1.38, -1.55],
    [0.62, -1.72], [-0.62, -1.72], [-1.38, -1.55], [-1.54, -0.60],
    [-1.46, 0.12], [-1.02, 0.95], [-0.44, 1.58],
  ];
  const inset99 = [0.52, 0.56, 0.80, 0.82, 0.88, 0.92, 0.92, 0.88, 0.82, 0.80, 0.56, 0.52];
  const crown99 = 0.89;
  addChineseThroatStock(P, KIT.polyMultiLoft(plan99, [
    // release 240: the bustle's underside rises aft, as the production A2's does, to clear the engine deck's louvres as
    // the turret traverses (it ran flat at 0.03, under the deck)
    { height: [0.03, 0.03, 0.03, 0.03, 0.24, 0.24, 0.24, 0.24, 0.03, 0.03, 0.03, 0.03], inset: 1.0 },
    { height: 0.34, inset: 1.0 },
    { height: crown99, inset: inset99, centerHeight: 0.89 },
  ]));
  crownRimTrim(P, plan99, inset99, crown99);
  // the race ring (y -.095) reaches 5 mm into the shell's floor at y .03; it stopped 15 mm short of it
  P.add('turret', cylY(1.10, 1.16, 0.13, seg), 0, -0.03, -0.30);
  // Turret-side service modules are socketed into the shell rather than
  // hovering beyond it. Their inner faces cross the belt envelope, while the
  // rails and weld strips sit fractionally proud of the installed cassettes.
  for (const s of [-1, 1]) {
    for (const y of [0.14, 0.42]) {
      P.add('turretDetail', box(0.034, 0.030, 1.64), s * 1.585, y, -0.72, 0, -s * 0.04, 0);
    }
    for (const z of [-0.02, -0.70, -1.34]) {
      P.add('turretDetail', box(0.036, 0.36, 0.036), s * 1.580, 0.28, z, 0, -s * 0.04, 0);
    }
    P.add('turretDark', box(0.22, 0.40, 0.76), s * 1.49, 0.30, -0.30, 0, -s * 0.04, 0);
    P.add('turretDark', box(0.20, 0.36, 0.56), s * 1.47, 0.28, -1.22, 0, -s * 0.04, 0);
    P.add('turret', box(0.24, 0.34, 0.68), s * 1.49, 0.30, 0.39, 0, -s * 0.10, 0);
    P.add('turretDetail', box(0.23, 0.035, 0.64), s * 1.50, 0.505, -0.30, 0, -s * 0.04, 0);
    P.add('turretDark', box(0.065, 0.05, 0.58), s * 1.555, 0.14, 0.39, 0, -s * 0.10, 0);
  }
  // deep add-on cheek cassettes following the wedge rake (the A2 tell):
  // two courses per side, seam battens between, gun channel kept open.
  // Permanent shaped backing survives ERA loss; the new wide, shallow
  // arrow cassettes wrap both rakes rather than becoming a second turret.
  const prototypeChevron:readonly ChevronStation[]=[
    {x:.34,upperX:.26,ridgeX:.34,lowerX:.34,upperY:.62,upperZ:.94,ridgeY:.29,ridgeZ:1.68,lowerY:.06,lowerZ:1.52},
    {x:.94,upperX:.68,ridgeX:.94,lowerX:.94,upperY:.60,upperZ:.56,ridgeY:.29,ridgeZ:1.07,lowerY:.06,lowerZ:.90},
    {x:1.55,upperX:1.14,ridgeX:1.55,lowerX:1.55,upperY:.62,upperZ:.10,ridgeY:.30,ridgeZ:.31,lowerY:.08,lowerZ:.16},
  ];
  for(const side of [-1,1] as const){
    addChineseThroatStock(P,closedIntegratedChevron(prototypeChevron,side));
    P.visualEraCluster('ztz99a2-cheek-era','turret',()=>{
      for(const [a,b] of [[.44,.69],[.72,.99],[1.02,1.26],[1.29,1.47]])
        addChineseThroatStock(P,chineseArrowCassette(prototypeChevron,side,a,b),'turretExternalArmor');
    });
  }
  // nose beak walls flanking the OPEN gun channel: the print's wedge line
  // keeps falling 2.5 -> 2.06 out to +1.7 world — two raked prisms continue
  // the cheek slope past the crown lip; the channel stays clear through the
  // full elevation arc (§B3.1).  §5.266 fix 3: chord widened with the plan
  // nose (walls now span x 0.20..0.56 per side — the broad-arrow read).
  // addChineseThroatStock keeps only |x| > .40 of them ahead of the channel; the dark seam bar each carried at x .34
  // was left 45 mm off any stock inside the moving mantlet (half width .377) and is gone (release 227, CN critic 5).
  for (const s of [-1, 1]) {
    addChineseThroatStock(P, orientedSlab(
      [s * 0.20, 0.30, 1.60], [s * 0.56, 0.32, 1.42], [s * 0.50, 0.40, 0.98], [s * 0.18, 0.38, 1.10],
      [s * 0.20, 0.50, 1.68], [s * 0.56, 0.52, 1.50], [s * 0.44, 0.84, 0.84], [s * 0.16, 0.82, 0.92]));
  }
  // Owner markup 2026-10-14 ("actual tank equipment ... in lieu of random thingies"): the two dark 3 cm bars laid along
  // the belt shoulder and the cheek corner as "weld beads" read as loose sticks on the armour and are gone; the belt's
  // own crease and the cheek cassettes carry that line.

  // ---- roof suite (print layout): forward-LEFT panoramic head, recessed
  // gunner box right of the gun channel, commander cupola + W-85 right,
  // rear-right mast cluster, LWR pair on the cheek lips.
  P.add('turret', box(0.36, 0.09, 0.32), -0.55, 0.935, 0.30);
  P.add('turretDetail', cylY(0.095, 0.105, 0.14, 12), -0.55, 1.05, 0.30);
  P.add('turret', box(0.28, 0.20, 0.24), -0.55, 1.22, 0.30);
  P.add('turretDark', box(0.20, 0.11, 0.030), -0.55, 1.24, 0.435);
  P.add('turretGlass', box(0.14, 0.075, 0.018), -0.55, 1.24, 0.452);
  P.add('turret', box(0.46, 0.15, 0.42), 0.44, 0.945, 0.40);
  P.add('turret', box(0.38, 0.14, 0.34), 0.44, 1.06, 0.36);
  P.add('turretDark', box(0.28, 0.085, 0.032), 0.44, 1.07, 0.545);
  P.add('turretGlass', box(0.20, 0.06, 0.018), 0.44, 1.07, 0.563);
  P.add('turretDetail', box(0.42, 0.030, 0.38), 0.44, 1.145, 0.36);
  P.add('turret', cylY(0.27, 0.29, 0.075, seg), 0.52, 0.9275, -0.83);
  P.add('turretDark', torus(0.275, 0.014, seg), 0.52, 0.97, -0.83);
  periscope(P, 'turretDetail', 0.30, 0.955, -0.83);
  // the W-85 cluster sits over the print's own rear-right 2.9-class roof
  // band, sharing columns with the mast station behind it
  // 2026-10-08 (round 5, the coordinator: the right gun per nation): the QJC-88 (the W85's vehicle form) at true scale.
  // Release 227 (CN critic round 5): the station's foot stood 35 mm over the cupola's top (y .965); it now stands 2 mm
  // into it.
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'qjc88', scale: 1.0, tone: 'two-tone', elev: 0.12,
    ammo: true, rotation: [0, 0.10, 0], seed: 9960, working: true, ridingCradle: true, // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station
  }), 0.52, 0.9275 + 0.075 / 2 - 0.002, -0.79);
  P.add('turret', cylY(0.24, 0.25, 0.045, seg), -0.50, 0.9125, -0.55);
  P.add('turretDark', torus(0.245, 0.013, seg), -0.50, 0.935, -0.55);
  // rear-right mast: planted base, tube, compact head (print's 2.99 cluster)
  P.add('turret', box(0.20, 0.10, 0.20), 0.60, 0.94, -1.15);
  P.add('turretDetail', cylY(0.026, 0.034, 0.38, 10), 0.60, 1.16, -1.15);
  P.add('turretDark', box(0.16, 0.07, 0.09), 0.60, 1.38, -1.15);
  // laser-warning boxes on the cheek lips
  for (const s of [-1, 1]) {
    P.add('turret', box(0.18, 0.08, 0.16), s * 0.98, 0.945, 0.14);
    P.add('turretGlass', box(0.11, 0.055, 0.020), s * 0.98, 0.95, 0.225);
  }
  for (const [x, z, r] of [
    [0.20, 0.30, 0.32], [-0.24, -0.12, -0.30], [0.80, -0.20, 0.14],
  ]) periscope(P, 'turretDetail', x, 0.915, z, r);

  // ---- integral bustle basket: a rear-facing open rack plus two seated
  // side panniers.  The old rack sat on the TOP rail and faced into the
  // turret, leaving the full rear/side basket volume visibly empty.  This
  // rack starts on the lower cradle, opens aft and carries soft stowage from
  // floor to crown; the panniers overlap the bustle shell at their forward
  // ends and remain inside the side-return rails (§B2 / §B5).
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.038, 0.038, 0.86), s * 1.29, 0.80, -2.02, 0, s * 0.10, 0);
    P.add('turretDetail', box(0.038, 0.038, 0.86), s * 1.29, 0.22, -2.02, 0, s * 0.10, 0);
    P.add('turretDetail', box(0.038, 0.56, 0.038), s * 1.335, 0.51, -1.60);

    for (const [z, y, h] of [[-2.20, 0.43, 0.34], [-1.84, 0.48, 0.42]]) {
      P.addEquipment('turret', box(0.16, h, 0.31), s * 1.20, y, z);
      P.add('turretDark', box(0.18, h * 1.02, 0.026), s * 1.20, y, z - 0.16);
    }
    P.add('turretDark', box(0.18, 0.040, 0.76), s * 1.20, 0.72, -2.02);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.60, d: 0.60, h: 0.58, posts: 9,
    fill: 0.92, rails: 3, mesh: false, rotation: [0, Math.PI, 0], seed: 9965,
  }), 0, 0.22, -2.24);
  addZTZ99A2RearServiceComplex(P);

  // smoke banks: staggered 5-tube rows on the cheek flanks
  addSmokeBanks(P, 1.38, 0.50, 0.40, 5, 9968);
  // rear whips on planted collars (a short-whip variant was built to chase
  // mask registration and REVERTED: whole 88.3 -> 87.5/87.1 — receipts in
  // the round packet)
  P.add('turretDetail', cylY(0.036, 0.046, 0.060, 10), -1.02, 0.90, -1.42);
  mount(P, 'turret', FITTINGS.antennaWhip({
    mats: P.mats, h: 0.65, r: 0.012, rake: -0.05, seed: 9971,
  }), -1.02, 0.93, -1.42);
  // 2026-10-19 (owner float sweep): the right whip and its pedestal stood 60-78 mm off the turret and the side grab
  // rails 38-50 mm outboard of it; each is seated on it
  P.snapGroup('ztz99a-right-whip', () => {
    P.add('turretDetail', cylY(0.032, 0.042, 0.055, 10), 1.10, 0.88, -1.55);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: 0.55, r: 0.011, rake: 0.05, seed: 9972,
    }), 1.10, 0.91, -1.55);
  }, { reachM: 0.08 });
  for (const s of [-1, 1]) {
    liftEye(P, 'turretDetail', s * 0.95, 0.90, -0.90);
    P.snapGroup('ztz99a-grab-rail', () => P.add('turretDetail', box(0.026, 0.026, 0.88), s * 1.44, 0.66, -0.75, 0, -s * 0.06, 0), { reachM: 0.06 });
  }

  // ---- ZPT-98 plant: axis 1.95 world, annular root collar in the open
  // wedge channel, evacuator at the print's band, muzzle +7.02 world = the
  // print's own tube (whole-registration counterweight; published 11.0
  // stays the spec/UI overall datum).
  P.gunG.position.set(0, 0.39, 0.75);
  addChineseMovingMantlet(P, .45, .96);
  tubeGun(P, [
    [0.75, 1.60, 0.104], [1.60, 3.05, 0.090], [3.05, 3.75, 0.118],
    [3.75, 5.90, 0.086], [5.90, 6.42, 0.091],
  ], { rings: [[1.60, 0.108], [3.05, 0.121], [3.75, 0.121], [5.90, 0.094], [6.27, 0.094]], muzzle: 6.42 });
  muzzleBore(P, { r: 0.088 }); // §B3.1

  // §5.266 critic fix 2: the numerals sat half-behind the side service
  // modules — re-seated into the inter-module gap (world z ~ -0.96, the
  // recessed wall column between the two cassettes).  Authored just OUTSIDE
  // the widened belt wall (x 1.567 at this station) so the marking ray
  // seats on the visible face; the authored cheek star preempts the
  // auto-anchor insignia that the widened modules would half-clip.
  P.decal('turret', 'star', null, 0.24, [-1.30, 0.52, 0.42], -Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [1.60, 0.30, -0.81], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [-1.60, 0.30, -0.81], -Math.PI / 2);
  P.turretG.userData.ztz99a2TurretIntegrationReceipt = Object.freeze({
    selectedArmorAttached: true,
    compactedShoulderOuterXM: 1.54,
    serviceModuleCenterXM: 1.49,
    serviceModuleInnerFaceXM: 1.37,
    embeddedWeldCenterYM: 0.34,
    mirroredServiceModules: true,
  });
  P.topY = 1.30;
}

/** Options for reusing the production ZTZ-99A2 turret on another hull: a
 * vehicle with its own fitted remote station omits the commander's QJC-88 (one
 * working roof gun, never a duplicate), and one with its own marking seats
 * omits the 99A2's painted star and number. */

/** Splits, in place, every triangle of a non-indexed geometry that crosses the plane z = z0 (all attributes
 * interpolated), so a piecewise map in z moves no point of the surface on its unmoved side. An edge shared by two
 * triangles is cut at the identical point (each edge is interpolated from its lower-z end), so no crack opens. */
function splitTrianglesAtZ(g: BufferGeometry, z0: number): void {
  if (g.index) throw new Error('splitTrianglesAtZ: non-indexed geometry only');
  const names = Object.keys(g.attributes), pos = g.getAttribute('position');
  const sizes = names.map((n) => g.getAttribute(n).itemSize), out: number[][] = names.map(() => []);
  const vertex = (i: number): number[][] => names.map((n) => Array.from({ length: g.getAttribute(n).itemSize }, (_, k) => g.getAttribute(n).getComponent(i, k)));
  const lower = (a: number[][], b: number[][]): boolean => a[0][2] < b[0][2] || (a[0][2] === b[0][2] && (a[0][0] < b[0][0] || (a[0][0] === b[0][0] && a[0][1] < b[0][1])));
  const cutEdge = (a: number[][], b: number[][]): number[][] => {
    const [u, v] = lower(a, b) ? [a, b] : [b, a], t = (z0 - u[0][2]) / (v[0][2] - u[0][2]);
    return u.map((attr, n) => attr.map((c, k) => (n === 0 && k === 2 ? z0 : c + (v[n][k] - c) * t)));
  };
  const emit = (...tri: number[][][]): void => { for (const v of tri) v.forEach((attr, n) => out[n].push(...attr)); };
  // release 227 round 4 (critic CN3-D2: per-vertex arrays for every triangle of the shell): a triangle that does not
  // cross the plane is copied component by component, and a shell no triangle of which crosses is left as it is
  const crosses = (i: number): boolean => {
    const a = Math.sign(pos.getZ(i) - z0), b = Math.sign(pos.getZ(i + 1) - z0), c = Math.sign(pos.getZ(i + 2) - z0);
    return (a === 1 || b === 1 || c === 1) && (a === -1 || b === -1 || c === -1);
  };
  let any = false;
  for (let i = 0; i < pos.count && !any; i += 3) any = crosses(i);
  if (!any) return;
  const attrs = names.map((n) => g.getAttribute(n));
  let changed = false;
  for (let i = 0; i < pos.count; i += 3) {
    if (!crosses(i)) {
      for (let n = 0; n < attrs.length; n++) { const a = attrs[n], o = out[n]; for (let j = i; j < i + 3; j++) for (let k = 0; k < sizes[n]; k++) o.push(a.getComponent(j, k)); }
      continue;
    }
    const V = [vertex(i), vertex(i + 1), vertex(i + 2)], side = V.map((v) => Math.sign(v[0][2] - z0));
    changed = true;
    const on = side.indexOf(0);
    if (on >= 0) {
      const a = V[on], b = V[(on + 1) % 3], c = V[(on + 2) % 3], bc = cutEdge(b, c);
      emit(a, b, bc, a, bc, c);
    } else {
      const k = side.findIndex((s) => side.filter((t) => t === s).length === 1);
      const a = V[k], b = V[(k + 1) % 3], c = V[(k + 2) % 3], ab = cutEdge(a, b), ac = cutEdge(a, c);
      emit(a, ab, ac, ab, b, c, ab, c, ac);
    }
  }
  if (!changed) return;
  names.forEach((n, i) => g.setAttribute(n, new Float32BufferAttribute(out[i], sizes[i])));
}

export interface ZTZ99A2TurretOptions {
  roofGun?: boolean;
  decals?: boolean;
  /** Turret-local plan seats of the two whip antennas (default: the 99A2's own pair at x ±1.06, z -1.58). A reusing
   * vehicle whose remote station sweeps the right-rear roof moves that whip clear of the sweep. */
  antennaSeats?: readonly (readonly [x: number, z: number])[];
  /** Release 227 (owner 2026-10-16: "make the qilin turret 10% shorter"): metres cut out of the bustle band
   * (donorBustleCut.ts): every authored z of the shell plan and of each part maps through bustleCutZ, so the parts move
   * and keep their size (a rail running the band keeps both ends), the rear armour assembly translates as one piece,
   * and nothing ahead of the band (chevrons, face ERA, smoke banks, cupola, sights, mantlet, gun) moves. Default 0. */
  bustleCutM?: number;
  /** false leaves out the rear flank fit (the rear side cassette, the rear stowage box, the dark side strip and the two
   * rail stanchions aft of the band's front) for a reusing vehicle that fits its own rear flank housings there. */
  rearFlank?: boolean;
  /** Release 227 (CN track): the ring collar's centre z (turret-local) and its skirt's radius for a reusing hull. The
   * fleet 99A2's collar (cylY 1.08/1.14) stands 0.12 m behind the turret's pivot, so on a reusing hull it orbits the
   * axis as the turret turns and its 1.14 m skirt sweeps past a narrower hull's deck edge and fenders; { z: 0, radiusM }
   * centres it on the pivot (the collar turns in place) with its skirt at radiusM and its top 0.02 m inside that.
   * Default: the 99A2's own collar. */
  ringCollar?: { readonly z: number; readonly radiusM: number };
}

/** The production 99A2's smoke banks (turret frame): each bank's mount (x mirrored a side), and its launcher base: the
 * face the tubes stand in `sink` along them from their rear ends, `depth` deep, reaching `end` past the end tubes' walls
 * and `top` over the tubes' upper rims, its underside `seat` into the roof. */
const ZTZ99A2_SMOKE_BANK = { x: 1.34, y: 0.88, z: 0.025, sink: 0.025, depth: 0.085, end: 0.015, top: 0.012, seat: 0.005 } as const;

/** Release 227 (the fleet ZTZ-99A2 lead, after the CN lane's visual critic on the Qilin, which carries this turret): the
 * two five-tube banks stood at (+-1.33, 0.48, 0.25) with most of each 0.30 m tube and the fitting's own bracket buried in
 * the chevron's outer upper facet and its face cassettes (the three inboard tubes' axes entered the facet 96-100 mm behind
 * their mouths, the outer two a cassette and the side wall 26-27 mm behind theirs), rising out of the armour with nothing
 * under them. Moved as one with every tube's direction kept (the five launch sockets and their fan), no seat on the
 * wedge's corner clears the tubes without standing on the face cassettes (which detonate and would leave it hanging), so
 * each bank stands on the roof edge just behind the chevron's upper root, firing out over the wedge's outer corner as
 * roof banks do: the same fitting without its own bracket, its tubes standing in a cast launcher base. The base's front
 * face is square to the fan's mean axis (its middle tube's, near enough), 25 mm along the tubes from their rear ends (every tube sunk in it, the fan's
 * outer rims too); it reaches 15 mm past the end tubes' walls, 12 mm over their upper rims and 60 mm behind their rear
 * ends, and its underside meets the shell's roof under its four corners 5 mm in (the bank's outer end stands over the
 * roof's falling shoulder, its underside at least 30 mm over the face cassettes the shell covers there; 15 mm further
 * outboard the left base's outer corner, over the fuller left shoulder, met an exposed cassette). Measured on the built
 * turret, every tube clears the shell, the chevrons, their cassettes, the rail and the roof equipment by at least 15 mm
 * along its whole length outside the base. */
function addZTZ99A2SmokeBanks(P: ChinaBuilderPort): void {
  const B = ZTZ99A2_SMOKE_BANK, r = 0.043, len = 0.30;
  // the shell's own roof (the permanent 'turret' bucket: never a cassette), straight down at a plan point
  const material = new MeshBasicMaterial({ side: DoubleSide }), roof: Mesh[] = [];
  P.forEachBucketPart('turret', (g) => { const m = new Mesh(g, material); m.updateMatrixWorld(true); roof.push(m); });
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 8);
  const roofY = (x: number, z: number): number => {
    ray.ray.origin.set(x, 4, z);
    const hit = ray.intersectObjects(roof, false)[0];
    if (!hit) throw new Error(`${P.spec.id}: no turret roof under the smoke bank's base at ${x.toFixed(3)}, ${z.toFixed(3)}`);
    return hit.point.y;
  };
  try {
    for (const side of [-1, 1]) {
      const bank = FITTINGS.smokeBank({
        mats: P.mats, count: 5, r, len, splay: side * 1.02,
        pitch: -0.44, arc: 0.58, spacing: 0.10, slot: 'detail', base: false,
        rotation: [0, 0, -side * 0.12], seed: 9996 + (side > 0 ? 1 : 0),
      });
      mount(P, 'turret', bank, side * B.x, B.y, B.z);
      // the tubes' rear ends and axes in the turret frame, from the fitting's own launch sockets
      bank.updateMatrix();
      const rears: Vector3[] = [], axis = new Vector3();
      for (const part of bank.children) {
        part.updateMatrix();
        const m = bank.matrix.clone().multiply(part.matrix);
        for (const s of smokeSocketsFor(part)) {
          const d = new Vector3(...s.direction).transformDirection(m);
          rears.push(new Vector3(...s.position).applyMatrix4(m).addScaledVector(d, -len));
          axis.add(d);
        }
      }
      if (rears.length !== 5) throw new Error(`${P.spec.id}: the smoke bank registers ${rears.length} launch sockets`);
      // the base's frame: along the fan's mean axis, across the bank (level), and up square to both
      const a = axis.normalize(), w = a.clone().cross(new Vector3(0, 1, 0)).normalize(), n = w.clone().cross(a).normalize();
      if (n.y < 0) n.negate();
      const along = rears.map((p) => p.dot(a)), across = rears.map((p) => p.dot(w)), up = rears.map((p) => p.dot(n));
      const front = Math.max(...along) + B.sink, back = front - B.depth, top = Math.max(...up) + r + B.top;
      const ends = [Math.min(...across) - r - B.end, Math.max(...across) + r + B.end];
      const corner = (s: number, e: number): Vector3 => a.clone().multiplyScalar(s).addScaledVector(w, e).addScaledVector(n, top);
      // each bottom corner straight under its top corner (along -n), `seat` into the roof under it
      const seat = (p: Vector3): Vector3 => {
        let q = p.clone();
        for (let i = 0; i < 4; i++) q = p.clone().addScaledVector(n, -(p.y - (roofY(q.x, q.z) - B.seat)) / n.y);
        return q;
      };
      const tops = [corner(front, ends[0]), corner(front, ends[1]), corner(back, ends[1]), corner(back, ends[0])];
      P.add('turretDetail', orientedSlab(...tops.map(seat).map((p) => p.toArray()), ...tops.map((p) => p.toArray())));
    }
  } finally { material.dispose(); }
}

/** The production ZTZ-99A2 turret in its own turret frame. It places P.turretG
 * at the 99A2 hull's ring; a reusing caller moves the group onto its own ring. */
function buildZTZ99A2ProductionTurret(P: ChinaBuilderPort, options: ZTZ99A2TurretOptions = {}): void {
  const { box, cylY, torus, periscope, liftEye } = KIT;
  const seg = P.q ? 20 : 14;
  P.gunG.position.set(0, .38, .78);
  const bustleExtensionM = 0.50;
  const bustleUndersideRiseM = 0.42;

  // Production 99A2: a low, broad arrow turret authored in its own station
  // frame. The rear station is exactly 0.50 m aft of the prototype's
  // -1.72 m shell datum, while the lower ring climbs exactly 0.42 m from
  // the forward belt to keep the bustle clear of the engine deck.
  P.turretG.position.set(0, 1.56, 0.12);
  const cut = options.bustleCutM ?? 0;
  // The identity when nothing is cut (the fleet 99A2 stays byte-identical).
  const bz = (z: number): number => (cut > 0 ? bustleCutZ(z, cut) : z);
  const rearFlank = options.rearFlank !== false;
  const plan: Vec2Tuple[] = [
    // Stop the primary shell behind the ridge. The closed chevrons below
    // own the complete frontal projection, matching the VT-4A1 hierarchy.
    [0.30, 0.62], [0.82, 0.52], [1.40, 0.28], [1.56, -0.30],
    [1.50, -1.50], [1.18, -2.22], [0.82, -2.22],
    [-0.82, -2.22], [-1.18, -2.22], [-1.50, -1.50],
    [-1.56, -0.30], [-1.40, 0.48], [-0.82, 1.15], [-0.30, 1.43],
  ];
  const lower = [0.02, 0.02, 0.03, 0.05, 0.18, 0.44, 0.44,
    0.44, 0.44, 0.18, 0.05, 0.03, 0.02, 0.02];
  const belt = [0.32, 0.32, 0.34, 0.36, 0.43, 0.49, 0.49,
    0.49, 0.49, 0.43, 0.36, 0.34, 0.32, 0.32];
  const crown = [0.76, 0.76, 0.79, 0.82, 0.82, 0.80, 0.80,
    0.80, 0.80, 0.82, 0.82, 0.79, 0.76, 0.76];
  const crownInset = [0.63, 0.66, 0.80, 0.87, 0.90, 0.93, 0.94,
    0.94, 0.93, 0.90, 0.87, 0.80, 0.66, 0.63];
  const shell = KIT.polyMultiLoft(plan, [
    { height: lower, inset: 1 },
    { height: belt, inset: 1 },
    { height: crown, inset: crownInset, centerHeight: 0.80 },
  ]);
  if (cut > 0) {
    // The loft's crown ring is inset towards the plan's centroid, so cutting the plan itself would pull the front
    // crown edge forward with the moved centroid: the shell is lofted on its own plan and every vertex then maps
    // through the cut (vertices ahead of the band stay exactly where they are). The loft's triangles that cross the
    // band's two ends are first split there, so the cut is exact on every piece and no point of the surface ahead of the
    // band moves (the gun throat's clip planes then cut it where they cut the fleet shell).
    splitTrianglesAtZ(shell, ZTZ99A2_BUSTLE_CUT_FRONT_Z);
    splitTrianglesAtZ(shell, ZTZ99A2_BUSTLE_CUT_REAR_Z);
    const position = shell.getAttribute('position');
    for (let i = 0; i < position.count; i++) position.setZ(i, bz(position.getZ(i)));
    position.needsUpdate = true;
    shell.computeVertexNormals();
  }
  addChineseThroatStock(P, shell);
  if (options.ringCollar) P.add('turret', cylY(options.ringCollar.radiusM - .02, options.ringCollar.radiusM, 0.10, seg), 0, -0.03, options.ringCollar.z);
  else P.add('turret', cylY(1.08, 1.14, 0.10, seg), 0, -0.03, -0.12);

  // Leopard-class chevrons are the production shell's primary frontal
  // armor. This is the same watertight upper/ridge/lower construction used
  // by VT-4A1, resized to the independent A2 shell and given four raised
  // face cassettes per side. Their roots now run from the turret roof course
  // to the chin course, instead of compressing the arrow into a shallow band.
  // The ridge still sits 1.10 m ahead of the shell nose.
  const chevronStations = Object.freeze([
    { x: 0.22, upperX: 0.22, ridgeX: 0.22, lowerX: 0.22,
      upperY: 0.83, upperZ: 0.58, ridgeY: 0.39, ridgeZ: 1.72, lowerY: -0.04, lowerZ: 0.86 },
    { x: 0.38, upperX: 0.34, ridgeX: 0.38, lowerX: 0.40,
      upperY: 0.83, upperZ: 0.50, ridgeY: 0.38, ridgeZ: 1.66, lowerY: -0.04, lowerZ: 0.82 },
    { x: 0.82, upperX: 0.62, ridgeX: 0.82, lowerX: 0.78,
      upperY: 0.81, upperZ: 0.18, ridgeY: 0.36, ridgeZ: 1.42, lowerY: -0.02, lowerZ: 0.70 },
    { x: 1.18, upperX: 0.86, ridgeX: 1.18, lowerX: 1.18,
      upperY: 0.79, upperZ: -0.08, ridgeY: 0.34, ridgeZ: 1.16, lowerY: 0.00, lowerZ: 0.46 },
    { x: 1.48, upperX: 1.04, ridgeX: 1.48, lowerX: 1.54,
      upperY: 0.76, upperZ: -0.36, ridgeY: 0.31, ridgeZ: 0.88, lowerY: 0.03, lowerZ: 0.18 },
    { x: 1.62, upperX: 1.46, ridgeX: 1.62, lowerX: 1.56,
      upperY: 0.72, upperZ: -0.50, ridgeY: 0.29, ridgeZ: 0.66, lowerY: 0.05, lowerZ: -0.18 },
  ] satisfies readonly ChevronStation[]);
  const chevronPanelBands = Object.freeze([
    [0.055, 0.270], [0.300, 0.505], [0.535, 0.755], [0.785, 0.955],
  ] as const);
  // The closed arrow is permanent turret structure. Only the four raised
  // face cassettes per side are ERA and may disappear after detonation.
  for (const s of [-1, 1] as const) {
    addChineseThroatStock(P, closedIntegratedChevron(chevronStations, s));
    P.add('turretDark', box(0.034, 0.46, 0.034), s * 0.84, 0.35, 1.06, -0.45, s * 0.70, 0);
  }
  P.visualEraCluster('ztz99a2-production-chevron-era', 'turret', () => {
    for (const s of [-1, 1] as const) {
      for (const [startT, endT] of chevronPanelBands) {
        const startX = chevronStations[0].x
          + (chevronStations.at(-1)!.x - chevronStations[0].x) * startT;
        const endX = chevronStations[0].x
          + (chevronStations.at(-1)!.x - chevronStations[0].x) * endT;
        addChineseThroatStock(P, chineseArrowCassette(chevronStations,s,startX,endX), 'turretExternalArmor');
      }
    }
  });

  // Side cassette and bustle-box grammar comes directly from the production
  // ZTZ photographs: deep rectangular armor flanks, compact smoke banks and
  // a continuous aft service volume seated on the rising shell.
  // The rail runs the bustle band: both its ends map (-2.10 .. -0.12), so it stays attached at both stanchions.
  const railRear = bz(-2.10), railFront = -0.12;
  const railLength = cut > 0 ? railFront - railRear : 1.98, railZ = cut > 0 ? (railFront + railRear) / 2 : -1.11;
  for (const s of [-1, 1]) {
    P.addExternalArmor('turret', box(0.18, 0.48, 0.82), s * 1.50, 0.36, -0.52, 0, -s * 0.04, 0);
    if (rearFlank) {
      P.addExternalArmor('turret', box(0.20, 0.44, 0.84), s * 1.42, 0.43, bz(-1.36), 0, -s * 0.08, 0);
      P.addEquipment('turret', box(0.18, 0.30, 0.58), s * 1.30, 0.56, bz(-1.93), 0, -s * 0.08, 0);
      P.add('turretDark', box(0.032, 0.36, 1.52), s * 1.595, 0.39, bz(-0.82), 0, -s * 0.04, 0);
    }
    P.add('turretDetail', box(0.035, 0.035, railLength), s * 1.49, 0.76, railZ, 0, -s * 0.05, 0);
    for (const z of [-0.16, -0.82, -1.48, -2.06]) {
      if (!rearFlank && z < -1.27) continue;
      // release 227, round 3 (critic D8): each stanchion stands under the rail's yawed line. Release 229 (fleet follow-up):
      // the uncut fleet turret too, where x 1.50 throughout left the front one 23 mm beside the rail and the rear one 3 mm
      const x = 1.49 - Math.sin(0.05) * (bz(z) - railZ) / Math.cos(0.05);
      P.add('turretDetail', box(0.034, 0.40, 0.034), s * x, 0.55, bz(z), 0, -s * 0.05, 0);
    }
    liftEye(P, 'turretDetail', s * 0.98, 0.82, -1.18);
  }
  P.addExternalArmor('turret', box(2.22, 0.36, 0.16), 0, 0.62, bz(-2.17), -0.10, 0, 0);
  // (release 227, round 3, critic Q2: on a cut bustle, where the dark flank slabs are gone, the rear box's backing strip
  // behind its ribs takes the turret's paint instead of reading as a flat grey placeholder panel)
  P.add(cut > 0 ? 'turretDetail' : 'turretDark', box(2.02, 0.18, 0.035), 0, 0.57, bz(-2.27), -0.10, 0, 0);
  for (let i = 0; i < 7; i++) {
    P.add('turretDetail', box(0.030, 0.30, 0.038), -0.90 + i * 0.30, 0.62, bz(-2.30), -0.10, 0, 0);
  }

  // Compact production roof suite: commander weapon right, stabilized sight
  // left, gunner window by the throat, and low laser-warning heads.
  P.addEquipment('turret', box(0.42, 0.08, 0.38), -0.52, 0.83, -0.48);
  P.add('turretDetail', cylY(0.14, 0.17, 0.26, 14), -0.52, 1.00, -0.48);
  P.addEquipment('turret', box(0.27, 0.19, 0.24), -0.52, 1.20, -0.48);
  P.add('turretDark', box(0.20, 0.10, 0.030), -0.52, 1.21, -0.35);
  P.add('turretGlass', box(0.15, 0.065, 0.018), -0.52, 1.21, -0.332);
  P.addEquipment('turret', box(0.40, 0.16, 0.38), 0.44, 0.88, 0.32);
  P.add('turretDark', box(0.28, 0.09, 0.030), 0.44, 0.91, 0.525);
  P.add('turretGlass', box(0.20, 0.06, 0.018), 0.44, 0.91, 0.544);
  P.add('turret', cylY(0.26, 0.28, 0.065, seg), 0.52, 0.845, -0.88);
  P.add('turretDark', torus(0.265, 0.014, seg), 0.52, 0.885, -0.88);
  // Release 227 (visual critic CN-R7-2 on the Qilin, which carries this turret: "the thin ring rail is wider than the round
  // hatch base under it ... it reads as floating"): the fixed ring (a 14 mm round bar at r 0.265, y 0.885) stands 19 mm out
  // past the cupola's top edge (r 0.26 at y 0.8775, its side flaring to 0.28 at the roof). A ring seat under it, as on the
  // real cupola's casting: a 16.5 mm collar out to the bar's own outer radius, its top 3 mm under the cupola's top face (no
  // shared plane) and 3.5 mm into the bar's underside, its inner part buried in the cupola, in the cupola's paint and
  // facets. (The Qilin's kit carried this seat itself until the fleet turret drew it.)
  const ringSeatTop = 0.8745, ringSeatBottom = 0.858;
  P.add('turret', cylY(0.279, 0.279, ringSeatTop - ringSeatBottom, seg), 0.52, (ringSeatTop + ringSeatBottom) / 2, -0.88);
  periscope(P, 'turretDetail', 0.30, 0.90, -0.88);
  // 2026-10-08 (round 5, the coordinator: the right gun per nation): the QJC-88 (the W85's vehicle form) at true scale.
  if (options.roofGun !== false) {
    // 2026-10-20 (the coordinator's approval): the pintle column stands taller (`riser`), so at full elevation the gun's
    // rear clears the cupola periscope beside it (17 mm on the 0.89 m seat; the periscope is the real cupola's). 2026-10-21
    // (release 229 riding cradle, the ZTZ-99A2 arc lane's ruling): 12 mm, was 10 — the riding gun recoils 12 mm along its
    // bore, which drops its rear ~8 mm at full elevation; the 2 mm keeps the old rig's ~27 mm over the periscope.
    const qjc88 = FITTINGS.pintleMG({
      mats: P.mats, cls: 'qjc88', scale: 1.0, tone: 'two-tone', elev: 0.08, riser: 0.012,
      shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed: 9990, working: true, ridingCradle: true, // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station
    });
    // 2026-10-20: the drone stand's arc alone (-98..+95 deg) swung the gun through the commander's stabilised sight
    // across the roof. Measured with the whole moving mass both ways (tools/roof-station-sweep.mjs: 15 mm samples at
    // recoil 0, half and full, 25 mm kept from level to full elevation): the sight blocks -79..-58 deg and the arc stops
    // a degree short of it; the other end is the drone stand's (its whole-arc check, missionAttachmentMotionClear, clears
    // to +96 deg; +95). Over the gunner's sight ahead and the left smoke bank the barrel depresses only as far as the
    // table lets it (28 mm kept, each degree the smallest of it and its neighbours).
    qjc88.userData.yawArc = [-0.9774, 1.6581];
    qjc88.userData.depressionByYaw = [[-0.2967, 0.18], [-0.2793, 0.175], [-0.2618, 0.165], [-0.2443, 0.155],
      [-0.2269, 0.15], [-0.2094, 0.147], [0.0873, 0.147], [0.1047, 0.15], [0.1222, 0.157], [0.1396, 0.167],
      [0.1571, 0.18], [0.5236, 0.18], [0.5411, 0.175], [0.5585, 0.17], [0.576, 0.167], [0.6109, 0.167],
      [0.6283, 0.172], [0.6458, 0.167], [0.6807, 0.167], [0.6981, 0.17], [0.7156, 0.172], [0.733, 0.17],
      [0.7679, 0.17], [0.7854, 0.172], [0.8029, 0.177], [0.8552, 0.177], [0.8727, 0.18]];
    mount(P, 'turret', qjc88, 0.52, 0.89, -0.88);
  }
  const antennaSeats = options.antennaSeats ?? [[-1.06, -1.58], [1.06, -1.58]];
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.17, 0.08, 0.15), s * 0.96, 0.84, 0.10);
    P.add('turretGlass', box(0.10, 0.052, 0.018), s * 0.96, 0.85, 0.185);
    const [ax, az] = antennaSeats[s < 0 ? 0 : 1];
    P.add('turretDetail', cylY(0.034, 0.044, 0.060, 10), ax, 0.83, az);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: s < 0 ? 0.72 : 0.62, r: 0.011,
      rake: -s * 0.04, seed: 9992 + (s > 0 ? 1 : 0),
    }), ax, 0.86, az);
  }
  addZTZ99A2SmokeBanks(P);

  // ZPT-98 in an open chevron throat, with the recoil collar buried into
  // the connected nose rather than carried by a separate mantlet shell.
  P.gunG.position.set(0, 0.38, 0.78);
  addChineseMovingMantlet(P, .42, .97);
  tubeGun(P, [
    [0.72, 1.58, 0.104], [1.58, 3.03, 0.090], [3.03, 3.72, 0.118],
    [3.72, 5.90, 0.086], [5.90, 6.42, 0.091],
  ], { rings: [[1.58, 0.108], [3.03, 0.121], [3.72, 0.121], [5.90, 0.094]], muzzle: 6.42 });
  muzzleBore(P, { r: 0.088 });

  if (options.decals !== false) {
    P.decal('turret', 'star', null, 0.23, [-1.48, 0.49, -0.10], -Math.PI / 2);
    P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [1.54, 0.48, -1.00], Math.PI / 2);
  }
  P.turretG.userData.ztz99a2ProductionReceipt = Object.freeze({
    architecture: 'ztz99a2-production-arrow-r4',
    independentProductionTurret: true,
    prototypeGeometryReused: false,
    actualReferenceDerived: true,
    integratedChevronFront: true,
    chevronsArePrimaryFront: true,
    permanentChevronCarriers: 2,
    detonatingChevronFacePanels: 8,
    spentStateRetainsClosedFront: true,
    permanentArmoredBustle: true,
    chevronSideJoinGapM: 0,
    chevronProfile: 'vt4a1-leopard-2a6-derived',
    chevronStationsPerSide: 6,
    surfacePanelsPerSide: 4,
    sharedPhysicalRidge: true,
    primaryShellFrontZM: 0.62,
    chevronRidgeFrontZM: 1.72,
    chevronRidgeAdvanceM: 1.10,
    chevronUpperRootYM: 0.83,
    chevronLowerReturnYM: -0.04,
    chevronVerticalCoverageM: 0.87,
    fullHeightFrontCoverage: true,
    bustleExtensionM,
    bustleUndersideRiseM,
    formerRearStationM: bz(-1.72),
    armoredBustleRearZM: bz(-2.22),
    ...(cut > 0 ? { bustleCutM: cut } : {}),
    rearLowerStationYM: 0.44,
    risingUndersideClearsEngineDeck: true,
  });
  P.topY = 1.23;
}

function buildZTZ99A2(P: ChinaBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  buildZTZ99A2Hull(P);
  buildZTZ99A2ProductionTurret(P);
}

function buildZTZ99A2Prototype(P: ChinaBuilderPort): void {
  buildZTZ99A2Hull(P);
  buildZTZ99A2PrototypeTurret(P);
  P.turretG.userData.ztz99a2PrototypeReceipt = Object.freeze({
    architecture: 'ztz99a2-pre-production-welded-wedge-r1',
    preservedFromCanonicalId: 'ztz99a2',
    canonicalProductionReplacement: 'ztz99a2',
    distinctPlayablePrototype: true,
  });
}

// Type 59 (WZ-120): release 262's historical rebuild is the T-54A pattern on the T-54/T-55 family construction it
// shares with the T-55A (profiles/t54Family.ts); the r3 refit on the widened obr-1975 chassis is retired.

export const CHINA_PROFILES = {
  // release 263: the ground-up ZTZ-85-III on the published Type 85 record (profiles/ztz85iii.ts).
  ztz85_iii: { build: buildZTZ85III },
  // Type 99A is registered by chineseFrontline.ts so its certified hull can
  // receive the VT-derived rotating assembly from the same authored family.
  ztz99a: { build: buildZTZ99A2Prototype },
  ztz99a2: { build: buildZTZ99A2 },
  // release 262: the historical T-54A-pattern rebuild (profiles/t54Family.ts).
  type59: { build: buildType59 },
} satisfies VehicleProfileRecord;
