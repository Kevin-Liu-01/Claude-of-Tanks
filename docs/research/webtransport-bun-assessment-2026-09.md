# WebTransport and Bun WebSockets assessment

Evaluated September 6, 2026 against source baseline `9afc1d5f5` and the
[current frame/room evidence](multiplayer-stall-scale-2026-09.md). This is a
source-backed architecture assessment, not an implementation or an A/B transport
benchmark. No new service, dependency, billing plan or production route is added.

## Recommendation

Keep WebRTC gameplay for the supported private-room/LAN product. Consider
WebTransport if the product later chooses a hosted simulation/relay server.
Consider Bun only after measuring a bottleneck in a server we actually operate.
Neither is a demonstrated fix for the historical browser frame stalls.

| Candidate | What it would change here | Present decision |
| --- | --- | --- |
| Existing WebRTC | Browser-hosted authority; reliable control plus replaceable state/input | Keep |
| WebTransport | Add a compatible server endpoint and a new transport adapter | Future server-hosted experiment, not a direct peer replacement |
| Bun WebSockets | Replace a Node/server implementation; browser still uses WebSockets | No migration justified by current evidence |

The current paths are explicit in [hosting](../MULTIPLAYER-HOSTING.md) and
[`webrtcPeer.ts`](../../src/net/webrtcPeer.ts): Cloudflare handles room membership
and negotiation, TURN relays when necessary, and a player's browser runs the
authority. The `cot-state-v1` channel is unordered with zero retransmissions;
`cot-match-v1` carries reliable commands/events. Changing signaling software does
not change the live rendering or prediction code.

## WebTransport

WebTransport offers reliable streams and unreliable datagrams to a compatible
HTTP/3 server. It is available in workers and requires a secure context. MDN now
labels the core feature Baseline 2026, available across current browsers since
March; older browsers and optional members still require detection. Rejecting it
solely as an unsupported-browser experiment would be outdated.
[MDN WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport).

The critical topology distinction is client-to-server versus browser-to-browser.
QUIC datagrams and independent streams can avoid the single ordered-stream
blocking associated with WebSockets; our WebRTC state lane already permits
obsolete packets to be skipped. Whether a server route beats a direct or TURN
route is an experiment, not guaranteed by the API name.
[Chrome transport comparison](https://developer.chrome.com/docs/capabilities/web-apis/webtransport).

A real adapter would need:

- Reliable handshake, room errors, combat events and result delivery; unreliable
  input/snapshots with the existing sequence, acknowledgement and keyframe rules.
- Packet sizing against the connection's `maxDatagramSize`, bounded queue age and
  capacity. Our current message allowance is 256 KiB, with up to 32 entity rows
  and 256 shell rows in the codec; that is **not** a promise a snapshot fits one
  datagram. Oversize and incomplete messages need explicit handling, without
  unbounded fragment reassembly or waiting on a missing obsolete update.
  [Datagram API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransportDatagramDuplexStream).
- Feature detection and bounded connection failure/fallback. If datagram
  behavior is required, negotiate it deliberately; `requireUnreliable: true`
  rejects fallback to HTTP/2 where that fallback is implemented. The
  `low-latency` congestion setting is a preference, not
  a latency guarantee. [Constructor options](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport/WebTransport).
- A verified endpoint with TLS, authentication, origin checks, admission limits,
  region placement, cancellation and room expiry. Serving the website over
  HTTP/3 does not implement our missing server-side WebTransport protocol.

Using a worker could move deliberately ported networking work off the page;
switching APIs alone does not relocate simulation, terrain or WebGL rendering.

## Bun WebSockets

`Bun.serve` supplies server-side WebSockets, shared handlers, pub/sub and explicit
backpressure controls. Its advertised throughput comparison uses an old Linux
chat workload, not this game's frame latency. Send result `-1` means already
queued, while `0` means dropped; blindly retrying negative results would duplicate
messages. Bun-specific client pause/resume methods are not browser APIs.
[Bun WebSockets](https://bun.com/docs/runtime/http/websockets).

WebSockets remain an ordered transport: a faster server implementation does not
remove TCP retransmission blocking. Replacing the current replaceable lane with
that path could worsen freshness under packet loss. This is a protocol tradeoff,
not a measured regression from a Bun build we have not run.
[WebSocket protocol](https://www.rfc-editor.org/rfc/rfc6455#section-1.7).

Bun could host a port of the local Node rendezvous helper or the retained internal
dedicated adapter. It is not a flag that converts the existing Cloudflare room
class: that class owns platform-specific hibernation, SQLite membership, alarms
and authenticated recovery. A move needs suitable hosting and equivalent cleanup
and persistence, not another Redis database by necessity.
[Cloudflare room lifecycle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## Evidence required before reconsidering

Compare the same authority, map, seed, codecs, machines and network profile;
do not combine a transport swap with graphics changes. Measure frame p99/max
separately from input acknowledgement, confirmed-hit latency, stale-update age,
bandwidth and recovery. Exercise 2/4/14 seats, packet loss/reordering, blocked
UDP, connection refusal, host departure, background/resume, exhausted queues,
expired credentials and abandoned rooms. Retain failures and include CPU/memory
and hosting cost. Same-workstation emulation must remain labeled as such.

Immediate firing presentation already uses bounded local prediction; authoritative
hits still require the host. Our observed terrain improvement and unexplained
214–319 ms history are not evidence for either server technology. Continue
attributing frame work before replacing the functioning room transport.
