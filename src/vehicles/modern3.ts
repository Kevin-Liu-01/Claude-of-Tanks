import { weaponAssembly } from './profiles/weaponStock.ts';
import { antennaPart } from './profiles/antennaPart.ts';
import { withSeatRole } from './spareTrackSeat.ts';
// src/vehicles/modern3.ts — HD procedural builder pack #3 (modern roster).
// Vehicles (docs/tank-generation/history/modern-roster.md): Chieftain Mk 10 (§19), K2 Black
// Panther (§23), Type 10 (§24), M2A2 Bradley (§6), BMP-2 (§17), C1 Ariete (§26),
// K1A1 (§5.38 KOREA round — new build vs the k1a1_kojf print).
//
// The browser facade demand-registers MODERN3_BUILDERS; the legacy factory
// can still register the same table eagerly. Boot-light combat rows live in
// modern3Specs.ts so unrelated garages never transfer this geometry pack.

import * as THREE from 'three';
import { KIT, type RunningGearConfig, type TankBuilderPort } from './tankFactoryCore.ts';
import { FITTINGS, convexSlab } from './profiles/kit.ts';
import { declareLaunchBore, launchCellParts, perforatedPlate } from './profiles/missileCanisterStock.ts';
import { K2_ROAD_WHEELS, k2WheelGear } from './profiles/k2RoadWheels.ts';
import { addK1E1DeckFrame, addK1E1FrontFender, addK1E1HullFurniture, buildK1E1Turret, k1e1GunShield } from './profiles/k1e1.ts';
import { addK2GlacisFurniture, addK2Skirts } from './profiles/xk2Hull.ts';
import { efficientReturnRoller } from './efficientReturnRoller.ts';
import { mirrorX } from './runningGearPrimitives.ts';
import { buildBmp2Turret, buildBmpBoatHull } from './profiles/bmpBoatHull.ts';
import './modern3Specs.ts';
import { drainTankBuild, steppedBuilder, type TankProfileBuild } from './tankBuildCooperation.ts';
import { sectionSolid } from './profiles/sectionSolid.ts';
import { markVehicleNightLens } from './vehicleNightLighting.ts';
import { buildBradleyClassicTurret } from './profiles/bradleyClassicTurret.ts';

type Vec3Tuple = [number, number, number];
type GeometryScale = number | readonly [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';

export interface Modern3BuilderPort {
  readonly q?: boolean;
  readonly rng: () => number;
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly recoilG: THREE.Group;
  readonly mats: { readonly rubber: THREE.Material; readonly wheels?: THREE.Material };
  readonly disposables: TankBuilderPort['disposables'];
  readonly spec: {
    readonly id: string;
    readonly armor: { readonly gunPivot: readonly [number, number, number] };
    readonly visual: { readonly number?: string };
  };
  readonly geometryReceipt?: boolean;
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(
    owner: VehicleAssemblyOwner,
    geometry: THREE.BufferGeometry,
    ...transform: number[]
  ): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(
    id: string,
    slot: string,
    geometry: THREE.BufferGeometry,
    ...transform: number[]
  ): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string | null,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  /** Seats a small fitting group on its own rig group's stock (fittingSnap.ts). */
  snapGroup: TankBuilderPort['snapGroup'];
}

const scaledGeometryTransform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x?: number,
  y?: number,
  z?: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: GeometryScale,
) => THREE.BufferGeometry;


// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

// ================================ K2 Black Panther ==========================
// §5.38 PRINT REBUILD (2026-08-08, owner priority: "fully model a custom xk2_black_panther
// black panther based on this model"): re-lofted to the measured lines of
// public/models/community-candidates/k2_black_panther_armored_warfare.glb
// (LOCAL-ONLY quarantine; receipt docs/references/vertex/k2.json). Frame map:
// raw meters ×0.968 (the loader's width-bound safeScale) with z −0.128 =
// build world. Print truth adopted: LONG WIDE turret (shell z −3.0..+2.32,
// walls ±1.50, cheek side-modules ±1.61), broad low arrowhead nose (apex
// edge y 1.72 spanning ±1.20), roof plateau 2.30 (pub 2.40 = the sight/
// cupola plane — heightM p95 datum, furniture band capped ≤2.42 + the
// budgeted pano/mast spikes), shallow 10.8° glacis to a high 1.20 bow lip
// over a 42° chin, skirt run ±1.72 with the sawtooth hems (0.41 front/rear,
// 0.67 mid) and ±1.80 front guard flares as the §D width anchor. DIMS
// SOVEREIGN vs the print's binds (len −2.4%/overall −3%): body ±3.75 (7.50),
// muzzle +6.95 (overall 10.70, inside the 1% grace). §B7-CLASS CAP (packet):
// the print's furniture band (pano complex/rail masts/antenna pair) reads
// 2.66..4.58 — a build honoring the 2.40 datum cannot corroborate it; the
// divergence is certified, §E furniture-band warp queued as recovery.
/**
 * `addOnFront` (267 round 2, the K2B): the K2B's add-on wedge modules (profiles/korea.ts addK2BTurretFront) are the
 * turret front, so the K2's own blunt nose, cheek side armour and its banks, and the cheek KAPS panels they would
 * enclose or pierce are not built. The XK2 builds hullOnly; the Garage's K2 exhibit (MODERN3_BUILDERS) builds them all.
 */
export function buildK2(P: Modern3BuilderPort,
  options: { hullOnly?: boolean; addOnFront?: boolean; k2bBow?: boolean } = {}) {
  const addOnFront = options.addOnFront === true;
  // `k2bBow` (267 round 3, the K2B): the guard flares' and canted bow wedge's feet run back so the side profile shows
  // a raked lower front (about 50 degrees) instead of upright plates, and the K2's glacis lamp housings give way to the
  // K2B's own corner housings (korea.ts).
  const k2bBow = options.k2bBow === true;
  const guardFootY = k2bBow ? 0.86 : 0.90, guardFootZ = k2bBow ? 3.45 : 3.73;
  const wedgeFootZ = k2bBow ? 3.52 : 3.715;
  // r269s3 (tools/fleet-surface-overlap-audit.mjs on the K2B): faces of two parts that met in one plane, a coplanar
  // flicker, stand a few millimetres apart on the K2B's hull (`k2bBow`) and turret (`addOnFront`); the XK2 is unchanged
  const k2bSeat = k2bBow ? 0.002 : 0, k2bSeam = addOnFront ? 0.0005 : 0;
  const { box, cylX, cylY, cylZ, xform, buildGun, buildRunningGear,
    liftEye, periscope, smokeCluster, stowage, ammoCan,
    openRackGrid, torus } = KIT;
  const slab = orientedSlab;                                                   // §C.1 winding guard on every mirrored slab
  const { rng } = P;
  // K2's actual rubber flaps and skirt fringes stay ordinary hull-owned
  // candidates for the strict containment audit.  Native end discs,
  // suspension and wheel-bay backers use the explicit running-gear buckets
  // below; do not hide the real guards behind a blanket runningGear tag.
  const hullRubberLane = (
    side: number,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new THREE.Mesh(geo, P.mats.rubber);
    m.name = `k2_track_rubber_${side < 0 ? 'L' : 'R'}`;
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = true;
    P.hullG.add(m);
    P.disposables.push(geo);
    return m;
  };

  const buildK2RunningGear = (): void => {
  // Six evenly pitched K2 stations, compressed toward the fixed front road
  // wheel so the rear station no longer hangs beneath the boat-tail.  The
  // return rollers and rear track contact follow the same forward seat; the
  // idler and sprocket retain their certified locations and contact arcs.
  const k2RoadWheelZs = [2.48, 1.55, 0.62, -0.31, -1.24, -2.17];
  const wheelPaint = P.mats.wheels;
  if (!wheelPaint) throw new Error('K2 running gear requires the wheel paint');
  const k2ReturnRollerZs = [1.61, 0.20, -1.21];
  const k2ReturnRotor = efficientReturnRoller({ quality: P.q ? 'high' : 'low',
    radiusM: 0.095175, axialWidthM: 0.0826, spindleRadiusM: 0.025, spindleLengthM: 0.1282 });
  k2ReturnRotor.spindle.dispose();
  const gearConfig: RunningGearConfig = {
    style: 'rubber', ...K2_ROAD_WHEELS, xc: 1.375,
    // 2026-10-25 (the owner: "redo the k2b and xk2's tracks and wheels"): the K2 X source twin wheel, not the generic disc
    ...k2WheelGear(!!P.q, wheelPaint),
    wheelZs: k2RoadWheelZs,
    // 2026-10-25 (the owner: "redo the k2b and xk2's tracks"): the K2's own end wheels and return rotors (k2X.ts measured
    // r .351/.300 and .095). The old 0.25 m sprocket sat at 1.10 behind the skirt, so the rear course climbed into
    // nothing, and the 0.24 m idler needed a static 0.34 m disc nested in it to read at all.
    sprocket: { z: -3.08, y: 0.86, r: 0.33 }, idler: { z: 3.10, y: 0.76, r: 0.29 },
    rollers: k2ReturnRollerZs.map((z) => ({ z, y: 0.915, r: 0.095175 })),
    rollerR: 0.095175, returnRollerWidthM: 0.0826, returnRollerInsetM: 0.1905,
    returnRollerHullHalfWidthM: 1.05, returnRollerGeometry: k2ReturnRotor.rotor,
    trackW: 0.60, topY: 0.96, contactZF: 2.40, contactZR: -2.395,
    containRearRoadWheel: true,
    paintedEnds: true, coveredTop: true,
  };
  const gear = buildRunningGear(P, gearConfig);
  // Use the same solved ground seat as the animated wheels, including the
  // smaller tire radius. Fixed inboard ISU knuckles must follow that axle.
  const roadWheelY = gear.roadWheelLayout?.wheelY;
  if (roadWheelY === undefined) throw new Error('K2 running gear requires solved road-wheel axles');
  for (const s of [-1, 1]) {
    // The canonical animated sprocket owns the complete rear carrier, teeth
    // and hub. Do not layer a static pressed face here: the old 0.34 m disc
    // escaped behind the links and read as a seventh road wheel.
    // Visible ISU knuckles and canted arms sit in the open skirt cuts.  They
    // are nested inside the certified shoe lane, adding the source model's
    // suspension depth without widening the running-gear silhouette.
    for (const z of k2RoadWheelZs) {
      P.add('hullRunningGearDetail', cylX(0.105, 0.245, P.q ? 16 : 10), s * 1.39, roadWheelY, z);
      P.add('hullRunningGearDark', cylX(0.045, 0.258, P.q ? 14 : 8), s * 1.39, roadWheelY, z);
      P.add('hullRunningGearDetail', box(0.070, 0.075, 0.42), s * 1.46, 0.83, z + 0.16, s * 0.62, 0, 0);
    }
  }
  // The open wheel bays use the real hull and running gear for shade.
  // Owner 2026-09-30: remove the full-height inboard backdrop walls.
  };
  buildK2RunningGear();

  const buildK2HullBody = (): void => {
  // hull: belly between the tracks, full-width band above the skirt line,
  // §B1 ONE shallow glacis plane (print: 1.20 lip -> 1.66 crest, 10.8°),
  // high pointed prow (nose face over a 42° chin — the K2 sharp chin read).
  P.add('hull', box(2.10, 0.62, 5.49), 0, 0.71, 0.105);                        // measured belly ±1.05, z -2.64..2.85
  P.add('hull', slab(                                                          // rising lower bow; no deep vertical center block
    [-0.98, 0.40, 2.85], [0.98, 0.40, 2.85], [0.98, 0.78, 3.38], [-0.98, 0.78, 3.38],
    [-0.98, 1.02, 2.85], [0.98, 1.02, 2.85], [0.98, 1.08, 3.38], [-0.98, 1.08, 3.38]));
  const shoulderX = 1.05 - k2bSeat;                                            // K2B: 2 mm inside the belly's side
  P.add('hull', slab(                                                          // central lower shoulder stays between the live shoe lanes
    [-shoulderX, 0.46, 2.76], [shoulderX, 0.46, 2.76], [shoulderX, 0.68, 3.38], [-shoulderX, 0.68, 3.38],
    [-shoulderX, 1.08, 2.76], [shoulderX, 1.08, 2.76], [shoulderX, 1.04, 3.38], [-shoulderX, 1.04, 3.38]));
  // Full-width shoulder caps visible in the direct-front oracle.  The real
  // plates are thin armor OVER the approach ramps, not a deep solid through
  // the tracks: keep their undersides above the measured shoe envelope and
  // overlap the central shoulder + existing ±1.77 guard roof.
  // (inner front corners run to z 3.475, 7 mm into the nose lip's raked back face: at 3.46 they stopped 8 mm short
  // of it, the seam that split the whole upper hull from the belly and nose; owner 2026-10-19 sweep)
  for (const s of [-1, 1]) P.add('hull', slab(
    [s * 1.05, 1.16, 2.72], [s * 1.77, 1.14, 2.78], [s * 1.77, 1.13, 3.42], [s * 1.05, 1.14, 3.475],
    [s * 1.05, 1.23, 2.72], [s * 1.77, 1.15, 2.78], [s * 1.77, 1.10, 3.42], [s * 1.05, 1.21, 3.475]));
  // The frontal shoulder faces are canted across the track lanes.  Surface
  // planes sit on the certified cap front (no new envelope) and replace the
  // old dead-horizontal shelf read with the oracle's inward-high rake.
  for (const s of [-1, 1]) {
    const shoulderFace = new THREE.PlaneGeometry(0.72, 0.14);
    shoulderFace.rotateZ(-s * 0.12);
    P.add('hull', shoulderFace, s * 1.41, 1.18, 3.461);
  }
  // Solid five-knot rear boat-tail, measured before lofting. It rises into
  // the stern inside the sprocket lanes; each segment intersects the next,
  // so the shaded result remains one armored casting rather than stair-step
  // silhouette cards.
  const rearK = [[-2.64, 0.40, 1.16], [-2.85, 0.53, 1.16],
    [-3.10, 0.65, 1.17], [-3.30, 0.66, 1.19], [-3.46, 0.72, 1.22],
    [-3.50, 1.24, 1.24]];
  for (let k = 0; k < rearK.length - 1; k++) {
    const [za, ba, ta] = rearK[k]; const [zb, bb, tb] = rearK[k + 1];
    P.add('hull', slab(
      [-1.05, ba, za], [1.05, ba, za], [1.05, bb, zb], [-1.05, bb, zb],
      [-1.05, ta, za], [1.05, ta, za], [1.05, tb, zb], [-1.05, tb, zb]));
  }
  // Rear sponson: retain the complete center hull and the original full-width
  // roof plane, but keep the outboard underside above the raised return run.
  // The former 0.50 m full-width solid occupied the native sprocket/shoe
  // corridor; this closed cap construction preserves every exterior upper
  // edge and the full side-skirt envelope without hollowing the hull.
  P.add('hull', box(2.10, 0.50 - k2bSeat, 2.50), 0, 1.41 - k2bSeat / 2, -2.25); // connected center body, z -3.50..-1.00 (K2B: top 2 mm under the sponson roof's)
  P.add('hull', box(3.32, 0.10, 2.50), 0, 1.61, -2.25);                        // full-width sponson roof above the native return
  P.add('hull', box(3.32, 0.40, 2.30), 0, 1.36, 0.15);                         // lower mid deck, z -1.00..1.30 (267: kept at 1.56, the turret ring well the guns depress over at the sides)
  P.add('hull', slab(                                                          // raked stern face: lower edge rises into the rear plate
    [-1.66, 1.04, -3.50], [1.66, 1.04, -3.50], [1.66, 1.35, -3.74], [-1.66, 1.35, -3.74],
    [-1.66, 1.66, -3.50], [1.66, 1.66, -3.50], [1.66, 1.65, -3.74], [-1.66, 1.65, -3.74]));
  P.add('hull', box(0.22, 0.32, 0.035), 0, 1.50, -3.73);                       // structural rear datum bracket, measured rear band 1.34..1.66
  P.add('hull', slab(                                                          // §B1 glacis: center lip z 3.53; only guard flares reach 3.73
    [-1.66, 1.24, 3.53], [1.66, 1.24, 3.53], [1.66, 1.20, 3.41], [-1.66, 1.20, 3.41],
    [-1.66, 1.66, 1.30], [1.66, 1.66, 1.30], [1.66, 1.66, 1.12], [-1.66, 1.66, 1.12]));
  P.add('hull', slab(                                                          // nose lip face — broad, low and receding between the shoulder caps
    [-1.08, 0.90, 3.51], [1.08, 0.90, 3.51], [1.08, 0.90, 3.45], [-1.08, 0.90, 3.45],
    [-1.08, 1.18, 3.555], [1.08, 1.18, 3.555], [1.08, 1.17, 3.47], [-1.08, 1.17, 3.47]));
  // Keep the eight measured datums and broad 42° chin plane. Its side quads
  // are not coplanar: a fixed diagonal dented only one side inward. Supporting
  // triangular side facets close the same finite stock symmetrically.
  const chin = convexSlab(
    [-0.72, 0.40, 3.33], [0.72, 0.40, 3.33], [0.72, 0.40, 3.11], [-0.72, 0.40, 3.11],
    [-1.08, 0.90, 3.51], [1.08, 0.90, 3.51], [1.08, 0.88, 3.41], [-1.08, 0.88, 3.41]);
  chin.userData.primaryStockRole = 'k2-bow-chin';
  P.add('hull', chin);
  P.add('hull', box(1.50, 0.14, 0.22), 0, 0.49, 3.22);                         // narrow toe beam reveals both fender shoulders
  // r268b: the bow tow hooks are clevises with shackles under the bolted nose plate (xk2Hull.ts addK2GlacisFurniture)
  };
  buildK2HullBody();
  const buildK2RearHull = (): void => {
  // rear: center lane below the band (sprocket lanes stay open), full width
  // above; grilles + louvres + taillights + convoy plate + flaps + the
  // print's stern stowage rack row above the grilles.
  const buildRearGrilles = (): void => {
  {
    // The oracle reads one grille field, but its service bays are unequal
    // and separated by real vertical breaks.  Build those three fields as
    // flush skins on the certified stern face (the Leclerc rack-gap rule),
    // instead of letting one uninterrupted rectangle flatten the rear.
    const grilleBays = [
      [-0.74, 0.54, 0.29], [-0.05, 0.68, 0.34], [0.62, 0.46, 0.26],
    ];
    for (const [x, w, h] of grilleBays) {
      const base = new THREE.PlaneGeometry(w, h); base.rotateY(Math.PI);
      P.add('hullDark', base, x, 1.34, -3.741);
    }
    for (let bi = 0; bi < grilleBays.length; bi++) {
      const [x, w, h] = grilleBays[bi];
      const slatCount = [4, 6, 3][bi];
      for (const k of KIT.grilleIndices(P.q, slatCount, 2)) {
        const slat = new THREE.PlaneGeometry(w - 0.05, 0.026); slat.rotateY(Math.PI);
        P.add('hullDetail', slat, x, 1.34 - h * 0.34 + k * h * 0.68 / Math.max(1, slatCount - 1), -3.743);
      }
      for (const dx of (bi === 1 ? [-w * 0.27, w * 0.27] : [0])) {
        const divider = new THREE.PlaneGeometry(0.022, h - 0.04); divider.rotateY(Math.PI);
        P.add('hullDetail', divider, x + dx, 1.34, -3.744);
      }
    }
    if (P.q) {
      // Flush service hardware lives inside the certified grille field: a
      // diagonal brace on the left bay, a small access latch in the center,
      // and an offset connector pair on the right.  These enrich dead-rear
      // read without manufacturing new stern silhouette pixels.
      const brace = new THREE.PlaneGeometry(0.34, 0.022); brace.rotateY(Math.PI); brace.rotateZ(-0.42);
      P.add('hullDetail', brace, -0.74, 1.34, -3.7425);
      const latch = new THREE.PlaneGeometry(0.10, 0.055); latch.rotateY(Math.PI);
      P.add('hullDetail', latch, -0.05, 1.34, -3.7425);
      for (const [x, y, r] of [[0.56, 1.31, 0.032], [0.70, 1.38, 0.026]]) {
        P.add('hullDetail', cylZ(r, 0.010, 10), x, y, -3.746);
        P.add('hullDark', cylZ(r * 0.50, 0.012, 10), x, y, -3.751);
      }
    }
  }
  };
  buildRearGrilles();
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.42, 1.56, -3.725);          // taillights
    hullRubberLane(s, box(0.58, 0.24, 0.026), s * 1.40, 1.46, -3.72);          // compact rear flap inside the high stern band
    P.add('hullDetail', box(0.07, 0.05, 0.16), s * 1.40, 1.42, -3.64);         // flap hangers
    const convoyFace = new THREE.PlaneGeometry(s < 0 ? 0.32 : 0.26, s < 0 ? 0.21 : 0.18);
    convoyFace.rotateY(Math.PI);
    P.add('hullDark', convoyFace, s * 1.25, s < 0 ? 1.42 : 1.38, -3.741);      // 1 mm off the stern face (-3.740; it stood 26 mm off)
    if (s < 0) for (let k = -1; k <= 1; k++) {
      const convoyStripe = new THREE.PlaneGeometry(0.22, 0.025);
      convoyStripe.rotateY(Math.PI);
      convoyStripe.rotateZ(-0.65);
      P.add('hullDetail', convoyStripe, -1.25 + k * 0.010, 1.42 + k * 0.050, -3.742);
    }
  }
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.43 + k2bSeat, -3.728);       // convoy plate (K2B: its foot 2 mm over the datum bracket's)
  P.add('hullDark', box(1.42, 0.30, 0.026), 0, 0.96, -3.455);                 // broad recessed lower service panel on the boat-tail face
  P.add('hullDetail', box(1.48, 0.025, 0.030), 0, 1.09, -3.468);               // panel upper break
  for (const x of [-0.71, 0, 0.71]) P.add('hullDetail', box(0.025, 0.28, 0.030), x, 0.96, -3.468);
  P.add('hull', box(0.32, 0.15, 0.045), 0, 0.96, -3.475);                      // central access/convoy plate
  P.add('hullDark', box(0.24, 0.045, 0.050), 0, 0.96, -3.502);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.18, 0.20, 0.08), s * 0.62, 0.80, -3.43);               // tow-clevis boss tied into stern plate
    for (const dx of [-0.055, 0.055]) P.add('hullDetail', box(0.040, 0.18, 0.10), s * 0.62 + dx, 0.73, -3.47);
    P.add('hullDark', cylX(0.026, 0.15 + 2 * k2bSeat, 10), s * 0.62, 0.68, -3.49); // clevis pin replaces the schematic circular eye (K2B: its heads 2 mm proud of the cheeks)
    P.add('hullDetail', box(0.08, 0.14, 0.05), s * 1.30, 1.08, -3.49);         // basket/support hardpoint
    P.add('hullDark', box(0.28, 0.16, 0.025), s * 1.16, 0.94, -3.50);          // recessed service box
  }
  for (const x of [-0.96, 0, 0.96]) P.add('hullDark', box(0.54, 0.022, 0.028), x, 1.18, -3.56); // broken stern seam
  };
  buildK2RearHull();
  const buildK2Skirts = (): void => {
  // front guard flares — the §D WIDTH ANCHOR at ±1.80 EXACT (print: the
  // only ±1.80 content is the bow mudguard flares; the skirt run sits at
  // ±1.72). Wall face 1.80, top plate ties to the band, struts close §B2.
  const buildFrontGuards = (): void => {
  for (const s of [-1, 1]) {
    // 267 round 2: the flare and guard roof start on the skirt's own lines (top 1.31 = the skirt lip at z 3.18, foot
    // 0.82 = its raked hem) and fall to the guard nose, one clean sloped cap. They rose 8 cm above the skirt and dropped
    // 10 cm under its hem, the "<" notch and spike the side view showed; the loose bar on the guard roof is gone.
    P.add('hull', slab(                                                        // articulated raked fender transition
      [s * 1.77, 0.82, 3.18], [s * 1.80, 0.82, 3.18], [s * 1.80, guardFootY, guardFootZ], [s * 1.77, guardFootY, guardFootZ],
      [s * 1.77, 1.31, 3.18], [s * 1.80, 1.31, 3.18], [s * 1.80, 1.10, 3.73], [s * 1.77, 1.10, 3.73]));
    P.add('hull', slab(                                                        // thin guard roof follows the same descending rake
      [s * 1.64, 1.28, 3.18], [s * 1.77, 1.28, 3.18], [s * 1.77, 1.08, 3.73], [s * 1.64, 1.08, 3.73],
      [s * 1.64, 1.31, 3.18], [s * 1.77, 1.31, 3.18], [s * 1.77, 1.11, 3.73], [s * 1.64, 1.11, 3.73]));
    // 267 round 4: the front mudflap (XK2 photo 1, the K2 photo 5) hangs plumb from the wedge foot over the track front,
    // its top 2.6-5.4 cm up inside the foot (0.924 inner, 0.896 outer), its level hem at 0.80, between the idler hub
    // (0.76) and the track top (0.96). The old curtain sat wholly inside the wedge, so neither bow showed a flap.
    hullRubberLane(s, box(0.58, 0.15, 0.020), s * 1.40, 0.875, k2bBow ? 3.508 : 3.703);
    // The rubber flap is a backing curtain, not the visible bow face.  A
    // flush canted armor skin and inset lamp aperture restore the oracle's
    // continuous fender shoulder while staying behind the 3.82 m guard lip.
    // FSP-05 (2026-09-25): the canted skin was a one-sided plane over an open
    // pocket (x 1.09..1.64, z 3.46..3.715, below the fender top and outboard of
    // the +-1.08 nose lip), so the chase views looked through the shoulder into
    // its back. The same canted face (inner 0.925..1.255, outer 0.895..1.175 at
    // z 3.715) now fronts a closed wedge whose rear ring at z 3.50 buries its top
    // edge in the 1.20..1.24 glacis-lip band and meets the shoulder cap; its
    // bottom stays 0.17 m above the idler wrap, which has left the lane by 3.43.
    P.add('hull', slab(
      [s * 1.09, 0.925, wedgeFootZ], [s * 1.71, 0.895, wedgeFootZ], [s * 1.71, 0.895, 3.50], [s * 1.09, 0.925, 3.50],
      [s * 1.09, 1.255, 3.715], [s * 1.71, 1.175, 3.715], [s * 1.71, 1.20, 3.50], [s * 1.09, 1.235, 3.50]));
    if (!k2bBow) {                                                             // flush on the upright wedge face only
      const fenderBreak = new THREE.PlaneGeometry(0.016, 0.22);
      fenderBreak.rotateZ(s * 0.16);
      P.add('hullDark', fenderBreak, s * 1.56, 1.075, 3.718);
      const lampWell = new THREE.PlaneGeometry(0.105, 0.055);
      P.add('hullDark', lampWell, s * 1.17, 1.205, 3.716);
      const lampLens = new THREE.PlaneGeometry(0.070, 0.030);
      P.add('hullGlass', lampLens, s * 1.17, 1.205, 3.717);
    }
    hullRubberLane(s, box(0.025, 0.50, 0.35), s * 1.725, 1.05, -3.30);         // outer rear guard retucks the end wheel
  }
  };
  buildFrontGuards();
  // 267 (owner 2026-11-01, "update ... K2B, xK2"): the XK2 photographs' one continuous deep armoured skirt, hem level
  // at the wheel tops, heavy bolted modules over its front half (profiles/xk2Hull.ts). The print's sawtooth of teeth and
  // open notches, its asymmetric stringer and fender strips and the bow datum post are gone.
  // r269: the K2B's bolted add-on run (profiles/k2bHullKit.ts) replaces the heavy modules on its plate
  addK2Skirts(P, { heavyModules: !k2bBow });
  };
  buildK2Skirts();
  const buildK2HullFurniture = (): void => {
  // glacis furniture ON the plane: driver station front-LEFT (bed plate,
  // ring and rim all on the 10.8° rake), light clusters on the guard tops
  // (§I fittings).
  // 267 round 4 (both blind critics on XK2 and K2B: "a thin dark curved line and a loose stick lie on the glacis";
  // owner, same class: "stuff on sides not flush with the turret. fix"): the tow cable draped from the turret front
  // through the plate to the right edge, and the splash V read as a loose bar beside the barrel. XK2 photos 1/5 show a
  // plain glacis, so both are gone with the V's apex block.
  // Round 5 (both critics, top view: "a dashed ring" on the front deck): the dark rim torus rode 1 mm over the ring's
  // top and broke it into dashes. The hatch is now one solid raised ring on the rake: an annulus (r 0.205-0.27) 2 mm
  // into the bed plate and 38 mm proud of it all the way round, both its shoulders chamfered (continuous bands in plan;
  // its walls alone are edge-on there), round a lid 20 mm lower with a dark seam at its rim; all of it inside the old
  // ring's cylinder, so no gun pose comes nearer the hull.
  P.add('hull', box(0.60, 0.045, 0.60), -0.42, 1.505, 2.02, 0.19, 0, 0);       // hatch bed plate on the rake
  {
    const bedTop = new THREE.Vector3(-0.42, 1.505, 2.02)                       // the bed plate's top-face centre
      .addScaledVector(new THREE.Vector3(0, Math.cos(0.19), Math.sin(0.19)), 0.0225);
    const seg = P.q ? 24 : 14;
    // closed (r, y) section, wound outward, swept round the hatch axis
    const lathe = (...rz: [number, number][]): THREE.LatheGeometry =>
      new THREE.LatheGeometry([...rz, rz[0]].map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const place = [bedTop.x, bedTop.y, bedTop.z, 0.19, 0, 0] as const;
    P.add('hull', lathe([0.270, -0.002], [0.270, 0.004], [0.242, 0.038], [0.226, 0.038], [0.205, 0.018],
      [0.205, -0.002]), ...place);                                                                            // ring
    P.add('hull', cylY(0.205, 0.205, 0.020, seg).translate(0, 0.008, 0), ...place);                          // lid
    P.add('hullDark', lathe([0.205, 0.016], [0.205, 0.022], [0.180, 0.022], [0.180, 0.016]), ...place);      // lid rim seam
  }
  // r268b (owner 2026-11-02: "add more upper glacis and roof details"): the driver's three periscopes in one armoured
  // frame, the hatch hinge and handle, lifting eyes on the plate's front corners and the tow clevises; the plate itself
  // stays smooth, as photographed (xk2Hull.ts addK2GlacisFurniture)
  addK2GlacisFurniture(P);
  {
    for (const s of [-1, 1]) {
      if (k2bBow) continue;                                                    // the K2B's own corner housings carry its lamps (korea.ts)
      P.add('hull', box(0.26, 0.13, 0.11), s * 1.36, 1.25, 3.375);             // headlight housing
      P.add('hullDetail', box(0.02, 0.15, 0.02), s * 1.27, 1.26, 3.46);
      P.add('hullDetail', box(0.02, 0.15, 0.02), s * 1.45, 1.26, 3.46);
      const lc = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.15, rake: -0.19, seed: 3 + s });
      lc.position.set(s * 1.36, 1.26, 3.44);
      P.hullG.add(lc);
    }
    // 267 round 2: the spare-link run is gone. Its stern seat fails the seat rules, so the solver racked it on the
    // lower bow plate, where it hung at an angle in front of the left track (critic: "reads as a loose part").
    const rack = FITTINGS.stowageRack({ mats: P.mats, w: 2.20, d: 0.26, h: 0.26, fill: 0.75, seed: 17, rotation: [0, Math.PI, 0] });
    rack.position.set(0, 1.30, -3.60);                                         // stern rack row
    P.hullG.add(rack);
  }
  // deck: louvred engine field, fan rings, filler caps — ALL tops ≤1.69
  // (the turret shell bottom rides at 1.69; sweep law, type10_tk_x precedent).
  // Corner kit (bin, lift eyes, links) lives OUTSIDE the 2.62 swing radius.
  P.add('hullDark', box(2.40, 0.02, 1.20), 0, 1.663, -2.70);
  for (const k of KIT.grilleIndices(P.q, 5, 3)) {
    P.add('hullDetail', box(2.30, 0.02, 0.06), 0, 1.669, -3.14 + k * 0.22);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', torus(0.30, 0.014, P.q ? 22 : 14), s * 0.78, 1.664, -1.80); // fan rings (top 1.678)
    P.add('hullDetail', cylY(0.085, 0.085, 0.02, 12), s * 1.25, 1.557, -0.35);    // filler caps
  }
  liftEye(P, 'hullDetail', -1.55, 1.655, -3.40);
  liftEye(P, 'hullDetail', 1.55, 1.655, -3.40);
  P.add('hull', box(0.30, 0.12, 0.70), -1.40, 1.64, -3.28);                    // tool bin seated in stern tray
  P.add('hullDark', box(0.31, 0.02, 0.72), -1.40, 1.705, -3.28);
  // deck shadow lane around the ring (critic r1 carve: the visible deck
  // shelf between turret wall and hull edge reads turret-ON-hull)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.08, 0.010, 1.25), s * 1.57, 1.564, -0.35);     // on the 1.56 mid deck (it hung 0.10 m over it)
  }
  };
  buildK2HullFurniture();

  const addHullDecals = (): void => {
    P.decal('hull', 'number', '325', 0.24, [1.725, 1.00, 2.50], Math.PI / 2);
    P.decal('hull', 'number', '325', 0.24, [-1.725, 1.00, 2.50], -Math.PI / 2);
    P.decal('hull', 'soot', null, 0.8, [0.92, 1.30, -3.74], Math.PI);
  };
  if (options.hullOnly) {
    addHullDecals();
    return;
  }

  // ---- turret: the K2 arrowhead to the PRINT's lines (§B1/§B1.1). Pivot
  // world [0, 1.66, -0.30] = the shell's plan center (spin law); local
  // frame: world z = local − 0.30, roof plateau local 0.64 = world 2.30.
  // Print truth: walls ±1.50 sustained z_loc −2.10..+0.45, roof-edge sweep
  // (±0.55, 2.42) -> (±1.49, 0.45), BROAD low apex edge (y_loc 0.06 =
  // world 1.72) spanning ±0.55 center + ±1.20 cheek corners, cheek side
  // armor modules to ±1.61, bustle rack row to world −2.9. Shell bottom
  // rides 0.03 ABOVE the 1.66 deck (sweep law — deck kit budget 1.69) with
  // a sunk ring seat closing the §B2 gap; the nose overhang air over the
  // glacis is the legitimate ring/overhang class.
  const chkB = (s: number, u: number): Vec3Tuple => [s * (0.55 + 0.65 * u), 0.06, 2.60 - 0.16 * u];       // apex edge (0.55,2.60)->(1.20,2.44)
  const chkT = (s: number, u: number): Vec3Tuple => [s * (0.55 + 0.94 * u), 0.58, 2.42 - 1.97 * u];       // lowered armor edge; the measured coaming is authored separately below
  const chkP = (s: number, u: number, v: number): Vec3Tuple => {
    const b = chkB(s, u); const t = chkT(s, u);
    return [b[0] + (t[0] - b[0]) * v, b[1] + (t[1] - b[1]) * v, b[2] + (t[2] - b[2]) * v];
  };
  const cheekPanel = (
    s: number,
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    out: number,
    mat: string,
  ) => {                                                                        // slab riding the cheek plane (flush by construction)
    const e = 0.01; const uc = (u0 + u1) / 2; const vc = (v0 + v1) / 2;
    const p0 = chkP(s, uc, vc); const pu = chkP(s, uc + e, vc); const pv = chkP(s, uc, vc + e);
    const du = [pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]];
    const dv = [pv[0] - p0[0], pv[1] - p0[1], pv[2] - p0[2]];
    let n: Vec3Tuple = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
    const L = Math.hypot(n[0], n[1], n[2]); n = n.map((c) => c / L) as Vec3Tuple;
    if (n[2] < 0) n = n.map((c) => -c) as Vec3Tuple;                            // outward = +z/up
    const off = (p: Vec3Tuple, k: number): Vec3Tuple => [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k];
    const q = [chkP(s, u0, v0), chkP(s, u1, v0), chkP(s, u1, v1), chkP(s, u0, v1)]
      .map((p): Vec3Tuple => [p[0], p[1], p[2] - 0.35]);
    P.add(mat, slab(off(q[0], 0), off(q[1], 0), off(q[2], 0), off(q[3], 0),
      off(q[0], out), off(q[1], out), off(q[2], out), off(q[3], out)));
  };
  const buildK2TurretLoft = (): number => {
  // LECLERC-METHOD CLOSED TURRET LOFT.  Each row is a measured longitudinal
  // station: z, underside half-width/y, then roof half-width/y.  The earlier
  // center box + two outer boxes filled isolated x/z maxima and rendered as
  // three stacked slabs.  These eight intersecting solids instead follow the
  // real shell continuously: narrow gun bay -> swept arrow cheeks -> low
  // shoulder plateau -> tapered autoloader bustle.  The roof stays visibly
  // narrower than the lower wall, which is the dominant K2 three-quarter cue.
  const turretStations = [
    [2.45, 0.38, -0.08, 0.28, 0.62],
    [1.55, 1.12,  0.00, 0.72, 0.64],
    [1.30, 1.32, -0.10, 0.88, 0.69],
    [1.10, 1.44,  0.00, 1.00, 0.67],
    [0.45, 1.50, -0.10, 1.18, 0.69],
    [-0.35, 1.52, -0.08, 1.25, 0.69],
    [-1.20, 1.52, 0.02, 1.25, 0.69],
    [-1.80, 1.48, 0.10, 1.22, 0.65],
    [-2.15, 1.36, 0.12, 1.16, 0.60],
    [-2.62, 0.60, 0.14, 0.48, 0.34],
  ];
  // Each station is convex armor stock. A fixed quad diagonal previously
  // dimpled one flank inward and chose a different physical face on its mirror.
  // Preserve every silhouette datum and let the supporting planes own faces.
  const addShellStock = (...corners: [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple,
    Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple]) => {
    const geometry = convexSlab(...corners);
    geometry.userData.primaryStockRole = 'k2-turret-shell';
    P.add('turret', geometry);
  };
  const turretRoofLift = -0.05;
  for (let k = 0; k < turretStations.length - 1; k++) {
    const [za, bwa, bya, twa, tya] = turretStations[k];
    const [zb, bwb, byb, twb, tyb] = turretStations[k + 1];
    addShellStock(
      [-bwa, bya, za], [bwa, bya, za], [bwb, byb, zb], [-bwb, byb, zb],
      [-twa, tya + turretRoofLift, za], [twa, tya + turretRoofLift, za],
      [twb, tyb + turretRoofLift, zb], [-twb, tyb + turretRoofLift, zb]);
  }
  // Measured two-stage roof skin: the structural loft terminates below these
  // joined armor planes so the hatches, KCPS and panel rails stand proud.
  // This is the Leclerc construction rule applied literally: first the long
  // raked face, then the small brow/roof plane, never one inflated box.
  if (!addOnFront) addShellStock(
    [-0.42, 0.57, 2.65], [0.42, 0.57, 2.65], [1.12, 0.57, 1.05], [-1.12, 0.57, 1.05],
    [-0.35, 0.71, 2.62], [0.35, 0.71, 2.62], [1.05, 0.71, 1.08], [-1.05, 0.71, 1.08]);
  // The K2B's add-on wedges are its forward roof either side: this stage is then only the central crown between them,
  // behind the brow, its top flush with the wedges' inner tops.
  else addShellStock(
    [-0.45, 0.57, 1.80], [0.45, 0.57, 1.80], [0.45, 0.57, 1.05], [-0.45, 0.57, 1.05],
    [-0.45, 0.70, 1.80], [0.45, 0.70, 1.80], [0.45, 0.70, 1.08], [-0.45, 0.70, 1.08]);
  addShellStock(
    [-1.15, 0.54, 1.10], [1.15, 0.54, 1.10], [1.20, 0.54, -0.10], [-1.20, 0.54, -0.10],
    [-1.05, 0.69, 1.10], [1.05, 0.69, 1.10], [1.12, 0.56, -0.10], [-1.12, 0.56, -0.10]);
  addShellStock(
    [-1.20, 0.54, -0.10], [1.20, 0.54, -0.10], [1.20, 0.54, -1.80], [-1.20, 0.54, -1.80],
    [-1.12, 0.56, -0.10], [1.12, 0.56, -0.10], [1.10, 0.69, -1.75], [-1.10, 0.69, -1.75]);
  // Leclerc-method datum split: the closed armor mass is low, while a close-
  // fitted bevel rises to the print's high roof boundary.  The first cut used
  // hairline bars here and read as a stand-off rack; these joined wedge bands
  // are armor, with their inner edge buried into the lower roof skin.
  const roofBevel = (
    s: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    yOuter = 0.778,
    yInner = 0.720,
    band = 0.06,
  ) => {
    const ox0 = s * x0; const ox1 = s * x1;
    const ix0 = s * Math.max(0, x0 - band); const ix1 = s * Math.max(0, x1 - band);
    P.add('turret', slab(
      [ox0, yInner - 0.045, z0], [ox1, yInner - 0.045, z1], [ix1, yInner - 0.045, z1], [ix0, yInner - 0.045, z0],
      [ox0, yOuter, z0], [ox1, yOuter, z1], [ix1, yInner, z1], [ix0, yInner, z0]));
  };
  for (const s of [-1, 1]) {
    if (!addOnFront) roofBevel(s, 0.35, 2.62, 1.08, 1.08);
    roofBevel(s, 1.08, 1.08, 1.18, -0.10);
    roofBevel(s, 1.18, -0.10, 1.14, -1.75);
    roofBevel(s, 1.14, -1.75, 0.48, -2.58, 0.718, 0.680, 0.05);
  }
  for (const [z, w, y] of [[1.08, 2.10, 0.715], [-0.10, 2.30, 0.705], [-1.75, 2.18, 0.705]]) {
    if (addOnFront && z > 1) continue;
    P.add('turretDark', box(w, 0.014, 0.032), 0, y, z);                       // embedded stage boundary, not a raised cage rail
  }
  return turretRoofLift;
  };
  const turretRoofLift = buildK2TurretLoft();
  const buildK2TurretNose = (): void => {
  // Cross-width nose stations carry the real K2 plan silhouette.  The
  // central spear, recessed inner cheek and secondary shoulder projection
  // cannot be represented by one averaged fore/aft loft line; these joined
  // wedges reproduce the measured front boundary while remaining a closed,
  // shaded armor mass from the low apex ledge back into the main shell.
  const nosePlan = [
    [0.00, 2.65], [0.38, 2.65], [0.50, 2.38], [0.63, 2.41],
    [0.78, 2.48], [1.03, 2.61], [1.18, 2.53], [1.32, 2.05],
    [1.46, 1.98], [1.60, 1.79],
  ];
  for (const s of [-1, 1]) for (let k = 0; k < nosePlan.length - 1; k++) {
    const [x0, z0] = nosePlan[k]; const [x1, z1] = nosePlan[k + 1];
    const spear = x0 < 0.50; const by = spear ? 0.07 : 0.02; const ty = spear ? 0.75 : 0.58;
    const fz0 = z0 - (s < 0 && x0 <= 0.50 ? 0.30 : 0);
    const fz1 = z1 - (s < 0 && x1 <= 0.50 ? 0.30 : 0);
    const topSetback = 0.28;
    P.add('turret', slab(
      [s * x0, by, fz0], [s * x1, by, fz1], [s * x1, by, 1.24], [s * x0, by, 1.24],
      [s * x0, ty + turretRoofLift - 0.10, fz0 - topSetback], [s * x1, ty + turretRoofLift - 0.10, fz1 - topSetback],
      [s * x1, ty + turretRoofLift - 0.10, 1.24], [s * x0, ty + turretRoofLift - 0.10, 1.24]));
  }
  };
  if (!addOnFront) buildK2TurretNose();
  const buildK2TurretSideArmor = (): void => {
  // Separate cheek armor is attached to the loft rather than being used as
  // its structural wall.  The left/right footprints are genuinely unequal
  // in Object_22, so retain that asymmetry and keep every inner face buried.
  for (const s of [-1, 1]) {
    const cheekOuter = s < 0 ? 1.57 : 1.60;
    const cheekFront = s < 0 ? 1.62 : 1.62;
    P.add('turret', slab(
      [s * 1.25, 0.02, 1.92], [s * cheekOuter, 0.04, cheekFront], [s * cheekOuter, 0.07, -0.22], [s * 1.40, 0.08, -0.22],
      [s * 1.20, 0.46, 1.28], [s * (cheekOuter - 0.08), 0.38, 0.84], [s * (cheekOuter - 0.08), 0.38, -0.22], [s * 1.36, 0.47, -0.22]));
    P.add('turretDark', box(0.025, 0.34, 0.72), s * (cheekOuter + 0.006), 0.28, 0.28);
    // Real cheek segmentation: three armor cassettes around a recessed KAPS
    // aperture.  Their seams break the smooth lozenge read at every yaw.
    for (const z of [0.02, 0.38, 0.74]) {
      P.add('turretDark', box(0.032, 0.34, 0.026), s * (cheekOuter + 0.010), 0.28, z);
    }
    P.add('turretDetail', box(0.035, 0.30, 0.28), s * (cheekOuter + 0.018), 0.29, 0.58);
    P.add('turretDark', box(0.040, 0.20, 0.20), s * (cheekOuter + 0.024), 0.29, 0.58);
    P.add('turretGlass', box(0.044, 0.10, 0.13), s * (cheekOuter + 0.028), 0.30, 0.58);
    P.add('turret', slab(                                                     // low outward-splayed shoulder around the compact mantlet
      [s * 1.36, 0.00, 1.76], [s * 1.60, 0.02, 1.58], [s * 1.60, 0.04, 0.28], [s * 1.43, 0.04, 0.28],
      [s * 1.34, 0.32, 1.40], [s * 1.54, 0.34, 1.18], [s * 1.54, 0.34, 0.28], [s * 1.42, 0.34, 0.28]));
    P.add('turretDark', box(0.032, 0.030, 0.88), s * 1.545, 0.34, 0.72);       // shoulder step seam
    // Compound inner transition beside the mantlet: two attached cassettes
    // step from the buried rotor into the lower cheek instead of leaving one
    // broad unarticulated triangle in the close-front comparison.
    P.add('turretDetail', slab(
      [s * 0.43, 0.08, 2.30], [s * 0.76, 0.06, 2.27], [s * 1.08, 0.06, 1.62], [s * 0.72, 0.08, 1.72],
      [s * 0.43, 0.35, 2.18], [s * 0.72, 0.34, 2.12], [s * 1.00, 0.31, 1.55], [s * 0.68, 0.34, 1.66]));
    P.add('turretDark', box(0.030, 0.25, 0.30), s * 0.73, 0.22, 1.88, 0, s * 0.42, 0);
    P.add('turret', box(0.18, 0.18, 0.20), s * 0.46, 0.20, 2.18, 0, s * 0.18, 0); // mantlet-side armored stop
    P.add('turret', slab(                                                     // deeper second cheek step, buried into both adjacent masses
      [s * 0.72, 0.08, 2.08], [s * 0.98, 0.06, 1.92], [s * 1.18, 0.07, 1.42], [s * 0.92, 0.08, 1.55],
      [s * 0.70, 0.43, 1.96], [s * 0.94, 0.41, 1.80], [s * 1.12, 0.38, 1.34], [s * 0.88, 0.41, 1.48]));
    P.add('turretDark', box(0.026, 0.28, 0.22), s * 0.96, 0.25, 1.68, 0, s * 0.38, 0);
    // Mantlet-side well measured in the close-front oracle: a dark recessed
    // plate inside a proud broken frame, followed by a lower triangular
    // relief cut.  All pieces sit behind the existing nose boundary, so they
    // add the missing depth hierarchy without inflating the silhouette.
    P.add('turretDark', box(0.24, 0.24, 0.035), s * 0.59, 0.245, 2.255, 0, s * 0.24, 0);
    P.add('turretDetail', box(0.035, 0.29, 0.045), s * 0.455, 0.245, 2.245, 0, s * 0.24, 0);
    P.add('turretDetail', box(0.16, 0.035, 0.045), s * 0.59, 0.385, 2.225, 0, s * 0.24, 0);
    P.add('turretDark', box(0.30, 0.085, 0.038), s * 0.83, 0.145, 1.825, 0, s * 0.40, -s * 0.10);
    for (const [dx, dy] of [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]]) {
      P.add('turretDetail', cylZ(0.014, 0.025, 8), s * (0.59 + dx), 0.245 + dy, 2.278);
    }
    // Asymmetric cheek equipment follows the oracle instead of mirroring a
    // generic empty plate: left is an optical well, right a shallow vented
    // service panel.  Both are flush to the existing swept face and remain
    // behind its measured plan boundary.
    P.add('turretDetail', box(0.26, 0.16, 0.045), s * 0.92, 0.34, 2.285,
      0, -s * 0.16, -s * 0.07);                                               // proud housing/frame
    const cheekBay = new THREE.PlaneGeometry(0.19, 0.095);
    cheekBay.rotateY(-s * 0.16); cheekBay.rotateZ(-s * 0.07);
    P.add('turretDark', cheekBay, s * 0.92, 0.34, 2.313);
    if (s < 0) {
      const cheekLens = new THREE.PlaneGeometry(0.100, 0.052);
      cheekLens.rotateY(-s * 0.16); cheekLens.rotateZ(-s * 0.07);
      P.add('turretGlass', cheekLens, s * 0.92, 0.345, 2.317);
      P.add('turretDetail', cylZ(0.016, 0.018, 8), s * 0.82, 0.385, 2.318);
    } else {
      for (let k = -1; k <= 1; k++) {
        const cheekSlat = new THREE.PlaneGeometry(0.155, 0.014);
        cheekSlat.rotateY(-s * 0.16); cheekSlat.rotateZ(-s * 0.07);
        P.add('turretDetail', cheekSlat, s * 0.92, 0.34 + k * 0.031, 2.317);
      }
    }
  }
  };
  if (!addOnFront) buildK2TurretSideArmor();
  const buildK2TurretCrown = (): void => {
  // A shallow crown follows Object_21's second roof component.  It is only
  // the center spine, never a turret-width cap.
  const roofSpine = [[-0.30, 0.675], [0.15, 0.705], [0.60, 0.690],
    [1.05, 0.675], [1.72, 0.700], [2.34, 0.680]];
  for (let k = 0; k < roofSpine.length - 1; k++) {
    const [za, ya] = roofSpine[k]; const [zb, yb] = roofSpine[k + 1];
    P.add('turret', slab(
      [-0.34, ya - 0.095, za], [0.44, ya - 0.095, za], [0.44, yb - 0.095, zb], [-0.34, yb - 0.095, zb],
      [-0.34, ya + turretRoofLift, za], [0.44, ya + turretRoofLift, za],
      [0.44, yb + turretRoofLift, zb], [-0.34, yb + turretRoofLift, zb]));
  }
  // Object_8 central brow, datum-normalized under the certified 2.40 m
  // broad-top law.  Plan bounds and fore/aft rake are measured verbatim;
  // only the vertical span is mapped into the allowed roof band.  The lower
  // face is buried in the nose loft, leaving a genuine mantlet-to-crown step
  // without promoting a broad patch into the P95 population.
  P.add('turret', slab(
    [-0.293, 0.600, 1.793], [0.407, 0.600, 1.793], [0.407, 0.600, 2.180], [-0.293, 0.600, 2.180],
    [-0.290, 0.704, 1.808], [0.403, 0.704, 1.808], [0.403, 0.738, 2.180], [-0.290, 0.738, 2.180]));
  P.add('turretDark', box(0.58, 0.016, 0.022), 0.0565, 0.727, 2.168);         // brow break inset from the measured side walls
  P.add('turretDark', box(0.155, 0.070, 0.018), -0.105, 0.673, 2.189);        // broken recessed face, left bay
  P.add('turretDark', box(0.118, 0.052, 0.018), 0.205, 0.681, 2.189);         // unequal right bay
  P.add('turretDetail', box(0.035, 0.105, 0.028), 0.055, 0.683, 2.188);       // central crown rib prevents a broad rectangular patch
  for (const x of [-0.205, 0.318]) {
    P.add('turretDetail', box(0.034, 0.105, 0.035), x, 0.683, 2.185);          // unequal side jambs articulate the inner-cheek transition
  }
  P.add('turretDetail', box(0.26, 0.025, 0.055), 0.095, 0.744, 1.985, 0, -0.08, 0); // shallow service lid on the raked crown
  for (const s of [-1, 1]) P.add('turret', slab(                              // small attached inner-cheek wedges below the brow
    [s * 0.10, 0.59, 2.175], [s * 0.25, 0.59, 2.175], [s * 0.34, 0.56, 1.96], [s * 0.16, 0.56, 1.96],
    [s * 0.10, 0.70, 2.160], [s * 0.25, 0.70, 2.160], [s * 0.32, 0.66, 1.96], [s * 0.16, 0.66, 1.96]));
  P.add('turret', cylY(1.02, 1.02, 0.18, P.q ? 24 : 14), 0, 0.06, 0);          // ring seat aligned to the measured 1.63 m underside
  P.add('turret', cylY(1.36, 1.30, 0.10, P.q ? 28 : 16), 0, 0.04, -0.06);      // buried interface collar breaks the long turret/hull seam
  P.add('turretDark', box(0.50, 0.34, 0.05), 0, 0.20, 2.34);                   // gun bay shadow wall behind the boot
  // KAPS/KSPAW radar plates riding the cheek planes (§B1.1 — flush by
  // construction via the plane param). Critic r1 RELIEF order: proud
  // frame, RECESSED dark panel inside it, corner studs — panel depth
  // reads instead of a decal.
  if (!addOnFront) for (const s of [-1, 1]) {
    cheekPanel(s, 0.16, 0.52, 0.24, 0.64, 0.052, 'turretDetail');              // KAPS frame (proud)
    cheekPanel(s, 0.205, 0.475, 0.295, 0.585, 0.028, 'turretDark');            // KAPS panel (recessed vs the frame)
    cheekPanel(s, 0.165, 0.205, 0.25, 0.63, 0.062, 'turretDetail');            // frame edge rib inner
    cheekPanel(s, 0.475, 0.515, 0.25, 0.63, 0.062, 'turretDetail');            // frame edge rib outer
    cheekPanel(s, 0.60, 0.82, 0.30, 0.58, 0.046, 'turretDetail');              // KSPAW frame
    cheekPanel(s, 0.635, 0.785, 0.34, 0.54, 0.024, 'turretDark');              // KSPAW panel (recessed)
  }
  };
  buildK2TurretCrown();
  const buildK2RoofSystems = (): void => {
  const buildK2RoofSensors = (): void => {
  // roof furniture — heightM p95 discipline (pub 2.40 = the sight plane):
  // broad tops ≤ 2.40 world (local 0.74) — batch-52b TIGHTENED from 2.42:
  // the ref surgery re-framed the shared gate camera and the p95 index
  // landed ON the 2.43-class KGPS cheek walls (heightM 2.41 -> 2.43, dims
  // 100 -> 98.9); the broad band now sits AT the published sight-plane
  // datum so no body-population shift can lift the p95 off it. The ONLY
  // spikes stay the pano head (2 cols, 2.77) + crosswind mast (2.39 —
  // off-budget). K6 rides a LOW right-wall swing mount (type90_kyumaru height-law
  // precedent), FORWARD (§5.07 CROWS-FORWARD). Whips carried FOLDED (stub
  // bases) for the same datum.
  // KGPS gunner sight — a real HOODED housing (critic r1: mass, not flush
  // glass), every top ≤2.40: main house + side cheeks + visor overhang +
  // deep dark cavity behind the recessed angled window.
  // Object_21 component: x .550..1.180, local z .917..1.359.  The previous
  // box was 0.3 m too far inboard/forward and visually merged with the gun.
  P.addEquipment('turret', box(0.63, 0.10, 0.44), 0.865, 0.69, 1.138);         // KGPS housing right-front
  P.add('turret', box(0.07, 0.10, 0.40), 0.56, 0.69, 1.138);                   // left cheek wall
  P.add('turret', box(0.07, 0.10, 0.40), 1.17, 0.69, 1.138);                   // right cheek wall
  // (K2B, r269s3: the lid 3 mm and the visor 2 mm over the housing's and cheek walls' 0.74 top, the lid over the visor;
  // all four tops met in one plane, the "ghost patch" left of the gun)
  const browLift = addOnFront ? 0.003 : 0, visorLift = addOnFront ? 0.002 : 0;
  P.add('turretDetail', box(0.65, 0.019, 0.40), 0.865, 0.7305 + browLift, 1.13); // brow lid
  P.add('turretDetail', box(0.64, 0.028, 0.14), 0.865, 0.726 + visorLift, 1.34); // visor overhang
  P.add('turretDark', box(0.48, 0.095, 0.045), 0.865, 0.6875, 1.36);           // cavity back panel
  P.add('turretGlass', box(0.34, 0.065, 0.014), 0.865, 0.687, 1.385, -0.22, 0, 0); // recessed angled glass
  // KAPS/MWR roof equipment, read as mounted assemblies rather than painted
  // marks: low plinth -> armored housing -> recessed optic.  The paired heads
  // are intentionally asymmetric in plan, following the reference roof.
  for (const [s, x, z] of [[-1, -1.00, 0.72], [1, 1.04, 0.42]]) {
    P.add('turret', box(0.32, 0.045, 0.38), x, 0.675, z);
    P.add('turretDetail', box(0.25, 0.09, 0.28), x, 0.710, z - 0.01, 0, s * 0.18, 0);
    P.add('turretDark', box(0.18, 0.055, 0.025), x + s * 0.015, 0.715, z + 0.145, 0, s * 0.18, 0);
    P.add('turretGlass', box(0.10, 0.040, 0.014), x + s * 0.015, 0.720, z + 0.160, 0, s * 0.18, 0);
  }
  // Object_22's two asymmetric roof optics, mapped from the connected top
  // sheets into the builder frame.  Low attached housings and three-block
  // periscope brows reproduce the missing left-high/right-low hierarchy.
  for (const [x, z, w, d, y, yaw] of [
    [-0.6955, 0.435, 0.313, 0.310, 0.690, -0.12],
    [0.7850, 0.473, 0.313, 0.462, 0.665, 0.10],
  ]) {
    P.add('turret', box(w, 0.075, d), x, y, z, 0, yaw, 0);
    P.add('turretDark', box(w * 0.74, 0.052, 0.024), x, y + 0.012, z + d * 0.48, 0, yaw, 0);
    for (const dx of [-0.085, 0, 0.085]) P.add('turretGlass', box(0.055, 0.035, 0.014), x + dx, y + 0.025, z + d * 0.50, 0, yaw, 0);
  }
  // Longitudinal grab rails and their four feet are visibly bolted into the
  // bustle roof, closing the sparse empty strip seen in the R1 top board.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.035, 1.35), s * 1.10, 0.735, -0.78);
    for (const z of [-1.30, -0.72, -0.18]) P.add('turretDetail', box(0.07, 0.055, 0.07), s * 1.10, 0.705, z);
    // Object_21 top census: two outer plates at x 1.004..1.527, split at
    // local z -0.88.  Top-only surfaces preserve that exact plan hierarchy
    // without turning a thin lid into a false side-wall silhouette.
    for (const [z, d] of [[-0.4705, 0.785], [-1.2385, 0.717]]) {
      const sidePlate = new THREE.PlaneGeometry(0.50, d);
      sidePlate.rotateX(-Math.PI / 2);
      P.add('turret', sidePlate, s * 1.2655, 0.689, z);
      for (const dx of [-0.24, 0.24]) {
        const sideSeam = new THREE.PlaneGeometry(0.018, d - 0.03);
        sideSeam.rotateX(-Math.PI / 2);
        P.add('turretDark', sideSeam, s * (1.2655 + dx), 0.692, z);
      }
      for (const dz of [-d / 2 + 0.015, d / 2 - 0.015]) {
        const endSeam = new THREE.PlaneGeometry(0.48, 0.018);
        endSeam.rotateX(-Math.PI / 2);
        P.add('turretDark', endSeam, s * 1.2655, 0.692 + k2bSeam, z + dz);     // (K2B: over the side seams it crosses)
      }
    }
  }
  };
  buildK2RoofSensors();
  const buildK2RoofStations = (): void => {
  // Two real roof stations.  The broad commander cupola is on the left-rear
  // roof in the reference top view; the smaller gunner hatch is offset right.
  // Both overlap the loft by 20 mm so their contact shadows cannot float.
  const commanderX = -0.65; const commanderZ = -0.60;
  const gunnerX = 0.65; const gunnerZ = -0.60;
  P.add('turret', cylY(0.18, 0.18, 0.12, 20), commanderX, 0.670, commanderZ);   // Object_10 left raised station, measured 0.35 m footprint
  P.add('turretDark', torus(0.18, 0.008, 20), commanderX, 0.735, commanderZ);
  for (let k = 0; k < 6; k++) {                                                // episcope ring
    const a = (k / 6) * Math.PI * 2;
    P.add('turretDark', box(0.060, 0.045, 0.026), commanderX + Math.cos(a) * 0.145, 0.728,
      commanderZ + Math.sin(a) * 0.145, 0, -a, 0);
  }
  P.add('turret', cylY(0.18, 0.18, 0.12, 18), gunnerX, 0.670, gunnerZ);         // Object_10 right raised station
  P.add('turretDark', torus(0.18, 0.008, 18), gunnerX, 0.735, gunnerZ);
  P.add('turretDark', box(0.27, 0.014, 0.030), gunnerX, 0.741, gunnerZ);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    P.add('turretDark', box(0.052, 0.040, 0.024), gunnerX + Math.cos(a) * 0.145, 0.726,
      gunnerZ + Math.sin(a) * 0.145, 0, -a, 0);
  }
  // Object_15 consists of four thin, separate roof blocks—two fore/aft on
  // each crew station—not another circular coaming.  Their exact plan
  // bounds are normalized only in y and add the missing close-roof cadence.
  for (const [x, z] of [
    [-0.7375, -0.9705 + 0.30], [-0.7375, -0.8235 + 0.30],
    [0.7320, -0.9710 + 0.30], [0.7320, -0.8245 + 0.30],
  ]) {
    P.add('turretDetail', box(0.230, 0.026, 0.103), x, 0.750, z);
    P.add('turretDark', box(0.170, 0.012, 0.050), x, 0.767, z);
  }
  for (const [x, z, ry] of [[0.30, -0.55, 0.5], [0.46, -0.42, 0.15], [0.68, -0.46, -0.35]]) {
    periscope(P, 'turretDetail', x, 0.720, z, ry);
  }
  // Object_21/Object_10 roof census: the K2 roof is a hierarchy of large
  // outlined blow-off panels and one transverse equipment frame, not a bare
  // lozenge. Hairline physical bars preserve that hierarchy at every yaw.
  for (const x of [-0.98, 0.98]) P.add('turretDark', box(0.026, 0.018, 1.58), x, 0.745, -0.844);
  for (const z of [-1.634, -0.054]) P.add('turretDark', box(1.96, 0.018, 0.026), 0, 0.745 + k2bSeam, z);
  P.add('turretDark', box(0.026, 0.018, 1.50), 0, 0.747, -0.83);               // magazine divider
  for (const z of [-0.845, -0.355]) P.add('turretDetail', box(1.65, 0.020, 0.04), 0, 0.745, z);
  for (const x of [-0.825, 0.825]) P.add('turretDetail', box(0.04, 0.020, 0.49), x, 0.745 + k2bSeam, -0.60);
  P.addEquipment('turret', box(0.32, 0.07, 0.10), 0.08, 0.70, -0.60, 0, 0.10, 0);       // low transverse control/weapon receiver
  P.add('turretDark', box(0.24, 0.040, 0.012), 0.08, 0.705, -0.546, 0, 0.10, 0);
  P.add('turretDetail', box(0.24, 0.025, 0.07), commanderX, 0.745, commanderZ, 0, 0, 0.25); // commander-hatch handle
  P.add('turretDetail', box(0.20, 0.022, 0.07), gunnerX, 0.751, gunnerZ, 0, 0, -0.22); // gunner-hatch handle
  // Object_21 connected-component census, in builder-local coordinates:
  // two equal 0.632 × 1.115 m panels at x ±0.530, z -0.883, their top
  // on the oracle's 2.382 m plane before the runtime's safe-scale. Model the
  // lids and their perimeter seams as
  // physical geometry; the discarded guessed 0.72×0.48 / 0.54×0.42 lids
  // did not correspond to any oracle component.
  for (const x of [-0.530, 0.530]) {
    P.add('turret', box(0.632, 0.018, 1.115), x, 0.713, -0.8825);
    for (const dx of [-0.306, 0.306]) P.add('turretDark', box(0.020, 0.010, 1.075), x + dx, 0.727, -0.8825);
    for (const dz of [-0.5375, 0.5375]) P.add('turretDark', box(0.612, 0.010, 0.020), x, 0.727 + k2bSeam, -0.8825 + dz);
    for (const [dx, dz, yaw] of [[-0.18, -0.30, -0.18], [0.17, 0.22, 0.16]]) {
      P.add('turretDetail', box(0.095, 0.018, 0.030), x + dx, 0.738, -0.8825 + dz, 0, yaw, 0); // unequal lid latches
    }
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.14, 0.18, 0.12), s * 1.38, 0.46, 1.30, 0, s * 0.18, 0);
    P.add('turretDark', box(0.10, 0.12, 0.014), s * 1.38, 0.47, 1.365, 0, s * 0.18, 0);
    P.add('turretGlass', box(0.065, 0.070, 0.010), s * 1.38, 0.48, 1.373, 0, s * 0.18, 0);
  }
  // Object_20 KCPS body: x -.854..-.419, local z .876..1.296.  Consolidate
  // the old doubled 0.88 m berth/head stack into this single measured body.
  P.add('turret', box(0.435, 0.10, 0.420), -0.6365, 0.69, 1.086);              // KCPS berth housing
  P.add('turretDark', box(0.34, 0.045, 0.09), -0.6365, 0.705, 0.895);          // rear relief notch
  P.add('turretDetail', cylY(0.12, 0.14, 0.11, 12), -0.6365, 0.680, 1.086);
  P.add('turret', box(0.36, 0.14, 0.24), -0.6365, 0.670, 1.086, 0, -0.10, 0);
  P.add('turretDetail', box(0.38, 0.025, 0.26), -0.6365, 0.728, 1.086, 0, -0.10, 0);
  P.add('turretDark', box(0.28, 0.075, 0.018), -0.6365, 0.690, 1.210, 0, -0.10, 0);
  P.add('turretGlass', box(0.18, 0.050, 0.012), -0.6365, 0.693, 1.220, 0, -0.10, 0);
  P.add('turretDark', cylZ(0.028, 0.014, 10), -0.560, 0.695, 1.226);
  P.add('turretDetail', cylY(0.030, 0.035, 0.15, 10), -0.62, 0.630, 0.55);      // discrete KCPS pedestal
  P.addEquipment('turret', box(0.24, 0.16, 0.025), -0.62, 0.695, 0.55, 0, -0.10, 0);   // one-column raised sensor blade
  P.add('turretDetail', box(0.26, 0.018, 0.030), -0.62, 0.784, 0.55, 0, -0.10, 0);
  P.add('turretDark', box(0.17, 0.105, 0.008), -0.62, 0.695, 0.565, 0, -0.10, 0);
  P.add('turretGlass', box(0.11, 0.080, 0.006), -0.62, 0.702, 0.570, 0, -0.10, 0);
  P.add('turretDetail', box(0.08, 0.06, 0.08), 0.02, 0.67, -1.55);             // crosswind mast base
  P.add('turretDetail', cylY(0.016, 0.022, 0.17, 8), 0.02, 0.645, -1.55);      // mast stub (top 2.39 — off the spike budget)
  P.add('turretDark', box(0.05, 0.045, 0.05), 0.02, 0.7325, -1.62);            // base sensor box
  // blow-off panel seams over the bustle magazine
  P.add('turretDark', box(0.92, 0.012, 0.70), 0, 0.647, -1.35);
  P.add('turretDark', box(0.94, 0.012, 0.03), 0, 0.653, -1.02);
  P.add('turretDark', box(0.03, 0.012, 0.70), 0.46, 0.653, -1.35);
  P.add('turretDark', box(0.03, 0.012, 0.70), -0.46, 0.653, -1.35);
  // 267: the flat armoured roof deck the lids, stations and receiver stand on (x ±1.05, z -0.15..-1.80, ending where
  // the bustle falls away). The lids hovered 6 cm over the loft's falling roof skin, wells the K2B's PL-01 overlay had
  // hidden; this is the K2B's turret alone (the XK2 builds hullOnly).
  P.add('turret', box(2.10, 0.06, 1.65), 0, 0.675, -0.975);
  // r268b (owner 2026-11-02: "add more ... roof details"): the turret's four lifting eyes on that deck's corners, inside
  // the panel rails and clear of the stations, the whips (x 1.00) and the antenna pair (x 0.79, z -1.72)
  for (const [x, z] of [[-0.88, -0.24], [0.88, -0.24], [-0.60, -1.60], [0.60, -1.60]] as const) {
    liftEye(P, 'turretDetail', x, 0.715, z);
  }
  };
  buildK2RoofStations();
  const buildK2RoofComms = (): void => {
  {
    // Object_18 is not a guessed transverse cupola gun.  Its connected-sheet
    // census is a thin LONGITUDINAL assembly seated over the left-front KCPS
    // berth: two collinear rails, a transverse receiver, and a short rear
    // cap.  Preserve the measured x/z bounds and normalize only y into the
    // certified roof datum, exactly as the Leclerc method handles tall source
    // sheets.  This removes the false rear-cupola silhouette from every yaw.
    P.add('turretDark', box(0.073, 0.022, 1.008), -0.7405, 0.747, 1.607);      // forward longitudinal rail
    P.add('turretDark', box(0.092, 0.024, 0.576), -0.7400, 0.746, 0.816);      // rear longitudinal rail
    P.addEquipment('turret', box(0.240, 0.030, 0.119), -0.5480, 0.744, 1.0025);         // cross-body receiver
    P.add('turretDetail', box(0.144, 0.026, 0.069), -0.7400, 0.746, 0.4935);   // measured rear cap
    P.add('turretDetail', box(0.045, 0.030, 0.095), -0.7400, 0.744, 1.082);    // rail/receiver collar
    P.addEquipment('turret', cylY(0.052, 0.058, 0.055, 12), -0.740, 0.749, 1.108);      // rounded pivot over the receiver joint
    P.add('turretDark', box(0.115, 0.048, 0.025), -0.548, 0.748, 1.066);       // recessed receiver face
    P.add('turretGlass', box(0.052, 0.032, 0.014), -0.548, 0.750, 1.080);      // small forward sensor window
    // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the sub-visible census marker that sat inside this
    // measured receiver is gone; the K2's roof gun is the loader's K6 on its working station.
    // antenna mounts FOLDED (heightM p95 law: the pano head + mast own the
    // whole spike budget) — base drums + rods CLIPPED FLAT to the roof
    // (critic r1: the pitched floating rods read as sail fins).
    for (const s of [-1, 1]) {
      P.add('turretDark', cylY(0.035, 0.045, 0.07, 10), s * 1.30, 0.675, -1.97); // whip base drum
      P.add('turretDark', box(0.020, 0.020, 0.60), s * 1.24, 0.657, -1.70, 0.015, s * 0.30, 0); // whip rod lying on the roof (dark, FSP-06)
      P.add('turretDetail', box(0.05, 0.028, 0.03), s * 1.16, 0.655, -1.48, 0, s * 0.30, 0); // retaining clip
      P.add('turretDetail', box(0.05, 0.028, 0.03), s * 1.06, 0.655, -1.18, 0, s * 0.30, 0);
    }
    // Object25's unmistakable asymmetric live antenna pair. The lower rods
    // carry the measured side-profile endpoints (3.87/3.62 m); hairline
    // upper continuations preserve the shared 4.58 m front datum without
    // falsely turning two whips into a broad p95 roof-height population.
    for (const [s, z, lowerH] of [[-1, -1.72, 1.47], [1, -1.72, 1.22]]) {
      const upperH = 2.22 - lowerH;
      P.add('turretDark', cylY(0.025, 0.030, 0.10, 10), s * 0.79, 0.74, z);
      P.add('turretDetail', antennaPart(box(0.014, lowerH, 0.012)), s * 0.79, 0.74 + lowerH / 2, z);
      P.add('turretDetail', antennaPart(box(0.014, upperH, 0.012)), s * 0.79, 0.74 + lowerH + upperH / 2, z);
    }
  }
  };
  buildK2RoofComms();
  };
  buildK2RoofSystems();
  const buildK2Bustle = (): void => {
  // Welded bustle baskets: two side cages converge into one full-width rear
  // rack.  Every rail terminates on either the solid loft or another rail;
  // the rejected r3's isolated diagonal cards and zero-thickness extensions
  // are deliberately gone.
  const buildK2BustleFrame = (): void => {
    // Layered armored bustle terminus.  The rack is attached to this wall;
    // it is not asked to impersonate the turret's rear volume.
    P.add('turret', box(1.90, 0.30, 0.18), 0, 0.29, -2.05);                   // low armored shoulder behind the central shell
    P.add('turret', box(0.36, 0.30, 0.18), -1.13, 0.29, -2.08);               // longer left bustle shoulder
    P.add('turret', box(0.36, 0.30, 0.28), 1.13, 0.29, -1.81);                // shorter right bustle shoulder
    P.add('turret', box(1.90, 0.28, 0.18), 0, 0.30, -2.05);                   // low central autoloader body, ending ahead of the cage
    P.add('turretDetail', box(1.90, 0.08, 0.28), 0, 0.14, -2.08);             // forward basket floor at the 1.76 m underside
    P.add('turretDetail', openRackGrid(1.80, 0.40, 0.022, 4, 8), 0, 0.10, -2.82); // open aft floor, edge -3.02 under the tube rack
    const topReel = new THREE.RingGeometry(0.285, 0.355, P.q ? 28 : 18);      // Object_21 left-rear basket reel
    topReel.rotateX(-Math.PI / 2);
    P.add('turretDetail', topReel, -1.098, 0.735, -2.218);
    P.add('turretDark', torus(0.320, 0.035, P.q ? 28 : 18), -1.098, 0.700, -2.218); // physical cable depth, top held at datum (coiled cable: dark, FSP-06)
    P.add('turretDark', cylY(0.045, 0.055, 0.060, 12), -1.098, 0.705, -2.218); // reel axle/hub
    for (const a of [0, Math.PI / 2]) {
      const topSpoke = new THREE.PlaneGeometry(0.62, 0.025);
      topSpoke.rotateX(-Math.PI / 2);
      topSpoke.rotateY(a);
      P.add('turretDark', topSpoke, -1.098, 0.738 + (a > 0 ? 2 : 1) * k2bSeam, -2.218); // (K2B: over the straps' 0.738 tops, apart)
    }
    P.add('turret', box(1.90, 0.04, 0.24), 0, 0.620, -2.05);                  // low armored core roof, clear of the stand-off cage
  };
  buildK2BustleFrame();
  const buildK2BustleCages = (): void => {
    const buildK2BustleCage = (cx: number, w: number, skew: number): void => {
      // Asymmetric stand-off cage: open air is visible between its tubes and
      // the lower armored core.  The left magazine rack is measurably wider.
      const rearZ = cx < 0 ? -2.60 : -2.30;
      const railYs = cx < 0 ? [0.24, 0.41, 0.60] : [0.24, 0.39, 0.55];
      for (const y of railYs) P.add('turretDetail', cylX(0.028, w, P.q ? 14 : 10), cx, y, rearZ);
      for (const x of [cx - w / 2, cx, cx + w / 2]) {
        const postH = cx < 0 ? 0.48 : 0.43; const postY = cx < 0 ? 0.44 : 0.405;
        P.add('turretDetail', cylY(0.028, 0.028, postH, P.q ? 14 : 10), x, postY, rearZ); // staggered round cage post
        for (const y of [0.25, 0.57]) P.add('turretDetail', box(0.050, 0.050, 0.12), x, y, rearZ + 0.06);
      }
      const braceLen = Math.hypot(w, 0.34); const braceA = Math.atan2(0.34, w);
      P.add('turretDetail', box(braceLen, 0.032, 0.032), cx, 0.41, rearZ + 0.045, 0, 0, braceA);
      P.add('turretDetail', box(braceLen, 0.032, 0.032), cx, 0.41, rearZ + 0.050, 0, 0, -braceA);
      P.add('turretCloth', box(w * 0.48, 0.14, 0.15), cx + skew, 0.34, rearZ + 0.02, 0.08, skew, 0);
      // Rolled end packs give the filled cage real rounded depth while their
      // rear tangent remains inside the already certified cage envelope.
      P.add('turretCloth', cylX(cx < 0 ? 0.112 : 0.092, w * 0.66, P.q ? 16 : 10),
        cx + skew * 0.4, 0.43, rearZ + 0.075);
      P.add('turretDark', box(w * 0.46, 0.026, 0.030), cx + skew * 0.4, 0.43, rearZ - 0.030); // roll retaining strap
      P.add('turretDetail', box(0.12, 0.10, 0.06), cx + w * 0.38, 0.23, rearZ); // rear lamp/connector housing
    };
    for (const [cx, w, skew] of [[-1.08, 0.84, -0.10], [0.99, 0.62, 0.08]] as const) {
      buildK2BustleCage(cx, w, skew);
    }
  };
  buildK2BustleCages();
  const buildK2BustleLoads = (): void => {
    // The print's dominant rear read is two large, rounded soft packs—not a
    // wall of small flat parcels.  Like the Leclerc graduate's bounded rack
    // loads, both cylinders remain wholly inside the existing cage AABB and
    // leave a deliberate center/right service gap.  Rear-facing straps make
    // the different diameters and offsets legible without adding depth.
    const rearSoftPacks: ReadonlyArray<readonly [
      number, number, number, number, number, readonly number[],
    ]> = [
      [-0.86, 0.39, -2.475, 0.245, 0.76, [-1.04, -0.70]],
      [0.25, 0.38, -2.500, 0.215, 0.64, [0.10, 0.40]],
    ];
    for (const [x, y, z, r, len, strapXs] of rearSoftPacks) {
      P.add('turretCloth', cylX(r, len, P.q ? 20 : 12), x, y, z);
      for (const sx of strapXs) {
        const strap = new THREE.PlaneGeometry(0.030, r * 1.72);
        strap.rotateY(Math.PI);
        P.add('turretDark', strap, sx, y, z - r - 0.002);
      }
    }
    // Rear-facing, zero-depth load faces occupy the oracle's dense baskets
    // without changing the already certified side envelope.  The cage rails
    // and these varied packs overlap, so the assembly reads wrapped/filled
    // in dead rear rather than as an empty wire rectangle.
    for (const [x, y, z, w, h] of [
      [-1.40, 0.35, -2.646, 0.16, 0.15], [0.66, 0.35, -2.646, 0.18, 0.14],
      [0.98, 0.35, -2.346, 0.27, 0.17],
    ]) {
      P.add('turretCloth', box(w, h, 0.040), x, y, z + 0.018);                // shallow honest volume stays inside the cage envelope
      const strap = new THREE.PlaneGeometry(0.025, h * 0.92);
      strap.rotateY(Math.PI);
      P.add('turretDark', strap, x + w * 0.17, y, z - 0.003);
    }
  };
  buildK2BustleLoads();
  const buildK2BustleHardware = (): void => {
    const buildK2BustleCorner = (s: number, x: number, z: number): void => {
      for (const a of [-0.62, 0.62]) {
        const cornerRail = new THREE.PlaneGeometry(0.44, 0.030);
        cornerRail.rotateY(Math.PI);
        cornerRail.rotateZ(s * a);
        P.add('turretDetail', cornerRail, x, 0.41, z - 0.004 - (a > 0 ? k2bSeam : 0));
      }
      const reelOuter = s < 0 ? 0.130 : 0.066;
      const reelInner = s < 0 ? 0.090 : 0.044;
      const cableReel = new THREE.RingGeometry(reelInner, reelOuter, P.q ? 20 : 14);
      cableReel.rotateY(Math.PI);
      P.add('turretDetail', cableReel, x - s * 0.02, 0.42, z - 0.006);
      P.add('turretDark', xform(torus(s < 0 ? 0.112 : 0.054, s < 0 ? 0.022 : 0.014, P.q ? 20 : 14),   // coiled cable (dark, FSP-06)
        0, 0, 0, Math.PI / 2, 0, 0), x - s * 0.02, 0.42, z - 0.020);           // asymmetric physical rear reel depth
      P.add('turretDark', cylZ(s < 0 ? 0.022 : 0.014, 0.060, 10), x - s * 0.02, 0.42, z - 0.028);
      for (const a of [-0.78, 0.78]) {
        const spoke = new THREE.PlaneGeometry(s < 0 ? 0.22 : 0.11, 0.022);
        spoke.rotateY(Math.PI);
        spoke.rotateZ(a);
        P.add('turretDark', spoke, x - s * 0.02, 0.42, z - 0.009);
      }
    };
    for (const [s, x, z] of [[-1, -1.36, -2.649], [1, 1.23, -2.349]] as const) {
      buildK2BustleCorner(s, x, z);
    }
    P.add('turret', box(1.80, 0.060, 0.12), 0, 0.24, -2.60);                  // low center crossbar ties the corner baskets
    for (const [x, w] of [[-0.63, 0.46], [0, 0.20], [0.63, 0.46]]) {
      P.add('turretDetail', box(w, 0.045, 0.10), x, 0.58, -2.60);              // low broken upper rim: corner-wrapped, never one rectangular rail
    }
    for (const y of [0.24, 0.58]) {
      P.add('turretDetail', box(0.055, 0.055, 0.48), -1.18, y, -2.36);         // left stand-off longitudinal tie
      P.add('turretDetail', box(0.055, 0.055, 0.30), 1.18, y, -2.21);          // shorter right tie preserves plan asymmetry
    }
  };
  buildK2BustleHardware();
  const finishK2Bustle = (): void => {
    // Measured dominant left-rear Object_21 component: perimeter and two
    // unequal straps reproduce its exact plan subdivision while leaving the
    // basket center open.  All lines remain beneath the existing roof datum.
    for (const x of [-1.497, -0.699]) P.add('turretDetail', box(0.026, 0.020, 0.72), x, 0.718, -2.218);
    for (const z of [-2.617, -1.819]) P.add('turretDetail', box(0.80, 0.020, 0.026), -1.098, 0.718, z);
    for (const [x, yaw] of [[-1.25, -0.12], [-0.92, 0.10]]) {
      P.add('turretDark', box(0.030, 0.018, 0.68), x, 0.729, -2.218, 0, yaw, 0);
    }
    for (const s of [-1, 1]) P.add('turretDark', box(0.52, 0.035, 0.045), s * 1.03, 0.41, -2.61, 0, 0, -s * 0.55); // canted corner brace
    for (const s of [-1, 1]) {
      const rackX = s > 0 ? 1.43 : 1.54;                                      // right rack stays inside the short cheek module
      // (K2B, r269s3: the left rails run 3 mm past their end posts, whose faces they shared)
      const rackLen = s > 0 ? 0.50 : 0.88 + (addOnFront ? 0.006 : 0); const rackZ = s > 0 ? -1.70 : -1.90;
      for (const y of [0.20, 0.54]) P.add('turretDetail', box(0.045, 0.045, rackLen), s * rackX, y, rackZ);
      for (const z of (s > 0 ? [-1.48, -1.70, -1.92] : [-1.48, -1.76, -2.04, -2.32])) P.add('turretDetail', box(0.04, 0.34, 0.04), s * rackX, 0.37, z);
      stowage(P, 'turretCloth', rng, [[s * (rackX - 0.09), 0.35, -1.92, 0.10, 0.15, 0.38]]);
    }
    P.add('turretDetail', openRackGrid(2.50, 0.32, 0.026, 4, 10), 0, 0.22, -2.18); // open outer floor tied into shell
    stowage(P, 'turretCloth', rng, [
      [-0.58, 0.40, -2.18, 0.52, 0.20, 0.22], [0.42, 0.38, -2.18, 0.50, 0.18, 0.22],
    ]);
    // Smaller offset parcels overlap the rounded rolls instead of boxing in
    // their silhouette.  This call remains last in the K2 RNG stream.
    stowage(P, 'turretCloth', rng, [
      [-0.94, 0.50, -2.45, 0.22, 0.10, 0.14], [0.34, 0.47, -2.48, 0.18, 0.09, 0.12],
    ]);
  };
  finishK2Bustle();
  if (addOnFront) {
    // r268b: on the K2B the right-hand cans ride the tops of its bolted cheek-pod armour boxes (korea.ts addK2BCheekPod,
    // top 0.42, outer face 1.77), 5 mm into them
    ammoCan(P, 'turretDark', -1.64, 0.515, 0.21, 0);
    ammoCan(P, 'turretDark', -1.64, 0.515, -0.19, 0);
  } else {
    ammoCan(P, 'turretDark', -1.50, 0.50, 0.30, 0.15);
    ammoCan(P, 'turretDark', -1.50, 0.50, 0.64, -0.12);
  }
  };
  buildK2Bustle();
  const buildK2SmokeBanks = (): void => {
  // twin 6-tube smoke banks seated ON the module tops with base plates
  // (critic r1: the wall-buried banks vanished) — hard outboard yaw keeps
  // every tube ≤ |x| 1.61 (run-A receipt: tubes at ±1.77 paid −7 on
  // front_whole against the ref's 1.4-1.7 fender lane).
  for (const s of [-1, 1]) {
    P.add('turret', box(0.20, 0.03, 0.46), s * 1.36, 0.345, 0.98, 0, s * 0.28, -s * 0.22); // lower, broader bank base follows cheek fall
    smokeCluster(P, s * 1.34, 0.36, 0.98, 6, s * 0.78, 0.54);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const sy = 0.205 - col * 0.036 + row * 0.105 + (row ? [0.012, -0.006, 0.016][col] : [-0.008, 0.010, -0.012][col]);
      const sx = 1.10 + col * 0.10 + (row ? 0.028 : -0.012);
      const sz = 2.315 - col * 0.038;
      const seatZ = sz - 0.018 + (row ? -0.010 : 0.012) + (col - 1) * 0.006;
      P.add('turretDark', cylZ(0.050, 0.034, 10), s * sx, sy, sz - 0.002,
        0, s * (0.06 + col * 0.018), -s * (0.17 + row * 0.035 - col * 0.012)); // proud individual socket collar
      P.add('turret', box(0.080, 0.066, 0.070), s * sx, sy, seatZ,
        0, s * (0.06 + col * 0.018), -s * (0.17 + row * 0.035 - col * 0.012)); // individually angled saddle
      P.add('turretDetail', cylZ(0.045, 0.085, 10), s * sx, sy, sz + 0.020,
        0, s * (0.06 + col * 0.018), -s * (0.17 + row * 0.035 - col * 0.012));
      P.add('turretDark', cylZ(0.031, 0.090, 10), s * sx, sy, sz + 0.060,
        0, s * (0.06 + col * 0.018), -s * (0.17 + row * 0.035 - col * 0.012));
    }
  }
  };
  if (!addOnFront) buildK2SmokeBanks();                                        // the K2B's add-on cheek modules carry their own banks (korea.ts)
  const buildK2Weapon = (): void => {
  // gun (§B3.1, no prisms): the print's BIG mantlet (±0.42, rising over the
  // tube line) + boot at the bay, CN08 L/55 — sleeve + clamp rings, evac
  // drum in the print's fat zone, MRS collar. Muzzle +6.95 world = 10.70
  // overall (inside the 1% dims grace vs the print's −3% bind).
  P.addGunExtra(box(0.52, 0.30, 0.24), 0, 0.00, 0.22);                         // compact armored rotor housing
  P.addGunExtra(slab(                                                          // raked mantlet top cover
    [-0.26, 0.15, 0.12], [0.26, 0.15, 0.12], [0.26, 0.15, 0.46], [-0.26, 0.15, 0.46],
    [-0.26, 0.25, 0.08], [0.26, 0.25, 0.08], [0.26, 0.23, 0.46], [-0.26, 0.23, 0.46]), 0, 0, 0);
  P.addGunExtra(box(0.44, 0.08, 0.28), 0, -0.14, 0.29);                        // shaped chin step
  P.addGunExtraDark(box(0.62, 0.32, 0.055), 0, 0, 0.08);                      // recessed aperture behind the boot
  for (const s of [-1, 1]) {
    P.addGunExtra(box(0.070, 0.34, 0.075), s * 0.305, 0.015, 0.13);            // attached mantlet side flange
    P.addGunExtraDark(box(0.028, 0.24, 0.082), s * 0.260, -0.015, 0.145);      // nested shadow step beside the boot
  }
  P.addGunExtraDark(scaledGeometryTransform(cylZ(0.19, 0.26, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1, 1.10, 1]), 0, 0, 0.48); // canvas boot mass
  for (const z of [0.39, 0.48, 0.57]) P.addGunExtraDark(cylZ(0.198, 0.022, P.q ? 20 : 12), 0, 0, z);
  P.addGunExtra(cylZ(0.135, 0.24, P.q ? 20 : 12, 0.17), 0, 0, 0.75);            // barrel throat collar
  // Batch-56 CN08 section census. The tube is 15 mm left of center and its
  // round thermal jacket occupies two measured intervals without the generic
  // shared sleeve flooding adjacent silhouette columns.
  const k2GunLen = 5.528;
  buildGun(P, { len: k2GunLen, r: 0.09, sleeve: false, evac: null, collar: false, baseR: 0.17 });
  // 267 round 4: the two 1 m rods that stood 0.21 m either side of the tube (z 1.10-2.10, 0.23 m ahead of the throat
  // collar, joined to nothing) are gone; over the glacis they read as a loose stick (both critics, K2B).
  for (const [f0, f1] of [[0.16, 0.38], [0.38, 0.43], [0.52, 0.82]]) {
    const length = (f1 - f0) * k2GunLen;
    const root = f0 < 0.2;
    const y = root ? 0.02 : -0.025;
    P.add('gun', cylZ(0.09, length, P.q ? 16 : 10), 0, y, f0 * k2GunLen + length / 2);
    P.add('gunDark', cylZ(0.095, 0.045, P.q ? 16 : 10),
      0, y, f0 * k2GunLen + 0.0225);
  }
  P.add('gun', cylZ(0.11, 0.72, P.q ? 20 : 12), 0, -0.025, 0.51 * k2GunLen);
  P.add('gunDark', cylZ(0.115, 0.07, P.q ? 16 : 10), 0, -0.025, 0.51 * k2GunLen);
  P.recoilG.position.x = -0.015;
  P.addGunExtraDark(cylZ(0.02, 0.09, P.q ? 20 : 12), -0.015, 0, 4.978);
  // §B3.1 MUZZLE BORE: capped tube ends 5.528; the bored face holds the
  // 5.57 muzzle line (+6.99 world = 10.74 overall — r2 read the 6.95 line
  // at 10.68/1.13% via column quantization; 10.74 sits safely in grace)
  muzzleBore(P, 5.57, 0.10, 0.05, 14);
  P.muzzleZ = 5.57;
  // (release 240: authored 0.14 m off the seated flank (1.40 at this station), past the surface solver's 0.12 m inner
  // probe, which otherwise starts inside the armour and ties the outer one at the same hit with its normal turned in;
  // at 1.505 the K2B's seated flank won that tie inward and both numbers read 0/9 and were dropped)
  P.decal('turret', 'number', '325', 0.30, [1.54, 0.30, -0.85], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', '325', 0.30, [-1.54, 0.30, -0.85], -Math.PI / 2, 0, -0.05);
  addHullDecals();
  };
  buildK2Weapon();
  P.topY = 1.20;
}

// ==================================== K1A1 ==================================
// §5.38 KOREA round NEW BUILD (2026-08-08, owner priority: "fully model a
// custom k1e1 based on this model"): the "baby Abrams" lofted to the
// k1a1_kojf semantic print (LOCAL-ONLY quarantine; raw meters ×0.979 ≈ gate
// frame — the print binds width 0% at its ±1.838 bow flares, hullLen −0.1%,
// overall −1.9%). §5.49 NOTE: the print's turret cluster is under an
// orientation re-bake (extract flagged it backwards); the turret here is
// authored to the REAL K1A1 arrangement (Abrams grammar) with print-derived
// masses/heights/widths — post-rebake receipt curves govern the ladder.
// Identity: near-horizontal 6.4° Abrams-like glacis to a pointed prow (40°
// chin), raised rear engine deck (1.61) over a 1.475 forward deck, full
// skirts ±1.75 under ±1.80 flare guards (§D anchor), 6 roadwheels.
// 267 (owner 2026-11-01, "update ... k1e1"): the turret and gun are the K1E1's, rebuilt from K1E1-era photographs
// (profiles/k1e1.ts, buildK1E1Gun below): the low angular welded K1 turret (vertical walls with chamfered roof edges
// and undercut feet, swept cheek blocks either side of a gun slot), the narrow K1 gun shield, the 105 mm KM68A1's
// sleeved tube with its evacuator a third out, the gunner's doghouse and the commander's cupola with the K6 on the
// RIGHT (+x is the tank's left; the old rounded loft had them mirrored), the loader's M60 left, 2x3 smoke banks behind
// the cheek corners and the wrap-around pipe basket. The hull above is unchanged.
function buildK1A1Hull(P: Modern3BuilderPort) {
  const { box, buildRunningGear } = KIT;
  const slab = orientedSlab;                                                   // §C.1 winding guard on every mirrored slab
  const idler = Object.freeze({ z: 3.00, y: 0.79, r: 0.33 });
  const sprocket = Object.freeze({ z: -2.88, y: 0.85, r: 0.33 });

  // running gear (§B6 trapezoid; print track band x 1.02..1.60): 6 stations
  // + 3 covered rollers, a raised rear drive and raised far-forward idler
  // (print wrap to +3.47). The retired y=.51/.53 end-wheel line put both
  // terminals on the road-wheel datum and collapsed the course into a low
  // rectangle. These lifted terminals restore the K1A1's \______/ lower
  // profile while leaving the loaded run, suspension and skirts untouched.
  // Track outer face 1.595; skirt inner plane 1.70 (§B4 clear).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.46, xc: 1.31,
    wheelZs: [2.10, 1.35, 0.60, -0.15, -0.90, -1.65],
    sprocket, idler,
    rollers: [1.25, 0.10, -1.05].map((z) => ({ z, y: 0.95, r: 0.075 })),
    trackW: 0.57, topY: 0.95, paintedEnds: true, coveredTop: 1.0,
  });

  // hull: belly tub, sponson band with the print's TWO deck levels (raised
  // 1.61 engine deck aft of −2.00, 1.475 forward deck), §B1 ONE 6.4°
  // glacis plane to the 1.24 bow lip, pointed prow over the 40° chin.
  P.add('hull', box(1.96, 0.60, 7.02), 0, 0.70, -0.11);                        // closed belly ±0.98: stays inside both native track lanes through the terminal wraps; runs to -3.62, 10 mm into the rear lower plate (owner 2026-10-19 sweep: the 0.11 m between them stood open from below)
  // Structural lower-side closure. The former pair of full-length dark
  // wheel-well liners sat directly behind the shoes and read as artificial
  // panels. Remove those liners entirely and close the real hull instead:
  // this shallow flare overlaps the belly roof at ±0.98/y 1.00, meets the
  // sponson floor at ±1.42/y 1.22, and rises outside the animated top run.
  P.add('hull', slab(
    [-0.98, 1.00, 1.80], [0.98, 1.00, 1.80], [0.98, 1.00, -3.66], [-0.98, 1.00, -3.66],
    [-1.42, 1.22, 1.75], [1.42, 1.22, 1.75], [1.42, 1.22, -3.70], [-1.42, 1.22, -3.70]));
  P.add('hull', slab(                                                          // outward-canted sponson shoulders replace the former vertical body box
    [-1.42, 1.22, 1.75], [1.42, 1.22, 1.75], [1.42, 1.22, -3.70], [-1.42, 1.22, -3.70],
    [-1.685, 1.475, 1.75], [1.685, 1.475, 1.75], [1.685, 1.475, -3.70], [-1.685, 1.475, -3.70]));
  P.add('hull', slab(                                                          // raised engine deck retains the same sovereign top plane
    [-1.60, 1.475, -2.00], [1.60, 1.475, -2.00], [1.60, 1.475, -3.70], [-1.60, 1.475, -3.70],
    [-1.685, 1.61, -2.00], [1.685, 1.61, -2.00], [1.685, 1.61, -3.70], [-1.685, 1.61, -3.70]));
  P.add('hull', slab(                                                          // §B1 wedge-plan glacis: compact bow expands into the shoulders
    [-1.20, 1.24, 3.70], [1.20, 1.24, 3.70], [1.25, 1.20, 3.58], [-1.25, 1.20, 3.58],
    [-1.685, 1.475, 1.60], [1.685, 1.475, 1.60], [1.685, 1.475, 1.42], [-1.685, 1.475, 1.42]));
  P.add('hull', slab(                                                          // nose lip face — RECEDING (critic r1: no vertical bow faces)
    [-1.02, 1.02, 3.68], [1.02, 1.02, 3.68], [1.02, 1.02, 3.62], [-1.02, 1.02, 3.62],
    [-1.02, 1.24, 3.72], [1.02, 1.24, 3.72], [1.02, 1.22, 3.64], [-1.02, 1.22, 3.64]));
  P.add('hull', slab(                                                          // 40° chin plane up to the lip (the K1 pointed prow)
    [-0.98, 0.40, 3.00], [0.98, 0.40, 3.00], [0.98, 0.40, 2.80], [-0.98, 0.40, 2.80],
    [-0.98, 1.02, 3.68], [0.98, 1.02, 3.68], [0.98, 1.00, 3.58], [-0.98, 1.00, 3.58]));
  // Continuous inter-track bow volume. The upper glacis previously floated
  // over the narrow belly from z=1.42 through the chin shoulder at z=2.80,
  // leaving daylight below the entire plate in low/front views. This closed
  // wedge overlaps the belly at y=0.98, follows the live glacis underside to
  // y=1.20/1.475, and stays at ±0.98: 45 mm inside each animated track lane.
  P.add('hull', slab(
    [-0.98, 0.98, 1.32], [0.98, 0.98, 1.32], [0.98, 0.98, 3.58], [-0.98, 0.98, 3.58],
    [-0.98, 1.475, 1.42], [0.98, 1.475, 1.42], [0.98, 1.20, 3.58], [-0.98, 1.20, 3.58]));
  if (P.geometryReceipt) {
    P.hullG.userData.k1a1RunningGearClosure = Object.freeze({
      idler,
      sprocket,
      previousSprocketY: 0.69,
      sprocketLiftM: 0.16,
      removedInnerTrackPanelCount: 2,
      lowerHullClosure: Object.freeze({
        lowerHalfWidth: 0.98, lowerY: 1.00,
        upperHalfWidth: 1.42, upperY: 1.22,
        rearZ: -3.70, frontZ: 1.80,
      }),
      trackLaneInnerX: 1.31 - 0.57 / 2,
      closureHalfWidth: 0.98,
      closureRearZ: 1.32,
      closureFrontZ: 3.58,
      closureFloorY: 0.98,
      upperRearJoin: Object.freeze({ y: 1.475, z: 1.42 }),
      upperFrontJoin: Object.freeze({ y: 1.20, z: 3.58 }),
    });
  }
  P.add('hull', box(1.92, 0.12, 0.24), 0, 0.36, 3.10);                         // closed toe beam remains inboard of the rising idler wraps
  for (const s of [-1, 1]) P.add('hullDetail', box(0.13, 0.11, 0.15), s * 0.60, 0.62, 3.42); // bow tow hooks
  // rear: center-lane lower plate + full-width upper, louvred exhaust
  // grilles, taillights, convoy plate, flaps.
  P.add('hull', box(2.04, 0.60, 0.10), 0, 0.70, -3.66);
  P.add('hull', box(3.37, 0.32, 0.10), 0, 1.30, -3.66);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.66, 0.34, 0.05), s * 0.88, 1.30, -3.715);          // exhaust grilles
    for (const k of KIT.grilleIndices(P.q, 4, 2)) {
      P.add('hullDetail', box(0.62, 0.04, 0.05), s * 0.88, 1.18 + k * 0.085, -3.722);
    }
    P.add('hullDetail', box(0.035, 0.40, 0.045), s * 0.55, 1.30, -3.724);       // unequal grille/service divider
    P.add('hullDark', box(0.14, 0.08, 0.05), s * 1.44, 1.53, -3.725);          // taillights
    P.hangMudguard('k1e1-rear-flap', 'hullRubber', box(0.56, 0.24, 0.026), s * 1.36, 0.95, -3.71);        // rear flaps (ref hem 0.92 at the stern)
    P.add('hullDetail', box(0.07, 0.05, 0.15), s * 1.36, 1.12, -3.63);         // flap hangers
    P.add('hullDetail', box(0.07, 0.24, 0.07), s * 0.72, 0.72, -3.735);        // tow-clevis stem
    P.add('hullDetail', box(0.24, 0.07, 0.07), s * 0.72, 0.60, -3.735);        // tow-clevis cross foot
  }
  P.add('hullDetail', box(0.28, 0.16, 0.04), 0, 1.10, -3.73);                  // convoy plate
  P.add('hullDark', box(1.32, 0.045, 0.05), 0, 0.98, -3.728);                  // lower service/tow rail
}

function finishK1A1Hull(P: Modern3BuilderPort) {
  const { box, cylY, liftEye, periscope, torus } = KIT;
  const slab = orientedSlab;
  // front guard flares — the §D WIDTH ANCHOR at ±1.80 EXACT (print: the
  // bow mudguard flares are the only ±1.80 content; skirts run ±1.75).
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // sculpted flare wall follows the falling prow instead of ending as a square box
      [s * 1.77, 0.78, 3.08], [s * 1.80, 0.78, 3.08], [s * 1.80, 0.92, 3.52], [s * 1.77, 0.92, 3.52],
      [s * 1.77, 1.35, 3.08], [s * 1.80, 1.35, 3.08], [s * 1.80, 1.14, 3.52], [s * 1.77, 1.14, 3.52]));
    P.add('hull', box(0.14, 0.03, 0.42), s * 1.73, 1.31, 2.90, -0.157, 0, 0);  // fender strip carries the skirt top on to the flare
    addK1E1FrontFender(P, s);                                                  // 267: the K1's boxed front fender and its wide flap (profiles/k1e1.ts)
  }
  // skirts (print): run faces ±1.75, tops following the deck lines (1.475
  // fwd / 1.61 aft third), hems — 0.54 front raked panel, 0.65 mid run,
  // 0.44 deep rear panels; 5 seams; rubber fringe.
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // front raked panel (top follows the glacis edge down)
      [s * 1.70, 0.88, 2.72], [s * 1.75, 0.88, 2.72], [s * 1.75, 0.88, 1.45], [s * 1.70, 0.88, 1.45],
      [s * 1.70, 1.29, 2.72], [s * 1.75, 1.29, 2.72], [s * 1.75, 1.475, 1.45], [s * 1.70, 1.475, 1.45]));
    // 270 (B2): the fender return inboard of that panel's top over the track's outer edge; the plan read the ground
    // through the 8 cm between track and skirt from z 1.78 to the boxed front fender (main showed it too). Its foot keeps
    // the clip audit's 3.6 cm over the rising track top (1.18 m at z 2.94).
    P.add('hull', slab(
      [s * 1.57, 1.3995, 1.76], [s * 1.705, 1.3995, 1.76], [s * 1.705, 1.2265, 2.95], [s * 1.57, 1.2265, 2.95],
      [s * 1.57, 1.4245, 1.76], [s * 1.705, 1.4245, 1.76], [s * 1.705, 1.2515, 2.95], [s * 1.57, 1.2515, 2.95]));
    // main run SEGMENTED into 8 real panels (station slice-paint law —
    // the 3.65 m single box was invisible to mid-span station slabs;
    // 2.5 mm face stagger kills z-fighting, width read unchanged)
    for (let k = 0; k < 8; k++) {
      P.add('hull', box(k % 2 ? 0.0475 : 0.05, 0.575, 0.4563),
        s * (k % 2 ? 1.72375 : 1.725), 1.1875, 1.2219 - k * 0.45625);          // shorter panels expose the enlarged compact six-wheel cadence
      P.add('hullDetail', box(0.018, 0.075, 0.105), s * 1.754, 1.405,
        1.2219 - k * 0.45625);                                                 // source hinge/fastener rhythm
    }
    P.add('hull', slab(                                                        // rear panels rise clear of the compact sprocket course
      [s * 1.70, 0.84, -2.20], [s * 1.75, 0.84, -2.20], [s * 1.75, 0.96, -3.62], [s * 1.70, 0.96, -3.62],
      [s * 1.70, 1.61, -2.20], [s * 1.75, 1.61, -2.20], [s * 1.75, 1.61, -3.64], [s * 1.70, 1.61, -3.64]));
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.045, 0.50, 0.018), s * 1.7265, 1.19, 1.45 - k * 1.05); // panel seams stay within the raised skirt course
    P.add('hullRubber', box(0.02, 0.07, 3.60), s * 1.705, 0.88, -0.375);       // rubber fringe follows the raised skirt hem
    P.add('hullShadow', box(0.05, 0.02, 5.90), s * 1.69, 1.468, -0.60);        // deck-edge shadow seam
  }
  // glacis furniture: driver station CENTER-front (the K1 arrangement),
  // splash V-strips, light clusters on the flare guards, cable, links.
  // 267 round 2: a solid hatch housing; the thin plate and the dark ring torus, seen edge-on from the side above the
  // hull line, read as a loose rod off the turret cheek
  P.add('hull', box(0.58, 0.07, 0.58), 0, 1.40, 2.30, 0.112, 0, 0);            // hatch bed plate on the 6.4° rake
  P.add('hull', cylY(0.26, 0.26, 0.038, P.q ? 20 : 12), 0, 1.452, 2.30);       // driver hatch ring
  P.add('hullDark', new THREE.RingGeometry(0.19, 0.21, P.q ? 20 : 12).rotateX(-Math.PI / 2), 0, 1.4715, 2.30); // flush lid seam
  periscope(P, 'hullDetail', -0.20, 1.50, 1.86);
  periscope(P, 'hullDetail', 0.0, 1.505, 1.82);
  periscope(P, 'hullDetail', 0.20, 1.50, 1.86);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.88, 0.042, 0.065), s * 0.52, 1.37, 2.72, 0.112, s * 0.32, 0); // splash V-strip
  }
  {
    // r268b (research/k1e1 photos 3, 4): the K1's headlights are in housings on the upper nose plate, and each boxed
    // fender's face carries an amber marker at its outer top corner (profiles/k1e1.ts addK1E1HullFurniture); the
    // headlight cluster on the fender tops is gone
    addK1E1HullFurniture(P);
    // 267 round 2: one tow cable looped across the forward glacis between the fenders (the K1 photos' stowage). The
    // two cables that ran up the glacis to the turret front read in the side view as a loose rod off the turret cheek.
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.019, seed: 8,
      pts: [[-0.62, 1.325, 2.96], [0, 1.31, 3.12], [0.62, 1.325, 2.96]] });
    P.hullG.add(tc);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.50, seed: 11 });
    links.position.set(-1.20, 1.62, -3.35);
    P.hullG.add(links);
  }
  // decks: louvred engine field on the raised deck (tops ≤1.64 under the
  // bustle sweep), tool bin on the left rear corner (outside the swing),
  // filler caps, lift eyes at the corners.
  // VEH-13: the louvred engine field is a grille to the spare-link seat solver
  withSeatRole(P, 'grille', (P) => {
    P.add('hullDark', box(2.30, 0.02, 1.30), 0, 1.613, -2.85);
    for (const k of KIT.grilleIndices(P.q, 5, 3)) {
      P.add('hullDetail', box(2.20, 0.02, 0.055), 0, 1.619, -3.32 + k * 0.235);
    }
    addK1E1DeckFrame(P);                                                       // r268b: the grille's frame and edge-plate bolts
  });
  for (const s of [-1, 1]) {
    P.add('hullDark', torus(0.26, 0.013, P.q ? 22 : 14), s * 0.72, 1.614, -2.35); // fan rings
    P.add('hullDetail', cylY(0.08, 0.08, 0.018, 12), s * 1.30, 1.617, -2.10);     // filler caps
  }
  liftEye(P, 'hullDetail', -1.52, 1.62, -3.45);
  liftEye(P, 'hullDetail', 1.52, 1.62, -3.45);
  P.add('hull', box(0.28, 0.13, 0.68), -1.38, 1.675, -3.30);                   // tool bin (rear corner)
  P.add('hullDark', box(0.29, 0.018, 0.70), -1.38, 1.745, -3.30);              // bin lid seam
  P.add('hullDetail', box(0.06, 0.045, 0.90), 1.30, 1.50, -0.60);              // pioneer tool rail (right deck edge)
  P.add('hullDark', box(0.045, 0.03, 0.80), 1.30, 1.505, -0.60);
}

// K1E1 gun (267, research/k1e1 photos 1, 3, 6): the 105 mm KM68A1 the K1E1 keeps, on the K1's narrow gun shield
// standing in the turret's gun slot (profiles/k1e1.ts): a tall tapered shield block, the round mantlet collar, the
// thermal-sleeved tube with its clamp bands, the fat bore evacuator about a third of the way out, and a plain muzzle.
// The spec keeps its gun pivot, its 4.35 m barrel and its 0.105 m radius (the sleeve's), and its ballistics.
function buildK1E1Gun(P: Modern3BuilderPort) {
  const { cylZ } = KIT;
  const seg = P.q ? 24 : 12;
  P.addGunExtra(k1e1GunShield(), 0, 0, 0);
  // 267 round 2: the shield face sits on the cheek faces' line (gun z 0.20) and the collars stand 0.10 m before it
  P.addGunExtra(cylZ(0.170, 0.10, seg), 0, 0, 0.25);                           // mantlet collar
  P.addGunExtra(cylZ(0.135, 0.12, seg), 0, 0, 0.36);                           // cradle collar
  const coax = new THREE.CircleGeometry(0.030, 10);
  P.addGunExtraDark(coax, -0.17, -0.05, 0.202);                                // coaxial MG port (right of the gun), flush
  P.addGunExtraDark(KIT.box(0.09, 0.07, 0.006), 0.17, 0.13, 0.201);            // gunner's auxiliary sight port (left)
  // tube (recoils): sleeve, evacuator, sleeve, sleeve, muzzle; bands at every sleeve joint
  for (const [z0, z1, rFront, rBack] of [
    [0.42, 1.50, 0.105, 0.105], [1.50, 1.62, 0.152, 0.105], [1.62, 2.12, 0.152, 0.152], [2.12, 2.24, 0.100, 0.152],
    [2.24, 3.10, 0.100, 0.100], [3.10, 4.06, 0.094, 0.094], [4.06, 4.308, 0.088, 0.088],
  ] as const) P.add('gun', cylZ(rFront, z1 - z0, seg, rBack), 0, 0, (z0 + z1) / 2);
  for (const [z, r] of [[0.44, 0.113], [1.48, 0.113], [2.26, 0.108], [3.10, 0.106], [4.04, 0.100]] as const) {
    P.add('gunDark', cylZ(r, 0.04, seg), 0, 0, z);
  }
  // §B3.1 MUZZLE BORE: the capped tube ends 4.308; the bored face holds the 4.35 muzzle line
  muzzleBore(P, 4.35, 0.088, 0.0525, 14);
  P.muzzleZ = 4.35;
  P.decal('turret', 'number', '110', 0.26, [1.49, 0.30, 0.22], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', '110', 0.26, [-1.49, 0.30, 0.22], -Math.PI / 2, 0, -0.05);
  P.decal('hull', 'number', '110', 0.22, [1.755, 1.02, 0.60], Math.PI / 2);
  P.decal('hull', 'number', '110', 0.22, [-1.755, 1.02, 0.60], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.75, [0.88, 1.28, -3.73], Math.PI);
  P.topY = 1.05;
}

const buildK1A1 = steppedBuilder(function* (P: Modern3BuilderPort): TankProfileBuild {
  buildK1A1Hull(P);
  yield 'buildK1A1Hull';
  finishK1A1Hull(P);
  yield 'finishK1A1Hull';
  buildK1E1Turret(P);
  yield 'buildK1E1Turret';
  buildK1E1Gun(P);
});

// ================================ M2A2 Bradley ==============================
// §6.5: tall slab aluminum box, one-piece 60° glacis, nose shelf, rear troop
// ramp, RIGHT-offset two-man turret with 25 mm + elevating twin TOW box,
// A2 appliqué side slabs with stand-off bolts, front drive sprocket.
function* buildBradleySteps(P: Modern3BuilderPort): TankProfileBuild {
  // 268: the Bradleys take the family base measured from the owner's supplied model (BRADLEY_HULL, BRADLEY_GEAR).
  // (274: the Marder 1A3's pre-268 donor build left with its own hull, profiles/marder1a3.ts.)
  yield* buildBradleyFamilySteps(P);
}

// ================= 268: the Bradley family base, measured from the owner's supplied model =================
// Source: the owner's m2_bradley_ifv.glb (sha256 523dd567…; docs/references/tanks/m2a2_bradley.md), registered with one
// uniform scale 2.673 (hull length 6.55 m), bow +Z, up +Y, the TOW and the driver on +X (the vehicle's left). Every datum
// below is that registered source's: hull −3.285..3.265, deck crown 2.06 over ±0.85, the roof falling outboard at
// 0.70 m per metre to a 1.60 gutter behind the upper side plates, whose tops stand at 1.93 (±1.51..1.57); the upper
// side over a sponson floor 1.26 (5 cm over the 0.54 m track's 1.21 top run), the belly 0.54
// between the tracks, the glacis from (z 1.70, 2.06) down to (2.70, 1.52), the nose block's 1.40 shelf to the 3.265 bow,
// the stern undercut from (−2.80, 0.54) up to the ramp's 1.20 foot at −3.285.
export const BRADLEY_HULL = Object.freeze({
  bowZ: 3.265, sternZ: -3.285, belly: 0.54, tubHalfW: 0.93, sponsonY: 1.26, sideX: 1.57,
  edgeX: 1.51, edgeY: 1.93, crownX: 0.85, crownY: 2.06, gutterDrop: 0.46, rightGutterDrop: 0.39, engineGutterDrop: 0.20,
  glacisTopZ: 1.70, glacisToeZ: 2.70, glacisToeY: 1.52, noseY: 1.40, noseZ: 2.84,
});
const bradleyGlacisSlope = (BRADLEY_HULL.crownY - BRADLEY_HULL.glacisToeY) / (BRADLEY_HULL.glacisToeZ - BRADLEY_HULL.glacisTopZ);
/** The family's upper glacis plane (fitted armour, the trim vane and the driver's hatch seat on it). */
export const BRADLEY_GLACIS = Object.freeze({
  top: Object.freeze({ y: BRADLEY_HULL.crownY, z: BRADLEY_HULL.glacisTopZ }),
  toe: Object.freeze({ y: BRADLEY_HULL.glacisToeY, z: BRADLEY_HULL.glacisToeZ }),
  angleRad: Math.atan(bradleyGlacisSlope),
  yAt: (z: number) => BRADLEY_HULL.crownY - bradleyGlacisSlope * (z - BRADLEY_HULL.glacisTopZ),
  normalOutward: Object.freeze({ y: Math.cos(Math.atan(bradleyGlacisSlope)), z: Math.sin(Math.atan(bradleyGlacisSlope)) }),
});
// The source's running gear: six road wheels r 0.335 at its own uneven pitch (the 3rd–4th gap the widest), the toothed
// sprocket at the front, the raised idler at the rear, the 0.53 m track (the specs' visual.trackWidthM, which the track
// contact reads; the source's shoes with their end connectors span 0.977..1.518) centred at ±1.2475.
const BRADLEY_GEAR = Object.freeze({
  style: 'rubber', wheelR: 0.335, wheelW: 0.26, xc: 1.2475, dishR: 0.85,
  wheelZs: [1.90, 1.20, 0.40, -0.60, -1.30, -2.00],
  sprocket: { z: 2.86, y: 0.86, r: 0.28 }, idler: { z: -2.80, y: 0.87, r: 0.30 },
  rollers: [[1.50, 1.04], [0.0, 1.04], [-1.50, 1.04]].map(([z, y]) => ({ z, y, r: 0.08 })),
  trackW: 0.53, topY: 1.16, paintedEnds: true, pinCapOuter: 0.262, contactZF: 2.05, contactZR: -2.20,
});

/** One station of the family's hull core: the tub between the tracks, the sponsons over them, the upper side plate
 *  (its top edgeY, its inner face at edgeX), the gutter where the roof slope meets the plate's inside, and the roof
 *  crown (counter-clockwise from the tub's left belly corner, viewed from +Z). */
function bradleyHullRing(belly: number, gutterPlusY: number, gutterMinusY: number, edgeY: number,
  crownY: number): Array<[number, number]> {
  const H = BRADLEY_HULL;
  const half = (gutterY: number): Array<[number, number]> => [[H.tubHalfW, belly], [H.tubHalfW, H.sponsonY],
    [H.sideX, H.sponsonY], [H.sideX, edgeY], [H.edgeX, edgeY], [H.edgeX, gutterY], [H.crownX, crownY]];
  const left = half(gutterMinusY).map(([x, y]) => [-x, y] as [number, number]).reverse();
  return [[-H.tubHalfW, belly], ...half(gutterPlusY), ...left.slice(0, -1)];
}

function addBradleyHullCore(P: Modern3BuilderPort): void {
  const H = BRADLEY_HULL, g = BRADLEY_GLACIS.yAt;
  // The gutter sits gutterDrop under the crown on the body stations; over the engine (−X, z 0.25..1.70) the source's
  // roof falls only 0.20 to the plate, and from the glacis forward the roof runs flat out to the plates (gutter 1 cm
  // under the plate top). `minus` is the −X gutter's drop where it differs (the right roof stands a little fuller).
  const station = (z: number, belly: number, top: number, edge = Math.min(H.edgeY, top - 0.005), minus: number = H.gutterDrop) => {
    const gutter = (drop: number) => z > 2.0 ? edge - 0.01 : Math.max(1.30, Math.min(edge - 0.01, top - drop));
    return { z, ring: bradleyHullRing(belly, gutter(H.gutterDrop), gutter(minus), edge, top) };
  };
  P.add('hull', sectionSolid([
    // the stern: the ramp foot over the undercut; the roof edge over the track ends falls 1.935 -> 1.556 over the last
    // 0.3 m (the source's corner slope), the crown holds 2.10 to the ramp
    station(H.sternZ, 1.20, 2.10, 1.575),
    station(-3.10, 1.02, 2.10, 1.815),
    station(-3.00, 0.67, 2.08, H.edgeY, H.rightGutterDrop),
    station(-2.80, H.belly, H.crownY, H.edgeY, H.rightGutterDrop),
    station(0.15, H.belly, H.crownY, H.edgeY, H.rightGutterDrop),
    station(0.25, H.belly, H.crownY, H.edgeY, H.engineGutterDrop),
    station(H.glacisTopZ, H.belly, H.crownY, H.edgeY, H.engineGutterDrop),
    station(1.95, H.belly, g(1.95), undefined, H.engineGutterDrop),
    station(H.glacisToeZ, H.belly, g(H.glacisToeZ)),
    station(2.75, 0.56, 1.45),
    station(H.noseZ, 0.68, H.noseY),
    station(3.18, 0.96, H.noseY),
    station(H.bowZ, 0.98, 1.32),
  ], { sideQuadDiagonal: 'convex' }));
  P.hullG.userData.bradleyHullCoreReceipt = Object.freeze({
    revision: 'source-measured-core-r2',
    ...H,
    glacisAngleRad: BRADLEY_GLACIS.angleRad,
  });
}

// Deck furniture at the source's stations: the engine-deck raise and grille front-right (−X, the engine's side), the
// troop compartment's raised roof aft (x −0.44..0.72, z −3.0..−2.2, top 2.19) with its cargo-hatch block (2.24), the driver's
// periscope row front-left (+X), lift eyes, a bedroll at the rear deck's left edge.
function addBradleyDeckKit(P: Modern3BuilderPort): void {
  const H = BRADLEY_HULL;
  const { box, liftEye, periscope, stowage } = KIT;
  P.add('hull', box(1.24, 0.145, 0.92), -0.34, H.crownY - 0.0225, 1.05);                  // engine-deck raise, top 2.11
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.02, 0.026, 0.06), -0.34, H.crownY + 0.060, 1.38 - k * 0.22);
  // the raised troop roof (source: 2.19 over x -0.44..0.72, z -3.0..-2.22) and its cargo-hatch block (source: 2.244
  // over x -0.34..0.59, z -2.62..-2.13; here 1 cm lower, ending at z -2.55, the hatch seam inlaid flush: the A3's lower
  // 25 mm keeps its pre-268 rear depression, -5.4..-5.8 deg, over it)
  // (its rear end tapers in and falls to 2.12 at z -3.0, as the source's does)
  const troopRing = (x0: number, x1: number, top: number): Array<[number, number]> =>
    [[x0, H.crownY - 0.02], [x1, H.crownY - 0.02], [x1, top], [x0, top]];
  P.add('hull', sectionSolid([
    { z: -3.00, ring: troopRing(-0.22, 0.55, 2.12) },
    { z: -2.90, ring: troopRing(-0.44, 0.68, 2.19) },
    { z: -2.22, ring: troopRing(-0.44, 0.72, 2.19) },
  ], { sideQuadDiagonal: 'convex' }));
  P.add('hull', box(0.93, 0.19, 0.42), 0.125, H.crownY + 0.079, -2.34);
  P.add('hullDark', box(0.70, 0.004, 0.34), 0.125, H.crownY + 0.1735, -2.34);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', 0.25 + k * 0.18, H.crownY + 0.02, 1.34, -(1 - k) * 0.20);
  for (const x of [-0.45, 0.45]) liftEye(P, 'hullDetail', x, H.crownY - 0.005, 0.30);
  stowage(P, 'hullCloth', P.rng, [[1.24, 1.88, -1.98, 0.30, 0.30, 0.44]]);
}

/** The family's turret-ring datum on the shared hull, the registered source's: the ring centre 0.14 m right of the
 *  centreline (−X) at z −0.40, seated on the deck crown (y 2.06). Every Bradley turret's rig_turret (its spec's
 *  armor.turretPivot) stands here; another turret seats on it. */
export const BRADLEY_TURRET_RING = Object.freeze({ x: -0.14, z: -0.40, deckY: BRADLEY_HULL.crownY });

/** The Bradley family's hull with no turret group: the measured hull core, the deck furniture, the running gear and the
 *  glacis spare links (the steps buildBradley runs before its turret). A turret builder seats on BRADLEY_TURRET_RING
 *  and adds the hull-side armour, bow kit, stern and markings with bradleyFlankDressing(P, { turretSeat: false }). */
export function* buildBradleyHullSteps(P: Modern3BuilderPort): TankProfileBuild {
  const { buildRunningGear } = KIT;
  addBradleyHullCore(P);
  yield 'buildBradleyHullStage1';
  addBradleyDeckKit(P);
  yield 'buildBradleyHullStage3';
  const buildBradleyRunningGearStage1 = (): void => {
    // VEH-13 spare links on the right upper glacis (the driver's periscopes hold the left), on the family's plane
    // (268: at the station the seat solver found on the M3A2, where the measured plate meets the family's plane and the
    // trim vane carries the lower rail; at the old z 2.18 the plate falls 6.7 cm under that plane and the run hovered)
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.48, seed: 9, rotation: [BRADLEY_GLACIS.angleRad, 0, 0],
    });
    const lz = 2.444, lift = 0.03;
    links.position.set(-0.62, BRADLEY_GLACIS.yAt(lz) + BRADLEY_GLACIS.normalOutward.y * lift, lz + BRADLEY_GLACIS.normalOutward.z * lift);
    P.hullG.add(links);
    buildRunningGear(P, { ...BRADLEY_GEAR, wheelZs: [...BRADLEY_GEAR.wheelZs],
      rollers: BRADLEY_GEAR.rollers.map((r) => ({ ...r })) });
  };
  buildBradleyRunningGearStage1();
  yield 'buildBradleyRunningGearStage1';
}
/** The family's hull with no turret group, drained (see buildBradleyHullSteps). */
export function buildBradleyHull(P: Modern3BuilderPort): void {
  drainTankBuild(buildBradleyHullSteps(P));
}

function* buildBradleyFamilySteps(P: Modern3BuilderPort): TankProfileBuild {
  const { cylX, cylZ, buildGun } = KIT;
  yield* buildBradleyHullSteps(P);
  addBradleyTurretShell(P);
  yield 'buildBradleyTurretStage1';
  addBradleyTurretKit(P);
  addBradleyTowLauncher(P);
  // ---- 25 mm M242 on the source's gun line (2.525 m, right of the turret's centre) to its own muzzle (z 2.37) -----
  // The trunnion drum turns on its own axis and fills the bay behind the block; the block's rear corners stay inside it.
  P.addGunExtra(cylX(0.17, 0.30, P.q ? 24 : 14), 0, 0, 0);
  P.addGunExtra(KIT.box(0.26, 0.22, 0.44), 0, -0.01, 0.34);
  P.addGunExtra(cylZ(0.078, 0.30, P.q ? 20 : 12), 0, 0, 0.70);
  buildGun(P, { len: 0.70, r: 0.038, baseR: 0.075 });
  P.addGunExtra(cylZ(0.038, BRADLEY_MUZZLE_Z - 0.66 - 0.15, 28), 0, 0, (0.66 + BRADLEY_MUZZLE_Z - 0.15) / 2);
  P.muzzleZ = BRADLEY_MUZZLE_Z;
  yield 'buildBradleyTurretStage2';
  P.add('gunDark', cylZ(0.046, 0.16, 12), 0, 0, BRADLEY_MUZZLE_Z - 0.08);           // flash suppressor
  P.add('gunDark', cylZ(0.026, 0.012, 12), 0, 0, BRADLEY_MUZZLE_Z - 0.0055);        // dark bore disc on its face
  P.topY = 1.05;
}

export function buildBradley(...args: Parameters<typeof buildBradleySteps>): void {
  drainTankBuild(buildBradleySteps(...args));
}

// ============================ 268: the Bradley turret (source-measured) ===================================
// The registered source's turret (docs/references/tanks/m2a2_bradley.md): the ring 0.14 m right of the hull centre
// (−X) at z −0.40 on the 2.06 deck; walls to the 2.94–2.97 roof; a forward beak at the gun line; the gun right of the
// turret's centre on the 2.525 m line; the TOW launcher erect on the LEFT (+X) side, its box over x 0.75..1.37 m and
// y 2.75..3.30; the stowage bin on the right (−X); the antenna mast at the right rear. Turret-local frame: ring plane y 0,
// +z forward (turretPivot [−0.14, 2.06, −0.40]). Below 0.22 m the shell keeps inside the raised troop roof's 1.21 m
// reach and above the engine-deck raise, so nothing low meets the deck as it turns. 269: the M3A3's A3 turret
// (profiles/bradleyA3Turret.ts) stands on this same shell, gun and launcher (the A3 kept the A2 turret's structure).
export const BRADLEY_TURRET = Object.freeze({
  rearZ: -1.20, faceZ: 0.70, beakZ: 1.15,
  // the source's roof plate stands at 2.83 (0.77 over the ring) behind a 3 cm chamfer from the walls' 2.79 tops; its
  // hatch rings rise to 2.93-2.99 and the sight head to 3.19
  bottomY: 0.12, rearBottomY: 0.24, chineY: 0.32, edgeY: 0.73, roofY: 0.77,
  bottomHalfW: 0.86, halfW: 0.98, edgeHalfW: 0.96, roofHalfW: 0.78,
  beakBottomY: 0.43, beakTopY: 0.50, beakHalfW: 0.70,
  // the source's shell is off its ring: the left (+X) wall stands 0.70 m off the hull's centre (0.84 from the pivot),
  // the right (−X) wall 1.10 (0.98), so every +X half-width is the −X one less this inset
  plusInset: 0.14,
  // the M242 bay between the cheeks (gun axis x −0.06): the mantlet's −9..+30 sweep stays inside it
  bayLeftX: -0.24, bayRightX: 0.12,
});
// The 25 mm muzzle (gun frame): the source's own muzzle at world z 2.37.
const BRADLEY_MUZZLE_Z = 2.17;
// The TOW launcher as the source carries it erected (turret frame): box and its two side-by-side tubes; built stowed
// (addBradleyTowLauncher folds it about the box's inner lower edge x0, y0).
const BRADLEY_TOW = Object.freeze({ x0: 0.89, x1: 1.51, y0: 0.84, y1: 1.27, z0: -0.70, z1: 0.60, tubeY: 1.055,
  tubeXs: [1.05, 1.35] as const, plateZ: 0.56 });

function bradleyTurretRing(bottomHalfW: number, halfW: number, edgeHalfW: number, roofHalfW: number,
  bottomY: number, chineY: number, edgeY: number, roofY: number): Array<[number, number]> {
  const i = BRADLEY_TURRET.plusInset;
  return [[-bottomHalfW, bottomY], [bottomHalfW - i, bottomY], [halfW - i, chineY], [edgeHalfW - i, edgeY],
    [roofHalfW - i, roofY], [-roofHalfW, roofY], [-edgeHalfW, edgeY], [-halfW, chineY]];
}

// One cheek of the beak: a welded wedge from the wall face forward to the beak edge; its inner face is the gun bay's.
// Its floor stays level (bottomY) to the stowage bin's nose (z 0.80) before it rises to the beak: rising from 0.72, the
// right cheek's underside roofed a 2-4 cm slot over the bin's nose (roof-pocket census, 268 round 4: 200 cm2).
const BRADLEY_CHEEK_KNEE_Z = 0.80;
function bradleyTurretCheek(side: number): THREE.BufferGeometry {
  const T = BRADLEY_TURRET, knee = BRADLEY_CHEEK_KNEE_Z;
  const inner = side > 0 ? T.bayRightX : -T.bayLeftX, inset = side > 0 ? T.plusInset : 0;
  const lower = (z: number) => z <= knee ? T.bottomY : T.bottomY + (T.beakBottomY - T.bottomY) * (z - knee) / (T.beakZ - knee);
  const upper = (z: number) => z <= T.faceZ ? T.roofY : T.roofY - (T.roofY - T.beakTopY) * (z - T.faceZ) / (T.beakZ - T.faceZ);
  const outer = (z: number) => (z <= 0.66 ? T.halfW : T.halfW - (T.halfW - T.beakHalfW) * (z - 0.66) / (T.beakZ - 0.66)) - inset;
  const station = (z: number) => {
    const yb = lower(z), yt = upper(z), xo = outer(z), h = yt - yb;
    const right: Array<[number, number]> = [[inner, yb], [xo - 0.12, yb], [xo, yb + 0.28 * h],
      [xo - 0.02, yb + 0.91 * h], [xo - 0.08, yt], [inner, yt]];
    return { z, ring: side > 0 ? right : right.map(([x, y]) => [-x, y] as [number, number]).reverse() };
  };
  return sectionSolid([0.62, 0.72, knee, 0.94, T.beakZ].map(station), { sideQuadDiagonal: 'convex' });
}

/** A cheek's upper front plate (turret frame, side +1 the left): its inner edge by the gun bay, its outer edge and top
 *  surface by z, its slope and outward normal (0, nY, nZ), and `at` a point `lift` off the cheek's surface along that
 *  normal. The ODS appliqué and the A3's reactive tiles (profiles/bradleyA3Turret.ts) seat on it. */
export function bradleyCheekPlateFrame(side: number) {
  const T = BRADLEY_TURRET;
  const inner = (side > 0 ? T.bayRightX : -T.bayLeftX) + 0.03;
  const slope = Math.atan((T.roofY - T.beakTopY) / (T.beakZ - T.faceZ));
  const nY = Math.cos(slope), nZ = Math.sin(slope);
  const topY = (z: number) => T.roofY - (T.roofY - T.beakTopY) * (z - T.faceZ) / (T.beakZ - T.faceZ);
  const outerX = (z: number) => T.halfW - (T.halfW - T.beakHalfW) * (z - 0.66) / (T.beakZ - 0.66) - 0.12
    - (side > 0 ? T.plusInset : 0);
  const at = (x: number, z: number, lift: number): [number, number, number] => [side * x, topY(z) + nY * lift, z + nZ * lift];
  return { inner, slope, nY, nZ, topY, outerX, at, z0: 0.74, z1: 1.08, thickness: 0.035 };
}

// ODS appliqué bolted on a cheek's upper front plate: 35 mm proud on the plate's own plane, two rows of three bolts.
function bradleyTurretCheekPlate(side: number): { plate: THREE.BufferGeometry; bolts: THREE.BufferGeometry } {
  const { inner, slope, outerX, at } = bradleyCheekPlateFrame(side);
  const [z0, z1] = [0.74, 1.08], t = 0.035;
  const plate = orientedSlab(
    at(inner, z1, -0.005), at(outerX(z1), z1, -0.005), at(outerX(z0), z0, -0.005), at(inner, z0, -0.005),
    at(inner, z1, t), at(outerX(z1), z1, t), at(outerX(z0), z0, t), at(inner, z0, t));
  const bolts: THREE.BufferGeometry[] = [];
  for (const z of [z0 + 0.06, z1 - 0.06]) {
    for (let k = 0; k < 3; k++) {
      const x = inner + 0.06 + (outerX(z) - inner - 0.12) * k / 2;
      bolts.push(KIT.xform(KIT.cylY(0.018, 0.018, 0.018, 6), ...at(x, z, t + 0.004), slope, 0, 0));
    }
  }
  return { plate, bolts: KIT.mergeAll(bolts) };
}

// The right-wall stowage bin (turret frame): inner face inside the wall, a floor chamfered up to the upright outer face,
// a lid sloping up to the wall; the front quarter tapers into the cheek. Floor 0.14 (world 2.20): 5.5 cm over the engine-deck raise
// (2.145) where its 0.99..1.64 m sweep crosses it; the troop roof (2.24) lies 1.70 m and more from the pivot.
const BRADLEY_BIN = Object.freeze({ innerX: -0.94, outerX: -1.35, bottomY: 0.14, shoulderY: 0.38, lidY: 0.62,
  lidInnerX: -1.08, z0: -0.55, z1: 0.58, noseZ: 0.80, noseX: -1.00 });
function bradleyStowageBin(): THREE.BufferGeometry {
  const B = BRADLEY_BIN;
  const ring = (outer: number, lidInner: number): Array<[number, number]> => [[Math.max(outer, -1.10), B.bottomY],
    [B.innerX, B.bottomY], [B.innerX, B.lidY], [lidInner, B.lidY], [outer, B.shoulderY], [outer, B.bottomY + 0.10]];
  return sectionSolid([
    { z: B.z0, ring: ring(B.outerX, B.lidInnerX) },
    { z: B.z1, ring: ring(B.outerX, B.lidInnerX) },
    { z: B.noseZ, ring: ring(B.noseX, -0.96) },
  ], { sideQuadDiagonal: 'convex' });
}

export function addBradleyTurretShell(P: Modern3BuilderPort): void {
  const T = BRADLEY_TURRET;
  const { box } = KIT;
  const ring = (bottomY: number) => bradleyTurretRing(T.bottomHalfW, T.halfW, T.edgeHalfW, T.roofHalfW, bottomY, T.chineY, T.edgeY, T.roofY);
  P.add('turret', sectionSolid([
    { z: T.rearZ, ring: bradleyTurretRing(0.66, 0.84, 0.86, 0.70, 0.26, 0.40, 0.69, 0.73) },
    { z: T.rearZ + 0.08, ring: ring(T.rearBottomY) },
    { z: -0.72, ring: ring(T.rearBottomY) },
    { z: -0.40, ring: ring(T.bottomY) },
    { z: T.faceZ, ring: ring(T.bottomY) },
  ], { sideQuadDiagonal: 'convex' }));
  for (const side of [-1, 1]) {
    P.add('turret', bradleyTurretCheek(side));
    P.add('turret', bradleyTurretCheekPlate(side).plate);
  }
  // gun-bay floor between the cheeks, outside the mantlet's swept envelope; the bay stays open above the mantlet, as the
  // source's is (268 round 4: the 14 cm roof lip that stood over it here, which the source does not carry, roofed a 10 cm
  // slot over the mantlet's sweep: roof-pocket census, 432 cm2)
  const bayX = (T.bayLeftX + T.bayRightX) / 2, bayW = T.bayRightX - T.bayLeftX;
  P.add('turret', box(bayW, 0.10, 0.30), bayX, T.bottomY + 0.05, 0.84);
  P.add('turretDark', box(0.06, 0.05, 0.08), bayX - 0.20, 0.52, 1.03);                     // M240C coax port
  // round 3: the floor under the right wall stays level (0.12) where the shell's floor rises aft to the rear's 0.24,
  // closing the pocket over the collar's rim there (roof-pocket census); round 4: in to x -0.44, over the collar's rim
  // (from -0.60 it left a 2 cm slot between its inner face and the collar: 68 cm2)
  P.add('turret', box(0.50, 0.12, 0.32), -0.69, T.bottomY + 0.06, -0.56);
  P.turretG.userData.bradleyA2TurretClosureReceipt = Object.freeze({
    revision: 'source-turret-r3',
    roofY: T.roofY,
    shell: Object.freeze({ rearZ: T.rearZ, faceZ: T.faceZ, beakZ: T.beakZ, halfWidthM: T.halfW, plusInsetM: T.plusInset,
      bottomY: T.bottomY, rearBottomY: T.rearBottomY }),
    gunBay: Object.freeze({ leftX: T.bayLeftX, rightX: T.bayRightX }),
    // the source's erected box and its pivot; built stowed (folded 90° out and down about the pivot)
    towLauncher: Object.freeze({ ...BRADLEY_TOW, tubeXs: [...BRADLEY_TOW.tubeXs], pose: 'stowed',
      pivot: Object.freeze([BRADLEY_TOW.x0, BRADLEY_TOW.y0]),
      stowedMouths: Object.freeze(BRADLEY_TOW.tubeXs.map((x) => Object.freeze([...bradleyTowStowed(x, BRADLEY_TOW.tubeY),
        BRADLEY_TOW.plateZ + 0.04]))) }),
    stowageBin: Object.freeze({ innerX: BRADLEY_BIN.innerX, outerX: BRADLEY_BIN.outerX, bottomY: BRADLEY_BIN.bottomY }),
  });
}

/** The commander's station on the turret's RIGHT, the A2's and the A3's: raised ring, hatch lid, four vision blocks round
 *  its front (source: its ring to 2.975 over world x −0.91..−0.30, z −1.15..−0.35). */
export function addBradleyCommanderStation(P: Modern3BuilderPort): void {
  const T = BRADLEY_TURRET;
  const { cylY, periscope } = KIT;
  P.add('turret', cylY(0.31, 0.33, 0.13, P.q ? 22 : 14), -0.42, T.roofY + 0.055, -0.40);
  P.add('turretDetail', cylY(0.28, 0.29, 0.04, P.q ? 22 : 14), -0.42, T.roofY + 0.14, -0.40);
  for (const a of [-0.9, -0.3, 0.3, 0.9]) {
    periscope(P, 'turretDetail', -0.42 + 0.31 * Math.sin(a), T.roofY + 0.085, -0.40 + 0.31 * Math.cos(a), a);
  }
}

/** The stowage bin low on the turret's right wall (source: out to world x −1.50 over y 2.20..2.42, its lid sloping up to
 *  the wall at 2.68, z −0.95..0.30 tapering into the cheek), its lid seam and two latches. */
function addBradleyStowageBin(P: Modern3BuilderPort): void {
  const { box } = KIT;
  P.add('turret', bradleyStowageBin());
  const B = BRADLEY_BIN;
  P.add('turretDark', box(0.014, 0.016, B.z1 - B.z0 - 0.08), B.outerX - 0.008, B.shoulderY, (B.z0 + B.z1) / 2 - 0.08);
  for (const z of [-0.20, 0.30]) P.add('turretDetail', box(0.03, 0.06, 0.07), B.outerX - 0.012, (B.bottomY + B.shoulderY) / 2, z);
}

/** The 2x4 smoke dischargers on the cheek fronts (§6.5). */
export function addBradleySmokeBanks(P: Modern3BuilderPort): void {
  const T = BRADLEY_TURRET;
  for (const s of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.038, len: 0.24, pitch: -0.28, splay: s * 1.05, spacing: 0.095, seed: 6 + s,
    });
    bank.position.set(s * 0.70 - (s > 0 ? T.plusInset : 0), 0.52, 0.93);
    P.turretG.add(bank);
  }
}

function addBradleyTurretKit(P: Modern3BuilderPort): void {
  const T = BRADLEY_TURRET;
  const { box, cylY, stowage } = KIT;
  // the gunner's Integrated Sight Unit on the LEFT front of the roof (source: world x −0.05..0.70, z −0.40..0.15, top
  // 3.19): the armoured box, its window, two door leaves
  P.add('turret', box(0.60, 0.36, 0.46), 0.50, T.roofY + 0.17, 0.30);
  P.add('turretDark', box(0.44, 0.15, 0.02), 0.50, T.roofY + 0.21, 0.532);
  P.add('turretGlass', box(0.38, 0.10, 0.012), 0.50, T.roofY + 0.21, 0.542);
  for (const dx of [-0.15, 0.15]) P.add('turretDetail', box(0.28, 0.025, 0.42), 0.50 + dx, T.roofY + 0.36, 0.28);
  for (const side of [-1, 1]) P.add('turretDetail', bradleyTurretCheekPlate(side).bolts);
  addBradleyCommanderStation(P);
  // the gunner's hatch on the left rear (source: 2.92-2.93)
  P.add('turret', cylY(0.25, 0.26, 0.10, P.q ? 20 : 12), 0.40, T.roofY + 0.04, -0.62);
  P.add('turretDark', box(0.10, 0.03, 0.05), 0.40, T.roofY + 0.10, -0.87);
  addBradleyStowageBin(P);
  // (round 3, blind A/B b2: the source's tall mast box at the right rear is gone, the M2A2 ODS carries none; the two
  // whips stand on the roof's rear corners)
  addBradleySmokeBanks(P);
  // bustle rack on the rear wall, open aft, with bags; the whips
  // (source: the rack 1.0 m wide centred over the hull, 0.24..0.74 over the ring, to world z -1.85)
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 1.00, d: 0.38, h: 0.42, rails: 3, fill: 0.55, seed: 11, rotation: [0, Math.PI, 0],
  });
  rack.position.set(0.14, 0.28, T.rearZ - 0.20);
  P.turretG.add(rack);
  stowage(P, 'turretCloth', P.rng, [[0.14, 0.50, T.rearZ - 0.20, 0.80, 0.30, 0.30]]);
  for (const [x, y, z, seed] of [[-0.62, T.roofY, -1.02, 5], [0.50, T.roofY, -1.02, 8]] as const) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed });
    whip.position.set(x, y, z);
    P.turretG.add(whip);
  }
}

// The TOW launcher on the turret's LEFT, STOWED (its travel and default state): the source carries it erected for firing,
// its box (BRADLEY_TOW, the source's erected frame) over the roof's rear left; it folds 90° down and out about its
// elevation pivot, the box's inner lower edge (x0, y0) on the wall top, so the box lies along the left wall with its top
// flush with the roof and its two cells stacked one over the other. The pack: four walls, a back plate, a perforated
// front plate 1 cm inside them, two cells whose rim collars stand 4 cm proud around dark liners and sealed terminals
// 45 cm deep (170 mm bore; 2026-10-21 owner: launch tubes "like the object 695, and tagil"), a lid rib (outboard when
// stowed), the hinge mount and drum on the wall top and two standoffs to the wall. fleetLauncherMuzzles.ts fires TOW
// from the stowed mouths (bradleyTowStowed of the erected ones).
const BRADLEY_TOW_FOLD = new THREE.Matrix4().makeTranslation(BRADLEY_TOW.x0, BRADLEY_TOW.y0, 0)
  .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2))
  .multiply(new THREE.Matrix4().makeTranslation(-BRADLEY_TOW.x0, -BRADLEY_TOW.y0, 0));
/** A point of the erected launcher (turret frame) in its stowed pose. */
function bradleyTowStowed(x: number, y: number): [number, number] {
  return [BRADLEY_TOW.x0 + (y - BRADLEY_TOW.y0), BRADLEY_TOW.y0 - (x - BRADLEY_TOW.x0)];
}

/** 269: the turret's centre plane between its two walls (the shell stands plusInset off its ring); a launcher built on
 *  the right wall (`side` −1, the M3A3's second) is the left one mirrored about it. */
const BRADLEY_TOW_MIRROR_X = -BRADLEY_TURRET.plusInset / 2;

export function addBradleyTowLauncher(P: Modern3BuilderPort, side: 1 | -1 = 1): void {
  const W = BRADLEY_TOW;
  const { box, cylZ, xform } = KIT;
  const cx = (W.x0 + W.x1) / 2, cy = (W.y0 + W.y1) / 2, cz = (W.z0 + W.z1) / 2;
  const w = W.x1 - W.x0, h = W.y1 - W.y0, d = W.z1 - W.z0;
  const fold = (g: THREE.BufferGeometry) => g.applyMatrix4(BRADLEY_TOW_FOLD);
  const mirror = (g: THREE.BufferGeometry) => side > 0 ? g
    : mirrorX(g.translate(-BRADLEY_TOW_MIRROR_X, 0, 0)).translate(BRADLEY_TOW_MIRROR_X, 0, 0);
  const add = (bucket: string, g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => P.add(bucket, mirror(fold(xform(g, x, y, z))));
  const fixed = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number) => side > 0
    ? P.add(bucket, g, x, y, z) : P.add(bucket, mirror(xform(g, x, y, z)));
  weaponAssembly(P, () => {
    for (const x of [W.x0 + 0.015, W.x1 - 0.015]) add('turretDetail', box(0.03, h, d), x, cy, cz);
    for (const y of [W.y0 + 0.015, W.y1 - 0.015]) add('turretDetail', box(w, 0.03, d - 0.002), cx, y, cz);
    add('turretDetail', box(w - 0.03, h - 0.03, 0.03), cx, cy, W.z0 + 0.015);
    add('turretDetail', perforatedPlate(w - 0.03, h - 0.03, 0.02,
      W.tubeXs.map((x) => [x - cx, W.tubeY - cy] as const), 0.0965, P.q ? 24 : 12), cx, cy, W.plateZ);
    for (const x of W.tubeXs) {
      const tube = launchCellParts({ bore: 0.085, wall: 0.02, proud: 0.04, behind: 0.02, depth: 0.45,
        segments: [24, 12] }, P.q, x, W.tubeY, W.plateZ);
      add('turretDetail', tube.rim); add('turretDark', tube.bore);
    }
    add('turretDetail', box(w - 0.10, 0.04, d - 0.20), cx, W.y1 + 0.02, cz - 0.05);                // lid rib
  });
  // the hinge mount on the wall top inboard of the stowed box, the hinge drum on the pivot, and the cradle plate the
  // box lies against, from the wall's lower slope up under the hinge (it closes the slot between wall and box)
  fixed('turretDetail', box(0.12, 0.16, 0.66), W.x0 - 0.06, W.y0 - 0.06, 0.0);
  fixed('turretDetail', cylZ(0.05, 0.74, P.q ? 16 : 10), W.x0, W.y0, 0.0);
  fixed('turretDetail', box(0.11, 0.60, d - 0.04), W.x0 - 0.045, W.y0 - 0.34, cz);
}

// ============================ 268: the Bradley hull shell (source-measured) ===================================
// The registered source's sides: the upper hull side at ±1.57 m carries the bolted appliqué; a skirt course at ±1.70
// hangs from a ledge (1.16..1.27) to a 0.69 m hem, its middle panels lifted to 1.07 over the third to fifth wheels as
// the source has them, its front panel rising into the 1.534 m fender box that falls to 1.27 at the bow; stowage
// boxes stand proud on both sides aft of the turret; the stern's corner boxes reach 2.08 over the track ends.
const BRADLEY_SIDE = Object.freeze({
  faceX: BRADLEY_HULL.sideX, skirtIn: 1.665, skirtOut: 1.70, ledgeIn: 1.565, hem: 0.69, ledgeY: 1.16, ledgeTop: 1.27,
  raisedHem: 1.07, raisedZ: [-0.30, 1.10] as const, rear: -3.05, fenderRear: 2.15, fenderTop: 1.534, bowTop: 1.27,
  bowZ: 3.22, bandSeams: [1.70, 0.20, -1.20, -2.40],
  skirtCuts: [-3.05, -2.20, -1.30, -0.30, 0.40, 1.10, 2.15, 3.22],
});

// An upright plate whose side profile is drawn in the (z, y) plane and which spans x0..x1 (x0 < x1): crisp edges, one
// closed shell, the profile is the silhouette.
function bradleySideProfileSolid(profile: ReadonlyArray<readonly [number, number]>, x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.rotateY(-Math.PI / 2);                  // shape (u = z, v = y), extrusion w  ->  world (x1 - w, v, u)
  geometry.translate(x1, 0, 0);
  return geometry;
}

/** The roof edge's height along the hull (the upper side's top). */
function bradleyEdgeY(z: number): number {
  const H = BRADLEY_HULL;
  return z <= H.glacisTopZ ? H.edgeY : Math.min(H.edgeY, BRADLEY_GLACIS.yAt(z)) - 0.005;
}

function addBradleySideArmor(P: Modern3BuilderPort, sideFittings = true): void {
  const S = BRADLEY_SIDE;
  const { box, cylX, mergeAll, xform } = KIT;
  const skirtProfile: Array<[number, number]> = [
    [S.rear, S.hem], [S.raisedZ[0], S.hem], [S.raisedZ[0] + 0.05, S.raisedHem], [S.raisedZ[1] - 0.05, S.raisedHem],
    [S.raisedZ[1], S.hem], [2.85, S.hem], [S.bowZ, 1.13], [S.bowZ, S.bowTop], [2.75, S.fenderTop],
    [S.fenderRear, S.fenderTop], [S.fenderRear, S.ledgeTop], [S.rear, S.ledgeTop],
  ];
  for (const side of [-1, 1]) {
    const span = (a: number, b: number): [number, number] => side > 0 ? [a, b] : [-b, -a];
    P.add('hull', bradleySideProfileSolid(skirtProfile, ...span(S.skirtIn, S.skirtOut)));
    // the ledge the skirt hangs from, and the front fender box filling up to the bow
    P.add('hull', box(S.skirtIn - S.ledgeIn + 0.005, S.ledgeTop - S.ledgeY, S.fenderRear - S.rear),
      side * (S.ledgeIn + S.skirtIn + 0.005) / 2, (S.ledgeY + S.ledgeTop) / 2, (S.rear + S.fenderRear) / 2);
    P.add('hull', bradleySideProfileSolid([[S.fenderRear, S.ledgeTop], [S.bowZ - 0.02, S.ledgeTop],
      [2.75, S.fenderTop], [S.fenderRear, S.fenderTop]], ...span(1.30, S.skirtIn + 0.005)));
    const faceX = side * (S.faceX + 0.002), skirtFace = side * (S.skirtOut + 0.002);
    for (const z of S.bandSeams) {
      const top = bradleyEdgeY(z) - 0.04;
      P.add('hullDark', box(0.008, top - S.ledgeTop - 0.02, 0.022), faceX, (top + S.ledgeTop + 0.02) / 2, z);
    }
    for (const z of S.skirtCuts.slice(1, -1)) {
      const hem = z > S.raisedZ[0] && z < S.raisedZ[1] ? S.raisedHem : S.hem;
      const top = z > S.fenderRear ? S.fenderTop : S.ledgeTop;
      P.add('hullDark', box(0.008, top - hem - 0.03, 0.022), skirtFace, (top + hem) / 2, z);
    }
    // bolt rows: two along the upper side's plates, two heads at the top of each skirt panel
    const bolts: THREE.BufferGeometry[] = [];
    const head = (x: number, y: number, z: number) => bolts.push(xform(cylX(0.020, 0.016, 6), x, y, z));
    const plates = [S.rear + 0.04, ...[...S.bandSeams].reverse(), 2.10];
    for (let i = 0; i + 1 < plates.length; i++) {
      const z0 = plates[i] + 0.08, z1 = plates[i + 1] - 0.08, n = Math.max(2, Math.round((z1 - z0) / 0.30) + 1);
      for (let k = 0; k < n; k++) {
        const z = z0 + (z1 - z0) * k / (n - 1);
        if (z > -2.05 && z < -1.15) continue;                                   // the side stowage box covers these
        head(side * (S.faceX + 0.005), S.ledgeTop + 0.07, z);
        head(side * (S.faceX + 0.005), bradleyEdgeY(z) - 0.07, z);
      }
    }
    for (let i = 0; i + 1 < S.skirtCuts.length - 1; i++) {
      for (const z of [S.skirtCuts[i] + 0.10, S.skirtCuts[i + 1] - 0.10]) head(side * (S.skirtOut + 0.005), S.ledgeY - 0.04, z);
    }
    P.add('hullDetail', mergeAll(bolts));
    // a grab handle on every full-depth skirt panel (legs into the plate, bar 4.5 cm proud)
    for (let i = 0; i + 1 < S.skirtCuts.length - 1; i++) {
      const z = (S.skirtCuts[i] + S.skirtCuts[i + 1]) / 2;
      const y = z > S.raisedZ[0] && z < S.raisedZ[1] ? 1.11 : 0.92;
      P.add('hullDetail', box(0.012, 0.018, 0.24), side * (S.skirtOut + 0.045), y, z);
      for (const dz of [-0.11, 0.11]) P.add('hullDetail', box(0.047, 0.018, 0.018), side * (S.skirtOut + 0.0215), y, z + dz);
    }
    // (sideFittings false: a full-length tile course covers the side, its boxes, vent and grille: the Ukrainian BRAT)
    if (!sideFittings) continue;
    // side stowage box aft of the turret (source: both sides, z -2.0..-1.2, out to 1.655)
    P.add('hull', box(0.10, 0.655, 0.80), side * (S.faceX + 0.04), 1.5925, -1.60);           // down on to the ledge
    P.add('hullDark', box(0.012, 0.50, 0.012), side * (S.faceX + 0.091), 1.61, -1.60);
    if (side > 0) {
      // left: the louvred vent and the dark detector-paper panel (research/m2a2_bradley 2-side)
      P.add('hull', box(0.03, 0.42, 0.74), side * (S.faceX + 0.013), 1.60, 0.24);
      for (let k = 0; k < 6; k++) P.add('hullDark', box(0.014, 0.028, 0.66), side * (S.faceX + 0.03), 1.43 + k * 0.07, 0.24);
      P.add('hullDark', box(0.006, 0.36, 0.78), side * (S.faceX + 0.003), 1.62, 1.10);
    } else {
      // right: the engine exhaust grille at the front of the upper side (the engine front-right)
      P.add('hull', box(0.03, 0.34, 0.66), side * (S.faceX + 0.013), 1.50, 1.30);
      for (let k = 0; k < 4; k++) P.add('hullDark', box(0.014, 0.028, 0.58), side * (S.faceX + 0.03), 1.38 + k * 0.08, 1.30);
    }
  }
}

// Bow kit: the armoured lamp housings on the fender boxes, the rubber flaps under their noses, the folded trim vane on
// the lower glacis, the driver's hatch on the LEFT (+X) deck behind his periscopes, two tow shackles on the nose.
function addBradleyBowKit(P: Modern3BuilderPort): void {
  const S = BRADLEY_SIDE, G = BRADLEY_GLACIS, H = BRADLEY_HULL;
  const { box, cylY, cylZ, torus, xform } = KIT;
  for (const side of [-1, 1]) {
    const m = (x: number) => side * x;
    // (source: the housings at x 1.1..1.5 up to 1.71 over z 2.7..2.9, on the fender box and the nose shoulder)
    const hz = 2.78, hx = 1.30, hy = 1.59;
    P.add('hull', box(0.24, 0.24, 0.24), m(hx), hy, hz);
    P.add('hullDark', box(0.20, 0.19, 0.02), m(hx), hy, hz + 0.118);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.052, 0.03, P.q ? 16 : 10), 'headlight'), m(hx + 0.045), hy - 0.035, hz + 0.125);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.036, 0.03, P.q ? 12 : 8), 'marker', { tint: 'warm' }),
      m(hx - 0.055), hy + 0.05, hz + 0.125);
    P.add('hullDetail', box(0.26, 0.02, 0.07), m(hx), hy + 0.125, hz + 0.11);
    P.add('hullRubber', box(0.42, 0.24, 0.03), m(1.25), 1.14, S.bowZ + 0.02);
    P.add('hullDetail', box(0.12, 0.10, 0.06), m(0.42), 1.12, H.bowZ - 0.02);
    P.add('hullDetail', xform(torus(0.065, 0.017, 12), 0, 0, 0, Math.PI / 2, 0, 0), m(0.42), 1.02, H.bowZ - 0.012);
  }
  const vaneZ = 2.48, vaneLen = 0.36 / Math.cos(G.angleRad), lift = 0.0225 + 0.008;
  P.add('hull', box(2.24, 0.045, vaneLen), 0, G.yAt(vaneZ) + G.normalOutward.y * lift, vaneZ + G.normalOutward.z * lift, G.angleRad, 0, 0);
  P.add('hullDark', box(2.10, 0.012, 0.03), 0, G.yAt(vaneZ - 0.12) + G.normalOutward.y * (lift + 0.024),
    vaneZ - 0.12 + G.normalOutward.z * (lift + 0.024), G.angleRad, 0, 0);
  // the driver's hatch on the deck behind the glacis break, left of the engine (source: x 0.18..0.68, z 0.78..1.28, top
  // 2.135); low: the turret's floor (2.18) and the bin's (2.20) pass 4.5 cm and more over its lid as they turn
  P.add('hull', cylY(0.25, 0.27, 0.04, P.q ? 20 : 12), 0.43, H.crownY + 0.01, 1.03);
  P.add('hullDetail', cylY(0.23, 0.23, 0.025, P.q ? 20 : 12), 0.43, H.crownY + 0.04, 1.03);
}

// Stern: the troop ramp with its inset door on the LEFT, the hinge tube at its foot, the corner boxes over the track
// ends with their tail lamps.
function addBradleyStern(P: Modern3BuilderPort): void {
  const H = BRADLEY_HULL;
  const { box, cylX, cylZ } = KIT;
  const z = H.sternZ - 0.012;
  P.add('hull', box(1.70, 0.86, 0.03), 0, 1.65, z);                                     // ramp plate between the boxes
  P.add('hullDark', box(0.68, 0.74, 0.008), 0.42, 1.62, z - 0.018);                     // door seam
  P.add('hull', box(0.62, 0.68, 0.016), 0.42, 1.62, z - 0.022);                         // door leaf
  P.add('hullGlass', box(0.12, 0.05, 0.01), 0.42, 1.86, z - 0.033);                     // door vision block
  P.add('hullDetail', box(0.04, 0.14, 0.04), 0.16, 1.55, z - 0.026);                    // door handle
  P.add('hullDetail', cylX(0.035, 1.70, P.q ? 14 : 8), 0, 1.24, z - 0.003);             // ramp hinge tube
  for (const side of [-1, 1]) {
    // the stowage boxes either side of the ramp (source: x 0.86..1.16, y 1.60..2.08, z −3.27..−3.00), their lid seams
    P.add('hull', box(0.30, 0.48, 0.28), side * 1.01, 1.84, -3.14);
    P.add('hullDark', box(0.30, 0.014, 0.008), side * 1.01, 1.98, -3.284);
    // the tail-lamp guard at the corner under the falling roof edge (source: x 1.51..1.55, y 1.35..1.65)
    P.add('hullDetail', box(0.18, 0.24, 0.05), side * 1.44, 1.47, -3.29);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.040, 0.02, P.q ? 14 : 8), 'marker', { tint: 'red' }),
      side * 1.48, 1.50, -3.318, 0, Math.PI, 0);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.030, 0.02, P.q ? 12 : 8), 'marker'), side * 1.40, 1.50, -3.318, 0, Math.PI, 0);
  }
}

function addBradleyHullMarkings(P: Modern3BuilderPort, sideMarkings = true): void {
  if (!sideMarkings) return;
  const S = BRADLEY_SIDE;
  const label = P.spec.visual.number ?? 'C-21';
  for (const side of [-1, 1]) {
    P.decal('hull', 'number', label, 0.42, [side * (S.faceX + 0.004), 1.60, -0.60], side * Math.PI / 2);
  }
  P.decal('hull', 'soot', null, 0.6, [-(S.faceX + 0.003), 1.55, 0.86], -Math.PI / 2);      // aft of the right exhaust
}

// The turret's seat: the turret-owned seat pan and collar close the sight-line under its overhang (inside the
// engine-deck raise's 0.99 m reach). Under the source's A2 turret their undersides stand clear of the deck by 5.5 cm
// (turretSeatClosure), the seam the fleet's race (turretSeatRace.ts, from the regenerated ring receipt) stands in;
// `flush` keeps the pre-268 seat sunk 7 cm into the deck under a turret that seats its own floor on it (the A3, the M6).
function addBradleyTurretSeat(P: Modern3BuilderPort, flush = false): void {
  const { cylY, polyMultiLoft } = KIT;
  const turretSeatPlan = [
    [-0.55, 0.78], [0.55, 0.78], [0.78, 0.55], [0.78, -0.55],
    [0.55, -0.78], [-0.55, -0.78], [-0.78, -0.55], [-0.78, 0.55],
  ];
  P.add('turret', polyMultiLoft(turretSeatPlan, [
    { height: flush ? -0.07 : 0.055, inset: 0.90 },
    { height: 0.13, inset: 1.00 },
  ]));
  if (flush) P.add('turret', cylY(0.82, 0.87, 0.16, P.q ? 22 : 14), 0, 0.005, -0.02);
  else P.add('turret', cylY(0.82, 0.87, 0.105, P.q ? 22 : 14), 0, 0.1075, -0.02);           // up into the shell's floor
}

/** The Bradley playables' shared dressing (m2a2_bradley directly; m3a3_bradley, ua_m2a3_bradley and m6_linebacker
 *  through their wrappers; the Marder takes none of it): the turret seat (`turretSeat`: true under the A2 turret,
 *  'flush' under a turret seating its own floor on the pre-268 sunk seat, false for a turret that brings its own), the
 *  side armour, bow kit, stern and markings (`sideFittings` false: the side boxes, vent, grille and side markings stay off
 *  for a vehicle whose tile course covers the upper side). */
export function bradleyFlankDressing(P: Modern3BuilderPort,
  { turretSeat = true, sideFittings = true }: { turretSeat?: boolean | 'flush'; sideFittings?: boolean } = {}): void {
  if (turretSeat) addBradleyTurretSeat(P, turretSeat === 'flush');
  addBradleySideArmor(P, sideFittings);
  addBradleyBowKit(P);
  addBradleyStern(P);
  addBradleyHullMarkings(P, sideFittings);
  const S = BRADLEY_SIDE;
  P.hullG.userData.bradleySideArmorReceipt = Object.freeze({
    revision: 'source-side-armor-r2',
    upperSide: Object.freeze({ faceX: S.faceX, ledgeTop: S.ledgeTop, edgeY: BRADLEY_HULL.edgeY }),
    skirt: Object.freeze({ innerX: S.skirtIn, outerX: S.skirtOut, hemY: S.hem, raisedHemY: S.raisedHem,
      ledgeInnerX: S.ledgeIn, panels: S.skirtCuts.length - 1, rearZ: S.rear, bowZ: S.bowZ }),
    fenderBox: Object.freeze({ rearZ: S.fenderRear, topY: S.fenderTop, innerX: 1.30 }),
  });
}

// 269 (owner 2026-11-05: "the m3a2 bradley USA should be m2a2 bradley, and our current m2a2 bradley usa should be the
// m3a2 bradley"): the M2A2 is the shared hull under the classic turret (the M3A2's 268 build); the M3A2 is the hull under
// the source turret with the crew bags (the M2A2's 268 build, profiles/m3a2Bradley.ts).
function buildM2A2Bradley(P: TankBuilderPort): void {
  buildBradleyHull(P);
  bradleyFlankDressing(P, { turretSeat: false });
  buildBradleyClassicTurret(P, { deckY: BRADLEY_TURRET_RING.deckY - P.spec.armor.turretPivot[1] });
}

/** The shared hull under the source-measured turret, its flank dressing and the crew bags: the M3A2 (269). */
export const buildBradleySourceTurretIfv = steppedBuilder(function* (P: Modern3BuilderPort): TankProfileBuild {
  yield* buildBradleySteps(P);
  bradleyFlankDressing(P);
  // the crew bags hung on the right side's rear, over the skirt ledge (the owner's source: x −1.86..−1.49, y 1.21..1.76,
  // z −2.62..−2.02); the M3A3's side armour course, the Ukrainian tiles and the M6's kit hold that stretch
  KIT.stowage(P, 'hullCloth', P.rng, [[-1.70, 1.49, -2.48, 0.30, 0.48, 0.30], [-1.69, 1.50, -2.17, 0.28, 0.46, 0.28]]);
});

// ==================================== BMP-2 =================================
// 267 rebuild (owner: "now update the ... bmp2"): the stock Soviet BMP-2 on the shared BMP-1/BMP-2 boat hull and the
// conical two-man turret (profiles/bmpBoatHull.ts: lofted raked sides, fender bins, ribbed glacis, pillow doors).
export function buildBMP2(P: Modern3BuilderPort): void {
  buildBmpBoatHull(P, 'bmp2');
  buildBmp2Turret(P);
}

// ---------------------------------------------------------------------------
// §C missing-side winding guard (BUILD-STANDARD: "every profile that mirrors
// slabs binds through one") — face-outwardness census; re-orders reversed
// rings so mirrored slabs never ship inward-facing (FrontSide-culled) walls.
// Same device as misc.ts orientedSlab / uk.ts sslab. KIT dereferenced at
// call time only.
// ---------------------------------------------------------------------------
function orientedSlab(
  b0: Vec3Tuple,
  b1: Vec3Tuple,
  b2: Vec3Tuple,
  b3: Vec3Tuple,
  t0: Vec3Tuple,
  t1: Vec3Tuple,
  t2: Vec3Tuple,
  t3: Vec3Tuple,
): THREE.BufferGeometry {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4) as Vec3Tuple;
    if (dot(n, sub(fc, cen as Vec3Tuple)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// ---------------------------------------------------------------------------
// §B3.1 MUZZLE BORE (owner directive 2026-08-06: "make tips of guns have
// holes"): the open-ended outer wall carries the last ~4cm of the tube/brake
// to the face and one flat dark cap closes it just behind the marker. The
// visible dark mouth is the factory's universal fallback assembly (rim,
// annulus, disc), which seats on that cap; it used to sit on top of a
// carved recess (inward funnel, finish torus and a disc 3cm inside — 24·seg
// triangles) that it occluded almost entirely. Owner 2026-09-22: "the point
// of adding holes instead of carving them into the barrel is that we save
// on triangles" — the helper now costs 3·seg. Side/plan masks unchanged
// (all interior to the silhouette), no see-through (the cap and the
// caller's own capped body close the collar). Callers end their capped
// tube/brake body ~4.2cm short of faceZ. rearR lets tapered tips (flash
// hiders) continue their cone through the wall; boreR documents the true
// caliber at the call site (the fallback disc is sized from the spec).
// ---------------------------------------------------------------------------
function muzzleBore(
  P: Modern3BuilderPort,
  faceZ: number,
  R: number,
  _boreR: number,
  seg = 14,
  rearR?: number,
) {
  const { cylY, xform } = KIT;
  P.add('gun', xform(cylY(R, rearR ?? R, 0.042, seg, true), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, faceZ - 0.021);
  P.add('gunDark', new THREE.CircleGeometry(R - 0.001, seg), 0, 0, faceZ - 0.002);
}

// ================================== SPz Puma ================================
// NEW VEHICLE (owner order 2026-08-06: "make the spz puma as well", bradley
// recipe as the base). Authored from docs/references/vertex/spz_puma.json —
// the 42manako oracle's gate-frame reads mapped to PUBLISHED dims (x as-is:
// the width anchor already seats the print box at +-1.95; z x1.0418 =
// 7.6/7.295; y x1.0444 = 3.6/3.447 — the print reads -4% uniform under the
// width-anchored safeScale k 0.9615, normalize plan filed in the packet).
// Identity (photo class + print): LOW flat hull under a HIGH one-piece
// sloped bow, unmanned RCT30 turret cluster offset toward the driver side
// (ring re-centered to x +0.15 per the §B8 rework — owner order; print
// autoPivot was +0.435 — z -1.374 held), slim MK30-2
// with muzzle brake, PERI mast to the published 3.6 datum, twin Spike-LR
// box on the turret flank (elevates with the gun, print shooter00/01 ride
// gun_rot), ROSY banks, MUSS heads, 6 big roadwheels + HIGH front drive
// sprocket, heavy near-deck-height modular side armor, rear ramp, twin
// whips. §H.4 tells vs bradley (tall slab + turret cluster + TOW left),
// bmp2 (boat prow + cone) and fv510 (ribbed strakes + manned box turret):
// the Puma reads as a low wedge wearing a flat robotic turret.
export function buildPuma(P: Modern3BuilderPort) {
  const { box, cylY, cylZ, frustum, buildGun, buildRunningGear,
    liftEye, periscope, stowage, torus } = KIT;
  const slab = orientedSlab;                                                    // §C missing-side law
  const { rng } = P;
  const num = P.spec.visual.number || '';
  // ---- hull core: narrow tub between the tracks + full-width upper body --
  // (tub +-1.00: 3cm inboard of the 1.03 band inner face — §B2
  // HOLES-NOT-CHANNELS clarification, the ww2-lane channel-pan class)
  P.add('hull', box(2.00, 0.92, 6.44), 0, 0.94, -0.42);                        // tub +-1.00, belly 0.48..1.40, z -3.64..2.80
  P.add('hull', box(3.32, 0.62, 5.01), 0, 1.71, -1.095);                       // upper body +-1.66, y 1.40..2.02,
                                                                               //   z -3.60..1.41 (SPONSON runs to
                                                                               //   the module inner faces — the
                                                                               //   real Puma's armor bolts flush
                                                                               //   to the hull flank; §B2 flood:
                                                                               //   the r1 1.42 wall left a strap-
                                                                               //   segmented slit, 258 cells)
  P.add('hull', box(1.90, 0.075, 4.90), 0, 2.0475, -1.14);                     // center deck crown +-0.95, top 2.085
  P.add('hull', box(2.84, 0.055, 1.32), 0, 2.1225, -2.95);                     // rear deck step, top 2.15 (print
                                                                               //   2.05-2.07 rear cols x1.0444)
  for (const s of [-1, 1]) {                                                   // side deck strips (front-view
    P.add('hull', box(0.47, 0.045, 4.90), s * 1.185, 2.0325, -1.14);           //   2.00-2.08 band at +-1.10..1.42)
  }
  // ---- THE HIGH SLOPED BOW (§B1: ONE raked surface, slope motivates the
  // mass — flanks and tub meet the plane on its own line). Print side line
  // (extract deckCorners): (1.63,1.92) sweeping unbroken to the nose lip
  // (3.72,1.40). §B8 REWORK: the r1 authored this as a FLAT SLAB (both
  // frustum rings spanned the full bow) + shelf + chamfer — the critic's
  // "chopped nose unit / parked bow". The plate below puts the bottom
  // ring at the NOSE strip and the top ring at the BREAK strip so its
  // front face IS the print's plane; the shelf and chamfer are DELETED.
  // Plan-tapered toward the nose (+-1.42 -> +-1.26, §B8 order 4). ----------
  P.add('hull', frustum(1.42, 1.72, 1.41, 1.30, 1.47, 1.35, 1.92, 2.085));     // break wedge (steep upper course)
  P.add('hull', frustum(1.26, 3.72, 3.58, 1.42, 1.77, 1.63, 1.40, 1.92));      // THE bow plane: (1.40, 3.72) ->
                                                                               //   (1.92, 1.77), one plane, 15 deg
  // bow face plate: makes the +-3.75 side columns BODY-thick (bradley r3
  // registration law — dims hullLengthM anchors here; band 1.00..1.44 well
  // over the 12% filter 0.432); its top edge meets the plane's nose strip
  P.add('hull', box(2.36, 0.44, 0.075), 0, 1.22, 3.7425);
  P.add('hull', frustum(1.00, 3.74, 3.42, 1.00, 3.30, 2.92, 0.66, 0.99));      // lower bow rake back to the belly
                                                                               //   (inter-track +-1.00 — the raised
                                                                               //   sprocket wrap reaches z 3.17 at
                                                                               //   x 1.03..1.47, §B4)
  P.add('hull', frustum(1.00, 3.76, 3.30, 1.00, 3.44, 3.06, 0.99, 1.30));      // nose wedge filler up to the lip
                                                                               //   (print belly line rises to 1.23
                                                                               //   at the nose; closes the slit the
                                                                               //   deleted shelf/chamfer covered)
  P.add('hull', frustum(1.00, 3.42, 2.42, 1.00, 2.92, 2.42, 0.48, 0.67));      // under-bow rise (inter-track)
  for (const s of [-1, 1]) {                                                   // WIDE bow shoulder facets (§B8 rework of the r1 hairline facets —
    // the lifted armor band opened a shoulder notch): one surface folds
    // the plane's tapered side edge out to the sponson front corner
    // (1.66, 1.64, 1.41) and forward to the bow corner (1.42, 1.46,
    // 3.42). §B4: the outer-lower edge line crosses the sprocket station
    // (z 2.658) at y 1.527 — 45 mm over the 1.482 SHOE-STACK envelope
    // top (the first cut used the bare-band 1.395 apex and clipped 12
    // front voxels: pin caps reach x 1.495 and the shoe stack tops
    // 1.482).
    const m = (x: number) => (s < 0 ? -x : x);
    // These eight shoulder datums are not corresponding top/bottom rings:
    // the inward offset made the old caps cross by up to 147 mm. Use their
    // convex armor envelope so the bow keeps its contour with positive stock.
    const shoulder = convexSlab(
      [m(1.26), 1.44, 3.58], [m(1.42), 1.46, 3.42], [m(1.66), 1.64, 1.41], [m(1.42), 1.92, 1.63],
      [m(1.18), 1.48, 3.56], [m(1.34), 1.50, 3.40], [m(1.58), 1.68, 1.43], [m(1.34), 1.96, 1.63]);
    shoulder.userData.primaryStockRole = 'puma-bow-shoulder';
    P.add('hull', shoulder);
  }
  // ---- §B2 NO-AIR NOSE CLOSURE (owner order 2026-08-07, AFV under-glacis
  // round, secondary check — class PRESENT): the bow plane hung over an
  // open nose volume — side-low views read THROUGH under the plane's side
  // edge, over the wrap front, out the far side (probe: 485/494 px windows
  // at z 3.07 / y 1.41 per side; the nose-wedge top 1.30 vs plane underside
  // ~1.44-1.54 left the interior slot the windows aligned with). The print
  // is closed there: its side line sweeps unbroken to the nose lip
  // (3.72,1.40) with the belly line rising to 1.23 at the nose. Inner
  // walls continue the +-1.00 tub line under the plane (§B2 channel-pan:
  // 3 cm inside the 1.03 band inner face; two z-segments so the top chords
  // stay inside the plane wedge as it thins, bottoms riding the under-bow
  // rise then the lower-bow body). Corner walls x 1.00..1.20 close the
  // z 3.20..3.72 window — 3 cm clear of the wrap's z 3.17 reach (§B4),
  // bottom on the face plate's own 1.00 line (the print's rising belly),
  // top sunk into the plane; front tucks into the face-plate band, plan
  // hides under the plane's +-1.26..1.33 nose taper.
  for (const s of [-1, 1]) {
    const m = (x: number) => (s < 0 ? -x : x);
    // inner nose walls (tub-line continuation)
    P.add('hull', orientedSlab(
      [m(0.94), 0.50, 3.30], [m(1.00), 0.50, 3.30], [m(1.00), 0.64, 2.78], [m(0.94), 0.64, 2.78],
      [m(0.94), 1.50, 3.30], [m(1.00), 1.50, 3.30], [m(1.00), 1.63, 2.78], [m(0.94), 1.63, 2.78]));
    P.add('hull', orientedSlab(
      [m(0.94), 0.68, 3.70], [m(1.00), 0.68, 3.70], [m(1.00), 0.75, 3.30], [m(0.94), 0.75, 3.30],
      [m(0.94), 1.402, 3.70], [m(1.00), 1.402, 3.70], [m(1.00), 1.50, 3.30], [m(0.94), 1.50, 3.30]));
    // bow corner walls (the see-through window closure)
    P.add('hull', orientedSlab(
      [m(1.00), 1.00, 3.72], [m(1.20), 1.00, 3.72], [m(1.20), 1.00, 3.20], [m(1.00), 1.00, 3.20],
      [m(1.00), 1.40, 3.72], [m(1.20), 1.40, 3.72], [m(1.20), 1.52, 3.20], [m(1.00), 1.52, 3.20]));
  }
  // tow hooks on the face (plan 3.64@+-0.91 print -> 3.78; rings pulled
  // inside the +-3.80 envelope, §B8 order 5)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.16, 0.14, 0.10), s * 0.91, 1.16, 3.75);
    P.add('hullDark', torus(0.055, 0.016, 10), s * 0.91, 1.14, 3.78, Math.PI / 2, 0, 0);
  }
  // ---- stern: undercut wedge + RAMP (print: bot 0.92@-3.45, ramp band
  // 1.32..2.16 at -3.62..-3.77) --------------------------------------------
  P.add('hull', slab(
    [-1.00, 0.48, -2.88], [1.00, 0.48, -2.88], [1.00, 0.93, -3.46], [-1.00, 0.93, -3.46],
    [-1.00, 1.40, -2.88], [1.00, 1.40, -2.88], [1.00, 1.40, -3.50], [-1.00, 1.40, -3.50]));
  P.add('hull', slab(                                                          // undercut face rising to the ramp
    [-1.00, 0.93, -3.46], [1.00, 0.93, -3.46], [1.00, 1.31, -3.62], [-1.00, 1.31, -3.62],
    [-1.00, 1.40, -3.46], [1.00, 1.40, -3.46], [1.00, 1.40, -3.62], [-1.00, 1.40, -3.62]));
  P.add('hull', box(2.84, 0.76, 0.34), 0, 1.77, -3.43);                        // stern body upper, y 1.39..2.15
  P.add('hull', box(2.88, 0.84, 0.11), 0, 1.735, -3.715);                      // RAMP face +-1.44 (§B8 order 5:
                                                                               //   FULL-width between the posts),
                                                                               //   y 1.315..2.155
  P.add('hullDark', box(0.62, 0.72, 0.03), 0.42, 1.72, -3.775);                // integral door outline
  P.add('hullDetail', cylY(0.04, 0.04, 0.09, 8), 0.72, 1.52, -3.74, Math.PI / 2, 0, 0); // door handle
  P.add('hullDetail', box(2.88, 0.055, 0.055), 0, 2.10, -3.73);                // ramp hinge line (full-width)
  // §B2 FILLED-DECKS hinge web (see-through round 2026-08-08, sweep §5.35
  // rank-9 order): the stern-body rear face (-3.60) to ramp front face
  // (-3.66) seam read SKY top-down — a 364px full-width slot at z -3.63
  // (the rear deck step overhangs only to -3.61). One hinge web plate
  // closes it: y 2.065..2.135 tucks 15 mm under the deck-step/body/ramp
  // tops (side + rear traces unchanged — the corner posts own that band
  // in side view); z -3.68..-3.58 laps 20 mm into both faces; +-1.42 runs
  // post to post. Top-down now reads a recessed hinge deck, not sky.
  P.add('hull', box(2.84, 0.07, 0.10), 0, 2.10, -3.63);
  for (const s of [-1, 1]) {                                                   // stern corner posts + taillights
    P.add('hull', box(0.36, 0.50, 0.30), s * 1.44, 1.90, -3.55);
    P.add('hullDark', box(0.14, 0.07, 0.04), s * 1.38, 1.72, -3.705);
    P.add('hullDetail', box(0.05, 0.05, 0.30), s * 0.72, 0.78, -3.18, 0.55, 0, 0); // ramp stay arms
  }
  // ---- driver station (print 'cover' node: gate x +0.30..0.92, z 0.49..
  // 0.97 -> build z 0.51..1.01 — the hatch sits just ahead of the turret on
  // the SAME side, like the real vehicle) -----------------------------------
  P.add('hull', box(0.56, 0.045, 0.48), 0.61, 2.095, 0.76);                    // hatch plinth on the deck
  P.add('hullDark', box(0.50, 0.02, 0.42), 0.61, 2.125, 0.76);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', 0.38 + k * 0.23, 2.14, 1.06, (1 - k) * 0.12);
  // engine intake louvres RIDE THE BOW PLANE right of the driver side
  // (§B8 order 2 "driver strip + louvers on it"; powerpack forward —
  // plane surface y(z) = 1.92 - (z - 1.77) * 0.2667)
  withSeatRole(P, 'grille', (P) => {                                          // VEH-13: no seat for spare links
    P.add('hullDark', box(1.00, 0.02, 0.72), -0.42, 1.786, 2.35, 0.261, 0, 0);
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.92, 0.026, 0.06), -0.42, 1.721 + k * 0.0427, 2.62 - k * 0.16, 0.261, 0, 0);
    }
    P.add('hullDark', box(0.03, 0.30, 0.62), -1.415, 1.72, 1.95);              // exhaust grille on the left flank
  });
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.045, 0.05, 0.56), -1.42, 1.60 + k * 0.12, 1.95);
  // troop roof hatch seams (flush — §B2-safe)
  P.add('hullDark', box(0.66, 0.015, 1.30), -0.55, 2.09, -2.10);
  P.add('hullDark', box(0.66, 0.015, 1.30), 0.55, 2.09, -2.10);
  // ---- HEAVY MODULAR SIDE ARMOR — §B8 REWORK (critic order 1, the round's
  // headline): the r1 band ran y 0.62..2.13 (an unbroken wall that buried
  // the wheels to ~15% exposure). The band is now the print's own ~1.0 m
  // strip — lower edge 1.00, top step 2.00 — in TWO courses: upper course
  // tucked at x 1.66..1.80, lower course FLARED to x 1.70..1.86 (the
  // front-view trapezoid, §B8 order 6). The 6 wheels (r 0.36) read below
  // it; the open bay behind shows the tub wall like the print. Segmented
  // <=0.48 (§C station end-caps); inner faces 1.66/1.70 clear the +-1.555
  // shoe envelope (§B4). ----------------------------------------------------
  for (const s of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      const zc = 2.20 - 0.49 * k;
      P.add('hull', box(0.14, 0.42, 0.47), s * 1.73, 1.79, zc);                // upper course x 1.66..1.80,
      P.add('hull', box(0.16, 0.60, 0.47), s * 1.78, 1.30, zc);                //   y 1.58..2.00; lower course
      P.add('hullDark', box(0.015, 0.52, 0.016), s * 1.863, 1.29, zc - 0.245); //   x 1.70..1.86, y 1.00..1.60
      P.add('hullDark', box(0.015, 0.36, 0.016), s * 1.803, 1.79, zc - 0.245); //   (flared); seams both courses
    }
    P.add('hull', box(0.16, 0.55, 0.42), s * 1.78, 1.325, -3.11);              // shorter stern module over the
                                                                               //   idler wrap
    // §B2 stern upper course (see-through round 2026-08-08, sweep §5.35):
    // the sponson-to-module strip x 1.66..1.70 read sky top-down over the
    // stern module's own z-band (102/34px slots at z -3.27..-2.94) — the
    // k-loop upper course stopped at -2.935. Same course grammar closes
    // it (x 1.66..1.80, y 1.58..2.00, z -3.32..-2.90 meets the k10 module
    // at -2.935); plan/side/rear interior — sponson wall, k10 course and
    // the trim rail already own those traces.
    P.add('hull', box(0.14, 0.42, 0.42), s * 1.73, 1.79, -3.11);
    P.add('hullDark', box(0.10, 0.05, 5.62), s * 1.76, 2.005, -0.35);          // top trim rail at the band's
                                                                               //   2.00 step
    // mount straps over the module-top seam (§B3.2 busy-ness; the r1
    // slit-bridging job is gone — the sponson now closes it structurally)
    for (const zc of [2.05, 1.10, 0.12, -0.86, -1.84, -2.82]) {
      P.add('hullDetail', box(0.20, 0.05, 0.16), s * 1.72, 2.02, zc);
    }
    // §B2 BOW-QUARTER FENDER CLOSURE (IFV see-through sweep §5.326): the
    // upper body flank ends at z 1.41 and the k-loop armor line at 2.435 —
    // from the top/tilt the strip between the bow shoulder facet's tapering
    // outer edge and the module inner faces read clean through to the
    // ground (1303/1186px corridors at [x ±1.64, z 2.12], 0.26 x 1.2 m per
    // flank). The real Puma runs a closed fender from the sponson front to
    // the bow pods. Two raked fender plates ride the facet's own top line
    // (5 mm under it — §B1 the rake stays the surface): plate 1 spans the
    // corridor along the modules (inner edge sunk into the facet solid,
    // outer 1.70 lapping the module inner faces), plate 2 carries the
    // closure forward to the pod bracket. Undersides hold >=3.5 cm over the
    // 1.482 shoe-stack envelope (§B4; the facet's own 45 mm law), inner
    // faces stay outboard of the 1.495 pin-cap band except where sunk into
    // the facet solid itself. One added course pair extends the armor line
    // over the same window (z 2.46..2.86, meets k0 at 2.435 and the pod
    // bracket at 2.73+ — the stern-module closure grammar, mirrored).
    P.add('hull', orientedSlab(
      [s * 1.51, 1.622, 1.44], [s * 1.70, 1.622, 1.44], [s * 1.70, 1.533, 2.46], [s * 1.41, 1.533, 2.46],
      [s * 1.51, 1.672, 1.44], [s * 1.70, 1.672, 1.44], [s * 1.70, 1.583, 2.46], [s * 1.41, 1.583, 2.46]));
    P.add('hull', orientedSlab(
      [s * 1.41, 1.533, 2.46], [s * 1.82, 1.533, 2.46], [s * 1.82, 1.499, 2.86], [s * 1.36, 1.499, 2.86],
      [s * 1.41, 1.583, 2.46], [s * 1.82, 1.583, 2.46], [s * 1.82, 1.549, 2.86], [s * 1.36, 1.549, 2.86]));
    P.add('hull', box(0.14, 0.42, 0.40), s * 1.73, 1.79, 2.66);                // fwd upper course x 1.66..1.80
    P.add('hull', box(0.16, 0.60, 0.40), s * 1.78, 1.30, 2.66);                // fwd lower course x 1.70..1.86
    P.add('hullDark', box(0.015, 0.52, 0.016), s * 1.863, 1.29, 2.415);        // seams keep the course cadence
    P.add('hullDark', box(0.015, 0.36, 0.016), s * 1.803, 1.79, 2.415);
    // BOW-CORNER MIRROR/SENSOR PODS — the widthM carriers (print's own
    // +-1.93 pods; z-band 0.40 > the 0.35 plan filter so dims reads the
    // published 3.9 datum — bradley LEFT-RACK precedent, certified)
    P.add('hull', box(0.11, 0.36, 0.40), s * 1.89, 2.01, 2.88);
    P.add('hullDark', box(0.08, 0.26, 0.30), s * 1.895, 2.02, 2.88);
    P.add('hullDetail', box(0.52, 0.035, 0.30), s * 1.60, 1.70, 2.88, 0, 0, s * 0.55); // pod bracket: folded plate from
                                                                               //   the shoulder facet (~1.38, 1.56)
                                                                               //   up to the pod underside (~1.82,
                                                                               //   1.84) — plate-solid in the gate
                                                                               //   frontRight mask (the r2 5 cm
                                                                               //   arm AA-vanished at 768 px and
                                                                               //   the pods read as sky-islands:
                                                                               //   floaters 0, 5/5 poses)
    // front mudflaps (clear of the sprocket wrap reach z<=3.11, §B4)
    P.add('hullRubber', box(0.30, 0.22, 0.04), s * 1.24, 1.19, 3.20);
    P.add('hullRubber', box(0.16, 0.30, 0.04), s * 1.68, 0.94, -3.315);        // rear flaps under the lifted
                                                                               //   stern module (bottom 1.05)
  }
  // ---- fittings (§B3.2 density: the type's full common kit) ---------------
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: true, seed: 4,
      // draped along the armor-band top step (§B5: the re-centered pivot
      // at x 0.15 pulls the old deck route inside the core yaw sweep —
      // flank stowage is the real fit anyway)
      pts: [[-1.73, 2.02, -1.20], [-1.70, 2.01, -1.95], [-1.73, 2.02, -2.70]],
    });
    P.hullG.add(cable);
    for (const s of [-1, 1]) {
      const lamp = FITTINGS.lightCluster({ nightKind: 'headlight',
        mats: P.mats, pods: 2, spacing: 0.15, r: 0.048, rake: -0.35, seed: s + 5,
      });
      lamp.position.set(s * 1.06, 1.52, 3.42);                                 // guarded clusters low on the bow
      P.hullG.add(lamp);
      P.add('hullDark', box(0.022, 0.10, 0.15), s * 1.06 - 0.15, 1.53, 3.44);  // brush-guard cheeks
      P.add('hullDark', box(0.022, 0.10, 0.15), s * 1.06 + 0.15, 1.53, 3.44);
      P.add('hullDark', box(0.32, 0.022, 0.16), s * 1.06, 1.60, 3.44);
      const rl = FITTINGS.lightCluster({
        mats: P.mats, pods: 2, spacing: 0.12, r: 0.04, rake: 0, lens: 'dark',
        seed: s + 9, rotation: [0, Math.PI, 0],
      });
      rl.position.set(s * 1.30, 1.80, -3.745);                                 // inside z -3.80 (§B8 order 5:
      P.hullG.add(rl);                                                         //   stern furniture within +-3.8)
    }
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.44, seed: 11, rotation: [0.261, 0, 0],
    });
    links.position.set(-0.72, 1.79, 2.30);                                     // laid on the bow plane left
    P.hullG.add(links);
    // rear-deck kit seated OUTSIDE the bustle yaw sweep (§B5: the RCT30
    // bustle corners sweep r<=1.54 about the RE-CENTERED 0.15/-1.374
    // pivot at y>=2.25 — rack/cans inner corners hold r>=1.56)
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.30, d: 0.42, h: 0.26, rails: 2, fill: 0.65, seed: 13,
      rotation: [0, Math.PI, 0],
    });
    rack.position.set(-0.85, 2.15, -3.12);                                     // loaded rear-deck rack
    P.hullG.add(rack);
    const jc = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 17, rotation: [0, Math.PI / 2, 0] });
    jc.position.set(1.31, 2.15, -3.00);
    P.hullG.add(jc);
    const hw = FITTINGS.antennaWhip({ mats: P.mats, h: 0.95, r: 0.011, rake: 0.05, seed: 6 });
    hw.position.set(-1.30, 2.14, -3.45);                                       // stern whip on the print's own
    P.hullG.add(hw);                                                           //   mast corner (its 3.46 spike col)
  }
  // 2026-10-19 (owner float sweep): the bow eyes stood 174-182 mm over the 1.86 shoulder; set on it (the seat pass
  // closes the last few millimetres)
  liftEye(P, 'hullDetail', -1.30, 1.89, 2.10);
  liftEye(P, 'hullDetail', 1.30, 1.89, 2.10);
  liftEye(P, 'hullDetail', -1.30, 2.12, -2.60);
  liftEye(P, 'hullDetail', 1.30, 2.12, -2.60);
  // (release 240, the owner: "make sure all tank turrets are clear of hulls": the bergen row 0.67 m aft on the flat
  // 2.150 rear deck, 1.56 m off the ring's axis, past the turret's floor (2.155 to 1.45 m), which it stood 7 cm in at rest)
  stowage(P, 'hullCloth', rng, [[0.55, 2.215, -3.22, 0.42, 0.15, 0.60]]);      // strapped bergen row by the rack
  P.decal('hull', 'number', num, 0.34, [1.87, 1.30, -0.35], Math.PI / 2);      // plates on the lower armor course
  P.decal('hull', 'number', num, 0.34, [-1.87, 1.30, -0.35], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.5, [-1.435, 1.75, 1.55], -Math.PI / 2);      // exhaust stain aft of the grille
  // ---- running gear: 6 roadwheels + HIGH FRONT sprocket + raised rear
  // idler (§B6 trapezoid — the print's own ramps). Extract-mapped: wheels
  // y 0.43 r 0.36 at the print's own uneven stations; sprocket z 2.658
  // y 0.965; idler z -2.814 y 0.84. coveredTop: the return run rides under
  // the sponson floor behind the armor modules (§B4 audit semantics). -----
  buildRunningGear(P, {
    // owner 2026-09-23 (round 46 wheel follow-up, census 2R/pitch 0.97): r 0.36 on the 0.743 minimum
    // pitch left a 2 cm gap; r 0.34 (680 mm) keeps the six Puma wheels separate (2R/pitch 0.92, a 6 cm gap).
    style: 'rubber', wheelR: 0.34, wheelW: 0.22, xc: 1.25, dishR: 0.85,
    wheelZs: [1.791, 1.009, 0.247, -0.680, -1.430, -2.173],
    sprocket: { z: 2.658, y: 0.965, r: 0.34 }, idler: { z: -2.814, y: 0.84, r: 0.29 },
    rollers: [[1.40, 1.02], [0.0, 1.02], [-1.55, 1.02]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.44, topY: 1.28, coveredTop: true, paintedEnds: true,
    contactZF: 2.10, contactZR: -2.45,
    padHex: 0x33342a, chainHex: 0x2b2c25, gearFloor: true,
  });
  P.topY = 1.05;

  // ================= UNMANNED RCT30 TURRET — §B8 REWORK: RE-CENTERED to
  // x 0.15 (owner 2026-08-06 "a more centered turret" — the real Puma's
  // ring sits just off centerline, not the print pivot's hard 0.435; the
  // documented residual-2 seat change, honest gate cost accepted) with the
  // MASS CUT to the real low cleaver: walls raked in ~11-13 deg (§B8 order
  // 3, from ~6), crown held at ~2.80, the fat mast base slimmed to a
  // stepped tower. Pivot y/z stay the print's (2.03, -1.374); gun stays at
  // the print's world x 0.085 via the spec gunPivot. All furniture below
  // yaws (§B5); the Spike pod pitches (rig_gun, print shooter00/01). ======
  // ring collar on the deck. Release 240 (the owner: "make sure all tank turrets have a proper turret ring/attachment
  // area"): coaxial with the yaw axis and 16 cm tall, up to the seated turret's 2.155 floor (turretSeatRace.ts), so the
  // seam over the deck reads as the collar. 10 cm forward of the axis its front reached 0.74 m, past the seat's keep
  // radius (0.7365): the seat lifted that wall's corners onto its plane, turning it and the cap inside out (the
  // gun-junction census's openings under the gun).
  P.add('turret', cylY(0.58, 0.64, 0.16, 22), 0, 0.04, 0);
  // core: low flat wedge — roof descends toward the muzzle (print stepped
  // 2.72->2.60 x1.0444); walls rake inward 11-13 deg (§B1 + §B8 order 3).
  P.add('turret', slab(
    [-0.92, 0.06, 0.62], [0.80, 0.06, 0.62], [0.86, 0.06, -1.06], [-0.98, 0.06, -1.06],
    [-0.80, 0.66, 0.44], [0.66, 0.66, 0.44], [0.74, 0.72, -1.06], [-0.86, 0.72, -1.06]));
  P.add('turret', slab(                                                        // raked FRONT face + cheeks (§B1.1
    [-0.92, 0.06, 0.62], [0.80, 0.06, 0.62], [0.80, 0.06, 0.30], [-0.92, 0.06, 0.30], // both cheeks carry the rake)
    [-0.80, 0.66, 0.44], [0.66, 0.66, 0.44], [0.66, 0.66, 0.30], [-0.80, 0.66, 0.30]));
  P.add('turret', slab(                                                        // BUSTLE: z -2.65..-1.06 world-local
    [-0.86, 0.22, -1.06], [0.74, 0.22, -1.06], [0.66, 0.28, -1.28], [-0.78, 0.28, -1.28],
    [-0.80, 0.77, -1.06], [0.68, 0.77, -1.06], [0.60, 0.77, -1.28], [-0.72, 0.77, -1.28]));
  P.add('turret', box(0.56, 0.030, 1.60), -0.06, 0.74, -0.26);                 // roof plate crown, top 2.785
  P.add('turretDark', box(0.52, 0.02, 0.30), -0.06, 0.70, -1.17);              // bustle vent panel
  // PERI MAST (the published 3.6 heightM datum — the print's own 3.35-3.50
  // mast band z -1.29..-1.09 x1.0418; >=5 side columns at the anchor).
  // §B8 order 3: the r1 0.34x0.40 base tower read as a second storey on
  // the block — slimmed to a stepped stalk, head datum EXACT.
  P.addEquipment('turret', box(0.24, 0.42, 0.30), -0.14, 0.90, 0.13);                   // mast base tower (slim)
  P.addEquipment('turret', box(0.18, 0.36, 0.22), -0.14, 1.28, 0.14);                   // mast mid step
  P.addEquipment('turret', box(0.30, 0.145, 0.34), -0.14, 1.4975, 0.14);                // periscope head, top 3.60 EXACT
  P.add('turretDark', box(0.26, 0.075, 0.025), -0.14, 1.50, 0.315);            // hooded window
  P.add('turretGlass', box(0.22, 0.045, 0.012), -0.14, 1.495, 0.327);
  // gunner sight (WAO) hood right of the gun root + MUSS heads (§B3: a
  // sight is a hood + lens, never a bare box)
  P.add('turret', box(0.30, 0.22, 0.26), 0.32, 0.68, 0.42);
  P.add('turretDark', box(0.24, 0.09, 0.03), 0.32, 0.72, 0.555);
  P.add('turretGlass', box(0.20, 0.05, 0.014), 0.32, 0.715, 0.566);
  // MUSS heads SEATED on the roof plane (see-through round 2026-08-08):
  // all four hovered at a flat 0.755 over the raked roof (face reads
  // 0.666..0.714 across the corners) — garage-visible 129px islands at
  // yaw 45 (+1055px in the -T passes), the t64bv1 hovering-bin class.
  // Per-corner seats bury each base >=10 mm into the wedge; caps ride.
  for (const [mx, mz, my] of [[-0.72, 0.30, 0.70], [0.60, 0.02, 0.71], [-0.66, -0.92, 0.749], [0.56, -0.92, 0.749]]) {
    P.add('turretDetail', cylY(0.045, 0.05, 0.09, 10), mx, my, mz);            // MUSS sensor heads at the raked
    P.add('turretDark', cylY(0.04, 0.04, 0.02, 10), mx, my + 0.055, mz);       //   wall-top corners
  }
  P.add('turretDetail', cylY(0.06, 0.05, 0.16, 10), -0.40, 0.76, -0.30);       // MUSS jammer mast (seated: base
  P.add('turretDark', cylY(0.055, 0.055, 0.03, 10), -0.40, 0.86, -0.30);       //   0.68 buried, roof 0.690 there)
  // ROSY banks BOTH front corners (splayed, on bracket plates)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.10, 0.26), s < 0 ? -0.80 : 0.68, 0.30, 0.42, 0, s * 0.5, 0);
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.036, len: 0.22, pitch: -0.35,
      splay: s * 0.95, spacing: 0.09, seed: 7 + s,
    });
    bank.position.set(s < 0 ? -0.72 : 0.60, 0.42, 0.50);
    P.turretG.add(bank);
  }
  // turret whip on the bustle corner (the second of the twin whips)
  {
    const tw = FITTINGS.antennaWhip({ mats: P.mats, h: 0.72, r: 0.010, rake: -0.04, seed: 9 });
    tw.position.set(-0.70, 0.77, -1.10);
    P.turretG.add(tw);
    // grab rail / cable run on the roof (§B3.2 busy-ness). §B2 flush seat
    // (see-through round 2026-08-08): the rail floated ~4 cm over the
    // raked roof — the turret-only side passes flood-enclosed the 6 mm
    // under-rail sliver (320px y0-side-l-T / 396px y45-fql-T; r1 standoff
    // feet only SEGMENTED it, 336px). The run now pitches with the roof
    // plane (rx 0.0403 = the wedge's own 0.06/1.50 slope) and sits 5 mm
    // proud (bottom edge buried along the whole 0.92 m run — roof face
    // reads 0.688..0.717 under it).
    P.add('turretDetail', box(0.025, 0.025, 0.92), 0.56, 0.71, -0.62, 0.0403, 0, 0);
    P.add('turretDetail', box(0.025, 0.06, 0.48), -0.86, 0.55, -0.42);
  }
  P.decal('turret', 'number', num, 0.20, [0.80, 0.36, -0.55], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-0.90, 0.36, -0.55], -Math.PI / 2);
  // ---- SPIKE-LR TWIN POD on the turret flank — PITCHES with the gun (the
  // print's shooter00/01 ride gun_rot; bradley TOW precedent, §B5-legal:
  // recoilG rides under rig_turret). Print pod: x 1.16..1.62 world, y
  // 2.28..2.65, z -1.66..-0.36 build. Gun frame (pivot world 0.085, 2.55,
  // -0.82): x 1.07..1.53, y -0.27..+0.10, z -0.84..+0.46. ------------------
  weaponAssembly(P, () => {
    P.addGunExtra(box(0.46, 0.37, 1.30), 1.30, -0.085, -0.19);                   // armored twin-tube box
    P.addGunExtra(box(0.40, 0.05, 1.20), 1.30, 0.125, -0.19);                    // lid rib
    P.addGunExtraDark(cylZ(0.105, 0.05, 14), 1.19, -0.02, 0.44);                 // upper-left tube muzzle
    P.addGunExtraDark(cylZ(0.105, 0.05, 14), 1.41, -0.02, 0.44);                 // upper-right tube muzzle
    P.addGunExtra(box(0.44, 0.22, 0.30), 0.95, -0.10, -0.30);                    // elevation arm to the turret wall
                                                                                 //   (lengthened: the re-centered
                                                                                 //   core wall sits at world ~0.95,
                                                                                 //   the pod holds its print seat)
    P.addGunExtraDark(box(0.42, 0.30, 0.05), 1.30, -0.09, -0.86);                // rear door panel
  });
  // ---- 30 mm MK30-2/ABM (§B3.1: cylinders only — cast collar, slim tube,
  // stepped muzzle brake; the coax MG4 is the census MG, FITTINGS-stamped).
  // Tube axis y 2.55 world at x +0.085 (print fused-tube plan band). -------
  P.addGunExtra(cylZ(0.075, 0.30, 14, 0.10), 0, 0, 0.30);                      // cast mantlet collar
  P.addGunExtra(box(0.20, 0.24, 0.55), 0, -0.02, 0.16);                        // cradle housing (behind the collar)
  buildGun(P, { len: 0.80, r: 0.034, sleeve: false, evac: null, collar: false, baseR: 0.062 });
  P.addGunExtra(cylZ(0.040, 0.62, 12, 0.046), 0, 0, 0.86);                     // root sleeve segment
  P.add('gun', cylZ(0.030, 1.98, 24), 0, 0, 2.14);                             // slim tube, z rel 1.15..3.13
  P.add('gun', cylZ(0.048, 0.14, 12), 0, 0, 3.18);                             // muzzle brake body, 3.11..3.25
  P.add('gunDark', cylZ(0.052, 0.018, 12), 0, 0, 3.135);                       // brake baffle rings
  P.add('gunDark', cylZ(0.052, 0.018, 12), 0, 0, 3.22);
  // §B3.1 MUZZLE BORE through the brake face (autocannon-class disc)
  muzzleBore(P, 3.29, 0.048, 0.017, 12);
  P.muzzleZ = 3.29;                                                            // true muzzle anchor (world 2.47)
  {
    // coax 5.56 MG4 in the mantlet cheek (the crew MG — census via FITTINGS
    // per the AFV-lane brief; integrated, not a pintle: the RCT30 is
    // unmanned). Barrel pokes from a dark port right of the main tube.
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', scale: 0.55, tone: 'dark', elev: 0.0,
      ammo: false, seed: 21,
    });
    mg.position.set(0.30, -0.14, 0.42);                                        // recessed against the collar step
    P.gunG.add(mg);
    P.add('gunDark', cylZ(0.024, 0.03, 10), 0.30, 0.03, 0.62);                 // coax port ring
  }
}

// ================================= Type 89 IFV ==============================
// NEW VEHICLE, PHOTO CLASS (owner order 2026-08-06; this build NEVER
// gates: dims/floaters/§B battery + 14-view self-reads are the bars).
// Authored to the real vehicle's configuration at published dims (6.8 x 3.2
// x 2.5, KDE muzzle overhangs to 7.3): boxy welded hull under a LONG
// one-piece sloped glacis (nearly half the vehicle), driver front-RIGHT on
// the plane, engine louvres front-LEFT, two-man turret seated CENTER-RIGHT
// with the 35 mm KDE (thick stepped tube + conical flash hider) and the
// identity tell — Type 79 Jyu-MAT missile boxes on BOTH turret flanks.
// 6 roadwheels, firing ports along the hull rear sides, thin skirts,
// Sumitomo 12.7 pintle at the commander ('m2' trim — national-grammar law).
// §H.4 tells vs bradley (short steep glacis, TOW left only), puma (low
// wedge + robot turret) and fv510 (ribbed strakes): the Type 89 reads as a
// long flat wedge wearing a small square turret with winged missile boxes.
function buildType89ProwSide(P: Modern3BuilderPort, side: number) {
  const { box } = KIT;
  const slab = orientedSlab;
  P.add('hull', slab(                                                         // sprocket-wrap glacis facet
    [side < 0 ? -1.42 : 1.30, 1.82, 1.50], [side < 0 ? -1.30 : 1.42, 1.82, 1.50],
    [side < 0 ? -1.30 : 1.42, 1.12, 2.90], [side < 0 ? -1.42 : 1.30, 1.12, 2.85],
    [side < 0 ? -1.42 : 1.345, 1.855, 1.50], [side < 0 ? -1.345 : 1.42, 1.855, 1.50],
    [side < 0 ? -1.345 : 1.42, 1.155, 2.90], [side < 0 ? -1.42 : 1.345, 1.155, 2.85]));
  // The prow side follows the glacis bottom edge and closes the wrap bay.
  const mirror = (x: number) => (side < 0 ? -x : x);
  P.add('hull', slab(
    [mirror(1.40), 1.02, 2.90], [mirror(1.44), 1.02, 2.90], [mirror(1.44), 1.26, 1.50], [mirror(1.40), 1.26, 1.50],
    [mirror(1.40), 1.12, 2.90], [mirror(1.44), 1.12, 2.90], [mirror(1.44), 1.82, 1.50], [mirror(1.40), 1.82, 1.50]));
  P.add('hull', box(0.04, 0.56, 0.30), mirror(1.42), 1.54, 1.38);
  P.add('hull', slab(
    [mirror(1.40), 0.62, 2.90], [mirror(1.44), 0.62, 2.90], [mirror(1.44), 0.62, 3.14], [mirror(1.40), 0.62, 3.14],
    [mirror(1.40), 1.12, 2.90], [mirror(1.44), 1.12, 2.90], [mirror(1.44), 1.00, 3.14], [mirror(1.40), 1.00, 3.14]));
  P.add('hull', slab(
    [mirror(1.10), 0.60, 3.10], [mirror(1.44), 0.60, 3.10], [mirror(1.44), 0.60, 3.16], [mirror(1.10), 0.60, 3.16],
    [mirror(1.10), 1.00, 3.10], [mirror(1.44), 1.00, 3.10], [mirror(1.44), 1.00, 3.16], [mirror(1.10), 1.00, 3.16]));
}

function buildType89Hull(P: Modern3BuilderPort) {
  const { box, cylY, frustum, buildRunningGear,
    liftEye, periscope, stowage, shovelTool, sph } = KIT;
  const slab = orientedSlab;                                                    // §C missing-side law
  const { rng } = P;
  const num = P.spec.visual.number || '';
  // ---- hull: tub + full-width upper body under the flat rear deck --------
  // (tub +-0.95: 3cm inboard of the 0.98 band inner face — §B2
  // HOLES-NOT-CHANNELS clarification)
  P.add('hull', box(1.90, 0.90, 5.95), 0, 0.90, -0.325);                       // tub +-0.95, belly 0.45, z -3.30..2.65
  P.add('hull', box(2.90, 0.50, 4.58), 0, 1.52, -1.04);                        // upper body +-1.45, y 1.27..1.77, z -3.33..1.25
  P.add('hull', box(2.80, 0.045, 4.44), 0, 1.7575, -1.10);                     // deck plate, top 1.78, z -3.32..1.12
  // ---- THE SLOPED FRONT (§B8 rework, owner 2026-08-06 "needs a sloped
  // front" + critic target numbers: nose y~0.9 -> crest y~1.86 over ~1.9 m
  // of z at ~27 deg). r1 ROOT CAUSE: the old frustum call spanned BOTH
  // rings over the full bow (flat stacked slabs — profile read RECTANGLE);
  // a raked PLATE puts the bottom ring at the NOSE strip and the top ring
  // at the CREST strip so the front face IS the glacis plane (§B1). -------
  P.add('hull', frustum(1.42, 3.36, 3.20, 1.30, 1.60, 1.44, 0.90, 1.86));      // THE glacis plane: (0.90, 3.36) ->
                                                                               //   (1.86, 1.60) — one plane, 27 deg
  P.add('hull', slab(                                                          // crest knuckle down to the deck
    [-1.42, 1.78, 1.48], [1.42, 1.78, 1.48], [1.42, 1.78, 1.10], [-1.42, 1.78, 1.10],
    [-1.32, 1.86, 1.50], [1.32, 1.86, 1.50], [1.32, 1.86, 1.38], [-1.32, 1.86, 1.38]));
  P.add('hull', box(2.40, 0.34, 0.26), 0, 0.77, 3.28);                         // nose block: bow face plate at
                                                                               //   3.41 (body-thick column, y
                                                                               //   0.60..0.94 = 0.34 > the 0.30
                                                                               //   12% filter), z 3.15..3.41
  P.add('hull', frustum(0.95, 3.40, 3.00, 0.95, 3.05, 2.60, 0.46, 0.66));      // lower bow rake to the belly
                                                                               //   (inter-track +-0.95 — the raised
                                                                               //   sprocket wrap reaches z 3.09 at
                                                                               //   the band, §B4); top tucks under
                                                                               //   the nose block bottom 0.60
  for (const side of [-1, 1]) buildType89ProwSide(P, side);
  // ---- stern: near-vertical face + power door (the Type 89 rear) ---------
  P.add('hull', slab(
    [-0.95, 0.45, -3.02], [0.95, 0.45, -3.02], [0.95, 0.56, -3.30], [-0.95, 0.56, -3.30],
    [-0.95, 1.27, -3.02], [0.95, 1.27, -3.02], [0.95, 1.27, -3.32], [-0.95, 1.27, -3.32]));
  P.add('hull', box(2.90, 0.55, 0.16), 0, 1.50, -3.32);                        // stern upper band
  P.add('hull', box(2.10, 1.06, 0.09), -0.10, 1.16, -3.375);                   // door panel face at -3.40..-3.42
  P.add('hullDark', box(0.72, 0.94, 0.025), 0.22, 1.14, -3.425);               // door leaf outline
  P.add('hullDetail', cylY(0.04, 0.04, 0.09, 8), 0.55, 1.02, -3.41, Math.PI / 2, 0, 0);
  for (const hy of [0.78, 1.48]) P.add('hullDetail', box(0.07, 0.12, 0.05), -0.62, hy, -3.40); // hinge stacks
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, 0.42, 0.26), s * 1.28, 1.52, -3.32);               // corner bins with lid seams
    P.add('hullDark', box(0.35, 0.014, 0.27), s * 1.28, 1.675, -3.32);
    P.add('hullDetail', box(0.06, 0.09, 0.02), s * 1.28, 1.42, -3.44);         // latches
    P.add('hullDark', box(0.13, 0.06, 0.04), s * 1.10, 0.92, -3.42);           // taillights
    if (s > 0) P.add('hullDetail', box(0.11, 0.05, 0.04), 1.0, 0.92, -3.40);   // lamp bracket off the door panel edge (the right lamp stood 85 mm off it: owner 2026-10-19 sweep)
    P.add('hullDetail', box(0.05, 0.05, 0.26), s * 0.55, 0.62, -3.16, 0.5, 0, 0); // tow eyes under the door
  }
  // ---- driver front-RIGHT ON the glacis plane (+ periscope row); engine
  // louvres front-LEFT recessed in a raised frame (§B3 grammar). All seats
  // follow the NEW 27-deg plane: y(z) = 1.86 - (z - 1.60) * 0.5455. --------
  P.add('hull', box(0.56, 0.06, 0.56), 0.78, 1.70, 1.95, 0.499, 0, 0);        // hatch plinth on the plane
  P.add('hullDark', box(0.50, 0.02, 0.48), 0.78, 1.74, 1.94, 0.499, 0, 0);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', 0.56 + k * 0.22, 1.87, 1.58, (1 - k) * 0.10);
  // VEH-13: the engine louvres and their frame are a grille to the spare-link seat solver
  withSeatRole(P, 'grille', (P) => {
  P.add('hull', box(1.10, 0.055, 1.05), -0.62, 1.505, 2.30, 0.499, 0, 0);     // louvre frame on the plane
  for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(1.00, 0.02, 0.13), -0.62, 1.325 + k * 0.0927, 2.64 - k * 0.17, 0.499, 0, 0);
  }  });

  P.add('hullDark', box(0.03, 0.26, 0.72), -1.44, 1.50, 0.10);                 // exhaust cowl LEFT flank
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.045, 0.05, 0.64), -1.445, 1.40 + k * 0.10, 0.10);
  P.add('hullDetail', box(0.72, 0.025, 0.035), -0.35, 1.28, 2.72, 0.499, -0.20, 0); // splash rail V on the plane
  P.add('hullDetail', box(0.72, 0.025, 0.035), 0.35, 1.28, 2.72, 0.499, 0.20, 0);
  // ---- FIRING PORTS along the hull rear sides (identity cue): dark ball
  // port + vision block above, 3 per side ----------------------------------
  for (const s of [-1, 1]) {
    for (const zc of [-1.35, -2.05, -2.75]) {
      P.add('hullDark', scaledGeometryTransform(sph(0.05, 10), 0, 0, 0, 0, 0, 0, [0.55, 1, 1]), s * 1.455, 1.38, zc);
      P.add('hullDark', box(0.045, 0.045, 0.10), s * 1.456, 1.56, zc + 0.09);
      P.add('hullGlass', box(0.047, 0.02, 0.08), s * 1.457, 1.565, zc + 0.09);
    }
  }
  // ---- STRONG fender line + THIN skirt strip only (§B8 rework: the r1
  // 0.59..1.21 panel bank buried ~70% of the wheels — the real Type 89
  // runs a thin strip over the track top edge with the 6 wheels nearly
  // fully visible below; §B8.1 gate 1 wheels countable). Width anchor
  // stays the fender plank faces at the committed +-1.60 = the 3.2 datum
  // (full-length z-band for the plan recipe; §D one-anchor law). -----------
  for (const s of [-1, 1]) {
    P.add('hull', box(0.24, 0.05, 2.55), s * 1.475, 1.295, 1.60);              // front fender plank
    P.add('hull', box(0.24, 0.05, 3.30), s * 1.475, 1.295, -1.72);             // rear fender plank
    P.add('hullDark', box(0.20, 0.028, 5.60), s * 1.46, 1.262, -0.10);         // fender shadow line (the strong
                                                                               //   horizontal tell under the lip)
    P.add('hull', box(0.025, 0.24, 0.44), s * 1.5875, 1.19, 2.10);             // outer rail chunks (segmented
    P.add('hull', box(0.025, 0.24, 0.44), s * 1.5875, 1.19, 0.55);             //   <=0.48 — §C end caps; the
    P.add('hull', box(0.025, 0.24, 0.44), s * 1.5875, 1.19, -0.90);            //   +-1.60 width carriers)
    P.add('hull', box(0.025, 0.24, 0.44), s * 1.5875, 1.19, -2.35);
    P.add('hull', box(0.03, 0.20, 5.70), s * 1.50, 1.02, -0.10);               // THIN skirt strip y 0.92..1.12
    P.add('hullDark', box(0.014, 0.16, 0.015), s * 1.516, 1.01, 1.40);         //   over the track top edge only
    P.add('hullDark', box(0.014, 0.16, 0.015), s * 1.516, 1.01, -0.10);        //   (panel seams)
    P.add('hullDark', box(0.014, 0.16, 0.015), s * 1.516, 1.01, -1.60);
    // 2026-10-19 (owner float sweep): the strip hung 45 mm off the hull with its hangers 25-35 mm short of both the
    // fender plank and the strip (the fore one past the strip's end); the hangers now run plank to strip
    P.add('hullDetail', box(0.05, 0.16, 0.26), s * 1.50, 1.195, 2.60);         // skirt hangers fore/aft
    P.add('hullDetail', box(0.05, 0.16, 0.26), s * 1.50, 1.195, -2.90);
    P.addMudguard(`modern3-front-flap-${s}`, 'hullRubber',
      box(0.26, 0.20, 0.035), s * 1.18, 0.98, 3.06);                          // front mudflaps
    P.hangMudguard(`modern3-rear-flap-${s}`, 'hullRubber',
      box(0.26, 0.24, 0.035), s * 1.18, 0.78, -3.28);                         // rear mudflaps
    // Transverse hangers connect the inboard curtains to the fixed skirt
    // rail instead of leaving their outer edges suspended in the track bay.
    for (const [z, y] of [[3.06, 1.055], [-3.28, 0.875]]) {
      P.add('hullDark', box(0.32, 0.05, 0.06), s * 1.34, y, z);
    }
  }
  // ---- fittings (§B3.2 density) -------------------------------------------
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: true, seed: 8,
      pts: [[0.85, 1.79, -1.35], [1.15, 1.78, -1.95], [0.90, 1.79, -2.60]],
    });
    P.hullG.add(cable);
    for (const s of [-1, 1]) {
      const lamp = FITTINGS.lightCluster({ nightKind: 'headlight',
        mats: P.mats, pods: 2, spacing: 0.14, r: 0.045, rake: -0.45, seed: s + 4,
      });
      lamp.position.set(s * 1.12, 1.04, 3.16);                                 // guarded clusters low on the new
      P.hullG.add(lamp);                                                       //   plane (y(3.16) = 1.01)
      P.add('hullDark', box(0.30, 0.02, 0.15), s * 1.12, 1.13, 3.17);          // guard hoods
      // wing mirrors on stalks (JGSDF road fit), heads inside the anchor —
      // §B8 trim: the r1 0.42 stalks + 0.20 heads read as a frame across
      // the new steep glacis; shrunk to real mirror scale
      P.add('hullDark', box(0.022, 0.30, 0.022), s * 1.26, 1.32, 2.58, -0.499, 0, 0);
      P.add('hullDetail', box(0.13, 0.17, 0.02), s * 1.31, 1.50, 2.46, 0, s * 0.35, 0.05);
      P.add('hullDark', box(0.10, 0.13, 0.012), s * 1.31, 1.50, 2.47, 0, s * 0.35, 0.05);
    }
    const jc = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 19, rotation: [0, -Math.PI / 2, 0] });
    jc.position.set(-1.05, 1.78, -2.90);                                       // water cans rear-left
    P.hullG.add(jc);
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.05, d: 0.30, h: 0.24, fill: 0.9, seed: 23, rotation: [0, Math.PI, 0],
    });
    rack.position.set(0.45, 1.78, -3.02);                                      // loaded rear-deck basket
    P.hullG.add(rack);
    const hw = FITTINGS.antennaWhip({ mats: P.mats, h: 1.0, r: 0.010, rake: 0.06, seed: 5 });
    hw.position.set(1.32, 1.77, -3.10);
    P.hullG.add(hw);
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 3, width: 0.36, seed: 14, rotation: [0.499, 0, 0],
    });
    links.position.set(-0.55, 1.46, 2.32);                                     // laid on the glacis left-low
    P.hullG.add(links);                                                        //   (plane y(2.32) = 1.467)

  }
  shovelTool(P, -1.42, 1.325, -1.30, 0.85);                                    // pioneer tools on the left fender
  liftEye(P, 'hullDetail', -1.25, 1.78, -0.35);
  liftEye(P, 'hullDetail', 1.25, 1.78, -0.35);
  stowage(P, 'hullCloth', rng, [[-0.85, 1.82, -1.90, 0.40, 0.14, 0.70]]);      // strapped roll by the cans
  P.decal('hull', 'number', num, 0.30, [1.452, 1.52, -0.90], Math.PI / 2);     // JGSDF plates on the hull side
  P.decal('hull', 'number', num, 0.30, [-1.452, 1.52, -0.90], -Math.PI / 2);   //   (the skirt bank is gone)
  P.decal('hull', 'soot', null, 0.45, [-1.452, 1.42, -0.45], -Math.PI / 2);
  // ---- running gear: BRADLEY TRACK SHAPE (owner order 2026-08-06 "the
  // same track shape as bradley"): 6 wheels + FRONT sprocket at the
  // m2a2_bradley heights (0.60) + rear idler RAISED to its 0.70 class —
  // the raised-end trapezoid with the contact patch pinned inside the end
  // wheels; coveredTop DROPPED (the bradley runs open link pads on the
  // return run — the thin fender strip rides above them). §B6 by
  // construction. -----------------------------------------------------------
  buildRunningGear(P, {
    // Tire width 0.27 (round 40 axial fit): the Type 90 forging this hull draws is 1.38 x its radius wide; the 0.20
    // band and the 0.40 track bounded it to 0.66 of its proportion.
    style: 'rubber', wheelR: 0.32, wheelW: 0.27, xc: 1.18, dishR: 0.84,
    wheelZs: [2.05, 1.23, 0.41, -0.41, -1.23, -2.05],
    sprocket: { z: 2.62, y: 0.60, r: 0.26 }, idler: { z: -2.62, y: 0.70, r: 0.27 },
    rollers: [[1.30, 0.88], [0.0, 0.88], [-1.30, 0.88]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.40, topY: 0.95, paintedEnds: true,
    contactZF: 2.18, contactZR: -2.18,
    padHex: 0x32332a, chainHex: 0x2a2b24, gearFloor: true,
  });
  P.topY = 0.95;
}

function buildType89Turret(P: Modern3BuilderPort) {
  const { box, cylY, cylZ, buildGun, stowage, torus, xform } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const num = P.spec.visual.number || '';
  // ================= two-man turret CENTER-RIGHT (pivot +0.25, ring 1.80):
  // §B8 REWORK (owner 2026-08-06): the r1 0.44-tall box read as a recessed
  // sliver — walls now stand 0.56 proud and NEAR-VERTICAL (the real welded
  // drum-sided box), roof 2.40 world with the 2.5 anchor cluster on top
  // (proud read ~0.72 incl. cluster), thick KDE MANTLET BLOCK at the face,
  // Jyu-MAT boxes RAISED to wall-top height so they read in profile (the
  // tell). The r1 roof M2 is DELETED — the real Type 89 carries NO roof
  // HMG (35 mm + coax + Jyu-MAT only; §B7 ref-wrong class, critic order
  // 4). Everything yaws (§B5). =============================================
  P.add('turret', cylY(0.60, 0.66, 0.09, 20), 0, 0.005, -0.05);                // base ring collar
  P.add('hull', cylY(0.72, 0.75, 0.045, 20), 0.25, 1.755, -0.10);              // hull splash collar under the ring
  P.add('turret', slab(                                                        // body walls, near-vertical (~4 deg)
    [-0.76, 0.02, 0.46], [0.76, 0.02, 0.46], [0.72, 0.02, -0.74], [-0.72, 0.02, -0.74],
    [-0.72, 0.58, 0.43], [0.72, 0.58, 0.43], [0.68, 0.58, -0.72], [-0.68, 0.58, -0.72]));
  P.add('turret', slab(                                                        // raked FACE plate + cheek returns
    [-0.58, 0.02, 0.78], [0.58, 0.02, 0.78], [0.76, 0.02, 0.48], [-0.76, 0.02, 0.48],
    [-0.50, 0.58, 0.64], [0.50, 0.58, 0.64], [0.72, 0.58, 0.42], [-0.72, 0.58, 0.42]));
  P.add('turret', slab(                                                        // roof plate (weld chamfer), top
    [-0.72, 0.58, 0.44], [0.72, 0.58, 0.44], [0.68, 0.58, -0.71], [-0.68, 0.58, -0.71],  // 2.42 world
    [-0.66, 0.62, 0.38], [0.66, 0.62, 0.38], [0.62, 0.62, -0.66], [-0.62, 0.62, -0.66]));
  P.add('turret', box(1.08, 0.38, 0.28), 0, 0.21, -0.86);                      // welded bustle stub
  // ---- Jyu-MAT LAUNCHER BOXES both flanks (THE identity tell): single-
  // tube armored box on a wall bracket + support strut, tilted up 8 deg,
  // seated at wall-top height so the wings read in side profile ------------
  // 2026-10-21 (owner: launch tubes "like the object 695, and tagil"): each box is an open pack, four walls and a back
  // plate around a perforated front plate 4 cm inside them; the tube is a rim collar 1 cm proud of the walls around a
  // dark liner and sealed terminal 9 cm deep, on the unchanged launch axis (the dark door and disc read as no tube).
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const at = [s * 0.92, 0.32, -0.16, -0.14, 0, 0] as const;
      for (const x of [-0.165, 0.165]) P.add('turret', xform(box(0.03, 0.31, 0.92), x, 0, 0), ...at);
      for (const y of [-0.165, 0.165]) P.add('turret', xform(box(0.36, 0.03, 0.918), 0, y, -0.001), ...at);
      P.add('turret', xform(box(0.31, 0.31, 0.03), 0, 0, -0.44), ...at);
      P.add('turretDetail', xform(perforatedPlate(0.31, 0.31, 0.02, [[0, 0]], 0.095, P.q ? 24 : 12), 0, 0, 0.42), ...at);
      // A sealed terminal 9 cm behind the mouth, Object 695's recess: the pod's 8-degree tilt would let a deep bore read
      // as enclosed air to the interior-fill voxels, which then box it in.
      // Critic round: the face plate 4 cm inside the walls, so the collar stands 5 cm proud; terminal unchanged at 0.38.
      const cell = { bore: 0.085, wall: 0.02, proud: 0.05, behind: 0.02, depth: 0.04, segments: [24, 12] as const };
      const tube = launchCellParts(cell, P.q, 0, 0, 0.42);
      P.add('turretDetail', tube.rim, ...at);
      P.add('turretDark', tube.bore, ...at);
      declareLaunchBore(P.turretG, new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(at[3], at[4], at[5])), new THREE.Vector3(1, 1, 1)), cell, 0, 0, 0.42);
      P.add('turretDetail', box(0.36, 0.05, 0.06), s * 0.92, 0.17, -0.55);       // rear cap rib
      P.add('turret', box(0.05, 0.28, 0.52), s * 0.73, 0.30, -0.20);             // wall bracket
      P.add('turretDetail', box(0.04, 0.04, 0.36), s * 0.85, 0.12, 0.14, 0, 0, s * 0.6); // support strut
    }
  });
  // ---- commander cupola RIGHT + gunner station LEFT (the 2.5 heightM
  // anchor cluster rides the new roof: lid top 2.52, sight head 2.49) ------
  P.add('turret', cylY(0.24, 0.27, 0.06, 16), 0.33, 0.65, -0.26);              // cupola ring on the roof
  P.add('turret', cylY(0.245, 0.245, 0.04, 16), 0.33, 0.70, -0.26);            // hatch lid, top 2.52
  P.add('turretDark', torus(0.245, 0.012, 16), 0.33, 0.735, -0.26);
  for (let k = 0; k < 4; k++) {                                                // cupola periscope arc
    P.add('turretDark', box(0.06, 0.05, 0.045), 0.15 + k * 0.12, 0.685, -0.04 - Math.abs(1.5 - k) * 0.03);
    P.add('turretGlass', box(0.05, 0.024, 0.047), 0.15 + k * 0.12, 0.69, -0.035 - Math.abs(1.5 - k) * 0.03);
  }
  P.addEquipment('turret', box(0.30, 0.18, 0.26), -0.30, 0.60, 0.36);                   // gunner sight hood (top 2.49 =
  P.add('turretDark', box(0.24, 0.08, 0.03), -0.30, 0.655, 0.50);              //   the published heightM anchor)
  P.add('turretGlass', box(0.20, 0.045, 0.014), -0.30, 0.65, 0.512);
  P.add('turret', cylY(0.20, 0.20, 0.03, 14), -0.32, 0.635, -0.34);            // gunner hatch flush on the roof
  P.add('turretDark', torus(0.20, 0.010, 14), -0.32, 0.655, -0.34);
  P.add('turretDetail', box(0.025, 0.025, 0.72), 0.64, 0.655, -0.14);          // roof grab rails
  P.add('turretDetail', box(0.025, 0.025, 0.72), -0.62, 0.655, -0.14);
  for (const x of [0.64, -0.62]) for (const dz of [-0.30, 0.30]) P.add('turretDetail', box(0.025, 0.05, 0.025), x, 0.63, -0.14 + dz); // rail legs (the rails stood 22 mm over the roof: owner 2026-10-19 sweep)
  // smoke banks on the rear corners (3-tube, angled out)
  for (const s of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.038, len: 0.22, pitch: -0.40,
      splay: s * 1.05, spacing: 0.10, seed: 11 + s,
    });
    bank.position.set(s * 0.58, 0.36, -0.68);
    P.turretG.add(bank);
  }
  // bustle basket, loaded (rails + mesh + bundles)
  P.add('turretDetail', box(1.10, 0.03, 0.03), 0, 0.44, -1.10);
  P.add('turretDetail', box(1.10, 0.03, 0.03), 0, 0.16, -1.10);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.03, 0.30, 0.03), s * 0.54, 0.30, -1.09);
  P.add('turretDark', box(1.06, 0.012, 0.24), 0, 0.17, -0.97);
  stowage(P, 'turretCloth', rng, [
    [-0.28, 0.33, -0.96, 0.38, 0.18, 0.22], [0.26, 0.32, -0.98, 0.34, 0.16, 0.20]]);
  // turret whip left-rear (the roof M2 is gone — see the banner; the coax
  // 'mag' below is the census MG per the spz_puma unmanned precedent)
  {
    const tw = FITTINGS.antennaWhip({ mats: P.mats, h: 0.85, r: 0.010, rake: -0.05, seed: 7 });
    tw.position.set(-0.62, 0.60, -0.68);
    P.turretG.add(tw);
  }
  P.decal('turret', 'number', num, 0.20, [0.745, 0.26, -0.15], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-0.745, 0.26, -0.15], -Math.PI / 2);
  // ---- 35 mm KDE (§B3.1 + §B3.1-addendum MANTLET: the thick rectangular
  // KDE mantlet housing rides the gun at the face — the r1 bare collar
  // read as no mantlet mass; cast trunnion collar + stepped tube + CONICAL
  // flash hider — cylinders only, THICKER than the puma's MK30) ------------
  P.addGunExtra(box(0.44, 0.34, 0.22), 0, 0, 0.33);                            // KDE mantlet BLOCK on the face
  P.addGunExtra(box(0.40, 0.28, 0.06), 0, 0, 0.47);                            //   (stepped front plate)
  P.addGunExtra(cylZ(0.11, 0.30, 14, 0.135), 0, 0, 0.42);                      // cast collar through the block
  buildGun(P, { len: 0.90, r: 0.048, sleeve: false, evac: null, collar: false, baseR: 0.085 });
  P.addGunExtra(cylZ(0.058, 0.85, 12, 0.062), 0, 0, 0.98);                     // recoil sleeve segment
  P.addGunExtra(cylZ(0.044, 1.94, 24), 0, 0, 2.32);                            // bare tube, z rel 1.35..3.29
  P.add('gun', cylZ(0.0655, 0.22, 12, 0.048), 0, 0, 3.30);                     // conical flash hider body, ..3.41
                                                                               //   (camo-painted per the r5 brake
                                                                               //   law; vents stay dark)
  for (const zr of [3.24, 3.30, 3.36]) P.add('gunDark', cylZ(0.072, 0.016, 12), 0, 0, zr); // vent rings
  // §B3.1 MUZZLE BORE through the flared hider face (tapered wall carries
  // the cone to the face; 35mm-class disc)
  muzzleBore(P, 3.45, 0.070, 0.025, 12, 0.0655);
  P.muzzleZ = 3.45;                                                            // true muzzle anchor (world 3.90)
  // coax Type 74 7.62 LEFT of the main gun: dark port ring and the barrel stub
  // (the real vehicle has NO roof pintle)
  P.add('turretDark', cylZ(0.030, 0.02, 10), -0.32, 0.26, 0.705);
  P.add('turretDark', cylZ(0.013, 0.16, 8), -0.32, 0.26, 0.77);
  // VH.14 (coordinator ruling 2026-10-14): the census gun buried behind the port is gone — the Type 89 carries no roof
  // weapon (roofWeaponPolicy.ts) and its coaxial 7.62 reads at the port above.
}

function buildType89(P: Modern3BuilderPort) {
  buildType89Hull(P);
  buildType89Turret(P);
}

// ---------------------------------------------------------------------------
// Constructor table — merged into tankFactory BUILDERS at the extension hook
// ---------------------------------------------------------------------------
export const MODERN3_BUILDERS = {
  // The Garage workshop worker builds its K2 exhibit from this table.
  xk2_black_panther: buildK2,
  m2a2_bradley: buildM2A2Bradley,
  bmp2: buildBMP2,
  // AFV lane 2026-08-06 (owner order): rides the bradley recipe.
  hayate_ifv: buildType89,
  // KOREA round 2026-08-08 (§5.38): new build vs the k1a1_kojf print.
  k1e1: buildK1A1,
};
