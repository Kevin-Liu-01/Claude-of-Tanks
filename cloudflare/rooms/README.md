# cot-rooms — the Multiplayer v2 room Worker (Free plan, peer-to-peer matches)

The room half of `docs/MULTIPLAYER-V2.md` §3 and §13: one SQLite-backed Durable
Object per six-character room code (`Room`, `src/room.ts`) hosting the shared room
actor (`src/mp/room/roomActor.ts`) behind hibernatable WebSockets. Since the
peer-to-peer re-scope (owner 2026-09-28) the match itself runs in the host
commander's browser over WebRTC: the Room object elects the host, signs the
match's seat tokens with a per-match secret only the host receives, relays the
WebRTC signaling between the host and its peers, follows the host's reports, and
migrates the host when it drops (`src/mp/room/p2pMatchHost.ts`). It never
carries game traffic. Rooms never close because a player leaves: only the 24 h
idle expiry closes one. The same protocol is served by `server/rooms` for LAN
and receipts, so the browser `RoomClient` cannot tell the two apart.

The dedicated-service backend of the first design (a match container per room)
left the tree with the cutover of 2026-09-29 (`docs/MULTIPLAYER-V2.md` §13.10).

## Routes

| Route | What |
|---|---|
| `GET /healthz` | shallow health: `{ ok, service: 'cot-rooms', backend: 'durable-object', matchHost: 'p2p' }` |
| `GET /rooms/<CODE>` (WebSocket) | the room socket → `Room` for that code (exact origin, per-IP upgrade rate limit) |
| `GET /rooms/<CODE>/match` (WebSocket) | `503 match_host_unavailable`: the match runs between the browsers, never here |

Frames are UTF-8 JSON envelopes (`src/mp/room/protocol.ts`), text or binary in,
binary out. The room protocol, policy and limits (28 players + 8 spectators,
14 per side, 30 s admin grace, 8 s host grace, 10 s report interval, 24 h expiry,
chat history 48, 120 messages / 10 s, 8 KB signals) live in `src/mp/room/` and
are documented in `docs/MULTIPLAYER-V2.md` §13.2 and its addendum §13.2.1.

## Match lifecycle (what the Room object does with the p2p host)

1. `start` (the admin): `planStart` freezes the roster, moves the room to
   `starting`, advances the round; the p2p host elects the match host — the admin
   unless it declined (`host_decline`), else the lowest `joinedAt` connected
   commander that has not declined, a declined commander only as the last one,
   never a spectator — and writes `room.host = { transport: 'p2p', hostId,
   generation: previous + 1, since }`.
2. Every seat receives `match_start` with `matchUrl: rtc://<CODE>/<generation>`,
   `hostId`, and its own seat token signed with `hostSecret =
   sha256(MATCH_SEAT_SECRET + ':' + matchId)`; the host's copy alone carries
   `hostSecret`. Then `host_changed { reason: 'start' }` (the host's copy with
   the secret again). A seat that resumes during the match receives its
   `match_start` again with the current generation.
3. Peers open their data channels to the host through `room_signal`: the room
   checks the seats, the host, the phase, the generation and the size, adds
   `from`, relays, and never parses SDP (`signal_target` / `signal_generation` /
   `signal_phase` / `signal_size`).
4. The host reports (`match_report`, every 10 s and on every phase change, with
   its tick): `playing` moves the room to `playing`; `ended` with a verdict
   records `lastResult`, returns the room to `waiting`, clears readiness and the
   election, and broadcasts `match_status ended`.
5. The host's room socket absent for 8 s (an alarm), its reports silent for 30 s
   (an alarm), a leave, a kick or a decline (P1b: at once, to the next candidate —
   willing first, a declined commander as the last resort, never a seat that
   already stepped down by declining while hosting this match): the room elects
   the next host, `generation + 1`, and broadcasts `host_changed { hostId,
   generation, resumeTick, reason }`, the new host's copy with the secret. The old
   host coming back is a peer. No commander left after a drop or a leave:
   `match_status lost`, the room `waiting` — the admin may start again; after a
   decline the host keeps hosting — unless the decline says `unable: true` (the seat
   cannot host at all): then the match is lost at once (2026-09-30, §13.11).
6. The lifecycle rules of 2026-09-30 (docs/MULTIPLAYER-V2.md §13.11, proven by
   `tools/mp-room-lifecycle.mjs` against this Worker under wrangler dev and the
   deployed one): a room every seat has left keeps its code for the idle TTL and the
   next seat to join owns it; the admin lease is an alarm only while a connected seat
   exists to migrate to (a later admission runs a due lease at once — no 30 s re-arm
   loop on an abandoned room); a seat whose socket is gone is reaped after
   `ROOM_SEAT_DISCONNECT_TTL_MS` (5 min) while the room waits, kept for a running
   match (its lease restarts at the end); another seat's leave never clears a
   disconnected admin's lease.

Alarms carry every deadline (admin lease, host lease, report budget, 24 h expiry);
the object hibernates between them and restores the host state from its SQLite
row (the election, the last report, the leases, the match URL).

## Local development

Workers-runtime receipts (no Docker) — two vitest projects:

```sh
npm ci --prefix cloudflare/rooms
npm --prefix cloudflare/rooms run types      # regenerates worker-configuration.d.ts after a wrangler.jsonc change
npm --prefix cloudflare/rooms run typecheck  # src and test tsconfigs
npm --prefix cloudflare/rooms test           # also: npm run test:net:v2:rooms from the repository root
```

One Workers-runtime project (`wrangler.test.jsonc`, `vitest.config.ts`): the real
Worker and Room object. `test/rooms.test.ts` is the room lifecycle (routes and
origins, create / join / auto-balance, 28 + 8 seats, admin migration and the
rotated capability across hibernation, the 24 h expiry, bounded chat and the
rate window); `test/p2p.test.ts` the peer-to-peer host: the election, the rtc://
URL, the per-match secret only on the host's copies, tokens under it, the relay
and its refusals, the host's reports, migration after the 8 s grace across an
eviction, the old host back as a peer, a decline ladder ending in a lost match,
silence past three polls, the keepalive frame and the coalesced broadcasts.

Without a browser, the whole p2p room flow also runs on the in-process service
(`server/rooms`, `matchTransport: 'p2p'`) from the repository root:

```sh
node tools/mp-rooms-p2p-e2e.mjs          # five raw room sockets, ~12 s (the 8 s host grace is real time)
```

`wrangler dev` needs only the seat secret:

```sh
cd cloudflare/rooms
printf 'MATCH_SEAT_SECRET=%s\n' "$(openssl rand -hex 24)" > .dev.vars   # never committed
npx wrangler dev --ip 127.0.0.1 --port 8787
```

The browser reaches it with `VITE_ROOMS_URL=ws://127.0.0.1:8787` (see
`src/mp/session/endpoint.ts`; since the cutover of 2026-09-29 the rooms Worker is
the only multiplayer path, no switch). The LAN helper (`npm run server:mp`) needs no
Worker at all: `server/rooms/main.ts` serves rooms on one port and runs the match
in-process by default (`COT_ROOMS_MATCH_TRANSPORT=p2p` selects the browser-hosted
match instead).

### A Workers-runtime crash and its workaround (2026-09-28)

Inside one `webSocketMessage` event, sending to the socket that delivered the
message, awaiting storage (`setAlarm`) and then closing that socket crashed the
runtime under vitest (`kj/async.c++: Promise callback destroyed itself`; bisected
on the last commander's `room_leave`: its ack, the lost end re-arming the alarm
from 30 s to 24 h, its close — any two of the three are fine). `Room.#close`
therefore detaches a retired socket at once and closes it from a zero-delay timer
after the event (`#flushCloses`), which also keeps the ack ahead of the close.

## Production deploy (only after green receipts, with a `docs/DEPLOYS.md` row)

Nothing here deploys itself, and the lane that built this did not deploy: the
integrator does, on the Free plan, once.

```sh
cd cloudflare/rooms
npx wrangler login                                   # the account that runs cot-private-rooms
npx wrangler secret put MATCH_SEAT_SECRET            # 32+ random bytes, hex; the per-match host secrets derive from it
npx wrangler deploy --dry-run --outdir /tmp/cot-rooms-dry   # bindings: ROOMS, ROOM_CONNECT_LIMITER, ALLOWED_ORIGINS
npx wrangler deploy
```

Then set `VITE_ROOMS_URL=wss://cot-rooms.<subdomain>.workers.dev` on the site
build so production rooms route here (`ALLOWED_ORIGINS` in `wrangler.jsonc`
must list the site origin exactly); the official site also resolves this Worker
by name (`src/officialHost.ts`) when the variable is unset. Since the cutover of
2026-09-29 (docs/MULTIPLAYER-V2.md §13.10) this is the only multiplayer path:
the v1 Worker (`cot-private-rooms`) serves nothing the client asks for.

Configuration in `wrangler.jsonc`: `nodejs_compat` (the actor hashes and signs
with `node:crypto`), the `ROOM_CONNECT_LIMITER` rate limit (120 upgrades per IP
per minute), `ALLOWED_ORIGINS`, one Durable Object binding (`ROOMS` → `Room`)
and the migration chain. Secret: `MATCH_SEAT_SECRET`. The migrations are the
deployed history: `v1` created `Room` and the container class of the first
design, `v2` deleted that class (a version may not stop exporting a class
existing objects depend on; a deletion is always a new tag after the tag that
created the class — never edit an applied tag). `@cloudflare/containers` stays
in `package.json` until an integrator with the lockfile removes it.

## Cost

Free plan: Durable Object requests and storage within the daily allowance; the
Worker relays a few dozen signaling messages per join and one report every 10 s
per running match, nothing per tick. Game traffic runs between the browsers.

P1b cost pass (2026-09-28, `docs/MULTIPLAYER-V2.md` §13.8 "room cost after P1b"):

- The client's keepalive is the exact text frame `ping`; the `Room` constructor
  sets `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`,
  so the runtime answers on every accepted socket without waking the object — the
  frame is never a handled message, never a request, never duration. The actor's
  24 h idle expiry reads `getWebSocketAutoResponseTimestamp` through its
  `keepaliveAt` port, so a room whose seats only keep alive stays open. The
  `room_ping` envelope (clients deployed before the frame) is still answered by
  the actor and billed as before.
- `room_state` broadcasts are throttled to one per `ROOM_STATE_COALESCE_MS`
  (300 ms) per room: the first change of a burst goes out at once, the rest ride
  one trailing broadcast carrying the newest revision, on the object's own
  `setTimeout` (`defer` port — a pending timer keeps the object awake and is not
  an alarm, so not a request); joins, leaves, disconnects, phase changes and
  elections broadcast at once. `room_ack { revision }` still names the state a
  command produced.
- A running host's `host_decline` is treated as its departure from hosting: the
  next candidate is elected at once (`reason: 'declined'`), never a seat that
  already stepped down by declining while hosting this match (`steppedDown` in
  the stored state); with nobody left the host keeps hosting.

Cloudflare bills outgoing WebSocket messages at nothing and incoming ones at
20:1; the certification's tables count every handled client→room message as one
request (the conservative rule) and show the published rule beside it.

## Files

| File | Owns |
|---|---|
| `src/index.ts` | routes, origin, rate limit; the match socket route answers 503 (the match never runs here) |
| `src/room.ts` | the `Room` Durable Object: hibernation attachments, SQLite state blob, alarms, deferred socket closes, the actor's ports |
| `src/matchHost.ts` | `createMatchHost`: the peer-to-peer host |
| `src/util.ts`, `src/env.d.ts` | helpers; the secret's type merged into the generated `Env` |
| `test/p2p.test.ts` | 8 Workers-runtime tests of the peer-to-peer host |
| `test/rooms.test.ts` | 6 Workers-runtime tests of the room lifecycle |
| `test/client.ts` | the room-socket client both files drive |
| `wrangler.test.jsonc`, `vitest.config.ts` | the test Worker |
