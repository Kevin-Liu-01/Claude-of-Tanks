// src/world/maps/fieldworksKit.ts — the field works' kit (props census #10, fieldworks and military positions: the
// sandbags, the wire, the tents, the ammunition boxes and the hedgehogs).
//
// Extract-then-own (2026-10-14): the builders moved here byte for byte from the hot kit files — inhabitKit.ts (the
// sandbag remnant, the ammunition boxes, the field tent, the barbed wire; their primitives copied with them) and
// sceneryKit.ts (the sandbag stacks, the burlap, the nests' bedding) — and the hedgehog's beam from props.ts, so the
// family's rebuild works here and the hot files are left to their owners. Every builder draws what it drew before.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box as propBox } from '../propGeometry.ts';
// (b45: a rebuilt kind spends its legacy builder's draws exactly)
import { spentDraws } from './brokenDraws.ts';

type Rng = () => number;
type Palette = readonly [number, number, number];

// --- the inhabiting kit's primitives (inhabitKit.ts, copied) -------------------------------------------------------
const _c = new THREE.Color();

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv: number): T {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

function cyl(r0: number, r1: number, h: number, seg = 7): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  return scaleUV(g, 1, 1);
}

/** Author in HSL (sRGB) like the rest of the world code; store linear. */
function paint<T extends THREE.BufferGeometry>(
  geo: T,
  h: number,
  s: number,
  l: number,
  jit: number,
  rng: Rng,
): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(h, s, Math.max(0.02, l + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const WOOD: Palette = [0.075, 0.38, 0.30];
const RUST: Palette = [0.05, 0.55, 0.22];
const IRON: Palette = [0.60, 0.05, 0.13];
const OLIVE_D: Palette = [0.20, 0.22, 0.145];
const TENTCANVAS: Palette = [0.10, 0.16, 0.295];
const TENTCANVAS_D: Palette = [0.095, 0.14, 0.225];

function P<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  return paint(geo, pal[0], pal[1], pal[2], jit, rng);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(
    parts.map((part) => (part.index ? part.toNonIndexed() : part)),
    false,
  );
  if (!geometry) throw new Error('inhabiting prop geometry merge produced no result');
  return geometry;
}

/** scatter of flat planks (broken-state filler), painted or UV'd */
function plankScatter(
  n: number,
  len: number,
  wid: number,
  rad: number,
  rng: Rng,
  pal: Palette | null = null,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * rad;
    const p = box(len * (0.5 + rng() * 0.6), 0.045, wid * (0.7 + rng() * 0.5));
    p.rotateY(rng() * Math.PI);
    p.rotateX((rng() - 0.5) * 0.16);
    p.translate(Math.cos(a) * rr, 0.05 + rng() * 0.08, Math.sin(a) * rr);
    parts.push(pal ? P(p, pal, 0.14, rng) : p);
  }
  return parts;
}

// --- sandbag emplacement (broken state for the sourced baked intact) --------
// The intact geometry is the licensed baked model (props.ts LOCAL kinds need
// bakedGeometry, so the kind entries live there); this is the shared
// driven-through state: bags burst, split and spilled.
export function bSandbagBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const HESS: Palette = [0.105, 0.22, 0.46];
  for (let k = 0; k < 11; k++) { // spilled single bags
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 1.9;
    const bag = new THREE.SphereGeometry(0.26 + rng() * 0.08, 6, 5);
    bag.scale(1.35, 0.42 + rng() * 0.12, 0.85);
    bag.rotateY(rng() * Math.PI);
    bag.translate(Math.cos(a) * rr, 0.10, Math.sin(a) * rr * 0.7);
    parts.push(P(bag, HESS, 0.14, rng));
  }
  // low surviving bag course at one end
  for (let k = 0; k < 3; k++) {
    const bag = new THREE.SphereGeometry(0.28, 6, 5);
    bag.scale(1.4, 0.5, 0.9);
    bag.translate(-1.2 + k * 0.62, 0.13, -0.5 + (rng() - 0.5) * 0.2);
    parts.push(P(bag, HESS, 0.12, rng));
  }
  return merge(parts);
}

// --- ammunition boxes (stacked pair + strewn broken state) ------------------
// (b45) the legacy builds: retired, but their draws are spent exactly (brokenDraws.ts spentDraws) so every later
// pool's geometry and every later placement read the map's props stream as before
function bAmmoboxLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const spots = [[0, 0, 0, 0.14], [0.14, 0.36, -0.08, -0.3], [-0.5, 0, 0.32, 0.5]];
  for (const [px, py, pz, ry] of spots) {
    const bx = box(0.85, 0.36, 0.42);
    bx.rotateY(ry);
    parts.push(P(bx.translate(px, py + 0.18, pz), OLIVE_D, 0.10, rng));
    const lid = box(0.87, 0.06, 0.44);
    lid.rotateY(ry);
    parts.push(P(lid.translate(px, py + 0.38, pz), [OLIVE_D[0], OLIVE_D[1], OLIVE_D[2] * 1.25], 0.08, rng));
  }
  return merge(parts);
}
function bAmmoboxBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 3; k++) { // burst boxes, lids blown
    const bx = box(0.8, 0.14, 0.4);
    bx.rotateY(rng() * Math.PI);
    bx.rotateX((rng() - 0.5) * 0.3);
    parts.push(P(bx.translate((rng() - 0.5) * 1.4, 0.08, (rng() - 0.5) * 1.2), OLIVE_D, 0.12, rng));
  }
  parts.push(...plankScatter(4, 0.5, 0.14, 0.8, rng, OLIVE_D));
  return merge(parts);
}

// --- ammunition crates (b45; gauntlet wave 270 on Redrock: "plain cube ammo crates with hard edges, no wear, scale or
// detail") ------------------------------------------------------------------------------------------------------------
// Painted wooden ammunition crates as they are built: the body's boards on two skids, an end cleat framing each end
// with a rope becket through it, a lid with two hasps on the front and hinge straps behind, the boards' seam, the
// markings stencilled in faded yellow. The olive is worn through to the wood at the cleats, the skids and the lid's
// edge, dusted toward the foot and darker where the crate meets what it sits on. Two side by side, a third across their
// seam resting on their lids, a steel ammunition can beside them for scale. On the props' vehicle finish (props.ts
// mats.vehicle: orange-peel, chips, panel grime under a vertex-colour livery), so it reads as painted wood and steel.
// The wood smash and the 'ammo' blast stay the kind's (propSounds.ts, effects.ts); the record, footprint and draws do too.
// (b45 round 2; wave 281 on the stack: "no stencilled markings, wear, dust or ground contact shadow", and at chase range
// "a small grey block that does not read as an ammunition crate") the olive a step lighter so the cleats, the lettering
// and the wear read in the sun; the worn wood paler against it
const CRATE_PAINT: Palette = [0.20, 0.22, 0.19];
const CRATE_LID: Palette = [0.20, 0.21, 0.21];
const CRATE_WORN: Palette = [0.10, 0.18, 0.41];
const CRATE_SCUFF: Palette = [0.10, 0.14, 0.52];
const CRATE_GRIME: Palette = [0.09, 0.16, 0.10];
const CRATE_SEAM: Palette = [0.20, 0.18, 0.07];
const HEMP: Palette = [0.11, 0.28, 0.50];
const STENCIL_YELLOW: Palette = [0.14, 0.50, 0.62];
const HARDWARE: Palette = [0.58, 0.05, 0.19];
const DUST_TINT: Palette = [0.09, 0.18, 0.54];
/**
 * A stencil face for the crates' lettering: each glyph 3 cells wide and 5 tall, rows read top to bottom, a cell painted
 * where its bit is set (the stencil's bridges leave the cells apart). The digits and the few letters an ammunition
 * crate's markings use.
 */
const STENCIL_GLYPHS: Readonly<Record<string, readonly number[]>> = Object.freeze({
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  A: [7, 5, 7, 5, 5], C: [7, 4, 4, 4, 7], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], G: [7, 4, 5, 5, 7], H: [5, 5, 7, 5, 5],
  L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [5, 7, 7, 7, 5], O: [7, 5, 5, 5, 7], P: [7, 5, 7, 4, 4], R: [7, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2], X: [5, 5, 2, 5, 5], '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], '/': [1, 1, 2, 4, 4],
});
/** A stencilled line of text on a face toward +z, its left end at (x, y), each cell `cell` metres: one quad a run of cells. */
function stencilLine(text: string, x: number, y: number, cell: number, o: Rng): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let cx = x;
  for (const ch of text) {
    const rows = STENCIL_GLYPHS[ch];
    if (rows) {
      rows.forEach((bits, r) => {
        for (let c = 0; c < 3; c++) {
          if (!(bits & (4 >> c))) continue;
          let run = 1;
          while (c + run < 3 && bits & (4 >> (c + run))) run++;
          out.push(P(facePlane(run * cell * 0.86, cell * 0.86), STENCIL_YELLOW, 0.05, o)
            .translate(cx + (c + run / 2) * cell, y - (r + 0.5) * cell, 0));
          c += run - 1;
        }
      });
    }
    cx += cell * 4;
  }
  return out;
}
/** A crate's length, width and height (its lid on, its skids under it), metres. */
const AMMO_CRATE = Object.freeze({ L: 0.78, W: 0.30, H: 0.27 });

/** A painted mark or a seam laid flat on a face: a quad facing +z, `w` by `h`. */
function facePlane(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}

/** The crate's dust toward its foot and on its tops, and its contact: the paint darker where the crate sits. */
function dustAndContact(geo: THREE.BufferGeometry, rng: Rng): THREE.BufferGeometry {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), col = geo.getAttribute('color');
  _c.setHSL(DUST_TINT[0], DUST_TINT[1], DUST_TINT[2] + (rng() - 0.5) * 0.06, THREE.SRGBColorSpace);
  const dr = _c.r, dg = _c.g, db = _c.b;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const foot = 1 - Math.min(1, Math.max(0, y / 0.15));
    const top = Math.max(0, nrm.getY(i) - 0.8) * 5;
    const t = 0.6 * foot * foot + 0.26 * top;
    const shade = y < 0.012 ? 0.7 : 1;
    col.setXYZ(i, (col.getX(i) + (dr - col.getX(i)) * t) * shade,
      (col.getY(i) + (dg - col.getY(i)) * t) * shade, (col.getZ(i) + (db - col.getZ(i)) * t) * shade);
  }
  return geo;
}

/** One wooden ammunition crate, its skids on y = 0, its length along x, its front (hasps, markings) toward +z. */
function ammoCrate(o: Rng): THREE.BufferGeometry {
  const { L, W, H } = AMMO_CRATE, skid = 0.022, lidT = 0.024, body = H - skid - lidT, top = skid + body;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) parts.push(P(box(0.05, skid, W - 0.02), CRATE_WORN, 0.08, o).translate(sx * (L / 2 - 0.13), skid / 2, 0));
  parts.push(P(box(L - 0.012, body, W - 0.012), CRATE_PAINT, 0.05, o).translate(0, skid + body / 2, 0));
  // the boards' seam along both faces, and the lid's hinge line along the back
  for (const sz of [-1, 1]) {
    const seam = P(facePlane(L - 0.05, 0.006), CRATE_SEAM, 0.02, o);
    if (sz < 0) seam.rotateY(Math.PI);
    parts.push(seam.translate(0, skid + body * 0.5, sz * (W / 2 - 0.0045)));
  }
  parts.push(P(box(L, lidT, W + 0.004), CRATE_LID, 0.05, o).translate(0, top + lidT / 2, 0));
  parts.push(P(box(L - 0.02, 0.006, 0.006), CRATE_WORN, 0.10, o).translate(0, top + lidT - 0.003, W / 2 + 0.002));
  // the end cleats: a frame proud of each end, the rope becket hanging between its rails
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 + 0.006);
    for (const sz of [-1, 1]) parts.push(P(box(0.018, body + 0.004, 0.032), CRATE_WORN, 0.10, o).translate(x, skid + body / 2, sz * (W / 2 - 0.016)));
    for (const y of [skid + 0.019, top - 0.019]) parts.push(P(box(0.018, 0.03, W - 0.064), CRATE_WORN, 0.10, o).translate(x, y, 0));
    const rx = sx * (L / 2 + 0.022), ry = skid + body * 0.6;
    for (const sz of [-1, 1]) {
      parts.push(P(box(0.012, 0.055, 0.012), HEMP, 0.08, o).translate(rx, ry - 0.0275, sz * 0.035));
      parts.push(P(box(0.02, 0.02, 0.02), HEMP, 0.08, o).translate(rx, ry + 0.004, sz * 0.035));
    }
    parts.push(P(box(0.012, 0.012, 0.082), HEMP, 0.08, o).translate(rx, ry - 0.055, 0));
  }
  // the hasps and their staples on the front, the hinge straps behind
  for (const sx of [-1, 1]) {
    parts.push(P(box(0.032, 0.05, 0.006), HARDWARE, 0.05, o).translate(sx * L * 0.28, top - 0.008, W / 2 + 0.004));
    parts.push(P(box(0.014, 0.014, 0.012), HARDWARE, 0.05, o).translate(sx * L * 0.28, top - 0.04, W / 2 + 0.006));
    parts.push(P(box(0.05, 0.03, 0.005), HARDWARE, 0.05, o).translate(sx * L * 0.3, top - 0.004, -W / 2 - 0.003));
  }
  // the markings, stencilled in faded yellow: the round and its count in letters a hand high on the front, the lot below,
  // a coloured band at one end, the lot again on the lid
  const front = W / 2 + 0.0016;
  const LINES = [['105MM HE', 'LOT 44-12'], ['CTG 7.62', 'LOT 12-08'], ['105MM AP', 'LOT 38-07']] as const;
  const [line1, line2] = LINES[Math.floor(o() * LINES.length) % LINES.length];
  for (const g of stencilLine(line1, -L / 2 + 0.06, skid + body * 0.8, 0.0115, o)) parts.push(g.translate(0, 0, front));
  for (const g of stencilLine(line2, -L / 2 + 0.06, skid + body * 0.42, 0.0085, o)) parts.push(g.translate(0, 0, front));
  parts.push(P(facePlane(0.05, body * 0.62), STENCIL_YELLOW, 0.04, o).translate(L * 0.37, skid + body * 0.52, front));
  for (const g of stencilLine(line2, -0.2, 0, 0.0095, o)) {
    g.rotateX(-Math.PI / 2);
    parts.push(g.translate(0, top + lidT + 0.0016, 0.06));
  }
  // the wear: the paint scuffed through at the lid's front corners and along the foot, grime run down from the hasps
  for (const sx of [-1, 1]) {
    parts.push(P(facePlane(0.05 + o() * 0.04, 0.012 + o() * 0.01), CRATE_SCUFF, 0.08, o).translate(sx * (L / 2 - 0.05), top - 0.01, front + 0.0004));
    parts.push(P(facePlane(0.006, 0.05 + o() * 0.04), CRATE_GRIME, 0.06, o).translate(sx * L * 0.28, top - 0.07, front + 0.0004));
  }
  parts.push(P(facePlane(L * (0.3 + o() * 0.3), 0.01), CRATE_SCUFF, 0.1, o).translate((o() - 0.5) * L * 0.3, skid + 0.008, front + 0.0004));
  return dustAndContact(merge(parts), o);
}

/** A steel ammunition can (the belt box): body, lid, the latch at one end, the carry handle on the lid, a marking. */
function ammoCan(o: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(P(box(0.27, 0.165, 0.14), CRATE_PAINT, 0.05, o).translate(0, 0.0825, 0));
  parts.push(P(box(0.28, 0.022, 0.15), CRATE_LID, 0.05, o).translate(0, 0.176, 0));
  parts.push(P(box(0.012, 0.06, 0.04), HARDWARE, 0.05, o).translate(0.141, 0.15, 0));
  for (const sx of [-1, 1]) parts.push(P(box(0.012, 0.02, 0.012), HARDWARE, 0.05, o).translate(sx * 0.05, 0.197, 0));
  parts.push(P(box(0.11, 0.012, 0.014), HARDWARE, 0.05, o).translate(0, 0.21, 0));
  for (const g of stencilLine('7.62', -0.11, 0.135, 0.009, o)) parts.push(g.translate(0, 0, 0.0716));
  return dustAndContact(merge(parts), o);
}

/** (b45 round 2) how far the stack sits into the ground: its skids bedded in the sand or soil, no daylight under it. */
const AMMO_BED_M = 0.008;
export function bAmmobox(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bAmmoboxLegacy, rng, 0xa770);
  const { W, H } = AMMO_CRATE;
  const parts: THREE.BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    const crate = ammoCrate(o);
    crate.rotateY((o() - 0.5) * 0.04); // (within the 24 mm between their lids at the ends)
    parts.push(crate.translate((o() - 0.5) * 0.06, -AMMO_BED_M, sz * (W / 2 + 0.012)));
  }
  // the third across their seam, resting on their lids
  const upper = ammoCrate(o);
  upper.rotateY((o() - 0.5) * 0.3);
  parts.push(upper.translate((o() - 0.5) * 0.12, H - AMMO_BED_M, (o() - 0.5) * 0.06));
  const can = ammoCan(o);
  can.rotateY(0.4 + o() * 0.8);
  parts.push(can.translate(0.62, -AMMO_BED_M, 0.16 + (o() - 0.5) * 0.1));
  return merge(parts);
}
/** (b45) the retired builds, for the receipt: the new ones spend exactly their draws. */
export const AMMOBOX_LEGACY = Object.freeze({ build: bAmmoboxLegacy, broken: bAmmoboxBrokenLegacy });
export function bAmmoboxBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bAmmoboxBrokenLegacy, rng, 0xa771);
  const { L, W } = AMMO_CRATE;
  const parts: THREE.BufferGeometry[] = [];
  // the upper crate knocked off whole onto its side, one shoved askew, the third burst into its boards and lid
  const fallen = ammoCrate(o);
  fallen.rotateX(Math.PI / 2);
  fallen.rotateY(o() * Math.PI);
  parts.push(fallen.translate(0.35, W / 2 + 0.013, 0.55)); // (on its front: it rests on the hasps' staples)
  const askew = ammoCrate(o);
  askew.rotateY(0.35 + o() * 0.4);
  parts.push(askew.translate(-0.2, 0, -0.15));
  parts.push(...plankScatter(5, 0.7, 0.13, 0.65, o, CRATE_PAINT));
  const lid = P(box(L, 0.024, W), CRATE_LID, 0.05, o);
  lid.rotateY(o() * Math.PI);
  lid.rotateZ(0.12);
  parts.push(lid.translate(0.1, 0.07, -0.5)); // (one end on the ground, one on a board)
  const can = ammoCan(o);
  can.rotateX(Math.PI / 2); // (on its side: its 15 cm width now its height)
  parts.push(can.translate(0.78, 0.075, -0.05));
  return merge(parts);
}

// --- field tent (canvas ridge tent) ------------------------------------------
export function bTent(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const W = 2.4, H = 1.5, L = 3.2;
  for (const s of [-1, 1]) { // canvas slopes — weathered field canvas, not paper
    const slope = Math.hypot(W / 2, H);
    const panel = box(slope + 0.1, 0.05, L);
    panel.rotateZ(s * Math.atan2(H, W / 2));
    parts.push(P(panel.translate(-s * W / 4, H / 2 + 0.32, 0),
      s < 0 ? TENTCANVAS : [TENTCANVAS[0], TENTCANVAS[1], TENTCANVAS[2] * 0.92], 0.13, rng));
  }
  // rear gable canvas closed (triangular panel under the slopes); the front
  // stays open with one flap pulled aside
  {
    const tri = new THREE.Shape();
    tri.moveTo(-W * 0.46, 0);
    tri.lineTo(W * 0.46, 0);
    tri.lineTo(0, H * 0.92);
    tri.closePath();
    const end = new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false });
    parts.push(P(end.translate(0, 0.30, -(L / 2 - 0.03)), TENTCANVAS_D, 0.12, rng));
  }
  const flap = box(W * 0.4, H * 0.7, 0.05);
  flap.rotateY(0.7);
  parts.push(P(flap.translate(W * 0.28, H * 0.36 + 0.3, L / 2 + 0.14), TENTCANVAS, 0.12, rng));
  for (const pz of [-L / 2 + 0.1, L / 2 - 0.1]) { // ridge poles
    parts.push(P(box(0.07, H + 0.34, 0.07).translate(0, (H + 0.34) / 2, pz), WOOD, 0.10, rng));
  }
  parts.push(P(box(0.06, 0.06, L + 0.2).translate(0, H + 0.30, 0), WOOD, 0.08, rng)); // ridge beam
  return merge(parts);
}
export function bTentBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // collapsed canvas: two crumpled sheets over a snapped ridge pole
  for (let k = 0; k < 2; k++) {
    const sheet = box(1.6 + rng() * 0.8, 0.10, 2.0 + rng() * 0.9);
    sheet.rotateY(rng() * Math.PI);
    sheet.rotateX((rng() - 0.5) * 0.16);
    parts.push(P(sheet.translate((rng() - 0.5) * 1.2, 0.10 + k * 0.07, (rng() - 0.5) * 0.8), k ? TENTCANVAS : TENTCANVAS_D, 0.12, rng));
  }
  const pole = box(0.07, 0.07, 2.2);
  pole.rotateY(rng());
  parts.push(P(pole.translate(0.2, 0.22, 0), WOOD, 0.10, rng));
  return merge(parts);
}

// --- fortifications (owner 2026-09-17: "more trenches/barbed wire/AA guns/bunkers on ALL maps") ---------

/**
 * Barbed-wire module: two screw pickets carrying three taut strands and a tangle of short barbed
 * coils between them (2.6 m along +z). Shoot-through, crushable at a walking pace with a small bite.
 */
export function bBarbedWire(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (const z of [-1.15, 1.15]) {
    const picket = cyl(0.028, 0.034, 1.02, 5);
    picket.rotateX((rng() - 0.5) * 0.16);
    parts.push(P(picket.translate(0, 0.51, z), RUST, 0.10, rng));
    // corkscrew foot of the picket
    parts.push(P(cyl(0.07, 0.05, 0.10, 6).translate(0, 0.05, z), RUST, 0.08, rng));
  }
  for (const y of [0.34, 0.64, 0.94]) {
    parts.push(P(box(0.018, 0.018, 2.62).translate(0, y, 0), IRON, 0.10, rng));
  }
  // diagonal bracing strands
  for (const side of [-1, 1]) {
    const brace = box(0.016, 0.016, 2.7);
    brace.rotateX(side * 0.235);
    parts.push(P(brace.translate(0, 0.64, 0), IRON, 0.10, rng));
  }
  // concertina barbs: short angled stubs along the run
  for (let i = 0; i < 10; i++) {
    const barb = box(0.02, 0.02, 0.26);
    barb.rotateX((rng() - 0.5) * 2.4);
    barb.rotateY((rng() - 0.5) * 1.2);
    parts.push(P(barb.translate((rng() - 0.5) * 0.18, 0.46 + rng() * 0.48, -1.1 + (i + rng()) * 0.22), RUST, 0.12, rng));
  }
  return merge(parts);
}
export function bBarbedWireBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // one picket down, strands tangled on the ground
  const picket = cyl(0.028, 0.034, 1.02, 5);
  picket.rotateX(Math.PI / 2 - 0.2);
  picket.rotateY(rng() * 0.6);
  parts.push(P(picket.translate(0.1, 0.05, 0.6), RUST, 0.10, rng));
  for (let i = 0; i < 7; i++) {
    const strand = box(0.018, 0.018, 0.5 + rng() * 0.6);
    strand.rotateY(rng() * Math.PI);
    strand.rotateX((rng() - 0.5) * 0.5);
    parts.push(P(strand.translate((rng() - 0.5) * 0.8, 0.03 + rng() * 0.12, (rng() - 0.5) * 2.4), IRON, 0.12, rng));
  }
  return merge(parts);
}

// --- anti-tank hedgehogs (props.ts placeHedgehogs: three beams a hedgehog, hedgehogBeamSpecs) -------------------------
/** A hedgehog's beam placed at (x, y, z) (the hedgehog's foot), in the props' dark bucket. */
export function buildHedgehogBeam(tilt: number, yaw: number, x: number, y: number, z: number, scale: number): THREE.BufferGeometry {
  const beam = propBox(0.16 * scale, 0.16 * scale, 2.1 * scale, 1.2);
  beam.rotateX(tilt);
  beam.rotateY(yaw);
  beam.translate(x, y + 0.62 * scale, z);
  return beam;
}

// ---------------------------------------------------------------------------------------------- sandbag stacks

// The scenery lane (2026-10-03; the gauntlet's wave 0: "a pile of identical pale ellipsoids"): the field works' sandbag
// stacks are laid bag by bag. Each bag is a filled sack — thick in the middle, thin and narrow at its folded and tied
// ends, sagging where it settled — in its own tone (sun-bleached hessian, weathered hessian, olive and grey-green
// polypropylene, a few dirty ones), grimed toward its bed, its weave on the props canvas atlas. The courses are laid
// in stretcher bond, front and back rows, each course stepping in a little (a battered parapet), the top course
// uneven. A stack fills the envelope of the sourced model it replaces (the same footprint and height on the same
// placements), so its cover stays where it was; the builders draw only their own stream, never the props stream.

/** The stacks' envelopes (the sourced models they replace): half length along the wall, half depth, top, sink. */
const SANDBAG_STACKS = {
  sandbagbig: { along: 'x', half: 1.787, depth: 0.438, top: 1.23, sink: 0.12, seed: 0x5b16 },
  sandbagsmall: { along: 'x', half: 1.304, depth: 0.421, top: 0.95, sink: 0.1, seed: 0x5b5a },
  sandbagwall: { along: 'z', half: 1.477, depth: 0.497, top: 0.9, sink: 0.1, seed: 0x5ba1 },
} as const;
type SandbagStackKind = keyof typeof SANDBAG_STACKS;

/** The bags' tones (sRGB HSL) and their shares (wave 20: darker and dirtier; a bag in the field is never clean). */
const SANDBAG_TONES: ReadonlyArray<readonly [Palette, number]> = [
  [[0.092, 0.24, 0.36], 0.42], // sun-bleached hessian
  [[0.086, 0.2, 0.3], 0.33],   // weathered hessian
  [[0.15, 0.16, 0.26], 0.12],  // olive polypropylene, faded
  [[0.078, 0.22, 0.23], 0.13], // dirty
];

function sandbagRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** An integer hash to [0, 1) (the burlap's threads draw no stream). */
function burlapHash(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A thread's slub: its thickness along its length, a smooth wander between hashed knots every eight crossings. */
function burlapSlub(thread: number, along: number, salt: number, cycle: number): number {
  const k = Math.floor(along / 8), t = along / 8 - k, w = t * t * (3 - 2 * t);
  const a = burlapHash(thread, ((k % cycle) + cycle) % cycle, salt), b = burlapHash(thread, (((k + 1) % cycle) + cycle) % cycle, salt);
  return 0.78 + 0.4 * (a + (b - a) * w);
}

/**
 * The sandbags' hessian (gauntlet wave 52: "burlap that reads as fabric at its real weave scale"; wave 48's coarse
 * weave read as wood grain and a checkerboard): a plain weave of jute, 32 threads across the tile, so at the bags'
 * SANDBAG_WEAVE_UV a thread every 2.5 mm, as sacking is woven. Each crossing takes the warp over the weft or under it
 * in turn; each thread its own shade and its own slubs (thick and thin along it); the gaps between threads dark, a
 * fibre's fuzz across them. Tileable (the hashes wrap with the tile). Linear luminance near white (the bags' vertex
 * tones stay the cloth's colour) and the relief the normal map is drawn from.
 */
export function paintBurlap(size = 128): { lum: Float32Array; height: Float32Array } {
  const threads = 32, cell = size / threads;
  const lum = new Float32Array(size * size), height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cell, gy = y / cell, wi = Math.floor(gx), fi = Math.floor(gy);
      const lx = gx - wi, ly = gy - fi;
      // the warp runs along v (a thread to each column), the weft along u; each with its slubs and its own shade
      const warpThick = burlapSlub(wi, gy, 11, threads / 8), weftThick = burlapSlub(fi, gx, 23, threads / 8);
      const warpProfile = Math.pow(Math.max(0, Math.sin(Math.PI * (0.5 + (lx - 0.5) / Math.min(1, warpThick)))), 0.7);
      const weftProfile = Math.pow(Math.max(0, Math.sin(Math.PI * (0.5 + (ly - 0.5) / Math.min(1, weftThick)))), 0.7);
      const warpOver = (wi + fi) % 2 === 0;
      // over and under: the thread on top at its crossing rises to its middle, the one beneath shows only at the edges
      const rise = (t: number) => 0.62 + 0.38 * Math.sin(Math.PI * t);
      const hw = warpProfile * (warpOver ? rise(ly) : 0.5) * Math.min(1.15, warpThick);
      const hf = weftProfile * (warpOver ? 0.5 : rise(lx)) * Math.min(1.15, weftThick);
      const h = Math.max(hw, hf);
      const shade = hw >= hf ? burlapHash(wi, 0, 37) : burlapHash(fi, 1, 41);
      const fuzz = burlapHash(x, y, 53);
      lum[y * size + x] = Math.min(1, 0.75 + h * 0.25 + (shade - 0.5) * 0.12 + (fuzz - 0.5) * 0.06);
      height[y * size + x] = h;
    }
  }
  return { lum, height };
}

/**
 * A bag's shaping: its fill (1 full, 0.75 slack), its course's dirt (0 clean, 1 earth-smeared), the end its bottom seam
 * is sewn across (+1 or -1 along its length; the other end is its mouth, folded under the bag), and, for a bag laid in a
 * stack, the faces a stack leaves in view (`laid`; a loose bag is closed): the section's angles kept (degrees, 0 its +z
 * side, 90 its top), the ends capped and the end segments kept whole (each [-x, +x]).
 */
interface BagShape {
  fill?: number;
  dirt?: number;
  seam?: 1 | -1;
  laid?: { from: number; to: number; caps: readonly [boolean, boolean]; whole: readonly [boolean, boolean] };
}

/** The bags' rings along their length and round their section (gauntlet wave 52: "pillow bags"). */
const BAG_RINGS: readonly number[] = [-1, -0.7, 0, 0.7, 1];
const BAG_AROUND = 8;
/** The burlap's weave: uv a metre (the hessian tile is 8 cm of cloth: a jute thread every 2.5 mm). */
export const SANDBAG_WEAVE_UV = 12.5;

/**
 * One filled bag along +X (length), Y (thickness), Z (width), centred (wave 20: "inflated toy capsules"; wave 52: "round
 * log ends", "daylight between courses"). A pillow pressed flat by the courses on it: its top and bed flat, its sides
 * bulging, both ends drawn in — the sewn bottom straight across the bag's full width with its two ears standing out at
 * the corners, the mouth folded under and gathered — so a bag seen end on is a squashed lens, never a log end. Its
 * normals the pillow's own (central differences of its smooth shape; the caps lean out along it), its weave wrapped
 * round it without stretch (u along, v round the section, at the cloth's real weave scale), its tone and the earth
 * toward its bed. Closed, 80 triangles; laid in a stack, only the faces the stack shows (a stack's core closes the rest).
 */
export function sandbagBag(len: number, thick: number, wid: number, r: Rng, shape: BagShape = {}): THREE.BufferGeometry {
  const fill = shape.fill ?? 1, dirt = shape.dirt ?? 0, seam = shape.seam ?? (r() < 0.5 ? 1 : -1);
  const T = thick * fill, W = wid * (1 + (1 - fill) * 0.3);
  // (wave 34, "tidy tubes": the fill settles — the top sags where the course above bears on it, the bag droops)
  const sag = (0.06 + r() * 0.08) * (1 + (1 - fill) * 2.5), droop = 0.012 + r() * 0.016;
  const twist = (r() - 0.5) * 0.08, ear = 0.012 + r() * 0.016, body = BAG_RINGS[BAG_RINGS.length - 2];
  /** The pillow's thickness and width along it (s: -1 the mouth .. +1 the seam), smooth: elliptical toward each end. */
  const profile = (s: number): [number, number] => {
    const a = Math.abs(s);
    if (a <= body) return [1, 1 + 0.03 * (1 - (s / body) ** 2)];
    const u = Math.min(1, (a - body) / (1 - body)), round = Math.sqrt(Math.max(0, 1 - u * u));
    return s > 0 ? [0.42 + 0.58 * round, 1] : [0.6 + 0.4 * round, 1 - 0.12 * u * u];
  };
  const exponent = 3;
  const section = (phi: number): [number, number] => {
    const c = Math.cos(phi), sn = Math.sin(phi);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / exponent)];
  };
  /** A point of the bag (s along, phi round), in its own frame with the seam end at +x. */
  const at = (s: number, phi: number): [number, number, number] => {
    const [tf, wf] = profile(s), [cz, cy] = section(phi);
    // the ears: the seam's corners stand out along the bag and a little to the side
    const earT = s > body ? Math.pow((s - body) / (1 - body), 3) * Math.pow(Math.abs(cz), 6) : 0;
    const x = (s * len) / 2 + ear * len * earT;
    let y = cy * T * 0.5 * tf;
    const z = cz * W * 0.5 * wf * (1 + 0.04 * earT);
    if (cy > 0.3) y -= sag * T * Math.max(0, 1 - (s / body) ** 2) * cy;
    y -= droop * (1 - s * s * 0.9) + twist * s * cz * T * 0.5;
    return [x, y, z];
  };
  const rings = BAG_RINGS.length, ring = BAG_AROUND + 1; // (a ring's first vertex twice: the weave's seam, under the bag)
  const phiOf = (k: number) => -Math.PI / 2 + (k / BAG_AROUND) * Math.PI * 2;
  const count = rings * ring + 2;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2), colors = new Float32Array(count * 3);
  // the weave round the section: its arc length on the body's section
  const arc: number[] = [0];
  for (let k = 1; k <= BAG_AROUND; k++) {
    const [z0, y0] = section(phiOf(k - 1)), [z1, y1] = section(phiOf(k));
    arc.push(arc[k - 1] + Math.hypot((z1 - z0) * W * 0.5, (y1 - y0) * T * 0.5));
  }
  // the tone, and the earth toward its bed (more on a bag low in the stack)
  const [tone] = (() => { let pick = r(), pickAt = SANDBAG_TONES[0]; for (const t of SANDBAG_TONES) { if ((pick -= t[1]) <= 0) { pickAt = t; break; } } return pickAt; })();
  const lift = (r() - 0.5) * 0.05, hue = (r() - 0.5) * 0.01, du = r() * 7, dv = r() * 7;
  const put = (o: number, p: readonly number[], nx: number, ny: number, nz: number, u: number, v: number, s: number) => {
    positions[o * 3] = p[0] * seam; positions[o * 3 + 1] = p[1]; positions[o * 3 + 2] = p[2] * seam;
    const nl = Math.hypot(nx, ny, nz) || 1;
    normals[o * 3] = (nx / nl) * seam; normals[o * 3 + 1] = ny / nl; normals[o * 3 + 2] = (nz / nl) * seam;
    uvs[o * 2] = u; uvs[o * 2 + 1] = v;
    const bed = Math.max(0, Math.min(1, (-p[1] / (T * 0.5) + 0.2) / 1.2));
    const earth = Math.min(1, bed * (0.32 + dirt * 0.3) + dirt * 0.18);
    // the cloth bunched into the seam and the fold reads darker; the seam's stitched hem darkest
    const end = Math.abs(s) > body ? 0.9 : 1, hem = Math.abs(s) >= 1 ? (s > 0 ? 0.8 : 0.86) : 1;
    _c.setHSL(tone[0] + hue - earth * 0.01, tone[1] * (1 - earth * 0.3), Math.max(0.05, (tone[2] + lift) * (1 - earth) * end * hem), THREE.SRGBColorSpace);
    colors[o * 3] = _c.r; colors[o * 3 + 1] = _c.g; colors[o * 3 + 2] = _c.b;
  };
  const ds = 0.01, dphi = 0.01;
  for (let i = 0; i < rings; i++) {
    const s = BAG_RINGS[i];
    for (let k = 0; k < ring; k++) {
      const phi = phiOf(k), p = at(s, phi);
      // the pillow's own normal; at an end, where the section has drawn in, the end's outward lean over the section's
      // own normal (the seam and the fold face out along the bag, their faces up, down and to the side)
      let nx: number, ny: number, nz: number;
      if (Math.abs(s) === 1) {
        const [cz, cy] = section(phi), sz = cz / (W * 0.5), sy = cy / (T * 0.5), sl = Math.hypot(sz, sy) || 1;
        nx = Math.sign(s) * 1.2; ny = sy / sl; nz = sz / sl;
      } else {
        const a0 = at(s - ds, phi), a1 = at(s + ds, phi), b0 = at(s, phi - dphi), b1 = at(s, phi + dphi);
        const ex = a1[0] - a0[0], ey = a1[1] - a0[1], ez = a1[2] - a0[2], fx = b1[0] - b0[0], fy = b1[1] - b0[1], fz = b1[2] - b0[2];
        nx = ey * fz - ez * fy; ny = ez * fx - ex * fz; nz = ex * fy - ey * fx;
        if (nx * p[0] + ny * p[1] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      put(i * ring + k, p, nx, ny, nz, du + p[0] * seam * SANDBAG_WEAVE_UV, dv + arc[k] * SANDBAG_WEAVE_UV, s);
    }
  }
  // the caps' centres: each end's middle, a little proud of its ring (the cloth bellies out between the seam's corners)
  for (const [o, s] of [[rings * ring, -1], [rings * ring + 1, 1]] as const) {
    const c: [number, number, number] = [s * (len / 2 + len * 0.012), -droop * 0.1, 0];
    put(o, c, s, 0, 0, du + c[0] * seam * SANDBAG_WEAVE_UV, dv + arc[BAG_AROUND >> 1] * SANDBAG_WEAVE_UV, s);
  }
  // the faces: the bag's own frame is turned end for end when its seam is at -x (x and z negate: a half turn), so the
  // laid mask, given in the final frame, maps back through it
  const laid = shape.laid;
  const ownEnd = (finalEnd: 0 | 1): 0 | 1 => (seam > 0 ? finalEnd : ((1 - finalEnd) as 0 | 1));
  const keepAngle = (phiMid: number): boolean => {
    if (!laid) return true;
    let deg = ((seam > 0 ? phiMid : Math.PI - phiMid) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    const from = ((laid.from % 360) + 360) % 360, span = laid.to - laid.from;
    return ((deg - from + 360) % 360) <= span;
  };
  const wholeSeg = (i: number): boolean => !!laid && ((i === 0 && laid.whole[seam > 0 ? 0 : 1]) || (i === rings - 2 && laid.whole[seam > 0 ? 1 : 0]));
  const index: number[] = [];
  for (let i = 0; i + 1 < rings; i++) {
    for (let k = 0; k < BAG_AROUND; k++) {
      if (!wholeSeg(i) && !keepAngle(phiOf(k + 0.5))) continue;
      const a = i * ring + k, b = a + 1, c = a + ring + 1, d = a + ring;
      // counter-clockwise seen from outside (a bag turned end for end is the same bag turned half round: one winding)
      index.push(a, d, c, a, c, b);
    }
  }
  const capsOwn: [boolean, boolean] = laid ? [laid.caps[ownEnd(0)], laid.caps[ownEnd(1)]] : [true, true];
  if (capsOwn[0]) for (let k = 0; k < BAG_AROUND; k++) index.push(rings * ring, k, k + 1);
  if (capsOwn[1]) for (let k = 0; k < BAG_AROUND; k++) index.push(rings * ring + 1, (rings - 1) * ring + k + 1, (rings - 1) * ring + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/**
 * A stack's core: a battered box of dark spoil inside the bags, a few centimetres in from their faces and stepping in as
 * the courses do, so a joint between bags shows the earth behind it and never the sky (wave 52: "daylight between
 * courses"). 12 triangles.
 */
function sandbagCore(half: number, depth: number, height: number, batter: number): THREE.BufferGeometry {
  const H = height - 0.1, g = new THREE.BoxGeometry((half - 0.07) * 2, H, (depth - 0.09) * 2);
  const p = g.attributes.position, bottom = depth - 0.09, topHalf = Math.max(0.05, bottom - batter);
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, Math.sign(p.getZ(i)) * topHalf);
  g.computeVertexNormals();
  g.translate(0, H / 2 - 0.02, 0);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2).fill(0.5);
  _c.setHSL(0.075, 0.2, 0.15, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * The stack along local +X (base on y = 0 before the sink), front and back rows, a battered parapet. Wave 20: courses of
 * 15 cm squashed bags (each a third thicker than its course, pressed into the one under it), one bag in five slack, the
 * lowest courses smeared with earth. Wave 48/52: every third course below the top is laid in headers — two bags across
 * the stack end to end, their seamed ends on its faces — between courses of stretchers in a wandering half bond; each
 * bag draws only the faces the stack leaves in view, and the stack's core fills the joints.
 */
function sandbagCourses(half: number, depth: number, height: number, r: Rng): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const courses = Math.max(2, Math.round(height / 0.15));
  const thick = height / courses;
  const settleMid = 0.025 + r() * 0.02;
  for (let c = 0; c < courses; c++) {
    const inset = c * 0.02 + (c === courses - 1 ? 0.02 : 0);
    const rowHalf = depth - inset;
    const dirt = Math.max(0, 1 - c / 2.5);
    const top = c === courses - 1;
    const settleC = settleMid * (c / Math.max(1, courses - 1));
    if (c % 3 === 1 && !top) {
      // headers: two rows across, each bag from a face to just past the middle, its seam out on the face: its top, its
      // outer end and that end's cap in view (its long sides press on its neighbours, its inner end on the other row's)
      for (const side of [-1, 1]) {
        let x = -half + (r() - 0.5) * 0.06;
        while (x < half - 0.1) {
          const w = 0.28 + r() * 0.06, x0 = Math.max(-half, x), x1 = Math.min(half, x + w);
          x += w * (0.96 + r() * 0.03);
          if (x1 - x0 < 0.14) continue;
          const atEnd = x0 <= -half + 0.01 || x1 >= half - 0.01;
          const fill = r() < 0.2 ? 0.8 + r() * 0.1 : 0.95 + r() * 0.07;
          const bag = sandbagBag(rowHalf * (1.04 + r() * 0.04), thick * (1.3 + r() * 0.08), (x1 - x0) * 1.04, r, {
            fill, dirt, seam: 1, laid: { from: atEnd ? -90 : 30, to: atEnd ? 270 : 150, caps: [false, true], whole: [false, true] },
          });
          bag.rotateY((side > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.08);
          bag.rotateX((r() - 0.5) * 0.04);
          const mid = (x0 + x1) / (2 * half);
          bag.translate((x0 + x1) / 2, c * thick + thick * 0.5 * fill + (r() - 0.5) * 0.015 - settleC * (1 - mid * mid), side * rowHalf * 0.5);
          parts.push(bag);
        }
      }
      continue;
    }
    // stretchers: two rows across (each along the wall) meeting in the middle, as long as the wall's length allows; a
    // staggered bond, as hands lay it — each course shifted its own way, each bag a little longer or shorter than the last
    for (const side of [-1, 1]) {
      const wid = Math.max(0.2, rowHalf);
      const n = Math.max(2, Math.round((half * 2) / 0.58));
      const len = (half * 2) / n;
      const shift = (c % 2 ? len * 0.5 : 0) + (r() - 0.5) * len * 0.3;
      let x = -half + shift - len;
      while (x < half) {
        const bagLenNominal = len * (0.88 + r() * 0.24);
        let x0 = x, x1 = x + bagLenNominal;
        x = x1;
        x0 = Math.max(-half, x0); x1 = Math.min(half, x1);
        if (x1 - x0 < len * 0.3) continue;
        // the top course: the odd bag missing, the rest at their own heights (an uneven line)
        if (top && r() < 0.18) continue;
        // (the drawn-in ends meet: each bag runs a little past its share, so neighbours press end to end; a row's end
        // bags keep their outer seams inside the stack's envelope)
        const bagLen = (x1 - x0) * (1.08 + r() * 0.05);
        const centre = Math.min(half - bagLen * 0.53, Math.max(-half + bagLen * 0.53, (x0 + x1) / 2));
        const fill = r() < 0.2 ? 0.78 + r() * 0.12 : 0.94 + r() * 0.1;
        // in view: its outer side and its top (the top course its inner shoulder too); a row's end bag its end, capped
        const startEnd = x0 <= -half + 0.01, finishEnd = x1 >= half - 0.01;
        const minusX = side > 0 ? startEnd : finishEnd, plusX = side > 0 ? finishEnd : startEnd;
        // (the top course is seen from under its overhangs too: closed)
        const bag = sandbagBag(bagLen, thick * (1.3 + r() * 0.1), wid * (1.02 + r() * 0.06), r, top
          ? { fill, dirt } : { fill, dirt, laid: { from: -45, to: 135, caps: [minusX, plusX], whole: [minusX, plusX] } });
        bag.rotateY((r() - 0.5) * 0.07 + (side < 0 ? Math.PI : 0));
        bag.rotateZ((r() - 0.5) * 0.05);
        bag.rotateX((r() - 0.5) * 0.04 - side * 0.03);
        // (wave 34, "no sag": a stack settles in its middle, the more the higher the course, up to 4 cm)
        const mid = (x0 + x1) / (2 * half), settle = settleC * (1 - mid * mid);
        const rise = (top ? (r() - 0.5) * thick * 0.4 : (r() - 0.5) * 0.015) - settle;
        bag.translate(centre + (r() - 0.5) * 0.02, c * thick + thick * 0.5 * fill + rise, side * (rowHalf - wid * 0.5) + (r() - 0.5) * 0.02);
        parts.push(bag);
      }
    }
  }
  parts.push(sandbagCore(half, depth, height - thick * 0.35, 0.02 * (courses - 1)));
  return parts;
}

/**
 * The earth banked against a stack's foot on all four sides (in the stack's final frame, the ground at y = 0): from
 * 3 cm under the ground 3-4 cm out of the bags up to 5-8 cm on their faces, lumpy; one flat earth tone (a fixed weave
 * texel), so the bottom course reads as sunk in the ground.
 */
function sandbagEarthFillet(half: number, depth: number, r: Rng): THREE.BufferGeometry {
  const positions: number[] = [], index: number[] = [];
  const ring = 28, pts: Array<[number, number, number, number]> = []; // x, z, outward x, outward z round the plan
  const per = (2 * half + 2 * depth) * 2;
  for (let k = 0; k < ring; k++) {
    const t = (k / ring) * per;
    let x: number, z: number, ox: number, oz: number;
    if (t < 2 * half) { x = -half + t; z = depth; ox = 0; oz = 1; }
    else if (t < 2 * half + 2 * depth) { x = half; z = depth - (t - 2 * half); ox = 1; oz = 0; }
    else if (t < 4 * half + 2 * depth) { x = half - (t - 2 * half - 2 * depth); z = -depth; ox = 0; oz = -1; }
    else { x = -half; z = -depth + (t - 4 * half - 2 * depth); ox = -1; oz = 0; }
    pts.push([x, z, ox, oz]);
  }
  for (const [x, z, ox, oz] of pts) {
    const h = 0.045 + r() * 0.035, out = 0.025 + r() * 0.02;
    positions.push(x - ox * 0.02, h, z - oz * 0.02, x + ox * out, -0.03, z + oz * out);
  }
  for (let k = 0; k < ring; k++) {
    const a = k * 2, b = ((k + 1) % ring) * 2;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = positions.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2).fill(0.5);
  _c.setHSL(0.075, 0.24, 0.21, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function sandbagMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()), false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('sceneryKit: sandbag merge produced no geometry');
  return merged;
}

/** A sandbag stack (props local types: sandbagbig, sandbagsmall, sandbagwall), its sink below y = 0. */
export function buildSandbagStack(kind: SandbagStackKind): THREE.BufferGeometry {
  const s = SANDBAG_STACKS[kind];
  const r = sandbagRng(s.seed);
  const parts = sandbagCourses(s.half, s.depth, s.top + s.sink, r).map((bag) => bag.translate(0, -s.sink, 0));
  parts.push(sandbagEarthFillet(s.half, s.depth, r));
  const g = sandbagMerge(parts);
  if (s.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/**
 * A breached stack: a low surviving course at one end and the burst and spilled bags fanned round it. `spend` runs the
 * remnant builder it replaces first, so the props stream keeps every draw it always made.
 */
export function buildSandbagHeap(kind: SandbagStackKind, spend: () => void): THREE.BufferGeometry {
  spend();
  const s = SANDBAG_STACKS[kind];
  const r = sandbagRng(s.seed ^ 0x2f);
  const parts = sandbagCourses(s.half * 0.45, s.depth, 0.36, r).map((bag) => bag.translate(-s.half * 0.5, 0, 0));
  for (let k = 0; k < 12; k++) {
    const a = r() * Math.PI * 2, rr = 0.4 + Math.sqrt(r()) * s.half * 0.9;
    const burst = r() < 0.4;
    const bag = sandbagBag(0.5 + r() * 0.14, burst ? 0.07 + r() * 0.04 : 0.15 + r() * 0.04, burst ? 0.42 : 0.33, r);
    bag.rotateY(r() * Math.PI); bag.rotateX((r() - 0.5) * 0.3); bag.rotateZ((r() - 0.5) * 0.3);
    bag.translate(Math.cos(a) * rr * 0.9, burst ? 0.02 : 0.06, Math.sin(a) * rr * 0.55);
    parts.push(bag);
  }
  const g = sandbagMerge(parts);
  g.translate(0, -s.sink * 0.5, 0);
  if (s.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/**
 * The ground a sandbag nest was dug into (wave 34: "a stacked prop on a bare mound — no berm, trench or spilled sand"):
 * the spoil banked against its outer long face, two fifths of its height up and 0.7-1 m out, lower along its inner
 * face and its ends; lumpy, its toe wandering and sunk a centimetre; a spill of the fill heaped from a burst bag at one
 * end, the emptied bag lying flat by it. World space on the height field (x, z the nest's foot, yaw and sc its turn and
 * scale), vertex coloured in the map's soil (`soil`, linear RGB) for the props' rock material; its own stream (the seed
 * names the place). Position, normal, colour, uv and aRockGround; it collides with nothing (a hull drives over a nest
 * as before).
 */
export function buildSandbagBedding(
  kind: SandbagStackKind, ground: { getHeightAt(x: number, z: number): number },
  x: number, z: number, yaw: number, sc: number, seed: number, soil: readonly [number, number, number], mobile = false,
  toward: readonly [number, number] | null = null,
): THREE.BufferGeometry {
  const s = SANDBAG_STACKS[kind], r = sandbagRng(seed);
  const hx = (s.along === 'x' ? s.half : s.depth) * sc, hz = (s.along === 'x' ? s.depth : s.half) * sc, H = s.top * sc;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const world = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const longZ = s.along === 'x'; // the long faces look along local z
  // the face the spoil was thrown to: the enemy's (`toward`, a world direction) where the position has one
  const pick = r() < 0.5 ? -1 : 1;
  const facingDot = toward ? (longZ ? sin * toward[0] + cos * toward[1] : cos * toward[0] - sin * toward[1]) : 0;
  const outer = toward && Math.abs(facingDot) > 1e-6 ? Math.sign(facingDot) : pick;
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  const shade = (o: number) => {
    const n = 0.86 + r() * 0.24, toe = 1 - o * 0.12;
    colors.push(soil[0] * n * toe, soil[1] * n * toe, soil[2] * n * toe);
  };
  // the ring round the stack's plan, a point every 35 cm (60 on a phone), four rows out
  const per = 4 * (hx + hz), K = Math.max(12, Math.round(per / (mobile ? 0.6 : 0.35)));
  const OUT = [0, 0.3, 0.65, 1];
  const lumpA = r() * 6.3, lumpB = r() * 6.3;
  const ring: Array<[number, number, number, number]> = [], hs: number[] = [], reaches: number[] = [];
  for (let k = 0; k < K; k++) {
    const t = (k / K) * per;
    let lx: number, lz: number, nx: number, nz: number;
    if (t < 2 * hx) { lx = -hx + t; lz = hz; nx = 0; nz = 1; }
    else if (t < 2 * hx + 2 * hz) { lx = hx; lz = hz - (t - 2 * hx); nx = 1; nz = 0; }
    else if (t < 4 * hx + 2 * hz) { lx = hx - (t - 2 * hx - 2 * hz); lz = -hz; nx = 0; nz = -1; }
    else { lx = -hx; lz = -hz + (t - 4 * hx - 2 * hz); nx = -1; nz = 0; }
    // which face: the outer long face carries the spoil, the inner one and the ends a lower bank
    const onLong = longZ ? nz !== 0 : nx !== 0, facing = longZ ? nz : nx;
    const big = onLong && facing === outer;
    const a = (k / K) * Math.PI * 2;
    const lump = 1 + 0.18 * Math.sin(a * 5 + lumpA) + 0.1 * Math.sin(a * 11 + lumpB);
    ring.push([lx, lz, nx, nz]);
    hs.push(H * (big ? 0.4 : 0.17) * lump);
    reaches.push((big ? 0.85 : 0.5) * (0.85 + 0.3 * (0.5 + 0.5 * Math.sin(a * 3 + lumpB))) * Math.max(1, sc * 0.8));
  }
  // (the bank's height and reach eased round the corners, so the outer face's spoil runs down into the ends' bank)
  const ease = (v: number[]) => v.map((_, k) => {
    let sum = 0, w = 0;
    for (let j = -3; j <= 3; j++) { const q = 4 - Math.abs(j); sum += v[(k + j + K) % K] * q; w += q; }
    return sum / w;
  });
  const hE = ease(hs), reachE = ease(reaches);
  for (let k = 0; k < K; k++) {
    const [lx, lz, nx, nz] = ring[k], h = hE[k], reach = reachE[k];
    for (const o of OUT) {
      const d = -0.03 + reach * o;
      const [wx, wz] = world(lx + nx * d, lz + nz * d);
      // (lumpy spoil, clods and all: each point its own rise; the toe sunk under the ground)
      const clod = o > 0 && o < 1 ? 1 + (r() - 0.5) * 0.35 : 1;
      positions.push(wx, ground.getHeightAt(wx, wz) + h * Math.pow(1 - o, 1.5) * clod - 0.03 * o * o, wz);
      shade(o);
    }
  }
  const rows = OUT.length;
  for (let k = 0; k < K; k++) {
    const a = k * rows, b = ((k + 1) % K) * rows;
    for (let j = 0; j + 1 < rows; j++) index.push(a + j, a + j + 1, b + j, b + j, a + j + 1, b + j + 1);
  }
  // the spill: a heap of the fill at one end, a dome of three rings, and the emptied bag by it
  const end = r() < 0.5 ? -1 : 1, along = longZ ? [1, 0] : [0, 1], across = longZ ? [0, 1] : [1, 0];
  const reachEnd = (longZ ? hx : hz) + 0.3 + r() * 0.25, off = (r() - 0.5) * (longZ ? hz : hx);
  const cx = along[0] * end * reachEnd + across[0] * off, cz = along[1] * end * reachEnd + across[1] * off;
  const [sx, sz] = world(cx, cz);
  const radius = (0.32 + r() * 0.15) * Math.min(1.3, sc), height = 0.1 + r() * 0.08, segs = mobile ? 6 : 9;
  const centre = positions.length / 3;
  positions.push(sx, ground.getHeightAt(sx, sz) + height, sz);
  colors.push(soil[0] * 1.1, soil[1] * 1.1, soil[2] * 1.1);
  for (const ring of [0.45, 0.8, 1.15]) {
    for (let q = 0; q < segs; q++) {
      const a = (q / segs) * Math.PI * 2, rr = radius * ring * (0.85 + r() * 0.3);
      const px = sx + Math.cos(a) * rr, pz = sz + Math.sin(a) * rr;
      const fall = ring < 1 ? Math.pow(1 - ring / 1.15, 0.8) : 0;
      positions.push(px, ground.getHeightAt(px, pz) + height * fall - (ring > 1 ? 0.01 : 0), pz);
      const n = 0.95 + r() * 0.15;
      colors.push(soil[0] * 1.08 * n, soil[1] * 1.08 * n, soil[2] * 1.08 * n);
    }
  }
  for (let q = 0; q < segs; q++) {
    const q1 = (q + 1) % segs;
    index.push(centre, centre + 1 + q1, centre + 1 + q);
    for (let ring = 0; ring < 2; ring++) {
      const a0 = centre + 1 + ring * segs, b0 = a0 + segs;
      index.push(a0 + q, a0 + q1, b0 + q, b0 + q, a0 + q1, b0 + q1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // the emptied bag, flat on the ground by the spill (hessian, a little earth on it)
  const bag = sandbagBag(0.55 + r() * 0.12, 0.05 + r() * 0.03, 0.4, r, { fill: 0.6, dirt: 0.7 });
  bag.rotateY(r() * Math.PI);
  const bx = cx + along[0] * end * (radius + 0.2) + across[0] * (r() - 0.5) * 0.4, bz = cz + along[1] * end * (radius + 0.2) + across[1] * (r() - 0.5) * 0.4;
  const [wbx, wbz] = world(bx, bz);
  bag.rotateY(yaw).translate(wbx, ground.getHeightAt(wbx, wbz) + 0.012, wbz);
  bag.deleteAttribute('uv');
  const out = mergeGeometries([g.toNonIndexed(), bag.index ? bag.toNonIndexed() : bag], false);
  g.dispose(); bag.dispose();
  if (!out) throw new Error('sceneryKit: the sandbag bedding merge produced no geometry');
  // (wave 34 re-shoot, "a smooth clay mound up close": the bedding draws on the props rock material, as the bocage's
  // earth banks do — its detail print and relief, the grime, the wet maps' moss greening the spoil like a bank. Its
  // ground is given half a metre under the true ground, so the rocks' soil skirt, which would paint the spoil's foot
  // a second, brighter soil, never applies: the spoil is the soil, at half its linear albedo. The b5 hold measured the
  // skirt beside three boulders each on Verdant and Frontier: on a rock's shaded foot it is no brighter than the dirt
  // beside it, so the rocks keep it. A world-planar uv as the banks have.)
  const op = out.attributes.position, gr = new Float32Array(op.count), uv = new Float32Array(op.count * 2);
  // (the time-to-battle lane, 2026-10-08) the non-indexed merge repeats a vertex in every triangle it closes: its ground
  // is asked once (the same exact coordinates, the same height; 27.5 k of the 34 k asks on Verdant were repeats)
  const groundOf = new Map<number, Map<number, number>>();
  for (let i = 0; i < op.count; i++) {
    const px = op.getX(i), py = op.getY(i), pz = op.getZ(i);
    let groundY: number | undefined;
    if (px === 0 || pz === 0) groundY = ground.getHeightAt(px, pz);
    else {
      let row = groundOf.get(px);
      if (!row) groundOf.set(px, row = new Map());
      groundY = row.get(pz);
      if (groundY === undefined) row.set(pz, groundY = ground.getHeightAt(px, pz));
    }
    gr[i] = groundY - 0.5;
    uv[i * 2] = px * 0.37 + py * 0.21; uv[i * 2 + 1] = pz * 0.37 - py * 0.17;
  }
  out.setAttribute('aRockGround', new THREE.BufferAttribute(gr, 1));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
