# Challenger 1 Mk 3 (`challenger1_mk3`) — release 262 historical rebuild (Op Granby fit)

## Current status

- Updated: 2026-10-27 (lane item/vickers-cr1-262, target release 262).
- Owner request (2026-10-27): the Challenger 1 rebuilt "based on proper historical referrences so they will no longer
  look so chungus"; the coordinator's brief keeps the Mk 3 consistent with the rebuilt Mk 2 where the real vehicles
  share hull and turret. This **supersedes the owner's 2026-09-06 supplied-file target** for this id
  ([challenger1_x.md](challenger1_x.md)): that file's proportions were a 6.42 m hull at 3.51 m wide (a third short),
  which the 2026-09-29 1.10 size factor grew to 7.06 x 3.86 m. Both are retired; flagged to Main as an owner-visible
  change.
- Implementation: the shared build ([challenger1_mk2.md](challenger1_mk2.md), `challenger1Historic.ts` with
  `mark === 'mk3'`). Spec dims are the shared datums (`CR1_HISTORIC.dims`); the 1.10 entries left
  `vehicleSizePolicy.ts` and `tools/owner-size-targets.ts`.
- The supplied-file modules (`challenger1XSupplied*.ts`, `challenger1XSourceHood.ts`) and their two selftests built no
  playable after the rebuild; they are retired (removed from the tree and the suites; copies kept in the lane's Trash).

## What differs from the Mk 2, and why

Sources (S1–S7 in the Mk 2 packet; the Granby notes from en/fr/pl Wikipedia, 1420kh.co.uk, the QRH museum): the Mk 1,
Mk 2 and Mk 3 share the outer hull and turret; the marks differ internally (TOGS fitted from the Mk 2, armoured charge
bins on the Mk 3) and in small stowage. The visible difference the game carries is the 1990–91 Op Granby fit, which
this id has worn since its supplied-file build and which the 7th Armoured Brigade's Mk 3s carried:

| Item | Source | Now (262) |
|---|---|---|
| Side armour | VARMA / Chobham bolt-on panels over the skirts (fr/pl wiki, QRH museum) | six box-section cassettes (0.77 m pitch, 6 cm joints with backers), raised bolted cover plates, a forward cassette stepping up over the idler, hangers on the track-guard ledge; 24 cm proud of the skirts, down to 0.36 m |
| Nose ERA | ROMOR-A on the nose and lower front plate (fr/pl wiki) | a row of eight blocks across the nose plate and a second row on the lower nose plate, on welded frames |
| Rear fuel drums | 2 x 175 L, crosswise on brackets (fr wiki, S5) | two 0.78 x 0.58 m drums centred 0.90 m out, strapped into cradles bolted to the rear plate |
| Armour zones | — | `sourceXWesternAuxArmor.ts` `challengerSkirts` rebuilt on the new cassettes and skirts (one exposed family charged per shot) |
| Decor | — | the Mk 2 list without the hull-rear bucket (the drums hang there) |

## Gap table — before (supplied-file build, main 260) / source / now

| Quantity | Before | Source | Now |
|---|---:|---:|---:|
| Hull length | 7.06 m (6.42 x 1.10) | 8.32–8.33 m | 8.31 m armour (drums to -4.79) |
| Width | 3.86 m (with applique) | 3.52 m over skirts; Granby kit adds the panels | 3.52 m skirts, 4.07 m over the cassettes |
| Height, turret roof | 2.41 m | 2.50 m | 2.48 m |
| Turret armour height | **0.79 m** | ~0.85 m | 0.87 m (with the ring housing) |
| Turret width | 2.90 m | ~2.55–2.75 m | 2.56 m |
| Overall length | 10.82 m | 11.56 m | 11.60 m gun forward (12.18 m with the drums) |
