---
name: src-ui-skill
description: Work on garage, HUD, settings, mobile controls, transitions, and battle presentation UI.
---

# claude-of-tanks / src/ui

## Purpose
<!-- agent-docs:fill:purpose -->
Present game and session state with fast, legible desktop/mobile interactions.

## Mental model & key files
<!-- agent-docs:fill:model -->
`serviceRecordView.ts` renders the garage's tabbed Service Record (overview,
medals, achievements, history with each battle's kill trace) into the dialog
`garage.ts` owns, only while it is open; `medalArt.ts` draws every medal and
achievement as inline SVG; `medalToast.ts` shows medals as they are earned;
`garage.ts` owns roster/loadout presentation; its intent-loaded
`camoSwatchPainter.ts` owns deterministic exact camouflage cards;
`garageStage.ts` owns the typed visible hero podium and environment bridge;
`garageArchitecture.ts` owns the two-pack async cache and phase-tracked assets;
`garageEnvironmentKit.ts` owns all ten bounded authentic terrain, camera-space
structure, full-detail instanced vegetation/ground-cover, generated wreck, PBR,
and biome-specific layered-horizon packs; the shared engine sky owns every
outdoor Garage atmosphere;
`playMenu.ts` owns direct Solo,
Private and LAN deployment over `src/mp/session/playMenuAdapter.ts`;
`multiplayerStatus.ts` owns the network strip, panel and banner over
`src/mp/session/networkStatus.ts`;
`hud.ts` owns live battle chrome; `minimapAssetRuntime.ts` owns baked-map load
coalescing, stale-world rejection, and the procedural cartography fallback;
`damagePanel.ts` owns the battle-only camera-up tank schematic and its
redraw-on-change module/crew presentation (a wreck holds the pose of its last
live frame: `setPose` stages, `update` commits only while the vehicle lives);
`shotInfo.ts` owns typed resolved-hit cards, incoming-fire alerts, the bounded
combat log, armor-diagram projection, event-derived battle statistics, and the
killcam-aware handoff to the after-action report;
`perfHud.ts` owns the lazy typed diagnostics surface and its bounded 4 Hz DOM
paint;
`studioPanel.ts` owns the typed Scene Studio workspace, actor/effect/timeline
controls, capture/export surface, and production archive;
`studioPicturePanel.ts` owns its Picture section (look, grade/finish sliders,
letterbox, depth of field), a thin view over `__STUDIO.setPicture()`;
`fleetTakes.ts` owns every vehicle's own take (the per-vehicle index fetched once
at first use, and the muted player that decodes only on screen) for the Gallery
dossier, the manual's fleet reference and the Garage's battle gallery, which
reach it only through `import()`; the Studio Director finds the same takes in
its scenes index (`group: 'fleet'`);
`settings.ts` and `touchControls.ts` own input-facing UI; `transition.ts`,
`battleLoad.ts`, and `endScreen.ts` own flow beats.
`i18n.ts` owns locale detection and runtime formatting; the paired
`i18nCatalog.<locale>.json` files are the reviewed local source of truth and the
General Translation CLI boundary documented in `docs/LOCALIZATION.md`.
`i18nDictionaries.ts` ships no catalog: each document loads its own (the game the
full catalogs, which the build restricts to the keys the game's graph and workers
can show, a public page the page catalog its HTML declares, built from
`tools/i18n-page-catalogs.mjs`, and its lazy chunk before each module it reaches
only through `import()`); a key a public page could show raw fails the build.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Consume canonical state rather than duplicating policy. Keep large/high-cost
screens lazy. Preserve large touch targets and test desktop plus mobile. Baked
minimap requests must pass through `minimapAssetRuntime.ts`; keep active-world
and prepared-service checks at the asynchronous completion edge.
Decorative metadata such as repository stars must render a stable-width loading
state or a bounded verified local cache, then refresh only through the cached
same-origin endpoint. Never ship a hardcoded numeric fallback or make boot or
Garage presentation depend on a third-party request.
Shared DOM, font, generated-icon, image-preload, featured-media, and map-art
primitives are strict TypeScript owners. Extend their exported contracts rather
than creating screen-local unchecked copies.
`garage.ts` is a strict presentation adapter: keep fleet, map, camouflage,
loadout, room-status, and battle-intent inputs explicit; fail fast when its
static markup contract is missing; and preserve its disclosure/event lifecycle
when adding responsive controls.
`garageStage.ts` is also the exact restored Verdant workshop owner. The nine
outdoor destinations live behind `garageArchitecture.ts`; their static service
facilities are baked by `garageFacilityDetails.ts`, receive but do not cast live
CSM shadows, and retain no playable-fleet runtime. Opening-view maintenance
portals must be grounded four-post assemblies with connected roof/floor members
and equipment, but no silhouette-only vehicle or component proxies. The shared
full-detail fleet dressing owns every readable tank and teardown part. Flat-map Garages retain low
horizons; only authored rolling, mesa, coastal, and alpine recipes may raise
terrain silhouettes. Outdoor facility islands must use one terrain-seated local frame. Use
endpoint-connected beams for braces and hoists; never fake a connection with an
Euler-rotated floating bar. Preserve four PBR material readings, two heavy-lift
systems, at least three assembled operating machines, and all four manual orbit
captures. `garageQualityRubric.ts` must remain an all-or-nothing 90+ approval
gate rather than a metadata-only average.
The four instanced facility classes share one working-yard grime program
(`garageGrimeProgram.ts`, world-space dirt, streaks and faded paint); keep new
kit colours weathered, never toy-saturated. Saltmere's harbour is a lit sea
(`garageSea.ts`) over the backdrop's painted one; it and the backdrop discard
over the graving dock, which stands pumped dry (its floor cut is
`garageDrydockGround`: re-check terrain triangles against the floor after any
change to the basin). Monsoon's standing water lives in the yard wet mask
(red = water, green = the damp rim) and lies only in ruts and hollows.
Verdant's room shell and
supported interior dressing use one static half-turn around the turntable;
exclude the podium, hero, canonical camera, shared maintenance graph, and
rear-axis archive display from that transform. Preserve one canonical hero
pose and verify both persisted outdoor reload and 1180x820 overlay composition.
Do not reintroduce all-environment post-ready warming. Selector intent may
fetch code, exact card intent may prepare one destination, the prior complete
pack stays visible through the handoff, and the cache retains at most the active
and previous packs. Full-detail tree groves are shared immutable library assets;
prepare cold species across animation frames, and release their generated atlas
only when the library is disposed. Repeated opaque facility primitives belong in static
instanced batches, not individual scene nodes or one-off merged allocations.
Catalog structure facades author their front on local `+Z`; outdoor recipes must
keep every facility parallel to `GARAGE_HERO_HEADING_RAD` so halls, rear walls,
and the hero tank share one deliberate service-yard grid. Never radially aim an
individual structure at the turntable before merging. Preserve the shared
albedo and normal texture residency for plaster, masonry, timber, and roofs
rather than replacing close Garage structures with flat colors.
The hero's outline from the Garage camera stays clear (garage critic panel and
ruling, 2026-10-14: the current layout protects the hero's spot, the turntable,
the camera and the UI, not the backdrop): no post, mast, leg, hook or lamp crosses
the hull or turret, a light, calm value stands behind the turret line, and a
signature facility sits in a third of the frame or frames the hero. Per Garage:
- Sirocco: the shade depot at view (20, 22), the water tower beyond it, the container line low behind the hero; the
  guard tower and its HESCO line in the left third at (-15.5, 17).
- Saltmere: the graving dock in the right third (centre line side 14.6, head 14.5, mouth 33.8), the crane on its rails
  along the dock's far side, its jib slewed down the dock to sea; the lighthouse to the far left.
- Redrock: the recovery yard and its gantry at (16, 17), its span turned 45 degrees so the whole gantry stays in the
  frame; the guard tower and sandbag wall at (-15.5, 17); the warehouse off the turret at (9, 44), smaller; the map's
  grey heavy-lift gantry behind the lens at (17, -38), clear of the yard's own.
- Frosthollow: the bunker square to the view at side 9.5, its portal beside the turret, its light facade behind it; the
  spruce right of the turret; the chalet left of it at (-10, 44), the chapel whole in the right third at (24, 30).
- Glacier: a 68 m cliff across the frame, the tunnel mouth beside the turret at side 8.5.
- Ironworks: the crane bay square, its column lines 25.6 m apart framing the hero; crab and booth racked right; the
  6 m of back wall behind the turret plain sheeting.
- Monsoon: the covered bay square, its column lines 24 m apart framing the hero; the banana and bamboo in the thirds.
- Steinburg: the Zeughaus 7 m back at the yard's level, its roofline against the sky; the fire station off the left;
  the yard piece on the forecourt at (9, 17.5).
- Cinder: the engine shed at the yard's level; its bracket signals gone, the water crane off the facade.
Ground that must stay clear of scatter (Saltmere's dock) answers through its own predicate in the kit; anything the
kit lays down by sampling the ground (groves, tufts) asks it first.
The shared turntable dimensions, ground elevations, and terrain exclusion live
in `garagePresentationPose.ts`. Keep terrain and hardstands below the complete
platform base, including one terrain-cell safety margin. Recolor the existing
shared turntable materials per location; never create a new texture or shader
program during an environment switch.
The separate merged service-facility pack follows that same hero axis; never
use `GARAGE_CAMERA_AZIMUTH_RAD` as its yaw or the bays will stare face-on at the
opening camera instead of showing three-quarter depth beside the tank. The one
exception is a signature building the approach runs into or through (Cinder's
engine shed over the rail fan): it is squared on its road, its yaw derived from
the road's own points, never from the camera constant.
The public and Studio capture gallery shares `presentation/mediaArchive.ts`;
keep manifest transfer lazy, pagination bounded, and lightbox cleanup explicit.
`presentation/publicPages.ts` owns typed, save-data-aware hero, screenshot-rail,
deferred-image, and viewport-video lifecycles outside the game runtime.
`presentation/publicNav.ts` owns the responsive public navigation lifecycle;
`presentation/captureRecipes.ts` owns typed lazy recipe lookup for docs and
capture galleries. The top-level public presentation runtime contains no JS.
The technical manual runtime in `src/docs/` is also strict TypeScript: topics,
archive motion, copy controls, and battle reels remain public-entry-only code.
The reusable accessible dialog lifecycle, focus trap, dismissal guard, and body
scroll ownership live in `modal.ts`; feature panels only own dialog content.
Rich contextual dossiers, live image resolution, and JSON-copy controls live in
`contextInfo.ts` and compose the shared modal instead of inventing popovers.
Keep browser-independent presentation policy in the typed keyboard, glyph,
flag, minimap, telemetry, spectator, preview, and ordering modules so the large
screen renderers do not redeclare those rules.
Every supported locale must keep exact key, placeholder, and vetted rich-markup
parity. Plain `data-i18n` hosts cannot contain child markup because text
replacement would destroy controls. Locale changes reload the current surface
atomically; do not add screen-local partial refreshes.

## Common tasks → first action

Battle overlay placement is owned by `battleHudLayout.ts` / `.css`: event-time
lane measurements keep rosters, incoming alerts, chat, reports, minimap and
driving controls apart. Do not restore independent fixed offsets in those
components. Run `battleHudLayout.selftest.mjs` and the rendered matrix in
`tools/battle-hud-layout.browser.mjs`; see `docs/BATTLE-UI-QA.md` for coverage.
<!-- agent-docs:fill:tasks -->
Inspect the live rendered surface, locate event/callback ownership, change the
smallest screen module, then run its selftest and browser verification.
Vehicle cards (Garage roster, end-screen tile, Gallery list) take the offline
tank hero layers through `heroCardAccess.ts` `loadHeroCards()` (module + CSS,
lazy); numbers live in `heroCardPolicy.ts`, the layers are rendered changed-only
by the tools in `tools/SKILL.md`, and a missing row keeps the packaged portrait.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Garage and shared responsive styles are static Vite-managed CSS imported in
responsive-before-Garage cascade order by `src/main.ts`. Do not move them back
into JavaScript or reverse that order. A lazy surface loads its stylesheet with
a dynamic import beside its module at the boundary (`aerialHud.css` in
`battleHudAccess.ts`), never a static import inside its graph: plain-Node
selftests import `hud.ts` and cannot load CSS (`runtimeStyles.selftest.mjs`
enforces it). Avoid boot-critical imports and do not leave XP/currency labels
after progression removal.
