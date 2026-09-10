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

At this checkpoint, the before regression has failed as expected, but positive
integrated CPU/build/native acceptance is pending the shared fleet-release
window. No production performance claim or deployment is made by this note.
