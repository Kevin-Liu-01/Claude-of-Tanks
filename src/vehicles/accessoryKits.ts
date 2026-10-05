// src/vehicles/accessoryKits.ts — the fleet's loose crew equipment, rebuilt in the molded / sewn grammar of the
// newest source-study equipment (tank-accessories lane, 2026-10-05; owner: "ghillies, leaves, nets, bags, coolers,
// more — any 3d thing that was old must be improved").
//
// decorations.ts owns placement, materials, merging and budgets; this module owns only the shape of each piece. Every
// builder authors in the piece-local seat frame (origin on the support, +Y up, +Z the piece's forward) through an
// AccessoryPainter, which routes each geometry to its material family with the decor kit's tint/shade conventions.
// Detail 1 is the near level; detail 0 is the coarse level shown past the decor LOD handoff and on the mobile tier —
// the same envelope from fewer segments, without the small hardware. Random draws happen before any detail branch,
// so both levels of one piece always agree (the placement engine seats the coarse copy with the near copy's matrix).
import * as THREE from 'three';
import {
  block, fabricBody, fabricStrap, latheY, moldedBox, place, roundBar, sweptTube,
  type AccessoryDetail, type FabricSpec,
} from './accessoryPrimitives.ts';
import { FoliageCardBuffer } from './vehicleFoliage.ts';

export type RGB = readonly [number, number, number];

export interface AccessoryPainter {
  readonly detail: AccessoryDetail;
  readonly rng: () => number;
  /** Authored-colour hardware (the decor 'cans' family): muted, grime-textured, per-piece tint. */
  paint(geometry: THREE.BufferGeometry, rgb: RGB, ao?: number): void;
  /** Canvas family; `rgb` tints the fabric base colour (1,1,1 = the nation's issue canvas). */
  cloth(geometry: THREE.BufferGeometry, tone?: number, rgb?: RGB): void;
  burlap(geometry: THREE.BufferGeometry, tone?: number): void;
  steel(geometry: THREE.BufferGeometry, tone?: number): void;
  wood(geometry: THREE.BufferGeometry, tone?: number): void;
  rubber(geometry: THREE.BufferGeometry, tone?: number): void;
  kit(geometry: THREE.BufferGeometry, tone?: number): void;
  lens(geometry: THREE.BufferGeometry): void;
  net(geometry: THREE.BufferGeometry, tone?: number): void;
  /** Spray cards (vehicleFoliage.ts) — the geometry carries its own atlas UVs and per-card tint. */
  leaves(geometry: THREE.BufferGeometry): void;
}

export interface EquipmentColours {
  readonly fuelA: RGB; readonly fuelB: RGB; readonly waterA: RGB; readonly waterB: RGB;
  readonly extinguisher: RGB; readonly toolCan: RGB; readonly ammoCase: RGB; readonly accent: RGB;
}

const near = (P: AccessoryPainter): boolean => P.detail === 1;
/** Woven webbing (straps, ties, handles) shares the canvas family: a darker, greener tint of the issue fabric. */
const WEBBING: RGB = [0.5, 0.56, 0.44];
const webbing = (P: AccessoryPainter, geometry: THREE.BufferGeometry, tone = 0.6): void => P.cloth(geometry, tone, WEBBING);
/** Molded black plastic / rubber hardware on painted cases (latches, grips) rides the case's own paint family. */
const BLACK_PLASTIC: RGB = [0.05, 0.052, 0.05];
const scaleRgb = (rgb: RGB, k: number): RGB => [rgb[0] * k, rgb[1] * k, rgb[2] * k];

// ---------------------------------------------------------------------------------------------------------------
// Hard cases
// ---------------------------------------------------------------------------------------------------------------

interface CaseSpec {
  w: number; h: number; d: number;
  body: RGB; lid: RGB;
  /** Lid share of the height. */
  lidShare?: number;
  radius?: number;
  latches?: 'rubber' | 'steel' | 'none';
  handles?: 'ends' | 'top' | 'none';
  /** Pressed reinforcing ribs on the long faces. */
  ribs?: number;
}

/** A molded / pressed case: filleted body, overhanging lid with a parting line, latches and handles. */
export function hardCase(P: AccessoryPainter, c: CaseSpec): void {
  const r = c.radius ?? 0.03;
  const lidH = c.h * (c.lidShare ?? 0.24);
  const bodyH = c.h - lidH;
  const seg = near(P) ? 2 : 1;
  P.paint(place(moldedBox(c.w, bodyH, c.d, r, seg, r * 0.55), 0, bodyH / 2, 0), c.body, 0.32);
  P.paint(place(moldedBox(c.w * 1.018, lidH, c.d * 1.024, r * 1.1, seg, r * 0.7), 0, bodyH + lidH / 2, 0), c.lid, 0.22);
  if (!near(P)) return;
  if ((c.ribs ?? 0) > 0) {
    const n = c.ribs ?? 0;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (c.w * 0.62 / Math.max(1, n - 1 || 1));
      for (const side of [-1, 1]) {
        P.paint(place(block(0.034, bodyH * 0.62, 0.008), x, bodyH * 0.5, side * (c.d / 2 + 0.003)),
          scaleRgb(c.body, 1.07), 0.3);
      }
    }
  }
  if (c.latches !== 'none') {
    for (const side of [-1, 1]) {
      const x = side * c.w * 0.3;
      const latch = place(block(0.05, 0.062, 0.016), x, bodyH + 0.006, c.d / 2 + 0.008);
      if (c.latches === 'steel') P.steel(latch, 0.6); else P.paint(latch, BLACK_PLASTIC, 0.2);
    }
  }
  if (c.handles === 'ends') {
    for (const side of [-1, 1]) {
      const x = side * (c.w / 2 + 0.016);
      P.paint(roundBar([x, bodyH * 0.62, -c.d * 0.2], [x, bodyH * 0.62, c.d * 0.2], 0.011, 6), BLACK_PLASTIC, 0.2);
      for (const z of [-c.d * 0.2, c.d * 0.2]) {
        P.paint(place(block(0.022, 0.03, 0.024), side * (c.w / 2 + 0.006), bodyH * 0.62, z),
          scaleRgb(c.body, 0.9), 0.3);
      }
    }
  } else if (c.handles === 'top') {
    const y = c.h + 0.028;
    P.steel(roundBar([-c.w * 0.18, y, 0], [c.w * 0.18, y, 0], 0.011, 6), 0.55);
    for (const x of [-c.w * 0.18, c.w * 0.18]) P.steel(roundBar([x, c.h - 0.004, 0], [x, y, 0], 0.009, 6), 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Jerrycans
// ---------------------------------------------------------------------------------------------------------------

/**
 * One 20 L jerrycan standing on its base: 165 mm thick (local X), 470 mm tall, 345 mm wide (local Z); the stamped X on
 * the broad faces, the three-handle comb across the top and the offset spout. `outer` picks which broad face carries
 * the stamped X (the hidden inner faces of a pair carry none).
 */
export function jerrycan(P: AccessoryPainter, x: number, rgb: RGB, scale = 1, outer: -1 | 0 | 1 = 0): void {
  const t = 0.165 * scale, h = 0.44 * scale, w = 0.345 * scale;
  const seg = near(P) ? 1 : 0;
  P.paint(place(moldedBox(t, h, w, 0.022 * scale, seg, 0.012 * scale), x, h / 2, 0), rgb, 0.28);
  if (!near(P)) {
    P.paint(place(moldedBox(t * 0.5, 0.03 * scale, w * 0.62, 0, 0, 0.004), x, h + 0.015 * scale, -w * 0.06), scaleRgb(rgb, 0.9));
    return;
  }
  const faces: number[] = outer === 0 ? [-1, 1] : [outer];
  const rib = scaleRgb(rgb, 1.1);
  const diag = Math.atan2(h * 0.62, w * 0.62);
  const ribLen = Math.hypot(h * 0.62, w * 0.62);
  for (const f of faces) {
    for (const s of [-1, 1]) {
      P.paint(place(block(0.006, ribLen, 0.026 * scale),
        x + f * (t / 2 + 0.002), h * 0.47, 0, s * (Math.PI / 2 - diag), 0, 0), rib, 0.2);
    }
  }
  // handle comb: a pressed spine along the top and three grips across it
  const top = h + 0.004 * scale;
  P.paint(place(block(t * 0.42, 0.024 * scale, w * 0.58), x, top + 0.008 * scale, -w * 0.08), scaleRgb(rgb, 0.92), 0.3);
  for (const z of [-0.2, -0.08, 0.04]) {
    P.paint(roundBar([x - t * 0.36, top + 0.03 * scale, z * scale], [x + t * 0.36, top + 0.03 * scale, z * scale], 0.0085 * scale, 4),
      scaleRgb(rgb, 0.95), 0.25);
  }
  // spout and bayonet cap on the forward shoulder
  P.paint(place(latheY([[0.024, 0], [0.026, 0.03], [0.03, 0.034], [0.03, 0.05], [0.001, 0.052]], 6),
    x, h - 0.02 * scale, w * 0.36, 0.42, 0, 0, scale), scaleRgb(rgb, 0.85), 0.3);
}

function canPair(P: AccessoryPainter, a: RGB, b: RGB, scale: number, cradle: boolean): void {
  // two cans in a welded cradle with a centre divider between them
  const gap = 0.215 * scale;
  jerrycan(P, -gap / 2, a, scale, -1);
  jerrycan(P, gap / 2, b, scale, 1);
  if (!cradle) return;
  const w = 0.43 * scale, d = 0.37 * scale;
  P.steel(place(block(w, 0.022, d), 0, 0.011, 0), 0.48);
  for (const z of [-d / 2 + 0.012, d / 2 - 0.012]) P.steel(place(block(w, 0.17 * scale, 0.012), 0, 0.085 * scale, z), 0.46);
  P.steel(place(block(0.02, 0.2 * scale, d - 0.03), 0, 0.1 * scale, 0), 0.46);
  if (near(P)) webbing(P, place(block(w + 0.012, 0.028, 0.012), 0, 0.33 * scale, 0), 0.62);
}

// ---------------------------------------------------------------------------------------------------------------
// Sewn bags
// ---------------------------------------------------------------------------------------------------------------

/**
 * A fabric body along local X (bags lie across the piece frame), seated on y = 0 at its measured lowest point, with
 * webbing straps at its cinches. Returns the seat lift and the body's top height (both in the piece frame).
 */
function bag(P: AccessoryPainter, spec: FabricSpec, at: readonly [number, number, number], yaw = 0, tone = 0.75,
  rgb?: RGB, strapTone = 0.55): { lift: number; top: number } {
  const s: FabricSpec = { ...spec, detail: P.detail };
  const body = place(fabricBody(s), 0, 0, 0, 0, Math.PI / 2, 0);
  body.computeBoundingBox();
  // copy: applyMatrix4 below recomputes the geometry's own box in place
  const box = body.boundingBox!.clone();
  const lift = -box.min.y;
  P.cloth(place(body, at[0], at[1] + lift, at[2], 0, yaw, 0), tone, rgb);
  for (const z of s.cinch ?? []) {
    const strap = place(place(fabricStrap(s, z), 0, 0, 0, 0, Math.PI / 2, 0), at[0], at[1] + lift, at[2], 0, yaw, 0);
    webbing(P, strap, strapTone);
  }
  return { lift, top: at[1] + lift + box.max.y };
}

/** A carry handle: a flattened webbing loop on top of a bag (near level only). */
function webbingLoop(P: AccessoryPainter, x: number, y: number, z: number, span: number, rise: number, yaw = 0): void {
  if (!near(P)) return;
  const pts = [[-span / 2, 0, 0], [-span * 0.3, rise, 0], [span * 0.3, rise, 0], [span / 2, 0, 0]]
    .map(([px, py, pz]) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return [x + px * c + pz * s, y + py, z - px * s + pz * c];
    });
  webbing(P, sweptTube(pts, 0.006, 4, 6), 0.6);
}

export function duffel(P: AccessoryPainter, len: number, radius: number, at: readonly [number, number, number], yaw: number,
  tone: number, seed: number, rgb?: RGB): void {
  const spec: FabricSpec = { len, hw: radius * 1.05, hh: radius, exponent: 2.5, endScale: 0.62, endLength: 0.12,
    flatten: 0.32, wrinkle: 0.05, seg: 10, stations: 6, cinch: [-len * 0.28, len * 0.28], seed };
  const { top } = bag(P, spec, at, yaw, tone, rgb);
  webbingLoop(P, at[0], top - 0.008, at[2], len * 0.3, 0.032, yaw);
}

export function bedroll(P: AccessoryPainter, len: number, radius: number, at: readonly [number, number, number], yaw: number,
  tone: number, seed: number, rgb?: RGB): void {
  const spec: FabricSpec = { len, hw: radius, hh: radius, exponent: 2.05, endScale: 0.9, endLength: 0.05,
    flatten: 0.14, wrinkle: 0.035, seg: 10, stations: 4, cinch: [-len * 0.3, len * 0.3], cinchDepth: 0.1, seed };
  const { lift } = bag(P, spec, at, yaw, tone, rgb, 0.5);
  if (!near(P)) return;
  // the rolled end: a slightly sunken, darker spiral face on each end
  for (const side of [-1, 1]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = side * (len / 2 - 0.004);
    const ring = place(new THREE.RingGeometry(radius * 0.3, radius * 0.62, 8, 1).toNonIndexed(),
      at[0] + ex * c * 1.004, at[1] + lift, at[2] - ex * s * 1.004, 0, side * Math.PI / 2 + yaw, 0);
    P.cloth(ring, tone * 0.62, rgb);
  }
}

/** A frame or ALICE-pattern rucksack lying on its back panel: main bag, lid flap, side pockets and compression straps. */
export function rucksack(P: AccessoryPainter, w: number, len: number, h: number, at: readonly [number, number, number], yaw: number,
  tone: number, seed: number, rgb?: RGB): void {
  const main: FabricSpec = { len, hw: w / 2, hh: h / 2, exponent: 3.6, endScale: 0.72, endLength: 0.14,
    flatten: 0.4, wrinkle: 0.04, seg: 10, stations: 5, cinch: [-len * 0.16, len * 0.2], cinchDepth: 0.06, seed };
  const { top } = bag(P, main, at, yaw, tone, rgb, 0.5);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx: number, ly: number, lz: number): [number, number, number] =>
    [at[0] + lz * s + lx * c, at[1] + ly, at[2] + lz * c - lx * s];
  // the lid flap folded over the top end
  const flap: FabricSpec = { len: w * 0.92, hw: len * 0.17, hh: h * 0.16, exponent: 3, endScale: 0.8, endLength: 0.1,
    flatten: 0.6, wrinkle: 0.03, seg: 8, stations: 4, seed: seed + 3 };
  const fl = local(len * 0.36, top - h * 0.12, 0);
  P.cloth(place(fabricBody({ ...flap, detail: P.detail }), fl[0], fl[1], fl[2], 0, yaw, 0), tone * 0.92, rgb);
  // two side pockets (part of the silhouette at both levels)
  for (const side of [-1, 1]) {
    const pocket: FabricSpec = { len: len * 0.36, hw: w * 0.11, hh: h * 0.26, exponent: 3.4, endScale: 0.7, endLength: 0.2,
      flatten: 0.3, wrinkle: 0.03, seg: 6, stations: 3, seed: seed + 7 + side, detail: P.detail };
    const p = local(-len * 0.02, h * 0.3, side * (w / 2 + w * 0.08));
    P.cloth(place(fabricBody(pocket), p[0], p[1], p[2], 0, Math.PI / 2 + yaw, 0), tone * 0.88, rgb);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cargo variants (the fleet-wide loose-equipment vocabulary, decorations.ts FLEET_EQUIPMENT_VARIANTS)
// ---------------------------------------------------------------------------------------------------------------

const BLUE_COOLER: RGB = [0.08, 0.19, 0.29];
const COOLER_LID: RGB = [0.5, 0.52, 0.49];

export function buildCargoVariant(variant: string, P: AccessoryPainter, colours: EquipmentColours, flat?: boolean): void {
  // Every random draw happens here, before any detail branch (both LOD levels agree).
  const r = [P.rng(), P.rng(), P.rng(), P.rng()];
  switch (variant) {
  case 'beer-cooler-blue':
    hardCase(P, { w: 0.54, h: 0.34, d: 0.36, body: BLUE_COOLER, lid: COOLER_LID, lidShare: 0.24, radius: 0.04,
      latches: 'rubber', handles: 'ends', ribs: 0 });
    if (near(P)) {
      // molded drain plug and the lid's raised panel
      P.paint(place(latheY([[0.016, 0], [0.016, 0.014], [0.001, 0.016]], 8), -0.17, 0.05, 0.181, Math.PI / 2, 0, 0), COOLER_LID, 0.3);
      P.paint(place(moldedBox(0.38, 0.012, 0.24, 0.03, 1, 0.004), 0, 0.344, 0), [0.56, 0.58, 0.55], 0.2);
    }
    break;
  case 'cooler-red':
    hardCase(P, { w: 0.46, h: 0.3, d: 0.32, body: [0.62, 0.11, 0.08], lid: [0.82, 0.82, 0.78], lidShare: 0.26, radius: 0.035,
      latches: 'none', handles: 'top' });
    break;
  case 'insulated-chest-olive':
    // Mermite-style insulated food container: tall pressed can, clamp latches, side grips
    hardCase(P, { w: 0.5, h: 0.42, d: 0.34, body: [0.30, 0.36, 0.19], lid: [0.34, 0.40, 0.21], lidShare: 0.18, radius: 0.045,
      latches: 'steel', handles: 'ends', ribs: 2 });
    break;
  case 'long-duffel':
    duffel(P, 0.78, 0.15, [0, 0, 0], (r[0] - 0.5) * 0.1, 0.66 + r[1] * 0.06, 11);
    break;
  case 'large-rucksack':
    rucksack(P, 0.38, 0.56, 0.24, [0, 0, 0], (r[0] - 0.5) * 0.18, 0.62 + r[1] * 0.05, 23);
    break;
  case 'bedroll-pair':
    bedroll(P, 0.6, 0.085, [0, 0, -0.095], (r[0] - 0.5) * 0.06, 0.66, 31, [0.94, 0.98, 0.86]);
    bedroll(P, 0.58, 0.085, [0.01, 0, 0.095], (r[1] - 0.5) * 0.06, 0.8, 37, [1.04, 1.0, 0.9]);
    break;
  case 'folded-tarp-pack': {
    const spec: FabricSpec = { len: 0.5, hw: 0.17, hh: 0.075, exponent: 6, endScale: 0.86, endLength: 0.07,
      flatten: 0.55, wrinkle: 0.03, seg: 12, stations: 5, cinch: [-0.14, 0.14], cinchDepth: 0.07, seed: 41 };
    bag(P, spec, [0, 0, 0], (r[0] - 0.5) * 0.08, 0.7, [0.95, 0.97, 0.9]);
    break;
  }
  case 'camo-net-bag': {
    const spec: FabricSpec = { len: 0.52, hw: 0.17, hh: 0.15, exponent: 2.2, endScale: 0.28, endLength: 0.22,
      flatten: 0.3, wrinkle: 0.08, seg: 12, stations: 6, cinch: [0.17], cinchDepth: 0.18, seed: 53 };
    bag(P, spec, [0, 0, 0], (r[0] - 0.5) * 0.3, 0.52, [0.9, 1.0, 0.82]);
    if (near(P)) {
      // garnish tufts escaping the drawstring end
      for (let i = 0; i < 3; i++) {
        const tuft = new THREE.PlaneGeometry(0.16, 0.11, 1, 1).toNonIndexed();
        P.net(place(tuft, 0.25 + i * 0.012, 0.14 + i * 0.02, (i - 1) * 0.05, -0.3 + i * 0.4, 0.9 + i, 0.4), 0.95);
      }
    }
    break;
  }
  case 'nato-fuel-can':
    canPair(P, colours.fuelA, colours.fuelB, 0.94, true);
    break;
  case 'blue-water-can':
    canPair(P, colours.waterA, colours.waterB, 0.94, true);
    break;
  case 'twin-can-cradle':
    canPair(P, colours.fuelA, colours.fuelB, 0.92, true);
    break;
  case 'soviet-tool-can': {
    // cylindrical ZIP tube: rolled ends, clamp bands and a hinged end lid
    const len = 0.62, rad = 0.12;
    const seg = near(P) ? 14 : 8;
    const body = latheY([[0.0005, 0], [rad * 0.92, 0], [rad, 0.012], [rad, len - 0.012], [rad * 0.92, len], [0.0005, len]], seg);
    P.paint(place(body, -len / 2, rad, 0, 0, 0, -Math.PI / 2), colours.toolCan, 0.3);
    if (near(P)) {
      for (const x of [-0.2, 0.2]) {
        P.steel(place(new THREE.TorusGeometry(rad + 0.004, 0.009, 3, 12).toNonIndexed(), x, rad, 0, 0, Math.PI / 2, 0), 0.5);
      }
      P.steel(place(block(0.05, 0.03, 0.05), len / 2 - 0.03, rad * 2 + 0.004, 0), 0.55);
    }
    break;
  }
  case 'fifty-cal-ammo-can':
    // M2A1 can: pressed body, gasketed lid, end latch lever and folding handle
    hardCase(P, { w: 0.3, h: 0.19, d: 0.155, body: colours.ammoCase, lid: scaleRgb(colours.ammoCase, 1.06), lidShare: 0.2,
      radius: 0.012, latches: 'none', handles: 'top', ribs: 2 });
    if (near(P)) P.paint(place(moldedBox(0.03, 0.09, 0.05, 0.006, 1, 0.003), 0.162, 0.13, 0), scaleRgb(colours.ammoCase, 0.9), 0.3);
    break;
  case 'wood-ammo-crate': {
    const w = 0.6, h = 0.3, d = 0.36;
    P.wood(place(moldedBox(w, h, d, 0.008, 1, 0.006), 0, h / 2, 0), 0.78);
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) P.wood(place(moldedBox(0.05, h + 0.012, d + 0.016, 0.006, 1, 0.005), x, h / 2, 0), 0.6);
    if (near(P)) {
      for (const z of [-d * 0.28, d * 0.28]) P.steel(place(moldedBox(w - 0.1, 0.012, 0.022, 0, 0, 0.003), 0, h + 0.006, z), 0.42);
      for (const side of [-1, 1]) {
        const x = side * (w / 2 + 0.01);
        P.burlap(sweptTube([[x, h * 0.72, -0.07], [x + side * 0.035, h * 0.55, -0.04], [x + side * 0.035, h * 0.55, 0.04], [x, h * 0.72, 0.07]], 0.009, 4, 6), 0.9);
      }
    }
    break;
  }
  case 'ration-case': {
    // banded fibreboard case: soft corners, tape seam and a printed label panel
    const w = 0.42, h = 0.24, d = 0.3;
    P.paint(place(moldedBox(w, h, d, 0.012, 1, 0.008), 0, h / 2, 0), [0.46, 0.34, 0.2], 0.3);
    if (near(P)) {
      P.paint(place(moldedBox(w + 0.004, 0.006, 0.07, 0, 0, 0.002), 0, h + 0.001, 0), [0.6, 0.47, 0.28], 0.2);
      for (const x of [-w * 0.3, w * 0.3]) P.steel(place(moldedBox(0.014, h + 0.008, d + 0.008, 0, 0, 0.002), x, h / 2, 0), 0.4);
      P.paint(place(moldedBox(0.16, 0.08, 0.004, 0, 0, 0.001), 0.04, h * 0.55, d / 2 + 0.002), [0.78, 0.72, 0.56], 0.15);
    }
    break;
  }
  case 'medical-case':
    hardCase(P, { w: 0.42, h: 0.24, d: 0.28, body: [0.30, 0.38, 0.2], lid: [0.34, 0.43, 0.22], lidShare: 0.3, radius: 0.025,
      latches: 'steel', handles: 'top' });
    if (near(P)) {
      for (const [cw, ch] of [[0.04, 0.12], [0.12, 0.04]]) {
        P.paint(place(new THREE.BoxGeometry(cw, ch, 0.004).toNonIndexed(), 0, 0.11, 0.143), [0.86, 0.84, 0.78], 0.12);
      }
    }
    break;
  case 'mechanics-tool-chest':
    hardCase(P, { w: 0.52, h: 0.25, d: 0.24, body: [0.56, 0.09, 0.06], lid: [0.64, 0.12, 0.08], lidShare: 0.34, radius: 0.01,
      latches: 'steel', handles: 'top' });
    break;
  case 'fire-extinguisher': {
    const len = 0.5, rad = 0.085;
    const seg = near(P) ? 12 : 8;
    const shell = latheY([[0.0005, 0], [rad * 0.8, 0.004], [rad, 0.03], [rad, len - 0.06], [rad * 0.72, len - 0.02],
      [0.03, len], [0.0005, len + 0.004]], seg);
    const upright = flat === false;
    const lay = (g: THREE.BufferGeometry): THREE.BufferGeometry => (upright ? g : place(g, -len / 2, rad + 0.03, 0, 0, 0, -Math.PI / 2));
    P.paint(lay(shell), colours.extinguisher, 0.3);
    if (near(P)) {
      P.steel(lay(place(block(0.05, 0.05, 0.04), 0, len + 0.03, 0)), 0.55);
      P.steel(lay(place(block(0.12, 0.012, 0.024), 0.04, len + 0.06, 0, 0, 0, -0.2)), 0.5);
      P.paint(lay(sweptTube([[0.02, len + 0.03, 0.02], [0.06, len - 0.02, rad + 0.01], [0.04, len * 0.6, rad + 0.012]], 0.008, 4, 6)), BLACK_PLASTIC, 0.2);
    }
    if (!upright) {
      for (const x of [-0.13, 0.13]) {
        P.steel(place(new THREE.TorusGeometry(rad + 0.008, 0.008, 3, 8, Math.PI).toNonIndexed(), x, rad + 0.03, 0, 0, Math.PI / 2, Math.PI), 0.45);
        P.steel(place(block(0.03, 0.03, rad * 2.2), x, 0.015, 0), 0.45);
      }
    }
    break;
  }
  case 'cable-reel': {
    const fr = 0.18, core = 0.08, w = 0.3;
    const seg = near(P) ? 14 : 8;
    for (const x of [-w / 2, w / 2]) P.wood(place(latheY([[0.0005, 0], [fr, 0], [fr, 0.034], [0.0005, 0.034]], seg), x - 0.017, fr, 0, 0, 0, -Math.PI / 2), 0.66);
    P.steel(place(latheY([[0.0005, 0], [core + 0.07, 0], [core + 0.075, 0.03], [core + 0.07, w - 0.06], [core + 0.075, w - 0.034],
      [0.0005, w - 0.034]], seg), -w / 2 + 0.017, fr, 0, 0, 0, -Math.PI / 2), 0.4);
    P.steel(sweptTube([[0.04, fr + core + 0.07, 0], [0.12, fr + 0.06, 0.12], [0.16, 0.03, 0.22], [0.24, 0.015, 0.28]], 0.012,
      near(P) ? 5 : 4, near(P) ? 8 : 4), 0.42);
    break;
  }
  case 'helmet-bundle': {
    const seg = near(P) ? 9 : 6;
    const shell = (): THREE.BufferGeometry => latheY([[0.15, 0], [0.142, 0.016], [0.122, 0.07], [0.08, 0.122], [0.0005, 0.142]], seg);
    for (const [x, ry, tilt] of [[-0.16, 0.2, 0.25], [0, -0.3, 0], [0.16, 0.5, -0.25]] as const) {
      P.paint(place(shell(), x, tilt ? 0.02 : 0, 0, 0, ry + r[2] * 0.3, tilt), [0.27, 0.33, 0.18], 0.35);
    }
    webbing(P, place(block(0.5, 0.02, 0.03), 0, 0.09, 0.14), 0.55);
    break;
  }
  case 'crew-backpack':
    rucksack(P, 0.32, 0.42, 0.2, [0, 0, 0], (r[0] - 0.5) * 0.2, 0.6, 61, [0.98, 1.0, 0.92]);
    break;
  case 'folding-chair': {
    // camp chair: aluminium X-frame, sling seat and back
    const w = 0.44, legR = 0.011;
    const seg = near(P) ? 6 : 4;
    for (const x of [-w / 2, w / 2]) {
      P.steel(roundBar([x, 0, -0.18], [x, 0.4, 0.14], legR, seg), 0.62);
      P.steel(roundBar([x, 0, 0.18], [x, 0.4, -0.14], legR, seg), 0.62);
      P.steel(roundBar([x, 0.4, -0.14], [x, 0.72, -0.2], legR, seg), 0.62);
    }
    P.steel(roundBar([-w / 2, 0.4, 0.14], [w / 2, 0.4, 0.14], legR, seg), 0.6);
    P.steel(roundBar([-w / 2, 0.4, -0.14], [w / 2, 0.4, -0.14], legR, seg), 0.6);
    const seat = place(moldedBox(w, 0.012, 0.3, 0, 0, 0.003), 0, 0.385, 0);
    const back = place(moldedBox(w, 0.28, 0.012, 0, 0, 0.003), 0, 0.57, -0.17, -0.18, 0, 0);
    P.cloth(seat, 0.6, [0.9, 1.0, 0.86]);
    P.cloth(back, 0.66, [0.9, 1.0, 0.86]);
    break;
  }
  case 'spare-optics-case':
    hardCase(P, { w: 0.44, h: 0.26, d: 0.32, body: [0.17, 0.19, 0.16], lid: [0.21, 0.23, 0.2], lidShare: 0.36, radius: 0.025,
      latches: 'rubber', handles: 'top', ribs: 0 });
    break;
  case 'thermos-crate': {
    const w = 0.5, h = 0.22, d = 0.34;
    P.wood(place(moldedBox(w, h, d, 0.006, 1, 0.005), 0, h / 2, 0), 0.74);
    const seg = near(P) ? 8 : 6;
    for (const x of [-0.12, 0.12]) {
      P.paint(place(latheY([[0.0005, 0], [0.058, 0], [0.062, 0.02], [0.062, 0.24], [0.05, 0.27], [0.0005, 0.27]], seg), x, h - 0.06, 0), [0.66, 0.66, 0.6], 0.3);
      P.paint(place(latheY([[0.0005, 0], [0.052, 0], [0.052, 0.05], [0.0005, 0.052]], seg), x, h + 0.21, 0), [0.18, 0.2, 0.17], 0.3);
    }
    if (near(P)) for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) P.wood(place(block(0.035, h + 0.01, d + 0.014), x, h / 2, 0), 0.56);
    break;
  }
  default:
    hardCase(P, { w: 0.5, h: 0.28, d: 0.34, body: BLUE_COOLER, lid: COOLER_LID });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Other shared stowage kits
// ---------------------------------------------------------------------------------------------------------------

/** Mixed soft stowage cluster (rucksacks, bedrolls, duffels) along X, centred, seated on y = 0. Returns its span. */
export function buildPackCluster(P: AccessoryPainter, n: number): number {
  const picks: number[] = [];
  for (let i = 0; i < n; i++) picks.push(P.rng(), P.rng(), P.rng());
  let x = 0;
  const pieces: Array<() => void> = [];
  for (let i = 0; i < n; i++) {
    const [kind, toneR, yawR] = picks.slice(i * 3, i * 3 + 3);
    const tone = 0.56 + toneR * 0.3;
    const at = x;
    if (kind < 0.4) {
      pieces.push(() => rucksack(P, 0.3, 0.38, 0.2, [at + 0.15, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.4, tone, 100 + i));
      x += 0.34;
    } else if (kind < 0.75) {
      pieces.push(() => bedroll(P, 0.5, 0.08, [at + 0.09, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.3, tone, 200 + i));
      x += 0.19;
    } else {
      pieces.push(() => duffel(P, 0.46, 0.11, [at + 0.12, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.4, tone, 300 + i));
      x += 0.26;
    }
  }
  for (const piece of pieces) piece();
  return x;
}

/** A rolled tarp along local X, seated on y = 0: firm roll, cinched by two straps, the rolled ends visible. */
export function buildTarpRoll(P: AccessoryPainter, len: number, radius: number, tone: number, seed = 71): void {
  const spec: FabricSpec = { len, hw: radius, hh: radius * 0.94, exponent: 2.1, endScale: 0.92, endLength: 0.04,
    flatten: 0.16, wrinkle: 0.03, seg: 10, stations: 4, cinch: [-len * 0.3, len * 0.3], cinchDepth: 0.1, seed };
  bag(P, spec, [0, 0, 0], 0, tone);
  if (!near(P)) return;
  for (const side of [-1, 1]) {
    const ring = place(new THREE.RingGeometry(radius * 0.28, radius * 0.6, 8, 1).toNonIndexed(),
      side * (len / 2 + 0.002), radius * 0.86, 0, 0, side * Math.PI / 2, 0);
    P.cloth(ring, tone * 0.6);
  }
}

/** Rolled camouflage net: a lumpy, gathered bundle with the net's garnish skin over its upper half and three ties. */
export function buildNetRoll(P: AccessoryPainter, len: number, tone: number): void {
  const R = 0.13;
  const spec: FabricSpec = { len, hw: R * 1.05, hh: R, exponent: 2.1, endScale: 0.62, endLength: 0.12, flatten: 0.2,
    wrinkle: 0.14, seg: 10, stations: 6, cinch: [-len * 0.32, 0.02, len * 0.34], cinchDepth: 0.16, seed: 83 };
  const { lift } = bag(P, spec, [0, 0, 0], 0, tone, [0.92, 1.02, 0.84], 0.45);
  // garnish skin: an open sleeve over the roll's upper half (net material, seen from both sides)
  const skinSeg = near(P) ? 10 : 6;
  const skin = new THREE.CylinderGeometry(R * 1.1, R * 1.1, len * 0.9, skinSeg, 1, true, 0, Math.PI).toNonIndexed();
  P.net(place(skin, 0, lift, 0, 0, 0, Math.PI / 2), 0.95);
}

/**
 * A draped camouflage net patch over a deck: a sagging sheet hung from its high middle, ragged hem, folds, and garnish
 * tufts standing proud of the sheet (near level). Piece frame: footprint w (X) by len (Z), seated on y = 0.
 */
export function buildNetDrape(P: AccessoryPainter, w: number, len: number, seed: number): void {
  const nx = near(P) ? 10 : 5, nz = near(P) ? 12 : 6;
  const positions: number[] = [];
  const at = (i: number, k: number): [number, number, number] => {
    const u = i / nx, v = k / nz;
    const x = (u - 0.5) * w, z = (v - 0.5) * len;
    const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
    const fold = Math.sin(x * 9 + seed) * Math.cos(z * 7 - seed) * 0.03 + Math.sin(z * 15 + x * 3 + seed * 2) * 0.012;
    const ragged = (edge > 0.8 ? -0.04 * ((Math.sin(i * 7.1 + k * 3.3 + seed) + 1) / 2) : 0);
    return [x * (1 + ragged * 0.6), 0.075 + fold - edge * edge * 0.085, z * (1 + ragged * 0.6)];
  };
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, k), b = at(i + 1, k), c = at(i + 1, k + 1), d = at(i, k + 1);
      positions.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
  }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sheet.computeVertexNormals();
  P.net(sheet, 1.0);
  if (!near(P)) return;
  for (let t = 0; t < 7; t++) {
    const u = (Math.sin(seed * 3.1 + t * 2.7) * 0.5 + 0.5) * 0.8 + 0.1;
    const v = (Math.sin(seed * 1.7 + t * 4.3) * 0.5 + 0.5) * 0.8 + 0.1;
    const [x, y, z] = at(Math.round(u * nx), Math.round(v * nz));
    const tuft = new THREE.PlaneGeometry(0.2, 0.1, 1, 1).toNonIndexed();
    P.net(place(tuft, x, y + 0.03, z, -0.6 + (t % 3) * 0.3, t * 1.3, 0.2), 0.9);
  }
}

/** A filled sandbag: a pillow with a folded, tied neck, lying on y = 0, long axis X. */
export function sandbag(P: AccessoryPainter, len: number, w: number, h: number, at: readonly [number, number, number], yaw: number,
  roll: number, tone: number, seed: number): void {
  const spec: FabricSpec = { len, hw: w / 2, hh: h / 2, exponent: 2.6, endScale: 0.5, endLength: 0.22, flatten: 0.42,
    wrinkle: 0.06, seg: near(P) ? 8 : 6, stations: near(P) ? 5 : 3, sag: 0.006, seed, detail: P.detail };
  const lift = (h / 2) * (1 - 0.42) + 0.002;
  const body = place(place(fabricBody(spec), 0, 0, 0, 0, Math.PI / 2, roll), at[0], at[1] + lift, at[2], 0, yaw, 0);
  P.burlap(body, tone);
}

/** Pioneer tools on clamps, laid along +Z, fanned across X. */
export function buildTools(P: AccessoryPainter, set: readonly string[]): void {
  const tones = set.map(() => [P.rng(), P.rng(), P.rng()]);
  set.forEach((tool, idx) => {
    const lane = (idx - (set.length - 1) / 2) * 0.115;
    const [toneR, jitter] = tones[idx];
    const tone = 0.62 + toneR * 0.16;
    const dz = (jitter - 0.5) * 0.1;
    const seg = near(P) ? 6 : 4;
    if (tool === 'shovel') {
      P.wood(roundBar([lane, 0.03, -0.42 + dz], [lane, 0.03, 0.34 + dz], 0.017, seg), tone);
      // D-grip
      if (near(P)) P.wood(sweptTube([[lane - 0.05, 0.03, -0.42 + dz], [lane - 0.05, 0.03, -0.5 + dz], [lane + 0.05, 0.03, -0.5 + dz], [lane + 0.05, 0.03, -0.42 + dz]], 0.012, 4, 6), tone * 0.9);
      // dished blade: a shallow bent plate tapering to a point
      const blade = latheY([[0.0005, 0], [0.075, 0.02], [0.08, 0.17], [0.05, 0.25], [0.0005, 0.27]], near(P) ? 8 : 5);
      blade.scale(1, 1, 0.12);
      P.steel(place(blade, lane, 0.036, 0.33 + dz, Math.PI / 2, 0, 0), 0.55);
    } else if (tool === 'axe') {
      P.wood(roundBar([lane, 0.03, -0.3 + dz], [lane, 0.03, 0.32 + dz], 0.016, seg), tone);
      P.steel(place(moldedBox(0.04, 0.05, 0.17, 0.008, 1, 0.006), lane, 0.032, 0.3 + dz), 0.55);
      P.steel(place(block(0.012, 0.05, 0.11), lane + 0.03, 0.032, 0.33 + dz, 0, -0.25, 0), 0.62);
    } else if (tool === 'sledge') {
      P.wood(roundBar([lane, 0.035, -0.35 + dz], [lane, 0.035, 0.32 + dz], 0.017, seg), tone);
      P.steel(place(moldedBox(0.075, 0.075, 0.15, 0.01, 1, 0.008), lane, 0.038, 0.33 + dz), 0.48);
    } else {
      P.steel(sweptTube([[lane, 0.026, -0.38 + dz], [lane, 0.026, 0.3 + dz], [lane, 0.04, 0.36 + dz], [lane, 0.07, 0.38 + dz]], 0.012, 5, 6), 0.5);
    }
    for (const cz of [-0.2, 0.22]) P.kit(place(block(0.05, 0.05, 0.035), lane, 0.026, cz), 0.88);
  });
}

/** An unditching log along X: an irregular trunk with bark tone, pale end grain and two chain straps. */
export function buildLog(P: AccessoryPainter, len: number, R: number, tone: number, seed: number): void {
  const seg = near(P) ? 10 : 6;
  const stations = near(P) ? 6 : 2;
  const profile: Array<readonly [number, number]> = [];
  profile.push([0.0005, 0]);
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const swell = 1 + 0.06 * Math.sin(t * 9.4 + seed) + 0.04 * Math.sin(t * 23 + seed * 2);
    profile.push([R * (1 - 0.06 * t) * swell, t * len]);
  }
  profile.push([0.0005, len]);
  P.wood(place(latheY(profile, seg), -len / 2, 0, 0, 0, 0, -Math.PI / 2), tone * 0.62);
  if (near(P)) {
    // pale end grain, a hair proud of each sawn end
    for (const side of [-1, 1]) {
      const cut = new THREE.CircleGeometry(R * (side < 0 ? 0.9 : 0.85), seg).toNonIndexed();
      P.wood(place(cut, side * (len / 2 + 0.002), 0, 0, 0, side * Math.PI / 2, 0), 1.0);
    }
  }
  for (const s of [-1, 1]) {
    P.steel(place(new THREE.TorusGeometry(R + 0.006, 0.012, 3, seg).toNonIndexed(), s * len * 0.31, 0, 0, 0, Math.PI / 2, 0), 0.42);
  }
}

/** A 200 L steel drum along `transverse` X or Z: rolled chimes, two rolling hoops, bung caps. Centre on the origin. */
export function drum200(P: AccessoryPainter, cx: number, transverse: boolean, tone: number): void {
  const R = 0.28, L = 0.85;
  const seg = near(P) ? 14 : 9;
  const hoop = (y: number): Array<readonly [number, number]> => [[R, y - 0.016], [R + 0.012, y], [R, y + 0.016]];
  const profile: Array<readonly [number, number]> = [[0.0005, 0.01], [R - 0.012, 0.012], [R + 0.004, 0], [R, 0.02],
    ...(near(P) ? hoop(L * 0.29) : []), ...(near(P) ? hoop(L * 0.71) : []), [R, L - 0.02], [R + 0.004, L], [R - 0.012, L - 0.012], [0.0005, L - 0.01]];
  const body = latheY(profile, seg);
  if (transverse) place(body, cx - L / 2, 0, 0, 0, 0, -Math.PI / 2);
  else place(body, cx, 0, -L / 2, Math.PI / 2, 0, 0);
  P.kit(body, tone);
  if (near(P)) {
    const cap = latheY([[0.0005, 0], [0.03, 0], [0.03, 0.016], [0.0005, 0.018]], 8);
    if (transverse) P.steel(place(cap, cx + L / 2, R * 0.55, 0, 0, 0, -Math.PI / 2), 0.5);
    else P.steel(place(cap, cx, R * 0.55, L / 2, Math.PI / 2, 0, 0), 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fresh-cut branches (2026-10-05, owner-approved proposal E): the field camouflage of the 2022 war imagery — cut
// branches tucked into turret stowage and laid along fenders — from the trees lane's spray cards on woody stems.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A bundle of cut branches. 'upright': tucked against a wall, stems at the seat rising and fanning fore and aft
 * along local X with a little outward (+Z) splay. 'lying': laid on a deck along local X, the sprays spilling over both sides.
 * Seated on y = 0.
 */
export function buildBranchBundle(P: AccessoryPainter, variant: 'upright' | 'lying', count: number): void {
  const draws: number[][] = [];
  for (let i = 0; i < count; i++) draws.push([P.rng(), P.rng(), P.rng(), P.rng(), P.rng(), P.rng()]);
  const cards = new FoliageCardBuffer();
  const sprays = near(P) ? 3 : 2;
  draws.forEach(([a, b, c, d, e, f], i) => {
    const len = 0.85 + a * 0.45;
    const base: [number, number, number] = variant === 'upright'
      ? [(i - (count - 1) / 2) * 0.09 + (b - 0.5) * 0.05, 0.02, 0.03 + c * 0.06]
      : [(b - 0.5) * 0.3, 0.03, (i - (count - 1) / 2) * 0.1 + (c - 0.5) * 0.04];
    // upright stems fan fore and aft (the turret-side seat turns local X fore or aft by side), splaying outward
    const dir = variant === 'upright'
      ? new THREE.Vector3((i % 2 ? 1 : -1) * (0.12 + d * 0.36), 1, 0.08 + e * 0.14).normalize()
      : new THREE.Vector3(1, 0.1 + d * 0.12, (e - 0.5) * 0.4).normalize();
    const tip = [base[0] + dir.x * len, base[1] + dir.y * len, base[2] + dir.z * len];
    // the woody stem: a tapered bent rod, thick at the cut end
    const mid = [base[0] + dir.x * len * 0.5, base[1] + dir.y * len * 0.5 - (variant === 'lying' ? 0 : 0.02), base[2] + dir.z * len * 0.5 + 0.015];
    const stem = sweptTube([base, mid, tip], 0.011, near(P) ? 5 : 4, near(P) ? 4 : 2);
    P.wood(stem, 0.5 + f * 0.15);
    for (let k = 0; k < sprays; k++) {
      const t = 0.42 + (k / Math.max(1, sprays - 1)) * 0.5;
      const at: [number, number, number] = [base[0] + dir.x * len * t, base[1] + dir.y * len * t, base[2] + dir.z * len * t];
      const swing = (k % 2 ? 1 : -1) * (0.45 + ((a * 7 + k * 3.1) % 1) * 0.4);
      const ax = new THREE.Vector3(dir.x, dir.y, dir.z).applyAxisAngle(new THREE.Vector3(0, 0, 1), variant === 'upright' ? swing * 0.6 : 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), variant === 'lying' ? swing : swing * 0.3).normalize();
      const sprayLen = 0.42 + ((b * 5 + k * 1.7) % 1) * 0.2;
      const face = variant === 'upright' ? [0.1, 0.25, 1] as const : [0, 1, 0.15] as const;
      const tint: [number, number, number] = [0.86 + ((c * 3 + k) % 1) * 0.3, 0.9 + ((d * 5 + k) % 1) * 0.28, 0.8 + ((e * 7 + k) % 1) * 0.22];
      cards.push({ stem: at, axis: [ax.x, ax.y, ax.z], face, out: variant === 'upright' ? [0, 0.3, 1] : [0, 1, 0],
        length: sprayLen, width: sprayLen * 0.9, tile: (i + k) % 4, bend: 0.1 + ((f * 3 + k) % 1) * 0.12, tint });
    }
  });
  const geometry = cards.toGeometry();
  if (geometry) P.leaves(geometry);
}
