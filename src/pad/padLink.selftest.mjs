// The phone controller's link over real sockets (docs/PHONE-CONTROLLER.md): a desktop link and a phone link pair
// through the LAN helper's pairing service; with no WebRTC (Node has none, as a phone that refuses it) the relay
// carries the pairing: the desktop reads live-over-relay, axes and ctl frames arrive and drive the input mapper, the
// relay sends changed frames only at its rate, and Disconnect ends both sides. (The data-channel path is the browser
// e2e's, tools/pad-e2e.browser.mjs.)
import assert from 'node:assert/strict';
import http from 'node:http';
import { createLocalPadService } from '../../server/rooms/localPadService.ts';
import { createPadLink } from './padLink.ts';
import { createPadInputMapper } from './padInput.ts';
import { PAD_RELAY_HZ, decodePadAxes, encodePadAxes } from './padProtocol.ts';

const server = http.createServer();
const pads = createLocalPadService();
server.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const serviceUrl = `ws://127.0.0.1:${server.address().port}`;
const noRtc = () => { throw new Error('no WebRTC here'); };
const until = async (test, label, ms = 5000) => {
  const end = Date.now() + ms;
  while (!test()) { if (Date.now() > end) throw new Error(`timed out: ${label}`); await new Promise((r) => setTimeout(r, 10)); }
};

const calls = [];
const input = {
  setVirtualMove: (x, y) => calls.push(['move', Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
  addVirtualAim: (dx, dy) => calls.push(['aim', dx, dy]),
  pressVirtual: (a) => calls.push(['press', a]),
  releaseVirtual: (a) => calls.push(['release', a]),
  tapVirtual: (a) => calls.push(['tap', a]),
};
const mapper = createPadInputMapper(input);
const scratch = {};
const desktopStates = [];
const desktop = createPadLink({
  role: 'desktop', serviceUrl, createPeer: noRtc,
  onState: (state) => desktopStates.push(state),
  onAxes: (bytes) => { if (decodePadAxes(bytes, scratch)) mapper.applyAxes(scratch, performance.now()); },
  onCtl: (message) => mapper.applyCtl(message),
});
await until(() => desktop.state.kind === 'waiting', 'a code');
const { code } = desktop.state;
assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);

const phoneStates = [];
let token = null;
const phone = createPadLink({
  role: 'phone', serviceUrl, code, createPeer: noRtc, rtcTimeoutMs: 500,
  onState: (state) => phoneStates.push(state),
  onToken: (_code, value) => { token = value; },
});
await until(() => phone.state.kind === 'live' && phone.state.path === 'relay', 'the phone settles on the relay');
assert.ok(token, 'the phone holds a resume token');

const frame = new Uint8Array(24);
const axes = { flags: 0, seq: 1, t: 0, steer: 0.5, throttle: 1, aimX: 0, aimY: 0, held: 0 };
phone.sendAxes(encodePadAxes(axes, frame), true);
await until(() => calls.some((c) => c[0] === 'move' && c[1] === 0.5 && c[2] === 1), 'the stick arrives over the relay');
assert.equal(desktop.state.kind, 'live', 'relay frames make the desktop live');
assert.equal(desktop.state.path, 'relay');
assert.equal(desktop.direct, false);

// the relay is rate-limited at the phone: a burst of changed frames inside one relay interval sends at most one now and
// the newest on the window's trailing edge (a capped change is held, never dropped)
const before = calls.filter((c) => c[0] === 'move').length;
for (let i = 0; i < 10; i++) { axes.seq++; axes.steer = i / 20; phone.sendAxes(encodePadAxes(axes, frame), true); }
await new Promise((r) => setTimeout(r, 300));
const burst = calls.filter((c) => c[0] === 'move').slice(before);
assert.ok(burst.length <= 2, `at most one relay frame per 1/${PAD_RELAY_HZ} s (got ${burst.length})`);
assert.equal(burst.at(-1)?.[1], 0.45, 'the burst\'s newest frame arrives on the trailing edge');
// an unchanged frame inside the 333 ms pulse is not relayed at all (one changed frame goes first, then 100 ms)
axes.seq++; axes.steer = 0.9;
phone.sendAxes(encodePadAxes(axes, frame), true);
await until(() => calls.some((c) => c[0] === 'move' && c[1] === 0.9), 'the changed frame');
await new Promise((r) => setTimeout(r, 100));
const quiet = calls.length;
axes.seq++;
phone.sendAxes(encodePadAxes(axes, frame), false);
await new Promise((r) => setTimeout(r, 150));
assert.equal(calls.length, quiet, 'an unchanged frame inside the 333 ms pulse is not relayed');

// ctl over the relay: a hold and a tap reach the input layer
assert.equal(phone.sendCtl({ k: 'down', a: 'fire', s: (axes.seq + 1) & 0xffff }), true);
assert.equal(phone.sendCtl({ k: 'tap', a: 'shell2' }), true);
await until(() => calls.some((c) => c[0] === 'tap' && c[1] === 'shell2'), 'the tap arrives');
assert.ok(calls.some((c) => c[0] === 'press' && c[1] === 'fire'), 'the hold arrives');

// Disconnect from the phone ends both sides
phone.end();
await until(() => desktop.state.kind === 'ended', 'the desktop hears the end');
assert.equal(desktop.state.reason, 'ended');
assert.equal(phone.state.kind, 'ended');
desktop.dispose();
await pads.close();
server.close();
console.log('padLink: PASS — pair over real sockets, settle on the relay without WebRTC, frames and ctl drive the mapper, relay rate, Disconnect');
