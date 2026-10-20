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
 */
import * as THREE from 'three';
import { addDent, createCrushField, deformPositions, flatNormals, hullMeetsBox, pressField, sweepPose, type CrushField } from './propCrush.ts';

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
  /** A prop began burning at (x, y, z), `heightM` tall (the fire and smoke the effects raise over it). */
  onBurn?(x: number, y: number, z: number, heightM: number): void;
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

interface CrushTarget {
  readonly index: number;
  readonly kind: string;
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly rest: Float32Array;
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
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    (geometry.getAttribute('normal') as THREE.BufferAttribute | undefined)?.setUsage(THREE.DynamicDrawUsage);
    const material = source.mesh.material;
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
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
      index, kind: rec.kind, mesh, geometry, rest: (src.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
      field: createCrushField(hw, hl, box.max.y, undefined, host.cloth?.(rec.kind) ?? false, pool.meta?.crushFloor ?? 0), inverse: new THREE.Matrix4().copy(matrix).invert(), fromBroken: source.broken,
      hw, hl, dirty: false, idle: 0, frozen: false, sweep: null,
      placement: matrix.clone(), shove: null, glassOut: false, rammed: false, burn: null,
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
      // a burnt body settles onto its rims as its tyres go (until that is baked into its placement)
      if (t.burn && !t.burn.swapped) oy -= 0.12 * Math.min(1, Math.max(0, (t.burn.t - CHAR_T0) / CHAR_S));
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
    if (!settled && rec) host.onBurn?.(rec.x, rec.y, rec.z, t.field.top);
    tint(t);
    t.dirty = true; t.idle = 0;
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
      if (have) return true;
      // (the record breaks this moment from its intact slot: breakRecord has marked it broken already)
      const t = begin(index, true);
      if (!t) return false;
      if (sweeps) {
        // the direction in its own frame
        _v.set(rec.x, rec.y, rec.z).applyMatrix4(t.inverse);
        const ox = _v.x, oz = _v.z;
        _v.set(rec.x + dirX, rec.y, rec.z + dirZ).applyMatrix4(t.inverse);
        t.sweep = { dx: _v.x - ox, dz: _v.z - oz, k: 0 };
        if (settled) {
          for (let s = 0; s <= 24; s++) {
            sweepPose(t.hw, t.hl, t.sweep.dx, t.sweep.dz, s / 24, _pose);
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
        if (t.burn && !t.burn.swapped) { t.burn.t += Math.max(0, dt); tint(t); }
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
          sweepPose(t.hw, t.hl, t.sweep.dx, t.sweep.dz, k0 + (k1 - k0) * (s / 3), _pose);
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
          flatNormals(position.array as Float32Array, t.geometry.index ? t.geometry.index.array : null, normal.array as Float32Array);
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
