# Handoff: adversarially-confirmed findings from the independent evaluation (commit f673c94)

Source: docs/EVALUATION.md (committed 277cb5c). Every item below was reproduced by an
adversarial verifier. The Expand phase has landed since — CHECK each item against the
current tree first and skip anything already fixed. Priority order.

## CRITICAL

1. **Rematch battles are broken — destroyed tank visuals never reset.**
   After victory + startBattle again, all 7 enemies respawn combat-alive but visually
   wrecked: burnt materials (8→1), gun latched at −6.5° vs state.gunPitch (t90m off
   26.8°), and because barrel-vs-aim exceeds the 2° snap window (state.js:285) they
   fire into the ground. No un-destroy path exists in tankFactory.js. Fix: implement a
   full visual reset (materials, gun/turret pose, smoke/fire emitters) on battle start,
   or rebuild tank visuals per battle. Verify with a puppeteer rematch test: win → 
   restart → assert enemies visually intact and their shots land near aim.

2. **Retina performance: default config runs 33–40 fps, not 60.**
   renderer.js pixelRatio cap 1.5 × dpr-2 display = 2880×1620 buffer; GPU fill-bound
   (16-sample full-res GTAO, UnrealBloom, SMAA, 4×4096 CSM). post.js:280 setQuality
   exists with ZERO callers; settings has no graphics tab. Fix: add a Graphics tab in
   settings (quality preset + resolution scale + pixelRatio option, persisted), wire
   setQuality, consider half-res AO and 2-cascade/2048 shadows on Medium; optionally
   dynamic resolution. THEN update tools/perfprobe.mjs to ALSO measure
   deviceScaleFactor=2 (this Mac's real default) so the performance_budget critic
   measures reality — budgets must pass at dpr 2 on default preset (auto-select an
   appropriate preset on first run if needed).

## MAJOR — sim (visual critics will never find these)

3. **Tiger/Panther sponson ammo racks unhittable from the side.** Their AABBs
   (specs.js:160/321) protrude past the side hull planes; traceTank keys module hits
   to AABB entry t (armor.js:193-217, 286-301) and damage.js:437-443 skips modules
   pre-hullPen, so a side pen at rng=0 leaves racks 150/150 (T-34 control works).
   Fix the module-trace so side penetrations can roll sponson racks; add selftest
   assertions for Tiger + Panther side-shot rack damage.
4. **Latent HESH crash in damage.js** (flagged by the sim auditor). Grep the HESH
   path for the unguarded case and add a selftest exercising HESH pen + non-pen.
5. **T-90M ERA seam gaps** don't match the documented coverage — check armor.js/specs
   ERA zone seams vs docs/research/tank-roster.md; add a seam-hit selftest.

## MAJOR — HUD dead features (advertised but non-functional)

6. **Consumable slots are dead UI**: hud.js:455 emits ui:consumable, zero subscribers;
   Digit4/5/6 bindable but no consumer. Implement real consumables (repair kit: repairs
   destroyed module; med kit if crew exists; fuel/adrenaline reload boost) or remove the tray.
7. **Minimap Zoom is a no-op**: main.js:274-276 emits ui:minimapZoom, no bus.on anywhere;
   minimap fixed at 220px (hud.js:463). Implement 3-step minimap size/zoom cycling.
8. **Digit1-3 shell hotkeys bypass rebinding**: hud.js:508-516 hardcodes keydown listeners;
   main.js:278 applies unconditionally. Route shell selection through input.js actions only.
9. **Ammo counts are static + match timer is cosmetic** (completeness auditor): wire real
   ammo depletion per shell type and a real countdown with draw-on-timeout.

## MAJOR — engine/movement/code

10. **Shadows crush to RGB-0 black** (~86:1 ratio vs 2.3:1 target; lighting.js:20-24,
    grade at post.js:46-49) — lift shadow floor via hemisphere/ambient + grade toe.
11. **Caster-less dark terrain smudges** at ~455m: terrain.js:638 farM smoothstep(90,330)
    with 0.32 multiply darkening (lines 705-706) — reduce/replace with plausible detail
    (may be superseded by Expand map refactor — verify per map).
12. **Muzzle flash reads cartoon**: 7-spike star texture (particles.js:623) + orange
    ground wash L219 (MUZZLE_LIGHT_PEAK=520, effects.js:34) — rework to layered soft
    core + directional cone + brief light, no saturated ground decal.
13. **K_ACCEL/turn-loss drift vs ARCHITECTURE.md:510-511** with a false "locked" banner
    (movement.js:19,25,36-38). Either retune to spec or update ARCHITECTURE.md and the
    banner to match reality (0.55 spec gives Abrams 0-32 km/h in 0.53s — current 1.48s
    feels better; document the decision).
14. **Sniper pitch cap wastes spec'd gun elevation** (cameraRig.js) — allow full
    elevation/depression range in sniper mode.
15. **No error isolation around update loop/bus** — wrap bus dispatch + per-system update
    in try/catch with once-per-error-signature console reporting so one subsystem
    exception can't kill the frame loop (must not mask the harness's zero-error gate:
    still surface errors to console).

## CRITICAL (added from live user testing 2026-07-27 evening)

0. **Game is unplayable in embedded browser panes — pointer lock denied.**
   Reproduced live: in an embedded webview, canvas.requestPointerLock() throws
   SecurityError ("The root document of this element is not valid for pointer lock"),
   and the user reported no aiming, no firing, no sniper scope. The game must detect
   pointer-lock failure (catch the promise rejection AND the pointerlockerror event)
   and fall back gracefully: cursor-position aim (turret steers toward the cursor ray
   like WoT's no-lock spectator aim, or hold-LMB drag-to-aim), firing NEVER gated on
   lock state (LMB click fires whenever a battle is live and no menu is open), Shift
   sniper toggle unaffected, plus a one-time toast "Mouse capture unavailable — cursor
   aim enabled". Verify with a puppeteer run where requestPointerLock is stubbed to
   throw SecurityError: drive, aim at an enemy, fire, hit — all must work.

## CRITICAL (user-reported with screenshot, 2026-07-27 evening)

0b. **Tanks clip INTO terrain — hull buried to the fenders in depressions.**
   User screenshot shows the player tank sunk hull-deep in a shallow dip (63m view).
   Root cause class: visual root Y is sampled at ONE point (hull center) while the
   ground rises around it, and/or suspension conformance doesn't clamp wheels to the
   surface. REQUIRED FIX: support the hull on its actual contact patch — sample the
   heightfield at all 4 track-run corners (front-left/right, rear-left/right at the
   real track footprint), set hull Y so the LOWEST wheel still touches ground while
   pitch/roll follow the best-fit plane of those samples (not the center normal), and
   clamp every road wheel's visual travel so no wheel or track link ever renders below
   the terrain surface. Also apply to AI tanks and wrecks. VERIFY with a puppeteer
   drive across the roughest terrain on verdant + desert: capture 10 frames, assert
   (via a debug sampler comparing wheel-bottom world Y vs getHeightAt) zero
   below-ground penetrations > 3cm, and Read the frames to confirm visually.

0c. **Track runs must be REALISTIC TRAPEZOIDS, not rectangular slabs** (user demand).
   Every tank's track run profile must follow the real vehicle per
   docs/research/tank-roster.md: road-wheel contact run flat on the ground, FRONT of
   the run rising at the correct approach angle over the raised idler (WWII: large
   visible idler wheel; modern: sloped rise under the glacis), REAR rising over the
   drive sprocket, return run across the top (with sag between return rollers on
   WWII tanks; hidden behind side skirts on modern tanks but the profile must still
   read correctly at the visible front/rear). Track links must wrap this trapezoidal
   path with guide horns, correct per-tank width, and scroll along the path when
   moving. Judge each tank's closeup against the roster doc's silhouette description.

## MINOR (fix opportunistically)
- WW2 track guide-horns render near-white (tankFactory.js:354 mats.dark specular).
- Several UI labels at 6-8px at 1080p — bump to legible sizes.
- No audio settings tab despite master-volume API (audio.js) — add volume slider + mute.
