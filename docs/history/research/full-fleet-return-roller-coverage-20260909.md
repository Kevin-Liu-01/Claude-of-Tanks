# Full-fleet return-roller coverage — 2026-09-09

User requirement: add real return rollers throughout the fleet, except on
vehicles whose real running gear is rollerless. Missing configuration alone
does not prove an exemption. Keep fitted geometry, finite chassis attachments,
camouflage/material roles, and complete-assembly triangle budgets independent
acceptance gates.

## Pinned inventory

At `b0ed8d90f6810e05b4890adff1f6c4584fa41e31`, actual HIGH and LOW
construction covered **201 asset-registered IDs / 402 builds**. There were no
build failures, HIGH/LOW count mismatches, or ancestry-hidden roller instances.
153 IDs contained canonical physical roller tires; 48 contained none. Counts
are tires/axles, not tire-plus-hub parts or metadata counters. Positive presence
does not certify historical count, contact, visibility through skirts, or fit.

| Total physical rollers per tank | Number of registered IDs |
| --- | ---: |
| 0 | 48 |
| 4 | 10 |
| 6 | 73 |
| 8 | 43 |
| 10 | 24 |
| 12 | 2 |
| 16 | 1 |

Retired spec-only `recon_tank` / `q_heavy` and seven unpublished conventional
Abrams X variants are not included. This baseline predates the separately
verified Leopard, Merkava, KF51 X and K2 X repairs; do not report it as their
post-integration state.

## All 48 zero-count IDs, classified once

| Category | IDs | Action / evidence limit |
| --- | --- | --- |
| Rollerless, primary recognition/museum evidence or explicit chassis derivation | `t54`, `t62mv1`, `t62mv1_x`, `t34_85`, `t34_85_cad`, `tiger1`, `newc_tiger`, `sturmtiger`, `tiger2`, `jagdtiger` | Preserve zero; Sturmtiger and armor/cosmetic variants use chassis-derived exceptions, not independent vehicle inspections. |
| Expected rollerless, exact variant primary confirmation incomplete | `challenger_cruiser`, `charioteer`, `is6b`, `is7`, `panther_g`, `stb1`, `t44`, `type59`, `type74` | Do not add rollers merely to eliminate a zero. IS-6 Object 252/253 layouts differ; Comet disproves a blanket Christie exemption. |
| Older roller-bearing chassis candidates | `centurion3`, `centurion5`, `strv81`, `challenger1`, `fv510`, `fv510_milan`, `is3`, `is3_bergman`, `leichttraktor`, `leo2a7`, `strv103`, `vt4a1`, `ztz85_iii`, `ztz99a2`, `ztz99a2_prototype` | Resolve variant count/layout, then fit at the real builder. Shared donor code is not historical proof. |
| Complex four-track omission | `object279` | Existing paired gear plus inner track stubs is not complete four-track running gear. An ordinary paired roller addition cannot close this issue. |
| New X omissions | `k2_x`, `t14_x` | Eligible; exact primary counts unresolved. Existing K2's six / T-14's eight are implementation controls only. |
| Separate repairs underway | `leo2_revolution`, `leo2a4m_x`, `leo2a5_x`, `leo2a7v_x`, `merkava3d_x`, `merkava4_x`, `kf51_x` | Reuse scoped fit/source/native receipts, do not duplicate work or call baseline zeros current failures. |
| Unbuilt game concepts | `jpz_e100`, `jpz_e100_x` | Document intended donor/design layout, not a fabricated production count. |
| Demonstrator / game derivative | `pl01`, `pl01_105` | Confirm demonstrator/donor layout; this is not equivalent to a never-built concept. |

## Builder handoff

- Centurion 3/5 and Strv81: `profiles/uk.ts` `CENTURION_HULL` / `centurionBuild`
  through `ukHull`. Do not assume four rollers from easy-to-see photographs;
  published descriptions also include front/rear inner-track-only rollers.
- Challenger 1: `profiles/challenger.ts` `CR1_HULL` through `ukHull`.
- Warrior pair: shared course in `profiles/uk.ts`; IS-3 pair: `is3Hull` /
  `sovGear` in `profiles/soviet-heavy.ts`. Never change the generic empty default:
  rollerless Soviet vehicles also use it.
- Original `leo2a7`: `tankFactoryCore.ts` `buildLeo2A7`, not `profiles/leopard.ts`.
- Strv103B: `profiles/casemate.ts` `buildStrv103` via the Sweden wrapper.
- ZTZ85III: `profiles/china.ts`; ZTZ99A2/prototype and VT4A1 share
  `buildZTZ99A2Hull`, but real vehicles need not share a historical count.
- Leichttraktor: `profiles/ww2.ts`; early small-wheel and later large-wheel
  prototype layouts differ. T-14 X: `profiles/t14X.ts`.

## Source anchors and acceptance boundaries

Rollerless references: USMC *Iraq Country Handbook*, printed A-21/A-22
([PDF](https://upload.wikimedia.org/wikipedia/commons/1/14/Marines,_Iraq_Country_Handbook.pdf));
[FM 100-2-3 T-62 recognition](https://www.trngcmd.marines.mil/Portals/207/Docs/MCIS/ITEP/RITC-East/FM%20100-2-3.pdf);
[Australian War Memorial T-34/85](https://www.awm.gov.au/collection/C110416);
US War Department contemporary [Tiger I](https://ww2.lonesentry.com/articles/ttt_tiger/index.html),
[Tiger II](https://www.lonesentry.com/articles/ttt_pantiger/index.html), and
[Jagdtiger carriage specifications](https://wiki.lonesentry.com/manuals/tme30/ch7sec5sub4.html).
The [Tank Museum Comet description](https://tankmuseum.org/tank-nuts/tank-collection/comet/)
is the explicit counterexample to treating all Christie suspensions as rollerless.

The T-14 partial diagram's label **4 is an item number, not a roller count**.
K2 manufacturer ISU/DTTS descriptions do not certify a roller count. Inferred
layouts must remain labelled as such. Existing physical rollers cost
336 HIGH / 192 LOW triangles including spindle stock, above the frozen
**160 HIGH / 80 LOW complete-return-roller budgets**. Presence/instancing is
not a performance pass; efficient primitive work remains separate.

Ignored raw inventory, count/classification evidence and driver remain in
`cot-roller-coverage-inventory-20260909/.qa-dev/roller-coverage-full.json`,
`roller-coverage-classification.json`, and `roller-eligibility-evidence.json`.
No runtime geometry, historical-count certification, or full-fleet release
approval is implied by this audit.
