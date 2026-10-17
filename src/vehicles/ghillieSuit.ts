import * as THREE from 'three';
import { KIT } from './profiles/kit.ts';
import { cloneVehicleMaterial, followVehicleScheme, resolveCamoVisual, type MaterialTankSpec } from './materials.ts';
import type { MaterialVisual } from './materialPainter.ts';
import { oplotFlankOuterX } from './oplotFlankLayout.ts';
import {
  configureFoliageMaterial, FoliageCardBuffer, foliageCardPoints, GARNISH_BOUGH_TILES, GARNISH_STRIP_BASE_SRGB, GARNISH_STRIP_TILES,
  ghillieGarnishAtlas, vehicleFoliageAtlas, type FoliageCard, type VehicleFoliageKind,
} from './vehicleFoliage.ts';
import type { SprayKind } from '../world/treeSprayAtlas.ts';
import { GHILLIE_FIELD_OK, GHILLIE_TOP_CARDS, GHILLIE_TOP_VERTICES } from './ghillieDrape.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { tankSeedId } from './tankIdAliases.ts';
import {
  FIELD_NET_PALETTES, garnishedNetTextures, NET_PALETTES, NET_TEXTURE_PX, NET_TILE_M, suitTheatreOf, theatreOfHex, type NetPalette,
  type SuitTheatre,
} from './camoNetTexture.ts';
import { FLEET_GHILLIE_SUITS } from './ghillieFleetSuits.ts';
import { minimumMechanicalGunPitch, type GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import { MISSION_DOCK_SEATS } from '../sim/missionDockSeats.generated.ts';
import { vehicleMarkingSeats } from './vehicleMarkingSeatRegistry.ts';
import { missionAirframeVolumes, missionCradleVolumes } from '../sim/missionDockVolumes.ts';

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type GhillieStyle = 'leafy' | 'ulcans' | 'nakidka';
type GhillieOwner = 'hull' | 'turret' | 'gun';
type DisposableResource = { dispose(): void };

interface TopPanel {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  nx?: number;
  nz?: number;
  yAt(x: number, z: number): number;
  outline?: readonly Point2[];
  holes?: readonly (readonly Point2[])[];
  /** Remove every cell any of whose corners falls in an opening (the authored A4 openings' rule), not just its centre. */
  strictHoles?: boolean;
  /** Regions where the carrier continues but no spray may sit (track lanes at the hull's ends). */
  foliageExclude?: readonly (readonly Point2[])[];
  seatGapM?: number;
  seat?: string;
  seed?: number;
  /** Garnish only within this distance of the panel's outer edge (a hull deck under the turret's sweep). */
  garnishEdgeBandM?: number;
  /**
   * The highest a spray's stem line may stand above this carrier (default 0.22 m; low under the turret and gun sweep). On
   * a field net (fieldClearanceM) the highest any point of a card may stand over the net, at most FIELD_TOP_LIFT_M
   * (netting-proper, 2026-10-13: the fix round had raised it to 0.42 m on a hull, 0.55 m on a turret).
   */
  garnishRiseM?: number;
  /** Scales the panel's garnish count (default 1). */
  garnishDensity?: number;
  /** Clear margin around every opening (hatches, sights; default 0.09 m). */
  garnishOpeningMarginM?: number;
  /** Scales an unseated carrier's billow and gathered folds (default 1; a hull deck under the turret's sweep keeps it low). */
  reliefScale?: number;
  /** Scales the roll bunched round each opening of an unseated carrier (default 1; low under a roof gun's sweep). */
  rimScale?: number;
  /**
   * Round 5: where the crew pushed sticks and boughs under the net, [x, z, height] (each holds up a hump the net sags
   * away from, with a bough standing out of it). Omitted on a turret roof, a seeded few; a hull deck carries none.
   */
  tents?: readonly (readonly [number, number, number])[];
  /**
   * 2026-10-09 (launch RC; ghillieSuit.selftest, "suit triangles pass into the cage"): an unseated net's floor over the
   * surface its probe reports, in metres. Where the net sags off its supports onto something under it, it rests on that
   * at this loft instead of sinking into it. A cage wing's laid net sets it: at the edge of the cut round t80u_zoria's
   * drone dock, the net sagging into the opening ran its edge through the row tube beneath it.
   */
  restOnProbeM?: number;
  /**
   * 2026-10-09 (the netting lane; the owner: "add a ton more netting ... all over"): the carrier's authored height is
   * read from the owner's armour where the probe finds it (the highest surface within 3.5 cm), so a net laid over a
   * whole roof or deck follows every step and slope of it; `yAt` holds only where no armour answers.
   */
  yFromArmour?: boolean;
  /**
   * The netting lane (yFromArmour): armour standing more than this above the panel's `yAt` level (a frame post, a mast
   * foot, a tall box) is cut round instead of lifting the net onto its top (default 0.35 m).
   */
  riseLimitM?: number;
  /**
   * The netting lane: the net exists only over the owner's own armour (a cell none of whose corners has armour under
   * it within 0.3 m of its carrier is left out), so a panel authored over the vehicle's whole plan view ends at the
   * roof's or deck's edge, where the flank drapes take over, instead of standing out past it as a shelf.
   */
  clipToArmour?: boolean;
  /**
   * The netting lane: openings cut round every lens (glass), hatch lid and cupola of the owner (its merged Glass, Hatch
   * and Cupola buckets, component by component) with this margin in metres; a sight or vision block is never netted
   * over and every hatch still opens.
   */
  autoOpeningsM?: number;
  /**
   * The netting lane: openings cut in the cloth only (the lens view slots autoOpeningsM adds): the garnish keeps no
   * margin from them, its own lens cones keep it out of each view.
   */
  slots?: Point2[][];
}

interface SidePanel {
  side: number;
  z0: number;
  z1: number;
  nz?: number;
  ny?: number;
  topAt(z: number): number;
  bottomAt(z: number): number;
  outAt(z: number, t: number): number;
  seed?: number;
  /**
   * Round 3: the drape rolls over the wall's top edge into the roof net between z0 and z1 instead of ending in a free
   * edge — from its top (outAt(z, 1), topAt(z)) up and inboard to the roof net's edge (inAt(z), yAt(z)).
   */
  shoulder?: { readonly z0: number; readonly z1: number; inAt(z: number): number; yAt(z: number): number };
  /**
   * 2026-10-09 (launch RC; nationalUkraineProtection.selftest, the continuous main-gun envelope): the drape is tied
   * under the rail it hangs from and never rolls over that rail's top. Its probe-placed section is cut at topAt(z), so
   * the cloth starts at its authored top line, inside the lashings that bind it to the rail. Push 3b's Ukrainian hull
   * screens set their headers to just clear the gun's outer traverse reach. A net rolled over a header's top stood
   * inside that sweep on three of the four hulls.
   */
  tiedTop?: boolean;
  /**
   * 2026-10-09 (the netting lane): boxes [z0, z1, yLo, yHi] the drape is cut away over (a smoke discharger bank, a
   * light, a sight window or an exhaust on the wall it hangs past), from yHi down to the hem: no cloth hangs on below a
   * cut, and no garnish reaches into it either (yLo documents the fitting's foot).
   */
  cuts?: readonly (readonly [number, number, number, number])[];
}

interface FacePanel {
  z: number;
  zAt?(x: number, y: number): number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  nx?: number;
  ny?: number;
  outline?: readonly Point2[];
  holes?: readonly (readonly Point2[])[];
  strictHoles?: boolean;
  seatGapM?: number;
  seat?: string;
  seed?: number;
}

interface GhilliePanels {
  top?: readonly TopPanel[];
  side?: readonly SidePanel[];
  face?: readonly FacePanel[];
}

export interface GhillieConfig {
  id: string;
  seed: number;
  style: GhillieStyle;
  density: number;
  leafScale: number;
  light: number;
  dark: number;
  netColor: string;
  disabled?: boolean;
  foliage?: boolean;
  /** The certified half-width no spray may reach past (a suit with a width receipt; default unbounded). */
  maxHalfWidth?: number;
  /** The lowest a hull drape's hem may hang, metres (default NET_HEM_FLOOR_M, the running-gear corridor). */
  hemFloorM?: number;
  /** The share of the garnish's bunches that are cut boughs rather than strips (default: the theatre palette's). */
  boughShare?: number;
  /**
   * The garnish tucked into the net: a species spray atlas of the trees lane (src/world/treeSprayAtlas.ts) for
   * leafy suits, or a painted multispectral cut garnish. Defaults by style (leafy: oak; ulcans / nakidka: woodland).
   */
  foliageKind?: VehicleFoliageKind;
  /**
   * 2026-10-09 (the netting lane): the suit keeps itself clear of the working vehicle with this clearance in metres.
   * The hull's net and garnish stay under the turret's underside through its whole traverse; the turret's stay above
   * the hull (armour, fittings and the hull's own suit) through it, its drape hems raised to suit; neither enters the
   * main gun's swept volume (its depression by turret yaw and its full elevation); no garnish stands in a lens's view or
   * a smoke discharger's line of fire, and no cloth stands off its armour there. Unset on the round-5 suits, which keep
   * their receipts.
   */
  fieldClearanceM?: number;
  /**
   * 2026-10-12 (cam-netting, the UA roofs and decks): the hull's suit also keeps under the main gun's continuous envelope
   * as the protection receipt draws it (profiles/nationalUkraineProtection.selftest fullMainGunEnvelope: the gun's
   * 10 cm slices at full depression to full elevation, recoil included, at every yaw), a stricter reach than the
   * yaw-aware clearance over the decks behind and ahead of the turret. Needs fieldClearanceM.
   */
  conservativeGunEnvelope?: boolean;

  /**
   * The netting lane: the seed of the painted net texture (default: the suit's seed). Suits sharing one share a single
   * texture pair (camoNetTexture.ts caches by theatre and seed); each panel's own offset keeps them from matching.
   */
  netTextureSeed?: number;
  /**
   * 2026-10-13 (netting-pl; the coordinator on the owner's performance push: "thin the garnish's triangle cost (fewer
   * cards per clump, LOD the far clumps) rather than raise ceilings"): a field suit's garnish budget. `clumpCards` keeps
   * that share of each clump's boughs and strips (at least two), each kept card longer by its share's -0.4 power and
   * wider by its -0.6 power, so a clump spreads over the same net with fewer, broader cuts; `lowShare` is the share of
   * the cards a LOW build (the far tier: distant bots, LOW quality) keeps, chosen card by card from a hash of the seat
   * and the card, every draw of a dropped card still made (HIGH and LOW lay the same clumps). Unset: every card.
   */
  garnishBudget?: { clumpCards?: number; lowShare?: number };
  hull?: GhilliePanels;
  turret?: GhilliePanels;
  gun?: GhilliePanels;
}

interface GhillieBuilderPort {
  /**
   * The spec (its paint visual, checked by the material system, gives a fitted cover its scheme; its gun limits bound
   * the gun's swept volume a suit with fieldClearanceM keeps clear).
   */
  spec: { id: string; visual?: object; gunDepressionDeg?: number; gunElevationDeg?: number; gunPitchByYawDeg?: GunPitchByYawCurve;
    gun?: { caliberMm?: number } };
  /** HIGH geometry (folded spray cards); LOW keeps the flat four-triangle cards. */
  readonly q?: boolean;
  hullG: THREE.Group;
  turretG: THREE.Group;
  gunG: THREE.Group;
  /** The cloth the suit clones, and the scheme wheel paint its theatre is read from (round 5). */
  mats: { canvasCloth: THREE.MeshStandardMaterial; wheels?: THREE.MeshStandardMaterial };
  disposables: DisposableResource[];
  /**
   * Steps run once the tank is assembled, after its profile's postAssemble (TankBuilderPort.afterAssemble). A step may
   * return its work as checkpoints; the factory runs it after the core build, one checkpoint per slice.
   */
  afterAssemble?: Array<(rig: never) => void | Generator<void, void, void>>;
}

// Shared physical-ghillie authoring process.
//
// A suit is a separately suspended equipment mesh, never a paint alias and
// never an armor bucket.  Each vehicle supplies its own cloth outlines,
// carrier height, running-gear hem and working-station openings.  The common
// builder owns deterministic ripples, ragged cell edges, connected cut-net
// texture, overlapping foliage and merged draw-call-safe output.

const noise01 = (n: number, salt = 0): number => {
  const v = Math.sin((n + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const rect = (x0: number, x1: number, z0: number, z1: number): Point2[] => (
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
);

/** Each polygon's plan box [x0, x1, z0, z1], kept on first use (a point outside it is outside the polygon). */
const polyBoxes = new WeakMap<readonly Point2[], [number, number, number, number]>();
function polyBox(poly: readonly Point2[]): [number, number, number, number] {
  let box = polyBoxes.get(poly);
  if (!box) {
    box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [px, pz] of poly) {
      if (px < box[0]) box[0] = px;
      if (px > box[1]) box[1] = px;
      if (pz < box[2]) box[2] = pz;
      if (pz > box[3]) box[3] = pz;
    }
    polyBoxes.set(poly, box);
  }
  return box;
}
/** Whether (x, z) lies within `pad` of a polygon's plan box. */
function nearBox(x: number, z: number, poly: readonly Point2[], pad: number): boolean {
  const b = polyBox(poly);
  return x >= b[0] - pad && x <= b[1] + pad && z >= b[2] - pad && z <= b[3] + pad;
}

function insidePoly(x: number, z: number, poly: readonly Point2[]): boolean {
  if (poly.length > 4 && !nearBox(x, z, poly, 0)) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-6) + xi)) inside = !inside;
  }
  return inside;
}

function makeGeometry(positions: number[], uvs: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// 2026-10-06 (round 2: the critics read the suits as nets "lying flat like decals or standing as rigid fences"): the
// carrier billows between its tie points on a deck, its hem sags in scallops between the ties along a flank, and the
// flank drape hangs in pleats that fold back toward the hull (never out past the authored carrier). A panel seated on
// a hard surface (seatGapM) keeps a shallow relief so it stays on that surface.
//
// Round 3 (2026-10-07: "a flat lattice pressed onto the armour like a stencil, with no thickness, sag, bunching or
// tie-downs", "the net stands straight up as a stiff free-standing fence", "near-identical scalloped edges on both hull
// sides"): the round-2 relief was a sine lattice on one 0.58 m tie pitch — itself a regular grid. The cloth now lies on
// seeded value noise: a broad swell, small wrinkles and meandering gathered folds (the zero set of a third field),
// pulled back onto its support at seeded tie-downs along the panel's edges. A flank hem is tied at irregular points
// drawn per panel (each side its own), sags between them by its own depth, billows out between ties and is drawn in at
// each tie; and a drape may roll over the wall's top edge into the roof net (SidePanel.shoulder) instead of standing
// as a free edge. Relief only ever lifts the cloth off its authored carrier height, never into the armour.

/** Integer hash of a lattice point -> [0, 1). */
function hash01(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth seeded value noise in [-1, 1] on a lattice of `cell` metres (smoothstep-blended corners). */
function clothNoise(u: number, v: number, cell: number, seed: number): number {
  const fu = u / cell, fv = v / cell;
  const iu = Math.floor(fu), iv = Math.floor(fv);
  const su = fu - iu, sv = fv - iv;
  const wu = su * su * (3 - 2 * su), wv = sv * sv * (3 - 2 * sv);
  const a = hash01(iu, iv, seed), b = hash01(iu + 1, iv, seed), c = hash01(iu, iv + 1, seed), d = hash01(iu + 1, iv + 1, seed);
  return (a + (b - a) * wu + (c - a) * wv + (a - b - c + d) * wu * wv) * 2 - 1;
}

const panelSeed = (panel: { seed?: number }, suitSeed: number): number => ((panel.seed ?? 0) * 7919 + suitSeed * 31) | 0;
/** A flank's hem ties: irregular positions and per-span sag depths, drawn per panel (each side its own). */
interface HemTies { readonly at: number[]; readonly depth: number[] }
const HEM_CACHE = new WeakMap<SidePanel, HemTies>();
function hemTies(panel: SidePanel, suitSeed: number): HemTies {
  const cached = HEM_CACHE.get(panel);
  if (cached) return cached;
  const s = panelSeed(panel, suitSeed) ^ (panel.side > 0 ? 0x5a5a : 0x1f1f);
  const at: number[] = [], depth: number[] = [];
  let k = 0;
  for (let z = panel.z0 - hash01(k++, 7, s) * 0.35; z < panel.z1 + 0.9; z += 0.42 + hash01(k++, 8, s) * 0.62) {
    at.push(z);
    depth.push(0.03 + hash01(k++, 9, s) * 0.08);   // round 4: 3-11 cm scallops (were 1.4-6.4 cm)
  }
  const ties = { at, depth };
  HEM_CACHE.set(panel, ties);
  return ties;
}
function hemAt(ties: HemTies, z: number): { drop: number; span: number; tie: number } {
  const { at, depth } = ties;
  let i = 0;
  while (i < at.length - 2 && at[i + 1] < z) i++;
  const a = at[i], b = at[i + 1] ?? a + 0.6;
  const f = THREE.MathUtils.clamp((z - a) / Math.max(1e-3, b - a), 0, 1);
  const span = Math.pow(Math.sin(Math.PI * f), 1.3);
  const near = Math.min(Math.abs(z - a), Math.abs(z - b));
  return { drop: depth[i] * span, span, tie: Math.exp(-(near * near) / 0.006) };
}
/** The lowest a flank hem may sag: never into the running gear's corridor (ghillieSuit.selftest: above 0.52 m). */
const NET_HEM_FLOOR_M = 0.545;
/** How far out of phase the two flanks read their authored hem (round 3: "near-identical scalloped edges on both sides"). */
const HEM_PHASE_M = 0.29;

// ---------------------------------------------------------------------------------------------------------------
// Garnish: spray cards seated stem-first in the net (vehicleFoliage.ts).
//
// Round 3 (2026-10-07, the blind critics on the round-2 close-ups: "hundreds of near-identical pale-green leaf cut-outs
// sprinkled at even density", "oak-leaf cards in neat, evenly spaced rows inside a regular net grid, like wallpaper",
// "on the glacis they lie flat like stickers", "covering places no crew would block"). A crew stuffs cut boughs into a
// net in bunches: the garnish is now placed as clumps on a seeded point process — clump sizes from a single sprig to a
// nine-spray bough, irregular gaps, a slow field of where the crew stuffed more — never one spray per lattice cell. A
// clump's sprays fan out of one tuck point and stand out of the net (folded along their stems at the near level),
// lean aft and outboard, hang on drapes, and keep their colour as one cut bough (deep greens, some wilting). Hatches,
// sights and the driver's vision keep a margin; hull decks under the turret's sweep carry garnish only along their
// edges, low; every spray stays inside the suit's certified half-width.
// ---------------------------------------------------------------------------------------------------------------

function defaultFoliageKind(style: GhillieStyle): VehicleFoliageKind {
  return style === 'leafy' ? 'oak' : 'garnish-woodland';
}

/** The garnish's own seeded stream (mulberry32): placement draws never share the cloth's noise lattice. */
function garnishStream(seed: number): () => number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One cut bough's colour: the suit's palette pulls the atlas a little; most cuts a deep green, a few wilting. */
function clumpTint(cfg: GhillieConfig, rng: () => number): [number, number, number] {
  const light = new THREE.Color(cfg.light), dark = new THREE.Color(cfg.dark);
  const mix = light.lerp(dark, 0.3 + rng() * 0.65);
  const k = (c: number, ref: number) => THREE.MathUtils.clamp(0.55 + (c / ref) * 0.45, 0.62, 1.22);
  // round 3 ("pale, washed-out lime-and-cream ... closer to lettuce heads"): a full stop darker than round 2's
  // 0.58-0.94, the yellow pulled out of the sunlit tips, and a share of cuts wilting toward olive-brown
  const value = 0.34 + rng() * 0.27;
  const wilt = rng() < 0.2 ? 0.3 + rng() * 0.6 : 0;
  return [k(mix.r, 0.11) * value * 0.8 * (1 + wilt * 0.6), k(mix.g, 0.15) * value * (1 - wilt * 0.12),
    k(mix.b, 0.07) * value * 0.9 * (1 - wilt * 0.3)];
}

/** Clump sizes in sprays (drawn uniformly). */
// Round 4 (2026-10-07, wave 216 on the Strv 103A: "leaf cards spread evenly across the net like a printed pattern", "a
// single green blanket draped over the vehicle ... the hull's own silhouette is barely legible"): about 40 % fewer
// sprays, in bigger bunches with more bare net between them (placeGarnishClumps).
const LEAFY_CLUMP_SIZES = [2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9] as const;
const CUT_CLUMP_SIZES = [1, 2, 2, 3, 3, 4, 5] as const;
const clumpRadius = (size: number): number => 0.07 + 0.034 * size;

function pickClumpSize(cfg: GhillieConfig, rng: () => number): number {
  const sizes = cfg.style === 'leafy' ? LEAFY_CLUMP_SIZES : CUT_CLUMP_SIZES;
  return sizes[Math.min(sizes.length - 1, Math.floor(rng() * sizes.length))];
}

interface GarnishClump { u: number; v: number; size: number }

/**
 * Clump seats on a 2D domain: candidates uniform in the rectangle, accepted under a slow seeded "stuffing" field and a
 * spacing that varies per pair (some clumps touch, some leave a hand's width of bare net) — a point process with no
 * lattice. Stops when the spray budget is placed or the candidates run out.
 */
function placeGarnishClumps(
  rng: () => number,
  cfg: GhillieConfig,
  rect: readonly [number, number, number, number],
  allowed: (u: number, v: number) => boolean,
  sprayBudget: number,
  bias: (rng: () => number) => [number, number] = (r) => [r(), r()],
): GarnishClump[] {
  const [u0, u1, v0, v1] = rect;
  const clumps: GarnishClump[] = [];
  if (sprayBudget < 0.5) return clumps;
  const fa = 0.7 + rng() * 1.3, fb = 0.7 + rng() * 1.3, fc = 1.1 + rng() * 1.6, fd = 0.9 + rng() * 1.4;
  const pa = rng() * Math.PI * 2, pb = rng() * Math.PI * 2;
  const stuffing = (u: number, v: number): number => 0.5 + 0.5 * Math.sin(u * fa + v * fb + pa) * Math.cos(u * fc - v * fd + pb);
  let sprays = 0;
  for (let attempt = 0; attempt < 60 + sprayBudget * 30 && sprays < sprayBudget; attempt++) {
    const [ru, rv] = bias(rng);
    const u = u0 + ru * (u1 - u0), v = v0 + rv * (v1 - v0);
    const size = pickClumpSize(cfg, rng);
    const gap = 0.9 + rng() * 1.0;
    const accept = rng();
    if (!allowed(u, v)) continue;
    // round 4: the crew's stuffing field decides more (bunches gather where it is high, bare net where it is low)
    if (accept > 0.1 + 0.9 * Math.pow(stuffing(u, v), 1.6)) continue;
    const r = clumpRadius(size);
    if (clumps.some((c) => Math.hypot(c.u - u, c.v - v) < (r + clumpRadius(c.size)) * gap)) continue;
    clumps.push({ u, v, size });
    sprays += size;
  }
  return clumps;
}

/** Point-in-polygon or within `margin` of its edges. */
function nearPolygon(x: number, z: number, poly: readonly Point2[], margin: number): boolean {
  if (!nearBox(x, z, poly, Math.max(0, margin))) return false;
  if (insidePoly(x, z, poly)) return true;
  if (margin <= 0) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < margin) return true;
  }
  return false;
}

/** Distance from (x, z) to the polygon's boundary and the outward direction toward it. */
function edgeDistance(x: number, z: number, poly: readonly Point2[]): { d: number; nx: number; nz: number } {
  let best = { d: Infinity, nx: 0, nz: 0 };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, nx: (px - x) / (d || 1), nz: (pz - z) / (d || 1) };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Round 5 (2026-10-08): the suits are built against the finished armour.
//
// The critics on round 4's close-ups (wave 253, the Leopard 2A4): "the net hangs as a flat rigid curtain over the
// whole hull rear and exhaust and down the side skirts", "stands up as vertical walls around the turret roof edges
// like a fence", "a uniform black square grid shrink-wrapped over hull, turret and glacis", "no stand-off, sag or
// ragged edge". The carriers were authored functions (a roof at one height, a flank at one width) that had drifted from
// the armour under them: the A4's turret drape hung 10-20 cm outboard of the rebuilt turret wall and stood 8-12 cm over
// its 0.68 m roof edge, a free-standing fence. The suit now waits for the assembled tank (TankBuilderPort.postAssemble)
// and probes its owner's own armour (ArmourProbe):
// - a roof or deck net is a membrane over what holds it up: it rests a couple of centimetres over the armour, is
//   bunched into a raised roll round every opening the crew cut in it (hatches, sights, the gun), is tented over the
//   sticks and boughs pushed under it, and sags between those supports (SAG_K) instead of floating at one height;
// - a flank or face drape is a hanging curtain: it rolls over the edge from the roof net, hangs from the outermost
//   armour above each height (it falls past recesses and rests on bins and skirts), falls in gravity folds that deepen
//   toward the hem, and ends in a ragged hem scalloped between its ties;
// - the garnish is tied to the cloth it hangs from (stem on the cloth surface).
// The authored carriers stay the design: the outlines, openings, spans and hem heights, and the fallback wherever the
// probe finds no armour.
// ---------------------------------------------------------------------------------------------------------------

interface ProbeGrid {
  readonly min0: number; readonly min1: number; readonly n0: number; readonly n1: number;
  readonly start: Int32Array; readonly items: Int32Array; readonly broad: Int32Array;
}
const PROBE_CELL_M = 0.05;
/**
 * A triangle spanning more cells than this is tested by every query instead (a ground plane); a big plate is indexed
 * into each cell it covers, so the thousands of queries a suit makes never test it from far away.
 */
const PROBE_BROAD_CELLS = 60000;
/** Half the side of the probe grids' fixed window round the owner's origin, in metres. */
const PROBE_WINDOW_M = 8;
/** How far past a triangle's box its probe cells reach (0.1 mm: the window's cell edges fall on authored round
 * coordinates, where a hit test's tolerance meets a point a hair outside the box). */
const PROBE_SPAN_PAD_M = 1e-4;

function probeGrid(tri: Float32Array, a0: number, a1: number): ProbeGrid {
  const count = tri.length / 9;
  if (!count) return { min0: 0, min1: 0, n0: 1, n1: 1, start: new Int32Array(2), items: new Int32Array(0), broad: new Int32Array(0) };
  // the netting lane (2026-10-10): one fixed window round the owner's origin, not the triangles' measured bounds. With
  // the bounds pass, a build that followed others in the same process intermittently laid leclerc_sxxi's deck nets
  // without their left halves (never with node --single-threaded); a probe minimum forced to +0.35 m reproduces that
  // loss, as if the pass (a min/max over every corner, tens of thousands of iterations) had come out short. A fixed
  // window has no such pass; every vehicle's owner frame lies well inside it (a corner outside is clamped to the edge
  // cells).
  const lo0 = -PROBE_WINDOW_M, lo1 = -PROBE_WINDOW_M;
  const inv = 1 / PROBE_CELL_M;
  const n0 = Math.round((2 * PROBE_WINDOW_M) * inv), n1 = n0;
  const span = (t: number): [number, number, number, number] => {
    const o = t * 9;
    const u0 = Math.min(tri[o + a0], tri[o + 3 + a0], tri[o + 6 + a0]), u1 = Math.max(tri[o + a0], tri[o + 3 + a0], tri[o + 6 + a0]);
    const v0 = Math.min(tri[o + a1], tri[o + 3 + a1], tri[o + 6 + a1]), v1 = Math.max(tri[o + a1], tri[o + 3 + a1], tri[o + 6 + a1]);
    // padded by PROBE_SPAN_PAD_M: a query within the hit tests' tolerance of a triangle's box (a point on an edge that
    // lies on a cell boundary) finds it from either side of that boundary
    return [Math.max(0, Math.floor((u0 - PROBE_SPAN_PAD_M - lo0) * inv)), Math.min(n0 - 1, Math.floor((u1 + PROBE_SPAN_PAD_M - lo0) * inv)),
      Math.max(0, Math.floor((v0 - PROBE_SPAN_PAD_M - lo1) * inv)), Math.min(n1 - 1, Math.floor((v1 + PROBE_SPAN_PAD_M - lo1) * inv))];
  };
  const counts = new Int32Array(n0 * n1 + 1);
  const broad: number[] = [];
  for (let t = 0; t < count; t++) {
    const [c0, c1, r0, r1] = span(t);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > PROBE_BROAD_CELLS) { broad.push(t); continue; }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) counts[r * n0 + c + 1]++;
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const items = new Int32Array(counts[n0 * n1]);
  const cursor = counts.slice(0, n0 * n1);
  const isBroad = new Uint8Array(count);
  for (const t of broad) isBroad[t] = 1;
  for (let t = 0; t < count; t++) {
    if (isBroad[t]) continue;
    const [c0, c1, r0, r1] = span(t);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[cursor[r * n0 + c]++] = t;
  }
  return { min0: lo0, min1: lo1, n0, n1, start: counts, items, broad: Int32Array.from(broad) };
}

/** What a carrier rests on and hangs from: the owner's armour (ArmourProbe) or a roof cage's wing (CageWing). */
interface SurfaceProbe {
  /** The highest surface over (x, z), or null. */
  top(x: number, z: number): number | null;
  /** The highest surface within `r` of (x, z), samples kept inside `bounds` [x0, x1, z0, z1] when given. */
  topNear(x: number, z: number, r: number, bounds?: readonly [number, number, number, number]): number | null;
  /** The outermost surface on flank `side` at (y, z), as a distance out from the centre line, or null. */
  side(y: number, z: number, side: number): number | null;
  /** The outermost surface toward `facing` (+1 bow, -1 rear) at (x, y), as facing * z, or null. */
  face(x: number, y: number, facing: number): number | null;
  /** Every surface on the vertical line through (x, z), highest first, with its facing and whether it is running gear. */
  surfacesAt?(x: number, z: number): Array<{ y: number; up: boolean; gear?: boolean }>;
}

/** The highest of a surface within `r` of (x, z): five samples, kept inside `bounds` [x0, x1, z0, z1] when given. */
function highestNear(top: (x: number, z: number) => number | null, x: number, z: number, r: number,
  bounds?: readonly [number, number, number, number]): number | null {
  let best: number | null = null;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const sx = bounds ? THREE.MathUtils.clamp(x + dx, bounds[0], bounds[1]) : x + dx;
    const sz = bounds ? THREE.MathUtils.clamp(z + dz, bounds[2], bounds[3]) : z + dz;
    const y = top(sx, sz);
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

/**
 * The owner's assembled armour as owner-local triangles, indexed for axis-aligned probes: the highest surface over a
 * deck point (top), the outermost surface beside a flank point (side) and ahead of / behind a face point (face).
 */
/** Running gear (wheels, tracks, rollers): it moves with the suspension, so a carrier keeps clear of it. */
const RUNNING_GEAR_RE = /^gear|wheel|sprocket|idler|roller|track(?!guard)|tread/i;
/** How far a carrier keeps from running gear (suspension travel and track flap). */
const GEAR_CLEARANCE_M = 0.05;

class ArmourProbe implements SurfaceProbe {
  private readonly tri: Float32Array;
  /** Per triangle: 1 where it belongs to running gear. */
  private readonly gear: Uint8Array;
  private readonly xz: ProbeGrid;
  private readonly yz: ProbeGrid;
  private readonly xy: ProbeGrid;
  readonly triangles: number;

  /** `keep` (optional) passes or drops single triangles in owner space (a roof cage's tubes inside a merged bucket). */
  constructor(owner: THREE.Object3D, skip: (object: THREE.Object3D) => boolean,
    keep?: (mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean) {
    owner.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(owner.matrixWorld).invert();
    const m = new THREE.Matrix4();
    const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
    const out: number[] = [], gear: number[] = [];
    const visit = (o: THREE.Object3D, inGear: boolean): void => {
      if (o.visible === false || skip(o)) return;
      const isGear = inGear || RUNNING_GEAR_RE.test(o.name || '') || o.userData?.runningGear === true;
      if ((o as THREE.LOD).isLOD) {
        const first = (o as THREE.LOD).levels[0]?.object;
        if (first) visit(first, isGear);
        return;
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.attributes?.position) {
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (material && material.visible !== false && material.colorWrite !== false) {
          m.multiplyMatrices(inv, mesh.matrixWorld);
          const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, index = mesh.geometry.index;
          const n = index ? index.count : pos.count;
          for (let k = 0; k + 2 < n; k += 3) {
            for (let j = 0; j < 3; j++) corner[j].fromBufferAttribute(pos, index ? index.getX(k + j) : k + j).applyMatrix4(m);
            if (keep && !keep(mesh, corner[0], corner[1], corner[2])) continue;
            for (const v of corner) out.push(v.x, v.y, v.z);
            gear.push(isGear ? 1 : 0);
          }
        }
      }
      for (const child of o.children) visit(child, isGear);
    };
    for (const child of owner.children) visit(child, false);
    this.tri = new Float32Array(out);
    this.gear = Uint8Array.from(gear);
    this.triangles = this.tri.length / 9;
    this.xz = probeGrid(this.tri, 0, 2);
    this.yz = probeGrid(this.tri, 1, 2);
    this.xy = probeGrid(this.tri, 0, 1);
  }

  private hit(g: ProbeGrid, a0: number, a1: number, aOut: number, p0: number, p1: number, sign: number): number | null {
    const tri = this.tri;
    let best = -Infinity;
    const test = (t: number): void => {
      const o = t * 9;
      const x0 = tri[o + a0], y0 = tri[o + a1], x1 = tri[o + 3 + a0], y1 = tri[o + 3 + a1], x2 = tri[o + 6 + a0], y2 = tri[o + 6 + a1];
      const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(d) < 1e-12) return;
      const l0 = ((y1 - y2) * (p0 - x2) + (x2 - x1) * (p1 - y2)) / d;
      const l1 = ((y2 - y0) * (p0 - x2) + (x0 - x2) * (p1 - y2)) / d;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) return;
      // running gear is met with its clearance added (it moves with the suspension)
      const value = sign * (l0 * tri[o + aOut] + l1 * tri[o + 3 + aOut] + l2 * tri[o + 6 + aOut]) + (this.gear[t] ? GEAR_CLEARANCE_M : 0);
      if (value > best) best = value;
    };
    const c = Math.floor((p0 - g.min0) / PROBE_CELL_M), r = Math.floor((p1 - g.min1) / PROBE_CELL_M);
    if (c >= 0 && r >= 0 && c < g.n0 && r < g.n1) {
      const cell = r * g.n0 + c;
      for (let k = g.start[cell]; k < g.start[cell + 1]; k++) test(g.items[k]);
    }
    for (let k = 0; k < g.broad.length; k++) test(g.broad[k]);
    return best === -Infinity ? null : best;
  }

  /** The highest armour surface over (x, z), or null. */
  top(x: number, z: number): number | null { return this.hit(this.xz, 0, 2, 1, x, z, 1); }
  /**
   * The netting lane: every armour surface the vertical line through (x, z) meets, highest first, each with whether
   * it faces up (a deck, a lid) or down (a bar's or a box's underside). Running gear is met with its clearance added.
   */
  surfacesAt(x: number, z: number): Array<{ y: number; up: boolean; gear: boolean }> {
    const tri = this.tri, g = this.xz, out: Array<{ y: number; up: boolean; gear: boolean }> = [];
    const test = (t: number): void => {
      const o = t * 9;
      const x0 = tri[o], y0 = tri[o + 2], x1 = tri[o + 3], y1 = tri[o + 5], x2 = tri[o + 6], y2 = tri[o + 8];
      const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(d) < 1e-12) return;
      const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (z - y2)) / d, l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (z - y2)) / d;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) return;
      // the face's normal y sign from its winding in plan (counter-clockwise from above faces up)
      const ny = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      out.push({ y: l0 * tri[o + 1] + l1 * tri[o + 4] + l2 * tri[o + 7] + (this.gear[t] ? GEAR_CLEARANCE_M : 0), up: ny < 0, gear: !!this.gear[t] });
    };
    const c = Math.floor((x - g.min0) / PROBE_CELL_M), r = Math.floor((z - g.min1) / PROBE_CELL_M);
    if (c >= 0 && r >= 0 && c < g.n0 && r < g.n1) {
      const cell = r * g.n0 + c;
      for (let k = g.start[cell]; k < g.start[cell + 1]; k++) test(g.items[k]);
    }
    for (let k = 0; k < g.broad.length; k++) test(g.broad[k]);
    return out.sort((a, b) => b.y - a.y);
  }
  /**
   * The highest armour within `r` of (x, z): a cloth bridges slots and bolt heads instead of dipping into them. The
   * samples stay inside `bounds` [x0, x1, z0, z1] when given (a carrier never rests on what stands beside it).
   */
  topNear(x: number, z: number, r: number, bounds?: readonly [number, number, number, number]): number | null {
    return highestNear((px, pz) => this.top(px, pz), x, z, r, bounds);
  }
  /** The outermost armour on flank `side` at (y, z), as a distance out from the centre line, or null. */
  side(y: number, z: number, side: number): number | null { return this.hit(this.yz, 1, 2, 0, y, z, side); }
  /** The outermost armour toward `facing` (+1 bow, -1 rear) at (x, y), as facing * z, or null. */
  face(x: number, y: number, facing: number): number | null { return this.hit(this.xy, 0, 1, 2, x, y, facing); }
}

/** What a suit's owner offers its carriers: the armour probe (null without geometry) and the roof nets already laid. */
interface OwnerSupport {
  readonly probe: SurfaceProbe | null;
  /** The roof cloth's height at (x, z) where a top panel of this owner covers it, else null. */
  roof(x: number, z: number): number | null;
  /** The lowest a hem may hang (the hull's running-gear corridor; -Infinity on a turret or gun). */
  readonly hemFloor: number;
  readonly hull: boolean;
  readonly owner: GhillieOwner;
  /**
   * Round 5: a fitted multispectral cover (ULCANS, Nakidka; wave 253 on the SEPv3: "a raised slab with brown visible
   * edges", "a rigid sheet ... with a ruler-straight lower hem"; the coordinator: "a thin conforming shell", "edges
   * fastened around hatches and optics") is cut to the vehicle: it lies on the armour point by point, its edges are
   * bound round every opening, it wrinkles but never hangs in folds or tents over sticks, and its hem follows the plate.
   */
  readonly fitted: boolean;
  /** No turret owner in the suit (a casemate hull: its deck is its roof). */
  readonly turretless: boolean;
  /** Where the crew may push a stick under the net (clear of a drone dock and its launch column); default anywhere. */
  tentOk?(x: number, z: number): boolean;
  /** The netting lane (fieldClearanceM): the lowest a drape's hem may hang at owner-local (x, z). */
  hemFloorAt?(x: number, z: number): number;
  /** The netting lane (fieldClearanceM): whether cloth may lie at an owner-local point. */
  clothOk?(p: Point3): boolean;
  /** The netting lane: the owner's lid and lens plan boxes [x0, x1, z0, z1]; a drape's roll over the deck never crosses one. */
  lids?: ReadonlyArray<readonly [number, number, number, number]>;
  /**
   * The fix round (a hull's): ahead of this z (the turret's pivot, the hull's frame) a field net lies as flat as the
   * round-5 laid net: the main gun's depression path crosses the front deck and glacis (profiles/arieteC2X.selftest's
   * barrel/hull overlap at 2.5 cm), and a slack fold there would stand in it.
   */
  flatAheadOfZ?: number;
}

/** A point and its outward normal on a cloth, for seating garnish. */
interface ClothPoint { p: [number, number, number]; n: [number, number, number] }

/** A laid carrier: its geometry, and where (and how) garnish may be tied to it. */
interface ClothSurface {
  readonly kind: 'top' | 'drape';
  readonly geometry: THREE.BufferGeometry;
  /** The garnish domain [u0, u1, v0, v1]: (x, z) on a top, (along, t from hem 0 to top 1) on a drape. */
  readonly domain: readonly [number, number, number, number];
  sample(u: number, v: number): ClothPoint | null;
  allowed(u: number, v: number, margin: number): boolean;
  /** Distance to the cloth's outer edge and the outward direction there (tops), for edge garnish. */
  edge?(u: number, v: number): { d: number; nx: number; nz: number };
  /** The fix round (a top's): whether (x, z) lies in one of its openings, 2 cm round (a card face may not cross one). */
  holeAt?(x: number, z: number): boolean;
  /** Whether a garnish card's vertex may sit here (clear of openings, never under its own carrier). */
  cardOk(p: readonly number[]): boolean;
  readonly panel: TopPanel | SidePanel | FacePanel;
  readonly owner: 'side' | 'face' | 'top';
}

/** A hanging drape's loft off the wall it falls past (measured across the flank: a face turned off it gets less). */
const HANG_GAP_M = 0.014;
/**
 * How far inboard of its authored line a flank drape with no roof net above it may find the edge it comes over. Round
 * 5 (2026-10-08, push 3b): main's Ukrainian side screens carry their nets 1.1 m outboard of the cupola, and the scan
 * down from the screen's top met the cupola first, so the drape started on the roof and ran out to the screen as a
 * shelf floating over the turret's shoulder.
 */
const FLANK_REACH_M = 0.45;
/** How far from its authored plane a face net tied to its plate may find that plate. */
const TIED_REACH_M = 0.2;
/** A fitted cover's loft over its plate (the fabric and its cut flaps). */
const FITTED_GAP_M = 0.007;
/** A draped net's loft over the armour it rests on (its cords and knots lie on the plate; the garnish stands on it). */
const DRAPE_GAP_M = 0.011;
/** Sag of a draped net away from what holds it up: metres per square metre of distance (about 9 cm at 40 cm: a
 * garnished net is heavy and loose, it falls back onto the plate within half a metre of a support). */
const SAG_K = 0.55;
const SAG_REACH_M = 0.6;
/** Width of the bunched roll the crew gathers round an opening cut in a draped net. */
const RIM_W_M = 0.1;
/** Column pitch of a hanging drape: fine enough to carry its gravity folds. */
const DRAPE_COLUMN_M = 0.24;
/** Row pitch down a hanging drape. */
const DRAPE_ROW_M = 0.115;

const smooth01 = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to a polygon's boundary. */
function boundaryDistance(x: number, z: number, poly: readonly Point2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Per-panel texture offset, so neighbouring panels never show the same stretch of net side by side. */
const panelUvOffset = (panel: { seed?: number }, suitSeed: number): [number, number] => {
  const s = panelSeed(panel, suitSeed);
  return [hash01(s, 1, 0x51), hash01(s, 2, 0x53)];
};

/**
 * A carrier's own triangles, welded into pieces: torn perimeter cells and openings can leave a cell or two cut off from
 * the sheet, hanging in the air with nothing holding them. Those islands are dropped (a sheet keeps every piece of at
 * least a twentieth of its cells).
 */
function dropIslands(positions: number[], uvs: number[], minTris = 8, share = 20): void {
  const triCount = positions.length / 9;
  if (triCount < 2) return;
  const parent = Int32Array.from({ length: triCount }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const key = `${positions[o].toFixed(4)},${positions[o + 1].toFixed(4)},${positions[o + 2].toFixed(4)}`;
      const other = owner.get(key);
      if (other === undefined) owner.set(key, t);
      else parent[find(t)] = find(other);
    }
  }
  const size = new Map<number, number>();
  for (let t = 0; t < triCount; t++) { const r = find(t); size.set(r, (size.get(r) ?? 0) + 1); }
  const keep = Math.max(minTris, Math.ceil(triCount / share));
  if ([...size.values()].every((n) => n >= keep)) return;
  const p2: number[] = [], u2: number[] = [];
  for (let t = 0; t < triCount; t++) {
    if ((size.get(find(t)) ?? 0) < keep) continue;
    for (let k = 0; k < 9; k++) p2.push(positions[t * 9 + k]);
    for (let k = 0; k < 6; k++) u2.push(uvs[t * 6 + k]);
  }
  positions.length = 0; positions.push(...p2);
  uvs.length = 0; uvs.push(...u2);
}

/** Distance from a point to a carrier's own triangles (a garnish stem must be tied to cloth that is there). */
function clothDistance(geometry: THREE.BufferGeometry): (p: readonly number[]) => number {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const cell = 0.12;
  const grid = new Map<string, number[]>();
  const tris: THREE.Triangle[] = [];
  for (let k = 0; k + 2 < pos.count; k += 3) {
    const t = new THREE.Triangle(new THREE.Vector3().fromBufferAttribute(pos, k), new THREE.Vector3().fromBufferAttribute(pos, k + 1),
      new THREE.Vector3().fromBufferAttribute(pos, k + 2));
    const i = tris.push(t) - 1;
    const box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]);
    for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
      for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
        for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
          const key = `${x},${y},${z}`;
          const list = grid.get(key);
          if (list) list.push(i); else grid.set(key, [i]);
        }
  }
  const q = new THREE.Vector3(), c = new THREE.Vector3();
  return (p) => {
    q.set(p[0], p[1], p[2]);
    let best = Infinity;
    for (const i of grid.get(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`) ?? []) {
      tris[i].closestPointToPoint(q, c);
      best = Math.min(best, q.distanceTo(c));
    }
    return best;
  };
}

/**
 * netting-225: whether a point lies within `r` of a cloth (its triangles in cells of `r`, the point's own cell and the
 * 26 round it searched).
 */
function clothWithin(geometry: THREE.BufferGeometry, r: number): (p: readonly number[]) => boolean {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const grid = new Map<number, number[]>();
  const tris: THREE.Triangle[] = [];
  const key = (x: number, y: number, z: number): number => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  for (let k = 0; k + 2 < pos.count; k += 3) {
    const t = new THREE.Triangle(new THREE.Vector3().fromBufferAttribute(pos, k), new THREE.Vector3().fromBufferAttribute(pos, k + 1),
      new THREE.Vector3().fromBufferAttribute(pos, k + 2));
    const i = tris.push(t) - 1;
    const box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]);
    for (let x = Math.floor(box.min.x / r); x <= Math.floor(box.max.x / r); x++)
      for (let y = Math.floor(box.min.y / r); y <= Math.floor(box.max.y / r); y++)
        for (let z = Math.floor(box.min.z / r); z <= Math.floor(box.max.z / r); z++) {
          const list = grid.get(key(x, y, z));
          if (list) list.push(i); else grid.set(key(x, y, z), [i]);
        }
  }
  const q = new THREE.Vector3(), c = new THREE.Vector3();
  return (p) => {
    q.set(p[0], p[1], p[2]);
    const cx = Math.floor(p[0] / r), cy = Math.floor(p[1] / r), cz = Math.floor(p[2] / r);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (const i of grid.get(key(x, y, z)) ?? []) if (tris[i].closestPointToPoint(q, c).distanceToSquared(q) <= r * r) return true;
    }
    return false;
  };
}

// ---- roofs and decks: the draped membrane ----------------------------------------------------------------------

interface TopCloth extends ClothSurface {
  heightAt(x: number, z: number): number | null;
  /** The sticks and boughs pushed under the net (each tufted with garnish over its hump). */
  readonly tents: ReadonlyArray<{ readonly x: number; readonly z: number; readonly h: number; readonly r: number }>;
  /** True where this net lies (inside its outline, outside its openings). */
  covers(x: number, z: number): boolean;
}

function topCloth(panel: TopPanel, cfg: GhillieConfig, support: OwnerSupport, uvk: number): TopCloth {
  const { x0, x1, z0, z1, nx = 18, nz = 30, outline = null } = panel;
  // the cloth's openings (authored holes, lids and lens slots); the garnish keeps its margin from the first two only
  const garnishHoles = panel.holes ?? [];
  const holes = panel.slots?.length ? [...garnishHoles, ...panel.slots] : garnishHoles;
  const NX = nx + 1, NZ = nz + 1;
  const xs = new Float64Array(NX), zs = new Float64Array(NZ);
  for (let i = 0; i < NX; i++) xs[i] = THREE.MathUtils.lerp(x0, x1, i / nx);
  for (let j = 0; j < NZ; j++) zs[j] = THREE.MathUtils.lerp(z0, z1, j / nz);
  const seated = panel.seatGapM !== undefined || support.fitted;
  // the netting lane's fix round (waves 391a/c: "no net, no sag between supports"): a fleet field net laid over the
  // armour hangs off what holds it up, a few centimetres of slack, deep folds and humps over the boughs pushed under it
  const field = isFieldNet(cfg) && !!panel.yFromArmour;
  // a seated net over measured armour sits at the drape's loft: the probe already carries the ERA, kit and packs the
  // authored seat gap was there to clear
  const probe = support.probe;
  // the netting lane: a net laid over the armour (yFromArmour) has its cords on the plate (5 mm)
  const gap = seated && probe ? Math.min(panel.seatGapM ?? FITTED_GAP_M, DRAPE_GAP_M - 0.004)
    : panel.seatGapM ?? (panel.yFromArmour ? 0.005 : DRAPE_GAP_M);
  const s = panelSeed(panel, cfg.seed);
  const base = new Float64Array(NX * NZ);
  // where no armour holds the cloth (past a deck's edge, beside a barrel) it hangs from its neighbours (supported)
  const supported = new Uint8Array(NX * NZ);
  // the netting lane: where armour answers the carrier rests on it (yFromArmour), and the net exists only over armour
  // (clipToArmour, the corners with armour under them)
  const armoured = new Uint8Array(NX * NZ);
  // a laid net lies on the highest up-facing armour under its level plus riseLimitM (it passes under a frame or a bar
  // raised over the roof) and is cut round anything standing taller on that surface (a box, a post, a sight head)
  const tall = new Uint8Array(NX * NZ);
  const laidRest = new Float64Array(NX * NZ).fill(NaN);
  const laidAt = (x: number, z: number): { rest: number | null; standing: boolean } => {
    const ceiling = panel.yAt(x, z) + (panel.riseLimitM ?? 0.35);
    let rest: number | null = null, centre: number | null = null, standing = false;
    for (const [dx, dz] of [[0, 0], [0.03, 0.02], [-0.03, -0.02]] as const) {
      const sx = THREE.MathUtils.clamp(x + dx, x0, x1), sz = THREE.MathUtils.clamp(z + dz, z0, z1);
      const hits: Array<{ y: number; up: boolean; gear?: boolean }> = probe?.surfacesAt?.(sx, sz) ?? [];
      let here: number | null = null;
      // the running gear holds no laid net up (past a deck's edge the cloth ends, it never falls onto the track)
      for (const h of hits) if (h.up && h.y <= ceiling) { if (!h.gear) here = h.y; break; }
      if (dx === 0 && dz === 0) centre = here;
      if (here !== null && (rest === null || here > rest)) rest = here;
      // the tallest thing over this sample: standing on the surface the net lies on, or raised over it
      if (hits.length && hits[0].y > ceiling) {
        const under = hits.find((h) => !h.up && h.y < hits[0].y - 1e-4);
        if (!under || here === null || under.y < here + 0.06) standing = true;
      }
    }
    // the armour under the point itself; its neighbours' only over a slot or a bolt head (their highest on a sloped plate
    // would hold the net off the slope)
    return { rest: centre !== null && rest !== null && rest - centre < 0.01 ? rest : centre ?? rest, standing };
  };
  const authoredAt = (x: number, z: number, k: number): number => {
    if (panel.yFromArmour && probe) {
      const { rest, standing } = laidAt(x, z);
      if (standing) tall[k] = 1;
      // the netting lane: armour more than LAID_DROP_M under the panel's level is past the deck's edge (the hull under a
      // turret's side, a ledge far below), not the deck this net lies on
      if (rest !== null && rest > panel.yAt(x, z) - LAID_DROP_M) { laidRest[k] = rest; if (!standing) return rest + 0.02; }
    }
    return panel.yAt(x, z);
  };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const authored = authoredAt(xs[i], zs[j], j * NX + i);
    // a seated net follows its plate point by point; a draped one bridges slots and bolt heads
    const laid = panel.yFromArmour ? laidRest[j * NX + i] : NaN;
    const rest = probe ? (!Number.isNaN(laid) ? laid : panel.yFromArmour ? null
      : seated ? probe.top(xs[i], zs[j]) : probe.topNear(xs[i], zs[j], 0.035, [x0, x1, z0, z1])) : null;
    // the armour under the cloth (a drop of more than 30 cm is no support), and nothing standing more than 15 cm over
    // the authored carrier (a roof gun or sight head merged into the armour) lifts it: the net is cut round those
    const ok = rest !== null && rest > authored - 0.3 && !tall[j * NX + i];
    if (ok) armoured[j * NX + i] = 1;
    base[j * NX + i] = ok ? Math.min(rest + gap, authored + 0.15) : authored;
    // only the cloth itself rests on anything: a point in an opening (a sight head, a hatch ring) or outside the
    // carrier's outline holds nothing up
    const cloth = (!outline || insidePoly(xs[i], zs[j], outline)) && !holes.some((hole) => insidePoly(xs[i], zs[j], hole));
    supported[j * NX + i] = (probe && !ok) || !cloth ? 0 : 1;
  }
  const y = new Float64Array(NX * NZ);
  // the fix round: each point's membrane height before its relief (a field net's clearance clamps reach down to it where
  // no armour lies under the point)
  const hung = new Float64Array(NX * NZ);
  const tents: Array<{ x: number; z: number; h: number; r: number }> = [];
  if (seated) {
    // a seated cell with nothing under it takes its nearest supported neighbour's height
    for (let k = 0; k < y.length; k++) if (!supported[k]) {
      const i = k % NX, j = Math.floor(k / NX);
      let bestD = Infinity;
      for (let kk = 0; kk < y.length; kk++) {
        if (!supported[kk]) continue;
        const d = Math.hypot(xs[kk % NX] - xs[i], zs[Math.floor(kk / NX)] - zs[j]);
        if (d < bestD) { bestD = d; base[k] = base[kk] - SAG_K * d * d; }
      }
    }
    for (let k = 0; k < y.length; k++) {
      const i = k % NX, j = Math.floor(k / NX);
      // a fitted cover's edge is bound round each opening: a narrow raised seam where it is fastened
      let seam = 0;
      if (support.fitted) {
        for (const hole of holes) {
          if (insidePoly(xs[i], zs[j], hole)) continue;
          const d = boundaryDistance(xs[i], zs[j], hole);
          if (d < 0.05) seam = Math.max(seam, 0.009 * (1 - d / 0.05));
        }
      }
      y[k] = base[k] + 0.001 + 0.0015 * (1 + clothNoise(xs[i], zs[j], 0.4, s + 3)) + seam;
    }
  } else {
    // supports: the sticks and boughs pushed under the net (they hold it up; it sags away from them); the roll
    // bunched round each opening is the cloth itself (local relief, it props nothing up)
    const lift = new Float64Array(NX * NZ), rim = new Float64Array(NX * NZ);
    // a garnished net rolled back from a cut opening is a hand thick
    const rimH = holes.map((_, h) => 0.035 + hash01(s, h, 0x7a) * 0.03);
    tents.length = 0;
    // humps on a turret roof, or on the deck of a turretless hull (the Strv 103's deck is its roof); never on a deck
    // under a turret's sweep, the glacis in front of a driver or a gun shroud
    const lowDeck = panel.garnishEdgeBandM !== undefined || support.owner === 'gun'
      || (support.owner === 'hull' && !support.turretless);
    if (panel.tents) {
      panel.tents.forEach(([tx, tz, h], k) => tents.push({ x: tx, z: tz, h, r: 0.1 + hash01(s, k, 0x37) * 0.06 }));
    } else if (!lowDeck || field) {
      const area = (x1 - x0) * (z1 - z0);
      // a field net is humped over a bough or a stick every metre and a half, low on a deck (its clearances clamp it)
      const want = area < (field ? 0.6 : 1.2) ? 0 : Math.max(1, Math.round(area / (field ? 1.5 : 2.4)));
      for (let k = 0, tries = 0; tents.length < want && tries < want * 12; tries++, k++) {
        const tx = THREE.MathUtils.lerp(x0 + 0.15, x1 - 0.15, hash01(s, k, 0x31));
        const tz = THREE.MathUtils.lerp(z0 + 0.15, z1 - 0.15, hash01(s, k, 0x33));
        if (outline && (!insidePoly(tx, tz, outline) || boundaryDistance(tx, tz, outline) < 0.18)) continue;
        if (holes.some((hole) => insidePoly(tx, tz, hole) || boundaryDistance(tx, tz, hole) < 0.24)) continue;
        if (support.tentOk && !support.tentOk(tx, tz)) continue;
        if (support.flatAheadOfZ !== undefined && tz > support.flatAheadOfZ) continue;
        if (tents.some((t) => Math.hypot(t.x - tx, t.z - tz) < 0.55)) continue;
        // netting-225 (the critics' "low mounds" on the flattened suits' roofs: each hump carried the biggest clump, its
        // garnish laid over it, 15 to 23 cm over the roof): a field net's humps half as high (2.5 to 5 cm on a deck, 3.5
        // to 7.5 cm on a roof), the cloth lifted off the plate by a bough, not tented over a stick
        const th = field ? (lowDeck ? 0.025 + hash01(s, k, 0x35) * 0.025 : 0.035 + hash01(s, k, 0x35) * 0.04) : 0.07 + hash01(s, k, 0x35) * 0.08;
        tents.push({ x: tx, z: tz, h: th, r: (field ? 0.14 : 0.09) + hash01(s, k, 0x37) * (field ? 0.1 : 0.07) });
      }
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = xs[i], z = zs[j];
      let l = 0, roll = 0;
      holes.forEach((hole, h) => {
        // past the rim's width of the opening's box, nothing (exact: the boundary lies inside the box)
        if (!nearBox(x, z, hole, RIM_W_M) || insidePoly(x, z, hole)) return;
        const d = boundaryDistance(x, z, hole);
        // the roll is bunched unevenly along the cut: thick in places, flat in others
        const bunch = Math.max(0, 0.25 + 0.95 * clothNoise(x * 1.7, z * 1.7, 0.22, s + h * 13));
        if (d < RIM_W_M) roll = Math.max(roll, rimH[h] * bunch * Math.pow(1 - d / RIM_W_M, 1.3) * (lowDeck ? 0.4 : 1) * (panel.rimScale ?? 1));
      });
      rim[j * NX + i] = roll;
      for (const t of tents) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < t.r) l = Math.max(l, t.h * (1 - (d / t.r) ** 2));
      }
      lift[j * NX + i] = l;
    }
    // the membrane: each point hangs from the highest support within reach, sagging away from it
    const ri = Math.ceil(SAG_REACH_M / Math.max(1e-3, (x1 - x0) / nx)), rj = Math.ceil(SAG_REACH_M / Math.max(1e-3, (z1 - z0) / nz));
    // a laid net's swell and creases are its own: shallower than a carrier's hung over sticks
    const reliefK = panel.reliefScale ?? (panel.yFromArmour ? (field ? 1.5 : 0.6) : 1);
    // the fix round: a field net lies on a plate of any slope and bridges only what dips between its supports (the
    // closing of the armour under it with the sag parabola: a plane comes out a plane), and is humped over each stick
    // pushed under it, sagging away round the stick
    let fieldBest: Float64Array | null = null;
    if (field) {
      const N = NX * NZ, dil = new Float64Array(N).fill(-Infinity), tent = new Float64Array(N).fill(-Infinity);
      fieldBest = new Float64Array(N);
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        let best = supported[j * NX + i] ? base[j * NX + i] : -Infinity, tb = -Infinity;
        for (let jj = Math.max(0, j - rj); jj <= Math.min(NZ - 1, j + rj); jj++) {
          const dz = zs[jj] - zs[j];
          for (let ii = Math.max(0, i - ri); ii <= Math.min(NX - 1, i + ri); ii++) {
            const k = jj * NX + ii;
            if (!supported[k]) continue;
            const dx = xs[ii] - xs[i], sag = SAG_K * (dx * dx + dz * dz);
            if (base[k] - sag > best) best = base[k] - sag;
            if (lift[k] > 0.0005 && base[k] + lift[k] - sag > tb) tb = base[k] + lift[k] - sag;
          }
        }
        dil[j * NX + i] = best;
        tent[j * NX + i] = tb;
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k0 = j * NX + i;
        let m = dil[k0];
        if (m !== -Infinity) {
          for (let jj = Math.max(0, j - rj); jj <= Math.min(NZ - 1, j + rj); jj++) {
            const dz = zs[jj] - zs[j];
            for (let ii = Math.max(0, i - ri); ii <= Math.min(NX - 1, i + ri); ii++) {
              const d = dil[jj * NX + ii];
              if (d === -Infinity) continue;
              const dx = xs[ii] - xs[i], v = d + SAG_K * (dx * dx + dz * dz);
              if (v < m) m = v;
            }
          }
        }
        const own = supported[k0] ? base[k0] : -Infinity;
        fieldBest[k0] = Math.max(m, own, tent[k0]);
      }
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      let best = supported[j * NX + i] ? base[j * NX + i] + lift[j * NX + i] : -Infinity;
      if (fieldBest) best = fieldBest[j * NX + i];
      else for (let jj = Math.max(0, j - rj); jj <= Math.min(NZ - 1, j + rj); jj++) {
        const dz = zs[jj] - zs[j];
        for (let ii = Math.max(0, i - ri); ii <= Math.min(NX - 1, i + ri); ii++) {
          const k = jj * NX + ii;
          if (!supported[k] || (lift[k] <= 0.0005 && base[k] <= best)) continue;
          const dx = xs[ii] - xs[i];
          const v = base[k] + lift[k] - SAG_K * (dx * dx + dz * dz);
          if (v > best) best = v;
        }
      }
      // nothing within reach holds it: the authored carrier
      if (best === -Infinity) best = base[j * NX + i];
      hung[j * NX + i] = best;
      // the netting lane: a net laid over the armour lies on it (a heavy garnished net does not bridge a sloped plate
      // from its high side); only the sticks pushed under it still hold it up
      if (panel.yFromArmour && armoured[j * NX + i]) best = Math.min(best, base[j * NX + i] + lift[j * NX + i] + (field ? 0.04 : 0.012));
      // the cloth itself: a slow swell and creases, a centimetre or two (low over a deck under the turret's sweep)
      const x = xs[i], z = zs[j];
      const fold = clothNoise(x * 0.85 + z * 0.4, z * 0.9 - x * 0.35, 0.45, s + 31);
      const crease = Math.max(0, 1 - Math.abs(fold) / 0.18) ** 2;
      y[j * NX + i] = best + rim[j * NX + i]
        + reliefK * (0.004 * (1 + clothNoise(x, z, 0.55, s)) + 0.002 * (1 + clothNoise(x, z, 0.19, s + 17)) + 0.03 * crease);
      // the fix round: a field net's folds rise and fall about where it hangs, and where they fall it rests on the plate
      // (a heavy garnished net touches down between its folds; ghillieSuit.selftest: every piece touches within 15 mm)
      if (field) {
        const relief = reliefK * (0.005 * clothNoise(x, z, 0.55, s) + 0.0025 * clothNoise(x, z, 0.19, s + 17) + 0.035 * crease - 0.008);
        const restOn = armoured[j * NX + i] ? base[j * NX + i] : Math.min(base[j * NX + i], best);
        y[j * NX + i] = Math.max(best + rim[j * NX + i] + relief, restOn);
      }
      // the netting lane: a net laid over the armour keeps its folds within 10 mm of its cords (its rolls and the sticks
      // under it excepted), so every piece of it lies on the plate
      if (panel.yFromArmour && armoured[j * NX + i]) {
        y[j * NX + i] = Math.min(y[j * NX + i], base[j * NX + i] + lift[j * NX + i] + rim[j * NX + i] + (field ? 0.06 : 0.010));
      }
      if (panel.restOnProbeM !== undefined && probe) {
        // the surface under the point and under the grid lines to its neighbours (a tube between two points holds up the
        // cloth's edge across it, not just a point on it)
        const cx = (x1 - x0) / nx, cz = (z1 - z0) / nz;
        let under = probe.top(x, z);
        for (let f = 0.1; f <= 1 + 1e-9; f += 0.1) {
          for (const [px, pz] of [[x + cx * f, z], [x - cx * f, z], [x, z + cz * f], [x, z - cz * f]]) {
            const t = probe.top(px, pz);
            if (t !== null && (under === null || t > under)) under = t;
          }
        }
        if (under !== null) y[j * NX + i] = Math.max(y[j * NX + i], under + panel.restOnProbeM);
      }
    }
  }
  // the fix round: a field net's slack never takes it into a clearance (the turret's sweep over a deck, a lens's view):
  // where its height would, it is lowered toward the armour, a centimetre at a time, instead of being cut away there
  if (field && support.clothOk) {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      // where no armour lies under the point, the clamps reach down to the membrane it hangs as (before its folds)
      const floor = armoured[k] ? base[k] : Math.min(base[k], hung[k]);
      if (support.flatAheadOfZ !== undefined && zs[j] > support.flatAheadOfZ) { y[k] = Math.min(y[k], floor + 0.012); continue; }
      // under the main gun's depression path (where the clearance refuses a point 9 cm over the plate) a field net keeps
      // the round-5 laid net's 1.2 cm, its slack and folds left out (profiles/arieteC2X.selftest's barrel/hull overlap)
      if (!support.clothOk([xs[i], floor + FIELD_GUN_PROBE_M, zs[j]])) { y[k] = Math.min(y[k], floor + 0.012); continue; }
      if (support.clothOk([xs[i], y[k], zs[j]])) continue;
      for (let h = y[k] - 0.01; h >= floor - 1e-6; h -= 0.01) if (support.clothOk([xs[i], h, zs[j]])) { y[k] = h; break; }
    }
  }
  const heightAt = (x: number, z: number): number | null => {
    if (x < x0 - 1e-6 || x > x1 + 1e-6 || z < z0 - 1e-6 || z > z1 + 1e-6) return null;
    const fi = THREE.MathUtils.clamp((x - x0) / ((x1 - x0) || 1) * nx, 0, nx - 1e-6), fj = THREE.MathUtils.clamp((z - z0) / ((z1 - z0) || 1) * nz, 0, nz - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, w = fj - j;
    const a = y[j * NX + i], b = y[j * NX + i + 1], c = y[(j + 1) * NX + i], d = y[(j + 1) * NX + i + 1];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  // the netting lane (clipToArmour): a cell is laid where at least two of its corners have armour under them, and never
  // down a step between them (a net laid over a deck ends at its edge instead of hanging a wall of cloth off it)
  const stepped = (i: number, j: number): boolean => {
    if (!panel.yFromArmour) return false;
    let lo = Infinity, hi = -Infinity;
    for (const k of [j * NX + i, j * NX + i + 1, (j + 1) * NX + i, (j + 1) * NX + i + 1]) {
      const r = laidRest[k];
      if (Number.isNaN(r)) continue;
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    return hi - lo > LAID_STEP_M;
  };
  const clipped = (i: number, j: number): boolean => (panel.clipToArmour === true && !!probe
    && (armoured[j * NX + i] + armoured[j * NX + i + 1] + armoured[(j + 1) * NX + i] + armoured[(j + 1) * NX + i + 1] < 2 || stepped(i, j)))
    || tall[j * NX + i] + tall[j * NX + i + 1] + tall[(j + 1) * NX + i] + tall[(j + 1) * NX + i + 1] > 0;
  const cellOf = (x: number, z: number): [number, number] => [
    THREE.MathUtils.clamp(Math.floor((x - x0) / ((x1 - x0) || 1) * nx), 0, nx - 1),
    THREE.MathUtils.clamp(Math.floor((z - z0) / ((z1 - z0) || 1) * nz), 0, nz - 1)];
  const inside = (x: number, z: number): boolean => (!outline || insidePoly(x, z, outline)) && !holes.some((hole) => insidePoly(x, z, hole))
    && !clipped(...cellOf(x, z));
  // geometry: the authored cell rule (outline, openings, torn perimeter cells)
  const positions: number[] = [], uvs: number[] = [];
  const [ou, ov] = panelUvOffset(panel, cfg.seed);
  const vtx = (i: number, j: number): Point3 => [xs[i], y[j * NX + i], zs[j]];
  const tri = (a: Point3, b: Point3, c: Point3): void => {
    for (const p of [a, b, c]) { positions.push(p[0], p[1], p[2]); uvs.push(p[0] * uvk + ou, p[2] * uvk + ov); }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (outline && !insidePoly(cx, cz, outline)) continue;
    if (holes.some((hole) => insidePoly(cx, cz, hole))) continue;
    if (panel.strictHoles && holes.some((hole) => [[xs[i], zs[j]], [xs[i + 1], zs[j]], [xs[i + 1], zs[j + 1]], [xs[i], zs[j + 1]]]
      .some(([px, pz]) => insidePoly(px, pz, hole)))) continue;
    if (clipped(i, j)) continue;
    const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
    if (edge && noise01(i + j * nx + (panel.seed ?? 0), cfg.seed) < 0.23) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
    tri(a, c, b); tri(a, d, c);
  }
  dropIslands(positions, uvs);
  const geometry = makeGeometry(positions, uvs);
  const ring = outline ?? rect(x0, x1, z0, z1);
  return {
    kind: 'top', owner: 'top', panel, geometry, heightAt, covers: inside, tents, domain: [x0, x1, z0, z1],
    sample(u, v) {
      const h = heightAt(u, v);
      if (h === null) return null;
      const e = 0.03;
      const hx = (heightAt(u + e, v) ?? h) - (heightAt(u - e, v) ?? h), hz = (heightAt(u, v + e) ?? h) - (heightAt(u, v - e) ?? h);
      const n = new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
      return { p: [u, h, v], n: [n.x, n.y, n.z] };
    },
    allowed(u, v, margin) {
      if (!inside(u, v)) return false;
      if ((panel.foliageExclude ?? []).some((region) => nearPolygon(u, v, region, margin * 0.5))) return false;
      return !garnishHoles.some((hole) => nearPolygon(u, v, hole, margin));
    },
    edge: (u, v) => edgeDistance(u, v, ring),
    holeAt: (x, z) => holes.some((hole) => nearPolygon(x, z, hole, 0.02)),
    cardOk(p) {
      if (garnishHoles.some((hole) => nearPolygon(p[0], p[2], hole, (panel.garnishOpeningMarginM ?? 0.09) * 0.5))) return false;
      const h = heightAt(p[0], p[2]);
      // over the deck the spray stays above its own net (a field card's foot and edges may tuck under its folds); past the
      // deck's edge it may droop over it
      return h === null || !inside(p[0], p[2]) || p[1] > h - (isFieldNet(cfg) ? FIELD_UNDER_NET_M : 0.03);
    },
  };
}

// ---- flanks and faces: the hanging curtain ------------------------------------------------------------------------


/**
 * The cross-section a hanging net takes at one station: on from the roof net (xIn, yIn), over the edge of the wall,
 * then down the outermost armour above each height (`wall(y)`, distance out), to the hem. Null without armour.
 */
function curtainSection(
  wall: (y: number) => number | null,
  roofAt: (out: number) => number | null,
  start: { out: number; up: number } | null,
  yFrom: number,
  hemY: number,
  gap: number,
  /** Only armour further out than this holds the cloth (a drape with no roof net above it: FLANK_REACH_M). */
  minOut = -Infinity,
  /** The highest armour under a point `out` from the centre line (how far in a wall's top runs). */
  under?: (out: number) => number | null,
): { pts: Array<[number, number]>; corner: number } | null {
  // the wall's outer profile from the cloth's edge down, and its running maximum (the cloth falls from the outermost
  // point above it); nothing above the roof net's edge holds this cloth (a glacis or roof rising behind it)
  const step = 0.02;
  let top: number | null = null, edgeOut = 0;
  const drop: Array<[number, number]> = [];
  let run = -Infinity;
  const holds = (yy: number): number | null => {
    // only armour outboard of where the cloth comes over the edge holds it (a cupola or sight head inboard does not)
    const raw = wall(yy);
    return raw !== null && raw > minOut && (!start || raw > start.out - 0.02) ? raw : null;
  };
  for (let yy = start ? Math.min(yFrom, start.up) : yFrom; yy >= hemY - 1e-6; yy -= step) {
    let w = holds(yy);
    if (w !== null && top === null) {
      // the wall's top edge, found to a millimetre between this sample and the one above it
      let lo = yy, hi = Math.min(yy + step, start ? start.up : yFrom);
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (holds(mid) !== null) lo = mid; else hi = mid; }
      top = lo;
      edgeOut = Math.max(w, holds(lo) ?? w);
      run = edgeOut;
      drop.push([run + gap, lo]);
      w = holds(yy);
    }
    if (w !== null && top !== null && w > run + 0.004 && yy < top - 1e-4) {
      // the wall steps out between this sample and the one above (a bin, a cassette, a skirt's top): the cloth goes
      // over that protrusion's top as a shelf at its loft, never across its corner
      let lo = yy, hi = yy + step;
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; const m = holds(mid); if (m !== null && m > run + 0.004) lo = mid; else hi = mid; }
      const ledge = Math.min(lo + gap * 1.5, (drop.length ? drop[drop.length - 1][1] : lo + gap) - 1e-4);
      drop.push([run + gap, ledge]);
      run = Math.max(run, w, holds(lo) ?? w);
      drop.push([run + gap, ledge - 1e-4]);
    }
    if (w !== null) run = Math.max(run, w);
    if (top !== null && yy < top - 1e-4) drop.push([run + gap, yy]);
  }
  if (top === null || !drop.length) return null;
  if (drop[drop.length - 1][1] > hemY + 1e-4) drop.push([run + gap, hemY]);
  const pts: Array<[number, number]> = [];
  if (start) {
    // along the roof from the roof net's edge to the wall top, then over the edge
    edgeOut = Math.max(edgeOut, start.out);
    const span = edgeOut - start.out;
    const n = Math.max(1, Math.ceil(span / 0.025));
    for (let k = 0; k <= n; k++) {
      const o = start.out + (span * k) / n;
      const r = roofAt(o);
      const up = Math.max(r ?? -Infinity, k === 0 ? start.up : -Infinity, top + gap * 0.6);
      pts.push([o, k === 0 ? start.up : up]);
    }
  } else {
    // with no roof net above, the cloth comes over the wall's top from as far in as that top runs, 4 cm at most: a
    // plate's top carries a lip of it, a screen's top rail (push 3b's Ukrainian side screens) only its own width
    let lip = edgeOut - 0.04;
    if (under) {
      lip = edgeOut;
      for (let o = edgeOut - 0.005; o >= edgeOut - 0.04 - 1e-9; o -= 0.005) {
        const h = under(o);
        if (h === null || h < top - 0.03) break;
        lip = o;
      }
    }
    pts.push([lip, top + gap * 0.6]);
  }
  const corner = pts.length;
  // the roll over the edge: a round a full loft outside the wall's top edge, from the last roof point onto the drop
  const [ro, ru] = pts[pts.length - 1];
  pts.push([Math.max(ro, edgeOut) + gap * 0.75, Math.max(top + gap * 0.75, ru - gap * 0.4)]);
  for (const p of drop) if (p[1] < pts[pts.length - 1][1] - 1e-4) pts.push(p);
  return { pts, corner };
}

/**
 * A fitted cover's section at one station: on from the roof edge, then down the wall at the fitted loft, bridging only
 * recesses shorter than a hand (a bolt row, a skirt joint), never hanging free past the plate.
 */
function fittedSection(
  wall: (y: number) => number | null,
  start: { out: number; up: number } | null,
  yFrom: number,
  hemY: number,
): { pts: Array<[number, number]>; corner: number } | null {
  const step = 0.02, bridge = 5;
  const raw: Array<[number, number]> = [];
  for (let yy = start ? Math.min(yFrom, start.up) : yFrom; yy >= hemY - 1e-6; yy -= step) {
    const w = wall(yy);
    if (w !== null && (!start || w > start.out - 0.02)) raw.push([w, yy]);
    else if (raw.length) raw.push([-Infinity, yy]);
  }
  if (!raw.length) return null;
  const drop: Array<[number, number]> = [];
  for (let k = 0; k < raw.length; k++) {
    let o = raw[k][0];
    for (let q = Math.max(0, k - bridge); q <= Math.min(raw.length - 1, k + bridge); q++) o = Math.max(o, raw[q][0] - Math.abs(q - k) * 0.004);
    if (Number.isFinite(o)) drop.push([o + FITTED_GAP_M, raw[k][1]]);
  }
  if (!drop.length) return null;
  const pts: Array<[number, number]> = [];
  if (start) pts.push([Math.min(start.out, drop[0][0] - 0.01), start.up]);
  const corner = pts.length;
  for (const p of drop) pts.push(p);
  return { pts, corner };
}

/** Gravity folds of one drape: ridges at irregular stations with their own width, depth and slant. */
interface FoldField { at: number[]; w: number[]; a: number[]; slant: number[] }
function foldField(span0: number, span1: number, seed: number): FoldField {
  const at: number[] = [], w: number[] = [], a: number[] = [], slant: number[] = [];
  let k = 0;
  for (let u = span0 - 0.1 + hash01(seed, k++, 0x41) * 0.2; u < span1 + 0.2; u += 0.26 + hash01(seed, k++, 0x43) * 0.38) {
    at.push(u);
    w.push(0.06 + hash01(seed, k++, 0x45) * 0.07);
    a.push(0.45 + hash01(seed, k++, 0x47) * 0.55);
    slant.push((hash01(seed, k++, 0x49) - 0.5) * 0.12);
  }
  return { at, w, a, slant };
}
function foldAt(f: FoldField, u: number, below: number): number {
  let v = 0;
  for (let i = 0; i < f.at.length; i++) {
    const c = f.at[i] + f.slant[i] * below;
    const d = (u - c) / f.w[i];
    if (d > -3 && d < 3) v = Math.max(v, f.a[i] * Math.exp(-d * d));
  }
  return v;
}

/** The netting lane: how far under a laid net's level armour still holds it (m), and the step a laid cell never spans. */
const LAID_DROP_M = 0.35;
const LAID_STEP_M = 0.25;
/** The netting lane: how far off its authored plane a hanging face net still finds its face (m). */
const FACE_REACH_M = 0.3;
/** The netting lane: how far off the running gear's surfaces a hull suit keeps (m). */
const GEAR_KEEP_M = 0.035;
/** The netting lane: a field suit's drape hangs this close to its wall (m; the older suits keep HANG_GAP_M). */
const FIELD_HANG_GAP_M = 0.009;
/**
 * The netting lane: with no roof net above, only armour this close inside a field suit's drape line holds its top (m; a
 * hatch lid 40 cm in from the deck's edge is no wall to hang it from).
 */
const FIELD_FLANK_REACH_M = 0.2;

/** Fold depth at the hem of a hanging drape (bounded by the suit's certified half-width where it has one). */
const FOLD_DEPTH_M = 0.065;

interface CurtainSpec {
  /** Stations along the drape (z for a flank, x for a face). */
  readonly a0: number; readonly a1: number;
  /** The section at a station, its hem height, and the authored fallback section. */
  section(a: number, hemY: number): { pts: Array<[number, number]>; corner: number } | null;
  fallback(a: number, t: number): [number, number];
  hem(a: number): number;
  /** owner-local position of (station, out, up). */
  place(a: number, out: number, up: number): Point3;
  /** Optional cell mask in (station, up); a0 and a1 are the cell's own station span. */
  keep?(a: number, up: number, a0: number, a1: number): boolean;
  /**
   * The netting lane: a corner test (owner-local); the first cell of a column with a refused corner and every cell
   * hanging below it are left out, so no cloth is left hanging under a cut.
   */
  keepPoint?(p: Point3): boolean;
  /**
   * The netting lane: a station with no roof net's edge above it (`orphan`) whose section finds no armour holds no
   * cloth (no authored fallback hung in the air from nothing); under a roof net's edge the fallback hangs from it.
   */
  orphan?(a: number): boolean;
  /** The netting lane: a field suit's drape keeps no scrap (a piece under 24 cells or an eighth of the drape). */
  readonly field?: boolean;
  readonly maxOut: number;
  readonly seed: number;
  /** Fold depth multiplier (a tied-down face drape folds little). */
  readonly foldK: number;
}

function buildCurtain(spec: CurtainSpec, uvk: number, uvOffset: [number, number], flip: boolean): {
  geometry: THREE.BufferGeometry; columns: Array<{ a: number; pts: Point3[]; normals: Point3[]; t: number[] }>;
} {
  const { a0, a1 } = spec;
  const folds = foldField(Math.min(a0, a1), Math.max(a0, a1), spec.seed);
  // stations: an even pitch, plus each fold's crest and flanks (so a fold is drawn, not aliased)
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const marks = new Set<number>();
  const even = Math.max(2, Math.ceil((hi - lo) / DRAPE_COLUMN_M));
  for (let k = 0; k <= even; k++) marks.add(lo + ((hi - lo) * k) / even);
  folds.at.forEach((c, i) => { for (const d of [-1.25, 0, 1.25]) { const a = c + d * folds.w[i]; if (a > lo + 0.03 && a < hi - 0.03) marks.add(a); } });
  const stations = [...marks].sort((p, q) => p - q).filter((a, i, list) => i === 0 || i === list.length - 1 || a - list[i - 1] > 0.055);
  if (a1 < a0) stations.reverse();
  const cols = stations.length - 1;
  const station = (c: number): number => stations[c];
  // every column's section, resampled by arc length to a shared row count
  const sections: Array<{ out: number[]; up: number[]; t: number[]; corner: number }> = [];
  let rows = 2;
  const raw: Array<{ pts: Array<[number, number]>; corner: number } | null> = [];
  const lengths: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const a = station(c);
    const hemY = spec.hem(a);
    const sec = spec.section(a, hemY);
    raw.push(sec);
    if (sec) {
      let len = 0;
      for (let k = 1; k < sec.pts.length; k++) len += Math.hypot(sec.pts[k][0] - sec.pts[k - 1][0], sec.pts[k][1] - sec.pts[k - 1][1]);
      lengths.push(len);
    }
  }
  // rows for the drape's typical section (a few long ones take longer rows)
  lengths.sort((p, q) => p - q);
  const typical = lengths.length ? lengths[Math.floor(lengths.length * 0.75)] : 0.6;
  rows = THREE.MathUtils.clamp(Math.ceil(typical / DRAPE_ROW_M) + 1, 3, 12);
  // one row runs along the roll over the wall's top edge (each section's vertex at `corner`): the rows split there, the
  // part on the roof and the drop each spaced evenly, so the roll is drawn where it lies instead of as a chord pushed off
  // it (round 5, 2026-10-08: over push 3b's screen top rails such a chord left the net's top row 3 cm in the air)
  const shares: number[] = [];
  for (const sec of raw) {
    if (!sec || sec.corner <= 0) continue;
    let len = 0, toCorner = 0;
    for (let k = 1; k < sec.pts.length; k++) {
      const l = Math.hypot(sec.pts[k][0] - sec.pts[k - 1][0], sec.pts[k][1] - sec.pts[k - 1][1]);
      len += l;
      if (k <= sec.corner) toCorner += l;
    }
    if (len > 1e-6) shares.push(toCorner / len);
  }
  shares.sort((p, q) => p - q);
  const k0 = shares.length ? THREE.MathUtils.clamp(Math.round(rows * shares[Math.floor(shares.length / 2)]), 1, rows - 1) : 0;
  for (let c = 0; c <= cols; c++) {
    const a = station(c);
    const sec = raw[c];
    const out: number[] = [], up: number[] = [], t: number[] = [];
    if (!sec) {
      for (let r = 0; r <= rows; r++) { const tt = 1 - r / rows; const [o, u] = spec.fallback(a, tt); out.push(o); up.push(u); t.push(tt); }
      sections.push({ out, up, t, corner: 0 });
      continue;
    }
    const cum = [0];
    for (let k = 1; k < sec.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(sec.pts[k][0] - sec.pts[k - 1][0], sec.pts[k][1] - sec.pts[k - 1][1]));
    const total = cum[cum.length - 1] || 1;
    const cornerLen = cum[Math.min(sec.corner, cum.length - 1)];
    const split = k0 > 0 && sec.corner > 0 && cornerLen > 1e-6 && cornerLen < total - 1e-6;
    const arcAt = (r: number): number => (!split ? (total * r) / rows
      : r <= k0 ? (cornerLen * r) / k0 : cornerLen + ((total - cornerLen) * (r - k0)) / (rows - k0));
    for (let r = 0; r <= rows; r++) {
      // rows run from the roof (r = 0) to the hem (r = rows); nothing passes a certified half-width
      const L = arcAt(r);
      let k = 1;
      while (k < cum.length - 1 && cum[k] < L) k++;
      const f = (L - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
      out.push(Math.min(spec.maxOut, sec.pts[k - 1][0] + (sec.pts[k][0] - sec.pts[k - 1][0]) * f));
      up.push(sec.pts[k - 1][1] + (sec.pts[k][1] - sec.pts[k - 1][1]) * f);
      t.push(1 - L / total);
    }
    // a row chord never cuts a corner of the section (a cassette's or a skirt's top edge between two rows): rows
    // either side of a section vertex lying outside their chord are pushed out past it
    const push = new Float64Array(rows + 1);
    for (let r = 0; r < rows; r++) {
      const La = arcAt(r), Lb = arcAt(r + 1);
      const to = out[r + 1] - out[r], tu = up[r + 1] - up[r], tl = Math.hypot(to, tu);
      if (tl < 1e-6) continue;
      const nO = -tu / tl, nU = to / tl;
      for (let k = 1; k < sec.pts.length - 1; k++) {
        if (cum[k] <= La || cum[k] >= Lb) continue;
        const d = (sec.pts[k][0] - out[r]) * nO + (sec.pts[k][1] - up[r]) * nU;
        if (d > 0) { push[r] = Math.max(push[r], d); push[r + 1] = Math.max(push[r + 1], d); }
      }
    }
    for (let r = 0; r <= rows; r++) {
      if (push[r] <= 0) continue;
      const r0 = Math.max(0, r - 1), r1 = Math.min(rows, r + 1);
      const to = out[r1] - out[r0], tu = up[r1] - up[r0], tl = Math.hypot(to, tu) || 1;
      out[r] = Math.min(out[r] + (-tu / tl) * push[r], spec.maxOut);
      up[r] += (to / tl) * push[r];
    }
    // gravity folds along the section's outward normal (taken from the undisplaced section), deepening below the edge
    // and toward the hem; nothing falls below the hem it was given
    const n0 = out.slice(), u0 = up.slice();
    for (let r = 1; r <= rows; r++) {
      const L = arcAt(r);
      const below = L - cornerLen;
      if (below <= 0.02) continue;
      const r0 = r - 1, r1 = Math.min(rows, r + 1);
      const to = n0[r1] - n0[r0], tu = u0[r1] - u0[r0], tl = Math.hypot(to, tu) || 1;
      const nO = -tu / tl, nU = to / tl;
      const depth = FOLD_DEPTH_M * spec.foldK * smooth01(0.03, 0.4, below) * (0.55 + 0.45 * smooth01(0.25, 0.9, below / Math.max(0.1, total - cornerLen)));
      const off = depth * foldAt(folds, a, below);
      out[r] = Math.min(n0[r] + nO * off, spec.maxOut);
      up[r] = Math.max(u0[r] + nU * off, u0[rows]);
    }
    sections.push({ out, up, t, corner: sec.corner });
  }
  // geometry
  const positions: number[] = [], uvs: number[] = [];
  const columns: Array<{ a: number; pts: Point3[]; normals: Point3[]; t: number[] }> = [];
  const missing = raw.map((sec, c) => !sec && !!spec.orphan?.(station(c)));
  const vertex: Point3[][] = sections.map((sec, c) => sec.out.map((o, r) => spec.place(station(c), o, sec.up[r])));
  const vlen: number[][] = sections.map((sec) => {
    const out = [0];
    for (let r = sec.out.length - 2; r >= 0; r--) out.unshift(out[0] + Math.hypot(sec.out[r + 1] - sec.out[r], sec.up[r + 1] - sec.up[r]));
    return out;
  });
  // each corner is asked once (it is shared by up to four cells)
  const kept: Array<Array<boolean | undefined>> = vertex.map((col) => new Array<boolean | undefined>(col.length));
  const keptAt = (c: number, r: number): boolean => (kept[c][r] ??= spec.keepPoint!(vertex[c][r]));
  for (let c = 0; c < cols; c++) {
    const aA = station(c), aB = station(c + 1);
    if (missing[c] || missing[c + 1]) continue;
    let cut = false;
    for (let r = 0; r < rows; r++) {
      if (cut || (spec.keepPoint && !(keptAt(c, r) && keptAt(c + 1, r) && keptAt(c + 1, r + 1) && keptAt(c, r + 1)))) {
        cut = true;
        continue;
      }
      const upMid = (sections[c].up[r] + sections[c].up[r + 1] + sections[c + 1].up[r] + sections[c + 1].up[r + 1]) / 4;
      if (spec.keep && !spec.keep((aA + aB) / 2, upMid, aA, aB)) continue;
      // the hem row tears here and there
      if (r === rows - 1 && noise01(c + spec.seed, spec.seed + 7) < 0.17) continue;
      const A = vertex[c][r], B = vertex[c + 1][r], C = vertex[c + 1][r + 1], D = vertex[c][r + 1];
      const uv = (cc: number, rr: number, a: number): [number, number] => [a * uvk + uvOffset[0], vlen[cc][rr] * uvk + uvOffset[1]];
      const quad: Array<[Point3, [number, number]]> = [[A, uv(c, r, aA)], [B, uv(c + 1, r, aB)], [C, uv(c + 1, r + 1, aB)], [D, uv(c, r + 1, aA)]];
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const k of order) { const [p, q] = quad[k]; positions.push(p[0], p[1], p[2]); uvs.push(q[0], q[1]); }
    }
  }
  for (let c = 0; c <= cols; c++) {
    const a = station(c);
    const sec = sections[c];
    const normals: Point3[] = sec.out.map((_, r) => {
      const r0 = Math.max(0, r - 1), r1 = Math.min(sec.out.length - 1, r + 1);
      const to = sec.out[r1] - sec.out[r0], tu = sec.up[r1] - sec.up[r0], tl = Math.hypot(to, tu) || 1;
      return [-tu / tl, to / tl, 0];
    });
    columns.push({ a, pts: vertex[c], normals, t: sec.t });
  }
  if (spec.field) dropIslands(positions, uvs, 24, 8);
  else dropIslands(positions, uvs);
  return { geometry: makeGeometry(positions, uvs), columns };
}

/**
 * The height of a curtain's top row along its stations. Round 5 (2026-10-08, push 3's Ukrainian screens;
 * nationalUkraineProtection.selftest: "continuous main gun envelope intersects ... ghillie_hull_leaves"): a hull drape
 * under a turret keeps its garnish below this line, out of the sweep of the gun and the bustle overhead.
 */
function curtainTopAt(columns: Array<{ a: number; pts: Point3[] }>): (a: number) => number {
  return (a) => {
    if (!columns.length) return Infinity;
    const asc = columns[0].a <= columns[columns.length - 1].a;
    const list = asc ? columns : [...columns].reverse();
    if (a <= list[0].a) return list[0].pts[0][1];
    for (let c = 1; c < list.length; c++) {
      if (a <= list[c].a) {
        const w = (a - list[c - 1].a) / ((list[c].a - list[c - 1].a) || 1);
        return list[c - 1].pts[0][1] + (list[c].pts[0][1] - list[c - 1].pts[0][1]) * w;
      }
    }
    return list[list.length - 1].pts[0][1];
  };
}

/** A curtain's garnish sampler over (station, t): t from the hem (0) to the roof edge (1). */
function curtainSampler(columns: Array<{ a: number; pts: Point3[]; normals: Point3[]; t: number[] }>,
  outward: (n: Point3) => [number, number, number]): (u: number, v: number) => ClothPoint | null {
  return (u, v) => {
    if (columns.length < 2) return null;
    const a0 = columns[0].a, a1 = columns[columns.length - 1].a;
    const f = THREE.MathUtils.clamp((u - a0) / ((a1 - a0) || 1), 0, 1) * (columns.length - 1);
    const c = Math.min(columns.length - 2, Math.floor(f)), w = f - c;
    const at = (col: typeof columns[number]): { p: Point3; n: Point3 } => {
      const t = col.t;
      let r = 1;
      while (r < t.length - 1 && t[r] > v) r++;
      const g = THREE.MathUtils.clamp((t[r - 1] - v) / ((t[r - 1] - t[r]) || 1), 0, 1);
      const p0 = col.pts[r - 1], p1 = col.pts[r], n0 = col.normals[r - 1], n1 = col.normals[r];
      return { p: [p0[0] + (p1[0] - p0[0]) * g, p0[1] + (p1[1] - p0[1]) * g, p0[2] + (p1[2] - p0[2]) * g],
        n: [n0[0] + (n1[0] - n0[0]) * g, n0[1] + (n1[1] - n0[1]) * g, 0] };
    };
    const A = at(columns[c]), B = at(columns[c + 1]);
    const p: [number, number, number] = [A.p[0] + (B.p[0] - A.p[0]) * w, A.p[1] + (B.p[1] - A.p[1]) * w, A.p[2] + (B.p[2] - A.p[2]) * w];
    const n = outward([A.n[0] + (B.n[0] - A.n[0]) * w, A.n[1] + (B.n[1] - A.n[1]) * w, 0]);
    return { p, n };
  };
}

/**
 * A hanging section below the height y (a drape tied under its rail, SidePanel.tiedTop): the part over and above the
 * rail is cut away and the cloth starts where its section crosses y. Null when less than one segment remains.
 */
function sectionBelow(sec: { pts: Array<[number, number]>; corner: number }, y: number):
  { pts: Array<[number, number]>; corner: number } | null {
  if (sec.pts.every((p) => p[1] <= y)) return sec;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < sec.pts.length; k++) {
    const [o, u] = sec.pts[k];
    if (u > y) continue;
    if (!pts.length && k > 0) {
      const [po, pu] = sec.pts[k - 1];
      const f = (pu - y) / ((pu - u) || 1);
      if (u < y - 1e-4) pts.push([po + (o - po) * f, y]);
    }
    pts.push([o, u]);
  }
  return pts.length >= 2 ? { pts, corner: 0 } : null;
}

/** The netting lane: whether a roll lying over the deck across plan x x0..x1 at z (or z z0..z1 at x) meets a lid box. */
function rollMeetsLid(lids: ReadonlyArray<readonly [number, number, number, number]> | undefined,
  x0: number, x1: number, z0: number, z1: number): boolean {
  return !!lids?.some(([bx0, bx1, bz0, bz1]) => Math.max(x0, x1) > bx0 - 0.05 && Math.min(x0, x1) < bx1 + 0.05
    && Math.max(z0, z1) > bz0 - 0.05 && Math.min(z0, z1) < bz1 + 0.05);
}

/** The netting lane: a cloth falling free from a roof net's edge (start) to its hem, or null with no drop to hang. */
function freeHang(start: { out: number; up: number }, hemY: number): { pts: Array<[number, number]>; corner: number } | null {
  if (start.up - hemY < 0.1) return null;
  return { pts: [[start.out, start.up], [start.out + HANG_GAP_M, start.up - 0.03], [start.out + HANG_GAP_M, hemY]], corner: 1 };
}

/** Metres of bare run a mission dock keeps either side of it in a wing's drape. */
const DOCK_CLEAR_M = 0.03;

function sideCloth(panel: SidePanel, cfg: GhillieConfig, support: OwnerSupport, uvk: number,
  gunFloor: ((x: number, z: number) => number) | null = null, dock: THREE.Box3 | null = null): ClothSurface {
  const { side, z0, z1, topAt, bottomAt, outAt, shoulder, cuts = [] } = panel;
  // 2026-10-08 (the lane lead, the owner's field standard "weapons clear of cages and nets"): a roof gun standing at the
  // flank's edge (the PT-91 Twardy's NSVT on its cupola ring) keeps the drape's roll under it. Over the drape's run in
  // from the edge, a column's cells reaching within 2 cm of the standing gun's floor are left out, so the net's top stops
  // under the gun instead of rolling over the roof through it.
  // 2026-10-08 (the lane lead, over push 5's regenerated drone-dock seats): a drape hung on a roof-cage wing that carries
  // a mission dock is cut away over the dock's run, top to hem (missionAttachmentReceiver.selftest, t80u_zoria: Zoria's
  // bearers rest on the wing's outer tube, where the drape's roll came over it); the pieces either side hang on their own
  const dockSide = dock && Math.sign(dock.min.x + dock.max.x) === side ? dock : null;
  const runFloor = gunFloor ? (z: number): number => {
    let low = Infinity;
    for (let o = outAt(z, 1) + 0.05; o > outAt(z, 1) - 0.6; o -= 0.04) low = Math.min(low, gunFloor(side * o, z));
    return low;
  } : null;
  const ties = hemTies(panel, cfg.seed);
  const s = panelSeed(panel, cfg.seed) ^ (side > 0 ? 0x2b : 0x71);
  const maxOut = (cfg.maxHalfWidth ?? Infinity) - 0.002;
  const probe = support.probe;
  const hem = (z: number): number => {
    const authored = bottomAt(z + side * HEM_PHASE_M);
    const h = hemAt(ties, z);
    // a ragged hem: scalloped between the ties, torn short and long from one column to the next
    const jag = (hash01(Math.round(z * 41), s, 0x5d) - 0.5) * 0.045;
    const floor = support.hull ? Math.min(authored, support.hemFloor) : authored - 0.07;
    // the netting lane: a turret drape's hem clears the hull through the traverse
    const raised = support.hemFloorAt ? support.hemFloorAt(side * outAt(z, 0), z) : -Infinity;
    // a fitted cover is cut to its plate: its hem follows the authored line, ragged but never scalloped deep
    if (support.fitted) return Math.max(authored - h.drop * 0.35 + jag * 0.8, floor, raised);
    return Math.max(authored - h.drop * (support.hull ? 2.2 : 1.6) + jag, floor, raised);
  };
  const roofEdge = (z: number): { out: number; up: number } | null => {
    if (shoulder && z >= shoulder.z0 - 1e-6 && z <= shoulder.z1 + 1e-6) {
      const o = shoulder.inAt(z);
      return { out: o, up: support.roof(side * o, z) ?? shoulder.yAt(z) };
    }
    // a deck net of this owner reaching toward this flank: start a few centimetres inside its edge
    // a roof net within half a metre inside the drape's line (never one across an opening further in)
    for (let o = outAt(z, 1) + 0.05, stop = Math.max(0.02, outAt(z, 1) - 0.5); o > stop; o -= 0.02) {
      const r = support.roof(side * o, z);
      if (r === null) continue;
      // the netting lane: a roll that would lie across a lid (a hatch beside the deck's edge) is not hung: the drape
      // starts at its wall's top instead
      if (rollMeetsLid(support.lids, side * Math.max(0.02, o - 0.04), side * (outAt(z, 1) + 0.05), z, z)) return null;
      return { out: Math.max(0.02, o - 0.04), up: support.roof(side * Math.max(0.02, o - 0.04), z) ?? r };
    }
    return null;
  };
  const spec: CurtainSpec = {
    a0: z0, a1: z1, seed: s, foldK: support.fitted ? 0.18 : 1, maxOut,
    hem,
    section(z, hemY) {
      if (!probe) return null;
      const start = roofEdge(z);
      const yFrom = start ? start.up : topAt(z) + 0.05;
      if (support.fitted) return fittedSection((yy) => probe.side(yy, z, side), start, yFrom, hemY);
      const sec = curtainSection((yy) => probe.side(yy, z, side), (o) => support.roof(side * o, z) ?? (() => {
        const r = probe.topNear(side * o, z, 0.03);
        return r === null ? null : r + DRAPE_GAP_M;
      })(), start, yFrom, hemY, support.clothOk ? FIELD_HANG_GAP_M : HANG_GAP_M,
      start ? -Infinity : outAt(z, 1) - (support.clothOk ? FIELD_FLANK_REACH_M : FLANK_REACH_M),
      // the netting lane: a lip over the wall's top never lies on a lid
      (o) => (rollMeetsLid(support.lids, side * o, side * o, z, z) ? null : probe.top(side * o, z)));
      // the netting lane: under a roof net's edge with no wall outboard to lie on (a turret's sides sloping in under
      // its roof), the cloth falls free from that edge
      const free = !sec && start && support.clothOk && !panel.tiedTop ? freeHang(start, hemY) : null;
      const hung = panel.tiedTop && sec ? sectionBelow(sec, topAt(z)) : sec ?? free;
      // the netting lane: a hull drape whose roll over the deck's edge lies in the turret's sweep (or in another of the
      // vehicle's clearances) is tied lower on its wall instead, from the highest height its cloth keeps every clearance
      // all the way down to the hem (a drape beside the turret hangs from the skirt's top, not over the deck under it)
      if (!hung || !support.hull || !support.clothOk) return hung;
      const clear = (o: number, u: number): boolean => support.clothOk!([side * o, u, z]);
      if (hung.pts.every(([o, u]) => clear(o, u))) return hung;
      let tieY: number | null = null;
      for (let k = hung.pts.length - 1; k >= 0 && clear(hung.pts[k][0], hung.pts[k][1]); k--) tieY = hung.pts[k][1];
      const tied = tieY === null || tieY < hemY + 0.15 ? null : sectionBelow(hung, tieY);
      // its top lashed snug to the wall there (6 mm off it), the cloth falling away below
      const wallAt = tied ? probe.side(tied.pts[0][1], z, side) : null;
      if (tied && wallAt !== null && wallAt <= tied.pts[0][0] && wallAt > tied.pts[0][0] - 0.15) tied.pts[0] = [wallAt + 0.006, tied.pts[0][1]];
      return tied;
    },
    fallback(z, t) {
      const top = topAt(z), bottom = hem(z);
      return [Math.min(outAt(z, t), maxOut), THREE.MathUtils.lerp(bottom, top, t)];
    },
    place: (z, out, up) => [side * out, up, z],
    keepPoint: support.clothOk,
    // netting-proper round 2 (the Mk 4B's turret flanks: the roof net laid down the sloping side to the drape's hem, no
    // wall under its edge, and the authored line 27 cm out in the air, hung with hessian): a field drape that is not tied
    // under a rail hangs only from armour or free from its roof net's edge; a station with neither holds no cloth
    ...(support.clothOk ? { orphan: (z: number) => !panel.tiedTop || roofEdge(z) === null, field: true } : {}),
    ...(runFloor || dockSide || cuts.length ? { keep: (z: number, up: number, za: number, zb: number): boolean =>
      (!runFloor || up < runFloor(z) - 0.02)
      && !(dockSide && Math.max(za, zb) > dockSide.min.z - DOCK_CLEAR_M && Math.min(za, zb) < dockSide.max.z + DOCK_CLEAR_M)
      // a cut runs from its top down to the hem (cloth never hangs on below a cut)
      && !cuts.some(([c0, c1, , hi]) => Math.max(za, zb) > c0 && Math.min(za, zb) < c1 && up < hi) } : {}),
  };
  const { geometry, columns } = buildCurtain(spec, uvk, panelUvOffset(panel, cfg.seed), side < 0);
  const underTurret = support.hull && !support.turretless, topRow = curtainTopAt(columns);
  return {
    kind: 'drape', owner: 'side', panel, geometry, domain: [z0, z1, 0.06, 0.97],
    sample: curtainSampler(columns, (n) => { const l = Math.hypot(n[0], n[1]) || 1; return [side * n[0] / l, n[1] / l, 0]; }),
    allowed: () => true,
    cardOk: (p) => p[2] >= z0 - 0.05 && p[2] <= z1 + 0.05 && (!underTurret || p[1] <= topRow(p[2]) + 0.005)
      && !cuts.some(([c0, c1, , hi]) => p[2] > c0 - 0.04 && p[2] < c1 + 0.04 && p[1] < hi + 0.04),
  };
}

function faceCloth(panel: FacePanel, cfg: GhillieConfig, support: OwnerSupport, uvk: number): ClothSurface {
  const { x0, x1, y0, y1, outline = null, holes = [] } = panel;
  const facing = panel.z >= 0 || (panel.zAt ? panel.zAt((x0 + x1) / 2, (y0 + y1) / 2) >= 0 : false) ? 1 : -1;
  const s = panelSeed(panel, cfg.seed) ^ (facing > 0 ? 0x13 : 0x37);
  const probe = support.probe;
  const authoredZ = (x: number, y: number): number => (panel.zAt ? panel.zAt(x, y) : panel.z);
  // a face net seated on its plate (seatGapM) follows that plate; a hanging one falls from the edge above it
  const tied = panel.seatGapM !== undefined || support.fitted;
  const gap = tied && probe ? Math.min(panel.seatGapM ?? FITTED_GAP_M, DRAPE_GAP_M - 0.002) : panel.seatGapM ?? DRAPE_GAP_M;
  const hem = (x: number): number => {
    const jag = (hash01(Math.round(x * 41), s, 0x5d) - 0.5) * 0.04;
    const scallop = 0.035 * Math.max(0, Math.sin(x * 7.3 + s * 0.01)) ** 2;
    const raised = support.hemFloorAt ? support.hemFloorAt(x, facing * authoredZ(x, y0)) : -Infinity;
    return Math.max(y0 - scallop + jag, support.hull ? Math.min(y0, support.hemFloor) : y0 - 0.06, raised);
  };
  const spec: CurtainSpec = {
    a0: x0, a1: x1, seed: s, foldK: tied ? 0.25 : 0.8, maxOut: Infinity,
    hem,
    section(x, hemY) {
      if (!probe) return null;
      if (tied) {
        // tied to the plate: the cloth follows the face at its seat gap, no roll and no free fall. Only a face within
        // TIED_REACH_M of the authored plane is its plate: through the gaps of an open screen (push 3's Ukrainian bustle
        // screens) the probe meets the turret behind it, or a cupola a metre forward, and the cloth jumped there
        const pts: Array<[number, number]> = [];
        for (let yy = y1; yy >= hemY - 1e-6; yy -= 0.03) {
          const plane = facing * authoredZ(x, yy), f = probe.face(x, yy, facing);
          pts.push([(f !== null && Math.abs(f - plane) <= TIED_REACH_M ? f : plane) + gap, yy]);
        }
        return pts.length > 1 ? { pts, corner: 0 } : null;
      }
      // the roof net's edge above this face (scan in from the authored face plane), if there is one
      let start: { out: number; up: number } | null = null;
      const zFace = facing * authoredZ(x, y1);
      for (let o = zFace; o > zFace - 0.6; o -= 0.02) {
        const r = support.roof(x, facing * o);
        if (r === null) continue;
        // the netting lane: never a roll across a lid between the roof net's edge and the face
        if (!rollMeetsLid(support.lids, x, x, facing * (o - 0.04), facing * zFace)) start = { out: o - 0.04, up: support.roof(x, facing * (o - 0.04)) ?? r };
        break;
      }
      const yFrom = start ? start.up : y1 + 0.02;
      // the netting lane: only a face within FACE_REACH_M of the authored plane holds the cloth (past a bustle's corner the
      // probe meets the turret's side a metre forward, and a column hung there stretched one cell across the gap)
      const faceAt = support.clothOk ? (yy: number): number | null => {
        const f = probe.face(x, yy, facing);
        return f !== null && Math.abs(f - facing * authoredZ(x, yy)) <= FACE_REACH_M ? f : null;
      } : (yy: number): number | null => probe.face(x, yy, facing);
      const sec = curtainSection(faceAt, (o) => support.roof(x, facing * o) ?? (() => {
        const r = probe.topNear(x, facing * o, 0.03);
        return r === null ? null : r + gap;
      })(), start, yFrom, hemY, gap, -Infinity,
      // the netting lane: a lip over the face's top never lies on a lid
      (o) => (rollMeetsLid(support.lids, x, x, facing * o, facing * o) ? null : probe.top(x, facing * o)));
      // the netting lane: under a roof net's edge with no face behind it to lie on, the cloth falls free from that edge
      return sec ?? (start && support.clothOk ? freeHang(start, hemY) : null);
    },
    fallback(x, t) {
      const yy = THREE.MathUtils.lerp(hem(x), y1, t);
      return [facing * authoredZ(x, yy) + 0.01, yy];
    },
    place: (x, out, up) => [x, up, facing * out],
    keepPoint: support.clothOk, field: !!support.clothOk,
    // a hanging face net with no roof net's edge above it and no plate under it holds nothing (a tied one has its plate);
    // netting-proper round 2: nor one under a roof net's edge with no plate under it and nothing to fall free (the roof net
    // comes down to its hem): the authored plane there hangs in the air (sideCloth's orphan)
    ...(support.clothOk && !tied ? { orphan: () => true } : {}),
    keep(x, up) {
      if (outline && !insidePoly(x, Math.min(up, y1 - 0.01), outline) && up <= y1) return false;
      return !holes.some((hole) => insidePoly(x, up, hole));
    },
  };
  const { geometry, columns } = buildCurtain(spec, uvk, panelUvOffset(panel, cfg.seed), facing < 0);
  const underTurret = support.hull && !support.turretless, topRow = curtainTopAt(columns);
  return {
    kind: 'drape', owner: 'face', panel, geometry, domain: [x0, x1, 0.06, 0.97],
    sample: curtainSampler(columns, (n) => { const l = Math.hypot(n[0], n[1]) || 1; return [0, n[1] / l, facing * n[0] / l]; }),
    allowed: () => true,
    cardOk: (p) => p[0] >= x0 - 0.05 && p[0] <= x1 + 0.05 && !holes.some((hole) => nearPolygon(p[0], p[1], hole, 0.03))
      && (!underTurret || p[1] <= topRow(p[0]) + 0.005),
  };
}


const srgbLin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// ---------------------------------------------------------------------------------------------------------------
// The fitted cover's cut-leaf fabric (round 5, 2026-10-08). Wave 253 on the SEPv3's ULCANS: "a flat printed texture
// stretched over turret, glacis, hull side and skirts with dark clover decals, while the RWS, mantlet and turret front
// keep a separate woodland scheme, so the tank reads as two unrelated paint jobs", "big polka-dot blobs". A
// multispectral cover is a fabric in its theatre's pattern, cut through with leaf-shaped flaps that lift and curl, so
// it reads in relief, not print. The pattern is drawn from the vehicle's own scheme (its base and patch colours, in
// broad irregular woodland shapes at the paint's own scale), so the cover and the uncovered RWS, mantlet and gun read
// as one scheme; every flap is a cut with its lifted edge lit and the gap under it dark, some cut right out (the
// armour shows through), and the height map (the cloth's bump slot) raises each flap's tip.
// ---------------------------------------------------------------------------------------------------------------

/** Metres of cover per texture repeat (the paint's own patch scale). */
const COVER_TILE_M = 1.6;
const coverCache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null>();

/** The cover's colours: the scheme's base and patches (sRGB), from the vehicle's active camouflage. */
interface CoverPalette { readonly base: readonly [number, number, number]; readonly patches: ReadonlyArray<readonly [number, number, number]> }

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

function paintCutLeafCover(ctx: CanvasRenderingContext2D, hctx: CanvasRenderingContext2D, S: number, pal: CoverPalette, seed: number): void {
  const rng = garnishStream(seed);
  const wrap9 = (draw: (ox: number, oy: number) => void): void => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy); };
  const rgb = (c: readonly number[], a = 1): string => `rgba(${Math.min(255, c[0]) | 0},${Math.min(255, c[1]) | 0},${Math.min(255, c[2]) | 0},${a})`;
  const grey = (v: number): string => `rgb(${v | 0},${v | 0},${v | 0})`;
  // the scheme in broad lobed shapes: base ground, then each patch colour
  ctx.fillStyle = rgb(pal.base);
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = grey(70);
  hctx.fillRect(0, 0, S, S);
  const lobed = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string): void => {
    const pts: Array<[number, number]> = [];
    const n = 13;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, j = 0.55 + rng() * 0.75;
      const ex = Math.cos(a) * rx * j, ey = Math.sin(a) * ry * j;
      pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    wrap9((ox, oy) => {
      ctx.beginPath();
      pts.forEach(([px, py], k) => {
        const [qx, qy] = pts[(k + 1) % n];
        if (k === 0) ctx.moveTo((px + qx) / 2 + ox, (py + qy) / 2 + oy);
        else ctx.quadraticCurveTo(px + ox, py + oy, (px + qx) / 2 + ox, (py + qy) / 2 + oy);
      });
      ctx.quadraticCurveTo(pts[0][0] + ox, pts[0][1] + oy, (pts[0][0] + pts[1][0]) / 2 + ox, (pts[0][1] + pts[1][1]) / 2 + oy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    });
  };
  pal.patches.forEach((c, pi) => {
    const count = 5 + Math.floor(rng() * 3);
    for (let k = 0; k < count; k++) {
      const rx = S * (0.09 + rng() * 0.12), ry = rx * (0.35 + rng() * 0.4);
      lobed(rng() * S, rng() * S, rx, ry, rng() * Math.PI, rgb(c));
      // a smaller satellite lobe beside most shapes (woodland shapes are never single blobs)
      if (rng() < 0.7) lobed(rng() * S, rng() * S, rx * 0.5, ry * 0.6, rng() * Math.PI, rgb(c));
    }
    void pi;
  });
  // the cuts: leaf-shaped flaps over the whole sheet, each lifted at its tip (lit edge, dark gap under it); about one
  // in seven cut right out
  const image = ctx.getImageData(0, 0, S, S);
  const colorAt = (x: number, y: number): [number, number, number] => {
    const i = ((((Math.round(y) % S) + S) % S) * S + (((Math.round(x) % S) + S) % S)) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  ctx.lineCap = 'round';
  const leaves = 900;
  for (let k = 0; k < leaves; k++) {
    const cx = rng() * S, cy = rng() * S;
    const len = 8 + rng() * 11, wid = len * (0.32 + rng() * 0.2), ang = rng() * Math.PI * 2;
    const under = colorAt(cx, cy);
    const cut = rng() < 0.15;
    const lift = 0.6 + rng() * 0.4;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const leaf = (g: CanvasRenderingContext2D, ox: number, oy: number, grow = 0): void => {
      g.beginPath();
      g.moveTo(cx - ca * (len / 2 + grow) + ox, cy - sa * (len / 2 + grow) + oy);
      g.quadraticCurveTo(cx - sa * (wid + grow) + ox, cy + ca * (wid + grow) + oy, cx + ca * (len / 2 + grow) + ox, cy + sa * (len / 2 + grow) + oy);
      g.quadraticCurveTo(cx + sa * (wid + grow) * 0.7 + ox, cy - ca * (wid + grow) * 0.7 + oy, cx - ca * (len / 2 + grow) + ox, cy - sa * (len / 2 + grow) + oy);
      g.closePath();
    };
    wrap9((ox, oy) => {
      if (cut) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        leaf(ctx, ox, oy);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        ctx.restore();
        leaf(hctx, ox, oy);
        hctx.fillStyle = grey(0);
        hctx.fill();
        return;
      }
      // the gap the flap lifts off (dark), offset under its tip
      ctx.save();
      ctx.translate(ca * 1.2 + sa * 0.8, sa * 1.2 - ca * 0.8);
      leaf(ctx, ox, oy, 0.6);
      ctx.fillStyle = rgb(under.map((v) => v * 0.42), 0.85);
      ctx.fill();
      ctx.restore();
      // the flap itself, a touch lighter where it turns up to the sky, its cut edge darker
      leaf(ctx, ox, oy);
      ctx.fillStyle = rgb(under.map((v) => v * (1.02 + lift * 0.08)));
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgb(under.map((v) => v * 0.6), 0.6);
      ctx.stroke();
      leaf(hctx, ox, oy);
      hctx.fillStyle = grey(110 + lift * 120);
      hctx.fill();
    });
  }
}

/** The fitted cover's fabric for a scheme (cached per palette and seed; null without a DOM). */
function cutLeafCoverTextures(pal: CoverPalette, seed: number): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null {
  const key = `${pal.base.join(',')}|${pal.patches.map((c) => c.join(',')).join('|')}|${seed}`;
  if (coverCache.has(key)) return coverCache.get(key)!;
  let out: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas'), height = document.createElement('canvas');
      canvas.width = canvas.height = height.width = height.height = NET_TEXTURE_PX;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      const hctx = height.getContext('2d') as CanvasRenderingContext2D | null;
      if (ctx && hctx) {
        paintCutLeafCover(ctx, hctx, NET_TEXTURE_PX, pal, seed);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        const bump = new THREE.CanvasTexture(height);
        for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
        map.name = `ghillieCover:${seed}`;
        bump.name = `ghillieCoverHeight:${seed}`;
        out = { map, bump };
      }
    } catch {
      out = null;
    }
  }
  if (typeof document !== 'undefined') coverCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Garnish tufts (round 5). Wave 253: "the bushy leaf bundles ... near-identical clones at regular spacing", "round
// leaf blotches stuck on like decals", "the foliage clumps pressed flat against it"; the coordinator: "burlap garnish
// strips tied in irregular clusters". Two kinds, one draw (vehicleFoliage ghillieGarnishAtlas): burlap strip bunches
// knotted into the net (hanging down a drape, lying out over a deck and spilling over its edges, where they break the
// silhouette) and boughs cut on the spot, tucked butt-first and standing out of the net. Each tuft is placed on the
// clump point process (placeGarnishClumps) in its theatre's share; every card's stem sits on the cloth it is tied to.
// ---------------------------------------------------------------------------------------------------------------

/** A strip card's tint: the colour it should show over the atlas's painted hessian (linear multipliers). */
function stripTint(c: readonly [number, number, number], value: number): [number, number, number] {
  const [br, bg, bb] = GARNISH_STRIP_BASE_SRGB;
  return [srgbLin(c[0]) / srgbLin(br) * value, srgbLin(c[1]) / srgbLin(bg) * value, srgbLin(c[2]) / srgbLin(bb) * value];
}

function pickStripTone(pal: NetPalette, rng: () => number): readonly [number, number, number] {
  let r = rng(), acc = 0;
  for (const [c, w] of pal.strips) { acc += w; if (r < acc) return c; }
  return pal.strips[0][0];
}

/** A frame square to a direction: the card's face turned to `toward` as far as the axis allows. */
function faceFor(axis: readonly number[], toward: readonly number[]): [number, number, number] {
  const d = axis[0] * toward[0] + axis[1] * toward[1] + axis[2] * toward[2];
  const f = [toward[0] - axis[0] * d, toward[1] - axis[1] * d, toward[2] - axis[2] * d];
  const l = Math.hypot(f[0], f[1], f[2]);
  if (l < 1e-4) return [0, 1, 0];
  return [f[0] / l, f[1] / l, f[2] / l];
}

const norm3 = (v: readonly number[]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (a: readonly number[], b: readonly number[]): [number, number, number] =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface TuftContext {
  readonly cfg: GhillieConfig;
  readonly pal: NetPalette;
  readonly q: boolean;
  readonly maxHalfWidth: number;
  readonly hemFloor: number;
  /** The netting lane (fieldClearanceM): a whole card, its face sampled densely, keeps the vehicle's clearances. */
  readonly cardClear?: (card: FoliageCard) => boolean;
}

/** A card's face on a 5 x 5 raster (its three rows of three points interpolated), for clearances thinner than a card. */
function denseCardPoints(card: FoliageCard): number[][] {
  const g = foliageCardPoints(card);
  const at = (r: number, c: number): readonly number[] => g[r * 3 + c];
  const out: number[][] = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const fr = i / 2, fc = j / 2, r0 = Math.min(1, Math.floor(fr)), c0 = Math.min(1, Math.floor(fc)), u = fr - r0, w = fc - c0;
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      p[k] = (1 - u) * ((1 - w) * at(r0, c0)[k] + w * at(r0, c0 + 1)[k]) + u * ((1 - w) * at(r0 + 1, c0)[k] + w * at(r0 + 1, c0 + 1)[k]);
    }
    out.push(p);
  }
  return out;
}

function addTufts(out: FoliageCardBuffer, surface: ClothSurface, ctx: TuftContext, seedBase: number): void {
  const { cfg, pal } = ctx;
  const rng = garnishStream(seedBase);
  const [u0, u1, v0, v1] = surface.domain;
  const panel = surface.panel as TopPanel;
  const top = surface.kind === 'top';
  const margin = top ? (panel.garnishOpeningMarginM ?? 0.09) : 0.06;
  const band = top ? panel.garnishEdgeBandM : undefined;
  const riseMax = top ? (panel.garnishRiseM ?? 0.16) : 0.3;
  const seatOk = (u: number, v: number): boolean => surface.allowed(u, v, margin)
    && (band === undefined || !surface.edge || surface.edge(u, v).d <= band);
  // the garnished area: a deck's on a 10 cm raster, a drape's from its span and its height
  let area: number;
  if (top) {
    let cells = 0;
    for (let v = v0 + 0.05; v < v1; v += 0.1) for (let u = u0 + 0.05; u < u1; u += 0.1) if (seatOk(u, v)) cells++;
    area = cells * 0.01;
  } else {
    const lo = surface.sample((u0 + u1) / 2, 0.06), hi = surface.sample((u0 + u1) / 2, 0.97);
    area = Math.abs(u1 - u0) * (lo && hi ? Math.max(0.2, Math.hypot(hi.p[0] - lo.p[0], hi.p[1] - lo.p[1], hi.p[2] - lo.p[2])) : 0.6);
  }
  // a fitted cover carries a few tufts of its own cut flaps; a draped net its bunches and boughs
  const perM2 = (top ? 4.4 : 4.9) * cfg.density * (top ? (panel.garnishDensity ?? 1) : 1) * (cfg.style === 'leafy' ? 1 : 0.55);
  // drapes take more of their bunches high, under the top cord, and along the hem; a fleet field net (fieldClearanceM)
  // spreads them down the drape, clear of the turret's swing over its top
  const bias = top ? undefined : cfg.fieldClearanceM !== undefined ? (r: () => number): [number, number] => {
    const k = r();
    return [r(), k < 0.3 ? 0.04 + r() * 0.18 : 0.24 + r() * 0.6];
  } : (r: () => number): [number, number] => {
    const k = r();
    return [r(), k < 0.32 ? 0.04 + r() * 0.16 : 0.32 + Math.pow(r(), 0.7) * 0.66];
  };
  const clothAt = clothDistance(surface.geometry);
  const clumps: Array<GarnishClump & { tent?: boolean }> = placeGarnishClumps(rng, cfg, [u0, u1, v0, v1], seatOk, area * perM2, bias);
  // the sticks and boughs the crew pushed under a deck net stand out of their humps
  if (top && pal.boughs > 0) for (const t of (surface as TopCloth).tents ?? []) clumps.push({ u: t.x, v: t.z, size: 3 + Math.floor(t.h * 20), tent: true });
  const fitted = cfg.style !== 'leafy';
  for (const clump of clumps) {
    // a fitted cover's tufts are its own cut flaps lying on it (wave 253: "dark leaf shards stick straight out")
    const bough = fitted ? false : clump.tent ? true : rng() < (cfg.boughShare ?? pal.boughs);
    if (!surface.sample(clump.u, clump.v)) continue;
    // the tuft's own colour: a strip bunch shares one cut cloth, a bough one cutting
    const tone = pickStripTone(pal, rng);
    const boughBase = clumpTint(cfg, rng);
    const size = bough ? clump.size : Math.max(2, Math.min(5, clump.size));
    const spin0 = rng() * Math.PI * 2;
    const fan = size <= 2 ? 0.5 + rng() * 0.4 : 1.0 + rng() * 0.9;
    const edgeInfo = top && surface.edge ? surface.edge(clump.u, clump.v) : null;
    const nearEdge = edgeInfo !== null && edgeInfo.d < 0.24;
    for (let k = 0; k < size; k++) {
      const share = size > 1 ? k / (size - 1) - 0.5 : 0;
      // every draw of this card happens here, before any fit
      const jr = rng() * 0.05, ja = rng() * Math.PI * 2;
      const sway = share * fan + (rng() - 0.5) * 0.4;
      const standOut = clump.tent ? 0.75 + rng() * 0.5 : bough ? 0.32 + rng() * 0.5 : 0.06 + rng() * 0.2;
      const lenK = bough ? 0.7 + rng() * 0.75 : 0.75 + rng() * 0.6;
      const value = 0.82 + rng() * 0.3;
      const bend = bough ? 0.03 + rng() * 0.06 : 0.12 + rng() * 0.16;
      const fold = bough ? 0.18 + rng() * 0.18 : 0.05 + rng() * 0.08;
      const tileK = rng();
      const roll = (rng() - 0.5) * 0.6;
      const tile = bough ? GARNISH_BOUGH_TILES[tileK < 0.5 ? 0 : 1] : GARNISH_STRIP_TILES[tileK < 0.5 ? 0 : 1];
      // wave 256 on the PT-91: "flat yellow-green sprite clusters that read as popcorn or cauliflower rather than cut
      // branches": a bough is a cut branch, long and narrow, its stem tucked under the net
      const base = (cfg.leafScale ?? 1) * (bough ? 0.56 : fitted ? 0.24 : 0.34);
      let length = base * lenK;
      const width = length * (bough ? 0.6 : 0.62);
      // a fitted cover's flaps take its mid-tones (their atlas is painted dark: "dark clover decals", wave 253)
      const tint: [number, number, number] = fitted ? [value * 1.32, value * 1.3, value * 1.22]
        : bough ? [boughBase[0] * pal.boughTint[0] * value, boughBase[1] * pal.boughTint[1] * value, boughBase[2] * pal.boughTint[2] * value]
          : stripTint(tone, value);
      const su = clump.u + Math.cos(ja) * jr, sv = clump.v + (top ? Math.sin(ja) * jr : Math.sin(ja) * jr * 0.4);
      if (!seatOk(su, sv)) continue;
      const seat = surface.sample(su, sv);
      if (!seat || clothAt(seat.p) > 0.006) continue;
      const nn = seat.n;
      const stem: [number, number, number] = [seat.p[0] - nn[0] * 0.003, seat.p[1] - nn[1] * 0.003, seat.p[2] - nn[2] * 0.003];
      // directions in the cloth's plane: down a drape; on a deck toward its edge near one, else aft and outboard
      let dir: [number, number, number];
      if (top) {
        const h = Math.atan2(-1, 0.55 * Math.sign(stem[0] || 1)) + (spin0 - Math.PI) * 0.3;
        const want = nearEdge && edgeInfo ? [edgeInfo.nx, 0, edgeInfo.nz] : [Math.cos(h), 0, Math.sin(h)];
        const d = want[0] * nn[0] + want[1] * nn[1] + want[2] * nn[2];
        dir = norm3([want[0] - nn[0] * d, want[1] - nn[1] * d, want[2] - nn[2] * d]);
      } else {
        dir = norm3([nn[0] * nn[1], -1 + nn[1] * nn[1], nn[2] * nn[1]]);
        // a bough tucked under the top cord stands up past the roof line (it breaks the outline); others hang
        if (bough && clump.v > 0.78) dir = [-dir[0], -dir[1], -dir[2]];
      }
      const side = norm3([nn[1] * dir[2] - nn[2] * dir[1], nn[2] * dir[0] - nn[0] * dir[2], nn[0] * dir[1] - nn[1] * dir[0]]);
      let placed: FoliageCard | null = null;
      for (const scale of [1, 0.78, 0.58]) {
        for (const tilt of [standOut, standOut * 0.5]) {
          const c = Math.cos(sway), sn = Math.sin(sway), ct = Math.cos(tilt), st = Math.sin(tilt);
          const inPlane = [dir[0] * c + side[0] * sn, dir[1] * c + side[1] * sn, dir[2] * c + side[2] * sn];
          let axis = norm3([inPlane[0] * ct + nn[0] * st, inPlane[1] * ct + nn[1] * st, inPlane[2] * ct + nn[2] * st]);
          // over a deck under the turret's sweep a tuft lies back toward the net
          if (top && axis[1] * length * scale > riseMax) {
            const lim = THREE.MathUtils.clamp(riseMax / (length * scale), 0.02, 1);
            axis = norm3([inPlane[0] * Math.sqrt(1 - lim * lim), lim, inPlane[2] * Math.sqrt(1 - lim * lim)]);
          }
          // a strip spilling over a deck's edge droops down over it
          const droop = top && nearEdge && !bough ? 0.35 + rng() * 0.25 : bend;
          const face = faceFor(axis, [nn[0] * Math.cos(roll) + side[0] * Math.sin(roll), nn[1] * Math.cos(roll) + side[1] * Math.sin(roll), nn[2] * Math.cos(roll) + side[2] * Math.sin(roll)]);
          // the card's root row (5 % of its length behind the stem) lies on the cloth, 3 mm tucked in
          const len = length * scale;
          const root: [number, number, number] = [stem[0] + axis[0] * 0.05 * len, stem[1] + axis[1] * 0.05 * len, stem[2] + axis[2] * 0.05 * len];
          const card: FoliageCard = { stem: root, axis, face, out: nn, length: len, width: width * scale, tile, bend: droop, tint, fold };
          const ok = foliageCardPoints(card).every((p) => Math.abs(p[0]) <= ctx.maxHalfWidth && p[1] >= ctx.hemFloor - 0.04 && surface.cardOk(p))
            && (!ctx.cardClear || ctx.cardClear(card));
          if (ok) { placed = card; break; }
        }
        if (placed) break;
      }
      if (placed) out.push(ctx.q ? placed : { ...placed, fold: 0 });
    }
  }
}


// ---------------------------------------------------------------------------------------------------------------
// The fleet field garnish (the netting lane's fix round, 2026-10-11). Waves 391a and 391c on the r2 field nets: "a thin
// layer of flat pale slivers, like paper or wood shavings, pasted onto plates, plus a few flat lime leaf cards. No net,
// no sag between supports, nothing breaking the outline, almost no colour variety, and almost no shadow cast"; the
// coordinator: "solid clumps of cut branches with burlap and scrim tied into the net, in varied greens and browns,
// casting shadow". A crew stuffs whole cut branches into a field net: each tuck point carries a clump of boughs, each a
// cut branch of its own green or brown, lit by its own face, with a bunch or two of hessian and scrim knotted in at its
// foot and between the clumps. Every card is fitted to the working vehicle as before (its clearances, the openings'
// margins, the certified half-width, the hem floor): a bough that meets a clearance is laid lower, turned and shortened
// before it is given up. Only suits with fieldClearanceM take it.
//
// netting-proper (2026-10-13; the owner on the fix round's clumps: "make sure roof ghillie and leaves aren't as
// ridiculously placed like peacock feathers, make them more proper"): the fix round stood each clump's boughs out of the
// net in every direction, 17 to 62 degrees off it and up to 55 cm over a turret roof (a rosette on a roof or deck, a fan
// jutting from a drape, boughs at a drape's top cord standing up past the roof line). Real field camouflage lies on the
// vehicle: the crew lays its boughs along the net and tucks their stems under it. On a roof or deck a clump's boughs now
// lie side by side, their stems staggered across the clump, all one way: along the hull's axis where the net is level,
// down its fall line where it slopes (a glacis, a sloped turret face); each follows the net from stem to tip a few
// centimetres over it, its face on the net's, no point more than FIELD_TOP_LIFT_M over the net (a panel's own
// garnishRiseM where that is lower), and past the net's edge it droops over the edge. On a drape the boughs hang down the
// net's fall line, a little off it, drooping at the tip. The clump counts and sizes are the fix round's.
//
// netting-proper round 2 (2026-10-13; three critics on the Merkava Mk 4B: "the plume is gone, but nothing replaced it ...
// a low draped net with flat foliage is needed across the turret roof and bustle", and "a large dark fan of long blades
// spreads out sideways from the turret's side"): laid flat, the fix round's clumps covered a third less of a roof than
// they had standing (the Mk 4B's turret net 39 % -> 26 %, its full-length boughs mostly refused where they crossed a gap
// in the net and only their half-length fallbacks laid). A crew laying boughs flat lays more of them, side by side, until
// the roof is covered: a roof or deck takes FIELD_CLUMPS_TOP clumps a square metre, and a bough lies across a gap in its
// net on the armour beneath (a torn cell, a step the net was not laid down) as it lies on the net; where the net under it
// is lumpy (a basket's load) it is laid shorter or turned until its face lies on it. Nor are boughs bunched into one
// point each turned its own way (a clump whose cards' own stems found no cloth stacked them all on its seat, and the
// turned fallbacks fanned them out of it): one card at most takes a clump's bare seat, and no three cards whose stems
// meet fan more than FIELD_FAN_SPREAD_DEG apart. The fan off the turret side was cloth hung
// in the air: a drape column with no armour under its roof net's edge was hung on its authored line, here 27 cm out from
// the sloping turret side, its hessian hanging off it; a field drape now hangs only from armour or free from its roof
// net's edge, never from nothing. And a drape's garnish hangs where the drape falls: none on a drape's roll lying level
// over a roof's edge, where it stood straight out sideways.
// ---------------------------------------------------------------------------------------------------------------

/** Per-bough tone multipliers (linear) and their shares, by theatre: deep, mid, sunlit, olive, a wilting cut, dark. */
const FIELD_BOUGH_TONES: Readonly<Record<SuitTheatre, ReadonlyArray<readonly [readonly [number, number, number], number]>>> = Object.freeze({
  woodland: [[[0.7, 0.76, 0.7], 0.28], [[0.86, 0.86, 0.8], 0.26], [[0.96, 0.86, 0.62], 0.16], [[1.22, 0.86, 0.56], 0.14],
    [[0.52, 0.58, 0.54], 0.16]],
  desert: [[[0.78, 0.8, 0.68], 0.26], [[0.95, 0.9, 0.72], 0.26], [[1.08, 0.92, 0.62], 0.2], [[1.3, 0.92, 0.6], 0.16],
    [[0.62, 0.64, 0.56], 0.12]],
  snow: [[[1, 1, 1], 1]],
});
/**
 * Clumps per square metre of garnished cloth (before the suit's density), and boughs per bough clump. 2026-10-12
 * (cam-netting; the owner: "a ton more netting and camo leaves all over", asked again on 10-12): a third more clumps
 * than the fix round's 1.45 / 1.6, which left the roofs reading as bare plate between sparse patches. netting-proper
 * round 2: a roof's or deck's 1.95 to 3.2, its clumps lying flat (the Mk 4B's turret net 26 % -> 37 % covered, main's
 * standing clumps 39 %).
 */
const FIELD_CLUMPS_TOP = 3.2;
const FIELD_CLUMPS_DRAPE = 2.1;
const FIELD_BOUGHS_PER_CLUMP = [3, 4, 4, 5, 5, 6, 6, 7] as const;
/**
 * netting-proper: the highest any point of a roof or deck card may stand over its net there (a panel's own garnishRiseM
 * where that is lower; its owner's clearances decide below that). The fix round's 0.42 m (hull) and 0.55 m (turret)
 * stood boughs up off the roofs, and it overrode every panel's authored 8 to 16 cm. netting-225 (the critics on the
 * flattened suits: "small bumps still break the eye-level roofline", low mounds on the Strv 103s, the Burlak, the
 * Ariete, the ZTZ-99A2, the KF51, the M1A3's bustle): 12 cm -> 8 cm. The boughs' fold, droop and the clump's later
 * boughs laid over its first had stacked a leaf layer up to the full 12 cm over the net across whole roofs (the roof
 * cards' highest points 7 to 15 cm over the armour at the median to the tenth worst); the roofline census
 * (.qa-dev/n225/roofline.mjs) read the garnish 5 cm or more over the vehicle's own skyline on 11 to 22 % of the
 * silhouette of the worst hulls.
 */
const FIELD_TOP_LIFT_M: Readonly<Record<GhillieOwner, number>> = Object.freeze({ hull: 0.08, turret: 0.08, gun: 0.08 });
/**
 * netting-proper: past its net's edge (or over a gap in it) a roof card rises no more than this over its stem, and it
 * spills no further than FIELD_OVERHANG_M past the net.
 */
const FIELD_EDGE_RISE_M = 0.04;
const FIELD_OVERHANG_M = 0.12;
/**
 * netting-225: past its net's edge a roof card's point lies over its owner's own armour (the owner's surface under it,
 * this far back toward the stem at most): a bough laid at a roof's edge droops onto the wall below it, never reaching out
 * into the air past the turret's or hull's outline. Where a net itself ran out past the armour (a bustle's top, a roll
 * at a wall) the fix rounds' 12 cm spill reached on: the KF51's bough 0.5 m off its bustle, its tip 34 cm over the
 * hull's deck; the Type 10's 39 cm out from the turret's flank, level as a shelf; the Challenger 2 UA's 28 cm over its
 * lower bustle net.
 */
const FIELD_SPILL_BACK_M = 0.04;
/**
 * netting-225: no point of a drape's card more than this off its cloth (the Hetman's turret-cage drapes and the M1A3's
 * bustle drapes stood boughs 10 to 28 cm out sideways from the cloth, the Merkava 3C's rear drape one 0.7 m bough lying
 * level 22 cm off it: sheaves out of the turret's flank at eye level).
 */
const FIELD_DRAPE_OFF_M = 0.08;
/**
 * netting-proper: the steepest a roof card's spine may fall (sine, about 37 degrees) or rise (30 degrees) from its stem.
 * Where the net falls away more steeply (a roof's edge rolling down, the cloth hung over a gap) a card cannot follow it:
 * it is laid the other way, shorter, or left out, never stood steeply on the roof.
 */
const FIELD_SPINE_FALL = 0.6;
const FIELD_SPINE_RISE = 0.5;
/** netting-proper: a net more than this under a roof card's stem is not the net it lies on (a deck below a roof's edge). */
const FIELD_OWN_NET_M = 0.25;

/**
 * netting-proper: the highest point of these nets (owner-local, as laid: their clearances' cuts are gaps) under a plan
 * point and at most 10 cm over y, else null; their triangles kept by 10 cm plan cells.
 */
function netHeightRaster(geometries: readonly THREE.BufferGeometry[]): (x: number, y: number, z: number) => number | null {
  const C = 0.1, cells = new Map<number, number[]>(), tris: number[] = [];
  const key = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
  for (const g of geometries) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const at = tris.length / 9;
      for (let k = 0; k < 3; k++) tris.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      const x0 = Math.min(pos.getX(t), pos.getX(t + 1), pos.getX(t + 2)), x1 = Math.max(pos.getX(t), pos.getX(t + 1), pos.getX(t + 2));
      const z0 = Math.min(pos.getZ(t), pos.getZ(t + 1), pos.getZ(t + 2)), z1 = Math.max(pos.getZ(t), pos.getZ(t + 1), pos.getZ(t + 2));
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
        const list = cells.get(key(i, j));
        if (list) list.push(at); else cells.set(key(i, j), [at]);
      }
    }
  }
  return (x, y, z) => {
    let best: number | null = null;
    for (const t of cells.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
      const o = t * 9;
      const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
      const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const h = l1 * ay + l2 * by + l3 * cy;
      if (h <= y + 0.1 && (best === null || h > best)) best = h;
    }
    return best;
  };
}
/**
 * netting-proper: the incline (sine of the net's slope at the seat) over which a roof clump turns from the hull's axis
 * (level) to the net's fall line (about 10 to 20 degrees).
 */
const FIELD_FALL_SIN: readonly [number, number] = [0.17, 0.34];
/** The height over the plate at which a field net probes for the main gun's depression path (a refusal there keeps the
 * net flat, at the round-5 laid net's 1.2 cm). */
const FIELD_GUN_PROBE_M = 0.09;
/** How far under its drape's hem a field card may hang. */
const FIELD_HEM_DROP_M = 0.04;
/**
 * netting-proper round 2: a drape's cloth whose normal stands within about 53 degrees of vertical (its roll lying over a
 * roof's edge, its top lying on a deck) carries none of the drape's garnish: there the drape's fall line runs out level,
 * and its boughs stood straight out sideways off the vehicle (the Mk 4B's bustle drape, seven boughs 0.3 to 0.56 m long).
 * The roof's own garnish covers what lies level.
 */
const FIELD_DRAPE_LEVEL_N = 0.6;
/** netting-proper round 2: a drape's card never points up past this (the sine of its axis over level). */
const FIELD_DRAPE_RISE = 0.05;
/**
 * netting-proper round 2: a roof card point over a gap in its net (net on both sides of it within FIELD_GAP_REACH_M) may
 * lie on the armour there when that armour lies no more than FIELD_GAP_DIP_M under the net round the gap.
 */
const FIELD_GAP_REACH_M = 0.15;
const FIELD_GAP_DIP_M = 0.05;
/** netting-proper round 2: the most a roof card's face may tilt off the net under its footprint (degrees). */
const FIELD_FACE_TILT_DEG = 24;
/** netting-proper round 2: roof cards whose stems lie this close (m) never fan more than FIELD_FAN_SPREAD_DEG apart. */
const FIELD_FAN_STEM_M = 0.035;
const FIELD_FAN_SPREAD_DEG = 36;
/** How far under its own net a field card may pass (its foot and edges tucked under the net's folds). */
const FIELD_UNDER_NET_M = 0.08;

function pickWeighted<T>(rows: ReadonlyArray<readonly [T, number]>, rng: () => number): T {
  let r = rng(), acc = 0;
  for (const [v, w] of rows) { acc += w; if (r < acc) return v; }
  return rows[rows.length - 1][0];
}

interface FieldTuftContext extends TuftContext {
  readonly theatre: SuitTheatre;
  readonly owner: GhillieOwner;
  /** A turret's: the lowest a card point may reach at turret-local (x, z), over the hull's top under the traverse. */
  readonly floorAt?: (x: number, z: number) => number;
  /** The suit's cap (SuitCap) for an owner-local point. */
  readonly envOk?: (p: readonly number[]) => boolean;
  /** Plan squares no part of a card may cross (FieldClearance.keepColumns). */
  readonly columns?: ReadonlyArray<readonly [number, number, number, number]>;
  /** A field roof cage's tubes and hinge barrels (owner frame) no card face may pass through (ghillieSuit.selftest). */
  readonly tubes?: readonly CageMember[];
  /**
   * netting-proper: the owner's roof and deck nets as laid (netHeightRaster): the highest net point under owner-local
   * (x, z) at most 10 cm over y, else null.
   */
  readonly roofUnder?: (x: number, y: number, z: number) => number | null;
  /**
   * netting-proper round 2: the owner's armour under a plan point (its probe): the height of the first surface at or
   * below y + 5 mm when that surface faces up, else null (nothing under it, or the point inside a solid).
   */
  readonly armourUnder?: (x: number, y: number, z: number) => number | null;
  /**
   * netting-225: whether the owner's armour lies anywhere under a point (a surface at or below y + 5 mm, either way it
   * faces: a builder's winding is no guide; its running gear aside).
   */
  readonly overArmour?: (x: number, y: number, z: number) => boolean;
  /**
   * netting-proper round 2: the owner's roof cards laid so far, over all its roof and deck nets (where two nets meet,
   * either's clumps may reach the same point): each card's tuck point and plan heading.
   */
  readonly laidStems?: Array<readonly [number, number, number, number]>;
}

/** The closest distance between the segment u-v and a cage member's axis. */
function segmentGap(u: THREE.Vector3, v: THREE.Vector3, m: CageMember): number {
  const d1x = v.x - u.x, d1y = v.y - u.y, d1z = v.z - u.z;
  const d2x = m.b[0] - m.a[0], d2y = m.b[1] - m.a[1], d2z = m.b[2] - m.a[2];
  const rx = u.x - m.a[0], ry = u.y - m.a[1], rz = u.z - m.a[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(rx, ry, rz);
  if (a <= 1e-12) t = THREE.MathUtils.clamp(f / e, 0, 1);
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) s = THREE.MathUtils.clamp(-c / a, 0, 1);
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, denom = a * e - b * b;
      s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  return Math.hypot(u.x + d1x * s - (m.a[0] + d2x * t), u.y + d1y * s - (m.a[1] + d2y * t), u.z + d1z * s - (m.a[2] + d2z * t));
}

/**
 * netting-proper (2026-10-13; the coordinator on the fleet pass: the CV9040C's designation 3/9 clear and the Type 96B X's
 * 4/9 under the lying garnish): a field suit's garnish keeps the vehicle's national markings readable. The vehicle's own
 * release-verified marking seats (vehicleMarkingSeatRegistry.ts, registered before the build: fleetFactory.ts in the
 * browser, tankFactory.ts fleet-wide for the tools), each as the rays the marking receipts cast down its normal
 * (vehicleMarkingSeating.ts markingVisibilityReceipt: 8 m out, at offsets of 0.28 of its size) on a 5 x 5 grid over the
 * whole marking, brought into the suit owner's frame. A garnish card crossing one is laid another way or left out.
 */
const MARK_RAY_OFFSETS = [-0.5, -0.28, 0, 0.28, 0.5] as const;
const MARK_RAY_LENGTH_M = 2.5;
/** The net's cut round a marking: its footprint and this much more on every side (one net cell), out along its normal. */
const MARK_CLOTH_MARGIN_M = 0.08;
interface MarkingRays {
  readonly rays: readonly THREE.Ray[];
  readonly box: THREE.Box3;
  /** Whether cloth at an owner-local point lies in a marking's sight (its footprint widened by MARK_CLOTH_MARGIN_M). */
  clothHides(p: readonly number[]): boolean;
}
function markingRaysOf(P: GhillieBuilderPort, owner: THREE.Object3D): MarkingRays | null {
  const seats = vehicleMarkingSeats(P.spec.id);
  if (!seats?.length) return null;
  owner.updateWorldMatrix(true, false);
  const toOwner = new THREE.Matrix4().copy(owner.matrixWorld).invert();
  const rays: THREE.Ray[] = [], box = new THREE.Box3();
  const prisms: Array<{ c: THREE.Vector3; t: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3; ht: number; hb: number }> = [];
  for (const seat of seats) {
    const { kind, parent, pos, quaternion, size } = seat as { kind?: unknown; parent?: unknown; pos?: unknown; quaternion?: unknown; size?: unknown };
    if ((kind !== 'insignia' && kind !== 'designation') || !Array.isArray(pos) || pos.length !== 3 || !Array.isArray(quaternion)
      || quaternion.length !== 4 || typeof size !== 'number') continue;
    const group = parent === 'turret' ? P.turretG : P.hullG;
    group.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4().multiplyMatrices(toOwner, group.matrixWorld), lin = new THREE.Matrix3().setFromMatrix4(m);
    const q = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    const c = new THREE.Vector3(pos[0], pos[1], pos[2]).applyMatrix4(m);
    const t = new THREE.Vector3(1, 0, 0).applyQuaternion(q).applyMatrix3(lin).multiplyScalar(size);
    const b = new THREE.Vector3(0, 1, 0).applyQuaternion(q).applyMatrix3(lin).multiplyScalar(size);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).applyMatrix3(lin).normalize();
    const tl = t.length(), bl = b.length();
    prisms.push({ c, t: t.clone().divideScalar(tl), b: b.clone().divideScalar(bl), n, ht: tl / 2 + MARK_CLOTH_MARGIN_M, hb: bl / 2 + MARK_CLOTH_MARGIN_M });
    for (const u of MARK_RAY_OFFSETS) for (const v of MARK_RAY_OFFSETS) {
      const foot = c.clone().addScaledVector(t, u).addScaledVector(b, v);
      const origin = foot.clone().addScaledVector(n, MARK_RAY_LENGTH_M);
      rays.push(new THREE.Ray(origin, n.clone().negate()));
      box.expandByPoint(foot).expandByPoint(origin);
    }
  }
  if (!rays.length) return null;
  return {
    rays, box: box.expandByScalar(0.02),
    clothHides: (p) => prisms.some(({ c, t, b, n, ht, hb }) => {
      const dx = p[0] - c.x, dy = p[1] - c.y, dz = p[2] - c.z, w = dx * n.x + dy * n.y + dz * n.z;
      return w > -0.01 && w < MARK_RAY_LENGTH_M && Math.abs(dx * t.x + dy * t.y + dz * t.z) <= ht && Math.abs(dx * b.x + dy * b.y + dz * b.z) <= hb;
    }),
  };
}

/** Whether a card's face (its eight triangles, folded or flat) crosses a marking's sight rays (above the paint). */
function cardHidesMarking(card: FoliageCard, marks: MarkingRays): boolean {
  const g = foliageCardPoints(card);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of g) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z1 = Math.max(z1, p[2]); }
  if (x1 < marks.box.min.x || x0 > marks.box.max.x || y1 < marks.box.min.y || y0 > marks.box.max.y || z1 < marks.box.min.z || z0 > marks.box.max.z) return false;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), hit = new THREE.Vector3();
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const a = g[r * 3 + c], b = g[r * 3 + c + 1], d = g[(r + 1) * 3 + c], e = g[(r + 1) * 3 + c + 1];
    for (const [p, q, w] of [[a, b, e], [a, e, d]] as const) {
      A.set(p[0], p[1], p[2]); B.set(q[0], q[1], q[2]); C.set(w[0], w[1], w[2]);
      // the ray runs from its origin down to 2 cm under the paint (a card tucked under the paint's own plate is no cover)
      for (const ray of marks.rays) if (ray.intersectTriangle(A, B, C, false, hit) && hit.distanceTo(ray.origin) <= MARK_RAY_LENGTH_M + 0.02) return true;
    }
  }
  return false;
}

/** Whether a card's face (its eight triangles, folded or flat) passes through a cage member (a tube of radius r). */
function cardCrossesTube(card: FoliageCard, tubes: readonly CageMember[]): boolean {
  const g = foliageCardPoints(card);
  const tris: Array<[readonly number[], readonly number[], readonly number[]]> = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const a = g[r * 3 + c], b = g[r * 3 + c + 1], d = g[(r + 1) * 3 + c], e = g[(r + 1) * 3 + c + 1];
    tris.push([a, b, e], [a, e, d]);
  }
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), O = new THREE.Vector3(), D = new THREE.Vector3(), hit = new THREE.Vector3();
  const ray = new THREE.Ray();
  for (const m of tubes) {
    O.set(m.a[0], m.a[1], m.a[2]);
    D.set(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]);
    const len = D.length();
    if (len < 1e-6) continue;
    D.divideScalar(len);
    ray.set(O, D);
    for (const [p, q, w] of tris) {
      A.set(p[0], p[1], p[2]); B.set(q[0], q[1], q[2]); C.set(w[0], w[1], w[2]);
      if (ray.intersectTriangle(A, B, C, false, hit) && hit.distanceTo(O) <= len) return true;
      // an edge within the tube's radius of its axis anywhere along both (a card lying against the tube passes into it)
      for (const [u, v] of [[A, B], [B, C], [C, A]] as const) if (segmentGap(u, v, m) < m.r + 0.004) return true;
    }
  }
  return false;
}

function addFieldTufts(out: FoliageCardBuffer, surface: ClothSurface, ctx: FieldTuftContext, seedBase: number): void {
  const { cfg, pal, theatre } = ctx;
  const rng = garnishStream(seedBase ^ 0x2f1e1d);
  const [u0, u1, v0, v1] = surface.domain;
  const panel = surface.panel as TopPanel;
  const top = surface.kind === 'top';
  const laidNet = top ? surface as TopCloth : null;
  // netting-pl: the suit's garnish budget (GhillieConfig.garnishBudget): fewer, broader cards a clump; fewer at LOW
  const thin = THREE.MathUtils.clamp(cfg.garnishBudget?.clumpCards ?? 1, 0.3, 1);
  const lowKeep = ctx.q ? 1 : THREE.MathUtils.clamp(cfg.garnishBudget?.lowShare ?? 1, 0, 1);
  const grow = Math.pow(thin, -0.4), widen = Math.pow(thin, -0.6);
  const margin = top ? (panel.garnishOpeningMarginM ?? 0.09) : 0.06;
  const band = top ? panel.garnishEdgeBandM : undefined;
  // netting-proper: how high over its net any point of a roof or deck card may stand (the panel's own rise when lower)
  const liftCap = top ? Math.min(panel.garnishRiseM ?? Infinity, FIELD_TOP_LIFT_M[ctx.owner]) : Infinity;
  const seatOk = (u: number, v: number): boolean => surface.allowed(u, v, margin)
    && (band === undefined || !surface.edge || surface.edge(u, v).d <= band);
  let area: number;
  if (top) {
    let cells = 0;
    for (let v = v0 + 0.05; v < v1; v += 0.1) for (let u = u0 + 0.05; u < u1; u += 0.1) if (seatOk(u, v)) cells++;
    area = cells * 0.01;
  } else {
    const lo = surface.sample((u0 + u1) / 2, 0.06), hi = surface.sample((u0 + u1) / 2, 0.97);
    area = Math.abs(u1 - u0) * (lo && hi ? Math.max(0.2, Math.hypot(hi.p[0] - lo.p[0], hi.p[1] - lo.p[1], hi.p[2] - lo.p[2])) : 0.6);
  }
  const want = area * (top ? FIELD_CLUMPS_TOP : FIELD_CLUMPS_DRAPE) * cfg.density * (top ? (panel.garnishDensity ?? 1) : 1);
  const clothAt = clothDistance(surface.geometry);
  // netting-225: a drape's card hugs its cloth (FIELD_DRAPE_OFF_M), its face's nine points measured to the cloth round them
  const clothNear = top ? null : clothWithin(surface.geometry, FIELD_DRAPE_OFF_M);
  // tuck points: a seeded point process under the crew's stuffing field, 30-55 cm apart (no lattice)
  const fa = 0.7 + rng() * 1.3, fb = 0.7 + rng() * 1.3, fc = 1.1 + rng() * 1.6, fd = 0.9 + rng() * 1.4;
  const pa = rng() * Math.PI * 2, pb = rng() * Math.PI * 2;
  const stuffing = (u: number, v: number): number => 0.5 + 0.5 * Math.sin(u * fa + v * fb + pa) * Math.cos(u * fc - v * fd + pb);
  const spanU = u1 - u0, spanV = v1 - v0;
  // on a drape v is the share of its height (0 hem .. 1 top): spacing is measured in metres along it
  const vScale = top ? 1 : Math.max(0.3, area / Math.max(0.2, Math.abs(spanU)));
  const seats: Array<{ u: number; v: number; r: number }> = [];
  // the fix round: a tuck point only where a bough can stand (5 cm off the cloth passes the card rule): the clumps a
  // swept deck or a sight's view refuses are tied in where garnish may stand, instead of being lost
  const stands = (u: number, v: number): boolean => {
    const at = surface.sample(u, v);
    return !!at && surface.cardOk([at.p[0] + at.n[0] * 0.05, at.p[1] + at.n[1] * 0.05, at.p[2] + at.n[2] * 0.05]);
  };
  for (let attempt = 0; attempt < 60 + want * 60 && seats.length < want; attempt++) {
    const u = u0 + rng() * spanU, v = v0 + (top ? rng() : 0.04 + rng() * 0.93) * spanV;
    const r = 0.15 + rng() * 0.12;
    const accept = rng();
    if (!seatOk(u, v)) continue;
    if (accept > 0.25 + 0.75 * Math.pow(stuffing(u, v), 1.3)) continue;
    if (seats.some((c) => Math.hypot(c.u - u, (c.v - v) * vScale) < c.r + r)) continue;
    if (!stands(u, v)) continue;
    seats.push({ u, v, r });
  }
  // the sticks pushed under a roof net hold up its humps: the biggest clumps are laid over them
  if (top) for (const t of (surface as TopCloth).tents ?? []) seats.push({ u: t.x, v: t.z, r: 0.3 });
  const boughShare = Math.max(cfg.boughShare ?? 0, pal.boughs);
  const down: [number, number, number] = [0, -1, 0];
  // a top's garnish ceiling, sampled on a 6 cm raster as the cards ask for it (the highest a point may stand over the net
  // there and pass every point clearance): it prunes the candidates, and only a card that passes it is checked point by
  // point (and densely for the thin lines). A cell outside the net puts no bound on a card (the exact check does).
  const CEIL_CELL_M = 0.06, CEIL_RISES = [0.6, 0.42, 0.28, 0.18, 0.1, 0.05, 0.02, 0, -0.03];
  const cNX = top ? Math.max(1, Math.ceil(spanU / CEIL_CELL_M)) : 0, cNZ = top ? Math.max(1, Math.ceil(spanV / CEIL_CELL_M)) : 0;
  const ceilRise = new Float32Array(cNX * cNZ).fill(NaN), ceilNet = new Float32Array(cNX * cNZ);
  const ceilingOk = (p: readonly number[]): boolean => {
    if (!top) return true;
    const i = Math.floor((p[0] - u0) / CEIL_CELL_M), j = Math.floor((p[2] - v0) / CEIL_CELL_M);
    if (i < 0 || j < 0 || i >= cNX || j >= cNZ) return true;
    const k = j * cNX + i;
    if (Number.isNaN(ceilRise[k])) {
      const cx = u0 + (i + 0.5) * CEIL_CELL_M, cz = v0 + (j + 0.5) * CEIL_CELL_M, h = (surface as TopCloth).heightAt(cx, cz);
      ceilNet[k] = h ?? 0;
      ceilRise[k] = h === null ? Infinity : -1;
      if (h !== null) for (const r of CEIL_RISES) if (surface.cardOk([cx, h + r, cz])) { ceilRise[k] = r; break; }
    }
    return p[1] - ceilNet[k] <= ceilRise[k] + 0.015;
  };
  // netting-proper: the owner's roof and deck net as laid under a plan point, the highest at most 10 cm over `y` and no
  // more than FIELD_OWN_NET_M under the card's stem (a deck far below a roof's edge is not the net a card lies on), else
  // null; without the owner's raster (never for a field net), this carrier's own height
  const netUnder = (x: number, y: number, z: number, stemY: number): number | null => {
    const h = ctx.roofUnder ? ctx.roofUnder(x, y, z) : laidNet?.heightAt(x, z) ?? null;
    return h !== null && stemY - h < FIELD_OWN_NET_M ? h : null;
  };
  // netting-proper round 2: a gap in the net at a plan point: the net on both sides of it along some line within
  // FIELD_GAP_REACH_M (a roof's edge has net on one side only), and the lowest of the net found round it; else null
  const netBeside = (x: number, y: number, z: number, stemY: number): number | null => {
    let low: number | null = null, across = false;
    for (const [dx, dz] of [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71]]) {
      const r = FIELD_GAP_REACH_M;
      const h1 = netUnder(x + dx * r, y + FIELD_OWN_NET_M, z + dz * r, stemY), h2 = netUnder(x - dx * r, y + FIELD_OWN_NET_M, z - dz * r, stemY);
      for (const h of [h1, h2]) if (h !== null && (low === null || h < low)) low = h;
      if (h1 !== null && h2 !== null) across = true;
    }
    return across ? low : null;
  };
  // a roof or deck card lies on its net: no point of it more than liftCap over the net under it (nor deeper under one than
  // FIELD_UNDER_NET_M); over a gap in the net it lies on the armour there the same way (round 2); past the net's edge
  // (nothing under it on the stem's level) none higher than FIELD_EDGE_RISE_M over its stem, and none further than
  // FIELD_OVERHANG_M past the net back toward its stem (a bough's tip spills over a roof's edge; it never reaches out over
  // the drape as a shelf)
  const lyingOk = (pts: readonly (readonly number[])[], stem: readonly number[]): boolean => {
    for (const p of pts) {
      const h = netUnder(p[0], p[1], p[2], stem[1]);
      if (h !== null) {
        // and none deeper under a net than its folds take it
        if (p[1] - h > liftCap || h - p[1] > FIELD_UNDER_NET_M) return false;
        continue;
      }
      // netting-proper round 2: across a gap in its net (a torn cell, a step the net was not laid down, a cut) a bough
      // lies on the armour beneath, never more than liftCap over it nor into it, where that armour carries on the net's
      // surface round the gap (within FIELD_GAP_DIP_M under the net beside it: never down into a bin, a basket's load or
      // a recess), and no higher over its stem than liftCap (it never climbs a glacis across the gap); the openings
      // round lids and sights stay the dense check's (surface.holeAt) and the views the clearance's
      const a = ctx.armourUnder?.(p[0], p[1], p[2]) ?? null;
      if (a !== null && p[1] - a <= liftCap && p[1] - stem[1] <= liftCap) {
        const beside = netBeside(p[0], p[1], p[2], stem[1]);
        if (beside !== null && a >= beside - FIELD_GAP_DIP_M) continue;
      }
      if (p[1] - stem[1] > FIELD_EDGE_RISE_M) return false;
      const dx = p[0] - stem[0], dz = p[2] - stem[2], d = Math.hypot(dx, dz);
      const back = d > 1e-6 ? Math.min(d, FIELD_OVERHANG_M) / d : 0;
      if (netUnder(p[0] - dx * back, p[1], p[2] - dz * back, stem[1]) === null) return false;
      // netting-225: and it hangs over its owner's own armour (a few centimetres past a wall's top edge at most)
      if (ctx.overArmour) {
        const near = d > 1e-6 ? Math.min(d, FIELD_SPILL_BACK_M) / d : 0;
        if (!ctx.overArmour(p[0], p[1], p[2]) && !ctx.overArmour(p[0] - dx * near, p[1], p[2] - dz * near)) return false;
      }
    }
    return true;
  };
  // netting-proper: a roof card's spine laid along its net from its stem: the axis's rise and the tip's droop that put its
  // middle and tip rows h1 and h2 over the net under them (vehicleFoliage.ts cardRows: the rows stand 0, 50 and 100 % of
  // the length along the axis from the stem, the droop growing with the square of the share). Over no net the row droops
  // instead (a bough laid off a roof's edge hangs over it).
  const laySpine = (stem: readonly number[], hx: number, hz: number, len: number, h1: number, h2: number, rise0: number):
    { axis: [number, number, number]; bend: number } => {
    let s = THREE.MathUtils.clamp(rise0, -FIELD_SPINE_FALL, FIELD_SPINE_RISE), b = 0;
    for (let it = 0; it < 3; it++) {
      const c = Math.sqrt(1 - s * s);
      const mid = netUnder(stem[0] + hx * c * 0.5 * len, stem[1] + FIELD_OWN_NET_M, stem[2] + hz * c * 0.5 * len, stem[1]);
      const tip = netUnder(stem[0] + hx * c * len, stem[1] + FIELD_OWN_NET_M, stem[2] + hz * c * len, stem[1]);
      const d1 = mid !== null ? mid + h1 - stem[1] : Math.min(h1, 0) - 0.08 * len;
      const d2 = tip !== null ? tip + h2 - stem[1] : Math.min(d1, 0) - 0.2 * len;
      s = THREE.MathUtils.clamp((4 * d1 - d2) / len, -FIELD_SPINE_FALL, FIELD_SPINE_RISE);
      // the droop never takes the tip steeper than 1 in 1 down (45 degrees) or 1 in 2 up
      b = THREE.MathUtils.clamp(s * len - d2, Math.max(-0.06, (s - FIELD_SPINE_RISE) / 2) * len, Math.min(0.3, (s + 1) / 2) * len);
    }
    const c = Math.sqrt(1 - s * s);
    return { axis: [hx * c, s, hz * c], bend: b / len };
  };
  // netting-proper: a roof or deck net's broad slope at a seat: the least-squares plane through this net (its own cloth as
  // laid) on a 5 x 5 raster 12 cm either side of the seat, fitted again without the points more than 3 cm off it (the
  // cloth's own creases, the rolls at its openings and the dips a clearance pressed into it are narrower; past the net's
  // edge the raster has no point). A card is laid on that, not rolled into a crease.
  const BROAD_M = 0.12;
  const ownUnder = laidNet ? netHeightRaster([surface.geometry]) : null;
  const broadNormal = (p: readonly number[], fine: readonly number[]): [number, number, number] => {
    const fallback = norm3(fine);
    if (!ownUnder) return fallback;
    const pts: Array<[number, number, number]> = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const x = i * BROAD_M / 2, z = j * BROAD_M / 2, h = ownUnder(p[0] + x, p[1] + FIELD_OWN_NET_M, p[2] + z);
      if (h !== null && Math.abs(h - p[1]) < FIELD_OWN_NET_M) pts.push([x, h - p[1], z]);
    }
    // the plane y = a x + b z + c (the 3 x 3 normal equations by Cramer's rule)
    const det3 = (a: readonly number[]): number => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6])
      + a[2] * (a[3] * a[7] - a[4] * a[6]);
    let normal = fallback, use = pts;
    for (let pass = 0; pass < 2 && use.length >= 6; pass++) {
      let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxy = 0, szy = 0, sy = 0;
      for (const [x, y, z] of use) { sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxy += x * y; szy += z * y; sy += y; }
      const m = use.length, d = det3([sxx, sxz, sx, sxz, szz, sz, sx, sz, m]);
      if (Math.abs(d) < 1e-9) break;
      const ga = det3([sxy, sxz, sx, szy, szz, sz, sy, sz, m]) / d, gb = det3([sxx, sxy, sx, sxz, szy, sz, sx, sy, m]) / d;
      const gc = det3([sxx, sxz, sxy, sxz, szz, szy, sx, sz, sy]) / d;
      normal = norm3([-ga, 1, -gb]);
      const kept = use.filter(([x, y, z]) => Math.abs(y - (ga * x + gb * z + gc)) < 0.03);
      if (kept.length === use.length) break;
      use = kept;
    }
    return normal;
  };
  // netting-proper round 2: a roof card's face lies on the net under its own footprint, within FIELD_FACE_TILT_DEG of the
  // plane through the net's heights under its 5 x 5 face points (fitted again without those more than 3 cm off it: a
  // roll at an opening, a strap), else round its stem (ghillieGarnishLie.selftest's measure). A bough laid over a lumpy
  // load or across a slope's break no longer lies tipped on edge: it is laid shorter or turned until it lies flat.
  const faceTiltCos = Math.cos(FIELD_FACE_TILT_DEG * Math.PI / 180);
  const faceLies = (pts: readonly (readonly number[])[], stem: readonly number[]): boolean => {
    const s0 = pts[1], s2 = pts[7], l = pts[3], r = pts[5];
    const face = norm3(cross3([s2[0] - s0[0], s2[1] - s0[1], s2[2] - s0[2]], [r[0] - l[0], r[1] - l[1], r[2] - l[2]]));
    const foot: Array<[number, number, number]> = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const fr = i / 2, fc = j / 2, r0 = Math.min(1, Math.floor(fr)), c0 = Math.min(1, Math.floor(fc)), u = fr - r0, w = fc - c0;
      const g = (rr: number, cc: number, q: number): number => pts[rr * 3 + cc][q];
      const at = [0, 1, 2].map((q) => (1 - u) * ((1 - w) * g(r0, c0, q) + w * g(r0, c0 + 1, q)) + u * ((1 - w) * g(r0 + 1, c0, q) + w * g(r0 + 1, c0 + 1, q)));
      const h = netUnder(at[0], at[1], at[2], stem[1]);
      if (h !== null) foot.push([at[0] - stem[0], h - stem[1], at[2] - stem[2]]);
    }
    const det3 = (a: readonly number[]): number => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6])
      + a[2] * (a[3] * a[7] - a[4] * a[6]);
    let seat: [number, number, number] | null = null, use = foot;
    for (let pass = 0; pass < 3 && use.length >= 5; pass++) {
      let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxy = 0, szy = 0, sy = 0;
      for (const [x, y, z] of use) { sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxy += x * y; szy += z * y; sy += y; }
      const m = use.length, cxx = sxx / m - (sx / m) ** 2, czz = szz / m - (sz / m) ** 2, cxz = sxz / m - (sx / m) * (sz / m);
      // a footprint spread less than 2 cm across (a line in plan) spans no plane
      const tr = cxx + czz, minor = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - (cxx * czz - cxz * cxz)));
      if (minor < 0.0004) break;
      const d = det3([sxx, sxz, sx, sxz, szz, sz, sx, sz, m]);
      if (Math.abs(d) < 1e-12) break;
      const ga = det3([sxy, sxz, sx, szy, szz, sz, sy, sz, m]) / d, gb = det3([sxx, sxy, sx, sxz, szy, sz, sx, sy, m]) / d;
      const gc = det3([sxx, sxz, sxy, sxz, szz, szy, sx, sz, sy]) / d;
      seat = norm3([-ga, 1, -gb]);
      const kept = use.filter(([x, y, z]) => Math.abs(y - (ga * x + gb * z + gc)) < 0.03);
      if (kept.length === use.length || kept.length < 5) break;
      use = kept;
    }
    const n = seat ?? broadNormal(stem, [0, 1, 0]);
    return Math.abs(face[0] * n[0] + face[1] * n[1] + face[2] * n[2]) >= faceTiltCos;
  };
  // netting-proper round 2: the roof cards laid so far (their tuck points and plan headings, over all the owner's roof
  // and deck nets): no three of them fan more than FIELD_FAN_SPREAD_DEG apart out of one point (stems within
  // FIELD_FAN_STEM_M), as a crew never stuffs a bunch of boughs into one mesh hole each turned its own way
  const laidStems = ctx.laidStems ?? [];
  const fanSpread = FIELD_FAN_SPREAD_DEG * Math.PI / 180;
  const fansOut = (pts: readonly (readonly number[])[]): boolean => {
    const s0 = pts[1], s2 = pts[7];
    const me = [s0[0], s0[1], s0[2], Math.atan2(s2[0] - s0[0], s2[2] - s0[2])] as const;
    const close = (a: readonly number[], b: readonly number[]): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < FIELD_FAN_STEM_M;
    // every bunch this card would join: round itself and round each laid card it lies beside
    for (const centre of [me, ...laidStems.filter((q) => close(q, me))]) {
      const bunch = [me, ...laidStems.filter((q) => close(q, centre))];
      if (bunch.length < 3) continue;
      // the headings' range about the centre's (at least their spread round the circle)
      let lo = 0, hi = 0;
      for (const q of bunch) {
        const d = Math.atan2(Math.sin(q[3] - centre[3]), Math.cos(q[3] - centre[3]));
        lo = Math.min(lo, d); hi = Math.max(hi, d);
      }
      if (hi - lo > fanSpread) return true;
    }
    return false;
  };
  let hemFloorHere = -Infinity;
  const tryCard = (make: (scale: number, liftK: number, turn: number) => FoliageCard | null,
    tries: ReadonlyArray<readonly [number, number, number]>, stem: readonly number[]): FoliageCard | null => {
    for (const [scale, liftK, turn] of tries) {
      const card = make(scale, liftK, turn);
      if (!card) continue;
      const pts = foliageCardPoints(card);
      // the tip row first: a card that fails mostly fails where it reaches farthest
      let quick = !top || (lyingOk(pts, stem) && faceLies(pts, stem) && !fansOut(pts));
      for (let q = pts.length - 1; q >= 0 && quick; q--) {
        const p = pts[q];
        quick = Math.abs(p[0]) <= ctx.maxHalfWidth && p[1] >= ctx.hemFloor - 0.04 && p[1] >= hemFloorHere
          && (!ctx.floorAt || p[1] >= ctx.floorAt(p[0], p[2]))
          && (!ctx.envOk || ctx.envOk(p)) && ceilingOk(p);
      }
      // a card's face crossing a kept column (its plan box over the square: a face spans between its vertices)
      if (quick && ctx.columns?.length) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
        quick = !ctx.columns.some(([a0, a1, b0, b1]) => x1 > a0 && x0 < a1 && z1 > b0 && z0 < b1);
      }
      if (!quick) continue;
      // the face itself, sampled densely, crosses no opening of its net (a hatch lid, a sight head: 391's "hatches
      // open"; profiles/easternSourceContact's Type 96 secondary hatch)
      const dense = top || surface.holeAt ? denseCardPoints(card) : null;
      const ok = pts.every((p) => surface.cardOk(p)) && (!ctx.cardClear || ctx.cardClear(card))
        && (!surface.holeAt || !dense!.some((p) => surface.holeAt!(p[0], p[2])))
        // netting-proper: and lies on its net between its rows too (a dip in the net under a long bough)
        && (!top || lyingOk(dense!, stem))
        && (!clothNear || pts.every((p) => clothNear(p)))
        && (!ctx.tubes?.length || !cardCrossesTube(card, ctx.tubes));
      if (ok) return card;
    }
    return null;
  };
  // the fallbacks: a roof bough as cut, then turned end for end (still along its line), shorter and closer to the net,
  // then turned aside (on a cluttered roof a bough still lies flat, across its line if it must); a drape's lower off the
  // net, shorter, then turned aside
  const TOP_TRIES: ReadonlyArray<readonly [number, number, number]> = [[1, 1, 0], [1, 1, Math.PI], [0.72, 1, 0], [0.72, 1, Math.PI],
    [0.72, 0.4, 0], [0.72, 0.4, Math.PI], [0.72, 1, 0.6], [0.72, 1, -0.6], [0.52, 1, 0], [0.52, 1, Math.PI], [0.52, 0.4, 0],
    [0.52, 0.4, Math.PI], [0.52, 0.4, 0.6], [0.52, 0.4, -0.6], [0.52, 0.4, Math.PI + 0.6], [0.52, 0.4, Math.PI - 0.6],
    [0.52, 0.4, 1.2], [0.52, 0.4, -1.2], [0.38, 0.4, 0], [0.38, 0.4, Math.PI], [0.38, 0.4, 1.2], [0.38, 0.4, -1.2]];
  const DRAPE_TRIES: ReadonlyArray<readonly [number, number, number]> = [[1, 1, 0], [1, 0.5, 0], [1, 0, 0], [0.72, 1, 0],
    [0.72, 0.5, 0], [0.72, 0, 0], [0.52, 1, 0], [0.52, 0.5, 0], [0.52, 0, 0], [0.72, 0.5, 0.6], [0.72, 0.5, -0.6], [0.52, 0, 0.6],
    [0.52, 0, -0.6], [0.52, 0.5, 1.2], [0.52, 0.5, -1.2], [0.38, 0, 1.2], [0.38, 0, -1.2]];
  // netting-proper: how far from straight down a drape's card may turn (along the drape at most: never up it)
  const DRAPE_TURN_MAX = 1.4;
  // a drape's outward direction in plan (its side, or the way its face looks): where it rolls level over a roof's edge,
  // its garnish hangs out over that edge
  const outward: [number, number, number] | null = surface.owner === 'side' ? [(surface.panel as SidePanel).side, 0, 0]
    : surface.owner === 'face' ? [0, 0, (() => {
      const f = surface.panel as FacePanel;
      return f.z >= 0 || (f.zAt ? f.zAt((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2) >= 0 : false) ? 1 : -1;
    })()] : null;
  // the cloth's plane at a seat: t1 down-slope (or down a drape), t2 across it, and the slope's sine
  const planeAt = (nn: readonly number[]): { t1: [number, number, number]; t2: [number, number, number]; slope: number } => {
    const dn = down[0] * nn[0] + down[1] * nn[1] + down[2] * nn[2];
    const sl = [down[0] - nn[0] * dn, down[1] - nn[1] * dn, down[2] - nn[2] * dn];
    const slope = Math.hypot(sl[0], sl[1], sl[2]);
    let level: number[] = [nn[1], -nn[0], 0];
    if (outward) {
      const on = outward[0] * nn[0] + outward[2] * nn[2];
      level = [outward[0] - nn[0] * on, -nn[1] * on, outward[2] - nn[2] * on];
    }
    // a level deck has no down-slope: any direction in its plane will do (a drape's level shoulder: outward)
    const t1 = slope < 0.15 ? norm3(level) : norm3(sl);
    const t2 = norm3([nn[1] * t1[2] - nn[2] * t1[1], nn[2] * t1[0] - nn[0] * t1[2], nn[0] * t1[1] - nn[1] * t1[0]]);
    return { t1, t2, slope };
  };
  for (const [seatIndex, seatAt] of seats.entries()) {
    const seat = surface.sample(seatAt.u, seatAt.v);
    if (!seat || clothAt(seat.p) > 0.006) continue;
    // a drape's garnish hangs no lower than 4 cm under its hem there (391a: "lime leaf clusters dangling over the road
    // wheels"); a top's has no hem
    hemFloorHere = top ? -Infinity : (surface.sample(seatAt.u, 0.02)?.p[1] ?? -Infinity) - FIELD_HEM_DROP_M;
    const nn = top ? broadNormal(seat.p, seat.n) : seat.n;
    const { t1, t2, slope } = planeAt(nn);
    // netting-proper: the clump's line. A roof or deck clump lies along the hull's axis (either way) where the net is
    // level and down its fall line where it slopes; a drape's hangs down it
    let line: [number, number, number] = t1;
    // a drape's clump: hanging down it from high on the cloth; low on it (a short skirt drape) laid along it fore or aft,
    // drooping, as a crew tucks boughs along a skirt
    const lowOnDrape = !top && seatAt.v < v0 + 0.55 * spanV;
    const yaw = (rng() - 0.5) * 0.5, flipK = rng();
    const theta0 = top ? 0 : lowOnDrape ? (flipK < 0.5 ? 1 : -1) * (1.15 + yaw * 0.6) : yaw;
    if (top) {
      const ax = norm3([-nn[0] * nn[2], -nn[1] * nn[2], 1 - nn[2] * nn[2]]);
      const w = THREE.MathUtils.smoothstep(slope, FIELD_FALL_SIN[0], FIELD_FALL_SIN[1]);
      let sign = flipK < 0.5 ? 1 : -1;
      if (w > 0 && sign * (ax[0] * t1[0] + ax[1] * t1[1] + ax[2] * t1[2]) < 0) sign = -sign;
      const l = norm3([ax[0] * sign * (1 - w) + t1[0] * w, ax[1] * sign * (1 - w) + t1[1] * w, ax[2] * sign * (1 - w) + t1[2] * w]);
      // a few degrees off the line, clump by clump (the boughs of a roof are not combed straight)
      const across = norm3([nn[1] * l[2] - nn[2] * l[1], nn[2] * l[0] - nn[0] * l[2], nn[0] * l[1] - nn[1] * l[0]]);
      line = norm3([l[0] * Math.cos(yaw) + across[0] * Math.sin(yaw), l[1] * Math.cos(yaw) + across[1] * Math.sin(yaw),
        l[2] * Math.cos(yaw) + across[2] * Math.sin(yaw)]);
    }
    const lineAcross = top ? norm3([nn[1] * line[2] - nn[2] * line[1], nn[2] * line[0] - nn[0] * line[2], nn[0] * line[1] - nn[1] * line[0]]) : t2;
    const boughs = rng() < boughShare;
    const boughBase = clumpTint(cfg, rng);
    const clumpTone = pickWeighted(FIELD_BOUGH_TONES[theatre], rng);
    const stripTone = pickStripTone(pal, rng);
    const drawn = boughs ? FIELD_BOUGHS_PER_CLUMP[Math.floor(rng() * FIELD_BOUGHS_PER_CLUMP.length)] : 3 + Math.floor(rng() * 3);
    const strips = boughs ? Math.round((rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0) * thin) : drawn;
    const n = thin < 1 ? Math.max(2, Math.round(drawn * thin)) : drawn;
    const cards = boughs ? n + strips : n;
    // netting-proper round 2: one card at most is tucked at the clump's bare seat (where a card's own stem, staggered
    // across the clump, finds no cloth): several there, each turned its own way to fit, fanned out of one point
    let seatTaken = false;
    for (let k = 0; k < cards; k++) {
      const bough = boughs && k < n;
      // every draw of this card happens here, before any fit
      const share = cards > 1 ? (k + 0.5) / cards - 0.5 : 0;
      const jt = (rng() - 0.5) * 0.7, je = rng(), jl = rng(), jv = rng(), jb = rng(), jf = rng(), jr = rng(), jw = rng();
      const ja = rng(), jo = rng(), jh = rng();
      const ownTone = rng() < 0.3 ? pickWeighted(FIELD_BOUGH_TONES[theatre], rng) : clumpTone;
      const tileK = rng();
      // netting-pl: the far tier's share of the cards (its draws made above, so the clumps after it lie as at HIGH)
      if (lowKeep < 1 && hash01(seatIndex, k, seedBase) >= lowKeep) continue;
      // netting-proper: the clump's stems staggered across its line (side by side, overlapping like shingles) and a little
      // along it; a strip knotted in among them
      const across = bough ? share * 1.8 * seatAt.r + (ja - 0.5) * 0.06 : (ja - 0.5) * 1.2 * seatAt.r;
      const along = (jo - 0.5) * seatAt.r;
      let su = seatAt.u, sv = seatAt.v;
      if (top) {
        su += lineAcross[0] * across + line[0] * along;
        sv += lineAcross[2] * across + line[2] * along;
      } else {
        su += across;
        sv += along * 0.3 / vScale;
      }
      let at: ClothPoint | null = su === seatAt.u && sv === seatAt.v ? seat : (seatOk(su, sv) ? surface.sample(su, sv) : null);
      if (!at || clothAt(at.p) > 0.006) at = seat;
      if (at === seat && seatTaken) continue;
      // netting-proper round 2: a drape's card is never tucked where the drape lies level (its roll over a roof's edge):
      // it moves to its clump's seat, and a clump seated there is left out (after its draws: the rest keep theirs)
      if (!top && Math.abs(at.n[1]) > FIELD_DRAPE_LEVEL_N) at = seat;
      if (!top && Math.abs(at.n[1]) > FIELD_DRAPE_LEVEL_N) continue;
      const an = top ? broadNormal(at.p, at.n) : at.n;
      const stem: [number, number, number] = [at.p[0] - an[0] * 0.003, at.p[1] - an[1] * 0.003, at.p[2] - an[2] * 0.003];
      // the card's own line in the cloth's plane at its stem: the clump's, a few degrees off (a strip more)
      const turn0 = bough ? jt * 0.6 : jt * 1.6;
      const lp = planeAt(an);
      const own = top ? line : lp.t1;
      const ownAcross = top ? lineAcross : lp.t2;
      const inPlane = (theta: number): [number, number, number] => {
        const d = [own[0] * Math.cos(theta) + ownAcross[0] * Math.sin(theta), own[1] * Math.cos(theta) + ownAcross[1] * Math.sin(theta),
          own[2] * Math.cos(theta) + ownAcross[2] * Math.sin(theta)];
        const dn = d[0] * an[0] + d[1] * an[1] + d[2] * an[2];
        return norm3([d[0] - an[0] * dn, d[1] - an[1] * dn, d[2] - an[2] * dn]);
      };
      // 2026-10-12 (cam-netting): a sand hull's boughs a quarter longer (the holm oak and olive sprigs read as specks
      // on sand paint at hero distance; the woodland spruce and beech boughs are broad already)
      const base = (cfg.leafScale ?? 1) * (bough ? (theatre === 'desert' ? 0.75 : 0.6) : 0.4);
      const length = base * (bough ? 0.78 + jl * 0.72 : 0.75 + jl * 0.6) * grow;
      const width = length * (bough ? 0.58 : 0.5) * (widen / grow);
      const value = bough ? 0.76 + jv * 0.26 : 0.6 + jv * 0.32;
      const tint: [number, number, number] = bough
        ? [boughBase[0] * pal.boughTint[0] * ownTone[0] * value, boughBase[1] * pal.boughTint[1] * ownTone[1] * value,
          boughBase[2] * pal.boughTint[2] * ownTone[2] * value]
        : stripTint(stripTone, value);
      const tile = bough ? GARNISH_BOUGH_TILES[tileK < 0.5 ? 0 : 1] : GARNISH_STRIP_TILES[tileK < 0.5 ? 0 : 1];
      // a shallow V along the stem (a cut branch's leaves spread to both sides of it), a drape's hanging bough a deeper one
      // netting-225: a roof bough's V shallower (0.08 to 0.2 rad: its edges 3 cm up at most), so a full-length bough lies
      // under the 8 cm lift instead of being cut shorter to fit (FIELD_TOP_LIFT_M)
      const fold = bough ? (top ? 0.08 + jf * 0.12 : 0.14 + jf * 0.18) : 0.05 + jf * 0.08;
      // the card's face on the net's: rolled a few degrees about its stem at most
      const roll = (jr - 0.5) * (top ? 0.3 : 0.5);
      // a roof card: its middle and tip rows a few centimetres over the net (the clump's later boughs a little higher,
      // laid over the first); a drape's: out of the net by a few degrees, drooping at the tip
      // netting-225: 0.8 to 2.8 cm (was 1.2 to 4.4 cm): the clump's later boughs laid over its first by half a centimetre
      const h1 = bough ? 0.008 + 0.006 * (k % 3) + jh * 0.01 : 0.006 + jh * 0.01;
      const h2 = h1 * (0.7 + je * 0.6);
      const elev = bough ? 0.05 + je * 0.17 : 0.03 + je * 0.1;
      const bend = bough ? 0.1 + jb * 0.16 : 0.22 + jb * 0.26;
      const placed = tryCard((scale, liftK, turn) => {
        const len = length * scale;
        const dirT = inPlane(top ? turn0 + turn : THREE.MathUtils.clamp(theta0 + turn0 + turn, -DRAPE_TURN_MAX, DRAPE_TURN_MAX));
        let axis: [number, number, number], droop: number;
        if (top) {
          const hl = Math.hypot(dirT[0], dirT[2]);
          if (hl < 0.2) return null;
          const lay = laySpine(stem, dirT[0] / hl, dirT[2] / hl, len, h1 * liftK, h2 * liftK, dirT[1] / hl);
          axis = norm3(lay.axis);
          droop = lay.bend;
        } else {
          const e = elev * liftK;
          axis = norm3([dirT[0] * Math.cos(e) + an[0] * Math.sin(e), dirT[1] * Math.cos(e) + an[1] * Math.sin(e),
            dirT[2] * Math.cos(e) + an[2] * Math.sin(e)]);
          // netting-proper round 2: a drape's card hangs or lies along it, never pointing up past level
          if (axis[1] > FIELD_DRAPE_RISE) return null;
          droop = liftK === 0 ? 0.03 : bend;
        }
        const side = norm3([an[1] * axis[2] - an[2] * axis[1], an[2] * axis[0] - an[0] * axis[2], an[0] * axis[1] - an[1] * axis[0]]);
        const toward = [an[0] * Math.cos(roll) + side[0] * Math.sin(roll), an[1] * Math.cos(roll) + side[1] * Math.sin(roll),
          an[2] * Math.cos(roll) + side[2] * Math.sin(roll)];
        const face = faceFor(axis, toward);
        const root: [number, number, number] = [stem[0] + axis[0] * 0.05 * len, stem[1] + axis[1] * 0.05 * len, stem[2] + axis[2] * 0.05 * len];
        // closest to the net (lift 0.4 on a roof, 0 on a drape) a card keeps less of its fold
        const foldK = liftK >= 1 ? 1 : 0.5;
        return { stem: root, axis, face, out: an, length: len, width: width * scale * (0.9 + jw * 0.2), tile,
          // LOW draws the flat four-triangle card: that card is the one checked (its edges reach out where a fold's lift)
          bend: droop, tint, fold: !ctx.q ? 0 : fold * foldK,
          volumeMix: bough ? [0.72, 0.18, 0.12] : [0.5, 0.38, 0.14] };
      }, top ? TOP_TRIES : DRAPE_TRIES, stem);
      if (placed) out.push(placed);
      if (placed && at === seat) seatTaken = true;
      if (placed && top) {
        const q = foliageCardPoints(placed);
        laidStems.push([q[1][0], q[1][1], q[1][2], Math.atan2(q[7][0] - q[1][0], q[7][2] - q[1][2])]);
      }
    }
  }
}

/**
 * The suit's cloth: a per-visual clone of the vehicle's canvas joined to its cascade registration
 * (cloneVehicleMaterial). The old plain clone lit with every cascade's sun at once (about four times the sun on a lit
 * face), which is why the suits read pale and flat in battle.
 */
function makeCloth(
  P: GhillieBuilderPort,
  configure: (material: THREE.MeshStandardMaterial) => void,
): THREE.MeshStandardMaterial {
  return cloneVehicleMaterial(P.mats.canvasCloth, (mat) => {
    mat.roughness = 1;
    mat.metalness = 0;
    mat.envMapIntensity = 0.08;
    // sealed check 2026-09-13: cloth is seen from both sides as the camera orbits
    mat.side = THREE.DoubleSide;
    configure(mat);
  });
}

/**
 * One suit's net and garnish materials, shared by its hull, turret and gun parts (2026-10-13, integ/222: each part had
 * built its own copy of the same net and of the same garnish material, the same textures and settings, so a netted
 * Merkava 3C drew 27 materials against appearanceAudit's 26). Keyed by the build's port, so a build never shares
 * with another vehicle's.
 */
const SUIT_MATERIALS = new WeakMap<GhillieBuilderPort, { net?: THREE.MeshStandardMaterial;
  leaves: Map<unknown, THREE.MeshStandardMaterial> }>();
function suitMaterialsOf(P: GhillieBuilderPort): { net?: THREE.MeshStandardMaterial; leaves: Map<unknown, THREE.MeshStandardMaterial> } {
  let mats = SUIT_MATERIALS.get(P);
  if (!mats) SUIT_MATERIALS.set(P, mats = { leaves: new Map() });
  return mats;
}

function makeNet(
  P: GhillieBuilderPort,
  cfg: GhillieConfig,
  theatre: SuitTheatre,
  cover: CoverPalette,
): THREE.MeshStandardMaterial {
  // round 5: the garnished net (leafy suits) or the cut-leaf cover in the vehicle's own scheme (multispectral suits),
  // shared per theatre or palette and seed (never disposed with a visual); the height map takes the cloth's bump slot
  // (the cloned canvas already samples one), so neither adds a shader variant
  const leafy = cfg.style === 'leafy';
  const shared = leafy ? garnishedNetTextures(theatre, cfg.netTextureSeed ?? cfg.seed, isFieldNet(cfg)) : cutLeafCoverTextures(cover, cfg.seed);
  return makeCloth(P, (m) => {
    m.color.setHex(0xffffff);
    if (shared) {
      m.map = shared.map;
      m.bumpMap = shared.bump;
      // three's bump slope is the height change per screen pixel times bumpScale: kept near the cloth's own 0.5 so the
      // cords and strips stand in relief up close without sparkling at range
      m.bumpScale = leafy ? 0.7 : 0.6;
      m.alphaTest = 0.5;
      m.transparent = false;
    }
  });
}

function addMerged(
  P: GhillieBuilderPort,
  parent: THREE.Group,
  geos: THREE.BufferGeometry[],
  mat: THREE.MeshStandardMaterial,
  name: string,
  extras: readonly (DisposableResource | null)[] = [],
): THREE.Mesh | null {
  if (!geos.length) {
    mat.dispose();
    for (const extra of extras) extra?.dispose?.();
    return null;
  }
  const geo = KIT.mergeAll(geos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  // A cut net encloses real exterior air: it is suspended dressing, outside the armor's zero-hole scan.
  mesh.userData.combatHitboxRole = 'nonArmor';
  mesh.userData.continuityRole = 'open-lattice';
  parent.add(mesh);
  P.disposables.push(geo, mat);
  for (const extra of extras) {
    if (extra) P.disposables.push(extra);
  }
  return mesh;
}

const t64HullY = (_x: number, z: number): number => {
  if (z < -2.6) return 1.43;
  if (z < 1.55) return 1.39;
  if (z < 2.55) return 1.40 - (z - 1.55) * 0.20;
  return 1.20 - (z - 2.55) * 0.22;
};
const ptHullY = (_x: number, z: number): number => {
  if (z < -2.0) return 1.61;
  if (z < 1.2) return 1.54;
  if (z < 2.4) return 1.54 - (z - 1.2) * 0.14;
  return 1.37 - (z - 2.4) * 0.17;
};
// PT-91A turret carrier surface. The old blanket used one y=0.88 plane,
// leaving up to 0.6 m of daylight over the cast shoulders and front wedge.
// This profile mirrors buildPT91Twardy's authored dome, ERAWA cheeks, flank
// bins and bustle while preserving the ghillie's small suspended air layer.
const pt91DomeProfile: readonly Point2[] = Object.freeze([
  [0.03, 0.81], [0.38, 0.80], [0.72, 0.755], [1.00, 0.64],
  [1.18, 0.46], [1.26, 0.24],
]);
const pt91DomeY = (x: number, z: number): number => {
  const r = Math.hypot(x, (z + 0.08) / 0.98);
  if (r <= pt91DomeProfile[0][0]) return pt91DomeProfile[0][1];
  for (let i = 1; i < pt91DomeProfile.length; i++) {
    const [r1, y1] = pt91DomeProfile[i];
    if (r <= r1) {
      const [r0, y0] = pt91DomeProfile[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (r - r0) / (r1 - r0));
    }
  }
  return 0.20;
};
const pt91TurretCoverY = (x: number, z: number): number => {
  const ax = Math.abs(x);
  let support = pt91DomeY(x, z);
  if (z < -1.04 && ax < 0.86) support = Math.max(support, 0.64); // bustle roof
  if (z >= -1.08 && z < -0.18 && ax > 0.82) support = Math.max(support, 0.61); // flank bins
  if (z >= 0.16 && z < 1.24 && ax > 0.24) {
    support = Math.max(support, 0.69 - Math.max(0, z - 0.62) * 0.065); // ERAWA wedge
  }
  return support + 0.030;
};
const pt91TurretSideTopY = (z: number): number => {
  if (z < -1.05) return 0.67;
  if (z < -0.18) return 0.64;
  if (z < 0.58) return 0.66;
  return 0.66 - (z - 0.58) * 0.34;
};
const pt91TurretSideX = (z: number, t: number): number => {
  let armorX;
  if (z < -1.05) armorX = 0.83;
  else if (z < 0.55) armorX = 1.31;
  else armorX = THREE.MathUtils.lerp(1.28, 0.78,
    THREE.MathUtils.clamp((z - 0.55) / 0.45, 0, 1));
  return armorX + (1 - t) * 0.032;
};
const pt91TurretFrontZ = (x: number, y: number): number => 1.58
  - Math.max(0, Math.abs(x) - 0.20) * 0.61
  - Math.max(0, 0.40 - y) * 0.08;
const profileY = (stations: readonly Point2[], z: number): number => {
  if (z <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [z1, y1] = stations[i];
    if (z <= z1) {
      const [z0, y0] = stations[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (z - z0) / (z1 - z0));
    }
  }
  return stations.at(-1)?.[1] ?? 0;
};
const strv103aHullY = (_x: number, z: number): number => profileY([
  [-3.20, 1.89], [-2.00, 1.93], [0.62, 1.90], [1.55, 1.75],
  [2.36, 1.62], [2.98, 1.52], [3.45, 1.54],
], z);
const strv103bHullY = (_x: number, z: number): number => profileY([
  [-3.72, 1.57], [-2.75, 1.79], [0.75, 1.85], [1.60, 1.63],
  [2.61, 1.53], [3.22, 1.55],
], z);
const strv122HullY = (_x: number, z: number): number => {
  const armorY = z < 1.45 ? 1.76 : 1.76 - (z - 1.45) * 0.12;
  // The Swedish cover is tied to a shallow support frame above the bow.
  // This clearance keeps the front drape outside the live 2A5-family shoe
  // wrap while still following the glacis angle.
  return armorY + 0.15;
};
// The rebuilt Oplot keeps the donor fenders and a new welded turret. Cloth
// follows those surfaces; hatches, MG, sights and the pitching gun stay open.
const t84HullY = (_x: number, z: number): number => profileY([
  [-2.80, 1.526], [1.65, 1.509], [2.70, 1.446],
], z) + 0.027;
const t84TurretCoverGapM = 0.026;
const t84TurretCoverY = (_x: number, z: number): number => profileY([
  [-2.15, 0.66], [-0.50, 0.74], [0.28, 0.73], [1.63, 0.56],
], z) + t84TurretCoverGapM;
const oplotHullY = (_x: number, z: number): number => (
  z < 1.45 ? 1.51 : 1.51 - (z - 1.45) * 0.15
);
const abramsHullY = (x: number, z: number): number => {
  const armorY = z < 2.0 ? 1.49 : 1.49 - (z - 2.0) * 0.17;
  // ULCANS is a supported multispectral screen, not a skin-tight paint
  // layer.  Its battens keep the deck span clear of the 1.51 m return run;
  // the outboard lift is higher where the cloth crosses the fender line.
  return armorY + (Math.abs(x) > 1.04 ? 0.18 : 0.08);
};
// Round 3 (2026-10-07): the SEPv3 cover's deck carrier. abramsHullY's glacis slope (0.17 m/m from z 2) runs under the
// SEPv3's front deck tiles (1.45-1.52 m to z 3.2, then the 1.31-1.35 m bow strip, measured), so the old net sank into
// the armour ahead of the driver and the tiles stood through it; the cover now rides over the tiles to the bow edge.
const sepv3HullY = (x: number, z: number): number => Math.max(abramsHullY(x, z),
  (Math.abs(x) > 1.04 ? 1.58 : 1.56) - THREE.MathUtils.smoothstep(z, 3.2, 3.5) * 0.16);
/** The SEPv3 turret roof net's outer edge (its outline), for the flank drapes' roll-over. */
const sepv3TurretRoofEdge = (z: number): number => profileY([[-3.35, 1.05], [-2.32, 1.42], [0.38, 1.36], [1.12, 0.86]], z);
/** The Leopard 2A4 turret roof net's outer edge (LEO2A4_TURRET_ROOF_OUTLINE), for the flank drapes' roll-over. */
const leo2A4TurretRoofEdge = (z: number): number => profileY([[-2.28, 0.91], [-1.58, 0.99], [-0.72, 1.06], [0.69, 1.09]], z);

// Leopard 2A6 UA roof carriers. The original blanket used a single y=.98
// roof, leaving visible daylight over the 2A6M wedge; these profiles follow the
// authored roof tiers (round 5: the cheek nets are gone, so their ruled-face
// profile went with them). Values are turret-local metres.
const leo2A6UAFrontRoofY = (x: number, z: number): number => {
  const armorY = profileY([
    [0.46, 0.655], [0.72, 0.620], [1.20, 0.535], [1.68, 0.425], [2.18, 0.430],
  ], z);
  return armorY - Math.max(0, Math.abs(x) - 0.92) * 0.035 + 0.026;
};
const leo2A6UAMidRoofY = (x: number, z: number): number => {
  const armorY = z < -0.96 ? 0.78 : 0.75;
  return armorY - Math.max(0, Math.abs(x) - 0.72) * 0.055 + 0.026;
};
const leo2A6UARearRoofY = (_x: number, z: number): number => profileY([
  [-3.34, 0.62], [-3.02, 0.64], [-2.30, 0.66], [-1.58, 0.78],
], z) + 0.026;
// Leopard 2A4 full-vehicle suit (2026-10-05: moved from its private copy in profiles/leopard.ts onto this shared
// builder — the authored A4 cut-net carriers below are its outlines, openings and drapes unchanged; the garnish is
// the shared spray cards). The hull blanket floats 5-7 cm above the deck and follows the glacis to the beak; the
// side carriers follow the skirt shoulder and stop where the sprocket/idler arcs begin; the turret face opens a
// 0.9 m gun corridor; the crown opens around both hatches, EMES, the loader MG and the antenna seats.
const leo2A4HullBlanketY = (_x: number, z: number): number => {
  if (z <= 2.20) return 1.765;
  if (z <= 2.40) return 1.765 - (z - 2.20) * 0.45;
  if (z <= 2.96) return 1.675 - (z - 2.40) * 0.33;
  if (z <= 3.52) return 1.490 - (z - 2.96) * 0.18;
  return 1.389 - (z - 3.52) * 0.44;
};
const leo2A4HullSideWidth = (z: number): number => {
  if (z > 2.25) return THREE.MathUtils.lerp(1.71, 1.06, (z - 2.25) / 1.53);
  if (z < -3.20) return THREE.MathUtils.lerp(1.71, 1.33, (-z - 3.20) / 0.58);
  return 1.71;
};
// the physical skirt course moved up 100 mm; the carrier hem follows the supported 0.62/0.64 m armor bottoms
const leo2A4HullSideBottom = (z: number): number => 0.725 + Math.sin(z * 3.1) * 0.035 + Math.cos(z * 5.7) * 0.020;
const leo2A4TurretSideWidth = (z: number): number => {
  if (z > 0.55) return THREE.MathUtils.lerp(1.31, 1.05, (z - 0.55) / 0.55);
  if (z < -1.45) return THREE.MathUtils.lerp(1.28, 1.03, (-z - 1.45) / 1.28);
  return z < -0.50 ? 1.28 : 1.31;
};
const LEO2A4_HULL_BLANKET_OUTLINE: readonly Point2[] = [
  [-0.94, -3.80], [0.94, -3.80], [1.02, -3.42], [1.68, -3.12],
  // the bow shoulders come in before the idler arc, clear of the animated terminal shoes
  [1.71, -2.62], [1.72, 2.18], [1.57, 2.72], [0.84, 3.42],
  [0.88, 3.82], [-0.88, 3.82], [-0.84, 3.42], [-1.57, 2.72],
  [-1.72, 2.18], [-1.71, -2.62], [-1.68, -3.12], [-1.02, -3.42],
];
// end courses keep their sprays between the live track lanes
const LEO2A4_HULL_END_LANES: readonly (readonly Point2[])[] = [-1, 1].flatMap((side) => [
  [[side * 0.72, 3.18], [side * 2.0, 3.18], [side * 2.0, 4.2], [side * 0.72, 4.2]] as Point2[],
  [[side * 0.72, -3.18], [side * 2.0, -3.18], [side * 2.0, -4.2], [side * 0.72, -4.2]] as Point2[],
]);
// round 3: the front hull hatch rings (driver right, at x -0.6; the second ring left) open through the blanket, and the
// driver's view forward over the glacis carries no garnish (nor does the glacis itself: sprays would lie flat on it)
const LEO2A4_HULL_HATCHES: readonly (readonly Point2[])[] = [rect(-0.92, -0.28, 1.50, 2.18), rect(0.28, 0.92, 1.50, 2.18)];
const LEO2A4_GLACIS_CLEAR: readonly (readonly Point2[])[] = [[[-1.24, 2.12], [1.24, 2.12], [1.24, 3.95], [-1.24, 3.95]]];
const LEO2A4_TURRET_ROOF_OUTLINE: readonly Point2[] = [
  [-0.81, 1.06], [-0.48, 1.06], [-0.48, 0.80], [0.18, 0.80],
  [0.18, 0.30], [1.05, 0.30], [1.09, 0.69], [1.06, -0.72],
  [0.99, -1.58], [0.91, -2.28], [-0.91, -2.28], [-0.99, -1.58],
  [-1.06, -0.72], [-1.09, 0.69],
];
const LEO2A4_TURRET_ROOF_HOLES: readonly (readonly Point2[])[] = [
  [[-1.00, -0.98], [-1.00, 0.34], [-0.14, 0.34], [-0.14, -0.98]],
  [[0.19, -0.52], [0.19, -0.10], [0.53, -0.10], [0.53, -0.52]],
  [[0.28, -0.52], [0.91, -0.52], [0.91, -0.62], [0.96, -0.62],
    [0.96, -1.58], [0.38, -1.65], [0.38, -1.06], [0.28, -1.06]],
  [[-0.90, -2.25], [-0.90, -1.78], [-0.73, -1.78], [-0.73, -2.25]],
];

export const GHILLIE_SUIT_CONFIGS = Object.freeze({
  leo2a2: {
    id: 'leo2a2', seed: 2404, style: 'leafy', density: 0.9, leafScale: 0.96, foliageKind: 'beech', maxHalfWidth: 1.845, hemFloorM: 0.565,
    light: 0x64794a, dark: 0x34462d, netColor: 'rgba(34,48,27,0.72)',
    hull: {
      // the deck under the turret and gun sweep keeps its garnish to a low band along its edges (round 3)
      top: [{ x0: -1.72, x1: 1.72, z0: -3.80, z1: 3.82, nx: 24, nz: 48, yAt: leo2A4HullBlanketY,
        outline: LEO2A4_HULL_BLANKET_OUTLINE, holes: [rect(-1.39, 1.39, -2.12, 1.58), ...LEO2A4_HULL_HATCHES], strictHoles: true,
        foliageExclude: [...LEO2A4_HULL_END_LANES, ...LEO2A4_GLACIS_CLEAR], garnishEdgeBandM: 0.42, garnishRiseM: 0.08,
        reliefScale: 0.55, seed: 4 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.12, z1: 2.24, nz: 44, ny: 10,
        topAt: (z: number) => leo2A4HullBlanketY(0, z) - 0.015, bottomAt: leo2A4HullSideBottom,
        outAt: (z: number, t: number) => leo2A4HullSideWidth(z) + 0.025 + (1 - t) * 0.075, seed: 11 + side })),
      face: [
        // round 3: the bow drape ends at the beak (1.21 m at z 3.8, measured) where the blanket's front edge meets it;
        // its old top stood 0.3 m clear of the hull in front of the driver's view, a free-standing fence
        { z: 3.895, x0: -1.05, x1: 1.05, y0: 0.66, y1: 1.27, nx: 16, ny: 7, strictHoles: true,
          outline: [[-0.86, 0.69], [0.86, 0.69], [1.04, 0.88], [0.98, 1.16], [0.80, 1.25], [-0.80, 1.25], [-0.98, 1.16], [-1.04, 0.88]],
          holes: [[[-0.72, 1.09], [-0.46, 1.09], [-0.46, 1.29], [-0.72, 1.29]], [[0.46, 1.09], [0.72, 1.09], [0.72, 1.29], [0.46, 1.29]]],
          seed: 23 },
        // round 5 (wave 253: "the net hangs as a flat rigid curtain over the whole hull rear and exhaust"): a short
        // valance off the rear deck's edge, the exhaust louvres below it clear
        { z: -3.825, x0: -1.48, x1: 1.48, y0: 1.42, y1: 1.74, nx: 20, ny: 4, strictHoles: true,
          outline: [[-1.31, 0.66], [1.31, 0.66], [1.46, 0.92], [1.37, 1.62], [0.98, 1.72], [-0.98, 1.72], [-1.37, 1.62], [-1.46, 0.92]],
          seed: 29 },
      ],
    },
    turret: {
      // round 5: the crew's sticks under the net on the crown between the hatches, on the bustle and by the EMES
      // shoulder, where the turret's box outline most needs breaking
      top: [{ x0: -1.10, x1: 1.10, z0: -2.30, z1: 1.08, nx: 22, nz: 34, yAt: () => 0.758,
        outline: LEO2A4_TURRET_ROOF_OUTLINE, holes: LEO2A4_TURRET_ROOF_HOLES, strictHoles: true, seed: 19,
        tents: [[0.02, -1.24, 0.12], [-0.5, -1.86, 0.1], [0.66, -1.98, 0.13], [-0.72, 0.62, 0.09]] }],
      side: [-1, 1].map((side) => ({ side, z0: -2.73, z1: 1.08, nz: 38, ny: 9,
        topAt: (z: number) => 0.755 - Math.max(0, -z - 1.55) * 0.045,
        bottomAt: (z: number) => 0.10 + Math.sin(z * 4.7) * 0.028,
        outAt: (z: number, t: number) => leo2A4TurretSideWidth(z) + 0.018 + (1 - t) * 0.028, seed: 43 + side,
        shoulder: { z0: -2.28, z1: 0.69, inAt: (z: number) => leo2A4TurretRoofEdge(z) - 0.05, yAt: () => 0.752 } })),
      face: [
        { z: 1.292, x0: -1.20, x1: 1.20, y0: 0.06, y1: 0.80, nx: 20, ny: 9, strictHoles: true,
          outline: [[-1.18, 0.10], [1.18, 0.10], [1.11, 0.72], [0.74, 0.79], [-0.74, 0.79], [-1.11, 0.72]],
          holes: [[[-0.47, 0.04], [0.47, 0.04], [0.47, 0.73], [-0.47, 0.73]]], seed: 37 },
        { z: -2.755, x0: -1.10, x1: 1.10, y0: 0.08, y1: 0.70, nx: 18, ny: 8, strictHoles: true,
          outline: [[-0.98, 0.10], [0.98, 0.10], [1.09, 0.28], [0.91, 0.69], [-0.91, 0.69], [-1.09, 0.28]], seed: 47 },
      ],
    },
  },
  t64bv_donbas: {
    id: 't64bv_donbas', seed: 640, style: 'leafy', density: 0.92, leafScale: 1.04,
    light: 0x6f7d48, dark: 0x33452d, netColor: 'rgba(38,54,29,0.76)',
    hull: {
      top: [{ x0: -1.50, x1: 1.50, z0: -3.12, z1: 3.18, nx: 24, nz: 48,
        yAt: t64HullY,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.50, -2.70], [1.50, 2.35], [0.95, 3.18], [-0.95, 3.18], [-1.50, 2.35], [-1.50, -2.70]],
        holes: [rect(-1.38, 1.38, -1.92, 1.20), rect(-0.22, 0.22, 0.94, 1.52)], seed: 3 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.72, z1: 2.55, nz: 38, ny: 9,
        topAt: (z) => t64HullY(0, z), bottomAt: (z) => 0.69 + Math.sin(z * 3.1) * 0.035,
        outAt: (_z, t) => 1.72 + (1 - t) * 0.055, seed: 10 + side })),
      face: [{ z: 3.31, x0: -1.05, x1: 1.05, y0: 0.70, y1: 1.20, nx: 14, ny: 6,
        outline: [[-0.88, 0.70], [0.88, 0.70], [1.05, 0.90], [0.82, 1.20], [-0.82, 1.20], [-1.05, 0.90]], seed: 17 }],
    },
    turret: {
      top: [{ x0: -1.16, x1: 1.16, z0: -1.65, z1: 1.10, nx: 20, nz: 26,
        yAt: () => 0.78,
        outline: [[-0.72, -1.65], [0.72, -1.65], [1.16, -0.78], [1.12, 0.54], [0.66, 1.10], [-0.66, 1.10], [-1.12, 0.54], [-1.16, -0.78]],
        holes: [rect(-0.96, -0.36, -0.42, 0.22), rect(0.18, 0.76, -0.40, 0.18), rect(-0.67, -0.20, 0.62, 1.12)], seed: 29 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.55, z1: 0.83, nz: 24, ny: 7,
        topAt: () => 0.73, bottomAt: (z) => 0.10 + Math.sin(z * 4.2) * 0.025,
        outAt: (z, t) => (z < -0.70 ? 1.02 : 1.25) + (1 - t) * 0.035, seed: 37 + side })),
      face: [{ z: 1.20, x0: -1.12, x1: 1.12, y0: 0.08, y1: 0.70, nx: 18, ny: 8,
        outline: [[-0.82, 0.08], [0.82, 0.08], [1.12, 0.36], [0.78, 0.70], [-0.78, 0.70], [-1.12, 0.36]],
        holes: [rect(-0.42, 0.42, 0.04, 0.64), rect(-0.72, -0.20, 0.48, 0.76)], seed: 43 }],
    },
  },
  pt91a_twardy: {
    id: 'pt91a_twardy', seed: 911, style: 'leafy', density: 0.86, leafScale: 0.92, foliageKind: 'birch',
    light: 0x71835a, dark: 0x374a35, netColor: 'rgba(43,58,35,0.76)',
    hull: {
      top: [{ x0: -1.55, x1: 1.55, z0: -3.15, z1: 3.22, nx: 24, nz: 48,
        yAt: ptHullY,
        outline: [[-1.10, -3.15], [1.10, -3.15], [1.55, -2.70], [1.55, 2.40], [1.00, 3.22], [-1.00, 3.22], [-1.55, 2.40], [-1.55, -2.70]],
        holes: [rect(-1.43, 1.43, -1.82, 1.42), rect(-0.24, 0.24, 0.96, 1.52)], seed: 5 }],
      // round 4 (2026-10-07, wave 216: "the side net is a straight vertical wall of evenly spaced clumps"): each flank
      // hangs as two drapes of different lengths with a bare stretch of skirt between them
      side: [-1, 1].flatMap((side) => [[-2.65, -0.18 + side * 0.22, 0], [0.42 + side * 0.22, 2.58, 1]].map(([z0, z1, k]) => ({
        side, z0, z1, nz: k ? 16 : 20, ny: 9,
        topAt: (z: number) => ptHullY(0, z), bottomAt: (z: number) => 0.63 + Math.sin(z * 2.8) * 0.035,
        outAt: (_z: number, t: number) => 1.80 + (1 - t) * 0.045, seed: 13 + side + k * 5 }))),
      face: [{ z: 3.48, x0: -1.08, x1: 1.08, y0: 0.82, y1: 1.28, nx: 14, ny: 6,
        outline: [[-0.88, 0.82], [0.88, 0.82], [1.08, 1.00], [0.78, 1.28], [-0.78, 1.28], [-1.08, 1.00]], seed: 19 }],
    },
    turret: {
      top: [{ x0: -1.17, x1: 1.17, z0: -1.65, z1: 1.25, nx: 26, nz: 34,
        yAt: pt91TurretCoverY,
        outline: [[-0.82, -1.65], [0.82, -1.65], [1.17, -0.72], [1.10, 0.52], [0.62, 1.25], [-0.62, 1.25], [-1.10, 0.52], [-1.17, -0.72]],
        holes: [rect(-0.94, -0.34, -0.46, 0.14), rect(0.24, 0.82, -0.42, 0.10),
          rect(-0.48, 0.48, 0.52, 1.30), rect(0.28, 0.78, 0.48, 1.02)], seed: 31 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.58, z1: 1.00, nz: 28, ny: 8,
        topAt: pt91TurretSideTopY, bottomAt: (z) => 0.13 + Math.sin(z * 4.0) * 0.025,
        outAt: pt91TurretSideX, seed: 41 + side })),
      face: [{ z: 1.45, x0: -1.15, x1: 1.15, y0: 0.10, y1: 0.72, nx: 18, ny: 8,
        zAt: pt91TurretFrontZ,
        outline: [[-0.76, 0.10], [0.76, 0.10], [1.15, 0.34], [0.78, 0.72], [-0.78, 0.72], [-1.15, 0.34]],
        holes: [rect(-0.44, 0.44, 0.02, 0.67)], seed: 47 }],
    },
  },
  strv103a: {
    id: 'strv103a', seed: 1031, style: 'leafy', density: 0.82, leafScale: 0.90, foliageKind: 'spruce',
    light: 0x667a43, dark: 0x32452b, netColor: 'rgba(39,55,31,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.30, z1: 3.46, nx: 26, nz: 52,
        yAt: strv103aHullY,
        outline: [[-1.30, -3.30], [1.30, -3.30], [1.66, -2.65], [1.65, 2.40], [1.16, 3.46], [-1.16, 3.46], [-1.65, 2.40], [-1.66, -2.65]],
        // round 4 (2026-10-07, wave 216: "the thick-corded net passes under the slab instead of over or around it"):
        // the net opens round the spare links planted on the right glacis shoulder (sweden.ts: 0.98, z 2.30, 0.60 wide)
        holes: [rect(-0.27, 0.27, 0.78, 3.58), rect(0.03, 0.91, -1.30, 0.12), rect(-0.90, -0.28, -1.22, -0.46),
          rect(0.62, 1.34, 1.96, 2.64)], seed: 71 }],
      // round 4 (wave 216: "a single green blanket draped over the vehicle ... the hull's own silhouette is barely
      // legible"): each flank hangs as two drapes with the hull side bare between them.
      // Round 5 (2026-10-08, wave 256: "the flank net hangs as a vertical strip that stops at the fender line, with no
      // drape over the running gear"): the drapes come down over the upper running gear (the carrier keeps clear of it),
      // their ragged hems a hand above the road wheels' hubs
      side: [-1, 1].flatMap((side) => [[-3.12, -0.62, 0], [0.12, 2.40, 1]].map(([z0, z1, k]) => ({ side, z0, z1,
        nz: k ? 18 : 20, ny: 7,
        topAt: (z: number) => strv103aHullY(0, z) - 0.02,
        bottomAt: (z: number) => 1.02 + Math.sin(z * 2.7) * 0.04,
        outAt: (_z: number, t: number) => 1.84 + (1 - t) * 0.030, seed: 79 + side + k * 7 }))),
    },
  },
  strv103b: {
    id: 'strv103b', seed: 1032, style: 'leafy', density: 0.88, leafScale: 0.92, foliageKind: 'spruce',
    light: 0x65783f, dark: 0x304329, netColor: 'rgba(37,53,29,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.76, z1: 3.24, nx: 26, nz: 54,
        yAt: strv103bHullY,
        outline: [[-1.42, -3.76], [1.42, -3.76], [1.66, -2.70], [1.64, 2.35], [0.92, 3.24], [-0.92, 3.24], [-1.64, 2.35], [-1.66, -2.70]],
        holes: [rect(-0.28, 0.28, 0.76, 3.36), rect(-0.22, 0.92, -0.88, 0.20), rect(-0.98, -0.30, -1.44, -0.72)], seed: 87 }],
      // round 5 (2026-10-08, wave 256 on the 103A): down over the upper running gear, clear of it
      side: [-1, 1].map((side) => ({ side, z0: -3.58, z1: 2.72, nz: 44, ny: 7,
        topAt: (z) => strv103bHullY(0, z) - 0.02,
        bottomAt: (z) => 0.98 + Math.sin(z * 2.5) * 0.04,
        outAt: (_z, t) => 1.87 + (1 - t) * 0.028, seed: 93 + side })),
    },
  },
  strv121: {
    id: 'strv121', seed: 1220, style: 'leafy', density: 0.78, leafScale: 0.92, foliageKind: 'spruce',
    disabled: true,
    light: 0x657845, dark: 0x31422d, netColor: 'rgba(39,53,31,0.80)',
    hull: {
      top: [{ x0: -1.72, x1: 1.72, z0: -3.62, z1: 3.70, nx: 26, nz: 54,
        yAt: strv122HullY,
        outline: [[-1.36, -3.62], [1.36, -3.62], [1.72, -3.10], [1.72, 2.68], [1.10, 3.70], [-1.10, 3.70], [-1.72, 2.68], [-1.72, -3.10]],
        holes: [rect(-1.47, 1.47, -2.35, 1.42), rect(-0.24, 0.24, 1.04, 1.72)], seed: 101 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.05, nz: 42, ny: 8,
        topAt: (z) => strv122HullY(0, z), bottomAt: (z) => 1.54 + Math.sin(z * 2.4) * 0.025,
        outAt: (_z, t) => 1.91 + (1 - t) * 0.035, seed: 109 + side })),
    },
    turret: {
      top: [{ x0: -1.48, x1: 1.48, z0: -3.12, z1: 1.42, nx: 24, nz: 38,
        yAt: () => 1.08,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.48, -2.10], [1.42, 0.55], [0.90, 1.42], [-0.90, 1.42], [-1.42, 0.55], [-1.48, -2.10]],
        holes: [rect(-1.10, -0.38, -0.72, 0.10), rect(0.14, 0.88, -0.65, 0.12), rect(-0.36, 0.36, 0.62, 1.50)], seed: 117 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.02, z1: 0.92, nz: 32, ny: 8,
        topAt: () => 1.02, bottomAt: (z) => 0.10 + Math.sin(z * 3.1) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.38 : 1.70) + (1 - t) * 0.030, seed: 125 + side })),
      face: [{ z: 1.55, x0: -1.38, x1: 1.38, y0: 0.02, y1: 0.92, nx: 20, ny: 9,
        outline: [[-1.02, 0.02], [1.02, 0.02], [1.38, 0.40], [0.96, 0.92], [-0.96, 0.92], [-1.38, 0.40]],
        holes: [rect(-0.50, 0.50, -0.04, 0.82)], seed: 133 }],
    },
  },
  t84: {
    id: 't84', seed: 840, style: 'leafy', density: 1.0, leafScale: 1.02,
    light: 0x6e804b, dark: 0x35492e, netColor: 'rgba(42,56,34,0.84)',
    hull: {
      // Separate shoulder covers leave the driver, engine grilles, lights and
      // turret sweep uncovered. Side nets hang outside the armored skirts.
      top: [-1, 1].map(side => ({ x0: side < 0 ? -1.74 : 1.42,
        x1: side < 0 ? -1.42 : 1.74, z0: 1.93, z1: 2.68, nx: 5, nz: 12,
        yAt: t84HullY, seatGapM: 0.027, seat: 'donor-fender', seed: 141 + side })),
      side: [-1, 1].map(side => ({ side, z0: -2.80, z1: 2.85, nz: 42, ny: 8,
        topAt: () => 1.405, bottomAt: z => 0.92 + Math.sin(z * 3.7) * 0.025,
        outAt: (_z, t) => 1.995 + (1 - t) * 0.012, seed: 149 + side })),
    },
    turret: {
      top: [
        { x0: -0.94, x1: 0.94, z0: -1.30, z1: 0.25, nx: 24, nz: 22,
          yAt: t84TurretCoverY,
          holes: [rect(0.10, 1.10, -1.20, 0.30), rect(-1.08, -0.13, -0.79, 0.30)],
          seatGapM: t84TurretCoverGapM, seat: 'welded-roof', seed: 157 },
        ...[-0.68, 0, 0.68].map(x => ({ x0: x - 0.26, x1: x + 0.26,
          z0: -1.99, z1: -1.49, nx: 7, nz: 8, yAt: () => 0.959,
          seatGapM: t84TurretCoverGapM, seat: 'strapped-bustle-pack', seed: 161 })),
        ...[-1, 1].map(side => ({ x0: side < 0 ? -0.94 : 0.57,
          x1: side < 0 ? -0.57 : 0.94, z0: 0.43, z1: 0.84, nx: 6, nz: 7,
          yAt: t84TurretCoverY, seatGapM: t84TurretCoverGapM, seat: 'cheek-roof', seed: 169 + side })),
      ],
      // The flank drape hangs 44 mm outside the side cassettes and follows them onto the tapering bustle.
      side: [-1, 1].map(side => ({ side, z0: -1.66, z1: -0.42, nz: 20, ny: 7,
        topAt: () => 0.56, bottomAt: z => 0.15 + Math.sin(z * 3.6) * 0.016,
        outAt: (z, t) => oplotFlankOuterX(z) + 0.044 + (1 - t) * 0.010, seed: 175 + side })),
      face: [{ z: -2.456, x0: -1.17, x1: 1.17, y0: 0.13, y1: 0.56, nx: 26, ny: 7,
        seatGapM: 0.026, seat: 'bustle-cage', seed: 183 }],
    },
  },
  t84bm_oplot_m: {
    id: 't84bm_oplot_m', seed: 8420, style: 'leafy', density: 0.90, leafScale: 0.96,
    disabled: true,
    light: 0x708055, dark: 0x354830, netColor: 'rgba(43,59,35,0.82)',
    hull: {
      top: [{ x0: -1.65, x1: 1.65, z0: -3.42, z1: 3.46, nx: 26, nz: 52,
        yAt: oplotHullY,
        outline: [[-1.24, -3.42], [1.24, -3.42], [1.65, -2.94], [1.65, 2.62], [1.04, 3.46], [-1.04, 3.46], [-1.65, 2.62], [-1.65, -2.94]],
        holes: [rect(-1.48, 1.48, -2.08, 1.36), rect(-0.24, 0.24, 1.04, 1.58)], seed: 181 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.02, nz: 42, ny: 8,
        topAt: (z) => oplotHullY(0, z), bottomAt: (z) => 1.20 + Math.sin(z * 2.7) * 0.025,
        outAt: (_z, t) => 1.95 + (1 - t) * 0.045, seed: 189 + side })),
    },
    turret: {
      top: [{ x0: -1.46, x1: 1.46, z0: -2.12, z1: 2.10, nx: 24, nz: 34,
        yAt: () => 0.91,
        outline: [[-1.00, -2.12], [1.00, -2.12], [1.46, -1.14], [1.44, 1.18], [0.74, 2.10], [-0.74, 2.10], [-1.44, 1.18], [-1.46, -1.14]],
        holes: [rect(-1.05, -0.32, -0.60, 0.18), rect(0.24, 0.96, -0.62, 0.16), rect(-0.40, 0.40, 1.08, 2.18)], seed: 197 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.04, z1: 1.42, nz: 28, ny: 8,
        topAt: () => 0.84, bottomAt: (z) => 0.04 + Math.sin(z * 3.4) * 0.024,
        outAt: (z, t) => (z < -1.08 ? 1.18 : 1.63) + (1 - t) * 0.034, seed: 205 + side })),
      face: [{ z: 2.28, x0: -1.32, x1: 1.32, y0: 0.00, y1: 0.80, nx: 20, ny: 8,
        outline: [[-0.92, 0.00], [0.92, 0.00], [1.32, 0.34], [0.84, 0.80], [-0.84, 0.80], [-1.32, 0.34]],
        holes: [rect(-0.50, 0.50, -0.04, 0.72)], seed: 213 }],
    },
  },
  m1a1_abrams_fep: {
    id: 'm1a1_abrams_fep', seed: 123, style: 'ulcans', density: 0.76, leafScale: 0.96,
    light: 0x7a795b, dark: 0x3d4636, netColor: 'rgba(50,55,43,0.82)',
    hull: {
      // round 3: the cover rides the measured front deck (sepv3HullY), opens the driver's periscopes with his hatch, keeps
      // the view over the glacis clear, and carries its garnish low along the deck edges under the turret's sweep
      top: [{ x0: -1.66, x1: 1.66, z0: -3.62, z1: 3.62, nx: 26, nz: 54,
        yAt: sepv3HullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.66, -3.12], [1.66, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.66, 2.65], [-1.66, -3.12]],
        holes: [rect(-1.57, 1.57, -2.85, 1.72), rect(-0.30, 0.30, 0.92, 2.25), rect(-1.52, -0.65, -3.58, -2.15)],
        foliageExclude: [[[-0.8, 1.6], [0.8, 1.6], [0.95, 3.7], [-0.95, 3.7]]],
        garnishEdgeBandM: 0.4, garnishRiseM: 0.08, reliefScale: 0.6, seed: 9 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.08, z1: 3.04, nz: 42, ny: 9,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.5) * 0.030,
        // ULCANS hangs from stand-off battens outside the skirt rather than
        // lying in the live SEPv3 shoe/pin envelope (outer x ~= 1.72 m).
        // Keep the lower hem farther out so suspension travel cannot pull a
        // shoe through the cloth while the upper edge still reads attached.
        outAt: (_z, t) => 1.92 + (1 - t) * 0.090, seed: 21 + side,
        // round 3: the drape rolls over the fender edge into the deck cover instead of standing as a free edge
        shoulder: { z0: -3.08, z1: 2.62, inAt: () => 1.6, yAt: (z: number) => sepv3HullY(1.6, z) - 0.004 } })),
      face: [{ z: 3.93, x0: -1.10, x1: 1.10, y0: 0.96, y1: 1.31, nx: 14, ny: 5,
        outline: [[-0.88, 0.96], [0.88, 0.96], [1.10, 1.12], [0.72, 1.31], [-0.72, 1.31], [-1.10, 1.12]],
        holes: [rect(-0.78, -0.42, 1.04, 1.29), rect(0.42, 0.78, 1.04, 1.29)], seed: 29 }],
    },
    turret: {
      top: [{ x0: -1.42, x1: 1.42, z0: -3.35, z1: 1.12, nx: 24, nz: 38,
        yAt: () => 0.88,
        outline: [[-1.05, -3.35], [1.05, -3.35], [1.42, -2.32], [1.36, 0.38], [0.86, 1.12], [-0.86, 1.12], [-1.36, 0.38], [-1.42, -2.32]],
        holes: [rect(-1.26, -0.48, -0.86, 0.02), rect(-0.52, 0.05, 0.06, 0.55), rect(0.16, 0.83, -0.64, 0.06), rect(-1.28, -0.70, -2.92, -1.70), rect(0.68, 1.30, -2.84, -1.62)], seed: 37 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.20, z1: 0.80, nz: 32, ny: 8,
        topAt: () => 0.80, bottomAt: (z) => 0.02 + Math.sin(z * 3.2) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.52 : 1.68) + (1 - t) * 0.028, seed: 51 + side,
        // round 3 ("along both turret sides the net rises as vertical free-standing fence panels"): the flank drape
        // rolls over the roof edge and tucks under the roof net
        shoulder: { z0: -3.20, z1: 0.40, inAt: (z: number) => sepv3TurretRoofEdge(z) - 0.06, yAt: () => 0.874 } })),
      face: [{ z: 1.38, x0: -1.36, x1: 1.36, y0: -0.02, y1: 0.76, nx: 20, ny: 8,
        outline: [[-1.00, -0.02], [1.00, -0.02], [1.36, 0.40], [0.96, 0.76], [-0.96, 0.76], [-1.36, 0.40]],
        holes: [rect(-0.52, 0.52, -0.06, 0.68), rect(-1.22, -0.78, 0.44, 0.78), rect(0.78, 1.22, 0.44, 0.78)], seed: 61 }],
    },
  },
  ua_m1a1: {
    id: 'ua_m1a1', seed: 1101, style: 'leafy', density: 0.94, leafScale: 1.02,
    light: 0x737b4d, dark: 0x35472f, netColor: 'rgba(39,54,32,0.84)',
    hull: {
      top: [{ x0: -1.68, x1: 1.68, z0: -3.62, z1: 3.62, nx: 28, nz: 56,
        yAt: abramsHullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.68, -3.12], [1.68, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.68, 2.65], [-1.68, -3.12]],
        holes: [rect(-1.58, 1.58, -2.88, 1.72), rect(-0.30, 0.30, 0.86, 1.70)], seed: 221 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.18, z1: 3.08, nz: 44, ny: 10,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.6) * 0.034,
        outAt: (_z, t) => 1.94 + (1 - t) * 0.10, seed: 229 + side })),
      face: [{ z: 3.94, x0: -1.12, x1: 1.12, y0: 0.96, y1: 1.33, nx: 16, ny: 6,
        outline: [[-0.90, 0.96], [0.90, 0.96], [1.12, 1.12], [0.74, 1.33], [-0.74, 1.33], [-1.12, 1.12]],
        holes: [rect(-0.80, -0.40, 1.03, 1.31), rect(0.40, 0.80, 1.03, 1.31)], seed: 237 }],
    },
    // A second carrier drapes over the full field-cage envelope rather than
    // clipping into the Abrams cheeks. It follows the turret rig and keeps a
    // generous center opening for gun elevation and recoil.
    turret: {
      top: [{ x0: -2.10, x1: 2.10, z0: -3.42, z1: 2.66, nx: 34, nz: 48,
        yAt: (x, z) => 1.38 + Math.cos(x * 1.2) * 0.012 - Math.max(0, z - 1.5) * 0.10,
        outline: [[-1.72, -3.42], [1.72, -3.42], [2.10, -2.82], [2.02, 1.80], [1.58, 2.66], [0.54, 2.66], [0.54, 1.82], [-0.54, 1.82], [-0.54, 2.66], [-1.58, 2.66], [-2.02, 1.80], [-2.10, -2.82]],
        holes: [rect(-0.54, 0.54, 1.62, 2.74), rect(-0.48, 0.48, 0.80, 1.70)], seed: 245 }],
      // owner 2026-09-15 (evening): the net walls that hung on the cage's sides and front read as
      // grey panels covering the cage; only the roof drape remains (the cage bars stay visible).
    },
  },
  leo2a6_ua: {
    // Round 5 (2026-10-08; the coordinator after wave 269, fleet B2, 2/10 on the hero, gear and mantlet views: "a
    // box-shaped shell of bristling leaf shards encloses the turret and runs down the full gun barrel, like a hedgehog /
    // hedge sculpture", "flat, unshaded, single-sided leaf polygons floating in the air, cutting through the cage bars",
    // "fish scales" on the hull flanks; the ruling: replace the approach, not tune it). One net thrown over the turret
    // roof out to the basket rails, sagging off them and falling 30-40 cm over the flank and bustle cages with a ragged
    // hem; the cheeks, the front cage and the lower flanks bare. The engine deck and glacis nets fall over the hull's
    // corners as short swags tied along the skirt cage's top rail; the skirts and running gear bare between them. Two
    // short bound wraps on the barrel (the sleeve root and one band), the bore and muzzle clear. The garnish is bunches
    // tied at points along the hems, low, with few boughs; the drone dock and both weapon stations keep their columns.
    id: 'leo2a6_ua', seed: 2606, style: 'leafy', density: 0.42, leafScale: 0.9, boughShare: 0.1,
    light: 0x747b50, dark: 0x34452f, netColor: 'rgba(38,53,32,0.86)',
    hull: {
      top: [
        { x0: -1.86, x1: 1.86, z0: -3.54, z1: -1.28, nx: 30, nz: 24,
          yAt: (x, z) => 1.91 + Math.cos(x * 1.7 + z) * 0.016,
          outline: [[-1.42, -3.54], [1.42, -3.54], [1.86, -3.12], [1.86, -1.28], [-1.86, -1.28], [-1.86, -3.12]],
          holes: [rect(-1.18, -0.35, -3.18, -2.08), rect(0.35, 1.18, -3.18, -2.08)], seed: 271, tents: [], garnishRiseM: 0.09 },
        { x0: -1.88, x1: 1.88, z0: 1.24, z1: 3.18, nx: 30, nz: 22,
          yAt: (x, z) => 1.77 - Math.max(0, z - 2.08) * 0.30 + Math.cos(x * 2.0) * 0.012,
          outline: [[-1.88, 1.24], [1.88, 1.24], [1.84, 2.66], [1.18, 3.18], [-1.18, 3.18], [-1.84, 2.66]],
          holes: [rect(0.35, 0.92, 1.25, 1.75)], seed: 277, tents: [], garnishRiseM: 0.07, garnishDensity: 0.6 },
      ],
      // the deck nets' corners: short swags over the skirt cage's top rail, the bays between them bare
      side: [-1, 1].flatMap((side) => [
        { side, z0: -3.30, z1: -1.70, topAt: () => 1.78, bottomAt: (z: number) => 1.30 + Math.sin(z * 3.1) * 0.035,
          outAt: (_z: number, t: number) => 2.25 + (1 - t) * 0.03, seed: 283 + side },
        { side, z0: 1.42, z1: 2.92, topAt: (z: number) => z > 2.08 ? 1.76 - (z - 2.08) * 0.28 : 1.78,
          bottomAt: (z: number) => 1.32 + Math.sin(z * 2.7) * 0.035, outAt: (_z: number, t: number) => 2.25 + (1 - t) * 0.03, seed: 287 + side },
      ]),
    },
    turret: {
      top: [
        // the bustle, out to the basket rails
        { x0: -1.62, x1: 1.62, z0: -3.40, z1: -1.54, nx: 30, nz: 18,
          yAt: leo2A6UARearRoofY,
          outline: [[-1.10, -3.40], [1.10, -3.40], [1.62, -2.96], [1.62, -1.54], [-1.62, -1.54], [-1.62, -2.96]],
          holes: [rect(-1.17, -0.46, -2.24, -1.30)], seed: 299, tents: [], garnishRiseM: 0.1 },
        // the main roof between the hatches, sights and the forward station, out to the basket rails; the drone dock
        // on the right rail stays open
        { x0: -1.62, x1: 1.62, z0: -1.58, z1: 0.66, nx: 30, nz: 22,
          yAt: leo2A6UAMidRoofY,
          outline: [[-1.62, -1.58], [1.62, -1.58], [1.62, 0.66], [-1.62, 0.66]],
          holes: [rect(-0.94, -0.34, -0.92, -0.22), rect(0.30, 0.94, -0.98, -0.08),
            rect(0.32, 0.96, 0.02, 0.52), rect(0.74, 1.10, -1.56, -1.04), rect(-1.70, -1.20, 0.24, 0.70)],
          seed: 303, tents: [], garnishRiseM: 0.1 },
        // the crowns over the cheeks: a lip of net, no garnish standing on the front of the arrowhead
        ...[-1, 1].map<TopPanel>((side) => ({
          x0: side < 0 ? -1.30 : 0.22, x1: side < 0 ? -0.22 : 1.30,
          z0: 0.46, z1: 1.30, nx: 13, nz: 10,
          yAt: leo2A6UAFrontRoofY,
          outline: side < 0
            ? [[-1.02, 0.46], [-0.28, 0.46], [-0.24, 1.30], [-1.18, 1.30]]
            : [[0.28, 0.46], [1.02, 0.46], [1.18, 1.30], [0.24, 1.30]],
          holes: side > 0 ? [rect(0.36, 0.96, 0.46, 0.82)] : [],
          seed: 311 + side, tents: [], garnishRiseM: 0.06, garnishDensity: 0.5,
        })),
      ],
      // over the basket rails and the flank cage's top rail, 30-40 cm down its outside; the right flank stops short of
      // the drone dock. 2026-10-08 (the lane lead, merging main's 6763d7cc0): the owner's modern field cage stands its
      // three side panels 0.19 m off each flank (turret-local z -2.77 to 0.09, top rail 0.82 m), and a drape hung down
      // them rests on their bars and sags through between them (83 crossings). The owner's rule for cages ("the cage bars
      // stay visible", 2026-09-15): the flank drapes keep to the bustle corner and the right front, and over the panels'
      // run the roof net ends at the basket rails.
      // 2026-10-09 (launch RC; ghillieSuit.selftest, "suit pieces touch nothing within 15 mm"): the bustle corners carry
      // no flank drape. Between the rear cage's corner post (z -3.57) and the flank cage's last post (z -2.85) there is no
      // rail, and the bustle wall stands 0.6 m inboard (x 1.05 to 1.26). The armour probe found nothing to hold the
      // corner drapes, so all but their last station hung on the authored line, a curtain in the air at x 1.87 that was
      // held only by its end column rolled over the flank cage's post, 2.0 cm off it. The roof net and the rear face net
      // still cover the bustle.
      side: [-1, 1].flatMap((side) => ((side > 0 ? [[0.17, 1.05]] : []) as [number, number][]).map(([z0, z1]) => ({
        side, z0, z1,
        topAt: () => 0.93, bottomAt: (z: number) => 0.50 + Math.sin(z * 3.4) * 0.035,
        outAt: (_z: number, t: number) => 1.87 + (1 - t) * 0.03, seed: 307 + side + (z0 > 0 ? 4 : 0) }))),
      // over the bustle's rear cage
      face: [{ z: -3.62, x0: -1.50, x1: 1.50, y0: 0.52, y1: 0.95, nx: 20, ny: 5, seed: 317,
        outline: [[-1.50, 0.52], [1.50, 0.52], [1.50, 0.95], [-1.50, 0.95]] }],
    },
    // two short bound wraps on the tube (radius about 0.10 m): over the sleeve root behind the mantlet and one band
    gun: {
      top: [
        { x0: -0.13, x1: 0.13, z0: 0.62, z1: 1.30, nx: 6, nz: 9, yAt: () => 0.115, seed: 331, tents: [],
          garnishRiseM: 0.05, garnishDensity: 4 },
        { x0: -0.13, x1: 0.13, z0: 2.70, z1: 3.06, nx: 6, nz: 5, yAt: () => 0.12, seed: 333, tents: [],
          garnishRiseM: 0.04, garnishDensity: 4 },
      ],
      side: [-1, 1].flatMap((side) => [
        { side, z0: 0.64, z1: 1.28, topAt: () => 0.10, bottomAt: () => -0.05, outAt: () => 0.12, seed: 337 + side },
        { side, z0: 2.72, z1: 3.04, topAt: () => 0.10, bottomAt: () => -0.05, outAt: () => 0.12, seed: 341 + side },
      ]),
    },
  },
} satisfies Readonly<Record<string, GhillieConfig>>);

// 2026-10-09 (the netting lane): the owner's fleet field nets (ghillieFleetSuits.ts) join the round-5 suits
const GHILLIE_CONFIG_INDEX: Readonly<Record<string, GhillieConfig>> = { ...GHILLIE_SUIT_CONFIGS, ...FLEET_GHILLIE_SUITS };

/**
 * The armour a suit's owner offers its carriers: the owner's own meshes and fittings, never the suit, the decor,
 * another articulation (the turret over the hull, the gun in the turret) or the roof furniture a net is cut round (roof
 * guns, whips), which would tent the net a metre high.
 */
// ---- the field roof cage (push 3b) ---------------------------------------------------------------------------------

/**
 * Main's field roof cage (profiles/fieldRoofCage.ts, push 3b): two hinged lattice wings over the turret's flanks, each
 * on four measured pads, recorded on the turret as [{feet, corners}] per wing (the pads' contact points; the lattice's
 * inner-rear, outer-rear, outer-front and inner-front corners at its tube line).
 *
 * Round 5 (2026-10-08; the lane lead: "the turret-roof net must not pass through the cage bars or legs"; "drape the net
 * over the cage top and let it fall over the wing edges, the way Ukrainian crews hang nets on cope cages. Keep the
 * central hatch, sight and weapon corridor open"; "probing armour only would push the roof net straight through the
 * cage, so read the cage record"): the wings are rebuilt tube by tube from that record, left out of the armour probe,
 * and each carries a net of its own.
 */
interface RoofCageRecord { readonly feet: readonly Point3[]; readonly corners: readonly Point3[] }

/** One tube of a cage, between two points. */
interface CageMember { readonly a: Point3; readonly b: Point3; readonly r: number }

/** Distance from p to a member's axis. */
function memberDistance(m: CageMember, p: readonly number[]): number {
  const ax = m.b[0] - m.a[0], ay = m.b[1] - m.a[1], az = m.b[2] - m.a[2];
  const l2 = ax * ax + ay * ay + az * az || 1e-12;
  const t = THREE.MathUtils.clamp(((p[0] - m.a[0]) * ax + (p[1] - m.a[1]) * ay + (p[2] - m.a[2]) * az) / l2, 0, 1);
  return Math.hypot(p[0] - m.a[0] - ax * t, p[1] - m.a[1] - ay * t, p[2] - m.a[2] - az * t);
}

/**
 * One wing of a roof cage, by the rule fieldRoofCage.ts lays it: a leg from each pad, the frame, a row every 14.5 cm,
 * three stringers, two braces from the outer pads' line up to the outer tube, and the hinge barrels on the inner tube.
 * It is what the wing's net rests on and hangs from.
 */
class CageWing implements SurfaceProbe {
  /** The flank it stands over (+1 left, -1 right). */
  readonly flank: number;
  readonly inner: number;
  readonly outer: number;
  readonly z0: number;
  readonly z1: number;
  /** The lattice's tube line. */
  readonly y: number;
  /** The lattice bucket's tubes. */
  readonly tubes: readonly CageMember[];
  /** The hinge barrels (in the dark bucket). */
  readonly hinges: readonly CageMember[];
  /** Its plan footprint [x0, x1, z0, z1] (owner frame): the lattice and every leg, 6 cm round them. */
  readonly plan: readonly [number, number, number, number];

  constructor(rec: RoofCageRecord) {
    const [c0, c1, c2] = rec.corners;
    this.flank = c0[0] < 0 ? -1 : 1;
    this.inner = Math.abs(c0[0]);
    this.outer = Math.abs(c1[0]);
    this.z0 = Math.min(c0[2], c2[2]);
    this.z1 = Math.max(c0[2], c2[2]);
    this.y = c0[1];
    const { flank: s, inner, outer, z0, z1, y } = this;
    const tubes: CageMember[] = [];
    for (const [x, base, z] of rec.feet) tubes.push({ a: [x, base + 0.01, z], b: [x, y, z], r: 0.021 });
    for (let i = 0; i < 4; i++) tubes.push({ a: rec.corners[i], b: rec.corners[(i + 1) % 4], r: 0.019 });
    const rows = Math.ceil((z1 - z0) / 0.145);
    for (let i = 1; i < rows; i++) {
      const z = z0 + ((z1 - z0) * i) / rows;
      tubes.push({ a: [s * inner, y, z], b: [s * outer, y, z], r: 0.008 });
    }
    for (let i = 1; i < 4; i++) {
      const x = s * (inner + ((outer - inner) * i) / 4);
      tubes.push({ a: [x, y, z0], b: [x, y, z1], r: 0.008 });
    }
    const braceX = Math.max(...rec.feet.map((f) => Math.abs(f[0])));
    for (const z of new Set(rec.feet.map((f) => f[2]))) tubes.push({ a: [s * braceX, y - 0.12, z], b: [s * outer, y, z], r: 0.012 });
    this.tubes = tubes;
    this.hinges = [z0 + 0.22, z1 - 0.22].map((z): CageMember => ({ a: [s * inner, y, z - 0.045], b: [s * inner, y, z + 0.045], r: 0.026 }));
    const xs = [s * inner, s * outer, ...rec.feet.map((f) => f[0])], zs = [z0, z1, ...rec.feet.map((f) => f[2])];
    this.plan = [Math.min(...xs) - 0.06, Math.max(...xs) + 0.06, Math.min(...zs) - 0.06, Math.max(...zs) + 0.06];
  }

  /** True for a point within `margin` of a tube (and, with `hinges`, of a hinge barrel). */
  near(p: readonly number[], margin: number, hinges = true): boolean {
    for (const m of this.tubes) if (memberDistance(m, p) < m.r + margin) return true;
    return hinges && this.nearHinge(p, margin);
  }

  /** True for a point within `margin` of a hinge barrel. */
  nearHinge(p: readonly number[], margin: number): boolean {
    return this.hinges.some((m) => memberDistance(m, p) < m.r + margin);
  }

  /** The highest point of the cage over (x, z), or null over an open cell of its lattice. */
  top(x: number, z: number): number | null {
    let best: number | null = null;
    for (const m of [...this.tubes, ...this.hinges]) {
      const dx = m.b[0] - m.a[0], dz = m.b[2] - m.a[2], l2 = dx * dx + dz * dz;
      let h: number;
      if (l2 < 1e-10) {
        // a leg ends at the tube line
        if (Math.hypot(x - m.a[0], z - m.a[2]) > m.r) continue;
        h = Math.max(m.a[1], m.b[1]);
      } else {
        const t = THREE.MathUtils.clamp(((x - m.a[0]) * dx + (z - m.a[2]) * dz) / l2, 0, 1);
        const d = Math.hypot(x - m.a[0] - dx * t, z - m.a[2] - dz * t);
        if (d > m.r) continue;
        // a sloping brace's tube stands a little taller than its radius over the plan
        const rise = Math.abs(m.b[1] - m.a[1]) / Math.sqrt(l2);
        h = m.a[1] + (m.b[1] - m.a[1]) * t + Math.sqrt(m.r * m.r - d * d) * Math.sqrt(1 + rise * rise);
      }
      if (best === null || h > best) best = h;
    }
    return best;
  }

  topNear(x: number, z: number, r: number, bounds?: readonly [number, number, number, number]): number | null {
    return highestNear((px, pz) => this.top(px, pz), x, z, r, bounds);
  }

  /** The outermost point of the cage on its own flank at height `yy`, station z, as a distance out, or null. */
  side(yy: number, z: number, side: number): number | null {
    if (side !== this.flank) return null;
    let best: number | null = null;
    for (const m of [...this.tubes, ...this.hinges]) {
      if (Math.min(m.a[1], m.b[1]) - m.r > yy || Math.max(m.a[1], m.b[1]) + m.r < yy) continue;
      if (Math.min(m.a[2], m.b[2]) - m.r > z || Math.max(m.a[2], m.b[2]) + m.r < z) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) / 0.004));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const q = m.r * m.r - (m.a[1] + (m.b[1] - m.a[1]) * t - yy) ** 2 - (m.a[2] + (m.b[2] - m.a[2]) * t - z) ** 2;
        if (q < 0) continue;
        const out = side * (m.a[0] + (m.b[0] - m.a[0]) * t) + Math.sqrt(q);
        if (best === null || out > best) best = out;
      }
    }
    return best;
  }

  face(): number | null { return null; }
}

/** The roof cage recorded on a turret (fieldRoofCage.ts), wing by wing; none when absent or malformed. */
/**
 * A turret's drone dock (missionAttachmentReceiver.ts) as a turret-space box, or null. Round 5 (2026-10-08;
 * missionAttachmentReceiver.selftest on ua_m1a1: the dock's crossarms "clear stock"): its arms reach over the roof cloth,
 * so the cloth never rests on them, no stick humps it within half a metre and no garnish stands in its column.
 */
function missionDockOf(turret: THREE.Object3D): THREE.Box3 | null {
  const dock = turret.getObjectByName('turretMissionReceiver');
  if (!dock) return null;
  turret.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(dock);
  return box.isEmpty() ? null : box.applyMatrix4(new THREE.Matrix4().copy(turret.matrixWorld).invert());
}

function cageWingsOf(turret: THREE.Object3D): CageWing[] {
  const record: unknown = turret.userData?.fieldRoofCage;
  if (!Array.isArray(record)) return [];
  const point = (p: unknown): boolean => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v));
  const wings: CageWing[] = [];
  for (const wing of record as Array<{ feet?: unknown; corners?: unknown } | null>) {
    if (!wing || !Array.isArray(wing.corners) || wing.corners.length !== 4 || !wing.corners.every(point)) continue;
    if (!Array.isArray(wing.feet) || !wing.feet.length || !wing.feet.every(point)) continue;
    wings.push(new CageWing(wing as RoofCageRecord));
  }
  return wings;
}

/**
 * The lowest any roof weapon on the turret passes over a point (x, z) as it traverses through its full elevation range
 * (each elevating mass swept round its yaw axis at its depression, level and elevation limits), or +Infinity out of
 * its reach. Round 5 (2026-10-08, push 3b; nationalRoof.selftest: "roof gun intersects ... ghillie_turret_net"): the
 * national roof guns depress to just over the cage's inner tubes, so whatever a wing's net carries under that sweep
 * stays under this floor.
 */
function roofWeaponFloor(turret: THREE.Object3D, vehicleId: string): RoofWeaponFloor {
  const BIN = 0.02;
  turret.updateWorldMatrix(true, true);
  const toTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const sweeps: Array<{ x: number; z: number; floor: Float64Array }> = [];
  const stations: THREE.Object3D[] = [];
  turret.traverse((o) => { if (o.userData?.remoteControlled && o.userData.firingAxis === '+Z') stations.push(o); });
  const v = new THREE.Vector3(), toLocal = new THREE.Matrix4();
  for (const station of stations) {
    const pitch = station.getObjectByName('auxiliaryWeaponPitch');
    if (!pitch) continue;
    const profile = auxiliaryWeaponProfile(Number(station.userData.caliberMm) || 12.7, vehicleId);
    const axis = new THREE.Vector3().setFromMatrixPosition(station.matrixWorld).applyMatrix4(toTurret);
    const floor: number[] = [];
    const saved = pitch.rotation.x;
    for (const elevation of [-profile.depressionRad, 0, profile.elevationRad]) {
      pitch.rotation.x = -elevation;
      pitch.updateWorldMatrix(false, true);
      pitch.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const pos = mesh.isMesh ? mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined : undefined;
        if (!pos) return;
        toLocal.multiplyMatrices(toTurret, mesh.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
          const bin = Math.floor(Math.hypot(v.x - axis.x, v.z - axis.z) / BIN);
          floor[bin] = Math.min(floor[bin] ?? Infinity, v.y);
        }
      });
    }
    pitch.rotation.x = saved;
    pitch.updateWorldMatrix(false, true);
    sweeps.push({ x: axis.x, z: axis.z, floor: Float64Array.from({ length: floor.length }, (_, i) => floor[i] ?? Infinity) });
  }
  // 2026-10-08 (the lane lead, the owner's field standard "weapons clear of cages and nets"): what a roof gun holds still
  // stands in the net's way as it is. A crew gun (a pintle fitting with no elevating station: the PT-91 Twardy's NSVT
  // ran through its roof net) and a station's own base and yaw housing (the SEPv3 CROWS-LP's) each give their lowest
  // point over every raster cell; the swept elevating mass above keeps its sweep.
  const fixed = new Map<string, number>();
  turret.traverse((root) => {
    const gun = root.userData?.fittingRoot && ROOF_GUN_FITTINGS.test(String(root.userData.fitting || ''));
    if (!gun && !(root.userData?.remoteControlled && root.userData.firingAxis === '+Z')) return;
    // a census marker drawn inside authored stock (machineGunGeometry.ts MG_MARKER_SCALE) stands in nothing's way
    if (Number(root.userData.weaponScale) < 0.25 || !root.visible) return;
    const swept = root.getObjectByName('auxiliaryWeaponPitch');
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const pos = mesh.isMesh ? mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined : undefined;
      if (!pos) return;
      for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p === swept || !p.visible) return;
      toLocal.multiplyMatrices(toTurret, mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
        const key = `${Math.floor(v.x / FIXED_BIN)},${Math.floor(v.z / FIXED_BIN)}`;
        fixed.set(key, Math.min(fixed.get(key) ?? Infinity, v.y));
      }
    });
  });
  const standing = (x: number, z: number): number => {
    let low = Infinity;
    if (fixed.size) {
      const i = Math.floor(x / FIXED_BIN), k = Math.floor(z / FIXED_BIN);
      for (let a = i - 1; a <= i + 1; a++) for (let b = k - 1; b <= k + 1; b++) low = Math.min(low, fixed.get(`${a},${b}`) ?? Infinity);
    }
    return low;
  };
  const swept = sweeps.map((sweep) => (x: number, z: number): number => {
    let low = Infinity;
    const bin = Math.floor(Math.hypot(x - sweep.x, z - sweep.z) / BIN);
    for (let k = Math.max(0, bin - 1); k <= Math.min(sweep.floor.length - 1, bin + 1); k++) low = Math.min(low, sweep.floor[k]);
    return low;
  });
  return Object.assign((x: number, z: number): number => {
    let low = standing(x, z);
    for (const floor of swept) low = Math.min(low, floor(x, z));
    return low;
  }, {
    standing,
    parts: swept.length > 1 ? swept.map((floor) => (x: number, z: number): number => Math.min(standing(x, z), floor(x, z))) : [],
  });
}

/**
 * The lowest any roof weapon passes over (x, z): swept stations and standing guns (see roofWeaponFloor). `standing` is
 * the floor of what stands still alone: the crew guns and the stations' bases, as they are built. `parts`, on a roof with
 * more than one station, are the floors the net is cut round one by one (weaponOpenings): each station's sweep, with
 * what stands still.
 */
type RoofWeaponFloor = ((x: number, z: number) => number) & {
  readonly standing: (x: number, z: number) => number;
  readonly parts: ReadonlyArray<(x: number, z: number) => number>;
};

/** The roof guns' fittings (crew pintles and stations) whose standing parts the turret's nets are cut round. */
const ROOF_GUN_FITTINGS = /^(pintleMG|americanM2|americanRws|openYokeRws|weaponStationMount|auxiliaryWeapon)$/;
/** The raster (m) a roof gun's standing parts are binned on. */
const FIXED_BIN = 0.04;

/**
 * Openings a wing's net is cut round: anything of the turret standing up through its lattice (a sight's head), and the
 * part of the wing a roof gun sweeps low over.
 */
function cageOpenings(wing: CageWing, armour: SurfaceProbe | null, gunFloor: (x: number, z: number) => number,
  dock: THREE.Box3 | null = null): Point2[][] {
  const step = 0.04, s = wing.flank;
  const blocked: Array<[number, number]> = [];
  // 2026-10-08 (the lane lead, over push 5's regenerated drone-dock seats): a mission dock seated on the wing holds no
  // cloth; its receiver keeps clear of the wing's net (missionAttachmentReceiver.selftest, t80u_zoria)
  const onDock = (x: number, z: number): boolean => !!dock
    && x >= dock.min.x - 0.02 && x <= dock.max.x + 0.02 && z >= dock.min.z - 0.02 && z <= dock.max.z + 0.02;
  for (let a = wing.inner - 0.06; a <= wing.outer + 0.06; a += step) {
    for (let z = wing.z0 - 0.06; z <= wing.z1 + 0.06; z += step) {
      const t = armour ? armour.top(s * a, z) : null;
      if ((t !== null && t > wing.y - 0.025) || gunFloor(s * a, z) < wing.y + WING_GUN_CLEAR_M || onDock(s * a, z)) blocked.push([s * a, z]);
    }
  }
  return openingsRound(blocked, step);
}

/** Each cluster of blocked cells on a `step` raster, opened with a hand's margin round it. */
function openingsRound(blocked: ReadonlyArray<readonly [number, number]>, step: number): Point2[][] {
  const holes: Point2[][] = [];
  const taken = new Uint8Array(blocked.length);
  for (let i = 0; i < blocked.length; i++) {
    if (taken[i]) continue;
    taken[i] = 1;
    let x0 = blocked[i][0], x1 = x0, z0 = blocked[i][1], z1 = z0;
    for (const stack = [i]; stack.length;) {
      const [x, z] = blocked[stack.pop()!];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      for (let j = 0; j < blocked.length; j++) {
        if (taken[j] || Math.abs(blocked[j][0] - x) > step * 1.5 || Math.abs(blocked[j][1] - z) > step * 1.5) continue;
        taken[j] = 1;
        stack.push(j);
      }
    }
    holes.push(rect(x0 - 0.05, x1 + 0.05, z0 - 0.05, z1 + 0.05));
  }
  return holes;
}

/**
 * Openings a turret roof net is cut round under a roof gun: where the net, its rolled edges and its garnish cannot pass
 * under the gun's swept floor (round 5, 2026-10-08: the Leopard 2A6 UA's draped roof net ran over the aft station's
 * pedestal, 13 cm into its traverse at full depression).
 *
 * 2026-10-16 (integ/226 triage; VH.14 made the Leopard 2A4's loader MG3 a working station): on a roof with more than
 * one station the net is cut round each station's sweep (with what stands still) one by one. One cut round all of them
 * took the box round their joined sweeps, and the MG3's beside the FLW 200's bared the whole crown (leopard2A4Ghillie).
 * A scrap the separate cuts would leave inside the joined cut, cut free of the rest of the net between two openings and
 * the panel's edge, goes with the cut: it hangs on nothing (ghillieSuit: the M1A2 UA's cage-top net between the
 * commander's and the loader's sweeps).
 */
function weaponOpenings(panel: TopPanel, probe: SurfaceProbe | null, gunFloor: (x: number, z: number) => number): Point2[][] {
  const whole = sweptOpenings(panel, probe, gunFloor);
  const parts = (gunFloor as Partial<RoofWeaponFloor>).parts;
  if (!whole.length || !parts || parts.length < 2) return whole;
  const each = parts.flatMap((part) => sweptOpenings(panel, probe, part));
  return [...each, ...openingScraps(panel, whole, each)];
}

/** The cells of a panel where the roof weapons' floor (or one part of it) stands too low over it, opened round. */
function sweptOpenings(panel: TopPanel, probe: SurfaceProbe | null, gunFloor: (x: number, z: number) => number): Point2[][] {
  const step = 0.04;
  const blocked: Array<[number, number]> = [];
  for (let x = panel.x0; x <= panel.x1 + 1e-9; x += step) {
    for (let z = panel.z0; z <= panel.z1 + 1e-9; z += step) {
      const floor = gunFloor(x, z);
      if (!Number.isFinite(floor)) continue;
      const under = Math.max(probe?.top(x, z) ?? -Infinity, panel.yAt(x, z));
      if (floor < under + WING_GUN_CLEAR_M) blocked.push([x, z]);
    }
  }
  return openingsRound(blocked, step);
}

/**
 * The cloth the separate openings `each` leave inside the joined openings `whole` that no longer joins the panel's
 * cloth outside them (on a `step` raster, through edge-sharing cells, inside the panel's outline and round its own
 * holes), opened round as weaponOpenings's scraps.
 */
function openingScraps(panel: TopPanel, whole: readonly Point2[][], each: readonly Point2[][]): Point2[][] {
  const step = 0.04;
  const nx = Math.floor((panel.x1 - panel.x0) / step + 1e-9) + 1, nz = Math.floor((panel.z1 - panel.z0) / step + 1e-9) + 1;
  const cloth = new Uint8Array(nx * nz), joined = new Uint8Array(nx * nz);
  const stack: number[] = [];
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = panel.x0 + i * step, z = panel.z0 + k * step;
      if (panel.outline && !insidePoly(x, z, panel.outline)) continue;
      if (panel.holes?.some((hole) => insidePoly(x, z, hole)) || each.some((hole) => insidePoly(x, z, hole))) continue;
      const c = i * nz + k;
      cloth[c] = 1;
      if (!whole.some((hole) => insidePoly(x, z, hole))) { joined[c] = 1; stack.push(c); }
    }
  }
  while (stack.length) {
    const c = stack.pop()!, i = Math.floor(c / nz), k = c - i * nz;
    for (const [a, b] of [[i - 1, k], [i + 1, k], [i, k - 1], [i, k + 1]]) {
      if (a < 0 || a >= nx || b < 0 || b >= nz) continue;
      const n = a * nz + b;
      if (cloth[n] && !joined[n]) { joined[n] = 1; stack.push(n); }
    }
  }
  const scraps: Array<[number, number]> = [];
  for (let c = 0; c < cloth.length; c++) {
    if (cloth[c] && !joined[c]) scraps.push([panel.x0 + Math.floor(c / nz) * step, panel.z0 + (c % nz) * step]);
  }
  return openingsRound(scraps, step);
}

/**
 * A roof-cage wing's net: thrown over its lattice (resting on the tubes and sagging a little between them, cut round
 * anything standing up through it), rolled over the outer tube and hanging down that flank, its hem stopping short of
 * whatever stands outboard below (the turret's side screens and their nets). The inner tube is its edge: nothing tied
 * to it reaches in over the hatch, sight and weapon corridor between the wings.
 */
/** A wing's net (and its rolled edges) stays this far under a roof gun's swept floor, or is cut away there. */
const WING_GUN_CLEAR_M = 0.1;

function cageWingCloths(wing: CageWing, index: number, cfg: GhillieConfig, armour: SurfaceProbe | null, uvk: number,
  gunFloor: (x: number, z: number) => number, dock: THREE.Box3 | null = null): ClothSurface[] {
  const s = wing.flank, seed = cfg.seed + 7919 * (index + 1);
  // a wing a roof gun traverses low over is left bare for it (more than a third of its lattice under the sweep)
  let swept = 0, samples = 0;
  for (let a = wing.inner + 0.03; a < wing.outer; a += 0.06) {
    for (let z = wing.z0 + 0.03; z < wing.z1; z += 0.06) { samples++; if (gunFloor(s * a, z) < wing.y + WING_GUN_CLEAR_M) swept++; }
  }
  if (swept > samples / 3) return [];
  let laid: TopCloth | null = null;
  const support: OwnerSupport = {
    probe: wing, hull: false, owner: 'turret', fitted: false, turretless: false, hemFloor: -Infinity,
    roof: (x, z) => (laid && laid.covers(x, z) ? laid.heightAt(x, z) : null),
  };
  const xa = s * (wing.inner - 0.012), xb = s * (wing.outer + 0.02);
  laid = topCloth({
    x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: wing.z0 - 0.015, z1: wing.z1 + 0.015,
    nx: Math.max(4, Math.round((wing.outer - wing.inner) / 0.08)), nz: Math.max(8, Math.round((wing.z1 - wing.z0) / 0.08)),
    yAt: () => wing.y + 0.008 + DRAPE_GAP_M, holes: cageOpenings(wing, armour, gunFloor, dock), seed, tents: [],
    garnishRiseM: 0.12, garnishOpeningMarginM: 0.07, reliefScale: 0.6, rimScale: 0.35, restOnProbeM: FITTED_GAP_M,
  }, cfg, support, uvk);
  // the highest thing standing outboard of the outer tube's line below it at a station (a side screen's top rail)
  const below = (z: number): number => {
    if (armour) {
      for (let yy = wing.y - 0.03; yy > wing.y - 0.6; yy -= 0.02) {
        const o = armour.side(yy, z, s);
        if (o !== null && o > wing.outer - 0.03) return yy;
      }
    }
    return -Infinity;
  };
  const hung = sideCloth({
    side: s, z0: wing.z0 + 0.01, z1: wing.z1 - 0.01, seed: seed + 3,
    topAt: () => wing.y + 0.03,
    // sideCloth reads its hem a phase along the flank; the clearance is taken at the station itself
    bottomAt: (zq) => {
      const z = zq - s * HEM_PHASE_M;
      return Math.max(wing.y - 0.25 - 0.05 * (0.5 + 0.5 * Math.sin(z * 4.3 + index * 1.7)), below(z) + 0.09);
    },
    outAt: () => wing.outer + 0.035,
    // it comes over the outer tube from the net's edge just inside it, wherever the net is cut further in
    shoulder: { z0: wing.z0, z1: wing.z1, inAt: () => wing.outer - 0.03, yAt: () => wing.y + 0.03 },
  }, cfg, support, uvk, null, dock);
  // garnish never reaches into a tube or in over the corridor: over the frame it stays above the tubes' tops (a strip
  // drooping off the wing's front edge passed through its frame tube between two of its points), and the drape's
  // garnish stays outside the outer tube
  const high = (p: readonly number[]): boolean => p[1] > wing.y + 0.035;
  const within = (p: readonly number[]): boolean => s * p[0] > wing.inner + 0.03 && s * p[0] < wing.outer - 0.03
    && p[2] > wing.z0 + 0.03 && p[2] < wing.z1 - 0.03;
  const tied = (surface: ClothSurface, keep: (p: readonly number[]) => boolean): ClothSurface => ({
    ...surface,
    cardOk: (p) => surface.cardOk(p) && keep(p) && !wing.near(p, 0.004) && p[1] < gunFloor(p[0], p[2]) - 0.02,
  });
  return [
    tied(laid, (p) => (within(p) || high(p)) && s * p[0] > wing.inner - 0.02),
    tied(hung, (p) => s * p[0] > wing.outer + 0.02 || high(p)),
  ];
}

// ---- the working vehicle's clearances (the netting lane, 2026-10-09; GhillieConfig.fieldClearanceM) ------------------

/** Radial bins (m) of the turret-sweep envelopes. */
const SWEEP_BIN_M = 0.02;
/** How far a lens sees clear (m) and the tangent of its view's half-angle (22 degrees). */
const LENS_REACH_M = 2.0;
const LENS_TAN = Math.tan(22 * Math.PI / 180);
/** The yaw offsets (rad) a point near the trunnion is tested at besides the ones that bring the gun across it. */
const NEAR_YAWS = [-150, -120, -90, -60, -40, -20, 20, 40, 60, 90, 120, 150, 180].map((d) => d * Math.PI / 180);
/** The step (m, across the bore) between the turret yaws that bring the gun's box over a hull point. */
const GUN_STEP_M = 0.03;
/** Heights over and under a deck point (m): the bare gun reaching any exempts the cloth lying flat on that deck. */
const FLAT_PROBES = [0.04, 0, -0.05, -0.1, -0.2, -0.3];
/** A cloth's view cone off a lens: its reach (m) and the tangent of its half-angle (25 degrees). */
const CLOTH_LENS_REACH_M = 1.0;
const CLOTH_LENS_TAN = Math.tan(25 * Math.PI / 180);
/** The fix round's field garnish view (FieldClearance.fieldLinesOk): clear ahead of a glass to 0.85 m (the coordinator:
 * nothing inside a sight's view cone, which the audit takes 0.8 m out); to 1.6 m, below 10 degrees under the line of
 * sight. */
const FIELD_LENS_NEAR_M = 0.85;
const FIELD_LENS_REACH_M = 1.6;
const FIELD_LENS_BELOW_TAN = Math.tan(10 * Math.PI / 180);
/** How far ahead of a sideways- or forward-looking lens a roof net is slotted open (m); a fleet field net's (fix round). */
const LENS_SLOT_M = 0.8;
const FIELD_LENS_SLOT_M = 0.4;
/** Half the side of an open cradle's receiving column the suit keeps clear (m; the receipt rays 2.5 cm round each station). */
const CRADLE_KEEP_M = 0.08;
/** How far a smoke discharger's grenade line is kept clear (m), and its half-width at the mouth (m). */
const SMOKE_REACH_M = 1.6;
const SMOKE_LINE_M = 0.1;

/**
 * Owner-frame triangles of an owner's own visible meshes (another articulation's, suits, decor, proxies, a LOD's
 * coarse levels and whatever `include` refuses left out), flattened as [ax, ay, az, bx, by, bz, cx, cy, cz] runs.
 */
function ownerTriangles(parent: THREE.Object3D, others: readonly THREE.Object3D[], frame: THREE.Object3D,
  include: (mesh: THREE.Mesh) => boolean): Float32Array {
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const out: number[] = [];
  const walk = (o: THREE.Object3D): void => {
    if (o.visible === false || others.includes(o)) return;
    if (/procShadow|InteriorFill|^rig_decor|vehicleMarking/.test(o.name || '')) return;
    if ((o as THREE.LOD).isLOD) { const first = (o as THREE.LOD).levels[0]?.object; if (first) walk(first); return; }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.attributes?.position && include(mesh)) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material && material.visible !== false && material.colorWrite !== false) {
        m.multiplyMatrices(inv, mesh.matrixWorld);
        const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, index = mesh.geometry.index;
        const n = index ? index.count : pos.count;
        for (let k = 0; k + 2 < n; k += 3) for (let j = 0; j < 3; j++) {
          v.fromBufferAttribute(pos, index ? index.getX(k + j) : k + j).applyMatrix4(m);
          out.push(v.x, v.y, v.z);
        }
      }
    }
    for (const child of o.children) walk(child);
  };
  for (const child of parent.children) walk(child);
  return Float32Array.from(out);
}

/**
 * Every surface point of a triangle soup a clearance needs: each edge sampled `cell / 2` apart (walls and long thin
 * runs, a barrel's, have no plan area) and the plan view rasterised at `cell` centres with the triangle's height there.
 */
function forTrianglePoints(tri: Float32Array, cell: number, visit: (x: number, y: number, z: number) => void): void {
  const half = cell / 2;
  const p = [0, 0, 0];
  for (let t = 0; t < tri.length; t += 9) {
    for (let e = 0; e < 3; e++) {
      const o = t + e * 3, q = t + ((e + 1) % 3) * 3;
      const len = Math.hypot(tri[q] - tri[o], tri[q + 1] - tri[o + 1], tri[q + 2] - tri[o + 2]);
      const n = Math.max(1, Math.ceil(len / half));
      for (let k = 0; k < n; k++) {
        const u = k / n;
        visit(tri[o] + (tri[q] - tri[o]) * u, tri[o + 1] + (tri[q + 1] - tri[o + 1]) * u, tri[o + 2] + (tri[q + 2] - tri[o + 2]) * u);
      }
    }
    // the face rasterised in the plane it is broadest in (a wall in yz or xy, a deck in xz)
    const ex = tri[t + 3] - tri[t], ey = tri[t + 4] - tri[t + 1], ez = tri[t + 5] - tri[t + 2];
    const fx = tri[t + 6] - tri[t], fy = tri[t + 7] - tri[t + 1], fz = tri[t + 8] - tri[t + 2];
    const nx = Math.abs(ey * fz - ez * fy), ny = Math.abs(ez * fx - ex * fz), nz = Math.abs(ex * fy - ey * fx);
    // axes (a, b) span the plane, c is the one solved for
    const [a, b, c] = ny >= nx && ny >= nz ? [0, 2, 1] : nx >= nz ? [1, 2, 0] : [0, 1, 2];
    const A0 = tri[t + a], B0 = tri[t + b], A1 = tri[t + 3 + a], B1 = tri[t + 3 + b], A2 = tri[t + 6 + a], B2 = tri[t + 6 + b];
    const d = (B1 - B2) * (A0 - A2) + (A2 - A1) * (B0 - B2);
    if (Math.abs(d) < 1e-9) continue;
    const i0 = Math.ceil(Math.min(A0, A1, A2) / cell), i1 = Math.floor(Math.max(A0, A1, A2) / cell);
    const j0 = Math.ceil(Math.min(B0, B1, B2) / cell), j1 = Math.floor(Math.max(B0, B1, B2) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ua = i * cell, ub = j * cell;
      const l0 = ((B1 - B2) * (ua - A2) + (A2 - A1) * (ub - B2)) / d, l1 = ((B2 - B0) * (ua - A2) + (A0 - A2) * (ub - B2)) / d;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      p[a] = ua; p[b] = ub; p[c] = l0 * tri[t + c] + l1 * tri[t + 3 + c] + l2 * tri[t + 6 + c];
      visit(p[0], p[1], p[2]);
    }
  }
}

const notGear = (mesh: THREE.Mesh): boolean => mesh.userData?.runningGear !== true && !RUNNING_GEAR_RE.test(mesh.name || '');
/** The netting lane: the running gear a suit keeps off (the wheels, tracks and their run; never a fender, trim or skirt). */
const keptOffGear = (mesh: THREE.Mesh): boolean => mesh.userData?.runningGear === true
  || (RUNNING_GEAR_RE.test(mesh.name || '') && !/trim|guard|fender|skirt|cover|spare|fitting/i.test(mesh.name || ''));
const notSuit = (mesh: THREE.Mesh): boolean => !/_ghillie_/.test(mesh.name || '');

/**
 * An owner's lenses as flat [cx, cy, cz, nx, ny, nz] runs (owner frame): each Glass component's centre and the face it
 * looks out of, the one a 6 cm ray from the centre leaves without meeting its housing (both or neither: the face turned
 * out from the owner's axis and up).
 */
function ownerLenses(parent: THREE.Object3D, others: readonly THREE.Object3D[]): Float64Array {
  const glass = ownerTriangles(parent, others, parent, (mesh) => notSuit(mesh) && /Glass$/.test(mesh.name || ''));
  if (!glass.length) return new Float64Array(0);
  const solid = ownerTriangles(parent, others, parent, (mesh) => notSuit(mesh) && !/Glass$/.test(mesh.name || ''));
  // the housing triangles hashed on a 0.2 m grid by their boxes, for short rays near each lens
  const CELL = 0.2, cells = new Map<string, number[]>();
  for (let t = 0; t < solid.length; t += 9) {
    const x0 = Math.floor(Math.min(solid[t], solid[t + 3], solid[t + 6]) / CELL), x1 = Math.floor(Math.max(solid[t], solid[t + 3], solid[t + 6]) / CELL);
    const y0 = Math.floor(Math.min(solid[t + 1], solid[t + 4], solid[t + 7]) / CELL), y1 = Math.floor(Math.max(solid[t + 1], solid[t + 4], solid[t + 7]) / CELL);
    const z0 = Math.floor(Math.min(solid[t + 2], solid[t + 5], solid[t + 8]) / CELL), z1 = Math.floor(Math.max(solid[t + 2], solid[t + 5], solid[t + 8]) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 400) continue;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const key = `${x},${y},${z}`;
      const list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
  const ray = new THREE.Ray(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const housed = (o: THREE.Vector3, d: THREE.Vector3): boolean => {
    ray.set(o, d);
    const key = `${Math.floor(o.x / CELL)},${Math.floor(o.y / CELL)},${Math.floor(o.z / CELL)}`;
    const seen = new Set<number>();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const [kx, ky, kz] = key.split(',').map(Number);
      for (const t of cells.get(`${kx + dx},${ky + dy},${kz + dz}`) ?? []) {
        if (seen.has(t)) continue;
        seen.add(t);
        a.set(solid[t], solid[t + 1], solid[t + 2]); b.set(solid[t + 3], solid[t + 4], solid[t + 5]); c.set(solid[t + 6], solid[t + 7], solid[t + 8]);
        if (ray.intersectTriangle(a, b, c, false, hit) && hit.distanceTo(o) < 0.06) return true;
      }
    }
    return false;
  };
  // components of the glass by welded corners
  const count = glass.length / 9;
  const parentOf = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => { while (parentOf[i] !== i) { parentOf[i] = parentOf[parentOf[i]]; i = parentOf[i]; } return i; };
  const weld = new Map<string, number>();
  for (let t = 0; t < count; t++) for (let j = 0; j < 3; j++) {
    const o = t * 9 + j * 3;
    const key = `${Math.round(glass[o] / 0.003)},${Math.round(glass[o + 1] / 0.003)},${Math.round(glass[o + 2] / 0.003)}`;
    const w = weld.get(key);
    if (w === undefined) weld.set(key, t); else parentOf[find(t)] = find(w);
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < count; t++) { const r = find(t); const g = groups.get(r); if (g) g.push(t); else groups.set(r, [t]); }
  const out: number[] = [];
  const tri = new THREE.Triangle(), mid = new THREE.Vector3(), nrm = new THREE.Vector3();
  const setTri = (t: number): THREE.Triangle => {
    const o = t * 9;
    return tri.set(a.set(glass[o], glass[o + 1], glass[o + 2]), b.set(glass[o + 3], glass[o + 4], glass[o + 5]), c.set(glass[o + 6], glass[o + 7], glass[o + 8]));
  };
  for (const group of groups.values()) {
    const center = new THREE.Vector3(), dir = new THREE.Vector3(), main = new THREE.Vector3();
    let area = 0, big = 0;
    for (const t of group) {
      const ar = setTri(t).getArea();
      if (ar < 1e-9) continue;
      center.addScaledVector(tri.getMidpoint(mid), ar);
      area += ar;
      if (ar > big) { big = ar; tri.getNormal(main); }
    }
    // the lens axis: the pane's broad faces only (its thin edges would tilt it), folded together; its sign chosen below
    for (const t of group) {
      const ar = setTri(t).getArea();
      if (ar < 1e-9) continue;
      tri.getNormal(nrm);
      if (Math.abs(nrm.dot(main)) < 0.8) continue;
      if (nrm.dot(main) < 0) nrm.negate();
      dir.addScaledVector(nrm, ar);
    }
    if (area < 1e-6 || dir.lengthSq() < 1e-12) continue;
    center.divideScalar(area);
    dir.normalize();
    const fwd = housed(center, dir), back = housed(center, dir.clone().negate());
    const outward = new THREE.Vector3(center.x, 0, center.z).normalize().add(new THREE.Vector3(0, 0.5, 0));
    const n = fwd && !back ? dir.negate() : !fwd && back ? dir : dir.dot(outward) >= 0 ? dir : dir.negate();
    out.push(center.x, center.y, center.z, n.x, n.y, n.z);
  }
  return Float64Array.from(out);
}

/**
 * An owner's smoke discharger mouths and lines of fire as flat [px, py, pz, dx, dy, dz] runs (owner frame), each bank's
 * as the factory will align it after the suit is built (vehicleAuxiliaryGeometry.ts alignSmokeBanks: a bank whose
 * outside tubes turn past 1.35 rad of the bow is turned back about the owner's vertical through its own origin).
 */
function ownerSmokeLines(parent: THREE.Object3D, others: readonly THREE.Object3D[]): Float64Array {
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const out: number[] = [];
  const banks: Array<{ x: number; z: number; rows: number[] }> = [];
  const p = new THREE.Vector3(), d = new THREE.Vector3(), m = new THREE.Matrix4();
  const walk = (o: THREE.Object3D, bank: { x: number; z: number; rows: number[] } | null): void => {
    if (others.includes(o)) return;
    let mine = bank;
    if (o.userData?.fittingRoot && o.userData.fitting === 'smokeBank') {
      p.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
      mine = { x: p.x, z: p.z, rows: [] };
      banks.push(mine);
    }
    const sockets = o.userData?.smokeSockets as Array<{ position: number[]; direction: number[] }> | undefined;
    if (Array.isArray(sockets)) {
      m.multiplyMatrices(inv, o.matrixWorld);
      for (const s of sockets) {
        p.fromArray(s.position).applyMatrix4(m);
        d.fromArray(s.direction).transformDirection(m);
        (mine ? mine.rows : out).push(p.x, p.y, p.z, d.x, d.y, d.z);
      }
    }
    for (const child of o.children) walk(child, mine);
  };
  for (const child of parent.children) walk(child, null);
  for (const bank of banks) {
    const rows = bank.rows;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < rows.length; i += 6) {
      const yaw = Math.atan2(rows[i + 3], rows[i + 5]);
      min = Math.min(min, yaw); max = Math.max(max, yaw);
    }
    const delta = max > 1.35 ? 1.35 - max : min < -1.35 ? -1.35 - min : 0;
    const c = Math.cos(delta), sn = Math.sin(delta);
    for (let i = 0; i < rows.length; i += 6) {
      const px = rows[i] - bank.x, pz = rows[i + 2] - bank.z, dx = rows[i + 3], dz = rows[i + 5];
      out.push(bank.x + c * px + sn * pz, rows[i + 1], bank.z - sn * px + c * pz, c * dx + sn * dz, rows[i + 4], -sn * dx + c * dz);
    }
  }
  return Float64Array.from(out);
}

interface FieldClearance {
  /**
   * A suit point of this owner (owner-local) keeps the vehicle's working clearances. `garnish`: a garnish point, which
   * keeps out of the gun's whole swept volume (full depression included) even over a deck the bare gun already reaches;
   * only the cloth may lie flat there.
   */
  netOk(owner: GhillieOwner, p: readonly number[], garnish?: boolean): boolean;
  /** And a cloth point keeps the smoke dischargers' lines of fire clear besides. */
  clothOk(owner: GhillieOwner, p: readonly number[]): boolean;
  /** And a garnish point keeps the lens views and smoke lines clear besides. */
  garnishOk(owner: GhillieOwner, p: readonly number[]): boolean;
  /** Only the thin lines: a point outside every lens view and smoke line of the owner. */
  linesOk(owner: GhillieOwner, p: readonly number[]): boolean;
  /**
   * The fix round's field garnish: the lens views as a crew keeps them on a camouflaged vehicle (nothing within 85 cm in
   * front of any glass; beyond, to 1.6 m, a bough may stand only lower than 10 degrees under the line of sight), the
   * smoke lines and the dock as linesOk.
   */
  fieldLinesOk(owner: GhillieOwner, p: readonly number[]): boolean;
  /** The plan squares [x0, x1, z0, z1] (owner frame) no part of a garnish card may cross: an open cradle's columns. */
  keepColumns(owner: GhillieOwner): ReadonlyArray<readonly [number, number, number, number]>;
  /** A cloth point standing off its armour outside every lens's view (a shorter, wider cone than the garnish's). */
  lensClear(owner: GhillieOwner, p: readonly number[]): boolean;
  /** The lowest a turret drape's hem may hang at turret-local (x, z). */
  turretHemFloor(x: number, z: number): number;
  /** Adds the hull's own suit (laid by now) to the hull's top envelope the turret's suit clears. */
  addHullSuit(): void;
}

/**
 * What a field suit keeps round the drone dock (m): the decor's 3 cm (decorations.ts DOCK_KEEP_OUT_CLEAR) and 2 cm for a
 * cloth roll's lift and a card's spray.
 */
export const SUIT_DOCK_CLEAR_M = 0.05;

/**
 * The drone dock a field suit keeps clear (2026-10-12, cam-netting: replaces the netting lane's hand-copied boxes, which
 * went stale whenever a seat moved and read a scaled turret's seat in the rig's scaled units): the vehicle's own seat
 * record (missionDockSeats.generated.ts, the one the decor's keep-out reads), as two boxes in the seat's frame, the
 * union of the cradle's solids and the union of the parked airframe with its launch column, each grown by
 * SUIT_DOCK_CLEAR_M (one clean opening the dock stands in, no slivers of net between its feet). A turret seat's frame
 * is the turret rig without its own scale and a hull seat's the vehicle root without its own, as the seat generator
 * measures them (tools/mission-attachment-geometry.mjs collectMissionStock). Empty without a seat record.
 */
export function suitDockBoxes(specId: string): { frame: 'turret' | 'hull'; boxes: THREE.Box3[] } | null {
  const seat = MISSION_DOCK_SEATS[specId];
  if (!seat) return null;
  const at = new THREE.Vector3(seat.x, seat.y, seat.z);
  const union = (volumes: ReadonlyArray<{ min: readonly number[]; max: readonly number[] }>): THREE.Box3 => {
    const box = new THREE.Box3();
    for (const v of volumes) box.union(new THREE.Box3(new THREE.Vector3(v.min[0], v.min[1], v.min[2]), new THREE.Vector3(v.max[0], v.max[1], v.max[2])));
    return box.translate(at).expandByScalar(SUIT_DOCK_CLEAR_M);
  };
  return { frame: seat.frame === 'turret' ? 'turret' : 'hull', boxes: [union(missionCradleVolumes(seat)), union(missionAirframeVolumes(seat, true))] };
}

/**
 * The main gun's continuous envelope as the UA protection receipt draws it (GhillieConfig.conservativeGunEnvelope): its
 * lowest reach (turret frame) by 5 cm radius bin from the turret's axis, over every yaw, full depression to full
 * elevation (and the recoil kick), each 10 cm slice of the gun's own geometry boxed in the gun's frame, the recoil parts
 * run back by their stroke. Ported verbatim from fullMainGunEnvelope so the suit and its receipt agree.
 */
function gunEnvelopeFloor(P: GhillieBuilderPort): Map<number, number> {
  const turret = P.turretG, gun = P.gunG;
  turret.updateWorldMatrix(true, true);
  const turretInverse = turret.matrixWorld.clone().invert(), gunInverse = gun.matrixWorld.clone().invert();
  const cells: THREE.Box3[] = [], step = 0.1, caliber = P.spec.gun?.caliberMm ?? 120;
  const v = new THREE.Vector3();
  gun.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.presentationInvisible || /_ghillie_/.test(mesh.name || '')) return;
    const mat = mesh.material as THREE.Material;
    if ((mat as THREE.MeshBasicMaterial)?.colorWrite === false) return;
    let recoil = false;
    for (let q: THREE.Object3D | null = mesh; q; q = q.parent) {
      if (!q.visible) return;
      if (q.name === 'rig_recoil' || q.name.startsWith('rig_barrel_')) recoil = true;
      if (q === gun) break;
    }
    const matrix = gunInverse.clone().multiply(mesh.matrixWorld), pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const index = mesh.geometry.index, bins = new Map<number, THREE.Box3>();
    for (let i = 0; i + 2 < (index?.count ?? pos.count); i += 3) {
      const box = new THREE.Box3();
      for (let k = 0; k < 3; k++) box.expandByPoint(v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
      for (let z = Math.floor(box.min.z / step); z <= Math.floor(box.max.z / step); z++) {
        const slice = box.clone(); slice.min.z = Math.max(slice.min.z, z * step); slice.max.z = Math.min(slice.max.z, (z + 1) * step);
        const had = bins.get(z);
        if (had) had.union(slice); else bins.set(z, slice);
      }
    }
    const stroke = Math.max(Math.min(0.24, Math.max(0.06, 0.13 * caliber / 120)), Math.min(0.085, Math.max(0.055, caliber * 0.0022)));
    for (const box of bins.values()) {
      if (recoil) box.min.z -= stroke;
      cells.push(box.applyMatrix4(new THREE.Matrix4().makeScale(gun.scale.x, gun.scale.y, gun.scale.z)));
    }
  });
  const deg = Math.PI / 180;
  const low = -(P.spec.gunDepressionDeg ?? 8) * deg, high = (P.spec.gunElevationDeg ?? 18) * deg + 0.014;
  const steps = Math.ceil((high - low) / (0.5 * deg)), delta = (high - low) / steps;
  const parent = turretInverse.clone().multiply(gun.parent!.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(gun.position.x, gun.position.y, gun.position.z));
  const floor = new Map<number, number>();
  const rot = new THREE.Matrix4(), euler = new THREE.Euler();
  for (const box of cells) {
    const radius = Math.hypot(...(['x', 'y', 'z'] as const).map((a) => Math.max(Math.abs(box.min[a]), Math.abs(box.max[a]))));
    const pose = (a: number): THREE.Box3 => box.clone().applyMatrix4(rot.makeRotationFromEuler(euler.set(-a, gun.rotation.y, gun.rotation.z, gun.rotation.order)));
    for (let i = 0; i < steps; i++) {
      const b = pose(low + i * delta).union(pose(low + (i + 1) * delta));
      b.expandByScalar(radius * (1 - Math.cos(delta / 2)) + 0.00001).applyMatrix4(parent);
      const near = (a: 'x' | 'z'): number => (b.min[a] > 0 ? b.min[a] : b.max[a] < 0 ? -b.max[a] : 0);
      const far = (a: 'x' | 'z'): number => Math.max(Math.abs(b.min[a]), Math.abs(b.max[a]));
      const r0 = Math.hypot(near('x'), near('z')), r1 = Math.hypot(far('x'), far('z'));
      for (let k = Math.floor(r0 / 0.05); k <= Math.floor(r1 / 0.05); k++) floor.set(k, Math.min(floor.get(k) ?? Infinity, b.min.y));
    }
  }
  return floor;
}

function fieldClearance(P: GhillieBuilderPort, clearance: number, conservativeGun = false): FieldClearance {
  const hull = P.hullG, turret = P.turretG, gun = P.gunG;
  // the rigs may be siblings under the vehicle's root: bring every frame up to date before reading any
  for (const g of [hull, turret, gun]) g.updateWorldMatrix(true, true);
  const toHull = new THREE.Matrix4().copy(hull.matrixWorld).invert();
  // the drone dock's keep-out boxes (suitDockBoxes) brought from the seat's frame into the owner's space corner by corner
  // (the rigs carry no rotation at the build; a scaled turret rig's own scale divides back out)
  const dock = suitDockBoxes(P.spec.id);
  const dockOwner: GhillieOwner | null = dock ? dock.frame : null;
  const dockBoxes: THREE.Box3[] = [];
  if (dock) {
    const frame = dock.frame === 'turret' ? turret : (hull.parent ?? hull), group = dock.frame === 'turret' ? turret : hull;
    frame.updateWorldMatrix(true, false);
    const sc = frame.scale;
    const seatToOwner = new THREE.Matrix4().copy(group.matrixWorld).invert()
      .multiply(frame.matrixWorld).multiply(new THREE.Matrix4().makeScale(1 / sc.x, 1 / sc.y, 1 / sc.z));
    for (const box of dock.boxes) dockBoxes.push(box.clone().applyMatrix4(seatToOwner));
  }
  const dockPoint = new THREE.Vector3();
  // an open cradle's declared trunnion receiving stations (turret frame), whose columns the suit keeps clear
  const cradleStations: ReadonlyArray<readonly number[]> = (turret.userData?.gunCradleSeats?.stations ?? [])
    .filter((point: unknown) => Array.isArray(point) && point.length === 3);
  const inDock = (owner: GhillieOwner, p: readonly number[]): boolean => {
    if (owner !== dockOwner) return false;
    dockPoint.set(p[0], p[1], p[2]);
    for (const box of dockBoxes) if (box.containsPoint(dockPoint)) return true;
    return false;
  };
  const pivot = new THREE.Vector3().setFromMatrixPosition(turret.matrixWorld).applyMatrix4(toHull);
  // what the turret and the hull each occupy through the traverse, by radius from the turret's axis and height in the
  // turret's frame (2 cm cells, -2 m to 4 m): a suit point of one is refused where the other occupies its cell or a
  // neighbour within the clearance, so a drape clears the deck under it but a frame standing over the turret takes away
  // nothing beneath it
  const R_BINS = Math.ceil(6 / SWEEP_BIN_M), Y_BINS = Math.ceil(6 / SWEEP_BIN_M), Y_BASE = -2;
  const turretOcc = new Uint8Array(R_BINS * Y_BINS), hullOcc = new Uint8Array(R_BINS * Y_BINS);
  const cellOf = (r: number, yT: number): number => {
    const i = Math.floor(r / SWEEP_BIN_M), j = Math.floor((yT - Y_BASE) / SWEEP_BIN_M);
    return i < 0 || j < 0 || i >= R_BINS || j >= Y_BINS ? -1 : i * Y_BINS + j;
  };
  const mark = (occ: Uint8Array, x: number, y: number, z: number): void => {
    const k = cellOf(Math.hypot(x - pivot.x, z - pivot.z), y - pivot.y);
    if (k >= 0) occ[k] = 1;
  };
  // 3 cm samples (the fix round's audit on the T-90M: at 6 cm the turret's front lower face read 5 cm higher than it
  // reaches, and a bough under its edge stood inside its sweep)
  forTrianglePoints(ownerTriangles(turret, [gun], hull, notSuit), 0.03, (x, y, z) => mark(turretOcc, x, y, z));
  // and the span the turret reaches at each radius through the traverse, lowest cell to highest: a hull point between
  // them lies inside its swept body, its hollow included (a deck plate running on under the turret's floor), not only
  // beside its skin
  const turretLo = new Int32Array(R_BINS).fill(Y_BINS), turretHi = new Int32Array(R_BINS).fill(-1);
  for (let i = 0; i < R_BINS; i++) {
    for (let j = 0; j < Y_BINS; j++) {
      if (!turretOcc[i * Y_BINS + j]) continue;
      if (j < turretLo[i]) turretLo[i] = j;
      turretHi[i] = j;
    }
  }
  // the hull's own top over its plan (hull frame, 4 cm cells), running gear left out of both
  const DECK_CELL = 0.04;
  const deck = new Map<number, number>();
  const deckKey = (x: number, z: number): number => (Math.floor(x / DECK_CELL) + 512) * 4096 + (Math.floor(z / DECK_CELL) + 2048);
  forTrianglePoints(ownerTriangles(hull, [turret, gun], hull, (mesh) => notSuit(mesh) && notGear(mesh)), 0.04, (x, y, z) => {
    mark(hullOcc, x, y, z);
    const d = deckKey(x, z);
    const was = deck.get(d);
    if (was === undefined || y > was) deck.set(d, y);
  });
  // the running gear: no hull suit point within GEAR_KEEP_M of its triangles (a drape outside a skirt hangs a skirt's
  // thickness off the track behind it, and stays)
  const GEAR_CELL = 0.1;
  const gearTri = ownerTriangles(hull, [turret, gun], hull, (mesh) => notSuit(mesh) && keptOffGear(mesh));
  const gearCells = new Map<number, number[]>();
  const gearKey = (i: number, j: number, k: number): number => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  for (let t = 0; t < gearTri.length; t += 9) {
    const lo = [0, 1, 2].map((a) => Math.floor((Math.min(gearTri[t + a], gearTri[t + 3 + a], gearTri[t + 6 + a]) - GEAR_KEEP_M) / GEAR_CELL));
    const hi = [0, 1, 2].map((a) => Math.floor((Math.max(gearTri[t + a], gearTri[t + 3 + a], gearTri[t + 6 + a]) + GEAR_KEEP_M) / GEAR_CELL));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4000) continue;
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const key = gearKey(i, j, k), list = gearCells.get(key);
      if (list) list.push(t); else gearCells.set(key, [t]);
    }
  }
  const gtri = new THREE.Triangle(), ga = new THREE.Vector3(), gb = new THREE.Vector3(), gc = new THREE.Vector3();
  const gq = new THREE.Vector3(), gp = new THREE.Vector3();
  const nearGear = (p: readonly number[]): boolean => {
    const list = gearCells.get(gearKey(Math.floor(p[0] / GEAR_CELL), Math.floor(p[1] / GEAR_CELL), Math.floor(p[2] / GEAR_CELL)));
    if (!list) return false;
    gq.set(p[0], p[1], p[2]);
    for (const t of list) {
      gtri.set(ga.set(gearTri[t], gearTri[t + 1], gearTri[t + 2]), gb.set(gearTri[t + 3], gearTri[t + 4], gearTri[t + 5]),
        gc.set(gearTri[t + 6], gearTri[t + 7], gearTri[t + 8]));
      if (gtri.closestPointToPoint(gq, gp).distanceTo(gq) < GEAR_KEEP_M) return true;
    }
    return false;
  };
  const deckAt = (x: number, z: number): number | null => {
    let best: number | null = null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const y = deck.get(deckKey(x + i * DECK_CELL, z + j * DECK_CELL));
      if (y !== undefined && (best === null || y > best)) best = y;
    }
    return best;
  };
  const reach = Math.ceil(clearance / SWEEP_BIN_M) + 1;
  /** Whether `occ` holds anything within the clearance of (r, yT) through the traverse (`rad` bins either side). */
  const occupied = (occ: Uint8Array, r: number, yT: number, rad = 3): boolean => {
    const i0 = Math.floor(r / SWEEP_BIN_M), j0 = Math.floor((yT - Y_BASE) / SWEEP_BIN_M);
    for (let i = Math.max(0, i0 - rad); i <= Math.min(R_BINS - 1, i0 + rad); i++) {
      for (let j = Math.max(0, j0 - reach); j <= Math.min(Y_BINS - 1, j0 + reach); j++) if (occ[i * Y_BINS + j]) return true;
    }
    return false;
  };
  /** Whether the turret's swept body (and the clearance round it) holds (r, yT). */
  const inTurretSweep = (r: number, yT: number): boolean => {
    const i0 = Math.floor(r / SWEEP_BIN_M), j0 = Math.floor((yT - Y_BASE) / SWEEP_BIN_M);
    for (let i = Math.max(0, i0 - 3); i <= Math.min(R_BINS - 1, i0 + 3); i++) {
      if (turretHi[i] >= 0 && j0 >= turretLo[i] - reach && j0 <= turretHi[i] + reach) return true;
    }
    return false;
  };
  /** The top of the hull under a turret drape at radius r (what stands under the turret's roof line, turret frame). */
  const hullTopUnder = (r: number, below: number): number => {
    const i0 = Math.floor(r / SWEEP_BIN_M), jTop = Math.min(Y_BINS - 1, Math.floor((below - Y_BASE) / SWEEP_BIN_M));
    let top = -Infinity;
    for (let i = Math.max(0, i0 - 4); i <= Math.min(R_BINS - 1, i0 + 4); i++) {
      for (let j = jTop; j >= 0; j--) if (hullOcc[i * Y_BINS + j]) { top = Math.max(top, Y_BASE + (j + 1) * SWEEP_BIN_M); break; }
    }
    return top;
  };
  // the main gun: its radius by station along the bore, its trunnion off the turret's axis, its pitch limits, all in the
  // hull's units like the hull's points and the turret's occupancy (the fix round: the T-90M's and the Merkavas' turret
  // rigs carry a non-uniform scale, and in the turret's own frame the trunnion read up to 8 cm higher and 10 cm farther
  // forward than it stands, the bore's stations stretched with it). A turret owner's points are brought into the same
  // units (turretUnits). The rotations are the rigs' rest poses (identity on every built hull).
  const restQ = (o: THREE.Object3D): THREE.Quaternion => {
    const q = new THREE.Quaternion(), sh = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    hull.matrixWorld.decompose(v, sh, sc);
    o.matrixWorld.decompose(v, q, sc);
    return sh.invert().multiply(q);
  };
  const scaleOf = (o: THREE.Object3D): THREE.Vector3 => {
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    o.matrixWorld.decompose(v, q, sc);
    return sc;
  };
  const hullScale = scaleOf(hull), turretScale = scaleOf(turret);
  const turretUnits = new THREE.Vector3(turretScale.x / hullScale.x, turretScale.y / hullScale.y, turretScale.z / hullScale.z);
  const toTurretAxes = restQ(turret).invert(), toGunAxes = restQ(gun).invert();
  const gunHull = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld).applyMatrix4(toHull);
  const gunAt = gunHull.clone().sub(pivot).applyQuaternion(toTurretAxes);
  // the gun's extent by station along the bore: its left and right edges and how far above and below its axis it
  // reaches (a box, not a circle: a mantlet's corners must not be read as reaching under the deck; and lopsided, a
  // launcher on one side of the cradle widening only that side)
  const radius = new Map<number, number>(), extent = new Map<number, [number, number, number, number]>();
  const gunPoint = new THREE.Vector3();
  forTrianglePoints(ownerTriangles(gun, [], hull, notSuit), 0.04, (hx, hy, hz) => {
    gunPoint.set(hx - gunHull.x, hy - gunHull.y, hz - gunHull.z).applyQuaternion(toGunAxes);
    const x = gunPoint.x, y = gunPoint.y, z = gunPoint.z;
    const k = Math.floor(z / SWEEP_BIN_M), r = Math.hypot(x, y);
    if (r > (radius.get(k) ?? -1)) radius.set(k, r);
    const e = extent.get(k) ?? [Infinity, -Infinity, -Infinity, -Infinity];
    e[0] = Math.min(e[0], x); e[1] = Math.max(e[1], x); e[2] = Math.max(e[2], y); e[3] = Math.max(e[3], -y);
    extent.set(k, e);
  });
  // how far round the trunnion the gun's wide parts reach (a point that near is tested at several yaws)
  let gunReach = 0;
  for (const r of radius.values()) gunReach = Math.max(gunReach, r);
  gunReach += 0.3;
  // the box's farthest left and right, and the gun's farthest stations
  let leftmost = 0, rightmost = 0, maxAlong = 0, minAlong = 0;
  for (const e of extent.values()) { leftmost = Math.min(leftmost, e[0]); rightmost = Math.max(rightmost, e[1]); }
  for (const k of extent.keys()) { maxAlong = Math.max(maxAlong, (k + 1) * SWEEP_BIN_M); minAlong = Math.min(minAlong, k * SWEEP_BIN_M); }
  const spec = P.spec;
  const deg = Math.PI / 180;
  const tMax = (spec.gunElevationDeg ?? 18) * deg;
  const tMinFront = -(spec.gunDepressionDeg ?? 8) * deg;
  // nothing farther out than the muzzle's reach, or lower than the gun's deepest depression brings its belly, meets it
  const gunReachR = Math.abs(gunAt.x) + gunAt.z + maxAlong + gunReach + clearance;
  let deepest = 0;
  for (const e of extent.values()) deepest = Math.max(deepest, e[3]);
  const gunLowY = gunAt.y - Math.max(maxAlong * Math.sin(Math.max(0, -tMinFront) + 0.05), -minAlong * Math.sin(Math.max(0, tMax) + 0.05))
    - deepest - clearance - 0.05;
  // The gun's box [left, right, above, below] round a station (three bins), none past its ends: one merged box per
  // station bin, made once (2026-10-15, the perf lane: the sweep asked a Map and built a box on every call, 4.1 s of
  // two profiled m1a3 builds in sweptBy's own time; min and max are exact, so every box is the one it built).
  let binLo = Infinity, binHi = -Infinity;
  for (const key of extent.keys()) { binLo = Math.min(binLo, key - 1); binHi = Math.max(binHi, key + 1); }
  const binCount = Number.isFinite(binLo) ? binHi - binLo + 1 : 0;
  const boxL = new Float64Array(binCount), boxR = new Float64Array(binCount), boxA = new Float64Array(binCount);
  const boxB = new Float64Array(binCount), boxHas = new Uint8Array(binCount);
  for (let slot = 0; slot < binCount; slot++) {
    const k = binLo + slot;
    for (let i = k - 1; i <= k + 1; i++) {
      const e = extent.get(i);
      if (!e) continue;
      if (!boxHas[slot]) { boxL[slot] = e[0]; boxR[slot] = e[1]; boxA[slot] = e[2]; boxB[slot] = e[3]; boxHas[slot] = 1; }
      else {
        boxL[slot] = Math.min(boxL[slot], e[0]); boxR[slot] = Math.max(boxR[slot], e[1]);
        boxA[slot] = Math.max(boxA[slot], e[2]); boxB[slot] = Math.max(boxB[slot], e[3]);
      }
    }
  }
  const sweptThetas = new Float64Array(6);
  /**
   * Whether the gun through pitches lo..hi meets a point `lateral` across from its bore (gun frame x, signed) at
   * turret-frame height qy and reach qz, within `margin` across and `rise` above and below.
   */
  const sweptBy = (lateral: number, qy: number, qz: number, lo: number, hi: number, margin = clearance, rise = margin): boolean => {
    const dy = qy - gunAt.y, dz = qz - gunAt.z;
    const d = Math.hypot(dy, dz);
    if (d < 1e-6) return true;
    const phi = Math.atan2(dy, dz);
    // the pitch bringing the bore nearest the point, and for a point below the trunnion and behind it the one bringing
    // the breech nearest it (the breech end dips as the muzzle rises, and can come out under the turret's floor; above
    // the trunnion the turret's own roof lies between the breech and any cloth on it)
    const back = phi > 0 ? phi - Math.PI : phi + Math.PI;
    const nearest = THREE.MathUtils.clamp(phi, lo, hi);
    let count = 0;
    sweptThetas[count++] = nearest;
    if (dy < 0 && dz < 0) sweptThetas[count++] = THREE.MathUtils.clamp(back, lo, hi);
    // near the trunnion the gun's section changes fast (a mantlet's corners): its ends and middle pitches as well
    if (d * Math.cos(phi - nearest) < 0.8) {
      sweptThetas[count++] = lo; sweptThetas[count++] = (lo + hi) / 2;
      sweptThetas[count++] = 0 > lo && 0 < hi ? 0 : hi; sweptThetas[count++] = hi;
    }
    for (let t = 0; t < count; t++) {
      const theta = sweptThetas[t];
      const slot = Math.floor((d * Math.cos(phi - theta)) / SWEEP_BIN_M) - binLo;
      if (!(slot >= 0 && slot < binCount) || !boxHas[slot]) continue;
      // the point's offset off the bore at that pitch: above (+) or below (-) it
      const off = d * Math.sin(phi - theta);
      if (lateral > boxL[slot] - margin && lateral < boxR[slot] + margin && off < boxA[slot] + rise && -off < boxB[slot] + rise) return true;
    }
    return false;
  };
  const envelopeFloor = conservativeGun ? gunEnvelopeFloor(P) : null;
  const hullToTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert().multiply(hull.matrixWorld), envelopePoint = new THREE.Vector3();
  const workingOk = (owner: GhillieOwner, p: readonly number[], garnish = false): boolean => {
    if (owner === 'hull') {
      const dx = p[0] - pivot.x, dz = p[2] - pivot.z, r = Math.hypot(dx, dz);
      const qy = p[1] - pivot.y;
      // off the running gear
      if (nearGear(p)) return false;
      // clear of whatever the turret carries round over this radius and height through its traverse
      if (inTurretSweep(r, qy)) return false;
      // under the receipt's continuous gun envelope (GhillieConfig.conservativeGunEnvelope), 5 cm clear of its lowest
      // reach within 10 cm of the point's radius (the receipt boxes each triangle, whose corners reach farther out)
      if (envelopeFloor) {
        const tp = envelopePoint.set(p[0], p[1], p[2]).applyMatrix4(hullToTurret);
        const rr = Math.hypot(tp.x, tp.z);
        let lowest = Infinity;
        for (let k = Math.floor(rr / 0.05) - 2; k <= Math.floor(rr / 0.05) + 2; k++) lowest = Math.min(lowest, envelopeFloor.get(k) ?? Infinity);
        if (tp.y > lowest - 0.05) return false;
      }
      if (qy < gunLowY || r > gunReachR) return true;
      // out of the gun's arc: every turret yaw that brings the gun's box across the point (sampled across the box's
      // widest half-width), the gun through its pitch range at that yaw; near the trunnion the mantlet's wide base
      // sweeps it round the full circle besides
      const aim = Math.atan2(dx, dz);
      const plate = deckAt(p[0], p[2]);
      const flat = plate !== null && p[1] <= plate + 0.04;
      const hitAt = (off: number): boolean => {
        const lateral = r * Math.sin(off) - gunAt.x, along = r * Math.cos(off);
        const lo = minimumMechanicalGunPitch(spec, aim - off);
        if (!sweptBy(lateral, qy, along, lo, tMax)) return false;
        // a spec whose depression has no deck curve lets the bare gun reach its own deck: where the gun at that yaw's
        // lowest pitch, passing over the point (the same reach across), already comes down to within the cloth's 4 cm
        // of the armour under it (or into it), the cloth lying flat on that armour stays (the alternative is no net on
        // that deck at all); no garnish stands up there. Only ahead of the trunnion (behind it the breech swings
        // inside the turret)
        // the coordinator on the fix round's audit (the TUSK's and Type 90's decks): garnish clears the gun's whole
        // elevation sweep, full depression included; it never takes the cloth's lying-flat exemption
        if (garnish || !flat || along - gunAt.z < 0.05) return true;
        for (const dy of FLAT_PROBES) if (sweptBy(lateral, plate! + dy - pivot.y, along, lo, lo, clearance, 0)) return false;
        return true;
      };
      if (r > 1e-6) {
        const sLo = (gunAt.x + leftmost - clearance) / r, sHi = (gunAt.x + rightmost + clearance) / r;
        if (sHi > -1 && sLo < 1) {
          const dLo = Math.asin(Math.max(-1, sLo)), dHi = Math.asin(Math.min(1, sHi));
          const n = Math.max(2, Math.ceil(((dHi - dLo) * r) / GUN_STEP_M));
          for (let k = 0; k <= n; k++) if (hitAt(dLo + ((dHi - dLo) * k) / n)) return false;
        }
        // the fix round (the audit on the Griffin Viper's open mount): the yaws that bring the gun's rear (a breech or a
        // cradle reaching behind the trunnion) across the point, the gun turned away from it; its breech dips as the
        // muzzle rises (sweptBy). On a turreted hull those points lie inside the ring.
        if (minAlong < -0.1) {
          const rLo = -(gunAt.x + rightmost + clearance) / r, rHi = -(gunAt.x + leftmost - clearance) / r;
          if (rHi > -1 && rLo < 1) {
            const dLo = Math.asin(Math.max(-1, rLo)), dHi = Math.asin(Math.min(1, rHi));
            const n = Math.max(2, Math.ceil(((dHi - dLo) * r) / GUN_STEP_M));
            for (let k = 0; k <= n; k++) if (hitAt(dLo + ((dHi - dLo) * k) / n + Math.PI)) return false;
          }
        }
      }
      if (r < gunAt.z + gunReach) for (const off of NEAR_YAWS) if (hitAt(off)) return false;
      return true;
    }
    if (owner === 'turret') {
      // the fix round (profiles/griffinViper.selftest, gunCradleSeats.test-support): an open cradle's receiving columns
      // (the declared trunnion stations, straight up and down through the turret) carry nothing of the suit
      for (const [sx, , sz] of cradleStations) if (Math.abs(p[0] - sx) < CRADLE_KEEP_M && Math.abs(p[2] - sz) < CRADLE_KEEP_M) return false;
      // the hull's armour, fittings and suit within 10 cm across through the traverse
      // in the hull's units about the turret's axis (a scaled turret rig: see gunAt)
      const qx = p[0] * turretUnits.x, qy = p[1] * turretUnits.y, qz = p[2] * turretUnits.z;
      if (occupied(hullOcc, Math.hypot(qx, qz), qy, 5)) return false;
      return !sweptBy(qx - gunAt.x, qy, qz, tMinFront, tMax);
    }
    return true;
  };
  // and never inside the drone dock's boxes (cloth, garnish and every card vertex: suitDockBoxes)
  const netOk = (owner: GhillieOwner, p: readonly number[], garnish = false): boolean => !inDock(owner, p) && workingOk(owner, p, garnish);
  const lenses: Partial<Record<GhillieOwner, Float64Array>> = {}, smoke: Partial<Record<GhillieOwner, Float64Array>> = {};
  const ownerOf = (o: GhillieOwner): [THREE.Object3D, THREE.Object3D[]] => (o === 'hull' ? [hull, [turret, gun]] : o === 'turret' ? [turret, [gun]] : [gun, []]);
  /** Whether p lies in a cone or tube along a run of [origin, axis] rows. */
  const inLine = (rows: Float64Array, p: readonly number[], reach: number, base: number, slope: number, both = false): boolean => {
    for (let i = 0; i < rows.length; i += 6) {
      const wx = p[0] - rows[i], wy = p[1] - rows[i + 1], wz = p[2] - rows[i + 2];
      let along = wx * rows[i + 3] + wy * rows[i + 4] + wz * rows[i + 5];
      // both: a pane whose housing reads from either face keeps a short margin behind it too (30 cm)
      if (both && along < 0 && along > -0.3) along = -along;
      if (along < -0.05 || along > reach) continue;
      const lx = wx - rows[i + 3] * along, ly = wy - rows[i + 4] * along, lz = wz - rows[i + 5] * along;
      if (Math.hypot(lx, ly, lz) < base + Math.max(0, along) * slope) return true;
    }
    return false;
  };
  const linesOk = (owner: GhillieOwner, p: readonly number[]): boolean => {
    // a card's face, sampled densely, keeps out of the dock's boxes too (a card can straddle a thin cradle rail)
    if (inDock(owner, p)) return false;
    const [parent, others] = ownerOf(owner);
    if (inLine(lenses[owner] ??= ownerLenses(parent, others), p, LENS_REACH_M, 0.06, LENS_TAN, true)) return false;
    return !inLine(smoke[owner] ??= ownerSmokeLines(parent, others), p, SMOKE_REACH_M, SMOKE_LINE_M, 0.08);
  };
  // the fix round: a lens's field view (FieldClearance.fieldLinesOk)
  const inFieldView = (rows: Float64Array, p: readonly number[]): boolean => {
    for (let i = 0; i < rows.length; i += 6) {
      const ax = rows[i + 3], ay = rows[i + 4], az = rows[i + 5];
      const wx = p[0] - rows[i], wy = p[1] - rows[i + 1], wz = p[2] - rows[i + 2];
      let along = wx * ax + wy * ay + wz * az;
      if (along < 0 && along > -0.3) along = -along;
      if (along < -0.05 || along > FIELD_LENS_REACH_M) continue;
      const lx = wx - ax * along, ly = wy - ay * along, lz = wz - az * along;
      const r = Math.hypot(lx, ly, lz), lim = 0.06 + Math.max(0, along) * LENS_TAN;
      if (r >= lim) continue;
      if (along <= FIELD_LENS_NEAR_M) return true;
      // the vertical across the line of sight (a lens looking up or down past 60 degrees keeps its whole cone)
      const ux = -ax * ay, uy = 1 - ay * ay, uz = -az * ay, ul = Math.hypot(ux, uy, uz);
      if (ul < 0.5) return true;
      const lv = (lx * ux + ly * uy + lz * uz) / ul;
      if (lv > -(0.06 + along * FIELD_LENS_BELOW_TAN)) return true;
    }
    return false;
  };
  const fieldLinesOk = (owner: GhillieOwner, p: readonly number[]): boolean => {
    if (inDock(owner, p)) return false;
    const [parent, others] = ownerOf(owner);
    if (inFieldView(lenses[owner] ??= ownerLenses(parent, others), p)) return false;
    return !inLine(smoke[owner] ??= ownerSmokeLines(parent, others), p, SMOKE_REACH_M, SMOKE_LINE_M, 0.08);
  };
  return {
    netOk,
    clothOk(owner, p) {
      if (!netOk(owner, p)) return false;
      const [parent, others] = ownerOf(owner);
      return !inLine(smoke[owner] ??= ownerSmokeLines(parent, others), p, SMOKE_REACH_M, SMOKE_LINE_M, 0.08);
    },
    garnishOk(owner, p) {
      if (!netOk(owner, p)) return false;
      return linesOk(owner, p);
    },
    linesOk,
    fieldLinesOk,
    keepColumns: (owner) => (owner === 'turret'
      ? cradleStations.map(([sx, , sz]) => [sx - CRADLE_KEEP_M, sx + CRADLE_KEEP_M, sz - CRADLE_KEEP_M, sz + CRADLE_KEEP_M] as const) : []),
    lensClear(owner, p) {
      const [parent, others] = ownerOf(owner);
      return !inLine(lenses[owner] ??= ownerLenses(parent, others), p, CLOTH_LENS_REACH_M, 0.06, CLOTH_LENS_TAN, true);
    },
    // a drape's hem keeps above what stands on the hull under the turret's line (60 cm over its ring: decks, bins,
    // hatches and the hull's own suit, never a frame or a cage reaching up round the turret)
    // a turret owner's plan point and height in the turret's own frame (a scaled turret rig: see gunAt)
    turretHemFloor(x, z) {
      return (hullTopUnder(Math.hypot(x * turretUnits.x, z * turretUnits.z), 0.6) + clearance + 0.02) / turretUnits.y;
    },
    addHullSuit() {
      hull.updateWorldMatrix(true, true);
      forTrianglePoints(ownerTriangles(hull, [turret, gun], hull, (mesh) => !notSuit(mesh)), 0.06, (x, y, z) => mark(hullOcc, x, y, z));
    },
  };
}

/**
 * Hand a field suit's mesh its clearance test (ghillieDrape.ts GHILLIE_FIELD_OK), non-enumerable: userData's JSON copies
 * and metadata digests never see a function.
 */
function fieldOk(mesh: THREE.Object3D, ok: (p: readonly number[]) => boolean): void {
  Object.defineProperty(mesh.userData, GHILLIE_FIELD_OK, { value: ok, enumerable: false, configurable: true });
}

/** Drop a carrier's triangles with a corner the clearance refuses (the cloth's garnish is held to the same rule). */
function clearedGeometry(geometry: THREE.BufferGeometry, ok: (p: readonly number[]) => boolean,
  triangleOk?: (a: readonly number[], b: readonly number[], c: readonly number[]) => boolean): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute, uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  const positions: number[] = [], uvs: number[] = [];
  // a corner shared by several triangles is asked once
  const asked = new Map<string, boolean>();
  const okAt = (i: number): boolean => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), key = `${x},${y},${z}`;
    let v = asked.get(key);
    if (v === undefined) { v = ok([x, y, z]); asked.set(key, v); }
    return v;
  };
  let dropped = 0;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    let keep = true;
    for (let k = 0; k < 3 && keep; k++) keep = okAt(t + k);
    // and the triangle's middle (a cloth bridging a gap between corners that rest on armour)
    if (keep) keep = ok([(pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3,
      (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3]);
    if (keep && triangleOk) {
      keep = triangleOk([pos.getX(t), pos.getY(t), pos.getZ(t)], [pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1)],
        [pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2)]);
    }
    if (!keep) { dropped++; continue; }
    for (let k = 0; k < 3; k++) {
      positions.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      if (uv) uvs.push(uv.getX(t + k), uv.getY(t + k));
    }
  }
  if (!dropped) return geometry;
  dropIslands(positions, uvs);
  geometry.dispose();
  return makeGeometry(positions, uvs);
}

function ownerProbe(parent: THREE.Object3D, others: readonly THREE.Object3D[], cage: readonly CageWing[] = []): ArmourProbe | null {
  const skip = (o: THREE.Object3D): boolean => {
    if (others.includes(o)) return true;
    const name = o.name || '';
    // the drone dock's arms reach over the cloth round the cage's edge (missionAttachmentReceiver.ts): they hold none
    if (/_ghillie_|^rig_decor|procShadow|InteriorFill|vehicleMarking|^turretMissionReceiver$/.test(name)) return true;
    if (/antenna|whip|MachineGun|Rws|rws|crows/i.test(name)) return true;
    const fitting = o.userData?.fittingRoot ? String(o.userData.fitting || '') : '';
    return /pintleMG|Rws|americanM2|antenna|whip/i.test(fitting);
  };
  // a roof cage stands on the armour but holds up nothing laid on the turret (its wings carry nets of their own): its
  // tubes (merged into the lattice bucket) and hinge barrels (the dark bucket) are left out triangle by triangle
  const keep = cage.length ? (mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean => {
    const name = mesh.name || '';
    const lattice = /OpenLattice/.test(name), dark = /Dark$/.test(name);
    if (!lattice && !dark) return true;
    const p = [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3];
    return !cage.some((wing) => (lattice ? wing.near(p, 0.006, false) : wing.nearHinge(p, 0.006)));
  } : undefined;
  const probe = new ArmourProbe(parent, skip, keep);
  return probe.triangles ? probe : null;
}

/**
 * The netting lane (2026-10-09): owner-local plan boxes [x0, x1, z0, z1] of each lens, hatch lid and cupola the owner
 * carries itself (its merged Glass, Hatch and Cupola buckets split into connected components; another articulation's,
 * a LOD's coarse levels and anything the suit or decor added are left out). Components under 1.5 cm (a lamp's bezel
 * seam) and over 1.4 m (no lid is that wide) are skipped.
 */
/**
 * The lid pieces of an owner (one connected piece of a Glass, Hatch or Cupola bucket each), as plan boxes
 * [x0, x1, z0, z1] with their height span [y0, y1], owner frame.
 */
function lidPieces(parent: THREE.Object3D, others: readonly THREE.Object3D[]): Array<{ box: [number, number, number, number]; y0: number; y1: number }> {
  parent.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const out: Array<{ box: [number, number, number, number]; y0: number; y1: number }> = [];
  const visit = (o: THREE.Object3D): void => {
    if (o.visible === false || others.includes(o) || /_ghillie_|^rig_decor/.test(o.name || '')) return;
    if ((o as THREE.LOD).isLOD) { const first = (o as THREE.LOD).levels[0]?.object; if (first) visit(first); return; }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && /(Glass|Hatch|Cupola)$/.test(mesh.name || '') && mesh.geometry?.attributes?.position) {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, index = mesh.geometry.index;
      const n = index ? index.count : pos.count;
      const pts: number[] = [];
      for (let k = 0; k < n; k++) { v.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
      const count = pts.length / 3;
      const parentOf = Int32Array.from({ length: count }, (_, i) => i);
      const find = (i: number): number => { while (parentOf[i] !== i) { parentOf[i] = parentOf[parentOf[i]]; i = parentOf[i]; } return i; };
      const weld = new Map<string, number>();
      for (let i = 0; i < count; i++) {
        const key = `${Math.round(pts[i * 3] / 0.003)},${Math.round(pts[i * 3 + 1] / 0.003)},${Math.round(pts[i * 3 + 2] / 0.003)}`;
        const w = weld.get(key);
        if (w === undefined) weld.set(key, i); else parentOf[find(i)] = find(w);
      }
      for (let t = 0; t + 2 < count; t += 3) { parentOf[find(t + 1)] = find(t); parentOf[find(t + 2)] = find(t); }
      const boxes = new Map<number, { box: [number, number, number, number]; y0: number; y1: number }>();
      for (let i = 0; i < count; i++) {
        const r = find(i), b = boxes.get(r) ?? { box: [Infinity, -Infinity, Infinity, -Infinity], y0: Infinity, y1: -Infinity };
        b.box[0] = Math.min(b.box[0], pts[i * 3]); b.box[1] = Math.max(b.box[1], pts[i * 3]);
        b.box[2] = Math.min(b.box[2], pts[i * 3 + 2]); b.box[3] = Math.max(b.box[3], pts[i * 3 + 2]);
        b.y0 = Math.min(b.y0, pts[i * 3 + 1]); b.y1 = Math.max(b.y1, pts[i * 3 + 1]);
        boxes.set(r, b);
      }
      for (const b of boxes.values()) {
        const w = b.box[1] - b.box[0], d = b.box[3] - b.box[2];
        if (Math.max(w, d) < 0.015 || w > 1.4 || d > 1.4) continue;
        out.push(b);
      }
    }
    for (const child of o.children) visit(child);
  };
  for (const child of parent.children) visit(child);
  return out;
}

/**
 * 2026-10-12 (cam-netting; the owner on the TUSK and M1A3: "be unafraid of adding these on roofs of hulls or turrets"):
 * a flat lid piece of 0.7 m2 or more and at most 7 cm thick is no crew hatch but an ammunition bay's blow-off panel (the
 * Abrams' BlastPanelLeft/Right, 0.80 x 1.12 m, drawn in the hatch bucket): the crew never opens it, and its field net
 * lies over it as over the roof round it. Every crew lid (the largest, a CV90 troop hatch, is 0.54 m2) stays open.
 */
export function blowOffPanel(w: number, d: number, h: number): boolean {
  return w * d >= 0.7 && h <= 0.07;
}

/** The plan boxes of an owner's crew lids, lenses and cupolas (blow-off panels left out: blowOffPanel). */
function lidBoxes(parent: THREE.Object3D, others: readonly THREE.Object3D[]): Array<[number, number, number, number]> {
  return lidPieces(parent, others)
    .filter((b) => !blowOffPanel(b.box[1] - b.box[0], b.box[3] - b.box[2], b.y1 - b.y0))
    .map((b) => b.box);
}

/** An owner's blow-off panels (blowOffPanel) as boxes in its own frame, for the receipts that keep the suit off lids. */
export function ghillieBlowOffPanels(parent: THREE.Object3D): THREE.Box3[] {
  return lidPieces(parent, []).filter((b) => blowOffPanel(b.box[1] - b.box[0], b.box[3] - b.box[2], b.y1 - b.y0))
    .map((b) => new THREE.Box3(new THREE.Vector3(b.box[0], b.y0, b.box[2]), new THREE.Vector3(b.box[1], b.y1, b.box[3])));
}

/** The theatre this build is painted for: its scheme wheel paint (materials.ts), woodland without one. */
/** The turret's pivot z in the hull's frame. */
function turretPivotZ(P: GhillieBuilderPort): number {
  P.hullG.updateWorldMatrix(true, false);
  P.turretG.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(P.turretG.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(P.hullG.matrixWorld).invert()).z;
}

/** A fleet field net (the netting lane: fieldClearanceM on a leafy suit) takes the fix round's garnish and palette. */
const isFieldNet = (cfg: GhillieConfig): boolean => cfg.fieldClearanceM !== undefined && cfg.style === 'leafy';

function buildTheatre(P: GhillieBuilderPort): SuitTheatre {
  const wheels = P.mats.wheels;
  return wheels?.color ? suitTheatreOf(wheels.color) : 'woodland';
}

function garnishSpecies(cfg: GhillieConfig): SprayKind {
  const kind = cfg.foliageKind ?? 'oak';
  return kind === 'garnish-woodland' || kind === 'garnish-arid' ? 'oak' : kind;
}

/**
 * A fleet field net's two garnish species (the fix round; waves 391a/c: "oversized saturated lime leaf clusters"): a
 * crew cuts what grows round its position: conifer and broadleaf boughs in woodland (the references' spruce and pine),
 * pine and olive on a sand-painted hull (green on sand, as the references' sand Abrams). A row's own foliage kind leads.
 */
function fieldSpecies(cfg: GhillieConfig, theatre: SuitTheatre): readonly [SprayKind, SprayKind] {
  const own = cfg.foliageKind && cfg.foliageKind !== 'garnish-woodland' && cfg.foliageKind !== 'garnish-arid' ? cfg.foliageKind : null;
  // 2026-10-12 (cam-netting; the wave builder's read of the sand hulls: "the garnish reads as sparse olive patches at
  // hero distance"): pine needles and olive sprigs are too fine to read as cover on sand paint; a crew in dry country
  // cuts the dense evergreen scrub there, holm oak, with the olive
  if (theatre === 'desert') return [own ?? 'holmOak', 'olive'];
  if (theatre === 'snow') return [own ?? 'spruce', 'birch-bare'];
  return [own ?? 'spruce', 'beech'];
}

function* addGhillieOwner(
  P: GhillieBuilderPort,
  cfg: GhillieConfig,
  owner: GhillieOwner,
  parent: THREE.Group,
  panels: GhilliePanels,
  others: readonly THREE.Object3D[],
  theatre: SuitTheatre,
  cover: CoverPalette,
  clearance: FieldClearance | null = null,
  cap: SuitCap | null = null,
): Generator<void, void, void> {
  const leafy = cfg.style === 'leafy';
  // push 3b's field roof cage: its tubes hold up nothing laid on the turret, and (on a draped net suit) each of its
  // wings carries a net of its own
  const cage = owner === 'turret' ? cageWingsOf(parent) : [];
  const probe = ownerProbe(parent, others, cage);
  const uvk = 1 / (leafy ? NET_TILE_M : COVER_TILE_M);
  const hull = owner === 'hull';
  // the roofs first: every drape starts on the net already laid over the edge above it
  const tops: TopCloth[] = [];
  const dock = owner === 'turret' ? missionDockOf(parent) : null;
  // the netting lane: a cloth point keeps the vehicle's clearances, and where it stands off the armour under it (a
  // drape down a wall, a net carried over a gap) every lens's view besides; cloth lying on the armour is under a lens's
  // view, not in it. The coordinator on the fix round's audit (a Challenger 2 UA roof net 5.4 cm up, 0.72 m out of a
  // sight): nothing stands in a view cone, so there the cloth lies within 2.5 cm at its corners and within 4 cm along
  // its edges and through its middle (a dip under a triangle), and whatever does not is cut back
  const lying = (p: readonly number[], within = 0.025): boolean => {
    for (const h of probe?.surfacesAt?.(p[0], p[2]) ?? []) if (h.up && h.y <= p[1] + 0.005) return p[1] - h.y < within;
    return false;
  };
  // netting-proper: the vehicle's national markings stay readable through a field suit: its net is cut round each and its
  // garnish keeps out of their sight
  const markRays = isFieldNet(cfg) ? markingRaysOf(P, parent) : null;
  const coverOk = clearance
    ? (p: readonly number[]): boolean => clearance.clothOk(owner, p) && (clearance.lensClear(owner, p) || lying(p))
      && (!markRays || !markRays.clothHides(p)) : undefined;
  const coverEdgesOk = clearance
    ? (a: readonly number[], b: readonly number[], c: readonly number[]): boolean => {
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        if (!clearance.lensClear(owner, m) && !lying(m, 0.04)) return false;
      }
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      return clearance.lensClear(owner, m) || lying(m, 0.04);
    } : undefined;
  const support: OwnerSupport = {
    probe, hull, owner, fitted: !leafy, turretless: !cfg.turret,
    hemFloor: hull ? cfg.hemFloorM ?? NET_HEM_FLOOR_M : -Infinity,
    roof(x, z) {
      for (const t of tops) if (t.covers(x, z)) return t.heightAt(x, z);
      return null;
    },
    tentOk: dock ? (x, z) => x < dock.min.x - 0.5 || x > dock.max.x + 0.5 || z < dock.min.z - 0.5 || z > dock.max.z + 0.5 : undefined,
    flatAheadOfZ: hull && isFieldNet(cfg) && P.turretG && cfg.turret ? turretPivotZ(P) : undefined,
    hemFloorAt: owner === 'turret' && clearance ? (x, z) => clearance.turretHemFloor(x, z) : undefined,
    clothOk: coverOk,
  };
  // a roof gun's traverse: the roof net is cut open under its swept floor and no garnish stands up into it
  const gunFloor = owner === 'turret' ? roofWeaponFloor(parent, P.spec.id) : null;
  // the netting lane: the owner's lenses, hatch lids and cupolas, for the panels that open round them
  const autoOpen = (panels.top ?? []).some((p) => p.autoOpeningsM !== undefined);
  const lids = autoOpen ? lidBoxes(parent, others) : [];
  if (clearance) support.lids = lids;
  // and each lens's view over the roof: a slot widening ahead of a pane that looks out sideways or forward
  const slots: Point2[][] = [];
  if (autoOpen) {
    const lenses = ownerLenses(parent, others);
    for (let i = 0; i < lenses.length; i += 6) {
      const [cx, , cz, nx, ny, nz] = lenses.subarray(i, i + 6);
      const h = Math.hypot(nx, nz);
      if (Math.abs(ny) > 0.75 || h < 1e-6) continue;
      // both ways along the pane's axis (a periscope block's housing can read from either face)
      for (const dir of [1, -1]) {
        // the fix round ("roof coverage ... with clear holes for sights"): a field net is slotted just past the pane, the
        // cloth beyond lies on the plate under the view (its lens rule) and the garnish keeps the view itself clear
        const L = isFieldNet(cfg) ? FIELD_LENS_SLOT_M : LENS_SLOT_M;
        const fx = dir * nx / h, fz = dir * nz / h, w0 = 0.1, w1 = 0.1 + L * 0.4;
        slots.push([[cx - fz * w0, cz + fx * w0], [cx + fz * w0, cz - fx * w0],
          [cx + fx * L + fz * w1, cz + fz * L - fx * w1], [cx + fx * L - fz * w1, cz + fz * L + fx * w1]]);
      }
    }
  }
  for (const panel of panels.top ?? []) {
    const opened = gunFloor ? weaponOpenings(panel, probe, gunFloor) : [];
    const margin = panel.autoOpeningsM;
    if (margin !== undefined) {
      // 2026-10-12 (cam-netting, the UA roofs): a roof net laid on the turret stops at a field roof cage's wing (its
      // legs and lattice: the wing carries its own net, cageWingCloths) instead of running through its tubes
      for (const wing of cage) opened.push(rect(...wing.plan));
      for (const [bx0, bx1, bz0, bz1] of lids) {
        if (bx1 + margin < panel.x0 || bx0 - margin > panel.x1 || bz1 + margin < panel.z0 || bz0 - margin > panel.z1) continue;
        opened.push(rect(bx0 - margin, bx1 + margin, bz0 - margin, bz1 + margin));
      }
    }
    const slotted = margin === undefined ? [] : slots.filter((slot) => !(slot.every(([x]) => x < panel.x0) || slot.every(([x]) => x > panel.x1)
      || slot.every(([, z]) => z < panel.z0) || slot.every(([, z]) => z > panel.z1)));
    const laid = topCloth(opened.length || slotted.length
      ? { ...panel, holes: [...(panel.holes ?? []), ...opened], ...(slotted.length ? { slots: slotted } : {}) } : panel, cfg, support, uvk);
    // the netting lane: a carrier is filtered by the clearance as it is laid, and the drapes built after it see only
    // what is left of it (a drape never starts from a roof edge the clearance took away)
    if (coverOk) {
      const geometry = clearedGeometry(laid.geometry, coverOk, coverEdgesOk);
      // the cells whose cloth is really there (torn perimeter cells, islands and what the clearance took are not): a
      // drape starts only on cloth that exists
      const { x0, x1, z0, z1, nx = 18, nz = 30 } = panel;
      const cellAt = (x: number, z: number): number => THREE.MathUtils.clamp(Math.floor((z - z0) / ((z1 - z0) || 1) * nz), 0, nz - 1) * nx
        + THREE.MathUtils.clamp(Math.floor((x - x0) / ((x1 - x0) || 1) * nx), 0, nx - 1);
      const kept = new Set<number>();
      const gp = geometry.attributes.position as THREE.BufferAttribute;
      for (let t = 0; t + 2 < gp.count; t += 3) {
        kept.add(cellAt((gp.getX(t) + gp.getX(t + 1) + gp.getX(t + 2)) / 3, (gp.getZ(t) + gp.getZ(t + 1) + gp.getZ(t + 2)) / 3));
      }
      tops.push({
        ...laid,
        geometry,
        covers: (x, z) => {
          if (!laid.covers(x, z) || !kept.has(cellAt(x, z))) return false;
          const h = laid.heightAt(x, z);
          return h !== null && coverOk([x, h, z]);
        },
      });
    } else tops.push(laid);
    // a checkpoint between the suit's stages (2026-10-16): the factory runs the suit in its own slices after the core
    yield;
  }
  const surfaces: ClothSurface[] = [...tops];
  for (const panel of panels.side ?? []) {
    surfaces.push(sideCloth(panel, cfg, support, uvk, gunFloor?.standing ?? null));
    yield;
  }
  for (const panel of panels.face ?? []) surfaces.push(faceCloth(panel, cfg, support, uvk));
  yield;
  if (leafy && cage.length && gunFloor) cage.forEach((wing, i) => surfaces.push(...cageWingCloths(wing, i, cfg, probe, uvk, gunFloor, dock)));
  if (gunFloor || dock) {
    const inColumn = (p: readonly number[]): boolean => !!dock && p[1] > dock.min.y - 0.05
      && p[0] > dock.min.x - 0.12 && p[0] < dock.max.x + 0.12 && p[2] > dock.min.z - 0.12 && p[2] < dock.max.z + 0.12;
    surfaces.forEach((surface, k) => {
      surfaces[k] = { ...surface,
        cardOk: (p) => surface.cardOk(p) && (!gunFloor || p[1] < gunFloor(p[0], p[2]) - 0.02) && !inColumn(p) };
    });
  }
  if (clearance) {
    surfaces.forEach((surface, k) => {
      surfaces[k] = { ...surface,
        // carriers were filtered as they were laid and drapes cut column by column as they were built (keepPoint); a
        // roof cage wing's cloths are filtered here
        geometry: surface.kind === 'top' && !tops.includes(surface as TopCloth) && coverOk
          ? clearedGeometry(surface.geometry, coverOk, coverEdgesOk) : surface.geometry,
        // the fix round: a field net's garnish keeps the lenses' field views (FieldClearance.fieldLinesOk)
        cardOk: (p) => surface.cardOk(p) && (isFieldNet(cfg) ? clearance.netOk(owner, p, true) && clearance.fieldLinesOk(owner, p)
          : clearance.garnishOk(owner, p)) };
    });
  }
  // the fix round: the suit's cap, its owner's points brought into the vehicle root's frame
  const env = cap;
  const root = P.hullG.parent;
  let envOk: ((p: readonly number[]) => boolean) | undefined;
  if (env && root) {
    root.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(parent.matrixWorld), e = m.elements;
    envOk = (p) => {
      const x = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], y = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
      const z = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
      return Math.abs(x) <= env.halfWidth && z >= env.zMin && z <= env.zMax && y <= env.top;
    };
    surfaces.forEach((surface, k) => { surfaces[k] = { ...surface, geometry: clearedGeometry(surface.geometry, envOk!) }; });
  }
  const foliage = new FoliageCardBuffer();
  let topCards = 0;
  const field = isFieldNet(cfg);
  const surfacesAt = probe?.surfacesAt ? probe.surfacesAt.bind(probe) : null;
  if (cfg.foliage !== false) {
    const ctx: FieldTuftContext = {
      cfg, pal: (field ? FIELD_NET_PALETTES : NET_PALETTES)[theatre], q: P.q !== false, maxHalfWidth: cfg.maxHalfWidth ?? Infinity,
      hemFloor: support.hemFloor, theatre, owner,
      floorAt: owner === 'turret' && clearance ? (x, z) => clearance.turretHemFloor(x, z) - 0.02 : undefined,
      envOk, columns: clearance ? clearance.keepColumns(owner) : undefined,
      tubes: cage.flatMap((wing) => [...wing.tubes, ...wing.hinges]),
      roofUnder: field ? netHeightRaster(surfaces.filter((s) => s.kind === 'top').map((s) => s.geometry)) : undefined,
      laidStems: [],
      // netting-proper round 2: the armour a bough lies on across a gap in its net: the first surface at or under the
      // point, facing up, with nothing standing over the point within 30 cm (inside a box, under a hood or a lip: none)
      armourUnder: field && surfacesAt ? (x, y, z) => {
        for (const h of surfacesAt(x, z)) {
          if (h.y > y + 0.3) continue;
          return h.y > y + 0.005 || !h.up ? null : h.y;
        }
        return null;
      } : undefined,
      overArmour: field && surfacesAt
        ? (x, y, z) => surfacesAt(x, z).some((h) => !h.gear && h.y <= y + 0.005) : undefined,
      // the card's own vertices keep the vehicle's clearances; its face, sampled densely, keeps the thin lens views
      // and smoke lines clear (a line can pass between a card's vertices)
      cardClear: clearance ? field ? (card) => denseCardPoints(card).every((p) => clearance.fieldLinesOk(owner, p))
          && (!markRays || !cardHidesMarking(card, markRays))
        : (card) => foliageCardPoints(card).every((p) => clearance.netOk(owner, p))
          && denseCardPoints(card).every((p) => clearance.linesOk(owner, p)) : undefined,
    };
    for (let k = 0; k < surfaces.length; k++) {
      (field ? addFieldTufts : addTufts)(foliage, surfaces[k], ctx, cfg.seed + k * 1000 + (owner === 'turret' ? 37 : owner === 'gun' ? 71 : 0));
      if (k < tops.length) topCards = foliage.cardCount;
      yield;
    }
  }
  const suitMats = suitMaterialsOf(P), netGeos = surfaces.map((s) => s.geometry);
  // the suit's parts share one net material (an empty part still builds and disposes its own throwaway, as before)
  const netShared = netGeos.length > 0 && suitMats.net !== undefined;
  const netMat = netShared ? suitMats.net! : makeNet(P, cfg, theatre, cover);
  // Mesh names keep the schema-1 spelling (tankIdAliases.ts): geometry digests hash them.
  const netMesh = addMerged(P, parent, netGeos, netMat, `${tankSeedId(cfg.id)}_ghillie_${owner}_net`);
  if (netMesh && !netShared) suitMats.net = netMat;
  // the netting lane: a suit with working clearances is marked for the decor's turret-load guard (decorations.ts), and
  // what the decor draws up over its loads is held to the same clearances (ghillieDrape.ts)
  if (netMesh && clearance) {
    netMesh.userData.fieldSuit = true;
    // the fix round's audit (the CV90's turret net drawn up over a load into a sight's view): a lifted point keeps the
    // cloth's whole rule, the lens views included, as the carriers were laid
    fieldOk(netMesh, coverOk ?? ((p) => clearance.clothOk(owner, p)));
  }
  // a garage pattern switch repaints the vehicle in place: the net swaps to the new theatre's (a cover to the new scheme)
  if (netMesh && !netShared && P.mats.wheels) {
    followVehicleScheme(P.mats.wheels, netMat, (vis) => {
      const t = theatreOfHex(vis.base);
      const next = leafy ? garnishedNetTextures(t, cfg.netTextureSeed ?? cfg.seed, field) : cutLeafCoverTextures(coverPaletteOf(vis, t), cfg.seed);
      if (next) { netMat.map = next.map; netMat.bumpMap = next.bump; }
    });
  }
  // the roof and deck carriers lead the merged net (and their garnish the cards): the decor draws a draped net over its
  // loads; a fitted cover is cut to the hull and its stowage is strapped on top of it
  if (netMesh && leafy) netMesh.userData[GHILLIE_TOP_VERTICES] = tops.reduce((n, t) => n + t.geometry.attributes.position.count, 0);
  const leaves = foliage.toGeometry();
  if (leaves) {
    const atlas = leafy ? (field ? ghillieGarnishAtlas(...fieldSpecies(cfg, theatre)) : ghillieGarnishAtlas(garnishSpecies(cfg)))
      : vehicleFoliageAtlas(theatre === 'desert' ? 'garnish-arid' : 'garnish-woodland');
    const leavesShared = suitMats.leaves.has(atlas);
    const mat = leavesShared ? suitMats.leaves.get(atlas)! : makeCloth(P, (m) => configureFoliageMaterial(m, atlas));
    if (!leavesShared) suitMats.leaves.set(atlas, mat);
    const mesh = new THREE.Mesh(leaves, mat);
    mesh.name = `${tankSeedId(cfg.id)}_ghillie_${owner}_leaves`;
    mesh.castShadow = mesh.receiveShadow = true;
    if (clearance) {
      mesh.userData.fieldSuit = true;
      // the fix round: a field card lifted over a load keeps the rule it was placed by (the field lens views)
      fieldOk(mesh, isFieldNet(cfg) ? (p) => clearance.netOk(owner, p, true) && clearance.fieldLinesOk(owner, p)
        : (p) => clearance.garnishOk(owner, p));
    }
    mesh.userData.vehicleFoliage = leafy ? (field ? fieldSpecies(cfg, theatre)[0] : garnishSpecies(cfg)) : cfg.foliageKind ?? defaultFoliageKind(cfg.style);
    // alpha-cut sprays enclose air between their leaves, like the net that carries them
    mesh.userData.combatHitboxRole = 'nonArmor';
    mesh.userData.continuityRole = 'open-lattice';
    if (leafy) mesh.userData[GHILLIE_TOP_CARDS] = [topCards, P.q !== false ? 24 : 12];
    parent.add(mesh);
    // the garnish was tinted for the build's theatre; on a pattern switch its colour shifts to the new theatre's
    if (P.mats.wheels && !leavesShared) {
      const built = meanStrip(theatre, field);
      followVehicleScheme(P.mats.wheels, mat, (vis) => {
        const t = theatreOfHex(vis.base);
        if (!leafy) {
          mat.map = vehicleFoliageAtlas(t === 'desert' ? 'garnish-arid' : 'garnish-woodland');
          return;
        }
        const now = meanStrip(t, field);
        mat.color.setRGB(now[0] / built[0], now[1] / built[1], now[2] / built[2]);
      });
    }
    // the atlas is shared fleet-wide (vehicleFoliage.ts) and never joins a visual's disposables
    P.disposables.push(leaves);
    if (!leavesShared) P.disposables.push(mat);
  }
}

/** Fallback cover colours per theatre (a spec without a paint scheme). */
const COVER_FALLBACK: Readonly<Record<SuitTheatre, CoverPalette>> = Object.freeze({
  woodland: { base: [73, 84, 60], patches: [[35, 38, 31], [74, 58, 44], [92, 104, 72]] },
  desert: { base: [176, 156, 118], patches: [[140, 116, 82], [118, 96, 68], [196, 182, 146]] },
  snow: { base: [214, 216, 212], patches: [[150, 150, 144], [184, 186, 182], [232, 232, 228]] },
});

/** A cover's colours from a scheme (its base and patches, and a lighter tone of its base). */
function coverPaletteOf(vis: MaterialVisual, theatre: SuitTheatre): CoverPalette {
  const base = hexRgb(vis.base);
  const patches = (vis.patches ?? []).slice(0, 3).map(hexRgb);
  if (!patches.length) return COVER_FALLBACK[theatre];
  const light: [number, number, number] = [Math.min(255, base[0] * 1.1 + 4), Math.min(255, base[1] * 1.1 + 4), Math.min(255, base[2] * 1.06)];
  return { base, patches: [...patches, light] };
}

/** The cover's colours from the scheme this vehicle wears. */
function buildCoverPalette(P: GhillieBuilderPort, theatre: SuitTheatre): CoverPalette {
  try {
    if (P.spec.visual) return coverPaletteOf(resolveCamoVisual(P.spec as unknown as MaterialTankSpec), theatre);
  } catch {
    // a spec the paint system cannot resolve: the theatre's issue colours
  }
  return COVER_FALLBACK[theatre];
}

/** A theatre's garnish strips, their share-weighted mean in linear RGB (the garnish follows a scheme switch by it). */
function meanStrip(theatre: SuitTheatre, field = false): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const [c, w] of (field ? FIELD_NET_PALETTES : NET_PALETTES)[theatre].strips) for (let k = 0; k < 3; k++) out[k] += srgbLin(c[k]) * w;
  return out;
}

/**
 * The fix round's cap on a field suit (the coordinator, 2026-10-11, with the concept gate measuring the vehicle without
 * its camouflage: "add a separate cap so a suit can't balloon"): no cloth or garnish more than FIELD_CAP_M outside the
 * bare vehicle's bounds, a side, at its rear and over its top (the vehicle root's frame).
 */
interface SuitCap { readonly halfWidth: number; readonly zMin: number; readonly zMax: number; readonly top: number }
const FIELD_CAP_M = 0.6;

function suitCapOf(P: GhillieBuilderPort): SuitCap | null {
  const root = P.hullG.parent;
  if (!root) return null;
  root.updateMatrixWorld(true);
  // 2026-10-12 (cam-netting; battleGeometrySharing.selftest, type90_kyumaru and type90a: 20 -> 16 shared stocks): Box3
  // expandByObject computes and keeps every geometry's bounding box, and the battle geometry share keys a stock by its
  // bounds too, so a suited build's gear stocks no longer matched its unsuited sibling's. The bounds are read here
  // without writing them back.
  const box = new THREE.Box3(), local = new THREE.Box3(), placed = new THREE.Box3(), at = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || /_ghillie_/.test(mesh.name || '')) return;
    const position = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!position) return;
    if (mesh.geometry.boundingBox) local.copy(mesh.geometry.boundingBox); else local.setFromBufferAttribute(position);
    if (local.isEmpty()) return;
    // an instanced stock (the running gear's rollers and links) once per instance
    const instanced = mesh as THREE.Mesh & { isInstancedMesh?: boolean; count?: number; getMatrixAt?: (i: number, m: THREE.Matrix4) => void };
    if (instanced.isInstancedMesh && instanced.getMatrixAt) {
      for (let i = 0; i < (instanced.count ?? 0); i++) {
        instanced.getMatrixAt(i, at);
        box.union(placed.copy(local).applyMatrix4(at).applyMatrix4(mesh.matrixWorld));
      }
      return;
    }
    box.union(placed.copy(local).applyMatrix4(mesh.matrixWorld));
  });
  if (box.isEmpty()) return null;
  return { halfWidth: Math.max(-box.min.x, box.max.x) + FIELD_CAP_M, zMin: box.min.z - FIELD_CAP_M, zMax: box.max.z + FIELD_CAP_M,
    top: box.max.y + FIELD_CAP_M };
}

/**
 * The suit's build, as checkpoints (2026-10-16, PERF: the garage's default tank wears a suit and its build was one long
 * task). The factory runs it after the core build, before the decorations that read it, and the vehicle it reads is the
 * one the assembly left (tankFactoryCore.ts runDeferredAssembly); nothing it draws or decides depends on where it pauses.
 */
function* buildGhillieSuit(P: GhillieBuilderPort, cfg: GhillieConfig): Generator<void, void, void> {
  const theatre = buildTheatre(P);
  const cover = buildCoverPalette(P, theatre);
  const owners: readonly [GhillieOwner, THREE.Group, readonly THREE.Object3D[]][] = [
    ['hull', P.hullG, [P.turretG, P.gunG]],
    ['turret', P.turretG, [P.gunG]],
    ['gun', P.gunG, []],
  ];
  // the netting lane: the working vehicle's clearances, read once off the assembled build (the hull's top re-read
  // before the turret's suit, so that suit also clears the hull's)
  const clearance = cfg.fieldClearanceM !== undefined ? fieldClearance(P, cfg.fieldClearanceM, cfg.conservativeGunEnvelope === true) : null;
  const cap = isFieldNet(cfg) ? suitCapOf(P) : null;
  yield;
  for (const [owner, parent, others] of owners) {
    const panels = cfg[owner];
    if (!panels) continue;
    if (owner === 'turret') clearance?.addHullSuit();
    yield* addGhillieOwner(P, cfg, owner, parent, panels, others, theatre, cover, clearance, cap);
  }
}

/**
 * Dress a tank in its suit. Round 5 (2026-10-08): the carriers are laid against the assembled armour, so the build
 * runs once the tank is assembled (after any earlier postAssemble work); a port without that stage builds at once.
 */
/**
 * A roof panel's authored carrier height, sampled on its own grid when the profile hands the suit over: the build runs
 * after assembly, and an authored carrier may ask the builder (a raycast into its buckets) for a surface the assembly
 * has since merged or moved.
 */
function freezeTopPanel(panel: TopPanel): TopPanel {
  const { x0, x1, z0, z1, nx = 18, nz = 30 } = panel;
  const NX = nx + 1, NZ = nz + 1;
  const table = new Float64Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    table[j * NX + i] = panel.yAt(THREE.MathUtils.lerp(x0, x1, i / nx), THREE.MathUtils.lerp(z0, z1, j / nz));
  }
  const yAt = (x: number, z: number): number => {
    const fi = THREE.MathUtils.clamp((x - x0) / ((x1 - x0) || 1) * nx, 0, nx - 1e-9);
    const fj = THREE.MathUtils.clamp((z - z0) / ((z1 - z0) || 1) * nz, 0, nz - 1e-9);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, w = fj - j;
    const a = table[j * NX + i], b = table[j * NX + i + 1], c = table[(j + 1) * NX + i], d = table[(j + 1) * NX + i + 1];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return { ...panel, yAt };
}

function freezeConfig(cfg: GhillieConfig): GhillieConfig {
  const owners: Partial<Record<GhillieOwner, GhilliePanels>> = {};
  for (const owner of ['hull', 'turret', 'gun'] as const) {
    const panels = cfg[owner];
    if (panels) owners[owner] = { ...panels, top: panels.top?.map(freezeTopPanel) };
  }
  return { ...cfg, ...owners };
}

/** The builds already dressed (a family builder and a variant step may both ask; one suit per build). */
const SUITED = new WeakSet<GhillieBuilderPort>();

export function addVehicleGhillieSuit(P: GhillieBuilderPort, config?: GhillieConfig): boolean {
  const authored = config ?? GHILLIE_CONFIG_INDEX[P.spec.id];
  if (!authored || authored.disabled) return false;
  if (SUITED.has(P)) return false;
  SUITED.add(P);
  const cfg = freezeConfig(authored);
  // laid against the finished armour: after the profile's own postAssemble chain, which it never wraps (a port without
  // that stage builds at once)
  if (P.afterAssemble) P.afterAssemble.push(() => buildGhillieSuit(P, cfg));
  else {
    // a port without that stage builds at once
    const steps = buildGhillieSuit(P, cfg);
    for (let step = steps.next(); !step.done; step = steps.next()) { /* every checkpoint at once */ }
  }
  return true;
}
