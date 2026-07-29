# Carryover — items NOT applied by the round-2 verifier (2026-07-28)

Everything else in the ten `*-r2.md` handoffs (camo_spotting, content_breadth,
controls_gunnery, effects_combat, gameplay_feel, hud_ui, killcam_shotinfo,
lighting_post, performance_budget, terrain_environment) was applied and
verified: harness green (exit 0, zero console errors, all 16 PNGs reviewed
including the recaptured garage hero), selftests at documented baseline
(movement 2/28 pre-existing synthetic-field failures, combat 233, spotting
90). The performance_budget shadow-proxy patch landed via 3-way merge on top
of the tank_models r2 modelLoader changes (one conflict resolved: idleGate
keeps its r2 `url` tag argument alongside the parser strip).

## Deferred this round

- **gameplay_feel §5 (minor/flavor, SKETCH not apply-ready)** — small trees
  (sc < 1.15) crushable instead of invisible bollards: vegetation.js
  `pushTree` → `treeCrushables` + `crushTree(i, dirX, dirZ)` hinge-topple,
  map.js merges into `world.crushables`, main.js `sp > 1.2` crush loop then
  fells them for free (template: props.js telegraph-pole crushables ~lines
  733/1196/1812). Big trees stay obstacles (impact stop + clank is correct).
- **controls_gunnery §9 (optional carryover)** — sniper impostor walls:
  extend the scoped impostor→mesh promotion corridor to the full frustum when
  `rig.mode === 'SNIPER'` && zoom >= 8 (promotion radius ∝ zoom); far-hill
  normal-map detail. Perf-sensitive — coordinate with performance_budget.
- **controls_gunnery §2 longer-term** — close the two authored armor seams in
  `src/vehicles/modern2.js` `mbtArmor` (extend `hull_side_upper` to
  `glacisNoseZ`; overlap `turret_side_*` zF with the cheek zOut ~0.1 m). The
  damage.js ENVELOPE-SEAM CATCH landed this round makes this cosmetic.
- **effects_combat minor #12** — vegetation occlusion-fade dither: the
  lighting_post r2 hash-noise swap (applied) replaces the checkerboard IGN in
  the same discard path, and the gameplay_feel r2 sight-capsule clamp
  (applied) removes the sky-curtain dither. If the flank stipple is still
  flagged, the remaining ask is a per-instance blue-noise term or true alpha
  blend for the corridor band.
- **content_breadth §7** — icons for bmp1/m1128/m1296: run
  `node tools/genIcons.mjs --tanks bmp1,m1128,m1296` ONLY after the bergman
  GLB substitution actually renders and `SHIP_USERDROP2_NEW`
  (src/vehicles/userdrops2.js) is flipped back on.
- **content_breadth §5 note** — is3 + pziii_konserwa were routed through the
  kv2/is7 `stripBakedTextures` cohesion path (specs.js). Verified only via
  the harness (no dedicated garage-hero capture of is3); if the pattern reads
  wrong on their gear nodes, the per-spec surgery in modelLoader.js
  (`communityCohesionSurgery`) is the place to split track/wheel materials.

## Notes for the next critic

- Killcam harness-reliability fix landed BOTH halves: resilient GLB texture
  decode (TextureLoader + no-reject retry/1x1 fallback plugin in
  modelLoader.js) and the shot-capture idle-queue pause. The pause has one
  deliberate EXCEPTION: `__SHOTS.set('garage')` RESUMES the queue — the
  pedestal hero GLB must settle or the stand-in stays hidden and the
  turntable captures empty (found + fixed during this round's verification).
- gunnery_gate.mjs gained the two r2 regression floors (botPressure >=3 when
  the player fires 5+, no 2 consecutive 0-damage tank impacts <=350 m).
- New `npm run build:public` = vite build + tools/strip-nc-assets.mjs
  (deletes quarantine/community-candidates from dist, fails on registered
  playables referencing stripped paths, prints the ATTRIBUTION section to
  drop). The two Sketchfab-Standard playables (type74, ariete) + leo2a4/bmp2
  model swaps still live in quarantine — conscious ship/no-ship call per
  public artifact.

Everything in carryover-from-r1.md that was not superseded this round still
stands (winter birch cards, terrain sandstone warp, props facade masks, world
LOD/bake decimation ratchet, hot-loop micro-allocs, pointer-lock fallback,
error isolation #15, sniper pitch cap #14, T-90M ERA seams #5, audio settings
tab, silhouette rebakes, stratus preset).
