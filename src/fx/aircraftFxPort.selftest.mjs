// aircraftFxPort.selftest.mjs — (aircraft-hit-fire-278; Kevin 2026-11-25: "when we hit a plane in the sky with a missile
// or drone or smthg, it leaves this fire that keeps burning in the sky just in the same place") an aircraft in flight is
// drawn no effect that stays at a fixed point: the battle's aircraftFx port (main.ts, game/airSupportWorld.ts) draws a hit
// as a one-shot burst (FxRuntime.airframeBurst: the hull's plate burst with no ground under it), never a hull's
// destruction (a wreck's 40 s burning column, scorch, ground dust and shock ring). Only the crash, where the fall meets
// the ground or a structure, keeps a wreck's fire. The drawn read is tools/aircraft-hit-fire.browser.mjs.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const effects = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');

// the port: its block in main.ts, each method's body
const portAt = main.indexOf('  aircraftFx: {');
assert.ok(portAt > 0, 'main.ts hands the mode world an aircraftFx port');
const port = main.slice(portAt, main.indexOf('\n  },\n', portAt));
const method = (name) => {
  const at = port.search(new RegExp(`\\n\\s+${name}\\(`));
  assert.ok(at > 0, `the port has ${name}`);
  const next = port.slice(at + 1).search(/\n\s+(?:\/\/ .*\n\s+)*\w+\([^)]*\) \{/);
  return next > 0 ? port.slice(at, at + 1 + next) : port.slice(at);
};
for (const name of ['smoke', 'hit']) {
  const body = method(name);
  assert.doesNotMatch(body, /\.destruction\(/, `the in-flight ${name} draws no hull destruction (its column stays in the sky)`);
}
assert.match(method('hit'), /\.airframeBurst\(/, "a heavy charge on the airframe bursts as the airframe's own one-shot burst");
assert.match(method('crash'), /\.destruction\(/, "the crash on the ground keeps a wreck's fire");

// the burst: the plate burst, with no ground, and nothing of a wreck's
const at = effects.indexOf('    airframeBurst(pos: THREE.Vector3');
assert.ok(at > 0, 'the runtime defines airframeBurst');
const burst = effects.slice(at, effects.indexOf('\n    },\n', at));
assert.match(burst, /plateBurst\(blast, \{[^}]*ground: null/, 'the hull plate burst, with no ground under it');
for (const lingering of ['columns.push', 'spawnDestruction', 'spawnScorch', 'killDust', 'dustSurge', 'spawnShockRing', 'destruction(']) {
  assert.ok(!burst.includes(lingering), `airframeBurst draws nothing of a wreck's (${lingering})`);
}
console.log('aircraftFxPort.selftest: the in-flight port draws a one-shot airframe burst, no hull destruction; the crash keeps its fire PASS');
