# 0260 — Settings and input rebinding have a strict TypeScript owner

Status: accepted

## Decision

`src/ui/settings.ts` owns the demand-loaded settings panel, battle control
hints, keyboard and controller rebinding, binding-conflict resolution,
gameplay and volume controls, graphics preset selection, and pause/resume
presentation. Its public options and runtime now consume the canonical typed
input layer rather than a parallel loose contract.

`src/ui/settingsAccess.ts` derives its lazy-module contract from that owner.
The access boundary remains retryable and keeps only the small settings trigger
in the first Garage frame, but no longer double-asserts an imported JavaScript
module or fabricates a non-null panel root before the module is constructed.

## Consequences

- Setting keys, action identifiers, binding slots, and graphics choices are
  checked at their point of use.
- Required panel elements fail with one named invariant if authored markup and
  behavior drift apart.
- The composition root retains the same lazy chunk and rendered behavior while
  consuming the full canonical `InputLayer` contract directly.

## Verification

    npm run typecheck
    node src/ui/settingsAccess.selftest.mjs
    node src/ui/settingsControls.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    node src/ui/topAccentBorders.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
