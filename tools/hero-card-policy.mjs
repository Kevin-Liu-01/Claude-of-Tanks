// Tank hero card policy: one camera, one light rig, one framing rule and one flag
// treatment for every vehicle's roster/deploy/end-screen/Gallery/OG card.
// Shared by the GPU tank-layer page (tools/hero-cards-page.html), the CPU flag and
// card compositor (tools/hero-cards-compose.mjs) and the changed-only planner.
// Bumping HERO_POLICY_VERSION marks every card stale; anything else a card reads
// is fingerprinted per id (geometry, paint, flag), so unchanged ids never re-render.
// First-party tooling: Kevin B. Liu (NOTICE.md).

export const HERO_POLICY_VERSION = 2;

/**
 * Camera. Vehicle forward is local +Z. `facing: 'left'` puts the camera on the hull's
 * +X flank so the bow and gun extend toward screen-left: the canonical Garage hero
 * pose (src/game/garagePresentationPose.ts) and the roster convention the owner set
 * on 2026-09-20 ("make the tank images in the bottom carousel face left"). The owner's
 * 2026-10-17 reference faces right; "obv facing the right direction in the garage"
 * mirrors it to the Garage's left. Flipping the whole card set is this one field.
 */
export const HERO_CAMERA = Object.freeze({
  facing: 'left',
  // Between the showroom's own view (GARAGE_PRESENTATION_POSE: azimuth pi/4, pitch 6.3 deg) and the owner's
  // reference (about 60 deg, a low camera): the long flank and the gun read like the reference while the glacis
  // and turret face stay in view (the owner's fronts rule, 2026-10-05). Fixed by sample round r4 (45/50/55/60
  // on 16 vehicles): 45 foreshortens the gun in the small cards, 55+ shrinks long-gun tanks (the gun sets the fit).
  azimuthDeg: 50,
  elevationDeg: 5,
  fovDeg: 20, // a long lens: little perspective swell on the glacis
  gunElevationDeg: 3, // "gun forward and slightly up"; clamped to the spec's elevation limit
  margin: 1.06,
});

/**
 * Studio light rig (three units). Positions are relative to the tank centre, in metres, for facing 'left'
 * (+X is the camera's flank, +Z the bow). A product-shot rig: the key stands high over the bow so the roof and
 * glacis catch it and the flank falls a step darker (the r3 rig keyed from the camera and flattened the hull);
 * its shadow stays a compact contact shadow under the tracks. A cool fill from the camera side holds the flank,
 * the rim draws the rear and the roof line against the dark ground.
 */
export const HERO_LIGHTS = Object.freeze({
  exposure: 1.15, // r4 judged 1.05 a step dark for dark camo on the steel ground in the 168 px roster card
  environmentIntensity: 0.4,
  hemisphere: Object.freeze({ sky: 0xdfe8f2, ground: 0x262c33, intensity: 0.4 }),
  key: Object.freeze({ color: 0xfff1e0, intensity: 3.4, position: [2.5, 12, 7], shadow: true }),
  fill: Object.freeze({ color: 0xcfe0ff, intensity: 0.7, position: [9, 2.5, -1.5] }),
  rim: Object.freeze({ color: 0xffffff, intensity: 3.2, position: [-5, 6, -9] }),
  kicker: Object.freeze({ color: 0xa9c8ff, intensity: 1.0, position: [-8, 2.5, 7] }),
  groundShadowOpacity: 0.55,
  // The floor shadow becomes a soft pool under the hull (ratios of the dense core): blurred by blurRatio of the
  // core width, kept inside an ellipse centred liftRatio above the contact line, so the barrel never draws a line.
  contactShadow: Object.freeze({ blurRatio: 0.018, opacity: 0.95, radiusX: 0.66, radiusY: 0.30, liftRatio: 0.02, inner: 0.45 }),
});

/**
 * Tank layer framing. The master layer is a transparent 16:10 canvas. The dense core
 * (portraitFraming's alpha-weighted quantiles, blind to antennas and whips) fills
 * `coreWidthRatio` of the width; the track contact line sits on `baselineRatio`;
 * the core centre sits at `centerXRatio`, leaving the gun room on the bow side.
 */
export const HERO_FRAME = Object.freeze({
  width: 1600,
  height: 1000,
  supersample: 2,
  coreWidthRatio: 0.70,
  coreHeightRatio: 0.66,
  baselineRatio: 0.86,
  centerXRatio: 0.54, // mirrored (1 - x) for facing 'right'
  edgeClearPx: 6, // every solid pixel (alpha > 8) stays this far inside the layer
  // Rows holding fewer opaque pixels than this share of the silhouette width are whips and thin masts:
  // they never shrink the tank to fit. They may rise into the top band, which fades them out, so no
  // card ever shows an antenna cut by the layer's edge.
  solidRowShare: 0.02,
  whipFadeRatio: 0.07,
});

/**
 * Card geometry (CSS px at 1x). The art box is the card minus the name band.
 * Rungs are the encoded widths of the tank layer and the flag layer.
 */
export const HERO_CARD_SIZES = Object.freeze({
  roster: Object.freeze({ width: 168, height: 132, nameBandPx: 30, rungs: [336, 504] }),
  rosterCompact: Object.freeze({ width: 112, height: 92, nameBandPx: 22, rungs: [224, 336] }),
  deploy: Object.freeze({ width: 360, height: 240, nameBandPx: 58, rungs: [720] }),
  galleryBrowse: Object.freeze({ width: 264, height: 188, nameBandPx: 40, rungs: [528] }),
  endScreen: Object.freeze({ width: 560, height: 360, nameBandPx: 90, rungs: [1120] }),
  og: Object.freeze({ width: 1200, height: 630 }),
});

/**
 * Shipped widths (px) of the transparent tank layer (16:10, master framing) and the flag layer.
 * 480 serves the roster, compact and Gallery-browse cards at 1x and 2x; 960 the deploy and
 * end-screen cards at 2x. Every card places the layer itself from its row in the hero manifest.
 */
export const HERO_RUNGS = Object.freeze({ tank: Object.freeze([480, 960]), flag: Object.freeze([480, 960]) });

/**
 * Card ground (the colour the flag fades into). `steel` is the owner's reference
 * look (a deep steel blue, sampled #014061 there) pulled toward Premiere graphite
 * so the hull stays the most saturated thing; it ends in graphite-850 under the
 * name so the card joins the UI chrome. `graphite` is the plain Premiere ground.
 */
export const HERO_GROUNDS = Object.freeze({
  steel: Object.freeze({ top: '#0f3a55', mid: '#0b2a3e', bottom: '#0b0e11', lift: 'rgba(120,170,205,0.14)' }),
  graphite: Object.freeze({ top: '#1a2633', mid: '#121a23', bottom: '#0b0e11', lift: 'rgba(120,150,180,0.16)' }),
  reference: Object.freeze({ top: '#014061', mid: '#014061', bottom: '#014061', lift: 'rgba(0,0,0,0)' }),
});
export const HERO_GROUND = HERO_GROUNDS.steel;

/**
 * Flag cloth (one layer per nation, the shipped flag-icons 4x3 art). The owner's
 * reference faces right with the flag top-left behind the rear half, fading toward
 * the gun and the floor. Mirrored for the Garage's left-facing tanks, the flag sits
 * top-right behind the rear half and fades toward the gun (screen-left) and the
 * floor. The obverse always faces the viewer (canton at the hoist, tricolours in
 * their own order), so the hoist lies toward the gun, under the feather, and the
 * fly runs off the card's far edge.
 *
 * `layout`: 'mirror' (shipped), 'stream' (a free patch with a visible hoist, fading
 * toward the fly) and 'reverse' (the reference mirrored outright: the flag's reverse
 * face, canton top-right) are kept for the sample boards only.
 *
 * The cloth is a height field of travelling waves whose amplitude grows from the
 * hoist to the fly; analytic normals, one raking light, a satin sheen. The layer
 * carries no feather: the card applies HERO_FLAG_MASK (the compositor here, CSS
 * mask-image in the Garage), so one flag layer serves every card aspect.
 */
export const HERO_FLAG = Object.freeze({
  width: 1600,
  height: 1000,
  layout: 'mirror',
  // Flag rectangle inside the layer before the wave, as ratios of the layer. The whole
  // flag height fits the feather's reach, so horizontal tricolours (DE, RU, PL, UA)
  // show every band; the fly runs off the far edge.
  hoistX: 0.42, // the folds shorten the cloth ~9 %: the fly still clears the far edge
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
  light: Object.freeze([-0.55, -0.55, 0.62]), // screen x right, y down, z to the viewer: the tank key's side (camera-left, high)
  ambient: 0.20,
  diffuse: 1.0,
  highlightGain: 0.5,
  shadowGain: 0.62, // fold shadows at 62 % of their lit depth: the art stays legible inside a trough
  specular: 0.30,
  shininess: 16,
  troughDarken: 0.10,
  saturation: 1.0,
  brightness: 0.94,
  blackFloor: 0.13,
  haze: 0.05, // a touch of the ground colour in the cloth
  whiteCeiling: 0.88, // soft luminance shoulder: white fields (KR, JP, IL, PL, US stripes) stay below the hull's highlights
  hoistFeather: 0.10,
});

/**
 * The flag's feather, applied per card: an ellipse anchored at the rear-top corner
 * (top-right for facing 'left'), opaque inside `inner`, smoothstep to clear at its
 * rim. Ratios of the card box, so CSS reproduces it exactly:
 *   mask-image: radial-gradient(ellipse 70% 84% at 96% 0%, ...HERO_FLAG_MASK stops)
 */
export const HERO_FLAG_MASK = Object.freeze({
  anchorX: 0.96, // mirrored (1 - x) for facing 'right'
  anchorY: 0.0,
  // r4: wider and shorter, like the reference: the flag reaches toward the turret along the top and is
  // gone by the hull's deck line, so the running gear sits on plain ground.
  radiusX: 0.70,
  radiusY: 0.84,
  inner: 0.40,
  opacity: 0.94,
  selectedOpacity: 1.0,
});

/** Card copy rules: the name only (display face), no category eyebrow; nation is the flag, tier a numeral chip. */
export const HERO_TYPE = Object.freeze({
  display: 'Chakra Petch',
  displayWeight: 600,
  data: 'IBM Plex Mono',
});
