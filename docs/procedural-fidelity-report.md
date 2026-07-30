# Procedural tank fidelity report

Local sourced references: **72**. At or above 72/100: **8**. Below target: **64**. Median: **61.4**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% upper assembly, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Chieftain Mk.5 (chieftain5) | 37.7 | 68.9 | 42.3 | 9.5 | 0.0 | 14.3 | chieftain_mk10 |
| M1A2 Abrams SEPv2 (m1a2_sepv2) | 46.0 | 59.9 | 55.9 | 27.0 | 6.2 | 61.5 | m1a2 |
| M1A1 Abrams (m1a1) | 46.3 | 59.8 | 51.9 | 29.3 | 8.4 | 68.5 | m1a2 |
| M1A1HA Abrams (m1a1ha) | 46.3 | 59.8 | 51.9 | 29.3 | 8.4 | 68.5 | m1a1 |
| M1A2 Abrams (Tejas) (m1a2_tejas) | 46.3 | 59.8 | 51.9 | 29.3 | 8.4 | 68.5 | m1a2 |
| Leopard 2A7V (leo2a7v) | 46.8 | 65.5 | 63.8 | 13.9 | 0.0 | 64.1 | leo2a7 |
| M1A2 Abrams SEPv3 (m1a2) | 47.1 | 59.7 | 51.3 | 29.7 | 16.7 | 68.2 | m1a2 |
| AbramsX (abramsx) | 47.7 | 59.3 | 57.0 | 30.2 | 9.9 | 68.4 | m1a2 |
| M1A2 Abrams TUSK (m1a2_tusk) | 48.5 | 63.1 | 55.5 | 29.6 | 8.4 | 70.3 | m1a2 |
| PT-91M Pendekar (pt91m) | 50.6 | 68.5 | 63.1 | 22.3 | 6.8 | 69.1 | t72b3 |
| Object 279 (object279) | 51.6 | 67.7 | 67.7 | 24.7 | 6.9 | 65.8 | object279 |
| T-72B3M obr. 2022 (t72b3m) | 52.0 | 67.4 | 66.4 | 24.1 | 13.7 | 67.4 | t72b3 |
| IS-7 (is7) | 52.1 | 68.2 | 68.3 | 30.2 | 0.0 | 63.8 | is7 |
| FV4101 Charioteer (charioteer) | 53.4 | 70.3 | 65.3 | 16.2 | 17.4 | 88.3 | jagdtiger |
| M26 Pershing (m26_pershing) | 53.6 | 71.9 | 72.5 | 19.7 | 0.0 | 79.3 | m4a3e8 |
| ISU-152 (isu152) | 54.1 | 52.3 | N/A | N/A | N/A | 62.2 | sturmtiger |
| Merkava Mk.2D (merkava2d) | 54.5 | 77.4 | 71.6 | 15.3 | 0.0 | 81.2 | merkava4 |
| T-90A Vladimir (t90a_vladimir) | 54.6 | 69.1 | 67.0 | 32.0 | 14.3 | 70.0 | t90a |
| T-64BV1 (t64bv1) | 55.1 | 69.6 | 67.5 | 27.6 | 23.6 | 69.1 | t72b3 |
| Heavy Tank (Quaternius) (q_heavy) | 55.1 | 71.0 | 72.4 | 22.3 | 14.2 | 75.4 | q_heavy |
| M45 Patton (m45_patton) | 55.3 | 73.0 | 74.0 | 23.5 | 0.0 | 81.5 | m4a3e8 |
| Merkava Mk.2B (merkava2b) | 55.5 | 76.6 | 77.7 | 13.6 | 0.0 | 81.8 | merkava4 |
| Centurion Mk.3 (centurion3) | 56.2 | 76.8 | 73.1 | 18.8 | 0.0 | 90.6 | chieftain_mk10 |
| Merkava IVm Windbreaker (merkava4) | 56.7 | 76.0 | 73.1 | 27.1 | 0.0 | 80.6 | merkava4 |
| Leopard 2A5 (leo2a5) | 57.1 | 77.4 | 76.3 | 22.4 | 0.0 | 80.1 | leo2a6 |
| Tiger II (tiger2) | 57.5 | 72.4 | 68.1 | 30.7 | 25.3 | 75.2 | tiger2 |
| Centurion Mk.5/2 (centurion5) | 57.7 | 76.1 | 72.7 | 21.8 | 11.3 | 89.4 | chieftain_mk10 |
| T-62MV-1 (t62mv1) | 57.8 | 75.2 | 74.2 | 25.5 | 16.8 | 73.1 | leo1a5 |
| Leopard 2A6 (leo2a6) | 59.6 | 74.8 | 71.8 | 35.4 | 18.3 | 77.3 | leo2a6 |
| Leopard 2 Prototype (leopard2_proto) | 59.6 | 80.7 | 76.7 | 15.8 | 16.2 | 88.5 | leo2a4 |
| T-72B obr. 1987 (t72b_1987) | 59.8 | 77.5 | 75.7 | 28.3 | 14.7 | 79.3 | t72b3 |
| T-90M Proryv (t90m) | 60.4 | 75.0 | 74.3 | 35.1 | 19.1 | 78.3 | t90m |
| M46 Patton (m46_patton) | 60.5 | 79.7 | 82.0 | 20.0 | 11.1 | 83.7 | m60a1 |
| IS-6B (is6b) | 60.6 | 71.5 | 66.2 | 50.6 | 29.8 | 66.3 | is6b |
| IS-3 (is3) | 60.9 | 78.9 | 84.9 | 24.2 | 2.9 | 86.1 | is3 |
| Panzer III Ausf. J (newc_pziii) | 61.0 | 81.6 | 84.7 | 22.9 | 0.0 | 83.9 | newc_pziii |
| Type 90 Kyu-maru (type90) | 61.4 | 69.7 | 64.7 | 15.1 | 100.0 | 73.0 | type10 |
| M47 Patton (m47_patton) | 61.9 | 81.1 | 83.7 | 24.0 | 8.3 | 85.1 | m60a1 |
| A34 Comet (comet) | 62.0 | 70.2 | 63.6 | 12.7 | 100.0 | 87.2 | panther_g |
| Panzerkampfwagen III (pziii_konserwa) | 62.1 | 82.6 | 82.7 | 28.9 | 0.0 | 83.8 | pziii_konserwa |
| M1A1 AIM Abrams (m1a1_aim) | 62.2 | 80.4 | 80.8 | 24.2 | 18.1 | 86.2 | m1a1 |
| IS-3 (Bergman) (is3_bergman) | 62.8 | 83.9 | 82.6 | 24.1 | 7.7 | 88.8 | is3 |
| T-34-85 (Wei He) (t34_85_cad) | 63.2 | 78.1 | 75.0 | 35.9 | 36.4 | 69.8 | t34_85_cad |
| T-90A (t90a) | 63.7 | 83.5 | 82.4 | 31.6 | 6.6 | 84.3 | t90m |
| FV510 Warrior (fv510) | 64.0 | 73.8 | 71.8 | 11.3 | 100.0 | 74.3 | m2a2_bradley |
| T-90SM (t90sm) | 64.1 | 82.3 | 80.8 | 36.2 | 11.2 | 81.1 | t90m |
| Merkava Mk.3D (merkava3d) | 64.6 | 75.6 | 68.4 | 13.2 | 100.0 | 79.9 | merkava4 |
| Leopard 2 Revolution (leo2_revolution) | 64.7 | 70.6 | 72.1 | 21.8 | 100.0 | 69.7 | leo2a7 |
| Merkava Mk.3B (merkava3b) | 65.0 | 74.9 | 69.4 | 14.9 | 100.0 | 80.1 | merkava4 |
| Merkava Mk.3C (merkava3c) | 65.3 | 74.7 | 70.7 | 15.3 | 100.0 | 80.1 | merkava4 |
| M4A3E2 Sherman Jumbo (sherman_jumbo) | 65.4 | 82.8 | 87.0 | 31.7 | 9.8 | 89.9 | sherman_jumbo |
| Merkava Mk.1B (merkava1b) | 65.5 | 76.3 | 69.8 | 14.7 | 100.0 | 79.8 | merkava4 |
| T-72BU (t72bu) | 65.9 | 72.3 | 70.7 | 24.3 | 100.0 | 75.3 | t90a |
| A30 Challenger (challenger_cruiser) | 67.3 | 76.2 | 73.6 | 14.7 | 100.0 | 90.6 | panther_g |
| C1 Ariete (ariete) | 67.7 | 79.4 | 79.7 | 40.3 | 45.5 | 80.0 | ariete |
| T95 Doomturtle (t95) | 67.7 | 67.9 | N/A | N/A | N/A | 66.8 | t95 |
| Merkava Mk.4B (merkava4b) | 68.3 | 79.8 | 73.3 | 18.3 | 100.0 | 79.8 | merkava4 |
| Leclerc S2 (leclerc) | 68.4 | 80.7 | 76.6 | 50.3 | 33.1 | 86.6 | leclerc |
| M60A3 (m60a3) | 68.8 | 82.4 | 86.8 | 41.8 | 23.9 | 87.5 | m60a1 |
| M60A1 Patton (m60a1) | 68.8 | 82.3 | 87.0 | 42.1 | 23.9 | 87.5 | leo1a5 |
| ISU-122S (isu122s) | 69.5 | 70.8 | N/A | N/A | N/A | 64.0 | jagdtiger |
| Tiger I (Newc42) (newc_tiger) | 69.9 | 85.0 | 88.1 | 45.8 | 14.5 | 90.8 | newc_tiger |
| Challenger 1 Mk.3 (challenger1) | 70.3 | 80.5 | 80.9 | 60.0 | 30.2 | 77.7 | challenger2 |
| Recon Tank (Mophs) (recon_tank) | 70.3 | 70.9 | N/A | N/A | N/A | 67.3 | recon_tank |
| KF51 Panther (kf51) | 72.2 | 84.4 | 88.3 | 47.4 | 32.7 | 89.8 | kf51 |
| T-80U (t80u) | 72.3 | 83.9 | 84.4 | 49.1 | 42.0 | 86.6 | t80u |
| Jagdpanzer E100 (jpz_e100) | 74.5 | 74.2 | N/A | N/A | N/A | 76.0 | jpz_e100 |
| Stridsvagn 103 (strv103) | 74.5 | 74.8 | N/A | N/A | N/A | 73.2 | strv103 |
| Jagdtiger (jagdtiger) | 78.3 | 77.9 | N/A | N/A | N/A | 79.9 | jagdtiger |
| Leichttraktor (leichttraktor) | 79.7 | 82.4 | 84.9 | 52.3 | 100.0 | 90.2 | leichttraktor |
| KV-2 (kv2) | 79.9 | 86.2 | 86.3 | 45.4 | 100.0 | 88.6 | kv2 |
| Sturmtiger (sturmtiger) | 85.2 | 83.8 | N/A | N/A | N/A | 91.3 | sturmtiger |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
