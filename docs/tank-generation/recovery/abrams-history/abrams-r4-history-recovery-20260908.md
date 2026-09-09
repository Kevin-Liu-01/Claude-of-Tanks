# Abrams R4 historical equipment recovery — 2026-09-08

Status: whole-source authentication repaired; all four affected regressions
pass on the copied-source checkpoint. This is not an Abrams release certificate.

The interrupted lifecycle run failed CROWS, CITV, markings and rack-armor
checks before their geometry assertions. Their shared historical equipment
loader inverted the earlier LOW-detail changes but did not invert the later
cooperative scheduling wrapper. It therefore correctly rejected the resulting
whole-file hash. Five other archived modules still authenticated unchanged.

The independent pre-quality archive is the ignored local
`.qa-dev/fleet-style-performance-20260907/equipment-before-sources.json`, dated
2026-09-07 at 22:08:49.025 UTC. Its original complete equipment file has SHA-256
`f650eb14396da782662cecda11662514608e7afb379703e24637e48a9aa695be`.
No archived source or part fingerprint is rebaselined.

The test-only repair in
[`abramsSourceXR4Equipment.test-support.mjs`](../../src/vehicles/abramsSourceXR4Equipment.test-support.mjs)
removes exactly the reviewed scheduling import, synchronous-drain wrapper,
generator signatures/call, and 28 yield statements. The ordered complete yield
text is separately authenticated as
`f21a6f3020f746568ba6563a14e90036d23fb0676b9d5b6dc31ab71ea2e9be61`.
The existing LOW-recipe inverse then runs, followed by the existing complete
original SHA check on all six files and original per-part geometry hashes.
Any unrelated source change still fails; no geometry/material/pose statements
are discarded by a broad normalizer. Playable runtime scheduling is untouched.

Importing the repaired bridge passed all six original entire-source checks.
The immutable copied-source regression run is
`.qa-dev/reports/small-fitting-frozen-ukd0t4/receipt.json`, using
`/tmp/cot-small-fitting-49mwEl`. The unchanged CROWS, CITV, markings and
rack-armor tests passed through the shared resource queue at 17:28:15.846 UTC.
All 2,311 copied source files remained unchanged; the source-map SHA-256 is
`a7490b278efabfcc03bba602cbba25909238dea1182ec3b979eef2caff9ea5df`.
The completed receipt SHA-256 is
`515f2edb1ce99edcd21347e3e7ff213f4b534a7af7069699fe17cb22bad1313f`.
The linked dependencies are not a separately
copied dependency snapshot; this receipt's source-preservation assertion is
not a claim of a full initial-to-final dependency audit.

This repair addresses four historical-test entry failures, not the outstanding
full lifecycle, final source/visual release, terrain or fleet performance
gates. It makes no new tank playable and changes no quality threshold.

The bounded results include 12 original CROWS equipment fingerprints; 14
actual HIGH/LOW CITV variants with intentional A1 omissions; 28 marking builds,
168 poses and 3,024 complete-quad support rays; and 14 actual rack builds with
1,470 ghost, 228 positive, 24 air and 1,260 seam checks. The rack's 1,116 LOW
chord misses remain explicitly reported by its original test; they were not
deleted or replaced with a different historical fixture.

