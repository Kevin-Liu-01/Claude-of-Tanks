# Abrams distinctiveness — independent re-cert verdict

Date: 2026-08-08

Scope: the complete §5.74 owner order following the certified flank-panel
pitch. The builder harvested the retired legacy M1A2 kit vocabulary and made
four current marks visually distinct with mark-specific CROWS, ERA, roof, and
stowage packages. The independent critic did not author the change.

Evidence: `shots/abrams-distinctiveness/critic-r1/{ref,proc}-<id>/` contains
fresh official 14-view sheets for Tejas, TUSK, and SEPv2;
`shots/abrams-distinctiveness/candidate-r1/m1a2_sepv3/` (with the selected
candidate-r3 refinement) is the proc-only FALSE-0 sitting. Before/candidate
sets and four contact sheets are retained under `shots/abrams-distinctiveness/`.

## Verdict

Score order in every row: close-front, close-roof, hero-frontleft,
hero-rearright, hero-toptilt, view-front, view-frontleft, view-frontright,
view-left, view-rear, view-rearleft, view-rearright, view-right, view-top.

| id | scores | floor | mean | verdict |
|---|---|---:|---:|---|
| m1a2_tejas | 9.3, 9.4, 9.3, 9.3, 9.2, 9.3, 9.2, 9.2, 9.1, 9.3, 9.2, 9.2, 9.1, 9.1 | 9.1 | 9.23 | RE-CERT PASS; re-freeze |
| m1a2_tusk | 9.3, 9.3, 9.3, 9.4, 9.2, 9.3, 9.2, 9.2, 9.1, 9.4, 9.3, 9.3, 9.2, 9.1 | 9.1 | 9.26 | PASS; bind candidate |
| m1a2_sepv2 | 9.4, 9.4, 9.4, 9.4, 9.3, 9.3, 9.3, 9.3, 9.2, 9.3, 9.3, 9.3, 9.2, 9.2 | 9.2 | 9.31 | RE-CERT PASS; re-freeze |
| m1a2_sepv3 | 9.2, 9.3, 9.2, 9.3, 9.3, 9.2, 9.1, 9.2, 9.0, 9.3, 9.1, 9.2, 9.1, 9.3 | 9.0 | 9.20 | FALSE-0 identity PASS; bind candidate |

All 56 fresh scored views meet the 9.0 owner bar. No fix round is ordered.
SEPv3 was judged for procedural identity only because it has no honest oracle;
this is not a fabricated shaded-parity or geometry claim.

## Distinctiveness adjudication

- Tejas/new-M1A2 reads clean and ERA-free: massive forward unarmored CROWS,
  restrained roof furniture, spare links, sustainment roll, and relay/tool
  case.
- TUSK reads as the urban heavy mark: fully wrapped massive CROWS, emphasized
  loader shield and M240, four ARAT-style turret panels per flank, two-course
  hull ARAT, TIP, and rear slat cage.
- SEPv2 reads as the tall passive-armor mark: elevated rectangular CROWS hood,
  one broad hull cassette course, and four large pitched turret slabs per
  flank.
- SEPv3 reads as the current wide-low mark: LP CROWS, fine 9x2 hull and 5x2
  turret micro-cassettes, ADL/IFLIR/Trophy/APU, and real deterministic foliage
  geometry across roof, glacis, and side ERA. The foliage rosettes are a minor
  stylization note, not an order; the mark remains legible from all 14 views.

## P95 datum and geometry receipts

The §5.73-1 mandatory-kit rule replaces the inherited 2.44 m bare-roof datum.
The authoritative 1024-mask replica measured tejas 3.2441 m (spec 3.24), TUSK
3.2748 (3.27), SEPv2 3.4265 (3.43), and SEPv3 3.1009 (3.10). All four report
100 on the datum/dimensions sanity check; SEPv3's FALSE-0 replica was repeated
twice exactly.

Two edited-tree hash batteries and two complete gate sittings reproduced
exactly:

| id | old hash | final hash | meshes / verts | min | hull / whole / turret / stations / dims / floaters |
|---|---:|---:|---:|---:|---|
| m1a2_tejas | 3afe65f0 | 01e698e8 | 48 / 159596 | 57.8 | 91.7 / 57.8 / 63.3 / 91.9 / 100 / 100 |
| m1a2_tusk | bd371600 | 7620b020 | 58 / 200924 | 0 | 14.7 / 0 / 39 / 23.1 / 100 / 100 |
| m1a2_sepv2 | c5bfbb70 | a0a4e87c | 50 / 168548 | 37.3 | 69.4 / 37.3 / 53 / 73.2 / 100 / 100 |
| m1a2_sepv3 | 329ec520 | d6e87b0c | 51 / 204812 | — | FALSE-0: no gate row |

The oracle-backed rows are explicitly **not geometry PASSes**. Relative to
the prior 75.6 / 1.8 / 64.6 rows, the masks price the owner-mandated CROWS and
armor silhouettes plus the honest P95 datum. This is owner-adjudicated oracle
divergence, not a hidden regression; dims and floaters remain 100. The fleet
ledger remains 24/96. SEPv3 receives neither a gate file nor a ledger row.

Exact guards held in both batteries: M1A1 `4e28ff40`, M1A1HA `99962364`,
retired legacy M1A2 `636a4860`, and AbramsX `2c6eb344`.

## Mechanical receipts

- Exact track clipping: 0/0 for all four; contiguity holes: 0 for all four.
- MG census: Tejas mg1+2d, TUSK mg1+7d, SEPv2 mg1+3d, SEPv3 mg1+1d.
- Turret-parent audit: Tejas and SEPv3 0/0/0; TUSK 1 stranded / 2 abutting /
  0 dangling and SEPv2 0/2/0 are the pre-existing certified merged/deck-gear
  classes, not new detached kit.
- Winding mode 1: reversed 0, mixed 0, deficit 0 for every mark. Mode-2
  candidates (TUSK 425, SEPv2 424, SEPv3 325) remain known static/coincident
  hull/deck furniture classes; Tejas is 0.

**PASS.** Re-freeze Tejas and SEPv2 and bind TUSK and FALSE-0 SEPv3 at the
hashes above. The §5.74 order is complete.
