# Abrams raked shoulders and rear-corner closure — verification (2026-08-15)

## Scope

Owner close-ups showed that the first front-pocket repair formed flat shelves
above the real fender seam and did not close the open rear-left/right sprocket
wells. The correction is shared by the six live first-party Abrams builders:
`m1a1`, `m1a1ha`, `m1a2`, `m1a2_tusk`, `m1a2_sepv2` and `m1a2_sepv3`.

The flat front boxes are replaced by closed, outward-wound raked slabs. Their
inner edges remain above the idler crown and their low outer returns land beyond
the track-pin plane on the existing fender line. Each rear corner receives a
high roof and outboard wall tied into the center stern, skirt top, grille pod
and existing rear guard. No pre-existing hull, skirt, wheel, suspension or
smart-track geometry is removed.

## Visual evidence

- Fresh evidence root: `/private/tmp/abrams-shoulder-angle-final`.
- Every tank has 15 paired, 15 yaw0 and 15 yaw90 frames: **270 PNGs / 270
  distinct SHA-256 hashes**.
- Close Surface Lab reproductions are
  `/private/tmp/abrams-shoulder-r2-front-corner.png` and
  `/private/tmp/abrams-shoulder-r2-rear-corner.png`.
- Front-quarter/top frames show the shoulder falling into the outer fender
  instead of hovering horizontally. Rear-quarter/top frames show continuous
  armor over both former sprocket wells.
- Yaw0/yaw90 frames keep every changed plate hull-fixed while the complete
  turret, gun and roof suite rotate together.

## Mechanical receipts

- Exact track audit: band **0/0**, individual shoes **0/0**, strict sweep
  **0/0** front/rear on all six variants.
- Duplicate-track audit: **PASS**, one integrated animated shoe course per
  tank.
- Winding audit mode 1: **PASS**, zero reversed/mixed slab calls; SEPv2's
  unchanged 90-pixel DoubleSide diagnostic is reproduced by the parent
  candidate and remains below the hard threshold.
- Turret-parent audit: unchanged fixed-hull nominees on TUSK/SEP variants;
  the new shoulder/rear meshes are explicitly hull-owned.
- Targeted presentation assets and dual-ledger freeze are regenerated.
- Targeted asset check, all 81 first-party freeze checks, the full unit-test
  suite and the production build all pass.

## Frozen geometry

| Tank | Freeze | Instance freeze | Asset geometry | Meshes | Vertices |
|---|---:|---:|---:|---:|---:|
| M1A1 | `da934f6c` | `e77320ff` | `f71c9312` | 54 | 126,980 |
| M1A1HA | `fcbe7ff0` | `55d79786` | `d2741b43` | 55 | 160,616 |
| M1A2 | `4cce8a04` | `1e0a811e` | `048a2588` | 56 | 159,296 |
| M1A2 TUSK | `fae459f0` | `821a955f` | `23b83cac` | 66 | 185,852 |
| M1A2 SEPv2 | `065d7e9b` | `cdcc46d9` | `0df281b5` | 58 | 169,700 |
| M1A2 SEPv3 | `ca666266` | `a9173aa5` | `a69bbd97` | 55 | 171,980 |

Disposition: **KEEP**. Both owner-marked front and rear failure classes are
closed without altering the accepted side armor or running gear.
