/**
 * impactDecals.ts — procedural ballistic armor-scarring decals.
 *
 * Replaces the legacy combat-effects "armor scar" pool (14 shared near-black
 * MeshBasicMaterial quads re-parented onto struck hull roots — the "plain
 * black rhombus" read, made literal on wrecks when tankFactory's burn sweep
 * swapped the un-hookable Basic material for the opaque shared burnt
 * material). This module bakes a 1024² canvas atlas of mark families and
 * stamps caliber-scaled, tangent-oriented quads into the struck NODE's local
 * space (hull root or rig_turret), batched into at most one mesh per node
 * per vehicle.
 *
 * Mark families (each with rotation/size/tint jitter + baked variants):
 *  - pen    penetration: dark hole, molten rim ring, 4-7 radial spall
 *           streaks + bright metal scratches, soft scorch halo
 *  - crit   module/crew penetration: darker soot, wider halo, deeper rim
 *  - gouge  ricochet: elongated bare-metal scrape aligned to the impact
 *           tangent (shell direction projected onto the plate), bright
 *           silvery brushed streaks with a directional taper and a faint
 *           heat tint at the entry end — NO hole
 *  - scorch HE splash (and ERA pops at reduced size): wide shallow ragged
 *           soot blot, low alpha at the edge, no hole
 *  - scuff  blunt non-penetration: small chipped-paint dish, no hole
 *
 * Placement: uses the exact articulation-local contact emitted by armor.ts
 * (HitEvent.impactFrame / impactLocal*) so a hull, traversed turret, or
 * elevated gun-housing strike is parented directly to the rig that was
 * traced. Legacy events retain the hull-local envelope fallback. This keeps
 * marks fixed to their true surface even if a tank moves before presentation.
 *
 * Lifecycle: per-vehicle ring of IMPACT_DECAL_CAP quads (oldest evicted),
 * persistent for the battle, cleared when the vehicle wrecks (matching the
 * profile decalMeshes hidden by setDestroyed) and on resetAll(). Clearing on
 * destruction is also what keeps the burn sweep from ever re-materializing
 * a decal mesh into an opaque burnt quad.
 *
 * Perf: one shared CanvasTexture atlas + one shared material; ≤ 2 batched
 * meshes (hull/turret) per struck vehicle; CPU cost only at stamp time
 * (4 vertices written). All randomness through the injected seeded rng.
 */
import * as THREE from 'three';
import { mulberry32, makeFbm } from './particles.ts';
import { SURFACE_MARKING_STYLE } from '../vehicles/vehicleMarkings.ts';

/** Per-vehicle decal budget (oldest evicted beyond this). */
export const IMPACT_DECAL_CAP = 24;
/** Millimetre-scale separation avoids z-fighting without a visible air gap. */
export const IMPACT_DECAL_LIFT_M = SURFACE_MARKING_STYLE.surfaceLiftM;

// --- atlas layout ------------------------------------------------------------
const ATLAS = 1024;
const GRID = 4;
const CELL = ATLAS / GRID; // 256 px
const PAD = 4;             // px inset per cell edge (mip bleed guard)
const FAMILY_CELLS = {
  pen: [0, 1, 2, 3],
  crit: [4, 5],
  scuff: [6, 7, 15],
  gouge: [8, 9, 10, 11],
  scorch: [12, 13, 14],
} as const;

type Rng = () => number;
type Fbm = (x: number, y: number) => number;
type ImpactFamily = keyof typeof FAMILY_CELLS;
type DecalNodeKey = 'hull' | 'turret' | 'gun';
type ImpactFrame = DecalNodeKey | 'barrel';
type Vec3Tuple = readonly [number, number, number];

interface ImpactDecalOptions {
  anisotropy?: number;
  seed?: number;
}

interface ImpactVisual {
  root: THREE.Object3D;
  isDestroyed?(): boolean;
}

interface ArmorPlate {
  verts?: readonly Vec3Tuple[];
}

interface ImpactArmor {
  turretPivot?: Vec3Tuple;
  gunPivot?: Vec3Tuple;
  turretPlates?: readonly ArmorPlate[];
}

interface ImpactSpec {
  id: string;
  armor?: ImpactArmor;
}

interface ImpactState {
  pos?: THREE.Vector3;
  yaw?: number;
  turretYaw?: number;
  visualPitch?: number;
  visualRoll?: number;
}

interface ImpactEntity {
  visual?: ImpactVisual | null;
  state: ImpactState;
  spec?: ImpactSpec;
}

interface ImpactEvent {
  kind?: string;
  targetId?: string | number;
  caliberMm?: number;
  zone?: string;
  modulesHit?: readonly { module: string; newState: string; dmg: number }[];
  crewHit?: readonly string[];
  ammoRacked?: boolean;
  fireStarted?: boolean;
  impactFrame?: ImpactFrame;
  impactLocalPos?: Vec3Tuple;
  impactLocalNormal?: Vec3Tuple;
  impactLocalDir?: Vec3Tuple;
  localPos?: Vec3Tuple;
  localDir?: Vec3Tuple;
  pos?: Vec3Tuple;
  normal?: Vec3Tuple;
}

interface ClassifiedMark {
  fam: ImpactFamily;
  sizeK: number;
}

export interface ImpactDecalDescriptor {
  family: ImpactFamily;
  sizeK: number;
  hasHole: boolean;
  variants: number;
}

/** Stable visual contract between authoritative armor outcomes and scars. */
export function impactDecalDescriptor(
  kind: string | null | undefined,
  critical = false,
): ImpactDecalDescriptor | null {
  let fam: ImpactFamily;
  let sizeK = 1;
  let hasHole = false;
  if (kind === 'pen' || kind === 'he_pen') {
    fam = critical ? 'crit' : 'pen';
    sizeK = kind === 'he_pen' ? 1.3 : 1;
    hasHole = true;
  } else if (kind === 'ricochet') {
    fam = 'gouge';
  } else if (kind === 'nonpen') {
    fam = 'scuff';
  } else if (kind === 'spaced_absorb') {
    fam = 'scuff';
    sizeK = 1.12;
  } else if (kind === 'era') {
    fam = 'scorch';
    sizeK = 0.55;
  } else if (kind === 'he_splash') {
    fam = 'scorch';
  } else {
    return null;
  }
  return { family: fam, sizeK, hasHole, variants: FAMILY_CELLS[fam].length };
}

interface MarkSize {
  w: number;
  h: number;
}

interface MarkShade {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface CellUv {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

interface NodeMesh {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  geo: THREE.BufferGeometry;
  pos: THREE.Float32BufferAttribute;
  uv: THREE.Float32BufferAttribute;
  col: THREE.Float32BufferAttribute;
  used: number;
  free: number[];
}

interface RingEntry {
  nodeKey: DecalNodeKey;
  slot: number;
}

interface DecalRecord {
  key: string;
  visual: ImpactVisual;
  hull: NodeMesh | null;
  turret: NodeMesh | null;
  gun: NodeMesh | null;
  turretNode: THREE.Object3D | null;
  gunNode: THREE.Object3D | null;
  ring: Array<RingEntry | undefined>;
  head: number;
  count: number;
  lastStampT: number;
}

interface TurretEnvelope {
  mn: [number, number, number];
  mx: [number, number, number];
}

interface StampRoute {
  nodeKey: DecalNodeKey;
  node: THREE.Object3D;
}

export interface ImpactDecalStats {
  vehicles: number;
  decals: number;
  meshes: number;
  pooled: number;
}

export interface ImpactDecalRuntime {
  readonly material: THREE.MeshBasicMaterial;
  stampFromEvent(event: ImpactEvent, entity: ImpactEntity): boolean;
  stampDirect(
    visual: ImpactVisual,
    worldPos: THREE.Vector3,
    worldNormal: THREE.Vector3,
    caliberMm: number,
    kind?: string,
  ): boolean;
  clearVehicle(keyOrVisual: string | number | ImpactVisual | null | undefined): void;
  clearAll(): void;
  sweep(): void;
  stats(): ImpactDecalStats;
}

// ---------------------------------------------------------------------------
// Atlas bake (2D canvas, seeded — no external assets)
// ---------------------------------------------------------------------------

/** Begin drawing one cell: clipped + translated to cell space. */
function beginCell(ctx: CanvasRenderingContext2D, idx: number): [number, number] {
  const ox = (idx % GRID) * CELL;
  const oy = Math.floor(idx / GRID) * CELL;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, CELL, CELL);
  ctx.clip();
  ctx.translate(ox, oy);
  return [ox, oy];
}

/** fbm alpha erosion over one cell so no mark reads as a clean stamp. */
function erodeCell(
  ctx: CanvasRenderingContext2D,
  fbm: Fbm,
  ox: number,
  oy: number,
  strength: number,
  freq = 3.1,
): void {
  const img = ctx.getImageData(ox, oy, CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4 + 3;
      if (d[i] === 0) continue;
      const n = fbm((x / CELL) * freq, (y / CELL) * freq);
      const m = Math.max(0, Math.min(1, n * 2.0 - 0.35));
      d[i] = d[i] * (1 - strength + strength * m);
    }
  }
  ctx.putImageData(img, ox, oy);
}

/** Radial soot halo — several offset soft gradients so it is never a disc. */
function sootHalo(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  cx: number,
  cy: number,
  radius: number,
  alpha: number,
): void {
  for (let i = 0; i < 3; i++) {
    const ox = (rng() - 0.5) * radius * 0.22;
    const oy = (rng() - 0.5) * radius * 0.22;
    const rr = radius * (0.72 + rng() * 0.34);
    const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
    g.addColorStop(0, `rgba(16,13,11,${(alpha * (0.55 + rng() * 0.2)).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(21,17,14,${(alpha * 0.34).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
  }
}

/** Penetration cell: halo + spall streaks + molten rim + hole + scratches. */
function drawPen(ctx: CanvasRenderingContext2D, rng: Rng, crit: boolean): void {
  const c = CELL / 2;
  const R = c;
  sootHalo(ctx, rng, c, c, R * (crit ? 0.95 : 0.80), crit ? 0.75 : 0.60);
  // faint ash ring inside the halo: keeps the scorch readable on very dark
  // camo (soot-on-black otherwise vanishes in shade)
  const ag = ctx.createRadialGradient(c, c, 0, c, c, R * 0.62);
  ag.addColorStop(0.32, 'rgba(0,0,0,0)');
  ag.addColorStop(0.52, 'rgba(142,134,120,0.15)');
  ag.addColorStop(0.78, 'rgba(120,112,100,0.05)');
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ag;
  ctx.fillRect(0, 0, CELL, CELL);
  // radial spall streaks: 4-7 dark sooty rays flung from the hole
  const nStreak = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < nStreak; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.30 + rng() * 0.36);
    const w = R * (0.030 + rng() * 0.045);
    const r0 = R * 0.17;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g.addColorStop(0, `rgba(12,10,8,${0.55 + rng() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(r0 + len * 0.45, 0, len * 0.62, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // heat-tempering annulus outside the rim: oxide browns/violets where the
  // plate cooked — this is what keeps an old hit looking HOT-WORKED rather
  // than lit, and gives the mark body on any camo tone
  const rimR = R * (crit ? 0.225 : 0.20);
  const tg = ctx.createRadialGradient(c, c, 0, c, c, rimR * 2.6);
  tg.addColorStop(0.3, 'rgba(0,0,0,0)');
  tg.addColorStop(0.52, 'rgba(96,62,50,0.34)');
  tg.addColorStop(0.74, 'rgba(74,56,64,0.22)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, CELL, CELL);
  // molten rim: hot ring hugging the hole, cooling outward. Crit runs a
  // touch deeper into red (over-match heat).
  const g2 = ctx.createRadialGradient(c, c, 0, c, c, rimR * 1.9);
  g2.addColorStop(0.0, 'rgba(0,0,0,0)');
  g2.addColorStop(0.50, `rgba(255,224,170,${crit ? 0.9 : 0.85})`);
  g2.addColorStop(0.66, crit ? 'rgba(250,120,48,0.66)' : 'rgba(250,146,62,0.6)');
  g2.addColorStop(0.85, 'rgba(160,62,26,0.26)');
  g2.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, CELL, CELL);
  // molten beads spattered on the rim
  const nBead = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nBead; i++) {
    const a = rng() * Math.PI * 2;
    const d = rimR * (0.9 + rng() * 0.5);
    const r = 1.4 + rng() * 2.2;
    const bg = ctx.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0,
      c + Math.cos(a) * d, c + Math.sin(a) * d, r * 2);
    bg.addColorStop(0, 'rgba(255,214,150,0.85)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CELL, CELL);
  }
  // the hole itself: near-black core with a hard shoulder — sized so the
  // dark void reads as strongly as the rim (a hit mark, not a glowing ring)
  const holeR = R * (crit ? 0.155 : 0.14);
  const g3 = ctx.createRadialGradient(c, c, 0, c, c, holeR * 1.2);
  g3.addColorStop(0, 'rgba(3,2,2,0.985)');
  g3.addColorStop(0.78, 'rgba(6,5,4,0.97)');
  g3.addColorStop(1, 'rgba(10,8,6,0)');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, CELL, CELL);
  // bright bare-metal scratches whipped outward by spall
  const nBright = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nBright; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.18 + rng() * 0.22);
    const r0 = rimR * (1.0 + rng() * 0.4);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g4 = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g4.addColorStop(0, `rgba(214,220,228,${0.5 + rng() * 0.3})`);
    g4.addColorStop(1, 'rgba(214,220,228,0)');
    ctx.fillStyle = g4;
    ctx.fillRect(r0, -(0.6 + rng() * 0.9), len, 1.2 + rng() * 1.8);
    ctx.restore();
  }
}

/**
 * Ricochet gouge cell — drawn horizontal: entry (heat tint) at the LEFT
 * edge, brushed bare-metal streaks tapering out toward the right.
 */
function drawGouge(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const cy = CELL / 2 + (rng() - 0.5) * 10;
  const x0 = CELL * 0.08;
  // brushed-metal body: many thin horizontal sub-streaks
  const nS = 16 + Math.floor(rng() * 6);
  for (let i = 0; i < nS; i++) {
    const yy = cy + (rng() - 0.5) * CELL * 0.17;
    const sx = x0 + rng() * CELL * 0.20;
    const len = CELL * (0.30 + rng() * 0.52);
    const w = 1 + rng() * 2.6;
    const b = 150 + rng() * 92;
    const a0 = 0.28 + rng() * 0.45;
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},0)`);
    g.addColorStop(0.22, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},${a0})`);
    g.addColorStop(1, `rgba(${(b * 0.92) | 0},${(b * 0.95) | 0},${b | 0},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - w / 2, len, w);
  }
  // hottest core scrape near the entry half
  for (let i = 0; i < 3; i++) {
    const yy = cy + (rng() - 0.5) * CELL * 0.05;
    const sx = CELL * (0.14 + rng() * 0.08);
    const len = CELL * (0.26 + rng() * 0.2);
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, 'rgba(232,238,246,0)');
    g.addColorStop(0.3, `rgba(232,238,246,${0.55 + rng() * 0.3})`);
    g.addColorStop(1, 'rgba(232,238,246,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - 1.1, len, 2.2);
  }
  // dark displaced-paint burrs above/below the scrape
  for (const s of [-1, 1]) {
    const yy = cy + s * CELL * (0.085 + rng() * 0.03);
    const sx = x0 + rng() * CELL * 0.1;
    const len = CELL * (0.4 + rng() * 0.3);
    const g = ctx.createLinearGradient(sx, 0, sx + len, 0);
    g.addColorStop(0, 'rgba(24,21,18,0)');
    g.addColorStop(0.3, `rgba(24,21,18,${0.3 + rng() * 0.2})`);
    g.addColorStop(1, 'rgba(24,21,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, yy - 2, len, 4);
  }
  // faint heat tint at the entry end (friction flash where the shell bit)
  const hg = ctx.createRadialGradient(CELL * 0.20, cy, 0, CELL * 0.20, cy, CELL * 0.17);
  hg.addColorStop(0, 'rgba(255,172,92,0.34)');
  hg.addColorStop(1, 'rgba(255,140,70,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, CELL, CELL);
  // envelope: elongated ellipse biased toward the entry — kills the tail and
  // the top/bottom fringe in one pass (the directional taper)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(CELL * 0.40, cy);
  ctx.scale(2.7, 1);
  const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, CELL * 0.235);
  eg.addColorStop(0, 'rgba(255,255,255,1)');
  eg.addColorStop(0.62, 'rgba(255,255,255,0.92)');
  eg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(-CELL, -CELL, CELL * 2.5, CELL * 2);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

/** HE splash cell: wide shallow ragged soot blot — no hole, feathered edge. */
function drawScorch(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const c = CELL / 2;
  const R = c;
  const nBlot = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < nBlot; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * R * 0.34;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const rr = R * (0.30 + rng() * 0.34);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
    g.addColorStop(0, `rgba(14,11,9,${0.38 + rng() * 0.2})`);
    g.addColorStop(0.6, `rgba(18,14,11,${0.2 + rng() * 0.12})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
  }
  // radial soot lashes — blast products streaked outward
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * (0.38 + rng() * 0.5);
    const w = R * (0.02 + rng() * 0.05);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(R * 0.1, 0, R * 0.1 + len, 0);
    g.addColorStop(0, `rgba(13,10,8,${0.24 + rng() * 0.16})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(R * 0.1 + len * 0.5, 0, len * 0.62, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Blunt non-pen scuff: chipped-paint dish with a bare-metal ring. */
function drawScuff(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const c = CELL / 2;
  const R = c;
  // shallow dark smudge where the shell slammed
  const g0 = ctx.createRadialGradient(c, c, 0, c, c, R * 0.34);
  g0.addColorStop(0, 'rgba(26,22,19,0.4)');
  g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, CELL, CELL);
  // chipped ring: broken arcs of exposed metal
  const ringR = R * (0.30 + rng() * 0.05);
  const nArc = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < nArc; i++) {
    const a0 = rng() * Math.PI * 2;
    const span = 0.4 + rng() * 0.9;
    ctx.strokeStyle = `rgba(168,173,180,${0.35 + rng() * 0.3})`;
    ctx.lineWidth = 2 + rng() * 4;
    ctx.beginPath();
    ctx.arc(c, c, ringR * (0.9 + rng() * 0.25), a0, a0 + span);
    ctx.stroke();
  }
  // paint-chip scratches flung off the ring
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = ringR * (0.9 + rng() * 0.3);
    const len = R * (0.1 + rng() * 0.16);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    g.addColorStop(0, `rgba(180,184,190,${0.4 + rng() * 0.3})`);
    g.addColorStop(1, 'rgba(180,184,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(r0, -0.9, len, 1.8);
    ctx.restore();
  }
}

/** Bake the full atlas. @returns {THREE.CanvasTexture} */
function bakeAtlas(rng: Rng, anisotropy: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Impact decal atlas requires a 2D canvas context.');
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  const fbm = makeFbm(rng);
  const bake = (idx: number, draw: () => void, erode: number, freq: number): void => {
    const [ox, oy] = beginCell(ctx, idx);
    draw();
    ctx.restore();
    erodeCell(ctx, fbm, ox, oy, erode, freq);
  };
  for (const i of FAMILY_CELLS.pen) bake(i, () => drawPen(ctx, rng, false), 0.30, 3.4);
  for (const i of FAMILY_CELLS.crit) bake(i, () => drawPen(ctx, rng, true), 0.30, 3.4);
  for (const i of FAMILY_CELLS.scuff) bake(i, () => drawScuff(ctx, rng), 0.34, 4.0);
  for (const i of FAMILY_CELLS.gouge) bake(i, () => drawGouge(ctx, rng), 0.26, 5.2);
  for (const i of FAMILY_CELLS.scorch) bake(i, () => drawScorch(ctx, rng), 0.62, 2.6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.max(1, anisotropy | 0);
  return tex;
}

// ---------------------------------------------------------------------------
// Runtime: batched per-vehicle stamping
// ---------------------------------------------------------------------------

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c0 = new THREE.Vector3();
// dedicated register for the turret-frame test: stampLocal's pos/normal/dir
// arguments ARE the shared _p/_n/_d scratch (stampFromEvent fills them), so
// the pivot-shift below must never run through those same registers — doing
// so dragged every HULL stamp down by the turret pivot height.
const _pt = new THREE.Vector3();
// skin-clamp scratch (see clampToSkin)
const _raycaster = new THREE.Raycaster();
const _wp = new THREE.Vector3();
const _wn = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _wqi = new THREE.Quaternion();
const _hitN = new THREE.Vector3();
const _nm3 = new THREE.Matrix3();

/**
 * Clamp a node-local stamp point onto the vehicle's VISIBLE skin.
 *
 * The armor model's plate point (HitEvent.localPos) often sits INSIDE the
 * rendered hull — side skirts, spaced armor and GLB shells all stand proud
 * of the sim plates — which buried the mark behind the skin. Cast from
 * outside the hull back along the surface normal against the struck node's
 * meshes and adopt the first visible skin point (and its face normal, when
 * it roughly agrees) so the decal always sits ON what the player sees.
 * Mutates pos/normal in place; keeps them untouched when nothing is hit.
 * @returns {boolean} true when a skin point was adopted
 */
function clampToSkin(
  node: THREE.Object3D,
  pos: THREE.Vector3,
  normal: THREE.Vector3,
): boolean {
  // ancestors AND descendants: a stamp can land before the next visual sync
  // renders (headless probes, same-tick kills), leaving child mesh world
  // matrices stale — the ray would test yesterday's pose and miss
  node.updateWorldMatrix(true, true);
  _wp.copy(pos);
  node.localToWorld(_wp);
  node.getWorldQuaternion(_wq);
  _wn.copy(normal).applyQuaternion(_wq).normalize();
  // Stay close to the resolved armor contact. The old 1.6 m launch could hit
  // an unrelated turret/greeble first and visibly suspend the scar in space.
  _raycaster.ray.origin.copy(_wp).addScaledVector(_wn, 0.9);
  _raycaster.ray.direction.copy(_wn).negate();
  _raycaster.near = 0;
  _raycaster.far = 1.45; // still reaches spaced armor/skirts around the plate
  const hits = _raycaster.intersectObject(node, true);
  for (const h of hits) {
    if (!isVisibleOpaqueSkin(node, h.object)) continue;
    adoptSkinHit(node, h as THREE.Intersection<THREE.Mesh>, pos, normal);
    return true;
  }
  return false;
}

/** Exclude hidden helpers, transparent overlays, and the decal batch itself. */
function isVisibleOpaqueSkin(
  node: THREE.Object3D,
  object: THREE.Object3D,
): object is THREE.Mesh {
  if (!object.visible || object.name === 'fx_impactDecals') return false;
  if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return false;
  for (let parent = object.parent; parent && parent !== node; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  return !!material && material.colorWrite !== false && material.transparent !== true;
}

/** Move the stamp to a ray hit and adopt a compatible rendered-skin normal. */
function adoptSkinHit(
  node: THREE.Object3D,
  hit: THREE.Intersection<THREE.Mesh>,
  pos: THREE.Vector3,
  normal: THREE.Vector3,
): void {
  node.worldToLocal(pos.copy(hit.point));
  if (!hit.face) return;
  _nm3.getNormalMatrix(hit.object.matrixWorld);
  _hitN.copy(hit.face.normal).applyMatrix3(_nm3).normalize();
  _wqi.copy(_wq).invert();
  _hitN.applyQuaternion(_wqi);
  // Never re-aim a side mark onto a perpendicular greeble face.
  if (_hitN.dot(normal) > 0.45) normal.copy(_hitN).normalize();
}

/** Compute a turret-local AABB once per immutable armor specification. */
function computeTurretEnvelope(plates?: readonly ArmorPlate[]): TurretEnvelope | null {
  if (!plates?.length) return null;
  const env: TurretEnvelope = {
    mn: [Infinity, Infinity, Infinity],
    mx: [-Infinity, -Infinity, -Infinity],
  };
  for (const plate of plates) {
    if (!Array.isArray(plate.verts)) continue;
    for (const vertex of plate.verts) expandTurretEnvelope(env, vertex);
  }
  return env.mn[0] < env.mx[0] ? env : null;
}

function expandTurretEnvelope(env: TurretEnvelope, vertex: Vec3Tuple): void {
  env.mn[0] = Math.min(env.mn[0], vertex[0]);
  env.mn[1] = Math.min(env.mn[1], vertex[1]);
  env.mn[2] = Math.min(env.mn[2], vertex[2]);
  env.mx[0] = Math.max(env.mx[0], vertex[0]);
  env.mx[1] = Math.max(env.mx[1], vertex[1]);
  env.mx[2] = Math.max(env.mx[2], vertex[2]);
}

/** UV rect for an atlas cell (respects CanvasTexture flipY). */
function cellUV(idx: number): CellUv {
  const col = idx % GRID;
  const row = Math.floor(idx / GRID);
  return {
    u0: (col * CELL + PAD) / ATLAS,
    u1: ((col + 1) * CELL - PAD) / ATLAS,
    // canvas y-down vs texture v-up
    v0: 1 - ((row + 1) * CELL - PAD) / ATLAS,
    v1: 1 - (row * CELL + PAD) / ATLAS,
  };
}

/**
 * @param {{ anisotropy?: number, seed?: number }} [opts]
 */
export function createImpactDecals(
  { anisotropy = 4, seed = 0x51f7a3 }: ImpactDecalOptions = {},
): ImpactDecalRuntime {
  const rng: Rng = mulberry32(seed >>> 0);
  // Field-painted identifiers and ballistic scars share the same deterministic
  // surface-marking seed vocabulary and millimetre-scale lift contract.
  const atlas = bakeAtlas(mulberry32((seed ^ SURFACE_MARKING_STYLE.wearSeedSalt) >>> 0), anisotropy);
  const material = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    vertexColors: true, // itemSize-4 color attr: per-stamp tint + alpha
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  /** Pooled batched node-mesh: capacity IMPACT_DECAL_CAP quads. */
  function makeNodeMesh(): NodeMesh {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 12), 3);
    const uv = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 8), 2);
    const col = new THREE.Float32BufferAttribute(new Float32Array(IMPACT_DECAL_CAP * 16), 4);
    pos.setUsage(THREE.DynamicDrawUsage);
    uv.setUsage(THREE.DynamicDrawUsage);
    col.setUsage(THREE.DynamicDrawUsage);
    const idx: number[] = [];
    for (let i = 0; i < IMPACT_DECAL_CAP; i++) {
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    geo.setAttribute('position', pos);
    geo.setAttribute('uv', uv);
    geo.setAttribute('color', col);
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'fx_impactDecals';
    mesh.userData.surfaceMarkingLayer = 'impact';
    mesh.renderOrder = 3;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.frustumCulled = false; // rides its parent node; quads are hull-sized
    return { mesh, geo, pos, uv, col, used: 0, free: [] };
  }
  const meshPool: NodeMesh[] = [];
  function obtainNodeMesh(): NodeMesh {
    const nm = meshPool.pop() || makeNodeMesh();
    nm.mesh.material = material; // defensive: undo any historical burnt swap
    nm.used = 0;
    nm.free.length = 0;
    nm.pos.array.fill(0);
    nm.pos.needsUpdate = true;
    return nm;
  }
  function releaseNodeMesh(nm: NodeMesh): void {
    if (nm.mesh.parent) nm.mesh.parent.remove(nm.mesh);
    if (meshPool.length < 24) meshPool.push(nm);
    else nm.geo.dispose();
  }

  /**
   * Per-vehicle record.
   * ring[i] = { nodeKey: 'hull'|'turret', slot } in stamp order.
   */
  const records = new Map<string, DecalRecord>();
  const legacyKeys = new WeakMap<ImpactVisual, string>();
  let legacySeq = 0;
  const turretEnvBySpec = new Map<string, TurretEnvelope | null>();

  function recFor(key: string, visual: ImpactVisual): DecalRecord {
    let rec = records.get(key);
    if (rec && rec.visual !== visual) { clearRecord(rec); rec = undefined; }
    if (!rec) {
      // hard ceiling on tracked vehicles: evict the least-recently stamped
      if (records.size >= 20) {
        let oldK = null;
        let oldT = Infinity;
        for (const [k, r] of records) if (r.lastStampT < oldT) { oldT = r.lastStampT; oldK = k; }
        if (oldK !== null) {
          const oldest = records.get(oldK);
          if (oldest) clearRecord(oldest);
        }
      }
      rec = {
        key, visual,
        hull: null, turret: null, gun: null,
        turretNode: null, gunNode: null,
        ring: new Array(IMPACT_DECAL_CAP),
        head: 0, count: 0,
        lastStampT: 0,
      };
      records.set(key, rec);
    }
    return rec;
  }

  function clearRecord(rec: DecalRecord): void {
    if (rec.hull) releaseNodeMesh(rec.hull);
    if (rec.turret) releaseNodeMesh(rec.turret);
    if (rec.gun) releaseNodeMesh(rec.gun);
    records.delete(rec.key);
  }

  /** Armor-model turret envelope (turret-local AABB over turretPlates). */
  function turretEnvelope(spec?: ImpactSpec): TurretEnvelope | null {
    if (!spec || !spec.armor) return null;
    let env = turretEnvBySpec.get(spec.id);
    if (env !== undefined) return env;
    env = computeTurretEnvelope(spec.armor.turretPlates);
    turretEnvBySpec.set(spec.id, env);
    return env;
  }

  const MARGIN = 0.22; // m of tolerance around the turret envelope

  /** Map HitEvent.kind (+crit flags) to a mark family, or null to skip. */
  function classify(ev: ImpactEvent): ClassifiedMark | null {
    const kind = ev.kind;
    if (kind === 'he_splash') {
      // only a real armor contact point scorches the plate — pure blast
      // overpressure (no zone/localPos from the nearest-plate trace) skips
      if (!ev.zone || !ev.localPos) return null;
    }
    const critical = !!((ev.modulesHit && ev.modulesHit.length > 0) ||
      (ev.crewHit && ev.crewHit.length > 0) || ev.ammoRacked || ev.fireStarted);
    const descriptor = impactDecalDescriptor(kind, critical);
    return descriptor
      ? { fam: descriptor.family, sizeK: descriptor.sizeK }
      : null;
  }

  /** Full quad side sizes (m) per family, caliber-scaled + jittered. */
  function sizeFor(fam: ImpactFamily, caliberMm: number | undefined, sizeK: number): MarkSize {
    const calK = THREE.MathUtils.clamp((caliberMm || 90) / 100, 0.5, 1.7);
    switch (fam) {
      case 'crit': return { w: 0.40 * calK * (0.85 + rng() * 0.35) * sizeK, h: 0 };
      case 'pen': return { w: 0.34 * calK * (0.85 + rng() * 0.35) * sizeK, h: 0 };
      case 'gouge': {
        const L = 0.74 * calK * (0.85 + rng() * 0.45) * sizeK;
        return { w: L, h: L * (0.30 + rng() * 0.10) };
      }
      case 'scorch': return { w: 0.95 * calK * (0.75 + rng() * 0.5) * sizeK, h: 0 };
      case 'scuff': return { w: 0.26 * calK * (0.8 + rng() * 0.4) * sizeK, h: 0 };
      default: return { w: 0.3 * calK, h: 0 };
    }
  }

  /** Per-family tint (grime jitter) + alpha. */
  function shadeFor(fam: ImpactFamily): MarkShade {
    const j = 0.9 + rng() * 0.1;
    switch (fam) {
      case 'crit': return { r: 0.82 * j, g: 0.82 * j, b: 0.82 * j, a: 1 };
      case 'pen': return { r: j, g: j, b: j, a: 1 };
      case 'gouge': return { r: j, g: j, b: j, a: 0.95 };
      case 'scorch': return { r: 0.95 * j, g: 0.95 * j, b: 0.95 * j, a: 0.82 + rng() * 0.13 };
      case 'scuff': return { r: j, g: j, b: j, a: 0.82 };
      default: return { r: 1, g: 1, b: 1, a: 1 };
    }
  }

  /** Write one quad into a node mesh slot (node-local corner positions). */
  function writeQuad(
    nm: NodeMesh,
    slot: number,
    center: THREE.Vector3,
    t: THREE.Vector3,
    b: THREE.Vector3,
    w2: number,
    h2: number,
    cell: number,
    shade: MarkShade,
  ): void {
    const pa = nm.pos.array;
    const ua = nm.uv.array;
    const ca = nm.col.array;
    const uv = cellUV(cell);
    const flip = rng() < 0.5; // extra variety on the non-directional axis
    const vA = flip ? uv.v1 : uv.v0;
    const vB = flip ? uv.v0 : uv.v1;
    let o = slot * 12;
    // corners: (-t,-b) (+t,-b) (+t,+b) (-t,+b) — CCW facing +normal
    pa[o++] = center.x - t.x * w2 - b.x * h2; pa[o++] = center.y - t.y * w2 - b.y * h2; pa[o++] = center.z - t.z * w2 - b.z * h2;
    pa[o++] = center.x + t.x * w2 - b.x * h2; pa[o++] = center.y + t.y * w2 - b.y * h2; pa[o++] = center.z + t.z * w2 - b.z * h2;
    pa[o++] = center.x + t.x * w2 + b.x * h2; pa[o++] = center.y + t.y * w2 + b.y * h2; pa[o++] = center.z + t.z * w2 + b.z * h2;
    pa[o++] = center.x - t.x * w2 + b.x * h2; pa[o++] = center.y - t.y * w2 + b.y * h2; pa[o++] = center.z - t.z * w2 + b.z * h2;
    let u = slot * 8;
    ua[u++] = uv.u0; ua[u++] = vA;
    ua[u++] = uv.u1; ua[u++] = vA;
    ua[u++] = uv.u1; ua[u++] = vB;
    ua[u++] = uv.u0; ua[u++] = vB;
    let c = slot * 16;
    for (let i = 0; i < 4; i++) {
      ca[c++] = shade.r; ca[c++] = shade.g; ca[c++] = shade.b; ca[c++] = shade.a;
    }
    nm.pos.needsUpdate = true;
    nm.uv.needsUpdate = true;
    nm.col.needsUpdate = true;
  }

  function zeroQuad(nm: NodeMesh, slot: number): void {
    nm.pos.array.fill(0, slot * 12, slot * 12 + 12);
    nm.col.array.fill(0, slot * 16, slot * 16 + 16);
    nm.pos.needsUpdate = true;
    nm.col.needsUpdate = true;
  }

  /** Allocate a quad slot in the vehicle ring (evicting the oldest). */
  function allocEntry(
    rec: DecalRecord,
    nodeKey: DecalNodeKey,
    node: THREE.Object3D,
  ): { nm: NodeMesh; slot: number } {
    let nm = rec[nodeKey];
    if (!nm) {
      nm = obtainNodeMesh();
      rec[nodeKey] = nm;
      node.add(nm.mesh);
    } else if (nm.mesh.parent !== node) {
      if (nm.mesh.parent) nm.mesh.parent.remove(nm.mesh);
      node.add(nm.mesh);
    }
    if (rec.count >= IMPACT_DECAL_CAP) {
      // evict oldest
      const old = rec.ring[rec.head];
      rec.head = (rec.head + 1) % IMPACT_DECAL_CAP;
      rec.count--;
      const oldNm = old ? rec[old.nodeKey] : null;
      if (old && oldNm) {
        zeroQuad(oldNm, old.slot);
        oldNm.free.push(old.slot);
      }
    }
    const slot = nm.free.length ? nm.free.pop()! : nm.used++;
    const at = (rec.head + rec.count) % IMPACT_DECAL_CAP;
    rec.ring[at] = { nodeKey, slot };
    rec.count++;
    return { nm, slot };
  }

  // Retained route state avoids allocating a result object for every impact.
  const stampRoute: StampRoute = { nodeKey: 'hull', node: new THREE.Object3D() };

  function findArticulationNode(
    rec: DecalRecord,
    visual: ImpactVisual,
    frame: 'turret' | 'gun',
  ): THREE.Object3D | null {
    const isGun = frame === 'gun';
    const cacheKey = isGun ? 'gunNode' : 'turretNode';
    const rigName = isGun ? 'rig_gun' : 'rig_turret';
    return rec[cacheKey]
      || (rec[cacheKey] = visual.root.getObjectByName(rigName) ?? null);
  }

  function routeExactArticulation(
    rec: DecalRecord,
    visual: ImpactVisual,
    impactFrame: 'turret' | 'gun',
    gunPivot: Vec3Tuple | null,
    pos: THREE.Vector3,
  ): boolean {
    const node = findArticulationNode(rec, visual, impactFrame);
    if (!node) return false;
    stampRoute.nodeKey = impactFrame;
    stampRoute.node = node;
    if (impactFrame === 'gun' && gunPivot) {
      // Gun-follow coordinates retain the turret origin; rig_gun starts at
      // the trunnion, so translate into the actual parent frame.
      pos.x -= gunPivot[0];
      pos.y -= gunPivot[1];
      pos.z -= gunPivot[2];
    }
    return true;
  }

  function isInsideTurretEnvelope(
    x: number,
    y: number,
    z: number,
    env: TurretEnvelope,
  ): boolean {
    return x > env.mn[0] - MARGIN && x < env.mx[0] + MARGIN
      && y > env.mn[1] - MARGIN && y < env.mx[1] + MARGIN
      && z > env.mn[2] - MARGIN && z < env.mx[2] + MARGIN;
  }

  function routeLegacyTurret(
    rec: DecalRecord,
    visual: ImpactVisual,
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    dir: THREE.Vector3 | null,
    turretYaw: number,
    turretPivot: Vec3Tuple,
    env: TurretEnvelope,
  ): void {
    _pt.copy(pos);
    _pt.x -= turretPivot[0];
    _pt.y -= turretPivot[1];
    _pt.z -= turretPivot[2];
    const cy = Math.cos(-turretYaw || 0);
    const sy = Math.sin(-turretYaw || 0);
    const tx = _pt.x * cy + _pt.z * sy;
    const tz = -_pt.x * sy + _pt.z * cy;
    if (!isInsideTurretEnvelope(tx, _pt.y, tz, env)) return;
    const node = findArticulationNode(rec, visual, 'turret');
    if (!node) return;
    stampRoute.nodeKey = 'turret';
    stampRoute.node = node;
    pos.set(tx, _pt.y, tz);
    rot2D(normal, cy, sy);
    if (dir) rot2D(dir, cy, sy);
  }

  function resolveStampRoute(
    rec: DecalRecord,
    visual: ImpactVisual,
    impactFrame: DecalNodeKey | null,
    gunPivot: Vec3Tuple | null,
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    dir: THREE.Vector3 | null,
    turretYaw: number,
    turretPivot: Vec3Tuple | null,
    env: TurretEnvelope | null,
  ): boolean {
    stampRoute.nodeKey = 'hull';
    stampRoute.node = visual.root;
    if (impactFrame === 'turret' || impactFrame === 'gun') {
      return routeExactArticulation(rec, visual, impactFrame, gunPivot, pos);
    }
    if (!impactFrame && env && turretPivot) {
      routeLegacyTurret(rec, visual, pos, normal, dir, turretYaw, turretPivot, env);
    }
    return true;
  }

  function orientStampTangent(
    fam: ImpactFamily,
    normal: THREE.Vector3,
    dir: THREE.Vector3 | null,
  ): void {
    _n.copy(normal).normalize();
    if (_n.lengthSq() < 0.5) _n.set(0, 1, 0);
    if (fam === 'gouge' && dir) {
      _t.copy(dir).addScaledVector(_n, -dir.dot(_n));
      if (_t.lengthSq() > 0.02) {
        _t.normalize();
        _b.crossVectors(_n, _t).normalize();
        return;
      }
    }
    _t.set(0.31, 0.65, 0.69).cross(_n);
    if (_t.lengthSq() < 1e-4) _t.set(1, 0, 0).cross(_n);
    _t.normalize();
    const angle = rng() * Math.PI * 2;
    _b.crossVectors(_n, _t);
    _t.multiplyScalar(Math.cos(angle)).addScaledVector(_b, Math.sin(angle)).normalize();
    _b.crossVectors(_n, _t).normalize();
  }

  function writeStamp(
    rec: DecalRecord,
    fam: ImpactFamily,
    sizeK: number,
    caliberMm: number | undefined,
    pos: THREE.Vector3,
  ): void {
    const { w, h } = sizeFor(fam, caliberMm, sizeK);
    const lift = IMPACT_DECAL_LIFT_M + rng() * 0.002;
    _c0.copy(pos).addScaledVector(_n, lift);
    const cells = FAMILY_CELLS[fam];
    const cell = cells[(rng() * cells.length) | 0];
    const { nm, slot } = allocEntry(rec, stampRoute.nodeKey, stampRoute.node);
    writeQuad(nm, slot, _c0, _t, _b, w / 2, (h || w) / 2, cell, shadeFor(fam));
  }

  /**
   * Core stamp in the supplied articulation frame. Legacy calls pass no
   * impactFrame and retain the hull-local turret-envelope fallback.
   */
  function stampLocal(
    key: string,
    visual: ImpactVisual,
    fam: ImpactFamily,
    sizeK: number,
    caliberMm: number | undefined,
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    dir: THREE.Vector3 | null,
    turretYaw: number,
    turretPivot: Vec3Tuple | null,
    env: TurretEnvelope | null,
    impactFrame: DecalNodeKey | null = null,
    gunPivot: Vec3Tuple | null = null,
  ): boolean {
    const rec = recFor(key, visual);
    rec.lastStampT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!resolveStampRoute(rec, visual, impactFrame, gunPivot, pos, normal,
      dir, turretYaw, turretPivot, env)) return false;
    clampToSkin(stampRoute.node, pos, normal);
    orientStampTangent(fam, normal, dir);
    writeStamp(rec, fam, sizeK, caliberMm, pos);
    return true;
  }

  /** In-place rotate a vector by yaw angle (cos/sin given) about +Y. */
  function rot2D(v: THREE.Vector3, cy: number, sy: number): void {
    const x = v.x * cy + v.z * sy;
    const z = -v.x * sy + v.z * cy;
    v.x = x; v.z = z;
  }

  function exactImpactFrame(ev: ImpactEvent): ImpactFrame | null {
    return typeof ev.impactFrame === 'string' && Array.isArray(ev.impactLocalPos)
      ? ev.impactFrame
      : null;
  }

  function setInverseHullRotation(state: ImpactState): void {
    _e.set(-(state.visualPitch || 0), state.yaw || 0, state.visualRoll || 0, 'YXZ');
    _q.setFromEuler(_e).invert();
  }

  function resolveImpactPosition(
    ev: ImpactEvent,
    state: ImpactState,
    frame: ImpactFrame | null,
  ): boolean {
    if (frame && ev.impactLocalPos) {
      _p.fromArray(ev.impactLocalPos);
      return true;
    }
    if (ev.localPos) {
      _p.fromArray(ev.localPos);
      return true;
    }
    if (!ev.pos || !state.pos) return false;
    setInverseHullRotation(state);
    _p.fromArray(ev.pos).sub(state.pos).applyQuaternion(_q);
    return true;
  }

  function resolveImpactNormal(
    ev: ImpactEvent,
    state: ImpactState,
    frame: ImpactFrame | null,
  ): void {
    if (frame && ev.impactLocalNormal) {
      _n.fromArray(ev.impactLocalNormal);
      return;
    }
    if (frame && ev.impactLocalDir) {
      _n.fromArray(ev.impactLocalDir).negate();
      return;
    }
    setInverseHullRotation(state);
    _n.set(ev.normal?.[0] ?? 0, ev.normal?.[1] ?? 1, ev.normal?.[2] ?? 0)
      .applyQuaternion(_q);
  }

  function resolveImpactDirection(
    ev: ImpactEvent,
    frame: ImpactFrame | null,
  ): THREE.Vector3 | null {
    const direction = frame && ev.impactLocalDir ? ev.impactLocalDir : ev.localDir;
    return direction ? _d.fromArray(direction) : null;
  }

  const api: ImpactDecalRuntime = {
    material, // exposed for tests/perf probes

    /**
     * Stamp from a resolved HitEvent + game entity ({state, spec, visual}).
     * Uses the sim's exact articulation-local hit data; returns false when
     * skipped. Old recordings fall back to hull-local inference.
     */
    stampFromEvent(ev: ImpactEvent, ent: ImpactEntity): boolean {
      if (!ev || !ent || !ent.visual || !ent.visual.root) return false;
      const visual = ent.visual;
      if (visual.isDestroyed && visual.isDestroyed()) return false;
      if (ev.zone === 'gun_barrel') return false; // no quad fits the tube
      const cls = classify(ev);
      if (!cls) return false;
      const st = ent.state;
      const exactFrame = exactImpactFrame(ev);
      if (exactFrame === 'barrel' || !resolveImpactPosition(ev, st, exactFrame)) return false;
      resolveImpactNormal(ev, st, exactFrame);
      const dir = resolveImpactDirection(ev, exactFrame);
      const armor = ent.spec && ent.spec.armor;
      return stampLocal(String(ev.targetId), visual, cls.fam, cls.sizeK,
        ev.caliberMm, _p, _n, dir, st.turretYaw || 0,
        armor?.turretPivot ?? null,
        turretEnvelope(ent.spec), exactFrame, armor?.gunPivot ?? null);
    },

    /**
     * Legacy/direct stamp (world-space args, no entity — the old armorScar
     * contract). Hull-frame only; kind optional.
     */
    stampDirect(
      visual: ImpactVisual,
      worldPos: THREE.Vector3,
      worldNormal: THREE.Vector3,
      caliberMm: number,
      kind = 'pen',
    ): boolean {
      if (!visual || !visual.root) return false;
      if (visual.isDestroyed && visual.isDestroyed()) return false;
      const cls = classify({ kind, zone: 'x', localPos: [0, 0, 0] })
        || { fam: 'pen', sizeK: 1 };
      let key = legacyKeys.get(visual);
      if (!key) { key = `v${legacySeq++}`; legacyKeys.set(visual, key); }
      visual.root.updateMatrixWorld(true);
      _p.copy(worldPos);
      visual.root.worldToLocal(_p);
      visual.root.getWorldQuaternion(_q).invert();
      _n.copy(worldNormal).applyQuaternion(_q);
      return stampLocal(key, visual, cls.fam, cls.sizeK, caliberMm, _p, _n,
        null, 0, null, null);
    },

    /** Remove all decals for a vehicle (by targetId key or visual). */
    clearVehicle(keyOrVisual: string | number | ImpactVisual | null | undefined): void {
      if (keyOrVisual == null) return;
      const rec = records.get(String(keyOrVisual));
      if (rec) { clearRecord(rec); return; }
      for (const r of [...records.values()]) {
        if (r.visual === keyOrVisual) clearRecord(r);
      }
    },

    /** Battle reset: detach every decal mesh and drop all records. */
    clearAll(): void {
      for (const rec of [...records.values()]) clearRecord(rec);
    },

    /** Drop decals whose vehicle has wrecked (defensive sweep). */
    sweep(): void {
      for (const rec of [...records.values()]) {
        const v = rec.visual;
        if (!v || !v.root || !v.root.parent ||
            (v.isDestroyed && v.isDestroyed())) clearRecord(rec);
      }
    },

    /** @returns {{vehicles:number,decals:number,meshes:number,pooled:number}} */
    stats(): ImpactDecalStats {
      let decals = 0;
      let meshes = 0;
      for (const rec of records.values()) {
        decals += rec.count;
        if (rec.hull) meshes++;
        if (rec.turret) meshes++;
      }
      return { vehicles: records.size, decals, meshes, pooled: meshPool.length };
    },
  };
  return api;
}
