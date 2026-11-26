// webcontent-diet-278: the battle retention probe's verdict (tools/battle-retention-probe.mjs). World A passes `released`
// only with its root collected and none of its arrays alive; `retained` (the reverted control) is the opposite; the
// Garage dressing is judged only when the run names an expectation for it.
import assert from 'node:assert/strict';
import { retentionVerdict } from './battle-retention-probe.mjs';

const world = (rootAlive, arraysAlive) => ({ rootAlive, arrays: 1168, arraysAlive, aliveMb: arraysAlive ? 73.5 : 0 });
const dressing = (arraysAlive) => ({ rootAlive: true, arrays: 408, arraysAlive, aliveMb: arraysAlive ? 22.8 : 0 });

// the base's reading (2026-11-25, phone tier): world-verdant whole through the winter battle
const base = { worldA: world(true, 1168), dressing: dressing(408) };
assert.equal(retentionVerdict(base).pass, false, 'a retained world fails the default (released) expectation');
assert.equal(retentionVerdict(base, { expect: 'retained' }).pass, true, 'the reverted control passes as retained');
// released: root collected and no array alive
const fixed = { worldA: world(false, 0), dressing: dressing(408) };
assert.equal(retentionVerdict(fixed).pass, true);
assert.equal(retentionVerdict(fixed).dressingReleased, false);
assert.equal(retentionVerdict(fixed, { expectDressing: 'released' }).pass, false, 'the dressing is judged once named');
assert.equal(retentionVerdict({ worldA: world(false, 0), dressing: dressing(0) }, { expectDressing: 'released' }).pass, true);
// a root collected while one of its arrays lives on (held elsewhere) is not released
assert.equal(retentionVerdict({ worldA: world(false, 3), dressing: dressing(0) }).worldReleased, false);
// a probe that never found world A cannot pass as released
assert.equal(retentionVerdict({ dressing: dressing(0) }).pass, false);
console.log('battle-retention-probe: verdict PASS');
