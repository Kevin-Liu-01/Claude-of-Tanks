# Internal-Module System

The engine/ammo-rack/fuel/track/crew damage layer: where module hitboxes come
from, how hits resolve into module damage, the one state machine that owns
module states, and the balance tables. Consolidated in the module_hitbox r1
pass (2026-07-31); sources of record are listed per section.

## Architecture — one source of truth per concern

| Concern | Owner | Consumers |
| --- | --- | --- |
| Closed armor cells / smooth module and crew volumes | `spec.armor` (authored zones finalized by `vehicles/combatAnatomy.ts`) | `sim/armor.ts` `traceTank`, Gallery diagnostics, scoped armor flashlight |
| Hit resolution (saves, damage, fire, detonation) | `src/sim/damage.ts` | `game/state.ts` stepShells |
| Module state machine (`ok`/`yellow`/`red`, repairs) | `src/sim/damage.ts` (`refreshModuleState`, `tickModuleRepairs`, `repairAllModules`) | state.ts game loop, main.ts repair-kit consumable |
| State broadcasts | `module:state` bus event `{ id, module, state, repaired? }` emitted by `game/state.ts` only | audio.ts, hud.ts alerts, (killcam/damage panel read CombatState directly) |
| Presentation (labels, colors, order) | `src/ui/moduleRegistry.ts` | hud.ts, damagePanel.ts, shotInfo.ts, killcam.ts |

The `repaired: true` payload flag marks a red→yellow RECOVERY so the HUD
toasts `<MODULE> REPAIRED` instead of `DAMAGED`; audio infers direction from
its own prev-state tracker and ignores the flag.

## Hit pipeline (sim/damage.ts `resolveShellHit`)

Ordered `traceTank` intersections: ricochet on raw angle → ERA tiles → spaced
screens (HEAT gap decay) → main-armor pen check → post-pen fragment sweep
rolling module/crew volumes. Two rules matter for module correctness:

- **Straddling-volume flush** (module_hitbox r1): volumes are reported once at
  their entry `t` with their exit stamped as `tExit`. A volume entered BEFORE
  the penetrated plate whose span extends past it (Tiger sponson rack hugging
  the hull side, Merkava front engine wrapping past the glacis) is parked and
  rolled AT the pen, in trace order. Before this rule those modules could
  never be damaged from their natural attack bearing (8 Merkava engines,
  Tiger rack, Leclerc fuel — measured by the probe below).
- **Post-pen limit**: module/crew volumes further than
  `max(1.25 m, 10 × caliber)` from the entry point do not roll (the penetrator
  and fragment corridor dissipates). The floor keeps penetrating autocannon
  rounds mechanically capable of reaching central modules; full-caliber tank
  guns retain their caliber-scaled reach. Straddlers begin AT the pen point,
  so the limit cannot exclude them.

## Balance tables (source of record: `src/sim/damage.ts`)

Module HP (`MODULE_HP`, ×2.5 on `era: 'modern'` specs):

| Module | HP (WW2) | HP (modern) |
| --- | --- | --- |
| trackL / trackR | 100 | 250 |
| engine | 160 | 400 |
| fuelTank | 120 | 300 |
| ammoRack | 150 | 375 |
| gun | 150 | 375 |
| turretRing | 120 | 300 |
| gunMount | 120 | 300 |
| autoloader | 125 | 312.5 |
| feedSystem | 110 | 275 |
| missileRack | 120 | 300 |
| transmission | 140 | 350 |
| radio | 90 | 225 |
| optics | 80 | 200 |

Damage rolls (`damageChance` — chance the module takes damage when its volume is
crossed; per-hit module damage is `moduleDmg ≈ caliberMm` ±25%):

| Module | Chance |
| --- | --- |
| tracks | 1.00 |
| engine / fuelTank / optics / turretRing / radio | 0.45 |
| transmission / gunMount | 0.45 |
| feedSystem | 0.38 |
| autoloader | 0.36 |
| gun | 0.33 |
| missileRack | 0.30 |
| ammoRack | 0.27 |

Fire and consequence rules: engine and transmission ignite at 15% per damaging hit (safety
fuel tank equipment halves it); a fuel tank NEVER burns while yellow and
ignites at 100% on red; ammo rack red = detonation (hp→0, turret toss). Fires
tick every 0.5 s: 0.5% max HP + 10 HP off engine/fuel/ammo, 12%
self-extinguish per tick (auto-extinguisher doubles it), 10-tick budget
(extinguisher halves it, floor 2).

State machine: hp > 50% `ok`; ≤ 50% `yellow`; 0 `red`. Red modules auto-repair
to yellow (50% HP) after `REPAIR_S = 10 s` — count-up accumulator, toolbox
equipment ×1.25 rate. Debuffs: yellow gun σ×2, red gun cannot fire, yellow/red
ammo rack ×1.5 reload, dead loader ×1.5 reload (multiplicative), red tracks
immobilize (movement.ts), red engine caps drive power, optics/radio degrade
spotting (spotting.ts); a yellow gun mount applies the same accuracy penalty
as a damaged gun and a red gun mount prevents its casemate weapon from firing.

## Combat anatomy — where collision and internal volumes come from

- **Closed external shell**: `tools/gen-combat-anatomy.mjs` clips the actual
  first-party procedural hull/turret armor triangles into longitudinal slabs,
  constructs bounded convex cells, and records exact cupola/hatch cells. The
  fleet finalizer maps every generated face back to the nearest canonical armor
  zone, preserving physical/KE/CE thickness and layered ERA/spaced/track rules.
- **Smooth internals**: authored `min`/`max` records remain stable calibration
  envelopes, not ray-test AABBs. At finalization they become ellipsoids,
  capsules, or elliptic cylinders. Long volumes are segmented across adjacent
  shell cells and seated inside their convex component, eliminating false AABB
  corner hits and internal volumes exposed through empty air.
- **The turret ring on the turret's axis** (240, 2026-10-22): the hull's
  calibration maps the authored ring box with the hull's plates, and on 211 of
  217 turreted tanks that carried it off the drawn ring (median 0.16 m, up to
  1.65 m on the AFT-10). `alignTurretRing` keeps the box's calibrated size and
  centres it on the drawn ring: the calibration's `turretRing` receipt (the
  rig_turret seat and the deck round the race, where `turretSeatRace.ts` draws
  the race and a wreck seats its plate) where the generator publishes one, else
  the turret pivot, where the builder seats `rig_turret`
  (`combatGunRigs.generated.ts` where a builder moves it), at the calibrated
  turret bottom. The precise shapes, seated inside the shell cells after it,
  keep their volume-weighted centre within 5.5 cm of the axis (median 1 mm);
  on a receipt's deck they sit under the hull's closed armour, their top at its
  roof. `combatAnatomyAudit` pins the box on the drawn ring's axis for every tank.
- **Hand-authored layouts**: foundational and modern vehicles still own the
  semantic location and articulation frame (`turretLocal`) of each system;
  the finalizer changes collision representation, not module identity.
- **Parametric expansion template**: additional first-party vehicles
  (`communityArmor` is the retained helper name in specs.ts and its userdrops
  mirror) derive every box from `spec.dims` —
  rear-half engine, mid fuel, center-forward ammo, ring band at the roof.
- **Donor copies re-fitted to dims** (module_hitbox r1): derived variants
  (`additionalFleetSpecs.ts` and `classicFleetSpecs.ts`) copy a donor spec and
  patch `dims`; the armor is
  now refit through `fitArmorToDims(armor, donorDims, dims)` (specs.ts) —
  per-axis affine scale of plates/authoring bounds/pivots/barrel. Before the fit the
  m60a1 carried Leopard-1-sized armor 1.2 m shorter and 0.23 m narrower than
  its rendered hull: shots at the rendered turret resolved as air. The
  geometry gate pins visuals to `spec.dims`, so dims are the shared truth for
  both visual and armor envelope.
- Published `heightM` may include external sights, weapons and antennas. Those
  are never allowed to stretch the base shell; structural cupolas and hatches
  receive their own exact convex cells, while equipment remains external.
- **A gun fixed in the hull is the gun** (259): the Strv 103 family's `hullGun`
  stays out of the hull shell and its calibration, and the barrel is traced as
  `armor.gunBarrel`. Inside the shell it plated the barrel as glacis to the
  muzzle, bridged the nose to the tube with a convex face in air and stretched
  the calibrated zones ~1.9 m forward, so the 103A's nose took side-armour labels
  and its centre-mass shot met the wedge only through a gap mid-hull.
  `fleetBalance` shoots each siege hull at its shell's mid-height: the wedge is the
  first plate met, and a shot across the barrel meets no plate.
- **A donor's drawn core measures with the donor's ring** (259): the ring
  receipt's radius hint comes from the combat ring module, so a variant drawing
  its donor's exact hull and turret (the PT-91M: `hullG.userData.pt91mDonor`)
  measures with the donor's, and its seated turret is the donor's byte for byte.

## Probes / gates

- `node src/vehicles/fleetPassDefault.selftest.mjs` — fleet-wide generated-data
  gate (the combat-anatomy audit, `combatAnatomyAudit.test-support.mjs`, beside the
  marking, asset and mudguard audits on the same default build): every playable
  tank, exact roof structures, supported smooth shapes, internal-shape
  containment, and deterministic front/side/top seam rays.
- `node tools/module-hit-probe.mjs` — legacy targeted pure-sim probe (all roster
  ~2 s). Structural containment, scripted mega-pen shots through every
  internal module volume from its own side / long axis / top (the right module
  must ROLL, not merely be traced), track reachability via moduleLink, and
  the armor-envelope vs dims drift audit. Exit 1 on any hard FAIL.
  - The historical r1 pass corrected ten failures. The current fleet result is
    **80/80 pass**; published-height drift remains warning-only for appendages
    that intentionally sit above the armored envelope.
- `node tools/module-crit-probe.mjs [--shots N --seed S]` — seeded realistic
  volley through the live pipeline; asserts crits-given-pen inside 15–90%.
  Reference @400 shots/seed 4242: pen 51%, crit-given-pen 72%, crit share
  tracks 65%, engine 8%, gun/optics/fuel ~6% each, ammoRack 3.6%,
  ring/radio ~3%; 22 crew hits, 9 fires.
- `node tools/module-visual-align-probe.mjs [--ids=…]` — browser scan of the
  BUILT visual (rig-classified vertices) vs armor model: deck/side/track/ring
  gaps. Audit aid, exit 0; deck metric unreliable on some GLB rigs with
  follower-swept subtrees (casemates report ring n/a-ish values).

## Presentation contracts

- Scoped armor flashlight (`game/armorAimOverlay.ts`): default-off, enabled in
  Gameplay → Interface, and visible only in the gunner scope on an already
  spotted live target. Since 262 it is paint, as camo is: the vehicle's own
  armour, fitting and dark-part paint takes, per fragment, the colour of the
  armour zone it lies in (`vehicles/materials.ts` ARMOR_PAINT on the burn
  hook: the authored plate it lies nearest, inside whose outline and facing its
  way, in the hull or turret frame), red → amber → green by the selected
  shell's real layered penetration estimate (distance, angle, normalization,
  ricochet, ERA, tracks and spaced armor included), blended from up to three
  samples on the collision faces the authority gives each plate. Sampling is
  spread across 48-query frame batches to avoid periodic render stalls; battle
  exit releases every zone table.
- Damage panel (`ui/damagePanel.ts`): reads CombatState directly per frame;
  exact module and crew volume centers project through their authored hull or
  turret frame before a tightly source-bounded screen-space collision pass.
  The canvas schematic repaints only when the dirty signature (module/crew
  states + quantized hull/turret bearing) changes. Colors and role vocabulary
  come from `ui/moduleRegistry.ts`.
- Kill cam x-ray and shot cards label modules via the same registry
  (`MODULE_LABEL`, `CREW_LABEL` — killcam/shotInfo copies had drifted:
  'Fuel' vs 'Fuel Tank').
- HUD toasts: `moduleAlertLabel()` (tracks collapse to `TRACK`), plus the
  `REPAIRED` recovery toast described above.
