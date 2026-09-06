import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';
import { dynamicScaleFloor, internalPixelRatio } from './renderScalePolicy.ts';
import { PRESETS } from './quality.ts';

// Execute the production sizing entry and its actual composer work without
// constructing a WebGL context. Delimiters only isolate the real function;
// assertions below exercise its behavior, not a copied implementation.
const source = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const first = source.indexOf(start);
  assert.notEqual(first, -1, `missing production sizing start: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.notEqual(last, -1, `missing production sizing end: ${end}`);
  return source.slice(first, last);
}
const applySize = stripTypeScriptTypes(sourceBetween(
  '  function applySize(', '\n  function applyAdaptiveQualityAction(',
));
const setSize = sourceBetween('    setSize(w, h) {', '\n    },') + '\n    }';
const createSizing = new Function(
  'renderer', 'preset', 'qualityPolicy', 'internalPixelRatio', 'dynamicScaleFloor',
  'composer', 'aerial', 'upscaler', '_nativeSize',
  `let cssW = 0, cssH = 0;\n${applySize}\nreturn {${setSize}};`,
);

function sizingFixture(preset, scale) {
  let ratio = 2;
  const writes = [];
  const policy = new AdaptiveQualityPolicy(scale);
  policy.forceTrim(1, 1);
  policy.reset = () => { throw new Error('sizing must not reset governor evidence'); };
  const renderer = {
    domElement: { dataset: {} },
    getPixelRatio: () => ratio,
    getDrawingBufferSize: target => Object.assign(target, {
      x: Math.round(1440 * ratio), y: Math.round(900 * ratio),
    }),
  };
  const composer = {
    setPixelRatio: value => writes.push(['ratio', value]),
    setSize: (w, h) => writes.push(['size', w, h]),
  };
  const aerial = { uniforms: { uInvSize: { value: {
    set: (x, y) => writes.push(['inverse', x, y]),
  } } } };
  const upscaler = { setOutputSize: (w, h) => writes.push(['output', w, h]) };
  const post = createSizing(renderer, preset, policy, internalPixelRatio,
    dynamicScaleFloor, composer, aerial, upscaler, {});
  return { policy, renderer, writes, post, setRatio(value) { ratio = value; } };
}

{
  const fixture = sizingFixture(PRESETS.high, 0.91);
  const { policy, renderer, writes, post } = fixture;
  const { scale: oldScale, ...evidence } = { ...policy };
  assert.equal(oldScale, 0.91);
  post.setSize(1440, 900);
  assert.equal(policy.dynamicScale, 0.91,
    'ordinary DPR2 sizing must retain real below-base relief');
  assert.equal(renderer.domElement.dataset.renderScale, '1.365');
  assert.equal(renderer.domElement.dataset.dynScale, '0.910');
  const alreadyEffective = internalPixelRatio(1, PRESETS.high, policy.dynamicScale);
  fixture.setRatio(1);
  writes.length = 0;
  post.setSize(1440, 900);
  assert.equal(policy.dynamicScale, 1);
  assert.equal(renderer.domElement.dataset.renderScale, '1.000');
  assert.equal(renderer.domElement.dataset.dynScale, '1.000');
  assert.deepEqual(writes, [
    ['ratio', alreadyEffective], ['size', 1440, 900],
    ['inverse', 1 / 1440, 1 / 900], ['output', 1440, 900],
  ], 'reconciliation keeps the exact pre-existing effective raster and one sizing transaction');
  const { scale: newScale, ...retainedEvidence } = { ...policy };
  assert.equal(newScale, 1);
  assert.deepEqual(retainedEvidence, evidence);
  fixture.setRatio(2);
  post.setSize(1440, 900);
  assert.equal(policy.dynamicScale, 1);
  assert.equal(renderer.domElement.dataset.renderScale, '1.500');
  assert.equal(policy.performanceTrim, 1, 'density changes must not erase real shading relief');
}

{
  const base = 1.25 / 1.4;
  const fixture = sizingFixture(PRESETS.mobile, base);
  fixture.setRatio(3);
  fixture.post.setSize(1440, 900);
  assert.equal(fixture.policy.dynamicScale, base,
    'a legal mobile ordinary-base scale is not incorrectly forced to the ceiling');
  assert.equal(fixture.renderer.domElement.dataset.renderScale, '1.250');
}

console.log('postViewportScale.selftest: actual sizing preserves evidence and reconciles density floor');
