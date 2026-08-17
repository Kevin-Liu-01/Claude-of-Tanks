# Strv 122 — reference packet (§5.248 ground-up rebuild, sweden lane)

## Identity
Swedish Leopard 2A5-class (Strv 122): the 122's roof armor arrays, Galix
dischargers, Swedish stowage, wavy skirt hems, L44 with the Leo sleeve/MRS.
Leo2a5 grammar kinship is legitimate; the geometry is a FRESH §K build in
`src/vehicles/profiles/sweden.js` (no `buildLeo2A5` call; the donor-clone
is retired; leopard.js stays byte-held).

## Instrument — WEAK (visual influence only)
`public/models/community-candidates/strv122_vavtrudner.glb` — "Stridsvagn
122" by Vavtrudner, CC-BY-4.0, 122 MB, **TRIPO AI-GENERATED**
(tripo_node/tripo_material fingerprint; ATTRIBUTION batch B). Owner order:
anchor all metrics to published dims, never to its proportions. LOCAL-ONLY
quarantine, never ships.

Registration (this round trued it up, all four maps): fused print
(`fixedMount`, `componentMasks:false` => whole-view IoU gate) with length on
raw X, nose +X (thin L44 tube width 0.024 at raw X +0.33..+0.49; the
turret-roof antenna spike tops the raw box, t64bv1-class) -> **yawOffset
-PI/2** (ztz99a2 convention). Pre-fix rows measured the print sideways
(overall read -84.6%; the 15.6 whole baseline was a scale artifact).

## Spec anchors (published, sovereign)
hull 7.72 / overall 9.97 / width 3.75 / height 3.02 (p95 roof = the sight
line: PERI/EMES/crosswind kit tops pinned ~3.0; the thin mast pair stays
under the p95 column window). Rig patched to the measured build
(turretPivot [0,1.70,-0.30], gunPivot [0,0.33,0.90]; bore axis 2.03,
muzzle +6.18 world).

## Instrument ceiling (cap case, measured)
At the gate frame the print's body reads 7.42 long vs my published 7.72
(-3.9%) with AI shape wobble on every edge. Measured view table at the
delivered state: left 87.1 / right 87.2 / front 87.5 / rearLeft 88.2 /
rear 88.5 / rearRight 88.6 / frontRight 89.4 / frontLeft 89.6 / top 94.9.
Six controlled experiments oscillated the min view in the 86.2-87.5 band
(roof raise, belly drop, sleeve fatten, hem drop/raise, wedge widen, tail
kit — each helped one view and hurt another); ~87 is the practical
whole-view ceiling against this print at published dims. The build stays at
the max-min configuration. If the owner wants strv122's gate CLOSED >=90,
either certify the cap (weak instrument, pre-declared by the §5.248 order)
or supply a stronger print.

## Round receipts (honest baseline -> delivered)
Baseline (donor-clone vs the print, post-yaw-fix): whole 87.2 / dims 86.6.
Delivered ground-up (gate x2 identical, hash x2 bit-identical 4f5694d4):
**whole 87.1 / dims 100 / floaters 100**; fidelity overall 89.8-89.0.
(The donor baseline's 87.2 was measured with dims 86.6 — the clone was
mis-scaled donor geometry; the rebuild carries published dims exactly and
matches the print to its practical ceiling at the same time.)

Identity kit carried fresh: two raised roof-armor fields + per-side plates,
wedge turret via polyMultiLoft (apex +2.55 world), connected rear
basket/rack complex, bustle side stowage, Galix six-tube banks on both rear
walls, PERI R17 + EMES housings, hatch rings + Ksp ring mount, crosswind
mast + antenna pair, two-course wavy-hem skirts (front five deep panels at
±1.875 carrying the 3.75 width, rear seven inset panels), splash-board
chevron, seven-wheel §H family course with the leo mechanical stations.

## NEXT
1. Cap ratification (or a stronger print) for the whole-view rows.
2. Critic-lane detail passes: skirt hanger detail, Galix cap faces, roof
   armor bolt cadence, rear-wall grilles depth.
3. If a repair lane ever normalizes the print (z-stretch +3.9% body), the
   sides should clear 90 — re-ladder then.
