# Procedural tank fidelity report

Local sourced references: **2**. Passing 90/100 overall and 90/100 in every view: **0**. Below target: **2**. Median: **88.3**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% upper assembly, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Type 90 Kyu-maru (type90) | 81.6 | 93.5 | 95.5 | 83.0 | 8.4 | 92.5 | type10 |
| C1 Ariete (ariete) | 88.3 | 94.9 | 95.1 | 86.7 | 53.0 | 95.3 | ariete |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
