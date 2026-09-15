# Shared match placement checkpoint

Integrated runtime checkpoint: `f9c88b5d7` (source `1f9e87d70`, based on
`a4dcbc10b`). This independent safety release uses the current, unchanged road
and collision inputs below. It is not a completed combined map release.

## Changes

- Solo and authoritative battles use the same deterministic placement owner.
  Objective anchors derive from all authored deployment pads, not roster means.
- Spawns reserve tank-sized areas. Flags, zones, goals, kickoff and Horde pickups
  validate their physical footprints against terrain, liquid and current solid
  collision shapes. Interior/boundary terrain samples are spaced at most 2 m;
  this is sampled safety, not a continuous collision proof.
- Objective access floods one fixed navigation grid from physically connected
  authored pads. Both ascent and descent must work, preventing one-way valleys.
  The original bots' navigation bytes and authored water policy are unchanged.
- Five constrained maps have explicit zone hints; every hint still undergoes
  the same terrain, reservation and round-trip-access checks and bounded fallback.
- Turbo Ball retains its existing 420 m arena limit; complete goal/kickoff
  footprints must fit inside it. Physics and scoring rules are unchanged.
- Failed respawns remain pending with a one-second retry, including inactive
  Horde wave slots and their original health scale. Explicit server test/dev
  spawn overrides remain explicit. No wall-clock or unseeded runtime randomness.

## Verified inputs and checks

Terrain seed: `1337`. Collision-manifest index SHA-256:
`951606233e5d19f2c58571ad8b8d090a8ae0166ab2bd96950ea597d04a14de56`.
The dedicated loader authenticates every referenced shard by size and SHA-256.

`matchPlacement.selftest.mjs` passed all 30 maps × 5 modes: 2,100 sampled
safe spawns, 480 both-team round-trip objective checks, 60 actual Turbo Ball
goal scores, and nine real solo/server composition comparisons. Negative
controls cover wet perimeters, terrain relief, solid geometry, hint invalidation,
blocked seed pads, water barriers, diagonal corners and one-way slopes. Actual
60 Hz controller ticks verify retry suppression, eventual recovery, and Horde
wave-health preservation. Placement receipt SHA-256:
`bb6a86829b9a1cbb728b5a1b94823bca5d5ecbf0fe4c30ca1d469ce1f07e039c`.

Also passed: TypeScript, strict changed-runtime complexity checks, movement
(135), combat (532), spotting (99), match modes, authoritative match,
bot route planner, and all-30-map authoritative bot tests. No browser, native
capture, full test suite or visual playtest was run for this checkpoint.
Root integration with the original Verdant restoration and night-loading
correction repeated the all-map placement/authority/bot and core simulation
gates, full no-emit TypeScript, and the production public build; all passed,
with the same placement/input hashes. No road geometry or collision shard
changes are bundled with this independent release.

## Construction bounds

The objective-only connectivity masks each contain 1,681 bytes. Existing
terrain arrays are shared; a legacy-policy map adds one private blocked mask
and water-edge mask of 1,681 bytes each. Flood queues are construction-local.
There is no per-candidate A* and no new fixed-frame placement scan.

All-map tests cap constructor work at 65,536 height reads, 32,768 normal reads
and 6,000 obstacle queries. Observed maxima were 43,852 / 22,620 / 3,965.
An external single-pass Node diagnostic recorded 150 constructors in 2,937.61 ms
(19.58 ms mean, 88.59 ms maximum). This includes the original navigation grid
reused by callers, excludes terrain/manifests and the later vehicle spawn calls,
and includes 30 near-zero standard-mode constructors. It is neither an
end-to-end entry benchmark nor paired evidence of a performance improvement.
Raw inputs, source hashes and per-map/mode timings are retained in
`match-placement-construction-r1.json` under the external
`environment-recovery-20260907` evidence directory.

## Required integration follow-up

The separate road-continuity work changes terrain/dressing and collision shards
for 22 maps. Re-run this all-map placement gate and the authoritative bot gates
against that integrated road/manifest state before declaring the combined work
complete. Do not carry these input hashes or timing numbers forward as evidence
for changed terrain. Authored hints must fail closed if future geometry removes
their valid clearing; no safety thresholds or known-bad fallback may be waived.
