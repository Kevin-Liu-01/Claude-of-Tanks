# Challenger 1 Mk 2 (`challenger1_mk2`) — release 262: the BAOR exercise fit on the Mk 3's build

## Current status

- Fit (owner 2026-10-28: the Mk 1 and Mk 2 "NEED TO LOOK A LOT DIFERENT FROM MK 3", and the turrets, decorations,
  equipment, optics and machine guns "updated for all 3"). The Mk 2 has TOGS working: the barbette's port is glazed
  behind an armoured door hinged on its top edge, propped open. It carries the two quick-release rear fuel drums it
  introduced, and the BAOR exercise load: camouflage nets rolled on the bustle and the left turret side, crew packs, a
  pair of cans and a canvas roll. It has the commander's L37A2 GPMG, the glazed cupola and the loader's periscope of every
  mark. It keeps the BAOR coat; the Mk 3 alone takes the Op Granby kit and desert sand.
- Updated 2026-10-28 (lane item/vickers-cr1-262, target release 262).
- Owner ruling (2026-10-28): "like the challenger 1 mk 3 that is currently there, that turret is what it is actually like, and we should just use the weird turrets we invented to make nnew tanks like action X variants or connqueror orr smthg".
- The Mk 2 rides the Mk 3's supplied-file build ([challenger1_x.md](challenger1_x.md);
  `challenger1XSupplied.ts` `buildChallenger1SuppliedPlain`) without the Op Granby kit that build carries (the side
  applique, the nose array and the rear drums): the Mk 1, Mk 2 and Mk 3 share the outer hull and turret (S6). Its spec
  takes the build's dimensions, turret ring, trunnion and muzzle and its installed skirts as spaced armour
  (`additionalFleetSpecs.ts` `onChallenger1SuppliedBuild`), and the Mk 3's installed size (x1.10, `vehicleSizePolicy.ts`).
  The Mk 3 itself is untouched.
- The release-262 rebuild from historical references (hull, two turrets, L11A5) became the fictional FV4030/5 and
  X Sleek ([challenger_x.md](challenger_x.md)), whose doc keeps the references and the gap table.
- Armour: the sourced Challenger 1 estimates below, early hull front; the Mk 3 takes the late hull front.
- The old oracle-fitted build's history is [challenger1.md](challenger1.md).

## Armour estimates (release 262; ESTIMATES, not official figures)

Main asked on 2026-10-27 for the Challenger 1s to stop inheriting the Challenger 2's armour package. That package was
turret cheeks 600/900 and glacis 500/800 here, against 751/1126 on the Challenger 2 itself after its compensation.
The Chobham figures are still classified, and no official KE/CE values are public. The values below are community
estimates. They are compiled from declassified or unnamed documents, which their posters do not identify. Treat them
as estimates. All values are mm RHA equivalent, given as KE / CE.

| Ref | Source | What it gives |
|---|---|---|
| A1 | War Thunder forum, "Challenger 1 MBT - Technical Data and Discussions", posts of 2026-06-19 by Kobes-Kamov (forum.warthunder.com/t/23266, pages 26-27). Cites figures from an attached image; names no document. | Turret front: 430-500 KE "depending on source"; 500 KE head-on, 430 KE the minimum across about +-20 degrees. Hull front: 300 KE / 580 CE on the early Mk 1 and Mk 2, raised to 350 KE / 700 CE on the late (Desert Storm) Mk 3. |
| A2 | Same thread, 2026-06-19/20, BARElement-psn (in-game protection analysis) | Hull 330-337 KE on the Mk 1/Mk 2 and 350-362 KE on the Mk 3, against 3BM22-type rounds; Mk 3 hull CE 614-750. These are consistent with A1. |
| A3 | War Thunder wiki (old), "Challenger Mk.2", as quoted by the search index (the page now returns 401) | Turret front 470 KE (about 550 without the long-rod modifier) / 600 CE; turret sides 140 KE / 300 CE; upper front plate 220 KE (game value). |
| A4 | War Thunder forum (search summary), another post in the same thread | Turret 480 KE / 600 CE; 435 KE across a 60-degree arc. |

Step 2, the fleet's scale (Main's ruling, 2026-10-27: "put the CR1 estimates on the fleet's own scale, and derive
the factor rather than picking it"). For each zone, the factor is the median ratio of game value to public estimate
over the fleet's sourced Western peers, with KE and CE taken separately because their ratios differ. No packet in
`docs/references` carried armour estimates, so the peers' estimates come from the same class of public sources:

| Peer | Zone | Public estimate KE / CE | Source | Game value KE / CE | Ratio KE / CE |
|---|---|---:|---|---:|---:|
| Leopard 2A4 | turret front | 415 / 750-800 (775) | War Thunder forum, "Leopard 2 composite armour" (forum.warthunder.com/t/74313); the later package, 60-degree arc | 546 / 780 | 1.316 / 1.006 |
| M1A1 (1985) | turret front | 460 / 750 | War Thunder forum (Abrams armour threads), quoting declassified British Chieftain-replacement reports; KE over +-20 degrees, CE over +-27 degrees | 731 / 1075 | 1.589 / 1.433 |
| M1A1 | hull front (non-DU) | 350 / 750 | War Thunder forum, "Hull Armor of the M1 Abrams" (forum.warthunder.com/t/59315), from British and Swedish evaluations | 516 / 645 (lower_front) | 1.474 / 0.860 |

Factors:
- Turret: KE x1.452, CE x1.220 (the median of the Leopard 2A4 and the M1A1).
- Hull: KE x1.474, CE x0.860 (the M1A1 alone; no Leopard 2A4 hull estimate was found).

Ratings (`src/vehicles/challenger1Armor.ts` keeps both the raw estimates and the factors):

| Plate | Before (Challenger 2 package) | Raw estimate | Now (fleet scale) | Basis |
|---|---:|---:|---:|---|
| Turret cheeks (front) | 600 / 900 | 470 / 600 | **682 / 732** | A1 430-500 KE, A3/A4 470-480 KE, 600 CE |
| Gun slot (mantlet_slot) | 450 / 550 | 430 / 600 | **624 / 732** | A1, the frontal arc's minimum |
| Turret sides | 300 / 450 | 140 / 300 | **203 / 366** | A3 |
| Upper glacis and lower front: Mk 1, Mk 2 | 500 / 800 and 300 / 400 | 300 / 580 | **442 / 499** | A1 (early marks), A2 |
| Upper glacis and lower front: Mk 3, Granby | as above | 350 / 700 | **516 / 602** | A1 (the late Mk 3's hull), A2 |
| Everything else (sides, skirts, roof, rear) | Challenger 2 donor | — | unchanged | no source |

The marks differ only in the hull front, which the sources raise on the late Mk 3. The Mk 3 clones the Mk 2's armour
(`sourceXSecondWaveSpecs.ts`) and is then rated late. The Granby variant is the Desert Storm fit and is rated late. The
Mk 1 is rated early.

These numbers are provisional. Progression's fleet-wide gun-face hit-model fix lands last in 262 and moves every
Western gun face, this one included; progression re-measures the tiers after it.
