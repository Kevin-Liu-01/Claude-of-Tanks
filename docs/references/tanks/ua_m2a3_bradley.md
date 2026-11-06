# UA M2A3 Bradley — clone packet (measurement-only)

Roster id: **ua_m2a3_bradley** — Ukrainian-package M2A2 ODS-SA-style
Bradley. FAMILY CLONE: `variant('ua_m2a3_bradley', 'm2a2_bradley', ...)`
(src/vehicles/afvFamily.ts) + `buildUAM2A3 = buildBradley +
addUkrainianBradleyPackage + bradleyFlankDressing`
(src/vehicles/profiles/afvFamily.ts). The Ukrainian package: BRAT-style
reactive tile courses on hull bow + turret cheeks, tall side-armor
course, rear turret stowage wing + rack, roof MG, UA number decal.

## Gate enrollment — DECIDED: NOT ENROLLED (§5.354/§5.355)
**Measurement-only clone convention.** ua_m2a3_bradley has NO oracle
row in tools/procedural-fidelity.html and NO
docs/references/vertex/ua_m2a3_bradley.json — and by decision it stays
that way: there is no independent print for the UA package, and
enrolling the clone against the DONOR's 42manako print would
manufacture false deltas on every authored UA surface (tiles, course,
wing) that the donor print cannot carry. The donor m2a2_bradley row
carries the family's gate truth; the clone is held by MEASUREMENT
tools instead — hashgeo identity, see-through sweeps, strict track-clip,
and §B4/§B5 probes. Any future UA-specific reference drop re-opens the
enrollment question as a NEW decision.

## §5.349 fills + attached skirts (owner order, landed at 3635217c)
ORDER (verbatim): "the bradleys are still not filled internally (see
througable) and their side skirts/side armors are not attached to the
hulls properly or with attachments."
- **Shared dressing**: takes the family `bradleyFlankDressing`
  (modern3.ts — §B2 donor bow-corner closure on the 1.40..1.44 plane,
  8-panel skirt-mount course at ±1.652 with hinge seams + hanger/bolt
  blocks at every joint, raked mounting aprons, course end caps; all
  content |x| >= 1.4425, §B4-clear of the 1.395 shoe reach). Full
  grammar receipts: m2a2_bradley.md §5.349 section.
- **ua(a) shelf plate**: the 0.40x0.12 see-through window under the
  ERA/stowage shelf overhanging the rear deck ([y 2.04, z -1.88] world)
  — turret-owned skirt plate closing the shelf underside toward the
  deck; plate bottom 1.99 world clears the 1.98 engine-raise top
  through FULL traverse (§B5-safe by construction).
- **ua(b) bow window**: closed by the shared donor-bow closure (the
  203px bow-window receipt below).
- **ua(c) ISU-pedestal fill**: the ISU-pedestal pocket ([-0.687,
  2.818, -0.466] world, framed by mast+panel+dome) — pedestal thickened
  into its frame (optics-class fill, turret-local; turret box
  0.26x0.32x0.28 + dark cap).

## Receipts
- **See-through sweep** (worst-view y0-side-l, banked
  shots/bradley-b2/{before,after}/ua_m2a3_bradley.json): **4579 → 3785**
  px; bow window 203 → closed. HEAD re-run (1c0ba018) reproduces 3785
  EXACTLY (y45-side-l 3829). Partition-report note: the quoted "→3846"
  matches no banked or reproduced view; 3785 is the receipt.
- **Hash** (hashgeo at HEAD 1c0ba018): **4b3b33fc** (76 meshes,
  111050 verts) — matches the §5.354 re-bind (pre-round guard-era value
  f882ab20, marder1a3 packet guard list).
- **Track-clip STRICT at HEAD**: front 123 / rear 0 band + shoe 0/19
  (rear: hull 13 / hullDetail 6) — BYTE-IDENTICAL to m2a2_bradley and
  m3a3_bradley = the shared donor's pre-existing §5.316-documented
  debt; the UA package + dressing add ZERO offenders.
- **§5.356 coupling note**: the donor decomposition (m2a2 packet)
  applies to the whole family — the anatomy pivot remap lifted the
  clone's turret the same way (shared donor anatomy plates); the
  §5.361 float-fix landing (394da5ed) re-seats it. No clone-local
  action: the clone carries no gate row and its silhouette dims ride
  the donor spec.

## 268 — the source-measured shell and the frontline kit (2026-11-02)

The Ukrainian vehicle takes the shared Bradley rebuilt on the owner's supplied model (m2a2_bradley.md, 268): the measured
hull, the source's turret with the TOW launcher stowed on the left, the driver and TOW on the left, the engine right.
Owner, verbatim: "the m2a3 bradley needs a lot more decorrations and props too." The kit is seated geometry in
`profiles/afvFamily.ts` (`addUkrainianBradleyPackage`, `addUkrainianBradleyFieldKit`), not decor, so it renders in the
Node rasters and the contact probe sees it. No roof gun (the owner's field standard 2026-10-08); no cope cage (the
references show none on this mark).

- BRAT (photographed, research/ua_m2a3_bradley 1, 2, 4, 5, 6; round 3, blind A/B b2): two unbroken rows of thirteen
  0.36 × 0.32 m tiles along the whole upper side band on both sides (face x 1.57, the lower row on the skirt ledge 1.27,
  the upper under the plate top 1.93), from the stern to where the side's top falls along the glacis, the lower row on
  one more tile to the bow box; they cover the side boxes, vent and exhaust grille, which this vehicle leaves off
  (`bradleyFlankDressing(P, { sideFittings: false })`). Two rows of four across the upper glacis inside the deck crown,
  six across the folded trim vane, a column of two on the turret's left wall aft of the stowed launcher.
- Spare track links: two two-link runs on the nose shelf and one standing on the bow plate between the tow shackles
  (the shared glacis course gives way to the glacis tiles).
- Turret rear (round 3): an open railed cage of round bars (floor grate, posts, two rail courses, two brackets into the
  rear wall) in place of the small bundle rack, holding the kit bag, a camouflage-net bundle, two rucksacks, a bedroll
  and an ammunition chest. No mast box (the M2A2 ODS carries none): two whips on the roof's rear corners.
- An unditching log nested in the right roof gutter and a camouflage-net roll in the left, against the side plates'
  inner faces and the roof.
- Right rear: a welded basket hung outboard of the BRAT course from the plate top, standing on the skirt top: an
  ammunition chest with an ammunition can on its lid, a rucksack, a bedroll across its end rails.
- Left rear: a shelf on the skirt top with two brackets to the skirt face, two jerrycans on it against the BRAT course
  behind a strap on two posts, a net roll along their handles.

Everything clears the sweeps: the turret's low parts pass 2.18 m and over within 1.66 m of the ring, the 25 mm at −9°
passes 2.13 m and over to its 2.85 m reach; nothing of the kit stands above 2.0 m inside them (the nose links lie beyond
the muzzle). Triangles HIGH/LOW: the vehicle on the final shell without the kit 83,248 / 65,406, with it 89,192 / 70,282
(the kit 5,944 / 4,876; the pre-268 vehicle 94,740 / 76,588); round 3 (full BRAT rows, glacis tiles, bustle cage, net
rolls, bow links, no mast box) 91,216 / 72,018.
