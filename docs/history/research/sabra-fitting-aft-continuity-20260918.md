# Sabra fitting ownership and AFT rear-slot measurements — 2026-09-18

## Sabra: equipment registration corrected without moving stock

The source-backed cupola receiver and barrel existed in `turretDark`, so the standard fitting census reported MG0. The original two solids now occupy one real visible `pintleMG` fitting. The source-frame positions, dark material, barrel axis, quality facets and prior detail LOD distances remain unchanged. Painted supports stay in their original buckets. No dummy fitting, replacement generic gun or additional weapon was introduced.

Profile SHA: `83549e53cd498130cfbf2c09ac8db3e94c538a4f63af1f2fb180795a19677f18`. Full expanded native world-triangle multisets match before/after at 10µm quantization for HIGH and LOW. Loaded native first-hit rays through the complete vehicle prove the actual receiver and barrel remain exposed and follow turret yaw. The existing focused test also checks actual stock, ownership, LOD and disposal; it and type checking pass.

Fresh standard diagnostic records MG1 / one marked mesh / continuity0. Selected costs remain 73,602 HIGH and 47,204 LOW triangles (43/42 objects). Source comparison remains 94.76 aggregate and 93.03 minimum; strict clip/band/shoe/sweep witnesses remain zero for both qualities. Official14 originals and full identities are in `.qa-dev/tank-run/europe-source/sabra-fitting-r22/official14/sabra_mk2_x`. Ten PNGs match round20 exactly; close-front, close-roof, hero-frontleft and hero-toptilt changed after the gun became independently owned. Parent owns independent review of all fourteen; this author does not certify them.

## AFT: source slots are real, but the earlier opening dimensions were too large

The unchanged standard scan reported 30 enclosed cells in twelve clusters across the thin Object_18 rear bridge. The source and native both have sixteen ventilation slots, with the final row over the recessed hull/door. Complete canonical-source FrontSide rays establish that the rear twelve slot centers are genuinely open; nearby webs hit Object_18 at Y1.975m. The lower plate face is Y1.9663m. The source comparison registration remains unchanged.

Testing the thirty nominal positions printed by the scan found ten source-air points and twenty source-plate points that were air in the earlier native model. These printed positions use nominal 60mm spacing and are not the exact raster-cell centers; the final mapping correction is documented below. Independent source-only boundary measurements established a genuine slot-size/offset mismatch:

| Column center X (m) | Width (m) |
| --- | --- |
| −0.46435 | 0.18450 |
| −0.14815 | 0.18490 |
| +0.15475 | 0.18490 |
| +0.47110 | 0.18480 |

| Row center Z (m) | Length (m) |
| --- | --- |
| −3.55565 | 0.04490 |
| −3.43750 | 0.04300 |
| −3.31935 | 0.04490 |
| −3.20215 | 0.04490 |

The prior primitive used 0.190×0.052m openings with approximate centers. Three lateral section witnesses per slot give identical fore/aft edge datums, supporting the sparse rectangular construction. Only those scalar dimensions and offsets were corrected. The plate envelope/thickness, all sixteen openings, recessed door, running gear, launcher, fixed firing anchors and camera/source registration remain unchanged. No continuity exception was added.

Frozen AFT profile SHA: `721285673b1fee62f996f98273ef68b4a7b70a41314ff9e42cb335cd36693a5a`. The amended `easternSourceContact.selftest.mjs` checks all sixty-four source edges with real air 1mm inside and plate 1mm outside, at HIGH and LOW with the existing fill record loaded and actual FrontSide materials. PASS. The complete native/source rays now agree at all thirty original nominal reported positions: ten air, twenty stock, zero mismatches. This is not a fresh continuity-raster result. Root must regenerate the affected fill record, after which the final raster, cost, physical checks and official14 must be refreshed. Any remaining source-real continuity failure stays explicit.

## Evidence and scope

Evidence root: `.qa-dev/tank-run/europe-source/sabra-fitting-r22/`. Raw AFT comparison SHA-256 is `45fdbb3efdc173cfc09a6293673534afc83f86ba20a1cd7ebc05f688ac85d1f0`; canonical source SHA is `95212acdcac7ef46744dde58888f675fa65284dfd4b008b2f7fda717b4e18d79`.

The diagnostic uses a private copy of the committed standard page with unchanged scan/census calculations; it only adds all cluster/cell coordinates to the report. Its standard output matches the earlier ordinary CLI's 30 AFT cells, including the same three largest clusters. Two earlier private-page serving attempts failed and remain recorded as harness errors, not qualification evidence. AFT's existing official hero-rearright comparison was visually inspected to corroborate the plate/slot arrangement. Source boundary rays use the complete canonical scene, not hidden source parts or an alternate camera.

| Private artifact | SHA-256 |
| --- | --- |
| `aft-slot-boundaries.json` | `147207fe769e72566dc6145948badc72fd2180a32467ab4e998ca47a5479277d` |
| `aft-stern-source-rays-before.json` | `770e9f76b07ddda7ced161610692b24109ac981229b1d44059009ee323e45c82` |
| `aft-stern-source-rays-after.json` | `84d300356bc0cb5bc05ebdfc3713545785843bc668a78438be259fab089f88de` |
| `standard-native.json` | `dc56b4cde8a4857491e735315aa42105d5c19958a7b05637031306a2ba053b7a` |
| `r20-image-differential.json` | `fa84e4014ed93164b2096f8e0f4c0ae15bbb3fee033406fee624623d8f5f37ad` |

This is a bounded geometry/ownership repair and diagnostic receipt. Full source-policy and composed-release decisions remain with the integration task; nothing here authorizes a gate waiver or publication.


## Final regenerated-fill verification and exact raster mapping

Root completed the shared fill/anatomy/marking/centering/asset generation. AFT's fill record remains byte-identical (`759b310a92aea2b99b5796763f73769c515a649b09ce5459f0215ce0b1c9ca2b`), while the profile retains the measured slot correction. Final receipts are under `.qa-dev/tank-run/europe-source/aft-slot-final-r23/`.

Loaded HIGH/LOW native slot-edge/wheel/bore tests PASS; every strict band/shoe/sweep count is zero. Fixed-source silhouettes remain 96.44 aggregate / 94.72 minimum. Selected cost is 71,068 HIGH / 41,282 LOW triangles (58.09%), with 40/40 objects. All job identities are stable. Fourteen new official images have no acquisition drift and were independently inspected by root: scoped9/10 each. See `docs/history/research/aft-slot-independent-review-20260918.md`; no author self-certification.

The unchanged final standard scan still reports **30 continuity cells and MG0: FAIL**. Its world-coordinate labels use nominal60mm steps, although the actual orthographic viewport covers a ceiled grid with X59.1667mm/Z59.8206mm pitch. Mapping the same thirty cells through that actual camera extent, then casting complete canonical-source and filled-native FrontSide rays at their exact centers, gives **30 source-air / 30 native-air / 30 agreements**. The earlier ten-air/twenty-plate statement describes only the approximate printed positions, not the actual rendered sample centers. The exact result is stored in `continuity-source-truth.json`; no raster, count, gate threshold or runtime tool changed.

The source-real slot air therefore remains a continuity-policy conflict. The independently measured boundary correction is still valid, and no phantom roof weapon was added. Both failures remain unwaived release blockers.
