# T-84BM Oplot-T (`bm_oplot_t`) — packet

The Royal Thai Army's BM Oplot-T (Object 478DU9-T), built by `buildOplotBM(P, 't')` on the Oplot-M build; sources,
registration, construction and combat data are in [bm_oplot_m.md](bm_oplot_m.md). Release 262, tier X.

## What makes it its own tank

- Sources: Wikipedia "T-84" (478DU9-T: a different radio and an air conditioner for local conditions; 49 ordered in
  2011, delivered 2013-2018, the last six in August 2018; one sold to the US in 2021), the Ukrainian variant lists
  (478DU9-T differs from 478DU9-1 by its air conditioner and auxiliary power unit), War Thunder's BM Oplot-T note
  (modified side screens, an additional rear ladder, an extra power unit), and the owner's desert-finish reference.
- Air conditioner: a louvred housing with its fan on the bustle's rear face (profiles/oplotBM.ts buildBustleStowage).
- Auxiliary power unit: a low louvred box on the left rear fender, its exhaust out of the outboard face (low enough
  that the main gun keeps level over it).
- Side screens: Duplet only on the three forward panels of each skirt band; bolted appliqué plates on the rest.
- Boarding steps hung off the left rear fender's end (clear of the stern drums); the longer bustle stowage (two packs).
- Its own kit (owner: distinct): M2 mini-turret with a searchlight and a 7.62 open cradle, bolted appliqué on the rear
  skirt panels, a bustle slat cage, a cheek searchlight and work lamps, desert-issue stern drums (bm_oplot_m.md, kits).
- Finish: the owner's reference desert scheme (sand base, red-brown and dark-brown patches, `nato` painter), number
  231, the Thai tricolour as its insignia (`visual.insignia = 'th-flag'`, vehicleMarkings.ts drawThaiFlag); country,
  filter and designation stay Ukraine (the builder's nation).
- No field branches (decorations.ts FIELD_FOLIAGE lists the Oplot-M only).
- Stats: as the Oplot-M, 51.5 t for the conditioner and the APU.
