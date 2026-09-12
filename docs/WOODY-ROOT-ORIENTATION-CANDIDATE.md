# Woody-root orientation — published scoped correction

Base: `7351f0b4ad92c97be03e7be0bb7a700a3f332484`; isolated
`codex/woody-root-orientation-20260909`. Crop silhouette work remains separate.

The personally viewed Coastal foliage image in
`canopy-far-seams-native-r1.JRwpnz/visual/candidate/shots/coastal/foliage.png`
shows blunt lateral tabs around dark flared trunk bases. Source confirms the
cone's +Y apex was rotated inward, leaving its broad capped end outside.

Only the woody branch of `addRootButtresses` changes: reverse the axis and
cancel the apex's downward offset after the existing .48 vertical scale.
Wide caps remain inside the flare; outward tips sit at local y=0 before the
ordinary instance placement sinks the tree .06m. Species lean and sloped
terrain remain unchanged: this is not a certificate of contact on every slope.

Same cones, 34 vertices/72 indices per root before the existing merge; same
root count, UV/color/flex bytes and RNG draws/tails. No new mesh, material,
texture, retained array, shader sample, or frame-loop work. One additional sine
per woody root is construction-only and unmeasured; no performance claim.
The tidal-Mangrove branch is untouched.

First focused packet: `woody-root-focus-r1.v39t9Z` under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.
New test PASS: 125 actual cones and 39 complete near trunks, old-inward negative,
exact tidal-root control, RNG/storage/UV/color and existing grounding bounds.
Existing trunk-quality and vegetation-lighting tests, TS7, core-unused and
strict metrics PASS (zero violations). Scoped Doctor: 100/no findings for the
tracked runtime/registry; it did not scan the then-untracked new test.

The original tidal-Mangrove test FAIL is retained: its three ordinary woody
trunk goldens intentionally change with this correction. Root reviewed the
actual output in `woody-root-digests-r1.nyftu3/digests.log` and approved only
these expected-value changes. No historical runtime substitution or assertion
bypass is committed; all current tidal/RNG/placement assertions remain.

| Seed | Previous ordinary trunk SHA256 | Current ordinary trunk SHA256 |
| --- | --- | --- |
| 2242 | `612546ebfe9bd3d7c6f414246d841afbf660058f0a2bc08ab7abd9b08d7972cb` | `0fc02117cfbf74e33ddd3d04e223abc726440f353e06afeab574525cac5cdd08` |
| 2249 | `124c54404075087caacdf1ba19a25988988fb74d012eaea313664c8a21f83f23` | `7eb7c8a96e48d99d0936f55e6c9bed80a06b70519be21034fcd3fdf56b6554a2` |
| 2256 | `7589604acb6f44b3b7681bb11f4e5f58f6cbaf135c0858e85e4f3a58ff5ef9f5` | `c18bf2827f158293076fceabfa77025c3ee299c9273c1d384e39ced0d0b4ff7f` |

Follow-up `woody-root-focus-r2.n4WDKI`: new test and strict metrics PASS;
Doctor scanned all four tracked changed files, 91/no findings. Tidal suite
still FAILS the far-stem/crown intersection assertion at line107. The untouched
7351 baseline fails identically, after the same 128 accepted tidal trees and
14,195 root feet (highest gap −0.19918152374982867m). This inherited far defect
is not changed or waived. There is no complete tidal-suite PASS.

Both exact-base private builds and the one-pose native pair completed exit0.
Artifacts: `woody-root-native-r1.sRLjSU/{baseline,candidate}/shots/coastal/foliage.png`;
full source/3405-dist-file pins and commands are in its build/visual receipts.
Baseline index `0d030ff537982b90a22f773af62385c79c4661c99008a8f8c88b3e2bf9ea4471`;
candidate index `175489277e9cbf14b39fe8a6852e120d07417e11b9cd2cf36714a489bf108635`.
Runtime SHA256: `7fab512308a9468fdd930e0198e2ec86ef4dece7b1e3a1d2e8a4052a83903af5`.

Personally reviewed both images: near pine bases lose the blunt horizontal
tabs and tuck into the ground more cleanly. Improvement is small; dark bell-like
flares remain and grass hides many tips. This does not validate all species,
slopes, broader woodland aesthetics, performance, or retained heap.
Exact actual saved pose and before/after observations agree: native ANGLE Metal
M5 Max, High/trim0, 1440×900 DPR1, scale1, SMAA-high+FSR1, no browser errors.
All scene scalars agree: 190 nodes, 186 meshes, 106 instanced families, 36,665
instances, 1,342,864 triangles, 172 geometries, 32 materials and 40 textures;
full texture inventories agree too. These are owners/counts, not a heap test.
`sameFrameProof:false` and collector `comparability:not-established` remain.
Both worker PIDs exited and source/build hashes stayed frozen; no retry or
additional cost acquisition was performed.

Root reviewed the native pair and published the scoped orientation correction
as `f363fbd5e` on `origin/main`. This accepts the small visible root-seating fix,
not the unresolved tidal far-model issue or a full woodland/art/performance pass.

## Ridge successor (2026-09-11)

The launch restore pass finished the pending root draft on top of the
published outward-cone correction. Ordinary trunks now meet the ground through
an eased, fluted collar (`buildRootFlare`, three rings, radius 0.30 → 0.40 over
0.66 m) and five low closed ridges (`buildRootRidge`, a ten-quad box whose crest
falls from 52% of `0.82 r` at the collar to the soil over 1.35–1.85 trunk
radii). The old wide cone pedestal read as a lampshade beside the grass; the
ridges read as roots disappearing into soil from the chase camera. Budget per
broadleaf trunk falls from 1428 to 1368 vertices (152 vs 168 root/collar
triangles); RNG draws per root (5) and tails are unchanged, so every seeded
placement, card and branch above 0.4 m is byte-identical to the published
build. The tidal-Mangrove stilt branch keeps its reviewed bent cones exactly,
now pinned on its own budget in `tidalMangrove.selftest.mjs`.
`woodyRootOrientation.selftest.mjs` measures the ridge in its own bearing
frame (collar start, reach, crest fall, buried underside, single bearing) and
keeps the published cone as its negative witness.
