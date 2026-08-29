# 0249 — The damage schematic has a strict TypeScript owner

Status: accepted

## Decision

`src/ui/damagePanel.ts` owns the battle-only top-down damage schematic behind
explicit tank-mask, module, crew, combat-state, screenshot-sample, DOM, and
Canvas2D contracts. `battleHudAccess.ts` now imports that owner directly and
exports its controller contract instead of applying a double-unknown dynamic
module assertion.

The migration preserves the existing camera-up hull and turret transforms,
mask acquisition, vector fallback, module/crew state language, equipment row,
dirty-signature redraw policy, CSS, and public controller API. It neither
changes combat state nor moves the panel into first-visit Garage boot.

## Consequences

- Missing panel elements or Canvas2D contexts fail at construction with a
  precise message instead of producing a later null dereference.
- Module icons, mask layers, and sample states are checked at their real UI
  boundary.
- Battle HUD demand loading and the panel's redraw-on-change performance policy
  remain intact.

## Verification

    npm run typecheck
    node src/ui/battleHudAccess.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
