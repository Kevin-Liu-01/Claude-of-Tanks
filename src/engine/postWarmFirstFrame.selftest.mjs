// postWarmFirstFrame.selftest.mjs — the post chain's first-frame warm (engine/postLazyPasses.ts, 2026-10-19,
// black-screen-228 RC4). It used to switch every pass off for the whole warm and await between passes with them off: a
// frame presented between two steps drew nothing, and a second warm that overlapped the first snapshotted the all-off
// flags and restored them, leaving the chain off for good. Now each pass renders alone inside one synchronous
// transaction and every flag is back before each await; an overlapping call returns the running warm.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { warmPostFirstFrame, renderPassAlone } from './postLazyPasses.ts';

function chain() {
  const draws = [];
  const passes = ['SceneAAPass', 'SceneAerialPass', 'GTAOPass', 'LateFxPass', 'OutputGradePass', 'SMAAPass', 'FsrUpscalePass']
    .map((name) => {
      const pass = { name, enabled: name !== 'GTAOPass', uniforms: name === 'OutputGradePass' ? { uThermal: { value: 0 } } : undefined };
      Object.defineProperty(pass, 'constructor', { value: { name } });
      return pass;
    });
  const composer = {
    passes, renderToScreen: true,
    render() { draws.push({ on: passes.filter((pass) => pass.enabled).map((pass) => pass.name), toScreen: this.renderToScreen,
      thermal: passes[4].uniforms.uThermal.value }); },
  };
  const canonical = () => passes.map((pass) => pass.enabled);
  return { passes, composer, draws, grade: passes[4], canonical };
}

{
  const c = chain();
  const before = c.canonical();
  const presented = [];
  const timings = await warmPostFirstFrame(c.composer, c.grade, async (label) => {
    // a frame the browser presents between two steps sees the whole canonical chain, on screen
    assert.deepEqual(c.canonical(), before, `between steps (${label}) every pass keeps its flag`);
    assert.equal(c.composer.renderToScreen, true);
    presented.push(label);
    await Promise.resolve();
  });
  // every enabled pass warmed alone, off screen; the grade once per sensor mode with the player's mode restored
  const alone = c.draws.filter((draw) => draw.on.length === 1);
  assert.equal(alone.length, c.draws.length, 'each warm draw renders exactly one pass');
  assert.ok(c.draws.every((draw) => draw.toScreen === false), 'warm draws never present');
  assert.deepEqual([...new Set(alone.map((draw) => draw.on[0]))], c.passes.filter((p) => p.enabled).map((p) => p.name));
  assert.deepEqual(c.draws.filter((draw) => draw.on[0] === 'OutputGradePass').map((draw) => draw.thermal), [0, 1, 2, 3]);
  assert.equal(c.grade.uniforms.uThermal.value, 0, 'the sensor mode is restored');
  assert.equal(timings.length, 6);
  assert.ok(presented.includes('vision-3') && presented[0] === 'SceneAAPass');
  assert.deepEqual(c.canonical(), before, 'the warm ends canonical');
}

{
  // two overlapping warms: the second returns the running one, and the chain ends canonical
  const c = chain();
  const before = c.canonical();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = warmPostFirstFrame(c.composer, c.grade, async () => { await gate; });
  const second = warmPostFirstFrame(c.composer, c.grade, async () => { throw new Error('the second warm must not run'); });
  assert.equal(second, first, 'an overlapping call returns the running warm');
  assert.deepEqual(c.canonical(), before, 'a frame during the overlap draws the whole chain');
  release();
  await Promise.all([first, second]);
  assert.deepEqual(c.canonical(), before, 'two overlapping warms end canonical');
  const third = warmPostFirstFrame(c.composer, c.grade, null);
  assert.notEqual(third, first, 'a finished warm releases its slot');
  await third;
}

{
  // a pass that throws inside its transaction still restores every flag and the presentation target
  const c = chain();
  const before = c.canonical();
  c.composer.render = () => { throw new Error('link failed'); };
  assert.throws(() => renderPassAlone(c.composer, c.passes[1]), /link failed/);
  assert.deepEqual(c.canonical(), before);
  assert.equal(c.composer.renderToScreen, true);
  // a rejected yield leaves the chain canonical (the warm stops; nothing is left off)
  const d = chain();
  await assert.rejects(warmPostFirstFrame(d.composer, d.grade, async () => { throw new Error('superseded'); }), /superseded/);
  assert.deepEqual(d.canonical(), before);
}

{
  // post.warmFirstFrame delegates to this chunk once the lazy half has landed (the boot awaits `ready` first)
  const post = await readFile(new URL('./post.ts', import.meta.url), 'utf8');
  assert.match(post, /warmFirstFrame\(yieldBeforePass = null\) \{\s*return smaaReady\.then\(\(\) => warmFirstFrameNow\(composer, grade, yieldBeforePass\)\);/);
  assert.doesNotMatch(post, /for \(const pass of passes\) pass\.enabled = false;/, 'no warm holds the chain off across awaits');
  assert.doesNotMatch(post, /createVisionWarmSteps/, 'the vision warm left the entry with the first-frame warm');
}

console.log('postWarmFirstFrame.selftest: one pass per synchronous transaction, canonical flags between steps, overlapping warms share one run and end canonical');
