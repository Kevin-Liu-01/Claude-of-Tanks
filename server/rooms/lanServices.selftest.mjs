// Proof (implicit state machine audit S1, 2026-11-02): the LAN room and pad services, over real WebSockets.
// The LAN room service handed every message to its room without waiting (`void actor.handleMessage`) while the Durable
// Object's input gate runs one event at a time; it keyed rooms, timers and removals by room code, so a deleted room's
// pending work could clear the next room's timer under the same code and an old timer ticked whichever room held the
// code; and it handed the first p2p host to any room created while the map was empty, though a room binds its host
// once. The LAN pad service removed pairings by code: an old socket's close deleted a new pairing under the same code.
//   - a room's events run one at a time, in order;
//   - a forgotten room's late schedule neither clears nor fires the next room's timer;
//   - every p2p room has its own match host;
//   - a pairing's old socket closing late leaves the new pairing under its code.
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createLocalRoomService } from './localRoomService.ts';
import { createLocalPadService } from './localPadService.ts';

const SEAT_SECRET = 'lan-services-seat-secret-0123456789';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, label, ms = 5000) => {
  const started = Date.now();
  while (!check()) { if (Date.now() - started > ms) assert.fail(`timed out: ${label}`); await sleep(5); }
};
async function serve(upgrade) {
  const server = http.createServer((request, response) => { response.writeHead(404); response.end(); });
  server.on('upgrade', (request, socket, head) => { if (!upgrade(request, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `ws://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
const opened = (ws) => new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
const closed = (ws) => new Promise((resolve) => { if (ws.readyState === WebSocket.CLOSED) resolve(); else ws.once('close', resolve); });

// ---- the room service
{
  const lan = createLocalRoomService({ matchService: null, seatSecret: SEAT_SECRET, matchTransport: 'p2p' });
  const server = await serve((request, socket, head) => lan.handleUpgrade(request, socket, head));
  try {
    // one event at a time: a message that awaits (a relay mint, the match host's start) holds the next one back
    const serial = lan.room('SERIAL');
    const order = [];
    serial.handleMessage = async (_socketId, text) => { order.push(`start ${text}`); await sleep(40); order.push(`end ${text}`); };
    const client = new WebSocket(`${server.url}/rooms/SERIAL`);
    await opened(client);
    client.send(Buffer.from('a'));
    client.send(Buffer.from('b'));
    await until(() => order.length === 4, 'both messages handled');
    assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b'], `a room's messages run one at a time (${order.join(', ')})`);
    client.close();
    await closed(client);

    // a room forgotten under its code, then a new room under the same code
    const forget = async (code) => {
      const actor = lan.room(code);
      const socket = new WebSocket(`${server.url}/rooms/${code}`);
      await opened(socket);
      socket.close();
      await closed(socket);
      await until(() => lan.rooms.get(code) !== actor, `${code}: the empty room is forgotten`);
      return actor;
    };
    {
      const old = await forget('TIMERS');
      const next = lan.room('TIMERS');
      let ticks = 0;
      next.tick = async () => { ticks++; };
      next.ports.schedule(Date.now() + 60);
      old.ports.schedule(null); // the old room's pending work ends and reschedules
      await sleep(200);
      assert.equal(ticks, 1, `the new room's timer survives the old room's late reschedule (ticks ${ticks})`);
    }
    {
      const old = await forget('STALE1');
      const next = lan.room('STALE1');
      let ticks = 0;
      next.tick = async () => { ticks++; };
      old.ports.schedule(Date.now() + 30); // a late timer from the old room
      await sleep(150);
      assert.equal(ticks, 0, `the old room's timer never ticks the new room (ticks ${ticks})`);
    }
  } finally {
    await lan.close();
    await server.close();
  }
}

// ---- every p2p room gets its own host, the first room created on an empty map too
{
  const lan = createLocalRoomService({ matchService: null, seatSecret: SEAT_SECRET, matchTransport: 'p2p' });
  try {
    const first = lan.room('HOSTAA');
    lan.rooms.delete('HOSTAA'); // the map is empty again
    const second = lan.room('HOSTBB');
    assert.notEqual(second.ports.matchHost, first.ports.matchHost, 'a room never shares a p2p host another room bound');
    assert.notEqual(first.ports.matchHost, lan.room('HOSTCC').ports.matchHost);
  } finally {
    await lan.close();
  }
}

// ---- the pad service: an old socket closing late leaves the new pairing under its code
{
  const pads = createLocalPadService({ drawCode: () => 'CCCCCC' });
  const server = await serve((request, socket, head) => pads.handleUpgrade(request, socket, head));
  try {
    const first = new WebSocket(`${server.url}/pad/new`);
    const firstMessages = [];
    first.on('message', (data) => firstMessages.push(JSON.parse(String(data))));
    await opened(first);
    await until(() => firstMessages.some((message) => message.t === 'code'), 'the first desktop has its code');
    // the desktop ends the pairing; its socket's close handshake is held back (the client reads nothing for a while)
    first.send(JSON.stringify({ t: 'end' }));
    first._socket.pause();
    await until(() => pads.pairs === 0, 'the ended pairing is forgotten');
    const second = new WebSocket(`${server.url}/pad/new`);
    const secondMessages = [];
    second.on('message', (data) => secondMessages.push(JSON.parse(String(data))));
    await opened(second);
    await until(() => secondMessages.some((message) => message.t === 'code'), 'the second desktop has the same code');
    assert.equal(pads.pairs, 1);
    first._socket.resume();
    await closed(first);
    await sleep(50);
    assert.equal(pads.pairs, 1, 'the old socket\'s late close leaves the new pairing (before: it deleted it by code)');
    second.close();
    await closed(second);
  } finally {
    await pads.close();
    await server.close();
  }
}
console.log('lanServices: a LAN room runs its events one at a time and owns its timer and its p2p host; a pairing is removed only as itself');
