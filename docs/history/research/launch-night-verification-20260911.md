# Launch night verification — 2026-09-11

Runtime lighting owners match published `0f44a2648`; this change only rejects a
failed staged battle entry in the verification tool. No entry deadline changed.

Evidence is retained in this worktree's `.qa-dev/launch/`:

- `launch-night-matrix-r1`: failed on tablet Winter entry after 25 images.
  The actual game reported `Visible paint frame did not arrive within 1000ms`
  and returned to Garage. An empty roster previously satisfied the tool's wait.
  The failed receipt remains evidence of an intermittent entry problem.
- `launch-night-matrix-r2`: passed, 31 images, zero browser/console/cleanup
  errors. Independent critic reviewed every image: six day/night/day sequences
  across Verdant, Winter and Monsoon on desktop High and emulated tablet Mobile;
  Urban streetlamp, T-90 Shtora, headlight/window closeups, equipment damage and
  exact reset. Garage cleanup detached the night owner, removed all emitters
  and zeroed all three lights. Equipment applied once, with no duplicate geometry.
- `launch-cold-night-r1`: passed, three images reviewed at full resolution.
  First Urban/M1A3 battle in a fresh page was selected as night before entry;
  actual first covered battle render had the night owner attached and headlights
  active. One atmosphere preparation and one night-light preparation were
  observed. Reveal primed successfully in 41ms; return to Garage cleared lights.
  No browser/console/cleanup errors, no context loss or GL error. Backend:
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)`.
- `night-tool-entry-negative-r1.log`: maintained tool selftest passes, including
  a negative case executing the actual stage function against a swallowed entry
  failure; it rejects before waiting for visual readiness.

Both successful browser runs used the immutable private build with index SHA256
`f494916ce0010fae84d0f6c8c7d938909f6854e19cba051e0440c28cecde7e08`.
Cold means first battle in a fresh page, not a cache-disabled network download.
These checks qualify the staged lighting and cleanup, not physical tablet frame
rate, sustained performance, all maps, or the unresolved intermittent entry
failure. The initial ROLL OUT overlay partially obscures establishing views.
