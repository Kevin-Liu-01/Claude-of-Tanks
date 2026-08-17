# upior_ifv — §5.349 residue packet (UNCOMMITTED-UNSTAGED, 2026-08-17)

ORDERS (handoff §6): (a) framed sensor pocket 489px y0-rqr, (b) bow-fitting
float 119px (bmp3_rok family class). Ungated id: sweep x2 + envelope/track
gates.

## Baseline verification (task said 3f16cb9a-class, verify live)
- Live @ 6e27a4c8: 735f96a0 (equipment landing move, anticipated).
- §5.356 hover live (2.3 cm ring air; packet lists upior_ifv 1.66 -> 1.769
  remap); §5.361 re-seated mid-lane.
- Working PRE baseline @ 896384ed (edits reverted): 8e3c00c0 (66/84616).

## Fixes (addUpiorStation / buildUpiorIFVVariant only)
- Pocket (668px live y0-rqr @ [y 2.51..2.82] world): the sensor head
  cantilevered over air behind/beside its pedestal ring; the enclosed frame
  is head rear + MG cluster + rack cargo (evidence crop). Mast arm block
  box(0.37, 0.34, 0.26) @ (0.025, 0.84, -0.36): bottom buried in the crown
  slab (0.67 vs 0.69), front welded 4 cm into the head, clear of the MG ring
  (x -0.22) and right station lid (x 0.212).
- Bow light platforms KIT.box(0.24, 0.16, 0.18) @ (+-1.14, 1.385, 2.84):
  same grammar as bmp3_rok(b) at this id's own light station (1.51/2.84).

## Receipts (tree c13e67c3; after/ + after-run2/ identical view-for-view)
- y0-rqr enclosed 666 -> 113 (83px cm-notch + slivers, MINOR charter);
  rqr islands 0.
- Side islands 192 -> 85 (light hover 106px GONE; what remains is the
  pre-existing 77px rack-rail sliver + 8px nose sliver — see below).
- Enclosed side totals ~2130 = wheel-daylight rows (§B9, unchanged).
- Track-clip STRICT: 0/0 band, 0/0 shoe.
- §B5: arm is P.add('turret') bucket; y45 views hold clean.
- Hash: 8e3c00c0 -> e2cf8368 (66 meshes, verts 84616 -> 85588).

## Residuals / not-mine (left, banked)
- 77px rail sliver [y 2.11..2.20, z -0.88..-0.82]: the bustle rail plate
  sits 1.2 cm proud of the drum rear in silhouette — pre-existing,
  turret-local, cm-class; not in the orders.
- y0-top 16453 / front-low 9759 island px: donor buildBMP2 skirt-bin dash
  class in plan views (byte-held donor surface) — foreign.
- 8px nose sliver + 7px y45-fql: aliasing-class.
