// Node build of a battlefield's collision records (maps-and-layouts lane, 2026-10-01). The dedicated and browser
// hosts read every map's obstacles, shell colliders and concealment discs from a shard captured off the rendered
// world (tools/capture-world-collision-manifests.mjs). The rendered world composes them from three deterministic
// builders — terrain (seed 1337), vegetation (2001) and props (2002, which bakes the wreck cast and the map kits) —
// and all three run in Node behind the world receipts' small DOM fixture. Built here, packed by the same function the
// capture page evaluates, the records encode byte-identically to the committed shards (verified on every map when the
// tool landed), so a shard can be regenerated without a browser and a stale one can be detected (`--check`).
import { readFileSync } from 'node:fs';

/** The canvas/image/fetch fixture the world receipts build props and vegetation behind (no pixels are read back). */
export function installWorldBuildFixture(target = globalThis) {
  if (target.__cotWorldBuildFixture) return;
  target.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  target.Image ??= class { width = 8; height = 8; set src(_value) { queueMicrotask(() => this.onload?.()); } };
  if (!target.document) {
    target.document = { createElement() {
      const canvas = { width: 0, height: 0 };
      const context = new Proxy({ canvas,
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
      }, { get: (object, key) => object[key] ?? (() => {}) });
      canvas.getContext = () => context;
      return canvas;
    } };
  }
  // the props model store fetches its packed source by URL; serve it from disk
  const browserFetch = target.fetch;
  target.fetch = async (url) => (url instanceof URL && url.protocol === 'file:'
    ? new Response(readFileSync(url)) : browserFetch(url));
  target.__cotWorldBuildFixture = true;
}

/**
 * Pack one collision record the way the server reads it. Self-contained on purpose: the capture page evaluates this
 * exact function's source (collisionCaptureScript), so the browser capture and the Node build share one packer.
 */
export function packCollisionRecord(record) {
  const n = (value) => Math.round(value * 10000) / 10000;
  const out = { b: [
    n(record.min[0]), n(record.min[1]), n(record.min[2]),
    n(record.max[0]), n(record.max[1]), n(record.max[2]),
  ] };
  const shape = record.shape2;
  // per-part vertical extents (2026-09-19) ride as trailing numbers; a ranged polygon is tagged 'w'
  // a part whose extent is the record's own range packs without it, so plain wall bands still dedupe in the
  // primitive dictionary; only roof strips, porches and other parts with their own heights carry numbers
  const packExtent = (value) => (value.y0 !== undefined && value.y1 !== undefined
    && (Math.abs(value.y0 - record.min[1]) > 0.001 || Math.abs(value.y1 - record.max[1]) > 0.001)
    ? [n(value.y0), n(value.y1)] : []);
  // (physics, 2026-10-16; convexOutlines on the 226 base: 136 parts on 12 maps — Verdant's and Steppe's hay cocks, the
  // yards' cable drums, Saltwind's dry-stone modules, structure bands) the 0.1 mm rounding can bring a corner within
  // a millimetre of its chord, and the decoder's reading (world/collision.ts convexOutlineInPlace, setConvexShape)
  // drops it: the shard publishes the corners the decoder keeps. The same law, here in full: the capture page
  // evaluates this function's source (collisionCaptureScript) and it imports nothing.
  const outline = (values) => {
    const out = Array.from(values, n), CORNER = 1e-3;
    let m = out.length >> 1;
    if (m < 3) return out;
    let area2 = 0;
    for (let i = 0; i < m; i++) { const j = i + 1 < m ? i + 1 : 0; area2 += out[2 * i] * out[2 * j + 1] - out[2 * j] * out[2 * i + 1]; }
    if (!(Math.abs(area2) > 1e-9)) return out;
    const winding = area2 < 0 ? -1 : 1, count = m;
    m = 0;
    for (let i = 0; i < count; i++) {
      const x = out[2 * i], z = out[2 * i + 1];
      if (m && out[2 * (m - 1)] === x && out[2 * (m - 1) + 1] === z) continue;
      out[2 * m] = x; out[2 * m + 1] = z; m++;
    }
    while (m > 1 && out[0] === out[2 * (m - 1)] && out[1] === out[2 * (m - 1) + 1]) m--;
    for (let dropped = true; dropped && m > 3;) {
      dropped = false;
      for (let i = 0; i < m && m > 3; i++) {
        const a = i > 0 ? i - 1 : m - 1, b = i + 1 < m ? i + 1 : 0;
        const turn = (out[2 * i] - out[2 * a]) * (out[2 * b + 1] - out[2 * i + 1]) - (out[2 * i + 1] - out[2 * a + 1]) * (out[2 * b] - out[2 * i]);
        if (turn * winding > CORNER * Math.hypot(out[2 * b] - out[2 * a], out[2 * b + 1] - out[2 * a + 1])) continue;
        for (let k = i; k < m - 1; k++) { out[2 * k] = out[2 * k + 2]; out[2 * k + 1] = out[2 * k + 3]; }
        m--; i--; dropped = true;
      }
    }
    out.length = 2 * m;
    return out;
  };
  // a convex part with a drawn top (physics stream, 2026-10-13: world/collision.ts collisionPartTopAt) is tagged 'p': its
  // extent, the planes' origin, their count, each plane's three numbers, then its corners
  const packShape = (value) => value.kind === 'convex' && value.tp
    ? ['p', n(value.y0 ?? record.min[1]), n(value.y1 ?? record.max[1]), n(value.tp[0]), n(value.tp[1]), (value.tp.length - 2) / 3,
      ...value.tp.slice(2).map(n), ...outline(value.points)]
    : value.kind === 'obb'
    ? ['o', n(value.cx), n(value.cz), n(value.hw), n(value.hl), n(value.yaw), ...packExtent(value)]
    : value.kind === 'circle'
      ? ['c', n(value.cx), n(value.cz), n(value.r), ...packExtent(value)]
      : packExtent(value).length
        ? ['w', ...packExtent(value), ...outline(value.points)]
        : ['v', ...outline(value.points)];
  if (shape?.kind === 'compound') out.s = ['m', ...shape.parts.map(packShape)];
  else if (shape) out.s = packShape(shape);
  if (record.crushable) out.q = 1;
  // Tree contact policy is a shared runtime invariant; avoid repeating
  // its two constant values thousands of times in the server manifest.
  if (record.treeIdx == null && record.crushMin != null) out.m = n(record.crushMin);
  if (record.treeIdx == null && record.crushKeep != null) out.e = n(record.crushKeep);
  if (record.kind != null) out.k = record.kind;
  if (record.treeIdx != null) out.t = record.treeIdx;
  if (record.propIdx != null) out.p = record.propIdx;
  // destruction (docs/DESTRUCTION.md §3.1): the structure group and, for a set piece, its role (1 setpiece, 2 fixed)
  if (record.structureIdx != null) out.g = record.structureIdx;
  if (record.structureRole === 'setpiece') out.gr = 1;
  else if (record.structureRole === 'fixed') out.gr = 2;
  return out;
}

/** Pack a world's three record lists (the capture page's shape: tree colliders are stored once, in obstacles). */
export function packWorldCollision({ obstacles, colliders, concealers, craters = null }) {
  const n = (value) => Math.round(value * 10000) / 10000;
  return {
    obstacles: obstacles.map(packCollisionRecord),
    colliders: colliders.filter((record) => record.treeIdx == null).map(packCollisionRecord),
    concealers: concealers.map((entry) => [n(entry.x), n(entry.z), n(entry.r), n(entry.add)]),
    // DST-04: the map's pre-placed craters (world/mapCraters.ts), as the browser capture packs them
    ...(craters ? { craters: craters.map((s) => [s.x, s.z, s.radiusM, s.depthM, s.rimM, s.deforms ? 1 : 0]) } : {}),
  };
}

let builders = null;
async function worldBuilders() {
  if (builders) return builders;
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
    import('../src/world/maps/index.ts'),
    import('../src/world/terrain.ts'),
    import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'),
    import('../src/vehicles/fleetFactory.ts'),
    import('../src/world/propsModelStore.ts'),
  ]);
  await models.preloadPropModels();
  const mapCraters = await import('../src/world/mapCraters.ts');
  builders = { maps, terrain, vegetation, props, fleet, mapCraters };
  return builders;
}

/**
 * Build one map's world collision in Node with the seeds the shards are captured at; returns the packed records. A
 * `variant` (2026-10-08: 'assault-trenches', Frontline's carved trench system and its works) builds the map from that
 * variant's config, as every client's world does (world/map.ts). `inspect` (2026-10-07) reads the built world before it
 * is packed (the drift receipt's drawn-geometry shape check); it must not change it.
 */
export async function buildWorldCollisionData(mapId, { terrainSeed = 1337, vegetationSeed = 2001, propsSeed = 2002, variant = null, inspect } = {}) {
  const { maps, terrain, vegetation, props, fleet, mapCraters } = await worldBuilders();
  if (variant !== null && variant !== 'assault-trenches') throw new Error(`unknown battlefield variant ${variant}`);
  const config = variant ? { ...maps.getMapConfig(mapId), assaultTrenches: true } : maps.getMapConfig(mapId);
  // the wreck cast bakes real hull geometry: its demand-loaded builders must be resident first
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const field = terrain.createHeightField(terrainSeed, config);
  const flora = vegetation.createVegetation(field, engine, vegetationSeed, config);
  const dressing = props.createProps(field, engine, propsSeed, config, flora);
  inspect?.({ mapId, flora, dressing });
  const obstacles = [...dressing.obstacles, ...flora.treeObstacles];
  return packWorldCollision({
    obstacles,
    colliders: [...dressing.colliders, ...flora.treeObstacles],
    concealers: flora.concealers || [],
    // DST-04: decided on the built records, as world/map.ts decides them
    craters: mapCraters.mapCraterStamps(dressing.mapCraterSites, obstacles, field),
  });
}
