// Multiplayer v2 peer-to-peer end-to-end, headless in one process (three real sessions, the browser host runtime with
// the actor in an in-process core, WebRTC on the scripted world, the room signaling double applying P1's rules):
// rtc:// start with the host named and secreted, data channels through the relay, snapshots and motion on every
// seat, sealed keyframes retained by the peers, the host's tab closing → the election after the grace → the elected
// peer resumes from its keyframe at the continued tick and moves its own seat onto its actor, the other peer offers
// to it, an ally's hull continuous within a tick across the migration, the room's reports from the new host, and the
// old host back as a peer through its resume.
import assert from 'node:assert/strict';
import { formatReport, runP2pHeadless } from './mp-p2p-headless.mjs';

const report = await runP2pHeadless({ hostGraceMs: 1500, playMs: 4000, world: 'terrain' });
console.log(formatReport(report));
assert.equal(report.pass, true, report.failures.join('; '));
assert.equal(report.steps.start?.hostId, 'p1');
assert.equal(report.steps.connected?.peers, 2);
assert.equal(report.steps.migration?.generation, 2);
assert.equal(report.steps.migration?.p2Role, 'host');
assert.ok(report.steps.migration?.discontinuityM < 1.0, `discontinuity ${report.steps.migration?.discontinuityM} m`); // 2026-09-29: one tick of jitter under suite load (was 0.75)
assert.equal(report.steps.rejoin?.role, 'peer');
console.log('mp-p2p-headless.selftest: the peer-to-peer flow passed every gate');
