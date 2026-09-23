# Western primary-reference review — 2026-09-06, 18:03 UTC

Status: **all four remain authoring drafts, not visually or release-qualified**.
This is a manual primary-photo/drawing review of the actual first-party
geometry, not a numerical comparison against the unreliable supplied AI files.

## Capture scope

The FIFO-owned `agent-browser` pass captured the actual high-quality factory
through the private source-study page, using neutral clay, fixed cameras and
no source-media runtime dependency. Shadow-only proxies were hidden; real
armor, fittings and apertures remained visible. All 17 PNGs were inspected
locally and archived without changing their bytes in `.qa-dev/reports/`:

- `challenger1_x-refined-{quarter,side,rear,rear-detail}.png`
- `ariete_c1_x-refined-{quarter,side,rear,launchers,bustle}.png`
- `strv122_x-refined-{quarter,side,rear,galix}.png`
- `chieftain5_x-refined-{quarter,side,rear,casting}.png`

Whole-model views retain the complete gun and track outline. Detail views
deliberately crop unrelated parts and are not whole-outline evidence. Neutral
clay gives recessed stocks and glass the same material as armor, so material
appearance alone cannot establish a cavity: actual complete-model ray tests
provide the separate empty-volume evidence. This was the author's review of
the repairs; independent final acceptance remains required.

## Historical findings at the 18:03 UTC checkpoint

### Challenger 1 X

The former buried rear beam, central swivel and side cases are now positive
exterior forms. The handbook Fig.20 A-frame is separately supported and its
triangular center and two towing eyes expose the actual rear wall. The close
rear view does not show an unsupported equipment island. This closes the
specific rear-occlusion finding, not the whole vehicle's visual review.
The rest of the draft remains coarse at wheel-face, gun-crutch and exterior
fitting scale; the generic raised/radial wheel faces are not a finished
vehicle-specific wheel reconstruction. Handbook dimensions are retained, but
no millimetric accuracy is inferred from the exterior drawing.

### C1 Ariete X

All four mouths on the visible flank now project beyond the permanent armor;
the complete-model tests independently confirm eight clear bores with
recessed stocks and positive carrier contact. Broad paired aft bins, their
hinges and folded receiving brackets now reproduce the medium equipment
layout visible in the September 2021 reversed-turret photograph. The deep
lower bustle undercut remains open. The blank/buried-equipment findings are
closed within this scope.
The 2016 side photograph still shows a substantially different wheel face:
recessed metal dishes and a localized center hub, rather than the draft's
flat stack of proud rings. The roof and rear fittings also retain simpler
forms than the photos; soft stowage, pins and latch relief are incomplete.
The wheel difference is a real remaining medium-form issue, not a texture
or antialiasing discrepancy.

### Stridsvagn 122 X

The new inclined pierced carrier reads as the same assembly type as the
track-repair photograph: a broad folded front skin with four short-rimmed
mouths, rather than four long pipes on a vertical slab. The close-up shows
the recessed stocks, while the CPU tests prove all eight radial bore sets,
solid inter-hole skin, hollow interior and armor-supported edge returns.
The earlier Galix carrier finding is closed.
The primary track photograph remains much richer in physical wheel shape:
deep dish faces, rim transition and center hubs are absent from the generic
radial-faced native wheels. The native rear bustle is also a broad, sparse
solid where the primary photographs show separate outside fittings. Neither
the wheel mismatch nor the rear equipment is cleared by the Galix fix.

### Chieftain Mk 5 X

The rounded front casting and cradle remove the former ruled rectangular
gun-root block and sharp lower lens edge. The forward lower cheeks now have
positive rounded depth, with the driver/periscope clearance independently
retained. Twelve smoke cups remain clear after reseating their complete
banks and supporting their roots. The three existing optic approaches remain
actual empty volumes. No Stillbrew pads or Mk10 donor surfaces were used.
This is improved, but the front is still too simple to claim complete
primary-photo parity: adjacent ranging/coaxial exterior fittings are missing,
wheel faces remain generic and cast-surface/latch detail is simplified.
The angled Mk5/5P image does not justify altering the fixed roof datum or
claiming a numerical silhouette score.

## Verification and integration limits

Each changed actual-ID high/low selftest passes, retaining its earlier
envelope, optic/bore, legal articulation and physical ground assertions.
The unchanged strict CPU track sampler reports zero band and shoe overlap
for front, rear and full sweep on all four. Typecheck, scoped complexity and
diff checks pass. These are construction checks, not final release receipts.

The live gallery check did **not** pass. It reached the current roster and
selected `challenger1_x`, but remained `ready=false` with no tank attached.
A separate CPU facade check identified the actual missing integration:
`ensureTankBuilder()` rejects `challenger1_x`, `ariete_c1_x` and `strv122_x`
with `Unknown vehicle marking seat group` for `challenger1X`, `arieteX` and
`strv122X`. The generated demand-loader groups are still deferred. No
generated receipt, loader, runtime gate or registration was edited to bypass
this. Both owned browsers closed and both FIFO claims were released.

Fresh actual-gallery verification, independent visual acceptance, completed
gameplay bindings, generated anatomy/markings and final release checks remain
required. A6, Leclerc and Mk10 were not edited during this four-model pass.

## Subsequent bounded wheel/equipment correction — 2026-09-06

The next FIFO source-study pass captured fresh neutral quarter/rear and close
details for Ariete, Strv and Mk5. Paths are `.qa-dev/reports/` followed by:

- `{ariete_c1_x,strv122_x,chieftain5_x}-wheels-equipment-{quarter,rear,tilted-top}.png`
- `{ariete_c1_x,strv122_x}-wheels-equipment-wheel-detail.png`
- `strv122_x-wheels-equipment-bustle-detail.png`
- `chieftain5_x-wheels-equipment-auxiliary-detail.png`

The author inspected all views locally. Ariete and Strv now have actual
recessed bowls, rolled steel rims and localized hubs. Their old flat/radial
face finding is closed at the medium-form level; small rim/hub bolts and
pressed relief remain simplified. The exact bowl depths are declared
construction estimates, not newly invented metric evidence. Both native tire
envelopes, all axles and track courses are retained.

The Strv closeup shows positive aft-side bins with closed roots, lid edges,
hinges, latches and open folded handles behind the Galix carrier. The broad
rear face remains simpler than a fully dressed vehicle, and the available
photographs occlude some rear fittings. The new side assemblies are supported,
with the original lower bustle undercut still open. The Mk5 front closeup
shows a left ranging tube and upper coax sleeve with real muzzle mouths and
cradle attachment. Their source-supported owner relationships are tested;
exact dimensions and subtle canvas/cast contour remain inferred. Mk5 and
Challenger road wheels remain generic and are not included in the wheel fix.

`primaryPhotoWheelSolids.selftest.mjs` and `primaryPhotoEquipment.selftest.mjs`
pass high/low, along with the retained profile tests, all 173 wheel-quality
cases, track/suspension patterns, typecheck and scoped complexity. Strict
front/rear/full-sweep band and shoe overlap remain zero. React Doctor's
before/after changed scans report 84/100 and no findings. The new helpers
add only cold construction; their buffers remain on native instanced gear or
the existing owner rigs, with disposal and moving-frame assertions.

These are bounded authoring closures, not full vehicle qualification. No
source topology, source loading path, registry, shared core, global asset,
marking receipt or gate was changed. Actual gallery review is still pending
the parent-owned generated marking-seat groups; the earlier failed gallery
check must not be promoted to a pass. A6, Leclerc and Mk10 remain untouched.
