# T-72 first-party family reference

## Authorship law

All live models are repository-authored procedural designs. Quarantined GLBs
are visual/measurement oracles only and never supply runtime geometry or art.

## Canonical order

1. `t72b_1987` — Kontakt-1-equipped late T-72B with armored commander/NSVT
   station and dense cast-cheek coverage.
2. `t72bu` — obr. 1992 demonstrator with pointed protection blanket,
   asymmetric searchlight/sight package, four-drum rear field and wading kit.
3. `pt91m` — Polish derivative with ERAWA, SAVAN station and its own roof and
   rear-service grammar.
4. `t72b3m` — later B3M fit with pointed Kontakt-5, Sosna-U, modern flank/rear
   packs and denser low roof electronics.

## Shared mechanical standard

- Compact low hull and low pear/cast turret.
- Front free idler -> six dished road wheels -> return rollers -> rear final-
  drive sprocket.
- One continuous linked-shoe course, with no hidden hull/skirt/flap crossing
  the moving envelope.
- Articulated 125 mm gun with a visible dark bore.
- Hull-owned glacis, driver/engine deck, skirts and rear service field;
  turret-owned protection, sights, smoke, cupolas/MG, antennas and rear packs.

## Current receipt

See `docs/PROGRAM-STATE.md` §5.181 and
`docs/critique/native-t72-family-recert.md`. Current freezes are
`9aa22fb4`, `c3fb25ec`, `6ae53930` and `f46418a4`; every required 14-view,
yaw, exact-course, contiguity, parent, winding, bore and runtime check passes.
