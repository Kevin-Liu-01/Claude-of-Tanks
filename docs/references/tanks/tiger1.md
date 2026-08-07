# Tiger I (`tiger1`) — BASE-21 photo-class packet

**Exact variant modeled:** Tiger I Ausf. E mid-production (1943-44) —
flat interlocked slab hull (three-plate bow: 24° leaning nose, glacis
shelf, 9° driver plate standing proud), full-width superstructure at the
ratified ±1.855, Schachtellaufwerk interleaved big roadwheels, horseshoe
turret with drum cupola (left) + loader hatch (right), full-width curved
cast shield mantlet, 8.8 cm KwK 36 L/56 with the twin FLAT-drum baffle
brake, twin shrouded stacks + Feifel air cleaners, S-mine dischargers ×4,
zimmerit-era tool kit + spare tracks, rear Gepäckkasten (3-segment arc).

## ORACLE STATE
**NO reference oracle** (no ledger row, MODEL_SOURCE `procedural`).
**FALSE-0 LAW: never gate.** Bar = PHOTO-CLASS FLOW (14-view rig + §B
battery + published dims). HIGH-VIS id: garage BAY_A display +
marketing closeup target.

## Corroborated dimensions (photo-class targets = spec dims)

| Measure | Value | Anchor in build |
|---|---|---|
| Hull length | 6.32 m | z ±3.16 (nose 3.15 / tail −3.155 + flaps) |
| Overall (gun fwd) | 8.45 m | muzzle +5.295 over the −3.16 tail (bore disc +1.5 mm) |
| Width | 3.71 m | superstructure ±1.855 EXACT (§D guard; tracks ±1.8225 inside) |
| Height | 3.00 m | drum cupola crest |
| Gun | KwK 36, visible run 4.495 m | 'double' flat-drum brake + §B3.1 bore |
| Gear | 16 interleaved stations (3-row layers), sprocket 0.62 F / idler 0.60 R raised | §B6 |

## LADDER r1-r2 (2026-08-06, resumes the slice-2 parked build)

The slice-2 silhouette lineage (3-plate bow, horseshoe at 2.74 m
proportion, curved mantlet, twin-drum brake) carried over; this round
ran the parked battery. World event mid-round: the factory belly pan
REVERTED at 15a67ea (§B2 CLARIFICATION) — the pre-revert pan had
curtained the ENTIRE interleaved wheel train at xi ±1.859 (past the
±1.855 guard; see shots/ww2-ladder-r1/tiger1-before). Post-revert the
identity read is restored with zero per-tank pan work.

### Fixes landed (each measured)
1. **AO-WALL END-FACE FIX (new class, banked):** the factory
   layered-gear AO walls span the wheel envelope to z ±2.72 — their END
   faces land inside BOTH wrap discs (sprocket 2.53 / idler −2.62), and
   the merged wall pair reads as ONE center-crossing audit candidate
   (bbox spans x −1.23..+1.23 → reach 0). Measured front 2 / rear 10
   band + 8/16 shoe, "(unnamed)" carrier = the LOD-wrapped hullShadow
   mesh. Per-tank fix in-profile: P.clear('hullShadow') + re-author the
   walls byte-equivalent but ending at z ±2.50, outside both zone
   windows. → clip --exact **0/0 + 0/0**.
2. **§B3.1 MUZZLE BORE** (owner order, law 32a6946): bore disc (0.62×
   tube r) through the exit-collar face; the twin flat-baffle drums keep
   their dark slot windows. Evidence: muzzle-endon/oblique crops in
   shots/ww2-ladder-r1/tiger1-r2 — the oblique shows rear drum / dark
   slot / front drum / collar / bore exactly per the KwK 36 photo class.

### Close battery (official rigs, post-fix)
- track-clip --exact: **0/0 band + 0/0 shoe** (from 2/10 + 8/16).
- tank-standard-check: clip ✓, contig 0 ✓, decor **mg1+1d** ✓ (loader
  MG34 fitting, 'mag' class + spare-link stamp; German grammar per
  §H.4 — no US silhouettes).
- turret-parent: stranded 2 / abutting 0 / dangling 0 — both unnamed
  sub-50% AABB overlaps (44%/40%); yaw-90 pair
  (shots/ww2-ladder-r1/tiger1-r2-yaw90) shows cupola, loader MG34, bin
  arc, wall hangers + spare links ALL yawing, deck kit static —
  adjudicated audit-artifact (documented negative).
- npm test: 166 + track-geometry PASS.
- Geometry record hash (NOT a freeze): 7b76a8c6 (46 / 72230).

### 14-view SELF-READS (shots/ww2-ladder-r1/tiger1-r2)
front 8.7 / frontleft 8.7 / left 8.8 / rearleft 8.7 / rear 8.7 /
rearright 8.7 / right 8.8 / frontright 8.7 / top 8.6 / hero-fl 8.8 /
hero-rr 8.7 / hero-toptilt 8.7 / close-front 8.7 / close-roof 8.6.
**Floor 8.6.** Weakest named reads: top view radiator-well field slightly
schematic vs the photo class; cupola vision-slit ring only reads at
close range; bin-arc strap seams read thin from directly above.

### §H.4 distinctness vs the ww2.js residents
vs **newc_tiger** (shots/ww2-ladder-r1/h4-newc_tiger): newc = stylized
flat single-row dished wheels, straight-wall drum-ish turret + tall
cupola, no stack shrouds; tiger1 = true interleaved 3-row train,
horseshoe + low drum cupola, shrouded stacks + Feifel drums + S-mines,
3-tone sprayed camo + zimmerit-era kit. vs **tiger2**
(shots/ww2-ladder-r1/h4-tiger2): Henschel sloped hull/turret, longer —
no confusion. Separable at a glance.

### Residuals / next-round candidates
- MG34 census fitting uses the 'mag' receiver class — a dedicated MG34
  fitting class (drum sight, slotted jacket) is a kit.js lane candidate.
- Feifel piping is straight cross-runs; the real corrugated hose read is
  a close-up candidate.
- NO ORACLE: §E re-source lane open.

### Law discoveries banked this round
1. **AO-WALL END-FACE CLASS (fleet-relevant):** factory layered-gear AO
   walls whose z-span (wheel envelope ± wheelR) ends inside a wrap-zone
   window flag the clip audit as an unnamed center-crossing candidate —
   check any Schachtellaufwerk/layered build whose sprocket or idler
   sits INSIDE the wheel span (tiger-class geometry). Per-tank
   hullShadow re-authoring with a shortened span is the sanctioned fix.
2. **LIVE-TREE AUDIT-JSON HAZARD:** shots/track-clip*.json is a shared
   mutable artifact — concurrent lanes overwrite it between a run and
   its read. Snapshot to scratchpad in the SAME command as the run.
