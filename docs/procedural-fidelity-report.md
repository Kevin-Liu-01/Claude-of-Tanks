# Procedural tank fidelity report

Available local comparison references: **2/2**. Passing 90/100 overall and 90/100 in every view: **2**. Below target: **0**. Unavailable references: **0**. Median: **94.7**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| ISU-122S (isu122s) | 94.3 | 94.2 | N/A | N/A | N/A | 94.5 | jagdtiger |
| ISU-152 (isu152) | 94.7 | 94.7 | N/A | N/A | N/A | 94.8 | sturmtiger |

Reference GLBs remain quarantined measurement and visual-review oracles only. Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, opaque payloads and source-backed wrappers are forbidden.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
