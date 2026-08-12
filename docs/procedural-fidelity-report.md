# Procedural tank fidelity report

Available local comparison references: **4/4**. Passing 90/100 overall and 90/100 in every view: **4**. Below target: **0**. Unavailable references: **0**. Median: **94.9**.

Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, 20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.

| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |
|---|---:|---:|---:|---:|---:|---:|---|
| Leopard 2A7V (leo2a7v) | 91.2 | 90.9 | N/A | N/A | 90.3 | 93.5 | leo2a7 |
| Leopard 2A4 (leo2a4) | 92.5 | 91.6 | N/A | N/A | 92.4 | 96.5 | leo2a4 |
| Leopard 2 Revolution (leo2_revolution) | 94.9 | 93.6 | N/A | N/A | 96.4 | 98.3 | leo2a7 |
| Leopard 2A6 (leo2a6) | 95.4 | 96.3 | 96.7 | 93.0 | 94.8 | 94.5 | leo2a6 |

Reference GLBs remain quarantined measurement and visual-review oracles only. Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, opaque payloads and source-backed wrappers are forbidden.

Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. Its whole silhouette and lower running-gear profile remain scored.
