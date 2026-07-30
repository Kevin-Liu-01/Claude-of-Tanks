# Procedural tank fidelity report

Local sourced references: **6**. Passing 90/100 overall and 90/100 in every view: **0**. Below target: **6**. Median: **70.9**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% upper assembly, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Chieftain Mk.5 (chieftain5) | 52.3 | 85.9 | 62.3 | 24.9 | 0.0 | 20.5 | chieftain_mk10 |
| Merkava Mk.4B (merkava4b) | 67.0 | 78.2 | 82.1 | 29.2 | 51.5 | 88.0 | merkava4 |
| M1A2 Abrams SEPv3 (m1a2) | 70.3 | 85.1 | 74.3 | 32.6 | 72.4 | 84.1 | m1a2 |
| T-72B3M obr. 2022 (t72b3m) | 70.9 | 80.9 | 83.5 | 40.9 | 55.5 | 86.0 | t72b3 |
| M60A1 Patton (m60a1) | 71.8 | 78.8 | 85.3 | 48.1 | 53.2 | 86.2 | leo1a5 |
| Leopard 2A5 (leo2a5) | 75.4 | 86.3 | 83.8 | 43.3 | 70.6 | 88.4 | leo2a6 |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
