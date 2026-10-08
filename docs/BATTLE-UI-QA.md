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
