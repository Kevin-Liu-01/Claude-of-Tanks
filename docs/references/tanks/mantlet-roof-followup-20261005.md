# Abrams and Bradley mantlet fit follow-up — 2026-10-05

## Scope and construction

The owner requested better M1A1/Linebacker mantlets, removal of the block behind
the Abrams shield, a proper Linebacker roof and optics, and a better M3A3 mantlet.
This regional repair covers seven legacy M1A1 IDs (`m1a1`, `m1a1ha`, `m1a2`,
`m1a2_tusk`, `m1a2_sepv2`, `m1a2_sepv3`, `ua_m1a1`) plus `m3a3_bradley`
and `m6_linebacker`. Internal legacy IDs do not rename the displayed roster.

M1A1 uses a finite raked 105 mm shield, a hollow curved rear casting and a
matching concave turret throat. Pivot-centered journals enter annular bearings.
The lower returns are split around the recoil passage, the top and chin are
closed stock, and gun/coax openings remain real. HA/UA lamps sit on a finite
stepped support ahead of the fixed cheek. The earlier deep rectangular rear
extrusion is removed. Modern M1A2 source models and unrelated Abrams stay intact.

M3A3 gets a rounded, raked casting with working gun/coax passages, stepped
sleeve and seated fasteners. Split side journals and receiver cheeks carry the
assembly without a transverse solid axle obstructing recoil. Its repaired
high trunnion and closed sloping roof remain; hull and −9°/+30° limits stay intact.

Linebacker's shaped shield, hollow rotor and annular bearings fit its concave
roof recess. Top/chin returns close the moving casing. Its new continuous center
roof carries a seated service panel, separate low commander panorama, gunner
sight and two flank cameras. Eight optical channels are visible. Existing 90%
turret scale, compact four-tube missile pod, M2 station and Bradley chassis remain.

Mechanical stops use the existing shared simulation policy. All seven M1s keep
−10° directly forward, with model-specific side/rear stops for real stowage.
Linebacker keeps −9° through 125° of absolute traverse, then limits depression
around rear equipment (−5° at 140–150°, −7° at 160–180°); +45° remains.
These are measured model-clearance envelopes, not historical specification claims.

## Independent evidence

Local evidence root: `.qa-dev/mantlet-fit-followup/`, with the separate M1
review under `.qa-dev/m1a1-photo-repair/critic/`. Reports pin exact source,
generated-group and image hashes. Earlier visual/asset passes in the October 4
packets describe earlier geometry and cannot certify this follow-up.

- M1 authored checks: 72,522 legal hull/equipment poses across HIGH/LOW;
  zero new-mantlet crossings. Fixed turret checks, finite roof volumes and
  66 recoil samples per build also pass. Modern controls and preserved chassis
  meshes remain identical. Full-spec review changes only these nine vehicles;
  the other 211 records are unchanged from integrated base `703b16e40`.
- M3/M6 fresh fills: 483/663 poses per quality have zero fixed/moving triangle
  crossings; 31 recoil samples and finite fill-volume checks also pass.
  M3 retains its exact 250-box hull, uses 30 turret boxes and zero gun boxes.
  M6 uses 208 hull/6 turret/15 launcher-frame boxes; its central gun bay is empty.
- M6 full hull sweep: 8,856 actual triangle poses pass; 19,440 projected poses
  have at least 11.42 mm clearance. The prior unrestricted −9° aft setting
  really intersected rear equipment and is retained as a failing control.
- Current focused HIGH/LOW regressions pass for both Bradleys; M3 minimum
  gun/hull clearance is 23.66 mm. All four Linebacker missiles originate from
  their physical mouths. Focused tests retain original defective geometry as
  negative controls, rather than only checking authored constants.
- Independent HIGH review: all 26 native Gallery frames accepted; roof, optics,
  curved casings and joints remain connected at pitch extremes. No render-only
  mesh modifications or diagnostic materials are used. Camera-only helpers
  are confined to ignored local tooling.

## Retained failures and final release status

M3's historical disassembled-reference comparison remains failed under the
owner's explicit scoped publication approval. That approval does not waive
physical checks. Its prior volumetric scan was 48.73 L, versus 23.50 L on base:
unchanged hull residue plus narrow fitting/primary-stock slivers and intentional
moving-bay air. It is not an identical inherited pass; a fresh result is required.
The native 33-view sealed check is a separate measurement.

SEPv2's unchanged barrel/front-fitting intersections remain failed. Every
remaining HIGH/LOW offending pose was replayed on exact integrated base
`703b16e40`, with matching counts and byte-identical triangle witnesses.
The new mantlet is clear. This is named inherited debt, not a whole-vehicle pass.

The first refreshed M1 fills were rejected: a gun-owned plug obstructed recoil
and fixed turret fill occupied the elevation cavity. Generation now protects
finite HIGH/LOW recoil prisms and reciprocal elevation sweeps, including every
intermediate angle through a conservative chord bound. It removes only colliding
turret/gun fill voxels after closure; authored stock and hull fill stay intact.
Raw residual air remains reported, with no audit exemption. Focused controls and
independent policy review pass. The final regenerated records pass all four
independent HIGH/LOW checks: 924 fine recoil poses, 1,344 fixed/moving turret
poses, 2,604 reciprocal finite-volume poses and 924 recoil-volume poses, with
zero contact exemptions. All seven hull payloads are byte-identical to the
previous records; remaining gun/turret voxels are strict subsets of the rejected
occupancy. Raw residuals remain 65.8/101.1/43.6/80.9/66.7/40.3/81.0 L for
M1A1/HA/HC/SA/AIM/FEP/UA respectively, not a watertight pass.

The five local commits were rebased onto `2e299bec9`. Independent integration
review compared all nine vehicles in both qualities with pre-rebase `aa62f89bf`:
complete authored mesh/index buffers, hierarchy, rig/world transforms and
floor seating are identical in all 18 cases. SEPv2's offending base geometry
also matches `703b16e40` exactly on the new main; its inherited contact status
is unchanged. The upstream aim change preserves the authored mechanical limits.

Fresh Bradley raw water diagnostics are 49.05 L (M3) and 54.95 L (M6), both RED.
Independent owner-span classification found M3's central 25.234375 L and M6's
entire central 1.21875 L outside each separate body owner: real articulation air.
M3's remaining 0.78125 L of central stationary residue matches all 50 prior cells
exactly. No new stationary central hole was found; noncentral residual is retained.

The complete 220-vehicle anatomy update/check passes, including all 660
technical diagrams, 1,988 authored modules and 440 track sides. The existing
110 dimension warnings remain warnings. Refreshed assets and centering for
these nine IDs, geometry-ledger update/check, the 33-view sealed ledger,
typecheck, attribution and public build all pass.

Final independent native review accepts 70 fresh frames: 22 M1 HIGH, 22 M1 LOW
and all 26 Bradley LOW views, alongside the three owner photographs. All 26
manifest source/fill entries match current files. The earlier Bradley HIGH
review remains valid by exact exterior/fill identity. This includes every M1
front, base/HA elevation extremes, kit/net quarters and the protected modern
M1A2 comparator. No exposed fill or new regional visual defect was found.

Composed release, integrated npm tests and real Garage/production verification
remain pending. No pending check is presented as passed.
