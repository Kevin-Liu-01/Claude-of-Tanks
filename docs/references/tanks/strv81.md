# Strv 81 — reference packet (§5.248 ground-up rebuild, sweden lane)

## Current status (release 262, 2026-10-27): the Strv 81B rebuilt from historical references

Owner, 2026-10-27 (as for the Centurions). `strv81` is the `strv81` mark of `src/vehicles/profiles/centurionFamily.ts`:
the Strv 81B (Centurion Mk 5, "C V", bought 1955) with the 20-pdr Type B barrel (SV, F81). The 0.82 turret squash of the
old build is gone; the print-fit history below is superseded. Implementation: DONE.

Mark identity: the Mk 5 pattern (no bomb thrower, the cupola machine-gun mount) with the Type B's short fume-extractor
can 47 % along the tube (Strv 81B photographs), the cupola Ksp (the fleet `mag` class; the period gun was the ksp m/39B
Browning, F81: no Browning class exists in machineGunGeometry.ts), Swedish twin-pod headlights, spare-link brackets on the
glacis in place of the Mk 5's bin (SV, F81), two Swedish whips, no searchlight or Lyran (SV). Spec hull length 7.82 ->
7.56 m (7.82 is the later marks' longer deck; SV gives 7.55).

| Item | Old build | Source | Rebuild |
|---|---|---|---|
| Turret height | the Mk 3 casting squashed to 0.82 | Strv 81B photos: the full Centurion casting | unsquashed casting, roof 2.67 |
| Gun | 20-pdr with a 5.15 m tube and the inherited extractor | Type B: concentric extractor (Q20), mid-barrel in the photos | 4.97 m from the trunnion, short can at 47 % |
| Glacis | inherited Mk 3 links | link brackets (F81) | two three-link runs on carriers on the glacis |
| Lights | inherited | Swedish lights; no searchlight or Lyran (SV) | twin-pod headlights, blackout light boxes on the front guard bins, the convoy light box |
| Rear deck | none | a long box across the end of the rear deck (the overhead photograph) | a 2.06 m box on two feet over the transverse grille |

### Sources (release 262)

| Key | Source |
|---|---|
| W | https://en.wikipedia.org/wiki/Centurion_(tank) (infobox from the *User Handbook, Centurion Mk 3, 5 and 6*, 1965) |
| SV | https://sv.wikipedia.org/wiki/Stridsvagn_Centurion_i_Sveriges_försvarsmakt |
| FAS | https://man.fas.org/dod-101/sys/land/row/centurion.htm (four double and two single return rollers) |
| RU | https://znanierussia.ru/articles/Центурион_(танк) (76 mm glacis at 57 deg, nose plate at 46 deg) |
| AC3 / AC5 | https://www.armedconflicts.com/-t73133 / https://www.armedconflicts.com/FV4011-Centurion-Mk-5-t73135 |
| Q20 / L7 | https://en.wikipedia.org/wiki/Ordnance_QF_20-pounder / https://en.wikipedia.org/wiki/Royal_Ordnance_L7 |
| TE | https://tanks-encyclopedia.com/centurion-mantletless-turret/ (Discharger No. 1 Mk 1, the loading hatch in the left wall) |
| F81 | https://forum.warthunder.com/t/strv-81b-swedens-second-centurion/359700 (KATF 1960 catalogue, Lindström) |
| ORACLE | the registered Strv 81 model `public/models/community-candidates/strv81_mmdsonic.glb` (md5 5daeeb2de58a7b3b85fa4e60b4595a5f), width-normalised to 3.38 m, measured by raycast sections (lane tools `.qa-dev/cent262/turret-map.mjs`, `skirt-oracle.mjs`, `wheels-oracle.mjs`) |
| Photos (Commons) | Mk 3 Bovington front-left / rear-left (CC BY-SA 4.0); Mk III Swiss side and front (PD); Mk 5/2 Delft head-on and turret front (CC0); Strv 81A/81B period photographs (PD Sweden): `File:Centurion_Mk_3_front-left_2017_Bovington.jpg`, `File:Centurion_Mk_3_rear-left1_2017_Bovington.jpg`, `File:Centurion_MK_III_Seite_-_Schweizer_Armee_-_Steel_Parade_2006.jpg`, `File:Centurion_MK_III_Front_-_Schweizer_Armee_-_Steel_Parade_2006.jpg`, `File:Centurion_Mk._5-2_pic1._5-2.JPG`, `File:Centurion_Mk_5_105mm,_Museumdag_2010_picture-013.jpg`, `File:Strv_81B_(C_V)_1.jpg`, `File:Strv_81B_(C_V)_2.jpg` |

### Shared family gap table (hull frame: +Z forward, ground y 0, hull centred on z 0)

| Item | Old build (print fit, to 261) | Source | Rebuild (262) |
|---|---|---|---|
| Hull length / width | 7.56 / 3.38 (spec) | 7.557 m; 3.38 m over side plates, 3.28 without (W) | 7.61 front guards to rear fittings; 3.384 over the plates |
| Overall height | 2.94 (spec) | 2.94 m (W) | turret roof 2.67, cupola ~2.95 |
| Ground clearance / belly | 0.53 | 0.508 m (W) | 0.51 |
| Glacis | stepped driver plate, deck 1.69 -> 1.51, pointed prow to 3.458 | 76 mm at 57 deg over a 76 mm nose plate at 46 deg, flat in plan (RU, W) | nose edge z 3.62 y 1.08; 57 deg upper plate to the 1.66 roof line at z 2.66; 46 deg nose plate to the belly at z 3.06 |
| Roof / engine deck | 1.66-1.75 loft, deckSplit shelves | roof 1.70, raised louvred deck 1.75-1.80 (ORACLE) | roof 1.70; engine deck 1.765 with two radiator louvre fields, engine/gearbox covers, rear transverse grille |
| Tracks | centres +-1.236, 0.5925 wide | 610 mm (AC3); centres +-1.30 (ORACLE) | centres +-1.30, 0.61 wide |
| Road wheels | r 0.40 at 2.25 / 1.40 / 0.55 / -0.50 / -1.35 / -2.20 | 803 mm (forum citing the handbook); three Horstmann bogies (W) | r 0.40 at 2.36 / 1.48 / 0.52 / -0.36 / -1.32 / -2.20 (0.88 within a bogie, 0.96 between) |
| Idler / sprocket | idler z 3.30 y 0.96 r 0.345; sprocket z -2.95 y 0.99 r 0.37 | ORACLE: idler z 3.27 y 0.96 r 0.34; sprocket z -3.12 y 0.88 | idler z 3.27 y 0.96 r 0.33; sprocket z -3.12 y 0.88 r 0.37 |
| Return rollers | six at y 0.996 r 0.11 | four double + two single (FAS); ORACLE y 1.21 | six at 2.87 / 1.90 / 0.70 / -0.65 / -1.80 / -2.58, y 1.21 r 0.10 |
| Side plates (skirts) | six panels, x 1.61, 1.48 -> 0.60 (Mk 5/2 hem 0.84) | three 6 mm panels a side (forum); ORACLE hem 0.65, rising over the sprocket (0.85 at z -1.8, 1.15 at -2.8) | three panels a side, 1.535 -> 0.66, the rear panel's hem rising to 1.24 over the sprocket, the front panel's edge raked up to the front guard |
| Track guards / bins | fender horns over the idlers | front guard bins with raked faces (Dutch Mk 5/2, Strv 81B photos); long bins on the guards | front guards with raked mudguards, outboard valances and angular bins; long four-door bins flush with the roof beside the turret |
| Turret ring | z 0.35 y 1.78 | 74 in (1.88 m); ORACLE centre z 0.47 | 1.88 m ring centred z 0.47 on the 1.70 roof |
| Turret casting | wedge nose +-0.40 at local z 1.46-1.55, crown 2.50-2.57 plus a 2.75 ridge, shelves to +-1.51 | rounded cast front, broad flat roof, near-vertical walls (photos); ORACLE: walls +-1.20, roof 2.67, front at z 1.40-1.62 | 13-station cast loft: walls +-1.18-1.20, roof 2.67, 1.64 m front face, bustle to local z -2.00 |
| Turret bins | shelves and duffels | bins round the casting, the round loading hatch in the left wall (TE; ORACLE gap at z 0) | one bin on the right, two on the left round the hatch boss, from the bin course (2.00) to the shoulder (2.44) |
| Bustle | lofted bustle with rack | tall flat-faced rear bin (Bovington rear) | 1.72 m wide, 0.38 m deep rear bin up to the roof line |
| Mantlet | slab chin and cloth blocks | large cast mantlet under a canvas cover (photos) | cast mantlet inside a drawn canvas drape, 1.32 m wide, proud of the casting face, moving with the gun |
| Smoke dischargers | Mk 3 three tubes, Mk 5 six | Discharger No. 1 Mk 1: two rows of three on each cheek (TE) | one 2x3 block high on each front corner, turned out 24 deg, with its guard bar |
| Commander's cupola | drum stack with sight vane | all-round vision cupola on the right (W) | 0.80 m cupola base, vision drum with eight periscopes |
| Mantlet cover | slab chin and cloth blocks | canvas cover laced round the opening, a sleeve on the barrel (Bovington, Delft photographs) | a curved cast mantlet under a pleated cover with lacing eyelets, a strapped sleeve, the coaxial gun's boot and the sight's armoured hood |
| Hull kit | | pioneer tools, the auxiliary charging engine's silencer on the left rear guard (forum), the travel lock | tools in clamps on the left bin lids, the silencer box, the folded travel lock, the convoy light box |


## Identity
Swedish Centurion Mk 3, 20-pdr era. Centurion grammar legitimately shared
with the frozen centurion3 (bad74e60 lineage) but the geometry is a FRESH
§K measured-loft build in `src/vehicles/profiles/sweden.ts` (no donor build
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
