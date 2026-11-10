// The phone controller's pairing rules (docs/PHONE-CONTROLLER.md "Pairing"): a code expires, joins once, a wrong code
// learns nothing, resume tokens bring either side back (replacing its old socket), and the signal, ICE and relay limits
// hold. The actor is runtime-neutral; the Durable Object and the LAN helper host this same code.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { PadActor } from './padActor.ts';
import {
  PAD_CODE_TTL_MS, PAD_DESKTOP_GRACE_MS, PAD_ICE_LIMIT, PAD_ICE_WINDOW_MS, PAD_LOBBY_JOIN_MS, PAD_LOBBY_SEATS, PAD_PAIR_MAX_MS, PAD_RELAY_BUDGET,
  PAD_RELAY_HZ, PAD_SIGNAL_LIMIT, drawPadCode, normalizePadCode,
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
  assert.equal(h.actor.exportState().seats[0].socket, 'p1', 'the first phone keeps the seat');

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
  assert.equal(h.actor.exportState().seats[0].socket, 'p1d');

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
  const spent = h.actor.exportState();
  h.actor.restore({ ...spent, seats: spent.seats.map((seat) => ({ ...seat, relayUsed: PAD_RELAY_BUDGET - 1 })) });
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

// --- a version-1 state (before lobbies) restores as the same pairing, its phone in seat 1 ---------------------------
{
  const h = harness();
  h.actor.restore({ version: 1, code: 'K7Q4MZ', phase: 'paired', createdAt: h.now, expiresAt: h.now + PAD_PAIR_MAX_MS,
    desktopToken: 'd-hash', phoneToken: 'p-hash', desktopSocket: 'd1', phoneSocket: 'p1', desktopAwaySince: null, relayUsed: 7 });
  h.actor.attachSocket({ id: 'd1', role: 'desktop' });
  h.actor.attachSocket({ id: 'p1', role: 'phone' });
  h.msg('p1', { t: 'signal', kind: 'offer', sdp: 'v1' });
  assert.deepEqual(h.last('d1'), { t: 'signal', kind: 'offer', sdp: 'v1' }, 'a woken version-1 pairing relays as before');
  assert.deepEqual(h.actor.exportState().seats, [{ seat: 1, token: 'p-hash', socket: 'p1', relayUsed: 7 }]);
  assert.equal(h.actor.socketCap, 3, 'a pairing holds the desktop, its phone and one resuming');
}

// --- a pairing's desktop has no lobby messages ----------------------------------------------------------------------
{
  const h = harness();
  h.actor.openDesktop('d1');
  h.actor.openJoin('p1');
  h.msg('d1', { t: 'kick', seat: 1 });
  assert.deepEqual(h.last('d1'), { t: 'end', reason: 'invalid' }, 'kick is a lobby message');
  assert.equal(h.actor.exportState().seats.length, 1, 'the phone keeps its seat');
}

// --- a couch lobby (docs/COUCH-MODE.md): one code, up to PAD_LOBBY_SEATS numbered seats -------------------------------
{
  const h = harness();
  assert.equal(h.actor.openLobby('d1'), true, 'a vacant code takes a lobby');
  const [code, opened] = h.to('d1');
  assert.equal(code.t, 'code');
  assert.equal(code.expiresAt, h.now + PAD_LOBBY_JOIN_MS, 'the code shows the join window');
  assert.deepEqual(opened, { t: 'lobby', open: true, until: h.now + PAD_LOBBY_JOIN_MS, seats: 0 });
  assert.equal(h.actor.socketCap, 1 + PAD_LOBBY_SEATS + 2, 'the desktop, every seat and two resuming');
  assert.equal(h.actor.openLobby('d2'), false, 'a held code refuses another desktop');
  const tokens = [];
  for (let seat = 1; seat <= PAD_LOBBY_SEATS; seat++) {
    h.actor.openJoin(`p${seat}`);
    const joined = h.to(`p${seat}`)[0];
    assert.equal(joined.seat, seat, 'each phone takes the next seat');
    assert.deepEqual(h.to(`p${seat}`)[1], { t: 'peer', state: 'here' });
    assert.deepEqual(h.last('d1'), { t: 'seat', seat, state: 'here' }, 'the desktop hears each seat arrive');
    tokens.push(joined.token);
  }
  assert.ok(!JSON.stringify(h.actor.exportState()).includes(tokens[0]), 'seat tokens are never stored raw');
  h.actor.openJoin('p9');
  assert.deepEqual(h.last('p9'), { t: 'end', reason: 'full' }, 'a full lobby says so');

  // signals and relay frames name the seat on the desktop's side, and reach only that phone
  h.msg('p3', { t: 'signal', kind: 'offer', sdp: 'o3' });
  assert.deepEqual(h.last('d1'), { t: 'signal', kind: 'offer', sdp: 'o3', seat: 3 });
  h.msg('d1', { t: 'signal', kind: 'answer', sdp: 'a3', seat: 3 });
  assert.deepEqual(h.last('p3'), { t: 'signal', kind: 'answer', sdp: 'a3' });
  assert.ok(!h.to('p4').some((m) => m.t === 'signal'), 'no other phone hears it');
  h.msg('d1', { t: 'signal', kind: 'answer', sdp: 'nowhere' });
  assert.deepEqual(h.last('d1'), { t: 'error', code: 'not_paired' }, "a lobby's desktop names the seat");
  for (let i = 0; i < PAD_SIGNAL_LIMIT + 5; i++) h.msg('d1', { t: 'signal', kind: 'candidate', candidate: { i }, seat: 1 + (i % 8) });
  assert.ok(!h.to('d1').some((m) => m.t === 'error' && m.code === 'rate_limit'), "the desktop's signal window covers every seat");
  h.msg('p2', { t: 'relay', data: 'a' });
  assert.deepEqual(h.last('d1'), { t: 'relay', data: 'a', seat: 2 });
  h.msg('d1', { t: 'relay', data: 'c', seat: 2 });
  assert.deepEqual(h.last('p2'), { t: 'relay', data: 'c' });

  // a phone sleeps and resumes into its own seat
  h.actor.handleClose('p5');
  assert.deepEqual(h.last('d1'), { t: 'seat', seat: 5, state: 'away' });
  h.actor.openResume('p5b');
  h.msg('p5b', { t: 'resume', token: tokens[4] });
  assert.deepEqual(h.to('p5b').slice(0, 2), [{ t: 'resumed' }, { t: 'peer', state: 'here' }]);
  assert.deepEqual(h.last('d1'), { t: 'seat', seat: 5, state: 'here' });

  // a phone that leaves frees only its seat, and the next phone takes that number
  h.msg('p6', { t: 'end' });
  assert.deepEqual(h.last('p6'), { t: 'end', reason: 'ended' });
  assert.deepEqual(h.last('d1'), { t: 'seat', seat: 6, state: 'gone' });
  assert.equal(h.actor.phase, 'paired', 'the lobby holds');
  h.actor.openJoin('p6b');
  assert.equal(h.to('p6b')[0].seat, 6, 'a freed seat number is taken again');

  // the desktop lets a seat go: the phone is told, and its token no longer resumes
  h.msg('d1', { t: 'kick', seat: 7 });
  assert.deepEqual(h.last('p7'), { t: 'end', reason: 'removed' });
  assert.deepEqual(h.last('d1'), { t: 'seat', seat: 7, state: 'gone' });
  h.actor.openResume('p7b');
  h.msg('p7b', { t: 'resume', token: tokens[6] });
  assert.deepEqual(h.last('p7b'), { t: 'end', reason: 'unknown' }, 'a removed seat cannot resume');

  // a closed lobby refuses joins as unknown and keeps its seats; reopened, it admits again
  h.msg('d1', { t: 'lobby', open: false });
  assert.deepEqual(h.last('d1'), { t: 'lobby', open: false, until: null, seats: 7 });
  h.actor.openJoin('late');
  assert.deepEqual(h.last('late'), { t: 'end', reason: 'unknown' }, 'a closed lobby looks like nothing');
  h.msg('d1', { t: 'lobby', open: true });
  assert.deepEqual(h.last('d1'), { t: 'lobby', open: true, until: h.now + PAD_LOBBY_JOIN_MS, seats: 7 });
  h.actor.openJoin('late2');
  assert.equal(h.to('late2')[0].seat, 7);

  // the desktop blinks: every phone hears it; on its resume it learns the window and every seat
  h.actor.handleClose('d1');
  for (const phone of ['p1', 'p8', 'late2']) assert.deepEqual(h.last(phone), { t: 'peer', state: 'away' });
  assert.equal(h.deadline, h.now + PAD_DESKTOP_GRACE_MS, 'a lobby desktop away is given its grace');
  h.actor.openResume('d2');
  h.msg('d2', { t: 'resume', token: code.token });
  const back = h.to('d2');
  assert.deepEqual(back[0], { t: 'resumed' });
  assert.deepEqual(back[1], { t: 'lobby', open: true, until: h.actor.exportState().joinUntil, seats: 8 });
  assert.deepEqual(back.slice(2).map((m) => m.seat), [1, 2, 3, 4, 5, 6, 7, 8], 'each seat, in order');
  assert.deepEqual(h.last('p1'), { t: 'peer', state: 'here' });

  // the desktop's end ends every seat
  h.msg('d2', { t: 'end' });
  for (const phone of ['p1', 'p8', 'late2', 'p6b']) assert.deepEqual(h.last(phone), { t: 'end', reason: 'ended' });
  assert.equal(h.actor.exportState(), null);
}

// --- a lobby's join window and its per-seat relay budget -----------------------------------------------------------
{
  const empty = harness();
  empty.actor.openLobby('d1');
  assert.equal(empty.deadline, empty.now + PAD_LOBBY_JOIN_MS);
  empty.advance(PAD_LOBBY_JOIN_MS);
  empty.actor.tick();
  assert.deepEqual(empty.last('d1'), { t: 'end', reason: 'expired' }, 'a lobby nobody joined expires');
  const left = harness();
  left.actor.openLobby('d1');
  left.actor.handleClose('d1');
  assert.equal(left.actor.exportState(), null, 'a lobby with no seat whose desktop left is forgotten at once');

  const h = harness();
  h.actor.openLobby('d1');
  h.actor.openJoin('p1');
  h.actor.openJoin('p2');
  h.advance(PAD_LOBBY_JOIN_MS);
  h.actor.tick();
  assert.deepEqual(h.last('d1'), { t: 'lobby', open: false, until: null, seats: 2 }, 'a lobby with seats stops admitting');
  assert.equal(h.actor.phase, 'paired');
  h.actor.openJoin('p3');
  assert.deepEqual(h.last('p3'), { t: 'end', reason: 'unknown' });
  assert.equal(h.deadline, h.actor.exportState().createdAt + PAD_PAIR_MAX_MS, 'a lobby lives at most PAD_PAIR_MAX_MS');

  const state = h.actor.exportState();
  h.actor.restore({ ...state, seats: state.seats.map((seat) => (seat.seat === 1 ? { ...seat, relayUsed: PAD_RELAY_BUDGET - 1 } : seat)) });
  h.advance(1000);
  h.msg('p1', { t: 'relay', data: 'last' });
  h.msg('p1', { t: 'relay', data: 'over' });
  assert.equal(h.to('d1').filter((m) => m.t === 'relay').at(-1).data, 'last');
  assert.deepEqual(h.last('p1'), { t: 'relay_spent' });
  assert.deepEqual(h.last('d1'), { t: 'relay_spent', seat: 1 }, 'the desktop hears which seat spent its relay');
  h.msg('p2', { t: 'relay', data: 'still' });
  assert.deepEqual(h.last('d1'), { t: 'relay', data: 'still', seat: 2 }, "one seat's spent relay leaves the others theirs");
  for (let i = 0; i < 30; i++) { h.msg('d1', { t: 'relay', data: `x${i}`, seat: 2 }); }
  assert.equal(h.to('p2').filter((m) => m.t === 'relay').length, PAD_RELAY_HZ + 5, "the desktop's relay rate is per seat");
  h.msg('p2', { t: 'kick', seat: 1 });
  assert.deepEqual(h.last('p2'), { t: 'end', reason: 'invalid' }, 'a phone cannot let a seat go');
  assert.equal(h.actor.exportState().seats.length, 2);
}

// --- ICE grants (272): only to a paired peer, counted per side and seat across sockets ------------------------------
{
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  // (a) a lobby's desktop with no phone joined has no peer to reach: no relay credentials
  const empty = harness();
  empty.actor.openLobby('d1');
  empty.msg('d1', { t: 'ice' });
  await flush();
  assert.deepEqual(empty.last('d1'), { t: 'error', code: 'not_paired' }, 'an empty lobby is not granted ICE');
  assert.equal(empty.iceCalls, 0);

  // (b) a phone's window survives its socket: three grants, a resume on a new socket, and the fourth is refused
  const h = harness();
  h.actor.openDesktop('d1');
  h.actor.openJoin('p1');
  const { token } = h.to('p1').find((m) => m.t === 'joined');
  for (let i = 0; i < PAD_ICE_LIMIT; i++) h.msg('p1', { t: 'ice' });
  await flush();
  assert.equal(h.iceCalls, PAD_ICE_LIMIT);
  h.actor.handleClose('p1');
  h.actor.openResume('p1b');
  h.msg('p1b', { t: 'resume', token });
  h.msg('p1b', { t: 'ice' });
  await flush();
  assert.deepEqual(h.last('p1b'), { t: 'error', code: 'rate_limit' }, 'a resumed phone keeps its seat\'s ICE window');
  assert.equal(h.iceCalls, PAD_ICE_LIMIT);
  // the window is durable: a host that restores the stored state still counts it
  const stored = h.actor.exportState();
  const again = harness();
  again.actor.restore(stored);
  again.actor.attachSocket({ id: 'p1c', role: 'phone', seat: 1 });
  again.msg('p1c', { t: 'ice' });
  await flush();
  assert.deepEqual(again.last('p1c'), { t: 'error', code: 'rate_limit' }, 'the window survives a restore');
  // control: the desktop of a paired one-phone session keeps its own three grants
  for (let i = 0; i < PAD_ICE_LIMIT; i++) h.msg('d1', { t: 'ice' });
  h.msg('d1', { t: 'ice' });
  await flush();
  assert.equal(h.iceCalls, 2 * PAD_ICE_LIMIT, 'each side of a pairing has PAD_ICE_LIMIT grants');
  assert.ok(h.to('d1').some((m) => m.t === 'error' && m.code === 'rate_limit'));
  // a new window opens after PAD_ICE_WINDOW_MS
  h.advance(PAD_ICE_WINDOW_MS);
  h.msg('p1b', { t: 'ice' });
  await flush();
  assert.equal(h.iceCalls, 2 * PAD_ICE_LIMIT + 1, 'the window reopens');

  // (c) a lobby's desktop: PAD_ICE_LIMIT per phone actually joined, not per seat the lobby could hold
  const lobby = harness();
  lobby.actor.openLobby('d1');
  lobby.actor.openJoin('p1');
  lobby.actor.openJoin('p2');
  for (let i = 0; i < PAD_ICE_LIMIT * 2 + 1; i++) lobby.msg('d1', { t: 'ice' });
  await flush();
  assert.equal(lobby.iceCalls, PAD_ICE_LIMIT * 2, 'two phones joined: twice PAD_ICE_LIMIT grants');
  assert.ok(lobby.to('d1').some((m) => m.t === 'error' && m.code === 'rate_limit'));
  // the desktop's window is not reset by its socket either
  lobby.actor.handleClose('d1');
  lobby.actor.openResume('d1b');
  lobby.msg('d1b', { t: 'resume', token: lobby.to('d1').find((m) => m.t === 'code').token });
  lobby.msg('d1b', { t: 'ice' });
  await flush();
  assert.equal(lobby.iceCalls, PAD_ICE_LIMIT * 2, 'a resumed desktop keeps its window');
}

console.log('padActor: PASS — codes expire, join once, wrong codes refused, resume and replace, limits and relay budget hold; lobbies seat eight, per-seat signals, relay and resume, leave, remove, close and reopen');
