# Internal-Module System

The engine/ammo-rack/fuel/track/crew damage layer: where module hitboxes come
from, how hits resolve into module damage, the one state machine that owns
module states, and the balance tables. Consolidated in the module_hitbox r1
pass (2026-07-31); sources of record are listed per section.

## Architecture — one source of truth per concern

| Concern | Owner | Consumers |
| --- | --- | --- |
| Module boxes / crew boxes / plates | `spec.armor` (vehicle spec files, §Hitboxes) | `sim/armor.js` traceTank |
| Hit resolution (saves, damage, fire, detonation) | `src/sim/damage.js` | `game/state.js` stepShells |
| Module state machine (`ok`/`yellow`/`red`, repairs) | `src/sim/damage.js` (`refreshModuleState`, `tickModuleRepairs`, `repairAllModules`) | state.js game loop, main.js repair-kit consumable |
| State broadcasts | `module:state` bus event `{ id, module, state, repaired? }` emitted by `game/state.js` only | audio.js, hud.js alerts, (killcam/damage panel read CombatState directly) |
| Presentation (labels, colors, order) | `src/ui/moduleRegistry.js` | hud.js, damagePanel.js, shotInfo.js, killcam.js |

The `repaired: true` payload flag marks a red→yellow RECOVERY so the HUD
toasts `<MODULE> REPAIRED` instead of `DAMAGED`; audio infers direction from
its own prev-state tracker and ignores the flag.

## Hit pipeline (sim/damage.js `resolveShellHit`)

Ordered `traceTank` intersections: ricochet on raw angle → ERA tiles → spaced
screens (HEAT gap decay) → main-armor pen check → 10-caliber post-pen sweep
rolling module/crew boxes. Two rules matter for module correctness:

- **Straddling-box flush** (module_hitbox r1): boxes are reported once at
  their entry `t` with their exit stamped as `tExit`. A box entered BEFORE
  the penetrated plate whose span extends past it (Tiger sponson rack hugging
  the hull side, Merkava front engine wrapping past the glacis) is parked and
  rolled AT the pen, in trace order. Before this rule those modules could
  never be damaged from their natural attack bearing (8 Merkava engines,
  Tiger rack, Leclerc fuel — measured by the probe below).
- **Post-pen limit**: module/crew boxes further than `10 × caliber` from the
  entry point do not roll (spall cone dissipates). Straddlers begin AT the
  pen point, so the limit cannot exclude them.

## Balance tables (source of record: `src/sim/damage.js`)

Module HP (`MODULE_HP`, ×2.5 on `era: 'modern'` specs):

| Module | HP (WW2) | HP (modern) |
| --- | --- | --- |
| trackL / trackR | 100 | 250 |
| engine | 160 | 400 |
| fuelTank | 120 | 300 |
| ammoRack | 150 | 375 |
| gun | 150 | 375 |
| turretRing | 120 | 300 |
| radio | 90 | 225 |
| optics | 80 | 200 |

Save throws (`SAVE_CHANCE` — chance the module takes damage when its box is
crossed; per-hit module damage is `moduleDmg ≈ caliberMm` ±25%):

| Module | Chance |
| --- | --- |
| tracks | 1.00 |
| engine / fuelTank / optics / turretRing / radio | 0.45 |
| gun | 0.33 |
| ammoRack | 0.27 |

Fire and consequence rules: engine ignites at 15% per damaging hit (safety
fuel tank equipment halves it); a fuel tank NEVER burns while yellow and
ignites at 100% on red; ammo rack red = detonation (hp→0, turret toss). Fires
tick every 0.5 s: 0.5% max HP + 10 HP off engine/fuel/ammo, 12%
self-extinguish per tick (auto-extinguisher doubles it), 10-tick budget
(extinguisher halves it, floor 2).

State machine: hp > 50% `ok`; ≤ 50% `yellow`; 0 `red`. Red modules auto-repair
to yellow (50% HP) after `REPAIR_S = 10 s` — count-up accumulator, toolbox
equipment ×1.25 rate. Debuffs: yellow gun σ×2, red gun cannot fire, yellow/red
ammo rack ×1.5 reload, dead loader ×1.5 reload (multiplicative), red tracks
immobilize (movement.js), red engine caps drive power, optics/radio degrade
spotting (spotting.js).

## Hitboxes — where boxes come from

- **Hand-authored layouts**: the foundational roster and modern1/2/3
  vehicles. Module boxes are hull-local AABBs (`mbox`), turret boxes
  turret-local (`turretLocal: true`).
- **Parametric expansion template**: additional first-party vehicles
  (`communityArmor` is the retained helper name in specs.js and its userdrops
  mirror) derive every box from `spec.dims` —
  rear-half engine, mid fuel, center-forward ammo, ring band at the roof.
- **Donor copies re-fitted to dims** (module_hitbox r1): recovered variants
  (userdrops5/6 `make()`) copy a donor spec and patch `dims`; the armor is
  now refit through `fitArmorToDims(armor, donorDims, dims)` (specs.js) —
  per-axis affine scale of plates/boxes/pivots/barrel. Before the fit the
  m60a1 carried Leopard-1-sized armor 1.2 m shorter and 0.23 m narrower than
  its rendered hull: shots at the rendered turret resolved as air. The
  geometry gate pins visuals to `spec.dims`, so dims are the shared truth for
  both visual and armor envelope.
- Published `heightM` includes cupola/MG/sight appendages that armor models
  deliberately do not plate; the probe allows 0.5 m there. Residual >0.5 m
  gaps (armor top vs published height, cupola-dominated, true shortfall
  ≲0.2 m): chieftain_mk10 + chieftain5, leo1a5, t62mv1, centurion3/5,
  m46/m47_patton, m60a1/m60a3.

## Probes / gates

- `node tools/module-hit-probe.mjs` — **the gate** (pure sim, all 80 currently
  ~2 s). Structural containment, scripted mega-pen shots through every
  internal module box from its own side / long axis / top (the right module
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

- Damage panel (`ui/damagePanel.js`): reads CombatState directly per frame;
  canvas schematic repaints only when the dirty signature (non-ok module
  states + quantized turret bearing) changes. Colors/order from
  `ui/moduleRegistry.js`.
- Kill cam x-ray and shot cards label modules via the same registry
  (`MODULE_LABEL`, `CREW_LABEL` — killcam/shotInfo copies had drifted:
  'Fuel' vs 'Fuel Tank').
- HUD toasts: `moduleAlertLabel()` (tracks collapse to `TRACK`), plus the
  `REPAIRED` recovery toast described above.
