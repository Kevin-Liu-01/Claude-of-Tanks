# Challenger 2 (`challenger2`) — BASE-21 photo-class packet

**Exact variant modeled:** Challenger 2, British Army woodland fit (pre-TES):
Dorchester wedge turret with plan-swept AND elevation-raked cheek planes,
mantlet-less embrasure with canvas boot + L94A1 coax port on the left cheek,
GPS armored housing forward-right roof + SAGEM VS580 panoramic behind it,
episcope cupola right / loader hatch left with pintle GPMG, 2x5 smoke banks,
huge bustle bin + full-width basket, big flat squared skirts with the raised
stepped front panel, L30A1 with thermal sleeve + fume extractor + MRS.

## ORACLE STATE (adjudicated 2026-08-06, BASE-21 modern-first round)
**NO reference oracle.** MODEL_SOURCE is procedural, no ledger row,
tmp-tank-critic refuses the id. **FALSE-0 LAW: never run the gate on this
id.** Bar = photo class + published dims + §B battery + 14-view self-reads
(tools/tmp-ww2-photoclass rig — the PHOTO-CLASS FLOW law, leo2a4 lineage).

## Corroborated dimensions (photo-class targets)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 8.3 m | Wikipedia Challenger 2, army-technology |
| Overall length (gun fwd) | 11.50 m | Wikipedia Challenger 2, UK MoD data cards |
| Width | 3.52 m (over skirts) | Wikipedia, tanks-encyclopedia |
| Height | 2.49 m (turret roof) | Wikipedia, army-guide |
| Gun | 120 mm L30A1 rifled, sleeved, MRS | Wikipedia, RBSL data |
| Running gear | 6 road wheels (Hydrogas), 4 return rollers, rear drive | photos, tanks-encyclopedia |

Spec dims (modern1.js) match: 8.33 / 11.50 / 3.52 / 2.49. SPEC NOTE
(residual, orchestrator lane): armor `gunBarrel.lengthM` 6.7 vs the built
6.29 visible run — the shadow-proxy sizes law (§C) wants a true-up.

## r1 REBUILD (2026-08-06) — owner correction: "theres many modern tanks
## like challenger and t14 armata in there — focus on those first"

Old build (r4-era): authored ±1.895 vs the 3.52 published width (§D
violation — every probe rescaled), muzzle +7.75 = 11.9 overall, idler/
sprocket wraps buried in the bow/stern (clip 102/78 band + 182/74 shoe),
hand-rolled pintle (census mg0), §B5 abutting 1. Rebuilt IN
`src/vehicles/modern1.js` (its profile home — uk.js is owned by the live
uk round-4 agent; family-rig migration QUEUED for that lane).

### Build inventory (photo class, current rulebook)
- HULL: belly ±0.985 between the tracks (§B4 lane law); full-width band
  ±1.68 to the 1.55 roof; §B1 ONE shallow glacis plane (0.98@4.10 ->
  1.55@1.48) — the band front and fender line are cut by this plane;
  lower bow center-lane only (±0.985 — the idler lanes stay open); toe
  beam; rear plate center-lane below the band + full width above, grilles
  + louvres + convoy plate; fenders 1.02..1.76 with front mudguards
  swept over the idler (underside 1.035 over the 1.005 orbit crest) +
  rubber flaps at both ends clear of the wrap far edges (+4.085/−4.105).
- SKIRTS at ±1.76 EXACT (the §D width guard): raised stepped FRONT panel
  with raked leading edge (exposes the idler + §B6 approach run), 5 flat
  panels with seams, RECESSED dark handle strips (the old proud handles
  broke the guard), rubber fringe.
- GEAR (§B6): 6 Hydrogas wheels r 0.36 @0.46, REAR sprocket {−3.60, 0.55,
  0.33} + FRONT idler {3.60, 0.52, 0.31} both raised — trapezoid run; 4
  covered return rollers; track outer 1.665 = 0.035 clear of the skirt
  inner plane; paintedEnds; coveredTop 1.02.
- DRESSING (§I census): 2x lightCluster fittings on the mudguards,
  towCable fitting draped on the glacis, splash V-strips ON the raked
  plane, driver hatch + periscope at the glacis crest (moved out of the
  turret casting box — the AABB-stranded flag), sponson bins, rear-deck
  kit bags (moved from under the bustle — second stranded flag), lift
  eyes, KC91AA ZAP decal.
- TURRET (Dorchester wedge; §B1/§B1.1): ratified 2.80 plan width; both
  cheeks carry the same plan-sweep + elevation rake; embrasure block +
  dark walls + §B3.1 canvas boot collar + seam ring; L94A1 coax port on
  the left cheek face; Dorchester side module slabs with seams; GPS
  armored housing (hood + brow + RECESSED angled glass, crest 2.49 = the
  published height line); VS580 pano pedestal + drum + window; episcope
  cupola; loader hatch + census GPMG (FITTINGS.pintleMG mag/two-tone);
  2x whip antenna fittings; 2x5 smoke banks; bustle bin + full-width
  basket + strapped kit + camo-net roll; side baskets.
- GUN (§B3.1): TOGS II barbette above the gun (pitches with it), L30A1
  len 6.29 — thermal sleeve segments + clamp rings, fume extractor at
  0.58, MRS collar; muzzle +7.335 = 11.505 overall. No prisms.

### Machine battery (2026-08-06, official rigs; before -> after)
- track-clip --exact: 102/78 band + 182/74 shoe -> **0/0 + 0/0**.
- tank-standard-check: clip ✓, contig 0 ✓, decor mg0+0d -> **mg1+5d ✓**.
- turret-parent: abutting 1 + (post-rebuild) stranded 2 (driver
  periscope AABB-flag + deck bags under the bustle) -> **0/0/0** by
  re-seating the real equipment (no re-parenting needed).
- §B5 yaw-90 pair: shots/base21-modern-r1/challenger2-after2-yaw90 — the
  whole turret (cheeks, GPS, pano, cupola, GPMG fitting, whips, smoke
  banks, bin, basket, side baskets, TOGS+gun) yaws as one mass.
- npm test: 166 + track-geometry PASS.
- Geometry record hash (NOT a freeze — no graduation without a dual
  gate): 22c8127 (52 meshes / 68820 verts) at the final round tree
  (coax port + all fixes included).

### 14-view SELF-READS (photo class; builder reads, not critic verdicts;
### views = the critic rig exactly, shots/base21-modern-r1/challenger2-after2)
front 8.6 / frontleft 8.7 / left 8.7 / rearleft 8.6 / rear 8.6 /
rearright 8.6 / right 8.6 / frontright 8.6 / top 8.7 / hero-fl 8.7 /
hero-rr 8.6 / hero-toptilt 8.7 / close-front 8.6 / close-roof 8.7.
Weakest named reads: glacis camo patchwork reads busy around the splash
strips; the cheek faces could carry stronger appliqué module seam lines;
the boot collar sits slightly deep in the slot shadow at close-front.

### Residuals / next-round candidates
- Spec gunBarrel.lengthM 6.7 -> ~6.3 proxy true-up (specs live in
  modern1.js armorChallenger2 — same file, but §C says verify the
  shadow-proxy harness before touching; orchestrator lane).
- p95 spike census over the 2.49 line: VS580 head 2.90, whips ~3.1
  (raked), GPMG ~2.72 — all real fittings; if this id ever gains an
  oracle the whip fold-down treatment applies (a6 precedent).
- Family-rig migration to uk.js when that lane frees (challenger1
  recipes; QUEUED in PROGRAM-STATE-base21).
- NO ORACLE: §E re-source lane open for a clean-license CR2 print.

### Law notes for the bank (no-oracle modern lane)
1. §D WIDTH-GUARD RECESSED-FURNITURE COROLLARY: skirt lifting handles on
   a width-defining face must be recessed dark strips — any proud detail
   on the guard face silently re-anchors the §D scale of the whole build.
2. AABB-STRANDED RE-SEAT FIRST: both stranded flags here were real
   equipment in legal hull parentage sitting inside the turret casting
   AABB — the cheapest lawful fix was moving the equipment to its
   photo-true station (driver sight to the glacis crest, kit bags to the
   rear deck), not re-parenting and not documenting an artifact.
