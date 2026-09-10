# Late effects and main-scene light-state ownership

## Cause and scope

The retained `rematch-pacing-gameplay-profile-r1` CPU profile showed repeated
`WebGLPrograms.getParameters` work during ordinary gameplay. Its samples are
diagnostic weights, not native elapsed-time measurements and not proof of the
cause of the historical, untraced 214–319 ms stalls.

The pinned Three r185 implementation keys `WebGLRenderStates` by scene identity
and render-call depth, not camera layers. `LateFxPass` previously rendered the
same scene at the same depth with only layer 30 enabled. That excluded the
world lights and replaced the shared light-count state. On the next main draw,
the world lights returned and changed that state again. Lit material validation
then requested a program even when its material version had not changed. The
cached-program lookup itself follows `getParameters`, so shader cache hits do
not avoid all of this CPU work.

The regression uses the actual pinned `WebGLRenderStates` and `WebGLLights`
implementations. Before integration, three main/late/main frames produced three
different main light versions where the stable-state assertion requires one.
This is a reproducible source mechanism; it does not attribute every profile
sample or shadow-pass cost to this mechanism.

## Implementation contract

`LateFxSceneView` retains one separate render-state key, inheriting the real
scene's current properties and exact child graph. It does not clone meshes,
materials, lights, textures, or transforms, and never reparents an object.
Matrix updates forward to the real scene receiver. The existing matrix reuse,
resolved-depth copy, color handoff, render target, camera, effects, and quality
settings are unchanged. There is no extra render call or per-frame allocation.

The active-effects path performs an allocation-free eligibility walk, pruning
invisible ancestry. Custom scene/object/material render callbacks retain the
original scene argument and receiver through the original render path.
Layer-visible automatic LOD, shadow-casting effects lights, transmission, and
unsupported camera/background states also retain the original path. This
avoids changing callback contracts or introducing transmission-target ownership.
The extra eligibility traversal has a cost: native gameplay measurement must
establish the net benefit rather than assuming it from source inspection.

## Verification and acceptance

CPU coverage includes live property and child replacement, shared materials,
matrix reuse and root receivers, callback identity and original exceptions,
invisible ancestry, override materials, unsupported states, renderer cache
reset, and restoration after failed draws.

The maintained native matrix fixture preserves its twelve cases: three moving
frames across MSAA 0/4 and both AO-handoff shapes. The reference intentionally
uses the original-scene callback path; the candidate uses default callbacks
and must expose a distinct, retained scene key at the actual direct draw.
The transparent direct-draw observer samples the current transform without
adding a callback that would disable the optimization. Exact pixel parity and
all existing hidden-FX, missing-depth, stale-geometry, and stale-camera negative
controls remain required. This fixture certifies pixels and ownership, not FPS.

The before regression failed as expected. Both positive integrated
`lateFxSceneView` and `lateFxColorHandoff` CPU checks passed on revision
`be1844806` in the September 10 17-file focused batch (all passed).

## Native and integrated profile qualification

The later integrated `0ca81d5c15c6a9f6a18b7ee15d18885231245c2c` build passes
all twelve native moving-frame comparisons with exact pixel equality and all
four negative controls detecting their intended failure. Evidence:
`/private/tmp/cot-interactive-baseline.gsRCvU/late-fx-scene-view-native-r1/report.json`.
Chrome 151.0.7922.47 / native ANGLE Metal Apple M5 Max; no browser/server or
capture lease remains open. The retained source-hash receipt is
`237928f98bc85dc054df07a963d2da23deb2930fa3fd72e664a5f52ba65b1641`.

A bounded CPU-profile comparison uses conservative aligned gameplay windows
from `rematch-pacing-gameplay-profile-r1.json` and
`integrated-gameplay-profile-r1.json` in the same evidence directory. Both
use Chrome151 and the same pinned fourteen-tank roster and control sequence.
The integrated build contains other changes: this is supporting diagnostic
evidence, not an isolated one-patch causal or FPS experiment.

The aligned calculation includes only sample intervals guaranteed inside
gameplay for every feasible profile/page alignment. Earlier page-start bounds
are 1475.600–1517.402 ms; integrated bounds are 1429.236–1476.136 ms. Retained
weights are 59,965.141 / 59,959.625 ms. Raw profile SHA256 values are respectively
`25a653af072e37d34c678ada280521f3b783fc5cc745a074b55bd26405924ebd`
and `5b2745f934047fd20a60caee7eaf7ba5cd7156480f071a1e297c1e0c4140d48c`.

| Sampled self work, ms | Earlier profile | Integrated profile |
| --- | ---: | ---: |
| getParameters, main forward | 2261.454 | 791.074 |
| getParameters, shadow | 450.969 | 431.105 |
| getParameters, late effects | 5.533 | 4.519 |
| getParameters, all | 2717.956 | 1226.698 |
| getProgram, all | 741.139 | 353.440 |
| Object3D.updateMatrixWorld | 660.372 | 690.678 |
| Garbage collection | 148.700 | 116.088 |

Main-forward getParameters weight is lower in all six ten-second bins. The
new eligibility walk is not free: `canBorrowObject` has 258.571 ms self weight,
and all identifiable selection work totals 272.099 ms (about 0.076 ms per
submitted frame on average). These are statistical profile weights, not
direct measured function latency or guaranteed per-frame maxima. There is no
allocation-profile or leak proof in these samples.

The new profile has no long tasks ≥50 ms during its sixty-second released
gameplay window, but its own speed certificate is refused for profiler
overhead and its unchanged p99 budget is missed. The unprofiled followup
passes p99 but still fails three other budgets. See the
[complete qualification and limits](interactive-performance-qualification-20260910.md).
Historical untraced stalls remain unattributed; these results do not establish
that all graphics, movement, background-host or native startup lag is resolved.
