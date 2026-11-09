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
// call), in an emptied lobby and in one whose other phones stay (here or asleep). An ICE ask the lobby socket could
// not carry is asked again once it is back. Reopen is not offered while the lobby reconnects and the lobby's paint
// applies that (Reopen hidden, the Connecting note shown; pinned in couchLobby.ts's source), and the view's moves
// follow one rule (padLobbyMoveAllowed).
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  const host = { deadline: null, resumes: 0, desktopId: null, iceGrants: 0 };
  const actor = new PadActor(code, {
    now: () => now,
    randomToken: () => randomBytes(16).toString('base64url'),
    sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
    send: (id, message) => { const client = clients.get(id); if (client) later(() => client.receive(JSON.stringify(message))); },
    close: (id) => { const client = clients.get(id); clients.delete(id); if (client) later(() => client.closedByHost()); },
    schedule: (at) => { host.deadline = at; },
    persist: () => {},
    iceServers: async () => { host.iceGrants++; return { iceServers: [], relay: false }; },
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

// ---- an ICE ask the lobby socket could not carry is asked again once the TV is back (fix-up r3) ----------------------
// The lobby marks the host asked only when the ask went out (padLobby.ts fromSeat). H0 marked it before sending: an ask
// that met a closed socket left the lobby "asked" after the resume, and no seat's ask reached the host again until the
// socket dropped once more, so a seat without a fresh grant went on without ICE servers (no TURN). The harness makes
// the order: the first phone's seat arrives and the TV's socket drops in the same turn, so the seat's link asks while
// the socket is closed. A browser delivers the drop as its own task after the seat's ask (the ask is synchronous on a
// host frame), so no product path reaches this today; the block holds the rule for an ask a later change makes async.
{
  const { host, lobby, gone } = await lobbyWith(0);
  let dropped = false;
  lobby.subscribe((view) => {
    if (dropped || view.seats.length !== 1) return;
    dropped = true;
    host.dropDesktop();
  });
  host.phone(lobby.view.code);
  await until(() => dropped, 'the first seat arrives and the TV drops');
  await until(() => lobby.view.state !== 'away', 'the lobby comes back (or ends)');
  await settle();
  assert.equal(lobby.view.state, 'open', 'it resumes with its window');
  assert.deepEqual(lobby.view.seats.map((seat) => [seat.seat, seat.presence]), [[1, 'here']], 'the seat is kept');
  await until(() => host.iceGrants > 0, 'an ICE ask reaches the host', 3000).catch(() => {});
  assert.equal(host.iceGrants, 1,
    'the seat asks for ICE again after the resume and one ask reaches the host (H0: an ask that met the closed socket left the lobby marked asked, and none did)');
  assert.deepEqual(gone, []);
  lobby.end();
}

// ---- the view's machine: its states and moves; `move` is the one writer and asks the rule --------------------------
// No product path asks for a refused move (once ended, the socket is gone and a stale socket's frames are dropped), so
// the refusal is proven on the rule move() asks (fix-up r2): every one of the 25 (from, to) pairs against the table, and
// the census holds move() to asking it before it writes.
{
  const table = {
    connecting: ['open', 'closed', 'away', 'ended'], open: ['closed', 'away', 'ended'], closed: ['open', 'away', 'ended'],
    away: ['open', 'closed', 'ended'], ended: [],
  };
  assert.deepEqual(padLobby.PAD_LOBBY_STATES, ['connecting', 'open', 'closed', 'away', 'ended']);
  assert.deepEqual(padLobby.PAD_LOBBY_MOVES, table);
  const refused = [];
  for (const from of padLobby.PAD_LOBBY_STATES) {
    for (const to of padLobby.PAD_LOBBY_STATES) {
      const allowed = from === to || table[from].includes(to);
      assert.equal(padLobby.padLobbyMoveAllowed(from, to), allowed, `the lobby view ${allowed ? 'may' : 'may not'} move ${from} -> ${to}`);
      if (!allowed) refused.push(`${from}->${to}`);
    }
  }
  assert.deepEqual(refused, ['open->connecting', 'closed->connecting', 'away->connecting', 'ended->connecting', 'ended->open',
    'ended->closed', 'ended->away'], 'seven moves are refused: back to connecting, and out of ended');
  for (const state of padLobby.PAD_LOBBY_STATES) {
    assert.equal(couchLobby.reopenOffered({ state }), state === 'closed', `Reopen on a lobby ${state}`);
  }
  const source = readFileSync(new URL('./padLobby.ts', import.meta.url), 'utf8');
  const writes = [...source.matchAll(/\bstate: '(connecting|open|closed|away|ended)'|\{ \.\.\.view, state \}/g)].map((match) => match[0]);
  assert.deepEqual(writes, ["state: 'connecting'", '{ ...view, state }'], 'the view starts connecting and only move() changes its state');
  assert.ok(!/publish\(\{[^}]*\bstate\b/.test(source), 'publish never carries a state');
  assert.match(source, /const move = \([^)]*\): boolean => \{\n\s*if \(!padLobbyMoveAllowed\(view\.state, state\)\) return false;\n\s*view = \{ \.\.\.view, state \};/,
    'move() asks padLobbyMoveAllowed before it writes, and refuses what it refuses');
  assert.equal(source.match(/\bPAD_LOBBY_MOVES\[/g)?.length, 1, 'the table is read in one place (the rule)');
}

// ---- the lobby's paint applies the rule: Reopen hidden unless offered, the Connecting note while away (fix-up r3) ------
// reopenOffered (above) is the owner; couchLobby.ts's paint is DOM code (openCouchLobby builds a modal), so its use is
// pinned in source, as padReadyBuzz.selftest pins the phone page: Reopen's and the note's one writer each is a statement
// of paint's own (in no branch, before any return), the note reads Connecting, and paint runs on every view the lobby
// publishes. H0's Reopen expression (offered while away), a note that never shows, or either line in a branch fails.
{
  const couch = readFileSync(new URL('../ui/couchLobby.ts', import.meta.url), 'utf8');
  /** A block's text from the `{` after `head` to its matching `}`. */
  const block = (head) => {
    const at = couch.indexOf(head);
    assert.ok(at >= 0, `couchLobby.ts has ${head}`);
    const open = couch.indexOf('{', at + head.length - 1);
    let depth = 0;
    for (let i = open; i < couch.length; i++) {
      if (couch[i] === '{') depth++;
      else if (couch[i] === '}' && --depth === 0) return couch.slice(open + 1, i);
    }
    assert.fail(`${head}'s block never closes`);
  };
  /** The block's own statements: its lines at its least indent (a branch's or a callback's lines sit deeper). */
  const topLines = (body) => {
    const lines = body.split('\n').filter((line) => line.trim());
    const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length));
    return lines.filter((line) => line.length - line.trimStart().length === indent).map((line) => line.trim());
  };
  const REOPEN = 'reopen.hidden = !reopenOffered(view);';
  const NOTE = "reconnecting.hidden = view.state !== 'away';";
  const paint = block('function paint(view: PadLobbyView): void {');
  for (const [line, what] of [[REOPEN, 'Reopen is hidden unless reopenOffered says so (never while away)'],
    [NOTE, 'the Connecting note shows exactly while the lobby is away']]) {
    assert.ok(topLines(paint).includes(line), `paint sets it on every view, as a statement of its own: ${what}`);
    const returnAt = paint.search(/\breturn\b/);
    assert.ok(returnAt < 0 || paint.indexOf(line) < returnAt, `paint sets it before any return: ${what}`);
  }
  assert.deepEqual([...couch.matchAll(/\breopen\.hidden\s*=[^;]*;/g)].map((match) => match[0]), [REOPEN], "paint is Reopen's one writer");
  assert.deepEqual([...couch.matchAll(/\breconnecting\.hidden\s*=[^;]*;/g)].map((match) => match[0]), ['reconnecting.hidden = true;', NOTE],
    "the note starts hidden and paint is its one writer after that");
  const lobbyLines = topLines(block('export function openCouchLobby('));
  assert.ok(lobbyLines.includes("reconnecting.textContent = t('pad.state.connecting');"), 'the note reads Connecting');
  assert.ok(lobbyLines.includes('paint(lobby.view);') && lobbyLines.includes('detach = lobby.subscribe(paint);'),
    'paint runs on the first view and on every view the lobby publishes');
}

console.log('padLobbyResume.selftest: PASS — a setOpen(false) asked while the TV is away reaches the host after the resume; a lobby whose phones left resumes after a blink; the grace stands when the last seat leaves while away; the roll call keeps the seats the host names; an ICE ask the socket could not carry is asked again; Reopen only on a closed lobby, and the paint hides it and shows Connecting while away; one state writer that asks the move rule');
process.exit(0);
