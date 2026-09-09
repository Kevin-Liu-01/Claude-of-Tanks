# T-90 X canvas finish checkpoint

`t90m_x` and `t90a_vladimir_x`: route the existing flexible mantlet boots to
the shared olive canvas material. Retain steel collars in their existing
painted-metal role. No geometry, transform, barrel opening or physical envelope
changes. The continuous boot stays in the always-visible gun rig, rather than
vanishing with distant equipment LOD.

`t90XCanvasFinish.selftest.mjs` passed 16 old/new procedural builds spanning
both IDs, HIGH/LOW and factory/winter finishes. Authored vertices and posed
world geometry remain equal; the canvas is map-free and neutral, with the
existing material settings. Repainting the boot as hull paint is a failing
negative control. CPU canvas fixtures are not native pixel evidence.

This is a narrow material checkpoint, not completion of fleet gear/performance
work or a complete release gate. The original fixture failure is not counted
as a pass; the corrected test passed in session 41749 on 2026-09-09 UTC.

The composed canvas/Leopard-smoke checkpoint passed TypeScript and 48 native
views: six IDs × HIGH/LOW × factory/winter × front-left/right at 8 m, 1200 ×
800. All paired accessory finishes stayed invariant across camouflage changes.
The T-90M winter boot, Vladimir factory boot and both Leopard launcher frames
were visually reviewed. Raw images and frozen-input receipts are local-only in
`.qa-dev/cloth-smoke-native-20260909`; session 64844 completed successfully.
This adds native material/attachment evidence, not a full release PASS.
