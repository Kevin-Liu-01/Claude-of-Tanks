import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Attachment contracts for combat effects.
 *
 * Particles are deliberately world-space after birth: smoke should trail a
 * moving tank instead of behaving like a rigid model accessory. Only a
 * continuous emitter's source follows its owner. The policy table makes that
 * distinction explicit so new long-lived effects cannot silently inherit the
 * wrong space.
 */
export const EFFECT_ATTACHMENT_POLICY = Object.freeze({
  burningColumn: 'subject-local-emitter',
  impactDecal: 'subject-local-mesh',
  trackDust: 'caller-refreshed-emitter',
  engineExhaust: 'caller-refreshed-emitter',
  guidedMissileBody: 'live-shell-position',
  guidedMissileTrail: 'world-space-history',
  turretPopTrail: 'caller-refreshed-emitter',
  muzzleFlash: 'world-space-burst',
  muzzleRing: 'world-space-burst',
  impactParticles: 'world-space-burst',
  destructionParticles: 'world-space-burst',
  destroyedTankColumn: 'world-fixed-wreck-emitter',
  terrainScorch: 'world-fixed-decal',
  trackPrint: 'world-fixed-decal',
  propBreak: 'world-space-burst',
  propCrush: 'world-space-burst',
  loosePropHit: 'world-space-burst',
} as const);

type EffectAttachmentPolicy = typeof EFFECT_ATTACHMENT_POLICY;
export type EffectFamily = keyof EffectAttachmentPolicy;
export type EffectAttachmentMode = EffectAttachmentPolicy[EffectFamily];

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

export interface EffectEmitterAnchor {
  pos: number[];
  localPos?: number[];
  anchorSpace?: object;
  anchorMode?: 'visual-root' | 'state-yaw';
}

export interface EffectSubjectAnchor {
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
