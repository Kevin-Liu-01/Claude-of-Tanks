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
  block, fabricBody, fabricStrap, latheY, moldedBox, place, rolledEndLayers, roundBar, sweptTube,
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
  /**
   * Woven webbing (straps, ties, handles): the issue canvas through a darker, greener webbing tint, drawn in the
   * painted-hardware ('cans') family so a strap never adds a canvas draw to a frame that carries no soft goods.
   */
  strap(geometry: THREE.BufferGeometry, tone?: number): void;
  burlap(geometry: THREE.BufferGeometry, tone?: number): void;
  steel(geometry: THREE.BufferGeometry, tone?: number): void;
  /** Wood family (grained): crates, beams, logs. */
  wood(geometry: THREE.BufferGeometry, tone?: number): void;
  /** Small wooden parts (tool handles, reel flanges, cut stems): the wood's colour in the painted-hardware draw. */
  trim(geometry: THREE.BufferGeometry, tone?: number): void;
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
const webbing = (P: AccessoryPainter, geometry: THREE.BufferGeometry, tone = 0.6): void => P.strap(geometry, tone);
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
/** The fleet's one 20 L jerrycan as role-tagged parts, so the decor kit, the profile kit and the fittings share it. */
export interface JerrycanParts {
  readonly body: THREE.BufferGeometry;
  /** the stamped X on each requested broad face (near level only) */
  readonly stamps: readonly THREE.BufferGeometry[];
  /** the pressed handle spine (near), or the coarse level's one handle block */
  readonly spine: THREE.BufferGeometry;
  readonly grips: readonly THREE.BufferGeometry[];
  readonly spout: THREE.BufferGeometry | null;
}

/**
 * A pressed 20 L can, base on y = 0, broad faces on +-X, spout on the forward (+Z) shoulder: filleted body, the
 * stamped X on the requested broad faces (-1, +1), the three-grip handle comb on its spine, and the spout with its
 * bayonet cap. `nearLevel` false returns the coarse can: body and one handle block.
 */
export function jerrycanParts(scale = 1, faces: readonly number[] = [-1, 1], nearLevel = true): JerrycanParts {
  const t = 0.165 * scale, h = 0.44 * scale, w = 0.345 * scale;
  const body = place(moldedBox(t, h, w, 0.022 * scale, nearLevel ? 1 : 0, 0.012 * scale), 0, h / 2, 0);
  if (!nearLevel) {
    const spine = place(moldedBox(t * 0.5, 0.03 * scale, w * 0.62, 0, 0, 0.004), 0, h + 0.015 * scale, -w * 0.06);
    return { body, stamps: [], spine, grips: [], spout: null };
  }
  const diag = Math.atan2(h * 0.62, w * 0.62);
  const ribLen = Math.hypot(h * 0.62, w * 0.62);
  const stamps: THREE.BufferGeometry[] = [];
  for (const f of faces) {
    for (const s of [-1, 1]) {
      stamps.push(place(block(0.006, ribLen, 0.026 * scale), f * (t / 2 + 0.002), h * 0.47, 0, s * (Math.PI / 2 - diag), 0, 0));
    }
  }
  // handle comb: a pressed spine along the top and three grips across it, behind the spout, inside the top's outline
  const top = h + 0.004 * scale;
  const spine = place(block(t * 0.42, 0.024 * scale, w * 0.5), 0, top + 0.008 * scale, -w * 0.17);
  const grips = [-0.125, -0.06, 0.005].map((z) =>
    roundBar([-t * 0.36, top + 0.03 * scale, z * scale], [t * 0.36, top + 0.03 * scale, z * scale], 0.0085 * scale, 4));
  // spout and bayonet cap on the forward shoulder
  const spout = place(latheY([[0.024, 0], [0.026, 0.03], [0.03, 0.034], [0.03, 0.05], [0.001, 0.052]], 6),
    0, h - 0.02 * scale, w * 0.36, 0.42, 0, 0, scale);
  return { body, stamps, spine, grips, spout };
}

export function jerrycan(P: AccessoryPainter, x: number, rgb: RGB, scale = 1, outer: -1 | 0 | 1 = 0): void {
  const can = jerrycanParts(scale, outer === 0 ? [-1, 1] : [outer], near(P));
  P.paint(can.body.translate(x, 0, 0), rgb, 0.28);
  if (!can.spout) {
    P.paint(can.spine.translate(x, 0, 0), scaleRgb(rgb, 0.9));
    return;
  }
  for (const stamp of can.stamps) P.paint(stamp.translate(x, 0, 0), scaleRgb(rgb, 1.1), 0.2);
  P.paint(can.spine.translate(x, 0, 0), scaleRgb(rgb, 0.92), 0.3);
  for (const grip of can.grips) P.paint(grip.translate(x, 0, 0), scaleRgb(rgb, 0.95), 0.25);
  P.paint(can.spout.translate(x, 0, 0), scaleRgb(rgb, 0.85), 0.3);
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
  // the rolled layers at each end (the roll lies along X in the piece frame, as bag() turns it)
  for (const layer of rolledEndLayers(radius, len)) {
    P.cloth(place(place(layer, 0, 0, 0, 0, Math.PI / 2, 0), at[0], at[1] + lift, at[2], 0, yaw, 0), tone * 0.62, rgb);
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

// 2026-10-06 (round 2): the critics read the blue cooler, the red cooler and the red tool chest as toy-coloured
// civilian boxes. Crews carry them, but in issue colours: olive drab, coyote and dark green, lids a shade lighter.
const BLUE_COOLER: RGB = [0.22, 0.26, 0.15];
const COOLER_LID: RGB = [0.27, 0.30, 0.19];

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
      P.paint(place(moldedBox(0.38, 0.012, 0.24, 0.03, 1, 0.004), 0, 0.344, 0), [0.30, 0.33, 0.21], 0.2);
    }
    break;
  case 'cooler-red':
    hardCase(P, { w: 0.46, h: 0.3, d: 0.32, body: [0.40, 0.33, 0.21], lid: [0.46, 0.38, 0.25], lidShare: 0.26, radius: 0.035,
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
      // the net's garnish spilling from the drawstring end: two lumpy lobes in the bag's own (canvas) draw
      for (let i = 0; i < 2; i++) {
        const lobe: FabricSpec = { len: 0.13, hw: 0.06, hh: 0.035, exponent: 2, endScale: 0.5, endLength: 0.3, flatten: 0.5,
          wrinkle: 0.22, seg: 6, stations: 3, seed: 57 + i };
        P.cloth(place(fabricBody(lobe), 0.27 + i * 0.03, 0.15 + i * 0.03, (i - 0.5) * 0.08, 0.3 - i * 0.5, 0.6 + i * 1.1, 0.35), 0.48, [0.86, 1.02, 0.74]);
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
    hardCase(P, { w: 0.52, h: 0.25, d: 0.24, body: [0.16, 0.19, 0.13], lid: [0.19, 0.22, 0.15], lidShare: 0.34, radius: 0.01,
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
    for (const x of [-w / 2, w / 2]) P.trim(place(latheY([[0.0005, 0], [fr, 0], [fr, 0.034], [0.0005, 0.034]], seg), x - 0.017, fr, 0, 0, 0, -Math.PI / 2), 0.66);
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
      P.paint(place(latheY([[0.0005, 0], [0.058, 0], [0.062, 0.02], [0.062, 0.24], [0.05, 0.27], [0.0005, 0.27]], seg), x, h - 0.06, 0), [0.28, 0.31, 0.2], 0.3);
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
  const { lift } = bag(P, spec, [0, 0, 0], 0, tone);
  if (!near(P)) return;
  for (const layer of rolledEndLayers(radius, len)) P.cloth(place(layer, 0, lift, 0, 0, Math.PI / 2, 0), tone * 0.6);
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
    // round 2 (2026-10-06): a heap that sags off its supports, not a flat sticker — deep folds, the middle
    // humped where the net bunches, the edges hanging well down in scallops between the tie points
    const fold = Math.sin(x * 9 + seed) * Math.cos(z * 7 - seed) * 0.045 + Math.sin(z * 15 + x * 3 + seed * 2) * 0.016;
    const hump = Math.max(0, 1 - edge * 1.15) * 0.07 * (0.6 + 0.4 * Math.sin(x * 4.1 + z * 3.3 + seed));
    const scallop = edge > 0.7 ? 0.05 * Math.pow(Math.abs(Math.sin((u + v) * Math.PI * 3 + seed)), 1.5) : 0;
    const ragged = (edge > 0.8 ? -0.04 * ((Math.sin(i * 7.1 + k * 3.3 + seed) + 1) / 2) : 0);
    return [x * (1 + ragged * 0.6), 0.075 + fold + hump - edge * edge * 0.14 - scallop, z * (1 + ragged * 0.6)];
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
  // the flat garnish tufts read as origami cards (round 2); the rags are in the net's own texture now
  P.net(sheet, 1.0);
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
      P.trim(roundBar([lane, 0.03, -0.42 + dz], [lane, 0.03, 0.34 + dz], 0.017, seg), tone);
      // D-grip
      if (near(P)) P.trim(sweptTube([[lane - 0.05, 0.03, -0.42 + dz], [lane - 0.05, 0.03, -0.5 + dz], [lane + 0.05, 0.03, -0.5 + dz], [lane + 0.05, 0.03, -0.42 + dz]], 0.012, 4, 6), tone * 0.9);
      // dished blade: a shallow bent plate tapering to a point
      const blade = latheY([[0.0005, 0], [0.075, 0.02], [0.08, 0.17], [0.05, 0.25], [0.0005, 0.27]], near(P) ? 8 : 5);
      blade.scale(1, 1, 0.12);
      P.steel(place(blade, lane, 0.036, 0.33 + dz, Math.PI / 2, 0, 0), 0.55);
    } else if (tool === 'axe') {
      P.trim(roundBar([lane, 0.03, -0.3 + dz], [lane, 0.03, 0.32 + dz], 0.016, seg), tone);
      P.steel(place(moldedBox(0.04, 0.05, 0.17, 0.008, 1, 0.006), lane, 0.032, 0.3 + dz), 0.55);
      P.steel(place(block(0.012, 0.05, 0.11), lane + 0.03, 0.032, 0.33 + dz, 0, -0.25, 0), 0.62);
    } else if (tool === 'sledge') {
      P.trim(roundBar([lane, 0.035, -0.35 + dz], [lane, 0.035, 0.32 + dz], 0.017, seg), tone);
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
// branches lashed along turret stowage and laid along fenders — from the trees lane's spray cards on woody stems.
// ---------------------------------------------------------------------------------------------------------------

/** Branch bundle seats: 'flank' along a wall, 'deck' on a deck or fender; 'upright' / 'lying' are their old names. */
export type BranchBundleVariant = 'flank' | 'deck' | 'upright' | 'lying';

/**
 * A bundle of fresh-cut branches a crew lashed on (2026-10-06, round 2: the critics read the first build's upright
 * stems as potted saplings and skewers topped with one leaf card). Every stem now lies along its support, cut ends
 * gathered under a webbing tie, the leafy run bowed and drooping at the tip, and the leaves dense from the tie to the
 * tip so the wood shows only at the cut ends. 'flank' hangs the bundle along a wall (the turret-side seat: local X
 * along the wall, +Y up, +Z out of it); 'deck' lays it on a deck or fender (+Y up). The legacy 'upright' and 'lying'
 * names map to 'flank' and 'deck'. Draws: count x 6 values plus one for the tie, before any detail branch.
 */
export function buildBranchBundle(P: AccessoryPainter, variant: BranchBundleVariant, count: number): void {
  const flank = variant === 'flank' || variant === 'upright';
  const draws: number[][] = [];
  for (let i = 0; i < count; i++) draws.push([P.rng(), P.rng(), P.rng(), P.rng(), P.rng(), P.rng()]);
  const tieAt = 0.07 + P.rng() * 0.05;
  const cards = new FoliageCardBuffer();
  const sprays = near(P) ? 5 : 3;
  const out: readonly [number, number, number] = flank ? [0, 0.15, 1] : [0, 1, 0];
  let top = 0, zMin = Infinity, zMax = -Infinity;
  const bez = (a: readonly number[], b: readonly number[], c: readonly number[], t: number): [number, number, number] => {
    const u = 1 - t;
    return [0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * b[k] + t * t * c[k]) as [number, number, number];
  };
  draws.forEach(([a, b, c, d, e, f], i) => {
    const len = 0.55 + a * 0.3;
    const share = count > 1 ? i / (count - 1) : 0.5;
    // the cut ends gather at the tie (x ~ 0); the leafy runs fan along +X
    const base: [number, number, number] = flank
      ? [-0.06 + b * 0.04, 0.09 + share * 0.2 + (c - 0.5) * 0.03, 0.035 + d * 0.04]
      : [-0.06 + b * 0.04, 0.03 + (i % 2) * 0.035, (share - 0.5) * 0.2 + (c - 0.5) * 0.03];
    const heading = flank
      ? new THREE.Vector3(1, (d - 0.5) * 0.22 + (share - 0.5) * 0.18, (e - 0.5) * 0.12).normalize()
      : new THREE.Vector3(1, 0.04 + d * 0.05, (share - 0.5) * 0.5 + (e - 0.5) * 0.18).normalize();
    const tip: [number, number, number] = [base[0] + heading.x * len, base[1] + heading.y * len, base[2] + heading.z * len];
    tip[1] -= flank ? 0.05 + f * 0.06 : 0.02 + f * 0.02; // the leafy end droops
    if (!flank) tip[1] = Math.max(0.02, tip[1]);
    const mid: [number, number, number] = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.03, (base[2] + tip[2]) / 2 + (flank ? 0.012 : 0)];
    const butt: [number, number, number] = [base[0] - heading.x * 0.06, base[1] - heading.y * 0.06, base[2] - heading.z * 0.06];
    P.trim(sweptTube([butt, base, mid, tip], 0.0105 - share * 0.002, near(P) ? 4 : 3, near(P) ? 3 : 2), 0.48 + f * 0.14);
    top = Math.max(top, base[1], mid[1]);
    zMin = Math.min(zMin, base[2]); zMax = Math.max(zMax, base[2]);
    for (let k = 0; k < sprays; k++) {
      const t = 0.16 + (k / Math.max(1, sprays - 1)) * 0.84;
      const at = bez(base, mid, tip, t);
      const ahead = bez(base, mid, tip, Math.min(1, t + 0.08));
      const along = new THREE.Vector3(ahead[0] - at[0], ahead[1] - at[1], ahead[2] - at[2]).normalize();
      // sprays leave the stem alternately to either side and forward, wider near the tie, closing toward the tip
      const side = k % 2 ? 1 : -1;
      const open = (0.95 - t * 0.5) * (0.75 + ((a * 7 + k * 3.1) % 1) * 0.45);
      // on a wall the sprays rise above the stems and droop only a little below them (the bundle stays off the deck)
      const axis = flank
        ? along.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), side > 0 ? open : -open * 0.35).normalize()
        : along.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), side * open).normalize();
      const sprayLen = 0.27 + ((b * 5 + k * 1.7) % 1) * 0.12 + (1 - t) * 0.05;
      const face = flank ? [0.08 * side, 0.2, 1] as const : [0.12 * side, 1, 0.1] as const;
      // a cut bough's leaves are deeper than the living tree's sun side and start to wilt (round 2: never pale lime)
      const tint: [number, number, number] = [0.66 + ((c * 3 + k) % 1) * 0.3, 0.72 + ((d * 5 + k) % 1) * 0.22, 0.56 + ((e * 7 + k) % 1) * 0.18];
      cards.push({ stem: at, axis: [axis.x, axis.y, axis.z], face, out, length: sprayLen, width: sprayLen * 0.92,
        tile: (i * 3 + k) % 4, bend: 0.12 + ((f * 3 + k) % 1) * 0.14, tint });
    }
    // one card past the tip so the leafy end closes the run instead of showing the bare wood
    cards.push({ stem: tip, axis: [heading.x, heading.y - 0.15, heading.z], face: flank ? [0, 0.2, 1] : [0, 1, 0.1], out,
      length: 0.26, width: 0.24, tile: (i + 1) % 4, bend: 0.18, tint: [0.78, 0.84, 0.66] });
  });
  const geometry = cards.toGeometry();
  if (geometry) P.leaves(geometry);
  // the webbing tie over the gathered cut ends, run back to its anchor on the support
  const band = 0.034;
  if (flank) {
    const yTop = top + 0.035, zOut = zMax + 0.03;
    webbing(P, place(block(band, yTop, 0.008), tieAt, yTop / 2, zOut), 0.62);                     // the run over the stems
    webbing(P, place(block(band, 0.008, zOut), tieAt, yTop, zOut / 2), 0.62);                     // back to the wall
    webbing(P, place(block(band, 0.008, zOut), tieAt, 0.004, zOut / 2), 0.62);
    if (near(P)) P.steel(place(block(0.05, 0.02, 0.014), tieAt, yTop * 0.55, zOut + 0.006), 0.5); // the buckle
  } else {
    const yTop = top + 0.03, half = Math.max(Math.abs(zMin), Math.abs(zMax)) + 0.05;
    webbing(P, place(block(band, 0.008, half * 2), tieAt, yTop, 0), 0.62);                         // over the bundle
    for (const sz of [-1, 1]) webbing(P, place(block(band, yTop, 0.008), tieAt, yTop / 2, sz * half), 0.62);
    if (near(P)) P.steel(place(block(0.05, 0.014, 0.02), tieAt, yTop + 0.008, 0), 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Roof furniture (2026-10-05, Phase F): cupolas, hatches, sights, searchlights, exhausts and the travel lock in the
// molded grammar, inside the envelopes of the pieces they replace (decor placement reads the piece's bounds). Their
// camo-painted parts ride the resident decor group; the coarse level (`detail: 0`) is the mobile tier's form.
// ---------------------------------------------------------------------------------------------------------------

/** A lathe authored along +Y (radius, station) turned onto +Z, its foot at local z = 0. */
const latheZ = (profile: ReadonlyArray<readonly [number, number]>, seg: number): THREE.BufferGeometry =>
  place(latheY(profile, seg), 0, 0, 0, Math.PI / 2, 0, 0);

/** A short round boss on the X axis (trunnions, hinge knuckles): radius r, width w, centred at (x, y, z). */
const bossX = (r: number, w: number, x: number, y: number, z: number, seg = 8): THREE.BufferGeometry =>
  roundBar([x - w / 2, y, z], [x + w / 2, y, z], r, seg);

export function buildCupola(P: AccessoryPainter, v: string, tone: number): void {
  const seg = near(P) ? 12 : 10;
  if (v === 'ring') {
    // cast ring with a lip, seven vision blocks in armoured housings, a domed lid on its hinge
    const r = 0.30;
    P.kit(latheY([[r * 0.94, 0], [r, 0.02], [r, 0.148], [r * 0.95, 0.168], [r * 0.86, 0.172], [0.001, 0.172]], seg), tone);
    P.kit(latheY([[r * 0.84, 0.172], [r * 0.84, 0.19], [r * 0.7, 0.212], [r * 0.36, 0.224], [0.001, 0.226]], seg), tone * 1.03);
    P.steel(place(block(0.12, 0.024, 0.05), 0, 0.2, -r * 0.8), 0.55);                                   // hinge block
    if (!near(P)) return;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      P.kit(place(place(block(0.1, 0.062, 0.04), 0, 0.1, r - 0.006), 0, 0, 0, 0, a, 0), tone * 0.96);    // armoured housing
      P.lens(place(place(block(0.074, 0.034, 0.006), 0, 0.1, r + 0.015), 0, 0, 0, 0, a, 0));
      P.kit(place(place(block(0.11, 0.01, 0.034), 0, 0.137, r + 0.004), 0, 0, 0, 0, a, 0), tone * 0.9); // brow lip
    }
    P.steel(bossX(0.016, 0.05, -0.04, 0.2, -r * 0.8), 0.5);                                              // hinge knuckles
    P.steel(bossX(0.016, 0.05, 0.04, 0.2, -r * 0.8), 0.5);
    P.steel(sweptTube([[-0.05, 0.222, 0.08], [-0.05, 0.246, 0.1], [0.05, 0.246, 0.1], [0.05, 0.222, 0.08]], 0.008, 4, 6), 0.5); // grab handle
  } else if (v === 'drum') {
    // taller early drum: cast body, domed roof, five vision slits under their brows
    const r = 0.27;
    P.kit(latheY([[r, 0], [r, 0.24], [r * 0.95, 0.262], [r * 0.7, 0.29], [r * 0.4, 0.302], [0.001, 0.305]], seg), tone);
    if (!near(P)) return;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      P.steel(place(place(block(0.1, 0.03, 0.012), 0, 0.17, r + 0.002), 0, 0, 0, 0, a, 0), 0.4);       // slit
      P.kit(place(place(moldedBox(0.13, 0.02, 0.04, 0.006, 0, 0.004), 0, 0.2, r + 0.012), 0, 0, 0, 0, a, 0), tone * 0.94); // brow
    }
  } else {
    // 'split': ring and an open lid leaned on its hinge
    const r = 0.28, lidR = r * 0.55;
    P.kit(latheY([[r * 0.95, 0], [r, 0.05], [r, 0.13], [r * 0.72, 0.155], [r * 0.6, 0.16], [0.001, 0.165]], seg), tone);
    const lid = latheY([[lidR, 0], [lidR, 0.02], [lidR * 0.7, 0.034], [0.001, 0.04]], seg);
    place(lid, 0, 0, lidR);                       // hinge at the disc edge
    place(lid, 0, 0, 0, -68 * Math.PI / 180, 0, 0);
    P.kit(place(lid, 0, 0.165, -r * 0.72), tone * 1.05);
    P.steel(place(block(0.08, 0.03, 0.05), 0, 0.155, -r * 0.8), 0.55);                                  // hinge block
    if (!near(P)) return;
    P.steel(bossX(0.016, 0.06, 0, 0.17, -r * 0.8), 0.5);
    P.steel(sweptTube([[-0.04, 0.165, r * 0.3], [-0.04, 0.19, r * 0.36], [0.04, 0.19, r * 0.36], [0.04, 0.165, r * 0.3]], 0.008, 4, 6), 0.5);
  }
}

export function buildHatch(P: AccessoryPainter, v: string, tone: number): void {
  const seg = near(P) ? 16 : 10;
  if (v === 'round') {
    const r = 0.25;
    // pressed lid: raised rim, a shallow dome, the hinge knuckles and arm, a grab handle and the latch lug
    P.kit(latheY([[r, 0], [r, 0.03], [r * 0.95, 0.04], [r * 0.88, 0.044], [r * 0.86, 0.052], [r * 0.5, 0.068], [0.001, 0.075]], seg), tone);
    P.steel(place(block(0.12, 0.026, 0.05), 0, 0.02, r * 0.9), 0.6);                                    // hinge block
    if (!near(P)) return;
    P.steel(bossX(0.018, 0.05, -0.05, 0.03, r * 0.92), 0.55);
    P.steel(bossX(0.018, 0.05, 0.05, 0.03, r * 0.92), 0.55);
    P.kit(place(block(0.05, 0.012, r * 0.55), 0, 0.058, r * 0.6), tone * 0.94);                         // hinge arm
    P.steel(sweptTube([[-0.045, 0.07, -r * 0.42], [-0.045, 0.094, -r * 0.46], [0.045, 0.094, -r * 0.46], [0.045, 0.07, -r * 0.42]], 0.009, 4, 6), 0.55);
    P.kit(place(moldedBox(0.08, 0.02, 0.05, 0.006, 0, 0.004), 0, 0.03, -r * 0.88), tone);                // latch lug
  } else {
    // twin-panel rectangular hatch: two pressed leaves on their hinges, handles and a periscope stub
    const w = 0.42, d = 0.34;
    for (const s of [-1, 1]) P.kit(place(moldedBox(w / 2 - 0.006, 0.05, d, 0.012, near(P) ? 1 : 0, 0.008), s * (w / 4 + 0.003), 0.025, 0), tone);
    P.kit(place(moldedBox(0.09, 0.06, 0.09, 0.01, 0, 0.006), w * 0.28, 0.08, d * 0.1), tone * 1.05);    // periscope stub
    if (!near(P)) return;
    for (const s of [-1, 1]) P.steel(roundBar([s * w * 0.3 - 0.035, 0.03, d / 2 + 0.015], [s * w * 0.3 + 0.035, 0.03, d / 2 + 0.015], 0.02, 6), 0.6);
    for (const s of [-1, 1]) {
      P.steel(sweptTube([[s * 0.06 - 0.035, 0.05, -d * 0.28], [s * 0.06 - 0.035, 0.07, -d * 0.3], [s * 0.06 + 0.035, 0.07, -d * 0.3],
        [s * 0.06 + 0.035, 0.05, -d * 0.28]], 0.008, 4, 6), 0.62);
    }
    P.lens(place(block(0.06, 0.022, 0.004), w * 0.28, 0.088, d * 0.1 + 0.047));
  }
}

export function buildSight(P: AccessoryPainter, v: string, tone: number): void {
  if (v === 'peri') {
    // periscope head: armoured base, tilted head, glass under its cowl
    P.kit(place(moldedBox(0.14, 0.09, 0.12, 0.012, near(P) ? 1 : 0, 0.008), 0, 0.045, 0), tone);
    P.kit(place(moldedBox(0.12, 0.05, 0.1, 0.01, near(P) ? 1 : 0, 0.006), 0, 0.112, -0.012, -14 * Math.PI / 180, 0, 0), tone);
    if (!near(P)) return;
    P.lens(place(block(0.09, 0.028, 0.008), 0, 0.112, 0.05, -14 * Math.PI / 180, 0, 0));
    P.kit(place(block(0.124, 0.01, 0.034), 0, 0.142, 0.046, -14 * Math.PI / 180, 0, 0), tone * 0.92);   // cowl
  } else {
    // primary-sight doghouse: armoured hood with its sloped brow, the window, armoured doors raised, brow rail
    P.kit(place(moldedBox(0.26, 0.14, 0.3, 0.016, near(P) ? 1 : 0, 0.01), 0, 0.07, 0), tone);
    P.kit(place(moldedBox(0.26, 0.09, 0.12, 0.012, near(P) ? 1 : 0, 0.008), 0, 0.175, -0.07, -26 * Math.PI / 180, 0, 0), tone);
    if (!near(P)) return;
    P.lens(place(block(0.18, 0.05, 0.01), 0, 0.1, 0.152));
    for (const s of [-1, 1]) P.kit(place(block(0.088, 0.012, 0.07), s * 0.046, 0.145, 0.15, -1.2, 0, 0), tone * 0.95); // visor doors raised
    P.steel(roundBar([-0.14, 0.148, 0.14], [0.14, 0.148, 0.14], 0.008, 6), 0.6);                             // brow rail
    for (const x of [-0.11, 0.11]) for (const z of [-0.11, 0.06]) P.steel(place(block(0.014, 0.008, 0.014), x, 0.144, z), 0.5); // bolts
  }
}

export function buildSearchlight(P: AccessoryPainter, v: string, tone: number): void {
  const seg = near(P) ? 14 : 9;
  if (v === 'convoy') {
    P.steel(roundBar([0, 0, 0], [0, 0.1, 0], near(P) ? 0.022 : 0.02, 6), 0.55);
    P.kit(place(latheZ([[0.0005, 0], [0.04, 0.005], [0.045, 0.03], [0.045, 0.09], [0.048, 0.092]], seg), 0, 0.13, -0.037), tone);
    P.lens(place(latheZ([[0.0005, 0], [0.039, 0], [0.039, 0.006], [0.0005, 0.008]], seg), 0, 0.13, 0.054));
    if (near(P)) P.kit(place(block(0.1, 0.008, 0.05), 0, 0.177, 0.045, 0.2, 0, 0), tone * 0.92);           // hood
    return;
  }
  const R = v === 'ir_large' ? 0.19 : 0.115;   // drum radius
  const D = v === 'ir_large' ? 0.3 : 0.19;     // drum depth
  const axleY = R + 0.07;
  P.kit(place(moldedBox(0.16, 0.035, 0.16, 0.01, near(P) ? 1 : 0, 0.006), 0, 0.018, 0), tone);           // base plate
  for (const s of [-1, 1]) P.steel(roundBar([s * (R + 0.014), 0.03, 0], [s * (R + 0.014), axleY, 0], 0.012, near(P) ? 6 : 4), 0.55); // yoke
  // drum: domed rear cap, body and the front bezel, one lathe along the beam
  P.kit(place(latheZ([[R * 0.55, 0], [R * 0.86, D * 0.06], [R, D * 0.18], [R, D * 0.94], [R * 1.05, D * 0.95], [R * 1.05, D], [R * 0.95, D * 1.01]], seg),
    0, axleY, -D * 0.68), tone);
  P.lens(place(latheZ([[0.0005, 0], [R * 0.93, 0], [R * 0.93, 0.008], [0.0005, 0.014]], seg), 0, axleY, D * 0.32));  // glass
  if (!near(P)) return;
  for (const s of [-1, 1]) P.steel(bossX(0.028, 0.022, s * (R + 0.01), axleY, 0), 0.5);                  // trunnions
  if (v === 'ir_large') {
    for (const z of [-0.28, -0.14, 0]) P.kit(place(latheZ([[R + 0.001, 0], [R + 0.012, 0.004], [R + 0.012, 0.012], [R + 0.001, 0.016]], seg), 0, axleY, z * D), tone * 0.9); // fins
    P.steel(sweptTube([[0, axleY - R * 0.4, -D * 0.6], [0.04, axleY - R * 0.9, -D * 0.5], [R + 0.04, 0.06, 0.03], [R + 0.04, 0.03, 0.03]], 0.012, 5, 8), 0.5); // cable
  }
}

export function buildExhaust(P: AccessoryPainter, v: string, len: number, tone: number): void {
  const seg = near(P) ? 14 : 9;
  if (v === 'muffler') {
    // rolled muffler with dished ends, two strap bands on brackets and the tail pipe kicked out of the rear
    P.kit(place(latheZ([[0.0005, 0], [0.07, 0.006], [0.1, 0.03], [0.105, 0.06], [0.105, len - 0.06], [0.1, len - 0.03], [0.07, len - 0.006], [0.0005, len]], seg),
      0, 0.105, -len / 2), tone * 0.82);
    P.steel(sweptTube([[0.015, 0.105, -len / 2 + 0.02], [0.015, 0.11, -len / 2 - 0.05], [0.03, 0.15, -len / 2 - 0.14]], 0.04, near(P) ? 7 : 5, near(P) ? 6 : 3), 0.42); // tail
    if (!near(P)) return;
    for (const s of [-0.3, 0.3]) {
      P.steel(place(latheZ([[0.106, 0], [0.112, 0.002], [0.112, 0.028], [0.106, 0.03]], seg), 0, 0.105, s * len - 0.015), 0.4); // strap band
      P.steel(place(block(0.03, 0.06, 0.03), 0.07, 0.03, s * len), 0.42);                                    // bracket
    }
  } else {
    // pipe under a slotted heat shield on its ribs
    P.steel(place(latheZ([[0.07, 0], [0.07, len]], seg), 0, 0.09, -len / 2), 0.4);
    const shield = new THREE.CylinderGeometry(0.105, 0.105, len * 0.92, seg, 1, true, -Math.PI * 0.6, Math.PI * 1.2).toNonIndexed();
    P.kit(place(shield, 0, 0.105, 0, Math.PI / 2, 0, 0), tone);
    if (!near(P)) return;
    for (const s of [-0.35, 0, 0.35]) P.steel(place(latheZ([[0.106, 0], [0.11, 0.002], [0.11, 0.02], [0.106, 0.022]], seg), 0, 0.105, s * len - 0.011), 0.42);
    for (const s of [-0.25, 0.25]) P.steel(place(block(0.02, 0.09, 0.03), 0.1, 0.05, s * len), 0.45);
  }
}

export function buildTravelLock(P: AccessoryPainter, tone: number): void {
  // pivot base with its pin bosses, the A-frame folded aft with a cross brace, the saddle claw and its pad
  P.kit(place(moldedBox(0.14, 0.06, 0.12, 0.01, near(P) ? 1 : 0, 0.006), 0, 0.03, 0), tone);
  for (const s of [-1, 1]) P.kit(roundBar([s * 0.06, 0.075, -0.02], [s * 0.03, 0.075, -0.5], 0.022, near(P) ? 7 : 5), tone);
  const claw = new THREE.TorusGeometry(0.055, 0.015, near(P) ? 5 : 4, near(P) ? 9 : 6, Math.PI).toNonIndexed();
  P.steel(place(claw, 0, 0.06, -0.52, 0, 0, Math.PI), 0.55);
  if (!near(P)) return;
  P.kit(roundBar([-0.045, 0.075, -0.25], [0.045, 0.075, -0.25], 0.014, 6), tone * 0.95);              // cross brace
  P.steel(roundBar([-0.085, 0.05, 0.03], [0.085, 0.05, 0.03], 0.015, 6), 0.55);                         // pivot pin
  for (const s of [-1, 1]) P.steel(bossX(0.026, 0.02, s * 0.075, 0.05, 0.03), 0.5);                    // pin bosses
  P.steel(place(block(0.06, 0.012, 0.03), 0, 0.012, -0.52), 0.35);                                      // claw pad
}
