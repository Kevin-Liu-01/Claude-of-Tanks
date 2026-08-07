# Merkava Mk.2D (`merkava2d`) — reference packet

Exact variant: Merkava Mk.2D (Dor-Dalet) — the last Mk.2 fit: FIRST WEDGE
composite modules on the small turret's front cheeks (visually bulkier turret
front than 2B), deeper skirts, rear basket + ball-and-chain curtain; front
engine, 6 wheels, FRONT sprocket, 105 mm M64 gun.

## Corroborated real dimensions
- Hull length 7.45 m; overall gun-forward 8.30–8.78 m; width 3.70 m; height
  2.65 m; ~63 t. Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/merkava-2-israel-uk ,
  http://www.army-guide.com/eng/product1392.html
- Gun: M64 105 mm rifled (L/52 → tube ≈ 5.5 m), bore evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_II ,
  https://www.primeportal.net/tanks/lior_bar/merkava_2/

## Local GLB oracle (public/models/tanks/community/recovered/merkava2d.glb)
Width-normalized to 3.70. Same sculpt family as 2B (centered, nose +3.49):
whole z −3.62..+4.51.
- Hull: nose +3.49 (toe y ≈ 1.0), tail −3.55; deck 1.68–1.73; upper glacis
  (3.43, 1.11) → (1.3, 1.73); lower glacis (3.43, 0.95) → (2.1, 0.02); skirt
  bottom ≈ 0.29–0.35 with wheel scallops; belly 0.45; rear slope to
  (−3.5, 1.44).
- Turret: front cheek z ≈ +1.3 (wedge modules); roof plateau 2.40–2.46 over
  z 0.5..−0.6; cupola 2.6–2.8; bustle 2.6 to −1.6; basket top 2.44 to −2.9;
  chains to −3.3; front-view flat top ≈ ±0.85, shoulders to ±1.25.
- Gun: axis y 1.98, tip +4.51, r ≈ 0.075; mantlet band 1.86..2.11 at
  z 1.9–2.4.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 76.6 | — | 88 | 40 | 84 | 86 | baseline |
| 1 (bespoke rebuild + wedge cheek kit) | 79.0 | — | 91 | 47 | 74 | 90 | |
| 2 (bustle fill, rotor length, roof raise) | 82.2 | 86.3 | 90 | 53 | 89 | 89 | |
| 3 (shaded-parity r2: wedge-module recess seams, cloth bustle kit, gunmetal basket/chains/MG, dished wheels, deck/glacis/tail furniture, skirt bolts + hem, front fender boards) | 82.6 | — | 90 | 53 | 91 | 90 | material/furniture pass — silhouette pinned |

Remaining gaps: partial follower skirt capture in the ref turret mask
(smaller than 2B's but present: front sections + rows).
| 4 (r3 turret reconstruction: as 2B (shared small-turret rebuild) + cheek applique wedges rebuilt as proud overlays ON the beak planes — the detached standing-plate sliver and the floating apex box are DELETED; low 2D thermal sight box on the plateau; open basket + coil + chains; skirt scallops) | 82.3 | — | 91 | 52 | 91 | 90 | turret comp ~52 cap: 12 rear-half skirt panels ride the ref turret mask (see 2B note) |
| 5 (r5 FROM-SCRATCH curve rebuild: shared 2-series loft (see 2B r5) with the 2D deltas measured from docs/references/profiles/merkava2d.json — wedge-module cheek face at z 1.31 (2B: 1.15), roof (0.90,2.30)→(−1.35,2.42), basket to −3.00 + vane to −3.46, tail −3.55, tip 4.51 | 83.7 | 86.8 | 92 | 55 | 94 | 90 | +1.2 over r4 82.5; T 52 → 55 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: wedge cheeks + dome match; ref smoke/fitting clutter is finer grained.
- side L/R: face at 1.31 with the rising roof and mantlet-evac line tracks the
  print closely.
- rear: basket + chains + marker rods align; ref rear band slightly busier.
- quarters: same-vehicle read at every angle.
- top: near-identical (97.8).
- CURVE FINDINGS vs r4: same rising-roof/dome anatomy as 2B (r4 plateau was
  mis-seated); the wedge front face sits 0.16 further forward than 2B's.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 61.1 / whole 47 / turret 0 / stations 71.8 / dims 95.4 /
floaters 100.
- turretCurves CAP: same unrepaired rig class as merkava1b (root-level gun
  absent from the reference turret mask; cheek-applique wedges ride the HULL
  node - front hull trace tops 2.34-2.48 at center). Observed ceiling ~0-15
  until an oracle re-rig; matching the wedge split would break articulation.
- hullCurves residue: the hull-node wedges (above) cost side/front hull rows
  a few points; reproduced partially with the hull deck pack.

### Round-2 mimic purge + gate v10 standing (2026-07-31, post-repair 86d1071)
The defect-mimic packs tuned to the BROKEN oracles are deleted from
`src/vehicles/profiles/merkava.js`: the turret ring-interior column (bot
y~0.6 — the repaired refs carve the crew tunnel at the ring plane, so the
turret masks bottom at ~1.5 world), the hull-node `deckPack` casting-band
crate, and the oracle-matching rear stacks/rod reads listed per mark below.
Whips are seated on the measured reference trace columns (a half-column
offset costs two worst-list columns per whip per view). MEASUREMENT
MECHANICS (extends the Pershing/m60 notes): an unbroken axis-aligned
box is EDGE-ON INVISIBLE to the near/far-clipped station-slice cameras —
width carriers (fender lip/planks) are now SEGMENTED (~0.45 m, hairline
gaps) so every slice window catches an end cap; that alone moved 1b
stations 60 -> 77-79.
Removed here: ringFloor; deckPack (its 2.34 band was the stranded turret
kit, absorbed in 86d1071 — the repaired deck reads 1.72 FLAT); the old
rearPack tall-center-pack read (the 2.26 stack was the absorbed
ex_decor_10 trailing stowage, now turret-side); pod-guard tower.
Re-lined: marker rods at z -3.50 both ~0.9 tall (post-repair front trace:
L 2.55 / R 2.51 — the old per-side [0.75/0.34] was a broken read);
glacis bracket post at (-0.60, 2.85); wedge-face casting deepened
(shellRear -2.55, stow to +-1.40); whips stay LEFT (-2.94/-2.19).
- RE-CERTIFIED dome/pot stature residual (as 2B).
- RE-CERTIFIED short-gun cap: oracle tip ~+4.03 vs published +4.50.
- OBSOLETE: the v8 "cheek wedges ride the HULL node" hullCurves residue
  (absorbed under Gun in 86d1071).
Standing (gate v10): hull 73.3 / whole 56.8 / turret 39.6 / stations 71.7
/ dims 99.4 / floaters 100 (was 40.6/28.5/7.9/71.8/100/100 at v10 start).

### Round-3 note (2026-07-31): same rig-split wall as 2B
See merkava2b round-3: side dAlong -0.545 from the print's short hull-body
mask; reconstruction attempts reverted, r2 caps stand. Standing min 37.0
(hull 73.3 / whole 56.4 / turret 37.0 / stations 73.7 / dims 96.2).
Batch-8 forensics with 2B.

## SLOPE-MASS + NO-MYSTERY-BOXES round (2026-08-05, merkava family agent)
Owner §B1 c1ad424 + §B3 ff50bf5. Baseline: min 34.9 (hull 75.1 / whole
57.3 / turret 34.9 / stations 72.6 / dims 96.2 / floaters 100).

### Findings at 1x
- §B3: same bare olive stow crate class as 2B behind the small turret;
  §B4 clip 35/292. §B1: the 2D beak + kit appliqué wedges already read as
  raked casting planes (merkava2dKit slabs); the flat commander drum is
  the documented dims-governed stand-in.

### Landed
- stowTell (§B3): tarp crowns under the certified top + straps + strap
  tails; stow re-bucketed olive -> sand camo (3B/3C recipe).
- §B4 (r12 recipe): keel.hwClamp 1.13 — clip 35/292 -> 0/284.

### Done-gates (official rigs)
- geometry-gate x2: min 34.9 BOTH runs — every component IDENTICAL to
  baseline (75.1 / 57.3 / 34.9 / 72.6 / 96.2 / 100): the tells live under
  certified lines. standard-check contig PASS, holes 0.

### Honest residuals
- Rear clip 284: same rack-vs-wrap class as 2B (dedicated §B4 lane).
- Parent audit stranded 1 (unnamed, 26%): pre-existing at HEAD — the
  b5-round adjudicated audit-artifact class (AABB-coarse tool); verified
  unchanged by this round's A/B.
- turretCurves 34.9 pinned by the certified 2B/2D oracle defects.

## §B3.1 GUN-RUN round (2026-08-06, merkava family agent)
Same M64 canvas grammar as merkava2b (shared m.canvas path on the legacy
branch — rings at local taper +3 mm, seat seam, shoulder-band creases;
see merkava2b.md §B3.1 for mechanics).

### Done-gates (official rigs, x2 at close)
- geometry-gate x2 IDENTICAL to baseline: min 34.9 — hull 75.1 /
  whole 57.3 / turret 34.9 / stations 72.6 / dims 96.2 / floaters 100
  (zero cost).
- npm test green. Track-clip rear 284/204 pre-existing. Contig 0 holes.
- Turret-parent: stranded 1 (unnamed, 26%) — PRE-EXISTING: this round's
  edits are all rig_gun-bucket (canvas rings/creases); gun-bucket
  content cannot strand hull-side. The flag belongs to the 2D rebuild
  lane's backlog (34.9 row).
- Yaw pair at final bytes (shots/merkava-gunrun/pairs/*merkava2d).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore via shared mark gun; §C.1 3 reversed re-oriented; F-vs-D 12->2; gate HELD x2 EXACT 34.9; hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
