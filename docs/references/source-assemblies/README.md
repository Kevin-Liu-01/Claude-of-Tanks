# Replaying approved assembled comparison sources

These five recipes prepare local comparison references only. They do not build or import any playable vehicle geometry. The owner approved correctly assembled supplied targets on 2026-09-18; independent reviewers accepted these static assemblies in [the British/Kurg review](../../history/research/british-source-assembly-independent-review-20260918.md) and [the BMP/K21 review](../../history/research/bmp-k21-source-assembly-independent-review-20260918.md).

Each dated recipe pins the raw input hash, original canonical hash, exact component or node selectors, source-only receiver measurements, operation, output hash, retained source registration, and review identity. The original files and historical failed comparisons remain valid historical evidence. The derived files have distinct `_assembled_20260918.glb` names under the already ignored `public/models/community-candidates/` directory; public builds strip that entire comparison-source directory.

With the five original canonical `_source.glb` files available locally, run:

```sh
node tools/source-assembly-replay.mjs --ids=fv510_milan_x,griffin50_x,kurganets25_x,bmp3m_dragun125_x,k21_x
node tools/source-assembly-replay.selftest.mjs
```

The replay builds and verifies the expected bytes before writing each target, rejects drifted source/selector/recipe/output hashes, and refuses to replace an existing different derived file. It never overwrites an original. Whole-node moves preserve every binary chunk. Mixed-mesh operations retain every unaffected expanded triangle attribute and change only the selected components. Local proof and image paths are archival evidence links; replay does not require those private captures.

For a fresh checkout, obtain the owner's original local input matching `source.rawFile` and `source.rawSha256`. If the original canonical file is missing, create an ignored normalization recipe containing `id`, `sourceSha256: source.rawSha256`, and the dated recipe's `registration.axes`, `registration.scale`, and `registration.translation`. Run the existing `tools/source-x-oracle.mjs --prepare=<raw-local-file> --recipe=<ignored-normalization-recipe>` only for that missing original. It normalizes the complete source without a component selection. Verify the resulting canonical bytes against `source.sha256`; a mismatch must be investigated, not substituted into these certificates. Then run the replay above. Keep any existing original file intact.

Only the five certified file hashes and reference paths change in registration. Original hull, turret and gun datums, source axes/scale, comparison-camera policy, and all exemplar score floors remain unchanged. The module test pins all unrelated certificates as well as the five original frames and exercises literal geometry plus malformed input controls. Accepting a reference assembly does not qualify its procedural model: fresh comparisons and normal release gates still apply.

Warrior's four axial variants are accepted seated-state counterparts, not exact rigid duplicates; their original bytes remain preserved. Kurg's nearly coincident moving/fixed step tabs both remain, with no collision-free claim. All five approvals concern a static assembled pose, not hinge animation or manufacturer dimensions.
