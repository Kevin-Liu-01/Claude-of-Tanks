# Multiplayer v2 wire (`src/mp/wire`)

The one binary schema the browser client (`src/mp/*`) and the match server
(`server/match/*`) share. Pure TypeScript: no DOM, no `three`, no Node
built-ins; it runs unchanged in both. Import from `src/mp/wire/index.ts`.

Every frame is one binary WebSocket message: `u8 WIRE_VERSION`, `u8 type`,
then the fixed layout below. Integers are little-endian; `varint` is unsigned
LEB128 (≤ 5 bytes); `string` is `varint byteLength` + UTF-8 bytes with a
per-field bound. Angles are `u16` turns (1/65536 of a revolution), positions
`i32` millimetres, tank velocities `i16` cm/s, shell velocities `i16` dm/s,
reload timers `u16` in 2 ms steps (rounded up so a positive remainder never
reads as ready). `quantize.ts` holds the conversions; round trips are
bit-exact on the integer side.

## API the client must use

| Export | Purpose |
|---|---|
| `encodeMessage(message, baseline?)` | Any `WireMessage` → `Uint8Array` (throws `WireError` on invalid producer input). A delta `SnapshotPacket` needs the baseline `SnapshotFrame` it was built against. |
| `decodeMessage(bytes, { maxBytes?, resolveBaseline? })` | Never throws. Returns `{ ok: true, message, bytes }` or `{ ok: false, error: WireError, bytes }`. `resolveBaseline(tick)` supplies the acked frame so relative row groups decode; without it a delta with relative groups is rejected as `missing_baseline`. |
| `buildSnapshotPacket(frame, baseline)` | Server side: full `SnapshotFrame` + the viewer's acked frame (or `null` for a keyframe) → `SnapshotPacket`. |
| `applySnapshotPacket(packet, baseline)` | Client side: packet + the frame at `packet.baseTick` → full `SnapshotFrame`. Throws `WireError('missing_baseline')` when the delta's base is unknown; wait for the next keyframe (the server sends one when the acked baseline is missing). |
| `peekMessageType(bytes)` | The type byte without decoding, or `null`. |
| `quantize*` / `dequantize*`, `wrapAngle`, `angleUnitsDelta` | Unit conversions (`quantize.ts`). |
| `eraPlateNames(armor)`, `eraPlateIndices(armor)` | ERA cassette index ↔ plate name (see ERA below). |
| `shellTypeName(index)`, `shellTypeIndex(name)` | `ShellRow.shellType` ↔ shell type string. |
| `ByteWriter`, `ByteReader`, `WireError` | Primitives for tooling and tests. |
| `constants.ts` | `MESSAGE_TYPE`, `CLOSE_REASON`(+`_NAMES`), `TEAM`, `PHASE`, `VERDICT`, `ENTITY_FLAGS`, `CONTROL_FLAGS`, `ACTION_BITS`, `ROW_GROUP`, `HELLO_CAPABILITY`, `EVENT_KIND_NAMES`, every limit and scale. |
| `messages.ts` | The TypeScript shape of every message, row, patch and frame. |

Entity ids are `1..MAX_ENTITIES (64)`; `0` (`NO_ENTITY`) is a spectator
viewer. Seats are `0..63`; `255` (`NO_SEAT`) marks a bot. `NO_TICK`
(`0xffffffff`) is "none" in every u32 tick field.

## Messages

Client → server

| Type | Layout |
|---|---|
| `HELLO` (1) | `u16 protocolVersion`, `u32 capabilities` (`HELLO_CAPABILITY` bits), `string token ≤ 1024`, `string clientBuild ≤ 64` |
| `INPUT` (2) | `u32 clientTick` (tick of the newest control), `u32 snapshotAckTick` (newest assembled snapshot or `NO_TICK`), `u8 interpDelayMs` (the client's interpolation delay, used for lag compensation), `u8 count` (1..3), then `count` controls oldest first; control `i` is for tick `clientTick − count + 1 + i`. Control: `i8 throttle`, `i8 steer` (±127 = ±1), `u8 flags` (`CONTROL_FLAGS`: FIRE_HELD, BRAKE, AIM_LOCKED), `u16 aimYaw` (turn), `i16 aimPitch` (±32767 = ±π/2), `u16 aimDistance` (5 cm units), `u8 shellSlot` (0..2), `u16 fireSeq`, `u16 actionSeq`, `u8 actionBits` (`ACTION_BITS`). 15 B per control; a full frame is 57 B (3.4 KB/s at 60 frames/s, 1.7 KB/s at 30). |
| `SNAPSHOT_ACK` (3) | `u32 tick` — the newest assembled snapshot, or `NO_TICK` to drop the baseline and request a keyframe (for viewers that send no INPUT, and for any client recovering from a missing delta baseline). |
| `PING` (4) | `u32 clientTimeMs`, `u32 snapshotAckTick` |
| `CHAT` (5) | `string text ≤ 960 B` (≤ 240 chars after the server's normalization) |
| `LEAVE` (6) | `u8 reason` (`CLOSE_REASON`) |

Server → client

| Type | Layout |
|---|---|
| `WELCOME` (16) | `u16 protocolVersion`, `u8 tickHz` (60), `u8 snapshotHz` (30), `u8 seat`, `u8 entityId` (`NO_ENTITY` for spectators), `u8 team`, `u32 serverTick`, `u32 serverTimeMs`, `u32 seed`, `u32 capabilities` (the subset the server honours), `string roomId`, `string mapId`, `string mode`, `string rulesetJson ≤ 4096` (the `MatchRuleset` the match plays by), `u8 rosterCount`, roster entries: `u8 entityId`, `u8 seat`, `u8 team`, `u8 flags` (bit0 bot, bit1 connected), `string playerId`, `string name`, `string specId`. |
| `SNAPSHOT` (17) | See below. |
| `EVENT` (18) | `u32 tick`, `u8 count ≤ 64`, entries: `u8 kind` (`EVENT_KIND_NAMES` index, or 255 followed by `string kind ≤ 64`), `string json ≤ 4096` (a JSON object). Reliable one-shots: the authority's `shell_fired`, `shell_hit`, `shell_impact`, `tank_destroyed`, `tank_spotted`, `module_state`, `world_prop_destroyed`, `match_*`, ammo/consumable/magazine/special-action denials and the server's `chat`, `roster` and `admin` events. Payloads are the authority's event records verbatim (ids are the roster's `playerId` strings); they are low-rate, so they stay JSON while rows and inputs are fixed binary. |
| `PONG` (19) | `u32 clientTimeMs` (echo), `u32 serverTimeMs`, `u32 serverTick` |
| `CLOSE` (20) / `ERROR` (21) | `u8 reason` (`CLOSE_REASON`), `string detail ≤ 240`. CLOSE precedes the socket close; ERROR is non-fatal (a rejected input or chat). |

## SNAPSHOT

```
u32 tick, u32 serverTimeMs, u8 flags (SNAPSHOT_FLAGS: KEYFRAME, HAS_VIEWER, HAS_MODE_STATE, HAS_VERDICT)
u32 baseTick (NO_TICK on keyframes), u32 ackedInputTick, u16 ackedFireSeq, u16 ackedActionSeq
i8 inputMarginTicks (how many ticks early the newest input arrived; negative = late; 127 = unknown)
u8 phase, u16 countdownMs, u32 battleTimeMs, u8 verdict, [string verdictReason if HAS_VERDICT], u32 destructibleRevision
index list destroyed (keyframe: every destroyed obstacle index; delta: indices destroyed since the baseline)
u8 entityCount, entity rows ...
u8 removedCount, u8 entityId ... (entities in the baseline that are hidden now)
u16 shellCount, shells: u16 id, u8 shooterEntityId, 3 × i32 pos mm, 3 × i16 vel dm/s, u8 shellType, u8 flags (GUIDED)
[HAS_VIEWER] viewer section, [HAS_MODE_STATE] string modeStateJson ≤ 8192
```

An *index list* is `varint count`, then the first index and the gaps
(`index − previous − 1`) as varints: sorted, strictly increasing.

**Entity row** = `u8 entityId`, `varint mask` (`ROW_GROUP` bits), then the
present groups in bit order:

| Bit | Group | Bytes | Content |
|---|---|---|---|
| 0 | POS_ABS | 12 | x, y, z `i32` mm |
| 1 | POS_REL | 6 | x, y, z as `i16` mm deltas from the baseline row |
| 2 | VEL | 4 | `i16` speed cm/s along the hull yaw (signed), `i16` vertical speed cm/s |
| 3 | YAW | 2 | `u16` turn |
| 4 | TILT_ABS | 4 | pitch, roll `u16` turns |
| 5 | TILT_REL | 2 | pitch, roll `i8` turn-unit deltas from the baseline |
| 6 | TURRET | 4 | turretYaw, gunPitch `u16` turns |
| 7 | HP | 2 | `u16` |
| 8 | MAX_HP | 2 | `u16` |
| 9 | RELOAD | 4 | remaining, total `u16` (2 ms units) |
| 10 | GUN_RELOAD | 4 | remaining, total of the gun channel; absent when the status mirror bit is set |
| 11 | MAGAZINE | 2 | rounds `u8`, capacity `u8` (the reticle's multi-round indicator) |
| 12 | AMMO | 3–6 | three varints |
| 13 | STATUS | 2 | `u16`: bits 0–1 reloadKind, 2–3 gunReloadKind, 4–5 shellSlot, 6 gunReloadMirrors, 7–15 `ENTITY_FLAGS` |
| 14 | ERA_ADD | var | index list of ERA cassettes spent since the baseline |
| 15 | ERA_RESET | var | index list replacing the spent set (keyframes; a revive) |

A keyframe row carries groups 0, 2, 3, 4, 6–9, 11–13 (44 B for a typical
tank), plus GUN_RELOAD when the gun channel differs from the main reload
channel and ERA_RESET when cassettes are spent. A delta row carries only the
groups that changed against the baseline row (a tank driving on rough ground
with its turret slewing costs 16–20 B); relative groups fall back to the
absolute ones when a delta overflows (|Δpos| > 32.767 m, |Δtilt| > 127 units).
Horizontal velocity is `speed` along `yaw`: `vx = sin(yaw)·speed`,
`vz = cos(yaw)·speed`. When STATUS says the gun channel mirrors the main
channel, the client copies reload → gunReload after applying the row.

**Viewer section** (only for a seated player, about its own tank): `u8 entityId`,
`u16 modules` (2 bits per `VIEWER_MODULES` entry: 0 ok, 1 yellow, 2 red),
`u8 crewBits` (`VIEWER_CREW`), 4 × `u16` equipment multipliers ×1000
(`VIEWER_EQUIPMENT`), `u16 modeSpeedMultiplier` ×1000, `u16 modeGravityScale`
×1000, `u8 movementVersion` (0 = none) and, when present, `u16 movementFlags`,
`u8 count`, `count × f32` — the movement integrator checkpoint of
`src/net/movementPredictionState.ts` (`{ version, values, flags }`) that the
prediction replay restores before re-applying unacknowledged inputs.

**Interest management** is the server's: a viewer receives rows for its own
team and for enemies while they are spotted; a hidden enemy is simply absent
(and listed in `removed` when it was in the baseline). Hidden coordinates never
leave the server.

**Baselines.** Deltas are built against the viewer's last acknowledged
snapshot (`snapshotAckTick` in INPUT/PING/SNAPSHOT_ACK). A keyframe goes every
2 s and whenever the server has no acked baseline it still holds. After a
`missing_baseline`, acknowledge `NO_TICK` (in the next INPUT or PING, or as a
`SNAPSHOT_ACK`) — the server drops the viewer's baseline and the very next
snapshot is a keyframe; keep sampling the previous frames until it arrives.
Acknowledging `NO_TICK` while holding no baseline is harmless, so a client may
send it until its first keyframe assembles.

**Edge baselines.** The first control the server applies after admission (or
a seat replacement) seeds `fireSeq` / `actionSeq` without an edge: a reconnect
never fires a stray shot. A new `actionSeq` skips bits the previous sequence
already applied within the last 500 ms, so a union of two un-acknowledged
presses applies each action once.

**Input edges.** `fireSeq` increments once per trigger press and every later
frame repeats the current value; the server fires once per new value (and
holds fire while FIRE_HELD is set). `actionSeq` increments once per action
press and `actionBits` carries the union of un-acknowledged presses; the server
applies the bits once per new sequence value. `ackedFireSeq` / `ackedActionSeq`
in the snapshot tell the client which edges have been consumed, so a lost frame
can never lose a press. `ackedInputTick` is the newest applied control tick;
`inputMarginTicks` says how early the newest control arrived — keep it in
1..3 ticks by adjusting the client's lead.

## ERA cassettes

`EntityRow.eraSpent` is a sorted list of indices into the vehicle's spec-order
ERA plate list: every plate with `kind === 'era'` in `armor.hullPlates`
followed by `armor.turretPlates`, in authored order (`eraPlateNames`). Both
sides own the same first-party spec, so names never travel. Duplicate names
share the first index (the armor model keys `eraSpent` by name).

## Receipts

`node src/mp/wire/wire.selftest.mjs` — round trips of every message type and
2,400 delta snapshots (bit-exact), the gun-reload mirror transitions, the §4
size budget (full row mean ≤ 48 B, typical moving delta row ≤ 20 B, 28-entity
keyframe with the viewer section ≤ 1.5 KB), every truncated prefix and
malformed class rejected with typed `WireError` codes, quantization
resolutions. `node src/mp/wire/wireFuzz.selftest.mjs` — 10,000 random byte
strings and 10,000 mutated valid frames decode to a typed result, never throw,
never reach the `internal` code.
