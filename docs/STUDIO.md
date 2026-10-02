# Scene Studio

The **Director** workspace is the starting point for new productions. Choose Steel
pursuit, Desert crossfire, or Coastal reconnaissance, select a featured tank and
frame, then **Stage sequence**. Each eight-second sequence contains three authored
camera segments, animated vehicles and timed effects. Preview the shot list or
scrub before capturing. Rig and lens changes save a camera key at the playhead;
switching image formats reframes existing camera positions while preserving cuts
and timings. The frame format is saved in scene JSON and restored without
reframing it a second time. Scene, Tanks, Effects, Timeline and Export tabs retain the detailed
authoring controls. Guides stay out of exported images.

PNG exports use the selected native frame dimensions. **Export film** (Output)
renders the storyboard offline at a native 1080p, 1440p or 2160p production
format with real motion blur and anti-aliasing, encodes every frame in the
browser and downloads an MP4 (see [Film renderer](#film-renderer)). The live
recorder below it uses the current canvas ratio, records in real time and is
silent. For ProRes trailer masters from Node, see
[Cinema masters](MEDIA-PRODUCTION.md#cinema-masters). For synchronized original
sound design and reviewed public campaigns, follow
[Campaign production](MEDIA-PRODUCTION-CAMPAIGNS.md).

Scene Studio is a game mode for composing and recording scenes with the current
renderer. It loads the selected battlefield, including terrain, vegetation,
props, sky, lighting, and post-processing, without running combat AI, spotting,
or the battle HUD. Users can place vehicles, set pose and damage state, schedule
game effects, operate a free camera, define camera and vehicle tracks, edit a
20-second timeline, record browser video, and capture high-resolution stills.

Implementation: `src/game/studioAccess.ts` (retryable chunk/FX acquisition,
stable frame proxy, and temporary F8 ownership), `src/game/studio.ts` (runtime
and `window.__STUDIO`), `src/game/studioTimeline.ts` (pure storyboard
normalization and sampling), and `src/ui/studioPanel.ts` (panel interface).
The film renderer is `src/game/studioFilmPlan.ts` (pure film settings, speed
ramps, shutter schedules, jitter), `src/game/studioFilm.ts` (accumulation
session), `src/engine/filmAccumulation.ts` (the float accumulation pass),
`src/game/studioFilmExport.ts` (WebCodecs encoder, loaded on first export) and
`src/game/studioFilmMux.ts` (dependency-free MP4/WebM containers).
`main.ts` supplies integration ports and retains only the Studio `tick()`
composition branch.

The **Time of day** control switches between Day, Sunset and Night and is saved
with scene JSON. For repeatable 4K map masters, fixed-frame MP4s, vertical/square
promos and a shoreline review workflow, see [Media production](MEDIA-PRODUCTION.md).

## Entering / leaving

| Path | How |
|---|---|
| URL | `/studio?map=desert` or legacy `?studio=1&map=desert` — boots directly into Studio |
| Garage | **F8** (toggle; also the panel's EXIT button) |
| Script | `window.__STUDIO.enter({ map })` / `window.__STUDIO.exit()` |
| Leave | F8 / Esc / EXIT → back to the garage |

Battle vehicle visuals remain hidden while Studio is active. Exiting Studio
restores them and returns control through the normal garage entry. This also
clears camouflage overrides and restores the pedestal key.

Direct navigation uses a dedicated load path. The inline boot screen remains
visible while the battlefield and Studio effect resources load in parallel.
This path does not display the garage or warm the complete battle roster,
wreck, and shadow resources.
Runtime entry from the garage and map changes use the shared transition screen
with measured world-build progress. `window.__STUDIO_LOAD`, `__STUDIO_WARM`, and
`__WORLD_LOAD` expose the most recent stage timings for diagnostics.

Under WebDriver or the `?nogate` parameter, the boot input prompt closes
automatically so headless capture tools can enter Studio.

## Interactive controls

- **LMB-drag** on the world: look around without pointer lock
- **WASD** fly, **Q/E** down/up, **Shift** 4× speed, **wheel** dolly
  (orbit mode: wheel = distance)
- **Click terrain**: move the effect marker (amber ring)
- **Click a tank**: select · **drag a tank**: move it and update terrain alignment
- **Space**: play/pause the storyboard · **Delete**: remove the selected effect
  (or selected actor when no effect layer is selected)
- The panel provides a scrollable workspace with **Battlefield**, **Tanks**,
  **Effects**, **Cinematics**, and **Output** sections. Add camera shots at the
  playhead, set a keyframe after positioning the selected tank, and then scrub
  or play the timeline. **Direct 12 s Duel** configures the first two staged
  tanks as a recordable moving battle. Map previews load when the battlefield
  picker opens. Scene JSON can be downloaded, uploaded, copied, or stored in
  three local slots; Shift-click saves to a slot. The Output section also opens
  the shared 88-frame archive for composition, lighting, effects, and vehicle
  placement reference.

The archive drawer uses the same `src/presentation/mediaArchive.ts` component as
the landing page, public field manual, and Tank Gallery. It reads the checked-in
showcase manifest and loads its compact image rail only when opened, so the 88
reference frames do not add image transfers to Studio startup.

## `window.__STUDIO` (scripted-shoot contract)

```js
await __STUDIO.load(sceneJson)      // deterministic build → returns state()
__STUDIO.capture(opts)              // {dataURL, width, height} hi-res PNG
await __STUDIO.recordVideo(opts)    // plays once → {blob, size, mimeType, durationMs}
__STUDIO.listActors()               // [{index, uid, name, id, pos, facingDeg, …, state}]
__STUDIO.state()                    // round-trippable scene JSON (see schema)
```

Additional methods used by the panel:

```js
__STUDIO.enter({map}) / .exit() / .setMap(mapId)      // async
__STUDIO.addActor(cfg) / .updateActor(ref, patch) / .removeActor(ref)
__STUDIO.setActorState(ref, state, ageS?) / .selectActor(ref) / .clearActors()
__STUDIO.setHydropneumaticAim(ref, pitchDeg)          // real siege-suspension settle
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
await __STUDIO.directProduction({presetId, tankId, format}) // authored eight-second scene
__STUDIO.applyProductionCamera(rig) // hero, track, rear, overhead, detail
__STUDIO.setProductionFormat(format) / .productionFormat // landscape, portrait, square
__STUDIO.recordVideo(opts) / .stopRecording() / .recordingStatus()
__STUDIO.beginFilm(opts) / .renderFilmFrame(opts?) / .endFilm()  // offline film frames
await __STUDIO.exportFilm(opts)     // WebCodecs film → {blob, container, codec, frames, …}
__STUDIO.cancelFilmExport() / .filmExportStatus()
__STUDIO.getFilm() / .setFilm(patch | null) / .FILM_DEFAULTS / .filming / .filmInfo
__STUDIO.setCamera(cfg) / .getCamera()
__STUDIO.TANK_IDS / .MAP_IDS / .ACTOR_STATES / .EFFECT_TYPES / .CAMO_PATTERN_IDS
__STUDIO.getMapInfo(id)             // {id, name}
__STUDIO.getSpecInfo(id)            // {name, gunElevationDeg, gunDepressionDeg, shells}
__STUDIO.performance()              // rendered/skipped frame + pool-sweep counters
__STUDIO.active / .mapId
```

`setHydropneumaticAim` is available only for vehicles whose spec defines a
hydropneumatic aiming system. It advances the fixed-step movement solver, seats
the sprung hull through compression and droop, and settles the deformable wheel
and track course before returning pitch and wheel-stagger telemetry.

Actor `ref` = `uid` (`"a1"`), `name`, roster index, or the actor object.
Effect `ref` = stable effect `id` (`"fx1"`), stack index, or the returned
effect object.

### capture(opts)

`{ width?, height?, scale?, download?, name?, type?, quality?, samples?, filter?,
supersample? }` → renders the current frame once at the requested resolution
(renderer + full post chain temporarily resized at pixelRatio 1, all shadow
cascades forced, `dt = 0`) and returns `{ dataURL, width, height }`. Default
width = `max(2560, 2 × viewport)` at the live aspect; height defaults to the
aspect. Clamped to the GPU max texture size (≤ 6144). `download: true` also
saves the PNG from the browser. Headless drivers read `dataURL` and write the
file themselves (see `tools/studio-selftest.mjs`).

`samples > 1` makes a **film still**: that many sub-pixel-jittered renders of
the same instant (time does not move) are averaged in linear HDR before bloom,
grade and reconstruction, which removes geometric aliasing and shimmer from
key art. `filter` is `gaussian` (default, σ 0.42 px) or `box` (crisper).
`supersample` (1–2) renders that many times larger and downsamples with the
browser's high-quality filter, for texture and sub-pixel detail; the larger
size is still clamped to the GPU maximum. `samples: 1` (the default) is the
original single render.

### recordVideo(opts)

`{ fps?, videoBitsPerSecond?, mimeType?, download?, name? }` records the live
postprocessed renderer canvas while the storyboard plays once from zero to its
bounded duration. Defaults: 60 fps, 12 Mbps, best supported WebM codec,
`download: true`. The storyboard schema clamps every production to 1–20
seconds. The result is `{ blob, size, mimeType, durationMs }`. Recording hides
the camera rail and pauses on the final frame. The video contains the rendered
picture only; Studio does not currently mix game audio into the capture stream.
It records in real time and can drop frames on a busy machine; use the film
renderer below for deliverables.

### Film renderer

The film renderer turns a storyboard into frames that behave like a film
camera, independent of render speed:

- **Shutter.** Output frame *k* at `fps` integrates `samples` stratified
  instants across a shutter of `shutterDeg / 360` frames centred on its frame
  time (`180°` is the cinema standard: at 30 fps the shutter is open 16.7 ms).
  Every sample is a complete scene render: actors, wheels and track links,
  shells and tracers, particles, lights, water, foliage wind and camera rail
  all move between samples, and every shadow cascade re-renders. The centred
  shutter puts the blur centroid exactly on the frame clock; for any shutter
  up to 360° the timeline only advances, so effects fire once at their `tMs`.
  A storyboard **cut** never falls inside a shutter: the frame before the cut
  closes just before it, the next one opens on it (no double exposures).
  Camera-shake **cues** ease in over 12 ms while a film renders (live preview
  keeps the instant kick): a camera cannot teleport, so a jolt that starts
  mid-shutter smears instead of exposing two camera poses. `film.shake`
  (0–2, default 1) scales every cue while the film renders: motion blur turns
  a preview-sized jolt into a long smear, so kill shots often read better at
  0.5.
- **Motion-adaptive samples.** Before each frame the renderer projects probe
  points (four depths across the view and every tracked actor) through the
  storyboard camera across the shutter. When the image moves fast (whip pans,
  camera-shake cues, close passes) it adds samples until consecutive samples
  are at most 1.5 px apart, up to `maxSamples`; static frames keep `samples`.
  `samples: 1` means instantaneous frames (no blur) regardless of `maxSamples`.
- **Anti-aliasing.** Each sample's projection is offset by a re-centred Halton
  (2, 3) sub-pixel jitter (`gaussian` reconstruction by default, `box` for
  crisper edges); the jittered average replaces TAA, which is bypassed (as is
  its wall-clock history) while a film renders.
- **Linear HDR accumulation.** Samples sum in a 32-bit float target inserted
  after the late-FX pass. Bloom, sun shafts, lens flare, the display grade,
  the picture finish, SMAA and reconstruction then run **once** per output frame
  on the average, so motion-blurred highlights (tracers, muzzle flashes, fire)
  stay hot through the tone curve and per-frame finishing (grain, letterbox) is
  applied once, not averaged away.
- **Determinism.** Frames depend only on the scene JSON and the film settings:
  the timeline advances unrounded through each sample instant in ≤ 1/60 s
  steps, continuous emitters pulse on the 60 Hz timeline grid (sub-samples
  never thicken engine smoke), track/wheel phase follows the exact sample
  instant, the lens-flare easing follows the film clock and snaps on cuts,
  the fx clock restarts with the timeline at every load and seek (clock-phased
  fire flicker never inherits the page's history), volumetric clouds drift
  with the timeline and start a fresh trace sequence when a film or still
  begins (then settle every frame), terrain lookahead for the frame camera
  completes before it renders, and the adaptive governor is suspended. The
  live tick and Studio input are suspended while a film is open. See Known
  limitations for what is not yet byte-exact between runs.
- **Speed ramps.** `film.speed` keys are authored on the timeline:
  `{tMs, speed, ease}` with speed 0.05–8 (1 = real time) and `ease`
  `smooth` (default), `linear` or `step` describing the ramp **into** that
  key. Before the first key and after the last the end speeds hold. Film time
  is the integral of 1 / speed, so a 0.2× hold lengthens the film fivefold and
  the shutter (fixed in film time) shortens in timeline time exactly like a
  high-speed camera. Camera rails and shakes slow with the action.

Scripted use:

```js
const info = __STUDIO.beginFilm({ width: 3840, height: 2160, fps: 24, samples: 16,
  maxSamples: 64, shutterDeg: 180, filter: 'gaussian', startMs: 0, endMs: 8000 });
for (let i = 0; i < info.frames; i++) {
  const frame = __STUDIO.renderFilmFrame({ dataURL: true });  // {frame, samples, motionPx, timelineMs, openMs, closeMs, dataURL}
}
__STUDIO.endFilm();
```

`beginFilm` options default to the scene's `film` block, then `FILM_DEFAULTS`
(30 fps, 180°, 8 samples, 64 adaptive, gaussian). Width and height must be even
and ≤ 6144 (default: 1080p in the production format). Frames render strictly in
order; `endFilm()` restores the live viewport, TAA and governor. Without an open
film, `renderFilmFrame(opts)` renders a film still of the current instant (the
`capture()` options above).

`exportFilm({ resolution, fps, samples, maxSamples, shutterDeg, filter, shake,
startMs, endMs, bitrate, container, download, name, onProgress, onFrame })`
renders the same frames at the production format's native size (`resolution`
1080, 1440 or 2160; or explicit `width`/`height`) and encodes them offline with
WebCodecs: H.264 High in a fast-start MP4 where the browser can encode it,
otherwise VP9 in WebM. Frames carry exact timestamps and the encoder is
drained with back-pressure, so the file holds exactly `frames` frames at a
constant rate. Default bitrate ≈ 0.2 bits per pixel per frame (8–100 Mbit/s).
The playhead returns to where it was; `cancelFilmExport()` aborts (the promise
rejects with an `AbortError`). The containers are written by
`studioFilmMux.ts`; there is no third-party dependency.

In the panel, **Output → Film** offers Size (1080p / 1440p / 2160p in the
current production format), Rate (24 / 30 / 60 fps), Blur (Off · 1, Draft · 4,
Good · 8, Best · 16, Master · 32 samples; adaptive up to 64 on fast motion) and
Shake (as authored, half, quarter, off), shows the frame count and length
(including speed ramps), and records the chosen rate, blur and shake in the
scene's `film` block. Export opens a veil with a
live preview at the native aspect, progress, time left and **Cancel**.

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
  "timeScale": 0,               // post-load time scale (default 0 = stay frozen)

  "film": {                     // optional; absent = no film settings authored
    "fps": 24,                  // 24 | 30 | 60
    "shutterDeg": 180,          // 0–360, centred on each frame
    "samples": 16,              // 1–64 per frame (1 = no motion blur)
    "maxSamples": 64,           // adaptive ceiling for fast frames (≤ 128)
    "filter": "gaussian",       // gaussian | box (sub-pixel reconstruction)
    "shake": 1,                 // 0–2: camera-shake cue scale while filming
    "speed": [                  // speed ramp keys on the TIMELINE (sorted)
      { "tMs": 5600, "speed": 1 },
      { "tMs": 6000, "speed": 0.2, "ease": "smooth" },  // ramp INTO this key
      { "tMs": 7000, "speed": 0.2 },
      { "tMs": 7600, "speed": 1 }
    ]
  }
}
```

`state()` includes `film` only when the scene authored one (`setFilm(patch)`,
the Output panel's Rate/Blur/Shake, or a loaded scene), so older scenes
round-trip unchanged.

### Effect types

Anchor: `actor` (position resolved at fire time, `hFrac` optional height
fraction) or `at: [x, z]` / `[x, y, z]` (2-form solves y from terrain). With
neither, the panel marker (or the ground ahead of the camera) is used.

| type | needs | params | what it is |
|---|---|---|---|
| `fire` | actor | `slot` (shell index), `tracer` (default true), `recoil` (default true) | Complete firing event with muzzle flash, APFSDS sabot petals, recoil, projectile travel, and terrain impact. |
| `muzzle_flash` | actor or point | `caliberMm`, `dirDeg` (point form) | flash + smoke ring + ground dust only |
| `tracer` | `from:[x,y,z]`, `to:[x,y,z]` | `shellType` (AP/APCR/APFSDS/HEAT/HE), `speedMps`, `caliberMm` | Projectile entity traveling between two points; `fxTime` can freeze it in flight. |
| `impact` | point/actor | `kind` (pen/nonpen/ricochet/he_pen/he_splash/era/spaced_absorb/terrain), `caliberMm`, `normal:[x,y,z]` | Armor or terrain impact effect. |
| `sparks` | point/actor | `caliberMm` | ricochet spark fan (alias of impact ricochet) |
| `explosion` | point/actor | `size`: `small` (HE dirt plume) / `medium` (destruction, no rack) / `large` (full ammo-rack fireball + debris + smoke column), `cause` | standalone explosion |
| `tank_kill` | actor | `cause` (ammorack/shot/fire), `pop` (default true) | Destruction sequence with a fireball, debris, smoke column, wreck transition, and optional turret detachment. |
| `dust` | point/actor | `count`, `intensity`, `dirDeg` | Dust burst using the track-dust effect. |
| `engine_smoke` | actor | `off` | Additive continuous smoke from the engine deck, including on wreck meshes. |
| `burning` | actor | `off` | Additive keyed fire and smoke column over the current mesh state. |
| `detrack` | actor | `side`: `L`/`R` | thrown-track visual + link/spark/dust burst |
| `firing_moment` | actor | `ageS` (default 0.05), `caliberMm`, `shellType` | the composed frozen firing still (contract `combat_firing` language) |
| `explosion_moment` | point/actor | `ageS` (default 0.6) | the composed frozen destruction still |
| `mg_burst` | actor | `count` (default 7), `gapM` (chain spacing, default 7), `spreadDeg`, `caliberMm` (default 12.7), `speedMps` | Coaxial machine-gun flash and a deterministic sequence of small-caliber tracers along the gun line. |
| `barrage` | point/actor | `count` (default 5), `radiusM` (default 10), `size`: `small`/`medium`/`mixed` (default), `seedDeg` | Deterministic ring of artillery ground bursts around the anchor. |
| `armor_scar` | actor | `count` (default 4), `caliberMm` (default 100), `seedDeg` | Persistent impact decals placed around the hull at fixed bearings and heights. |
| `exhaust` | actor | `count` (default 14), `intensity` (default 0.95), `sooty` (default true) | Exhaust burst from the engine deck at the continuous emitter anchor. |

### Determinism contract

`load()`:
1. enters/switches to `map` (chunked build, cached per map),
2. waits for every started GLB swap to settle (`waitModels: false` in the
   second argument skips this), re-conforms poses after swaps,
3. resets the fx system (`resetAll` + `resetSeed(seed)`), studio clock to 0,
4. builds actors in order; poses conform to terrain through the movement
   module's support calculation (zero-input handbrake settle), then the
   authored facing/turret/gun values are pinned exactly,
5. applies the camera,
6. samples actor motion tracks and the camera rail at the requested playhead,
7. fires effects sorted by `tMs`, advancing the shared fx clock between them
   in fixed 1/60 s steps (the same cadence used during play; smoke
   columns, engine smoke, shell flight and light/ring timelines all age
   through their runtime update paths),
8. advances to exactly `fxTime` and freezes (`timeScale 0` unless the JSON
   says otherwise). Wind is pinned to a deterministic phase.

The same JSON input produces the same frame. Effects with `tMs > fxTime` remain scheduled in
`state()` and fire automatically when preview or recording crosses their time.
Camera rails use Catmull-Rom spatial interpolation for `smooth` arrivals;
`linear` and `cut` are available per shot. Actor keys use shortest-arc angular
interpolation and terrain-following presentation with moving track links.

When the timeline is frozen, an unchanged Studio frame is render-on-demand:
camera/actor/effect/resize changes invalidate it, while idle animation,
world updates, lighting, and post-processing are skipped. A nonzero time scale
continues to render normally.

`state()` returns the schema above (actors in creation order with their
current pose/state, the effect stack with stable `id` + authored `tMs`, the current camera,
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
- Wrecked and burning states do not run the combat simulation. They do not
  calculate damage or module state.
- `timeOfDayish` is accepted but ignored (sun/sky presets are authored per
  map; re-lighting would need a sky re-bake).
- The garage bay set-dressing physically exists at the map edge (−1500,−1500)
  and can be framed if you fly there.
- Studio `fire` shells collide with terrain only (props/tanks don't stop
  them). A standalone `tracer` stops at its authored `to` point.
- Engine smoke and burning effects with `timeScale > 0` use the current render
  cadence. The frozen composition path (`load`/`advanceFx`) remains deterministic.
- Video capture does not include audio and uses the browser's available MediaRecorder
  codec. Encoded bytes are not expected to be identical across browsers.
- Film exports are silent. Their frames are reproducible for the same scene,
  settings, browser and GPU; encoded bytes depend on the browser's encoder.
- Film motion blur is sampled, not analytic: very fast motion beyond the
  adaptive ceiling (shell flights, the strongest shake cues) can still show
  faint stepping; raise `maxSamples` (≤ 128) for those shots.
- Volumetric clouds drift with the timeline during a film (a 0.2× hold slows
  them too) and start a fresh trace sequence when a film or still begins.
  Ambient occlusion is off on every quality tier; a tier that enables GTAO
  keeps its temporal history across samples, and that history reseeds after a
  250 ms wall-clock gap, so AO would not be byte-exact between runs.
- Two renders of one scene match in every authored element (timing, sample
  counts, camera, effects, clouds) but are not yet byte-identical: grass,
  carpet and terrain streaming finish on cooperative time budgets, so the
  first frames after a large camera move can differ where a grass chunk or a
  terrain LOD lands a frame earlier on a faster run.
- Supersampling (`supersample`) applies to stills only. A film's export size is
  rendered directly; 2160p films need a desktop-class GPU (about 1 GB of render targets).

## Self-test

`tools/studio-selftest.mjs` starts Vite on an available 7xxx port and uses
Puppeteer to enter `?studio=1&map=desert`. It loads a three-tank scene with
firing, destruction, wreck, dust, and engine-smoke states. The test verifies
the dedicated Studio boot path, confirms that battle simulation is disabled,
checks the frozen `fxTime`, captures PNG files at 2560 pixels or wider on two
maps, and verifies scene JSON round-trip behavior. It also creates the 15-second
duel, checks four curved camera variants, deterministic motion cues, vehicle
and effect tracks, and seeks to the knockout event. It
verifies scheduled playback, and records a non-empty one-second WebM file.
`src/game/studioTimeline.selftest.mjs` separately covers duration clamps,
normalization, rails, cuts, and actor interpolation. Output:
`shots/studio-selftest/*.png`.

Render the current 30-map duel collection with:

```bash
npm run studio:examples -- --out shots/studio-map-examples
```

The batch validates both registered vehicle IDs, stages them at authored spawn
points, applies each map's biome camouflage, and cycles four camera variants.
The default canvas is1920×1080 at30fps. Use `--fps 60` or `--width 2560
--height 1440` explicitly when needed. Every duel has a15-second storyboard,
16 camera shots and8 motion cues. The recorder holds the opening pose until
the encoder returns its first data, then starts timeline playback.

WebM files and `manifest.json` go to the ignored output directory. The manifest
records timeline and actual container duration, opening lead-in, file bytes,
actors, map, stage, and camera variant. Container validation rejects truncated
playback; the measured encoder lead-in is accounted for separately. Use
`--only 3,7,11` to replace selected scenario numbers while preserving other
entries with the same renderer settings. `--collection features|hero-rails|battle-reels`
renders the feature loops, the landing rails or the Docs' pinned reel library
instead (round 54, 2026-09-24; `tools/studio-example-scenarios.mjs`), and
`--stills 0,1850,3900` captures a PNG at each storyboard time in place of the
video for framing review. Generated scenes still require native
framing review: an authored spawn is not proof that every camera avoids terrain
or buildings. Preserve failed acquisitions and use a new output directory for
comparison renders.

## Checking actor ground contact

`node tools/studio-ground-contact-probe.mjs --out=.qa-dev/studio-ground-review`
opens the canonical Winter duel through the real Studio path and captures
track/road-wheel vertices against its active terrain at several forward and
reverse seek times. The probe owns an isolated browser and the shared capture
queue. Read both penetration and separation across each sampled footprint; a
small minimum gap or a ground shadow alone does not establish full contact.
Outputs are diagnostic QA artifacts, not a fleet qualification receipt.
