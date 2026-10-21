---
name: src-gallery-skill
description: Build and verify the public Tank Gallery, its technical dossiers, diagnostic overlays, and exact-surface markup review packets.
---

# claude-of-tanks / src/gallery

## Purpose
<!-- agent-docs:fill:purpose -->
Present every playable first-party vehicle as a searchable live Three.js
specimen without duplicating the canonical fleet registry or combat metadata.

## Mental model & key files
<!-- agent-docs:fill:model -->
`catalog.ts` derives read-only search, ratings, technical copy, and the versioned
copy-data record from vehicle specs; its class and role filters and facet search
read `src/vehicles/vehicleFacets.ts` and `vehicleFacetSearch.ts`. The Armor, Modules and Crew layers are the
lazy anatomy view: `anatomyData.ts` reads the combat armor model into the lists
`traceTank` tests (pure, Node-runnable), `anatomyScene.ts` draws them in the
combat frames (heat map, `anatomyModules.ts` models, `anatomyCrew.ts`
mannequins, hit volumes), and `anatomyView.ts` (loaded through `import()`) owns
the ghost exterior pass, toggles, legend, badges and readouts. `overlays.ts`
still builds the baked side diagrams and field-guide scenes;
`viewGlyphs.ts` owns the exhaustive camera-view icon vocabulary.
`surfaceMarkup.ts` owns live triangle/patch selection, articulation ownership,
review annotations, JSON, and PNG capture. `inAction.ts` is the dossier's lazy
"In action" block: the selected vehicle's own take over `src/ui/fleetTakes.ts`. `gallery.ts` owns the separate-page
renderer, vehicle state, camera, articulation, URL, DOM, and browser automation
contract. `site/gallery.html` and `gallery.css` own the public surface;
`docs/GALLERY.md` owns its documented contract.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
- Consume `ALL_TANK_IDS`, `getSpec`, canonical labels, tiers, and `createTank`;
  never add a gallery-only roster or balance table.
- Keep the route separate from `src/main.ts` so gallery visits do not enter the
  playable game's boot-critical graph.
- Treat ratings as derived presentation values and keep canonical raw values
  visible and copyable.
- Build diagnostic geometry only for the active layer and dispose it together
  with the previous vehicle.
- Parent markup highlights to the selected mesh, keep review packets
  non-mutating, and clear every runtime highlight before disposing a vehicle.
- Preserve `proceduralOnly: true`, stable query parameters, keyboard access,
  visible focus, reduced-motion behavior, and the `__TANK_GALLERY` probe API.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
- Dossier/search work: change `catalog.ts`, then run
  `node src/gallery/catalog.selftest.mjs`.
- Anatomy work: run `node src/gallery/anatomyFidelity.selftest.mjs`
  (`ANATOMY_IDS=a,b` narrows it) and, in a lane, `node tools/anatomy-frozen-check.mjs`
  to prove combat data is untouched; select the live part in a browser.
- Surface-markup work: run `node src/gallery/surfaceMarkup.selftest.mjs`, then
  test face/patch scope, additive selection, ownership, focus, JSON, and PNG in
  the browser.
- Layout or interaction work: inspect `/gallery` at desktop and 390 px widths
  with `agent-browser`; test search, all five layers, selection, copy actions,
  and URL restoration.
- Route changes: update Vite and Vercel rewrites together, then run both build
  variants.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Importing `tankFactory.ts` registers the complete expansion fleet before the
browser reads `ALL_TANK_IDS`; tests must reproduce that import order. Armor
plates and internal volumes are diagnostic combat data, not visible-mesh
extractions or real-world engineering claims. Anatomical turret overlays remain children of `rig_turret`. Exact combat
hitboxes instead use `createCombatFrames`, updated with every articulation and
frame: combat coordinates must not inherit presentation-only rig scaling.
The legacy `/surface-studio` path is redirect-only; do not recreate a second
viewer or authoring state owner. Anatomy draws the sim's surfaces, not the
visual mesh: collision cells are plane polytopes and plates are their ray-test
polygons, one-sided. Never import the anatomy modules statically from
`gallery.ts`, and never edit `overlays.ts` or `internalAnatomyVisuals.ts` for
Gallery looks: they feed the baked diagrams and the kill cam.
