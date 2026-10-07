import assert from 'node:assert/strict';
import { auditDrawnGeometry, hasFastProperties } from '../geometryStreams.test-support.mjs';

// The map-vehicles lane (2026-10-06, hold 6; widened 2026-10-07 at the integrator's ask): every geometry the maps and
// the garages draw keeps V8's fast properties on its attributes object. deleteAttribute drops that object to dictionary
// mode, and one such geometry drawn every frame (the vehicles' and carts' shadow stand-ins, a moored hull) left three's
// per-frame geometry update loop (WebGLGeometries.update) megamorphic for every geometry in the scene: +1.0 ms of CPU a
// frame at Cinder Junction and Glacier Pass (geometryStreams.ts keepStreams is the fix). The receipt builds each map's
// props and vegetation at the shard seeds and every garage environment, and walks every node holding a geometry; the
// fleet's tanks are walked on the fleet pass's shared build (fleetPassHigh, createDrawnGeometryShapeAudit).

// the control: a deletion does drop an attributes object to dictionary mode
{
  const THREE = await import('three');
  const g = new THREE.BoxGeometry(1, 1, 1);
  assert.ok(hasFastProperties(g.attributes), 'a fresh geometry is fast');
  g.deleteAttribute('uv');
  assert.equal(hasFastProperties(g.attributes), false, 'deleteAttribute leaves dictionary mode (the trap this receipt guards)');
  g.dispose();
}

const offenders = [];
const disposeAll = (root) => root.traverse((node) => node.geometry?.dispose?.());

// every map: its props and its vegetation, built at the shard seeds (terrain 1337, vegetation 2001, props 2002)
const { installWorldBuildFixture } = await import('../../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
  import('./index.ts'), import('../terrain.ts'), import('../vegetation.ts'), import('../props.ts'),
  import('../../vehicles/fleetFactory.ts'), import('../propsModelStore.ts'),
]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };
let mapsWalked = 0;
const standIns = new Set();
for (const mapId of maps.MAP_IDS) {
  const config = maps.getMapConfig(mapId);
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const dressing = props.createProps(field, engine, 2002, config, flora);
  mapsWalked += auditDrawnGeometry(flora.group, `${mapId} vegetation`, offenders);
  mapsWalked += auditDrawnGeometry(dressing.group, `${mapId} props`, offenders);
  dressing.group.traverse((node) => { if (/^destructible-.+-shadow$/.test(node.name)) standIns.add(mapId); });
  disposeAll(dressing.group); disposeAll(flora.group);
  if (process.env.COT_SHAPE_PROGRESS) console.error(`${mapId}: ${mapsWalked} walked, ${offenders.length} offenders`);
}
// the walk reaches the shadow stand-ins hold 6 caught (Cinder Junction's cars, Glacier Pass's sleds)
assert.ok(standIns.has('railyard') && standIns.has('alpine'), `the walk reaches the vehicles' shadow stand-ins (${[...standIns]})`);

// every garage environment (its textures load through three's ImageLoader: a bare element stands in for the image)
globalThis.document.createElementNS ??= (_ns, name) => ({ nodeName: name, width: 8, height: 8, addEventListener() {},
  removeEventListener() {} });
const garageKit = await import('../../ui/garageEnvironmentKit.ts');
const { GARAGE_VARIANTS } = await import('../../game/garageVariants.ts');
const library = garageKit.createGarageEnvironmentAssetLibrary(engine);
let garagesWalked = 0;
for (const variant of GARAGE_VARIANTS) {
  const build = garageKit.buildGarageEnvironment(engine, library, variant);
  garagesWalked += auditDrawnGeometry(build.root, `garage ${variant.id}`, offenders);
  build.dispose();
}

assert.deepEqual(offenders.slice(0, 40), [], `${offenders.length} drawn geometries left in dictionary mode`);
console.log(`drawnGeometryShape.selftest: ${mapsWalked + garagesWalked} drawn geometries keep fast attribute objects `
  + `(${mapsWalked} on ${maps.MAP_IDS.length} maps, the vehicles' shadow stand-ins on ${standIns.size}; ${garagesWalked} in `
  + `${GARAGE_VARIANTS.length} garages); a deletion would not`);
