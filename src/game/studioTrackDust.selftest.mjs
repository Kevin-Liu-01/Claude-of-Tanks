// Studio track-dust adapters (studioTrackDust.ts): Studio.load() restarts actor uids at a1, so adapters must follow the
// actor object. A uid-keyed cache handed every later scene's a1 the session's first a1 adapter — in a cinema --jobs
// session one take's track dust and prints followed an earlier take's hero (2026-10-03).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTrackDustAdapters } from './studioTrackDust.ts';

// an actor with a straight track; its adapter samples the actor it was built for
const actor = (uid, x0, x1) => ({ uid, track: [[0, x0], [6600, x1]] });
let built = 0;
const adapters = createTrackDustAdapters(a => {
  built++;
  return {
    uid: a.uid, halfLengthM: 3.5, halfWidthM: 1.8,
    poseAt(tS, out) {
      const [[t0, x0], [t1, x1]] = a.track, u = Math.min(1, Math.max(0, (tS * 1000 - t0) / (t1 - t0)));
      out.x = x0 + (x1 - x0) * u; out.z = 0; out.yawRad = 0;
      return true;
    },
  };
});
const sample = (adapter, tS) => { const out = { x: 0, z: 0, yawRad: 0 }; adapter.poseAt(tS, out); return out.x; };

// scene 1, then scene 2 after a load: both heroes are a1, on different ground
const first = actor('a1', 100, 116), second = actor('a1', -60, -45);
const a = adapters.adapterFor(first);
assert.equal(adapters.adapterFor(first), a, 'one adapter per actor while the scene lives (the dust emitter keeps its state)');
assert.equal(sample(a, 3.3), 108);
const b = adapters.adapterFor(second);
assert.notEqual(b, a, 'a reloaded a1 gets its own adapter');
assert.equal(b.uid, 'a1');
assert.equal(sample(b, 0), -60, "the second scene's dust starts at its own hero, not the first scene's");
assert.equal(sample(b, 6.6), -45);
assert.equal(built, 2);

// clear() (Studio exit) drops every adapter
adapters.clear();
assert.notEqual(adapters.adapterFor(second), b, 'cleared adapters are rebuilt');
assert.equal(built, 3);

// the Studio uses this cache and keys nothing by uid for track dust
const studio = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
assert.ok(studio.includes('createTrackDustAdapters<StudioActor>'), 'studio.ts builds its track adapters through studioTrackDust.ts');
assert.ok(studio.includes('trackAdapters.adapterFor(a)'), 'trackActors() looks adapters up by actor');
assert.ok(!/trackAdapters\.(get|set)\(\s*a\.uid/.test(studio), 'no uid-keyed track adapter lookups');

console.log('studioTrackDust.selftest: adapters follow the actor across loads');
