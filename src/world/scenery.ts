// src/world/scenery.ts — the scenery lane's composer (2026-10-03): a map's authored landscape features and landmarks,
// placed by the rules every other props pass keeps. A map names what stands where in its top-level `scenery` block
// (sceneryPlan.ts is the contract; the map lanes own the map files, this lane the generators and their rules):
//
//   scenery: {
//     rocks: [{ form: 'tor', geology: 'granite', x, z, radius, height, name: 'the tor above the mill' }, ...],
//     rockFields: [{ geology: 'limestone', x, z, radius, count, slopeBias, name: 'the terrace karst' }, ...],
//     bedrock: [{ geology: 'sandstone', x, z, radius, name: 'the gate dome' }, ...],
//     landmarks: [{ kind: 'calvary', x, z, yawDeg, name: 'the calvary at the crossroads' }, ...],
//     powerLines: [{ towers: [[x, z], ...], heightM, name: 'the 380 kV line' }],
//     fieldWorks: { walls: true },   // the land use's wall boundaries built (fieldWorks.ts)
//   }
//
// Rock forms (sceneryRocks.ts: tor, outcrop, crag, pavement, scree, hoodoo, menhir, cairn, calvary) — the authored ones,
// the rock fields' and the stone landmarks — build into one welded mesh on the props rock material (one draw for the
// whole map) and publish each standing mass as a static convex collider (a hill's bedrock — its beds ringing the steep
// flanks no hull reaches — joins the same mesh and publishes none); the timber, steel and stucco landmarks
// (maps/sceneryKit.ts: bildstock, waysidecross, orthodoxcross, windpump, tomb, strawstack) join the props destructible
// pools; pylon lines fold into the `baked` bucket with their four legs as colliders. Every feature is checked before it
// is laid — inside the square, clear of the spawn pads, of the road core, of water and of the hard solids already
// placed — and the receipt says what stood and why anything did not; nothing is moved silently.
//
// Deterministic: every feature draws from its own stream (seed + a family offset + 131 x its index), so authoring one
// feature never re-rolls another, and the pass draws nothing from the props streams. The authored footprints reach the
// vegetation (sceneryPlan.ts sceneryClearances) so no tree grows through a tor; the rock fields keep off the trees.
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildBedrock, buildRockFormation, type RockFormationSpec } from './sceneryRocks.ts';
import { restsOnTalus, TALUS_DEG } from './landformGeology.ts';
import { buildConductor, buildPylon, SCENERY_DESTRUCTIBLE_TYPES } from './maps/sceneryKit.ts';
import { buildFieldWorks, type FieldWorksBuilt, type FieldWorksKeepOut, type FieldWorksReceipt, type FieldWorksRect } from './fieldWorks.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../sim/matchObjectiveLayouts.ts';
import { ASSAULT_TRENCH, planAssaultTrenchLines } from '../sim/assaultLines.ts';
import { createMatchPlacement, deploymentClearings, matchPlacementAnchors, type MatchPlacement, type PlacementTerrain } from '../sim/matchPlacement.ts';
import {
  FIELD_FORMS, STONE_LANDMARKS, isDestructibleLandmark, isStoneLandmark, rockReach, type GroundCoverHole, type SceneryConfig,
} from './sceneryPlan.ts';
import { createObstacleGrid, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';
import { convexSlabs, slabParts } from './slabCollision.ts';
import { applyFormationCollision, type FormationCollisionProfile } from './rockCollision.ts';

type Rng = () => number;

function mulberry32(a: number): Rng {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------- the build

interface SceneryHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _villageMask?(x: number, z: number): number;
  /** The ground lane's land use (landUse.ts landUseAt through terrain.ts), when the world has one. */
  _landUseAt?(x: number, z: number, out: { active: number; edgeM: number; boundary: number; track: number; hedge: number }): { active: number; edgeM: number; boundary: number; track: number; hedge: number };
  /** The bridge decks (terrain.ts BridgeDeckPlane) and the field trenches the terrain carved. */
  bridgeDecks?: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; approachM: number }>;
  fieldTrenchLines?: {
    lines: ReadonlyArray<{ x: number; z: number; lx: number; lz: number; halfLengthM: number }>;
    profile?: { floorHalfWidthM: number; wallRunM: number; endRampM: number };
  } | null;
  /** The assault world's sector trenches (their lines are the sectors' own) and its communication trench. */
  assaultTrenchLines?: { connector: { x0: number; z0: number; x1: number; z1: number } | null } | null;
}

/** How far a yard's dressing reaches outside its structure's envelope (m; yardDressing.ts). */
const YARD_REACH_M = 7.6;

interface SceneryBuildContext {
  mapId: string;
  scenery: SceneryConfig | null | undefined;
  heightField: SceneryHeightField;
  spawns: ReadonlyArray<{ x: number; z: number }>;
  /** The solids already placed (props obstacles); the pass appends its own to both lists. */
  obstacles: CollisionRecord[];
  /** The trees (the vegetation's obstacles): a rock field keeps off them. */
  trees?: readonly CollisionRecord[];
  /** The trees' crown tops (world y): a pylon line stands its towers over them. */
  treeTops?: ReadonlyArray<{ x: number; z: number; top: number }>;
  colliders: CollisionRecord[];
  /** The props `baked` bucket (the pylons fold in). */
  baked: THREE.BufferGeometry[];
  /** Shape a piece after its bucket's first part (mergeGeometries wants one attribute set per bucket). */
  conform(piece: THREE.BufferGeometry, bucket: readonly THREE.BufferGeometry[]): void;
  /** props addDestructible: the landmark kinds join the destructible pools. */
  addDestructible(kind: string, x: number, y: number, z: number, yaw: number, scale: number): unknown;
  seed: number;
  mobile: boolean;
  /** The map's aprons (terrain hardstands: yards, squares, vehicle parks, runways) and the yard structures' envelopes. */
  hardstands?: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }>;
  yards?: ReadonlyArray<{ x: number; z: number; w: number; d: number }>;
}

interface SceneryFeatureReceipt {
  family: 'rock' | 'rockField' | 'bedrock' | 'landmark' | 'powerLine';
  kind: string;
  name: string | null;
  x: number;
  z: number;
  status: 'placed' | 'skipped';
  reason?: string;
  triangles?: number;
  /** Soft records (crushables, boulders) the standing footprint overlaps: allowed, reported for the authoring. */
  overlaps?: string[];
  /** A rock field: the formations it placed of the count it was asked for. */
  placedOf?: [number, number];
  /** A pylon: the height its line stands at over the crowns, and the height it was authored at (m). */
  heightM?: number;
  authoredHeightM?: number;
}

interface SceneryReceipt {
  features: SceneryFeatureReceipt[];
  /** Pavements' and scree fans' ground: the world's ground cover keeps off it (map.ts withGroundCoverHoles). */
  groundCoverHoles: GroundCoverHole[];
  placed: number;
  skipped: number;
  rockTriangles: number;
  bakedTriangles: number;
  /** The power lines' conductor ribbons (their own mesh, the wire material). */
  wireTriangles: number;
  colliders: number;
  /** The field boundaries' works, when the map asks for them. */
  fieldWorks?: FieldWorksReceipt;
}

interface SceneryBuild {
  /** One geometry per rock formation (the props owner merges them into one mesh on the rock material). */
  rockPieces: THREE.BufferGeometry[];
  /** The power lines' conductors (maps/sceneryKit.ts buildConductor ribbons): the props owner draws them as one mesh on
   * the wire material, never in the baked bucket (wave 48: a sub-pixel tube there broke into dashes). */
  wires: THREE.BufferGeometry[];
  receipt: SceneryReceipt;
}

/** What the field works read: the map's block, its ground, its pads, its final solids, its aprons and yards. */
type FieldWorksBuildContext = Pick<SceneryBuildContext,
  'mapId' | 'scenery' | 'heightField' | 'spawns' | 'obstacles' | 'trees' | 'seed' | 'mobile' | 'hardstands' | 'yards'>;

type SceneryBuildSlice = { fine: true; progress: false; stage: string };

/**
 * The conductors' sag as a share of the span, and the tallest a tower stands (m). Wave 20 read the 2 % sag as "straight
 * hairlines" at a battle's range: a real line's 3-5 % hangs a visible curve between towers (the towers rise to keep the
 * crowns clear under it: 57-65 m on the 200-320 m spans the maps author).
 */
const PYLON_SAG = 0.04, PYLON_TALLEST_M = 70;

const SQUARE = 480;
const SPAWN_CLEAR = 22;

const SOFT_KINDS = new Set(['rock', 'small-rock', 'rubble', 'hedgehog']);

/** The hard solids a standing footprint may not enter, and the soft ones it may (reported). */
function solidConflicts(obstacles: readonly CollisionRecord[], x: number, z: number, r: number): { hard: string | null; soft: string[] } {
  const soft: string[] = [];
  for (const ob of obstacles) {
    if (ob.treeIdx != null) continue;
    if (x + r < ob.min[0] || x - r > ob.max[0] || z + r < ob.min[2] || z - r > ob.max[2]) continue;
    // the AABB overlaps: measure the record's centre against the disc for a fair read of small pieces
    const cx = (ob.min[0] + ob.max[0]) * 0.5, cz = (ob.min[2] + ob.max[2]) * 0.5;
    const half = Math.max(ob.max[0] - ob.min[0], ob.max[2] - ob.min[2]) * 0.5;
    if (Math.hypot(cx - x, cz - z) > r + half * 0.7) continue;
    const kind = ob.kind ?? (ob.crushable ? 'crushable' : 'rock');
    // boulders and the crushable clutter (rubble, small rocks, hedgehogs: activated as crushable after the merge) are soft
    const hard = !ob.crushable && !SOFT_KINDS.has(kind);
    if (hard) return { hard: kind, soft };
    if (soft.length < 8) soft.push(kind);
  }
  return { hard: null, soft };
}

/** The common admission: inside the square, off the pads, out of the road core, dry. */
function admission(ctx: SceneryBuildContext, x: number, z: number, r: number, roadMargin = 4): string | null {
  if (Math.max(Math.abs(x), Math.abs(z)) + r > SQUARE) return 'outside the square';
  for (const s of ctx.spawns) if (Math.hypot(x - s.x, z - s.z) < SPAWN_CLEAR + r) return 'spawn pad';
  if (ctx.heightField._roadDist(x, z) < roadMargin + r) return 'road';
  for (let i = 0; i <= 8; i++) {
    const a = i * Math.PI / 4, rr = i === 8 ? 0 : r;
    if (ctx.heightField.getWaterMaskAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr) > 0.05) return 'water';
  }
  return null;
}



/**
 * A pylon leg's records (the hitbox lane, 2026-10-07/08): its concrete footing (0.9 m square, from 0.15 m under the
 * tower's foot to 0.35 m over it), then the leg strut (0.16 m square; PYLON_LEG_HALF_M each side of its line, a
 * centimetre past the steel for its bolts and cleats) in slabs that lean in with it, each the hull of the strut's section
 * at its two levels, cut where the leg has drifted PYLON_LEG_DRIFT_M across (0.04 m within PYLON_FINE_TOP_M of the foot,
 * where shells fly and the strut leans most; 0.2 m above), up to the leg's end at 0.97 of the tower. The movement record
 * stops at PYLON_MOVE_TOP_M (no hull reaches higher); the shell and sight record runs to the leg's end. The lattice's
 * braces and ties (0.04-0.06 m) carry none: thinner than the audit's 10 cm sight threshold, as a fence's wires.
 */
const PYLON_LEG_HALF_M = 0.09, PYLON_FOOTING_HALF_M = 0.45, PYLON_FOOTING_TOP_M = 0.35;
const PYLON_FINE_TOP_M = 6, PYLON_MOVE_TOP_M = 4.5;
const PYLON_LEG_DRIFT_M = { fine: 0.04, coarse: 0.2 } as const;
function pylonLegRecords(
  tower: { halfAt: (y: number) => number; height: number; legHalf: number }, sx: number, sz: number,
  x: number, y: number, z: number, yaw: number,
): { obstacle: CollisionRecord; collider: CollisionRecord } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // a square (half a side `half`) round the leg's corner line at spread h, level ly over the seat: world x y z triples
  const square = (h: number, half: number, ly: number, out: number[]): void => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = sx * h + dx * half, lz = sz * h + dz * half;
      out.push(x + lx * c + lz * s, y + ly, z - lx * s + lz * c);
    }
  };
  const footing: number[] = [];
  square(tower.legHalf, PYLON_FOOTING_HALF_M, -0.15, footing);
  square(tower.legHalf, PYLON_FOOTING_HALF_M, PYLON_FOOTING_TOP_M, footing);
  const shell: SimpleCollisionShape[] = slabParts(convexSlabs(footing, PYLON_FOOTING_TOP_M + 0.15 + 1e-6, 8));
  const top = tower.height * 0.97;
  for (let y0 = PYLON_FOOTING_TOP_M; y0 < top - 1e-3;) {
    const h0 = tower.halfAt(y0), drift = y0 < PYLON_FINE_TOP_M ? PYLON_LEG_DRIFT_M.fine : PYLON_LEG_DRIFT_M.coarse;
    // the highest level at which the leg has drifted no more than `drift` (its spread falls monotonically with height)
    let lo = Math.min(top, y0 + 0.25), hi = top;
    if (Math.abs(tower.halfAt(hi) - h0) > drift) {
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (Math.abs(tower.halfAt(mid) - h0) <= drift) lo = mid; else hi = mid;
      }
    } else lo = hi;
    // the fine band ends at its own line, so the coarse slabs start there
    const y1 = y0 < PYLON_FINE_TOP_M && lo > PYLON_FINE_TOP_M ? PYLON_FINE_TOP_M : lo;
    const points: number[] = [];
    square(h0, PYLON_LEG_HALF_M, y0, points);
    square(tower.halfAt(y1), PYLON_LEG_HALF_M, y1, points);
    shell.push(...slabParts(convexSlabs(points, y1 - y0 + 1e-6, 8)));
    y0 = y1;
  }
  const record = (parts: SimpleCollisionShape[]): CollisionRecord => {
    const r = setCompoundShape({ min: [x, y, z], max: [x, y, z] } as CollisionRecord, parts);
    r.min[1] = Math.min(...parts.map((part) => part.y0!));
    r.max[1] = Math.max(...parts.map((part) => part.y1!));
    return r;
  };
  if (shell.length > 64) throw new Error(`pylon leg: ${shell.length} parts`);
  return {
    obstacle: record(shell.filter((part) => part.y0! < y + PYLON_MOVE_TOP_M)),
    collider: record(shell),
  };
}

/** The modes whose objective discs the match placement searches for, and how it reads each one's discs. */
const PLACED_DISCS: ReadonlyArray<readonly [string, (placement: MatchPlacement) => Array<[number, number, number]>]> = [
  ['zone_control', (p) => p.zones.map((zone) => [zone.x, zone.z, 30])],
  ['capture_the_flag', (p) => [[p.centers.alpha.x, p.centers.alpha.z, 12], [p.centers.bravo.x, p.centers.bravo.z, 12]]],
  ['turbo_ball', (p) => [[p.centers.alpha.x, p.centers.alpha.z, 18], [p.centers.bravo.x, p.centers.bravo.z, 18], [p.middle.x, p.middle.z, 12]]],
  ['ac130', (p) => [[p.middle.x, p.middle.z, 30]]],
];

/**
 * The layout footprints the field works keep off (the maps lane's clearances, 2026-10-03): every mode's objective
 * discs where the match placement seats them on this world — the zone-control discs (30 m), the flag bases (12 m), the
 * turbo-ball goals (18 m) and kickoff (12 m), the gunship's extraction (30 m); the search moves a goal or the extraction
 * off rough ground, so the placement itself runs here, on this world's ground and final solids, as the battle's does —
 * with their authored targets beside them, the Frontline Assault sectors (30 m) and their trenches (the assault
 * world's communication trench too), the field trenches the terrain carved, the bridge decks with their approaches,
 * the aprons and the yards, each with a 3 m margin (the spawn pads and the roads keep their own gates in
 * fieldWorks.ts). A generator: one slice per mode's placement.
 */
function* fieldWorksKeepOut(ctx: FieldWorksBuildContext): Generator<SceneryBuildSlice, FieldWorksKeepOut, void> {
  const discs: Array<[number, number, number]> = [];
  const rects: FieldWorksRect[] = [];
  const M = 3;
  const [player, ...enemies] = ctx.spawns;
  if (player) {
    const anchors = matchPlacementAnchors({ player, enemies });
    const obstacles = [...ctx.obstacles, ...(ctx.trees ?? [])];
    const world = { mapId: ctx.mapId, anchors, obstacles, queryObstacles: createObstacleGrid(obstacles),
      heightField: ctx.heightField as unknown as PlacementTerrain };
    for (const [mode, read] of PLACED_DISCS) {
      try {
        for (const [x, z, r] of read(createMatchPlacement({ ...world, mode }))) discs.push([x, z, r + M]);
      } catch {
        // no safe placement for the mode on this world (the battle cannot start it either): its targets below stand
      }
      yield { fine: true, progress: false, stage: 'field-works' };
    }
    const { alpha, bravo } = anchors;
    const mx = (alpha.x + bravo.x) * 0.5, mz = (alpha.z + bravo.z) * 0.5;
    const al = Math.hypot(bravo.x - alpha.x, bravo.z - alpha.z) || 1;
    const ux = (bravo.x - alpha.x) / al, uz = (bravo.z - alpha.z) / al;
    const layout = MATCH_OBJECTIVE_LAYOUTS[ctx.mapId];
    for (const zone of layout?.zones ?? [-105, 0, 105].map((o) => ({ x: mx + uz * o, z: mz - ux * o }))) discs.push([zone.x, zone.z, 30 + M]);
    const kickoff = layout?.kickoff ?? { x: mx, z: mz };
    discs.push([kickoff.x, kickoff.z, 12 + M], [mx, mz, 30 + M], [alpha.x, alpha.z, 18 + M], [bravo.x, bravo.z, 18 + M]);
    for (const line of planAssaultTrenchLines(alpha, bravo).lines) {
      discs.push([line.x, line.z, 30 + M]);
      rects.push({ x: line.x, z: line.z, ux: line.lx, uz: line.lz, halfAlong: line.halfLengthM + ASSAULT_TRENCH.endRampM + M,
        halfAcross: ASSAULT_TRENCH.floorHalfWidthM + ASSAULT_TRENCH.wallRunM + M });
    }
  }
  // the assault world's communication trench along the axis
  const connector = ctx.heightField.assaultTrenchLines?.connector;
  if (connector) {
    const cl = Math.hypot(connector.x1 - connector.x0, connector.z1 - connector.z0) || 1;
    rects.push({ x: (connector.x0 + connector.x1) * 0.5, z: (connector.z0 + connector.z1) * 0.5,
      ux: (connector.x1 - connector.x0) / cl, uz: (connector.z1 - connector.z0) / cl,
      halfAlong: cl * 0.5 + M, halfAcross: ASSAULT_TRENCH.connectorHalfWidthM + ASSAULT_TRENCH.connectorWallRunM + M });
  }
  const field = ctx.heightField.fieldTrenchLines;
  for (const line of field?.lines ?? []) {
    const profile = field?.profile ?? ASSAULT_TRENCH;
    rects.push({ x: line.x, z: line.z, ux: line.lx, uz: line.lz, halfAlong: line.halfLengthM + profile.endRampM + M,
      halfAcross: profile.floorHalfWidthM + profile.wallRunM + M });
  }
  for (const deck of ctx.heightField.bridgeDecks ?? []) {
    rects.push({ x: deck.x, z: deck.z, ux: deck.ux, uz: deck.uz, halfAlong: deck.halfLength + deck.approachM + M, halfAcross: deck.halfWidth + M });
  }
  for (const strip of ctx.hardstands ?? []) {
    const a = THREE.MathUtils.degToRad(strip.yawDeg ?? 0);
    rects.push({ x: strip.x, z: strip.z, ux: Math.sin(a), uz: Math.cos(a), halfAlong: strip.length * 0.5 + M, halfAcross: strip.width * 0.5 + M });
  }
  // a yard's dressing reaches 7.6 m outside its structure's envelope (yardDressing.ts: a piece's centre 0.6 + r + 2 m
  // out, its radius r at most 2.5 m)
  for (const yard of ctx.yards ?? []) discs.push([yard.x, yard.z, Math.hypot(yard.w, yard.d) * 0.5 + YARD_REACH_M + M]);
  return { discs, rects };
}

/** Build the map's scenery. A generator: one slice per feature, so a loading frame never carries more than one. */
export function* composeScenery(ctx: SceneryBuildContext): Generator<SceneryBuildSlice, SceneryBuild, void> {
  const receipt: SceneryReceipt = { features: [], groundCoverHoles: [], placed: 0, skipped: 0, rockTriangles: 0, bakedTriangles: 0, wireTriangles: 0, colliders: 0 };
  const rockPieces: THREE.BufferGeometry[] = [], wires: THREE.BufferGeometry[] = [];
  const scenery = ctx.scenery;
  if (!scenery) return { rockPieces, wires, receipt };
  const noise = new SimplexNoise({ random: mulberry32(ctx.seed + 9299) });
  const ground = ctx.heightField;
  const skip = (feature: SceneryFeatureReceipt, reason: string) => {
    feature.status = 'skipped'; feature.reason = reason; receipt.skipped++; receipt.features.push(feature);
  };
  // a standing formation's records (the hitbox lane, 2026-10-07): the movement footprint and the shell bands of the stone
  // itself (sceneryRocks.ts massOf, rockCollision.ts)
  const addMass = (mass: { y0: number; profile: FormationCollisionProfile }) => {
    const rec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] }, col: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
    applyFormationCollision(rec, col, mass.profile, mass.y0);
    ctx.obstacles.push(rec);
    ctx.colliders.push(col);
    receipt.colliders++;
  };

  // ---- rock formations and stone landmarks: one stream each, one geometry each
  const stoneJobs: Array<{ spec: RockFormationSpec; family: 'rock' | 'landmark'; name: string | null; stream: number }> = [];
  (scenery.rocks ?? []).forEach((rock, i) => stoneJobs.push({
    spec: { form: rock.form, geology: rock.geology, x: rock.x, z: rock.z, radius: rock.radius, height: rock.height, yawDeg: rock.yawDeg, shed: rock.shed, tone: rock.tone },
    family: 'rock', name: rock.name ?? null, stream: ctx.seed + 9301 + 131 * i,
  }));
  (scenery.landmarks ?? []).forEach((mark, i) => {
    if (!isStoneLandmark(mark.kind)) return;
    const d = STONE_LANDMARKS[mark.kind];
    stoneJobs.push({
      spec: { form: d.form, geology: mark.geology ?? d.geology, x: mark.x, z: mark.z, radius: mark.scale ?? d.radius, height: mark.height ?? d.height, yawDeg: mark.yawDeg, tone: mark.tone },
      family: 'landmark', name: mark.name ?? null, stream: ctx.seed + 11701 + 131 * i,
    });
  });
  for (const job of stoneJobs) {
    const { spec } = job;
    const feature: SceneryFeatureReceipt = { family: job.family, kind: `${spec.geology} ${spec.form}`, name: job.name, x: spec.x, z: spec.z, status: 'placed' };
    const standing = spec.form !== 'pavement' && spec.form !== 'scree';
    const reach = rockReach(spec);
    const refused = admission(ctx, spec.x, spec.z, standing ? reach : spec.radius * 0.8, standing ? 4 : 1.5);
    if (refused) { skip(feature, refused); yield { fine: true, progress: false, stage: 'scenery' }; continue; }
    if (standing) {
      const { hard, soft } = solidConflicts(ctx.obstacles, spec.x, spec.z, reach);
      if (hard) { skip(feature, `solid ${hard}`); yield { fine: true, progress: false, stage: 'scenery' }; continue; }
      if (soft.length) feature.overlaps = soft;
    }
    const built = buildRockFormation(spec, ground, noise, mulberry32(job.stream), { mobile: ctx.mobile });
    if (!built.geometry) { skip(feature, 'empty'); continue; }
    rockPieces.push(built.geometry);
    for (const mass of built.masses) addMass(mass);
    if (!standing) receipt.groundCoverHoles.push({ x: spec.x, z: spec.z, r: spec.radius * (spec.form === 'pavement' ? 0.85 : 0.6) });
    feature.triangles = built.triangles;
    receipt.rockTriangles += built.triangles;
    receipt.placed++;
    receipt.features.push(feature);
    yield { fine: true, progress: false, stage: 'scenery' };
  }

  // ---- bedrock: a hill's beds on its steep flanks, a skin no hull reaches (no mass); one stream each
  for (const [hi, hill] of (scenery.bedrock ?? []).entries()) {
    const feature: SceneryFeatureReceipt = { family: 'bedrock', kind: `${hill.geology} bedrock`, name: hill.name ?? null, x: hill.x, z: hill.z, status: 'placed' };
    if (Math.max(Math.abs(hill.x), Math.abs(hill.z)) > SQUARE) { skip(feature, 'outside the square'); continue; }
    if (ground.getWaterMaskAt(hill.x, hill.z) > 0.05) { skip(feature, 'water'); continue; }
    const built = buildBedrock({ geology: hill.geology, x: hill.x, z: hill.z, radius: hill.radius, minGrade: hill.minGrade, beds: hill.beds, crown: hill.crown, tone: hill.tone },
      ground, noise, mulberry32(ctx.seed + 17101 + 131 * hi), { mobile: ctx.mobile });
    if (!built.geometry) { skip(feature, 'no flank steeper than the hulls climb'); yield { fine: true, progress: false, stage: 'scenery' }; continue; }
    rockPieces.push(built.geometry);
    feature.triangles = built.triangles;
    receipt.rockTriangles += built.triangles;
    receipt.placed++;
    receipt.features.push(feature);
    yield { fine: true, progress: false, stage: 'scenery' };
  }

  // ---- rock fields: formations scattered over a hillside, the steeper ground first, clear of each other and the trees
  const standingSites: Array<{ x: number; z: number; r: number }> = stoneJobs.map((job) => ({ x: job.spec.x, z: job.spec.z, r: rockReach(job.spec) }));
  // symmetric deployments (modes lane, 2026-10-08): both sides' deployment slots keep the pads' clearing (sim/matchPlacement.ts)
  const [player, ...enemies] = ctx.spawns;
  const deploymentSlots = player ? deploymentClearings(ctx.heightField as unknown as PlacementTerrain, { player, enemies }) : [];
  const treeNear = (x: number, z: number, r: number): boolean => {
    for (const tree of ctx.trees ?? []) {
      const cx = (tree.min[0] + tree.max[0]) * 0.5, cz = (tree.min[2] + tree.max[2]) * 0.5;
      if (Math.abs(cx - x) < r + 2 && Math.abs(cz - z) < r + 2 && Math.hypot(cx - x, cz - z) < r + 1.5) return true;
    }
    return false;
  };
  for (const [fi, field] of (scenery.rockFields ?? []).entries()) {
    const rng = mulberry32(ctx.seed + 15101 + 131 * fi);
    const forms = field.forms ?? FIELD_FORMS[field.geology];
    const total = forms.reduce((sum, [, w]) => sum + w, 0);
    const [sMin, sMax] = field.size ?? [2.5, 6];
    const talus = field.talusDeg === undefined ? TALUS_DEG : field.talusDeg;
    // the same formations on every tier: they are colliders the hosts' manifests carry (the phones get fewer stones and
    // facets per formation, never fewer formations)
    const want = Math.max(0, Math.round(field.count));
    const feature: SceneryFeatureReceipt = { family: 'rockField', kind: `${field.geology} field`, name: field.name ?? null, x: field.x, z: field.z, status: 'placed', triangles: 0 };
    let placed = 0;
    for (let attempt = 0; attempt < want * 12 && placed < want; attempt++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * field.radius;
      const x = field.x + Math.cos(a) * rr, z = field.z + Math.sin(a) * rr;
      let pick = rng() * total, form = forms[0][0];
      for (const [f, w] of forms) { if ((pick -= w) <= 0) { form = f; break; } }
      const r = sMin + Math.pow(rng(), 1.4) * (sMax - sMin);
      const slopeRoll = rng(), stream = (rng() * 4294967296) >>> 0;
      // the steeper ground first: a field's rock shows where the soil is thin
      const gx = ground.getHeightAt(x + 3, z) - ground.getHeightAt(x - 3, z), gz = ground.getHeightAt(x, z + 3) - ground.getHeightAt(x, z - 3);
      const grade = Math.hypot(gx, gz) / 6;
      if (slopeRoll < (field.slopeBias ?? 0.5) * (1 - Math.min(1, grade / 0.18))) continue;
      const standing = form !== 'pavement' && form !== 'scree';
      const reach = standing ? rockReach({ form, radius: r }) : r * 0.8;
      if (field.avoid?.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar + reach)) continue;
      if (admission(ctx, x, z, reach, standing ? 4 : 2)) continue;
      if (standingSites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + reach + 3)) continue;
      if (treeNear(x, z, reach)) continue;
      if (standing && solidConflicts(ctx.obstacles, x, z, reach).hard) continue;
      // (only a pavement draws here: its scar's roll; the field's later candidates follow the draws as authored)
      const height = form === 'tor' ? r * 0.75 : form === 'crag' ? r * 0.9 : form === 'outcrop' ? r * 0.45
        : form === 'hoodoo' ? r * 1.9 : form === 'menhir' ? r * 2.6 : form === 'cairn' ? r * 0.6
          : form === 'pavement' ? (rng() < 0.35 ? 0.8 : 0) : 0;
      const yawDeg = rng() * 180;
      // the steeper ground first, but never a wall (talusDeg, default 35 degrees; the mountains lane, 2026-10-04): no
      // formation where the ground falls away past a talus slope. Its draws are taken, so the field's later candidates
      // keep their seats.
      if (talus !== null && !restsOnTalus(ground, x, z, reach, talus)) continue;
      // symmetric deployments: a formation in a deployment slot's clearing is left out after its draws, counted and spaced
      // as if it stood, so every other formation of the field keeps its seat (the pads keep theirs by the admission)
      if (deploymentSlots.some((slot) => Math.hypot(x - slot.x, z - slot.z) < SPAWN_CLEAR + reach)) {
        standingSites.push({ x, z, r: reach });
        placed++;
        continue;
      }
      const built = buildRockFormation({ form, geology: field.geology, x, z, radius: r, height, yawDeg, tone: field.tone, shed: 0.6 },
        ground, noise, mulberry32(stream), { mobile: ctx.mobile || r < (field.leanUnder ?? 0) });
      if (!built.geometry) continue;
      rockPieces.push(built.geometry);
      for (const mass of built.masses) addMass(mass);
      if (!standing) receipt.groundCoverHoles.push({ x, z, r: r * (form === 'pavement' ? 0.85 : 0.6) });
      standingSites.push({ x, z, r: reach });
      feature.triangles! += built.triangles;
      receipt.rockTriangles += built.triangles;
      placed++;
      if (placed % 4 === 0) yield { fine: true, progress: false, stage: 'scenery' };
    }
    feature.placedOf = [placed, want];
    if (placed) receipt.placed++; else { feature.status = 'skipped'; feature.reason = 'no admissible ground'; receipt.skipped++; }
    receipt.features.push(feature);
    yield { fine: true, progress: false, stage: 'scenery' };
  }

  // ---- destructible landmarks: the props pools build them; one stream each for the jitter
  (scenery.landmarks ?? []).forEach((mark, i) => {
    if (!isDestructibleLandmark(mark.kind)) return;
    const meta = SCENERY_DESTRUCTIBLE_TYPES[mark.kind];
    const scale = mark.scale ?? 1;
    const feature: SceneryFeatureReceipt = { family: 'landmark', kind: mark.kind, name: mark.name ?? null, x: mark.x, z: mark.z, status: 'placed' };
    const r = meta.r * scale;
    const refused = admission(ctx, mark.x, mark.z, r, 4);
    if (refused) { skip(feature, refused); return; }
    const { hard } = solidConflicts(ctx.obstacles, mark.x, mark.z, r);
    if (hard) { skip(feature, `solid ${hard}`); return; }
    const rng = mulberry32(ctx.seed + 12101 + 131 * i);
    const yaw = THREE.MathUtils.degToRad(mark.yawDeg ?? rng() * 360);
    ctx.addDestructible(mark.kind, mark.x, ground.getHeightAt(mark.x, mark.z), mark.z, yaw, scale);
    receipt.placed++;
    receipt.features.push(feature);
  });
  yield { fine: true, progress: false, stage: 'scenery' };

  // ---- power lines: towers into the baked bucket, legs as colliders, conductors between consecutive towers
  for (const [li, line] of (scenery.powerLines ?? []).entries()) {
    // wave 16 ("the conductors run through the crowns"): real lines span woods on tall towers. The line's towers stand
    // tall enough that the lowest conductor, hanging in its sag, clears every crown under the span by 3 m and the
    // ground by 12 m; they keep the authored tower's breadth, footing and leg colliders, so the trees and the solids
    // stay as they were. (The lower arms hang their strings at 62 % of the tower, the strings 2.2 m below them.)
    const H0 = line.heightM ?? 34;
    const reach = 11.5 * (H0 / 34) + 6; // the outer phase and a crown's radius
    let H = H0;
    for (let t = 0; t + 1 < line.towers.length; t++) {
      const [ax, az] = line.towers[t], [bx, bz] = line.towers[t + 1];
      const span = Math.hypot(bx - ax, bz - az);
      if (span < 1) continue;
      const ux = (bx - ax) / span, uz = (bz - az) / span, sag = span * PYLON_SAG;
      const footA = ground.getHeightAt(ax, az), footB = ground.getHeightAt(bx, bz);
      const need = (f: number, top: number) => (top + 2.2 + 4 * sag * f * (1 - f) - (footA + (footB - footA) * f)) / 0.62;
      for (let k = 0, n = Math.max(2, Math.ceil(span / 8)); k <= n; k++) {
        H = Math.max(H, need(k / n, ground.getHeightAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n) + 12));
      }
      for (const tree of ctx.treeTops ?? []) {
        const dx = tree.x - ax, dz = tree.z - az, along = dx * ux + dz * uz;
        if (along < 0 || along > span || Math.abs(dz * ux - dx * uz) > reach) continue;
        H = Math.max(H, need(along / span, tree.top + 3));
      }
    }
    H = Math.min(H, PYLON_TALLEST_M);
    const rng = mulberry32(ctx.seed + 13901 + 131 * li);
    const tower = buildPylon(rng, H, ctx.mobile, H0);
    const standing: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (let t = 0; t < line.towers.length; t++) {
      const [x, z] = line.towers[t];
      const feature: SceneryFeatureReceipt = { family: 'powerLine', kind: 'pylon', name: line.name ?? null, x, z, status: 'placed', heightM: H, authoredHeightM: H0 };
      const refused = admission(ctx, x, z, tower.legHalf * 1.42 + 0.6, 4);
      if (refused) { skip(feature, refused); continue; }
      const { hard } = solidConflicts(ctx.obstacles, x, z, tower.legHalf * 1.42);
      if (hard) { skip(feature, `solid ${hard}`); continue; }
      // the line's direction at this tower: the bisector of its spans (the crossarms stand across it)
      const [px, pz] = line.towers[Math.max(0, t - 1)], [nx, nz] = line.towers[Math.min(line.towers.length - 1, t + 1)];
      const yaw = Math.atan2(nx - px, nz - pz);
      // seat on the lowest leg so no footing floats
      let y = Infinity;
      const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of corners) {
        const lx = sx * tower.legHalf, lz = sz * tower.legHalf;
        const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        y = Math.min(y, ground.getHeightAt(wx, wz));
      }
      // each leg's colliders (the hitbox lane, 2026-10-07/08): its footing and the leg strut's own slabs, leaning in with
      // it to the leg's end, where a 0.45 m upright cylinder stood round the footing to 0.6 of the authored height (65 % of
      // its contact area and of the sight lines that met it clear of the steel, and nothing over 20 m of a 63 m tower)
      for (const [sx, sz] of corners) {
        const leg = pylonLegRecords(tower, sx, sz, x, y - 0.15, z, yaw);
        ctx.obstacles.push(leg.obstacle); ctx.colliders.push(leg.collider); receipt.colliders++;
      }
      const piece = tower.geometry.clone();
      piece.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.15, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
      ctx.conform(piece, ctx.baked);
      ctx.baked.push(piece);
      receipt.bakedTriangles += piece.attributes.position.count / 3;
      standing.push({ x, y: y - 0.15, z, yaw });
      feature.triangles = piece.attributes.position.count / 3;
      receipt.placed++;
      receipt.features.push(feature);
    }
    for (let t = 0; t + 1 < standing.length; t++) {
      const a = standing[t], b = standing[t + 1];
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      const segments = ctx.mobile ? 10 : 18;
      for (const [ax, ay] of tower.arms) {
        const pa = new THREE.Vector3(ax, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.yaw);
        const pb = new THREE.Vector3(ax, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
        const wire = buildConductor(a.x + pa.x, a.y + ay, a.z + pa.z, b.x + pb.x, b.y + ay, b.z + pb.z,
          span * (ay >= H - 0.01 ? PYLON_SAG * 0.8 : PYLON_SAG), segments, ay >= H - 0.01 ? 0.03 : 0.055);
        wires.push(wire);
        receipt.wireTriangles += wire.index!.count / 3;
      }
    }
    tower.geometry.dispose();
    yield { fine: true, progress: false, stage: 'scenery' };
  }

  return { rockPieces, wires, receipt };
}

/**
 * The field boundaries' works: walls and banks on the land use's own lines (decor, no collision; fieldWorks.ts). The
 * props owner runs this once every solid is final (after its pools' refit), so the keep-out's match placement reads the
 * same solids the battle's does. Null when the map asks for none or the world has no land use.
 */
export function* composeFieldWorks(
  ctx: FieldWorksBuildContext,
): Generator<SceneryBuildSlice, Omit<FieldWorksBuilt, 'receipt'> & { receipt: FieldWorksReceipt | null }, void> {
  const works = ctx.scenery?.fieldWorks;
  if (!works || (!works.walls && !works.banks) || !ctx.heightField._landUseAt) {
    return { geometry: null, wallCells: [], wallGeometry: null, wallFarGeometry: null, bankGeometry: null, receipt: null, fine: null };
  }
  // (the hard solids: buildings, walls, the rock masses; not the trees, not the crushable clutter)
  const solids = ctx.obstacles.filter((ob) => ob.treeIdx == null && !ob.crushable && !SOFT_KINDS.has(ob.kind ?? ''));
  const keepOut = yield* fieldWorksKeepOut(ctx);
  const noise = new SimplexNoise({ random: mulberry32(ctx.seed + 9299) });
  return yield* buildFieldWorks(ctx.heightField, noise, {
    walls: !!works.walls, banks: !!works.banks, spawns: ctx.spawns, solids, keepOut, mobile: ctx.mobile,
    wallTone: works.wallTone, bankTone: works.bankTone,
  });
}
