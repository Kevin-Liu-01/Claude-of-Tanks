# ARCHITECTURE.md — original implementation contract

> Historical document. This was the locked nine-module plan used during the
> original parallel implementation. It is retained as build provenance, but it
> is not the current runtime architecture. Use [SYSTEMS.md](SYSTEMS.md) for
> current ownership and data flow, [MULTIPLAYER-V2.md](MULTIPLAYER-V2.md)
> for network behavior, and [DEVELOPMENT.md](DEVELOPMENT.md) for verification.

Nine builder agents implement the modules below **in parallel, without talking to each
other**. This document is the ONLY shared truth. If something here conflicts with a
research doc, THIS FILE WINS. If something is not specified here or in the research
docs, pick the simplest option that satisfies the interface — never invent a new
cross-module dependency.

Module ownership (file paths are FIXED):

| Builder | Files |
|---|---|
| engine   | `src/engine/renderer.ts`, `src/engine/lighting.ts`, `src/engine/post.ts`, `src/engine/sky.ts`, `src/engine/cameraRig.ts` |
| world    | `src/world/terrain.ts`, `src/world/vegetation.ts`, `src/world/props.ts`, `src/world/map.ts` |
| vehicles | `src/vehicles/specs.ts`, `src/vehicles/fleetFactory.ts`, `src/vehicles/factoryGeometry.ts`, `src/vehicles/tankFactoryCore.ts`, `src/vehicles/materials.ts` |
| movement | `src/sim/movement.ts` |
| combat   | `src/sim/ballistics.ts`, `src/sim/armor.ts`, `src/sim/damage.ts`, `src/sim/combat.selftest.mjs` |
| ai       | `src/game/ai.ts` |
| hud      | `src/ui/hud.ts`, `src/ui/garage.ts`, `src/ui/damagePanel.ts` |
| fx       | `src/fx/effects.ts`, `src/fx/particles.ts` |
| audio    | `src/audio/audioEngine.ts` |
| integration | `src/main.ts`, `src/game/state.ts` |

Research docs each builder MUST read: `docs/history/research/graphics-aaa.md` (engine, world,
fx), `docs/history/research/movement-physics.md` (engine cameraRig, movement, vehicles specs),
`docs/history/research/armor-penetration.md` + `docs/history/research/shells-ballistics.md` (combat,
vehicles specs, ai), `docs/history/research/tank-roster.md` (vehicles, hud garage),
`docs/SCREENSHOT_CONTRACT.md` (everyone).

---

## 1. Global conventions (binding on every module)

### 1.1 Units & coordinates
- **Meters, seconds, radians** for ALL runtime state and ALL function arguments/returns,
  unless the field name carries a unit suffix (see 1.2). World is three.js standard:
  right-handed, **+Y up**. Map spans x,z ∈ [-512, +512] (1024 m square), y = terrain height.
- **Tank local frame**: origin at the **ground-contact center** of the hull (bottom of
  tracks, centered in plan). **Local forward = +Z**, +Y up. Locked axis formulas:
  `forwardAxis(yaw) = [sin(yaw), 0, cos(yaw)]`, `rightAxis(yaw) = [cos(yaw), 0, -sin(yaw)]`.
  `yaw = 0` faces world +Z; positive yaw turns the nose toward +X.
  Hull attitude mapping to the visual root is locked as: `root.rotation.order = 'YXZ'`;
  `rotation.y = yaw`, `rotation.x = -visualPitch` (positive pitch = nose up),
  `rotation.z = visualRoll` (positive roll = right side down). Only tankFactory's
  `syncFromState` and armor.ts's inverse transform implement this mapping; everyone else
  treats `yaw/pitch/roll` as plain numbers.
- **turretYaw** is hull-relative, radians, 0 = gun forward, same sign sense as hull yaw.
- **gunPitch** is relative to the hull plane, radians, **positive = muzzle up**.
- `dt` is **seconds**. Fixed sim step = `1/60` s. Render step is variable.
- Positions passed across module boundaries are `THREE.Vector3` where the signature says
  `Vector3`, and plain `[x,y,z]` arrays where it says `vec3` (event payloads use `vec3`
  so events are JSON-serializable).

### 1.2 Unit-suffix convention for spec/stat fields
Static spec data (`specs.ts`) keeps the research docs' human units, flagged by field-name
suffix — consumers convert at point of use:
`...Kmh` (km/h, `mps = kmh/3.6`), `...DegS` (deg/s), `...Deg` (degrees), `...Mm` (mm),
`...M` (meters), `...S` (seconds), `...Hp` (horsepower), `...Tons` (metric tons).
No suffix ⇒ SI/radians. Never store radians in specs; never pass degrees at runtime.

### 1.3 Module hygiene (screenshot contract depends on this)
- **Zero top-level side effects.** No DOM/WebGL/AudioContext access at import time. Only
  pure data and function definitions at module top level. All setup happens inside the
  exported `create*/init*` functions. This makes every module importable under plain
  node and keeps the load path error-free.
- **ES modules everywhere.** `package.json` has `"type": "module"` (already set — do not
  change it). Imports: `three` and `three/examples/jsm/...` only. No other packages, no
  CDN, no fetch of any asset.
- `src/sim/*`, `src/vehicles/specs.ts`, and `src/game/ai.ts` are **pure-logic modules**:
  they may import `three` **for math classes only** (Vector3/Matrix4/Quaternion/Ray/Box3)
  — never anything that touches WebGL or DOM — so they run under plain node.
- **Import rules**: any module may import the pure-logic modules above. Nothing else may
  be imported across builder boundaries. All stateful/scene objects arrive as function
  parameters wired by integration.
- No `console.error`/`console.warn` on any reachable path. Guard every shader-string
  `.replace()` injection by asserting the string changed; if it didn't, `throw` at init
  (loud, catchable) — never limp along.
- No per-frame allocation in update loops (reuse scratch Vector3s, module-scope).

### 1.4 Determinism & RNG
- Canonical PRNG — copy this verbatim into any module that needs randomness (do NOT
  create a shared file for it):
  ```js
  export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  ```
- An `rng` parameter always means `() => number in [0,1)`.
- **Never call `Math.random()`, `Date.now()`, or `performance.now()` inside sim, fx,
  world, or vehicles code.** Time arrives as a parameter; randomness arrives as `rng` or
  a `seed` option. Fixed seeds: terrain `1337`, vegetation `2001`, props `2002`, textures
  `3000 + layerIndex`, per-tank camo `4000 + spawnIndex`, fx `5000`, combat per-battle
  `6000` (integration passes these; defaults inside modules must equal these values).

### 1.5 Event bus (injected, not imported)
Integration constructs the bus and passes it to modules that need it. Reference
implementation (integration owns it; builders may copy it into selftests only):

```js
function createBus(){ const m=new Map(); return {
  on(ev,fn){ (m.get(ev)??m.set(ev,[]).get(ev)).push(fn); return ()=>this.off(ev,fn); },
  off(ev,fn){ const a=m.get(ev); if(a){ const i=a.indexOf(fn); if(i>=0)a.splice(i,1);} },
  emit(ev,payload){ const a=m.get(ev); if(a) for(const fn of a.slice()) fn(payload); },
};}
```

**Event names and payloads (complete list — do not invent new ones):**

| event | payload | emitted by |
|---|---|---|
| `shell:fired` | `{ shellId, shooterId, isPlayer, shellType, caliberMm, muzzlePos:vec3, dir:vec3 }` | integration (after `createShell`) |
| `shell:hit` | `HitEvent` (§2.6) | integration (from damage.ts return) |
| `shell:expired` | `{ shellId, pos:vec3, hitTerrain:boolean }` | integration |
| `tank:destroyed` | `{ id, specId, pos:vec3, killerId, cause:'shot'|'fire'|'ammorack' }` | integration |
| `tank:fire` | `{ id, burning:boolean }` | integration |
| `module:state` | `{ id, module:ModuleName, state:'ok'|'yellow'|'red' }` | integration |
| `player:reload` | `{ t, total }` (every sim tick while reloading) | integration |
| `ui:shellSelect` | `{ slot:0|1|2 }` | hud |
| `ui:magazineReload` | `{}` | input/hud |
| `ui:battleStart` | `{ specId }` | garage |
| `ui:click` | `{}` | hud/garage (any button press) |

FX and audio each expose `bindBus(bus)` for subsystem reactions. The typed
`combatFeedbackRuntime.ts` owner bridges discrete hit/ERA/camera-recoil,
destructible-prop, and Garage-residency presentation reactions without placing
them in the simulation or composition root. HUD and other presentation owners
receive the bus through their constructors; authoritative state never imports a
browser presentation consumer.

---

## 2. Shared data structures (exact shapes)

### 2.1 `TankId` and roster constants

`specs.ts` owns stable vehicle IDs and registered records.
`rosterPolicy.ts` derives the production, development, and reference
projections; `fleetOrder.ts` then makes each related native family contiguous
in historical/design progression. Registration order is never a UI or
matchmaking contract.

### 2.2 `TankSpec` (exported by `src/vehicles/specs.ts`)
```js
TankSpec = {
  id: TankId, name: string, nation: string,
  era: 'interwar'|'ww2'|'cold-war'|'modern'|'next-generation',
  role: 'light'|'medium'|'heavy'|'td'|'mbt'|'ifv'|'spg', // simulation-only
  hp: number,                                  // locked table §3.3.1
  // --- mobility (schema of movement-physics.md §1) ---
  enginePowerHp, weightTons, topSpeedKmh, reverseSpeedKmh: number,
  hullTraverseDegS: number,
  terrainResistance: { hard, medium, soft },   // dimensionless
  trackTraction?: number,                      // optional running-gear grip multiplier
  pivotStyle: 'pivot'|'neutral',
  // --- turret & gun kinematics ---
  turretTraverseDegS, gunPitchDegS, gunElevationDeg, gunDepressionDeg: number, // depression positive
  // --- gun ---
  gun: {
    caliberMm: number, reloadS: number,
    autoloader?: {
      magazineSize: number,      // ready rounds at battle start/full reload
      intraClipS: number,        // delay between shots in one magazine
      fullReloadS: number,       // all-or-nothing magazine replenishment
    },
    baseAccuracy: number,        // meters dispersion @100 m, fully aimed (2σ)
    aimTimeS: number,
    bloom: { move, hullRot, turret, afterShot }, // movement doc §1 semantics
    shells: [ShellSpec, ShellSpec, ShellSpec],   // slot 0 = standard, 1 = special, 2 = HE
  },
  dims: { hullLengthM, overallLengthM, widthM, heightM },
  armor: ArmorModel,             // §2.3
  visual: object,                // OPAQUE — tankFactory-internal (camo colors, detail flags)
}

ShellSpec = {
  name: string,
  type: 'AP'|'APCR'|'HEAT'|'HE'|'APFSDS',   // roster APHE/APCBC/APBC ⇒ 'AP'
  caliberMm: number,             // copy of gun caliber
  pen100Mm: number, pen1000Mm: number,      // linear interp 100→1000 m, clamped outside
  dmg: number,                   // avg HP damage (roster values)
  velocityMps: number,           // real-ish muzzle velocity (shells doc §1)
  moduleDmg: number,             // default = caliberMm
  tracer: 'AP'|'APCR'|'HEAT'|'HE'|'APFSDS', // fx preset key (shells doc §10)
  reloadS?: number,              // PER-SHELL reload (IFV autocannon belt vs. ATGM
                                 // rail) — governs this slot in startReload;
                                 // absent ⇒ gun.reloadS. Conventional shells
                                 // share the gun channel; guided launchers keep
                                 // independent background reload channels.
  count?: number,                // rounds carried — overrides the type-level
                                 // default loadout (belts vs. missile racks)
}
```
Modern roster pens are quoted @2 km: encode as `pen1000Mm = quoted2kmPen / (1 - lossPer100m*10) `
inverse-solved so that the shells-doc falloff table §4 reproduces the quoted value at
2 km — vehicles builder does this arithmetic; consumers only ever read pen100/pen1000.

### 2.3 `ArmorModel` (data-only, inside `TankSpec.armor`)
Combat raycasts against this. The fleet finalizer derives a closed, low-complexity
collision shell from the actual first-party procedural armor mesh; authored zones
remain the source of thickness/material behavior, but no playable vehicle relies on
disconnected broad quads or AABBs as its main silhouette.
```js
ArmorModel = {
  boundingRadiusM: number,          // broadphase sphere around tank origin
  turretPivot: [x,y,z],             // hull-local position of turret rotation center
  gunPivot: [x,y,z],                // TURRET-local position of gun trunnion
  gunBarrel: { lengthM, radiusM },  // cylinder along +Z from gunPivot (external module 'gun')
  hullPlates:   Plate[],            // hull-local frame
  turretPlates: Plate[],            // turret-local frame (rotates with turretYaw; mantlet
                                    //  plates may set gunFollow:true → also pitch with gun)
  collisionShells: {                // generated from actual procedural geometry
    hull: ConvexCell[],              // closed longitudinal union in hull-local frame
    turret: ConvexCell[],            // closed union in turret-local frame
  },
  modules: ModuleVolume[],          // hull-local (turretLocal:true ⇒ turret frame)
  crew:    CrewVolume[],
}
Plate = {
  name: string,                     // 'upper_glacis', 'turret_cheek_L', ...
  verts: [[x,y,z],[x,y,z],[x,y,z],[x,y,z]],  // planar convex quad, CCW seen from OUTSIDE
                                    // (outward normal = normalize(cross(v1-v0, v3-v0)))
  physicalMm: number,               // for ricochet/overmatch geometry
  keMm: number, ceMm: number,       // RHAe (WWII steel: keMm = ceMm = physicalMm)
  kind: 'main'|'spaced'|'era'|'external',   // external = tracks/stowage screens
  era: null | { keReduction:number, ceFlatMm:number },   // kind==='era' only
  moduleLink: null | ModuleName,    // e.g. track plates link 'trackL'
  gunFollow: boolean,               // turret plates only (mantlet)
}
ConvexCell = {
  min:[x,y,z], max:[x,y,z],       // broadphase only
  vertices:[[x,y,z], ...],
  faces:[{ indices:[i0,i1,i2], normal:[x,y,z], constant:number,
           plate:Plate, internal:boolean }],
}
SmoothShape =
  | { kind:'ellipsoid', center:[x,y,z], radii:[x,y,z] }
  | { kind:'capsule', a:[x,y,z], b:[x,y,z], radius:number }
  | { kind:'ellipticCylinder', center:[x,y,z], axis:0|1|2,
      halfLength:number, radii:[r0,r1] }
ModuleVolume = { module: ModuleName, min:[x,y,z], max:[x,y,z],
                 turretLocal:boolean, shapes:SmoothShape[] }
CrewVolume   = { crew: CrewName, min:[x,y,z], max:[x,y,z],
                 turretLocal:boolean, shapes:SmoothShape[] }
ModuleName = 'engine'|'fuelTank'|'ammoRack'|'gun'|'turretRing'|'radio'|'optics'|'trackL'|'trackR'
CrewName   = 'commander'|'gunner'|'driver'|'loader'   // 3-crew tanks (t34_85 pre-85? no —
             // t90m has no loader; omit absent crew members from the array entirely
```
The generated shell is sliced only along vehicle-local Z and convex-hulled from
clipped source triangles, so adjacent components share closed boundaries while the
bow, shoulders, cheeks, bustle, cupolas and hatches retain their changing section.
Every face maps back to a canonical `Plate`; ERA, spaced screens, external tracks and
gun-follow mantlets remain separately ordered layers. Internal authoring bounds are
converted to ellipsoids, capsules or elliptic cylinders, split across shell cells when
necessary, and seated fully inside the closed armor before combat begins.

**trackShapes addendum (2026-08-06, fleet-wide).** Track hitboxes are no
longer per-tank rectangle stacks: `attachTrackShapes` (specs.ts) derives one
convex prism per side from each profile's `trackLoopPoints` at spec time, and
`tankFactory.trackHitboxHull` mirrors the same derivation for the visual
debug hull, so the killcam and combat agree by construction. Combat raycasts
enter through `intersectTrackPrism` (src/sim/armor.ts) before the plate walk
(`moduleLink 'trackL'/'trackR'` semantics unchanged); the killcam renders the
true trapezoid + loop-following slats via `addTrackPrism`. The prisms are
derived data — never hand-author them; fix the gear loop instead. Hash/gate
neutrality was proven at the fleet landing (101/101 profiles, combat suite
253 checks).

### 2.4 `TankEntity`, `TankState`, `CombatState`
Integration composes entities; each sub-object has exactly one owner module.
```js
TankEntity = {
  id: string, specId: TankId, spec: TankSpec,
  team: 'player'|'enemy', isPlayer: boolean,
  state: TankState,        // owned by movement.ts
  combat: CombatState,     // owned by damage.ts
  input: TankInput,        // written by integration (player) or ai.ts
  visual: TankVisual|null, // owned by tankFactory (null in headless tests)
  ai: object|null,         // opaque, owned by ai.ts
}

TankState = {              // movement.createTankState(spec, pos:Vector3, yaw) builds this
  pos: THREE.Vector3,      // authoritative root; Y may be above support in flight
  yaw: number, speed: number /* horizontal m/s signed */, yawRate: number /* rad/s */,
  verticalSpeed: number, grounded: boolean, landingImpactMps: number,
  visualPitch: number, visualRoll: number,        // spring outputs, radians
  turretYaw: number, gunPitch: number,            // radians (conventions §1.1)
  turretYawRate: number,                          // rad/s (for bloom)
  aimPoint: THREE.Vector3,                        // world target the gun chases
  bloomF: number,                                 // dispersion multiplier ≥ 1
  trackScroll: { l: number, r: number },          // cumulative meters per track
  atGunLimit: boolean,                            // gun pinned at elevation/depression
  _spring: object, _prevSpeed: number,            // movement-internal
}

TankInput = {
  throttle: number /* -1..1 */, steer: number /* -1..1 */, brake: boolean,
  fire: boolean, aimPoint: THREE.Vector3, shellSlot: 0|1|2,
}

CombatState = {            // damage.createCombatState(spec) builds this
  hp: number, maxHp: number, destroyed: boolean,
  modules: { [ModuleName]: { hp, maxHp, state:'ok'|'yellow'|'red', repairT:number } },
  crew:    { [CrewName]: boolean },               // alive?
  fire: { burning: boolean, tickTimer: number, ticksLeft: number },
  eraSpent: Set<string>,                          // Plate.name of detonated ERA tiles
  reload: {
    t: number, totalS: number,
    kind: 'ready'|'shell'|'intraClip'|'magazine',
  },                                              // t counts down to 0 = ready
  magazine: null|{ rounds: number, capacity: number },
  launcherSalvoShots?: number,                    // guided shots fired in the current rack salvo group
  magazineIndicator?: null|{ rounds, capacity, launcher: boolean }, // NETWORK MIRROR ONLY — see below
  shellSlot: 0|1|2,
}
```
Ammo selection preserves magazine rounds, salvo position, and every reload timer.
Types fired through the same gun share its cycle; separate cannon and launcher
channels advance concurrently, including while deselected. Selecting or reselecting
an ammo key never reloads a clip. Only a successful shot or the explicit magazine
reload control starts a cycle. Solo and network firing check the selected weapon's
timer, and an empty-slot request cannot fire a different fallback weapon.
Shells with the same explicit `reloadGroup` share a secondary weapon's cycle:
the BMP-3's 100 mm HE and gun-launched missile use one timer, independent of its
30 mm autocannon. Secondary weapons do not consume the main gun's magazine.

The reticle's multi-round indicator is never read from `magazine` directly: `sim/magazineIndicator.ts`
derives it once (the cannon magazine, or — with a guided round loaded on a `gun.launcherSalvo` rack —
the rounds left in the current salvo group, 0 while the rack runs its own 'shell' reload) for the solo
aim frame, the authoritative snapshot's `magazineRounds/Capacity` and the `player:reload` event. The
client bridge decodes those snapshot fields into `magazineIndicator` and fills `magazine` only for a
cannon magazine, so the manual magazine-reload rules keep reading the cannon alone.
Effects of module/crew state on gameplay (movement & integration read these — locked):
`engine` yellow ⇒ `enginePowerHp × 0.5`, red ⇒ immobile; `trackL|trackR` red ⇒ immobile;
`gun` yellow ⇒ σ×2 & no aim shrink below f=2, red ⇒ cannot fire; `turretRing` yellow ⇒
turret traverse ×0.5, red ⇒ ×0.2; `loader` dead ⇒ reload ×1.5; `gunner` dead ⇒ aimTime
×1.5; `driver` dead ⇒ accel & traverse ×0.7; ammoRack red ⇒ instant destruction.
Red modules auto-repair to yellow (hp=50%) after `repairT = 10 s`.

### 2.5 `ShellEntity` (owned by ballistics.ts)
```js
ShellEntity = {
  id: number, shooterId: string, isPlayer: boolean,
  spec: ShellSpec,
  pos: THREE.Vector3, prevPos: THREE.Vector3, vel: THREE.Vector3,
  ageS: number, dead: boolean,
  penRollDone: boolean, remainingPenMm: number,   // set by damage.ts during resolution
  bounces: number,
}
```

### 2.6 `HitEvent` (returned by damage.ts, emitted as `shell:hit`)
```js
HitEvent = {
  kind: 'pen'|'nonpen'|'ricochet'|'spaced_absorb'|'era'|'he_pen'|'he_splash'|'terrain',
  shellId: number, shellType: string, caliberMm: number,
  attackerId: string, targetId: string|null,      // null for terrain
  pos: vec3, normal: vec3,
  impactAngleDeg: number, effectiveMm: number, penRollMm: number,
  damage: number, targetHpAfter: number,
  modulesHit: [{ module: ModuleName, newState:'ok'|'yellow'|'red' }],
  crewHit: CrewName[],
  fireStarted: boolean, ammoRacked: boolean, destroyed: boolean,
  eraPlate: string|null,                          // Plate.name popped, for fx/visual strip
}
```

### 2.7 `HeightField` and `World` (owned by world builder)
```js
// terrain.js — PURE part, node-runnable, no three-scene code:
createHeightField(seed = 1337) => HeightField
HeightField = {
  getHeightAt(x, z) => number,          // meters; defined for all x,z (flat beyond map)
  getNormalAt(x, z) => THREE.Vector3,   // fresh or scratch — treat as read-only, copy if kept
  getGroundType(x, z) => 'hard'|'medium'|'soft',   // roads hard, fields medium, marsh soft
  size: 1024, minY: number, maxY: number,
}

// map.ts — composes terrain meshes + vegetation + props into a scene:
createMap(engineCtx, { seed = 1337 } = {}) => World       // engineCtx: §3.1.6
World = {
  heightField: HeightField,
  raycast(origin: Vector3, dir: Vector3, maxDist: number) => null |
      { point: Vector3, normal: Vector3, dist: number, kind: 'terrain'|'prop' },
  getObstacles() => [{ min:[x,y,z], max:[x,y,z] }],        // static AABBs (props, buildings)
  spawnPoints: { player: {pos:[x,y,z], yaw}, enemies: [{pos, yaw} × ≥7] },
  getMinimapFeatures() => { roads: [[ [x,z], ... ]], buildings: [{x,z,w,d,rot}],
                            treeClusters: [{x,z,r}], waterOrSoft: [{x,z,r}] },
  update(dt, cameraPos: Vector3),       // LOD, wind time accumulate
  setWindTime(t: number),               // freeze hook for screenshots
  group: THREE.Group,                   // already added to scene by createMap
}
```
`raycast` must be cheap (heightfield ray-march at 0.5–2 m steps + prop AABB tests) —
it is called a few dozen times per frame (camera, aim, AI LOS).

### 2.8 `EngineCtx` — the render-side dependency bundle
Created by integration from engine's exports and passed to world / vehicles / fx:
```js
EngineCtx = {
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
  setupShadowMaterial(mat, extraOnBeforeCompile = null) => mat,  // lighting.ts §3.1.2
  anisotropy: number,                    // min(8, renderer max)
  quality: 'high'|'low',
}
```

---

## 3. Module contracts

### 3.1 engine — `src/engine/`

#### 3.1.1 `renderer.ts`
```js
export function createRenderer(container /* HTMLElement */) => THREE.WebGLRenderer
// exactly per graphics-aaa §1: antialias:false, stencil:false, high-performance,
// pixelRatio ≤ 1.5, SRGBColorSpace, ACESFilmic, PCFSoftShadowMap. Appends canvas.
export function onResize(renderer, camera) // sets size + camera aspect + updateProjectionMatrix
```

`viewportRuntime.ts` composes that renderer policy with post-target sizing and
CSM frustum refresh. It owns the sole window listener and a temporary 0x0 boot
recovery observer/interval; the first positive layout disconnects the recovery
work, while ordinary boots never create it.

`frameLoopScheduler.ts` owns browser frame delivery, including one queued-rAF
latch, context-restoration restart, and bounded hidden-pane recovery. Every
delivery path enters the same frame callback; hidden input or timer rescue can
never stack a second render loop when animation frames resume.

#### 3.1.2 `lighting.ts`
```js
export function createLighting(scene, camera, sunDir /* Vector3, unit, FROM origin TOWARD sun */)
  => Lighting
Lighting = {
  csm,                                   // the CSM instance (graphics doc §3 config)
  setupShadowMaterial(mat, extraHook = null) => mat,
     // csm.setupMaterial(mat) THEN wraps onBeforeCompile with extraHook (doc §3 pattern)
  update(),                              // per-frame csm.update()
  updateFrustums(),                      // on resize / fov change
  setSunIntensity(i), hemi: THREE.HemisphereLight,
}
```
Construct CSM **before** any material is compiled (integration guarantees call order;
lighting must not lazily defer CSM construction).

The four cascade maps are sized by the active graphics tier. Their five-tap
PCF rotation is anchored to shadow-map texels rather than screen pixels, so a
stationary world surface does not hatch or crawl as the camera moves. A minimum
filter footprint prevents low-resolution tiers from falling below an
anti-aliased texel. Procedural vehicles disable their thousands of detailed
shadow submissions and instead provide at most three articulation-aware convex
support hulls derived from the authored hull, turret, and gun meshes. Terrain,
buildings, poles, near vegetation, and dedicated wreck proxies remain regular
casters; distant decorative foliage stays intentionally non-casting.

#### 3.1.3 `sky.ts`
```js
export function createSky(scene, renderer) => SkyRig
SkyRig = {
  sunDir: THREE.Vector3,                 // fixed: elevation 35°, azimuth 140° (doc §5)
  bakeEnvironment(),                     // PMREM bake per doc §2.3; sets scene.environment
  horizonColor: THREE.Color,             // sampled/hand-tuned per doc §5(a)/(b)
  applyFog(scene),                       // scene.fog = Fog(horizonColor, 150, 1200)
}
```
Night sky (round 22, 2026-09-18): the dome shader adds a deterministic starfield, a galactic band and a
moon after its intensity multiply whenever the preset dims the dome (`nightAmount`), and the preset knobs
`nightSky` / `galaxy` / `nebulaHex` / `planetDeg` / `planetHex` let a map ask for a galaxy sky. The cloud
decks erode thin fringes with their own alpha field (`uEdgeDetail`).
Physically based atmosphere (round 65, 2026-09-24): on the desktop tier the visible dome, the environment bake, the
fog colour, the hemisphere light's hue and the post aerial pass's scatter-in target all derive from
`engine/atmosphere.ts` — Hillaire 2020's transmittance, multiple-scattering and sky-view LUTs rendered as fragment
passes only when the sun or a map's parameters change, plus an 8 × 1 summary readback; `skyPresetToAtmosphere` maps
every map's authored sky preset onto the model, the Preetham dome remains the mobile tier's path and the fallback,
and the terrain material never samples a LUT (it holds its sixteen texture units).
Light effects (round 69, 2026-09-24): on the desktop tier `engine/postLightFxPolicy.ts` resolves four levers per
preset (`?fx=off` / `?fx=names` for QA) — screen-space contact shadows marched inside the aerial pass against the
resolved depth and blended into the CSM visibility the opaque lit materials write into the scene target's alpha
(`engine/contactShadows.ts`), an analytic energy-conserved ground bounce added to the lit materials' indirect diffuse
through the CSM shader patch (`engine/groundBounce.ts`), and quarter-resolution sun shafts and a lens flare
(`engine/sunShafts.ts`, `engine/lensFlare.ts`) written into one light target the grade adds before its tonemap; the
pass order above is unchanged and no full-resolution pass was added.
Vehicle form in shade (2026-10-02): the vehicle readability floors (`vehicles/materials.ts`) aim a shaded plate's
fill by its world orientation — sky-facing plates most, the sun's bearing a little, a 0.28 lens share kept for
readability — rather than by how squarely it faces the lens; indirect light falls toward the ground along each
vehicle's own up axis (× 0.66 at the hull bottom, back to 1 at 1.75 m) through one shared ground reference that every
vehicle mesh points at its root before it draws (`tankFactoryCore.ts`); and a fifth light lever, `vehicleOcclusion`
(`engine/vehicleOcclusion.ts`, ultra/high/medium, `?fx=cavity`), adds a vehicle-only cavity occlusion inside the aerial
pass — fixed horizon taps against the resolved depth on pixels whose alpha carries the vehicle tag, scaling only the
ambient share — for bustles, skirts and wheel bays. Scene-wide GTAO stays off. The deep-shade floor lifts the light a
plate receives, not its output: each texel lands in proportion to its own paint against the map's mean tone (its last
mip), so a camouflage keeps its light/dark contrast on shaded sides and under canopy (the old lift brought every texel
to one luminance along its hue, and a desert scheme's dark patches vanished into the base tan).
Volumetric clouds (round 68, 2026-09-24): on the desktop tier `engine/volumetricClouds.ts` raymarches a per-map cloud
slab (its layer derived by `engine/cloudPresets.ts` from the map's authored sky block, its noise volumes baked by
`engine/cloudNoise.ts` in a worker) at one sixteenth of a half-resolution history with a 4 × 4 slot cycle and
reprojection, lit by the atmosphere's sun transmittance and sky irradiance, composited premultiplied through a
depth-tested dome behind the aerial pass's haze law; per-cascade alpha-tested planes on the shadow-only layer carry
the cloud shadows through the CSM, `post.ts` owns the single per-frame hook, and `?clouds=off` keeps the baked decks.
Round 71 (2026-09-25, still opt-in behind `?clouds=volumetric`): every map config authors a `clouds` block (a regime
from `engine/cloudscapes.ts` and any knob; main.ts carries it on the sky preset as `cloudscape`, Mars on its shared
preset) that `cloudPresets.ts` resolves through the regime rows; the trace reads a multi-scale weather field with a
type channel and a street / anvil / cirrus companion field in the wind frame, type height profiles, a rigid wind lean,
curl-warped erosion, the Hillaire multiple-scattering octaves under a dual-lobe phase with Beer–powder toward the sun,
a far stratocumulus band and a cirrus sheet behind the slab; the shadow gobos discard by the same fields through a
custom depth material, and the baked cirrus veil hides while the layer shows.
The layered sky (2026-10-01): `engine/cloudWeatherLayers.ts` adds to the same trace the weather beyond the slab — a
sea fog bank and rain shafts / virga in front of it; distant cumulonimbus cells with anvils and rain, the far band and
a 2.5D mid-level layer (altocumulus, altostratus, cirrocumulus, lenticular) behind it, sorted by distance; contrails on
the cirrus sheet — placed deterministically per map from the `clouds` block, with lightning in a night storm drawn in
the composite. `cloudPresets.ts` resolves the block for the battle's time of day (the diurnal law of convective cloud,
per-time knobs, a neutral albedo at sunset and night, the moonlight's hue, a town's glow on the bases).

Horizon ring — vista pass (round 24, 2026-09-19; owner: "the stuff around the map like mountains needs to
be so much better … consider this a triple AAA pass"). `world/maps/horizon.ts` now builds a 431-column
ring whose row ladder is subdivided on every span (18 rows on the rolling / mesa / escarpment styles, 36 on
alpine) with ridged relief (spurs and gullies about 260 m and 90 m apart) instead of two smooth octaves,
seats its buried anchor and first exterior row on the battlefield's own edge height and gradient
(`seatHorizonSkirtOnGround`; Autumn and Redrock keep their own seams), and stands the first authored ridge
at 700–720 m so the foothill band behind the rim is a real hillside. The tableland maps bound every cap
rise at 1.25:1 (`reshapeFiniteTableCaps`, authored-row driven). On the desktop tier the ring's fragment
program is the layered vista material in `world/horizonVista.ts`: five tileable colour tiles (meadow,
canopy, rock, scree, snow) sampled triplanar in world space, weights from slope / altitude / three
world-anchored noise fields, strata beds and seams, a screen-derivative bump normal lit by the map sun plus
a hemispherical sky term, and per-fragment aerial haze toward the fog tint (the vertex bake is tone-only
there; mobile keeps the older per-vertex programs). The rows up to the first ridge render with the
terrain's own splat material (`terrain.ts` `bindAutumnHorizonGround` generalised to every map, columns
and bands from `mesh.userData.horizonRing`, meadow tint refreshed from the ground albedo mean), with the
splat mask faded outside the playable square so no road or dirt streak climbs the ring. `buildHorizonForest`
scatters an instanced forest where the fragment program paints stands (the JS twin of its stand function
over the shared detail noise): species and crown palettes follow the map's `vegetation.rimMix` /
`palettes` (pine / spruce / fir / cedar are conifers), the rim band keeps three quarters of the 8000-instance
budget thinned uniformly around the perimeter, the band trees nearest the edge form a rich shadow-casting
near class, and the ranges beyond get a two-tier class; the crowns carry the canopy tile's mottle, rim
darkening and the ring's haze curve per fragment. The forest material joins the cascade through
`engineCtx.setupShadowMaterial(material, hook)` — the hook must be passed as the extra hook, since the
cascade setup replaces `onBeforeCompile`.

#### 3.1.4 `post.ts`
```js
export function createPost(renderer, scene, camera) => Post
Post = {
  composer,
  render(dt),                            // composer.render() — the ONLY render call
  setSize(w, h),
  bloom, gtao,                           // passes, for quality toggles
  setQuality(level /* 'high'|'low' */),  // low: gtao.enabled=false
}
// Chain locked (graphics doc §4): RenderPass → GTAOPass → UnrealBloomPass(0.35,0.55,0.85)
// → SMAAPass → OutputPass. HalfFloat target with DepthTexture.
```

#### 3.1.5 `cameraRig.ts`
```js
export function createCameraRig(camera, deps) => Rig
// deps = { heightField, raycast /* World.raycast */, getPlayer: () => TankEntity }
Rig = {
  mode: 'ARCADE'|'SNIPER',
  zoom: number,                          // sniper zoom step value (2|4|8|16|25)
  aimPoint: THREE.Vector3,               // server-aim raycast result, updated each frame
  aimDist: number,
  update(dt, camInput),                  // camInput = { mouseDX, mouseDY, wheel:-1|0|1,
                                         //   rmb:boolean /* generic free-look hold */,
                                         //   shiftPressed:boolean }
  addTrauma(x),                          // 0..1, shake per graphics doc §11
  enterSniper(), exitSniper(),
  getAimRay(outOrigin: Vector3, outDir: Vector3),
  // --- screenshot hooks ---
  setExternalPose(pos: Vector3, lookAt: Vector3, fovDeg = 50),  // suspends rig control
  snapArcade(step /* 0..5 */, orbitYaw, orbitPitch),            // deterministic arcade pose
  snapSniper(zoom, aimYaw, aimPitch),
  release(),                             // resume normal control
}
```
Behavior per movement-physics doc §9 verbatim: orbit steps `[24,18,13,9,6,4]`, sniper
zooms `[2,4,8]` (+16/25 flagged), pivot 2.5 m above turret, pitch clamp [-65°,+15°],
collision pull-in, FOV 60/zoom, hide player visual in sniper
(`player.visual.root.visible = false` — rig does this itself via `getPlayer()`).
Rig writes `getPlayer().input.aimPoint.copy(rig.aimPoint)` every update.

#### 3.1.6 Engine assembly note
Integration builds `EngineCtx` (§2.8) from these pieces. Engine files may import each
other freely (single builder).

### 3.2 world — `src/world/`
Exports locked in §2.7. Additional requirements:
- Browser integration imports `map.ts` dynamically on first battlefield use.
  `worldBuildCoordinator.ts` owns in-flight joins, background promotion,
  cancellation, residency, and eviction. A cold debug/capture switch is
  asynchronous; production battle and Studio entry await the same cached
  `ensureWorld` promise.
- `terrain.js` also exports `buildTerrainMeshes(heightField, engineCtx) => THREE.Group`
  (chunked LOD meshes + splat material per graphics doc §6–7; uses
  `engineCtx.setupShadowMaterial(mat, splatHook)`); `map.ts` calls it.
- `vegetation.ts`: `createVegetation(heightField, engineCtx, seed = 2001) =>
  { group, update(dt, camPos), setWindTime(t), treeObstacles: AABB[] }` — instanced
  grass + trees + wind per doc §8.
- `props.ts`: `createProps(heightField, engineCtx, seed = 2002) =>
  { group, obstacles: AABB[], colliders /* for raycast */, features /* minimap */ }` —
  rocks, ~10-building village, walls/cover, roads are terrain-material features
  (getGroundType returns 'hard' on them).
- Water: `shallowWater.ts` owns the translucent sea / lake sheet over the admitted wet cells and its apron past
  the square; `waterRipples.ts` the world-anchored GPU shallow-water field it reads for wakes and splashes; and (round
  66) `oceanSpectrum.ts` + `oceanFft.ts` the FFT ocean — a per-map spectrum (`ocean` block on the map config) turned
  into displacement / slope / foam maps by fragment-shader butterfly passes every frame — that the sheet displaces
  and shades with. The in-square sea colour and the marine ring faces stay the terrain material's; nothing here
  adds a terrain sampler.
- Small obstacle contact: street rubble, steel hedgehogs, and loose surface rocks
  (scatter scale 1.25–1.8, at most half embedded) crush immediately under a moving
  tank, including crawling/reversing, without an impact slowdown or track damage.
  Large rocks, authored tactical outcrops, and rubble repurposed as Reservoir
  waterworks remain solid cover. `crushableClutter.ts` keeps debris visible by
  flattening its existing batched vertices or rock instance; it adds no meshes,
  draw calls, or steady-frame work. All three hedgehog beams share one appended
  prop identity. Movement, shell collision, authoritative destruction events, and
  late-join state use that identity together; cached-world rematches restore exact
  original geometry and collision. Server shards must be recaptured after changes
  to this policy. `crushableClutter.selftest.mjs` exercises native collision shapes,
  light/heavy forward/reverse contact, track health and replication;
  `tools/crushable-clutter.browser.mjs` verifies live map geometry and resets.
- Building authoring has two performance contracts. Landmark geometry and its
  connected exterior fixtures merge into existing material buckets before GPU
  upload. Repeated destructible structures keep one intact and one broken
  `InstancedMesh` family, never one object/material per placement. Every
  individual landmark part must be connected within the authoring tolerance.
  `structureConnectivity.ts` owns the typed support-graph invariant and the
  structure selftests construct all 38 heavyweight/site builders with two
  deterministic variants before release. The 28 additional structure families
  retain 16 destructible families and their persistent broken-state pools.
  `structureInstanceAppearance.ts` owns deterministic per-instance diffuse
  variation; intact and packed broken slots must resolve the same tint without
  cloning a material or adding a live update.
- `destructibleRenderPolicy.ts` is the single cascaded-shadow classifier for
  destructible families. Buildings, cover, walls, fences, large silhouettes,
  and toppling actors keep dynamic shadows. Sub-meter grounded clutter can rely
  on direct lighting, GTAO, and received world shadows rather than multiplying
  a tiny silhouette through every cascade. Visible geometry and collisions are
  not changed by this policy.
- Building PBR fallbacks carry color, normal, and one packed linear surface map
  (AO in red, roughness in green). CC0 sourced replacements mutate those same
  texture objects asynchronously. Renderer-owned ACES tone mapping, PMREM,
  bloom and cascaded shadows must not be duplicated inside world builders.
- Map layout: village near center (≈ x -60..+80, z -40..+120), two roads crossing it,
  spawnPoints.player south edge of village, 7 enemy spawns spread N/NE/NW at 150–400 m.
  Terrain must be drivable (slope ≤ 35°) between all spawn points and the village.
- Determinism: same seed ⇒ identical world, byte-for-byte heights.

### 3.3 vehicles — `src/vehicles/`

#### 3.3.1 `specs.ts` (PURE data + pure functions; **no three import at all** here)
```js
export const TANK_IDS;                       // §2.1 locked order
export const TANK_SPECS: { [TankId]: TankSpec };
export function getSpec(id) => TankSpec      // throws on unknown id
```
`specHelpers.ts` is the registry-free typed constructor boundary for armor
quads, shells, internal module/crew boxes, and shared armor envelopes. It uses
meter-space three-value tuples and millimeter resistance values and must remain
free of DOM, Three.js, builder, and registry imports.
Locked stat values (transcribe the rest from tank-roster.md; these resolve ambiguity):

| id | hp | hullTraverseDegS | turretTraverseDegS | baseAccuracy | aimTimeS | terrainResistance | pivotStyle | reloadS |
|---|---|---|---|---|---|---|---|---|
| m1a2     | 2600 | 44 | 40 | 0.30 | 1.8 | 0.7/0.8/1.5 | neutral | 6.0 |
| t90m     | 2000 | 42 | 38 | 0.35 | 2.2 | 0.7/0.8/1.5 | neutral | 7.5 |

(The m4a3e8, tiger1, t34_85, is2, panther_g and leo2a7 rows retired with the
hidden fleet on 2026-09-23; the Leopard 2A7 row lives on as the unregistered
donor template in `src/vehicles/donorSpecs.ts`.)

`gunPitchDegS = 0.8 × turretTraverseDegS` (round to int). Bloom: WWII
`{move:0.20, hullRot:0.20, turret:0.12, afterShot:4}`, modern (stabilized)
`{move:0.06, hullRot:0.08, turret:0.06, afterShot:3}`. Elevation/depression, weights,
engine hp, speeds, shell pens/dmg: from the roster tables verbatim. Shell velocities
(m/s, locked): m1a2 1670/1400/1000; t90m 1750/905/850. (slots:
standard/special/HE.)

#### 3.3.2 `fleetFactory.ts` / `factoryGeometry.ts` / `tankFactoryCore.ts`
```ts
export function ensureTankBuilder(specId: string): Promise<void>
export function ensureTankBuilders(specIds: readonly string[]): Promise<void>
export function createTank(specId: string, engineCtx, opts = {}): TankVisual
// opts = { camoSeed = 4000, quality = 'high' }
TankVisual = {
  root: THREE.Group,                     // NOT added to scene — integration adds it
  specId,
  syncFromState(state: TankState),       // applies pos/yaw/visualPitch/visualRoll to root,
                                         // turretYaw/gunPitch to sub-groups, wheel spin +
                                         // track scroll from state.trackScroll & speed,
                                         // suspension bob hooks
  gunMuzzleWorld(out: Vector3) => out,   // world-space muzzle tip
  gunPivotWorld(out: Vector3) => out,
  turretTopWorld(out: Vector3) => out,   // for camera pivot / HP bar anchor
  recoilKick(ageS=0, impulseScale=1),    // barrel slide-back anim (visual only, self-timed
                                         //   via dt accumulated in syncFromState)
  stripEra(plateName),                   // remove ERA brick cluster visual (t90m)
  setDestroyed(),                        // burnt: dark material, drooped gun, decapitated
                                         //   turret optional; idempotent
  setVisible(v), dispose(),
  dims: { lengthM, widthM, heightM }, boundingRadiusM,
}
```
Browser consumers must await the builder gate before the first synchronous
`createTank` for an id. The strict import-free `fleetManifest.ts` owns the
id-to-family mapping; the loader table must cover every family at compile time,
and concurrent requests share one retryable promise. A missing gate throws
instead of silently constructing a legacy fallback. `tankFactory.ts` remains
the eager facade for Node audits and release tools that intentionally sweep the
whole roster. Geometry-derived combat-anatomy and vehicle-marking receipts use
the same demand boundary through `combatAnatomyCalibrationLoader.ts` and
`vehicleMarkingSeatLoader.ts`. Their typed registries validate each generated
record before publication; grouped payloads remain generator-owned TypeScript
and are never imported directly by browser feature code.
Geometry bar: per tank-roster.md §*.5 visual specs — composed BufferGeometries
(mergeGeometries), correct silhouettes, road wheels + sprocket/idler + track band,
signature details per Appendix B. ~8–15k tris full LOD; build a `THREE.LOD` with a
~3k mid LOD if time allows (optional). Track scroll: scroll a texture offset or slide
instanced links — builder's choice, must respond to `state.trackScroll`.
`wheelQuality.ts` is the release-facing receipt boundary for wheel families,
suspension linkage, inboard clearance, end-wheel construction, and working-gear
paint roles. Keep this audit out of player-frame work and run its fleet sweep
after shared running-gear changes.
All materials through `materials.ts`; every lit material passes through
`engineCtx.setupShadowMaterial`.

Final color-pass meshes receive deterministic semantic coplanar depth layers
after decoration, static batching and battle-detail grouping. This resolves
equal-depth seams between objects that must stay separate for materials,
articulation or damage ownership; shadow-pass materials are never offset.
Incorrect broad overlays must still be fixed geometrically. The fleet-wide
invariant is `npm run tank:surface-overlap:check`, which must report zero
unresolved positive-area, same-facing exterior overlaps.

#### 3.3.3 `materials.ts` (vehicles-internal; exact API is the builder's choice, but:)
```ts
export function createTankMaterials(spec, engineCtx, camoSeed) {
  return { hull, tracks, wheels, detail /* ... */ };
}
```
Procedural camo per roster paint notes (canvas textures, sRGB albedo, subtle normal/
roughness). MeshStandardMaterial only.

`appearanceAudit.ts` owns semantic material roles and the fixed neutral
running-gear palette. Builders may tag roles, but must not duplicate or bypass
its normalization and release-audit rules; painted armor and working gear are
separate even when they share a visual hierarchy.

### 3.4 movement — `src/sim/movement.ts` (pure logic)
```js
export function createTankState(spec, pos /* Vector3 */, yaw) => TankState        // §2.4
export function resetTankVerticalState(state, y, verticalSpeed = 0, grounded = true) => void
export function updateTank(entity /* {spec, state, input, combat} */, heightField, dt,
                           collide = null) => void
// collide: null | (pos: Vector3, radiusM: number, outPush: Vector3) => boolean
//   (integration provides tank-vs-tank + tank-vs-obstacle circle pushback; movement
//    adds outPush to pos after integration when it returns true)
export function fireRecoil(state, spec, shellSpec) // spring impulse per movement doc §6.4;
                                                // rapid IFV cannon recoil = 18%
export function computeDispersionRadM(spec, state, distM) => number   // r(D) doc §8
export const SIM_DT = 1/60;
```
Implements movement-physics doc §2–§8 and §10 pseudocode: terrain resistance via
`heightField.getGroundType`, hp/t acceleration (K_ACCEL 0.55, BRAKE_MULT 3.5,
TURN_SPEED_LOSS 0.3), slope penalty/overspeed, pivot vs neutral turns, reverse-steer
flip, 4-corner attitude sampling (half-length 0.35×hullLengthM, half-width 0.5×widthM),
spring ω=2π·3 ζ=0.6, inertial pitch, turret/gun chase of `input.aimPoint` with limits in
hull space (sets `state.atGunLimit`), bloom grow τ=0.05 s / shrink τ=aimTimeS/ln3.
Reads combat state ONLY via the locked debuffs table (§2.4) — guard for
`entity.combat == null` (treat as healthy). Updates `trackScroll` from speed & yawRate
(outer track faster: `v ± yawRate × 1.5 m`).

The current vertical contract supersedes the original terrain-height snap:
support is suspension-limited while grounded, then releases into deterministic
gravity flight after full droop. Grades at or above the rated climb angle are
contact constraints and cannot be crossed by residual uphill speed.

**Impact physics (2026-09-25, owner: speed-based damage, falls, rebounds at low gravity, proper physics).**
- *Landing.* The airborne ride's contact with the droop line is SWEPT inside the step: the crossing
  fraction gives the true closing speed (`state.landingImpactMps`, relative to the support's own vertical
  rate) and the remainder of the step integrates after the contact, so a 40 m/s fall never ends a step
  under the terrain or under a structure top and the rebound is the same at 60 or 120 steps/s. The
  closing speed rebounds by the ruleset's `physics.restitution` (`entity.modePhysics`, default
  `STANDARD_PHYSICS`), capped by `bounceMaxHeightM` (the arcade modes' 0.25 m hop); a rebound under
  `bounceMinMps` settles onto the loaded suspension. A landing on the tracks is the suspension's (physics
  lane, 2026-10-03; see *The landing stroke* below): the springs take the closing and return the rebound as
  they extend. A hull coming down on its shell (tumbling, on its side or roof) rebounds rigidly at once.
  `state._ride.bounces` counts the hops of one flight. A landing turns the hull toward the ground plane it struck
  (`_terr`), so a nose-first landing pitches even while it rebounds. On its tracks the hull pivots on the side or end
  that landed first (physics lane round 4; gauntlet wave 33: "landings are pure vertical drops, hull pitch and roll never
  move, even when one side touches first"): the fall's momentum about that contact turns it at v·r/(k² + r²) (the
  contact's lever r, the hull's radius of gyration k about the axis), never faster than aligns it in 0.08 s nor than
  its root can follow down (1.7 rad/s, 0.09 m a step), and while the landing settles a turn that would carry the hull
  past the plane stops on it, the other side's landing. Past 1.3 rad/s the turn grows with the closing at 0.45 of the
  rest, so a harder landing turns faster up to the cap (round 8: on the real tracks' narrower lever a 4.3 m/s landing on
  a 10° cross slope asked 1.67 rad/s, at the cap with the 6.9 m/s one). A level hull dropped onto a 10° cross slope
  turns onto it in 0.13 s at 6.9 m/s and 0.17 s at 4.2 m/s, where the attitude spring took 0.25 s for both. A hull running onto ground
  above 3 m/s meets it with the front of its tracks and rolls onto it along its travel, and one coming down on its shell
  takes the old impulse (the mismatch × the closing × 0.22).
- *Blocked drive.* `state.impactMps` is the closing speed the tracks lost this step; `impactSource` says
  what absorbed it (`IMPACT_SOURCE_CLIFF` — the terrain wall probe — or `IMPACT_SOURCE_COLLIDER` — the
  integration's pushback, whose bundle knows whether that was a hard surface or another hull) and
  `impactNx/impactNz` is the unit push direction, so the integration prices the crash on the face that
  struck (`sim/impact.ts`).
- *Slope.* A face steeper than the tracks hold in either direction (`trackGripMargin` ≤ ε, ≈ 42° on
  medium ground, under the 52° cliff grade) is a slide: no drive, no brake, the full pull `g·sin θ`
  against sliding friction `μ·g·cos θ` (`trackSlideCoefficient`), the reverse-gear cap lifted to the
  top-speed cap, `slopeBlocked` raised for the bots' recovery. Milder grades keep the climb law.
- *Lateral grip.* The yaw rate is capped so `v·ω ≤ 7 m/s² × g-scale × hard/resistance` (never under 30 %
  of the standing rate): unchanged below ~30 km/h on hard ground, a ~46 m circle at 60 km/h.
- *Rest.* A stopped hull with no throttle holds its grade when the holding decel (coast, brake, a
  wreck's locked tracks) matches the pull — no creep, no jitter.

**Contact edge cases (physics lane, 2026-10-03; torture harness `tools/physics-torture.mjs`, receipt
`tools/physics-torture.selftest.mjs`).** The rules each glitch class was decided by:
- *Boost ceiling.* An airborne boost (Turbo/Gravity jump) climbs no higher than two single-jump apexes over the
  ground under the hull; a boost that would add nothing is refused. Self-right hops keep one height in every
  gravity world (the launch scales with √g) and leave the ground as a jump does.
- *Ground pushes, never pulls.* Beyond the tracks' droop the ride falls no faster than gravity and is airborne
  (no hang allowance: the sprung mass never uses more than its authored droop while grounded). Two exceptions are
  kinematic, not pulls: a hull running down a grade keeps its tracks on it at its own travel's rate over the slope
  (only when every track sample carries it, and never while the ride still rises: over a crest it flies), and a hull
  tipping about an edge has its root follow the turn.
- *One track contact everywhere.* Each playable tank publishes its tracks' ground contact as data (round 8, the ruling
  of 2026-10-04: `sim/trackContact.ts`; the combat anatomy generator measures the built model's flat run, its centre,
  outer half width, lowest surface, belly pan and track-end rises, and `finalizeCombatAnatomy` puts it on the spec's
  armour), and the support solve reads it wherever it runs: the host, its Worker, the client's prediction, the torture
  matrix and solo play alike. The host used to run 0.45 x the hull's length either side of its root at the hull's full
  width (a 7.13 m line under the T-90M's 5.58 m of track); that default is now a synthetic test hull's only. The flat
  run is read off the drawn band (the coordinator's ruling of 2026-10-04 on item 1; `tankFactoryCore.ts`
  `bandGroundContact`, `drawnBandContact`): each band's loop, the same on every render tier, ends where the band has
  risen 4 cm off its ground run, carried through the band's transforms to the tank's frame and moved with the
  side-station bake, the union over sides and units, the end rise read off the bands past each end. The profiles'
  pinned contactZF/ZR used to publish the run whatever the band became: the T-90M's ran 0.75 m past its drawn ground
  contact, so the solve carried the hull at a trench's far bank on track that was not drawn while all its road wheels
  hung at full droop. The HIGH and LOW fleet passes hold every build within 5 mm of its published receipt.
- *The hull lies on its plane.* The attitude fit reads the ground's rise per hull-local metre under the track lines,
  sin(pitch) for a hull lying on it (`planePitch`, `planeRoll`); its arctangent laid the hull flatter than its ground
  (0.2° on a 15° face, 1° on 25°, 5° on 45°), the downhill end of a parked hull hanging up to 12 cm (gauntlet wave 23's
  slope strip read it as the uphill stations loaded). The drivetrain keeps the grade it was calibrated on
  (`feltGrade`), and the grade's turn of the travel its rise per hull-local metre.
- *Edges are tipped over, not chased.* Track samples hanging past 1.2 m over ground that is not one plane do not
  steer the attitude; a centre of mass beyond the samples still touching (the droop's reach) tips the hull about
  that edge under gravity, `α = g·d·cosθ/(r²+d²)` with `d` measured from the hull box's centre (the centre of
  mass), not the root (only toward the side it drives to, or at a crawl); a hull pivoting on an edge slides on its
  own belly (the grade the slope pull reads is its pitch); the spring that takes over when the tip ends starts from
  the landing blend's soft end. Faces (one plane under the hull) and bridged dips (nothing past 1.2 m) keep the full
  fit, and so does a pitch the supporting samples do not span (a cluster under 1.5 m long: a trench's far wall under
  the nose of a hull whose tail hangs over the trench is not its grade). A drop the ground comes back up from within
  9 m of the end the hull drives toward (a trench, a ditch) leans the hull only on samples its tracks can carry
  (within their reach of the loaded line, fading out at twice it): it goes over level until its centre of mass
  overhangs the near lip (physics lane round 7; leaning into the trench, a hull met the far wall 14-16 degrees nose-down
  at 9-11 m/s). A face that falls away and does not come back keeps the lean, so a hull over a crest follows it.
  While the hull tips about an axis the suspension rock conforms nothing about it (round 8, motion wave 73 item 2): the
  corners past the edge hang and those behind it lift off, and read within the wheels' reach they pulled the drawn hull
  back toward the ground it was leaving. A hull driven off a roof hung level over air while the physics tipped it
  (+5.2 degrees drawn against the tip when it left the roof) and spun up in flight as the rock let go; the drawn hull
  now tips from the moment the centre of mass passes the edge, at the rate it leaves with.
- *A stop takes the climb with it.* A blow that removes the hull's travel (the grade rule, the cliff probe, a
  collider) removes the same share of the vertical motion that travel carried; it prices nothing by itself.
- *A grade turns the travel.* The vertical speed the ground gives a hull on a grade comes out of its travel by the
  grade (`ds = −tanθ·dv`, the normal force's horizontal share): loaded with the whole track down, a change in the
  support's rate under the hull turns it (a grade taken gradually keeps the speed's magnitude, `travel·cosθ`; at once
  it loses the plastic share, `travel·cos²θ`; a crest it stays on gives it back); a landing on a face rising in the
  travel's direction is a normal impulse (its vertical part `cos²θ` of the vertical closing law's, its horizontal part
  out of the travel). Downhill landings, grades under 14 degrees (`GRADE_TURN_MIN`: a turn of under 6 % of the
  travel, left to the rolling ground every battle crosses) and a crawl under 1 m/s are left alone; the travel never
  passes through zero. A partial contact's leading station driven into a face (smooth, at least 0.5 grade: a trench's
  far wall) is pushed along that face's normal too: the lift it gives the hull costs the travel the face's grade times
  it (physics lane round 7, the trench ruling of 2026-10-04: an assault trench's far wall lifted a hull at 13 m/s with
  all its travel kept). A floor that rises past that station further than the bump stops take (8 cm a step) turns the
  hull about its centre of mass as well as lifting it, as a rigid body struck there moves: the root takes its share,
  `k²/(k²+a²)` of the rest, and the turn the remainder as a pitch rate eased in at 0.25 rad/s a step. Trenches crossed
  at speed slow at the far wall: entering an assault trench at 11 m/s, the median hull's slowest is 7.9 m/s where it
  kept 9.0. A strike on the hull's own body is a station too (round 8): an end guard (the lowest shell past the tracks'
  flat run at each of four pitches, 14 to 63 degrees, in three lateral bins; up to 24, the fleet's median 7), or on a
  structure one of the contact box's bottom corners 0.15 m over the track line, whatever the tracks' seat, grip or
  travel. There are no stops between: the strike is the plastic impulse a rigid body takes at the struck end, in its
  pitch plane (`rigidStrikeImpulse`): the face pushes along its normal and grips along it, up to 0.7 of the push
  (`STRIKE_FRICTION`, steel ploughing soil; the hull's shell does not roll as a track does). The end stops on the face
  where the grip holds it and slides under the grip where it does not; the push at the end turns the hull nose-up, the
  grip below the centre of mass turns it back, and the travel loses both shares. A frontal strike digs in (round 8,
  motion wave 73 item 3): pushed along the normal alone, a T-90M meeting an assault trench's 42-degree far wall at
  11 m/s slid up it with 7 m/s of its travel and a 1.4 rad/s nose-up turn and sailed off the lip onto its tail; it now
  stops at the wall, 11 to 0.3 m/s, and climbs out. The turn eases in at most 0.2 rad/s a step, the root taking the
  end's rise the turn defers, and the depth
  the end is left with comes back as position, at most 0.1 m a step (round 8, the parity iteration: taken at once, with
  the step's whole depth as the end's closing rate, the end rose past the ground, the spring brought it back and it
  struck again, step after step; a trench crossing's rendered jerk p99 rose by more than half).
  A turn about the centre of mass that would sink the far end's body contact turns about that contact instead. A body
  contact the hull rests on above its tracks joins the contact-aware fit (the plane, the gravity tip about it, the root
  following a pivot there): a hull half over a roof's edge, its tracks past it, tips off the roof on its box rather than
  resting on its nose 0.6 m over its track line, 0.55 m into the roof by the standing rule's reading, until the rule
  pushed it out 0.15-0.9 m in a step. A body contact against a face steeper than the wall grade (the ground rising to
  it from 0.3 m back) is no floor: the face meets it horizontally.
- *Landing speed is the hull's own approach.* An airborne hull's ground moves only with its own travel over the
  slope beneath it (its grade along the travel, read from two world samples once the hull is pitched past 72
  degrees and its track samples stack over one point), never with the support envelope's swing as the hull turns.
  Falling support is followed uncapped; only a rising one is bounded (12 m/s) as a launch. The grade is the track
  samples' rise per hull-local metre (the sine of the plane pitch the fit reads) over the cosine of the hull's pitch
  (physics lane round 6: once the fit took the arcsine, the tangent read there made a 46-degree bank under a hull
  pitched 45 degrees a 57-degree one, rising 47 % faster under the travel than it does).
- *The landing stroke.* A landing on the tracks carries its closing into the springs: from the touchdown on the
  drooped tracks' line until the hull has come back up through its seat they work at the landing damping (ζ 0.45,
  `LANDING_ZETA`; driving keeps the critical damping), so a hard landing bottoms on the stops and a soft one dips,
  then rises through the seat and settles. The touchdown's step goes on after the contact on that law, damped against
  the ground's own rate under the travel (round 8; wave 42: "the hull loses a whole step of fall at touchdown"): the
  ride used to stand on the contact line for the rest of the step, so a 2 m drop touching early in its step moved
  3 cm in it where its fall carried 9.5. A remainder that would pass the floor keeps the line. Past its static sag over the seat (`g/ω²`) on that overshoot the springs
  are unloaded and only gravity brings the hull down (`_ride.stroke` 2, while the ground under it holds still): the
  Moon's overshoot rises and falls at the Moon's gravity. The springs used to pull it down at their own rate, seven
  times the Moon's gravity after a 12.5 m/s landing, and every gravity's landing settled on Earth's timeline
  (gauntlet wave 23); that landing now settles in about a second, where it took 0.6 s. The bump stops are progressive: a fall the springs would not stop in the
  travel left above the floor is stopped across that travel, never in one step at the floor. On the landing stroke
  they start 8 cm under the seat and take work growing with the cube of their own travel, sized so that with the
  springs they would take a 15 m/s landing just at the floor (physics lane round 4; gauntlet wave 33: "peak
  compression barely scales with impact"): a 3.9 m/s landing strokes 10 cm, 5.9 m/s 12 cm, 7.3 m/s 13 cm, 9.6 m/s
  15 cm and 12.3 m/s 17.5 cm, where every landing from 7 m/s used to bottom at the same 19 cm. Each step they take
  the work of the step's own travel into them, never push back (the rebound stays the ruleset's), and stop the stroke
  inside the step where that work meets the fall's energy. The rebound the
  ruleset owes is returned by the springs once they have stopped the fall (`_ride.rebound`): they extend and the hull
  leaves the drooped line at that speed. Ground moving faster than the rebound (a face the hull then runs down, or a
  wall lifting it) leaves none to return. A hull coming down on its shell rebounds rigidly at once, or stops its
  closing at the contact past 3 m/s. The rendered road wheels droop in the air and are pushed up into the hull by the
  compression (the gear conforms them to the ground at the rendered pose).
- *Weight transfer is the suspension's dive.* Braking and acceleration pitch the hull on its suspension, not the
  attitude: the dive (`_susp.d`, part of the rendered rock) rides its own spring (ζ 0.35, `DIVE_ZETA`), the support
  solve seats the tracks without it, and the road wheels conform under it (front compressed, rear drooped). It is
  limited by the suspension travel left at each end, and off a whole-track seat (a trench crossed, a crest, an edge)
  it joins the rock the tracks are seated at. A hard stop dips the hull 2.5-3.5 degrees with its tracks planted and
  rocks it back past level (about 0.9 degree) when the tracks stop pulling. What the travel takes from the dive when it
  runs out (the springs bottoming as a trench's far wall lifts the hull) the bump stops take (`_susp.c`, round 8): the
  dive is cut to the travel at once, and the drawn hull gives the excess up over the stops' spring (4.8 Hz, critically
  damped) instead of in the same frame. That share is drawn and is no part of the dive the travel holds, nor of what
  joins the rock off a whole-track seat; the movement checkpoint carries it from version 8. That layout is 63 values,
  and the wire carries at most 64 (`MAX_MOVEMENT_VALUES`, `src/mp/wire/constants.ts`; the codec rejects more): a lane
  adding more than one value of integrator state widens that limit first.
- *A hull holds a posture over its tracks on a grade, and it is the hull's attitude.* The gravity the tracks hold the
  hull against on a grade (physics lane round 5; gauntlet wave 38: "on a 17.9-degree grade the front and rear stations
  carry about the same travel ... a real tank shows a clear rear-heavy gradient") loads the downhill end along the hull
  and the downhill track across it: the moment it leaves under the centre of mass (45 % of the hull's height over its
  tracks) is taken by the springs' pitch and roll stiffness, the ride's rate over the stations along each track and over
  the two tracks (`holdTransferAngles`). The grade is the ground's under the tracks, the terrain fit's, not the hull's
  own attitude, which carries the posture a hydraulic suspension aims it with and a shot's recoil. The posture (`_hold`,
  drawn at the rock's visible scale and reached critically damped: a parked hull's attitude is still within a second
  and a half, and the fit's steps on a trench's walls reach it smoothed) is part of the hull's attitude: visualPitch
  and visualRoll are the attitude spring plus it, so the armour, the bores and launch mouths, the aim solves (a
  fixed-bore casemate's hydraulic lay included), the snapshot and the renderer read one attitude, and at rest the
  rendered rock adds nothing to it. The support solve seats the tracks at the spring's attitude, without it, so the
  hull pitches and rolls over planted tracks and the road wheels conform under it. Off a whole-track seat it joins the
  share the tracks are seated at (`_holdSeat`, relaxing at the rock's rate), as the dive joins the rock; the suspension
  travel limits it with the dive; the movement checkpoint carries both from version 7. Parked facing up a 25° grade the
  medium hull pitches 1.1° further onto its downhill tail, its stations 17 cm apart end to end; on a 20° cross slope it
  rolls 1.1° onto its downhill track, 8.2 cm under the uphill one. Across, the springs bear on the tracks' centre lines,
  half the track's width in from its outer edge (`trackCentreHalfGauge`; round 8, wave 42: "side-load transfer is about
  half its physical size"): read at the outer edges, the roll stiffness was 22-71 % high (42 % at the fleet's median)
  and the hull rolled 0.8°, 5.9 cm. A slide, or a hull on its shell, holds nothing and
  transfers nothing. The posture and the dive turn the drawn hull over its seated tracks about its root, and past the
  tracks' ends the overhang swings down with them; where an end guard would go into the ground (read at the tracks'
  seat and at the drawn pose, the ground the hull can reach) the end rests on it: the posture and the dive keep the
  share of their turn that brings it down to the ground, and their rates into it stop (round 8: on the drawn model's
  tracks a BMP-2 holding its posture at a wall's foot drew its tail 18 cm into the ground). On the ground they give way
  at most 0.003 rad a step, the root holding the drawn end on the ground meanwhile; at once, the drawn pitch jumped by
  up to two degrees in a step. Nothing at rest changes. A landing is judged by its tracks' attitude, the spring's, not the posture. (Held in the rendered
  rock, as first built, the posture put the drawn hull off the authority's at rest: a UDES 03 laid its fixed bore 0.69
  degree off its sight on flat ground, where its own hydraulic nose-up posture read as a grade, and 1.08 degrees off on
  a 14-degree grade; a ZTZ-100's launch mouth sat 1 cm off the server's on its first shot and 8 mm once settled on a
  6-degree side slope.)
- *A level landing nods about the centre of mass.* The springs stop a fall at the middle of the tracks' contact, and
  the hull's centre of mass lies off that point along the hull (physics lane round 5; gauntlet wave 38: "flat
  landings are perfectly level pistons"). Its anatomy places it: the turret's share (30 %) at the turret's pivot, the
  power pack's (10 %) at the middle of its engine and transmission modules, the rest at the contact's centre
  (`tankMassCenterOffsetM`; a spec without modules has none). Across the fleet it lies from 0.5 m aft of the contact's
  centre to 0.4 m ahead of it, 0.22 m aft at the median. A landing met level (on the tracks, the hull within
  3 degrees of the ground's pitch and roll) turns the hull about it by the closing speed times that offset over the
  hull's pitch radius of gyration squared (`(L² + H²)/12`), into the dive and at the rendered rate (the rock's
  amplification taken out). Through the landing's stroke the dive is damped at ζ 0.6 (`LANDING_DIVE_ZETA`; round 8,
  wave 42: the nod "rebounds past level into a brief nose-up ... more like a loose spring than a damped torsion-bar
  system"): a damper's force rises faster than its speed, and the small pitch rides on a heave of metres a second.
  Off a 2 m drop the T-90M nods 0.85 degree tail down and comes back 0.07 degree past level, still within half a
  second (at the stop's ζ 0.35 it was 1.15 degrees, back 0.35, rocking for 1.1 s); the BMP-2 0.6 degree nose down, a
  Merkava 4 1.0 degree nose down; from 8 m the T-90M 1.1 degrees, the excess over its travel drawn on the bump stops.
  A landing on a grade, or a hull met tilted, already turns at its contact (the landing turn) and takes none. The
  fall's damage and its stroke are unchanged.
- *The tracks' springs carry the hull over rough ground.* Every track-contact station (the outer pair and the wheel-run
  fan lines) is a spring loaded to the ride's static sag (`g/ω²`), and the seat the ride rests at is where the stations
  that reach the ground carry the hull's weight, read over the stations' own plane (that plane is the attitude's): on
  flat ground the common contact, on a bump the bump's road wheels pushed up into the hull and the rest reaching down.
  The seat sinks at most 0.1 m (`TRACK_SEAT_SINK_M`) under the highest contact (`_sup.top`, still the ground for
  launches, landings, the floor and the drooped tracks' line), never under a track end or the belly; a station hanging
  1.2 m under the highest, or out of the springs' reach, is no part of it, and rigid running gear has none. A heavy hull
  on rubble used to perch on its highest contact with half its road wheels hanging (gauntlet wave 23, "no wheels down
  in several frames"): 1.48 s of 6 on two stations or fewer and 6.8 of 12 in reach, now 0.13 s and 9.9.
- *The step that leaves the ground moves.* A loaded ride that detaches integrates that step on gravity alone; it
  used to stand still for it, a 13 cm stall in the motion of a hull leaving a face at 8 m/s.
- *Structures are floors by the underside.* A part is a floor for a hull when its top is within the 0.55 m
  step-up of the hull's lowest underside point over that part's footprint (a 5 × 3 grid over the hull's footprint,
  the nose and tail rows lifted by the shell's own rise there; the track rows decide when any lies over the part) —
  in the support field (`structureSupport.beginHull` with `hullSupportPose`), the authority's and the solo sim's
  obstacle solver and the client's prediction world alike; otherwise it is a wall. A nose or tail row alone over a
  part stands on it only with the step-up counted against it, but clears it in the air as the track plane under it
  does (`clearBottom`, the tracks that meet the part next): read through the step-up, a nose a metre over a viaduct
  span's sub-deck slab cleared it by 0.45 m, under the 0.5 m overpass, and the slab stopped a hull with no nose lift
  dead on the deck at every span joint (Aegis Crossing, 248 hp a joint); read at the nose's lifted height, a high
  glacis passed over a low wall its tracks then met deep inside.
- *The footprint is the hull at its attitude.* The obstacle solver pushes, and the underside is sampled over, the
  contact rect's track plane projected onto the ground (`world/collision.ts hullFootprint`): foreshortened by the
  pitch and the roll, never longer or wider than the rect, its underside rising across it as the tilted plane does.
  A push is the shortest way out of a footprint (the separating distance toward either side, not the overlap of the
  projections, which for a hull inside a wide footprint is its own width).
- *Firing in flight.* An airborne hull takes a tenth of the recoil's ground rock as rotation (the rigid body's share;
  there is no suspension to rock against), and a tenth of a shell hit's (a hit at the top of a Moon boost spun the
  hull onto its back before it came down).
- *Edges and shells slide.* An undriven hull tipping about an edge, or tumbling, rests on that edge or on its shell,
  not on its tracks: nothing holds it but sliding friction (the slide law), so a hull that lands across a roof's edge
  tips off it and falls instead of see-sawing there for seconds. A driven hull keeps its tracks' purchase.
- *Contacts settle.* Each obstacle record meets the hull where the records before it have pushed it, as a
  compound's parts do, and the contacts that pushed are swept once more from where the first sweep left it, in the
  authority, the solo sim and the prediction world alike. Summed from one position, two contacts pushing opposite
  ways (a hull pivoting across a fence line, a rail under each end) each corrected the whole overlap, and the hull
  flipped from side to side every step until one contact won with a 0.65 m jump.
- *Hull on hull.* A roof contact is measured where the footprints overlap (the upper's lowest shell point over the
  lower's rect against the lower's highest under the upper's); the horizontal solver reserves a pair for the
  vertical layer by that same depth, and a hull standing 0.5 m above its own support is never ground traffic.
  Shell pitch composes as the renderer does (`+z·sin pitch`).
- *Walls hold; they do not carry.* Ground more than the 0.55 m step-up above where the hull stands is a wall where it
  lies on a face steeper than the 52° cliff grade (all wall from 62.5°, a share of wall between) or beyond one (rising
  from the root faster than the cliff grade on average): the support solve reads such a sample at the ground the hull
  can reach, the face's foot, never the face's height, and the face holds the hull off horizontally along its normal,
  3 cm clear, at most 0.1 m a step, taking the travel into it as a wall impact (the hull's outline as drawn: 11-21
  points of its closed shell). A hull partly over an 80-degree face at the foot of its apron (maps lane A's Redrock and
  Skybridge faces) was carried 7-12 m up the face by its own samples and dropped back, again and again, for 500-1900 hp.
  A sheer face taller than a track climbs (rising more than 1 m from its foot, steeper than the wall grade over 0.25 m),
  within 0.75 m of a track sample toward the root, is the face's wherever the ground there stands more than 1 m over the
  track line: the sample reads its foot, however far the cone of the cliff grade reaches, and a hull point deep inside it
  is held off back toward the root (round 8). Ground the hull is level with is not a climb.
- *The ground lifts a ride at most 0.25 m a step.* A floor that rises past the ride faster (a support that jumped
  under the hull, a top found under it) lifts it over several steps, never in one.
- *A fall is the hull's own.* Fall damage prices the closing less, by energy, the height the support rose under the
  ride beyond what its own travel (and its turn on the spot) over a climbable grade explains (`fallImpactMps`; the
  ledger forgets over a second of riding the springs): a drop caused by the solver correcting itself is never a fall.
  It is charged along the face's normal (physics lane round 6; Skybridge fall census: hulls climbing a 46-degree bank
  hopped off its convexity and met the face 0.4 s later for 75.6 and 160.5 hp). The closing is vertical: the ground's
  rise under the travel and the hull's fall. The face meets the hull at that times the cosine of its slope along and
  across the travel (`landingFaceShare`), where the ground under the hull's middle holds a face at the grade the
  closing read; an edge or a step under the hull (a roof's edge) keeps the vertical closing. A hull leaving a bank's
  lip at 6.5 m/s and meeting the 50-degree face 0.4 s later lands at 5.7 m/s vertical (8.8 with the grade misread)
  and is charged 3.6, nothing, where it lost 61 hp; an 8 m drop onto a 25-degree grade is charged 9.9 m/s, not 10.9.
  The bounded rules (the gravity modes, Turbo Ball) keep their own vertical law.
- *Known limits.* Rigid rotation is still about the root, though the tip lever reads the box centre (a nose-first
  landing settles about its centre, so it can hop a few times on a sharp kicker); a hull balanced exactly on a 4 m
  edge hangs nose-up near 80° before it slides off (its tail cannot reach the ground sooner); the drivetrain feels a
  grade flatter than the face (24.0° on 25°, 40.1° on 45°: `feltGrade`, the reading its climb and grip were calibrated
  on before the hull lay on its plane); casemate barrels can dig in; a hull pivoting
  against a face that runs across the terrain's triangle grid loses its support for one tick where a corner leaves the
  face's smeared foot: the ride is flagged airborne for that tick and its landing reads its own descent (0.8-1.6 m/s),
  its vertical speed continuous through it and under every consumer's threshold (the landing thump's 2.2 m/s, any
  damage), so nothing hops on screen; and a hull spawned overlapping such a turned face holds its upper rear corner up
  to 0.9 m (vertically; 10-16 cm into an 80° face) inside the triangulated face for its first second while the wall
  push clears it, where faces along the grid read 0. Spawn pads never overlap a face; a drive-in case that shows the
  penetration reopens it.

### 3.5 combat — `src/sim/` (pure logic)

#### 3.5.1 `ballistics.ts`
```js
export const GRAVITY_SCALE = 1;                         // g_shell = 9.81 × this
export function createShell(shellSpec, shooterId, isPlayer,
                            muzzlePos: Vector3, dir: Vector3 /* unit */, id) => ShellEntity
export function stepShell(shell, dt) => void            // integrate; sets prevPos
export function penAtDistanceMm(shellSpec, distM) => number   // lerp pen100→pen1000, clamp
export function aimElevationRad(distM, velocityMps) => number // 0.5*asin(g*d/v²) clamped
export function solveBallisticGunLay(out, muzzlePos, aimPoint, shellSpec) => boolean
//  AI-only physical lay solver. Trigger-time firing never calls this: every
//  shell leaves along the actual articulated bore and gravity acts afterward.
export function applyDispersion(dir: Vector3, dispersionRadM_at100 /* i.e. r(100)? NO — */,
                                sigmaRad, rng) => void
//  LOCKED: pass sigmaRad = (computeDispersionRadM(spec,state,100) / 2) / 100
//  (radius = 2σ at 100 m ⇒ σ in radians = r100/200). Gaussian x/y via Box-Muller from
//  rng, re-roll while outside 2σ; rotate dir by the two angular offsets.
export const SHELL_MAX_LIFETIME_S = 6;
```

#### 3.5.2 `armor.ts`
```js
export function tankPoseFromState(state) => Pose
Pose = { pos: Vector3, yaw, pitch, roll, turretYaw, gunPitch }   // radians
export function traceTank(from: Vector3, to: Vector3, pose, armorModel, eraSpent /* Set */)
  => Intersection[]     // sorted by distance along segment
Intersection =
  | { t, kind:'plate',  plate: Plate, point: Vector3, normal: Vector3 /* world, outward */,
      impactAngleDeg }
  | { t, kind:'module', module: ModuleName, point: Vector3 }
  | { t, kind:'crew',   crew: CrewName,   point: Vector3 }
export function queryAimArmor(from, dir, maxDist, pose, armorModel)
  => null | { plate, impactAngleDeg, point: Vector3, distM }
  // first 'main'|'spaced' plate hit — used by HUD pen indicator + AI weak-spot aim
```
Transforms: world → hull local (translate −pos, rotate −yaw/−pitch/−roll in the inverse
of tankFactory's order) → turret local for turret plates/boxes (−turretYaw about
turretPivot, and −gunPitch about gunPivot for `gunFollow` plates). Use Matrix4 built
once per trace.

#### 3.5.3 `damage.ts`
```js
export function createCombatState(spec) => CombatState        // §2.4; module HP table:
//   trackL/R 100, engine 160, fuelTank 120, ammoRack 150, gun 150, radio 90,
//   optics 80, turretRing 120 (×2.5 for modern tanks)
export function resolveShellHit(shell, target /* TankEntity-shaped: {id,spec,state,combat} */,
                                hits /* traceTank result */, rng) => HitEvent
// Full armor-penetration doc §12 algorithm: ricochet(raw angle, physical mm, 3× overmatch)
// → normalization(+2× overmatch boost ×1.4·C/T) → KE/CE effective thickness with slope
// exponent (AP/APCR 1.4, APFSDS/HEAT 1.0) → ERA (applyERA) → spaced absorb (HEAT −5%
// initial pen per 10 cm gap) → pen check (±25% rolls, once) → hull damage → 10×caliber
// internal ray for module/crew saving throws (§9 table) → fire rolls → ammorack/crew death.
// Mutates target.combat; ricochet with bounces<2 leaves shell alive with deflected vel.
export function resolveHeBurst(shell, burstPoint: Vector3, tanks /* TankEntity[] */,
                               directTarget /* entity|null */, directHits, rng) => HitEvent[]
// direct-hit pen attempt on directTarget, else surface burst + splash over all tanks in
// blastRadiusM(caliber) (shells doc §6 formula, absorb 1.1×armor).
export function tickFire(entity, rng) => { damage, extinguished, destroyed }  // per 0.5 s
export function selectShell(combatState, slot), startReload(combatState, spec)
export function startPostShotReload(combatState, spec) // shell or magazine cycle
export function startMagazineReload(combatState, spec) => boolean // discard partial clip
export function tickReload(combatState, dt) => boolean // true on ready edge
export function estimatePenRatio(shellSpec, distM, plateInfo /* queryAimArmor result */)
  => number   // avgPen / effectiveMm using normalization+slope-exponent, NO rng.
              // HUD color: ≥1.15 green, 0.85–1.15 orange, <0.85 red.
export function blastRadiusM(caliberMm)
```

#### 3.5.4 `combat.selftest.mjs`
Runnable: `node src/sim/combat.selftest.mjs` — exits 0 silent-ish on pass, non-zero with
message on fail. Must NOT import `specs.ts` (may not exist yet) — use inline fixtures.
Required asserts (rng stubbed to constant 0.5 ⇒ rolls = 1.0×; angles are raw impact
angles from plate normal):
1. T-34-85 BR-365K (AP 85 mm, pen100 119, pen1000 97) at 500 m ⇒ `penAtDistanceMm` =
   109.2 ± 0.5. Vs Tiger I driver plate (100 mm @ 0°, steel), head-on ⇒ `pen`.
2. Same shell vs Tiger upper hull 100 mm at raw impact angle 55° ⇒ effective
   100/cos(50°)^1.4 ≈ 187 mm ⇒ `nonpen`.
3. Tiger PzGr.39 (88 mm) at raw angle 75° vs 45 mm plate ⇒ ricochet (75>70, caliber
   88 < 3×45=135).
4. IS-2 BR-471 (122 mm) vs 25 mm roof at 80° ⇒ NO ricochet (122 ≥ 3×25), normalization
   5×1.4×122/25 = 34.2°, effAngle 45.8°, eff = 25/cos(45.8°)^1.4 ≈ 41.5 ⇒ pen.
5. HEAT (m1a2 M830A1, pen 600 CE) through a 10 mm spaced skirt then 0.5 m air gap ⇒
   remaining pen = (600−10/cos)·(1−0.05·5) = 0.75×… assert per §7 formula, penetrates
   a 300 mm CE side but not an 800 mm CE turret.
6. ERA: 3BM60 (KE) on Relikt tile {keReduction 0.25} ⇒ pen ×0.75, tile in eraSpent,
   second hit on same tile unaffected.
7. HE splash: 122 mm HE (dmg roll 450) burst 2 m from a 38 mm side plate ⇒ with
   `blastRadiusM(122) = 0.66·(122/30)^1.3 ≈ 4.09`:
   `0.5·450·(1−2/4.09) − 1.1·38 ≈ 73.2` damage (assert within ±1).
8. Module: penetrating ray through engine box with rng forcing save-fail ⇒ engine hp
   −moduleDmg and fire roll consumed. RNG consumption order fixed: pen, dmg, then
   per-intersection (save, moduleDmg, fire).

#### 3.5.5 `impact.ts` — speed-based collision damage (2026-09-25)
```js
export function excessEnergyKj(massTons, closingMps, minMps) => number  // ½·m·(v − v_min)², 0 under v_min
export function impactZoneFactor(faceForward) => number   // +1 glacis 0.7, −1 stern 0.85, 0 broadside 1
export function hardImpactDamage(physics, massTons, closingMps, faceForward) => hp  // kJ × impactHpPerKj × zone
export function fallDamage(physics, massTons, landingMps, attitudeFactor = 1) => hp   // kJ × fallHpPerKj × factor
export function fallAttitudeFactor(pitchErrRad, rollErrRad, upY) => number  // 1 + 0.6·nose + 0.3·tilt + 0.5·inverted
export function resolveHullImpact({ combat, massTons, physics, kind: 'impact'|'fall', closingMps,
  priorClosingMps?, faceForward, sideSign, attitudeFactor, rng }) => HullImpactResult | null
// hull hit points through hullDamageTaken (the ruleset damage scale); modules when the ruleset breaks
// them — tracks first (near 80 % / far 30 %, both 60 % head-on; a fall 50 % each), the engine on a
// frontal crash (35 %) or a landing (15 %); crew shock above CREW_SHOCK_IMPACT_MPS 16 / _FALL_MPS 14
// (one draw, 40 %, the driver first). A wreck takes nothing. priorClosingMps prices a crash the movement
// spread over two ticks once, on its accumulated closing speed.
export function ramShares(physics, massA, massB, closingMps, aggressionA, aggressionB, faceA, faceB)
  => { total, toA, toB }   // damage.ts ramDamage pool × ramScale, split by mass, each share discounted
                           // 35 % × its aggression (its share of the closing speed) × its face's zone factor
export function ramAggression(closingMps, ownApproachMps) => 0..1
export function hullVelocityAlong(state, nx, nz) => number      // drive along the heading + the decaying shove
export function exchangeRamMomentum(a, b, nx, nz, massA, massB, vAn, vBn, restitution) => boolean
// n from b to a, vAn / vBn the pre-contact normal velocities: both leave at the centre-of-mass velocity
// ± restitution × closing split by mass (momentum conserved, energy never grows); the along-heading part
// joins `speed`, the lateral part rides the recoil translation.
```
Every number a mode bends lives in `matchRuleset.ts` `RulesetPhysics` (`restitution`, `bounceMinMps`,
`fallMinMps`, `fallHpPerKj`, `impactMinMps`, `impactHpPerKj`, `ramScale`, `ramRestitution`); the mode
controller stamps it on every entity as `modePhysics`. Both integrations (`game/state.ts`
`resolveTankImpacts`, `authoritativeMatch.ts` `resolveEntityImpacts`) price a hard contact only when the
collider reports a hard surface (the map edge, a solid primitive) or the movement reports a cliff — a push by
another hull is the ram resolution's; a contact tick under 0.5 m/s is the drive pressing, and a crash's ticks
within 0.3 s of its first are one blow. Receipts: `impact.selftest.mjs` (the laws), `impactPhysics.selftest.mjs`
(the movement side), `impactParity.selftest.mjs` (both sims, the authority's crash and fall, a bit-for-bit replay).

### 3.6 ai — `src/game/ai.ts` (pure logic; may import sim modules + specs)
```js
export function createAI(entity, opts) => AIController
// opts = { difficulty: 'easy'|'normal'|'hard', rng, deps }
// deps = { heightField, raycast /* World.raycast */, getEnemies: () => TankEntity[],
//          getAllies: () => TankEntity[], getObstacles: () => AABB[], spotting }
AIController = {
  update(dt, timeS),   // writes entity.input (§2.4 TankInput) — throttle/steer/aimPoint/
                       // fire/shellSlot. NOTHING else. Reads enemy state read-only.
  setWaypoints(points: [x,z][]),
  notifyShellResult(hitEvent), notifyUnderFire(shooter),
  notifyPlayerFired(shooter, distanceRank), notifyFriendlyBlocked(risk),
  targetId: string|null,
  state: string,       // 'patrol'|'engage'|'seekCover'|'flank' (debug/HUD)
}
```
Behavior: every non-player tank on both teams uses this same controller and difficulty
tier. Role comes only from its own TankSpec (`scout|sniper|brawler|flanker`). Target
selection is spotting-gated, LOS-confirmed, HP/threat weighted, and coordinates focus
fire in groups of 2–3 without dogpiling. Travel-time lead is iterated twice; state.ts
owns ballistic elevation. Armor probes choose weak spots/shells and two non-pens trigger
a flank. Normal-tier locks are reaction 0.55 s, fire factor 1.0, aim error ×1.25;
easy/hard remain 1.2/0.3 s, 0.6/1.2 and ×2.0/×1.0.

Survival is role-aware: reload cover, hull-down search, outnumbered advance guard,
shoot-and-scoot, scout kiting, damage-burst memory, and low-HP/track fallback toward
support (or away from the threat when alone). Navigation includes obstacle corner hops,
teammate separation, stuck recovery and firing-lane relocation. Relocation cells
(shoot-and-scoot legs, vantage rings) must stand on ground the hull can hold and reach:
terrain normal.y ≥ 0.90 at the cell and ≥ 0.86 at the leg's interior samples (round 48
pacing, 2026-09-24: a last bot chained 14 s scoot legs on Frosthollow's ridge flank for
160 s, never arriving and never firing, until the 15-minute cap). A target whose hull has held still and whose gun
has stayed silent for the passive dwell, and that this bot's shells have stopped penetrating, is pressed after the
deployment window to a 70 m side aspect whose gun-to-hull lane and elevation arc are clear — scoot legs, the
low-health fallback, the settle holds and the flank ring yield to the press, and it ends the moment the target moves
or fires (round 60 pacing, 2026-09-24: nine of fourteen capped battles ended with the last bot's racks empty against
the idle host). The weak-spot probe scores only zones the gun can reach (world ray from the gun, elevation /
depression arc) and falls back to the visible turret; a flank that leaves the gate closed carries on toward the rear;
an overturned bot holds its drive still and requests the self-right. A bot without contact searches on legs planned
over the match's navigation grid (`deps.planRoute`, the opening-route planner without its role detour): the goals
rotate through the enemy's sector, a sighting younger than 45 s, the objective and a sweep ring whose bearing turns
with every leg, a goal in another connected component is skipped, and a leg is given up only on its own evidence
(route consumed, three stuck strikes, its time budget) — round 62 pacing, 2026-09-24: Urban's survivor re-routed
every 8 s to a midpoint inside a block for 340 s. The rack is finite: the HE fallback fires only a real HE round whose
surface burst is worth a shell, laid on the zone that priced it; the penetration gate's ratio answers the lay error
as well as the penetration roll (1.0 at 80 m, rising to 1.15 at 320 m); a lay
whose expected hit chance (tier σ plus dispersion against the silhouette, the bar rising as the rack empties) is too
low is closed on rather than taken at a bot or a passive target — a live player is threatened from range as before —
and an empty rack rams only when the ram law makes the exchange survivable, otherwise retires.

A commander may hand the controller a standing order (`setOrder(AiOrder)`: posture, target, fire
discipline, threat read, a point, an expiry) — the Jev commander (`docs/JEV-COMMANDER.md`,
`src/game/jevCommander.ts`) asks TypeSafe's System One model once per team every few seconds and
applies its answers this way; every read of the order is gated on it being live, so with no order
the controller is byte-identical to the classic brain, and an expired order restores it.

Before firing, `botFriendlyFireRisk()` predicts teammate motion through the shell
corridor and HE blast radius. A blocked bot holds fire and moves laterally; state.ts
repeats the same guard authoritatively, makes bot HE splash team-safe, and applies zero
same-team ram damage. The human player's trigger remains unrestricted. All randomness
flows through `opts.rng`.

### 3.7 hud — `src/ui/`

All DOM/canvas overlay, appended to `document.body`, `pointer-events: none` except
garage & interactive buttons. No three.js scene objects; may import three for
Vector3/projection math only. Crisp typography: system font stack
`'Segoe UI', Roboto, Helvetica, Arial, sans-serif`, no placeholder styling.

#### 3.7.1 `hud.ts`
```js
export function initHud(bus) => Hud
Hud = {
  setMode(mode /* 'battle'|'sniper'|'hidden' */),
  update(frame: FrameInfo),              // every render frame
  buildMinimap(heightField, features),   // once at battle start (canvas top-down render)
  setDamagePanel(panel),                 // wires damagePanel instance
  // --- deterministic screenshot hooks ---
  forceAimDisplay(f /* partial FrameInfo.aim, stays until next update(frame) */),
  root: HTMLElement,
}
FrameInfo = {
  timeS, mode, camera,                   // THREE camera for projections
  player: TankEntity, tanks: TankEntity[], shells: ShellEntity[],
  aim: {
    point: Vector3, distM: number,
    dispersionRadM: number,              // world-space reticle radius at aim distance
    penRatio: number|null,               // → color: ≥1.15 green #7ee87e / 0.85–1.15
                                         //   orange #f0b04a / <0.85 red #f05a5a
    gunMarker: Vector3|null,              // actual articulated-bore endpoint
    atGunLimit: boolean,
    reload: { t, totalS }, shellSlot: 0|1|2,
    shells: [{ name, type, dmg, penLabel }],   // for the 1/2/3 selector
    zoom: number,                        // sniper '×N'
  },
  killfeedHandledByBus: true,            // killfeed/damage numbers come from bus events
}
```
Elements: aim circle (centered on the authoritative gun marker, radius = dispersionRadM
projected to pixels; blooms/shrinks as the value changes), camera-axis marker plus
pen-colored gun marker, reload ring around
reticle, shell selector (keys shown 1/2/3), pen-color reticle tint, sniper scope overlay
(vignette + crosslines + ×N), enemy HP bars (project `turretTopWorld` + 2 m; hide when
behind camera or dist > 500), minimap 220 px bottom-right with terrain shading + road
lines + tank blips (green self/red enemies, view direction wedge), kill feed top-right
(from `tank:destroyed`), floating damage numbers (from `shell:hit` where
attackerId === player id), hit direction indicator (from `shell:hit` where targetId ===
player id). Damage numbers/killfeed animate on real time — for screenshots they simply
may be absent (acceptable) unless the view recipe seeds them via bus emits.

#### 3.7.2 `damagePanel.ts`
```js
export function createDamagePanel() => Panel
Panel = { root: HTMLElement, setTank(spec), update(combat: CombatState), setState(sample) }
```
Bottom-left tank silhouette built from the playable vehicle's top-down hull and
turret masks. Mechanical systems use green carriers at the exact centers of their
authoritative armor-model volumes: weapon systems are diamonds and movement
systems are broad hexagons. Crew stations use saturated-blue circular carriers at their
authoritative centers, keeping people distinct by both color and silhouette.
Damaged modules promote to yellow/red, incapacitated crew promotes to red, and
the panel also carries the HP bar plus the fire indicator.

**Marker rule (owner, 2026-09-25).** Every marker sits exactly on its hull- or
turret-space anchor projected through that layer's rotation; markers may
overlap, and the icon is painted upright in panel space (translated to the
point, never rotated with the layer). There is no screen-space separation,
tether or smoothing pass — the old solver made co-located markers wiggle
around each other as the layers turned. Receipt:
`src/ui/damagePanelMarkers.selftest.mjs` (120 rotating poses through the real
panel, transform-tracked primitives). The minimap follows the same rule:
arrows sit on their projected positions, rotate with their own hull heading,
and objective glyphs stay upright; nothing nudges them apart.

**Mask readiness and retry policy.** Solo and multiplayer covered entry await
`prepareTankMasks` before revealing the battle. It joins the shared preparation
and paints a matching active panel before reporting success. Masks that miss
their programs' 5 s link cap (a loaded machine) no longer refuse the battle
(2026-10-09, `src/ui/damagePanelEntryMasks.ts`): the reveal goes on and the
panel's retry ladder paints them; a missing panel still follows covered entry
recovery. The private clone excludes shadow-only helpers
(including the live-owner articulated batch) and renders even when its source
actor is staged/hidden. `setTank` asks `tankThumbs.getTopDownMasks` for the
real layers; an unfinished schematic stays blank, never a generic vehicle.
The subscriber is
notified on failure too (`onReady(ready, failure)`); a failed build is
negatively cached for 8 s with at most 3 builds per spec per session
(`TOP_DOWN_MASK_RETRY`), while a borrowed live visual disposed mid-build (the
battle-start race) is never cached. The panel retries after 1.5 s WITHOUT the
borrowed visual so the factory build owns its resources, then after 8 s more
(`DAMAGE_PANEL_MASK_RETRY`); the third failure warns once and beacons
`hud_mask_failed` (`stage` damagePanel, `code` the pipeline's failure code,
`reason` the spec id). Receipt: `src/ui/damagePanelMaskRetry.selftest.mjs`.

#### 3.7.3 `garage.ts`
```js
export function createGarage(opts) => Garage
// opts = { specs, bus, onSelect, onBattle, garageVariants,
//          selectedGarageVariantId, onGarageVariantSelect }
Garage = {
  show(selectedId = 'm1a2'), hide(), isOpen: boolean,
  setSelected(specId),                   // drives carousel highlight; calls onSelect
  getSelectedGarageVariant(),
  setSelectedGarageVariant(variantId),   // persisted workshop; never changes battle map
  root: HTMLElement,
}
```
Full-screen DOM: dark gradient backdrop with a **transparent center band** (the 3D
pedestal render shows through), bottom carousel of 8 tank cards (name, nation flag as
colored badge, tier, era), right-side stats card (HP, top speed, hp/t, pen/dmg of
3 shells, reload, armor highlights — from TankSpec), big orange BATTLE button top-center.
Emits `ui:battleStart` and `ui:click` on the bus. Keyboard: ←/→ select, Enter battle.

`src/game/garageVariants.ts` owns the immutable ten-location registry,
architecture key, and persistence key. `garagePresentationPose.ts` is the one
Garage composition contract: every location uses the same Verdant-style hero
heading, three-quarter camera offset, look height, and FOV. Environment identity
may change terrain, structures, materials, and atmosphere, but it may never
change tank orientation or framing.

`garageStage.ts` owns the visible hero podium and the exact restored Verdant
indoor workshop. The room shell, fixed fixtures, Verdant-only lights, and
wall-supported clutter carry one static half-turn around the turntable so the
legacy room presents from its intended end; the canonical tank, camera,
podium, shared four-bay service graph, and rear-axis field-record display do
not participate in that transform. It delegates the other nine scene packs to
`garageArchitecture.ts`. That controller demand-loads
`garageEnvironmentKit.ts`, retains at most the active and previous pack, rejects
stale switch completions, and never constructs an unselected environment after
interactive readiness. Selector intent fetches only the environment code; exact
card intent decodes and uploads that destination's textures and compiles its
production shader keys. The prior complete pack remains visible until this
bounded preparation transaction finishes, so a switch cannot reveal a white or
partially compiled world.
Invisible two-centimetre receivers beneath the opaque Verdant podium seed the
outdoor Standard/CSM, instancing, vertex-color, glass, sky, and horizon program
variants during the covered first frame, so a browser without parallel shader
compile cannot move its first link stall onto an environment click.
The outdoor packs use generated 41x37 height excerpts from their real battlefield
spawn terrain, nine or ten connected map structures distributed through six or
more perimeter sectors, full battlefield-near tree geometry in static instanced batches,
static biome ground cover, and three map-specific relief bands. Flat rail,
factory, drydock, and urban yards keep a low skyline; rolling, mesa, coastal,
and alpine destinations receive bounded silhouettes authored to their biome.
`garageApproachDetails.ts` adds one continuous
terrain-following route from the outer district to the podium—rail fan, urban
boulevard, drydock causeway, snow road, convoy track, alpine pass, monsoon
causeway, recovery trail, or foundry haul road. `exteriorDetailKit.ts` validates
every added facade fixture against its exact support before the building is
merged. Environment packs contain no tank-shaped proxy geometry.
`garageFacilityDetails.ts` emits repeated opaque crates, cylinders, beams,
sleepers, connected service frames, and workshop props as static instanced
batches. Complete vehicles and every readable teardown component instead come
from the one shared, streamed full-detail fleet workshop described below. This
keeps the environment cache small without showing silhouette-only tanks,
turrets, guns, powerpacks, or armor racks. Cinder adds three full rail
roads, platforms, canopies, and a nine-bay roundhouse. Two grounded four-post
maintenance portals remain legible in the opening composition; each includes
connected roof/floor structure and workshop equipment while the shared fleet
service bays supply the surrounding vehicles and tank parts. The
facility builders use one hero-aligned local coordinate frame and one sampled
ground datum per island. Columns, crossheads, roof sheets, crane runways,
trolleys, chains, benches, rails, pipework, winches, and braces are derived from
that frame; diagonal members are endpoint-connected rather than visually
rotated into place. Facility steel, paint, machinery, and masonry reuse the
environment pack's bounded PBR normal/albedo residency. Every outdoor Garage
certifies at least three assembled operating machines, two heavy-lift systems,
four real fleet service exhibits, and zero unsupported members.
The local white-card sky has been removed: `garageSkyPresets.ts` retargets the
shared procedural dome, cloud decks, fog, and sun to the exact source-map
atmosphere while retaining the boot PMREM so selector changes do not stall.
Detailed tree groves are immutable assets shared across the two-pack cache;
cold species preparation is split across rendered frames and their generated
foliage atlases are released only with the asset library. Repeated environment
cycling therefore does not rebuild branch geometry, leak canvas textures, or
move that cost into the atomic pack reveal. The covered Verdant boot frame also
seeds the exact alpha-tested, double-sided instanced foliage program used by
those groves, keeping its first driver link out of the first outdoor switch.
No battlefield runtime,
collision service, update loop, or full map is constructed in the Garage.

Garage approval is a reproducible contract, not a screenshot-only judgment.
`garageArchitecture.selftest.mjs` audits structure support, perimeter coverage,
platform clearance, tree rooting, and biome identity. `garageQualityRubric.ts`
then scores every location against the same strict receipt, while
`garage-variants-probe.mjs` captures the default, left, rear, and right views
plus tablet and phone layouts. Release requires every location to score at
least 90/100, no unsupported part gap above 9 cm, no ground intersection with
the hero platform, and no retained renderer-resource growth after a complete
variant cycle.

[GARAGE-ENVIRONMENTS.md](GARAGE-ENVIRONMENTS.md) is the visual companion to
this contract: it records the ten-location roster, owner-approved comparison
sheet, scene-pack boundaries, and focused verification commands.

`garageEnvironmentPresentationRuntime.ts` keeps any retained battle world
dormant and applies the fixed anchor and canonical camera pose.
`garagePhasePresentationRuntime.ts` owns the global Garage lights and the complete
GPU residency transaction: Garage-only geometry and textures leave VRAM before
battle, then restore behind the covered return frame. The Verdant fixture objects
remain in the stable light set at zero intensity outdoors, while one shadowless
hero bounce remains active. Outdoor static scenery receives but does not cast
live CSM shadows. `garageDressingAccess.ts` demand-loads one optimized modern
maintenance layer after interactive readiness. Four bays—Burlak gantry, Abrams
welding, T-90M armor service, and K2 teardown—surround every Garage and are
recomposed by the destination layout. The K2 bay owner uses an explicit static
half-turn into the Abrams's authored quadrant. The Abrams bay owner takes its
destination's placement (`getAbramsWeldingBayPlacement`): in Verdant it stands
half-turned beside the east FLAMMABLE canisters (`ABRAMS_FLAMMABLE_BAY_OFFSET`,
the owner's placement, restored 2026-10-09) with the overhead work lamp over its
floor station; in the nine outdoor packs it keeps its authored orientation beside
the Garage camera on its own terrain pad (`ABRAMS_WELDING_BAY_PLACEMENT`), since
each pack seats its signature facility at the canister spot. That owner is a
nested static display owner, so the shared optimization merges it alone and a
Garage switch can still carry it. The rolled K2 hull rests in a connected steel
rollover cradle with grounded skids, crossmembers, A-frames, a continuous spine,
and rubber contact saddles instead of disconnected timber blocks. A connected
freestanding field-record display shares that graph in every variant, remains
on the hero tank's rear axis, and rotates through at most two resident battle
textures. The single static graph is reused across all ten variants; only
Verdant reveals the additional wall-mounted clutter supported by its enclosed
shell. The quiet-window scheduler serializes fleet preparation and chunk construction, and the phase
owner detaches the complete layer during battle. The optional exhibit geometry
factory runs in `garageWorkshopGeometryWorker.ts`; its entry registers only the
four required families, transfers full high-detail buffers with worker-computed
bounds, and never blocks the Garage render loop with a synchronous fleet build.
`garageWorkshopTransfer.ts` reconstructs the hierarchy in bounded frame slices
before the quiet scheduler reveals each finished exhibit.

#### 3.7.4 Battle endings — `src/game/battleEnding.ts`, `battleEndingCamera.ts`, `killcamSelection.ts`

Owner 2026-09-25 ("for the final kill in a battle, in regular it just ends instead of
showing a final kill cam or something. handle battle ends better and consider all
modes"). Every verdict closes with a beat before the report. `battleEnding.ts` is a pure
director (Node-testable): from the mode, the verdict reason and the facts it observed on
the bus (`mode:flag_captured`, `mode:zone_captured`, `mode:goal_scored`, `mode:wave_started`,
`tank:destroyed`) it plans one of

| reason | beat |
|---|---|
| `elimination` (any result) | the final-kill replay whoever fired it (`killcam.playForResult` with `finalKill`), else an orbit of the last wreck, else a pull-back |
| `time_limit` (victory / defeat / draw) | "time's up": the HUD clock flashes and the camera pulls back over the player's tank for 2.5 s |
| `flag_limit` / `score_limit` / `goal_limit` | a 2.5 s orbit of the deciding objective — the base the last capture ran to, the zone the winner took last (or holds strongest), the goal the ball entered; the player's tank when unknown |
| `horde_overrun` | the player's last stand: the death replay, else the wreck orbit; the wave milestone reaches the report |
| `line_held` / `assault_overrun` | the overview of the line's last sector (the death replay first when the assault fell with the player); a campaign sortie gets the same beats before its debrief |
| `network_disconnect` | no beat |
| anything else | a pull-back over the player — never a bare cut; draws included |

`battleResultPresentationRuntime.ts` drives it: replay beats go through the killcam, whose
`killcamSelection.ts` policy picks the player's own fresh death first, then the last lethal
chain on any pair (an ally's shell, a bot's ram, a burn-out's lighting shell as x-ray), then
the old fallbacks — a 'final' playback kind titles the replay "FINAL BLOW — A destroyed B".
Camera beats are posed by `battleEndingCamera.ts` through `rig.setExternalPose` (eased
pull-back, blended orbits, terrain clearance) and end on any key / click. The runtime emits
`ending:begin` / `ending:done`: `shotInfo.ts` holds the report (the REPORT GATE treats a beat
like a replay), `hud.ts` flashes the clock and shows the caption, `settings.ts` yields the
Esc menu. The report's hero line names the final blow (shooter, victim, shell / ram / fire)
from `shotInfo.ts`'s resolved events (`src/ui/finalBlow.ts` — the last lethal `shell:hit`
and the last `tank:destroyed`, never recomputed), and the Horde report names the wave the
last stand fell on (`hordeWave` on the `battle:ended` payload).

The verdict does not stop the world: `matchRuleset.endingHoldS` (8 s, bounded by
`ENDING_HOLD_LIMIT_S`) is read by the solo step and the authority alike — wrecks settle,
fires burn and shells in flight land with every trigger silent
(`silenceGunsAfterVerdict`), then `simStep` / `stepPlaying` return early and the field
stands still under the report. The killcam replays freeze sim time as before; the camera
beats run over the living field.

### 3.8 fx — `src/fx/`

#### 3.8.1 `particles.ts` (fx-internal engine)
```js
export function createParticleSystem(engineCtx, { seed = 5000 } = {}) => Particles
Particles = {
  group: THREE.Group,
  update(dt),                            // advances uTime unless frozen
  setFrozen(frozen: boolean, atTimeS = null),
  emit(poolName, opts), pools: {...},    // fx-internal API — builder's choice of opts
  resetAll(),                            // kill all live particles (view switches)
}
```
InstancedBufferGeometry billboards per graphics doc §9 (no THREE.Points), pools:
smoke 2048 / fire 1024 / dust 1024 / sparks 512 / debris 256 (instanced boxes),
GPU-animated, tier-1 soft handling (spawn ≥0.5 m up, alpha-in).

#### 3.8.2 `effects.ts` (public API)
```js
export function createFx(engineCtx, heightField, { seed = 5000 } = {}) => Fx
Fx = {
  group: THREE.Group,                    // integration adds to scene
  update(dt, shells: ShellEntity[], camera),   // tracers drawn from shell entities
  bindBus(bus),                          // wires: shell:fired → muzzleFlash;
                                         // shell:hit → impact by kind; shell:expired →
                                         // dirt plume; tank:destroyed → destruction;
                                         // tank:fire → burning column on/off
  muzzleFlash(pos: Vector3, dir: Vector3, caliberMm),
  impact(kind /* HitEvent.kind */, pos: Vector3, normal: Vector3, caliberMm),
  destruction(pos: Vector3, visual: TankVisual|null),  // fireball, debris, smoke column,
                                         // calls visual.setDestroyed() at t≈0.15 s
  dust(pos: Vector3, dir: Vector3, intensity /* 0..1, from |speed| */),
  exhaust(pos: Vector3, intensity),
  setFrozen(frozen, atTimeS),
  resetSeed(seed), resetAll(),
  // --- deterministic screenshot composers ---
  composeFiringMoment({ muzzlePos, dir, caliberMm, tracerType, ageS }),  // flash + smoke
                                         // ring + tracer streak frozen at ageS
  composeExplosionMoment({ pos, ageS }), // fireball+debris+column frozen at ageS
}
```
Tracer colors/widths per shells doc §10 table. Dynamic light budget: ≤2 PointLights
(muzzle 20 ms, explosion 300 ms). Tree/prop destruction: on HitEvent kind 'terrain'
near a tree — SKIP for v1 unless cheap (props are static; do not add cross-module
coupling for it).

`src/fx/fxRuntimeAccess.ts` owns the browser lifecycle around this API. Module
preload is permitted on explicit intent, while `createFx` remains a singleton
construction gate. Module and initializer failures are independently retryable;
`src/main.ts` supplies scene, bus, and post-composite installation as ports.

Rendered vehicle state is owned by `src/game/battlePresentationRuntime.ts`.
Solo entities sample one fixed-step presentation buffer; network entities use
the BrowserBattleBridge's already interpolated and locally corrected state
directly. The same owner gates spotting residency, off-screen running-gear
detail, fixed-cadence vehicle FX, and light crushable contacts without allocating
inside its rendered-frame update.

`src/game/killcamAccess.ts` applies the same retry contract to replay code and
publishes a stable inactive presentation facade. After construction, solo
fixed-step capture is wired directly to the live killcam implementation.

`src/sim/ammunition.ts` owns the authoritative per-shell inventory used by solo,
dedicated authority, snapshots, bots, and Horde caches. `CombatState.reloadChannels`
maps conventional ammunition onto one gun cycle and each guided round onto an
independent launcher cycle. The selected channel remains projected through the
legacy `reload` field for HUD consumers; `gunReload` keeps an autoloader's feed
cycle explicit while an auxiliary launcher is selected. Network snapshots carry
both the selected cycle and background cannon cycle, and their magazine fields
carry the multi-round indicator of `sim/magazineIndicator.ts` (cannon magazine or
guided rack salvo group) rather than the raw cannon magazine.

`src/game/playerBattleActions.ts` owns live ammunition cards, shell selection,
consumable cooldowns/effects, special actions, and multiplayer command routing.
It receives combat rules and the network lane as ports, imports no renderer or
combat implementation, and is the single action-policy interface used by HUD,
fixed-step input, capture, and network entry.

`src/game/playerFrameInput.ts` owns the variable-rate device poll. It mutates
the canonical `TankInput`, publishes one stable camera-input record, retains
keyboard/touch/gamepad/cursor/RMB policy, and performs no per-frame allocation.

`src/game/playSurfaceRuntime.ts` owns the Garage play-mode surface. It keeps
the menu import and construction retryable, bypasses it for solo entry,
prioritizes an already-active room, selects mode-specific preload ports, and
hides the menu for battle without terminating the retained session.

### 3.9 audio — `src/audio/audioEngine.ts` (+ the `src/audio/` modules)
```js
export function createAudio({ context?, getMapId?, getTerrain?, initialPhase?, tier? }) => Audio
Audio = {
  resume(),            // MUST be called from a user gesture; creates the AudioContext,
                       // mixer and asset library lazily. Before resume() every method is
                       // a silent no-op (headless screenshot safety).
  bindBus(bus),        // every gameplay event → sound (table below)
  update(dt, listener /* {pos, forward, kind, ownerId, scoped} */, tanks: TankEntity[]),
                       // listener frame, vehicle rigs, wrecks, ambience, alarms, radio
  warmBattleEvents(roster?),             // decode the battle set before rollout (≤3.5 s)
  setMasterVolume(v), mute(m), playGarageSting(), loadingOn(on), ambientOn(on),
  hitConfirm(kind, damage),              // non-spatial player shot-result blip
}
```
`src/audio/lazyAudio.ts` keeps the engine out of the boot bundle and plays a
synthesized loading tone until it arrives.

**Modules.** `audioMath.ts` (distance law, ISO 9613 air absorption, speed of
sound and Doppler per atmosphere — Earth 343 m/s, Mars 240 m/s and −14 dB,
vacuum on the Moon — listener frame and pan); `mixer.ts` (bus graph,
snapshots, HDR window, concussion, procedural reverb IRs); `assetLibrary.ts`
(manifest-driven fetch/decode, WebM/Opus probe, LRU byte budget, a separate
voice-pack lane); `voicePool.ts` (one-shots and loops: instance caps,
cooldowns, priority stealing, propagation delay, terrain occlusion, sfx log);
`vehicleAudioProfiles.ts` + `vehicleAudioModel.ts` + `vehicleRig.ts`
(powertrain identity per spec, RPM/load/virtual gearbox model, and the
per-vehicle layer rig); `weaponAudio.ts` (report class by bore and sound
profile, reload choreography by loader); `soundCues.ts` (per-asset bus,
space, level, pitch jitter, caps); `environmentScenes.ts` +
`ambienceDirector.ts` (per-map beds, layers, positioned spot sounds, gun
tails, reverb; the garage is an indoor scene whose room tone and workshop
sounds come from a few metres away); `voiceLines.ts` + `crewRadio.ts` (crew
radio); `mixPolicy.ts` (every level, snapshot, HDR, budget and LOD
constant). Nothing is synthesized or stood in for: every sound is a recorded
asset, one still decoding is silent, and no cue or crew covers for another
(`voiceTriggers.selftest.mjs` fails on a sound chained in for another).

**Assets.** 398 sound assets (649 variant files, 18.6 MB WebM/Opus) under
`public/audio/sfx/<group>/`, described by `sfxManifest.generated.ts`
(duration, channels, rate, loop points, size). Crew radio: 13 language packs
× 109 lines (one to four takes each, mostly two; ~1.6 MB per pack) under
`public/audio/voice/<lang>/`, described by `voiceManifest.generated.ts`. Both
are generated offline with ElevenLabs (sound generation `eleven_text_to_sound_v2`;
speech `eleven_v4` with Voice Library voices), verified (speech-to-text
round trip for every voice take), mastered and selected by `tools/audio/`
(see docs/ATTRIBUTION.md). Loops are wrap-padded with exact loop points so
they never click. Browsers without WebM/Opus decode (Safari < 17.4) fall back
to the procedural synthesis.

**Mix graph.** `weapons, impacts, environment, vehicles → world sum →
snapshot lowpass/level → voice duck`; `own (the occupied hull's engine and
mechanisms) and ownCombat (its gun, interior report and hits on it) →
snapshot lowpass/level`; `interior`, `cinematic`, `ambience (ducked under
radio)`; `ui, music, voice, alarm → pre-master`; then `glue compressor (12 ms
attack, lets transients through) → look-ahead limiter (takes a crack's peak)
→ tanh soft clip → master`. Gunfire leads:
weapons, impacts and ownCombat run at full level with a low shelf for
weight, and the constant layers (engines, ambience, radio, interface) sit
under them. Settings channels (`cot.settings.v1`, live via 'ui:volumes':
master, engine, combat, ambience, ui, voice, alarmHeartbeat, crewVoice,
concussion) scale the buses; the occupied gun answers to the gunfire channel.
Snapshots: battle, scoped (the occupied gun and engine move to the
interior/headset spectrum, world sound dulls), paused, killcam (live world
ducked, cinematic bus up), spectating, garage; pause and kill-cam end with
the battle. A DICE-style HDR window: the loudest recent event sets the window
top; a new voice more than 18 dB below it is trimmed by half the excess (at
most 12 dB) and one 50 dB below is not started, so a 152 mm report masks
rifle fire while playing in full itself. A close blast on the occupied hull
triggers a concussion (muffle and recovery, optional tinnitus; settings
toggle). Every gun report carries a procedural muzzle blast (a Friedlander
pressure pulse scaled to the bore) within its close range; HE bursts, vehicle
explosions and penetrations of the occupied hull carry a synthesized sub-bass
thump under the samples.
Hits have no interface marker: the impact at the target (close banks
crossfading into distant armour-hit banks by range), the target's
destruction and the gunner's call confirm them, and the listener's own
rounds are heard landing under a gentler law (`OWN_HIT_FOCUS`: three times
the reference distance, rolloff at most 0.55, never culled).

**Spatial model.** Distance is measured from the occupied/spectated tank in
live play (camera pullback must not change range) and from the camera in
cinematic and garage views; azimuth follows the camera (screen-right is
`forward × up`). Distance law with excess attenuation per cue: gunfire,
impacts and explosions use a compressed game-mix curve (a cannon at 400 m is
12 dB down, not 33) so a battle stays audible across the map, while
small clutter (props, other hulls' brakes and gears, bullet impacts) is
local and short-ranged. ISO 9613 air absorption lowpass, speed-of-sound
delay beyond 18 m, Doppler on passing sources, terrain occlusion from seven
height samples along the path.

**Vehicles.** Eight engine families (`turbine_agt`, `turbine_gtd`,
`diesel_v12_soviet`, `diesel_two_stroke`, `diesel_v12_modern`,
`diesel_aircooled`, `diesel_ifv`, `gasoline_v12`) resolved per spec, with
turbo whistle, turbine auxiliaries and hybrid-electric drive as identity
modifiers. The model derives RPM, load and gear (manual, automatic or turbine
spool) from speed, throttle and slope, plus track speed with yaw scrub, brake
and skid, landings, bumps, stalls and restarts. Each rig crossfades
idle/low/mid/high engine bands, light/heavy track sets per surface (earth,
hard, mud, sand, snow; water runs the mud set under a wading loop) at
slow/fast speed, squeal, skid, wading and
damaged-engine knock loops, and fires shift, brake, suspension and stall
one-shots. The occupied hull adds turret-drive and elevation servo loops,
interior hum and rattle; remote rigs use LOD (own / near ≤140–165 m / far
≤900–1000 m, desktop 5 near + 8 far, mobile 3 + 4).

**Weapons.** Eighteen report classes (rifle and heavy MG; 20–50 mm
autocannon; 90–152 mm cannon; ATGM; heavy rocket; the AC-130's autocannon,
howitzer and missiles) with close and distant banks crossfaded by range,
per-map gun tails (open, forest, urban, mountain; once per beat for a
machine-gun burst), the interior report when scoped, twin-weapon stagger,
autocannon feed, supersonic flyby and near-miss crack, missile warning. The
close reports are cracks chosen by transient anatomy and mastered on their
true peak. Reloads play the loader's choreography (manual, carousel, bustle,
autocannon, missile, the gunship's hand-loaded howitzer, magazine,
intra-clip) timed to `player:reload` progress.

**Event table.** shell:fired / weapon:predicted / auxiliary:fired →
reports; shell:hit → impact by kind and calibre (pen, ricochet, nonpen,
spaced, ERA cassettes, HE) with interior response, concussion and crew
calls; shell:expired → ground, water or prop impact by surface; tank:destroyed →
blast, debris, turret, cook-off and wreck fire loops, kill confirm;
tank:impact / tank:ram / prop:crushed / prop:destroyed → collision and prop
assets; tank:fire, module:state, tank:spotted, player:spotted → loops and
crew calls; consumables, shell selection, magazine reloads, dry fire,
auto-aim lock, armor overlay, minimap zoom, spectate, jump, self-right,
smoke screens, artillery/flak/AA/flyover atmosphere, killcam:begin / done /
impact / shot / collision (the replay's debris stretches to its 0.55×
rate), ui:pause, battle phase edges and results (each game mode opens on its
own sound, read through a `getGameMode` getter), and sixteen match-mode
events (zones, flags, waves, goals, respawns, pickups and cache drops,
Infected conversions, Gun Game weapon changeovers).

**Aircraft.** `aerialRig.ts` plays the Drone and AC-130 aircraft: a moving
loop with distance law, air absorption, pan and Doppler, or the pilot's or
crew's own perspective. FPV drones fly as shells, so the listener runtime
passes the live shell list to the audio update; an enemy drone buzzes where it
flies; while ours flies the listener rides it (`player-drone`), its motors
lead and our tank is heard from outside until it strikes or is recalled. A
gunship is a roster tank pinned to its orbit: it never gets a tank rig; the
ground hears its turboprops and guns from the sky, and its crew the cabin and
the guns firing inside it.

**Crew radio.** National crews: a hull speaks its nation's language
(en-US, en-GB, de, ru, uk, zh, fr, sv, ja, ko, it, pl, he; commander and crew
voices per nation: serious, mature voices reading a terse procedure script
in a controlled delivery, never cheering or panicked). Settings → Sound →
Crew voices uses the shared flag dropdown to choose National crews (default)
or any one nation's pack for every tank. The persisted choice and legacy
migration live in `audio/crewVoice.ts`, shared by input and the lazy engine;
live changes, new battles and same-entity nation changes all use that resolver.
Changing language stops old speech and clears pending calls; cold packs wait
for decoding, and a crew never speaks another nation's take (every pack
carries every line).
Radio discipline: priority 0–4 with
interrupts (survival cuts anything below it, decisive events cut situational
calls, reports cut flavour), per-line and per-group cooldowns, stale
drops, a 0.8 s gap between calls, a two-line queue, probability gates on
flavour only (firing, reload done, allies' kills, near misses, autocannon
results) and at most one spot call per five seconds unless several contacts
appear at once. Every main-gun result, misses included ("short" by the line's
second take when the round fell before the enemy it was laid on), is called
half a second after the round lands, and the crew confirms the tank's own
systems (smoke, roof gun, suspension, drone launch and loss, the gunship's
weapons and supply drops) and a held point under attack. A network battle
feeds the same handlers (the presentation maps spots, autoflips and the
viewer's reload to solo's events). Every line goes through an intercom
chain (a 24 dB/oct 320 Hz–3.4 kHz band, a 1.9 kHz presence peak,
compression, drive, a headset speaker roll-off, a static bed and squelch); a
damaged radio module narrows the band and adds drive, dropouts and
interference.

**Budgets.** Desktop 32 voices with reverb; mobile 16 voices, no convolution
reverb, assets decoded at 24 kHz with one variant each. The battle set (about
120–140 MB decoded on desktop, 65–80 MB on mobile) is pinned for the whole
battle, as are live loops, so a rare sound never meets an evicted buffer;
200 MB (desktop) and 96 MB (mobile) cap the unpinned extras, and crew packs
count apart.

**Debug.** `window.__COT_AUDIO` (after resume) exposes the context, master
PCM tap, listener and engine state, snapshot, library stats, the sound-route
log, the sfx log (asset, start, gain, rate, distance, bus) and the voice log,
plus `play`, `preload`, `sayVoice`, `setEngineProbeSolo` and
`forceCrewLanguage` for the probes.

Focused verification: `node src/audio/audioEngine.selftest.mjs` and the other
`src/audio/*.selftest.mjs` run the engine headless against the shipped
manifests (in `npm test`). Browser gates:
`node tools/audio-probe.mjs` records the full event/voice/bus matrix;
`node tools/sfx-smoke.mjs` checks every scene's assets, the calibre ladder,
the distance crossfade and propagation delay, jitter and volley headroom;
`node tools/voice-smoke.mjs` checks the national crew, live language
switching and all 13 packs through the radio chain;
`node tools/audio-spatial-killcam-probe.mjs` covers arcade/sniper
perspective, cannon and engine distance falloff, rams and the kill-cam
replay; `node tools/pause-probe.mjs` covers the pause duck.

---

## 4. Update-loop call order (integration will implement EXACTLY this)

Startup order:
```
createRenderer → createSky (sunDir) → bakeEnvironment → createLighting(CSM FIRST,
before any material compiles) → EngineCtx → createMap → spawn TankEntities
(createTankState + createCombatState + createTank visual; player = 'm1a2' at
spawnPoints.player; 7 enemies = the other 7 specs at enemies[0..6]) → createFx →
createParticleSystem → initHud + createDamagePanel + createGarage → createAudio →
createCameraRig → sky.applyFog → renderer.compile / compileAsync → render 2 warm
composer frames → window.__GAME_READY = true
```

Per animation frame (`dtR` = render delta, clamped ≤ 0.1):
```
1. poll input → TankInput (player) + camInput
2. fixed-step loop (accumulate dtR, step SIM_DT, max 4 steps):
   a. for each enemy: ai.update(SIM_DT, timeS)
   b. for each alive tank: movement.updateTank(entity, heightField, SIM_DT, collide)
   c. reload timers; if input.fire && reload ready:
        ballistics.createShell (+applyDispersion) → movement.fireRecoil →
        rig.addTrauma(0.25) → bus 'shell:fired' → startReload
   d. for each shell: stepShell → World.raycast(prevPos→pos) for terrain/props →
        broadphase tank spheres → armor.traceTank → damage.resolveShellHit /
        resolveHeBurst → bus 'shell:hit' (+ module:state / tank:fire /
        tank:destroyed as flagged) → ai.notifyShellResult
   e. every 0.5 s: damage.tickFire per burning tank
3. rig.update(dtR, camInput)                    // also writes player aimPoint
4. world.update(dtR, camera.position)
5. for each tank: visual.syncFromState(state);  dust/exhaust emits from speed
6. fx.update(dtR, shells, camera)
7. aim = { point: rig.aimPoint, distM, dispersionRadM: movement.computeDispersionRadM,
           penRatio: damage.estimatePenRatio(armor.queryAimArmor(...)), ... }
   hud.update(frame); damagePanel.update(player.combat)
8. audio.update(dtR, {pos: camera.position, forward}, tanks)
9. lighting.update()                            // csm.update, AFTER camera is final
10. post.render(dtR)                            // the only render call
```
Camera shake (rig-internal) applies after step 3's solve, before step 9.

---

## 5. Screenshot contract — who provides what

`src/main.ts` (integration) implements `window.__SHOTS` using ONLY the hooks below.
Every `set(name)`: `fx.resetAll()`, `fx.setFrozen(true, VIEW_TIME[name])`,
`world.setWindTime(VIEW_TIME[name])`, garage hidden unless noted, hud mode per table,
zero tank inputs, then camera placement, `camera.updateProjectionMatrix()`,
`lighting.updateFrustums()`, `lighting.update()`. Audio never resumed by the harness.

| view | camera | scene state | hooks used (provider) |
|---|---|---|---|
| `battlefield` | `rig.setExternalPose` — elevated ~35 m above SW village edge looking NE across map | all 8 tanks at spawns, hud hidden | engine, world, vehicles |
| `player_view` | `rig.snapArcade(step=2, yaw=player.yaw, pitch=-12°)` | hud `setMode('battle')` + `forceAimDisplay({distM:240, penRatio:1.3, reload:{t:0,totalS:6}, shellSlot:0})` | engine, hud, world, vehicles |
| `sniper_view` | `rig.snapSniper(zoom=8, aim at nearest enemy bearing)` | hud `setMode('sniper')` + forceAimDisplay penRatio 0.95 (orange) | engine, hud |
| `tank_closeup_modern` | `rig.setExternalPose` orbit: dist 9 m, azimuth 35°, elev 12° around the m1a2 entity | hud hidden | vehicles, engine |
| `tank_closeup_ww2` | same recipe around the kv2 entity | hud hidden | vehicles, engine |
| `combat_firing` | `setExternalPose` 3/4 front-side of player, 12 m | `fx.composeFiringMoment({muzzlePos: player.visual.gunMuzzleWorld(), dir, caliberMm:120, tracerType:'APFSDS', ageS:0.05})`; hud hidden | fx, vehicles, engine |
| `explosion` | `setExternalPose` 25 m from enemy[2] | `fx.composeExplosionMoment({pos, ageS:0.4})` + `enemy[2].visual.setDestroyed()` | fx, vehicles, engine |
| `garage` | `garagePresentationPose.ts` applies one immutable Verdant-style front three-quarter pose (glacis toward the viewer, bow/gun screen-left) at the isolated **(-1500, 0, -1500)** Garage stage; the tank rear points toward the shared field-record display and all ten bounded scene packs change only environment identity | `garage.show('m1a2')` | hud (garage), vehicles, engine |

`window.__SHOTS.views` lists exactly these 8 (more may be appended). `__GAME_READY`
only after the §4 startup sequence completes. Determinism: everything seeded (§1.4),
`setFrozen` + `setWindTime` + `setExternalPose` fully pin the frame.

---

## 6. Builder acceptance checklist (every module)

1. No top-level side effects; importable under `node --input-type=module -e "import('...')"`
   without a browser (scene modules may throw only when their `create*` is CALLED
   without a real renderer — never at import).
2. All exported names/signatures exactly as §3. Extra internal exports allowed only if
   prefixed `_`.
3. All randomness seeded, all time injected (§1.4). No console output besides a single
   optional `console.info` line at init.
4. Pure-logic modules: include lightweight inline assertions of your own; combat MUST
   ship `combat.selftest.mjs` passing under `node` (§3.5.4).
5. JSDoc `@param`/`@returns` on every exported function (types per this doc).
6. Do not modify: `package.json`, `index.html`, `tools/screenshot.mjs`,
   `docs/*`, `src/main.ts`, or any file outside your module's directory list.
