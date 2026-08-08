# Abrams flank-panel pitch — independent re-cert verdict

Date: 2026-08-08

Scope: the owner-ordered correction that makes the Abrams turret-side bins,
plates, CIP panels, radar faces, seam rails, pouch, and drum mounts lie flush
on the certified tumblehome plane instead of standing vertically away from
the shell. The critic did not author the change.

Evidence: `shots/abrams-crows-r1/panelpitch-<id>/` (fresh official 14-view
REF|PROC sheets for five oracle-carrying marks),
`shots/abrams-panelpitch/recert-m1a2_sepv3/` (fresh 14-view proc-only false-0
sitting), and `shots/abrams-panelpitch/{before,after}/` (seven garage views
per family member).

## Verdict

| id | class | old hash | candidate hash | floor | mean | verdict |
|---|---|---:|---:|---:|---:|---|
| m1a1 | graduate | 2f277528 | 4e28ff40 | 9.1 | 9.19 | RE-CERT PASS; re-freeze |
| m1a1ha | graduate | aa7af504 | 99962364 | 9.1 | 9.19 | RE-CERT PASS; re-freeze |
| m1a2_tejas | graduate | f7510d88 | 3afe65f0 | 9.1 | 9.22 | RE-CERT PASS; re-freeze |
| m1a2_sepv2 | graduate | 54b35994 | c5bfbb70 | 9.1 | 9.18 | RE-CERT PASS; re-freeze |
| m1a2_tusk | gate-in-loop | b1786e4c | bd371600 | 9.0 | 9.13 | PASS; bind candidate |
| m1a2_sepv3 | false-0 binding | 2c9023d0 | 329ec520 | 9.1 | 9.20 | PASS; bind candidate |

All 84 fresh scored views meet the 9.0 bar. The five oracle-backed marks were
judged against the same tejas print used by the gate. SEPv3 has no honest
reference registration and was therefore identity-scored on the proc-only
rig; no fabricated parity claim or gate row was created.

## Changed-read adjudication

- The left four-bin band and right double-lip now follow the shell's 16.9°
  tumblehome. At plan, side, front-quarter, rear-quarter, and close-roof the
  faces form one continuous armored mass with no sky gap or vertical-card
  silhouette.
- CIP and Trophy/radar plates follow their carriers at the same proud offsets.
  Seam rails are split at the real bay joints. The rear pouch and drum remain
  connected by visible mounts instead of hovering beside the leaned wall.
- The standing horn posts remain standing fittings by design; the new buried
  mount bracket closes their changed seat. CROWS, loaders, racks, hull ERA,
  stern furniture, and the M256 run retain their certified identities.
- TUSK remains an honest chimera-capped row, but its carrier geometry is
  coherent and the ARAT/slat/LAGS identity is unchanged. SEPv3 keeps its
  Trophy/ARAT/APU/ADL package and reads cleanly in every self view.
- The retired legacy `m1a2` and `abramsx` are true guards: all seven garage
  views for each are pixel-identical before/after, and hashes stay
  `636a4860` / `2c6eb344`.

## Machine receipts

The edited hash battery reproduced twice. Two full seven-id gate runs were
byte-identical, followed by a third byte-identical TUSK report. Final rows:

| id | min | hull / whole / turret / stations / dims / floaters |
|---|---:|---|
| m1a1 | 84.1 | 91.7 / 84.1 / 85.6 / 92.5 / 100 / 100 |
| m1a1ha | 83.1 | 91.7 / 83.1 / 85.6 / 92.5 / 100 / 100 |
| m1a2_tejas | 75.6 | 92 / 75.6 / 83.3 / 92.3 / 100 / 100 |
| m1a2_sepv2 | 64.6 | 69.5 / 64.6 / 78.9 / 77.4 / 100 / 100 |
| m1a2_tusk | 1.8 | 14.9 / 1.8 / 42.2 / 23.5 / 100 / 100 |
| m1a2_sepv3 | — | FALSE-0: no gate row |

The 42.3→42.2 TUSK plan-slice movement is deterministic at the changed bytes,
not run noise; all achievable rows remain bounded by the existing chimera
certification. Standard checks report track clip 0/0, contiguity 0, and an MG
census on all six. Turret-parent audit is clean except the already certified
SEPv2/TUSK works/deck-gear classes. Winding mode 1 is clean (one trivial TUSK
pixel); mode-2 candidates reproduce the same SEPv2/TUSK/SEPv3 hull-deck
furniture classes. No new order is attached.

**PASS.** Re-freeze the four graduates at the hashes above; bind TUSK and
SEPv3. The §5.74 distinctiveness round may now start on the pitched carriers.
