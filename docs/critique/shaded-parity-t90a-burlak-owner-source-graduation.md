# T-90A Burlak native-procedural graduation — independent §B8 final

Date: 2026-08-11

Frozen candidate: `5ae80a4` (61 meshes / 93,412 vertices)

Disposition: **PASS / KEEP**

The critic discarded the r6 paired-basis scores and inspected only the 42
distinct final-byte PNGs in r7: fourteen paired 1280x640 standard views,
fourteen yaw-0 frames and fourteen genuine yaw-90 frames at 768x768.

Required order `[front, frontleft, left, rearleft, rear, rearright, right,
frontright, top, hero-frontleft, hero-rearright, hero-toptilt, close-front,
close-roof]`:

`[9.2, 9.2, 9.0, 9.0, 9.1, 9.0, 9.0, 9.1, 9.2, 9.2, 9.1, 9.2, 9.1, 9.2]`

Floor **9.0**; mean **9.11**. Every required view clears 9.0.

- Reference-guided fidelity PASS: the low clipped shell, chamfered wings,
  buried varied protection, mantlet/gun run, narrow autoloader bustle,
  asymmetric roof and six-wheel hull preserve the Burlak identity using only
  our authored procedural construction.
- Yaw and load paths PASS: the complete shell, protection, gun, bustle and
  supported roof suite rotate together; all hull, transom and running-gear
  components remain fixed with no fused or stranded mass.
- Bow and native course PASS: the inboard bow hooks remain hull-seated and
  clear the final idler course; six wheels per side form one continuous linked
  run with exact band/shoe collision receipt `0/0/0/0`.
- Winding PASS: no shell, bustle, hull or transom face disappears, opens or
  produces a sky hole, silhouette wound or yaw-dependent backface pop.

Mechanical receipts on the immutable bytes: deterministic geometry hash
`5ae80a4` twice; parent audit `stranded 0 / abutting 0 / dangling 0`; muzzle
PASS; assets PASS; unit tests PASS; private production build PASS. The live
reference geometry gate remains an honest false zero (`min 0`, hull 43.2,
whole 24.6, turret 6.7, stations 11, dims 0, floaters 100) under the documented
reference-normalization, bustle-span and commander-height caps; it is recorded,
not substituted for the fresh 42-frame visual certification.

Ordered blockers: none. **KEEP `5ae80a4`.**
