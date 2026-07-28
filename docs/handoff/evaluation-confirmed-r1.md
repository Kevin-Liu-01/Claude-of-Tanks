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

## MINOR (fix opportunistically)
- WW2 track guide-horns render near-white (tankFactory.js:354 mats.dark specular).
- Several UI labels at 6-8px at 1080p — bump to legible sizes.
- No audio settings tab despite master-volume API (audio.js) — add volume slider + mute.
