# 0070 — Static Garage rendering is event-invalidated

Status: accepted

## Context

Sleeping the Garage animation clock reduced JavaScript callbacks, but each
one-second safety paint still rebuilt every active CSM depth map. The scene,
camera, and sun were unchanged, so those paints submitted roughly 204 shadow
draws without producing a different image. One paint per second was also more
work than a static presentation needs once every owned asynchronous mutation
can wake it directly.

## Decision

Garage scene mutations invalidate presentation explicitly. Vehicle reveals,
workshop chunks, pointer/keyboard/touch activity, camera motion, phase changes,
WebGL recovery, and viewport resize wake the frame scheduler immediately. A
five-second watchdog remains only for browser-owned asynchronous changes.

Once the Garage camera and scene settle, `lighting.js` retains the last valid
CSM depth textures and disables both automatic and requested updates for every
cascade. Releasing the dormant latch forces all cascades before the next
moving frame. The selected hero, color pass, materials, lighting, and completed
shadow image do not change.

The four distant repair/salvage exhibits use their existing first-party low
tessellation contract. Their proportions and materials remain exact; the
selectable hero remains full quality.

## Consequences

- Initial and returned Garage cadence is 0.2 paints per second after settle.
- Settled paints submit zero shadow draws and zero shadow triangles.
- On the 1280×577 DPR-1 production gate, initial Garage task residency moved
  from 0.014 to 0.004 core-equivalent and complete frames from 496 to 290
  calls; the visible result is unchanged in paired captures.
- Any new asynchronous Garage producer must emit presentation invalidation
  after changing a visible object.

## Verification

```sh
node src/engine/garageFramePacer.selftest.mjs
node src/engine/shadowRefresh.selftest.mjs
node src/game/garageDressingLifecycle.selftest.mjs
node src/game/garagePedestalRuntime.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
```
