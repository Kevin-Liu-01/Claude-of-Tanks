# ADR 0023: Shader warming matches the production render path

- Status: accepted
- Date: 2026-08-26

## Context

Three.js includes the target color path and active light set in program
selection. Compiling battlefield objects against the default sRGB framebuffer
or with production lights hidden therefore prepared variants that the linear
HDR composer never used. `WebGLRenderer.compile()` also leaves uniform-table
discovery and some first material/state binds to the first real render. On
ANGLE/Metal this appeared as nondeterministic rollout and first-shot freezes.

Several legacy warm paths compounded the problem by separately staging the
same opening, destruction, and prop-break effects during the opaque transition
and again during the deployment countdown.

## Decision

`src/engine/programWarm.ts` owns target-aware compilation and scoped uniform
initialization. `src/engine/deploymentWarm.ts` owns bounded private forward
renders while retaining the production light roots and restoring all scene and
shadow state.

Battle entry uploads the shipped FX textures, stages every required opening
and destruction pool once, and binds those programs against the composer's
actual render target. The countdown reuses that receipt. The older generators
remain compatibility fallbacks for deterministic captures and direct debug
entry that bypass the player transition. A WebGL context restoration
invalidates the renderer-lifetime receipts.

The same rule applies to boot and phase transitions. A typed Garage GPU owner
submits the initial scene, shadows, bounded uploads, and post passes in one
recoverable sequence. Garage vehicle switches, battlefield activation,
network entry, wrecks, and opening effects receive the target-aware compile
port rather than the renderer itself. None of these paths awaits
`compileAsync`; real bounded draws remain the compatibility fallback for
drivers with unreliable parallel-compile completion reporting.

## Consequences

- Loading prepares the shader variants that gameplay actually consumes.
- FX appearance, pool contents, shadows, postprocessing, and gameplay timing
  are unchanged.
- Duplicate effect generation and binding no longer extend deployment.
- The default framebuffer no longer leaves an unused sRGB program family
  resident beside the linear-HDR gameplay family.
- A failed private warm restores visibility, camera layers, render target,
  cube face, mip level, and shadow latches before normal rendering resumes.
- The typed owners reduce composition-root knowledge while the broader
  incremental TypeScript migration continues.

## Verification

    node src/engine/programWarm.selftest.mjs
    node src/engine/garageGpuWarmRuntime.selftest.mjs
    node src/engine/deploymentWarm.selftest.mjs
    npm run typecheck
    npm test
    npm run build
    node tools/loading-budget-probe.mjs --mode battle --maps steppe --tier mobile
    node tools/mobilelap.mjs --production --profile=constrained
