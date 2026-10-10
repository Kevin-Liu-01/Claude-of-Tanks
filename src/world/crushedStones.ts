/**
 * crushedStones.ts — what a crushed stone leaves behind (the hitbox lane, 2026-10-10).
 *
 * A stone a hull crushes (props.ts: a crushable small rock, CrushableClutter 'small-rock') used to collapse to a
 * seventh of its height, a pancake that read as gone a few metres off. The coordinator's condition on r3's crushable
 * low stones: a crushed stone reads physically. It splits and presses into the ground, leaving fragments and a scuff
 * that persist, and it never just vanishes. So a crush lays:
 *  - the stone itself, pressed into its ground: the middle of it, half its width across the split, two fifths of its
 *    height, sunk and turned to the ground's slope (crushedStoneLayout `body`, the stone's own instance);
 *  - the two flakes split off it, one either side of the split, each tipped outward with its outer edge in the ground;
 *  - three chips thrown up to a reach and a half round it;
 *  - its scuff: props.ts darkens the contact layer's disc under it once it is crushed.
 * All of it is hashed from the stone's place, so every client lays the same pieces and a late joiner's settled crush
 * lays them at once. The flakes and chips draw from one instanced pool a rock form (StonePiecePool). A crushed stone
 * takes a block of the pool's slots, a rematch (setCrushed(false)) hides them, and the pool draws nothing at all while
 * no stone is crushed. Nothing runs a frame: a crush writes its block once.
 */
import * as THREE from 'three';

/** The pieces a crushed stone throws into the pool: two flakes and three chips. */
export const STONE_PIECES = 5;
/** The pressed stone: the share of its width it keeps across the split and along it, the share of its exposed height it
 *  keeps over the ground, and the share of that it is sunk. */
const BODY_ACROSS = 0.52;
const BODY_ALONG = 0.86;
const BODY_RISE = 0.42;
const BODY_SINK = 0.3;
/** A flake: its width across the split and along it (shares of the stone's reach), its rise (a share of the stone's
 *  exposed height), where it lies (a share of the reach out from the centre: clear of the body, a crack between them)
 *  and its outward tip (radians). */
const FLAKE_ACROSS = 0.36;
const FLAKE_ALONG = 0.7;
const FLAKE_RISE = 0.34;
const FLAKE_OUT = 0.94;
const FLAKE_TIP_MIN = 0.24;
const FLAKE_TIP_SPAN = 0.2;
/** A chip: its size (m across: a share of the reach, at most a share of the stone's exposed height, clamped), its height
 *  (a share of its size, at most a share of the exposed height: a chip never stands over the pressed stone), and how far
 *  out it lands (shares of the reach). */
const CHIP_SHARE = 0.26;
const CHIP_RISE_SHARE = 0.9;
const CHIP_TOP_SHARE = 0.4;
const CHIP_MIN_M = 0.1;
const CHIP_MAX_M = 0.34;
const CHIP_HEIGHT = 0.7;
const CHIP_OUT_MIN = 1.0;
const CHIP_OUT_SPAN = 0.6;

/** A rock form's own extents (unit scale): its reach round its axis and its top over its seat line. */
export interface StoneForm {
  readonly halfLocal: number;
  readonly topLocal: number;
}

/** The extents of a rock form's geometry (the boulder forms seat at y = 0: rockDressing.ts BOULDER_SEAT_Y). */
export function stoneFormOf(geometry: THREE.BufferGeometry): StoneForm {
  const position = geometry.getAttribute('position');
  let half = 0, top = 0;
  for (let i = 0; i < position.count; i++) {
    half = Math.max(half, Math.hypot(position.getX(i), position.getZ(i)));
    top = Math.max(top, position.getY(i));
  }
  return { halfLocal: Math.max(1e-3, half), topLocal: Math.max(1e-3, top) };
}

/** One piece: its matrix, the ground under its centre and that ground's slope (the rock shader's aRockGround and
 *  aRockSlope: its soil skirt and contact darkening meet the ground all round). */
export interface StonePiece {
  readonly matrix: THREE.Matrix4;
  ground: number;
  gx: number;
  gz: number;
}

export interface CrushedStoneLayout {
  /** The stone's own instance, pressed. */
  readonly body: THREE.Matrix4;
  /** The flakes and the chips. */
  readonly pieces: StonePiece[];
}

function hash01(x: number, z: number, k: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _out = new THREE.Vector3();
const _slope = new THREE.Quaternion();
const _tip = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _test = new THREE.Vector3();

/** The ground's gradient at a place, across a span (m). */
function gradientAt(heightAt: (x: number, z: number) => number, x: number, z: number, span: number, out: { gx: number; gz: number }): void {
  const r = Math.max(0.25, span);
  out.gx = (heightAt(x + r, z) - heightAt(x - r, z)) / (2 * r);
  out.gz = (heightAt(x, z + r) - heightAt(x, z - r)) / (2 * r);
}

/**
 * Write a piece lying on the ground at (x, z): turned `yaw` about the vertical, tipped `tip` about the horizontal axis
 * `ax, az` (the side `ox, oz` going down when it is set), seated on the ground's slope, its seat line `sink` metres under
 * the ground.
 */
function layPiece(
  piece: StonePiece, heightAt: (x: number, z: number) => number, x: number, z: number, yaw: number,
  tip: number, ax: number, az: number, ox: number, oz: number, sx: number, sy: number, sz: number, sink: number, span: number,
): void {
  const ground = heightAt(x, z);
  gradientAt(heightAt, x, z, span, piece);
  piece.ground = ground;
  _n.set(-piece.gx, 1, -piece.gz).normalize();
  _slope.setFromUnitVectors(UP, _n);
  _yaw.setFromAxisAngle(UP, yaw);
  _tip.identity();
  if (tip !== 0) {
    _axis.set(ax, 0, az).normalize();
    _tip.setFromAxisAngle(_axis, tip);
    // the outward side goes down: flip the turn when it would lift it
    _test.set(ox, 0, oz).applyQuaternion(_tip);
    if (_test.y > 0) _tip.setFromAxisAngle(_axis, -tip);
  }
  _q.copy(_slope).multiply(_tip).multiply(_yaw);
  _out.set(x, ground - sink, z);
  piece.matrix.compose(_out, _q, _s.set(sx, sy, sz));
}

export function createCrushedStoneLayout(): CrushedStoneLayout {
  const pieces: StonePiece[] = [];
  for (let k = 0; k < STONE_PIECES; k++) pieces.push({ matrix: new THREE.Matrix4(), ground: 0, gx: 0, gz: 0 });
  return { body: new THREE.Matrix4(), pieces };
}

/**
 * Lay a crushed stone from its standing instance `home` (its place, turn and scale) and its rock form: the pressed body
 * and the pieces, into `out`. Deterministic in the stone's place.
 */
export function crushedStoneLayout(
  home: THREE.Matrix4, form: StoneForm, heightAt: (x: number, z: number) => number, out: CrushedStoneLayout,
): CrushedStoneLayout {
  home.decompose(_p, _q, _s);
  const x = _p.x, z = _p.z;
  const width = Math.max(_s.x, _s.z);
  const reach = form.halfLocal * width;
  // the stone's exposed height: its top over the ground at its centre (at least a hand)
  const rise = Math.max(0.15, _p.y + form.topLocal * _s.y - heightAt(x, z));
  // the split runs along d; n is across it (the flakes fall either way along n)
  const yaw = hash01(x, z, 1) * Math.PI * 2;
  const nx = Math.cos(yaw), nz = -Math.sin(yaw); // the turned form's local +x
  const dx = Math.sin(yaw), dz = Math.cos(yaw); // its local +z
  const scaleOf = (metresAcross: number): number => metresAcross / form.halfLocal;
  const heightOf = (metres: number): number => metres / form.topLocal;
  // the body: the middle of the stone, pressed
  const bodyRise = rise * BODY_RISE;
  const body: StonePiece = { matrix: out.body, ground: 0, gx: 0, gz: 0 };
  layPiece(body, heightAt, x, z, yaw, (hash01(x, z, 2) - 0.5) * 0.16, dx, dz, nx, nz,
    scaleOf(reach * BODY_ACROSS), heightOf(bodyRise * (1 + BODY_SINK)), scaleOf(reach * BODY_ALONG), bodyRise * BODY_SINK, reach);
  // the flakes: either side of the split, tipped out
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    const jitter = (hash01(x, z, 3 + side) - 0.5) * 0.5;
    const ox = nx * sign, oz = nz * sign;
    const at = reach * (FLAKE_OUT + 0.08 * hash01(x, z, 5 + side));
    const flakeRise = rise * FLAKE_RISE * (0.85 + 0.3 * hash01(x, z, 7 + side));
    layPiece(out.pieces[side], heightAt, x + ox * at, z + oz * at, yaw + jitter,
      FLAKE_TIP_MIN + FLAKE_TIP_SPAN * hash01(x, z, 9 + side), dx, dz, ox, oz,
      scaleOf(reach * FLAKE_ACROSS), heightOf(flakeRise * 1.25), scaleOf(reach * FLAKE_ALONG), flakeRise * 0.25, reach * FLAKE_ALONG);
  }
  // the chips: thrown round it
  const chip = Math.min(CHIP_MAX_M, Math.max(CHIP_MIN_M, Math.min(reach * CHIP_SHARE, rise * CHIP_RISE_SHARE)));
  const chipTop = rise * CHIP_TOP_SHARE;
  for (let k = 0; k < STONE_PIECES - 2; k++) {
    const a = yaw + ((k + 0.5) / (STONE_PIECES - 2)) * Math.PI * 2 + (hash01(x, z, 11 + k) - 0.5) * 1.2;
    const r = reach * (CHIP_OUT_MIN + CHIP_OUT_SPAN * hash01(x, z, 15 + k));
    const size = chip * (0.75 + 0.5 * hash01(x, z, 19 + k));
    const tall = Math.min(size * CHIP_HEIGHT, chipTop);
    const ox = Math.cos(a), oz = Math.sin(a);
    layPiece(out.pieces[2 + k], heightAt, x + ox * r, z + oz * r, hash01(x, z, 23 + k) * Math.PI * 2,
      0.5 * hash01(x, z, 27 + k), -oz, ox, ox, oz,
      scaleOf(size * 0.5), heightOf(tall * 1.2), scaleOf(size * 0.5), tall * 0.2, size);
  }
  return out;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The crushed stones' flakes and chips, one rock form: an instanced pool of STONE_PIECES slots a stone, sharing the
 * form's vertex attributes (its own ground and slope a slot). A stone's first crush takes the next block; a rematch hides
 * it and keeps it; when no stone is crushed the pool empties (count 0, not drawn).
 */
export class StonePiecePool {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  private readonly ground: THREE.InstancedBufferAttribute;
  private readonly slope: THREE.InstancedBufferAttribute;
  private readonly blocks = new Map<object, number>();
  private readonly shown = new Set<object>();
  private next = 0;

  constructor(source: THREE.BufferGeometry, material: THREE.Material, stones: number, name: string) {
    const geometry = new THREE.BufferGeometry();
    for (const [key, attribute] of Object.entries(source.attributes)) {
      if (!(attribute instanceof THREE.InstancedBufferAttribute)) geometry.setAttribute(key, attribute);
    }
    geometry.setIndex(source.index);
    this.capacity = Math.max(1, stones) * STONE_PIECES;
    this.ground = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.slope = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 2), 2);
    geometry.setAttribute('aRockGround', this.ground);
    geometry.setAttribute('aRockSlope', this.slope);
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = 0;
    this.mesh.visible = false;
    // (its pieces lie anywhere on the map: drawn only while a stone is crushed, never culled by stale bounds)
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = name;
  }

  /** The stones whose pieces lie now. */
  get crushed(): number { return this.shown.size; }

  /** Lay a stone's pieces (its first crush takes a block); false when the pool is full. */
  show(owner: object, pieces: readonly StonePiece[]): boolean {
    if (this.shown.has(owner)) return true;
    let first = this.blocks.get(owner);
    if (first === undefined) {
      if (this.next + STONE_PIECES > this.capacity) return false;
      first = this.next;
      this.next += STONE_PIECES;
      this.blocks.set(owner, first);
    }
    for (let k = 0; k < STONE_PIECES; k++) {
      const piece = pieces[k];
      this.mesh.setMatrixAt(first + k, piece.matrix);
      this.ground.setX(first + k, piece.ground);
      this.slope.setXY(first + k, piece.gx, piece.gz);
    }
    this.touch(first);
    this.shown.add(owner);
    this.mesh.count = this.next;
    this.mesh.visible = true;
    return true;
  }

  /** Hide a stone's pieces (a rematch); the pool empties when none is left. */
  hide(owner: object): void {
    if (!this.shown.delete(owner)) return;
    const first = this.blocks.get(owner)!;
    for (let k = 0; k < STONE_PIECES; k++) this.mesh.setMatrixAt(first + k, ZERO);
    this.touch(first);
    if (this.shown.size === 0) {
      this.blocks.clear();
      this.next = 0;
      this.mesh.count = 0;
      this.mesh.visible = false;
    }
  }

  private touch(first: number): void {
    this.mesh.instanceMatrix.addUpdateRange(first * 16, STONE_PIECES * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ground.addUpdateRange(first, STONE_PIECES);
    this.ground.needsUpdate = true;
    this.slope.addUpdateRange(first * 2, STONE_PIECES * 2);
    this.slope.needsUpdate = true;
  }
}

/** A scuff's source: its disc's vertices as laid at the build (conformed to the drawn ground), kept until its crush. */
interface ScuffSource { position: Float32Array; uv: Float32Array; color: Float32Array }

/**
 * The crushed stones' scuffs: one mesh of disc slots drawn with the contact layer's own material (the ground under it
 * darkened, never a soil of its own), every stone's disc conformed at the build and kept aside; a stone's first crush
 * lays its disc in the next slot, a rematch folds it to a point, and the mesh draws nothing while no stone lies crushed
 * (its draw range ends at the last slot taken).
 */
export class StoneScuffPool {
  readonly mesh: THREE.Mesh;
  private readonly sources = new Map<object, ScuffSource>();
  private readonly blocks = new Map<object, number>();
  private readonly shown = new Set<object>();
  private position: THREE.BufferAttribute | null = null;
  private uv: THREE.BufferAttribute | null = null;
  private color: THREE.BufferAttribute | null = null;
  private verts = 0;
  private indices = 0;
  private template: number[] = [];
  private next = 0;

  constructor(material: THREE.Material, name: string) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = name;
  }

  /** A stone's disc (indexed, with position, uv and an RGBA color), laid at the build; every disc the same layout. */
  register(owner: object, disc: THREE.BufferGeometry): void {
    const index = disc.getIndex();
    const position = disc.getAttribute('position'), uv = disc.getAttribute('uv'), color = disc.getAttribute('color');
    if (!index || !position || !uv || !color) throw new Error('crushedStones: a scuff disc needs an index, position, uv and color');
    if (!this.verts) {
      this.verts = position.count;
      this.indices = index.count;
      this.template = Array.from(index.array as ArrayLike<number>);
    } else if (position.count !== this.verts || index.count !== this.indices) throw new Error('crushedStones: scuff discs differ');
    this.sources.set(owner, {
      position: Float32Array.from(position.array as ArrayLike<number>),
      uv: Float32Array.from(uv.array as ArrayLike<number>),
      color: Float32Array.from(color.array as ArrayLike<number>),
    });
  }

  /** Close the registrations: the slots for every registered stone (nothing drawn yet). */
  seal(): void {
    const stones = this.sources.size;
    if (!stones) return;
    const geometry = this.mesh.geometry;
    this.position = new THREE.BufferAttribute(new Float32Array(stones * this.verts * 3), 3);
    this.uv = new THREE.BufferAttribute(new Float32Array(stones * this.verts * 2), 2);
    this.color = new THREE.BufferAttribute(new Float32Array(stones * this.verts * 4), 4);
    const index = new (stones * this.verts > 65535 ? Uint32Array : Uint16Array)(stones * this.indices);
    for (let b = 0; b < stones; b++) for (let i = 0; i < this.indices; i++) index[b * this.indices + i] = this.template[i] + b * this.verts;
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('uv', this.uv);
    geometry.setAttribute('color', this.color);
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
  }

  /** The stones whose scuffs lie now. */
  get crushed(): number { return this.shown.size; }

  /** Lay a stone's scuff (its first crush takes a slot); false when it has none. */
  show(owner: object): boolean {
    if (this.shown.has(owner)) return true;
    const source = this.sources.get(owner);
    if (!source || !this.position || !this.uv || !this.color) return false;
    let block = this.blocks.get(owner);
    if (block === undefined) { block = this.next++; this.blocks.set(owner, block); }
    const at = block * this.verts;
    (this.position.array as Float32Array).set(source.position, at * 3);
    (this.uv.array as Float32Array).set(source.uv, at * 2);
    (this.color.array as Float32Array).set(source.color, at * 4);
    this.touch(at);
    this.shown.add(owner);
    this.mesh.geometry.setDrawRange(0, this.next * this.indices);
    this.mesh.visible = true;
    return true;
  }

  /** Fold a stone's scuff to a point (a rematch); the mesh draws nothing when none is left. */
  hide(owner: object): void {
    if (!this.shown.delete(owner) || !this.position) return;
    const at = this.blocks.get(owner)! * this.verts;
    const p = this.position.array as Float32Array;
    for (let i = 1; i < this.verts; i++) p.copyWithin((at + i) * 3, at * 3, at * 3 + 3);
    this.touch(at);
    if (this.shown.size === 0) {
      this.blocks.clear();
      this.next = 0;
      this.mesh.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
    }
  }

  private touch(at: number): void {
    for (const [attribute, size] of [[this.position, 3], [this.uv, 2], [this.color, 4]] as const) {
      attribute!.addUpdateRange(at * size, this.verts * size);
      attribute!.needsUpdate = true;
    }
  }
}
