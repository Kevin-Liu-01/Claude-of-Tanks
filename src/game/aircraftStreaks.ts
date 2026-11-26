/**
 * aircraftStreaks.ts — (aircraft-streaks-277; Kevin: "make ur side planes have blue streaks and other side have red",
 * then "make the colors on planes dependent on your team color thats all") the wingtip trails every Air Support and
 * Combined Arms aircraft draws behind it. The trail's colour is the caller's: airSupportWorld.ts hands it the team colour
 * the footprints, the minimap and the markers already use for that aircraft's side (ui/objectiveGlyphs.ts sideColor 'own'
 * or 'enemy', under the player's colour preset), so a trail always matches its side's colour everywhere else.
 *
 * (aircraft-trails-278; Kevin: "make the aircraft trails much much better instead of having a hard cut off point") A
 * trail is laid in world space and every point of it fades by its own age, to exactly zero, whatever its aircraft does
 * next: an aircraft that leaves, is downed or is let go only stops laying (end()), and what it laid diffuses out where
 * the air was. Each point widens as it ages (a vortex spreading) while it thins to nothing, and the ribbon is soft across
 * its width (an alpha profile that is zero at both edges), so no trail has a hard edge or a hard end.
 *
 * One field draws every aircraft's trails in one mesh (one draw call) from fixed buffers: SLOTS strips of CAP points,
 * written compacted to the front of the vertex buffers each frame (no allocation a frame). Render-only: it reads the
 * drawn airframe, never the run. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';

export type StreakAirframe = 'strike' | 'fighter' | 'gunship';

/** A trail's shape per airframe: how long a point lasts (s), its half width at the wingtip and at the end of its life
 *  (m), its peak alpha. */
export const STREAK_LOOK: Readonly<Record<StreakAirframe, { lifeS: number; w0: number; w1: number; alpha: number }>> = Object.freeze({
  strike: { lifeS: 4, w0: 0.25, w1: 2.6, alpha: 0.8 },
  fighter: { lifeS: 4, w0: 0.22, w1: 2.4, alpha: 0.8 },
  gunship: { lifeS: 7, w0: 0.4, w1: 4, alpha: 0.7 },
});
/** A point is laid once the last one is SAMPLE_S old (the live wingtip is drawn every frame between them). */
const SAMPLE_S = 1 / 30;
/** A point fades in over its first FADE_IN_S behind the wingtip; a trail fades in over the first START_S it laid. */
const FADE_IN_S = 0.25;
const START_S = 0.25;
/** A clock that steps back further than this is another clock (a replay began): the emitter's trail starts over. */
const RESTART_S = 0.5;
/** Strips in the field (an aircraft lays two) and the points a strip holds (its longest life at SAMPLE_S, and the tip). */
const SLOTS = 32;
const CAP = Math.ceil(Math.max(...Object.values(STREAK_LOOK).map((l) => l.lifeS)) / SAMPLE_S) + 4;

/** The ribbon's alpha across its width at u (0 and 1: its edges): soft, zero at both edges, one on its line. */
export function streakProfile(u: number): number {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  return s * s;
}
/** A point's alpha (before the peak) at `age` s in a trail of life `lifeS`: in over FADE_IN_S, out to exactly zero at
 *  its life's end with no slope (1 - smoothstep). */
export function streakFade(age: number, lifeS: number): number {
  if (age <= 0 || age >= lifeS) return 0;
  const f = age / lifeS, i = Math.min(1, age / FADE_IN_S);
  return i * i * (3 - 2 * i) * (1 - f * f * (3 - 2 * f));
}

/** The port wingtip (+X) in the airframe's own frame, found once per airframe from its drawn geometry (the vertex
 *  furthest out along +X); the starboard tip mirrors it. */
const tips = new Map<StreakAirframe, THREE.Vector3>();
function portTip(kind: StreakAirframe, frame: THREE.Object3D): THREE.Vector3 | null {
  const known = tips.get(kind);
  if (known) return known;
  frame.updateMatrixWorld(true);
  _inv.copy(frame.matrixWorld).invert();
  const tip = new THREE.Vector3(-Infinity, 0, 0);
  frame.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const position = mesh.isMesh ? mesh.geometry?.attributes?.position : null;
    if (!position) return;
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(position, i).applyMatrix4(_m);
      if (_v.x > tip.x) tip.copy(_v);
    }
  });
  if (!Number.isFinite(tip.x) || tip.x <= 0) return null;
  tips.set(kind, tip);
  return tip;
}

/** One strip: a ring of laid points (x, y, z and when), its emitter's live tip, its colour. */
interface Slot {
  owner: Emitter | null; kind: StreakAirframe;
  pts: Float32Array; times: Float64Array; head: number; count: number;
  tip: Float32Array; tipT: number; live: boolean; startT: number;
  r: number; g: number; b: number;
}
interface Emitter extends StreakEmitter { slots: [Slot, Slot] | null; kind: StreakAirframe; lastT: number }

export interface StreakEmitter {
  /** Lay the trails behind `frame` (the posed airframe) at time `t`, in `colour`. */
  lay(frame: THREE.Object3D, t: number, colour: THREE.Color): void;
  /** Stop laying: what it laid stays where it was and fades out by its age (an exit, a wreck, a released aircraft). */
  end(): void;
}

export interface AircraftStreaks {
  /** The field's one mesh. */
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** The trails of a new aircraft of `kind`. */
  emitter(kind: StreakAirframe): StreakEmitter;
  /** Draw every trail (or only `only`'s: a replay on its own clock) at time `t`, facing `eye` (the camera; null: up). */
  draw(t: number, eye: THREE.Vector3 | null, only?: readonly StreakEmitter[]): void;
  /** Forget every trail (the battle's air leaves). */
  clear(): void;
  dispose(): void;
}

/** The trail field, drawn in `parent` (the world's root: a trail stays where the air was). */
export function createAircraftStreaks(parent: THREE.Object3D, name = 'air-support trails'): AircraftStreaks {
  const VERTS = SLOTS * CAP * 2;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const colour = new THREE.BufferAttribute(new Float32Array(VERTS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const uv = new Float32Array(VERTS * 2);
  for (let i = 0; i < VERTS; i++) { uv[i * 2] = i & 1; uv[i * 2 + 1] = 0.5; }
  const index = new THREE.BufferAttribute(new Uint16Array(SLOTS * (CAP - 1) * 6), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', colour);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const buffers = [position, colour, index] as const;
  geometry.setDrawRange(0, 0);
  // the soft profile across the ribbon (alphaMap reads green)
  const W = 64, profile = new Uint8Array(W * 4);
  for (let i = 0; i < W; i++) profile.fill(Math.round(255 * streakProfile((i + 0.5) / W)), i * 4, i * 4 + 4);
  const alphaMap = new THREE.DataTexture(profile, W, 1, THREE.RGBAFormat);
  alphaMap.magFilter = THREE.LinearFilter; alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, alphaMap,
    side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  parent.add(mesh);

  const slots: Slot[] = Array.from({ length: SLOTS }, () => ({ owner: null, kind: 'strike' as StreakAirframe,
    pts: new Float32Array(CAP * 3), times: new Float64Array(CAP), head: 0, count: 0,
    tip: new Float32Array(3), tipT: 0, live: false, startT: 0, r: 1, g: 1, b: 1 }));

  /** The newest point's time in a strip (-Infinity: empty). */
  const newest = (s: Slot): number => (s.live ? s.tipT : s.count ? s.times[(s.head + CAP - 1) % CAP]! : -Infinity);
  /** A free strip, else the ended one that has faded longest (never a live one). */
  function take(owner: Emitter): Slot | null {
    let best: Slot | null = null;
    for (const s of slots) {
      if (!s.owner && !s.count) { best = s; break; }
      if (!s.live && (!best || newest(s) < newest(best))) best = s;
    }
    if (!best) return null;
    if (best.owner) best.owner.slots = null;
    best.owner = owner; best.kind = owner.kind; best.count = 0; best.head = 0; best.live = true; best.startT = NaN;
    return best;
  }
  function release(s: Slot): void { s.owner = null; s.live = false; }

  function push(s: Slot, x: number, y: number, z: number, t: number, c: THREE.Color): void {
    s.r = c.r; s.g = c.g; s.b = c.b;
    if (Number.isNaN(s.startT)) s.startT = t;
    s.tip[0] = x; s.tip[1] = y; s.tip[2] = z; s.tipT = t;
    const last = s.count ? s.times[(s.head + CAP - 1) % CAP]! : -Infinity;
    if (t - last < SAMPLE_S - 1e-6) return;
    const i = s.head;
    s.pts[i * 3] = x; s.pts[i * 3 + 1] = y; s.pts[i * 3 + 2] = z; s.times[i] = t;
    s.head = (i + 1) % CAP;
    s.count = Math.min(CAP - 1, s.count + 1);
  }

  function emitter(kind: StreakAirframe): StreakEmitter {
    const e: Emitter = {
      kind, slots: null, lastT: -Infinity,
      lay(frame, t, c) {
        const tip = portTip(kind, frame);
        if (!tip) return;
        // a clock that went far back (a replay began) starts the trail over; a small step back waits for it
        if (t < e.lastT - RESTART_S) { if (e.slots) for (const s of e.slots) { s.count = 0; s.head = 0; s.startT = NaN; } }
        else if (t < e.lastT) return;
        e.lastT = t;
        if (!e.slots) {
          const a = take(e), b = a && take(e);
          if (!a || !b) { if (a) release(a); return; }
          e.slots = [a, b];
        }
        frame.updateMatrixWorld();
        for (let s = 0; s < 2; s++) {
          _v.set(s ? -tip.x : tip.x, tip.y, tip.z).applyMatrix4(frame.matrixWorld);
          push(e.slots[s]!, _v.x, _v.y, _v.z, t, c);
        }
      },
      end() {
        if (!e.slots) return;
        // the tip it was drawing at stays its newest point
        for (const s of e.slots) {
          if (s.live && (!s.count || s.tipT > s.times[(s.head + CAP - 1) % CAP]!)) {
            const i = s.head;
            s.pts[i * 3] = s.tip[0]!; s.pts[i * 3 + 1] = s.tip[1]!; s.pts[i * 3 + 2] = s.tip[2]!; s.times[i] = s.tipT;
            s.head = (i + 1) % CAP; s.count = Math.min(CAP - 1, s.count + 1);
          }
          s.live = false;
        }
        e.slots = null;
      },
    };
    return e;
  }

  /** Lay strip `s` at time `t` from vertex `v`; returns the vertices it wrote (its indices from `k`). */
  let indexCount = 0;
  function layStrip(s: Slot, t: number, eye: THREE.Vector3 | null, v: number): number {
    const look = STREAK_LOOK[s.kind];
    // points past their life are gone (their alpha reached zero)
    while (s.count && t - s.times[(s.head + CAP - s.count) % CAP]! >= look.lifeS) s.count--;
    const n = s.count + (s.live ? 1 : 0);
    if (n < 2) return 0;
    const p = position.array as Float32Array, c = colour.array as Float32Array, ix = index.array as Uint16Array;
    // point j (0: newest) of the strip: the live tip, then the laid points newest first
    const at = (j: number, out: THREE.Vector3): number => {
      if (s.live) { if (j === 0) { out.set(s.tip[0]!, s.tip[1]!, s.tip[2]!); return s.tipT; } j--; }
      const i = (s.head + CAP - 1 - j) % CAP;
      out.set(s.pts[i * 3]!, s.pts[i * 3 + 1]!, s.pts[i * 3 + 2]!);
      return s.times[i]!;
    };
    for (let j = 0; j < n; j++) {
      const born = at(j, _at);
      at(Math.max(0, j - 1), _a); at(Math.min(n - 1, j + 1), _b);
      _a.sub(_b);
      if (eye) _to.subVectors(eye, _at); else _to.set(0, 1, 0);
      _side.crossVectors(_a, _to);
      if (_side.lengthSq() < 1e-8) _side.set(0, 1, 0);
      const age = Math.max(0, t - born), f = Math.min(1, age / look.lifeS);
      _side.normalize().multiplyScalar(look.w0 + (look.w1 - look.w0) * Math.sqrt(f));
      const start = Math.min(1, Math.max(0, born - s.startT) / START_S);
      const alpha = look.alpha * streakFade(age, look.lifeS) * start * start * (3 - 2 * start);
      for (let side = 0; side < 2; side++) {
        const k = v + j * 2 + side, sign = side ? -1 : 1;
        p[k * 3] = _at.x + _side.x * sign; p[k * 3 + 1] = _at.y + _side.y * sign; p[k * 3 + 2] = _at.z + _side.z * sign;
        c[k * 4] = s.r; c[k * 4 + 1] = s.g; c[k * 4 + 2] = s.b; c[k * 4 + 3] = alpha;
      }
      if (j) {
        const a = v + (j - 1) * 2;
        ix[indexCount++] = a; ix[indexCount++] = a + 1; ix[indexCount++] = a + 2;
        ix[indexCount++] = a + 1; ix[indexCount++] = a + 3; ix[indexCount++] = a + 2;
      }
    }
    return n * 2;
  }

  function draw(t: number, eye: THREE.Vector3 | null, only?: readonly StreakEmitter[]): void {
    let v = 0;
    indexCount = 0;
    for (const s of slots) {
      if (only && !only.includes(s.owner as StreakEmitter)) continue;
      v += layStrip(s, t, eye, v);
      // an ended strip whose points have all gone is free
      if (!s.live && !s.count && s.owner === null) continue;
      if (!s.live && !s.count) release(s);
    }
    for (const a of buffers) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, (a === index ? indexCount : v * a.itemSize) || 1);
      a.needsUpdate = true;
    }
    geometry.setDrawRange(0, indexCount);
    mesh.visible = indexCount > 0;
  }

  function clear(): void {
    for (const s of slots) { if (s.owner) (s.owner as Emitter).slots = null; s.owner = null; s.live = false; s.count = 0; }
    geometry.setDrawRange(0, 0);
    mesh.visible = false;
  }

  return {
    mesh,
    emitter,
    draw,
    clear,
    dispose() { clear(); mesh.removeFromParent(); geometry.dispose(); material.dispose(); alphaMap.dispose(); },
  };
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _at = new THREE.Vector3(),
  _to = new THREE.Vector3(), _side = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
