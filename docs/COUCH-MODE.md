# Couch mode — up to eight phones, one big screen

Phase 1 is built (deploy 268): the lobby and its seats, each phone driving its own tank, one shared camera; "The couch
session on the page" below says how it runs. Phase 2 is built (item/couch-panes-272, Experimental in 272: Shared stays the lobby's default until the split
screen meets the pass rule): one pane per seat with that player's own camera and the normal battle HUD; "The split
screen as built" says how. The phone as each
player's HUD (phase 3) is still design. The owner's words (2026-11-01): "could we also hypotehtically do this with people connecting via
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

## The split screen as built (phase 2, 272)

The owner's ruling (2026-11-11): "the couch version should just show the normal game ui in each session screen". The
big screen splits like a console's split screen, and each pane shows that player's own camera and the normal battle
HUD, the one the solo battle shows: hull points and the damage panel, ammunition and reload, the sight, the minimap,
consumables, damage and kill messages, the capture and objective state, the rosters. No reduced couch HUD. This
replaces the reduced pane HUD of "Panes' HUD and sound" below, and the four-pane stop of "Decided on the owner's
behalf": the split screen seats as many as the screen holds (below). The lobby's Screen choice is Shared by default
(phase 1, one camera) with Split labelled Experimental (Main, 2026-11-11): Split stays experimental until the
quiet-machine ratio table meets the pass rule and every detail ring follows every pane. Battle Again keeps the screen
the battle had.

- **One HUD, many instances.** `src/ui/hud.ts` `initHud(bus, view)` takes a `HudView`: the body it mounts on, whose
  document is the HUD's. A pane's HUD mounts in its own document, a same-origin iframe over the pane
  (`src/app/couchPaneViews.ts`), so every document-level read and write of the HUD (`battleHudLayout.ts`'s body flags,
  variables and bands, its media queries, its window's resize, the shot log's mount, the kill ribbon's flags) is the
  pane's. `initHud` and `installBattleHudLayout` bind `document` and `window` to the root's own document; the page's HUD
  is the view with no `HudView`. The pane's document carries the page's style sheets (copied, and kept in step as the
  page adds more) and the page's own responsive bands, never a narrow window's (the solo HUD's sizes, below).
- **The per-view context.** Each pane's HUD frame (`game/battleHudFrameRuntime.ts`) and aim controller
  (`game/aimController.ts`) read a view of the battle whose player is the seat's tank (`Object.create(game)` with its
  own `player`), the pane's camera and the pane's rig, so the HUD's player, camera, reticle, shells, damage panel and
  spotting are the seat's. The page player's events that name no tank (`ui:shellSelect`, `ui:consumableUsed`, the sixth
  sense, the killcam) never reach a pane's HUD, and nothing a pane's HUD emits reaches the page.
- **Panes and the seat cap, one rule from the screen** (`game/couchPanes.ts`): each seat count has its grids, the
  screen's preferred shape first: 1 the whole screen; 2 side by side on a screen at least 1.6 wide, else stacked; 3 or
  4 a 2 x 2 grid; 5 or 6 3 x 2 (2 x 3 on a narrow screen); 7 or 8 4 x 2 (3 x 3 on a narrow screen). The grid is the
  first whose cell holds the HUD's core at the solo size (`CORE_MIN_CELL`, 528 x 272 CSS px, measured), and the split
  screen seats at most the largest count whose grid's cell holds it (`couchSplitCapacity`): 8 at 1920 x 1080 (3 x 3,
  639 x 358; a 4 x 2 eighth is 478 wide and cannot), 8 at 2560 x 1440 (4 x 2), 4 at 1366 x 768 and 1280 x 720, 2 in a
  1024 x 600 window (stacked). With more seats in the lobby than the cap, Split is disabled with "Split fits up to N on
  this screen" and the battle is Shared; the runtime never splits past the cap. 2 x 4 strips are out. Every pane is the
  same size, 2 px apart; a cell no seat takes shows dark.
- **One renderer, one context.** `post.ts` `renderViews` runs the normal post chain once per pane, sized to one pane,
  each writing its own rectangle of the canvas through the viewport and the scissor; the governor samples the frame
  once. Each pane's camera is copied onto the chain's camera for its draw, so every camera-dependent pass (the scene,
  the aerial haze, the late effects) is the pane's.
- **The battle opens inside the gun's limits.** The chase camera's first look is taken under the hull's own pitch, not
  under the horizon, and no deeper than the gun can follow (`engine/chaseStart.ts`, for the solo start, its reveal and
  every pane): 10 degrees, or shallower where that look's ground point (from the chase camera about 6 m up and 20 m
  back) needs more than the gun's depression less 2 degrees from its 2.5 m muzzle, and never deeper under the hull than
  that depression less 2 degrees (a hull nose-up on a mound over level ground). The old 10 degrees under the horizon
  opened GUN TRAVEL LIMIT on slopes and on shallow guns (a 5 degree gun cannot reach the ground 20 m ahead). And a pane's aim ray skips its own
  seat's hull, not the page player's (`aimController.ts`): a seat's camera ray met its own turret and laid the gun 83
  degrees up.
- **Cameras.** Each pane has the solo camera rig (`engine/cameraRig.ts`) following its seat, driven by its phone as the
  mouse and wheel drive the solo camera: the aim pad turns it, Scope toggles the gunner's sight, the zoom taps step the
  orbit and the scope, Free look holds the gun. The rig's sight lays the seat's gun (`CouchSeatControls.layAim`), as
  the solo camera lays the player's; the seat's input stage carries that bearing, pitch and range each tick.
- **Spotting per seat.** Before each pane's draw, an enemy of its seat's side is drawn only while that side has it
  spotted with the seat as the receiver (the solo rule with this seat as the player); the seat's own tank hides only in
  its own gunner's sight. The HUD's markers and minimap read the same through the pane's HUD frame. Every hull stays in
  the scene for the split screen (`stateCore.ts` `watchRevealsAll`), and each pane hides for its own draw only. In a
  Together battle the seats share one side, and so its spotting, as allies do in solo; in Teams a pane never shows a
  hull only the other side has spotted.
- **The solo HUD's size, never squished** (Kevin, 2026-11-11: "dont squish the uis"). A pane's HUD is drawn at scale 1
  with the solo HUD's pixel sizes: its document takes the page's (the TV's) responsive bands and keeps the solo tray
  (`battleHudLayout.ts` `data-couch-pane`), while its panels still anchor to the pane's own edges. A pane too small for
  every part gives up parts by one stated priority list (`COUCH_HUD_PRIORITY`, most important first: sight, health,
  ammunition, speed, hits, objective, messages, furniture, consumables, minimap, rosters); the core (sight, hull points,
  ammunition and reload, speed) is never given up. The fit (`couchHudFitStep`, `couchPaneViews.ts` `fitPane`) measures
  each panel in the pane's document; while two parts' panels overlap, one leaves the pane, or the minimap would draw
  under its solo size (its 32vh cap in a short pane), the least important part in that clash goes, and the planner lays
  out again. The harness checks every pane's core against one pane's, pixel for pixel, and names what each layout keeps.
- **Sound: the most recent shooter's solo mix.** The room hears one mix, the solo mix of the seat that fired last (its
  gun, engine and hits as its own), held 1.5 s after its shot so a burst of fire from several seats does not swing the
  room between them; seat 1 before anyone fires. Why not one listener for the room: the audio engine is built around
  one own tank, and a room mix that gives every seat's tank its own presence needs the engine to treat several hulls as
  its own (phase 3, with the phone's private cues); a listener between the seats heard every seat from far away.
- **The couch tier** (`quality.ts` `COUCH_PRESET`, `setCouchTier`): asked for at a split battle's Start, before the
  world builds, and let go on the Garage return. Ultra Low's world and sky cuts (light world, the cheapest terrain
  splat, no marched clouds, bloom or AO) at one raster sample per CSS pixel.
- **The world's detail by the pane's area, one rule** (`couchPaneDetail`, Main's review 2026-11-11). Every knob follows
  the pane's linear size (the square root of its share of the screen): the scene's raster 1 down to 0.6 of the pane's
  pixels (FSR reconstructs it), hulls taking their far detail up to 3 times sooner, the tall grass's density, the
  cascades' reach 240 m down to 80 m with smaller maps, and a draw distance (1500 m down to 500 m, not applied: the world is batched map-wide, below). The
  couch tier carries the raster, the sward and the cascades (`setCouchTier(detail)` at a split Start, when the seat
  count and the screen are known); the hulls' bias reaches the presentation (`getLodBias`).
- **Hull detail per pane.** The near-detail groups a hull keeps (`tankFactoryCore.ts` battle detail groups) attach when
  any pane is near (the union); before each pane's draw, a hull far from that pane's camera (its screen-equivalent
  distance times the pane's bias) is drawn without them in that pane, so no pane pays near-detail draws for another
  seat's neighbours. Restored after the frame.
- **The harness's baseline** (`probeSoloView`). Main's check: one pane must be within 5 % of solo, or the harness is
  wrong. A solo battle is not that baseline: its roster is the solo entry's (far-LOD hulls, 9 to 12 draws each, against
  the couch roster's 40 to 74 at near detail), so it drew 30 % less than the couch battle's one pane. The baseline is
  the same couch battle through seat 1's same camera, visibility and hull detail, drawn the solo way (one
  `post.render`, the page's HUD); the solo battle stays in the report as context.
- **One shadow render and one matrix pass a frame.** The first pane's draw renders the cascades and updates the scene
  graph's world matrices; every later pane samples the same maps and reuses the matrices (nothing moves between the
  panes' draws). Measured: the shadow labels stay flat as panes are added, and the matrix reuse took the eight-pane
  scene pass from 94 to 71 ms of main thread under the same load.
- **Measured (2026-11-12, production build at febf0db4a6, Verdant, Teams, 1920 x 1080, bots frozen, governor pinned,
  the couch tier by pane area; `node tools/couch-panes.browser.mjs --layouts=1,2,4,8 --measure --preview=.
  --max-load=10 --load-wait-min=360`).** The run took the lock when the load fell to 8.6, but other sessions resumed and
  the rows were measured at load 13 to 26: not a quiet machine. The baseline is the same couch battle through seat 1's
  camera, visibility and hull detail drawn the solo way (`probeSoloView`: one `post.render`, the page's HUD), 17.9 ms of
  main thread and 409 draws; a solo battle (another roster) read 17.1 ms and 379 draws. Projection: the RTX 4050 Laptop
  proxy (GPU / 0.342, main thread / 0.624).

  | Panes | Main thread | Scene pass | Panes' HUDs | Draws | Main / solo view | Per added pane | Projected |
  |---:|---:|---:|---:|---:|---:|---:|---:|
  | 1 | 16.6 ms | 11.3 ms | 0.9 ms | 409 | 0.93 | | 10.1 fps |
  | 2 | 28.3 ms | 22.0 ms | 1.2 ms | 888 | 1.58 | 11.7 ms | 15.1 fps |
  | 4 | 47.5 ms | 38.4 ms | 1.8 ms | 1,619 | 2.65 | 10.3 ms | 10.9 fps |
  | 8 | 89.1 ms | 70.4 ms | 3.4 ms | 2,853 | 4.98 | 10.4 ms | 7.0 fps |

  The pass rule (60 fps at two panes, 45 at four) is not met, so Split ships Experimental with Shared the default. Main's
  harness check (one pane within 5 % of solo) reads 0.93 with identical draws, the same in three runs (0.91 to 0.93): the
  split path for one pane is cheaper than the solo path's own HUD and aim work, so the ratios are reported as they are.
  Even with solo at a quiet 9 ms, two panes would take about 14 ms of main thread (about 45 fps on the proxy). Each
  added pane costs about 10 to 12 ms here, nearly all of it three.js's scene pass at about 450 draws a pane; each
  pane's HUD costs under half a millisecond. Before the per-pane detail rule and hull detail (the same harness, load
  about 55), a pane added 13.1 / 13.8 / 10.9 ms at 2 / 4 / 8 panes.
- **What a pane draws, and why a draw-distance cull does not help** (the world inventory, 2026-11-12, a solo battle on
  Verdant, 486 draws a frame: `couch-panes-272-evidence/world-inventory.json`). The world is already batched across the
  whole map: the trees are 80 instanced pools (species x near and far tier x level of detail, about 125,000 trees) and
  about 60 canopy and outland shadow-caster pools; the props are instanced rock variants and meshes merged per material
  over the whole map (`props.ts`); the terrain is 64 chunks of 128 m, culled per chunk, with the horizon pieces; the
  litter and the tall grass are three instanced meshes each. A batch that spans the map is one draw at 50 m or 900 m, so
  a per-pane draw distance has nothing to leave out but terrain chunks (holes at the horizon), and batching by chunk
  would add draws. A pane's world draws (about 230) count its distinct pools and materials; its other half is the hulls,
  20 to 74 draws each at near detail. The class fix, fewer vegetation and prop pools (species and tiers that share a
  shader in fewer instanced pools), lowers solo too and is its own item (Main, 2026-11-12), with the hulls' merged far
  layer drawn per pane as its second half; `couchPaneDetail`'s draw distance stays unwired.
- **Detail that follows every pane.** The terrain's chunk detail and the near tree tier take the nearest pane's distance
  (`map.ts` `setTerrainDetailFoci`, `terrain.ts`, `vegetation.ts` `setDetailFoci`), and a hull's detail and animation
  cadence the nearest pane's distance and any pane's view (`battlePresentationRuntime.ts` `getExtraViews`). Still
  following seat 1's pane (acceptable while Split is Experimental, not after): the tall grass ring, the grass carpet,
  the litter, the water field and the shadow cascades.

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

- (Replaced 2026-11-11 by the owner's ruling: the split screen seats one to eight, each pane with the normal HUD; see
  "The split screen as built".) Split screen stops at four panes. Five to eight players share one camera, because eight panes on one TV are each about
  480 × 540 on a 1080p set, too small to read from a couch, and cost eight views a frame.
- The first modes are co-op against bots and team against team. Free-for-all follows once spotting per seat is proven.
- Couch co-op seats up to eight, through a couch entry in `src/sim/matchRuleset.ts` (the co-op modes seat seven today).
- The battle stays on the page, like solo. Moving a local simulation off the main thread needs the owner's ruling
  (`docs/ARCHITECTURE.md` §1.6), and couch mode does not ask for it.
- (Replaced 2026-11-11: two players sit side by side on a wide screen, stacked on a narrower one.) Two players split the
  screen top and bottom, which keeps the horizon wide; a side-by-side option can follow.
