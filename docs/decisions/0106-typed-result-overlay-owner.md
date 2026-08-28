# 0106 — The integration result overlay has one typed owner

## Context

The full after-action screen adopts a stable `RETURN TO GARAGE` button from a
small `.cot-end` integration overlay. Creation, styling, local-record markup,
visibility, and the return callback were embedded in `main.js`, even though the
composition root should only connect result presentation to garage navigation.

## Decision

`src/ui/endOverlayRuntime.ts` owns the integration overlay and exposes only
`show`, `hide`, its stable root, and its stable return button. It preserves the
existing `.cot-end` DOM identity so `endScreen.ts`, `shotInfo.js`, and the HUD
can adopt the same button and existing click behavior without duplicate UI.

`main.js` constructs the owner and passes its methods to battle, network,
capture, and garage-return lifecycles.

## Consequences

- Result DOM construction and record formatting leave the composition root.
- The full after-action report remains visually and behaviorally unchanged.
- Every return path invokes one stable handler and one `ui:click` event.
- The owner has a focused DOM-contract regression test in the ordered suite.

## Verification

- `npm run typecheck`
- `node src/ui/endOverlayRuntime.selftest.mjs`
- `node src/ui/endScreen.selftest.mjs`
- `node tools/selftest-suites.selftest.mjs`
- `npm run build`
