/**
 * structureFx.ts — the look of a building taking damage and coming down (destruction-fx lane, 2026-10-07).
 *
 * The core lane decides when a structure crosses a stage (sim/destructionEvents.ts StructureStageEvent: damaged,
 * breached, collapsed) and where the blow landed; this module draws what the eye expects, in the building's OWN
 * materials and colours (DESTRUCTION.md §16): its rubble shares from the kit's anatomy when the world publishes it,
 * else a neutral masonry fallback.
 *
 *   damaged    a burst of dust out of the struck face, chips of its outer layer (render, brick, stone, plank), glass
 *   breached   a heavier jet of dust and pieces thrown along the blow, dark interior dust rolling out of the hole
 *   collapsed  the building comes down where the eye can follow it (round 7, wave 277): the roof drops in and the
 *              walls come down from the top along the mask's crumble front, their own pieces falling off it (the
 *              stages); the dust is born from the fall in the building's colour — shed off the front, pushed out as
 *              the roof lands inside, bursting out of the base where each band's pieces land, rising off the pile
 *
 * Draws only through the blast context (volume media, thrown chunks, additive light): seeded, pooled, no allocation.
 * A settled event (a late joiner, a reconnect) draws nothing: its stage is laid down by the world, silently.
 */
import type { StructureBreachEvent, StructureStageEvent } from '../sim/destructionEvents.ts';
import type { BlastContext } from './blastRecipes.ts';
import type { ChunkShape } from './debrisChunks.ts';
import { linearHex } from './surfaceLooks.ts';
import { collapseFrontTime, collapseWallHeight } from './structureMask.ts';

type Rgb = readonly [number, number, number];
const TAU = Math.PI * 2;

/** One rubble material of the building, by share, in its own colour (the kit anatomy's FractureSlot, reduced). */
interface RubbleShare {
  material: string;
  color: Rgb;
  share: number;
}

/** What the presentation knows of a structure's make-up (DESTRUCTION.md §16.2), or nothing (the fallback). */
export interface StructureLook {
  rubble: readonly RubbleShare[];
  /** the dark of its interior (a breach shows it) */
  interior: Rgb;
}

const FALLBACK_LOOK: StructureLook = Object.freeze({
  rubble: Object.freeze([
    Object.freeze({ material: 'plaster', color: linearHex(0xcac0ae), share: 0.25 }),
    Object.freeze({ material: 'brick', color: linearHex(0x8c5a44), share: 0.45 }),
    Object.freeze({ material: 'tile', color: linearHex(0x94503a), share: 0.15 }),
    Object.freeze({ material: 'timber', color: linearHex(0x5e4632), share: 0.15 }),
  ]),
  interior: linearHex(0x1c1a17),
});

const look = (interior: number, ...rubble: [string, number, number][]): StructureLook => Object.freeze({
  rubble: Object.freeze(rubble.map(([material, hex, share]) => Object.freeze({ material, color: linearHex(hex), share }))),
  interior: linearHex(interior),
});
const METAL_LOOK = look(0x141414, ['metal', 0x5c6156, 0.7], ['glass', 0x9fb0b4, 0.1], ['plank', 0x4a3a2a, 0.2]);
const WOOD_LOOK = look(0x161210, ['plank', 0x7a5c3e, 0.6], ['timber', 0x5e4632, 0.4]);
const STONE_LOOK = look(0x181715, ['stone', 0x8d877c, 0.85], ['earth', 0x5d4f3e, 0.15]);
const ADOBE_LOOK = look(0x1a1612, ['adobe', 0xa98a63, 0.85], ['earth', 0x7c6448, 0.15]);
const EARTH_LOOK = look(0x161310, ['earth', 0x6e5c45, 0.6], ['canvas', 0x8a7d5c, 0.4]);

/** What a struck prop or structure is made of, by its collision kind (the world's record kind), until the core lane's
 *  structure anatomy names it exactly. */
export function lookForStruckKind(kind: string | null | undefined): StructureLook | null {
  const k = (kind ?? '').toLowerCase();
  if (!k || k === 'structure') return null;
  if (/car|truck|van|bus|jeep|vehicle|tractor|container|barrel|drum|tank|cylinder|hedgehog|tetra|metal|steel|iron|crane|gantry|wagon|locomotive|boat|ship|wreck|aagun|gun|artillery|pylon|mast|lamp/.test(k)) return METAL_LOOK;
  if (/sandbag|bag|berm|earth|trench|mound|bale|hay/.test(k)) return EARTH_LOOK;
  if (/adobe|limewash|mud/.test(k)) return ADOBE_LOOK;
  if (/stone|rock|rubble|wall|pillbox|bunker/.test(k)) return STONE_LOOK;
  if (/tree|stump|trunk|fence|gate|post|crate|wood|timber|log|pallet|hut|shed|barn|shack|kiosk/.test(k)) return WOOD_LOOK;
  return null;
}

/**
 * The P1 breach stage names a blow, not a hole: the point and radius of the hole it opens, for the world seam's
 * holeAt (which picks the anatomy face nearest the point, its storey and the seed). As big as the blow (a rammed wall
 * the hull's height, the gunship's howitzer or missile two metres, HE 1.3 m, a kinetic round a shot hole), never wider
 * than the building holds; at least most of a radius off the ground (a shell bursting at the foot of a wall still
 * holes it) and under the eaves; a ram opens at the hull.
 */
export function breachBlowFor(e: StructureStageEvent): { x: number; y: number; z: number; radiusM: number } {
  const m = e.munition;
  const r = e.cause === 'ram' ? 1.5
    : m === 'howitzer' || m === 'missile' ? 2.1
      : m === 'rocket' || m === 'hesh' || m === 'cook_off' ? 1.7
        : m === 'he' ? 1.3
          : m === 'atgm' || m === 'heat' || m === 'drone_fpv' ? 0.8
            : m === 'autocannon_he' ? 0.55
              : 0.45;
  const h = Math.max(1, e.topY - e.baseY);
  const radiusM = Math.min(r, 0.45 * Math.min(h, 2 * Math.max(0.5, Math.min(e.hw, e.hd))));
  const y = Math.min(e.baseY + h - radiusM * 0.6, Math.max(e.baseY + radiusM * 0.85, e.cause === 'ram' ? e.baseY + 1.2 : e.y));
  return { x: e.x, y, z: e.z, radiusM };
}

/** What a fracture material looks like where its bucket is textured (the anatomy's tint is white there): linear RGB. */
const FRACTURE_BASE: Readonly<Record<string, Rgb>> = Object.freeze({
  brick: linearHex(0x8c5a44), stone: linearHex(0x8d877c), rubble: linearHex(0x7d776c), concrete: linearHex(0x9a978f),
  adobe: linearHex(0xa98a63), plaster: linearHex(0xcac0ae), timber: linearHex(0x5e4632), infill: linearHex(0xb8ab90),
  plank: linearHex(0x7a5c3e), metal: linearHex(0x5c6156), glass: linearHex(0x9fb0b4), tile: linearHex(0x94503a),
  slate: linearHex(0x4a4d52), thatch: linearHex(0xa08850), earth: linearHex(0x6e5c45), canvas: linearHex(0x8a7d5c),
});

/** The parts of a structure's anatomy the look reads (world/destructionKit.ts StructureDamageAnatomy). */
interface AnatomyLike {
  rubble: readonly { material: string; tint: Rgb; share: number }[];
  interior: { color: Rgb };
}

/**
 * A structure's look from its anatomy: its rubble by share in its own colours (the anatomy's tint where its bucket is
 * vertex-coloured; the material's own colour where it is textured and the tint is white), and its interior's dark.
 */
export function lookFromAnatomy(anatomy: AnatomyLike | null | undefined): StructureLook | null {
  if (!anatomy || !anatomy.rubble?.length) return null;
  const rubble: RubbleShare[] = [];
  for (const slot of anatomy.rubble) {
    if (!(slot.share > 0)) continue;
    const t = slot.tint;
    // (wave 322: a brick stack's dust and chips came out white) a textured bucket's tint is a light weathering wash
    // over its map, not its colour: anything this pale takes the material's own
    const white = Math.min(t[0], t[1], t[2]) > 0.6;
    const base = FRACTURE_BASE[slot.material] ?? FALLBACK_LOOK.rubble[1]!.color;
    rubble.push({ material: slot.material, color: white ? base : [t[0], t[1], t[2]], share: slot.share });
  }
  if (!rubble.length) return null;
  const ic = anatomy.interior?.color;
  return { rubble, interior: ic ? [ic[0], ic[1], ic[2]] : FALLBACK_LOOK.interior };
}

/** The piece shape a fracture material breaks into. */
function shapeFor(material: string): ChunkShape {
  switch (material) {
    case 'brick': case 'adobe': return 'brick';
    case 'stone': case 'concrete': case 'rebar': case 'earth': return 'stone';
    case 'timber': case 'plank': case 'infill': return 'splinter';
    case 'tile': case 'slate': case 'glass': case 'plaster': return 'shard';
    case 'metal': case 'canvas': return 'sheet';
    case 'thatch': return 'splinter';
    default: return 'stone';
  }
}

/** The dust a material raises (light masonry powder, tan earth, grey timber dust). */
function dustOf(look: StructureLook, out: [number, number, number]): Rgb {
  let r = 0, g = 0, b = 0, w = 0;
  for (const s of look.rubble) {
    // powder is paler than the solid: mineral dust scatters most of the light it meets
    const k = s.material === 'timber' || s.material === 'plank' || s.material === 'thatch' ? 0.55 : 1;
    // (round 2 lifted plaster to near white: a breach's cloud read as a cotton ball)
    // (b5: a brick house's strike still threw a cream ball in full sun) a smaller lift keeps the wall's own hue
    r += (s.color[0] * 0.62 + 0.12) * s.share * k; g += (s.color[1] * 0.62 + 0.112) * s.share * k;
    b += (s.color[2] * 0.62 + 0.1) * s.share * k; w += s.share * k;
  }
  if (w <= 0) { out[0] = 0.55; out[1] = 0.52; out[2] = 0.47; return out; }
  out[0] = r / w; out[1] = g / w; out[2] = b / w;
  // (round 4: a rendered house's breach still threw near-white cotton in full sun) masonry powder is never brighter
  // than a pale stone: its luminance is held under 0.4
  const lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  if (lum > 0.4) { const k = 0.4 / lum; out[0] *= k; out[1] *= k; out[2] *= k; }
  return out;
}

/** Pick a rubble material by share with the seeded stream. */
function pickRubble(look: StructureLook, u: number): RubbleShare {
  let acc = 0, total = 0;
  for (const s of look.rubble) total += s.share;
  for (const s of look.rubble) { acc += s.share / Math.max(1e-6, total); if (u <= acc) return s; }
  return look.rubble[look.rubble.length - 1];
}

const _dust: [number, number, number] = [0, 0, 0];
const _edge: number[] = [0, 0, 0, 0];

/** A point on a structure's footprint perimeter (t in 0..1, world x z) and that side's outward normal (x z). */
function footprintEdge(e: StructureStageEvent, cosY: number, sinY: number, perim: number, t: number, out: number[]): number[] {
  let lx, lz, nx, nz;
  const d = t * perim;
  if (d < 2 * e.hw) { lx = -e.hw + d; lz = -e.hd; nx = 0; nz = -1; }
  else if (d < 2 * e.hw + 2 * e.hd) { lx = e.hw; lz = -e.hd + (d - 2 * e.hw); nx = 1; nz = 0; }
  else if (d < 4 * e.hw + 2 * e.hd) { lx = e.hw - (d - 2 * e.hw - 2 * e.hd); lz = e.hd; nx = 0; nz = 1; }
  else { lx = -e.hw; lz = e.hd - (d - 4 * e.hw - 2 * e.hd); nx = -1; nz = 0; }
  out[0] = e.cx + lx * cosY + lz * sinY; out[1] = e.cz - lx * sinY + lz * cosY;
  out[2] = nx * cosY + nz * sinY; out[3] = -nx * sinY + nz * cosY;
  return out;
}

function puff(C: BlastContext, x: number, y: number, z: number, vx: number, vy: number, vz: number, drag: number,
  rise: number, windK: number, life: number, size0: number, size1: number, c0: Rgb, c1: Rgb, density: number,
  play: number, start: number, bo: number, aspect = 1, grow = 2.6): void {
  const m = C.m;
  const R = C.rand;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = 0;
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = grow; m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = 0.08; m.fadeOut = 0.45;
  m.medium = 'burst'; m.variant = Math.floor(R() * 4); m.mirror = R() < 0.5; m.playSeconds = play; m.startFrame = start;
  m.aspect = aspect;
  m.heat = 0; m.cool = 1;
  C.media(m);
}

/** A billow of the detonation's own (a fireball cooling to residue, its smoke): heat at birth and its cooling rate. */
function hot(C: BlastContext, x: number, y: number, z: number, vx: number, vy: number, vz: number, drag: number,
  rise: number, windK: number, life: number, size0: number, size1: number, c0: Rgb, c1: Rgb, density: number,
  heatK: number, cool: number, bo: number): void {
  const m = C.m;
  const R = C.rand;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = 0;
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = 2.6; m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = heatK > 0 ? 0 : 0.3; m.fadeOut = 0.45;
  m.medium = 'billow'; m.variant = Math.floor(R() * 4); m.mirror = R() < 0.5; m.playSeconds = life; m.startFrame = 0;
  m.aspect = 1;
  m.heat = heatK; m.cool = cool;
  C.media(m);
}

function piece(C: BlastContext, look: StructureLook, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  scale: number, life: number, bo: number): void {
  const k = C.k;
  const R = C.rand;
  const s = pickRubble(look, R());
  k.shape = shapeFor(s.material);
  k.x = x; k.y = y; k.z = z; k.birthOffset = bo; k.vx = vx; k.vy = vy; k.vz = vz; k.life = life;
  k.ax = R() - 0.5; k.ay = R() - 0.5; k.az = R() - 0.5; k.spin = 4 + R() * 10;
  k.scale = scale; k.groundY = C.groundY(x, z); k.drag = 0.2;
  const tint = 0.82 + R() * 0.36;
  k.r = s.color[0] * tint; k.g = s.color[1] * tint; k.b = s.color[2] * tint; k.heat = 0; k.seed = R();
  // (the battle strips: a stack's burst strewed the yard with white confetti) a sunlit fleck of plaster or tile reads as
  // paper: no thrown piece brighter than weathered render
  const lum = 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
  if (lum > 0.2) { const q = 0.2 / lum; k.r *= q; k.g *= q; k.b *= q; }
  C.chunk(k);
}

/**
 * A structure crossed into a stage (live events only). `look` is the building's anatomy reduced to its rubble shares,
 * or null for the masonry fallback.
 */
export function structureStageFx(C: BlastContext, e: StructureStageEvent, look: StructureLook | null, crumbled = false,
  eaveM: number | null = null, topple: ToppleFx | null = null): void {
  if (e.settled) return;
  const L = look ?? FALLBACK_LOOK;
  const R = C.rand;
  const dust = dustOf(L, _dust);
  const dark: Rgb = [dust[0] * 0.55, dust[1] * 0.55, dust[2] * 0.55];
  const height = Math.max(2, e.topY - e.baseY);
  const span = Math.max(2, Math.max(e.hw, e.hd));
  const dirX = Number.isFinite(e.dirX) ? e.dirX : 0, dirZ = Number.isFinite(e.dirZ) ? e.dirZ : 0;
  const k = Math.min(2, 0.6 + Math.sqrt(Math.max(0, e.points)) * 0.25);
  const dk = C.distBoost(e.x, e.y, e.z);
  if (e.stage === 'damaged' || e.stage === 'breached') {
    const breach = e.stage === 'breached';
    // (wave 266: no hole to be seen through the dust) the powder spills out and down the face, wider than tall, and
    // thins within a few seconds, so the hole the stage cut shows while the strike's own cloud drifts off
    const n = breach ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const sp = (breach ? 6 : 3.5) * (0.6 + 0.6 * R()) * k;
      const life = (breach ? 3.2 : 3) + R() * 1.5;
      puff(C, e.x, e.y, e.z, -dirX * sp + (R() - 0.5) * 2, 0.6 + R() * 1.4, -dirZ * sp + (R() - 0.5) * 2, 2.2,
        0.2, 0.9, life, 0.7 * k * dk, (breach ? 2.6 : 2.2) * k * dk, i === 0 ? dark : dust, dust,
        breach ? 0.45 : 0.42, life, 2, R() * 0.05, 1.3 + R() * 0.4);
    }
    if (breach) {
      // the dark interior dust rolling out of the hole
      puff(C, e.x, e.y, e.z, -dirX * 2, 0.4, -dirZ * 2, 1.4, 0.15, 0.9, 4 + R() * 1.5, 1.0 * dk, 3.2 * dk,
        L.interior, dark, 0.5, 5, 6, 0.15);
    }
    const pieces = Math.round((breach ? 18 : 8) * k);
    for (let i = 0; i < pieces; i++) {
      const a = R() * TAU, v = (3 + R() * 7) * k;
      piece(C, L, e.x, e.y, e.z, -dirX * v * 0.7 + Math.cos(a) * v * 0.4, 1.5 + R() * 4, -dirZ * v * 0.7 + Math.sin(a) * v * 0.4,
        0.08 + R() * (breach ? 0.3 : 0.16), 14 + R() * 6, R() * 0.06);
    }
    return;
  }
  if (e.stage !== 'collapsed') return;
  if (topple) { toppleFx(C, e, L, dust, topple); return; }
  // --- the collapse (round 7, wave 277: "the dust rises afterwards instead of coming out of a falling structure", "cream
  // rather than brick-tinged", "round balls and translucent blue-grey cards"). The mask drops the roof into the building
  // and brings the walls down from the top along the crumble front (structureMask collapseFront, ~3.5 s), the stages
  // throw the walls' own pieces off the front; the dust is born from the fall, in the building's own colour: shed off the
  // front as it crumbles, pushed out through the walls as the roof lands inside, bursting out of the base where each
  // band's pieces land, and rising off the pile as a low mass of many overlapping puffs. No column of big balls, no pall.
  const cosY = Math.cos(e.yaw), sinY = Math.sin(e.yaw);
  const perim = 2 * (e.hw + e.hd);
  const p = _edge;
  const tinted = brickDust(L, dust, _tint);
  const tintDark: Rgb = [tinted[0] * 0.62, tinted[1] * 0.6, tinted[2] * 0.58];
  if ((e as StructureStageEvent & { sections?: boolean }).sections === true) {
    // after the P2 cascade (every storey dropped with its own dust, sectionFallFx): the remains settle onto the mound —
    // a low burst out of the base all round and a little dust rising off the pile
    const n = Math.max(4, Math.round(perim / 6));
    for (let i = 0; i < n; i++) {
      footprintEdge(e, cosY, sinY, perim, (i + R()) / n, p);
      const v = 3 + R() * 3;
      const life = 5 + R() * 2;
      puff(C, p[0] + p[2] * 0.5, e.baseY + 0.45, p[1] + p[3] * 0.5, p[2] * v, 0.3 + R() * 0.3, p[3] * v, 2.2, 0.08, 0.9,
        life, 0.2 * span * dk, (0.38 + R() * 0.12) * span * dk, tintDark, tinted, 0.55, life, 1, R() * 0.15, 2.0 + R() * 0.6);
    }
    for (let i = 0; i < 4; i++) {
      const lx = (R() * 2 - 1) * e.hw * 0.7, lz = (R() * 2 - 1) * e.hd * 0.7;
      const life = 7 + R() * 3;
      puff(C, e.cx + lx * cosY + lz * sinY, e.baseY + 0.8, e.cz - lx * sinY + lz * cosY, (R() - 0.5), 0.6 + R() * 0.5, (R() - 0.5),
        1.3, 0.35, 0.9, life, 0.22 * span * dk, (0.4 + R() * 0.12) * span * dk, tintDark, tinted, 0.5, life, 2, 0.1 + R() * 0.4);
    }
    return;
  }
  // (dcore 2026-10-09, waves 294a/b: "collapse dust = small white or opaque orange puffs, not one cloud that rises,
  // spreads and thins"; the battle strips: a few separate puffs over a falling house) one cloud, born from the fall,
  // that never hides the walls coming down (round 7, wave 277: "a grey ball hid the building as it came down"): the air
  // the roof drives out of the top as it drops in, small; the skirt the walls pour out of their foot all round as the
  // front comes down, low, rolling out wide; and the body rising off the pile as the last courses land, born at the
  // foot, large overlapping puffs that grow fast, climb, spread and thin.
  const wallH = collapseWallHeight(height, eaveM);
  const frontEnd = collapseFrontTime(0, wallH);
  // (the battle strips, final: a gable house's cloud stayed a few small puffs) the low cloud is the size of what fell, not
  // of a narrow footprint's half width: a tall narrow house throws as much dust as a squat wide one
  const low = Math.max(span, 0.45 * wallH + 2, 4.5);
  // 1. the roof drops in: the air inside goes up out of the top, darker
  for (let i = 0; i < 4; i++) {
    const lx = (R() * 2 - 1) * e.hw * 0.6, lz = (R() * 2 - 1) * e.hd * 0.6;
    const life = 7 + R() * 3;
    puff(C, e.cx + lx * cosY + lz * sinY, e.baseY + wallH * (0.75 + 0.2 * R()), e.cz - lx * sinY + lz * cosY,
      (R() - 0.5) * 1.5, 1.4 + R() * 1.0, (R() - 0.5) * 1.5, 1.4, 0.6, 1.0, life, 0.25 * span * dk, (0.45 + R() * 0.12) * span * dk,
      tintDark, tinted, 0.5, life, 2, 0.3 + R() * 0.5, 1, 4.5);
  }
  // 2. the walls pour their dust out of their foot as the front comes down: a low skirt all round, rolling out wide,
  //    each band's as its pieces land
  const skirtN = Math.max(10, Math.min(20, Math.round(perim / 3)));
  for (let i = 0; i < skirtN; i++) {
    footprintEdge(e, cosY, sinY, perim, (i + R()) / skirtN, p);
    const v = 3 + R() * 3;
    const life = 9 + R() * 2.5;
    const h = wallH * (0.08 + 0.84 * (i + R()) / skirtN);
    const at = Math.min(frontEnd + 0.3, collapseFrontTime(h, wallH) + Math.sqrt((2 * h) / 9.8));
    puff(C, p[0] + p[2] * 0.6, e.baseY + 0.45, p[1] + p[3] * 0.6, p[2] * v, 0.35 + R() * 0.4, p[3] * v, 2.0, 0.25, 0.9,
      life, 0.5 * low * dk, (1.0 + R() * 0.3) * low * dk, tintDark, tinted, 0.5, life, 1, at, 2.0 + R() * 0.5, 4.5);
  }
  // a little shed off the crumbling line as it passes (the dust rides the falling courses down)
  const BAND = 1.8;
  const bands = Math.max(1, Math.ceil(wallH / BAND));
  for (let b = 0; b < bands; b++) {
    const h = Math.max(0.3, wallH - (b + 0.5) * BAND);
    const tb = collapseFrontTime(h, wallH);
    footprintEdge(e, cosY, sinY, perim, R(), p);
    const life = 4 + R() * 1.5;
    puff(C, p[0] + p[2] * 0.3, e.baseY + h, p[1] + p[3] * 0.3, p[2] * 0.6, -1.2 - R() * 0.6, p[3] * 0.6,
      1.8, 0.05, 0.9, life, 0.2 * span * dk, (0.42 + R() * 0.12) * span * dk, tinted, tinted, 0.4, life, 1, tb + R() * 0.15);
  }
  // the walls' pieces off the front when no stage builder throws them (a building the world has no seam for: the
  // stages throw a seamed building's own, in its buckets — `crumbled`)
  if (!crumbled) {
    const pb = Math.max(1, Math.ceil(wallH / 0.9));
    for (let b = 0; b < pb; b++) {
      const h = Math.max(0.2, wallH - (b + 0.5) * 0.9);
      const tb = collapseFrontTime(h, wallH);
      const n = Math.max(2, Math.round(perim / 3));
      for (let i = 0; i < n; i++) {
        footprintEdge(e, cosY, sinY, perim, (i + R()) / n, p);
        const v = 0.4 + R() * 1.2;
        piece(C, L, p[0] - p[2] * 0.2, e.baseY + h, p[1] - p[3] * 0.2, p[2] * v, -0.3 + R() * 0.5, p[3] * v,
          0.25 + R() * 0.35, 18 + R() * 6, tb + R() * 0.1);
      }
    }
  }
  // 3. the body: one mass rising off the pile as the last courses land, born at its foot, spreading and thinning
  const massN = Math.round(Math.min(12, 7 + perim / 8));
  for (let i = 0; i < massN; i++) {
    const lx = (R() * 2 - 1) * e.hw * 0.75, lz = (R() * 2 - 1) * e.hd * 0.75;
    const wx = e.cx + lx * cosY + lz * sinY, wz = e.cz - lx * sinY + lz * cosY;
    const at = frontEnd * 0.55 + (i / massN) * (frontEnd * 0.45 + 0.8) + R() * 0.3;
    const life = 10 + R() * 1.5;
    puff(C, wx, e.baseY + 0.9, wz, (R() - 0.5) * 1.0, 0.8 + R() * 0.6, (R() - 0.5) * 1.0,
      1.3, 0.5 + R() * 0.3, 1.0, life, 0.55 * low * dk, (1.3 + R() * 0.3) * low * dk, tintDark, tinted, 0.42, life, 2, at, 1, 4.5);
  }
}

/** A shaft's fall as the stages lay it (structureStages structureTopple): its world direction, landing and reach. */
interface ToppleFx { dirX: number; dirZ: number; landS: number; lengthM: number; hingeM: number }

/**
 * A shaft goes over (dcore 2026-10-09, wave 294b: "the stack telescopes straight down... the dust is a small white cotton
 * puff at the base"): its foot blows out low as the blow breaks it, a little grit streams off it as it swings, and as it
 * lands it throws one long wall of dust up off the whole fall line, rolling out to both sides and rising slowly, with
 * its broken courses bouncing out along the line. In the shaft's own colour.
 */
function toppleFx(C: BlastContext, e: StructureStageEvent, L: StructureLook, powder: Rgb, f: ToppleFx): void {
  const R = C.rand;
  const tinted = brickDust(L, powder, _tint);
  const dark: Rgb = [tinted[0] * 0.62, tinted[1] * 0.6, tinted[2] * 0.58];
  const dk = C.distBoost(e.cx, e.baseY, e.cz);
  const dx = f.dirX, dz = f.dirZ, tx = -dz, tz = dx;
  const foot = Math.max(1, Math.max(e.hw, e.hd));
  // 1. the foot blows out: low and outward, most of it away from the blow's side
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + R() * 0.6;
    const ox = Math.cos(a), oz = Math.sin(a);
    const v = 2.5 + R() * 2.5 + Math.max(0, ox * dx + oz * dz) * 2;
    const life = 6 + R() * 2;
    puff(C, e.cx + ox * foot, e.baseY + 0.6 + R() * f.hingeM, e.cz + oz * foot, ox * v, 0.4 + R() * 0.5, oz * v, 2.0, 0.15,
      0.9, life, 1.0 * dk, (3.2 + R() * 1.4) * dk, dark, tinted, 0.6, life, 1, R() * 0.12, 1.4 + R() * 0.4);
  }
  // 2. grit off the swinging shaft, dropping behind it along the line
  for (let i = 0; i < 5; i++) {
    const along = foot + (0.2 + 0.6 * R()) * f.lengthM * 0.6;
    const life = 4 + R() * 1.5;
    puff(C, e.cx + dx * along * 0.5, e.baseY + f.hingeM + f.lengthM * (0.3 + 0.4 * R()), e.cz + dz * along * 0.5,
      dx * 1.2, -1.2 - R(), dz * 1.2, 1.8, 0.05, 0.9, life, 0.6 * dk, (2.2 + R()) * dk, tinted, tinted, 0.35, life, 1,
      f.landS * (0.45 + 0.35 * R()));
  }
  // 3. the landing: one long wall of dust up off the whole line, rolling out to both sides, rising and spreading slowly
  const n = Math.max(5, Math.round(f.lengthM / 2.2));
  for (let i = 0; i < n; i++) {
    const along = foot + ((i + R() * 0.6) / n) * f.lengthM;
    const x = e.cx + dx * along, z = e.cz + dz * along;
    const gy = C.groundY(x, z);
    for (const side of [-1, 1]) {
      const v = 3 + R() * 3;
      const life = 9 + R() * 4;
      puff(C, x + tx * side * 0.8, gy + 0.7, z + tz * side * 0.8, tx * side * v + dx * (R() - 0.3) * 2, 0.5 + R() * 0.6,
        tz * side * v + dz * (R() - 0.3) * 2, 1.9, 0.3 + R() * 0.25, 0.9, life, 1.2 * dk, (3.6 + R() * 1.6) * dk,
        dark, tinted, 0.42, life, 1, f.landS + 0.15 + (along / Math.max(1, f.lengthM + foot)) * 0.12 + R() * 0.1, 1.8 + R() * 0.5);
    }
    // the cloud's body rising off the line, slower and lighter
    const life = 12 + R() * 4;
    puff(C, x, gy + 2.0, z, (R() - 0.5) * 0.8, 0.8 + R() * 0.5, (R() - 0.5) * 0.8, 1.2, 0.6 + R() * 0.3, 1.0, life,
      1.6 * dk, (5 + R() * 2) * dk, tinted, tinted, 0.3, life, 2, f.landS + 0.5 + R() * 0.5);
  }
  // 4. its broken courses bouncing out along the line as it lands
  const pieces = Math.round(Math.min(48, 10 + f.lengthM * 1.2));
  for (let i = 0; i < pieces; i++) {
    const along = foot + R() * f.lengthM;
    const x = e.cx + dx * along, z = e.cz + dz * along;
    const v = 2 + R() * 5;
    const side = R() < 0.5 ? -1 : 1;
    piece(C, L, x, C.groundY(x, z) + 0.6, z, tx * side * v * 0.6 + dx * v * 0.5, 2 + R() * 4, tz * side * v * 0.6 + dz * v * 0.5,
      0.12 + R() * 0.3, 16 + R() * 6, f.landS + R() * 0.1);
  }
}

/** The dust of a falling building in its own colour: its powder (dustOf) pulled toward its main rubble's hue (wave 277:
 *  a brick house's collapse threw cream), luminance held under a pale stone's. */
function brickDust(look: StructureLook, powder: Rgb, out: [number, number, number]): Rgb {
  let main = look.rubble[0];
  for (const s of look.rubble) if (s.share > main.share) main = s;
  // (dcore 2026-10-09, waves 294a/b: "white cotton puffs", "cream") nearer the rubble's own hue and darker: the volume
  // medium's sun and sky lift it a long way, so a brick building's cloud reads brick-brown, a stone one's grey-buff
  // (the battle strips, b3: a brick farmhouse's cloud came out salmon-orange) a third of the way to the rubble's hue,
  // then a third of its saturation taken back: brick dust is a reddish grey-tan, never a dyed orange
  out[0] = powder[0] + (main.color[0] * 0.85 - powder[0]) * 0.35;
  out[1] = powder[1] + (main.color[1] * 0.85 - powder[1]) * 0.35;
  out[2] = powder[2] + (main.color[2] * 0.85 - powder[2]) * 0.35;
  let lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  for (let i = 0; i < 3; i++) out[i] = out[i] * 0.7 + lum * 0.3;
  lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  if (lum > 0.26) { const k = 0.26 / lum; out[0] *= k; out[1] *= k; out[2] *= k; }
  return out;
}
const _tint: [number, number, number] = [0, 0, 0];

/**
 * A section of a structure fell (P2, DESTRUCTION.md §3.4: a wall panel above its stub, the roof, an upper storey once
 * its faces are down; the stages module drops its intact parts and the kit throws its pieces): the dust of its fall in
 * the building's own colour — a sheet sliding down the face and bursting out low along its foot, the roof's dust
 * thrown up and out round the eaves, a storey's skirt rolling out all round. Live events only.
 */
/** The breach event as P2 fills it (sim/destructionEvents.ts on the sections branch: a fall carries the structure's identity). */
type SectionFallEvent = StructureBreachEvent & {
  storeyDown?: boolean; baseY?: number; cx?: number; cz?: number; hw?: number; hd?: number;
};
export function sectionFallFx(C: BlastContext, e: SectionFallEvent, look: StructureLook | null): void {
  if (e.settled || !e.sectionDown) return;
  const L = look ?? FALLBACK_LOOK;
  const R = C.rand;
  // (round 7, wave 277) a falling section's dust in the building's own colour (its powder pulled toward its main
  // rubble's hue), as the collapse's
  const dust = brickDust(L, dustOf(L, _dust), _tint);
  const dark: Rgb = [dust[0] * 0.6, dust[1] * 0.6, dust[2] * 0.6];
  const dk = C.distBoost(e.x, e.y, e.z);
  const band = Math.max(1, e.y1 - e.y0);
  if (e.sectionKind === 'roof') {
    // the covering and its dust go up off the ridge and pour out over the eaves
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU;
      const life = 5 + R() * 2;
      puff(C, e.x + Math.cos(a) * 2, e.y0 + band * (0.3 + 0.4 * R()), e.z + Math.sin(a) * 2, Math.cos(a) * 2.5, 1.2 + R(), Math.sin(a) * 2.5,
        1.6, 0.25, 0.9, life, 1.5 * dk, (4 + R() * 2) * dk, dark, dust, 0.6, life, 2, 0.1 + R() * 0.3);
    }
  } else {
    // the panel's dust: a sheet sliding down its face as it goes, then bursting out low along its foot
    const nx = e.nx || 0, nz = e.nz || 0;
    const tx = -nz, tz = nx;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1) - 0.5) * 6;
      const life = 4 + R() * 1.5;
      puff(C, e.x + tx * u + nx * 0.6, e.y0 + band * (0.4 + 0.4 * R()), e.z + tz * u + nz * 0.6, nx * 1.5, -1.2 - R(), nz * 1.5,
        1.8, 0.1, 0.9, life, 1.2 * dk, (3 + R() * 1.2) * dk, dust, dust, 0.45, life, 1, R() * 0.2, 0.8);
    }
    for (let i = 0; i < n + 2; i++) {
      const u = (i / (n + 1) - 0.5) * 7;
      const v = 3 + R() * 3;
      const life = 5 + R() * 2;
      puff(C, e.x + tx * u + nx * 0.8, Math.max(e.y0, e.baseY ?? e.y0) + 0.6, e.z + tz * u + nz * 0.8, nx * v + tx * (R() - 0.5) * 2, 0.4 + R() * 0.4,
        nz * v + tz * (R() - 0.5) * 2, 1.9, 0.12, 0.9, life, 1.2 * dk, (3.2 + R() * 1.4) * dk, dark, dust, 0.65, life, 1, 0.35 + R() * 0.3, 1.6);
    }
  }
  if (e.storeyDown) {
    // the storey comes down on the one below: a skirt rolling out all round at its floor line, a little dust rising
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + (R() - 0.5) * 0.5;
      const life = 6 + R() * 3;
      const r = Math.max(e.hw ?? 4, e.hd ?? 4);
      puff(C, (e.cx ?? e.x) + Math.cos(a) * r, e.y0 + 0.4, (e.cz ?? e.z) + Math.sin(a) * r, Math.cos(a) * (5 + R() * 3), 0.5 + R() * 0.5,
        Math.sin(a) * (5 + R() * 3), 1.9, 0.18, 0.9, life, 1.5 * dk, (4 + R() * 2) * dk, dark, dust, 0.7, life, 1, 0.1 + R() * 0.3, 1.6);
    }
  }
}

/**
 * A round striking a wall (shell:expired on a structure or a hard prop): an explosive one bursts on it (flash, a
 * short fireball and its residue smoke, the wall's own dust thrown off the face and its pieces), a kinetic one chips it (a jet of the
 * face's dust and a few pieces). `look` is the building's anatomy reduced to its rubble shares, or null.
 */
export function wallStrike(C: BlastContext, x: number, y: number, z: number, nx: number, ny: number, nz: number,
  explosive: boolean, scale: number, look: StructureLook | null, bo = 0): void {
  const L = look ?? FALLBACK_LOOK;
  const R = C.rand;
  const dust = dustOf(L, _dust);
  const dark: Rgb = [dust[0] * 0.6, dust[1] * 0.6, dust[2] * 0.6];
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  const dk = C.distBoost(x, y, z);
  const k = Math.max(0.35, scale);
  if (explosive) {
    const lp = C.lp;
    lp.pos[0] = x + nx * 0.3; lp.pos[1] = y + ny * 0.3; lp.pos[2] = z + nz * 0.3;
    lp.vel[0] = nx; lp.vel[1] = ny + 0.4; lp.vel[2] = nz; lp.life = 0.07;
    lp.size0 = 1.2 * k * dk; lp.size1 = 3.4 * k * dk; lp.rot = R() * TAU; lp.rotVel = 0;
    lp.col0[0] = 1; lp.col0[1] = 0.96; lp.col0[2] = 0.86; lp.col1[0] = 1; lp.col1[1] = 0.55; lp.col1[2] = 0.16;
    lp.alpha = 1; lp.grav = 0; lp.birthOffset = bo;
    C.flash(lp);
    // (b4: the struck wall flooded orange from a light a metre off it) the light stands off the face
    // (dcore 2026-10-09, waves 294a/b: "an orange light wash on an intact wall", lingering 2-11 s over a volley) a flash,
    // not the kill light's 1.9 s decay: a fifth of a second, front-loaded, so the wall reads in its own colour again
    // before the dust has spread
    // (the battle strips, b2: a 0.2 s pulse at the kill light's strength still painted the facade and the street orange in
    // the frame after each hit) dimmer, shorter and nearer white: the detonation's flash, never a lamp
    C.lightPulse(x + nx * 1.6, y + 0.5, z + nz * 1.6, Math.min(0.5, 0.18 + 0.14 * k), 0, 0.14, 0xffc898);
    // the detonation's own fire and smoke on the face, as a ground burst has them: a hot billow cooling to residue in
    // half a second, then the residue's grey smoke drifting off
    for (let i = 0; i < 2; i++) {
      const sp = (2 + R() * 2) * Math.sqrt(k);
      const life = 1.6 + R() * 0.6;
      hot(C, x + nx * 0.6, y + ny * 0.6 + 0.2, z + nz * 0.6, nx * sp + (R() - 0.5), ny * sp + 1.5 + R(), nz * sp + (R() - 0.5),
        2.2, 1.2, 0.5, life, 1.2 * k * dk, (3.2 + R()) * k * dk, dark, dark, 0.92, 1.05, 5.5, bo - 0.02);
    }
    // (round 7, wave 277: a grey ball hid the building at the moment it came down) the detonation's smoke goes up off
    // the face in the wall's own dust, one puff
    {
      const life = 4 + R() * 1.5;
      hot(C, x + nx * 1.0, y + 0.8, z + nz * 1.0, nx * 0.6 + (R() - 0.5) * 0.6, 1.6 + R() * 0.6, nz * 0.6 + (R() - 0.5) * 0.6,
        1.2, 0.9 + R() * 0.3, 1, life, 1.0 * k * dk, (2.6 + R()) * k * dk, dark, dust, 0.4, 0, 1, bo + 0.15 + R() * 0.2);
    }
  }
  // (wave 266: a struck house vanished in opaque dust for seconds) the strike's cloud bursts off the face dense and
  // thins within a few seconds, so the wall behind it (and the hole the stage cut) comes back while it drifts
  // (round 7, wave 277: the 152 mm's cloud walled the building off for the second it came down) it fans out along the
  // face and up, thinner, so the wall and its fall stay in sight
  const n = explosive ? 3 + Math.round(k) : 1;
  const tx = -nz, tz = nx;
  for (let i = 0; i < n; i++) {
    const sp = (explosive ? 6 : 4) * (0.6 + 0.6 * R()) * Math.sqrt(k);
    const side = (i / Math.max(1, n - 1) - 0.5) * 2 * (explosive ? 1.1 : 0.4) + (R() - 0.5) * 0.4;
    const life = (explosive ? 3.2 : 2.6) + R() * 1.4;
    puff(C, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, (nx * 0.7 + tx * side) * sp, ny * sp + 0.8 + R(), (nz * 0.7 + tz * side) * sp,
      2.4, 0.3, 0.9, life, 0.45 * k * dk, (explosive ? 2.7 : 2) * k * dk, i === 0 ? dark : dust, dust,
      explosive ? 0.58 : 0.6, life, 2, R() * 0.04);
  }
  const pieces = Math.round((explosive ? 14 : 5) * Math.min(2, k));
  for (let i = 0; i < pieces; i++) {
    // (dcore 2026-10-09: a burst's pieces shot ten metres over the roofline like a firework) thrown out of the hole
    // and down the face, most landing within a few metres of the wall
    const v = (explosive ? 3 + R() * 6 : 2.5 + R() * 4) * Math.sqrt(k);
    piece(C, L, x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, (nx + (R() - 0.5) * 0.9) * v, (ny + 0.3 + R() * 0.6) * v,
      (nz + (R() - 0.5) * 0.9) * v, 0.05 + R() * (explosive ? 0.22 : 0.1), 12 + R() * 6, R() * 0.03);
  }
}

/** The prop families effects.ts breaks (propBreakFamily) that this module dresses in their own materials. */
export type PropFamily = 'woodbuilding' | 'canvasbuilding' | 'metalbuilding' | 'masonry' | 'sandbag' | 'wood' | 'hay';

const CANVAS_LOOK = look(0x14120f, ['canvas', 0x8f8467, 0.7], ['timber', 0x6a5238, 0.3]);
const HAY_LOOK = look(0x161208, ['thatch', 0xb59a5c, 0.85], ['earth', 0x6e5c45, 0.15]);

/**
 * A prop breaking under a blow or a hull (props.ts breakRecord via effects.ts propBreak): its own pieces thrown along
 * the blow (planks splinter, sheets fold, stones and mud bricks tumble, bags burst into earth, bales into straw) and
 * the dust of its material, low and rolling. `push` is the blow's direction scaled by its strength (1 = a shell).
 */
export function propBreakFx(C: BlastContext, family: PropFamily, kind: string, x: number, z: number, gy: number,
  pushX: number, pushZ: number, heightM: number): void {
  const R = C.rand;
  const L = family === 'metalbuilding' ? METAL_LOOK
    : family === 'canvasbuilding' ? CANVAS_LOOK
      : family === 'masonry' ? (/adobe/.test(kind) ? ADOBE_LOOK : STONE_LOOK)
        : family === 'sandbag' ? EARTH_LOOK
          : family === 'hay' ? HAY_LOOK
            : WOOD_LOOK;
  const dust = dustOf(L, _dust);
  const big = family === 'woodbuilding' || family === 'canvasbuilding' || family === 'metalbuilding';
  const strength = Math.min(2.5, Math.max(0.4, Math.hypot(pushX, pushZ)));
  const dl = Math.hypot(pushX, pushZ) || 1;
  const dx = pushX / dl, dz = pushZ / dl;
  const span = big ? 2.6 : 1.2;
  const h = Math.max(0.6, Math.min(big ? 3 : 1.4, heightM));
  const dk = C.distBoost(x, gy + h * 0.5, z);
  // the dust of the material: a few overlapping puffs low over the footprint, pushed along the blow
  const n = big ? 4 : family === 'hay' || family === 'sandbag' ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU;
    const r = R() * span * 0.5;
    const sp = (1.5 + R() * 2) * strength;
    puff(C, x + Math.cos(a) * r, gy + 0.5 + R() * h * 0.4, z + Math.sin(a) * r,
      dx * sp + Math.cos(a) * 1.2, 0.6 + R() * 0.8, dz * sp + Math.sin(a) * 1.2, 2.0, 0.2, 0.9, 3.8 + R() * 2,
      0.5 * span * dk, (1.4 + R() * 0.5) * span * dk, dust, dust, family === 'hay' ? 0.55 : 0.75, 4, 2, R() * 0.05);
  }
  // the pieces of the prop's own materials
  const pieces = big ? 22 : family === 'masonry' ? 14 : family === 'hay' ? 12 : 10;
  for (let i = 0; i < pieces; i++) {
    const v = (2 + R() * 4) * strength;
    const a = R() * TAU;
    piece(C, L, x + (R() - 0.5) * span, gy + 0.3 + R() * h * 0.6, z + (R() - 0.5) * span,
      dx * v + Math.cos(a) * (1 + R() * 2.5), 1.5 + R() * 3.5, dz * v + Math.sin(a) * (1 + R() * 2.5),
      (big ? 0.12 : 0.08) + R() * (big ? 0.3 : 0.18), 3 + R() * 2.5, R() * 0.04);
  }
}

