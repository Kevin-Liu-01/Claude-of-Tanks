# Carryover — r1 items NOT applied by the round-1 verifier (2026-07-27)

Everything else in the twelve `*-r1.md` handoffs was applied and verified
(harness green, selftests 28+211+60 passing). These remaining items were too
large or explicitly optional for the integration pass — they carry forward.

## 1. Roster breadth: 3 mediums/heavies + 3 casemate TDs (from content_breadth-r1)

`src/ui/techtree.js` is ALREADY WIRED for spec ids `m26`, `tiger2`, `t54`,
`m36`, `jagdpanther`, `su100` — nodes auto-promote from ghost to gold as soon
as the id exists in `TANK_SPECS` (src/vehicles/specs.js).

- `m26` (USA med VIII, 90mm M3, ~850 hp, 40 km/h), `tiger2` (GER heavy VIII,
  88 L/71, ~1450 hp, 150 mm sloped glacis), `t54` (USSR med VIII, 100mm
  D-10T, ~1050 hp, low domed turret): clone nearest specs (`m4a3e8`,
  `tiger1`, `t34_85`), adjust hp/speed/gun/dims/armor/visual palette.
- TDs `m36`, `jagdpanther`, `su100`: tankFactory needs a turretless variant —
  `spec.layout = 'casemate'`: (a) skip turret assembly, build sloped fixed
  superstructure; (b) parent gun to hull-front mantlet; (c) clamp aim yaw to
  `gunArcDeg: ±11` in the aim path (pitch already clamped).
- Add `MODEL_SOURCE` entries (`procedural`) for all six; then
  `node tools/genIcons.mjs --tanks m26,tiger2,t54,m36,jagdpanther,su100` and
  confirm the garage carousel picks up the new ids.

## 2. World/props LOD + bake decimation (from performance_budget-r1 §2)

~7.2 M tris median / 855 max draw calls (budget 900). Split vegetation +
sourced-prop InstancedMesh cohorts into near (<150 m, full mesh) and far
(billboard/decimated) bands on the staggered update cadence; decimate at bake
time in tools/bake-props-models.mjs (≤3 k tris house-sized, ≤800 crate-sized,
1024 texture cap, atlas per family); `castShadow = false` past the far
cascade start. Target ≤4 M tris median, 60+ calls headroom.

## 3. Hot-loop micro-allocations (from performance_budget-r1 §3, minor)

- `src/sim/armor.js` `tankPoseFromState` → out-param scratch pose.
- `src/sim/spotting.js` `getConcealment` → stop building per-frame options obj.
- `src/ui/hud.js` minimap `worldToMap` → module-scope `_px/_py` scalars.

## 4. Optional polish (explicitly non-blocking in r1 handoffs)

- killcam_shotinfo: rebake `*_top_silhouette.png` with turret-ring stroke +
  ~2.5x-radius barrel for the silhouette pass (tools/genIcons.mjs +
  tools/icons-page.html) so 72px shot-card masks communicate facing.
- terrain_environment: (a) lighting reads `sunIntensity < ~2` presets and
  softens/widens shadows (winter overcast); (b) `cloudStyle: 'stratus'` flat
  grey deck variant for overcast maps.
- lighting advisory (controls_gunnery): scope-shadow chromatic edge + depth
  scattering at `camera.fov < 20`; cull muzzle smoke within 12 m while scoped.

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
- Minor: WW2 track guide-horns render near-white (tankFactory mats.dark);
  several 6–8px UI labels; audio settings tab (volume slider + mute — the
  master-volume API in audio.js exists).

## Applied-this-round notes for the next critic

- Consumables are now real (main.js stock 2/2/1, 5 s cooldown, no-op guard;
  HUD tray live counts/deny/used states).
- Shell hotkeys single-path via input.js actions; wheel zoom through
  zoomIn/zoomOut bindings; ammo depletes per shell type and firing is gated
  on rounds left; 15:00 timeout now ends the battle as a DRAW.
- Minimap zoom cycles 160/220/300 px; enemy roster rows dim+desaturate while
  unspotted; damage numbers stack instead of overlapping.
- Graphics tab (auto/low/medium/high/ultra) wired to src/engine/quality.js.
- Turret pop reserved for ammo-rack kills; wrecks stay shell-collidable;
  WW2 HE pens at ~0.5× caliber; APFSDS honors quoted 2 km pen.
