# Procedural tank fidelity report

Available local comparison references: **1/1**. Passing 90/100 overall and 90/100 in every view: **1**. Below target: **0**. Unavailable references: **0**. Median: **95.4**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Leopard 2A6 (leo2a6) | 95.4 | 96.3 | 96.7 | 93.0 | 94.8 | 94.5 | leo2a6 |

Reference GLBs remain quarantined measurement and visual-review oracles only. Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, opaque payloads and source-backed wrappers are forbidden.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
