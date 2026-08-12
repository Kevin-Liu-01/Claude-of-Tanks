# Procedural tank fidelity report

Available local comparison references: **2/2**. Passing 90/100 overall and 90/100 in every view: **2**. Below target: **0**. Unavailable references: **0**. Median: **91.8**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| AMX-30B2 (amx30b2) | 91.5 | 91.3 | 92.6 | N/A | 90.7 | 90.0 | leo1a5 |
| AMX-30B (amx30) | 91.8 | 91.7 | 91.6 | N/A | 93.7 | 90.3 | leo1a5 |

Reference GLBs remain quarantined measurement and visual-review oracles only. Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, opaque payloads and source-backed wrappers are forbidden.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
