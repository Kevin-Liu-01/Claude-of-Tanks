# Procedural tank fidelity report

Local sourced references: **1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Median: **92.6**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| T-14 Armata (t14) | 92.6 | 97.5 | 97.7 | 94.0 | 64.3 | 93.7 | t14 |

Reference GLBs remain provenance-tracked measurement and visual-review oracles. A playable may use hand-authored procedural geometry or a documented, reproducible source-derived payload when the owner explicitly clears that source.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
