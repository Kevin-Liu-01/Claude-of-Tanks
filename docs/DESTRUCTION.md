# Destruction — buildings, ground and the blast catalog

> Owner, 2026-10-07: "also add complex building and everything destruction. thats a big feature ppl request. also add
> more variety of explosions that should be destructive and leave holes and craters and stuff esp from like the ac 130
> and drones and missiles and normal shots and he and so on." Then: "that applies for ground and buildings, and
> buildings should break and collapse and stuff after withstanding damage and ramming and so on, see how this can be
> done".

Two lanes deliver it. The **core** lane (this document's owner) decides everything authoritative: what breaks, when,
how the collision, sight lines, ground and bot navigation change, and how multiplayer carries it. The **presentation**
lane owns the look and sound: explosion variety per munition, debris and dust, collapse animation, holes and cracks,
crater surfaces. The two meet in one light module, `src/sim/destructionEvents.ts` (§11), which the fx and audio layers
import without pulling a world builder.

Units are metres, seconds, radians and kilograms of TNT equivalent. Everything in §3–§8 runs in the fixed 60 Hz step,
Node-runnable, seeded, allocation-free per tick except when a blow actually changes something.

## 1. Current state (2026-10-07, push-3 stage 43e91f222)

| Piece | Where | What it does today | Gap |
|---|---|---|---|
| Small destructible props | `src/world/props.ts`, `destructibles.ts`, `crushableClutter.ts` | Fences, carts, bales, hedgehogs, light huts (`DESTRUCTIBLE_BUILDING_TYPES`: checkpoint hut, motor pool) break or topple on a ram or a direct shell hit; one `propIdx` groups a prop's records | HE blasts never break a prop they do not touch |
| Trees | `vegetation.ts` | Felled by ram or shell (`treeIdx`); concealment discs never update | as above |
| Buildings | `props.ts addStructureCollision`, `landmarks/compose.ts` | One `kind: 'structure'` contact record in `obstacles` (movement) and N 0.5 m shell bands in `colliders` (shells, sight) per placement; **no id ties them together**, nothing damages them | the whole feature |
| Building collision | `structureCollision.ts` | Geometry-derived contact band (ground solids below 1.8 m) and shell bands; captured into the per-map shards | no group id in the shard |
| Shards | `server/world-collision-manifests/*.json` | 33 maps, 1,410 structure contact records, 19,369 structure shell bands; ruinspires 392 buildings, blackglass 147, urban 138, verdant 9 | — |
| Blast law | `sim/damage.ts resolveHeBurst` | HE/HESH splash on tanks: radius `0.66·(cal/30)^1.3` m clamped 1–8 m (explicit `blastRadiusM` up to 40 m for the gunship's howitzer 22 m and missile 18 m) | tanks only |
| Impact physics | `sim/impact.ts` | Energy law `½·m·v²` (kJ) prices crashes, falls and rams on hulls | nothing priced on the wall that was hit |
| Craters | `src/fx/combat/craters.ts` | A visual decal ring (40 slots, 75 s hold, radius at most ~3 m even under the gunship's 22 m howitzer); the only deformed ground is pre-baked at map build (`props.ts`) | the FX round 6 combat media layer (`combat/craters.ts`, `combatFx.ts`) is being reverted (push 3b, `fix/revert-fx-round6`); the presentation lane rebuilds crater visuals on this lane's stamp events. No terrain deformation exists |
| Terrain | `world/terrain.ts`, `terrainContactSurface.ts` | Analytic `heightAt` + a lazy 1 m fast grid; the contact surface is the rendered near mesh (1024 m, 8×8 chunks of 96 segments: a 1.333 m lattice) | immutable |
| Bot navigation | `sim/botRoutePlanner.ts` | One 25 m grid per match, solids baked once; a wreck overlay re-tests edges near wrecks | never re-tested for a vanished wall |
| Multiplayer world state | `docs/MULTIPLAYER-V2.md` §13.13–§13.16 | Destroyed-prop index list (keyframe whole, delta additions), `world_prop_destroyed` events (public), migration restore, the world-events and determinism audits | no structure or crater channel |

The solo step (`game/state.ts`) and the network authority (`sim/authoritativeMatch.ts`) are separate integrations of
the same rules; every destruction rule below lives in shared `src/sim` modules both call, as `resolveHeBurst` and
`resolveHullImpact` already are.

## 2. Weapons in the game (the catalog's inputs)

From the fleet specs, `matchRuleset.ts`, `auxiliaryWeapons.ts` and `equipment.ts` (a shell's `type` is a plain string;
`damage.ts SHELL_BEHAVIOR` gives its class, KE / CE / HE):

- Tank guns: AP / APCR / APFSDS 20–170 mm, HE 20–180 mm, HEAT 90–170 mm. **No shell is typed `HESH`**: the L31A7 and
  M393 HESH rounds are typed `HE` and named; the L34 WP smoke round is typed `HE` too (it resolves as a 120 mm blast
  today). The classifier reads the name for both.
- IFV autocannons: AP / APFSDS / HE 20–50 mm (DTW-30, M919/M792 25 mm, Marder 2 50 mm, L14A2/L13A1 30 mm).
- Roof guns (`auxiliaryWeapons.ts`): 12.7 mm M2 and 7.62 mm M61 (typed AP), 30 mm M789 HEDP (typed AP, named HEDP).
- Guided missiles, 33 rounds: guided HEAT (TOW-2A 152, Konkurs 135, Spike LR/LR2/ER2, HJ-10 170, Viper 140) and guided
  HE (9M-695 Blast 152, HJ-P9 Blast 152, FIM-92 Stinger 70).
- Rocket battery: TOS-1A, 24 × 220 mm unguided HE rockets, 0.25 s apart, 48 s refill (`launcherPolicy.isUnguidedRocket`).
- AC-130 mode (`GUNSHIP_WEAPONS`): 30 mm autocannon AP, 152 mm howitzer HE (`blastRadiusM: 22`), guided HE missile
  180 mm (`blastRadiusM: 18`), all real projectiles from the orbit. There are no 25 / 40 / 105 mm guns; the classes
  cover those calibres if they are added.
- Drone mode: the FPV warhead (`DRONE_WARHEAD`, HEAT 90 mm, `tracer: 'DRONE'`, no splash today). The recon drone is the
  same airframe spotting; it carries nothing.
- Gun Game ladder: 30 mm AP, 105/120 mm APFSDS, 152 mm HE (direct fire), guided HEAT missile.
- Hull deaths: ammo-rack detonation (`ammoRacked`, cause `ammorack` solo / `ammo_rack` network) and fire burn-out
  (cause `fire`) have no blast in the simulation today (the cook-off is presentation only).
- No artillery, mortars or air strikes exist.

Found on the way (fixed in P1 with receipts): the bunker (`crushMin: 999`, "shells stop on" it) is missing from
`collision.ts`'s dense-cover list, so every shell passes through and breaks it; the sandbag kinds publish no shell
collider at all.

## 3. Structural model

### 3.1 Identity: the structure group

Every placement that calls `addStructureCollision` (planned and recorded town buildings, row houses, ruins, yard
sheds), every landmark set piece (`landmarks/compose.ts`) and the relocated donors (Mangrove's wharf fishery, Ironworks'
service court) tags **all of its records** — the contact record in `obstacles`, every shell band in `colliders`, a set
piece's movement records — with one new optional field:

```ts
// world/collision.ts CollisionRecord
structureIdx?: number;     // the placement's group id, in build order (0, 1, 2 …)
structureRole?: 'building' | 'setpiece' | 'fixed';   // absent = 'building'
```

The shard packs them as `g` and `gr` (`tools/headlessWorldCollision.mjs packCollisionRecord`;
`headlessCollisionWorld.unpackRecord` reads them; the codec already passes unknown keys through). Every shard is
recaptured once with `node tools/capture-world-collision-manifests.mjs --node` (record order and counts unchanged;
only the bytes and digests of `index.json` move). A shard without `g` (an older capture) has no structures: buildings
stay indestructible there and the authority logs it once.

`fixed` marks what must never move: a set piece's bridge or deck (a movement record a route can depend on). A
`setpiece` is a landmark (§3.2). The authority's **structure id** is the group id; peers whose world is laid out
otherwise (the mobile tier, Frontline Assault's trench variant) resolve it by identity (§8.4).

### 3.2 The structure record (derived, not stored)

`sim/structureDamage.ts buildStructureTable(obstacles, colliders)` derives one record per group at match start, from
the records alone, identically in the solo world (the rendered build) and on the host (the shard):

| Field | Derivation |
|---|---|
| footprint | minimum-area oriented rectangle around the contact record's parts (rotating calipers over their convex hull): centre `cx, cz`, half extents `hw, hd`, `yaw` |
| `baseY`, `topY` | contact record's `min[1]`; highest shell band's `max[1]` |
| built volume `V` | Σ over shell bands of (part area × band height), m³ |
| mass class | `fixed` role → indestructible; `setpiece` role or `V ≥ 20,000 m³` → `landmark`; `V < 200` → `shed`; `V < 2,500` → `house`; else `large` |
| hit points | `HP = 0.72·V^0.72` structure points (SP), floor 10: shed 60 m³ → 13.7, house 600 m³ → 72, warehouse 7,200 m³ → 431, landmark 50,000 m³ → 1,742 (tuned to the feel targets in §5) |
| records | indices of its contact/movement records (obstacles) and shell bands (colliders) |

Measured on the 33 recaptured shards (the table built from their records, 2026-10-07): 1,410 structures — 933 houses
(hit points p10 37, median 80, p90 167), 358 sheds (10 / 16 / 27), 97 large (207 / 247 / 630) and 22 landmarks
(median 1,004); Ruinspires 392 (330 houses, 31 large, 10 landmarks), Blackglass 147, Steinburg 138 (96 houses, 42
sheds), Cliffbridge 107, Verdant 9, the Moon none.

**Landmarks are breach-only.** A landmark (a cathedral, a fortress gate, a dam house, an airfield hangar set piece)
reaches `breached` and stops there: its integrity floors at 5 %, it never collapses, its collision never swaps in P1.
P2 lets its sections fall (a spire's upper floor, a roof) without removing the whole. Reason: a landmark is a map's
anchor and its routes' reference; flattening one changes the map, and its collapse would be the largest single sim
and render spike in the game.

### 3.3 Stages

| Stage | Integrity (HP left / HP) | Sim effect (P1) | Presentation |
|---|---|---|---|
| `intact` | > 0.70 | — | — |
| `damaged` | ≤ 0.70 | none | cracks, broken windows, dust |
| `breached` | ≤ 0.35 | none in P1; P2: the struck section's holes pass shells and sight | holes, missing panels |
| `collapsed` | ≤ 0 | contact and movement records `crushed`, shell bands `dead`, rubble mound joins the ground (§7), nav refreshed (§6) | the collapse, the rubble, the dust cloud |

Stages only advance. A blow that crosses two thresholds emits one event per stage crossed, in order.

### 3.4 Sections (P2)

Landed off on `feature/destruction-sections` (2026-10-08) behind the ruleset's `sections` flag (§9:
`SECTIONS_SWITCH`, off in every mode until its gates pass). `sim/structureSections.ts` derives a structure's sections
from its collision records alone (a host has no rendered kit), on its first blow:

- **The eaves**: the top of the highest half metre whose shell bands' plan area is at least ¾ of the widest (a pitched
  roof's staircase of strips falls under it; a flat roof keeps its last half metre), at least a storey (or 60 % of a low
  shed) above the base. **Storeys**: the walls below the eaves in bands of 3.2 m, at most six.
- **Sections**: a wall section is a face of the footprint rectangle over one storey, `storey · 4 + face` (faces 0 and 1
  the +/− forward ends, 2 and 3 the +/− across sides, across = (cos yaw, −sin yaw)); the roof is `storeys · 4`.
- **Hit points**: twice the section's share of the envelope (walls' area plus the roof's plan), between 5 % and 30 %
  of the structure's: a 10 × 8 m two-storey house's side panel 20 %, its end panel 16 %, its roof 30 %. A section takes
  the blows that land in it at full weight; **the whole still takes every blow at full weight too** (P1's stage tuning
  stands: six 125 mm HE rounds still bring the house down; its panel falls at the first or second in it, its roof at the
  second). The roof and three faces of the top storey stay under the whole's hit points, so a storey can drop before
  the building comes down — on a house only just, on a large building or a landmark long before.
- **Which section a blow strikes**: the one at its point (quantized to the millimetre first, so a peer classifies it
  the same): above the eaves the roof, else the face whose plane is nearest over the storey of its height; a point more
  than 1.2 m inside every face below the eaves (the floor of a room a round entered by) strikes none. A direct hit
  strikes its section with its blast's points and hole; a burst within the blast law's contact zone (0.6·W^⅓) of a
  structure strikes its nearest section with its points (no hole: splash does not punch through); a penetrator strikes
  with its kinetic points and its hole; a ram strikes the section at its contact (no hole).
- **Holes**: a blast's radius `0.45·(W·structureFactor)^⅓` (125 mm HE 0.68 m, the gunship's howitzer 0.85 m, an FPV
  warhead 0.42 m), a penetrator's `0.0035·calibre` (§4.3), a shaped charge's the larger of the two (one hole); scaled by
  the walls (timber 1.3, mudbrick 1.15, masonry 1, concrete 0.7), at most 1.6 m and half a storey, at least 0.1 m (less
  is a mark). A wall hole is a disc on its face — its centre along the face, its height, the struck surface's depth (a
  ray passes it within 0.8 m of that depth) and its radius — whatever storey's section it opened in; a roof hole is a
  vertical cylinder through the roof. Four slots a section, never reused (the log only grows); a point already in an
  opening opens nothing new.
- **Falls** (`sectionDown`): a section at zero falls. A wall panel opens from its stub up to its storey's top — the
  ground storey keeps its lowest metre (cover), an upper storey's panel goes to its floor line. The roof opens
  everything above the eaves. **Then what it brings**: a roof whose top storey has three faces down comes down; with the
  roof down, a top storey with three faces down drops whole (its standing faces fall; that last fall carries
  `storeyDown`), and nothing stands above its floor line (`capY`: the top while the roof stands, the eaves once it fell,
  a storey's floor once it dropped, the ground storey's stub tops last). A landmark loses sections, never the whole.
- **The collapse, seen** (2026-10-08; wave 277: "the building is never seen to come down"): with sections on, a
  structure whose whole crosses collapse comes down top first before its swap — the roof if it still stands at the next
  tick, then each storey from the top, each the time its height takes to fall (`collapseStoreyTicks`: √(2h/g) rounded up,
  a 3.2 m storey 49 ticks, 0.82 s; at least 18; the FX lane animates each drop over it), its standing faces falling with
  it (the last one's breach carries `storeyDown`: the kit's heap on that floor line), the ground storey to its stubs —
  and once the ground storey has landed (its own fall) and 12 ticks more, its collision swaps, its heap rises and its
  `collapsed` stage releases (that event carries
  `sections: true`: the presentation's collapse lays the final pile without throwing pieces from the full height, since
  every storey threw its own). A three-storey house: the roof at once, the storeys 0.82, 1.63 and 2.45 s later, the swap
  at 3.47 s (no building-collapse footage in the reference set; a storey's free fall is the floor on its timing). Meanwhile further blows add nothing, a hull ramming it drives through (it yields at full speed, as P1's one-tick
  wait did), and shells and sight lines meet what still stands. A late joiner's settled log and a resumed host lay the
  collapse down at once (a cascade in flight ends there). Sections off: one event and the next tick's swap, as in P1.
  `sim/collapseCascade.selftest` pins it.

The openings are written into the structure's `StructureOpenings` (`world/collision.ts`), which every one of its shell
bands points at once something opens (`CollisionRecord.openings`); the world raycasts read them (§6).

## 4. Blast and impact model

### 4.1 The munition blast catalog

`sim/munitionBlast.ts munitionClassForShell(spec, { rocket })` classifies every shell; `munitionChargeKg(spec, class)`
gives its TNT-equivalent charge; the class profile (in `destructionEvents.ts MUNITION_PROFILES`) gives the factors.

| Class | Members | Charge W (kg TNT) | Structure factor | Crater factor | Penetrator |
|---|---|---|---|---|---|
| `small_arms` | KE < 15 mm (roof machine guns) | 0 | 0 | 0 | — |
| `autocannon_ap` | AP / APCR / APFSDS 15–57 mm (IFV cannons, the gunship's 30 mm) | 0 | 0 (kinetic only) | 0 | yes |
| `autocannon_he` | HE 15–57 mm; HEDP / HEI rounds by name | `1.8·(cal/100)³` (30 mm: 0.05) | 1.0 | 0.6 | — |
| `kinetic` | AP / APCR / APFSDS ≥ 57 mm | 0 | 0 (kinetic only) | 0 | yes |
| `heat` | unguided HEAT | `1.35·(cal/100)³` (120 mm: 2.3) | 0.6 | 0.45 | yes |
| `atgm` | guided HEAT | `0.98·(cal/100)³` (152 mm: 3.4) | 0.7 | 0.5 | yes |
| `he` | HE / HE-FRAG / HE-ABM 57–149 mm | `1.8·(cal/100)³` (125 mm: 3.5) | 1.0 | 1.0 | — |
| `hesh` | named HESH (typed `HE`) | `3.0·(cal/100)³` (120 mm: 5.2) | 1.6 | 0.7 | — |
| `smoke` | named Smoke / WP (typed `HE`) | 0 | 0 | 0 | — |
| `howitzer` | unguided HE ≥ 150 mm; the gunship's howitzer | `1.95·(cal/100)³` (152 mm: 6.8); explicit `blastRadiusM` → `(R/8.1)³` (gunship 22 m: 20) | 1.0 | 1.15 | — |
| `missile` | guided HE | explicit `blastRadiusM` → `(R/8.1)³` (gunship 18 m: 11); else `1.8·(cal/100)³` (152 mm: 6.3; Stinger 70 mm: 0.6) | 1.0 | 1.0 | — |
| `rocket` | unguided launcher rounds (TOS-1A) | `1.8·(cal/100)³`, capped 8 kg (220 mm: 8) | 0.9 | 0.9 | — |
| `drone_fpv` | `tracer: 'DRONE'` (the FPV shaped charge) | 1.2 | 0.7 | 0.5 | yes |
| `cook_off` | ammo-rack death of a hull | `0.15·tons`, 3–12 kg (60 t: 9) | 0.8 | 0.6 | — |
| `fuel` | fire death of a hull | 4 | 0.3 | 0 | — |

Cook-off and fuel blasts are new in the simulation and act on structures, light props and the ground only: they never
damage a tank (tank balance is unchanged).

The `(R/8.1)³` rule keeps the gunship's gameplay-sized blasts (22 m and 18 m, five times a tank shell's) consistent
with the charge law the rest of the catalog uses. The rocket cap keeps one TOS-1A salvo (24 rounds, 48 s refill) from
levelling a district in one press; a salvo still brings down a house block.

### 4.2 Blast on structures

For every structure whose footprint lies within `6·W^(1/3)` of the burst (a 16 m bucket grid of footprints), with `d`
the distance from the burst to the structure's nearest surface (the footprint rectangle in x/z, the `baseY..topY` span
in y) and the scaled distance `Z = d / W^(1/3)`:

```
SP = 3.5 · W · structureFactor · g(Z) · rules.structureDamageScale
g(Z) = 1 for Z ≤ 0.6;  (0.6 / Z)^2.2 for 0.6 < Z ≤ 6;  0 beyond
```

A contact burst of a 125 mm HE shell deals 12 SP (a 600 m³ house is damaged by the second, breached by the fourth and
down by the sixth); a 152 mm howitzer shell 24; the gunship's howitzer 70 (a house and a little more); its missile 38;
an ATGM 8; an FPV warhead 3; a cook-off beside a wall 25. A near miss
falls off fast: the 125 mm shell 3 m from a wall deals 0.9 SP. Blasts are about direct hits; splash does not level
blocks.

### 4.3 Kinetic and shaped-charge strikes

A penetrator that strikes a shell band deals `SP = 0.004 · pen100Mm · (cal / 100)` (120 mm APFSDS, 600 mm: 2.9 SP;
30 mm AP: 0.07) and, from P2, opens a hole of radius `0.0035·cal` m (120 mm: 0.42 m; 30 mm: 0.1 m) in the struck
section. A HEAT or ATGM jet adds its blast (§4.2) at the strike point.

### 4.4 Ramming

A hull's hard contact with a structure's contact or movement record (the obstacle solver's existing `hard` contact,
recorded per entity as the structure it pressed) is priced by the impact system's crash: when `resolveHullImpact`
prices a crash on the accumulated closing speed `v`, the structure takes

```
SP = max(0, E − E₀(material)) / 40,   E = impactEnergyKj(massTons, v) = ½·tons·v²   (kJ)
```

**Scuff energy, by material (2026-10-08, the coordinator's ruling: a deliberate ram breaks a wall, a scrape does
not).** E₀ is the energy a wall's face absorbs crushing over a hull's bow before the wall loses section: a glacis or
nose block on the wall is about A = 2 m² (2 m × 1 m), and the face can lose d = 2 cm (render, the faces of the units)
without the wall losing strength, so E₀ = σc · A · d with the face's crushing strength σc:

| Material | σc | E₀ | A 50 t hull scuffs up to | Which structures |
|---|---|---|---|---|
| timber and sheet | ≈ 0.75 MPa (cladding and studs give) | 30 kJ | 1.1 m/s | every shed |
| mudbrick under render | ≈ 1.5 MPa | 60 kJ | 1.5 m/s | houses of the earth styles (wadirum, ksar, siwa, navajo, kolkhoz) |
| brick and stone masonry | ≈ 7.5 MPa | 300 kJ | 3.5 m/s | houses of every other style, and every large building and landmark |
| reinforced concrete | ≈ 27.5 MPa | 1.1 MJ | 6.6 m/s | the concrete style's houses, halls and landmarks (glencanyon) |

A host has collision records only, so the material is the map's architecture style for its houses
(`sim/structureMaterial.ts wallMaterialForStyle`, the earth list the default kit reads too), timber for sheds, and
nothing softer than masonry for halls and landmarks (`structureMaterialFor`). The coordinator's 1.3 m/s bump (42 kJ)
scuffs masonry; a manoeuvring hull that corners into a wall at 2–3 m/s scuffs it; a ram at speed breaks it. One point
per 40 kJ above the scuff keeps §5's feel on a masonry house: a 60 t heavy at 9 m/s → 53 SP (breaches a 600 m³ house);
at 12 m/s → 101 (brings it down; so does a second 9 m/s ram); a 37.5 t medium at 8 m/s → 23 (damages it); a 40 t
medium at 6 m/s on a timber shed → 17 (it comes down).

**Bots don't drive into buildings (2026-10-08, the coordinator's ruling: the same law for bots and players, and a bot
cornering into a wall is a behaviour defect).** All-bot Steinburg (10 matches, 7 v 7, seeds 32000–32009) put 373 of
428 stage changes on rams. A trace of every ram blow (the drive goal, the steer point, the route plan, the hull's pose
and input over the last seconds) named three causes, all in `game/ai.ts`'s local steering, not the planner:

- **Corner hops checked against one box.** The router chose its corner, and checked the lane to it, against the one
  box on the straight line to the goal. Hops ran across or beside the next shed or house: hulls at 6–12 m/s on a
  corner leg that clipped a shed beside the corner, or a corner inside a shed built against the house.
- **A pivot that rolled.** A bearing more than 1.2 rad off was turned at 0.3 throttle, which rolls a hull forward at
  3–4 m/s through a 4–5 m arc with no obstacle check.
- **No stopping distance.** Nothing kept a hull from reaching a wall faster than it could stop, forward or in reverse
  (backoff reactions reversing into sheds at 5–7 m/s).

The fixes:

- A corner whose cell or lane meets another solid loses to a clear one. A cell beside another solid first moves out
  along the corner's diagonal. With none clear, the old choice stands.
- Beside a solid, the pivot creeps: its drive is cut above 1.5 m/s.
- `finishStep` brakes a hull, forward or in reverse, whose travel lane (its width either way) meets a solid within its
  stopping distance (planned at 3.5 m/s², under every hull's brake cap). It acts only above 1.5 m/s: a 50 t hull at
  1.5 m/s does under a point to a shed. The gun nudge keeps its own dead-leg law.

The same census after: 107 stage changes, 85 from shells and blasts (kinetic 57, blast 28) and 22 from rams. Matches
run 322 s on average against 294 s. battlePacing's core gate passes: 132 matches, median 199 s, p10 155 s, none inside
120 s, 1 at the cap.

**A structure that the ram brings down yields** (as a crushed prop does): when the points of the hull's closing speed
along the contact reach the structure's remaining hit points (or it is already coming down), the obstacle solver lets
the hull through, the ram is priced and the collapse queued, and the hull keeps `√(1 − E_abs / E)` of its speed, where
`E_abs = E₀ + 40 kJ × remaining HP` is what the structure took and `E = ½·m·v²` the hull's energy; no crash is
priced on the hull. A structure that holds is a hard surface: the hull takes the impact law's crash and the structure
takes the ram. Measured (destructionParity, the authority on verdant): an M1A2 at 18.4 m/s through a 94 HP house
brings it down, keeps most of its speed, takes no damage and drives on; the same hull into an intact large building
crashes as into a wall.

### 4.5 Craters

Every explosive burst on terrain stamps a crater:

```
R = 1.1 · W^(1/3) · craterFactor · rules.craterScale   (rim radius, m, clamped to 6)
depth = 0.35·R,  rim = 0.12·R,  seed = the authority RNG's next u16
```

125 mm HE: R 1.65 m, 0.58 m deep. 152 mm howitzer shell: 2.4 m. Gunship howitzer: 3.4 m, 1.2 m deep. Gunship missile: 2.5 m.
TOS rocket: 2.0 m. Kinetic and small-arms rounds dig nothing. A crater with `R < 1.6 m` (less than 1.2 terrain lattice
cells) is a presentation-only mark (`deforms: false`); on hard road ground the depth halves; on water or a bridge deck
nothing deforms.

## 5. Damage stages per mass class

Tuned 2026-10-07 to the coordinator's feel targets (every blow shows; a house damaged after one or two tank HE rounds,
breached after three or four, down after about six or one gunship howitzer shell and a little; a shed to one or two
HE rounds or a medium hull at 5–6 m/s; a heavy hull at 8–10 m/s breaches a house and a second ram or 12 m/s brings it
down), to be settled by the pacing and fairness runs (§12):

| Class | HP (typical) | Damaged at | Breached at | Collapses | Typical killers |
|---|---|---|---|---|---|
| shed (60 m³) | 13.7 | 9.6 | 4.8 | yes | two 125 mm HE; one 152 mm shell; a 40 t hull at 6 m/s |
| house (600 m³) | 72 | 50 | 25 | yes | 125 mm HE: damaged 2, breached 4, down 6; the gunship howitzer and a little; a 60 t hull at 9 m/s breaches, at 12 m/s (or twice at 9) it comes down |
| large (7,200 m³) | 431 | 302 | 151 | yes | seven gunship howitzer shells; a TOS-1A salvo on target |
| landmark (50,000 m³) | 1,742 | 1,219 | 610 | **no** (floor 5 %) | — |

Collapses are queued: at most one structure changes collision per tick (FIFO in authority order); a second waits for
the next tick (16.7 ms: a howitzer round that brings down three sheds swaps them over three ticks). HP and the stage
transition are decided at the blow's tick; only the collision swap and its event can lag. One a tick because a
collapse's work is 1–4 ms of CPU (§10), most of it the route grid's refresh round the footprint.

## 6. Collision, line of sight and navigation

- **Collapse** sets `crushed` on the structure's contact and movement records (movement, the support field and the
  route grid skip them) and `crushed + dead` on its shell bands (shells and sight lines skip them). The grids are not
  rebuilt: flags, as for every other destroyed record. The rubble mound joins the ground (§7).
- **Openings** (P2, §3.4): the world raycasts' narrow phase is one function, `nearestColliderHit` (`world/collision.ts`),
  run by the solo world (`world/map.ts`) and the headless one (`world/headlessCollisionWorld.ts`) alike; shells,
  spotting's `hardLos`, the bots' sight and the aim all read it, so they open together. A structure whose bands point at
  openings answers as a whole, once per ray (`rayStructureOpenings`): a **hollow box** (its footprint rectangle, base to
  top). The ray's first surface of the structure stands unless it lies in an opening (or the ray starts inside); then the
  ray crosses the room and stops on the inner face it leaves by (its normal facing the room) — unless that point is in an
  opening too, when it passes the structure; the floor never opens. A round through a hole bursts on the far wall's
  inner face (and strikes that section from inside); two holes on one line pass it. Movement is untouched: a fallen
  panel's contact record still stands (its stub is cover), and the route grid does not change until the collapse.
- **Hulls on or in a collapsing structure**: a hull standing on the roof loses its support and lands on the rubble
  (the impact law prices the fall); a hull inside an open-plan footprint is lifted by the mound like any slope (the
  mound under a hull's footprint at the collapse tick is capped at its belly + 0.4 m, so nothing launches).
- **Bots** read terrain crests and the world raycast live, so cover and sight lines change by themselves. The cached
  piece is the route grid: `grid.refreshArea(minX, minZ, maxX, maxZ)` (botRoutePlanner.ts) re-reads, from the build's
  own per-cell and per-edge rules, the cells within 3.5 m of the heap's extent (blocked, height, ground, liquid), the
  grade and liquid of their edges, the hull edges and bends within reach (clearance + the widest bend + a cell) and
  the components, and marks the wreck overlay for a full re-test. The solo step and the authority call it with the
  same extent (the footprint plus the heap's skirt). Receipt: the refreshed arrays equal a grid built from scratch on
  the changed world, byte for byte. Routes in flight are replanned on their cadence.
- **Concealment**: a felled tree's canopy disc (`ConcealerDisc.dead`, spotting.ts `fellConcealersAt`) stops concealing,
  whether a hull, a shell or a blast felled it; a cached world's next battle restores them. Structures never
  concealed (they block sight outright through their shell bands).
- **Light props in a blast**: a burst of 2 kg or more fells the crushable props whose centre lies within
  `1.2·W^⅓` of it (a 125 mm HE round 1.8 m, the gunship's howitzer 3.3 m), nearest first, at most six a blast, through
  each sim's own destroy seam (`world_prop_destroyed` with cause `blast`), at the end of the step in both sims.

## 7. Ground deformation (craters and rubble)

`sim/terrainDeformation.ts` holds a per-match overlay of stamps:

- **crater**: a bowl `−depth·(1 − (r/R)²)²` inside `0.8 R` blending into a rim `+rim·exp(−((r − R)/0.35R)²)`, ragged by
  `seed` (a three-harmonic angular wobble of ±8 %), influence radius `1.6 R`;
- **rubble**: a mound over the structure's footprint rectangle, height `clamp(0.18·(topY − baseY), 0.6, 2.6)` m on the
  inner 70 %, a cosine skirt `max(3, 2.2·h)` m wide beyond the footprint edge (grade under 25 %: every hull climbs it).

Stamps are bucketed on a 16 m grid (64 × 64 heads, ≤ 8 stamps per bucket). The sum is clamped to [−2.5, +3] m.

**Sampling.** The match's height field is wrapped once (`createDeformedHeightField(base, overlay)`; the authority keeps
exposing the supplied base as `match.heightField`, the wrapper is its internal ground; the solo step keeps one wrapper
per cached world and resets its overlay every battle):
`getHeightAt` and `getHeightAtFast` add `overlay.offsetAt(x, z)` (one bucket read when the bucket is empty, the common
case); `getContactHeightAt` adds the offsets of the containing triangle's three lattice vertices with the same
barycentric weights (`terrainContactSurface.ts`'s lattice and diagonal), so the contact surface equals a mesh whose
vertices moved by `offsetAt(vertex)` — exactly what the presentation draws; `getNormalAt` differentiates the wrapped
height. The wrapper is per match: the authority's terrain cache and the solo world cache keep the base untouched, so
no stamp leaks into the next battle or another match in the same process.

**Bounds.** At most 160 craters per match deform the ground (`rules.maxCraters`); the rest, and any crater whose bucket
is full, are marks. Rubble mounds are one per collapsed structure. The overlay never shrinks within a match.

**Digging (P3, landed 2026-10-08; off in every mode until the render follows).** `destructionMatch.shellWorldHit` takes
`groundBurst`: true when the round burst on the terrain itself (no record struck) and not on water (`shellHitsWater`,
the same test in both simulations). The crater law (§4.5) sizes it; under `CRATER_DEFORM_MIN_RADIUS_M` (1.6 m: a
125 mm HE round digs 1.6–1.7 m, a 105 mm one does not) it is a mark, and so is any burst on hard ground (roads, bridge
decks, ice: `getGroundType`), the fifth and later deforming craters of a tick (`CRATERS_PER_TICK` 4) and those past
`maxCraters`. A crater is quantized as the wire carries it (millimetre centre, centimetre radius, millimetre depth and
rim, a 16-bit seed from its centre) before it is stamped, logged (`kind: 'crater'`) and handed back
(`drainCraters` → solo `terrain:crater`, the authority's `terrain_crater`, public like a stage). A restored log stamps
the same ground; a peer stamps each crater once, from its event or, settled, from the log (an owed event keeps the log
from taking it), and its prediction rides the bowl. No route-grid refresh: a bowl 1.6–6 m wide under a 25 m cell's
sample point changes nothing a route reads. Receipt: `sim/destructionCraters.selftest.mjs`.

Every mode's ruleset keeps `craters: false` until the drawn terrain follows the overlay (the render below): a bowl the
simulation digs under a flat drawn ground would sink hulls into it. A tool or a test passes its own rules to try them.

**Not yet (P3):** the world raycasts (shells and sight lines) march the base terrain, not the overlay: a heap stops
nothing a ray passes over and a crater's bowl is read at the old ground. Heaps are at most 2.6 m and sight lines run at
hull height, so P1 lives with it; P3 hands the deformed field to the world's terrain march.

**Render (P3).** The ground mesh is updated in place: the lattice vertices inside a stamp's influence, on every
terrain LOD level that covers them, take `offsetAt(vertex)`, their normals are recomputed locally, and the position
and normal attributes are uploaded with `addUpdateRange` (scratch arrays sized once; no per-frame allocation). Crater
surfaces (soil colour, ejecta, scorch) are the presentation lane's, on `terrain:crater`. Rubble's look comes from the
building's own kit (§16): the `collapse` generator seats its pieces on `rubbleMoundHeightAt`, so tracks meet what the
eye sees.

## 8. Multiplayer

### 8.1 Events

| Wire kind | Bus (solo / presentation) | Payload (`destructionEvents.ts`) | Who receives it |
|---|---|---|---|
| `structure_stage` | `structure:stage` | `StructureStageEvent` | every viewer (world state names no shooter) |
| `structure_breach` (P2) | `structure:breach` | `StructureBreachEvent` | every viewer |
| `terrain_crater` | `terrain:crater` | `TerrainCraterEvent` | every viewer when it deforms; a mark follows its shell's observable-shooter rule |
| `shell_impact` / `shell_hit` (existing) | `shell:expired` / `shell:hit` | + `munition`, `chargeKg` | unchanged rules |

`canObserveEvent` admits the new kinds as it admits `world_prop_destroyed`. A building breaking is visible world
state; its event carries the blow's point and push direction but never the shooter.

### 8.2 Settled state

The destruction log (`DestructionLogEntry`: stage, breach, crater) only grows within a match, so it travels like the
destroyed-prop list: a snapshot carries it whole in a keyframe and the entries after its baseline's length in a delta
(wire 4: `SNAPSHOT_FLAGS.HAS_DESTRUCTION`, then the base length and the entries, `src/mp/wire/destructionLog.ts`; a
stage entry 11–13 B with its footprint centre, a breach 20 B, a crater 19 B; a delta whose base disagrees with the
client's baseline is refused). The host actor copies the authority's log (quantized as the wire carries it) into every
frame when it grows. The client keeps the newest frame's log and the stages its event queue still owes
(`ReliableEventQueue.isStructurePending`, as `isObstaclePending` does for prop falls).

On the peer, `src/mp/presentation/destructionMirror.ts` lays the authority's stages on the peer's own world: a live
`structure_stage` animates (`structure:stage` on the bus, this world's structure id), the log lays down settled
(`settled: true`) every stage the seat did not see happen except one whose event is still owed; a collapse flips this
world's records (the predicted hull stops meeting them, the seat's rays pass) and raises the heap on the prediction's
ground (a wrapped height field under `createPredictionWorld`). A world laid out otherwise finds the structure by its
footprint centre (5 cm, the same class) — every stage entry and event carries it — and never another in its stead.

Breaches (P2) travel the same way: the authority releases at most six a tick (`BREACH_EVENTS_PER_TICK`) after the
tick's stages, each a `structure_breach` and a `breach` log entry (20 B, 28 B with the footprint centre: the section
byte's high bit says it follows). Their centres are quantized as the wire carries them before anything opens, so a peer
opens exactly what the authority opened: the mirror (`applyBreachEvent`, and `applyLog` for what it did not see) opens
the hole in its slot or the section's fall in the section at the point on its own structure (`restoreBreach`), once —
a filled slot or a fallen section is the same breach again, so a live event and the log that names it later open it
once — and raises `structure:breach` with its own section and `storeyDown`. A `structure_breach` still owed holds back
its structure's log entries (`isStructurePending` counts both kinds); the migration retain keeps breach entries beside
the stages.

### 8.3 Host migration

The sealed migration keyframe's frame carries the log. `RetainedMigrationState.destruction` keeps every stage event the
seat received (as `fallen` keeps prop falls; a link reset clears the queue, never this), and `resumeStateFromRetained`
takes the longer log of the keyframe and the newest frame and merges them in. `applyResumeState` calls
`authority.restoreDestruction(log)`: the log is kept verbatim (its order and length continue), stages and collapses
(records, heaps, the route grid) applied without events. Hit points are not on the wire: a damaged structure resumes at
its stage's upper bound (70 % or 35 %), a small gift to the building, documented and bounded. A restored breach opens its hole or its fall as the
authority did (P2); a section's hit points are not on the wire either: a holed section resumes whole.

### 8.4 Identity across layouts

Every event carries the structure's footprint centre and class (`StructureIdentity`). The presentation resolves the
id against its own world's structure table when the layouts match (desktop tier, the mode's own battlefield), else by
identity (centre within 5 cm, same class), else applies nothing (the host's world still decides). Craters are
positions, valid in any layout.

**The authority plays what the clients build (2026-10-08).** A mode's battlefield variant is a ruleset rule
(`MatchRuleset.terrainVariant`, `terrainVariantFor(mode)`: Frontline Assault's `'assault-trenches'`). Every client
already built it; the hosts built the base map — hulls on uncarved ground, none of the trench works' records (on
Verdant the variant differs by 3,390 obstacle records each way: the carving moves every placement after it). Now the
browser host (`loadCollisionWorld(…, { variant })`) and the dedicated actor (`createDedicatedWorldCollision(…,
{ variant })`) load the variant's own shard over the variant's field, so a desktop client of either shares the
authority's indices (`authorityObstacles`; a phone's too since its placement split, below). The
clients choose the battlefield from the same table (`main.ts` for the solo battle, `mp/session/browserComposition.ts`
for the network session: `terrainVariantFor`), so client, browser host and dedicated actor agree by construction. The
33 variant shards are 55 MB of JSON (17 MB compressed) beside the base 50 MB, published content-addressed under
`/mp-collision/<map>@assault-trenches.<sha>.json` with the base shards' immutable routes; a host fetches one.
Receipt: `src/mp/host/frontlineVariant.selftest.mjs`.

**A phone places what the desktop places (2026-10-08, the coordinator's ruling).** A phone built every map with fewer
trees, bushes and clutter and one hulk fewer, and every draw after the first difference shifted the shared streams. A
phone shared 5.7 % of the desktop's indices across the 33 maps, so its views read the destroyed list through identities.
Now every tier places at the desktop's richness: `treeRichness`, the bushes, `environmentRichness` and the wreck count. A
phone's saving is in how a record draws, never in which records stand.

- Every desktop layout is unchanged, byte for byte, on all 33 maps.
- At the phone tier, 22 of 33 maps equal the desktop's shards index for index, and every concealer matches on every map.
- The other 11 waited on two kits that laid records out by tier, both fixed by their lanes:
  - the scenery lane's rock formations, which drew fewer stones on a phone and so other masses (Badlands, Coastal,
    Desert, Frontier, Monsoon, Orchard, Reservoir, Saltwind, Steinburg, Verdant): `visual/scenery-phone-masses`
    16469bc6a, a phone's formations collide with the desktop's stone set;
  - the regional rowhouses, whose phone builds moved their bands (Franconian on Steinburg, Sarajevan on Ruinspires):
    `visual/facades-phone-bands` c4c542d44, a phone's kit builds run their dressing muted, so the streams stay aligned.
- With both on this core, the phone tier matches **33 of 33** shards (2026-10-08). The check: `node
  tools/capture-world-collision-manifests.mjs --tier=mobile`. Receipt (three clean maps):
  `src/world/phoneLayoutIdentity.selftest.mjs`.
- `authorityObstacles` shares the indices on a phone now. An event whose record at its index is another prop still turns
  that off and finds its prop by identity, so a layout that drifts again degrades to the identity path. This needs both
  fixes in the build: land them before or with this flip.

### 8.5 Budget

The wire sends one EVENT message per viewer per tick and drops the whole batch above 64 events
(`MAX_EVENTS_PER_MESSAGE`). Destruction adds at most: 1 collapse + 4 other stage changes + 4 craters per tick (the
overflow of stage changes waits a tick in the authority's FIFO; craters past four in a tick become marks). The
reliable queue treats `structure_stage` (collapsed) and `terrain_crater` as heavy beats. Bandwidth: a full late-game
log (300 stage entries, 160 craters) is 3.3 KB in a keyframe.

### 8.6 Audits

The world-events audit (`tools/mp-world-events-audit.mjs`, its receipt in the core group) logs `structure_stage` like
`world_prop_destroyed` (keyed by what it names, not by its host) and judges it the same way: missing, duplicate, late,
wrong place, a stage older than the view animated, a stage the host never sent, and a stage the new host re-sends after
the migration. A scripted bot rams a verdant house at 14 m/s at the start of live play. First run (2026-10-07): the house
came down (damaged > breached > collapsed), 18 of 18 stage deliveries presented on 4 views, 0 re-sent by the new host;
every earlier check unchanged. The determinism audit hashes the destruction log beside the destroyed list, and
`src/sim/destructionShard.selftest` replays a ram on Steinburg's real shard bit for bit.

P2 (2026-10-08): the audit logs `structure_breach` keyed by what it names (`breach:<structure>:<section>:<hole>`, a
fall's hole 255) and judges it as it judges a stage: missing, duplicate, late, a breach older than the view animated, a
breach the host never sent, and one the new host re-sends after the migration. With the switch flipped (sections on),
the scripted ram's breaches presented on 3 views, 3 of 3, none re-sent by the new host; its stages 18 of 18 as before.
With sections off (every mode today) the host sends none and the earlier judgments are unchanged.

## 9. Per-mode rules

`MatchRuleset.destruction` (`sim/matchRuleset.ts`), read by the solo step, the authority and the rule cards:

```ts
readonly destruction: {
  readonly structures: boolean;          // buildings take damage and collapse
  readonly craters: boolean;             // explosions deform the ground
  readonly structureDamageScale: number; // multiplies every SP dealt
  readonly craterScale: number;          // multiplies crater radii
  readonly maxCraters: number;           // deforming craters per match
};
```

Craters stay off in every mode behind one switch, `CRATERS_SWITCH` in `sim/matchRuleset.ts`, until the switch-on gates
pass. The column says what each mode takes once they ship. **Sections**
(`readonly sections: boolean`, P2 §3.4) follow `structures` in every mode behind `SECTIONS_SWITCH`, off until their
gates pass (the receipts below, paired pacing and fairness, the determinism and world-events audits with sections on,
the cost of the openings-aware rays, and the motion strips of a wall panel coming down from a metre up, storeys dropping
and a round through a hole).

**The switch-on gates (crater-render-spec §F), on feature/destruction-craters (2026-10-08).** This branch is the core plus
the drawn terrain and ground cover (the ground lane, §B/§C) and the crater surface (the FX lane, §D). The surface drapes on
the contact surface plus the overlay's `contactOffsetAt`, which is what the drawn LOD0 shows.

| Gate | Result |
|---|---|
| Determinism audit, craters on (`tools/sim-determinism-audit.mjs --craters`; its receipt runs both) | identical over 3600 ticks, 7 craters dug |
| World-events audit (live, rejoin, reconnect, migration, return), terrain_crater judged like a stage | 4 dug, presented 12/12 on 4 views; 6 laid down settled for later views; none re-sent by the new host |
| battlePacing, paired against craters off on the same seeds | 127 of 132 matches identical; 5 change duration only, no winner; median 199.2 s and p10 154.6 s unchanged |
| Fairness, paired, 40 games a side on the three maps with the most HE ground bursts | Whiteout +5.0 points (2 winners changed), Polders 0 (0), Saltwind −2.5 (1); 26–31 craters per map |
| Barrage cost (ABCCBA off/on, live lighting, scene-pass guard) | queued |
| Motion strips (125 mm, the gunship's 152 mm and its walk, FPV, ATGM, a settled field at 30 and 80 m, snow, sand) | queued |

All-bot standard play digs few craters: bots fire HE at the ground rarely (0.1–0.8 craters a game). The AC-130's
howitzer and players' HE are where craters come from. A shaped charge (an ATGM, an FPV drone) leaves a mark and no bowl:
its crater stays under the 1.6 m dig radius.

| Mode | structures | craters | scales | Why |
|---|---|---|---|---|
| standard, realistic, capture the flag, zone control, gun game, juggernaut, infected, drone | on | on | 1 / 1 | the default |
| endless horde | on | on | 1 / 1 | no clock, no stall risk |
| frontline assault | on | on | 1 / 1 | the defenders' towns fall to the assault; trench variants take stamps on top |
| AC-130 | on | on | 1 / 1.25 | the mode is the gunship's craters |
| mars | on | on | 1 / 1 | low gravity changes nothing here |
| turbo ball | **off** | **off** | — | an arcade pitch: HE-only unlimited ammunition would crater the field and break the ball's physics |

## 10. Performance budgets

| Work | Bound | Budget |
|---|---|---|
| Structure table at match start | ≤ 392 structures (ruinspires), O(records) | < 5 ms once |
| A blast's structure query | 16 m buckets, footprints within `6·W^(1/3)` | < 0.02 ms |
| A collapse (flags, mound stamp, nav refresh) | ≤ 1 per tick | measured 1–4 ms CPU each (below) |
| Height query overhead | one bucket read | measured 2.3 % of a 7 v 7 tick (below) |
| Crater mesh update (P3) | lattice vertices in `1.6 R` on each LOD | < 0.3 ms per crater, no allocation |
| Memory | 160 craters + 400 mounds × 48 B; 8 KB buckets | — |

Measured with cost rule v3 (bots hidden, ABCCBA, nice 0, GPU < 0.6 ms and CPU < 0.38 ms means over 8 cycles) and a
collapse-spike probe: the worst frame of a scripted collapse, against the same frame without it.

**The simulation's side, measured in Node (2026-10-08, P1 head 0b866cff5, process CPU time; the machine at load
120–160, so absolute numbers run high).** A 7 v 7 all-bot authority on Steinburg, Ruinspires and Verdant:

- *The tick.* The destruction code proper (the match, the structure table: blasts, rams, the step) is 0.2 % of a tick's
  CPU (a sampled minute on Steinburg: 0.21 % on, 0 off). The ground overlay's wrapper (§7: every height read adds the
  overlay's bucket read) is 2.3 % on and off alike: it exists whatever the rules. Over the same 3,600 ticks the match
  with destruction on used 7.64 s of CPU and the one with it off 7.79 s (the battles diverge: shells fell props).
- *A collapse.* `restoreDestruction` applies a collapse as a live one does (records swapped, the heap stamped, the route
  grid refreshed round the footprint): median 1.8 ms on Steinburg (12 structures, 1.0–5.8 ms), 1.8 ms on Ruinspires
  (1.1–3.6), 2.4 ms on Verdant (1.0–10.9, its largest a loaded-machine outlier). A profile of 60 collapses: about 55 % the
  route grid's refresh (`hullComponentLabels` alone a quarter: the whole grid's components relabelled), 20 % its obstacle
  queries, 20 % its height samples, under 2 % the structure table and the heap. Hence one collapse a tick (§5); the
  browser's worst frame is the collapse-spike probe's to measure.
- *A ray through openings (P2, 2026-10-08, sections head 958ae7dbf).* The world raycast (shells, spotting, bots) with
  every house opened, its worst case: each structure holed and a third of them with a fallen panel, against the same
  40,000 rays with nothing open (process CPU, best of 5 passes). Steinburg 495 → 484 µs a ray (0.98 ×, noise),
  Ruinspires 417 → 474 µs (1.14 ×). Only an opened structure's records run the hollow-box test (§6); the hits agree
  ray for ray but one per map (a ray now passing a hole).

## 11. The presentation contract

`src/sim/destructionEvents.ts` (no imports): `MunitionClass`, `MUNITION_PROFILES`, `StructureStage`,
`StructureMassClass`, `StructureIdentity`, `StructureStageEvent`, `StructureBreachEvent`, `TerrainCraterEvent`,
`MunitionBlastEvent`, `DESTRUCTION_BUS_EVENTS`, `DESTRUCTION_WIRE_EVENTS`, `DestructionLogEntry`,
`DestructionSettledState`. Rules for the consumer:

- Animate only live events; lay `settled` ones down at their final pose, silently.
- Draw rubble and craters on the sim's own profiles (`rubbleMoundHeightAt`, `craterOffsetAt` in
  `sim/terrainDeformation.ts`, which is pure and light) so tracks meet what the eye sees.
- The world tags each structure's geometry at build time (P1): `userData.structureIdx` on every part, `aDamage` per
  vertex and the spans of every part in the merged buckets (§16.4), so a stage can cut, hide or swap exactly that
  building's pieces inside the merged buckets.
- Every stage's look comes from the building's own kit through the kit seam (§16); the presentation renders what the
  kit generators write.
- Explosion variety keys on `munition` and `chargeKg` of `munition:blast` (`MunitionBlastEvent`: class, charge, point,
  normal, `surface` terrain | water | structure | prop | tank | air, and `structureId` when the struck record belongs to
  a structure). One per detonation, raised before the event it belongs to, in both simulations:
  - solo (`game/state.ts`): a round meeting the world (`resolveWorldShellImpact`, before `shell:expired`; water by the
    map's mask), a round bursting on a hull (`resolveTankShellImpact`, surface tank, before its hits), a cook-off or a
    fuel fire (`announceDestroyed`, 1 m above the hull, before `tank:destroyed`; `cookOffChargeKg(weight)`,
    `FUEL_CHARGE_KG`). A penetrator, small arms and smoke raise none (`munitionBlastEventFor` returns null).
  - a ground burst that dug a crater (§7) carries its `craterId` (solo `munition:blast`; network `shell_impact`), so
    the presentation takes that burst's mark from the crater's own `terrain:crater` at the end of the tick.
  - network: `shell_impact` carries `munition`, `chargeKg` and `structureId`; every `shell_hit` carries `munition` and
    `chargeKg`, and the first one a round bursting on a hull makes (the direct hit's) carries `blast: [x, y, z, nx, ny,
    nz]`, splash hits none; `tank_destroyed` names the cause. `mp/presentation/battlePresentation.ts` raises the same
    `munition:blast` from them in the same order, the structure mapped to the peer's own world (the mirror's identity,
    §8.4) and water read from the peer's own mask.

- **Sections** (P2): `structure:breach` / `structure_breach` (`StructureBreachEvent`, the structure's identity with it):
  a hole (`hole` 0–3, `radiusM`, centred at x, y, z on the face whose outward normal is n; a roof hole's n is up) or a
  fall (`sectionDown`, `hole` 255, `radiusM` 0, standing at the section's centre on its face, with its span y0..y1;
  `storeyDown` on the fall that completes a storey). The presentation finds its kit's own section at the point
  (`seam.holeAt`) and builds it through the kit (`seam.breach`, `seam.sectionDown`, `seam.storeyDown`): the default kit's
  wall panel leaves a stub topped with a ragged course of the wall's own units, the room dark behind it, and throws the
  panel out and down in its own layers; a storey drop breaks its floor slab into the storey below. A match that plays
  sections says so on every `StructureStageEvent` (`sections: true`): a `breached` stage then cuts no hole of its own.
- **The Studio** films the sim's own: `game/studioDestruction.ts` runs one destruction match (sections on) over the
  Studio world's records — a wall strike opens the sim's hole and raises `structure:breach` as the solo step does, a
  round traced through the world afterwards passes it — and `reset` stands everything up for a scene load. A strike
  round meeting light cover (a hut, a fence, a tree, crates: `shellPassesThroughCollisionRecord`) breaks it with the
  world's own crush and flies on to the first solid record, as a battle round does (`studio.ts traceStrikeRound`); a
  scene starts from an intact world (the Studio's reset restores the world's broken props and felled trees).

## 12. Balance

Cover that disappears changes the game. The gates, every phase:

- `server/battlePacing.selftest.mjs` (132 matches) against the base: median, p10, shortest, the share inside 120 s and
  at the 900 s cap. A collapse must not create a time-limit stall (a bot route through a footprint that is now rubble
  must still resolve; a hidden hull behind a fallen wall must still be found).
- The 264-match tail with the PR-head comparison (`docs/DEVELOPMENT.md` "The pacing tail") before landing P1.
- Bots shoot at what they see; they do not shell buildings on purpose in P1. A later phase may let a bot that has no
  target and a known hider behind a house fire HE at the house.

## 13. Receipts

| Receipt | Proves |
|---|---|
| `sim/munitionBlast.selftest.mjs` | class per shell for the whole fleet and every mode ladder; charges; `g(Z)`; crater law |
| `sim/structureDamage.selftest.mjs` | table derivation from a shard (ids, footprints, classes, HP); stage thresholds; landmark floor; ram energy; collapse FIFO |
| `sim/terrainDeformation.selftest.mjs` | stamp determinism (same stamps → same bits), the lattice-consistent contact surface, bounds and clamps, wrapper isolation from the base |
| `sim/destructionCollision.selftest.mjs` | collapse swaps movement, shells and sight lines on the real verdant and urban shards; rubble climbable |
| `sim/destructionNavigation.selftest.mjs` | the route grid opens a collapsed block's cells, identically solo and authority |
| `sim/destructionCraters.selftest.mjs` | the dig law, marks, hard ground, the tick and match caps, the quantized log and its restore, both sims alike, a real HE round's crater stamped once on a peer and replayed bit for bit |
| `sim/structureSections.selftest.mjs` | P2: eaves, storeys and shares; a hole passes a ray to the far inner face, two aligned pass it; a panel falls to its stub, the roof, a storey after three faces (`storeyDown`); the tick's breach budget; a restored host, the wire, live and late mirrors open bit for bit the same; off in every mode, P1's tuning unchanged |
| `sim/destructionSections.selftest.mjs` | P2 in the authority for real: an M1A2's HE round holes a wall, its APFSDS round passes the hole and strikes the far wall from inside (sections off: it stops on the near wall), bit-for-bit replay; spotting sees through holes in both walls, not one; one narrow phase in both worlds |
| `sim/collapseCascade.selftest.mjs` | P2: a collapse comes down top first — the roof, the storeys a storey's fall apart (49 ticks at 3.2 m) each with one `storeyDown`, the swap and `collapsed` once the ground storey has landed (a fall and 12 ticks); shells meet what stands; a ramming hull drives through; sections off it is P1's single event; a restore mid-fall ends it once |
| `game/studioDestruction.selftest.mjs` | P2: the Studio films the sim's own holes (a strike, a round through the hole, reset) |
| `game/studioStrikeCover.selftest.mjs` | a Studio strike round breaks the light cover in its path and flies on to the wall behind; dense cover stops it; the Studio's pass-through law is `collision.ts`'s |
| `mp/wire` (extended) | the log round-trips, keyframe whole and delta additions |
| `mp/host/migrationState` (extended) | restore of stages and craters; nothing collapses twice |
| `tools/mp-world-events-audit` (extended) | the new kinds pass the audit's judgments; P2's breaches judged as stages are (§8.6) |
| `tools/sim-determinism-audit` (extended) | destruction in the hash |
| `world/destructionKit.selftest.mjs` | the kit seam and the world's tags, spans, depth materials and shadow touch (§16.7) |
| `sim/destructionParity.selftest.mjs` (extended) | the detonations raised alike in both sims; a real HE round's `shell_impact` names the house it struck |
| `mp/presentation/battlePresentation.selftest.mjs` (extended) | a peer raises `munition:blast` from the authority's events in solo's order, structure mapped, water by its own mask |
| `engine/shadowStaticCache.selftest.mjs` (extended) | the shadow epoch reaches the caster signature |

## 14. Phase plan

| Phase | Delivers | Gate |
|---|---|---|
| **P0** | this document; `destructionEvents.ts` (the presentation contract); `world/destructionKit.ts` (the kit seam, §16) | typecheck |
| **P1** | group ids in the build and the shards; the structure table; blast, kinetic and ram damage; stages; collapse (flags, rubble mound, nav refresh); solo and authority; the wire log, events, migration; the ruleset block; blasts break light props within reach; the kit seam's default describe and layouts, the `aDamage` tags and `world.structureDamage(id)` | receipts above, `npm test`, typecheck, pacing vs base, cost v3 + collapse spike, the world-events and determinism audits |
| **P2** | sections, holes that pass shells and sight, partial collapse (roofs, upper floors), landmark sections — landed off (`feature/destruction-sections`, 2026-10-08) | the same, plus the shell-through-hole and sight-through-hole receipts (`destructionSections`, `structureSections`) and the motion strips |
| **P3** | craters that deform the ground, the terrain mesh updated in place, crater log sync | stamp determinism, contact consistency, cost of a 152 mm barrage |
| **P4** | bots that shell a hider's house; concealment that follows felled trees | pacing tail |

## 15. Decisions taken (owner approved all work, 2026-10-07)

1. Landmarks are breach-only (§3.2); bridges and decks are fixed.
2. Rubble is ground (a terrain overlay mound), not a collision prism: the collision system has no ramps, and a prism
   taller than the 0.55 m step-up would be a wall.
3. Stages advance only; HP is not on the wire; a migrated host resumes a damaged structure at its stage's bound.
4. Turbo Ball plays without destruction; every other mode has it.
5. Craters smaller than the terrain lattice are marks only, so the visible ground and the contact surface never
   disagree.
6. Collision groups ride in the shards (`g`, `gr`): one recapture of every shard, no new list, no reordering.
7. Every damage stage is built from the building's own kit through one seam (§16); the core owns anatomy and default
   layouts, kits override, the presentation renders.
8. The §5 tuning follows the coordinator's feel targets (houses give way to a few HE rounds and to a hard ram); if
   pacing or fairness says it is too cheap, the large class's hit points rise first, not the houses'.

## 16. The kit seam: damage built from the building's own kit

> Owner, 2026-10-07: "destructible buildings and props need to be included in the buildings redesign, they need to look
> just as good as everything else."

Damaged, breached and collapsed states are never generic boxes or generic rubble. Every stage is built from the
building's (or prop's) own kit: wall breaks follow the material, roofs fall their own way, a breach opens the room
behind the wall, and the rubble is the building's own buckets, weather tints, timbers and tiles. The seam is
`src/world/destructionKit.ts`; the fracture builders live in or beside each kit.

### 16.1 Who does what

| Owner | Delivers |
|---|---|
| Core (this lane) | when and where: stages, holes (section, centre, radius), fallen sections, the rubble mound's profile; `describe` at build time and the anatomy store; the per-vertex tags (§16.4); the runtime seam `world.structureDamage(id)` that resolves each stage through the kit chain; the **default kit** (anatomy read from the parts, fractured from the building's own buckets) |
| Facades lane | the structure, regional and landmark kits: `describe` from the house grammar's own plan, and the fracture builders for their materials (below) |
| Scenery lane | prop kits: the type table's `broken` builders to the same standard, the props' `fracture` slots and `debris` |
| Presentation lane | renders what builders write: the damage batches (one dynamic mesh per bucket, the bucket's own material), the pooled debris (one instanced mesh per bucket and shape in use), the collapse animation, the hole cut (shader discard on the tagged vertices), the room's darkness, dust and sound |

### 16.2 What a kit hands over (`StructureDamageAnatomy`, build time)

Numbers and the kit's own layout handles, never geometry, in the **body frame** the kit drew in (house.ts: centred on
the origin, base at y = 0, ridge along +Z; faces front +Z, right +X, back −Z, left −X):

- **storeys**, bottom up: floor and ceiling heights, jetties (front, right, back, left), framed or not, the floor slab
  at the storey line (joists or a slab, their pitch);
- per storey, the **four face rects** (`DamageFace`: origin, u, out, width, height), each with its **wall bucket**,
  its **material layers** outermost first (render over rubble, a frame over its infill, concrete over rebar), its
  **openings** (kind, centre u, width, sill y, height, reveal, war wear), its **Fachwerk members** as segments
  (`FrameMember`: post, rail, brace, sill, plate, stud, strut; endpoints, width, depth) and its **masonry layout**
  (`MasonryLayout`: course boundaries, the block joints of each course, the tile UV of a face point — the facades
  lane's `masonryLayout` behind it);
- the **roof**: kind (gable, half-hip, hip, flat, shed; dome, spire, vault for landmarks), pitch, eave and ridge,
  slab thickness, covering (tile, slate, thatch, earth, sheet) and structure (rafters and battens, or a slab), batten
  and rafter pitch, its **slabs** as quads in their buckets;
- **chimneys** and the **plinth**;
- the **room** (its darkness, open shell or not), the **rubble** shares in the building's buckets and tints, the
  **remnant** (stub height, corners, chimneys);
- `kitPlan`: the kit's own plan (HouseSpec and HouseFrame) for its builders to read back, opaque to the core.

Sections: the anatomy numbers its own (one per storey and face, one for the roof) for the tags (§16.4). The core's
sim sections (§3.4) are derived from the collision records alone, so a host without the rendered kit has them; the world
maps an event onto the anatomy by geometry: a breach by its hole's point and normal (the face whose plane it lies on,
the storey whose span holds it), a fallen section by its face and height span (`StructureBreachEvent.y0..y1`).

**The default `describe`** (core) reads the parts by bucket when a kit gives no plan:

| Bucket | Fracture material |
|---|---|
| `stone`, `regionalStone` | `brick` when the style's stone surface is brick; `rubble` for fieldstone and rubble; else `stone` |
| `plaster`, `plaster2`, `plaster3`, `regionalPlaster*` | `plaster` over a core: `concrete` + rebar where the style pours its plaster2 (`surfaces.concrete`), `adobe` for the earth kits (wadirum, ksar, navajo), else `rubble` |
| `wood`, `structureWood` | `timber` + `infill` on a framed storey (the Fachwerk kits: franconian, hessian, eifel), else `plank` |
| `roof`, `regionalRoof` | by the style's roof surface: beavertail, pantile, canal → `tile`; slate → `slate`; sheet, asbestos → `metal`; shingle → `plank` |
| `straw` | `thatch` |
| `steel`, `structureMetal` | `metal` |
| `glass` | `glass`; `curtain` → `canvas` |

Tints come from the parts (their vertex colours in the weathered buckets, else white over the bucket's texture), so
the pile carries the building's weather. Storeys come from `h` and the shell bands (3 m a storey without a plan).

### 16.3 How each part fractures (the builders)

| Part | Fracture (default kit; a kit may override any) |
|---|---|
| Masonry | the break steps along the layout's courses and joints; broken blocks keep their tile UVs (`MasonryLayout.uv`); loose blocks as debris |
| Fachwerk | members snap at a point along their segment with a splintered cap and hang from their joints; infill panels drop out whole, leaving wattle-and-daub and lath edges in the frame |
| Plaster over rubble | a render lip round a core of rubble stones |
| Concrete | plates with rebar stubs at the break edge |
| Adobe | rounded, crumbled edges and clods |
| Breach | the dark backing behind every opening becomes a room: the floor plane, the floor-slab edge at the storey line, joist ends at the break's top; the rim in the wall's own layers, its units laid in courses over the band 0.75 r – 1.25 r where the presentation's blocky cut edge runs (0.8 r – 1.2 r); on a rendered wall the render broken back further, a shallow ring cut of 1.45 r (returned before the hole's cut, so the hole is the newest) with the core's units in it behind the render's plane; nothing stands proud of the wall (a tier that cuts nothing shows none of it); debris thrown along the blow |
| Damaged | spalled render patches, chipped arrises, cracked and missing glass (glass hidden, shards as debris), slipped tiles |
| Roof (P2 `sectionDown`) | a stripped patch shows battens and rafters (`emitRoofPatch`); a fall adds missing slab sections, a broken ridge and hanging rafters; thatch chars and slumps; an earth roof slumps between its beams; sheet bends |
| Collapse | remnants (wall stubs, corners, chimneys), a heap of chunk prisms in the building's own buckets with its weather tints plus timbers and roof tiles, seated on the sim's mound (`rubbleMoundHeightAt`), and the falling debris |

**The heap.** `rubbleMoundHeightAt(mound, x, z)` (sim/terrainDeformation.ts; `mound` = `{ cx, cz, hw, hd, yaw, heightM }`,
world frame) is the exact profile the simulation raises; in the body frame a kit calls
`bodyMoundHeightAt(anatomy, x, z)` (destructionKit.ts), which reads `anatomy.mound` — the world seam fills it from the
structure table after `describe` (0 while absent). A `collapse` seats its pile on it.

**Cuts and hides.** A `StructureCut` discards from `outsideM` outside the face plane (default 0.3 m: sills, surrounds
and shutters inside the hole go too) to `depthM` inside it. A `DamageHide` with `section` and `partClass` both null
hides everything the structure has.

**The kit's plan.** The world's describe call sites pass `kitPlan: kitPlanFor(parts, style)`; a kit module registers its
reader once with `setKitPlanReader(...)` (the facades lane's `regionalKitPlanOf`), so the world builder imports no kit.

**Writers.** A builder writes **triangles** into `DamageMeshWriter` runs (one bucket and role a run; vertex position,
normal, UV, tint; indexed triangles) and **pooled debris** into `DamagePieceWriter` (bucket, shape — chunk, brick,
block, stone, plate, splinter, beam, tile, slate, sheet, shard, clod, straw, rebar — variant, pose, scale, tint,
initial velocity). Roles: `rim`, `room`, `remnant`, `rubble`, `debris`. A stage returns its **cuts** (cylinders the
presentation discards from the intact wall) and its **hides** (a section, a part class, or both).

**Caps per stage** (the writer refuses past them; the builder stops):

| Stage | Mesh vertices | Debris pieces |
|---|---|---|
| `damaged` | 1,500 | 48 |
| `breach` (each hole) | 3,000 | 96 |
| `sectionDown` (P2) | 6,000 | 160 |
| `collapse` (shed / house / large) | 6,000 / 16,000 / 32,000 | 120 / 240 / 360 |

Damage batches are one dynamic mesh per bucket per world (its own material, its UVs and tints), so a battle's damage
adds at most one draw per bucket in use; pooled debris holds at most 1,024 live pieces per world. `collapse` may run
when the structure is breached and keep its result, so the collapse frame only uploads.

### 16.4 Tags in the intact geometry (landed P1, 2026-10-07)

At build time every part of a structure carries `userData.structureIdx` (props.ts `addStructureCollision`, the
landmarks' compose), and the world describes the structure through its kit chain before the merge places its parts
(`describeStructure`, the parts object the kit returned, so a kit's plan reader finds it). Then the merge records:

- **`aDamage`** (`Uint16`, item size 1, not normalised) = structureIdx + 1 on a structure's vertices, 0 elsewhere,
  only in merged buckets that hold a structure part (a bucket without one is untouched). A fine-detail batch tags all
  its geometries when any holds a structure: a `BatchedMesh` keeps one attribute set. A shader reads
  `int(aDamage + 0.5) - 1`; −1 (or no attribute) is no structure.
- **Spans** (`StructureSpan`: mesh, position attribute, first vertex, count, bucket, part class, and for a batch its
  geometry id and the one instance drawing it): every part's vertex range in the mesh's position attribute, absolute in a batch's shared
  attributes (its geometry's `vertexStart` included), whole triangles (merged geometry is non-indexed), so a range
  flattens the same way in a mesh and a batch (crushableClutter's layout). The part class comes from the bucket:
  glass (`glass`, `curtain`), roof (`roof`, `regionalRoof`, `straw`), trim (a batch cell's fine detail), else wall.
  Sections are not tagged per vertex in P1: a span's centroid against the anatomy's faces gives its section (P2).
- **World space**: every bucket mesh and batch stands at identity under the world root (receipted), so spans, the
  anatomy's placement and a pivot are world points.
- **Shadows**: a bucket mesh that casts a structure's shadow casts it through its own `MeshDepthMaterial` (RGBA packing,
  `props-structure-depth-<bucket>`, the depth three's shared one is flipped to), so a vertex patch moves the shadow
  with the building. The static shadow cache (`engine/shadowStaticCache.ts`) cannot see a shape the GPU changes:
  `touchShadows()` bumps `userData.cotShadowEpoch` on the structure's casting meshes and `casterSignature` mixes it.
  Called every frame the mask moves a structure (each frame of a collapse, once for a settled stage), the cache draws
  those meshes with the dynamic casters while they change and returns them to the static layer a second after.

The runtime API (`world/map.ts`):

| Call | Gives |
|---|---|
| `world.structureDamage(id)` | the seam: `anatomy` (the sim's mound filled in), `spans`, `damaged` / `breach` / `sectionDown` / `collapse` resolved member by member through the chain (an anatomy keeps its own kit's builders), `holeAt(x, y, z, radiusM, dirX, dirZ, munition, cause, hole?)` (a world point and blow to the `BreachSpec` of the nearest anatomy face: storey, face, u, y, body-frame direction, seed), `touchShadows()`; null for an unknown id |
| `world.patchStructureMaterials(fn)` | every props-bucket material once — the buckets' own, each batch's clone (`batched`), the structure depth materials (`role: 'depth'`) — with the meshes drawing it; returns the count. Call before the warm; chain `onBeforeCompile`, extend `customProgramCacheKey` |
| `world.touchStructureShadows(id)` | the seam's `touchShadows()` by id |

The presentation's mask reads `aDamage`: `damaged` hides glass, a fallen roof hides its section, a collapse hides the
structure, a hole discards the wall inside its cut.

### 16.5 Props

The destructible type table (`maps/inhabitKit.ts DESTRUCTIBLE_TYPES`) already pairs `build` with an authored `broken`
builder. The standard now: a broken state made of the prop's own materials (a fence splinters along its planks, a
pole snaps or bends by its material, a cart smashes its boards and keeps its iron, a stone wall drops its own stones, a
truck crumples its sheet), and debris from the same materials thrown along the blow (`PropDamageKit.debris`). Each
type gains `fracture` slots, defaulted from its `mat` (wood → `plank`, straw → `thatch`, stone → `stone`, plaster →
`adobe` under `plaster`, baked and vehicle → `metal` and `glass`).

### 16.6 Rules

1. Deterministic: builders read only their arguments and draw only from `damageRng(seed)`; `damageSeed` gives a
   building its seed from its map and placement centre in centimetres (the same on every peer and tier), a hole
   `damageSeed(seed, section, hole)`, a stage `damageSeed(seed, stage)`. Same seed, same breaks.
2. In budget: writers, not new geometries; no allocation per vertex or piece; the caps above.
3. Precompute only what collapse needs: the anatomy at build time, every stage when it first happens.
4. Resolution: `structureDamageKitChain(builder, style)` — the builder's own kit (a landmark), the map's regional kit,
   then the default; each member from the first kit that defines it.

### 16.7 Receipts

`src/world/destructionKit.selftest.mjs` (P1, extended by every kit lane for its kit): the default describe reads a
two-storey house from its parts (storeys, faces, layers, openings by face, roof kind and covering, floors, rubble);
every stage builder runs twice on the same anatomy and seeds and writes identical bytes within its cap; `damaged`
spalls two patches on the ground storey's widest faces (a shallow cut with `outsideM` 0.01, the core's units and a
backing in it, the render's lip round it, clear of the windows), so a damaged building keeps a mark after its glass
and chips are gone; the rim stands
round its hole inside the wall's thickness with the dark room behind it; the pile sits on the sim's heap
(`bodyMoundHeightAt` = `rubbleMoundHeightAt`); the chain keeps a kit's anatomy with its own builders; `aDamage` tags a
merge; and Verdant's real build describes every structure, finds its spans (plain and batched) where it stands, tags
them, stands every bucket at identity, casts each structure bucket through a patchable depth material, and touches
exactly a structure's casting meshes.
