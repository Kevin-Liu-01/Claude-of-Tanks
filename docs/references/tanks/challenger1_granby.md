# Challenger 1 Granby (`challenger1_granby`) — release 262, the Op Granby fit on the historical rebuild

## Current status

- Added 2026-10-27 (lane item/vickers-cr1-262, target release 262). This build began as the Challenger 1 Mk 3's
  historical rebuild; the owner then ruled: "wait the challenger mk 3 was fine but we can use the one we made for it into
  another variant". The Mk 3 (`challenger1_mk3`) keeps its supplied-file build ([challenger1_x.md](challenger1_x.md)),
  and this rebuild is its own id.
- Implementation: the shared build ([challenger1_mk2.md](challenger1_mk2.md), `challenger1Historic.ts` with
  `mark === 'granby'`), on the Mk 2's combat row (`additionalFleetSpecs.ts` `challenger1Row`), tier VIII, off the Mk 2 in
  the Challenger line.
- The Granby applique is drawn; it is not yet charged as its own armour zones (the Mk 3's
  `sourceXWesternAuxArmor.ts` zones stay on the Mk 3's supplied-file skirts). Owed.

## What differs from the Mk 2, and why

Sources (S1–S7 in the Mk 2 packet; the Granby notes from en/fr/pl Wikipedia, 1420kh.co.uk, the QRH museum): the Mk 1,
Mk 2 and Mk 3 share the outer hull and turret; the marks differ internally (TOGS fitted from the Mk 2, armoured charge
bins on the Mk 3) and in small stowage. The visible difference the game carries is the 1990–91 Op Granby fit, which the 7th Armoured Brigade's Mk 2s and Mk 3s carried:

| Item | Source | Now (262) |
|---|---|---|
| Side armour | VARMA / Chobham bolt-on panels over the skirts (fr/pl wiki, QRH museum) | six box-section cassettes (0.77 m pitch, 6 cm joints with backers), raised bolted cover plates, a forward cassette stepping up over the idler, hangers on the track-guard ledge; 24 cm proud of the skirts, down to 0.36 m |
| Nose ERA | ROMOR-A on the nose and lower front plate (fr/pl wiki) | a row of eight blocks across the nose plate and a second row on the lower nose plate, on welded frames |
| Rear fuel drums | 2 x 175 L, crosswise on brackets (fr wiki, S5) | two 0.78 x 0.58 m drums centred 0.90 m out, strapped into cradles bolted to the rear plate |
| Decor | — | the Mk 2 list without the hull-rear bucket (the drums hang there) |

## Dimensions — source / now

| Quantity | Source | Now |
|---|---:|---:|
| Hull length | 8.32–8.33 m | 8.31 m armour (drums to -4.79) |
| Width | 3.52 m over skirts; the Granby kit adds the panels | 3.52 m skirts, 4.07 m over the cassettes |
| Height, turret roof | 2.50 m | 2.48 m |
| Turret armour height | ~0.85 m | 0.87 m (with the ring housing) |
| Turret width | ~2.55–2.75 m | 2.56 m |
| Overall length | 11.56 m | 11.60 m gun forward (12.18 m with the drums) |
