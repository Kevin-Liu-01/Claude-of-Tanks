# Kurganets-25 gun and mantlet correction — 2026-09-21

The owner requested a proper mantlet and autocannon on `kurganets25_x`.
The former turret loft ran across the gun receiver and barrel. Its tiny
receiver box was largely buried in the roof, leaving an unconvincing thin
visible tube. The correction restores the mounting recess, a closed receiver
and raised cover, transverse trunnions and seated bearing feet. The barrel
retains its compact length and stepped root collar, with an open 57 mm bore.
The gun axis, muzzle position, weapon statistics, coaxial gun, missile systems,
hull and running gear retain their existing configuration.

## Reference and authoring

The immutable approved assembled source remains
`kurganets25_x_assembled_20260918.glb`, SHA-256
`417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793`.
No source registration, comparison camera, target, or score floor was changed.
The private source is an authoring/comparison input; runtime geometry consists
of newly authored analytic solids. No source mesh or texture is shipped.

This supplied variant uses the compact 57 mm Epokha cannon, paired Kornet
launchers and the rear Bulat rack. Variant identity is corroborated by
[the model publisher's Kurganets development article](https://armoredwarfare.com/en/news/general/development-kurganets-25)
and [Rostec's parade report](https://rostec.ru/media/news/noveyshaya-boevaya-tekhnika-rostekha-vpervye-prinyala-uchastie-v-parade-pobedy-/).
The request does not substitute a different 30 mm turret or long 57 mm system.

Independent source calipers, in registered world metres:

| Witness | Measured stock |
| --- | --- |
| Object_29 recess floor | Y 2.71465 at X ±0.18, Z −1.0, −0.5, −0.35 |
| Object_31 receiver | 0.2366 wide × 0.1602 high × 0.4505 long |
| Object_31 raised cover | 0.2694 wide × 0.0771 high × 0.2466 long; roof Y 3.0764 |
| Object_31 barrel collar | 0.1037 wide × 0.1309 high × 0.2651 long |
| Object_31 tube | 0.0790 outer diameter; muzzle world Z 0.85705 |

The recess is open above a closed armor floor, not a through-hole into the tank.
Rear and front lofts join without doubled internal caps. The receiver narrows
into the collar and carries a transverse pivot. Bearing feet overlap the
floor and engage the pivot at every legal gun elevation. Receiver/coax stock
pitches independently of main-barrel recoil; existing gun material ownership
and the 57 mm weapon configuration are preserved.

## Verification record

Private evidence: `.qa-dev/kurganets-gun-20260921/`. Before/after geometry
hashes localize changes to the gun, gun inner material, mantlet, turret shell,
and turret detail. LOW also changes its combined static batch accordingly.
Original aft-hull and actual running-gear hashes remain exact in both quality
levels. The historical bow fixture's non-hull receipt was refreshed solely for
this authorized turret/gun correction; its original hull/gear receipts and all
source, air-gap, contact and moving-track assertions remain unchanged.

`kurganetsGun.selftest.mjs` checks independent source floor/cover witnesses,
first-visible receiver/barrel stock, and physical pivot and muzzle geometry
at legal elevations under recoil in HIGH and LOW. Inserting the former roof
makes the same recess assertions fail. The existing six-vehicle cradle suite
also passes its recoil, receiving-stock, material, LOD and disposal assertions.
Visual and release results are recorded below after final regeneration.

Direct native HIGH/LOW close-up review confirms the receiver is exposed and
the barrel joins the mantlet; the LOW model retains the same structure. With
the same loaded fill and creation options, comparison against the previous
builder increases visible geometry by 378 triangles in HIGH (63,226 → 63,604)
and 338 in LOW (42,644 → 42,982), with mesh counts unchanged at 42 and 40.
This is a creation-time geometry change with no new frame-loop work.

Fresh qualification passes with geometry minimum 94.6 against the unchanged
92 floor, dimensions 100 and floaters 100. Strict front/rear and moving-shoe
checks report zero overlaps, the standard check reports no unexpected holes,
and the sealed-body check passes all 33 views. Fixed-source fidelity remains
95.9 overall. The final neutral turntable/articulation board was reviewed
directly, alongside the native HIGH/LOW close-ups; this is a direct review,
not a claimed independent-agent score.

The complete anatomy update/check passes: 202 current anatomy and marking-seat
receipts, 1,745 modules and 404 track sides with no failed/outside-envelope
modules, and 606 technical diagrams current. The generator reports 93 existing
fleet dimension warnings; it reports no failed module gates. Unrelated diagram
bytes and manifest rows were preserved after the mandatory full-fleet refresh.
Type checking and the public production build pass; its registry probe finds
202 procedural playables and no GLB-sourced playable loading path.

Final integrated `tank:release:check -- --ids=kurganets25_x --gate` **PASS**.
All 1,125 tests passed in the same run: 403 pre-release, 680 core and 42 post.
The private build, centering, module alignment/hits, asset metadata, track
uniqueness, visible muzzle and barrel circularity checks all passed. Circularity
is 1.000 with 0.0 mm lateral firing-axis error. The separate public build and
full anatomy procedure above also passed. No gate or threshold was weakened.
