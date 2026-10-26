// (battle-spikes-253) simStep makes no closure the game state keeps: a closure made inside it shares the call's context
// with every variable any of its closures reads — the step's collider among them — so `game.aerialCallbacks`, made once
// on the first step, held the first battle's collision bundle and through it the whole world in every Garage after (the
// memory probe's retainer path: __DEBUG.game.aerialCallbacks.nextId → context → collider.collide → the world). The
// drones' callbacks come from a module-level factory (state.ts createAerialCallbacks); the browser memory probe's
// --leak-check gate is the end-to-end receipt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const state = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
const start = state.indexOf('export function simStep(');
const body = state.slice(start, state.indexOf('\nexport function ', start + 10));
assert.ok(start > 0 && body.length > 200);
assert.match(state, /^function createAerialCallbacks\(game: SoloGameState\)/m, 'the callbacks come from a module-level factory');
assert.match(body, /game\.aerialCallbacks \?\?= createAerialCallbacks\(game\)/, 'simStep takes them from it');
// no closure stored on the game from inside the step (a `game.x ??= { ... => ... }` or `game.x = (...) =>`)
const stored = [...body.matchAll(/game\.\w+\s*(\?\?=|=)\s*([^;\n]*)/g)].filter(([, , value]) => /=>|function\s*\(/.test(value));
assert.deepEqual(stored.map(([line]) => line), [], 'simStep stores no closure on the game');
console.log('simStepRetention.selftest: the drones\' callbacks made outside simStep; the step stores no closure on the game');
