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
