/**
 * vehicleGroundOcclusion.ts — 2026-10-03 (the skies-and-atmosphere lane, which the gauntlet's wave 0 handed light,
 * colour and atmosphere: "no ambient occlusion"; "the grass in the tank's shadow ... reads as a hole in the ground").
 *
 * The ground's sky light under and beside the near hulls, inside the aerial pass. Scene-wide GTAO stays off on every
 * tier by the owner's choice (2026-09-28, quality.ts: its speckled crevice wash over terrain and foliage), so this is
 * analytic: no screen-space search, no noise, nothing but the ground around the few hulls the shadow router already
 * selects each frame (nearVehicleShadowDetail.ts: the nearest four within 70 m). The term dims only the pixel's
 * ambient share, as the vehicle cavity term does (vehicleOcclusion.ts): colour · (1 − occ · A / (T + A)), the sun term
 * T and the ambient A the light rig gives the pixel's depth normal (contactShadows.ts) — sunlit ground beside a hull
 * keeps its sun, the ground in the hull's own shadow (T = 0) takes the whole darkening. A grass or leaf card (its
 * alpha is its coverage, no sun state) takes a fixed ambient share in the open and the whole of it under a belly. Vehicle pixels are never receivers (their own
 * cavities are vehicleOcclusion.ts's). The term fades out over the selection's last 20 m.
 *
 * 2026-10-03 (the vehicle-ground lane, wave 13: "a strip of fully-lit snow under the belly makes the vehicle look like it
 * hovers", on the PR head and with this module on alike). Two causes, both measured:
 *  - the multi-bounce term ran Jimenez et al.'s fit (2016) on the MAP's ground albedo. That fit assumes the occluding
 *    cavity has the receiver's albedo; under a hull the occluder is the dark, dirty belly. On snow (ρ 0.8) it kept 0.37
 *    of the sky at the belly's middle and 0.81 at its rear edge, the strip a chase camera sees under the rear plate;
 *  - the old under-belly law saw the sky through two side gaps at a fixed 0.45 m clearance, which the running gear
 *    closes, and stopped at 0.85: 0.3 m inside the rear edge it hid 0.65 of the sky where the hull hides 0.79.
 *
 * Geometry, exactly. Each hull is one convex solid in its own (root) frame, measured once from the built visual: the
 * shadow proxy's width, length and deck over its lower profile — the measured hull-pan floor along the belly, rising
 * linearly under the sloped end plates (a least-squares hinge fitted to the proxy's underside). The share of a
 * receiver's cosine-weighted sky a convex solid hides is its projected solid angle over π, Lambert's edge integral over
 * its silhouette: each edge between a face turned to the receiver and one turned away, counted once. It is exact while
 * the solid stands above the receiver's horizon, so the solid is clipped at the receiver's height (the clip relaxes as
 * the normal tilts toward a wall). The runs are not separate occluders: from beside or beyond a hull every ray through a
 * run goes on into the hull's belly (summing the two hid 0.65 of the sky 0.3 m beside a T-90M's track where the union
 * hides 0.44). They add only the side gaps a receiver between them would see under the hull's edges: the part of each
 * run below the plane through the receiver and that edge, which closes as the receiver nears the run. The receipt pins
 * the law against a brute-force union of the hull and both runs.
 *
 * Interreflection, first order. A blocked direction does not see black: it sees the occluder, whose radiance relative
 * to the sky's is r = ρ_hull · E_face / A_up; the occluder hides (1 − r) of what it covers. The belly sees mostly the
 * shaded ground under itself and, through its openings and the road-wheel gaps, a share of the lit open ground:
 *   r_belly = ρ_hull · ρ_ground · (v · (1 + k) + (1 − v) · u)
 * and a wall sees half sky, half ground (half of it in the hull's own shadow):
 *   r_wall  = ρ_hull · (½ + ½ · ρ_ground · (1 + ½ k))
 * with k = T / A_up of open flat ground (the rig's sun over its sky), v = GROUND_AO_BELLY_VIEW, u = GROUND_AO_UNDER_GROUND.
 * Snow (ρ 0.8, k ≈ 0.65) keeps 0.88 of the belly's occlusion and 0.74 of the walls'; sunny sand (ρ 0.34, k ≈ 6.5)
 * 0.81 and 0.70. The two strengths blend across the footprint's edge (± GROUND_AO_EDGE_M). Photographs of hulls on sand
 * put the belly at about 0.07–0.16 of the sunlit ground in display light (the lane's fp9 note): through the AgX curve the
 * belly's middle here lands at 0.06–0.10. `vehicleGroundOcclusionLocal` is the CPU twin the receipts pin against the GLSL.
 */
import * as THREE from 'three';
import { lightTune } from './lightModelCore.ts';
import { groundKeyLights } from './groundKeyLights.ts';
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';

/** At most this many hulls (the shadow router's near selection: NEAR_VEHICLE_SHADOW_MAX). */
export const GROUND_AO_MAX_HULLS = 4;
/** The selection's range (m) and the fade over its last stretch. */
export const GROUND_AO_RANGE_M = 70;
export const GROUND_AO_FADE_M = 20;
/** A card pixel's assumed ambient share (its sun state is unknown: a meadow half in sun, half in shade). */
export const GROUND_AO_CARD_AMBIENT_SHARE = 0.6;
/** The ground albedo without a grounded light model (atmosphere.ts's default ground). */
export const GROUND_AO_DEFAULT_ALBEDO = 0.25;
/** The hull's own albedo — dusty paint, the belly's grime, the runs' rubber and steel. */
export const GROUND_AO_HULL_ALBEDO = 0.25;
/** The share of the belly's view that is lit open ground: the openings fore and aft between the runs, the road-wheel gaps. */
export const GROUND_AO_BELLY_VIEW = 0.3;
/** The shaded ground under the belly (the rest of its view) relative to open ground. */
export const GROUND_AO_UNDER_GROUND = 0.15;
/** A hull's reach fades out between these multiples of its height (deck over the contact plane) from its footprint. */
export const GROUND_AO_REACH = Object.freeze([1.5, 3] as const);
/** The belly's and the walls' strengths blend across the footprint's edge over ± this (m). */
export const GROUND_AO_EDGE_M = 0.25;
/** The receiver's horizon clip drops this far (m) per unit of normal tilt: a wall facing a hull keeps the whole solid. */
export const GROUND_AO_CLIP_SLACK_M = 4;
/**
 * A pixel within this far (m) of the hull's footprint and over its belly is the hull itself — a marking decal or glass
 * blended over it, whose alpha no longer carries the vehicle tag (vehicleOcclusion.ts) — and is never a receiver.
 */
export const GROUND_AO_HULL_SKIN_M = 0.12;
/**
 * The track shoes are the vehicle too, but their cloned material never joins the cascade setup, so it writes neither the
 * vehicle tag nor a sun state: to this block a shoe is a pixel without a sun state (a card's alpha) in the shoes'
 * measured lane (widened by GROUND_AO_LANE_MARGIN_M for their faces), within the hull's length, under the deck and over
 * the track's lower edge — the contact plane (less GROUND_AO_SHOE_FLOOR_M's centimetre) along the ground run, the wraps'
 * measured ramp past it (less GROUND_AO_RAMP_TOL_M). A lit pixel (the terrain) is never a shoe (lab6, 2026-10-03: snow
 * standing over a height threshold behind a pitched hull's track ends was skipped and stayed lit; a shoe's foot darkened
 * as ground drew a black line under lab8's tracks), and grass under a wrap's ramp stays a receiver. Where the run meets
 * the ground the shoes cover it (seen through their gaps and at their foot, the track's contact line): it keeps no sky.
 *
 * 2026-10-08 (the contact-shadow lane; the owner: "fix the contact shadows for tracks on ground which are staticly on
 * ground and look bad"): that contact used to be a rigid print of the rest pose — every ground pixel in the shoe lane
 * along the run was black (a 5 mm edge), however far under the track it lay, and the darkness faded only 0.3 m past the
 * run's ends. On a crest or over a hollow, where the run lifts off, a track-wide black rectangle slid over the ground
 * with the hull. The contact now follows the run as it is drawn this frame: the track's lower edge is the rest floor plus
 * the road wheels' travel (the band's bottom run follows it; runningGearGroundRun in tankFactoryCore.ts, sampled at
 * GROUND_AO_RUN_KNOTS knots per side), the wraps' ramp past it, and a ground pixel is dark by its gap under that edge:
 * whole at contact (within GROUND_AO_CONTACT_FULL_M), gone GROUND_AO_CONTACT_GAP_M under it; the lane's edges soften
 * over GROUND_AO_CONTACT_EDGE_M either side of the shoes' faces (the crease beside a track is darker than open ground,
 * never a ruled line). The sky the hull solid hides from the ground under a lifted run stays the solid's (its terms read
 * each pixel's own height), and the side gaps between the runs open under a lifted run (runGapOcclusion stands each run
 * on its drawn lower edge). A thrown track's side meets no ground (GROUND_AO_NO_RUN_M).
 */
const GROUND_AO_CONTACT_MARGIN_M = 0.03;
const GROUND_AO_SHOE_FLOOR_M = -0.01;
const GROUND_AO_RAMP_TOL_M = 0.03;
const GROUND_AO_LANE_MARGIN_M = 0.02;
/**
 * A track's contact darkness is whole while the ground lies within GROUND_AO_CONTACT_FULL_M under the run's lower edge
 * (the shoes' grousers and pads, the terrain's facets: on the battle maps the drawn run stands within ±4 cm of the
 * rendered ground, p05–p95 over 144 run samples of eight hulls, the contact lane's 2026-10-08 probe) and gone where it
 * lies GROUND_AO_CONTACT_GAP_M under it.
 */
export const GROUND_AO_CONTACT_FULL_M = 0.02;
export const GROUND_AO_CONTACT_GAP_M = 0.1;
/** The contact's ends soften over this far (m) inside the hull's ends. */
export const GROUND_AO_CONTACT_EDGE_M = 0.05;
/**
 * 2026-10-09 (the costland lane, contact round 3; the owner on production 207: "also see these super super dark
 * rectangular shadows under tracks?? fix this"). The contact hid the receiver's whole sky: the ground it reached under a
 * run went near black (the belly's strength over the whole share: 0.1–0.15 of the shaded ground), well past the hull
 * solid's own share there (0.5–0.6 at the footprint's edge, where the runs stand), so the lane read as a pasted dark slab
 * — on production a ruled rectangle (a 5 mm edge, black at any depth, 0.3 m past the run's ends). The contact is now a
 * soft rim hugging the drawn run: at most GROUND_AO_CONTACT_MAX of the sky; whole inside the shoes' lane and falling to
 * nothing GROUND_AO_CONTACT_SPREAD_M outside its faces (squared: the crease at the track's foot, never a band); by the
 * receiver's height against the run's drawn lower edge — the ground under a lifted run gone GROUND_AO_CONTACT_GAP_M under
 * it, a grass blade or the ground standing into a sunk run gone GROUND_AO_CONTACT_RISE_M over it; its ends at the hull's.
 * It joins the solid's share by the larger of the two, never their sum (no stacking), and like it dims only the pixel's
 * ambient share (sunlit ground beside the track keeps its sun).
 */
export const GROUND_AO_CONTACT_MAX = 0.6;
/**
 * 2026-10-10 (round 3, the same report): the whole darkening a receiver takes from every near hull together never passes
 * this share of its sky, so the ground in a hull's own shadow keeps at least (1 − GROUND_AO_OCC_MAX) of its sky light — the
 * ground under a belly seen between the road wheels read near black (0.03–0.08 of the shaded ground on the 207 frames: the
 * solid's share under the belly times its strength). The per-hull law below is the geometry's; the cap is applied once, on
 * the hulls' joint share (combineVehicleGroundOcclusion, the GLSL's occ), so overlapping hulls never stack past it. 0.55:
 * the ground in the hull's own shadow keeps at least 0.45 of its sky light — darker than the open shadow, never black (at
 * 0.7 the strip under a skirt, sun-shadowed and all ambient, still read 0.3 of the shadow beside it).
 */
/**
 * 2026-10-10 (round 4; the owner's recovered screenshot — an elevated rear quarter on grass, "super super dark rectangular
 * shadows under tracks"): from that camera the ground under a hull's rear overhang and along its runs read as a slab. Measured
 * on the owner's framing (leo2a6_ua and ua_m1a1_x, Verdant day): main 62b 10 luma (0.12–0.25 of the turf around it, a 2.8–3.8×
 * step at its edge), round 3's 0.55 cap 17–20 (0.21–0.42, 2.0–2.2×), 0.35 25–28 (0.27–0.61, 1.4–1.8×; the hull's own
 * sun-shadow edge alone, with no occlusion, is 1.3–1.5×). At 0.35 the ground under a belly keeps 0.65 of its sky: no longer
 * the darkest thing in the frame, still a quarter darker than the shade beside it, so the hull sits on the ground; the
 * crease's core (GROUND_AO_CORE_MAX, past the cap) holds the contact line.
 */
export const GROUND_AO_OCC_MAX = 0.35;
/**
 * Round 4, the other side (snow, the coordinator's check): a bright ground under a dark belly never reads near black — on
 * winter main's under-hull shade was 0.64–0.74 of the open snow — and both critics on wave 340 asked for more of it there
 * ("the snow between the wheels as bright as open snow"), so on snow (the receiver's own snow cover since contact r2) the cap rises to GROUND_AO_OCC_MAX_SNOW and
 * the broad share keeps itself whole (GROUND_AO_WALL_SOFT → 1): at 0.35 and 0.7 the winter hulls' under-hull shade read 0.84–0.86
 * of the open snow and lifted off it.
 */
export const GROUND_AO_OCC_MAX_SNOW = 0.8;
/*
 * 2026-10-14 (the engine-cs lane; media wave f1, 27 of 63 "hull hovers: no contact shadow" notes on Frosthollow and
 * Whiteout): the cap is a floor on the RATIO of the light a receiver keeps, and the slab it answers was dark ground; in
 * absolute terms snow under its cap keeps what ordinary ground keeps under its own: (1 − 0.8) · 0.8 ≈ (1 − 0.35) · 0.25
 * (0.16), about the geometry's own share under a snowy belly (0.87 hidden after the interreflection). Contact r2: the snow
 * weight is each receiver's own snow cover, which the terrain writes into the scene alpha with its sun visibility
 * (terrain.ts cotSnowCover, engine/sceneAlpha.ts): Alpine's snowfields take the snow law, a yard or a rock rib on Frosthollow
 * keeps the ordinary one, and every pixel that is not snowy terrain keeps it to the bit. uVehGroundSnow is the law's
 * switch (1; __LIGHT_TUNE.GROUND_AO_SNOW = 0 restores the ordinary law for an A/B frame).
 */
/**
 * 2026-10-11 (contact round 5; wave 372b, both critics on winter: "the snow in the gaps under the hull is as bright as open
 * snow"): through the road-wheel gaps the snow under a belly measured 0.81 (round 3) and 0.73 (round 4's 0.65 cap) of the
 * shaded open snow in display — snow's ambient is so large that a near-black slab cannot happen there — so the snow cap is
 * 0.8 (above), and the shade on snow takes a cool cast: the colour multiplier is tinted toward GROUND_AO_SNOW_COOL by the
 * darkening it applies (cotVehicleGroundShadeRgb), the sky-blue of a shadow on snow.
 */
export const GROUND_AO_SNOW_COOL = Object.freeze([0.9, 0.97, 1.1] as const);
/**
 * Round 5 (wave 372b, both critics on Verdant: "a lime grass blade glows unshadowed under the hull between the centre
 * wheels"): the block used to skip every pixel without a sun state inside a run's lane over its lower edge as one of the
 * hull's own track shoes (their cloned material wrote neither a sun state nor the vehicle tag). Since the vehicle-look lane's
 * 2026-10-04 fix the shoes join the link material's cascade registration and carry the vehicle tag (tankFactoryCore.ts padMat),
 * so they are vehicle pixels and never reach this block; the skip only exempted the grass and leaf cards standing in the
 * running gear, which rendered untouched — lime blades in the gaps between the road wheels under the hull. The skip is gone
 * (the lever GROUND_AO_SHOE_SKIP restores it for an A/B frame). A card inside a run's lane along its ground run stands in the
 * running gear's own shade — the band, the wheels and the hull close round it — and its darkening may reach
 * GROUND_AO_GEAR_CAP; the ground, and every card outside the gear, keep the joint cap (the owner's slab).
 */
export const GROUND_AO_GEAR_CAP = 0.75;
/**
 * Round 5 (wave 372b: "the tracks rest on untouched snow: no rut, no packed snow", "a hard-edged dark band under the track",
 * "no sinkage"): the contact blend. A vehicle pixel within GROUND_AO_BLEND_H_M (GROUND_AO_BLEND_H_SNOW_M on snow) over a
 * run's lower edge, in its lane along the ground run, takes up to GROUND_AO_BLEND_MAX (…_SNOW) of the colour of the ground
 * GROUND_AO_BLEND_OUT_M beyond the run's outer face at its foot — the pre-pass scene there, shaded as this block shades it —
 * so the track's foot reads set into the turf or packed with snow rather than a rail resting on a dark band. Never a vehicle
 * pixel's colour: a sample that lands on a hull is skipped. Presentation only.
 */
export const GROUND_AO_BLEND_H_M = 0.03;
export const GROUND_AO_BLEND_H_SNOW_M = 0.06;
export const GROUND_AO_BLEND_MAX = 0.6;
export const GROUND_AO_BLEND_MAX_SNOW = 1;
export const GROUND_AO_BLEND_OUT_M = 0.06;
/**
 * Round 5 (the lane's own frames, 2026-10-11 13:00: a translucent 0.85 gradient over 7 cm read as a pale film painted over the
 * shoes, not snow): on snow the blend is packed snow round the track's foot — opaque over GROUND_AO_BLEND_SNOW_SOLID of its
 * height, a soft edge above, and an uneven line: its height runs GROUND_AO_BLEND_SNOW_VARY either side along the ground
 * (snowBlendNoise, smooth and world-anchored, so a moving hull drives through a fixed snow line).
 */
export const GROUND_AO_BLEND_SNOW_SOLID = 0.55;
export const GROUND_AO_BLEND_SNOW_VARY = 0.45;

/** Round 5: the snow line's unevenness at a world point, 0..1 — three smooth sines along the ground (no per-pixel noise). */
export function snowBlendNoise(x: number, z: number): number {
  return clamp01(0.5 + 0.22 * Math.sin(1.9 * z + 0.7 * x + 1.7) + 0.16 * Math.sin(4.7 * z - 1.3 * x + 0.4)
    + 0.12 * Math.sin(9.3 * z + 2.1 * x + 2.2));
}
export const GROUND_AO_CONTACT_SPREAD_M = 0.15;
export const GROUND_AO_CONTACT_RISE_M = 0.25;
/**
 * 2026-10-10 (contact round 4, the costland lane; both critics on wave 340, nearly every view: "no thin dark contact line
 * where the track meets the turf", the Garage's "only a soft uniform smudge"): the crease where a run's shoes meet the
 * ground. A narrow core along the shoes' faces — GROUND_AO_CORE_MAX of the sky, whole over GROUND_AO_CORE_FLAT of its width
 * and gone GROUND_AO_CORE_W_M outside a face, whole while the ground lies within GROUND_AO_CORE_GAP_M of the run's lower edge
 * as drawn (the broad share beside a run already reaches the cap within a centimetre of its face: a squared core read only
 * there) — is the one term the
 * joint cap leaves (a few centimetres wide it is a line, never a slab); like the rest it dims only the ambient share.
 */
export const GROUND_AO_CORE_MAX = 0.75;
export const GROUND_AO_CORE_W_M = 0.045;
/** The core keeps its whole strength over this share of its width from a face (the crease), then falls to its edge. */
export const GROUND_AO_CORE_FLAT = 0.4;
export const GROUND_AO_CORE_GAP_M = 0.03;
/**
 * 2026-10-14 (the engine-cs lane; media wave f1: "hull hovers: no contact shadow under the tracks" on Frosthollow and
 * Whiteout): on snow a run's foot stands sunk in a groove of packed snow, and the cascades' bias leaves it lit. By the
 * receiver's own snow cover the core is whole out to GROUND_AO_CORE_FULL_SNOW_M from a face and gone at
 * GROUND_AO_CORE_W_SNOW_M (a line still, a few centimetres wider), over the rim's vertical reach (the ground under a sunk
 * or lifted run on uneven snow) rather than GROUND_AO_CORE_GAP_M. Past the cap like the core: on snow the cap's ratio
 * leaves the crease too little to read.
 */
export const GROUND_AO_CORE_FULL_SNOW_M = 0.02;
export const GROUND_AO_CORE_W_SNOW_M = 0.09;
/**
 * Round 4: the shoe band's own sun shadow. The cascades' depth bias lifts a hull's shadow off its contact, so on a run's
 * shade side the crease stood sunlit. The band — the run's lower edge to GROUND_AO_BAND_H_M over it, along the ground run
 * — shades a receiver up to GROUND_AO_BAND_REACH_M beyond its outer face where the ray toward the sun crosses that face
 * under the band's top (a penumbra of GROUND_AO_BAND_PEN_M, widening GROUND_AO_BAND_PEN_PER_M per metre out). It removes
 * only the sun share, and only where the cascades left one.
 */
export const GROUND_AO_BAND_H_M = 0.1;
export const GROUND_AO_BAND_REACH_M = 0.6;
export const GROUND_AO_BAND_PEN_M = 0.006;
export const GROUND_AO_BAND_PEN_PER_M = 0.04;
/**
 * Round 4 (wave 340: "a uniformly dark, carpet-like turf ... with no gradient of occlusion from the contact outward"): the
 * broad share a hull's solid and side gaps cast outside its footprint keeps this much of itself; the rim and the core hold
 * the contact, the broad term falls away from it. Under the belly the share is whole.
 */
export const GROUND_AO_WALL_SOFT = 0.7;
/**
 * Round 4 (wave 340 on winter, every view: "no rut, berm or packed snow ... a perfectly flat, evenly bright snow plane"):
 * on snow the shoes' outer faces push up a berm GROUND_AO_BERM_H_M high over GROUND_AO_BERM_W_M (a parabola, its crest
 * halfway); its slopes turn the sun share — the lip toward the sun lit, the slope away shaded — along the ground run.
 * Snow is a ground albedo over GROUND_AO_SNOW_ALBEDO (whole 0.15 over it).
 */
export const GROUND_AO_BERM_H_M = 0.04;
export const GROUND_AO_BERM_W_M = 0.22;
export const GROUND_AO_SNOW_ALBEDO = 0.55;
/**
 * Round 4 (wave 340: "the track run is lit lighter and more metallic than the dark turf beneath it", "no mud on the
 * links"): a vehicle pixel in a run's lane (its faces widened GROUND_AO_GRIME_LANE_M) within GROUND_AO_GRIME_H_M of the
 * run's lower edge darkens toward the foot by up to GROUND_AO_GRIME_MAX (squared), the dirt a run carries; none on snow.
 */
export const GROUND_AO_GRIME_H_M = 0.2;
export const GROUND_AO_GRIME_MAX = 0.3;
export const GROUND_AO_GRIME_LANE_M = 0.03;
/** The drawn run's travel reaches the shader at this many knots evenly along each ground run (linear between; two vec4). */
export const GROUND_AO_RUN_KNOTS = 8;
/** At most this many road wheels a side are read from the gear (runningGearGroundRun; two units a side on a four-track). */
const GROUND_AO_RUN_WHEELS = 32;
/** The travel (m) a side carries whose run meets no ground (a thrown track: its band is hidden) — no contact, no shoe,
 * no side gap closed there. */
export const GROUND_AO_NO_RUN_M = 10;
/** The wraps' rise per metre past the ground run where no shoe measures it. */
const GROUND_AO_RAMP_FALLBACK = 0.6;
/** The wraps reach this far (m) past the shoes' measured ends. */
const GROUND_AO_RUN_END_M = 0.04;
/**
 * Past the ground run (where the lane beyond a run's inner face is ground, under the wrap's ramp, which the solid does
 * not carry) the side-gap closure fades in over this far (m) from that face, so the two sides meet without a step.
 */
export const GROUND_AO_GAP_FADE_M = 0.1;
/** A shoe on the ground run stands within this (m) of the lowest shoe. */
const GROUND_AO_SHOE_GROUND_M = 0.025;
/** The proxy's underside is sampled at this many points along its length (each at three points across the belly). */
const GROUND_AO_PROFILE_SAMPLES = 48;
/** Fallbacks for a hull without measured contact geometry or shoes: the belly's clearance and a run's width (m). */
const GROUND_AO_CLEARANCE_M = 0.45;
const GROUND_AO_TRACK_WIDTH_M = 0.6;

export interface Vec3Like { x: number; y: number; z: number; }

/** A hull's solid and its runs in its root frame (metres). */
interface VehicleGroundHull {
  /**
   * The hull: |x| ≤ hx, fz0 ≤ z ≤ fz1, from its lower profile up to the deck yt. The profile: the belly yb along
   * pz0..pz1, rising hr per metre behind pz0 and hf per metre ahead of pz1 (the sloped end plates).
   */
  readonly hx: number; readonly yb: number; readonly yt: number; readonly fz0: number; readonly fz1: number;
  readonly pz0: number; readonly pz1: number; readonly hr: number; readonly hf: number;
  /**
   * The contact plane y0 and the runs: the shoes' lane xi ≤ |x| ≤ xo along tz0..tz1, their ground run cz0..cz1, the
   * wraps' lower edge rising sr per metre behind the run and sf ahead of it.
   */
  readonly y0: number; readonly xi: number; readonly xo: number;
  readonly tz0: number; readonly tz1: number; readonly cz0: number; readonly cz1: number; readonly sr: number; readonly sf: number;
}

interface VehicleGroundStrengths { readonly belly: number; readonly wall: number; }

/**
 * The ground runs as drawn this frame (root frame): per side (left: x < 0) the run's lower edge over the contact plane at
 * GROUND_AO_RUN_KNOTS knots evenly over the ground run cz0..cz1 — the road wheels' travel the band's bottom run follows
 * (tankFactoryCore.ts runningGearGroundRun), GROUND_AO_NO_RUN_M where no run meets the ground. Absent: the rest pose.
 */
interface VehicleGroundRuns { readonly left: ArrayLike<number>; readonly right: ArrayLike<number>; }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const INV_2PI = 1 / (2 * Math.PI);

/** One silhouette edge of Lambert's edge integral: the angle it subtends times the normal's share of its plane (a and b
 * are the edge's ends relative to the receiver; their lengths cancel). */
function edgeTerm(a: readonly number[], b: readonly number[], n: Vec3Like): number {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  const s = Math.hypot(cx, cy, cz);
  return s > 1e-9 ? Math.atan2(s, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * (n.x * cx + n.y * cy + n.z * cz) / s : 0;
}

/** Quilez's silhouette hexagon: the corner pattern of each vertex (times the corner nearest the receiver). */
const HEXAGON: readonly (readonly [number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z'])[] = [
  [1, 1, -1], [1, 'x', 'x'], [1, -1, 1], ['z', 'z', 1], [-1, 1, 1], ['y', 1, 'y'],
];

/**
 * The share of a receiver's cosine-weighted sky a box hides (its projected solid angle over π): the receiver at q
 * relative to the box's centre with unit normal n, r the box's half extents. Lambert's edge integral over the box's
 * silhouette hexagon, signed by the octant's mirror parity and clamped to [0, 1] — exact while the box stands above the
 * receiver's horizon.
 */
export function boxSkyOcclusion(q: Vec3Like, n: Vec3Like, r: Vec3Like): number {
  const sx = q.x >= 0 ? 1 : -1, sy = q.y >= 0 ? 1 : -1, sz = q.z >= 0 ? 1 : -1;
  const inside = { x: r.x >= Math.abs(q.x) ? 1 : -1, y: r.y >= Math.abs(q.y) ? 1 : -1, z: r.z >= Math.abs(q.z) ? 1 : -1 };
  const f = [r.x * sx, r.y * sy, r.z * sz];
  const at = (k: number | 'x' | 'y' | 'z'): number => (typeof k === 'number' ? k : inside[k]);
  const verts = HEXAGON.map((p) => [at(p[0]) * f[0] - q.x, at(p[1]) * f[1] - q.y, at(p[2]) * f[2] - q.z]);
  let k = 0;
  for (let i = 0; i < 6; i++) k += edgeTerm(verts[i], verts[(i + 1) % 6], n);
  return clamp01(k * sx * sy * sz * INV_2PI);
}

/**
 * The hull solid's 12 corners — per side (R: +x, L: −x) the deck's rear and front (T0, T1), the front end's foot (E1),
 * the belly's front and rear ends (P1, P0), the rear end's foot (E0) — and its 18 edges, each counter-clockwise for its
 * first face seen from outside, the second face beyond it. An edge is on the silhouette when exactly one of its faces is
 * turned to the receiver; the GLSL is generated from this table.
 */
type HullCorner = 'T0R' | 'T1R' | 'E1R' | 'P1R' | 'P0R' | 'E0R' | 'T0L' | 'T1L' | 'E1L' | 'P1L' | 'P0L' | 'E0L';
type HullFace = 'Top' | 'Bot' | 'Rend' | 'Fend' | 'Right' | 'Left' | 'Rpl' | 'Fpl';
const HULL_EDGES: readonly (readonly [HullCorner, HullCorner, HullFace, HullFace])[] = [
  ['T0R', 'T0L', 'Top', 'Rend'], ['T0L', 'T1L', 'Top', 'Left'], ['T1L', 'T1R', 'Top', 'Fend'], ['T1R', 'T0R', 'Top', 'Right'],
  ['P0L', 'P0R', 'Bot', 'Rpl'], ['P0R', 'P1R', 'Bot', 'Right'], ['P1R', 'P1L', 'Bot', 'Fpl'], ['P1L', 'P0L', 'Bot', 'Left'],
  ['E0L', 'E0R', 'Rpl', 'Rend'], ['E0R', 'P0R', 'Rpl', 'Right'], ['P0L', 'E0L', 'Rpl', 'Left'],
  ['P1R', 'E1R', 'Fpl', 'Right'], ['E1R', 'E1L', 'Fpl', 'Fend'], ['E1L', 'P1L', 'Fpl', 'Left'],
  ['T0R', 'E0R', 'Rend', 'Right'], ['E0L', 'T0L', 'Rend', 'Left'], ['T1L', 'E1L', 'Fend', 'Left'], ['E1R', 'T1R', 'Fend', 'Right'],
];

/** The hull's lower profile at z (clamped to its length): the belly, risen under the sloped end plates. */
export function hullBottomAt(z: number, h: VehicleGroundHull): number {
  const zc = Math.min(h.fz1, Math.max(h.fz0, z));
  return Math.min(h.yt, h.yb + Math.max(0, h.hr * (h.pz0 - zc), h.hf * (zc - h.pz1)));
}

/**
 * The share of a receiver's cosine-weighted sky the hull solid hides: the receiver at q (root frame) with unit normal
 * n, the solid clipped at height c (its horizon). Lambert's edge integral over the silhouette edges of HULL_EDGES.
 */
export function hullSkyOcclusion(q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, c: number): number {
  const yb = Math.max(h.yb, c);
  if (yb >= h.yt) return 0;
  const lift = Math.max(c - h.yb, 0);
  const p0 = h.hr > 0 ? Math.max(h.fz0, h.pz0 - lift / Math.max(h.hr, 1e-6)) : h.pz0;
  const p1 = h.hf > 0 ? Math.min(h.fz1, h.pz1 + lift / Math.max(h.hf, 1e-6)) : h.pz1;
  const yr = Math.min(h.yt, Math.max(yb, h.yb + h.hr * (h.pz0 - h.fz0)));
  const yf = Math.min(h.yt, Math.max(yb, h.yb + h.hf * (h.fz1 - h.pz1)));
  const v = (x: number, y: number, z: number): number[] => [x - q.x, y - q.y, z - q.z];
  const corner: Record<HullCorner, number[]> = {
    T0R: v(h.hx, h.yt, h.fz0), T1R: v(h.hx, h.yt, h.fz1), E1R: v(h.hx, yf, h.fz1), P1R: v(h.hx, yb, p1), P0R: v(h.hx, yb, p0), E0R: v(h.hx, yr, h.fz0),
    T0L: v(-h.hx, h.yt, h.fz0), T1L: v(-h.hx, h.yt, h.fz1), E1L: v(-h.hx, yf, h.fz1), P1L: v(-h.hx, yb, p1), P0L: v(-h.hx, yb, p0), E0L: v(-h.hx, yr, h.fz0),
  };
  const facing: Record<HullFace, number> = {
    Top: q.y > h.yt ? 1 : 0, Bot: q.y < yb ? 1 : 0, Rend: q.z < h.fz0 ? 1 : 0, Fend: q.z > h.fz1 ? 1 : 0,
    Right: q.x > h.hx ? 1 : 0, Left: q.x < -h.hx ? 1 : 0,
    Rpl: -(p0 - h.fz0) * (q.y - yr) - (yr - yb) * (q.z - h.fz0) > 0 ? 1 : 0,
    Fpl: -(h.fz1 - p1) * (q.y - yf) + (yf - yb) * (q.z - h.fz1) > 0 ? 1 : 0,
  };
  let k = 0;
  for (const [u, w, fa, fb] of HULL_EDGES) {
    if (facing[fa] !== facing[fb]) k += (facing[fa] - facing[fb]) * edgeTerm(corner[u], corner[w], n);
  }
  return clamp01(-k * INV_2PI);
}

/**
 * What a blocked direction keeps of its darkening: one minus the occluder's radiance relative to the sky's
 * (first-order interreflection), for the belly enclosure and for the walls, from the ground's albedo and the rig's
 * sun-to-sky ratio k of open flat ground. The hull's albedo and the belly's view are the knobs the capture may tune.
 */
export function vehicleGroundStrengths(
  groundAlbedo: number, sunToSky: number, hullAlbedo = GROUND_AO_HULL_ALBEDO, bellyView = GROUND_AO_BELLY_VIEW,
  underGround = GROUND_AO_UNDER_GROUND,
): VehicleGroundStrengths {
  const rho = Math.min(Math.max(groundAlbedo, 0), 0.95), k = Math.max(sunToSky, 0);
  return {
    belly: clamp01(1 - hullAlbedo * rho * (bellyView * (1 + k) + (1 - bellyView) * underGround)),
    wall: clamp01(1 - hullAlbedo * (0.5 + 0.5 * rho * (1 + 0.5 * k))),
  };
}

/**
 * The drawn run's travel over the contact plane at z on one side (−1: left, x < 0; 1: right): its knots evenly over the
 * ground run, linear between (the GLSL's hat weights), held past its ends; 0 at rest.
 */
export function runTravelAt(side: number, z: number, h: VehicleGroundHull, runs?: VehicleGroundRuns | null): number {
  if (!runs) return 0;
  const k = side < 0 ? runs.left : runs.right;
  const t = clamp01((z - h.cz0) / Math.max(h.cz1 - h.cz0, 1e-4)) * (GROUND_AO_RUN_KNOTS - 1);
  let travel = 0;
  for (let i = 0; i < GROUND_AO_RUN_KNOTS; i++) travel += (k[i] ?? 0) * Math.max(0, 1 - Math.abs(t - i));
  return travel;
}

/**
 * The track's lower edge over the contact plane at z, less the shoe test's tolerances: the floor along the ground run
 * (raised by the run's drawn travel), the wraps' ramp past it.
 */
export function trackFloorAt(z: number, h: VehicleGroundHull, travel = 0): number {
  const past = Math.max(h.cz0 - z, z - h.cz1, 0);
  return travel + Math.max(GROUND_AO_SHOE_FLOOR_M, (z < h.cz0 ? h.sr : h.sf) * past - GROUND_AO_RAMP_TOL_M);
}

/**
 * A pixel that is one of the hull's own track shoes (see GROUND_AO_SHOE_FLOOR_M): `card` — it has no sun state (the
 * shoes' material writes none; a lit pixel is never a shoe) — over the run as it is drawn.
 */
export function isRunShoe(q: Vec3Like, h: VehicleGroundHull, card: boolean, runs?: VehicleGroundRuns | null): boolean {
  if (!card || Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo)) >= 0.5 * (h.xo - h.xi) + GROUND_AO_LANE_MARGIN_M
    || q.y >= h.yt + GROUND_AO_RUN_END_M || q.z <= h.fz0 || q.z >= h.fz1) return false;
  return q.y >= h.y0 + trackFloorAt(q.z, h, runTravelAt(q.x, q.z, h, runs));
}

/**
 * The track's contact (its shoes' foot, their gaps): a soft rim hugging the run as it is drawn — whole inside the shoes'
 * lane, gone GROUND_AO_CONTACT_SPREAD_M outside its faces (squared); by the receiver's height against the run's lower
 * edge (the floor raised by the run's travel, the wraps' ramp past the ground run): the ground under a lifted run whole
 * within GROUND_AO_CONTACT_FULL_M of it and gone GROUND_AO_CONTACT_GAP_M under it, a blade or the ground standing into
 * the run gone GROUND_AO_CONTACT_RISE_M over it; its ends at the hull's; at most GROUND_AO_CONTACT_MAX (round 3).
 */
export function underTrackOcclusion(q: Vec3Like, h: VehicleGroundHull, runs?: VehicleGroundRuns | null): number {
  const laneD = 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo));
  const out = 1 - smoothstep(0, GROUND_AO_CONTACT_SPREAD_M, -laneD);
  const lane = out * out * smoothstep(0, GROUND_AO_CONTACT_EDGE_M, Math.min(q.z - h.fz0, h.fz1 - q.z));
  if (lane <= 0) return 0;
  const past = Math.max(h.cz0 - q.z, q.z - h.cz1, 0);
  const dv = q.y - (h.y0 + runTravelAt(q.x, q.z, h, runs) + (q.z < h.cz0 ? h.sr : h.sf) * past);
  const vert = dv >= 0 ? 1 - smoothstep(0, GROUND_AO_CONTACT_RISE_M, dv)
    : 1 - smoothstep(GROUND_AO_CONTACT_FULL_M, GROUND_AO_CONTACT_GAP_M, -dv);
  return GROUND_AO_CONTACT_MAX * lane * vert;
}

/** The run's lower edge over the contact plane at z on q's side, as drawn (the floor raised by the travel, the wraps' ramp past
 * the ground run). */
function runFootAt(x: number, z: number, h: VehicleGroundHull, runs?: VehicleGroundRuns | null): number {
  const past = Math.max(h.cz0 - z, z - h.cz1, 0);
  return h.y0 + runTravelAt(x, z, h, runs) + (z < h.cz0 ? h.sr : h.sf) * past;
}

/**
 * Round 4: the contact line's core (see GROUND_AO_CORE_MAX) — whole inside the shoes' lane and over GROUND_AO_CORE_FLAT of
 * its width beyond the faces, gone GROUND_AO_CORE_W_M outside them, its ends at the hull's, whole while the receiver lies within
 * GROUND_AO_CORE_GAP_M of the run's lower edge. `scale`: the lab's lever (1 shipped).
 */
export function contactCoreOcclusion(q: Vec3Like, h: VehicleGroundHull, runs?: VehicleGroundRuns | null, scale = 1, snow = 0): number {
  const laneD = 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo));
  const sn = clamp01(snow);
  // (2026-10-14) on snow (the receiver's own cover) the groove's ends and the rim's vertical reach
  const full = GROUND_AO_CORE_FLAT * GROUND_AO_CORE_W_M + (GROUND_AO_CORE_FULL_SNOW_M - GROUND_AO_CORE_FLAT * GROUND_AO_CORE_W_M) * sn;
  const w = 1 - smoothstep(full, GROUND_AO_CORE_W_M + (GROUND_AO_CORE_W_SNOW_M - GROUND_AO_CORE_W_M) * sn, -laneD);
  const ends = smoothstep(0, GROUND_AO_CONTACT_EDGE_M, Math.min(q.z - h.fz0, h.fz1 - q.z));
  if (w <= 0 || ends <= 0) return 0;
  const dv = q.y - runFootAt(q.x, q.z, h, runs);
  const near = 1 - smoothstep(0, GROUND_AO_CORE_GAP_M, Math.abs(dv));
  const vert = dv >= 0 ? 1 - smoothstep(0, GROUND_AO_CONTACT_RISE_M, dv)
    : 1 - smoothstep(GROUND_AO_CONTACT_FULL_M, GROUND_AO_CONTACT_GAP_M, -dv);
  return GROUND_AO_CORE_MAX * scale * w * ends * (near + (vert - near) * sn);
}

/**
 * Round 4: the shoe band's sun shadow on a receiver beyond a run's outer face (see GROUND_AO_BAND_H_M): `s` toward the sun
 * in the hull frame (any length). 0..1, the share of its sun the band hides.
 */
export function shoeBandSunShadow(q: Vec3Like, h: VehicleGroundHull, s: Vec3Like, runs?: VehicleGroundRuns | null): number {
  const len = Math.hypot(s.x, s.y, s.z);
  const beyond = Math.abs(q.x) - h.xo;
  if (!(len > 0) || beyond <= -0.005 || beyond >= GROUND_AO_BAND_REACH_M) return 0;
  const sx = s.x / len, sy = s.y / len, sz = s.z / len;
  const toward = -Math.sign(q.x) * sx;
  if (toward <= 1e-3 || sy <= 0) return 0;
  const t = Math.max(beyond, 0) / toward;
  const zHit = q.z + t * sz;
  const top = h.y0 + runTravelAt(q.x, zHit, h, runs) + GROUND_AO_BAND_H_M;
  const pen = GROUND_AO_BAND_PEN_M + GROUND_AO_BAND_PEN_PER_M * Math.max(beyond, 0);
  return (1 - smoothstep(top - pen, top + pen, q.y + t * sy))
    * smoothstep(h.cz0 - 0.05, h.cz0 + 0.05, zHit) * (1 - smoothstep(h.cz1 - 0.05, h.cz1 + 0.05, zHit));
}

/** Round 4: a map's snow weight by its ground albedo lever (0 below GROUND_AO_SNOW_ALBEDO, whole 0.15 over it) — since
 * contact r2 only the runs' grime reads it (a hull on a snow map carries no mud); the ground's law reads each receiver's own
 * snow cover. */
export function mapSnowWeight(groundAlbedo: number): number {
  return smoothstep(GROUND_AO_SNOW_ALBEDO, GROUND_AO_SNOW_ALBEDO + 0.15, groundAlbedo);
}

/** The joint cap for a receiver of snow cover `snow` (contact r2: its own): GROUND_AO_OCC_MAX (or the lever's), GROUND_AO_OCC_MAX_SNOW on snow. */
export function groundOcclusionCap(snow: number, cap = GROUND_AO_OCC_MAX): number {
  return cap + (GROUND_AO_OCC_MAX_SNOW - cap) * clamp01(snow);
}

/** The broad share's softening outside the footprint for a receiver of snow cover `snow`: GROUND_AO_WALL_SOFT, whole on snow. */
export function groundWallSoft(snow: number, soft = GROUND_AO_WALL_SOFT): number {
  return soft + (1 - soft) * clamp01(snow);
}

/**
 * Round 4: the snow berm's gain on a receiver's sun share (1: flat ground) — the parabola GROUND_AO_BERM_H_M high over
 * GROUND_AO_BERM_W_M beyond a run's outer face along its ground run, at the run's foot; `n` the receiver's normal and `s`
 * toward the sun (hull frame), `snow` the receiver's snow cover (contact r2; the map's lever before). Clamped at 2.
 */
export function snowBermGain(q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, s: Vec3Like, snow: number,
  runs?: VehicleGroundRuns | null): number {
  const beyond = Math.abs(q.x) - h.xo;
  if (!(snow > 0) || beyond <= 0 || beyond >= GROUND_AO_BERM_W_M) return 1;
  const zw = smoothstep(h.cz0 - 0.1, h.cz0 + 0.2, q.z) * (1 - smoothstep(h.cz1 - 0.2, h.cz1 + 0.1, q.z));
  const vw = 1 - smoothstep(0.03, 0.08, Math.abs(q.y - h.y0 - runTravelAt(q.x, q.z, h, runs)));
  const slope = snow * zw * vw * (4 * GROUND_AO_BERM_H_M / GROUND_AO_BERM_W_M) * (1 - 2 * beyond / GROUND_AO_BERM_W_M);
  const bx = n.x - slope * Math.sign(q.x), by = n.y, bz = n.z, bl = Math.hypot(bx, by, bz);
  const sl = Math.hypot(s.x, s.y, s.z);
  if (!(sl > 0)) return 1;
  const t0 = Math.max((n.x * s.x + n.y * s.y + n.z * s.z) / sl, 0);
  const t1 = Math.max((bx * s.x + by * s.y + bz * s.z) / (bl * sl), 0);
  return t0 > 1e-3 ? Math.min(t1 / t0, 2) : 1;
}

/**
 * Round 4: a vehicle pixel's grime — the colour multiplier the dirt a run carries toward its foot gives it (1: clean): in
 * a run's lane over the hull's length, darker by up to GROUND_AO_GRIME_MAX at the foot, gone GROUND_AO_GRIME_H_M over it
 * (squared). `scale` carries the lab's lever and the snow (none on snow).
 */
export function vehicleGrime(q: Vec3Like, h: VehicleGroundHull, runs?: VehicleGroundRuns | null, scale = 1): number {
  const laneD = 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo));
  if (laneD < -GROUND_AO_GRIME_LANE_M || q.z < h.fz0 || q.z > h.fz1 || q.y > h.y0 + 0.6) return 1;
  const w = 1 - smoothstep(0, GROUND_AO_GRIME_H_M, q.y - runFootAt(q.x, q.z, h, runs));
  return 1 - GROUND_AO_GRIME_MAX * scale * w * w;
}

/**
 * Round 5: how far a card stands in the running gear (see GROUND_AO_GEAR_CAP): inside a run's lane (whole 2 cm in from a face)
 * along its ground run (soft over 5 cm either side of its ends); 0 for a lit pixel (the ground) and outside the gear.
 */
export function gearWeight(q: Vec3Like, h: VehicleGroundHull, card: boolean): number {
  if (!card) return 0;
  const laneD = 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo));
  return smoothstep(0, 0.02, laneD) * smoothstep(h.cz0 - 0.05, h.cz0 + 0.05, q.z) * (1 - smoothstep(h.cz1 - 0.05, h.cz1 + 0.05, q.z));
}

/** Round 5: the joint cap for a pixel standing `gear` in the running gear (gearWeight): the joint cap, up to GROUND_AO_GEAR_CAP. */
export function gearCap(cap: number, gear: number, gearMax = GROUND_AO_GEAR_CAP): number {
  return cap + (Math.max(cap, gearMax) - cap) * clamp01(gear);
}

/**
 * Round 5: the contact blend's weight on a vehicle pixel at q (see GROUND_AO_BLEND_H_M): within the blend height over the run's
 * drawn lower edge (squared off by a smoothstep), in its lane (its faces widened GROUND_AO_GRIME_LANE_M) along the ground run
 * (soft over its ends), at most the blend's share — on snow (`snow`, the ground sample's own cover since contact r2) the snow's
 * height and share. `scale`: the lever.
 */
export function contactBlendWeight(q: Vec3Like, h: VehicleGroundHull, snow: number, runs?: VehicleGroundRuns | null, scale = 1,
  world: { x: number; z: number } | null = null): number {
  const laneD = 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo));
  if (laneD < -GROUND_AO_GRIME_LANE_M || q.z < h.cz0 - 0.1 || q.z > h.cz1 + 0.1) return 0;
  const s = clamp01(snow);
  // on snow: packed snow, an uneven opaque line (its height along the ground from the world point; mid-height without one)
  const n = world ? snowBlendNoise(world.x, world.z) : 0.5;
  const snowH = GROUND_AO_BLEND_H_SNOW_M * (1 - GROUND_AO_BLEND_SNOW_VARY + 2 * GROUND_AO_BLEND_SNOW_VARY * n);
  const height = GROUND_AO_BLEND_H_M + (snowH - GROUND_AO_BLEND_H_M) * s;
  const dv = q.y - (h.y0 + runTravelAt(q.x, q.z, h, runs));
  if (dv > height || dv < -0.05) return 0;
  return (1 - smoothstep(GROUND_AO_BLEND_SNOW_SOLID * s * height, height, dv))
    * smoothstep(h.cz0 - 0.1, h.cz0 + 0.05, q.z) * (1 - smoothstep(h.cz1 - 0.05, h.cz1 + 0.1, q.z))
    * (GROUND_AO_BLEND_MAX + (GROUND_AO_BLEND_MAX_SNOW - GROUND_AO_BLEND_MAX) * s) * Math.max(scale, 0);
}

/**
 * The side gaps a receiver between the runs sees under the hull's edges, closed by the runs where they stand on the
 * ground (their ground run): per run, the part of it below the plane through the receiver and the hull's edge beyond it
 * (the rest of the run hides only sky the hull already hides). Zero outside the runs' inner faces; past the ground run
 * faded in over GROUND_AO_GAP_FADE_M from them.
 */
export function runGapOcclusion(q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, c: number, runs?: VehicleGroundRuns | null): number {
  if (Math.abs(q.x) >= h.xi) return 0;
  const belly = hullBottomAt(q.z, h);
  const wrap = smoothstep(-0.04, 0, Math.max(h.cz0 - q.z, q.z - h.cz1) - GROUND_AO_CONTACT_MARGIN_M);
  const fade = 1 + (smoothstep(0, GROUND_AO_GAP_FADE_M, h.xi - Math.abs(q.x)) - 1) * wrap;
  let occ = 0;
  for (const side of [1, -1]) {
    // each run from its lower edge as drawn beside the receiver (the ground under a lifted run lets the gap's sky through)
    const lo = Math.max(h.y0 + runTravelAt(side, q.z, h, runs), c);
    const top = q.y + (belly - q.y) * (h.xi - side * q.x) / (h.hx - side * q.x);
    if (top <= lo) continue;
    occ += boxSkyOcclusion({ x: q.x - side * 0.5 * (h.xi + h.xo), y: q.y - 0.5 * (lo + top), z: q.z - 0.5 * (h.cz0 + h.cz1) }, n,
      { x: 0.5 * (h.xo - h.xi), y: 0.5 * (top - lo), z: 0.5 * (h.cz1 - h.cz0) });
  }
  return occ * fade;
}

/**
 * The CPU twin of the GLSL: the occlusion one hull casts on a receiver at q (root frame) with unit normal n (root
 * frame) — its solid and the side gaps its runs close, clipped at the receiver's horizon, faded over its reach, the
 * ground its tracks cover, and the belly's or the walls' strength by the receiver's place across the footprint's edge.
 */
export function vehicleGroundOcclusionLocal(
  q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, strengths: VehicleGroundStrengths, card = false, runs: VehicleGroundRuns | null = null,
  wallSoft = GROUND_AO_WALL_SOFT, shoeSkip = false,
): number {
  const H = h.yt - h.y0;
  const dx = Math.abs(q.x) - h.hx, dz = Math.abs(q.z - 0.5 * (h.fz0 + h.fz1)) - 0.5 * (h.fz1 - h.fz0);
  const dOut = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  if (dOut > H * GROUND_AO_REACH[1] || q.y > h.yt || q.y < h.y0 - H * GROUND_AO_REACH[1]) return 0;
  if (q.y > h.yb + 0.02 && dOut < GROUND_AO_HULL_SKIN_M) return 0;
  // (round 5) the shoes carry the vehicle tag: a card in the lane is grass in the running gear, a receiver (shoeSkip: the old law)
  if (shoeSkip && isRunShoe(q, h, card, runs)) return 0;
  const c = q.y - GROUND_AO_CLIP_SLACK_M * (1 - n.y);
  const reach = 1 - smoothstep(H * GROUND_AO_REACH[0], H * GROUND_AO_REACH[1], dOut);
  const sd = dOut + Math.min(Math.max(dx, dz), 0);
  const inside = 1 - smoothstep(-GROUND_AO_EDGE_M, GROUND_AO_EDGE_M, sd);
  // (round 4) the broad share softened outside the footprint (GROUND_AO_WALL_SOFT), from its edge to twice the edge's blend
  // out — whole at the edge, where wave 13's snow strip under the rear plate stays shaded
  const broad = reach * (hullSkyOcclusion(q, n, h, c) + runGapOcclusion(q, n, h, c, runs))
    * (1 + (wallSoft - 1) * smoothstep(0, 2 * GROUND_AO_EDGE_M, sd));
  const occ = Math.max(broad, underTrackOcclusion(q, h, runs));
  const s = strengths.wall + (strengths.belly - strengths.wall) * inside;
  return Math.min(occ, 1) * s;
}

/** Several hulls hide the sky as independent occluders, the joint share capped at GROUND_AO_OCC_MAX (on snow
 * groundOcclusionCap, by the receiver's own cover), then (round 4) the contact line's core (the hulls' largest;
 * contactCoreOcclusion, its snow groove with it) by the larger, past the cap; the selection's range fade on the result. */
export function combineVehicleGroundOcclusion(perHull: readonly number[], distance: number, core = 0, cap = GROUND_AO_OCC_MAX): number {
  let vis = 1;
  for (const occ of perHull) vis *= 1 - clamp01(occ);
  return Math.max(Math.min(1 - vis, cap), clamp01(core))
    * (1 - smoothstep(GROUND_AO_RANGE_M - GROUND_AO_FADE_M, GROUND_AO_RANGE_M, distance));
}

/**
 * 2026-10-10 (round 3; the owner on production: "super super dark rectangular shadows under tracks"): whether a ray from q
 * toward the sun (s, the hull frame; any length) meets the hull — its solid over the belly (the footprint from the belly to
 * the deck) or either run (its lane from the contact plane to the belly, the hull's length) — so a card (a grass blade: no
 * sun state) at q stands in the hull's own shadow. A card took the whole ambient share wherever it stood inside the
 * footprint below the belly, sunlit or not: the sunlit grass under a skirt or a side frame, past the track sideways and
 * along the whole hull, went near black under a hard top edge at the belly's height (76 → 28 in display on the 207
 * frames). 1 in the hull's shadow, 0 out of it.
 */
function rayMeetsBox(q: Vec3Like, s: Vec3Like, lo: readonly number[], hi: readonly number[]): boolean {
  const o = [q.x, q.y, q.z], d = [s.x, s.y, s.z];
  let tn = -Infinity, tf = Infinity;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (d[a] + 1e-7);
    const t0 = (lo[a] - o[a]) * inv, t1 = (hi[a] - o[a]) * inv;
    tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
  }
  return tf >= Math.max(tn, 0);
}
export function hullSunShadow(q: Vec3Like, h: VehicleGroundHull, s: Vec3Like): number {
  return rayMeetsBox(q, s, [-h.hx, h.yb, h.fz0], [h.hx, h.yt, h.fz1])
    || rayMeetsBox(q, s, [h.xi, h.y0, h.fz0], [h.xo, h.yb, h.fz1])
    || rayMeetsBox(q, s, [-h.xo, h.y0, h.fz0], [-h.xi, h.yb, h.fz1]) ? 1 : 0;
}

/**
 * Contact r2 (2026-10-14; the coordinator: "near hulls block unshadowed FX point lights on the ground beneath them, cheaply
 * ... no shadow maps"; media wave f1, s170: a Studio illumination flare lit the sand under a Centurion as brightly as the
 * open ground). The FX lights cast no shadow (groundKeyLights.ts: the muzzle flash, the blast, the light the cinematic FX
 * borrow for a flare or a fire). Each frame the strongest GROUND_AO_KEY_LIGHTS of them at the near hulls reach the block;
 * a lit ground pixel within a hull's reach whose segment to a lamp meets the hull's solid over its belly or either run
 * (the gap under the belly between the runs lets a low lamp through) loses that lamp's share of its light, E / (T + A + ΣE)
 * with E the lamp's irradiance as three draws it (intensity × colour luminance × N·l × the distance falloff and its
 * cutoff); the ambient's occlusion takes its share over the same total, so a pixel the lamp dominates keeps its lamp light
 * where the hull does not stand between them. A lamp inside a solid (a muzzle against the mantlet) is never shadowed by it,
 * and the cut fades out over the reach's last third (a low lamp's long shadow ends softly, not at the reach's edge).
 */
export const GROUND_AO_KEY_LIGHTS = 2;
/** A lamp within this far (m) of a solid's faces counts as inside it. */
export const GROUND_AO_KEY_INSIDE_M = 0.15;
/** The cut fades out between these multiples of the hull's height from its footprint (its reach ends at REACH[1]). */
export const GROUND_AO_KEY_FADE = Object.freeze([2, 3] as const);
/**
 * The boxes stand in for a hull whose edges are rounded, chamfered and hung with stowage: a lamp's shadow takes the chord
 * its ray cuts through a box grown GROUND_AO_KEY_GROW_M across (x and z), whole from GROUND_AO_KEY_SOFT_M (smoothstep), so
 * the shadow's edge — where the rays graze a box — is a soft fringe a few decimetres wide on the ground even under a steep
 * lamp, never a ruled rectangle (the owner's "super super dark rectangular shadows under tracks"; the first night capture's
 * 0.35 m chord on the bare boxes left a 7 cm edge under the flare).
 */
export const GROUND_AO_KEY_SOFT_M = 0.5;
export const GROUND_AO_KEY_GROW_M = 0.12;

/** How much the segment q → k (the hull frame) is shadowed by the box [lo, hi]: the chord it cuts through the box,
 * whole from GROUND_AO_KEY_SOFT_M (the GLSL's cotVgSegBox). */
function segmentBoxShadow(q: Vec3Like, k: Vec3Like, lo: readonly number[], hi: readonly number[]): number {
  const o = [q.x, q.y, q.z], d = [k.x - q.x, k.y - q.y, k.z - q.z];
  let tn = -Infinity, tf = Infinity;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (d[a] + 1e-7);
    const t0 = (lo[a] - o[a]) * inv, t1 = (hi[a] - o[a]) * inv;
    tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
  }
  const chord = (Math.min(tf, 1) - Math.max(tn, 0)) * Math.hypot(d[0], d[1], d[2]);
  return smoothstep(0, GROUND_AO_KEY_SOFT_M, chord);
}
const insideBox = (p: Vec3Like, lo: readonly number[], hi: readonly number[]): boolean =>
  p.x > lo[0] - GROUND_AO_KEY_INSIDE_M && p.y > lo[1] - GROUND_AO_KEY_INSIDE_M && p.z > lo[2] - GROUND_AO_KEY_INSIDE_M
  && p.x < hi[0] + GROUND_AO_KEY_INSIDE_M && p.y < hi[1] + GROUND_AO_KEY_INSIDE_M && p.z < hi[2] + GROUND_AO_KEY_INSIDE_M;

/** How much the hull's solid over its belly or either run stands between a receiver at q and a lamp at k (both the hull
 * frame): 1 through its body, a soft fringe where the ray grazes it, 0 off it or when the lamp sits inside a box. */
export function hullBlocksKeyLight(q: Vec3Like, k: Vec3Like, h: VehicleGroundHull): number {
  const boxes: readonly (readonly [readonly number[], readonly number[]])[] = [
    [[-h.hx, h.yb, h.fz0], [h.hx, h.yt, h.fz1]], [[h.xi, h.y0, h.fz0], [h.xo, h.yb, h.fz1]], [[-h.xo, h.y0, h.fz0], [-h.xi, h.yb, h.fz1]],
  ];
  if (boxes.some(([lo, hi]) => insideBox(k, lo, hi))) return 0;
  const g = GROUND_AO_KEY_GROW_M;
  return Math.max(...boxes.map(([lo, hi]) => segmentBoxShadow(q, k, [lo[0] - g, lo[1], lo[2] - g], [hi[0] + g, hi[1], hi[2] + g])));
}

/** A lamp's irradiance (luminance) at a receiver as three's punctual light draws it: lum × N·l × 1 / max(d^decay, 0.01),
 * times (1 − (d / range)⁴)² inside a range (0: none). */
export function keyLightIrradiance(P: Vec3Like, N: Vec3Like, lamp: Vec3Like, lum: number, range: number, decay = 2): number {
  const lx = lamp.x - P.x, ly = lamp.y - P.y, lz = lamp.z - P.z, d = Math.hypot(lx, ly, lz);
  let fall = 1 / Math.max(d ** decay, 0.01);
  if (range > 0) { const r = clamp01(1 - (d / range) ** 4); fall *= r * r; }
  return lum * fall * Math.max((N.x * lx + N.y * ly + N.z * lz) / Math.max(d, 1e-4), 0);
}

/** The cut a lit receiver takes: from its light T + A + ΣE, the ambient's occluded share, the sun's (round 4's band and
 * berm: `sunCut`, its share of the sun) and the blocked lamps' shares. */
export function groundShadeWithKeyLights(occ: number, T: number, A: number, E: readonly number[], blocked: readonly number[], sunCut = 0): number {
  let sum = 0, cut = 0;
  for (let i = 0; i < E.length; i++) { sum += E[i]; cut += (blocked[i] ?? 0) * E[i]; }
  const D = Math.max(T + A + sum, 1e-4);
  return 1 - occ * (A / D) - (T / D) * sunCut - cut / D;
}

export interface VehicleGroundOcclusionUniforms {
  /** The hulls written this frame (0: the block is skipped). */
  uVehGround: THREE.IUniform<number>;
  /** Per hull, three rows: world → root frame (local axis i = dot(row.xyz, P) + row.w; the root's scale included). */
  uVehGroundM: THREE.IUniform<THREE.Vector4[]>;
  /** Per hull, four vec4: (hx, yb, yt, y0), (fz0, fz1, pz0, pz1), (hr, hf, xi, xo), (sr, sf, cz0, cz1) — the root frame. */
  uVehGroundB: THREE.IUniform<THREE.Vector4[]>;
  /** Per hull, four vec4: the left run's eight knots, then the right's (VehicleGroundRuns, root frame). */
  uVehGroundR: THREE.IUniform<THREE.Vector4[]>;
  /** The interreflection's inputs: the ground's albedo, the hull's, the belly's view of open ground, the shaded ground. */
  uVehGroundLight: THREE.IUniform<THREE.Vector4>;
  /** Round 4: (the contact core's scale, the shoe band's shadow, the snow berm's weight, the run's grime: 0 on snow). */
  uVehGroundR4: THREE.IUniform<THREE.Vector4>;
  /** Round 4: (the broad share's softening outside the footprint, the gap normal's guard 0/1, the joint cap, 0). */
  uVehGroundR5: THREE.IUniform<THREE.Vector4>;
  /** Round 5: (the snow's cool cast lever — each receiver's snow cover scales it, contact r2 —, the old shoe skip 0/1, the
   * running gear's cap, the contact blend's share). */
  uVehGroundR6: THREE.IUniform<THREE.Vector4>;
  /** (2026-10-14, contact r2) The snow law's switch: each receiver's weight is its own snow cover (the scene alpha's). */
  uVehGroundSnow: THREE.IUniform<number>;
  /** (contact r2) The FX key lamps written this frame (0: none), each (world position, range) and (luminance, decay). */
  uVehKeyLight: THREE.IUniform<number>;
  uVehKeyLightP: THREE.IUniform<THREE.Vector4[]>;
  uVehKeyLightE: THREE.IUniform<THREE.Vector4[]>;
}

export function createVehicleGroundOcclusionUniforms(): VehicleGroundOcclusionUniforms {
  const rows = (n: number) => Array.from({ length: GROUND_AO_MAX_HULLS * n }, () => new THREE.Vector4());
  return {
    uVehGround: { value: 0 },
    uVehGroundM: { value: rows(3) },
    uVehGroundB: { value: rows(4) },
    uVehGroundR: { value: Array.from({ length: GROUND_AO_MAX_HULLS * 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uVehGroundLight: { value: new THREE.Vector4(GROUND_AO_DEFAULT_ALBEDO, GROUND_AO_HULL_ALBEDO, GROUND_AO_BELLY_VIEW, GROUND_AO_UNDER_GROUND) },
    uVehGroundR4: { value: new THREE.Vector4(1, 1, 0, 1) },
    uVehGroundR5: { value: new THREE.Vector4(GROUND_AO_WALL_SOFT, 1, GROUND_AO_OCC_MAX, 0) },
    uVehGroundR6: { value: new THREE.Vector4(1, 0, GROUND_AO_GEAR_CAP, 1) },
    uVehGroundSnow: { value: 0 },
    uVehKeyLight: { value: 0 },
    uVehKeyLightP: { value: Array.from({ length: GROUND_AO_KEY_LIGHTS }, () => new THREE.Vector4()) },
    uVehKeyLightE: { value: Array.from({ length: GROUND_AO_KEY_LIGHTS }, () => new THREE.Vector4()) },
  };
}

/** The hull proxy of a vehicle root (its shadow detail record's first proxy: procShadow_hull). */
export function hullProxyOf(root: THREE.Object3D, detailKey = 'nearShadowDetail'): THREE.Mesh | null {
  const cached = root.userData.groundAoHull as THREE.Mesh | null | undefined;
  if (cached !== undefined) return cached;
  const detail = root.userData[detailKey] as { proxies?: readonly THREE.Object3D[] } | undefined;
  const hull = detail?.proxies?.find((p) => p.name === 'procShadow_hull') as THREE.Mesh | undefined;
  const source = hull?.geometry ? hull : null;
  if (source && !source.geometry.boundingBox) source.geometry.computeBoundingBox();
  root.userData.groundAoHull = source;
  return source;
}

const _rel = new THREE.Matrix4(), _part = new THREE.Matrix4(), _bounds = new THREE.Box3(), _vertex = new THREE.Vector3();
const _shoe = new THREE.Matrix4(), _shoeFrame = new THREE.Matrix4();

/** An object's matrix in its root's frame, from the local poses up the chain (never a stale world matrix). */
function rootFrameMatrix(object: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 | null {
  out.identity();
  let node: THREE.Object3D | null = object;
  for (; node && node !== root; node = node.parent) {
    out.premultiply(node.matrixAutoUpdate ? _part.compose(node.position, node.quaternion, node.scale) : node.matrix);
  }
  return node === root ? out : null;
}

/** An object's bounds in its root's frame. */
function rootFrameBounds(object: THREE.Object3D, root: THREE.Object3D, geometry: THREE.BufferGeometry, out: THREE.Box3): THREE.Box3 | null {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty() || !rootFrameMatrix(object, root, _rel)) return null;
  return out.copy(geometry.boundingBox).applyMatrix4(_rel);
}

/**
 * The proxy's underside along its length: at each z sample the lowest point of its surface over the vertical lines at
 * the given x (through its triangles, root frame); Infinity where no line meets it.
 */
function lowerProfile(proxy: THREE.Mesh, root: THREE.Object3D, xs: readonly number[], zs: readonly number[]): number[] {
  const geometry = proxy.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
  const out = zs.map(() => Infinity);
  if (!position || !rootFrameMatrix(proxy, root, _rel)) return out;
  const p = new Float64Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    _vertex.fromBufferAttribute(position, i).applyMatrix4(_rel);
    p[i * 3] = _vertex.x; p[i * 3 + 1] = _vertex.y; p[i * 3 + 2] = _vertex.z;
  }
  const count = index ? index.count : position.count;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = (index ? index.getX(t) : t) * 3, b = (index ? index.getX(t + 1) : t + 1) * 3, c = (index ? index.getX(t + 2) : t + 2) * 3;
    const ux = p[b] - p[a], uz = p[b + 2] - p[a + 2], wx = p[c] - p[a], wz = p[c + 2] - p[a + 2];
    const det = ux * wz - wx * uz;
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from below
    for (let k = 0; k < zs.length; k++) {
      for (const x of xs) {
        const rx = x - p[a], rz = zs[k] - p[a + 2];
        const s = (rx * wz - wx * rz) / det, r = (ux * rz - rx * uz) / det;
        if (s < -1e-9 || r < -1e-9 || s + r > 1 + 1e-9) continue;
        const y = p[a + 1] + s * (p[b + 1] - p[a + 1]) + r * (p[c + 1] - p[a + 1]);
        if (y < out[k]) out[k] = y;
      }
    }
  }
  return out;
}

/**
 * The least-squares hinge from the profile's lowest sample outward: the knee (where the plate leaves the belly) and the
 * plate's rise per metre, over the samples from the lowest to the end (dir −1: rearward, +1: forward).
 */
function fitHinge(zs: readonly number[], ys: readonly number[], low: number, from: number, dir: 1 | -1): { knee: number; slope: number } {
  const span: number[] = [];
  for (let i = from; i >= 0 && i < zs.length; i += dir) if (Number.isFinite(ys[i])) span.push(i);
  let best = { knee: zs[from], slope: 0, sse: Infinity };
  for (const k of span) {
    let st = 0, tt = 0, sse = 0;
    for (const i of span) { const t = Math.max(0, dir * (zs[i] - zs[k])); st += (ys[i] - low) * t; tt += t * t; }
    const slope = tt > 0 ? Math.max(0, st / tt) : 0;
    for (const i of span) { const e = ys[i] - low - slope * Math.max(0, dir * (zs[i] - zs[k])); sse += e * e; }
    if (sse < best.sse - 1e-12) best = { knee: zs[k], slope, sse };
  }
  return { knee: best.knee, slope: best.slope };
}

interface ContactGeometryLike {
  bottomYM?: number | null; panYM?: number | null; halfWidM?: number | null; halfLenM?: number | null; zCenterM?: number | null;
  endRise?: { dzM?: number | null; frontM?: number | null; rearM?: number | null } | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A hull's solid and runs, measured once from the built visual and cached on the root: the contact plane and the belly
 * from the movement contact geometry (tankFactoryCore.ts / restPoseContact.ts), the solid's width, length, deck and
 * lower profile from its shadow proxy, the runs' lane, length and ground run from the track shoes (the bands, then the
 * contact geometry without them). Null without a proxy.
 */
export function measureVehicleGroundHull(root: THREE.Object3D): VehicleGroundHull | null {
  // a showroom hero has no contact geometry until it is lent to a battle (prepareForSimulation): measure again then
  const cg = (root.userData.contactGeom as ContactGeometryLike | null | undefined) ?? null;
  const cached = root.userData.groundAoShape as VehicleGroundHull | null | undefined;
  if (cached !== undefined && root.userData.groundAoShapeFor === cg) return cached;
  let shape: VehicleGroundHull | null = null;
  const proxy = hullProxyOf(root);
  const hull = proxy ? rootFrameBounds(proxy, root, proxy.geometry, new THREE.Box3()) : null;
  if (proxy && hull) {
    let bandXi = Infinity, bandXo = 0, bandZ0 = Infinity, bandZ1 = -Infinity, bands = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'gearTrackBandL' && mesh.name !== 'gearTrackBandR')) return;
      const b = rootFrameBounds(mesh, root, mesh.geometry, _bounds);
      if (!b) return;
      bandXi = Math.min(bandXi, b.min.x > 0 ? b.min.x : b.max.x < 0 ? -b.max.x : 0);
      bandXo = Math.max(bandXo, Math.abs(b.min.x), Math.abs(b.max.x));
      bandZ0 = Math.min(bandZ0, b.min.z); bandZ1 = Math.max(bandZ1, b.max.z);
      bands++;
    });
    // the shoes themselves (their instanced stream): the lane the exclusion of the untagged shoes must not overreach,
    // their length, and their ground run (the shoes within GROUND_AO_SHOE_GROUND_M of the lowest)
    const shoes: { x0: number; x1: number; y: number; z0: number; z1: number }[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || mesh.name !== 'gearTrackPads' || !rootFrameMatrix(mesh, root, _shoeFrame)) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _shoe);
        const e = _shoe.elements;
        if (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10]) < 1e-5) continue; // a collapsed (hidden) shoe
        const b = _bounds.copy(geometry.boundingBox).applyMatrix4(_shoe.premultiply(_shoeFrame));
        if (b.min.x > 0) shoes.push({ x0: b.min.x, x1: b.max.x, y: b.min.y, z0: b.min.z, z1: b.max.z });
        else if (b.max.x < 0) shoes.push({ x0: -b.max.x, x1: -b.min.x, y: b.min.y, z0: b.min.z, z1: b.max.z });
      }
    });
    let shoeXi = Infinity, shoeXo = 0, shoeZ0 = Infinity, shoeZ1 = -Infinity, shoeLow = Infinity;
    for (const s of shoes) {
      shoeXi = Math.min(shoeXi, s.x0); shoeXo = Math.max(shoeXo, s.x1);
      shoeZ0 = Math.min(shoeZ0, s.z0); shoeZ1 = Math.max(shoeZ1, s.z1); shoeLow = Math.min(shoeLow, s.y);
    }
    let runZ0 = Infinity, runZ1 = -Infinity;
    const runFeet: number[] = [];
    for (const s of shoes) {
      if (s.y > shoeLow + GROUND_AO_SHOE_GROUND_M) continue;
      runZ0 = Math.min(runZ0, s.z0); runZ1 = Math.max(runZ1, s.z1); runFeet.push(s.y);
    }
    runFeet.sort((a, b) => a - b);
    const haveShoes = shoes.length > 0 && shoeXo > 0.5 && shoeXi > 0.2 && shoeXi < shoeXo - 0.1 && runZ1 > runZ0;

    // the contact plane: the ground run's shoes themselves (their median foot) — the published contact geometry of a
    // battle visual can sit far below its tracks (2026-10-03: bottomYM −0.12 and panYM −0.30 on the battle Abrams, 0 and
    // 0.355 built here) — then the published plane, then a clearance under the proxy
    const y0 = haveShoes ? runFeet[runFeet.length >> 1] : finite(cg?.bottomYM) ? cg.bottomYM : hull.min.y - GROUND_AO_CLEARANCE_M;
    const xo = haveShoes ? shoeXo
      : finite(cg?.halfWidM) && cg.halfWidM > 0.5 ? cg.halfWidM : bands ? bandXo : Math.max(Math.abs(hull.min.x), hull.max.x);
    const xi = haveShoes ? shoeXi
      : bands && bandXi > 0.2 && bandXi < xo - 0.1 ? bandXi : Math.max(0.2, xo - GROUND_AO_TRACK_WIDTH_M);
    const zc = finite(cg?.zCenterM) ? cg.zCenterM : 0.5 * (hull.min.z + hull.max.z);
    const hl = finite(cg?.halfLenM) ? cg.halfLenM : 0.35 * (hull.max.z - hull.min.z);
    const tz0 = haveShoes ? shoeZ0 : bands ? bandZ0 : zc - hl - 0.5, tz1 = haveShoes ? shoeZ1 : bands ? bandZ1 : zc + hl + 0.5;
    const cz0 = haveShoes ? runZ0 : Math.max(tz0, zc - hl), cz1 = haveShoes ? runZ1 : Math.min(tz1, zc + hl);
    // the wraps' lower edge: per 10 cm from 0.1 m past the ground run the lowest shoe, and the lowest line from the run's
    // end under all of them (so no wrap shoe falls under it); without wrap shoes the published approach rise (the band's
    // centreline dzM past each end), then a typical one
    const rampSlope = (rear: boolean): number => {
      const lowest = new Map<number, { past: number; y: number }>();
      for (const s of shoes) {
        const past = rear ? cz0 - 0.5 * (s.z0 + s.z1) : 0.5 * (s.z0 + s.z1) - cz1;
        if (past < 0.1) continue;
        const key = Math.floor(past / 0.1), cur = lowest.get(key);
        if (!cur || s.y < cur.y) lowest.set(key, { past, y: s.y });
      }
      let measured = Infinity;
      for (const { past, y } of lowest.values()) measured = Math.min(measured, (y - y0) / past);
      const rise = cg?.endRise, end = rear ? rise?.rearM : rise?.frontM;
      const published = rise && finite(rise.dzM) && rise.dzM > 0.05 && finite(end) ? end / rise.dzM : NaN;
      return Math.min(4, Math.max(0.1, Number.isFinite(measured) ? measured : Number.isFinite(published) ? published : GROUND_AO_RAMP_FALLBACK));
    };
    const sr = rampSlope(true), sf = rampSlope(false);

    // the lower profile: the proxy's underside between the runs, its lowest point set on the measured pan, a hinge each way
    const fz0 = hull.min.z, fz1 = hull.max.z, yt = hull.max.y;
    const zs = Array.from({ length: GROUND_AO_PROFILE_SAMPLES }, (_, i) => fz0 + 0.02 + (i / (GROUND_AO_PROFILE_SAMPLES - 1)) * (fz1 - fz0 - 0.04));
    const ys = lowerProfile(proxy, root, [0, 0.5 * xi, -0.5 * xi], zs);
    let low = Infinity, lowAt = -1;
    for (let i = 0; i < ys.length; i++) if (ys[i] < low) { low = ys[i]; lowAt = i; }
    // the belly: the measured hull-pan floor where it stands over the contact plane, else the proxy's lowest underside
    const pan = finite(cg?.panYM) && cg.panYM > y0 + 0.05 ? cg.panYM : Number.isFinite(low) ? low : hull.min.y;
    const yb = Math.max(pan, y0 + 0.1);
    let pz0 = fz0, pz1 = fz1, hr = 0, hf = 0;
    if (lowAt >= 0) {
      // (a flat end keeps the belly to the hull's end)
      const rear = fitHinge(zs, ys, low, lowAt, -1), front = fitHinge(zs, ys, low, lowAt, 1);
      if (rear.slope > 1e-4) { pz0 = rear.knee; hr = rear.slope; }
      if (front.slope > 1e-4) { pz1 = front.knee; hf = front.slope; }
    }
    const candidate: VehicleGroundHull = {
      hx: Math.max(Math.abs(hull.min.x), Math.abs(hull.max.x), xo), yb, yt, fz0, fz1, pz0, pz1, hr, hf,
      y0, xi, xo, tz0, tz1, cz0, cz1, sr, sf,
    };
    const valid = candidate.yt > candidate.yb + 0.2 && candidate.yb > candidate.y0 && candidate.xo > candidate.xi
      && candidate.fz1 > candidate.fz0 + 1 && candidate.pz1 >= candidate.pz0 && candidate.tz1 > candidate.tz0
      && candidate.cz1 > candidate.cz0 && Object.values(candidate).every(finite);
    shape = valid ? Object.freeze(candidate) : null;
  }
  // the object that publishes the drawn ground runs (the hull group: tankFactoryCore.ts runningGearGroundRun), read live
  // each frame (a rebuilt gear republishes it there)
  let runOwner: THREE.Object3D | null = null;
  if (shape) root.traverse((object) => {
    if (!runOwner && typeof (object.userData as { runningGearGroundRun?: unknown }).runningGearGroundRun === 'function') runOwner = object;
  });
  root.userData.groundAoRunOwner = runOwner;
  root.userData.groundAoShape = shape;
  root.userData.groundAoShapeFor = cg;
  return shape;
}

type GroundRunReader = (side: -1 | 1, out: Float32Array) => number;
const RUN_SIDES = [-1, 1] as const;
const _runPairs = new Float32Array(GROUND_AO_RUN_WHEELS * 2);
const _runFrame = new THREE.Matrix4();
const _runKnots = new Float32Array(GROUND_AO_RUN_KNOTS);

/**
 * One side's knots (root frame) from the gear's drawn run: the hull-local (z, travel) pairs the reader writes, linear
 * between the wheels and held past the end ones, at each knot's z mapped into the hull's frame; e10/e14 the hull frame's
 * z scale and offset in the root's, e5 its y scale. No pairs: no run meets the ground on that side.
 */
function sampleRunKnots(read: GroundRunReader, side: -1 | 1, h: VehicleGroundHull, e10: number, e14: number, e5: number, out: Float32Array): void {
  const n = read(side, _runPairs);
  if (!(n > 0)) { out.fill(GROUND_AO_NO_RUN_M); return; }
  for (let k = 0; k < GROUND_AO_RUN_KNOTS; k++) {
    const z = (h.cz0 + (k / (GROUND_AO_RUN_KNOTS - 1)) * (h.cz1 - h.cz0) - e14) / e10;
    let travel: number;
    if (z <= _runPairs[0]) travel = _runPairs[1];
    else if (z >= _runPairs[(n - 1) * 2]) travel = _runPairs[(n - 1) * 2 + 1];
    else {
      let i = 1;
      while (i < n - 1 && _runPairs[i * 2] < z) i++;
      const z0 = _runPairs[(i - 1) * 2], z1 = _runPairs[i * 2], t = z1 > z0 ? (z - z0) / (z1 - z0) : 1;
      travel = _runPairs[(i - 1) * 2 + 1] + t * (_runPairs[i * 2 + 1] - _runPairs[(i - 1) * 2 + 1]);
    }
    out[k] = Number.isFinite(travel) ? e5 * travel : 0;
  }
}

/** A hull's runs into its four knot rows (left two, right two): the drawn run where the gear publishes it, else the rest
 * pose (zero travel). In place. */
function writeRunKnots(root: THREE.Object3D, h: VehicleGroundHull, rows: readonly THREE.Vector4[], at: number): void {
  const owner = root.userData.groundAoRunOwner as THREE.Object3D | null | undefined;
  const read = owner ? (owner.userData as { runningGearGroundRun?: unknown }).runningGearGroundRun : null;
  const frame = typeof read === 'function' && owner ? rootFrameMatrix(owner, root, _runFrame) : null;
  const e = frame?.elements;
  if (!e || !(Math.abs(e[10]) > 1e-6) || !Number.isFinite(e[5])) {
    for (let r = 0; r < 4; r++) rows[at + r].set(0, 0, 0, 0);
    return;
  }
  // a mirrored hull frame swaps which side lies at −x in the root's
  for (const side of RUN_SIDES) {
    sampleRunKnots(read as GroundRunReader, (e[0] < 0 ? -side : side) as -1 | 1, h, e[10], e[14], e[5], _runKnots);
    const row = at + (side < 0 ? 0 : 2);
    rows[row].set(_runKnots[0], _runKnots[1], _runKnots[2], _runKnots[3]);
    rows[row + 1].set(_runKnots[4], _runKnots[5], _runKnots[6], _runKnots[7]);
  }
}

const _world = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/**
 * Per frame (post.ts): the solids of the near hulls the shadow router selected (lighting.ts publishes the selection on
 * scene.userData.nearVehicles). Each hull's frame comes from its root's own pose this frame — the renderer refreshes
 * world matrices only inside the render, a frame after a moving hull. No allocation: every uniform is written in place.
 */
export function updateVehicleGroundOcclusionUniforms(
  u: VehicleGroundOcclusionUniforms, roots: readonly { readonly root: THREE.Object3D }[] | null | undefined, enabled: boolean,
  // (QA: __LIGHT_TUNE.GROUND_AO_HULL_ALBEDO / GROUND_AO_BELLY_VIEW tune the interreflection without a rebuild)
  groundAlbedo = GROUND_AO_DEFAULT_ALBEDO, hullAlbedo = lightTune('GROUND_AO_HULL_ALBEDO', GROUND_AO_HULL_ALBEDO),
  bellyView = lightTune('GROUND_AO_BELLY_VIEW', GROUND_AO_BELLY_VIEW),
  // (2026-10-14, contact r2) the snow law's switch (each receiver weighs it by its own snow cover; QA:
  // __LIGHT_TUNE.GROUND_AO_SNOW = 0 restores the ordinary law for an A/B frame)
  snowLaw = 1,
  // (contact r2) the FX lamps the hulls shadow (QA: __LIGHT_TUNE.GROUND_AO_KEY_LIGHTS = 0 drops them for an A/B frame)
  keyLights: Iterable<THREE.PointLight> = groundKeyLights(),
): void {
  u.uVehGroundLight.value.set(Math.min(Math.max(groundAlbedo, 0), 0.95), clamp01(hullAlbedo), clamp01(bellyView), GROUND_AO_UNDER_GROUND);
  // (round 4; QA: __LIGHT_TUNE.GROUND_AO_CORE / _BAND / _BERM / _GRIME / _WALL_SOFT / _NORMAL_GUARD / _OCC_CAP compare the
  // round's terms and the joint cap on one frame; contact r2: the berm, the wall's softening and the cap follow each
  // receiver's own snow cover in the GLSL, the grime the map's lever)
  const mapSnow = mapSnowWeight(groundAlbedo);
  u.uVehGroundR4.value.set(Math.max(lightTune('GROUND_AO_CORE', 1), 0), lightTune('GROUND_AO_BAND', 1) > 0 ? 1 : 0,
    Math.max(lightTune('GROUND_AO_BERM', 1), 0), (1 - mapSnow) * Math.max(lightTune('GROUND_AO_GRIME', 1), 0));
  u.uVehGroundR5.value.set(clamp01(lightTune('GROUND_AO_WALL_SOFT', GROUND_AO_WALL_SOFT)), lightTune('GROUND_AO_NORMAL_GUARD', 1) > 0 ? 1 : 0,
    clamp01(lightTune('GROUND_AO_OCC_CAP', GROUND_AO_OCC_MAX)), 0);
  // (round 5; QA: __LIGHT_TUNE.GROUND_AO_COOL / _SHOE_SKIP / _GEAR_CAP / _BLEND compare the round's terms on one frame)
  u.uVehGroundR6.value.set(Math.max(lightTune('GROUND_AO_COOL', 1), 0), lightTune('GROUND_AO_SHOE_SKIP', 0) > 0 ? 1 : 0,
    clamp01(lightTune('GROUND_AO_GEAR_CAP', GROUND_AO_GEAR_CAP)), Math.max(lightTune('GROUND_AO_BLEND', 1), 0));
  u.uVehGroundSnow.value = clamp01(lightTune('GROUND_AO_SNOW', snowLaw));
  let n = 0;
  if (enabled && roots) {
    for (let i = 0; i < roots.length && n < GROUND_AO_MAX_HULLS; i++) {
      const root = roots[i].root;
      if (!root.visible) continue;
      const h = measureVehicleGroundHull(root);
      if (!h) continue;
      _world.compose(root.position, root.quaternion, root.scale);
      if (root.parent) _world.premultiply(root.parent.matrixWorld);
      const e = _inv.copy(_world).invert().elements;
      u.uVehGroundM.value[n * 3].set(e[0], e[4], e[8], e[12]);
      u.uVehGroundM.value[n * 3 + 1].set(e[1], e[5], e[9], e[13]);
      u.uVehGroundM.value[n * 3 + 2].set(e[2], e[6], e[10], e[14]);
      u.uVehGroundB.value[n * 4].set(h.hx, h.yb, h.yt, h.y0);
      u.uVehGroundB.value[n * 4 + 1].set(h.fz0, h.fz1, h.pz0, h.pz1);
      u.uVehGroundB.value[n * 4 + 2].set(h.hr, h.hf, h.xi, h.xo);
      u.uVehGroundB.value[n * 4 + 3].set(h.sr, h.sf, h.cz0, h.cz1);
      writeRunKnots(root, h, u.uVehGroundR.value, n * 4);
      _hullAt[n].setFromMatrixPosition(_world);
      n++;
    }
  }
  u.uVehGround.value = n;
  packGroundKeyLights(u, n, enabled && lightTune('GROUND_AO_KEY_LIGHTS', 1) > 0, keyLights);
}

const _hullAt = Array.from({ length: GROUND_AO_MAX_HULLS }, () => new THREE.Vector3());
const _lampAt = new THREE.Vector3();
const _picks: { light: THREE.PointLight; score: number; x: number; y: number; z: number }[] = [];

/** (contact r2) The strongest lamps at the packed hulls: lit, in a scene, within their range (and a hull's reach) of one. */
function packGroundKeyLights(u: VehicleGroundOcclusionUniforms, hulls: number, enabled: boolean,
  lights: Iterable<THREE.PointLight>): void {
  let count = 0;
  if (enabled && hulls > 0) {
    let picked = 0;
    for (const light of lights) {
      if (!(light.intensity > 1e-3) || !light.visible || !light.parent) continue;
      _lampAt.copy(light.position);
      light.parent.updateWorldMatrix(true, false);
      _lampAt.applyMatrix4(light.parent.matrixWorld);
      let near = Infinity;
      for (let i = 0; i < hulls; i++) near = Math.min(near, _lampAt.distanceTo(_hullAt[i]));
      if (light.distance > 0 && near > light.distance + 8) continue;
      const lum = light.intensity * (0.2126 * light.color.r + 0.7152 * light.color.g + 0.0722 * light.color.b);
      const score = lum / Math.max(near * near, 1);
      if (picked < _picks.length) Object.assign(_picks[picked], { light, score, x: _lampAt.x, y: _lampAt.y, z: _lampAt.z });
      else _picks.push({ light, score, x: _lampAt.x, y: _lampAt.y, z: _lampAt.z });
      picked++;
    }
    for (let k = 0; k < GROUND_AO_KEY_LIGHTS && k < picked; k++) {
      let best = k;
      for (let i = k + 1; i < picked; i++) if (_picks[i].score > _picks[best].score) best = i;
      if (best !== k) { const t = _picks[k]; _picks[k] = _picks[best]; _picks[best] = t; }
      const p = _picks[k], L = p.light;
      u.uVehKeyLightP.value[k].set(p.x, p.y, p.z, Math.max(L.distance, 0));
      u.uVehKeyLightE.value[k].set(L.intensity * (0.2126 * L.color.r + 0.7152 * L.color.g + 0.0722 * L.color.b), L.decay, 0, 0);
      count++;
    }
  }
  u.uVehKeyLight.value = count;
}



const f = (x: number): string => x.toFixed(4);
/** The hull's corners in the GLSL (b0 = (hx, yb, yt, y0), b1 = (fz0, fz1, pz0, pz1); yb, p0, p1, yr, yf clipped). */
const GLSL_CORNER: Record<HullCorner, string> = {
  T0R: 'vec3( b0.x, b0.z, b1.x )', T1R: 'vec3( b0.x, b0.z, b1.y )', E1R: 'vec3( b0.x, yf, b1.y )',
  P1R: 'vec3( b0.x, yb, p1 )', P0R: 'vec3( b0.x, yb, p0 )', E0R: 'vec3( b0.x, yr, b1.x )',
  T0L: 'vec3( -b0.x, b0.z, b1.x )', T1L: 'vec3( -b0.x, b0.z, b1.y )', E1L: 'vec3( -b0.x, yf, b1.y )',
  P1L: 'vec3( -b0.x, yb, p1 )', P0L: 'vec3( -b0.x, yb, p0 )', E0L: 'vec3( -b0.x, yr, b1.x )',
};
const GLSL_HULL_EDGES = HULL_EDGES.map(([u, w, fa, fb]) =>
  `      if ( f${fa} != f${fb} ) k += ( f${fa} - f${fb} ) * cotVgEdge( ${u}, ${w}, n );`).join('\n');

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses that block's cotSunVisOf, cotNormalAt
 * and rig uniforms, and the pass's uSunDir): `cotVehicleGroundShade(uv, P, alpha, dist)` → the multiplier for a ground
 * pixel's colour (1 = untouched).
 */
export const VEHICLE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-03: the ground's sky under and beside the near hulls (vehicleGroundOcclusion.ts)
    uniform float uVehGround;
    uniform vec4 uVehGroundM[ ${GROUND_AO_MAX_HULLS * 3} ];
    uniform vec4 uVehGroundB[ ${GROUND_AO_MAX_HULLS * 4} ];
    uniform vec4 uVehGroundR[ ${GROUND_AO_MAX_HULLS * 4} ];
    uniform vec4 uVehGroundLight;
    uniform vec4 uVehGroundR4;
    uniform vec4 uVehGroundR5;
    uniform vec4 uVehGroundR6;
    uniform float uVehGroundSnow;
    uniform float uVehKeyLight;
    uniform vec4 uVehKeyLightP[ ${GROUND_AO_KEY_LIGHTS} ];
    uniform vec4 uVehKeyLightE[ ${GROUND_AO_KEY_LIGHTS} ];
    // the drawn run's travel at z (root frame): its eight knots k0, k1 evenly over the ground run b3.z..b3.w, linear
    // between (hat weights), held past its ends
    float cotVgRun( vec4 k0, vec4 k1, float z, vec4 b3 ) {
      float t = clamp( ( z - b3.z ) / max( b3.w - b3.z, 1e-4 ), 0.0, 1.0 ) * ${(GROUND_AO_RUN_KNOTS - 1).toFixed(1)};
      return dot( k0, max( 1.0 - abs( t - vec4( 0.0, 1.0, 2.0, 3.0 ) ), 0.0 ) )
           + dot( k1, max( 1.0 - abs( t - vec4( 4.0, 5.0, 6.0, 7.0 ) ), 0.0 ) );
    }
    // (2026-10-10, round 3) a card at q in the hull's own shadow: the ray toward the sun s (the hull frame) meets the solid
    // over the belly or either run (hullSunShadow)
    float cotVgRayBox( vec3 q, vec3 inv, vec3 lo, vec3 hi ) {
      vec3 t0 = ( lo - q ) * inv, t1 = ( hi - q ) * inv;
      vec3 tmin = min( t0, t1 ), tmax = max( t0, t1 );
      float tn = max( max( tmin.x, tmin.y ), tmin.z ), tf = min( min( tmax.x, tmax.y ), tmax.z );
      return tf >= max( tn, 0.0 ) ? 1.0 : 0.0;
    }
    // (contact r2) how much the box shadows the segment q → q + d (its chord); a lamp k inside a solid (within
    // GROUND_AO_KEY_INSIDE_M) is never shadowed by it; the hull's solid over the belly and its runs (hullBlocksKeyLight)
    float cotVgSegBox( vec3 q, vec3 d, vec3 lo, vec3 hi ) {
      vec3 inv = 1.0 / ( d + vec3( 1e-7 ) );
      vec3 t0 = ( lo - q ) * inv, t1 = ( hi - q ) * inv;
      vec3 tmin = min( t0, t1 ), tmax = max( t0, t1 );
      float tn = max( max( tmin.x, tmin.y ), tmin.z ), tf = min( min( tmax.x, tmax.y ), tmax.z );
      // the chord the segment cuts through the box, whole from GROUND_AO_KEY_SOFT_M: a soft fringe where it grazes
      return smoothstep( 0.0, ${f(GROUND_AO_KEY_SOFT_M)}, ( min( tf, 1.0 ) - max( tn, 0.0 ) ) * length( d ) );
    }
    float cotVgInBox( vec3 p, vec3 lo, vec3 hi ) {
      return all( greaterThan( p, lo - ${f(GROUND_AO_KEY_INSIDE_M)} ) ) && all( lessThan( p, hi + ${f(GROUND_AO_KEY_INSIDE_M)} ) ) ? 1.0 : 0.0;
    }
    float cotVgKeyBlock( vec3 q, vec3 k, vec4 b0, vec4 b1, vec4 b2 ) {
      vec3 lo0 = vec3( -b0.x, b0.y, b1.x ), hi0 = vec3( b0.x, b0.z, b1.y );
      vec3 lo1 = vec3( b2.z, b0.w, b1.x ), hi1 = vec3( b2.w, b0.y, b1.y );
      vec3 lo2 = vec3( -b2.w, b0.w, b1.x ), hi2 = vec3( -b2.z, b0.y, b1.y );
      if ( cotVgInBox( k, lo0, hi0 ) + cotVgInBox( k, lo1, hi1 ) + cotVgInBox( k, lo2, hi2 ) > 0.0 ) return 0.0;
      vec3 d = k - q, g = vec3( ${f(GROUND_AO_KEY_GROW_M)}, 0.0, ${f(GROUND_AO_KEY_GROW_M)} );
      return max( cotVgSegBox( q, d, lo0 - g, hi0 + g ), max( cotVgSegBox( q, d, lo1 - g, hi1 + g ), cotVgSegBox( q, d, lo2 - g, hi2 + g ) ) );
    }
    // a lamp's irradiance (luminance) at P with normal N as three's punctual light draws it (keyLightIrradiance)
    float cotVgKeyE( vec4 p, vec4 e, vec3 P, vec3 N ) {
      vec3 lv = p.xyz - P;
      float d = length( lv );
      float fall = 1.0 / max( pow( d, e.y ), 0.01 );
      if ( p.w > 0.0 ) { float r = clamp( 1.0 - pow( d / p.w, 4.0 ), 0.0, 1.0 ); fall *= r * r; }
      return e.x * fall * max( dot( N, lv / max( d, 1e-4 ) ), 0.0 );
    }
    float cotVgSunShadow( vec3 q, vec3 s, vec4 b0, vec4 b1, vec4 b2 ) {
      vec3 inv = 1.0 / ( s + vec3( 1e-7 ) );
      return max( cotVgRayBox( q, inv, vec3( -b0.x, b0.y, b1.x ), vec3( b0.x, b0.z, b1.y ) ),
        max( cotVgRayBox( q, inv, vec3( b2.z, b0.w, b1.x ), vec3( b2.w, b0.y, b1.y ) ),
             cotVgRayBox( q, inv, vec3( -b2.w, b0.w, b1.x ), vec3( -b2.z, b0.y, b1.y ) ) ) );
    }
    // one silhouette edge of Lambert's projected solid angle (a, b relative to the receiver; their lengths cancel)
    float cotVgEdge( vec3 a, vec3 b, vec3 n ) {
      vec3 c = cross( a, b );
      float s = length( c );
      return s > 1e-9 ? atan( s, dot( a, b ) ) * dot( n, c ) / s : 0.0;
    }
    // the share of the cosine-weighted sky a box (half extents r) hides from q (relative to its centre), normal n:
    // Quilez's silhouette hexagon, signed by the octant's mirror parity
    float cotVgBox( vec3 q, vec3 n, vec3 r ) {
      vec3 sg = step( 0.0, q ) * 2.0 - 1.0;
      vec3 fq = r * sg;
      vec3 si = step( abs( q ), r ) * 2.0 - 1.0;
      vec3 v0 = vec3( 1.0, 1.0, -1.0 ) * fq - q;
      vec3 v1 = vec3( 1.0, si.x, si.x ) * fq - q;
      vec3 v2 = vec3( 1.0, -1.0, 1.0 ) * fq - q;
      vec3 v3 = vec3( si.z, si.z, 1.0 ) * fq - q;
      vec3 v4 = vec3( -1.0, 1.0, 1.0 ) * fq - q;
      vec3 v5 = vec3( si.y, 1.0, si.y ) * fq - q;
      float k = cotVgEdge( v0, v1, n ) + cotVgEdge( v1, v2, n ) + cotVgEdge( v2, v3, n )
              + cotVgEdge( v3, v4, n ) + cotVgEdge( v4, v5, n ) + cotVgEdge( v5, v0, n );
      return clamp( k * sg.x * sg.y * sg.z * ${INV_2PI.toFixed(7)}, 0.0, 1.0 );
    }
    // the share the hull solid hides from q (root frame), clipped at height c: its belly yb along p0..p1, the end plates
    // rising to yr at the rear end and yf at the front, each edge between a face turned to q and one turned away
    float cotVgHull( vec3 q, vec3 n, vec4 b0, vec4 b1, vec4 b2, float c ) {
      float yb = max( b0.y, c );
      if ( yb >= b0.z ) return 0.0;
      float lift = max( c - b0.y, 0.0 );
      float p0 = b2.x > 0.0 ? max( b1.x, b1.z - lift / max( b2.x, 1e-6 ) ) : b1.z;
      float p1 = b2.y > 0.0 ? min( b1.y, b1.w + lift / max( b2.y, 1e-6 ) ) : b1.w;
      float yr = min( b0.z, max( yb, b0.y + b2.x * ( b1.z - b1.x ) ) );
      float yf = min( b0.z, max( yb, b0.y + b2.y * ( b1.y - b1.w ) ) );
${(Object.keys(GLSL_CORNER) as HullCorner[]).map((k) => `      vec3 ${k} = ${GLSL_CORNER[k]} - q;`).join('\n')}
      float fTop = q.y > b0.z ? 1.0 : 0.0, fBot = q.y < yb ? 1.0 : 0.0;
      float fRend = q.z < b1.x ? 1.0 : 0.0, fFend = q.z > b1.y ? 1.0 : 0.0;
      float fRight = q.x > b0.x ? 1.0 : 0.0, fLeft = q.x < -b0.x ? 1.0 : 0.0;
      float fRpl = -( p0 - b1.x ) * ( q.y - yr ) - ( yr - yb ) * ( q.z - b1.x ) > 0.0 ? 1.0 : 0.0;
      float fFpl = -( b1.y - p1 ) * ( q.y - yf ) + ( yf - yb ) * ( q.z - b1.y ) > 0.0 ? 1.0 : 0.0;
      float k = 0.0;
${GLSL_HULL_EDGES}
      return clamp( -k * ${INV_2PI.toFixed(7)}, 0.0, 1.0 );
    }
    float cotVehicleGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      float fade = 1.0 - smoothstep( ${f(GROUND_AO_RANGE_M - GROUND_AO_FADE_M)}, ${f(GROUND_AO_RANGE_M)}, dist );
      float sunVis = cotSunVisOf( alpha );
      // (2026-10-14, contact r2) the receiver's own snow cover weighs the snow law (the terrain's, in the scene alpha)
      float snowW = uVehGroundSnow * cotSnowOf( alpha );
      // what a blocked direction keeps of its darkening: one minus the occluder's own light over the sky's (first-order
      // interreflection) — the belly lit by the open ground it glimpses, a wall by half sky and half ground
      float aUp = uContactAmb.x + uContactAmb.z + uContactAmb.w * max( uContactFillDir.y, 0.0 );
      float kSun = uContactSunLum * max( uSunDir.y, 0.0 ) / max( aUp, 1e-4 );
      vec4 lt = uVehGroundLight;
      float sBelly = clamp( 1.0 - lt.y * lt.x * ( lt.z * ( 1.0 + kSun ) + ( 1.0 - lt.z ) * lt.w ), 0.0, 1.0 );
      float sWall = clamp( 1.0 - lt.y * ( 0.5 + 0.5 * lt.x * ( 1.0 + 0.5 * kSun ) ), 0.0, 1.0 );
      vec3 N = vec3( 0.0, 1.0, 0.0 );
      bool haveN = false;
      float vis = 1.0;
      float under = 0.0; // a card in a hull's own shadow (no sun reaches it there): its light is all ambient
      // (round 4) the contact line's core (past the joint cap), the shoe band's sun shadow, the snow berm's sun gain
      float occCore = 0.0;
      float band = 0.0;
      float bermGain = 1.0;
      // (round 5) how far a card stands in a run's running gear (its cap may reach the gear's)
      float gearW = 0.0;
      float keyB0 = 0.0, keyB1 = 0.0; // (contact r2) the FX lamps a hull stands in front of, faded over the reach's end
      for ( int i = 0; i < ${GROUND_AO_MAX_HULLS}; i++ ) {
        if ( float( i ) >= uVehGround ) break;
        vec4 m0 = uVehGroundM[ i * 3 ], m1 = uVehGroundM[ i * 3 + 1 ], m2 = uVehGroundM[ i * 3 + 2 ];
        vec3 q = vec3( dot( m0.xyz, P ) + m0.w, dot( m1.xyz, P ) + m1.w, dot( m2.xyz, P ) + m2.w );
        vec4 b0 = uVehGroundB[ i * 4 ], b1 = uVehGroundB[ i * 4 + 1 ], b2 = uVehGroundB[ i * 4 + 2 ], b3 = uVehGroundB[ i * 4 + 3 ];
        float H = b0.z - b0.w;
        vec2 dd = vec2( abs( q.x ) - b0.x, abs( q.z - 0.5 * ( b1.x + b1.y ) ) - 0.5 * ( b1.y - b1.x ) );
        float dOut = length( max( dd, vec2( 0.0 ) ) );
        if ( dOut > H * ${f(GROUND_AO_REACH[1])} || q.y > b0.z || q.y < b0.w - H * ${f(GROUND_AO_REACH[1])} ) continue;
        // the vehicle itself is never a receiver: the hull over its belly along its whole length (a marking decal or glass
        // blended over it no longer carries the vehicle tag); (round 5) the shoes carry the vehicle tag since 2026-10-04 and
        // never reach this block, so the old skip of every card in their lane over the track's lower edge — it exempted the
        // grass standing in the running gear — runs only on the lever (uVehGroundR6.y)
        if ( q.y > b0.y + 0.02 && dOut < ${f(GROUND_AO_HULL_SKIN_M)} ) continue;
        float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );
        // the run on q's side as drawn this frame (the road wheels' travel the band follows; tankFactoryCore.ts), read
        // only where a pixel stands in a track's lane: the shoe test here, the contact below (2026-10-09, the cost lane:
        // every pixel in the hull's reach read the knots and kept them live through the solid's terms)
        int rk = i * 4 + ( q.x < 0.0 ? 0 : 2 );
        if ( uVehGroundR6.y > 0.5 && sunVis < 0.0 && laneD > ${f(-GROUND_AO_LANE_MARGIN_M)} && q.y < b0.z + ${f(GROUND_AO_RUN_END_M)} && q.z > b1.x && q.z < b1.y ) {
          float run = cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 );
          float ramp = ( q.z < b3.z ? b3.x : b3.y ) * max( max( b3.z - q.z, q.z - b3.w ), 0.0 );
          if ( q.y >= b0.w + run + max( ${f(GROUND_AO_SHOE_FLOOR_M)}, ramp - ${f(GROUND_AO_RAMP_TOL_M)} ) ) continue;
        }
        // (round 4) the gap normal's guard: where the depth breaks on both sides of an axis the hull's up stands in
        // (round 5) a card inside the lane along the ground run stands in the running gear's own shade
        if ( sunVis < 0.0 ) gearW = max( gearW, smoothstep( 0.0, 0.02, laneD ) * smoothstep( b3.z - 0.05, b3.z + 0.05, q.z )
          * ( 1.0 - smoothstep( b3.w - 0.05, b3.w + 0.05, q.z ) ) );
        if ( !haveN ) { haveN = true; if ( sunVis >= 0.0 ) N = uVehGroundR5.y > 0.5 ? cotNormalAtGuarded( uv, P, normalize( m1.xyz ), dist ) : cotNormalAt( uv, P ); }
        vec3 n = normalize( vec3( dot( m0.xyz, N ), dot( m1.xyz, N ), dot( m2.xyz, N ) ) );
        // the solid clipped at the receiver's horizon (exact for a level receiver; a wall facing the hull keeps it whole)
        float c = q.y - ${f(GROUND_AO_CLIP_SLACK_M)} * ( 1.0 - n.y );
        float ho = cotVgHull( q, n, b0, b1, b2, c );
        // between the runs: the side gaps under the hull's edges, the part of each run's ground run below the plane
        // through q and the edge beyond it (past the ground run faded in from the runs' inner faces)
        if ( abs( q.x ) < b2.z ) {
          float gap = 0.0;
          float zc = clamp( q.z, b1.x, b1.y );
          float belly = min( b0.z, b0.y + max( 0.0, max( b2.x * ( b1.z - zc ), b2.y * ( zc - b1.w ) ) ) );
          // each run from its lower edge as drawn beside q (the ground under a lifted run lets the gap's sky through)
          float loR = max( b0.w + cotVgRun( uVehGroundR[ i * 4 + 2 ], uVehGroundR[ i * 4 + 3 ], q.z, b3 ), c );
          float loL = max( b0.w + cotVgRun( uVehGroundR[ i * 4 ], uVehGroundR[ i * 4 + 1 ], q.z, b3 ), c );
          float topR = q.y + ( belly - q.y ) * ( b2.z - q.x ) / ( b0.x - q.x );
          if ( topR > loR ) gap += cotVgBox( vec3( q.x - 0.5 * ( b2.z + b2.w ), q.y - 0.5 * ( loR + topR ), q.z - 0.5 * ( b3.z + b3.w ) ), n,
            vec3( 0.5 * ( b2.w - b2.z ), 0.5 * ( topR - loR ), 0.5 * ( b3.w - b3.z ) ) );
          float topL = q.y + ( belly - q.y ) * ( b2.z + q.x ) / ( b0.x + q.x );
          if ( topL > loL ) gap += cotVgBox( vec3( q.x + 0.5 * ( b2.z + b2.w ), q.y - 0.5 * ( loL + topL ), q.z - 0.5 * ( b3.z + b3.w ) ), n,
            vec3( 0.5 * ( b2.w - b2.z ), 0.5 * ( topL - loL ), 0.5 * ( b3.w - b3.z ) ) );
          float wrap = smoothstep( -0.04, 0.0, max( b3.z - q.z, q.z - b3.w ) - ${f(GROUND_AO_CONTACT_MARGIN_M)} );
          ho += gap * mix( 1.0, smoothstep( 0.0, ${f(GROUND_AO_GAP_FADE_M)}, b2.z - abs( q.x ) ), wrap );
        }
        ho *= 1.0 - smoothstep( H * ${f(GROUND_AO_REACH[0])}, H * ${f(GROUND_AO_REACH[1])}, dOut );
        // the belly's strength under the hull, the walls' beside it, blended across the footprint's edge; (round 4) the broad
        // share softened outside the footprint, from its edge out (the rim and the core hold the contact)
        float sd = dOut + min( max( dd.x, dd.y ), 0.0 );
        float inside = 1.0 - smoothstep( ${f(-GROUND_AO_EDGE_M)}, ${f(GROUND_AO_EDGE_M)}, sd );
        ho *= mix( 1.0, mix( uVehGroundR5.x, 1.0, snowW ), smoothstep( 0.0, ${f(2 * GROUND_AO_EDGE_M)}, sd ) );
        // the track's contact (2026-10-09, round 3): a soft rim hugging the drawn run — whole in the shoes' lane, gone a
        // spread outside its faces (squared), by the receiver's height against the run's lower edge as drawn (the wraps'
        // ramp past the ground run): the ground under a lifted run gone a gap under it, a blade or the ground standing into
        // a sunk run gone a rise over it; at most the contact's cap, joined to the solid's share by the larger, never the
        // sum (only a pixel near a lane reads the run: ho is never negative, so elsewhere the max keeps ho as it was)
        float lane = 1.0 - smoothstep( 0.0, ${f(GROUND_AO_CONTACT_SPREAD_M)}, -laneD );
        lane *= lane * smoothstep( 0.0, ${f(GROUND_AO_CONTACT_EDGE_M)}, min( q.z - b1.x, b1.y - q.z ) );
        if ( lane > 0.0 ) {
          float run = cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 );
          float ramp = ( q.z < b3.z ? b3.x : b3.y ) * max( max( b3.z - q.z, q.z - b3.w ), 0.0 );
          float dv = q.y - ( b0.w + run + ramp );
          float vert = dv >= 0.0 ? 1.0 - smoothstep( 0.0, ${f(GROUND_AO_CONTACT_RISE_M)}, dv )
            : 1.0 - smoothstep( ${f(GROUND_AO_CONTACT_FULL_M)}, ${f(GROUND_AO_CONTACT_GAP_M)}, -dv );
          ho = max( ho, ${f(GROUND_AO_CONTACT_MAX)} * lane * vert );
          // (round 4) the crease: a core a few centimetres either side of the shoes' faces, at the run's lower edge;
          // (2026-10-14) on snow the groove of packed snow the foot stands in: wider, over the rim's vertical reach
          float cw = 1.0 - smoothstep( mix( ${f(GROUND_AO_CORE_FLAT * GROUND_AO_CORE_W_M)}, ${f(GROUND_AO_CORE_FULL_SNOW_M)}, snowW ),
            mix( ${f(GROUND_AO_CORE_W_M)}, ${f(GROUND_AO_CORE_W_SNOW_M)}, snowW ), -laneD );
          occCore = max( occCore, ${f(GROUND_AO_CORE_MAX)} * uVehGroundR4.x * cw
            * smoothstep( 0.0, ${f(GROUND_AO_CONTACT_EDGE_M)}, min( q.z - b1.x, b1.y - q.z ) )
            * mix( 1.0 - smoothstep( 0.0, ${f(GROUND_AO_CORE_GAP_M)}, abs( dv ) ), vert, snowW ) );
        }
        vis *= 1.0 - min( ho, 1.0 ) * mix( sWall, sBelly, inside );
        // (contact r2) the FX lamps this hull shadows on a lit receiver (the lamp in the hull frame)
        if ( uVehKeyLight > 0.5 && sunVis >= 0.0 ) {
          float kw = 1.0 - smoothstep( H * ${f(GROUND_AO_KEY_FADE[0])}, H * ${f(GROUND_AO_KEY_FADE[1])}, dOut );
          vec3 L0 = uVehKeyLightP[ 0 ].xyz;
          keyB0 = max( keyB0, kw * cotVgKeyBlock( q, vec3( dot( m0.xyz, L0 ) + m0.w, dot( m1.xyz, L0 ) + m1.w, dot( m2.xyz, L0 ) + m2.w ), b0, b1, b2 ) );
          if ( uVehKeyLight > 1.5 ) {
            vec3 L1 = uVehKeyLightP[ 1 ].xyz;
            keyB1 = max( keyB1, kw * cotVgKeyBlock( q, vec3( dot( m0.xyz, L1 ) + m0.w, dot( m1.xyz, L1 ) + m1.w, dot( m2.xyz, L1 ) + m2.w ), b0, b1, b2 ) );
          }
        }
        // (round 4) beyond a run's outer face: the shoe band's sun shadow (the crease the cascades' bias leaves lit) and, on
        // snow, the berm the shoes push aside (its slopes turn the sun share)
        float beyond = abs( q.x ) - b2.w;
        float berm = uVehGroundR4.z * snowW; // (contact r2) the berm on the receiver's own snow
        if ( beyond > -0.005 && beyond < ${f(GROUND_AO_BAND_REACH_M)} && uVehGroundR4.y + berm > 0.0 ) {
          vec3 sR = normalize( vec3( dot( m0.xyz, uSunDir ), dot( m1.xyz, uSunDir ), dot( m2.xyz, uSunDir ) ) );
          float toward = -sign( q.x ) * sR.x;
          if ( uVehGroundR4.y > 0.0 && toward > 1e-3 && sR.y > 0.0 ) {
            float t = max( beyond, 0.0 ) / toward;
            float zHit = q.z + t * sR.z;
            float top = b0.w + cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], zHit, b3 ) + ${f(GROUND_AO_BAND_H_M)};
            float pen = ${f(GROUND_AO_BAND_PEN_M)} + ${f(GROUND_AO_BAND_PEN_PER_M)} * max( beyond, 0.0 );
            band = max( band, ( 1.0 - smoothstep( top - pen, top + pen, q.y + t * sR.y ) )
              * smoothstep( b3.z - 0.05, b3.z + 0.05, zHit ) * ( 1.0 - smoothstep( b3.w - 0.05, b3.w + 0.05, zHit ) ) );
          }
          if ( berm > 0.0 && beyond > 0.0 && beyond < ${f(GROUND_AO_BERM_W_M)} ) {
            float zw = smoothstep( b3.z - 0.1, b3.z + 0.2, q.z ) * ( 1.0 - smoothstep( b3.w - 0.2, b3.w + 0.1, q.z ) );
            float vw = 1.0 - smoothstep( 0.03, 0.08, abs( q.y - b0.w - cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 ) ) );
            float slope = berm * zw * vw * ${f((4 * GROUND_AO_BERM_H_M) / GROUND_AO_BERM_W_M)}
              * ( 1.0 - 2.0 * beyond / ${f(GROUND_AO_BERM_W_M)} );
            vec3 bn = normalize( n - vec3( slope * sign( q.x ), 0.0, 0.0 ) );
            float t0 = max( dot( n, sR ), 0.0 );
            if ( t0 > 1e-3 ) bermGain *= min( max( dot( bn, sR ), 0.0 ) / t0, 2.0 );
          }
        }
        // a card (no sun state) takes the whole ambient share only in the hull's own shadow (round 3: inside the footprint
        // below the belly it did so sunlit too — a near-black band of sunlit grass under a skirt); with the sun under the
        // horizon, inside the footprint below the belly as before
        if ( sunVis < 0.0 && under < 1.0 ) under = max( under, uSunDir.y > 0.0
          ? cotVgSunShadow( q, vec3( dot( m0.xyz, uSunDir ), dot( m1.xyz, uSunDir ), dot( m2.xyz, uSunDir ) ), b0, b1, b2 )
          : inside * step( q.y, b0.y ) );
      }
      // (2026-10-10, round 3) the hulls' joint share capped: the ground keeps a part of its sky under any belly; (round 4)
      // the contact line's core by the larger, past the cap (a few centimetres wide: a line, never a slab)
      // (round 5) a card in the running gear: its cap up to the gear's; (contact r2) on the receiver's own snow the snow's
      float cap = mix( uVehGroundR5.z, ${f(GROUND_AO_OCC_MAX_SNOW)}, snowW );
      float occ = max( min( 1.0 - vis, mix( cap, max( cap, uVehGroundR6.z ), gearW ) ), occCore ) * fade;
      // (round 4) the sun share's loss: the band's shadow, the berm's slopes (a lit lip gains: negative)
      float sunCut = ( 1.0 - ( 1.0 - band ) * bermGain ) * fade;
      if ( occ <= 0.003 && abs( sunCut ) <= 0.003 && max( keyB0, keyB1 ) <= 0.0 ) return 1.0;
      // a card has no sun state: half in sun in the open, all ambient in a hull's own shadow
      float ambShare = mix( ${f(GROUND_AO_CARD_AMBIENT_SHARE)}, 1.0, under );
      float sunShare = 1.0 - ambShare;
      float keyCut = 0.0;
      if ( sunVis >= 0.0 ) {
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        // (contact r2) the FX lamps' light joins the total; the blocked lamps' shares leave it (groundShadeWithKeyLights)
        float E0 = 0.0, E1 = 0.0;
        if ( uVehKeyLight > 0.5 ) {
          E0 = cotVgKeyE( uVehKeyLightP[ 0 ], uVehKeyLightE[ 0 ], P, N );
          if ( uVehKeyLight > 1.5 ) E1 = cotVgKeyE( uVehKeyLightP[ 1 ], uVehKeyLightE[ 1 ], P, N );
        }
        float D = max( T + A + E0 + E1, 1e-4 );
        ambShare = A / D;
        sunShare = T / D;
        keyCut = ( keyB0 * E0 + keyB1 * E1 ) * fade / D;
      }
      return 1.0 - occ * ambShare - sunShare * sunCut - keyCut;
    }
    // (round 4) a vehicle pixel's grime: the dirt a run carries toward its foot (vehicleGrime; none on snow) — the colour
    // multiplier the aerial pass gives the hulls' own pixels
    float cotVehicleGrime( vec3 P ) {
      float g = 1.0;
      if ( uVehGroundR4.w <= 0.0 ) return g;
      for ( int i = 0; i < ${GROUND_AO_MAX_HULLS}; i++ ) {
        if ( float( i ) >= uVehGround ) break;
        vec4 m0 = uVehGroundM[ i * 3 ], m1 = uVehGroundM[ i * 3 + 1 ], m2 = uVehGroundM[ i * 3 + 2 ];
        vec3 q = vec3( dot( m0.xyz, P ) + m0.w, dot( m1.xyz, P ) + m1.w, dot( m2.xyz, P ) + m2.w );
        vec4 b0 = uVehGroundB[ i * 4 ], b1 = uVehGroundB[ i * 4 + 1 ], b2 = uVehGroundB[ i * 4 + 2 ], b3 = uVehGroundB[ i * 4 + 3 ];
        float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );
        if ( laneD < ${f(-GROUND_AO_GRIME_LANE_M)} || q.z < b1.x || q.z > b1.y || q.y > b0.w + 0.6 ) continue;
        int rk = i * 4 + ( q.x < 0.0 ? 0 : 2 );
        float ramp = ( q.z < b3.z ? b3.x : b3.y ) * max( max( b3.z - q.z, q.z - b3.w ), 0.0 );
        float w = 1.0 - smoothstep( 0.0, ${f(GROUND_AO_GRIME_H_M)}, q.y - ( b0.w + cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 ) + ramp ) );
        g = min( g, 1.0 - ${f(GROUND_AO_GRIME_MAX)} * uVehGroundR4.w * w * w );
      }
      return g;
    }
    // (round 5) the ground's shade as a colour: on snow (contact r2: the receiver's own cover, by the lever uVehGroundR6.x)
    // the darkening takes the cool cast of a shadow on snow
    vec3 cotVehicleGroundShadeRgb( vec2 uv, vec3 P, float alpha, float dist ) {
      float s = cotVehicleGroundShade( uv, P, alpha, dist );
      return s * mix( vec3( 1.0 ), vec3( ${GROUND_AO_SNOW_COOL.map(f).join(', ')} ),
        ( 1.0 - s ) * uVehGroundR6.x * uVehGroundSnow * cotSnowOf( alpha ) );
    }
    // (round 5) the contact blend (GROUND_AO_BLEND_H_M): a vehicle pixel near a run's lower edge, in its lane along the ground
    // run, takes a share of the colour of the ground just beyond the run's outer face at its foot — the pre-pass scene there,
    // shaded as this block shades that ground — so the track's foot reads set into the turf or packed with snow; a sample that
    // lands on a vehicle pixel (the hull, a neighbour) is never borrowed
    vec3 cotVehicleContactBlend( vec3 rgb, vec3 P ) {
      if ( uVehGroundR6.w <= 0.0 ) return rgb;
      // on snow: packed snow round the foot — an uneven opaque line, its height along the ground (snowBlendNoise, world space);
      // (contact r2) the snow is the borrowed ground's own cover, so the reach is the snow's tallest until it is read
      float sn = clamp( 0.5 + 0.22 * sin( 1.9 * P.z + 0.7 * P.x + 1.7 ) + 0.16 * sin( 4.7 * P.z - 1.3 * P.x + 0.4 )
        + 0.12 * sin( 9.3 * P.z + 2.1 * P.x + 2.2 ), 0.0, 1.0 );
      float snowH = ${f(GROUND_AO_BLEND_H_SNOW_M)} * ( ${f(1 - GROUND_AO_BLEND_SNOW_VARY)} + ${f(2 * GROUND_AO_BLEND_SNOW_VARY)} * sn );
      float reach = mix( ${f(GROUND_AO_BLEND_H_M)}, max( snowH, ${f(GROUND_AO_BLEND_H_M)} ), clamp( uVehGroundSnow, 0.0, 1.0 ) );
      for ( int i = 0; i < ${GROUND_AO_MAX_HULLS}; i++ ) {
        if ( float( i ) >= uVehGround ) break;
        vec4 m0 = uVehGroundM[ i * 3 ], m1 = uVehGroundM[ i * 3 + 1 ], m2 = uVehGroundM[ i * 3 + 2 ];
        vec3 q = vec3( dot( m0.xyz, P ) + m0.w, dot( m1.xyz, P ) + m1.w, dot( m2.xyz, P ) + m2.w );
        vec4 b0 = uVehGroundB[ i * 4 ], b2 = uVehGroundB[ i * 4 + 2 ], b3 = uVehGroundB[ i * 4 + 3 ];
        float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );
        if ( laneD < ${f(-GROUND_AO_GRIME_LANE_M)} || q.z < b3.z - 0.1 || q.z > b3.w + 0.1 ) continue;
        int rk = i * 4 + ( q.x < 0.0 ? 0 : 2 );
        float foot = b0.w + cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 );
        float dv = q.y - foot;
        if ( dv > reach || dv < -0.05 ) continue;
        // the ground beyond the outer face at the foot: rows m0, m1 are the hull's world→root rows, so the world step
        // m0.xyz / |m0|² moves q.x by one (and q.y not at all), m1.xyz / |m1|² q.y
        float sx = q.x < 0.0 ? -1.0 : 1.0;
        vec3 Pg = P + m0.xyz * ( ( sx * ( b2.w + ${f(GROUND_AO_BLEND_OUT_M)} ) - q.x ) / dot( m0.xyz, m0.xyz ) )
          + m1.xyz * ( ( foot - q.y ) / dot( m1.xyz, m1.xyz ) );
        vec4 c = uContactViewProj * vec4( Pg, 1.0 );
        if ( c.w <= uNear ) continue;
        vec2 guv = c.xy / c.w * 0.5 + 0.5;
        if ( any( lessThan( guv, vec2( 0.0 ) ) ) || any( greaterThan( guv, vec2( 1.0 ) ) ) ) continue;
        vec4 g = texture2D( tDiffuse, guv );
        if ( g.a >= ${f(VEHICLE_ALPHA_MIN)} ) continue;
        float snow = uVehGroundSnow * cotSnowOf( g.a );
        float height = mix( ${f(GROUND_AO_BLEND_H_M)}, snowH, snow );
        if ( dv > height ) continue;
        float w = ( 1.0 - smoothstep( ${f(GROUND_AO_BLEND_SNOW_SOLID)} * snow * height, height, dv ) ) * smoothstep( b3.z - 0.1, b3.z + 0.05, q.z )
          * ( 1.0 - smoothstep( b3.w - 0.05, b3.w + 0.1, q.z ) ) * mix( ${f(GROUND_AO_BLEND_MAX)}, ${f(GROUND_AO_BLEND_MAX_SNOW)}, snow ) * uVehGroundR6.w;
        if ( w <= 0.003 ) continue;
        float gd = cotDepthToDist( texture2D( tDepth, guv ).x );
        vec3 gc = g.rgb * cotVehicleGroundShadeRgb( guv, cotWorldAtDepth( guv, gd ), g.a, gd );
        return mix( rgb, gc, w );
      }
      return rgb;
    }
`;
