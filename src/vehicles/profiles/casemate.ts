// Casemate / turretless procedural profile: the Strv 103 build that
// profiles/sweden.ts extends into the Strv 103B / 103A rows. The Jagdtiger,
// JPz E 100, Sturmtiger, T95 and ISU-152 / ISU-122S builds left with their
// archived hulls on 2026-09-25 (owner: delete the archived WWII / casemate
// tanks that are not in production).
// Owned by the casemate family agent.
//
// Wave-3 rebuild (2026-07-31, geometry gate v9): every id rebuilt against the
// measured reference polylines in docs/references/profiles/<id>.json plus the
// published dims in specs. Original primitive reconstructions only — the
// polylines are mask-trace DIMENSION data (no source mesh data is copied).
//
// GATE-STRUCTURAL RULES (v9, fixedMount oracles):
//  - The reference GLBs are fixedMount: the loader parents the ENTIRE model
//    under rig_hull (no turret/gun nodes). The gate's hull mask for the
//    reference therefore INCLUDES the fused gun. These builds mirror that
//    topology: gun tube + mount live in HULL buckets and rig_turret stays
//    EMPTY — hull/whole masks match 1:1, station slicing sees the same
//    z-range on both models, and articulation poses cannot detach anything
//    (there is nothing to articulate — exactly like the shipped reference).
//    P.turretG/P.gunG keep their pivot positions so the sim's virtual gun
//    and the rig_muzzle fx anchor stay correct; P.muzzleZ is set per tank.
//  - DIMS ANCHORING: p95 roof plateaus at published heightM; the side
//    12%-band span lands on published hullLengthM (fat gun sleeves stay
//    band-thin past the bow so they don't inflate the measured hull length);
//    muzzle at published overallLengthM; widest mesh EXACTLY ±widthM/2.
//  - WIDTH GUARD: nothing exceeds spec dims.widthM (the lab width-normalizes
//    both models; procScale must stay 1.000).
//  - Oracle-defect caps (quantified in docs/references/tanks/<id>.md): the
//    Strv103 oracle is proportionally off published dims;
//    dims stays sovereign here and the curve ceilings are documented.
import {
  BufferGeometry,
  Group,
  LatheGeometry,
  MeshStandardMaterial,
  Vector2,
} from 'three';
import { FITTINGS, KIT, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { withSeatRole } from '../spareTrackSeat.ts';

interface LoftStation {
  readonly z: number;
  readonly b: number;
  readonly t: number;
  readonly w: number;
  readonly wt?: number;
  readonly x?: number;
}

interface GunSection {
  readonly z0: number;
  readonly z1: number;
  readonly r: number;
  readonly r2?: number;
  readonly x?: number;
  readonly dy?: number;
  readonly dark?: boolean;
}

interface TrackWheel {
  readonly z: number;
  readonly y: number;
  readonly r: number;
}

interface SteelGearConfig {
  readonly style?: string;
  readonly wheelR: number;
  readonly wheelW?: number;
  readonly wheelY: number;
  readonly wheels?: number;
  readonly span?: number;
  readonly zc?: number;
  readonly xc: number;
  readonly wheelZs?: readonly number[];
  readonly sprocket: TrackWheel;
  readonly idler: TrackWheel;
  readonly rollers?: readonly TrackWheel[];
  readonly trackW: number;
  readonly topY: number;
  readonly botY?: number;
  readonly arms?: boolean;
  readonly coveredTop?: boolean | number;
  readonly deadSag?: number;
  readonly layers?: readonly (readonly number[])[];
  readonly trackTh?: number;
  readonly bayShadowTop?: number;
  readonly dishR?: number;
  readonly armBucket?: string;
  readonly shadows?: boolean;
}

interface CasemateMaterialSet {
  readonly barrel: MeshStandardMaterial;
  readonly canvasCloth: MeshStandardMaterial;
  readonly dark: MeshStandardMaterial;
  readonly detail: MeshStandardMaterial;
  readonly glass: MeshStandardMaterial;
  readonly hull: MeshStandardMaterial;
  readonly rubber: MeshStandardMaterial;
  readonly shadow: MeshStandardMaterial;
  readonly spareTrack: MeshStandardMaterial;
  readonly trackL: MeshStandardMaterial;
  readonly trackR: MeshStandardMaterial;
  readonly wheels: MeshStandardMaterial;
  readonly wood?: MeshStandardMaterial;
}

interface CasemateBuilderPort {
  readonly hullG: Group;
  readonly turretG: Group;
  readonly gunG: Group;
  readonly mats: CasemateMaterialSet;
  readonly disposables: Array<{ dispose(): void }>;
  readonly q?: boolean;
  readonly spec: {
    readonly id: string;
    readonly visual: { readonly number?: string };
  };
  gear?: { update(delta: number, speed: number): void };
  fixedMount?: boolean;
  muzzleZ?: number;
  topY?: number;
  add(slot: string, geometry: BufferGeometry, ...transform: Array<number | readonly number[]>): void;
  addEquipment(slot: string, geometry: BufferGeometry, ...transform: Array<number | readonly number[]>): void;
  addModuleVisual?(module: string, slot: string, geometry: BufferGeometry, ...transform: number[]): void;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    value: string | null,
    scale: number,
    position: readonly number[],
    ...rotation: number[]
  ): void;
}

const box = (width: number, height: number, depth: number): BufferGeometry =>
  KIT.box(width, height, depth);
const stations = (count: number, span: number, zc = 0): number[] => Array.from({ length: count }, (_, i) =>
  zc + span / 2 - i * (span / (count - 1)));

// ---------------------------------------------------------------------------
// Silhouette loft: sts is an ordered front->rear list of cross-section
// stations {z, b, t, w, wt?} (bottom y, top y, half-width, optional top
// half-width for leaned sides). Emits one slab per span. This is how each
// casemate tracks its measured reference polyline to gate tolerance.
// ---------------------------------------------------------------------------
function loft(P: CasemateBuilderPort, sts: readonly LoftStation[], bucket = 'hull'): void {
  // Each welded bay keeps its eight boundary datums; its support facets
  // replace the inward diagonal dents of twisted four-corner side panels.
  const slab = convexSlab;
  for (let i = 0; i < sts.length - 1; i++) {
    const a = sts[i], c = sts[i + 1];
    const awt = a.wt ?? a.w, cwt = c.wt ?? c.w;
    const ax = a.x ?? 0, cx = c.x ?? 0;
    P.add(bucket, slab(
      [ax - a.w, a.b, a.z], [ax + a.w, a.b, a.z], [cx + c.w, c.b, c.z], [cx - c.w, c.b, c.z],
      [ax - awt, a.t, a.z], [ax + awt, a.t, a.z], [cx + cwt, c.t, c.z], [cx - cwt, c.t, c.z]));
  }
}

// ---------------------------------------------------------------------------
// Shared fittings (all hull buckets — see GATE-STRUCTURAL RULES above)
// ---------------------------------------------------------------------------

// Bow tow hook / shackle bracket.
function towHook(P: CasemateBuilderPort, x: number, y: number, z: number): void {
  const { cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.13, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.015, z + 0.03);
}

// Fixed gun tube in hull-frame buckets. Sections front->rear from the muzzle.
// axisY/axisZ locate the bore in world; secs = [{z0, z1, r, dark?}] in world z.
// VEH-13: its own `hullGun` buckets (same materials and armour role as `hull`) for the spare-link seat solver.
function hullGun(P: CasemateBuilderPort, axisY: number, secs: readonly GunSection[]): void {
  const { cylZ } = KIT;
  for (const s of secs) {
    const len = s.z0 - s.z1;
    P.add(s.dark ? 'hullGunDark' : 'hullGun', cylZ(s.r, len, P.q ? 18 : 12, s.r2), 0 + (s.x || 0), axisY + (s.dy || 0), s.z1 + len / 2);
  }
}

/** A fixed hull gun's port, the glacis it leaves through and the housing over it (`addFixedGunPort`). */
export interface FixedGunPort {
  /** The bore axis height (the gun runs along z at x 0). */
  readonly axisY: number;
  /** The housing's level top. */
  readonly topY: number;
  /** The housing's half-widths at its foot and at its top. */
  readonly halfW: readonly [number, number];
  /** The glacis height under the housing's centreline, rear to front: [z, y]. The last station is the port face. */
  readonly stations: readonly (readonly [number, number])[];
  /** The port ring on the housing's face round the tube (armour: its bore stands clear of the tube by the keep), its
   * outer radius, its length and how far it stands proud of the face; its lower arc runs into the glacis. */
  readonly ring: { readonly rIn: number; readonly rOut: number; readonly length: number; readonly proud: number };
}

/**
 * 259 (owner on both Strv 103s: "dont allow the strv 103 bs gun to like glitch through the front of its gate"): the fixed
 * tube left the hull obliquely through the glacis plate, which cut it over a metre and a half, and the nose fittings
 * stood across it. It now leaves through an armoured housing that rides the glacis over it, by a ring on the housing's
 * front face, and ahead of that face it stands clear of every hull part (gunHullClearance.test-support.mjs
 * fixedGunHullProbe). The housing foot sinks 3 cm into the glacis at each station. Publishes the port as
 * hullG.userData.fixedGunPort: the housing's face (faceZ) and the ring's front (z).
 */
export function addFixedGunPort(
  P: { readonly hullG: Group; readonly q?: boolean; add(slot: string, geometry: BufferGeometry, ...transform: number[]): void },
  port: FixedGunPort,
): void {
  const SINK = 0.03;
  const [wb, wt] = port.halfW;
  for (let i = 0; i + 1 < port.stations.length; i++) {
    const [z0, g0] = port.stations[i], [z1, g1] = port.stations[i + 1];
    P.add('hull', orientedSlab(
      [-wb, g0 - SINK, z0], [wb, g0 - SINK, z0], [wb, g1 - SINK, z1], [-wb, g1 - SINK, z1],
      [-wt, port.topY, z0], [wt, port.topY, z0], [wt, port.topY, z1], [-wt, port.topY, z1]));
  }
  const faceZ = port.stations[port.stations.length - 1][0];
  const { rIn, rOut, length, proud } = port.ring;
  const ring = new LatheGeometry([[rIn, 0], [rOut, 0], [rOut, length], [rIn, length], [rIn, 0]]
    .map(([r, y]) => new Vector2(r, y)), P.q ? 28 : 16);
  ring.rotateX(Math.PI / 2);
  P.add('hull', ring, 0, port.axisY, faceZ + proud - length);
  P.hullG.userData.fixedGunPort = { faceZ, z: faceZ + proud, axisY: port.axisY, rIn };
}

// Deep steel-wheel run in the soviet-heavy style: painted steel wheels with a
// dark recess drum behind each so hubs/rims read out of the bay shadow.
function steelGear(P: CasemateBuilderPort, g: SteelGearConfig): void {
  const { buildRunningGear, cylX } = KIT;
  const zs = g.wheelZs || stations(g.wheels!, g.span!, g.zc ?? 0);
  const wheelW = g.wheelW ?? Math.min(0.24, g.trackW * 0.42);
  buildRunningGear(P, {
    style: g.style || 'steel', wheelR: g.wheelR, wheelW, wheelY: g.wheelY, xc: g.xc, wheelZs: zs,
    sprocket: g.sprocket, idler: g.idler, rollers: g.rollers || [],
    trackW: g.trackW, topY: g.topY, botY: g.botY ?? 0.08, arms: g.arms ?? true,
    coveredTop: g.coveredTop ?? false, deadSag: g.deadSag, layers: g.layers,
    trackTh: g.trackTh, bayShadowTop: g.bayShadowTop, dishR: g.dishR,
    armBucket: g.armBucket,
  });
  if (g.shadows !== false) for (const z of zs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(g.wheelR * 0.72, wheelW * 1.06, 12), s * g.xc, g.wheelY, z);
  }
}

// ---------------------------------------------------------------------------
// Strv 103B — docs/references/tanks/strv103.md
// Published 7.04 x 3.63 x 2.14 (hull/width/height), overall 8.99.
// Registered raw-source measurements: four 0.40 m road wheels centred at
// z ±1.443/±0.481, front terminal y 0.878/r 0.30, rear terminal
// y 0.895/r 0.27.  The source is aligned by that suspension datum (not by its
// asymmetric muzzle-to-tail box), then normalized to the published 3.63 m
// width.  Gun axis 1.56; source-registered muzzle +5.19; dozer tip +3.30;
// compact roof cluster held to the published-height envelope.
// ---------------------------------------------------------------------------
export function buildStrv103(P: CasemateBuilderPort): void {
  const { cylX, cylY, cylZ, frustum, liftEye, periscope } = KIT;
  P.fixedMount = true;

  const buildStrv103Hull = (): void => {
  // ---- primary silhouette loft (side top/bot + widths from the work order)
  // lower hull band: belly line ~0.33 between the tracks, sides at deck width
  const primaryHull = [
    // 259: the shelf tip and the nose root ran 1-3 cm into the tube's belly (1.468); they stand 2.2 cm under it
    { z: 3.30, b: 1.02, t: 1.445, w: 0.50, wt: 0.78 },         // raised gun-support shelf tip
    { z: 2.61, b: 0.72, t: 1.43, w: 0.80, wt: 1.50 },          // nose root
    { z: 1.60, b: 0.33, t: 1.58, w: 0.90, wt: 1.64 },          // glacis mid (under gun)
    { z: 1.10, b: 0.33, t: 1.63, w: 0.90, wt: 1.64 },          // glacis upper
    { z: 0.75, b: 0.33, t: 1.80, w: 0.90, wt: 1.64 },          // glacis break
    { z: -2.10, b: 0.33, t: 1.80, w: 0.90, wt: 1.64 },         // low deck run
    { z: -2.75, b: 0.80, t: 1.74, w: 0.92, wt: 1.56 },         // rear deck fall
    { z: -3.91, b: 1.19, t: 1.52, w: 1.10, wt: 1.50 },         // tail (source-registered rear overhang)
  ];
  // Complete first-party hull shell.  The lower tub remains a closed,
  // full-length load-bearing volume inboard of the native course.  Above the
  // measured 1.38 m shoe-clearance seam, a second closed loft continuously
  // flares into the full-width upper armor.  This reproduces the real
  // sponson/side-wall break without the old corridor subtraction: no skirt,
  // plate or hull face is deleted to obtain track clearance.
  const lowerHull = primaryHull.map((r) => ({
    z: r.z, b: r.b, t: Math.min(r.t, 1.38), w: r.w,
  }));
  const upperHull = primaryHull.map((r) => ({
    z: r.z, b: Math.min(r.t, 1.38), t: r.t, w: r.w, wt: r.wt,
  }));
  loft(P, lowerHull);
  loft(P, upperHull);
  // dozer blade under the nose. GATE NOTE (packet cap): the oracle's dozer
  // nose line runs to +3.86, but ANY sub-gun geometry past +3.52 lifts the
  // 12%-band span over published hullLengthM (side columns integrate all x),
  // so the blade stops at the published span and the plan view carries the
  // difference as a certified oracle-frame cost.
  P.add('hull', orientedSlab(                                 // §C.1 winding guard
    [-1.52, 0.50, 2.62], [1.52, 0.50, 2.62], [1.52, 0.66, 3.30], [-1.52, 0.66, 3.30],
    [-1.52, 0.72, 2.66], [1.52, 0.72, 2.66], [1.52, 0.84, 3.30], [-1.52, 0.84, 3.30]));
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.06, 0.07, 0.85), s * 0.88, 0.62, 2.35, -0.35, 0, 0); // blade arms, seated inside the native idler lanes
    P.add('hullDetail', box(0.08, 0.12, 1.10), s * 0.82, 0.80, 2.72, -0.48, 0, 0); // inboard folding braces
  }
  P.add('hullDark', box(1.76, 0.05, 0.06), 0, 0.50, 2.66);                     // cutting edge shadow
  P.add('hullDark', KIT.cylX(0.075, 2.62, 12), 0, 0.67, 3.24);                // folded blade torque tube
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.055, 0.055, 0.92), s * 0.72, 0.82, 2.77, -0.42, 0, 0);
  }
  // glacis louvre banks (radiators live ON the glacis): dark wells + ribs. 259: their inner edges ran under the tube
  // (4-7 cm from the bore); they stand outboard of the gun housing's 0.18 m foot.
  const glY = (z: number): number => 1.76 - (z - 0.85) * (0.66 / 1.76);        // glacis surface line
  withSeatRole(P, 'grille', (P) => {
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.66, 0.025, 1.18), s * 0.53, 1.46, 1.69, -0.36, 0, 0);
    }
    for (let i = 0; i < 6; i++) {
      const z = 1.10 + i * 0.22;
      for (const s of [-1, 1]) {
        P.add('hullDark', box(0.60, 0.02, 0.16), s * 0.53, glY(z) + 0.012, z, -0.36, 0, 0);
        P.add('hullDetail', box(0.64, 0.028, 0.05), s * 0.53, glY(z) + 0.035, z + 0.06, -0.36, 0, 0);
      }
    }
  });
  P.add('hullDetail', box(1.80, 0.05, 0.05), 0, glY(2.45) + 0.02, 2.45, -0.36, 0, 0); // splash rail
  // Spare-link rows and central clamp structure are prominent on the folded
  // dozer/glacis face in the source.  VEH-13 (2026-10-15): the six loose link blocks drawn here sat two-thirds inside
  // the nose loft (their mount gone when the nose was rebuilt), the outer one hovering over the tow hooks; re-seating
  // them put bare rows on the shelf top beside the gun (blind critics m1). The links are carried where the source
  // shows them, on the nose's vertical front face either side of the gun: one clamped two-link course a side (the
  // shared fitting: rails, clamps, shoe plates and grousers), its rails' feet on the face (base 4.05 cm under its
  // origin), clear of the barrel's footprint.
  for (const s of [-1, 1]) {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 2, width: 0.26, seed: s < 0 ? 31 : 32 });
    links.position.set(s * 0.30, 1.26, 3.30 + 0.0405);
    links.rotation.set(Math.PI / 2, 0, 0);
    P.hullG.add(links);
  }
  P.add('hullDark', KIT.cylX(0.06, 3.06, 12), 0, 0.58, 3.25);                 // full-width dozer crossbar
  };
  buildStrv103Hull();

  const buildStrv103Weapon = (): void => {
  // ---- fixed 105 mm L74 in the glacis (hull bucket, fixedMount topology).
  // Bore axis 1.65; muzzle at published overall: tail -3.52 -> muzzle +5.47.
  // §B3.1 MUZZLE BORE (shadow-named, 3fca39b; hull-frame gun -> hullG)
  // The collar reaches the ballistic muzzle marker (hull 5.26) so the fleet
  // mouth lining seats on the tube edge instead of 70 mm down a hollow
  // throat (bore probe 2026-09-11).
  muzzleBore(P, { z: 5.26, r: 0.085, y: 1.56, parent: 'hullG' });
  hullGun(P, 1.56, [
    { z0: 5.26, z1: 5.10, r: 0.110 },                                          // muzzle collar
    { z0: 5.10, z1: 3.30, r: 0.085 },                                          // fore tube
    { z0: 3.30, z1: 2.20, r: 0.092 },                                          // mid step
    { z0: 2.20, z1: 1.05, r: 0.098, r2: 0.108 },                               // rear taper into the glacis
  ]);
  // 259 (owner: "dont allow the strv 103 bs gun to like glitch through the front of its gate"): the glacis cut the tube
  // from z 1.0 to its nose shelf, a tilted sleeve stood beside it and the nose screen's centre bar ran through it. The
  // tube leaves through the gun housing on the glacis by a thin seal ring at z 2.5 and passes the screen's opening.
  addFixedGunPort(P, { axisY: 1.56, topY: 1.70, halfW: [0.18, 0.15],
    stations: [[0.92, 1.717], [1.10, 1.63], [1.60, 1.58], [2.50, 1.4465]],
    ring: { rIn: 0.104, rOut: 0.13, length: 0.05, proud: 0.025 } });
  // The 103B's travel lock: an A-frame yoke on the nose shelf (belly 1.468, crown 1.652 over z 3.10), its arms 5 cm
  // outboard of the tube, its head bar 1.8 cm over it, its saddle 1.2 cm under it, open in battle.
  for (const s of [-1, 1]) P.add('hullDetail', box(0.04, 0.266, 0.06), s * 0.165, 1.565, 3.10, 0, 0, s * 0.346);
  P.add('hullDetail', box(0.30, 0.04, 0.07), 0, 1.69, 3.10);
  P.add('hullDetail', box(0.20, 0.03, 0.07), 0, 1.441, 3.10);
  // virtual articulation anchors (empty groups; fx muzzle anchor only)
  P.turretG.position.set(0, 1.56, 0.40);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 4.86;
  };
  buildStrv103Weapon();

  const buildStrv103Deck = (): void => {
  // ---- deck furniture
  // commander cluster rides LEFT-of-center like the print (broad sight block
  // x -0.92..-0.22 + crown drum straddling x 0): crown held at 2.18.
  // ORACLE DEFECT CAP: the print's cluster reads 2.33-2.38 over ~1 m of roof;
  // published heightM (2.14, p95-sovereign) pins the build at 2.18 max.
  P.add('hull', box(0.82, 0.09, 1.05), 0.49, 1.85, -0.42);                     // broad planted commander plinth
  P.addEquipment('hull', box(0.34, 0.27, 0.38), 0.64, 2.01, -0.62);            // compact asymmetric sight head
  P.add('hullDark', box(0.30, 0.02, 0.34), 0.64, 2.15, -0.62);
  P.add('hull', cylY(0.25, 0.27, 0.10, 16), 0.26, 1.88, -0.22);                // low commander cupola
  P.add('hullDark', KIT.torus(0.25, 0.015, 16), 0.26, 1.94, -0.22);
  P.add('hull', cylY(0.15, 0.17, 0.12, 14), 0.06, 1.89, -0.35);                // crown cupola drum
  P.add('hull', cylY(0.135, 0.135, 0.040, 14), 0.06, 2.00, -0.35);
  P.add('hullDark', KIT.torus(0.145, 0.013, 14), 0.06, 1.995, -0.35);
  P.add('hull', KIT.sph(0.15, 14, Math.PI / 2), -0.55, 1.82, 0.05);            // observation dome (left)
  P.add('hullDark', KIT.torus(0.135, 0.012, 12), -0.55, 1.87, 0.05);
  periscope(P, 'hullDetail', 0.25, 1.75, 0.55);
  periscope(P, 'hullDetail', -0.30, 1.75, 0.72);
  P.add('hull', box(0.52, 0.16, 0.48), -0.72, 1.90, -1.20);                   // unequal roof service lid
  P.add('hullDark', box(0.46, 0.018, 0.42), -0.72, 1.99, -1.20);
  P.add('hull', box(0.36, 0.12, 0.38), 0.12, 1.88, -1.34);                    // central vent crown
  // flotation-screen rim strip around the deck edge (103B cue) + fenders. 259: the screen itself lies folded in that
  // trough (the 103B's flotation fit; the 103A carried none): a canvas bellows roll along each run, its folded struts
  // clipped down over it.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.07, 0.06, 4.2), s * 1.665, 1.815, -0.95);
    P.add('hull', box(0.20, 0.03, 5.64), s * 1.53, 1.535, 0.54);               // fender plate 3.36..-2.28
    // 259: the fender's edge (x 1.63) stood 8 cm inboard of the skirt backing (1.73) over z 1.16-2.02, a slot open from
    // above on both sides (the right one a fleet-audit work order, docs/geometry-gate/contig-hidden.json): a closing strip
    // on the fender's edge meets the backing
    P.add('hullDetail', box(0.12, 0.03, 0.92), s * 1.68, 1.525, 1.58);
    P.add('hullCloth', cylZ(0.045, 4.10, 10), s * 1.665, 1.87, -0.95);         // folded screen
    for (const z of [-2.62, -1.50, -0.40, 0.70]) P.add('hullDetail', box(0.11, 0.035, 0.06), s * 1.665, 1.90, z); // strut clips
  }
  P.add('hull', box(3.40, 0.06, 0.07), 0, 1.815, -3.02);
  P.add('hull', box(3.40, 0.06, 0.07), 0, 1.79, 0.88);
  P.add('hullCloth', cylX(0.045, 3.30, 10), 0, 1.87, -3.02);
  P.add('hullCloth', cylX(0.045, 3.30, 10), 0, 1.845, 0.88);
  // engine-deck intake ribs behind the glacis break
  for (let i = 0; i < 5; i++) P.add('hullDark', box(2.70, 0.016, 0.09), 0, 1.805, 0.45 - i * 0.24);
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), -1.15, 1.815, -1.35);        // fuel fillers
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), 1.15, 1.815, -1.35);
  // rear deck stowage boxes (oracle: proud line 2.04-2.10 behind z -2.1)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.52, 0.16, 0.85), s * 1.28, 1.84, -2.42);
    P.add('hullDark', box(0.53, 0.12, 0.024), s * 1.28, 1.85, -2.42);
    P.add('hull', box(0.86, 0.34, 0.62), s * 0.92, 1.57, -3.67);              // tail service pod / radiator shoulder
    P.add('hullDark', box(0.76, 0.025, 0.50), s * 0.92, 1.75, -3.67);
  }
  // Twin radiator/service grilles and their unequal covers dominate the
  // oracle's rear roof.  Each well is backed; the ribs sit on the well,
  // rather than hovering above an otherwise empty deck.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.02, 0.025, 0.92), s * 0.63, 1.825, -1.82);
    for (let i = 0; i < 7; i++) {
      P.add('hullDetail', box(0.94, 0.026, 0.035), s * 0.63, 1.846, -2.17 + i * 0.115);
    }
    P.add('hull', box(0.42, 0.12, 0.36), s * 1.18, 1.88, -1.42);
    P.add('hullDark', box(0.36, 0.018, 0.30), s * 1.18, 1.95, -1.42);
  }
  // Source-specific deck utilities: long side pipes, the central service
  // conduit, and small clamps that make the low roof read mechanical.
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylZ(0.055, 1.35, 10), s * 1.24, 1.88, -0.54);
    for (const z of [-1.02, -0.48, 0.02]) {
      P.add('hullDark', box(0.12, 0.055, 0.08), s * 1.24, 1.87, z);
    }
    for (const y of [1.42, 1.50, 1.58]) {
      P.add('hullDetail', cylZ(0.026, 4.15, 8), s * 1.73, y, -0.32);
    }
    for (const z of [-1.78, -0.72, 0.34, 1.38]) {
      P.add('hullDark', box(0.08, 0.28, 0.05), s * 1.75, 1.50, z);
    }
  }
  P.add('hullDark', cylZ(0.045, 1.10, 10), 0.02, 1.85, -1.08);
  for (const z of [-1.52, -1.05, -0.60]) P.add('hullDetail', box(0.20, 0.045, 0.08), 0.02, 1.85, z);
  // Starboard recovery rope.  Route it along the side seam instead of through
  // the side wall so it reads as a secured longitudinal cable in profile.
  const sideTowRope = FITTINGS.towCable({
    mats: P.mats,
    pts: [
      [1.864, 1.455, -2.36],
      [1.872, 1.438, -1.18],
      [1.868, 1.446, 0.12],
      [1.854, 1.462, 1.96],
    ],
    r: 0.019,
    eyes: false,
    seed: 10355,
  });
  sideTowRope.name = 'strv103_side_tow_rope';
  sideTowRope.userData.owner = 'hull';
  sideTowRope.userData.orientation = 'longitudinal';
  P.hullG.add(sideTowRope);
  for (const z of [-2.08, -0.86, 0.38, 1.66]) {
    P.add('hullDark', box(0.045, 0.070, 0.095), 1.842, 1.45, z);
  }
  };
  buildStrv103Deck();

  const buildStrv103ServiceAndRunningGear = (): void => {
  // raked antenna masts (oracle: symmetric pair rising to 2.80 at z ~ -2.0)
  for (const s of [-1, 1]) {
    P.add('hullDetail', KIT.cylY(0.045, 0.055, 0.10, 10), s * 0.96, 1.86, -1.86);
    P.add('hullDark', antennaPart(KIT.xform(KIT.cylY(0.012, 0.009, 0.98, 8), 0, 0.49, 0, -0.20, 0, 0)), s * 0.96, 1.82, -1.86);
  }
  // fixed MG box on the left front fender (KsP 58 pair)
  P.add('hull', box(0.24, 0.15, 0.60), -1.50, 1.37, 1.95);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.56, 1.40, 2.30);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.46, 1.40, 2.30);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.42, 0.24, 0.10), s * 1.28, 1.37, 2.64, -0.32, 0, 0);
    for (const [dx, dy] of [[-0.09, 0.045], [0.09, 0.045], [0, -0.055]]) {
      KIT.headlight(P, s * 1.28 + dx, 1.38 + dy, 2.69, -0.32, 0.048);
    }
  }
  // 2026-10-19 (owner float sweep): the eyes stood 95 mm over the 1.80 deck edge; set on it
  liftEye(P, 'hullDetail', -1.55, 1.823, 0.70, 0.4); liftEye(P, 'hullDetail', 1.55, 1.823, 0.70, -0.4);
  towHook(P, -0.85, 0.80, 2.55); towHook(P, 0.85, 0.80, 2.55);
  // tail: rear plate rail + thin-band exhaust pipes filling the oracle's
  // overhung tail line (band < 12% so hullLengthM stays published)
  P.add('hullDark', box(3.0, 0.08, 0.05), 0, 1.30, -3.88);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.55, 0.10, 0.30), s * 0.85, 1.48, -3.77);
    P.add('hullDark', cylZ(0.055, 0.26, 8), s * 0.55, 1.40, -3.88);
    P.add('hullDark', box(1.04, 0.34, 0.035), s * 0.66, 1.48, -3.915);
    for (let i = 0; i < 5; i++) {
      P.add('hullDetail', box(0.96, 0.025, 0.045), s * 0.66, 1.35 + i * 0.07, -3.94);
    }
  }

  // ---- running gear: 4 large road wheels, front drive, RAISED rear idler.
  // The oracle exposes the complete wheel discs below a shallow segmented
  // stowage/skirt course; the former 1.17 m blank wall buried every station.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.06, 0.22, 4.80), s * 1.76, 1.38, -0.25);               // shallow continuous upper backing
    for (let k = 0; k < 7; k++) {
      const z = 1.68 - k * 0.65;
      P.add('hull', box(0.08, 0.60, 0.58), s * 1.75, 1.07, z);
      P.add('hullDark', box(0.018, 0.50, 0.50), s * 1.80, 1.07, z);
      P.add('hullDetail', box(0.018, 0.12, 0.54), s * 1.81, 1.07, z);
    }
    for (let k = 0; k < 8; k++) P.add('hullDetail', KIT.cylZ(0.018, 0.018, 8), s * 1.812, 1.40, -2.32 + k * 0.57, 0, s * Math.PI / 2, 0);
  }
  steelGear(P, {
    style: 'rubber', dishR: 0.72, wheelR: 0.40, wheelW: 0.22, wheelY: 0.50, xc: 1.30,
    wheelZs: [1.44, 0.48, -0.48, -1.44], trackW: 0.66, trackTh: 0.075,
    sprocket: { z: 2.29, y: 0.88, r: 0.30 }, idler: { z: -2.33, y: 0.90, r: 0.27 },
    // FSP-03 2026-09-25: the Strv 103 carries two return rollers per side (docs/references/tanks/strv103a.md;
    // the Strv 103A gear above), one over each wheel pair at the 103A's axle height.
    rollers: [{ z: 0.85, y: 1.06, r: 0.10 }, { z: -0.85, y: 1.06, r: 0.10 }],
    topY: 1.20, botY: 0.04, arms: true, coveredTop: false, deadSag: 0.030, shadows: false,
  });
  // tail underside wedge from the raised idler to the high stern
  P.add('hull', frustum(1.18, -2.62, -3.87, 1.20, -2.60, -3.89, 1.20, 1.30));
  };
  buildStrv103ServiceAndRunningGear();

  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [1.755, 1.55, -1.4], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [-1.755, 1.55, -1.4], -Math.PI / 2, 0, 0);
  P.topY = 1.35;
}
