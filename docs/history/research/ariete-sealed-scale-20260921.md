# Ariete C1 sealed census after the owner-requested enlargement

The first C1 release attempt failed against its old 154-pixel ledger. A controlled replay proves that the increase is caused by applying the requested 1.12 scale to existing wheel surfaces. It is not a new hull opening introduced by the C1 construction or fill changes.

Independent review accepted this **C1-only reference-frame rebase**, and the root applied it on 2026-09-21. The reference is the independently enlarged historical model's 196 pixels, not the candidate's 192 pixels. All gate thresholds and other existing vehicle rows remain unchanged. The pinned JSON proposal is preserved verbatim as historical evidence.

## Authenticated comparison

The baseline is commit `b50b20878e2ec9218e522a874adff50e45e60e2e`. Its source/tools/package and previous ledger were archived into an ignored directory before native construction. A fresh child built that immutable baseline, then a separate fresh child built the current C1, each before and after loading its real generated fill. Both recorded zero input drift. The baseline cold triangle count and every ledger metric reproduce the committed C1 row exactly.

The enlarged baseline multiplies all nine coordinates of every collected triangle by exactly 1.12 about the existing canonical origin. It changes no topology, material-side flags or equipment inventory. The factor comes from the owner's size instruction and the retained source-registration recipe, not a fit to the candidate. The source GLB is provenance for the resize; it is not used as playable geometry or as the sealed native baseline.

The private diagnostic copied the committed sealed raster functions without algorithm changes. The sole instrumentation exposes the existing per-pixel owner/front/back arrays in the return value. Resolution 256, all 33 views, minimum cluster area 6, seam tolerance 4 mm, inverted-part cutoff 80 mm and ledger slack `max(12, 10%)` remain unchanged.

| Native input | Triangles | Opening pixels | Opening views | Inverted pixels | Transparent-only pixels |
|---|---:|---:|---:|---:|---:|
| Previous, cold | 96,142 | 154 | 0 | 6,129 | 0 |
| Previous, loaded fill | 97,714 | 154 | 0 | 6,129 | 0 |
| Exact previous triangles ×1.12, cold | 96,142 | 196 | 0 | 6,125 | 0 |
| Exact previous triangles ×1.12, loaded fill | 97,714 | 196 | 0 | 6,125 | 0 |
| Current enlarged C1, cold | 96,202 | 192 | 0 | 6,128 | 0 |
| Current enlarged C1, loaded fill | 96,418 | 192 | 0 | 6,128 | 0 |

## Per-pixel cause and physical location

All 42 added pixels in the exact scaled baseline were already classified as **inverted stock** in the old model. Their back-to-front ray depths change from 71.458–79.849 mm to 80.033–89.431 mm, crossing the unchanged 80 mm distinction between a thin inverted part and an opening. Twenty pixels belong to each `arieteSuppliedRecessedWheelFace` side; two belong to `gearEndWheelHardware`. Every one retains an actual back hit and an actual deeper front hit.

For example, the positive-X recessed wheel in `cube_-1_-1_0`, pixel 72,76, has an enlarged first back hit at approximately [1.551,0.384,-1.558]m and a front hit at [1.493,0.326,-1.558]m. Their 82.395 mm ray separation was 73.567 mm before scaling. The end hardware in `cube_-1_-1_-1`, pixel 34,128, changes 77.693→87.016 mm, with first hit approximately [1.690,0.841,-3.201]m. The negative-X counterparts are symmetric. Full finite ray origins, directions, hit owners and depths are retained in the pinned private summary.

Current loaded C1's 192 opening pixels are a strict subset of the enlarged historical baseline's 196. It adds **zero** opening cells relative to that independent reference. The four removed cells are two track-pad raster-edge samples and two wheel samples reclassified to inverted stock. Loading the new fill changes no opening cell. The new 120 mm bore and MRS relief introduce no additional sealed-census hole cells.

This is a scale-dependent classification result, not a claim that the inherited wheel winding is correct. The recessed wheel-face payload has negative signed volume and already shows thousands of inverted pixels in the old ledger. That retained imperfection is visible in the orange diagnostic pixels; it is not erased or relabeled in this proof. No new missing hull stock is demonstrated by the 38-pixel aggregate regression.

## Applied single-row rebase

Use the independently enlarged previous **cold** model, retaining the previous ledger's cold triangle-inventory convention:

```json
{
  "sealed": true,
  "openPx": 196,
  "openViews": 0,
  "insideOutPx": 6125,
  "seeThroughPx": 0,
  "tris": 96142
}
```

The existing gate still requires sealed status and limits regressions above this correctly sized historical reference. No other vehicle row changes. C2 and the separate rear-coupler source-air rule are outside this rebase. The original release failure stays preserved. A final actual release run is required after the author's separate structural-LOD hierarchy correction; these counts authenticate the acquired payload, not later unmeasured builds.

## Evidence

- Durable scalar/per-pixel receipt: `docs/history/research/ariete-sealed-scale-20260921.json`, SHA256 `f66da442333e6bc00101802cc15d037a86d930bad2cc4cebae61c2176505c81d`.
- Complete local proof: `.qa-dev/ariete-integration/sealed/replay-r1/summary.json`, with six result JSONs and diagnostic PNGs beside it; exact hash is recorded in the durable receipt.
- Native triangle dumps: `.qa-dev/ariete-integration/sealed/{baseline,current}-tris.json`; exact input/file hashes and before/after source inventories are retained.
- Original failed release: `.qa-dev/ariete-family/release-r1.log`; hash retained in the durable receipt.
- Resize provenance: `docs/history/research/second-wave-registrations/ariete_c1_x-enlarged-20260921.json` and its registration receipt. Canonical source SHA256 remains `1112ea55fab10920e78063a4aec4a6b5e5695751f176bfabc3b72a605bbf0c68`.

Independent review: `.qa-dev/ariete-reference-review/sealed-scale-independent-review.json`, SHA256 `a18e294c51bc852f5019d4e8bd393a2d22037e5162dbcef85c355782a4728c34`. It authenticated 2,917 archived source/tool/package/ledger files against the baseline commit and recomputed the pixel-set comparison. Final release status is recorded in the family work packet.
