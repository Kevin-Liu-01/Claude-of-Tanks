# ARCHITECTURE.md — original implementation contract

> Historical document. This was the locked nine-module plan used during the
> original parallel implementation. It is retained as build provenance, but it
> is not the current runtime architecture. Use [SYSTEMS.md](SYSTEMS.md) for
> current ownership and data flow, [MULTIPLAYER-ARCHITECTURE.md](MULTIPLAYER-ARCHITECTURE.md)
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
| audio    | `src/audio/audio.ts` |
| integration | `src/main.ts`, `src/game/state.ts` |

Research docs each builder MUST read: `docs/research/graphics-aaa.md` (engine, world,
fx), `docs/research/movement-physics.md` (engine cameraRig, movement, vehicles specs),
`docs/research/armor-penetration.md` + `docs/research/shells-ballistics.md` (combat,
vehicles specs, ai), `docs/research/tank-roster.md` (vehicles, hud garage),
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
  shellSlot: 0|1|2,
}
```
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
| m4a3e8   | 720  | 36 | 24 | 0.36 | 2.0 | 1.0/1.2/2.2 | pivot   | 4.6 |
| tiger1   | 1000 | 22 | 14 | 0.34 | 2.4 | 1.1/1.3/2.3 | neutral | 6.5 |
| t34_85   | 750  | 40 | 26 | 0.42 | 2.3 | 0.9/1.1/2.0 | pivot   | 7.0 |
| is2      | 1200 | 20 | 16 | 0.46 | 3.2 | 1.2/1.4/2.5 | pivot   | 13.5 |
| panther_g| 900  | 30 | 18 | 0.32 | 2.1 | 1.0/1.2/2.2 | pivot   | 5.5 |
| m1a2     | 2600 | 44 | 40 | 0.30 | 1.8 | 0.7/0.8/1.5 | neutral | 6.0 |
| t90m     | 2000 | 42 | 38 | 0.35 | 2.2 | 0.7/0.8/1.5 | neutral | 7.5 |
| leo2a7   | 2500 | 44 | 40 | 0.28 | 1.6 | 0.7/0.8/1.5 | neutral | 6.0 |

`gunPitchDegS = 0.8 × turretTraverseDegS` (round to int). Bloom: WWII
`{move:0.20, hullRot:0.20, turret:0.12, afterShot:4}`, modern (stabilized)
`{move:0.06, hullRot:0.08, turret:0.06, afterShot:3}`. Elevation/depression, weights,
engine hp, speeds, shell pens/dmg: from the roster tables verbatim. Shell velocities
(m/s, locked): m4a3e8 792/1036/800; tiger1 773/930/770; t34_85 792/1030/790;
is2 795/800/770 (slot1 = BR-471B AP); panther_g 935/1120/700; m1a2 1670/1400/1000;
t90m 1750/905/850; leo2a7 1750/1400/1000. (slots: standard/special/HE.)

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
teammate separation, stuck recovery and firing-lane relocation.

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
Dense markers resolve together only after hull/turret projection and stay
within a short leader-line tether to the source point. Damaged modules promote to
yellow/red, incapacitated crew promotes to red, and the panel also carries the HP
bar plus the fire indicator.

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
maintenance layer after interactive readiness. Four diagonally opposed bays—
Burlak gantry, Abrams welding, T-90M armor service, and K2 teardown—surround
every Garage and are recomposed by the destination layout. The Abrams and K2
bay owners use an explicit static half-turn to exchange opposite quadrants as
complete assemblies, keeping the Verdant overhead work lamp attached to the
Abrams repair choreography. The rolled K2 hull rests in a connected steel
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
both the selected cycle and background cannon cycle.

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

### 3.9 audio — `src/audio/audio.ts` (+ `src/audio/voices.ts`)
```js
export function createAudio() => Audio
Audio = {
  resume(),            // MUST be called from a user gesture; creates AudioContext lazily.
                       // Before resume(): every method is a silent no-op (no errors,
                       // no context creation — headless screenshot safety). resume()
                       // also lazily fetch+decodes the crew radio lines (tolerant:
                       // a missing file mutes that line only).
  bindBus(bus),        // shell:fired → gunshot by caliber class (≤76 crack / ≤105 boom /
                       // ≤130 heavy / >130 siege; pre-rendered PCM bed + per-shot ±6%
                       // pitch jitter; player shots add breech clank + brass tinkle) +
                       // 'Firing!' radio (prob-gated); shell:hit → clang w/ interior
                       // echo+spall (pen) / 3-variant metallic zing (ricochet) / blunt
                       // shatter (nonpen) / explosion (he_*) + crew reactions
                       // ("We're hit!", "They bounced us!", "Ricochet!");
                       // shell:expired(hitTerrain) → dirt splash; tank:destroyed → big
                       // explosion + debris, kill sting + "Target destroyed" on player
                       // kills; tank:impact / tank:ram / prop:crushed → spatial hull,
                       // plate, gear, and foliage collision layers; module:state →
                       // track snap (world), ammo-rack beep +
                       // damage/repair radio calls (player); tank:fire → burning loop +
                       // fire klaxon + "Fire! Put it out!" (player); tank:spotted →
                       // "Enemy spotted"; player:reload(done) → breech latch +
                       // "Reloaded"; phase:change → battle horn / garage room tone;
                       // battle:ended → victory/defeat/draw fanfare; killcam:begin/done
                       // → duck live combat/engine/ambience ×0.35; killcam:impact →
                       // dedicated cinematic blast with slowed debris/turret-pop
                       // playback matching the replay time scale; ui:click → click;
                       // ui:volumes → live 5-channel mix {master, engine, combat,
                       // ambience, ui, voice, alarmHeartbeat}
  update(dt, listener /* {pos, forward, kind, ownerId, scoped} */, tanks: TankEntity[]),
                       // engine loops: occupied tank plus nearest audible tanks
                       // (10-voice cap, 900 m enter / 1000 m exit hysteresis),
                       // profile-driven pulse+intake loop, RPM pitch =
                       //   0.8 + 0.6×max(speed/load spool), with turbine,
                       //   modern/legacy diesel, and light-diesel families;
                       //   broad low-mid tread/link texture above 1.5 m/s;
                       //   shell whizz for player-passing shells (dist<15 m, speed>300);
                       //   player turret-traverse whir + gun-elevation servo (from
                       //   state.turretYawRate / gunPitch delta); suspension landing
                       //   thumps (listener-side vy tracking); critical-HP heartbeat
                       //   pulse windows (optional, settings.alarmHeartbeat); radio
                       //   queue drain
  setMasterVolume(v /* 0..1 */), mute(m: boolean),
  playGarageSting(), ambientOn(on),      // wind + sparse birds, seeded noise
  hitConfirm(kind, damage),              // non-spatial player shot-result blip
}
```
Bus graph: `{combat, cinematic combat} → broad body/presence EQ`,
`engine → presence/ceiling EQ`, `voice → presence EQ`, then all channels
`→ 3:1 transient-preserving compressor → high-knee soft limiter → master`.
Channel gains follow the settings SOUND tab (`cot.settings.v1`, live via
'ui:volumes'); crew radio + alarms sit on the voice bus. Distance model:
gain = `clamp(22/dist, 0, 1)`^1.5, equal-power stereo pan from listener-relative
azimuth, air-absorption lowpass + speed-of-sound delay for far events. Engines
have no close-range hard cutoff: the occupied tank is always retained and up
to the nine nearest remote engines remain eligible to 900 m (1000 m exit hysteresis),
with distance steadily lowering and darkening them. During live play distance
is measured from the occupied/spectated tank while azimuth follows the camera;
cinematic/garage distance follows the camera. This hybrid listener prevents
third-person camera pullback from muting nearby vehicles. Scoped view is an
interior/headset perspective, not a mute: the occupied engine and cannon retain
level while their exposed high-frequency energy and stereo width are reduced.
Max ~24 simultaneous one-shot voices; steal oldest. Cannon fire, armor impacts,
HE/terrain bursts, ERA, and vehicle destruction use 29 deterministic procedural
assets baked by `tools/make-sfx.mjs` under `public/audio/sfx/`, with equivalent
live synthesis fallbacks until the complete set decodes. Engines, traverse,
ambience, UI, alarms, and fanfares remain live Web Audio synthesis. Crew radio
uses locally synthesized/processed Opus under `public/audio/voice/`
(`tools/make-voices.mjs`, docs/ATTRIBUTION.md).
Radio discipline lives in `src/audio/voices.ts`: one line at a time, priority
ladder (survival calls interrupt flavor), per-line cooldowns, ±3% rate jitter.
Leaving battle stops all engine, burning, traverse, landing, and alarm loops so
no world sound can leak into the garage. Debug: `window.__COT_AUDIO` (after
resume) exposes the context, master PCM tap, listener/engine state, canonical
sound-route log, baked-SFX log, and voice log for the audio probes.

Focused verification: `node tools/audio-spatial-killcam-probe.mjs` captures
the occupied cannon and engine in arcade/sniper views; measures remote cannon
reports at 12/80/250/600/900 m and engines at 40/160/420/850 m; exercises ram
audio; then drives a real lethal shell through replay and asserts listener
ownership, PCM audibility, monotonic distance falloff/filtering, mix ducking,
headroom, 0.55x cinematic debris, and garage loop cleanup.
`node tools/audio-probe.mjs` records the full event/voice/bus matrix and asserts
every canonical combat event entered its intended audio route.
`node tools/sfx-smoke.mjs` retains the baked-layer and volley/no-clipping gate;
`node tools/make-sfx.mjs --verify` additionally rejects sub-only or tin-can
assets through bass, body, harsh-presence, and air energy bounds. Relative
family gates enforce increasing cannon pressure/decay by caliber and distinct
spectral/envelope signatures for penetration, ricochet, non-penetration, HE,
dirt, ERA, burn-out, and full vehicle destruction.
`node tools/make-voices.mjs --verify` enforces voice duration, loudness, peak,
and payload budgets.

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
| `tank_closeup_ww2` | same recipe around the tiger1 entity | hud hidden | vehicles, engine |
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
