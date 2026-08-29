# 0261 — The Scene Studio panel has a strict TypeScript owner

Status: accepted

## Decision

`src/ui/studioPanel.ts` owns the Scene Studio workspace presented over the
renderer. Its strict port describes staged actors, map and fleet catalogs,
effect recipes, storyboard shots and actor keys, camera state, recording,
capture, and the internal marker and selection state needed by the view.

The migration preserves the existing panel markup, CSS, controls, scene JSON,
timeline operations, capture flow, and demand-loaded Studio boundary. It does
not move renderer or effect authority into the UI.

## Consequences

- Actor-only effect actions cannot accidentally dereference an absent
  selection; their control path is distinct from effects that permit a map
  marker.
- Map images, timeline controls, archive dialogs, and recording controls use
  their concrete DOM types.
- The next migration of `src/game/studio.js` has a reviewed consumer contract
  to satisfy instead of an untyped panel callback graph.

## Verification

    npm run typecheck
    node src/game/studioTimeline.selftest.mjs
    node src/game/studioAccess.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
    node tools/studio-selftest.mjs
