import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
import { auditDrawnGeometry, hasFastProperties } from '../geometryStreams.test-support.mjs';

// The map-vehicles lane (2026-10-06, hold 6; widened 2026-10-07 at the integrator's ask): every geometry the game
// draws keeps V8's fast properties on its attributes object. deleteAttribute drops that object to dictionary mode, and
// one such geometry drawn every frame (the vehicles' and carts' shadow stand-ins, a moored hull) left three's per-frame
// geometry update loop (WebGLGeometries.update) megamorphic for every geometry in the scene: +1.0 ms of CPU a frame at
// Cinder Junction and Glacier Pass (geometryStreams.ts keepStreams is the fix). The check has three homes, each on a
// build its receipt already makes: every map's props and vegetation ride on collisionManifestDrift's world build
// (COT_DRAWN_GEOMETRY_SHAPE), every tank on fleetPassHigh's shared HIGH build, and this receipt holds the control and
// builds every garage environment.

// the control: a deletion does drop an attributes object to dictionary mode
{
  const THREE = await import('three');
  const g = new THREE.BoxGeometry(1, 1, 1);
  assert.ok(hasFastProperties(g.attributes), 'a fresh geometry is fast');
  g.deleteAttribute('uv');
  assert.equal(hasFastProperties(g.attributes), false, 'deleteAttribute leaves dictionary mode (the trap this receipt guards)');
  g.dispose();
}

// every garage environment (its textures load through three's ImageLoader: a bare element stands in for the image)
installWorldBuildFixture();
globalThis.document.createElementNS ??= (_ns, name) => ({ nodeName: name, width: 8, height: 8, addEventListener() {},
  removeEventListener() {} });
const garageKit = await import('../../ui/garageEnvironmentKit.ts');
const { GARAGE_VARIANTS } = await import('../../game/garageVariants.ts');
const engine = { anisotropy: 4, setupShadowMaterial() {} };
const library = garageKit.createGarageEnvironmentAssetLibrary(engine);
const offenders = [];
let walked = 0;
for (const variant of GARAGE_VARIANTS) {
  const build = garageKit.buildGarageEnvironment(engine, library, variant);
  walked += auditDrawnGeometry(build.root, `garage ${variant.id}`, offenders);
  build.dispose();
}
assert.ok(walked > GARAGE_VARIANTS.length, 'the walk reaches the garages\' meshes');
assert.deepEqual(offenders.slice(0, 40), [], `${offenders.length} drawn geometries left in dictionary mode`);
console.log(`drawnGeometryShape.selftest: the deletion control; ${walked} drawn geometries in ${GARAGE_VARIANTS.length} garages `
  + 'keep fast attribute objects (the maps ride on collisionManifestDrift, the tanks on fleetPassHigh)');
