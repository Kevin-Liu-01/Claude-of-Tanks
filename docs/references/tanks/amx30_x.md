# AMX-30 B X — independent source study

The playable profile is authored from parametric solids and one native running
gear unit. The supplied GLB is a local-only measurement/comparison instrument;
no source geometry, textures, buffers or rig are shipped.

## Frozen source registration

- Original: `amx_30_b.glb`, SHA-256
  `487ad57122e2f8e3425df7b706e752dac7d3cd1983b44b876deefc755d97bf9c`.
- The complete first vehicle is Object_4 through Object_70; the second complete
  cosmetic vehicle is not part of this measurement. Selection and rigid metre
  transform are in `docs/research/second-wave-registrations/amx30_x.json`.
- Canonical local oracle SHA-256:
  `55f4ec8837caa90c4ad976fdfd974bd9761497b27d963e3af84f040b9126bae5`.
- Physical turret pivot `[0,1.584,.285]`, inferred internal trunnion
  `[-.011,1.87565,1.60]`, measured muzzle Z `5.99439` metres.

## Lower-running-gear refinement, 2026-09-06

The former track component failure was not a missing wheel or a wrong radius.
An independent CPU side-plane occupancy study isolated most missing area to
Y .05–.175 between the five road wheels. The lower-band comparison includes
all hull-owned geometry, so this diagnosis examined the actual hull as well.

Exact canonical Object_6/8 sections at Z0 show the lower outer tread at
Y .000750 and its inner shell at Y .075928, with the narrow central guide tip
at Y .160593. The tread's groundward width is .51772 m, while its beveled inner
lip reaches .57152 m. The source's guide is a continuous simplified ridge.
The original road wheels bottom at Y .050931; therefore copying the source's
full-width 75 mm shell would overlap those wheels by about 25 mm.

The native replacement keeps every source axle, wheel radius, end-wheel datum,
return roller, and the single animated course. It uses a 35 mm pad, 8 mm
grouser, 8 mm web (4 mm projecting after its attachment overlap), and a separate
85 mm discrete guide. The loaded outer shoe/web occupies Y0.. .047 m, below
the measured road-wheel bottoms. Its continuous 10 mm metal carrier seats
within that web, with lower-course centre Y .0425. The analytically rounded
contact radius is .37388 m. This is a documented mechanical interpretation of
an internally overlapping source, not a copied continuous ridge or a fitted
wheel enlargement. Native wheel-face detail remains simplified; the source's
low-poly wheel meshes themselves do not provide independent tire/dish rings.

Focused actual high/low tests preserve all ten road-wheel instance stations,
the .51772 m outer tread width, 47 mm outer shoe/web envelope, ground contact,
and the original recessed optics, cupola air, blind bore and moving gun rig.
The unchanged `roundedTrackContact.selftest.mjs` passes every one of its 48
opposing scroll phases in both LODs. Exact CPU front/rear/full-sweep band and
shoe intersections are all zero (336 full/simplified shoe instances).

## Historical scoped proof and visual review — 2026-09-06

The 2026-09-06 15:41:02.839 UTC fidelity run passed every registered view and
component: whole `97.52268296791408`, hull `97.80145474473005`, turret
`94.61907950836638`, gun `92.03735943883255`, tracks `94.04209069949503`.
Track pixels were source 5421/native 5181, versus the former native 4986;
both masks retain the same 254×27 bounds. No mask, threshold, registration or
oracle changed. The final full-fleet receipt will supersede this scoped note.

Fresh geometry minimum `92.83224085365853` passed: hull
`92.83224085365853`, whole `94.03921493902438`, turret
`96.21668526785714`, stations `97.2737718905574`, dimensions 100,
floaters 100. Full geometry evidence is in `docs/geometry-gate/amx30_x.json`.

Independent local inspection of the fresh neutral board found the lower shoes
more consistent with the reference while preserving discrete guide gaps,
five-wheel cadence, raised return course and exposed-wheel space. No new
medium/major visual defect appeared in this bounded change. The source's
continuous ridge and fine wheel-face decoration remain explicit simplifications.
That checkpoint preceded the aft-return correction below and is not the final
release qualification.

## Source-backed aft return — 2026-09-07

The subsequent official standard found one genuinely source-covered opening
at X `.9272321138211659`, Z `-3.226646555662154`. Complete-source Object_66
has its rolled fender crown at Y `1.1208732466549582` there; the native flat
fender and separate rubber flap left it empty. Conversely, at X1.2/Z-3.27
the previous flat fender reached Y1.238062, about 159 mm above the real return.

The bounded replacement independently constructs closed top/underside plane
fields for the two different source folds. It retains the asymmetric terminal
edges and real under-return air. Only the obsolete rear portion of each flat
side fender is removed, ending it at the measured Z-2.857 join; its entire
forward plane remains unchanged. An explicitly inferred 8 mm concealed lap
gives positive receiving contact without lifting the main roof or filling the
space underneath. Millimetre-scale outer-edge wander remains simplified.

The [scalar packet](amx30_x.aft-return-source.json) records the immutable source
hash, independent witnesses and the limited construction inference. New
high/low tests pass source surfaces, normals, air, attachment and the exact
pre-edit non-target primitive hashes. Existing AMX mechanics/optic/bore tests,
typecheck and helper quality pass. Both LODs retain zero strict front/rear/full
sweep band and shoe intersections. CPU continuity is now zero on the identical
source/native frame.

The fresh `source-aft-return` proof passed every registered view at
`2026-09-07T01:20:55.029Z`: raw composite `96.19075139825917`, minimum whole
view `96.39792834046574`. Raw geometry minimum/hull is `92.94028201219513`,
whole `94.17889672256098`, turret `96.21668526785714`, stations
`97.43466479846977`, dimensions and floaters 100. The official standard
also passes: front/rear and full band/shoe sweep all zero, continuity zero,
MG census one. Exact full fidelity/geometry receipts and the log are retained
under `.qa-dev/reports/amx30_x-source-aft-return-*` and
`.qa-dev/reports/amx30-source-aft-return-proof.log`.

Independent review of that fresh neutral board closes this bounded repair:
the bilateral rolled ends sit into the long fenders with rear-gear clearance,
without a detached flap, broad shelf or newly filled major opening. Board
resolution cannot prove the concealed 8 mm lap or detailed underside planes;
those are covered by the fixed source-ray tests. Geometry and focused tests
are frozen. The mandatory final anatomy/assets/full-release integration is
still pending and is not claimed by this scoped proof.
