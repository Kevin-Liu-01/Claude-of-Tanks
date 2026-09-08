# T-90M source-X preservation: published lamp-pose history

2026-09-08 — test-only correction. No runtime geometry, lighting, materials,
armor, source model or release threshold changes.

The ordinary `sourceXFleet` regression expected the independently recorded
pre-X HIGH fingerprint `ffbd40d4`. Published `origin/main` at
`c5ca781e2966d27ddace5116b2c6ea518ef20cf2` instead builds `27bb658d`.
The same failure occurred in the separate seven-vehicle bodywork candidate.
That candidate does not edit the production T-90M geometry.

## Authenticated cause

Commit `37de0b6aa784f17c9491949ce92d7bdf979ff7a6`, “seat hidden bow lamp
assemblies,” physically reseated four T-90M `hullGlass` lenses. The prior
discs faced upward at Y=1.36/Z=2.76. The repair rotates them onto the canted
housing's front and gives their rear stock a finite lap into that housing.
The geometry fingerprint includes position buffers and instance/world
matrices; ignoring a new `nightEmissionMask` attribute cannot explain or
repair this physical change.

The complete `profiles/t90.ts` post-repair SHA-256 is
`db8279500f86e1165baf4b945d3607d621554f9dc75be720678fb3d80751d97f`.
Removing exactly the published replacement block and its new import restores
the independently committed pre-repair SHA-256
`a93e505c9c98e06ad45c4b189ec6228864472651f9c0b245d2cb4d6a51500e50`.
It is measured from parent commit
`56c98e286ec273199b41bce05d96c54d84b78501`, not generated from the candidate.

## Bounded test bridge

`historicalT90MLamps.test-support.mjs` verifies both complete source hashes,
then intercepts only the four exact canted-lens calls for the **historical
test construction**. Every incoming geometry's complete attributes, indices
and semantic metadata must match one of the two documented local offsets.
Side, parent-frame transform, order and count are checked. The previous
primitive and pose are restored only for these four calls. Any unrelated
source change, unexpected geometry or missing/extra lamp rejects the inverse.

The runtime builder is always restored in `finally`. Ordinary gameplay and
every physical-seat assertion use the actual repaired vehicle. The original
`ffbd40d4` golden is retained unchanged; no wildcard buffer exclusions or
generic new expected hashes are introduced.

Fresh Node construction results on published `c5ca781e2`:

| Detail | Current mounted lamps | Exact historical four-lamp inverse |
|---|---|---|
| HIGH | `27bb658d` | **`ffbd40d4`**, unchanged independent pre-X golden |
| LOW | `7c104eae` | `a6dd1b2b`, diagnostic only, not a new historical golden |

HIGH/LOW physical checks retain all four current forward-facing emitters,
their hull ownership through native LOD groups, unobstructed apertures and
positive lens-stock overlap with actual housing surfaces. They do not
reintroduce the old upward-facing discs. The existing stricter night-light
face/quarter-view tests remain unchanged.

`historicalT90MLamps.selftest.mjs` and the complete `sourceXFleet.selftest.mjs`
pass. The latter still checks all thirteen original geometry histories and
all thirteen independent X model/identity/combat registrations. These are
Node procedural tests, not native GPU or whole-game performance captures.
The parent release must still rerun its complete composed checks; this
test-only correction is not a waiver for any other failed regression.
