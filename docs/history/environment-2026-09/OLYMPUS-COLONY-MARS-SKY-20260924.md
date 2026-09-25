# Olympus colony and Mars atmosphere — 2026-09-24

Owner request: every map in Mars mode should use Olympus Basin's galaxy sky,
and Olympus should contain a fuller aerospace research settlement.

## Behavior

- The original Olympus galaxy, planet, nebula, dust cloud, fog and lighting
  recipe now has one shared owner, `src/engine/marsAtmosphere.ts`.
- Mars mode applies that recipe to every one of the 31 maps, even when the
  match seed would normally select terrestrial night. Normal play and Garage
  return restore the authored map presentation. Same-map mode changes
  invalidate the preparation cache; repeated identical preparation stays inert.
- Solo selected launches and private-room handoff retain the selected map.
  Campaign operations retain their map override; seeded Random keeps its
  existing deterministic rotation. Existing Mars rules are unchanged.
- Olympus gains 24 reserved facilities arranged as command/science, crew,
  landing/rover and power/supply districts. Four new shared metal kits provide
  mission control, pressure greenhouses, ascent landers and rover garages.
  Existing habitats, domes, solar arrays, relays and tanks complete the sites.
- Native capture contains 36 orbital structures versus eight in the baseline.
  Terrestrial camping, cars and yard clutter are reduced. Terrain, roads,
  spawns and the three tactical lane anchors retain their authored settings.

## Geometry and runtime costs

All structures use the existing instanced material, collision and destruction
owners. No new light, transparent rendering pass, texture family or steady-frame
update is introduced. Connected assemblies are certified before merging.

| New kit | Intact triangles | Connected parts |
|---|---:|---:|
| Mission control | 704 | 54 |
| Greenhouse | 1,648 | 35 |
| Ascent lander | 980 | 37 |
| Rover garage | 792 | 66 |

The structure collision audit covers all 123 families, retains its fidelity
floor and 64-part collision bound, and reports a minimum 91.7/100 with at most
62 collision parts. The original 26-family intact/debris geometry and RNG hash
is unchanged. New windows and beacon masks have independent aperture checks.

The final Olympus server shard contains 768 movement records, 716 shell
records and no concealers, replacing 848/732/0. Its native export is 519,066
bytes, within the unchanged 669,259-byte storage ceiling. All other collision
shards remain byte-identical. A regression check requires each of the 24
planned sites to have matching movement/shell cover and working destruction;
intentional spaces between paired fuel tanks remain empty.

The textured minimap was baked through `tools/bake-minimap-assets.mjs --maps
mars` at its original 440×440 resolution (63,702 bytes).

## Verification and acquisition

Baseline: `7c1785f6494341696ea7be400ca641c1e96f4f7f`.
Worktree: `cot-mars-settlement-20260924`.

- All-map Mars preset, idempotence, reset and solo/private selection tests pass.
- Atmosphere access, weather policy, world activation, map quality, settlement
  support/spacing, structure connectivity, collision and fixture checks pass.
- Dedicated-world native census, all-map codec round trips, destruction checks,
  and loading-screen/minimap asset checks pass.
- Full TypeScript and unused-code checks pass.
- Public production build, localization validation and asset stripping pass.

Local review artifacts are retained under `.qa-dev/mars/` and are not bundled
into the game. `before/` and `release/` contain 1440×900 matched colony, landing
and overview captures from the deterministic battlefield shot path. All 24
planned positions were checked against the live world's minimap features.
`final/verdant-mars.png` and `final/winter-mars.png` show the shared sky on two
terrestrial maps; actual sky uniforms are galaxy 1.9 and nightSky 1. Page error
logs for the successful reviews are empty.

The single overview renderer snapshots were 562 calls / 2,772,447 triangles
before and 532 / 2,696,011 after. These are bounded scene observations, not a
frame-time or device-performance benchmark. No live multiplayer or physical
mobile-device certification is claimed.

Initial cold map-view probing timed out during entry, and a session-based
manifest export failed to retain the review browser. Those attempts remain in
local logs. Successful visual reviews used fresh agent-browser sessions;
collision data was exported by the committed headless capture tool. Captures
held both shared probe/capture leases and used unchanged source during each
acquisition. The final collision export changes only the Mars shard and index.
