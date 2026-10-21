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

### Out of ammo and unlimited rounds

A weapon with no round left shows no reload sweep, countdown or ready pulse. Its
ring turns to sparse, muted danger dashes. A single-shot gun shows one struck
round. When the ring would cross that round or an empty rack, or come within
3 px of its strike, the mark drops below the ring (`sightMarkTop`). The test
covers the ring's whole circle wherever it sits, including the gun's own ring
when a lagging lay carries it off the screen's centre. A canvas aim warning
moves below the mark, its chip 3 px clear of every mark and of the ring. A live rack (full, short of stowage, unlimited, or
reloading) keeps its shells' dark contours 3 px from the ring's stroke and halo
where it sits, or drops below the ring the same way (`ringGap`). The reload
countdown sits 3 px under the rack's contours, or under the marker, and drops
below the ring when the ring's stroke would come within 3 px of its digits. On
the scope it also drops under the range tag when the tag hangs on its row less
than 16 px beside it, so the two never read as one line. The canvas aim warning
starts under the countdown and the range tag. The scope readout line starts 3 px
under everything above it: the rack or struck round, the countdown, the warning
chip and the range tag where it hangs over the line. The line and the zoom plate
keep 3 px from the ring's stroke, or drop below the ring
(`sniperReadoutStack`). Where the line's resting place would put it any higher,
whatever sits above it wins. Every part of the row and the warning chip also
keeps 3 px from the HUD's panels and controls. The layout measures them on every
relayout and hands them to the reticle (`src/ui/sightFurniture.ts`): the
controls row and the tray, a stacked tray's speedometer and damage panel, a
landscape phone's consumables column and systems row, a portrait phone's FIRE
buttons, the score, the map and the vision switch. Round r9 modelled some of
these as constant floors in `hud.ts`, and missed the consumables at 667x375 and
the left FIRE button at 360x640. A pass can land while a panel fades or slides,
for example the touch tray's two collapsed shell slots fading out behind the
selected one. The end of a furniture's own opacity, visibility or transform
transition measures it again. Before r10e, those two slots stayed published as
furniture until some later relayout, and a recording caught them at 8 touch
sizes. The line rests no lower than that furniture
lets it. Where the row would still reach a panel, the zoom plate moves up beside
the line, then the warning chip joins that row left of the line, then the chip
moves above the ring. Then the line and the zoom plate move right of the column
under the marker, 16 px apart, then the row goes above the ring. Last, the zoom
plate is left out (the view itself shows the zoom). Where nothing keeps clear,
the row takes the place that reaches least far into the furniture. A rack or
struck round that would reach a panel goes over the ring instead. A countdown
that would reach one moves beside the rack, or over the sight. A range tag that
would reach one hangs at the ring's 1:30, and a chip or row set over the sight
keeps 3 px over the tag there. On a screen over 430 px tall a rack's
countdown also moves beside the rack. On a portrait phone the reticle seats the
touch warning chip under the sight, where a mouse layout paints its canvas chip,
and the scope's readouts start under it. At 50% + 48 px it met the countdown and
a rack dropped below a wide ring. Where its seat under the sight meets the
furniture, it first rises to just under the ring and the marks there, before
it goes over the sight. The chip yields to the sixth-sense notice: the layout
publishes the notice's settled box on a touch layout, and where the chip's place
runs into it, the chip waits hidden until the notice goes. The notice never
moves the chip or any other mark. Moving it ran the chip into the furniture
instead: 22 px into the left FIRE button at 320x568 and 16 m. Round r10 set the
chip over the sight at 320x568, under the DETECTED notice. A short landscape
keeps it in the left lane under the map, and so does a portrait phone 340 px
wide or less (r10g, the coordinator's call), at the map's width so it keeps
8 px from the systems row. There every seat by the sight ran
into the left FIRE button, the map or the speedometer, 12.22 px at worst. The
struck round or rack still shows the empty gun by the sight. The left lane
starts under the parked chip, and the notices' footprint leaves out its seat. On the short landscape
scope stack the round leads the ammo readout line instead, and a rack's countdown
sits beside the rack when the ring keeps clear of it there. The scope's vision switch sits beside the
sight, level with the marker and past the widest ring, where no readout goes. A
mouse layout seats it right of the sight, also past the range tag beside a small
ring. A mouse window under 540 px wide uses the compact plate there. A shot
report or the open combat log in the right lane covers that seat on a mouse
window under about 1200 px wide. The switch then takes the mirror seat left of
the sight, or waits hidden while the left lane has no room either; the I key
still switches the view (`seatScopeVision`). Touch seats
it left of the sight, clear of the ammo and consumables column and FIRE. A
rack shows spent slots for rounds stowage cannot load, and an empty rack is
struck through. The range tag starts past the rack and its strike. Between two
rounds of a clip or a salvo rack, the round being chambered fills as the group
cycles. That is the last ready slot, so the slot of the round just fired never
fills. No countdown shows under the rack.
Spent launcher and magazine-reload controls are struck and disabled. Their count
is spoken, not printed. Every empty tray slot is struck on a danger edge with
its 0 in the danger ink, on desktop as on the phone. The phone's collapsed empty
slot also loses its amber frame. A dry gun dims both phone FIRE buttons. In
every tray slot the count, the type label, the key and the shell icon keep 3 px
of ink from each other. On the desktop tray (64 px slots, 1000 px wide and up)
the shell icon is raised 3 px clear of the type label, and the label and the
count share the bottom row. Every mouse tray under 1000 px wide stacks
(`data-hud-tray='stacked'`: 48x52 slots, 44x52 below 768 px). Its bottom row
cannot hold a label and a count, so the count takes the top-right corner beside
a smaller key, and the shell stands on the label's floor, small enough that the
HE drum's top keeps clear of both corners. On touch the shell stands on the
label's floor too, so every slot height keeps the gap, and the shorter slots
draw it smaller. The 44 px wide slots step it left of the corner count (by 1 px
on the stacked mouse tray, 3 px on a landscape phone under 300 px tall). The
reload shade dims a slot's picture, never its marks: the key, the count and the
type label stand over it, so a reloading count stays white in the corner as the
`∞` does. A count of three digits or more tightens its slot's type label
and count, and the shell icon gives way to it: on desktop the icon rises; on
touch and on the stacked mouse tray it shrinks and steps left, out from under
the corner count. Under unlimited rounds nothing reads empty:
not the ring, the rack, the tray, the magazine control or the loader audio. The
ammo `∞` takes the numeral's size. Unlimited rounds are read per vehicle
(`rulesetUnlimitedFor`). In the AC-130 only the gunship refills, so an escort
shows its real empty states. On a portrait phone a systems row that crosses the
sight (`portraitSightClearTop`) moves below the scope readouts when there is
room, otherwise above the ring. The sight's band covers the countdown, the rack,
the struck round and the aim warning. On a portrait phone under 720 px tall the
row takes the top slot instead: right of the map, 4 px under the touch chrome, in
a compact form (icons over labels, no key badges, the slot's width shared:
`body[data-systems-slot='top']`). Each button keeps the 44 px touch target. What
one row cannot hold sits beside the touch chrome, left of it and level with it,
where that leaves a 44 px place (`data-slot-beside`). The five-control kit at
320 wide puts its fifth button there: as a second row it met the ammo drawer's
open shells. A wider overflow wraps to balanced rows. A 44 px row 8 px under the
chrome left the scope's notices no clear band under it at 360x640, so the slot
sits 4 px under the chrome. Round r10e's critic found the row clipped at
320 wide ("Auto g"), the scope's readouts on its labels and the rack and struck
round on the left FIRE button at 320x568, and the gun travel chip on its key
badges at 360x640. Over the ring, the marks set there (the readout row, the chip,
a rack) reach past the band the row kept clear.

Round r5 described the tray as having no touching marks, with the desktop shell
raised 3 px. Both were true only at 1000 px and up. Under 1000 px the stacked
tray's own canvas rule replaced the raise with a centred, scaled shell, and the
`∞` and the empty 0 printed over the type label (APFSDS|∞ by 12 px, ATGM|∞ by
2 px and APFSDS|0 by 5.6 px at 900 px). The r5 capture had no stacked case, so
it never measured them. The capture now covers those trays at 900 px and 640 px.

Round r8 put the switch under the sight, at 50% + 145 px. It ran under the tray
slots, the consumables and the controls row on short mouse windows (700x460,
800x500, 1280x480). With the gun travel warning, the readouts and the chip landed
on it at 520 to 600 px tall (13.8 px at 700x580), and a wide ring's stack landed
on it on taller windows too. The r8 receipt modelled the controls row 112 px over
the floor, but it starts 120 px up. The receipt skipped the 431 to 450 px windows
with the warning, and its rings (1, 11, 16, 24 and 40 m) missed 26 to 31 m, where
the rack or struck round drops below the ring. There the readouts ran as much as
6.5 px into the row. The receipt now models the row where it is and sweeps those
rings, and the capture adds the warning, the widest ring and those windows.

Round r7 said the scope readout line and the canvas aim warning start under the
countdown. That held only on screens over about 525 px tall. From 431 to about
525 px the line's resting place (`h - 176`) won over the countdown, and the line
was drawn on it: as much as 29.5 px over it at 800x500, 37.5 px at 900x480 and
45.4 px at 700x460. A single gun's `24` also sat 5.5 px into its `3.2`. The same
cap put the line on the rack, the struck round and the ring itself. Moving the
rack and countdown below the ring in r7 roughly tripled the overlap. The warning
chip, starting under the countdown too, overlapped the readout line, and a small
ring's countdown sat 4 px from the range tag, so the touch scope read
`3.2 s200 m`. Neither the receipt nor the capture had a mouse window in that
band. In r7 the stacked and touch trays' corner count also sat under the reload
shade, about 2:1 on its panel (`rgb(67,70,74)` on `rgb(11,10,10)`), while the
`∞` beside it stayed white.

`src/ui/hudAmmoOut.selftest.mjs` covers the derivations and the tray rules, and
`src/ui/hudAmmoOutPaint.selftest.mjs` covers the live paint, the scope stack's
geometry and the ring, rack and countdown gaps, all in `npm test`. Its scope
sweep runs every reticle state, with and without the gun travel warning, over
rings of 11 px up to the ceiling, on the short mouse windows (stacked and wide,
431 to 600 px tall, and taller, with the rings that drop the marks below the
ring on the short wide ones), narrow mouse windows, a phone, landscape phones and
small touch screens. Every mark under the marker, and a ring centred on it, keeps
3 px from the vision switch where the sheet seats it. Every mark of the sight,
the touch warning chip the reticle seats included, keeps 3 px from the
furniture the layout publishes, recorded on the fixture for every swept size
(`tools/fixtures/hud-sight-furniture.json`, by
`tools/hud-sight-furniture.browser.mjs`); a portrait phone's chip is swept
unscoped too. The frame a reload ends on always repaints, even with the wall
clock far ahead (round r9b: the paint cache reused the last cycling frame there,
and the chambered round stayed part-filled). For the rendered frames
(it takes the capture lease), run the command below. It covers a 1440 px
desktop, the stacked mouse trays at 900 px and 640 px, six short mouse windows
(800x500, 900x480, 700x460, 1280x480, 800x560 and 1280x440), a 480 px wide mouse
window, a portrait phone, a 360x640 phone, four landscape phones (844x390,
932x430, 667x375 and 740x360), and the tray states on the two 44 px tall touch
slots (320x568 and 568x290). The mouse windows, the phones and the landscape
phones add the gun travel warning and the widest ring to the scope's states;
the desktop, both stacked trays, 800x500, the 390x844 phone and the 844x390 and
667x375 landscape phones add unlimited rounds through the scope, and those four
mouse windows a shot report and the open combat log over the right lane. It checks pixels,
recorded canvas geometry and the tray's computed styles: every mark under the
marker keeps 3 px from the ring's stroke, every text there keeps 3 px from the
rack, and every mark of the sight, the warning chip and the zoom plate's rules
included, keeps 3 px from every control (the speedometer and the minimap among
them) and from the scope's vision switch. The marks over the ring count too. On
a portrait phone the seated warning chip keeps 3 px from every control. The
switch keeps 3 px from every HUD panel and control, a shot report and the open
log included, and stays on the screen; it waits hidden only while one of those
covers its seat. It then reads each saved frame (`tools/hud-ammo-frame-ink.mjs`):
every mark the DOM says a visible slot shows must be in the frame's pixels. That
covers its count, type label and empty strike, the touch chevron and an opaque
top edge, and a white count must read at full brightness, not under the reload
shade. Each visible slot's DOM read must name its count and label, the mouse
tray's key, an empty slot's strike and the phone's chevron, and an empty slot's
count must be the danger 0. A missing one is a failure, not a skipped check; the
receipt breaks each of these on a mouse tray and on a touch tray. With a camera
on the frame, the paint receipt also turns the gun off the camera's aim, so the
ring sits left, right, above and below the marker; every gap holds there too.
One older placement remains: the range tag hangs off the screen centre's 4:30,
not the gun ring's, so a far-displaced ring can cross it. A few small windows
leave no place where every mark keeps 3 px from the furniture under the widest
rings. There each mark takes the place that reaches least far into it. The paint
receipt pins how far that is (`TIGHT_FLOOR`), measured in its model and on the
rendered fixture. Every mode but the standard battle shows its objective panel.
The layout records that stage apart, and the receipt sweeps it with live and
empty racks, finite and endless rounds:

- 568x290: 3.34 px into the score in a standard battle (a rack set over a 43 px
  ring). With the objective panel it is 22.75 px. The panel sits over the sight
  and the systems row under it, so the rack has no room above or below the
  ring; only the space right of the ring is free.
- 320x568 with the objective panel: 10.59 px, the readout row set over the ring
  on the systems row's top slot under the panel. Its standard battle keeps 3 px
  since r10g parks the gun travel chip under the map. Seated by the sight, the
  chip ran 12.22 px into the left FIRE button. Round r10e had 25.25 px on both
  stages, with the readout row on the systems row's labels and a rack on the FIRE
  button.
- 360x640 and 375x667 keep 3 px since the systems row's top slot (r10g; they
  were 8.87 px, the chip on the row's key badges and underline, and 7.34 px).
- 740x360 and 640x360 with the objective panel: 0.37 px, an empty rack under the
  widest ring on the systems row.
- 1024x400 with the objective panel: 7.62 px, the warning chip set over the
  widest ring into the panel. The rendered fixture keeps 3 px.

The capture reports these windows' gaps as notes (its case's `tight` floor),
not failures. Every other swept window keeps 3 px in a standard battle and in
every mode, the listed capture sizes among them. Round r9 left 568x290 25.5 px
into its systems row and 1024x400 4.5 px into its controls row. It put the
portrait chip on the countdown and a dropped rack, and the 667x375 zoom plate
12 px into the consumables. Before r9 the compact stack under 431 px tall had no
floor at all, and ran as much as 34 px into a wide tray's row.

The reticle never dodges the shot report, the open combat log or the centre
notices, which come and go. On a mouse window 480 to about 640 px wide, the
right lane's report and the open log reach over the sight, the ring's right
side included, in battle as in the scope. That is the right lane's own dock,
older than this item.
Nothing touches the page between the DOM read and the frame. The ink gaps
between count, label, key and icon are measured after the frame, from
full-viewport shots. The tool takes no clipped screenshot. Its flow lives in
`tools/hud-ammo-capture.mjs`. `tools/hud-ammo-frame-ink.selftest.mjs` runs that
flow against a recording browser over a fake DOM, so it reads the calls as
made: a clip passed in any form, a filtered findings list or a DOM read without
a label fails it. Its fake DOM gives each text a CSS box larger than its ink, so
a descriptor read off the CSS box fails too, and its PNG rows cover every filter
on RGB and RGBA frames, with the Average filter's odd sums. In round r4b the gaps were measured with clipped shots taken
before each frame. Replayed on the same tree, that flow saved 18 of 56 frames
without the marks painted over a slot's shell icon (count, label, key, strike,
chevron and reload shade), while hit-testing and computed styles still showed
them. Run:

```sh
node tools/hud-ammo-states.browser.mjs --url=http://127.0.0.1:5189 --out=/absolute/new-evidence-directory
```

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

### Touch centre notices (r10e)

A touch layout places its centre notices against the reticle and the measured
furniture (`src/ui/touchNoticePlan.ts`, called by the layout on each relayout).
These are the detection, the alert, the pre-battle countdown and the medal
card. Integ stacked the detection and the alert centred under the systems row.
On every phone but the tallest, that put them on the aim point, the ring, the
struck round and rack, the scope's circle, readouts and vision plate. The alert
also sat on the countdown's digit, and the medal card on the scope's readout
row. The notices session's critic found this on integ ce8b634668.

The plan keeps 4 px from the reticle's footprint and 6 px from the panels,
controls and feeds. The footprint is what the reticle can draw at full bloom,
so nothing moves as the ring breathes:

- the ring at 15 % of the shorter side;
- in battle, the column under it and over it (rack, struck round, countdown,
  seated chip);
- through the scope, the circle at 1.55 r + 3, the readout row and zoom plate
  over and under it, and the range tag.

The countdown goes first, in the detection's place, scaled down to 60 % where
it must. The detection and the alert then take integ's place where that keeps
clear. Otherwise they take the highest free place, as a stack, then apart, then
compact (the 136 px notice, the alert in 8 px type). The medal card takes the
highest free place off all of them, or waits with its time kept. A phone's aim
hint sets its "LANDSCAPE RECOMMENDED" advice on its own right-aligned line. On
one line it ran under the speedometer and the left FIRE button at 360x640.

Where no place keeps clear, each notice takes the least intrusive place.
`body[data-touch-notices~='uncleared']` marks this. The notice reaches into the
footprint before it covers any panel or control. This happens on the 568 px
landscapes (568x256, 568x290, 568x320) and in the scope at 640x360 at rest.

`src/ui/touchNoticePlan.selftest.mjs` plans every recorded touch size and stage.
`tools/hud-touch-notices.browser.mjs` stages the critic's scenes at 15 touch
sizes and measures each notice against the reticle's recorded ink, the seated
chip, the vision plate and the hint, with no screenshot. It notes the uncleared
windows rather than failing them.

Round r10g's top slot for the systems row took the place the notices used at
360x640 and 375x667 in the scope. The footprint then left them no clear place
there: its seated chip sat over the circle plus 30 px, 20 px over the stack
hud.ts really sets. The reticle sets the readout row 3 px over the ring and the
chip 3 px over or under it, so the footprint now keeps the ring's halo plus
3 + 24 + 3 + 20 px for a seated chip. Both sizes clear in the scope again: the
detection, compact, above the map and the alert under the systems row. With the
fallback, the alert had sat on the AUTO AIM and SCOPE labels at 375x667. Those
labels hang under the round buttons, outside the buttons' boxes, so the plan
keeps clear of them too. Where nothing clears, a notice covers a label before the
sight's footprint (`labels`, a quarter of the footprint's cost per px²). Where
nothing clears, every block now counts out to its 6 px gap, so a fallback place
no longer sits 0 px from the systems row or the quick buttons. The detection and
the alert are also placed in whichever order reaches least far in all, and a
notice already placed costs a hundred times a panel, so the two never stack
while any other place remains. Only the overlap costs that much; the margin
around a placed notice costs a panel's 10. A place over a block costs three times
one in its gap. At 568x256 the two notices fit side by side only by touching
each other, the chip and the consumables. Gap-wide costs at full weight had set
the detection 10 px onto a consumable.

The touch alert takes `width: max-content` up to its place's width, as the medal
card does. An auto width shrank to the room right of its centre. At 320x568 a
150 px alert centred at 237 px set five lines 96 px wide onto the ammo slot. The
rendered receipt fails a wrapped alert narrower than its place.

Through the scope, the coordinator ruled that "0 APFSDS" and the zoom matter
more than the map while a notice shows. The fallback weights there are:

- the minimap: half the footprint's per-px² cost;
- the circle: 1;
- the readout rows and the range tag: 5;
- a panel or a control: 10.

The alert may also lie over the map at the map's width, 58 px tall at most, in
the `alert-narrow` form. That happens where the map leaves room under the
notices' first row. At 320x568 with both notices up at full bloom, the
detection now takes the free band over the map, and the alert lies over the
map. Before, the alert covered "0 APFSDS" and the "×" of the zoom plate. A
short landscape's map sits beside the score, over the notices' first row, so
its scope keeps the compact fallback. Those scenes stay notes in the receipt.
In battle the footprint still goes before the map. Placing
the detection first had taken the one free place at 640x360 and sent the alert
onto the scope's zoom plate. The scan reads only the blocks that cross each row
band, about 4 ms a plan on the smallest windows. The rendered receipt now also
measures every notice against the controls, their labels, the panels, the map
and the score. The uncleared windows are 320x568 in
every scene, the pre-battle countdown at 360x640, 375x667 and 768x1024, the
568 px landscapes, and the scope at 640x360 and 667x375.

### Scope skeleton and polish (r10f, r10g)

The notices session's critic on integ 11a74e4906 found these:

- the scope's horizontal arm ran through the Daylight plate;
- the lower post crossed the gun travel chip;
- a mil tick crossed the rack onto the struck round.

The cross arms and the mil ticks are now painted after the marks
(`paintScopeSkeleton`). Each arm's run is cut 5 px around every mark this frame,
the furniture and the target plate, and a tick within 2 px of one is left out.
`hudAmmoOutPaint.selftest.mjs` 19f sweeps the desktop and touch sizes, where
every arm segment keeps 3 px and every tick 2 px from the marks and the
furniture.

The same critic found three text and layout defects:

- **Alert separator.** The ammunition alert left its "·" at a line end (1024x600
  and the phones). It now breaks before the separator: each dot and the word
  after it share a nowrap span, with an ordinary space between them. r10f first
  used a no-break space, which rendered narrower than the space before the dot
  ("EMPTY ·SELECT", 9.1 px against 4.1 px at 1024x768). A word joiner after an
  ordinary space did not hold the break in Chrome.
- **Medal wrap.** The medal card's description left "last." alone on its last
  line, so it wraps evenly now (`text-wrap: pretty`).
- **Tray gap.** A mouse layout's inline tray sat 4 px from the drive gauge at
  1024 wide. It now shifts right to keep the gauge's 12 px
  (`--hud-tray-shift`).

`tools/hud-polish.browser.mjs` checks these defects and the r10g systems row
with no screenshot:

- the tray gap, the alert's line ends and the separator's spacing, and the
  medal's last line;
- at 320x568, 360x640 and 375x667 through the scope, at full bloom and at rest,
  with the gun travel warning: the systems row shows whole, the reticle's ink
  and the seated chip keep 3 px from its buttons, and the ink keeps 3 px from
  the round touch buttons.

On integ's files it fails 25 times.

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
