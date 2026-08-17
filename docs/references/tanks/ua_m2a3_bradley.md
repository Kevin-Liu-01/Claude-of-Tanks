# UA M2A3 Bradley — clone packet (measurement-only)

Roster id: **ua_m2a3_bradley** — Ukrainian-package M2A2 ODS-SA-style
Bradley. FAMILY CLONE: `variant('ua_m2a3_bradley', 'm2a2_bradley', ...)`
(src/vehicles/afvFamily.js) + `buildUAM2A3 = buildBradley +
addUkrainianBradleyPackage + bradleyFlankDressing`
(src/vehicles/profiles/afvFamily.js). The Ukrainian package: BRAT-style
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
  (modern3.js — §B2 donor bow-corner closure on the 1.40..1.44 plane,
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
