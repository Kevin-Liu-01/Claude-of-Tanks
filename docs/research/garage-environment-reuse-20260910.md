# Garage return environment work — 2026-09-10

## Published baseline and reproduced limit

Loading release `2e2fa5999db7617e407162aa557eb0e42c55a803` landed non-force
on main. Vercel deployment `dpl_HCrFura25r2D12FhY9GgsT5nJcyD` became READY;
the production root displayed `v1.0.0+g2e2fa5999` before and after verification.
No unrelated vehicle files or shared dirty checkout were changed.

The unprofiled production acquisition
`/private/tmp/cot-interactive-baseline.gsRCvU/loading-final-production-r1/report.json`
passes actual Battle, day/night rematch and Return-to-Garage controls, shared
audio ownership, warm/source readiness, and owned cleanup. Application and
cleanup errors are empty. All three native screenshots were inspected, with
complete day/night terrain, tanks and Garage presentation. This proves those
flows, not smoothness.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 3.2 ms | 11,345.6 ms | 160.0 ms |
| Battle Again | 202.5 ms | 9,025.4 ms | 217.1 ms |
| Return to Garage | 155.3 ms | 522.7 ms | 129.2 ms |

Production report SHA-256:
`7f7caaf698e5a5c30d22bd7ca0f518c4eb85d8bdcbac42effc84ce94cc154d24`.
Served HTML (unchanged across the run):
`4c15536b96e6a7abe62da652faadac175ab8a49ee643b606b34f31ff3d447d73`.
Acquisition:
`0c1ae77bb2d11603fc11e0416a4628ab9979229d32e7be6f9d7ee9396679052c`.

The 217.1 ms rematch gap includes a 195.9 ms scheduler continuation. The
`worldServices` stage records 196 ms. Garage return similarly records 93 ms
world services and a 93.2 ms continuation within its 129.2 ms gap. These match
the bounded stage that activates the selected Garage environment. They do not
identify every leaf inside the continuation or explain the old 214–319 ms
gameplay observations.

The cold Battle gap instead overlaps construction of the `merkava1b` actor:
its construction record begins at 9,673 ms and reports 221 ms non-await elapsed
work across checkpoints; the overlapping scheduler continuation is 158.3 ms.
That is a separate vehicle-construction cost, not evidence for the Garage fix.

## Source-confirmed repeated operation

`garageReturnRuntime` awaits `world.ensureGaragePlacement`, which calls
`garageEnvironmentPresentation.activate`. Its sky adapter first resets the
battle-atmosphere owner. Reset reapplies the saved authored battlefield preset
through `sky.applyPreset`, including a complete PMREM environment bake. Only
afterward does the adapter apply the selected Garage's presentation-only sky.
The existing bake destroys the previous target on every call, even when an
identical day environment was prepared before the night match. The later
Garage-light reset is idempotent; it is not another such bake.

A separate same-release CPU-profile acquisition, `loading-production-profile-r1`,
passes functional/readiness checks and retains all three original profiles.
In its Garage-return profile, the activation stack has 30.0 ms inclusive sample
weight and `applyPreset → bakeEnvironment` accounts for 28.7 ms. Profiled
world-services stages are 34/30 ms on rematch/return, not the unprofiled
196/93 ms. Profiling and machine state differ: these values are attribution
evidence, never a controlled speedup comparison or proof that all of the
unprofiled pause belongs to PMREM.

## Implemented boundary

The follow-up retains at most two validated procedural environment render
targets per Sky owner. An exact repeated sky/sun/renderer/color key reuses its
target; a third key evicts the least recently used target. Uncacheable inputs,
XR presentation and the dormant HDRI experiment use an uncached active target
without accumulating two cached targets beside it. Environment strength is
installed on each use rather than hidden inside the baked-key identity.

Every installation still runs the existing mobile validity check with the
current authored radiance. Invalid textures retain the compensated-ambient
rescue and are evicted, not saved as reusable results. Context loss, a changed
context or `renderer.info` identity, and external target/texture disposal
invalidate retained resources. The cold bake uses the unchanged Sky shader
configuration (frozen source hash in the test), scale and PMREM conversion.
There is no quality, resolution, shadow, simulation or vehicle-geometry change.

Failure recovery preserves a still-live previous environment, never restores a
known disposed texture, drains accessible owned resources, and restores the
renderer target/cube face/mip, XR enablement, tone mapping and auto-clear. One
pinned-Three limitation remains: `PMREMGenerator.fromScene()` can allocate its
private output and throw before returning it. Its public API does not expose
that output for disposal. Generator scratch and private Sky resources are
released; this change does not claim to repair that inaccessible allocation.

## Qualification

`sky-environment-cache-cpu-r1.log` passed four focused FIFO tests. A subsequent
integration run passed all 12 affected tests (including exact reuse, context,
external disposal, invalid-texture rescue, chained rollback, renderer-state
restoration, Garage/atmosphere ownership and registry discovery), typecheck with
core-unused checks, and the public/localized production build. The registry now
has 957 ordered checks. This is focused coverage over the earlier cumulative
956-check baseline, not a claim of an uninterrupted new full-suite run.

The first integration run stopped on one maintainability failure: cache
`install` cognitive complexity 29 exceeded the strict limit below 22. Its
recovery helper was selected for extraction; the failed log is retained at
`/private/tmp/cot-interactive-baseline.gsRCvU/sky-environment-integration-r1.log`.
The post-extraction integration (`sky-environment-integration-r2.log`) passes
all 12 affected tests and typecheck again. Both changed runtime files pass the
strict metrics gate: 61 functions, zero complexity violations, zero explicit
`any` or `unknown`. The initial changed-file Doctor scan passes 100/100 over
its two discovered tracked files; this is not a whole-repository score. Native
qualification follows below when run.
