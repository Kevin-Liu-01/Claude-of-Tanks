# Retained battle HUD presentation

This checkpoint reduces repeated DOM work without changing simulation, ammo
inventory, firing, authoritative selection or visible HUD design.

The ammunition presenter retains copied primitive fields rather than card
object identity. In-place count/type changes, replacement spectator cards,
depletion, pending ATGM selection and locale changes still update the display.
Optimistic input highlights are reconciled with every authoritative render,
even when the last authoritative values are unchanged. Cooldown, touch-drawer
layout, keyboard reachability and ARIA attributes keep their existing owners.

The layout observer compares the final delivered attribute value with its
previous value. Removing an already-absent class, or removing/re-adding the same
class in one batch, no longer requests a layout pass. Real changes, resize,
child-list changes and completed/cancelled spectator transitions still request
measurement. Unchanged CSS custom properties and datasets are not rewritten.

Regression coverage includes 600 unchanged ammo frames with no DOM/icon writes,
in-place card changes, empty normal ammo with stocked missiles/HE, pending and
rejected optimistic selection, reload-only updates, touch/desktop transitions,
non-finite/missing counts and locale invalidation. The existing browser layout
probe also checks live ammunition transitions with normal motion enabled.

This is a bounded UI-work reduction, not a claim of zero lag, a guaranteed FPS
increase or a resolution of browser audio-device and tank-construction stalls.
