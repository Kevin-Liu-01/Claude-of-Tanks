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
must succeed, and the Docker CLI needs the buildx plugin — see the local run
below). Wrangler builds `server/match/Dockerfile` from the repository root
(`image_build_context`) and starts an instance per room the Worker asks for:

```sh
cd cloudflare/rooms
printf 'MATCH_SEAT_SECRET=%s\n' "$(openssl rand -hex 24)" > .dev.vars   # never committed
npx wrangler dev --port 8787 --var MATCH_BATTLE_LIMIT_S:20   # the var: a 20 s clock so a local e2e reaches a verdict
```

Then, from the repository root, the headless rooms end-to-end against it:

```sh
node tools/mp-rooms-e2e.mjs --endpoint=ws://127.0.0.1:8787 --clients=4 --battle=20 --leave-at=8
node tools/mp-rooms-e2e.mjs --endpoint=ws://127.0.0.1:8787 --clients=28 --battle=20 --leave-at=8
```

(`--origin` defaults to the site origin `ALLOWED_ORIGINS` allows; `--battle`
must name the host's clock, here the `MATCH_BATTLE_LIMIT_S` value.)

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

## Local run — 2026-09-25

Host: Apple Silicon macOS, Docker 29.5.2 in colima (aarch64 VM), wrangler
4.140.0, Node 24.13.0; the `mp/rooms` worktree at 51a368113 plus the fixes
this section names. Nothing was deployed. Logs and the docker wrapper are in
the session scratchpad (`mp-rooms/container/`).

**What ran**

1. `npm ci --prefix cloudflare/rooms`, then `npx wrangler deploy --dry-run
   --outdir <dir>`: passes in 43 s — a 132 KiB bundle, the bindings (`ROOMS`,
   `MATCH`, `ROOM_CONNECT_LIMITER` 120 / 60 s, `ALLOWED_ORIGINS`,
   `MATCH_SHIM_URL`) and the container `cot-rooms-matchcontainer` from
   `server/match/Dockerfile`, whose `linux/amd64` image wrangler builds (and
   untags again) during the dry run — under binfmt emulation here, the `npm ci`
   stage 25 s. The first attempt failed with `unknown flag: --load` (`Docker
   build exited with code: 125`): wrangler runs `docker build --load …
   --platform linux/amd64 --provenance=false`, which needs the buildx plugin,
   and Homebrew's `docker` CLI ships without it. Once per host:
   `brew install docker-buildx && ln -sfn /opt/homebrew/opt/docker-buildx/bin/docker-buildx ~/.docker/cli-plugins/docker-buildx`.
2. `wrangler dev` with the container binding (`.dev.vars` seat secret,
   `--var MATCH_BATTLE_LIMIT_S:20`, `DOCKER_HOST` = colima's socket): the Worker
   is `Ready` in about 50 s; miniflare builds the image, pulls
   `cloudflare/proxy-everything` and starts one instance per room the Room
   object asks for (`docker ps`: `workerd-cot-rooms-MatchContainer-<id>` plus a
   `-proxy` sidecar). Local container status: **runs** (wrangler 4 with
   Docker), with one caveat — miniflare hard-codes `--platform linux/amd64`
   for the local image, so on Apple Silicon the match service ran under qemu:
   45 s until `match service listening`, 125 % CPU idle, and the Room's
   `startAndWaitForPorts` gave up first (`match container error { id:
   'NETMLH', error: 'undefined' }`, `match host unavailable`, then `Activity
   expired, signalling container to stop`); the client's `start` timed out at
   its 10 s. Not representative, so the runs below use a docker wrapper for
   `wrangler dev` only (`WRANGLER_DOCKER_BIN`, below) that rewrites
   `linux/amd64` to the host's own architecture: the image is arm64, the
   service listens 3.6 s after the container starts, and every step passes.
3. `node tools/mp-rooms-e2e.mjs --endpoint=ws://127.0.0.1:8787` (headless
   sessions with Origin `https://cot.kevinliu.studio`):
   - 4 clients, `--battle=20 --leave-at=8`: PASS in 37.7 s wall — the room on
     the Durable Object, 4/4 welcomed by the match in the container, the
     creator leaves at 8 s and admin migrates to p2 with the match running on
     (presented tick 198 → 318 over 2 s), a dropped seat resumes with the same
     token, the verdict `draw:time_limit` at 20 s reaches every client and the
     room (`waiting`, `lastResult`), rematch 3/3 welcomed on the same instance.
   - 28 clients (14 v 14, same flags): PASS in 39.1 s wall — 28/28 welcomed,
     admin migrated, resume, verdict, rematch 27/27. The container during the
     rematch's countdown: 5 % CPU, 454 MB RSS, tick p50 0.09 / p95 1.76 / max
     3.59 ms, 0 dropped snapshots, 0 rejected inputs, 56 socket connections.
   - `--no-verdict --request-timeout=45000` (the production probe below): PASS.
   - The instance slept on schedule (`match container stopped { exitCode: 0,
     reason: 'exit' }` two minutes after its last request) and a rematch
     started it again.

**Fixed on the way** (this branch)

- `Room.webSocketClose` echoes the client's close (`ws.close(code, reason)`):
  the hibernation API leaves the handshake to the object, and without the
  echo a `ws` client saw an abnormal 1006 after 10 s on every room leave
  (probe 10 011 ms → 10 ms), which held the e2e process ~40 s after PASS.
- `test/rooms.test.ts` verifies the seat token with the Worker's own
  `env.MATCH_SEAT_SECRET`: the vitest suite reads a `.dev.vars` too (it
  overrides `wrangler.test.jsonc`'s `vars`), so the recipe's file failed the
  container test against the old constant.
- `MATCH_BATTLE_LIMIT_S` (a Worker var, local only) reaches the container as
  `COT_MATCH_BATTLE_LIMIT_S` (`server/match/main.ts`): the Room posts no battle
  limit, so a local match would run the ruleset's 15-minute clock. Never set in
  production.
- `tools/mp-rooms-e2e.mjs`: `--endpoint`, `--origin`, `--no-verdict`,
  `--request-timeout`.

**Not proven here**

- The amd64 image at runtime (only under emulation, above); the dry run proves
  the build the deploy performs, not the service on Cloudflare's hosts.
- Cloudflare's container cold start, the `standard-2` limits, `max_instances`
  (not enforced locally), the rate limiter's behaviour, the production secret.
- Open for the integrator: the admin's `start` is acknowledged only after
  `startAndWaitForPorts` (up to 30 s), while `RoomClient`'s command timeout is
  10 s — a cold start slower than about 9 s makes the browser's `start` reject
  even though the room proceeds and sends `match_start` once the container is
  up. Ack `starting` before the boot, or give `start` a longer timeout. Also
  `MatchContainer.onError` logs `error: 'undefined'`: the containers library
  rejects with something that is not an Error.
- `npm run typecheck:rooms` reports 430 errors in DOM-typed world/vehicle
  modules the actor's import closure pulls in (`src/world/wreckBakeClient.ts`
  and friends); identical at 51a368113, none in `cloudflare/rooms`.

**Reproduce**

```sh
# once per host (Homebrew docker CLI): the buildx plugin wrangler's build needs
brew install docker-buildx && ln -sfn /opt/homebrew/opt/docker-buildx/bin/docker-buildx ~/.docker/cli-plugins/docker-buildx
cd cloudflare/rooms && npm ci && npx wrangler deploy --dry-run --outdir /tmp/cot-rooms-dry
printf 'MATCH_SEAT_SECRET=%s\n' "$(openssl rand -hex 24)" > .dev.vars
# Apple Silicon only, wrangler dev only (never deploy through it): build/run the local image natively
cat > /tmp/docker-native-arch.sh <<'EOF'
#!/bin/bash
set -e
host_arch="linux/$(uname -m | sed 's/^aarch64$/arm64/; s/^x86_64$/amd64/')"
args=(); for a in "$@"; do args+=("${a//linux\/amd64/$host_arch}"); done
exec /opt/homebrew/bin/docker "${args[@]}"
EOF
chmod +x /tmp/docker-native-arch.sh
WRANGLER_DOCKER_BIN=/tmp/docker-native-arch.sh DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \
  npx wrangler dev --ip 127.0.0.1 --port 8787 --var MATCH_BATTLE_LIMIT_S:20
# from the repository root, once "Ready on http://127.0.0.1:8787" is printed
node tools/mp-rooms-e2e.mjs --endpoint=ws://127.0.0.1:8787 --clients=4 --battle=20 --leave-at=8
node tools/mp-rooms-e2e.mjs --endpoint=ws://127.0.0.1:8787 --clients=28 --battle=20 --leave-at=8
# after stopping wrangler dev: it stops the match containers but leaves the -proxy sidecars running
docker rm -f $(docker ps -aq --filter name=workerd-cot-rooms) 2>/dev/null
```

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

What the deploy needs, from the local run (2026-09-25):

- Docker running with the buildx plugin on the deploying host (`docker info`,
  `docker buildx version`); on Apple Silicon the `linux/amd64` image builds
  through binfmt emulation (43 s measured, `npm ci` stage 25 s). Never point
  `WRANGLER_DOCKER_BIN` at the native-arch wrapper for a deploy.
- Secrets before the first deploy: `MATCH_SEAT_SECRET` (32+ random bytes,
  hex; the Worker hands the same value to every container as
  `COT_MATCH_SEAT_SECRET`, so there is no second secret to set on the
  container) and, optionally, `MATCH_CONTROL_SECRET` (defaults to the seat
  secret; the container receives it as `COT_MATCH_CONTROL_SECRET`).
- `ALLOWED_ORIGINS`: the exact site origin(s), comma-separated — the Worker
  checks room and match upgrades against it and the container checks the
  proxied `/match` upgrade against the same list (`COT_MATCH_ALLOWED_ORIGINS`).
  A preview origin must be listed explicitly.
- `MATCH_SHIM_URL` empty and no `MATCH_BATTLE_LIMIT_S` in production: the
  ruleset's clock (15 minutes for standard) decides.
- Instance type `standard-2` (1 vCPU, 6 GiB): a 28-client match measured 5 %
  CPU and 454 MB RSS on an arm64 host; the image is 75 MB compressed.
  `max_instances` 20 = twenty simultaneous matches.
- After `wrangler deploy`, `wrangler containers list` and several minutes of
  patience before the first match (provisioning); `wrangler containers images
  list` shows the pushed image.

Probe after deploying (from the repository root; four headless seats, Origin
= the site origin, no in-process server; the match on the container runs on
to its own clock after the probe leaves — about 15 vCPU-minutes, ~$0.03):

```sh
node tools/mp-rooms-e2e.mjs --endpoint=wss://cot-rooms.<subdomain>.workers.dev --clients=4 --leave-at=8 --no-verdict --request-timeout=45000
# expected: "round 1 <id>: welcomed 4", "admin after creator left: p2", "resume: p3 same token true", "mp rooms e2e: PASS"
# a full verdict on production's own clock: --battle=900 instead of --no-verdict (16 minutes of wall time)
```

`--request-timeout=45000` covers a cold container start inside the admin's
`start` (the client's own timeout is 10 s; see "Not proven here" above). A
different `ALLOWED_ORIGINS` needs `--origin=<that origin>`.

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
