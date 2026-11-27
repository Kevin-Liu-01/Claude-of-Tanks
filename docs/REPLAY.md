# Replays: recording, viewer, capture (design, 2026-11-22)

Status: design approved by Kevin (2026-11-22, all four decisions below as recommended). P1 (recording) is built on
`item/replay-system-275`; see "P1 as built" at the end. Its browser check waits for a heavy slot.

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
  flag, difficulty, loadout, consumables, camo, camo bonus) and its TEAM NATIONS record (the sides' countries and the
  planner's fill notes); each hull's contact footprint (8 numbers, see item 4).
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
  ridden tank's sight. Photo mode is the fourth (settings-unify-278, from `item/photo-mode-271b`): P or Settings' Photo
  mode pauses the replay and frames the ridden tank (or the player's) with the free photo camera; Exit returns to the
  camera it left.
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

## Decisions (Kevin, 2026-11-22)

1. Shape: seed plus controls, re-simulated into a track the viewer draws from. Approved.
2. Core changes: shots from the simulated barrel (centimetres, same as online), and the off-thread re-simulator in a
   Worker (the ARCHITECTURE §1.6 owner's OK for an off-thread local simulation, for replay viewing only). Both approved.
3. Phase order: recording, viewer, capture, seek polish, multiplayer. Approved.
4. Version policy: same sim only; a clean refusal that still shows the summary and timeline. Approved.

## P1 as built (2026-11-22)

- `src/sim/gunPose.ts`: the authority's `gunWorldPose`, shared; the solo step's shots leave the simulated barrel.
- `src/sim/seatControl.ts`: the seat's control quantizers (the wire re-exports them) and `captureSeatControl` /
  `applySeatControl`. Every step the recorder stages the player's seat through both, so the live step reads exactly
  what a replay feeds it.
- `game.tick` beside `game.timeS`.
- `src/sim/replayFormat.ts`: the file. `src/game/replay/`: the recorder (wired in `main.ts`: round `setupBattle`, the
  step, the rules port, the bus), the runner (the local driver headless), seat actions, checksum, build digest, store.
  None of it is on the boot graph: the recorder, the store and the recorded setup are one lazy chunk
  (`src/game/replay/replayChunk.ts`) behind `src/game/replayRecordingAccess.ts`, loaded with the solo authority's
  preload (so a battle's setup always finds the recorder, and its first step is recorded) and by the replay screen.
- `tools/replay-verify.mjs` re-simulates a file in Node. `tools/replay-browser-check.mjs` records real browser battles
  and verifies them (the perf pass rule's harness). `tools/replay-measure.mjs` and `tools/replay-measure-local.mjs` are
  the design's Node measurements (the authority and the local driver replaying whole battles, and the input sizes).
- The divergence trace (`src/game/replay/replayTrace.ts`), a diagnostic off unless a tool asks
  (`recorder.trace = true`): a traced battle also keeps every step's digest numbers per hull and a deep dump of the
  battle before step 1 and every 60 steps to step 600. `tools/replay-diff.mjs` replays it in Node with the same trace
  and names the first step, hull and field where the replay leaves the page. The round-trip receipt holds a Node
  recording's trace equal to its replay's, number for number and dump for dump.

### The first browser check (2026-11-22): FAIL

Frame time was unchanged, but both recorded battles drifted at step 600 when replayed in Node, and the recorder's cost
read 0.0197 ms per step against a 0.010 bound (its p99 bound was unmeasurable: Chrome's clock reads in 100 us steps).
One cause is fixed: the runner handed setup the bot memory as arrays where the page keeps Sets. Ruled out in Node: the
collision world's precision (a full-precision Verdant gives the same drifted digests as the shard), the world kernels
(WASM gives the same digests as TypeScript) and opening routes planned during the countdown. The drift's cause is still
open; the next run carries the trace, and the cost is measured in 600-step blocks (rule re-registered first).

### The second browser check (2026-11-22): FAIL on replays only

Cost passed (0.0010 ms per step, largest block 0.0015) and frame time was unchanged. The trace named two causes:

- **Fixed: the replay tools finalized three specs.** They loaded combat anatomy for `TANK_IDS` (the three starters),
  so every other hull stepped without its published track contact, derived modules and roof gun. `ensureReplayFleet`
  now loads the recording's roster and `createReplayRun` refuses one that is not loaded.
- **Open (276, item/sim-det-trig): native trig inside three.js.** The sim calls `Quaternion.setFromEuler`,
  `Vector3.applyAxisAngle` and their kin, which use `Math.sin`/`Math.cos`; Node and Chromium differ in the last bit and
  the battle's chaos grows it. `det-math-lint` walks only relative imports and only the authority's graph (the local
  step's own native trig in `state.ts` is outside it too). The fix and its lint are their own branch.
- **World precision (276, item/sim-world-packed).** A five-minute Verdant battle recorded on the page's world replays to
  its last step on the page's world and on the headless world built from the same records at full precision, and
  drifts at step 1200 on the committed 0.1 mm shard. Ruling (B): solo collides on records rounded by the shards'
  packer, built in-page from its own records. Until then `tools/replay-world.mjs` builds the page's own world in Node
  (`world/map.ts createMap`, ~6.6 s) for `replay-verify` and `replay-diff`; after (B) they return to the shard.

## P2 as built so far (source only, no UI)

- `src/game/replay/replayTrack.ts`: the viewer's track, every hull's pose and state (position, yaw, pitch, roll,
  turret, gun, speed, hp, destroyed/burning) and every live shell, sampled every 3 steps (20 Hz) as Float32.
  `trackPose` gives the kill cam's `ReplayPose` for any moment (angles blended the short way round), so playing,
  scrubbing and seeking never simulate.
- `src/game/replay/replayIndexer.ts`: the recording re-simulated once into its track; a refused recording keeps its
  header and marks for the timeline, a drifting one keeps its track up to the checksum that caught it.
- `replayIndexerWorker.ts` / `replayIndexerClient.ts`: the indexer in a Worker of its own per job. The page sends the
  file and its battle's packed collision records (no fetch, and never `src/mp`); the track's buffers come back
  transferred. The round-trip receipt runs the Worker's job and requires the track sampled live during recording,
  number for number.

Differences from the plan above, each for a measured or found reason:

- **Setup is captured, not rebuilt from a roster.** The header keeps what setup reads beyond its options (roster seed,
  battle count, the previous battles' bots, debug roster flags) and every localStorage value read while setting up or
  stepping. The replayer serves those through a storage stand-in, so `setupBattle` itself did not change, and a new
  stored choice is covered without touching the recorder. A stored value that changes mid-battle marks the recording
  staged from that step.
- **Discrete actions are the rules port's calls.** Every key handler changes the simulation through
  `playerBattleActions`' `rules` (shell, magazine, special action, consumable, self-right, jump) plus one direct write
  (`previousShellSlot`); the recorder wraps that port. Lights, smoke, the roof gun, drones and Air Support call-ins
  ride `auxiliaryBits`, which the seat control already carries.
- **Footprints are recorded at the step they appear.** A hull's contact footprint is published when its visual streams
  in, mid-battle; the recorder notes the step, the replayer sets it then. (migration-parity is moving footprints to one
  data source for both drivers; then they are known at setup.)
- **Any step the recorder did not see** (a debug fast-forward stepping `simStep` itself) marks the recording staged.
- **"Download replay" and "Watch replay" move to P2**, where the end screen and Garage list get their one stills
  round. P1 keeps recordings in IndexedDB; tools read them through `window.__COT_REPLAY`.
- **P1 limits**: couch and Watch battles, and Jev battles, are not recorded yet.

Receipts (Node): `src/game/replay/replayRoundTrip.selftest.mjs` (MANUAL `sims`): 4,800 steps, 14 hulls, 6 kills; every
checksum and the final digest match; a throttle unit off at step 500 is caught at step 600; 80 s records to 6.3 KB
gzipped and re-simulates at 0.57 ms per step. `src/sim/replayFormat.selftest.mjs` (default tier): the stream, the
sections, refusals, and the seat stage as a fixed point.

## P2 viewer as built (2026-11-23; browser stills 2026-11-24)

A replay is watched as a battle. The page enters the recording's battle through its ordinary solo entry, set up as
recorded by the one setup the headless replayer also uses (`replaySetup.ts`: the roster seed, battle count, bot memory,
debug flags and storage stand-in round the page's own `setupBattle`). `app/replayViewerRuntime.ts` then turns it into a
replay: `replayRulesetFor` (Watch's drone and ride, no seat to take, every tank seen, no records), the index built in a
Worker from the page's own world (`replayWorldManifest.ts`, packed as the shard capture packs it), and from then on the
battle frame's `replay` port poses it each frame instead of stepping it (no countdown, alpha 1). The frame poses it
only while the battle is in view, never under the entry's load screen (through its exit fade), and the viewer offers its
transport from the first posed frame (`posing`): the index is often done before the load screen lifts, and a Play
enabled under it was pressed there and lost (`battleFrameRuntime.selftest.mjs`: one Play moves the clock within two
frames of the first uncovered one).

- `replayViewer.ts`: the controller. Clock, poser and marks; a kill crossed by play goes to the HUD's kill feed through
  `hud.replayKill`, never the bus's `tank:destroyed` (the records listen there). A seek back across a kill resets the
  wreck; a wreck set later is aged from its kill, and an ammo-rack kill pops the turret.
- `ui/replayBar.ts`: transport row (play, speed, previous and next mark, clock, the timeline filter on the kit's segmented
  control, leave) over the timeline track. Styles in the `surfaces` layer on the HUD's tokens. On a phone the row keeps
  play, speed and the clock. The Watch bar lifts above it and its take-control button is hidden. The shell and
  consumable trays and the vehicle's own controls are hidden while a replay is live (a recording keeps no magazine or
  charges). A kill with no other tank behind
  it (a scuttle, a fall) reads as a loss (`replay.mark.loss`), never "X destroyed X".
- Entry points: the end screen's secondary Watch replay and Download replay (after the report's own actions, every mode),
  and the Service Record's Replays tab (the saved 20, Watch and Download per row). `main.ts` handles `ui:replayWatch` and
  `ui:replayDownload`; from an end screen it saves the recording first and returns to the Garage before entering.
- A recording this build cannot replay never enters a battle: the bar shows its timeline alone with the refusal line.

The battle's own actions (`battleActions.ts`): the solo runtime's calls that change a battle between steps from outside
its seats (a training step's cue, the training checkpoint and end, the proving ground's reset and moving-target switch)
are taken by main.ts only through the recorder's `wrapBattleRules` and kept as seat -1 actions (a cue's actor as the
action's `key`) before the next step; the runner calls the same rule there. `battleActions.selftest.mjs` classifies
every call of the runtime (recorded, or the step, the setup, a read, the Leave), and the round trip replays a training
battle with whenSeen Sentry 3 cued round for round (without its cue, it parts).

Known gaps after the browser round: the HUD's top band (score, clock) is not driven by the track and stays as setup left
it; world changes (felled trees, structures, craters) are not replayed; effects and sounds other than the kill feed do
not replay; a mode's battlefield variant is not passed to the indexer; watching a replay sets the Garage's selected
tank to the recording's. The notices-276 view-controls list (`src/ui/hudViewControls.ts`) is not on this base yet; the
bar's box is registered there on the restack.

## 276.x hotfix: a replay seats its recorded roster (replay-fixes-277, 2026-11-24)

Live 276 (Kevin: "the replays dont actually work"): most replays opened to "This replay can't be played." and never
moved. The page entered the recording's battle correctly, but the indexer's Worker, setting the same battle up again,
drew another roster from the same seed and ordinal and refused the run (`roster`). The draw shuffles `game.allTanks`,
which is built in the order the fleet registered, and the page's import graph registers the spec packs in another order
than the Worker's and Node's (`authorityFleet` → `fleetRegistration`): on 276's build the two orders part at the 80th
hull. A battle whose draw happened not to reach that part replayed; most did not. Neither earlier check saw it: the
Node round trip and `replay-verify` draw in Node on both sides, and the recorder's browser check never opened the viewer.

The fix: a replay never draws its roster again. `runRecordedSetup` hands `setupBattle` the header's roster
(`recordedRoster`) and `rosterState.seatRecordedRoster` seats those hulls in the recorded order on the recorded sides
(same-nation repeats rebuilt as the picker builds them; the TEAM NATIONS record as recorded, below), on the page and in
the Worker alike. Receipts: `src/game/replay/replayRosterSeat.selftest.mjs` (default tier: a reordered pool draws
another roster, the recorded one seats exactly) and `tools/replay-ui-flow.browser.selftest.mjs` (manual `browser`
suite: a battle played with real keys, left and watched from the Service Record; another ended and watched from its end
screen; each must play to its end with no notice and a hull moving, and the indexer's reply is in the receipt).

The root hazard, fixed for 277: the battle pool (`game.allTanks`) is built in `rosterState.botPoolOrder` (id order),
never the catalogs' registration order, so a seeded draw is the same roster on the page, in a Worker and in Node
(`src/game/battlePoolOrder.selftest.mjs`; the UI-flow receipt holds the built page's pool to Node's, id for id). The
catalogs keep their registration order for the Garage.

The TEAM NATIONS record (replay-notes-278, 2026-11-25): the hotfix first rebuilt it from the seated sides (each side's
majority country, no notes), but the planner's fill notes (`sim/teamNations.ts` NationNote: an ally fill, a repeat) come
only from the draw a replay no longer makes, so a battle whose draw filled a side from an ally carried the note on the
page and none in the replay, and `replayRoundTrip`'s dump after step 0 parted on `.game.teamNations.notes` from 276.1
on. The recorder now keeps the battle's record in the header (`teamNations`, beside `roster`), `runRecordedSetup` hands
it to `setupBattle` (`recordedTeamNations`) and `seatRecordedRoster` seats it as recorded. Receipts: `replayRoundTrip`
(manual `sims`) and `replayRosterSeat` (the record through JSON, notes and all, on either pool).

## Replay files: download and open (replay-fixes-277, 2026-11-24)

The file is the recorder's own `.cotreplay` (gzipped where the browser could; the format's magic `COTR` and version byte
first). Download replay (the end screen, a Replays row) saves it from the press as a Blob through an anchor. A file
opens from the Replays tab's Open replay file or dropped on the Garage: `game/replay/replayImport.ts` checks it before
anything is entered (refused over 2 MB before it is read; then gzip, the magic, the format version and the whole
recording). A good file joins the Replays list and is watched as a saved one; a file from another build opens its
timeline alone with the refusal (§7). A file that is not a replay, one of another format ("This replay uses format 2;
this version of the game reads format 1."), a damaged one and a too-large one say why in the Replays tab and enter
nothing. Size: 5.0-5.6 KB for 20-28 s solo battles, of which ~5 KB is fixed (the header, the hulls' footprints and
actions); the seat stream adds ~2.5 KB per minute (§1), so a 7-minute battle is ~20-25 KB. Receipts:
`src/game/replay/replayImport.selftest.mjs`, and the UI-flow receipt's path C (A's downloaded file opened on a fresh
profile through the browser's own file chooser, after a non-replay and an other-format file are refused).

## The viewer's strip and Export video (replay-fixes-277, 2026-11-25)

Kevin, 11-24: "the viewer in game should be no ui at bottom, we just keep minimap and the bottom left top left top right
and top middle and notifications", and "be able to export it as a mp4". Approved from stills (Kevin, 11-25).

- **No floor bar.** `ui/replayBar.ts` is a slim strip joined under the top-middle Watch bar (its seat read from the
  bar's own box, a phone's two rows included): play, speed, the clock, Export video, × (leave), over the timeline. It
  hides itself 2.5 s after the last pointer move, press or replay key while playing, and stays while paused, dragged or
  under the pointer; then only the minimap, the corners, the top-middle and the notifications show. On a portrait phone
  it ends short of the menu's plate and the minimap steps down under it while it shows. The timeline filter and the
  previous/next mark buttons left the strip; their keys stay (`[` `]`). Esc leaves the replay (never the battle's
  Settings); every replay key wakes the strip.
- **Export video** (the strip's film button, `ui/replayFilmDialog.ts`): 720p or 1080p, 30 or 60 fps, the whole replay or
  from the playhead to the end, Include HUD (off by default), progress with Cancel, "The video has no sound." (v1), a
  hint to take 720p for a long 1080p60 film, and on a browser that cannot encode MP4 the reason and the button off (never
  a WebM under an .mp4 name). `game/replay/replayFilm.ts` films offline and fixed-step: the live loop and the viewport's
  resize are held, each film frame is one main frame ticked exactly 1/fps of battle time on, at 1x, through the viewer's
  camera and the post chain at the film's size, encoded by the Studio's first-party WebCodecs path (`studioFilmExport.ts`,
  H.264 into `studioFilmMux.ts`'s MP4; nothing vendored) at 5/7.5/8/12 Mbit/s (720p30/720p60/1080p30/1080p60).
- **Include HUD** (`ui/replayFilmHud.ts`) composites each frame with the HUD read from the live HUD as it stands (the
  minimap's own canvas; every shown element's plate and text at its own box, computed font and colour), redrawn at the
  film's size with each box kept to its edge of the screen. The viewer's controls, SVG and CSS-mask icons are left out,
  and a plate's clip-path slant is drawn square (v1).
- Measured (UI-flow path D, through the dialog, this build): 30 s at 1920x1080@60, H.264 High, 41-48 MB clean and
  46-48 MB with the HUD (the battle's picture sets it), each exported in 29-36 s on this Mac (about real time).

## A replay steps on its mode's battlefield (replay-receipts-279, 2026-11-27)

Live 276-278, every Frontline Assault replay stopped at 0:10 ("the battle played out differently here"). The indexer
Worker built its height field from the map alone, while the battle stepped on its mode's variant (Frontline Assault's
`assault-trenches`: trenches carved into the field). Every world a replay builds now takes its variant from the
recording's mode (`replaySetup.ts recordedTerrainVariant`, the live battle's rule: `terrainVariantFor`), and every
battle-world config is `world/worldBuildConfig.ts` (the Worker, `tools/replay-world.mjs`, the dedicated shards, the
browser host and the authority, whose stub-field layout fallback now takes the mode's variant too). The shard capture
(`tools/headlessWorldCollision.mjs`) and the wreck-bake plan build the same config inline, left as they are: editing
them moves every map's world-step key for no change in what they build. The recording, its format and the
wire are unchanged: only the viewer was wrong, so a 279 viewer plays 279 Frontline recordings. Receipt:
`replayTerrainVariant.selftest.mjs` (MANUAL 'sims'): every mode with a variant replays headless and through the
Worker's job, its track the battle's byte for byte; the Worker's old flat field drifts at step 600 (the control).

## The UI-flow drive raises its gun; replay-trace parity (replay-receipts-279, 2026-11-27)

- `tools/replay-ui-flow.browser.selftest.mjs` failed paths A and C on 278 by luck of the map: its blind drive pressed a
  little under the middle of the screen, so on a hilly map every shot left into the ground ahead and died before the
  track's first sample. The drive (`tools/replay-flow.test-support.mjs`) now moves the mouse up and fires there (a
  pointer-locked aim turns up; the cursor-aim fallback aims into the sky), logging each press's gun pitch. The effects gate
  reads the indexer's own track census (shell entries > 0) beside the shells drawn. `--raise=0` is the old drive, the
  control; `--map=<id>` enters a given map.
- `tools/replay-trace-parity.browser.selftest.mjs` (manual 'browser' suite): the page's indexer Worker's job, copied as
  posted, and its reply must equal Node's `runReplayIndexJob` over the same job byte for byte (track samples, shells,
  hulls, steps, problem, cues), the first difference named by field. The planted control,
  `tools/replay-trace-parity.planted-worker.ts`, is the Worker with its world's `heightField` getter keyed by the job
  instead of the world; the receipt must name where it parts.

## A Leave while a replay loads (replay-receipts-279 r2, 2026-11-27)

The replay bar, and its Leave, show as soon as the indexer replies, which is often while the replay's battle is still
loading. A Leave there made the Garage return supersede the entry, and the entry's failure branch answered the player's
own Leave with "The battle could not start: Solo battle deployment was superseded". The class: every Leave goes through
`main.ts` `leaveBattleToGarage`, which now cancels the solo entry in flight (`soloBattleEntryRuntime.ts` `cancel()`), and a
cancelled entry comes back to the Garage with no notice and no failure beacon; a supersede nobody asked for still
surfaces. Receipts: `src/game/soloBattleEntryRuntime.selftest.mjs` (the cancel cases, its reverted control and the
wiring), and `tools/replay-ui-flow.browser.selftest.mjs` path E (Leave pressed while the app lifecycle reads 'loading';
`--cancel=0` serves `main.ts` without the cancel and must fail by that dialog).
