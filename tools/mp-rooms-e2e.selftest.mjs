// The short rooms end-to-end (6 headless sessions, one in-process room host with real
// sockets): create / join / ready / start, every seat welcomed, the creator leaves
// mid-match and admin migrates, a dropped seat resumes with its capability, the
// verdict reaches everyone, a rematch welcomes every remaining seat.
import assert from 'node:assert/strict';
import { formatReport, runRoomsE2E } from './mp-rooms-e2e.mjs';

const report = await runRoomsE2E({ clients: 6, battleS: 20, leaveAtS: 8, world: 'terrain', mapId: 'verdant' });
console.log(formatReport(report));
assert.equal(report.pass, true, report.failures.join('; '));
assert.equal(report.rounds[0].welcomed, 6);
assert.equal(report.rounds[1].welcomed, report.rounds[1].expected);
assert.equal(report.resume?.sameToken, true);
console.log('mp-rooms-e2e.selftest: the short rooms end-to-end passed every gate');
