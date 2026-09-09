import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { trackSurfaceAt, trackSurfacePolicy } from './trackSurface.ts';
import { resolveSourcedTerrainPalette } from './sourcedTextures.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createHeightField } from './terrain.ts';
import { shorelineRadiusAt } from './shoreline.ts';

function verifyClassifier(classify) {
  for (const policy of ['sand', 'snow', 'shore']) {
    assert.equal(classify(policy, 0, 0, .3, .62), 0, 'bare road/hardstand');
    assert.equal(classify(policy, 13.99, 0, .3, .62), 0, 'road shoulder');
    assert.equal(classify(policy, 100, 1, .3, .62), 0, 'water/ice');
  }
  assert.equal(classify('sand', 14, 0, .3, .62), 2);
  assert.equal(classify('snow', 14, 0, .3, .62), 3);
  assert.equal(classify('snow', 100, .001, .3, .62), 0, 'frozen sheet margin');
  assert.equal(classify('shore', 100, 0, .3, .62), 0, 'inland coastal grass');
  assert.equal(classify('shore', 100, .25, .3, .62), 2, 'dry sandy strand');
  assert.equal(classify('shore', 100, .5, .3, .62), 0, 'liquid transition');
  assert.equal(classify('earth', 100, .25, .3, .62), 0, 'mud shore is not sand');
}
verifyClassifier(trackSurfaceAt);
const source = readFileSync(new URL('./trackSurface.ts', import.meta.url), 'utf8');
for (const [before, after] of [
  ['roadDistance < 14', 'roadDistance < 0'],
  ['sheetWetness > 0 ? 0 : 3', '3'],
  ['if (water > 0.02)', 'if (water > 2)'],
  ['return beach > 0.5 ? 2 : 0', 'return 2'],
]) {
  assert.ok(source.includes(before), 'mutation is applied to actual production source');
  const code = ts.transpileModule(source.replace(before, after), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function('exports', code)(exports);
  assert.throws(() => verifyClassifier(exports.trackSurfaceAt), assert.AssertionError);
}

const selected = {
  desert: 2, badlands: 2, copper_mesa: 2, oasis: 2,
  winter: 3, alpine: 3, whiteout: 3, coastal: 2, saltwind: 2,
};
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id);
  const policy = trackSurfacePolicy(resolveSourcedTerrainPalette(id, cfg.splat));
  assert.equal(policy !== 'earth', Object.hasOwn(selected, id), `${id}: actual palette aliases`);
}

function checkActualField(id, expected) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  let admitted = 0, excludedRoad = 0;
  // Actual authored roads and actual existing lookup grids, not fake map labels.
  for (const road of field._layout.roads) for (const [x, z] of road) {
    if (field._roadDist(x, z) >= 14) continue;
    assert.equal(field.getTrackSurfaceAt(x, z), 0, `${id}: road node`);
    excludedRoad++;
  }
  assert.ok(excludedRoad > 0, `${id}: exercised road exclusion`);
  for (let z = -400; z <= 400; z += 80) for (let x = -400; x <= 400; x += 80) {
    const ground = field.getGroundType(x, z), height = field.getHeightAt(x, z);
    const surface = field.getTrackSurfaceAt(x, z);
    assert.ok(surface === 0 || surface === expected);
    admitted += Number(surface === expected);
    assert.equal(field.getGroundType(x, z), ground, 'query cannot change simulation ground');
    assert.equal(field.getHeightAt(x, z), height, 'query cannot deform terrain');
    if (field.getWaterMaskAt(x, z) > .02) assert.equal(surface, 0, 'actual liquid');
  }
  if (id === 'coastal' || id === 'saltwind') {
    assert.equal(field.getTrackSurfaceAt(0, 0), 0, `${id}: inland pasture`);
    admitted += checkActualBeach(field, id);
  }
  for (const lake of field._layout.lakes) {
    assert.equal(field.getTrackSurfaceAt(lake.x, lake.z), 0, `${id}: actual lake/ice`);
  }
  assert.ok(admitted > 0, `${id}: material path is non-vacuous`);
  return { id, admitted, excludedRoad };
}

function checkActualBeach(field, id) {
  let admitted = 0;
  for (const lake of field._layout.lakes) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16, radius = shorelineRadiusAt(lake, angle);
    for (const fraction of [.88, .90, .92, .94, .96]) {
      const x = lake.x + Math.cos(angle) * radius * fraction;
      const z = lake.z + Math.sin(angle) * radius * fraction;
      const surface = field.getTrackSurfaceAt(x, z);
      if (surface !== 2) continue;
      assert.ok(field._waterWetnessAt(x, z) > .02, `${id}: sourced strand, not turf`);
      assert.ok(field.getWaterMaskAt(x, z) <= .02, `${id}: no powder over water`);
      admitted++;
    }
  }
  return admitted;
}
const receipts = Object.entries(selected).map(([id, surface]) => checkActualField(id, surface));
console.log(JSON.stringify(receipts));
console.log('trackSurface.selftest: actual palettes, roads, ice, dry shore, simulation purity and mutations pass');
