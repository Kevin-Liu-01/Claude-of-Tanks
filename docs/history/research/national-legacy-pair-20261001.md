# Hetman II and Zubr II — preserved earlier design lineage

## Owner direction

On 2026-10-01 the owner approved keeping all twelve current national modernization designs and requested two additional tanks based on the earlier T-72B3 Zubr and T-72B3M Hetman. The owner explicitly confirmed the earlier T-90SM-based versions, rather than the first unpublished redesign. These are additional original game concepts; existing IDs and the twelve current designs must remain intact.

The two new concepts retain the earlier broad welded-turret, extended-bustle, national equipment and donor-chassis identities, while receiving distinct custom primary turret shapes and armor architectures to separate them from the T-90SM. Exact real-vehicle source fidelity is not applicable. No external geometry enters the playable path.

| ID | Name | Earlier design retained | Distinction being authored |
|---|---|---|---|
| `ua_t72b3m_hetman_ii` | T-72B3M Hetman II (Concept) | T-72B3M chassis, long clipped command bustle, flank screens and field camouflage | Split angular cheek structures, welded command turret and service channels |
| `pl_t72b3_zubr_ii` | T-72B3 Zubr II (Concept) | T-72B3 chassis, broad welded turret, clipped bustle, ERAWA flank stacks and rear cage | Flat welded crown, boxy modular flank housings and distinct Polish armor layout |

Baseline earlier design: `git show 0f2b700cde04251914294e2e3e254788ef0d22ab:src/vehicles/profiles/nationalModernization.ts`. Current twelve revision-5 geometry and screenshots are separately documented in `national-modernization-redesign-20261001.md`.

## Ownership and state

Isolated worktree: `/Users/kevinliu/.codex/worktrees/cot-ifv-identity-20260925`.
Bounded geometry writers own `profiles/hetmanII.ts` / `hetmanIIDesign.ts` and `profiles/zubrII.ts` / `zubrIIDesign.ts`. The root owns registration, shared weapon integration, generated assets, validation and publication. Neither writer changes the existing twelve profiles.

Both additional concepts are built and registered. The existing twelve country profiles are preserved. Registration includes their own IDs, names, tier-X/next-generation classifications, lazy family entries, garage positions beside their current counterparts, roof-weapon ammunition, internal-layout metadata, markings and native donor wheel policy.

The initial physical run exposed the Hetman II skirt seam at z=0. Five recessed 180 mm permanent backers per side now close the panel joints, while the panel bodies retain 210 mm stock. The original test stations and thickness requirement were retained. All 44 new permanent Hetman solids passed closed-edge/opposite-winding and positive-volume checks; 384 native donor primitive emissions remained byte-identical in the bounded construction probe.

The initial fill run incorrectly treated exterior equipment spans as interior body space. Both concepts now use the same explicit closed primary-hull/turret boundary policy as the twelve current national concepts. Rebuilt fills have zero residual leakage: Hetman II five boxes/60 triangles; Zubr II four boxes/48 triangles. Open exterior screen and cargo spaces remain open. All native meshes remain included in physical and sealed checks.

## Completed local checks

- Full typecheck passed.
- `nationalModernization.selftest.mjs`: all fourteen registrations and HIGH/LOW variants passed, including native chassis/fenders, permanent skirt backing after ERA removal, dense shoulder joins, mantlet fit at pitch, roof seats, full turret underside sweep, module ownership and independent remote weapons.
- Strict exact HIGH/LOW moving-track checks passed for both additions; all zones have zero reported stock/shoe overlap.
- Each new RWS was sampled at 2° yaw increments and ten pitch settings against its actual authored equipment: no barrel or receiver collision.
- Native garage captures: seventeen 1280 × 900 views per new tank, including both sides, front/rear/top, main-gun motion, rotated turret, plain material and live/spent/reset ERA. The six live ERA sectors on each tank strip successfully.
- Sealed checks: all fourteen tanks have zero open views out of 33. Both new ledger rows were admitted only after the new-vehicle sealed rule passed.

Measured stored/instance-expanded triangles are Hetman II 42,106/115,154 HIGH and 38,194/85,046 LOW; Zubr II 29,282/101,154 HIGH and 25,370/71,046 LOW. Actual dimensions and concept declarations are frozen in `docs/references/concepts/national-legacy-pair-20261001.json`; these are original concepts, with no fabricated numerical source-fidelity score.

Actual local development Garage sampling recorded first reveals of 795 ms for Hetman II and 2,207 ms for Zubr II, and repeat reveals of 16.2 and 13.4 ms. The existing M1A1 control took 1,422 ms on its first reveal in the same session. Rapid switching converged correctly to Zubr II in 15.9 ms. These include development/loading/first-use costs and do not establish a production/mobile performance result; the broader cold-switch performance issue remains open.

Independent visual review inspected all 34 new-pair views plus current Hetman/Zubr comparison views and available T-90SM icons. It found no visible geometry blocker. A follow-up review of matching-camera 1280px T-90SM quarter/side captures confirms independent differences in primary turret shape, roof equipment, stowage and skirt construction, closing the initial thumbnail-only comparison limitation. Plain renders are bright; camouflaged views corroborate the major joins. This does not replace numerical physical checks. Full-fleet anatomy/assets/release checks are still in progress. No commit, push or deployment is claimed for this local work.
