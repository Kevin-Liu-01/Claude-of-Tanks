import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const clean = text => text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const statement = (text, name) => {
  const match = clean(text).match(new RegExp('float ' + name + ' = ([^;]+);'));
  assert.ok(match, name + ' is an actual production scalar');
  return match[1];
};
const run = (text, args, values) => new Function(...args, 'return ' + text)(...values);
function checkCoverage(text) {
  const expression = statement(text, 'sandCoverage');
  assert.doesNotMatch(expression, /texture2D|uNoise|cameraPosition|wp|sin/);
  const coverage = (shoreOnly, shore) => run(expression, ['uRipple', 'seaSand'], [{ w: shoreOnly }, shore]);
  for (const shore of [0, .01, .1, .3, .6, 1]) {
    assert.equal(coverage(0, shore), 1, 'dry dune maps retain exact full coverage');
    assert.equal(coverage(1, shore), shore, 'coast uses its actual existing beach blend');
  }
  assert.equal(coverage(1, 0), 0, 'inland coastal pasture has no sand ripples');
  const condition = clean(text).match(/if \((uRipple\.z[^)]*)\) \{/);
  assert.ok(condition);
  const active = (amplitude, shore) => run(condition[1], ['uRipple', 'sandCoverage'], [{ z: amplitude }, shore]);
  assert.equal(active(.2, 0), false, 'skip expensive ripple samples on inland grass');
  assert.equal(active(.2, .5), true, 'shore detail still executes');
  for (const name of ['rw', 'bedW', 'sandFaceW']) {
    const value = statement(text, name);
    assert.match(value, /\* sandCoverage\s*$/, name + ' attenuates at the same shore edge');
    // This is the shared final coverage multiplication, not a replacement for
    // each branch's existing independent rock, water, distance and slope masks.
    const suffix = value.slice(value.lastIndexOf('* sandCoverage'));
    for (const weight of [0, .01, .3, 1]) {
      assert.equal(run('weight ' + suffix, ['weight', 'sandCoverage'], [weight, 0]), 0);
      assert.equal(run('weight ' + suffix, ['weight', 'sandCoverage'], [weight, 1]), weight);
    }
  }
}
checkCoverage(source);
assert.throws(() => checkCoverage(source.replace('uRipple.w > 0.5 ? seaSand : 1.0', '1.0')),
  /actual existing beach blend|no sand ripples/, 'unmasked inland ripples cannot regress');
assert.throws(() => checkCoverage(source.replace('uRipple.z * sandCoverage > 0.001', 'uRipple.z > 0.001')),
  /skip expensive/, 'a zero final amplitude cannot conceal unnecessary branch sampling');
for (const name of ['rw', 'bedW', 'sandFaceW']) {
  const old = statement(source, name);
  assert.throws(() => checkCoverage(source.replace(old, old.replace(/\* sandCoverage\s*$/, ''))),
    /attenuates/, name + ' must keep shoreline isolation');
}
const rippleMaps = MAP_IDS.filter(id => (getMapConfig(id).splat?.rippleAmp ?? 0) > 0);
assert.deepEqual(rippleMaps.filter(id => getMapConfig(id).splat.rippleShoreOnly), ['coastal', 'saltwind'],
  'only the mixed grass/beach maps change; dry-ripple maps retain coverage1');
for (const id of ['desert', 'oasis', 'skybridge', 'titan_gorge']) {
  assert.ok(rippleMaps.includes(id));
  assert.ok(!getMapConfig(id).splat.rippleShoreOnly, id + ' keeps dry sand relief even around water');
}
assert.match(source, /uniform vec4 uRipple;/, 'reuse the existing uniform without a new texture');
assert.match(source, /new THREE\.Vector4\(rd\[0\] \/ rl, rd\[1\] \/ rl, S\.rippleAmp \?\? 0, S\.rippleShoreOnly \? 1 : 0\)/,
  'authoring opt-in reaches the actual shader uniform');
console.log('terrainSandCoverage: real shader shore gating, retained dry response, branch/sample isolation and negative controls PASS');
