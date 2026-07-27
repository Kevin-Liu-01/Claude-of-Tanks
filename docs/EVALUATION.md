# Independent Evaluation — claude-of-tanks

**Snapshot:** commit `f673c94` (HEAD at time of audit, 2026-07-27).
**Caveat:** a build workflow was mutating the working tree concurrently during this audit; every confirmed finding below was re-verified against the latest available tree state, and findings fixed by in-flight edits were moved to the Refuted/Stale appendix.

---

## 1. Verdict

This is an excellent vertical slice and a genuinely impressive solo-scale engineering effort — and it is not the commissioned "World of Tanks-level AAA" game. The simulation core is the standout: plate-level armor with ERA/spaced/overmatch, five shell types, and hp/t movement physics are near-exact transcriptions of the project's own research docs, backed by a 149/149-assertion selftest and verified line-by-line (sim math 8.7, movement 8.6). It plays end-to-end: a live puppeteer drive test passed all 15 assertions — garage → battle → drive → aim → sniper zoom → shell swap → a real 568-damage penetration on an IS-2 at 361 m → AI return fire — over 91 simulated seconds with zero console errors (playability 8.6). The HUD is remarkably close to WoT's visual language and the settings/rebind system works end-to-end (7.5). The codebase is clean, modular, deterministic where it claims to be, and disposal-disciplined (7.4).

What holds it back is the screen and the frame budget. Environment (4) and vehicle art (4.6) are polished stylized low-poly, generations below WoT 1.x's photogrammetric terrain and SpeedTree foliage; shadows crush to literal RGB-0 black and the muzzle flash is a cartoon star. Performance (6) misses the 60 fps budget in this Mac's *default* retina configuration (33–40 fps at 1080p CSS / dpr 2) with no graphics settings to recover. Two critical defects ship: the retina frame-rate miss, and a state-lifecycle bug where destroyed tank visuals never reset — every rematch spawns burnt wrecks whose locked gun droop makes them fire into the ground. Several HUD affordances (consumables, minimap zoom, static ammo counts) are decoration. WoT breadth — maps, modes, progression, multiplayer — is absent by scope.

**Overall: 6.8 / 10** (weighted: playability ×2; environment, vehicle art, performance, completeness ×1.5; HUD, sim math, movement, code quality ×1 — weighting gameplay and the explicitly commissioned visual/perf bar highest).

---

## 2. Scorecard

| Area | Score /10 | One-line summary |
|---|---|---|
| Environment visuals | 4.0 | Real pipeline (4-cascade CSM, GTAO, ACES+grade, cloud dome) but stylized low-poly output with shipped artifacts: RGB-0 shadows, caster-less dark terrain smudges, faceted cone/lollipop trees. |
| Vehicle art | 4.6 | Clean stylized low-poly with an ambitious procedural texture system; Tiger I / Panther recognizable, T-34-85 / IS-2 / T-90M / Leo 2A7 fail the name-it test; solid indie, far from AAA. |
| HUD / UI / UX | 7.5 | Visually very close to WoT; rebind/settings system verified working live; docked for three dead advertised features and 6–8 px labels. |
| Playability drive-test | 8.6 | All 15 live-input assertions pass: drive, turn, sniper zoom, shell swap, real pen for 568 dmg, AI return fire; 91 s, zero console errors. Slow pacing docked. |
| Simulation math | 8.7 | Near-exact transcription of the research docs; 149/149 selftest; geometry spot-checks to 0.5°. Real defects: Tiger/Panther sponson rack bug, latent HESH crash, T-90M ERA seams. |
| Movement physics | 8.6 | Numerically verified vs doc: traverse exact to 0.1°/s, slope/overspeed exact, bloom to 3 decimals. Deviations are doc-contract drift, not feel. |
| Performance | 6.0 | Clean 60 fps at a literal 1080p buffer, but 33–40 fps in this Mac's default retina config; 1440p also misses; no quality settings or dynamic resolution. |
| Code quality & architecture | 7.4 | Clean module boundaries, deterministic sim, pooled fx, disciplined disposal; docked for the wreck-reset critical bug, zero loop error isolation, ~8 points of doc rot. |
| Completeness vs commission | 7.0 | Every explicitly commissioned system present and real; the AAA/HD bar and WoT breadth (maps, modes, progression, multiplayer) are not met. |

---

## 3. Confirmed findings (adversarially verified)

All findings below were independently reproduced at or after `f673c94`. Grouped by severity.

### Critical

#### C1. Destroyed tank visuals never reset — rematch battles are broken
`TankVisual.setDestroyed()` latches `destroyed = true`, swaps every mesh to the burnt material, and locks `gunG.rotation.x` to a droop that `syncFromState` keeps re-forcing; there is no un-destroy path. `setupBattle()` (src/game/state.js:125-185) reuses the same 8 visuals and resets everything *except* the visual. Reproduced live: after winning and restarting via `startBattle`, all 7 enemies respawn combat-alive but visually wrecked (materials 8→1 burnt), with barrel-vs-aim divergence of 4.1°–18.1° — all exceeding the 2° server-gun snap window (state.js:285) — so, because `tryFire()` derives fire direction from `visual.gunMuzzleWorld()`, wrecked-looking tanks fire into the ground. The `explosion` screenshot view (main.js:679) permanently wrecks enemy[2]'s visual the same way.
**Evidence:** src/vehicles/tankFactory.js:1319,1336,1374-1389; src/game/state.js:125-185,285; live rematch probe (t90m gun off 26.8°).
**Fix:** add `TankVisual.reset()` that restores original materials (keep a pristine material map at build time), re-zeros turret/gun transforms, and clears the `destroyed` latch; call it for every visual in `setupBattle()`. Make the screenshot harness use a cloned visual or call the same reset.

#### C2. 1080p on this Mac's retina display runs at 33–40 fps, not 60
renderer.js:11,30 caps pixelRatio at 1.5, so a 1920×1080 CSS window at dpr 2 renders a 2880×1620 buffer. Measured in live combat over 15 s rAF sampling: 33.5 avg fps (p95 41.6 ms, 1% low 11 fps) and 40.3 avg fps on the confirmation run; independent re-verification got 23.6 and 39.9 avg fps, while the dsf=1 control ran ~53–60 fps with one slow frame. The 60 fps @ 1080p budget is met only with deviceScaleFactor forced to 1, which no retina Mac user gets by default.
**Evidence:** renderer.js:30 `setPixelRatio(min(dpr, 1.5))`; drawingBuffer [2880,1620]; four measured runs.
**Fix:** short-term, drop `PIXEL_RATIO_CAP` to 1.0 when the post chain is active, or half-res the GTAO pass; proper fix is F10 below (quality settings + dynamic resolution).

### Major

#### F1. Shadows crush to pure black (RGB 0) in the establishing shot *(environment)*
Tree shadow on grass measures [0,1,0] (luma 0.7) vs lit grass L60.3 — ~86:1 against the code's own stated 2.3:1 "WoT footage ballpark" target (src/engine/lighting.js:20-24). The display-space grade (black anchor + 1.11 contrast + 0.32 vignette, src/engine/post.js:46-49) destroys all ambient fill at distance. Reproduced pixel-exact on a clean HEAD render.
**Fix:** raise hemispheric/ambient fill so shadowed grass sits near lit/2.3, and lift the grade's black anchor; validate with an automated pixel assertion in the screenshot harness (shadow-luma / lit-luma between 2:1 and 3:1).

#### F2. Distant terrain mottling reads as caster-less dark smudges *(environment)*
Far-field "forest-floor/heather" darkening applies up to a 0.32 multiply on ~455 m low-frequency noise (terrain.js:638,705-706), producing soft dark patches (measured L5.9 beside L44.3 open grass) that read as cloud shadows with no clouds, or as rendering errors.
**Fix:** cap the far multiply at ~0.12, shrink the noise wavelength below ~120 m so patches read as ground variation, or tie the darkening to actual cloud-dome coverage so casters exist.

#### F3. Vegetation is faceted cones and lollipops with inconsistent palettes *(environment)*
Far/mid-LOD trees (>260 m, vegetation.js:356-391) are flat-faceted blob canopies and stacked cones; dark blue-green ridge canopies clash with vivid green near-oaks (crops v_cf_ridge.png, v_bf_right.png). Partly improved in-flight (near trees now use alpha-card foliage with GPU wind), but the mid/far LODs and palette split remain.
**Fix:** extend the alpha-card foliage technique to the mid LOD, unify canopy albedo across LOD tiers from one shared palette constant, and add a trunk-base AO decal.

#### F4. Muzzle flash is a cartoon spiked star with a quarter-frame orange ground wash *(environment)*
The flash core is a 7-spike star texture (particles.js:623) with streak flares, and `MUZZLE_LIGHT_PEAK=520` (effects.js:34) paints an orange ground wash measured [245,223,110] L219 vs ambient L34–87 ~10 m from the muzzle. Daylight cannon signatures are dominated by smoke/dust, not glow.
**Fix:** replace the star texture with a 2-3 frame soft radial flash, cut MUZZLE_LIGHT_PEAK to ≤150 with a ~60 ms decay, and shift the budget into the existing smoke/dust particles.

#### F5. WW2 track hardware renders near-white bare metal *(vehicle art)*
Sherman/Tiger guide-horn rows measure mean RGB (161,176,197) vs pad luma 88 — bright metal popping oddly out of matte camo (tankFactory.js:354 `mats.dark` specular). The companion claim about modern road wheels is now stale (rubber bands/hub caps exist at tankFactory.js:199-234); only the Leo relief holes are missing.
**Fix:** darken `mats.dark` albedo toward gunmetal (~#3a3d40) and drop its specular/env intensity for guide horns and inner track faces.

#### F6. Consumable slots are dead UI *(HUD)*
The HUD renders three consumable buttons with hotkey labels 4/5/6; clicks emit `ui:consumable` (hud.js:455) with zero `bus.on` subscribers anywhere. Digit4/5/6 actions now exist in ACTION_DEFS (input.js:47-49) but nothing consumes them — bindable-but-dead. WoT consumables are core combat functionality; here they are decoration.
**Fix:** either implement the three consumables against the existing repair/fire/crew module systems (damage.js already models module HP, fires, repair timing), or remove the tray until they exist.

#### F7. Minimap Zoom setting is a no-op *(HUD)*
Settings render a rebindable "Minimap Zoom" (input.js:53); main.js:274-276 emits `ui:minimapZoom`; grep finds zero subscribers, and the minimap is fixed at 220 px (hud.js:463).
**Fix:** add a `bus.on('ui:minimapZoom')` handler in hud.js cycling 2–3 world-scale levels, or delete the binding row.

#### F8. Digit1–3 shell hotkeys bypass the rebinding system *(HUD)*
hud.js:508-516 installs a hardcoded `window` keydown listener for Digit1/2/3 that ignores bindings; settings offers rebindable Shell Slot 1–3 (input.js:44-46); main.js:264-269 contains a comment acknowledging the hack and de-duping around it. Rebinding Shell Slot 1 leaves '1' still switching shells — the settings panel's contract is violated.
**Fix:** delete the hud.js listener and route shell switching exclusively through the input layer's action path that main.js:278 already implements.

#### F9. Side penetrations never roll Tiger/Panther sponson ammo racks *(simulation)*
Tiger ammoRack spans x ±1.6 vs side plane at x=1.13 (specs.js:160); Panther ±1.45 vs 1.05 (specs.js:321). `traceTank` keys module hits to AABB entry t (armor.js:193-217,286-301), so a lateral shot records the rack *before* the side plate; damage.js:437-443 skips module hits until `hullPen` is true, so the roll never happens. Reproduced with rng=0: a 400 mm-pen side shot leaves rackHp 150/150 on both tanks (T-34 control correctly drops to 75/150). This silently deletes the classic side-shot ammo-rack weakspot the armor doc §9 specifies.
**Fix:** clamp the rack AABBs inside the side-armor planes in specs.js (x ±1.10 / ±1.02), or make damage.js re-scan module hits with t ≥ the penetrated plate's t instead of skipping pre-pen entries. Add a selftest case for a lateral Tiger rack hit.

#### F10. GPU fill-bound post chain with no quality settings or dynamic resolution *(performance)*
Fixed pipeline: RenderPass → GTAOPass (16 samples, full res, post.js:42,187) → UnrealBloom → SMAA → Output → GradePass → AerialPass (post.js:185-237), plus 4 CSM cascades at 4096² (lighting.js:13,17). settings.js has only Controls/Gameplay tabs; `setQuality` exists at post.js:280 with zero callers. Users above 1080p-equivalent fill have no path to 60 fps.
**Fix:** wire the existing `setQuality` to a Graphics settings tab (GTAO half-res/off, bloom off, 2-cascade/2048 shadows, pixel-ratio selector), and add dynamic resolution targeting 16.6 ms.

#### F11. 2560×1440 misses 60 fps *(performance)*
Original series: 58.5 avg fps, p95 21.6 ms, 1% low 41, 106/878 frames over 17.5 ms — visible stutter roughly every 8th frame. Isolation at 2880×1620 dsf=1: 46.7 avg, confirming fill scaling. Re-verification on the current tree measured 52.8–53.0 avg (scene grew 3.1M→5.3M tris; caveat: concurrent host load inflated miss counts, but the original series had a clean 1080p@60 control).
**Fix:** same as F10.

#### F12. K_ACCEL and turn-loss constants contradict the locked ARCHITECTURE values while claiming compliance *(movement / doc rot)*
ARCHITECTURE.md:510-511 locks K_ACCEL 0.55 / TURN_SPEED_LOSS 0.3; movement.js:25,36-38 uses 0.20 (retuned from the earlier 0.16) and 0.35 plus undocumented TURN_DIRECT_BLEED 0.15 and TURN_POWER_DIVERT 0.5 — under a line-19 banner claiming "values locked by ARCHITECTURE §3.4". The shipped tuning is *saner* (0.55 would give the Abrams 0→32 km/h in 0.53 s; current 1.48 s), so this is stale-doc/false-comment rot, but the project's own contract is violated.
**Fix:** update ARCHITECTURE.md §3.4 to the shipped constants and document the two extra turn mechanisms; delete or correct the false "locked" banner comment.

---

## 4. What genuinely impressed

- **Simulation fidelity.** 149/149 selftest assertions; normalization, ricochet gates, 3×/2× overmatch with APFSDS rod-caliber rules, ±25% once-per-shot rolls, KE/CE dual RHAe, one-shot ERA, HEAT gap decay, HE splash, and module/fire/repair tables all verified line-by-line against the research docs. Tiger I and T-90M plate geometry reproduces documented slopes to 0.5°.
- **Movement math.** Wiki traverse formula exact to 0.1°/s; bloom formula and afterShot multipliers match to 3 decimals; slope stall and 1.2× downhill overspeed exact; hull spring and recoil impulse per doc.
- **It actually plays.** All 15 live drive-test assertions passed using real input paths (pointer lock, real LMB), including a genuine 568-damage penetration and AI return fire, over 91 s with zero console errors.
- **The settings/rebind system.** Rebind capture, conflict-swap, and localStorage persistence (`cot.bindings.v1` / `cot.settings.v1`) verified end-to-end in a live browser probe.
- **HUD authenticity.** Pen-color dispersion reticle with in-ring reload numeral, mil-tick sniper overlay, hillshaded minimap with grid/spot circle/ghost blips, spotting-gated team ears — one consistent type/palette system across all UI files.
- **Engineering hygiene.** Clean module boundaries (verified by grep), sim runs under plain node, seeded PRNG and injected time everywhere outside UI, pooled/bounded fx and audio, refcounted disposal on garage swaps, ~17.8k lines without a god object.
- **Responsiveness of the build loop.** Ten of the audit's original findings — including two "shipping blocker" visual bugs — were fixed by concurrent work before verification completed (see appendix).

---

## 5. Honest gap to real World of Tanks

1. **Rendering generation.** WoT 1.x Core engine ships photogrammetric terrain, SpeedTree foliage with wind and subsurface, HD skyboxes, and PBR tank materials. This is stylized low-poly with procedural textures — a different visual class entirely, not a tuning gap.
2. **Vehicle likeness.** Four of eight tanks fail the name-it test; WoT's HD models are individually art-directed to museum reference.
3. **One map, one mode.** Single 1024 m map, single skirmish vs 7 AI. No base capture, encounter/assault, or map pool.
4. **No progression layer.** No tech tree, XP/credits economy, crew skills, equipment, or module research — the systems that give WoT its long-term loop.
5. **No multiplayer.** AI-only; no matchmaking, platoons, or 15v15.
6. **No SPG/TD/light class ecosystem** and the vision/camo spotting model, while present in simplified form, lacks WoT's full camo-skill/foliage interplay.
7. **No consumables/economy in combat** (F6) and infinite ammo — resource management is a core WoT combat tension.
8. **No graphics options** vs WoT's extensive scalability across a decade of hardware (F10).
9. **Audio depth.** A master-volume API exists, but no engine-state audio mixing, voiceover crew, or per-surface track sounds comparable to WoT.
10. **Performance headroom.** WoT holds 60+ fps on modest hardware at 1440p; this build misses 60 at default retina 1080p on the dev machine itself (C2).

---

## 6. Appendix — refuted or stale findings

For transparency, findings raised during the audit that failed adversarial re-verification at or after `f673c94` (most were fixed by concurrent build work mid-audit):

- **Black quad in hero tree canopy** — stale; fixed by alpha-tested depth material + foliage shadow changes in vegetation.js.
- **Sniper-view grass cards show dark boxes** — stale; coverage-mipmap fix (lighting.js:63-133) and GTAO exclusion flags landed; fresh sniper_view.png is clean.
- **Clouds darker than sky** — fixed by rebuilt light-march cloud shading (sky.js); fresh capture shows clouds 30–60 luma brighter than adjacent sky.
- **Buildings are flat texture-noise boxes** — stale; tile-course roofs with normal maps, structured walls, readable windows/doors, detailed stone tower now in props.js.
- **Terrain one green wash / mushy roads** — stale; 2 texel/m road mask, 3-scale meadow mottling, rut relief landed in terrain.js.
- **Turrets systematically under-scaled** — refuted; measured M1A2 turret 81% of hull width with cheek wedges and bustle; only IS-2/T-34/Leo run ~10–15% narrow.
- **T-90M missing signature turret features** — refuted; bustle box, Sosna-U, pano stalk, Kord RWS, ERA clusters, and slat cage all present (tankFactory.js:982-1076).
- **Camo wrong on 3 of 8 tanks** — refuted; M1A2 is proper NATO 3-color, IS-2 base matches roster #52603f; only T-34 reads pale under garage spots.
- **M4A3E8 proportions/HVSS wrong** — refuted; measured height/hull ratio 0.479 vs 0.47 target, paired wheels, 5 return rollers, volute bogies, wide T23 mantlet.
- **Geometry uniformly prismatic, no castings** — stale; lathe cast turrets (Sherman/IS-2/T-90M), Sherman cylindrical nose, 44-segment Tiger horseshoe now read clearly.

Additionally, three findings were consistent with confirmed evidence but exceeded the adversarial verification cap and remain formally unverified: no error isolation around the update loop/bus (main.js tick, state.js:57-60), ~8 points of ARCHITECTURE.md contract drift (invented bus events, post-chain and sky constants, PCFShadowMap), and static never-decrementing ammo counts (hud.js SHELL_DEFAULT_COUNT). They are reflected in the code-quality and completeness scores but not listed as confirmed findings.

---

*Evaluation conducted independently: live browser drive tests, node sim harnesses, pixel measurement on fresh screenshot-harness renders, and line-level source verification. All scores and findings evidence-backed as cited.*
