// A crashed host tab (2026-10-14, the MP stream; MULTIPLAYER-V2 §13.22): the headless peer-to-peer flow with the room's
// production socket lease (8 s). The host's room socket drops and its links go silent at once, with no pagehide hand-off
// (a crash, a killed browser): its peers hear nothing, say so (`host_unreachable`), and the room elects at once rather than
// after the lease. Before: the election waited out the 8 s lease (223's production window: 8.4 s).
import assert from 'node:assert/strict';
import { formatReport, runP2pHeadless } from './mp-p2p-headless.mjs';
import { ROOM_HOST_DISCONNECT_GRACE_MS } from '../src/mp/room/protocol.ts';

const report = await runP2pHeadless({ hostGraceMs: ROOM_HOST_DISCONNECT_GRACE_MS, playMs: 3000, world: 'terrain' });
console.log(formatReport(report));
assert.equal(report.pass, true, report.failures.join('; '));
const migration = report.steps.migration;
assert.equal(migration?.hostLost, true, 'the room elected on its peers\' evidence');
assert.ok(migration.electedAfterMs < 4000, `elected ${migration.electedAfterMs} ms after the crash (the lease is ${ROOM_HOST_DISCONNECT_GRACE_MS} ms)`);
assert.ok((migration.claims.p2 ?? 0) + (migration.claims.p3 ?? 0) >= 1, JSON.stringify(migration.claims));
assert.equal(migration.p2Role, 'host');
assert.ok(migration.discontinuityM < 1.0, `discontinuity ${migration.discontinuityM} m`);
console.log(`mp-p2p-headless-crash.selftest: a crashed host's peers elected a new host ${migration.electedAfterMs} ms after the crash (lease ${ROOM_HOST_DISCONNECT_GRACE_MS} ms), claims ${JSON.stringify(migration.claims)}`);
