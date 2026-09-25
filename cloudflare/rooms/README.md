# cot-rooms — the Multiplayer v2 room Worker

The room half of `docs/MULTIPLAYER-V2.md` §3: one SQLite-backed Durable Object per
six-character room code (`Room`, `src/room.ts`) hosting the shared room actor
(`src/mp/room/roomActor.ts`) behind hibernatable WebSockets, and one match
container per room (`MatchContainer`, `src/matchContainer.ts`: the
`server/match` image on a `standard-2` instance) that the room starts at match
start, observes by alarm, proxies the seat sockets to, and lets sleep after the
verdict. Rooms never close because a player leaves: only the 24 h idle expiry
closes one. The same protocol is served by `server/rooms` for LAN and receipts,
so the browser `RoomClient` cannot tell the two apart.

## Routes

| Route | What |
|---|---|
| `GET /healthz` | shallow health: `{ ok, service: 'cot-rooms', backend: 'durable-object', matchHost }` |
| `GET /rooms/<CODE>` (WebSocket) | the room socket → `Room` for that code (exact origin, per-IP upgrade rate limit) |
| `GET /rooms/<CODE>/match` (WebSocket) | the match socket, proxied to the room's container at `/match` (the container verifies the seat token) |

Frames are UTF-8 JSON envelopes (`src/mp/room/protocol.ts`), text or binary in,
binary out. The room protocol, policy and limits (28 players + 8 spectators,
14 per side, 30 s admin grace, 10 s status polls, 24 h expiry, chat history 48,
120 messages / 10 s) live in `src/mp/room/` and are documented in
`src/mp/README.md` ("Rooms and sessions").

## Match lifecycle (what the Room object does on `start`)

1. `planStart` freezes the roster (connected players by seat, bots on the
   empty slots when `botsFill`), moves the room to `starting`, advances the round.
2. `getContainer(env.MATCH, code).startAndWaitForPorts()` boots the container
   (the match service answers `/healthz` about 3 s after start; the wait allows
   30 s), then `POST /control/matches` with the match config and the bearer
   `MATCH_CONTROL_SECRET` (`server/match/control.ts`).
3. Every seat receives `match_start` with its own HMAC seat token (signed with
   `MATCH_SEAT_SECRET`, the value the container holds as
   `COT_MATCH_SEAT_SECRET`), the round, seed, map and `matchUrl`
   (`/rooms/<CODE>/match`). A seat that reconnects during the match receives it again.
4. An alarm polls `GET /control/matches/<CODE>` every 10 s: `playing` moves the
   room to `playing`; a verdict records `lastResult`, returns the room to
   `waiting`, clears readiness and broadcasts `match_status ended`. Two
   unanswered polls in a row (the container died) record `match_lost` and return
   the room to `waiting` — the admin may start again.
5. The container sleeps 2 min after its last request (`sleepAfter`); the verdict
   linger is 5 s, so a finished match costs nothing beyond its own minutes. A
   rematch starts the same instance again (`start` replaces an ended actor).

The choice of alarm polls over a control WebSocket is deliberate: an outbound
socket from a Durable Object does not hibernate, while an alarm costs one
request every 10 s only while a match runs.

## Local development

Workers-runtime receipts (no Docker; the container binding is replaced by
`test/matchContainerStub.ts`, a Durable Object that answers the control routes
and the `/match` socket):

```sh
npm ci --prefix cloudflare/rooms
npm --prefix cloudflare/rooms run types      # regenerates worker-configuration.d.ts after a wrangler.jsonc change
npm --prefix cloudflare/rooms run typecheck
npm --prefix cloudflare/rooms test           # also: npm run test:net:v2:rooms from the repository root
```

`wrangler dev` with the container (Docker or Colima running; `docker info`
must succeed). Wrangler builds `server/match/Dockerfile` from the repository
root (`image_build_context`) and starts an instance per room the Worker asks for:

```sh
cd cloudflare/rooms
printf 'MATCH_SEAT_SECRET=%s\n' "$(openssl rand -hex 24)" > .dev.vars   # never committed
npx wrangler dev --port 8787
```

Without a container runtime, run the match service yourself and point the
Worker at it — the Room object then calls that URL instead of the binding and
proxies `/rooms/<CODE>/match` to it:

```sh
COT_MATCH_SEAT_SECRET=<same secret> COT_MATCH_MAX_ACTORS=8 node server/match/main.ts   # port 8791
cd cloudflare/rooms && npx wrangler dev --port 8787 --var MATCH_SHIM_URL:http://127.0.0.1:8791
```

The browser reaches either through `?mp=v2` with `VITE_ROOMS_URL=ws://127.0.0.1:8787`
(see `src/mp/session/endpoint.ts`). The LAN helper (`npm run server:mp`) needs no
Worker at all: `server/rooms/main.ts` serves rooms and the match on one port.

## Production deploy (only after green receipts, with a `docs/DEPLOYS.md` row)

Nothing here deploys itself; `wrangler deploy` uploads the Worker and builds and
pushes the container image with Docker (`linux/amd64`; on an Apple Silicon host
Docker builds the amd64 image through emulation, or use `--platform` support in
the Docker daemon). The account and cost decision (charter §10.1) is the owner's.

```sh
cd cloudflare/rooms
npx wrangler login                                   # the account that runs cot-private-rooms
npx wrangler secret put MATCH_SEAT_SECRET            # 32+ random bytes, hex; shared with the container by the Worker
npx wrangler secret put MATCH_CONTROL_SECRET         # optional; defaults to the seat secret
npx wrangler deploy --dry-run                        # config, bindings, image build
npx wrangler deploy                                  # Worker + image + rollout; wait several minutes before the first match
npx wrangler containers list                         # instances and status
npx wrangler containers images list                  # the pushed image
```

Then set `VITE_ROOMS_URL=wss://cot-rooms.<subdomain>.workers.dev` on the site
build so `?mp=v2` routes production rooms here (`ALLOWED_ORIGINS` in
`wrangler.jsonc` must list the site origin exactly). The v1 Worker
(`cot-private-rooms`) keeps serving v1 rooms until cutover (charter §8).

Configuration in `wrangler.jsonc`: `nodejs_compat` (the actor hashes and signs
with `node:crypto`), the `ROOM_CONNECT_LIMITER` rate limit (120 upgrades per IP
per minute — a fresh namespace id, not the v1 Worker's), `ALLOWED_ORIGINS`, the
`MATCH_SHIM_URL` var (empty in production), the `containers` entry
(`class_name: MatchContainer`, `image: ../../server/match/Dockerfile`,
`image_build_context: ../..`, `instance_type: standard-2`, `max_instances: 20`
— twenty simultaneous matches), the two Durable Object bindings and one SQLite
migration for both classes. Secrets: `MATCH_SEAT_SECRET`, `MATCH_CONTROL_SECRET`.

## Cost (Cloudflare's published rates, read 2026-09-25)

Containers bill only while running: `standard-2` is 1 vCPU / 6 GiB / 12 GB.
Workers Paid includes 375 vCPU-minutes and 25 GiB-hours a month, then
$0.000020 per vCPU-second and $0.0000025 per GiB-second; egress from North
America and Europe is $0.025/GB beyond 1 TB. A 15-minute 14v14 match at one vCPU
is 15 vCPU-minutes and 1.5 GiB-hours: about $0.02 of CPU plus $0.014 of memory
beyond the included allotment, and roughly 0.5 MB/s of egress (charter §4).
A sleeping container and an idle room cost nothing beyond Durable Object storage.

## Files

| File | Owns |
|---|---|
| `src/index.ts` | routes, origin, rate limit, the match-socket proxy |
| `src/room.ts` | the `Room` Durable Object: hibernation attachments, SQLite state blob, alarms, the actor's ports |
| `src/matchHost.ts` | `MatchHost` over the container binding or the HTTP shim; `proxyMatchSocket` |
| `src/matchContainer.ts` | the `Container` subclass (port 8791, `sleepAfter` 2 m, env from the secrets) |
| `src/util.ts`, `src/env.d.ts` | helpers; the secrets' types merged into the generated `Env` |
| `test/rooms.test.ts` | 8 Workers-runtime tests: routes/origins, admission + hashes, 28 + 8 capacity, container start / proxy / polls / verdict / rematch, lost host + refused start, admin migration + hibernation resume, expiry + deallocation, chat + rate limit |
| `test/matchContainerStub.ts`, `test/worker.ts`, `wrangler.test.jsonc` | the test Worker with the container stub bound as `MATCH` |
