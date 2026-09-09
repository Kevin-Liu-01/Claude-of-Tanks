# Abrams X muzzle R4 — source-derived component checks

This is a local authoring record, not a full visual or release acceptance.
The selected loose OBJ is unchanged, SHA256
`85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`,
in the fixed frame `[-rawX, rawY + .203945, .357965 - rawZ]`.
Source68 supplies the sleeve, clamp and muzzle reference sight (MRS).

## Corrections and real openings

The R3 plan outline identified a missing lateral sleeve fitting, not an
undersized entire barrel. The new stock retains the main tube through
Z5.558175, then models the measured R94.165mm collar, its contraction to
R84.34mm, and the R77.24mm nose beyond Z5.605275. The main bore remains
R60.64mm, with its original recessed termination at Z4.843555. The cannon
axis, mantlet, linkage and gun pivot do not move.

Two small rounded clamp wings replace no surrounding air with a bounding
box. The source stepped saddle, base, three U-notched cradles, transverse
pin and six bolt heads carry the separate MRS. Its body is deliberately
oblique because the selected source's sight is oblique; this does not angle
the cannon or any machine-gun barrel. The former two filled MRS boxes are
removed.

The first R4 close-up revealed that a flat cylinder end was still wrong.
Source68/3519 has a slanted hollow mouth. The authored shell now uses an
analytic circular wall trimmed by the area-weighted plane of eighteen
source lip-plane measurements, with an actual recessed floor near Z5.628.
Five independent complete-source rays enter the mouth and reach that floor;
three cross-rays below the slanted lip remain empty. This is real geometry,
not a dark disc or alpha cutout.

## Evidence and limits

Source-only scalar/plane and all143-owner ray evidence is retained under
`.qa-dev/reports/abrams-muzzle-DlsJHG`, `abrams-muzzle-Y5Nhaf`, and
`abrams-muzzle-iwHQT7`. Runtime stores manufacturing dimensions and analytic
sections, never the source triangle payload. Small-stock approximations
are explicit: at most2.5mm at the rounded clamp witness and2mm for the
MRS's curved shell/recess floor. The source's tiny fillets, end screws and
slight noncircularities are not claimed exact. The hidden saddle receiving
lap is0.12mm; the original narrow base seam uses a concealed0.14mm extension.

`abramsSourceXMuzzle.selftest.mjs` passes seventeen closed/outward stocks
with940 triangles, source collar and clamp first surfaces, the hollow MRS
mouth, and main-bore air. It checks actual saddle/base/cradle/bolt receiving
surfaces, not only overlapping bounds. All seven actual IDs, both geometry
qualities, and three turret/gun poses pass these source and air witnesses
(14 builds,42 poses). The helper's latest code-quality gate reports24 functions,
zero complexity violations, and no `any` or `unknown` types.

The local paired side/top close-ups use the same camera and clay material.
The early axial native capture had an LOD isolation defect that made other
equipment visible again: it is diagnostic only and is **not** an accepted
whole-envelope comparison. Full fourteen-view evaluation and release gates
are still required after all R4 geometry is frozen.

The corrected `muzzle-r4d-*` diagnostic includes all seven source gun owners
(65–71) and clones the actual native gun rig into an isolated group so LOD
cannot reactivate unrelated turret geometry. Side/top forms align, but its
axial view exposed a normal-only difference at the main muzzle: a smooth
Lathe transition made the machined annulus appear like a larger bore.
The complete-source `abrams-muzzle-dYN9LS` packet independently confirms
the opening at radius60mm, and a flat +Z face from radii61–76mm at
Z5.809424877. The new correction splits only that face's shared normals.
Tests prove identical occupied triangles/UVs and unchanged normals everywhere
else, plus all42 actual posed annulus first surfaces. It does not resize the
bore, add a cap, or change its depth. The source/native `muzzle-r4e-*`
close-ups were recaptured and inspected after this correction; the axial
annulus now reads as the same machined face. The `r4d` images remain before
evidence. Neither close-up substitutes for the pending whole-model gates.

