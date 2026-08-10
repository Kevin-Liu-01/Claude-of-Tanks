# Procedural tank fidelity report

Local sourced references: **1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Median: **94.7**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| AMX-40 (amx40) | 94.7 | 96.2 | 96.4 | 90.9 | 92.1 | 95.9 | amx40 |

Reference GLBs remain provenance-tracked measurement and visual-review oracles. A playable may use hand-authored procedural geometry or a documented, reproducible source-derived payload when the owner explicitly clears that source.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
