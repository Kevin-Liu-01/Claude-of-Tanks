// utilityNetwork.ts — deterministic, renderer-free utility-pole topology and
// catenary sampling. props.ts owns the one InstancedMesh; this module owns the
// linked state so a fallen pole drags only its adjacent spans to the ground.

const DEFAULT_SEGMENTS = 16;
const CATENARY_K = 1.35;
const COSH_DENOM = Math.cosh(CATENARY_K) - 1;

interface UtilityPoleInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  attachH?: number;
}

interface UtilityPole extends UtilityPoleInput {
  attachH: number;
}

type UtilitySpanInput = readonly [number, number];

/** One conductor's insulator on a pole: along its crossarm (local x, metres; the road's side by sign) and over the
 *  pole's attachment height (props lane A, #21, 2026-10-14: a region's line carries its own conductors). */
export interface UtilityConductor {
  across: number;
  up: number;
}

interface UtilityNetworkOptions {
  segments?: number;
  sideOffset?: number;
  /** the line's conductors (default: two, at -sideOffset and +sideOffset on the attachment height) */
  conductors?: readonly UtilityConductor[];
}

interface PoleFallState {
  axisX: number;
  axisZ: number;
  angle: number;
}

export interface UtilityNetwork {
  readonly poles: UtilityPole[];
  readonly spans: Array<{ a: number; b: number }>;
  readonly segments: number;
  readonly sideOffset: number;
  /** how many conductors each span carries (the wires' pool lays each one's segments) */
  readonly conductors: number;
  readonly instanceCount: number;
  instanceIndex(spanIndex: number, sideIndex: number, segmentIndex: number): number;
  setPoleFall(poleIndex: number, axisX: number, axisZ: number, angle: number): number[];
  resetPole(poleIndex: number): number[];
  reset(): void;
  writeSpanPoints(spanIndex: number, sideIndex: number, out: Float64Array): number;
}

function rotateAttachment(
  pole: UtilityPole,
  state: PoleFallState | null,
  across: number,
  up: number,
  out: Float64Array,
): Float64Array {
  const vx = Math.cos(pole.yaw) * across;
  const vy = pole.attachH + up;
  const vz = -Math.sin(pole.yaw) * across;
  if (!state || state.angle === 0) {
    out[0] = pole.x + vx;
    out[1] = pole.y + vy;
    out[2] = pole.z + vz;
    return out;
  }
  const len = Math.hypot(state.axisX, state.axisZ) || 1;
  const ax = state.axisX / len, az = state.axisZ / len;
  const c = Math.cos(state.angle), s = Math.sin(state.angle);
  const dot = ax * vx + az * vz;
  // Rodrigues rotation around the same world-space hinge used by props.ts.
  const crossX = -az * vy;
  const crossY = az * vx - ax * vz;
  const crossZ = ax * vy;
  out[0] = pole.x + vx * c + crossX * s + ax * dot * (1 - c);
  out[1] = pole.y + vy * c + crossY * s;
  out[2] = pole.z + vz * c + crossZ * s + az * dot * (1 - c);
  return out;
}

/**
 * @param {Array<{x:number,y:number,z:number,yaw:number,attachH?:number}>} poles
 * @param {Array<[number,number]>} spans pole-index pairs
 * @param {{segments?:number,sideOffset?:number}} [opts]
 */
export function createUtilityNetwork(
  poles: readonly UtilityPoleInput[],
  spans: readonly UtilitySpanInput[],
  opts: UtilityNetworkOptions = {},
): UtilityNetwork {
  const segments = opts.segments ?? DEFAULT_SEGMENTS;
  const sideOffset = opts.sideOffset ?? 0.6;
  const conductors: readonly UtilityConductor[] = opts.conductors?.length ? opts.conductors
    : [{ across: -sideOffset, up: 0 }, { across: sideOffset, up: 0 }];
  const n = conductors.length;
  const normalizedPoles: UtilityPole[] = poles.map((pole) => ({
    ...pole,
    attachH: pole.attachH ?? 6.5,
  }));
  const normalizedSpans = spans.map(([a, b]) => ({ a, b }));
  const falls: Array<PoleFallState | null> = new Array(normalizedPoles.length).fill(null);
  const adjacent: number[][] = Array.from({ length: normalizedPoles.length }, () => []);
  for (let i = 0; i < normalizedSpans.length; i++) {
    const span = normalizedSpans[i];
    if (!normalizedPoles[span.a] || !normalizedPoles[span.b]) {
      throw new Error(`utilityNetwork: invalid span ${span.a}->${span.b}`);
    }
    adjacent[span.a].push(i);
    adjacent[span.b].push(i);
  }
  const a = new Float64Array(3), b = new Float64Array(3);

  return {
    poles: normalizedPoles,
    spans: normalizedSpans,
    segments,
    sideOffset,
    conductors: n,
    instanceCount: normalizedSpans.length * n * segments,

    /** Stable instance slot for one conductor segment. */
    instanceIndex(spanIndex: number, sideIndex: number, segmentIndex: number): number {
      return ((spanIndex * n + sideIndex) * segments) + segmentIndex;
    },

    /** Set one pole's live hinge pose; returns its stable adjacent-span list. */
    setPoleFall(poleIndex: number, axisX: number, axisZ: number, angle: number): number[] {
      if (!normalizedPoles[poleIndex]) return [];
      let state = falls[poleIndex];
      if (!state) state = falls[poleIndex] = { axisX: 0, axisZ: 1, angle: 0 };
      state.axisX = axisX;
      state.axisZ = axisZ;
      state.angle = angle;
      return adjacent[poleIndex];
    },

    resetPole(poleIndex: number): number[] {
      if (normalizedPoles[poleIndex]) falls[poleIndex] = null;
      return adjacent[poleIndex] || [];
    },

    reset(): void {
      falls.fill(null);
    },

    /**
     * Write (segments + 1) XYZ points into caller-owned `out`.
     * sideIndex picks the conductor (by default 0/1: the two crossarm insulators).
     */
    writeSpanPoints(spanIndex: number, sideIndex: number, out: Float64Array): number {
      const span = normalizedSpans[spanIndex];
      if (!span || !out || out.length < (segments + 1) * 3) return 0;
      const conductor = conductors[sideIndex] ?? conductors[0];
      const stateA = falls[span.a];
      const stateB = falls[span.b];
      rotateAttachment(normalizedPoles[span.a], stateA, conductor.across, conductor.up, a);
      rotateAttachment(normalizedPoles[span.b], stateB, conductor.across, conductor.up, b);
      const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const fallA = stateA ? Math.abs(Math.sin(stateA.angle)) : 0;
      const fallB = stateB ? Math.abs(Math.sin(stateB.angle)) : 0;
      const droop = 0.45 + horizontal * 0.008 + Math.max(fallA, fallB) * 1.45;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const cat = 1 - (Math.cosh((t - 0.5) * 2 * CATENARY_K) - 1) / COSH_DENOM;
        const o = i * 3;
        out[o] = a[0] + (b[0] - a[0]) * t;
        out[o + 1] = a[1] + (b[1] - a[1]) * t - cat * droop;
        out[o + 2] = a[2] + (b[2] - a[2]) * t;
      }
      return segments + 1;
    },
  };
}
