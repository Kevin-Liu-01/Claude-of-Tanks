// src/world/maps/townKit.ts — the town and works light kits rebuilt member by member (the destructible-kits lane, round 5,
// 2026-10-11; the owner: "improving all buildings and their decorations to look as beautiful as possible").
//
// The transformer shed, the security office, the service garage and the corner office were a handful of boxes each
// (structureKit's light kit). Each is now built as the thing it is: a steel-clad substation kiosk with its louvres, double
// door and roof bushings; a panelled guardhouse with its high windows, glazed doors, lit sign, canopy and parapet; a
// workshop on a block dado under profiled cladding with its two roller shutters, ribbon windows, roof lights, flue and
// compressor; a two-storey rendered corner block with its sill courses, cornice, parapet, shop door and fanlight, corner
// sign and plant room. Each stands on the old one's solids (structureKit keeps the old build for the collision and the
// footprint, and spends its draws from the props stream first), every part carries its piece for the settled wreck
// (legacyWreck.ts), every member meets what holds it (kitConnectivity.selftest), every roof plane carries its pitch
// receipt; the stream only paints. The writer (paint, weathering, tile mapping, walls, windows, doors) is
// lightKitWriter.ts, shared with the camp kits (campKit.ts).
import * as THREE from 'three';
import { pitchRoofPlane, pitchSkillionRoof } from '../propGeometry.ts';
import { markWorldAperture } from '../worldNightEmissionGeometry.ts';
import {
  Kit, type Opening, type Piece, type Rng, type V3, type Weather, bar, bx, cladWall, cyl, doorIn, pane, prism, solid,
  windowIn,
} from './lightKitWriter.ts';

/** What the kits need of structureKit: its certifying merge (the connectivity receipt, the settled wreck's capture). */
export interface TownKitContext {
  merge(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
}

// ------------------------------------------------------------------------------------------------ shared pieces

/**
 * Vertical joint strips over a wall's panels (`axis` its normal axis, `face` its outer plane): one at each of `at`, from
 * y0 to y1, broken round the openings (a strip that meets one stops under it and starts again over it).
 */
function joints(k: Kit, piece: Piece, hex: number, axis: 'x' | 'z', face: number, at: readonly number[], y0: number, y1: number,
  holes: readonly Opening[], w: Weather): void {
  const out = face > 0 ? 1 : -1, n = face + out * 0.003;
  for (const a of at) {
    let spans: [number, number][] = [[y0, y1]];
    for (const o of holes) {
      if (a < o.a0 - 0.05 || a > o.a1 + 0.05) continue;
      spans = spans.flatMap(([s0, s1]): [number, number][] => [[s0, Math.min(s1, o.y0 - 0.08)], [Math.max(s0, o.y1 + 0.08), s1]])
        .filter(([s0, s1]) => s1 - s0 > 0.1);
    }
    for (const [s0, s1] of spans) {
      const g = axis === 'x' ? bx(0.006, s1 - s0, 0.024).translate(n, (s0 + s1) / 2, a) : bx(0.024, s1 - s0, 0.006).translate(a, (s0 + s1) / 2, n);
      k.add(g, hex, piece, { w });
    }
  }
}

/**
 * A level band round a wall at y (`h` high, `proud` out from the face): along [a0, a1], broken round the openings it
 * crosses (`gap` either side of them).
 */
function band(k: Kit, piece: Piece, hex: number, axis: 'x' | 'z', face: number, a0: number, a1: number, y: number, h: number,
  proud: number, holes: readonly Opening[], w: Weather, gap = 0.08): void {
  const out = face > 0 ? 1 : -1, n = face + out * proud / 2;
  let runs: [number, number][] = [[a0, a1]];
  for (const o of holes) {
    if (y + h / 2 < o.y0 || y - h / 2 > o.y1) continue;
    runs = runs.flatMap(([r0, r1]): [number, number][] => [[r0, Math.min(r1, o.a0 - gap)], [Math.max(r0, o.a1 + gap), r1]])
      .filter(([r0, r1]) => r1 - r0 > 0.05);
  }
  for (const [r0, r1] of runs) {
    const g = axis === 'x' ? bx(proud, h, r1 - r0).translate(n, y, (r0 + r1) / 2) : bx(r1 - r0, h, proud).translate((r0 + r1) / 2, y, n);
    k.add(g, hex, piece, { w });
  }
}

/**
 * A parapet round a flat roof: four walls `t` thick standing from y0 to y0 + h with their outer faces on the walls' (the
 * rectangle hw x hd), a coping on top `over` past either face, and the roof's membrane inside at y0.
 */
function parapet(k: Kit, piece: Piece, wallHex: number, copeHex: number, roofHex: number, hw: number, hd: number, y0: number, h: number,
  t: number, over: number, w: Weather, roofW: Weather): void {
  for (const s of [-1, 1]) {
    k.add(bx(t, h, 2 * hd, 0.6).translate(s * (hw - t / 2), y0 + h / 2, 0), wallHex, piece, { w });
    k.add(bx(2 * hw - 2 * t, h, t, 0.6).translate(0, y0 + h / 2, s * (hd - t / 2)), wallHex, piece, { w });
    k.add(bx(t + 2 * over, 0.05, 2 * hd + 2 * over).translate(s * (hw - t / 2), y0 + h + 0.025, 0), copeHex, piece, { w: roofW });
    k.add(bx(2 * hw - 2 * t, 0.05, t + 2 * over).translate(0, y0 + h + 0.025, s * (hd - t / 2)), copeHex, piece, { w: roofW });
  }
  k.add(bx(2 * hw - 2 * t + 0.02, 0.04, 2 * hd - 2 * t + 0.02, 0.8).translate(0, y0 + 0.02, 0), roofHex, piece, { w: roofW });
}

/** A louvre in an opening: its frame proud of the face, its blades sloping down and out, each into the stiles. */
function louvre(k: Kit, piece: Piece, frameHex: number, bladeHex: number, axis: 'x' | 'z', face: number, o: Opening,
  blades: number, w: Weather, outward: 1 | -1 = face > 0 ? 1 : -1): void {
  const out = outward, cs = 0.06, n = face + out * 0.01;
  const at = (a: number, y: number, wa: number, h: number, dn: number, nn = n): THREE.BufferGeometry => (axis === 'x'
    ? bx(dn, h, wa).translate(nn, y, a) : bx(wa, h, dn).translate(a, y, nn));
  const am = (o.a0 + o.a1) / 2, ym = (o.y0 + o.y1) / 2;
  for (const a of [o.a0 - cs / 2, o.a1 + cs / 2]) k.add(at(a, ym, cs, o.y1 - o.y0 + 2 * cs, 0.08), frameHex, piece, { w });
  for (const y of [o.y0 - cs / 2, o.y1 + cs / 2]) k.add(at(am, y, o.a1 - o.a0, cs, 0.08), frameHex, piece, { w });
  for (let i = 0; i < blades; i++) {
    const y = o.y0 + 0.07 + (o.y1 - o.y0 - 0.14) * (blades > 1 ? i / (blades - 1) : 0.5);
    // (the blade's front edge down: about its long axis, out toward the face's normal)
    const g = axis === 'x' ? bx(0.12, 0.012, o.a1 - o.a0 + 0.02).rotateZ(-out * 0.7) : bx(o.a1 - o.a0 + 0.02, 0.012, 0.12).rotateX(out * 0.7);
    k.add(axis === 'x' ? g.translate(n, y, am) : g.translate(am, y, n), bladeHex, piece, { w });
  }
}

/** A warning sign: a yellow triangle edged in black with a bolt, on a face (outer plane `face`, facing along the axis). */
function warning(k: Kit, piece: Piece, axis: 'x' | 'z', face: number, a: number, y: number, size: number): void {
  const out = face > 0 ? 1 : -1, h = size * 0.87;
  const tri = (s: number, z0: number, z1: number): THREE.BufferGeometry => prism([[-s / 2, 0], [s / 2, 0], [0, s * 0.87]], z0, z1);
  const place = (g: THREE.BufferGeometry, lift: number, depth: number): THREE.BufferGeometry => {
    if (axis === 'x') g.rotateY(out > 0 ? Math.PI / 2 : -Math.PI / 2);
    else if (out < 0) g.rotateY(Math.PI);
    return axis === 'x' ? g.translate(face + out * depth, y + lift, a) : g.translate(a, y + lift, face + out * depth);
  };
  k.add(place(tri(size, 0, 0.006), 0, 0), 0x1f1f1d, piece, {});
  k.add(place(tri(size * 0.8, 0, 0.004), size * 0.07, 0.006), 0xc9a227, piece, { w: { runs: 0.4 } });
  const bolt = bx(0.035 * size / 0.3, h * 0.42, 0.004).rotateZ(0.35);
  k.add(place(bolt, h * 0.38, 0.01), 0x1f1f1d, piece, {});
}

// ------------------------------------------------------------------------------------------------ the transformer shed

// The old shed's solids (structureKit makeTransformerShed): the body 5.4 x 3.4 x 5.0, its roof high over -x; three louvre
// columns on the front (+z) between 1.0 and 2.5 m; a door 2.2 x 2.8 on the back; two posts with caps on the roof at
// x +-1.4 z -1.1.
const TS = { w: 5.4, d: 5.0, floor: 0.12, eaveHigh: 3.55, eaveLow: 3.15, over: 0.25, inset: 0.06, clad: 0.035 };
const TS_PITCH = Math.atan2(TS.eaveHigh - TS.eaveLow, TS.w);
/** The wall head over x (high at -x: the old roof's pitch). */
const tsTop = (x: number): number => TS.eaveHigh - (TS.eaveHigh - TS.eaveLow) * (x + TS.w / 2) / TS.w;
const TS_PAL = {
  clad: 0x566551, trim: 0x30362f, frame: 0x2a2f2a, door: 0x4f5c49, roof: 0x575b5a, concrete: 0x8a877f, room: 0x262826,
  blade: 0x3c443a, porcelain: 0x7a4430, cap: 0x6f7375, steel: 0x5d6260, cabinet: 0x8b8f87, ink: 0x1f1f1d, handle: 0xa7aaa6,
};

function buildTransformerShed(ctx: TownKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0x75ed);
  const { w, d, floor, inset, clad } = TS, hw = w / 2, hd = d / 2, P = TS_PAL, B: Piece = 'block:kiosk';
  const steel: Weather = { foot: 0.8, runs: 0.8, rust: 0.45, dust: 0.4 };
  const trimW: Weather = { foot: 0.6, runs: 0.4, rust: 0.6 };
  k.add(bx(w + 0.24, floor + 0.08, d + 0.24).translate(0, (floor - 0.08) / 2, 0), P.concrete, 'ground:plinth', { w: { foot: 0.5, dust: 0.7 } });
  k.add(prism([[-hw + inset, floor], [hw - inset, floor], [hw - inset, tsTop(hw - inset) - 0.02], [-hw + inset, tsTop(-hw + inset) - 0.02]],
    -hd + inset, hd - inset), P.room, B, { jitter: 0.02, inner: true });
  const louvres: Opening[] = [-1.55, 0, 1.55].map((c) => ({ a0: c - 0.475, a1: c + 0.475, y0: 1.0, y1: 2.4 }));
  const door: Opening = { a0: -1.1, a1: 1.1, y0: floor, y1: 2.92 };
  const vent: Opening = { a0: -0.45, a1: 0.45, y0: 2.45, y1: 2.85 };
  cladWall(k, B, P.clad, steel, 'z', hd, clad, -hw, hw, floor, tsTop, louvres);
  cladWall(k, B, P.clad, steel, 'z', -hd, clad, -hw, hw, floor, tsTop, [door]);
  cladWall(k, B, P.clad, steel, 'x', hw, clad, -hd, hd, floor, () => tsTop(hw), []);
  cladWall(k, B, P.clad, steel, 'x', -hw, clad, -hd, hd, floor, () => tsTop(-hw), [vent]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = tsTop(sx * hw);
    k.add(bx(0.075, top - floor, 0.075).translate(sx * (hw - 0.0175), (floor + top) / 2, sz * (hd - 0.0175)), P.trim, B, { w: trimW });
  }
  for (const s of [-1, 1]) {
    k.add(bx(0.03, 0.11, d - 0.06).translate(s * (hw + 0.004), floor + 0.055, 0), P.trim, B, { w: trimW });
    for (const [a0, a1] of s > 0 ? [[-hw + 0.03, hw - 0.03]] : [[-hw + 0.03, door.a0 - 0.08], [door.a1 + 0.08, hw - 0.03]]) {
      k.add(bx(a1 - a0, 0.11, 0.03).translate((a0 + a1) / 2, floor + 0.055, s * (hd + 0.004)), P.trim, B, { w: trimW });
    }
  }
  for (const o of louvres) louvre(k, B, P.frame, P.blade, 'z', hd, o, 7, trimW);
  louvre(k, B, P.frame, P.blade, 'x', -hw, vent, 3, trimW);
  // the double door on the back: its frame proud, two leaves with louvre grilles low, handles, a hasp, the warning sign
  {
    const { a0, a1, y0, y1 } = door, cs = 0.08, zf = -hd - 0.01, leafZ = -hd + 0.03, face = leafZ - 0.0225;
    k.add(bx(a1 - a0 + 2 * cs, cs, 0.05).translate(0, y1 + cs / 2, zf), P.frame, B, { w: trimW });
    for (const x of [a0 - cs / 2, a1 + cs / 2]) k.add(bx(cs, y1 - y0, 0.05).translate(x, (y0 + y1) / 2, zf), P.frame, B, { w: trimW });
    for (const s of [-1, 1]) {
      const l0 = s < 0 ? a0 : 0.006, l1 = s < 0 ? -0.006 : a1, lm = (l0 + l1) / 2;
      k.add(bx(l1 - l0, y1 - y0, 0.045, 0.5).translate(lm, (y0 + y1) / 2, leafZ), P.door, B, { w: steel });
      const g: Opening = { a0: lm - 0.32, a1: lm + 0.32, y0: y0 + 0.3, y1: y0 + 0.75 };
      k.add(bx(g.a1 - g.a0, g.y1 - g.y0, 0.004).translate(lm, (g.y0 + g.y1) / 2, face - 0.002), P.room, B, { jitter: 0.02 });
      louvre(k, B, P.frame, P.blade, 'z', face - 0.004, g, 4, trimW);
      k.add(bx(0.03, 0.16, 0.035).translate(s * 0.07, y0 + 1.05, face - 0.0175), P.handle, B);
    }
    k.add(bx(0.1, 0.06, 0.03).translate(0, y0 + 1.25, face - 0.015), P.ink, B);
    warning(k, B, 'z', face, 0.55, y0 + 1.55, 0.36);
  }
  // the meter cabinet on the +x wall and its conduit down to the plinth; the sign by the front louvres
  k.add(bx(0.24, 0.85, 0.6, 0.4).translate(hw + 0.12, 1.55, 0.9), P.cabinet, B, { w: { runs: 0.8, rust: 0.35, dust: 0.5 } });
  k.add(bx(0.02, 0.06, 0.03).translate(hw + 0.25, 1.6, 0.68), P.ink, B);
  k.add(cyl(0.03, 0.03, 1.55 - 0.425 - floor, 8).translate(hw + 0.07, (1.55 - 0.425 + floor) / 2, 0.75), P.steel, B, { w: trimW });
  warning(k, B, 'x', hw + 0.24, 1.08, 1.62, 0.22);
  // the roof: profiled sheet down the slope to the gutter on its low (+x) edge, its fascias and verges, the downpipe
  const roofW = w + 2 * TS.over, roofD = d + 0.5, t = 0.035, R: Piece = 'sheet:roof';
  const yMid = tsTop(0) + t / 2 / Math.cos(TS_PITCH), yAt = (x: number): number => yMid - Math.tan(TS_PITCH) * x;
  const roofTop = (x: number): number => tsTop(x) + t / Math.cos(TS_PITCH);
  k.add(pitchRoofPlane(bx(roofW / Math.cos(TS_PITCH), t, roofD, 0.6), 'x', 1, TS_PITCH, 'skillion').translate(0, yMid, 0), P.roof, R,
    { uv: 'roof', w: { rust: 0.55, dust: 0.6, runs: 0.3 } });
  for (const sx of [-1, 1]) {
    const x = sx * (roofW / 2 - 0.015);
    k.add(bx(0.03, 0.16, roofD).translate(x, yAt(x) - 0.092, 0), P.trim, R, { w: trimW });
  }
  for (const sz of [-1, 1]) {
    const x0 = -roofW / 2, x1 = roofW / 2;
    k.add(prism([[x0, yAt(x0) - 0.172], [x1, yAt(x1) - 0.172], [x1, yAt(x1) - 0.012], [x0, yAt(x0) - 0.012]],
      sz * roofD / 2 - 0.015, sz * roofD / 2 + 0.015), P.trim, R, { w: trimW });
  }
  const gx = roofW / 2 + 0.06, gy = yAt(roofW / 2) - 0.15;
  k.add(bx(0.1, 0.075, roofD - 0.02).translate(gx, gy, 0), P.trim, R, { w: trimW });
  for (const z of [-roofD / 2 + 0.6, 0, roofD / 2 - 0.6]) k.add(bx(0.07, 0.02, 0.03).translate(gx - 0.04, gy + 0.045, z), P.trim, R);
  {
    const pz = -roofD / 2 + 0.3, D: Piece = 'small:downpipe';
    k.add(cyl(0.035, 0.035, gy - 0.0375 - 0.05, 8).translate(gx, (gy - 0.0375 + 0.05) / 2, pz), P.trim, D, { w: trimW });
    k.add(bx(0.32, 0.05, 0.22).translate(gx - 0.02, 0.025, pz), P.concrete, D, { w: { dust: 0.6 } });
  }
  // the two bushings on their bases on the roof (glazed porcelain sheds on a core, a cap and a stud), the busbar between
  const studs: V3[] = [];
  [-1.4, 1.4].forEach((x, i) => {
    const z = -1.1, base = roofTop(x) + 0.19, Bu: Piece = `small:bushing-${i}`;
    k.add(bx(0.4, 0.22, 0.4).translate(x, roofTop(x) - 0.03 + 0.11, z), P.steel, Bu, { w: trimW });
    k.add(cyl(0.055, 0.055, 0.72, 10).translate(x, base + 0.36, z), P.porcelain, Bu, { jitter: 0.02 });
    for (let s = 0; s < 6; s++) k.add(cyl(0.15, 0.15, 0.03, 12).translate(x, base + 0.1 + s * 0.1, z), P.porcelain, Bu, { jitter: 0.02 });
    k.add(cyl(0.08, 0.08, 0.08, 10).translate(x, base + 0.76, z), P.cap, Bu, { w: { rust: 0.4 } });
    k.add(cyl(0.025, 0.025, 0.12, 6).translate(x, base + 0.86, z), P.cap, Bu);
    studs.push([x, base + 0.9, z]);
  });
  k.add(bar(studs[0], studs[1], 0.05, 0.05), P.cap, 'small:busbar', { w: { rust: 0.3 } });
  return ctx.merge('transformershed', k.out);
}

function transformerShedShadow(): THREE.BufferGeometry {
  const { w, d, floor } = TS, roofW = w + 2 * TS.over, roofD = d + 0.5;
  const parts = [bx(w, tsTop(0) - floor, d).translate(0, (tsTop(0) + floor) / 2, 0),
    bx(roofW / Math.cos(TS_PITCH), 0.2, roofD).rotateZ(-TS_PITCH).translate(0, tsTop(0) + 0.06, 0)];
  for (const x of [-1.4, 1.4]) parts.push(bx(0.3, 1.1, 0.3).translate(x, tsTop(x) + 0.55, -1.1));
  return solid(parts);
}

// ------------------------------------------------------------------------------------------------ the security office

// The old office's solids (structureKit makeSecurityOffice): the body 7.2 x 4.8 x 8.6 under a flat roof to 5.0 m; three
// windows on each long face (+z, -z) at 2.43-3.68 m, the middle front one a lit panel; the door 1.45 x 2.55 in the front's
// middle under a canopy (3.6 x 1.45, falling to +z) on two posts at x +-1.55 z 5.48; a band across the front at 1.72 m.
const SO = { w: 7.2, d: 8.6, h: 4.8, floor: 0.15, inset: 0.09, panel: 0.05, para: 0.32 };
const SO_PAL = {
  panel: 0x8f9594, joint: 0x6b7170, band: 0x5d6466, frame: 0x2d3133, glass: 0x56717a, room: 0x2a2c2c, concrete: 0x8a877f,
  roof: 0x3d3f3f, cope: 0x7a7f7f, sign: 0xd8d3c0, signInk: 0x24425a, post: 0x33383a, canopy: 0x5b6163, unit: 0x8d9089,
  fan: 0x2f312f, lamp: 0x272928, lens: 0xd8d2b8, camera: 0xd2d3cf, pipe: 0x55595a, door: 0x3a3f42, kick: 0x5b5f5e,
  handle: 0xa7aaa6, ink: 0x2b2b29,
};

function buildSecurityOffice(ctx: TownKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0x5ec0);
  const { w, d, h, floor, inset, panel } = SO, hw = w / 2, hd = d / 2, P = SO_PAL, B: Piece = 'block:office';
  const render: Weather = { foot: 0.7, runs: 0.9, mottle: 0.6, dust: 0.3 };
  const trimW: Weather = { foot: 0.5, runs: 0.5, rust: 0.3 };
  k.add(bx(w + 0.2, floor + 0.08, d + 0.2).translate(0, (floor - 0.08) / 2, 0), P.concrete, 'ground:plinth', { w: { foot: 0.5, dust: 0.7 } });
  k.add(bx(w - 2 * inset, h - floor - 0.02, d - 2 * inset).translate(0, (h + floor - 0.02) / 2, 0), P.room, B, { jitter: 0.02, inner: true });
  const win = (x: number): Opening => ({ a0: x - 0.64, a1: x + 0.64, y0: 2.43, y1: 3.68 });
  const door: Opening = { a0: -0.725, a1: 0.725, y0: floor, y1: 2.55 };
  const front = [win(-2.25), door, win(2.25)], back = [win(-2.25), win(0), win(2.25)];
  cladWall(k, B, P.panel, render, 'z', hd, panel, -hw, hw, floor, () => h, front, 0.75, 'flat');
  cladWall(k, B, P.panel, render, 'z', -hd, panel, -hw, hw, floor, () => h, back, 0.75, 'flat');
  for (const s of [-1, 1]) cladWall(k, B, P.panel, render, 'x', s * hw, panel, -hd, hd, floor, () => h, [], 0.9, 'flat');
  // the panels' joints, the dado band at 1.72 m round the walls, the corner trims
  const along = (n: number, half: number): number[] => Array.from({ length: n }, (_, i) => -half + (2 * half) * (i + 1) / (n + 1));
  joints(k, B, P.joint, 'z', hd, along(5, hw), floor, h, front, trimW);
  joints(k, B, P.joint, 'z', -hd, along(5, hw), floor, h, back, trimW);
  for (const s of [-1, 1]) joints(k, B, P.joint, 'x', s * hw, along(6, hd), floor, h, [], trimW);
  band(k, B, P.band, 'z', hd, -hw, hw, 1.72, 0.16, 0.04, front, trimW);
  band(k, B, P.band, 'z', -hd, -hw, hw, 1.72, 0.16, 0.04, back, trimW);
  for (const s of [-1, 1]) band(k, B, P.band, 'x', s * hw, -hd + 0.04, hd - 0.04, 1.72, 0.16, 0.04, [], trimW);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(bx(0.07, h - floor, 0.07).translate(sx * (hw - 0.015), (floor + h) / 2, sz * (hd - 0.015)), P.band, B, { w: trimW });
  }
  for (const x of [-2.25, 2.25]) windowIn(k, B, P.frame, P.glass, trimW, 'z', hd, win(x), 2, inset);
  for (const x of [-2.25, 0, 2.25]) windowIn(k, B, P.frame, P.glass, trimW, 'z', -hd, win(x), 2, inset);
  // the glazed double door: its frame, two leaves of glass in narrow stiles, push bars, a threshold
  {
    const { a0, a1, y0, y1 } = door, cs = 0.07, zf = hd + 0.01, leafZ = hd - 0.035;
    k.add(bx(a1 - a0 + 2 * cs, cs, 0.06).translate(0, y1 + cs / 2, zf), P.frame, B, { w: trimW });
    for (const x of [a0 - cs / 2, a1 + cs / 2]) k.add(bx(cs, y1 - y0, 0.06).translate(x, (y0 + y1) / 2, zf), P.frame, B, { w: trimW });
    k.add(bx(a1 - a0 + 0.2, 0.03, 0.3).translate(0, floor - 0.005, hd + 0.1), P.kick, B, { w: { foot: 1 } });
    for (const s of [-1, 1]) {
      const l0 = s < 0 ? a0 : 0.004, l1 = s < 0 ? -0.004 : a1, lm = (l0 + l1) / 2, lw = l1 - l0;
      k.add(bx(0.05, y1 - y0, 0.045).translate(l0 + 0.025, (y0 + y1) / 2, leafZ), P.door, B, { w: trimW });
      k.add(bx(0.05, y1 - y0, 0.045).translate(l1 - 0.025, (y0 + y1) / 2, leafZ), P.door, B, { w: trimW });
      k.add(bx(lw - 0.1, 0.05, 0.045).translate(lm, y1 - 0.025, leafZ), P.door, B, { w: trimW });
      k.add(bx(lw - 0.1, 0.18, 0.045).translate(lm, y0 + 0.09, leafZ), P.door, B, { w: { foot: 1 } });
      k.add(pane(lw - 0.1, y1 - y0 - 0.23, [0, 0, 1]).translate(lm, (y0 + 0.18 + y1 - 0.05) / 2, leafZ), P.glass, B, { jitter: 0.015 });
      k.add(bx(lw - 0.16, 0.035, 0.035).translate(lm, y0 + 1.05, leafZ + 0.04), P.handle, B);
      for (const dx of [-0.25, 0.25]) k.add(bx(0.02, 0.02, 0.04).translate(lm + dx * lw / 0.7, y0 + 1.05, leafZ + 0.02), P.handle, B);
    }
  }
  // the lit sign over the canopy, its lettering bands; the lamps by the door
  k.add(markWorldAperture(bx(2.3, 0.6, 0.05), [0, 0, 1]).translate(0, 3.86, hd + 0.025), P.sign, B, { w: { runs: 0.5 } });
  for (const [y, wd] of [[3.94, 1.7], [3.78, 1.1]]) k.add(bx(wd, 0.07, 0.006).translate(0, y, hd + 0.053), P.signInk, B);
  for (const x of [-1.25, 1.25]) {
    k.add(bx(0.14, 0.2, 0.12).translate(x, 2.3, hd + 0.06), P.lamp, B);
    k.add(bx(0.11, 0.015, 0.1).translate(x, 2.2, hd + 0.065), P.lens, B, { jitter: 0.01 });
  }
  // the air conditioner on the -x wall on its stand, its pipe up the wall
  {
    const A: Piece = 'small:condenser', z = 1.4;
    k.add(bx(0.38, 0.72, 0.92, 0.4).translate(-hw - 0.19, 0.56, z), P.unit, A, { w: { runs: 0.7, rust: 0.3, dust: 0.6 } });
    k.add(cyl(0.22, 0.22, 0.02, 14).rotateZ(Math.PI / 2).translate(-hw - 0.39, 0.56, z - 0.12), P.fan, A);
    for (const dz of [-0.38, 0.38]) k.add(bx(0.32, 0.2, 0.06).translate(-hw - 0.19, 0.1, z + dz), P.post, A, { w: trimW });
    k.add(bx(0.03, 1.5, 0.03).translate(-hw - 0.02, 0.92 + 0.75, z + 0.3), P.pipe, A);
  }
  // the canopy: two posts on their plates, the beam across their heads, a ledger on the wall, the sheet falling to the
  // front and its fascia, downlights under the beam
  {
    const postZ = hd + 1.18, beamTop = 3.29, ledgerY = 3.48, C: Piece = 'sheet:canopy';
    for (const s of [-1, 1]) {
      const Pp: Piece = s < 0 ? 'post:canopy-l' : 'post:canopy-r';
      k.add(bx(0.1, beamTop - 0.14 - 0.01, 0.1).translate(s * 1.55, (beamTop - 0.14 + 0.01) / 2, postZ), P.post, Pp, { w: trimW });
      k.add(bx(0.24, 0.012, 0.24).translate(s * 1.55, 0.006, postZ), P.post, Pp);
    }
    k.add(bx(3.4, 0.14, 0.12).translate(0, beamTop - 0.07, postZ), P.post, C, { w: trimW });
    k.add(bx(3.6, 0.12, 0.06).translate(0, ledgerY - 0.06, hd + 0.03 + 0.003), P.post, C, { w: trimW });
    const run = postZ + 0.25 - hd, fall = Math.atan2(ledgerY - beamTop, postZ - hd), tp = 0.03;
    const zc = hd + run / 2, yc = ledgerY - Math.tan(fall) * (zc - hd) + tp / 2 / Math.cos(fall);
    k.add(pitchSkillionRoof(bx(3.7, tp, run / Math.cos(fall), 0.5), 'z', 1, fall).translate(0, yc, zc), P.canopy, C,
      { uv: 'sheet', w: { rust: 0.3, dust: 0.6 } });
    const yEdge = ledgerY - Math.tan(fall) * run;
    k.add(bx(3.7, 0.12, 0.03).translate(0, yEdge - 0.06, hd + run - 0.015), P.post, C, { w: trimW });
    for (const x of [-0.8, 0.8]) k.add(bx(0.12, 0.03, 0.08).translate(x, beamTop - 0.155, postZ), P.lens, C, { jitter: 0.01 });
  }
  // the roof: its parapet and coping round the membrane; scuppers and downpipes at the back corners; the plant on it
  parapet(k, 'sheet:roof', P.panel, P.cope, P.roof, hw, hd, h, SO.para, 0.2, 0.05, render, { dust: 0.7, rust: 0.2 });
  for (const s of [-1, 1]) {
    const D: Piece = s < 0 ? 'small:downpipe-l' : 'small:downpipe-r', z = -hd + 0.35;
    k.add(bx(0.12, 0.1, 0.12).translate(s * (hw + 0.04), h + 0.06, z), P.pipe, D, { w: trimW });
    k.add(cyl(0.045, 0.045, h + 0.01 - 0.05, 8).translate(s * (hw + 0.07), (h + 0.01 + 0.05) / 2, z), P.pipe, D, { w: trimW });
    k.add(bx(0.32, 0.05, 0.24).translate(s * (hw + 0.1), 0.025, z), P.concrete, D, { w: { dust: 0.6 } });
  }
  {
    const U: Piece = 'small:aircon';
    k.add(bx(1.2, 0.75, 0.8, 0.4).translate(-1.2, h + 0.04 + 0.375, -1.8), P.unit, U, { w: { runs: 0.6, dust: 0.8, rust: 0.2 } });
    k.add(cyl(0.3, 0.3, 0.02, 16).translate(-1.45, h + 0.04 + 0.76, -1.8), P.fan, U);
    k.add(bx(1.3, 0.1, 0.1).translate(-1.2, h + 0.05 + 0.05, -1.35), P.post, U);
    const V: Piece = 'small:vent';
    k.add(cyl(0.08, 0.08, 0.62, 10).translate(1.8, h + 0.04 + 0.31, -2.4), P.pipe, V, { w: trimW });
    k.add(cyl(0.16, 0.1, 0.08, 10).translate(1.8, h + 0.04 + 0.66, -2.4), P.pipe, V, { w: trimW });
  }
  // the camera on its arm at the front corner, the floodlight at the other
  {
    const Cm: Piece = 'small:camera', y = h + 0.12;
    k.add(bar([hw - 0.3, y, hd - 0.1], [hw - 0.3, y, hd + 0.32], 0.05, 0.05), P.post, Cm);
    k.add(bx(0.12, 0.13, 0.32).rotateX(0.35).translate(hw - 0.3, y - 0.08, hd + 0.42), P.camera, Cm, { w: { runs: 0.6 } });
    const F: Piece = 'small:flood';
    k.add(bar([-hw + 0.3, y, hd - 0.1], [-hw + 0.3, y, hd + 0.2], 0.05, 0.05), P.post, F);
    k.add(bx(0.32, 0.2, 0.12).rotateX(0.4).translate(-hw + 0.3, y - 0.05, hd + 0.27), P.lamp, F);
  }
  return ctx.merge('securityoffice', k.out);
}

function securityOfficeShadow(): THREE.BufferGeometry {
  const { w, d, h, floor, para } = SO, hd = d / 2;
  return solid([
    bx(w, h + para - floor, d).translate(0, (h + para + floor) / 2, 0),
    bx(3.7, 0.12, 1.45).rotateX(0.16).translate(0, 3.38, hd + 0.72),
    bx(0.1, 3.1, 0.1).translate(-1.55, 1.55, hd + 1.18), bx(0.1, 3.1, 0.1).translate(1.55, 1.55, hd + 1.18),
  ]);
}

// ------------------------------------------------------------------------------------------------ the service garage

// The old garage's solids (structureKit makeServiceGarage): the body 9.6 x 5.0 x 11.2, its roof high over -x; two doors
// 3.6 x 3.55 on the front (+z) at x -2.55 and 2.0 under headers at 3.68 m; a window on each side wall at z -2.2, 2.4-3.7 m;
// a box 2.6 x 1.0 x 1.45 behind it at (-3.25, -6.26); a stack at (3.65, -4.45) up through the roof to 6 m.
const SG = { w: 9.6, d: 11.2, floor: 0.1, eaveHigh: 5.3, eaveLow: 4.8, dado: 1.0, over: 0.3, inset: 0.08, clad: 0.035 };
const SG_PITCH = Math.atan2(SG.eaveHigh - SG.eaveLow, SG.w);
const sgTop = (x: number): number => SG.eaveHigh - (SG.eaveHigh - SG.eaveLow) * (x + SG.w / 2) / SG.w;
const SG_PAL = {
  clad: 0x6a777b, dado: 0x807f78, flash: 0x3c4446, frame: 0x2c3133, glass: 0x56717a, room: 0x262828, concrete: 0x8a877f,
  slab: 0x7d7a73, shutter: 0x9aa09f, guide: 0x4b5254, box: 0x5e6669, roof: 0x5f6466, light: 0x9aa294, sign: 0xcfc8ae,
  signInk: 0x7d2620, lamp: 0x272928, lens: 0xd8d2b8, tank: 0x8b3a2c, steel: 0x55595a, flue: 0x3a3836, door: 0x47504f,
  handle: 0xa7aaa6, kick: 0x5b5f5e, ink: 0x2b2b29,
};

function buildServiceGarage(ctx: TownKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0x5e6a);
  const { w, d, floor, dado, inset, clad } = SG, hw = w / 2, hd = d / 2, P = SG_PAL, B: Piece = 'block:garage';
  const steel: Weather = { foot: 0.5, runs: 0.8, rust: 0.45, dust: 0.4 };
  const block: Weather = { foot: 0.9, runs: 0.5, mottle: 0.7 };
  const trimW: Weather = { foot: 0.5, runs: 0.4, rust: 0.6 };
  // the yard slab it stands on, out under the doors as an apron
  k.add(bx(w + 0.3, floor + 0.08, d + 0.3).translate(0, (floor - 0.08) / 2, 0), P.slab, 'ground:slab', { w: { foot: 0.4, dust: 0.8 } });
  k.add(bx(8.4, 0.05, 1.8, 0.9).translate(-0.3, 0.025, hd + 1.05), P.concrete, 'ground:slab', { w: { dust: 0.9, foot: 0.3 } });
  k.add(prism([[-hw + inset, floor], [hw - inset, floor], [hw - inset, sgTop(hw - inset) - 0.02], [-hw + inset, sgTop(-hw + inset) - 0.02]],
    -hd + inset, hd - inset), P.room, B, { jitter: 0.02, inner: true });
  const shutters: Opening[] = [{ a0: -4.35, a1: -0.75, y0: floor, y1: 3.6 }, { a0: 0.2, a1: 3.8, y0: floor, y1: 3.6 }];
  const sideWin: Opening = { a0: -3.3, a1: -1.1, y0: 2.4, y1: 3.7 };
  const pdoor: Opening = { a0: 2.4, a1: 3.35, y0: floor, y1: 2.2 };
  // a block dado to 1 m, the profiled cladding over it to the eaves, the flashing on the dado's top
  for (const s of [-1, 1] as const) {
    const zHoles = s > 0 ? shutters : [];
    cladWall(k, B, P.dado, block, 'z', s * hd, 0.12, -hw, hw, floor, () => dado, zHoles, 0.6, 'flat');
    cladWall(k, B, P.clad, steel, 'z', s * hd, clad, -hw, hw, dado, sgTop, zHoles.map((o) => ({ ...o, y0: dado })), 0.5);
    band(k, B, P.flash, 'z', s * hd, -hw, hw, dado + 0.02, 0.05, 0.07, zHoles, trimW, 0.06);
    const xHoles = s > 0 ? [sideWin, pdoor] : [sideWin];
    cladWall(k, B, P.dado, block, 'x', s * hw, 0.12, -hd, hd, floor, () => dado, xHoles.filter((o) => o.y0 < dado), 0.6, 'flat');
    cladWall(k, B, P.clad, steel, 'x', s * hw, clad, -hd, hd, dado, () => sgTop(s * hw), xHoles.map((o) => ({ ...o, y0: Math.max(o.y0, dado) })), 0.5);
    band(k, B, P.flash, 'x', s * hw, -hd, hd, dado + 0.02, 0.05, 0.07, xHoles, trimW, 0.06);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = sgTop(sx * hw);
    k.add(bx(0.09, top - dado, 0.09).translate(sx * (hw - 0.01), (dado + top) / 2, sz * (hd - 0.01)), P.flash, B, { w: trimW });
  }
  // the roller shutters: the curtain's slats, its bottom rail and handle, the guides proud either side, the coil box over
  for (const o of shutters) {
    const am = (o.a0 + o.a1) / 2, wd = o.a1 - o.a0;
    k.add(bx(wd, o.y1 - o.y0, 0.04, 0.45).translate(am, (o.y0 + o.y1) / 2, hd - 0.1), P.shutter, B, { uv: 'band', w: { foot: 1, runs: 0.7, rust: 0.4, dust: 0.3 } });
    k.add(bx(wd, 0.07, 0.06).translate(am, o.y0 + 0.035, hd - 0.1), P.guide, B, { w: trimW });
    k.add(bx(0.18, 0.03, 0.04).translate(am, o.y0 + 0.55, hd - 0.06), P.handle, B);
    for (const x of [o.a0 - 0.05, o.a1 + 0.05]) k.add(bx(0.1, o.y1 - o.y0 + 0.05, 0.16).translate(x, (o.y0 + o.y1 + 0.05) / 2, hd - 0.04), P.guide, B, { w: trimW });
    k.add(bx(wd + 0.3, 0.48, 0.42, 0.6).translate(am, o.y1 + 0.24, hd + 0.13), P.box, B, { w: steel });
    k.add(bx(0.16, 0.2, 0.14).translate(am + 0.9, o.y1 + 0.6, hd + 0.07), P.lamp, B);
    k.add(bx(0.13, 0.015, 0.12).translate(am + 0.9, o.y1 + 0.495, hd + 0.075), P.lens, B, { jitter: 0.01 });
  }
  // the sign over the doors
  k.add(bx(3.0, 0.5, 0.05).translate(-2.0, 4.6, hd + 0.025), P.sign, B, { w: { runs: 0.7, rust: 0.3 } });
  k.add(bx(2.6, 0.12, 0.006).translate(-2.0, 4.62, hd + 0.053), P.signInk, B);
  // the ribbon windows on both sides; the personnel door on the +x side under its lamp
  for (const s of [-1, 1] as const) windowIn(k, B, P.frame, P.glass, trimW, 'x', s * hw, sideWin, 4, inset);
  doorIn(k, B, 'x', hw, pdoor, trimW, steel, { frame: P.frame, door: P.door, glass: P.glass, kick: P.kick, handle: P.handle, ink: P.ink });
  k.add(bx(0.14, 0.18, 0.16).translate(hw + 0.08, 2.5, (pdoor.a0 + pdoor.a1) / 2), P.lamp, B);
  // the roof: profiled sheet down the slope with two courses of roof lights, the gutter on its low (+x) edge, fascias
  const roofW = w + 2 * SG.over, roofD = d + 0.6, t = 0.035, R: Piece = 'sheet:roof';
  const yMid = sgTop(0) + t / 2 / Math.cos(SG_PITCH), yAt = (x: number): number => yMid - Math.tan(SG_PITCH) * x;
  const roofTop = (x: number): number => sgTop(x) + t / Math.cos(SG_PITCH);
  k.add(pitchRoofPlane(bx(roofW / Math.cos(SG_PITCH), t, roofD, 0.8), 'x', 1, SG_PITCH, 'skillion').translate(0, yMid, 0), P.roof, R,
    { uv: 'roof', w: { rust: 0.5, dust: 0.6, runs: 0.3 } });
  for (const [zc, xs] of [[-2.8, [-3.0, 0.4, 3.4]], [2.8, [-1.6, 1.9]]] as const) for (const xc of xs) {
    const lw = 1.25 / Math.cos(SG_PITCH);
    k.add(pitchRoofPlane(bx(lw, 0.006, 0.95), 'x', 1, SG_PITCH, 'skillion').translate(xc, yMid + t / 2 / Math.cos(SG_PITCH) + 0.003 - Math.tan(SG_PITCH) * xc, zc),
      P.light, R, { uv: 'roof', w: { dust: 0.8 } });
  }
  for (const sx of [-1, 1]) {
    const x = sx * (roofW / 2 - 0.015);
    k.add(bx(0.03, 0.18, roofD).translate(x, yAt(x) - 0.102, 0), P.flash, R, { w: trimW });
  }
  for (const sz of [-1, 1]) {
    const x0 = -roofW / 2, x1 = roofW / 2;
    k.add(prism([[x0, yAt(x0) - 0.192], [x1, yAt(x1) - 0.192], [x1, yAt(x1) - 0.012], [x0, yAt(x0) - 0.012]],
      sz * roofD / 2 - 0.015, sz * roofD / 2 + 0.015), P.flash, R, { w: trimW });
  }
  const gx = roofW / 2 + 0.07, gy = yAt(roofW / 2) - 0.16;
  k.add(bx(0.12, 0.09, roofD - 0.02).translate(gx, gy, 0), P.flash, R, { w: trimW });
  for (let i = 0; i < 6; i++) k.add(bx(0.08, 0.02, 0.03).translate(gx - 0.05, gy + 0.055, -roofD / 2 + 0.5 + i * (roofD - 1) / 5), P.flash, R);
  for (const [di, z] of [-hd + 0.15, hd - 0.15].entries()) {
    const D: Piece = `small:downpipe-${di}`;
    k.add(cyl(0.045, 0.045, gy - 0.045 - 0.05, 8).translate(gx, (gy - 0.045 + 0.05) / 2, z), P.flash, D, { w: trimW });
    k.add(bx(0.3, 0.05, 0.22).translate(gx - 0.02, 0.025, z), P.concrete, D, { w: { dust: 0.6 } });
  }
  // the heater's flue up through the roof to its cap, a collar on the sheet, two guys to eyes on the roof
  {
    const F: Piece = 'small:flue', fx = 3.65, fz = -4.45, base = roofTop(fx), top = 6.0;
    k.add(cyl(0.12, 0.12, top - base + 0.02, 12).translate(fx, (top + base - 0.02) / 2, fz), P.flue, F, { w: { rust: 0.9, runs: 0.5 } });
    k.add(new THREE.ConeGeometry(0.24, 0.18, 12, 1).translate(fx, top + 0.17, fz), P.flue, F, { w: { rust: 0.9 } });
    for (const dx of [-0.07, 0.07]) k.add(bx(0.02, 0.08, 0.02).translate(fx + dx, top + 0.04, fz), P.flue, F);
    k.add(cyl(0.2, 0.2, 0.05, 12).translate(fx, base + 0.02, fz), P.flue, F, { w: { rust: 0.7 } });
    k.add(cyl(0.14, 0.14, 0.06, 12).translate(fx, top - 0.6, fz), P.flue, F, { w: { rust: 0.7 } });
    for (const [ex, ez] of [[fx - 1.4, fz + 0.6], [fx - 0.2, fz + 1.5]]) {
      k.add(bx(0.06, 0.05, 0.06).translate(ex, roofTop(ex) + 0.02, ez), P.steel, F);
      k.add(bar([fx, top - 0.6, fz], [ex, roofTop(ex) + 0.045, ez], 0.012, 0.012), P.steel, F);
    }
  }
  // the compressor behind: its pad, the air receiver on its saddles, the unit, the pipe into the wall
  {
    const C: Piece = 'small:compressor', cx = -3.25, cz = -hd - 0.66;
    k.add(bx(2.8, 0.12, 1.6).translate(cx, 0.06, cz), P.concrete, 'ground:pad', { w: { dust: 0.7, foot: 0.4 } });
    for (const dx of [-0.55, 0.55]) k.add(bx(0.12, 0.3, 0.7).translate(cx - 0.4 + dx, 0.27, cz), P.steel, C, { w: trimW });
    k.add(cyl(0.36, 0.36, 1.7, 14).rotateZ(Math.PI / 2).translate(cx - 0.4, 0.78, cz), P.tank, C, { w: { rust: 0.6, runs: 0.5, dust: 0.4 } });
    for (const s of [-1, 1]) k.add(cyl(0.3, 0.36, 0.08, 14).rotateZ(Math.PI / 2).translate(cx - 0.4 + s * 0.89, 0.78, cz), P.tank, C, { w: { rust: 0.6 } });
    k.add(bx(0.8, 0.62, 0.62, 0.4).translate(cx + 0.85, 0.12 + 0.31, cz), P.box, C, { w: { runs: 0.6, rust: 0.4, dust: 0.5 } });
    k.add(cyl(0.025, 0.025, 0.4, 6).translate(cx - 0.4, 1.16, cz), P.steel, C);
    k.add(bar([cx - 0.4, 1.34, cz], [cx - 0.4, 1.34, -hd + 0.005], 0.05, 0.05), P.steel, C, { w: trimW });
  }
  return ctx.merge('servicegarage', k.out);
}

function serviceGarageShadow(): THREE.BufferGeometry {
  const { w, d, floor } = SG, roofW = w + 2 * SG.over, roofD = d + 0.6;
  return solid([
    bx(w, sgTop(0) - floor, d).translate(0, (sgTop(0) + floor) / 2, 0),
    bx(roofW / Math.cos(SG_PITCH), 0.2, roofD).rotateZ(-SG_PITCH).translate(0, sgTop(0) + 0.06, 0),
    bx(0.24, 1.3, 0.24).translate(3.65, 5.4, -4.45),
    bx(2.6, 1.0, 1.45).translate(-3.25, 0.5, -d / 2 - 0.66),
  ]);
}

// ------------------------------------------------------------------------------------------------ the corner office

// The old office's solids (structureKit makeCornerOffice): the body 8.4 x 6.6 x 8.4 under a flat roof to 6.8 m; four
// windows a floor on its two street faces (+z, +x) at 1.66-2.84 and 4.16-5.34 m, bands under each floor's windows; the
// door 1.5 x 2.55 at x -2.55 on the front under a canopy (3.2 x 1.25) on two posts at x -3.85 and -1.25, z 5.24; a plant
// box 2.5 x 0.74 x 2.2 on the roof at (1.65, -1.5).
const CO = { w: 8.4, d: 8.4, h: 6.6, floor: 0.12, inset: 0.12, wall: 0.06, para: 0.42 };
const CO_PAL = {
  render: 0xa69e8f, base: 0x6d6961, band: 0x8f887a, sill: 0xb4ad9e, frame: 0x3b3a36, glass: 0x56717a, blind: 0x9e9478,
  room: 0x2a2826, roof: 0x3f3e3c, cope: 0x8a8578, door: 0x4a3d33, kick: 0x5b5f5e, handle: 0xa7aaa6, ink: 0x2b2b29,
  canopy: 0x5b6163, post: 0x33383a, plant: 0x8d8b84, blade: 0x4a4e4f, sign: 0x2f4f6f, signInk: 0xe0d8c0, pipe: 0x55595a,
  mast: 0x3a3d3c,
};

function buildCornerOffice(ctx: TownKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0xc0f1);
  const { w, d, h, floor, inset, wall } = CO, hw = w / 2, hd = d / 2, P = CO_PAL, B: Piece = 'block:building';
  const render: Weather = { foot: 0.6, runs: 1.0, mottle: 0.8, dust: 0.2 };
  const trimW: Weather = { foot: 0.4, runs: 0.6, rust: 0.2 };
  k.add(bx(w + 0.16, floor + 0.08, d + 0.16).translate(0, (floor - 0.08) / 2, 0), P.base, 'ground:plinth', { w: { foot: 0.5, dust: 0.6 } });
  k.add(bx(w - 2 * inset, h - floor - 0.02, d - 2 * inset).translate(0, (h + floor - 0.02) / 2, 0), P.room, B, { jitter: 0.02, inner: true });
  const xs = [-2.65, -0.9, 0.9, 2.65];
  const win = (a: number, y: number): Opening => ({ a0: a - 0.56, a1: a + 0.56, y0: y - 0.59, y1: y + 0.59 });
  const door: Opening = { a0: -3.3, a1: -1.8, y0: floor, y1: 2.55 };
  const fan: Opening = { a0: -3.3, a1: -1.8, y0: 2.7, y1: 3.05 };
  const front = [door, fan, ...xs.slice(1).map((a) => win(a, 2.25)), ...xs.map((a) => win(a, 4.75))];
  const right = [...xs.map((a) => win(a, 2.25)), ...xs.map((a) => win(a, 4.75))];
  cladWall(k, B, P.render, render, 'z', hd, wall, -hw, hw, floor, () => h, front, 0.75, 'flat');
  cladWall(k, B, P.render, render, 'x', hw, wall, -hd, hd, floor, () => h, right, 0.75, 'flat');
  cladWall(k, B, P.render, render, 'z', -hd, wall, -hw, hw, floor, () => h, [], 1.0, 'flat');
  cladWall(k, B, P.render, render, 'x', -hw, wall, -hd, hd, floor, () => h, [], 1.0, 'flat');
  // the base course, the sill courses under each floor's windows, the cornice (street faces) and the quoins at the corner
  for (const s of [-1, 1]) {
    band(k, B, P.base, 'z', s * hd, -hw, hw, floor + 0.26, 0.52, 0.04, s > 0 ? [door] : [], trimW, 0.02);
    band(k, B, P.base, 'x', s * hw, -hd + 0.04, hd - 0.04, floor + 0.26, 0.52, 0.04, [], trimW, 0.02);
  }
  for (const y of [1.49, 3.99]) {
    band(k, B, P.band, 'z', hd, -hw, hw, y, 0.18, 0.06, y < 2 ? [door] : [], trimW, 0.02);
    band(k, B, P.band, 'x', hw, -hd + 0.06, hd + 0.06, y, 0.18, 0.06, [], trimW);
  }
  band(k, B, P.band, 'z', hd, -hw, hw + 0.13, h - 0.12, 0.24, 0.13, [], trimW);
  band(k, B, P.band, 'x', hw, -hd, hd, h - 0.12, 0.24, 0.13, [], trimW);
  for (let i = 0; i < 9; i++) {
    const y = floor + 0.55 + i * 0.66, long = i % 2 === 0;
    k.add(bx(long ? 0.52 : 0.32, 0.3, 0.05).translate(hw - (long ? 0.26 : 0.16), y + 0.15, hd + 0.025), P.sill, B, { w: trimW });
    k.add(bx(0.05, 0.3, long ? 0.32 : 0.52).translate(hw + 0.025, y + 0.15, hd - (long ? 0.16 : 0.26)), P.sill, B, { w: trimW });
  }
  // the windows, a mullion each, some behind blinds; stone sills
  const blind = (a: number, y: number): boolean => (Math.round(a * 10 + y * 7) % 3 + 3) % 3 === 0;
  for (const o of front.slice(2)) {
    const a = (o.a0 + o.a1) / 2, y = (o.y0 + o.y1) / 2;
    windowIn(k, B, P.frame, blind(a, y) ? P.blind : P.glass, trimW, 'z', hd, o, 2, inset);
  }
  for (const o of right) {
    const a = (o.a0 + o.a1) / 2, y = (o.y0 + o.y1) / 2;
    windowIn(k, B, P.frame, blind(-a, y) ? P.blind : P.glass, trimW, 'x', hw, o, 2, inset);
  }
  // the door and its fanlight, a step before it
  doorIn(k, B, 'z', hd, door, trimW, { foot: 0.6, runs: 0.4 }, { frame: P.frame, door: P.door, glass: P.glass, kick: P.kick, handle: P.handle, ink: P.ink });
  windowIn(k, B, P.frame, P.glass, trimW, 'z', hd, fan, 3, inset);
  k.add(bx(1.9, 0.12, 0.5).translate(-2.55, 0.06, hd + 0.25), P.sill, 'ground:step', { w: { foot: 0.6, dust: 0.6 } });
  // the canopy over the door on its two posts
  {
    const postZ = hd + 1.04, beamTop = 3.0, ledgerY = 3.2, C: Piece = 'sheet:canopy';
    for (const [i, x] of [-3.85, -1.25].entries()) {
      const Pp: Piece = i === 0 ? 'post:canopy-l' : 'post:canopy-r';
      k.add(bx(0.1, beamTop - 0.12 - 0.01, 0.1).translate(x, (beamTop - 0.12 + 0.01) / 2, postZ), P.post, Pp, { w: trimW });
      k.add(bx(0.22, 0.012, 0.22).translate(x, 0.006, postZ), P.post, Pp);
    }
    k.add(bx(2.8, 0.12, 0.1).translate(-2.55, beamTop - 0.06, postZ), P.post, C, { w: trimW });
    k.add(bx(3.2, 0.1, 0.06).translate(-2.55, ledgerY - 0.05, hd + 0.03), P.post, C, { w: trimW });
    const run = postZ + 0.2 - hd, fall = Math.atan2(ledgerY - beamTop, postZ - hd), tp = 0.03;
    const zc = hd + run / 2, yc = ledgerY - Math.tan(fall) * (zc - hd) + tp / 2 / Math.cos(fall);
    k.add(pitchSkillionRoof(bx(3.2, tp, run / Math.cos(fall), 0.5), 'z', 1, fall).translate(-2.55, yc, zc), P.canopy, C,
      { uv: 'sheet', w: { rust: 0.3, dust: 0.6 } });
    const yEdge = ledgerY - Math.tan(fall) * run;
    k.add(bx(3.2, 0.1, 0.03).translate(-2.55, yEdge - 0.05, hd + run - 0.015), P.post, C, { w: trimW });
  }
  // the corner sign on its bracket at the first floor
  {
    const S: Piece = 'small:sign', y = 4.1;
    k.add(bar([hw - 0.04, y + 0.57, hd + 0.03], [hw + 0.62, y + 0.57, hd + 0.69], 0.05, 0.05), P.post, S);
    k.add(bx(0.05, 1.0, 0.05).translate(hw + 0.02, y + 0.2, hd + 0.02), P.post, S);
    const board = bx(0.82, 0.62, 0.06).rotateY(-Math.PI / 4).translate(hw + 0.36, y + 0.24, hd + 0.36);
    k.add(board, P.sign, S, { w: { runs: 0.6 } });
    for (const s of [-1, 1]) k.add(bx(0.6, 0.1, 0.006).rotateY(-Math.PI / 4).translate(hw + 0.36 + s * 0.023, y + 0.3, hd + 0.36 - s * 0.023), P.signInk, S);
  }
  // the parapet and its coping round the roof; downpipes at the back corners
  parapet(k, 'sheet:roof', P.render, P.cope, P.roof, hw, hd, h, CO.para, 0.22, 0.05, render, { dust: 0.7 });
  for (const [i, [x, z]] of [[-hw - 0.07, -hd + 0.4], [hw + 0.07, -hd + 0.4]].entries()) {
    const D: Piece = `small:downpipe-${i}`;
    k.add(bx(0.12, 0.1, 0.12).translate(x - Math.sign(x) * 0.03, h + 0.06, z), P.pipe, D, { w: trimW });
    k.add(cyl(0.05, 0.05, h + 0.01 - 0.05, 8).translate(x, (h + 0.01 + 0.05) / 2, z), P.pipe, D, { w: trimW });
    k.add(bx(0.32, 0.05, 0.24).translate(x, 0.025, z), P.base, D, { w: { dust: 0.6 } });
  }
  // the plant room on the roof: its walls, a louvre, a door, its coping; an aerial on its roof
  {
    const Pl: Piece = 'block:plant', cx = 1.65, cz = -1.5, pw = 2.5, pd = 2.2, ph = 1.2, y0 = h + 0.04;
    k.add(bx(pw, ph, pd, 0.5).translate(cx, y0 + ph / 2, cz), P.plant, Pl, { w: { runs: 0.8, mottle: 0.6, dust: 0.3 } });
    k.add(bx(pw + 0.1, 0.05, pd + 0.1).translate(cx, y0 + ph + 0.025, cz), P.cope, Pl, { w: { dust: 0.7 } });
    const lv: Opening = { a0: cx - 0.5, a1: cx + 0.5, y0: y0 + 0.35, y1: y0 + 0.9 };
    k.add(bx(1.0, 0.55, 0.004).translate(cx, (lv.y0 + lv.y1) / 2, cz + pd / 2 + 0.002), P.room, Pl, { jitter: 0.02 });
    louvre(k, Pl, P.frame, P.blade, 'z', cz + pd / 2 + 0.004, lv, 5, trimW, 1);
    k.add(bx(0.8, 1.0, 0.04).translate(cx + pw / 2 + 0.02, y0 + 0.5, cz), P.door, Pl, { w: { runs: 0.5 } });
    const A: Piece = 'small:aerial', ax = cx - 0.8, az = cz - 0.6, ay = y0 + ph + 0.05;
    k.add(bx(0.12, 0.06, 0.12).translate(ax, ay + 0.03, az), P.mast, A);
    k.add(cyl(0.025, 0.03, 1.5, 6).translate(ax, ay + 0.06 + 0.75, az), P.mast, A);
    k.add(bx(0.05, 0.05, 0.2).translate(ax, ay + 1.2, az + 0.1), P.mast, A);
    k.add(cyl(0.3, 0.26, 0.05, 14).rotateX(Math.PI / 2 - 0.5).translate(ax, ay + 1.2, az + 0.23), P.plant, A, { w: { runs: 0.5 } });
    k.add(cyl(0.012, 0.012, 0.3, 6).rotateX(Math.PI / 2 - 0.5).translate(ax, ay + 1.27, az + 0.36), P.mast, A);
  }
  return ctx.merge('corneroffice', k.out);
}

function cornerOfficeShadow(): THREE.BufferGeometry {
  const { w, d, h, floor, para } = CO, hd = d / 2;
  return solid([
    bx(w, h + para - floor, d).translate(0, (h + para + floor) / 2, 0),
    bx(2.5, 1.25, 2.2).translate(1.65, h + 0.66, -1.5),
    bx(3.2, 0.1, 1.24).rotateX(0.18).translate(-2.55, 3.1, hd + 0.62),
    bx(0.1, 3.0, 0.1).translate(-3.85, 1.5, hd + 1.04), bx(0.1, 3.0, 0.1).translate(-1.25, 1.5, hd + 1.04),
  ]);
}

// ------------------------------------------------------------------------------------------------ the kits

/** A redesigned kit: its build from its own stream (the old build's draws already spent) and its caster. */
export interface TownKitBuilders {
  build(rng: Rng): THREE.BufferGeometry;
  /** Solids in its own shape for the cascades: plain position, normal and uv, no stream draws. */
  shadow(): THREE.BufferGeometry;
}

export const TOWN_KIT_IDS = ['transformershed', 'securityoffice', 'servicegarage', 'corneroffice'] as const;
export type TownKitId = typeof TOWN_KIT_IDS[number];

/** The redesigned town and works light kits by id, merged through structureKit's certifying merge. */
export function createTownKits(ctx: TownKitContext): Record<TownKitId, TownKitBuilders> {
  return {
    transformershed: { build: (rng) => buildTransformerShed(ctx, rng), shadow: transformerShedShadow },
    securityoffice: { build: (rng) => buildSecurityOffice(ctx, rng), shadow: securityOfficeShadow },
    servicegarage: { build: (rng) => buildServiceGarage(ctx, rng), shadow: serviceGarageShadow },
    corneroffice: { build: (rng) => buildCornerOffice(ctx, rng), shadow: cornerOfficeShadow },
  };
}
