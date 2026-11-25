// build-loop-yield.selftest.mjs — the mechanism betweenBuilds() exists for (roadlife-retention-277, 2026-11-24). A build
// that makes a WeakRef to what it built, in a loop chained only through awaits, keeps every build alive past a full GC:
// V8 holds a WeakRef's target until the job ends, and an await-only loop never ends it. With betweenBuilds() awaited
// before each build, every finished build is collectable. (No world is built: a typed array stands in for a map.)
import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { betweenBuilds } from './build-loop-yield.mjs';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc');
const BUILDS = 5;

/** Run the loop; returns how many finished builds (all but the last) are still alive after a full GC. */
async function finishedAlive(yieldBetween) {
  const refs = [];
  for (let i = 0; i < BUILDS; i++) {
    if (yieldBetween) await betweenBuilds();
    // the build: something registered weakly, as the shadow-caster lists register a world's meshes; nothing else keeps it
    await (async () => { refs.push(new WeakRef({ geometry: new Float32Array(1 << 16) })); })();
    await Promise.resolve();
  }
  gc();
  return refs.slice(0, -1).filter((ref) => ref.deref() !== undefined).length;
}

const pinned = await finishedAlive(false);
assert.equal(pinned, BUILDS - 1, `without the yield every finished build stays alive past a full GC (${pinned} of ${BUILDS - 1}): `
  + 'if V8 no longer holds a WeakRef target to the end of the job, betweenBuilds() is no longer needed for it');
await betweenBuilds();
const freed = await finishedAlive(true);
assert.equal(freed, 0, `with betweenBuilds() before each build no finished build survives a full GC (${freed} of ${BUILDS - 1} alive)`);
console.log(`build-loop-yield: ${pinned}/${BUILDS - 1} finished builds pinned in an await-only loop, ${freed} with betweenBuilds() PASS`);
