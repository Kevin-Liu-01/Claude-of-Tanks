// utilityNetwork.js — deterministic, renderer-free utility-pole topology and
// catenary sampling. props.js owns the one InstancedMesh; this module owns the
// linked state so a fallen pole drags only its adjacent spans to the ground.

const DEFAULT_SEGMENTS = 16;
const CATENARY_K = 1.35;
const COSH_DENOM = Math.cosh(CATENARY_K) - 1;

function rotateAttachment(pole, state, side, offset, out) {
  const vx = Math.cos(pole.yaw) * side * offset;
  const vy = pole.attachH;
  const vz = -Math.sin(pole.yaw) * side * offset;
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
  // Rodrigues rotation around the same world-space hinge used by props.js.
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
export function createUtilityNetwork(poles, spans, opts = {}) {
  const segments = opts.segments ?? DEFAULT_SEGMENTS;
  const sideOffset = opts.sideOffset ?? 0.6;
  const normalizedPoles = poles.map((p) => ({ ...p, attachH: p.attachH ?? 6.5 }));
  const normalizedSpans = spans.map(([a, b]) => ({ a, b }));
  const falls = new Array(normalizedPoles.length).fill(null);
  const adjacent = Array.from({ length: normalizedPoles.length }, () => []);
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
    instanceCount: normalizedSpans.length * 2 * segments,

    /** Stable instance slot for one conductor segment. */
    instanceIndex(spanIndex, sideIndex, segmentIndex) {
      return ((spanIndex * 2 + sideIndex) * segments) + segmentIndex;
    },

    /** Set one pole's live hinge pose; returns its stable adjacent-span list. */
    setPoleFall(poleIndex, axisX, axisZ, angle) {
      if (!normalizedPoles[poleIndex]) return [];
      let state = falls[poleIndex];
      if (!state) state = falls[poleIndex] = { axisX: 0, axisZ: 1, angle: 0 };
      state.axisX = axisX;
      state.axisZ = axisZ;
      state.angle = angle;
      return adjacent[poleIndex];
    },

    resetPole(poleIndex) {
      if (normalizedPoles[poleIndex]) falls[poleIndex] = null;
      return adjacent[poleIndex] || [];
    },

    reset() {
      falls.fill(null);
    },

    /**
     * Write (segments + 1) XYZ points into caller-owned `out`.
     * sideIndex 0/1 maps to the two crossarm insulators.
     */
    writeSpanPoints(spanIndex, sideIndex, out) {
      const span = normalizedSpans[spanIndex];
      if (!span || !out || out.length < (segments + 1) * 3) return 0;
      const side = sideIndex === 0 ? -1 : 1;
      rotateAttachment(normalizedPoles[span.a], falls[span.a], side, sideOffset, a);
      rotateAttachment(normalizedPoles[span.b], falls[span.b], side, sideOffset, b);
      const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const fallA = falls[span.a] ? Math.abs(Math.sin(falls[span.a].angle)) : 0;
      const fallB = falls[span.b] ? Math.abs(Math.sin(falls[span.b].angle)) : 0;
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
