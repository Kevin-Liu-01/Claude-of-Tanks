# 0219 — Vehicle internal-layout evidence is strict TypeScript

Status: accepted

## Decision

Keep published evidence sources, crew stations, internal systems, reusable
layout families, and tank-to-layout assignments in
`src/vehicles/internalLayoutRegistry.ts` under explicit contracts.

The registry remains dependency-free and data-only. Combat anatomy, Gallery
diagnostics, and killcam X-ray continue to consume the same immutable records.

## Why

This registry is the semantic bridge between researched vehicle layouts and
the generated internal collision volumes. Unchecked source keys, hull/turret
frames, or system overrides could silently remove crew, ammunition, feed, or
powertrain evidence from every downstream presentation.

## Consequences

- Source references and layout family keys are compile-time checked.
- Every crew station is constrained to a hull or turret frame.
- System overrides preserve a complete engine, transmission, optics,
  ammunition, autoloader, feed, and missile shape.
- The emitted records and registration order remain unchanged.
- Anatomy, X-ray overlay, Gallery, import-integrity, and production-build gates
  certify this boundary.
