// The LAN helper's phone-controller pairing over real sockets (docs/PHONE-CONTROLLER.md): /pad/new hands out a code,
// /pad/join pairs once, a wrong code and a query string are refused, signals relay, the keepalive is answered without
// the actor, resume brings a phone back, the per-address connect limit holds, and a held code is drawn again.
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createLocalPadService } from './localPadService.ts';
import { createRoomsServer } from './serve.ts';

const server = http.createServer();
const draws = ['AAAAAA', 'AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE', 'FFFFFF', 'GGGGGG'];
const pads = createLocalPadService({ connectLimit: 7, drawCode: () => draws.shift() ?? 'HHHHHH' });
server.on('upgrade', (request, socket, head) => {
  if (!pads.handleUpgrade(request, socket, head)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `ws://127.0.0.1:${server.address().port}`;

/** A socket with an inbox: next() awaits the next JSON frame. */
function open(path) {
  const ws = new WebSocket(`${base}${path}`);
  const inbox = [];
  const waiters = [];
  let closeInfo = null;
  ws.on('message', (data) => {
    const text = data.toString();
    const value = text === 'pong' ? 'pong' : JSON.parse(text);
    const waiter = waiters.shift();
    if (waiter) waiter(value); else inbox.push(value);
  });
  const closed = new Promise((resolve) => ws.on('close', (code, reason) => { closeInfo = { code, reason: reason.toString() }; resolve(closeInfo); }));
  const opened = new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`))); });
  return {
    ws, opened, closed,
    next: () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve)),
    send: (value) => ws.send(typeof value === 'string' ? value : JSON.stringify(value)),
  };
}

const desktop = open('/pad/new');
await desktop.opened;
const code = await desktop.next();
assert.equal(code.t, 'code');
assert.equal(code.code, 'AAAAAA');
assert.ok(code.token.length >= 16, 'the desktop holds a resume token');

// a held code is drawn again: the next desktop gets the third draw, not the busy one
const desktop2 = open('/pad/new');
await desktop2.opened;
assert.equal((await desktop2.next()).code, 'BBBBBB', 'a held code is drawn again');
desktop2.ws.close();

// the keepalive frame is answered without the actor
desktop.send('ping');
assert.equal(await desktop.next(), 'pong');

// a wrong code is refused as unknown and closed; a query string never reaches an actor
const wrong = open('/pad/join/ZZZZZZ');
await wrong.opened;
assert.deepEqual(await wrong.next(), { t: 'end', reason: 'unknown' });
assert.equal((await wrong.closed).reason, 'unknown');
await assert.rejects(open('/pad/join/AAAAAA?x=1').opened, /HTTP 403/, 'a query string is refused');

const phone = open('/pad/join/aaaaaa');
await phone.opened;
const joined = await phone.next();
assert.equal(joined.t, 'joined', 'the code pairs (case folded)');
assert.deepEqual(await phone.next(), { t: 'peer', state: 'here' });
assert.deepEqual(await desktop.next(), { t: 'peer', state: 'here' });

const second = open('/pad/join/AAAAAA');
await second.opened;
assert.deepEqual(await second.next(), { t: 'end', reason: 'unknown' }, 'the code joins once');

phone.send({ t: 'signal', kind: 'offer', sdp: 'v=0' });
assert.deepEqual(await desktop.next(), { t: 'signal', kind: 'offer', sdp: 'v=0' }, 'signals relay verbatim');
phone.send({ t: 'ice' });
assert.deepEqual(await phone.next(), { t: 'ice', iceServers: [], relay: false }, 'no issuer: no servers (a LAN needs host candidates)');

// the phone drops and resumes with its token
phone.ws.close();
assert.deepEqual(await desktop.next(), { t: 'peer', state: 'away' });
const back = open('/pad/resume/AAAAAA');
await back.opened;
back.send({ t: 'resume', token: joined.token });
assert.deepEqual(await back.next(), { t: 'resumed' });
assert.deepEqual(await back.next(), { t: 'peer', state: 'here' });
assert.deepEqual(await desktop.next(), { t: 'peer', state: 'here' });
assert.equal(pads.pairs, 1);

back.send({ t: 'end' });
assert.deepEqual(await desktop.next(), { t: 'end', reason: 'ended' });
await desktop.closed;
assert.equal(pads.pairs, 0, 'an ended pairing is forgotten');

// the per-address connect limit (7 here: this is the 7th admitted upgrade; a refused query string never reaches the limiter)
const seventh = open('/pad/join/QQQQQQ');
await seventh.opened;
await assert.rejects(open('/pad/join/QQQQQQ').opened, /HTTP 429/, 'past the limit an upgrade is refused');

await pads.close();
await new Promise((resolve) => server.close(resolve));

// the LAN helper mounts it beside the rooms on one port
const rooms = await createRoomsServer({ seatSecret: 'x'.repeat(32), world: 'terrain' });
const lan = new WebSocket(`${rooms.url}/pad/new`);
const first = await new Promise((resolve, reject) => { lan.on('message', (data) => resolve(JSON.parse(data.toString()))); lan.on('error', reject); });
assert.equal(first.t, 'code', 'the LAN helper serves /pad/new');
lan.close();
await rooms.close();

console.log('localPadService: PASS — pairing over real sockets, refusals, keepalive, resume, connect limit, LAN mount');
