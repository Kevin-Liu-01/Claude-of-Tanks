# Procedural tank fidelity report

Local sourced references: **73**. Passing 90/100 overall and 90/100 in every view: **2**. Below target: **71**. Median: **82.5**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% upper assembly, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Leopard 2 Prototype (leopard2_proto) | 67.2 | 82.5 | 89.1 | 28.8 | 30.6 | 83.0 | leo2a4 |
| M1A1 AIM Abrams (m1a1_aim) | 74.3 | 79.8 | 89.8 | 48.9 | 57.8 | 89.8 | m1a1 |
| Leopard 2A7V (leo2a7v) | 74.3 | 84.2 | 80.7 | 39.5 | 84.7 | 83.0 | leo2a7 |
| T-72BU (t72bu) | 75.0 | 84.9 | 80.6 | 32.1 | 100.0 | 83.8 | t90a |
| T-90M Proryv (t90m) | 75.2 | 82.0 | 85.8 | 60.8 | 52.9 | 81.0 | t90m |
| A34 Comet (comet) | 75.5 | 85.3 | 88.3 | 59.9 | 44.8 | 77.9 | panther_g |
| Merkava Mk.2B (merkava2b) | 75.7 | 90.0 | 81.3 | 29.4 | 89.2 | 91.9 | merkava4 |
| Centurion Mk.5/2 (centurion5) | 75.8 | 86.2 | 89.2 | 58.8 | 43.6 | 79.6 | chieftain_mk10 |
| Centurion Mk.3 (centurion3) | 76.0 | 86.8 | 89.1 | 58.5 | 44.2 | 79.9 | chieftain_mk10 |
| FV4101 Charioteer (charioteer) | 76.2 | 83.7 | 86.5 | 65.4 | 46.3 | 83.4 | jagdtiger |
| T-90A Vladimir (t90a_vladimir) | 76.5 | 82.2 | 83.5 | 50.6 | 86.3 | 79.4 | t90a |
| M1A2 Abrams SEPv2 (m1a2_sepv2) | 76.5 | 84.7 | 83.5 | 54.9 | 72.6 | 79.0 | m1a2 |
| A30 Challenger (challenger_cruiser) | 76.9 | 86.3 | 89.2 | 63.6 | 38.5 | 88.0 | panther_g |
| Recon Tank (Mophs) (recon_tank) | 77.6 | 77.9 | N/A | N/A | N/A | 76.2 | recon_tank |
| T-72B3M obr. 2022 (t72b3m) | 77.7 | 82.8 | 89.4 | 51.3 | 78.3 | 84.0 | t72b3 |
| Merkava IVm Windbreaker (merkava4) | 78.1 | 82.1 | 80.2 | 51.6 | 100.0 | 87.4 | merkava4 |
| Chieftain Mk.5 (chieftain5) | 78.1 | 89.0 | 82.7 | 42.9 | 88.4 | 88.4 | chieftain_mk10 |
| FV510 Warrior (fv510) | 78.6 | 78.7 | 78.2 | 65.3 | 100.0 | 80.2 | m2a2_bradley |
| Leopard 2A5 (leo2a5) | 78.9 | 88.7 | 81.9 | 47.9 | 88.1 | 90.1 | leo2a6 |
| T-64BV1 (t64bv1) | 79.0 | 83.4 | 80.3 | 68.6 | 76.7 | 84.9 | t72b3 |
| Type 90 Kyu-maru (type90) | 79.0 | 86.1 | 87.3 | 73.0 | 49.7 | 81.0 | type10 |
| M1A2 Abrams SEPv3 (m1a2) | 79.1 | 86.0 | 88.6 | 59.4 | 67.4 | 86.0 | m1a2 |
| Merkava Mk.4B (merkava4b) | 79.3 | 88.2 | 82.5 | 52.9 | 86.3 | 85.6 | merkava4 |
| PT-91M Pendekar (pt91m) | 79.3 | 83.0 | 85.0 | 58.6 | 91.5 | 78.5 | t72b3 |
| T-62MV-1 (t62mv1) | 79.4 | 86.1 | 84.8 | 56.5 | 82.6 | 85.4 | leo1a5 |
| AbramsX (abramsx) | 79.4 | 88.8 | 80.9 | 61.2 | 70.6 | 92.5 | m1a2 |
| C1 Ariete (ariete) | 79.8 | 86.5 | 88.9 | 75.8 | 50.2 | 76.9 | ariete |
| Leopard 2 Revolution (leo2_revolution) | 80.4 | 85.5 | 87.0 | 55.4 | 88.6 | 88.2 | leo2a7 |
| T95 Doomturtle (t95) | 80.4 | 80.4 | N/A | N/A | N/A | 80.6 | t95 |
| Tiger II (tiger2) | 81.1 | 89.9 | 84.0 | 54.3 | 89.8 | 87.0 | tiger2 |
| Merkava Mk.3B (merkava3b) | 81.3 | 88.2 | 88.7 | 54.6 | 86.5 | 87.3 | merkava4 |
| IS-3 (Bergman) (is3_bergman) | 81.5 | 88.2 | 93.0 | 69.7 | 53.7 | 86.6 | is3 |
| T-72B obr. 1987 (t72b_1987) | 81.5 | 82.5 | 85.6 | 68.7 | 91.3 | 81.4 | t72b3 |
| Challenger 1 Mk.3 (challenger1) | 81.5 | 81.8 | 82.0 | 77.4 | 92.0 | 72.9 | challenger2 |
| T-90SM (t90sm) | 81.8 | 84.8 | 83.5 | 74.5 | 82.5 | 80.8 | t90m |
| Stridsvagn 103 (strv103) | 82.4 | 83.8 | N/A | N/A | N/A | 76.1 | strv103 |
| Merkava Mk.2D (merkava2d) | 82.5 | 89.2 | 90.8 | 52.5 | 90.7 | 89.8 | merkava4 |
| Merkava Mk.3C (merkava3c) | 82.8 | 88.5 | 86.4 | 64.2 | 85.7 | 88.3 | merkava4 |
| Merkava Mk.3D (merkava3d) | 82.9 | 89.5 | 88.4 | 58.3 | 89.3 | 88.7 | merkava4 |
| Leclerc S2 (leclerc) | 83.0 | 88.7 | 89.5 | 76.4 | 66.1 | 79.8 | leclerc |
| T-90A (t90a) | 83.2 | 86.1 | 85.7 | 72.4 | 88.7 | 81.8 | t90m |
| Jagdpanzer E100 (jpz_e100) | 83.4 | 83.9 | N/A | N/A | N/A | 81.4 | jpz_e100 |
| Merkava Mk.1B (merkava1b) | 83.4 | 89.0 | 91.9 | 58.0 | 88.0 | 89.4 | merkava4 |
| Type 74 (type74) | 83.8 | 82.5 | N/A | N/A | N/A | 89.3 | type74 |
| M4A3E2 Sherman Jumbo (sherman_jumbo) | 83.9 | 90.2 | 90.7 | 73.1 | 67.4 | 86.6 | sherman_jumbo |
| ISU-152 (isu152) | 84.0 | 83.7 | N/A | N/A | N/A | 85.4 | sturmtiger |
| M1A2 Abrams TUSK (m1a2_tusk) | 84.1 | 87.4 | 87.1 | 73.4 | 84.7 | 85.6 | m1a2 |
| T-80U (t80u) | 84.5 | 86.7 | 90.3 | 76.1 | 83.0 | 80.5 | t80u |
| M47 Patton (m47_patton) | 85.1 | 90.8 | 91.9 | 63.9 | 90.5 | 84.1 | m60a1 |
| KF51 Panther (kf51) | 85.2 | 87.9 | 88.4 | 76.1 | 87.5 | 83.0 | kf51 |
| T-34-85 (Wei He) (t34_85_cad) | 85.8 | 90.8 | 91.1 | 72.1 | 83.2 | 85.3 | t34_85_cad |
| Leopard 2A6 (leo2a6) | 86.0 | 88.4 | 89.6 | 78.6 | 83.8 | 86.8 | leo2a6 |
| M45 Patton (m45_patton) | 86.1 | 89.8 | 90.5 | 66.3 | 100.0 | 85.3 | m4a3e8 |
| M1A2 Abrams (Tejas) (m1a2_tejas) | 86.6 | 89.1 | 91.0 | 79.8 | 78.5 | 90.3 | m1a2 |
| M1A1 Abrams (m1a1) | 86.6 | 89.3 | 91.0 | 79.7 | 78.5 | 90.3 | m1a2 |
| M1A1HA Abrams (m1a1ha) | 86.6 | 89.3 | 91.0 | 79.7 | 78.5 | 90.3 | m1a1 |
| M46 Patton (m46_patton) | 87.6 | 91.1 | 92.0 | 72.5 | 94.1 | 85.8 | m60a1 |
| M26 Pershing (m26_pershing) | 88.4 | 92.2 | 92.5 | 75.8 | 90.8 | 87.1 | m4a3e8 |
| IS-3 (is3) | 88.6 | 90.8 | 92.9 | 79.0 | 90.9 | 86.1 | is3 |
| ISU-122S (isu122s) | 88.8 | 88.8 | N/A | N/A | N/A | 88.6 | jagdtiger |
| Panzer III Ausf. J (newc_pziii) | 88.9 | 91.3 | 89.6 | 80.6 | 96.7 | 85.7 | newc_pziii |
| Jagdtiger (jagdtiger) | 88.9 | 88.9 | N/A | N/A | N/A | 89.0 | jagdtiger |
| IS-7 (is7) | 89.0 | 89.7 | 90.0 | 80.8 | 95.9 | 92.7 | is7 |
| Tiger I (Newc42) (newc_tiger) | 89.0 | 91.5 | 91.5 | 83.4 | 85.3 | 89.0 | newc_tiger |
| Panzerkampfwagen III (pziii_konserwa) | 89.0 | 90.0 | 90.3 | 81.4 | 96.7 | 87.5 | pziii_konserwa |
| Heavy Tank (Quaternius) (q_heavy) | 89.1 | 92.5 | 91.8 | 79.5 | 91.1 | 86.3 | q_heavy |
| M60A3 (m60a3) | 90.0 | 90.8 | 92.0 | 85.7 | 92.2 | 87.3 | m60a1 |
| Sturmtiger (sturmtiger) | 90.0 | 89.5 | N/A | N/A | N/A | 91.9 | sturmtiger |
| M60A1 Patton (m60a1) | 90.2 | 91.0 | 92.0 | 86.2 | 92.5 | 87.3 | leo1a5 |
| KV-2 (kv2) | 90.2 | 92.3 | 92.5 | 85.3 | 89.3 | 87.8 | kv2 |
| Leichttraktor (leichttraktor) | 90.3 | 91.2 | 90.3 | 81.5 | 100.0 | 93.4 | leichttraktor |
| IS-6B (is6b) | 90.6 | 92.0 | 92.5 | 87.5 | 86.9 | 92.1 | is6b |
| Object 279 (object279) | 90.9 | 92.8 | 92.5 | 86.7 | 87.4 | 93.2 | object279 |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
