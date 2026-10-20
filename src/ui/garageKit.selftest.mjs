// garage r9 shared kit receipt: every kit piece builds headlessly, deterministically, inside its triangle budget, on the
// ground, in every region skin; cranes are complete; the placement builds a Garage's minimum display set; the kit's
// modules draw no random numbers and read no wall clock.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { KitBuilder, kitRandom } from './garageKitGeometry.ts';
import { GARAGE_KIT_SKINS } from './garageKitSkins.ts';
import { GARAGE_PROP_BUDGETS, buildGarageProp } from './garagePropKit.ts';
import { GARAGE_BENCH_BUDGETS, buildGarageBenchPiece } from './garageBenchKit.ts';
import {
  buildAFrameGantry, buildGableHoistBeam, buildJibCrane, buildLatticeMember, buildMagnetHandler, buildMonorailBeam,
  buildOverheadCrane, buildPortalGantry, buildRailBreakdownCrane, buildRopewayPylon,
} from './garageCraneKit.ts';
import { GARAGE_WALL_BUDGETS, buildWallRun, buildIndoorWallBay } from './garageWallKit.ts';
import { buildComputerStation, buildFabricBanner, buildNameboard, buildNoticeBoard, buildSlideshowFrame } from './garageDisplayKit.ts';
import { GARAGE_PLATFORM_COLLARS, buildGaragePlatformCollar, createGarageDeckPainter } from './garagePlatformKit.ts';
import { buildGarageKitDressing, clearGarageKitCache } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';
import { GARAGE_SLIDESHOW_PLACEMENTS, garageSlideshowPose } from './garageSlideshowPlacement.ts';
import { armGarageDisplayAtlas } from './garageDisplayAtlas.ts';
import { GARAGE_DISPLAY_ATLAS_MANIFEST } from './garageDisplayAtlas.generated.ts';
import {
  buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets,
} from './garageEnvironmentKit.ts';

const build = (architecture, body, seed = 7) => {
  const b = new KitBuilder(kitRandom(seed), GARAGE_KIT_SKINS[architecture]);
  const receipt = body(b);
  return { result: b.build(), receipt };
};
const finite = (geometry) => geometry.getAttribute('position').array.every(Number.isFinite)
  && geometry.getAttribute('normal').array.every(Number.isFinite);

// 1. clutter and bench pieces: budgets (25 % slack for AO bands and bevels), finite, grounded, deterministic
for (const architecture of ['recovery_yard', 'repair_bunker', 'field_shed']) {
  for (const [name, budget] of Object.entries(GARAGE_PROP_BUDGETS)) {
    const { result } = build(architecture, (b) => buildGarageProp(b, name));
    assert.ok(result.triangles > 0 && result.triangles <= budget * 1.25, `${architecture}/${name}: ${result.triangles} tris over ${budget}`);
    assert.ok(finite(result.solid), `${name}: finite`);
    const box = result.solid.boundingBox;
    assert.ok(box.min.y >= -0.02 && box.min.y < 0.2, `${name} stands on its ground (min y ${box.min.y.toFixed(3)})`);
  }
  for (const [name, budget] of Object.entries(GARAGE_BENCH_BUDGETS)) {
    const { result } = build(architecture, (b) => buildGarageBenchPiece(b, name));
    assert.ok(result.triangles > 0 && result.triangles <= budget * 1.25, `${architecture}/${name}: ${result.triangles} tris over ${budget}`);
    assert.ok(result.solid.boundingBox.min.y >= -0.02, `${name} stands on its ground`);
  }
}
{
  const a = build('shade_depot', (b) => buildGarageProp(b, 'bowser'), 11).result;
  const b = build('shade_depot', (b) => buildGarageProp(b, 'bowser'), 11).result;
  assert.deepEqual([...a.solid.getAttribute('position').array], [...b.solid.getAttribute('position').array], 'a piece builds byte-identically');
  assert.deepEqual([...a.solid.getAttribute('color').array], [...b.solid.getAttribute('color').array], 'its baked colours too');
}
// the region skin makes the same drum native to each place: no two Garages bake it alike
{
  const tones = new Set(Object.keys(GARAGE_KIT_SKINS).map((architecture) => {
    const { result } = build(architecture, (b) => buildGarageProp(b, 'drum200'), 5);
    const color = result.solid.getAttribute('color').array;
    let r = 0, g = 0, bl = 0;
    for (let i = 0; i < color.length; i += 3) { r += color[i]; g += color[i + 1]; bl += color[i + 2]; }
    return [r, g, bl].map((v) => Math.round((v / (color.length / 3)) * 200)).join(',');
  }));
  assert.equal(tones.size, Object.keys(GARAGE_KIT_SKINS).length, 'every Garage skins the kit its own way');
}
// snow caps on up-facing faces in the snow skins, never in the desert
{
  const capOf = (architecture) => {
    const { result } = build(architecture, (b) => buildGarageProp(b, 'ammoBoxSteel'), 3);
    const color = result.solid.getAttribute('color').array, normal = result.solid.getAttribute('normal').array;
    let top = 0, n = 0;
    for (let i = 0; i < color.length / 3; i += 1) if (normal[i * 3 + 1] > 0.9) { top += color[i * 3 + 2]; n += 1; }
    return top / n;
  };
  assert.ok(capOf('repair_bunker') > capOf('shade_depot') + 0.2, 'snow caps the tops of the winter kit');
}

// 2. cranes: complete, at work with a real load hanging plumb under the hook, inside their budgets (load excluded)
const cranes = [
  ['overhead single (parked, building columns)', 3200, (b) => buildOverheadCrane(b, { span: 16, runway: 20, railY: 7.5, bridgeAt: 1, columns: false })],
  ['overhead single (own columns)', 3200 * 1.15, (b) => buildOverheadCrane(b, { span: 16, runway: 20, railY: 7.5, bridgeAt: 1 })],
  ['overhead double', 4500 * 1.1, (b) => buildOverheadCrane(b, { span: 20, runway: 24, railY: 9, girders: 2, swl: 40, bridgeAt: 0 })],
  ['portal gantry', 3800, (b) => buildPortalGantry(b, { span: 12, height: 7, runway: 16 })],
  ['portal lattice', 5000 * 1.15, (b) => buildPortalGantry(b, { span: 12, height: 7, runway: 16, lattice: true })],
  ['jib', 900 * 1.1, (b) => buildJibCrane(b, { height: 4, reach: 4 })],
  ['a-frame', 700 * 1.25, (b) => buildAFrameGantry(b, { span: 4, height: 3.6 })],
  ['gable hoist', 250 * 1.25, (b) => buildGableHoistBeam(b, { reach: 1.4, hookY: -3 })],
  ['monorail', 600 * 1.25, (b) => buildMonorailBeam(b, { length: 6, height: 4.5 })],
  ['rail breakdown', 4000, (b) => buildRailBreakdownCrane(b, {})],
  ['magnet handler', 2500, (b) => buildMagnetHandler(b, {})],
];
for (const [name, budget, body] of cranes) {
  const { result, receipt } = build('rail_roundhouse', body);
  assert.ok(result.triangles <= budget, `${name}: ${result.triangles} tris over ${budget}`);
  for (const part of ['rail', 'endStops', 'trolley', 'hoist', 'reeving', 'hookBlock']) assert.equal(receipt[part], true, `${name}: ${part}`);
  if (!/gable|magnet/.test(name)) {
    assert.equal(receipt.festoon, true, `${name}: festoon or cable`);
    assert.equal(receipt.plate, true, `${name}: capacity plate`);
    assert.ok(result.displayTriangles >= 2, `${name}: its plate is an atlas face`);
  }
  assert.equal(receipt.atWork, /magnet/.test(name), `${name}: parked unless given a load`);
}
for (const kind of ['powerpack', 'turret', 'roadwheels', 'barrel', 'hull', 'coil', 'crate']) {
  const loaded = build('recovery_yard', (b) => buildOverheadCrane(b, { span: 14, runway: 14, railY: 7, columns: false, load: { kind } }));
  const parked = build('recovery_yard', (b) => buildOverheadCrane(b, { span: 14, runway: 14, railY: 7, columns: false }));
  assert.equal(loaded.receipt.atWork, true);
  assert.equal(loaded.receipt.load, kind);
  assert.ok(loaded.receipt.hook[1] < parked.receipt.hook[1] - 1, `${kind}: the hook is down at work`);
  assert.ok(loaded.result.triangles > parked.result.triangles, `${kind}: the load and its rigging are built`);
  assert.ok(loaded.result.solid.boundingBox.min.y > -0.05, `${kind}: the load hangs clear of the floor`);
}
{
  const b = new KitBuilder(kitRandom(1), GARAGE_KIT_SKINS.recovery_yard);
  assert.ok(buildLatticeMember(b, [0, 0, 0], [0, 8, 0], { depth: 0.8, width: 0.8 }) > 300, 'lattice members carry chords, lacing and gussets');
  assert.ok(buildRopewayPylon(new KitBuilder(kitRandom(2), GARAGE_KIT_SKINS.rock_cavern), { height: 9 }) <= 1500, 'the ropeway pylon stays in budget');
}

// 3. walls: per-metre budgets, murals as atlas faces, brick as the pack's own brick bucket
for (const [kind, perMetre] of Object.entries(GARAGE_WALL_BUDGETS)) {
  const { result } = build('brick_arsenal', (b) => buildWallRun(b, kind, [[0, 0], [12, 0]], { mural: 'stencil.crest' }));
  const unit = kind === 'twall' ? result.triangles / 10 : result.triangles / 12;
  assert.ok(unit <= perMetre * 1.6, `${kind}: ${unit.toFixed(0)} tris a ${kind === 'twall' ? 'panel' : 'metre'} (budget ${perMetre})`);
}
assert.ok(build('brick_arsenal', (b) => buildWallRun(b, 'brick', [[0, 0], [9, 0]])).result.surfaces.has('stone'), 'brick walls lay the pack\'s brick');
assert.ok(build('field_shed', (b) => buildIndoorWallBay(b, { width: 6, height: 7, numeral: 2 })).result.triangles <= 2600, 'an indoor bay stays light');

// 4. displays: banners, boards, stations, nameboards and slideshow frames show atlas faces
assert.ok(build('field_shed', (b) => buildFabricBanner(b, 'brand.banner.v', 1.2, 4.5)).result.displayTriangles >= 6);
assert.ok(build('recovery_yard', (b) => buildNoticeBoard(b, ['still.desert', 'still.urban', 'still.foundry'], 2.6, 1.1)).result.displayTriangles >= 6);
assert.ok(build('recovery_yard', (b) => buildComputerStation(b, { screens: ['readout.armor.k2', 'map.badlands'] })).result.displayTriangles >= 4);
assert.ok(build('recovery_yard', (b) => buildNameboard(b, 'badlands', 2.6, 1.2)).result.displayTriangles === 2);
for (const mount of ['freestanding', 'wall', 'column', 'trailer']) {
  const { receipt } = build('recovery_yard', (b) => buildSlideshowFrame(b, { width: 3.2, mount }));
  assert.ok(receipt.center[1] > 1.5 && Math.abs(receipt.width / receipt.height - 16 / 9) < 1e-9, `${mount}: a 16:9 screen at eye height or above`);
}

// 5. the platform: one distinct collar per Garage, the hazard stripe in Verdant only, the deck painted in slices
{
  assert.equal(new Set(Object.values(GARAGE_PLATFORM_COLLARS).map((c) => JSON.stringify(c))).size, Object.keys(GARAGE_PLATFORM_COLLARS).length,
    'every Garage finishes its collar its own way');
  assert.deepEqual(Object.entries(GARAGE_PLATFORM_COLLARS).filter(([, c]) => c.kind === 'epoxy-chevron').map(([a]) => a), ['field_shed'],
    'the hazard chevrons survive in Verdant only');
  for (const architecture of Object.keys(GARAGE_PLATFORM_COLLARS)) {
    const result = buildGaragePlatformCollar(architecture, { pedestalAngle: 2.3 });
    assert.ok(result.triangles <= 3000, `${architecture} collar: ${result.triangles} tris`);
    assert.ok(result.displayTriangles >= 96, `${architecture}: 48 LED pucks and the pedestal screen`);
  }
  const painter = createGarageDeckPainter(256, 0.4);
  let slices = 0;
  while (!painter.step(0.5)) slices += 1;
  assert.ok(slices >= 1, 'the deck paints across slices');
  const again = createGarageDeckPainter(256, 0.4);
  while (!again.step(1e9)) { /* whole */ }
  assert.deepEqual([...painter.albedo.slice(0, 4096)], [...again.albedo.slice(0, 4096)], 'slicing never changes the deck');
}

// 6. placement: each placed Garage builds its minimum display set, one slideshow at the table's pose
for (const [architecture, placement] of Object.entries(GARAGE_KIT_PLACEMENTS)) {
  clearGarageKitCache();
  const variant = GARAGE_VARIANTS.find((v) => v.architecture === architecture);
  const buckets = {};
  const t0 = performance.now();
  const kit = buildGarageKitDressing({ variant, placement, buckets, groundAtWorld: () => 0 });
  const coldMs = performance.now() - t0;
  const t1 = performance.now();
  buildGarageKitDressing({ variant, placement, buckets: {}, groundAtWorld: () => 0 });
  const warmMs = performance.now() - t1;
  assert.ok(kit.stats.cranes.some((crane) => crane.atWork && crane.load), `${architecture}: a crane at work with a real load`);
  assert.ok(kit.stats.brandPieces >= 2, `${architecture}: brand pieces ${kit.stats.brandPieces}`);
  assert.ok(kit.stats.tankImages >= 3, `${architecture}: tank images ${kit.stats.tankImages}`);
  assert.ok(kit.stats.stations >= 1 && kit.stats.stationMonitors >= 2, `${architecture}: a computer station with two monitors`);
  assert.equal(kit.stats.nameboards, 1, `${architecture}: one nameboard`);
  assert.ok(kit.stats.kitTriangles + kit.stats.displayTriangles <= 16000, `${architecture}: kit ${kit.stats.kitTriangles} tris`);
  assert.ok(kit.stats.atmosphereTriangles <= 2500, `${architecture}: atmosphere ${kit.stats.atmosphereTriangles} tris`);
  assert.ok(kit.meshes.length <= 3, `${architecture}: the kit adds at most three draws (display, decal, atmosphere)`);
  assert.ok(warmMs < coldMs, `${architecture}: a second build reuses the session cache (${warmMs.toFixed(1)} vs ${coldMs.toFixed(1)} ms)`);
  assert.ok((buckets.baked || []).length > 0, `${architecture}: the solids join the baked bucket`);
  if (GARAGE_SLIDESHOW_PLACEMENTS[architecture]) {
    const pose = garageSlideshowPose(architecture);
    assert.ok(kit.slideshow, `${architecture}: the pack builds the slideshow frame`);
    for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(kit.slideshow.position[i] - pose.position[i]) < 1e-6, `${architecture}: frame and screen share one pose`);
  }
  for (const mesh of kit.meshes) { mesh.geometry.dispose(); }
}

// 7. determinism: no random numbers and no wall clock in the kit's geometry (the atmosphere's fallback clock and the
// deck painter's slice timer only pace work; neither shapes a vertex or a texel)
for (const file of ['garageKitGeometry', 'garageKitSkins', 'garagePropKit', 'garageBenchKit', 'garageCraneKit', 'garageWallKit',
  'garageSignKit', 'garageDisplayKit', 'garageDisplayAtlas', 'garagePlatformKit', 'garageAtmosphereKit', 'garageKitPlacement',
  'garageKitPlacements', 'garageSlideshowPlacement', 'garageVerdantKit']) {
  const source = await readFile(new URL(`./${file}.ts`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|new Date\(/, `${file}: no random numbers or dates`);
  const clocks = (source.match(/performance\.now\(\)/g) || []).length;
  assert.ok(clocks === 0 || ['garageAtmosphereKit', 'garagePlatformKit'].includes(file), `${file}: no wall clock`);
}

// 8. the atlas hook runs once: a display's first render starts the load, then the hook is a no-op (no per-frame call or
// allocation, the r9 engineering critic), and no display anywhere arms a per-frame ensure of its own
{
  const mesh = new THREE.Mesh();
  armGarageDisplayAtlas(mesh, 8);
  const armed = mesh.onBeforeRender;
  mesh.onBeforeRender();
  const disarmed = mesh.onBeforeRender;
  assert.notEqual(disarmed, armed, 'the first render disarms the hook');
  mesh.onBeforeRender();
  assert.equal(mesh.onBeforeRender, disarmed, 'later renders call nothing new');
  for (const file of ['../ui/garageKitPlacement.ts', '../ui/garageVerdantKit.ts', '../ui/garageStage.ts', '../game/garageDressing.ts']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /onBeforeRender\s*=\s*\(\)\s*=>\s*\{?\s*[\w.]*ensureGarageDisplayAtlas/, `${file}: a display arms the atlas once`);
  }
}

// 9. the atlas's stills never borrow the i18n `media.` namespace: a `media.`-led template in the game graph makes the
// page-catalog scan keep every media.* caption in the boot catalogs (+15.5 KB, the deploy gate's budget step)
{
  assert.ok(Object.keys(GARAGE_DISPLAY_ATLAS_MANIFEST.rects).every((name) => !name.startsWith('media.')), 'no media.* rects');
  for (const file of ['garageDisplayAtlas', 'garageKitPlacement', 'garageKitPlacements', 'garageVerdantKit', 'garageDisplayKit',
    'garagePlatformKit', 'garageSignKit', 'garageWallKit', 'garageStage']) {
    const source = await readFile(new URL(`./${file}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /[`'"]media\./, `${file}: no media.-led key or template`);
  }
}

// 10. a disposed pack releases the cascade registrations of the materials it owns (the kit's display material
// included): the LRU keeps two packs, and the registry grew on every switch
{
  const registered = new Set(), released = new Set();
  const ctx = { anisotropy: 4, setupShadowMaterial: (material) => { registered.add(material); },
    releaseShadowMaterial: (material) => { released.add(material); registered.delete(material); return true; } };
  const variant = GARAGE_VARIANTS.find((v) => v.architecture === 'recovery_yard');
  const assets = createGarageEnvironmentAssetLibrary(ctx);
  await prepareGarageEnvironmentAssets(assets, variant);
  clearGarageKitCache();
  const pack = buildGarageEnvironment(ctx, assets, variant);
  let display = null;
  pack.root.traverse((object) => { if (object.name === 'garage_kit_displays') display = object.material; });
  assert.ok(display && registered.has(display), 'the kit display material joins the cascades');
  const before = registered.size;
  pack.dispose();
  assert.ok(released.has(display), 'and leaves them with its pack');
  assert.ok(released.size > 0 && registered.size < before, `the pack released ${released.size} of ${before} registrations`);
}
console.log('garageKit.selftest: kit pieces, cranes, walls, displays, platform and placement receipts pass');
