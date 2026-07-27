# terrain_environment r2 — handoff to other module owners

World-side fixes for all r2 critique items are done inside `src/world/`.
Two remaining sub-items belong to other modules:

## 1. Tank track decals (fx / vehicles) — critique: "player tank leaves no track decals"

The road system now has proper twin ruts, but the tank itself should spawn
fading tread-mark decals. Suggested implementation (fx module):

- Pool ~64 quad decals (two 0.7 m-wide strips per sample, spaced to the tank's
  tread gauge, oriented to hull yaw), spawned every ~1.5 m of travel when
  `world.heightField.getGroundType(x, z) !== 'hard'`.
- Conform each quad to `world.heightField.getHeightAt` (+0.04 m lift),
  `polygonOffset` like the ground decals in `src/world/props.js`
  (see `addDecalMesh` there for working material settings), dark brown
  (multiply toward 0.55 luminance), alpha fading over ~30 s, oldest reused.
- IMPORTANT: any alpha-blended or alpha-tested quad near the ground MUST set
  `mesh.userData.aoExclude = true` or GTAO's override prepass renders it as a
  solid dark rectangle (see `src/engine/post.js`).

## 2. Fog quality (engine/sky) — critique: "single weak fog, left-edge glow smear"

- Current `FogExp2` is fine structurally, but a subtle blue-shift with distance
  would add atmospheric-perspective layering: consider lerping the fog color
  ~8% toward `#9db4d4` and raising density slightly for camera heights < 10 m.
- The whitish glow on the left horizon of `battlefield.png` is the sun-disc
  bloom/fog readback near the horizon band in `sky.js` — worth masking or
  clamping the horizon fog color readback near the sun azimuth.

## 3. White midfield specks (vehicles) — critique: "scattered single white pixels"

Isolated by elimination (persist with ALL props hidden and grass hidden; not
mud specular; not world geometry): they sit exactly where distant ENEMY TANKS
are parked and match the bright white hull-number decals (e.g. "B-24") seen in
tank_closeup shots. At 200-400 m those white markings resolve to single blown
pixels. Fix in the vehicles module: darken the marking albedo to ~0.65 gray,
or fade the decal layer out beyond ~120 m.

## Note for all modules

`window.__GAME_READY` path unchanged; world API surface unchanged
(`createMap` returns the same World shape). New world behaviors:
- `world.update(dt, camPos)` now also rebuilds a camera-centred grass carpet
  when the camera moves >7 m (deterministic, cached per 14 m cell).
- Tree LOD swaps at 260/290 m as before, but far LOD is opaque lobe geometry.
