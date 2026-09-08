# American gunmetal finish and published night masks

This is a test-only integration repair, not a tank geometry, color or lighting
change. It preserves the required M1A3 Browning gunmetal finish on the existing
American weapon and service hardware.

## Failure and cause

The authentic bodywork release diagnostic at `4831d43d0` failed the existing
`americanModernization.selftest.mjs` comparison for
`m1a1/fitting_towCable_dark`. Its color, roughness, metalness, environment
intensity and roughness-map state matched the canonical Browning. Its program
key differed because the published authored-lamp work installs a per-vertex
night-emission wrapper on an existing shared material. The canonical M1A3
Browning material does not need that wrapper.

The test and relevant vehicle/night-material runtime files are unchanged
between that failed integration and published `6dda69442`, used as this
repair's independent base. The failed log remains in
`release-tail-diagnostic-rBa4lI/279-americanModernization.selftest.mjs.log`.
No historical hash or production output was refreshed to make it pass.

## Two exact finish contracts

The original complete material-finish comparison, including its program key,
remains in effect for plain materials. The second allowed finish is the same
canonical Browning material with the actual published night-mask installer.
It must match all original material properties and the exact resulting
vertex shader, fragment shader and uniform values. Arbitrary shader wrappers
are not ignored. No instance-activity variation is admitted.

For masked hardware, every position vertex must have an explicit mask.
Unregistered service parts must have zero emission masks; nonzero lamp masks
are allowed only on parts with registered real lamp emitters. The independent
vehicle-night-lighting test continues to verify authored apertures and the
exclusion of ordinary optics/hardware from emission.

Negative controls reject a blue gunmetal substitution, an unauthorized shader
edit and a glowing tow-cable vertex. The restored cable then passes the exact
contract. Existing American tower, loader, finish, rig and equipment assertions
remain active; no vehicle is removed from the test.

## Qualification

The maintained FIFO runner passed all three unchanged-runtime checks:

- `src/vehicles/profiles/americanModernization.selftest.mjs`;
- `src/vehicles/vehicleNightLighting.selftest.mjs`, including its eight native
  procedural HIGH/LOW construction records (not a GPU screenshot capture);
- `src/engine/nightEmissionMaterial.selftest.mjs`, including exact day baseline,
  zero masks, red/warm variants, instance activity and hook/key preservation.

The captured command session `58451` exited zero on 2026-09-08. No runtime,
dependency, asset or build-configuration file changes in this checkpoint, so
there is no new production-build or anatomy result to claim. The separate
bodywork integration still requires its complete composed release checks.
