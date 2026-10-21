// Round 75 (2026-09-26): the yard clutter kit — one merged, instance-ready geometry per dressing family for the
// planner's placements (world/yardDressing.ts). Since props lane A's #2 (2026-10-14) every family is built from the
// map's own clutter forms (its pallets, crates and cable drums; drums, tanks and skips painted pale, so the instance
// colour is the livery) on the vertex-colour material. Every piece stands on y = 0 in its own frame and keeps inside
// the planner's family radius. First-party generated geometry; no model is loaded.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { YardFamily } from '../yardDressing.ts';
import { hexLin, mul, type Mesh as CraftMesh, type Rgb, type V3 } from './craftMesh.ts';
import { bar, crateNear, drumNear, extrude, finish, lathe, newMesh, palletNear, place, tip, type PalletForm } from './clutterForms.ts';
import { spoolNear } from './clutterLooseForms.ts';
import { crateFormOf, palletFormOf, spoolFormOf } from './clutterKit.ts';

export type YardMaterial = 'steel' | 'wood' | 'baked';

interface YardFamilyGeometry {
  family: YardFamily;
  material: YardMaterial;
  geometry: THREE.BufferGeometry;
  triangles: number;
}

/** Livery colourways (authored sRGB) an instance colour selects by the placement's variant. */
export const YARD_LIVERIES: Readonly<Record<'brownfield' | 'polar' | 'martian' | 'lunar', Readonly<Record<'drum' | 'skip' | 'fuelTank', readonly number[]>>>> = Object.freeze({
  brownfield: {
    drum: [0x4a6fa8, 0x9a4634, 0x66744d, 0x878c91, 0xd8702a, 0x3d3f42, 0xbfa676, 0x4c7a76],
    skip: [0x66744d, 0x9a4634, 0xd8702a, 0x3d5d84],
    fuelTank: [0xcfcfc9, 0x9aa39c, 0x9a4634, 0x66744d],
  },
  polar: {
    drum: [0xd8702a, 0x4a6fa8, 0xdedfda, 0x8f959a, 0xb85a30, 0x3d3f42, 0x6e8b57, 0xd8702a],
    skip: [0xd8702a, 0x4a6fa8, 0x8f959a, 0x66744d],
    fuelTank: [0xdedfda, 0xd8702a, 0x9aa39c, 0x8f959a],
  },
  martian: {
    drum: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8, 0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
    skip: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
    fuelTank: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
  },
  // (the Earthrise 228 rebuild) a lunar station's canisters and dewars: dusted white, safety orange, steel, the dust's grey
  lunar: {
    drum: [0xdedcd6, 0xd46f2a, 0x9a978f, 0xbdb8ae, 0xdedcd6, 0x8d8a84, 0xdedcd6, 0xd46f2a],
    skip: [0xdedcd6, 0xd46f2a, 0x9a978f, 0xbdb8ae],
    fuelTank: [0xeceae4, 0xdedcd6, 0xd46f2a, 0xbdb8ae],
  },
});

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const expanded = parts.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const merged = mergeGeometries(expanded, false);
  if (!merged) throw new Error('yard clutter: merge produced no geometry');
  for (const geo of new Set([...parts, ...expanded])) if (geo !== merged) geo.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------------------------- the map's own forms
// (props lane A, family #2, 2026-10-14; WORKLIST.md #2: "tyres as tori with shoulders and tread; skips with ribs,
// lifting lugs and chains; fuel tanks on saddles with bands and fittings") — each family built from the clutter kinds'
// forms in the map's make (its pallets, its crates, its cable drums: clutterKit.ts), on the vertex-colour material; the
// steel families painted pale so the instance livery is their paint.

const WHITE = hexLin(0xd8d8d4), HOOP = hexLin(0x8a8a86), HEAD = hexLin(0xc8c8c4);
const YARD_DRUM = { shell: WHITE, hoop: HOOP, head: HEAD, rust: 0.12 };
const RUBBER = hexLin(0x1e1f20);

function at(g: THREE.BufferGeometry, yaw: number, x: number, y: number, z: number, s = 1): THREE.BufferGeometry {
  if (s !== 1) g.scale(s, s, s);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

/** A stacked pallet below the top one: its deck's edge and its blocks or stringers, its bottom boards (the deck's face
 *  is under the next). `ease` the arrises of its deck and bottom boards (0: the legacy stack's plain slabs). */
function palletLayer(m: CraftMesh, f: PalletForm, y: number, yaw: number, dx: number, dz: number, ease = 0): void {
  const from = m.mark, W = f.kind === 'gma' ? 1.22 : 1.2, D = f.kind === 'gma' ? 1.02 : 0.8;
  bar(m, [-W / 2, y + 0.133, 0], [W / 2, y + 0.133, 0], D, 0.022, [0, 0, 1], f.wood, ease * 0.6, false);
  // (above the lowest, a pallet's bottom boards lie on the deck under it: its blocks reach down to that deck)
  const foot = y === 0 ? 0.022 : 0;
  for (const z of [-D / 2, D / 2]) for (const x of [-W / 2 + 0.07, 0, W / 2 - 0.07]) bar(m, [x, y + foot, z], [x, y + 0.122, z], 0.13, 0.1, [1, 0, 0], f.dark, 0, true);
  if (y === 0) bar(m, [-W / 2, 0.011, 0], [W / 2, 0.011, 0], D * 0.9, 0.022, [0, 0, 1], mul(f.wood, 0.92), ease * 0.6, false);
  place(m, from, yaw, dx, 0, dz);
}
function palletStack(f: PalletForm, count: number, ease: number): THREE.BufferGeometry {
  const m = newMesh();
  for (let k = 0; k + 1 < count; k++) palletLayer(m, f, k * 0.144, Math.sin(k * 3.1) * 0.06, Math.sin(k * 2.7) * 0.04, Math.cos(k * 1.9) * 0.03, ease);
  const k = count - 1;
  return merge([finish(m), at(palletNear(f, mulberry(0x9a11e7 + count)), Math.sin(k * 3.1) * 0.06, Math.sin(k * 2.7) * 0.04, k * 0.144, Math.cos(k * 1.9) * 0.03)]);
}
/**
 * (the r2 sweep, 2026-10-16: the stacks graded box share 0.90, their lower pallets' decks, blocks and bottom boards plain
 * boxes) The stack drawn with its lower pallets' decks and bottom boards eased (6 mm arrises: the slabs were the stack's
 * area), its record the legacy stack's: Lane C's break path (smallPropBreak.ts breakableSmallProp, PRP-02) makes the
 * piece's record from every `max(1, floor(n / 400))`-th entry of its position attribute — the hull, the heights and the
 * centre of those samples — so the drawn stack is indexed over a pool of the legacy stack's length whose sampled entries
 * keep the legacy positions (the record, the clutter's centre and reach byte for byte); a drawn vertex standing on a
 * sample takes that entry, the rest take the others.
 */
function palletStackOf(mapId: string | undefined, count: number): THREE.BufferGeometry {
  const f = (mapId && palletFormOf(mapId)) || palletFormOf('railyard')!;
  const legacy = palletStack(f, count, 0), eased = palletStack(f, count, 0.01), drawn = mergeVertices(eased);
  const pooled = withRecordOf(legacy, drawn);
  legacy.dispose(); eased.dispose(); drawn.dispose();
  return pooled;
}

/** `drawn` (indexed, its shared corners welded) indexed over a pool of `legacy`'s length whose record samples (every
 *  stride-th entry) keep `legacy`'s positions. */
function withRecordOf(legacy: THREE.BufferGeometry, drawn: THREE.BufferGeometry): THREE.BufferGeometry {
  const lp = legacy.getAttribute('position'), size = lp.count, s = Math.max(1, Math.floor(size / 400));
  const names = Object.keys(drawn.attributes), dp = drawn.getAttribute('position'), verts = dp.count;
  const key = (x: number, y: number, z: number) => `${Math.fround(x)},${Math.fround(y)},${Math.fround(z)}`;
  // the samples by position (the unassigned ones a drawn vertex standing there may take)
  const open = new Map<string, number[]>();
  for (let slot = 0; slot < size; slot += s) {
    const k = key(lp.getX(slot), lp.getY(slot), lp.getZ(slot));
    const list = open.get(k);
    if (list) list.push(slot); else open.set(k, [slot]);
  }
  const slotOf = new Int32Array(verts).fill(-1), taken = new Uint8Array(size);
  for (let v = 0; v < verts; v++) {
    const list = open.get(key(dp.getX(v), dp.getY(v), dp.getZ(v)));
    const slot = list?.pop();
    if (slot !== undefined) { slotOf[v] = slot; taken[slot] = 1; }
  }
  let free = 0;
  for (let v = 0; v < verts; v++) {
    if (slotOf[v] >= 0) continue;
    while (free < size && (free % s === 0 || taken[free])) free++;
    if (free >= size) throw new Error(`yard clutter: the record pool of ${size} cannot hold the stack's ${verts} vertices`);
    slotOf[v] = free; taken[free] = 1;
  }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const a = drawn.getAttribute(name), k = a.itemSize, data = new Float32Array(size * k);
    // (an entry no drawn vertex takes: a sample keeps its legacy position, every other attribute the first vertex's)
    for (let slot = 0; slot < size; slot++) for (let c = 0; c < k; c++) data[slot * k + c] = a.array[c];
    for (let v = 0; v < verts; v++) for (let c = 0; c < k; c++) data[slotOf[v] * k + c] = a.array[v * k + c];
    if (name === 'position') for (let slot = 0; slot < size; slot += s) { data[slot * 3] = lp.getX(slot); data[slot * 3 + 1] = lp.getY(slot); data[slot * 3 + 2] = lp.getZ(slot); }
    out.setAttribute(name, new THREE.BufferAttribute(data, k));
  }
  const di = drawn.getIndex()!, index = new Uint32Array(di.count);
  for (let i = 0; i < di.count; i++) index[i] = slotOf[di.getX(i)];
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function cratesOf(mapId: string | undefined): THREE.BufferGeometry {
  const f = (mapId && crateFormOf(mapId)) || crateFormOf('railyard')!;
  const rng = mulberry(0xc7a7e5);
  return merge([
    crateNear(f, rng),
    at(crateNear(f, rng), 0.22, 0.08, f.h, -0.04, 0.82),
    at(crateNear(f, rng), 0, 0.76, 0, 0.12, 0.62),
  ]);
}

function cableDrumOf(mapId: string | undefined): THREE.BufferGeometry {
  // (the kind's cable drum a tenth larger: the yard's 1.5 m drum, inside the family's 0.9 m reach)
  return at(spoolNear(spoolFormOf(mapId ?? 'railyard'), mulberry(0x5b001)), 0, 0, 0, 0, 1.1);
}

function drumOf(): THREE.BufferGeometry {
  return drumNear(YARD_DRUM, mulberry(0xd2a1));
}
function drumRankOf(): THREE.BufferGeometry {
  const shade = (k: number) => ({ shell: mul(WHITE, k), hoop: mul(HOOP, k), head: mul(HEAD, k), rust: 0.12 });
  return merge([at(drumNear(shade(1), mulberry(1), true), 0.2, -0.66, 0, 0), at(drumNear(shade(0.86), mulberry(2), true), 1.1, 0, 0, 0.04),
    at(drumNear(shade(0.72), mulberry(3), true), 2.3, 0.66, 0, -0.02)]);
}

/** Four tyres stacked flat, each its own wear: their treads and shoulders, the top one's sidewall and bead, the bead
 *  wall down the stack's hole. */
function tyresOf(): THREE.BufferGeometry {
  const m = newMesh();
  for (let k = 0; k < 4; k++) {
    const y = k * 0.26, top = k === 3;
    const prof: Array<[number, number]> = [[0.48, y], [0.5, y + 0.06], [0.5, y + 0.2], [0.48, y + 0.26]];
    if (top) prof.push([0.31, y + 0.25], [0.29, y + 0.2]);
    lathe(m, prof, 9, (j, b) => mul(RUBBER, (b === 1 ? (j % 2 ? 0.8 : 1.1) : 0.95) * (0.92 + k * 0.04)), { phase: k * 0.9 });
  }
  lathe(m, [[0.29, 0.98], [0.3, 0.0]], 9, () => mul(RUBBER, 0.6), { phase: 3 * 0.9 });
  return finish(m);
}

/** The fuel tank on its two saddles: the shell with its dished ends and two bands, the manway and the filler neck on top. */
function fuelTankOf(): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.9, L = 2.15;
  const from = m.mark;
  lathe(m, [[0, -L - 0.2], [0.55, -L - 0.15], [0.85, -L - 0.05], [R, -L], [R, L], [0.85, L + 0.05], [0.55, L + 0.15], [0, L + 0.2]], 12,
    (_k, b) => (b === 3 ? WHITE : mul(WHITE, 0.94)), {});
  for (const z of [-1.45, 1.45]) lathe(m, [[R + 0.012, z - 0.05], [R + 0.012, z + 0.05]], 12, () => HOOP, {});
  tip(m, from, [0, 0, 0], [1, 0, 0], Math.PI / 2);
  place(m, from, 0, 0, 1.25, 0);
  for (const z of [-1.45, 1.45]) {
    extrude(m, [0, 0, z - 0.2], [0, 0, z + 0.2], [[-0.95, 0], [0.95, 0], [0.95, 0.1], [0.6, 0.62], [-0.6, 0.62], [-0.95, 0.1]], [1, 0, 0], [0, 1, 0], mul(HOOP, 0.8), mul(HOOP, 0.7));
  }
  lathe(m, [[0.3, 2.13], [0.3, 2.2], [0.26, 2.23], [0, 2.24]], 8, () => HOOP, { z: -0.7 });
  lathe(m, [[0.08, 2.1], [0.08, 2.35], [0.11, 2.35], [0.11, 2.4], [0, 2.41]], 6, () => mul(HOOP, 0.9), { z: 0.9 });
  return finish(m);
}

/** The skip: its sloped-end steel body open at the top with its contents in it, the ribs down its sides, the lifting
 *  lugs at its ends, the skid runners. */
function skipOf(): THREE.BufferGeometry {
  const m = newMesh();
  const uv: [number, number] = [0.5, 0.5];
  const B = 1.3, T = 1.72, H = 1.35, D = 0.82, y0 = 0.12, t = 0.04;
  const q = (a: V3, b: V3, c: V3, d: V3, n: V3, col: Rgb) => m.quad(a, b, c, d, n, () => uv, () => col, false);
  const body = WHITE, inner = mul(WHITE, 0.45);
  for (const sz of [-1, 1]) {
    q([-B, y0, sz * D], [B, y0, sz * D], [T, y0 + H, sz * D], [-T, y0 + H, sz * D], [0, 0, sz], body);
    q([-B + t, y0 + t, sz * (D - t)], [B - t, y0 + t, sz * (D - t)], [T - t, y0 + H, sz * (D - t)], [-T + t, y0 + H, sz * (D - t)], [0, 0, -sz], inner);
    q([-T, y0 + H, sz * D], [T, y0 + H, sz * D], [T - t, y0 + H, sz * (D - t)], [-T + t, y0 + H, sz * (D - t)], [0, 1, 0], mul(body, 0.9));
    for (const x of [-0.75, 0, 0.75]) bar(m, [x, y0 + 0.05, sz * (D + 0.02)], [x * (T / B), y0 + H - 0.05, sz * (D + 0.02)], 0.06, 0.04, [1, 0, 0], mul(body, 0.82), 0, true);
  }
  const slope = Math.atan2(T - B, H);
  for (const sx of [-1, 1]) {
    q([sx * B, y0, -D], [sx * B, y0, D], [sx * T, y0 + H, D], [sx * T, y0 + H, -D], [sx * Math.cos(slope), -Math.sin(slope), 0], body);
    q([sx * (B - t), y0 + t, -D + t], [sx * (B - t), y0 + t, D - t], [sx * (T - t), y0 + H, D - t], [sx * (T - t), y0 + H, -D + t], [-sx * Math.cos(slope), Math.sin(slope), 0], inner);
    q([sx * T, y0 + H, -D], [sx * T, y0 + H, D], [sx * (T - t), y0 + H, D - t], [sx * (T - t), y0 + H, -D + t], [0, 1, 0], mul(body, 0.9));
    // the lifting lug on the end, and the runner under it
    bar(m, [sx * (T * 0.82 + 0.05), y0 + H * 0.55, -0.18], [sx * (T * 0.82 + 0.05), y0 + H * 0.55, 0.18], 0.08, 0.3, [1, 0, 0], mul(body, 0.75));
    bar(m, [sx * (B - 0.15), 0.06, -0.75], [sx * (B - 0.15), 0.06, 0.75], 0.22, 0.12, [1, 0, 0], mul(body, 0.6));
  }
  q([-B + t, y0 + t, -D + t], [B - t, y0 + t, -D + t], [B - t, y0 + t, D - t], [-B + t, y0 + t, D - t], [0, 1, 0], inner);
  // what it holds: a heap of rubble and scrap to two thirds of its height
  for (const x of [-0.55, 0.5]) {
    lathe(m, [[0.74, y0 + t], [0.6, y0 + H * 0.45], [0.3, y0 + H * 0.64], [0, y0 + H * 0.68 + x * 0.05]], 6, (k) => hexLin(k % 2 ? 0x6a645a : 0x575048), { x, phase: x });
  }
  return finish(m);
}

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------------------------------------- catalog

const BUILDERS: Readonly<Record<YardFamily, (mapId?: string) => THREE.BufferGeometry>> = Object.freeze({
  pallets: (mapId) => palletStackOf(mapId, 3),
  palletsTall: (mapId) => palletStackOf(mapId, 6),
  crates: cratesOf,
  drum: drumOf,
  drumRank: drumRankOf,
  cableDrum: cableDrumOf,
  tyres: tyresOf,
  fuelTank: fuelTankOf,
  skip: skipOf,
});

/** Every family on the vertex-colour material (props lane A #2: the forms carry their own tones; the steel families
 *  paint pale for the livery). */
export const YARD_FAMILY_MATERIAL: Readonly<Record<YardFamily, YardMaterial>> = Object.freeze({
  pallets: 'baked', palletsTall: 'baked', crates: 'baked', cableDrum: 'baked',
  drum: 'baked', drumRank: 'baked', fuelTank: 'baked', skip: 'baked',
  tyres: 'baked',
});

/** Triangle caps the receipt holds each family to (a stack of six pallets is the largest wooden piece; the r2 sweep's
 *  eased decks, 2026-10-16, +48 a stack of three, +96 of six). */
export const YARD_FAMILY_TRIANGLE_CAP: Readonly<Record<YardFamily, number>> = Object.freeze({
  pallets: 420, palletsTall: 650, crates: 620, drum: 210, drumRank: 340, cableDrum: 300, tyres: 300, fuelTank: 320, skip: 220,
});

/** Build one family's geometry in the map's forms (the caller owns and disposes it; one per family per battlefield). */
export function buildYardFamily(family: YardFamily, mapId?: string): YardFamilyGeometry {
  const geometry = BUILDERS[family](mapId);
  const position = geometry.getAttribute('position');
  return { family, material: YARD_FAMILY_MATERIAL[family], geometry, triangles: Math.floor((geometry.index?.count ?? position.count) / 3) };
}

/** The livery an instance takes (drums and ranks share the drum table; pallets and crates take none). */
export function yardInstanceLivery(
  family: YardFamily, variant: number, palette: keyof typeof YARD_LIVERIES,
): number | null {
  const table = YARD_LIVERIES[palette];
  const key = family === 'drum' || family === 'drumRank' ? 'drum' : family === 'skip' ? 'skip' : family === 'fuelTank' ? 'fuelTank' : null;
  if (!key) return null;
  const rows = table[key];
  return rows[((variant % rows.length) + rows.length) % rows.length];
}
