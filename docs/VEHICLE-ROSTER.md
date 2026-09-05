# Complete vehicle roster

> Generated from `TANK_SPECS` by `npm run tank:roster`. Do not maintain a second hand-written roster.

Claude of Tanks currently retains **167 saved vehicle records**: **128 production-visible**, **37 local development models**, and **2 non-playable reference placeholders**. Production carousels, matchmaking, the Tank Gallery, and Scene Studio use the production projection.

To inspect every playable saved model locally, copy `.env.example` to `.env.local` and run the Vite development server. The `VITE_COT_DEV_FLEET_KEY` switch is accepted only when Vite reports `DEV=true`; it is ignored by production builds. Development-only entries display a blue `DEV` tag in vehicle pickers. `REF` records remain report-only because they are generic community placeholders, not first-party playable models.

| # | Status | Stable ID | Vehicle | Nation | Tier | Era | Roster reason |
| ---: | :---: | --- | --- | --- | :---: | --- | --- |
| 1 | DEV | `m4a3e8` | M4A3E8 Sherman | USA | VI | World War II | Historical archive |
| 2 | DEV | `tiger1` | Tiger I | Germany | VII | World War II | Production curation |
| 3 | DEV | `t34_85` | T-34-85 | USSR | VI | World War II | Historical archive |
| 4 | DEV | `is2` | IS-2 | USSR | VII | World War II | Historical archive |
| 5 | DEV | `panther_g` | Panther Ausf. G | Germany | VII | World War II | Production curation |
| 6 | DEV | `m1a2_legacy` | M1A2 Abrams (Legacy) | USA | X | Modern | Production curation |
| 7 | PROD | `t62mv1` | T-62 obr. 1975 | USSR/Russia | VII | Cold War | Production |
| 8 | PROD | `t64bv1` | T-64BV1 | USSR/Russia | VIII | Cold War | Production |
| 9 | DEV | `t72b_1987` | T-72B obr. 1987 | USSR/Russia | VIII | Cold War | Historical archive |
| 10 | PROD | `t72b3m` | T-72B3M obr. 2022 | Russia | IX | Modern | Production |
| 11 | PROD | `t72bu` | T-72BU | USSR/Russia | VIII | Cold War | Production |
| 12 | PROD | `pt91m` | PT-91M Pendekar | Poland | VIII | Modern | Production |
| 13 | PROD | `t80` | T-80 | USSR/Russia | VIII | Cold War | Production |
| 14 | PROD | `t80b` | T-80B | USSR/Russia | IX | Cold War | Production |
| 15 | PROD | `t80bv` | T-80BV | USSR/Russia | IX | Cold War | Production |
| 16 | PROD | `t80u` | T-80U | USSR/Russia | VIII | Cold War | Production |
| 17 | PROD | `t84` | T-84 Oplot | Ukraine | IX | Modern | Production |
| 18 | PROD | `t90` | T-90 | USSR/Russia | X | Modern | Production |
| 19 | PROD | `t90a` | T-90A | Russia | IX | Modern | Production |
| 20 | PROD | `t90a_vladimir` | T-90A Vladimir | Russia | IX | Modern | Production |
| 21 | PROD | `t90a_burlak` | T-90A Burlak | USSR/Russia | X | Modern | Production |
| 22 | PROD | `t90sm` | T-90SM | Russia | IX | Modern | Production |
| 23 | PROD | `t90m` | T-90M | Russia | IX | Modern | Production |
| 24 | PROD | `t90ms` | T-90MS Tagil | USSR/Russia | X | Modern | Production |
| 25 | PROD | `t90m_proryv` | T-90M Proryv | Russia | X | Modern | Production |
| 26 | DEV | `leo2a7` | Leopard 2A7 | Germany | X | Modern | Saved development model |
| 27 | PROD | `m1a1` | M1A1 Abrams | USA | IX | Cold War | Production |
| 28 | PROD | `m1a1ha` | M1A1 Abrams HA | USA | IX | Cold War | Production |
| 29 | PROD | `m1a2` | M1A2 Abrams | USA | X | Modern | Production |
| 30 | PROD | `m1a2_tusk` | M1A2 Abrams TUSK | USA | X | Modern | Production |
| 31 | PROD | `m1a2_sepv2` | M1A2 Abrams SEPv2 | USA | X | Modern | Production |
| 32 | PROD | `m1a2_sepv3` | M1A2 Abrams SEPv3 | USA | X | Modern | Production |
| 33 | PROD | `m1a3` | M1A3 Abrams | USA | X | Next Generation | Production |
| 34 | PROD | `abramsx` | AbramsX | USA | X | Next Generation | Production |
| 35 | PROD | `strv81` | Stridsvagn 81 | Sweden | VII | Cold War | Production |
| 36 | PROD | `udes03` | UDES 03 | Sweden | VIII | Cold War | Production |
| 37 | PROD | `strv103a` | Stridsvagn 103A | Sweden | IX | Cold War | Production |
| 38 | PROD | `strv103` | Stridsvagn 103B | Sweden | X | Cold War | Production |
| 39 | PROD | `cv90` | CV90 | Sweden | IX | Modern | Production |
| 40 | PROD | `strv122` | Stridsvagn 122 | Sweden | X | Modern | Production |
| 41 | PROD | `cv90_mkiv` | CV90 Mk IV | Sweden | X | Next Generation | Production |
| 42 | DEV | `is3` | IS-3 | USSR | VIII | World War II | Historical archive |
| 43 | DEV | `t34_85_cad` | T-34-85 obr. 1944 | USSR | VI | World War II | Historical archive |
| 44 | DEV | `newc_tiger` | Tiger I Early | Germany | VII | World War II | Production curation |
| 45 | DEV | `newc_pziii` | Panzer III Ausf. J | Germany | IV | World War II | Production curation |
| 46 | DEV | `pziii_konserwa` | Panzer III Ausf. E | Germany | III | World War II | Historical archive |
| 47 | DEV | `leichttraktor` | Leichttraktor | Germany | I | Interwar | Saved development model |
| 48 | REF | `recon_tank` | Recon Tank (Mophs) | Community | VIII | Modern | Reference placeholder |
| 49 | REF | `q_heavy` | Heavy Tank (Quaternius) | Community | IX | World War II | Reference placeholder |
| 50 | PROD | `kv2` | KV-2 | USSR | VII | World War II | Production |
| 51 | DEV | `tiger2` | Tiger II | Germany | VIII | World War II | Historical archive |
| 52 | DEV | `sherman_jumbo` | M4A3E2 Sherman Jumbo | USA | VI | World War II | Historical archive |
| 53 | DEV | `jagdtiger` | Jagdtiger | Germany | IX | World War II | Historical archive |
| 54 | DEV | `jpz_e100` | Jagdpanzer E100 | Germany | X | World War II | Production curation |
| 55 | DEV | `sturmtiger` | Sturmtiger | Germany | VIII | World War II | Production curation |
| 56 | DEV | `t95` | T95 | USA | IX | World War II | Production curation |
| 57 | DEV | `t30` | T30 | USA | IX | World War II | Historical archive |
| 58 | DEV | `is7` | IS-7 | USSR | X | Cold War | Saved development model |
| 59 | DEV | `object279` | Object 279 | USSR | X | Cold War | Saved development model |
| 60 | DEV | `is6b` | IS-6B | USSR | VIII | World War II | Historical archive |
| 61 | DEV | `is1` | IS-1 | USSR | V | World War II | Historical archive |
| 62 | PROD | `chieftain5` | Chieftain Mk 5 | UK | VII | Cold War | Production |
| 63 | PROD | `chieftain_mk10` | Chieftain Mk 10 | UK | VIII | Cold War | Production |
| 64 | PROD | `challenger1` | Challenger 1 Mk 3 | UK | IX | Cold War | Production |
| 65 | PROD | `fv4034` | FV4034 | UK | VIII | Cold War | Production |
| 66 | PROD | `challenger2` | Challenger 2 | UK | IX | Modern | Production |
| 67 | PROD | `challenger2e` | Challenger 2E | UK | X | Modern | Production |
| 68 | PROD | `ua_challenger2` | Challenger 2 (Ukraine) | Ukraine | X | Modern | Production |
| 69 | PROD | `challenger_3` | Challenger 3 | UK | X | Next Generation | Production |
| 70 | PROD | `challenger_3x` | Challenger 3 X | UK | X | Next Generation | Production |
| 71 | PROD | `k2` | K2 Black Panther | South Korea | IX | Modern | Production |
| 72 | PROD | `k1a1` | K1A1 | South Korea | VIII | Modern | Production |
| 73 | PROD | `stb1` | STB-1 | Japan | VII | Cold War | Production |
| 74 | PROD | `type74` | Type 74 | Japan | VIII | Cold War | Production |
| 75 | PROD | `type90` | Type 90 (Kyū-maru) | Japan | IX | Cold War | Production |
| 76 | PROD | `type90a` | Type 90A | Japan | IX | Cold War | Production |
| 77 | PROD | `type10` | Type 10 | Japan | X | Modern | Production |
| 78 | PROD | `type10b` | Type 10B | Japan | X | Next Generation | Production |
| 79 | PROD | `m2a2_bradley` | M2A2 Bradley | USA | VIII | Cold War | Production |
| 80 | PROD | `bmp2` | BMP-2 | USSR | VII | Cold War | Production |
| 81 | PROD | `spz_puma` | Schützenpanzer Puma | Germany | VIII | Modern | Production |
| 82 | PROD | `spz_puma_s1` | Schützenpanzer Puma S1 | Germany | X | Modern | Production |
| 83 | PROD | `type89_light_tiger` | Type 89 Light Tiger | Japan | X | Next Generation | Production |
| 84 | PROD | `type89` | Type 89 IFV | Japan | VII | Cold War | Production |
| 85 | PROD | `carro45t` | Carro 45t | Italy | VIII | Cold War | Production |
| 86 | PROD | `ariete` | C1 Ariete Preserie | Italy | VIII | Modern | Production |
| 87 | PROD | `ariete_c1` | C1 Ariete | Italy | IX | Modern | Production |
| 88 | PROD | `ariete_c2` | C2 Ariete | Italy | X | Next Generation | Production |
| 89 | PROD | `amx40` | AMX-40 | France | IX | Cold War | Production |
| 90 | PROD | `leo1a5` | Leopard 1A5 | Germany | VII | Cold War | Production |
| 91 | PROD | `leopard2_proto` | Leopard 2 Prototype | Germany | VIII | Cold War | Production |
| 92 | PROD | `leo2a4` | Leopard 2A4 | Germany | VIII | Cold War | Production |
| 93 | PROD | `leo2a4_otco` | Leopard 2A4 OTCO | Germany | VIII | Modern | Production |
| 94 | PROD | `leo2a4m` | Leopard 2A4M | Germany | IX | Modern | Production |
| 95 | PROD | `leo2a5` | Leopard 2A5 | Germany | IX | Modern | Production |
| 96 | PROD | `leo2a5_a5nl` | Leopard 2A5/A5NL | Germany | X | Modern | Production |
| 97 | PROD | `leo2a6` | Leopard 2A6 | Germany | IX | Modern | Production |
| 98 | PROD | `leo2a6m` | Leopard 2A6M | Germany | X | Modern | Production |
| 99 | PROD | `leo2_revolution_proto` | Leopard 2 Revolution Proto | Germany | IX | Modern | Production |
| 100 | PROD | `leo2_revolution` | Leopard 2 Revolution | Germany | X | Modern | Production |
| 101 | PROD | `leo2a7v` | Leopard 2A7V | Germany | X | Modern | Production |
| 102 | PROD | `leclerc` | Leclerc S2 | France | IX | Modern | Production |
| 103 | PROD | `leclerc_xlr` | Leclerc XLR | France | X | Modern | Production |
| 104 | PROD | `amx56` | AMX 56 | France | X | Modern | Production |
| 105 | PROD | `type59` | Type 59 | China | VII | Cold War | Production |
| 106 | PROD | `ztz85_iii` | ZTZ-85-III | China | VIII | Cold War | Production |
| 107 | PROD | `type99a` | ZTZ-99A (Type 99A) | China | IX | Modern | Production |
| 108 | PROD | `ztz99a2_prototype` | ZTZ-99A2 Prototype | China | X | Modern | Production |
| 109 | PROD | `ztz99a2` | ZTZ-99A2 | China | X | Modern | Production |
| 110 | PROD | `vt4a1` | VT-4A1 | China | X | Modern | Production |
| 111 | PROD | `mbt70` | MBT-70 | Germany | X | Cold War | Production |
| 112 | PROD | `t14` | T-14 Armata | Russia | X | Next Generation | Production |
| 113 | DEV | `t72b3` | T-72B3 | Russia | VIII | Modern | Saved development model |
| 114 | DEV | `merkava4` | Merkava IVm Windbreaker | Israel | IX | Modern | Saved development model |
| 115 | PROD | `kf51` | KF51 Panther | Germany | X | Next Generation | Production |
| 116 | PROD | `kf51b` | KF51B Panther | Germany | X | Next Generation | Production |
| 117 | PROD | `fv510` | FV510 Warrior | UK | VII | Cold War | Production |
| 118 | PROD | `m60a1` | M60A1 Patton | USA | VIII | Cold War | Production |
| 119 | PROD | `merkava1b` | Merkava Mk 1B | Israel | VII | Cold War | Production |
| 120 | PROD | `merkava2b` | Merkava Mk 2B | Israel | VIII | Cold War | Production |
| 121 | PROD | `merkava2d` | Merkava Mk 2D | Israel | VIII | Cold War | Production |
| 122 | PROD | `merkava3c` | Merkava Mk 3C | Israel | IX | Modern | Production |
| 123 | PROD | `merkava3d` | Merkava Mk 3D | Israel | X | Modern | Production |
| 124 | PROD | `merkava4b` | Merkava Mk 4B | Israel | X | Modern | Production |
| 125 | PROD | `fv510_milan` | FV510 Warrior MILAN | UK | IX | Cold War | Production |
| 126 | DEV | `t44` | T-44 | USSR | VII | World War II | Historical archive |
| 127 | DEV | `t54` | T-54 | USSR/Russia | VII | Cold War | Historical archive |
| 128 | PROD | `amx30` | AMX-30B | France | VII | Cold War | Production |
| 129 | PROD | `amx30b2` | AMX-30B2 | France | VIII | Cold War | Production |
| 130 | PROD | `m48` | M48A5 Patton | USA | VIII | Cold War | Production |
| 131 | PROD | `m60a2` | M60A2 Starship | USA | IX | Cold War | Production |
| 132 | PROD | `vickers_mk1` | Vickers MBT Mk 1 | UK | VII | Cold War | Production |
| 133 | DEV | `is3_bergman` | IS-3 Late | USSR | VIII | World War II | Historical archive |
| 134 | DEV | `isu152` | ISU-152 | USSR | VIII | World War II | Production curation |
| 135 | DEV | `isu122s` | ISU-122S | USSR | VIII | World War II | Production curation |
| 136 | PROD | `centurion3` | Centurion Mk 3 | UK | VII | Cold War | Production |
| 137 | PROD | `centurion5` | Centurion Mk 5/2 | UK | VIII | Cold War | Production |
| 138 | DEV | `comet` | A34 Comet | UK | VII | World War II | Historical archive |
| 139 | DEV | `challenger_cruiser` | A30 Challenger | UK | VI | World War II | Historical archive |
| 140 | DEV | `charioteer` | FV4101 Charioteer | UK | VIII | Cold War | Saved development model |
| 141 | PROD | `m46_patton` | M46 Patton | USA | VII | Cold War | Production |
| 142 | PROD | `m47_patton` | M47 Patton | USA | VII | Cold War | Production |
| 143 | DEV | `m26_pershing` | M26 Pershing | USA | VIII | World War II | Production curation |
| 144 | DEV | `m45_patton` | M45 Patton | USA | VIII | World War II | Production curation |
| 145 | PROD | `m60a3` | M60A3 | USA | VIII | Cold War | Production |
| 146 | PROD | `ua_t64bv` | T-64BV Donbas | Ukraine | VIII | Modern | Production |
| 147 | PROD | `ua_t80bv` | T-80BV (Ukraine) | Ukraine | IX | Modern | Production |
| 148 | PROD | `ua_t80u_kursk` | T-80U Kursk | Ukraine | IX | Modern | Production |
| 149 | PROD | `ua_t84_oplot_m` | T-84BM Oplot-M | Ukraine | X | Modern | Production |
| 150 | PROD | `ua_m1a1` | M1A1 Abrams UA | Ukraine | IX | Modern | Production |
| 151 | PROD | `leo2a6_ua` | Leopard 2A6 UA | Ukraine | X | Modern | Production |
| 152 | PROD | `t72m1_jaguar` | T-72M1 Jaguar | Poland | VIII | Modern | Production |
| 153 | PROD | `pt91_twardy` | PT-91A Twardy | Poland | IX | Modern | Production |
| 154 | PROD | `pl01` | PL-01 | Poland | X | Next Generation | Production |
| 155 | PROD | `pl01_105` | PL-01 (105) | Poland | X | Next Generation | Production |
| 156 | PROD | `k2b` | K2B | South Korea | X | Modern | Production |
| 157 | PROD | `bmp3_rok` | BMP-3 (ROK) | South Korea | VIII | Modern | Production |
| 158 | PROD | `ua_m2a3_bradley` | M2A3 Bradley (Ukraine) | Ukraine | IX | Modern | Production |
| 159 | PROD | `bmpt_terminator2` | BMPT Terminator 2 | Russia | IX | Modern | Production |
| 160 | PROD | `bwp1` | BWP-1 (Bojowy Wóz Piechoty 1) | Poland | IX | Cold War | Production |
| 161 | PROD | `marder1a3` | Schützenpanzer Marder 1A3 | Germany | VII | Cold War | Production |
| 162 | PROD | `m3a3_bradley` | M3A3 Bradley CFV | USA | X | Modern | Production |
| 163 | PROD | `bmp3` | BMP-3 | Russia | VIII | Cold War | Production |
| 164 | PROD | `upior` | Upiór IFV | Poland | IX | Next Generation | Production |
| 165 | PROD | `bmpt_t90` | BMPT T-90 | Russia | X | Modern | Production |
| 166 | PROD | `m551_sheridan` | M551 Sheridan | USA | IX | Cold War | Production |
| 167 | PROD | `m551a1_tts` | M551A1 TTS | USA | X | Next Generation | Production |

## Policy ownership

- `src/vehicles/rosterPolicy.ts` owns explicit production exclusions and the local-development gate.
- `src/vehicles/taxonomy.ts` owns the public era taxonomy and every saved vehicle assignment.
- `src/vehicles/specs.ts` owns the central `TANK_CATALOGS` registry, publishes saved, production, visible, and runtime projections, and stamps every spec with canonical roster metadata.
- Production visibility is independent from record retention: hiding a vehicle never deletes its authored spec or tooling access.
