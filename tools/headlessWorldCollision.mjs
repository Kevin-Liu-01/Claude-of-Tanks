// Node build of a battlefield's collision records (maps-and-layouts lane, 2026-10-01). The dedicated and browser
// hosts read every map's obstacles, shell colliders and concealment discs from a shard captured off the rendered
// world (tools/capture-world-collision-manifests.mjs). The rendered world composes them from three deterministic
// builders — terrain (seed 1337), vegetation (2001) and props (2002, which bakes the wreck cast and the map kits) —
// and all three run in Node behind the world receipts' small DOM fixture. Built here, packed by the same function the
// capture page evaluates, the records encode byte-identically to the committed shards (verified on every map when the
// tool landed), so a shard can be regenerated without a browser and a stale one can be detected (`--check`).
import { readFileSync } from 'node:fs';
// the shards' packer: one source for the capture page, this Node build and the page's own rounding (276)
import { packCollisionRecord } from '../src/world/collisionRecordPacking.ts';
import { betweenBuilds } from './build-loop-yield.mjs';

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
  const [maps, terrain, vegetation, props, fleet, models, kits] = await Promise.all([
    import('../src/world/maps/index.ts'),
    import('../src/world/terrain.ts'),
    import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'),
    import('../src/vehicles/fleetFactory.ts'),
    import('../src/world/propsModelStore.ts'),
    import('../src/world/worldKits.ts'),
  ]);
  await models.preloadPropModels();
  const mapCraters = await import('../src/world/mapCraters.ts');
  builders = { maps, terrain, vegetation, props, fleet, mapCraters, kits };
  return builders;
}

/**
 * Build one map's world collision in Node with the seeds the shards are captured at; returns the packed records. A
 * `variant` (2026-10-08: 'assault-trenches', Frontline's carved trench system and its works) builds the map from that
 * variant's config, as every client's world does (world/map.ts). `inspect` (2026-10-07) reads the built world before it
 * is packed (the drift receipt's drawn-geometry shape check); it must not change it.
 */
export async function buildWorldCollisionData(mapId, { terrainSeed = 1337, vegetationSeed = 2001, propsSeed = 2002, variant = null, inspect } = {}) {
  const { maps, terrain, vegetation, props, fleet, mapCraters, kits } = await worldBuilders();
  await betweenBuilds(); // the previous map's world is free to go (build-loop-yield.mjs)
  if (variant !== null && variant !== 'assault-trenches') throw new Error(`unknown battlefield variant ${variant}`);
  const config = variant ? { ...maps.getMapConfig(mapId), assaultTrenches: true } : maps.getMapConfig(mapId);
  // the wreck cast bakes real hull geometry: its demand-loaded builders must be resident first
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  // and its kits (world/worldKits.ts, as the browser's world build loads them: at once in Node, which holds every kit,
  // and the map's own under COT_KITS_LAZY=1)
  await kits.loadMapKits(config);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const field = terrain.createHeightField(terrainSeed, config);
  const flora = vegetation.createVegetation(field, engine, vegetationSeed, config);
  const dressing = props.createProps(field, engine, propsSeed, config, flora);
  inspect?.({ mapId, flora, dressing, field });
  const obstacles = [...dressing.obstacles, ...flora.treeObstacles];
  return packWorldCollision({
    obstacles,
    colliders: [...dressing.colliders, ...flora.treeObstacles],
    concealers: flora.concealers || [],
    // DST-04: decided on the built records, as world/map.ts decides them
    craters: mapCraters.mapCraterStamps(dressing.mapCraterSites, obstacles, field),
  });
}
