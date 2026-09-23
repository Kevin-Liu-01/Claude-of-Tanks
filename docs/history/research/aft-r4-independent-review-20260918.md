# AFT-10 X r4 — independent review after canister integration fix

**Result: FAIL every-view ≥9; minimum 8.5/10. All fourteen originals were actually viewed.** Main source fit and visible static seating reach 9 in this set. The remaining visual blocker is the road-wheel face correspondence, not the previously resolved canister-cover defect. No runtime file, source, camera or gate was changed, and no new capture was run for this review.

The reviewer did not author AFT's profile. This review applies to `.qa-dev/tank-run/root-r5/official14/aft10_x`, captured at `2026-09-18T10:01:49.355Z`, HIGH, seed 4242, with the complete supplied source on the left and native procedural candidate on the right. Registration is `certified-source-world` with a shared camera; the report's rig-parity verdict is `OK`. The official fourteen-image requirement and ≥9-per-view threshold are those in [quality-gates.md](../tank-generation/quality-gates.md). Numerical silhouettes are separate evidence and did not determine these scores.

## Corrections visibly established

- All eight canister terminal covers are square and sealed. The unwanted circular cannon-bore overlays are gone in front, front quarters and close-front. The earlier visible-round-cover failure and supposed owner cover-state conflict are superseded. This does not independently test the eight gameplay firing anchors.
- The thin stern bridge with its repeated open slots is present in top, hero-toptilt and hero-rearright. The earlier broad U-shaped roof gap is no longer the current finding; the source-real space below the bridge remains.
- Close-front and hero-frontleft show the bow mast's circular stepped receiver and offset neck. The earlier generic glass box/post description is no longer correct.
- Rounded central sensor stock, upright open rear cradle loops, low corner lamps, central rear door, hull-owned staggered smoke tubes and detailed driver cover remain visibly present. Their earlier missing/wrong-form findings are not repeated.
- Canister handles, straps and small deck fittings are visibly present. The camouflage reduces their contrast in several views; that alone does not establish missing geometry. No new whole-body shape error was established from the weaker contrast.

## Remaining bounded finding

**Road-wheel face correspondence, detail 8.5:** left/right, all four quarters, hero-frontleft, hero-rearright and close-front show the source's rounded central boss and dished transition into a projecting outer rim. The native view instead emphasizes relatively planar concentric face plates and a regular six-fastener arrangement. The source's depth is especially readable from the oblique outer-rim and hub boundaries in frontleft and the two wheel-visible heroes. This is a repeatable shape/relief discrepancy across views, not a penalty for the native wheel's lighter paint.

A read-only profile check confirms AFT still requests generic `wheelPattern: 'armored-hub-six'` without an AFT-specific `wheelCoreGeometry`. That establishes generic construction, not the exact amount of missing recess. This review did not measure source/native axial cross-sections or identify the first visible native surface; it therefore does **not** assert zero native depth, reversed faces, covered stock or a specific millimetre correction. Type96's measured-wheel proof cannot be transferred to AFT.

The next useful correction is bounded: measure sparse source radii/axial stations for one AFT road wheel and compare them to the actual front-facing native stock under the existing wheel placement. Where shape already agrees, diagnose normals/material/occlusion with the same camera and equivalent neutral illumination before editing geometry. Preserve the source wheel radii, six axle stations, tire contact and track path. Do not deepen the wheel arbitrarily, copy source topology or add generic hardware to increase contrast.

No new gross static float, broken loaded run or obviously stranded fitting was established in these fourteen HIGH images. Static seating 9 describes only visible neutral-pose seating; it does not replace finite stock, LOW, animated suspension, turret/gun articulation, armor or gameplay checks. The shared native shoe style and camouflage differences are not counted as source-geometry failures. Source-absent roof-machine-gun policy remains a separate unresolved qualification decision and is not silently changed by this review.

## Scores for the actual originals

Each row's minimum is the scoped image score; no favorable average can satisfy the every-image gate.

| Viewed original | Source fit | Detail | Static seating | Minimum | Limiting visible feature |
| --- | ---: | ---: | ---: | ---: | --- |
| front.png | 9 | 9 | 9 | 9 | Resolved square covers, sensor and lamps; no new bounded discrepancy |
| frontleft.png | 9 | 8.5 | 9 | 8.5 | Road-wheel boss, dish and outer-rim relief |
| left.png | 9 | 8.5 | 9 | 8.5 | Road-wheel face correspondence |
| rearleft.png | 9 | 8.5 | 9 | 8.5 | Road-wheel face correspondence |
| rear.png | 9 | 9 | 9 | 9 | Open cradle loops and separate rear door/side boxes present |
| rearright.png | 9 | 8.5 | 9 | 8.5 | Road-wheel face correspondence |
| right.png | 9 | 8.5 | 9 | 8.5 | Road-wheel face correspondence |
| frontright.png | 9 | 8.5 | 9 | 8.5 | Road-wheel boss, dish and outer-rim relief |
| top.png | 9 | 9 | 9 | 9 | Stern bridge/slots and deck layout present |
| hero-frontleft.png | 9 | 8.5 | 9 | 8.5 | Road-wheel cross-section reads flatter; bow mast correction holds |
| hero-rearright.png | 9 | 8.5 | 9 | 8.5 | Road-wheel cross-section reads flatter; bridge correction holds |
| hero-toptilt.png | 9 | 9 | 9 | 9 | Bridge slots, mast, deck and separated launcher packs present |
| close-front.png | 9 | 8.5 | 9 | 8.5 | Exposed road-wheel boss/rim relief; covers and mast resolved |
| close-roof.png | 9 | 9 | 9 | 9 | Handles, straps, staggered tubes and deck receivers present |

## Identity and scope

All fourteen original PNG SHA-256 values were recomputed and match `hashes.json`. Raw and canonical source hashes were independently recomputed and match the frozen packet. The AFT profile, factory, appearance audit and evaluator page still match the capture manifest at review time. The manifest also includes the unrelated `ztz100X.ts`; that file has since changed and is not part of this AFT review's candidate identity. No claim is made that the entire worktree remains frozen.

| Input | SHA-256 |
| --- | --- |
| Raw supplied AFT GLB | `45fdbb3efdc173cfc09a6293673534afc83f86ba20a1cd7ebc05f688ac85d1f0` |
| Canonical supplied AFT oracle | `95212acdcac7ef46744dde58888f675fa65284dfd4b008b2f7fda717b4e18d79` |
| `src/vehicles/profiles/aft10X.ts` | `be4fe83245d0139e36e8ff5abd43c3f53172a51f13e945f8bd8a2a502abaf901` |
| `src/vehicles/tankFactoryCore.ts` | `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3` |
| `src/vehicles/appearanceAudit.ts` | `d16d224a4b17d8a2ef0c24e92049202fd25237cfdcb983b803bfd6f9335a7746` |
| `tools/visual-evaluator-page.html` | `fdafc503fd38c1c437dcaf1470fbd403d0275d2ba7a2761da707cdc60c10030e` |
| Original `report.json` | `07b89dc916126e42318e722ca62ecd004be4fb4d9f91a7e56d026b8b5e8dfaef` |

| Actually viewed original | SHA-256 |
| --- | --- |
| front.png | `8829bed8c56829cb71b596cea6fe808947ed0bc7541391c4730f15341e78e1b9` |
| frontleft.png | `fee2a77ad1885d6801d2b3bc30e67827ff53c3efd27a9b3afdf5494edc49916d` |
| left.png | `9771d8372bf2601069d59b23c074b9631d7b55755e333f3b08b626d3e309f1a0` |
| rearleft.png | `5618d8a8cb0d0d0c0afc62ea4eb25cddf97aa44b5ac78629a4116f11fbebf169` |
| rear.png | `4587d831e7f1d0f32d80f11062eda8b74aab6954a9c80bb30301f8d3173e04a6` |
| rearright.png | `65a84a6018eb02043d0c8adb9903007fcd14d2bfabab82bd2365780b18cd2cfd` |
| right.png | `bf09677773de01b4b5257396585641a96930187e9cc9b4830ae70f2207fe04ac` |
| frontright.png | `b550dc7959c8622b2e2dcae5628f6c3949154671d16ddfc0568c628f5ec5bba6` |
| top.png | `9483d767514df596a699fc257b55239f0a8489519c3ec1a061ab4d3e8ebad287` |
| hero-frontleft.png | `549fd712a0c696b13df4ddf2dd64bef6e5c93625ebb1c363ad61c7f758e0c3da` |
| hero-rearright.png | `abecfec033161cbebc0961f700fa669a7e0d03fada8f074a8198491c24fc2b48` |
| hero-toptilt.png | `6b8ce4e10ea3a11099972fe498eb35c061635445a0ae8933f80cd2a9fabb8532` |
| close-front.png | `b5b1a6cdc02e1e78d3957ca9781db46163280f35f9bdc332361192da1a0a5d82` |
| close-roof.png | `10f0bf7dd21a01c794ee936e907a4f0a0ece2cf60a55ff1c5ac4332e5977ca95` |

The parent reports current selected HIGH/LOW geometry of 53,428/34,778 triangles and the existing source-every-view pass. Those receipts were not rerun here and do not substitute for visual admission. Previous r2/r3b/r4 captures and failures remain historical evidence. This review makes no Gallery, full LOW, moving-contact, anatomy, FPS, release or publication claim.
