// The standby host (2026-10-14, the MP stream; docs/MULTIPLAYER-V2.md §13.21). An elected peer used to spawn its host thread
// and then load the battlefield's collision world and the roster's fleet while every seat waited (~2 s of the election's
// freeze on the §7 side-by-side, more on a slow machine). A seat that may host now prepares a host thread while it plays as a
// peer: the core's 'prepare' builds the world and loads the fleet, and the boot of that battlefield takes the prepared world.
// This receipt drives the core through its port exactly as the browser host does and counts the world builds.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { planHostBoot } from './hostPlan.ts';
import { createRoom, joinRoom } from '../room/roomPolicy.ts';

const watchdog = setTimeout(() => { console.error('hostStandby.selftest: stuck'); process.exit(1); }, 30_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('hostStandby.selftest: RSS past 1.5 GB'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 5000) => { const started = Date.now(); while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); } };

const room = createRoom({ roomCode: 'STANDB', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90m' }, team: null, now: 1001 });
const plan = planHostBoot(room, { matchId: 'm1-0000sb01', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', hostId: 'me' }, 'me');
const secret = createHash('sha256').update('host-standby').digest('hex');
const bootConfig = (mapId) => ({ roomId: 'STANDB', matchId: 'm1-0000sb01', generation: 2, mapId, mode: 'standard', seed: 7, seats: plan.seats, bots: plan.bots, countdownS: 1, hostSecret: secret, manifestBase: null, resume: null });
const prepareFor = (mapId) => ({ mapId, mode: 'standard', manifestBase: null, specIds: ['m1a2', 't90m'] });

/** A core whose world builds take `loadMs` (or fail when `fail` says so); every build is recorded with its map. */
function standbyCore({ loadMs = 50, fail = () => false } = {}) {
  const pair = createHostPortPair();
  const builds = [];
  const core = createMatchHostCore({
    port: pair.worker, reportIntervalMs: 500,
    buildWorld: async (config) => { builds.push(config.mapId); await sleep(loadMs); if (fail(builds.length)) throw new Error('manifest unavailable'); return 'terrain'; },
  });
  const posted = [];
  pair.main.onMessage((message) => posted.push(message));
  const done = () => { core.dispose(); pair.main.close(); };
  return { pair, core, builds, posted, done };
}

// ---- prepared, then elected on the same battlefield: one world build (the preparation's), the boot runs on it
{
  const { pair, core, builds, posted, done } = standbyCore();
  pair.main.post({ type: 'prepare', prepare: prepareFor('verdant') });
  await until(() => posted.some((message) => message.type === 'prepared'), 'prepared');
  assert.deepEqual(posted.find((message) => message.type === 'prepared').ok, true, 'the preparation reports ok');
  assert.equal(core.booted, false, 'a preparation boots nothing');
  assert.ok(core.actor === null, 'and starts no actor');
  pair.main.post({ type: 'boot', config: bootConfig('verdant') });
  await until(() => posted.some((message) => message.type === 'ready'), 'ready');
  assert.deepEqual(builds, ['verdant'], 'the boot took the prepared world: no second build');
  assert.equal(core.bootedPrepared, true);
  done();
}

// ---- elected while the preparation still loads: the boot waits for that world rather than building another
{
  const { pair, core, builds, posted, done } = standbyCore({ loadMs: 300 });
  pair.main.post({ type: 'prepare', prepare: prepareFor('verdant') });
  await sleep(30);
  pair.main.post({ type: 'boot', config: bootConfig('verdant') });
  await until(() => posted.some((message) => message.type === 'ready'), 'ready after the preparation');
  assert.deepEqual(builds, ['verdant'], 'one build: the boot joined the preparation in flight');
  assert.equal(core.bootedPrepared, true);
  done();
}

// ---- a preparation for another battlefield is not this boot's world: the boot builds its own
{
  const { pair, core, builds, posted, done } = standbyCore();
  pair.main.post({ type: 'prepare', prepare: prepareFor('desert') });
  await until(() => posted.some((message) => message.type === 'prepared'), 'prepared (desert)');
  pair.main.post({ type: 'boot', config: bootConfig('verdant') });
  await until(() => posted.some((message) => message.type === 'ready'), 'ready (verdant)');
  assert.deepEqual(builds, ['desert', 'verdant']);
  assert.equal(core.bootedPrepared, false);
  done();
}

// ---- a failed preparation is not an error: it says so, and the boot builds the world afresh and runs
{
  const { pair, core, builds, posted, done } = standbyCore({ fail: (count) => count === 1 });
  pair.main.post({ type: 'prepare', prepare: prepareFor('verdant') });
  await until(() => posted.some((message) => message.type === 'prepared'), 'prepared (failed)');
  const prepared = posted.find((message) => message.type === 'prepared');
  assert.equal(prepared.ok, false);
  assert.match(prepared.error, /manifest unavailable/);
  pair.main.post({ type: 'boot', config: bootConfig('verdant') });
  await until(() => posted.some((message) => message.type === 'ready'), 'ready after a failed preparation');
  assert.equal(posted.some((message) => message.type === 'boot_failed'), false, 'the boot did not fail');
  assert.deepEqual(builds, ['verdant', 'verdant'], 'the boot built its own world');
  assert.equal(core.bootedPrepared, false);
  assert.ok(core.actor, 'and its actor runs');
  done();
}

// ---- once only, and never after a boot began; a stopped core prepares nothing
{
  const { pair, builds, posted, done } = standbyCore();
  pair.main.post({ type: 'boot', config: bootConfig('verdant') });
  pair.main.post({ type: 'prepare', prepare: prepareFor('verdant') });
  await until(() => posted.some((message) => message.type === 'ready'), 'ready (fresh boot)');
  await sleep(100);
  assert.deepEqual(builds, ['verdant'], 'a preparation after the boot builds nothing');
  assert.equal(posted.some((message) => message.type === 'prepared'), false);
  done();
  const stopped = standbyCore();
  stopped.pair.main.post({ type: 'stop', reason: 1, detail: 'gone' });
  stopped.pair.main.post({ type: 'prepare', prepare: prepareFor('verdant') });
  await sleep(100);
  assert.deepEqual(stopped.builds, [], 'a stopped core prepares nothing');
  stopped.done();
}
await sleep(50);
assert.ok(process.memoryUsage().rss < 1e9, 'bounded');
console.log('hostStandby.selftest: a prepared host thread boots on its prepared world (one build), joins a preparation in flight, builds afresh for another battlefield or after a failed preparation, and never prepares after a boot or a stop');
