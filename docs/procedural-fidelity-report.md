# Procedural tank fidelity report

Local sourced references: **1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Median: **91.3**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Challenger 2 (challenger2) | 91.3 | 94.4 | 90.6 | 89.1 | 85.9 | 93.6 | challenger2 |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
