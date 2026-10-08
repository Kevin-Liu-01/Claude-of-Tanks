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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  barkLog, block, fabricBody, fabricSleeve, fabricStrap, hash01, latheY, moldedBox, place, rolledEndSpiral, roundBar, sweptTube,
  withBoxUV, type AccessoryDetail, type FabricSpec, type XY,
} from './accessoryPrimitives.ts';
import { FoliageCardBuffer, foliageCardPoints, type FoliageCard } from './vehicleFoliage.ts';

export type RGB = readonly [number, number, number];

export interface AccessoryPainter {
  readonly detail: AccessoryDetail;
  readonly rng: () => number;
  /**
   * The piece's place in its tank's rotation of soft-goods fabrics (round 5, 2026-10-08; fabricFamily), when the
   * placement assigns one; a bag outside any rotation draws its family from its own seed.
   */
  readonly fabric?: number;
  /** Authored-colour hardware (the decor 'cans' family): muted, grime-textured, per-piece tint. */
  paint(geometry: THREE.BufferGeometry, rgb: RGB, ao?: number): void;
  /** Canvas family; `rgb` tints the fabric base colour (1,1,1 = the nation's issue canvas). */
  cloth(geometry: THREE.BufferGeometry, tone?: number, rgb?: RGB): void;
  /**
   * Woven webbing (straps, ties, handles): the issue canvas through a darker, greener webbing tint, drawn in the
   * painted-hardware ('cans') family so a strap never adds a canvas draw to a frame that carries no soft goods.
   */
  strap(geometry: THREE.BufferGeometry, tone?: number): void;
  /**
   * A bag's own cinch strap (round 5): webbing like `strap`, at a station where a lashing to the deck may take its place
   * (decorations.ts lashLoad). `at` is the point on the bag's axis under the strap and `across` the strap's horizontal
   * crossing direction (unit), both in the piece frame as (x, z).
   */
  cinch(geometry: THREE.BufferGeometry, at: readonly [number, number], across: readonly [number, number], tone?: number): void;
  burlap(geometry: THREE.BufferGeometry, tone?: number): void;
  steel(geometry: THREE.BufferGeometry, tone?: number): void;
  /** Wood family (grained): crates, beams, logs; `rgb` tints the wood (bark is greyer, sawn end grain paler). */
  wood(geometry: THREE.BufferGeometry, tone?: number, rgb?: RGB): void;
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

/**
 * A molded / pressed case: filleted body, overhanging lid over a dark parting line, latches and hinges standing proud
 * on dark contact plates, and handles. 2026-10-07 (tank-accessories round 3: on the Leopard 2A4's olive case the
 * critics read flush latches and hinges as "molded on, casting no separate shadow, reading as a texture"; decor casts
 * no shadow): the over-centre latch levers stand two centimetres proud with their keepers on the lid lip, two barrel
 * hinges sit on the back at the parting line, and each piece of hardware lies on a dark plate set a little low that
 * stands in for the shadow it would cast.
 */
export function hardCase(P: AccessoryPainter, c: CaseSpec): void {
  const r = c.radius ?? 0.03;
  const lidH = c.h * (c.lidShare ?? 0.24);
  const bodyH = c.h - lidH;
  const seg = near(P) ? 2 : 1;
  P.paint(place(moldedBox(c.w, bodyH, c.d, r, seg, r * 0.55), 0, bodyH / 2, 0), c.body, 0.32);
  P.paint(place(moldedBox(c.w * 1.018, lidH, c.d * 1.024, r * 1.1, seg, r * 0.7), 0, bodyH + lidH / 2, 0), c.lid, 0.22);
  if (!near(P)) return;
  // the parting line: a dark gasket band under the lid's overhang; round 5: it follows the case's rounded corners (its
  // square corners stood 1.7 cm off them), same triangles (no bevel rows)
  P.paint(place(moldedBox(c.w * 1.008, 0.009, c.d * 1.012, r, 1, 0), 0, bodyH - 0.002, 0), BLACK_PLASTIC, 0);
  if ((c.ribs ?? 0) > 0) {
    const n = c.ribs ?? 0;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (c.w * 0.62 / Math.max(1, n - 1 || 1));
      for (const side of [-1, 1]) {
        P.paint(place(block(0.034, bodyH * 0.62, 0.014), x, bodyH * 0.5, side * (c.d / 2 + 0.006)),
          scaleRgb(c.body, 1.1), 0.3);
      }
    }
  }
  const hardware = (geometry: THREE.BufferGeometry, steel: boolean, tone = 0.6): void => {
    if (steel) P.steel(geometry, tone); else P.paint(geometry, BLACK_PLASTIC, 0.2);
  };
  if (c.latches !== 'none') {
    for (const side of [-1, 1]) {
      const x = side * c.w * 0.3, face = c.d / 2;
      P.paint(place(block(0.058, 0.074, 0.004), x, bodyH - 0.034, face + 0.002), BLACK_PLASTIC, 0);       // contact plate
      hardware(place(moldedBox(0.04, 0.062, 0.02, 0.006, 0, 0.004), x, bodyH - 0.026, face + 0.012), c.latches === 'steel');
      hardware(place(block(0.046, 0.016, 0.016), x, bodyH + lidH * 0.32, c.d * 0.512 + 0.008), c.latches === 'steel', 0.5);
    }
  }
  // two barrel hinges on the back at the parting line, a leaf on the body and one on the lid
  for (const side of [-1, 1]) {
    const x = side * c.w * 0.27, back = -c.d / 2;
    P.paint(place(block(0.084, 0.05, 0.004), x, bodyH - 0.012, back - 0.002), BLACK_PLASTIC, 0);         // contact plate
    P.steel(roundBar([x - 0.036, bodyH + 0.002, back - 0.012], [x + 0.036, bodyH + 0.002, back - 0.012], 0.011, 6), 0.55);
    P.steel(place(block(0.064, 0.024, 0.006), x, bodyH + 0.018, c.d * -0.512 - 0.004), 0.5);
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

/**
 * A welded sheet-steel chest (round 4, 2026-10-07; the critics on the Strv 103A's insulated food container: "the stowage
 * box's glossy, rounded-corner surface reads as injection-molded plastic, like a cooler, rather than welded sheet
 * steel"): flat pressed panels with tight folded edges instead of a 4.5 cm filleted moulding, a raised weld bead down
 * each vertical corner, a flanged lid whose folded skirt laps the body, pressed stiffening ribs, steel over-centre
 * clamps, barrel hinges and end grips. The case's envelope (w x h x d, lid share, the lid's 1.018 x 1.024 overhang) and
 * its draws are hardCase's, so every seat, support probe and LOD envelope is unchanged; no random draws; no more
 * triangles than the moulded case at either level.
 */
function steelChest(P: AccessoryPainter, c: CaseSpec): void {
  const lidH = c.h * (c.lidShare ?? 0.24);
  const bodyH = c.h - lidH;
  const fold = 0.006;                                   // the folded sheet edge, not a moulded fillet
  P.paint(place(moldedBox(c.w, bodyH, c.d, fold, 1, fold * 0.6), 0, bodyH / 2, 0), c.body, 0.34);
  P.paint(place(moldedBox(c.w * 1.018, lidH, c.d * 1.024, fold, 1, fold * 0.7), 0, bodyH + lidH / 2, 0), c.lid, 0.24);
  if (!near(P)) return;
  const hw = c.w / 2, hd = c.d / 2;
  // the lid's folded skirt lapping the body, over a dark gasket line
  P.paint(place(block(c.w * 1.03, 0.014, c.d * 1.036), 0, bodyH + 0.006, 0), scaleRgb(c.lid, 0.94), 0.3);
  P.paint(place(block(c.w * 1.006, 0.006, c.d * 1.01), 0, bodyH - 0.003, 0), BLACK_PLASTIC, 0);
  // a weld bead down each vertical corner (three-sided: no more triangles than the moulding it replaces)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.paint(roundBar([sx * (hw - 0.001), 0.012, sz * (hd - 0.001)], [sx * (hw - 0.001), bodyH - 0.012, sz * (hd - 0.001)], 0.0035, 3),
      scaleRgb(c.body, 0.86), 0.36);
  }
  // pressed stiffening ribs on the long faces
  const n = c.ribs ?? 0;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (c.w * 0.62 / Math.max(1, n - 1 || 1));
    for (const side of [-1, 1]) {
      P.paint(place(block(0.03, bodyH * 0.66, 0.008), x, bodyH * 0.48, side * (hd + 0.003)), scaleRgb(c.body, 1.06), 0.32);
    }
  }
  // steel over-centre clamps with their keepers on the lid skirt, standing proud of the face
  for (const side of [-1, 1]) {
    const x = side * c.w * 0.3, face = hd;
    P.paint(place(block(0.058, 0.074, 0.004), x, bodyH - 0.034, face + 0.002), BLACK_PLASTIC, 0);
    P.steel(place(moldedBox(0.04, 0.062, 0.02, 0.004, 0, 0.003), x, bodyH - 0.026, face + 0.012), 0.6);
    P.steel(place(block(0.046, 0.016, 0.016), x, bodyH + lidH * 0.32, c.d * 0.512 + 0.008), 0.5);
  }
  // barrel hinges on the back at the parting line
  for (const side of [-1, 1]) {
    const x = side * c.w * 0.27, back = -hd;
    P.paint(place(block(0.084, 0.05, 0.004), x, bodyH - 0.012, back - 0.002), BLACK_PLASTIC, 0);
    P.steel(roundBar([x - 0.036, bodyH + 0.002, back - 0.012], [x + 0.036, bodyH + 0.002, back - 0.012], 0.011, 6), 0.55);
    P.steel(place(block(0.064, 0.024, 0.006), x, bodyH + 0.018, c.d * -0.512 - 0.004), 0.5);
  }
  // steel end grips on welded lugs
  for (const side of [-1, 1]) {
    const x = side * (hw + 0.016);
    P.steel(roundBar([x, bodyH * 0.62, -c.d * 0.2], [x, bodyH * 0.62, c.d * 0.2], 0.01, 6), 0.55);
    for (const z of [-c.d * 0.2, c.d * 0.2]) {
      P.paint(place(block(0.022, 0.03, 0.024), side * (hw + 0.006), bodyH * 0.62, z), scaleRgb(c.body, 0.9), 0.3);
    }
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
  const shell = place(moldedBox(t, h, w, 0.022 * scale, nearLevel ? 1 : 0, 0.012 * scale), 0, h / 2, 0);
  if (!nearLevel) {
    const spine = place(moldedBox(t * 0.5, 0.03 * scale, w * 0.62, 0, 0, 0.004), 0, h + 0.015 * scale, -w * 0.06);
    return { body: shell, stamps: [], spine, grips: [], spout: null };
  }
  // 2026-10-07 (tank-accessories round 3: the blind critics read the cans as car batteries — a block with a few studs on
  // top): the welded seam where the two pressed halves meet stands proud round the narrow faces, the stamped X stands a
  // centimetre proud so its flanks shade, three arched handles span the top and the spout carries its cap's clamp lever.
  const seam = place(moldedBox(0.012 * scale, h + 0.008 * scale, w + 0.008 * scale, 0, 0, 0.003 * scale), 0, h / 2, 0);
  const body = mergeGeometries([shell, seam], false) ?? shell;
  if (body !== shell) shell.dispose();
  seam.dispose();
  const diag = Math.atan2(h * 0.62, w * 0.62);
  const ribLen = Math.hypot(h * 0.62, w * 0.62);
  const stamps: THREE.BufferGeometry[] = [];
  for (const f of faces) {
    for (const s of [-1, 1]) {
      stamps.push(place(block(0.016 * scale, ribLen, 0.034 * scale), f * (t / 2 + 0.002 * scale), h * 0.47, 0,
        s * (Math.PI / 2 - diag), 0, 0));
    }
  }
  // handle comb: a pressed spine along the top and three arched grips across it, behind the spout, their feet welded on
  const spine = place(block(t * 0.42, 0.022 * scale, w * 0.5), 0, h + 0.006 * scale, -w * 0.17);
  const grips = [-0.125, -0.06, 0.005].map((z) => sweptTube([
    [-t * 0.34, h - 0.003 * scale, z * scale], [-t * 0.27, h + 0.036 * scale, z * scale],
    [t * 0.27, h + 0.036 * scale, z * scale], [t * 0.34, h - 0.003 * scale, z * scale]], 0.0075 * scale, 4, 4));
  // spout and bayonet cap on the forward shoulder, the cap's clamp lever folded down its side
  const spoutBody = latheY([[0.024, 0], [0.026, 0.03], [0.03, 0.034], [0.03, 0.05], [0.001, 0.052]], 6);
  const lever = place(block(0.012, 0.042, 0.016), 0.034, 0.03, 0);
  const merged = mergeGeometries([spoutBody, lever], false);
  const spout = place(merged ?? spoutBody, 0, h - 0.02 * scale, w * 0.36, 0.42, 0, 0, scale);
  if (merged) spoutBody.dispose();
  lever.dispose();
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

/**
 * How a nation's crews rack their jerrycans (round 4 follow-up, 2026-10-07; wave 240: "the same generic cable reel and
 * jerrycan rack on several nations"): 'soviet' (Soviet, Russian, Ukrainian and Polish hulls), a welded frame round the
 * cans, closed at the top; 'nato', a sheet holder with a back plate and a hinged latch bar across the cans' handles;
 * 'israeli', end plates with a retaining bar across the cans' faces; 'chinese', a welded back frame with a flat clamp
 * bar over each can.
 */
export type CanRackStyle = 'soviet' | 'nato' | 'israeli' | 'chinese';
export function canRackStyleFor(nation = ''): CanRackStyle {
  if (/USSR|Russia|Ukraine|Poland/i.test(nation)) return 'soviet';
  if (/Israel/i.test(nation)) return 'israeli';
  if (/China/i.test(nation)) return 'chinese';
  return 'nato';
}

/** Rack steel's tone (round 4): shaded steel, never the near-black of the round-3 cradles. */
const CAN_RACK_TONE = 1.0;

/**
 * A jerrycan rack in a nation's style (canRackStyleFor) round a row of upright cans `w` wide (X) and `d` deep (Z) whose
 * tops stand at `h`, on y = 0 (round 4 follow-up). It draws nothing from the piece's stream. 56-72 triangles, so a can
 * pair stays inside the 700-triangle piece budget (decorationsEquipment).
 */
export function canRack(P: AccessoryPainter, style: CanRackStyle, w: number, d: number, h: number, cans = 2,
  canHalfX = w / 2 - 0.03, canHalfZ = d / 2 - 0.018): void {
  const st = (geo: THREE.BufferGeometry, tone = CAN_RACK_TONE): void => P.steel(geo, tone);
  // Round 5 (2026-10-08; wave 255 on the M60A1: "the jerrycan's retainer is a featureless flat black slab with no
  // thickness ... on a single small foot. Make it a welded bracket with a strap and buckle"; wave 257 on the T-72B3M:
  // "held by a bare bar frame with no strap or buckle"): a rack holds its cans with a webbing strap round their fronts at
  // two thirds of their height, cinched by a cam buckle (canStrap); the Chinese frame keeps its clamp bars instead.
  // Every style stays within the round-4 rack's triangles (a can pair's 700-triangle piece budget).
  if (style !== 'chinese') canStrap(P, canHalfX, canHalfZ, d, h);
  // the welded Soviet frame stands on the deck itself; the others carry the cans on a floor tray
  if (style !== 'soviet') st(place(block(w, 0.02, d), 0, 0.01, 0));
  if (style === 'soviet') {
    // welded angle frame: four corner posts, closed at the top by a rail along the back (the strap holds the front)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      st(place(block(0.022, h * 0.72, 0.022), sx * (w / 2 - 0.011), 0.02 + h * 0.36, sz * (d / 2 - 0.011)));
    }
    st(place(block(w, 0.022, 0.022), 0, 0.02 + h * 0.72, -(d / 2 - 0.011)));
    return;
  }
  if (style === 'nato') {
    // round 5: an open welded cradle in place of the sheet holder's back plate (which hid half the cans and read as "a
    // flat black slab"): an angle upright at each back corner on the floor tray, joined by a top rail, the strap round
    // the cans' fronts
    const a = 0.024;
    for (const sx of [-1, 1]) st(place(block(a, h * 0.92, a), sx * (w / 2 + a / 2), 0.02 + h * 0.46, -d / 2 + a / 2));
    st(place(block(w + 2 * a, a, a), 0, 0.02 + h * 0.92 - a / 2, -d / 2 + a / 2));
    return;
  }
  if (style === 'israeli') {
    // end plates and a retaining bar across the cans' faces at two thirds of their height
    for (const sx of [-1, 1]) st(place(block(0.012, h * 0.75, d), sx * (w / 2 + 0.006), 0.02 + h * 0.375, 0));
    st(roundBar([-w / 2 - 0.012, h * 0.66, d / 2 + 0.012], [w / 2 + 0.012, h * 0.66, d / 2 + 0.012], 0.011, near(P) ? 6 : 4), 0.9);
    return;
  }
  // 'chinese': a welded back frame (two uprights and a top rail) and a flat clamp bar over each can's top, hooked on
  // the rail
  for (const sx of [-1, 1]) st(place(block(0.022, h + 0.02, 0.022), sx * (w / 2 - 0.011), 0.02 + (h + 0.02) / 2, -d / 2 + 0.011));
  st(place(block(w, 0.022, 0.022), 0, h + 0.03, -d / 2 + 0.011));
  const pitch = w / cans;
  for (let i = 0; i < cans; i++) {
    const x = -w / 2 + pitch * (i + 0.5);
    st(place(block(0.03, 0.01, d * 0.7), x, h + 0.045, -d * 0.15));
  }
}

/** Coyote webbing for a can rack's strap (round 5), on the painted-hardware draw. */
const CAN_STRAP: RGB = [0.5, 0.41, 0.27];

/**
 * A can rack's strap (round 5): webbing round the row's front at two thirds of the cans' height, from the frame behind
 * one end can, along its outer broad face, across the cans' fronts and back along the far end can, a few millimetres
 * off them; a cam buckle on the front, at the near level. Its outward face, two triangles a span.
 */
function canStrap(P: AccessoryPainter, canHalfX: number, canHalfZ: number, d: number, h: number): void {
  const y = h * 0.64, band = 0.034, off = 0.004;
  const x = canHalfX + off, zb = -d / 2 + 0.03, zf = canHalfZ + off, w = x * 2;
  const path: Array<[number, number]> = [[-x, zb], [-x, zf], [x, zf], [x, zb]];
  const positions: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const a0 = [ax, y - band / 2, az], a1 = [ax, y + band / 2, az], b0 = [bx, y - band / 2, bz], b1 = [bx, y + band / 2, bz];
    // the outward face only (the cans close the strap's inside from every view)
    positions.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
  }
  const strap = new THREE.BufferGeometry();
  strap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  strap.computeVertexNormals();
  P.paint(withBoxUV(strap), CAN_STRAP, 0.25);
  if (near(P)) P.steel(place(block(0.05, 0.04, 0.012), -w * 0.22, y, zf + 0.006), 0.55);
}

function canPair(P: AccessoryPainter, a: RGB, b: RGB, scale: number, cradle: boolean, style: CanRackStyle = 'nato'): void {
  // two cans in their nation's rack (round 4 follow-up: canRack; the round-3 cradle was one welded box for every nation)
  const gap = 0.215 * scale;
  jerrycan(P, -gap / 2, a, scale, -1);
  jerrycan(P, gap / 2, b, scale, 1);
  if (!cradle) return;
  canRack(P, style, 0.43 * scale, 0.37 * scale, 0.44 * scale, 2, 0.19 * scale, 0.1725 * scale);
}

// ---------------------------------------------------------------------------------------------------------------
// Sewn bags
// ---------------------------------------------------------------------------------------------------------------

/**
 * A fabric body along local X (bags lie across the piece frame), seated on y = 0 at its measured lowest point, with
 * webbing straps at its cinches. Returns the seat lift and the body's top height (both in the piece frame). `roll`
 * turns the bag about its own long axis first (round 4: a bag's seam and straps need not face straight up).
 */
function bag(P: AccessoryPainter, spec: FabricSpec, at: readonly [number, number, number], yaw = 0, tone = 0.75,
  rgb?: RGB, strapTone = 0.55, roll = 0): { lift: number; top: number } {
  const s: FabricSpec = { ...spec, detail: P.detail };
  const body = place(fabricBody(s), 0, 0, 0, 0, Math.PI / 2, roll);
  body.computeBoundingBox();
  // copy: applyMatrix4 below recomputes the geometry's own box in place
  const box = body.boundingBox!.clone();
  const lift = -box.min.y;
  P.cloth(place(body, at[0], at[1] + lift, at[2], 0, yaw, 0), tone, rgb);
  // round 5: each strap is a cinch station a deck lashing may replace; the body's axis runs along the yawed +X
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const z of s.cinch ?? []) {
    const strap = place(place(fabricStrap(s, z), 0, 0, 0, 0, Math.PI / 2, roll), at[0], at[1] + lift, at[2], 0, yaw, 0);
    P.cinch(strap, [at[0] + z * c, at[2] - z * sn], [sn, c], strapTone);
  }
  return { lift, top: at[1] + lift + box.max.y };
}

// Round 4 (2026-10-07, waves 216-217: "straps ... neither wrap nor compress their loads"): a bag's own straps cinch it
// visibly, a sixth to a fifth of its section at the band (duffels, packs, the folded tarp pack and the helmet bag).

/**
 * Soft-goods fabric families (round 5, 2026-10-08; the critics on the Type 99A: "the dark olive load on dark olive pixel
 * camo merges at hero distance. Vary the load's value and hue (canvas tan, faded olive, black rubber) so the silhouette
 * of the kit reads"; wave 262: "plain-sand and olive loads sit on same-value paint"). Multipliers on the nation's issue
 * canvas (x its weave), ordered so neighbours in a tank's rotation alternate light and dark: canvas tan, the issue
 * canvas, sun-faded olive, black rubberised (a poncho or waterproof sack), coyote, dark green. On the American canvas at
 * a bag's usual tone they come out near sRGB (124, 109, 72), (66, 60, 42), (96, 91, 58), (38, 37, 36), (113, 94, 56)
 * and (53, 52, 31); every nation's own canvas shifts them (Soviet tan reads green-khaki). Matte, desaturated.
 * Round 4's five tints spanned a sixth of this range, so every bag read as one olive.
 */
export const FABRIC_FAMILIES: readonly RGB[] = Object.freeze([
  [3.6, 3.3, 2.9], [1, 1, 1], [2.1, 2.25, 1.85], [0.33, 0.39, 0.78], [3.0, 2.45, 1.8], [0.66, 0.76, 0.62],
] as RGB[]);

/**
 * A bag's fabric family: the placement's rotation (P.fabric) stepped by `offset` for the second bag of a pair or the
 * n-th of a cluster, or, outside any rotation, its own seed's pick.
 */
export function fabricFamily(P: AccessoryPainter, offset: number, seed: number): RGB {
  const n = FABRIC_FAMILIES.length;
  const k = P.fabric !== undefined ? P.fabric + offset : Math.floor(hash01(seed, 0xfab) * n);
  return FABRIC_FAMILIES[((k % n) + n) % n];
}

/** A bag's own seeded values in [0, 1) (no draw from the piece's stream, so placement streams never move). */
const bagNoise = (seed: number, salt: number) => (k: number): number => hash01(seed, salt, k);

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

/**
 * A duffel along local X. 2026-10-07 (tank-accessories round 4, wave 214 on the Challenger 1: "the duffel bags ... all
 * share the exact same size and fold pattern, reading as one asset repeated four times"): every bag is its own, from
 * its seed — length and girth, fill (round to boxy), how far it slumps, its fabric family and shade, two or three
 * straps at their own stations and tension, the handle's station and a roll about its long axis. No draw comes from
 * the piece's stream, so seats and later pieces never move.
 */
export function duffel(P: AccessoryPainter, len: number, radius: number, at: readonly [number, number, number], yaw: number,
  tone: number, seed: number, rgb?: RGB): void {
  const h = bagNoise(seed, 0xd0f);
  const L = len * (0.86 + 0.26 * h(0)), R = radius * (0.88 + 0.22 * h(1));
  const shift = (h(2) - 0.5) * 0.1 * L;
  const cinch = h(3) < 0.34
    ? [-L * 0.32 + shift, shift * 0.5, L * 0.31 + shift]
    : [-L * (0.22 + 0.1 * h(4)) + shift, L * (0.2 + 0.1 * h(5)) + shift];
  const spec: FabricSpec = { len: L, hw: R * (0.98 + 0.16 * h(6)), hh: R * (0.9 + 0.12 * h(7)), exponent: 2.2 + 1.3 * h(8),
    endScale: 0.5 + 0.22 * h(9), endLength: 0.1 + 0.06 * h(10), flatten: 0.24 + 0.18 * h(11), wrinkle: 0.04 + 0.04 * h(12),
    seg: 10, stations: 6, cinch, cinchDepth: 0.13 + 0.08 * h(13), seed };
  const tint = rgb ?? fabricFamily(P, 0, seed);
  const { top } = bag(P, spec, at, yaw, tone * (0.86 + 0.26 * h(15)), tint, 0.48 + 0.14 * h(16), (h(17) - 0.5) * 0.4);
  // the carry handle lies on the full section between its first two straps, a flat loop sewn on (near level only, so
  // it stays low: the coarse level's envelope keeps four fifths of the near's height)
  const c = Math.cos(yaw), s = Math.sin(yaw), hx = (cinch[0] + cinch[1]) / 2;
  webbingLoop(P, at[0] + hx * c, top - 0.012, at[2] - hx * s, Math.min(L * (0.24 + 0.08 * h(19)), (cinch[1] - cinch[0]) * 0.66),
    0.02, yaw);
}

/**
 * Radial segments of a roll at the near level: 2026-10-07 (tank-accessories round 3: "rolls with eight visible facets")
 * — the near rolls draw 14 to 16 sides with spiral ends; the coarse level keeps its old ten (six after the coarse cut).
 */
const ROLL_SEG_COARSE = 10;

/** The rolled faces at both ends of a fabric roll lying along X in the piece frame (as bag() turns it). */
function rollEnds(P: AccessoryPainter, len: number, radius: number, at: readonly [number, number, number], lift: number,
  yaw: number, tone: number, rgb: RGB | undefined, steps: number, turn = 0): void {
  for (const end of [-1, 1] as const) {
    const spiral = place(rolledEndSpiral(radius, end * len / 2, end, steps), 0, 0, 0, 0, Math.PI / 2, turn);
    P.cloth(place(spiral, at[0], at[1] + lift, at[2], 0, yaw, 0), tone, rgb);
  }
}

/**
 * The strap pinch of a firm roll (2026-10-07, tank-accessories round 4, wave 214 on the Challenger 1: "the rolled tarp
 * ... a single uniform tan cylinder with no strap-compression bulges"): each strap squeezes the roll to about three
 * quarters of its radius over a hand's width and the cloth swells between the straps, on shoulder stations
 * (FabricSpec.shoulders) that replace the even spread, so the near level costs what it did.
 */
const ROLL_PINCH = { cinchWidth: 0.028, shoulders: true } as const;

/** A roll's girth between its straps for a nominal radius (the pinch's swell included): seats and spacings. */
const pinchedRadius = (radius: number, bulge: number): number => radius * (1 + bulge);

export function bedroll(P: AccessoryPainter, len: number, radius: number, at: readonly [number, number, number], yaw: number,
  tone: number, seed: number, rgb?: RGB, seg = 12): void {
  // round 4: its own length, girth, strap stations and tension, slump and wound ends from its seed (see duffel)
  const h = bagNoise(seed, 0xbed);
  const L = len * (0.92 + 0.14 * h(0)), R = radius * (0.93 + 0.12 * h(1));
  const spec: FabricSpec = { len: L, hw: R, hh: R, exponent: 2.05, endScale: 0.9, endLength: 0.05,
    flatten: 0.1 + 0.08 * h(2), wrinkle: 0.035, seg: near(P) ? seg : ROLL_SEG_COARSE, stations: 2,
    cinch: [-L * (0.26 + 0.07 * h(3)), L * (0.26 + 0.07 * h(4))], cinchDepth: 0.2 + 0.08 * h(5), bulge: 0.04 + 0.03 * h(6),
    ...ROLL_PINCH, seed };
  const shade = rgb ? 1 : 0.9 + 0.2 * h(7);
  const fabric = rgb ?? fabricFamily(P, 0, seed);
  const { lift } = bag(P, spec, at, yaw, tone * shade, fabric, 0.5);
  if (!near(P)) return;
  // the rolled layers wound at each end
  rollEnds(P, L, R * 0.9, at, lift, yaw, tone * shade * 0.62, fabric, 14, h(8) * Math.PI * 2);
}

/** A frame or ALICE-pattern rucksack lying on its back panel: main bag, lid flap, side pockets and compression straps. */
export function rucksack(P: AccessoryPainter, w0: number, len0: number, h0: number, at: readonly [number, number, number], yaw: number,
  tone0: number, seed: number, rgb0?: RGB): void {
  // round 4: each pack its own size, fill, strap stations, fabric family and shade from its seed (see duffel)
  const n = bagNoise(seed, 0x5ac);
  const w = w0 * (0.9 + 0.18 * n(0)), len = len0 * (0.9 + 0.18 * n(1)), h = h0 * (0.86 + 0.24 * n(2));
  const tone = tone0 * (0.88 + 0.22 * n(3));
  const rgb = rgb0 ?? fabricFamily(P, 0, seed);
  const main: FabricSpec = { len, hw: w / 2, hh: h / 2, exponent: 3.4 + 1.2 * n(5), endScale: 0.76, endLength: 0.13,
    flatten: 0.36 + 0.12 * n(6), wrinkle: 0.035 + 0.025 * n(7), seg: 10, stations: 5,
    cinch: [-len * (0.12 + 0.08 * n(8)), len * (0.16 + 0.08 * n(9))], cinchDepth: 0.1 + 0.05 * n(10), seed };
  const { top } = bag(P, main, at, yaw, tone, rgb, 0.5);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx: number, ly: number, lz: number): [number, number, number] =>
    [at[0] + lz * s + lx * c, at[1] + ly, at[2] + lz * c - lx * s];
  // the lid flap folded over the top end
  const flap: FabricSpec = { len: w * 0.94, hw: len * 0.17, hh: h * 0.15, exponent: 4, endScale: 0.84, endLength: 0.08,
    flatten: 0.6, wrinkle: 0.03, seg: 8, stations: 4, seed: seed + 3 };
  const fl = local(len * 0.36, top - h * 0.12, 0);
  P.cloth(place(fabricBody({ ...flap, detail: P.detail }), fl[0], fl[1], fl[2], 0, yaw, 0), tone * 0.92, rgb);
  // two flat side pockets sewn flush to the flanks under their own compression straps (part of the silhouette at both
  // levels). 2026-10-07 (round 3: the six-sided pockets standing off the flanks read as spheres clustered on the bag).
  for (const side of [-1, 1]) {
    const pocket: FabricSpec = { len: len * 0.4, hw: w * 0.085, hh: h * 0.27, exponent: 4.5, endScale: 0.86,
      endLength: 0.14, flatten: 0.3, wrinkle: 0.025, seg: 8, stations: 4, cinch: near(P) ? [0] : [], cinchDepth: 0.06,
      seed: seed + 7 + side, detail: P.detail };
    const p = local(-len * 0.02, h * 0.3, side * (w / 2 + w * 0.03));
    P.cloth(place(fabricBody(pocket), p[0], p[1], p[2], 0, Math.PI / 2 + yaw, 0), tone * 0.86, rgb);
    if (near(P)) webbing(P, place(fabricStrap(pocket, 0), p[0], p[1], p[2], 0, Math.PI / 2 + yaw, 0), 0.5);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cargo variants (the fleet-wide loose-equipment vocabulary, decorations.ts FLEET_EQUIPMENT_VARIANTS)
// ---------------------------------------------------------------------------------------------------------------

// 2026-10-06 (round 2): the critics read the blue cooler, the red cooler and the red tool chest as toy-coloured
// civilian boxes. Crews carry them, but in issue colours: olive drab, coyote and dark green, lids a shade lighter.
// Round 5 (2026-10-08; wave 257, the coordinator: "military kit only, in service colours"): the two coolers are military
// insulated containers: the olive one keeps its moulding but loses the civilian cues (drain plug, raised lid panel,
// rubber latches), and the red-brown one is a sand container (the critics read it as "a red toolbox").
const BLUE_COOLER: RGB = [0.22, 0.26, 0.15];
const COOLER_LID: RGB = [0.27, 0.30, 0.19];
const SAND_CASE: RGB = [0.44, 0.39, 0.27];
const SAND_LID: RGB = [0.48, 0.43, 0.3];
/** The extinguisher bottle in olive drab (round 3); the palette's `extinguisher` red is only its band. */
const EXTINGUISHER_BODY: RGB = [0.29, 0.33, 0.2];
/**
 * A combat helmet in its cloth cover (round 5, 2026-10-08; wave 254 on the Oplot-M: "the helmet at the top ... is a
 * smooth, flat-coloured dome balanced on the bag with no strap, liner, dents or paint wear, so it looks like a green
 * ball"; "a smooth untextured green dome with no brim, cover or chinstrap"): a modern shell whose skirt flares to a
 * rolled brim, cut high over the brow and low over the ears and nape, in a fabric cover (the canvas draw, in the given
 * fabric family) creased over the crown and dented where it was knocked about, an elastic band round the crown, and the
 * chinstrap hanging from both ears down over whatever it lies on. `at` is where the rim's centre sits and `rot` the
 * Euler turn, in the piece frame. Deterministic in `seed`, no random draws.
 */
function combatHelmet(P: AccessoryPainter, at: readonly [number, number, number], rot: readonly [number, number, number],
  cover: RGB, seed: number): void {
  const seg = near(P) ? 12 : 8;
  const n = bagNoise(seed, 0x4e1);
  const profile: XY[] = near(P)
    ? [[0.158, -0.004], [0.164, 0.004], [0.157, 0.013], [0.149, 0.04], [0.137, 0.075], [0.112, 0.108], [0.074, 0.132], [0.0005, 0.146]]
    : [[0.162, 0], [0.149, 0.04], [0.124, 0.095], [0.074, 0.132], [0.0005, 0.146]];
  const shell = latheY(profile, seg);
  const p = shell.getAttribute('position');
  // dimples where it was knocked, at seeded bearings on the crown and side
  const dents = [0, 1].map((k) => ({ a: n(k) * Math.PI * 2, y: 0.07 + 0.05 * n(k + 2), depth: 0.006 + 0.004 * n(k + 4) }));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);                               // 0 at the brow (+z), PI at the nape
    // the skirt: high over the brow, low over the ears and the nape
    if (y < 0.05) {
      const drop = (0.032 * Math.max(0, -Math.cos(a)) ** 1.3 + 0.02 * Math.abs(Math.sin(a))) * (1 - Math.max(0, y) / 0.05);
      y -= drop;
    }
    // the cover's creases and the dents (radial, off the axis)
    const rr = Math.hypot(x, z);
    if (rr > 0.002) {
      let k = 1 + 0.018 * Math.sin(a * 4 + n(6) * 6) * Math.sin(y * 70 + n(7) * 6);
      for (const d of dents) {
        const da = Math.atan2(Math.sin(a - d.a), Math.cos(a - d.a));
        k -= (d.depth / 0.15) * Math.exp(-((da / 0.35) ** 2) - (((y - d.y) / 0.025) ** 2));
      }
      x *= k; z *= k;
    }
    p.setXYZ(i, x, y, z);
  }
  shell.computeVertexNormals();
  const put = (g: THREE.BufferGeometry): THREE.BufferGeometry => place(g, at[0], at[1], at[2], rot[0], rot[1], rot[2]);
  P.cloth(put(shell), 0.62, cover);
  if (!near(P)) return;
  // the cover's elastic band round the crown, its edges sunk into the cloth
  const bandY = 0.07, rb = 0.139;
  webbing(P, put(latheY([[rb - 0.003, bandY - 0.009], [rb + 0.004, bandY], [rb - 0.003, bandY + 0.009]], seg)), 0.42);
  // the chinstrap hanging from both ears, down over the bag below
  for (const sx of [-1, 1]) {
    webbing(P, put(sweptTube([[sx * 0.145, -0.012, 0.0], [sx * 0.168, -0.05, 0.02], [sx * 0.17, -0.1, 0.035],
      [sx * 0.15, -0.14, 0.03]], 0.006, 3, 4)), 0.5);
  }
}

export function buildCargoVariant(variant: string, P: AccessoryPainter, colours: EquipmentColours, flat?: boolean,
  rackStyle: CanRackStyle = 'nato'): void {
  // Every random draw happens here, before any detail branch (both LOD levels agree).
  const r = [P.rng(), P.rng(), P.rng(), P.rng()];
  switch (variant) {
  case 'beer-cooler-blue':
    // round 5: an olive insulated container with steel latches and pressed ribs (no drain plug, no raised lid panel)
    hardCase(P, { w: 0.54, h: 0.34, d: 0.36, body: BLUE_COOLER, lid: COOLER_LID, lidShare: 0.24, radius: 0.04,
      latches: 'steel', handles: 'ends', ribs: 2 });
    break;
  case 'cooler-red':
    // round 5: a sand container with steel latches (it read as "a red toolbox")
    hardCase(P, { w: 0.46, h: 0.3, d: 0.32, body: SAND_CASE, lid: SAND_LID, lidShare: 0.26, radius: 0.035,
      latches: 'steel', handles: 'top' });
    break;
  case 'insulated-chest-olive':
    // Mermite-style insulated food container: a welded sheet-steel chest with clamp latches and end grips (round 4,
    // 2026-10-07: the filleted moulding read as an injection-moulded cooler; steelChest keeps its envelope)
    steelChest(P, { w: 0.5, h: 0.42, d: 0.34, body: [0.30, 0.36, 0.19], lid: [0.34, 0.40, 0.21], lidShare: 0.18, ribs: 2 });
    break;
  // round 4 (2026-10-07): the bags draw their own shape from a seed taken off this piece's existing draws, so two
  // tanks' duffels differ while the piece's stream is consumed exactly as before
  case 'long-duffel':
    duffel(P, 0.78, 0.15, [0, 0, 0], (r[0] - 0.5) * 0.1, 0.66 + r[1] * 0.06, 11 + Math.floor(r[2] * 9973));
    break;
  case 'large-rucksack':
    rucksack(P, 0.38, 0.56, 0.24, [0, 0, 0], (r[0] - 0.5) * 0.18, 0.62 + r[1] * 0.05, 23 + Math.floor(r[2] * 9973));
    break;
  case 'bedroll-pair': {
    // 2026-10-07 (round 3, Strv 103A: "the two rolled bags overlap each other with no shadow or gap"): a hand's gap
    // between the rolls, so the deck shows between them (round 4: measured off each roll's pinched girth)
    // round 5: the two rolls in neighbouring fabric families (a tan roll beside an olive one), lashed as one load
    const ra = 0.082, rb = 0.085, gap = 0.04;
    const sa = 31 + Math.floor(r[2] * 9973), sb = 37 + Math.floor(r[3] * 9973);
    bedroll(P, 0.6, ra, [0, 0, -(pinchedRadius(ra, 0.08) + gap / 2)], (r[0] - 0.5) * 0.06, 0.66, sa, fabricFamily(P, 0, sa));
    bedroll(P, 0.58, rb, [0.01, 0, pinchedRadius(rb, 0.08) + gap / 2], (r[1] - 0.5) * 0.06, 0.8, sb, fabricFamily(P, 1, sb));
    break;
  }
  case 'folded-tarp-pack': {
    const spec: FabricSpec = { len: 0.5, hw: 0.17, hh: 0.075, exponent: 6, endScale: 0.86, endLength: 0.07,
      flatten: 0.55, wrinkle: 0.03, seg: 12, stations: 5, cinch: [-0.14, 0.14], cinchDepth: 0.13, seed: 41 };
    bag(P, spec, [0, 0, 0], (r[0] - 0.5) * 0.08, 0.7, fabricFamily(P, 0, 41 + Math.floor(r[1] * 997)));
    break;
  }
  case 'camo-net-bag': {
    // Round 5 (2026-10-08; wave 269 on the M1A2 SEPv3: "two smooth green blobs that look like balloons rather than
    // strapped bags"): a stuffed net sack is lumpy, squared off by its load and pinched by two straps: a boxier section,
    // blunt ends, twice the folds over nine stations, slumped onto its seat and cinched hard at two stations
    const spec: FabricSpec = { len: 0.52, hw: 0.17, hh: 0.14, exponent: 2.9, endScale: 0.5, endLength: 0.16,
      flatten: 0.42, wrinkle: 0.17, seg: 12, stations: 9, cinch: [-0.13, 0.15], cinchDepth: 0.24, seed: 53 };
    // round 5: a net's sack stays in the greens (a tan or coyote turn of the rotation takes the faded olive)
    const family = fabricFamily(P, 0, 53 + Math.floor(r[1] * 997));
    bag(P, spec, [0, 0, 0], (r[0] - 0.5) * 0.3, 0.52, family[0] > 2.2 ? FABRIC_FAMILIES[2] : family);
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
    canPair(P, colours.fuelA, colours.fuelB, 0.94, true, rackStyle);
    break;
  case 'blue-water-can':
    canPair(P, colours.waterA, colours.waterB, 0.94, true, rackStyle);
    break;
  case 'twin-can-cradle':
    canPair(P, colours.fuelA, colours.fuelB, 0.92, true, rackStyle);
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
      // the label sits clear of the centre line, where the load's tie-down crosses the face (round 3: the strap cut it
      // into a clipped decal)
      P.paint(place(moldedBox(0.14, 0.08, 0.004, 0, 0, 0.001), -w * 0.26, h * 0.55, d / 2 + 0.002), [0.78, 0.72, 0.56], 0.15);
    }
    break;
  }
  case 'medical-case':
    hardCase(P, { w: 0.42, h: 0.24, d: 0.28, body: [0.30, 0.38, 0.2], lid: [0.34, 0.43, 0.22], lidShare: 0.3, radius: 0.025,
      latches: 'steel', handles: 'top' });
    if (near(P)) {
      // the white cross off the centre line, where the load's tie-down strap crosses the face, and in world-scale UVs
      // (2026-10-07, round 3, Challenger 1: the strap cut the centred cross into a clipped decal over a hard UV seam)
      for (const [cw, ch] of [[0.024, 0.07], [0.07, 0.024]]) {
        P.paint(place(block(cw, ch, 0.004), -0.057, 0.075, 0.143), [0.86, 0.84, 0.78], 0.12);      // front, under the lid
        P.paint(place(block(cw * 1.3, 0.004, ch * 1.3), -0.14, 0.242, 0), [0.86, 0.84, 0.78], 0.12); // lid top
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
    // 2026-10-07 (round 3: the red bottle read as a toy-red box on the deck): an olive-drab bottle with a narrow band under
    // the valve; round 5 (2026-10-08, wave 257: "a red cylinder"; the coordinator: service colours only): the band is a
    // dark field grey (the palette's `extinguisher`), no red
    P.paint(lay(shell), EXTINGUISHER_BODY, 0.3);
    if (near(P)) {
      P.paint(lay(latheY([[rad + 0.002, len - 0.115], [rad + 0.002, len - 0.08]], seg)), colours.extinguisher, 0.3);
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
    // 2026-10-07 (round 3: three helmet domes in a row read as "bags made of clustered spheres"): the crew's helmets ride
    // in a sewn kit bag cinched by two straps, one helmet clipped on top of it by its chin strap
    const spec: FabricSpec = { len: 0.5, hw: 0.16, hh: 0.12, exponent: 2.7, endScale: 0.55, endLength: 0.2, flatten: 0.34,
      wrinkle: 0.07, seg: near(P) ? 12 : 10, stations: 6, cinch: [-0.15, 0.15], cinchDepth: 0.15, seed: 75 };
    const seed = 75 + Math.floor(r[1] * 997);
    const { top } = bag(P, spec, [0, 0, 0], (r[2] - 0.5) * 0.2, 0.6, fabricFamily(P, 0, seed));
    combatHelmet(P, [0.03, top - 0.035, 0.01], [0.12, r[2] * 0.6, -0.16], fabricFamily(P, 1, seed + 1), seed);
    break;
  }
  case 'crew-backpack':
    rucksack(P, 0.32, 0.42, 0.2, [0, 0, 0], (r[0] - 0.5) * 0.2, 0.6, 61 + Math.floor(r[1] * 9973));
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
    // round 5 (2026-10-08; the contact receipt: the flasks stood through the closed crate's lid): an open-topped carrier
    // of nailed boards, its two insulated flasks standing on its floor and rising a third of their height above it
    const w = 0.5, h = 0.22, d = 0.34, t = 0.018, floor = 0.02;
    P.wood(place(block(w - 2 * t, floor, d - 2 * t), 0, floor / 2, 0), 0.62);                          // floor
    for (const sz of [-1, 1]) P.wood(place(block(w, h, t), 0, h / 2, sz * (d / 2 - t / 2)), 0.74);      // front and back
    for (const sx of [-1, 1]) P.wood(place(block(t, h, d - 2 * t), sx * (w / 2 - t / 2), h / 2, 0), 0.7); // ends
    const seg = near(P) ? 8 : 6;
    for (const x of [-0.12, 0.12]) {
      P.paint(place(latheY([[0.0005, 0], [0.058, 0], [0.062, 0.02], [0.062, 0.24], [0.05, 0.27], [0.0005, 0.27]], seg), x, floor, 0), [0.28, 0.31, 0.2], 0.3);
      P.paint(place(latheY([[0.0005, 0], [0.052, 0], [0.052, 0.05], [0.0005, 0.052]], seg), x, floor + 0.268, 0), [0.18, 0.2, 0.17], 0.3);
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
    // round 4 (2026-10-07): each bag's seed carries its own tone draw, so a pack of four is four different bags
    const own = Math.floor(toneR * 7919);
    // round 5: each bag of a cluster a step along its tank's fabric rotation (a tan pack beside an olive one)
    const fabric = (seed: number): RGB => fabricFamily(P, i, seed);
    if (kind < 0.4) {
      pieces.push(() => rucksack(P, 0.3, 0.38, 0.2, [at + 0.15, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.4, tone, 100 + i + own, fabric(100 + i + own)));
      x += 0.34;
    } else if (kind < 0.75) {
      pieces.push(() => bedroll(P, 0.5, 0.08, [at + 0.09, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.3, tone, 200 + i + own, fabric(200 + i + own)));
      x += 0.19;
    } else {
      pieces.push(() => duffel(P, 0.46, 0.11, [at + 0.12, 0, 0], Math.PI / 2 + (yawR - 0.5) * 0.4, tone, 300 + i + own, fabric(300 + i + own)));
      x += 0.26;
    }
  }
  for (const piece of pieces) piece();
  return x;
}

/**
 * A rolled tarp along local X, seated on y = 0: firm roll pinched under two straps (round 4: ROLL_PINCH), the rolled
 * ends visible. Its seed sets the straps' stations and tension and the swell between them.
 */
export function buildTarpRoll(P: AccessoryPainter, len: number, radius: number, tone: number, seed = 71): void {
  const h = bagNoise(seed, 0x7a2);
  const spec: FabricSpec = { len, hw: radius, hh: radius * 0.94, exponent: 2.1, endScale: 0.92, endLength: 0.04,
    flatten: 0.16, wrinkle: 0.03, seg: near(P) ? 14 : ROLL_SEG_COARSE, stations: 2,
    cinch: [-len * (0.27 + 0.06 * h(0)), len * (0.27 + 0.06 * h(1))], cinchDepth: 0.22 + 0.06 * h(2), bulge: 0.05 + 0.03 * h(3),
    ...ROLL_PINCH, seed };
  // round 5: a tarp in its tank's fabric rotation (tan canvas, a black rubberised groundsheet, the issue olive)
  const fabric = fabricFamily(P, 0, seed);
  const { lift } = bag(P, spec, [0, 0, 0], 0, tone, fabric);
  if (!near(P)) return;
  rollEnds(P, len, radius * 0.92, [0, 0, 0], lift, 0, tone * 0.6, fabric, 16, h(4) * Math.PI * 2);
}

/**
 * Rolled camouflage net. 2026-10-07 (tank-accessories round 4; wave 213: decor nets "sit proud of the hull with
 * dead-straight hems"; wave 215 on the M60A1: "the bundled net ... reads as a speckled green caterpillar"): the skin
 * follows the roll's pinches and swells a few millimetres off it, tucked under each tie, its hem ragged.
 * Round 5 (2026-10-08; wave 255 on the M60A1: "the leaf-print 'sausage' on the turret, uncut and untied" — "either a
 * properly rolled, strapped net, or nothing"): the roll is the net itself, rolled. Its outer turn is the garnished net
 * (the decor's net material, in the vehicle's theatre: sand on a desert hull) wrapped all round a dense core of inner
 * turns, so the cut garnish shows depth, never daylight; both ends show the rolled layers as a dark spiral; three
 * webbing straps pinch it hard (a quarter of its girth) in the darker issue webbing; garnish tails hang out of the roll
 * between them. Seeded per roll.
 */
export function buildNetRoll(P: AccessoryPainter, len: number, tone: number, seed = 83): void {
  const R = 0.13;
  const h = bagNoise(seed, 0x4e1);
  const cinch = [-len * (0.3 + 0.05 * h(0)), (h(1) - 0.5) * 0.1 * len, len * (0.3 + 0.05 * h(2))];
  const spec: FabricSpec = { len, hw: R * 1.05, hh: R, exponent: 2.1, endScale: 0.62, endLength: 0.12, flatten: 0.2,
    wrinkle: 0.14, seg: near(P) ? 10 : ROLL_SEG_COARSE, stations: 2, cinch, cinchDepth: 0.26 + 0.06 * h(3), bulge: 0.07,
    ...ROLL_PINCH, seed, detail: P.detail };
  // the rolled net's body, seated on its measured lowest point (bag()'s rule), and its three straps
  const body = place(fabricBody(spec), 0, 0, 0, 0, Math.PI / 2, 0);
  body.computeBoundingBox();
  const lift = -body.boundingBox!.min.y;
  // the inner turns, packed dense: they read through the outer turn's garnish as shadowed depth, never as daylight
  P.cloth(place(body, 0, lift, 0), tone * 0.55, [0.92, 0.95, 0.84]);
  for (const z of cinch) webbing(P, place(place(fabricStrap(spec, z), 0, 0, 0, 0, Math.PI / 2, 0), 0, lift, 0), 0.38);
  // the outer turn, tucked under each strap, its hem ragged down both flanks
  const tucked = (z: number): number => (cinch.some((c) => Math.abs(z - c) < 0.02) ? 0.002 : 0.008);
  const hem = (z: number): readonly [number, number] => {
    const k = Math.round(z * 97);
    return [-0.55 - 0.45 * hash01(seed, 11, k), Math.PI + 0.55 + 0.45 * hash01(seed, 13, k)];
  };
  const skin = fabricSleeve(spec, hem, tucked, near(P) ? 7 : 4);
  P.net(place(place(skin, 0, 0, 0, 0, Math.PI / 2, 0), 0, lift, 0), tone);
  if (!near(P)) return;
  // the rolled layers seen end-on, a dark spiral on each end
  for (const end of [-1, 1] as const) {
    const spiral = place(rolledEndSpiral(R * 0.62, end * len / 2, end, 16), 0, 0, 0, 0, Math.PI / 2, h(4) * Math.PI * 2);
    P.cloth(place(spiral, 0, lift, 0), tone * 0.42, [0.9, 1.0, 0.82]);
  }
  // garnish tails hanging out of the roll between the straps, down its flanks
  for (let k = 0; k < 4; k++) {
    const x = (hash01(seed, 21, k) - 0.5) * len * 0.78;
    if (cinch.some((c) => Math.abs(x - c) < 0.06)) continue;
    const side = k % 2 ? 1 : -1, drop = 0.08 + hash01(seed, 23, k) * 0.1, w = 0.035 + hash01(seed, 25, k) * 0.03;
    const y0 = lift + R * 0.25, z0 = side * R * 1.04;
    const path: Array<[number, number, number]> = [[x, y0, z0], [x + 0.012, y0 - drop * 0.5, side * (R * 1.08)],
      [x + 0.02, y0 - drop, side * (R * 1.06)]];
    P.net(garnishTail(path, w), tone * 0.9);
  }
}

/** A flat cloth tail along a short path (a garnish strip hanging out of a rolled net), its face turned outward. */
function garnishTail(path: ReadonlyArray<readonly [number, number, number]>, width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    const wa = width * (1 - 0.25 * (k / (path.length - 1))) / 2, wb = width * (1 - 0.25 * ((k + 1) / (path.length - 1))) / 2;
    // the strip spans along the roll (x) and hangs down its flank
    const p = [[a[0] - wa, a[1], a[2]], [a[0] + wa, a[1], a[2]], [b[0] + wb, b[1], b[2]], [b[0] - wb, b[1], b[2]]];
    positions.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A camouflage net laid over a deck. 2026-10-07 (tank-accessories round 4; wave 213: nets "sit proud of the hull with
 * dead-straight hems"): the sheet lies on its support — placement conforms every vertex to the deck under it
 * (decorations.ts conformDrape, keyed by `parts.meta.drape`) at its own relief, carried per vertex in
 * `geometry.userData.drapeRelief` (non-indexed order): loose bunching and folds over the middle, pleats gathered toward
 * each tie point, the hem down on the armour. In plan the hem is irregular: pulled in at tie points spaced unevenly
 * round the edge, sagging out between them. Off a deck (a kit sheet) it lies on y = 0 at that relief. Piece frame:
 * footprint w (X) by len (Z).
 */
export function buildNetDrape(P: AccessoryPainter, w: number, len: number, seed: number): void {
  const nx = near(P) ? 10 : 5, nz = near(P) ? 12 : 6;
  const s0 = Math.floor(seed * 1000);
  const per = 2 * (w + len);
  const count = Math.max(6, Math.round(per / 0.36));
  const ties: number[] = [];
  for (let k = 0; k < count; k++) ties.push(((k + 0.5 + (hash01(s0, 0x7e, k) - 0.5) * 0.6) / count) * per);
  const tieGap = (t: number): number => {
    let best = Infinity;
    for (const c of ties) { const g = Math.abs(t - c); best = Math.min(best, g, per - g); }
    return best;
  };
  // the nearest edge: its perimeter parameter, the distance to it and the inward direction
  const edge = (x: number, z: number): { t: number; d: number; ix: number; iz: number } => {
    const dl = x + w / 2, dr = w / 2 - x, db = z + len / 2, df = len / 2 - z;
    const d = Math.min(dl, dr, db, df);
    if (d === db) return { t: dl, d, ix: 0, iz: 1 };
    if (d === dr) return { t: w + db, d, ix: -1, iz: 0 };
    if (d === df) return { t: w + len + dr, d, ix: 0, iz: -1 };
    return { t: 2 * w + len + df, d, ix: 1, iz: 0 };
  };
  const phase = hash01(s0, 0x9a) * Math.PI * 2;
  const vertex = (i: number, k: number): { p: [number, number, number]; r: number } => {
    let x = (i / nx - 0.5) * w, z = (k / nz - 0.5) * len;
    const e = edge(x, z);
    const gap = tieGap(e.t);
    const gather = Math.exp(-((gap / 0.07) ** 2));
    const rim = Math.max(0, 1 - e.d / 0.22);
    const pull = rim * rim * (0.09 * gather - 0.035 * (1 - gather) * (0.6 + 0.8 * hash01(s0, i, k)));
    x += e.ix * pull; z += e.iz * pull;
    const bunch = 0.035 + 0.05 * (0.5 + 0.5 * Math.sin(x * 5.3 + phase) * Math.cos(z * 4.1 - phase * 0.7));
    const fold = 0.025 * Math.max(0, Math.sin(x * 11 + z * 6 + phase * 2));
    const pleat = 0.03 * Math.exp(-gap / 0.18) * Math.max(0, Math.sin(gap * 40 + phase));
    const inner = Math.min(1, e.d / 0.18);
    const r = 0.004 + (bunch + fold) * inner * inner + pleat * (1 - rim * 0.5);
    return { p: [x, r, z], r };
  };
  const positions: number[] = [], relief: number[] = [];
  const push = (v: { p: [number, number, number]; r: number }): void => { positions.push(...v.p); relief.push(v.r); };
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const a = vertex(i, k), b = vertex(i + 1, k), c = vertex(i + 1, k + 1), d = vertex(i, k + 1);
      push(a); push(d); push(c); push(a); push(c); push(b);
    }
  }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sheet.computeVertexNormals();
  sheet.userData.drapeRelief = relief;
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
  // round 5 (2026-10-08; the contact receipt: the handles ran through solid clamp blocks, and the shovel's D-grip hung
  // 2 cm off its shaft): each tool rests in low saddle clamps (lift: the handles sit 1.2 cm higher) under a steel strap
  // that wraps the handle, and the D-grip's legs close on the shaft's end
  const lift = 0.012;
  set.forEach((tool, idx) => {
    const lane = (idx - (set.length - 1) / 2) * 0.115;
    const [toneR, jitter] = tones[idx];
    const tone = 0.62 + toneR * 0.16;
    const dz = (jitter - 0.5) * 0.1;
    const seg = near(P) ? 6 : 4;
    let hy = 0.03 + lift, hr = 0.017;
    if (tool === 'shovel') {
      P.trim(roundBar([lane, hy, -0.42 + dz], [lane, hy, 0.34 + dz], 0.017, seg), tone);
      // D-grip, its legs closing on the shaft's end
      if (near(P)) P.trim(sweptTube([[lane - 0.012, hy, -0.41 + dz], [lane - 0.045, hy, -0.452 + dz], [lane - 0.04, hy, -0.5 + dz],
        [lane + 0.04, hy, -0.5 + dz], [lane + 0.045, hy, -0.452 + dz], [lane + 0.012, hy, -0.41 + dz]], 0.011, 4, 8), tone * 0.9);
      // dished blade: a shallow bent plate tapering to a point
      const blade = latheY([[0.0005, 0], [0.075, 0.02], [0.08, 0.17], [0.05, 0.25], [0.0005, 0.27]], near(P) ? 8 : 5);
      blade.scale(1, 1, 0.12);
      P.steel(place(blade, lane, 0.036 + lift, 0.33 + dz, Math.PI / 2, 0, 0), 0.55);
    } else if (tool === 'axe') {
      hr = 0.016;
      P.trim(roundBar([lane, hy, -0.3 + dz], [lane, hy, 0.32 + dz], 0.016, seg), tone);
      P.steel(place(moldedBox(0.04, 0.05, 0.17, 0.008, 1, 0.006), lane, 0.032 + lift, 0.3 + dz), 0.55);
      P.steel(place(block(0.012, 0.05, 0.11), lane + 0.03, 0.032 + lift, 0.33 + dz, 0, -0.25, 0), 0.62);
    } else if (tool === 'sledge') {
      hy = 0.035 + lift;
      P.trim(roundBar([lane, hy, -0.35 + dz], [lane, hy, 0.255 + dz], 0.017, seg), tone);   // into the head's face
      P.steel(place(moldedBox(0.075, 0.075, 0.15, 0.01, 1, 0.008), lane, 0.038 + lift, 0.33 + dz), 0.48);
    } else {
      hy = 0.026 + lift; hr = 0.012;
      P.steel(sweptTube([[lane, hy, -0.38 + dz], [lane, hy, 0.3 + dz], [lane, hy + 0.014, 0.36 + dz], [lane, hy + 0.044, 0.38 + dz]], 0.012, 5, 6), 0.5);
    }
    for (const cz of [-0.2, 0.22]) {
      const base = hy - hr;                                         // the saddle's top meets the handle's underside
      P.kit(place(block(0.05, base, 0.035), lane, base / 2, cz), 0.88);
      // the strap over the handle: a steel band from saddle to saddle round its top
      const pts: number[] = [];
      const arc = [Math.PI, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.25, 0];
      for (let k = 0; k < arc.length - 1; k++) {
        const a0 = arc[k], a1 = arc[k + 1], R = hr + 0.006;
        const p0 = [lane + Math.cos(a0) * R, hy + Math.sin(a0) * R], p1 = [lane + Math.cos(a1) * R, hy + Math.sin(a1) * R];
        const z0 = cz - 0.012, z1 = cz + 0.012;
        // outward faces only (wound away from the handle)
        pts.push(p0[0], p0[1], z0, p1[0], p1[1], z1, p1[0], p1[1], z0, p0[0], p0[1], z0, p0[0], p0[1], z1, p1[0], p1[1], z1);
      }
      const strap = new THREE.BufferGeometry();
      strap.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      strap.computeVertexNormals();
      P.steel(withBoxUV(strap), 0.5);
    }
  });
}

/** Grey-brown bark over the wood family's warm grain, and the paler sawn end grain (round 3). */
const BARK_TINT: RGB = [0.8, 1.0, 1.7];
const END_GRAIN_TINT: RGB = [1.35, 1.42, 1.65];

/**
 * An unditching log along X (accessoryPrimitives.barkLog): furrowed bark, knots and a cut branch stub, pale sawn ends
 * with growth rings and drying checks, and two chain straps on the actual trunk. 2026-10-07 (round 3: "the unditching
 * log is a smooth green pipe").
 */
export function buildLog(P: AccessoryPainter, len: number, R: number, tone: number, seed: number): void {
  const log = barkLog({ len, r: R, seed, detail: P.detail });
  P.wood(log.bark, tone * 0.62, BARK_TINT);
  if (log.stub) P.wood(log.stub, tone * 0.56, BARK_TINT);
  for (const end of log.ends) P.wood(end, 1.0, END_GRAIN_TINT);
  for (const ring of log.grain) P.wood(ring, 0.55, BARK_TINT);
  const seg = near(P) ? 12 : 6;
  for (const s of [-1, 1]) {
    const band = log.radiusAt(0.5 + s * 0.31) * 1.09 + 0.006;
    P.steel(place(new THREE.TorusGeometry(band, 0.012, 3, seg).toNonIndexed(), s * len * 0.31, 0, 0, 0, Math.PI / 2, 0), 0.42);
  }
}

/**
 * A 200 L steel drum along `transverse` X or Z: rolled chimes, two rolling hoops, bung caps. Centre on the origin.
 * Round 5 (2026-10-08; wave 255: "identical smooth tubes. Give them rims and ribs, rust at the straps, spill streaks and
 * some variation"): given an issue colour, the drum is painted in it rather than the scheme's kit paint, its hoops swaged
 * a full 1.5 cm proud, rust baked into the paint along the hoops where the straps chafe and a fuel stain run down its
 * crown from the bung end, each drum to its own seed.
 */
export function drum200(P: AccessoryPainter, cx: number, transverse: boolean, tone: number, rgb?: RGB, seed = 0): void {
  const R = 0.28, L = 0.85;
  const seg = near(P) ? 14 : 9;
  const rise = rgb ? 0.015 : 0.012;
  const hoop = (y: number): Array<readonly [number, number]> => [[R, y - 0.018], [R + rise, y], [R, y + 0.018]];
  const profile: Array<readonly [number, number]> = [[0.0005, 0.01], [R - 0.012, 0.012], [R + 0.004, 0], [R, 0.02],
    ...(near(P) ? hoop(L * 0.29) : []), ...(near(P) ? hoop(L * 0.71) : []), [R, L - 0.02], [R + 0.004, L], [R - 0.012, L - 0.012], [0.0005, L - 0.01]];
  const body = latheY(profile, seg);
  if (transverse) place(body, cx - L / 2, 0, 0, 0, 0, -Math.PI / 2);
  else place(body, cx, 0, -L / 2, Math.PI / 2, 0, 0);
  if (!rgb) P.kit(body, tone);
  else {
    P.paint(body, scaleRgb(rgb, tone), 0.28);
    weatherDrum(body, cx, transverse, L, seed);
  }
  if (near(P)) {
    const cap = latheY([[0.0005, 0], [0.03, 0], [0.03, 0.016], [0.0005, 0.018]], 8);
    if (transverse) P.steel(place(cap, cx + L / 2, R * 0.55, 0, 0, 0, -Math.PI / 2), 0.5);
    else P.steel(place(cap, cx, R * 0.55, L / 2, Math.PI / 2, 0, 0), 0.5);
  }
}

/**
 * Weather a painted drum's baked colours in place (round 5): rust along each rolling hoop where the straps ride (warm,
 * darker, uneven round the drum), and a fuel stain run down the crown from the bung end. `body` is the placed drum (axis
 * along X when `transverse`, else Z, centred on `cx` / the origin); its colour attribute is the paint drum200 baked.
 */
function weatherDrum(body: THREE.BufferGeometry, cx: number, transverse: boolean, L: number, seed: number): void {
  const pos = body.getAttribute('position'), col = body.getAttribute('color');
  if (!col) return;
  const n = bagNoise(seed, 0xd2);
  const stainAt = Math.PI / 2 + (n(1) - 0.5) * 0.8;   // near the top, off centre
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const along = transverse ? x - cx + L / 2 : z + L / 2;           // 0 .. L from one head
    const a = transverse ? Math.atan2(y, z) : Math.atan2(y, x - cx);  // round the axis, PI/2 on top
    const u = along / L;
    let k0 = 1, k1 = 1, k2 = 1;
    // rust at the hoops (0.29 and 0.71 of the length), patchy round the drum
    const g0 = ((u - 0.29) * L) / 0.03, g1 = ((u - 0.71) * L) / 0.03;
    const hoopNear = Math.max(Math.exp(-(g0 * g0)), Math.exp(-(g1 * g1)));
    const patch = 0.5 + 0.5 * Math.sin(a * 3 + n(2) * 6) * Math.sin(a * 5 + n(3) * 6);
    const rust = hoopNear * (0.35 + 0.65 * patch);
    k0 *= 1 + rust * 0.45; k1 *= 1 - rust * 0.18; k2 *= 1 - rust * 0.5;
    // a fuel stain from the bung end down the crown, fading along the drum
    const da = Math.atan2(Math.sin(a - stainAt), Math.cos(a - stainAt));
    const stain = Math.exp(-((da / 0.32) ** 2)) * Math.max(0, 1 - u / (0.45 + 0.3 * n(4)));
    const dark = 1 - stain * 0.38;
    col.setXYZ(i, col.getX(i) * k0 * dark, col.getY(i) * k1 * dark, col.getZ(i) * k2 * dark * 0.96);
  }
  col.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------------------------
// Fresh-cut branches (2026-10-05, owner-approved proposal E): the field camouflage of the 2022 war imagery — cut
// branches lashed along turret stowage and laid along fenders — from the trees lane's spray cards on woody stems.
// ---------------------------------------------------------------------------------------------------------------

/** Branch bundle seats: 'flank' along a wall, 'deck' on a deck or fender; 'upright' / 'lying' are their old names. */
export type BranchBundleVariant = 'flank' | 'deck' | 'upright' | 'lying';

type Vec3 = [number, number, number];
const v3add = (a: readonly number[], b: readonly number[], k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const v3norm = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * A bundle of fresh-cut branches a crew laid along the vehicle and strapped down. History: round 2 (2026-10-06) laid
 * them along a wall or deck, never upright; round 3 wedged the butts behind the support face and stood the boughs off
 * the wall with sprays rolled all round the wood, which the wave-214 critics read as "cut branches stick sideways into
 * air on wire stems with leaf cards hanging off", "only a few leafless dark twigs" (T-90M) and "tufts stand upright like
 * potted shrubs" (Oplot-M). Round 4 (2026-10-07): the bundle lies along its support as a flat leafy mat. Each bough
 * runs within 2-5 cm of the support face; its sprays leave the wood alternately to either side and lie in the support's
 * plane (tilted out of it by at most a quarter radian), overlapping along the whole run so the wood shows only at the
 * cut butts under the first tie; no spray, stem or tip stands more than 0.15 m off the support. Two webbing ties, one
 * over the butts and one at mid-run, press the mat down and run back to the support. One bundle is one tree's cut:
 * deep greens, a bough here and there wilting.
 * 'flank' lays the bundle along a wall (the turret-side seat: local X along the wall, +Y up, +Z out of it); 'deck'
 * lays it on a deck or fender (+Y up), narrow across so it never reaches over the fender's edges. Draws: count x 14
 * values, then the tie and the tree; the near level and the coarse level draw identically.
 */
export function buildBranchBundle(P: AccessoryPainter, variant: BranchBundleVariant, count: number): void {
  const flank = variant === 'flank' || variant === 'upright';
  const draws: number[][] = [];
  for (let i = 0; i < count; i++) draws.push(Array.from({ length: 14 }, () => P.rng()));
  const tieAt = 0.07 + P.rng() * 0.05;
  const tree = P.rng();
  const nearLevel = near(P);
  const cards = new FoliageCardBuffer();
  // the support's outward normal and the in-plane direction square to the run
  const out: Vec3 = flank ? [0, 0, 1] : [0, 1, 0];
  const across: Vec3 = flank ? [0, 1, 0] : [0, 0, 1];
  const offOf = (p: readonly number[]): number => (flank ? p[2] : p[1]);
  const at3 = (x: number, a: number, o: number): Vec3 => (flank ? [x, a, o] : [x, o, a]);
  const OFF_MAX = 0.15;
  // a spray lies over the support: never into it, never more than OFF_MAX off it, and (deck) never past the fender edges
  const clear = (card: FoliageCard): boolean => foliageCardPoints(card).every((p) => offOf(p) > 0.006 && offOf(p) < OFF_MAX
    && (flank ? p[1] > -0.06 : Math.abs(p[2]) < 0.18));
  let offTop = 0.03, aMin = Infinity, aMax = -Infinity, runMax = 0;
  const pushSpray = (stem: Vec3, along: readonly number[], side: number, spread: number, lift: number, len: number,
    bend: number, tile: number, tint: Vec3): void => {
    const dir = v3norm(along);
    for (const [sp, li, ln] of [[spread, lift, len], [spread * 0.6, lift * 0.5, len * 0.85], [spread * 0.3, 0.02, len * 0.7]] as const) {
      // in the support's plane: the run direction turned toward one side, then lifted a little off the support
      const inPlane = v3norm(v3add(v3add([0, 0, 0], dir, Math.cos(sp)), across, side * Math.sin(sp)));
      const axis = v3norm(v3add(v3add([0, 0, 0], inPlane, Math.cos(li)), out, Math.sin(li)));
      const d = axis[0] * out[0] + axis[1] * out[1] + axis[2] * out[2];
      const face = v3norm(v3add(out, axis, -d));
      // flat cards (four triangles): the bundles are the decor's first rows and the 6,000-triangle budget is full on
      // several hulls, so the mat's density comes from overlap along the run, not folds
      const card: FoliageCard = { stem, axis, face, out, length: ln, width: ln * 0.88, tile, bend, tint };
      if (clear(card)) {
        cards.push(card);
        for (const q of foliageCardPoints(card)) offTop = Math.max(offTop, offOf(q));
        return;
      }
    }
  };
  draws.forEach(([a, b, c, d, e, f, g, h, k, m, w, , , roll0], i) => {
    const len = 0.66 + a * 0.32;
    const share = count > 1 ? i / (count - 1) : 0.5;
    // boughs side by side across the support (flank: up the wall over ~0.26 m; deck: across a ~0.2 m strip)
    const lane = flank ? 0.07 + share * 0.24 + (c - 0.5) * 0.04 : (share - 0.5) * 0.15 + (c - 0.5) * 0.02;
    const drift = (g - 0.5) * 0.06 - (flank ? 0.02 + f * 0.03 : 0);
    const butt = at3(-0.085 + b * 0.02, lane, 0.014);
    const base = at3(0, lane, 0.02);
    const mid = at3(len * 0.5, lane + drift * 0.5, 0.03 + e * 0.02);
    const tip = at3(len, lane + drift, 0.022 + d * 0.012);
    P.trim(sweptTube([butt, base, mid, tip], 0.0125 - share * 0.002, 3, 2), 0.5 + f * 0.14);   // 18 tris, hidden but the butt
    aMin = Math.min(aMin, lane - 0.04); aMax = Math.max(aMax, lane + drift + 0.04); runMax = Math.max(runMax, len);
    // one tree's leaves: a deep green, a bough here and there wilting
    const v = 0.4 + tree * 0.1 + h * 0.14, wilt = w < 0.16 ? 0.4 + w * 2 : 0;
    const stemTint: Vec3 = [v * 0.8 * (1 + wilt * 0.6), v * (1 - wilt * 0.1), v * 0.86 * (1 - wilt * 0.3)];
    const tint = (j: number): Vec3 => { const q = 0.86 + ((k * 7 + j * 0.37) % 1) * 0.28; return [stemTint[0] * q, stemTint[1] * q, stemTint[2] * q]; };
    const bez = (t: number): Vec3 => {
      const u = 1 - t;
      return [0, 1, 2].map((q) => u * u * base[q] + 2 * u * t * mid[q] + t * t * tip[q]) as Vec3;
    };
    // the coarse level's sprays are the near level's larger and fewer; both cover the wood from the first tie on
    const sprays = nearLevel ? [0.1, 0.27, 0.44, 0.61, 0.78] : [0.18, 0.5, 0.8];
    sprays.forEach((t, j) => {
      const p = bez(t), ahead = bez(Math.min(1, t + 0.06));
      const side = (j + i) % 2 ? 1 : -1;
      // a deck mat stays inside its fender strip: narrower fans, shorter cards, lifted a little more off the plate
      const fan = flank ? 0.42 + ((m * 5 + j * 0.31) % 1) * 0.5 : 0.3 + ((m * 5 + j * 0.31) % 1) * 0.36;
      const lift = (flank ? 0.06 : 0.12) + ((roll0 * 3 + j * 0.23) % 1) * 0.16;
      const cardLen = (flank ? 0.26 : 0.23) + ((b * 5 + j * 1.7) % 1) * 0.1 + (1 - t) * 0.04;
      pushSpray(p, [ahead[0] - p[0], ahead[1] - p[1], ahead[2] - p[2]], side, fan, lift,
        cardLen * (nearLevel ? 1 : (flank ? 1.35 : 1.2)), flank ? 0.03 + ((f * 3 + j) % 1) * 0.05 : 0.015,
        (i * 3 + j) % 4, tint(j));
    });
    // the leafy end runs past the bough's tip instead of showing the bare wood
    const pre = bez(0.9);
    pushSpray(tip, [tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]], i % 2 ? 1 : -1, 0.12, 0.05, 0.3, 0.05, (i + 1) % 4, tint(9));
  });
  const geometry = cards.toGeometry();
  if (geometry) P.leaves(geometry);
  // two webbing ties, over the butts and at mid-run, pressed onto the mat and run back to the support
  const band = 0.034, top = Math.min(OFF_MAX, offTop) + 0.006;
  const ties = [tieAt, Math.max(tieAt + 0.22, runMax * 0.5)];
  for (const [n, x] of ties.entries()) {
    if (!nearLevel && n > 0) continue;
    const lo = flank ? Math.max(0.004, aMin) : aMin, hi = aMax;
    if (flank) {
      webbing(P, place(block(band, hi - lo, 0.008), x, (hi + lo) / 2, top), 0.62);                 // over the mat
      webbing(P, place(block(band, 0.008, top), x, hi, top / 2), 0.62);                            // back to the wall
      webbing(P, place(block(band, 0.008, top), x, lo, top / 2), 0.62);
      if (nearLevel && n === 0) P.steel(place(block(0.05, 0.02, 0.012), x, lo + (hi - lo) * 0.55, top + 0.006), 0.5); // buckle
    } else {
      webbing(P, place(block(band, 0.008, hi - lo), x, top, (hi + lo) / 2), 0.62);
      for (const z of [lo, hi]) webbing(P, place(block(band, top, 0.008), x, top / 2, z), 0.62);
      if (nearLevel && n === 0) P.steel(place(block(0.05, 0.012, 0.02), x, top + 0.006, (hi + lo) * 0.5), 0.5);
    }
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
    // 'split': a ring whose hatch stands open — the collar steps down into a dark well, and the lid, hinged at the
    // well's back rim, has swung up past vertical to rest behind the ring. 2026-10-07 (round 3: "open hatch lids hinge
    // up over solid bodies": the lid leaned forward over a closed ring top)
    const r = 0.28, lidR = r * 0.55, wellR = r * 0.62, rimY = 0.16, hingeZ = -(wellR + 0.022);
    P.kit(latheY([[r * 0.95, 0], [r, 0.05], [r, 0.13], [r * 0.86, 0.152], [r * 0.7, 0.158], [wellR, 0.152],
      [wellR, 0.11], [0.001, 0.11]], seg), tone);
    P.steel(place(new THREE.CircleGeometry(wellR * 0.99, seg).toNonIndexed(), 0, 0.112, 0, -Math.PI / 2, 0, 0), 0.12); // the open well
    const lid = latheY([[lidR, 0], [lidR, 0.02], [lidR * 0.7, 0.034], [0.001, 0.04]], seg);
    place(lid, 0, 0, lidR);                       // its hinge edge on the hinge line, the lid over the well
    place(lid, 0, 0, 0, -108 * Math.PI / 180, 0, 0);
    P.kit(place(lid, 0, rimY + 0.012, hingeZ), tone * 1.05);
    P.steel(place(block(0.08, 0.03, 0.05), 0, rimY - 0.004, hingeZ - 0.012), 0.55);                     // hinge block
    if (!near(P)) return;
    P.steel(bossX(0.016, 0.06, 0, rimY + 0.012, hingeZ), 0.5);
    P.steel(sweptTube([[-0.04, rimY - 0.006, r * 0.76], [-0.04, rimY + 0.02, r * 0.8], [0.04, rimY + 0.02, r * 0.8],
      [0.04, rimY - 0.006, r * 0.76]], 0.008, 4, 6), 0.5);                                              // grab handle
  }
}

export function buildHatch(P: AccessoryPainter, v: string, tone: number): void {
  const seg = near(P) ? 16 : 10;
  if (v === 'round') {
    const r = 0.25;
    // pressed lid: raised rim, a shallow dome, the hinge knuckles and arm, a grab handle and the latch lug
    P.kit(latheY([[r, 0], [r, 0.03], [r * 0.95, 0.04], [r * 0.88, 0.044], [r * 0.86, 0.052], [r * 0.5, 0.068], [0.001, 0.075]], seg), tone);
    // 2026-10-07 (round 3): the hinge stands at the rim, outside the lid, not sunk into it
    P.steel(place(block(0.12, 0.03, 0.05), 0, 0.015, r + 0.02), 0.6);                                   // hinge block
    if (!near(P)) return;
    P.steel(bossX(0.018, 0.05, -0.05, 0.036, r + 0.022), 0.55);
    P.steel(bossX(0.018, 0.05, 0.05, 0.036, r + 0.022), 0.55);
    P.kit(place(block(0.05, 0.012, r * 0.5), 0, 0.058, r * 0.8), tone * 0.94);                          // hinge arm
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
  // the yoke stands on the plate: a pivot boss, the cross bar under the drum and the two arms up to the trunnions.
  // 2026-10-07 (round 3: the arms stood on the support beside the plate, "planted on the ground")
  const yokeY = 0.052, armX = R + 0.014, rs = near(P) ? 6 : 4;
  P.steel(roundBar([0, 0.03, 0], [0, yokeY + 0.008, 0], 0.03, rs), 0.5);                                // pivot boss
  P.steel(roundBar([-armX, yokeY, 0], [armX, yokeY, 0], 0.012, rs), 0.55);                              // cross bar
  for (const s of [-1, 1]) P.steel(roundBar([s * armX, yokeY - 0.01, 0], [s * armX, axleY, 0], 0.012, rs), 0.55); // arms
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

// ---------------------------------------------------------------------------------------------------------------
// Whip antennas (round 3, 2026-10-07: "the whip antennas are perfectly rigid straight rods with no curve or flex"). One
// construction for the profile fitting (KIT FITTINGS.antennaWhip) and the decor antenna kit: a tapered rod standing from
// its foot with a slight static set — it bows toward its lean and, raked, sags under its own weight — and a coiled
// spring at the foot. The foot and the tip's height are the straight rod's (the bow is lateral; the height is restored
// along the rod), so seats, heights and the antenna receipts keep their numbers.
// ---------------------------------------------------------------------------------------------------------------

export interface WhipAntennaOptions {
  /** Rod length (the straight rod's), metres. */
  readonly h: number;
  /** Rod radius at the foot. */
  readonly r: number;
  /** Lean about +Z, radians (a positive rake leans the tip toward -X, the fitting's convention). */
  readonly rake: number;
  /** A deterministic seed (the bow's side on a vertical rod). */
  readonly seed: number;
  /** Coil the spring at the foot. */
  readonly spring: boolean;
  /** Rod facets and stations (default 5 and 5; the decor whip, inside the 6,000-triangle decor budget, uses 3 and 2). */
  readonly radial?: number;
  readonly along?: number;
}

/**
 * The rod and spring of a whip in its foot frame (foot at the origin, +Y up): the rod's centreline bows by
 * h x (2.2 % + 5 % sin|rake|) along a cantilever's self-weight curve (60 triangles); the spring is a four-coil corrugated
 * sleeve 4.5-6.4 cm tall around the rod's root. Closed shells (fan caps); position, normal and uv like the kit's boxes.
 */
export function whipAntennaParts(o: WhipAntennaOptions): { rod: THREE.BufferGeometry; spring: THREE.BufferGeometry | null; tip: [number, number, number] } {
  const { h, r, rake } = o;
  const d = new THREE.Vector3(-Math.sin(rake), Math.cos(rake), 0);
  const side = rake !== 0 ? Math.sign(rake) : (o.seed % 2 ? 1 : -1);
  const lean = new THREE.Vector3(-side, 0, 0);
  // gravity's share square to the rod, plus a little set toward the lean (a vertical whip is never quite straight)
  const down = new THREE.Vector3(0, -1, 0);
  const bow = down.clone().addScaledVector(d, -down.dot(d)).addScaledVector(lean, 0.35);
  if (bow.lengthSq() < 1e-8) bow.copy(lean);
  bow.normalize();
  const amp = h * (0.022 + 0.05 * Math.abs(Math.sin(rake))) + 0.004;
  const along = o.along ?? 5, radial = o.radial ?? 5;
  const shape = (s: number): number => (s * s * (6 - 4 * s + s * s)) / 3; // cantilever under its own weight, 1 at the tip
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= along; k++) {
    const s = k / along;
    pts.push(d.clone().multiplyScalar(h * s).addScaledVector(bow, amp * shape(s)));
  }
  const lift = Math.cos(rake) * h - pts[along].y; // the straight rod's tip height, restored along the rod
  for (let k = 0; k <= along; k++) pts[k].y += lift * shape(k / along);
  // the tapered tube: rings square to the local tangent, a fan cap at each end
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const ref = new THREE.Vector3(0, 0, 1);
  const rings: { c: THREE.Vector3; ring: THREE.Vector3[]; n: THREE.Vector3[] }[] = [];
  for (let k = 0; k <= along; k++) {
    const t = (k === along ? pts[k].clone().sub(pts[k - 1]) : pts[k + 1].clone().sub(pts[k])).normalize();
    const n1 = new THREE.Vector3().crossVectors(t, ref).normalize();
    const n2 = new THREE.Vector3().crossVectors(t, n1);
    const rr = r * (1 - 0.55 * (k / along));
    const ring: THREE.Vector3[] = [], ns: THREE.Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = n1.clone().multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a));
      ns.push(n); ring.push(pts[k].clone().addScaledVector(n, rr));
    }
    rings.push({ c: pts[k], ring, n: ns });
  }
  const vert = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number): void => {
    positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); uvs.push(u, v);
  };
  for (let k = 0; k < along; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial, u0 = j / radial, u1 = (j + 1) / radial, v0 = (k / along) * h, v1 = ((k + 1) / along) * h;
      vert(A.ring[j], A.n[j], u0, v0); vert(A.ring[j2], A.n[j2], u1, v0); vert(B.ring[j2], B.n[j2], u1, v1);
      vert(A.ring[j], A.n[j], u0, v0); vert(B.ring[j2], B.n[j2], u1, v1); vert(B.ring[j], B.n[j], u0, v1);
    }
  }
  for (const [ringIndex, outward] of [[0, -1], [along, 1]] as const) {
    const { c, ring } = rings[ringIndex];
    const tn = (ringIndex === 0 ? pts[1].clone().sub(pts[0]) : pts[along].clone().sub(pts[along - 1])).normalize().multiplyScalar(outward);
    for (let j = 0; j < radial; j++) {
      const a = ring[j], b = ring[(j + 1) % radial];
      if (outward > 0) { vert(c, tn, 0.5, 0); vert(a, tn, 0, 0); vert(b, tn, 1, 0); } else { vert(c, tn, 0.5, 0); vert(b, tn, 1, 0); vert(a, tn, 0, 0); }
    }
  }
  const rod = new THREE.BufferGeometry();
  rod.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rod.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  rod.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  let spring: THREE.BufferGeometry | null = null;
  if (o.spring) {
    // four coils as a corrugated sleeve: crests and roots alternate up the rod's root (90 triangles)
    const rOut = Math.max(0.0155, r * 1.55), rIn = Math.max(r * 1.05, rOut * 0.7), tall = h < 0.45 ? 0.045 : 0.064;
    const profile: Array<readonly [number, number]> = [];
    for (let i = 0; i <= 8; i++) profile.push([i % 2 ? rOut : rIn, (i / 8) * tall]);
    spring = latheY(profile, 5);
  }
  return { rod, spring, tip: [pts[along].x, pts[along].y, pts[along].z] };
}
