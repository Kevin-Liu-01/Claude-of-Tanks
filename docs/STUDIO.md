# SCENE STUDIO — cinematic staging, storyboards & scripted-shot API

The studio is a first-class game mode for composing shots: the chosen battle
map fully live (terrain, vegetation, props, sky, lighting, post) with **no
battle sim** — no AI, no spotting, no HUD combat chrome — plus placeable tank
actors with full pose/damage-state control, the game's real effects language,
a free camera, camera rails, tank motion tracks, a 20-second storyboard, live
preview, browser video recording, and a hi-res still-capture path.

Code: `src/game/studio.js` (runtime + `window.__STUDIO`),
`src/game/studioTimeline.js` (pure storyboard normalization and sampling),
`src/ui/studioPanel.js` (panel UI). main.js integration is one import, one
`createStudio(ctx)` call and one `tick()` branch.

## Entering / leaving

| Path | How |
|---|---|
| URL | `/studio?map=desert` or legacy `?studio=1&map=desert` — boots directly into Studio |
| Garage | **F8** (toggle; also the panel's EXIT button) |
| Script | `window.__STUDIO.enter({ map })` / `window.__STUDIO.exit()` |
| Leave | F8 / Esc / EXIT → back to the garage |

Battle-pool tank visuals are hidden while the studio is active; exit restores
them and hands control back through the normal garage entry (camo overrides
cleared, pedestal key restored).

Direct navigation is one covered load. The inline boot screen remains visible
while the battlefield and Studio-only FX resources build in parallel; it does
not reveal the garage or run the full battle-roster/wreck/shadow warm first.
Runtime entry from the garage and map changes use the shared transition screen
with real world-build progress. `window.__STUDIO_LOAD`, `__STUDIO_WARM`, and
`__WORLD_LOAD` expose the most recent stage timings for diagnostics.

Note for headless drivers: the boot "press any key" gate auto-dismisses under
webdriver (and `?nogate`), exactly like the screenshot harness.

## Interactive controls

- **LMB-drag** on the world: look around (no pointer lock needed — embed-safe)
- **WASD** fly, **Q/E** down/up, **Shift** 4× speed, **wheel** dolly
  (orbit mode: wheel = distance)
- **Click terrain**: move the effect marker (amber ring)
- **Click a tank**: select · **drag a tank**: move it (terrain re-conform live)
- **Space**: play/pause the storyboard · **Delete**: remove the selected effect
  (or selected actor when no effect layer is selected)
- Panel: one scrollable workspace, organized into **Battlefield** (a visual
  16-map preview picker), **Tanks** (roster plus selected-tank pose/camo/state),
  **Effects**, **Cinematics** (storyboard, rail, tank keys, timeline, camera),
  and **Output** (video, stills, scene save/load). Add camera shots at the
  playhead, key the selected tank after posing it, then scrub or play. The
  **Direct 12 s Duel** button turns the first two staged tanks into an
  immediately recordable moving battle. Map-card images load only when the picker opens;
  Scene JSON can be downloaded, uploaded, copied, or stored in three local
  slots (shift-click saves).

## `window.__STUDIO` (scripted-shoot contract)

```js
await __STUDIO.load(sceneJson)      // deterministic build → returns state()
__STUDIO.capture(opts)              // {dataURL, width, height} hi-res PNG
await __STUDIO.recordVideo(opts)    // plays once → {blob, size, mimeType, durationMs}
__STUDIO.listActors()               // [{index, uid, name, id, pos, facingDeg, …, state}]
__STUDIO.state()                    // round-trippable scene JSON (see schema)
```

Extras (same machinery the panel uses):

```js
__STUDIO.enter({map}) / .exit() / .setMap(mapId)      // async
__STUDIO.addActor(cfg) / .updateActor(ref, patch) / .removeActor(ref)
__STUDIO.setActorState(ref, state, ageS?) / .selectActor(ref) / .clearActors()
__STUDIO.effect({type, actor|at, params})             // fire one effect NOW
__STUDIO.listEffects()                               // authored FX layers + stable ids
__STUDIO.selectEffect(id) / .removeEffect(id)        // select/delete one layer
__STUDIO.updateEffect(id, {tMs})                     // retime a layer
__STUDIO.clearEffects()                               // reset fx timeline (keeps actors)
__STUDIO.advanceFx(ms) / .seek(ms)                    // scrub/step the timeline
__STUDIO.setTimeScale(v) / .timeScale / .fxTimeMs
__STUDIO.play() / .pause() / .stop()
__STUDIO.getStoryboard() / .setStoryboard(board) / .setStoryboardDuration(ms)
__STUDIO.addCameraShot(cfg?) / .updateCameraShot(id, patch) / .removeCameraShot(id)
__STUDIO.keyActor(ref, cfg?) / .clearActorTrack(ref)
__STUDIO.setRailVisible(on) / .directDuel()
__STUDIO.recordVideo(opts) / .stopRecording() / .recordingStatus()
__STUDIO.setCamera(cfg) / .getCamera()
__STUDIO.TANK_IDS / .MAP_IDS / .ACTOR_STATES / .EFFECT_TYPES / .CAMO_PATTERN_IDS
__STUDIO.getMapInfo(id)             // {id, name, sub}
__STUDIO.getSpecInfo(id)            // {name, gunElevationDeg, gunDepressionDeg, shells}
__STUDIO.performance()              // rendered/skipped frame + pool-sweep counters
__STUDIO.active / .mapId
```

Actor `ref` = `uid` (`"a1"`), `name`, roster index, or the actor object.
Effect `ref` = stable effect `id` (`"fx1"`), stack index, or the returned
effect object.

### capture(opts)

`{ width?, height?, scale?, download?, name?, type?, quality? }` → renders the
current frame once at the requested resolution (renderer + full post chain
temporarily resized at pixelRatio 1, all shadow cascades forced, `dt = 0`) and
returns `{ dataURL, width, height }`. Default width =
`max(2560, 2 × viewport)` at the live aspect; height defaults to the aspect.
Clamped to the GPU max texture size (≤ 6144). `download: true` also saves the
PNG from the browser. Headless drivers read `dataURL` and write the file
themselves (see `tools/studio-selftest.mjs`).

### recordVideo(opts)

`{ fps?, videoBitsPerSecond?, mimeType?, download?, name? }` records the live
postprocessed renderer canvas while the storyboard plays once from zero to its
bounded duration. Defaults: 60 fps, 12 Mbps, best supported WebM codec,
`download: true`. The storyboard schema clamps every production to 1–20
seconds. The result is `{ blob, size, mimeType, durationMs }`. Recording hides
the camera rail and pauses on the final frame. The video contains the rendered
picture only; Studio does not currently mix game audio into the capture stream.

## Scene JSON schema

```jsonc
{
  "map": "desert",              // verdant | desert | winter | urban (default verdant)
  "seed": 5000,                 // fx rng seed (default 5000)

  "actors": [
    {
      "id": "t90m",             // any TANK_SPECS id (see __STUDIO.TANK_IDS)
      "name": "hero",           // optional label; usable as an effect target ref
      "pos": [12, -40],         // [x, z] world meters — y is solved from terrain
      "facingDeg": 120,         // hull heading (0 = +Z, increases toward +X)
      "turretDeg": -35,         // turret yaw relative to hull
      "gunDeg": 8,              // gun elevation, + up — clamped to the spec's
                                //   gunElevationDeg / gunDepressionDeg
      "camo": "desert",         // auto|factory|summer|desert|winter|digital
                                //   (omit = the garage-picked scheme)
      "camoSeed": 4207,         // paint bake seed
      "state": "intact",        // intact | engine-smoking | burning | wrecked
                                //   | wrecked-burnt | turret-popped
      "stateAgeS": 60,          // optional wreck age (char sweep / settle)
      "recoilAgeS": 0.05,       // optional: freeze the recuperator at this stroke age
      "smoking": true,          // optional additive layers over any mesh state
      "burning": true           //   (engine-deck smoke / keyed fire column)
    }
  ],

  "effects": [                  // selectable layers fired on the fx timeline
    { "id": "fx1", "type": "fire", "actor": "hero", "tMs": 0,
      "params": { "slot": 0, "tracer": true, "recoil": true } },
    { "type": "tank_kill", "actor": 1, "tMs": 100,
      "params": { "cause": "ammorack", "pop": true } },
    { "type": "explosion", "at": [10, -20], "tMs": 0,
      "params": { "size": "large" } },
    { "type": "dust",      "actor": 2, "tMs": 0,
      "params": { "count": 12, "intensity": 1, "dirDeg": 90 } }
  ],

  "storyboard": {
    "version": 1,
    "durationMs": 12000,       // clamped to 1000–20000
    "shots": [                 // camera positions are absolute world meters
      { "id": "shot-1", "label": "Establishing", "tMs": 0,
        "pos": [24, 8, -52], "lookAt": [12, 2, -40],
        "fov": 45, "rollDeg": 0, "transition": "smooth" },
      { "id": "shot-2", "label": "Impact", "tMs": 8000,
        "pos": [8, 4, -18], "lookAt": [16, 2, -4],
        "fov": 34, "rollDeg": 0, "transition": "cut" }
    ],
    "actorTracks": [
      { "actor": "hero", "keys": [
        { "id": "key-1", "tMs": 0, "pos": [12, -40],
          "facingDeg": 120, "turretDeg": -35, "gunDeg": 8,
          "transition": "smooth" },
        { "id": "key-2", "tMs": 6000, "pos": [18, -32],
          "facingDeg": 120, "turretDeg": -20, "gunDeg": 4,
          "transition": "smooth" }
      ] }
    ]
  },

  "camera": {
    "pos": [24, 6, -52],
    "lookAt": [12, 2, -40],     // OR "yawDeg"/"pitchDeg" (lookAt wins if both)
    "groundRel": true,          // y values are heights ABOVE the terrain at
                                //   their x/z (recommended for scripts —
                                //   absolute y is a footgun on dunes/hills)
    "fov": 45,
    "rollDeg": 0,
    "mode": "fly"               // fly | orbit (orbit needs lookAt)
  },

  "fxTime": 600,                // ms: advance the fx timeline exactly this far
                                //   after firing the effects, then FREEZE
  "timeScale": 0                // post-load time scale (default 0 = stay frozen)
}
```

### Effect types

Anchor: `actor` (position resolved at fire time, `hFrac` optional height
fraction) or `at: [x, z]` / `[x, y, z]` (2-form solves y from terrain). With
neither, the panel marker (or the ground ahead of the camera) is used.

| type | needs | params | what it is |
|---|---|---|---|
| `fire` | actor | `slot` (shell index), `tracer` (default true), `recoil` (default true) | full firing event: real muzzle flash (+APFSDS sabot petals), recuperator recoil, a live shell that flies and impacts terrain through the real event path |
| `muzzle_flash` | actor or point | `caliberMm`, `dirDeg` (point form) | flash + smoke ring + ground dust only |
| `tracer` | `from:[x,y,z]`, `to:[x,y,z]` | `shellType` (AP/APCR/APFSDS/HEAT/HE), `speedMps`, `caliberMm` | a real shell entity flying from→to; freeze mid-flight via `fxTime` |
| `impact` | point/actor | `kind` (pen/nonpen/ricochet/he_pen/he_splash/era/spaced_absorb/terrain), `caliberMm`, `normal:[x,y,z]` | armor/terrain impact language |
| `sparks` | point/actor | `caliberMm` | ricochet spark fan (alias of impact ricochet) |
| `explosion` | point/actor | `size`: `small` (HE dirt plume) / `medium` (destruction, no rack) / `large` (full ammo-rack fireball + debris + smoke column), `cause` | standalone explosion |
| `tank_kill` | actor | `cause` (ammorack/shot/fire), `pop` (default true) | the real kill: fireball/debris/column + burn-sweep wreck swap + turret pop on the actor |
| `dust` | point/actor | `count`, `intensity`, `dirDeg` | dust burst (track-dust language) |
| `engine_smoke` | actor | `off` | ADDITIVE: continuous sooty engine-deck smoke, layers over any mesh state (a smoldering wreck) |
| `burning` | actor | `off` | ADDITIVE: the keyed fire/smoke column, layers over any mesh state |
| `detrack` | actor | `side`: `L`/`R` | thrown-track visual + link/spark/dust burst |
| `firing_moment` | actor | `ageS` (default 0.05), `caliberMm`, `shellType` | the composed frozen firing still (contract `combat_firing` language) |
| `explosion_moment` | point/actor | `ageS` (default 0.6) | the composed frozen destruction still |
| `mg_burst` | actor | `count` (default 7), `gapM` (chain spacing, default 7), `spreadDeg`, `caliberMm` (default 12.7), `speedMps` | coax-MG volley: small flash + a chain of live small-caliber tracers already strung down the gun line (fixed per-index jitter — deterministic) |
| `barrage` | point/actor | `count` (default 5), `radiusM` (default 10), `size`: `small`/`medium`/`mixed` (default), `seedDeg` | artillery stonk — deterministic ring of ground bursts around the anchor |
| `armor_scar` | actor | `count` (default 4), `caliberMm` (default 100), `seedDeg` | battle scarring: permanent impact decals stamped around the hull at fixed bearings/heights |
| `exhaust` | actor | `count` (default 14), `intensity` (default 0.95), `sooty` (default true) | diesel belch off the engine deck (the continuous emitter's anchor, one burst) |

### Determinism contract

`load()`:
1. enters/switches to `map` (chunked build, cached per map),
2. waits for every started GLB swap to settle (`waitModels: false` in the
   second argument skips this), re-conforms poses after swaps,
3. resets the fx system (`resetAll` + `resetSeed(seed)`), studio clock to 0,
4. builds actors in order; poses conform to terrain through the movement
   module's real support solve (zero-input handbrake settle), then the
   authored facing/turret/gun values are pinned exactly,
5. applies the camera,
6. samples actor motion tracks and the camera rail at the requested playhead,
7. fires effects sorted by `tMs`, advancing the shared fx clock between them
   in fixed 1/60 s steps (the same cadence live play emits at — smoke
   columns, engine smoke, shell flight and light/ring timelines all age
   through their real update paths),
8. advances to exactly `fxTime` and freezes (`timeScale 0` unless the JSON
   says otherwise). Wind is pinned to a deterministic phase.

Same JSON in → same frame out. Effects with `tMs > fxTime` stay scheduled in
`state()` and fire automatically when preview or recording crosses their time.
Camera rails use Catmull-Rom spatial interpolation for `smooth` arrivals;
`linear` and `cut` are available per shot. Actor keys use shortest-arc angular
interpolation and terrain-following presentation with moving track links.

When the timeline is frozen, an unchanged Studio frame is render-on-demand:
camera/actor/effect/resize changes invalidate it, while idle animation,
world updates, lighting, and post-processing are skipped. A live time scale
continues to render normally.

`state()` returns the schema above (actors in creation order with their
current pose/state, the effect stack with stable `id` + authored `tMs`, the live camera,
`fxTime` = current clock). `load(state())` round-trips.

Effects are individually removable even after they have emitted pooled
particles or changed a tank presentation. Studio restores each actor's
authored baseline (serialized as `authoredState`, `authoredSmoking`,
`authoredBurning`, and authored age/recoil fields only when it differs from
the visible state), resets the FX pools, and deterministically replays the
remaining stack to the same `fxTime`. This is why deleting engine smoke,
burning, a tracer, a detrack, or a kill leaves no orphaned visual state.

## Known limitations

- **Camo is per-spec**: two actors of the same tank id share one paint bake
  (`camo`/`camoSeed` of the most recent application wins). Different specs are
  fully independent.
- Wrecked/burning states and effects **do not run combat math** — no damage
  numbers, no module sim; this is a staging rig.
- `timeOfDayish` is accepted but ignored (sun/sky presets are authored per
  map; re-lighting would need a sky re-bake).
- The garage bay set-dressing physically exists at the map edge (−1500,−1500)
  and can be framed if you fly there.
- Studio `fire` shells collide with terrain only (props/tanks don't stop
  them). A standalone `tracer` stops at its authored `to` point.
- Engine-smoke/burning emission while `timeScale > 0` runs on the live render
  cadence; the frozen composition path (`load`/`advanceFx`) is the
  deterministic one.
- Video capture is picture-only and uses the browser's available MediaRecorder
  codec. Encoded bytes are not expected to be identical across browsers.

## Self-test

`tools/studio-selftest.mjs` (own vite on a 7xxx port, puppeteer) drives:
enter via `?studio=1&map=desert`, `load()` a 3-tank scene (firing / exploding
mid-fireball / burnt wreck, plus dust and engine smoke), asserts direct boot
used the covered Studio stage without building or warming hidden battle-pool
visuals, asserts no battle sim and fx frozen at `fxTime`, captures ≥2560-px
PNGs on desert and winter with different cameras/FOVs, and verifies the scene
JSON round-trip. It also builds the 12-second duel, checks camera/tank/FX
timeline lanes, scrubs to the knockout, proves automatic event playback, and
records a non-empty one-second WebM through the production MediaRecorder path.
`src/game/studioTimeline.selftest.mjs` separately covers duration clamps,
normalization, rails, cuts, and actor interpolation. Output:
`shots/studio-selftest/*.png`.

Render the pinned 20-video modern-MBT example set with:

```bash
npm run studio:examples -- --out shots/studio-modern-examples
```

The batch tool validates both actors as `modern`/`mbt`, records the production
canvas path at 1280×720, and writes WebM files plus `manifest.json` under the
gitignored output directory. Use `--only 3,7,11` to render selected pinned
scenario numbers. The pinned set avoids the urban center because its buildings
can occlude a generic two-tank camera rail.
