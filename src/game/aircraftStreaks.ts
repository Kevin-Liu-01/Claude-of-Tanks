/**
 * aircraftStreaks.ts — (aircraft-streaks-277; Kevin: "make ur side planes have blue streaks and other side have red",
 * then "make the colors on planes dependent on your team color thats all") the wingtip streaks every Air Support and
 * Combined Arms aircraft draws behind it. The streak's colour is the caller's: airSupportWorld.ts hands it the team colour
 * the footprints, the minimap and the markers already use for that aircraft's side (ui/objectiveGlyphs.ts sideColor 'own'
 * or 'enemy', under the player's colour preset), so a streak always matches its side's colour everywhere else.
 *
 * Each streak is a camera-facing ribbon through the wingtip's recent positions, fading out along its length (and in from
 * the tip, so it leaves the wing softly). Render-only: it reads the drawn airframe, never the run.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';

export type StreakAirframe = 'strike' | 'fighter' | 'gunship';

/** A streak's shape per airframe: how long a point lasts (s), its half width at the tip and at its end (m), its alpha. */
const LOOK: Readonly<Record<StreakAirframe, { lifeS: number; w0: number; w1: number; alpha: number }>> = Object.freeze({
  strike: { lifeS: 1.4, w0: 0.3, w1: 1.1, alpha: 0.85 },
  fighter: { lifeS: 1.4, w0: 0.3, w1: 1.1, alpha: 0.85 },
  gunship: { lifeS: 3, w0: 0.5, w1: 1.8, alpha: 0.85 },
});
/** A new point every SAMPLE_S at most (the live tip moves every frame); at most SAMPLES points a streak. */
const SAMPLE_S = 1 / 30;
const SAMPLES = 96;
/** The streak fades in over its first FADE_IN_S behind the wingtip. */
const FADE_IN_S = 0.08;

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

interface Ribbon {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** the points, newest first: x, y, z and the time it was there */
  pts: Float32Array; times: Float64Array; count: number;
}

function makeRibbon(parent: THREE.Object3D, name: string, material: THREE.MeshBasicMaterial): Ribbon {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SAMPLES * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const index: number[] = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, b, c, b, d, c);
  }
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return { mesh, pts: new Float32Array(SAMPLES * 3), times: new Float64Array(SAMPLES), count: 0 };
}

export interface AircraftStreaks {
  /** The streaks' material (its colour is the side's). */
  readonly material: THREE.MeshBasicMaterial;
  /** Lay the streaks behind `frame` (the posed airframe) at time `t`, in `colour`, facing `eye` (the camera; null: up). */
  update(frame: THREE.Object3D, t: number, colour: THREE.Color, eye: THREE.Vector3 | null): void;
  /** Hide them and forget their points (a wreck, a replay that took the screen). */
  hide(): void;
  dispose(): void;
}

/** One aircraft's two wingtip streaks, drawn in `parent` (the world's root: a streak stays where the air was). */
export function createAircraftStreaks(parent: THREE.Object3D, kind: StreakAirframe, name: string): AircraftStreaks {
  const look = LOOK[kind];
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false });
  const ribbons = [makeRibbon(parent, `${name} streak port`, material), makeRibbon(parent, `${name} streak starboard`, material)];

  function lay(ribbon: Ribbon, t: number, eye: THREE.Vector3 | null): void {
    const { pts, times, count } = ribbon;
    // points past their life go
    let n = count;
    while (n > 1 && t - times[n - 1]! > look.lifeS) n--;
    ribbon.count = n;
    const position = ribbon.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const colour = ribbon.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const p = position.array as Float32Array, c = colour.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const prev = Math.max(0, i - 1), next = Math.min(n - 1, i + 1);
      _a.set(pts[prev * 3]! - pts[next * 3]!, pts[prev * 3 + 1]! - pts[next * 3 + 1]!, pts[prev * 3 + 2]! - pts[next * 3 + 2]!);
      _at.set(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
      if (eye) _to.subVectors(eye, _at); else _to.set(0, 1, 0);
      _side.crossVectors(_a, _to);
      if (_side.lengthSq() < 1e-8) _side.set(0, 1, 0);
      const age = Math.max(0, t - times[i]!), f = Math.min(1, age / look.lifeS);
      _side.normalize().multiplyScalar(look.w0 + (look.w1 - look.w0) * f);
      const alpha = look.alpha * (1 - f) * (1 - f) * Math.min(1, age / FADE_IN_S);
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s, sign = s ? -1 : 1;
        p[k * 3] = _at.x + _side.x * sign; p[k * 3 + 1] = _at.y + _side.y * sign; p[k * 3 + 2] = _at.z + _side.z * sign;
        c[k * 4] = 1; c[k * 4 + 1] = 1; c[k * 4 + 2] = 1; c[k * 4 + 3] = alpha;
      }
    }
    position.needsUpdate = true; colour.needsUpdate = true;
    ribbon.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    ribbon.mesh.visible = n > 1;
  }

  function push(ribbon: Ribbon, x: number, y: number, z: number, t: number): void {
    const { pts, times } = ribbon;
    // a clock that went back (a replay began) starts the streak over
    if (ribbon.count && t < times[0]!) ribbon.count = 0;
    // the live tip moves every frame; a new point stays behind once the last one is SAMPLE_S old
    if (ribbon.count < 2 || t - times[1]! >= SAMPLE_S) {
      pts.copyWithin(3, 0, (SAMPLES - 1) * 3);
      times.copyWithin(1, 0, SAMPLES - 1);
      ribbon.count = Math.min(SAMPLES, ribbon.count + 1);
    }
    pts[0] = x; pts[1] = y; pts[2] = z; times[0] = t;
  }

  function hide(): void {
    for (const ribbon of ribbons) { ribbon.count = 0; ribbon.mesh.visible = false; }
  }

  return {
    material,
    hide,
    update(frame, t, colour, eye) {
      material.color.copy(colour);
      const tip = portTip(kind, frame);
      if (!tip) { hide(); return; }
      frame.updateMatrixWorld();
      for (let s = 0; s < 2; s++) {
        _v.set(s ? -tip.x : tip.x, tip.y, tip.z).applyMatrix4(frame.matrixWorld);
        push(ribbons[s]!, _v.x, _v.y, _v.z, t);
        lay(ribbons[s]!, t, eye);
      }
    },
    dispose() {
      for (const ribbon of ribbons) { ribbon.mesh.removeFromParent(); ribbon.mesh.geometry.dispose(); }
      material.dispose();
    },
  };
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _at = new THREE.Vector3(), _to = new THREE.Vector3(),
  _side = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
