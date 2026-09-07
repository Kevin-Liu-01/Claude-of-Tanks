import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { SceneAAPass, SceneAerialPass } from './sceneSourcePass.ts';
import { LateFxPass } from './post.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

// Real passes and pinned Three composer; attachment lineage is not GPU pixel
// equivalence. The production closure's narrow wiring is checked separately.
const source = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(source, /lateFx\.directColorSource = aerial/);
const frameStart = source.indexOf('function renderFrame(dt: number, frameWallDtSeconds = dt): void');
const frameEnd = source.indexOf('// Live preset switching', frameStart);
assert.ok(frameStart >= 0 && frameEnd > frameStart);
const frameSource = source.slice(frameStart, frameEnd);
assert.match(frameSource, /dynGovern\(adaptiveFrameSeconds\(dt, frameWallDtSeconds\)\)[\s\S]*passes\[0\] === sceneAA && passes\[1\] === aerial[\s\S]*passes\[2\] === gtao && passes\[3\] === lateFx/);
assert.match(frameSource, /sceneAA\.enabled && aerial\.enabled && !gtao\.enabled && lateFx\.enabled[\s\S]*lateFx\.softState\?\.isActive\(\)/);
assert.match(frameSource, /aerial\.beginDirectColorFrame\(directColor \? lateTarget : null\);\s*try \{\s*composer\.render\(dt\);\s*\} finally \{\s*aerial\.endDirectColorFrame\(\);/);
assert.equal(source.match(/beginDirectColorFrame\(/g)?.length, 1, 'warm and standalone paths cannot arm the handoff');

function fixture(autoClear = true) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x234567);
  const background = scene.background;
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.2, 1800);
  camera.layers.enable(LATE_FX_LAYER);
  camera.layers.enable(5);
  const layerMask = camera.layers.mask;
  const sceneTarget = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(320, 180),
    stencilBuffer: false, samples: 4,
  });
  const lateTarget = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(320, 180),
    stencilBuffer: false,
  });
  const ping = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  const lineage = new Map();
  const events = [];
  let current = null;
  let frame = 0;
  let active = true;
  let failure = null;
  let afterAerial = null;
  const renderer = {
    autoClear, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    getPixelRatio: () => 1, getSize: v => v.set(320, 180),
    getRenderTarget: () => current,
    setRenderTarget: value => { current = value; },
    initRenderTarget: target => events.push({ kind: 'init', target }),
    clear: (color, depth, stencil) => {
      events.push({ kind: 'clear', target: current, color, depth, stencil });
      if (color) lineage.delete(current?.texture ?? 'screen');
      if (depth && current?.depthTexture) lineage.delete(current.depthTexture);
    },
    copyTextureToTexture: (input, output) => {
      events.push({ kind: 'depth', input, output });
      if (failure === 'depth') throw new Error('owned depth failure');
      assert.equal(input, sceneTarget.depthTexture);
      assert.equal(output, lateTarget.depthTexture);
      assert.notEqual(input, output);
      lineage.set(output, lineage.get(input));
    },
    render: (object, view) => {
      const isScene = object === scene;
      const fx = isScene && current === lateTarget;
      const kind = isScene ? (fx ? 'fx' : 'world') : object.material.name;
      const material = object.material;
      const input = material?.uniforms.tDiffuse?.value;
      events.push({ kind, target: current, input,
        depthTest: material?.depthTest, depthWrite: material?.depthWrite });
      const copyKind = kind === 'LateFxPass.Copy'
        ? (current === lateTarget ? 'input-copy' : 'output-copy') : kind;
      if (failure === kind || failure === copyKind) throw new Error(`owned ${copyKind} failure`);
      if (renderer.autoClear) renderer.clear(true, true, false);
      if (isScene) {
        assert.equal(view, camera);
        assert.equal(renderer.autoClear, false);
        if (fx) {
          assert.equal(camera.layers.mask, 1 << LATE_FX_LAYER);
          assert.equal(scene.background, null);
          assert.equal(softState.uSceneDepth.value, sceneTarget.depthTexture);
          assert.equal(lineage.get(lateTarget.depthTexture), `depth-${frame}`);
          assert.ok(lineage.has(lateTarget.texture), 'FX must blend over this frame\'s world color');
          lineage.set(lateTarget.texture, `${lineage.get(lateTarget.texture)}+fx`);
        } else {
          assert.equal(current, sceneTarget);
          assert.equal(camera.layers.mask, layerMask & ~(1 << LATE_FX_LAYER));
          lineage.set(sceneTarget.texture, `world-${++frame}`);
          lineage.set(sceneTarget.depthTexture, `depth-${frame}`);
        }
      } else {
        assert.notEqual(input, current?.texture, 'no color attachment feedback');
        assert.ok(lineage.has(input), `${kind} must not read stale/uninitialized color`);
        const value = lineage.get(input);
        lineage.set(current?.texture ?? 'screen', kind === 'AerialHandoffProbe'
          ? `haze(${value})` : kind === 'AoHandoffProbe' ? `ao(${value})` : value);
        if (kind === 'AerialHandoffProbe') {
          if (current === lateTarget) {
            assert.equal(material.depthTest, false);
            assert.equal(material.depthWrite, false);
          }
          afterAerial?.();
        }
      }
    },
  };
  const softState = {
    uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2() },
    uCameraNear: { value: 0 }, uCameraFar: { value: 0 }, isActive: () => active,
  };
  const sceneAA = new SceneAAPass(scene, camera, sceneTarget);
  const aerial = new SceneAerialPass({ ...CopyShader, name: 'AerialHandoffProbe' }, sceneTarget);
  const ao = new ShaderPass({ ...CopyShader, name: 'AoHandoffProbe' });
  ao.enabled = false;
  const lateFx = new LateFxPass(scene, camera, sceneTarget, lateTarget, softState);
  sceneAA.directColorConsumer = aerial;
  lateFx.directColorSource = aerial;
  const output = new ShaderPass({ ...CopyShader, name: 'OutputHandoffProbe' });
  const composer = new EffectComposer(renderer, ping);
  for (const pass of [sceneAA, aerial, ao, lateFx, output]) composer.addPass(pass);
  function render(direct = true) {
    const passes = composer.passes;
    const canDirect = direct && passes[0] === sceneAA && passes[1] === aerial
      && passes[2] === ao && passes[3] === lateFx
      && sceneAA.enabled && aerial.enabled && !ao.enabled && lateFx.enabled
      && lateFx.softState?.isActive();
    aerial.beginDirectColorFrame(canDirect ? lateTarget : null);
    try { composer.render(1 / 60); } finally { aerial.endDirectColorFrame(); }
  }
  function restored() {
    assert.equal(renderer.autoClear, autoClear);
    assert.equal(camera.layers.mask, layerMask);
    assert.equal(scene.background, background);
    assert.equal(aerial.material.depthTest, true);
    assert.equal(aerial.material.depthWrite, true);
    assert.equal(aerial.consumeDirectColor(lateTarget, composer.readBuffer), false);
  }
  function result() {
    const hazed = aerial.enabled ? `haze(world-${frame})` : `world-${frame}`;
    const grounded = ao.enabled ? `ao(${hazed})` : hazed;
    return `${grounded}${active && lateFx.enabled ? '+fx' : ''}`;
  }
  function checkOutput() {
    assert.equal(lineage.get(composer.renderToScreen ? 'screen' : composer.readBuffer.texture), result());
  }
  function copies() { return events.filter(event => event.kind === 'LateFxPass.Copy'); }
  return { scene, camera, sceneTarget, lateTarget, renderer, lineage, events, softState,
    sceneAA, aerial, ao, lateFx, output, composer, render, restored, checkOutput, copies,
    setActive: value => { active = value; }, setFailure: value => { failure = value; },
    setAfterAerial: value => { afterAerial = value; } };
}

// Repeated live/empty and AO toggles, terminal/offscreen output and both composer
// parities. Aerial keeps needsSwap, LateFX changes only its original active swap.
for (const autoClear of [true, false]) {
  const f = fixture(autoClear);
  const writeBuffers = new Set();
  for (let i = 0; i < 32; i++) {
    f.setActive(i % 4 !== 1);
    f.ao.enabled = i % 4 >= 2;
    f.composer.renderToScreen = i % 3 !== 0;
    f.events.length = 0;
    writeBuffers.add(f.composer.writeBuffer);
    f.render();
    f.checkOutput();
    f.restored();
    const active = f.softState.isActive();
    assert.equal(f.copies().length, active ? (f.ao.enabled ? 2 : 1) : 0);
    assert.equal(f.lateFx.needsSwap, active);
    assert.equal(f.aerial.needsSwap, true);
    const depth = f.events.filter(event => event.kind === 'depth');
    assert.equal(depth.length, active ? 1 : 0);
    if (active) {
      const clear = f.events.find(event => event.kind === 'clear' && event.target === f.lateTarget
        && event.depth && event.stencil);
      assert.equal(clear.color, f.ao.enabled);
      const order = f.events.map(event => event.kind);
      assert.ok(order.indexOf('depth') > order.indexOf('AerialHandoffProbe'));
      assert.ok(order.indexOf('fx') > order.indexOf('depth'));
      assert.ok(order.lastIndexOf('LateFxPass.Copy') > order.indexOf('fx'));
    }
  }
  assert.equal(writeBuffers.size, 2);
  // Deliberate corrupted lineage proves the output oracle rejects stale color.
  f.lineage.set(f.composer.readBuffer.texture, 'previous-frame');
  f.lineage.set('screen', 'previous-frame');
  assert.throws(f.checkOutput, /Expected values to be strictly equal/);
}

// Disappearance between producer and consumer still publishes fresh hazed
// color without a swap or depth/FX submission; appearance uses the old path.
{
  const f = fixture();
  f.setAfterAerial(() => f.setActive(false));
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 1);
  assert.equal(f.lateFx.needsSwap, false);
  assert.equal(f.lateFx.softDepthCopies, 0);
  f.setAfterAerial(() => f.setActive(true));
  f.events.length = 0;
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 2);
  f.restored();
}

// The same disappearance can happen when LateFX is the terminal pass. Its
// prepared color must reach the screen, not the unswapped offscreen buffer.
for (const autoClear of [true, false]) {
  const f = fixture(autoClear);
  f.output.enabled = false;
  f.setAfterAerial(() => f.setActive(false));
  f.render();
  assert.equal(f.lateFx.renderToScreen, true);
  f.checkOutput();
  assert.equal(f.copies().length, 1);
  assert.equal(f.copies()[0].target, null);
  assert.equal(f.lateFx.needsSwap, false);
  assert.equal(f.lateFx.softDepthCopies, 0);
  f.restored();
}

// Standalone composer and one-pass warm calls never inherit an armed frame.
{
  const f = fixture();
  f.render();
  f.events.length = 0;
  f.composer.render(1 / 60);
  f.checkOutput();
  assert.equal(f.copies().length, 2);
  f.composer.renderToScreen = false;
  f.events.length = 0;
  for (const active of f.composer.passes) {
    for (const pass of f.composer.passes) pass.enabled = pass === active;
    f.composer.render(1 / 60);
  }
  assert.equal(f.copies().length, 2);
  f.restored();
}

// Resize borrows the same targets/textures, clears any token, and scales both
// the late viewport and future direct render dimensions with the composer.
{
  const f = fixture();
  const color = f.lateTarget.texture;
  const depth = f.lateTarget.depthTexture;
  f.aerial.beginDirectColorFrame(f.lateTarget);
  f.composer.setPixelRatio(1.5);
  f.composer.setSize(1440, 900);
  assert.equal(f.lateTarget.texture, color);
  assert.equal(f.lateTarget.depthTexture, depth);
  assert.deepEqual([f.lateTarget.width, f.lateTarget.height], [2160, 1350]);
  assert.deepEqual(f.softState.uSoftViewport.value.toArray(), [2160, 1350]);
  assert.equal(f.aerial.consumeDirectColor(f.lateTarget, f.composer.readBuffer), false);
  f.render();
  f.checkOutput();
  f.restored();
  assert.equal(f.copies().length, 1);
  f.lateFx.setSoftState(null);
  f.events.length = 0;
  f.render();
  assert.equal(f.copies().length, 0);
  f.lateFx.setSoftState(f.softState);
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 1);
}

// Disabled/reordered stages use the copy fallback. This includes the stale
// frame trap: Aerial runs while LateFX is disabled, then the inverse next frame.
{
  const f = fixture();
  f.lateFx.enabled = false;
  f.render();
  f.checkOutput();
  f.aerial.enabled = false;
  f.lateFx.enabled = true;
  f.events.length = 0;
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 2);
  f.aerial.enabled = true;
  const disabled = new ShaderPass(CopyShader);
  disabled.enabled = false;
  f.composer.insertPass(disabled, 2);
  f.events.length = 0;
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 2);
  f.restored();
}

// Destination guards leave ShaderPass's original destination intact.
for (const guard of ['screen', 'mask', 'swap', 'size', 'type', 'format', 'space', 'samples']) {
  const f = fixture();
  f.lineage.set(f.sceneTarget.texture, 'source');
  if (guard === 'screen') f.aerial.renderToScreen = true;
  if (guard === 'swap') f.aerial.needsSwap = false;
  if (guard === 'size') f.lateTarget.setSize(1, 1);
  if (guard === 'type') f.lateTarget.texture.type = THREE.FloatType;
  if (guard === 'format') f.lateTarget.texture.format = THREE.RGFormat;
  if (guard === 'space') f.lateTarget.texture.colorSpace = THREE.SRGBColorSpace;
  if (guard === 'samples') f.lateTarget.samples = 4;
  f.aerial.beginDirectColorFrame(f.lateTarget);
  const { writeBuffer, readBuffer } = f.composer;
  f.aerial.render(f.renderer, writeBuffer, readBuffer, 1 / 60, guard === 'mask');
  const draw = f.events.find(event => event.kind === 'AerialHandoffProbe');
  assert.equal(draw.target, guard === 'screen' ? null : writeBuffer);
  assert.equal(f.aerial.consumeDirectColor(f.lateTarget, writeBuffer), false);
  f.restored();
}

// A consumer must not accept the other parity or consume a prepared color twice.
{
  const f = fixture();
  f.lineage.set(f.sceneTarget.texture, 'source');
  f.aerial.beginDirectColorFrame(f.lateTarget);
  f.aerial.render(f.renderer, f.composer.writeBuffer, f.composer.readBuffer, 1 / 60, false);
  assert.equal(f.aerial.consumeDirectColor(f.lateTarget, f.composer.readBuffer), false);
  assert.equal(f.aerial.consumeDirectColor(f.lateTarget, f.composer.writeBuffer), false);
}

for (const failure of ['world', 'AerialHandoffProbe', 'depth', 'fx', 'output-copy']) {
  const f = fixture();
  f.setFailure(failure);
  assert.throws(() => f.render(), /owned .* failure/);
  f.restored();
  f.setFailure(null);
  f.events.length = 0;
  f.render();
  f.checkOutput();
  assert.equal(f.copies().length, 1);
  f.restored();
}
for (const failure of ['input-copy', 'output-copy']) {
  const f = fixture(false);
  f.setFailure(failure);
  assert.throws(() => f.render(false), /owned .* failure/);
  f.restored();
}
{
  const f = fixture();
  f.setAfterAerial(() => f.setActive(false));
  f.setFailure('output-copy');
  assert.throws(() => f.render(), /owned .* failure/);
  f.restored();
}

console.log('lateFxColorHandoff.selftest: real-pass lineage/copy counts, activity/AO/parity, depth, resize, warm, guards and failure restoration PASS (CPU only)');
