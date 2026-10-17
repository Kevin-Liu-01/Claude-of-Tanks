// src/world/maps/fenceKit.ts — every timber fence in its region's build (props lane A, family #6, 2026-10-15; WORKLIST.md
// #6: "A fenceKit on craftMesh keyed by the same GATE_STYLES table so fence and gate agree").
//
// The four timber fence kinds (inhabitKit fenceplank, fencepicket, fencewattle, fencerail: a post and three boxes, a
// row of slabs, five straight sticks) were one form on every map. Here each is its region's fence, member by member:
//   fenceplank   the plank zabor on two rails between round posts (Prokhorovka, Hostomel); the Podhale sztachety of
//                pointed laths under a shingled cap; the Lattenzaun of vertical laths on sandstone-plinth posts
//                (Franconia, the Eifel, Osthessen, Lorraine); the colliery allotment's tarred boards (the Ruhr); the
//                Zeeland hekwerk painted white; the Louisiana four-board fence under its cap; the Arctic station's
//                slatted drift fence; Sarajevo's planks on rubble footings; the Maurienne's larch boards;
//   fencerail    the Norwegian skigard of leaning poles between paired stakes; the zherdyna of poles tied to stakes (the
//                steppe, Podhale, the Maurienne, Hostomel); post-and-rail (Tasmania, Louisiana, the Eifel); ranch posts
//                strung with barbed wire (Page, Oljato, Wadi Rum); cedar posts with bamboo rails (Aso); concrete posts
//                with steel rails (the Saar, the Ruhr, Jiangnan, the Arctic station); stone posts with rails (Brittany's
//                granite, Andalusia's limewashed);
//   fencepicket  the white picket (default); the Hessian Staketenzaun of split grey pales;
//   fencewattle  the hurdle (default, Dalmatia, Lorraine); the Ukrainian tyn (Prokhorovka, the steppe); the Navajo coyote
//                fence of juniper; the bamboo fence of the Jamuna, the Mekong and the Naga Hills; Aso's yotsume-gaki
//                bamboo grid; the palm-rib (jarid) fence of Siwa and the Dahar; the Andalusian cane fence.
//
// Frame (the legacy modules', inhabitKit FENCE_SEG): the run along local z from -FENCE_SEG/2 to +FENCE_SEG/2, the module's
// own post at its start (-z: the next module's start is this one's end), x across the line, y up from the ground; posts
// sunk 0.2 m. On the structure wood (craftMesh: its grain along a member's length, the colour albedo over the print);
// stone, concrete and steel members sample a flat texel and carry their colour.
//
// The collision is the legacy module's exactly (props.ts fenceTypes): the legacy builder still runs first on the pool's
// stream (its draws), its contact band is frozen as the pool's (DestructiblePropType.contactBand, as the rebuilt vehicles
// keep theirs) and its fixed-seed build is the placement footprint. The broken state is this build broken by member
// (propFracture.ts FENCE_FRACTURE: posts snap low, boards and rails lie along the line). Cost (WORKLIST #6 guardrail:
// net triangles <= +0 on Saltwind, the delta, the coast and the desert): every form's module triangles are capped
// (FENCE_TRIANGLE_CAP), the guardrail maps within an r2 allowance of the legacy counts (fenceKit.selftest). Pure geometry;
// no draws from any stream (hash noise).
import * as THREE from 'three';
import { FENCE_SEG, bFenceIronR2, type DestructiblePropType } from './inhabitKit.ts';
import { gateStyleFor, type GateStyle } from './gateKit.ts';
import { Mesh, WOOD_UV_PER_M, X, Y, Z, hexLin, member, mix, mul, norm, pole, stream, type Rgb, type UvMode, type V3 } from './craftMesh.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';

export const FENCE_KINDS = ['fenceplank', 'fencepicket', 'fencewattle', 'fencerail'] as const;
export type FenceKind = typeof FENCE_KINDS[number];
type PlankForm = 'zabor' | 'sztachety' | 'lattenzaun' | 'tarred' | 'hekwerk' | 'fourboard' | 'drift' | 'rubble' | 'larch';
type RailForm = 'skigard' | 'zherdyna' | 'postrail' | 'ranchwire' | 'cedarbamboo' | 'concrete' | 'stonepost';
type PicketForm = 'white' | 'staketen';
type WattleForm = 'hurdle' | 'tyn' | 'coyote' | 'bamboo' | 'yotsume' | 'palm' | 'cane';
/** One region's fences (the gate's region: GATE_STYLES's keys, an architecture kit's id or a kit-less map's id). */
export interface FenceForms { plank: PlankForm; rail: RailForm; picket: PicketForm; wattle: WattleForm; stone?: number }
const DEFAULT_FORMS: FenceForms = { plank: 'zabor', rail: 'postrail', picket: 'white', wattle: 'hurdle' };
const forms = (o: Partial<FenceForms>): FenceForms => ({ ...DEFAULT_FORMS, ...o });
/** Each region's fences, keyed as GATE_STYLES is (gateKit.ts gateStyleFor), so a fence and its gate agree. */
export const FENCE_FORMS: Readonly<Record<string, FenceForms>> = Object.freeze({
  kolkhoz: forms({ plank: 'zabor', rail: 'zherdyna', wattle: 'tyn' }),
  hostomel: forms({ plank: 'zabor', rail: 'zherdyna', wattle: 'tyn' }),
  goral: forms({ plank: 'sztachety', rail: 'zherdyna' }), winter: forms({ plank: 'sztachety', rail: 'zherdyna' }),
  franconian: forms({ plank: 'lattenzaun', stone: 0xb08a64 }), eifel: forms({ plank: 'lattenzaun', rail: 'postrail', stone: 0x8a8278 }),
  hessian: forms({ plank: 'lattenzaun', picket: 'staketen', stone: 0x9a5a48 }),
  lorrain: forms({ plank: 'lattenzaun', stone: 0xa89a80 }), autumn: forms({ plank: 'lattenzaun', stone: 0xa89a80 }),
  ruhr: forms({ plank: 'tarred', rail: 'concrete' }), saar: forms({ plank: 'tarred', rail: 'concrete' }),
  polder: forms({ plank: 'hekwerk' }), longleaf: forms({ plank: 'fourboard', rail: 'postrail' }),
  arctic: forms({ plank: 'drift', rail: 'concrete' }), sarajevo: forms({ plank: 'rubble', rail: 'postrail' }),
  savoyard: forms({ plank: 'larch', rail: 'zherdyna' }),
  nordland: forms({ rail: 'skigard' }), fjord: forms({ rail: 'skigard' }),
  tselina: forms({ rail: 'zherdyna', wattle: 'tyn' }), steppe: forms({ rail: 'zherdyna', wattle: 'tyn' }),
  queenstown: forms({ rail: 'postrail' }),
  glencanyon: forms({ rail: 'ranchwire' }), navajo: forms({ rail: 'ranchwire', wattle: 'coyote' }), wadirum: forms({ rail: 'ranchwire', wattle: 'palm' }),
  kyushu: forms({ rail: 'cedarbamboo', wattle: 'yotsume' }),
  shanghai: forms({ rail: 'concrete' }),
  breton: forms({ rail: 'stonepost', stone: 0x86857e }), andalusian: forms({ rail: 'stonepost', wattle: 'cane', stone: 0xe6e0d2 }),
  bengal: forms({ wattle: 'bamboo' }), mekong: forms({ wattle: 'bamboo' }), kohima: forms({ wattle: 'bamboo' }),
  siwa: forms({ wattle: 'palm' }), ksar: forms({ wattle: 'palm' }),
  dalmatian: forms({ wattle: 'hurdle' }), chouf: forms({}),
});

/** A map's fences: its kit's, or its own (a map with no kit), or the default — as gateStyleFor finds its gates. */
export function fenceFormsFor(architectureId: string | null | undefined, mapId: string): FenceForms {
  return (architectureId ? FENCE_FORMS[architectureId] : undefined) ?? FENCE_FORMS[mapId] ?? DEFAULT_FORMS;
}

/** No module of any form draws more triangles than this (per kind). */
export const FENCE_TRIANGLE_CAP: Readonly<Record<FenceKind, number>> = Object.freeze({
  // (r2, 2026-10-16: every member a welded, chamfered solid — no bare quad or box — costs its edges and arrises)
  fenceplank: 270, fencepicket: 200, fencewattle: 210, fencerail: 100,
});

// ---------------------------------------------------------------------------------------------------------------
// the members (lean: a board's faces and its head; a rail's three seen faces; a stake's sides and top)

const L = FENCE_SEG, Z0 = -FENCE_SEG / 2, Z1 = FENCE_SEG / 2;
const FLAT: UvMode = { kind: 'flat' };
const grain = (u0: number): UvMode => ({ kind: 'grain', u0 });
const SOIL: Rgb = [0.055, 0.045, 0.035];

/** The member's colour by height: soil-splashed and damp at its foot, a little greyer toward its top (sun). */
function weathered(col: Rgb): (q: V3) => Rgb {
  return (q) => {
    const foot = Math.max(0, 1 - (q[1] + 0.05) / 0.4);
    return mix(mix(col, mul(col, 1.08), Math.min(1, Math.max(0, q[1] - 0.6)) * 0.3), SOIL, foot * 0.45);
  };
}
/** Each member a shade off its family's, from the form's own stream. */
function shadeOf(col: Rgb, r: () => number, k = 0.14): Rgb {
  const v = 1 + (r() - 0.5) * k, w = 1 + (r() - 0.5) * k * 0.4;
  return [col[0] * v * w, col[1] * v, col[2] * v / w];
}

/** A triangle wound to face `out`, its normal its own (flat-shaded), its uvs and colour by place. */
function orientedTri(m: Mesh, a: V3, b: V3, c: V3, out: V3, uv: (q: V3) => [number, number], col: Rgb): void {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
  m.tri(a, b, c, n, n, n, uv(a), uv(b), uv(c), m.colour(col, true));
}

/**
 * A board in the fence's plane (x about `x`, t thick), from y0 to y1 and across z (zc ± w/2): one welded solid — its two
 * faces and its edges (r2: never a bare quad), its head pointed, cut on a slant, or flat with its arrises taken off.
 */
function board(m: Mesh, x: number, t: number, zc: number, w: number, y0: number, y1: number, col: Rgb, u0: number,
  head: 'flat' | 'point' | 'slant' = 'flat'): void {
  const za = zc - w / 2, zb = zc + w / 2, c = Math.min(0.014, w * 0.22);
  const outline: Array<[number, number]> = head === 'point' ? [[za, y0], [zb, y0], [zb, y1], [zc, y1 + w * 0.6], [za, y1]]
    : head === 'slant' ? [[za, y0], [zb, y0], [zb, y1 + w * 0.35], [za + c, y1 + c * 0.4], [za, y1 - c]]
      : [[za, y0], [zb, y0], [zb, y1 - c], [zb - c, y1], [za + c, y1], [za, y1 - c]];
  const shade = weathered(col);
  const uv = (q: V3): [number, number] => [u0 + (q[2] - za) * WOOD_UV_PER_M, q[1] * WOOD_UV_PER_M];
  const n = outline.length, cz = outline.reduce((s2, p) => s2 + p[0], 0) / n, cy = outline.reduce((s2, p) => s2 + p[1], 0) / n;
  for (const sgn of [1, -1]) {
    const fx = x + sgn * t / 2, out: V3 = [sgn, 0, 0];
    for (let k = 1; k + 1 < n; k++) {
      const a: V3 = [fx, outline[0][1], outline[0][0]], b: V3 = [fx, outline[k][1], outline[k][0]], d: V3 = [fx, outline[k + 1][1], outline[k + 1][0]];
      orientedTri(m, a, b, d, out, uv, shade([fx, (a[1] + b[1] + d[1]) / 3, 0]));
    }
  }
  // the edges round it (not the foot: it stands on a rail or the ground), each wound out from the outline's centre
  for (let k = 1; k < n; k++) {
    const [z1, ya] = outline[k], [z2, yb] = outline[(k + 1) % n];
    const mz = (z1 + z2) / 2 - cz, my = (ya + yb) / 2 - cy, out: V3 = [0, my, mz];
    m.quad([x - t / 2, ya, z1], [x + t / 2, ya, z1], [x + t / 2, yb, z2], [x - t / 2, yb, z2], out, uv, shade, true);
  }
}

/** A rail along z (z0..z1) at height y, h tall and t thick about x: a member with its arrises taken off (r2). */
function rail(m: Mesh, x: number, t: number, y: number, h: number, z0: number, z1: number, col: Rgb, u0: number, uvMode: 'grain' | 'flat' = 'grain'): void {
  member(m, [x, y, z0], [x, y, z1], t, h, X, col, uvMode === 'flat' ? FLAT : grain(u0), { chamfer: Math.min(t, h) * 0.22, skipEnds: true, shade: weathered(col) });
}

/** A square post (w across) from its sunk foot to `top`, its arrises taken off, its top flat or a pyramid cap. */
function post(m: Mesh, z: number, top: number, w: number, col: Rgb, u0: number, cap: 'flat' | 'pyramid' = 'flat', flat = false): void {
  member(m, [0, -0.2, z], [0, top, z], w, w, Z, col, flat ? FLAT : grain(u0), { chamfer: w * 0.12, skipEnds: true, shade: weathered(col) });
  const h = w / 2, c = m.colour(mul(col, 0.9), !flat), uvc: [number, number] = [0.5, 0.5];
  const q: V3[] = [[h, top, z + h], [-h, top, z + h], [-h, top, z - h], [h, top, z - h]];
  if (cap === 'pyramid') {
    const apex: V3 = [0, top + w * 0.45, z];
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], n = norm([(a[0] + b[0]) / 2, 0.45, (a[2] + b[2]) / 2 - z]);
      m.tri(a, apex, b, n, n, n, uvc, uvc, uvc, c);
    }
  } else {
    m.tri(q[0], q[2], q[1], Y, Y, Y, uvc, uvc, uvc, c);
    m.tri(q[0], q[3], q[2], Y, Y, Y, uvc, uvc, uvc, c);
  }
}

/** A woven band across the stakes at `zs`, weaving front and back (x ±dx) at height y (hh half height). */
function weave(m: Mesh, zs: readonly number[], y: number, hh: number, dx: number, phase: number, col: Rgb, u0: number): void {
  const shade = weathered(col);
  const uv = (q: V3): [number, number] => [u0 + (q[1] - y) * WOOD_UV_PER_M, q[2] * WOOD_UV_PER_M];
  // over and under: at each stake the band passes the other side; between, it crosses the line
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < zs.length; k++) {
    pts.push([((k + phase) % 2 ? 1 : -1) * dx, zs[k]]);
    if (k + 1 < zs.length) pts.push([0, (zs[k] + zs[k + 1]) / 2]);
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const [xa, za] = pts[k], [xb, zb] = pts[k + 1];
    const n = norm([zb - za, 0, -(xb - xa)]);
    for (const s of [1, -1]) {
      const o = s * 0.005;
      m.quad([xa + n[0] * o, y - hh, za + n[2] * o], [xb + n[0] * o, y - hh, zb + n[2] * o], [xb + n[0] * o, y + hh, zb + n[2] * o],
        [xa + n[0] * o, y + hh, za + n[2] * o], s > 0 ? n : [-n[0], 0, -n[2]], uv, shade, true);
    }
  }
}

/** A thin strand (a wire, a lashing) from a to b: one upright double-sided ribbon. */
function strand(m: Mesh, a: V3, b: V3, h: number, col: Rgb): void {
  const shade = () => col, uv = (): [number, number] => [0.5, 0.5];
  const d = norm([b[0] - a[0], 0, b[2] - a[2]]), n: V3 = [d[2], 0, -d[0]];
  for (const s of [1, -1]) {
    m.quad([a[0], a[1] - h, a[2]], [b[0], b[1] - h, b[2]], [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]], s > 0 ? n : [-n[0], 0, -n[2]], uv, shade, false);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the fences

interface Ctx { gate: GateStyle; forms: FenceForms; r: () => number }

function plankFence(m: Mesh, c: Ctx): void {
  const { gate, forms: f, r } = c, timber = hexLin(gate.timber), postCol = mix(timber, [0.07, 0.06, 0.05], 0.25);
  const stone = hexLin(f.stone ?? 0x9a8e80);
  switch (f.plank) {
    case 'zabor': case 'larch': {
      // vertical boards nailed to two rails between round posts (the larch's silvered, its boards wider)
      const wood = f.plank === 'larch' ? mix(timber, [0.5, 0.48, 0.45], 0.35) : timber;
      pole(m, [0, -0.2, Z0], [0, 1.25, Z0], 0.075, 0.065, postCol, 0.05, 6);
      for (const y of [0.3, 0.92]) rail(m, -0.045, 0.05, y, 0.09, Z0 + 0.06, Z1 + 0.04, shadeOf(wood, r), 0.6);
      const n = f.plank === 'larch' ? 9 : 11;
      for (let k = 0; k < n; k++) {
        const w = L / n, zc = Z0 + 0.08 + (k + 0.5) * (L - 0.1) / n, top = 1.12 + (r() - 0.5) * 0.06;
        board(m, 0, 0.022, zc, w * 0.92, 0.06, top, shadeOf(wood, r, 0.2), 0.05 + (k % 3) * 0.13, f.plank === 'larch' ? 'flat' : 'slant');
      }
      return;
    }
    case 'sztachety': {
      // pointed laths on two rails, the run's top rail under a little shingled cap (two boards meeting at a ridge)
      post(m, Z0, 1.3, 0.12, postCol, 0.05, 'pyramid');
      for (const y of [0.32, 0.95]) rail(m, -0.04, 0.045, y, 0.08, Z0 + 0.06, Z1 + 0.04, shadeOf(timber, r), 0.6);
      for (let k = 0; k < 12; k++) {
        const zc = Z0 + 0.12 + (k + 0.5) * (L - 0.16) / 12;
        board(m, 0, 0.02, zc, 0.075, 0.08, 1.08 + (r() - 0.5) * 0.04, shadeOf(timber, r, 0.18), 0.1 + (k % 4) * 0.1, 'point');
      }
      const ridge = 1.36, cap = mul(timber, 0.7), uv = (q: V3): [number, number] => [0.3 + q[0], q[2] * WOOD_UV_PER_M];
      for (const s of [1, -1]) {
        m.quad([0, ridge, Z0], [s * 0.13, ridge - 0.07, Z0], [s * 0.13, ridge - 0.07, Z1], [0, ridge, Z1], norm([s * 0.5, 1, 0]), uv, () => cap, true);
      }
      return;
    }
    case 'lattenzaun': {
      // vertical laths on two rails between posts standing on a sandstone plinth block
      member(m, [0, -0.15, Z0], [0, 0.3, Z0], 0.26, 0.26, Z, stone, FLAT, { skipEnds: false });
      post(m, Z0, 1.2, 0.11, postCol, 0.05, 'pyramid');
      for (const y of [0.42, 0.98]) rail(m, -0.04, 0.045, y, 0.07, Z0, Z1 + 0.04, shadeOf(timber, r), 0.6);
      for (let k = 0; k < 14; k++) {
        const zc = Z0 + 0.2 + (k + 0.5) * (L - 0.22) / 14;
        board(m, 0, 0.018, zc, 0.05, 0.32, 1.1 + (r() - 0.5) * 0.02, shadeOf(timber, r, 0.16), 0.1 + (k % 4) * 0.1, 'point');
      }
      return;
    }
    case 'tarred': {
      // the allotment's boards lapped horizontally and tarred black, on a squared post with its battens behind
      const tar: Rgb = hexLin(0x2a2724);
      post(m, Z0, 1.25, 0.12, mul(tar, 1.2), 0.05);
      for (const zc of [-0.1, Z1 - 0.06]) board(m, -0.016, 0.03, zc, 0.06, -0.12, 1.2, mul(tar, 1.1), 0.3);
      for (let k = 0; k < 6; k++) rail(m, 0.01 + (k % 2) * 0.004, 0.022, 0.2 + k * 0.18, 0.19, Z0 + 0.06, Z1 + 0.02, shadeOf(tar, r, 0.25), 0.1 + k * 0.1);
      return;
    }
    case 'hekwerk': {
      // the Zeeland yard fence painted white: a heavy post with its cap, three boards and the brace
      const white = hexLin(0xe6e3da);
      post(m, Z0, 1.2, 0.14, white, 0.05, 'pyramid');
      for (const y of [0.35, 0.7, 1.05]) rail(m, 0.07, 0.03, y, 0.12, Z0 + 0.07, Z1 + 0.03, shadeOf(white, r, 0.06), 0.5);
      member(m, [0.04, 0.38, Z0 + 0.1], [0.04, 1.0, Z0 + 0.9], 0.11, 0.025, X, white, grain(0.7), { skipEnds: true });
      return;
    }
    case 'fourboard': {
      // four wide boards nailed to the posts' face, the cap board flat along the top
      post(m, Z0, 1.25, 0.15, postCol, 0.05);
      for (const y of [0.3, 0.58, 0.86, 1.12]) rail(m, 0.09, 0.025, y, 0.15, Z0 - 0.02, Z1 + 0.02, shadeOf(timber, r), 0.2);
      rail(m, 0.03, 0.17, 1.27, 0.03, Z0 - 0.04, Z1 + 0.04, shadeOf(mul(timber, 0.9), r), 0.4);
      return;
    }
    case 'drift': {
      // the slatted snow fence: slats with their gaps (the drift's catch) on two rails, a steel post
      const steel = hexLin(0x4a4c4e);
      post(m, Z0, 1.3, 0.07, steel, 0, 'flat', true);
      for (const y of [0.3, 1.05]) rail(m, -0.035, 0.035, y, 0.07, Z0 + 0.04, Z1 + 0.03, shadeOf(timber, r), 0.6);
      for (let k = 0; k < 14; k++) {
        const zc = Z0 + 0.1 + (k + 0.5) * (L - 0.12) / 14;
        board(m, 0, 0.016, zc, 0.07, 0.1, 1.2, shadeOf(timber, r, 0.22), 0.1 + (k % 4) * 0.1, 'slant');
      }
      return;
    }
    case 'rubble': {
      // planks nailed across a post standing in a footing of rubble stones (the war's patch-up)
      // (the footing heaped round the post's foot: three stones of the ruins)
      for (const [dx, dz] of [[0.16, -0.05], [-0.15, 0.1], [0.02, 0.2]] as const) {
        const s = 0.12 + r() * 0.1;
        member(m, [dx, -0.1, Z0 + dz], [dx * 0.8, s, Z0 + dz + 0.04], 0.22 + r() * 0.1, 0.2, X, mix(stone, [0.3, 0.3, 0.3], r() * 0.4), FLAT, { chamfer: 0.04 });
      }
      post(m, Z0, 1.2, 0.12, postCol, 0.05);
      for (const [y, tilt] of [[0.42, 0.04], [0.72, -0.03], [1.0, 0.02]] as const) {
        const col = shadeOf(timber, r, 0.3), y0 = y + tilt * L / 2, y1 = y - tilt * L / 2;
        member(m, [0.07, y0, Z0], [0.07, y1, Z1], 0.024, 0.18, X, col, grain(0.2 + y), { chamfer: 0.005, skipEnds: true, shade: weathered(col) });
      }
      return;
    }
  }
}

function railFence(m: Mesh, c: Ctx): void {
  const { gate, forms: f, r } = c, timber = hexLin(gate.timber), postCol = mix(timber, [0.07, 0.06, 0.05], 0.25);
  switch (f.rail) {
    case 'skigard': {
      // the skigard: a pair of stakes tied with withy bands, the split poles leaning through them at a slant
      for (const dx of [-0.07, 0.07]) pole(m, [dx, -0.2, Z0], [dx, 1.3, Z0], 0.04, 0.035, shadeOf(postCol, r), 0.05 + dx, 4);
      for (let k = 0; k < 5; k++) {
        const z0 = Z0 - 0.05 + k * 0.42, y0 = -0.06;
        pole(m, [0, y0, z0], [0, y0 + 1.12, z0 + 0.95], 0.032, 0.026, shadeOf(timber, r, 0.2), 0.2 + k * 0.1, 4);
      }
      for (const y of [0.45, 1.05]) strand(m, [-0.09, y, Z0], [0.09, y, Z0], 0.03, mul(timber, 0.6));
      return;
    }
    case 'zherdyna': {
      // the poles laid along on the stakes' forks, tied to them; the stakes in pairs
      for (const dx of [-0.06, 0.06]) pole(m, [dx, -0.2, Z0], [dx, 1.18, Z0], 0.045, 0.038, shadeOf(postCol, r), 0.05 + dx, 5);
      for (const [y, sag] of [[0.42, 0.02], [0.78, 0.03], [1.1, 0.025]] as const) {
        pole(m, [0, y, Z0 - 0.1], [0, y - sag, Z1 + 0.1], 0.036, 0.03, shadeOf(timber, r, 0.18), 0.2 + y * 0.3, 4);
      }
      return;
    }
    case 'postrail': {
      // sawn posts, the rails' ends lapped into the post's mortises
      post(m, Z0, 1.18, 0.14, postCol, 0.05, 'pyramid');
      for (const y of [0.32, 0.66, 1.0]) rail(m, 0, 0.06, y, 0.11, Z0 + 0.07, Z1 + 0.07, shadeOf(timber, r), 0.5);
      return;
    }
    case 'ranchwire': {
      // a round cedar post, the barbed strands stapled to it (the barbs a twist every 0.3 m)
      pole(m, [0, -0.2, Z0], [0, 1.25, Z0], 0.07, 0.06, shadeOf(postCol, r), 0.05, 6);
      const wire = mix(hexLin(gate.iron), [0.32, 0.18, 0.1], 0.35);
      for (const [k, y] of [0.35, 0.65, 0.95, 1.18].entries()) {
        const sag = 0.02 + k * 0.004;
        strand(m, [0.075, y, Z0], [0.075, y - sag, Z1], 0.0035, wire);
        for (let b = 0; b < 3; b++) {
          const z = Z0 + 0.45 + b * 0.7, yy = y - sag * (z - Z0) / L;
          strand(m, [0.075, yy + 0.02, z - 0.015], [0.075, yy - 0.02, z + 0.015], 0.003, wire);
        }
      }
      return;
    }
    case 'cedarbamboo': {
      // a grey cedar post, two bamboo rails lashed to it with black palm rope
      pole(m, [0, -0.2, Z0], [0, 1.1, Z0], 0.06, 0.055, mix(postCol, [0.4, 0.4, 0.4], 0.3), 0.05, 5);
      const cane = hexLin(0xa89a6a);
      for (const y of [0.45, 0.95]) {
        pole(m, [0.06, y, Z0 - 0.05], [0.06, y, Z1 + 0.05], 0.026, 0.024, shadeOf(cane, r), 0.3, 5);
        strand(m, [0.04, y + 0.03, Z0 + 0.02], [0.08, y - 0.03, Z0 - 0.02], 0.012, [0.03, 0.025, 0.02]);
      }
      return;
    }
    case 'concrete': {
      // the works' concrete post with its tapered head, two steel tube rails through it
      const concrete = hexLin(0x9a968c), steel = mix(hexLin(0x5a5c5e), [0.3, 0.16, 0.08], 0.25);
      post(m, Z0, 1.15, 0.13, concrete, 0, 'pyramid', true);
      for (const y of [0.35, 0.95]) pole(m, [0, y, Z0], [0, y, Z1], 0.024, 0.024, steel, 0.5, 5);
      return;
    }
    case 'stonepost': {
      // a granite (or limewashed) post, its head weathered round, the rails' ends let into it
      const stone = hexLin(f.stone ?? 0x86857e);
      post(m, Z0, 1.05, 0.16, stone, 0, 'pyramid', true);
      for (const y of [0.42, 0.82]) rail(m, 0, 0.06, y, 0.1, Z0 + 0.08, Z1 + 0.08, shadeOf(timber, r), 0.5);
      return;
    }
  }
}

function picketFence(m: Mesh, c: Ctx): void {
  const { gate, forms: f, r } = c;
  if (f.picket === 'staketen') {
    // the Staketenzaun: split grey pales of uneven width wired to two rails, a squared post
    const pale = mix(hexLin(gate.picket), [0.35, 0.33, 0.3], 0.5);
    post(m, Z0, 1.12, 0.1, mul(pale, 0.9), 0.05, 'pyramid');
    for (const y of [0.3, 0.8]) rail(m, -0.035, 0.04, y, 0.06, Z0 + 0.05, Z1 + 0.03, shadeOf(pale, r), 0.6);
    for (let k = 0; k < 10; k++) {
      const zc = Z0 + 0.1 + (k + 0.5) * (L - 0.12) / 10 + (r() - 0.5) * 0.03;
      board(m, 0, 0.02, zc, 0.06 + r() * 0.03, 0.1, 0.98 + (r() - 0.5) * 0.08, shadeOf(pale, r, 0.25), 0.1 + (k % 4) * 0.1, 'point');
    }
    return;
  }
  // the white picket: pointed pickets on two rails, the post's pyramid cap
  const paint = hexLin(gate.picket);
  post(m, Z0, 1.05, 0.1, mul(paint, 0.94), 0.05, 'pyramid');
  for (const y of [0.32, 0.78]) rail(m, -0.035, 0.035, y, 0.07, Z0 + 0.05, Z1 + 0.03, mul(paint, 0.9), 0.6);
  for (let k = 0; k < 8; k++) {
    const zc = Z0 + 0.12 + (k + 0.5) * (L - 0.14) / 8;
    board(m, 0, 0.022, zc, 0.09, 0.12, 0.92 + (r() - 0.5) * 0.02, shadeOf(paint, r, 0.07), 0.1 + (k % 3) * 0.12, 'point');
  }
}

function wattleFence(m: Mesh, c: Ctx): void {
  const { gate, forms: f, r } = c, timber = hexLin(gate.timber);
  const withy = mix(timber, [0.2, 0.17, 0.12], 0.25);
  switch (f.wattle) {
    case 'hurdle': case 'tyn': {
      // stakes and withies woven over and under them in bands (the tyn taller, its top bound)
      const tyn = f.wattle === 'tyn', top = tyn ? 1.15 : 1.0, zs = [Z0, Z0 + L / 2, Z1 - 0.02];
      for (const z of zs) pole(m, [0, -0.2, z], [0, top + 0.08, z], 0.034, 0.028, shadeOf(timber, r), 0.05 + z * 0.1, 4);
      const rows = 5, hh = (top - 0.12) / rows / 2;
      for (let k = 0; k < rows; k++) weave(m, zs, 0.1 + hh + k * hh * 2, hh * 0.92, 0.03, k, shadeOf(withy, r, 0.22), 0.3 + (k % 3) * 0.1);
      return;
    }
    case 'coyote': {
      // juniper sticks of uneven height side by side, wired at two heights, a stouter post
      pole(m, [0, -0.2, Z0], [0, 1.4, Z0], 0.06, 0.05, mix(timber, [0.08, 0.07, 0.06], 0.2), 0.05, 4);
      for (let k = 0; k < 11; k++) {
        const z = Z0 + 0.1 + (k + 0.5) * (L - 0.12) / 11, top = 1.0 + r() * 0.45, lean = (r() - 0.5) * 0.06;
        pole(m, [0, -0.1, z], [lean, top, z + (r() - 0.5) * 0.04], 0.026, 0.016, shadeOf(timber, r, 0.3), 0.1 + k * 0.03, 4);
      }
      for (const y of [0.35, 0.85]) strand(m, [0.03, y, Z0], [0.03, y, Z1], 0.004, hexLin(0x3a3634));
      return;
    }
    case 'bamboo': case 'yotsume': {
      // bamboo canes on lashed bamboo rails (the yotsume-gaki's open grid: fewer canes, four rails)
      const grid = f.wattle === 'yotsume', cane = mix(timber, [0.66, 0.6, 0.42], 0.35);
      pole(m, [0, -0.2, Z0], [0, 1.2, Z0], 0.045, 0.04, mul(cane, 0.8), 0.05, 5);
      const rails = grid ? [0.3, 0.55, 0.8, 1.05] : [0.35, 0.95];
      for (const y of rails) pole(m, [0.04, y, Z0], [0.04, y, Z1 + 0.02], 0.02, 0.018, shadeOf(cane, r), 0.4 + y * 0.2, 4);
      const n = grid ? 6 : 9;
      for (let k = 0; k < n; k++) {
        const z = Z0 + 0.15 + (k + 0.5) * (L - 0.2) / n;
        pole(m, [0, -0.05, z], [0, 1.12 + (r() - 0.5) * 0.04, z], 0.02, 0.018, shadeOf(cane, r, 0.2), 0.1 + k * 0.05, 4);
      }
      return;
    }
    case 'palm': {
      // the jarid: pale palm ribs packed upright on two palm-trunk rails, a palm-trunk post
      const rib = mix(timber, [0.62, 0.55, 0.42], 0.55), trunk = mix(timber, [0.25, 0.2, 0.15], 0.3);
      pole(m, [0, -0.2, Z0], [0, 1.3, Z0], 0.09, 0.085, trunk, 0.05, 5);
      for (const y of [0.3, 0.9]) rail(m, 0.04, 0.05, y, 0.07, Z0 + 0.06, Z1 + 0.03, shadeOf(trunk, r), 0.6);
      for (let k = 0; k < 11; k++) {
        const zc = Z0 + 0.12 + (k + 0.5) * (L - 0.14) / 11;
        board(m, 0, 0.012, zc, 0.05, 0.0, 1.2 + (r() - 0.5) * 0.1, shadeOf(rib, r, 0.2), 0.1 + (k % 5) * 0.08, 'point');
      }
      return;
    }
    case 'cane': {
      // Andalusian cane (Arundo) packed upright and wired to two canes laid along, a stake
      const cane = mix(timber, [0.72, 0.66, 0.48], 0.5);
      pole(m, [0, -0.2, Z0], [0, 1.25, Z0], 0.04, 0.035, mul(cane, 0.7), 0.05, 4);
      for (const y of [0.35, 0.95]) pole(m, [0.026, y, Z0], [0.026, y, Z1], 0.016, 0.016, mul(cane, 0.85), 0.5, 4);
      // (the canes packed edge to edge: each a strip, its own shade and height)
      for (let k = 0; k < 14; k++) {
        const z = Z0 + 0.1 + (k + 0.5) * (L - 0.12) / 14;
        pole(m, [0, -0.05, z], [(r() - 0.5) * 0.03, 1.2 + (r() - 0.5) * 0.12, z], 0.015, 0.012, shadeOf(cane, r, 0.2), 0.1 + k * 0.03, 4);
      }
      return;
    }
  }
}

/**
 * The module pushed over by a hull (r2: a wreck that stands, not a raft): its posts snapped at the ground, the run
 * lying over on its side of the line, bent where it broke at its middle — each half leaning its own way (55-75 degrees
 * from upright), a little turned — its members its own (the same triangles: no more than the intact's). In place on the
 * mesh's triangles (each moves with its own centroid's half).
 */
function pushOver(m: Mesh, seed: number): void {
  const r = stream(0xb0e1 + seed), lean = [0.96 + r() * 0.3, 1.1 + r() * 0.25], yaw = [(r() - 0.5) * 0.18, (r() - 0.5) * 0.18];
  for (let t = 0; t < m.p.length; t += 9) {
    const half = (m.p[t + 2] + m.p[t + 5] + m.p[t + 8]) / 3 < 0 ? 0 : 1;
    const ca = Math.cos(lean[half]), sa = Math.sin(lean[half]), cy = Math.cos(yaw[half]), sy = Math.sin(yaw[half]);
    for (let k = t; k < t + 9; k += 3) {
      for (const [arr, isPos] of [[m.p, true], [m.n, false]] as const) {
        const x = arr[k], y = arr[k + 1], z = arr[k + 2];
        // over about the line on the ground (x 0, y 0) toward +x, then turned about the module's centre
        let nx = x * ca + y * sa, ny = -x * sa + y * ca;
        if (isPos) ny = Math.max(ny, -0.04);
        const tx = nx * cy + z * sy, tz = -nx * sy + z * cy;
        arr[k] = tx; arr[k + 1] = ny; arr[k + 2] = tz;
      }
    }
  }
}

/** One fence module of `kind` in its region's build (on the structure wood), intact or pushed over (`broken`). */
export function buildFence(kind: FenceKind, gate: GateStyle, forms: FenceForms, seed = 0, broken = false): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'wood' }), c: Ctx = { gate, forms, r: stream(0xfe0c + seed) };
  if (kind === 'fenceplank') plankFence(m, c);
  else if (kind === 'fencerail') railFence(m, c);
  else if (kind === 'fencepicket') picketFence(m, c);
  else wattleFence(m, c);
  if (broken) pushOver(m, seed);
  const g = m.geometry();
  g.userData.fenceForm = kind === 'fenceplank' ? forms.plank : kind === 'fencerail' ? forms.rail : kind === 'fencepicket' ? forms.picket : forms.wattle;
  return g;
}

/** A fence kind's record on the structure wood (props.ts PropsDestructibleMeta: any material by name). */
export type FenceType = Omit<DestructiblePropType, 'mat'> & { mat: 'structureWood'; ownBroken?: boolean };

/**
 * The map's timber fence kinds in its region's build (props.ts LOCAL_TYPES): each kind's record, class, contact and
 * debris plan unchanged; its legacy builder still runs first on the pool's stream (its draws), its contact band frozen as
 * the pool's collision, its fixed-seed build the placement footprint (`legacyRng` the props' mulberry32 at 0x0f0f7).
 */
export function fenceTypes(architectureId: string | null | undefined, mapId: string, base: Readonly<Record<FenceKind, DestructiblePropType>>,
  footprintRng: () => () => number): Record<FenceKind, FenceType> {
  const gate = gateStyleFor(architectureId, mapId), forms = fenceFormsFor(architectureId, mapId);
  const out = {} as Record<FenceKind, FenceType>;
  for (const kind of FENCE_KINDS) {
    const legacy = base[kind];
    let band: StructureCollisionRuntimeBand | undefined;
    const entry: FenceType = {
      ...legacy, mat: 'structureWood',
      build: (rng) => {
        const old = legacy.build(rng);
        band = deriveRuntimeStructureContactBand({ baked: [old] });
        old.dispose();
        return buildFence(kind, gate, forms);
      },
      // (r2, 2026-10-16: the module's own wreck, pushed over — the legacy broken builder's draws still spent first)
      broken: (rng) => { legacy.broken!(rng).dispose(); return buildFence(kind, gate, forms, 0, true); },
      ownBroken: true,
      footprintBuild: () => legacy.build(footprintRng()),
    };
    out[kind] = Object.defineProperty(entry, 'contactBand', { enumerable: true, get: () => band });
  }
  return out;
}

/**
 * A set piece's wrought-iron railing module (inhabitKit fenceiron) at the r2 bar (bFenceIronR2): the legacy build still runs
 * first on the pool's stream (its paint draws), its contact band frozen as the pool's collision, its fixed-seed build the
 * placement footprint; its own broken build unchanged.
 */
export function ironRailingType(legacy: DestructiblePropType, footprintRng: () => () => number): DestructiblePropType {
  let band: StructureCollisionRuntimeBand | undefined;
  const entry: DestructiblePropType = {
    ...legacy,
    build: (rng) => {
      const old = legacy.build(rng);
      band = deriveRuntimeStructureContactBand({ baked: [old] });
      old.dispose();
      return bFenceIronR2();
    },
    footprintBuild: () => legacy.build(footprintRng()),
  };
  return Object.defineProperty(entry, 'contactBand', { enumerable: true, get: () => band });
}
