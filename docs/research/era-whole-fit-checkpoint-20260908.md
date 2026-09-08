# Invocation-local complete ERA fit reuse — 2026-09-08

Status: **bounded checkpoint verified**. This is a bounded
construction-cost change, not completion of the owner's fleet geometry,
material or switch-smoothness work.

## Runtime change

The existing complete fitting calculation (position collection, PCA, fallback,
exact facets and deduplication) is unchanged. Repeated calls for the same
ordered parts, signed side and all six authored-frame coordinates can reuse
its result within one build. Every hit compares current logical position
values, including unversioned edits and normalized/interleaved attributes.
Callers receive independent nested surface arrays; no model owns another
model's geometry or mutable output. Any explicitly annotated or mixed part
list bypasses reuse and executes the unchanged original calculation.

The memo closes in `finally` at the receipt-stage boundary, retaining no part
lists, frames, materials or GPU resources across tank builds. This is not a
global geometry/model cache and does not alter per-frame rendering, track
positions, materials, ERA hit surfaces or spent/reset semantics.

## Focused evidence

The selftest authenticates the old fitting block at immutable upstream
`e8ef757e231ae2792292eb98f1d066fd5815d2df`, SHA-256
`c7b1c143893cdab08bd99fbd41c033f25a1fbc1028ac48d088b2e8c503ea0641`.
It proves the current unwrapped calculation and complete collection/PCA
functions remain byte-exact. Mutation, input identity/order, signed zero,
attribute replacement, annotation bypass, thrown calculations, nested result
ownership and borrowed-resource disposal are independently tested.

Forty actual Node builds compare HIGH/LOW and two consecutive build cycles of
M1A2, Challenger 3X, Challenger 2, Revolution and T-90M X. Every complete
production fitting result is independently recomputed. The original-return
and memo-return processes also retain exact complete geometry, instance/LOD
data, material properties, attached-decoration decisions and ERA receipts.
Every invocation closes before returning its tank. Original M1A2 reduces
complete calculations from 110 to 57; the authored T-90M X path bypasses all
eight calls. These are operation counts, not measured browser latency.

The first development attempt was rejected: it chose Revolution as an
authored-ERA bypass witness although that path did not run, and optional
decoration construction lacked a Canvas fixture. The corrected test uses the
actual annotated T-90M X path and requires real decoration attachment to
complete, with its exact decision summary included in parity. The inert
Canvas fixture permits Node material/decoration construction; it cannot
certify painted pixels, lighting or GPU performance.

## Scope and release

Earlier integrated-WIP native A/B/A evidence for the same typed helper is
documented in `fleet-construction-performance-20260907.md` in the unfinished
fleet worktree. It is supporting historical evidence, not a frozen current-main
claim. This independent checkpoint completed all 14 guarded checks at
`0c29a8b7129eb7c171f2044559d23ad6d90d5585` (which includes the published
loading receipt option): whole-fit and descriptor parity, authored ERA faces,
bindings, registration, activation, factory core, Garage presentation, night
lighting, test registry, import integrity, typecheck, public build and native
switch smoke. Receipt `.qa-dev/era-whole-fit-checkpoint-esDaZt/receipt.json`
finished 2026-09-08 19:22:43 UTC with all 32,298 source/config/dependency/tool
inputs unchanged, SHA-256
`07511e72101e9bd72ff729a425bbef6b31d76fb6fff91330256784a260a5b96b`.

The first complete run at `era-whole-fit-checkpoint-KW6bB7` passed its 14
checks but **failed the input guard** because a concurrently finishing
read-only React Doctor scan updated its dependency cache. That receipt is
retained, not accepted or fixed by excluding the cache. The full run above was
repeated after the scan finished. React Doctor's changed-file scan found no
issues (84/100); its full scan remains 44/100 with 563 existing findings.
Neither score is a fleet release gate or a reason to suppress diagnostics.

Native smoke completed six of six selections, including warm revisits,
without page errors: median 132 ms / maximum 154 ms **JS-visible readiness**.
The final native screenshot was inspected. This tool stages the production
pedestal, so the nation rail/dossier is intentionally not switched with it.
The raw tick gaps were p95 600.4 ms / maximum 614.7 ms; the settled Garage is
event-driven and these figures include intentional idle intervals. They are
not active-only freeze evidence or proof of presented-pixel latency.
Whole-fleet geometry and actual switch smoothness remain separate open gates.

Final integration includes upstream `139dda89450213bef3a13a006ad542e826dec037`,
including its postprocessing sizing change and the verified FIFO fairness fix.
At candidate `47614241d4e4fa7db4f3a08a067a4f6b0d64d5c0`, all vehicle sources,
ERA activation and maintained probe bytes remained exact to the full 14-check
receipt. Six additional checks passed: whole-fit parity, registry, imports,
typecheck, public build and fresh native smoke. The 32,303-input guard remained
unchanged, SHA-256
`e2e51ad981819c08a9d658aadba77ad058c00404a2d53a5a6f981edafe8a8581`;
receipt `.qa-dev/era-whole-fit-checkpoint-hCNWS3/receipt.json` finished
2026-09-08 19:28:20 UTC. Only this evidence paragraph changed afterward.
