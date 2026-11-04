// 2026-11-02 audit F2: the countdown's warm hold. Four writers kept it in a boolean and a counter, and the deferred
// warm's schedule() handed a successor battle the stale battle's in-flight warm, whose release refuses the successor's
// generation: the successor's count stayed on PREPARING.
import assert from 'node:assert/strict';
import { createDeferredCombatWarmRuntime } from './deferredCombatWarmRuntime.ts';
import { createBattleWarmHold } from './battleWarmHold.ts';

// The hold owner: armed per generation, lifted only by that generation, superseded by invalidation.
{
  const hold = createBattleWarmHold();
  assert.equal(hold.pending, false);
  const first = hold.arm();
  assert.equal(hold.pending, true);
  const second = hold.arm();
  assert.equal(hold.release(first), false, 'a stale generation releases nothing');
  assert.equal(hold.pending, true, "the successor's hold survives the stale release");
  assert.equal(hold.release(second), true);
  assert.equal(hold.pending, false);
  assert.equal(hold.release(second), false, 'a release is once');
  const third = hold.arm();
  hold.invalidate();
  assert.equal(hold.pending, false, 'invalidation (the Garage return, a renderer reset) supersedes every hold');
  assert.equal(hold.release(third), false);
  assert.ok(hold.generation > third);
}

// The deferred warm: a successor scheduled before anyone cancelled the stale warm gets its own warm and its hold
// released (the existing selftest only covered a caller that cancels first).
{
  const hold = createBattleWarmHold();
  const game = { phase: 'battle', preBattleS: 4 };
  const frameResolvers = [];
  const gl = { getExtension: () => null };
  const owner = createDeferredCombatWarmRuntime({
    game,
    renderer: { info: { programs: [] }, getContext: () => gl },
    camera: { position: {} },
    getBattleVisuals: () => ({ async stream() {} }),
    combatWarm: { cancelRare() {}, async warmOpeningChunked() {}, async warmRareChunked() {} },
    async warmBattleTerrainTiles() {},
    getWorld: () => null,
    getGeneration: () => hold.generation,
    setPending: (pending) => { if (!pending) hold.release(hold.generation); },
    prepareNextOpeningRoute: () => false,
    now: () => 0,
    yieldFrame: () => new Promise((resolve) => frameResolvers.push(resolve)),
    createYielder: () => async () => {},
  });
  const stale = hold.arm();
  const staleWarm = owner.schedule(stale);
  const successor = hold.arm();
  assert.equal(hold.pending, true);
  const successorWarm = owner.schedule(successor);
  assert.notEqual(successorWarm, staleWarm, "the successor never joins the stale battle's warm");
  assert.equal(frameResolvers.length, 2, 'the successor starts its own warm at once');
  frameResolvers[0]();
  await staleWarm;
  assert.equal(hold.pending, true, "the stale warm's settlement cannot release the successor's hold");
  assert.equal(owner.isActive(), true, 'the stale settlement leaves the successor its slot');
  frameResolvers[1]();
  await successorWarm;
  assert.equal(hold.pending, false, "the successor's warm releases the successor's hold");
  assert.equal(owner.isActive(), false);
  assert.equal(owner.schedule(successor), owner.schedule(successor), 'one generation still owns one warm promise');
}

console.log('battleWarmHold.selftest: generation-scoped hold, and a successor never inherits a stale warm passed');
