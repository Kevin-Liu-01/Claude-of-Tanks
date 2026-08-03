# Type 74 (`type74`)

**Exact variant modeled:** Type 74 (JGSDF, 1975–1990s fit, pre-Type 74 Kai) —
L7A1 105 mm licensed (Japan Steel Works), hydropneumatic suspension at
standard ride height, IR/white-light searchlight left of the mantlet.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | ~6.7 m (roster dims 6.7) | militaryfactory.com armor_id=95 (overall 9.42 minus ~2.7 gun overhang); GHQ/model references |
| Overall length (w/ gun forward) | 9.41–9.42 m | en.wikipedia.org/wiki/Type_74_tank (9.41); militaryfactory.com (9.42) |
| Width | 3.18 m | Wikipedia; militaryfactory.com |
| Height (std clearance, cupola) | 2.25 m (turret roof ~2.0; clearance adjustable 0.2–0.65) | Wikipedia; militaryfactory.com |
| Gun (model, caliber, tube length) | JSW/Royal Ordnance L7A1 105 mm rifled L/51, gun length 5.89 m incl breech (~5.35 m tube), mid-tube fume extractor, NO thermal sleeve | Wikipedia (L7A1, 5.89 m); militaryfactory.com |
| Road wheels / rollers / sprocket | 5 LARGE road wheels/side, NO return rollers, REAR drive sprocket, front idler | militaryfactory.com ("five large road wheels", "no track return rollers", "drive sprocket at the rear", "track idler at the front") |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: low CAST turret with heavily sloped
  rounded sides — a squashed hemispherical front flowing into a long tapered
  bustle (STB-1 lineage, reads like a lower, sleeker M60A1 needle-nose);
  commander's rotating cupola RIGHT with a 12.7 mm M2 on a pintle, low oval
  loader hatch LEFT; roof otherwise clean.
- Mantlet/gun mount: rounded cast mantlet saddle around a bare rifled tube
  with a fat mid-tube fume extractor; big rectangular searchlight box
  mounted LEFT of the mantlet (white/IR light).
- Hull front: LOW-SLUNG hull — sharp shallow glacis with a pronounced
  center crease, flush driver hatch left, very low sponson line; the whole
  vehicle sits close to the ground at standard trim.
- Running gear + skirts: 5 big exposed rubber-tired wheels, dead track sag
  between stations (no return rollers), NO side skirts — the upper run is
  visible under the fender line; rear sprocket.
- Signature equipment: hydropneumatic kneeling suspension (modeled at
  standard trim), fender stowage boxes, twin rear-deck exhaust outlets with
  mesh, tow cable across the glacis, two whip antennas at the bustle sides.

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Type_74_tank — infobox 9.41/3.18/2.25, L7A1 105 L/51
2. https://www.militaryfactory.com/armor/detail.php?armor_id=95 — running gear (5 wheels, no rollers, rear sprocket), cast sloped turret
3. https://tank-afv.com/coldwar/Japan/Type-74.php — photo walkaround set

## Local GLB oracle notes

Path: `public/models/tanks/community/type74-nullops.glb` (Sketchfab Standard —
PERSONAL-USE QUARANTINE; oracle only, registered for the lab through
LOCAL_REFERENCE_OVERRIDES exactly like ariete; never a shipped source).
Skinned armature (Tower_9 yaw bone, Gun_7 pitch bone, wheels as bones);
loader uses scaleToOverall because the barrel verts live in the skinned hull
mesh. ROSTER NOTE: the type74 SPEC was delisted with the quarantined GLB
(userdrops.js SHIP_QUARANTINE_USERDROPS=false) because it had "no procedural
fallback"; the misc.js profile now registers the spec with an original
procedural build (clean license), which is the substitution that delist
comment asked for. Width-normalized (3.18) station readings: overall 9.09,
height 3.06 over the M2/antenna stack (the fused skinned mesh exposes no
hull/turret split, so hull/turret/gun component masks are N/A — the lab
scores whole silhouette + tracks only). The oracle reads proportionally
larger than the published envelope (its width bbox is set by the fender
mirror arms, shrinking the hull on normalization); the procedural keeps
published dims with the deck band at 1.32 and dome crown ~2.13, and mounts
its own mirrors INSIDE the ±1.59 width guard so normalization stays stable.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | — | — | — | — | — | — | no baseline possible: spec unregistered (quarantine delist), lab had no oracle row |
| 2026-07-30 | 82.1 | 76.6 | N/A | N/A | N/A | 90.7 | first scoreable build: spec registered from misc.js + lab oracle override; bespoke low hull, cast dome, 5-wheel dead-track gear, cupola M2, searchlight |
| 2026-07-30 | 83.8 | 79.8 | N/A | N/A | N/A | 89.3 | r2 final: deck band to 1.32 + dome to 2.13 (published 2.25 w/ cupola), wheels R0.42, fender mirrors, hull-rear whip antennas, taller M2 stack, gun 5.72 (muzzle registers with the oracle). Component masks stay N/A (fused oracle) — identity judged on the shaded board per the packet |

## RETIRED CAP — single-mesh rig (repaired 2026-07-31, batch 6)

The v9 "skinned single-mesh / setPart cannot split" cert is **DELETED —
the batch-6 re-rig succeeded** (tools/repair_oracles_blender.py
RERIG_RECIPES.type74: armature baked at bind pose, the 5 layer meshes
split by dominant bone weight into hull / `Tower_9` / `Gun_7` static
trees). Turret mask non-empty, hull != whole, stations measure, dims 100.

## GATE-V10 CERTIFIED ORACLE-DEFECT CAP — proportional print inflation (2026-07-31)

With the rig honest, the residual defect is measurable and PROPORTIONAL
(the old packet's cause stands: the print's width bbox is keyed by its
fender mirror arms, so width normalization under-scales the body):

- ref hull body span reads ~7.13 m and sits ~1.1 m AFT of the build's
  published-envelope midpoint (gate registration dAlong ≈ 1.14);
- ref deck/gun bands ride high: tube band 1.75..1.93 (axis ≈ 1.84 vs the
  build's published ~1.66), M2/cupola cluster 2.76-2.85 over ~16 trace
  columns (published height 2.48 caps the build's cluster at ~2.46-2.50);
- ref muzzle ends z +4.48 with a ~1.95 m overhang — the build carries the
  PUBLISHED 9.42 m overall (muzzle +6.09), so ~9 build-only barrel columns
  land in the gun-bearing whole rows (hull-anchored registration: this is
  the certified short-barrel coverage class, wholeCurves only).

Build-side fixes this round: whips matched to the print's 1-column spikes
(x ±0.95, one body-relative column aft of midships), mirror heads folded
to the fender line. **hullCurves / wholeCurves / turretCurves / stations
are certified capped at their measured residuals** (~40 / ~6 / ~0 / ~0)
against this print — no rigid transform repairs relative proportions.
dims + floaters remain sovereign and pass at 100/100.

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage + normalize plan (2026-08-03, misc agent)

Ledger 0 (turretCurves/stations) is HONEST — the quarantine reference
renders (gate rows carry real ref values; side reg dAlong 1.14 shows the
scale/offset mismatch, not a false-0). Extract REG appended (quarantine
oracle, ^Tower_9$/^Gun_7$ scaleToOverall). Stylization: bodyH +13.9%
(near-uniform tall: deck band 1.5-1.6, dome/cupola band 2.8 vs pub 2.48,
whip spike 3.06), hullMask +2.2%, overall -3.7%, width 0%. **Normalize
plan authored** (tools/vertex-normalize.mjs `type74`): y [[0,0],
[1.60,1.38],[2.827,2.46],[3.058,2.49]] (sim p95 2.460, h -0.9%); z body
x0.978 about -1.1135 + muzzle -> rear'+9.42. NOTE scaleToOverall: the
loader re-normalizes post-warp — `--verify` must re-check the landed
factors. DO NOT BUILD pre-warp (>2% law).
