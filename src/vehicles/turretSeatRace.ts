/**
 * turretSeatRace.ts — the hull-side race an intact tank shows in the seam under its turret (the owner, 2026-10-22: "make
 * sure all tank turrets have a proper turret ring/attachment area").
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:turret-seat-race.
 *
 * The ring is the one turretRingWell.ts measures (measureTurretRing: the rig_turret seat, the deck round the race's rim,
 * the race's outer radius), published by tools/gen-combat-anatomy.mjs as the calibration's `turretRing` receipt, so the
 * drawn race, a wreck's ring plate and the combat ring all share one axis and seat. A tank whose calibration carries no
 * receipt shows none. The race is a flat machined ring on the deck, a little inside the receipt's rim, standing under
 * the turret's underside; the turret builders keep that underside clear of the deck so the seam reads. A kill's ring cut
 * (turretRingWell.ts cutTurretRingMeshes) takes it with the deck inside the ring, and the wreck's plate draws its own
 * race on the same rim; a rematch puts it back. turretRingWell.ts leaves it out of the deck it measures.
 *
 * The seat (`seatTurretOverDeck`): outside the race's rim, every turret surface below its plane comes up onto it. The
 * plane at a radius off the ring's axis is TURRET_SEAT_GAP_M over the hull's highest top at that radius on any bearing
 * (the receipt's swept deck, turretRingWell.ts measureTurretSweep), so whatever of the turret passes over a hull part
 * at some bearing stands its gap over it: no higher than TURRET_SEAT_RISE_M over the deck round the ring (a deck a few
 * centimetres proud of the ring's, a plate over the track's return; taller kit keeps its own clearance; a builder whose
 * turret turns over a raised engine deck sets its own limit, `turretG.userData.turretSeatRiseM`, and may widen the band a
 * corner reads, `turretSeatReadM`, so a broad face reaching over that deck comes up whole; one whose receipt reads its
 * ring well's floor for the deck sets the deck's own plane as a floor, `turretSeatMinY`, and where that receipt's rim
 * moves with its interior fills, the keep radius itself, `turretSeatKeepR`), and lower
 * where the hull stays under that deck on every bearing (a lower engine deck or glacis, past the hull's sides), so a
 * bustle or a rack hanging over a lower deck keeps its drop. Procedural turrets were authored sitting into their decks,
 * so a traverse swept their buried undersides through the hull and its kit; seated, the turret's walls stop over a dark
 * seam with the race in it. A corner is seated by its position (every copy of it, in every mesh, alike), so no seam
 * opens between faces that share it. Inside the rim (the ring's basket and collar, in the hull's well) and the gun are
 * left as built. A moved surface's geometry is this build's own copy (a fitting's geometry can be shared between meshes
 * and tanks), freed with the build.
 *
 * 274 (turret-deck-gate; the owner on the Leopard 2 prototype: "turret looks like its glitching into hull"): the turret's
 * foot band (per bearing, the FOOT_EDGE_M in from its outermost surface within FOOT_HIGH_M of the deck, out to the
 * receipt's footR + FOOT_BASE_MARGIN_M), where the eye meets the seam, is seated to the swept deck under it with no rise
 * limit (turretSeatPlane.ts liveAt) and whatever the keep radius: TURRET_SEAT_RISE_M had left the foot of 29 turrets
 * within a centimetre of, or into, a deck that rose past it, and the keep radius had exempted feet narrower than their
 * rim. Each face there is read along its edges, not only at its corners, so no face between two seated corners dips
 * into a deck that rises between them. A corner comes up at most SEAT_LIFT_MAX_M over where the rise-limited seat leaves
 * it; a need past that (more than SEAT_SHORT_TOL_M short) is clamped and recorded, the worst on
 * `turretG.userData.turretSeatShortfall`, for its hull's own fix (src/vehicles/turretDeckAudit.test-support.mjs names it).
 */
import * as THREE from 'three';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { faceBoxUV, paintedSurfaceShade, remapCamoUv, type CamoUvRemap } from './factoryGeometry.ts';
import { TURRET_SWEEP_BIN_M, turretSeatPlane, type TurretSeatLimits, type TurretSeatPlane, type TurretSeatRaceReceipt } from './turretSeatPlane.ts';

/** The build's disposables (its geometry is freed with it). */
interface GeometryDisposables { push(geometry: THREE.BufferGeometry): unknown }


/** The race's mesh name (tools and the ring census find it by it), and the turret's collar over it (addSeatCollar). */
export const TURRET_SEAT_RACE_NAME = 'turretSeatRace';
export const TURRET_SEAT_COLLAR_NAME = 'turretSeatCollar';

/** How far the race stands over the deck it was measured on, and how far it runs into it (m): 4 mm proud, since a gun's
 *  mantlet can pass low over the ring's front as it depresses (the ZTZ-99A2's comes within 1 cm of the deck there). */
const RACE_TOP_M = 0.004;
const RACE_FOOT_M = 0.010;
/** Inside the receipt's rim, so the kill's ring prism takes all of it (m). */
const RIM_INSET_M = 0.004;
const CHAMFER_M = 0.002;

/** The smallest ring that draws a race (and its collar) (m). */
const RACE_MIN_RIM_M = 0.3;

/** The race's width (its bolt flange and machined face) from its outer radius, as the wreck's plate draws it. */
function raceWidth(rimR: number): number { return Math.min(0.085, Math.max(0.05, 0.075 * rimR)); }

/** The race in the rig_hull frame, or null for a receipt that names no ring. */
export function buildTurretSeatRaceGeometry(receipt: TurretSeatRaceReceipt, high: boolean): THREE.BufferGeometry | null {
  const { seat, deckY, rimR } = receipt;
  if (!(rimR > RACE_MIN_RIM_M) || !Number.isFinite(deckY) || seat.length < 3) return null;
  const rOut = rimR - RIM_INSET_M, rIn = rOut - raceWidth(rimR);
  const y0 = deckY - RACE_FOOT_M, y1 = deckY + RACE_TOP_M;
  const profile = [[rIn, y0], [rOut, y0], [rOut, y1 - CHAMFER_M], [rOut - CHAMFER_M, y1], [rIn, y1], [rIn, y0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, high ? 64 : 48).translate(seat[0], 0, seat[2]);
}

export interface ApplyTurretSeatRaceOptions {
  specId: string;
  hullG: THREE.Object3D;
  material: THREE.Material;
  high: boolean;
  disposables: GeometryDisposables;
}

/** The race on this tank's rig_hull from its calibration's turret-ring receipt; false when it has none. */
export function applyTurretSeatRace({ specId, hullG, material, high, disposables }: ApplyTurretSeatRaceOptions): boolean {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  if (!receipt) return false;
  const geometry = buildTurretSeatRaceGeometry(receipt, high);
  if (!geometry) return false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = TURRET_SEAT_RACE_NAME;
  mesh.userData.turretSeatRace = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  hullG.add(mesh);
  disposables.push(geometry);
  return true;
}

const _toHull = new THREE.Matrix4(), _hullInverse = new THREE.Matrix4();
const _v = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function underObject(object: THREE.Object3D, ancestor: THREE.Object3D | null): boolean {
  if (!ancestor) return false;
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

/** A hull-frame position's key (0.1 mm): every copy of one corner, in any of the turret's meshes, is seated alike. */
const positionKey = (p: THREE.Vector3): string =>
  `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;

export interface SeatTurretOverDeckOptions {
  specId: string;
  hullG: THREE.Object3D;
  turretG: THREE.Object3D;
  gunG: THREE.Object3D | null;
  /** The gun's depression and elevation limits (deg): the collar keeps below the gun's sweep through them. */
  gunPitchDeg?: readonly [depression: number, elevation: number];
  disposables: GeometryDisposables;
  /** Each geometry the seat replaced with its seated copy: whatever holds the built one's attributes (the ERA clusters'
   * vertex spans) follows the copy. */
  onSeated?: (built: THREE.BufferGeometry, seated: THREE.BufferGeometry) => void;
}

/**
 * 252: a fitting the seat lifted whole lay wholly under the plane, buried in the deck as built and never drawn. Laid on the
 * plane it became a double sheet, its top on its bottom over the seated underside (the Griffin Viper's dark base block and
 * 70 others on 19 turrets). Such a part (its triangles joined by shared corners, every corner moved) collapses to one
 * point instead: zero area, drawn nowhere. `_toHull` holds the mesh's frame.
 */
function collapseWhollySeated(source: THREE.BufferGeometry, out: THREE.BufferAttribute, moved: Uint8Array): void {
  const position = source.getAttribute('position'), index = source.index;
  const count = index ? index.count : position.count;
  const parent = new Int32Array(position.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number): void => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const byPosition = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = positionKey(_v.fromBufferAttribute(position, i).applyMatrix4(_toHull));
    const first = byPosition.get(key);
    if (first === undefined) byPosition.set(key, i); else join(first, i);
  }
  for (let k = 0; k + 2 < count; k += 3) {
    const a = index ? index.getX(k) : k;
    join(a, index ? index.getX(k + 1) : k + 1);
    join(a, index ? index.getX(k + 2) : k + 2);
  }
  const whole = new Uint8Array(position.count).fill(1);
  for (let i = 0; i < position.count; i++) if (!moved[i]) whole[find(i)] = 0;
  const anchor = new Int32Array(position.count).fill(-1);
  for (let i = 0; i < position.count; i++) {
    const root = find(i);
    if (!whole[root]) continue;
    if (anchor[root] < 0) { anchor[root] = i; continue; }
    out.setXYZ(i, out.getX(anchor[root]), out.getY(anchor[root]), out.getZ(anchor[root]));
  }
}

/** 274: the turret's foot (see the header). Bearings round the ring's axis; how high over the deck a turret surface can be
 *  its foot, how deep the band runs in from its outer edge (the turret-deck gate's 10 cm and a cell of its 2.5 cm grid
 *  either side, so a face the gate reads at its band's edge is seated whole), how far past the receipt's footR and past
 *  the race's rim it reaches, and the step its edges are read at (m). */
const FOOT_BINS = 96;
const FOOT_HIGH_M = 0.35;
const FOOT_EDGE_M = 0.13;
const FOOT_BASE_MARGIN_M = 0.25;
const FOOT_RIM_PAD_M = 0.01;
const FOOT_STEP_M = 0.025;
/** A foot surface buried further than this under the deck's plane lies in the hull, out of sight: not its visible foot. */
const FOOT_BURIED_M = 0.005;
/** The most a foot-band corner comes up over where the rise-limited seat leaves it, and the shortfall past that which
 *  still leaves the foot a centimetre over the swept deck (the seat's 3 cm gap less 2 cm), so goes unrecorded (m). */
const SEAT_LIFT_MAX_M = 0.06;
const SEAT_SHORT_TOL_M = 0.02;

/** The turret's foot per FOOT_BINS bearing (rig_hull frame, the turret at its rest yaw): its outer radius (0 where none)
 *  and, when asked, its visible height (the lowest of its surfaces within FOOT_EDGE_M of that edge, not buried). */
export interface TurretFootline {
  readonly cx: number;
  readonly cz: number;
  readonly footR: Float64Array;
  readonly footY: Float64Array | null;
}

/** A mesh that shows as the turret's foot: no shadow proxy, marking, ghillie, interior fill or see-through surface. */
function footSurface(mesh: THREE.Mesh): boolean {
  const data = mesh.userData;
  if (data.authoredShadowProxy || data.interiorFill || data.vehicleMarking || data.turretSeatRace || data.turretRingPlate
    || mesh.name === TURRET_SEAT_COLLAR_NAME || /_ghillie_/.test(mesh.name)) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((m) => !!m && m.visible !== false && m.colorWrite !== false
    && !(m.transparent && (m.opacity ?? 1) < 0.98) && !((m.alphaTest ?? 0) > 0));
}

function footBin(x: number, z: number, cx: number, cz: number): number {
  const a = Math.atan2(x - cx, z - cz);
  return ((Math.floor(((a / (Math.PI * 2)) + 1) * FOOT_BINS) % FOOT_BINS) + FOOT_BINS) % FOOT_BINS;
}

/** Each edge of each low triangle of meshes (in the hull frame through `hullInverse`), sampled every FOOT_STEP_M. */
function eachFootSample(meshes: readonly THREE.Mesh[], hullInverse: THREE.Matrix4, highY: number,
  visit: (x: number, y: number, z: number) => void): void {
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    _toHull.multiplyMatrices(hullInverse, mesh.matrixWorld);
    for (let k = 0; k + 2 < count; k += 3) {
      for (let c = 0; c < 3; c++) _corners[c].fromBufferAttribute(position, index ? index.getX(k + c) : k + c).applyMatrix4(_toHull);
      if (Math.min(_corners[0].y, _corners[1].y, _corners[2].y) > highY) continue;
      for (let e = 0; e < 3; e++) {
        const p = _corners[e], q = _corners[(e + 1) % 3];
        const steps = Math.min(400, Math.max(1, Math.ceil(p.distanceTo(q) / FOOT_STEP_M)));
        for (let i = 0; i < steps; i++) {
          const u = i / steps;
          visit(p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u, p.z + (q.z - p.z) * u);
        }
      }
    }
  }
}

/** The turret's foot round the ring (rig_hull frame; the turret at the yaw it stands at). */
export function measureTurretFootline(meshes: readonly THREE.Mesh[], hullG: THREE.Object3D,
  receipt: TurretSeatRaceReceipt, withHeight: boolean, turretG?: THREE.Object3D): TurretFootline {
  const cx = receipt.seat[0], cz = receipt.seat[2], highY = receipt.deckY + FOOT_HIGH_M;
  hullG.updateWorldMatrix(true, false);
  const hullInverse = new THREE.Matrix4().copy(hullG.matrixWorld).invert();
  // a build that names it (turretG.userData.turretSeatFootShell) reads its foot off the structural shell alone (the mesh
  // named 'turret'): 274 fix2, the 2A6 and its UA, whose Kontakt-1 rails in its turretDark moved the band out past the
  // 2A6's own shell, which then seated otherwise than the 2A6's (a kit adds, it never edits)
  const fromShell = turretG?.userData.turretSeatFootShell === true;
  const shell = fromShell ? meshes.filter((mesh) => mesh.name === 'turret' && footSurface(mesh)) : [];
  const shown = shell.length ? shell : meshes.filter(footSurface);
  const footR = new Float64Array(FOOT_BINS);
  eachFootSample(shown, hullInverse, highY, (x, y, z) => {
    if (y > highY) return;
    const r = Math.hypot(x - cx, z - cz), k = footBin(x, z, cx, cz);
    if (r > footR[k]) footR[k] = r;
  });
  if (!withHeight) return { cx, cz, footR, footY: null };
  const footY = new Float64Array(FOOT_BINS).fill(Infinity), buriedY = receipt.deckY - FOOT_BURIED_M;
  eachFootSample(shown, hullInverse, highY, (x, y, z) => {
    if (y > highY || y < buriedY) return;
    const k = footBin(x, z, cx, cz);
    if (footR[k] > 0 && Math.hypot(x - cx, z - cz) >= footR[k] - FOOT_EDGE_M && y < footY[k]) footY[k] = y;
  });
  return { cx, cz, footR, footY };
}

/** The foot band test (see the header): a hull-frame plan point within FOOT_EDGE_M of the foot's outer edge on its
 *  bearing (or a neighbour's: the band's inner edge is the least of the three), past the race's rim, within the base. */
function footBandTest(footline: TurretFootline, receipt: TurretSeatRaceReceipt, keepR = 0): (x: number, z: number) => boolean {
  const { cx, cz, footR } = footline;
  const inner = new Float64Array(FOOT_BINS);
  for (let k = 0; k < FOOT_BINS; k++) {
    let least = Infinity;
    for (const n of [k + FOOT_BINS - 1, k, k + 1]) { const r = footR[n % FOOT_BINS]; if (r > 0 && r < least) least = r; }
    inner[k] = least - FOOT_EDGE_M;
  }
  const rimPad = Math.max(receipt.rimR + FOOT_RIM_PAD_M, keepR), baseR = (receipt.footR ?? receipt.rimR) + FOOT_BASE_MARGIN_M;
  return (x, z) => {
    const r = Math.hypot(x - cx, z - cz);
    return r > rimPad && r <= baseR && r >= inner[footBin(x, z, cx, cz)];
  };
}

/** The worst foot-band corner the seat could not bring onto its plane within SEAT_LIFT_MAX_M (turretG.userData). */
export interface TurretSeatShortfall {
  readonly r: number;
  readonly bearingDeg: number;
  /** How far the corner had to come up from where the rise-limited seat leaves it, and how much of that it could not (m). */
  readonly needM: number;
  readonly shortM: number;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3();
/** Per seated turret, the plane each corner the foot band lifted came up to, by its built position (rig_hull frame),
 *  and each lifted corner's built height, by its seated position. */
const FOOT_BAND_LIFTS = new WeakMap<THREE.Object3D, { readonly to: Map<string, number>; readonly from: Map<string, number[]> }>();

/** Where the foot band laid a turret corner, by its built position in the rig_hull frame (undefined: the band left it
 *  to the rise-limited seat). Receipts that rebuild a seated surface from its source read it. */
export function footBandSeatY(turretG: THREE.Object3D, builtInHull: THREE.Vector3): number | undefined {
  return FOOT_BAND_LIFTS.get(turretG)?.to.get(positionKey(builtInHull));
}

/** The built heights a corner the foot band lifted could have come from, by its seated position in the rig_hull frame
 *  (several built corners over one plan point can come up to the same seated one; empty: the band did not move it). */
export function footBandBuiltYs(turretG: THREE.Object3D, seatedInHull: THREE.Vector3): readonly number[] {
  return FOOT_BAND_LIFTS.get(turretG)?.from.get(positionKey(seatedInHull)) ?? [];
}

/**
 * 274: the foot band's targets (see the header) over the rise-limited seat's `targets`, merged into it in place; the worst
 * shortfall, or null.
 */
function seatFootBand(meshes: readonly THREE.Mesh[], receipt: TurretSeatRaceReceipt, seat: TurretSeatPlane,
  hullG: THREE.Object3D, turretG: THREE.Object3D, targets: Map<string, number>): TurretSeatShortfall | null {
  const footline = measureTurretFootline(meshes, hullG, receipt, false, turretG);
  // a builder's own keep radius (turretSeatKeepR) still holds: the Abrams keep their relieved floor tucked under the
  // bearing's face inside it (abramsTurretLift.selftest; 274 fix2); the default rim band does not exempt the foot
  const ownKeepR = (turretG.userData as TurretSeatLimits).turretSeatKeepR;
  const keepIn = typeof ownKeepR === 'number' ? ownKeepR : 0;
  const inFoot = footBandTest(footline, receipt, keepIn);
  // under a builder's keep radius no corner inside it (or inside the race's rim) comes up for a face reaching out. Without
  // one, a face comes up whole: holding its inner corners tilts it, and two caps built back to back with different
  // triangulations (the BMP-3's foot slab, its top ringed at the rim, its bottom fanned from the axis) tilt apart, the
  // lower cap's back drawn over the upper beside the gun (the gun-junction census's nine openings; 274 fix3)
  const holdR = keepIn > 0 ? Math.max(receipt.rimR + FOOT_RIM_PAD_M, keepIn) : 0;
  const { cx, cz } = seat;
  const rimPad = receipt.rimR + FOOT_RIM_PAD_M, baseR = (receipt.footR ?? receipt.rimR) + FOOT_BASE_MARGIN_M;
  let liveTop = -Infinity;
  for (let r = rimPad; r <= baseR + 0.005; r += 0.01) liveTop = Math.max(liveTop, seat.liveAt(r));
  const lifts = new Map<string, number>();
  const base = [0, 0, 0], keys = ['', '', ''];
  let worst: TurretSeatShortfall | null = null;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    for (let k = 0; k + 2 < count; k += 3) {
      for (let c = 0; c < 3; c++) {
        const p = _corners[c].fromBufferAttribute(position, index ? index.getX(k + c) : k + c).applyMatrix4(_toHull);
        keys[c] = positionKey(p);
        base[c] = Math.max(p.y, targets.get(keys[c]) ?? -Infinity);
      }
      if (Math.min(base[0], base[1], base[2]) >= liveTop) continue;
      const { near, far } = planReach(_corners, cx, cz);
      if (far <= rimPad || near > baseR) continue;
      // the highest plane along its edges, where the face (as the rise-limited seat leaves it) stands under it
      let plane = -Infinity;
      for (let e = 0; e < 3; e++) {
        const e1 = (e + 1) % 3;
        _fa.copy(_corners[e]); _fb.copy(_corners[e1]);
        const steps = Math.min(400, Math.max(1, Math.ceil(Math.hypot(_fb.x - _fa.x, _fb.z - _fa.z) / FOOT_STEP_M)));
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, x = _fa.x + (_fb.x - _fa.x) * u, z = _fa.z + (_fb.z - _fa.z) * u;
          if (!inFoot(x, z)) continue;
          const live = seat.liveAt(Math.hypot(x - cx, z - cz));
          if (base[e] + (base[e1] - base[e]) * u < live - 1e-4 && live > plane) plane = live;
        }
      }
      if (plane === -Infinity) continue;
      for (let c = 0; c < 3; c++) {
        if (base[c] >= plane || Math.hypot(_corners[c].x - cx, _corners[c].z - cz) <= holdR) continue;
        const cap = base[c] + SEAT_LIFT_MAX_M, to = Math.min(plane, cap);
        if (plane - cap > SEAT_SHORT_TOL_M && (!worst || plane - cap > worst.shortM)) {
          const p = _corners[c];
          worst = { r: round3(Math.hypot(p.x - cx, p.z - cz)), bearingDeg: Math.round(THREE.MathUtils.radToDeg(Math.atan2(p.x - cx, p.z - cz)) + 360) % 360,
            needM: round3(plane - base[c]), shortM: round3(plane - cap) };
        }
        const was = lifts.get(keys[c]);
        if (was === undefined || to > was) lifts.set(keys[c], to);
      }
    }
  }
  const to = new Map<string, number>(), from = new Map<string, number[]>();
  for (const [key, y] of lifts) {
    if (!(y > (targets.get(key) ?? -Infinity))) continue;
    targets.set(key, y);
    to.set(key, y);
    const [kx, ky, kz] = key.split(',').map(Number);
    const seatedKey = positionKey(_fa.set(kx / 1e4, y, kz / 1e4));
    from.set(seatedKey, [...(from.get(seatedKey) ?? []), ky / 1e4]);
  }
  FOOT_BAND_LIFTS.set(turretG, { to, from });
  return worst;
}

/** Seat the turret's surfaces over the deck round its ring (see the header); the count of meshes moved. */
export function seatTurretOverDeck({ specId, hullG, turretG, gunG, gunPitchDeg, disposables, onSeated }: SeatTurretOverDeckOptions): number {
  const receipt = combatAnatomyCalibration(specId)?.turretRing;
  const seat = turretSeatPlane(receipt, turretG.userData as TurretSeatLimits);
  if (!receipt || !seat) return 0;
  const { cx, cz, keepR, planeAt } = seat;
  hullG.updateWorldMatrix(true, false);
  turretG.updateMatrixWorld(true);
  _hullInverse.copy(hullG.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  turretG.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || underObject(mesh, gunG)
      || mesh.userData.interiorFill || mesh.userData.vehicleMarking || !mesh.geometry?.getAttribute('position')) return;
    meshes.push(mesh);
  });
  // 1. every corner of a triangle reaching past the rim takes the plane at its own radius, by position: a corner several
  // triangles (or meshes) share comes up alike in each, so no seam opens between them; a corner inside the rim that such
  // a triangle shares (a cap fanned from the ring's middle) comes up too, so the cap lies on the plane instead of sloping
  // back down to it. Triangles all inside the rim (the basket, the collar) keep their other corners as built.
  const targets = new Map<string, number>();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    for (let k = 0; k + 2 < count; k += 3) {
      let reaches = false;
      for (let c = 0; c < 3; c++) {
        _corners[c].fromBufferAttribute(position, index ? index.getX(k + c) : k + c).applyMatrix4(_toHull);
        reaches ||= (_corners[c].x - cx) ** 2 + (_corners[c].z - cz) ** 2 > keepR * keepR;
      }
      if (!reaches) continue;
      for (const p of _corners) {
        const plane = planeAt(Math.max(keepR, Math.hypot(p.x - cx, p.z - cz)));
        if (p.y >= plane) continue;
        const key = positionKey(p);
        const was = targets.get(key);
        if (was === undefined || plane > was) targets.set(key, plane);
      }
    }
  }
  // 2. the foot band (274), from where step 1 leaves each corner; a turret whose own build the band would break opts out
  // (turretG.userData.turretSeatFootBand === false: the M2A2 Bradley's classic turret, whose lower edge and TOW pod
  // opened to the inside and beside the gun when lifted, release 274 check)
  const shortfall = turretG.userData.turretSeatFootBand === false ? null : seatFootBand(meshes, receipt, seat, hullG, turretG, targets);
  if (shortfall) turretG.userData.turretSeatShortfall = shortfall;
  else delete turretG.userData.turretSeatShortfall;
  if (!targets.size) {
    addSeatCollar({ receipt, hullG, turretG, gunG, gunPitchDeg, meshes, disposables });
    return 0;
  }
  let highest = -Infinity;
  for (const plane of targets.values()) highest = Math.max(highest, plane);
  // 3. each mesh holding such a corner: this build's own copy (a fitting's geometry can be shared between meshes and
  // tanks), every vertex at a seated position set on its plane, and the moved vertices' normals from the faces round them
  let moved = 0;
  for (const mesh of meshes) {
    const source = mesh.geometry, position = source.getAttribute('position');
    _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld);
    const lift: number[] = [];
    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(position, i).applyMatrix4(_toHull);
      if (_v.y >= highest) continue;
      const plane = targets.get(positionKey(_v));
      if (plane !== undefined) lift.push(i, plane);
    }
    if (!lift.length) continue;
    const seated = source.clone();
    const out = seated.getAttribute('position') as THREE.BufferAttribute;
    const toLocal = _toHull.clone().invert();
    const movedVertex = new Uint8Array(out.count);
    for (let k = 0; k < lift.length; k += 2) {
      const i = lift[k];
      _v.fromBufferAttribute(out, i).applyMatrix4(_toHull);
      _v.y = lift[k + 1];
      _v.applyMatrix4(toLocal);
      out.setXYZ(i, _v.x, _v.y, _v.z);
      movedVertex[i] = 1;
    }
    collapseWhollySeated(source, out, movedVertex);
    const normal = seated.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (normal) {
      // (unmoved vertices keep their authored, possibly smooth, normals)
      const sum = new Float32Array(out.count * 3), index = seated.index, count = index ? index.count : out.count;
      for (let k = 0; k + 2 < count; k += 3) {
        const a = index ? index.getX(k) : k, b = index ? index.getX(k + 1) : k + 1, c = index ? index.getX(k + 2) : k + 2;
        if (!movedVertex[a] && !movedVertex[b] && !movedVertex[c]) continue;
        _v.fromBufferAttribute(out, a);
        _e1.fromBufferAttribute(out, b).sub(_v);
        _e2.fromBufferAttribute(out, c).sub(_v);
        _e1.cross(_e2);
        for (const i of [a, b, c]) if (movedVertex[i]) { sum[i * 3] += _e1.x; sum[i * 3 + 1] += _e1.y; sum[i * 3 + 2] += _e1.z; }
      }
      for (let i = 0; i < out.count; i++) {
        if (!movedVertex[i]) continue;
        _v.set(sum[i * 3], sum[i * 3 + 1], sum[i * 3 + 2]);
        if (_v.lengthSq() > 1e-24) { _v.normalize(); normal.setXYZ(i, _v.x, _v.y, _v.z); }
      }
      normal.needsUpdate = true;
    }
    out.needsUpdate = true;
    seated.computeBoundingBox();
    seated.computeBoundingSphere();
    disposables.push(seated);
    mesh.geometry = seated;
    onSeated?.(source, seated);
    moved++;
  }
  addSeatCollar({ receipt, hullG, turretG, gunG, gunPitchDeg, meshes, disposables });
  return moved;
}

/** The collar's wall thickness, how far it stands proud of the race's outer face, how far its foot sits under the race's
 *  top (below its chamfer: a level ray finds no slot between the two) and how far its top runs into the turret (m). */
const COLLAR_WALL_M = 0.012;
const COLLAR_PROUD_M = 0.002;
const COLLAR_FOOT_SINK_M = CHAMFER_M + 0.001;
const COLLAR_TOP_BITE_M = 0.004;
/** A seam over the race at least this small needs no collar; a taller one than COLLAR_MAX_M is an opening the turret's
 *  own design leaves, not the seam (m; a race deep in a well under a raised deck reads up to its turret through it). */
const COLLAR_MIN_SEAM_M = 0.001;
const COLLAR_MAX_M = 0.45;
/** A hollow turret (an open-bottomed shell whose skirt comes down round the ring, its roof over the collar's circle): the
 *  step its lower edges are read at outside the collar, how near the race its skirt comes down, and the highest roof
 *  the wall rises into (m). */
const COLLAR_SKIRT_STEP_M = 0.04;
const COLLAR_SKIRT_MAX_M = 0.20;
const COLLAR_HOLLOW_MAX_M = 0.80;
/** The collar's bearings; how far its top keeps under the gun's lowest surface anywhere in the gun's sweep, and the
 *  pitches (fractions of its depression and its elevation) that sweep is read at (m). */
const COLLAR_BINS = 64;
const COLLAR_GUN_CLEAR_M = 0.015;
const COLLAR_GUN_SWEEP = [0, 1 / 3, 2 / 3, 1] as const;

/** The pitches the gun's sweep is read at: by default the fractions of COLLAR_GUN_SWEEP; a turret that names a step
 *  (userData.turretSeatCollarGunStepDeg) reads every step through its depression and its elevation, both ends included. */
function collarGunPitches(depression: number, elevation: number, stepDeg: number): number[] {
  if (!(stepDeg > 0)) return [...COLLAR_GUN_SWEEP.map((f) => -f * depression), ...COLLAR_GUN_SWEEP.slice(1).map((f) => f * elevation)];
  const side = (limit: number, sign: number): number[] => {
    const out: number[] = [];
    for (let deg = stepDeg; deg < limit; deg += stepDeg) out.push(sign * deg);
    if (limit > 0) out.push(sign * limit);
    return out;
  };
  return [0, ...side(depression, -1), ...side(elevation, 1)];
}

const _pivotInverse = new THREE.Matrix4(), _gunRest = new THREE.Matrix4(), _gunPosed = new THREE.Matrix4();
const _g = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _box = new THREE.Box3();

/** The triangles of meshes through a per-mesh matrix that pass a test on their corners, as 9 numbers each; a mesh whose
 *  box through its matrix fails `meshKeep` is passed over whole. */
function gatherTriangles(list: readonly THREE.Mesh[], matrixOf: (mesh: THREE.Mesh) => THREE.Matrix4,
  keep: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean,
  meshKeep?: (box: THREE.Box3) => boolean): Float64Array {
  const out: number[] = [];
  for (const mesh of list) {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    const matrix = matrixOf(mesh);
    if (meshKeep) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox && !meshKeep(_box.copy(geometry.boundingBox).applyMatrix4(matrix))) continue;
    }
    const count = index ? index.count : position.count;
    // a plain float position array is read directly (the common case); any other attribute through its accessors
    const plain = !(position as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !position.normalized
      && position.itemSize === 3;
    const array = position.array as ArrayLike<number>, ids = index?.array as ArrayLike<number> | undefined;
    const m = matrix.elements;
    for (let k = 0; k + 2 < count; k += 3) {
      for (let c = 0; c < 3; c++) {
        const v = ids ? ids[k + c] : k + c;
        if (!plain) { _corners[c].fromBufferAttribute(position, v).applyMatrix4(matrix); continue; }
        const x = array[v * 3], y = array[v * 3 + 1], z = array[v * 3 + 2];
        _corners[c].set(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
      const [a, b, c] = _corners;
      if (keep(a, b, c)) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  return Float64Array.from(out);
}

/** The nearest and farthest plan distances from (cx, cz) of the plan box round three points. */
function planReach(points: readonly THREE.Vector3[], cx: number, cz: number): { near: number; far: number } {
  const minX = Math.min(points[0].x, points[1].x, points[2].x), maxX = Math.max(points[0].x, points[1].x, points[2].x);
  const minZ = Math.min(points[0].z, points[1].z, points[2].z), maxZ = Math.max(points[0].z, points[1].z, points[2].z);
  return {
    near: Math.hypot(Math.max(minX - cx, 0, cx - maxX), Math.max(minZ - cz, 0, cz - maxZ)),
    far: Math.hypot(Math.max(Math.abs(minX - cx), Math.abs(maxX - cx)), Math.max(Math.abs(minZ - cz), Math.abs(maxZ - cz))),
  };
}

const _bx = new Float64Array(COLLAR_BINS * 2), _bz = new Float64Array(COLLAR_BINS * 2);
/** The nearest of `bins` bearings round (cx, cz) to a plan point. */
function bearingBin(x: number, z: number, cx: number, cz: number, bins: number): number {
  const a = Math.atan2(x - cx, z - cz);
  return ((Math.round((a / (Math.PI * 2)) * bins) % bins) + bins) % bins;
}
/**
 * Each triangle's heights (9 numbers each) where it stands over the circle of `radius` round (cx, cz), on `bins`
 * bearings: its edges where they cross the circle (a wall standing on edge shows no face to a vertical line) and its
 * face over each bearing's point (a broad underside crosses the circle inside its edges).
 */
function scanCircle(tris: Float64Array, cx: number, cz: number, radius: number, bins: number,
  note: (k: number, y: number) => void): void {
  for (let k = 0; k < bins; k++) {
    const a = (k / bins) * Math.PI * 2;
    _bx[k] = cx + Math.sin(a) * radius; _bz[k] = cz + Math.cos(a) * radius;
  }
  const edge = (xa: number, ya: number, za: number, ra: number, xb: number, yb: number, zb: number, rb: number): void => {
    if ((ra - radius) * (rb - radius) > 0) return;
    const u = ra === rb ? 0 : (radius - ra) / (rb - ra);
    note(bearingBin(xa + (xb - xa) * u, za + (zb - za) * u, cx, cz, bins), ya + (yb - ya) * u);
  };
  for (let t = 0; t < tris.length; t += 9) {
    const x0 = tris[t], y0 = tris[t + 1], z0 = tris[t + 2], x1 = tris[t + 3], y1 = tris[t + 4], z1 = tris[t + 5];
    const x2 = tris[t + 6], y2 = tris[t + 7], z2 = tris[t + 8];
    const r0 = Math.hypot(x0 - cx, z0 - cz), r1 = Math.hypot(x1 - cx, z1 - cz), r2 = Math.hypot(x2 - cx, z2 - cz);
    if (Math.max(r0, r1, r2) < radius - COLLAR_WALL_M - 0.02) continue;
    edge(x0, y0, z0, r0, x1, y1, z1, r1);
    edge(x1, y1, z1, r1, x2, y2, z2, r2);
    edge(x2, y2, z2, r2, x0, y0, z0, r0);
    const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(det) < 1e-12) continue;
    const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2), minZ = Math.min(z0, z1, z2), maxZ = Math.max(z0, z1, z2);
    // (only a face whose plan box meets the circle can stand over one of its points)
    const nearX = Math.max(minX - cx, 0, cx - maxX), nearZ = Math.max(minZ - cz, 0, cz - maxZ);
    const farX = Math.max(Math.abs(minX - cx), Math.abs(maxX - cx)), farZ = Math.max(Math.abs(minZ - cz), Math.abs(maxZ - cz));
    if (nearX * nearX + nearZ * nearZ > radius * radius || farX * farX + farZ * farZ < radius * radius) continue;
    for (let n = 0; n < bins; n++) {
      const px = _bx[n], pz = _bz[n];
      if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
      const w0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / det;
      const w1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / det;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      note(n, w0 * y0 + w1 * y1 + w2 * y2);
    }
  }
}

interface SeatCollarOptions {
  receipt: TurretSeatRaceReceipt;
  hullG: THREE.Object3D;
  turretG: THREE.Object3D;
  gunG: THREE.Object3D | null;
  gunPitchDeg?: readonly [depression: number, elevation: number];
  meshes: readonly THREE.Mesh[];
  disposables: GeometryDisposables;
}

/**
 * Release 240 (the owner, 2026-10-24: "we raised a ton of tank turrets, but we need to ensure that none are 'see through'
 * perfectly and there are proper turret rings connecting them properly"): the turret's ring collar over the race. On
 * each of COLLAR_BINS bearings the seated turret's lowest surface at the race's outer radius is read; where it stands
 * over the race (a turret lifted on its seat, or a lower casting that rises off the deck round the ring), a turret-owned
 * ring wall runs from its foot sunk in the race up into that surface, so no daylight shows through the ring band from
 * any side and the turret reads as carried on its ring. A hollow turret (an open-bottomed shell, its roof over the
 * ring, whose skirt comes down round it: the Merkavas) has the wall rise into its roof behind the skirt. It is coaxial,
 * so it turns unseen; it is a body of the seat (userData.turretSeatRace: the ring measure leaves it out). Under the gun
 * it stands no higher than COLLAR_GUN_CLEAR_M below the gun's lowest surface through its whole depression and
 * elevation, so the ring stays closed under the mantlet and the gun still sweeps clear. A turret may opt out with
 * userData.turretSeatCollar === false.
 * 270 (the K30 Biho, default off): a turret may keep the collar further under the gun (userData.turretSeatCollarGunClearM,
 * never under COLLAR_GUN_CLEAR_M) and read the sweep at a fixed step (userData.turretSeatCollarGunStepDeg): a gun that
 * elevates to 85 deg swings 28 deg between the default sweep's samples, and its breech dips under the collar between them.
 */
function addSeatCollar({ receipt, hullG, turretG, gunG, gunPitchDeg, meshes, disposables }: SeatCollarOptions): void {
  if (turretG.userData.turretSeatCollar === false || !(receipt.rimR > RACE_MIN_RIM_M)) return;
  const cx = receipt.seat[0], cz = receipt.seat[2];
  // round the race's outer edge, its foot sunk into the race; where the swept deck stands higher at that radius (hull
  // kit or a crowned deck nearer the ring on some bearing), just inside where the sweep starts, still in the race, so
  // the foot need not clear it (a foot raised over it would leave the race's daylight on every other bearing)
  const raceOut = receipt.rimR - RIM_INSET_M, raceIn = raceOut - raceWidth(receipt.rimR);
  let rOut = raceOut + COLLAR_PROUD_M;
  const sweep = receipt.sweepDy, sweepR0 = receipt.sweepR0;
  if (sweep?.length && sweepR0 !== undefined && rOut >= sweepR0) {
    const b = Math.min(sweep.length - 1, Math.floor((rOut - sweepR0) / TURRET_SWEEP_BIN_M));
    if (sweep[b] > RACE_TOP_M + 0.002) {
      const inner = sweepR0 - 0.005;
      if (inner - COLLAR_WALL_M < raceIn) return;
      rOut = inner;
    }
  }
  // 266 (roof-pocket census): a turret whose floor stands well over the ring plane inside the collar (a sealed hollow
  // between the hull's deck and the turret's floor) may take a thicker wall, userData.turretSeatCollarWallM, grown inward
  // from the same outer face (nothing visible moves) and kept on the race. At COLLAR_WALL_M the band is thinner than the
  // census's 2 cm cells, which then read daylight through it into the hollow.
  const wallM = Math.max(COLLAR_WALL_M, Math.min(Number(turretG.userData.turretSeatCollarWallM) || COLLAR_WALL_M, rOut - raceIn));
  const rIn = rOut - wallM;
  const raceTopY = receipt.deckY + RACE_TOP_M, footY = raceTopY - COLLAR_FOOT_SINK_M;
  const roofY = raceTopY + COLLAR_HOLLOW_MAX_M + COLLAR_TOP_BITE_M, skirtY = raceTopY + COLLAR_SKIRT_MAX_M;
  hullG.updateWorldMatrix(true, false);
  turretG.updateMatrixWorld(true);
  _hullInverse.copy(hullG.matrixWorld).invert();
  const plan = (p: THREE.Vector3): number => Math.hypot(p.x - cx, p.z - cz);
  // the visible turret's triangles that can stand over the collar's circle or skirt it, once, in the hull frame (the
  // turret rests at yaw 0; a shadow-only proxy hull can stand lower than the underside it stands for)
  const turretTris = gatherTriangles(meshes.filter((mesh) => !mesh.userData.authoredShadowProxy),
    (mesh) => _toHull.multiplyMatrices(_hullInverse, mesh.matrixWorld),
    (a, b, c) => Math.min(a.y, b.y, c.y) <= roofY && Math.max(plan(a), plan(b), plan(c)) >= rIn - 0.02,
    (box) => box.min.y <= roofY && Math.hypot(Math.max(Math.abs(box.min.x - cx), Math.abs(box.max.x - cx)),
      Math.max(Math.abs(box.min.z - cz), Math.abs(box.max.z - cz))) >= rIn - 0.02);
  // its lowest surface over the foot at the collar's radius, per bearing
  const lowest = new Float64Array(COLLAR_BINS).fill(Infinity);
  scanCircle(turretTris, cx, cz, rOut, COLLAR_BINS, (k, y) => { if (y > footY - 0.002 && y < lowest[k]) lowest[k] = y; });
  // its shell outside the collar on each bearing: how low a skirt comes down round the ring (its edges read along their
  // length, a skirt's lower edge among them)
  const skirt = new Float64Array(COLLAR_BINS).fill(Infinity);
  for (let t = 0; t < turretTris.length; t += 9) {
    for (let e = 0; e < 3; e++) {
      const p = t + e * 3, q = t + ((e + 1) % 3) * 3;
      const px = turretTris[p], py = turretTris[p + 1], pz = turretTris[p + 2];
      const qx = turretTris[q], qy = turretTris[q + 1], qz = turretTris[q + 2];
      if (Math.min(py, qy) > skirtY) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(qx - px, qz - pz) / COLLAR_SKIRT_STEP_M));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, x = px + (qx - px) * u, y = py + (qy - py) * u, z = pz + (qz - pz) * u;
        if (y > skirtY || y <= footY - 0.002 || Math.hypot(x - cx, z - cz) < rOut) continue;
        const n = bearingBin(x, z, cx, cz, COLLAR_BINS);
        if (y < skirt[n]) skirt[n] = y;
      }
    }
  }
  // the gun's lowest surface over each bearing anywhere in its sweep (its rest pitch, then stepped through its depression
  // and its elevation: the gun rig turns by -pitch about x), read on half bearings too: a wall between two bearings runs
  // straight from top to top, so each bearing keeps under the gun half way to its neighbours too
  const gunLow = new Float64Array(COLLAR_BINS * 2).fill(Infinity);
  const gunClearM = Math.max(COLLAR_GUN_CLEAR_M, Number(turretG.userData.turretSeatCollarGunClearM) || 0);
  let reach = -Infinity;
  for (let k = 0; k < COLLAR_BINS; k++) if (lowest[k] <= roofY) reach = Math.max(reach, lowest[k] + COLLAR_TOP_BITE_M);
  if (gunG && reach > footY) {
    const gunMeshes: THREE.Mesh[] = [];
    gunG.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !mesh.userData.authoredShadowProxy
        && mesh.geometry?.getAttribute('position')) gunMeshes.push(mesh);
    });
    const rest = gunG.rotation.x, [depression, elevation] = gunPitchDeg ?? [10, 20];
    const pitches = collarGunPitches(depression, elevation, Number(turretG.userData.turretSeatCollarGunStepDeg) || 0);
    // its triangles that can come over the collar's circle, under the wall's reach, anywhere in that swing, once, in the
    // pivot's frame: a corner swings about the pivot's x axis no further than its distance from it by the chord
    // (generously: the rigs' scales between)
    const swingAngle = THREE.MathUtils.degToRad(Math.max(depression, elevation)) + Math.abs(rest);
    const chord = 2 * Math.sin(Math.min(Math.PI, swingAngle) / 2) * 1.25;
    _pivotInverse.copy(gunG.matrixWorld).invert();
    _gunRest.multiplyMatrices(_hullInverse, gunG.matrixWorld);
    const gunTris = gatherTriangles(gunMeshes, (mesh) => _toHull.multiplyMatrices(_pivotInverse, mesh.matrixWorld), (a, b, c) => {
      const d = chord * Math.max(Math.hypot(a.y, a.z), Math.hypot(b.y, b.z), Math.hypot(c.y, c.z)) + 0.01;
      _g[0].copy(a).applyMatrix4(_gunRest); _g[1].copy(b).applyMatrix4(_gunRest); _g[2].copy(c).applyMatrix4(_gunRest);
      if (Math.min(_g[0].y, _g[1].y, _g[2].y) - d > reach + gunClearM) return false;
      const { near, far } = planReach(_g, cx, cz);
      return near - d <= rOut && far + d >= rOut;
    });
    if (gunTris.length) {
      const posed = new Float64Array(gunTris.length);
      for (const pitch of pitches) {
        gunG.rotation.x = pitch === 0 ? rest : -THREE.MathUtils.degToRad(pitch);
        gunG.updateMatrix();
        _toHull.multiplyMatrices(_hullInverse, gunG.parent ? _gunPosed.multiplyMatrices(gunG.parent.matrixWorld, gunG.matrix) : gunG.matrix);
        const m = _toHull.elements;
        for (let i = 0; i < gunTris.length; i += 3) {
          const x = gunTris[i], y = gunTris[i + 1], z = gunTris[i + 2];
          posed[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
          posed[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          posed[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        scanCircle(posed, cx, cz, rOut, COLLAR_BINS * 2, (k, y) => { if (y < gunLow[k]) gunLow[k] = y; });
      }
      gunG.rotation.x = rest;
      gunG.updateMatrix();
    }
  }
  const tops = new Float64Array(COLLAR_BINS);
  let any = false;
  for (let k = 0; k < COLLAR_BINS; k++) {
    const prev = (k + COLLAR_BINS - 1) % COLLAR_BINS, next = (k + 1) % COLLAR_BINS;
    const seam = lowest[k] - raceTopY;
    // a hollow turret: nothing over the circle within COLLAR_MAX_M here, but its skirt comes down outside it (here or
    // on a neighbour): the wall rises into the turret's roof behind the skirt, so no ray under the skirt passes through
    const hollow = seam <= COLLAR_HOLLOW_MAX_M && Math.min(skirt[prev], skirt[k], skirt[next]) <= skirtY;
    const gunCap = Math.min(gunLow[2 * k], gunLow[(2 * k + 1) % (2 * COLLAR_BINS)],
      gunLow[(2 * k + 2 * COLLAR_BINS - 1) % (2 * COLLAR_BINS)]) - gunClearM;
    const top = Math.min(lowest[k] + COLLAR_TOP_BITE_M, gunCap);
    tops[k] = seam > COLLAR_MIN_SEAM_M && (seam <= COLLAR_MAX_M || hollow) && top > raceTopY + COLLAR_MIN_SEAM_M ? top : footY;
    if (tops[k] > footY) any = true;
  }
  if (!any) return;
  // the wall: per bearing an outer face, an inner face, a top over the two, a bottom under them (hull frame, then into
  // the turret's frame); a bearing with no gap stands at its foot, so its faces fold flat there
  const positions: number[] = [];
  const quad = (p: number[], q: number[], r: number[], s: number[]): void => { positions.push(...p, ...q, ...r, ...p, ...r, ...s); };
  const at = (k: number, r: number, y: number): number[] => {
    const a = ((k % COLLAR_BINS) / COLLAR_BINS) * Math.PI * 2;
    return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
  };
  for (let k = 0; k < COLLAR_BINS; k++) {
    const k1 = (k + 1) % COLLAR_BINS, t0 = tops[k], t1 = tops[k1];
    if (t0 <= footY && t1 <= footY) continue;
    quad(at(k, rOut, footY), at(k1, rOut, footY), at(k1, rOut, t1), at(k, rOut, t0));   // outer, facing out
    quad(at(k1, rIn, footY), at(k, rIn, footY), at(k, rIn, t0), at(k1, rIn, t1));      // inner, facing the axis
    quad(at(k, rOut, t0), at(k1, rOut, t1), at(k1, rIn, t1), at(k, rIn, t0));          // top
    quad(at(k, rIn, footY), at(k1, rIn, footY), at(k1, rOut, footY), at(k, rOut, footY)); // bottom
  }
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const toTurret = new THREE.Matrix4().copy(turretG.matrixWorld).invert().multiply(hullG.matrixWorld);
  geometry.applyMatrix4(toTurret);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const shell = meshes.find((mesh) => mesh.name === 'turret') ?? meshes[0];
  const material = Array.isArray(shell?.material) ? shell.material[0] : shell?.material;
  if (!material) { geometry.dispose(); return; }
  // 264: the shell's paint reads vertex colour and the camouflage's face projection; with neither the collar drew black
  // under every seated turret (vertex-color-coverage). It takes the painted shade and the shell's projection (and its
  // camouflage split), as a bucket part does, so the ring reads in the turret's paint.
  paintedSurfaceShade(geometry);
  const camoScale = shell.geometry.userData.camoFaceProjection as number | undefined;
  if (camoScale) {
    faceBoxUV(geometry, camoScale);
    const remap = shell.geometry.userData.camoUvRemap as CamoUvRemap | undefined;
    if (remap) remapCamoUv(geometry, remap);
  }
  const collar = new THREE.Mesh(geometry, material);
  collar.name = TURRET_SEAT_COLLAR_NAME;
  collar.userData.turretSeatRace = true;
  collar.userData.combatHitboxRole = 'armor';
  collar.castShadow = true;
  collar.receiveShadow = true;
  turretG.add(collar);
  disposables.push(geometry);
}
