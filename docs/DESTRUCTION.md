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
| hit points | `HP = 5·√V` structure points (SP), floor 25: shed 60 m³ → 39, house 560 m³ → 118, warehouse 7,200 m³ → 424, landmark 50,000 m³ → 1,118 |
| records | indices of its contact/movement records (obstacles) and shell bands (colliders) |

Measured on the 33 shards (AABB × height, an over-estimate): p10 237 m³, median 1,103, p90 4,149, p99 44,409; by the
thresholds about 150 sheds, 986 houses, 241 large and 33 landmarks.

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

Each structure splits into sections derived from its collision records alone (a host has no rendered kit): each wall
face of its footprint rectangle (the band parts within 1.2 m of the face) in height bands of 3.2 m (a storey), and the
roof (the bands above the eaves line: the highest 30 % of `topY − baseY`). The kit's anatomy keeps its own storeys and
faces; the world maps the core's sections onto them by geometry (§16.2). Each section has its
own hit points (its share of `V`), takes the blows that land in it at full weight and passes 40 % to the whole. A
breached wall section carries up to four holes (`StructureBreachEvent`): a hole is a vertical cylinder of radius
`r` through the wall's thickness that shells and sight lines pass (`shellPassesThroughCollisionRecord` checks the
record's hole list before a band part counts as a hit). A section brought to zero falls (`sectionDown`): a roof or an
upper floor removes its bands; a wall face removes its bands down to 1 m (the stub stays cover). A landmark loses
sections but never the whole.

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

A contact burst of a 125 mm HE shell deals 12 SP (a house takes ten); a 152 mm howitzer shell 24; the gunship's
howitzer 70 (a house in two); its missile 38; an ATGM 8; an FPV warhead 3; a cook-off beside a wall 25. A near miss
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
SP = max(0, E − 120 kJ) / 40,   E = impactEnergyKj(massTons, v) = ½·tons·v²   (kJ)
```

60 t at 10 m/s → 72 SP (a shed collapses, a house is breached); 45 t at 15 m/s → 123 SP (a house comes down); a hull
nudging a wall at 2 m/s → nothing. The hull still takes its own crash damage from the impact law; a structure that
collapses under the blow stops being hard in the same tick, and the crash's remaining closing speed is not priced again.

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

| Class | HP | Damaged | Breached | Collapses | Typical killers |
|---|---|---|---|---|---|
| shed | ~40 | 28 | 14 | yes | one full-speed ram; two 152 mm shells; four 125 mm HE |
| house | ~120 | 84 | 42 | yes | ten 125 mm HE; two gunship howitzer shells; a 45 t hull at 15 m/s |
| large | ~420 | 294 | 147 | yes | six gunship howitzer shells; a TOS salvo |
| landmark | ~1,100 | 770 | 385 | **no** (floor 5 %) | — |

Collapses are queued: at most two structures change collision per tick (FIFO in authority order); a third waits for
the next tick. HP and the stage transition are decided at the blow's tick; only the collision swap and its event can
lag by a tick.

## 6. Collision, line of sight and navigation

- **Collapse** sets `crushed` on the structure's contact and movement records (movement, the support field and the
  route grid skip them) and `crushed + dead` on its shell bands (shells and sight lines skip them). The grids are not
  rebuilt: flags, as for every other destroyed record. The rubble mound joins the ground (§7).
- **Breach holes** (P2): the hole list on a band record makes `rayCollisionRecord` pass a ray whose entry point lies in
  a hole; spotting's `hardLos` and the shell traces read the same raycast, so sight and shells open together.
- **Hulls on or in a collapsing structure**: a hull standing on the roof loses its support and lands on the rubble
  (the impact law prices the fall); a hull inside an open-plan footprint is lifted by the mound like any slope (the
  mound under a hull's footprint at the collapse tick is capped at its belly + 0.4 m, so nothing launches).
- **Bots** read terrain crests and the world raycast live, so cover and sight lines change by themselves. The cached
  piece is the route grid: `refreshNavigationArea(grid, minX, minZ, maxX, maxZ)` re-samples the blocked cells, the hull
  edges, their bends and the components of the cells under the footprint plus one cell (at most 16 cells, 128 edges;
  the wreck overlay's pass is the model). Called by the solo step and the authority with the same footprint, so bots
  route identically in both. Routes in flight are replanned on their cadence.

## 7. Ground deformation (craters and rubble)

`sim/terrainDeformation.ts` holds a per-match overlay of stamps:

- **crater**: a bowl `−depth·(1 − (r/R)²)²` inside `0.8 R` blending into a rim `+rim·exp(−((r − R)/0.35R)²)`, ragged by
  `seed` (a three-harmonic angular wobble of ±8 %), influence radius `1.6 R`;
- **rubble**: a mound over the structure's footprint rectangle, height `clamp(0.18·(topY − baseY), 0.6, 2.6)` m on the
  inner 70 %, a cosine skirt `max(3, 2.2·h)` m wide beyond the footprint edge (grade under 25 %: every hull climbs it).

Stamps are bucketed on a 16 m grid (64 × 64 heads, ≤ 8 stamps per bucket). The sum is clamped to [−2.5, +3] m.

**Sampling.** The match's height field is wrapped once (`createDeformedHeightField(base, overlay)`):
`getHeightAt` and `getHeightAtFast` add `overlay.offsetAt(x, z)` (one bucket read when the bucket is empty, the common
case); `getContactHeightAt` adds the offsets of the containing triangle's three lattice vertices with the same
barycentric weights (`terrainContactSurface.ts`'s lattice and diagonal), so the contact surface equals a mesh whose
vertices moved by `offsetAt(vertex)` — exactly what the presentation draws; `getNormalAt` differentiates the wrapped
height. The wrapper is per match: the authority's terrain cache and the solo world cache keep the base untouched, so
no stamp leaks into the next battle or another match in the same process.

**Bounds.** At most 160 craters per match deform the ground (`rules.maxCraters`); the rest, and any crater whose bucket
is full, are marks. Rubble mounds are one per collapsed structure. The overlay never shrinks within a match.

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
destroyed-prop list: a snapshot carries it whole in a keyframe and the entries after its baseline's revision in a
delta (`writeDestructionLog`, a varint count and compact binary entries: stage 4 B, crater 13 B, breach 16 B); the
meta carries its revision. A client lays down every entry its presentation has not seen live as `settled` (no
animation, no sound), except an entry whose event it still owes (the `destroyedPending` rule).

### 8.3 Host migration

The sealed migration keyframe's frame carries the log. `RetainedMigrationState` keeps every destruction event the
seat received (as `fallen` keeps prop falls), and `resumeStateFromRetained` merges them. `applyResumeState` calls
`authority.restoreDestruction(log)`: stages and collision swaps, craters and mounds applied without events. Hit points
are not on the wire: a damaged structure resumes at its stage's upper bound (70 % or 35 %), a small gift to the
building, documented and bounded.

### 8.4 Identity across layouts

Every event carries the structure's footprint centre and class (`StructureIdentity`). The presentation resolves the
id against its own world's structure table when the layouts match (desktop tier, base terrain), else by identity
(centre within 5 cm, same class), else applies nothing (the host's world still decides). Craters are positions, valid
in any layout.

### 8.5 Budget

The wire sends one EVENT message per viewer per tick and drops the whole batch above 64 events
(`MAX_EVENTS_PER_MESSAGE`). Destruction adds at most: 2 collapses + 4 other stage changes + 4 craters per tick (the
overflow of stage changes waits a tick in the authority's FIFO; craters past four in a tick become marks). The
reliable queue treats `structure_stage` (collapsed) and `terrain_crater` as heavy beats. Bandwidth: a full late-game
log (300 stage entries, 160 craters) is 3.3 KB in a keyframe.

### 8.6 Audits

The world-events audit (`tools/mp-world-events-audit.mjs`) logs the new kinds and judges them like
`world_prop_destroyed` (missing, duplicate, late, settled on rejoin, re-destroyed on migration). The determinism audit
hashes structure hit points, stages and the overlay's stamps.

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
| A collapse (flags, mound stamp, nav refresh) | ≤ 2 per tick | < 0.5 ms each, measured worst frame |
| Height query overhead | one bucket read | < 0.02 ms per frame at 4 k queries |
| Crater mesh update (P3) | lattice vertices in `1.6 R` on each LOD | < 0.3 ms per crater, no allocation |
| Memory | 160 craters + 400 mounds × 48 B; 8 KB buckets | — |

Measured with cost rule v3 (bots hidden, ABCCBA, nice 0, GPU < 0.6 ms and CPU < 0.38 ms means over 8 cycles) and a
collapse-spike probe: the worst frame of a scripted collapse, against the same frame without it.

## 11. The presentation contract

`src/sim/destructionEvents.ts` (no imports): `MunitionClass`, `MUNITION_PROFILES`, `StructureStage`,
`StructureMassClass`, `StructureIdentity`, `StructureStageEvent`, `StructureBreachEvent`, `TerrainCraterEvent`,
`MunitionBlastEvent`, `DESTRUCTION_BUS_EVENTS`, `DESTRUCTION_WIRE_EVENTS`, `DestructionLogEntry`,
`DestructionSettledState`. Rules for the consumer:

- Animate only live events; lay `settled` ones down at their final pose, silently.
- Draw rubble and craters on the sim's own profiles (`rubbleMoundHeightAt`, `craterOffsetAt` in
  `sim/terrainDeformation.ts`, which is pure and light) so tracks meet what the eye sees.
- The world tags each structure's geometry at build time (P1): `userData.structureIdx` on every part, and per vertex
  the structure index, its section and its part class (§16.4), so a stage can cut, hide or swap exactly that
  building's pieces inside the merged buckets.
- Every stage's look comes from the building's own kit through the kit seam (§16); the presentation renders what the
  kit generators write.
- Explosion variety keys on `munition` and `chargeKg` (solo `munition:blast`; network: the shell events' new fields).

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
| `mp/wire` (extended) | the log round-trips, keyframe whole and delta additions |
| `mp/host/migrationState` (extended) | restore of stages and craters; nothing collapses twice |
| `tools/mp-world-events-audit` (extended) | the new kinds pass the audit's judgments |
| `tools/sim-determinism-audit` (extended) | destruction in the hash |

## 14. Phase plan

| Phase | Delivers | Gate |
|---|---|---|
| **P0** | this document; `destructionEvents.ts` (the presentation contract); `world/destructionKit.ts` (the kit seam, §16) | typecheck |
| **P1** | group ids in the build and the shards; the structure table; blast, kinetic and ram damage; stages; collapse (flags, rubble mound, nav refresh); solo and authority; the wire log, events, migration; the ruleset block; blasts break light props within reach; the kit seam's default describe and layouts, the `aDamage` tags and `world.structureDamage(id)` | receipts above, `npm test`, typecheck, pacing vs base, cost v3 + collapse spike, the world-events and determinism audits |
| **P2** | sections, holes that pass shells and sight, partial collapse (roofs, upper floors), landmark sections | the same, plus the shell-through-hole and sight-through-hole receipts |
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
| Breach | the dark backing behind every opening becomes a room: the floor plane, the floor-slab edge at the storey line, joist ends at the break's top; the rim in the wall's own layers; debris thrown along the blow |
| Damaged | spalled render patches, chipped arrises, cracked and missing glass (glass hidden, shards as debris), slipped tiles |
| Roof (P2 `sectionDown`) | a stripped patch shows battens and rafters (`emitRoofPatch`); a fall adds missing slab sections, a broken ridge and hanging rafters; thatch chars and slumps; an earth roof slumps between its beams; sheet bends |
| Collapse | remnants (wall stubs, corners, chimneys), a heap of chunk prisms in the building's own buckets with its weather tints plus timbers and roof tiles, seated on the sim's mound (`rubbleMoundHeightAt`), and the falling debris |

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

### 16.4 Tags in the intact geometry

At build time (P1, core) every part of a structure carries `userData.structureIdx`, and the merge writes a per-vertex
attribute `aDamage` = (structure index, section, part class: wall, roof, glass, trim, interior). The presentation's
mask reads it: `damaged` hides glass, a fallen roof hides its section, a collapse hides the structure, a hole discards
the wall inside its cut. A part's section is the storey and face it lies on (its centroid against the anatomy's face
rects); a roof part's is the roof's.

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

`src/world/destructionKit.selftest.mjs` (P1, extended by every kit lane for its kit): each registered kit's builders
run twice on the same anatomies and seeds and write identical bytes; every writer stays within its cap; rim triangles
stay within 0.3 m of their hole's edge and inside the wall's layers; rubble lies within the mound's footprint and on
its surface (±5 cm); the default describe of a sample of every kit's buildings names a material for every bucket.
