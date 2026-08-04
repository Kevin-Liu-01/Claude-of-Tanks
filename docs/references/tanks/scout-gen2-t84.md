# T-84 Oplot — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: LastTriarius T-84 remix (effective CC BY-NC-SA) in candidates-gen2/t84/ — known inaccuracies (early-T80 engine deck, fuel-tank mounts)

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.72 m (gun fwd) |
| hull | 7.08 m |
| width | 3.56 m |
| height | 2.22 m |
| weight | 46.0 t |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/modern/Ukraine/T-84.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=304

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-84

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## Oracle state (orchestrator, 2026-08-03)
Warped to published dims by repair batch-24 (roof was TRUE; Kord/sight
furniture knee 2.23; hull + FUSED tube stretched, muzzle pinned rear+9.72
— print has no gun node, so the game gun never elevates; fused-shell
class). Extract verifies 0.0-0.9% all axes. Buildable.
NOTE: batch-24 was DISABLED by the 2026-08-03 incident — the live oracle
is the PRISTINE short print again (overall 8.58 / hull 6.40, −11.8%).

## r30 FIRST BUILD (2026-08-04, russia agent): donor stand-in -> real profile
## 0 -> 15.4 min ×2 (hull 29.9 / whole 15.4 / turret 36.1 / stations 69.3 /
## dims 99.4 / floaters 100) — dims-sovereign vs the pristine SHORT print

buildT84 in src/vehicles/profiles/russia.js (RUSSIA_PROFILES.t84 replaces
the t80u donor stand-in). Spec dims sovereign: hull 7.08 / overall 9.72 /
width 3.56 / heightM 2.22 BARE-ROOF (unlike t54/t44 there is no MG
convention here — the print's 13-col 2.53-2.60 sight/Utes cluster is
score-carried, not dims-carried). standard-check: holes 0 ✓, mg1 ✓ (Kord
as compact FITTINGS.pintleMG, crest ~2.40 over ≤2 cols), clip 76/235
(strip/sponson fleet class).

BANKED LAWS FROM THIS BUILD (short-print class — read before the re-warp
round):
1. DO NOT STRETCH a short print's features to published dims: the gate
   registers BODY-SPAN MIDS, so a ×1.107 z-stretch put every feature
   0.1-0.35 off its registered pair (means 4-6% on every row — measured,
   reverted). Author features at PRINT-registered positions and carry the
   published dims as PURE END EXTENSIONS (they ride as ~3-9 cover
   columns, priced once).
2. END EXTENSIONS RE-REGISTER THE PAIR: adding the stern stack moved the
   hull body-mid (dAlong 1.11 -> 0.86) and silently re-seated the ref
   0.28 behind my turret (turret 33 -> 6 across two runs that "didn't
   touch the turret"). Re-derive turret/gun seats from a fresh digest
   after ANY hull-end change on a dims-short print.
3. Distribute the dims margin REARWARD where the print is tube-only
   forward: a bow extension paired against the ref's bare-tube columns
   (errs 0.3-0.6); the same margin at the stern rides as ONLY-PROC cover.
4. The unstretched end extensions are too THIN to count as hullLengthM
   body columns (12% band rule) — they need band-deep anchors (bow corner
   stacks + stern stack, t80 pattern) or dims under-reads by ~2%.

Registered print reads (authored frame = print mid at -0.24 after the
final registration; digest-derived): deck dip 1.21, engine plateau
1.33-1.38, ring deck 1.324, glacis 1.28@1.74 -> nose 0.96@3.20; tracks
grounded -1.89..2.27, rear wrap bottoms 0.65-0.74 (high stern fade, t80
class); welded turret: roof 2.13-2.21, bustle 2.11-2.23 to -1.58, cheeks
1.94-2.04, plan front 2.13/rear -1.80, apron 0.94; tube axis 1.845
r 0.105, evac 0.125 @ registered ~3.3; print tube ends ~5.4 (mine pinned
5.94 = stern -3.78 + 9.72; ~6 muzzle cols ONLY-PROC accepted).

Honest ceiling: the −11.8% print means ~9 permanent cover columns
(side_whole −8 class) + the sight-cluster carry (~8 cols ×0.3) until the
batch-24 re-warp relands gate-in-loop against THIS build (its "stretch to
pub dims" recipe would then meet a build already at pub dims — expect
side/plan rows to jump into the 60-70s).
