// The Studio's world step (fix/studio-world-step, 2026-10-08; the coordinator's ruling after wave 273): an offline export
// step (__STUDIO.advanceFrame → advanceTimeline → advanceFx, fixed 1/60 s steps) and a capture ran no world update, and
// the Studio's render loop runs its world update at dt 0. So a prop felled in a clip never animated its fall, and a crater
// dug mid-clip never reached the drawn ground (wave 273's "invisible" craters). The actual stepFx and advanceFx of
// studio.ts, run here with stub ports, now advance the props' clock by every fixed step's dt and sync the drawn ground
// in every step, a capture's included; the world implements both from what its own update does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', studioSource, ts.ScriptTarget.Latest, true);
const names = new Set(['stepFx', 'advanceFx']);
const nodes = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) nodes.push(node);
  ts.forEachChild(node, visit);
})(source);
assert.equal(nodes.length, 2, 'the Studio\'s stepFx and advanceFx');
const functions = nodes.map((node) => node.getText(source));

/** What the two functions read without declaring it (the Studio's state they close over, globals aside): the ports
 * below stub what the step needs, and the rest reads as undefined (a no-op where it is called), so a branch that adds
 * its own Studio state to the step (its destruction, its strike rounds, its track dust) runs this receipt unchanged
 * where it merges this one. */
const HARNESS = new Set(['clockMs']);
const free = new Set(), called = new Set();
{
  const declared = new Set();
  const visit = (node) => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const declares = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
        || ts.isFunctionExpression(parent) || ts.isBindingElement(parent)) && parent.name === node;
      const key = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent))
        && parent.name === node;
      if (declares) declared.add(node.text);
      else if (!key && !ts.isBindingElement(parent)) free.add(node.text);
      if (ts.isCallExpression(parent) && parent.expression === node) called.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  nodes.forEach(visit);
  for (const name of [...free]) if (declared.has(name) || HARNESS.has(name) || name in globalThis) free.delete(name);
}

/** A world with one prop felled on a hinge (its angle advances with the props' clock while it falls) and a ground whose
 * drawn chunks follow its stamps when synced. */
function stubWorld() {
  return {
    felled: false, hinge: 0, propDt: [], stamps: [], drawn: [], syncs: 0,
    updateProps(dt) {
      this.propDt.push(dt);
      if (this.felled) this.hinge = Math.min(Math.PI / 2, this.hinge + dt * 1.5);
    },
    syncGround() {
      this.syncs++;
      while (this.drawn.length < this.stamps.length) this.drawn.push(this.stamps[this.drawn.length]);
    },
  };
}

function studioStep(world) {
  const noop = () => {};
  const ports = {
    shells: [], stepShell: noop, hfProxy: { getHeightAt: () => 0 }, fxBus: { emit: noop }, actors: [],
    _fwd: new THREE.Vector3(), _v2: new THREE.Vector3(), fx: { update: noop, exhaust: noop }, camera: new THREE.PerspectiveCamera(),
    resolveFxSubject: noop, getWorld: () => world, FX_STEP_S: 1 / 60, applyStoryboardActors: noop, advanceWater: noop,
    applyStoryboardCamera: noop, invalidate: noop,
    // the media Studio's own step state (media/r5-on-pr9): live FX quality, no Studio light, a scratch vector
    fxSettings: { quality: 'live' }, ctx: {}, _v1: new THREE.Vector3(),
  };
  for (const name of free) if (!(name in ports)) ports[name] = called.has(name) ? noop : undefined;
  const code = stripTypeScriptTypes(`
    function makeStudioStep(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let clockMs = 0;
    ${functions.join('\n')}
    return { stepFx, advanceFx, clockMs: () => clockMs };
    }
  `);
  return new Function('ports', code + '\nreturn makeStudioStep(ports);')(ports);
}

// ---- a felled prop's hinge advances frame to frame in an export (100 ms frames: six fixed steps each)
{
  const world = stubWorld();
  const studio = studioStep(world);
  studio.advanceFx(100);
  assert.equal(world.hinge, 0, 'standing, it does not move');
  world.felled = true;
  const angles = [];
  for (let frame = 0; frame < 5; frame++) { studio.advanceFx(100); angles.push(world.hinge); }
  for (let i = 1; i < angles.length; i++) assert.ok(angles[i] > angles[i - 1], `the hinge advances frame to frame (${angles.map((a) => a.toFixed(3)).join(' ')})`);
  assert.ok(Math.abs(angles[0] - 0.1 * 1.5) < 1e-9, 'by the frame\'s whole duration, step by step');
  assert.ok(Math.abs(world.propDt.reduce((s, dt) => s + dt, 0) - 0.6) < 1e-9, 'the props\' clock is the Studio\'s: 0.6 s over six frames');
  assert.ok(world.propDt.every((dt) => dt > 0 && dt <= 1 / 60 + 1e-12), 'in fixed steps');
  // a held frame (dt 0: the render loop's own refresh, a capture) moves nothing
  const before = world.hinge;
  studio.stepFx(0);
  assert.equal(world.hinge, before, 'a held frame does not advance the fall');
}

// ---- a crater dug mid-clip reaches the drawn ground within its step, and in a capture
{
  const world = stubWorld();
  const studio = studioStep(world);
  studio.advanceFx(50);
  world.stamps.push({ crater: 0 });
  studio.stepFx(1 / 60);
  assert.deepEqual(world.drawn, [{ crater: 0 }], 'the next fixed step draws it');
  world.stamps.push({ crater: 1 });
  studio.stepFx(0); // the capture's own refresh (capture() calls stepFx(0) before it renders)
  assert.equal(world.drawn.length, 2, 'and a capture of the same frame does too');
  assert.ok(world.syncs >= 4, 'every step syncs (O(1) when nothing is new)');
  // a world without the hooks (an older build, a test stub) is left alone
  const bare = studioStep(null);
  bare.advanceFx(100);
  bare.stepFx(0);
}

// ---- the world implements both from what its update does, and a capture syncs through stepFx(0)
{
  const map = readFileSync(new URL('../world/map.ts', import.meta.url), 'utf8');
  assert.match(map, /updateProps\(dt: number, cameraPos: THREE\.Vector3\) \{ if \(props\.updateProps\) props\.updateProps\(dt, cameraPos\); \}/,
    'world.updateProps advances the props\' own clock (hinge topples, loose bodies, pole LOD)');
  assert.match(map, /syncGround\(\) \{\s*\(terrain\.userData\.syncGroundOverlay[^\n]*\n\s*\(terrain\.userData\.followGroundOverlay/,
    'world.syncGround runs the terrain\'s overlay hook, then its cover\'s');
  assert.match(studioSource, /lighting\.update\(true\);[^\n]*\n\s*stepFx\(0\);/, 'a capture refreshes through stepFx(0)');
}

console.log('studioWorldStep: an export step advances a felled prop\'s hinge frame to frame on the Studio\'s clock (0.6 s over six '
  + '100 ms frames, fixed steps, none at dt 0) and draws a crater dug mid-clip within its step and in a capture PASS');
