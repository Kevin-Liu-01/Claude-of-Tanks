# Abrams family front-shoulder closure — verification (2026-08-15)

## Scope

Owner screenshots identified matching black cavities on both sides of the
Abrams bow when viewed from an elevated front quarter. The repair applies to
the shared first-party procedural hull used by `m1a1`, `m1a1ha`, `m1a2`,
`m1a2_tusk`, `m1a2_sepv2` and `m1a2_sepv3`.

The cavities were the uncovered tops of the intentional idler-clearance carve,
not missing running gear. Paired hull-owned roof plates now bridge the center
bow to the outer fender/skirt course. Their outer returns and shallow welded
breaks close the side read without deleting or moving armor, skirts, wheels,
suspension or tracks.

## Visual evidence

- Exact owner camera reproduced at position `[-8.45257, 5.5806, 9.34986]`,
  target `[0, 1.69242, 0.89729]`, plus the mirrored opposite-side camera.
  Both former black pockets are replaced by continuous camouflaged armor.
- Fresh evidence root: `/private/tmp/abrams-front-shoulders-final-r1`.
- Each of the six variants has 15 paired boards, 15 yaw0 frames and 15 yaw90
  frames: 45 per tank, 270 total.
- Front quarters, heroes and top views show the closure at normal scale. Yaw
  frames show the new plates remain hull-owned while the entire turret rotates.

## Mechanical receipts

- Exact track audit: band front/rear **0/0**, individual shoes **0/0**, strict
  sweep **0/0** on all six variants.
- Duplicate-track audit: **PASS**, one integrated animated tread/connector
  layer on all six variants.
- Winding audit mode 1: **PASS**, no reversed or mixed winding.
- Contiguity and clip rows: **PASS** for all six variants.
- Generated tank assets: **54/54 current**, including muzzle-bore verification.
- Full `npm test`: **PASS**.
- Production `npm run build`: **PASS**.

## Frozen geometry

| Tank | Freeze | Meshes | Vertices |
|---|---:|---:|---:|
| M1A1 | `d42882cc` | 54 | 127,628 |
| M1A1HA | `837bfe50` | 55 | 161,264 |
| M1A2 | `f9edc818` | 56 | 159,944 |
| M1A2 TUSK | `cd2d4626` | 66 | 186,500 |
| M1A2 SEPv2 | `d28d4020` | 58 | 170,348 |
| M1A2 SEPv3 | `690d16fa` | 55 | 172,628 |

Disposition: **KEEP**. The marked cavities are closed symmetrically across the
entire live Abrams family with no running-gear or side-armor regression.
