// The phone's gun-loaded buzz and seat label (round 8 Y5 s3-06; docs/PHONE-CONTROLLER.md "Controls"). The buzz is one
// declared machine (src/pad/padReadyBuzz.ts): idle, loading (its timer armed for the load the status names) or paused (a
// long load waits for its end, no timer). A paused battle freezes the desktop's reload, while the receiver still sends
// a status every 2 s, so a timer re-armed from a paused status buzzed 'ready' every two seconds of the pause, and a
// pairing that ended mid-load buzzed afterwards. The seat label is the link's: a new pairing starts without a seat, and
// a lobby phone that resumes hears its seat again. Driven on a virtual clock; the seat cases drive the real padLink.
import assert from 'node:assert/strict';
// (a namespace import: the committed extraction of today's rule lacks the declared states, and must fail on its buzzes)
import * as readyBuzz from './padReadyBuzz.ts';
import { createPadLink } from './padLink.ts';

/** The buzz on a virtual clock: timers fire only when the test advances time. */
function harness() {
  let now = 0;
  let nextId = 1;
  let fireHeld = false;
  const timers = new Map();
  const buzzes = [];
  const ready = readyBuzz.createPadReadyBuzz({
    buzz: () => buzzes.push(now),
    fireHeld: () => fireHeld,
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = end;
  };
  return {
    ready, buzzes, advance,
    get now() { return now; },
    get armed() { return timers.size; },
    hold: (held) => { fireHeld = held; },
  };
}
const status = (reloadS, { totalS = 3, paused = false, alive = true, battle = true } = {}) => ({
  battle, alive, paused, sniper: false, slot: 0, shells: [], reloadS, reloadTotalS: reloadS > 0 ? totalS : 0,
});

// ---- a paused battle: the reload is frozen, the receiver's 2 s heartbeat keeps coming --------------------------------
{
  const h = harness();
  h.ready.status(status(1.2));
  for (let at = 0; at < 10_000; at += 2000) {
    h.ready.status(status(1.2, { paused: true }));
    h.advance(2000);
  }
  assert.equal(h.buzzes.length, 0, `a paused battle's frozen reload buzzes 'ready' ${h.buzzes.length} times in 10 s (the gun is not loaded)`);
  // the battle resumes and the gun loaded during the pause (a network gun's load runs on): it is announced once
  h.ready.status(status(0));
  assert.equal(h.buzzes.length, 1, 'the resume that says loaded announces it once');
  h.ready.status(status(0));
  h.advance(5000);
  assert.equal(h.buzzes.length, 1, 'and only once');
}
{
  // the battle resumes with the load still running: the timer runs from the resume's time left
  const h = harness();
  h.ready.status(status(2.5));
  h.advance(1000);
  h.ready.status(status(1.5, { paused: true }));
  h.advance(30_000);
  assert.equal(h.buzzes.length, 0, 'nothing through a long pause');
  h.ready.status(status(1.5));
  h.advance(1499);
  assert.equal(h.buzzes.length, 0);
  h.advance(1);
  assert.deepEqual(h.buzzes, [32_500], 'the load ends 1.5 s after the resume: one buzz there');
}

// ---- a pairing that ends, or a link that leaves live, mid-load --------------------------------------------------------
for (const kind of ['ended', 'away', 'linking', 'connecting']) {
  const h = harness();
  h.ready.status(status(2));
  h.ready.link?.(kind);
  h.advance(5000);
  assert.equal(h.buzzes.length, 0, `a link that goes ${kind} mid-load buzzes nothing afterwards`);
  assert.equal(h.armed, 0, `no timer outlives a link gone ${kind}`);
}
{
  // a link still live keeps the load
  const h = harness();
  h.ready.status(status(2));
  h.ready.link?.('live');
  h.advance(2000);
  assert.equal(h.buzzes.length, 1, 'a live link keeps its timer');
}

// ---- today's rule, kept: one buzz at the end of a long load, none for a short one, none with the trigger held ---------
{
  const h = harness();
  // the receiver's status as the load runs (each re-arms the timer with the time left), then loaded
  h.ready.status(status(3));
  h.advance(1000);
  h.ready.status(status(2));
  h.advance(1000);
  h.ready.status(status(1));
  h.advance(1000);
  assert.deepEqual(h.buzzes, [3000], 'a long load buzzes once, when it ends');
  h.ready.status(status(0));
  assert.equal(h.buzzes.length, 1, 'the loaded status after the buzz adds none');

  // a status that says loaded before the timer: one buzz there, the timer gone
  h.ready.status(status(2));
  h.advance(500);
  h.ready.status(status(0));
  assert.equal(h.buzzes.length, 2, 'loaded early: announced at that status');
  h.advance(5000);
  assert.equal(h.buzzes.length, 2, 'the timer it beat is gone');

  // a load shorter than READY_MIN_S is not announced (an autocannon's round to round)
  h.ready.status(status(readyBuzz.READY_MIN_S - 0.1, { totalS: readyBuzz.READY_MIN_S - 0.1 }));
  h.advance(5000);
  h.ready.status(status(0));
  assert.equal(h.buzzes.length, 2, 'a short load is never announced');

  // the trigger held at the end of the load: the shot's own kick follows, the loaded buzz stays quiet
  h.ready.status(status(2));
  h.hold(true);
  h.advance(2000);
  h.hold(false);
  assert.equal(h.buzzes.length, 2, 'no loaded buzz under a held trigger');

  // a destroyed tank or the battle's end drops the load
  h.ready.status(status(2));
  h.ready.status(status(2, { alive: false }));
  h.advance(5000);
  h.ready.status(status(2));
  h.ready.status(status(0, { battle: false }));
  h.advance(5000);
  assert.equal(h.buzzes.length, 2, 'a load the tank or the battle left is never announced');
}

// ---- the machine: its states, and each event's move ------------------------------------------------------------------
assert.deepEqual(readyBuzz.PAD_READY_STATES, ['idle', 'loading', 'paused']);
{
  const LONG = status(2);
  const PAUSED_LONG = status(2, { paused: true });
  const LOADED = status(0);
  const PAUSED_LOADED = status(0, { paused: true });
  const SHORT = status(1, { totalS: 1 });
  const DOWN = status(2, { alive: false });
  /** Put a fresh buzz in `state` by the real path. */
  const at = (state) => {
    const h = harness();
    if (state === 'loading') h.ready.status(LONG);
    if (state === 'paused') h.ready.status(PAUSED_LONG);
    assert.equal(h.ready.state, state);
    return h;
  };
  // [from, event, to, buzzes]
  const table = [
    ['idle', LONG, 'loading', 0], ['idle', PAUSED_LONG, 'paused', 0], ['idle', LOADED, 'idle', 0], ['idle', PAUSED_LOADED, 'idle', 0],
    ['idle', SHORT, 'idle', 0], ['idle', DOWN, 'idle', 0], ['idle', 'away', 'idle', 0],
    ['loading', LONG, 'loading', 0], ['loading', PAUSED_LONG, 'paused', 0], ['loading', LOADED, 'idle', 1],
    ['loading', PAUSED_LOADED, 'paused', 0], ['loading', SHORT, 'idle', 0], ['loading', DOWN, 'idle', 0], ['loading', 'ended', 'idle', 0],
    ['loading', 'timer', 'idle', 1],
    ['paused', LONG, 'loading', 0], ['paused', PAUSED_LONG, 'paused', 0], ['paused', LOADED, 'idle', 1],
    ['paused', PAUSED_LOADED, 'paused', 0], ['paused', SHORT, 'idle', 0], ['paused', DOWN, 'idle', 0], ['paused', 'away', 'idle', 0],
    ['paused', 'timer', 'paused', 0],
  ];
  for (const [from, event, to, buzzes] of table) {
    const h = at(from);
    const label = typeof event === 'string' ? event : JSON.stringify({ reloadS: event.reloadS, paused: event.paused, alive: event.alive });
    if (event === 'timer') h.advance(60_000);
    else if (typeof event === 'string') h.ready.link(event);
    else h.ready.status(event);
    assert.equal(h.ready.state, to, `${from} --${label}--> ${to}`);
    assert.equal(h.buzzes.length, buzzes, `${from} --${label}--> ${buzzes} buzz`);
    assert.equal(h.armed, to === 'loading' ? 1 : 0, `${from} --${label}--> a timer only while loading`);
  }
}

// ---- the seat label is the link's: a new pairing starts with none, a resumed lobby seat hears its own -----------------
{
  /** A socket stand-in the link drives: the test opens it and speaks for the pairing. */
  const fakeSocket = () => {
    const listeners = { open: [], message: [], close: [] };
    const socket = {
      readyState: 0, sent: [],
      addEventListener: (type, listener) => listeners[type].push(listener),
      send: (text) => socket.sent.push(text),
      close: () => { if (socket.readyState === 3) return; socket.readyState = 3; for (const listener of listeners.close) listener({}); },
      open: () => { socket.readyState = 1; for (const listener of listeners.open) listener({}); },
      host: (message) => { for (const listener of listeners.message) listener({ data: JSON.stringify(message) }); },
    };
    return socket;
  };
  const noRtc = () => { throw new Error('no WebRTC here'); };
  const phone = (route) => {
    const socket = fakeSocket();
    const seats = [];
    const link = createPadLink({ role: 'phone', serviceUrl: 'ws://pad.test', ...route, createSocket: () => socket, createPeer: noRtc,
      onState: () => {}, onSeat: (seat) => seats.push(seat) });
    socket.open();
    return { link, socket, seats };
  };
  const token = 'tok-0123456789abcdef';
  // a couch lobby seats this phone as 3, then the lobby ends
  const lobby = phone({ code: 'K7Q4MZ' });
  lobby.socket.host({ t: 'joined', token, seat: 3 });
  assert.equal(lobby.link.seat, 3, 'a lobby phone holds its seat');
  lobby.socket.host({ t: 'end', reason: 'ended' });
  assert.equal(lobby.link.state.kind, 'ended');
  // Pair again on the same page: a single pairing's join names no seat, and the label shows none
  const single = phone({ code: 'ABCDEF' });
  single.socket.host({ t: 'joined', token });
  assert.equal(single.link.seat, 0, "a new pairing never shows the last one's seat");
  single.link.dispose();
  // a lobby phone that reloads resumes its seat and hears its number again
  const back = phone({ resume: { code: 'K7Q4MZ', token } });
  assert.deepEqual(back.socket.sent.map((text) => JSON.parse(text)), [{ t: 'resume', token }]);
  back.socket.host({ t: 'resumed', seat: 3 });
  assert.equal(back.link.seat, 3, 'a resumed lobby phone holds its seat again');
  assert.deepEqual(back.seats, [3], 'and is told it, as on its join');
  back.link.dispose();
  // a single pairing's resume names none
  const pairBack = phone({ resume: { code: 'ABCDEF', token } });
  pairBack.socket.host({ t: 'resumed' });
  assert.equal(pairBack.link.seat, 0);
  assert.deepEqual(pairBack.seats, []);
  pairBack.link.dispose();
}

console.log('padReadyBuzz.selftest: PASS — no loaded buzz through a pause or after the link leaves live, one at the resume or the load\'s end, today\'s rule kept, a declared machine; the seat label is the link\'s');
