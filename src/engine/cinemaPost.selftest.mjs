import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCinemaPost } from './cinemaPost.ts';
import { LateFxSceneView } from './lateFxSceneView.ts';
import { NEUTRAL_PICTURE, pictureCinemaSettings, resolvePicture } from '../game/studioPicture.ts';

// Composer wiring of the Studio picture stages against a stand-in post stack with the house
// pass order (post.ts). Rendering is a GPU concern (the media r5 review sheets); this receipt pins
// where each stage enters, that neutral stages add nothing, and that removal restores the chain,
// the bloom/light-FX hooks and the upscaler exactly.
class FakePass {
  constructor(name) { this.name = name; this.enabled = true; this.needsSwap = true; this.renderToScreen = false; }
  setSize() {}
  render() {}
}
class FakeBloom extends FakePass {
  constructor() { super('bloom'); this.strength = 0.3; this.threshold = 1.78; this.seen = []; }
  render() { this.seen.push([this.strength, this.threshold]); }
}
class FakeShafts extends FakePass {
  constructor() { super('sunShafts'); this.strength = 0; }
  update(active) { this.strength = active ? 0.5 : 0; }
}
class FakeFlare extends FakePass {
  constructor() { super('lensFlare'); this.color = new THREE.Color(); }
  update() { this.color.setRGB(1, 1, 1); }
}
function fakePost() {
  const grade = new FakePass('grade');
  grade.isOutputGradePass = true;
  grade.material = { uniforms: { tLightFx: { value: null }, uLightFx: { value: 0 } } };
  const upscaler = new FakePass('upscaler');
  upscaler.outputSize = new THREE.Vector2(1920, 1080);
  const bloom = new FakeBloom(), sunShafts = new FakeShafts(), lensFlare = new FakeFlare();
  const sceneAA = new FakePass('sceneAA');
  sceneAA.sceneTarget = { depthTexture: new THREE.DepthTexture(4, 4) };
  const lateFx = new FakePass('lateFx');
  lateFx.scene = new THREE.Scene();
  lateFx.softState = null;
  lateFx.renderSceneView = new LateFxSceneView(lateFx.scene);
  const passes = [sceneAA, new FakePass('aerial'), new FakePass('gtao'), lateFx, new FakePass('taa'),
    bloom, sunShafts, lensFlare, grade, new FakePass('smaa'), upscaler];
  const composer = {
    passes,
    insertPass(pass, index) { passes.splice(index, 0, pass); pass.setSize?.(1920, 1080); },
    addPass(pass) { passes.push(pass); pass.setSize?.(1920, 1080); },
    removePass(pass) { const i = passes.indexOf(pass); if (i >= 0) passes.splice(i, 1); },
  };
  const lightCalls = [];
  return {
    post: { composer, bloom, sunShafts, lensFlare, upscaler, sceneAA, lateFx, setLightFx: (o) => lightCalls.push(o) },
    house: [...passes], lightCalls, grade, upscaler, bloom, sunShafts, lensFlare,
  };
}
const providers = { lens: () => ({ focusM: 12, cocScale: 0.01 }), grainSeed: () => 7 };
const names = (f) => f.post.composer.passes.map((p) => p.name ?? p.constructor.name);

{
  const f = fakePost();
  const cinema = createCinemaPost(f.post, {}, new THREE.PerspectiveCamera(), providers);
  cinema.apply(pictureCinemaSettings(NEUTRAL_PICTURE));
  assert.deepEqual(f.post.composer.passes, f.house, 'a neutral picture inserts nothing');
  assert.deepEqual(cinema.activeStages, []);
  assert.equal(Object.hasOwn(f.bloom, 'render'), false);

  cinema.apply(pictureCinemaSettings(resolvePicture({ dof: { enabled: true } })));
  assert.deepEqual(names(f), ['sceneAA', 'aerial', 'gtao', 'lateFx', 'taa', 'CinemaLensPass', 'bloom', 'sunShafts',
    'lensFlare', 'grade', 'smaa', 'upscaler'], 'the lens sits after TAA, before bloom');
  assert.equal(f.post.composer.passes[0], f.house[0], 'the canonical sceneAA → aerial → GTAO → lateFx prefix is untouched');
  assert.deepEqual(cinema.activeStages, ['lens']);

  const full = resolvePicture({ preset: 'blockbuster', dof: { enabled: true }, letterbox: '2.39', sunShafts: { mode: 'off' } });
  cinema.apply(pictureCinemaSettings(full));
  assert.deepEqual(names(f), ['sceneAA', 'aerial', 'gtao', 'lateFx', 'taa', 'CinemaLensPass', 'bloom', 'sunShafts',
    'lensFlare', 'CinemaHdrPass', 'grade', 'CinemaGradePass', 'smaa', 'upscaler', 'CinemaFinishPass'],
    'HDR before the house grade, display grade after it, finish last');
  assert.equal(f.upscaler.enabled, false, 'the finish runs FSR itself into a native-size target');
  assert.deepEqual(cinema.activeStages, ['lens', 'bloom', 'lightFx', 'hdr', 'grade', 'finish']);
  assert.deepEqual(f.lightCalls.at(-1), { sunShafts: false, lensFlare: true }, 'forced light effects are overridden');

  // bloom hook: scaled for the call only
  f.bloom.render();
  assert.deepEqual(f.bloom.seen.at(-1), [0.3 * full.bloom, 1.78 * full.bloomThreshold]);
  assert.deepEqual([f.bloom.strength, f.bloom.threshold], [0.3, 1.78], 'house bloom values restored after the call');
  // light-FX hooks scale the per-frame values after the house update
  f.sunShafts.update(true);
  assert.equal(f.sunShafts.strength, 0.5 * full.sunShafts.intensity);
  f.lensFlare.update(true);
  assert.ok(Math.abs(f.lensFlare.color.r - full.lensFlare.intensity) < 1e-9);

  // re-applying is idempotent (panel sliders call this on every input)
  cinema.apply(pictureCinemaSettings(full));
  assert.equal(names(f).filter((n) => n.startsWith('Cinema')).length, 4);

  // film accumulation: the finish leaves the composer, FSR is the last pass again
  cinema.setFinishBypass(true);
  assert.equal(names(f).includes('CinemaFinishPass'), false);
  assert.equal(f.upscaler.enabled, true);
  cinema.setFinishBypass(false);
  assert.equal(names(f).at(-1), 'CinemaFinishPass');

  // removal restores the house chain, hooks and light-FX policy exactly
  cinema.apply(null);
  assert.deepEqual(f.post.composer.passes, f.house);
  assert.equal(f.upscaler.enabled, true);
  for (const [object, key] of [[f.bloom, 'render'], [f.sunShafts, 'update'], [f.lensFlare, 'update']]) {
    assert.equal(Object.hasOwn(object, key), false, `${key} hook removed`);
  }
  assert.equal(f.lightCalls.at(-1), null, 'light-FX overrides released to the preset policy');
  f.sunShafts.update(true);
  assert.equal(f.sunShafts.strength, 0.5);
  assert.equal(cinema.lensFrame, null);
  cinema.dispose();
  cinema.dispose();
  assert.deepEqual(f.post.composer.passes, f.house, 'dispose is idempotent');
}
{
  // a grade-only picture touches neither the lens nor the finish; the HDR pass consumes the light target
  const f = fakePost();
  const cinema = createCinemaPost(f.post, {}, new THREE.PerspectiveCamera(), providers);
  cinema.apply(pictureCinemaSettings(resolvePicture({ saturation: 0.5 })));
  assert.deepEqual(names(f).filter((n) => n.startsWith('Cinema')), ['CinemaGradePass']);
  assert.equal(f.upscaler.enabled, true);
  cinema.apply(pictureCinemaSettings(resolvePicture({ exposure: 1 })));
  assert.deepEqual(names(f).filter((n) => n.startsWith('Cinema')), ['CinemaHdrPass']);
  cinema.dispose();
}
assert.throws(() => createCinemaPost({ ...fakePost().post, composer: { passes: [] } }, {}, new THREE.PerspectiveCamera(), providers),
  /house output grade pass not found/);
console.log('cinemaPost.selftest: neutral no-op, stage order, hooks, finish bypass and exact restoration pass');
