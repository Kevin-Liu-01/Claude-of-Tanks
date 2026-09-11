# Staged-FX program-preparation design and validation

Native follow-up: [six-run comparison and remaining limits](fx-program-preparation-ab-20260910.md).
The design below records the original candidate boundary. The native follow-up
qualifies the narrow first-use improvement, not whole-game smoothness.

Base: `d66f7b03d8e5636d34842f256494d73f728c5bdf` (documentation/test-only
fast-forward from runtime baseline `3e6ff4978e4a96abde8aecd99c07c2ee9feb3371`). Candidate branch:
`codex/fx-reflection-candidate-20260910`. This is an isolated experiment, not a
released improvement. The frozen baseline worktree and production are unchanged.

## Hypothesis and limits

The parent investigation attributed substantial sampled work beneath isolated
FX draws to native active-uniform reflection, with a smaller texture-upload
component. Its separate native captures are observations, not a matched A/B
result. Preparing selected staged FX programs before their first private-target
draw may move reflection across covered paint opportunities. It cannot split
one synchronous driver query, guarantee faster native reflection after a link
readiness query, or prepare texture uploads. No performance win is claimed.

The strict owner snapshots each selected material's full finite program cache,
including historical variants. This can prepare more variants than the next
draw actually uses and can increase total loading work. Native A/B must compare
the full preparation-plus-draw interval and complete loading response, not just
the now-later draw maximum. Match actual roster, weather, viewport, quality,
build hashes, and acquisition protocol before causal conclusions.

## Candidate ownership

The previous standalone `deploymentFxPrograms.ts` helper is reused. The solo
deployment owner now performs its strict program steps while the actual staged
FX root remains visible, before hiding it for the unchanged isolated draw
cohorts. Preparation and draws receive one captured memoized offscreen warmer,
so program keys use the exact same private linear HDR target. No raw
`compileAsync`, new render target, shader change, or rendering-quality change is
introduced. The existing 5-second deadline and 1024 native polling budget remain
owned by `programWarm.ts` and are not extended or retried by the helper.

Each strict checkpoint restores native target/face/mip and camera state before
the real `nextPaintFrame` frame-plus-task opportunity. The existing intentional
staging lease (visible staged FX and armor, enabled FX camera layer) remains
owned by the original staging/restoration transaction; no temporary isolation
state or private target binding spans an await.

A narrow captured lease checks battle phase/generation, FX pool and root
identity, root attachment, memoized warmer identity, renderer info/context
identity, and live context. Supported cancellation restores the originally
acquired pool and borrowed armor before propagating. The production FX root is
readonly (`FxRuntime.group`, `effects.ts`) and constructed once; this candidate
does not invent a same-pool root-reassignment cleanup policy.

Native incomplete/error results remain explicit diagnostic outcomes. The
existing isolated draws are the fallback and still determine actual opening
and destruction readiness. Program preparation alone never marks readiness.
Failed draws leave retry eligibility intact; cleanup failures still reach
covered entry recovery instead of reveal. Existing old covered-success receipts
are cleared when a new deployment generation starts.

## Receipts

`__BATTLE_COUNTDOWN_WARM.deploymentFxPrograms` records selected object count,
strict result/reason/pending count, native submission/query/reflection timing
and program counts, step count, synchronous step total/maximum, elapsed total,
and a bounded optional error. It is published before awaits so cancellation
retains paid work and an explicit invalidated result.

`deploymentFxForwardWarm` retains the established successful-draw batch count,
draw maximum/total, completion flag, and bounded error/cleanup error. New
`programAndDrawTotalMs`, `programAndDrawSyncMs`, and `programAndDrawMaxMs` expose
elapsed preparation-plus-draw work separately from synchronous steps. Draw
step accounting includes failed native attempts and isolation setup/cleanup;
waits are never described as CPU work. Whole deployment compile/staging elapsed
remains separately available as `deploymentCompileMs`.

## Validation boundary

The helper regression and standalone solo integration regression use actual
production program owners, offscreen target, FX staging, isolated cohorts,
armor cleanup, coordinator, and frame-plus-task scheduler. Native I/O is
controlled; these checks establish lifecycle/order/receipt correctness, not
native latency, pixels, texture-upload readiness, or GPU/display completion.

Existing deployment/loading/FX-readiness fixtures now expose stable lifetimes
and explicitly incomplete synthetic preparation rather than fabricating native
success. Focused engine tests retain strict deadline, polling and private-target
coverage. Validation logs and the candidate build will be retained locally; the
parent owns native baseline/candidate comparison before any release decision.

## Frozen candidate validation

The single FIFO batch in `.local-evidence/fx-reflection-candidate-final-r3.log`
passed all 11 focused selftests, including 18 actual-owner strict-preparation
integration cases, existing FX readiness/loading coverage, strict engine owners,
the lazy-runtime mutation controls, and test-registry discovery. Both changed
production modules pass strict metrics: 43 functions, zero complexity violations,
zero explicit `any`/`unknown`. Full typecheck/unused-owner checks and the public
build pass. The public `dist/index.html` SHA-256 is
`8dcf412935ebcc9cb0c2b4026fcd531ba33e662c0fb729782a3f5469be48589a`.

The preserved initial focused log exposed a detached FX fixture before staging;
the fixture now uses its real scene attachment and positively asserts staging
before cancellation cleanup. Final r1 preserved a source-contract whitespace
failure; r2 preserved the TypeScript iterator-return signature failure. These
failures were corrected without weakening readiness assertions or thresholds.

An independent review identified the final helper-to-caller Promise handoff as
another ownership boundary. The caller now repeats the full lease assertion
before publishing readiness. Actual cleanup-queued phase/context invalidation
cases pass, and the reviewer verified the correction.

Read-only cached React Doctor 0.9.13 reports 49/100 on seven changed tracked
files, the same numeric score as the earlier shipped scan but a different
scope. Its two loop-await warnings are the deliberate sequential covered paint
opportunities after program submission and isolated draws; parallelizing them
would break this contract. The changed-scope scan does not cover untracked new
files, which are covered by the explicit focused tests and strict metrics above.
No scanner settings or rules were changed. The Three.js skill guided lifetime,
native-state restoration, and visual-evidence boundaries; no new visual or
performance acceptance claim is made from these CPU checks.

After freezing the build, the candidate fast-forwarded from `1a28487e6` to
`d66f7b03d` (only an upstream loading-screen test and research document).
`loadingScreens.selftest.mjs` now follows the extracted helper and caller,
preserving its two unconditional-readiness mutation controls and adding a
missing post-await lease-check control. Its focused FIFO run passes in
`.local-evidence/fx-reflection-loading-screens-r1.log`. No runtime or build
changed; the public index hash above was reverified unchanged.
