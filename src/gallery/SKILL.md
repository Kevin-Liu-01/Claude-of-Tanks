---
name: src-gallery-skill
description: Build and verify the public Tank Gallery, its technical dossiers, and transient armor, module, and crew inspection overlays.
---

# claude-of-tanks / src/gallery

## Purpose
<!-- agent-docs:fill:purpose -->
Present every playable first-party vehicle as a searchable live Three.js
specimen without duplicating the canonical fleet registry or combat metadata.

## Mental model & key files
<!-- agent-docs:fill:model -->
`catalog.js` derives read-only search, ratings, technical copy, and the versioned
copy-data record from vehicle specs. `overlays.js` turns canonical armor plates,
module boxes, and crew boxes into disposable diagnostic geometry. `gallery.js`
owns the separate-page renderer, selection state, camera, articulation, URL,
DOM, and browser automation contract. `gallery.html` and `gallery.css` own the
public surface; `docs/GALLERY.md` owns its documented contract.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
- Consume `ALL_TANK_IDS`, `getSpec`, canonical labels, tiers, and `createTank`;
  never add a gallery-only roster or balance table.
- Keep the route separate from `src/main.js` so gallery visits do not enter the
  playable game's boot-critical graph.
- Treat ratings as derived presentation values and keep canonical raw values
  visible and copyable.
- Build diagnostic geometry only for the active layer and dispose it together
  with the previous vehicle.
- Preserve `proceduralOnly: true`, stable query parameters, keyboard access,
  visible focus, reduced-motion behavior, and the `__TANK_GALLERY` probe API.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
- Dossier/search work: change `catalog.js`, then run
  `node src/gallery/catalog.selftest.mjs`.
- Overlay work: inspect the source volume shape in `src/vehicles/specs.js`,
  verify hull- versus turret-local ownership, then select the live volume in a
  browser.
- Layout or interaction work: inspect `/gallery` at desktop and 390 px widths
  with `agent-browser`; test search, all four layers, selection, copy actions,
  and URL restoration.
- Route changes: update Vite and Vercel rewrites together, then run both build
  variants.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Importing `tankFactory.js` registers the complete expansion fleet before the
browser reads `ALL_TANK_IDS`; tests must reproduce that import order. Armor
plates and internal volumes are diagnostic combat data, not visible-mesh
extractions or real-world engineering claims. Turret-local overlays must remain
children of `rig_turret` so live articulation cannot desynchronize them.
