# Battlefield, multiplayer, UI, and rendering improvement program

This is the durable implementation record for the improvement work requested
and completed during the August 17–18, 2026 development conversation. It
records the product outcome, the code and commits that delivered it, the
verification that was actually run, and the remaining hardware caveats.

## Status and scope

| Item | Status |
| --- | --- |
| Shipped baseline | `main` through `253b214f` (`fix(rendering): stabilize trunk shadow reception`) |
| Shipped change set | 24 focused implementation commits dated August 17–18, 2026 |
| Maps | 16 total: eight original battlefields plus eight new battlefields |
| Multiplayer target | 4-player and 7v7 authoritative rooms, including live moving-and-firing combat coverage |
| Final shadow follow-up | Landed as `253b214f`; implementation and evidence are described separately below |
| Evidence boundary | Browser/server automation and visual inspection were run locally; no physical iPhone or WAN certification was performed |

The program deliberately treats “perfect,” “no lag,” and “120 fps” as measured
targets rather than unconditional hardware promises. The observed evidence is
listed in [Verification and measured results](#verification-and-measured-results).

## Executive outcome

- Doubled the battlefield roster from eight to sixteen and regenerated the
  battlefield gallery as sharp WebP artwork.
- Brought the original eight maps onto the same modern destruction, structure,
  wreck, utility-network, decoration, placement, and shadow-quality systems as
  the new maps.
- Added 24 procedural building families, including 16 independently
  destructible hut, tent, shelter, and camp families with persistent debris and
  dedicated-server collision parity.
- Expanded armored wreck dressing and battlefield remnants, including hulls,
  turrets, track runs, wheels, and scattered vehicle pieces.
- Made utility destruction coherent: damaged poles, attached wires, and related
  pieces now participate in the same destruction event instead of leaving
  suspended cables behind.
- Added deterministic loose-prop motion for churns, drums, cones, trash cans,
  gas bottles, buckets, jerry cans, loose wheels, and related clutter. Props can
  be pushed repeatedly, rebound, transfer momentum, settle, sleep, and reset.
- Reworked garage and mobile UI, including the battlefield picker, tank dossier,
  local service record modal, battle controls, telemetry readouts, and minimap
  placement.
- Stabilized authoritative multiplayer for four players and 7v7, added host map
  selection, synchronized built-in camouflage, local-only custom camouflage,
  authenticated room chat, and durable invite-room membership while visiting
  the garage.
- Audited and improved shadow stability, LOD transitions, overlapping tank
  surfaces, canopy shadows, mobile rendering cost, and performance telemetry.

## Battlefield content and destruction

### Sixteen-map roster

The eight original maps remain available:

1. Verdant Fields
2. Sirocco Wadi
3. Frosthollow
4. Steinburg
5. Saltmere Bay
6. Amberford
7. Tarkhan Steppe
8. Cinder Junction

Eight new maps were added:

1. Frontier Basin
2. Nordhavn Fjord
3. Jade River Delta
4. Redrock Divide
5. Monsoon Ridge
6. Glacier Pass
7. Obsidian Caldera
8. Ironworks

Each new battlefield has its own terrain and visual identity rather than being a
palette swap. The original battlefields then received a deliberate backport of
the modern content families so the map selector does not divide the game into
“old” and “new” quality tiers.

### Map-quality changes

| Requested outcome | Implemented result |
| --- | --- |
| Eight more detailed maps | Added eight first-party battlefield modules and registered all sixteen in the runtime roster. |
| Upgrade old maps too | Backported modern destruction, structures, wrecks, loose props, utility networks, and placement rules to every original map. |
| More wrecks and destroyed tank parts | Expanded wreck composition with era-appropriate hulls plus detached turrets, tracks, road wheels, and scattered armored remnants. |
| Better destruction interaction | Added persistent structure debris, utility-network propagation, explosive chains, and repeated loose-body interactions. |
| Falling poles should pull wires down | Connected pole and wire state through `src/world/utilityNetwork.js` and its regression test. |
| More unique buildings | Added 24 procedural structure families; 16 hut, tent, shelter, and camp families are independently destructible. |
| More movable decorations | Added deterministic loose-prop families and map-specific clutter arrangements without turning every prop into a general-purpose rigid body. |
| Props should sit on terrain | Added terrain-footprint sampling and placement contracts so wide objects, poles, camps, and cover do not float or bury themselves on slopes. |
| Accurate anti-tank-cross hitboxes | Replaced coarse placement/collision assumptions with shape-aware obstacle data, including tighter anti-tank hedgehog beams. |
| Cones should not fly into space | Cones use a bounded 2.5D ground-contact model with zero accumulating vertical velocity and a hard planar-speed limit. |
| Sharp map pictures | Re-rendered all sixteen map images at full resolution and replaced the blurry legacy thumbnails with WebP assets. |

The primary implementation and proof points are under `src/world/`, especially
`maps/`, `structureKit.js`, `utilityNetwork.js`, `wrecks.js`,
`loosePropPhysics.js`, `propPlacement.js`, and their corresponding
`*.selftest.mjs` files. Dedicated-server world collision is kept in parity under
`server/`.

## Garage, dossier, and battle UI

### Garage

- Compacted the battlefield picker so its panel height follows its content
  instead of stretching to the maximum available height.
- Removed the extra descriptive map tags that made the new map list visually
  noisy.
- Redesigned the selected-tank dossier for clearer hierarchy, stat bars,
  ammunition, armor, gun handling, and equipment presentation.
- Moved the local service record out of the left rail and into a top-right modal
  that shows the complete device-local user statistics.
- Added a single-player custom-camouflage drawer below the built-in camouflage
  choices. It supports palette and repeat controls and is intentionally stored
  and applied only on the local device.

### Mobile battle HUD

- Hid the controls toggle shown at battle start.
- Removed the top-left Garage button and moved the minimap up into the freed
  safe-area space.
- Added top-right Sound, Graphics, and Settings controls. The Graphics control
  cycles quality levels directly.
- Added FPS and ping readouts below the top-right control row.
- Moved ammunition selection above the equipment buttons.
- Removed the handbrake button and presented speed as an explicit `km/h` readout
  beside the remaining driving controls.

### Diagnostics UI

The engineering dashboard exposes runtime, renderer, quality, shadow, scene,
memory, and network telemetry through `window.__DEBUG.telemetry()` and the
opt-in HUD. The COT Shadow Saver recovery path can remain active silently, but
its redesigned UI is mounted only when the URL explicitly requests diagnostics,
for example `?diag=1`. This keeps recovery available without showing developer
controls to normal players.

## Multiplayer

### Authority and synchronization

The multiplayer work preserves the existing authority boundary: the dedicated
match owns hits, damage, reloads, spotting, and results. Player IDs remain
separate from vehicle spec IDs, so duplicate vehicle picks are valid. Network
snapshots, prediction, presentation queues, room state, and server collision
were exercised at both small-room and 14-player scale.

### Player-visible additions

| Feature | Result |
| --- | --- |
| Four-player rooms | Stabilized interpolation, prediction, snapshot delivery, and rendered presentation; added a four-player soak command. |
| 7v7 | Added 14-client capacity and sync coverage with seven players per side. |
| Live combat test | Added a real browser/server battle test in which all 14 tanks move, aim, fire, damage targets, and traverse the map. |
| Host map selection | Private/LAN hosts choose the battlefield and the authoritative room propagates it to every player. |
| Selected tank camouflage | Built-in camouflage selections travel with private and ranked rosters and are rendered for remote tanks. Pattern textures are shared and prewarmed by vehicle-pattern variant. |
| Local custom camouflage | Repeat and palette editing is available in solo play only; it is not serialized into multiplayer. |
| Room chat | Added authenticated in-room chat with team/self presentation and desktop/mobile layouts. |
| Invite join flow | A guest entering through a room link can return to the garage without losing room membership; only an explicit leave exits the room. |
| Garage join glitch | Removed the invite-guest transition that discarded or visually detached the active private-room state. |

The main commands added for this work are:

    npm run test:net:four
    npm run test:net:seven
    npm run test:net:seven:live
    npm run test:net:entry
    npm run test:net:render

The live test is not a packet-only simulation: it launches the actual browser
and server path and drives moving, firing tanks. It is still a local-network
test harness, not proof of every real-world WAN route.

## Rendering, shadows, and performance

### Artifact fixes

The rendering pass addressed the reported screen tearing symptoms, Z-fighting
and texture flicker, LOD popping, clipping/culling transitions, shadow crawl,
overlapping tank-surface shadow flashes, and expensive mobile shadow work.
Specific changes include:

- Snapped CSM cascade projections to their actual texture grids so camera motion
  does not continuously shift shadow samples.
- Removed frame-varying shadow filter phase and kept near cascades updating
  consistently during adaptive-quality pressure.
- Added LOD hysteresis so camera movement around a distance boundary does not
  rapidly swap models.
- Prevented coarse vehicle shadow proxies from self-shadowing visible tank
  geometry where the proxy overlaps the rendered surface.
- Replaced alpha-tested tree-card shadow casting with small opaque canopy shadow
  proxies. This retains broad crown shade without high-frequency cutout shimmer.
- Reduced mobile shadow, vegetation, and remote-tank cost while preserving
  close-range detail.
- Expanded performance, device, map-shadow, and render-stability telemetry so
  the quality governor can be evaluated from evidence rather than screenshots
  alone.

### Shadow design rule

High-contrast CSM projections are useful on broad, stable receivers such as
terrain and building masses. They are intentionally avoided on thin,
alpha-tested, co-planar, or proxy-overlapped receivers where tiny camera and
cascade changes turn the contrast into flashing. Those surfaces retain form
through direct light, normals, ambient occlusion, and stable low-frequency
shadow proxies.

The rule is not “make every shadow faint.” It is “reserve high contrast for
surfaces that can hold it temporally.”

## Verification and measured results

The change set was checked with focused self-tests, the complete Node-runnable
suite, production builds, live browser automation, screenshot inspection, and
instrumented render probes.

| Verification | Result |
| --- | --- |
| Complete self-test suite | `npm test` passed after the rendering work. This includes world quality, structures, utilities, wrecks, loose props, collision, placement, network, simulation, UI, and shadow-stability coverage. |
| Production bundle | `npm run build` passed. |
| React/Three.js review | React Doctor reported no changed-scope issues; its repository-wide score remained a pre-existing 73. |
| Four-player sync | Local authoritative browser/server soak passed with moving rendered clients. |
| 7v7 sync | Fourteen-client capacity and synchronization test passed. |
| 7v7 live combat | Fourteen moving and firing tanks completed the live battle path with damage and authoritative state propagation. |
| Render stability | Desktop and mobile graphics presets were driven while checking frame timing, WebGL/shader errors, cascade state, and visual continuity. |
| Map shadows | All sixteen maps were audited across the graphics presets; the marginal Foundry mobile-low contrast result was resolved by the final follow-up below. |
| 60-second mobile-balanced probe | Median 163.9 fps, p5 131.6 fps, p99 116.3 fps, maximum 896 draw calls, zero console errors, and approximately 0.19 MB/s retained-heap growth. |
| Quick mobile-high probe | Median 185.2 fps in the local browser harness. |
| Quick mobile-low probe | Median 196.1 fps in the local browser harness. |
| Real-entry probes | Normal and CPU-4-throttled entry runs completed with zero freezes and zero long tasks. |

These fps values are local browser measurements on the development machine.
They establish 120-fps headroom in that harness; a physical iPhone can still be
limited by Safari/ProMotion cadence, thermals, device tier, or display policy.

## Commit ledger

All entries below are on `main` through the shipped baseline.

| Commit | Change |
| --- | --- |
| `ddae0965` | `feat(world): expand battlefield quality and destruction` |
| `61cd1d36` | `feat(world): backport modern destruction to legacy maps` |
| `9db744c7` | `feat(debug): add map shadow telemetry` |
| `d33b1594` | `feat(world): add destructible structure diversity` |
| `cb2199d4` | `feat(world): add persistent loose prop physics` |
| `05706c68` | `fix(ui): compact battlefield picker` |
| `c29c0df0` | `feat(ui): redesign garage dossier and service record` |
| `aceddcc8` | `fix(world): ground props and tighten hitboxes` |
| `b3d9e60d` | `feat(multiplayer): stabilize four-player sync` |
| `9500f4ec` | `test(multiplayer): certify seven-versus-seven sync` |
| `72d1e46a` | `test(multiplayer): certify live seven-versus-seven combat` |
| `a98d0606` | `feat(multiplayer): sync maps and player camouflage` |
| `b4a5510f` | `fix(world): keep traffic cones grounded` |
| `a32e8270` | `feat(multiplayer): add authenticated room chat` |
| `a206953f` | `fix(multiplayer): keep invite guests in rooms` |
| `8ccb5617` | `fix(rendering): stabilize shadows and visual transitions` |
| `ef6535dd` | `feat(mobile): reorganize battle HUD controls` |
| `3ff96667` | `fix(rendering): keep adaptive shadows temporally stable` |
| `ffcd7aa3` | `fix(rendering): stop shadow filter phase flashing` |
| `6f7be03d` | `fix(vehicles): stop proxy self-shadow flashing` |
| `387788d8` | `fix(ui): raise mobile minimap` |
| `b00cae4f` | `fix(rendering): stabilize tree canopy shadows` |
| `b6ce0de5` | `perf(rendering): certify mobile battle at 120 fps` |
| `253b214f` | `fix(rendering): stabilize trunk shadow reception` |

## Final trunk-shadow follow-up

The final trunk-shadow audit landed as `253b214f`. Its changes are:

- `src/world/vegetation.js`: near and far trunks continue to cast ground
  shadows but no longer receive coarse canopy/self-shadow projections. Bark
  retains direct-light and normal-mapped form shading.
- `tools/render-stability-audit.mjs`: audit schema v4 now requires trunk shadow
  casters to exist and requires trunk shadow receivers to be zero.
- `src/world/maps/foundry.js`: raises Foundry's directional sun intensity from
  3.25 to 4.0 so its hazy mobile-low presentation clears the map-shadow contrast
  contract without removing the authored fog, cloud, or hemisphere fill.

Validation already performed on this follow-up:

- Render-stability audit passed all four desktop and three mobile presets while
  driving a tank approximately 45–48 meters; frame p50 remained about 16.7 ms,
  with no shader or WebGL errors.
- The live scene reported six trunk shadow casters and zero trunk shadow
  receivers.
- All-map shadow sweeps passed; after the Foundry adjustment its mobile-low
  changed-pixel luma moved from 3.95 (below the 4.0 contract) to 4.3.
- `npm test` and `npm run build` passed.

Transient evidence lives under `.qa-dev/` and is intentionally untracked. It is
not a release asset and must not be staged wholesale.

## Durable design decisions and caveats

1. Simulation remains fixed-step at 60 Hz even when rendering exceeds 60 fps.
2. Authoritative randomness remains seeded; network and simulation logic do not
   gain wall-clock or `Math.random()` dependencies.
3. Custom camouflage remains device-local and solo-only until a moderated,
   bandwidth-bounded multiplayer representation is deliberately designed.
4. Remote built-in camouflage is prewarmed and shares textures; it must not
   create per-frame materials or texture uploads.
5. Loose-prop physics stays purpose-built and bounded. A full rigid-body engine
   would increase CPU and synchronization cost for little gameplay value.
6. Shadow stability takes priority over high-frequency projected detail on
   thin or overlapping geometry.
7. “120 fps ready” means measured headroom in the browser harness, not a promise
   that every browser/device combination will expose a 120 Hz presentation
   cadence.
8. The local live multiplayer tests validate real clients, movement, firing,
   damage, rendering, and server authority. WAN latency, packet loss, and mobile
   radio transitions still need physical multi-device acceptance testing before
   an unconditional production-network claim.

## Source ownership map

| Area | Primary paths |
| --- | --- |
| Map definitions and roster | `src/world/maps/`, `src/world/map.js`, `src/world/mapQuality.selftest.mjs` |
| Buildings and destruction | `src/world/maps/structureKit.js`, `src/world/structureKit.selftest.mjs`, `src/world/destructibles.js`, `src/world/props.js` |
| Wrecks and vehicle remnants | `src/world/wrecks.js`, `src/world/wrecks.selftest.mjs` |
| Poles and wires | `src/world/utilityNetwork.js`, `src/world/utilityNetwork.selftest.mjs` |
| Loose props and cones | `src/world/loosePropPhysics.js`, `src/world/loosePropPhysics.selftest.mjs` |
| Placement and hitboxes | `src/world/propPlacement.js`, `src/world/collision.js`, `server/dedicatedWorldCollision.js` |
| Map artwork | `public/maps/`, `tools/map-thumbs.mjs` |
| Garage and dossier | `src/ui/garage.js` |
| Mobile HUD | `src/ui/touchControls.js`, `src/ui/hud.js`, `src/ui/settings.js` |
| Room setup and chat | `src/ui/playMenu.js`, `src/ui/roomChat.js`, `src/net/`, `server/` |
| Camouflage policy | `src/vehicles/camoPolicy.js`, tank materials, room roster serialization |
| Lighting and shadow stability | `src/engine/lighting.js`, `src/engine/shadowStability.js`, `src/engine/post.js` |
| Performance and visual audits | `tools/render-stability-audit.mjs`, `tools/map-shadow-audit.mjs`, `tools/multiplayer-render-perf.mjs` |
| Multiplayer acceptance | `tools/multiplayer-four-player-soak.mjs`, `tools/multiplayer-live-combat.mjs`, `tools/multiplayer-guest-entry.mjs` |
