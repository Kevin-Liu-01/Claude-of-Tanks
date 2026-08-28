# 0195 — Camouflage policy is independent from its typed painter

Status: accepted

## Decision

`src/vehicles/camoPolicy.ts` owns built-in pattern IDs, network-safe fallback,
factory-theme selection, the custom recipe schema, normalization, and the
stable recipe codec. It also owns the closed brush and stencil vocabularies.

`src/vehicles/customCamoCanvas.ts` imports that vocabulary and implements only
deterministic Canvas2D painting. It no longer owns schema constants that force
the otherwise headless multiplayer policy to import the painter.

## Why

Lobby and ranked authority must validate camouflage without gaining a rendering
dependency. The previous policy described itself as DOM/WebGL-free but imported
its brush and stencil lists from the Canvas2D implementation. Although that
code did not construct a canvas at module load, ownership ran in the wrong
direction and made the headless seam misleading.

Moving the vocabulary into policy passes the deletion test: authority can now
delete the painter entirely, while authoring still receives one normalized,
typed recipe. The browser retains a real second adapter—the deterministic
Canvas2D painter—without exposing it through the network interface.

## Consequences

- Network camouflage values narrow to the built-in pattern union and custom
  paint still degrades to `factory`.
- Valid persisted recipes encode, decode, and render identically; malformed
  strokes are discarded at normalization rather than reaching Canvas2D.
- The custom Studio consumes the canonical recipe type and no longer maintains
  a duplicate draft interface or an unsafe compatibility cast.
- No canvas, texture, material, or Studio module enters pristine boot or the
  headless authority path.
