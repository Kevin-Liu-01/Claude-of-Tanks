# TOS-1A Tagil — photo-inspired rocket-battery concept

## Current status

- Updated: 2026-09-21.
- Owner request: "make this tank too ... a russian tank of a giant missile battery ... launches missiles super quickly ... based on the hull t90ms tagil".
- ID/name: `tos1a_tagil` / **TOS-1A Tagil**, Russian Tier X modern rocket artillery.
- Implementation and qualification: COMPLETE. Release target: `origin/main`.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-tos1a-tagil-20260920`; branch `codex/tos1a-tagil-20260920`; initial base `a6fa51e18e932585ad35054415f8e3655d278c97`; full release qualified on `0841958d2`, then synchronized to `13d75aa36` with focused integration verification.
- Authority: requested addition and the conversation's standing verified commit/push authority. No deployment requested.
- Release scope: the tank source commit, assets and documentation. All required tank gates and the complete regression lifecycle pass; latest-main integration, type checking and both builds also pass.

## Scope and preservation

This is an explicit first-party derivative: the existing playable `t90ms_x`
chassis, suspension, running gear and hull fittings plus a newly authored
TOS-inspired launcher. The complete MBT turret is not constructed and discarded.
Both existing Tagil models remain unchanged. The launcher and gameplay are an
owner-directed game concept, not a claim that a production TOS-1A uses this
exact T-90MS hull or ammunition behavior.

The new profile, spec, launcher layout, exact lazy registry entry, signature
paint, concept contract, internal anatomy and scoped generated assets belong
to this task. Shared missile presentation changes must preserve guidance and
existing cannon behavior. Unrelated dirty shared-checkout work is excluded.

## Source and comparison contract

The owner's supplied photo visibly shows the three-by-eight tube array of the
TOS-1A Solntsepyok. Raw reference:
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/codex-clipboard-ccfd16ce-0221-40d0-ad47-896500f282d0.png`.
SHA-256: `5f39553a93d58761af254de96e4f6e15d2670dfa777414f3729783b4ac389093`.
The photo is comparison-only, has unknown original photographer/license, and
is not redistributed. No external geometry or textures enter the runtime.

Public comparisons researched 2026-09-20:

| Reference | Supported comparison | Consequence for this game design |
| --- | --- | --- |
| [Rosoboronexport TOS-1A product sheet](https://roe.ru/pdfs/pdf_4470.pdf) | 24 launch tubes. Search-indexed primary product sheet; direct retrieval unavailable during research. | Preserve the photo's 8×3 battery identity. |
| [Rostec TOS-2 overview](https://www.rostec.ru/media/news/tosochka-zazhigatelnaya-novinka/) | 18 tubes versus TOS-1A's 24; wheeled successor. Primary indexed excerpt; direct retrieval timed out. | Comparison only; do not substitute the truck chassis. |
| [Lockheed Martin M270](https://www.lockheedmartin.com/en-us/products/m270.html) | 12 GMLRS rockets carried by the tracked M270. Primary indexed page; direct retrieval returned 403. | Comparison of battery capacities, not a claim of equivalent performance. |

The photo's angular launcher shell, dark recessed circular mouths, side service
panels, hinge fittings, underside and heavy trunnion/cradle define the visual
target. A single perspective photograph does not yield an exact independent
3D oracle. Source-fidelity scores are **NOT APPLICABLE**, never fabricated
from the candidate. The existing explicit concept gate retains physical,
dimensional, running-gear, independent visual and release requirements.

## Construction work order

- Gross form: a wide, tall rectangular 24-cell battery above the low Tagil
  chassis, with chamfered edges, attached side pivots and an exposed yaw plinth.
- Preserve the original six-wheel train, three return rollers per side,
  smart-shoe courses, hull ERA and rear equipment at both qualities.
- Concept pack: 3.10 m wide × 1.22 m high × 3.60 m long; mouth grid eight
  columns × three rows at 0.37 m spacing. These are visual design dimensions.
- Yaw datum `[-0.00095,1.5455,0.118]`; local pitch pivot `[0,1.30,-1.30]`;
  legal pitch −5°..45°. The entire battery pitches, with no cannon recoil.
- Frozen complete neutral design envelope: width 3.7802 m, length 7.4785 m,
  tallest point 3.4555 m. Donor physical chassis bounds were measured before
  concept construction; launcher height comes from the proposed layout.
- Positive wall thickness, real dark inner sleeves and rear closures; no
  floating tubes, facade-only black dots or sheet across the cell openings.
- Painted panels/rims use camouflage; bore interiors, rubber and mechanisms
  remain deliberately distinct. Signature finish: olive/sand/charcoal bands.
- Cost budget set before construction: retained chassis plus at most 10,000
  HIGH / 5,000 LOW launcher triangles. Merge repeated components by material
  and articulation owner; preserve the canonical gear and runtime pools.
- All three crew in the hull; exposed launcher ammunition is damageable.
  Internal arrangement is a documented game design, not inferred classified
  TOS interior information.

## Gameplay design

Game tuning: 24 rockets, 0.25 seconds between shots, 48-second full reload,
72 carried rounds. Hold fire for a 5.75-second full salvo or release to save
the remaining loaded tubes. Rockets use unguided HE ballistics, moderate
dispersion, 240 nominal damage and 55 mm penetration per hit. These deliberately
abstract game values are not real-world rocket performance.

The large, lightly protected launcher and long reload are the counterplay;
this does not replace the precision/penetration role of AFT-10 or the smaller
guided batteries on Object 695 and ZTZ-100 Prototype. Final balance must be
checked against actual damage resolution, not paper damage alone. The complete
nominal cycle is 5,760 damage over 53.75 seconds (6,429.77 nominal DPM before
armor, dispersion, travel and missed shots). The 8 m HE splash cap and existing
armor attenuation remain unchanged; these are engine values, not real-world
blast claims.

## Evidence matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Photo identity/hash and concept target | PASS | Above; explicit requested donor |
| Source 3D parity | NOT APPLICABLE | Photo-inspired concept, no 3D oracle |
| Donor HIGH/LOW geometry preservation | PASS | Exact donor physical buffers and original full-vehicle parity; three intentional hull UV changes for the new paint |
| Physical tubes, seats, winding, legal poses | PASS | 24 real 220 mm bores; 40 legal poses; 14 broken-stock/material negatives; minimum hull clearance 21.003 mm |
| Independent 14-view native critic | PASS | Round 2 inspected all 28 HIGH/LOW originals and closed both round-1 blockers. Round 3 freshly captured the final anchor: all 28 PNGs and 14 camera pairs exactly match reviewed round 2; scores 9.0–9.2. Source parity remains N/A. |
| Local/authority firing, ammo and rack reload | PASS focused | Actual spec: 24 unique origins, 15 fixed ticks between shots, 48-second refill, finite 72-round inventory; existing wire protocol unchanged |
| Balance/actual HE damage | PASS focused and integrated regression | Actual armor traces: 0 against M1A2 lower front, 78.2 against its steep thin upper glacis, 240 against BMP-2 upper glacis, 91.4 against steep lower front; not a win-rate claim |
| Anatomy / armor / crew / markings | PASS | Full update and check: 200 current anatomy/marking records; 1,728 modules and 400 track sides, no failures or outside-envelope modules; 600 current diagram files. Exact two-stock primary collision: 420 native interval rays and 18 posed damage/air cases. |
| Track containment and duplicate courses | PASS | Final standard gate and duplicate-course audit: one integrated animated shoe layer, no overlapping full-length proxies |
| Assets, Gallery/Garage, switching cost | PASS scoped live review | Final selected anchor plus all 10 assets regenerated; prior asset records unchanged. Eight actual live images reviewed, including Garage, battle, Gallery and corrected English label. Trusted selection: 233.2 ms cold, 4.1 ms warm, 1.1–3.8 ms rapid; measures stage readiness, not presented pixels or a universal FPS guarantee. |
| Full release, types, public/private build | PASS | Full composed release on `0841958d2`: pre 394, core 676, post 42; 144 unchanged-input receipts reused by the normal runner. Latest main `13d75aa36`: 13 fresh focused integration tests, asset validation, type checking and both builds pass. |

## Round log

1. Intake: isolated current main, identified TOS-1A photo, researched battery
   comparisons, froze the requested Tagil-chassis concept and initial envelope.
   Existing magazine mechanics support the intended cadence; launcher origin
   and FX selection require separation from guidance.
2. Native authoring: preserved donor geometry and exact track-shoe pattern;
   verified deep bores and finite support stock. Fixed a zero-clearance support
   edge and reduced concealed surfaces/minor detail to meet the frozen cost
   budget at both qualities. Real openings remain geometrically open.
3. Combat integration: fixed canister selection is independent of guidance.
   Added opt-in pitching module frames for the exposed battery, including blast,
   Gallery and kill-cam evidence. Removed the otherwise-invisible analytic
   center cannon. Cannon and guided-weapon regressions retain their behavior.
4. Filled model: first generation revealed 624 additional closure triangles;
   the initial loaded cost failed and was retained in local QA. Simplification
   continued against the original ceiling, without lowering the gate. Final
   filled color-rendered costs are 79,684 HIGH / 69,544 LOW triangles, under the fixed
   79,900 / 69,652 ceilings, at 38 / 37 batches.
   Three non-color shadow proxies add 136 / 130 resident triangles; these are
   tracked separately from the unchanged color-rendered budget.
5. Anatomy review: preserved the real air around the bearing/platform and
   beneath the launcher with separate primary stock cells; fixed support
   plates target the seated traverse actuator. A final review caught an
   undersized rear armor descriptor and expanded it to the actual eight-point
   back sheet. The visible model did not change.
6. Native review round 1: all 28 original HIGH/LOW camera views were opened.
   Oblique bores exposed painted inner sleeves (actual deep bores remained
   clear); LOW orthographic distance removed support/detail buckets. These
   failed acceptance and require a new capture after correction. The live/icon
   path also added generic hatches and antennas to the pack; the new concept
   now has an explicit empty decoration manifest.
7. Legacy compatibility: restrict new articulated inspection containers to
   vehicles with explicitly pitching module anatomy. A new Jagdtiger render
   is byte-identical to the prior armor card. All prior asset metadata was
   equal; preserved those 28 old cards instead of publishing unrelated drift.
8. Native review rounds 2–3: dark inner sleeves retain the exact authored
   triangle/normal union; permanent cradle/support stock survives actual LOW
   visibility at 60/100/200 m and mobile/battle detail settings. Round 2 passed
   all 28 independently opened originals. Round 3 freshly pins the regenerated
   anchor and matches every reviewed PNG byte and camera record; no claim of
   an additional manual opening is made for identical images.
9. Integration checks: refreshed the projection left stale by removal of the
   automatic roof antenna. Added the new vehicle to the existing test's explicit
   later-model list while preserving its immutable original 151-anchor hash.
   One navigation timeout and five test timeouts remain in the local failed
   logs; retries use the unchanged limits and reduced test concurrency.
   Full anatomy, public/private builds and type checking pass.
10. Live review: an ordinary held-fire Bots battle accepted 24 shots at exactly
    0.25 s intervals across 5.75 s of shot telemetry, used all 24 origins,
    reduced carried ammunition from 72 to 48, and entered the 48-second reload.
    Garage and Gallery articulation/screens were inspected. The one UI finding
    was a missing Garage label mapping despite both translations existing;
    a single `src/main.ts` entry fixed it, and the English label was visually
    rechecked. The exact inverse diff proves this was the only runtime change
    after the frozen live samples. Chinese text passes catalog validation but
    its live screenshot caught startup, so Chinese visual verification is not
    claimed. The observed cold-switch frame maximum was 300.1 ms; no mobile,
    sustained frame-rate or live hit-effectiveness claim is made.
11. Full regression integration exposed an old articulation assertion that
    required a recoiling cannon on every turret. Explicit fixed-canister
    batteries now verify their actual tube anchors, finite rim/sleeve stock,
    supports and lack of recoil at every legal pitch endpoint; all existing
    cannon assertions remain intact. Actual filled HIGH/LOW runs pass all
    three poses and five broken-assembly controls. The earlier diagnostic
    suite was stopped while queued, after its failure was preserved; the
    final composed release owns the complete corrected regression run.

12. Final qualification: the complete composed release passed, including the
    corrected full-fleet gun-articulation test and all browser regressions.
    Two subsequent main commits added water wakes and near-vehicle shadows;
    they were fast-forwarded without conflicts. The reviewed feature patch
    retained stable patch ID `19829f350f89d0037a90015cd8ef5b448410e7fd`.
    Thirteen fresh integration tests covered those changes, the new tank,
    simulation, Gallery, networking, factory staging and two browser rendering
    regressions. Fresh target asset validation, type checking and private/public
    builds all passed. No source geometry or balance was changed in integration.

## Independent review receipts

Local evidence is retained under `.qa-dev/tos1a-final-review/`:

- `final-r2/independent/tos1a_tagil-review.json`: all 28 originals actually
  inspected; SHA-256 `9e1e2da872bc99891e6498fef74ec598ebdf05734dcf5eb6a723cb64b8552275`.
- `final-r3/independent/tos1a_tagil-review.json`: fresh final-anchor capture,
  exact-image carry-forward; SHA-256 `253a9416c9ba6210b25cecb1bf35be409a1c16dd854bebe4a1ce50d046140def`.
- `final-r3/independent/r2-r3-image-comparison.json`: all 28 image bytes and
  camera pairs equal; SHA-256 `3567463077cdb7e3e07cdb93547b517b3840163e89bb2ab5391d4fc4c8c884a7`.
- `live-r1/review.json`: actual Garage/Gallery/gameplay/switch samples and
  bounded label correction; SHA-256 `39b248bc5430967130c622ed49f33b9fa02595b6e340118ad91504d30296e42f`.

The native/live image receipts above were captured before the final main
integration. The integrated shadow/wake code was covered by the fresh tests
and asset validation; a second manual live-image review is not claimed.

Final local execution logs:

- `.qa-dev/tos1a-tagil/release-r2.log`: complete composed gate PASS;
  SHA-256 `918baf65c5ee3928b478e3e3b6fa3830eeee4bd54b73e026e0700dce7aea57b5`.
- `.qa-dev/tos1a-tagil/main-integration.log`: 13 integration tests, assets,
  types and both builds PASS; SHA-256 `c38f1b147a8cbdc7e9f64eaa91f6a31543ed3d0a8aba9b7234e33ad700a36192`.

## Release qualification

Qualified 2026-09-21 for the authorized source publication to `origin/main`.
No production deployment was requested or performed. The Git commit carrying
this packet is the publication record; no self-referential commit hash is embedded.
