# pt91_twardy — PT-91A Twardy — oracle packet

## Source
`public/models/community-candidates/pt91a_manako.glb` — WT-style part
naming (chassis_vlo, wheel_big/small_N, track_1, misc_a/b), EXTRACTION-
SUSPECT per docs/ATTRIBUTION.md; LOCAL-ONLY quarantine (§5.248 batch B).
Owner identity brief: "ERAWA-1/2 ERA coverage, the distinctive Polish
turret bins, PCO sights — misc_a/b print split usable after the _vlo
audit."

## _vlo AUDIT (this round — REQUIRED before metric use; verdict: POLLUTED)
`chassis_vlo` is a whole-vehicle LOD shell riding the top-level HULL
side of the scene (sibling of `chassis`): it bakes the at-rest TURRET and
the FULL GUN into every hull mask. Receipts (baseline workorder + gate):
- ref side_hull carries the gun band 1.84..1.56 out to z 6.25 and
  turret-height tops 2.07-2.46 across the whole works band;
- the hull-row REGISTRATION (span mid + mean-dy, computed on hull rows and
  REUSED for whole/turret rows per GEOMETRY-GATE) inherits the bake: side
  and front rows register with dy ~0.27-0.29, poisoning EVERY side/front
  row (whole 4, turret side 0.6) regardless of build quality;
- stations z-range inflates toward the baked tube (~10 m span) — smeared.
Building to match any of this would MIRROR THE BAKE (forbidden, §E VLO-
BAKE POLLUTION law — the repair is a COUPLED landing).
ORIENTATION: gun +z as loaded (no yawOffset needed — harness renders
confirm; the raw accessor min/max of this print LIE, see census hazard in
pl01.md).

## Measured lines (honest rows only: whole/plan + turret plan, absolute)
- rear rack/drums 1.31-1.40 to -3.71; engine stack tops 1.45-1.56 over z
  -3.15..-2.03; bustle 2.04-2.07 z -1.58..-1.14; met-mast spike 3.52 @
  -1.02 (1 col); dome band 2.13-2.29 z -0.8..-0.13; cupola crest 2.46-2.60
  z -0.02..+0.43; ERA wedge fall 2.52-2.46 z 0.43..1.66; IR spike 2.54 @
  1.44; tube band 1.84..1.56/1.62 to muzzle 6.25.
- plan: hull edge ±1.75, fender fronts 3.84 (PRINT-LONG vs published hull
  6.95 — the print's hull body reads ~7.38), rear -3.54 with drum slivers
  -3.62..-3.68 and the |x|<0.63 powerpack notch at -3.37; turret shoulders
  ±1.50-1.52, ERAWA-2 wedge tips at plan 1.72 @ |x| 0.5-0.6; evacuator col
  +0.18 to 4.71.

## Published dims (spec true-up applied this round, with sources)
hull 6.95 / overall 9.67 / width 3.59 / height 2.19 — the landed §5.248
REG bracket (Bumar-Łabędy PT-91 data; the old spec's 6.86 was the T-72M1
donor's hull figure). Gate dims 100 (heightM 2.20 / hull 6.89 / overall
9.61 / width 3.59). Build frame: hull body -3.41..+3.54 (mid 0.065 = the
polluted-registration counterweight), rear drums -3.42, muzzle 6.25 (the
print's own muzzle = rear + 9.67 exactly).

## Certified oracle-defect caps (pre-repair; dims never covered)
1. chassis_vlo hull-mask bake: hullCurves, stations, front_hull/side_hull
   rows AND the side/front registration of whole+turret rows — capped at
   ~0-10 until the excision lands. plan rows register clean (dy 0.04).
2. PRINT-PROPORTION: hull +6% long, turret crest +12-13% tall vs published
   — plan/side residuals vs the published-first build (bow cover ~4 cols,
   crest columns ~0.25) certified against the normalize recipe below.

## Reported normalize plan (orchestrator lane; warp law v2, COUPLED)
1. DELETE node `chassis_vlo` (LOD shell; the true hull is `chassis` with
   its 3 primitives + wheels + track) — the §E LOD-delete coupled class:
   land together with a poland re-gate (this build will NOT mirror the
   bake, so the excision alone moves rows UP, no proc half needed beyond
   re-running the gate).
2. Axis-wise rescale to published dims: z x0.94 about the body mid
   (hull 7.38 -> 6.95), y x0.89 above the 1.56 deck line (crest 2.46-2.60
   -> 2.19-2.31), width is already held by the loader.
3. Re-run the pt91_twardy gate; expected: hull/station rows become
   satisfiable, side/front registration de-poisons, whole/turret side rows
   release toward the plan rows' quality.

## Gate close (round 1, ×2 bit-identical)
hull 0 (capped) | whole 4 (capped registration) | turret 0.6 (capped) |
stations 0 (capped) | dims 100 | floaters 100. The two components the vlo
bake cannot touch — dims and floaters — are both 100. Audits: track-clip
--exact --strict 0/0+0/0; turret-parent 0/0/0; standard-check contig 0
holes (fender-slot floor plates, strict-sweep-proven), census mg1+6d.

## Build notes (ground-up §5.248 rebuild)
buildPT91Twardy in src/vehicles/profiles/poland.js — fresh loftHull to
the published envelope with the print's engine-stack cadence (NOT
buildPT91M; russia grammar reused), ERAWA-1 glacis field + armored
forward skirt third + ERAWA-2 turret cheek wedges at the measured 1.72
plan tips, the Polish flank bins, PCO SKO-1M/Drawa-T sight suite, WKM-B
12.7 low-slung on the right shoulder (pt91m height-law precedent),
met-mast at the print's own -1.02 station on a real pedestal cone (r1
floater receipt: a skin-less seat floated at yaw 90), Tellur-style
asymmetric smoke banks (6L/3R), rear transverse drum train + rack +
unditching log at -3.42, 2A46MS via ruBoot + tubeGun + muzzleBore.
Rig: turretPivot [0,1.38,0.02], gunPivot [0,0.32,0.50], barrel 5.73.
