/**
 * The seat pass over a built tank's spare-track runs (VEH-13; the solver and its rules are spareTrackSeat.ts).
 *
 * S2/S3 (factory, decor on or off): once a profile has drawn its buckets and mounted its fittings, every authored run
 * (each FITTINGS.spareTrackLinks group, each KIT.spareTrackStrip, each hand-drawn course registered through
 * withSpareTrackRun) is measured where it was authored. A passing run is left exactly as built; a failing one is
 * re-seated from outside nearby, or removed and recorded. S1 (decor): the decor's own spare-link rows ask the same
 * solver through `decorSeatEnv`, over the merged meshes.
 */
import * as THREE from 'three';
import { minimumMechanicalGunPitch, type GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import { casemateGunYawLimit } from './casemateGunPose.ts';
import {
  seatGunSlices, seatRadialProfile, seatReceipt, seatRoleForMesh, seatRoleForPart, solveSpareTrackSeat, SeatSoup,
  measureSeat,
  type SeatEnv, type SeatMeasure, type SeatMotion, type SeatPose, type SeatRadialProfile, type SeatRole, type SeatRunShape,
  type SeatSource, type SpareTrackRunTag, type SpareTrackSeatReceipt,
} from './spareTrackSeat.ts';

const D2R = Math.PI / 180;
/** A railed carrier's link backs stand 1.8 cm off its base (profiles/kit.ts fittingSpareTrackLinks, KIT.spareTrackStrip). */
const CARRIER_STANDOFF_M = 0.018;
/** Around a run's region, the triangles that can matter: the exposure rays reach 0.8 m. */
const SOUP_MARGIN_M = 0.9;

interface SeatSpec {
  id: string;
  armor: { turretless?: boolean };
  gunDepressionDeg?: number;
  gunElevationDeg?: number;
  gunPitchByYawDeg?: GunPitchByYawCurve;
  gunArcDeg?: number;
  hydropneumaticAim?: unknown;
}

/** The three articulation frames' geometry as seat sources, each in its own frame. */
export interface SeatFrames {
  hull: SeatSource[];
  turret: SeatSource[];
  gun: SeatSource[];
  /** Turret pivot (hull frame) and gun pivot (turret frame) at rest. */
  pivot: THREE.Vector3;
  gunPivot: THREE.Vector3;
}

function relativeMatrix(frame: THREE.Object3D, object: THREE.Object3D): THREE.Matrix4 {
  return new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(object.matrixWorld);
}

/** True when `object` sits under `ancestor`. */
function under(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = object; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/**
 * Seat sources from scene meshes under `group` (fittings, running gear, merged buckets), skipping `skip` subtrees.
 * `owners` maps a run's root object to its owner id.
 */
function meshSources(frame: THREE.Object3D, group: THREE.Object3D, skip: readonly THREE.Object3D[],
  owners: ReadonlyMap<THREE.Object3D, number>, out: SeatSource[], foreign = false): void {
  const visit = (o: THREE.Object3D, owner: number): void => {
    if (o.visible === false || skip.includes(o)) return;
    const own = owners.get(o) ?? owner;
    if (o instanceof THREE.LOD) { if (o.levels[0]?.object) visit(o.levels[0].object, own); return; }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o instanceof THREE.InstancedMesh) && mesh.geometry?.getAttribute('position')) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const role = own ? 'run' : seatRoleForMesh(o);
      if (role && material?.colorWrite !== false) {
        const ranges = o.userData.seatRoleRanges as SeatSource['ranges'] | undefined;
        out.push({ geometry: mesh.geometry, matrix: relativeMatrix(frame, o), role, ranges, owner: own, foreign });
      }
    }
    for (const c of o.children) visit(c, own);
  };
  for (const c of group.children) visit(c, 0);
}

function moved(sources: readonly SeatSource[], matrix: THREE.Matrix4, foreign: boolean): SeatSource[] {
  return sources.map((s) => ({ ...s, bounds: undefined, foreign,
    matrix: s.matrix ? new THREE.Matrix4().multiplyMatrices(matrix, s.matrix) : matrix.clone() }));
}

/** The motion round runs of this vehicle (null for a gun fixed in its hull with no turret). */
export function buildSeatMotion(spec: SeatSpec, frames: SeatFrames, fixedMount: boolean): SeatMotion | null {
  const turreted = !spec.armor.turretless;
  const arc = turreted || fixedMount ? 0 : casemateGunYawLimit({ armor: spec.armor, gunArcDeg: spec.gunArcDeg,
    hydropneumaticAim: spec.hydropneumaticAim });
  if (!turreted && !(arc > 0)) return null;
  const gun = frames.gun.length ? seatGunSlices(frames.gun) : null;
  const toHull = new THREE.Matrix4().makeTranslation(frames.pivot.x, frames.pivot.y, frames.pivot.z);
  let turretLow: SeatRadialProfile | null = null;
  if (turreted) {
    turretLow = seatRadialProfile(moved(frames.turret, toHull, false), frames.pivot.x, frames.pivot.z, true);
  }
  let hullHigh: SeatRadialProfile | null | undefined;
  return {
    pivot: frames.pivot.clone(),
    gunPivot: frames.gunPivot.clone(),
    turreted,
    arc,
    gun,
    pitchMin: (yaw) => minimumMechanicalGunPitch(spec, yaw),
    pitchMax: (spec.gunElevationDeg ?? 20) * D2R,
    turretLow,
    hullHigh: () => {
      if (hullHigh === undefined) {
        hullHigh = seatRadialProfile(frames.hull, frames.pivot.x, frames.pivot.z, false, 0, 8,
          frames.pivot.y - 1.2);
      }
      return hullHigh;
    },
  };
}

/** The soup and environment for one run of `frame` around `region` (that frame's coordinates). */
function seatEnv(frames: SeatFrames, frame: 'hull' | 'turret', region: THREE.Box3, motion: SeatMotion | null): SeatEnv {
  const p = frames.pivot, g = frames.gunPivot;
  const turretToHull = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
  const gunToTurret = new THREE.Matrix4().makeTranslation(g.x, g.y, g.z);
  const sources = frame === 'hull'
    ? [...frames.hull, ...moved(frames.turret, turretToHull, true),
      ...moved(frames.gun, new THREE.Matrix4().multiplyMatrices(turretToHull, gunToTurret), true)]
    : [...frames.turret, ...moved(frames.gun, gunToTurret, false),
      ...moved(frames.hull, turretToHull.clone().invert(), true)];
  return { frame, soup: new SeatSoup(sources, region.clone().expandByScalar(SOUP_MARGIN_M)), motion };
}

// ------------------------------------------------------------------------------------------------ S2/S3 (factory)

/** What the factory hands the pass (its unmerged buckets and rigs). */
export interface AuthoredSeatArgs {
  spec: SeatSpec;
  buckets: Record<string, THREE.BufferGeometry[]>;
  /** The rig group a bucket merges into, or null for an unknown bucket. */
  bucketParent: (bucket: string) => THREE.Object3D | null;
  isEra: (part: THREE.BufferGeometry) => boolean;
  root: THREE.Object3D;
  hullG: THREE.Group;
  turretG: THREE.Group;
  gunG: THREE.Group;
  fixedMount: boolean;
}

interface AuthoredRun {
  owner: number;
  site: string;
  frame: 'hull' | 'turret';
  source: 'fitting' | 'strip' | 'adhoc';
  shape: SeatRunShape;
  hint: SeatPose;
  group?: THREE.Object3D;
  parts?: Array<{ bucket: string; part: THREE.BufferGeometry }>;
}

export interface SpareTrackSeatReport {
  runs: SpareTrackSeatReceipt[];
  rejected: Array<{ site: string; frame: 'hull' | 'turret'; source: string; reason: string;
    /** The authored seat's measures (why it could not stay). */
    authored?: Record<string, number | null> }>;
}

const r2 = (x: number): string => (Math.round(x * 100) / 100).toFixed(2);

/** Discover, measure and (re)seat or drop every authored run of a built-but-unmerged tank. */
export function seatAuthoredSpareTracks(a: AuthoredSeatArgs): SpareTrackSeatReport {
  const report: SpareTrackSeatReport = { runs: [], rejected: [] };
  a.root.updateMatrixWorld(true);
  const frameOf = (o: THREE.Object3D): 'hull' | 'turret' | null =>
    under(o, a.gunG) ? null : under(o, a.turretG) ? 'turret' : under(o, a.hullG) ? 'hull' : null;
  const runs: AuthoredRun[] = [];
  // fittings (S2)
  let fittingSerial = 0;
  for (const rig of [a.hullG, a.turretG]) {
    rig.traverse((o) => {
      if (o.userData?.fitting !== 'spareTrackLinks' || o.userData.fittingRoot !== true) return;
      const frame = frameOf(o);
      if (!frame) return;
      const frameG = frame === 'hull' ? a.hullG : a.turretG;
      const m = relativeMatrix(frameG, o);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      m.decompose(pos, quat, scale);
      const box = new THREE.Box3();
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
        }
      });
      if (box.isEmpty()) return;
      box.min.multiply(scale); box.max.multiply(scale);
      runs.push({ owner: -(1 + fittingSerial++), frame, source: 'fitting', group: o,
        site: `fitting@${frame}(${r2(pos.x)},${r2(pos.y)},${r2(pos.z)})`,
        shape: { box, axis: 1, embedM: 0, standoffM: CARRIER_STANDOFF_M }, hint: { pos, quat } });
    });
  }
  // tagged bucket parts (strips S2, hand-drawn courses S3)
  const tagged = new Map<number, { tag: SpareTrackRunTag; frame: 'hull' | 'turret'; parts: Array<{ bucket: string; part: THREE.BufferGeometry }> }>();
  for (const [bucket, list] of Object.entries(a.buckets)) {
    const parent = a.bucketParent(bucket);
    const frame = parent === a.hullG ? 'hull' : parent === a.turretG ? 'turret' : null;
    if (!frame) continue;
    for (const part of list) {
      const tag = part.userData.spareTrackRun as (SpareTrackRunTag & { id: number }) | undefined;
      if (!tag) continue;
      let entry = tagged.get(tag.id);
      if (!entry) { entry = { tag, frame, parts: [] }; tagged.set(tag.id, entry); }
      entry.parts.push({ bucket, part });
    }
  }
  for (const [id, { tag, frame, parts }] of [...tagged].sort((p, q) => p[0] - q[0])) {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...tag.rotation));
    const inv = quat.clone().invert();
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (const { part } of parts) {
      const pos = part.getAttribute('position');
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyQuaternion(inv));
    }
    if (box.isEmpty()) continue;
    const center = box.getCenter(new THREE.Vector3()).applyQuaternion(quat);
    runs.push({ owner: id, frame, source: tag.source, parts,
      site: `${tag.site}@${frame}(${r2(center.x)},${r2(center.y)},${r2(center.z)})`,
      shape: { box, axis: tag.axis ?? 1, embedM: tag.embedM ?? 0,
        standoffM: tag.standoffM ?? (tag.source === 'strip' ? CARRIER_STANDOFF_M : 0) },
      hint: { pos: new THREE.Vector3(), quat } });
  }
  if (!runs.length) return report;

  const owners = new Map<THREE.Object3D, number>();
  for (const run of runs) if (run.group) owners.set(run.group, run.owner);
  const collect = (): SeatFrames => {
    a.root.updateMatrixWorld(true);
    const frames: SeatFrames = { hull: [], turret: [], gun: [],
      pivot: a.turretG.position.clone(), gunPivot: a.gunG.position.clone() };
    for (const [bucket, list] of Object.entries(a.buckets)) {
      const parent = a.bucketParent(bucket);
      if (!parent) continue;
      const target = parent === a.hullG ? frames.hull : parent === a.turretG ? frames.turret
        : under(parent, a.gunG) ? frames.gun : null;
      if (!target) continue;
      const matrix = target === frames.gun && parent !== a.gunG ? relativeMatrix(a.gunG, parent) : null;
      for (const part of list) {
        const tag = part.userData.spareTrackRun as { id: number } | undefined;
        const role: SeatRole = seatRoleForPart(bucket, part, a.isEra(part));
        target.push({ geometry: part, matrix, role, owner: tag?.id ?? 0 });
      }
    }
    meshSources(a.hullG, a.hullG, [a.turretG], owners, frames.hull);
    meshSources(a.turretG, a.turretG, [a.gunG], owners, frames.turret);
    return frames;
  };
  let frames = collect();
  const motion = buildSeatMotion(a.spec, frames, a.fixedMount);
  for (const run of runs) {
    const placed = run.shape.box.clone().applyMatrix4(new THREE.Matrix4().compose(run.hint.pos, run.hint.quat,
      new THREE.Vector3(1, 1, 1)));
    const env = seatEnv(frames, run.frame, placed, motion);
    const result = solveSpareTrackSeat(env, run.shape, run.hint, run.owner);
    if (result.ok && result.seat === 'authored') {
      report.runs.push(seatReceipt(run.site, run.frame, run.source, 'authored', result.measure));
      continue;
    }
    if (result.ok && result.pose) {
      applySeat(a, run, result.pose);
      const c0 = run.shape.box.getCenter(new THREE.Vector3());
      const cm = Math.round(c0.clone().applyQuaternion(result.pose.quat).add(result.pose.pos)
        .distanceTo(c0.clone().applyQuaternion(run.hint.quat).add(run.hint.pos)) * 1000) / 10;
      const deg = Math.round(result.pose.quat.angleTo(run.hint.quat) * 1800 / Math.PI) / 10;
      report.runs.push({ ...seatReceipt(run.site, run.frame, run.source, 'reseated', result.measure),
        moved: { reason: result.hint.reason, cm, deg } });
    } else {
      removeRun(a, run);
      const { support, air, maxEmbedCm, clearCm, cutCm, sweepCm, exposure } =
        seatReceipt(run.site, run.frame, run.source, 'authored', result.hint);
      report.rejected.push({ site: run.site, frame: run.frame, source: run.source, reason: result.hint.reason ?? 'unseated',
        authored: { support, air, maxEmbedCm, clearCm, cutCm, sweepCm, exposure } });
    }
    frames = collect();
  }
  return report;
}

function applySeat(a: AuthoredSeatArgs, run: AuthoredRun, pose: SeatPose): void {
  const from = new THREE.Matrix4().compose(run.hint.pos, run.hint.quat, new THREE.Vector3(1, 1, 1));
  const to = new THREE.Matrix4().compose(pose.pos, pose.quat, new THREE.Vector3(1, 1, 1));
  const delta = to.clone().multiply(from.invert());
  if (run.group) {
    const frameG = run.frame === 'hull' ? a.hullG : a.turretG;
    const inFrame = relativeMatrix(frameG, run.group);
    const target = delta.clone().multiply(inFrame);
    const parentInFrame = run.group.parent ? relativeMatrix(frameG, run.group.parent) : new THREE.Matrix4();
    const local = parentInFrame.invert().multiply(target);
    local.decompose(run.group.position, run.group.quaternion, run.group.scale);
    run.group.updateMatrixWorld(true);
  }
  for (const { part } of run.parts ?? []) part.applyMatrix4(delta);
}

function removeRun(a: AuthoredSeatArgs, run: AuthoredRun): void {
  if (run.group) run.group.parent?.remove(run.group);
  for (const { bucket, part } of run.parts ?? []) {
    const list = a.buckets[bucket];
    const at = list ? list.indexOf(part) : -1;
    if (at >= 0) list.splice(at, 1);
  }
}

// --------------------------------------------------------------------------------------------------------- S1 (decor)

/**
 * The decor's seat environment factory over a finished, merged tank: `envFor(frame, region)` builds one run's soup
 * from the rigs' meshes (merged buckets with their tagged role ranges, fittings, running gear) plus the decor pieces
 * already committed (`decor`, frame coordinates).
 */
export function decorSeatEnv(spec: SeatSpec, hullG: THREE.Group, turretG: THREE.Group, fixedMount: boolean,
  decor: Record<'hull' | 'turret', readonly THREE.BufferGeometry[]>):
  (frame: 'hull' | 'turret', region: THREE.Box3) => SeatEnv {
  hullG.updateMatrixWorld(true);
  turretG.updateMatrixWorld(true);
  const gunG = turretG.getObjectByName('rig_gun') ?? null;
  const frames: SeatFrames = { hull: [], turret: [], gun: [], pivot: turretG.position.clone(),
    gunPivot: gunG ? gunG.position.clone() : new THREE.Vector3() };
  const none = new Map<THREE.Object3D, number>();
  meshSources(hullG, hullG, gunG ? [turretG, gunG] : [turretG], none, frames.hull);
  meshSources(turretG, turretG, gunG ? [gunG] : [], none, frames.turret);
  if (gunG) {
    gunG.updateMatrixWorld(true);
    meshSources(gunG, gunG, [], none, frames.gun);
  }
  for (const frame of ['hull', 'turret'] as const) {
    for (const geometry of decor[frame]) frames[frame].push({ geometry, matrix: null, role: 'decor', owner: 0 });
  }
  let motion: SeatMotion | null | undefined;
  return (frame, region) => {
    if (motion === undefined) motion = buildSeatMotion(spec, frames, fixedMount);
    // decor committed since the factory was made joins on the next call (the lists are live)
    for (const f of ['hull', 'turret'] as const) {
      for (const geometry of decor[f]) {
        if (!frames[f].some((s) => s.geometry === geometry)) frames[f].push({ geometry, matrix: null, role: 'decor', owner: 0 });
      }
    }
    return seatEnv(frames, frame, region, motion);
  };
}

/**
 * One decor run's measure at a pose (S1): the solver's rules, no search (the slot owns its candidate stations). A
 * station check stops at its first failing rule; `full` measures everything (the receipt of the seat that passed).
 */
export function decorSeatMeasure(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, full = false, fresh = false): SeatMeasure {
  return measureSeat(env, shape, pose, 0, full, fresh);
}

