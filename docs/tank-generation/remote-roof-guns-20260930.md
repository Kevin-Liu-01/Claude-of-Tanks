# Remote roof weapons — 2026-09-30

## Scope and behavior

Nineteen requested vehicles now expose their existing modeled roof weapons through the shared automatic roof-gun control. These are gameplay remote-control upgrades: a historical manually served machine gun is not represented as a newly documented real-world remote station. The Object 148 is an explicitly owner-authored prototype with its existing 30 mm roof cannon retained.

| Caliber | Vehicles | Gameplay role |
| --- | --- | --- |
| 7.62 mm | T-14 Armata, Challenger 2E, Strv 122, Merkava Mk 4 Trophy, Merkava Mk 4, Leopard 2A6 UA, Challenger 2 UA | Short-range light suppression: eight-shot bursts, 180 m acquisition |
| 12.7 mm | T-90A Vladimir, T-90A, T-90MS obr.2011, T-90M Proryv, T-90 obr.1992, both Challenger 3 variants, ZTZ-100, Type 10, K2, K1A1 | Heavy machine gun: five-shot bursts, 240 m acquisition |
| 30 mm | Object 148 Prototype | Autocannon: three-shot bursts, 360 m acquisition |

Rate, pauses, damage and penetration are game-balance values, not engineering or historical performance claims. The retained T-90MS Kord and other upgraded equipment reflect the existing game models. The owner's decorative C2 Ariete roof cannon remains non-firing.

Authority selects only spotted enemies inside the weapon's range, slews within elevation limits, checks cover and friendly lanes, and emits from the articulated muzzle. The main gun's ammunition and reload do not change. The existing solo/server command, snapshot and presentation paths are reused without protocol changes.

## Mount construction and regression protection

Original custom gun stock is divided into fixed foundation, yawing support and pitching weapon. Materials and equipment ownership are retained through factory merging. Every controlled station has one fitting root, one explicit trunnion and one measured muzzle. T-90MS armor, optics and feed equipment traverse together above the fixed foundation.

The fleet fixture exercises all nineteen vehicles at multiple roof poses and compares authoritative emission against the actual hierarchy on a tilted hull. It exposed a pre-existing nonuniform-scale ordering bug: the stretched Challenger mount could emit approximately 12 cm off its visible muzzle. Authority now composes scale and yaw in the same order as Three.js. A separate regression prevents pivot visibility from bypassing obstruction at the moving muzzle.

`src/vehicles/remoteGunFleet.selftest.mjs` covers registration, caliber, actual muzzle metal, articulation, acquisition, range, independent main reload and muzzle parity. `src/sim/auxiliarySystems.selftest.mjs` covers visibility, friendly lanes, cadence, switching and obstruction.

## Object 148 design

The entire previous Object 148 hull and turret builder has been removed. `profiles/object148Prototype.ts` authors a new long three-person crew capsule, stepped engine deck, broad two-stage bow, removable side cassettes and open rear cages. Its unmanned turret uses two independent cheek modules with deep optical apertures, a wide open gun channel, circular traverse race, short pitching mantlet and chamfered service bustle. A new compact 30 mm roof station and separate observation tower replace the previous stacked equipment. The qualified seven-wheel course, main gun dimensions and vehicle stats are retained.

The previous body required 1,365 generated fill boxes; the new closed sections need only 45 (540 triangles), with zero measured interior leakage. Front, side, rear, low-front and aimed garage captures were inspected at 1280 pixels. Both quality levels are tested for native and filled aperture clearance, structural datums, supported mudguards and articulation.

The owner's requested development vehicle is qualified against its explicit concept datums in `docs/references/concepts/object148-20260930.json`. The historical production-model comparison remains failed at 59.9/90 in `docs/geometry-gate/t14.json`; it has not been rewritten or presented as a pass.

## Reference context

- [British Army GPMG](https://www.army.mod.uk/learn-and-explore/equipment/small-arms-and-support-weapons/general-purpose-machine-gun/): 7.62 mm weapon family used for the existing British mounts.
- [Rheinmetall Fieldranger](https://www.rheinmetall.com/en/products/weapon-stations): remotely operated stations support distinct machine-gun and cannon classes; remote control does not imply a 30 mm cannon.
- [Hyundai Rotem K2](https://www.hyundai-rotem.co.kr/en/business/defense/details.do?productNm=K2+Main+Battle+Tank): 12.7/7.62 mm secondary armament categories.
- [Swedish Armed Forces Strv 122](https://www.mynewsdesk.com/forsvarsmakten/pressreleases/swedish-main-battle-tank-stridsvagn-122-on-site-in-ukraine-3274800): 7.62 mm machine-gun armament.

## Validation

The nineteen-vehicle firing/muzzle/pose fixture, fleet renewal donor and hit-frame fixture, 205-vehicle combat anatomy selftest, fleet module-hit probe, type checking and production build pass locally. The module-hit probe reports no failed or outside-envelope hits, with 96 dimension-drift warnings retained. Shared moving-source fittings preserve their source metadata and pass physical neutral-stock/seat checks.

The integrated test suite and per-vehicle release qualification are not yet green. Historical receipts for replaced builders and some pre-existing comparisons still fail; these have not been blindly re-pinned. This batch remains uncommitted and unpublished pending reconciliation and final qualification.

## Ammunition names

The owner's follow-up replaces generic roof-gun ammunition labels in the actual emitted shell, shared by solo/server combat and hit reporting. `auxiliaryWeaponProfile` now resolves cartridge identity using vehicle ID as well as caliber. Profiles are created once, without per-shot allocation or mutation of another vehicle's shell. This naming pass preserves all existing game damage classes, penetration, speed, cadence, range and reload behavior; the M789 still uses the existing simplified impact model. Named ammunition is an authored game loadout, not a claim about every vehicle's historical issued belt.

| Authored stations | Display name | Current mount count |
| --- | --- | --- |
| Western 12.7 mm, including M2/K6 families | 12.7×99 mm M2 AP | 26 |
| Russian NSVT/Kord 12.7 mm | 12.7×108 mm B-32 API | 8 |
| ZTZ-100 and VT-4A1 | 12.7×108 mm Type 54 API | 2 |
| Western 7.62 mm | 7.62×51 mm M61 AP | 6 |
| T-14 Armata PKTM | 7.62×54R mm B-32 API | 1 |
| Object 148 concept cannon | 30×165 mm 3UBR6 AP-T | 1 |
| AbramsX XM914 and Sheridan concept lightweight cannon | 30×113 mm M789 HEDP | 2 |

Designation references: [MKE M2 AP](https://www.mkeusa.com/en-us/catalogue/ammunition/127-mmx99-m2-ap/44/2113), [UNIS/IGMAN M61 and B-32 catalog](https://www.unisgroup.ba/small-arms-ammunition/), [Indian Ministry of Defence PKTM ammunition brief](https://makeinindiadefence.gov.in/upload/1/activity_file/1758085492.pdf), [UN S/2023/724 Type 54 cartridge packaging observation](https://www.ecoi.net/en/file/local/2100037/N2325555.pdf), [GICHD 3UBR6 identification](https://www.gichd.org/fileadmin/uploads/gichd/Publications/GICHD_Ukraine_Guide_2022_Second_Edition_web.pdf), and [General Dynamics M789](https://www.gd-ots.com/wp-content/uploads/2017/11/30x113mm-HEDP-1.pdf). Only designation/caliber identity is used here; real performance tables are not imported into balance.

Validation: actual firing checks cover the different cartridge families and consecutive same-caliber vehicles, including a return to the first shooter to detect shared-name mutation. Main ammunition and reload remain independent. The nineteen-vehicle remote firing/muzzle fixture and type checking pass. An inventory sweep verifies all 46 mounts have named, caliber-matched ammunition and unchanged non-name shell fields. No geometry or generated anatomy changes were required for this naming-only follow-up.

## Publication follow-up

The owner subsequently requested the complete thread batch on `origin/main`.
See `fleet-renewal-publication-20260930.md` for checklist accounting and the
retained qualification limitations. This supersedes the earlier local-only
status above; it does not change failed reference scores into passes.
