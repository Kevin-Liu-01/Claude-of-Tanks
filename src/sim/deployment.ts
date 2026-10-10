/**
 * Symmetric deployments (modes lane, 2026-10-08). Both sides start in the same formation: each bravo slot is the exact
 * rotation of its alpha slot by 180 degrees about the pivot, the midpoint between the two side anchors (alpha's anchor
 * is the authored player pad, bravo's the centroid of the authored enemy pads: matchPlacementAnchors). Formation shape,
 * spread, facing and distance to the pivot therefore match slot for slot.
 *
 * Before this, the authority seated alpha as a 24 m block at the player pad and bravo on the authored enemy pads (an arc
 * 168-669 m wide on 25 of 33 maps, its nearest tank 16-85 m closer to the middle), and the solo sim seated alpha on a
 * 104 x 30 m wedge: every fairness verdict measured through that lean (north 58-72 % on Verdant, Redrock and Sirocco).
 *
 * The rule, per map, from what is authored:
 * - an ARC (enemy pads more than ARC_SPREAD_M apart, 25 maps): both sides deploy as the authored arc, which spreads
 *   the team; bravo keeps the pads and alpha takes their rotation;
 * - a BLOCK (compact pads, 8 maps): both sides deploy as a 4 + 3 block at the player pad, bravo its rotation. The block
 *   spaces its slots DEPLOYMENT_SLOT_SPACING_M apart so the placement seats every vehicle where the slot stands.
 * Slots past the authored base (the 14 v 14 preset, custom sides) stand one spacing behind a base slot, round-robin
 * over the base in slot order, then another spacing behind.
 *
 * Slot order: most central first (smallest lateral offset in the side's own frame), then the forward one, then the
 * right one; the first slot is the human's in a solo battle. Both sides share the order, so slot k of alpha and slot k
 * of bravo are rotations of each other.
 *
 * Validity is the caller's predicate (sim/matchPlacement.ts owns ground, collision and reservations). A slot pair that
 * fails moves together: alpha by the smallest displacement d on the search rings and bravo by -d, the rotation of d,
 * so the pair stays an exact rotation. Only when no common displacement exists within the rings does each side search
 * alone; the result records it (`symmetric: false`) and the deployment receipt fails on it for the preset sides.
 * Pure and deterministic: no RNG, no clock, Node-runnable.
 */

export type DeploymentTeam = 'alpha' | 'bravo';
export interface DeploymentPoint { readonly x: number; readonly z: number }
export interface DeploymentSlot extends DeploymentPoint { readonly yaw: number }
interface AuthoredPad extends DeploymentPoint { readonly yaw?: number }
export interface DeploymentSpawns {
  readonly player: AuthoredPad;
  readonly enemies: readonly AuthoredPad[];
}

/** Every vehicle's placement radius fits this disc (the fleet's largest, Challenger 3 X, needs 5.69 m: receipt). */
export const DEPLOYMENT_SLOT_RADIUS_M = 6;
/** Two slot radii and the placement's 3 m reservation gap: any two vehicles seat on their slots without a move. */
export const DEPLOYMENT_SLOT_SPACING_M = DEPLOYMENT_SLOT_RADIUS_M * 2 + 3;
/** Enemy pads spread wider than this are an authored arc; tighter pads are a compact block. */
const ARC_SPREAD_M = 60;
/** The world keeps its spawn clearings round this many slots a side (the 14 v 14 preset). */
export const DEPLOYMENT_CLEARED_SLOTS = 14;
/** The joint search's rings (metres) and their arc step. */
const MOVE_RINGS_M = Object.freeze([0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160]);
const RING_STEP_M = 4;
/** A moved slot stands on a 2 m lattice (alpha's: the world's; bravo's: its rotation), so the searches share reads. */
export const DEPLOYMENT_LATTICE_M = 2;

/** The deployment's frame: anchors, pivot, the formation kind and bravo's ordered base slots. */
export interface DeploymentFrame {
  readonly kind: 'arc' | 'block';
  readonly pivot: DeploymentPoint;
  readonly anchors: { readonly alpha: DeploymentPoint; readonly bravo: DeploymentPoint };
  /** Bravo's forward (toward alpha's anchor), unit. */
  readonly forward: DeploymentPoint;
  /** Bravo's base slots in slot order (alpha's are their rotations). */
  readonly base: readonly DeploymentSlot[];
}

/** The 180-degree rotation about the pivot: alpha's slot from bravo's and back. */
export function rotateAboutPivot<T extends DeploymentPoint & { yaw?: number }>(pivot: DeploymentPoint, point: T): DeploymentSlot {
  return { x: 2 * pivot.x - point.x, z: 2 * pivot.z - point.z, yaw: wrapYaw((point.yaw ?? 0) + Math.PI) };
}

function wrapYaw(yaw: number): number {
  const turn = Math.PI * 2;
  let out = yaw % turn;
  if (out > Math.PI) out -= turn;
  if (out <= -Math.PI) out += turn;
  return out;
}

/** The pure frame of a map's authored spawns (no ground, no world). */
export function deploymentFrame(spawns: DeploymentSpawns): DeploymentFrame {
  const alpha = { x: spawns.player.x, z: spawns.player.z };
  const pads = spawns.enemies;
  if (!pads.length) throw new TypeError('a deployment needs the authored enemy pads');
  let bx = 0, bz = 0;
  for (const pad of pads) { bx += pad.x; bz += pad.z; }
  const bravo = { x: bx / pads.length, z: bz / pads.length };
  const pivot = { x: (alpha.x + bravo.x) * 0.5, z: (alpha.z + bravo.z) * 0.5 };
  const length = Math.hypot(alpha.x - bravo.x, alpha.z - bravo.z);
  if (!(length > 0)) throw new TypeError('the deployment anchors must not coincide');
  const forward = { x: (alpha.x - bravo.x) / length, z: (alpha.z - bravo.z) / length };
  let spread = 0;
  for (const a of pads) for (const b of pads) spread = Math.max(spread, Math.hypot(a.x - b.x, a.z - b.z));
  const kind = spread > ARC_SPREAD_M ? 'arc' : 'block';
  const facingAlpha = (point: DeploymentPoint) => Math.atan2(alpha.x - point.x, alpha.z - point.z);
  let base: DeploymentSlot[];
  if (kind === 'arc') {
    base = pads.map((pad) => ({ x: pad.x, z: pad.z, yaw: pad.yaw ?? facingAlpha(pad) }));
  } else {
    // the 4 + 3 block, built at alpha's pad facing bravo's anchor (vehicle right = (cos yaw, -sin yaw)), then rotated
    const yaw = Math.atan2(-forward.x, -forward.z);
    const sin = Math.sin(yaw), cos = Math.cos(yaw), s = DEPLOYMENT_SLOT_SPACING_M;
    const rows: (readonly [number, number])[] = [
      [-1.5 * s, 0], [-0.5 * s, 0], [0.5 * s, 0], [1.5 * s, 0],
      [-s, 0.9 * s], [0, 0.9 * s], [s, 0.9 * s],
    ];
    base = rows.map(([right, back]) => rotateAboutPivot(pivot, {
      x: alpha.x + right * cos - back * sin, z: alpha.z - right * sin - back * cos, yaw,
    }));
  }
  // slot order in bravo's frame: most central, then forward, then right (rounded so float noise never breaks a tie)
  const key = (slot: DeploymentSlot) => {
    const dx = slot.x - bravo.x, dz = slot.z - bravo.z;
    return { lateral: Math.round((dx * forward.z - dz * forward.x) * 1e6) / 1e6, ahead: Math.round((dx * forward.x + dz * forward.z) * 1e6) / 1e6 };
  };
  base.sort((p, q) => {
    const a = key(p), b = key(q);
    return Math.abs(a.lateral) - Math.abs(b.lateral) || b.ahead - a.ahead || a.lateral - b.lateral;
  });
  return Object.freeze({ kind, pivot: Object.freeze(pivot), anchors: Object.freeze({ alpha, bravo }),
    forward: Object.freeze(forward), base: Object.freeze(base.map((slot) => Object.freeze(slot))) });
}

/** Bravo's nominal slot k: a base slot, or one spacing behind a base slot per round past the base. */
export function nominalBravoSlot(frame: DeploymentFrame, k: number): DeploymentSlot {
  const n = frame.base.length, index = Math.max(0, Math.floor(k));
  if (index < n) return frame.base[index];
  const from = frame.base[(index - n) % n], rank = Math.floor((index - n) / n) + 1;
  const back = DEPLOYMENT_SLOT_SPACING_M * rank;
  return { x: from.x - frame.forward.x * back, z: from.z - frame.forward.z * back, yaw: from.yaw };
}

/** Is `point` a valid slot for `team`, given the slots that side already holds (in slot order)? */
export type DeploymentCheck = (team: DeploymentTeam, point: DeploymentPoint, held: readonly DeploymentPoint[]) => boolean;

interface ResolvedSlotPair {
  readonly alpha: DeploymentSlot;
  readonly bravo: DeploymentSlot;
  /** The joint displacement's length (alpha's; bravo's is its rotation), or each side's own when not symmetric. */
  readonly moveM: number;
  readonly symmetric: boolean;
}

/**
 * The search rings round `from`: the point itself, then each ring's candidates snapped onto the lattice (a candidate
 * snapped onto one already tried is skipped). `check` receives the displacement from `from`.
 */
function ringSearch(from: DeploymentPoint, check: (dx: number, dz: number) => boolean): { dx: number; dz: number; radius: number } | null {
  if (check(0, 0)) return { dx: 0, dz: 0, radius: 0 };
  const tried = new Set<number>();
  const step = DEPLOYMENT_LATTICE_M;
  for (const radius of MOVE_RINGS_M) {
    if (radius === 0) continue;
    const steps = Math.max(16, Math.ceil(radius * Math.PI * 2 / RING_STEP_M));
    for (let k = 0; k < steps; k++) {
      const angle = k / steps * Math.PI * 2;
      const gx = Math.round((from.x + Math.sin(angle) * radius) / step), gz = Math.round((from.z + Math.cos(angle) * radius) / step);
      const key = gx * 65536 + gz;
      if (tried.has(key)) continue;
      tried.add(key);
      const dx = gx * step - from.x, dz = gz * step - from.z;
      if (check(dx, dz)) return { dx, dz, radius: Math.hypot(dx, dz) };
    }
  }
  return null;
}

/**
 * Move one slot pair to valid ground: the smallest joint displacement (alpha +d, bravo -d) both sides accept, else
 * each side alone (asymmetric, recorded), else the nominal point (the placement's own search then seats the vehicle).
 */
export function resolveSlotPair(alpha: DeploymentSlot, bravo: DeploymentSlot, check: DeploymentCheck,
  held: { readonly alpha: readonly DeploymentPoint[]; readonly bravo: readonly DeploymentPoint[] }): ResolvedSlotPair {
  const joint = ringSearch(alpha, (dx, dz) => check('alpha', { x: alpha.x + dx, z: alpha.z + dz }, held.alpha)
    && check('bravo', { x: bravo.x - dx, z: bravo.z - dz }, held.bravo));
  if (joint) {
    return { alpha: { x: alpha.x + joint.dx, z: alpha.z + joint.dz, yaw: alpha.yaw },
      bravo: { x: bravo.x - joint.dx, z: bravo.z - joint.dz, yaw: bravo.yaw }, moveM: joint.radius, symmetric: true };
  }
  const own = (team: DeploymentTeam, slot: DeploymentSlot) => {
    const found = ringSearch(slot, (dx, dz) => check(team, { x: slot.x + dx, z: slot.z + dz }, held[team]));
    return found ? { slot: { x: slot.x + found.dx, z: slot.z + found.dz, yaw: slot.yaw }, radius: found.radius } : { slot, radius: 0 };
  };
  const a = own('alpha', alpha), b = own('bravo', bravo);
  return { alpha: a.slot, bravo: b.slot, moveM: Math.max(a.radius, b.radius), symmetric: false };
}

/** One side's resolved slots, extended lazily in slot order (slot k depends only on the slots before it). */
export interface Deployment {
  readonly frame: DeploymentFrame;
  /** Slot k of a side (k from 0), resolving every slot up to it on first use. */
  slot(team: DeploymentTeam, k: number): DeploymentSlot;
  /** The resolved pair k with its move and symmetry, for receipts. */
  pair(k: number): ResolvedSlotPair;
  /** The slots resolved so far (receipts and the world's clearings read the first `count`). */
  slots(team: DeploymentTeam, count: number): readonly DeploymentSlot[];
}

/**
 * A deployment over `frame`, each pair resolved against `check` from its nominal slot (or from `start(k)`, a previous
 * stage's resolved pair, when given): the terrain stage starts from the nominal slots, the match stage from the
 * terrain stage's.
 */
export function createDeployment(frame: DeploymentFrame, check: DeploymentCheck,
  start: ((k: number) => { alpha: DeploymentSlot; bravo: DeploymentSlot }) | null = null): Deployment {
  const pairs: ResolvedSlotPair[] = [];
  const held: { alpha: DeploymentPoint[]; bravo: DeploymentPoint[] } = { alpha: [], bravo: [] };
  const extend = (k: number): ResolvedSlotPair => {
    const index = Math.max(0, Math.floor(k));
    while (pairs.length <= index) {
      const n = pairs.length;
      const from = start ? start(n) : (() => { const bravo = nominalBravoSlot(frame, n); return { alpha: rotateAboutPivot(frame.pivot, bravo), bravo }; })();
      const pair = resolveSlotPair(from.alpha, from.bravo, check, held);
      pairs.push(pair);
      held.alpha.push(pair.alpha);
      held.bravo.push(pair.bravo);
    }
    return pairs[index];
  };
  return {
    frame,
    slot: (team, k) => extend(k)[team],
    pair: (k) => extend(k),
    slots(team, count) {
      if (count > 0) extend(count - 1);
      return pairs.slice(0, Math.max(0, count)).map((pair) => pair[team]);
    },
  };
}
