# PT-84 Orzeł (`pt84_orzel`) — packet

A first-party Polish game concept on the T-84BM Oplot-M / Oplot-T base, built by `buildOplotBM(P, 'pl')`
(profiles/oplotBM.ts); the hull, running gear, welded turret and armoured bustle are the Oplot-M's (registration,
sections and frames in [bm_oplot_m.md](bm_oplot_m.md)). Release 262, tier X, Poland. Owner 2026-10-28: "make a new
polish version based on this style". Owner-authored design record:
`docs/references/concepts/pt84-orzel-20261028.json` (no source print; the release gate reads it through
`tools/first-party-concept-policy.mjs`).

## The what-if

Poland never fielded the Oplot. The Orzeł ("eagle") is what the Bumar-Łabędy / KMDB partnership behind the PT-17
(MSPO 2017: a T-72 / PT-91 hull with a new turret, the Ukrainian 120 mm smoothbore in an autoloader firing NATO rounds,
Ukrainian ERA, a 12.7 mm ZSMU remote station and Obra-3 laser warning) might have put on the Oplot itself, in the
fleet's Polish design language (the Zubr family's Krata, `profiles/polandFrontEra.ts`; the PT-64 Tur).

Sources for the real parts: Defence-Blog and Army Recognition on the PT-17 (MSPO 2017: Bumar-Łabędy with KMDB, the 120 mm
KBM2, Ukrainian ERA, the ZSMU A4 12.7 mm station, Obra-3); Defence24 on ZM Tarnów's ZSMU-1276 (WKM-B 12.7 mm or
UKM-2000C 7.62 mm); Luch's Falarick 120 (a gun-launched missile for NATO 120 mm guns); the K2PL's K279 / K280 / K281
rounds (the fleet's K2 rows, modern3Specs.ts).

## What makes it its own tank

- Krata ERA in place of the Duplet: framed ERAWA-2 grids, each cassette 3 cm down inside a welded frame of dark steel rails
  and mullions (5 cm wide, so the grid reads through the camouflage: the 262 blind critic) standing 9 cm proud: two
  3 x 3 glacis fields either side of the gun's slot; welded cheek boxes on the Duplet stacks' plan (set back 10 cm), each
  column's face a framed field of two; a 4 x 2 field on each turret flank; and the five forward skirt panels each its own
  framed field of two (one where the box falls to the bow): the owner's extra side armour. Over the engine bay behind
  them, stand-off slat armour 14 cm off the skirt box with a cap plate to it.
- Its own silhouette (the 262 visual bar's blind critics, rounds 1-4: its framed skirt and turret wrap were the Żbik's,
  its side view the Oplot-M's): the PT-17's long welded ammunition bustle, the turret's full width back to 2.64 m behind
  the ring, three blow-off panels on its roof; and a spaced-armour wedge on each cheek, its edge 0.54 m ahead of the
  cheek.
- Tellur 81 mm smoke: the PT-91's two by twelve, a six by two bank low on each smoke housing, its number above it.
- PCO's round panoramic commander's head on a mast in place of the PNK-6 tower.
- Obra-3: four laser-warning heads (the cheek boxes' outer tops, the bustle corners) in place of the Varta jammers.
- Two ZM Tarnów ZSMU-1276 remote stations (two gun towers, as the Oplot-M and Oplot-T): a 12.7 mm WKM-B on a tower over
  the commander's side, a 7.62 mm UKM-2000 on the gunner's; each with its ZMO optronic head over its arm and its ammunition
  box on the left, working auxiliary weapons (auxiliaryWeapons.ts `wkmb`).
- The Polish rear stowage box and two jerrycans in a rack on the bustle's rear face, a tarpaulin roll on its roof (no
  field basket); twin guarded work lamps on each cheek box; olive drums on the stern.
- Finish: the Polish three-tone woodland, the Zubr family's authored paint (`paint_pl_t80u_modern`), as its own stock
  coat (camoPolicy.ts), number 184, the Polish checker (0.34 m) on the right bin's face.

## Combat data (ukraine.ts)

- The Oplot-M's installed frame and base armour; ERAWA-2 sectors where the build carries the grids: glacis, cheeks and
  flanks 0.20 / 440 mm, skirts 0.12 / 320 mm (a two-layer cassette short of the Duplet's 0.26 / 480 with its anti-tandem
  layer).
- The KBM2 120 mm in the carousel loader: 6.3 s, K279 APFSDS (700 mm at 2 km on the fleet scale), K280 HEAT-MP, K281 HE
  (the Falarick 120 is owed: a gun-fired guided round fits neither a gun channel nor the auxiliary-missile cadence, the
  integrator's 263 ruling on the Oplots' Kombat); -5 / +14 with its own measured depression curve (held up from 137 degrees,
  where the barrel crosses the rear skirt; its slats stand 10 cm under the deck edge to clear it: oplotBMGun).
- 52.0 t (the grids), 1,200 hp, 70 km/h, hp 2,750, traverse 44 deg/s, flanker.

## The family

The Orzeł is the line tank of three Polish concepts on this base (owner 2026-10-28, "i would like mroe based on that"):
the light hunter [PT-84 Sokół](pt84_sokol.md) (IX) leads to it, and the assault [PT-84 Żbik](pt84_zbik.md) (X) branches
from the Sokół. Tech tree: PT-91A Twardy (V) -> Sokół (IX) -> Orzeł (X), Żbik (X). The three share `POLISH_FIT` in
profiles/oplotBM.ts and one combat table in ukraine.ts.
