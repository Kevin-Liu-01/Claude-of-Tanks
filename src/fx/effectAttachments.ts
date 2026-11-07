import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Attachment contracts for combat effects.
 *
 * Particles are deliberately world-space after birth: smoke should trail a
 * moving tank instead of behaving like a rigid model accessory. Only a
 * continuous emitter's source follows its owner, and a muzzle's bright
 * sub-200 ms parts leave with the shooter's own velocity (gas thrown from a
 * moving bore carries the bore's motion; the pools' drag then slows it
 * against still air). The policy table makes those distinctions explicit so
 * new effects cannot silently inherit the wrong space.
 */
export const EFFECT_ATTACHMENT_POLICY = Object.freeze({
  burningColumn: 'subject-local-emitter',
  impactDecal: 'subject-local-mesh',
  trackDust: 'caller-refreshed-emitter',
  engineExhaust: 'caller-refreshed-emitter',
  guidedMissileBody: 'live-shell-position',
  guidedMissileTrail: 'world-space-history',
  turretPopTrail: 'caller-refreshed-emitter',
  // (fleet review 2026-11-03: s272/s86/s271) born world-fixed, a ~100 ms core
  // lagged 0.5-1.5 m back along the barrel of a tank firing at 5-15 m/s. The
  // core, petals, axial and brake jets, combustion tongues, bore sparks, ring
  // and light ride the muzzle; its propellant mass, smoke, wisps and ground
  // dust stay world-space and trail it.
  muzzleFlash: 'shooter-velocity-burst',
  muzzleRing: 'shooter-velocity-burst',
  muzzleLight: 'shooter-velocity-burst',
  muzzleSmoke: 'world-space-burst',
  impactParticles: 'world-space-burst',
  destructionParticles: 'world-space-burst',
  // wreck r1 (owner 2026-09-17): the wreck column rides the corpse's visual root and retires with it
  destroyedTankColumn: 'wreck-local-emitter',
  terrainScorch: 'world-fixed-decal',
  trackPrint: 'world-fixed-decal',
  propBreak: 'world-space-burst',
  propCrush: 'world-space-burst',
  loosePropHit: 'world-space-burst',
} as const);

interface MutablePosition {
  x: number;
  y: number;
  z: number;
}

interface MutableVector3 extends MutablePosition {
  set(x: number, y: number, z: number): MutableVector3;
}

interface VisualAnchorRoot {
  worldToLocal(position: MutableVector3): MutableVector3;
  localToWorld(position: MutableVector3): MutableVector3;
  updateWorldMatrix?(updateParents: boolean, updateChildren: boolean): void;
}

interface EffectEmitterAnchor {
  pos: number[];
  localPos?: number[];
  anchorSpace?: object;
  anchorMode?: 'visual-root' | 'state-yaw';
}

interface EffectSubjectAnchor {
  visual?: { root?: RuntimeValue };
  state?: {
    pos?: Partial<MutablePosition>;
    yaw?: number;
  };
}

function isVisualAnchorRoot(value: RuntimeValue): value is VisualAnchorRoot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<VisualAnchorRoot>;
  return typeof candidate.worldToLocal === 'function' &&
    typeof candidate.localToWorld === 'function';
}

function isFinitePosition(value: Partial<MutablePosition> | undefined): value is MutablePosition {
  return !!value && Number.isFinite(value.x) &&
    Number.isFinite(value.y) && Number.isFinite(value.z);
}

function ensureLocalPos(emitter: EffectEmitterAnchor): number[] {
  return emitter.localPos || (emitter.localPos = [0, 0, 0]);
}

/**
 * Move a continuous emitter's source with its owning subject without moving
 * particles that were already emitted.
 *
 * A rendered TankVisual root is preferred so the source follows interpolated
 * presentation pose, suspension pitch and yaw exactly. Headless/lazy subjects
 * fall back to the authoritative position + yaw. The only allocation is the
 * emitter's three-number local anchor on its first successful resolution;
 * subsequent frame updates reuse caller-provided scratch.
 *
 * @param {{pos:number[], localPos?:number[], anchorSpace?:object,
 *   anchorMode?:string}} emitter
 * @param {{visual?:{root?:object}, state?:{pos?:object,yaw?:number}}} subject
 * @param {{set:Function,x:number,y:number,z:number}} scratch THREE.Vector3-like
 * @returns {boolean} true when the source was resolved and refreshed
 */
export function syncSubjectEmitterAnchor(
  emitter: EffectEmitterAnchor | null | undefined,
  subject: EffectSubjectAnchor | null | undefined,
  scratch: MutableVector3 | null | undefined,
): boolean {
  if (!emitter || !emitter.pos || !subject || !scratch) return false;

  const root = subject.visual && subject.visual.root;
  if (isVisualAnchorRoot(root)) {
    if (typeof root.updateWorldMatrix === 'function') root.updateWorldMatrix(true, false);
    const local = ensureLocalPos(emitter);
    if (emitter.anchorMode !== 'visual-root' || emitter.anchorSpace !== root) {
      scratch.set(emitter.pos[0], emitter.pos[1], emitter.pos[2]);
      root.worldToLocal(scratch);
      local[0] = scratch.x; local[1] = scratch.y; local[2] = scratch.z;
      emitter.anchorMode = 'visual-root';
      emitter.anchorSpace = root;
    }
    scratch.set(local[0], local[1], local[2]);
    root.localToWorld(scratch);
    emitter.pos[0] = scratch.x; emitter.pos[1] = scratch.y; emitter.pos[2] = scratch.z;
    return true;
  }

  const state = subject.state;
  const p = state && state.pos;
  if (!isFinitePosition(p)) {
    return false;
  }
  const stateYaw = state?.yaw;
  const yaw = typeof stateYaw === 'number' && Number.isFinite(stateYaw) ? stateYaw : 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = ensureLocalPos(emitter);
  if (emitter.anchorMode !== 'state-yaw' || emitter.anchorSpace !== subject) {
    const dx = emitter.pos[0] - p.x;
    const dz = emitter.pos[2] - p.z;
    local[0] = c * dx - s * dz;
    local[1] = emitter.pos[1] - p.y;
    local[2] = s * dx + c * dz;
    emitter.anchorMode = 'state-yaw';
    emitter.anchorSpace = subject;
  }
  emitter.pos[0] = p.x + c * local[0] + s * local[2];
  emitter.pos[1] = p.y + local[1];
  emitter.pos[2] = p.z - s * local[0] + c * local[2];
  return true;
}

type EffectAttachmentFamily = keyof typeof EFFECT_ATTACHMENT_POLICY;

/** 1 when the family's burst leaves with its shooter's velocity, 0 when it stays world-space after birth. */
export function shooterVelocityGain(family: EffectAttachmentFamily): number {
  return EFFECT_ATTACHMENT_POLICY[family] === 'shooter-velocity-burst' ? 1 : 0;
}

interface EffectSubjectMotion {
  state?: {
    pos?: Partial<MutablePosition>;
    yaw?: number;
    /** signed hull speed along its yaw (m/s), as sim, network and Studio actors all publish it */
    speed?: number;
    yawRate?: number;
    verticalSpeed?: number;
  } | null;
}

/** No ground vehicle outruns it; a teleporting key's one-tick speed never throws a burst across the map. */
const MAX_CARRIED_MPS = 40;

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * World velocity (m/s) of a point the subject carries (its muzzle tip): the
 * hull's speed along its yaw and its vertical speed, plus the yaw rate
 * swinging the point about the hull origin. Writes `out` (zeroed when the
 * subject is unresolved) and never allocates.
 */
export function subjectPointVelocity(
  subject: EffectSubjectMotion | null | undefined,
  x: number,
  z: number,
  out: number[],
): boolean {
  out[0] = 0; out[1] = 0; out[2] = 0;
  const state = subject && subject.state;
  if (!state || typeof state.yaw !== 'number' || !Number.isFinite(state.yaw)) return false;
  const speed = finiteOr(state.speed, 0);
  let vx = Math.sin(state.yaw) * speed;
  let vz = Math.cos(state.yaw) * speed;
  const vy = finiteOr(state.verticalSpeed, 0);
  const yawRate = finiteOr(state.yawRate, 0);
  const p = state.pos;
  if (yawRate !== 0 && isFinitePosition(p)) {
    // yaw += yawRate * dt turns forward (sin yaw, 0, cos yaw): an offset r swings at yawRate * (r.z, 0, -r.x)
    vx += yawRate * (z - p.z);
    vz -= yawRate * (x - p.x);
  }
  const m = Math.hypot(vx, vy, vz);
  const k = m > MAX_CARRIED_MPS ? MAX_CARRIED_MPS / m : 1;
  out[0] = vx * k; out[1] = vy * k; out[2] = vz * k;
  return true;
}
