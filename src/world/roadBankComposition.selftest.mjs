import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { usesBoundedRoadShoulders } from './maps/roadBorderCorridor.ts';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
function declaration(text, name) {
  const ast = ts.createSourceFile('terrain.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, `unique production function ${name}`);
  return matches[0];
}
const heightNode = declaration(source, 'heightAt');
const rimStatements = heightNode.body.statements.filter(node => ts.isExpressionStatement(node)
  && node.expression.getText().startsWith('h += rim * rim * T.rimH *'));
assert.equal(rimStatements.length, 1, 'identify the actual heightAt rim operation');
const rim = rimStatements[0], heightSource = heightNode.getText();
const constraints = declaration(source, 'applyHeightConstraints').getText();
const helperSource = ['sampleRoadSupportDistance', 'roadCorridorDistanceWeight', 'roadRimWeight',
  'roadShoulderWeight', 'applyRoadShoulderDetail'].map(name => declaration(source, name).getText()).join('\n');
const ownership = source.match(/let boundedRoadCorridor = [\s\S]*?;/)?.[0];
assert.ok(ownership, 'construction-owned bounded shoulder role exists');
const ownsCorridor = new Function('usesBoundedRoadShoulders', 'cfg', 'borderCorridorStart',
  `${ownership} return boundedRoadCorridor;`).bind(null, usesBoundedRoadShoulders);
const boundedMaps = ['alpine', 'reservoir', 'monsoon', 'blackglass', 'titan_gorge', 'skybridge', 'badlands'];
for (const id of ['verdant', 'fjord', 'copper_mesa', ...boundedMaps]) for (const start of [null, 378, 430, 448]) {
  assert.equal(ownsCorridor({ id }, start), start !== null && boundedMaps.includes(id),
    'explicit bounded ownership does not depend on a historical detour radius');
}
// Exact local predecessor statement from 8367e8c4211d8732ef5a9d566a1a7bbe828acd8b.
// No Git/history dependency or whole-terrain golden: only this changed operation
// is replayed inside the current production heightAt and constraint functions.
const oldRim = 'h += rim * rim * T.rimH * (borderCorridorStart === null ? 1 : 1 - cw * roadCorridorWeight);';
function replacingRim(statement) {
  return heightSource.slice(0, rim.getStart() - heightNode.getStart()) + statement
    + heightSource.slice(rim.end - heightNode.getStart());
}
function compile(body, constraintBody = constraints, helpers = helperSource) {
  return new Function('fixture', `
    const { HALF, CELL, GN, T, cfg, borderCorridorStart, boundedRoadCorridor, gCorridor, gRoadDist, gRoadElev,
      sampleHeightGridCell, clamp, smoothstep, villageMask, baseTerrainHeight,
      applyMacroTerrain, noi, liquidSurfaces, liquidIndex, liquidIndexWords,
      _MARSHES, _LAKES, lakeLevels, liquidLakeBanks, continuousLakeAprons,
      lakeHeightResult, composeLakeHeight, padPts, padYs, waterRampStart,
      waterRampEnd, quarryFloorY } = fixture;
    ${stripTypeScriptTypes(helpers)}
    ${stripTypeScriptTypes(constraintBody)}
    ${stripTypeScriptTypes(body)}
    return heightAt;
  `);
}
const current = compile(heightSource), previous = compile(replacingRim(oldRim));
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function fixture(options = {}) {
  const { start = 378, cw = 1, distance = 41, rimHeight = 52, base = 0,
    lake = null, pad = false } = options;
  const reads = [], noise = [], corridor = [cw], road = [distance], elevation = [10];
  return { reads, noise, values: {
    HALF: 512, CELL: 4, GN: 257, T: { rimH: rimHeight, microScale: 0 },
    cfg: { id: options.id ?? (start === 430 ? 'fjord' : 'alpine') },
    borderCorridorStart: start, gCorridor: corridor, gRoadDist: road, gRoadElev: elevation,
    boundedRoadCorridor: ownsCorridor({ id: options.id ?? (start === 430 ? 'fjord' : 'alpine') }, start),
    sampleHeightGridCell: (array, size, index, fx, fz) => {
      reads.push([array === corridor ? 'corridor' : array === road ? 'distance' : 'elevation',
        size, index, fx, fz]);
      return array[0];
    },
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)), smoothstep,
    villageMask: () => 0, baseTerrainHeight: () => base, applyMacroTerrain: (_x, _z, h) => h,
    noi: { noise: (x, z) => { noise.push([x, z]); return 0; } },
    liquidSurfaces: null, liquidIndex: null, liquidIndexWords: 1, _MARSHES: [],
    _LAKES: [], lakeLevels: [], liquidLakeBanks: null, continuousLakeAprons: false,
    lakeHeightResult: {}, composeLakeHeight: (_l, _levels, _b, _a, _x, _z, h, _s, out) => {
      out.height = lake ?? h; out.wetness = 0;
    },
    padPts: pad ? [{ x: 0, z: 512 }] : [], padYs: [22],
    waterRampStart: .2, waterRampEnd: .8, quarryFloorY: null,
  } };
}
function sample(factory, options = {}, roadsOn = true, lakesOn = false, x = 0, z = 512) {
  const f = fixture(options);
  const height = factory(f.values)(x, z, options.pad ?? false, roadsOn, lakesOn);
  return { height, reads: f.reads, noise: f.noise };
}
function requireAuthoringAndControls(factory) {
  for (const start of [null, 430, 378, 311.8490566037736, 448]) {
    for (const distance of [0, 3.8, 14, 18, 32, 41, 64, 96]) {
      const options = { start, distance, cw: .5, base: 7 };
      assert.deepEqual(sample(factory, options, false), sample(previous, options, false),
        'pre-road/no-lakes authoring keeps exact scalar operations, grid reads and noise calls');
      assert.deepEqual(sample(factory, options, false, true), sample(previous, options, false, true),
        'pre-road/lakes-enabled authoring also stays exact');
      if (start === null || start === 430 || distance >= 64) {
        assert.deepEqual(sample(factory, options), sample(previous, options),
          'nonpilot/Fjord and outside-support final queries stay exact');
      }
    }
  }
  for (const options of [{ cw: 0 }, { rimHeight: 0 }]) {
    assert.deepEqual(sample(factory, options), sample(previous, options), 'zero contribution is exact');
  }
  assert.deepEqual(sample(factory, {}, true, false, 0, 430),
    sample(previous, {}, true, false, 0, 430), 'no change before the existing rim starts');
}
function requireSingleComposition(factory) {
  for (const start of [378, 311.8490566037736, 448]) {
    const options = { start }, result = sample(factory, options);
    // At the real 41m half-taper, R=52, roadY=10 and base=0. One actual
    // production plane blend gives 31; the retired duplicate gives 18.
    assert.equal(result.height, 31, 'final inward bank composes the full rim once');
    assert.equal(sample(factory, options, false).height, 26, 'pre-road authoring remains attenuated');
    assert.deepEqual(result.reads, sample(previous, options).reads, 'no extra grid samples');
    assert.deepEqual(result.noise, sample(previous, options).noise, 'same noise calls/order/coordinates');
    assert.equal(result.reads.filter(row => row[0] === 'elevation').length, 1);
    assert.equal(sample(factory, { start, lake: -8 }, true, true).height, -8, 'lake still wins');
    assert.equal(sample(factory, { start, pad: true }).height, 22, 'pad still wins');
  }
}
requireAuthoringAndControls(current);
requireSingleComposition(current);
assert.throws(() => requireSingleComposition(previous), /composes the full rim once/,
  'actual old duplicate attenuation fails the new phase-specific contract');

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length - 1, 1, `unique mutation target ${before}`);
  return text.replace(before, after);
}
const wrongAuthoring = compile(heightSource, constraints, replaceOnce(helperSource,
  '(roadsOn && bounded)', 'bounded'));
assert.throws(() => requireAuthoringAndControls(wrongAuthoring), /pre-road/,
  'removing phase ownership cannot silently re-author road node heights');
const wrongMaps = compile(heightSource, constraints, replaceOnce(helperSource,
  '(roadsOn && bounded)', 'roadsOn'));
assert.throws(() => requireAuthoringAndControls(wrongMaps), /nonpilot\/Fjord/,
  'restoring the full rim for Fjord must fail');
const omittedPlane = compile(heightSource, replaceOnce(constraints,
  'if (roadsOn && borderShoulderWeight > 0 && marshWeight < 1)',
  'if (false && roadsOn && borderShoulderWeight > 0 && marshWeight < 1)'));
assert.throws(() => requireSingleComposition(omittedPlane), /composes the full rim once/,
  'single composition does not mean removing both grading operations');

function requirePreRoadCallers(text) {
  for (const name of ['buildRoadElevationGrid', 'initializeLakeLevels']) {
    const calls = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText() === 'heightAt') calls.push(node);
      ts.forEachChild(node, visit);
    }
    visit(declaration(text, name));
    assert.ok(calls.length > 0, `${name} retains actual height authoring calls`);
    for (const call of calls) {
      assert.equal(call.arguments[2]?.kind, ts.SyntaxKind.FalseKeyword, `${name} uses no-pad authoring`);
      assert.equal(call.arguments[3]?.kind, ts.SyntaxKind.FalseKeyword, `${name} uses pre-road authoring`);
    }
  }
}
requirePreRoadCallers(source);
assert.throws(() => requirePreRoadCallers(replaceOnce(source,
  'heightAt(nx, nz, false, false)', 'heightAt(nx, nz, false, true)')), /pre-road authoring/);

// Static guard for the maintained acquisition, not an invocation of that probe.
const probe = readFileSync(new URL('../../tools/road-border-corridor-pilot.mjs', import.meta.url), 'utf8');
function requireBankLattice(text) {
  const sideLoop = declaration(text, 'assessPortalPoint').body.statements.find(ts.isForOfStatement);
  assert.ok(sideLoop && ts.isForStatement(sideLoop.statement), 'actual bank offset loop exists');
  assert.match(sideLoop.statement.getText(),
    /^for\s*\(let offset\s*=\s*4;\s*offset\s*<=\s*192;\s*offset\s*\+=\s*2\)/,
    'bank acquisition retains the complete even 4..192m lattice');
}
requireBankLattice(probe);
assert.throws(() => requireBankLattice(replaceOnce(probe,
  'offset = 4; offset <= 192; offset += 2', 'offset = 4; offset <= 192; offset += 4')), /even 4\.\.192m/);
console.log('roadBankComposition: phase-specific production composition and negative controls PASS; no full-field slope/footprint or cost claim');
