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

PNG exports use the selected native frame dimensions. Browser video recording
uses the current canvas ratio and is silent. For deterministic HD films, native
portrait/square artwork, synchronized original sound design and reviewed public
campaigns, follow [Campaign production](MEDIA-PRODUCTION-CAMPAIGNS.md).

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
__STUDIO.setCamera(cfg) / .getCamera()
__STUDIO.setPicture(patch) / .getPicture()          // film-grade picture (see "Picture")
__STUDIO.pictureInfo({width, height}?)              // focal length, focus, mattes, stages
__STUDIO.PICTURE_PRESETS                            // [{id, label}] named looks
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
  "timeScale": 0,               // post-load time scale (default 0 = stay frozen)
  "picture": { "preset": "cinematic", "letterbox": "2.39",
               "dof": { "enabled": true, "focusActor": "hero", "fStop": 2.8 } }
                                // optional; omitted = the neutral house picture
}
```

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

## Picture

Film-grade picture settings for stills and films (media r5): a named look plus overrides for
exposure, white balance, a display grade, hue secondaries, HDR highlights, a thin-lens depth of
field and a finishing pass. Schema and looks: `src/game/studioPicture.ts`; passes:
`src/engine/cinemaPost.ts`; panel: `src/ui/studioPicturePanel.ts` (the **Picture** section of
the Cinematics group).

**Neutral is the house render.** A stage with neutral values inserts no pass, so a scene without
`"picture"` (or with `{"preset": "natural"}`) renders byte-for-byte as before and `state()` omits
the key. Everything is removed from the composer on Studio exit; battle never loads the module.

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
| `streaks` | `amount` 0…3, `threshold` 0.5…32 (linear HDR), `length` 0…1, `tint` | amount 0 | Anamorphic horizontal streaks from hot pixels. |
| `halation` | `amount` 0…3, `threshold` 0.1…16, `radius` 0.25…4, `tint` | amount 0 | Red-orange film glow around bright edges (σ = 0.45 % of frame height × radius). |
| `sunShafts` / `lensFlare` | `mode` auto/on/off, `intensity` 0…4 | auto, 1 | Force or scale the round-69 light effects (works on presets that disable them). |
| `dof` | see below | `enabled: false` | Thin-lens depth of field. |
| `chromaticAberration` | 0…1 | 0 | Radial lateral fringe, edge-weighted (r²), spectral taps. |
| `vignette` | `amount` 0…1, `roundness` 0…1, `softness` 0…1 | amount 0 | Linear-light lens falloff (roundness 1 = circular in pixels). |
| `grain` | `amount` 0…1, `size` 0.5…4, `color` 0…1, `response` 0…1 | amount 0 | Luma-weighted film grain; size in px at 1080 lines (scales with the output). |
| `letterbox` | `none`, `2.39`, `2.00`, `1.85` | none | Black mattes in whole pixels against the output aspect (pillarbox when narrower). |

`dof`: `enabled`, `focusActor` (actor name, uid or index; follows the actor every frame at
0.55 × its height, measured along the optical axis), `focusDistance` (0.5…5000 m, used when no
actor), `focusOffset` (−50…50 m), `fStop` (0.7…32), `sensor` (`super35` 24.89 mm,
`fullframe` 36 mm, `alexa65` 54.12 mm, `imax` 70.41 mm — the long side, mapped to the frame's
longer axis), `anamorphic` (0…1: oval bokeh up to 2:1), `bokehScale` (0…8, default 1).

Lens physics: focal length `f = (sensorLong / 2) / tan(longFov / 2)` from the live camera FOV;
signed circle of confusion `c(d) = f² / (N (s − f)) · (d − s) / d`, as a fraction of the frame's
long side so 4K and 1080p defocus identically. Studio renders it × `PICTURE_DEFOCUS_GAIN` (16):
on Studio's wide lenses a strict thin lens is near hyperfocal (f/2.8 on a 40° Super 35 frame
focused at 12 m blurs the horizon by < 1 px); with the gain that frame gives a ~6 px-radius
background at 1080p while f/11 stays near-sharp. `bokehScale: 0.0625` is strictly physical.
The gather runs at half resolution with near/far separation (far samples never wider than the
centre's CoC, so focused edges neither bleed into nor get smeared by the blur behind them; the
near field is dilated through a tile max so a blurred foreground spreads over the subject), a
bilateral full-resolution composite, and the sky at infinity. The radius is capped at 1.6 % of
the long side. Live preview gathers 81 taps; `capture()` uses 225. Smoke, fire and flashes are
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
| `night-ops` | Cool moonlight; firelight still burns orange; strong streaks. |
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
