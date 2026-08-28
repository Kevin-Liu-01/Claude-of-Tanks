# Strv 81 — reference packet (§5.248 ground-up rebuild, sweden lane)

## Identity
Swedish Centurion Mk 3, 20-pdr era. Centurion grammar legitimately shared
with the frozen centurion3 (bad74e60 lineage) but the geometry is a FRESH
§K measured-loft build in `src/vehicles/profiles/sweden.js` (no donor build
calls; the old donor-clone `centurionBuild(P,3)+package` is retired).

## Instrument
`public/models/community-candidates/strv81_mmdsonic.glb` — "Strv 81" by
MMD_SonicNewYear, CC-BY-4.0, EXTRACTION-SUSPECT (WT-style naming; Strv 81
exists in War Thunder) => measurement-only, LOCAL-ONLY quarantine, never
ships (ATTRIBUTION §5.248 batch B).

Registration (this round trued it up): `turretNode ^turret_0$`, `gunNode
^gun_0$`, autoPivot, **yawOffset PI** (raw scene faces -Z; the pre-fix
extract auto-flip read flip:true; carried in the row per the ztz99a2
convention so every harness agrees — fidelity/critic/evaluator maps +
vertex REG).

## Dims true-up (spec change in src/vehicles/sweden.ts)
`hullLengthM 7.82 -> 7.56`. 7.82 was a donor-clone registration error: the
committed centurion3 family value is 7.56 (same chassis) and the print's own
hull mask reads 7.565. Overall 9.85 / width 3.39 / height 3.01 stay the
Swedish published figures. Rig pivots patched to the measured build
(turretPivot [0,1.76,0.35], gunPivot [0,0.32,0.75]; bore axis 2.08).

## Certified-cap candidate — THE WHIP PAIR (oracle defect)
The print fuses two large raked whip antennas INTO turret_0: bases (±0.40,
y 2.72, z -0.45/-0.28 build frame), raked back over z -2.47..-0.27 with
tops 3.15..4.17 (extract turretZProfile + gate work orders). Matching them
puts ~20-25 build columns into the dims p95 roof (heightM would read 3.5-3.6
vs published 3.01 => dims ~0); omitting them caps every row they cross:

- side_whole / side_turret: ~10 matched columns at 0.3-0.55 m err + 3-5
  ONLY-REF cover columns beyond the metal bustle,
- front_whole: the x ±0.4 columns read ref tops 3.7-4.2,
- stations: slices 2/3/4/6 topPct 18-42 (trim absorbs only two).

Build carries base-matched, p95-safe short whips (tips <=3.04). QUEUED FOR
THE ORCHESTRATOR LANE (§E): vlo-class excision of the two whip prisms from
turret_0 (t64bv1-rail/ztz85_iii-whip class). After excision the whip rows
become satisfiable and the ladder resumes; alternatively certify the caps.

## Round receipts (honest baseline -> delivered)
Baseline (donor-clone vs the new print, first honest run): min 0 —
hull 65.4 / whole 27.9 / turret 0 / stations 15.6 / dims 57.5 / floaters 100.

Delivered (ground-up build, gate x2 identical, hash x2 bit-identical
11e5e876): min 34.9 — hull 76.1 / whole 46.9 / turret 45.9 / stations 34.9 /
**dims 100 / floaters 100**. Fidelity whole-views 89.4-96.9 (overall 91.9).
whole/turret/stations are whip-capped (above); hull is NOT capped — its
NEXT ladder is real work (below).

Floater lessons banked this round: spotlight must seat ON the brow plate
(the old bracket floated between wall top and roof cap — 5-pose islands);
rear flaps hang from the fender falls, not the shelf; tire tone needs the
gearFloor/tireHex ambient re-attach or shaded far-side gear drops under the
gMask brightness threshold.

## Owner interim landing absorbed (c425f495)
The owner's parallel session rebuilt the OLD donor-clone turret with: (1) a
low cast-shell loft + (2) unequal skewed crown plates + (3) a right-wall
ventilator/search housing + (4) a global turretG y-squash 0.82. This build
supersedes (1)/(4) with the measured polyMultiLoft walls + rear-biased roof
cap + brow (turret rows 0 -> 45.9 whip-capped; crown/cheek lines match the
print's 2.36-2.85 band directly). (2) and (3) were ABSORBED onto the
measured shell (skewed crown plates on the roof cap; concentric ventilator
drums + 6 radial ribs at the measured right-wall station, x 1.02-1.15,
y 2.18 world, z -0.27 world).

## §E EXECUTED — batch 58 (2026-08-17, §5.248 §E round)
Whip-pair excision LANDED per the filed plan (repair_oracles.py batch 58,
_index_surgery on turret_0_turret_0_0): the pair censused as EXACTLY two
index-connected 46v/68t thin raked prisms (raw tops 2.098/1.842 = gate
4.20/3.69 — the packet's own "ref tops 3.7-4.2" front receipt); rule boxes
hit (2, 92, 136) exact; rebuild_bounds=True (the pair owned the prim's
y-max). The 2-6-tri AA sliver debris at gate 3.0-3.17 (cupola region) is
NOT whip content and stays. Receipts: .bak = pristine bda892df…, output
e1f0c2cb… byte-idempotent ×2. Gate ×2 BIT-IDENTICAL (07:49, PRE the owner
§5.300 articulation commit c2dc8924 08:14): min 34.9 -> **50.3** — stations
34.9->63.2 (+28.3), whole 46.9->59.8, turret 45.9->50.3, hull 76.1->68.9
(shared-frame re-anchor debt: the excision dropped the model top 4.20->
~3.2, re-binning every court — m26/m47 keep-the-warp class), dims 100
HELD, floaters 100 HELD. SUPERSESSION NOTE (§5.299/§5.300): the owner
ordered "undo strv 81" — lane A reverts the BUILD (including the 08:14
articulation whose 08:28 re-gate wrote the in-flight 0/13.3 ledger row);
per the §5.299 adjudication this print repair is "harmless, stays as
reference" — the whip rows become satisfiable for whatever build lane A
restores.

## NEXT (hull ladder, resumes after the whip excision lands)
1. plan_hull 75-80: the ref x ±1.76 bracket sliver at z -2.53 (print-only,
   cover cost); center-plan nose 3.34-3.42 refinement vs ref 3.35.
2. front_hull 76-78: outer-column skirt-hem/fender-lip band (ref 0.64..1.68
   at |x| 1.63-1.68); sprocket/idler hardware width (gearEndWheelHardware
   reaches x 1.63 at xc 1.315/trackW 0.54 — ref band-to-zero columns end
   1.61).
3. side_hull 85+: idler-approach band bottoms (ref 0.22..0.59 slope) —
   contact pins at 2.10/-2.44 got halfway; consider idler y/r again.
4. Engine-deck louvre stack vs the ref 1.94 line (dy-coupled; re-measure
   after every registration-moving change).

## §5.299 REVERT — owner order: undo the §5.248/§5.271 ground-up build (2026-08-17)
Owner order §5.299 (lane A): undo strv81 + strv122; the §5.300 adjudication
includes the in-flight c2dc8924 turret articulation in the undo. Reverted to
the pre-wave donor-clone build at 75780d72^ (both sweden files restored
byte-exact; delivered uncommitted-unstaged). What went: the ground-up welded
build (11e5e876 wave delivery, 8fdec56c live after c2dc8924 articulation,
56/55,277), the 7.82→7.56 hullLengthM true-up, and the armorPatch rig row.
What returned: centurionBuild(P) donor + addStrv81Package (turret plates,
radio pair, decals), spec hullLengthM 7.82.
- Reverted hash: **911d5770** (70 meshes / 85,189 verts). Before: 8fdec56c.
- Honest gate row ×2 bit-identical at the reverted build: **min 0** (hull
  52.9 / whole 21.9 / turret 0 / stations 16.5 / dims 13.3 / floaters 100)
  — the expected pre-wave min-0 class vs its print; note the registration
  maps keep the corrected π yawOffset, so rows are honest-current, not the
  historical pre-wave numbers. Tool-written rows only.
- Guards unmoved: centurion3 63f6a82c, leo2a5 6ecdfb06.
- §5.254 pairs: shots/sweden-undo/{before,after}/strv81/ (14 sheets each,
  captured at their respective trees, 0/14 byte-identical).
The §5.248 ladder notes above remain history; the NEXT list above is
suspended while the donor-clone build stands.
