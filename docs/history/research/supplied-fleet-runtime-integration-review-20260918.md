# Supplied fleet runtime integration review — 2026-09-18

Scope: the thirteen supplied-source procedural vehicles against base `88592876f84eb1794f2a6d5505bd39d7c51c4ecd`. This review checks playable registration, lazy loading, weapon channels, damage modules, crew/layout metadata, tiers, paint identity and source isolation. It does not independently certify self-authored exterior geometry or substitute for final generated anatomy and composed release checks.

## Findings and bounded corrections

1. **K21 had a modeled, source-approved two-canister launcher but no guided ammunition.** Its inherited CV90 loadout had two APFSDS choices plus HE. The corrected loadout retains the 40 mm APFSDS and HE channels and replaces the second APFSDS channel with a generic guided missile. Two ready rounds match the visible canister count. Damage, velocity, reload, sound and nominal ammunition caliber use the existing Type 89 game balance channel; they are gameplay choices, not measured K21 missile specifications. No exact missile brand or reserve stowage is claimed.
2. **Warrior, K21 and CV90 Mk IV lacked the damageable missile module corresponding to their external launchers.** The generic two-man IFV layout declares no missile rack; the old shared missile detector additionally requires an eight-second reload and therefore misses these established two-to-three-second auxiliary channels. Root added exact source-study inferred turret-launcher layouts for the three supplied IDs. The shared detector and all unrelated layouts remain unchanged. Current lazy-finalized specs contain one missileRack module each; gun-only Ajax, Griffin and KF41 remain without one.
3. **CV90105 TML inherited a rear-powerpack layout from an unrelated manual-loading tank family.** Root assigned a separate inferred front-powerpack/manual-four-crew CV90 layout. The supplied-model publisher identifies the CV90 chassis, manual 105 mm turret, four crew and DS14/Perkins powertrain; hidden module dimensions and stations remain authored approximations. [Publisher configuration](https://armoredwarfare.com/en/news/general/development-cv90105-tml).
4. **Kurganets inherited the wrong 30 mm caliber and omitted its second missile system.** The supplied short-gun Epokha turret is the publisher's 57 mm configuration with Kornet and Bulat systems. The native 58.46 mm stylized opening corroborates that identification; it was not resized. The three numbered slots now carry the 57 mm primary round, four Kornet ready missiles and eight Bulat ready missiles. Four large flank tubes and eight small rear tubes are the visible source inventory. No hidden reserve is inferred. [Exact publisher configuration](https://armoredwarfare.com/en/news/general/development-kurganets-25).
5. **CV90 Mk.IV inherited a 35 mm caliber from its balance peer.** The exact supplied-model publisher instead selects the 50 mm Bushmaster configuration and paired Spike-LR launcher. The metadata now uses 50 mm for both conventional channels, retaining the existing auxiliary missile. Europe owns the corresponding independently checked inner-throat correction; this review did not edit its geometry. [Exact publisher configuration](https://armoredwarfare.com/en/news/general/development-cv90-mkiv).

K21 retains its existing `balancePeerOf: cv90` hint only for the balance audit's five independently checked quantities: HP, sustained primary DPM, primary penetration, power-to-weight and primary fire-control. The new focused test verifies equality of all five. Adding the auxiliary channel must not count an identical primary/mobility row twice. The audit continues to evaluate every vehicle against unchanged thresholds; no tuning, source geometry, cohort threshold or test count was weakened.

## Runtime boundary checks

All thirteen IDs are present exactly once, reachable through their intended lazy builder group, and present in saved/development/release/production/bot/visible/runtime catalogs. Fresh-process readiness begins false for all thirteen and becomes true after the actual `ensureTankBuilder(id)` path. Native anatomy/fill/marking groups are loaded through that path. Every model-source record is procedural and no spec retains a community asset field.

The AST import graph traverses static imports/re-exports and literal dynamic imports from main, Gallery and fleetFactory. No tools or source comparison modules are reachable. None of the twelve new profile modules enters an eager boot path; ZTZ retains its established lazy modern2 dispatch. Source filenames occur only as scalar-study provenance strings. No unknown dynamic import or unresolved relative import was found. No source GLB/OBJ/ZIP/model binary is tracked. The existing public postbuild guard strips the ignored comparison-model directory and independently checks registered model-source paths.

Every ID has an explicit tier, role/era, crew layout, positive hull/turret armor registration, national marking identity and a valid national factory camouflage. Existing camouflage IDs and player-selected patterns are unchanged. These metadata checks do not claim exact hidden real-world armor or crew dimensions.

## Verification and remaining integration

- `suppliedSourceWeapons.selftest.mjs`: exact thirteen-vehicle caliber/launcher census; K21 selection and two-round inventory; both Kurganets launchers, independent reload/inventory, exhaustion and cannon fallback; damageable missile module, gun-only negatives, source-frame preservation, cloned-peer isolation and repeated post-balance synchronization.
- `afvBalance.selftest.mjs`: 27 canonical IFVs pass.
- `fleetBalance.selftest.mjs`: 222 saved vehicles and 29 guided channels pass.
- `ammunitionFlow.selftest.mjs`: 220 multichannel loadouts, 1,300 depletion transitions, 29 authoritative guided launches and 657 final-round launches pass. Total ammunition-channel count remains 657.
- Full type checking passes. The changed specs file's 22 functions pass strict complexity/type gates. No exterior profile, moving gear, source frame, fixed source camera, quality floor or generated artifact was edited by the weapon repair.

Private evidence: `.qa-dev/tank-run/final-roster-integration-review/` contains the live lazy-registry census, import graph, coverage report, weapon freeze hashes and metrics. Root owns subsequent anatomy/technical-card regeneration and composed release. The equipment metadata findings above are corrected; final regenerated anatomy, CV90 throat verification and composed release remain owned by the integration run. Historical source/visual failures are not revived by this metadata review.


## Supplied weapon configuration cross-check

This table checks the actual supplied game-model variant, rather than substituting a different real-world variant. Publisher descriptions establish equipment identity; damage, cadence, penetration, audio, reserve ammunition and missile motion remain explicitly authored game balance. The ZTZ concept has no authenticated game-publisher equipment sheet, so its existing owner-approved 105 mm contract is retained without claiming a published real-vehicle specification.

| Supplied ID | Main caliber | Guided equipment represented | Source basis |
|---|---:|---|---|
| kurganets25_x | 57 mm | Kornet + Bulat, separate channels | [AW Epokha configuration](https://armoredwarfare.com/en/news/general/development-kurganets-25); supplied short gun, four flank tubes and eight rear tubes |
| ztz100_x | 105 mm | No separately authenticated guided channel | [Retained owner-supplied concept packet](../../references/tanks/ztz100_x.md#combat-record); this is a gameplay contract, not a publisher specification |
| fv510_milan_x | 30 mm | MILAN | [Publisher's model data](https://wiki.warthunder.com/unit/uk_fv510_isv), RARDEN and roof MILAN hardware |
| griffin50_x | 50 mm | None | [AW Griffin 50mm](https://armoredwarfare.com/en/news/general/development-griffin-50mm), expressly gun-only |
| ajax_x | 40 mm | None | [AW Ajax](https://armoredwarfare.com/en/news/general/development-ajax), single CTAS system |
| aft10_x | 170 mm missile | HJ-10 primary, eight fixed canisters | [AW AFT-10](https://armoredwarfare.com/en/news/general/development-aft-10) |
| bmp3m_dragun125_x | 125 mm | No separate launcher channel | [AW BM125 variant](https://armoredwarfare.com/en/news/general/development-bmp-3m-dragun); does not inherit the other Dragun turret's 100+30 mm combination |
| k21_x | 40 mm | Paired launcher, generic guided gameplay label | [AW K21 PIP](https://armoredwarfare.com/en/news/general/development-k21), K40 plus paired Raybolt hardware |
| type96b_x | 125 mm | No separate launcher channel | [AW Type96B](https://armoredwarfare.com/en/news/general/development-type-96b) |
| kf41_lynx_x | 35 mm | None | [AW 2018 prototype](https://armoredwarfare.com/en/news/general/development-kf41-lynx-prototype), supports 30/35 mm choices and explicitly excludes ATGM; this supplied build retains the supported 35 mm choice |
| cv90_mkiv_x | 50 mm | Paired launcher, generic guided gameplay label | [AW Mk.IV](https://armoredwarfare.com/en/news/general/development-cv90-mkiv), 50 mm and Spike-LR configuration |
| cv90105_tml_x | 105 mm | None | [AW TML](https://armoredwarfare.com/en/news/general/development-cv90105-tml), manual 105 mm gun |
| sabra_mk2_x | 120 mm | No separate launcher channel | [AW Sabra Mk.2](https://armoredwarfare.com/en/news/general/development-sabra-mk2), 120 mm M253 |

Kurganets' primary keeps the existing Puma-derived APFSDS gameplay channel, including its damage/velocity/cycle/audio, with caliber and label corrected to 57 mm. Kornet retains the existing guided tuning with four ready rounds. Bulat uses the prior HE channel's soft-target effect (72 damage, 10 mm penetration, 30 module damage) and the guided peer's movement/cycle/audio (117 m/s, 2.5 seconds), with eight ready rounds and nominal 70 mm caliber. These are balance approximations. The supplied publisher does not establish an exact Bulat caliber or thermobaric physics; neither is claimed here. The three-slot UI has one cannon choice and both actual missile systems; the existing special-action shortcut selects Kornet while the numbered selector exposes Bulat. Each launcher has its own reload and inventory. Main-cannon HE is omitted from this bounded three-slot loadout, rather than making the real Bulat launcher inert.

CV90's existing cannon damage/cycle and generic guided tuning remain unchanged by its caliber correction. These inherited values are not source ballistic measurements. All source registration, fixed cameras and qualification floors remain unchanged.
