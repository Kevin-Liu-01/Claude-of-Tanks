// exhaustTrail.selftest.mjs — EF.01 (the owner, 2026-10-12: the smoke from tanks "used to look more uniform ...
// continuous. like how it was before"; the coordinator's ruling, 2026-10-13). A running hull's exhaust is deploy 207's
// thin continuous sprite streak on every tier; round 7b's media billow is only an engine's bursts: the cold-start cough
// and a throttle-up after a real lift. The actual production `exhaust` method runs here (compiled out of effects.ts),
// on the media tier and on the phone tier (whose sprite path is the predecessor's, unchanged since deploy 207).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { mulberry32 } from './particles.ts';
import { createTrailCadence } from './trailCadence.ts';
import { exhaustSpacing } from './blastRecipes.ts';

const source = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('effects.ts', source, ts.ScriptTarget.Latest, true);
function named(name) {
  let found;
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(tree) === name) {
      assert.equal(found, undefined, `unique ${name}`); found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(found, `actual production ${name}`);
  return found;
}
const exhaustNode = named('exhaust');
const params = exhaustNode.parameters.map((p) => p.name.getText(tree)).join(', ');
const method = `function exhaust(${params}) ${exhaustNode.body.getText(tree)}`;
const burstConsts = source.match(/const EXHAUST_BURST_RATE = [^;]+;/)?.[0];
assert.ok(burstConsts, 'the burst constants');

function fixture({ media, fresh = 999, seed = 4242 }) {
  const sprites = [], billows = [];
  let time = 100;
  const ctx = {
    THREE, _c0: new THREE.Color(), rng: mulberry32(seed), blast: media ? {} : null, battleFresh: { s: fresh },
    fxTrails: createTrailCadence(16), TRAIL_EXHAUST: 1, exhaustSpacing, distBoost: () => 1,
    particles: { emit: (pool, o) => sprites.push({ pool, ...structuredClone(o) }), getTime: () => time },
    exhaustPuff: (C, x, y, z, vx, vz, fx, fz, load, sooty, bo) => billows.push({ x, z, load, sooty, bo }),
    COLUMN_WIND_X: 0.82, COLUMN_WIND_Z: 0.28,
    _puffO: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0, col0: [0, 0, 0], col1: [0, 0, 0], alpha: 1, grav: 0, birthOffset: 0 },
  };
  const col3 = named('col3').getText(tree);
  const js = ts.transpileModule(`${col3}\n${burstConsts}\nlet battleFreshS = battleFresh.s;\n${method}\nreturn { exhaust, tail: () => rng() };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = new Function(...Object.keys(ctx), js)(...Object.values(ctx));
  // a hull driving +z: one exhaust call per 60 Hz tick at `load`, the stack at the hull's rear deck
  const pos = new THREE.Vector3(0, 2.1, 0), vel = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
  const drive = (seconds, load, speed, sooty = true) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      time += 1 / 60; pos.z += speed / 60; vel.set(0, 0, speed);
      api.exhaust(pos, load, sooty, vel, fwd, 0);
    }
  };
  return { ...api, sprites, billows, drive, oneShot: (n) => { for (let i = 0; i < n; i++) api.exhaust(pos, 1, true); } };
}

// 1. under way at a steady load the media tier draws the predecessor's sprite streak, puff for puff (no billow)
for (const sooty of [true, false]) {
  const media = fixture({ media: true }), phone = fixture({ media: false });
  for (const [s, load, speed] of [[1, 0.35, 4], [3, 0.6, 12], [2, 0.8, 16]]) { media.drive(s, load, speed, sooty); phone.drive(s, load, speed, sooty); }
  assert.equal(media.billows.length, 0, `${sooty ? 'diesel' : 'turbine'}: no billow while the load holds`);
  assert.ok(media.sprites.length > 200, 'a dense streak (one puff most ticks)');
  assert.deepEqual(media.sprites, phone.sprites, `${sooty ? 'diesel' : 'turbine'}: the predecessor's sprite streak, puff for puff`);
  assert.equal(media.tail(), phone.tail(), 'and its RNG tail');
}

// 2. the engine's start: round 7b's billow cough, and no sprite belch on top of it
{
  const media = fixture({ media: true, fresh: 0 }), phone = fixture({ media: false, fresh: 0 });
  media.drive(2, 0.4, 0); phone.drive(2, 0.4, 0);
  assert.ok(media.billows.length >= 12 && media.billows.every((b) => b.load >= 0.9), `a cold-start cough (${media.billows.length} billows)`);
  const belch = (f) => f.sprites.filter((p) => p.size0 <= 0.22 && p.grav === 0.6).length;
  assert.ok(belch(phone) > 0 && belch(media) === 0, 'the phone tier belches sprites; the media tier coughs its billow instead');
}

// 3. a throttle-up after a real lift gulps one short billow burst; a brief stab of the pedal does not
{
  const f = fixture({ media: true });
  f.drive(2, 0.1, 0);
  assert.equal(f.billows.length, 0, 'idling: no billow');
  f.drive(1, 0.85, 3);
  const burst = f.billows.length;
  assert.ok(burst >= 4 && burst <= 14, `pulling away: one burst (${burst} billows over 0.7 s)`);
  f.drive(2, 0.9, 12);
  assert.equal(f.billows.length, burst, 'running on: the streak alone');
  f.drive(0.2, 0.1, 11); f.drive(1.5, 0.9, 12);
  assert.equal(f.billows.length, burst, 'a 0.2 s lift and back: no burst');
  f.drive(1.5, 0.1, 6); f.drive(1, 0.9, 8);
  assert.ok(f.billows.length > burst, 'a real lift and back on: another burst');
  const z = f.billows.slice(burst).map((b) => b.z);
  for (let i = 1; i < z.length; i++) assert.ok(z[i] - z[i - 1] < 1.3, 'a burst under way is one connected gulp, not beads');
}

// 4. a Studio one-shot (no hull motion) keeps round 7b's billow at the engine's rate
{
  const f = fixture({ media: true });
  f.oneShot(240);
  assert.ok(f.billows.length > 10 && f.sprites.length === 0, `a Studio engine-smoke beat is the billow (${f.billows.length})`);
}
console.log('exhaustTrail.selftest: running exhaust is the predecessor\'s sprite streak; billow only for the cold start and throttle-ups');
