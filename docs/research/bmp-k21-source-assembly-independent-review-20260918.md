# BMP / K21 source assembly — independent review, 2026-09-18

Verdict: the two private static closed-door source assemblies are supported by the original supplied geometry. All twelve before/after originals were actually viewed. This is source-target assembly approval, not a score or release qualification for either procedural tank. The reviewer previously authored K21 launcher terminals and Type96 fittings, but did not author either source assembly; no native candidate was used in this review.

## Independently checked preservation and placement

- Recomputed all twelve image and fourteen artifact SHA256 values in `review-identity.json`; every value matches. Original source and derived GLB hashes match their manifests.
- Parsed the actual GLB chunks: all binary bytes are identical, including positions, normals, indices and material resources. Complete JSON comparison differs only in the selected node matrix. Both matrices are identity rotation/unit scale plus translation; no component is deleted.
- Independently decoded original POSITION accessors. Every selected door corner and receiving-frame corner in the fit is an exact original source vertex, with zero coordinate discrepancy. Recomputed the translation residuals below. No candidate-derived dimension, point, mask or camera enters the fit.
- Read the writer, fit, render and validation scripts. The source-only renderer uses a fixed neutral clay override for both states; paired camera, target and orthographic scale are exactly equal. These images establish geometry/assembly, not original texture fidelity.
- Inspected the recorded eighteen FrontSide first-hit rear rays and their validation code. All nine per model first hit the installed door after assembly. Those ray jobs were not rerun in this read-only review. They prove aperture coverage at eighteen finite stations, not full collision-free hinge articulation.

| Model | Selected source stock | Translation (m) | Source-only fit | Preservation |
|---|---|---|---|---|
| bmp3m_dragun125_x | Object_11, node10 / mesh9; 828 triangles, 21 components | [-0.47097500196347636, 1.1820333277185757, -3.2602916439063847] | 12 points; RMS 0.597mm, max 0.930mm | 3,094,956 binary bytes unchanged |
| k21_x | Object_7, node6 / mesh5; 652 triangles, 15 components | [-0.2462999764829874, 1.3396999835968018, -3.6843499925744254] | 4 points; RMS 0.461mm, max 0.461mm | 7,416,324 binary bytes unchanged |

## Actual image observations

BMP: the source starts with a chamfered rear aperture and the complete loose door below the vehicle. After translation the same plate fills that aperture, its two right-side hinge leaves meet the fixed receiver leaves, and the circular port and latch remain on the plate. The rear quarter retains body, roof, gun and running gear; the loose below-ground door is no longer present there because it was moved intact. No visible new unsupported receiver or missing stock was found.

K21: the loose small door and its hardware move into the matching rounded rectangular opening in the larger rear ramp. The two horizontal hinge arms meet the original right-side receivers; the left latch and circular port remain visible. The closed door overlaps the aperture edge as its original back-face corners require, without changing the fixed ramp, hinge beam, side boxes or track stock. No new visible assembly defect was found.

Every original below was opened directly, not inferred from a contact sheet or a silhouette score.

| Model | View | Before | After |
|---|---|---|---|
| bmp3m_dragun125_x | rear | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/before/rear.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/after/rear.png) |
| bmp3m_dragun125_x | rear-quarter | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/before/rear-quarter.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/after/rear-quarter.png) |
| bmp3m_dragun125_x | door-close | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/before/door-close.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/bmp3m_dragun125_x/after/door-close.png) |
| k21_x | rear | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/before/rear.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/after/rear.png) |
| k21_x | rear-quarter | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/before/rear-quarter.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/after/rear-quarter.png) |
| k21_x | door-close | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/before/door-close.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-eastern/review/k21_x/after/door-close.png) |

## Limits and integration requirements

This approves a defensible static closed pose of supplied stock. It does not prove manufacturer dimensions, open-door animation, watertight source meshes, full hinge clearance throughout motion, or procedural model fidelity. Keep the original GLBs, prior failed raw-target results, recipes, receiver evidence and derived hashes. Integrate the approved derived target explicitly and rerun the normal unchanged native comparison gates. Do not retroactively relabel previous failed raw-source outcomes. The filenames containing `assembled-native-validation` refer to source GLBs loaded into Three, not game procedural geometry.

The preserved initial validation failure used an erroneous array `.y` access. The corrected validation uses the actual array index and does not change the source transform. No new capture, runtime edit, canonical source replacement or gate edit was performed by this reviewer.

Independent machine receipt: `.qa-dev/tank-run/source-assembly-eastern/independent-checks.json`.
