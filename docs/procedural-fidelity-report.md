# Procedural tank fidelity report

Local sourced references: **72**. Passing 90/100 overall and 90/100 in every view: **0**. Below target: **72**. Median: **71.5**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% upper assembly, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Chieftain Mk.5 (chieftain5) | 51.8 | 86.8 | 62.4 | 20.8 | 0.0 | 20.6 | chieftain_mk10 |
| Heavy Tank (Quaternius) (q_heavy) | 57.2 | 65.7 | 68.2 | 49.2 | 14.5 | 70.2 | q_heavy |
| FV4101 Charioteer (charioteer) | 59.0 | 77.4 | 85.5 | 19.3 | 0.0 | 82.7 | jagdtiger |
| Merkava IVm Windbreaker (merkava4) | 59.3 | 78.6 | 75.3 | 32.8 | 0.0 | 80.2 | merkava4 |
| M1A2 Abrams TUSK (m1a2_tusk) | 59.6 | 69.9 | 59.8 | 47.0 | 41.7 | 72.2 | m1a2 |
| A34 Comet (comet) | 61.8 | 86.3 | 87.9 | 15.3 | 0.0 | 81.8 | panther_g |
| T-90A (t90a) | 63.0 | 79.3 | 75.6 | 39.5 | 18.7 | 77.2 | t90m |
| Centurion Mk.3 (centurion3) | 63.9 | 86.1 | 88.4 | 24.8 | 0.0 | 84.3 | chieftain_mk10 |
| IS-7 (is7) | 64.3 | 84.1 | 83.7 | 35.4 | 0.0 | 86.1 | is7 |
| IS-3 (is3) | 64.4 | 81.4 | 88.0 | 29.7 | 10.3 | 84.5 | is3 |
| T-62MV-1 (t62mv1) | 64.6 | 83.0 | 86.7 | 25.8 | 16.6 | 84.6 | leo1a5 |
| T-90A Vladimir (t90a_vladimir) | 65.4 | 80.8 | 82.7 | 34.3 | 28.6 | 76.9 | t90a |
| M1A1 AIM Abrams (m1a1_aim) | 65.5 | 81.6 | 82.2 | 20.6 | 45.5 | 84.8 | m1a1 |
| M45 Patton (m45_patton) | 65.7 | 83.7 | 85.3 | 41.6 | 0.0 | 83.8 | m4a3e8 |
| Centurion Mk.5/2 (centurion5) | 66.0 | 85.8 | 88.6 | 23.5 | 20.0 | 83.9 | chieftain_mk10 |
| M47 Patton (m47_patton) | 66.1 | 84.9 | 88.4 | 25.7 | 20.9 | 82.4 | m60a1 |
| M46 Patton (m46_patton) | 66.7 | 84.0 | 87.3 | 27.2 | 28.9 | 82.2 | m60a1 |
| Panzer III Ausf. J (newc_pziii) | 66.7 | 87.3 | 89.3 | 36.6 | 0.0 | 81.4 | newc_pziii |
| T-64BV1 (t64bv1) | 66.8 | 82.5 | 78.0 | 35.1 | 40.7 | 81.9 | t72b3 |
| Merkava Mk.4B (merkava4b) | 67.0 | 79.9 | 82.7 | 24.0 | 54.2 | 87.8 | merkava4 |
| M26 Pershing (m26_pershing) | 67.1 | 82.6 | 85.1 | 34.1 | 27.5 | 84.5 | m4a3e8 |
| M1A2 Abrams SEPv2 (m1a2_sepv2) | 67.8 | 79.1 | 75.0 | 43.1 | 59.8 | 69.9 | m1a2 |
| Object 279 (object279) | 67.9 | 83.4 | 88.9 | 36.9 | 15.8 | 90.6 | object279 |
| Panzerkampfwagen III (pziii_konserwa) | 68.1 | 88.5 | 90.0 | 40.2 | 0.0 | 81.9 | pziii_konserwa |
| IS-3 (Bergman) (is3_bergman) | 68.2 | 86.3 | 88.3 | 21.7 | 39.1 | 85.1 | is3 |
| Merkava Mk.3D (merkava3d) | 68.2 | 87.1 | 87.1 | 37.2 | 13.6 | 85.6 | merkava4 |
| Leopard 2 Prototype (leopard2_proto) | 68.5 | 86.0 | 89.5 | 27.0 | 32.4 | 83.7 | leo2a4 |
| Leopard 2A6 (leo2a6) | 68.8 | 75.9 | 72.7 | 54.7 | 58.5 | 76.3 | leo2a6 |
| M4A3E2 Sherman Jumbo (sherman_jumbo) | 69.1 | 82.8 | 88.2 | 43.8 | 18.8 | 88.0 | sherman_jumbo |
| KV-2 (kv2) | 69.6 | 88.1 | 89.0 | 46.8 | 0.0 | 89.3 | kv2 |
| Leopard 2 Revolution (leo2_revolution) | 70.2 | 84.1 | 84.9 | 49.2 | 25.9 | 82.1 | leo2a7 |
| M1A2 Abrams SEPv3 (m1a2) | 70.7 | 86.0 | 77.4 | 28.9 | 72.5 | 84.8 | m1a2 |
| Merkava Mk.3B (merkava3b) | 70.8 | 86.9 | 86.9 | 36.5 | 37.4 | 85.6 | merkava4 |
| Challenger 1 Mk.3 (challenger1) | 70.9 | 82.2 | 81.8 | 49.6 | 47.2 | 76.2 | challenger2 |
| A30 Challenger (challenger_cruiser) | 71.3 | 78.6 | 81.7 | 26.2 | 100.0 | 76.5 | panther_g |
| M60A3 (m60a3) | 71.3 | 81.2 | 86.3 | 45.6 | 44.4 | 86.3 | m60a1 |
| FV510 Warrior (fv510) | 71.5 | 80.5 | 80.3 | 27.5 | 100.0 | 72.5 | m2a2_bradley |
| Merkava Mk.1B (merkava1b) | 71.5 | 85.8 | 88.5 | 32.2 | 50.8 | 85.9 | merkava4 |
| Merkava Mk.2B (merkava2b) | 71.6 | 86.3 | 83.5 | 21.8 | 77.7 | 85.8 | merkava4 |
| PT-91M Pendekar (pt91m) | 72.1 | 80.7 | 82.0 | 46.5 | 59.1 | 87.4 | t72b3 |
| T-72B obr. 1987 (t72b_1987) | 72.3 | 82.7 | 86.4 | 43.2 | 52.6 | 85.8 | t72b3 |
| IS-6B (is6b) | 72.7 | 85.7 | 88.7 | 48.8 | 28.8 | 91.3 | is6b |
| T-72B3M obr. 2022 (t72b3m) | 72.8 | 82.4 | 85.4 | 45.4 | 56.1 | 84.8 | t72b3 |
| M60A1 Patton (m60a1) | 73.2 | 81.3 | 86.9 | 48.7 | 53.1 | 86.3 | leo1a5 |
| T-90M Proryv (t90m) | 73.7 | 83.0 | 85.7 | 50.2 | 52.7 | 85.2 | t90m |
| T-72BU (t72bu) | 73.9 | 83.7 | 83.1 | 25.6 | 100.0 | 84.3 | t90a |
| Leopard 2A7V (leo2a7v) | 74.1 | 83.9 | 86.2 | 43.6 | 62.4 | 87.4 | leo2a7 |
| T-90SM (t90sm) | 74.6 | 82.8 | 83.9 | 50.2 | 64.1 | 86.8 | t90m |
| Merkava Mk.2D (merkava2d) | 75.5 | 85.9 | 88.6 | 33.1 | 81.6 | 86.2 | merkava4 |
| Merkava Mk.3C (merkava3c) | 75.7 | 87.0 | 86.7 | 61.1 | 37.5 | 85.6 | merkava4 |
| C1 Ariete (ariete) | 75.8 | 86.8 | 87.7 | 61.3 | 40.1 | 80.8 | ariete |
| KF51 Panther (kf51) | 76.0 | 85.1 | 89.4 | 49.0 | 58.8 | 88.2 | kf51 |
| T-80U (t80u) | 76.5 | 83.0 | 88.4 | 47.3 | 73.8 | 87.5 | t80u |
| AbramsX (abramsx) | 76.5 | 85.9 | 83.8 | 54.4 | 63.6 | 86.9 | m1a2 |
| Leclerc S2 (leclerc) | 76.7 | 87.6 | 82.0 | 54.0 | 65.1 | 86.6 | leclerc |
| Type 90 Kyu-maru (type90) | 76.9 | 85.2 | 87.0 | 48.7 | 72.9 | 85.6 | type10 |
| M1A1 Abrams (m1a1) | 77.5 | 88.1 | 81.7 | 49.2 | 79.9 | 85.2 | m1a2 |
| M1A1HA Abrams (m1a1ha) | 77.5 | 88.1 | 81.7 | 49.2 | 79.9 | 85.2 | m1a1 |
| M1A2 Abrams (Tejas) (m1a2_tejas) | 77.5 | 88.1 | 81.7 | 49.2 | 79.9 | 85.2 | m1a2 |
| Leopard 2A5 (leo2a5) | 78.0 | 87.5 | 85.3 | 50.7 | 73.4 | 88.0 | leo2a6 |
| Tiger II (tiger2) | 78.2 | 86.1 | 82.5 | 52.9 | 85.0 | 83.1 | tiger2 |
| Tiger I (Newc42) (newc_tiger) | 78.7 | 88.9 | 89.4 | 62.1 | 48.0 | 88.2 | newc_tiger |
| Recon Tank (Mophs) (recon_tank) | 78.7 | 79.2 | N/A | N/A | N/A | 76.5 | recon_tank |
| T-34-85 (Wei He) (t34_85_cad) | 79.0 | 88.4 | 90.2 | 52.0 | 73.3 | 79.8 | t34_85_cad |
| T95 Doomturtle (t95) | 81.5 | 81.2 | N/A | N/A | N/A | 83.1 | t95 |
| Stridsvagn 103 (strv103) | 81.9 | 85.4 | N/A | N/A | N/A | 66.7 | strv103 |
| ISU-152 (isu152) | 83.6 | 84.6 | N/A | N/A | N/A | 79.6 | sturmtiger |
| Leichttraktor (leichttraktor) | 84.2 | 83.2 | 87.3 | 69.9 | 100.0 | 90.9 | leichttraktor |
| Jagdpanzer E100 (jpz_e100) | 85.0 | 85.7 | N/A | N/A | N/A | 82.0 | jpz_e100 |
| Jagdtiger (jagdtiger) | 86.2 | 85.9 | N/A | N/A | N/A | 87.7 | jagdtiger |
| ISU-122S (isu122s) | 86.2 | 86.5 | N/A | N/A | N/A | 85.0 | jagdtiger |
| Sturmtiger (sturmtiger) | 87.5 | 86.9 | N/A | N/A | N/A | 89.7 | sturmtiger |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
