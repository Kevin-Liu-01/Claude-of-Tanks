# Procedural tank fidelity report

Local sourced references: **1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Median: **98.0**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| FV510 Warrior (fv510) | 98.0 | 97.0 | 97.2 | 100.0 | 100.0 | 96.6 | m2a2_bradley |

The local GLBs are measurement and visual-review oracles only. The game does not embed extracted source vertices in its procedural builders.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
