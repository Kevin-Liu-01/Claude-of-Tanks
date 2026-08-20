# Complete vehicle roster

> Generated from `TANK_SPECS` by `npm run tank:roster`. Do not maintain a second hand-written roster.

Claude of Tanks currently retains **150 saved vehicle records**: **111 production-visible**, **37 local development models**, and **2 non-playable reference placeholders**. Production carousels, matchmaking, the Tank Gallery, and Scene Studio use the production projection.

To inspect every playable saved model locally, copy `.env.example` to `.env.local` and run the Vite development server. The `VITE_COT_DEV_FLEET_KEY` switch is accepted only when Vite reports `DEV=true`; it is ignored by production builds. Development-only entries display a blue `DEV` tag in vehicle pickers. `REF` records remain report-only because they are generic community placeholders, not first-party playable models.

| # | Status | Stable ID | Vehicle | Nation | Tier | Era | Class | Roster reason |
| ---: | :---: | --- | --- | --- | :---: | --- | --- | --- |
| 1 | DEV | `m4a3e8` | M4A3E8 Sherman | USA | VI | ww2 | medium | Historical archive |
| 2 | DEV | `tiger1` | Tiger I | Germany | VII | ww2 | heavy | Production curation |
| 3 | DEV | `t34_85` | T-34-85 | USSR | VI | ww2 | medium | Historical archive |
| 4 | DEV | `is2` | IS-2 | USSR | VII | ww2 | heavy | Historical archive |
| 5 | DEV | `panther_g` | Panther Ausf. G | Germany | VII | ww2 | medium | Production curation |
| 6 | DEV | `m1a2_legacy` | M1A2 Abrams (Legacy) | USA | X | modern | mbt | Production curation |
| 7 | PROD | `t62mv1` | T-62 obr. 1975 | USSR/Russia | VII | modern | mbt | Production |
| 8 | PROD | `t64bv1` | T-64BV1 | USSR/Russia | VIII | modern | mbt | Production |
| 9 | DEV | `t72b_1987` | T-72B obr. 1987 | USSR/Russia | VIII | modern | mbt | Historical archive |
| 10 | PROD | `t72b3m` | T-72B3M obr. 2022 | Russia | IX | modern | mbt | Production |
| 11 | PROD | `t72bu` | T-72BU | USSR/Russia | VIII | modern | mbt | Production |
| 12 | PROD | `pt91m` | PT-91M Pendekar | Poland | VIII | modern | mbt | Production |
| 13 | PROD | `t80` | T-80 | USSR/Russia | VIII | modern | mbt | Production |
| 14 | PROD | `t80b` | T-80B | USSR/Russia | IX | modern | mbt | Production |
| 15 | PROD | `t80bv` | T-80BV | USSR/Russia | IX | modern | mbt | Production |
| 16 | PROD | `t80u` | T-80U | USSR/Russia | VIII | modern | mbt | Production |
| 17 | PROD | `t84` | T-84 Oplot | Ukraine | IX | modern | mbt | Production |
| 18 | PROD | `t90` | T-90 | USSR/Russia | IX | modern | mbt | Production |
| 19 | PROD | `t90a` | T-90A | Russia | IX | modern | mbt | Production |
| 20 | PROD | `t90a_vladimir` | T-90A Vladimir | Russia | IX | modern | mbt | Production |
| 21 | PROD | `t90a_burlak` | T-90A Burlak | USSR/Russia | IX | modern | mbt | Production |
| 22 | PROD | `t90sm` | T-90SM | Russia | IX | modern | mbt | Production |
| 23 | PROD | `t90ms` | T-90MS Tagil | USSR/Russia | IX | modern | mbt | Production |
| 24 | PROD | `t90m` | T-90M Proryv | Russia | X | modern | mbt | Production |
| 25 | DEV | `leo2a7` | Leopard 2A7 | Germany | X | modern | mbt | Saved development model |
| 26 | PROD | `m1a2` | M1A2 Abrams | USA | X | modern | mbt | Production |
| 27 | PROD | `strv81` | Stridsvagn 81 | Sweden | VII | modern | mbt | Production |
| 28 | PROD | `udes03` | UDES 03 | Sweden | VIII | modern | td | Production |
| 29 | PROD | `strv103a` | Stridsvagn 103A | Sweden | IX | modern | td | Production |
| 30 | PROD | `strv103` | Stridsvagn 103B | Sweden | X | modern | td | Production |
| 31 | PROD | `strv122` | Stridsvagn 122 | Sweden | X | modern | mbt | Production |
| 32 | DEV | `is3` | IS-3 | USSR | VIII | ww2 | heavy | Historical archive |
| 33 | DEV | `t34_85_cad` | T-34-85 obr. 1944 | USSR | VI | ww2 | medium | Historical archive |
| 34 | DEV | `newc_tiger` | Tiger I Early | Germany | VII | ww2 | heavy | Production curation |
| 35 | DEV | `newc_pziii` | Panzer III Ausf. J | Germany | IV | ww2 | medium | Production curation |
| 36 | DEV | `pziii_konserwa` | Panzer III Ausf. E | Germany | III | ww2 | medium | Historical archive |
| 37 | DEV | `leichttraktor` | Leichttraktor | Germany | I | ww2 | light | Historical archive |
| 38 | REF | `recon_tank` | Recon Tank (Mophs) | Community | VIII | modern | light | Reference placeholder |
| 39 | REF | `q_heavy` | Heavy Tank (Quaternius) | Community | IX | ww2 | heavy | Reference placeholder |
| 40 | PROD | `kv2` | KV-2 | USSR | VII | ww2 | heavy | Production |
| 41 | DEV | `tiger2` | Tiger II | Germany | VIII | ww2 | heavy | Historical archive |
| 42 | DEV | `sherman_jumbo` | M4A3E2 Sherman Jumbo | USA | VI | ww2 | heavy | Historical archive |
| 43 | DEV | `jagdtiger` | Jagdtiger | Germany | IX | ww2 | td | Historical archive |
| 44 | DEV | `jpz_e100` | Jagdpanzer E100 | Germany | X | ww2 | td | Production curation |
| 45 | DEV | `sturmtiger` | Sturmtiger | Germany | VIII | ww2 | td | Production curation |
| 46 | DEV | `t95` | T95 | USA | IX | ww2 | td | Production curation |
| 47 | DEV | `t30` | T30 | USA | IX | ww2 | td | Historical archive |
| 48 | DEV | `is7` | IS-7 | USSR | X | ww2 | heavy | Historical archive |
| 49 | DEV | `object279` | Object 279 | USSR | X | ww2 | heavy | Historical archive |
| 50 | DEV | `is6b` | IS-6B | USSR | VIII | ww2 | heavy | Historical archive |
| 51 | DEV | `is1` | IS-1 | USSR | V | ww2 | heavy | Historical archive |
| 52 | PROD | `chieftain5` | Chieftain Mk 5 | UK | VII | modern | mbt | Production |
| 53 | PROD | `chieftain_mk10` | Chieftain Mk 10 | UK | VII | modern | mbt | Production |
| 54 | PROD | `challenger1` | Challenger 1 Mk 3 | UK | VIII | modern | mbt | Production |
| 55 | PROD | `challenger2` | Challenger 2 | UK | IX | modern | mbt | Production |
| 56 | PROD | `challenger_3` | Challenger 3 | UK | X | modern | mbt | Production |
| 57 | PROD | `k2` | K2 Black Panther | South Korea | IX | modern | mbt | Production |
| 58 | PROD | `k1a1` | K1A1 | South Korea | VIII | modern | mbt | Production |
| 59 | PROD | `stb1` | STB-1 | Japan | VII | modern | mbt | Production |
| 60 | PROD | `type74` | Type 74 | Japan | VIII | modern | mbt | Production |
| 61 | PROD | `type90` | Type 90 (Kyū-maru) | Japan | IX | modern | mbt | Production |
| 62 | PROD | `type90a` | Type 90A | Japan | X | modern | mbt | Production |
| 63 | PROD | `type10` | Type 10 | Japan | IX | modern | mbt | Production |
| 64 | PROD | `type10b` | Type 10B | Japan | X | modern | mbt | Production |
| 65 | PROD | `m2a2_bradley` | M2A2 Bradley | USA | VIII | modern | ifv | Production |
| 66 | PROD | `bmp2` | BMP-2 | USSR | VII | modern | ifv | Production |
| 67 | PROD | `spz_puma` | Schützenpanzer Puma | Germany | VIII | modern | ifv | Production |
| 68 | PROD | `type89` | Type 89 IFV | Japan | VII | modern | ifv | Production |
| 69 | PROD | `carro45t` | Carro 45t | Italy | VIII | coldwar | medium | Production |
| 70 | PROD | `ariete` | C1 Ariete Preserie | Italy | VIII | modern | mbt | Production |
| 71 | PROD | `ariete_c1` | C1 Ariete | Italy | IX | modern | mbt | Production |
| 72 | PROD | `ariete_c2` | C2 Ariete | Italy | X | modern | mbt | Production |
| 73 | PROD | `amx40` | AMX-40 | France | IX | modern | mbt | Production |
| 74 | PROD | `leo1a5` | Leopard 1A5 | Germany | VII | modern | mbt | Production |
| 75 | PROD | `leopard2_proto` | Leopard 2 Prototype | Germany | VIII | modern | mbt | Production |
| 76 | PROD | `leo2a4` | Leopard 2A4 | Germany | VIII | modern | mbt | Production |
| 77 | PROD | `leo2a4_otco` | Leopard 2A4 OTCO | Germany | VIII | modern | mbt | Production |
| 78 | PROD | `leo2a4m` | Leopard 2A4M | Germany | IX | modern | mbt | Production |
| 79 | PROD | `leo2a5` | Leopard 2A5 | Germany | IX | modern | mbt | Production |
| 80 | PROD | `leo2a6` | Leopard 2A6 | Germany | IX | modern | mbt | Production |
| 81 | PROD | `leo2a6m` | Leopard 2A6M | Germany | X | modern | mbt | Production |
| 82 | PROD | `leo2_revolution` | Leopard 2 Revolution | Germany | X | modern | mbt | Production |
| 83 | PROD | `leo2a7v` | Leopard 2A7V | Germany | X | modern | mbt | Production |
| 84 | PROD | `leclerc` | Leclerc S2 | France | IX | modern | mbt | Production |
| 85 | PROD | `leclerc_xlr` | Leclerc XLR | France | X | modern | mbt | Production |
| 86 | PROD | `amx56` | AMX 56 | France | X | modern | mbt | Production |
| 87 | PROD | `type59` | Type 59 | China | VII | modern | mbt | Production |
| 88 | PROD | `ztz85_iii` | ZTZ-85-III | China | VIII | modern | mbt | Production |
| 89 | PROD | `type99a` | ZTZ-99A (Type 99A) | China | IX | modern | mbt | Production |
| 90 | PROD | `ztz99a2` | ZTZ-99A2 | China | X | modern | mbt | Production |
| 91 | PROD | `mbt70` | MBT-70 | Germany | X | coldwar | mbt | Production |
| 92 | PROD | `t14` | T-14 Armata | Russia | X | modern | mbt | Production |
| 93 | DEV | `t72b3` | T-72B3 | Russia | VIII | modern | mbt | Saved development model |
| 94 | DEV | `merkava4` | Merkava IVm Windbreaker | Israel | IX | modern | mbt | Saved development model |
| 95 | PROD | `m1a1` | M1A1 Abrams | USA | IX | modern | mbt | Production |
| 96 | PROD | `m1a2_tusk` | M1A2 Abrams TUSK | USA | X | modern | mbt | Production |
| 97 | PROD | `kf51` | KF51 Panther | Germany | X | modern | mbt | Production |
| 98 | PROD | `kf51b` | KF51B Panther | Germany | X | modern | mbt | Production |
| 99 | PROD | `abramsx` | AbramsX | USA | X | modern | mbt | Production |
| 100 | PROD | `fv510` | FV510 Warrior | UK | VII | modern | ifv | Production |
| 101 | PROD | `m1a1ha` | M1A1 Abrams HA | USA | IX | modern | mbt | Production |
| 102 | PROD | `m1a2_sepv2` | M1A2 Abrams SEPv2 | USA | X | modern | mbt | Production |
| 103 | PROD | `m1a2_sepv3` | M1A2 Abrams SEPv3 | USA | X | modern | mbt | Production |
| 104 | PROD | `m60a1` | M60A1 Patton | USA | VII | modern | mbt | Production |
| 105 | PROD | `merkava1b` | Merkava Mk 1B | Israel | VII | modern | mbt | Production |
| 106 | PROD | `merkava2b` | Merkava Mk 2B | Israel | VII | modern | mbt | Production |
| 107 | PROD | `merkava2d` | Merkava Mk 2D | Israel | VIII | modern | mbt | Production |
| 108 | PROD | `merkava3c` | Merkava Mk 3C | Israel | VIII | modern | mbt | Production |
| 109 | PROD | `merkava3d` | Merkava Mk 3D | Israel | IX | modern | mbt | Production |
| 110 | PROD | `merkava4b` | Merkava Mk 4B | Israel | IX | modern | mbt | Production |
| 111 | PROD | `fv510_milan` | FV510 Warrior MILAN | UK | IX | modern | ifv | Production |
| 112 | DEV | `t44` | T-44 | USSR | VII | ww2 | medium | Historical archive |
| 113 | DEV | `t54` | T-54 | USSR/Russia | VII | modern | mbt | Historical archive |
| 114 | PROD | `amx30` | AMX-30B | France | VII | modern | mbt | Production |
| 115 | PROD | `amx30b2` | AMX-30B2 | France | VIII | modern | mbt | Production |
| 116 | PROD | `m48` | M48A5 Patton | USA | VII | modern | mbt | Production |
| 117 | PROD | `m60a2` | M60A2 Starship | USA | VIII | modern | mbt | Production |
| 118 | PROD | `vickers_mk1` | Vickers MBT Mk 1 | UK | VII | modern | mbt | Production |
| 119 | DEV | `is3_bergman` | IS-3 Late | USSR | VIII | ww2 | heavy | Historical archive |
| 120 | DEV | `isu152` | ISU-152 | USSR | VIII | ww2 | td | Production curation |
| 121 | DEV | `isu122s` | ISU-122S | USSR | VIII | ww2 | td | Production curation |
| 122 | PROD | `centurion3` | Centurion Mk 3 | UK | VII | modern | mbt | Production |
| 123 | PROD | `centurion5` | Centurion Mk 5/2 | UK | VIII | modern | mbt | Production |
| 124 | DEV | `comet` | A34 Comet | UK | VII | ww2 | medium | Historical archive |
| 125 | DEV | `challenger_cruiser` | A30 Challenger | UK | VI | ww2 | medium | Historical archive |
| 126 | DEV | `charioteer` | FV4101 Charioteer | UK | VIII | ww2 | td | Historical archive |
| 127 | PROD | `m46_patton` | M46 Patton | USA | VII | modern | mbt | Production |
| 128 | PROD | `m47_patton` | M47 Patton | USA | VII | modern | mbt | Production |
| 129 | DEV | `m26_pershing` | M26 Pershing | USA | VIII | ww2 | medium | Production curation |
| 130 | DEV | `m45_patton` | M45 Patton | USA | VIII | ww2 | medium | Production curation |
| 131 | PROD | `m60a3` | M60A3 | USA | VIII | modern | mbt | Production |
| 132 | PROD | `ua_t64bv` | T-64BV Donbas | Ukraine | VIII | modern | mbt | Production |
| 133 | PROD | `ua_t80bv` | T-80BV (Ukraine) | Ukraine | IX | modern | mbt | Production |
| 134 | PROD | `ua_t80u_kursk` | T-80U Kursk | Ukraine | IX | modern | mbt | Production |
| 135 | PROD | `ua_t84_oplot_m` | T-84BM Oplot-M | Ukraine | X | modern | mbt | Production |
| 136 | PROD | `ua_m1a1` | M1A1 Abrams UA | Ukraine | IX | modern | mbt | Production |
| 137 | PROD | `t72m1_jaguar` | T-72M1 Jaguar | Poland | VIII | modern | mbt | Production |
| 138 | PROD | `pt91_twardy` | PT-91A Twardy | Poland | IX | modern | mbt | Production |
| 139 | PROD | `pl01` | PL-01 | Poland | X | modern | mbt | Production |
| 140 | PROD | `pl01_105` | PL-01 (105) | Poland | X | modern | mbt | Production |
| 141 | PROD | `k2b` | K2B | South Korea | X | modern | mbt | Production |
| 142 | PROD | `bmp3_rok` | BMP-3 (ROK) | South Korea | VIII | modern | ifv | Production |
| 143 | PROD | `ua_m2a3_bradley` | M2A3 Bradley (Ukraine) | Ukraine | IX | modern | ifv | Production |
| 144 | PROD | `bmpt_terminator2` | BMPT Terminator 2 | Russia | IX | modern | ifv | Production |
| 145 | PROD | `bwp1` | BWP-1 (Bojowy Wóz Piechoty 1) | Poland | IX | modern | ifv | Production |
| 146 | PROD | `marder1a3` | Schützenpanzer Marder 1A3 | Germany | VII | modern | ifv | Production |
| 147 | PROD | `m3a3_bradley` | M3A3 Bradley CFV | USA | VIII | modern | ifv | Production |
| 148 | PROD | `bmp3` | BMP-3 | Russia | VIII | modern | ifv | Production |
| 149 | PROD | `upior` | Upiór IFV | Poland | IX | modern | ifv | Production |
| 150 | PROD | `bmpt_t90` | BMPT T-90 | Russia | X | modern | ifv | Production |

## Policy ownership

- `src/vehicles/rosterPolicy.js` owns explicit production exclusions and the local-development gate.
- `src/vehicles/specs.js` publishes saved, production, visible, and runtime projections and stamps every spec with canonical roster metadata.
- Production visibility is independent from record retention: hiding a vehicle never deletes its authored spec or tooling access.
