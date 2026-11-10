// Proof (implicit state machine audit S1, 2026-11-02): the backpressure bands starve no viewer for ever. A viewer whose
// link holds SNAPSHOT_SKIP_BYTES (16 KB) up to the soft bound (64 KB) has each snapshot skipped and the link never
// closes; above the soft bound a clock closes it after BACKPRESSURE_SUSTAINED_MS, but that clock restarts whenever a
// reading dips to 64 KB or under. So a link stalled in the skip band, or swinging across the soft bound, starved its
// viewer indefinitely. Now a clock runs from the first withheld snapshot across both bands and every dip, and only a
// published snapshot stops it: past SNAPSHOT_STARVED_CLOSE_MS the link closes as BACKPRESSURE "starved".
//   - stalled in the skip band: closed "starved" after the limit (before: never);
//   - swinging 70 KB / 20 KB: closed "starved" after the limit (before: never);
//   - a transient skip (1 s) then a drain: not closed, and the viewer is fed again;
//   - in its entry grace the limit is the entry's long sustained one.
import assert from 'node:assert/strict';
import { createLoopbackLink } from './link.ts';
import * as actorModule from './matchActor.ts';
import { CLOSE_REASON, MESSAGE_TYPE, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

const { createMatchActor, SNAPSHOT_SKIP_BYTES } = actorModule;
const LIMIT_MS = actorModule.SNAPSHOT_STARVED_CLOSE_MS ?? 10_000;
const seats = [
  { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90am' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const TICK_MS = 1000 / 60;
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function starvationCase({ pressureAt, ms, entryGraceMs = 0, entrySustainedMs = 60_000 }) {
  let nowMs = 1000;
  const actor = createMatchActor({ roomId: 'starve', mapId: 'verdant', seed: 4, seats, bots: [], world: 'terrain', countdownS: 0, battleLimitS: 600, now: () => nowMs, schedule: () => () => {},
    entryBackpressureGraceMs: entryGraceMs, entryBackpressureSustainedMs: entrySustainedMs });
  const link = createLoopbackLink('p2');
  let snapshots = 0, closed = null;
  // the viewer acknowledges what it receives, as a seated client does (a silent one is fed from the forced-keyframe bucket)
  const history = new Map();
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
    assert.ok(decoded.ok, `the viewer decodes every frame (${decoded.ok ? '' : decoded.error.code})`);
    const message = decoded.message;
    if (message.type === MESSAGE_TYPE.SNAPSHOT) {
      const frame = applySnapshotPacket(message, message.keyframe ? null : history.get(message.baseTick) ?? null);
      history.set(frame.tick, frame);
      snapshots++;
      link.client.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: frame.tick }));
    }
    if (message.type === MESSAGE_TYPE.CLOSE) closed ??= message;
  });
  link.client.onClose((reason, detail) => { closed ??= { reason, detail }; });
  actor.attach(link.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token: 'x', clientBuild: 'dev' },
    { v: 1, roomId: 'starve', seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90am', iat: 0, exp: Number.MAX_SAFE_INTEGER });
  const startedMs = nowMs;
  let closedAfterMs = null, fedAfter = 0;
  for (let n = 0; n < Math.round(ms / TICK_MS); n++) {
    const elapsedMs = nowMs - startedMs;
    link.client.pressure = pressureAt(elapsedMs, n);
    const before = snapshots;
    nowMs += TICK_MS;
    actor.advance(nowMs);
    await flush();
    if (closed && closedAfterMs === null) closedAfterMs = Math.round(nowMs - startedMs);
    if (snapshots > before && link.client.pressure === 0) fedAfter++;
    if (closed) break;
  }
  actor.stop();
  return { closed, closedAfterMs, fedAfter };
}

// ---- stalled in the skip band
{
  const { closed, closedAfterMs } = await starvationCase({ pressureAt: () => SNAPSHOT_SKIP_BYTES + 4096, ms: LIMIT_MS + 1500 });
  assert.ok(closed, `a viewer stalled in the skip band is closed (before: never; ${LIMIT_MS + 1500} ms without a snapshot)`);
  assert.equal(closed.reason, CLOSE_REASON.BACKPRESSURE);
  assert.ok(closedAfterMs >= LIMIT_MS && closedAfterMs <= LIMIT_MS + 200, `after the starvation limit (${closedAfterMs} ms)`);
}

// ---- swinging across the soft bound: the sustained clock restarts on every dip, the starvation one does not
{
  const { closed, closedAfterMs } = await starvationCase({ pressureAt: (_ms, n) => (Math.floor(n / 2) % 2 === 0 ? 70 * 1024 : 20 * 1024), ms: LIMIT_MS + 1500 });
  assert.ok(closed && closed.reason === CLOSE_REASON.BACKPRESSURE, `a link swinging 70 KB / 20 KB is closed (before: never; ${closedAfterMs} ms)`);
  assert.ok(closedAfterMs >= LIMIT_MS && closedAfterMs <= LIMIT_MS + 200, `after the starvation limit (${closedAfterMs} ms)`);
}

// ---- a transient skip: a second in the skip band, then the link drains and the viewer is fed
{
  const { closed, fedAfter } = await starvationCase({ pressureAt: (ms) => (ms < 1000 ? SNAPSHOT_SKIP_BYTES + 4096 : 0), ms: LIMIT_MS + 1500 });
  assert.equal(closed, null, 'a transient skip never closes the link');
  assert.ok(fedAfter > 200, `the drained viewer is fed again (${fedAfter} snapshots)`);
}

// ---- in the entry grace the limit is the entry's long sustained one
{
  const { closed } = await starvationCase({ pressureAt: () => SNAPSHOT_SKIP_BYTES + 4096, ms: LIMIT_MS + 1500, entryGraceMs: 120_000, entrySustainedMs: 30_000 });
  assert.equal(closed, null, 'a viewer still in its covered entry is not closed at the steady limit');
}
console.log(`skipStarvation: a viewer withheld snapshots past ${LIMIT_MS} ms (skip band, or swinging across the soft bound) is closed as starved; a transient skip is not`);
