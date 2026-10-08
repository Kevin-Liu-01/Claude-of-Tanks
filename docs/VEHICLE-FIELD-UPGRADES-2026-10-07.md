# Vehicle field upgrades — 2026-10-07

## Included

- Functional independently aimed 30 mm roof cannons for Griffin 50 mm, Leopard 2A5M (legacy ID `leo2a4m_x`) and Leopard 2A5. Existing primary weapons retained.
- Distinct Chinese chevron ERA and corrected Russian chevron attachment/carrier clearance.
- Ukrainian roof cages; Oplot-M equipment/protection and 10% enlarged hull.
- Rear fuel cans, recovery logs and stowage for Type 96B, Feng, Qilin, Kunlun, Yun, C2 Ariete, Leclerc XLR, Abrams HC and Bulat-M.
- Leclerc XLR roof cannon, cages, ghillie/netting and vegetation.
- Combat weapon registry, damageable weapon geometry, garage summary, anatomy, marking seats and generated technical imagery refreshed.
- Thirty affected vehicles have regenerated presentation anchors and complete image sets. The prior PT-91M asset projection mismatch is corrected.

## Verification

After integration onto current main: typecheck/unused-code checks, actual roof seats and weapon sweeps in both detail modes, rear equipment contact tests, Chinese/Russian chevron geometry and ERA-state tests, and all fourteen national roof sweeps passed. Presentation check passed for thirty vehicles: maximum rendered residual 0.00 px, exported top residual 0.21 px. Auxiliary simulation/presentation tests and weapon inventory freshness checks passed before integration. Full anatomy and marking-seat freshness stages passed before the framing refresh.

The full `npm test` rerun did not execute: it timed out waiting for the shared cot-shots queue. The targeted release run likewise remained queued and was stopped without a release PASS. Earlier circular-cap lint still identifies existing end-wheel body/hardware overlap groups on thirteen affected vehicles; previous/current planes, areas and pairs match. No complete suite or release-gate pass is claimed.

The owner renewed the explicit commit/push-to-main/deploy request after these limits were disclosed. Publish this scoped batch with incomplete/failed statuses retained. This exception does not disable or weaken any gate.
