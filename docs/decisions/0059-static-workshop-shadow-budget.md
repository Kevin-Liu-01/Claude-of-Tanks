# ADR 0059: Static workshop detail has a projected shadow budget

- Status: accepted
- Date: 2026-08-27

## Context

The Garage workshop contains hundreds of authored fittings plus four
first-party vehicle/component exhibits. A settled Garage is demand-paced, but
camera orbit and vehicle transitions still render at display cadence. Ninety-
eight sub-40 cm fittings entered both Garage shadow cascades even though their
shadows are below useful screen resolution from every showroom camera pose.

## Decision

After the workshop's final streamed build slice, one typed finalizer bakes the
local matrices of every static descendant. Color-pass geometry, materials,
placement, lighting, and visibility remain unchanged. Static mesh casters with
a world-space bounding-sphere radius below 0.4 m stop submitting to Garage
shadow cascades. Authored vehicle shadow proxies, color-write-disabled shadow
owners, and explicit keep markers are never pruned.

The finalizer publishes an exact receipt on the workshop root. The phase
resource gate requires that receipt and enforces Garage cadence, CPU, heap,
program, geometry, texture, complete-frame draw-call, and triangle budgets.

## Consequences

- Workshop detail remains present in the color/depth image.
- Showroom camera motion avoids redundant transform composition and 196 shadow
  submissions per complete two-cascade frame.
- New small props cannot silently restore unrestricted shadow work.
- The settled Garage keeps one fail-safe paint per second; direct interaction
  and visible animation still run at display cadence.

## Verification

    node src/game/garageDressingOptimization.selftest.mjs
    node src/engine/garageFramePacer.selftest.mjs
    npm run perf:resources:gate
    npm run build
