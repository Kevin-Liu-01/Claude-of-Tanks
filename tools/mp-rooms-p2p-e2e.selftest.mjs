// The peer-to-peer rooms end-to-end (five raw room sockets, one in-process room host with the p2p match host):
// the election and the rtc:// URL, the per-match secret only on the host's copies, tokens under it, the relay and
// its refusals, the host's reports, host migration 8 s after the host's socket drops, the old host back as a peer,
// the successor's verdict, and relay credentials minted by the room for its seats alone while the match ran (§13.14).
// The 8 s grace is real time (~12 s wall).
import assert from 'node:assert/strict';
import { formatP2pReport, runP2pRoomsE2E } from './mp-rooms-p2p-e2e.mjs';

const report = await runP2pRoomsE2E();
console.log(formatP2pReport(report));
assert.equal(report.pass, true, report.failures.join('; '));
assert.deepEqual(report.host.map((host) => [host.generation, host.hostId, host.reason]), [[1, 'p2', 'start'], [2, 'p3', 'timeout']]);
assert.equal(report.migration?.hostSecret, 'present');
assert.equal(report.verdict?.result, 'alpha');
assert.deepEqual(report.relayCredentials, { granted: 3, unseated: 'not_in_room', afterVerdict: 'relay_phase' }, 'the room minted relay credentials for its seats alone, while the match ran');
console.log('mp-rooms-p2p-e2e.selftest: the peer-to-peer rooms end-to-end passed every gate');
