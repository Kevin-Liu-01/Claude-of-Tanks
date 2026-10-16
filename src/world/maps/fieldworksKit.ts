// src/world/maps/fieldworksKit.ts — the field works' kit (props census #10, fieldworks and military positions: the
// sandbags, the wire, the tents, the ammunition boxes and the hedgehogs).
//
// Extract-then-own (2026-10-14): the builders moved here byte for byte from the hot kit files — inhabitKit.ts (the
// sandbag remnant, the ammunition boxes, the field tent, the barbed wire; their primitives copied with them) and
// sceneryKit.ts (the sandbag stacks, the burlap, the nests' bedding) — and the hedgehog's beam from props.ts, so the
// family's rebuild works here and the hot files are left to their owners. Every builder draws what it drew before.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// (b45: a rebuilt kind spends its legacy builder's draws exactly)
import { spentDraws } from './brokenDraws.ts';
import { jitterUV } from '../propGeometry.ts';
import type { DestructiblePropType } from './inhabitKit.ts';

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
/** (props census #10) a crate's paint by its army: the olive above, bare pine, field grey, desert tan */
interface CrateStyle { paint: Palette; lid: Palette; worn: Palette }
const CRATE_OD: CrateStyle = { paint: CRATE_PAINT, lid: CRATE_LID, worn: CRATE_WORN };
const CRATE_STYLES: Readonly<Record<string, CrateStyle>> = Object.freeze({
  pine: { paint: [0.09, 0.32, 0.36], lid: [0.09, 0.3, 0.33], worn: [0.08, 0.24, 0.46] },
  grey: { paint: [0.58, 0.05, 0.3], lid: [0.58, 0.05, 0.28], worn: [0.08, 0.16, 0.42] },
  tan: { paint: [0.1, 0.24, 0.46], lid: [0.1, 0.22, 0.44], worn: [0.08, 0.16, 0.56] },
});
/** The maps whose crates are not the olive: the Red Army's and the Chinese army's bare pine, the Wehrmacht's grey in
 *  1940, the wadis' tan. */
const CRATE_BY_MAP: Readonly<Record<string, keyof typeof CRATE_STYLES>> = Object.freeze({
  verdant: 'pine', winter: 'pine', steppe: 'pine', blackglass: 'pine', ruinspires: 'pine', fjord: 'grey',
  badlands: 'tan', oasis: 'tan', desert: 'tan',
});
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
function ammoCrate(o: Rng, style: CrateStyle = CRATE_OD): THREE.BufferGeometry {
  const { L, W, H } = AMMO_CRATE, skid = 0.022, lidT = 0.024, body = H - skid - lidT, top = skid + body;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) parts.push(P(box(0.05, skid, W - 0.02), style.worn, 0.08, o).translate(sx * (L / 2 - 0.13), skid / 2, 0));
  parts.push(P(box(L - 0.012, body, W - 0.012), style.paint, 0.05, o).translate(0, skid + body / 2, 0));
  // the boards' seam along both faces, and the lid's hinge line along the back
  for (const sz of [-1, 1]) {
    const seam = P(facePlane(L - 0.05, 0.006), CRATE_SEAM, 0.02, o);
    if (sz < 0) seam.rotateY(Math.PI);
    parts.push(seam.translate(0, skid + body * 0.5, sz * (W / 2 - 0.0045)));
  }
  parts.push(P(box(L, lidT, W + 0.004), style.lid, 0.05, o).translate(0, top + lidT / 2, 0));
  parts.push(P(box(L - 0.02, 0.006, 0.006), style.worn, 0.10, o).translate(0, top + lidT - 0.003, W / 2 + 0.002));
  // the end cleats: a frame proud of each end, the rope becket hanging between its rails
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 + 0.006);
    for (const sz of [-1, 1]) parts.push(P(box(0.018, body + 0.004, 0.032), style.worn, 0.10, o).translate(x, skid + body / 2, sz * (W / 2 - 0.016)));
    for (const y of [skid + 0.019, top - 0.019]) parts.push(P(box(0.018, 0.03, W - 0.064), style.worn, 0.10, o).translate(x, y, 0));
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
export function bAmmobox(rng: Rng, style: CrateStyle = CRATE_OD): THREE.BufferGeometry {
  const o = spentDraws(bAmmoboxLegacy, rng, 0xa770);
  const { W, H } = AMMO_CRATE;
  const parts: THREE.BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    const crate = ammoCrate(o, style);
    crate.rotateY((o() - 0.5) * 0.04); // (within the 24 mm between their lids at the ends)
    parts.push(crate.translate((o() - 0.5) * 0.06, -AMMO_BED_M, sz * (W / 2 + 0.012)));
  }
  // the third across their seam, resting on their lids
  const upper = ammoCrate(o, style);
  upper.rotateY((o() - 0.5) * 0.3);
  parts.push(upper.translate((o() - 0.5) * 0.12, H - AMMO_BED_M, (o() - 0.5) * 0.06));
  const can = ammoCan(o);
  can.rotateY(0.4 + o() * 0.8);
  parts.push(can.translate(0.62, -AMMO_BED_M, 0.16 + (o() - 0.5) * 0.1));
  return merge(parts);
}
/** (b45) the retired builds, for the receipt: the new ones spend exactly their draws. */
export const AMMOBOX_LEGACY = Object.freeze({ build: bAmmoboxLegacy, broken: bAmmoboxBrokenLegacy });
export function bAmmoboxBroken(rng: Rng, style: CrateStyle = CRATE_OD): THREE.BufferGeometry {
  const o = spentDraws(bAmmoboxBrokenLegacy, rng, 0xa771);
  const { L, W } = AMMO_CRATE;
  const parts: THREE.BufferGeometry[] = [];
  // the upper crate knocked off whole onto its side, one shoved askew, the third burst into its boards and lid
  const fallen = ammoCrate(o, style);
  fallen.rotateX(Math.PI / 2);
  fallen.rotateY(o() * Math.PI);
  parts.push(fallen.translate(0.35, W / 2 + 0.013, 0.55)); // (on its front: it rests on the hasps' staples)
  const askew = ammoCrate(o, style);
  askew.rotateY(0.35 + o() * 0.4);
  parts.push(askew.translate(-0.2, 0, -0.15));
  parts.push(...plankScatter(5, 0.7, 0.13, 0.65, o, style.paint));
  const lid = P(box(L, 0.024, W), style.lid, 0.05, o);
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

// --- the family's seams in props.ts ---------------------------------------------------------------------------------
/** A field work's drawn part and the props bucket it rides. */
export interface FieldworksPart {
  bucket: 'dark' | 'baked' | 'stone';
  geometry: THREE.BufferGeometry;
}

/** A field work's destructible kind: the base record's, its builders the map's, its broken state its own (props.ts). */
type FieldworksType = DestructiblePropType & { ownBroken?: boolean };

/**
 * The destructible kinds of the field works as `mapId`'s period and side built them (props.ts LOCAL_TYPES, after the
 * sandbag stacks: the same keys, records and footprints; a map's own structure variants still win after it).
 */
export function fieldworksTypes(mapId: string, mobile: boolean, base: Readonly<Record<string, DestructiblePropType>>):
  Record<string, FieldworksType> {
  const out: Record<string, FieldworksType> = {};
  const wire = WIRE_FORMS[mapId];
  if (wire && base.barbedwire) {
    out.barbedwire = {
      ...base.barbedwire,
      ownBroken: true,
      build: (rng: Rng) => buildWireRun(wire, spentDraws(bBarbedWire, rng, 0xb1e0), false),
      broken: (rng: Rng) => buildWireRun(wire, spentDraws(bBarbedWireBroken, rng, 0xb1e1), true),
    };
  }
  const crate = CRATE_BY_MAP[mapId];
  if (crate && base.ammobox && !mobile) {
    // (a phone keeps the legacy crates, props.ts LOCAL_TYPES: never overridden here)
    const style = CRATE_STYLES[crate];
    out.ammobox = { ...base.ammobox, build: (rng: Rng) => bAmmobox(rng, style), broken: (rng: Rng) => bAmmoboxBroken(rng, style) };
  }
  const tent = TENT_FORMS[mapId];
  if (tent && base.tent) {
    out.tent = {
      ...base.tent,
      // (its collapse is drawn: never PROP_FRACTURE's generic break of the intact build)
      ownBroken: true,
      build: (rng: Rng) => buildFieldTent(tent, spentDraws(bTent, rng, 0x7e01), false),
      broken: (rng: Rng) => buildFieldTent(tent, spentDraws(bTentBroken, rng, 0x7e02), true),
    };
  }
  return out;
}


/** The forms `mapId` draws (fieldworksKit.selftest: the period's form on every map). */
export function fieldworksForms(mapId: string): { hedgehog: string; wire?: string; tent?: string; aa: string } {
  return { hedgehog: (HEDGEHOG_FORMS[mapId] ?? HEDGEHOG_DEFAULT).section, wire: WIRE_FORMS[mapId]?.form, tent: TENT_FORMS[mapId]?.form,
    aa: (AA_FORMS[mapId] ?? AA_DEFAULT).form };
}

// --- anti-tank hedgehogs (props.ts placeHedgehogs: three beams a hedgehog, hedgehogBeamSpecs) -------------------------
//
// Each map's hedgehogs as its period and side made them, member by member, in the beams' collision envelopes (each
// member inside its beam's 0.16 x 0.16 x 2.1 m box, so the slabs that stop shells and sight lines stay as they are; the
// gusset plates and Sarajevo's tyres stand a little proud of it, as the old box did not): riveted angle
// iron with gusset plates at the crossing in western Europe (the Czech pattern of 1938, the Wehrmacht's and NATO's);
// welded rail, the ezhi, on the eastern fronts and on Hostomel's runway; I-beams welded and wrapped in tyres in Sarajevo,
// welded I-beams on the late maps; lashed logs where the front had no steel to spare (Kohima, Shanghai in 1937, the
// Louisiana Maneuvers). Bare steel rusts from its ends and its top faces; a painted one is worn back at its edges.
// The two leaning beams' feet are bedded in a collar of trodden soil. Vertex colours on the props' baked material.

type HedgehogSection = 'angle' | 'rail' | 'ibeam' | 'timber';
interface HedgehogForm {
  section: HedgehogSection;
  /** the paint's linear albedo, or bare steel */
  paint?: Rgb3;
  /** tyres threaded on the legs (Sarajevo's barricades) */
  tyres?: boolean;
  /** the soil at the feet (linear albedo) */
  soil: Rgb3;
}
type Rgb3 = readonly [number, number, number];
const lin1 = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLin = (hex: number): Rgb3 => [lin1(((hex >> 16) & 255) / 255), lin1(((hex >> 8) & 255) / 255), lin1((hex & 255) / 255)];
const mixRgb = (a: Rgb3, b: Rgb3, t: number): Rgb3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulRgb = (a: Rgb3, k: number): Rgb3 => [a[0] * k, a[1] * k, a[2] * k];
const STEEL_BARE = hexLin(0x34302d), RUST_BROWN = hexLin(0x4c2c1c), RUST_ORANGE = hexLin(0x6a381d);
const PAINT_OLIVE = hexLin(0x4a503c), PAINT_SAND = hexLin(0x8c7c5e), PAINT_GREY = hexLin(0x7c7e7a);
const LOG_GREY = hexLin(0x5b5246), LOG_BARK = hexLin(0x3e342a), LASHING = hexLin(0x8e7f5e), TYRE = hexLin(0x1c1c1c);
const SOIL_LOAM = hexLin(0x4a3d2e), SOIL_SAND = hexLin(0x8a7458), SOIL_RED = hexLin(0x6e4a34), SOIL_GREY = hexLin(0x5a564e);
const SOIL_SNOW = hexLin(0xc8ccd0);

const HEDGEHOG_FORMS: Readonly<Record<string, HedgehogForm>> = Object.freeze({
  // the Wehrmacht's and the Allies' riveted angle iron in the west, 1940-45
  fjord: { section: 'angle', soil: SOIL_LOAM }, autumn: { section: 'angle', soil: SOIL_LOAM },
  polders: { section: 'angle', soil: SOIL_LOAM }, reservoir: { section: 'angle', soil: SOIL_LOAM },
  alpine: { section: 'angle', soil: SOIL_GREY }, foundry: { section: 'angle', soil: SOIL_GREY },
  // the Red Army's ezhi of welded rail, 1943-58, and Hostomel's of 2022
  verdant: { section: 'rail', soil: SOIL_LOAM }, winter: { section: 'rail', soil: SOIL_SNOW },
  steppe: { section: 'rail', soil: SOIL_LOAM }, railyard: { section: 'rail', soil: SOIL_GREY },
  airfield: { section: 'rail', soil: SOIL_LOAM }, coastal: { section: 'rail', soil: SOIL_SAND },
  // lashed logs: Shanghai 1937, the Louisiana Maneuvers 1941, Kohima 1944
  blackglass: { section: 'timber', soil: SOIL_GREY }, longleaf: { section: 'timber', soil: SOIL_RED },
  monsoon: { section: 'timber', soil: SOIL_RED },
  // NATO's and the Cold War's painted angle iron
  urban: { section: 'angle', paint: PAINT_OLIVE, soil: SOIL_GREY }, frontier: { section: 'angle', paint: PAINT_OLIVE, soil: SOIL_LOAM },
  skybridge: { section: 'angle', paint: PAINT_OLIVE, soil: SOIL_RED }, titan_gorge: { section: 'angle', paint: PAINT_OLIVE, soil: SOIL_RED },
  cliffbridge: { section: 'angle', soil: SOIL_SAND }, copper_mesa: { section: 'angle', soil: SOIL_RED },
  whiteout: { section: 'angle', paint: PAINT_GREY, soil: SOIL_SNOW },
  // welded I-beams: the Chouf, the wadis, Sarajevo's with their tyres, the late maps
  orchard: { section: 'ibeam', soil: SOIL_RED }, desert: { section: 'ibeam', paint: PAINT_SAND, soil: SOIL_SAND },
  ruinspires: { section: 'ibeam', tyres: true, soil: SOIL_GREY }, saltwind: { section: 'ibeam', soil: SOIL_GREY },
  badlands: { section: 'ibeam', paint: PAINT_SAND, soil: SOIL_SAND }, oasis: { section: 'ibeam', paint: PAINT_SAND, soil: SOIL_SAND },
  delta: { section: 'ibeam', soil: SOIL_LOAM }, mangrove: { section: 'ibeam', soil: SOIL_LOAM },
  caldera: { section: 'rail', soil: SOIL_GREY },
  // the future's: the off-world works' painted angle iron
  mars: { section: 'angle', paint: PAINT_GREY, soil: SOIL_RED }, moon: { section: 'angle', paint: PAINT_GREY, soil: SOIL_GREY },
});
const HEDGEHOG_DEFAULT: HedgehogForm = { section: 'angle', soil: SOIL_LOAM };

/** The sections (m at scale 1; x across, y up, the beam along z), counter-clockwise, inside the 0.16 m square. */
const SECTIONS: Readonly<Record<Exclude<HedgehogSection, 'timber'>, ReadonlyArray<readonly [number, number]>>> = Object.freeze({
  angle: [[-0.08, -0.08], [0.08, -0.08], [0.08, -0.064], [-0.064, -0.064], [-0.064, 0.08], [-0.08, 0.08]],
  rail: [[-0.066, -0.075], [0.066, -0.075], [0.066, -0.064], [0.011, -0.05], [0.008, 0.03], [0.035, 0.04], [0.035, 0.075],
    [-0.035, 0.075], [-0.035, 0.04], [-0.008, 0.03], [-0.011, -0.05], [-0.066, -0.064]],
  ibeam: [[-0.07, -0.075], [0.07, -0.075], [0.07, -0.061], [0.006, -0.061], [0.006, 0.061], [0.07, 0.061], [0.07, 0.075],
    [-0.07, 0.075], [-0.07, 0.061], [-0.006, 0.061], [-0.006, -0.061], [-0.07, -0.061]],
});

/** A smooth value noise in [0, 1) (the steel's rust and the logs' weathering; no stream). */
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const h = (a: number, b: number, c: number): number => {
    let q = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(seed | 0, 1103515245);
    q = Math.imul(q ^ (q >>> 13), 1274126177);
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };
  const s = (t: number): number => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}

/** Triangles with flat normals and vertex colours (a constant uv: the baked bucket has no print). */
class SteelMesh {
  readonly p: number[] = []; readonly n: number[] = []; readonly c: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: (q: THREE.Vector3, n: THREE.Vector3) => Rgb3): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const q of [a, b, c]) {
      const k = col(q, n);
      this.p.push(q.x, q.y, q.z); this.n.push(n.x, n.y, n.z); this.c.push(k[0], k[1], k[2]);
    }
  }
  /** A prism of `section` (x across, y up) from z0 to z1. */
  prism(section: ReadonlyArray<readonly [number, number]>, z0: number, z1: number, col: (q: THREE.Vector3, n: THREE.Vector3) => Rgb3,
    caps = true): void {
    const N = section.length, v = (k: number, zz: number) => new THREE.Vector3(section[k % N][0], section[k % N][1], zz);
    for (let k = 0; k < N; k++) {
      const a = v(k, z0), b = v(k + 1, z0), c = v(k + 1, z1), d = v(k, z1);
      this.tri(a, b, c, col); this.tri(a, c, d, col);
    }
    if (!caps) return;
    const tris = THREE.ShapeUtils.triangulateShape(section.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [i, j, k] of tris) {
      this.tri(v(i, z0), v(k, z0), v(j, z0), col);
      this.tri(v(i, z1), v(j, z1), v(k, z1), col);
    }
  }
  /** A round prism (a log, a tyre's tread) of radius r, `seg` sides, about the z axis from z0 to z1, centred at (cx, cy). */
  round(r: number, z0: number, z1: number, seg: number, col: (q: THREE.Vector3, n: THREE.Vector3) => Rgb3, cx = 0, cy = 0, caps = true): void {
    const sec: Array<[number, number]> = [];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; sec.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    this.prism(sec, z0, z1, col, caps);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    // (the props' baked bucket merges its pieces with a uv each: one texel, the material has no print)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((this.p.length / 3) * 2).fill(0.5), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/** The steel's colour at a point of a beam (local: along z, half length h): rust from the ends and the top faces. */
function steelShade(form: HedgehogForm, h: number, seed: number): (q: THREE.Vector3, n: THREE.Vector3) => Rgb3 {
  return (q, n) => {
    const streak = vnoise3(q.x * 30, q.y * 30, q.z * 3, seed) * 0.6 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed + 3) * 0.4;
    const end = Math.min(1, Math.max(0, (Math.abs(q.z) - h * 0.6) / (h * 0.4)));
    const up = n.y > 0.5 ? 0.25 : 0;
    const rust = Math.min(1, Math.max(0, streak * 0.9 - 0.5 + end * 0.45 + up * 0.6));
    const rustCol = mixRgb(RUST_BROWN, RUST_ORANGE, Math.min(1, Math.max(0, (streak - 0.5) * 2.5)));
    let c: Rgb3;
    if (form.paint) {
      const wear = Math.min(1, Math.max(0, (vnoise3(q.x * 14, q.y * 14, q.z * 2, seed + 5) - 0.55) * 3 + end * 0.5));
      c = mixRgb(form.paint, mixRgb(STEEL_BARE, rustCol, 0.6), wear * 0.8);
    } else c = mixRgb(STEEL_BARE, rustCol, rust);
    return mulRgb(c, 0.85 + vnoise3(q.x * 4, q.y * 4, q.z * 4, seed + 7) * 0.3);
  };
}

/** A log's colour: silver-grey weathered timber, its bark in patches, darker toward its ends. */
function logShade(h: number, seed: number): (q: THREE.Vector3, n: THREE.Vector3) => Rgb3 {
  return (q) => {
    const bark = vnoise3(q.x * 12, q.y * 12, q.z * 2.5, seed) > 0.58 ? 1 : 0;
    const end = Math.min(1, Math.max(0, (Math.abs(q.z) - h * 0.7) / (h * 0.3)));
    return mulRgb(mixRgb(LOG_GREY, LOG_BARK, bark * 0.85), (0.82 + vnoise3(q.x * 5, q.y * 5, q.z * 5, seed + 2) * 0.3) * (1 - end * 0.25));
  };
}

/** A hedgehog's beam `beam` (0-2) placed at (x, y, z) (the hedgehog's foot) as `mapId` builds it: its drawn parts. */
export function buildHedgehogBeam(mapId: string, beam: number, tilt: number, yaw: number, x: number, y: number, z: number,
  scale: number): FieldworksPart[] {
  const form = HEDGEHOG_FORMS[mapId] ?? HEDGEHOG_DEFAULT;
  const seed = (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ (beam * 83492791)) | 0;
  const L = 1.05, m = new SteelMesh();
  // the member (at scale 1, the beam along z, centred on the crossing)
  if (form.section === 'timber') {
    const shade = logShade(L, seed);
    m.round(0.074, -L, L, 7, shade);
    // the lashing round the crossing: three turns of hemp rope
    for (const dz of [-0.07, 0, 0.07]) m.round(0.082, dz - 0.018, dz + 0.018, 7, () => mulRgb(LASHING, 0.9 + (beam * 0.05)));
  } else {
    const sec = SECTIONS[form.section];
    // (the angle iron's legs turned so each beam shows its two faces outward; the rail and the I-beam upright)
    m.prism(sec, -L, L, steelShade(form, L, seed));
    if (beam === 0) {
      if (form.section === 'angle') {
        // the gusset: a plate either side of the crossing's legs, riveted through
        const plate = steelShade(form, 4, seed + 11);
        const P = 0.15, T = 0.012;
        m.prism([[-P, -P], [P, -P], [P, P], [-P, P]].map(([a, b]) => [a, b] as const), -0.08 - T, -0.08, plate);
        m.prism([[-P, -P], [P, -P], [P, P], [-P, P]].map(([a, b]) => [a, b] as const), 0.08, 0.08 + T, plate);
        for (const [rx, ry] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]] as const) {
          for (const zz of [-0.08 - T - 0.012, 0.08 + T]) m.round(0.014, zz, zz + 0.012, 5, () => mulRgb(RUST_BROWN, 0.9), rx, ry);
        }
      } else {
        // the welds at the crossing: beads round where the three members meet
        const weld = (): Rgb3 => mulRgb(mixRgb(STEEL_BARE, RUST_BROWN, 0.5), 0.75);
        for (const [wx, wy] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]] as const) m.round(0.016, -0.09, 0.09, 5, weld, wx, wy);
      }
    }
  }
  const g = m.geometry();
  g.scale(scale, scale, scale);
  g.rotateX(tilt);
  g.rotateY(yaw);
  g.translate(x, y + 0.62 * scale, z);
  const parts: FieldworksPart[] = [{ bucket: 'baked', geometry: g }];
  // the leaning beam's foot bedded in a collar of trodden soil
  if (beam !== 2) {
    const foot = new THREE.Vector3(0, 0, (tilt > 0 ? 1 : -1) * L * scale)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const collar = new SteelMesh();
    const soil = (q: THREE.Vector3): Rgb3 => mulRgb(form.soil, 0.8 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed + 13) * 0.3);
    const R = 0.2 * scale, r = 0.09 * scale, H = 0.06 * scale, seg = 7;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const o0 = new THREE.Vector3(Math.cos(a0) * R, -0.02 * scale, Math.sin(a0) * R), o1 = new THREE.Vector3(Math.cos(a1) * R, -0.02 * scale, Math.sin(a1) * R);
      const i0 = new THREE.Vector3(Math.cos(a0) * r, H, Math.sin(a0) * r), i1 = new THREE.Vector3(Math.cos(a1) * r, H, Math.sin(a1) * r);
      collar.tri(o0, i1, o1, soil); collar.tri(o0, i0, i1, soil);
    }
    const cg = collar.geometry();
    cg.translate(x + foot.x, y, z + foot.z);
    parts.push({ bucket: 'baked', geometry: cg });
    if (form.tyres) {
      // a tyre threaded on the leg has slid down it to the ground and lies there round its foot
      const tyre = new SteelMesh(), seg = 10, Ro = 0.36 * scale, Ri = 0.22 * scale, W = 0.17 * scale;
      const rubber = (q: THREE.Vector3): Rgb3 => mulRgb(TYRE, 0.85 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed + 9) * 0.35);
      const at = (r: number, k: number, h: number) => new THREE.Vector3(Math.cos((k / seg) * Math.PI * 2) * r, h, Math.sin((k / seg) * Math.PI * 2) * r);
      for (let k = 0; k < seg; k++) {
        const k1 = k + 1;
        tyre.tri(at(Ro, k, 0), at(Ro, k1, W), at(Ro, k1, 0), rubber); tyre.tri(at(Ro, k, 0), at(Ro, k, W), at(Ro, k1, W), rubber);
        tyre.tri(at(Ri, k, 0), at(Ri, k1, 0), at(Ri, k1, W), rubber); tyre.tri(at(Ri, k, 0), at(Ri, k1, W), at(Ri, k, W), rubber);
        tyre.tri(at(Ri, k, W), at(Ro, k1, W), at(Ro, k, W), rubber); tyre.tri(at(Ri, k, W), at(Ri, k1, W), at(Ro, k1, W), rubber);
      }
      const tg = tyre.geometry(), hl = Math.hypot(foot.x, foot.z) || 1;
      tg.translate(x + foot.x - (foot.x / hl) * 0.12 * scale, y - 0.01 * scale, z + foot.z - (foot.z / hl) * 0.12 * scale);
      parts.push({ bucket: 'baked', geometry: tg });
    }
  }
  return parts;
}

// --- the wire (prop:barbedwire: a 2.6 m module along +z, its pickets at +-1.15 m, its foot at y = 0) -------------------
//
// The wire by period and side: the low-wire fence of the west 1940-45 on screw and angle-iron pickets, four strands and
// two diagonals barbed every 15 cm; the eastern fronts' and Louisiana's on driven timber stakes; the knife-rests of
// Shanghai and Kohima (timber trestles at either end, a ridge pole, the wire wound round them); the Cold War's
// concertina coil on U pickets under a top strand; the late maps' razor tape in its coil on steel T-posts, galvanised.
// Wire rusts; razor tape stays bright. Destroyed: the near picket down and flat, the strands torn at it and fallen to the
// ground from the far picket, the coil crushed and dragged open. Drawn within the record's run (+-1.3 m), a coil or a
// trestle proud of its 10 cm half width by up to 30 cm.

type WireForm = 'fence' | 'stakes' | 'knife' | 'concertina' | 'razor';
interface WireSpec { form: WireForm; picket: 'screw' | 'angle' | 'stake' | 'upicket' | 'tpost'; wire: Rgb3; soil: Rgb3 }
const WIRE_RUST = hexLin(0x5a3a28), WIRE_GALV = hexLin(0x9a9c98), WIRE_DARK = hexLin(0x403a34);
const WIRE_FORMS: Readonly<Record<string, WireSpec>> = Object.freeze({
  fjord: { form: 'fence', picket: 'screw', wire: WIRE_RUST, soil: SOIL_LOAM }, autumn: { form: 'fence', picket: 'screw', wire: WIRE_RUST, soil: SOIL_LOAM },
  polders: { form: 'fence', picket: 'screw', wire: WIRE_RUST, soil: SOIL_LOAM }, reservoir: { form: 'fence', picket: 'angle', wire: WIRE_RUST, soil: SOIL_LOAM },
  alpine: { form: 'fence', picket: 'angle', wire: WIRE_RUST, soil: SOIL_GREY }, foundry: { form: 'fence', picket: 'angle', wire: WIRE_RUST, soil: SOIL_GREY },
  verdant: { form: 'stakes', picket: 'stake', wire: WIRE_RUST, soil: SOIL_LOAM }, winter: { form: 'stakes', picket: 'stake', wire: WIRE_DARK, soil: SOIL_SNOW },
  longleaf: { form: 'stakes', picket: 'stake', wire: WIRE_RUST, soil: SOIL_RED },
  blackglass: { form: 'knife', picket: 'stake', wire: WIRE_RUST, soil: SOIL_GREY }, monsoon: { form: 'knife', picket: 'stake', wire: WIRE_RUST, soil: SOIL_RED },
  steppe: { form: 'concertina', picket: 'upicket', wire: WIRE_DARK, soil: SOIL_LOAM }, railyard: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_GREY },
  skybridge: { form: 'concertina', picket: 'upicket', wire: WIRE_DARK, soil: SOIL_RED }, titan_gorge: { form: 'concertina', picket: 'upicket', wire: WIRE_DARK, soil: SOIL_RED },
  cliffbridge: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_SAND }, copper_mesa: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_RED },
  orchard: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_RED }, urban: { form: 'concertina', picket: 'upicket', wire: WIRE_DARK, soil: SOIL_GREY },
  frontier: { form: 'concertina', picket: 'upicket', wire: WIRE_DARK, soil: SOIL_LOAM }, desert: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_SAND },
  ruinspires: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_GREY }, saltwind: { form: 'concertina', picket: 'upicket', wire: WIRE_RUST, soil: SOIL_GREY },
  badlands: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_SAND }, oasis: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_SAND },
  delta: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_LOAM }, mangrove: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_LOAM },
  caldera: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_GREY }, airfield: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_LOAM },
  coastal: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_SAND },
  mars: { form: 'razor', picket: 'tpost', wire: WIRE_GALV, soil: SOIL_RED }, moon: { form: 'concertina', picket: 'upicket', wire: WIRE_GALV, soil: SOIL_GREY },
});

type V = THREE.Vector3;
const v3 = (x: number, y: number, z: number): V => new THREE.Vector3(x, y, z);

/** A wire along the points (a 3-sided tube of radius r), its colour mottled. */
function wireTube(m: SteelMesh, pts: readonly V[], r: number, col: (q: V, n: V) => Rgb3): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], d = new THREE.Vector3().subVectors(b, a).normalize();
    const s = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).normalize(), t = new THREE.Vector3().crossVectors(d, s);
    const ring = (o: V, k: number): V => o.clone().addScaledVector(s, Math.cos((k / 3) * Math.PI * 2) * r).addScaledVector(t, Math.sin((k / 3) * Math.PI * 2) * r);
    for (let k = 0; k < 3; k++) {
      const a0 = ring(a, k), a1 = ring(a, k + 1), b0 = ring(b, k), b1 = ring(b, k + 1);
      m.tri(a0, a1, b1, col); m.tri(a0, b1, b0, col);
    }
  }
}

/** Barbs along a wire every `step` m: each a pair of thin spikes across it, turned a quarter at each. */
function barbs(m: SteelMesh, pts: readonly V[], step: number, len: number, col: (q: V, n: V) => Rgb3, seed: number): void {
  let carry = step * 0.5, n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], seg = a.distanceTo(b), d = new THREE.Vector3().subVectors(b, a).normalize();
    const s = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).normalize(), t = new THREE.Vector3().crossVectors(d, s);
    for (let u = carry; u < seg; u += step, n++) {
      const o = a.clone().addScaledVector(d, u), turn = (n % 2) * Math.PI / 2 + vnoise3(o.x * 31, o.y * 31, o.z * 31, seed) * 0.6;
      const across = s.clone().multiplyScalar(Math.cos(turn)).addScaledVector(t, Math.sin(turn));
      const w = d.clone().multiplyScalar(0.006);
      // a spike each way, a sliver triangle (the pair reads from either side)
      m.tri(o.clone().sub(w), o.clone().add(w), o.clone().addScaledVector(across, len), col);
      m.tri(o.clone().add(w), o.clone().sub(w), o.clone().addScaledVector(across, -len), col);
    }
    carry = ((carry - seg) % step + step) % step;
  }
}

/** A strand from p to q sagging `sag` m at its middle, in `n` pieces. */
function sagged(p: V, q: V, sag: number, n: number): V[] {
  const out: V[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(p.clone().lerp(q, t).add(v3(0, -4 * sag * t * (1 - t), 0))); }
  return out;
}

/** A picket at (x, z), its top at h, standing or laid over `lean` about the x axis (toward -z when positive). */
function picket(m: SteelMesh, spec: WireSpec, x: number, z: number, h: number, lean: number, seed: number): void {
  const g = new SteelMesh();
  const steel = steelShade({ section: 'angle', soil: spec.soil, paint: spec.picket === 'tpost' ? hexLin(0x3c4a3a) : undefined }, h, seed);
  if (spec.picket === 'stake') g.round(0.042, -0.06, h, 6, logShade(h, seed));
  else if (spec.picket === 'screw') {
    g.round(0.012, -0.06, h, 5, steel);
    // the picket's eyes: three small loops for the strands
    for (const y of [0.3, 0.6, 0.9].map((k) => k * h)) g.round(0.022, y - 0.008, y + 0.008, 4, steel, 0, 0, false);
  } else {
    const sec: ReadonlyArray<readonly [number, number]> = spec.picket === 'angle' ? [[-0.022, -0.022], [0.022, -0.022], [0.022, -0.017], [-0.017, -0.017], [-0.017, 0.022], [-0.022, 0.022]]
      : spec.picket === 'upicket' ? [[-0.025, -0.012], [0.025, -0.012], [0.025, 0.014], [0.019, 0.014], [0.019, -0.006], [-0.019, -0.006], [-0.019, 0.014], [-0.025, 0.014]]
        : [[-0.022, 0.006], [-0.003, 0.006], [-0.003, -0.022], [0.003, -0.022], [0.003, 0.006], [0.022, 0.006], [0.022, 0.012], [-0.022, 0.012]];
    g.prism(sec, -0.06, h, steel);
  }
  // (built along z: stood up, then leaned)
  const geo = g.geometry();
  geo.rotateX(-Math.PI / 2);
  geo.rotateX(lean);
  geo.translate(x, 0, z);
  const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
  for (let i = 0; i < pa.count; i++) {
    m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i));
  }
  geo.dispose();
}

/** A trodden collar of soil round a foot at (x, z). */
function soilCollar(m: SteelMesh, x: number, z: number, R: number, soil: Rgb3, seed: number): void {
  const col = (q: V): Rgb3 => mulRgb(soil, 0.8 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed) * 0.3);
  const seg = 5;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const o0 = v3(x + Math.cos(a0) * R, -0.015, z + Math.sin(a0) * R), o1 = v3(x + Math.cos(a1) * R, -0.015, z + Math.sin(a1) * R);
    const i0 = v3(x + Math.cos(a0) * R * 0.35, 0.035, z + Math.sin(a0) * R * 0.35), i1 = v3(x + Math.cos(a1) * R * 0.35, 0.035, z + Math.sin(a1) * R * 0.35);
    m.tri(o0, i1, o1, col); m.tri(o0, i0, i1, col);
  }
}

/** A coil from z0 to z1 of `loops` turns, radius R about the line (0, cy), its points (`torn`: crushed and dragged open). */
function coil(z0: number, z1: number, R: number, cy: number, loops: number, perLoop: number, torn: boolean, seed: number): V[] {
  const out: V[] = [], n = loops * perLoop;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (i / perLoop) * Math.PI * 2 + seed * 0.001;
    let x = Math.cos(a) * R, y = cy + Math.sin(a) * R, z = z0 + (z1 - z0) * t;
    if (torn) {
      // crushed under a track and dragged: flattened toward the ground, splayed wide, the loops pulled apart at one end
      x *= 1.35; y = 0.03 + (y - (cy - R)) * 0.22 * (0.6 + 0.4 * t);
      z = z0 + (z1 - z0) * Math.pow(t, 0.8);
    }
    out.push(v3(x, y, z));
  }
  return out;
}

/** The wire run as `spec` builds it (`torn`: destroyed), its own stream `o`. */
function buildWireRun(spec: WireSpec, o: Rng, torn: boolean): THREE.BufferGeometry {
  const m = new SteelMesh(), seed = Math.floor(o() * 1e6);
  const wireCol = (q: V): Rgb3 => mulRgb(spec.wire, 0.8 + vnoise3(q.x * 13, q.y * 13, q.z * 13, seed) * 0.4);
  const zA = -1.15, zB = 1.15, H = spec.form === 'knife' ? 0.95 : spec.form === 'fence' || spec.form === 'stakes' ? 1.0 : 1.05;
  // the near picket (at -z) stands, or lies flat in its own bay when torn; the far one stands, leaning a little
  const leanA = torn ? 1.25 + o() * 0.2 : (o() - 0.5) * 0.08, leanB = torn ? 0.12 + o() * 0.1 : (o() - 0.5) * 0.08;
  const top = (z: number, lean: number, y: number): V => v3(0, Math.cos(lean) * y, z + Math.sin(lean) * y);
  if (spec.form === 'knife') {
    // the trestles: two poles crossed at each end, a ridge pole between, the wire wound round all
    const log = logShade(1.4, seed);
    const frame = new SteelMesh();
    for (const z of [zA, zB]) for (const sx of [-1, 1]) {
      const a = v3(sx * 0.32, -0.04, z), b = v3(-sx * 0.12, 0.92, z);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const g = new SteelMesh(); g.round(0.035, -len / 2, len / 2, 5, log);
      const geo = g.geometry();
      geo.lookAt(new THREE.Vector3().subVectors(b, a));
      geo.translate(mid.x, mid.y, mid.z);
      const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
      for (let i = 0; i < pa.count; i++) { frame.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); frame.n.push(na.getX(i), na.getY(i), na.getZ(i)); frame.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
      geo.dispose();
    }
    const ridge = new SteelMesh(); ridge.round(0.04, zA - 0.12, zB + 0.12, 5, log);
    const rg = ridge.geometry(); rg.translate(0, 0.78, 0);
    const fg = frame.geometry();
    const both = mergeGeometries([fg, rg], false)!;
    fg.dispose(); rg.dispose();
    if (torn) { both.rotateZ(Math.PI / 2 - 0.2); both.translate(0.55, 0.32, 0); }
    const pa = both.getAttribute('position'), na = both.getAttribute('normal'), ca = both.getAttribute('color');
    for (let i = 0; i < pa.count; i++) { m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
    both.dispose();
    // the wire wound round the frame: a loose spiral over the trestles and the ridge
    const wound: V[] = [];
    for (let i = 0; i <= 36; i++) {
      const t = i / 36, a = t * Math.PI * 2 * 6;
      const p = v3(Math.cos(a) * 0.3 * (0.6 + 0.4 * Math.abs(Math.sin(a))), 0.45 + Math.sin(a) * 0.38, zA + (zB - zA) * t);
      if (torn) { p.set(0.35 + p.x * 0.4, 0.04 + (p.y - 0.07) * 0.18, p.z); }
      wound.push(p);
    }
    wireTube(m, wound, 0.006, wireCol);
    barbs(m, wound, 0.35, 0.03, wireCol, seed);
  } else {
    picket(m, spec, 0, zA, H, leanA, seed);
    picket(m, spec, 0, zB, H, leanB, seed + 1);
    soilCollar(m, 0, zA, 0.12, spec.soil, seed);
    soilCollar(m, 0, zB, 0.12, spec.soil, seed + 2);
    if (spec.form === 'fence' || spec.form === 'stakes') {
      const heights = spec.form === 'fence' ? [0.22, 0.48, 0.74, 0.96] : [0.3, 0.62, 0.92];
      for (const [k, hy] of heights.entries()) {
        const a = top(zA, leanA, hy), b = top(zB, leanB, hy);
        let pts: V[];
        if (torn) {
          // torn at the fallen picket: from the far one it falls to the ground and lies along it, curling
          const ground = v3((o() - 0.5) * 0.5, 0.02 + k * 0.012, zA + 0.2 + o() * 0.4);
          pts = [b, b.clone().lerp(ground, 0.45).add(v3((o() - 0.5) * 0.2, -0.25 * hy, 0)), ground.clone().add(v3(0, 0, 0.5)), ground];
        } else pts = sagged(a, b, 0.03 + k * 0.006, 4);
        wireTube(m, pts, 0.007, wireCol);
        barbs(m, pts, 0.18, 0.022, wireCol, seed + k);
      }
      if (!torn) {
        // the diagonals, foot to head across the bay
        for (const [p, q] of [[top(zA, leanA, 0.06), top(zB, leanB, H * 0.94)], [top(zB, leanB, 0.06), top(zA, leanA, H * 0.94)]] as const) {
          const pts = sagged(p, q, 0.02, 4).map((v, i) => v.add(v3(i % 2 ? 0.012 : -0.012, 0, 0)));
          wireTube(m, pts, 0.006, wireCol);
          barbs(m, pts, 0.2, 0.02, wireCol, seed + 9);
        }
      }
    } else {
      const R = 0.3, cy = R + 0.01;
      const pts = coil(-1.25, 1.25, R, cy, 7, 6, torn, seed);
      if (spec.form === 'razor') {
        // the razor tape: one continuous flat bright strip (both its faces; each point's edges shared by the pieces
        // either side of it), a blade at each piece
        const edges = pts.map((a, i) => {
          const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
          const radial = v3(a.x, a.y - cy, 0).normalize();
          const w = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(next, prev).normalize(), radial).normalize().multiplyScalar(0.0125);
          return { lo: a.clone().sub(w), hi: a.clone().add(w), radial };
        });
        for (let i = 0; i + 1 < pts.length; i++) {
          const { lo: a0, hi: a1, radial } = edges[i], { lo: b0, hi: b1 } = edges[i + 1];
          m.tri(a0, a1, b1, wireCol); m.tri(a0, b1, b0, wireCol);
          m.tri(a0, b1, a1, wireCol); m.tri(a0, b0, b1, wireCol);
          const tip = pts[i].clone().lerp(pts[i + 1], 0.5).addScaledVector(radial, 0.035);
          m.tri(a1, b1, tip, wireCol); m.tri(a1, tip, b1, wireCol);
        }
      } else {
        wireTube(m, pts, 0.0055, wireCol);
        // the coil's barbs, sparse (its loops read at range, its barbs only close)
        barbs(m, pts, 0.9, 0.018, wireCol, seed + 3);
      }
      // the top strand over the coil, picket to picket
      const a = top(zA, leanA, H * 0.96), b = top(zB, leanB, H * 0.96);
      const strand = torn ? [b, b.clone().lerp(v3(0.3, 0.03, zA + 0.4), 0.5).add(v3(0, -0.3, 0)), v3(0.3, 0.03, zA + 0.4)] : sagged(a, b, 0.04, 4);
      wireTube(m, strand, 0.0065, wireCol);
    }
  }
  return m.geometry();
}

// --- the field tent (prop:tent: 2.56 x 3.8 m, 2.1 m high, its door to +z, its foot at y = 0) ---------------------------
//
// The tent each army pitched: the ridge tent with its eave walls (the west's and Shanghai's, the Cold War's armies'), a
// double fly over it in the British jungle (Kohima); the pyramidal tent on its centre pole (the Red Army's palatka, the
// US Army's M1934 in Louisiana, the arctic's white); the modular frame tent of the late maps on its arched hoops. Canvas
// in the army's colour, bleached at the ridge and dirty at the hem, sagging between its poles; guys to pegs; the door's
// flaps rolled and tied back on a dark inside with a cot and kit in it. Destroyed: the poles down, the canvas collapsed
// over its contents, a corner still pegged.

type TentForm = 'ridge' | 'pyramid' | 'tunnel';
interface TentSpec { form: TentForm; canvas: Rgb3; fly?: boolean }
const CANVAS_OD = hexLin(0x5c5a3e), CANVAS_GREY = hexLin(0x5a5c4e), CANVAS_KHAKI = hexLin(0x7a6e4e), CANVAS_SOVIET = hexLin(0x66654a);
const CANVAS_JUNGLE = hexLin(0x4c5038), CANVAS_SAND = hexLin(0xa8946e), CANVAS_WHITE = hexLin(0xd0cec4), CANVAS_TAN = hexLin(0x8a7a58);
const CANVAS_BUND = hexLin(0x4f5440);
const TENT_FORMS: Readonly<Record<string, TentSpec>> = Object.freeze({
  fjord: { form: 'ridge', canvas: CANVAS_GREY }, autumn: { form: 'ridge', canvas: CANVAS_OD }, polders: { form: 'ridge', canvas: CANVAS_OD },
  reservoir: { form: 'ridge', canvas: CANVAS_OD }, alpine: { form: 'ridge', canvas: CANVAS_OD }, foundry: { form: 'ridge', canvas: CANVAS_OD },
  blackglass: { form: 'ridge', canvas: CANVAS_KHAKI }, monsoon: { form: 'ridge', canvas: CANVAS_JUNGLE, fly: true },
  verdant: { form: 'pyramid', canvas: CANVAS_SOVIET }, winter: { form: 'pyramid', canvas: CANVAS_SOVIET },
  steppe: { form: 'pyramid', canvas: CANVAS_SOVIET }, longleaf: { form: 'pyramid', canvas: CANVAS_OD },
  whiteout: { form: 'pyramid', canvas: CANVAS_WHITE },
  railyard: { form: 'ridge', canvas: CANVAS_BUND }, frontier: { form: 'ridge', canvas: CANVAS_BUND }, urban: { form: 'ridge', canvas: CANVAS_BUND },
  skybridge: { form: 'ridge', canvas: CANVAS_OD }, titan_gorge: { form: 'ridge', canvas: CANVAS_TAN }, cliffbridge: { form: 'ridge', canvas: CANVAS_OD },
  copper_mesa: { form: 'ridge', canvas: CANVAS_OD }, orchard: { form: 'ridge', canvas: CANVAS_SAND }, desert: { form: 'ridge', canvas: CANVAS_SAND },
  ruinspires: { form: 'ridge', canvas: CANVAS_WHITE }, saltwind: { form: 'ridge', canvas: CANVAS_OD },
  badlands: { form: 'tunnel', canvas: CANVAS_SAND }, oasis: { form: 'tunnel', canvas: CANVAS_SAND }, delta: { form: 'tunnel', canvas: CANVAS_OD },
  mangrove: { form: 'tunnel', canvas: CANVAS_JUNGLE }, caldera: { form: 'tunnel', canvas: CANVAS_OD }, airfield: { form: 'tunnel', canvas: CANVAS_TAN },
  coastal: { form: 'tunnel', canvas: CANVAS_OD }, mars: { form: 'tunnel', canvas: CANVAS_WHITE }, moon: { form: 'ridge', canvas: CANVAS_WHITE },
});
const POLE_WOOD = hexLin(0x6a5640), POLE_ALU = hexLin(0x8c8e8a), ROPE = hexLin(0x9a8c6a), INSIDE_DARK = hexLin(0x141310);
const COT = hexLin(0x3e4030), KIT_DARK = hexLin(0x2c2e24);

/** The canvas's colour at a point: bleached toward the ridge, dirty at the hem, mottled. */
function canvasShade(canvas: Rgb3, H: number, seed: number): (q: V, n: V) => Rgb3 {
  return (q, n) => {
    const bleach = Math.min(1, Math.max(0, q.y / H)) * (n.y > 0.2 ? 0.22 : 0.1);
    const hem = Math.max(0, 1 - q.y / 0.35) * 0.35;
    const mottle = 0.86 + vnoise3(q.x * 3.1, q.y * 3.1, q.z * 3.1, seed) * 0.22;
    return mulRgb(mixRgb(mixRgb(canvas, mulRgb(canvas, 1.45), bleach), hexLin(0x4a3d2e), hem), mottle);
  };
}

/**
 * A sheet of canvas over the grid `at(u, v)` (u, v in 0..1, nu x nv cells), each triangle wound away from `inside`
 * (a point within the tent); both faces when `both` (a flap seen from either side).
 */
function sheet(m: SteelMesh, at: (u: number, v: number) => V, nu: number, nv: number, inside: V, col: (q: V, n: V) => Rgb3, both = false): void {
  const g: V[][] = [];
  for (let i = 0; i <= nu; i++) { g.push([]); for (let j = 0; j <= nv; j++) g[i].push(at(i / nu, j / nv)); }
  const put = (a: V, b: V, c: V): void => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(inside);
    if (n.dot(mid) >= 0) m.tri(a, b, c, col); else m.tri(a, c, b, col);
    if (both) {
      // (its other face a few millimetres in, so the two never fight)
      const k = n.clone().normalize().multiplyScalar(n.dot(mid) >= 0 ? -0.004 : 0.004);
      const a2 = a.clone().add(k), b2 = b.clone().add(k), c2 = c.clone().add(k);
      if (n.dot(mid) >= 0) m.tri(a2, c2, b2, col); else m.tri(a2, b2, c2, col);
    }
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { put(g[i][j], g[i + 1][j], g[i + 1][j + 1]); put(g[i][j], g[i + 1][j + 1], g[i][j + 1]); }
}

/** A pole from a to b (a 5-sided round), and a short peg driven at p. */
function rod(m: SteelMesh, a: V, b: V, r: number, col: Rgb3, seg = 5): void {
  const len = a.distanceTo(b), g = new SteelMesh();
  g.round(r, -len / 2, len / 2, seg, (q) => mulRgb(col, 0.85 + vnoise3(q.x * 7, q.y * 7, q.z * 7, 5) * 0.3), 0, 0, false);
  const geo = g.geometry();
  geo.lookAt(new THREE.Vector3().subVectors(b, a));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geo.translate(mid.x, mid.y, mid.z);
  const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
  for (let i = 0; i < pa.count; i++) { m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
  geo.dispose();
}

/** A guy from the canvas at a to its peg at p, the peg leaning back against the pull. */
function guy(m: SteelMesh, a: V, p: V, rope: (q: V, n: V) => Rgb3): void {
  wireTube(m, [a, p.clone().add(v3(0, 0.05, 0))], 0.007, rope);
  rod(m, p.clone().add(v3(0, -0.05, 0)), p.clone().add(v3((p.x - a.x) * 0.04, 0.09, (p.z - a.z) * 0.04)), 0.014, POLE_WOOD, 4);
}

/**
 * The inside seen through a door at z: a dark room `w` wide, `h` high and `depth` deep behind it (its floor, sides, back
 * and ceiling facing in, so nothing of the outside shows through the canvas's backs; its ceiling falling to `hFront` at
 * the door under a sloping roof), a cot and a kit bag in it.
 */
function insideDoor(m: SteelMesh, w: number, h: number, z: number, depth: number, hFront = h): void {
  const x0 = -w / 2, x1 = w / 2, z0 = z - depth, z1 = z - 0.02;
  const dark = (q: V): Rgb3 => mulRgb(INSIDE_DARK, 0.85 + vnoise3(q.x * 4, q.y * 4, q.z * 4, 3) * 0.3);
  const floor = (q: V): Rgb3 => mulRgb(KIT_DARK, 0.9 + vnoise3(q.x * 4, 0, q.z * 4, 4) * 0.2);
  const quad = (a: V, b: V, c: V, d: V, col: (q: V) => Rgb3): void => { m.tri(a, b, c, col); m.tri(a, c, d, col); };
  quad(v3(x0, 0.01, z0), v3(x0, 0.01, z1), v3(x1, 0.01, z1), v3(x1, 0.01, z0), floor); // up
  quad(v3(x0, 0, z0), v3(x0, h, z0), v3(x0, hFront, z1), v3(x0, 0, z1), dark); // +x
  quad(v3(x1, 0, z0), v3(x1, 0, z1), v3(x1, hFront, z1), v3(x1, h, z0), dark); // -x
  quad(v3(x0, 0, z0), v3(x1, 0, z0), v3(x1, h, z0), v3(x0, h, z0), dark); // +z
  quad(v3(x0, h, z0), v3(x1, h, z0), v3(x1, hFront, z1), v3(x0, hFront, z1), dark); // -y
  // the cot along the room, a kit bag on the floor by the door
  const cot = new SteelMesh();
  cot.prism([[-0.26, 0], [0.26, 0], [0.26, 0.07], [-0.26, 0.07]], -0.6, 0.6, () => COT);
  for (const [lx, lz] of [[-0.22, -0.55], [0.22, -0.55], [-0.22, 0.55], [0.22, 0.55]]) cot.prism([[lx - 0.02, -0.34], [lx + 0.02, -0.34], [lx + 0.02, 0], [lx - 0.02, 0]], lz - 0.02, lz + 0.02, () => KIT_DARK);
  const cg = cot.geometry(); cg.translate(x0 + 0.3, 0.35, z0 + 0.7);
  const bag = new SteelMesh(); bag.round(0.15, -0.26, 0.26, 6, () => KIT_DARK);
  const bg = bag.geometry(); bg.rotateY(Math.PI / 2); bg.translate(x1 - 0.2, 0.15, z1 - 0.35);
  for (const geo of [cg, bg]) {
    const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
    for (let k = 0; k < pa.count; k++) { m.p.push(pa.getX(k), pa.getY(k), pa.getZ(k)); m.n.push(na.getX(k), na.getY(k), na.getZ(k)); m.c.push(ca.getX(k), ca.getY(k), ca.getZ(k)); }
    geo.dispose();
  }
}

/** The tent as `spec` pitches it (`down`: collapsed), its own stream `o`. */
function buildFieldTent(spec: TentSpec, o: Rng, down: boolean): THREE.BufferGeometry {
  const m = new SteelMesh(), seed = Math.floor(o() * 1e6);
  const H = spec.form === 'tunnel' ? 1.85 : 1.98;
  const cloth = canvasShade(spec.canvas, H, seed), rope = (q: V): Rgb3 => mulRgb(ROPE, 0.85 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed) * 0.25);
  const W = spec.form === 'pyramid' ? 2.4 : spec.form === 'tunnel' ? 2.3 : 2.2, L = spec.form === 'pyramid' ? 2.4 : spec.form === 'tunnel' ? 3.4 : 3.3;
  const wall = spec.form === 'pyramid' ? 0.6 : 0.55, inside = v3(0, H * 0.4, 0), poleCol = spec.form === 'tunnel' ? POLE_ALU : POLE_WOOD;
  if (down) {
    // collapsed: the canvas lies over what was in it — humped over the cot and the kit, its folds, a corner still pegged —
    // and draped from the rear pole's head, the one pole still up, leaning
    const humps = [[-0.55, 0.42, -0.1, 0.9], [0.35, 0.3, L / 2 - 0.6, 0.45], [0.1, 0.22, -L / 2 + 0.6, 0.6]];
    const head = v3(0.25, 0.92, -L / 2 + 0.5);
    const fall = (u: number, v: number): V => {
      const x = (u - 0.5) * Math.min(W * 1.1, 2.44), z = (v - 0.5) * Math.min(L * 1.05, 3.6);
      let y = 0.03 + vnoise3(x * 1.7, 0, z * 1.7, seed + 4) * 0.12;
      for (const [hx, hy, hz, hr] of humps) y += hy * Math.max(0, 1 - Math.hypot(x - hx, (z - hz) * 0.7) / hr);
      y = Math.max(y, head.y * Math.pow(Math.max(0, 1 - Math.hypot(x - head.x, z - head.z) / 1.1), 1.6) - 0.02);
      // the pegged corner pulled taut to its peg
      if (u > 0.85 && v < 0.15) y *= 0.4;
      return v3(x + Math.sin(z * 2.3 + seed) * 0.04, y, z);
    };
    sheet(m, fall, 5, 7, v3(0, -1, 0), cloth);
    // the rear pole leaning under the canvas's weight, the other down across it
    rod(m, v3(0.05, -0.04, -L / 2 - 0.12), head.clone().add(v3(0, 0.06, 0)), 0.03, poleCol);
    rod(m, v3(-0.2, 0.08, -L / 2 + 0.6), v3(0.4, 0.2, L / 2 + 0.1), 0.03, poleCol);
    rod(m, v3(0.8, 0.06, L / 2 - 0.4), v3(1.15, 0.3, L / 2 + 0.2), 0.03, poleCol);
    guy(m, v3(Math.min(W / 2, 1.12), 0.1, -L / 2), v3(Math.min(W / 2 + 0.08, 1.2), 0, -L / 2 - 0.22), rope);
    return m.geometry();
  }
  if (spec.form === 'ridge') {
    const sag = (z: number): number => 0.05 * (1 - (2 * z / L) ** 2);
    for (const s of [-1, 1]) {
      // the roof's slope, eave to ridge, sagging between the poles
      sheet(m, (u, v) => {
        const z = (v - 0.5) * L, x = s * (W / 2) * (1 - u), y = wall + (H - wall) * u;
        return v3(x, y - sag(z) * Math.sin(Math.PI * Math.max(u, 0.15)) - 0.02 * Math.sin(Math.PI * u), z);
      }, 3, 4, inside, cloth);
      // the eave wall, its hem flared out at the foot
      sheet(m, (u, v) => v3(s * (W / 2 + 0.06 * (1 - u)), wall * u, (v - 0.5) * L), 1, 4, inside, cloth);
      if (spec.fly) {
        sheet(m, (u, v) => {
          const z = (v - 0.5) * (L + 0.4), x = s * (W / 2 + 0.16) * (1 - u), y = wall + 0.05 + (H + 0.14 - wall - 0.05) * u;
          return v3(x, y - 0.04 * Math.sin(Math.PI * v), z);
        }, 2, 3, inside, cloth, true);
      }
      // the guys from the eaves to their pegs
      for (const z of [-L / 2 + 0.2, 0, L / 2 - 0.2]) guy(m, v3(s * W / 2, wall, z), v3(s * 1.22, 0, z), rope);
    }
    // the rear gable closed; the front's either side of the door, the flaps rolled and tied back
    const gable = (z: number, door: boolean): void => {
      const top = (x: number): number => wall + (H - wall) * (1 - Math.abs(x) / (W / 2));
      if (!door) { sheet(m, (u, v) => { const x = (u - 0.5) * W; return v3(x, top(x) * v, z); }, 4, 2, inside, cloth); return; }
      for (const side of [-1, 1]) {
        sheet(m, (u, v) => { const x = side * (0.42 + u * (W / 2 - 0.42)); return v3(x, top(x) * v, z); }, 2, 2, inside, cloth);
        // the flap rolled up beside the door
        const roll = new SteelMesh(); roll.round(0.07, 0, 1.35, 6, cloth);
        const rg = roll.geometry(); rg.rotateX(-Math.PI / 2); rg.translate(side * 0.5, 0.05, z + 0.06);
        const pa = rg.getAttribute('position'), na = rg.getAttribute('normal'), ca = rg.getAttribute('color');
        for (let i = 0; i < pa.count; i++) { m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
        rg.dispose();
      }
      // over the door: the gable's head
      sheet(m, (u, v) => { const x = (u - 0.5) * 0.84; return v3(x, 1.4 + (top(x) - 1.4) * v, z); }, 2, 1, inside, cloth);
      insideDoor(m, 0.84, 1.4, z, 1.7);
    };
    gable(-L / 2, false);
    gable(L / 2, true);
    // the poles and the ridge
    for (const z of [-L / 2 - 0.02, L / 2 + 0.02]) rod(m, v3(0, -0.05, z), v3(0, H + 0.1, z), 0.03, poleCol);
    rod(m, v3(0, H + 0.02, -L / 2 - 0.05), v3(0, H + 0.02, L / 2 + 0.05), 0.028, poleCol);
    for (const zs of [-1, 1]) guy(m, v3(0, H + 0.08, zs * (L / 2 + 0.02)), v3(0, 0, zs * 1.85), rope);
  } else if (spec.form === 'pyramid') {
    const apex = v3(0, H + 0.06, 0), hw = W / 2, hl = L / 2;
    const corners = [v3(-hw, wall, -hl), v3(hw, wall, -hl), v3(hw, wall, hl), v3(-hw, wall, hl)];
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      // the roof's face from its eave to the apex, sagging in its middle (the door's slit up the front one)
      const face = (u0: number, u1: number, v0: number, v1: number, nu: number, nv: number): void => sheet(m, (u, v) => {
        const uu = u0 + (u1 - u0) * u, vv = v0 + (v1 - v0) * v;
        const e = a.clone().lerp(b, uu), q = e.clone().lerp(apex, vv);
        const sagged = 0.06 * Math.sin(Math.PI * uu) * Math.sin(Math.PI * Math.min(1, vv * 1.2));
        return q.add(v3(-q.x * sagged, -sagged * 0.6, -q.z * sagged));
      }, nu, nv, inside, cloth);
      if (k === 2) {
        face(0, 0.36, 0, 0.55, 1, 2); face(0.64, 1, 0, 0.55, 1, 2); face(0, 1, 0.55, 1, 3, 2);
        // the door's flap folded back over the face beside the door and tied there
        sheet(m, (u, v) => {
          const uu = 0.64 + 0.2 * u, vv = 0.5 * v, e = a.clone().lerp(b, uu), q = e.clone().lerp(apex, vv);
          return q.add(v3(0, 0.03, 0.035));
        }, 1, 2, inside, cloth);
      } else face(0, 1, 0, 1, 3, 3);
      // the eave wall below it (the door in the +z wall)
      if (k === 2) {
        for (const side of [-1, 1]) sheet(m, (u, v) => v3(side * (0.36 + u * (hw - 0.36)), wall * v, hl + 0.05 * (1 - v)), 2, 1, inside, cloth);
        insideDoor(m, 0.7, 1.3, hl, 1.8, wall + 0.02);
      } else sheet(m, (u, v) => { const e = a.clone().lerp(b, u); return v3(e.x * (1 + 0.04 * (1 - v)), wall * v, e.z * (1 + 0.04 * (1 - v))); }, 3, 1, inside, cloth);
      // a guy from each eave corner and mid-eave
      const c = a.clone(), out = v3(Math.sign(c.x) * 1.24, 0, Math.sign(c.z) * 1.8);
      guy(m, c, out, rope);
    }
    rod(m, v3(0, -0.05, 0), v3(0, H + 0.14, 0), 0.04, poleCol);
  } else {
    // the modular frame tent: four arched hoops, the canvas over them sagging between, the door's half rolled up
    const hoop = (z: number): void => {
      const pts: V[] = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); pts.push(v3(-Math.cos(a) * W / 2, Math.sin(a) * H, z)); }
      wireTube(m, pts, 0.022, () => POLE_ALU);
    };
    const zs = [-L / 2, -L / 6, L / 6, L / 2];
    for (const z of zs) hoop(z);
    sheet(m, (u, v) => {
      const a = Math.PI * u, z = (v - 0.5) * L, between = Math.abs(Math.sin(Math.PI * ((v * 3) % 1)));
      const r = 1 - 0.035 * between;
      return v3(-Math.cos(a) * (W / 2 + 0.03) * r, Math.sin(a) * (H + 0.03) * r, z);
    }, 6, 6, inside, cloth);
    // the rear closed; the door's frame and its rolled half at the front
    sheet(m, (u, v) => { const a = Math.PI * u; return v3(-Math.cos(a) * (W / 2) * v, Math.sin(a) * H * v, -L / 2); }, 6, 1, inside, cloth);
    for (const side of [-1, 1]) {
      sheet(m, (u, v) => { const a = Math.PI * (side < 0 ? u * 0.33 : 1 - u * 0.33); return v3(-Math.cos(a) * (W / 2) * (0.35 + 0.65 * v), Math.sin(a) * H * (0.35 + 0.65 * v) * v + (1 - v) * 0, L / 2); }, 2, 1, inside, cloth);
    }
    sheet(m, (u, v) => { const a = Math.PI * (0.33 + u * 0.34); return v3(-Math.cos(a) * (W / 2), Math.sin(a) * H * (0.82 + 0.18 * v), L / 2); }, 2, 1, inside, cloth);
    insideDoor(m, 0.9, 1.45, L / 2, 1.8);
    const roll = new SteelMesh(); roll.round(0.08, -0.5, 0.5, 6, cloth);
    const rg = roll.geometry(); rg.rotateY(Math.PI / 2); rg.translate(0, 1.52, L / 2 + 0.08);
    const pa = rg.getAttribute('position'), na = rg.getAttribute('normal'), ca = rg.getAttribute('color');
    for (let i = 0; i < pa.count; i++) { m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
    rg.dispose();
    for (const z of [-L / 2, L / 2]) for (const s of [-1, 1]) guy(m, v3(s * W * 0.35, H * 0.72, z), v3(s * 1.2, 0, z + Math.sign(z) * 0.12), rope);
  }
  // the ground sheet's edge before the door
  const gs = (): Rgb3 => mulRgb(KIT_DARK, 1.3);
  const zf = L / 2;
  const lip = Math.min(0.25, 1.9 - zf);
  m.tri(v3(-0.5, 0.012, zf), v3(0.5, 0.012, zf + lip), v3(0.5, 0.012, zf), gs);
  m.tri(v3(-0.5, 0.012, zf), v3(-0.5, 0.012, zf + lip), v3(0.5, 0.012, zf + lip), gs);
  return m.geometry();
}

// --- the anti-aircraft guns (frontline:aa-gun: frontlineAtmosphere.ts's border ring; the base fixed, the head yawed
// and pitched about its trunnions 1.45 m up, its muzzles near +2.9 m along +z where the tracers start) ----------------
//
// Each front's own gun in its pit of sandbags (two courses round it, open at the back), on its own carriage: the 40 mm
// Bofors on its cruciform outriggers in the west 1944-45 and on NATO's Cold War maps; the 20 mm Flak 38 on its tripod
// base with its shield (Norway 1940, and the Type 98 at Shanghai); the Red Army's 37 mm 61-K behind its shield; the
// 57 mm S-60 in the Virgin Lands; the US quad .50 M45 on its trailer in the 1960s West; the twin 23 mm ZU-23-2 on its
// raised wheels from the Chouf to Hostomel. Painted in its army's colour, the barrels dark steel, the tyres black.

type AaForm = 'bofors' | 'flak38' | 'k61' | 's60' | 'm45' | 'zu23';
interface AaSpec { form: AaForm; paint: Rgb3; bags: Rgb3 }
const PAINT_OD = hexLin(0x4e5038), PAINT_FIELDGREY = hexLin(0x5a5c52), PAINT_SOVIET = hexLin(0x4d5a3e), PAINT_NATO = hexLin(0x4f5440);
const PAINT_KHAKI = hexLin(0x6a6046), PAINT_DESERT = hexLin(0x9c8a64), PAINT_WINTER = hexLin(0xb8bab4);
const BAG_HESSIAN = hexLin(0x8a7a5a), BAG_SAND = hexLin(0xa89670), BAG_GREY = hexLin(0x7a7668), BARREL = hexLin(0x2a2c2a);
const AA_FORMS: Readonly<Record<string, AaSpec>> = Object.freeze({
  fjord: { form: 'flak38', paint: PAINT_FIELDGREY, bags: BAG_HESSIAN }, blackglass: { form: 'flak38', paint: PAINT_KHAKI, bags: BAG_HESSIAN },
  autumn: { form: 'bofors', paint: PAINT_OD, bags: BAG_HESSIAN }, polders: { form: 'bofors', paint: PAINT_OD, bags: BAG_HESSIAN },
  reservoir: { form: 'bofors', paint: PAINT_OD, bags: BAG_HESSIAN }, alpine: { form: 'bofors', paint: PAINT_OD, bags: BAG_GREY },
  foundry: { form: 'bofors', paint: PAINT_OD, bags: BAG_GREY }, monsoon: { form: 'bofors', paint: PAINT_SOVIET, bags: BAG_HESSIAN },
  longleaf: { form: 'bofors', paint: PAINT_OD, bags: BAG_HESSIAN },
  verdant: { form: 'k61', paint: PAINT_SOVIET, bags: BAG_HESSIAN }, winter: { form: 'k61', paint: PAINT_WINTER, bags: BAG_GREY },
  steppe: { form: 's60', paint: PAINT_SOVIET, bags: BAG_HESSIAN },
  railyard: { form: 'bofors', paint: PAINT_NATO, bags: BAG_GREY }, urban: { form: 'bofors', paint: PAINT_NATO, bags: BAG_GREY },
  frontier: { form: 'bofors', paint: PAINT_NATO, bags: BAG_HESSIAN }, cliffbridge: { form: 'bofors', paint: PAINT_OD, bags: BAG_SAND },
  copper_mesa: { form: 'bofors', paint: PAINT_OD, bags: BAG_SAND }, whiteout: { form: 'bofors', paint: PAINT_WINTER, bags: BAG_GREY },
  skybridge: { form: 'm45', paint: PAINT_OD, bags: BAG_SAND }, titan_gorge: { form: 'm45', paint: PAINT_OD, bags: BAG_SAND },
  orchard: { form: 'zu23', paint: PAINT_DESERT, bags: BAG_SAND }, desert: { form: 'zu23', paint: PAINT_DESERT, bags: BAG_SAND },
  ruinspires: { form: 'zu23', paint: PAINT_SOVIET, bags: BAG_GREY }, saltwind: { form: 'zu23', paint: PAINT_SOVIET, bags: BAG_GREY },
  badlands: { form: 'zu23', paint: PAINT_DESERT, bags: BAG_SAND }, oasis: { form: 'zu23', paint: PAINT_DESERT, bags: BAG_SAND },
  delta: { form: 'zu23', paint: PAINT_SOVIET, bags: BAG_HESSIAN }, mangrove: { form: 'zu23', paint: PAINT_SOVIET, bags: BAG_HESSIAN },
  caldera: { form: 'zu23', paint: PAINT_NATO, bags: BAG_GREY }, airfield: { form: 'zu23', paint: PAINT_SOVIET, bags: BAG_HESSIAN },
  coastal: { form: 'zu23', paint: PAINT_NATO, bags: BAG_SAND }, mars: { form: 'zu23', paint: PAINT_WINTER, bags: BAG_GREY },
  moon: { form: 'zu23', paint: PAINT_WINTER, bags: BAG_GREY },
});
const AA_DEFAULT: AaSpec = { form: 'bofors', paint: PAINT_OD, bags: BAG_HESSIAN };

/** A box w x h x d centred at (x, y, z) (its long edges eased), turned `yaw` about y. */
function block(m: SteelMesh, w: number, h: number, d: number, x: number, y: number, z: number, col: (q: V, n: V) => Rgb3, yaw = 0, pitch = 0): void {
  const c = Math.min(w, h) * 0.12, hw = w / 2, hh = h / 2;
  const g = new SteelMesh();
  g.prism([[-hw, -hh + c], [-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c]], -d / 2, d / 2, col);
  const geo = g.geometry();
  if (pitch) geo.rotateX(pitch);
  if (yaw) geo.rotateY(yaw);
  geo.translate(x, y, z);
  appendGeo(m, geo);
}

/** Appends a geometry's triangles (position, normal, colour) to a mesh, and disposes it. */
function appendGeo(m: SteelMesh, geo: THREE.BufferGeometry): void {
  const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
  for (let i = 0; i < pa.count; i++) { m.p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); m.n.push(na.getX(i), na.getY(i), na.getZ(i)); m.c.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
  geo.dispose();
}

/** An upright round from y0 to y1 at (x, z), radius r (a pedestal, a jack's pad). */
function column(m: SteelMesh, r: number, y0: number, y1: number, seg: number, col: (q: V, n: V) => Rgb3, x = 0, z = 0): void {
  const g = new SteelMesh();
  g.round(r, y0, y1, seg, col);
  const geo = g.geometry(); geo.rotateX(-Math.PI / 2); geo.translate(x, 0, z);
  appendGeo(m, geo);
}

/** A barrel along +z from z0 to z1 at (x, y), radius r, its muzzle device (a cone or a brake) at its end. */
function barrel(m: SteelMesh, x: number, y: number, z0: number, z1: number, r: number, muzzle: 'cone' | 'brake' | 'plain'): void {
  const steel = (q: V): Rgb3 => mulRgb(BARREL, 0.85 + vnoise3(q.x * 9, q.y * 9, q.z * 9, 21) * 0.3);
  m.round(r, z0, z1, 6, steel, x, y);
  if (muzzle === 'cone') m.round(r * 1.7, z1, z1 + 0.28, 6, steel, x, y);
  else if (muzzle === 'brake') { m.round(r * 1.8, z1, z1 + 0.22, 6, steel, x, y); m.round(r * 1.2, z1 + 0.22, z1 + 0.3, 6, steel, x, y); }
}

/** A wheel standing at (x, y, z) facing x, radius r. */
function wheel(m: SteelMesh, x: number, y: number, z: number, r: number, paint: (q: V, n: V) => Rgb3): void {
  const g = new SteelMesh();
  g.round(r, -0.11, 0.11, 10, (q) => mulRgb(TYRE, 0.85 + vnoise3(q.x * 7, q.y * 7, q.z * 7, 22) * 0.3));
  g.round(r * 0.55, 0.11, 0.13, 8, paint);
  const geo = g.geometry(); geo.rotateY(Math.PI / 2); geo.translate(x, y, z);
  appendGeo(m, geo);
}

/** The gun of `mapId`'s front: its fixed base (the pit and the carriage) and its head (about its trunnions). */
export function buildAaGun(mapId: string): { base: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const spec = AA_FORMS[mapId] ?? AA_DEFAULT, seed = 0xaa01;
  const paint = (q: V, n: V): Rgb3 => {
    const wear = Math.max(0, vnoise3(q.x * 6, q.y * 6, q.z * 6, seed) - 0.7) * 1.6 * (n.y > 0.5 ? 1.25 : 1);
    return mulRgb(mixRgb(spec.paint, RUST_BROWN, wear), 0.88 + vnoise3(q.x * 3, q.y * 3, q.z * 3, seed + 1) * 0.24);
  };
  const base = new SteelMesh(), head = new SteelMesh();
  // the pit: two courses of sandbags round it, open at the back; its floor of trodden earth
  const bag = (q: V): Rgb3 => mulRgb(spec.bags, 0.78 + vnoise3(q.x * 5, q.y * 5, q.z * 5, seed + 2) * 0.35);
  const R = 2.45, N = 20;
  for (let course = 0; course < 2; course++) {
    for (let k = 0; k < N; k++) {
      const a = ((k + course * 0.5) / N) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.32) continue; // the way in, at the back (-z)
      block(base, 0.7, 0.17, 0.36, Math.sin(a) * R, 0.085 + course * 0.16, Math.cos(a) * R, bag, a + Math.PI / 2);
    }
  }
  const floor = (q: V): Rgb3 => mulRgb(hexLin(0x3e3428), 0.85 + vnoise3(q.x * 3, 0, q.z * 3, seed + 3) * 0.3);
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
    base.tri(v3(0, 0.012, 0), v3(Math.sin(a0) * 2.25, 0.012, Math.cos(a0) * 2.25), v3(Math.sin(a1) * 2.25, 0.012, Math.cos(a1) * 2.25), floor);
  }
  // the carriage
  if (spec.form === 'bofors' || spec.form === 'k61' || spec.form === 's60') {
    block(base, 1.1, 0.24, 1.1, 0, 0.5, 0, paint);
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      // an outrigger down to its jack's pad
      block(base, 0.16, 0.14, 1.25, Math.sin(a) * 0.95, 0.38, Math.cos(a) * 0.95, paint, a, 0.22);
      column(base, 0.14, -0.02, 0.05, 8, paint, Math.sin(a) * 1.55, Math.cos(a) * 1.55);
      column(base, 0.04, 0.05, 0.3, 6, paint, Math.sin(a) * 1.55, Math.cos(a) * 1.55);
    }
    column(base, 0.34, 0.6, 1.2, 8, paint);
  } else if (spec.form === 'flak38') {
    block(base, 0.8, 0.2, 0.8, 0, 0.42, 0, paint);
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      block(base, 0.14, 0.12, 1.1, Math.sin(a) * 0.75, 0.3, Math.cos(a) * 0.75, paint, a, 0.25);
    }
    column(base, 0.22, 0.5, 1.22, 8, paint);
  } else if (spec.form === 'm45') {
    block(base, 1.7, 0.3, 2.3, 0, 0.62, 0, paint);
    for (const sx of [-1, 1]) wheel(base, sx * 0.98, 0.42, -0.2, 0.42, paint);
    for (const [jx, jz] of [[-0.75, 1.0], [0.75, 1.0], [-0.75, -1.0], [0.75, -1.0]]) block(base, 0.08, 0.5, 0.08, jx, 0.25, jz, paint);
    column(base, 0.4, 0.77, 1.2, 8, paint);
  } else {
    // the ZU-23-2 on its carriage, its wheels raised clear, three jacks down
    block(base, 1.5, 0.2, 0.9, 0, 0.45, 0, paint);
    for (const sx of [-1, 1]) wheel(base, sx * 0.95, 0.5, -0.1, 0.33, paint);
    for (const [jx, jz] of [[-0.6, 0.9], [0.6, 0.9], [0, -1.1]]) { block(base, 0.12, 0.42, 0.12, jx, 0.22, jz, paint); column(base, 0.12, -0.02, 0.04, 8, paint, jx, jz); }
    block(base, 0.14, 0.12, 1.0, 0, 0.42, -0.6, paint);
    column(base, 0.3, 0.55, 1.2, 8, paint);
  }
  // the head, about the trunnions (y 0 here is 1.45 m up)
  const seat = (x: number): void => { block(head, 0.34, 0.06, 0.32, x, -0.42, -0.35, paint); block(head, 0.3, 0.3, 0.05, x, -0.25, -0.52, paint); };
  if (spec.form === 'bofors') {
    block(head, 0.5, 0.42, 1.0, 0, -0.02, 0.05, paint);
    block(head, 0.26, 0.32, 0.36, 0, 0.36, -0.05, paint); // the clip guides
    barrel(head, 0, 0.02, 0.5, 2.62, 0.05, 'cone');
    head.round(0.035, 0.5, 1.5, 6, paint, 0, 0.16); // the recoil spring's casing
    for (const sx of [-1, 1]) { seat(sx * 0.62); block(head, 0.1, 0.16, 0.22, sx * 0.4, 0.22, -0.1, paint); }
    block(head, 0.9, 0.06, 0.6, 0, -0.38, -0.1, paint);
  } else if (spec.form === 'k61' || spec.form === 's60') {
    const big = spec.form === 's60';
    block(head, 0.52, 0.42, 1.1, 0, -0.02, 0.05, paint);
    barrel(head, 0, 0.02, 0.5, big ? 2.6 : 2.64, big ? 0.06 : 0.045, big ? 'brake' : 'cone');
    block(head, 0.24, 0.3, 0.4, 0, 0.34, -0.05, paint);
    // the shield, its two wings angled back
    block(head, 0.9, 0.85, 0.035, 0, 0.12, 0.62, paint);
    for (const sx of [-1, 1]) block(head, 0.45, 0.8, 0.035, sx * 0.6, 0.12, 0.52, paint, sx * 0.5);
    for (const sx of [-1, 1]) seat(sx * 0.62);
    block(head, 0.95, 0.06, 0.6, 0, -0.38, -0.1, paint);
  } else if (spec.form === 'flak38') {
    block(head, 0.34, 0.3, 0.8, 0, 0, 0.05, paint);
    barrel(head, 0, 0.03, 0.45, 2.64, 0.032, 'cone');
    block(head, 0.12, 0.3, 0.2, -0.22, 0.05, 0.1, paint); // the magazine
    block(head, 1.0, 0.62, 0.03, 0, 0.12, 0.55, paint); // the shield
    seat(0);
    block(head, 0.7, 0.05, 0.5, 0, -0.4, -0.15, paint);
  } else if (spec.form === 'm45') {
    block(head, 0.9, 0.7, 0.75, 0, 0, 0, paint);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      barrel(head, sx * 0.58, sy * 0.13, 0.1, 1.9, 0.022, 'cone');
      block(head, 0.22, 0.22, 0.42, sx * 0.62, sy * 0.13, -0.15, paint); // the ammunition chests
    }
    block(head, 1.0, 0.55, 0.04, 0, 0.12, 0.4, paint);
  } else {
    // the ZU-23-2: twin barrels side by side, their magazines outboard, the two layers' seats behind
    block(head, 0.62, 0.3, 0.95, 0, -0.02, 0.05, paint);
    for (const sx of [-1, 1]) {
      barrel(head, sx * 0.21, 0.04, 0.5, 2.66, 0.035, 'cone');
      block(head, 0.12, 0.28, 0.5, sx * 0.42, 0.08, 0.05, paint);
      seat(sx * 0.55);
    }
    block(head, 0.14, 0.16, 0.2, 0, 0.26, -0.25, paint); // the sight
    block(head, 1.1, 0.05, 0.55, 0, -0.38, -0.12, paint);
  }
  return { base: base.geometry(), head: head.geometry() };
}

// --- the camp's fire ring (site:camp-fire-ring: props.ts placeSupplyCamps, 2.6 m and 1.4 m off the camp's tent) -------
//
// Field stones in a ring half sunk in the ground (rounded and irregular, each its own, on the map's stone), the ash bed
// inside with the fire's last logs charred across it; over it the cook's tripod and its pot until the 1960s, a steel
// grate on a later camp. The stones draw the props stream exactly as the old ring's boxes did (their count, size, print
// and turn); the rest draws nothing.

/** The camps that cooked over a tripod: the maps set before 1960 (periodClutterKit.ts MAP_SETTING_YEAR). */
const TRIPOD_CAMPS: ReadonlySet<string> = new Set(['blackglass', 'fjord', 'longleaf', 'verdant', 'autumn', 'monsoon', 'polders',
  'reservoir', 'alpine', 'foundry', 'winter', 'steppe']);

/** The fire ring at (x, y, z) (the ground under it) on `mapId`'s camp: its parts, the stones from `rng` as before. */
export function buildCampFireRing(mapId: string, x: number, y: number, z: number, rng: Rng): FieldworksPart[] {
  const parts: FieldworksPart[] = [];
  const stoneCount = 5 + ((rng() * 3) | 0);
  const seed = (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) | 0;
  for (let k = 0; k < stoneCount; k++) {
    const angle = (k / stoneCount) * Math.PI * 2;
    const size = 0.22 + rng() * 0.1;
    // a field stone: a coarse rounded solid, each vertex pushed its own way (shared corners alike: no cracks)
    const stone = new THREE.IcosahedronGeometry(0.5, 0);
    const pa = stone.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const vx = pa.getX(i), vy = pa.getY(i), vz = pa.getZ(i), d = 0.78 + vnoise3(vx * 3 + k * 7, vy * 3, vz * 3 + seed * 1e-6, seed) * 0.42;
      pa.setXYZ(i, vx * d * size, vy * d * 0.17, vz * d * size * 0.9);
    }
    stone.computeVertexNormals();
    jitterUV(stone, rng);
    stone.rotateY(rng() * Math.PI);
    stone.translate(x + Math.cos(angle) * 0.55, y + 0.045, z + Math.sin(angle) * 0.55);
    parts.push({ bucket: 'stone', geometry: stone });
  }
  // the ash bed and the charred logs across it, the tripod and its pot or the grate (no draws)
  const m = new SteelMesh();
  const ash = (q: V): Rgb3 => mulRgb(hexLin(0x3a3634), 0.6 + vnoise3(q.x * 9, 0, q.z * 9, seed) * 0.6);
  for (let k = 0; k < 9; k++) {
    const a0 = (k / 9) * Math.PI * 2, a1 = ((k + 1) / 9) * Math.PI * 2;
    m.tri(v3(0, 0.03, 0), v3(Math.cos(a1) * 0.44, 0.005, Math.sin(a1) * 0.44), v3(Math.cos(a0) * 0.44, 0.005, Math.sin(a0) * 0.44), ash);
  }
  const char = (q: V): Rgb3 => mulRgb(hexLin(0x1e1a16), 0.8 + vnoise3(q.x * 13, q.y * 13, q.z * 13, seed + 1) * 0.5);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + (seed % 7) * 0.3;
    rodCol(m, v3(Math.cos(a) * 0.32, 0.035, Math.sin(a) * 0.32), v3(-Math.cos(a) * 0.12, 0.09, -Math.sin(a) * 0.12), 0.04, char);
  }
  const iron = (q: V): Rgb3 => mulRgb(hexLin(0x2c2a28), 0.85 + vnoise3(q.x * 9, q.y * 9, q.z * 9, seed + 2) * 0.3);
  if (TRIPOD_CAMPS.has(mapId)) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      rodCol(m, v3(Math.cos(a) * 0.62, -0.03, Math.sin(a) * 0.62), v3(0, 1.05, 0), 0.018, (q) => mulRgb(POLE_WOOD, 0.85 + vnoise3(q.x * 7, q.y * 7, q.z * 7, seed + 3) * 0.3));
    }
    wireTube(m, [v3(0, 1.03, 0), v3(0, 0.5, 0)], 0.004, iron);
    const pot = new SteelMesh(); pot.round(0.13, -0.1, 0.1, 8, iron);
    const pg = pot.geometry(); pg.rotateX(-Math.PI / 2); pg.translate(0, 0.42, 0); appendGeo(m, pg);
  } else {
    for (const zz of [-0.15, -0.05, 0.05, 0.15]) rodCol(m, v3(-0.4, 0.2, zz), v3(0.4, 0.2, zz), 0.008, iron);
    for (const [gx, gz] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) rodCol(m, v3(gx, 0, gz), v3(gx, 0.2, gz), 0.01, iron);
  }
  const g = m.geometry(); g.translate(x, y, z);
  parts.push({ bucket: 'baked', geometry: g });
  return parts;
}

/** A rod from a to b (a 5-sided round, its colour by `col`). */
function rodCol(m: SteelMesh, a: V, b: V, r: number, col: (q: V, n: V) => Rgb3): void {
  const len = a.distanceTo(b), g = new SteelMesh();
  g.round(r, -len / 2, len / 2, 5, col, 0, 0, false);
  const geo = g.geometry();
  geo.lookAt(new THREE.Vector3().subVectors(b, a));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  geo.translate(mid.x, mid.y, mid.z);
  appendGeo(m, geo);
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
 * A breached stack (props census #10: "sandbag walls spill bags and slump in courses"): the stack as it was laid (the
 * intact's own stream), then a breach where the round struck — its bags thrown down on either face, most to the far
 * one, heaped on what fell before them, a quarter of them burst and slack; the courses either side of it slumped
 * toward the gap and tipped; the spoil core showing low in it; the rest standing. `spend` runs the remnant builder it
 * replaces first, so the props stream keeps every draw it always made.
 */
export function buildSandbagHeap(kind: SandbagStackKind, spend: () => void): THREE.BufferGeometry {
  spend();
  const s = SANDBAG_STACKS[kind];
  const r = sandbagRng(s.seed ^ 0x2f);
  const height = s.top + s.sink;
  const built = sandbagCourses(s.half, s.depth, height, sandbagRng(s.seed));
  built.pop()!.dispose(); // (the spoil core is laid last: a lower one below)
  const xb = (r() - 0.5) * s.half * 0.9, wb = 0.55 + r() * 0.45 * Math.min(1, s.half / 1.5);
  const far = r() < 0.5 ? -1 : 1;
  // the heap the fallen bags pile on, in 10 cm cells over the ground (y = 0)
  const cell = 0.1, heap = new Map<number, number>();
  const key = (i: number, j: number): number => i * 4096 + j;
  const heapAt = (x: number, z: number, rad: number): number => {
    let h = 0;
    for (let i = Math.floor((x - rad) / cell); i <= Math.floor((x + rad) / cell); i++) {
      for (let j = Math.floor((z - rad) / cell); j <= Math.floor((z + rad) / cell); j++) h = Math.max(h, heap.get(key(i, j)) ?? 0);
    }
    return h;
  };
  const raise = (x: number, z: number, rad: number, y: number): void => {
    for (let i = Math.floor((x - rad) / cell); i <= Math.floor((x + rad) / cell); i++) {
      for (let j = Math.floor((z - rad) / cell); j <= Math.floor((z + rad) / cell); j++) heap.set(key(i, j), Math.max(heap.get(key(i, j)) ?? 0, y));
    }
  };
  const parts: THREE.BufferGeometry[] = [];
  const bb = new THREE.Box3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  // the bags lowest first, so the fallen land on those fallen before them
  const bags = built.map((g) => { g.translate(0, -s.sink, 0); bb.setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute); return { g, c: bb.getCenter(c.clone()), e: bb.getSize(e.clone()) }; })
    .sort((a, b) => a.c.y - b.c.y);
  for (const { g, c: bc, e: be } of bags) {
    const t = (bc.y + s.sink) / height, d = Math.abs(bc.x - xb) / wb;
    const falls = (d < 1 && t > 0.2 + 0.35 * d) || (t > 0.78 && r() < 0.4);
    if (!falls) {
      if (d < 1.6 && t > 0.3) {
        // slumped toward the gap: down a little and tipped
        const k = (1.6 - d) / 1.6, toward = Math.sign(xb - bc.x) || 1;
        g.translate(-bc.x, -bc.y, -bc.z).rotateZ(-toward * 0.16 * k).rotateX((r() - 0.5) * 0.1 * k)
          .translate(bc.x + toward * 0.05 * k, bc.y - be.y * 0.45 * k, bc.z);
      }
      parts.push(g);
      continue;
    }
    g.dispose();
    // thrown down onto a face, a closed bag (its hidden faces were never laid), a quarter burst and slack
    const burst = r() < 0.25, len = Math.max(be.x, be.z), wid = Math.max(0.22, Math.min(be.x, be.z)), thick = Math.max(0.1, be.y);
    const bag = sandbagBag(len * (burst ? 1.06 : 1), burst ? thick * 0.62 : thick * 0.95, burst ? wid * 1.15 : wid, r,
      { fill: burst ? 0.76 : 0.92, dirt: 0.5 + r() * 0.4 });
    const side = r() < 0.7 ? far : -far;
    // (of a few places it might land, the lowest: a spill spreads, it does not tower)
    let xt = 0, zt = 0, h = Infinity;
    for (let k = 0; k < 4; k++) {
      const x = bc.x + (r() - 0.5) * 0.8 + (bc.x - xb) * 0.25, z = side * (s.depth + 0.12 + r() * 0.75 * (0.5 + t));
      const hh = heapAt(x, z, 0.16);
      if (hh < h) { h = hh; xt = x; zt = z; }
    }
    const yaw = r() * Math.PI;
    bag.rotateX((r() - 0.5) * 0.3).rotateZ((r() - 0.5) * 0.3).rotateY(yaw);
    const ht = burst ? thick * 0.62 * 0.76 : thick * 0.95 * 0.92;
    bag.translate(xt, h + ht * 0.42, zt);
    raise(xt, zt, 0.16, h + ht * 0.85);
    parts.push(bag);
  }
  // the spoil core, low: its top shows in the gap
  parts.push(sandbagCore(s.half, s.depth * 0.92, height * 0.42, 0.02).translate(0, -s.sink, 0));
  parts.push(sandbagEarthFillet(s.half, s.depth, r));
  const g = sandbagMerge(parts);
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
