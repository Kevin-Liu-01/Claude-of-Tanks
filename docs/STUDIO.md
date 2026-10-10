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
browser with the game's combat sound and downloads an MP4 (see
[Film renderer](#film-renderer)). The live
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

The **Time of day** control offers Dawn, Morning, Day, Golden hour, Sunset, Dusk
(blue hour) and Night, and the **Sun** compass sets the sun's bearing and height
(see [Light](#light-times-of-day-and-sun-direction)); both are saved with scene JSON.
For repeatable 4K map masters, fixed-frame MP4s, vertical/square promos and a
shoreline review workflow, see [Media production](MEDIA-PRODUCTION.md).

## Entering / leaving

| Path | How |
|---|---|
| URL | `/studio?map=desert` or legacy `?studio=1&map=desert` — boots directly into Studio |
| Scene link | `/studio?scene=/media/filming-r1/s05-barn-advance.scene.json` — boots into Studio on the scene's own map and loads the scene exactly as **Load JSON** would. Only a `.json` path on this site opens (`studioSceneLink.ts`): other origins, `//host`, `..` and backslashes are refused, and a link that fails leaves the plain Studio open |
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
__STUDIO.setPicture(patch) / .getPicture()          // film-grade picture (see "Picture")
__STUDIO.pictureInfo({width, height}?)              // focal length, focus, mattes, stages
__STUDIO.PICTURE_PRESETS                            // [{id, label}] named looks
await __STUDIO.setTimeOfDay(time, light?)  // a Studio time; `light` (object or null) sets the sun with it
await __STUDIO.setLight(patch)      // {sunAzimuthDeg?, sunElevationDeg?} merge (a null field clears it); null clears all
__STUDIO.getLight()                 // {time, requestedTime, sunAzimuthDeg, sunElevationDeg, override, band, times, space}
__STUDIO.timeOfDay                  // the time as rendered (a space map renders day)
__STUDIO.STUDIO_TIMES / .STUDIO_TIME_BANDS
__STUDIO.setFxQuality('battle' | 'cinematic') / .fxQuality // scene FX quality (see Cinematic FX)
__STUDIO.setTrackDust(on) / .trackDust                // dust + prints behind driven actors
__STUDIO.cinematicStats()                             // cinematic layer emitters / pool high-water
__STUDIO.TANK_IDS / .MAP_IDS / .ACTOR_STATES / .EFFECT_TYPES / .CAMO_PATTERN_IDS
__STUDIO.FX_QUALITIES / .FX_PARAMS                    // fx qualities, cinematic parameter schema
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

`exposureMs` (≤ 1000) makes a **motion-blur still**: the shutter stays open
across that much timeline centred on the playhead while actors, the camera
rail and effects move (16 base samples unless `samples` says otherwise,
adapted to the image motion up to `maxSamples`, default 64, ≤ 128; `shake`
scales camera cues, default the scene's `film.shake`). A rail that tracks a
tank keeps it sharp against a streaked world; no sample crosses a storyboard
cut, and the playhead returns to its instant afterwards. The result adds
`samples` (used) and `exposureMs`. Typical values: 4 (1/250 s), 17 (1/60 s),
33 (1/30 s), 125 (1/8 s), 250 (1/4 s).

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
startMs, endMs, audio, bitrate, container, download, name, onProgress, onFrame })`
renders the same frames at the production format's native size (`resolution`
1080, 1440 or 2160; or explicit `width`/`height`) and encodes them offline with
WebCodecs: H.264 High in a fast-start MP4 where the browser can encode it,
otherwise VP9 in WebM. Frames carry exact timestamps and the encoder is
drained with back-pressure, so the file holds exactly `frames` frames at a
constant rate. Default bitrate ≈ 0.2 bits per pixel per frame (8–100 Mbit/s).
The playhead returns to where it was; `cancelFilmExport()` aborts (the promise
rejects with an `AbortError`). The containers are written by
`studioFilmMux.ts`; there is no third-party dependency.

**Sound** (`audio`, default `true`; the result's `audio` says whether the file
carries it): while the film renders, every combat sound the timeline produces —
gun reports, armour hits (penetrating, absorbed, ricochet, ERA), HE bursts,
shell strikes on terrain and vehicle destructions — is logged at its exact
instant and position. After the last frame `studioFilmAudio.ts` mixes them
offline (OfflineAudioContext, 48 kHz stereo) from the game's recorded sound
library (`public/audio/sfx`, see `docs/AUDIO.md`), layered as the engine layers
them: a shot is its bore's punch, close and distant reports and the map's echo
tail; a kill is the blast, its sub, the debris and, after an ammunition fire,
the turret landing. Each sound is panned against the film camera at that
instant, attenuated by distance and air absorption and delayed by the speed of
sound beyond 40 m. Nothing is synthesized: a missing recording fails the
soundtrack rather than playing a stand-in. Speed
ramps slow the sound with the picture (a 0.2× beat plays pitched down and
stretched). A seeded RNG picks the variants, so a film mixes the same sound
every time. The mix is encoded with WebCodecs (AAC-LC in MP4, with an edit
list that hides the encoder's measured priming so reports land on their
frames; Opus in WebM). Engine, track and ambience beds, machine guns and radio
voices are not part of the film mix; a browser without an audio encoder exports
the film silent.

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
  "timeOfDay": "golden",        // dawn | morning | day | golden | sunset | dusk | night (default day)
  "light": {                    // optional sun override (omit = the time's own sun)
    "sunAzimuthDeg": 210,       //   bearing, 0 = +Z, 90 = +X (the map sky convention); wraps into [0, 360)
    "sunElevationDeg": 9        //   clamped into the time's band (see Light); the moon at night
  },
  "seed": 5000,                 // fx rng seed (default 5000)
  "fx": {                       // optional; omitted = the game's exact battle look
    "quality": "cinematic",     // battle (default) | cinematic
    "trackDust": true           // default: true for cinematic, false for battle
  },

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

  // an actor driven along its track kicks up its tracks' dust as a battle hull does (one call per side every
  // 0.45-0.7 m of travel, on the fixed timeline): on the media tier, the ground's dust skirt behind it

  "fxTime": 600,                // ms: advance the fx timeline exactly this far
                                //   after firing the effects, then FREEZE
  "timeScale": 0,               // post-load time scale (default 0 = stay frozen)
  "picture": { "preset": "cinematic", "letterbox": "2.39",
               "dof": { "enabled": true, "focusActor": "hero", "fStop": 2.8 } },
                                // optional; omitted = the neutral house picture

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
| `explosion` | point/actor | `size`: `small` (HE dirt plume) / `medium` (destruction, no rack) / `large` (full ammo-rack fireball + debris + smoke column), `cause`; or `munition` (a class of `src/sim/destructionEvents.ts`: `howitzer`, `missile`, `atgm`, `drone_fpv`, `rocket`, `autocannon_he`, `kinetic`, `small_arms` ...) with optional `chargeKg` (default the class's nominal); with `munition`, `wall: true` ends the round on the nearest building's wall along `dirDeg`, `hitH` m up it (default 1.8); `settled: true` lays only the crater the burst would dig, settled (a late joiner's view, no blast) | standalone explosion; with `munition`, the burst that class makes on the ground or water (sized by its charge, coloured by the surface), or on the wall as a battle shell strikes one (the burst names the building, the expiry carries the face's normal) |
| `tank_kill` | actor | `cause` (ammorack/shot/fire), `pop` (default true) | Destruction sequence with a fireball, debris, smoke column, wreck transition, and optional turret detachment. |
| `dust` | point/actor | `count`, `intensity`, `dirDeg` | Dust burst using the track-dust effect. |
| `engine_smoke` | actor | `off` | Additive continuous smoke from the engine deck, including on wreck meshes. |
| `burning` | actor | `off` | Additive keyed fire and smoke column over the current mesh state. |
| `detrack` | actor | `side`: `L`/`R` | thrown-track visual + link/spark/dust burst |
| `firing_moment` | actor | `ageS` (default 0.05), `caliberMm`, `shellType` | the composed frozen firing still (contract `combat_firing` language) |
| `structure` | point | `stage`: `damaged` / `breached` / `collapsed` (default), `munition` (the blow's class, default `he`), `cause` (`blast` / `kinetic` / `ram`), `dirDeg` (the blow's heading), `hitH` (the blow's height up the wall, m) | the building nearest the point crosses that stage as the battle's sim announces one (a jumped stage lays the one it skipped): its breach rim and room, its fall and pile in its own materials, its dust. Presentation only: the Studio's collision is untouched; a scene load stands it up again |
| `explosion_moment` | point/actor | `ageS` (default 0.6) | the composed frozen destruction still |
| `mg_burst` | actor | `count` (default 7), `gapM` (chain spacing, default 7), `spreadDeg`, `caliberMm` (default 12.7), `speedMps` | Coaxial machine-gun flash and a deterministic sequence of small-caliber tracers along the gun line. |
| `barrage` | point/actor | `count` (default 5), `radiusM` (default 10), `size`: `small`/`medium`/`mixed` (default), `seedDeg` | Deterministic ring of artillery ground bursts around the anchor. |
| `armor_scar` | actor | `count` (default 4), `caliberMm` (default 100), `seedDeg` | Persistent impact decals placed around the hull at fixed bearings and heights. |
| `exhaust` | actor | `count` (default 14), `intensity` (default 0.95), `sooty` (default true) | Exhaust burst from the engine deck at the continuous emitter anchor. |
| `smoke_screen` | actor | `durationS` (6–60, default 24), `density` (0.3–1.6, default 1), `count` (2–12, default 6; vehicles without a launcher kit) | The actor's own smoke-grenade salvo: the game's launcher sockets and smoke ballistics, ripple pops, canisters in flight with trails, white landing bursts, then a wall that blooms, rolls and drifts with the battle smoke wind. |
| `flare` | point/actor | `heightM` (20–220, default 90), `burnS` (6–60, default 26), `intensity` (0.2–3, default 1), `driftMps` (0–6, default 1.4), `fallMps` (0.5–8, default 2.6), `color` (white/red/green/amber), `launch` (default true) | Illumination flare: launch streak, burst, then a magnesium core drifting down under its parachute with a lit smoke trail and dripping sparks. Lights the scene through one borrowed pooled light. |
| `embers` | point/actor | `radiusM` (0.5–20, default 3), `rate` (4–160 per s, default 30), `durationS` (1–60, default 10), `rise` (0.5–8 m/s, default 3) | Ember storm rising and swirling downwind off a fire. |
| `debris` | point/actor | `count` (4–80, default 24), `speedMps` (4–45, default 16), `hot` (0–1, default 0.5), `scale` (0.4–3, default 1) | Fragments thrown out of a blast: hot pieces trail smoke and flame, every piece kicks soil where it lands. |
| `shockwave` | point | `radiusM` (4–60, default 18), `strength` (0.2–2, default 1) | A ground dust ring racing outward and decelerating to its radius, with the pressure-ring decal and an inner soil billow. |
| `fire_field` | point | `radiusM` (1–20, default 5), `durationS` (2–60, default 20), `intensity` (0.2–2, default 1), `smoke` (default true) | Burning ground: low flames over the area, lit smoke, embers, a ground fire glow and firelight. |

`explosion` also takes `size: "huge"` (fuel / ammunition cook-off column: a
rising double fireball, 48 m leaning smoke column, base fire, ember storm,
cook-off pops, a 34 m shockwave). `huge` always renders through the
cinematic layer. Any effect accepts `params.quality: "battle" | "cinematic"`
to override the scene `fx.quality` for that layer only. `barrage` takes
`durationS` (0–12, default 2.4) in cinematic quality: the rounds arrive as a
staggered walking salvo instead of one simultaneous flash.

### Cinematic FX (`fx.quality: "cinematic"`)

Battle effects are tuned for gameplay readability at gameplay distances.
Cinematic quality layers production pyrotechnics over the same battle
recipes (`src/fx/cinematicFx.ts`, recipes in `src/fx/cinematicRecipes.ts`);
the battle runtime itself is unchanged and battle sessions never create it.

| type | cinematic layer |
|---|---|
| `fire`, `muzzle_flash` | incandescent muzzle fireball, overpressure flash disc, expanding propellant ring, forward gas cone, unburnt-propellant sparks; within ~4 m of the ground a blast fan of dust and grit thrown off the terrain (tone follows the map/surface: earth, sand, snow, road) and a haze that hangs for seconds |
| `fire` shells | exact terrain crossing (independent of the step) and an impact burst where the round lands |
| `impact` / `sparks` | white-hot pop, flame jet and molten spall out of a penetration; spark showers that bounce off the ground; embers |
| `explosion` small/medium/large | HE burst with ejecta fountain, skirt, shockwave, clods and a lingering cloud (small); rolling fireballs with debris, embers and cook-off pops (medium/large) |
| `tank_kill` | flash → rolling fireball and dark smoke roll → turret-ring blowtorch (ammo rack) → secondary cook-off pops with light pulses (6 / 2 / 1 for ammorack / shot / fire) → burning debris → a burning wreck with licking flames, embers, fire-lit smoke and a 26 m leaning column |
| `burning` | the same burning-wreck emitter (18 m column); `burning` with `off` extinguishes the actor's cinematic fires |
| `dust`, `mg_burst`, `barrage` | billowing dust packets; per-round MG flashes and sparks; staggered walking salvo |
| `tracer`, `fire`, `mg_burst` shells | a hot glare sprite rides every projectile head (larger and brighter at night) |
| `flare` | parachute canopy above the candle, lit from below by the flare light |

Night shots: smoke and dust follow the scene light (white in daylight, the
exact battle look; warm at sunset; dim moonlit blue at night) and puffs born
near fire carry their own fading emission, so plumes glow orange at the base
and fade to dark upward. Studio-only shader define `FX_LIGHT_TINT` provides
this; battle materials never compile it. At night the pooled muzzle light and
muzzle cards are reduced (to 40 % / 58 % at full night) so a front-on shot
no longer clips the frame.

Light budget: the two pooled FX lights are unchanged. Cook-off pops pulse
the pooled explosion light at their exact times; between blasts the light
director drives that light with the strongest sustained fire. Flares (and,
when no flare burns, the second-strongest fire) drive one borrowed light:
the sniper fill light main.ts always creates, idle in Studio. Scene light
counts and material programs never change; the borrowed light is restored
on exit.

Ground interaction: fires and burning wrecks lay an additive fire-glow
decal on the terrain (stronger at night); driven actors (storyboard tracks)
throw distance-keyed dust and stamp track prints when `trackDust` is on.

Step-size independence: cinematic emitters tick on an absolute grid
(`startS + k × period`, track dust on the 60 Hz grid from 0) in global time
order, each with a private stream seeded by the scene seed and the effect
id; one-shot sub-events (cook-offs, staggered barrage rounds, debris trails)
are emitted at fire time with scheduled births. Stepping a scene at
1/60 s, 4 ms or jittered 2–8 ms produces the same particles in the same
order (`src/fx/cinematicFx.selftest.mjs`). Battle-recipe particles in the
same shot are rate- and birth-stable but share the battle stream, so their
random draws may interleave differently at another step size. In cinematic
quality, engine smoke (`engine_smoke`, `engine-smoking`) pulses once per
1/60 s timeline grid line and each birth is scheduled at its grid time, so
2–8 ms export steps neither multiply nor shift it; battle quality keeps the
live one-pulse-per-step look.

Parameters and panel: **Effects → Cinematic pyro** toggles CINEMATIC FX and
TRACK DUST and fires the new types (smoke screen on the selected tank;
flare and embers on the selected tank or the marker; fire field, shockwave,
debris and the huge explosion at the marker). Selecting a layer of a type
with parameters shows its sliders (`__STUDIO.FX_PARAMS`); a change replays
the stack once on release.

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

## Picture

Film-grade picture settings for stills and films (media r5): a named look plus overrides for
exposure, white balance, a display grade, hue secondaries, HDR highlights, a thin-lens depth of
field and a finishing pass. Schema and looks: `src/game/studioPicture.ts`; passes:
`src/engine/cinemaPost.ts`; panel: `src/ui/studioPicturePanel.ts` (the **Picture** section of
the Cinematics group, under the workspace's TIMELINE tab, after Camera).

**Neutral is the house render.** A stage with neutral values inserts no pass, so a scene without
`"picture"` (or with `{"preset": "natural"}`) renders byte-for-byte as before and `state()` omits
the key. Passes exist only while the Studio owns the frame (a picture set before entry applies on
entry) and everything — passes, the bloom/light-FX hooks, light-FX overrides, FSR as the final
pass — is restored on Studio exit; battle never loads the module.

Where the stages sit in the live post chain (post.ts, extended at runtime only):

```
sceneAA → aerial → GTAO → lateFx → TAA → [LENS] → bloom (×bloom, ×bloomThreshold) → sun shafts
→ lens flare (forced/scaled) → [HDR] → house grade (ACES + sRGB + grade) → [GRADE] → SMAA
→ FSR → [FINISH]
```

### Scene JSON `picture`

`{ "preset": "<look id>", ...overrides }`. Any field below overrides the look; groups merge
key by key. Values are clamped to the range and quantized to 1e-4; unknown keys, presets or
enum values throw (`load()` rejects before replacing the scene).

| Field | Range | Neutral | Meaning |
|---|---|---|---|
| `exposure` | −4…4 EV | 0 | Linear scene exposure before the tonemap (also scales sun shafts/flare). |
| `temperature` / `tint` | −100…100 | 0 | LMS white balance (+warm / +magenta), grey luminance preserved. |
| `contrast`, `pivot` | 0.5…2, 0.1…0.9 | 1, 0.43 | Symmetric power S-curve around a display-space pivot. |
| `toe` | −1…1 | 0 | + filmic toe (deeper blacks), − matte/faded blacks. |
| `shoulder` | −1…1 | 0 | + softer, milkier highlight roll-off, − harder top end. |
| `saturation`, `vibrance` | 0…2, −1…1 | 1, 0 | Luma-preserving; vibrance favours low-chroma pixels. |
| `lift` / `gamma` / `gain` | [r,g,b] −0.3…0.3 / 0.3…3 / 0…3 | 0 / 1 / 1 | Primary wheels (a scalar fills all channels). |
| `split` | `shadowHue`/`highlightHue` 0…360°, amounts 0…1, `balance` −1…1 | amounts 0 | Luma-keyed split toning (moves chroma, not level). |
| `warms` / `greens` / `blues` | `hue` −60…60°, `saturation` 0…2, `lightness` −1…1 | 0, 1, 0 | Hue secondaries around orange 32°, yellow-green 102°, sky blue 212°; +hue rotates toward green→cyan→blue. |
| `mono`, `monoMix` | 0…1, [r,g,b] | 0, Rec.709 | Black and white with a filter mix (normalized). |
| `bloom`, `bloomThreshold` | 0…4, 0.25…4 | 1, 1 | Scales on the house bloom strength/threshold. |
| `streaks` | `amount` 0…3, `threshold` 0.5…32 (linear HDR), `length` 0…1, `tint` | amount 0 | Anamorphic horizontal streaks from hot pixels (horizontal mip pyramid: sharp core, long tail). |
| `halation` | `amount` 0…3, `threshold` 0.1…16, `radius` 0.25…4, `tint` | amount 0 | Red-orange film glow around bright edges (σ = 0.45 % of frame height × radius). |

Streak and halation sources saturate at a per-pixel energy cap, so a muzzle-flash or fireball
core cannot flood a night frame through its glow.
| `sunShafts` / `lensFlare` | `mode` auto/on/off, `intensity` 0…4 | auto, 1 | Force or scale the round-69 light effects (works on presets that disable them). |
| `dof` | see below | `enabled: false` | Thin-lens depth of field. |
| `chromaticAberration` | 0…1 | 0 | Radial lateral fringe, edge-weighted (r²), spectral taps. |
| `vignette` | `amount` 0…1, `roundness` 0…1, `softness` 0…1 | amount 0 | Linear-light lens falloff (roundness 1 = circular in pixels). |
| `grain` | `amount` 0…1, `size` 0.5…4, `color` 0…1, `response` 0…1 | amount 0 | Luma-weighted film grain; size in px at 1080 lines (scales with the output). |
| `letterbox` | `none`, `2.39`, `2.00`, `1.85` | none | Black mattes in whole pixels against the output aspect (pillarbox when narrower). |

`dof`: `enabled`, `focusActor` (actor name, uid or index; follows the actor every frame at
0.55 × its height, measured along the optical axis), `focusDistance` (0.5…5000 m, used when no
actor), `focusOffset` (−50…50 m), `fStop` (0.7…32), `sensor` (`super35` 24.89 mm,
`fullframe` 36 mm, `alexa65` 54.12 mm, `imax` 70.41 mm — the width, used with a 16:9
extraction, so Super 35 is 14.0 mm tall), `anamorphic` (0…1: oval bokeh up to 2:1),
`bokehScale` (0…8, default 1).

Lens physics: focal length `f = (sensorHeight / 2) / tan(fov / 2)` from the camera's vertical
FOV; signed circle of confusion `c(d) = f² / (N (s − f)) · (d − s) / d` as a fraction of the frame
height, so the live viewport (narrower than 16:9 beside the dock), 4K captures and the
portrait/square formats defocus identically. Studio renders it × `PICTURE_DEFOCUS_GAIN` (16):
on Studio's wide lenses a strict thin lens is near hyperfocal (f/2.8 on a 40° Super 35 frame
focused at 12 m blurs the horizon by < 1 px); with the gain that frame gives a ~6 px-radius
background at 1080p while f/11 stays near-sharp. `bokehScale: 0.0625` is strictly physical.
The gather runs at half resolution with near/far separation (far samples never wider than the
centre's CoC, so focused edges neither bleed into nor get smeared by the blur behind them; the
near field is dilated through a tile max so a blurred foreground spreads over the subject), a
bilateral full-resolution composite, and the sky at infinity. The radius is capped at 2.8 % of
the frame height. Live preview gathers 81 taps; `capture()` uses 225. Smoke, fire and flashes are
placed in depth by quarter-resolution coverage slices (see Known limitations).

### Looks (`__STUDIO.PICTURE_PRESETS`)

| id | Intent |
|---|---|
| `natural` | The house render (neutral). |
| `cinematic` | Teal/orange filmic: warm accents against teal shadows, foliage toward olive-teal. |
| `blockbuster` | Punchy contrast, crushed blacks, saturated warm highlights, blue streaks, forced sun FX. |
| `golden-hour` | Amber highlights, glowing soft shoulder, cool shadows, olive foliage. |
| `steel` | Cold, desaturated war film. |
| `bleach-bypass` | Silver retained: high contrast, low saturation, heavy grain. |
| `desert-heat` | Sun-bleached orange/amber with teal shadows. |
| `night-ops` | Cool moonlight; firelight still burns orange; restrained blue streaks. |
| `ember` | Fire-lit combat: molten highlights, halation, warm streaks. |
| `noir` | Black and white through a red-orange filter: dark skies, hard light, grain. |
| `vintage-print` | Print-film emulation: milky shoulder, faded blacks, warm highs, cyan lows, grain. |

Looks never set a letterbox or depth of field — framing and focus belong to the shot.

### API

- `setPicture(patch)` → resolved picture. `preset` switches the look (earlier overrides are
  discarded); other fields override the current values; `setPicture(null)` resets to neutral.
  Ignored while recording.
- `getPicture()` → the full resolved picture (JSON-safe copy).
- `pictureInfo({ width?, height? })` → `{ neutral, stages, focalLengthMm, focusM, focusActor,
  cocInfinity, letterboxPx: {x, y} }` for that output size (default: the live viewport), e.g.
  `pictureInfo({ width: 3840, height: 2160 }).letterboxPx` to crop a 2.39 deliverable from a
  capture.
- `state().picture` is `{ preset, ...minimal overrides }`; `load(state())` is identity.

### Film accumulation contract

Grain, chromatic aberration, vignette and the letterbox are FINISH operations applied once per
output frame at native resolution after FSR. For sub-sample accumulation:
`__STUDIO._internal.picture.setFinishBypass(true)` removes the finish from the composer (the
canvas then shows the pre-finish frame), and `renderFinish(texture, target | null, { seed? })`
runs it once on the average (null = the canvas). The grain seed is
`pictureGrainSeed(scene seed, Studio clock)` — 240 distinct fields per Studio second, never wall
time. `setQuality('capture' | 'preview')` selects the tap counts.

### Cost

Measured on the M5 Max reference host at 1920×1080 (pixel ratio 1), median of interleaved blocks
on a shared, loaded machine: the full stack (blockbuster look + depth of field + letterbox) adds
about 4 ms per frame; the grade, HDR and finish stages are each about 1–3 ms, the lens with three
FX coverage slices about 1–3 ms. Studio renders on demand while frozen.

## Light: times of day and sun direction

Scene Studio renders seven times of day. They are a Studio-only superset of the battle times: battles keep
`BATTLE_TIMES` (`day`, `sunset`, `night`), their seeded weights and their presets byte-for-byte. Each Studio time is
authored relative to the map's own sky (`src/game/studioLight.ts`: multipliers and hue blends over the authored key,
ambient, haze, fog and clouds), so an overcast map stays overcast at golden hour, a desert keeps its hard key and the
authored day is exact. Moonlight and the blue-hour glow are absolute keys.

| `timeOfDay` | Sun elevation: default (band) | Look |
|---|---|---|
| `dawn` | 4° (1–9°) | sun just clear of the horizon: rose key, a lavender sky (an ozone violet cast), soft low-contrast light, gentle haze |
| `morning` | 17° (12–30°) | clean deep-blue air, crisp shadows, near-white key |
| `day` | the map's authored sun (10–80° when moved) | the battlefield as authored |
| `golden` | 11° (6–18°) | rich warm gold, long shadows, a strong key over cool shade |
| `sunset` | 3.5° (1–8°) | a deep orange key on the horizon, a glowing band under a deepening blue, darker land |
| `dusk` | −4° (−9 to −1°), the set sun | blue hour: a deep twilight dome over the warm glow band and the Belt of Venus, first stars, dark land under a faint warm key from the glow (5° up its bearing); windows, street lamps and headlights lit |
| `night` | 20° (8–70°), the moon | silver moonlight, stars, the moon disc and moonlit clouds; windows, lamps and headlights lit |

The scene JSON `light` block overrides the sun (the moon at night). `sunAzimuthDeg` is the bearing in the map sky
convention (0 = +Z, 90 = +X; wraps into [0, 360)); `sunElevationDeg` is clamped into the time's band (at dusk it is
the set sun's depression); `headlights: false` keeps the actors' lamps dark at dusk and night (a blacked-out column;
the default `true` is not written). An omitted field keeps the time's own sun: the map's authored bearing and the time's
default elevation. `setTimeOfDay(time)` keeps a bearing override and the headlights choice and drops an elevation override (each time
has its own band); `setTimeOfDay(time, light)` and `load()` set both. `state()` writes `light` only while an override exists
and reports the clamped values, so `load(state())` is identity. `getLight()` reports the rendered sun and the band.

Mars and the Moon keep their authored space lighting: every requested time renders `day` (`state()` and
`timeOfDay` report `day`; the requested time returns on the next terrestrial map). The `light` block still steers
their sun (elevation 8–60°). The volumetric cloud field keeps the weather offset and wind of the map's authored sun at
every time and under a moved sun, so a series of times or bearings shares one sky.

Changing the light re-keys or rebuilds everything derived from it, and a direct load matches a switch:

- the atmosphere's sky-view LUT and summary, the PMREM environment (`SkyEnvironmentCache` keys the sun, the preset
  and the atmosphere key), the horizon/fog colour cache, the baked cloud decks' sun rotation;
- the CSM key (direction, colour, intensity; every cascade re-renders), hemisphere, anti-sun fill and ground bounce;
- the horizon ring and far range (unlit, baked at build): their sun direction, key/ambient gains, sky and haze tints
  and an overall dim follow the time; the ring atlas's sun visibility (the ridges' cast shadows, also read by the
  terrain's ring bands) is re-baked from the ring geometry for a lower or moved sun; the terrain's wall sky light
  turns with the key;
- the volumetric cloud history and TAA restart, so a still or a film's first frame never blends the previous light;
- the vehicle readability floors scale with the light; dusk and night add a Studio-owned lamp pool (the world's
  authored windows, lamps and the actors' headlights; budget 4 spot / 2 point lights on desktop; the pooled lights
  run at 0.45 of their battle intensity at dusk and 0.7 at night, so pale snow and sand do not blow out).

**The night's camera** (2026-10-06, the skies lane; the review of the merge with PR #9: the six night takes read as
daylight under a starry sky). On the grounded light model the camera adapts to the light a frame receives — a recipe's
`exposure` sets only the legacy rig's level — and a moonlit field displayed at about a third of noon, the battle night's
level, the moon a hard key of 0.9 over it. The night recipe's `cameraEV` (−1.25, added to the map's own
`lighting.exposureEV`) holds the Studio night at an eighth to a quarter of the Studio day (overcast and snow maps at the
top of that range), the moon still the key with a moonlit shadow (`studioLight.selftest`). A scene's `picture.exposure`
stacks on top: the night takes' +0.3 to +0.6 EV were authored against the darker legacy camera and push a night back
toward day.

Aerial perspective, sun shafts, the lens flare and water read the live sun every frame. A return to the authored day,
a battlefield switch and Studio exit restore every mutated value exactly (the battlefield stays cached for battles).

**Panel.** The Battlefield section's **Time of day** select lists the seven times (a space map enables only Day).
The **Sun** compass is north-up like the tactical map (world +Z up, −X right): the orange dot is the sun (pale at
night), the blue wedge is the camera's bearing; drag around it or use the arrow keys (Shift = 15°). **Back** puts the
sun ahead of the camera (backlit subjects, bright rims), **Rim** 32° off that axis (rim light with the disc out of
frame), **Side** across the frame, **Front** behind the camera; **Map** returns to the authored bearing. **Height**
moves the sun inside the time's band; **Auto** returns to the time's default; **Headlights** toggles the actors'
lamps for dusk and night. Slider-rate changes coalesce to one apply; time changes run behind the loading cover. The
first dusk or night of a session compiles the lamp-lit material variants once (several seconds behind the cover).

**Scripting a backlit shot.** The camera bearing is `atan2(lookAt.x − pos.x, lookAt.z − pos.z)` in degrees; set
`light.sunAzimuthDeg` to it for a backlit hero, +32° for rim light, +180° for front light.

## Known limitations

- Cinematic quality changes only Studio output. The frozen composers
  (`firing_moment`, `explosion_moment`) add the cinematic one-shot layer
  backdated by `ageS` (no burning-wreck emitter; author a `tank_kill` on
  the timeline for that).
- One borrowed light serves flares: several simultaneous flares share it
  (the brightest wins), and the explosion light lights one sustained fire at
  a time; other fires glow through their decals and self-lit smoke.

- **Camo is per-spec**: two actors of the same tank id share one paint bake
  (`camo`/`camoSeed` of the most recent application wins). Different specs are
  fully independent.
- Wrecked and burning states do not run the combat simulation. They do not
  calculate damage or module state.
- The horizon treeline's thin skyline belts keep the shading baked under the
  map's authored sun; the ring itself, its far range, the ridge shadows and the
  terrain's wall sky light follow the Studio sun (see Light).
- The garage bay set-dressing physically exists at the map edge (−1500,−1500)
  and can be framed if you fly there.
- Studio `fire` shells collide with terrain only (props/tanks don't stop
  them). A standalone `tracer` stops at its authored `to` point.
- Engine smoke and burning effects with `timeScale > 0` use the current render
  cadence. The frozen composition path (`load`/`advanceFx`) remains deterministic.
- Video capture does not include audio and uses the browser's available MediaRecorder
  codec. Encoded bytes are not expected to be identical across browsers.
- Film exports carry combat sound only (no engine, track, ambience, machine-gun
  or radio beds), and the Node cinema masters stay silent (score them in the
  edit). Frames are reproducible for the same scene, settings, browser and GPU;
  encoded bytes depend on the browser's encoders.
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
- Transparent combat media (smoke, fire, flashes) are not in the depth buffer. The lens
  re-renders that layer at quarter resolution against depth planes at 0.8, 1.25 and 2 × the
  focus distance and bins its coverage (near / in focus / mid / far), so an in-focus muzzle
  flash stays sharp against the sky; within a bin the depth is approximate, and a pixel carries
  one CoC for the medium and the surface behind it.
- Volumetric cloud texels can differ by a few levels between consecutive captures of the same
  frame (temporal cloud history); byte comparisons should mask the sky.

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
