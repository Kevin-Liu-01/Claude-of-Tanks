# Type 100 (`type100`) — NEW VEHICLE packet

**Exact vehicle modeled:** the PLA's next-generation medium tank as paraded on 2025-09-03
(reported designations ZTZ-100 / "Type 100"): a low, wide, sharply angled hull with a
two-facet glacis over a steep bow, layered skirt doors with a chamfered leading door,
six road wheels a side under the skirts, a compact faceted turret with flat creased cheek
modules, twin quadruple launcher pods on the turret shoulders, a tall commander's sensor
mast behind the roof, a compact remote 12.7 mm station, a 105 mm autoloaded gun in a boxy
mantlet, and the parade's sand digital camouflage with olive and pale cream cells. Hull
number 1262 with the PLA star on the left bow skirt.

## OWNERSHIP / ROUND STATE (2026-09-15, owner request)
GROUND-UP NEW ID. Spec in `src/vehicles/chineseFrontlineSpecs.ts`; builder `buildType100` in
`src/vehicles/profiles/type100.ts` (registered through `CHINESE_FRONTLINE_PROFILES`). Owner
brief: "a super detailed mix of the puma and cv90mk4, just check the image and make it look
like that" — the hull follows the Puma S1 vocabulary (crowned monocoque with cut plan
corners, skirt-door jacket) and the turret the CV90 Mk IV vocabulary (faceted citadel,
applique cheeks, sensor mast, launcher tubes, compact RWS). No source model, GLB or
measurement oracle participates; every dimension below is a design decision read from the
photograph at the 3.66 m width anchor.

## DIMS DECISION — PHOTOGRAPH-PROPORTIONAL
| Measure | Value | Basis |
|---|---|---|
| Hull length | 6.95 m | bow z 3.42 to stern z −3.53 |
| Overall length (with gun) | 9.05 m | 105 mm muzzle at z 5.50 |
| Width (over skirts) | 3.66 m | skirt faces at ±1.83 |
| Height (turret roof / mast top) | 2.58 m / 3.78 m | roof y 2.58, mast dome top 3.78 |
| Gun | 105 mm, 4.95 m from the trunnion | thermal sleeve, evacuator, MRS collar |
| Road wheels / rollers / sprocket | 6 / 3 / rear | idler forward |

## Identity cues
- Turret: 12-facet plan, wide wedge front, two creased cheek modules a side, roof at 0.78 m
  above the ring, sensor mast (pedestal, column, boxed head with a wide window, cap, dome)
  behind the gunner's sight; commander's hatch front-left; RWS right-rear; four laser
  warning receivers; two antenna whips; bustle rack.
- Launchers: two quadruple pods on the shoulders, tubes elevated 10° and splayed 17°.
- Hull: three nose planes (bow, lower glacis, upper glacis), bow handrail, driver front-left
  with three periscopes, recessed lamp clusters on the sponson fronts, exhaust cowl right
  rear, grille deck, two stern bins.
- Running gear: `armored-hub-six` wheels, `compact-ifv` track, covered top run, chamfered
  leading skirt door, six bolted doors behind it, rubber lip.
- Finish: `sig_type100` sand digital (base #b39a6c, olive #7f8f5c, cream #e3d6ab, dark olive
  #5d6c48, cell scale 0.40, `digitalCellK` 1.4); PLA star + "1262" on the left bow skirt.

## Receipts
`src/vehicles/profiles/type100.selftest.mjs` (identity, part census at the builder port,
envelope, mast height, muzzle anchor); the registry receipts (fleetLazy, tier, taxonomy,
vehicleMarkings, camoPolicy, garageOrder, fleetOrder, productStats); the regeneration chain
(`gen-interior-fills --ids=type100`, `presentation-centering --update --ids=type100`,
`tank:anatomy:update`, `genIcons --ids=type100`, `tank-sealed-check --update-ledger`,
`tank:freeze`, `tank:roster -- --write`) and `npm run tank:release:check -- --ids=type100 --gate`
in the main worktree.
