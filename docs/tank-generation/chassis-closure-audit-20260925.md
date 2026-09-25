# Chassis closure audit — FSP-05 (2026-09-25)

Owner ruling 2026-09-25: **FSP-05 yes** — "Complete lower hull/chassis side
plates and connect hull sides, shoulders, fenders and skirts without accidental
holes or floating panels" ([backlog row](fleet-style-performance-priority.md)).
Input revision `8d1178d09` (the archive-deletion tip), 192 production ids from
`ALL_TANK_IDS` after `tankFactory.ts` registration, HIGH detail, shipped
materials, rest pose. Every number below is machine evidence from the repo's
own tools; the ranking is by what a player sees at chase range (the sealed
check's 12° / 30° camera rings), then by total openings.

## Tools and what each one proves

| Tool | Reads | Result on the base tree |
|---|---|---|
| `tools/tank-sealed-check.mjs --all --ledger=docs/geometry-gate/sealed.json --clusters` | 33 exterior views per tank; a back face nearer than any front face is an OPENING (the camera looks into the hull), a back face with a front face within 8 cm behind it is an INSIDE-OUT thin part | 23 of 192 open (ledger row `sealed:false`), fleet openings 6,299 px, inside-out 69,981 px; every opening cluster carries its world position and owning mesh |
| `.qa-dev/hole-trace.mjs` (view ray through each reported cluster; QA-only probe of this run, not tracked) | the first triangles the offending view ray crosses: mesh, facing, normal, point | attributes every hull opening to one builder part (tables below) |
| `.qa-dev/part-aabb-census.mjs` (builder-port proxy) | every `P.add*` part of the hull owner with its post-transform AABB; contact graph at 3 cm; parts whose cluster touches neither the core nor the running gear = floating-panel candidates | 472 disconnected clusters, 214 thin panels fleet-wide; 38 ids mutate buckets after adding (`scaleAllBuckets`/`offsetBuckets`) so their boxes are stale and marked `*` |
| `.qa-dev/side-plate-census.mjs` | horizontal rays from both sides at five stations across the wheel span and two heights (tub wall behind the wheels, sponson/skirt line), gear / fills / decals / nets excluded: FRONT = plate, back = inverted plate, nothing before the centreline = no plate | see the table (mid-station counts); no production hull lacks its tub wall at the mid stations |
| `.qa-dev/hull-seal-probe.mjs` (256 rays from five interior points) | rays that leave the hull without touching a surface — the interior-escape reading, which unlike the sealed views also looks downward | one escaping hull in 192: `t80u` (302 escapes at the stern, rays leaving forward-down through the rear floor); every other id 0 |
| `docs/geometry-gate/<id>.json` `floaters` rows | dilated-mask islands over five articulation poses | 153 registered ids: all 100 except `fv510` and `t90` (one island each, both rows score 0 — registration failures, not chassis islands) |
| `tools/winding-audit.mjs` (render-truth census) | REVERSED / MIXED connected pieces, FrontSide-vs-DoubleSide deficit, yaw-stranded candidates | 28 of 192 audited when this document was written (the audit takes one capture-lock ticket per tank behind three sibling lanes' capture runs); rows in the table, the rest NOT RUN — rerun `node tools/winding-audit.mjs` on a quiet machine, output `shots/winding-audit.json` |

The sealed views look down or level; the interior-escape probe is the only
one of these that looks up from under the hull. Both were run on every id.

## Findings, ranked by visibility

### Hull openings (base tree, 23 unsealed ids; 16 hull-owned, 7 turret-owned)

| Rank | id (family) | chase-ring open px | opening | cause (hole-trace + part census) |
|---:|---|---:|---|---|
| 1 | `ua_t64bv` (ukraine.ts) | 385 | bow, x -0.5, 21/33 views | LEFT plan-arrow prong slab wound inside-out: the mirrored `for s of [-1, 1]` loop handed it the opposite ring handedness (§C missing-side class) |
| 2 | `merkava2d` (merkava.ts loft) | 211 | both bow shoulders x ±1.2, 18/33 views | `loftBand` clearance side wedge between stations z 3.19 and 2.72: the station top (1.07) sits below the lifted track-clear floor (1.28), the wedge has negative height and folds inside-out |
| 3 | `t14` (modern2.ts) | 206 | bow wings x ±1.5, 14/33 views | both glacis wing rings the inward handedness (the left was corner-swapped to match the right): wing tops faced down |
| 4 | `carro45t` (italy.ts) | 185 | turret front | turret — outside FSP-05 (noted, not touched) |
| 5 | `amx40` (france.ts) | 138 | turret cheeks/roof | turret — outside FSP-05 |
| 6 | `t64bv1` (russia.ts) | 132 | bow, x -0.5, 15/33 views | same left-prong mirror class as `ua_t64bv` (two prong slabs) |
| 7 | `merkava2b` | 113 | bow shoulders | same loft wedge class as `merkava2d` |
| 8 | `m46_patton` (patton.ts) | 106 | glacis toe, x 0, 6 views (both side rings) | glacis wing: with `glacisWingDrop 0.04` the wing's clamped bottom (1.26) sat above its toe-line top (1.21) — a bow-tie plate whose toe face shipped inside-out; also 1,515 inside-out px |
| 9 | `k2` (modern3.ts) | 91 | fender shoulders, x ±1.1..1.7, z 3.5..3.7 | the canted fender skin was a one-sided `PlaneGeometry` over an open pocket behind it (no top or side closure between the glacis lip at z 3.53 and the skin at 3.715) |
| 10 | `ua_m2a3_bradley` (afv) | 72 | right bow corner x 1.44 | shared Bradley bow-corner closure slabs list the LEFT-hand ring, so the right copies were inside-out; the buried bow volume (`bowClosure`) is listed rear row first, the inward handedness, so the rear view read its front face through the under-sponson channel |
| 11 | `m3a3_bradley` (afv) | 68 | same | same |
| 12 | `amx30` (misc.ts) | 63 | bow corners x ±1.45 | "outer bow nose over the idler lane": the authored rings twist (inner top corners below the inner bottom corners), the hexahedron self-intersects |
| 13 | `merkava1b` | 62 | bow shoulders | loft wedge class |
| 14 | `m2a2_bradley` (modern3.ts) | 61 | right bow corner + bow volume | Bradley class |
| 15 | `marder1a3` (afv) | 61 | right bow corner | Bradley class (marder-local copy of the closure slabs) |
| 16 | `amx30b2` | 39 | bow corners | AMX-30 class |
| 17 | `type74` (misc.ts) | 35 | glacis centre x ±0.35 | glacis half-plane paired the nose-bottom edge with the crest-FRONT edge and the nose-top edge with the crest-rear edge: the two skins cross mid-plate; 3,434 inside-out px (the fleet's largest hull read) |
| 18 | `m60a3` / `m60a1` (patton.ts) | 27 / 26 | turret roof | turret — outside FSP-05 |
| 19 | `k2b` (korea.ts variant of k2) | 23 | fender shoulders | K2 class (scaled variant) |
| 20 | `object695_x` (modern2.ts) | 0 (18 px, 1 view) | stern skirt corners, `hullExternalArmor` | ERA skirt corner underside; left as is (18 px, no chase view) |
| — | `t90a`, `t90sm` (t90.ts) | 0 | turret cheeks (107 / 67 px) | turret — outside FSP-05 |

Sealed-but-open-pixel leaders that were also hull class and fixed by the same
family edits: `merkava3c` (66 px), `merkava4b` (34 px, plus 1,080 inside-out px:
the rear undercut wedge's lifted ring lands behind the door plane, a bow-tie
whose stern face was inverted — the rear view showed the interior fill instead
of the plate), `m48` (22 px, 1,490 inside-out px: the same Patton wing fold).

### Unconnected shoulders, fenders and skirts

The openings above are the shoulder/fender joints that were actually open: the
Merkava bow shoulders, the T-14 glacis wings, the K2 fender shoulder pocket,
the Bradley bow corners, the AMX-30 outer bow nose, the T-64 bow prongs. No
production hull lacks its lower side plates: the side-plate census (shipped
build, belly line measured by upward rays under the three mid stations, rays
8 cm above it and just above the wheel tops) reads the tub wall on every mid
station of 191 of 192 ids at both heights. The two remaining rows are not
missing plates: `k21_x` reads "none" at z -1.32 because its floor steps from
0.48 to 0.61 there and the census ray at 0.563 passes under the step (a probe
ray 10 cm higher meets the tub wall at x ±0.956); `merkava3c` reads one
inverted face at the sponson line (right side, z -0.80, `hull` at x 1.822) —
a skirt segment of the Mk.3C's side course, 1 of 20 rays, left for the skirt
round. Rows marked `end-none` are end stations under a raked bow or stern,
where a horizontal ray legitimately passes below the nose or tail.

### Floating-panel candidates (part census, not fixed in this round)

Clusters of hull-owner parts that touch neither the hull core nor the running
gear within 3 cm. The census works on add-time boxes, so the 38 ids that
scale or offset their buckets after adding (`*` in the table) are unreliable
there. Every candidate below was cross-checked with a column ray; none is an
opening, and each needs its family's measured hanger geometry rather than a
padded box, so they are recorded here for the next chassis round:

| id | thin floating clusters | parts | buckets | box (hull frame) | reading |
|---|---:|---:|---|---|---|
| `strv122` / `leo2a5` | 14 / 2 | 3 | hullDetail | x ±1.17..1.42, y 1.30..1.76, z -3.94..-3.84 | rear stowage baskets standing off the hull rear — dressing, not chassis |
| `k2b` | 11 | 3 | hull/hullDark/hullDetail | x ±1.82..1.92, y 0.65..1.59 | the K2 skirt course after the 3.80 m width scale — stale boxes, the census cannot judge scaled variants |
| `leclerc_xlr` / `amx56` | 10 / 10 | 4 / 2 | hull/hullDark | x ±1.77..1.82, y 0.79..1.31 | skirt segments whose tops reach 1.31 with the fender edge inboard of them: a column ray at x -1.80 reads the skirt only (1.31 → 0.79), so the segments hang from an unmodelled hanger line |
| `t90a` / `t90a_burlak` | 4 / 4 | 9 | hull/hullDark | x ±1.84..1.89, y 0.69..1.22, z 0.45..2.68 | ERA-band side skirts; the column ray at x 1.86 reads `hullExternalArmor` 1.22 → 0.69 with nothing above — hangers unmodelled |
| `type89` | 3 | 4 | hull/hullDark | x ±1.485..1.523, y 0.92..1.12, full length | a 4 cm side strip with a 13 cm gap up to the dark rail at 1.25..1.28 (column ray at x 1.50) |
| `t80bv` | 4 | 1 | hull | x ±1.42..1.74, y 1.37..1.41, z 2.4..2.9 / -2.6..-1.9 | 4 cm fender plates over the end wheels; the column ray reads them 3 cm above the track pads with the fender line inboard |
| `merkava2b` / `merkava2d` / `merkava3d` / `merkava3c` | 4 / 5 / 2 / 4 | 3 | hullRubber/hull/hullDark (hullWood) | x ±1.28..1.81, y 0.50..0.85, z 2.93..3.01 | front mud-flap assemblies (rubber, hanger, dark strap) hanging below the fender tip |
| `leo2a4` / `leo2a4_otco` / `k1a1` / `type99a` / `kf51b` / `leo2a4m` / `bmpt_t90` / `t72b3m` / `bmpt_terminator2` / `vickers_mk1` | 2 each | 1–3 | hullRubber (+hullDetail) | fender ends | mud flaps hanging 3–5 cm below the fender end |
| `ztz85_iii` | 2 | 2 | hullDark | x ±1.22..1.68, y 0.37..0.66, z 2.42..2.51 | bow plate under the fender, 1.5 cm proud of the hull chin (column ray) |
| `merkava4b` | 4 | 5 | hullDetail/hullDark | x ±0.39..0.97, y 0.89..1.13, z -4.16..-4.06 | tail-rack furniture standing off the rack |
| `m48` | 2 | 1 | hullDetail | x ±0.36..0.66, y 1.86..1.88, z 1.74..1.98 | deck slat crowns 2 cm over the deck |

Turret-owned openings (`carro45t`, `amx40`, `m60a1`, `m60a3`, `t90a`,
`t90sm`) and the `object695_x` ERA corner stay in the ledger unchanged; they
are outside this lane's ownership (hull/chassis geometry only).

## Fixes landed (worst first, one commit per hull family)

| Family | Commit | ids | What closed | Sealed check before → after (open px / views) |
|---|---|---|---|---|
| T-64BV | `0d0db91d4` | `t64bv1`, `ua_t64bv` | left bow prong slabs bound through `orientedSlab` (right prongs byte-identical) | 309/15 → 0/0, 760/21 → 0/0 |
| T-14 | `196154e15` | `t14` | both glacis wings through `orientedSlab99` | 338/14 → 0/0 (remaining inside-out px are turret-owned) |
| Type 74 / AMX-30 (misc.ts) | `85e02e565` | `type74`, `amx30`, `amx30b2` | glacis skins re-paired (nose-bottom → crest-rear, nose-top → crest-front); outer bow nose = `convexSlab` of the same eight corners | 58/3 → 0/0 (inside-out 3,434 → 503), 169/6 → 2/0, 167/4 → 0/0 |
| Bradley / Marder | `48fa79d7d` | `m2a2_bradley`, `m3a3_bradley`, `ua_m2a3_bradley`, `marder1a3` | bow-corner closure slabs and the buried bow volume through `orientedSlab` | 332/11 → 0/0, 294/12 → 0/0, 330/15 → 0/0, 181/13 → 0/0 |
| Merkava Mk.1B–4B loft | `801197d15` | `merkava1b`, `merkava2b`, `merkava2d`, `merkava3c`, `merkava3d`, `merkava4b` | `closedSlab` in `loftBand` (proper ring = `orientedSlab` byte-identical, mixed ring = convex hull of the same corners); clearance side wedge clamps its top to the floor; stage-4 rear undercut wedge closed | 142/6 → 4/0, 298/18 → 13/0, 482/18 → 19/0, 66/0 → 31/0, 8/0 → 12/0, 34/0 → 3/0 (4B stern inside-out 1,080 → 264) |
| Patton (M46, M48, M60 wing guard) | `0d4d64b95` | `m46_patton`, `m48`, `m60a1`, `m60a3` | glacis wing front edge keeps the toe-line top and takes its bottom 2 cm under it (`wbFront = min(wb, wyt - 0.02)`); hulls whose wing already clears are byte-identical | 205/6 → 0/0 (inside-out 1,515 → 2); m48 22 → 4 (1,490 → 646); m60a1/a3 inside-out −78 / −182 (their openings are turret) |
| K2 / K2B | `b1e8cf26d` | `k2`, `k2b` | fender shoulder skin = closed canted wedge to z 3.50, top edge buried in the glacis-lip band, bottom 0.17 m above the idler wrap | 192/7 → 22/0, 137/5 → 45/0 |

Fleet result after the seven commits (`tank-sealed-check --all` on the
combined tree): unsealed 23 → 7 (all turret-owned or the Object 695 ERA
corner), openings 6,299 → 1,912 px, inside-out 69,981 → 55,507 px, no id
worse than its ledger row. Sixteen hulls closed (22 ids changed bytes; the
22 are the per-id procedure set). The ledger floor is accepted as is (owner
2026-09-25); rows are not rewritten by this round.

Eye check: `.qa-dev/fsp05-views.mjs` renders each changed id at 1280 px —
four chase-ring 3/4 views at 12°, three below-side views (ground hidden) and
a low side — plus the culled-backface mask; sheets under the run's scratch
`views/` directory. Every bow shoulder, prong, wing, glacis plane and fender
shoulder above reads as painted armor from the chase ring and shows no dark
interior from below; the K2 fender shoulder is a solid canted face on both
sides.

## Receipts (combined tree `00ced2cf8`)

Per-id procedure for the 22 changed ids, every step exit 0: `presentation-centering
--update --ids`, `tank:anatomy:update` (fleet), `genIcons --ids`, `tank:anatomy:check`
(combat anatomy 192 receipts current, marking seats 192 current, module-hit probe
0 FAIL / 0 outside-envelope), `presentation-centering --check --ids`; the
regenerated payloads are commit `390a20708`.

One receipt per call, all exit 0: sealed ledger gate for the 22 ids
(`tank-sealed-check --ids --ledger --gate`), `tank-sealed-check.selftest`,
`interior-fill-body-policy`, `interior-fill-selection`,
`native-interior-fill-policy`, `coplanar-surface-overlap`, `section-slab-bounds`,
`track-lane-boxes` (unchanged), `public-repo-hygiene`, `attribution:check`,
`typecheck`, and the 46 family receipts under `src/vehicles/` whose names carry
merkava / patton / bradley / marder / t64 / russia / ukraine / misc / amx30 /
t14 / k2 / modern2 / modern3 / afv (including `bradleyHullClosure`,
`merkava2Fit`, `merkavaRunningGear`, `amx30X`, `t14XReturnRollers`).

`tank:release:check --gate` cannot be run for any of the 22 in a current tree:
of the ids with a `docs/geometry-gate` row, `merkava1b`, `merkava3c`,
`merkava3d` and `m46_patton` register community-recovered oracles whose GLBs
exist only as `.glb.bak` archives (the gate reports "registered fleet comparison
oracle unavailable"), `k2` has no comparison registration any more, and the
remaining rows were below the 90 floor before this round (t64bv1 89.5, t14
59.9, amx30 83.8, amx30b2 82.8, marder1a3 82.4, m2a2_bradley 53.4, merkava2b
39.6, merkava2d 34.9, ua_t64bv 24.9, m48 59.6; type74 / m60a1 / m60a3 /
m3a3_bradley 0). The un-gated release check (`tank:release:check --ids=<22>`:
standard check, sealed ledger, module-visual-align probe, `npm test`,
`build:private`) is the release receipt for this round — its result is in the
lane's final report.

## Open after this round

- Top-down §B2 contiguity cells the standard check reports on six of the changed
  ids — `amx30` 5 cells at (x -0.93, z 2.87), `k2b` 8 cells at (x -1.77, z 2.47),
  `m2a2_bradley` 2 + 1 cells at (x ±1.0, z 2.92), `ua_m2a3_bradley` 2 + 1,
  `m3a3_bradley` 1, `marder1a3` 1 — are pre-existing: a headless replica of the
  scan (`.qa-dev/topdown-contig.mjs`, 6 cm grid, 4×4 subsamples, FrontSide by
  winding, border flood) reproduces the check's clusters on the combined tree and
  finds the identical clusters on `8d1178d09` (base worktree A/B, same cell counts
  and centroids; `t64bv1`, `merkava2d`, `k2`, `type74` read 0 on both). They are
  1–8 enclosed 6 cm cells at the bow corners and the K2B's scaled left guard flare,
  invisible from the chase ring, and belong to the next chassis round together
  with the floating-panel candidates above.
- Turret-owned openings (`carro45t`, `amx40`, `m60a1`, `m60a3`, `t90a`, `t90sm`),
  the `object695_x` ERA corner, and the `t80u` stern interior-escape reading.
- `tools/winding-audit.mjs` fleet coverage (31 of 192 reached; the audit was
  stopped to hand the capture lock back to the release checks).

## Per-id evidence

Sorted by chase-ring opening pixels on the base tree, then total openings.
"before/after" are the base tree and the combined tree. Side plates: mid
stations (0.3/0.5/0.7 of the wheel span) per height, `inv` = an inverted
plate at any station, `end-none` = end stations under a raked bow/stern.
Floating-panel candidates: thin clusters from the part census (`*` = buckets
mutated after adding, boxes stale). Winding: REVERSED/MIXED pieces where the
audit reached the id.

| # | id | chase-ring open px | open px / views (before) | open px / views (after) | inside-out px before -> after | hull-owner meshes | side plates wheel-zone ; above-wheels (mid stations /6) | interior escapes | gate floaters | floating-panel cands | winding rev/mix |
|---:|---|---:|---|---|---|---|---|---:|---|---:|---|
| 1 | `ua_t64bv` | 385 | 760 / 21 | 0 / 0 | 674 -> 338 | hull:882 | 6/6 ; 6/6 | 0 | 100 | 3* | - |
| 2 | `merkava2d` | 211 | 482 / 18 | 19 / 0 | 1045 -> 316 | hull:926 | 6/6 ; 6/6 | 0 | 100 | 5 | - |
| 3 | `t14` | 206 | 338 / 14 | 0 / 0 | 1110 -> 455 | hull:613,turret:350 | 6/6 ; 6/6 | 0 | 100 | 0 | 44/0 |
| 4 | `carro45t` | 185 | 415 / 19 | 415 / 19 | 1600 -> 1600 | turret:1434 | 6/6 ; 6/6 | 0 | 100 | 1 | 58/1 |
| 5 | `amx40` | 138 | 289 / 6 | 289 / 6 | 5498 -> 5498 | turretDetail:3174,turret:2626,hull:823 | 6/6 ; 6/6 | 0 | 100 | 0* | 22/0 |
| 6 | `t64bv1` | 132 | 309 / 15 | 0 / 0 | 581 -> 317 | hull:443 | 6/6 ; 6/6 | 0 | 100 | 4* | - |
| 7 | `merkava2b` | 113 | 298 / 18 | 13 / 0 | 991 -> 313 | hull:791 | 6/6 ; 6/6 | 0 | 100 | 4 | - |
| 8 | `m46_patton` | 106 | 205 / 6 | 0 / 0 | 1515 -> 2 | hull:1538 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 9 | `k2` | 91 | 192 / 7 | 22 / 0 | 113 -> 119 | hull:118 | 6/6 ; 6/6 | 0 | 100 | 0 | 40/0 |
| 10 | `ua_m2a3_bradley` | 72 | 330 / 15 | 0 / 0 | 873 -> 147 | hull:941,gearEndWheelHardware:68 | 6/6 ; 6/6 | 0 | - | 2 | - |
| 11 | `m3a3_bradley` | 68 | 294 / 12 | 0 / 0 | 834 -> 145 | hull:845 | 6/6 ; 6/6 | 0 | 100 | 2* | - |
| 12 | `amx30` | 63 | 169 / 6 | 2 / 0 | 1258 -> 536 | hull:511 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 13 | `merkava1b` | 62 | 142 / 6 | 4 / 0 | 787 -> 116 | hull:612 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 14 | `m2a2_bradley` | 61 | 332 / 11 | 0 / 0 | 883 -> 149 | hull:942 | 6/6 ; 6/6 | 0 | 100 | 0 | 43/0 |
| 15 | `marder1a3` | 61 | 181 / 13 | 0 / 0 | 1021 -> 206 | hull:910 | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 16 | `amx30b2` | 39 | 167 / 4 | 0 / 0 | 1041 -> 370 | hull:372 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 17 | `type74` | 35 | 58 / 3 | 0 / 0 | 3434 -> 503 | hull:2836 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 18 | `m60a3` | 27 | 61 / 1 | 47 / 1 | 1968 -> 1786 | turret:1252,hull:98 | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 19 | `m60a1` | 26 | 75 / 2 | 75 / 2 | 1880 -> 1802 | turret:1308,hull:68 | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 20 | `k2b` | 23 | 137 / 5 | 45 / 0 | 3 -> 3 | hull:58 | 6/6 ; 6/6 | 0 | - | 11 | - |
| 21 | `merkava3c` | 19 | 66 / 0 | 31 / 0 | 767 -> 341 | hull:388,turret:110 | 6/6 ; 6/6 inv1 | 0 | 100 | 4 | - |
| 22 | `merkava4b` | 4 | 34 / 0 | 3 / 0 | 1080 -> 264 | hull:704,gearEndWheelHardware:14 | 6/6 ; 6/6 | 0 | - | 4 | - |
| 23 | `fv4034` | 3 | 16 / 0 | 16 / 0 | 183 -> 183 | hull:22 | 6/6 ; 6/6 | 0 | - | 0 | - |
| 24 | `ua_challenger2` | 3 | 15 / 0 | 15 / 0 | 109 -> 109 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 25 | `challenger2e` | 3 | 11 / 0 | 11 / 0 | 130 -> 130 | hullDark:14 | 6/6 ; 6/6 | 0 | - | 0 | - |
| 26 | `strv103` | 3 | 7 / 0 | 7 / 0 | 525 -> 525 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 837/0 |
| 27 | `m48` | 2 | 22 / 0 | 4 / 0 | 1490 -> 646 | hull:802 | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 28 | `k1a1` | 2 | 14 / 0 | 14 / 0 | 204 -> 204 | - | 6/6 ; 6/6 | 0 | 100 | 2 | 52/0 |
| 29 | `challenger2` | 2 | 10 / 0 | 10 / 0 | 154 -> 154 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 30 | `spz_puma` | 1 | 12 / 0 | 12 / 0 | 669 -> 669 | hull:460 | 6/6 ; 6/6 | 0 | 100 | 0 | 56/0 |
| 31 | `challenger1_x` | 1 | 8 / 0 | 8 / 0 | 678 -> 678 | hull:336 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 32 | `chieftain5_x` | 1 | 8 / 0 | 8 / 0 | 468 -> 468 | gearEndWheelHardware:57 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 33 | `t90m_x` | 1 | 7 / 0 | 7 / 0 | 78 -> 78 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 34 | `leo2a6_ua` | 1 | 2 / 0 | 2 / 0 | 663 -> 663 | turret:445 | 6/6 ; 6/6 | 0 | - | 0 | - |
| 35 | `leo2a6_x` | 0 | 163 / 0 | 163 / 0 | 221 -> 221 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 36 | `t90a` | 0 | 107 / 3 | 107 / 3 | 309 -> 309 | turret:97,gearEndWheelHardware:33 | 6/6 ; 6/6 | 0 | 100 | 4 | - |
| 37 | `chieftain_mk10_x` | 0 | 72 / 0 | 72 / 0 | 227 -> 227 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 38 | `t90sm` | 0 | 67 / 3 | 67 / 3 | 155 -> 155 | turret:48 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 39 | `ariete_c2_x` | 0 | 30 / 0 | 30 / 0 | 248 -> 248 | - | 6/6 ; 6/6 | 0 | - | 0* | - |
| 40 | `kf41_lynx_x` | 0 | 21 / 0 | 21 / 0 | 185 -> 185 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 41 | `object695_x` | 0 | 18 / 1 | 18 / 1 | 904 -> 904 | hullExternalArmor:872,gearEndWheelHardware:214 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 42 | `ariete_c1_x` | 0 | 16 / 0 | 16 / 0 | 348 -> 348 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 43 | `t80bv` | 0 | 14 / 0 | 14 / 0 | 207 -> 207 | - | 6/6 ; 6/6 | 0 | 100 | 4 | - |
| 44 | `pt91m` | 0 | 13 / 0 | 13 / 0 | 304 -> 304 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 45 | `cv90_mkiv_x` | 0 | 13 / 0 | 13 / 0 | 579 -> 579 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 46 | `t80b` | 0 | 12 / 0 | 12 / 0 | 196 -> 196 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 47 | `merkava3d` | 0 | 12 / 0 | 12 / 0 | 252 -> 252 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 48 | `kurganets25_x` | 0 | 11 / 0 | 11 / 0 | 160 -> 160 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 49 | `t90sm_x` | 0 | 11 / 0 | 11 / 0 | 164 -> 164 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 50 | `amx40_x` | 0 | 11 / 0 | 11 / 0 | 112 -> 112 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 51 | `leo2a4m_x` | 0 | 11 / 0 | 11 / 0 | 241 -> 241 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 52 | `t90ms` | 0 | 10 / 0 | 10 / 0 | 105 -> 105 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 53 | `k2_x` | 0 | 10 / 0 | 10 / 0 | 113 -> 113 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 54 | `kv2` | 0 | 10 / 0 | 10 / 0 | 751 -> 751 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 52/0 |
| 55 | `t90` | 0 | 9 / 0 | 9 / 0 | 196 -> 196 | - | 6/6 ; 6/6 | 0 | 0 (fails 1) | 1* | - |
| 56 | `t72b_1987_x` | 0 | 9 / 0 | 9 / 0 | 213 -> 213 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 57 | `leo2a7v_x` | 0 | 8 / 0 | 8 / 0 | 356 -> 356 | Mesh:9 | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 58 | `leo2a5` | 0 | 8 / 0 | 8 / 0 | 86 -> 86 | Mesh:23 | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 59 | `chieftain_mk10` | 0 | 8 / 0 | 8 / 0 | 388 -> 388 | - | 6/6 ; 6/6 | 0 | - | 0* | 48/0 |
| 60 | `t72bu` | 0 | 8 / 0 | 8 / 0 | 186 -> 186 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 61 | `leclerc_xlr` | 0 | 7 / 0 | 7 / 0 | 52 -> 52 | - | 6/6 ; 6/6 | 0 | - | 10 | 60/0 |
| 62 | `kf51` | 0 | 6 / 0 | 6 / 0 | 612 -> 612 | hull:408,gearEndWheelHardware:56 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 63 | `bmpt_t90` | 0 | 6 / 0 | 6 / 0 | 258 -> 258 | - | 6/6 ; 6/6 | 0 | - | 2* | - |
| 64 | `t80` | 0 | 6 / 0 | 6 / 0 | 218 -> 218 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 65 | `leopard2_proto` | 0 | 6 / 0 | 6 / 0 | 49 -> 49 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 66 | `ztz85_iii` | 0 | 6 / 0 | 6 / 0 | 390 -> 390 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 67 | `vt4a1` | 0 | 6 / 0 | 6 / 0 | 142 -> 142 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 68 | `t14_x` | 0 | 6 / 0 | 6 / 0 | 58 -> 58 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 69 | `strv122` | 0 | 6 / 0 | 6 / 0 | 40 -> 40 | - | 6/6 ; 6/6 | 0 | 100 | 14 | - |
| 70 | `type59` | 0 | 5 / 0 | 5 / 0 | 362 -> 362 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 71 | `merkava3d_x` | 0 | 5 / 0 | 5 / 0 | 271 -> 271 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 72 | `t90m_proryv` | 0 | 5 / 0 | 5 / 0 | 236 -> 236 | - | 6/6 ; 6/6 | 0 | - | 0* | 52/0 |
| 73 | `type89` | 0 | 5 / 0 | 5 / 0 | 382 -> 382 | - | 6/6 ; 6/6 | 0 | - | 3 | 40/0 |
| 74 | `t90m` | 0 | 5 / 0 | 5 / 0 | 236 -> 236 | - | 6/6 ; 6/6 | 0 | 100 | 0* | 52/0 |
| 75 | `type10b` | 0 | 4 / 0 | 4 / 0 | 40 -> 40 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 76 | `ariete` | 0 | 4 / 0 | 4 / 0 | 214 -> 214 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 36/0 |
| 77 | `strv122_x` | 0 | 4 / 0 | 4 / 0 | 191 -> 191 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 78 | `ariete_c2` | 0 | 4 / 0 | 4 / 0 | 300 -> 300 | - | 6/6 ; 6/6 | 0 | 100 | 0* | 40/0 |
| 79 | `kf51b` | 0 | 4 / 0 | 4 / 0 | 204 -> 204 | - | 6/6 ; 6/6 | 0 | - | 4 | - |
| 80 | `chieftain5` | 0 | 3 / 0 | 3 / 0 | 311 -> 311 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 81 | `leo2a5_x` | 0 | 3 / 0 | 3 / 0 | 139 -> 139 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 82 | `leo2_revolution` | 0 | 3 / 0 | 3 / 0 | 248 -> 248 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 83 | `t62mv1` | 0 | 3 / 0 | 3 / 0 | 308 -> 308 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 84 | `leo2a6m` | 0 | 2 / 0 | 2 / 0 | 1010 -> 1010 | turret:718 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 85 | `leo1a5` | 0 | 2 / 0 | 2 / 0 | 495 -> 495 | turret:134 | 6/6 ; 6/6 | 0 | 100 | 2* | 65/0 |
| 86 | `ua_m1a1` | 0 | 2 / 0 | 2 / 0 | 44 -> 44 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 87 | `type10` | 0 | 2 / 0 | 2 / 0 | 40 -> 40 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 44/0 |
| 88 | `leo2a5_a5nl` | 0 | 2 / 0 | 2 / 0 | 73 -> 73 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 89 | `abramsx` | 0 | 2 / 0 | 2 / 0 | 114 -> 114 | - | 6/6 ; 6/6 | 0 | 100 | 1* | - |
| 90 | `cv90105_tml_x` | 0 | 2 / 0 | 2 / 0 | 768 -> 768 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 91 | `type90` | 0 | 2 / 0 | 2 / 0 | 34 -> 34 | - | 6/6 ; 6/6 | 0 | 100 | 2* | - |
| 92 | `ariete_c1` | 0 | 2 / 0 | 2 / 0 | 320 -> 320 | - | 6/6 ; 6/6 | 0 | 100 | 0* | 40/0 |
| 93 | `t72bu_x` | 0 | 2 / 0 | 2 / 0 | 139 -> 139 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 94 | `type90a` | 0 | 2 / 0 | 2 / 0 | 53 -> 53 | - | 6/6 ; 6/6 | 0 | - | 14* | - |
| 95 | `mbt70` | 0 | 2 / 0 | 2 / 0 | 456 -> 456 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 52/0 |
| 96 | `t62mv1_x` | 0 | 2 / 0 | 2 / 0 | 352 -> 352 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 97 | `t72b3m_x` | 0 | 2 / 0 | 2 / 0 | 76 -> 76 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 98 | `leo2_revolution_proto` | 0 | 1 / 0 | 1 / 0 | 265 -> 265 | Mesh:213 | 6/6 ; 6/6 | 0 | 100 | 6 | - |
| 99 | `bmp3` | 0 | 1 / 0 | 1 / 0 | 232 -> 232 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 100 | `leclerc_classic_x` | 0 | 1 / 0 | 1 / 0 | 233 -> 233 | gearEndWheelHardware:7 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 101 | `leclerc` | 0 | 1 / 0 | 1 / 0 | 39 -> 39 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 60/0 |
| 102 | `m1a2_sepv3_x` | 0 | 1 / 0 | 1 / 0 | 134 -> 134 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 103 | `pl01` | 0 | 1 / 0 | 1 / 0 | 253 -> 253 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 104 | `leo2a6m_x` | 0 | 1 / 0 | 1 / 0 | 79 -> 79 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 105 | `spz_puma_s1` | 0 | 1 / 0 | 1 / 0 | 156 -> 156 | - | 6/6 ; 6/6 | 0 | - | 2* | 60/0 |
| 106 | `t72m1_jaguar` | 0 | 1 / 0 | 1 / 0 | 510 -> 510 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 107 | `pl01_105` | 0 | 1 / 0 | 1 / 0 | 253 -> 253 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 108 | `m1a2_sepv2_x` | 0 | 1 / 0 | 1 / 0 | 104 -> 104 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 109 | `strv103a` | 0 | 0 / 0 | 0 / 0 | 321 -> 321 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 110 | `pt91_twardy` | 0 | 0 / 0 | 0 / 0 | 384 -> 384 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 111 | `leo2a4` | 0 | 0 / 0 | 0 / 0 | 248 -> 248 | - | 6/6 ; 6/6 | 0 | 100 | 2 | 1217/0 |
| 112 | `m1a2_tusk` | 0 | 0 / 0 | 0 / 0 | 180 -> 180 | turretExternalArmor:108 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 113 | `challenger_3` | 0 | 0 / 0 | 0 / 0 | 204 -> 204 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 114 | `t80u` | 0 | 0 / 0 | 0 / 0 | 160 -> 160 | - | 6/6 ; 6/6 | 302 | 100 | 0* | 36/0 |
| 115 | `t84` | 0 | 0 / 0 | 0 / 0 | 44 -> 44 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 116 | `leclerc_x` | 0 | 0 / 0 | 0 / 0 | 258 -> 258 | gearEndWheelHardware:12 | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 117 | `udes03` | 0 | 0 / 0 | 0 / 0 | 478 -> 478 | gearEndWheelHardware:18 | 6/6 ; 6/6 | 0 | - | 0 | - |
| 118 | `leo2a6` | 0 | 0 / 0 | 0 / 0 | 225 -> 225 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 119 | `bmp2` | 0 | 0 / 0 | 0 / 0 | 124 -> 124 | - | 6/6 ; 6/6 | 0 | 100 | 2 | 44/0 |
| 120 | `leo2a7v` | 0 | 0 / 0 | 0 / 0 | 232 -> 232 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 121 | `m1a2_sepv3` | 0 | 0 / 0 | 0 / 0 | 5 -> 5 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 122 | `bmp3_rok` | 0 | 0 / 0 | 0 / 0 | 79 -> 79 | - | 6/6 ; 6/6 | 0 | - | 10* | - |
| 123 | `m1a1` | 0 | 0 / 0 | 0 / 0 | 36 -> 36 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 124 | `m1a3` | 0 | 0 / 0 | 0 / 0 | 38 -> 38 | - | 6/6 ; 6/6 | 0 | - | 1 | - |
| 125 | `t90a_burlak` | 0 | 0 / 0 | 0 / 0 | 244 -> 244 | - | 6/6 ; 6/6 | 0 | 100 | 4* | - |
| 126 | `cv90` | 0 | 0 / 0 | 0 / 0 | 536 -> 536 | - | 6/6 ; 6/6 | 0 | - | 0* | 60/0 |
| 127 | `cv90_mkiv` | 0 | 0 / 0 | 0 / 0 | 472 -> 472 | - | 6/6 ; 6/6 | 0 | - | 2* | 60/0 |
| 128 | `type89_light_tiger` | 0 | 0 / 0 | 0 / 0 | 220 -> 220 | - | 6/6 ; 6/6 | 0 | - | 2* | 60/0 |
| 129 | `leo2a4_otco` | 0 | 0 / 0 | 0 / 0 | 252 -> 252 | - | 6/6 ; 6/6 | 0 | - | 2 | - |
| 130 | `type96b_x` | 0 | 0 / 0 | 0 / 0 | 220 -> 220 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 131 | `ztz99a2` | 0 | 0 / 0 | 0 / 0 | 140 -> 140 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 132 | `ztz100_x` | 0 | 0 / 0 | 0 / 0 | 181 -> 181 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 133 | `fv510` | 0 | 0 / 0 | 0 / 0 | 350 -> 350 | - | 6/6 ; 6/6 | 0 | 0 (fails 1) | 1* | - |
| 134 | `ajax_x` | 0 | 0 / 0 | 0 / 0 | 449 -> 449 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 135 | `sabra_mk2_x` | 0 | 0 / 0 | 0 / 0 | 234 -> 234 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 136 | `namer_ifv` | 0 | 0 / 0 | 0 / 0 | 314 -> 314 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 137 | `m60a2` | 0 | 0 / 0 | 0 / 0 | 280 -> 280 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 138 | `centurion5` | 0 | 0 / 0 | 0 / 0 | 136 -> 136 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 139 | `ua_t80u_kursk` | 0 | 0 / 0 | 0 / 0 | 226 -> 226 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 140 | `bmpt_terminator2` | 0 | 0 / 0 | 0 / 0 | 522 -> 522 | - | 6/6 ; 6/6 | 0 | - | 2* | - |
| 141 | `t90a_x` | 0 | 0 / 0 | 0 / 0 | 125 -> 125 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 142 | `k1a1_x` | 0 | 0 / 0 | 0 / 0 | 94 -> 94 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 143 | `jpz_e100_x` | 0 | 0 / 0 | 0 / 0 | 188 -> 188 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 144 | `t90_x` | 0 | 0 / 0 | 0 / 0 | 80 -> 80 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 145 | `m1a2_x` | 0 | 0 / 0 | 0 / 0 | 138 -> 138 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 146 | `m1a1ha` | 0 | 0 / 0 | 0 / 0 | 76 -> 76 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 147 | `m1a2_sepv2` | 0 | 0 / 0 | 0 / 0 | 5 -> 5 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 148 | `t72b3m` | 0 | 0 / 0 | 0 / 0 | 338 -> 338 | - | 6/6 ; 6/6 | 0 | 100 | 2* | - |
| 149 | `leo2a4m` | 0 | 0 / 0 | 0 / 0 | 300 -> 300 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 150 | `aft10_x` | 0 | 0 / 0 | 0 / 0 | 296 -> 296 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 151 | `ztz100_prototype` | 0 | 0 / 0 | 0 / 0 | 206 -> 206 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 152 | `fv510_milan` | 0 | 0 / 0 | 0 / 0 | 326 -> 326 | - | 6/6 ; 6/6 | 0 | - | 1* | - |
| 153 | `ares_apc_x` | 0 | 0 / 0 | 0 / 0 | 260 -> 260 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 154 | `merkava4_x` | 0 | 0 / 0 | 0 / 0 | 199 -> 199 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 155 | `merkava4_trophy` | 0 | 0 / 0 | 0 / 0 | 106 -> 106 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 156 | `vickers_mk1` | 0 | 0 / 0 | 0 / 0 | 390 -> 390 | - | 6/6 ; 6/6 | 0 | 100 | 2* | - |
| 157 | `ua_t84_oplot_m` | 0 | 0 / 0 | 0 / 0 | 70 -> 70 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 158 | `bwp1` | 0 | 0 / 0 | 0 / 0 | 65 -> 65 | - | 6/6 ; 6/6 | 0 | - | 18* | - |
| 159 | `tos1a_tagil` | 0 | 0 / 0 | 0 / 0 | 147 -> 147 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 160 | `m551_sheridan` | 0 | 0 / 0 | 0 / 0 | 485 -> 485 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 161 | `t90a_vladimir_x` | 0 | 0 / 0 | 0 / 0 | 125 -> 125 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 162 | `k21_x` | 0 | 0 / 0 | 0 / 0 | 320 -> 320 | - | 6/6 end-none6 ; 6/6 | 0 | 100 | 0 | - |
| 163 | `amx30_x` | 0 | 0 / 0 | 0 / 0 | 221 -> 221 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 164 | `t80u_x` | 0 | 0 / 0 | 0 / 0 | 130 -> 130 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 165 | `type10_x` | 0 | 0 / 0 | 0 / 0 | 344 -> 344 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 166 | `t90a_burlak_x` | 0 | 0 / 0 | 0 / 0 | 63 -> 63 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 167 | `m1a2_tusk_x` | 0 | 0 / 0 | 0 / 0 | 177 -> 177 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 168 | `ua_m1a1_x` | 0 | 0 / 0 | 0 / 0 | 175 -> 175 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 169 | `m1a2` | 0 | 0 / 0 | 0 / 0 | 1 -> 1 | - | 6/6 ; 6/6 | 0 | 100 | 0 | 52/0 |
| 170 | `t90a_vladimir` | 0 | 0 / 0 | 0 / 0 | 188 -> 188 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 171 | `strv81` | 0 | 0 / 0 | 0 / 0 | 108 -> 108 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 172 | `challenger1` | 0 | 0 / 0 | 0 / 0 | 149 -> 149 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 173 | `challenger_3x` | 0 | 0 / 0 | 0 / 0 | 0 -> 0 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 174 | `stb1` | 0 | 0 / 0 | 0 / 0 | 424 -> 424 | - | 6/6 ; 6/6 | 0 | - | 0* | - |
| 175 | `amx56` | 0 | 0 / 0 | 0 / 0 | 46 -> 46 | - | 6/6 ; 6/6 | 0 | - | 10 | 60/0 |
| 176 | `type99a` | 0 | 0 / 0 | 0 / 0 | 0 -> 0 | - | 6/6 ; 6/6 | 0 | 100 | 2 | 0/0 |
| 177 | `ztz99a2_prototype` | 0 | 0 / 0 | 0 / 0 | 234 -> 234 | - | 6/6 ; 6/6 | 0 | - | 2 | - |
| 178 | `type100` | 0 | 0 / 0 | 0 / 0 | 396 -> 396 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 179 | `fv510_milan_x` | 0 | 0 / 0 | 0 / 0 | 266 -> 266 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 180 | `merkava4_barak` | 0 | 0 / 0 | 0 / 0 | 0 -> 0 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 181 | `centurion3` | 0 | 0 / 0 | 0 / 0 | 136 -> 136 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 182 | `m47_patton` | 0 | 0 / 0 | 0 / 0 | 0 -> 0 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 183 | `ua_t80bv` | 0 | 0 / 0 | 0 / 0 | 192 -> 192 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 184 | `bmp3m_dragun125_x` | 0 | 0 / 0 | 0 / 0 | 140 -> 140 | - | 6/6 ; 6/6 | 0 | 100 | 2 | - |
| 185 | `upior` | 0 | 0 / 0 | 0 / 0 | 223 -> 223 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 186 | `m551a1_tts` | 0 | 0 / 0 | 0 / 0 | 239 -> 239 | - | 6/6 ; 6/6 | 0 | - | 0 | - |
| 187 | `kf51_x` | 0 | 0 / 0 | 0 / 0 | 274 -> 274 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 188 | `griffin50_x` | 0 | 0 / 0 | 0 / 0 | 198 -> 198 | - | 6/6 ; 6/6 | 0 | 100 | 0* | - |
| 189 | `t72b3_x` | 0 | 0 / 0 | 0 / 0 | 111 -> 111 | - | 6/6 ; 6/6 | 0 | 100 | 1 | - |
| 190 | `type90_x` | 0 | 0 / 0 | 0 / 0 | 152 -> 152 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 191 | `t90ms_x` | 0 | 0 / 0 | 0 / 0 | 125 -> 125 | - | 6/6 ; 6/6 | 0 | 100 | 0 | - |
| 192 | `griffin_viper` | 0 | 0 / 0 | 0 / 0 | 132 -> 132 | - | 6/6 ; 6/6 | 0 | - | 0* | - |
