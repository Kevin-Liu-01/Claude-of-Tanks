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
  const packShape = (value) => value.kind === 'obb'
    ? ['o', n(value.cx), n(value.cz), n(value.hw), n(value.hl), n(value.yaw), ...packExtent(value)]
    : value.kind === 'circle'
      ? ['c', n(value.cx), n(value.cz), n(value.r), ...packExtent(value)]
      : packExtent(value).length
        ? ['w', ...packExtent(value), ...value.points.map(n)]
        : ['v', ...value.points.map(n)];
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
export function packWorldCollision({ obstacles, colliders, concealers }) {
  const n = (value) => Math.round(value * 10000) / 10000;
  return {
    obstacles: obstacles.map(packCollisionRecord),
    colliders: colliders.filter((record) => record.treeIdx == null).map(packCollisionRecord),
    concealers: concealers.map((entry) => [n(entry.x), n(entry.z), n(entry.r), n(entry.add)]),
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
  builders = { maps, terrain, vegetation, props, fleet };
  return builders;
}

/**
 * Build one map's world collision in Node with the seeds the shards are captured at; returns the packed records. A
 * `variant` (2026-10-08: 'assault-trenches', Frontline's carved trench system and its works) builds the map from that
 * variant's config, as every client's world does (world/map.ts). `inspect` (2026-10-07) reads the built world before it
 * is packed (the drift receipt's drawn-geometry shape check); it must not change it.
 */
export async function buildWorldCollisionData(mapId, { terrainSeed = 1337, vegetationSeed = 2001, propsSeed = 2002, variant = null, inspect } = {}) {
  const { maps, terrain, vegetation, props, fleet } = await worldBuilders();
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
  return packWorldCollision({
    obstacles: [...dressing.obstacles, ...flora.treeObstacles],
    colliders: [...dressing.colliders, ...flora.treeObstacles],
    concealers: flora.concealers || [],
  });
}
