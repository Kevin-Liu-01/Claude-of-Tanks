// The phone controller's protocol (docs/PHONE-CONTROLLER.md "Wire"): routes, the envelope readers' refusals, the
// 24-byte axes frame (round trip, clamps, wrapping totals and seq), the relay text and the phone page's address.
import assert from 'node:assert/strict';
import {
  PAD_AXES_BYTES, PAD_CODE_ALPHABET, encodePadAxes, formatPadCode, padAxesFromRelay, padAxesToRelay,
  PAD_RELAY_CTL, PAD_RELAY_DATA_MAX, PAD_TOUR_MAX_PARTS, PAD_TOUR_PARTS, PAD_TOUR_STOPS, encodePadTour, parsePadRoute, readPadClientMessage, readPadCtl, readPadHostMessage,
} from './padProtocol.ts';
import { decodePadAxes, decodePadTour, padPageUrl, padSeqNewer } from './padDesk.ts';
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

// couch lobbies (docs/COUCH-MODE.md): the route, the desktop's lobby messages, and seats on signal, relay and presence
assert.deepEqual(parsePadRoute('/pad/lobby'), { kind: 'lobby' });
assert.equal(parsePadRoute('/pad/lobby/K7Q4MZ'), null, 'a lobby is opened by the desktop, never joined by path');
assert.deepEqual(readPadClientMessage('{"t":"signal","kind":"answer","sdp":"a","seat":3}'), { t: 'signal', kind: 'answer', sdp: 'a', seat: 3 });
assert.equal(readPadClientMessage('{"t":"signal","kind":"answer","seat":9}'), null, 'a seat past the lobby is refused');
assert.equal(readPadClientMessage('{"t":"relay","data":"a","seat":0}'), null, 'seats count from 1');
assert.deepEqual(readPadClientMessage('{"t":"relay","data":"a","seat":8}'), { t: 'relay', data: 'a', seat: 8 });
assert.deepEqual(readPadClientMessage('{"t":"lobby","open":false}'), { t: 'lobby', open: false });
assert.equal(readPadClientMessage('{"t":"lobby","open":"yes"}'), null);
assert.deepEqual(readPadClientMessage('{"t":"kick","seat":2}'), { t: 'kick', seat: 2 });
assert.equal(readPadClientMessage('{"t":"kick","seat":2.5}'), null);
assert.deepEqual(readPadHostMessage('{"t":"joined","token":"tok","seat":4}'), { t: 'joined', token: 'tok', seat: 4 });
assert.deepEqual(readPadHostMessage('{"t":"joined","token":"tok"}'), { t: 'joined', token: 'tok' }, 'a pairing names no seat');
assert.deepEqual(readPadHostMessage('{"t":"seat","seat":2,"state":"gone"}'), { t: 'seat', seat: 2, state: 'gone' });
assert.equal(readPadHostMessage('{"t":"seat","seat":2,"state":"lost"}'), null);
assert.deepEqual(readPadHostMessage('{"t":"lobby","open":true,"until":5,"seats":3}'), { t: 'lobby', open: true, until: 5, seats: 3 });
assert.deepEqual(readPadHostMessage('{"t":"relay_spent","seat":5}'), { t: 'relay_spent', seat: 5 });
assert.deepEqual(readPadHostMessage('{"t":"signal","kind":"offer","sdp":"o","seat":1}'), { t: 'signal', kind: 'offer', sdp: 'o', seat: 1 });
assert.deepEqual(readPadHostMessage('{"t":"ice","iceServers":[{"urls":"stun:a"},{"bogus":1}],"relay":false}'),
  { t: 'ice', iceServers: [{ urls: 'stun:a' }], relay: false }, 'malformed ICE servers are dropped');
assert.deepEqual(readPadCtl('{"k":"down","a":"fire","s":70000}'), { k: 'down', a: 'fire', s: 70000 & 0xffff });
assert.equal(readPadCtl('{"k":"down","a":"leaveBattle","s":1}'), null, 'only the phone\'s hold actions');
assert.equal(readPadCtl('{"k":"tap","a":"settingsMenu"}'), null, 'only the phone\'s tap actions');
assert.equal(readPadCtl('{"k":"down","a":"fire"}'), null, 'a hold names its seq');

// the controls guide's picture of the phone: the game screen draws it, so it crosses the wire whole or not at all, and
// it fits one relay payload (a longer one is invalid to the actor and would end the pairing). The reader checks its
// shape; the desktop decodes it (padDesk.ts), so the decoder never rides to a phone.
{
  const layout = { w: 812, h: 366, parts: [['key', 400, 0, 48, 48], ['fire', 700, 250, 104, 104]],
    stops: [['fire', 700, 250, 104, 104, 752, 302, 1, 0], ['aim', 500, 60, 300, 300, 650, 80, 2, 1]] };
  const l = encodePadTour(layout);
  assert.deepEqual(decodePadTour(l), layout, 'the picture round-trips');
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: true, l })), { k: 'tour', on: true, l });
  assert.deepEqual(readPadCtl('{"k":"tour","on":false}'), { k: 'tour', on: false }, 'an ending carries no picture');
  assert.equal(readPadCtl(JSON.stringify({ k: 'tour', on: true, l: 'AAAA' })), null, 'shorter than the smallest picture');
  assert.equal(readPadCtl(JSON.stringify({ k: 'tour', on: true, l: `${l.slice(0, -4)}<b>` })), null, 'not base64');
  assert.equal(readPadCtl(JSON.stringify({ k: 'tour', on: true, l: 'A'.repeat(432) })), null, 'longer than the largest picture');
  assert.equal(readPadCtl('{"k":"tour"}'), null);
  const bytes = Uint8Array.from(atob(l), (c) => c.charCodeAt(0));
  const tampered = (at, value) => { const copy = bytes.slice(); copy[at] = value; return btoa(String.fromCharCode(...copy)); };
  assert.equal(decodePadTour(tampered(0, 2)), null, 'an unknown version');
  assert.equal(decodePadTour(tampered(6, 99)), null, 'an unknown part');
  assert.equal(decodePadTour(btoa(String.fromCharCode(...bytes.slice(0, -1)))), null, 'a cut picture');
  assert.equal(decodePadTour(encodePadTour({ ...layout, w: 0 })), null, 'an empty frame');
  assert.deepEqual(decodePadTour(encodePadTour({ ...layout, parts: [['key', -3, 70000, 1.6, 2]] })).parts, [['key', 0, 65535, 2, 2]],
    'boxes clamp to whole uint16 px');
  // the largest picture (every part a panel may carry, every stop, big numbers) in its relay envelope fits the payload
  const parts = Array.from({ length: PAD_TOUR_MAX_PARTS + 5 }, (_, i) => [PAD_TOUR_PARTS[i % PAD_TOUR_PARTS.length], 60000, 60000, 60000, 60000]);
  const stops = PAD_TOUR_STOPS.map((stop) => [stop, 60000, 60000, 60000, 60000, 60000, 60000, 2, 2]);
  const big = `${PAD_RELAY_CTL}${JSON.stringify({ k: 'tour', on: true, l: encodePadTour({ w: 2732, h: 2048, parts, stops }) })}`;
  assert.ok(big.length <= PAD_RELAY_DATA_MAX, `the biggest picture fits one relay payload (${big.length} of ${PAD_RELAY_DATA_MAX})`);
  assert.equal(decodePadTour(encodePadTour({ w: 2732, h: 2048, parts, stops })).parts.length, PAD_TOUR_MAX_PARTS, 'past the cap, parts are left out');
  const biggest = encodePadTour({ w: 2732, h: 2048, parts, stops });
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: true, l: biggest })), { k: 'tour', on: true, l: biggest }, 'the reader takes the largest picture');
}
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

console.log('padProtocol: PASS — routes, readers, the guide\'s picture, lobby seats, the 24-byte axes frame, relay text, page address, service URL');
