// (2026-11-02 audit M9) The felled-tree transition: one owner for the one fact "this tree is down".
//
// A felled tree was three sets of flags with two reset paths: the tree record (`crushed`, its upright and fallen pose)
// and its trunk's collision record (`crushed`, `dead`) in vegetation.ts, reset by resetToppled; its canopy's concealment
// discs (`dead`) in sim/spotting.ts, felled by each authority's step and reset only by the solo battle's setup — so a
// reset that ran one and not the other (the Studio's scene reset) left a standing tree that hid nothing. Its upright pose
// was captured once ever, so a tree a crater had re-seated before its first fall came back with the crater's lift; and
// two drivers (the frame's update and the Studio's timeline) could both advance one fall in a frame.
//
// Here: fell(record) fells the tree, its trunk's records (collision.ts setCrushedRecords, the props' transition) and its
// canopy's discs (spotting.ts fellConcealersAt, the law both authorities use) together; restoreAll() stands every one
// of them again; the upright pose is the tree's placement before any crater lift (craterBase), taken at each fall; a fall
// is advanced by one driver a frame (the Studio's timeline, when it drives one, else the frame's update).
import * as THREE from 'three';
import { setCrushedRecords, type CollisionRecord } from './collision.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { fellConcealersAt, restoreConcealers, type ConcealerDisc } from '../sim/spotting.ts';

/** A placed tree as the fall moves it (vegetation.ts TreeRecord). */
export interface FellableTree {
  x: number;
  z: number;
  mat: THREE.Matrix4;
  crushed?: boolean;
  /** Its placement, the pose it stands in again (the last fall's; a crater's lift never in it). */
  uprightMat?: THREE.Matrix4;
  /** The placement before a crater re-seated the trunk (groundCoverCraters.ts reseatCraterTrees). */
  craterBase?: THREE.Matrix4;
  fallH?: number;
  fallR?: number;
}

/** A trunk's collision record (vegetation.ts TreeObstacle): one record in both the movement and the shell lists. */
export interface FellableTreeRecord extends CollisionRecord {
  treeIdx: number;
}

export interface FelledTreesHost<T extends FellableTree> {
  readonly trees: readonly T[];
  /** Every trunk's record (reset stands them all). */
  readonly records: readonly FellableTreeRecord[];
  /** The world's concealment discs (the canopies' among them). */
  readonly concealers: readonly ConcealerDisc[];
  readonly heightField: { getHeightAt(x: number, z: number): number };
  /** Write a tree's pose to its drawn instances. */
  write(tree: T): void;
  /** A fall's pose moved (the near tier's heights follow). */
  poseChanged(): void;
  /** A tree went down or stood up (the near tier's cull follows). */
  standingChanged(): void;
}

/** Who advances the falls: the frame's update, or an external timeline (the Studio's). */
export type FallDriver = 'frame' | 'timeline';

export interface FelledTrees<T extends FellableTree> {
  /** Fell the trunk's tree toward (dx, dz): `settled` lays it at its final pose at once. False when it is down already. */
  fell(record: FellableTreeRecord, dx: number, dz: number, settled?: boolean): boolean;
  /** Every tree, trunk record and canopy disc standing again; no fall in flight. */
  restoreAll(): void;
  /** Advance the falls by `dt` from `driver`; the frame's update yields to a timeline that drove them since its last call. */
  advance(dt: number, driver: FallDriver): void;
  /** Falls in flight. */
  readonly falling: number;
  /** (receipts) the falls in flight: each tree, its pivot and the pose it falls from. */
  readonly _falls: readonly Readonly<Pick<FallAnimation<T>, 't' | 'base' | 'x' | 'y' | 'z'>>[];
}

interface FallAnimation<T> {
  t: T;
  base: THREE.Matrix4;
  x: number;
  y: number;
  z: number;
  ax: number;
  az: number;
  u: number;
  maxAng: number;
}

export function createFelledTrees<T extends FellableTree>(host: FelledTreesHost<T>): FelledTrees<T> {
  const anims: FallAnimation<T>[] = [];
  const _q = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _m1 = new THREE.Matrix4();
  const _m2 = new THREE.Matrix4();
  let timelineDrove = false;

  function fell(record: FellableTreeRecord, dx: number, dz: number, settled = false): boolean {
    const t = host.trees[record.treeIdx];
    if (!t || t.crushed) return false;
    (t.uprightMat ??= new THREE.Matrix4()).copy(t.craterBase ?? t.mat);
    t.crushed = true;
    host.standingChanged(); // trees perf: a falling tree draws from the next update wherever it stood (nearTreeInVolume)
    setCrushedRecords([record], [record], true);
    if (record.shape2) fellConcealersAt(host.concealers, record.shape2.cx, record.shape2.cz);
    setToppleAxis(_axis, dx, dz);
    anims.push({
      t, base: t.mat.clone(), x: t.x, y: record.min[1], z: t.z,
      ax: _axis.x, az: _axis.z, u: settled ? 1.1 : 0,
      maxAng: settledToppleAngle(host.heightField, t.x, record.min[1], t.z, dx, dz, t.fallH!, t.fallR!),
    });
    return true;
  }

  function restoreAll(): void {
    host.poseChanged();
    anims.length = 0;
    timelineDrove = false;
    host.standingChanged(); // trees perf: the righted trees are culled again from the next update
    for (const record of host.records) {
      setCrushedRecords([record], [record], false);
      const t = host.trees[record.treeIdx];
      if (!t || !t.crushed || !t.uprightMat) continue;
      t.crushed = false;
      t.mat.copy(t.uprightMat);
      host.write(t);
    }
    restoreConcealers(host.concealers);
  }

  function step(dt: number): void {
    host.poseChanged(); // a falling trunk's matrix is rewritten each tick
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k]!;
      a.u = Math.min(a.u + dt / 1.15, 1.1);
      const e = Math.min(a.u / 0.82, 1);
      // Terrain-seated fall along the ram direction + a small settle bounce.
      let ang = a.maxAng * e * e * (3 - 2 * e);
      if (a.u > 0.82) ang = a.maxAng - 0.035 * Math.sin((a.u - 0.82) * 17) * Math.exp(-(a.u - 0.82) * 5.5);
      _axis.set(a.ax, 0, a.az).normalize();
      _q.setFromAxisAngle(_axis, ang);
      a.t.mat.makeTranslation(a.x, a.y, a.z)
        .multiply(_m1.makeRotationFromQuaternion(_q))
        .multiply(_m2.makeTranslation(-a.x, -a.y, -a.z))
        .multiply(a.base);
      host.write(a.t);
      if (a.u >= 1.1) anims.splice(k, 1); // final pose persists in t.mat
    }
  }

  function advance(dt: number, driver: FallDriver): void {
    if (driver === 'timeline') timelineDrove = true;
    else if (timelineDrove) { timelineDrove = false; return; } // the timeline drove the falls since the last frame
    if (anims.length) step(dt);
  }

  return { fell, restoreAll, advance, get falling() { return anims.length; }, get _falls() { return anims; } };
}
