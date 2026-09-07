# Battle day/night and cosmetic damage

This is a bounded presentation upgrade, not soft-body armor or a new terrain
destruction simulation. Gameplay collision, armor, modules, movement and spotting
remain authoritative and unchanged.

## Day/night ownership

Randomized rain, snow and fog have been removed. `battleWeatherPolicy.ts` now
selects only day or night, without advancing combat randomness. Descriptor
version 2 always has `condition: 'clear'`, `precipitationIntensity: 0`, and cloud
and fog multipliers of 1. The legacy function, descriptor and `weatherSeed` names
remain for compatibility; the existing day/night hash, salt, 20% night threshold
and uint32 seed normalization are unchanged. All catalog maps retain an explicit,
validated biome.

Solo uses the session battle counter, so its sequence repeats after a fresh page
load. Multiplayer uses the authoritative snapshot's `meta.weatherSeed`, including
seed zero and reconnects. Only that seed is sent on the wire, not the local
descriptor version. Older servers without the seed retain the authored map
presentation. Replay/killcam retains the current match lighting; it does not
select another condition or advance a day/night cycle.

Atmosphere is prepared behind the existing deployment cover, before terrain and
final shader warm-up. The lazy access owner cancels stale preparation on return to
Garage. Sky, lights, fog baseline, unlit distant-horizon colors and vehicle
readability are restored on day rematches, cancellation and Garage return.
The existing moonlit night presentation is retained: hemisphere intensity .28,
fill intensity .12 and vehicle readability scale .12. No vehicle-lamp upgrade,
geometry change or new lighting-shader optimization is part of this removal.
Authored cloud opacities and fog density remain intact at night as well as day;
night still applies its existing sky/light/fog/cloud colors and distant-horizon
dimming. Winter terrain, authored map clouds and atmospheric fog are not the
removed precipitation feature.

The atmosphere API is now `prepare(seed, mapId)`, `reset()` and runtime
`dispose()`. There is no precipitation module, pool, quality budget or atmosphere
frame-update hook. The existing covered sky/environment application is unchanged;
day/night is fixed for the match, not a continuous sun or PMREM update.

## Deformation and destructibles

`equipmentDamage.ts` opts in existing thin ammo-can lids only. An accepted hit
can bend the nearest eligible lid at most 0.10 radians / 4 cm. It does not reshape
armor, change receipts or alter the authored rest model. Only explicitly marked
equipment is eligible; many tanks currently have no eligible parts.

Limits are eight lids per tank and eight affected tanks globally. Each lid has
36 existing vertices; first contact saves at most 864 bytes of positions/normals.
There are no extra meshes, materials, draws, physics bodies or frame-loop work.
Repeated contacts cannot progressively damage neighboring lids. Reset/disposal
restores exact geometry and releases saved state; Garage and pooled FX resets
use the same cleanup path.

Maps already support destructible objects and pooled debris. Cosmetic shell FX
now skip any prop registered as authoritative/collidable cover. Authoritative
destruction still uses the explicit destruction path. This prevents a client-only
impact or drum cascade from removing cover that the simulation still considers
solid. This change does not add fully destructible terrain or arbitrary building
fracture.

## Verification

Focused selftests cover clear-only selection and literal legacy day/night seed
fixtures; all-map biome coverage; unchanged night settings and authored cloud/fog
preservation; no precipitation resource or frame owner; old-server compatibility;
snapshot keyframes, deltas and reconnects; loading cancellation; exact Garage and
horizon-material restoration; equipment buffer/reset limits; and real destructible
authority admission.

Run `npm run build`, then
`node tools/daynight-atmosphere-probe.mjs --out=/tmp/cot-daynight-UNIQUE --gate`
with a fresh, nonexistent output directory. It checks native production
day/night/day presentation on three maps, including seeds that formerly selected
rain, snow and fog, on desktop High and emulated-tablet mobile quality. It also
retains equipment bend, duplicate-hit, reset and Garage checks. Software rendering,
page reloads, context loss and runtime errors fail the probe. Screenshots and state
receipts do not certify performance, memory stability or physical iPad/Safari
behavior. The retired precipitation-only probe is no longer runnable.

Garage restoration compares normal authored entry before battle with normal
entry afterward. The probe also records cold boot separately: the existing
sealed Verdant fast-boot path skips preset activation and uses the sky's .42
far-cloud opacity, whereas its authored Garage entry uses .6. That inherited
initialization difference is not changed or claimed pixel-identical here.

The day/night-only R2 native run completed on 2026-09-07 at 01:20:43 UTC:
Chrome 151 / native ANGLE Metal on Apple M5 Max, desktop High at 1440×900
DPR 1 and emulated-tablet mobile quality at 1180×820 DPR 2. All six map/tier
cases and 21 completed-render screenshot receipts passed, including exact
daylight and authored Garage restoration, former weather seeds, unchanged
camera/vehicle pose, and equipment position/normal/bounds restoration. There
were no page errors, console errors, reloads, context losses or cleanup errors;
the owned browser and preview server stopped. Desktop Verdant day/night and
tablet winter-night/Monsoon-day captures were visually reviewed. This run did
not measure frame-time or memory deltas.

Local evidence: `/tmp/cot-daynight-only-native-r2/report.json`, production
entry SHA-256 `fb0f27e5313299c183b328c353aad1df3c11284e9c8205a90c21534789c839b0`,
acquisition SHA-256 `c13a151e86e63e377ecc92079c0f943a21ff85d1eceb9dd37593f61218422fbc`.
The initial R1 failure remains separately recorded: its desktop battle and
equipment checks passed, but its invalid cold-boot-to-authored-Garage comparison
caught the inherited .42/.6 difference described above. R2 uses matched real
Garage lifecycle entries without changing runtime or relaxing exact restoration.
Focused runtime/probe/registry/import tests, typecheck with core-unused checks,
strict complexity gates, changed-source diagnostics and the public build passed.

The starting main build already exceeds some existing phase-resource ceilings.
Those thresholds are not raised by this work. Use the existing phase-resource
probe separately; a passing day/night presentation check does not
mean the game's overall resource budget is now satisfied. Full hull deformation,
soft-body physics and broader real-time fracture remain deferred pending headroom.

Historical evidence before weather cancellation: the native 1440×900 Apple M5 Max
comparison used 600 frame requests per arm
after 120 warm frames. Rain, snow and night snow each added one draw and zero
textures; their median frame interval stayed 16.7 ms. Night's measured render-CPU
p95 increase was 0.6 ms against its bracketing controls. All three passed the
unchanged incremental gates with zero GL/page/console errors. An earlier short
night sample failed the CPU gate, which is why the committed probe uses longer
samples. These are historical precipitation results, not validation of the current
day/night-only build or a promise of identical timing on other hardware.
