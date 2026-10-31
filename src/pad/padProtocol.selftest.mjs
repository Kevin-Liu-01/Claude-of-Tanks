// The phone controller's protocol (docs/PHONE-CONTROLLER.md "Wire"): routes, the envelope readers' refusals, the
// 24-byte axes frame (round trip, clamps, wrapping totals and seq), the relay text and the phone page's address.
import assert from 'node:assert/strict';
import {
  PAD_AXES_BYTES, PAD_CODE_ALPHABET, decodePadAxes, encodePadAxes, formatPadCode, padAxesFromRelay, padAxesToRelay,
  padPageUrl, padSeqNewer, parsePadRoute, readPadClientMessage, readPadCtl, readPadHostMessage,
} from './padProtocol.ts';
import { resolvePadServiceUrl } from './padEndpoint.ts';
import { OFFICIAL_ROOMS_URL, OFFICIAL_SITE_HOST } from '../officialHost.ts';

// --- routes ---------------------------------------------------------------------------------------------------
assert.deepEqual(parsePadRoute('/pad/new'), { kind: 'new' });
assert.deepEqual(parsePadRoute('/pad/join/k7q4mz'), { kind: 'join', code: 'K7Q4MZ' });
assert.deepEqual(parsePadRoute('/pad/resume/K7Q4MZ'), { kind: 'resume', code: 'K7Q4MZ' });
for (const junk of ['/pad', '/pad/new/', '/pad/join/K7Q4M', '/pad/join/K7Q4MZZ', '/pad/join/K7Q0MZ', '/pad/other/K7Q4MZ', '/rooms/ABCDEF']) {
  assert.equal(parsePadRoute(junk), null, `${junk} is not a pad route`);
}
assert.equal(formatPadCode('K7Q4MZ'), 'K7Q 4MZ');
assert.equal(PAD_CODE_ALPHABET.length, 31);
assert.ok(!/[01ILO]/.test(PAD_CODE_ALPHABET), 'no look-alikes in the alphabet');

// --- envelope readers refuse what the hosts must not act on ---------------------------------------------------
assert.deepEqual(readPadClientMessage('{"t":"signal","kind":"offer","sdp":"v=0"}'), { t: 'signal', kind: 'offer', sdp: 'v=0' });
assert.equal(readPadClientMessage('{"t":"signal","kind":"rollback"}'), null);
assert.equal(readPadClientMessage('{"t":"resume","token":"short"}'), null, 'a malformed token is refused');
assert.equal(readPadClientMessage('{"t":"relay","data":"' + 'x'.repeat(600) + '"}'), null, 'an oversized relay payload is refused');
assert.equal(readPadClientMessage('[1]'), null);
assert.equal(readPadClientMessage('not json'), null);
assert.deepEqual(readPadHostMessage('{"t":"ice","iceServers":[{"urls":"stun:a"},{"bogus":1}],"relay":false}'),
  { t: 'ice', iceServers: [{ urls: 'stun:a' }], relay: false }, 'malformed ICE servers are dropped');
assert.deepEqual(readPadCtl('{"k":"down","a":"fire","s":70000}'), { k: 'down', a: 'fire', s: 70000 & 0xffff });
assert.equal(readPadCtl('{"k":"down","a":"leaveBattle","s":1}'), null, 'only the phone\'s hold actions');
assert.equal(readPadCtl('{"k":"tap","a":"settingsMenu"}'), null, 'only the phone\'s tap actions');
assert.equal(readPadCtl('{"k":"down","a":"fire"}'), null, 'a hold names its seq');
const status = { battle: true, alive: true, paused: false, sniper: false, slot: 1, shells: [{ type: 'AP', icon: 'shellAp', count: 30 }], reloadS: 1.2, reloadTotalS: 6 };
assert.deepEqual(readPadCtl(JSON.stringify({ k: 'status', s: status })), { k: 'status', s: status });
assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, shells: 'AP' } })), null);
assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, shells: [{ type: 'AP', icon: '"><img>', count: 1 }] } })), null,
  'a glyph id is a sprite id, never markup');
assert.deepEqual(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, spec: 'm1a1_abrams_hc', turret: 0.4 } })).s.spec, 'm1a1_abrams_hc');
assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, kmh: -12, topKmh: 68 } })).s.kmh, -12, 'the speedometer reads reverse too');
assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, kmh: 'fast' } })), null);
assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, spec: '../x' } })), null, 'a spec id is an id, never a path');

// --- the axes frame ---------------------------------------------------------------------------------------------
const frame = { flags: 1, seq: 65535, t: 2 ** 32 + 17, steer: -0.5, throttle: 1.7, aimX: 12.375, aimY: -40, held: 0b101 };
const bytes = encodePadAxes(frame);
assert.equal(bytes.byteLength, PAD_AXES_BYTES);
const out = {};
assert.equal(decodePadAxes(bytes, out), true);
assert.equal(out.seq, 65535);
assert.equal(out.t, 17, 'the phone clock wraps at 2^32');
assert.ok(Math.abs(out.steer + 0.5) < 1e-4);
assert.equal(out.throttle, 1, 'axes clamp to [-1, 1]');
assert.equal(out.aimX, 99, 'aim totals travel in eighths');
assert.equal(out.aimY, -320);
assert.equal(out.held, 0b101);
assert.equal(decodePadAxes(new Uint8Array(23), out), false, 'a short frame is not an axes frame');
const big = encodePadAxes({ ...frame, aimX: 2 ** 31 / 8 + 1 });
decodePadAxes(big, out);
assert.equal(out.aimX, -(2 ** 31) + 8, 'aim totals wrap as int32 (the mapper differences them)');
const reused = new Uint8Array(PAD_AXES_BYTES);
assert.equal(encodePadAxes(frame, reused), reused, 'encoding reuses the caller\'s buffer');

assert.equal(padSeqNewer(1, 65535), true, 'seq wraps');
assert.equal(padSeqNewer(65535, 1), false);
assert.equal(padSeqNewer(5, 5), false);

const relay = padAxesToRelay(bytes);
assert.deepEqual([...padAxesFromRelay(relay)], [...bytes], 'the relay text round-trips');
assert.equal(padAxesFromRelay('!!!'), null);

// --- the phone page's address and the pad service -----------------------------------------------------------------
assert.equal(padPageUrl('https://cot.kevinliu.studio/', 'K7Q4MZ'), 'https://cot.kevinliu.studio/pad#K7Q4MZ',
  'the code rides in the fragment, never sent to a server');
assert.equal(resolvePadServiceUrl('', 'https:', OFFICIAL_SITE_HOST), OFFICIAL_ROOMS_URL, 'the site pairs through its rooms Worker');
assert.equal(resolvePadServiceUrl('[SENSITIVE]', 'https:', OFFICIAL_SITE_HOST), OFFICIAL_ROOMS_URL);
assert.equal(resolvePadServiceUrl('', 'http:', '192.168.1.20'), 'ws://192.168.1.20:8792', 'a LAN page pairs through the LAN helper');
assert.equal(resolvePadServiceUrl('ws://insecure.test', 'https:', OFFICIAL_SITE_HOST), OFFICIAL_ROOMS_URL, 'no ws:// from an https page');
assert.equal(resolvePadServiceUrl('', 'https:', 'example.vercel.app'), null, 'a host with no rooms Worker has no pad service');

console.log('padProtocol: PASS — routes, readers, the 24-byte axes frame, relay text, page address, service URL');
