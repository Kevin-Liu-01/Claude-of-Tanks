/**
 * wreckTurretDriver.ts — the drawn turret of a wreck follows its rigid body (physics lane, 2026-10-10).
 *
 * The visual's turret group stays a child of the hull's root (the crumple's turret frame, decals and the killcam's
 * ghost all read it there); every frame it is placed where the body lies, in world space, whatever the hull does:
 *
 *  - in a battle the simulation owns the body (sim/wreckTurrets.ts): the solo presentation hands the visual the pose
 *    interpolated between two steps, a network peer the pose its host sent (the WRECK_BODY row group);
 *  - a composer with no simulation (the Studio, the gallery's damage lab, a staged shot, the killcam's restaged
 *    victim, a peer of an older host) runs the same body here: the same engine, the same profile and launch law, on the
 *    visual's own ground sampler with its own hull as a box, stepped on the fx clock as the playback needs it (a
 *    stepped or frozen capture holds it; a composer asking for a late age steps it to rest at once);
 *  - a static hulk's bake (geometry-only visuals) keeps the factory's settled table pose: its collision is in the
 *    shards (the coordinator's ruling).
 *
 * While the turret flies it drags the pop trail along its real path, and each hard landing reports itself (dust and
 * the landing's sound through the fx bridge). The gun eases from its last lay to the wreck's droop.
 */
import * as THREE from 'three';
import { createRigidWorld, type RigidWorld } from '../sim/rigidBody.ts';
import {
  WRECK_GUN_DROOP_RAD, turretLaunchVelocity, wreckTurretProfile, type WreckTurretProfile, type WreckTurretSpec,
} from '../sim/wreckTurrets.ts';

/** The local body's track: poses at 60 Hz until it sleeps (or this many steps, 9 s). */
const LOCAL_MAX_STEPS = 540;
const LOCAL_DT = 1 / 60;
/** Trail: one puff per this much fx time while the turret flies, for the first seconds. */
const TRAIL_STEP_S = 0.055;
const TRAIL_SECONDS = 2.8;
/** A landing: falling faster than this, then stopped or thrown back (m/s). */
const LANDING_MIN_MPS = 2.2;
const LANDING_COOLDOWN_S = 0.22;

export interface WreckTurretDriverOptions {
  spec: WreckTurretSpec;
  root: THREE.Object3D;
  turret: THREE.Object3D;
  gun: THREE.Object3D;
  /** The visual's ground sampler now (null: a flat floor at the hull's feet). */
  ground(): ((x: number, z: number) => number) | null;
  /** The visual's own stream (a local launch's draws). */
  random(): number;
  trail(x: number, y: number, z: number, heat: number, birthOffset: number): void;
  landing(x: number, y: number, z: number, speedMps: number): void;
}

export interface WreckTurretDriver {
  /**
   * The kill: the hull's root and the turret's seat as they stand now. `explicitAge` (a composer's frozen age) runs
   * the local body to that age at once; without it the driver waits a frame for an authoritative pose.
   */
  begin(pop: boolean, seat: THREE.Vector3, explicitAge: number | null): void;
  /** An authoritative turret frame pose for this frame ([x, y, z, qx, qy, qz, qw], world), or null. */
  setExternal(pose: ArrayLike<number> | null): void;
  /** An authority will send this turret's pose (a body-carrying host): hold the seat until it does, never simulate. */
  awaitExternal(): void;
  /** Place the turret for wreck age `ageS` (fx clock), `adv` seconds after the last call. Returns true while it flies. */
  update(ageS: number, adv: number): boolean;
  /** The turret's world position (frame origin) as last placed, into `out`; false before a placement. */
  worldPosition(out: THREE.Vector3): boolean;
  reset(): void;
  /** Placing a kill's turret now. */
  readonly active: boolean;
  /** This vehicle has a turret body (a casemate has none: the factory's own pose stands). */
  readonly drives: boolean;
}

export function createWreckTurretDriver(o: WreckTurretDriverOptions): WreckTurretDriver {
  const profile: WreckTurretProfile | null = (() => {
    try { return wreckTurretProfile(o.spec, 1); } catch { return null; }
  })();
  let active = false;
  let pop = false;
  // the turret frame at the kill: world pose and scale, and the offset of the drawn group's seat within it
  const deathRoot = new THREE.Matrix4();
  const deathRootScale = new THREE.Vector3(1, 1, 1);
  const seatOffset = new THREE.Vector3();
  const seatQuat = new THREE.Quaternion();
  /** The drawn turret group's own scale at the kill (a fitted rig: the T-90M's is 0.95 × 0.65 × 0.913), kept in flight. */
  const turretScale = new THREE.Vector3(1, 1, 1);
  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  let scale = 1;
  let gunStart = 0;
  let gunAge = 0;
  // the authoritative pose of this frame
  const external = new Float64Array(7);
  let externalFresh = false;
  let externalSeen = false;
  // the local body
  let world: RigidWorld | null = null;
  let localSlot = -1;
  let localSteps = 0;
  let localDone = false;
  let track: Float32Array | null = null;
  let trackLength = 0;
  /** The wreck age the local track's first sample stands at (0 for a launch, later for a continuation). */
  let localStartAge = 0;
  // the last two authoritative poses and their ages: a continuation starts from the newest with their velocity
  const extLast = new Float64Array(7), extPrev = new Float64Array(7);
  let extLastAge = -1, extPrevAge = -1;
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const framePose = new Float64Array(7);
  // placement scratch
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _local = new THREE.Matrix4(), _off = new THREE.Matrix4();
  const _rootWorld = new THREE.Matrix4();
  const placed = new THREE.Vector3();
  let hasPlaced = false;
  // trail and landing state
  let trailAcc = 0;
  const lastTrail = new THREE.Vector3();
  let prevY = NaN, prevVy = 0, landingCooldown = 0;
  const lastPos = new THREE.Vector3();
  let lastAge = -1;
  const hv = new Float64Array(6);

  function rootWorld(out: THREE.Matrix4): THREE.Matrix4 {
    o.root.updateMatrix();
    const parent = o.root.parent;
    if (parent) { parent.updateWorldMatrix(true, false); out.multiplyMatrices(parent.matrixWorld, o.root.matrix); }
    else out.copy(o.root.matrix);
    return out;
  }

  /**
   * The local body. A launch starts at the turret's seat at the kill with the battle's launch law drawn from the
   * visual's own stream; a continuation (the authority stopped speaking mid-flight: a killcam froze the simulation)
   * starts from the newest authoritative pose with the velocity of the last two, at that pose's age.
   */
  function startLocal(continuation: boolean, ageS: number): void {
    if (world || !profile?.shape) return;
    world = createRigidWorld({ capacity: 1, kinematicCapacity: 1, spherePool: 128, velocityIterations: 8, positionIterations: 3 });
    const sampler = o.ground();
    const hullFrame = continuation ? rootWorld(_rootWorld) : deathRoot;
    hullFrame.decompose(_p, _q, _s);
    const floorY = _p.y;
    world.bindEnvironment({ groundAt: sampler ? (x, z) => sampler(x, z) : () => floorY });
    // the hull's own box (static: in a composition or a frozen replay the wreck's hull does not move)
    const hc = profile.hullCenter, hh = profile.hullHalf;
    const c = new THREE.Vector3(hc[0], hc[1], hc[2]).applyMatrix4(hullFrame);
    world.setKinematicCount(1);
    world.setKinematic(0, 1, c.x, c.y, c.z, _q.x, _q.y, _q.z, _q.w, hh[0] * scale, hh[1] * scale, hh[2] * scale, 0, 0, 0, 0, 0, 0);
    if (continuation) {
      // velocity from the last two authoritative poses (linear, and the rotation between them)
      const dt = extLastAge - extPrevAge;
      const ok = extPrevAge >= 0 && dt > 1e-4;
      hv[0] = ok ? (extLast[0] - extPrev[0]) / dt : 0;
      hv[1] = ok ? (extLast[1] - extPrev[1]) / dt : 0;
      hv[2] = ok ? (extLast[2] - extPrev[2]) / dt : 0;
      hv[3] = hv[4] = hv[5] = 0;
      if (ok) {
        _qa.set(extPrev[3], extPrev[4], extPrev[5], extPrev[6]);
        _qb.set(extLast[3], extLast[4], extLast[5], extLast[6]);
        // dq = qb · qa⁻¹ as an axis-angle rate
        _qb.multiply(_qa.invert());
        if (_qb.w < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; }
        const s = Math.sqrt(_qb.x * _qb.x + _qb.y * _qb.y + _qb.z * _qb.z);
        if (s > 1e-9) {
          const angle = 2 * Math.atan2(s, _qb.w) / dt;
          hv[3] = (_qb.x / s) * angle; hv[4] = (_qb.y / s) * angle; hv[5] = (_qb.z / s) * angle;
        }
      }
      localSlot = world.spawn(profile.shape, {
        x: extLast[0], y: extLast[1], z: extLast[2], qx: extLast[3], qy: extLast[4], qz: extLast[5], qw: extLast[6],
        vx: hv[0], vy: hv[1], vz: hv[2], wx: hv[3], wy: hv[4], wz: hv[5], owner: 1,
      });
      // the frame pose is the authoring frame: spawn takes it as such
      localStartAge = extLastAge >= 0 ? extLastAge : ageS;
    } else {
      // the launch, from the visual's own stream: the battle's law and profile
      const draws: number[] = [];
      for (let n = 0; n < 40; n++) draws.push(o.random());
      let cursor = 0;
      turretLaunchVelocity(pop ? 'ammorack' : 'shot', (o.spec.weightTons ?? 40) * scale ** 3, () => draws[(cursor++) % draws.length], hv);
      localSlot = world.spawn(profile.shape, {
        x: startPos.x, y: startPos.y, z: startPos.z, qx: startQuat.x, qy: startQuat.y, qz: startQuat.z, qw: startQuat.w,
        vx: hv[0], vy: hv[1], vz: hv[2], wx: hv[3], wy: hv[4], wz: hv[5], owner: 1,
        ignoreOwnerSteps: pop ? 8 : 0,
      });
      localStartAge = 0;
    }
    track ??= new Float32Array((LOCAL_MAX_STEPS + 1) * 7);
    trackLength = 0;
    localSteps = 0;
    localDone = localSlot < 0;
    writeTrack();
  }

  function writeTrack(): void {
    if (!world || localSlot < 0 || !track) return;
    world.framePose(localSlot, framePose);
    const o7 = trackLength * 7;
    for (let k = 0; k < 7; k++) track[o7 + k] = framePose[k];
    trackLength++;
  }

  /** Step the local body until its track covers `ageS`. */
  function advanceLocal(ageS: number): void {
    if (!world || localDone) return;
    const need = Math.min(LOCAL_MAX_STEPS, Math.ceil((ageS - localStartAge) / LOCAL_DT) + 1);
    while (localSteps < need && !localDone) {
      world.step(LOCAL_DT);
      localSteps++;
      writeTrack();
      if (world.asleep[localSlot] || localSteps >= LOCAL_MAX_STEPS) localDone = true;
    }
  }

  /** The local track at `ageS` into framePose (lerp, nlerp). */
  function sampleLocal(ageS: number): boolean {
    if (!track || trackLength === 0) return false;
    const t = Math.max(0, (ageS - localStartAge) / LOCAL_DT);
    const i = Math.min(trackLength - 1, Math.floor(t));
    const j = Math.min(trackLength - 1, i + 1);
    const u = j === i ? 0 : t - i;
    const a = i * 7, b = j * 7;
    for (let k = 0; k < 3; k++) framePose[k] = track[a + k] + (track[b + k] - track[a + k]) * u;
    let qx = track[b + 3], qy = track[b + 4], qz = track[b + 5], qw = track[b + 6];
    if (track[a + 3] * qx + track[a + 4] * qy + track[a + 5] * qz + track[a + 6] * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    qx = track[a + 3] + (qx - track[a + 3]) * u; qy = track[a + 4] + (qy - track[a + 4]) * u;
    qz = track[a + 5] + (qz - track[a + 5]) * u; qw = track[a + 6] + (qw - track[a + 6]) * u;
    const n = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    framePose[3] = qx * n; framePose[4] = qy * n; framePose[5] = qz * n; framePose[6] = qw * n;
    return true;
  }

  /** Put the drawn turret at the frame pose in framePose. */
  function place(): void {
    _p.set(framePose[0], framePose[1], framePose[2]);
    _q.set(framePose[3], framePose[4], framePose[5], framePose[6]);
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    // the drawn group's seat within the frame (a GLB re-seat) and its own fitted scale
    _off.compose(seatOffset, seatQuat, turretScale);
    _m.multiply(_off);
    _inv.copy(rootWorld(_rootWorld)).invert();
    _local.multiplyMatrices(_inv, _m);
    _local.decompose(o.turret.position, o.turret.quaternion, o.turret.scale);
    placed.set(framePose[0], framePose[1], framePose[2]);
    hasPlaced = true;
  }

  const driver: WreckTurretDriver = {
    get active() { return active; },
    drives: !!profile?.shape,
    begin(popped, seat, explicitAge) {
      active = !!profile?.shape;
      pop = popped;
      externalFresh = false;
      externalSeen = false;
      extLastAge = -1; extPrevAge = -1;
      world = null; localSlot = -1; localDone = false; trackLength = 0; localSteps = 0; localStartAge = 0;
      trailAcc = 0; prevY = NaN; prevVy = 0; landingCooldown = 0; lastAge = -1; hasPlaced = false;
      gunStart = o.gun.rotation.x; gunAge = 0;
      if (!active || !profile) return;
      rootWorld(deathRoot);
      deathRoot.decompose(_p, _q, deathRootScale);
      scale = deathRootScale.x || 1;
      // the turret frame at the kill: the hull's root · T(pivot) · Ry(the turret's yaw)
      const yaw0 = o.turret.rotation.y;
      turretScale.copy(o.turret.scale);
      const pivot = new THREE.Vector3(profile.pivot[0], profile.pivot[1], profile.pivot[2]);
      startPos.copy(pivot).applyMatrix4(deathRoot);
      startQuat.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw0));
      // the drawn group's seat relative to that frame (zero for the procedural turret)
      seatOffset.copy(seat).sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw0);
      seatQuat.identity();
      lastTrail.copy(startPos);
      lastPos.copy(startPos);
      if (explicitAge !== null && explicitAge > 0) {
        // a composer's later age (a staged still mid-flight): the local body now, to that age. At age 0 the turret
        // stands on its seat: the first update decides (an authority's pose, a killcam's track, or our own body)
        startLocal(false, explicitAge);
        advanceLocal(explicitAge);
        if (sampleLocal(explicitAge)) place();
        o.gun.rotation.x = WRECK_GUN_DROOP_RAD;
        lastAge = explicitAge;
      }
    },
    setExternal(pose) {
      if (!pose) { externalFresh = false; return; }
      for (let k = 0; k < 7; k++) external[k] = pose[k];
      externalFresh = true;
      externalSeen = true;
    },
    awaitExternal() { externalSeen = true; },
    update(ageS, adv) {
      if (!active) return false;
      let have = false;
      if (externalFresh) {
        for (let k = 0; k < 7; k++) framePose[k] = external[k];
        externalFresh = false;
        have = true;
        // the authority speaks again: any continuation of ours gives way to it
        if (world) { world = null; localSlot = -1; trackLength = 0; }
        if (ageS > extLastAge + 1e-6) {
          for (let k = 0; k < 7; k++) extPrev[k] = extLast[k];
          extPrevAge = extLastAge;
          for (let k = 0; k < 7; k++) extLast[k] = external[k];
          extLastAge = ageS;
        }
      } else if (!externalSeen) {
        // no authority speaks for this turret: the local body (lazy: the first frame without one)
        startLocal(false, ageS);
        advanceLocal(ageS);
        have = sampleLocal(ageS);
      } else if (extLastAge >= 0 && ageS > extLastAge + 1e-6 && adv > 0) {
        // the authority went quiet while our clock runs (a killcam froze the simulation): carry its motion on
        startLocal(true, ageS);
        advanceLocal(ageS);
        have = sampleLocal(ageS);
      }
      if (!have) return false;
      place();
      // the gun eases to the wreck's droop
      gunAge += Math.max(0, adv);
      const k = Math.min(1, gunAge / 0.35);
      o.gun.rotation.x = gunStart + (WRECK_GUN_DROOP_RAD - gunStart) * (k * (2 - k));
      // flight: the trail along the real path, the landings
      const step = ageS - lastAge;
      let flying = false;
      if (lastAge >= 0 && step > 1e-6) {
        const vy = (framePose[1] - prevY) / step;
        const speed = placed.distanceTo(lastPos) / step;
        flying = speed > 1.0;
        landingCooldown = Math.max(0, landingCooldown - step);
        if (Number.isFinite(prevY) && prevVy < -LANDING_MIN_MPS && vy > prevVy * 0.35 && landingCooldown === 0) {
          const sampler = o.ground();
          const y = sampler ? sampler(placed.x, placed.z) : placed.y - 0.4 * scale;
          o.landing(placed.x, y, placed.z, -prevVy);
          landingCooldown = LANDING_COOLDOWN_S;
        }
        prevVy = vy;
        if (pop && ageS < TRAIL_SECONDS) {
          trailAcc += step;
          while (trailAcc >= TRAIL_STEP_S) {
            trailAcc -= TRAIL_STEP_S;
            if (speed < 0.6 || lastTrail.distanceToSquared(placed) < 0.04) continue;
            o.trail(placed.x, placed.y + 0.25 * scale, placed.z, Math.max(0, 1 - ageS * 0.75), -trailAcc);
            lastTrail.copy(placed);
          }
        }
      }
      prevY = framePose[1];
      lastPos.copy(placed);
      if (step > 1e-6 || lastAge < 0) lastAge = ageS;
      return flying;
    },
    worldPosition(out) {
      if (!hasPlaced) return false;
      out.copy(placed);
      return true;
    },
    reset() {
      active = false;
      externalFresh = false;
      externalSeen = false;
      world = null;
      localSlot = -1;
      trackLength = 0;
      hasPlaced = false;
    },
  };
  return driver;
}
