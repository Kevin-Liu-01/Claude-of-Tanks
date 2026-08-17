# Stridsvagn 103A (`strv103a`)

**Exact variant modeled:** Strv 103A, initial-production S-Tank (1967-70,
70 built) — fixed 105 mm kan Strv 103 L74 (L/62) aimed by hull, first
engine pairing (Rolls-Royce K60 240 hp diesel + Boeing 502-10MA ~300 shp
gas turbine), NO flotation screens, NO standard dozer blade, no nose
fence, plain 1960s Swedish olive.

## Owner order (§5.317 lane J, verbatim)

> **"add a new strv 103A"** — NEW fleet id `strv103a` (Sweden), using the
> owner drop `public/models/community-candidates/strv_103b.glb` (sha256
> e0b09973…, local-only reference; provenance TBD — census it) as the
> family's visual+measurement reference.

Context carried with the order: resident `strv103` (B) REVERTED to its
§5.198 casemate build (§5.305, hash `4c8f1330`) — UNTOUCHABLE this lane.
strv103a = the EARLIER A-model: same S-Tank wedge DNA, A-era distinctions
(no flotation-screen rim strips, earlier engine configuration / simpler
rear deck, no dozer on early As — "pick the cleaner A-read and document",
A-era fittings/lamps). Family distinctness law: strv103a ≠ strv103 at a
glance while both read unmistakably as S-Tanks.

## Reference drop census + provenance (2026-08-17)

`public/models/community-candidates/strv_103b.glb`, sha256
`e0b0997377b43edf2e9a8123baa5f26b5ee3d28fc9ae0208c13826893870be80`,
10,604,076 bytes, LOCAL-ONLY (gitignored).

**PROVENANCE VERDICT: CLEAN CC-BY-4.0 community model** (full line in
docs/ATTRIBUTION.md §5.317). Embedded `asset.extras`: title "Strv 103B",
author **BFJFFK** (sketchfab.com/chilecaliente), license CC-BY-4.0, source
sketchfab.com/3d-models/strv-103b-c05d9f47d8d640588f7f08d04491fa8d,
generator Sketchfab-12.74.0, OBJ-origin conversion (root node
`Strv_103B.obj.cleaner.materialmerger.gles`). No rip fingerprints: 5
anonymous `Object_N` meshes, UUID material names, no engine/extraction
tags, no game-title strings. NOTE: the print is a **B-model** — it carries
the B's dozer, full-width nose fence and flotation-era deck; the A build
diverges from it BY ORDER (caps below).

Real-vertex census (world frame, raw ≈ meters, **nose +Z**):
| item | value |
|---|---|
| meshes / verts / tris | 5 / 73,539 / 54,002 |
| scene AABB | x ±1.84, y 0.004..3.068, z −3.952..+5.012 (spans 3.68 × 3.06 × 8.96) |
| gun tube (Object_0) | 1,798 verts, z +0.64..+5.01, bore axis y ≈ 1.63 raw, muzzle r 0.0925 |
| body (Object_1) | 59,346 verts, z −3.95..+3.64, y to 3.068 (raked rear mast tips) |
| stray tri (Object_2) | 3 verts at (±0.01, 1.59-1.68, 0.58-0.65) — degenerate floater in-print |
| wheels (Object_3 node Object_5) | 10,592 verts: 4 road wheels r 0.405 axle y 0.458 at z {−1.50, −0.45, +0.375, +1.375}; FRONT terminal r 0.33 at (+2.20, y 0.913) = drive sprocket; RAISED REAR idler r 0.27 at (−2.28, y 0.851); return-roller reads y→1.14 at z −0.8/+0.7 |
| track band (Object_4/6) | x 0.964..1.634, y 0.004..1.235, z −2.60..+2.51 |

## Registration (all four maps, 2026-08-17)

`tools/vertex-extract.mjs` + `tools/procedural-fidelity.html` +
`tools/visual-evaluator-page.html` + `tools/tmp-tank-critic.html`:
`strv103a: { path strv_103b.glb, fixedMount:true, scaleToOverall:true, NO
yawOffset (nose already +Z — jpz_e100 class), pubDims hull 7.04 / overall
8.99 / width 3.60 / height 2.14 }`.

**INSTRUMENT DEFECT — MAST-CLAMP FRAME (certified cap + §E candidate):**
the print's fused raked antenna masts read to raw y 3.068 (+43% over the
2.14 published height), tripping the loader's `heightM×1.30` clamp: the
loader scale lands at 0.9078 (height-driven) instead of ~1.003
(overall-driven), and after the width safeScale (k 1.0767) the shared
frame is width-normalized (net ×0.9774). In that frame the print reads:
body 7.392 (+5.0% vs published hull), overall 8.751 (−2.7%), width 3.554
(−1.3%), mask-top 2.783 (+30%). The whole-view rows carry this frame cost
(measured ceiling: worst view ≈ 88-89; see gate row). **QUEUED FOR THE
ORCHESTRATOR LANE (§E):** mast excision or z-band trim of the two whip
masts (strv81 whip-class precedent) — after which the height clamp
releases and the frame re-lands overall-driven.

## Corroborated dimensions (A-model)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.04 m | en.wikipedia.org/wiki/Stridsvagn_103; globalsecurity.org/military/world/europe/strv-103.htm |
| Overall length (gun forward) | 8.99 m | Wikipedia; militaryfactory.com armor_id=104 |
| Width | 3.60 m bare hull (B's 3.63 includes flotation gear) | Wikipedia (3.60); spec sheets |
| Height (cupola) | 2.14 m | Wikipedia; globalsecurity |
| Weight | 37.0 t (A) vs 39.7 (B) | Wikipedia (103A row) |
| Engine | K60 (240 hp) + Boeing 502-10MA (~300 shp) ≈ 540 hp combined | Wikipedia; Ointres.se S-tank history |
| Gun | same 105 mm L74 L/62, hull-fixed | Wikipedia |

## A-vs-B distinctions (ordered divergences from the B print = documented gate caps)

1. **NO flotation-screen rim strips** around the deck edge (B fit; the
   resident carries them at ±1.665/2 rails).
2. **NO folded dozer blade** under the nose — the A carried the blade only
   as an attachment; the cleaner bare-beak A-read is built (order:
   "pick the cleaner A-read and document"). The honest low nose mass is
   the real A structure instead: stiffened under-lip crossbeam + twin
   under-beak tow brackets.
3. **NO nose protection fence** — the print's full-width ribbed cage is a
   later-fit B feature (the resident models it); the A glacis is clean.
   Quarter-view mask cost carried as an ordered-divergence cap.
4. **SIMPLER rear deck** — first engine fit: plain twin radiator grilles +
   narrow tail rack; none of the B's stowage-box rows/service pods.
5. **A-era fittings**: plain twin headlamp pods (no shrouded clusters),
   simple tail plate with recessed low exhaust outlets, solid olive
   pre-splinter paint, '103A' hull numbers.

Shared S-Tank DNA at the measured print lines: turretless wedge, fixed
L74 low over the long louvred glacis (glacis plane 1.845@z0.62 →
1.47@z2.98 build frame), central deck louvre field, commander
cupola/sight/dome cluster, four-wheel course + front drive + raised rear
idler, raked twin whips.

## Build (src/vehicles/profiles/sweden.js `buildStrv103A`)

Self-contained measured loft (NOT a casemate.js donor clone): two closed
§C.1-guarded lofts split at the 1.38 shoe seam + beak core wedge; fixed
gun run in HULL buckets with §B3.1 `muzzleBore` at published +5.47 (bore
y 1.59 measured, parent `hullG`); `P.fixedMount = true` (strv103/§5.313
precedent). Course from the print's measured stations (wheels r 0.40 at
z {−1.28, −0.30, +0.47, +1.40}, sprocket +2.16/r 0.32, idler −2.01/r 0.26,
2 return rollers, track outer 1.62). KIT.fittings: pintleMG (commander
Ksp 58, shielded), lightCluster ×2, antennaWhip ×2, spareTrackLinks,
stowageRack. Cluster crown pinned at 2.16 (print reads 2.33-2.38;
published 2.14 p95-sovereign — resident-class cap).

## Wiring checklist (§5.287 — every consumer named)

- `src/vehicles/sweden.js` — SWEDEN_IDS + SWEDEN_SPECS.strv103a
  (variant of strv103; class td; stats 1000 hp / 540 hp / 37.0 t /
  45 km/h; same L74 shells/reload; dims per published A)
- `src/vehicles/profiles/sweden.js` — buildStrv103A + SWEDEN_PROFILES row
  (profiledProcedurals.js spreads SWEDEN_PROFILES — no edit needed there)
- `src/vehicles/tier.js` — strv103a: 8 (one below the B per the
  earlier-mark convention: centurion3/5, ariete/c1, t80/t80b)
- `src/vehicles/tankLabels.js` — "Strv 103A" + aliases
- `src/vehicles/vehicleMarkings.js` — hull/left anchor (B is hull/right)
- `src/vehicles/fleetOrder.js` — sweden family order strv81 → strv103a →
  strv103 → strv122
- `src/vehicles/rosterPolicy.js` — COLD_WAR_IDS + RETAINED_COLD_WAR_IDS
  (mirrors strv103)
- `src/vehicles/decorations.js` — COLDWAR_IDS decor era (mirrors strv103)
- `src/vehicles/tankAssets.selftest.mjs` — HULL_ONLY_SHADOW_IDS (fixedMount
  casemate class: hull-only shadow caster, like strv103/jpz/sturmtiger/t95)
- `public/icons/strv103a_*` — 9 asset files generated
  (tools/genIcons.mjs --ids=strv103a); tank-assets-check PASS ("1 tanks /
  9 files … muzzle bores verified")
- NOT wired (documented decisions): materials.js FACTORY_OVERRIDE (that
  row fixes the B's community-GLB composite lift — the A is a clean
  procedural with its own solid visual); MODEL_SOURCE candidateGlb (the
  print is LOCAL-ONLY/gitignored — maps-only reference, lamonekeli
  pattern).

## Gate + verification receipts (2026-08-17)

- Geometry gate ×2 IDENTICAL: **min 88.6 | whole 88.6 / dims 100 /
  floaters 100** (docs/geometry-gate/strv103a.json; fused fixedMount ref —
  hull/turret/stations N/A, whole = worst registered standard view).
  dims: heightM 2.16 (0.74%), hullLengthM 7.04 (0.03%), overallLengthM
  9.00 (0.08%), widthM 3.60 (0.08%).
- Whole-view ceiling documented: worst views are the front quarters
  (frontRight 88.6 / frontLeft 88.8) — the mast-clamp print frame (−2.7%
  overall / +5% body in-frame) + the ORDERED nose divergence (print's
  dozer + full-width fence vs the clean A beak). Ordered-divergence +
  instrument-frame caps; §E mast fix queued above re-prices the frame
  component.
- Geometry hash ×2 BIT-IDENTICAL: **`281b67ac`** (44 meshes / 63,595
  verts).
- Track-clip strict: **front 0 / rear 0 / shoe 0 / sweep 0** (one fix
  landed: wheel-recess drums at xc 1.29 sat inside the instanced shoe
  sweep — removed; the ±1.00 bay shadow wall owns the recess read).
- §B5 fixed-mount proof (tools/tmp-strv103a-rig-probe.mjs): rig_turret
  subtree EMPTY of meshes/anchors (only rig_gun/rig_recoil group nodes);
  all muzzle + bore-shadow anchors parent under rig_hull (§5.313 law);
  yaw-90 vertex-space diff **0/44 meshes moved** (diffPx-0 class).
- §B2 contiguity: 0 holes; §B3 census: mg1+6d (KIT.fittings markers).
- npm test: **exit 0** (full suite; tier/labels/markings/assets selftests
  see strv103a — 115 registered tanks).
- Guards UNMOVED ×2 windows: strv103 **`4c8f1330`**, centurion3
  **`63f6a82c`**, leo2a5 **`6ecdfb06`**.

## §5.254 evidence (no before — new id)

- Garage identity: `shots/strv103a/garage-strv103a.png` (dossier VIII
  Strv 103A · Sweden · TD; carousel family VII 81 / VIII 103A / IX 103B /
  X 122; solid-olive A visibly distinct from the splinter B).
- 14-view ref|proc pairs: `shots/strv103a/pairs/strv103a/` (9 ortho +
  3 hero + 2 closeups vs the registered print).

## Mismatch log

| Date | min | whole | dims | floaters | change |
|---|---|---|---|---|---|
| 2026-08-17 | 87.4 | 87.9 | 87.4 | 100 | first honest run (new id) |
| 2026-08-17 | 88.0 | 88.0 | 100 | 100 | overall/heightM closed (tail flush at −3.52; MG cluster under the 2.16 cap) |
| 2026-08-17 | 88.5 | 88.5 | 100 | 100 | beak closure rebuilt (inverted lower-loft lip slab → core wedge + real under-lip crossbeam/brackets; 12%-band anchor restored) |
| 2026-08-17 | 88.6 | 88.6 | 100 | 100 | skirt band raised to the print's exposed-wheel line; fenders shortened to the print span; stern mudguard flares (width-defining) replace long boxes; deck louvre fields enriched; recess drums removed (sweep 0) |

NEXT (post-§E): re-ladder the whole rows after the mast fix releases the
height clamp (frame re-lands overall-driven; quarters re-price).
