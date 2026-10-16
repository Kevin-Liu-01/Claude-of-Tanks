/**
 * The seat pass over a built tank's spare-track runs (VEH-13; the solver and its rules are spareTrackSeat.ts).
 *
 * S2/S3 (factory, decor on or off): once a profile has drawn its buckets and mounted its fittings, every authored run
 * (each FITTINGS.spareTrackLinks group, each KIT.spareTrackStrip, each hand-drawn course registered through
 * withSpareTrackRun) is measured where it was authored. A passing run is left exactly as built; a failing one is
 * re-seated from outside nearby, or removed and recorded. S1 (decor): the decor's own spare-link rows ask the same
 * solver through `decorSeatEnv`, over the merged meshes.
 *
 * The search is the pass's only real cost, so its answers are recorded per vehicle in spareTrackSeatPlan.ts
 * (tools/spare-track-placement-check.mjs --update, run by npm run tank:anatomy:update): a run whose authored seat
 * fails goes straight to its recorded station, or is not built when the record says no station passes. The record
 * only steers the search: every built run is still measured and passes, and a station that no longer passes falls
 * back to the full search. The tool's audit mode re-runs the search and fails a record that has gone stale.
 */
import * as THREE from 'three';
import { minimumMechanicalGunPitch, type GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import { casemateGunYawLimit } from './casemateGunPose.ts';
import { mergeAll } from './factoryGeometry.ts';
import { SPARE_TRACK_SEAT_PLAN, type SeatPlanEntry } from './spareTrackSeatPlan.ts';
import {
  seatAngularLow, seatGunSlices, seatRadialProfile, seatReceipt, seatRoleForMesh, seatRoleForPart, solveSpareTrackSeat,
  SeatSoup, measureSeat, remountSeats, seatSourceBounds, rackSeat, searchPoses, seatExposure, type RackSeat, AUTHORED_SEARCH, NO_SEARCH, type SeatAngularProfile, type SeatResult,
  type SeatEnv, type SeatMeasure, type SeatMotion, type SeatPose, type SeatRadialProfile, type SeatRole, type SeatRunShape,
  type SeatSource, type SpareTrackRunTag, type SpareTrackSeatReceipt,
} from './spareTrackSeat.ts';

const D2R = Math.PI / 180;
/** A railed carrier's link backs stand 1.8 cm off its base (profiles/kit.ts fittingSpareTrackLinks, KIT.spareTrackStrip). */
const CARRIER_STANDOFF_M = 0.018;
/** Around a run's region, the triangles that can matter: the exposure rays reach 0.8 m. */
const SOUP_MARGIN_M = 0.9;

let planAudit = false;
/**
 * Tools only: also run the full search for every run whose authored seat fails (the frame-wide remount and the racks
 * included, which game builds never run: they take the recorded answer) and record, on the root's
 * `userData.spareTrackPlanAudit`, the search's answers (`live`) and where the recorded plan differs (`stale`).
 */
export function setSpareTrackSeatPlanAudit(on: boolean): void { planAudit = on; }

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
  let turretLow: SeatRadialProfile | null | undefined;
  let hullHigh: SeatRadialProfile | null | undefined;
  let turretAngular: SeatAngularProfile | null | undefined;
  return {
    pivot: frames.pivot.clone(),
    gunPivot: frames.gunPivot.clone(),
    turreted,
    arc,
    gun,
    pitchMin: (yaw) => minimumMechanicalGunPitch(spec, yaw),
    pitchMax: (spec.gunElevationDeg ?? 20) * D2R,
    // built on first use: only hull runs read the turret's underside
    get turretLow(): SeatRadialProfile | null {
      if (turretLow === undefined) {
        turretLow = turreted
          ? seatRadialProfile(moved(frames.turret, toHull, false), frames.pivot.x, frames.pivot.z, true) : null;
      }
      return turretLow;
    },
    hullHigh: () => {
      if (hullHigh === undefined) {
        hullHigh = seatRadialProfile(frames.hull, frames.pivot.x, frames.pivot.z, false, 0, 8,
          frames.pivot.y - 1.2);
      }
      return hullHigh;
    },
    turretAngularLow: () => {
      if (turretAngular === undefined) turretAngular = turreted ? seatAngularLow(frames.turret) : null;
      return turretAngular;
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
  if (!runs.length) {
    if (planAudit) {
      a.root.userData.spareTrackPlanAudit = { live: {},
        stale: Object.keys(SPARE_TRACK_SEAT_PLAN[a.spec.id] ?? {}).map((site) => `${site}: plan entry for a run that no longer exists`) };
    }
    return report;
  }

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
  const plan = SPARE_TRACK_SEAT_PLAN[a.spec.id];
  const consulted = new Set<string>();
  const audit = planAudit ? { live: {} as Record<string, SeatPlanEntry>, stale: [] as string[] } : null;
  const kept: Record<'hull' | 'turret', THREE.Box3[]> = { hull: [], turret: [] };
  const keep = (run: AuthoredRun, shape: SeatRunShape, pose: SeatPose): void => {
    kept[run.frame].push(shape.box.clone().applyMatrix4(new THREE.Matrix4().compose(pose.pos, pose.quat, UNIT)));
  };
  const reject = (run: AuthoredRun, site: string, hint: SeatMeasure): void => {
    const { support, air, maxEmbedCm, clearCm, cutCm, sweepCm, exposure } =
      seatReceipt(site, run.frame, run.source, 'authored', hint);
    report.rejected.push({ site, frame: run.frame, source: run.source, reason: hint.reason ?? 'unseated',
      authored: { support, air, maxEmbedCm, clearCm, cutCm, sweepCm, exposure } });
  };
  for (const run of runs) {
    const placed = run.shape.box.clone().applyMatrix4(new THREE.Matrix4().compose(run.hint.pos, run.hint.quat, UNIT));
    const env = seatEnv(frames, run.frame, placed, motion);
    // 1. authored mounts first: the seat as authored, or lifted straight off a mount it sinks into
    const own = solveSpareTrackSeat(env, run.shape, run.hint, run.owner, NO_SEARCH);
    if (own.ok && own.pose && own.seat === 'authored') {
      report.runs.push(seatReceipt(run.site, run.frame, run.source, 'authored', own.measure));
      keep(run, run.shape, run.hint);
      continue;
    }
    if (own.ok && own.pose) {
      applySeat(a, run, own.pose);
      report.runs.push(movedReceipt(run, own.pose, own.measure, own.hint, 'lifted'));
      keep(run, run.shape, own.pose);
      frames = collect();
      continue;
    }
    // 2. a hand-drawn course keeps the links whose own authored seat holds and loses the dead ones (buried, sunk)
    const trimmed = run.source === 'adhoc' ? trimCourse(env, run) : null;
    if (trimmed) {
      for (const unit of trimmed) {
        const site = `${run.site}#${unit.index}`;
        if (unit.measure.ok) {
          report.runs.push(seatReceipt(site, run.frame, run.source, 'authored', unit.measure));
          keep(run, unit.shape, run.hint);
        } else {
          for (const part of unit.parts) removePart(a, part);
          reject(run, site, unit.measure);
        }
      }
      frames = collect();
      continue;
    }
    // 3. only a mount that is itself wrong is left: search nearby (the recorded answer first); 4. fix the mount, don't
    // remove (the owner's rule): failing that, every other station the run's own frame carries, nearest first
    const planned = plan?.[run.site];
    if (planned !== undefined) consulted.add(run.site);
    // a recorded or found seat as the plan keeps it: [x, y, z, qx, qy, qz, qw, rack]
    const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;
    const entry = (pose: SeatPose, racked: boolean): number[] =>
      [r5(pose.pos.x), r5(pose.pos.y), r5(pose.pos.z), r5(pose.quat.x), r5(pose.quat.y), r5(pose.quat.z), r5(pose.quat.w), racked ? 1 : 0];
    type Found = { result: SeatResult; answer: SeatPlanEntry; rack: RackSeat | null };
    // a moved run takes a second, longer look round it on the whole frame (a far overhang still buries it)
    // every step-4 seat is measured on the whole frame (one soup a run): the search, the long look and a game build's
    // replay of a recorded answer read the same armour, so the replay reproduces the answer
    let wholeFrame: SeatEnv | null = null;
    const whole = (): SeatEnv => (wholeFrame ??= seatEnv(frames, run.frame, frameBounds(frames, run.frame), motion));
    let recorded = false;              // a game build following the receipt's recorded answer skips the long look
    const open = (pose: SeatPose): boolean => {
      if (recorded && !planAudit) return true;
      return seatExposure(whole(), run.shape, pose, run.owner, 2.5) >= 0.5;
    };
    const flushAt = (at: SeatEnv, pose: SeatPose): Found | null => (measureSeat(at, run.shape, pose, run.owner, false, true).ok
      && open(pose)
      ? { result: { ok: true, seat: 'reseated', pose, measure: measureSeat(at, run.shape, pose, run.owner, true, true), hint: own.hint,
        station: null }, answer: entry(pose, false), rack: null } : null);
    const rackAt = (at: SeatEnv, pose: SeatPose): Found | null => {
      const quick = rackSeat(at, run.shape, pose, run.owner);
      if (!quick || !open(quick.pose)) return null;
      const full = rackSeat(at, run.shape, pose, run.owner, true)!;
      return { result: { ok: true, seat: 'reseated', pose: full.pose, measure: full.measure, hint: own.hint, station: null },
        answer: entry(pose, true), rack: full };
    };
    const searchFor = (p: SeatPlanEntry | undefined): Found => {
      if (p !== undefined && typeof p !== 'number') {
        // a recorded seat elsewhere (flush or on a rack): measured first; a stale one falls back to the whole search
        const pose = { pos: new THREE.Vector3(p[0], p[1], p[2]), quat: new THREE.Quaternion(p[3], p[4], p[5], p[6]) };
        // measured on the whole frame, as the search measured it (the gun's armour limits are read off the frame)
        const at = whole();
        recorded = true;
        const got = p[7] ? rackAt(at, pose) : flushAt(at, pose);
        recorded = false;
        if (got) return { ...got, answer: p };
        return searchFor(undefined);
      }
      // 3. the local search, flush
      const local = solveSpareTrackSeat(env, run.shape, run.hint, run.owner, AUTHORED_SEARCH, p, own.hint);
      if (local.ok || p === -1) return { result: local, answer: local.station ?? -1, rack: null };
      // the frame-wide search costs seconds: a game build takes its recorded answer (above), and only the receipt's
      // audit (which records the answers) searches; an unrecorded run waits for that update, unbuilt
      if (!planAudit) return { result: local, answer: -1, rack: null };
      // 4. fix the mount, don't remove: a rack where it was authored and round it, then every other station of its frame
      // (each flush, else on a rack), nearest first on the face it was authored on
      const all = whole();
      for (const pose of [run.hint, ...searchPoses(run.shape, run.hint)]) {
        const got = rackAt(all, pose);
        if (got) return got;
      }
      const stations = remountSeats(all, run.shape, run.hint, frameBounds(frames, run.frame), run.owner);
      for (const pose of stations) {
        const got = flushAt(all, pose) ?? rackAt(all, pose);
        if (got) return got;
      }
      return { result: local, answer: -1, rack: null };
    };
    const { result, answer, rack } = searchFor(planned);
    if (audit) {
      // the search's own answer, from scratch, against the recorded one
      const live = planned === undefined ? answer : searchFor(undefined).answer;
      audit.live[run.site] = live;
      if (JSON.stringify(planned) !== JSON.stringify(live)) {
        audit.stale.push(`${run.site}: plan ${JSON.stringify(planned) ?? 'none'}, search ${JSON.stringify(live)}`);
      } else if (planned !== undefined && JSON.stringify(answer) !== JSON.stringify(planned)) {
        // the search still gives the recorded answer, but the build could not replay it (a game build would not either)
        audit.stale.push(`${run.site}: the recorded answer ${JSON.stringify(planned)} does not replay`);
      }
    }
    if (result.ok && result.pose) {
      applySeat(a, run, result.pose);
      if (rack) addRack(a, run, rack);
      else if (run.source === 'adhoc') addRetention(a, run, result.pose);
      report.runs.push(movedReceipt(run, result.pose, result.measure, result.hint, rack ? 'racked' : 'reseated'));
      keep(run, run.shape, result.pose);
    } else {
      removeRun(a, run);
      reject(run, run.site, result.hint);
    }
    frames = collect();
  }
  // the built runs' links take the spare links' own weathered steel: off the track-steel buckets they share with other
  // dressing (bustle racks, skirt strips, ERA belts) into their own
  for (const [from, to] of [['hullTrack', 'hullTrackLinks'], ['turretTrack', 'turretTrackLinks']] as const) {
    const list = a.buckets[from];
    if (!list?.length) continue;
    const links = list.filter((part) => part.userData.spareTrackRun);
    if (!links.length) continue;
    a.buckets[from] = list.filter((part) => !part.userData.spareTrackRun);
    (a.buckets[to] ??= []).push(...links);
  }
  // the decor keeps its pieces out of every built run (decorations.ts), frame coordinates
  a.root.userData.spareTrackBoxes = {
    hull: kept.hull.map((b) => [...b.min.toArray(), ...b.max.toArray()]),
    turret: kept.turret.map((b) => [...b.min.toArray(), ...b.max.toArray()]),
  };
  if (audit) {
    for (const site of Object.keys(plan ?? {})) {
      if (!consulted.has(site)) audit.stale.push(`${site}: plan entry for a run that seats as authored or no longer exists`);
    }
    a.root.userData.spareTrackPlanAudit = audit;
  }
  return report;
}

const UNIT = new THREE.Vector3(1, 1, 1);

/** The bounds of a frame's own geometry (its frame coordinates), for the remount search's rays. */
function frameBounds(frames: SeatFrames, frame: 'hull' | 'turret'): THREE.Box3 {
  const box = new THREE.Box3();
  for (const source of frame === 'hull' ? frames.hull : frames.turret) {
    if (source.owner) continue;
    box.union(seatSourceBounds(source));
  }
  return box;
}

/** A receipt row for a run the pass moved (lifted off its mount, or re-seated), with how far and why. */
function movedReceipt(run: AuthoredRun, pose: SeatPose, measure: SeatMeasure, hint: SeatMeasure,
  seat: 'lifted' | 'reseated' | 'racked'): SpareTrackSeatReceipt {
  const c0 = run.shape.box.getCenter(new THREE.Vector3());
  const cm = Math.round(c0.clone().applyQuaternion(pose.quat).add(pose.pos)
    .distanceTo(c0.clone().applyQuaternion(run.hint.quat).add(run.hint.pos)) * 1000) / 10;
  const deg = Math.round(pose.quat.angleTo(run.hint.quat) * 1800 / Math.PI) / 10;
  const h = seatReceipt(run.site, run.frame, run.source, 'authored', hint);
  return { ...seatReceipt(run.site, run.frame, run.source, seat, measure),
    moved: { reason: hint.reason, cm, deg, authored: { support: h.support, air: h.air, maxEmbedCm: h.maxEmbedCm,
      clearCm: h.clearCm, cutCm: h.cutCm, sweepCm: h.sweepCm, exposure: h.exposure } } };
}

interface CourseUnit { index: number; parts: Array<{ bucket: string; part: THREE.BufferGeometry }>; shape: SeatRunShape;
  measure: SeatMeasure }

/**
 * A hand-drawn course whose whole seat fails, link by link: the parts grouped into touching units (one link and its
 * plates), each measured where it was authored. Null unless some units hold and some do not (the course then keeps
 * the ones that hold); a course that holds nowhere, or whose units all hold, is the search's.
 */
function trimCourse(env: SeatEnv, run: AuthoredRun): CourseUnit[] | null {
  const parts = run.parts ?? [];
  if (parts.length < 2) return null;
  const inv = run.hint.quat.clone().invert();
  const v = new THREE.Vector3();
  const boxes = parts.map(({ part }) => {
    const b = new THREE.Box3(), pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyQuaternion(inv));
    return b;
  });
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (boxes[i].clone().expandByScalar(0.003).intersectsBox(boxes[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  parts.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  if (groups.size < 2) return null;
  const units: CourseUnit[] = [...groups.values()].map((idx, k) => {
    const box = new THREE.Box3();
    for (const i of idx) box.union(boxes[i]);
    const shape: SeatRunShape = { ...run.shape, box };
    return { index: k, parts: idx.map((i) => parts[i]), shape, measure: measureSeat(env, shape, run.hint, run.owner, true) };
  });
  const held = units.filter((u) => u.measure.ok).length;
  return held > 0 && held < units.length ? units : null;
}

/**
 * Visible retention for a hand-drawn course the search moved (a fitting brings its clamps, a strip its rails and
 * feet): two painted steel straps over the links at a quarter and three quarters of its length, each dropping to the
 * host at both sides.
 */
function addRetention(a: AuthoredSeatArgs, run: AuthoredRun, pose: SeatPose): void {
  const bucket = run.frame === 'hull' ? 'hullDetail' : 'turretDetail';
  const list = a.buckets[bucket];
  if (!list || !run.parts?.length) return;
  const tag = run.parts[0].part.userData.spareTrackRun;
  const b = run.shape.box, n = run.shape.axis;
  const others = [0, 1, 2].filter((k) => k !== n);
  const ext = (k: number): number => b.max.getComponent(k) - b.min.getComponent(k);
  const [u, w] = ext(others[0]) >= ext(others[1]) ? [others[0], others[1]] : [others[1], others[0]];
  const m = new THREE.Matrix4().compose(pose.pos, pose.quat, UNIT);
  const strap = (size: number[], at: number[]): void => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]).toNonIndexed();
    g.translate(at[0], at[1], at[2]);
    g.applyMatrix4(m);
    if (tag) g.userData.spareTrackRun = tag;
    list.push(g);
  };
  const top = b.max.getComponent(n), base = b.min.getComponent(n), lo = b.min.getComponent(w), hi = b.max.getComponent(w);
  for (const f of [0.25, 0.75]) {
    const cu = b.min.getComponent(u) + ext(u) * f;
    const over = [0, 0, 0], overAt = [0, 0, 0];
    over[u] = 0.03; over[w] = hi - lo + 0.03; over[n] = 0.008;
    overAt[u] = cu; overAt[w] = (lo + hi) / 2; overAt[n] = top + 0.004;
    strap(over, overAt);
    for (const side of [lo - 0.011, hi + 0.011]) {
      const leg = [0, 0, 0], legAt = [0, 0, 0];
      leg[u] = 0.03; leg[w] = 0.008; leg[n] = top - base + 0.008;
      legAt[u] = cu; legAt[w] = side; legAt[n] = (top + base) / 2 + 0.004;
      strap(leg, legAt);
    }
  }
}

/**
 * The rack a run stands on (rackSeat): four square posts from its underside to their welded feet on the plate, a foot
 * pad under each, and a cross bar between each end's pair, in the frame's painted steel. A fitting's rack joins the
 * fitting (its own detail paint, so the receipt reads one bundle); a hand-drawn course's goes in the frame's detail
 * bucket under the course's tag, with its straps.
 */
function addRack(a: AuthoredSeatArgs, run: AuthoredRun, rack: RackSeat): void {
  const pieces: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const post = (from: THREE.Vector3, to: THREE.Vector3, w: number, d: number): void => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.004) return;
    const g = new THREE.BoxGeometry(w, len, d).toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().compose(from.clone().addScaledVector(dir, 0.5),
      new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()), UNIT));
    pieces.push(g);
  };
  const n = rack.posts[0].top.clone().sub(rack.posts[0].foot).normalize();
  for (const { top, foot } of rack.posts) {
    post(foot.clone().addScaledVector(n, -0.01), top, 0.035, 0.035);                 // post, welded 1 cm into the plate
    post(foot.clone().addScaledVector(n, -0.004), foot.clone().addScaledVector(n, 0.006), 0.075, 0.075); // foot pad
  }
  post(rack.posts[0].top, rack.posts[1].top, 0.03, 0.03);                            // the end cross bars
  post(rack.posts[2].top, rack.posts[3].top, 0.03, 0.03);
  if (run.group) {
    const frameG = run.frame === 'hull' ? a.hullG : a.turretG;
    let material: THREE.Material | null = null;
    run.group.traverse((o) => { const m = o as THREE.Mesh; if (!material && m.isMesh && /_detail$/.test(m.name)) material = m.material as THREE.Material; });
    if (!material) return;
    const geometry = mergeAll(pieces);
    // frame coordinates into the fitting's own
    geometry.applyMatrix4(relativeMatrix(frameG, run.group).invert());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${run.group.name}_rack`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    run.group.add(mesh);
    run.group.userData.rackMounted = true;
    return;
  }
  const bucket = run.frame === 'hull' ? 'hullDetail' : 'turretDetail';
  const tag = run.parts?.[0]?.part.userData.spareTrackRun as (SpareTrackRunTag & { racked?: boolean }) | undefined;
  if (tag) tag.racked = true;      // the receipt reads a racked course's standoff as its rack's
  for (const g of pieces) {
    if (tag) g.userData.spareTrackRun = tag;
    g.userData.spareTrackRack = true;
    (a.buckets[bucket] ??= []).push(g);
  }
  addRetention(a, run, rack.pose);
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
  // the receipt reads a moved course's mount axis from where it now stands, not the rotation it was authored in
  const tag = run.parts?.[0]?.part.userData.spareTrackRun as (SpareTrackRunTag & { placedQuat?: number[] }) | undefined;
  if (tag) tag.placedQuat = pose.quat.toArray();
}

function removePart(a: AuthoredSeatArgs, { bucket, part }: { bucket: string; part: THREE.BufferGeometry }): void {
  const list = a.buckets[bucket];
  const at = list ? list.indexOf(part) : -1;
  if (at >= 0) list.splice(at, 1);
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

