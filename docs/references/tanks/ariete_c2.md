# C2 Ariete (`ariete_c2`) — §5.248 ground-up rebuild (italy wave)

**Exact variant modeled:** Ariete AMV/C2 upgrade configuration — the
production C1 hull/turret carrying the add-on armor package. Built as the
measured C1 base (see ariete_c1.md — same buildArieteMk ground-up authoring,
same frame law) + the REAL upgrade package; reference photos govern the
package regions where the arrafi print is C1-only (round-brief law).

## Identity of the package (photo-class regions)
- Add-on cheek armor wedges extending the arrow on both cheeks (module edge
  seams read as separate armor, not shell).
- Hull glacis add-on plate rows (3 per side) on the published upper-glacis
  plane — plates sit ON the C1 glacis, no hull mass replaced.
- Full-run heavy skirts (13 panels; the C1 print carries the heavy package
  only forward of -0.41 — the C2 package extends it to the sprocket).
- New commander sight housing over the C1 pano position + driver thermal
  camera pod on the fore fairing.
- APU box left-rear deck with its louvre face.
- Second whip antenna RIGGED (the C1 carries the right rod + stowed left
  base; the C2 rigs both) + the loader's MG42/59 retained.

## Dims true-up
Spec row trued from donor-clone flavor (7.75/10.12/3.64/2.82) to the real
AMV configuration: same chassis 7.59 hull / 9.67 overall / 3.60 width
(WIDTH GUARD: the package stays inside the family ±1.80 skirt planes) /
2.47 height (the C1 2.45 datum + the new sight housing budgeted inside the
p95 grace). Armor frame params re-seated on the measured geometry
(turretPivot [0,1.30,-0.10], gunPivot [0,0.35,1.05], barrelLenM 4.93,
tw 1.28, tFrontZ 2.12, tRearZ -2.40, tH 0.86); every RHAe VALUE
byte-identical to the pre-round rows (armor values stay orchestrator lane).

## Verification state
No oracle registration exists for the C2 (the arrafi print serves as the C1
gate oracle and the C2 *influence* print only) — no gate row by design; the
independent critic lane scores the C2 against the C1-print-plus-package
read. Machine checks: track-clip band/shoe/strict-sweep 0/0/0, contiguity 0,
machine-tagged muzzle bore PASS, decor census mg1+5d, geometry hash
a9ed20d8 (51 meshes / 68645 verts, reconciled ×2 at delivery; npm test
green, donor `ariete` byte-held 43e126e8).

## Owner c425f495 absorption
The C2 branch inherits every C1 absorption (roof cadence, lids, periscope
arcs, TURMS recessed face, basket bottles) and supersedes the interim
turretG.scale.y*0.86 squash the same way (measured roof line). The owner's
C2 kept mg0; this rebuild carries the MG per the AMV fit and the §B3 decor
gate.

## §5.299 lane D — sloped turret front + sloped upper glacis (owner order, 2026-08-17)
The C2 rides the shared buildArieteMk re-loft (see ariete_c1.md §5.299 for
the measured lines and receipts): raked cheek faces, true-sloped glacis
planes, wall-overshoot cut, fairing step band. Package-specific deltas:
- add-on cheek armor MODULES re-lofted to ride the new raked C1 faces (tops
  +1.96 -> +1.70 inner / +1.66 -> +1.48 outer) — still proud panels with the
  module edge seams intact;
- the three glacis add-on plate rows re-seated ON the raked plane (y
  1.364/1.345/1.315 at z 2.30/2.60/2.90, pitches -0.064/-0.10/-0.10 —
  previously seated on the flat 1.375/1.32 steps);
- everything else in the AMV package byte-held (full-run 13-panel skirts,
  commander sight housing, driver thermal pod, APU, second whip, MG42/59).
New geometry hash **b0b3c184** (51 meshes / 68699 verts, reconciled ×2;
prior a9ed20d8). Still no-gate-by-design. Machine checks at delivery:
track-clip band/shoe/strict 0/0/0, §B2 contiguity 0, decor census mg1+5d,
§B5 candidates identical to HEAD baseline (zero delta), npm test green,
donor `ariete` byte-held 43e126e8. Before/after pairs:
shots/ariete-slopes/{before,after}-c2/.
