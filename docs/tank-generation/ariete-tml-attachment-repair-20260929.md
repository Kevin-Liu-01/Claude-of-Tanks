# Ariete prototype and CV90105 TML attachment repairs — 2026-09-29

## Owner requests and scope

- Repair C1 Ariete Prototype (Serie 1), `ariete_c1`: the marked shoulder bins,
  left equipment cover, upright stack and cheek fairing stay on the hull or
  disappear beneath the turret. Gallery packets recorded turret yaw −66°, −8°
  and 2°, with all selections incorrectly owned by `rig_hull/hull`.
- Apply the same ownership correction to the shared `ariete_c2` prototype
  builder. Its bins already rotated, but the other shared fittings did not.
- Attach `cv90105_tml_x`'s barrel boot to its mantlet. The marked rear cap was
  at gun-local z=0.28 m, with bounds x±0.185 m and y=−0.194…0.178 m.
- Surface exports label the operation `remove`; the owner's prose requests
  connected, moving assemblies, so these parts are retained and repaired.
- Modern `ariete_c1_x`/`ariete_c2_x`, the Preserie and the completed Carro 45t
  redesign are outside this change. No source geometry enters the runtime.

## Cause and correction

The shared Ariete source study conflated object membership with mechanical
ownership. C1's bins were explicitly routed to hull buckets while C2's were
routed to turret buckets. Both marks retained roof equipment and the left
fairing on the hull. Their zero-yaw appearance masked the error.

Both prototypes now convert the authored assembly coordinates into the turret
frame using the existing `localY` and `L` transforms before the 100 mm body
lift and 1.10 family scale. Bins and equipment use the nonstructural equipment
buckets; the cheek fairing remains structural turret armor. The fixed bearing
race and driver's equipment remain on the hull. Lid seats overlap their
carriers; the left cover extends slightly above the crown instead of being
buried inside it. Regenerated fills must not recreate the old fixed towers.

The TML receiving shell ended at gun-local z≈0.114 m while the boot started at
0.28 m. Whole-assembly bounding boxes overlapped despite the internal gap.
Extending the existing elliptical boot back to −0.06 m embeds it into the
receiver. The muzzle, barrel length, optics, trunnion and recoil mechanism
retain their positions. The boot pitches with the cradle; the barrel recoils
inside it.

## Durable regression coverage

- `src/vehicles/profiles/arieteTurretOwnership.selftest.mjs` locates the actual
  marked triangle bounds independently of face indices, rejects hull ownership
  and stale hull towers/fills, ray-tests the exposed roof lid, and exercises
  −66°, −8°, 2°, 90° and 180° yaw at HIGH and LOW.
- `src/vehicles/profiles/europeGunOwnership.selftest.mjs` now probes radial
  stock along the TML joint at every legal elevation endpoint and during
  recoil. This new assertion fails on the previous geometry. Existing optical
  recess, material, LOD, disposal and other European gun ownership checks stay
  intact.
- Actual garage selection/cache return and Gallery articulation are captured
  under `.qa-dev/ariete-ownership/` and `.qa-dev/cv90105-mantlet/`; images live
  in the corresponding 2026/09/29 Codex visualization folders.

## Reference integrity

The existing Arrafi comparison model was recovered from the owner's Downloads
archive by its embedded title, author, source URL and semantic materials. The
TML oracle was recovered from the earlier source-study worktree and verified
against the recorded SHA-256
`6e5770019f47d2c3de157e4eee77257e0f7ad1680b18b0655a1197362070efcc`.
Both remain ignored local comparison inputs. Existing comparison registrations,
thresholds, credits and historical failures are preserved. Passing attachment
tests is not a numerical source-qualification claim.

## Scoped publication authority

On 2026-09-29 Kevin explicitly approved: “Publish the attachment repair; retain the failed comparison status.” This applies to the shared Ariete prototype attachment correction only. It does not qualify their full reference shapes or waive any other vehicle’s checks.

## Validation and publication

Final command receipts and publication status are recorded below after the
required anatomy, asset, physical, comparison, test and build runs complete.
