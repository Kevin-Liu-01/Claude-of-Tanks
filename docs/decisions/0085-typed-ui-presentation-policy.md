# ADR 0085: Pure UI presentation policy is strict TypeScript

- Status: accepted
- Date: 2026-08-27

## Context

Several small browser-independent helpers controlled keyboard ownership,
vehicle and shell glyphs, nation flags, minimap orientation, drive telemetry,
spectator cards, random-map previews, and Garage ordering. They were widely
reused but remained unchecked JavaScript, which meant malformed UI payloads
and inconsistent collection shapes could cross otherwise typed boundaries.

## Decision

Move those existing owners to strict TypeScript without changing their output:

- `src/ui/keyboardOwnership.ts`
- `src/ui/shellIcons.ts`
- `src/ui/flagCodes.ts`
- `src/ui/flags.ts`
- `src/ui/uiIcons.ts`
- `src/ui/minimapOrientation.ts`
- `src/ui/driveTelemetry.ts`
- `src/ui/spectatorSwitcher.ts`
- `src/ui/randomPreviews.ts`
- `src/ui/garageOrder.ts`

The modules expose concrete input and result interfaces, preserve reusable
output buffers where the HUD already avoids allocation, and keep the existing
markup and SVG strings byte-for-byte. `src/vite-env.d.ts` supplies Vite's
canonical asset-module declarations so bundled SVG URL imports are checked
rather than locally suppressed.

No `any`, `@ts-ignore`, or `@ts-nocheck` escape hatch is introduced.

## Consequences

- Garage, HUD, multiplayer spectator UI, gallery, and vehicle tooling share
  checked policy primitives.
- Browser-independent rules remain directly executable in Node self-tests.
- The runtime JavaScript inventory falls by ten modules and about 430 lines.
- Larger UI renderers can migrate against these stable contracts instead of
  inferring their data shapes repeatedly.

## Verification

    npm run typecheck
    node src/ui/keyboardOwnership.selftest.mjs
    node src/ui/icons.selftest.mjs
    node src/ui/flags.selftest.mjs
    node src/ui/minimapOrientation.selftest.mjs
    node src/ui/driveTelemetry.selftest.mjs
    node src/ui/spectatorSwitcher.selftest.mjs
    node src/ui/randomPreviews.selftest.mjs
    node src/ui/garageOrder.selftest.mjs
    npm run build
