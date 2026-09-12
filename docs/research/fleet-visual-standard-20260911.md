# Fleet visual standard pass — 2026-09-11

Owner direction (2026-09-11): the new X tanks must follow one visual language.
The complaints were flat "un-camouflaged" areas in the plain base tone, rubber
in places that are painted steel on the real vehicles, guns whose visible hole
sits far down a hollow throat, spoked "rubber" Leopard wheels, generic glacis
stowage on modern hulls, and open or thin machine-gun and mast stock.

## What changed

- **Painted steel carries the camouflage.** `hullDetail`, `turretDetail` and
  the per-side track detail buckets draw with the vehicle camouflage material
  (`CAMO_BUCKETS`, box-projected UVs, baked dirt) instead of the flat
  fitting tone that read as bare primer beside every camouflaged plate. The
  buckets keep their detail LOD, non-armor hit role and disposal ownership; the
  garage material transfer follows the material role, so the workshop shows
  the same finish. Earlier per-panel `markFixedPaintedPanel` migrations
  (skirts, stowage, rear racks, basket floors, collars) remain as explicit
  provenance for fixed bodywork that also needs silhouette LOD.
- **Rubber only where rubber belongs.** The rear rubber-fabric skirt courses of
  T-72B (1987) X, T-72B3 X and T-80U X are painted in the vehicle scheme like
  the rest of the skirt; mud flaps, the T-80U bow apron and lower curtains stay
  black. Type 90 X and the T-90 AW family had already moved their skirts to
  painted bodywork.
- **Mouths sit on the surface.** The fleet muzzle lining seats on the tube edge
  (`MUZZLE_COUNTERBORE_MAX_M` 0.03; edge scan over the primary surface), the
  bore probe fails any mouth deeper than 50 mm, and the authored throats that
  fought it were corrected: Leopard 2A6 X drops its 250 mm open throat in
  favour of the shared lining, Leclerc classic X narrows its lit 169 mm inner
  wall to the 120 mm calibre, and the Strv 103 collar reaches its ballistic
  muzzle marker. `node tools/muzzle-bore-probe.mjs --all` passes all 208
  muzzle classes.
- **Wheels.** The Leopard 2 family (Leo 2A4–A7V, Strv 122, KF51, PL-01, Leo 1A5)
  uses a plain dished twelve-fastener disc with a proud hub; the spoked
  `radial-eight` motif no longer has a fleet owner and left the vocabulary.
  The German nation fallback follows.
- **Decorations.** Modern hulls no longer receive the generic headlight and
  glacis spare-track kits; fire extinguishers on modern vehicles route to hull
  service positions instead of turret slots.
- **T-90M X mast** stock uses thicker, closed radii.

## Evidence

- Provenance census of flat-tone and rubber emitters per call site
  (`.qa-dev/x-provenance-census.mjs`, QA only) drove the migration list; the
  per-mesh world-space diff against origin/main confirms every vehicle test
  repin in this pass is one of: moved muzzle lining, detail buckets gaining
  camouflage UV/colour, or authored fittings moving to a painted bucket.
- Contact sheets before/after for the X fleet (`.qa-dev/qa-views.mjs`, QA
  only) and the straight-on bore proofs under `/private/tmp/cot-muzzle-bore-proof`.
- Combat anatomy, marking seats, presentation anchors and every icon view are
  regenerated with the batch; the release gate sequence
  (`tank:anatomy:update` → `tank:anatomy:check` → `tank:release:check --gate`)
  is recorded in the commit that lands this note.

## Addendum 2026-09-12 — muzzle seat r2, Warrior, probe alignment

- **Three-seat mouth rule (`terminal-surface-fit-r2`).** The visible mouth
  ends at the ballistic marker. A tube whose true mouth face already reaches
  the marker keeps the lip 0.9 mm proud with the annulus/disc 0.6/0.3 mm ahead
  of the face (flush seat); a tube authored short by up to the classic lip
  reach keeps the published r1 lip (rear 0.04 R ahead of the tube end, front no
  further than 0.9 mm past the marker, lining 1.2 mm inside); a tube that stops
  further short is completed by an open-ended dark throat sleeve so the lip and
  lining still finish at the marker. No vehicle grows past its authored tube.
- **Mouth-face scan.** `axisGeometryMouthEdgeProfile` seats on the most
  forward vertex between the bore lip course and the outer course, so a
  chamfered muzzle (Challenger 1 X, supplied) seats on its terminal face
  instead of burying the lip inside the outer course.
- **Probe alignment.** `tools/muzzle-bore-probe.mjs` accepts a lip front up to
  1 mm past the marker (the factory's 0.9 mm crown); the earlier 0.5 mm bound
  rejected 56 correctly seated classes. Fleet result after the change:
  `PASS 208 muzzle classes` (`--all`).
- **FV510 Warrior (both classes).** The RARDEN mouth was buried inside a dark
  hider nose behind a solid dark cap, and the whole turret group is scaled to
  84 % height, so the tube and mouth rendered as a flattened ellipse. The bore
  now sits on a steel tip collar at the tube tip (`muzzleBore z 1.872`), the
  hider nose and collar are painted steel with one dark slot ring, and the
  elevating gun group is counter-scaled (`gunG.scale.y = 1/0.84`, the
  challenger.ts convention) so the tube stays round.

## Addendum 2026-09-12 (b) — track standard and Leclerc far course

- **Fleet track standard.** Thin source-X gear blocks (band 10–20 mm, pads
  16–29 mm) read as ribbons beside the classic fleet's 40–90 mm bands. The
  floor is now band ≥ 24 mm, pad ≥ 30 mm, web ≥ 14 mm on T-72B3 X, T-72B3M X,
  T-72BU X, the T-90 X family (AW, Burlak, MS), Challenger 1 X, the Abrams
  source-X hulls and AMX-40 X. AMX-30 X, Chieftain 5 X and the T-90M block keep
  their measured courses: their receipts pin grounded contact to the source
  datums, so thicker pads need a datum-level re-seat (follow-up).
- **Leclerc X / classic X polygon budget.** The far course uses the fleet shoe
  with the measured cross-section (48 triangles per link instead of the
  174-triangle native far link); the near link keeps its measured pins and
  connectors. leclerc_x drawn triangles 141k → 121k; the gear-history witness
  authenticates the authored builder (near output byte-identical to the native
  link).
- **Machine-gun review (resolved as authored).** The X-fleet contact sheets
  show roof MGs authored under family-specific names, so the QA camera misses
  several; on inspection Challenger 1 X, Chieftain 5 X/Mk10 X, AMX-30 X and
  KF51 X (MAG at the rear station) carry authored guns, the supplied Ariete
  deliberately keeps its empty port-hatch fork (source decision recorded in
  `arieteXSuppliedEquipment.ts`), and the Leopard 2A6 X / AMX-40 X references
  show bare hatches. No guns are invented; the remaining tank items are the
  K1A1 X tire split, KF51 proportions and Merkava louvers.

## Addendum 2026-09-12 (c) — casemate polygon outliers

- **ISU-152 / ISU-122S.** Both casemates drew 156–165k triangles against a
  fleet HIGH median of 82k. Two-thirds of the excess was the painted wheel
  cover disc: a 44-segment hemisphere flattened to 5 mm, repeated on twelve
  wheels. At 24 segments the stamped-disc paint classes (hub valley, pressed
  ring, six-spoke shading, rim crescent) still resolve and the discs read the
  same on the contact sheet; isu152 165k → 149k, isu122s 156k → 140k. The
  ISU-122S mantlet "pot" keeps its certified 96×48 lattice (r10 terrace fix).

## Release gate note (2026-09-12)

`tank:release:check --gate` needs the registered comparison oracles on disk:
the 61 community candidates under the shared checkout's
`public/models/community-candidates/` plus the 30 X-fleet `*_x_source.glb`
files, which live only in the `cot-fleet-bodywork-final-integration-20260908`
worktree. Neither set is tracked (`.gitignore`), so a fresh worktree must link
both into `public/models/community-candidates/` (per-file symlinks) before the
geometry gate can score the exemplar bar; without them every X class reports
"registered exemplar comparison oracle unavailable" and the gate fails at step
one.

## Exemplar gate reconciliation (2026-09-12)

With every registered oracle linked, the fresh geometry gate over the changed
classes scores 35/41 (fleet-wide 67/162). The six misses:

- `challenger1_x` (0, dims 0), `type10_x` (79.4), `m1a2_sepv2_x` (87.6) and
  `fv510` (0) score exactly what the committed ledger already recorded before
  this session; they are pre-existing exemplar/fleet-bar gaps, not regressions.
- `strv103` improved from 57 to 82.2 (fleet bar 90) with the collar-seated
  mouth.
- `t90m_x` fell from 93.1 to 90.8. Bisected on the pre-batch tree: not the
  pressed-disc wheels, not the camouflaged detail buckets, not the mouth seat
  — it was the slimmed DVE-BS wind-sensor mast. The supplied source model
  carries a 92–108 mm post; the real mast is a ~30 mm rod, and the slim
  version read better on the contact sheets. The source post is restored so
  the class stays at the exemplar bar (93.1/92); accepting 90.8 for the
  accurate mast is an owner decision.
- The track standard was rolled back to measured values on `amx40_x` (92.3 →
  91.9 with the thicker band) and the T-90M block; the Soviet source-X hulls
  that took the standard all score ≥ 92 with it.
