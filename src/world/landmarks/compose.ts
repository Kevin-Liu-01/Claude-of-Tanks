// src/world/landmarks/compose.ts — the set pieces' props pass (the landmarks lane, 2026-10-05).
//
// props.ts runs it once the settlement stands (every planned, recorded, row and block-fill building placed and moved
// off the carriageways) and before the tactical beats, the light buildings and every scatter pass: each piece reserves
// its ground in the props' placement list, so the clutter, the yards, the rocks, the haystacks and the field dressing
// keep off it, and nothing placed before it moves. A map without set pieces runs nothing here and builds byte for byte
// what it built before.
//
// Each piece, in authored order, from a stream of its own (map seed, kind, place — never the props streams):
//   1. admission: inside the square, off the spawn pads and the objective discs, dry, out of the road cores (a gate's
//      or a bridge's passage spans its road; its piers do not), clear of every hard solid already standing;
//   2. the ground: seated on the lowest ground under its footprint (as a house is, so nothing floats), its plinths
//      reaching down past the fall;
//   3. the build (plan.ts kinds, index.ts builders), the phones' fine dressing dropped;
//   4. the weathering of the map's kit (maps/regional/weather.ts) — or, on a map without one, its plain buckets;
//   5. the collision derived from its solids (structureCollision.ts): the ground-contact band for movement — a bridge's
//      authored deck instead, which a hull mounts as its floor — and the 0.5 m shell bands for shells and sight;
//   6. the merge into the props buckets at its pose (no draw of its own), its ground reserved (or, for a piece set into
//      a finished map, vetoed: types.ts `ground`), its footprint published to the minimap.
// Every refusal is named in the receipt (props.group.userData.landmarks); nothing is moved silently.
import * as THREE from 'three';
import { appendStructureCollisionBand, deriveRuntimeStructureCollisionProfile, deriveRuntimeStructureShellBands } from '../structureCollision.ts';
import { cloneCollisionRecord, collisionFootprintContainsPoint, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from '../collision.ts';
import { sampleObbGround } from '../propPlacement.ts';
import type { HeightField } from '../terrain.ts';
import { REGIONAL_BUCKETS, hashSeed, streamFrom, type RegionalParts } from '../maps/regional/geometry.ts';
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts } from '../maps/regional/weather.ts';
import type { ArchitectureStyle } from '../maps/regional/types.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../../sim/matchObjectiveLayouts.ts';
import { matchPlacementAnchors } from '../../sim/matchPlacement.ts';
import { LANDMARK_KINDS, isDressingPiece, resolveLandmarkParams } from './plan.ts';
import { LANDMARK_BUILDERS } from './index.ts';
import type { LandmarkKind, LandmarkPlacement } from './types.ts';

/** The battlefield square's half size and the spawn pads' clear radius (scenery.ts keeps the same). */
const SQUARE = 480;
const SPAWN_CLEAR = 22;
/** A road core a body may not stand in (the layout brief's carriageway). */
const ROAD_CORE_M = 3.5;
/** The parts one compound record holds (server/collisionManifestCodec.ts: a compound of at most 64). */
const MOVEMENT_PART_LIMIT = 64;
/** The steepest fall under a footprint a piece is seated on (its plinths reach down this far). */
const MAX_FALL_M = 3.2;

const SOFT_KINDS = new Set(['rock', 'small-rock', 'rubble', 'hedgehog']);

type LandmarkHeightField = Pick<HeightField, 'getHeightAt' | 'getWaterMaskAt' | '_roadDist'>;

interface LandmarkComposeContext {
  mapId: string;
  landmarks: readonly LandmarkPlacement[];
  heightField: LandmarkHeightField;
  /** The player's pad first, then the enemies' (the layout's spawns). */
  spawns: ReadonlyArray<{ x: number; z: number }>;
  /** The solids already standing; the pass appends each piece's movement record. */
  obstacles: CollisionRecord[];
  /**
   * The crushable kinds that still refuse a piece: the light buildings and the strongpoints' structures (huts, tents, a
   * motor pool), which stand before the pass and must not end up inside a piece (props.ts gives its building types).
   */
  hardKinds?: ReadonlySet<string>;
  /** The shells' and sight's records; the pass appends each piece's shell bands. */
  colliders: CollisionRecord[];
  /** The next structure group id (destruction, docs/DESTRUCTION.md §3.1): the props' build-order serial. */
  structureIndex?(): number;
  /** Describe a piece for its damage (destruction §16): its parts in its own frame, its placement, its records. */
  describeStructure?(structureIdx: number, kind: string, parts: RegionalParts, x: number, y: number, z: number, yaw: number,
    obstacles: CollisionRecord[], colliders: CollisionRecord[]): void;
  architecture: ArchitectureStyle | null;
  snowCap: boolean;
  seed: number;
  tier: 'desktop' | 'mobile';
  /** Merge a finished piece's parts into the props buckets at its pose. */
  merge(parts: RegionalParts, matrix: THREE.Matrix4): void;
  /** Reserve a disc of the piece's ground for every pass after this one (the props placement list). */
  reserve(x: number, z: number, r: number): void;
  /**
   * Veto the piece's ground for every pass after this one (a placement's `ground: 'veto'`): its oriented footprint
   * (centre, heading, half extents across and along), inside which the props leave out what those passes would set —
   * their draws all taken, so nothing else they place moves for the piece. Absent where nothing places after it.
   */
  veto?(x: number, z: number, yaw: number, hw: number, hd: number): void;
  /**
   * Publish the piece's footprint (the minimap's building plan) under its kind: a set piece is no planned building, so it
   * carries no plan id (the town-plan receipts and the yard dressing read those).
   */
  publish(x: number, z: number, w: number, d: number, rot: number, kind: LandmarkKind): void;
  /** Add one of the props' destructibles (a bench, a lamp) at a world pose. */
  addDestructible(kind: string, x: number, y: number, z: number, yaw: number, scale: number): void;
}

interface LandmarkReceiptEntry {
  kind: string;
  name: string | null;
  x: number;
  z: number;
  status: 'placed' | 'skipped';
  reason?: string;
  /** Triangles merged (this tier), the movement and shell records published, the ground's fall under it. */
  triangles?: number;
  records?: number;
  fall?: number;
  /** Soft records (boulders, crushables) its footprint overlaps: allowed, reported for the authoring. */
  overlaps?: string[];
  /** Its ground vetoed rather than reserved (types.ts `ground`). */
  ground?: 'veto';
}

interface LandmarkReceipt {
  pieces: LandmarkReceiptEntry[];
  placed: number;
  skipped: number;
  triangles: number;
}

type Slice = { fine: true; progress: false; stage: string };

/**
 * The objective discs [x, z, r] a set piece keeps clear of: the map's authored zone-control seats (30 m) and turbo-ball
 * kickoff (12 m) — or, without a layout, the three seats on the deployments' bisector — the middle (30 m), and the
 * goals and flag bases at the deployments' centres (18 m). The match placement only ever moves a seat off rough ground,
 * so the authored seats are where it looks first; landmarks.selftest.mjs runs the real placement on every authoring map.
 */
export function landmarkObjectiveDiscs(mapId: string, spawns: ReadonlyArray<{ x: number; z: number }>): Array<[number, number, number]> {
  const [player, ...enemies] = spawns;
  if (!player) return [];
  const { alpha, bravo } = matchPlacementAnchors({ player, enemies });
  const mx = (alpha.x + bravo.x) * 0.5, mz = (alpha.z + bravo.z) * 0.5;
  const al = Math.hypot(bravo.x - alpha.x, bravo.z - alpha.z) || 1;
  const ux = (bravo.x - alpha.x) / al, uz = (bravo.z - alpha.z) / al;
  const layout = MATCH_OBJECTIVE_LAYOUTS[mapId];
  const discs: Array<[number, number, number]> = [];
  for (const zone of layout?.zones ?? [-105, 0, 105].map((o) => ({ x: mx + uz * o, z: mz - ux * o }))) discs.push([zone.x, zone.z, 30]);
  const kickoff = layout?.kickoff ?? { x: mx, z: mz };
  discs.push([kickoff.x, kickoff.z, 12], [mx, mz, layout ? 12 : 30], [alpha.x, alpha.z, 18], [bravo.x, bravo.z, 18]);
  return discs;
}

/** The footprint's world corners and edge midpoints (and centre) for the admission probes. */
function footprintProbes(x: number, z: number, hw: number, hl: number, yaw: number): Array<[number, number]> {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const out: Array<[number, number]> = [];
  for (const ix of [-1, -0.5, 0, 0.5, 1]) for (const iz of [-1, -0.5, 0, 0.5, 1]) {
    const lx = ix * hw, lz = iz * hl;
    out.push([x + lx * c + lz * s, z - lx * s + lz * c]);
  }
  return out;
}

/** Whether a disc meets the footprint's oriented rectangle. */
function discMeetsFootprint(dx: number, dz: number, r: number, x: number, z: number, hw: number, hl: number, yaw: number): boolean {
  const ox = dx - x, oz = dz - z, c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = ox * c - oz * s, lz = ox * s + oz * c;
  const ex = Math.max(0, Math.abs(lx) - hw), ez = Math.max(0, Math.abs(lz) - hl);
  return ex * ex + ez * ez < r * r;
}

/**
 * True when a record's exact footprint (its compound shape) reaches into the piece's footprint: the footprint sampled
 * on a grid of about a metre, edges included. The coarse disc test above it stands for a record by the disc inscribed in
 * its box, which for a large building turned on the diagonal (a khan, a church) reaches far past its walls and refused
 * the paving laid against its front (2026-10-06, Orchard's khan).
 */
function footprintTouchesRecord(record: CollisionRecord, x: number, z: number, hw: number, hl: number, yaw: number): boolean {
  if (!record.shape2) return true;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const nx = Math.max(1, Math.ceil(hw * 2)), nz = Math.max(1, Math.ceil(hl * 2));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const lx = -hw + hw * 2 * i / nx, lz = -hl + hl * 2 * j / nz;
      if (collisionFootprintContainsPoint(record, x + lx * c + lz * s, z - lx * s + lz * c, 0.05)) return true;
    }
  }
  return false;
}

/** The hard solid (by kind) standing in the footprint, and the soft ones it overlaps. */
function solidConflicts(obstacles: readonly CollisionRecord[], x: number, z: number, hw: number, hl: number, yaw: number,
  hardKinds: ReadonlySet<string> | undefined = undefined): { hard: string | null; soft: string[] } {
  const soft: string[] = [];
  const reach = Math.hypot(hw, hl);
  for (const ob of obstacles) {
    if (ob.treeIdx != null) continue;
    if (x + reach < ob.min[0] || x - reach > ob.max[0] || z + reach < ob.min[2] || z - reach > ob.max[2]) continue;
    const cx = (ob.min[0] + ob.max[0]) * 0.5, cz = (ob.min[2] + ob.max[2]) * 0.5;
    const r = Math.max(0.3, Math.min(ob.max[0] - ob.min[0], ob.max[2] - ob.min[2]) * 0.5);
    if (!discMeetsFootprint(cx, cz, r, x, z, hw, hl, yaw)) continue;
    if (!footprintTouchesRecord(ob, x, z, hw, hl, yaw)) continue;
    const kind = ob.kind ?? (ob.crushable ? 'crushable' : 'rock');
    if ((!ob.crushable && !SOFT_KINDS.has(kind)) || hardKinds?.has(kind)) return { hard: kind, soft };
    if (soft.length < 8) soft.push(kind);
  }
  return { hard: null, soft };
}

/** The admission of one piece: null when it may stand, else the reason it may not. */
function admission(ctx: LandmarkComposeContext, discs: ReadonlyArray<readonly [number, number, number]>, placement: LandmarkPlacement,
  hw: number, hl: number, yaw: number): string | null {
  const { x, z } = placement;
  const probes = footprintProbes(x, z, hw, hl, yaw);
  if (probes.some(([px, pz]) => Math.max(Math.abs(px), Math.abs(pz)) > SQUARE)) return 'outside the square';
  for (const s of ctx.spawns) if (discMeetsFootprint(s.x, s.z, SPAWN_CLEAR, x, z, hw, hl, yaw)) return 'spawn pad';
  // (a dressing piece — a square's setts, a path — has no solid to change an objective's ground: it may lie in a disc)
  if (!isDressingPiece(placement)) for (const [dx, dz, r] of discs) if (discMeetsFootprint(dx, dz, r, x, z, hw, hl, yaw)) return 'objective disc';
  if (probes.some(([px, pz]) => ctx.heightField.getWaterMaskAt(px, pz) > 0.05)) {
    // a bridge stands over its water and a valve tower in it (plan.ts inWater); every other piece keeps dry
    if (LANDMARK_KINDS[placement.kind].family !== 'bridge' && !LANDMARK_KINDS[placement.kind].inWater) return 'water';
  }
  const spec = LANDMARK_KINDS[placement.kind], margin = placement.roadMargin ?? spec.roadMargin ?? ROAD_CORE_M;
  if (!spec.spansRoad && margin > 0 && probes.some(([px, pz]) => ctx.heightField._roadDist(px, pz) < margin)) return 'road';
  return null;
}

/** The movement record of a piece that authors its own (a bridge): its local parts placed at its pose. */
function movementRecord(parts: readonly SimpleCollisionShape[], x: number, y: number, z: number, yaw: number): CollisionRecord {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const world: SimpleCollisionShape[] = parts.map((part) => {
    const cx = x + part.cx * c + part.cz * s, cz = z - part.cx * s + part.cz * c;
    const extent = part.y0 !== undefined && part.y1 !== undefined ? { y0: y + part.y0, y1: y + part.y1 } : {};
    if (part.kind === 'obb') return { kind: 'obb', cx, cz, hw: part.hw, hl: part.hl, yaw: part.yaw + yaw, ...extent };
    if (part.kind === 'circle') return { kind: 'circle', cx, cz, r: part.r, ...extent };
    const points: number[] = [];
    for (let i = 0; i < part.points.length; i += 2) points.push(x + part.points[i] * c + part.points[i + 1] * s, z - part.points[i] * s + part.points[i + 1] * c);
    return { kind: 'convex', cx, cz, points, ...extent };
  });
  let y0 = Infinity, y1 = -Infinity;
  for (const part of world) { y0 = Math.min(y0, part.y0 ?? y); y1 = Math.max(y1, part.y1 ?? y + 1); }
  return setCompoundShape({ min: [x, y0, z], max: [x, y1, z], kind: 'structure' } as CollisionRecord, world);
}

/** Whether a part set holds any structural (collision-bearing) geometry. */
export function hasStructure(parts: RegionalParts): boolean {
  return REGIONAL_BUCKETS.some((name) => name !== 'glass' && name !== 'curtain' && (parts[name] ?? []).some((g) => !g.userData.noCollision));
}

/** Every geometry of a part set (receipts, disposal). */
function partList(parts: RegionalParts): THREE.BufferGeometry[] {
  return REGIONAL_BUCKETS.flatMap((name) => parts[name] ?? []);
}

const _matrix = new THREE.Matrix4(), _position = new THREE.Vector3(), _quaternion = new THREE.Quaternion(), _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

/** Place the map's set pieces. A generator: one slice per piece. */
export function* composeLandmarks(ctx: LandmarkComposeContext): Generator<Slice, LandmarkReceipt, void> {
  const receipt: LandmarkReceipt = { pieces: [], placed: 0, skipped: 0, triangles: 0 };
  const discs = landmarkObjectiveDiscs(ctx.mapId, ctx.spawns);
  // authored order; a piece's children (a square's centre piece) follow it, in the world frame
  const queue: LandmarkPlacement[] = [...ctx.landmarks];
  while (queue.length) {
    const placement = queue.shift()!;
    const entry: LandmarkReceiptEntry = { kind: placement.kind, name: placement.name ?? null, x: placement.x, z: placement.z, status: 'placed' };
    const skip = (reason: string) => { entry.status = 'skipped'; entry.reason = reason; receipt.skipped++; receipt.pieces.push(entry); };
    const spec = LANDMARK_KINDS[placement.kind], builder = LANDMARK_BUILDERS[placement.kind];
    if (!spec || !builder) { skip(`unknown kind ${placement.kind}`); continue; }
    const params = resolveLandmarkParams(placement);
    const [hw, hl] = spec.footprint(params);
    const yaw = (placement.yawDeg ?? 0) * Math.PI / 180;
    const refused = admission(ctx, discs, placement, hw, hl, yaw);
    if (refused) { skip(refused); yield { fine: true, progress: false, stage: 'landmarks' }; continue; }
    // (its solid's own rectangles where the kind names them — a gate's tower and its wall stubs — else its footprint)
    const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
    const solidRects = (spec.solids?.(params) ?? [[0, 0, hw, hl] as const]).map(([cx, cz, rw, rl]) =>
      [placement.x + cx * c0 + cz * s0, placement.z - cx * s0 + cz * c0, rw, rl] as const);
    let hard: string | null = null;
    const soft: string[] = [];
    for (const [rx, rz, rw, rl] of solidRects) {
      const found = solidConflicts(ctx.obstacles, rx, rz, rw, rl, yaw, ctx.hardKinds);
      for (const kind of found.soft) if (soft.length < 8) soft.push(kind);
      if (found.hard) { hard = found.hard; break; }
    }
    if (hard) { skip(`solid ${hard}`); yield { fine: true, progress: false, stage: 'landmarks' }; continue; }
    if (soft.length) entry.overlaps = soft;
    const ground = sampleObbGround(ctx.heightField as HeightField, placement.x, placement.z, hw, hl, yaw);
    if (ground.spread > MAX_FALL_M && spec.family !== 'bridge' && !spec.inWater && !spec.drapes) { skip(`ground falls ${ground.spread.toFixed(1)} m`); continue; }
    // the piece's own streams, forked from its identity: authoring one never re-rolls another
    const identity = [ctx.seed, placement.x, placement.z, placement.yawDeg ?? 0, placement.seed ?? 0];
    const built = builder({
      kind: placement.kind, params,
      rng: streamFrom(hashSeed(`landmark:${ctx.mapId}:${placement.kind}`, ...identity)),
      variant: streamFrom(hashSeed(`landmark:variant:${ctx.mapId}:${placement.kind}`, ...identity)),
      age: streamFrom(hashSeed(`landmark:age:${ctx.mapId}:${placement.kind}`, ...identity)),
      tier: ctx.tier, groundFall: ground.spread, brick: ctx.architecture?.surfaces.stone.kind === 'brick',
      ground: (lx: number, lz: number) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        return ctx.heightField.getHeightAt(placement.x + lx * c + lz * s, placement.z - lx * s + lz * c) - ground.y;
      },
      snowCap: ctx.snowCap, mapId: ctx.mapId,
    });
    let parts = built.parts;
    // a phone never builds the fine joinery (geometry.ts EmitOptions.fine): it is dressing, so the collision stays
    if (ctx.tier === 'mobile') {
      for (const name of REGIONAL_BUCKETS) {
        const list = parts[name];
        if (!list?.some((g) => g.userData.fine)) continue;
        for (const g of list) if (g.userData.fine) g.dispose();
        parts[name] = list.filter((g) => !g.userData.fine);
      }
    }
    if (ctx.architecture) {
      // the map kit's weathering: each piece its own tint (or the builder's), damp at the wall foot, moss on the roofs
      const palette = ctx.architecture.weather ?? DEFAULT_WEATHER;
      const tints = { ...pickWeatherTints(palette, streamFrom(hashSeed(`landmark:weather:${ctx.mapId}:${placement.kind}`, ...identity))), ...built.tints };
      parts = weatherRegionalParts(parts, tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint });
    } else {
      // a map without a kit draws the plain buckets (no vertex colour there): the occlusion record never reaches the merge
      for (const geometry of partList(parts)) if (geometry.getAttribute('shade')) geometry.deleteAttribute('shade');
    }
    // the collision, derived from the solids at the piece's pose (a bridge's deck is its own movement record); a piece
    // that is all dressing (a square's paths and fence) publishes none
    const baseY = ground.y;
    let records = 0;
    const obstacleStart = ctx.obstacles.length, colliderStart = ctx.colliders.length;
    if (hasStructure(parts)) try {
      let shell;
      const movement: CollisionRecord[] = [];
      if (built.movement?.length) {
        // a compound holds at most 64 parts (server/collisionManifestCodec.ts): a long bridge's record in runs of 64.
        // (A set-piece bridge's roadway stays a 'structure', not a 'bridge' record as the map kits' are: the bots read a
        // 'bridge' record as a deck their route planner knows from the terrain's bridgeDecks and drive into it, and a
        // set piece's deck is no terrain deck — they steer round it, the players drive over it.)
        for (let i = 0; i < built.movement.length; i += MOVEMENT_PART_LIMIT) {
          movement.push(movementRecord(built.movement.slice(i, i + MOVEMENT_PART_LIMIT), placement.x, baseY, placement.z, yaw));
        }
        ctx.obstacles.push(...movement);
        shell = deriveRuntimeStructureShellBands(parts);
      } else {
        const profile = deriveRuntimeStructureCollisionProfile(parts);
        appendStructureCollisionBand(ctx.obstacles, profile.contact, placement.x, baseY, placement.z, yaw).kind = 'structure';
        shell = profile.shell;
      }
      records += Math.max(1, movement.length);
      for (const band of shell) {
        appendStructureCollisionBand(ctx.colliders, band, placement.x, baseY, placement.z, yaw).kind = 'structure';
        records++;
      }
      // the deck is also what a shell meets over the water: its movement record joins the shells' list as well
      for (const record of movement) { ctx.colliders.push(cloneCollisionRecord(record)); records++; }
      // destruction (docs/DESTRUCTION.md §3.1): the piece is one structure group, a landmark (breach-only), or fixed
      // when it carries a deck a route depends on
      if (ctx.structureIndex) {
        const structureIdx = ctx.structureIndex();
        const structureRole = movement.length ? 'fixed' : 'setpiece';
        for (let i = obstacleStart; i < ctx.obstacles.length; i++) {
          ctx.obstacles[i].structureIdx = structureIdx;
          ctx.obstacles[i].structureRole = structureRole;
        }
        for (let i = colliderStart; i < ctx.colliders.length; i++) {
          ctx.colliders[i].structureIdx = structureIdx;
          ctx.colliders[i].structureRole = structureRole;
        }
        for (const geometry of partList(parts)) geometry.userData.structureIdx = structureIdx;
        if (structureRole === 'setpiece') {
          ctx.describeStructure?.(structureIdx, placement.kind, parts, placement.x, baseY, placement.z, yaw,
            ctx.obstacles.slice(obstacleStart), ctx.colliders.slice(colliderStart));
        }
      }
    } catch (error) {
      for (const geometry of partList(parts)) geometry.dispose();
      skip(`collision: ${(error as Error).message}`);
      continue;
    }
    entry.triangles = partList(parts).reduce((n, g) => n + (g.index ? g.index.count : g.getAttribute('position').count) / 3, 0);
    _matrix.compose(_position.set(placement.x, baseY, placement.z), _quaternion.setFromAxisAngle(_up, yaw), _scale);
    ctx.merge(parts, _matrix);
    // the ground it stands on, kept for it by every pass after this one: discs along its long axis in the props'
    // placement list, which those passes keep off — or, for a piece set into a finished map (`ground: 'veto'`), its
    // footprint handed to the props' veto: they draw as on the map without it and what they would stand on its ground
    // is left out (an open surface, a path's setts, keeps what stands on it)
    if (placement.ground === 'veto') {
      entry.ground = 'veto';
      if (!spec.open) for (const [rx, rz, rw, rl] of solidRects) ctx.veto?.(rx, rz, yaw, rw, rl);
    } else {
      const long = Math.max(hw, hl), short = Math.min(hw, hl), along = hl >= hw;
      const reserves = Math.max(1, Math.ceil(long / Math.max(short, 1.5)));
      for (let k = 0; k < reserves; k++) {
        const t = reserves === 1 ? 0 : -long + short + (2 * (long - short)) * k / (reserves - 1);
        const lx = along ? 0 : t, lz = along ? t : 0;
        ctx.reserve(placement.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), placement.z - lx * Math.sin(yaw) + lz * Math.cos(yaw), short * 1.05 + 0.5);
      }
    }
    ctx.publish(placement.x, placement.z, hw * 2, hl * 2, yaw, placement.kind);
    // its street furniture into the props pools, its children after it (both from its frame into the world's)
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx: number, lz: number): [number, number] => [placement.x + lx * c + lz * s, placement.z - lx * s + lz * c];
    for (const piece of built.destructibles ?? []) {
      const [x, z] = toWorld(piece.x, piece.z);
      ctx.addDestructible(piece.kind, x, ctx.heightField.getHeightAt(x, z), z, yaw + piece.yawDeg * Math.PI / 180, piece.scale ?? 1);
    }
    queue.unshift(...(built.children ?? []).map((child, k): LandmarkPlacement => {
      const [x, z] = toWorld(child.x, child.z);
      return { ...child, x, z, yawDeg: (placement.yawDeg ?? 0) + (child.yawDeg ?? 0), seed: (placement.seed ?? 0) * 31 + k + 1,
        name: child.name ?? (placement.name ? `${placement.name}: its ${child.kind}` : undefined) };
    }));
    entry.records = records;
    entry.fall = +ground.spread.toFixed(2);
    receipt.triangles += entry.triangles;
    receipt.placed++;
    receipt.pieces.push(entry);
    yield { fine: true, progress: false, stage: 'landmarks' };
  }
  return receipt;
}
