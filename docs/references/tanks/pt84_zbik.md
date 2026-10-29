# PT-84 Żbik (`pt84_zbik`) — packet

The assault tank of the PT-84 family: a first-party Polish game concept on the T-84BM Oplot-M base, built by
`buildOplotBM(P, 'plz')` (profiles/oplotBM.ts); the base, the Krata language and the shared parts are in
[pt84_orzel.md](pt84_orzel.md). Release 262, tier X, Poland; it branches from the Sokół on the Twardy line. Owner
2026-10-28: "i would like mroe based on that". Owner-authored design record:
`docs/references/concepts/pt84-family-20261028.json`.

## What makes it its own tank

- Krata-2 everywhere: the Zubr II's language, two-layer bevelled ERAWA-2 pillows flush with 10 cm dark frames, on the
  glacis, the cheek boxes, the turret flanks and every skirt panel.
- A full-width dozer blade across the nose: a four-facet moldboard from 0.16 m to 1.00 m over the ground, its cutting edge
  in dark steel, two push arms and two rams back to the lower plate (in place of the stowed self-entrenching blade).
- Both ZSMU-1276 stations on towers: the 12.7 mm WKM-B and a 7.62 mm UKM-2000 on a 16 cm tower over the cage.
- A searchlight on each cheek box and the stand-off slat cage round the turret's rear half (the Oplot-T's pattern).
- Shared with the family: Tellur banks, the PCO panoramic head, Obra-3 heads, the rear stowage box and field basket, dark
  green drums on the stern.
- Finish: the Urban Block grey (`urbanblock`, camoPolicy.ts), number 311.

## Combat data (ukraine.ts)

- Krata-2 ERAWA-2 a step heavier than the Orzeł's: glacis, cheeks and flanks 0.24 / 480 mm, the full skirt run 0.16 /
  360.
- The KBM2 120 mm, 6.5 s: K279 APFSDS, K280 HEAT-MP, K281 HE (the Falarick 120 owed, as on the Orzeł); its depression held up from 137
  degrees over the deeper rear skirt frames (measured).
- 55.5 t, 1,200 hp, 64 km/h (reverse 25), hp 2,950, traverse 40 deg/s; assault doctrine (the breakthrough facet), view
  410 m.
- Stations: the WKM-B -246..-5 degrees, the UKM-2000 -98..246.
