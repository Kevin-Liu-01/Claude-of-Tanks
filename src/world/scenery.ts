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
import { buildConductor, buildPylon, SCENERY_DESTRUCTIBLE_TYPES } from './maps/sceneryKit.ts';
import { buildFieldWorks, type FieldWorksReceipt } from './fieldWorks.ts';
import {
  FIELD_FORMS, STONE_LANDMARKS, isDestructibleLandmark, isStoneLandmark, rockReach, type GroundCoverHole, type SceneryConfig,
} from './sceneryPlan.ts';
import { cloneCollisionRecord, setCircleShape, setConvexShape, type CollisionRecord } from './collision.ts';

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
}

interface SceneryBuildContext {
  mapId: string;
  scenery: SceneryConfig | null | undefined;
  heightField: SceneryHeightField;
  spawns: ReadonlyArray<{ x: number; z: number }>;
  /** The solids already placed (props obstacles); the pass appends its own to both lists. */
  obstacles: CollisionRecord[];
  /** The trees (the vegetation's obstacles): a rock field keeps off them. */
  trees?: readonly CollisionRecord[];
  colliders: CollisionRecord[];
  /** The props `baked` bucket (the pylons fold in). */
  baked: THREE.BufferGeometry[];
  /** Shape a piece after its bucket's first part (mergeGeometries wants one attribute set per bucket). */
  conform(piece: THREE.BufferGeometry, bucket: readonly THREE.BufferGeometry[]): void;
  /** props addDestructible: the landmark kinds join the destructible pools. */
  addDestructible(kind: string, x: number, y: number, z: number, yaw: number, scale: number): unknown;
  seed: number;
  mobile: boolean;
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
}

interface SceneryReceipt {
  features: SceneryFeatureReceipt[];
  /** Pavements' and scree fans' ground: the world's ground cover keeps off it (map.ts withGroundCoverHoles). */
  groundCoverHoles: GroundCoverHole[];
  placed: number;
  skipped: number;
  rockTriangles: number;
  bakedTriangles: number;
  colliders: number;
  /** The field boundaries' works, when the map asks for them. */
  fieldWorks?: FieldWorksReceipt;
}

interface SceneryBuild {
  /** One geometry per rock formation (the props owner merges them into one mesh on the rock material). */
  rockPieces: THREE.BufferGeometry[];
  /** The field boundaries' walls and banks: one welded geometry on the rock material, decor that casts no shadow. */
  fieldWorks: THREE.BufferGeometry | null;
  receipt: SceneryReceipt;
}

type SceneryBuildSlice = { fine: true; progress: false; stage: string };

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

function staticMass(points: number[], y0: number, y1: number): CollisionRecord {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]);
    z0 = Math.min(z0, points[i + 1]); z1 = Math.max(z1, points[i + 1]);
  }
  return setConvexShape({ min: [x0, y0, z0], max: [x1, y1, z1] } as CollisionRecord, points);
}

/** Build the map's scenery. A generator: one slice per feature, so a loading frame never carries more than one. */
export function* composeScenery(ctx: SceneryBuildContext): Generator<SceneryBuildSlice, SceneryBuild, void> {
  const receipt: SceneryReceipt = { features: [], groundCoverHoles: [], placed: 0, skipped: 0, rockTriangles: 0, bakedTriangles: 0, colliders: 0 };
  const rockPieces: THREE.BufferGeometry[] = [];
  const scenery = ctx.scenery;
  if (!scenery) return { rockPieces, fieldWorks: null, receipt };
  const noise = new SimplexNoise({ random: mulberry32(ctx.seed + 9299) });
  const ground = ctx.heightField;
  const skip = (feature: SceneryFeatureReceipt, reason: string) => {
    feature.status = 'skipped'; feature.reason = reason; receipt.skipped++; receipt.features.push(feature);
  };
  const addMass = (points: number[], y0: number, y1: number) => {
    const rec = staticMass(points, y0, y1);
    ctx.obstacles.push(rec);
    ctx.colliders.push(cloneCollisionRecord(rec));
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
    for (const mass of built.masses) addMass(mass.points, mass.y0, mass.y1);
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
      const built = buildRockFormation({ form, geology: field.geology, x, z, radius: r, height, yawDeg: rng() * 180, tone: field.tone, shed: 0.6 },
        ground, noise, mulberry32(stream), { mobile: ctx.mobile });
      if (!built.geometry) continue;
      rockPieces.push(built.geometry);
      for (const mass of built.masses) addMass(mass.points, mass.y0, mass.y1);
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
    const H = line.heightM ?? 34;
    const rng = mulberry32(ctx.seed + 13901 + 131 * li);
    const tower = buildPylon(rng, H, ctx.mobile);
    const standing: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (let t = 0; t < line.towers.length; t++) {
      const [x, z] = line.towers[t];
      const feature: SceneryFeatureReceipt = { family: 'powerLine', kind: 'pylon', name: line.name ?? null, x, z, status: 'placed' };
      const refused = admission(ctx, x, z, tower.legHalf * 1.42 + 0.6, 4);
      if (refused) { skip(feature, refused); continue; }
      const { hard } = solidConflicts(ctx.obstacles, x, z, tower.legHalf * 1.42);
      if (hard) { skip(feature, `solid ${hard}`); continue; }
      // the line's direction at this tower: the bisector of its spans (the crossarms stand across it)
      const [px, pz] = line.towers[Math.max(0, t - 1)], [nx, nz] = line.towers[Math.min(line.towers.length - 1, t + 1)];
      const yaw = Math.atan2(nx - px, nz - pz);
      // seat on the lowest leg so no footing floats
      let y = Infinity;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = sx * tower.legHalf, lz = sz * tower.legHalf;
        const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        y = Math.min(y, ground.getHeightAt(wx, wz));
        const leg = setCircleShape({ min: [wx - 0.5, y - 1, wz - 0.5], max: [wx + 0.5, y + H * 0.6, wz + 0.5] } as CollisionRecord, wx, wz, 0.45);
        ctx.obstacles.push(leg); ctx.colliders.push(cloneCollisionRecord(leg)); receipt.colliders++;
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
          span * (ay >= H - 0.01 ? 0.022 : 0.03), segments, ay >= H - 0.01 ? 0.03 : 0.045);
        ctx.conform(wire, ctx.baked);
        ctx.baked.push(wire);
        receipt.bakedTriangles += wire.attributes.position.count / 3;
      }
    }
    tower.geometry.dispose();
    yield { fine: true, progress: false, stage: 'scenery' };
  }

  // ---- the field boundaries' works: walls and banks on the land use's own lines (decor, no collision)
  let fieldWorks: THREE.BufferGeometry | null = null;
  const works = scenery.fieldWorks;
  if (works && (works.walls || works.banks)) {
    const built = yield* buildFieldWorks(ground, noise, {
      walls: !!works.walls, banks: !!works.banks, spawns: ctx.spawns, mobile: ctx.mobile, wallTone: works.wallTone, bankTone: works.bankTone,
    });
    fieldWorks = built.geometry;
    receipt.fieldWorks = built.receipt;
  }
  return { rockPieces, fieldWorks, receipt };
}
