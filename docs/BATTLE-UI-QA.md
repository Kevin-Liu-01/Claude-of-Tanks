# Battle UI layout regression

The battle HUD now assigns bounded left/right lanes between the visible team
rosters (or touch minimap) and the bottom controls. Incoming alerts occupy
the left lane; outgoing reports and the combat log share a stable lower-right dock.
The lanes update through ResizeObserver and viewport/panel events, not the
render loop. Resizing a window or enlarging the minimap recalculates an already
open report. The full combat log scrolls within its lane; alert density reduces when
space is tight. The results footer has its own layout row.

Primary owners: `src/ui/battleHudLayout.ts`, `src/ui/battleHudLayout.css`.
The shared modal Tab boundary also applies to battle Settings.

## Reproduce

Start the regular Vite server, then run:

```sh
node src/ui/battleHudLayout.selftest.mjs
node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/absolute/new-evidence-directory
```

The rendered gate uses Playwright and installed Chrome. If Playwright is
provided outside the repository, pass
`--playwright-module=/absolute/path/to/playwright/index.mjs`.
Its fixture imports the **production** HUD, damage panel, input, touch controls,
multiplayer connection status, Settings, results UI, and responsive CSS. It does not duplicate their
markup or use a simulated CSS layout engine. No full WebGL scene is needed for
this deterministic geometry gate; verify the live battle separately as well.

## Coverage

- Mouse: 1920×1080, 1366×768, 1280×720, 1024×600, 820×1180,
  540×720, 390×844, 844×390.
- Touch: 1024×768, 768×1024, 390×844, 360×640, 844×390, 667×375.
- Chinese: 1280×720 mouse and 390×844 touch; all other cases use English.
- States: ordinary HUD, countdown, incoming/outgoing hit reports, combat log,
  simultaneous log/hits, spectator, Settings, sniper, enlarged map,
  expanded touch ammo, special action, and results.
- Allied and enemy kill notifications populate both upper side lanes in every
  battle state. All seven mode objectives are measured against the score,
  minimap, notices and mobile toolbar.
- The full five-control Gravity/ATGM kit is checked for 44px touch / 32px mouse target heights
  and one correct action per click, including horizontally scrolled controls. On touch the
  controls are the action dock's tiles (at least 44px, never scrolled, off everything the
  reticle draws), checked in every state with five, six and seven controls, More included,
  in the battle sight and the scope at rest and at full bloom (see below).
- Settings tabs are clicked through; Shift+Tab is checked at the focus boundary.
- Each case also rotates/resizes with the combat log open and enlarges the map, then
  returns to its original size. Both resized layouts are measured.
- The production killcam phase class is checked for leaked chat/touch controls;
  the results fixture includes both Battle Again and Return to Garage actions.

The JSON report records the current state/viewport count. The gate fails on overlapping
screen-fixed regions, offscreen bounds, failed ammo disclosure, focus escaping
Settings, or browser exceptions. JSON geometry receipts and selected/failing
screenshots are saved under `--out`. Keep evidence outside tracked source.

This is emulated Chromium coverage, not physical iOS/Safari certification.
World-space tank names remain attached to their projected vehicles and are
intentionally excluded from screen-fixed panel collision checks. Full-screen
modal backdrops intentionally cover the battlefield; their internal regions
are checked instead. The 3D killcam presentation is not part of this fixture.

## Map and battlefield agreement

Pickups are independent of the objective type: Mars renders both capture zones
and every active repair/ammo cache. Collection removes the cache from the
authoritative state, world pool and map together. Both map and world derive
Frontline ownership from `minimapObjectives.ts`, including defender viewpoints.
Inactive wave reserves have no map contact; reactivation starts fresh spotting
memory. Live objective geometry is excluded from the baked map background.

The existing `matchModeWorldPresentation`, `minimapObjectives` and
`minimapCapturePolicy` selftests cover these contracts in `npm test`. For the
real HUD canvas, start Vite and run (the tool acquires the shared capture lease):

```sh
node tools/minimap-contacts.browser.mjs --url=http://127.0.0.1:5189
```

This checks hidden reserves, activation, deactivation, repeated deaths and
respawns, event-only respawn handoffs, and distinct last-known contacts through
pixel comparisons of the production minimap over Verdant's baked map. It runs
at desktop, portrait and landscape phone sizes; captures and results go in
`.qa-dev/minimap-markers/`. Use `--playwright-module=/absolute/path/to/playwright/index.mjs`
if Playwright is supplied by an external browser runtime.

A filled arrow is a visible tank; a muted hollow arrow is its last observed
position and heading. Death, respawn and inactive-wave transitions clear that
contact. Wreck crosses are drawn separately and cannot turn into contacts on
the next life. The simulation also clears prior-life spotting, firing bloom
and sixth-sense timestamps while retaining its allocated records. The pure
`minimapContacts` and `spotting` selftests cover these lifecycle rules in
`npm test`.

Spawns use the same upright tank-and-return-arrow glyph on the minimap and
world beacon, tinted for the viewer's team. The compact glyph has a dark backing,
fits its radius, and stays inside the minimap at the map edges.

### Vehicle controls and score alignment

The objective follows the scoreboard's measured center, including the shifted
landscape-phone position. Its widest edge clears both clipped bottom corners
by eight pixels. The layout probe checks those corners, not just total widths.
Vehicle controls have transparent backgrounds, active underlines, no OFF labels,
and replace Smoke/ATGM labels with their remaining cooldown. Exhausted smoke
shows 0/3; it does not promise a fourth salvo. Damage notifications have no heading.
In a jump mode (Turbo Ball, Mars in every gravity world) the jump is always the
leftmost vehicle control, on desktop and touch, whatever the loadout or its
cooldowns; other modes keep the loadout order. `src/ui/vehicleControlOrder.ts`
is the row's one ordering and `vehicleControlOrder.selftest.mjs` its receipt.

Zone Control and Gravity award 25 points per confirmed enemy destruction, once
per vehicle life. Friendly fire, self-destruction and duplicate receipts do not
score. The shared mode tests cover both solo and network team names; the authority
regression verifies a real shell kill reaches the score in the snapshot.

### Expanded rosters and contained shot diagrams

Hold Tab during battle to widen both team lists and use spare vertical room;
release Tab or switch away from the window to collapse them. Settings, modals
and text entry keep normal keyboard navigation. Up to fourteen entries remain
rows; fifteen or more use the icon grid. Normal rows are capped at 24px and
Tab-expanded rows at 30px; fewer participants shrink the list instead of
stretching the rows. Short screens can compress rows without scrolling,
with the vehicle subtitle omitted only where a short row cannot fit it.

Multiplayer names and counts use the complete announced match roster, separate
from spotted world actors. Unspotted enemies remain listed with legible muted
names. This does not reveal their positions or add them to targeting/minimap
visibility. Lobby lists retain every room participant, including spectators
and disconnected players.

When either side reaches fourteen tanks, the shot card omits Angle, Armor,
Damage and Pen detail rows. The outcome, damage total, shell and target remain.
Top and side diagrams preserve their aspect ratios, contained within the card;
the hit overlays and tint coordinates scale with them. The right-side kill
feed reserves room for the readout and the gap above it.

The rendered matrix now includes Tab expansion/release, every roster entry
fitting without scrolling, report density, diagram containment and aspect
ratios across the existing desktop/mobile and English/Chinese cases.

### Illustrated Field Manual

Garage help now uses twelve distinct in-game photographs: Battlefield,
Camouflage, Dossier, Performance, Protection, Ammunition, Armament, Modules,
Crew, Equipment, Vehicle Controls and Smoke. The general examples use an
M1A2 Abrams on Verdant Fields, identified in their captions. Protection,
Modules and Crew use the real Gallery inspection overlays, not hand-drawn
internal layouts. Dossier and those three chapters retain an expandable
technical reference for the currently selected tank.

`src/ui/infoGuideCaptures.ts` owns the annotation coordinates and the chapter
image selection. `infoGuidePhoto.ts` presents the unretouched photograph,
numbered touch targets and SVG leaders. Text stays in both localization
catalogs so it remains readable and translatable; small containers display
numbers above the full-size chapter controls. Keyboard activation and touch
select the same explanation. Images load only when their help is opened.

Smoke has two frames: the launch and the developed screen. Its dashed arcs
are projections of `requestAuxiliary` / `smokeCanisterPosition` receipts, and
its clouds use the production auxiliary FX path. Other arrows are explanatory
annotations, not live route planning or visibility telemetry. Foliage provides
concealment; solid terrain can block sightlines; smoke does not stop shells.
Equipment illustrations identify affected systems without claiming that a
stat modifier adds visible equipment geometry.

Capture assets live in `public/field-guide/`, separately from owner-directed
promotional media and map photographs. `manifest.json` records cameras, scene
seeds, texture readiness, renderer, source revision and image hashes. Rebuild:

```sh
nice -n 19 node tools/field-guide-capture.mjs
# A bounded refresh uses the same queue and rendering workflow:
nice -n 19 node tools/field-guide-capture.mjs --only=crew,modules
```

Recipes are in `tools/field-guide-scenes.mjs`. The capture tool obtains the
shared FIFO lease, verifies native GPU rendering, waits for map textures,
uses Studio's full-resolution export and releases its browser/server/lease.
Review photographs and their annotation alignment after any recipe or model
change. If smoke trajectories change, refresh the annotation paths from the
new receipt as well. Do not use image synthesis or paint over a screenshot.

Run `node src/ui/contextInfo.selftest.mjs` for capture hashes, complete paired
locales, annotation bounds, technical-reference scope and actual smoke paths.
With Vite running, `node tools/field-guide.browser.mjs` exercises the production
help/modal owners through `tools/fixtures/field-guide.html`. It covers all
twelve chapters at desktop, portrait, landscape and very short landscape
sizes, Chinese text, keyboard activation, touch targets, orientation changes,
and switching between Abrams and Sheridan technical diagrams. Browser output
belongs in `.qa-dev/field-guide/`; the fixture has no game renderer or live room
connection.

### Compact combat notifications

Incoming damage shows the attacker's exact side silhouette before its name,
using the same asset and tint as kill notifications. When a hit lacks a model
ID, the known event ledger may supply it; entity IDs are never treated as model
IDs. Damage notices keep a 240 px maximum width; kill and chat panels allow up to
400 px, constrained by the viewport. Kill and damage notices share 26 px rows.
Each feed retains its newest eight events, displays only complete rows that fit
the measured free space, and expands again when room becomes available. Open
chat, damage feedback and the combat readout reserve space before kill feeds
grow. The browser matrix includes bursts beyond the retained limit. Left feeds touch
the left edge; enemy kill notices touch the right, with content padding for
phone display cutouts. Long names truncate before the damage/outcome value.

The HUD browser matrix checks silhouette placement, row height, maximum width,
edge alignment and non-overlap across desktop and phone orientations. Input
selftests verify that armor highlighting starts off and explicit saved choices
still load.

## Mobile and multiplayer matrix (October 2026)

Run these browser gates sequentially under the shared capture lease:

```sh
node tools/mobile-surfaces.browser.mjs --url=http://127.0.0.1:5204
node tools/mobile-multiplayer-layout.browser.mjs --url=http://127.0.0.1:5204
node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5204
node tools/battle-load-layout.browser.mjs --url=http://127.0.0.1:5204
node tools/mp-p2p-e2e.mjs --mobile --width=667 --height=375
```

The setup gate covers all seven modes, the custom selectors, map previews,
appearance and equipment drawers, four settings tabs, and private/LAN failures.
It includes 320×568 and 390×844 portrait, 568×256 browser-height pressure,
568×320, 667×375, 844×300, 844×390, and 932×430 landscape, plus Chinese.

The multiplayer layout gate uses the production lobby adapter with 28 seats
(and an additional spectator), both room types, every mode, and host/guest/
spectator permissions. It checks actual taps on Ready, Leave and dropdown
options, full-popup bounds, horizontal overflow, 44px primary controls and
accessible names. It separately mounts the production connection-status owner
in every mode, including reconnecting, details scrolling, Escape/focus return,
rotation and Leave. These deterministic states prove presentation and control
wiring; they are not a claim that 28 real peers connected.

The P2P gate is the separate real-browser/Worker/WebRTC proof: create, join,
ready, start, authoritative movement, host migration and rejoin. `--mobile`
uses touch input and phone viewports, with host-capable graphics tiers retained
for the elected hosts. It also checks live battle controls after portrait and
short-landscape rotation. This remains desktop Chromium emulation, not a
physical phone, Safari, mobile GPU performance or Internet/TURN certification.

On short touch screens, the network strip becomes a 44px signal control beside
the map; its details and Leave action stay inside a scrollable reader. Network
outages retain their live announcement and a visible health label, with the
full explanation inside details. Room dropdowns use the browser top layer to
escape scrolling-panel clipping. At 340px landscape height and below, the main fire button remains while its
duplicate is omitted; below 300px, ammo and consumables get separate 44px rows. Countdown and detection layouts also account for narrow
portrait screens.

The HUD fixture advances through the production 30-frame threshold before
measuring: the FPS plate must be visible during geometry checks. Touch FPS is
placed below the joystick, with a separate spectator position; multiplayer
latency remains in the connection control. Mobile physical gun warnings use a
measured DOM notice instead of painting over controls on the reticle canvas.
The geometry gate includes those notices alongside detection and damage alerts.

### Verified local run — 2026-10-01

- 396 setup/garage/settings checks: passed.
- 807 HUD state/viewport checks, including live FPS and mobile gun warnings: passed.
- 1,099 private/LAN lobby and in-battle connection checks: passed.
- 132 loading-roster layouts: passed.
- Real three-browser local P2P run with touch input: passed. The observing peer
  saw 93.7m of joystick-driven movement in 12 seconds and 241 new snapshots.
  Host migration completed in 3.3 seconds; the returning host automatically
  rejoined as a peer on the first attempt. No browser errors were recorded.
- Type checking, focused HUD/layout/lobby/status tests, and public build: passed.

Receipts are local ignored artifacts under `.qa-dev/mobile-surfaces`,
`.qa-dev/mobile-hud-final`, `.qa-dev/mobile-multiplayer`,
`.qa-dev/battle-load-layout`, and `.qa-dev/mp-p2p-mobile`.


### Full mobile garage access — 2026-10-01 follow-up

Camouflage, Battlefield and Vehicle Dossier open as full reading panels on
compact screens. The stats chart button opens the dossier: equipment, every
performance metric, ammunition, protection, armament, modules, crew, vehicle
controls and their illustrated help remain available. Armor/module/crew diagrams
can be enlarged without losing the underlying dossier. Close and Escape return
to the originating control; a nested equipment picker keeps its own keyboard
boundary. The desktop sidebar composition stays persistent.

Camouflage has the complete nation collections and biome filters, with the
custom painting studio available through the same production access controller.
Filters scroll with the catalog so they cannot consume all the space on a short
screen. Color controls, brush settings, painting, stamps, palette, pattern
transfer and Apply remain reachable. The full map catalog and map help remain
available; the first tap selects a map and another tap on the selected map
opens its photograph. Short multiplayer garages keep room readiness between
the side controls rather than pushing dossier access underneath the tank rail.

Run the deeper garage gate directly; it owns its Vite server, browser, shared
capture lease, and cleanup (do not wrap it in another capture lease):

```sh
nice -n 19 node tools/garage-mobile.browser.mjs --out=/absolute/new-evidence-directory
```

Supply `--playwright-module=/absolute/path/to/playwright/index.mjs` when needed.
The fixture loads the production tank, camouflage, map and staging catalogs.
It checks 44px touch targets, names, hit testing, viewport bounds, every nation
rail, the last catalog cards, navigation and service record, all help sections,
all technical tabs and Gallery entry controls. It draws and saves camouflage,
selects equipment, tests nested Escape/Tab focus, exercises private/LAN garage
status, and rotates with dialogs open. Gallery destination rendering and
clipboard permissions are outside this gate; its room status is deterministic
presentation state, not a live connection claim.

Coverage: 320×568 and 390×844 portrait; 844×390, 667×375, 568×320,
568×256 and 480×240 landscape; Chinese at 568×256; orientation round trips.
The run passed 1,728 garage checks. The related setup/settings gate passed 396,
the private/LAN lobby and connection gate passed 1,099, and the ten-case touch
HUD subset passed 360. No browser errors or layout failures were recorded.
Type checking, focused garage/mobile/modal/help tests and the public build also
passed. These are Chromium touch emulations, not physical iOS/Safari tests.
Receipts: `.qa-dev/garage-mobile-complete` and `.qa-dev/garage-related-*`.

## Touch action dock (2026-10-14)

Owner: "find a better way to show the stuff u can do row on mobile". The row is
`.cot-vehicle-controls` (special action, jump, drone, missile, smoke, lights,
roof gun); on touch it is now the action dock. Owners: `src/ui/touchActionDock.ts`
(placement, cooldown sweep), `battleHudLayout.ts` (measures the fixed controls,
applies it), `battleHudLayout.css` (tiles), `hud.ts` (writes `--cd`).

**What was wrong** (production HUD fixture, Chromium touch emulation, M1A3 kit in
Mars: five controls):

- It was the desktop text strip at 44 px: 9 px labels, 13 px icons, keyboard
  keycaps (E/F/G) that mean nothing on glass, and a sideways scroll under a hidden
  scrollbar. 360×640 and 390×844 cut off *Auto gun*; 667×375 cut off two controls,
  320×568 three; any seven-control kit lost two to five. Nothing showed that more
  existed.
- Portrait placed it above the ammo selector: y 416 on 390×844, the middle of the
  screen over the aim pad, far from both thumbs; on 360×640 it took the left kill
  feed's whole lane (zero rows).
- Cooldown was only a text swap ("12s"); smoke charges were hidden.
- Landscape squeezed it between the drive gauge and auto-aim; it fit five at
  844×390, not six or seven.

**Alternatives considered**

1. *Thumb arc around FIRE*: the genre habit, but the right thumb's arc already
   holds FIRE, scope, auto-aim, the second FIRE, the consumables and the ammo
   selector; seven more buttons there either overlap them or push them away, and
   FIRE is a drag-to-aim gesture that crowding turns into mis-taps.
2. *Icon tiles with cooldown sweeps and captions, placed by search* (chosen).
3. *Collapsible tray behind one button*: smallest footprint, but smoke and jump
   become two taps in a fight, and a closed tray hides every cooldown.

The tiles win on both counts asked for: every control is one tap and always
visible, and the tile reads at a glance (22 px icon, caption, sweep). Long-press
labels were dropped because a tile acts on the lift of a short tap; a caption stays
under each icon instead.

**The rule** (one rule, shared by the design, `touchActionDock.selftest.mjs` and
`tools/battle-hud-layout.browser.mjs`): on every touch screen the row is docked;
every tile is at least 44×44 px, Apple's minimum touch target (Human Interface
Guidelines), and 48 px, Material's comfortable target, wherever 48 fits; the dock
never scrolls; it covers no touch control (a round button's caption included) or
instrument (the swipe-to-aim hint included), nothing the reticle draws in either
sight at any bloom (`touchReticleFootprint`) but the scope's cross-arm tips, which
the live yield dims a tile for (round 6), nor the gun-limit warning's place, and it
keeps clear of the reserved lanes unless nothing else fits; and it shows at least as
many controls whole as main's scrolling strip did on that screen (round 6). 48 px
everywhere is not possible: a 360×640 phone has a 45 px band between its minimap
and the open ammo drawer, and a 320×568 phone or a 568×256 landscape browser has no
48 px gap at all that clears its joystick, FIRE cluster and instruments. The old
scrolling strip remains only for a screen with room for no tile at all (none of the
thirteen receipt viewports).

**Design**: tiles (6 px gap) in the row's own order, filled from the bottom row
up: the first control (the jump, in a jump mode) is the bottom-left tile, nearest
the thumbs; one row when it fits, at most three. The dock goes to the free spot
nearest the point between the joystick and FIRE with 8 px clearance (6 px for 44
px tiles) from every touch control (each round button with the caption hanging 17
px under it: AUTO AIM, SCOPE, FIRE, ROCKET, its band at least as wide as the button
so a caption that changes with the button's state moves nothing), instrument, the
open ammo drawer, the swipe-to-aim hint (round 6; the notices may pass over it), the
safe areas, and the reserved lanes: the gun-limit warning's own place (48 px under
the crosshair, 140 px wide on a portrait phone 341 to 480 px wide and 180 elsewhere;
326 px down on 340 px phones; under the minimap on landscape phones), and the centre
notices' place when the plan reserves it first (below). Only a screen
with no room even for a lone More tile clear of those lanes (568×256) stands the
dock in a lane; there (`data-hud-dock-lane`) a notice shown in that lane draws over
the More tile for its few seconds and a tap still reaches the tile through it. The
aim keep-out (`touchAimKeepOut`, 2 px hairline, dock and More panel alike, never
relaxed) is everything the reticle canvas draws around the screen centre, where
touch aim raycasts, in the battle sight and the scope, at every ring radius from rest
(11 px) to full bloom (15% of the shorter side) but the scope's cross arms (to 1.55 r +
3 px, with their mil ticks; round 6: on every portrait phone their tips at full bloom
were all that kept a block for every control off the screen, so the scope reports the
arms it draws to the live yield and a tile under them dims): the full-bloom ring
(never under the 64 px crosshair area), the autoloader rack and the reload countdown (or SWITCHING) under the marker, the
scope's ammunition line and zoom plate with its rules, its range tag riding the
ring's 4:30 point outward, and the gun-limit warning's place. Each piece restates
one hud.ts placement, pinned by the selftest. A 44 px row by the thumbs beats a 48
px block across the screen. When the whole row does not fit, the last slot is
**More** (`⋯ +n`): it opens the remaining controls beside it, clear of the touch
controls, the dock and the aim keep-out (the open panel may lie over instruments
for that moment; on a screen too crowded even for that, clear of the dock and the
aim keep-out alone); the next tap anywhere closes it, after the control it lands on
has acted. Every control is one tap away, or two through More. A touch on a tile
acts when it lifts within 10 px; a touch that travels farther acts on nothing and,
begun over the aim pad, becomes the pad's swipe from where it began, so a swipe to
aim that starts on a tile still aims (a mouse keeps acting on press). A cooldown
clears a shadow off the tile clockwise and fills an amber ring while the caption
counts seconds; smoke charges are a corner badge. The gun-limit warning never moves
(it used to be pushed onto the crosshair). Touch buttons and tiles are watched by
size only, so a FIRE press (down/aiming/autofire classes) never relayouts the HUD,
a pressed button keeps its resting box (holding FIRE through a hit notice keeps an
open More panel), and the search reruns only when its inputs change. Desktop is
unchanged.

**The reticle away from the centre** (round 4, verifier 2026-10-15): the keep-out
above is centred, but hud.ts draws the dispersion ring and the physical gun mark at
the gun's own point (`view.gunX/gunY`), which leaves the crosshair whenever the
turret or gun lags the camera, a limit pins it or the gun line is blocked; a
turretless sight (Strv 103, UDES 03, Jagdpanzer E100) moves its whole sight there,
readouts included, held 40 px inside the screen edge. The incoming-hit wedges circle
the centre from max(0.185 × shorter side, ring + 26) px, about 64 px thick, with the
"-420" / CRIT figure beyond them. Measured drift envelopes (fleet: 220 specs,
turret traverse 9.2–94.1°/s, median 41.6°/s; gun depression 5–14°; fixed-mount
arcs ±3–12°; touch aim turns the camera 0.149° per px of swipe, the same on-screen
distance in the scope; vertical field of view 60°, divided by the zoom in the scope):

| Viewport | px per degree (battle / ×8 / ×25) | Nearest tile beyond the full-bloom ring | 300 px flick in 0.15 s, slowest / median turret | 60 px drag in 0.5 s, slowest turret | Gun pinned 6° below |
|---|---|---|---|---|---|
| 360×640 | 9.7 / 77 / 242 | 9 px (0.9° / 0.11° / 0.04°) | 418 / 371 px | 42 px | 58 px |
| 390×844 | 12.8 / 102 / 319 | 38 px (3.0° / 0.37° / 0.12°) | 552 / 490 px | 55 px | 77 px |
| 844×390 | 5.9 / 47 / 147 | 39 px (6.6° / 0.83° / 0.26°) | 255 / 226 px | 25 px | 35 px |
| 667×375 | 5.7 / 45 / 142 | 37 px (6.4° / 0.80° / 0.26°) | 245 / 218 px | 25 px | 34 px |
| 320×568 | 8.6 / 69 / 215 | 139 px | 371 / 330 px | 37 px | 52 px |
| 568×320 | 4.8 / 39 / 121 | 17 px | 209 / 186 px | 21 px | 29 px |
| 844×300 | 4.5 / 36 / 113 | 38 px | 196 / 174 px | 20 px | 27 px |
| 932×430 | 6.5 / 52 / 162 | 47 px | 281 / 249 px | 28 px | 39 px |
| 1024×768 | 11.6 / 93 / 290 | 163 px | 502 / 446 px | 50 px | 70 px |

Any quick flick puts the gun mark off the screen (a turreted sight drops it, a
turretless one rides the edge), and an ordinary drag or a depression limit moves it
past the nearest tile on every phone: a static envelope for it is the whole screen
and would leave no room for a single tile. So the dock reacts live instead
(`touchDockYield.ts`): it sits under the reticle canvas (`.cot-ret`, the sight
layer; while the More panel is open the canvas is lifted above the panel), so the
ring, gun mark, a turretless sight's readouts, the wedges and their figures always
draw over the tiles; and each tile the live ink reaches dims (`data-ret-yield`,
opacity .38) so that ink reads clearly over it, while it stays where it is and still
takes taps. hud.ts reports the ink of each painted frame (the ring at the gun's
point and the gun mark, a turretless sight's whole footprint moved with it, each
wedge's sector, each figure's and CRIT's box, the hit-confirm shards); a tile dims
once ink comes within 2 px and clears only when all ink is 10 px away, so a ring
breathing at a tile's edge cannot flicker it; attributes are written only on change
and nothing is allocated per frame. The scope's lens shading moved to its own canvas
(`.cot-ret-lens`) under the dock, painted only when the zoom, size or fade-in
changes, so tiles are not darkened in the scope.

**Centre notices and the countdown** (round 4): on 390×844 round 3's dock pushed
the detection notice and the alert down to 11 px above the aim point and the
countdown across the crosshair (333–469); main itself puts them on the crosshair of
most phones (the kill feeds push the notices down, the countdown sits at fixed
percentages). `centreNotices.ts` now places them on every touch screen: the
cheapest place (highest, then most central) that clears the widest of the reticle's
keep-outs any place clears (3: everything either sight draws at any bloom; 2: the
battle sight at full bloom; 1: the crosshair core, the 64 px round the aim point and
the magazine and countdown under it), stacked (detection over the alert) or flanking
the reticle's column on one line, or split (each at its own clear place, where
neither fits beside the feeds' rows), at full size or compact (round 5: 180, 150 or
120 px wide, the detection keeping its second line wherever main shows it, the alert
in 8 px type, main's smallest); the countdown scaled down to 60% or as one compact
40 px line. The alert's box is a reserve as tall as the longest alert needs at its
width (measured in the page's own type, never clamped), not its text, so nothing
moves while notices come and go; notices are never pushed by the feeds, and keep off
every row the feeds show (see *Feeds kept*, round 5). Below clearance 3 a place
costs as much more as it covers of the rest of the reticle, and every size is weighed
(round 6). `planTouchDock` tries the notices' place reserved before the dock, and the
dock placed first (the search's own pick and the nearest dock of one, two and three
rows), and keeps whichever shows the most controls (round 6; before, the notices'
clearance came first), then one clear of the notices' lane unless every such dock
leaves the notices on the crosshair (568×256 only), then leaves the notices and the
countdown clearer of the reticle (at the feeds' usual fill), then sits nearer the
thumbs (in steps of two tile rows), then 48 px tiles. The notices are placed only
round the docks that show the most controls. Keep-out each screen clears (worst
state, 1–7 controls; main measured in the same fixture states):

| Viewport | Notices: branch / main | Countdown: branch / main |
|---|---|---|
| 360×640 | 1 / 0 (round 5: 3) | 3 / 0 |
| 390×844 (+zh) | 3 / 1 | 3 / 0 |
| 844×390 | 3 / 0 | 3 / 0 |
| 667×375 (+zh) | 3 / 0 | 3 / 0 |
| 320×568 | 0, least covering / 0 (round 5: 1) | 1 / 0 (round 5: 3) |
| 568×256 | 0, least covering / 0 | 0, least covering / 0 |
| 568×320 | 1 / 0 (round 5: 3) | 0, least covering / 0 (round 5: 2) |
| 844×300 | 3 / 0 | 3 / 0 |
| 932×430 | 3 / 0 | 3 / 0 |
| 1024×768 | 3 / 2 | 3 / 1 |
| 768×1024 | 3 / 1 | 3 / 2 |

On 360×640, 320×568 and 568×320 (round 6) the notices' clear place was the only room
for a dock showing main's whole tiles: 360×640's band under the minimap is its
column of tiles, 320×568's dock stands where main's strip stood under the settings,
568×320's two rows sit by the joystick. Their notices still keep off the crosshair
wherever a place does (and cover the least of it where none does), and on every
state of the receipt each covers less of the reticle's ink than main's (*Round 6*
below). 568×256's objective plate, minimap, settings trio, joystick, drive gauge and
consumables leave no band above the ring for even the compact notices (the solver
searches every position, size and arrangement). Mouse layouts are unchanged.

Placements from the layout code for the receipt's 13 touch cases (11 sizes; Mars
objective shown; round 6, off the feeds' lanes, the captions and the aim hint), and
the tiles main's scrolling strip showed whole (five controls or more):

| Viewport | 5 controls | 6 | 7 | Main's strip | Where |
|---|---|---|---|---|---|
| 360×640 | 44px 2×3: all 5 | all 6 | 5 + More (2) | 4 | left of the reticle, under the minimap |
| 390×844 (+zh) | 44px 2×3: all 5 | all 6 | 5 + More (2) | 4 | left of the reticle, above the drive gauge |
| 844×390 | 48px row | 48px row | 48px row | 5 | by the thumbs |
| 667×375 (+zh) | 44px row: all 5 | 44px 3×2: all 6 | 5 + More (2) | 3 | by the thumbs / left of the reticle |
| 320×568 | 44px row: 3 + More (2) | 3 + More (3) | 3 + More (4) | 2 | under the settings, where main's strip stood |
| 568×256 | 44px: 1 + More (4) | 1 + More (5) | 1 + More (6) | 1 | in the notices' lane, left of the reticle |
| 568×320 | 44px 2×2: 3 + More (2) | 3 + More (3) | 3 + More (4) | 1 | left of the reticle, by the joystick |
| 844×300 | 48px 2×3 | 48px 2×3 | 5 + More (2) | 5 | left of the reticle |
| 932×430 | 48px row | 48px row | 48px row | 5 | by the thumbs |
| 1024×768, 768×1024 | 48px row | 48px row | 48px row | 5 | by the thumbs |

**Feeds kept** (round 5): round 4's notices and countdown emptied the kill feed and
the incoming-damage feed on every touch screen (a notice within 12 px of either
column ended both feeds 8 px above it, even above the feeds' own start), long alerts
were clamped to two lines, and on 390×844 the dock above the ring cut a burst from
11 kill rows and 3 incoming toasts to 3 and 1. Now each feed keeps main's lane:
`touchStripBox` restates where main's touch strip stood (above the ammo selector, or
between the driving instruments and the aim buttons on a landscape phone; never
wider than its five-control kit) and each feed ends where it ended on main
(`battleFeedStack` is main's own share of the left column). The dock keeps off those
lanes at their fullest (a separate tier in `placeTouchActionDock`, given up only
where not even a lone More tile fits, which no receipt screen needs), the notices
and the countdown keep off the rows the feeds show now (re-placed when a kill or a
hit changes them; the dock never moves for them), and a box ends a feed only where
it truly lies in that feed's column and starts below the feed's start
(`touchFeedFloor`). Where the strip's place is free now a feed may grow past main's
end, never into the battle sight at full bloom (`touchFeedRingFloor`), and never at
the cost of a kill row or a toast main showed. Rows shown, worst over every state
with five, six and seven controls, this branch (main five controls), from the
rendered receipt:

| Viewport | Burst: kills (clear of the ring) / toasts | Notifications kills | Countdown kills | Standard kills | Combined + spotted: kills / toasts | Idle kills |
|---|---|---|---|---|---|---|
| 390×844 (+zh) | 11 (10) / 3 vs 11 (10) / 3 | 6 (6) | 6 (4) | 6 (6) | 6 (6) / 1 (1) | 6 (6) |
| 360×640 | 3 (3) / 0 vs 1 (1) / 0 | 1 (1) | 1 (1) | 2 (2) | 3 (1) / 0 (0) | 3 (1) |
| 320×568 | 1 (1) / 0 vs 0 (0) / 0 | 0 (0) | 0 (0) | 2 (1) | 1 (0) / 0 (0) | 1 (0) |
| 844×390 | 1 (1) / 1 vs 1 (1) / 1 | 2 (2) | 2 (0) | 4 (4) | 1 (1) / 1 (1) | 2 (2) |
| 667×375 (+zh) | 1 (0) / 1 vs 1 (0) / 1 | 1 (1) | 2 (0) | 3 (3) | 1 (1) / 1 (1) | 2 (2) |
| 568×320, 568×256, 844×300 | 0 / 0 vs 0 / 0 | 0 (0) | 0 (0) | 0 (0) | 0 (0) / 0 (0) | 0 (0) |
| 932×430 | 3 (3) / 2 vs 3 (3) / 2 | 4 (4) | 5 (0) | 6 (6) | 3 (3) / 1 (1) | 5 (5) |
| 1024×768 | 16 (15) / 6 vs 15 (14) / 6 | 5 (5) | 6 (2) | 6 (6) | 6 (6) / 1 (1) | 6 (6) |
| 768×1024 | 16 (13) / 8 vs 16 (13) / 8 | 6 (6) | 6 (3) | 6 (6) | 6 (6) / 1 (1) | 6 (6) |

Round 5's trade (three tiles and More on 390×844, 360×640 and 667×375, where main's
strip showed four, four and three) is gone: see *Round 6*.

**Round 6** (the round-5 verifier, against main 5ab143d57):

- *Captions*: on 360×640 (31 of 53 states, en and zh) and on 390×844 in a kill burst
  with the network chip, the detection landed on the AUTO AIM and SCOPE captions,
  which hang 17 px under their buttons (`touchControls.ts` `.lb`); on 320×568 the
  dock's tiles sat on them in every state. Main never puts anything there. Each
  round button is now one control with its caption (`battleHudLayout.ts`: the band
  at least as wide as the button, so LOCKED or RELEASE FIRES moves nothing); the
  receipt overlap-checks every visible caption like any control.
- *Aim hint*: on 390×844 the dock's row hid 82% of "Swipe to aim · LANDSCAPE
  RECOMMENDED" (main 0%). The visible hint is a dock-only obstacle; the receipt fails
  any docked tile on it.
- *Controls on screen*: main's strip scrolled under a hidden scrollbar, showing 4
  tiles whole on 390×844 and 360×640, 3 on 667×375, 2 on 320×568 and 1 on 568×256 and
  568×320; round 5's dock showed 3, 3, 3, 1, 0 and 1. What stood between those phones
  and a block for every control: the tips of the scope's cross arms at full bloom
  (they reach 1.55 r + 3 px, 0.55 r past the ring), the 180 px gun-limit warning's
  place on 390×844, and the plan's order (the notices' clearance before the dock's
  controls). Now the dock's keep-out leaves the arms to the live yield (`drawScope`
  reports them; a tile under them dims, as under a lagging gun's ring), a portrait
  phone's warning is 140 px ("GUN TRAVEL LIMIT" still one line, en and zh), and the
  plan weighs the nearest dock of one, two and three rows and keeps the one showing
  the most controls before the notices' clearance. The receipt pins main's whole
  strip tiles per screen (`battle-hud-layout.main-feeds.json` `tiles`) and fails a
  state that shows fewer.
- *Notice ink*: where the dock's room was the notices' clear place (360×640, 320×568,
  568×320) the notices clear less than before, and on 390×844 in a burst with the
  chip the cheapest place clear of the battle sight put the detection on the scope's
  zoom plate (more ink than main's). Below clearance 3 a place now costs what it
  covers of the reticle, and a dock in the notices' lane is taken only where every
  other leaves the notices on the crosshair (568×256). The receipt reads the reticle's
  ink from its own canvas (both sights, at rest and at full bloom, magazine and
  SWITCHING) and fails any notice or countdown covering more of it, or of the
  resting crosshair, than main's box in the same state (main's boxes pinned per
  state).

Receipts: `touchActionDock.selftest.mjs` plans 1–7 controls on every touch case of
the browser receipt with and without an objective (the layout's own
`planTouchCentre` call, 154 placements), and checks the rule tile by tile (size,
screen, clearance, aim keep-out, order, More panel, a lane given up only when no
placement clears the lanes), a seeded sweep of 600 random screens, the footprint
against each readout placed independently from hud.ts's formulas (and those hud.ts
lines pinned), the gun-limit warning's distance from the crosshair, and the layout
owner on a scripted page (slots and the notices' and countdown's places written,
More opens and closes, a tap acts on the lift, a swipe from a tile reaches the aim
pad, a FIRE hold keeps the placement, FIRE presses never watched, no search when
nothing changed). `centreNotices.selftest.mjs` checks every plan's notices and
countdown (on screen, off every control, instrument, warning place and tile, the
clearance table above) and the solver's cases. `touchDockYield.selftest.mjs` checks
the sector geometry against brute force, the hysteresis, the More panel and the
wiring in hud.ts and the stylesheets. `touchActionDock.fixture.json` holds the
touch-control rects and the notices' and countdown's natural boxes: measured in
Chromium touch emulation for 360×640, 390×844, 844×390, 667×375 and 320×568 (the
boxes for all eleven); derived from the stylesheet rules for the other six sizes.
`tools/battle-hud-layout.browser.mjs` checks the same rule rendered, in every state
(round 5: with detection over the combined state, and the longest alerts in en and
zh) of every touch case with five, six and seven controls (the seventh from a real kit:
the M1A3 with the MBT-70's hydropneumatic gear shows a missile beside its special
action, so every HUD update keeps it), measures the notices and countdown against
the reticle's keep-outs in every state, taps every control with a touch (through
More where needed), swipes from a tile and checks it aims without acting, toggles
FIRE's press classes in its no-relayout check, records every glyph and stroke the
reticle canvas draws in the battle sight and the scope at rest and at full bloom to
check none lies under a tile and all lie inside the footprint, puts the gun mark on
every tile (battle sight and scope at full bloom, a turretless sight, a panel tile
behind an open More) and stages an incoming penetration from eight bearings (one
with CRIT), reading the reticle canvas's own pixels under each tile: every tile with
ink under it must be dimmed and the canvas must stack above the dock. In every touch
state it compares the feeds with main's (`tools/fixtures/battle-hud-layout.main-feeds.json`,
main 5ab143d57 with five controls: kill rows, kill rows clear of the full-bloom ring,
incoming toasts, the detection's second line) and fails an alert whose text is cut
(scroll size past its box, any line clamp) or set under 8 px; `--record-main=<file>
--main-label=<commit>` against a server of main's tree records those numbers again.
Re-measure the fixture when a touch control moves (and main's feed lanes,
`mainFeeds`, pinned there from main 5ab143d57).

## Font delivery — 2026-10-01

The game uses `font-display: swap`: a slow self-hosted font must replace the
readable fallback after arrival. `optional` can leave a cold visit permanently
in the fallback and must not be restored as a loading optimization. The inline
`cot-font-faces` style owns first-paint declarations; `ensureFonts()` reuses it
and warms only Medium and Bold once. Regular remains demand-loaded. The battle
menu and compact Garage controls use the current Monument Grotesk stack.
Canvas signs and vehicle markings wait for their specific face before repaint
and texture upload, rather than the document-wide font-ready promise.

Run `node src/ui/fonts.selftest.mjs`, `node src/ui/loadingScreens.selftest.mjs`
and `nice -n 19 node tools/fonts.browser.mjs`. The browser tool owns its capture
lease and server. It serves the real entry HTML with simulation boot stubbed,
uses production typography and sign painting, and checks Chrome's actual
painted font through its inspection protocol. Desktop (1440×900) and phone
landscape (568×320) pass delayed delivery, exactly two initial font requests,
no additional requests on a cacheable warm reload, and correct canvas repaint.
Failed downloads retain readable text and recover on the next successful visit.
Cache headers in this fault-injection fixture model a cacheable font response;
these results are not a deployed-network timing or complete WebGL boot claim.
Evidence: `.qa-dev/fonts/report.json` and adjacent before/after screenshots.
Type checking, scoped code-quality checks and the public build pass.

## Spectator cursor ownership

Destruction in a continuing match preserves mouse capture through the death
beat and spectator handoff. The spectator card shows “Press Esc to release
cursor” only while captured. Esc releases the cursor without opening Settings;
a battlefield click captures it again. Final results and returning to Garage
still release it. The hint stays hidden for ordinary touch-only use.

`tools/spectator-cursor.browser.mjs` verifies the real death transition,
keyboard target cycling, cursor release, canvas recapture, clickable spectator
buttons after release, and hint bounds at 568×320. CDP-delivered Escape does
not exercise Chrome's privileged native Escape default; the test follows it
with the browser release API. Evidence is in
`.qa-dev/spectator-cursor/report.json` and adjacent screenshots. Phase policy,
result presentation, Settings access, pointer recovery, observer input,
localization, type checking, and the production build also pass.

## Running gear and ground markers

`tools/running-gear-damage.browser.mjs` enters a real Zone Control battle and
captures intact, falling, settled and left-behind running gear. It checks
world-space persistence after moving the tank, triangle-surface clearance,
repair cleanup and every capture-ring/disc vertex against the live terrain.
The probe owns the shared capture queue and writes evidence beneath
`.qa-dev/running-gear-damage/`. Objective rings and discs have independent
surface-fitted geometry; capture progress reuses that fit.

## Integration verification — 2026-10-02

The combined battle changes were integrated with `origin/main` at
`24c5c5b03`. The regenerated manual describes 217 vehicles, 33 battlefields
and seven modes. The camouflage catalog includes the four national paint
recipes needed by the twelve modernization variants. Public and private
builds and type checking passed; the public build was repeated after the
reference/catalog refresh.

The merged fleet passed anatomy and marking-seat generation/checks, technical
diagram validation, and 1,956 module plus 434 track-side hit probes. The full
smoke audit covered all 207 smoke-equipped models: 414 decorated HIGH/LOW
builds and 22,398 launches from actual tube mouths across yaw and tilt.
The notification matrix passed 889 checks across 22 viewport/locale cases.
These results supplement the mobile, bot, font, spectator and running-gear
receipts above; they do not claim physical-device coverage.

The broader suite is not a green baseline. Existing source-geometry,
archival-reference and balance failures remain visible. Fresh comparisons
against the unmodified main snapshot reproduced the TOS donor fingerprint,
T-90 equipment/source-gun expectations, T-62 marking-count expectation and
Challenger 3X/T-62 fire-control outliers. Missing local source GLBs and existing
geometry score failures also prevent claiming a clean source-reference
release gate. No geometry threshold or historical anchor hash was lowered to
make these failures pass.

Local integration evidence is retained in `.qa-dev/integration-tests-final.json`
and `.qa-dev/integration-supplemental-results.json`; the latter records focused
reruns after generated-catalog and test-contract repairs. The physical map
checks preserve exact collision records while resolving runtime destruction
indices to their authored owners. They additionally verify that every clutter
binding addresses the original position/normal bytes or instance transform,
so material batching and waterworks donor replacement cannot conceal a bad
destruction target.

## AC-130 fire-control rack

`node tools/gunship-hud.browser.mjs` renders the production HUD and touch
controls with the actual gunship loadout. It covers 1280×800 and 800×600 desktop,
568×320 and 480×270 landscape, 320×568 and 390×844 portrait, and Chinese landscape.
The matrix checks all three weapon selections, independent reload progress,
sensor cycling, ready/cooling supply commands, keyboard activation, flight exit,
minimum touch targets, and clearance from the scope, objective, minimap and
mobile controls. Desktop cases also enlarge the minimap. Screenshots and the
measurement report are written to `.qa-dev/gunship-hud/`.

The gunship uses an open rack with six angled controls. Ammunition channels keep
independent reload bars; the central sight follows the selected weapon, with
magnification and target distance beside it. The header reads the actual escort
and rescue counts. The shared HUD layout owns minimap clearance. Short landscape
omits the repeated designation/sight label, while portrait raises the rack above
fire and zoom. Drone instruments keep their existing layout.


## HUD editor and minimal display

Settings → Gameplay → Interface → **Edit HUD layout** opens a still battlefield
with draggable HUD panels. It uses a UI-free game capture rather than another
running scene. The editor prepares an isolated, static instance of the production
HUD at the selected viewport size, then preserves its actual frames, canvases and
responsive positions. It does not instantiate a renderer or a second simulation.
The 1920×1080 Verdant Fields capture replaces the low-resolution reel thumbnail.
The inspector uses the shared game icons and can select hidden elements and
restore them. Selecting aircraft, awards, incoming damage or battle alerts prepares
that real component in its relevant battle state. Other absent panels are listed
with an explanation;
their visibility remains editable without inventing placeholder boxes.
Drag, arrow keys (Shift for larger steps), or the directional buttons position
panels. Zoom preview helps on small screens. Save applies the layout; Cancel
discards it. Reset layout restores the selected profile's responsive defaults.

Desktop, phone portrait, and phone landscape have independent saved layouts.
Positions remain within the viewport after resizing. Tank labels and floating
damage numbers can be hidden, but stay attached to their world targets. The
reticle stays attached to the real aiming point.

**Minimal battle HUD** replaces the former hide-all setting, preserving existing
preferences. It retains the actual aiming canvas, ammunition/reload, distance,
zoom, and scope vision switching. Mobile driving and firing controls remain
available. F10 toggles it; Esc opens Settings; a three-finger tap restores the
full HUD on touch screens. Aircraft retain sight, weapons and return controls.

`node src/ui/hudPreferences.selftest.mjs` checks profile selection, persistence,
invalid data, storage failure and full-panel viewport bounds.
`node tools/hud-editor.browser.mjs` checks the actual Settings entry point,
production-default position parity, dragging, keyboard movement, hiding/restoring,
saving, canceling, reset, reload persistence, profile changes, Escape ownership
and minimal HUD visibility. Run it through `tools/capture-command.mjs` at nice 19
to respect the shared browser capture queue. The DOM-only matrix
uses production HUD components at 1440×900, 390×844, 667×375 and 568×256. It does
not claim native-device touch or rendered ballistic-scene validation.


## Service Record and battle debrief

Garage → Service Record uses the shared modal, with keyboard tabs for Overview,
Medals, Achievements and History. Medals have larger ribbons, engraved symbols,
laurels and recognizable tier finishes. Hover, keyboard focus or tap reveals
the actual award requirements. Tooltips sit above scrolling content, stay in
the viewport and dismiss before the modal on Escape. Locked awards remain
inspectable. First-earned dates and counts come from the saved record.

Victory, defeat and draw use a common after-action report: personal damage,
kills and accuracy, followed by named awards and the best shot. Expand combat
details for penetration, blocked/received damage, deaths and the kill ledger.
The Battle Outcome tab includes every team member. Garage/Battle Again remain
accessible while report content scrolls. Multiplayer readiness lives inside
the report, so short screens can reach both readiness and the footer.

`node tools/service-record.browser.mjs` runs the production Garage entry and
four record tabs at desktop, 390×844, 320×568, 667×375, 568×256 and Chinese
landscape. `node tools/end-screen-presentation.browser.mjs` runs victory,
defeat, draw, empty awards and multiplayer readiness, with 21-member teams.
Both tools are DOM-only regressions: they verify layout, interaction and
keyboard focus without claiming rendered battle or native mobile performance.

## Objective and award banner spacing

Objective event notices and earned-medal cards use six-sided outlines. Cards
start at least 16 CSS pixels below the measured scoreboard/objective bottom,
then clear visible detection and combat notices by 12 pixels. Their entrance
fades in place so it cannot cross that gap. The layout observes content and
viewport changes instead of doing work in the render loop.

When a short phone has no clear lane above its controls, an award stays queued.
Its display timer runs only while it is visible; resizing or a notice clearing
retries placement. Combat objective alerts remain visible in their own lane.

Run `node tools/objective-banner.browser.mjs` (with the same optional
`--playwright-module` argument) for desktop, portrait, 480×270 and 568×256
landscape, Chinese text, four objective states, rotation, and deferred awards.
It starts and closes its own Vite server and writes receipts under `.qa-dev/`.
The shared HUD burst fixture alternates attackers to exercise eight separate
notifications; consecutive hits by one attacker intentionally combine.

## Stable penetration readout

The default mouse HUD seats the ballistic-analysis card 12 CSS pixels above
its bottom-right minimap, aligned to the map's right edge. Its height budget
comes from viewport, controls and roster density, never the number of kill
notifications. The newest card rests at the dock's bottom; kill arrivals,
expiry and Tab expansion cannot recenter it. Notifications fit the remaining
space above it. Enlarging the map moves the dock together with the map.
Drone and AC-130 consoles reserve clearance when they extend into this column;
on those layouts the report sits above whichever control is higher.

Short displays use the compact header and contained tank diagrams; surplus
detail rows yield before the images are clipped. Narrow mouse layouts with a
top-left map keep the report above their bottom controls in the opposite
column. Touch retains its existing impact feedback rather than opening the
desktop analysis card. Explicit HUD-editor positions still take precedence.

`node tools/penetration-dock.browser.mjs` runs the production HUD across mouse,
touch, short landscape, Chinese text, 1/7/14/21/41-per-side rosters, all three
map sizes and multiplayer connection states. It compares actual report bounds
before/after kill bursts, Tab and the real notification expiry timers, with a
detection notice also active. Drone and AC-130 weapon/support controls also
receive overlap checks on mouse layouts. The regular HUD matrix additionally checks
countdown, sniper, spectator, settings, log, resized and expanded-map states.

## Vehicle condition boxes

The closed-eye concealment chip is now part of the damage panel's condition
strip. At most four boxes are visible (including overflow); narrow touch
panels use two or three 44px targets. Fire and disabled tracks take priority,
then disabled modules and wounded crew, followed by damaged modules and
concealment. A `+N` box exposes the remaining conditions by hover, keyboard
focus or tap. The strip never grows into another row.

A red module's translucent bottom-up fill reads its simulation `repairT`
against the shared `REPAIR_S` target. Equipment speeds are already reflected
in that accumulator. A combined track box follows the slower disabled track.
Automatic recovery turns the icon amber and removes the progress fill; full
repair removes the box. Realistic mode has no automatic repair fill. The
current multiplayer snapshot carries module states without repair timers,
so its boxes deliberately omit progress instead of presenting a false 0%.

The strip follows its damage panel through HUD editing and clears for death,
aerial control and leaving battle. The shared layout reserves space above it
for feeds and moves it above intersecting driving/system controls. Stable
frames do not rewrite its DOM. `vehicleStatusPolicy.selftest.mjs` covers the
state policy and real repair accumulation; `tools/vehicle-status.browser.mjs`
covers repair changes, overflow, tooltip access, viewport clearance, lifecycle,
Chinese labels and unchanged-frame mutations across desktop and small phones.

HUD editor refresh (2026-10-06): typecheck, production build, preference, localization,
layout, settings, stylesheet ownership and damage-panel marker checks passed. The
updated browser matrix could not start before its shared capture-queue timeout;
no new rendered/editor matrix pass is claimed.

## Combat reports and Service Record

Live rosters show a nonzero kill tally on their inner edge, mirrored for the
opposing team and retained in icon-grid mode. The event ledger counts enemy
destructions once per life; respawns preserve accumulated kills, while a new
battle clears them. Friendly fire and self-destruction remain visible in the
feed but do not earn enemy-kill credit. Feed glyphs identify projectile kills,
drone strikes, ramming, fire, collisions, falls, player involvement and friendly
fire. Ammo-rack kills carry an explicit label, a highlighted ammunition glyph,
and a matching killcam heading and detonation banner.

After-action reports use the battle's canonical map image, contained vehicle
art, visible combat metrics, and allied/enemy comparisons for damage, kills and
survivors. Medals keep their focus/touch tooltips. The Service Record's Battle
Log uses map-backed deployment cards, vehicle art and expandable kill traces;
older records without a recognized map retain a plain readable background.
Accuracy counts distinct fired rounds that connected, not damage events. Splash
contacts cannot push it beyond 100%; un-fired drone impacts, fire and ramming
cannot manufacture successful rounds. Damage still sums all resolved contacts.

Focused event, classification, report and record checks run in `npm test`.
The additional browser regression uses the real production components at
1440×900, 390×844, 667×375 and 568×256 and captures victory, defeat, draw,
Battle Log and medals. Run it through the shared capture queue:

```sh
node --input-type=module -e "import {runCapturedCommand} from './tools/capture-command.mjs'; await runCapturedCommand('nice',['-n','19','node','tools/battle-reports.browser.mjs']);"
```

Pass `--playwright-module=/absolute/path/to/playwright/index.mjs` to the browser
tool when using an external runtime. Captures go to `.qa-dev/battle-reports/`.
A queue timeout is not a visual pass: the latest implementation has passed
focused Node checks, type checking and the public build, but its first browser
attempt timed out before acquiring the shared capture lease.


### Compact Service Record statistics and medal layouts

Win rate is a normal outcome statistic beside victories, defeats and draws,
with a slightly larger value. The heading uses the shared amber accent without
the commander-profile eyebrow. Career, reasoning, deployment and Battle Log
statistics use semantic vector glyphs from the shared icon library.

Overview medal columns follow the width of their card, not just the viewport.
Artwork stays contained above wrapping labels; new-award badges reserve their
own space. Phone outcomes and career metrics use two columns, and short
landscape headers leave room for scrolling content and full-size controls.

`tools/service-record-layout.browser.mjs` exercises empty and populated records
across all four tabs at 1440×900, 320×568, 390×844, 667×375 and 568×256, plus
Chinese at 390×844. It checks artwork/text/badge separation, horizontal overflow,
stat icons, header/footer reachability, touch requirements and rotation. Run it
through `tools/capture-command.mjs` at nice 19, as above; optional external
Playwright module argument is supported. Screenshots and geometric receipts go
to `.qa-dev/service-record-layout/`. A queued run is not a visual pass.

Validation: record, localization and stylesheet selftests, TypeScript, the
changed-module quality gate and the production build passed. The first layout
run timed out after ten minutes waiting for the shared capture lease; no
mobile screenshot or geometry pass is claimed for this refresh yet.

## Weapon-specific impact readouts

Machine-gun impacts (calibres below 20 mm) use a compact sequential burst summary
with hits, penetrations, blocks, and accumulated damage. A target or weapon change,
a main-gun impact, or a pause over 1.2 seconds starts a new burst. This feedback
never replaces the cannon/missile card and never pushes entries out of its six-shot
history. Up to three MG burst summaries are retained separately. Raw resolved hits
still feed complete damage and battle statistics. Primary IFV autocannons remain
normal cannon readouts.

Guided-hit identity travels with the shared simulation event, including multiplayer.
Missiles have an impact heading, range, and separate blast totals. Splash-only
contacts omit misleading plate-angle/armor/penetration rows. Splash from the same
missile updates its blast summary without replacing a direct-hit card. Secondary
summaries consume part of the existing diagram height budget, preserving the dock
above the minimap. Touch retains its existing compact impact feedback.

Steel Wall excludes machine-gun hits; its localized requirement now says so.
`serviceRecord.selftest.mjs`, `shotReadoutPolicy.selftest.mjs`, and the combat suite
cover weapon identity, MG exclusion, adjacent burst grouping, bounded blast receipts,
and direct-hit priority. `tools/weapon-readout.browser.mjs` exercises the production
HUD and diagram containment; run it under the shared capture lease.

October 7 verification: focused medal/readout/layout/locale tests, 543 combat
assertions, authoritative-match tests, type checking, and the production build
passed. The rendered weapon-readout test timed out waiting for the shared browser
lease; its desktop/mobile visual checks are still unverified.
