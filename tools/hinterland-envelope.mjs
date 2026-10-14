// tools/hinterland-envelope.mjs — the envelope's new-field branch (HL-1, the horizons stream, 2026-10-13;
// B-architecture §6.1): a map with a `hinterland` block (or, with --new, its lab draft) is measured on the Hinterland's
// own field, old against new. The skyline is the field's height pyramid ray-marched to 80 km with the earth's
// curvature, plus the planner's objects — buildings, towers and mills, poplar rows, woods' canopy — so a flat place's
// skyline of dykes, rows and towers counts as it reads. Near skyline = within 4 km; far = beyond; C6 is the far
// skyline standing 0.3° over the near on a share of bearings, from the pure field (no GPU).
import { countSummits, eye8Spots, marchSkyline, skylineStats, CENTRE_EYE_M, ENVELOPE, RECORDED_EXCEPTIONS } from './horizon-envelope.mjs';

/** Objects on the skyline from a build: the height of whatever stands at (x, z) (towers, buildings, rows, canopy). */
export function skylineObjects(build) {
  const { plan, field, spec } = build;
  const CELL = 64;
  const cells = new Map();
  const key = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);
  const add = (item, minX, minZ, maxX, maxZ) => {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = key(cx, cz); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(item);
      }
    }
  };
  for (const v of plan.verticals) add({ x: v.x, z: v.z, r: Math.max(2, v.halfM * (v.kind === 'slagTip' || v.kind === 'castle' ? 1 : 0.6)), h: v.heightM }, v.x - v.halfM, v.z - v.halfM, v.x + v.halfM, v.z + v.halfM);
  for (const b of plan.buildings) { const r = Math.min(b.width, b.depth) * 0.5; add({ x: b.x, z: b.z, r, h: 8.5 }, b.x - r, b.z - r, b.x + r, b.z + r); }
  for (const s of plan.settlements) if (!s.near) { const r = s.radiusM * 0.6; add({ x: s.x, z: s.z, r, h: 9, soft: true }, s.x - r, s.z - r, s.x + r, s.z + r); }
  const canopy = spec.region.vegetation.canopyM || 18;
  for (const row of plan.rows) {
    for (let i = 0; i < row.xs.length; i++) add({ x: row.xs[i], z: row.zs[i], r: 6, h: canopy * 0.95 }, row.xs[i] - 6, row.zs[i] - 6, row.xs[i] + 6, row.zs[i] + 6);
  }
  // the woods' canopy (and the far country's tree lines): from the field's cover on a lazy 32 m lattice to 16 km
  const cover = { cls: 0, crop: 31, fieldId: 0, woods: 0, hedge: 0, wet: 0, rock: 0, scree: 0, snow: 0, settle: 0, road: 0 };
  const WOODS_M = 32, WOODS_HALF = 16384, WN = Math.ceil((2 * WOODS_HALF) / WOODS_M) + 1;
  const woods = new Int8Array(WN * WN).fill(-1);
  const woodsAt = (x, z) => {
    const i = Math.round((x + WOODS_HALF) / WOODS_M), j = Math.round((z + WOODS_HALF) / WOODS_M);
    if (i < 0 || j < 0 || i >= WN || j >= WN) return 0;
    const k = j * WN + i;
    if (woods[k] < 0) { field.coverAt(-WOODS_HALF + i * WOODS_M, -WOODS_HALF + j * WOODS_M, cover, 2); woods[k] = cover.woods > 0.5 ? 1 : 0; }
    return woods[k];
  };
  const farTrees = spec.far.length ? (spec.region.far.treesM || 0) : 0;
  return (x, z, d) => {
    let h = -Infinity;
    const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list) for (const o of list) {
      const dd = Math.hypot(x - o.x, z - o.z);
      if (dd <= o.r) h = Math.max(h, field.heightAt(o.x, o.z) + o.h * (o.soft ? 1 - dd / o.r : 1));
    }
    if (Math.max(Math.abs(x), Math.abs(z)) > 512) {
      const w = woodsAt(x, z);
      if (w) h = Math.max(h, build.sample(x, z) + canopy);
      else if (d > 4000 && farTrees > 0) h = Math.max(h, build.sample(x, z) + farTrees * 0.35);
    }
    return h;
  };
}

/** P1 for a spec: the region's far family, the authored far forms and the landforms tell one story. */
function p1Of(spec) {
  const FAMILY = { plain: 'low', upland: 'low', forested: 'low', erg: 'low', ridges: 'mountain', karstRidge: 'mountain', alpine: 'mountain', polar: 'mountain', iceSheet: 'mountain', tables: 'table', jebels: 'table', martian: 'table', volcanicField: 'volcanic', lunar: 'mountain' };
  const LF = { ridge: null, dike: 'low', valley: null, notch: null, massif: 'mountain', escarpment: null, mesa: 'table', butte: 'table', inselberg: 'table', canyon: 'table', jebel: 'table', cone: 'volcanic', caldera: 'volcanic', dam: null, frozenRing: null };
  const fam = new Set([FAMILY[spec.region.far.form], ...spec.far.map((f) => FAMILY[f.form])]);
  for (const l of spec.landforms) if (LF[l.kind]) fam.add(LF[l.kind]);
  fam.delete(undefined);
  return fam.size <= 1 ? 'ok' : `mixed (${[...fam].join('/')})`;
}

/**
 * The new path's row for one map (null when it has no block and no lab draft was asked for): its build, its skyline
 * from the centre and the EYE8 eyes (near and far apart), C1–C9 in the envelope's terms.
 */
export async function measureHinterland(world, id, { eyes = 'all', field: ground = null, draft = false } = {}) {
  const [{ resolveHinterlandSpec }, { withSelectedHinterland }, { buildHinterland }, { samplePyramid }] = await Promise.all([
    import('../src/world/hinterland/spec.ts'), import('../src/world/hinterland/select.ts'),
    import('../src/world/hinterland/pipeline.ts'), import('../src/world/hinterland/pyramid.ts'),
  ]);
  const cfg = withSelectedHinterland(world.maps.getMapConfig(id), draft ? '?hinterland=1' : '');
  const spec = resolveHinterlandSpec(cfg);
  if (!spec) return null;
  const heightField = ground ?? world.terrain.createHeightField(1337, cfg);
  const build = buildHinterland(spec, 1337, heightField);
  build.sample = (x, z) => samplePyramid(build.pyramid, x, z);
  return measureBuild(build, heightField, { eyes, id });
}

/** The envelope row of a build (exported for the plan view). */
export function measureBuild(build, heightField, { eyes = 'all', id = build.spec.mapId } = {}) {
  const spec = build.spec;
  build.sample ??= (x, z) => build.field.heightAt(x, z);
  const surface = (x, z) => (Math.max(Math.abs(x), Math.abs(z)) <= 512 ? heightField.getHeightAt(x, z) : build.sample(x, z));
  const objects = skylineObjects(build);
  const centreEye = { x: 0, z: 0, y: heightField.getHeightAt(0, 0) + CENTRE_EYE_M };
  const step = (d) => (d < 1500 ? 6 : d < 6000 ? d * 0.006 : d * 0.012);
  const near = marchSkyline(surface, centreEye, { bearings: 1440, minM: 30, maxM: 4000, step, objects });
  const far = marchSkyline(surface, centreEye, { bearings: 1440, minM: 4000, maxM: 80_000, step, objects });
  const centre = skylineStats(near);
  let farOver = 0;
  for (let b = 0; b < near.elev.length; b++) if (far.elev[b] >= near.elev[b] + ENVELOPE.C6_MARGIN_DEG) farOver++;
  const eyeRows = eyes === 'all' ? eye8Spots((x, z) => heightField.getHeightAt(x, z)).map((eye) => ({
    eye: eye.name, ...skylineStats(marchSkyline(surface, eye, { bearings: 720, minM: 30, maxM: 4000, step, objects })),
  })) : [];
  // C2: the p90 rise within 500 m past the edge over the centre ground, with what stands on it (dykes and rows count)
  const g0 = heightField.getHeightAt(0, 0);
  const rises = [];
  for (let i = 0; i < 2048; i++) {
    const t = (i / 2048) * 4, side = Math.floor(t), f = t - side, d = 512 + 40 + (i % 12) * 40, along = -d + f * 2 * d;
    const [x, z] = side === 0 ? [along, d] : side === 1 ? [d, -along] : side === 2 ? [-along, -d] : [-d, along];
    rises.push(Math.max(build.sample(x, z), objects(x, z, 0)) - g0);
  }
  rises.sort((a, b) => a - b);
  const c8 = build.plan.settlements.filter((s) => s.near && s.buildings > 0).length;
  return {
    id, path: 'hinterland', centre, eyes: eyeRows, outlandRise: rises[Math.floor(rises.length * 0.9)], farms: c8,
    objectSummits: 0, c6: farOver / near.elev.length, p1: p1Of(spec),
    rimH: spec.rimH, fogDensity: spec.fogDensity, skyline: { near, far },
    exceptions: { ...(RECORDED_EXCEPTIONS[id] ?? {}), ...spec.exceptions },
    build: { ms: build.ms, evaluated: build.pyramid.evaluated, settlements: build.plan.settlements.length, buildings: build.plan.buildings.length, verticals: build.plan.verticals.length },
    summitsTerrainOnly: countSummits(near.elev),
  };
}
