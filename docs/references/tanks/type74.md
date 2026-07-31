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

## GATE-V9 CERTIFIED ORACLE RIG DEFECT — skinned single-mesh (2026-07-31)

The NullOps print is a skinned armature whose bones (`Tower_9`, `Gun_7`)
carry no meshes — the whole tank is ONE skinned mesh, so the gate's
setPart() subtree split cannot separate hull/turret/gun:

- ref turret mask is EMPTY → turretCurves compares the build's real turret
  against nothing (score 0, vacuous-100 does not apply — the build is not
  a casemate and correctly keeps a live rig_turret);
- ref hull mask = the WHOLE tank (turret + 105 mm gun included) → hull and
  whole rows compare different part sets (hull rows carry the ref's turret
  mass and tube; measured 0);
- the ref hull z-range for stations spans muzzle-to-tail (9.56 m vs the
  real 6.70 m hull) → all 14 slices misaligned (measured 0).

hullCurves / wholeCurves / turretCurves / stations are **certified capped**
against this oracle until repair. dims + floaters stay sovereign (dims 92.8
this round → target 100 via the published 2.48 m p95 anchor on the M2
cluster). ORACLE-REPAIR QUEUE (good candidate): bake the skin and split the
static mesh by dominant bone weight into hull/`rig_turret`/`rig_gun`
(blender job, same pipeline as repair_oracles_blender.py 'retag' mode).
