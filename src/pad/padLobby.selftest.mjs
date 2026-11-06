// The couch lobby over real sockets (docs/COUCH-MODE.md "The lobby"): the desktop opens one lobby through the LAN
// helper's pairing service and three phones join it, each a numbered seat with its own receiver. With no WebRTC (Node
// has none) the relay carries each seat. Each phone's stick and fire reach its own seat's input port and nobody else's,
// each phone hears its own seat's status, one ICE grant serves every seat, a removed seat's phone reads Removed and its
// controls let go, a phone that leaves frees its seat for the next one, and the host's end ends every phone.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createLocalPadService } from '../../server/rooms/localPadService.ts';
import { createPadLink } from './padLink.ts';
import { startPadLobby } from './padLobby.ts';
import { encodePadAxes } from './padProtocol.ts';

// the receiver samples on the next animation frame (the latency readout); Node has none
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 16);

const server = http.createServer();
let iceGrants = 0;
const pads = createLocalPadService({ connectLimit: 60, iceServers: async () => { iceGrants++; return { iceServers: [], relay: false }; } });
server.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const serviceUrl = `ws://127.0.0.1:${server.address().port}`;
const noRtc = () => { throw new Error('no WebRTC here'); };
const until = async (test, label, ms = 8000) => {
  const end = Date.now() + ms;
  while (!test()) { if (Date.now() > end) throw new Error(`timed out: ${label}`); await new Promise((r) => setTimeout(r, 10)); }
};

/** Each seat's input port records what its phone did; its status source is a tank in battle. */
const calls = new Map();
const gone = [];
const portsFor = (seat) => {
  const log = [];
  calls.set(seat, log);
  return {
    input: {
      setVirtualMove: (x, y) => log.push(['move', Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
      addVirtualAim: (dx, dy) => log.push(['aim', dx, dy]),
      pressVirtual: (a) => log.push(['press', a]),
      releaseVirtual: (a) => log.push(['release', a]),
      tapVirtual: (a) => log.push(['tap', a]),
    },
    source: () => ({
      battle: true, paused: false, sniper: false, shellCode: (type) => type,
      player: {
        combat: { destroyed: false, shellSlot: seat - 1, ammo: [30, 20, 10], reload: { t: 0, totalS: 6 } },
        spec: { id: 'm1a1_abrams_hc', topSpeedKmh: 67, gun: { shells: [{ type: 'APFSDS' }, { type: 'HEAT' }, { type: 'HE' }] } },
        state: { turretYaw: 0, speed: seat },
      },
    }),
    togglePause: () => {},
  };
};
const lobby = startPadLobby(serviceUrl, { seat: portsFor, seatGone: (seat) => gone.push(seat) });
await until(() => lobby.view.code, 'the lobby has a code');
assert.equal(lobby.view.state, 'open', 'a lobby opens for joins at once');
assert.ok(lobby.view.until > Date.now(), 'and says until when');

/** A phone page's link, with what it heard. */
function phone() {
  const seen = { seat: 0, states: [], statuses: [] };
  seen.link = createPadLink({
    role: 'phone', serviceUrl, code: lobby.view.code, createPeer: noRtc,
    onState: (state) => seen.states.push(state),
    onSeat: (seat) => { seen.seat = seat; },
    onCtl: (message) => { if (message.k === 'status') seen.statuses.push(message.s); },
  });
  return seen;
}
const phones = [phone(), phone(), phone()];
await until(() => phones.every((p) => p.seat), 'every phone has a seat');
assert.deepEqual(phones.map((p) => p.seat).sort(), [1, 2, 3], 'three phones, seats 1 to 3');
await until(() => lobby.view.seats.length === 3, 'the lobby sees three seats');
await until(() => phones.every((p) => p.states.at(-1)?.kind === 'live'), 'every phone live over the relay');

// each phone drives its own seat: a distinct stick per phone, and fire held on one
const frame = (steer, throttle, held = 0, seq = 1) => encodePadAxes({ flags: 0, seq, t: 0, steer, throttle, aimX: 0, aimY: 0, held });
// (a phone sends a frame on each change and a heartbeat between; the receiver drives once it has seen the battle)
let seq = 1;
const heartbeat = setInterval(() => { seq++; for (const p of phones) p.link.sendAxes(frame(p.seat / 10, -p.seat / 10, 0, seq), true); }, 100);
await until(() => [1, 2, 3].every((seat) => calls.get(seat).some((c) => c[0] === 'move' && c[1] === seat / 10)), 'each seat moved');
clearInterval(heartbeat);
for (const seat of [1, 2, 3]) {
  const moves = calls.get(seat).filter((c) => c[0] === 'move');
  assert.ok(moves.every((c) => c[1] === seat / 10 && c[2] === -seat / 10), `seat ${seat} took only its own phone's stick`);
}
const firing = phones.find((p) => p.seat === 2);
firing.link.sendCtl({ k: 'down', a: 'fire', s: seq + 1 });
await until(() => calls.get(2).some((c) => c[0] === 'press' && c[1] === 'fire'), 'seat 2 fires');
assert.ok(![1, 3].some((seat) => calls.get(seat).some((c) => c[0] === 'press')), 'no other seat fires');

// each phone hears its own seat's status (its slot is its seat less one here)
await until(() => phones.every((p) => p.statuses.length), 'every phone has a status');
for (const p of phones) assert.equal(p.statuses.at(-1).slot, p.seat - 1, `phone ${p.seat} reads its own seat`);
assert.equal(iceGrants, phones.length + 1, 'each phone asks for its grant, and the desktop asks once for every seat');

// the host lets seat 3 go: its phone reads Removed, its controls let go, the game hears it
const removed = phones.find((p) => p.seat === 3);
lobby.remove(3);
await until(() => removed.states.at(-1)?.kind === 'ended', 'the removed phone ends');
assert.equal(removed.states.at(-1).reason, 'removed');
await until(() => gone.includes(3), 'the game hears seat 3 gone');
assert.deepEqual(lobby.view.seats.map((s) => s.seat), [1, 2]);

// a phone that leaves for good frees its seat, and the next phone takes that number
const leaving = phones.find((p) => p.seat === 1);
leaving.link.end();
await until(() => gone.includes(1), 'the game hears seat 1 gone');
const late = phone();
await until(() => late.seat, 'a late phone joins');
assert.equal(late.seat, 1, 'it takes the freed seat');

// closing the lobby stops new phones; the seated keep playing
lobby.setOpen(false);
await until(() => lobby.view.state === 'closed', 'the lobby closes');
const refused = phone();
await until(() => refused.states.at(-1)?.kind === 'ended', 'a phone at a closed lobby is refused');
assert.equal(refused.states.at(-1).reason, 'unknown');

// the host's end ends every phone
lobby.end();
await until(() => [firing, late].every((p) => p.states.at(-1)?.kind === 'ended'), 'every phone ends');
assert.equal(lobby.view.state, 'ended');
assert.deepEqual(lobby.view.seats, []);

await pads.close();
await new Promise((resolve) => server.close(resolve));
console.log('padLobby: PASS — one lobby, three seats each on its own receiver, no cross-talk, own status, one ICE grant, remove, leave and rejoin, close, end');
process.exit(0);
