// Each capture slot binds its own ports (capture-slot-ports-277, 2026-11-25). The render class runs two holds at once;
// two render tickets both started `vite preview` on 4178/4179, one's teardown stopped the other's previews, and the
// two-peer tool's rooms service sat on the LAN helper's 8792 in both. Here, on a private lock (no machine lock touched):
// - the slots' port blocks never overlap and never include the shared 8792 or the old 4178-4349 lane ports;
// - bindFirstFree skips a taken port and stays inside the block; any other bind failure throws;
// - two render holders get slots 0 and 1 and hand their children disjoint blocks (nestedEnv); a timing hold is slot 0;
// - two concurrent holds through tools/with-capture-lock.mjs's holdCommand, each serving a dist through
//   tools/with-preview.mjs with a stub child: each server binds inside its own block, and the first hold's teardown
//   stops its own server and leaves the second's serving.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { CAPTURE_SLOT_ENV, PREVIEW_PORT_ENV, PREVIEW_PORTS_ENV, ROOMS_PORT_ENV, bindFirstFree, capturePortBlock, portBlockEnv,
  previewPortCandidates, roomsPortFor, slotPortBlock } from './capture-ports.mjs';
import { holdCommand } from './with-capture-lock.mjs';

const LOCK_ENV = [...new Set([...readFileSync(new URL('./capture-lock.mjs', import.meta.url), 'utf8')
  .matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]))];
for (const name of [...LOCK_ENV, CAPTURE_SLOT_ENV, PREVIEW_PORTS_ENV, PREVIEW_PORT_ENV, ROOMS_PORT_ENV, 'COT_LANE_HOLD']) delete process.env[name];
const WITH_PREVIEW = fileURLToPath(new URL('./with-preview.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'cot-capture-slot-ports-'));
const quiet = () => {};
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const serves = (url) => fetch(url, { signal: AbortSignal.timeout(5_000) }).then((response) => response.status === 200, () => false);
const listen = (port) => new Promise((resolveServer, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => resolveServer(server));
});
const closeServer = (server) => new Promise((done) => server.close(() => done()));

try {
  // ---- the blocks ------------------------------------------------------------------------------------------------------
  const seen = new Set();
  for (let slot = 0; slot < 8; slot++) {
    const { previewPorts, rooms } = slotPortBlock(slot);
    for (const port of [...previewPorts, rooms]) {
      assert.ok(!seen.has(port), `slot ${slot}: port ${port} is in no other slot's block`);
      assert.ok(port !== 8792 && !(port >= 4178 && port <= 4349), `slot ${slot}: ${port} is neither the LAN helper's nor a lane script's`);
      seen.add(port);
    }
  }
  assert.throws(() => slotPortBlock(8), RangeError);
  assert.throws(() => slotPortBlock(-1), RangeError);
  assert.deepEqual(portBlockEnv(1), { [CAPTURE_SLOT_ENV]: '1', [PREVIEW_PORTS_ENV]: '4420-4439', [PREVIEW_PORT_ENV]: '4420', [ROOMS_PORT_ENV]: '8801' },
    'the shell form of slot 1\'s block');
  assert.deepEqual(capturePortBlock(portBlockEnv(1)), slotPortBlock(1), 'the block reads back from the variables');
  for (const env of [{}, { [CAPTURE_SLOT_ENV]: '' }, { [CAPTURE_SLOT_ENV]: 'x' }, { [CAPTURE_SLOT_ENV]: '9' }, { [CAPTURE_SLOT_ENV]: '-1' }]) {
    assert.equal(capturePortBlock(env), null, `no hold: ${JSON.stringify(env)}`);
    assert.deepEqual(previewPortCandidates(env), [0], 'outside a hold a preview binds an OS-assigned port');
    assert.equal(roomsPortFor(env), 0, 'and so does a rooms service');
  }
  console.log('capture-slot-ports.selftest: eight disjoint blocks, none on 8792 or 4178-4349; outside a hold, port 0');

  // ---- bindFirstFree ---------------------------------------------------------------------------------------------------
  const taken = await listen(0), free = await listen(0);
  const takenPort = taken.address().port, freePort = free.address().port;
  await closeServer(free);
  const bound = await bindFirstFree(listen, { ports: [takenPort, freePort] });
  assert.equal(bound.port, freePort, 'a taken port is skipped for the next in the block');
  assert.equal(bound.server.address().port, freePort);
  await closeServer(bound.server);
  await assert.rejects(bindFirstFree(listen, { ports: [takenPort], fallback: false }), (error) => error.code === 'EADDRINUSE',
    'a pinned port that is taken fails rather than drifting');
  const fallback = await bindFirstFree(listen, { ports: [takenPort] });
  assert.equal(fallback.port, 0, 'past the block it falls back to an OS-assigned port');
  await closeServer(fallback.server);
  await assert.rejects(bindFirstFree(() => { throw new Error('vite exploded'); }, { ports: [freePort] }), /vite exploded/, 'any other failure throws at once');
  assert.match(String(await bindFirstFree(async () => { throw Object.assign(new Error('Port 4400 is already in use'), {}); }, { ports: [4400], fallback: false })
    .catch((error) => error.message)), /in use/, 'Vite\'s strictPort message counts as a taken port');
  await closeServer(taken);
  console.log('capture-slot-ports.selftest: bindFirstFree skips a taken port, keeps a pinned one, falls back to port 0');

  // ---- the lock hands each holder its slot -----------------------------------------------------------------------------
  const lockDir = join(root, 'lock'), queueDir = join(root, 'queue'), logFile = join(root, 'holds.log');
  const makeLock = () => createCaptureLock({ lockDir, queueDir, logFile, log: quiet });
  const first = makeLock(), second = makeLock();
  assert.equal(first.heldSlot, null, 'nothing held: no slot');
  await first.acquire(5_000, { lockClass: 'render', command: 'node tools/stub-render.mjs' });
  await second.acquire(5_000, { lockClass: 'render', command: 'node tools/stub-render.mjs' });
  assert.deepEqual([first.heldSlot, second.heldSlot].sort(), [0, 1], 'two render members hold slots 0 and 1');
  const envs = [first.nestedEnv(), second.nestedEnv()];
  for (const [index, env] of envs.entries()) {
    assert.deepEqual(capturePortBlock(env), slotPortBlock([first, second][index].heldSlot), 'each hands its children its own block');
    assert.match(env.COT_SHOTS_HELD ?? '', /^\d+:[0-9a-f]{24}$/, 'beside the nested-hold token');
  }
  assert.notEqual(envs[0][PREVIEW_PORT_ENV], envs[1][PREVIEW_PORT_ENV], 'the two blocks differ');
  assert.notEqual(envs[0][ROOMS_PORT_ENV], envs[1][ROOMS_PORT_ENV]);
  first.release(); second.release();
  const timing = makeLock();
  await timing.acquire(5_000, { lockClass: 'timing', command: 'node tools/stub-timing.mjs' });
  assert.equal(timing.heldSlot, 0, 'an exclusive hold binds slot 0\'s block');
  assert.equal(timing.nestedEnv()[CAPTURE_SLOT_ENV], '0');
  timing.release();
  console.log('capture-slot-ports.selftest: two render holders hold slots 0 and 1 and hand down disjoint blocks; a timing hold is slot 0');

  // ---- two concurrent holds, each with a preview through tools/with-preview.mjs ----------------------------------------
  const site = join(root, 'site');
  mkdirSync(join(site, 'dist'), { recursive: true });
  writeFileSync(join(site, 'dist', 'index.html'), '<!doctype html><title>slot</title>');
  // the stub: records what its hold handed it, then waits until told to finish
  const stub = join(root, 'stub.mjs');
  writeFileSync(stub, `import { existsSync, writeFileSync } from 'node:fs';
const [out, go] = process.argv.slice(2);
writeFileSync(out, JSON.stringify({ url: process.env.COT_PREVIEW_URL, slot: process.env.${CAPTURE_SLOT_ENV}, ports: process.env.${PREVIEW_PORTS_ENV},
  rooms: process.env.${ROOMS_PORT_ENV}, token: process.env.COT_SHOTS_HELD ?? null }));
while (!existsSync(go)) await new Promise((r) => setTimeout(r, 50));
`);
  const hold = (name) => {
    const out = join(root, `${name}.json`), go = join(root, `${name}.go`);
    const done = holdCommand({ command: process.execPath, args: [WITH_PREVIEW, `--root=${site}`, '--', process.execPath, stub, out, go], lockClass: 'render',
      waitMin: 2, label: `slot-ports-${name}` }, { lock: makeLock(), log: quiet, stdio: 'ignore' });
    return { out, go, done };
  };
  const a = hold('a'), b = hold('b');
  const read = async (file) => {
    for (let waited = 0; !existsSync(file); waited += 100) {
      if (waited > 120_000) throw new Error(`${file}: the held command never started its preview`);
      await sleep(100);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const [seenA, seenB] = [await read(a.out), await read(b.out)];
  assert.deepEqual([seenA.slot, seenB.slot].sort(), ['0', '1'], 'the two concurrent holds hold the two render slots');
  for (const seenBy of [seenA, seenB]) {
    const block = slotPortBlock(Number(seenBy.slot));
    const port = Number(new URL(seenBy.url).port);
    assert.ok(block.previewPorts.includes(port), `slot ${seenBy.slot}'s preview bound ${port}, inside its block ${seenBy.ports}`);
    assert.equal(Number(seenBy.rooms), block.rooms, 'and its child knows its rooms port');
    assert.ok(seenBy.token, 'beside the nested-hold token');
  }
  assert.notEqual(seenA.url, seenB.url, 'two servers, two ports');
  assert.ok(await serves(seenA.url) && await serves(seenB.url), 'both previews serve at once');
  // the first hold ends: its teardown stops its own server only
  writeFileSync(a.go, '');
  assert.equal(await a.done, 0, 'the first hold\'s command exits 0');
  assert.equal(await serves(seenA.url), false, 'the first hold\'s preview is stopped with it');
  assert.equal(await serves(seenB.url), true, 'the second hold\'s preview still serves after the first hold\'s teardown');
  writeFileSync(b.go, '');
  assert.equal(await b.done, 0);
  assert.equal(await serves(seenB.url), false, 'and stops with its own hold');
  assert.equal(existsSync(lockDir), false, 'both holds released the lock');
  console.log('capture-slot-ports.selftest: two concurrent render holds serve in their own blocks; one teardown leaves the other serving');
} finally {
  rmSync(root, { recursive: true, force: true });
}
