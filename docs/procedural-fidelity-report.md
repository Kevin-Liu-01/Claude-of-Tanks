# Procedural tank fidelity report

Available local comparison references: **1/1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Unavailable references: **0**. Median: **91.0**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| T-90M Proryv (t90m) | 91.0 | 92.7 | 91.7 | 86.9 | N/A | 91.3 | t90m |

Reference GLBs remain quarantined measurement and visual-review oracles only. Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, opaque payloads and source-backed wrappers are forbidden.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
