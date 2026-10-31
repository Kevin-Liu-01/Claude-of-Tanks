// The phone controller's pairing rules (docs/PHONE-CONTROLLER.md "Pairing"): a code expires, joins once, a wrong code
// learns nothing, resume tokens bring either side back (replacing its old socket), and the signal, ICE and relay limits
// hold. The actor is runtime-neutral; the Durable Object and the LAN helper host this same code.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { PadActor } from './padActor.ts';
import {
  PAD_CODE_TTL_MS, PAD_DESKTOP_GRACE_MS, PAD_ICE_LIMIT, PAD_PAIR_MAX_MS, PAD_RELAY_BUDGET, PAD_RELAY_HZ, PAD_SIGNAL_LIMIT,
  drawPadCode, normalizePadCode,
} from './padProtocol.ts';

function harness(code = 'K7Q4MZ') {
  let now = 1_000_000;
  const sent = [];
  const closed = [];
  let deadline = null;
  let persisted = 0;
  let iceCalls = 0;
  const actor = new PadActor(code, {
    now: () => now,
    randomToken: () => randomBytes(16).toString('base64url'),
    sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
    send: (socketId, message) => sent.push({ socketId, message }),
    close: (socketId, reason) => closed.push({ socketId, reason }),
    schedule: (at) => { deadline = at; },
    persist: () => { persisted++; },
    iceServers: async () => { iceCalls++; return { iceServers: [{ urls: 'stun:stun.example.test:3478' }], relay: false }; },
  });
  const to = (socketId) => sent.filter((entry) => entry.socketId === socketId).map((entry) => entry.message);
  const last = (socketId) => to(socketId).at(-1);
  return {
    actor, sent, closed, to, last,
    advance: (ms) => { now += ms; },
    get now() { return now; },
    get deadline() { return deadline; },
    get persisted() { return persisted; },
    get iceCalls() { return iceCalls; },
    msg: (socketId, value) => actor.handleMessage(socketId, JSON.stringify(value)),
  };
}

// --- a code: drawn from the alphabet, normalized, expires, single use ---------------------------------------------
{
  let seed = 0;
  const code = drawPadCode(() => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/, 'a drawn code uses the look-alike-free alphabet');
  assert.equal(normalizePadCode(' k7q-4mz '), 'K7Q4MZ', 'typed codes fold case and separators');
  assert.equal(normalizePadCode('K7Q4M0'), null, 'a symbol outside the alphabet is refused (no 0, O, 1, I, L)');
  assert.equal(normalizePadCode('K7Q4M'), null, 'a short code is refused');
}

{
  const h = harness();
  assert.equal(h.actor.vacant, true);
  assert.equal(h.actor.openDesktop('d1'), true, 'a vacant code takes a desktop');
  const code = h.last('d1');
  assert.equal(code.t, 'code');
  assert.equal(code.code, 'K7Q4MZ');
  assert.equal(code.expiresAt, h.now + PAD_CODE_TTL_MS, 'the code lives PAD_CODE_TTL_MS');
  assert.equal(h.deadline, code.expiresAt, 'the host is asked to wake at the expiry');
  assert.equal(h.actor.openDesktop('d2'), false, 'a held code refuses a second desktop (the Worker draws again)');
  assert.ok(!JSON.stringify(h.actor.exportState()).includes(code.token), 'the resume token is never stored raw');

  // the code expires: the waiting desktop hears `expired`, the pairing is forgotten, a late phone is refused as unknown
  h.advance(PAD_CODE_TTL_MS);
  h.actor.tick();
  assert.deepEqual(h.last('d1'), { t: 'end', reason: 'expired' });
  assert.ok(h.closed.some((entry) => entry.socketId === 'd1' && entry.reason === 'expired'));
  assert.equal(h.actor.exportState(), null, 'an expired code holds nothing');
  h.actor.openJoin('p-late');
  assert.deepEqual(h.last('p-late'), { t: 'end', reason: 'unknown' }, 'a phone after the expiry is refused as unknown');
}

{
  const h = harness();
  h.actor.openDesktop('d1');
  h.advance(PAD_CODE_TTL_MS - 1);
  h.actor.openJoin('p1');
  const joined = h.to('p1')[0];
  assert.equal(joined.t, 'joined', 'a phone inside the TTL pairs');
  assert.deepEqual(h.last('p1'), { t: 'peer', state: 'here' });
  assert.deepEqual(h.last('d1'), { t: 'peer', state: 'here' }, 'the desktop hears the phone arrive');
  assert.equal(h.actor.phase, 'paired');
  assert.equal(h.deadline, h.actor.exportState().createdAt + PAD_PAIR_MAX_MS, 'a pairing lives at most PAD_PAIR_MAX_MS');

  // single use: a second phone with the same code is the same refusal as a wrong code
  h.actor.openJoin('p2');
  assert.deepEqual(h.last('p2'), { t: 'end', reason: 'unknown' }, 'a used code is refused as unknown');
  assert.equal(h.actor.exportState().phoneSocket, 'p1', 'the first phone keeps the seat');

  // a wrong code is a fresh actor with nothing held: unknown, nothing persisted, no deadline
  const wrong = harness('ABCDEF');
  wrong.actor.openJoin('px');
  assert.deepEqual(wrong.last('px'), { t: 'end', reason: 'unknown' }, 'a wrong code is refused as unknown');
  assert.equal(wrong.persisted, 0, 'a refused guess writes nothing');
  wrong.actor.openResume('py');
  assert.deepEqual(wrong.last('py'), { t: 'end', reason: 'unknown' }, 'a resume against nothing is refused at once');

  // signaling relays verbatim to the other side, never parsed
  h.msg('p1', { t: 'signal', kind: 'offer', sdp: 'v=0 offer' });
  assert.deepEqual(h.last('d1'), { t: 'signal', kind: 'offer', sdp: 'v=0 offer' });
  h.msg('d1', { t: 'signal', kind: 'candidate', candidate: { candidate: 'c', sdpMid: '0' } });
  assert.deepEqual(h.last('p1'), { t: 'signal', kind: 'candidate', candidate: { candidate: 'c', sdpMid: '0' } });

  // the phone sleeps: the desktop hears it leave; the phone resumes with its token (on a new socket) and is back
  h.actor.handleClose('p1');
  assert.deepEqual(h.last('d1'), { t: 'peer', state: 'away' });
  h.actor.openResume('p1b');
  h.msg('p1b', { t: 'resume', token: 'not-the-token-xxxxxxxx' });
  assert.deepEqual(h.last('p1b'), { t: 'end', reason: 'unknown' }, 'a wrong token is refused');
  h.actor.openResume('p1c');
  h.msg('p1c', { t: 'resume', token: joined.token });
  assert.deepEqual(h.to('p1c').slice(0, 2), [{ t: 'resumed' }, { t: 'peer', state: 'here' }]);
  assert.deepEqual(h.last('d1'), { t: 'peer', state: 'here' });

  // one phone per seat: resuming again from another socket replaces the live one
  h.actor.openResume('p1d');
  h.msg('p1d', { t: 'resume', token: joined.token });
  assert.deepEqual(h.last('p1c'), { t: 'end', reason: 'replaced' }, 'the older phone socket is replaced');
  assert.equal(h.actor.exportState().phoneSocket, 'p1d');

  // the desktop blinks and resumes inside its grace with its own token
  const desktopToken = h.to('d1')[0].token;
  h.actor.handleClose('d1');
  assert.deepEqual(h.last('p1d'), { t: 'peer', state: 'away' });
  assert.equal(h.deadline, h.now + PAD_DESKTOP_GRACE_MS, 'a desktop away is given its grace');
  h.advance(PAD_DESKTOP_GRACE_MS - 1000);
  h.actor.tick();
  assert.equal(h.actor.phase, 'paired', 'inside the grace the pairing holds');
  h.actor.openResume('d2');
  h.msg('d2', { t: 'resume', token: desktopToken });
  assert.deepEqual(h.to('d2')[0], { t: 'resumed' });
  assert.equal(h.actor.exportState().desktopAwaySince, null);

  // Disconnect from either side ends the pairing for both
  h.msg('p1d', { t: 'end' });
  assert.deepEqual(h.last('d2'), { t: 'end', reason: 'ended' });
  assert.deepEqual(h.last('p1d'), { t: 'end', reason: 'ended' });
  assert.equal(h.actor.exportState(), null, 'an ended pairing holds nothing');
}

// --- a desktop that never comes back ends the pairing; a desktop that leaves a waiting code ends it at once ---------
{
  const h = harness();
  h.actor.openDesktop('d1');
  h.actor.openJoin('p1');
  h.actor.handleClose('d1');
  h.advance(PAD_DESKTOP_GRACE_MS);
  h.actor.tick();
  assert.deepEqual(h.last('p1'), { t: 'end', reason: 'desktop_left' }, 'past the grace the phone is told');
  assert.equal(h.actor.exportState(), null);

  const w = harness();
  w.actor.openDesktop('d1');
  w.actor.handleClose('d1');
  assert.equal(w.actor.exportState(), null, 'a waiting code whose desktop left is forgotten at once');
}

// --- limits: signals, ICE grants, relay rate and budget, malformed frames -----------------------------------------
{
  const h = harness();
  h.actor.openDesktop('d1');
  h.msg('d1', { t: 'signal', kind: 'offer', sdp: 'x' });
  assert.deepEqual(h.last('d1'), { t: 'error', code: 'not_paired' }, 'no signal before a phone pairs');
  h.actor.openJoin('p1');
  for (let i = 0; i < PAD_SIGNAL_LIMIT; i++) h.msg('p1', { t: 'signal', kind: 'candidate', candidate: { i } });
  h.msg('p1', { t: 'signal', kind: 'candidate', candidate: { i: 'over' } });
  assert.deepEqual(h.last('p1'), { t: 'error', code: 'rate_limit' }, 'the signal window holds');
  assert.equal(h.to('d1').filter((m) => m.t === 'signal').length, PAD_SIGNAL_LIMIT);

  for (let i = 0; i < PAD_ICE_LIMIT + 1; i++) h.msg('p1', { t: 'ice' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.iceCalls, PAD_ICE_LIMIT, 'ICE grants are minted at most PAD_ICE_LIMIT times a window');
  assert.ok(h.to('p1').some((m) => m.t === 'error' && m.code === 'rate_limit'));
  assert.deepEqual(h.to('p1').filter((m) => m.t === 'ice')[0], { t: 'ice', iceServers: [{ urls: 'stun:stun.example.test:3478' }], relay: false });

  // the relay: at most PAD_RELAY_HZ + 5 a second per side (ctl room), counted against the pairing's budget
  for (let i = 0; i < 40; i++) h.msg('p1', { t: 'relay', data: `a${i}` });
  assert.equal(h.to('d1').filter((m) => m.t === 'relay').length, PAD_RELAY_HZ + 5, 'excess relay frames in one second are dropped');
  h.actor.restore({ ...h.actor.exportState(), relayUsed: PAD_RELAY_BUDGET - 1 });
  h.advance(1000);
  h.msg('p1', { t: 'relay', data: 'last' });
  h.msg('p1', { t: 'relay', data: 'over' });
  assert.equal(h.to('d1').filter((m) => m.t === 'relay').at(-1).data, 'last', 'the last budgeted frame passes');
  assert.ok(h.to('p1').some((m) => m.t === 'relay_spent') && h.to('d1').some((m) => m.t === 'relay_spent'), 'both sides hear the budget is spent');

  // a malformed frame drops that socket (it may resume), never the pairing
  h.actor.handleMessage('p1', '{"t":"signal","kind":"bogus"}');
  assert.deepEqual(h.last('p1'), { t: 'end', reason: 'invalid' });
  assert.equal(h.actor.phase, 'paired', 'a bad frame does not end the pairing');
  assert.deepEqual(h.last('d1'), { t: 'peer', state: 'away' });
  h.actor.handleMessage('d1', 'x'.repeat(9000));
  assert.deepEqual(h.last('d1'), { t: 'end', reason: 'invalid' }, 'an oversized frame is invalid');
}

// --- persistence: a hibernated host restores the pairing and its sockets ---------------------------------------
{
  const h = harness();
  h.actor.openDesktop('d1');
  h.actor.openJoin('p1');
  const saved = h.actor.exportState();
  const again = harness();
  again.actor.restore(saved);
  again.actor.attachSocket({ id: 'd1', role: 'desktop' });
  again.actor.attachSocket({ id: 'p1', role: 'phone' });
  again.msg('p1', { t: 'signal', kind: 'offer', sdp: 'after-wake' });
  assert.deepEqual(again.last('d1'), { t: 'signal', kind: 'offer', sdp: 'after-wake' }, 'a woken host relays as before');
  const other = harness('ZZZZZZ');
  other.actor.restore(saved);
  assert.equal(other.actor.exportState(), null, 'a state for another code is not restored');
}

console.log('padActor: PASS — codes expire, join once, wrong codes refused, resume and replace, limits and relay budget hold');
