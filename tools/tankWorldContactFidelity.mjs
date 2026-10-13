// Hitbox fidelity for the tank-world contact census (physics interactions stream, 2026-10-13): does what a hull stands
// on and runs into match what the player sees? Built in Node from the shard builders (tools/headlessWorldCollision.mjs),
// so the meshes and the records are the shipped ones (tools/world-collider-audit.mjs builds the same world).
//
// Two measures per map:
//   contact band  the collider's footprint against the mesh's section in the tank-contact band, per kind
//                 (tools/worldColliderAudit.mjs): phantom = collider where nothing stands (an invisible wall), leak = the
//                 object's mesh where no collider stands (a drive-through gap)
//   support       every standable record's tops (the structure support's rule: a non-crushable record 0.9 m tall or
//                 more, its parts' tops) against the mesh's top under the same point, cast down from above: a top over
//                 the visible surface floats the hull on air, a top under it sinks the hull into what it sees; a point
//                 inside the record's box where the mesh stands a hull's height over the ground with no top under it is a
//                 hole a hull falls into
import { createObstacleGrid, pointInsideCollisionRecord, HULL_STANDABLE_HEIGHT_M } from '../src/world/collision.ts';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';
import { auditMapWorld, buildPropsSoup, kindTotals, rayTriangles } from './worldColliderAudit.mjs';

/** A support top further than this from the visible top is felt (the hull floats or sinks by it). */
export const SUPPORT_ERROR_M = 0.15;
/** Sample spacing over a record's footprint (m) and the most points one record takes. */
const SUPPORT_STEP_M = 0.75;
const SUPPORT_MAX_POINTS = 96;

/** The census class and group a standable record's support is judged under. */
export function supportGroup(record) {
  if (record.kind === 'structure' || record.structureIdx != null) return ['roofs', 'building'];
  if (record.kind === 'tank-wreck' || record.kind === 'tram-wreck') return ['objects', 'wreck'];
  if (record.kind === 'bridge') return ['objects', 'bridge'];
  if (record.kind == null) return ['terrain', record.max[1] - record.min[1] > 3.5 ? 'outcrop' : 'mass'];
  return ['objects', record.kind];
}

const partsOf = (record) => (record.shape2?.kind === 'compound' ? record.shape2.parts : [record.shape2 ?? null]);
function ownTopAt(record, x, z) {
  let best = -Infinity;
  for (const part of partsOf(record)) {
    const top = part?.y1 ?? record.max[1];
    if (top > best && pointInsideCollisionRecord(record, part, x, z)) best = top;
  }
  return best;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

let builders = null;
async function worldBuilders() {
  if (builders) return builders;
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/vehicles/fleetFactory.ts'), import('../src/world/propsModelStore.ts'),
  ]);
  await models.preloadPropModels();
  builders = { maps, terrain, vegetation, props, fleet };
  return builders;
}

/** Measure one map (and variant): { contact: per-kind band totals, support: per-group support totals, worst }. */
export async function fidelityMap(mapId, { variant = 'base', perKind = 12, recordsPerGroup = 40 } = {}) {
  const { maps, terrain, vegetation, props, fleet } = await worldBuilders();
  const config = variant === 'base' ? maps.getMapConfig(mapId) : { ...maps.getMapConfig(mapId), assaultTrenches: true };
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const dressing = props.createProps(field, engine, 2002, config, flora);
  const soup = buildPropsSoup(dressing);
  const groundAt = field.getContactHeightAt ? (x, z) => field.getContactHeightAt(x, z) : (x, z) => field.getHeightAt(x, z);

  // contact band, per kind (rays off: the census is about hulls, the shell audit is its own)
  const audit = auditMapWorld({ mapId, field, flora, dressing, families: ['rocks', 'records'], rays: false, createObstacleGrid,
    recordLimit: perKind, soup });
  const contact = kindTotals(audit.rows).map((k) => ({ kind: k.kind, n: k.n, phantomShare: k.phantomShare, leakShare: k.leakShare,
    colliderM2: k.colliderM2, meshM2: k.meshM2, topErrM: k.topErrM }));
  // rock gaps (the coordinator's ask, 2026-10-13): every drawn stone a hull meets with no movement record, or with one far
  // smaller than its stone in the tank-contact band (over half its section uncovered), and the scenery stone the
  // formation records leave uncovered — each with its place, so a lane can go to it
  const rockGaps = { noCollider: [], undersized: [], stones: 0, masses: 0, formationLeakShare: null };
  for (const row of audit.rows) {
    if (row.kind === 'scenery-union' || row.kind === 'formation-union') {
      rockGaps.formationLeakShare = row.meshM2 ? +(row.leakM2 / row.meshM2).toFixed(3) : null;
      continue;
    }
    const stone = row.kind === 'boulder' || row.kind === 'small-rock' || row.kind === 'boulder-no-collider';
    if (!stone && row.kind !== 'scenery-mass') continue;
    if (stone) rockGaps.stones++; else rockGaps.masses++;
    const at = { x: row.x, z: row.z, kind: row.kind, riseM: +(row.meshRiseM ?? 0).toFixed(2), meshM2: +row.meshM2.toFixed(2),
      leakShare: row.meshM2 ? +(row.leakM2 / row.meshM2).toFixed(2) : 0 };
    if (row.kind === 'boulder-no-collider') rockGaps.noCollider.push(at);
    else if (row.meshM2 > 0.5 && row.leakM2 / row.meshM2 > 0.5) rockGaps.undersized.push(at);
  }

  // support: standable records, a sample per group
  const standable = dressing.obstacles.filter((r) => !r.crushable && r.treeIdx == null && r.max[1] - r.min[1] >= HULL_STANDABLE_HEIGHT_M);
  const byGroup = new Map();
  for (const record of standable) {
    const [cls, group] = supportGroup(record);
    const key = `${cls}/${group}`;
    (byGroup.get(key) ?? byGroup.set(key, []).get(key)).push(record);
  }
  const support = {};
  const worst = [];
  for (const [key, records] of byGroup) {
    // an even sample over the group, in the shard's order (deterministic)
    const stride = Math.max(1, Math.floor(records.length / recordsPerGroup));
    const g = { records: 0, points: 0, floatPts: 0, sinkPts: 0, phantomPts: 0, holePts: 0, errors: [], holeCells: 0 };
    for (let i = 0; i < records.length && g.records < recordsPerGroup; i += stride) {
      const record = records[i];
      g.records++;
      const w = record.max[0] - record.min[0], d = record.max[2] - record.min[2];
      const step = Math.max(SUPPORT_STEP_M, Math.sqrt((w * d) / SUPPORT_MAX_POINTS));
      let recWorst = 0, recWorstAt = null, recHoles = 0, recPts = 0;
      for (let x = record.min[0] + step / 2; x < record.max[0]; x += step) {
        for (let z = record.min[2] + step / 2; z < record.max[2]; z += step) {
          const top = ownTopAt(record, x, z);
          const ground = groundAt(x, z);
          const from = Math.max(record.max[1], ground) + 4;
          const tris = soup.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01);
          const hit = rayTriangles(soup, tris, x, from, z, 0, -1, 0, from - ground + 0.5);
          const meshTop = hit >= 0 ? from - hit : -Infinity;
          if (Number.isFinite(top)) {
            g.points++; recPts++;
            if (!(meshTop > ground + 0.3)) {
              // nothing drawn over the ground here: the hull stands on air
              if (top - ground > 0.3) { g.phantomPts++; g.errors.push(top - ground); if (top - ground > recWorst) { recWorst = top - ground; recWorstAt = [x, z, 'air']; } }
              continue;
            }
            const err = top - meshTop;
            g.errors.push(Math.abs(err));
            if (err > SUPPORT_ERROR_M) g.floatPts++;
            if (err < -SUPPORT_ERROR_M) g.sinkPts++;
            if (Math.abs(err) > recWorst) { recWorst = Math.abs(err); recWorstAt = [x, z, err > 0 ? 'float' : 'sink']; }
          } else if (meshTop > ground + HULL_STANDABLE_HEIGHT_M) {
            // drawn a hull's height over the ground inside the record's box with no top under it: a hole
            g.holePts++; recHoles++;
          }
        }
      }
      if (recWorst > 0.3 || recHoles > 4) {
        worst.push({ group: key, kind: record.kind ?? null, x: +((record.min[0] + record.max[0]) / 2).toFixed(1), z: +((record.min[2] + record.max[2]) / 2).toFixed(1),
          worstM: +recWorst.toFixed(2), at: recWorstAt ? [+recWorstAt[0].toFixed(1), +recWorstAt[1].toFixed(1), recWorstAt[2]] : null, holes: recHoles, points: recPts });
      }
    }
    support[key] = {
      records: g.records, points: g.points,
      floatShare: g.points ? +(g.floatPts / g.points).toFixed(3) : 0,
      sinkShare: g.points ? +(g.sinkPts / g.points).toFixed(3) : 0,
      airShare: g.points ? +(g.phantomPts / g.points).toFixed(3) : 0,
      holePoints: g.holePts,
      errP50M: +quantile(g.errors, 0.5).toFixed(3), errP90M: +quantile(g.errors, 0.9).toFixed(3), errMaxM: +quantile(g.errors, 1).toFixed(3),
    };
  }
  worst.sort((a, b) => b.worstM - a.worstM);
  for (const mesh of [dressing.group, flora.group]) mesh.traverse((o) => o.geometry?.dispose?.());
  return { mapId, variant, triangles: soup.count, contact, support, worst: worst.slice(0, 30), rockGaps };
}
