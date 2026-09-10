import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createLayout, sampleLandformHeight } from './terrain.ts';
import { samplePlayableRelief } from './playableRelief.ts';

const base = 'd948cb5733ebb41ba471458a6b410e2bbb3568cc';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const old = path => execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' });
const sha = data => createHash('sha256').update(data).digest('hex');
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? item.toString() : item);
const stripRelief = ({ relief, _relief, ...form }) => form;
const originalMap = old('src/world/maps/badlands.ts');
assert.equal(sha(originalMap), 'eae9a03e75913e7c1b6ba87fae136115e5a568675d4998923da47492cd7ddada');
assert.equal(sha(old('src/world/terrain.ts')), '57e9b38e18ace87b078b4f9a9237f1556b15ffc1ca92930bc3b5f87b45c8324a',
  'authenticate historical terrain evidence; current-kernel behavior is checked below, not frozen as whole-file bytes');
assert.equal(sha(read('src/world/playableRelief.ts')), 'd7aa326df0d9880fd0b238cd8380cb11a7e4da32e3d20eee6e9ef579f16387dc',
  'reuse the existing allocation/noise-free scalar sampler; no new profile implementation');
const registry = read('src/world/maps/index.ts');
assert.equal(registry, old('src/world/maps/index.ts'));
const mapFiles = [...registry.matchAll(/import \w+ from '\.\/(\w+\.ts)';/g)].map(match => match[1]);
assert.equal(mapFiles.length, MAP_IDS.length);
for (const file of mapFiles) if (file !== 'badlands.ts') {
  assert.equal(read('src/world/maps/' + file), old('src/world/maps/' + file), `${file}: exact shipped authoring`);
}

const mapURL = new URL('./maps/badlands.ts?badlands-predecessor', import.meta.url).href;
const terrainURL = new URL('./terrain.ts?badlands-support', import.meta.url).href;
const anchor = '  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
let source = read('src/world/terrain.ts');
assert.equal(source.split(anchor).length, 2);
source = source.replace(anchor, anchor + '\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels,liquidSurfaces,liquidLakeBanks};');
source += '\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n';
const ports = new Map([[mapURL, stripTypeScriptTypes(originalMap)], [terrainURL, stripTypeScriptTypes(source)]]);
const hook = registerHooks({ load(url, context, next) {
  return ports.has(url) ? { format: 'module', source: ports.get(url), shortCircuit: true } : next(url, context);
} });
let original, constructObserved;
try { original = (await import(mapURL)).default; ({ constructObserved } = await import(terrainURL)); }
finally { hook.deregister(); }
const config = getMapConfig('badlands'), layout = createLayout(config);
assert.equal(stringify({ ...config, terrain: { ...config.terrain, landforms: config.terrain.landforms.map(stripRelief) } }),
  stringify(original), 'only three relief opt-ins may differ from the authenticated full predecessor config');
assert.deepEqual(layout.terrain.landforms.map(form => Boolean(form._relief)), [true, true, true, false, false]);
assert.deepEqual(config.terrain.landforms.slice(3), original.terrain.landforms.slice(3), 'knoll and signed basin stay exact');

function point(form, along, across) {
  const lateral = across + form.bendM * 4 * along * (1 - along);
  return [form.startX + form.axisX * along * form.lengthM - form.axisZ * lateral,
    form.startZ + form.axisZ * along * form.lengthM + form.axisX * lateral];
}
function shelfContract(form) {
  const shape = form._relief, sample = (u, v) => samplePlayableRelief(shape, ...point(shape, u, v));
  const uncutWidth = shape.branchSide > 0 ? shape.leftWidthM : shape.rightWidthM;
  const washWidth = shape.branchSide > 0 ? shape.rightWidthM : shape.leftWidthM;
  const uncut = -shape.branchSide;
  assert.ok(sample(.5, 0) > .9, 'retained upper shelf');
  const tread = sample(.5, uncut * uncutWidth * .42);
  assert.ok(tread > .3 && tread < .5, 'real lower shelf, not a flat-height plateau');
  assert.ok(Math.abs(tread - sample(.5, uncut * uncutWidth * .54)) < 1e-12, 'finite broad tread');
  const cross = shape.branchSide * washWidth * .6;
  const washAlong = shape.notchAtFraction + Math.abs(cross) * .85 / shape.lengthM;
  assert.ok(sample(washAlong, cross) < sample(washAlong, uncut * uncutWidth * .6) * .6,
    'oblique wash interrupts only one side of the shelf');
  for (const u of [0, 1]) for (const v of [-30, 0, 30]) assert.ok(Math.abs(sample(u, v)) < 1e-12, 'finite axial feet');
  for (const v of [-shape.leftWidthM, shape.rightWidthM]) {
    assert.ok(Math.abs(sample(.5, v)) < 1e-12, 'finite lateral feet');
  }
}
function measureShape(form, prior) {
  let maxDifference = 0, maxSlope = 0, changed = 0;
  const shape = form._relief;
  for (let along = 1; along < 20; along++) for (let cross = -18; cross <= 18; cross++) {
    const [x, z] = point(shape, along / 20, cross * 8);
    const h = sampleLandformHeight(form, x, z), before = sampleLandformHeight(prior, x, z);
    assert.ok(Number.isFinite(h) && h >= 0 && h <= form.height, 'original positive amplitude budget');
    const delta = Math.abs(h - before); maxDifference = Math.max(maxDifference, delta);
    if (delta > .5) changed++;
    const dx = (sampleLandformHeight(form, x + .1, z) - sampleLandformHeight(form, x - .1, z)) / .2;
    const dz = (sampleLandformHeight(form, x, z + .1) - sampleLandformHeight(form, x, z - .1)) / .2;
    maxSlope = Math.max(maxSlope, Math.hypot(dx, dz));
  }
  assert.ok(maxDifference > form.height * .2 && changed > 30, 'substantial actual shape change, not metadata');
  assert.ok(maxSlope < .65, 'isolated low shelf cannot introduce a cliff; final composed slope is reported separately');
  return { maxDifference, changed, maxSlope };
}
const shapes = layout.terrain.landforms.slice(0, 3).map((form, index) => {
  shelfContract(form); return measureShape(form, original.terrain.landforms[index]);
});
assert.throws(() => measureShape(layout.terrain.landforms[0], layout.terrain.landforms[0]), { code: 'ERR_ASSERTION' },
  'an unchanged current shape cannot satisfy the predecessor difference contract');
assert.throws(() => shelfContract({ ...layout.terrain.landforms[0], _relief: { ...layout.terrain.landforms[0]._relief, kind: 'spur' } }),
  { code: 'ERR_ASSERTION' }, 'smooth unstepped replacement fails the measured shelf/wash contract');
const supportHashes = supports => Object.fromEntries(Object.entries(supports).map(([key, value]) =>
  [key, value ? { type: value.constructor.name, bytes: value.byteLength,
    sha: sha(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) } : null]));
function finalGround(current, previous) {
  let changed = 0, maxDelta = 0, maxSlope = 0, oldMaxSlope = 0, fastPoints = 0;
  for (let z = -480; z <= 480; z += 20) for (let x = -480; x <= 480; x += 20) {
    const h = current.getHeightAt(x, z), before = previous.getHeightAt(x, z), delta = Math.abs(h - before);
    assert.ok(Number.isFinite(h)); maxDelta = Math.max(maxDelta, delta);
    if (delta > .25) changed++;
    assert.equal(current._roadDist(x, z), previous._roadDist(x, z));
    assert.equal(current.getWaterMaskAt(x, z), previous.getWaterMaskAt(x, z));
    if (delta > .25 && x % 80 === 0 && z % 80 === 0) {
      assert.ok(Math.abs(current.getHeightAtFast(x, z) - Math.fround(h)) < 1e-7); fastPoints++;
    }
    const normal = current.getNormalAt(x, z), oldNormal = previous.getNormalAt(x, z);
    maxSlope = Math.max(maxSlope, Math.hypot(normal.x, normal.z) / normal.y);
    oldMaxSlope = Math.max(oldMaxSlope, Math.hypot(oldNormal.x, oldNormal.z) / oldNormal.y);
  }
  assert.ok(changed > 12 && fastPoints > 0, 'authored shelves reach the conditioned playable surface and live cache');
  assert.ok(maxDelta <= 8.4 + 8.2 + 6.8, 'no height outside the three original amplitude budgets');
  return { changed, maxDelta, maxSlope, oldMaxSlope, fastPoints };
}
function deploymentSupport(current, previous) {
  for (const spawn of [layout.spawns.player, ...layout.spawns.enemies]) {
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      assert.equal(current.getHeightAt(spawn.x + dx, spawn.z + dz), previous.getHeightAt(spawn.x + dx, spawn.z + dz));
    }
  }
}
const receipts = [];
for (const seed of [1337, 7719]) {
  const current = constructObserved(seed, config), previous = constructObserved(seed, original);
  assert.deepEqual(supportHashes(current.supports), supportHashes(previous.supports), 'actual old/current support bytes and storage');
  deploymentSupport(current.field, previous.field);
  receipts.push({ seed, ...finalGround(current.field, previous.field) });
}
console.log(JSON.stringify({ test: 'badlandsRelief', base, unchangedMapSources: 29, shapes, receipts,
  limits: 'Actual CPU scalar/final-ground/support/cache checks; other29 source parity is paired with the existing historical multi-seed suite. No native art, final prop seating, objective access, collision refresh, CPU throughput, heap or FPS clearance.' }, null, 2));
