# 0168 — Typed movement and rigid-body runtime

Status: accepted

## Decision

The fixed-step tank movement runtime is strict TypeScript. Vehicle mobility,
combat debuffs, player and bot inputs, terrain sampling, collision callbacks,
rendered contact geometry, sprung ride state, airborne attitude, rollover,
turret/gun lay, recoil, track travel, and dispersion now share explicit
contracts with local network prediction.

## Why

Movement is an authoritative 60 Hz hot path consumed by solo play, bots,
dedicated matches, client prediction, presentation, and diagnostic tooling.
Its former implicit shapes let an incomplete vehicle spec or prediction state
cross several systems before failing as bad terrain contact, divergent aim, or
rubber-banding. The rigid-body additions also made the distinction between
sprung contact, flight, landing, tumble, and recovery important enough to
encode directly.

## Consequences

- Drivetrain constants, fixed-step order, seeded behavior, support sampling,
  airborne integration, turret limits, recoil, and bloom calculations are
  unchanged.
- The established hot loop retains its module-scope scratch vectors and adds
  no per-frame allocation.
- Local prediction now consumes the same vehicle, height-field, combat,
  contact-geometry, and tank-state contracts as authority.
- Browser battle presentation declares the complete spec fields it already
  receives instead of treating them as an unstructured record.
- Focused movement, rollover, tank-contact, aim, prediction, and authoritative
  match tests remain the behavioral gate, followed by production performance
  and complete-suite certification.
