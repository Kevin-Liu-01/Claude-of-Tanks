# Replays: recording, viewer, capture (design, 2026-11-22)

Status: design for Kevin's OK. Nothing here is built yet except two Node measurement tools
(`tools/replay-measure.mjs`, `tools/replay-measure-local.mjs`).

Kevin's ask, in his order:

1. A performant battle recording ("tracking") system.
2. A replay viewer: a timeline that marks game events; play, pause, scrub and speed; a free-fly camera; stepping into
   any tank's view like spectate.
3. The capture tool rebuilt on 1 and 2, so it films any tank and any event, deterministically, at true speed.

## The answer in one paragraph

A recording is the battle's setup plus every seat's controls, one row per fixed step, plus a small event index and a
checksum every 10 s. That is all the sim needs: from the same seed, roster and controls, the same battle plays again,
bots included. A 3-minute solo battle records to about 15 KB. The viewer does not play the file directly. A Worker
re-simulates it headless at 20-40x real time and writes a **track** (every tank's pose and state at 20 Hz, every shell,
every event, every world change). The page draws from the track the way an online client draws from snapshots, so
scrubbing, reverse, slow motion and seeking anywhere are free, and the page runs no simulation. The cameras are Watch
mode's (drone, orbit lock, ride any tank) plus the gunner sight. The capture tool opens the viewer headlessly on a
replay, picks a tank and a moment from the index, and films it either in real time with a playbackRatio receipt or
stepped (a fixed slice of battle time per frame, so video time equals battle time exactly).

## Measured (this lane, Node, no browser)

Re-simulating from a recording gives the same battle, compared every 60 ticks:

| Driver | Battle | Ticks | Result | Replay |
|---|---|---|---|---|
| Authority (`authoritativeMatch.ts`) | Verdant standard, 1 seat + 13 bots | 15,255 (4:14, to elimination) | 11 kills | identical (rounded digest) |
| Local (`state.ts simStep`) | Verdant standard, 14 hulls, real bots | 10,895 (3:02, to defeat) | 481 shots, 11 kills | identical (Float64 bytes) |
| Local | Alpine Air Support, 14 hulls, respawns | 18,000 (5:00) | 1,515 shots, 41 kills | identical (Float64 bytes) |

The local runs need one stand-in: the gun's muzzle and bore from the simulated pose (see "Solo prerequisites", item 1).

Size and cost (authority run, 4:14, receipts in `~/cot-lanes/replay-system-notes/`):

| Part | Raw | gzip |
|---|---|---|
| Setup (map, mode, seed, 14-hull roster) | 1.2 KB | 0.3 KB |
| One seat's controls, wire-quantized, delta-coded | 57 KB | 10.7 KB (2.5 KB per seat-minute) |
| Full event payloads (1,222 events) | 445 KB | 104 KB |

The full event payloads are not stored: the re-sim regenerates them. The file keeps a compact index of the events the
timeline shows (kills, hits, fires, captures, strikes, deaths, respawns), about 8 bytes each, roughly 3-5 KB for a
battle. **A solo battle records to 15-25 KB; a 7-minute one to about 25 KB.** Unquantized float controls cost 55 KB
per seat-minute, 22 times more, which is why the recorder quantizes (below).

Recorder cost: 0.001-0.004 ms per tick against a 0.5-0.9 ms step (0.3-0.5% of the step, under 0.03% of a 60 fps frame).
The re-sim runs at 0.43-0.63 ms per tick for 14 hulls here: a 7-minute battle re-simulates in about 12 s on this Mac.

## Why this shape

| Option | Size per 7-min battle | Seek | Survives a deploy | Verdict |
|---|---|---|---|---|
| Video | tens of MB | yes | yes | one camera, fixed; no |
| State stream (every tank at 20 Hz, like an online spectator) | ~5 MB raw, ~2 MB gzip | free | yes | 100x larger |
| Seed + controls, re-simulated | ~25 KB | needs a track | same sim only | **picked** |

Seed and controls are 100x smaller and they are the truth: a file is also a perfect bug repro. The track the viewer
builds gives the state stream's seeking without storing it. The cost is version skew (below): a replay plays on the
sim that recorded it.

## 1. The recording

One binary file, `.cotreplay`, gzip-framed:

- **Header**: format version; the build line (`MATCH_BUILD`: version, commit time, prediction and authority digests)
  plus a new **replay digest** (a hash of the local driver's step closure, computed at build time like
  `tools/matchBuild.ts`'s digests); which driver recorded it (`local` or `authority`); map, mode, ruleset, campaign
  operation, arrangement, brain setting; the battle seed; the resolved roster in order (ids, spec ids, teams, bot
  flag, difficulty, loadout, consumables, camo, camo bonus); each hull's contact footprint (8 numbers, see item 4).
- **Seat streams**: per fixed step, per seat, a 16-bit change mask and the changed fields as zigzag varints of the
  wire's integer units (`src/mp/wire/quantize.ts`: throttle, steer, aim yaw, pitch, distance) or small ints (flags,
  shell slot, action bits, auxiliary bits, fire sequence). A tick with no change costs 2 bytes per seat.
- **Side stream**: what reaches the sim that is not a control. Watch "Take control" seat changes (`watchSeat.ts`),
  Jev commander orders (they arrive from the network: recorded at the tick they apply), a debug intervention (any
  `__DEBUG` call that writes sim state marks the recording staged from that tick; the viewer stops there).
- **Event index**: tick, type, subject, actor, a coarse position, for the timeline.
- **Checksums**: an 8-byte digest of every hull's state every 600 ticks. The viewer checks them while it re-simulates
  and stops cleanly at the first mismatch instead of showing a wrong battle.

Pauses (kill cam, Settings, the battle hold, countdown) are steps that never ran, so they are not in the file:
replay time is battle time.

## 2. The recorder

- One tap at the start of each `simStep`, after the seat stage: it copies each seat's staged controls into the stream.
  The bus's existing recorder hook (`createBus(onEmit)`, `stateCore.ts:126`) feeds the event index. No per-tick
  allocation; a growable byte buffer.
- Storage: IndexedDB, the last 20 battles kept (under 1 MB), pruned oldest first. The end screen gains "Watch replay"
  and "Download replay". A replay opens from the Garage's Replays list, a dropped file, or `?replay=`.
- Pass rule, registered (hashed) before measuring, as fire-visible-275 did: recorder on vs off over a 60 s battle hold,
  median frame time within noise (1%), recorder p99 at most 0.02 ms per tick desktop and 0.05 ms phone tier.

## 3. Solo prerequisites (the local driver)

The sim survey found four places where the solo step is not yet a pure function of seed and controls. Each is a
small change and each also makes solo match the online authority more closely.

1. **Shot origin reads the drawn model.** `state.ts prepareMuzzleDirection` asks the rendered barrel
   (`visual.gunMuzzleWorld`), which syncs per render frame, offscreen tanks at 30 Hz, with cosmetic recoil. Fix: the
   authority's `gunWorldPose` (`authoritativeMatch.ts:643`, launchers and multi-bore mouths included) moves into the
   shared core and both drivers call it. Shots leave from the simulated barrel; the visible difference is
   centimetres. Without this no solo replay holds.
2. **Discrete actions skip the per-tick path.** Shell select, magazine reload, consumables, self-right, special action
   and auxiliary systems call sim functions from key handlers (`playerBattleActions.ts:361-507`). Fix: the player's
   seat goes through `applyPlayerInput` once per step with those presses as action bits, as couch seats already do
   (`couchRuntime.ts beforeStep`). Then the recorder has one tap, and couch replays come free.
3. **No integer tick.** `game.timeS += SIM_DT` is the only clock. Fix: `game.tick`, counted beside it.
4. **Contact footprint comes from the built model.** `refreshContactGeometry` reads `visual.contactGeom`. The headless
   re-sim has no model, so the header carries each hull's footprint (8 numbers) and the re-sim seats it. (Found here:
   the online authority has no contact footprint at all, so solo and online hulls ride on different footprints. Not
   this lane's to fix; reported to Main.)

Known limit: the local step still calls native `Math.sin` and friends in six places (crush, shell knock, impacts,
roof-gun lead, blast felling). A replay re-simulates on the viewer's browser, so a file recorded in Chrome and played
in Safari may drift; the checksums catch it. Moving those six to `detMath` is a follow-up.

## 4. The re-simulator (indexer)

A Worker runs the recording's own driver headless: `state.ts setupBattle` and `simStep` with stub visuals (the gun pose
and footprint from item 1 and 4), or the authority for an online recording. It never pauses and runs as fast as the
device allows, writing the track in chunks the page reads as they arrive:

- every hull at 20 Hz: pose, turret, gun, speed, hp, destroyed, crew, modules, fire, spent ERA (the kill cam's
  `EntityFrame` fields, `replayPose.ts`), and reload, ammo and consumables as change entries;
- every shell's flight; every bus event at its tick; every world change (props, structure stages and breaches,
  craters, smoke screens) at its tick.

About 11 KB per second of battle for 14 hulls, 5 MB for 7 minutes in memory. On this Mac it runs about 30x real time;
a phone at an estimated 8-10x builds a 7-minute track in under a minute while playback has already started.

The ARCHITECTURE §1.6 ruling says any off-thread local simulation needs Kevin's OK. This is a re-simulation for
viewing, never played and with no prediction or interpolation, but it is off-thread, so it is asked below.

## 5. The viewer

The page draws from the track the way the online client draws remote tanks: it writes each hull's interpolated pose
and state and re-emits the track's events on the bus at their ticks, so effects, sounds, the kill feed and hit
markers play as they did in battle. The presentation runtime already has this posed path (`networkActive`, which turns
off solo interpolation); the viewer gets a local copy of the posing step, not `src/mp`, to keep the driver boundary.

- **Transport**: play, pause, speed 0.25x to 4x, reverse, frame step, seek. Seeking anywhere the track has reached is
  instant. Seeking back across a world change rebuilds the destructibles and craters from the map's pristine state
  plus the log up to that tick (the online resume path, `restoreDestroyedObstacles` and `restoreDestruction`, does
  this on the authority side; the viewer's version is the main risk, see below).
- **Timeline**: one bar under the view with marks for kills, penetrations, fires, captures, strikes, deaths and
  respawns, in team colours, using the notice and objective glyphs. Hover or tap a mark: "A destroyed B, ammo rack".
  Click: seek to 3 s before it and ride the shooter. Filters: all, kills, one tank. Picking a tank adds its own lane.
- **Cameras**: Watch mode's (`engine/watchCamera.ts`, `game/watchController.ts`): drone (free fly), lock (orbit a
  tank), ride (any tank, Tab and Q/E cycle, click a tank to ride it, V flies off). Plus a gunner view through the
  ridden tank's sight. The photo-mode camera (`item/photo-mode-271b`) slots in as a fourth when it lands.
- **What you see**: everything; it is after the battle. An "as seen by" toggle draws one team's fog from the track's
  spotting flags.
- **Phones**: the page does no simulation, so a replay costs what a Watch battle costs to draw. The bar collapses to a
  scrubber, play and speed; drag looks, two fingers fly, tap a tank to ride; marks have 44 px hit areas.
- Keys: Space play, left/right 5 s, comma/period frame step, [ and ] previous and next event, 1-4 speed.

Every visual surface goes to Kevin as before/after stills first.

## 6. The capture tool

`tools/replay-cast.mjs` opens the viewer headlessly on a replay and films it, under `with-capture-lock` (render class)
and `runWarmHold`, browser through `launchGuardedBrowser`:

```
node tools/with-capture-lock.mjs --lock-class=render -- node tools/replay-cast.mjs \
  --replay=battle.cotreplay --event=kill:3 --pad=4,3 --camera=ride:shooter --mode=step --fps=60 --tier=desktop
```

- **Subject and moment** from the index: `--event=kill:3|hit:next|strike:2|capture:1`, `--subject=<hull or spec>`,
  `--from/--to` in battle seconds.
- **Camera**: `ride`, `gunner`, `lock`, `drone:<path.json>` (keyframed fly path), `fixed:<pose>`.
- **Two modes**: `cast`, real time (death-flow's CDP screencast with per-frame timestamps and the playbackRatio
  receipt, `8a85a5dd3a`); `step`, deterministic: the viewer advances exactly 1/fps of battle time per captured frame,
  so it never drops a frame and video time equals battle time (playbackRatio 1.000 by construction).
- **Receipt**: replay file hash, build line, camera, frames, battle span, video length, playbackRatio, frame times.
- **Scenarios without a browser**: a staged scene (a hull flanked at 50 m, a strike on a column) becomes a short Node
  script that plays seat controls into the headless driver and writes a recording, as the measurement tools here do.
  The cast tool films it. This replaces parking bots, teleporting and forcing fire through `__DEBUG`.

## 7. Version skew

A replay plays only where its replay digest matches the running build's. A deploy that does not touch the local step,
the core, specs or maps keeps every saved replay playable. Otherwise the viewer refuses cleanly ("Recorded on 274.3.
Replays play on the version that recorded them.") and still shows the battle's summary and timeline from the index,
which needs no simulation. The checksums are the safety net if a digest misses a change: the viewer stops at the first
mismatch and says so. Optional later: the header names the recording's immutable deployment URL, and the refusal
offers to open the replay there.

## 8. Multiplayer

- Only the host has every seat's controls (the actor's `collectInputs`); the Rooms Worker never sees game traffic and
  stores nothing. The host records what the authority stepped: the boot config (`HostBootConfig`), each tick's
  collected controls (after the jitter buffer, holds and sequence presses), skipped ticks, and each seat's lag
  compensation rewind ticks.
- Hidden enemies: the file is the whole battle, so it is handed to seats only after the match ends. During the match
  nobody receives it.
- Host migration resumes from a lossy keyframe (quantized rows up to 2 s old), so a recording continues as a new
  segment from the resumed state; the viewer re-simulates each segment on the authority. The cut can jump by a
  millimetre.
- Size: 2.5 KB per human seat-minute. A 7-minute room with 8 people is about 140 KB; a full 14v14 of people about
  490 KB.

## 9. Risks

- **Seeking back across destruction** (structures, felled trees, craters) needs a world reset the client does not do
  today. Fallback if it is slow on phones: seek back re-applies only props and stages, and craters rebuild per chunk.
- **Bot and mode loops run separately in each driver** (ARCHITECTURE §1.6 follow-up). A replay always re-simulates on
  the driver that recorded it, so this does not block replays; it does mean an online recording needs the authority
  in the Worker.
- **driverStepParity's two Mars reds** are coverage gaps (the scenario never kills the bot), not divergences; the local
  Air Support run above respawns hulls 41 times and replays identically.
- **Jev battles** need their orders recorded (side stream). Until then a Jev battle's file is marked unplayable.
- **Cross-browser drift** from the six native-math calls; caught by checksums.

## 10. Phases

Each phase ships on its own.

| Phase | What ships | Size |
|---|---|---|
| P1 Recording | Solo prerequisites 1-4; recorder, file format, event index, checksums; IndexedDB keep-last-20; Download replay; `tools/replay-verify.mjs` (re-simulate a file in Node, check checksums) and the measurement receipts; the perf pass rule | 1.5-2 days |
| P2 Viewer | Indexer Worker and track; posed presentation; timeline and transport; Watch cameras and tank picker; Garage list and end-screen entry; desktop and phone layouts; stills to Kevin | 2.5-3 days |
| P3 Capture | `tools/replay-cast.mjs` (cast and step modes, receipts), Node scenario recorder; death-flow and air-support shots redone on it as proof | 1-1.5 days |
| P4 Seek and polish | Seek back across destruction, reverse and slow motion, gunner view, event filters, "as seen by" fog | 1-1.5 days |
| P5 Multiplayer | Host recording, migration segments, hand-off at match end, authority indexer | 2-3 days |

P1 alone is already useful: every solo battle becomes a file that reproduces it exactly, for bug reports.

## Decisions for Kevin

1. The shape: seed plus controls, re-simulated into a track the viewer draws from.
2. The two core changes it needs: shots from the simulated barrel (centimetres, same as online), and the off-thread
   re-simulator (§1.6 asks for your OK).
3. Phase order: capture third, before seek polish and multiplayer.
4. Version policy: same sim only, clean refusal, timeline still shown.
