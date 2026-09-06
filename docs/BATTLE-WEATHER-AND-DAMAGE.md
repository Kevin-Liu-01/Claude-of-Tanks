# Battle weather and cosmetic damage

This is a bounded presentation upgrade, not soft-body armor or a new terrain
destruction simulation. Gameplay collision, armor, modules, movement and spotting
remain authoritative and unchanged.

## Weather ownership

`battleWeatherPolicy.ts` derives a biome-compatible condition and day/night from a
salted match seed without advancing combat randomness. All catalog maps have an
explicit biome. Snow is restricted to cold maps; arid maps do not receive rain.
Solo uses the session battle counter (so its sequence repeats after a fresh page
load). Multiplayer uses the authoritative snapshot's `meta.weatherSeed`, including
reconnects. Older servers without that field retain authored map weather.

Atmosphere is prepared behind the existing deployment cover, before terrain and
final shader warm-up. The lazy access owner cancels stale preparation on return to
Garage. Sky, lights, fog baseline, unlit distant-horizon colors and vehicle
readability are restored on day rematches, cancellation and Garage return.
Night is a readable moonlit presentation, not a continuous sun/PMREM rebake.

Rain/snow share one reusable, texture-free instanced mesh. Shader motion requires
no per-frame particle arrays, attribute uploads or scene traversal. Preset maxima:

| Preset | Particles |
| --- | ---: |
| Low / mobile-low / unknown | 0 |
| Mobile / mobile-high | 64 |
| Medium | 128 |
| High | 384 |
| Ultra | 768 |

Intensity can reduce these counts. The hard maximum is one draw, 1,536 triangles
and 12,380 bytes of static geometry buffers. Quality changes update the instance
count without reallocating. Precipitation has normal depth testing, but no roof
occupancy, snow accumulation, puddles or traction changes. Fog is visual and does
not change authoritative visibility. Conditions are selected per match, not
continuously transitioned during combat.
Killcam/replay presentation suppresses precipitation so live particles do not
freeze on a paused simulation clock or obscure the x-ray analysis. Returning to
live battle restores the admitted particle budget; match lighting remains intact.

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

Focused selftests cover policy determinism and biome coverage; particle/resource
bounds; actual night shader uniform updates; old-server compatibility; snapshot
keyframes, deltas and reconnects; loading cancellation; exact Garage restoration;
equipment buffer/reset limits; and real destructible authority admission.

Run `npm run build`, then
`node tools/battle-weather-probe.mjs --out=/tmp/cot-weather-check --gate` for native
production screenshots and bracketed precipitation-off/on/off measurements in
frozen real battle scenes. The probe also captures an equipment bend and reset.
It rejects software rendering, GL errors, texture growth, more than one added
draw, and excessive incremental frame/CPU cost. It is a desktop measurement, not
certification of iPad hardware performance.

The starting main build already exceeds some existing phase-resource ceilings.
Those thresholds are not raised by this work. Use incremental native results and
the existing phase-resource probe together; a passing weather comparison does not
mean the game's overall resource budget is now satisfied. Full hull deformation,
soft-body physics and broader real-time fracture remain deferred pending headroom.

The native 1440×900 Apple M5 Max comparison used 600 frame requests per arm
after 120 warm frames. Rain, snow and night snow each added one draw and zero
textures; their median frame interval stayed 16.7 ms. Night's measured render-CPU
p95 increase was 0.6 ms against its bracketing controls. All three passed the
unchanged incremental gates with zero GL/page/console errors. An earlier short
night sample failed the CPU gate, which is why the committed probe uses longer
samples; these results are not a promise of identical timing on other hardware.
