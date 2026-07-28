# Carryover — items NOT applied by the round-1 verifier (2026-07-28)

Everything else in the nine fresh `*-r1.md` handoffs (camo_spotting,
content_breadth, controls_gunnery, effects_combat, gameplay_feel, hud_ui,
killcam_shotinfo, lighting_post, performance_budget) was applied and verified:
harness green (exit 0, zero console errors, all 16 PNGs reviewed), selftests
at documented baseline (movement 2/28 pre-existing synthetic-field failures,
combat 233, spotting 90, ai.aim pass), and the NEW `tools/gunnery_gate.mjs`
passes at 100% (12/12 settled shots <=350 m hit tanks; min 80%). The items
below were too large, explicitly optional, or conditional — they carry
forward.

## 1. Deferred from this round's handoffs

- **content_breadth §4 (MAJOR half)** — winter foreground birches:
  `src/world/vegetation.js` needs 2-3 twig/branch card texture variants per
  birch (seeded rng pick), per-tree card rotation + 0.85-1.2 scale jitter,
  and trunk tone jitter (0.9-1.0 luminance + lenticel banding) so white
  trunks stop matching snow albedo.
- **content_breadth §5 (minor, non-blocking)** — `src/world/terrain.js`
  `makeSandstoneLayer`: vertical erosion-noise domain warp on authored bed
  boundaries + sparse talus speckle below cliff shoulders. Evaluate the
  shipped desert shot first.
- **content_breadth §6 (minor)** — `src/world/props.js`: per-instance facade
  masks + 1-2 extra roofline silhouettes; urban boulders need flat-shaded
  facet normals or scale clamp <=1.6 m.
- **content_breadth §2 (second half)** — the `garage_community_chip` capture
  tool should wait on `window.__GLB_STATS` (started === settled) instead of a
  fixed settle. The RUNTIME half is applied: the garage pedestal now hides
  the procedural stand-in and reveals when the in-place GLB swap settles
  (src/main.js setPedestalTank; do NOT dispose/re-create mid-swap — it races
  three's compileAsync material poll).
- **gameplay_feel §2 follow-up** — cameraRig `enterSniper` KEEP branch
  (aimDist >= 50 m): run the same pitch raise-loop after BOTH branches
  whenever the trunnion ray hits inside ~25 m (arcade-orbit parallax drop can
  land the re-derived ray on a slope ~20 m out). The short-aim branch loop is
  applied.
- **gameplay_feel §4 (minor)** — hero rocks (`src/world/props.js` ~line
  1220): icosahedron detail 3 + 2-octave noise displacement + hard-facet
  normals for the two near variants. Horizon comb parallax impostors above
  ~x4 zoom (partially addressed by the applied hud_ui lobed-canopy +
  conifer-aspect texture rework and the scoped impostor→mesh corridor
  promotion in vegetation.js).
- **lighting_post §2/§3 (optional, conditional)** — only if the next critic
  still flags them: terrain.js dark-clover mix cap `(0.14 + 0.08*n1)` →
  `(0.10 + 0.06*n1)` (~line 1240); materials.js barrel/gun-metal roughness
  floor +0.05 if the tube highlight still clips.
- **gameplay_feel §4b note** — strv103 community GLB rides +0.115 m above
  the heightfield parked flat (model normalization), t90m ~3-5 cm: will trip
  a >3 cm float gate; owner: tank_models.

## 2. Roster breadth: 3 mediums/heavies + 3 casemate TDs (from content_breadth)

`src/ui/techtree.js` is ALREADY WIRED for spec ids `m26`, `tiger2`, `t54`,
`m36`, `jagdpanther`, `su100` — nodes auto-promote from ghost to gold as soon
as the id exists in `TANK_SPECS` (src/vehicles/specs.js).

- `m26` (USA med VIII, 90mm M3, ~850 hp, 40 km/h), `tiger2` (GER heavy VIII,
  88 L/71, ~1450 hp, 150 mm sloped glacis), `t54` (USSR med VIII, 100mm
  D-10T, ~1050 hp, low domed turret): clone nearest specs (`m4a3e8`,
  `tiger1`, `t34_85`), adjust hp/speed/gun/dims/armor/visual palette.
- TDs `m36`, `jagdpanther`, `su100`: tankFactory needs a turretless variant —
  `spec.layout = 'casemate'`: (a) skip turret assembly, build sloped fixed
  superstructure; (b) parent gun to hull-front mantlet; (c) the aim-path yaw
  clamp EXISTS now (movement.js honors `gunArcDeg`, and the seven existing
  casemate/fixed-turret specs carry explicit values as of this round).
- Add `MODEL_SOURCE` entries (`procedural`) for all six; then
  `node tools/genIcons.mjs --tanks m26,tiger2,t54,m36,jagdpanther,su100` and
  confirm the garage carousel picks up the new ids.

## 3. World/props LOD + bake decimation (performance_budget, unchanged)

~7.2 M tris median / 855 max draw calls (budget 900). Split vegetation +
sourced-prop InstancedMesh cohorts into near (<150 m, full mesh) and far
(billboard/decimated) bands on the staggered update cadence; decimate at bake
time in tools/bake-props-models.mjs (<=3 k tris house-sized, <=800
crate-sized, 1024 texture cap, atlas per family); `castShadow = false` past
the far cascade start. Target <=4 M tris median, 60+ calls headroom.
Also still owed (performance_budget r1 §3): cascade shadow-proxy LODs for
tank running gear, props-hull consolidation (0.66 M measured), acceptance bar
triangles-median <= 6.0 M then flip `RATCHET.trianglesMedianMax` into
`BUDGET` in tools/perfprobe.mjs. The frozen 7 M gate does not move.

## 4. Hot-loop micro-allocations (performance_budget, minor)

- `src/sim/armor.js` `tankPoseFromState` → out-param scratch pose.
- `src/sim/spotting.js` `getConcealment` → stop building per-frame options obj.
- `src/ui/hud.js` minimap `worldToMap` → module-scope `_px/_py` scalars.

## 5. Still-open items from evaluation-confirmed-r1 (verified against tree)

- **Pointer-lock fallback (CRITICAL, user-reported)**: embedded webviews deny
  `requestPointerLock` (SecurityError) — game must catch the rejection AND
  the `pointerlockerror` event and fall back to cursor-position aim; firing
  never gated on lock state; one-time toast "Mouse capture unavailable —
  cursor aim enabled". Verify with puppeteer stubbing requestPointerLock to
  throw: drive, aim, fire, hit.
- **Error isolation (#15)**: wrap bus dispatch + per-system update in
  try/catch with once-per-signature console reporting (must still surface
  errors so the harness's zero-error gate works).
- **Sniper pitch cap (#14)**: cameraRig sniper mode should allow the full
  spec'd gun elevation/depression range.
- **T-90M ERA seams (#5)**: check armor.js/specs ERA zone seams vs
  docs/research/tank-roster.md; add a seam-hit selftest.
- Minor: several 6-8px UI labels; audio settings tab (volume slider + mute —
  the master-volume API in audio.js exists).
- killcam_shotinfo optional: rebake `*_top_silhouette.png` with turret-ring
  stroke + ~2.5x-radius barrel (tools/genIcons.mjs + tools/icons-page.html).
- terrain_environment optional: lighting reads `sunIntensity < ~2` presets
  (softer/wider shadows); `cloudStyle: 'stratus'` flat grey deck variant.

## 6. Applied-this-round notes for the next critic

- Bots no longer double-compensate gravity (ai.js) — return fire connects;
  per-battle pressure counters on `__DEBUG.botPressure`, per-shell terminal
  telemetry on `__DEBUG.playerShellLog`; hard gate `tools/gunnery_gate.mjs`
  (>=80% settled-shot hull hits, passes at 100%).
- Sticky server reticle (x1.15 inflated gate + 0.3 s hysteresis) in main.js
  aimRaycastWithTanks/computeAimInfo; visible-point lead in debugLeadPoint.
- Sniper is FULL-FRAME (post.js corner-only shade), scope corridor promotes
  billboard trees to meshes, horizon comb de-cardboarded, sniper entry pitch
  raise-loop on rising ground.
- Player death no longer ends the battle (team verdict in state.js); death
  replay plays AT death then wreck spectate; debugSlayEnemies spares allies.
- Community/variant AI tanks land their GLBs during the 6 s battle staging
  window (modelLoader inBattle grace); ally spawns slope-reject cliff cells.
- Telegraph poles are crushable (hinge-topple + splinter fx); idle exhaust
  always breathes; SWAY_VIS mirrored 3.2; wheel-chatter downward travel
  clamped -0.02 m; casemate `gunArcDeg` per vehicle; camo eye has three
  states; sixth-sense timing single-sourced from spotting.js; combat warms
  deferred off the ready path (~120 ms), muzzle light 170/14/0.14.
