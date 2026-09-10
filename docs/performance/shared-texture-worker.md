# Shared vehicle texture worker

The asynchronous vehicle preload uses a bounded worker for the existing base
albedo, height/normal and roughness painters. Ordinary solo preload (the
four-argument `prebakeSharedTextures` call) and explicit camouflage leases both
use this path. Synchronous material acquisition remains supported.

This is a texture-generation checkpoint, not a claim that all loading or
gameplay stalls are eliminated. Browser audio constructors, GPU uploads and
shader submission have separate costs.

## Output and ownership contracts

- `materialPainter.ts` contains the existing seeded painter, parameterized by a
  canvas factory; the worker has no Three.js/scene dependency.
- Every texture quality keeps its original dimensions and seeded feature plan.
  A mutable preload retains its spec-ID cache key and seed. Fixed leases retain
  their spec-plus-pattern keys. Base generation and camouflage repaint use their
  original, different RNG streams.
- Worker output uses separately owned transferable RGBA buffers. The main
  thread performs the original final patch-roughness classification on private
  canvases: native OffscreenCanvas downsampling can differ by one byte, which
  would otherwise change discrete paint classifications.
- New entries publish only complete textures. Promotions preserve the existing
  canvas and THREE.Texture objects, renewing their GPU storage after resizing.
- Publication requires the original cache owner, recipe fingerprint, mutable
  selection fingerprint and repaint revision to remain current. Active repaint
  ownership is counted and released in `finally`, including cancellation and
  errors. A stale worker joins any active repaint before a legacy fallback;
  it never overwrites a newer A→B→A paint merely because the pattern ID matches.
- Caller cancellation is observed after worker completion and after repaint-idle
  waits, before live fallback painting. Concrete leases preserve their existing
  shared drain/cancellation ownership.

## Limits and fallback

One lazily created module worker processes requests serially. It has at most
16 pending requests, a 15-second absolute queue/work deadline, and a five-second
idle shutdown. Failure, malformed messages, font-load failure and unsupported
Worker/OffscreenCanvas features use the original main-thread painter. Font
loading uses the shipped ABC Monument Grotesk Bold asset; no substitute font is
accepted as equivalent output.

`disposeMaterialPainterWorker` drains pending callers and terminates only its
owned worker. Failed private canvases/textures are released without publishing
partial cache entries. No additional fleet-builder imports enter boot.

## Verification

Registered regression tests:

- `src/vehicles/materialPainterWorker.selftest.mjs`: request/result validation,
  bounded queue and deadlines, font/transport faults and worker disposal.
- `src/vehicles/sharedTextureWorkerLease.selftest.mjs`: actual CPU painters and
  public cache owners, fixed and mutable identity/seed/pixel parity, live quality
  promotion, custom/biome/palette edits, synchronous competing acquisition,
  active repaint and A→B→A races, cancellation, allocation faults and cleanup.

The September 10 UTC R14 focused wave passed these plus eight related material,
camouflage, solo-streaming and multiplayer-roster checks. Full typecheck and
public build also passed on that frozen source. Independent review found no
remaining scoped ownership blocker and no complexity/type-policy violations.
Native Chrome/Metal parity passed seven base recipes, five fixed public-cache
cases and two actual four-argument mutable-cache cases (fresh and low-to-High
promotion): every compared RGBA channel and feature plan matched exactly, with
16 successful native worker replies and all owned resources closed. This is
output-fidelity evidence, not a whole-game performance measurement.

The frozen public build also passed actual Battle → night Rematch → Return to
Garage controls, audio and bounded visual-continuity checks. Both battles
contained the full 14-tank, 7-versus-7 roster; Garage returned to its empty battle
roster and complete M1A1 pedestal. Native 1280×720, DPR 1, High quality, render
scale 1, trim 0, SMAA High and FSR1 were unchanged. There were no page, console,
graphics or cleanup errors. The application created three material workers;
that observer proves construction, while the separate parity probe proves
successful worker replies and exact public-cache outputs.

This did not eliminate transition stalls. Largest callback intervals were
250.7 / 134.3 / 51.9 ms for Battle / Rematch / Garage, respectively; total action
times were 6659.3 / 5571.4 / 357.3 ms. These raw intervals are not a quiet-machine
frame-budget certification or evidence of a causal speedup. The historical
214–319 ms gameplay-stall cause also remains unproven.

The earlier R13 real-game probe correctly failed its worker-execution gate:
only fixed identities were dispatched, while normal solo warming uses mutable
defaults. The regression tests and R14 integration explicitly cover that caller
instead of changing its camouflage identity to fit the worker.
