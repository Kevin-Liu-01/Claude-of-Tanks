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
`garage.ts` owns roster/loadout presentation; its intent-loaded
`camoSwatchPainter.ts` owns deterministic exact camouflage cards;
`garageStage.ts` owns the typed visible hero podium and environment bridge;
`garageArchitecture.ts` owns the two-pack async cache and phase-tracked assets;
`garageEnvironmentKit.ts` owns all ten bounded authentic terrain, camera-space
structure, full-detail instanced vegetation/ground-cover, generated wreck, PBR,
and biome-specific layered-horizon packs; the shared engine sky owns every
outdoor Garage atmosphere;
`playMenu.ts` owns direct Solo,
Private, LAN, and Ranked deployment; `networkStatus.ts` owns reconnect feedback;
`hud.ts` owns live battle chrome; `minimapAssetRuntime.ts` owns baked-map load
coalescing, stale-world rejection, and the procedural cartography fallback;
`damagePanel.ts` owns the battle-only camera-up tank schematic and its
redraw-on-change module/crew presentation;
`shotInfo.ts` owns typed resolved-hit cards, incoming-fire alerts, the bounded
combat log, armor-diagram projection, event-derived battle statistics, and the
killcam-aware handoff to the after-action report;
`perfHud.ts` owns the lazy typed diagnostics surface and its bounded 4 Hz DOM
paint;
`studioPanel.ts` owns the typed Scene Studio workspace, actor/effect/timeline
controls, capture/export surface, and production archive;
`settings.ts` and `touchControls.ts` own input-facing UI; `transition.ts`,
`battleLoad.ts`, and `endScreen.ts` own flow beats.

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
The shared turntable dimensions, ground elevations, and terrain exclusion live
in `garagePresentationPose.ts`. Keep terrain and hardstands below the complete
platform base, including one terrain-cell safety margin. Recolor the existing
shared turntable materials per location; never create a new texture or shader
program during an environment switch.
The separate merged service-facility pack follows that same hero axis; never
use `GARAGE_CAMERA_AZIMUTH_RAD` as its yaw or the bays will stare face-on at the
opening camera instead of showing three-quarter depth beside the tank.
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
Private/LAN battle chat parsing, keyboard capture, pointer-lock restoration,
bounded history, and DOM lifetime live in `roomChat.ts`.
Keep browser-independent presentation policy in the typed keyboard, glyph,
flag, minimap, telemetry, spectator, preview, and ordering modules so the large
screen renderers do not redeclare those rules.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Inspect the live rendered surface, locate event/callback ownership, change the
smallest screen module, then run its selftest and browser verification.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Garage and shared responsive styles are static Vite-managed CSS imported in
responsive-before-Garage cascade order by `src/main.ts`. Do not move them back
into JavaScript or reverse that order. Avoid boot-critical imports and do not
leave XP/currency labels after progression removal.
