# Couch mode — up to eight phones, one big screen

Phase 1 is built (deploy 268): the lobby and its seats, each phone driving its own tank, one shared camera; "The couch
session on the page" below says how it runs. Panes (phase 2) and the phone as each player's HUD (phase 3) are still
design. The owner's words (2026-11-01): "could we also hypotehtically do this with people connecting via
qr code from their phones to a host of a computer for claude of tanks? i think that will be so much faster and easier.
sort of like a console split screen, up to 8 people that you can share on a big screen?"

## Goals, stated back

1. Faster and easier than online multiplayer: a QR code on the big screen, phones out, driving inside a minute, with no
   account, install, room code typing or second computer.
2. Up to eight people in one battle on one shared screen, like a console's split screen.
3. It has to feel like a console: the phone's lag stays what the phone controller already measures, and every view is
   readable from a couch at a steady frame rate.

## What it is underneath

One authority, several input sources, several views. The phone controller (`docs/PHONE-CONTROLLER.md`) built an input
source that is not the keyboard. The simulation already advances many tanks from one input per tank per tick (bots, and
the multiplayer host's seats). The missing pieces are a pairing that seats several phones on one computer, a battle
that gives each phone its own tank, and a renderer that draws more than one view.

## Pass rule

1. Joining: from the QR scan to driving in under 20 s per phone, with eight phones joining at once.
2. Frame rate in the frame-budget method of `docs/PERFORMANCE.md` (the target mid-range laptop), Verdant at the couch
   tier: 60 fps for two panes, 45 fps or better for four, 60 fps for the shared view with eight players.
3. Input: the controller's share (phone send plus link) stays at the phone controller's bar, p95 under 60 ms on a LAN,
   with eight phones linked.
4. Nothing costs anything until someone opens couch mode: zero requests and no new boot request on the game, Gallery or
   /cn pages; the couch code is its own lazy chunk.

## Hard rules it keeps

- A couch battle is a local battle on this computer. It is never a multiplayer session: no rooms, no match wire, no MP
  strip or reports, and `src/pad` imports nothing from `src/mp` (the phone controller's rule).
- The phones are input devices and private readouts. They never run the simulation and never decide a hit, damage,
  reload or result.
- Spotting holds per seat: a pane draws an enemy only when its own player has it spotted, and a phone receives only
  what its own player is allowed to see. Peeking at a neighbour's pane stays possible, as on any console.
- Game rules stay in `src/sim/matchRuleset.ts`. Couch mode changes who drives which roster entries and how the screen
  is split, never a rule.
- One player per tank. No multicrew roles or shared seats.
- Free tiers only. The Worker carries pairing and signalling; input goes phone to computer over WebRTC.

## The lobby: one code, up to eight phones

The pairing actor (`src/pad/padActor.ts`, hosted by the `PadPair` Durable Object and the LAN helper) today pairs one
desktop with one phone: the code joins once and lives 120 s. Couch mode generalises the same actor; it does not add a
second service.

- State version 2: `phones` becomes a list of up to eight seats, each `{ seat, tokenHash, socket, relayUsed }`, and a
  `lobby` flag says whether the code still admits joins. A single-phone pairing is the same state with one seat and the
  lobby closed after the first join, so the phone controller keeps its exact behaviour.
- The big screen shows one QR code and the short code while the lobby is open. Each scan takes the next free seat and
  receives its own resume token. A code open for joins lives 10 minutes and is redrawn on request; a full lobby answers
  `full` (a holder of the code learns nothing a guesser could use).
- The host closes the lobby when the battle starts and may reopen it between battles. A phone that drops keeps its
  seat and comes back with its token, as today. (Built: Start closes the join window before the seats deploy; Let
  Phones Join reopens it, the way in for a late arrival. See "The couch session on the page".)
- Signals carry the seat, so the desktop keeps one `RTCPeerConnection` per phone and phones never talk to each other.
  The rate limits, the ICE grant and the relay budget become per seat. ICE is granted only once a phone has joined:
  each phone's seat has 3 grants per 10 minutes, and the desktop 3 per joined phone (it needs one per peer
  connection); each window is kept with its seat or the desktop in the stored lobby, so a resumed socket does not reset it.
- Socket cap: one desktop, eight phones, two pending. Signalling is about 10 to 20 messages per phone, so a full lobby
  costs about 160 Worker messages; a battle on WebRTC costs nothing more.
- The host can remove a seat from the big screen. A removed phone's token is forgotten.
- Offline LAN parties: the LAN helper (`server/rooms/serve.ts`) already hosts the same actor, so the lobby works on a
  network with no internet once the game is loaded.

## The couch session on the page

`src/app/couchRuntime.ts` is the session's one page owner (its chunk loads with the lobby; nothing of it is on the boot
graph). Its edges, round 8 (2026-11-09):

- **Start** (`startBattle`): the lobby's Start closes the join window (`setOpen(false)`) and then deploys the seats with a
  phone here, in the Deploy screen's mode, map and vehicle. With no phone here nothing is sent. A phone that has the code
  cannot take a seat mid-battle; the host's Let Phones Join (the lobby's Reopen) lets late arrivals in between battles.
- **Each battle's init** is keyed by its session's identity: `setupBattle` seats a new `game.couch` object every battle
  (`src/game/couchSeats.ts`), and the runtime's first step or frame of a new one aims each seat's sight along its own
  gun and sets the shared camera's bearing from seat 1's hull. Nothing of the last battle's aim carries over.
- **The couch view**: the shared screen shows the field, not seat 1's tank (`body.cot-spectating` hides the own-tank
  furniture, and the HUD's couch view reads no tank as its own). The runtime asks for it on every frame it runs, never
  latched, under its own reason of `src/ui/bodyFlags.ts` ('couch'), so the spectate bar dropping its reason never strips
  it; it drops the reason when the phase leaves the battle and when the lobby closes, and the HUD's battle end clears its
  couch view, so a Watch battle after a couch one rides its own tank.
- **A seat's Pause** opens and closes the desktop's menu (with no pointer relock) only while a couch battle's phones drive
  (`src/game/stateCore.ts` `couchSeatsActive`: the session, its couch rules, the battle phase; a dead seat 1 takes it
  from no one). The lobby outlives its battles, so a phone still seated over a network round (the session ended at its
  activation) or a keyboard battle pauses nothing (round 8 merge review, 2026-11-09).
- **Battle Again** after a couch battle starts a couch battle again: the entry's intent records the couch and its sides
  (`src/game/battleEntryIntent.ts`), the Garage return keeps them, and the replay re-reads the seats with a phone here
  now through the same start edge (the join window closes first). With no phone here it opens the lobby over the Garage
  instead of a keyboard battle, and the return settles there with no failure notice.
- **The lobby's opener** is one of the Garage's lazy openers: the Couch press takes the Garage's ticket, and the lobby
  opens only if that Garage still shows, and no press has handed the player on (a battle start, the play menu), when its
  chunks land (`src/app/couchOpener.ts`, `src/ui/garageScreen.ts` `handOff`). A Couch press while they load asks for
  nothing more: it is the press the lobby opens for (its ticket, its Deploy selection; `createLazyOpener`), so the press
  after a refused BATTLE or Launch is not lost. While a start the Garage handed on is in flight, or a battle's loader
  covers it, the Garage is not the player's (`enter`, `covered`): its keys do nothing and a press there opens nothing. A chunk that did not arrive marks the Couch button (its next press
  reloads the page); a lobby that failed to open once loaded is logged and the button stays a press.
- **End** (`close`): every phone goes, every seat's controls release, the couch view drops.

## Seats in the battle

Couch mode is the local driver with more than one seat (`docs/ARCHITECTURE.md` §1.6, "one core, two drivers"). The
battle runs `simStep` on the page as solo does, and never reaches `src/mp` or `server/` (`tools/driver-boundaries.mjs`
checks it).

- The core already drives several human hulls. `simStep` takes no input argument; any tank without a bot controller
  steps from whatever was written on its `input` before the step. `src/sim/driverStepParity.selftest.mjs:116-124`
  drives two such hulls with no camera rig at all.
- What is single today is the stage before the step. `pollFrameInput` (`src/game/battleFrameRuntime.ts:187-201`) copies
  the one global input layer onto `game.player.input` (`src/game/playerFrameInput.ts:128-155`), and the one camera rig
  writes the aim point (`src/engine/cameraRig.ts:747-749`). `game.player` is `tanks[0]` (`src/game/state.ts:1208`).
- Each seat has its own controls (`src/game/couchSeats.ts`), which its phone receiver drives as the touch HUD drives
  the input layer. Once per fixed step, before it, the couch runtime (`src/app/couchRuntime.ts` `beforeStep`) hands
  every seat's controls to the core's player input stage (`src/sim/playerInputStage.ts` `applyPlayerInput`), the
  same stage the multiplayer authority uses for a network seat, so a seat steps exactly as a network seat does (agreed
  with the core lane, 2026-11-01: per tick, through the authority's own stage, never a copy of it). Levels (stick,
  fire, brake) hold until they change; a tap is a press on one tick only, because the core consumes action bits every
  tick. In a couch battle the keyboard drives no tank and the camera rig aims none (`pollFrameInput` gets no player).
  A trigger tapped down and up inside one tick still fires once (the seat latches the pull until the tick carries it).
- Each seat's phone feels its own tank (`docs/PHONE-CONTROLLER.md` "Haptics"): the couch runtime hands every seat's
  receiver the battle's bus, and the receiver sends the cues for that seat's tank only. The events that name no tank
  (the sixth sense, the page's refusals, the sight's lock) are the page's player's, so no seat gets them, and a seat has
  no lock key (its sight is its own bearing). A seat's own refused shell pick names its tank (the input stage's
  `ammo_selection_denied`), so that seat's phone feels `denied`; the shared screen shows no alert for it (round 8 merge
  review, 2026-11-09).
- Phase 1 seats take the mode's own roster (`assignCouchSeats`): the first seat present drives the battle's first tank,
  every other seat the next tank on its side in roster order, and the rest stay bots, so a seat's tank has no bot
  (`spawnBattleEntities`). The roster holds one tank per vehicle, so no two seats share an id; the phone's own vehicle
  pick (phase 3) brings seat ids that are not spec ids, as the multiplayer host numbers its seats.
- A seat's tank keeps the camouflage and spotting bonus its roster slot carries, as the bot in that tank would have
  (seat 1 drives the battle's first tank, which wears the host's saved scheme). A phone's own scheme comes with its own
  vehicle pick (phase 3): the seat's tank takes that scheme in setupBattle and earns its bonus by the one shared rule,
  `src/sim/camoPaint.ts` `camoSelectionBonus`, never a second rule.
- Sizes and sides come from `src/sim/matchRuleset.ts`: `COUCH_RULES` (the couch modes, eight seats, the shared camera's
  framing) and `couchSeatSides` (Together puts every seat on Alpha; Teams alternates, Alpha first; the Horde is always
  Together). A seat with no tank left on its side sits the battle out.
- One shared camera with seats on both sides shows every hull (`watchRevealsAll` reads a Teams couch battle): each seat
  sees its own side, so the shared screen shows both. One pane per seat (phase 2) draws only its side's spotting.
- Spotting is kept per team (`src/sim/spotting.ts:442`), and the local driver hides an unspotted enemy by setting the
  one shared visual invisible (`src/game/battlePresentationRuntime.ts:238-249`). With seats on both teams, that becomes
  a per-pane pass: before each pane's draw, the tanks its seat's team has not spotted are hidden for that draw only,
  without touching their residency or their track marks.

What stays single, on purpose:

- The profile. A couch battle credits the host's profile only, or keeps no record (`battleKeepsRecords`,
  `matchRuleset.ts:1205`); guests have no accounts.
- The result screen shows the battle's result per team; the killcam recorder is already whole-world
  (`src/game/state.ts:3384`), so a destroyed seat's killcam plays in its own pane.
- Loadouts: the host's saved Garage loadout applies to seat 1 only; guests take the tank's default loadout, picked on
  the phone.

Everything else that reads `game.player` becomes per seat: the HUD owner (`battleHudFrameRuntime.ts`), the spotting
viewpoint for presentation, the mode perspective and verdict (`stepMatchMode`, `settleBattleResult` in `state.ts`),
the death hold and respawn view (`battleResultPresentationRuntime.ts`), the recoil and shake applied to the player's
rig, and the pad receiver's `source()` (`padReceiver.ts`), which today returns `game.player`.

## The screen

Today the game draws one view. There is one camera (`src/main.ts:516`), one post chain fixed to it (`createPost`,
`src/engine/post.ts:2149`), one set of shadow cascades fitted to it (`src/engine/lighting.ts:953-1009`), one HUD root
(`src/ui/hud.ts:2385`) and one audio listener (`src/main.ts:3663`). Viewport and scissor calls exist only in the debug
telemetry (`src/dev/debugTelemetry.ts:257-314`). The camera rig is already a factory (`createCameraRig`,
`src/engine/cameraRig.ts:304`) with its state in a closure, so one rig per pane needs no rewrite.

| Players | Layout |
|---|---|
| 1 | the whole screen |
| 2 | two wide panes, one above the other (each 32:9, the horizon kept wide) |
| 3 | four quarters; the fourth shows the battle map and the score |
| 4 | four quarters |
| 5 to 8 | one shared camera (below) |

### What one view costs

`docs/PERFORMANCE.md` (frame budget, 2026-10-02) measures a chase view on Verdant, Desert, Whiteout and Monsoon at
1600 × 900 and 1080p with the static shadow cache on: 415 to 538 draws, of which 104 to 138 are shadow draws, and 7.8 to
12.6 ms of render-path main-thread time (most rows 8 to 9 ms), 1.4 to 3.3 ms of it shadows. The 60 fps budget for the
target laptop is 10.4 ms of main thread in the measuring machine's terms. Four views drawn the way one is drawn today
would take roughly 32 to 50 ms of main thread before the GPU: under 30 fps. The screen is the hard part, not the phones.

### The couch tier

A pane is a quarter of the pixels, so it can carry a quarter of the detail. The couch tier is a quality preset in
`src/engine/quality.ts` beside `ultralow`, chosen by the pane count, and aims at 3 ms of render-path time per pane.

- One shadow fit for every pane. The cascades are fitted once a frame to the union of the pane cameras (or the battle's
  active area), rendered once and sampled by every pane. Alternating poses would defeat the static caster cache
  (`src/engine/shadowStaticCache.ts`, one pose per cascade); one fit keeps it. This alone removes 1.4 to 3.3 ms per
  extra pane.
- LOD distances scale with the pane's height: a 540-pixel pane switches to its far meshes at half the distance a
  1080-pixel view does, so the extra views draw fewer triangles and fewer gear parts.
- `lightWorld` and `terrainLite` on, as in `ultralow`: fewer grass tufts, sparser litter, the procedural wake instead of
  the FFT ocean, the cheaper terrain splat (55 to 85 % of GPU work, `src/engine/quality.ts:450`).
- No effect that keeps a per-camera history or reads across the screen: volumetric clouds (their reprojection history
  is one camera's), GTAO, sun shafts and the lens flare stay off. TAA is already off on every preset.
- The pixel ratio per pane stays at 1 or below, and the resolution governor (`AdaptiveQualityPolicy`) budgets the whole
  frame, not one view.

### Drawing several views

- One canvas. For each pane: set the viewport and scissor, set that pane's camera, fog density and scope state, draw
  the scene. Camera-dependent passes (the scene, aerial perspective) run inside the pane loop with the pane's camera;
  per-pixel finishing passes (the colour grade, bloom, SMAA) run once over the whole canvas.
- Per-pane visibility, set before each pane's draw: the pane's own tank hides only in its own sniper view (the rig hides
  the player's tank in the shared scene today, `cameraRig.ts:753`), and an enemy the pane's seat has not spotted is not
  drawn in that pane.
- Systems that follow one camera take the nearest pane instead: terrain chunk LOD and streaming
  (`src/world/terrain.ts:9766-9800`), vehicle LOD (`src/game/battlePresentationRuntime.ts:325`), the near-tree band
  (`src/world/vegetation.ts:8705`), the tall-grass ring and litter (`src/world/tallGrass.ts`, `src/world/map.ts:1245`)
  and the water's ripple field. Each asks for the minimum distance over the pane cameras, or keeps one ring per pane
  up to four.
- The rig's single-view side effects become per pane: the global fog scaled by the field of view
  (`src/app/mainFrameRuntime.ts:197-203`), the scope vision on `camera.userData` and the battle sight shift
  (`src/app/combatAimComposition.ts:88-91`).

### The shared camera, five to eight players

One camera frames every seated tank, built from the Watch drone and isometric cameras (`src/engine/watchCamera.ts`,
`src/engine/isometricCamera.ts`). It pulls back as the tanks spread and holds a floor on how far it zooms out; past it,
it frames the largest group and the strays get an edge arrow in their colour. The sight is the turret: the phone's aim
pad turns the turret, and the host sets the aim point to the first terrain or hull along the gun's bearing. The scope
and zoom keys are off in this view. One view, so it costs what a solo battle costs.

### Panes' HUD and sound

- Each pane keeps only the reticle, the player's colour and name, and a hit flash. Score, clock and the kill feed sit
  once in a strip across the middle. The minimap's derivation is already pure (`objectiveMarkers(state)`,
  `src/ui/minimapObjectives.ts:187`, reading `state.perspectiveTeam`), so each phone and the third-quarter map call it
  with their own perspective.
- One sound mix, one listener. The listener sits at the middle of the pane cameras; each seat's own gun and engine play
  close and unpanned at a lower level, so nobody's engine fills the room. Alerts meant for one player go to their phone
  as a vibration.

## The phone is each player's HUD

The phone already shows the loaded round, ammunition counts, reload, consumables, speed and whether the sight is
engaged (`PadStatus`). Couch mode moves each player's private readouts to their phone, so the panes carry only the view,
the reticle and the player's colour and name.

- Added to `PadStatus`: hull points, the last hit taken (direction and damage), the respawn countdown, kills and the
  team score.
- A small minimap on the phone, drawn from the same derivation as the HUD minimap (`src/ui/minimapObjectives.ts`), with
  only what that seat has spotted.
- Each phone shows its seat's colour, so a player finds their pane at a glance.
- Hit, reload-ready and destroyed alerts vibrate the phone. The big screen keeps one sound mix.

## Edge cases

The phone controller's rule carries over: an input never outlives its finger or its link. Each seat is released on its
own; a seat that goes stale stops its tank and nobody else's.

| Case | Handling |
|---|---|
| A ninth phone scans | refused as `full`; the big screen shows the lobby is full |
| A phone drops mid-battle | its tank stops at once (the stale window); the seat waits for its token; the host can hand the tank to a bot |
| Two players want the same tank | allowed; seats and tanks are separate ids, as in multiplayer |
| A player joins mid-battle | only while the lobby is open between battles; mid-battle joins wait for the next one |
| The host's keyboard and mouse | the host may take seat 1 with keyboard and mouse instead of a phone |
| A phone on cellular, not the room's Wi-Fi | it joins as it does today (TURN, then the capped relay); the lobby shows that seat's link quality |
| The computer sleeps or the tab hides | every seat pauses, the phones read Computer away, and the 5-minute grace holds every seat |
| A seat's player leaves for good | the host removes the seat; its tank goes to a bot or leaves the roster at the next battle |

## Building it, in order

1. Lobby and seats: the version-2 actor, one pad receiver per seat, the seat input stage and seat ids, eight phones
   each driving their own tank under one shared camera. It touches no renderer code, and it shows whether couch play
   is fun before the expensive part.
2. Two panes and the couch quality tier, measured on the owner's machine against the pass rule.
3. Four panes and the phone as HUD.
4. The shared view for five to eight players.

Each step lands with its receipts: the actor's selftest grows the lobby cases; a couch e2e drives several phone pages
against one battle (the pad e2e's harness, several phones); a frame-time receipt per layout.

Step 1's e2e is `tools/couch-e2e.browser.mjs`, run by hand. It opens the lobby, joins up to eight phone pages from
the QR code's address and checks that each seat drives only its own tank, with no bot and no multiplayer session. It
measures the input latency with every phone linked and checks that a phone which vanishes stops its tank. Run it with
`node tools/couch-e2e.browser.mjs --phones=8 --joinPhones=4`.

## Decided on the owner's behalf

- Split screen stops at four panes. Five to eight players share one camera, because eight panes on one TV are each about
  480 × 540 on a 1080p set, too small to read from a couch, and cost eight views a frame.
- The first modes are co-op against bots and team against team. Free-for-all follows once spotting per seat is proven.
- Couch co-op seats up to eight, through a couch entry in `src/sim/matchRuleset.ts` (the co-op modes seat seven today).
- The battle stays on the page, like solo. Moving a local simulation off the main thread needs the owner's ruling
  (`docs/ARCHITECTURE.md` §1.6), and couch mode does not ask for it.
- Two players split the screen top and bottom, which keeps the horizon wide; a side-by-side option can follow.
