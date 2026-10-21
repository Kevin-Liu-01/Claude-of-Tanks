// Tank hero card policy: one camera, one light rig, one framing rule and one flag
// treatment for every vehicle's card (Garage roster, end screen, sample boards).
// Dependency-free, so the runtime card (heroCard.ts, a lazy chunk), the GPU tank
// layer page (tools/hero-cards-page.html), the CPU compositor and encoder
// (tools/hero-cards-compose.mjs), the changed-only planner and the receipt all
// read the same numbers. Bumping HERO_POLICY_VERSION marks every card stale; the
// other inputs a card reads are fingerprinted per id (geometry and look, flag), so
// unchanged ids never re-render.
// First-party: Kevin B. Liu (NOTICE.md).

export const HERO_POLICY_VERSION = 5;

export type HeroFacing = 'left' | 'right';

/**
 * Camera. Vehicle forward is local +Z. `facing: 'left'` puts the camera on the hull's +X
 * flank so the bow points toward screen-left: the owner's decision of 2026-10-20 ("Whole tank
 * faces left"), after the v4 cards (bow right, turret swung back past the lens, gun left) read
 * to two blind critics as tanks driving right while aiming backward over the engine deck. It
 * supersedes the 2026-10-17 right-facing roster rule. The turret turns modestly toward the lens
 * and the gun keeps pointing left and forward with the hull (HERO_POSE). Flipping the whole card
 * set is this one field: the light rig, the framing, the gun side, the flag layout, the feather
 * and the tier chip mirror with it.
 */
export const HERO_CAMERA = Object.freeze({
  facing: 'left' as HeroFacing,
  // Fixed by sample round r4 (45/50/55/60 deg on 16 vehicles): 45 foreshortens the gun in the
  // small cards, 55+ shrinks long-gun tanks (the gun sets the fit). 50 keeps the glacis and the
  // turret face in view (the owner's fronts rule, 2026-10-05) within 10 deg of the Garage camera.
  azimuthDeg: 50,
  elevationDeg: 5,
  fovDeg: 20, // a long lens: little perspective swell on the glacis
  margin: 1.06,
});

/**
 * Turret pose (owner 2026-10-18: "the turrets should be turned towards you more"; 2026-10-20: "Whole tank
 * faces left"). The hull keeps the camera's front three-quarter view, bow to the facing side; the turret
 * turns modestly toward the lens so the turret face and mantlet show while the gun still points left and
 * forward, the way the hull drives (a tank advancing left with its turret turned toward you).
 *   turretTowardCameraDeg: traverse from the hull's forward axis, on whichever side brings the gun toward
 *     the lens (the renderer picks the sign by projecting the gun into the camera, never by the yaw
 *     convention alone). With the 50 deg camera the gun points at the lens at 50 deg, so any traverse
 *     below it keeps the gun on the bow's side (heroGunSide). Fixed at 30 by pose study r2 (15/30/45 deg on
 *     8 vehicles, samples/pose-r2; two blind critics both picked 30, runner-up 15): at 30 the mantlet and turret
 *     face show on 7 of 8 while the gun still leads left and forward; 15 barely turns the turret; 45 aims the
 *     gun at the lens and shrinks it to a stub at roster size. Both noted the thin or pale guns (Puma, Merkava)
 *     keep more length at 15.
 *     (v4, retired: 105 deg swung the gun back past the lens to the far side, pose study r1.)
 *   gunPitchDeg: the gun is level.
 * A turretless vehicle (casemate, hydraulic fixed gun) keeps its gun on the hull axis; a turreted mount with
 * a limited arc turns as far toward the lens as its legal arc allows (heroTurretTraverseLimitDeg).
 * Everything the turret carries (roof stations, secondary mounts on it) turns with it; hull-mounted
 * stations stay at rest.
 */
export const HERO_POSE = Object.freeze({
  turretTowardCameraDeg: 30,
  gunPitchDeg: 0,
});

/** The traverse fields of a vehicle spec the hero pose reads (movement.ts gunArcRadFor's inputs). */
export interface HeroTraverseSpec {
  readonly armor?: { readonly turretless?: boolean };
  readonly gunArcDeg?: number;
}

/**
 * The traverse half-arc (deg) the hero pose may use: 0 for any turretless mount (the gun stays on the hull
 * axis), a turreted mount's authored gunArcDeg when it has one (movement.ts gunArcRadFor), else unlimited.
 * A card never shows a gun where the vehicle cannot lay it.
 */
export function heroTurretTraverseLimitDeg(spec: HeroTraverseSpec): number {
  if (spec.armor?.turretless) return 0;
  if (typeof spec.gunArcDeg === 'number') return Math.max(0, spec.gunArcDeg);
  return Infinity;
}

/** The traverse (deg, unsigned) the hero pose gives a vehicle: the policy angle within its legal arc. */
export function heroTurretTraverseDeg(spec: HeroTraverseSpec, pose: { readonly turretTowardCameraDeg: number } = HERO_POSE): number {
  return Math.min(pose.turretTowardCameraDeg, heroTurretTraverseLimitDeg(spec));
}

/**
 * The screen side a gun traversed `traverseDeg` toward the lens points to: the bow's side until it passes
 * the lens (the camera azimuth, measured from the bow on the lens side), the other side after it. Between
 * the azimuth and azimuth + 90 deg the gun points to the far side while still turned toward the viewer.
 */
export function heroGunSide(
  traverseDeg: number = HERO_POSE.turretTowardCameraDeg,
  facing: HeroFacing = HERO_CAMERA.facing,
  azimuthDeg: number = HERO_CAMERA.azimuthDeg,
): HeroFacing {
  if (traverseDeg <= azimuthDeg) return facing;
  return facing === 'right' ? 'left' : 'right';
}

/** The gun side of the policy's turreted vehicles (the cards' default; a row may carry its own). */
export const HERO_GUN_SIDE: HeroFacing = heroGunSide();

/**
 * Studio light rig (three units). Positions are relative to the tank centre, in metres, written
 * for the camera on the +X flank (x mirrors for facing 'right'). A product-shot rig: the key
 * stands high over the bow so the roof and glacis catch it and the flank falls a step darker;
 * its shadow becomes a soft contact pool under the tracks. A cool fill from the camera side
 * holds the flank, the rim draws the rear and the roof line against the dark ground.
 */
export const HERO_LIGHTS = Object.freeze({
  exposure: 1.15, // r4 judged 1.05 a step dark for dark camo on the steel ground at roster size
  environmentIntensity: 0.4,
  hemisphere: Object.freeze({ sky: 0xdfe8f2, ground: 0x262c33, intensity: 0.4 }),
  key: Object.freeze({ color: 0xfff1e0, intensity: 3.4, position: Object.freeze([2.5, 12, 7] as const), shadow: true }),
  fill: Object.freeze({ color: 0xcfe0ff, intensity: 0.7, position: Object.freeze([9, 2.5, -1.5] as const) }),
  rim: Object.freeze({ color: 0xffffff, intensity: 3.2, position: Object.freeze([-5, 6, -9] as const) }),
  kicker: Object.freeze({ color: 0xa9c8ff, intensity: 1.0, position: Object.freeze([-8, 2.5, 7] as const) }),
  groundShadowOpacity: 0.55,
  // The floor shadow becomes a soft pool under the hull (ratios of the dense core): blurred by blurRatio of the
  // core width, kept inside an ellipse centred liftRatio above the contact line, so the barrel never draws a line.
  contactShadow: Object.freeze({ blurRatio: 0.018, opacity: 0.95, radiusX: 0.66, radiusY: 0.30, liftRatio: 0.02, inner: 0.45 }),
});

/**
 * Tank layer framing. The master layer is a transparent 16:10 canvas. The dense core
 * (portraitFraming's alpha-weighted quantiles, blind to antennas and whips) fills
 * `coreWidthRatio` of the width; the track contact line sits on `baselineRatio`;
 * the core centre sits at `centerXRatio` for a gun pointing left (mirrored for a gun pointing right),
 * leaving the gun its room.
 */
export const HERO_FRAME = Object.freeze({
  width: 1600,
  height: 1000,
  supersample: 2,
  coreWidthRatio: 0.70,
  coreHeightRatio: 0.66,
  baselineRatio: 0.86,
  centerXRatio: 0.54,
  edgeClearPx: 6, // every solid pixel (alpha > 8) stays this far inside the layer
  // Rows holding fewer opaque pixels than this share of the silhouette width are whips and thin masts:
  // they never shrink the tank to fit. They may rise into the top band, which fades them out, so no
  // card ever shows an antenna cut by the layer's edge.
  solidRowShare: 0.02,
  whipFadeRatio: 0.07,
});

export type HeroCardKind = 'roster' | 'rosterCompact' | 'galleryBrowse' | 'deploy' | 'endScreen';

/**
 * Card boxes (CSS px at 1x) and their layouts. `roster` and `rosterCompact` are the Garage strip's
 * own boxes (desktop, and the overlay/phone strip); the runtime card reads the same layout through
 * CSS container units, so any box size places the tank by these rules.
 *   nameBand: the band under the contact line that holds the name (never over the hull);
 *   coreShare / coreHeight: the tank's dense core as a share of the card width / art-box height;
 *   centerX: the core centre for a gun pointing left (mirrored for a gun pointing right), leaving the gun its room;
 *   nameSize / minName: the display name (px); hollow: the variant suffix in tungsten outline;
 *   tier: the "Tier X" chip in the bow-side top corner (the flag holds the rear-top corner).
 * Blind critic round 1 (2026-10-20, both critics): with the gun swung back over the deck every card was
 * fitted by its whole silhouette, so a short-gun hull (IFVs, launchers, KV-2) spanned the card edge to edge
 * at up to 1.6x a main battle tank's core height. The roster shares (0.66 / 0.50, compact 0.70 / 0.64) cap
 * those cores; 149 of 220 roster cards keep the whole-silhouette fit unchanged.
 * Blind critic round v5 (2026-10-21, both critics): with the gun forward, the 3.5 % side margin and a 0.56 core
 * centre pinned the rear to the right edge (5.5 px) and the long fixed guns to the left one; a 6 % margin and a
 * 0.52 centre (compact 0.51) give both ends ~10 px (roster) and 6.7 px (compact); 136 roster cards keep their scale.
 * A name that wraps to a second line (the non-hollow kinds) overlays the tank's lower part: the art box and the
 * tank stay exactly where a one-line name keeps them (owner 2026-10-21: "double line text shouldn't push tanks
 * up ... the text should be overlaid over the tanks", retiring round 1's one-line lift), and the name floor rises
 * one name line (HERO_NAME_LINE_HEIGHT) under a soft halo on the name, so it reads on any livery.
 */
export const HERO_CARD_LAYOUT = Object.freeze({
  roster: Object.freeze({ width: 156, height: 150, nameBand: 36, coreShare: 0.66, coreHeight: 0.50, centerX: 0.52, nameSize: 13.5, minName: 10.5, pad: 9, hollow: false, tier: true, tierSize: 8.5 }),
  rosterCompact: Object.freeze({ width: 112, height: 86, nameBand: 24, coreShare: 0.70, coreHeight: 0.64, centerX: 0.51, nameSize: 9.5, minName: 8, pad: 6, hollow: false, tier: true, tierSize: 7 }),
  galleryBrowse: Object.freeze({ width: 264, height: 188, nameBand: 40, coreShare: 0.70, coreHeight: 0.76, centerX: 0.56, nameSize: 18, minName: 12, pad: 12, hollow: false, tier: true, tierSize: 10 }),
  deploy: Object.freeze({ width: 360, height: 240, nameBand: 58, coreShare: 0.66, coreHeight: 0.74, centerX: 0.56, nameSize: 30, minName: 20, pad: 16, hollow: true, tier: true, tierSize: 12 }),
  endScreen: Object.freeze({ width: 560, height: 360, nameBand: 90, coreShare: 0.64, coreHeight: 0.72, centerX: 0.56, nameSize: 50, minName: 32, pad: 24, hollow: true, tier: true, tierSize: 14 }),
});
export const HERO_CARD_KINDS = Object.freeze(Object.keys(HERO_CARD_LAYOUT) as HeroCardKind[]);
/** The name's line height (a share of its size): a second name line raises the name floor by this much. */
export const HERO_NAME_LINE_HEIGHT = 1.05;
/** The whole tank (muzzle to rear stowage) stays this share of the card width inside each side. */
export const HERO_SIDE_MARGIN = 0.06;

/**
 * Shipped widths (px) of the transparent tank layer (16:10, master framing) and the flag layer.
 * 480 serves the roster and compact cards at 1x and 2x (AVIF, WebP fallback); 960 the large
 * cards at 2x (AVIF only; non-AVIF browsers upscale the 480 WebP).
 */
export const HERO_RUNGS = Object.freeze({ tank: Object.freeze([480, 960] as const), flag: Object.freeze([480, 960] as const) });

/** Encoder settings. The AVIF value is a quantizer (0 best, 100 worst): 30 is visually clean at 2x. */
export const HERO_ENCODE = Object.freeze({ avifQuantizer: 30, avifSpeed: 5, webpQuality: 82 });

/** Byte budgets the receipt enforces (p95 per layer; totals for the directory and the manifest). */
export const HERO_BUDGETS = Object.freeze({
  tankAvif480: 14 * 1024,
  tankAvif960: 28 * 1024,
  tankWebp480: 30 * 1024,
  flagAvif: 12 * 1024, // either AVIF rung of a nation's flag layer
  flagWebp: 20 * 1024, // the 480 WebP fallback (non-AVIF browsers only)
  directory: 12 * 1024 * 1024,
  manifest: 100 * 1024,
});

/** Where the shipped layers and their manifest live (under public/, served at /icons/hero/). */
export const HERO_PUBLIC_DIR = 'icons/hero';
export const HERO_MANIFEST_FILE = 'hero-cards.json';

/** The shipped files of one tank layer: AVIF at both rungs, the WebP fallback at the small rung. */
export function heroTankFiles(id: string): [string, string, string] {
  return [`${id}-480.avif`, `${id}-960.avif`, `${id}-480.webp`];
}

/** The shipped files of one nation's flag layer, in the same order. */
export function heroFlagFiles(code: string): [string, string, string] {
  return [`flag-${code}-480.avif`, `flag-${code}-960.avif`, `flag-${code}-480.webp`];
}

/**
 * Card ground (the colour the flag fades into). `steel` is the owner's reference look (a deep
 * steel blue) pulled toward Premiere graphite so the hull stays the most saturated thing; it
 * ends in graphite-850 under the name so the card joins the UI chrome.
 */
export const HERO_GROUNDS = Object.freeze({
  steel: Object.freeze({ top: '#0f3a55', mid: '#0b2a3e', bottom: '#0b0e11', lift: 'rgba(120,170,205,0.14)' }),
  graphite: Object.freeze({ top: '#1a2633', mid: '#121a23', bottom: '#0b0e11', lift: 'rgba(120,150,180,0.16)' }),
  reference: Object.freeze({ top: '#014061', mid: '#014061', bottom: '#014061', lift: 'rgba(0,0,0,0)' }),
});
export const HERO_GROUND = HERO_GROUNDS.steel;

/**
 * Flag cloth (one layer per nation, the shipped flag-icons 4x3 art). The flag sits behind the
 * tank's rear half and fades toward the gun and the floor; the obverse always faces the viewer
 * (canton at the hoist, tricolours in their own order). Facing 'right' (the reference) hoists the
 * flag off the card's left (rear) edge and fades the fly inside the card toward the gun; facing
 * 'left' mirrors the composition with the hoist under the feather and the fly off the far edge.
 *
 * The cloth is a height field of travelling waves whose amplitude grows from the hoist to the fly;
 * analytic normals, one raking light, a satin sheen. The layer carries no feather of its own beyond
 * the fly fade: each card applies HERO_FLAG_MASK (the compositor, CSS mask-image at runtime), so one
 * flag layer serves every card aspect.
 */
export const HERO_FLAG = Object.freeze({
  width: 1600,
  height: 1000,
  layout: 'mirror' as 'mirror' | 'reverse' | 'stream',
  hoistX: 0.42 as number, // facing 'left': the folds shorten the cloth ~9 %, the fly still clears the far edge
  topY: -0.05, // the wavy top edge stays above the card
  flagWidth: 0.70,
  flagAspect: 0.75, // the shipped 4x3 art at its own proportions (stars stay round)
  // r4: more, shallower folds (the r3 cloth's few deep troughs read as grey smudges on white fields).
  waves: Object.freeze([
    Object.freeze({ amp: 0.065, freq: 2.00, phase: 0.10, slant: 0.75 }),
    Object.freeze({ amp: 0.030, freq: 3.60, phase: 0.58, slant: -0.35 }),
    Object.freeze({ amp: 0.011, freq: 6.60, phase: 0.31, slant: 0.90 }),
  ]),
  ampGrowth: 1.0, // amplitude grows from the hoist (0) to the fly (1) as u^growth, plus a base share
  ampBase: 0.35,
  droop: 0.03, // the fly sags under its own weight
  tilt: 0.30, // crest lift (screen y per unit depth): the camera sits a little below the cloth
  light: Object.freeze([-0.55, -0.55, 0.62] as const), // screen x right, y down, z to the viewer
  ambient: 0.20,
  diffuse: 1.0,
  highlightGain: 0.5,
  shadowGain: 0.62, // fold shadows at 62 % of their lit depth: the art stays legible inside a trough
  specular: 0.30,
  shininess: 16,
  troughDarken: 0.10,
  saturation: 1.0,
  brightness: 0.94,
  blackFloor: 0.13, // DE black and the KR trigrams keep their folds on the dark ground
  haze: 0.05, // a touch of the ground colour in the cloth
  whiteCeiling: 0.88, // soft luminance shoulder: white fields stay below the hull's highlights
  hoistFeather: 0.10,
  flyFeather: 0 as number,
  // Pure horizontal-band flags (RU, DE tricolours; PL, UA bicolours, detected from the art) are drawn shorter so
  // the lowest band's centre line sits at `lowestBandCentreY` of the layer, above the hull's rear deck (r5 measured
  // RU red and DE gold at 0.1-1.4 % of the art box at 4x3). Flags with emblems keep their 4x3 art.
  bandFit: Object.freeze({ lowestBandCentreY: 0.36 }),
});

/** Per-facing flag layout: facing 'right' hoists off the left edge and fades its fly inside the card. */
export const HERO_FLAG_FACING = Object.freeze({
  left: Object.freeze({}),
  right: Object.freeze({ hoistX: -0.06, flyFeather: 0.3 }),
});

/** The shipped flag policy for a facing. */
export function heroFlagPolicy(facing: HeroFacing = HERO_CAMERA.facing): typeof HERO_FLAG {
  return Object.freeze({ ...HERO_FLAG, ...HERO_FLAG_FACING[facing] });
}

/**
 * The flag's feather, applied per card: an ellipse anchored at the rear-top corner (top-left for
 * facing 'right'), opaque inside `inner`, smoothstep to clear at its rim. Ratios of the flag box
 * (the card width by its art height plus a little), so CSS reproduces it exactly.
 */
export const HERO_FLAG_MASK = Object.freeze({
  anchorX: 0.96, // facing 'left'; mirrored (1 - x) for facing 'right'
  anchorY: 0.0,
  radiusX: 0.70,
  radiusY: 0.84,
  inner: 0.40,
  opacity: 0.94,
  selectedOpacity: 1.0,
  // The flag box ends this share of the name band above the card's bottom edge: its last fade runs under
  // the name floor, never behind the type.
  bandInset: 0.35,
});

/** Card copy rules: the name only (display face), no category eyebrow; nation is the flag, tier a chip. */
export const HERO_TYPE = Object.freeze({
  display: 'Chakra Petch',
  displayWeight: 600,
  data: 'IBM Plex Mono',
});

export type HeroFlagMask = typeof HERO_FLAG_MASK;

/** Mask stops: [t along the ellipse radius, alpha], a smoothstep from `inner` to the rim. */
export function flagMaskStops(mask: HeroFlagMask = HERO_FLAG_MASK): Array<[number, number]> {
  const stops: Array<[number, number]> = [[0, 1]];
  for (let i = 0; i <= 8; i++) {
    const t = mask.inner + (1 - mask.inner) * (i / 8);
    const x = i / 8;
    stops.push([Number(t.toFixed(4)), Number((1 - x * x * (3 - 2 * x)).toFixed(4))]);
  }
  return stops;
}

/** The runtime card's CSS mask-image for the same feather (the compositor applies flagMaskStops). */
export function heroFlagMaskCss(mask: HeroFlagMask = HERO_FLAG_MASK, facing: HeroFacing = HERO_CAMERA.facing): string {
  const pct = (ratio: number): number => Number((ratio * 100).toFixed(2));
  const ax = pct(facing === 'right' ? 1 - mask.anchorX : mask.anchorX);
  const stops = flagMaskStops(mask).map(([t, a]) => `rgba(0,0,0,${a}) ${(t * 100).toFixed(1)}%`).join(',');
  return `radial-gradient(ellipse ${pct(mask.radiusX)}% ${pct(mask.radiusY)}% at ${ax}% ${pct(mask.anchorY)}%,${stops})`;
}

/**
 * A tank layer's placement data, as fractions of the layer WIDTH (x and y alike, so one unit):
 * the dense core's centre, width, height and contact line, and the whole silhouette's x extent.
 */
export interface HeroTankBounds {
  readonly cx: number;
  readonly cw: number;
  readonly ch: number;
  readonly cb: number;
  readonly fx0: number;
  readonly fx1: number;
}

export interface HeroPlacementBox {
  readonly w: number;
  readonly artH: number;
  readonly baseline: number;
  readonly coreShare: number;
  readonly coreHeight: number;
  readonly centerX: number;
  /** The screen side the gun points to (the row's measured side; the policy's default when omitted). */
  readonly gunSide?: HeroFacing;
  readonly sideMargin?: number;
}

/** A core-centre ratio written for a gun pointing left, mirrored for a gun pointing right. */
export function heroCenterX(centerX: number, gunSide: HeroFacing = HERO_GUN_SIDE): number {
  return gunSide === 'right' ? 1 - centerX : centerX;
}

/**
 * Place a tank layer in a card: returns the drawn layer width `k` (px) and its top-left offset. The
 * dense core fills its share unless the whole tank (muzzle to rear stowage) would leave the card, so
 * the gun is never cut; the silhouette then slides (never scales) back inside the side margins. The
 * compositor draws with it and the runtime card's CSS evaluates the same expression in container units.
 */
export function placeTank(bounds: HeroTankBounds, box: HeroPlacementBox): { k: number; dx: number; dy: number } {
  const margin = box.w * (box.sideMargin ?? HERO_SIDE_MARGIN);
  const fullW = Math.max(1e-6, bounds.fx1 - bounds.fx0);
  const k = Math.min(
    (box.w * box.coreShare) / bounds.cw,
    (box.artH * box.coreHeight) / bounds.ch,
    (box.w - 2 * margin) / fullW,
  );
  const cx = heroCenterX(box.centerX, box.gunSide) * box.w;
  let dx = cx - bounds.cx * k;
  dx = Math.min(dx, box.w - margin - bounds.fx1 * k);
  dx = Math.max(dx, margin - bounds.fx0 * k);
  return { k, dx, dy: box.baseline - bounds.cb * k };
}

/** Split a display name into a solid part and a variant part (the last token) for the hollow treatment. */
export function nameParts(name: string): { solid: string; variant: string } {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return { solid: name, variant: '' };
  return { solid: tokens.slice(0, -1).join(' '), variant: tokens[tokens.length - 1] };
}
