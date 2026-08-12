# T-14 first-party runtime re-certification

Date: 2026-08-12

Frozen candidate: `a94a2480` (47 meshes / 61,723 vertices)

Disposition: **PASS / KEEP**

## Provenance and metadata correction

The battle playable resolves only through the repository-authored
`buildT14`. The local CC-BY GLB is a measurement/render oracle and supplies
no playable geometry, materials, textures, rig, animation or baked arrays.
The former source-baked `a88afa6c` experiment is retired. Runtime dimensions
and collision/armor truth now match the visible vehicle: 9.98 m overall and
a 5.64 m barrel proxy, replacing stale 10.8 m / 6.45 m metadata.

## Quantitative receipts

- Deterministic freeze `a94a2480` x2.
- Fidelity **90.53**, minimum whole view **91.52**; overall 93.14, hull
  93.53, turret 86.66, gun 83.97 and tracks 89.21.
- Honest component gate **72.3**: 79.4/75.0/72.3/84.0/100/100. The oracle's
  fused/component and donor-running-gear masks do not describe the authored
  ownership split and remain diagnostic debt rather than a copying target.
- Exact native track band 0/0 and shoes 0/0, no blind spot.
- Parent 0 stranded / 0 abutting / 0 dangling; contiguity 0; `mg1+3d`;
  muzzle bore PASS.
- Winding 0 reversed / 0 mixed / 0 deficit pixels; yaw mode 2 clean.

The final packet at `/tmp/critic-t14-native-final-r2/t14` contains 42 PNGs
with 42 distinct hashes. Fresh fixed vector:
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.1,9.0,9.1,9.0,9.0]`, floor
**9.0**, mean **9.04**. All yaw pairs show a genuine quarter-turn. The gun,
faceted unmanned shroud, bustle, RWS, optics, Afganit/APS equipment and sensor
suite rotate as one supported package. The crew-capsule bow, glacis, engine
deck, cages, rear service field and seven-wheel course remain fixed. No
fused duplicate, stranded fitting, empty-air decoration, course collision or
visible winding wound appears.

**Final verdict: KEEP `a94a2480`.**
