/**
 * propCrushPresentation.ts — the props a hull runs over, drawn giving under it (destruction core lane, 2026-10-10; the
 * crush field is propCrush.ts). props.ts hands this the hulls each frame (pressHull: the battle presentation's hulls in
 * view, the Scene Studio's actors on their tracks) and the simulation's crush events (takes): a map vehicle, a hut, a
 * stall or a tent a hull's box reaches becomes its own copy of itself — the pool's own geometry and material, its own
 * livery — drawn through its crush field, its instance in the pool hidden. It keeps its paint (a crushed car is not a
 * burnt one) and every crumple it has been given.
 *
 * Presentation only: the press never touches a collision record (the simulation's crush event ghosts the obstacle).
 * A crush event this side never saw a hull make (a hull out of view, a remote or late event) sweeps a hull across the
 * prop along the event's direction instead, live over SWEEP_S or at once when settled; the Studio, which presses with
 * every hull on its tracks, turns the sweep off. Cost: a copy is redrawn only on the frames its field changed, at most
 * REDRAW_MAX copies a frame (the rest the next), with the scratch reused; a copy left alone FREEZE_FRAMES frames stops
 * being redrawn and is culled by its own bounds again.
 *
 * A map car (the car-wreck lane, 2026-10-20; Steinburg r5's blind critics: a run-over car read as "a flat, wavy green
 * sheet with no wheels", a shot one kept its showroom shape under a char tint): its copy reads its own anatomy (propCrush.ts
 * vehicleAnatomy) so a hull leaves it a crushed car, its glass bursting at the first press; a round's kill buckles it as
 * it burns (wreckCrumple.ts's burnt-out crumple, a share at the kill and the rest as the fire takes it), burns its tyres
 * to the rims and blackens its paint, chrome and rubber in its own colours (soot, oxide mottles, ash on the hot panels).
 */
import * as THREE from 'three';
import {
  addDent, createCrushField, deformPositions, flatNormals, hullMeetsBox, pressField, sweepPose, vehicleAnatomy, type CrushField,
} from './propCrush.ts';
import { crumpleBurntVehicle } from './wreckCrumple.ts';

/** A destructible record as this reads it (props.ts DestructibleRecord). */
interface CrushRecordLike {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly slot: number;
  state: number;
  readonly clutter?: unknown;
  readonly dropped?: boolean;
  /** The slot its broken state took in the pool's broken mesh (props.ts animateBrokenRecord), when it has one. */
  _bi?: number;
}
/** A destructible pool as this reads it (props.ts DestructiblePool). */
interface CrushPoolLike {
  readonly mats4: readonly THREE.Matrix4[];
  /** The pool's destructible type: `crushFloor`, the share of its height no hull presses it below (heavy plant). */
  readonly meta?: { readonly keep?: number; readonly crushFloor?: number };
  readonly imI: THREE.InstancedMesh | null;
  readonly imB: THREE.InstancedMesh | null;
}
interface PropCrushHost {
  readonly group: THREE.Group;
  readonly records: readonly CrushRecordLike[];
  poolOf(kind: string): CrushPoolLike | undefined;
  /** The destructible indices whose cells reach a box (world XZ). */
  near(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[];
  /** Whether a kind gives under a hull as its own copy (the map vehicles, the small buildings, the stalls, the tents). */
  eligible(kind: string): boolean;
  /** Whether a kind is canvas (a tent: it drapes and drags as cloth under the hull). */
  cloth?(kind: string): boolean;
  /** Whether a kind burns when a round destroys it (the map vehicles): its char comes over seconds, then its burnt build. */
  burns?(kind: string): boolean;
  /** Whether a kind is a car (the map's civilian vehicles): its crush reads its anatomy, its burn buckles and chars it. */
  vehicle?(kind: string): boolean;
  /** A prop of `kind` began burning at (x, y, z), `heightM` tall (the fire and smoke the effects raise over it). */
  onBurn?(x: number, y: number, z: number, heightM: number, kind: string): void;
}

/** A crush event the presentation never pressed sweeps a hull across the prop over this long (s). */
const SWEEP_S = 0.45;
/** Copies redrawn a frame at most, and the frames a copy left alone before it is frozen. */
const REDRAW_MAX = 4;
const FREEZE_FRAMES = 30;
/** The furthest a record's centre lies from a hull's whose box could reach it (m). */
const REACH_PAD_M = 4.2;
/** A burst's shove: over this long (s) the prop is thrown off and settles. */
const SHOVE_S = 0.9;
/** The burn (wave 350/351: no paint flip): the paint chars over CHAR_S once the fire has taken hold (CHAR_T0 s after the
 *  kill), and the burnt build (glass, rubber and lamps gone, char and oxide) takes the copy's place at its end. */
const CHAR_T0 = 0.6;
const CHAR_S = 4.5;
/** Char: the paint's colour at the end of its burn. */
const CHAR_RGB = [0.07, 0.06, 0.055];
/** A car's burn: the share of its burnt-out crumple the kill gives at once, the share of the burn its colours are
 *  updated at (a cheap upload) and its shape redrawn at (the press's full redraw), what is left of a tyre's radius on its
 *  rim, and the burnt build's colours (linear; vehicleMesh.ts shadeVertex's burn). */
const CAR_BURN = { impact: 0.3, colourStep: 0.03, shapeStep: 0.1, rim: 0.72 } as const;
const SOOT: readonly [number, number, number] = [0.022, 0.019, 0.017];
const OXIDE: readonly [number, number, number] = [0.105, 0.042, 0.018];
const RUST: readonly [number, number, number] = [0.16, 0.062, 0.026];
const ASH: readonly [number, number, number] = [0.2, 0.19, 0.175];

/** A car's burn in flight: its rest as it burns (the press draws from it), the intact and the burnt rests, colours and
 *  surface streams; `drawn` the share last drawn. */
interface CarBurn {
  readonly live: Float32Array;
  readonly from: Float32Array;
  readonly to: Float32Array;
  readonly col0: Float32Array;
  readonly col1: Float32Array;
  readonly surf0: Uint8Array;
  readonly surf1: Uint8Array;
  /** The share of the burn last coloured and last redrawn (−1: not yet). */
  coloured: number;
  drawn: number;
}

interface CrushTarget {
  readonly index: number;
  readonly kind: string;
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  /** The rest it is drawn from: the pool's own (never written; its body's alone when the build carries a far form), or a
   *  car's burning rest (CarBurn.live). */
  rest: Float32Array;
  /** The triangles it draws (its index, or its body's share of it). */
  readonly tris: Uint16Array | Uint32Array | null;
  readonly field: CrushField;
  readonly inverse: THREE.Matrix4;
  /** The source it hid: the pool's intact slot, or its broken mesh's. */
  readonly fromBroken: boolean;
  readonly hw: number;
  readonly hl: number;
  dirty: boolean;
  idle: number;
  frozen: boolean;
  /** A sweep in flight: its direction (the prop's frame), how far along (0..1). */
  sweep: { dx: number; dz: number; k: number } | null;
  /** Its placement (the pool's slot matrix) and a burst's shove over it in flight: offset (world), lift, tilt axis and
   *  angle, yaw, its clock. */
  readonly placement: THREE.Matrix4;
  shove: { ox: number; oz: number; lift: number; ax: number; az: number; tilt: number; yaw: number; t: number } | null;
  /** The glass blown out (its triangles collapsed), once. */
  glassOut: boolean;
  /** Heavy plant (its field has a floor) shoved aside and slewed by the hull that rammed it, once. */
  rammed: boolean;
  /** Burning: its clock (s since the kill), the paint it chars from, whether the burnt build has taken its place. */
  burn: { t: number; from: [number, number, number]; swapped: boolean } | null;
  /** A car's burn (its crumple, its tyres and its colours), or null. */
  carBurn: CarBurn | null;
}

interface PropCrushPresentation {
  /** A hull this frame (world centre, yaw, its contact half extents). */
  pressHull(x: number, z: number, yaw: number, halfLength: number, halfWidth: number): void;
  /**
   * A crush event on record `index`: true when the press draws it (an eligible record crushed by a hull, or one already
   * pressed) and the pool's broken swap must not run. `settled`: lay its final pose at once.
   */
  takes(index: number, cause: string, dirX: number, dirZ: number, settled: boolean): boolean;
  /** Whether a crush event this side never pressed sweeps a hull across the prop (the battle: yes; the Studio: no). */
  setSweeps(on: boolean): void;
  /**
   * A burst near record `index` (wave 351: "a near miss must show on a civilian vehicle"): `strength` 0..1 (how near
   * and how big). Its glass goes, the panels facing it dent, and it is shoved and lifted off and settles. Presentation
   * only; a burst that destroys it is the simulation's (takes).
   */
  blast(index: number, x: number, y: number, z: number, strength: number): void;
  /** The frame's redraws (budgeted) and the sweeps in flight. */
  step(dt: number): void;
  /** Stand every copy's prop back up (the pools' slots restored, the copies gone). */
  reset(): void;
  /** The copies standing (tests, the cost probes). */
  stats(): { copies: number; deforming: number; frozen: number };
}

export function createPropCrushPresentation(host: PropCrushHost): PropCrushPresentation {
  const targets = new Map<number, CrushTarget>();
  const order: CrushTarget[] = [];
  const near: number[] = [];
  const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0), _v = new THREE.Vector3(), _c = new THREE.Color();
  const _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _burnt: [number, number, number] = [0, 0, 0];
  const _pose: number[] = [0, 0, 0, 0, 0, 0];
  let sweeps = true;
  let cursor = 0;

  /** The pool slot the record draws in now (its intact one, or its broken one) and the geometry there. */
  function sourceOf(rec: CrushRecordLike, pool: CrushPoolLike, intact: boolean): { mesh: THREE.InstancedMesh; slot: number; broken: boolean } | null {
    if (!intact && rec.state && pool.imB && rec._bi !== undefined && rec._bi < pool.imB.count) return { mesh: pool.imB, slot: rec._bi, broken: true };
    if ((intact || !rec.state) && pool.imI) return { mesh: pool.imI, slot: rec.slot, broken: false };
    return null;
  }

  /** A record's copy, made now if it has none (`intact`: from its intact slot, the record breaking this moment). */
  function begin(index: number, intact = false): CrushTarget | null {
    const have = targets.get(index);
    if (have) return have;
    const rec = host.records[index];
    if (!rec || rec.clutter || rec.dropped || !host.eligible(rec.kind)) return null;
    const pool = host.poolOf(rec.kind);
    if (!pool) return null;
    const source = sourceOf(rec, pool, intact);
    if (!source) return null;
    const src = source.mesh.geometry;
    if (!src.boundingBox) src.computeBoundingBox();
    const box = src.boundingBox!;
    const hw = Math.max(-box.min.x, box.max.x, 0.2), hl = Math.max(-box.min.z, box.max.z, 0.2);
    const geometry = src.clone();
    // a build that carries its far form (the maps lane's vehicleFarForm.ts: its vertices and triangles at the end of the
    // streams, tagged aVehicleLod for the material's fold past 120 m): the copy draws its body alone at every distance — the
    // far form's triangles out of its draw range, the tag gone (an untagged vertex never folds) — and reads, deforms and
    // burns the body alone
    const far = src.userData.vehicleFar as { vertexStart: number; indexStart: number } | undefined;
    if (far) {
      geometry.setDrawRange(0, far.indexStart);
      if (geometry.getAttribute('aVehicleLod')) geometry.deleteAttribute('aVehicleLod');
    }
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    (geometry.getAttribute('normal') as THREE.BufferAttribute | undefined)?.setUsage(THREE.DynamicDrawUsage);
    const material = source.mesh.material;
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    const allRest = (src.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const restArray = far ? allRest.subarray(0, far.vertexStart * 3) : allRest;
    const surf = src.getAttribute('surf') as THREE.BufferAttribute | undefined;
    // a car reads its own anatomy (its belt line, its wheels) for the crush
    const anatomy = host.vehicle?.(rec.kind) && surf
      ? vehicleAnatomy(restArray, surf.array as ArrayLike<number>, surf.normalized ? 255 : 1, box.max.y, hw) : null;
    const matrix = pool.mats4[rec.slot];
    mesh.setMatrixAt(0, matrix);
    if (source.mesh.instanceColor) {
      source.mesh.getColorAt(source.slot, _c);
      mesh.setColorAt(0, _c);
    }
    if (source.mesh.customDepthMaterial) mesh.customDepthMaterial = source.mesh.customDepthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.name = `crush-${rec.kind}`;
    host.group.add(mesh);
    // the pool's own slot hidden: the copy stands in its place
    source.mesh.setMatrixAt(source.slot, _zero);
    source.mesh.instanceMatrix.needsUpdate = true;
    const target: CrushTarget = {
      index, kind: rec.kind, mesh, geometry, rest: restArray,
      tris: geometry.index ? (far ? (geometry.index.array as Uint16Array | Uint32Array).subarray(0, far.indexStart) : geometry.index.array as Uint16Array | Uint32Array) : null,
      field: createCrushField(hw, hl, box.max.y, undefined, host.cloth?.(rec.kind) ?? false, pool.meta?.crushFloor ?? 0, anatomy),
      inverse: new THREE.Matrix4().copy(matrix).invert(), fromBroken: source.broken,
      hw, hl, dirty: false, idle: 0, frozen: false, sweep: null,
      placement: matrix.clone(), shove: null, glassOut: false, rammed: false, burn: null, carBurn: null,
    };
    targets.set(index, target);
    order.push(target);
    return target;
  }

  /** The hull (world) in a target's own frame: centre and forward, through its inverse placement. */
  function press(t: CrushTarget, x: number, z: number, fx: number, fz: number, halfLength: number, halfWidth: number): void {
    // (heavy plant shoved off the hull's line: no more presses where it stood while it goes)
    if (t.rammed && t.shove && t.shove.t > 0.2 && t.shove.t < SHOVE_S) return;
    const y = host.records[t.index]?.y ?? 0;
    _v.set(x, y, z).applyMatrix4(t.inverse);
    const cx = _v.x, cz = _v.z;
    _v.set(x + fx, y, z + fz).applyMatrix4(t.inverse);
    let lfx = _v.x - cx, lfz = _v.z - cz;
    // the placement's scale: a world metre is `l` of the prop's own units
    const l = Math.hypot(lfx, lfz) || 1;
    lfx /= l; lfz /= l;
    if (pressField(t.field, cx, cz, lfx, lfz, halfLength * l, halfWidth * l)) {
      t.dirty = true; t.idle = 0;
      // a car's glass bursts as the hull comes onto it
      if (t.field.vehicle) glassOut(t);
      if (t.frozen) { t.frozen = false; t.mesh.frustumCulled = false; }
      if (t.field.floor > 0 && !t.rammed) shoveAside(t, x, z, fx, fz, halfWidth);
    }
  }

  /** Heavy plant rammed (Lane C, 2026-10-15): a machine the hull cannot press flat is shoved off the hull's line and
   *  slewed away from it as it crumples (the burst's shove: over SHOVE_S, then its frame follows), enough to clear the
   *  hull's width; a little ahead along the travel. Once a prop; deterministic in the hull's pose at contact. */
  function shoveAside(t: CrushTarget, x: number, z: number, fx: number, fz: number, halfWidth: number): void {
    const rec = host.records[t.index];
    if (!rec) return;
    t.rammed = true;
    const rx = -fz, rz = fx;
    const off = (rec.x - x) * rx + (rec.z - z) * rz;
    const side = Math.abs(off) > 0.05 ? Math.sign(off) : ((t.index * 2654435761) >>> 0) % 2 ? 1 : -1;
    // the prop's half extent across the hull's travel, from its placement's axes
    const e = t.placement.elements;
    const ax = Math.hypot(e[0], e[2]) || 1, az = Math.hypot(e[8], e[10]) || 1;
    const across = Math.abs((e[0] / ax) * rx + (e[2] / ax) * rz) * t.hw + Math.abs((e[8] / az) * rx + (e[10] / az) * rz) * t.hl;
    const clear = Math.max(0, Math.min(4, halfWidth + across + 0.25 - Math.abs(off)));
    const prev = t.shove;
    t.shove = { ox: (prev ? prev.ox : 0) + rx * side * clear + fx * 0.8, oz: (prev ? prev.oz : 0) + rz * side * clear + fz * 0.8,
      lift: 0.18, ax: fx, az: fz, tilt: 0.1 * side, yaw: (prev ? prev.yaw : 0) + 0.32 * side, t: 0 };
  }

  /** Its glass blown out: every triangle all of whose corners are glass (the surface stream: glossy, not metal, not
   *  paint) collapsed onto a point of itself, in the copy's own index. Once. */
  function glassOut(t: CrushTarget): void {
    if (t.glassOut) return;
    t.glassOut = true;
    const surf = t.geometry.getAttribute('surf') as THREE.BufferAttribute | undefined;
    const index = t.geometry.index;
    if (!surf || !index) return;
    const a = surf.array as ArrayLike<number>, scale = surf.normalized ? 255 : 1;
    const glass = (v: number): boolean => a[v * 3] < 0.12 * scale && a[v * 3 + 1] < 0.25 * scale && a[v * 3 + 2] < 0.05 * scale;
    const ix = index.array as Uint16Array | Uint32Array;
    let gone = 0;
    for (let k = 0; k + 2 < ix.length; k += 3) {
      if (glass(ix[k]) && glass(ix[k + 1]) && glass(ix[k + 2])) { ix[k + 1] = ix[k]; ix[k + 2] = ix[k]; gone++; }
    }
    if (gone) index.needsUpdate = true;
  }

  /** The copy's placement now: its slot's, under a burst's shove in flight (or settled) and a burn's settle. */
  function place(t: CrushTarget): void {
    const rec = host.records[t.index];
    _m.copy(t.placement);
    if (rec && (t.shove || (t.burn && !t.burn.swapped))) {
      let ox = 0, oz = 0, oy = 0, tilt = 0, yaw = 0, ax = 1, az = 0;
      if (t.shove) {
        const k = Math.min(1, t.shove.t / SHOVE_S), ease = 1 - (1 - k) ** 3;
        ox = t.shove.ox * ease; oz = t.shove.oz * ease;
        oy = t.shove.lift * 4 * k * (1 - k);
        // it rocks over, away from the burst, and comes back down onto its wheels
        tilt = t.shove.tilt * Math.sin(Math.PI * k) * (1 - k * 0.6);
        yaw = t.shove.yaw * ease; ax = t.shove.ax; az = t.shove.az;
      }
      // a burnt body settles onto its rims as its tyres go (until that is baked into its placement; a car's tyres burn to
      // its rims in its own rest)
      if (t.burn && !t.burn.swapped && !t.carBurn) oy -= 0.12 * Math.min(1, Math.max(0, (t.burn.t - CHAR_T0) / CHAR_S));
      _q.setFromAxisAngle(_axis.set(ax, 0, az), tilt);
      _q2.setFromAxisAngle(_axis.set(0, 1, 0), yaw);
      _q.multiply(_q2);
      _m2.makeTranslation(-rec.x, -rec.y, -rec.z);
      _m3.makeRotationFromQuaternion(_q).multiply(_m2);
      _m2.makeTranslation(rec.x + ox, rec.y + oy, rec.z + oz);
      _m.premultiply(_m3).premultiply(_m2);
    }
    t.mesh.setMatrixAt(0, _m);
    t.mesh.instanceMatrix.needsUpdate = true;
  }

  /** A round's kill on a vehicle (wave 350/351): its glass goes, the side facing the shot dents, and it burns — the fire
   *  takes hold, the paint chars over seconds and the body settles onto its rims. `settled`: the end of all that at once. */
  function burn(t: CrushTarget, dirX: number, dirZ: number, settled: boolean): void {
    if (t.burn) return;
    const rec = host.records[t.index];
    glassOut(t);
    if (rec) {
      // the shot's side: from the vehicle toward where the round came from
      _v.set(rec.x - dirX * 10, rec.y + 0.9, rec.z - dirZ * 10).applyMatrix4(t.inverse);
      dentFrom(t, _v.x, _v.y, _v.z, 0.85);
    }
    const from: [number, number, number] = [1, 1, 1];
    if (t.mesh.instanceColor) { t.mesh.getColorAt(0, _c); from[0] = _c.r; from[1] = _c.g; from[2] = _c.b; }
    t.burn = { t: settled ? CHAR_T0 + CHAR_S + 1 : 0, from, swapped: false };
    if (t.field.vehicle) t.carBurn = carBurnOf(t);
    if (!settled && rec) host.onBurn?.(rec.x, rec.y, rec.z, t.field.top, rec.kind);
    if (t.carBurn) carBurnStep(t);
    else tint(t);
    t.dirty = true; t.idle = 0;
  }

  /**
   * A car's burn, planned at the kill (allocates once): its burnt-out crumple (wreckCrumple.ts, seeded by its record),
   * its tyres burnt to the rims and the body settled onto them, and its burnt colours and surfaces. Null without the
   * colour and surface streams (the instance tint chars it instead).
   */
  function carBurnOf(t: CrushTarget): CarBurn | null {
    const car = t.field.vehicle;
    const color = t.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    const surf = t.geometry.getAttribute('surf') as THREE.BufferAttribute | undefined;
    const normal = t.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!car || !color || !surf || !normal || !(color.array instanceof Float32Array) || !(surf.array instanceof Uint8Array)) return null;
    const from = new Float32Array(t.rest), n = from.length;
    // the crumple, on a scratch geometry of its own rest (positions and the rest's normals)
    const scratch = new THREE.BufferGeometry();
    scratch.setAttribute('position', new THREE.BufferAttribute(new Float32Array(from), 3));
    scratch.setAttribute('normal', new THREE.BufferAttribute((normal.array as Float32Array).slice(0, n), 3));
    crumpleBurntVehicle(scratch, (Math.imul(t.index + 1, 2654435761) >>> 0) & 0x7fffffff);
    const to = (scratch.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    scratch.dispose();
    // the tyres burnt to the rims, the body settled onto them by what its smallest tyre lost
    const scale = surf.normalized ? 255 : 1, sa = surf.array, w = car.wheels;
    let settle = 0;
    for (let k = 0; k < w.length; k += 6) settle = settle ? Math.min(settle, w[k + 2] * (1 - CAR_BURN.rim)) : w[k + 2] * (1 - CAR_BURN.rim);
    for (let v = 0; v < car.wheelOf.length; v++) {
      const k = car.wheelOf[v];
      if (k >= 0 && sa[v * 3] / scale > 0.8 && sa[v * 3 + 1] / scale < 0.05 && sa[v * 3 + 2] / scale < 0.05) {
        const o = k * 6, dz = to[v * 3 + 2] - w[o], dy = to[v * 3 + 1] - w[o + 1];
        const r = Math.hypot(dz, dy), keep = r > w[o + 2] * CAR_BURN.rim ? (w[o + 2] * CAR_BURN.rim) / r : 1;
        to[v * 3 + 1] = w[o + 1] + dy * keep; to[v * 3 + 2] = w[o] + dz * keep;
      }
      to[v * 3 + 1] = Math.max(0, to[v * 3 + 1] - settle);
    }
    // its burnt colours (the burnt build's palette, vehicleMesh.ts shadeVertex, blackened as a fresh burn is): paint,
    // sheet and chrome to soot with oxide mottles and grey ash on the hottest upward panels; glass, rubber and the cabin
    // to soot
    const col0 = (color.array as Float32Array).slice(0, n), col1 = new Float32Array(n);
    const surf0 = (sa as Uint8Array).slice(0, n), surf1 = new Uint8Array(n);
    const na = normal.array as Float32Array, top = t.field.top, belt = car.belt;
    for (let v = 0; v < col0.length / 3; v++) {
      const x = from[v * 3], y = from[v * 3 + 1], z = from[v * 3 + 2], ny = na[v * 3 + 1];
      const rough = surf0[v * 3] / scale, metal = surf0[v * 3 + 1] / scale, paint = surf0[v * 3 + 2] / scale;
      // glass, rubber and the cabin (no metal, no paint; glossy or matte) go to soot
      const soft = metal < 0.05 && paint < 0.05 && (rough < 0.12 || rough > 0.8);
      if (soft) { _burnt[0] = SOOT[0]; _burnt[1] = SOOT[1]; _burnt[2] = SOOT[2]; }
      else {
        // a fresh burn blackens: soot over the burnt paint, oxide brown showing through in mottles, the hottest upward
        // panels (roof, bonnet) burnt to grey ash, soot streaked up the sides over the waist where the flames left
        _burnt[0] = SOOT[0]; _burnt[1] = SOOT[1]; _burnt[2] = SOOT[2];
        mixInto(_burnt, OXIDE, 0.25 + 0.45 * smoothstep(0.4, 0.8, noise3(x * 2.6, y * 2.6, z * 2.6, 303)));
        mixInto(_burnt, RUST, smoothstep(0.55, 0.85, noise3(x * 4.1, y * 4.1, z * 4.1, 307)) * 0.35);
        mixInto(_burnt, ASH, smoothstep(0.45, 0.75, noise3(x * 1.7, y * 1.7, z * 1.7, 301)) * Math.max(0, ny) * 0.8 * smoothstep(belt * 0.7, top, y));
        if (Math.abs(ny) < 0.55) mixInto(_burnt, SOOT, smoothstep(belt * 0.85, top, y) * 0.6);
      }
      // the ground's and the underside's shade (the build's occlusion, which the burnt colours replace)
      const shade = (0.62 + 0.38 * smoothstep(0, 0.85, y)) * (ny < 0 ? 1 + 0.55 * ny : 1);
      col1[v * 3] = _burnt[0] * shade; col1[v * 3 + 1] = _burnt[1] * shade; col1[v * 3 + 2] = _burnt[2] * shade;
      surf1[v * 3] = soft ? 250 : 230; surf1[v * 3 + 1] = soft ? 0 : 13; surf1[v * 3 + 2] = 0;
    }
    const live = new Float32Array(from);
    t.rest = live;
    return { live, from, to, col0, col1, surf0, surf1, coloured: -1, drawn: -1 };
  }

  /** A car's burn at its clock: the char (its colours every CAR_BURN.colourStep of the burn) and the crumple (a share at
   *  the kill, the rest as the fire takes hold; its shape redrawn every CAR_BURN.shapeStep). */
  function carBurnStep(t: CrushTarget): void {
    const cb = t.carBurn, b = t.burn;
    if (!cb || !b) return;
    const e = smoothstep(0, 1, (b.t - CHAR_T0) / CHAR_S);
    if (burnDue(cb.coloured, CAR_BURN.colourStep, e)) {
      cb.coloured = e;
      const color = t.geometry.getAttribute('color') as THREE.BufferAttribute, surf = t.geometry.getAttribute('surf') as THREE.BufferAttribute;
      const ca = color.array as Float32Array, sa = surf.array as Uint8Array;
      for (let i = 0; i < cb.col0.length; i++) {
        ca[i] = cb.col0[i] + (cb.col1[i] - cb.col0[i]) * e;
        sa[i] = Math.round(cb.surf0[i] + (cb.surf1[i] - cb.surf0[i]) * e);
      }
      color.needsUpdate = true; surf.needsUpdate = true;
    }
    if (burnDue(cb.drawn, CAR_BURN.shapeStep, e)) {
      cb.drawn = e;
      const bend = CAR_BURN.impact + (1 - CAR_BURN.impact) * e;
      for (let i = 0; i < cb.live.length; i++) cb.live[i] = cb.from[i] + (cb.to[i] - cb.from[i]) * bend;
      t.dirty = true; t.idle = 0;
      if (t.frozen) { t.frozen = false; t.mesh.frustumCulled = false; }
    }
  }

  /** The paint's char at the burn's clock. */
  function tint(t: CrushTarget): void {
    if (!t.burn || !t.mesh.instanceColor) return;
    const k = Math.max(0, Math.min(1, (t.burn.t - CHAR_T0) / CHAR_S)), e = k * k * (3 - 2 * k);
    _c.setRGB(t.burn.from[0] + (CHAR_RGB[0] - t.burn.from[0]) * e, t.burn.from[1] + (CHAR_RGB[1] - t.burn.from[1]) * e,
      t.burn.from[2] + (CHAR_RGB[2] - t.burn.from[2]) * e);
    t.mesh.setColorAt(0, _c);
    t.mesh.instanceColor.needsUpdate = true;
  }

  /** A dent on the side facing a point (the prop's frame), its strength 0..1. */
  function dentFrom(t: CrushTarget, px: number, py: number, pz: number, strength: number): void {
    const top = t.field.top;
    const cx = Math.max(-t.hw, Math.min(t.hw, px)), cy = Math.max(top * 0.25, Math.min(top * 0.85, py)), cz = Math.max(-t.hl, Math.min(t.hl, pz));
    let dx = cx - px, dy = (cy - py) * 0.3, dz = cz - pz;
    let l = Math.hypot(dx, dy, dz);
    if (!(l > 1e-3)) { dx = -cx; dy = 0; dz = -cz; l = Math.hypot(dx, dz) || 1; }
    addDent(t.field, cx, cy, cz, dx / l, dy / l, dz / l, 0.6 + 0.8 * strength, 0.05 + 0.17 * strength);
  }

  return {
    pressHull(x, z, yaw, halfLength, halfWidth) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const reach = Math.hypot(halfLength, halfWidth) + REACH_PAD_M;
      host.near(x - reach, z - reach, x + reach, z + reach, near);
      for (let n = 0; n < near.length; n++) {
        const index = near[n];
        const have = targets.get(index);
        if (have) { press(have, x, z, fx, fz, halfLength, halfWidth); continue; }
        const rec = host.records[index];
        if (!rec || rec.clutter || rec.dropped || !host.eligible(rec.kind)) continue;
        const dx = rec.x - x, dz = rec.z - z;
        if (dx * dx + dz * dz > (reach + rec.r) * (reach + rec.r)) continue;
        const pool = host.poolOf(rec.kind);
        if (!pool) continue;
        // its box in its own frame: reached by the hull (its glacis' band ahead included)?
        _m.copy(pool.mats4[rec.slot]).invert();
        _v.set(x, rec.y, z).applyMatrix4(_m);
        const cx = _v.x, cz = _v.z;
        _v.set(x + fx, rec.y, z + fz).applyMatrix4(_m);
        let lfx = _v.x - cx, lfz = _v.z - cz;
        const l = Math.hypot(lfx, lfz) || 1;
        lfx /= l; lfz /= l;
        const src = (rec.state ? pool.imB : pool.imI)?.geometry;
        if (!src) continue;
        if (!src.boundingBox) src.computeBoundingBox();
        const b = src.boundingBox!;
        const hw = Math.max(-b.min.x, b.max.x, 0.2), hl = Math.max(-b.min.z, b.max.z, 0.2);
        if (!hullMeetsBox(cx, cz, lfx, lfz, halfLength * l, halfWidth * l, hw, hl)) continue;
        const t = begin(index);
        if (t) press(t, x, z, fx, fz, halfLength, halfWidth);
      }
    },
    takes(index, cause, dirX, dirZ, settled) {
      const have = targets.get(index);
      const rec = host.records[index];
      if (!rec || !host.eligible(rec.kind)) return false;
      if (cause !== 'ram') {
        // a round's kill: a vehicle burns (its char over seconds, never a flip); anything else keeps the pool's broken state
        if (!host.burns?.(rec.kind)) return !!have;
        const t = have ?? begin(index, true);
        if (!t) return false;
        burn(t, dirX, dirZ, settled);
        return true;
      }
      if (have) { if (have.field.vehicle) glassOut(have); return true; }
      // (the record breaks this moment from its intact slot: breakRecord has marked it broken already)
      const t = begin(index, true);
      if (!t) return false;
      if (t.field.vehicle) glassOut(t);
      if (sweeps) {
        // the direction in its own frame
        _v.set(rec.x, rec.y, rec.z).applyMatrix4(t.inverse);
        const ox = _v.x, oz = _v.z;
        _v.set(rec.x + dirX, rec.y, rec.z + dirZ).applyMatrix4(t.inverse);
        t.sweep = { dx: _v.x - ox, dz: _v.z - oz, k: 0 };
        if (settled) {
          for (let s = 0; s <= 24; s++) {
            sweepPose(t.hw, t.hl, t.sweep.dx, t.sweep.dz, s / 24, _pose, !!t.field.vehicle);
            if (pressField(t.field, _pose[0], _pose[1], _pose[2], _pose[3], _pose[4], _pose[5])) t.dirty = true;
          }
          t.sweep = null;
        }
      }
      return true;
    },
    setSweeps(on) { sweeps = on; },
    blast(index, x, y, z, strength) {
      if (!(strength > 0.05)) return;
      const rec = host.records[index];
      if (!rec || !host.burns?.(rec.kind)) return;
      const t = begin(index);
      if (!t) return;
      const k = Math.min(1, strength);
      _v.set(x, y, z).applyMatrix4(t.inverse);
      dentFrom(t, _v.x, _v.y, _v.z, k);
      if (k > 0.12) glassOut(t);
      // the shove: away from the burst, lifted and rocked over, a little turned
      let dx = rec.x - x, dz = rec.z - z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const throwM = 0.08 + 0.7 * k * k;
      const prev = t.shove;
      const settledX = prev ? prev.ox : 0, settledZ = prev ? prev.oz : 0;
      t.shove = { ox: settledX + dx * throwM, oz: settledZ + dz * throwM, lift: 0.3 * k * k, ax: dz, az: -dx, tilt: 0.22 * k,
        yaw: (prev ? prev.yaw : 0) + 0.08 * k * (((index * 2654435761) >>> 0) % 2 ? 1 : -1), t: 0 };
      t.dirty = true; t.idle = 0;
      if (t.frozen) { t.frozen = false; t.mesh.frustumCulled = false; }
    },
    step(dt) {
      // the shoves and the burns in flight
      for (const t of order) {
        if (!t.shove && !(t.burn && !t.burn.swapped)) continue;
        if (t.shove) {
          t.shove.t += Math.max(0, dt);
          if (t.shove.t >= SHOVE_S) {
            // it lies where it was thrown: its frame (the presses' and the dents') follows it there
            t.shove.t = SHOVE_S;
          }
        }
        if (t.burn && !t.burn.swapped) {
          t.burn.t += Math.max(0, dt);
          if (t.carBurn) carBurnStep(t);
          else tint(t);
        }
        place(t);
        t.idle = 0;
        // both settled (a shove thrown, a burn charred): where it lies now is its placement — the presses' and the
        // dents' frame follows it, a later shove builds on it
        const shoveDone = !t.shove || t.shove.t >= SHOVE_S;
        const burnDone = !t.burn || t.burn.swapped || t.burn.t >= CHAR_T0 + CHAR_S;
        if (shoveDone && burnDone) {
          t.mesh.getMatrixAt(0, t.placement);
          t.inverse.copy(t.placement).invert();
          t.shove = null;
          if (t.burn) t.burn.swapped = true;
        }
      }
      // the sweeps in flight
      for (const t of order) {
        if (!t.sweep) continue;
        const k0 = t.sweep.k, k1 = Math.min(1, k0 + Math.max(0, dt) / SWEEP_S);
        // a few presses over the step (a fast sweep must not jump cells)
        for (let s = 1; s <= 3; s++) {
          sweepPose(t.hw, t.hl, t.sweep.dx, t.sweep.dz, k0 + (k1 - k0) * (s / 3), _pose, !!t.field.vehicle);
          if (pressField(t.field, _pose[0], _pose[1], _pose[2], _pose[3], _pose[4], _pose[5])) { t.dirty = true; t.idle = 0; }
        }
        t.sweep.k = k1;
        if (k1 >= 1) t.sweep = null;
      }
      // the redraws, a budget a frame, round robin (a step of 0 — a seek's settle — draws every one at once)
      let drawn = 0;
      const n = order.length, budget = dt > 0 ? REDRAW_MAX : Infinity;
      for (let step = 0; step < n && drawn < budget; step++) {
        const t = order[(cursor + step) % n];
        if (!t.dirty) continue;
        const position = t.geometry.getAttribute('position') as THREE.BufferAttribute;
        const normal = t.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
        deformPositions(t.field, t.rest, position.array as Float32Array);
        position.needsUpdate = true;
        if (normal) {
          flatNormals(position.array as Float32Array, t.tris, normal.array as Float32Array);
          normal.needsUpdate = true;
        }
        t.dirty = false;
        drawn++;
      }
      if (n) cursor = (cursor + drawn) % n;
      // the copies left alone: frozen, culled by their own bounds again
      for (const t of order) {
        if (t.frozen || t.dirty || t.sweep) continue;
        if (++t.idle < FREEZE_FRAMES) continue;
        t.frozen = true;
        t.geometry.computeBoundingBox();
        t.geometry.computeBoundingSphere();
        t.mesh.computeBoundingSphere();
        t.mesh.frustumCulled = true;
      }
    },
    reset() {
      for (const t of order) {
        t.mesh.removeFromParent();
        t.mesh.dispose();
        t.geometry.dispose();
        // the pool's slot back (an intact one: its placement; a broken one empties with the broken pool's reset)
        const rec = host.records[t.index];
        const pool = rec ? host.poolOf(rec.kind) : undefined;
        if (rec && pool?.imI && !t.fromBroken) {
          pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
          pool.imI.instanceMatrix.needsUpdate = true;
        }
      }
      targets.clear();
      order.length = 0;
      cursor = 0;
    },
    stats() {
      let deforming = 0, frozen = 0;
      for (const t of order) { if (t.frozen) frozen++; else deforming++; }
      return { copies: order.length, deforming, frozen };
    },
  };
}

/** Whether a burn's update last made at share `last` (−1: none) is due again at share `e`, every `step` and at its end. */
function burnDue(last: number, step: number, e: number): boolean {
  return last < 0 || (last < 1 && (e >= 1 || e - last >= step));
}

/** Mix colour `o` toward `c` by `k` (in place). */
function mixInto(o: [number, number, number], c: readonly [number, number, number], k: number): void {
  o[0] += (c[0] - o[0]) * k; o[1] += (c[1] - o[1]) * k; o[2] += (c[2] - o[2]) * k;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** A lattice hash in [0, 1). */
function hash01(i: number, j: number, k: number, seed: number): number {
  let h = Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663) ^ Math.imul(k | 0, 83492791) ^ Math.imul(seed | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) over the unit lattice (the burn's mottle; once per vertex at a kill). */
function noise3(x: number, y: number, z: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  return lerp(
    lerp(lerp(hash01(i, j, k, seed), hash01(i + 1, j, k, seed), u), lerp(hash01(i, j + 1, k, seed), hash01(i + 1, j + 1, k, seed), u), v),
    lerp(lerp(hash01(i, j, k + 1, seed), hash01(i + 1, j, k + 1, seed), u), lerp(hash01(i, j + 1, k + 1, seed), hash01(i + 1, j + 1, k + 1, seed), u), v),
    w);
}
