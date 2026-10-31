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

Found on the way: the bunker (`crushMin: 999`, "shells stop on" it) was missing from `collision.ts`'s dense-cover
list, so every shell passed through and broke it; the sandbag kinds published no shell collider at all. The bunker is
fixed on 2026-10-09 as fortified cover (§4.6).

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
| mass class | `fixed` role → indestructible; `setpiece` role with `V ≥ 200 m³`, or `V ≥ 20,000 m³` → `landmark`; a `setpiece` under 200 m³ → `shed` (a light set piece, below); `V < 200` → `shed`; `V < 2,500` → `house`; else `large` |
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

**Light set pieces come down** (props lane A, E12, 2026-10-14; the owner: "make sure all props below a certain size are
destructible whether from ramming or shooting"). A set piece under 200 m³ of built volume (`LIGHT_SETPIECE_MAX_M3`: a
statue, a stele, a fountain, a guyed mast, a fire lookout's frame, a troposcatter frame, an arch over a track) takes
damage as a shed and collapses like a house: its records swap, the bots' grid refreshes round it. Its material is no
softer than masonry (`lightSetPieceMaterial`: stone, bronze, iron, never a timber shed's 30 kJ scuff), it takes no
slender tower's factor, and its heap is its volume spread over its plan (`structureRubbleHeightM`: a third of `V / plan`,
0.3 m at least, at most the height law's), so a felled mast leaves a low spread of steel, not a 2.6 m mound. On the 33
shards (2026-10-14) 15 of 63 set pieces are light: six guyed masts, four troposcatter frames, the fire lookout, two
fountains, the kolkhoz arch and an airstrip piece. Every other set piece stays breach-only.

**Set pieces break by their own pieces** (E12; `src/world/landmarks/pieces.ts`, `damage.ts`). A builder names the pieces
that come off (a figure, a finial, merlons, sails, a cap, a crest and banner, dishes, a crown, sheaves) and the vessels
that rupture (tanks, a radome); the landmark kit takes them at their stage — `damaged`, the breach stage's hole (slot 0),
or the collapse — hiding each by name (`DamageHide.piece`) and laying its own triangles where it rests on the ground the
composer sampled round it. An open frame (a guyed mast, a fire lookout, a headframe, a troposcatter, a conveyor) takes no
spall and no round hole, and a light one goes over whole along the shaft topple's line. A set piece with neither keeps the
reading it had. Strikes between stages take nothing off, so a late joiner's settled stages lay the same.

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
`SECTIONS_SWITCH`); on in every mode that plays destruction since DST-04 (2026-10-15). `sim/structureSections.ts` derives a structure's sections
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
cornering into a wall is a behaviour defect).** History: the first fix (692a9a9d7, 10-08) was reverted on 10-09
(5c133417e) after it caused a Turbo Ball fall and a Blackglass search loop. It was rebuilt as `fix/bots-rams-sweep`
(fe2509956), which lands in the 222 stack (2026-10-13). The rebuild keeps the three fixes below and adds two guards,
described after the census paragraph. All-bot Steinburg (10 matches, 7 v 7, seeds 32000–32009) put 373 of 428 stage
changes on rams. A trace of every ram blow (the drive goal, the steer point, the route plan, the hull's pose
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

The same census after (692a9a9d7, 10-08): 107 stage changes, 85 from shells and blasts (kinetic 57, blast 28) and 22
from rams. Matches run 322 s on average against 294 s. battlePacing's core gate passes: 132 matches, median 199 s, p10 155 s, none inside
120 s, 1 at the cap.

The rebuild's two guards:

- **A pivot never drives past 4 m/s** (`PIVOT_ROLL_MAX_MPS`): above it the pivot's drive is cut and the hull coasts into
  the turn, with no brake. This fixes the Aegis Crossing Turbo Ball fall (worst bot fall 896 → 185 HP).
- **The careful rules stand aside in a wedge:** a hull whose stuck recovery has escalated drives on the old rules for
  10 s (`WEDGE_RELEASE_S`). This fixes the Blackglass seed 38001 loop (a 900 s draw → a 263 s result).

The authority's bots also stop counting a teammate's wreck as support: its `getAllies` filters destroyed hulls, as the
solo step does (222).

Measured at landing on 2026-10-13. The soak is Steinburg, 7 v 7, 300 s, seeds 7201-7206, using the gameplay lane's
bot soak:

| Tree | Ram collapses | Ram damage stages |
|---|---|---|
| Main before the fix (0fb61e56d) | 11 | 31 |
| With the fix (d38df4bc5) | 4 | 9 |

On 10-10 the lane had measured 29 → 3 on that night's base. The pacing tail passes with the fix: 264 matches, median
202.5 s, p10 159.2 s, none inside 120 s, none at the cap.

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

### 4.6 Fortified cover: the pillbox (2026-10-09)

The pillbox (`bunker`, `world/collision.ts isFortifiedCoverKind`) is reinforced concrete: it stops every round (dense
cover) and every hull (no held press, no overrun), and only accumulated heavy blows bring it down
(`sim/fortifiedCover.ts`, one ledger a match in the solo step and the authority, booked by prop index). A blow is priced
by this section's laws in structure points: an explosive round's contact blast plus its penetrator's strike, under a
4 SP floor nothing; a ram's energy above reinforced concrete's 1.1 MJ scuff at 40 kJ a point. It falls at 30.6 SP (two
and a half contact bursts of the nominal 3.5 kg tank HE round): 125/120 mm HE on the third hit, 120 mm HEAT the fourth,
152 mm HE or HESH the second, a 60 t hull at 9 m/s in one ram; kinetic rods, autocannon and machine-gun fire never. A
burst beside it does not fell it (§6's light props); the bots route and steer round it (`hullYieldingRecord`). A host
migration's new authority starts a fresh ledger. Receipt: `src/sim/fortifiedCover.selftest.mjs`.

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
- **rubble**: a mound over the structure's footprint rectangle, at most `h = clamp(0.18·(topY − baseY), 0.6, 2.6)` m on
  the inner 70 %, a cosine skirt `max(3, 2.2·h)` m wide beyond the footprint edge (grade under 25 %: every hull climbs it).
  The inner 70 % is a crown, not a level plateau (2026-10-13): its top lies between 0.58 h and h, leaning to one side
  and broken by two crossed swells no shorter than 4.5 m, the skirt running down from the crown's height at the edge.
  Lean and swells come from a hash of the footprint's centre to the centimetre, so the authority, every mirror and the
  kits' `rubbleMoundHeightAt` raise the same heap and no two heaps are alike; the steepest grade stays under main's.

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

Every mode that plays destruction digs craters since DST-04 (2026-10-15; `CRATERS_SWITCH` on, §9): the drawn terrain
follows the overlay (the render below) and so does every ray. A tool or a test passes its own rules to try others.

**The world's rays read the dug ground (DST-04, 2026-10-15).** Both worlds' ray marches — `world/map.ts` (solo, a
network seat, the Studio) and `world/headlessCollisionWorld.ts` (the authority) — sample the base's fast height plus the
bound overlay as drawn (`contactOffsetAt`, the lattice the terrain mesh follows); the march's upward ceiling counts the
overlay's raise and a terrain hit takes the dug ground's normal. Shells, spotting's `hardLos`, the bots' looks and gun
lanes, the drones' avoidance, the roof gun's check and the aim all read it: a heap stops what passes into it, a gun in
a bowl fires out of it, a hull in a bowl is seen and struck over the rim, never through phantom ground. The authority
binds its match's ground on its own (match-local) world; the solo smoke reads the match's ground as the authority's
does. The presentation's running gear and the Studio's hulls stand on the same dug ground
(`world/liveHeightFieldProxy.ts createDugHeightFieldProxy`). Receipt: `world/groundOverlayRaycast.selftest.mjs`.
The drawn bowl is the lattice's: its deepest point reaches 78 % of the law's depth for a 125 mm crater (R 1.67 m), 89 %
for a 152 mm shell and 95 % for the gunship's howitzer (R 3.44 m), the rim all of its height.

**A map's pre-placed craters are real bowls (DST-04, 2026-10-15).** The battlefield's old shell scars (props.ts
`tryPlaceBattleScar`, the props stream as before) are recorded as sites, not drawn as flat discs. `world/mapCraters.ts`
decides each site once on the built world's own records: a bowl (rim crest 0.7 r of the scar's disc, a weathered
0.28 R deep, the scar's own rim) or a mark — where the bowl would reach under any record but a tree (nothing that stands
on the ground hangs over a hole), on hard ground or water, under the dig radius, or past 160 bowls. The collision shards
carry the decided stamps (`craters`), so the authority lays exactly what every seat built (layout identity; the drift
receipt keeps the shards equal to the build). Every match lays them into its ground before anything else: the solo step
each battle, the authority (fresh, and a standby host's prepared ground, before the bot navigation grid reads it), a
seat's mirror and the Studio's every scene; they take overlay bucket slots but not the match's 160 dug craters. The
presentation lays their surfaces from the bound ground (`fx/effects.ts layMapCraters`: craterMarks in a slot set of its
own, an hour old). Receipt: `world/mapCraters.selftest.mjs`.

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
| `structure_stage` | `structure:stage` | `StructureStageEvent` | every viewer (world state names no shooter); how it was dealt withheld from a viewer that does not see the source (below) |
| `structure_breach` (P2) | `structure:breach` | `StructureBreachEvent` | every viewer; the munition withheld likewise |
| `terrain_crater` | `terrain:crater` | `TerrainCraterEvent` | every viewer when it deforms (the munition withheld likewise); a mark follows its shell's observable-shooter rule |
| `shell_impact` / `shell_hit` (existing) | `shell:expired` / `shell:hit` | + `munition`, `chargeKg` | unchanged rules |

`canObserveEvent` admits the new kinds as it admits `world_prop_destroyed`. A building breaking is visible world
state; its event carries the blow's point and push direction but never the shooter.

**How it was dealt stays with the hidden (2026-10-13, the MP stream).** The blow's point and push direction still told
every seat where a hidden tank was: a ram's point is the hull's contact and its direction the hull's heading; a shot's
direction is the bearing to its gun; the munition names the weapon. The destruction core now carries the blow's source
(`StructureBlow.sourceId`: the rammer, the shooter, the dead hull) into its stage, breach and crater events — on the
authority only, never in the log or on the wire — and the authority (`authoritativeMatch.ts viewerWorldEvent`) hands a
viewer whose team does not see that source a copy without `cause`, `munition`, `x/y/z`, `dirX/dirZ` (a stage), without
`munition` (a breach, a crater), and a prop's fall without `cause`, `directionX/Z`, `speedMps`. The world state is
unchanged for everyone (the log, the destroyed list, which structure, which stage, the hole, the crater), so a rejoin
and a migration read one history; the presentation lays a withheld event with neutral values (the structure's centre,
the prop's own fall axis; `destructionMirror` already fell back to them). Its own team, a spotting team and a spectator
read events whole. Receipt: `hiddenWorldEvents.selftest`; the world-events audit reports the withheld deliveries (36 of
155 in its 4v4 run) and judges them like the rest.

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
- With both on this core, the phone tier matched **33 of 33** shards (2026-10-08). The check: `node
  tools/capture-world-collision-manifests.mjs --tier=mobile`.
- **2026-10-11 (the hitbox lane): only the facades fix reached main.** `visual/scenery-phone-masses` never landed, and a
  later change brought a third cause, so main matched 23 of 33 at the phone tier. Ten maps drifted: Verdant, Desert,
  Urban, Coastal, Frontier, Badlands, Monsoon, Orchard, Saltwind, Reservoir. Three causes, all fixed on
  `fix/collision-tier-identity`:
  - a formation's masses came from the stones the phone drew (the same fix as 16469bc6a): `buildRockFormation`'s
    `collision` option lays the desktop's pieces from a fresh copy of the formation's stream for the masses alone;
  - a rock field counted a formation as placed by the phone's geometry, so a small pavement the phone draws none of let
    it place one more (Frontier): the build's `laid` is the desktop's;
  - since 3993e4fce (2026-10-08) the boulder forms take the map's angularity, but the phone's collision form was built
    without it (Badlands' stones rounder on a phone, 14 small rocks fewer): `rockDressing.ts boulderVariantForms` builds
    the drawn, collision and far forms from one constructor that differs only in subdivision.
  Every desktop shard is unchanged and the phone tier matches 33 of 33 again. Receipts:
  - `src/world/sceneryTierIdentity.selftest.mjs`: every formation form; the laid count; the stones of every map with an
    angular rock climate.
  - `src/world/scenery.selftest.mjs`: composeScenery's records byte for byte on both tiers.
  - `src/world/phoneLayoutIdentity.selftest.mjs`: Fjord, Airfield and Steppe, plus Badlands and Frontier, at the
    phone tier against the shards.
- `authorityObstacles` shares the indices on a phone now. An event whose record at its index is another prop still turns
  that off and finds its prop by identity, so a layout that drifts again degrades to the identity path. This needs both
  fixes in the build: land them before or with this flip.

### 8.5 Budget

The wire sends one EVENT message per viewer per tick and drops the whole batch above 64 events
(`MAX_EVENTS_PER_MESSAGE`). Destruction adds at most: 1 collapse + 4 other stage changes + 4 craters per tick (the
overflow of stage changes waits a tick in the authority's FIFO; craters past four in a tick become marks). The
reliable queue treats `structure_stage` (collapsed) and `terrain_crater` as heavy beats. Bandwidth: a full late-game
log (300 stage entries, 160 craters) is 3.3 KB in a keyframe.

**The log's wire budget** (security audit 2026-10-22, C3). A keyframe carries the whole log beside the entity rows,
the shells, the mode state and the destroyed set inside one 64 KB message (`MAX_MESSAGE_BYTES`). A Ruinspires log
grown past about 2,340 breach entries no longer fit, and every viewer's snapshots and the migration keyframe stopped
for the rest of the match.

The log now keeps to `DESTRUCTION_LOG_BUDGET_BYTES` (36 KB of worst-case entry sizes, `src/sim/destructionMatch.ts`):
- Stage and crater entries are always logged. They are finite (three transitions a structure, `maxCraters`), and the
  budget reserves room for every one the map can still produce.
- Breaches share what that reserve leaves. Holes stop at three quarters of it, and a section's fall, which changes
  collision, may use all of it.
- A breach past the budget still opens live, and its `structure_breach` event reaches every connected viewer. Only a
  late joiner or a migrated host lays the structure down without that hole or fall. It shows the structure as the log
  left it, the same way a holed section already resumes whole on a new host (§8.3).
- `DestructionMatch.unloggedBreaches` counts them.
- `destructionLogBudget.selftest`: 3,000 125 mm HE hits on Ruinspires open 5,990 breaches live. The log keeps 659
  (271 holes, then section falls) and all 1,095 stages, and its keyframe is 31 KB.

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
With sections off (every mode before DST-04, 2026-10-15; a ruleset may still turn them off) the host sends none and the
earlier judgments are unchanged.

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

Craters follow one switch, `CRATERS_SWITCH` in `sim/matchRuleset.ts`: on since DST-04 (2026-10-15), after the switch-on
gates below. The column says what each mode takes. **Sections**
(`readonly sections: boolean`, P2 §3.4) follow `structures` in every mode behind `SECTIONS_SWITCH`: on since DST-04
(2026-10-15; the owner's "explosions that should be destructive and leave holes"), so a battle's HE holes the wall it
strikes, a section at zero falls and a collapse comes down storey by storey, as the Studio's films have shown since
2026-10-08. The receipts and both audits ran with sections on in P2; the paired pacing and fairness, the cost of the
openings-aware rays and the motion strips (a wall panel coming down from a metre up, storeys dropping, a round through a
hole) run in the 225/226 final pass.

**The switch-on gates (crater-render-spec §F), on feature/destruction-craters (2026-10-08).** This branch is the core plus
the drawn terrain and ground cover (the ground lane, §B/§C) and the crater surface (the FX lane, §D). The surface drapes on
the contact surface plus the overlay's `contactOffsetAt`, which is what the drawn LOD0 shows.

| Gate | Result |
|---|---|
| Determinism audit, craters on (`tools/sim-determinism-audit.mjs --craters`; its receipt runs both) | identical over 3600 ticks, 7 craters dug |
| World-events audit (live, rejoin, reconnect, migration, return), terrain_crater judged like a stage | 4 dug, presented 12/12 on 4 views; 6 laid down settled for later views; none re-sent by the new host |
| battlePacing, paired against craters off on the same seeds | 127 of 132 matches identical; 5 change duration only, no winner; median 199.2 s and p10 154.6 s unchanged |
| Fairness, paired, 40 games a side on the three maps with the most HE ground bursts | Whiteout +5.0 points (2 winners changed), Polders 0 (0), Saltwind −2.5 (1); 26–31 craters per map |
| Barrage cost (ABCCBA off/on, live lighting, scene-pass guard) | the 225/226 final pass (switched on 2026-10-15 under the owner's build-first rule) |
| Motion strips (125 mm, the gunship's 152 mm and its walk, FPV, ATGM, a settled field at 30 and 80 m, snow, sand) | the 225/226 final pass (scenes: the destruction lane's `scenes/craters.mjs`) |

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

## 17. What falls, on the one engine (2026-10-12)

The owner (2026-10-12), after a Steinburg screenshot of a broken brick building ("big flat untextured grey-blue
rectangles ... rows of brick chunks hanging in the air in strips"): "make sure that destructible buildings are properly
evaluated and their rubble properly falls down onto ground that can potentially be uneven", and "make the physics for
stuff falling around and pieces of buildings and destruction use the same kind of physics engine".

- **Pieces land where they land.** The GPU debris programs (`structureDebris` pieces, `debrisChunks` chunks) stop each
  piece at the point its flight meets the ground as drawn (`fx/ballisticLanding.ts`, solved at the write; `aLD` / `aLT`),
  never at the height of the ground it was thrown from. A still piece on a standing building (a damaged roof's slipped
  tiles) is a box in that building's own run: it falls and folds with it. A fall's piece thrown with next to no speed
  over the ground drops to it.
- **Nothing hangs from the fall.** The owner's "big rectangles" were the building's own triangles straddling the eave
  band (a roof's overhang under the eave line, a tower's glazing from under the eave to over it): the desktop cut spares
  a triangle that reaches the roof, and only its roof vertices rode the front down, so it hung from its wall vertex as a
  flat panel of slate or dark glazing until the fold. The vertex patch brings a wall's vertex over the front down to
  `FOLD_ABOVE_FRONT_M` (1 m) over it — over the cut's ragged band, so nothing the cut shows changes — and the phone keeps
  folding it onto the front (`structureMask` `crumbleVertexY` is the GLSL's twin for the receipts).
- **A hole opens through the earlier runs.** Rims are runs no hole cuts; every through-hole folds the triangles of the
  structure's earlier rims inside its cut (`structureStages` trimRuns), as the mask discards the wall there.
- **One interior a storey.** The kits' dark box behind each hole is replaced by the storey's interior (`layInterior`):
  inward faces behind the walls' thickness, under the eaves, in the building's own bucket textures (`roomMaterialFor`:
  the bucket's map, a bound share of the sky's light), laid at the storey's first hole; a ruin's kit asks for none.
  A bucket the world draws under another name takes that material (`bucketAliases`: thatch/straw/hay, a regional bucket
  and its base twin) before the untextured fallback.
- **Rubble on the engine.** A stage's larger pieces, up to its budget (a strike by its charge 2-8, a breach 8, a falling
  panel 12, a storey 10, a collapse 14 and one a crumble band), are bodies of `sim/rigidBody.ts` — the turret pops' engine
  — in `fx/rubbleBodies.ts` over `fx/debrisPhysics.ts`: the ground as drawn (its craters and the sim's heap),
  `world.bodyRecordQuery()` (shell bands and solid records; the throwing building's own pass its bodies for 6 s), each
  other. Drawn as instances in the bucket's texture; a settled body the pool lets go of stays an instance. Desktop 56
  bodies, the phone none. Presentation only: the sim's heap and the destroyed lists stay the authority.
- **Kicked clutter on the engine.** Drums, churns, bins, bottles, buckets, jerrycans and loose wheels kicked by a hull run
  on the same engine (`world/loosePropBodies.ts`); the traffic cone keeps its ground-constrained law.
- **Rounds break light cover.** A round breaks the crushable props it flies through before what stops it (fences,
  crates, carts, tents, stalls, stacks, the parked cars: `sim/shellLightCover.ts`, the solo step and the authority).
- **No pops off rough ground (s3).** A hull that ends a step inside a solid record (a rock, a bunker, a boulder) leaves
  it over a few steps instead of being pushed out at once, and a record's top is climbed on an eased edge at no more than
  7 m/s (`sim/obstacleDepenetration.selftest.mjs`). `tools/field-pop-trace.mjs <map> [seconds=60] [seed=8100]` plays a
  real map with 28 bots on the authority and lists every unexplained step over 5 cm with the hull's state and the
  records round it (the field audit's pops). Tank-to-world contact is the physics stream's from 2026-10-13.
- **Receipts.** `tools/destruction-check.mjs` stages every destructible building kind of a map, brings it down under HE
  and judges what it left: textured runs, no rim in a later through-hole, nothing of the building hanging over the heap
  late in its fall (the crumble's law on every triangle of its spans), no still piece in the air, every thrown piece on
  the ground where it lands, every body at rest on the ground, a body or a record, the budgets. Its selftest runs four
  Steinburg kinds; main before this section failed every one.

## 18. A ruin, never a raft (2026-10-16)

The owner ruled flat rafts out, and the LOOKS r2 sweep's anti-raft check found 145 placed structure kinds whose collapse
stood under 25 % of their intact height (the destroyed state's area-weighted 90th percentile of its triangles' heights
against the intact's; its plan at least 60 % of the intact's cells). `world/collapseRuin.ts keepRuinStanding` runs every
kit's collapse (the default kit and every regional one) from the world seam: it measures what the kit writes as it is
written (64 height bins, a 48 × 48 plan grid, no sort and no allocation) against the intact form as drawn (its p90
height, top and plan box, measured once from the parts at describe: `StructureDamageAnatomy.intact`), and adds in the
building's own buckets and tints only what the ruin lacks — the storey interior heaped (a fill draped on the
simulation's heap, ragged at its edge, no deeper than tracks sink), an L pier standing at each corner in the ground
storey's structural layer (stepped and ragged, 42–60 % of the intact's p90 over its share), then ragged wall stubs with
a breach in each face and the fallen covering's slabs leaning on the heap, until the ruin stands at 30 % and covers
72 %. The kit writes with 200 boxes' room kept free for it. Seeded from the collapse's own seed (the same ruin on every
peer and tier); a kit whose ruin already stands is left as it wrote it. Presentation only: the piers and stubs are drawn,
not records (the simulation's heap and the swap are unchanged). Receipt: `world/collapseRuin.selftest.mjs`.

## 19. One drawn enclosure: damage writers place against what the building draws (2026-10-17)

The owner, after Verdant's church in battle (deploy 225): "for building destruction, these weird ugly boxes/surfaces still
randomly come up. fix" — flat dark slabs at the eaves, far past the walls. The cause was one outline: the anatomy's four
faces per storey are the house a kit describes, but for the default reading and the set pieces they were the bounding box
of every part (a church's forecourt and towers, a station's canopy, a windmill's sails) about the body's origin, and every
writer added since trusted them: the storey room (`structureStages layInterior`), the fracture's room and wall grids, the
default kit's rims, stubs and heap, the ruin's piers and stubs (`collapseRuin`), the collapse's floors and floor records.
Each was invisible on the regional house it was tried on and stood in the open on anything else.

**The rule.** A damage writer places geometry only against `world/structureEnclosure.ts`, measured once per structure at
describe (`StructureDamageAnatomy.enclosure`): per storey band a body-frame grid of its drawn WALL cells (the parts'
near-vertical triangles covering at least 35 % of the band's height: a solid wall, a window wall, a post; not a frame's
braces or a canopy's valance; named pieces, roofs and fine trim left out) and its INTERIOR (flooded from the border after
gaps of 1.5 m or less close), the band's interior box and enclosed share, each face's SETBACK to the first drawn wall per
u-bin (NaN where none stands behind it), and the drawn walls' top per cell. Its readers:

- `storeyInterior(anatomy, storey, hintX, hintZ, capY)`: the room behind a hole — the enclosed component behind the hint,
  under what covers it (no ceiling over a court), rectangles for its floor and ceiling and its boundary for its inward
  walls, its ceiling at the band's drawn wall top; none where the band encloses under half its box (a frame, a trestle, a
  pipe run, a tank farm), the room would be under 2 m² or under 1.9 m across either way (a porch pocket under a portico),
  more than 35 % of its edge is open to the outside (a space shut only by the gap closing between posts: an ore bin's legs),
  and no cell of it where what covers the cell is drawn under the ceiling (a house row stepping down its slope). A
  structure measured from its parts that encloses nothing it draws (a set piece whose every house is a named piece) has
  no room; only a kit's anatomy handed over without parts uses its faces as walls. `layInterior` and the fracture's
  `roomFor` both lay it, one room per storey and component, gone with its storey (a storey drop, or every wall of it
  fallen); a kit's own room run of any bucket (the regional kit's open storey behind a fallen section, its walls, boards
  and joists on the faces' box) is taken by `structureStages` as the ask for that one room, never drawn.
- `faceSetback(anatomy, storey, face, u)`: `holeAt` puts a hole on the drawn wall behind the face (`BreachSpec.setback`);
  a NaN bin is no kit hole (the round passed an opening or a frame: its burst only); the default kit's rim, room and cut
  and its stubs go there; the wall fracture's grid stands at the face's median setback, a cell over no drawn wall is void
  (nothing breaks, falls or is drawn there; it bears what stands over it), a face with no wall lays no grid, and a corner
  bears only while the face sharing it stands there.
- `enclosedAt`, `wallAt`, `wallAlong`, `wallTopAt`, `wallClusters`, `bandEnclosure`: the kit's heap lies on what the
  building drew (grown 1.5 m), the ruin's piers, stubs, fragments and posts stand on the ground storey's drawn walls no
  taller than they are drawn there (an unnamed frame's stubs on its own drawn legs; a named frame without a lattice
  reading stands its stump where it is drawn tallest from the ground, `tallestDrawn` — the biggest cluster of the ground
  band's wall cells reaching the peak, a flood mast's pole, not its stays or its lamp head — and none where its body
  draws nothing near the frame's height — a guyed mast whose mast is its own falling piece; a buckled leg bends out no
  higher than the frame is drawn in its tip's own cell; a long stub, pier or fragment is no taller than the lowest
  stretch of wall it stands on, a skin wall's post than its own wall cell), the default kit's spalled patches sit on the
  drawn wall where it runs flat across them, and the collapse's floor pieces and floor records span the band's interior.

The default reading's faces now stand on the body's walls too (`describeDefault`: the enclosed plan up to the eaves, grown
to the walls, about its own centre; without a roof bucket the eaves are the body's top — the highest half metre whose
walls' box is still 45 % of the widest — so towers and domes are no storeys), and `anatomyCentre` is what a reach round
the body measures from. A set piece's body is re-measured without its named pieces; a named piece that comes off lies
along the ground under it whether laid flat, dropped or toppled (a tower mill's upper tower on its mound's flank), a
toppled piece much wider than it is tall lands near flat, and a piece the stage has no room to lay still comes off in its
chips (never left hanging where it was: the sails on a fallen tower's hub).

**Roof slabs.** A fallen roof slab's body grows in its plane only (its normal extent held to the planned box, 0.35 m
under and 0.6 m over); a slab takes only what lies on its plane (0.8 m, facing within 50 degrees); what stands over the
eaves on no slab is the top storey's panel's when it lies by a face, the roof's furniture when nothing is drawn under it
from below (a chimney or a dormer on the covering, a turret on the ridge — it rides the slab it stands on, a roof
chimney's own piece falls with the roof, and the world's copy is flattened with the roof's hide; one decision a cluster
— `structureEnclosure roofFurnitureAt`: the walls drawn over the eaves gathered in 8-connected cells, a cluster under 3
m across, mostly not drawn from below and no higher than 3.5 m over the ridge — and the attic's lid the roof covered
goes too), else dropped with the collapse (a tower and its spire, a gable, a stack drawn from the ground stand). A slab
or sheet at rest 1.5 m or more up with a tenth of its plan past the walls of the height it lies at (judged at its body's
box, not its frame's origin) is looked at before the collapse may bake: a slab of several sheets breaks into them; a
sheet (or a one-sheet slab under 20 m² in its plane) is shoved off with a hop, into the shell from over it and out from
past it, twice; still there — or a one-sheet slab too big to tip — it breaks up where it lies, its dust and broken tiles
thrown. Nothing is laid on the ground out of view (round 2: a panel leant on a tavern's wall vanished between two
frames).

**Rejoin parity.** A late joiner's settled holes, panel falls and breach stages break the walls as the live ones did (cut
and drawn at once, nothing thrown); a settled roof fall lays only the kit's roof rubble; a settled collapse drops the
standing runs.

**Receipts.** `world/structureEnclosure.selftest.mjs` (the enclosure's law on synthetic plans, and a source scan: the
room, floor and ruin writers place through it, never off the anatomy's w x d); `tools/destruction-slab-check.mjs` (the
stray-slab detector on the battle's own path: every damaged building's drawn meshes split into pieces and judged — a slab
past the walls of its height band, floating, untextured or degenerate; a standing run off the walls; a remnant taller than
the building as drawn at its spot; a fallen roof slab drawn off the body it rides in) and its selftest;
`tools/destruction-slab-kinds.selftest.mjs` (the detector over every destructible kind of every map, its builds and runs
in a worker pool (265, below); its judged exceptions listed with their reasons, a kind that stops flagging leaving the list).

**Round 2 (2026-10-17, the round-1 critics).** A tower mill's upper tower comes off as two courses of four ragged
quarter-rings of its brick wall (each with its window, along one shared break line: whole, the shaft shows no seam), each
falling out over the side it stood on — no solid brick log, no hollow drum — with its windshaft and tail pole as pieces of
their own, and a wide flat piece (the stage ring) slumps only a few degrees. The ruin keeps over the anti-raft floors where
the round-1 enclosure took its height: a frame read by its posts stands its posts and boards on the plan's edge where it
is drawn (a fish rack, a shed), a skin body's walls take a third, denser course of stubs where they stand tall (a tank
farm's shells, a ruin's ragged runs), wall fragments lower than the height the ruin lacks are not drawn (they only spread
the heap thinner), and a leant roof slab stands with both ends over the drawn plan. The enclosure's measure walks each wall
edge cell by cell and steps across a covering's samples (30 % less CPU at load). The detector strikes any of a building's
four faces (`--faces`, each face's own seed), welds vertices by number, renders a film cadence on the CPU (`--film`), and
counts a standing building's own drawn floors as support; the kinds receipt runs on worker threads (its imports, not the
tree, are its cache inputs), strikes each kind from the face its name picks, and its judged exceptions name a finding
(building, mesh, reason), not a building.

**The census (2026-10-17, round 1).** The detector over all 33 maps (667 building runs, 12,365 snapshots, the final
detector on both trees): main flagged 249 buildings (2,778 snapshots: rooms past their walls, fracture rooms, remnants,
rims, roof slabs, baked rests); this round leaves the judged residue the kinds receipt lists (fallen objects' faces on the
ground, low remnants over the heap, held storeys' rooms and joists, roof slabs and baked rests at rest on what holds them,
rims at holes in round and open walls).

**The census (2026-10-18, round 2).** Every map, every destructible kind struck from all four of its faces (the A pass: 60
rounds up storeys 0-3, every phase and the late joiner's replays) and the roof pass (R): 1,846 building runs, 35,720
snapshots. 27 buildings flag, in 674 snapshots (1.9 %; main, one face: 249 buildings in 2,778), and all are the judged
residue: low remnants and stubs 1.1-2.9 m over the drawn wall or heap at their spot (piers, never slabs: airfield #25,
badlands #54, blackglass #9 and #14, caldera #34, fjord #0 and #9, polders #13, steppe #10, titan_gorge #3, skybridge #12,
whiteout #21 as on main, whiteout #40 on its airstrip's 5 m grid); what stands with a storey the simulation holds, and a
room in the 0.9 s between a ground storey's fall and the collapse it brings (oasis #2 and #14, ruinspires #1 and #36,
skybridge #7); fallen objects' faces on the ground (longleaf #16's lookout cab on its side, orchard #4's tower drum); rims
at holes in round and open walls (reservoir #17, skybridge #7); a remnant on a slope, 16 % of it below the downhill ground
(skybridge #24); a roof slab or baked rest lying across a fallen stack's drums or on a held floor (ruinspires #7,
titan_gorge #0); and three panels on their edge at the ground beside a ruin, each from one face (autumn #0, badlands #0's
roof sheet, caldera #28's fracture heap piece) — the open item, tipped once more when they rest and still standing. The
kinds receipt (one face a kind by name) passes on the same commit: 393 kinds, 6,060 snapshots, 20 judged findings.

**The anti-raft floors (round 2).** The ruin probe over all 1,943 structures (ruin height at least 25 % of the intact p90,
plan at least 60 %): 24 below the floors, main 28 — 8 fixed (gantries, boatsheds, a guyed mast), 4 new, each explained:
skybridge #12 (a 47 m lattice mast over a 3.7 m hut: its p90 is the mast's antenna head, and main stood 13-21 m stone piers
on the hut to pass), longleaf #11 (a building already in ruins, its walls drawn low: 0.249), fjord #65 (the tallest fish
rack: its posts at 0.8 of their drawn cells, 0.235), copper_mesa #49 (a tank farm whose crumpled shells and heap spend the
debris writer's vertices, 0.214; its twin #48 stands at 0.33).

**Round 3 (2026-10-18, the round-2 critics: roof trim and furniture left in the sky, a receipt blind to it).** Nothing a
building's damage leaves without what held it stays in the air, slab or not, and the receipts read it:

- *What hangs comes down* (`fx/structureHanging.ts`, swept by `fractureStages` once a building's faces are drawn and no
  storey of it is falling, after every hide, section fall, storey drop and face redraw): the world's parts (each span's
  triangles welded into parts) are read against what is drawn round them — never a collision record. A part *bears* where
  the ground or a part that bears itself lies within 0.8 m under half its lower envelope (0.4 m cells; a wall beside it at
  that height holds it too: a sign, a gutter), or under points round its middle (a roof's side held along its eave and up
  its gables); support propagates up from the ground, so two boards side by side hold nothing up. Touching parts (a sample
  of each within 0.25 m) gather in clusters; a cluster touching the ground stands. A part that bore in the intact building
  and bears no more (its held share down by a quarter), or whose cluster stood and stands no more, comes down —
  `landmarkBodies.drop`: a compact cluster as a body of the one engine, a sparse or tall one (a mill's sail cross, a
  gutter round a corner, a chimney that stood upright on the floor with a roof slab on its head) falling under gravity's
  time to lie on its broad side, one going round the building's middle (a mill's stage round its tower: a box round it
  stood on its braces over the ruin) breaking up where it hung; settled (a late joiner), at rest at once. What the
  presentation draws is read piece by piece (each mesh's triangles welded) as the parts are — it bears or not, up from the
  ground with them: a fracture face's piece or a kit run's piece (a rim's chunk, a remnant) touching nothing that stands,
  or over a metre up and held no more where the intact building held its spot (its own twin, what lies within 0.1 m of
  it, left out: a frame's infill drawn under its beam goes, a wall over an arcade held at its columns' heads as built
  stands), comes down — a face's piece as a body of its cells (a reveal of a standing cell found touching nothing is drawn
  no more: a lattice's cell drew it as a strip in the air), a run's piece as a body of its own triangles, the rest of the
  run standing; a room touching nothing that stands goes. The sweep reads a little stricter than the slab check (touching
  at 0.2 m, bearing over 55 % of its envelope, down when its held share fell by a fifth) and samples as it does (rows
  along each triangle's longest edge with its corners: a grid's square of samples on a sliver made a parking deck's sweep
  200,000 samples). It reads over the intact reading as a base — made once a building (in steps ahead, while its damage
  is still being drawn): every sample as built, which parts touched (a witness pair of triangles each) and which touched
  the ground; a sweep puts only what moved and what the presentation draws in an overlay, reads a hidden triangle's base
  samples no more, and searches which pieces stand lazily (the lowest samples first, on through what they touch, until
  one stands). It runs in steps over the frames (12,000 units of work a step, four a frame: the whole of a big building's
  sweep held a frame for a tenth of a second and more); a change while it runs is read by the next.
- *A roof's furniture* (`structureStages flattenRoofFurniture`, at the roof's hide and again at any wall's fall after it):
  every welded part that starts within a metre under the eaves and reaches 30 cm over them, centred in the footprint, goes
  unless the structure's standing parts hold it up (a 0.5 m grid of what the non-roof parts draw; a part held over half its
  lowest cells holds in its turn: a gable drawn in a wall's bucket holds its verge boards) — a ladder, an aerial, a verge
  board, a dormer's cap, a ridge's tiles; the dark interior's level top in the top storey's upper half (its lid) goes too.
- *The fracture's faces*: trim standing proud of a gable is the roof's verge (not claimed into the face: the roof's fall
  takes it); roof triangles are claimed only as a gable over the wall (an eave's overhang a side face took stood on as
  long slivers); a gable's apex over its sampled outline goes with its nearest cell, what reaches over its head stands
  while the gable's top row does; what reaches past a face's ends goes with its row's end cell; only a cell that draws
  something has reveals; a storey's fall lowers the faces over it (in flight by their matrices, at its end for good — their
  grids and cells: a late joiner saw a tavern's upper floors hang over its empty ground floor).
- *Rooms* are the wall's own colour in shade (the owner's "dark grey-navy slabs": a blown-out facade showed the room's far
  wall as one flat near-black plane); *ruin stubs* stand only where the walls are drawn down to their foot (a frame's
  posts excepted: a boatshed's reach the ground under its cladding on stilts), no taller than the wall drawn at their own
  cell, and no course over one not drawn or capped under its plan (a tower's pier course stood over its capped one); a
  frame's bent legs go on from their stub's kinked head, its corners the head's (one member bent: a strut from beside the
  head stood held at one end only); a sheet hall's column stumps stand from the ground (from the face's foot they stood
  0.4-0.8 m over it where a pad had been); a roof's fall onto a held floor cracks into its sheets
  at its first touch; a panel on its edge past the walls is tipped once a roof's held fall rests too (the held-floor return
  came before both looks), again once knocked onto its edge (counted on a tip made), and the look allocates nothing.

The detector judges any drawn piece left hanging (`tools/destruction-hanging.mjs`, the same two readings against the
intact building: held then not, cut loose), reads the world's spans as drawn at each snapshot (a storey's fall moves
them), models the mask's fold of a kit's collapse (the spans gone COLLAPSE_S after the blow), and reads hanging only two
seconds after the building's last event (the sweep's creak, then the fall); a late joiner's page is read once its
hanging sweeps are done and what they took down has had 1.5 s to land (at most 15 s). The kinds receipt strikes each roofed kind's
roof pass too (`wide+roof`) and skips a kind whose fingerprint (its spans, anatomy and enclosure as built, its staging,
and the destruction code's hash) a clean run passed before: a world change runs the kinds it changed.

**The census (2026-10-18, round 3).** On `06b774833`, every map and destructible kind from all four faces (the A pass: 60
rounds up storeys 0-3, every phase and the late joiner's replays) and the roof pass (R), with the hanging judge on: 1,846
building runs, 35,720 snapshots; 34 buildings flag, in 681 snapshots (1.9 %; the round-2 census, blind to hanging pieces,
27 in 674). The round-2 residue stands as judged (remnant piers 1.1-2.9 m over the drawn wall or heap, rooms and rims of
held storeys and open frames, fallen objects' faces, the panels on their edge at the ground beside a ruin: autumn #0,
caldera #28, skybridge #13); what the hanging judge adds (the first three seen in their renders): the sheave's bearing stands on a
headframe's deck once the hit takes the wheel (copper_mesa #38, bolted at their feet: their diagonal legs read 50 %), a
water tower's top X-brace bolted at the posts' heads (copper_mesa #35), a fire station's hose-tower legs bent up inside its
lattice (foundry #4), a 1 m steel remnant 1.1 m up on a late joiner's ruin (delta #12), the troposcatter hut's chunks on
the reflector's fallen frame (whiteout #21, as on main), the megatower's and needle tower's held-storey members and rims
(ruinspires #1 and #3, skybridge #7). Open: a dark chimney cap 9 m up on a tavern's falling roof side during its roof's
sections' fall (frontier #15, narrow face), a windmill's cap read cut loose in a late joiner's page after the first hit
(polders #46), three thin steel members the terrace tower's roof pass leaves 3 m up (skybridge #20), and two roof slabs
on wall heads (caldera #27, whiteout #3). The kinds receipt passes on the same code from its dump: 393 kinds, 667 runs
(one face by name and each roofed kind's roof pass), 9,252 snapshots, 32 judged findings — among them a roof slab the
rigid world launches 200 m up in badlands #0's roof pass (round 2's collapseBodies does the same: open). The anti-raft
probe: 24 below the floors (main 28), the same four explained as round 2.

**Round 4 (2026-10-18, the round-3 critics: a fallen roof slab floating past the walls on faces and seeds no census ran,
open defects excused in the kinds receipt, the branch not merged with its base, the tavern's dark lid, phones, props CPU,
the sweep's frame cost).** The branch carries `origin/integ/228` (merged twice: `927cf20ac`, `2ca160d6c`). What the round
adds:

- *No debris plate rests on its edge* (`src/fx/uprightPlates.ts`). A body's drawing is often more than one connected piece
  (a wall cell's skin and the dark interior plate behind it, a clump's two faces at a corner, a set piece's gable and its
  eave boards), and a body that lies well on its box can hold one of them bolt upright: a 3-12 m plate standing beside the
  ruin. `layUprightPlates` reads a resting drawing in world space, splits it into its pieces (corners welded at a
  millimetre, as the slab check splits them) and lays every upright plate (a hand thick, 1.6 m and more each way, standing
  1.4 m and more) on its broad side onto the ground under it (the middle of the ground's spread there, never over its old
  foot). It runs where a drawing comes to rest: the fracture's heap (`mergeBaked`), a collapse's bake, a set piece's
  dropped piece (laid settled, at its tween's end, asleep a moment, at its bake). A set piece's plate its box does not lie
  along (a roof slope across a box near square in section) falls as a tween to its broad side, and a dropped or slumped
  piece that is a plate standing up lies on its broad side (`restPose`).
- *No remnant stands over the building as drawn* (`clampPieceTops`, from `structureStages.run` after each commit): a
  remnant run's pieces are cut to half a metre over the enclosure's drawn height where their tops stand (a piece wholly
  over it, a held storey's member, stands; where the drawn form is unknown, as drawn). The round-3 census's 242 runs of
  piers 1-7 m over the drawn wall (a fire station's steel stub, a stack's stump, a ruin's collapse stub) are gone.
- *The ruin's roof sections lean*: `collapseRuin.roofSlabs` stood up to six of the covering's plates 5-7 m across bolt
  upright over the heap (caldera #28's warehouse: a row of billboards). They are sections a bay across (3.2 m at most) leant
  on the heap from a buried edge, 25-40 degrees off the vertical, their tops over the drawn plan.
- *A lattice column as broad as a wall falls as a block* (`latticeFall`): tselina's gantry tower, read as one leg 4.4 m
  across, folded its upper length as an open tube whose side stood 2.7 m up on nothing; its stub is capped and its upper
  length lies on the ground beside it, closed, broken in two. A ruin's loose post stands plumb over the cell it was read in.
- *The slab check reads what it was blind to*: `on end` — debris at rest (rubble runs, baked heaps and rests, settled bodies
  and set-piece pieces) standing upright with its top 2.2 m or more up, inside the walls too (caldera #28's billboards stood
  inside the walls, where no rule looked); an upright face with another piece drawn right behind most of it (0.35 m either
  side) is that fallen object's side (a windmill's cap on the ground, a slumped set piece's shopfront), not a plate in the open.
- *Phones* run the hanging sweep (the kit's holes, falls and heaps; the stages' sweep alone, a third of the desktop's work a
  frame, a pool of 16 for its drops), and the slab check models it (`--fracture=phone`).
- *Roof bodies and launched debris*: a roof body at rest that perches (a third of its drawn plate over nothing a metre up,
  or on its edge high) breaks up; a flat slab over a standing shell gets one inward shove only; a solver step adds at most
  4 m/s or 5 rad/s to a debris body and debris speeds are capped (8 m/s up, 35 m/s, 12 rad/s): badlands #0's roof slab
  thrown 212 m up and copper_mesa #37's piece thrown 46 m are gone. No fracture body bakes standing on its edge.
- *The tavern's dark lid*: no room ceiling under a fallen roof (rooms laid after the fall are open; the top storey's earlier
  rooms lose theirs with it).
- *Faces with no flat wall* (Lane B's penstock patch and its flying chunks): the fracture refuses a face that draws no flat
  wall in its slab, a round there lays nothing, and the default kit lays a rim only where the wall runs flat across the
  hole; a bodyless set piece lays no body-kit stub, an open frame's section falls lay none either.
- *The sweep in time*: a building's intact reading is made from its first hole (frontier #15's chimney cap hung 2.9 s while
  the first sweep built it); a kit hole asks for the sweep; its puts run in chunks and its face pieces are kept per mesh
  state. The intact and enclosure measures are made when first asked for, off the props build.
- The slab check waits for rest before its last look and judges each phase with its records as they stood.
- *No plate rests perched* (round 4, third pass: the census on `d139fe6ee2` at three random seeds a face found the last
  three of the owner's floating plates — airfield #0's tower baked a 3.8 x 2.8 m chunk into its heap 1.7 m up, 57 % of it
  over nothing; badlands #0's caravanserai a 4.5 m square plate 1.2 m up in its yard; caldera #27's fire station a roof
  sheet 2 m up, 43 % over nothing, as it collapsed). `layPerchedPlates` (`src/fx/uprightPlates.ts`) reads what comes to
  rest — the fracture's heap as it merges, a collapse as it bakes — for flat plates and chunks (up to 0.6 m through, 1.6 m
  and more each way) lying 0.9 m and more over the ground with 30 % and more of them over nothing within 0.8 m: no ground,
  no solid record, no body's contact sphere (`createPlateHold`), no other drawn piece of the heap, the building's other
  heaps or remnants. Each is tilted off the edge of what holds it until its lowest corner meets the ground (at most 50
  degrees: a slab leant off the heap), or, held by nothing, lowered flat onto the ground under it. A roof slab or sheet left
  at rest is looked at again once it has moved a third of a metre off where it was left (caldera #27's sheet crept down
  with the storey under it, never fast enough to count as moving), and a roof body's perch is judged by the plates it
  draws before its box (that sheet's box read steep while its plate lay flat).
- *A body does not hold itself up* (fourth pass: the census on `5a6df978e7` found the same tower at a fourth seed with a
  4.2 x 3.3 m chunk 1.7 m up in its heap, 66 % of it over nothing). A clump draws its skin and the dark interior plate behind
  it as two pieces a hand apart, and each read as the other's hold. A piece of a plate's own body (its drawing; a fracture
  body's or a collapse part's other meshes, `PlateDrawing.body`) holds it only reaching 0.3 m lower than it (a slab on its own
  stub), never as its twin beside it.
- *The sweep's steps* (the round-3 critic's 12-20 ms single steps): a crowded voxel's sample pairs are read a run pair at a
  step's share, and the ground columns a step's share at a time. Measured before and after on the same machine (thread CPU
  around the sweep each frame, load ~215, `r4/s3/perf/sweepframe.txt`), this changes nothing that shows: p99 9.5 ms
  (verdant #9), 9.4-10.4 ms (urban #15), 14-15 ms (skybridge #27), at worst 15-20 ms. A CPU profile of skybridge #27's
  steps over 4 ms (`r4/s3/perf/prof`) puts them in `putInto` (27 % of their samples), `heldSteps` (19 %) and the voxel pairs
  (20 %): those units are counted at a fraction of their cost against SLICE. Open: weigh them at their cost (a step's
  frame cost down, a heavy sweep spread over more frames, the slab check's 2 s hanging window to be re-read with it).
- *The kinds receipt's KNOWN* is bounded: an entry excuses a finding of its building, mesh and reason only up to the
  largest extent judged (the round-3 critic: any new finding of that class on that building was hidden too).

**The census (2026-10-19, round 4).** On `9f60f6522f`, every map and destructible kind (a builder each) from all four faces
at three seeds each drawn at random (`r4/s4/final/census/seeds.txt`): the A pass (60 rounds up storeys 0-3, every phase, the
late joiner's replays) and the R pass (to the roof's fall, judged standing roofless). 8,184 building runs, 145,605
snapshots; 14 buildings flag, in 863 snapshots (0.59 %; blackglass's A pass and ruinspires' R pass, every face in one job,
hit the 4 h alarm at a load of ~290 and ran again a face a job: blackglass clean, ruinspires its KNOWN held storeys). (The
census on `5a6df978e7`, stopped at 120 of its 207 jobs when the runtime moved, found airfield #0's chunk above.) What flags
is named. Three are the owner's kind, each at one face and one seed, each while the building falls and gone by its settled
ruin (open for round 5): a 3.7 x 3.2 m plate of airfield #0's fracture heap 1.3 m up while its storeys fall (R narrow, seed
1147584926: held when it baked, 62 % over nothing at 6.45 s and 95 % by 9 s as what held it went, until the collapse took it
at 10.9 s), a 4.2 m roof slab on badlands #0's wall heads 2 m up, 75 % past the walls, for a second of its collapse (A
narrow, 725095366), and a 1.3 m dark face piece of blackglass #3 2.1 m up at one look (R narrow-back, 978345481). Two more
are single looks in flight (a 2.4 m timber part of foundry #0's roof 7 m up, a 36 m pilaster strip of ruinspires #1 1.7 m up
half held), and one stands: a 1.4 m post 6.6 m up in fjord #0's roofless fishery (R narrow-back, every seed), 40 % held,
inside its walls. The rest is the kinds receipt's KNOWN, at every seed and face it ran: the megatower's held storeys
(ruinspires #1: a joist end, its rims), an arcology's rim 1.8 m up (ruinspires #3), the terrace tower's thin members 3 m up
(skybridge #20), a hall's ruin post read off its wall (airfield #12), a 1 m remnant in a late joiner's set (delta #11), a
temple's roof beam held over its drawn height (delta #31), a factory's remnant wall at the plan's downhill edge (foundry
#0), the lunar mill's vane plates in a late joiner's page (moon #11), a container row's 1 m baked remnant (steppe #8) and a
guyed mast's two guys strung up to its fallen head (whiteout #25: wires, read as a plate). The kinds receipt passes on the
same code (a full fresh run): 406 kinds on 33 maps, 682 runs, 9,470 snapshots, 11 judged findings (round 3: 32). The phone
(`--fracture=phone`, six maps, A and R, all faces): 544 runs, five buildings flag, each a piece the phone's slower sweep
takes down 0.5-2 s past the check's 2 s, all down by the standing end (desktop and the round-3 critics' repros pass). The
anti-raft probe (1,985 structures): 13 under the floors, integ/228 4, none a raft: skybridge #12's mast, the moon's two
relay masts and fjord #65's rack lie as lattice wrecks (frames: their intact p90 is the mast head), longleaf #11 is a ruin
already (0.235), steppe #0's water tower and the moon's ISRU works and dome stand a hair under (0.224-0.247), whiteout #19's
tank farm falls inside its plan (0.584), and the moon's Apollo site falls to a few struts (its lander's legs read as a
frame; integ heaped a skin ruin six times its plan). Lane B's darkbox-repro on the post mill (verdant #17), the smock mill
(verdant #18), the headframe (copper_mesa #39) and the penstock (skybridge #2): no room, no triangle taken, no wall patch,
no body thrown.

**Open after round 4.** The tavern (reservoir #7) in the game's film ends with its top storey under one flat dark plane at
its wall heads once its roof has fallen and it stands breached: the film's rounds (the census's, cycled) leave it standing
roofless for ten seconds, the Node check's bring it down by 6.15 s, so no receipt sees it (a CPU-rendered page did not boot
in 25 min; a look inside the game needs a capture hold). The sweep's frame cost under load (above). The phone's late sweep.
The three transients above, and fjord #0's post.

**Round 5 (2026-10-20, the round-4 critics: three of the owner's floating plates at fresh seeds, the roofless storey's dark
lid in the films, the open items, polders' collision changed for a drawing, the world-events flake, the ruin probe, the
churches never taken to their end, the mills' pops).** The branch carries `origin/integ/228` (ac0a12960c, nothing new).

- *A heap's plate held when it baked is watched* (airfield #0's tower, R narrow, seed 1147584926: a 3.7 x 3.2 m plate of its
  heap 1.3 m up, 62-95 % over nothing from 6.45 s to 10.9 s as the storeys under it fell). The fracture's merged heap keeps
  each vertex's body (`heapBody`) and the plates `layPerchedPlates` finds held as they bake (`watch`: their vertices and
  triangles); they are judged again five times a second while the building changes (a strike, a face's or a storey's
  fall, its release) and once a second after, and one whose hold went is laid down as a plate coming to rest is. A body's
  contact sphere holds a plate only from under it (its middle below the sample, within 0.15 m of it in plan) and only
  moving under 1.5 m/s: the tower's chunks falling past the plate read 79 % of it held, the slab check 38 %.
- *A roof body's plates are judged past the walls each by itself* (badlands #0's caravanserai, A narrow, 725095366: a roof
  sheet whose body's box ran 15 m along the heap — its middle 0.6 m up — drew a 4.2 x 4.1 m plate at its end lying flat
  2 m up across the wall heads, 75 % past them, for a second after the collapse). `highPastWalls` reads each flat plate the
  body draws (4 m² and more) as the slab check does: its underside 1.5 m or more over the ground at its middle and 5 % or
  more of its surface past the walls at its height send it to the shove or the break-up.
- *A young sweep starts over when its building changes* (blackglass #3's civic hall, R narrow-back, 978345481: a sweep begun
  before its section's faces were drawn ran on 1.3 s blind to them, the next took 1.6 s more, and a dark face piece the
  redraw cut loose hung 2.5 s). A sweep under 0.8 s old over a building that changes again is dropped for a fresh one, twice
  running at most (a barrage cannot starve it); the piece now goes 1.6 s after its redraw.
- *The roofless storey is open to the sky* (the films' tavern #7 and depot #8 on reservoir and urban church #15: the top
  storey under one flat dark plane). It was the storey's room — laid dim (0.55-0.6: an interior glimpsed through a hole),
  its ceiling at the wall heads — read from above as one dark lid; its ceiling went only when a wall fell after the roof.
  With the roof's fall the top storey's rooms open at once (`openTopRooms`; the fracture's `roofFell`): their ceilings go and
  they are lit as the sky lights them (a kit room's walls 0.95, its floor 0.85; the fracture's without ROOM_SHADE); rooms
  laid after the fall are laid so. A room's floor stands 2 cm over its floor line (the storey under it draws its top there:
  the two fought). The slab check reads it now (`open room`): once a roof has fallen, a top-storey room that draws a
  ceiling or stands in an interior's shade is the lid. On the round-4 runtime (9f60f6522f) reservoir #7's and #8's roof
  passes flag (a 134.6 m² ceiling, rooms in shade); at the head they pass.
- *A set piece's pieces fall into their place* (polders #46's tower mill lost its upper shaft, cap and sails in one 100 ms
  step, their wreck already on the ground; verdant #17's post mill swapped its body and lost its sails the same way). The
  E12 kit reports each piece it lays at rest by one rigid turn (`DamageStageResult.falls`); a live stage shows a copy of the
  piece's own triangles turning and dropping to that pose over gravity's time (0.45-1.6 s, eased in), and the stage's laid
  copy shows when the fall ends (`structureDebris.showFrom`); a late joiner's settled stage lays them at once.
- *Polders' collision is integ/228's again* (the critic: round 2 regenerated the tower mill's shards — 100 colliders and 2
  obstacles, each course's solid 16-sided record replaced by about 30 chunk prisms over a third of its footprint — for a
  change that was the drawing's alone). A landmark builder may hand the composer its collision's own parts
  (`LandmarkBuild.collision`): the tower mill's are its upper shaft's closed revolve (the drawing's chunks out) and its
  windshaft first in its bucket, finished (weathered) as the drawing is. `polders.json`, `polders@assault-trenches.json`
  and `index.json` are integ/228's bytes; `--check` passes both variants.
- *The churches' end.* Verdant #9 and #18, polders #48 and saltwind #18 are set pieces over LIGHT_SETPIECE_MAX_M3, so
  landmarks (`setPieceMassClass`, sim/structureDamage.ts: collapsible false, breach-only by §3.2): no round brings one
  down in battle, and their end is the breached stage with every named piece down. The census takes them there (240
  rounds, the late joiner's replay of that end). Urban #15 (a franconian regional church, collapsible) goes through its
  collapse, settled ruin and late joiner in the census's A passes, and the coverage film runs it 28 s.

- *A collapse carries the fracture's faces down with the walls* (the round-3 critic's film: verdant #8's mill lost its upper
  storey between two frames as it fell, nothing falling, only its dust over the gap). With sections on a collapse is the
  mask's — the walls crumble along a front for COLLAPSE_S and fold — and the faces the fracture had redrawn were taken away
  at the collapse's event. Every face and room the fracture draws now carries its building's stage-run tag (aDamage: it
  falls with the collapse, no hole cuts it) and its bucket's patched depth material; a collapse keeps them drawn
  (COLLAPSE_S + 2 s) while the mask carries them down and folds them; a late joiner's settled collapse lets them go at once.
- *A part over the eaves stands only held over three quarters of it* once the roof has fallen (half before; the slab check
  calls a quarter less than it was held hanging): fjord #0's 1.41 m truss beam 6.6 m up, 40 % held, goes with the roof at
  seed 421748. R passes on verdant, reservoir, frontier and urban at one seed: 67 → 75, 64 → 64, 72 → 87, 120 → 123 parts go.
- *A heap's watched plates are judged only while their building changes* (and 20 s after): nothing under them moves else.
- *A set piece's body that rocks on the heap lies where it is* (the census: airfield #8's fire station on the phone, every
  face at two seeds — a 4 m square plate of what its sweep dropped lay 1 m up with half of it over nothing to the end: its
  body rocked on the heap, never asleep, and never baked before BAKE_AGE_S). A landmark body six seconds old moving under
  0.3 m/s and 0.5 rad/s bakes where it is, and a landmark piece laid at rest — baked, its tween ended, or laid with no body —
  is laid as a heap's plate is (`layPerchedPlates` with the bodies' contact holds): none of it perched over nothing.

- *The roofless storey's lid, as round 5's own films showed it* (`films/r5/after-46cdbbd2e3`: reservoir-s7-tavern-look and
  urban-s15-church-narrow-back-look-r5x). The tavern's roof came down as bodies — three slabs at rest on its top floor and
  across its wall heads, from the film's camera one flat dark slate plane to the clip's end, which the slab rules pass by
  design (inside the walls, "a fallen roof where it belongs"); the church's nave roof came down through the hanging sweep,
  no roof section falling, so its top storey never opened to the sky. A roof body at rest inside a standing shell drawing a
  level plate with 6 m² or more of it in the top storey (over its floor line, up to its wall heads; `lidOverShell`) is the
  lid: the slab cracks into its sheets and a sheet breaks up where it lies, its dust and broken tiles thrown. A roof whose
  triangles the sweep took more than half of opens its top storey as a roof's fall does (`roofDropped`, the fracture's
  `roofFell`). One room a storey (the kit's and the fracture's were laid one over the other and fought), and an open room is
  lit a quarter under the sunlit face (the films' glare on its walls). The slab check reads the lid (`lid`: a fallen roof's
  plate at rest in the roofless top storey, 8 m² inside its walls — the runtime acts a quarter under it: fjord #0's fishery,
  R narrow-back 854166144, left a 2.9 x 2.4 m sheet on its top floor that the runtime read at 7.97 m² and the check at 8.1)
  and replays a film's own strikes (`--strikes=<frames.json>`): the census runs every round-5 film's strikes (its F jobs).
- *A room holds nothing up* (the census on 46cdbbd2e3: cliffbridge #24's farmhouse chimney stood over its roofless gable to
  the end, held by its top storey's room; copper_mesa #0, polders #5 and whiteout #0 had pieces cut loose since
  e9b378bcbc). The sweep reads a room as touching nothing it holds, and samples only what the room draws (its draw range: a
  ceiling gone with the roof holds nothing). Fjord #0's 1.41 m truss beam (round 5's open item) no longer flags at any of its
  three seeds (R narrow-back 1114308791, 732685761, 854166144; `r6/s3/fj`, `r6/s4/v1`).
- *A tilted plate held by nothing is laid flat* (airfield #0's tower, R narrow, seed 1926340207: a 3.3 x 2.6 m plate of its
  heap tilted 1.1 m up over nothing from its bake to the settled ruin; `layPerchedPlates` read flat plates alone). Plates
  tilted up to 0.8 of their normal's rise are judged; one held by nothing turns flat about its middle and is lowered onto
  the ground.
- *The default kit's rim only where a wall is read behind both its edges* (verdant #9's church, A narrow-back, seed
  1872341908: a hole at its cornice's corner laid its rim on round the corner, a quarter of it in the air past the walls
  10 m up to the end).
- *A sweep still making its building's intact reading starts over at no cost* (the census's phone tavern #7, reservoir Q
  narrow 637292818: the sweep begun at the first hole made the reading for 6.4 s, then read the meshes it had listed at its
  start, blind to the remnants its roof's fall laid 1.4 s in; they hung to 8.6 s). A change during the reading restarts the
  sweep (the reading's steps outlive it), and a sweep's age counts from its reading.

What stays open after round 5:

- The phone's late sweep. A struck building's intact reading is made from its first hole at the phone's budget (4 steps
  of 4,000 units a frame, a third of the desktop's): reservoir #7's tavern (Q narrow 637292818, `r6/s4/sw-rv7q.err`) has it
  made at 6.13 s, the sweep after it done at 7.98 s, so the roof's remnants on its gable heads, laid as the roof fell under a
  barrage of a round each 0.45 s, hang from 1.7 s to 7.98 s (desktop, same seed: gone inside the check's 2 s). Polders #0's
  mill and urban #182's corner shop on the phone are the same (`r6/s3/ph1`); at a duel's pace (a round each 6-8 s) the
  reading is made before a roof falls. Not shipped: a bigger phone budget for the reading (its frame cost) or a reading made
  before the first hit (its memory for every building).
- The sweep's frame cost (thread CPU per frame with sweep work at 4edd9817a9, load ~120, `r5/perf/sweepframe.txt`): verdant
  #9 p99 9.2 ms (round 4: 9.5), urban #15 p99 15.0 ms, 2 frames over 16.7 ms, its total 739 ms over a 24 s barrage (623: a
  restarted sweep's work is redone), skybridge #27 p99 11.9 ms (14.2). Weighing its units at their cost is still to do.
- The anti-raft ruin probe's ten below the floors that integ/228 kept above them (round 4's list): none is a raft. Skybridge
  #12's broadcast tower (0.079 of its intact p90) is its 3.7 m hut's ruin against a 32 m mast's p90 — integ/228's 0.413 was
  the 13 m stone stub round 2 took out from under the lattice mast; the moon's relay repeaters (0.09-0.10), its Apollo site
  and fjord #65's rack read as frames now and lie as lattice wrecks; steppe #0's water tower (0.224), the moon's ISRU works
  (0.243) and dome (0.247) stand a hair under; longleaf #11 (0.235) is a ruin already; whiteout #19's tank farm falls
  inside its plan (footprint 0.584).

@CENSUS5@

**233/238 (2026-10-22; the owner's "weird ugly boxes/surfaces": the roofless storey's lid).** In production's own film of
the round-4 strikes on reservoir's tavern #7 (depot #8 the same way), the near-black plane over most of the roofless top
storey is the far wall's inner face in its own shade (named by the slab check's false-colour replay of the film's
strikes: the fracture's room, `fx-fracture-room-7`). The pale strip in front of it is the sunlit floor. The room material
is not one of the engine's shadow materials (`engineCtx.setupShadowMaterial`), so it is lit as no world material is:
every cascade's sun at once (the round-5 films' glare on the inner walls) and none of the world's sky fill in shade (this
plane). Rooms behind holes keep it, dim by design. A room open to the sky now draws in its building's own world material
(`roomMaterialFor(source, open)`; `openRoomMaterial` when its roof falls after it was laid), lit as the building's
outside is: the faces the fracture redraws and the kit's rims already draw in it. Both the kit's room (`layInterior`,
`openTopRooms`) and the fracture's (`roomFor`, `roofFell`) use it, at the face's own tint (OPEN_ROOM_SHADE 1, the kit's
OPEN_ROOM_WALL/FLOOR 0.95/0.85: the quarter under them was round 6's answer to that glare). The fracture's room now also
draws its walls in the face's render or infill (an interior is plastered; it drew the face's core, the tavern's timber
frame, one dark board wall), its floor in the storey's own floor structure and its ceiling in what carries the storey
above (it drew all three in the core's bucket), one mesh per bucket, as the kit's room does.

**238 (mill; the integrator's critic on 233: polders #46's upper tower sank through its stage, then hung over it).** The
tower mill's stage (stelling) has 4,416 triangles, over the kit's PIECE_TRI_CAP. It is a named piece, so the body leaves
it out, and it is over the cap, so the kit never keeps it: it stood for good and nothing in the kit knew. The upper
shaft's chunks, the cap and the sails were laid on the mound under it, along straight paths through its deck. A piece
too large to keep is now `plan.standing` (its top, its floor, its plan outline in 32 directions).

- *Thrown past what stands.* Falls are thrown (structureStages `fallMatrix`: out in proportion to the time, down in
  proportion to its square), and `fallWay` lands a high piece far enough out that its arc clears what stands.
- *A course that stands on it breaks into debris.* A piece that stands on such a thing, or one no throw within 10 m
  clears, crumbles where it stands (`DamageFall.crumbleS`, with `debris`). The tower mill's lower course stands while
  the upper course, cap and sails leave it. It breaks at 0.5-0.7 s, as the cap coming down onto it reaches its ragged
  top, so no gap opens under what falls (in the critic's film the lower course had gone at 2.0-2.2 s with no debris,
  and the upper walls, cap and sails hung over the bared stage). It breaks into 36 pieces of its own wall, sampled over
  its surface by area and thrown over the stage's deck (`breakUp`; `crumblePiece` throws them as it breaks), with its
  dust and shards (the stages' new `onLanding`/`onShards`).
- *A fall lands without spinning.* Its turn is eased in and out. In the critic's film a chunk turned a fifth of its
  turn in the last tenth of its fall and flipped from its pale inner face to its brick, "a box swapped".
- *A piece laid again by a later stage waits for its fall.* At 2.2 s production showed the second breach's copies of
  the falling chunks on the mound, with no flight before them. A fall that ends before its stage's longest lies at its
  end until the laid copies show.

At the builders' defaults the tower mill is the only set piece with a piece too large to keep that the rule reaches
(the house row's houses slump; the troposcatter is an open frame, through which what falls goes).

**265 (the kinds receipt's run time; 2026-10-30: Ruinspires past the suite's 25-min map limit, over 45 min alone on main,
about 3.3 GB).** Not a regression: a bisect on first-parent main from the receipt's landing (`d10335307e`, 10-21) to
`ccb2041c41` reads the same CPU on a fixed sample (Verdant's chapel, church and station hall 13.7 s then, 11.8 s now;
Ruinspires' megatower 15.6 s and 14.6 s; its arcology 105 s and 106 s), and the work has not grown since round 4 (406
kinds and 682 runs then, 407 and 681 now). Two things made it long. The hanging judge's held share scanned every sample
of the plan cells round each cell of a piece's envelope for the few in its 0.9 m band, and a tall building's plan cell
holds every storey's samples: on the arcology and the megatower that was nine tenths of their runs, which never cache
(each carries a judged finding), and Ruinspires ran in one worker, 17th of 33, so on a machine at load 250-500 (a run's
wall time 10-15 times its CPU) the map passed its 25 min of wall. And every change to the closures the destruction code's
hash reads, most releases, ran all 681 runs again, with every map built every time.

What changed (each judged against the base on the same input, call for call: the same findings). The judge reads each
plan cell's samples by height, packed, a held share reading its band alone; a propagation reads each open piece's
envelope once (its cells' ground and floor, and the owners in band round them) and each round only who of them has
come to bear; clusters keep the presentation's samples in voxels of their own and skip voxel pairs of one owner. On the
megatower and the arcology the judge's CPU is 88 s to 16 s and its intact readings 32 s to 6 s (a dual judge, the base's
and this one on every call: the same findings); the arcology's two runs 105 s to 26 s, each in a 1 GB heap as before. The detector builds the vegetation as the battle does (far grass deferred: on
all 33 maps the same spans, anatomy, enclosure and collision records, byte for byte, for 30 % less vegetation CPU). The
receipt's pool takes builds and runs, not maps: a worker with no map left shares the heaviest map's runs, maps and runs
go costliest first by last time, and every run's fingerprint as it starts must be its listing's (a set piece's kit
copied the anatomy's mound onto its plan at its first stage, so a run's fingerprint moved with the runs before it in a
build: the copy is no longer read; a map's runs in reverse on a fresh build match them run for run on Copper Mesa and
Polders). A run whose findings are all judged exceptions keeps them with its fingerprint (judged again against KNOWN
each time), and a map listed from the same inputs (the detector's whole import closure, the receipt, the staging) with
every run passed is not built. Guards on each worker's own clock: a build or run over 120 s of CPU, or whose clock stands
still for 10 min, is stopped and named; the receipt fails over its CPU budget (60 min); a stray slab planted in a building of the
first map built must fail the verdict. A real defect fails it too: `ANCHORED_M` back at 0.4 m (landmarks/damage.ts)
fails it on Whiteout #32 from its narrow back, its guy's 21.6 x 2.7 m debris plate on end with its top 19.9 m up, as
world-reds 264 found it. The salt the fingerprints share is keyed on the environment as the runner keys a receipt: the
runner's graph guard named the checkout's path, so no worktree met another's passes.

Measured alone, the receipt through the runner (the machine at load 100-380 all day; CPU reads the same at any load, wall
time does not). Every run (the destruction code changed): before 95 min, 44.9 CPU min, peak footprint 11.0 GB; after
20-43 min, 37-42 CPU min, 10.0 GB (six workers at 2 GB heaps; no run longer than 17 s of CPU, so on an idle machine
about the CPU over six). Nothing changed: before 31.7 min, 13.2 CPU min, 7.4 GB (every map built, the judged runs run);
after 3-6 s, 1.5 CPU s, 0.2 GB. A world change with every run passed (every map built): after 5.9 min, 8.5 CPU min, 6.3 GB.
