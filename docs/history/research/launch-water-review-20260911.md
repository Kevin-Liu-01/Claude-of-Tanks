# Launch water review — 2026-09-11

Polders' warm daylight made the shared mustard marsh pigment read as soil.
Its own profile now changes only color to `0x3d625b`, opacity to `.62` and
roughness to `.30`. Depth, flow, geometry, shaders and Mangrove remain unchanged.

Evidence retained in this worktree's `.qa-dev/launch/`:

- `polders-palette-r1`: five identical-scene before/control/candidate pairs.
  Every control had zero changed RGBA bytes. Every candidate changed pixels;
  geometry/texture/program counts stayed identical within each pair, with no
  GL errors. Independent critic inspected all ten before/candidate images at
  full resolution and approved the scoped daylight material change. The old
  experiment records launch options but does not attest its unmasked backend;
  the maintained probe now requires and records hardware WebGL explicitly.
- `water-focused-r1.log`: shallow water, shoreline camera, environment shot
  camera, and native Mangrove palette preservation tests pass. The latter
  verifies unchanged physics/resources and the other 29 maps' profiles.
- `water-type-private-build-r1.log`: type check and private build pass.
- `polders-built-r1`: actual built source captured at all five shoreline views,
  reviewed at full resolution; green water/ripples and continuous banks remain
  visible. No page errors or structural quality failures. Actual backend was
  Apple M5 Max via ANGLE Metal, with no context loss. Private index SHA256:
  `46270174e6198d1962d3beccab971d485c640bf6b52590ee0d100a4b834fe113`.
  The short, contended timing sample is not performance qualification.

The environment tool now supplements old matched views with a dry-bank camera
for each configured water body. Targets require actual wetness, a broad flat
neighborhood, clear terrain sightline, and membership in that body's conservative
inscribed shoreline core. Missing views remain explicitly unresolved. Tests
reject dry centers, steep masked terrain, and a neighboring pond falsely standing
in for the requested body. This does not certify prop occlusion or visual quality.
The older synthetic dust-port exercise is explicitly labeled as synthetic; it
does not prove a moving tank's wake or ground/water contact.

Full-water art acceptance remains open. `water-shores-r1` and `water-shores-r2`
were reviewed (9 and 167 images); their old selector could choose neighboring
water, so they cannot certify individual-body coverage. Corrected `water-shores-r3`
resolves all four Saltwind and five Polders bodies inside their own cores.
Open findings include Monsoon's stretched road-cut wall, tall green perimeter
walls at Saltwind/Autumn, yellow/tan channels on Delta/Autumn/Monsoon/Mangrove,
repeated scalloped river banks, and Coastal's distant horizontal strip. Authored
partly submerged fallen stone bridge slabs are not accidental floating plates.
No all-water, all-map, night-water, physical-device or sustained-FPS pass is claimed.
