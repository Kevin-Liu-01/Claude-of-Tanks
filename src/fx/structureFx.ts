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
 *   collapsed  the building comes down: dust bursts out of the base on every side and rolls outward low, a column of
 *              dust rises over the footprint, pieces of its walls and roof fall and bounce, and a pall hangs downwind
 *              for twenty seconds; a fire-killed or HE-struck building smokes
 *
 * Draws only through the blast context (volume media, thrown chunks, additive light): seeded, pooled, no allocation.
 * A settled event (a late joiner, a reconnect) draws nothing: its stage is laid down by the world, silently.
 */
import type { StructureStageEvent } from '../sim/destructionEvents.ts';
import type { BlastContext } from './blastRecipes.ts';
import type { ChunkShape } from './debrisChunks.ts';
import { linearHex } from './surfaceLooks.ts';

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
    r += (s.color[0] * 0.55 + 0.32) * s.share * k; g += (s.color[1] * 0.55 + 0.3) * s.share * k;
    b += (s.color[2] * 0.55 + 0.27) * s.share * k; w += s.share * k;
  }
  if (w <= 0) { out[0] = 0.55; out[1] = 0.52; out[2] = 0.47; return out; }
  out[0] = r / w; out[1] = g / w; out[2] = b / w;
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

function puff(C: BlastContext, x: number, y: number, z: number, vx: number, vy: number, vz: number, drag: number,
  rise: number, windK: number, life: number, size0: number, size1: number, c0: Rgb, c1: Rgb, density: number,
  play: number, start: number, bo: number): void {
  const m = C.m;
  const R = C.rand;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = 0;
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = 2.6; m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = 0.08; m.fadeOut = 0.45;
  m.medium = 'burst'; m.variant = Math.floor(R() * 4); m.mirror = R() < 0.5; m.playSeconds = play; m.startFrame = start;
  m.heat = 0; m.cool = 1;
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
  C.chunk(k);
}

/**
 * A structure crossed into a stage (live events only). `look` is the building's anatomy reduced to its rubble shares,
 * or null for the masonry fallback.
 */
export function structureStageFx(C: BlastContext, e: StructureStageEvent, look: StructureLook | null): void {
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
    const n = breach ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const sp = (breach ? 6 : 3.5) * (0.6 + 0.6 * R()) * k;
      puff(C, e.x, e.y, e.z, -dirX * sp + (R() - 0.5) * 2, 0.6 + R() * 1.4, -dirZ * sp + (R() - 0.5) * 2, 2.2,
        0.2, 0.9, 4 + R() * 2.5, 0.8 * k * dk, (breach ? 4.5 : 2.8) * k * dk, i === 0 ? dark : dust, dust,
        breach ? 0.85 : 0.7, 4.5, 2, R() * 0.05);
    }
    if (breach) {
      // the dark interior dust rolling out of the hole
      puff(C, e.x, e.y, e.z, -dirX * 2, 0.4, -dirZ * 2, 1.4, 0.15, 0.9, 6 + R() * 2, 1.2 * dk, 4.2 * dk,
        L.interior, dark, 0.6, 6, 6, 0.15);
    }
    const pieces = Math.round((breach ? 18 : 8) * k);
    for (let i = 0; i < pieces; i++) {
      const a = R() * TAU, v = (3 + R() * 7) * k;
      piece(C, L, e.x, e.y, e.z, -dirX * v * 0.7 + Math.cos(a) * v * 0.4, 1.5 + R() * 4, -dirZ * v * 0.7 + Math.sin(a) * v * 0.4,
        0.08 + R() * (breach ? 0.3 : 0.16), 3 + R() * 2, R() * 0.06);
    }
    return;
  }
  if (e.stage !== 'collapsed') return;
  // --- the collapse
  const cosY = Math.cos(e.yaw), sinY = Math.sin(e.yaw);
  const perim = 2 * (e.hw + e.hd);
  // 1. dust bursting out of the base on every side as the floors come down, rolling outward low
  const ring = Math.round(Math.min(18, 6 + perim / 4));
  for (let i = 0; i < ring; i++) {
    const t = (i + R() * 0.5) / ring;
    // a point on the footprint rectangle's perimeter (local), its outward normal
    let lx, lz, nx, nz;
    const d = t * perim;
    if (d < 2 * e.hw) { lx = -e.hw + d; lz = -e.hd; nx = 0; nz = -1; }
    else if (d < 2 * e.hw + 2 * e.hd) { lx = e.hw; lz = -e.hd + (d - 2 * e.hw); nx = 1; nz = 0; }
    else if (d < 4 * e.hw + 2 * e.hd) { lx = e.hw - (d - 2 * e.hw - 2 * e.hd); lz = e.hd; nx = 0; nz = 1; }
    else { lx = -e.hw; lz = e.hd - (d - 4 * e.hw - 2 * e.hd); nx = -1; nz = 0; }
    const wx = e.cx + lx * cosY + lz * sinY, wz = e.cz - lx * sinY + lz * cosY;
    const onx = nx * cosY + nz * sinY, onz = -nx * sinY + nz * cosY;
    const v = (7 + R() * 6) * Math.sqrt(span / 5);
    puff(C, wx, e.baseY + 0.8, wz, onx * v, 0.5 + R() * 0.8, onz * v, 1.9, 0.18, 0.9, 9 + R() * 5,
      0.35 * span * dk, (0.85 + R() * 0.4) * span * dk, dark, dust, 0.85, 7, 1, 0.25 + R() * 0.45);
  }
  // 2. the column of dust over the footprint, rising as the building sinks into it
  const col = Math.round(Math.min(10, 3 + height / 3 + span / 4));
  for (let i = 0; i < col; i++) {
    const a = R() * TAU, r = R() * span * 0.5;
    const h = e.baseY + height * (0.2 + 0.7 * R());
    puff(C, e.cx + Math.cos(a) * r, h, e.cz + Math.sin(a) * r, Math.cos(a) * 1.5, 2 + R() * 2.5, Math.sin(a) * 1.5,
      1.2, 0.5 + R() * 0.4, 0.85, 12 + R() * 6, 0.4 * span * dk, (1.1 + R() * 0.5) * Math.max(span, height * 0.7) * dk,
      dust, dust, 0.8, 9, 3, 0.15 + R() * 0.9);
  }
  // 3. the walls and the roof fall: pieces from all heights, thrown out a little along the blow, bouncing
  const pieces = Math.round(Math.min(90, 24 + perim * 1.6 + height * 3));
  for (let i = 0; i < pieces; i++) {
    const t = R();
    let lx = (R() * 2 - 1) * e.hw, lz = (R() * 2 - 1) * e.hd;
    if (t < 0.7) { if (R() < 0.5) lx = Math.sign(lx || 1) * e.hw; else lz = Math.sign(lz || 1) * e.hd; }
    const wx = e.cx + lx * cosY + lz * sinY, wz = e.cz - lx * sinY + lz * cosY;
    const y = e.baseY + height * (0.25 + 0.75 * R());
    const out = 1 + R() * 3;
    const ox = (wx - e.cx), oz = (wz - e.cz);
    const ol = Math.hypot(ox, oz) || 1;
    piece(C, L, wx, y, wz, (ox / ol) * out + dirX * 2 * R(), R() * 1.5, (oz / ol) * out + dirZ * 2 * R(),
      0.12 + Math.pow(R(), 1.5) * 0.55, 5 + R() * 4, R() * 1.2);
  }
  // 4. the pall left hanging downwind
  const pall = Math.round(Math.min(8, 3 + span / 4));
  for (let i = 0; i < pall; i++) {
    const a = R() * TAU, r = span * (0.4 + 0.6 * R());
    puff(C, e.cx + Math.cos(a) * r, e.baseY + 1 + R() * height * 0.5, e.cz + Math.sin(a) * r, 0, 0.3, 0, 1, 0.2, 1.1,
      18 + R() * 8, 0.8 * span * dk, (1.4 + R() * 0.6) * span * dk, dust, dust, 0.45, 18, 10, 1.4 + R() * 2.5);
  }
}

/**
 * A round striking a wall (shell:expired on a structure or a hard prop): an explosive one bursts on it (flash, a
 * short fireball, the wall's own dust thrown off the face and its pieces), a kinetic one chips it (a jet of the
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
    C.lightPulse(x + nx, y + 0.5, z + nz, Math.min(1.3, 0.4 + 0.3 * k), 0);
  }
  const n = explosive ? 3 + Math.round(k) : 1;
  for (let i = 0; i < n; i++) {
    const sp = (explosive ? 7 : 4) * (0.6 + 0.6 * R()) * Math.sqrt(k);
    puff(C, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, nx * sp + (R() - 0.5) * 2, ny * sp + 0.6 + R(), nz * sp + (R() - 0.5) * 2,
      2.4, 0.2, 0.9, (explosive ? 5 : 3) + R() * 2, 0.5 * k * dk, (explosive ? 4.2 : 2) * k * dk, i === 0 ? dark : dust, dust,
      explosive ? 0.85 : 0.7, 4.5, 2, R() * 0.04);
  }
  const pieces = Math.round((explosive ? 14 : 5) * Math.min(2, k));
  for (let i = 0; i < pieces; i++) {
    const v = (explosive ? 5 + R() * 9 : 3 + R() * 5) * Math.sqrt(k);
    piece(C, L, x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, (nx + (R() - 0.5) * 0.9) * v, (ny + 0.3 + R() * 0.6) * v,
      (nz + (R() - 0.5) * 0.9) * v, 0.05 + R() * (explosive ? 0.22 : 0.1), 2.5 + R() * 2, R() * 0.03);
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

