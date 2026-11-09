// The couch lobby's away and resume, end to end in memory (round 8 Y5 s3-07, s3-08; docs/COUCH-MODE.md "The lobby"):
// the real desktop lobby (padLobby.ts, one receiver per seat) wired to the real pairing actor (padActor.ts) over an
// in-memory socket pair, on the actor's own clock. The TV's lobby socket blinks while phones sit and the lobby is asked
// to close (setOpen(false)) during the blink: after the resume inside the desktop's grace the actor's window is closed
// and the seats are kept (H0's padLobby dropped an ask its socket could not carry, so the window stayed open). No
// product press reaches setOpen(false) on this branch: Start calls only request.start (couchLobby.ts) and Reopen, the
// one product caller, is hidden while away; app-couch's Start (s3-09, couchRuntime.startBattle -> lobby.setOpen(false))
// is the press this queue serves once it lands, and the Y11 merge runs the two together. The reverse order: every phone
// has left when the TV blinks; the lobby resumes instead of ending (its code was on screen), and a seat that leaves
// while the TV is away leaves the desktop's grace in force and is let go on the TV once it is back (the resume's roll
// call), in an emptied lobby and in one whose other phones stay (here or asleep). Reopen is not offered while the
// lobby reconnects.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { PadActor } from './padActor.ts';
import * as padLobby from './padLobby.ts';
import * as couchLobby from '../ui/couchLobby.ts';
import { PAD_DESKTOP_GRACE_MS, PAD_LOBBY_JOIN_MS } from './padProtocol.ts';

// the receiver samples on the next animation frame (the latency readout); Node has none
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 16);

const later = (callback) => setTimeout(callback, 0);
const until = async (test, label, ms = 8000) => {
  const end = Date.now() + ms;
  while (!test()) { if (Date.now() > end) throw new Error(`timed out: ${label}`); await new Promise((r) => setTimeout(r, 5)); }
};
const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

/** One pairing host in memory: a PadActor for one code, and each client socket's server half. A frame crosses on the
 *  next turn, as on a network; a drop closes both halves. */
function memoryHost(code = 'K7Q4MZ') {
  let now = 1_000_000;
  let nextId = 0;
  const clients = new Map();
  const host = { deadline: null, resumes: 0, desktopId: null };
  const actor = new PadActor(code, {
    now: () => now,
    randomToken: () => randomBytes(16).toString('base64url'),
    sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
    send: (id, message) => { const client = clients.get(id); if (client) later(() => client.receive(JSON.stringify(message))); },
    close: (id) => { const client = clients.get(id); clients.delete(id); if (client) later(() => client.closedByHost()); },
    schedule: (at) => { host.deadline = at; },
    persist: () => {},
    iceServers: async () => ({ iceServers: [], relay: false }),
  });

  /** The client half: the WebSocket a link or the lobby drives. */
  class MemorySocket {
    readyState = 0;
    #listeners = { open: [], message: [], close: [] };
    constructor(url) {
      this.id = `s${++nextId}`;
      this.path = new URL(url).pathname;
      later(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        clients.set(this.id, this);
        this.#emit('open', {});
        if (this.path === '/pad/lobby') { host.desktopId = this.id; actor.openLobby(this.id); }
        else if (this.path.startsWith('/pad/join/')) actor.openJoin(this.id);
        else if (this.path.startsWith('/pad/resume/')) actor.openResume(this.id);
      });
    }
    addEventListener(type, listener) { this.#listeners[type].push(listener); }
    send(text) {
      if (this.readyState !== 1) throw new Error('send on a socket that is not open');
      if (text === 'ping') return;
      later(() => {
        if (!clients.has(this.id)) return;
        if (JSON.parse(text).t === 'resume') { host.resumes++; host.desktopId = this.id; }
        actor.handleMessage(this.id, text);
      });
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (clients.delete(this.id)) later(() => actor.handleClose(this.id));
      later(() => this.#emit('close', {}));
    }
    receive(text) { if (this.readyState === 1) this.#emit('message', { data: text }); }
    closedByHost() { if (this.readyState === 3) return; this.readyState = 3; this.#emit('close', {}); }
    #emit(type, event) { for (const listener of this.#listeners[type]) listener(event); }
  }

  /** A phone at the lobby's code: what it hears. */
  const phone = (lobbyCode) => {
    const socket = new MemorySocket(`ws://pad.memory/pad/join/${lobbyCode}`);
    const heard = [];
    socket.addEventListener('message', (event) => heard.push(JSON.parse(event.data)));
    return { socket, heard, send: (message) => socket.send(JSON.stringify(message)) };
  };
  /** The network drops the TV's lobby socket: both halves see it close. */
  const dropDesktop = () => {
    const client = clients.get(host.desktopId);
    clients.delete(host.desktopId);
    actor.handleClose(host.desktopId);
    client.closedByHost();
  };
  return Object.assign(host, {
    actor, phone, dropDesktop,
    createSocket: (url) => new MemorySocket(url),
    advance: (ms) => { now += ms; },
    get now() { return now; },
  });
}

/** A seat's ports: no battle (the lobby between battles). */
const seatPorts = () => ({
  input: { setVirtualMove() {}, addVirtualAim() {}, pressVirtual() {}, releaseVirtual() {}, tapVirtual() {} },
  source: () => null,
  togglePause() {},
});

/** Open a lobby on a fresh host with `phones` seated. */
async function lobbyWith(phones) {
  const host = memoryHost();
  const gone = [];
  const lobby = padLobby.startPadLobby('ws://pad.memory', { seat: seatPorts, seatGone: (seat) => gone.push(seat) }, { createSocket: host.createSocket });
  await until(() => lobby.view.state === 'open' && lobby.view.code, 'the lobby opens');
  const seated = [];
  for (let i = 0; i < phones; i++) seated.push(host.phone(lobby.view.code));
  await until(() => lobby.view.seats.length === phones, `${phones} seats`);
  return { host, lobby, seated, gone };
}

/** At the 'away' publish, the lobby is asked to close (setOpen(false), app-couch's Start) in the same turn, as a click
 *  would land. */
function closeWhenAway(lobby, also = () => {}) {
  const seen = { pressed: false, offered: null };
  lobby.subscribe((view) => {
    if (view.state !== 'away' || seen.pressed) return;
    seen.pressed = true;
    seen.offered = couchLobby.reopenOffered?.(view) ?? 'no reopenOffered';
    also();
    lobby.setOpen(false);
  });
  return seen;
}

// ---- seats held: the TV blinks, the lobby is closed while away, it resumes inside the grace --------------------------
{
  const { host, lobby } = await lobbyWith(2);
  const resumesBefore = host.resumes;
  // the blink lasts most of the desktop's grace on the host's clock (the join window still open)
  const seen = closeWhenAway(lobby, () => host.advance(PAD_DESKTOP_GRACE_MS - 60_000));
  host.dropDesktop();
  await until(() => seen.pressed, 'the lobby goes away');
  await until(() => lobby.view.state !== 'away', 'the lobby comes back (or ends)');
  await settle();
  assert.ok(host.resumes > resumesBefore, 'the TV resumed with its token');
  const state = host.actor.exportState();
  assert.ok(state, 'the lobby holds through the blink');
  assert.ok(host.now < state.createdAt + PAD_LOBBY_JOIN_MS, '(the window would still be open by itself)');
  assert.equal(state.joinUntil, null, 'a setOpen(false) asked while the TV was away closed the join window after the resume');
  assert.equal(lobby.view.state, 'closed', 'and the TV shows it closed');
  assert.deepEqual(state.seats.map((seat) => seat.seat), [1, 2], 'the seats are kept');
  assert.deepEqual(lobby.view.seats.map((seat) => seat.seat), [1, 2]);
  assert.equal(seen.offered, false, 'Reopen is not offered while the lobby reconnects');
  // once back, Reopen works at once
  assert.equal(couchLobby.reopenOffered(lobby.view), true, 'a closed lobby offers Reopen');
  lobby.setOpen(true);
  await until(() => lobby.view.state === 'open', 'Reopen opens the window');
  assert.ok(host.actor.exportState().joinUntil > host.now);
  lobby.end();
  await until(() => lobby.view.state === 'ended', 'the lobby ends');
}

// ---- the reverse order: every phone has left when the TV blinks ----------------------------------------------------
{
  const { host, lobby, seated } = await lobbyWith(1);
  seated[0].send({ t: 'end' });
  await until(() => lobby.view.seats.length === 0, 'the last seat leaves');
  const seen = closeWhenAway(lobby);
  host.dropDesktop();
  await until(() => seen.pressed, 'the lobby goes away');
  await until(() => lobby.view.state !== 'away', 'the lobby comes back (or ends)');
  await settle();
  assert.notEqual(lobby.view.state, 'ended', `a lobby whose phones all left resumes after a blink (it ended: ${lobby.view.reason})`);
  assert.ok(host.actor.exportState(), 'the host still holds it');
  assert.equal(host.actor.exportState().joinUntil, null, 'and a setOpen(false) asked while away closed its window');
  assert.equal(lobby.view.state, 'closed');
  lobby.end();
}

// ---- the TV goes away first, then the last seat leaves: the desktop's grace stands -----------------------------------
{
  const { host, lobby, seated, gone } = await lobbyWith(1);
  let awaySince = null;
  lobby.subscribe((view) => {
    if (view.state !== 'away' || awaySince !== null) return;
    awaySince = host.now;
    // the phone leaves while the TV is away
    seated[0].send({ t: 'end' });
  });
  host.dropDesktop();
  await until(() => awaySince !== null, 'the lobby goes away');
  await until(() => host.actor.exportState()?.seats.length === 0, 'the last seat leaves');
  assert.equal(host.deadline, awaySince + PAD_DESKTOP_GRACE_MS, "the host's next deadline is the desktop's grace, not the join window");
  await until(() => lobby.view.state !== 'away', 'the lobby comes back (or ends)');
  await settle();
  assert.equal(lobby.view.state, 'open', 'it resumes with its window');
  assert.deepEqual(lobby.view.seats, [], 'the seat whose phone left while the TV was away is let go on the TV (the roll call)');
  assert.deepEqual(gone, [1], 'and the game hears it gone');
  lobby.end();
}

// ---- the roll call in a lobby that still holds phones: one leaves while the TV is away, one sleeps, one stays ---------
// The host's resume names two seats (seat 1 here, seat 3 away), so the roll call completes only once both are named:
// the TV lets seat 2 go and keeps the other two as the host holds them (H0 kept all three lit).
{
  const { host, lobby, seated, gone } = await lobbyWith(3);
  let left = false;
  lobby.subscribe((view) => {
    if (view.state !== 'away' || left) return;
    left = true;
    // while the TV is away: seat 2's phone leaves for good, seat 3's phone sleeps (its socket drops, its seat is held)
    seated[1].send({ t: 'end' });
    seated[2].socket.close();
  });
  host.dropDesktop();
  await until(() => left, 'the lobby goes away');
  await until(() => {
    const seats = host.actor.exportState()?.seats ?? [];
    return seats.length === 2 && seats.every((seat) => (seat.seat === 1 ? seat.socket !== null : seat.socket === null));
  }, 'seat 2 leaves and seat 3 sleeps on the host');
  await until(() => lobby.view.state !== 'away', 'the lobby comes back (or ends)');
  await settle();
  assert.equal(lobby.view.state, 'open', 'it resumes with its window');
  assert.deepEqual(host.actor.exportState().seats.map((seat) => seat.seat), [1, 3], 'the host holds seats 1 and 3');
  assert.deepEqual(lobby.view.seats.map((seat) => [seat.seat, seat.presence]), [[1, 'here'], [3, 'away']],
    'the TV lets go of the seat whose phone left while it was away and keeps the seats the host named, as the host holds them');
  assert.deepEqual(gone, [2], 'the game hears seat 2 gone, and only seat 2');
  lobby.end();
}

// ---- the view's machine: its states and moves; `move` is the one writer --------------------------------------------
{
  assert.deepEqual(padLobby.PAD_LOBBY_STATES, ['connecting', 'open', 'closed', 'away', 'ended']);
  assert.deepEqual(padLobby.PAD_LOBBY_MOVES, {
    connecting: ['open', 'closed', 'away', 'ended'], open: ['closed', 'away', 'ended'], closed: ['open', 'away', 'ended'],
    away: ['open', 'closed', 'ended'], ended: [],
  });
  for (const state of padLobby.PAD_LOBBY_STATES) {
    assert.equal(couchLobby.reopenOffered({ state }), state === 'closed', `Reopen on a lobby ${state}`);
  }
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./padLobby.ts', import.meta.url), 'utf8');
  const writes = [...source.matchAll(/\bstate: '(connecting|open|closed|away|ended)'|\{ \.\.\.view, state \}/g)].map((match) => match[0]);
  assert.deepEqual(writes, ["state: 'connecting'", '{ ...view, state }'], 'the view starts connecting and only move() changes its state');
  assert.ok(!/publish\(\{[^}]*\bstate\b/.test(source), 'publish never carries a state');
}

console.log('padLobbyResume.selftest: PASS — a setOpen(false) asked while the TV is away reaches the host after the resume; a lobby whose phones left resumes after a blink; the grace stands when the last seat leaves while away; the roll call keeps the seats the host names; Reopen only on a closed lobby; one state writer');
process.exit(0);
