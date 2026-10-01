// Rooms never hang (2026-09-30, docs/MULTIPLAYER-V2.md §13.11): the lifecycle proofs on the in-process room service
// (server/rooms with the p2p match host — the Durable Object's own state machine) with real room clients over real
// sockets and real sessions hosting on the scripted WebRTC world: an emptied room's next joiner owns it and starts; the
// admin passes at once on a leave; a seat dropping at match start and a host dropping at match start both resolve
// inside the contract's grace; every seat leaving mid-match (host last, first, only) closes the match as lost and a
// brand-new seat starts a new match on the same code; the host's tab dying migrates to a willing successor or, with
// none, ends the match within the grace (`unable`); bogus codes, a join during playing, a double join and the 24 h
// boundary are clean refusals; twenty rooms created and left leave actors with no socket and no deadline but the
// idle expiry. The slow budgets (the 30 s admin grace and report budget, the 60 s link window) run with `--slow`
// in `npm run test:net:v2:rooms:lifecycle`, and the same scenarios run against wrangler dev and the deployed Worker.
import assert from 'node:assert/strict';
import { ROOM_HOST_DISCONNECT_GRACE_MS } from '../src/mp/room/protocol.ts';
import { formatReport, runRoomLifecycle } from './mp-room-lifecycle.mjs';

const report = await runRoomLifecycle({ local: true, slow: false });
console.log(formatReport(report));
const byId = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
assert.equal(report.pass, true, report.scenarios.filter((scenario) => scenario.outcome !== 'PASS').map((scenario) => `${scenario.id}: ${scenario.outcome} ${scenario.hang ? `${scenario.hang.step} — ${scenario.hang.detail}` : scenario.failures.join('; ')}`).join('\n'));
assert.deepEqual([...byId.keys()], ['a', 'b1', 'c1', 'c2', 'd1', 'd2', 'd3', 'e1', 'e2', 'f1', 'f2', 'f3', 'f4', 'g'], 'the fast set runs every scenario but the slow budgets');
assert.ok(byId.get('b1').resolutionMs < 2_000, `the admin passes at once on a leave (${byId.get('b1').resolutionMs} ms)`);
assert.ok(byId.get('c2').resolutionMs >= ROOM_HOST_DISCONNECT_GRACE_MS - 250 && byId.get('c2').resolutionMs < ROOM_HOST_DISCONNECT_GRACE_MS + 5_000, `the host drop resolves at the grace (${byId.get('c2').resolutionMs} ms)`);
assert.ok(byId.get('e2').resolutionMs < ROOM_HOST_DISCONNECT_GRACE_MS + 5_000, `no willing successor: terminal within the grace, not the report budget (${byId.get('e2').resolutionMs} ms)`);
assert.equal(byId.get('e2').notes.withinGrace, true);
assert.equal(byId.get('g').notes.actorsWithOnlyExpiry, 20, 'twenty emptied actors hold only the idle expiry');
for (const scenario of report.scenarios) assert.ok(scenario.messages.out > 0 && scenario.messages.in > 0, `${scenario.id} exchanged messages (${scenario.messages.out}/${scenario.messages.in})`);
console.log(`mp-room-lifecycle.selftest: ${report.scenarios.length} lifecycle scenarios resolved on the real actor in ${(report.wallMs / 1000).toFixed(1)} s — no room, seat or client hung`);
