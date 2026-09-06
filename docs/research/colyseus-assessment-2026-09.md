# Colyseus assessment for private multiplayer

Reviewed 2026-09-05 against the official documentation currently labeled v0.18.
This is a documentation/code comparison, not a Colyseus benchmark or migration.
No dependency, hosting, database or production configuration was changed for it.

## Recommendation

Keep the present host-authoritative WebRTC architecture: Cloudflare signaling
for Private rooms and local signaling for LAN. Colyseus is a credible candidate for a future
dedicated-server product, but replacing our transport, state ownership and
prediction contracts is not a demonstrated latency improvement. It would also
not repair browser shader compilation, rendering stalls or hardware contention.

Our current measurements and their limitations remain in
[the responsiveness report](multiplayer-response-latency-2026-09.md).

## What the framework provides

The new 0.18 netcode offers fixed-timestep input, local prediction/reconciliation,
remote smoothing, predicted events/spawns and rewind support. These are actual
new built-in APIs; the older Phaser tutorial implements the concepts manually.
The application still supplies the shared deterministic simulation step.
[Official netcode overview](https://docs.colyseus.io/netcode).

Its prediction contract reinforces the invariants we need: replay the same
wire input and step on both sides; acknowledge consumed input; keep one-shot
effects out of replay; and separate persistent simulation divergence from
occasional network jitter. These are useful review criteria for our existing
fixed-step movement, sequence-owned input and deduplicated firing feedback,
not reasons to introduce a second prediction loop.
[Determinism contract](https://docs.colyseus.io/netcode/determinism).

Our authority steps the world using latest held controls, rather than consuming
exactly one historical command per simulation step. Its input queue therefore
cannot be replaced mechanically with Colyseus's one-command-per-step controller.
Correction EMA/peak diagnostics, bounded redundant input delivery and predicted
projectile identity handoff are reasonable isolated experiments. They are not
implemented by this assessment and need loss/reorder, rejection and lifecycle
tests before adoption.
[Server input](https://docs.colyseus.io/netcode/server-input),
[recipes](https://docs.colyseus.io/netcode/recipes).

Rewind support aligns historical target state with the shooter's rendered time;
the application still performs collision tests. It is not automatically the
right rule for our traveling shells, guided missiles, moving armor and terrain.
A future experiment must distinguish instantaneous hit tests from projectile
flight and keep real damage authoritative. Instant local muzzle/audio feedback
does not require pretending that a projectile has already hit.
[Lag compensation](https://docs.colyseus.io/netcode/lag-compensation).

## Hosting and transport are not interchangeable

Colyseus is a Node.js authoritative-server framework, not a database or a
serverless switch for our browser host. A dedicated deployment could move match
simulation off the host player's renderer, but adds server operations and a
client-to-server path; any performance advantage would need a controlled test.
[Framework overview](https://docs.colyseus.io/).

Its WebRTC room plugin handles SDP/ICE signaling only. Peer streams are direct,
but Colyseus state synchronization still goes through its server. Therefore,
using the plugin would not transparently move its prediction/state stack onto
our current gameplay data channels.
[WebRTC plugin](https://docs.colyseus.io/room/plugins/webrtc).

Colyseus defaults to WebSocket. Its real unreliable state/input channel uses
experimental WebTransport, currently limited to the JavaScript/TypeScript SDK.
The documented fallback is not transparent: on WebSocket, `.unreliable()` state
fields stop updating after initial synchronization, while unreliable input
falls back to reliable delivery. A migration must explicitly preserve our
loss-tolerant gameplay delivery and test fallback behavior.
[Transport](https://docs.colyseus.io/server/transport),
[WebTransport caveats](https://docs.colyseus.io/server/transport/webtransport).

A small single-process deployment can use in-memory room storage and presence,
without Redis or a player database. Horizontal scaling needs shared room data
and inter-process presence. The room driver can use PostgreSQL, but that alone
does not replace the separate presence requirement; the documented scaling
setup uses Redis. Do not claim either that all Colyseus deployments require
Redis or that selecting a PostgreSQL driver makes distributed hosting
infrastructure-free.
[Driver](https://docs.colyseus.io/server/driver),
[presence](https://docs.colyseus.io/server/presence),
[scaling](https://docs.colyseus.io/scalability).

## Cleanup and information boundaries

The framework separates temporary drops, reconnection, permanent leave and
room disposal. Empty rooms auto-dispose by default, while reconnecting seats
can be retained for an explicit timeout. An indefinite manual reservation needs
its own termination policy. Our equivalent must remain bounded across crash,
sleep, failed reconnect, explicit leave and host disappearance.
[Lifecycle](https://docs.colyseus.io/room/lifecycle),
[reconnection](https://docs.colyseus.io/room/reconnection).

The idle-kick plugin counts inbound keepalive frames as activity. That is not
a complete abandoned-host policy: our guest traffic must never renew the
host's own lease, and an open-but-silent host must expire. Keep the current
90-second disconnected-host and 180-second silent-host rules, with durable
alarm cleanup and independent guest seats.
[Idle-kick caveat](https://docs.colyseus.io/room/plugins/idle-kick).

Colyseus state is visible to every client by default; per-client StateView
filtering is opt-in. A future adapter would have to preserve our server-side
spotting filter before serialization. Hiding already-transmitted enemies only
in the renderer is unacceptable.
[State visibility](https://docs.colyseus.io/state/view).

## Conditions before any future migration

Use a separate, user-approved prototype with the same tank, map, player count,
network impairment and hardware as the current game. Compare input-to-feedback,
accepted-shot delay, p99 frame gaps, correction magnitude, bandwidth, room
cleanup and reconnect behavior. Include distant clients and real relay paths,
not only two local browsers. Preserve authority over ammo, collision, damage
and results. Migrate only if that experiment demonstrates a worthwhile gain;
the framework's feature list is not a performance receipt.
