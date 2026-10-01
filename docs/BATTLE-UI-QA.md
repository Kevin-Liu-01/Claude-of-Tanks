# Battle UI layout regression

The battle HUD now assigns bounded left/right lanes between the visible team
rosters (or touch minimap) and the bottom controls. Incoming alerts occupy
the left lane; outgoing reports and the combat log share the right lane.
The lanes update through ResizeObserver and viewport/panel events, not the
render loop. Resizing a window or enlarging the minimap recalculates an already
open report. Reports scroll within their lane; alert density reduces when
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
  and one correct action per click, including horizontally scrolled controls.
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

Zone Control and Gravity award 25 points per confirmed enemy destruction, once
per vehicle life. Friendly fire, self-destruction and duplicate receipts do not
score. The shared mode tests cover both solo and network team names; the authority
regression verifies a real shell kill reaches the score in the snapshot.

### Expanded rosters and contained shot diagrams

Hold Tab during battle to widen both team lists and use spare vertical room;
release Tab or switch away from the window to collapse them. Settings, modals
and text entry keep normal keyboard navigation. Up to fourteen entries remain
rows; fifteen or more use the icon grid. Row height adapts without scrolling,
with the vehicle subtitle omitted only where a short row cannot fit it.

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
IDs. The feeds share a 240 px maximum width and 26 px rows. Left feeds touch
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
