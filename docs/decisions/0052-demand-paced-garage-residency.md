# ADR 0052: Static Garage work and residency are bounded

- Status: accepted
- Date: 2026-08-27

## Context

Frame rate alone hid two expensive behaviors. A settled Garage executed the
complete render pipeline at display cadence, including audio, lighting,
postprocessing and scene traversal. Passive dwell could also construct a full
battlefield, while desktop caches allowed ten pedestal tanks, unlimited worlds
and four detached rematch visuals to remain resident.

The fixed showroom framing made one cost especially unnecessary: its periodic
measurement traversed every selected-tank mesh, then discarded the result in
favor of a canonical box.

## Decision

`src/engine/garageFramePacer.ts` is the typed owner of settled Garage cadence.
Visible camera motion and user activity run at display cadence; a static scene
uses an 8 Hz safety paint so asynchronous completion still appears within 125
ms. DOM and CSS transitions remain browser-composited.

Persistent room/session pumping is deliberately outside this WebGL gate. A
static Garage may paint at 8 Hz without reducing signaling recovery, host
snapshot, or reconnect cadence.

Fixed showroom framing never measures the vehicle subtree and writes a camera
pose only when framing or motion changed. Passive dwell no longer constructs a
world. Desktop residency is bounded at four pedestal visuals, two world scenes,
and two detached battle visuals; mobile retains its stricter existing limits.

## Consequences

- Static-screen CPU scales with visible work rather than monitor refresh rate.
- First Garage dwell retains no battlefield heap, geometry, textures or shader
  programs.
- Drag, zoom, spring motion, vehicle switching and CSS presentation remain
  full-rate and visually unchanged.
- Battle and rematch intent still reuse explicitly requested worlds and a small
  visual pool, without unbounded browsing history.

## Verification

    node src/engine/garageFramePacer.selftest.mjs
    node src/engine/resourceLifetime.selftest.mjs
    node src/game/battleIntentRuntime.selftest.mjs
    npm run perf:resources:gate
    node tools/garage-camera-probe.mjs
    npm run typecheck
    npm test
    npm run build
