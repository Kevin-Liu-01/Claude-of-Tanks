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
`garage.ts` owns roster/loadout presentation; its Filter toggle lazily loads
`garageFacetPanel.ts` (class, role, era chips and facet search over the pure
`garageFacetFilter.ts`; class silhouettes and role symbols from `vehicleFacetIcons.ts`, shared with the Gallery), so the facet tables stay off the game entry; its intent-loaded
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
The registry loads a page's chunk through `i18nChunkImport.ts`, which holds no
URL import; the page catalog plugin aliases it to `i18nChunkImport.browser.ts`
for every document. Never put a computed `import()` back into the registry: the
self-test runner cannot key a receipt whose graph holds one, and about 380
receipts reach the locale runtime (`node src/ui/i18nChunkImport.selftest.mjs`).

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
Type: `typeFaces.ts` is the one face source. Chakra Petch
(display 500/600/700), IBM Plex Sans (body 400/500/600) and IBM Plex Mono
(readouts 400/500) are pinned OFL files in `public/fonts/`. Each document has one
`<!--cot:type …-->` marker naming the families it declares (`ui display body
mono`; none named means `ui mono`), faces to preload (`display-700`; only the game
page and home preload, at most two) and opt-ins (`scale` for the `--fs-*`/`--t-*`
tokens, `fx` for `.t-accent` and `.t-hollow`); Vite expands it into only those
faces, their own metric-matched fallbacks and the family tokens. The arrows and
math marks the subsets lack (← ↑ → ↓ ∞ ≤ ≥) come from `'Cot Symbols'`
(`tools/type/cot-symbols.py`, drawn from Chakra Petch), named right after each
Latin face; the accented letters the Plex subsets lack (ā ē ī ō ū, ć ń ś ź and
capitals: tank names) come from `'Cot Accents'` (`tools/type/cot-accents.py`,
assembled from Plex Sans's own glyphs under its own name), named after each Plex
stack's Latin face. The receipt reads every face's cmap from its WOFF2 bytes and
fails if a catalog string or tank name prints a character no shipped face draws.
Chinese views are `/cn/` documents: `zhTypeFloor.ts` lists, per route, the label
elements a Chinese string fills below 13 px, and `localizedHtml.ts` adds that floor
to zh-CN documents only (English documents and the game entry carry none of it).
A new Chinese label under 13 px joins its route's list there.
check:bundle reports a document's inline CSS as `inlineCss`, and the receipt holds
each head to a brotli budget. Never add an
`@font-face`, a font preload or a face file elsewhere. Code asks only for
400/500/600/700 (CSS, style properties, object literals, canvas fonts), never
declares text under 11 px (clamp()/max()/min() floors included), and sets tabular
figures only through `.num` on values that tick in place (Plex Mono with its plain
zero; never on a localized string; the HUD team scores are Chakra Petch Bold
display numerals). `'Cot UI'` (`var(--font-ui)`, `FONT_STACK`) is Plex Sans at
400/500, Chakra Petch SemiBold at 600 (the label voice) and Bold at 700. Mark
Latin-only lockups `lang="en"` and track them on that element, so the zh-CN reset
(no tracking on Chinese) leaves them alone; Chinese display headings take a CJK
line-height (1.14-1.15). `typeSystem.selftest.mjs` holds all of it.
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
The garage r9 shared kit (2026-10-17) dresses every Garage from its own placement table
(`garageKitPlacements.ts`, built by `garageKitPlacement.ts`): pieces are pure builders over one `KitBuilder`
(`garageKitGeometry.ts`: bevels, vertex AO, wear and the region skin of `garageKitSkins.ts` baked into vertex
colours), cached per session and only transformed into a pack; solids join the baked bucket, textured walls their
own buckets, and the only new draws are one DISPLAY-LIT mesh, one decal mesh and one atmosphere mesh, each on a
program the boot already compiles. Cranes (`garageCraneKit.ts`) are complete and either at work with a real load or
parked; printed surfaces (banners, crests, nameboards, prints, readouts, maps, pictograms, stencils, lenses) name
rects of the one display atlas (`garageDisplayAtlas.generated.ts`, regenerated by
`tools/generate-garage-display-atlas.mjs` from the current `public/brand`; `npm run garage:atlas:check`), never
pixels. Each Garage shows one slideshow: Verdant's west-wall panel, or the pose in `garageSlideshowPlacement.ts`
where the pack builds the frame and the dressing hangs the same screen. No display, sign, banner or atmosphere card
enters the hero's halo in the canonical frame (its screen box plus 8 %, `garageDisplayPlacement.selftest.mjs` with
the measured canonical camera), which leaves the top band and the frame's outer edges for displays, and no
atmosphere card stands in front of a display, banner or the slideshow there (light shafts are feathered ribbons, never
hard-edged panes; Verdant's hall carries none: they crossed its screens and read as a glitching panel). The atlas's battlefield stills are the `still.<map>` group, never `media.`: a `media.`-led
template in the game graph keeps every media.* caption in the boot catalogs. A display mesh is armed with
`armGarageDisplayAtlas` (its first render starts the half-size-on-mobile atlas load, then the hook removes itself:
no per-frame call). A pack releases the cascade registrations of the materials it owns when it is disposed. The
platform kit (collars, LED pucks, pedestal, the segmented deck, the hall's two signs, half size on mobile) loads at
Garage idle together with the atlas runtime: no boot-graph module (`garageStage.ts`) imports `garageDisplayAtlas.ts`
statically. `npm run garage:atlas:check` fails when this tool, its font, the layout or the files moved and only warns
when another lane's pictures did (a tank lane's readout re-render, new site stills, the brand marks); a rebrand or a
release that wants current pictures runs `npm run garage:atlas:check -- --strict`, then `npm run garage:atlas:update`.
The kit's piece cache and the skyline bakes keep the two most recent Garages, like the pack cache.
`tools/garage-kit-sheet.html` stages every piece for review. Each Garage's arrangement lives in its own module
(`garageKitRedrock.ts`, `garageKitGlacier.ts`, `garageKitFrosthollow.ts`, `garageKitMonsoon.ts`, ...), laid out in the
opening view's frame (atmosphere cards too, through `atView`); the halo receipt tests each face and card by its own
corners and the structure receipt by each face's oriented box, so a plate on a wall square to the view can sit 2 cm
proud of it.
The outside environment comes from the map (K10): `tools/generate-garage-skylines.mjs` (`npm run
garage:skylines:check`) bakes each map's near relief (ray-cast over its heightfield in three bands) and its landmarks
at their compass bearings from the Garage's anchor (hinterland drafts, the map file's lakes, inselbergs, villages,
churches, sawmill, town, river, tea estate; an authored row only where a map has no draft) into
`garageSkylines.generated.ts`; `garageSkyline.ts` builds a Garage with a style row (Redrock, Glacier, Frosthollow,
Monsoon) into the horizon's one vertex-colour draw: bearings kept, distance compressed onto the ring, elevation by one
factor, nearest first with occluded far forms dropped, under 9,500 triangles. Add a Garage by giving it a style row
and, where its draft lacks them, its map's rows in the generator. An approach with `drapeM`
(`garageEnvironmentRecipes.ts`) lies on the terrain mesh's own triangles and splits where the ground bends off a
chord, its road one ribbon laid across the width every 2 m or less (Monsoon, Frosthollow, Glacier).
A Garage's own pieces live in its kit module (`garageSaltmereKit.ts`, `garageCinderKit.ts`, `garageIronworksKit.ts`):
pure `KitBuilder` functions placed as `{ kind: 'piece', key, build }` items (cached by `key`). Its outside environment
is a built skyline (`garageSkylineKit.ts`, rows in `GARAGE_KIT_SKYLINES`): named map landmarks drawn into the pack's one
backdrop draw at their bearings from the terrain patch's anchor (map x/z = pack x/z), plus optional band reshaping
(sea arcs, strands, hedges); `garageSkylineKit.selftest.mjs` checks each landmark within 15 degrees of its map point.
Sirocco and Steinburg draw their maps' landmarks (mesas and ksar; the old town, castle and spires) through
`garageHorizonLandmarks.ts` (`garageSiroccoHorizon.ts`, `garageSteinburgHorizon.ts`, meshes from
`garageLandmarkMesh.ts`), which lifts and clears the biome bands' crests; `garageHorizonLandmarks.selftest.mjs` checks
bearings against the map data. Their kit tables lay out their own working cells (`GARAGE_KIT_CELL_ARCHITECTURES`), so
the facility drops its primitive station piles there.
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
tank hero layers through `import('./heroCard.ts')` with `import('./heroCard.css')`
beside it (lazy, no static chunk on the game page); numbers live in `heroCardPolicy.ts`, the layers are rendered changed-only
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
