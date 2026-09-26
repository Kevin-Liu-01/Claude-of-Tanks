// The Multiplayer v2 exit flow end-to-end (four headless sessions, one in-process room host with
// real sockets): leave battle releases the seat's client at once and keeps the room seat, the seat
// re-enters the running match with its retained match_start (same token, same entity), a second tab
// replaces the first (a seat drop the first reads as REPLACED), an explicit room leave drops the seat
// and a fresh join by code is refused while the room plays (room_locked), the admin kick ends room and
// match links together, the verdict reaches the survivors, the fresh join seats the player again and
// the rematch welcomes it.
import assert from 'node:assert/strict';
import { formatReport, runExitE2E } from './mp-exit-e2e.mjs';

const report = await runExitE2E({ battleS: 15, world: 'terrain', mapId: 'verdant' });
console.log(formatReport(report));
assert.equal(report.pass, true, report.failures.join('; '));
assert.equal(report.steps.reentry?.sameToken, true);
assert.equal(report.steps.reentry?.sameEntity, true);
assert.equal(report.steps.replaced?.reasonName, 'replaced');
assert.equal(report.steps.roomLeave?.freshJoinRefused, 'room_locked');
assert.equal(report.steps.rejoin?.seated, true);
assert.equal(report.steps.rematch?.freshSeatWelcomed, true);
console.log('mp-exit-e2e.selftest: the exit flow end-to-end passed every gate');
