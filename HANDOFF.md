# HANDOFF — Claude of Tanks

**For the next agent/developer taking over this project (written 2026-07-29).**
This document is the complete transfer of context: what the game is, how it is
verified, how the multi-agent build/critique system worked, what is done, what
is broken, and exactly what to do next. Read this before touching anything.

---

## 1. What this is

A World of Tanks-style armored combat game in **pure Three.js** (no engine, no
bundler magic — Vite dev server, ES modules), ~63k lines in `src/`, built over
three days by a multi-agent pipeline: research → parallel subsystem builders →
integration → repeated harsh-critic loops with per-dimension fix agents →
independent evaluations. **48–55 playable vehicles** (mix of sourced CC models
and procedural builds), 4 maps, plate-level armor simulation, kill cams with
x-ray shot analysis, WoT-style HUD/garage/tech-tree, camo + spotting system.

- **Private local project.** The owner has stated it will never be published or
  monetized. Licensing is therefore fully relaxed: NC / ND / ShareAlike /
  personal-use / Sketchfab-Standard assets are ALL used freely — nothing is
  ever distributed, so no license term is triggered. Do not re-reject a model
  for its license; `docs/ATTRIBUTION.md` keeps one provenance line per asset.
  **The one absolute rule that remains: no assets ripped from commercial
  games** (see §7 forensics) — rips have no grant from anyone at any severity.
  Known unlocked-but-not-yet-integrated: the Tejas V. CC-BY-NC-ND M1A2 Abrams
  (1.25M-face original, expected to beat the shipped dannzjs model — see the
  tabled note in ATTRIBUTION.md) and the Mortavex AbramsX concept; both need
  re-dropping from the owner's ~/Downloads (TCC-blocked for agents).
- GitHub: `Kevin-Liu-01/claude-of-tanks` (private). Local repo `~/claude-of-tanks`.

## 2. Quickstart

```bash
cd ~/claude-of-tanks && npx vite        # then open the printed URL in Chrome
```

- **Node is via nvm and NOT on default PATH** in non-interactive shells:
  `export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"` before any node/npm.
- Two standing dev servers (configs in `~/.claude/launch.json`, NOT the repo):
  port **5001** = live working tree; port **5002** = `~/claude-of-tanks-stable`,
  a git worktree pinned to the last verified commit (own Vite cache in
  `.vite-cache-stable` — two Vite instances sharing `node_modules/.vite`
  serve 504s). A monitor used to auto-advance the stable worktree per commit;
  re-create that or advance it manually (`git -C ~/claude-of-tanks-stable
  checkout <sha>`).
- Boot flow: instant inline splash (in `index.html`) → staged loading bar →
  keypress gate → garage. `?nosplash` / `?nogate` skip it; **headless
  harnesses are auto-detected and bypass the gate** (see `src/ui/bootScreen.js`).
- Controls: WASD, mouse aim (pointer lock; automatic cursor-aim fallback when
  pointer lock is denied — embedded webviews), LMB fire, Shift sniper,
  RMB free-look (desktop) / sniper toggle (cursor-aim mode), 1/2/3 shells,
  Esc settings. All rebindable; persisted in localStorage `cot.bindings.v1`.

## 3. Repo map

```
src/engine/    renderer, lighting (CSM), post chain (+dynamic-res governor), sky, cameraRig
src/world/     terrain, vegetation, props, horizon ring, map.js (+createMapAsync), maps/{verdant,desert,winter,urban}.js
src/vehicles/  specs.js (stats/armor/roster tables), tankFactory.js (procedural WWII),
               modern1/2/3.js (procedural moderns), variants.js (CC-BY derivatives),
               userdrops*.js (sourced-GLB registrations), modelLoader.js (GLB ingest:
               scale/orient normalization, turret/gun re-parenting, camo overlay,
               procedural-subtree hiding, shadow proxies), materials.js (camo painters,
               weathering, zimmerit)
src/sim/       movement.js, ballistics.js, armor.js, damage.js, spotting.js (+ *.selftest.mjs)
src/game/      state.js (bus, battle staging), ai.js, input.js, killcam.js
src/fx/        effects.js, particles.js (muzzle, tracers, impacts, destruction, dust)
src/ui/        hud.js, garage.js, techtree.js, settings.js, shotInfo.js, damagePanel.js,
               bootScreen.js, battleLoad.js, tankThumbs.js, flags.js
src/main.js    integration: boot order, game flow, update loop, __SHOTS/__DEBUG hooks
tools/         verification gates (see §4), genIcons.mjs, blend2glb.sh, strip-nc-assets.mjs
docs/          research specs, ARCHITECTURE.md, ATTRIBUTION.md, EVALUATION.md, perf evidence,
               handoff/ (the fix-loop patch convention), agents/ (workflow specs)
public/        models (tanks + community), icons (generated), fonts (Switzer), maps
```

Sim modules are pure logic and run under plain `node` — that is what makes the
selftests possible. Keep it that way.

## 4. The verification gate system (run these before ANY commit)

| Gate | Command | What it proves |
|---|---|---|
| Screenshot harness | `node tools/screenshot.mjs` | Boots the game headless, captures every contracted view (see `docs/SCREENSHOT_CONTRACT.md`, currently 16+ incl. 4 battlefields, closeups, garage, techtree, killcam_xray). **Must exit 0 with zero console errors.** The de-facto smoke test. |
| Controls probe | `node tools/controls-probe.mjs` | 38+ assertions in BOTH pointer-lock and cursor-aim (stubbed SecurityError) modes. **Direction-aware**: asserts D turns the hull toward screen-right and mouse-right swings the gun right by projecting to screen space — a plain "A and D differ" check once let a full steering inversion ship. |
| Combat selftest | `node src/sim/combat.selftest.mjs` | ~149 assertions: ricochet/normalization/overmatch order, ±25% RNG, HE splash, ERA, module/crew rolls. |
| Spotting selftest | `node src/sim/spotting.selftest.mjs` | Concealment formula, firing bloom, bush stacking, sixth sense. |
| Perf probe | `node tools/perfprobe.mjs [--scene garage] [--dsf 2]` | fps median/p5, draw calls, triangles, texture MB, heap, load-to-ready. Budgets: ≥60fps median, ≥45 p5, ≤900 draws, ≤7.0M tris, ≤512MB tex, ≤8s load — **at dsf 1 AND 2** (retina Mac; dsf2 is reality). Timing runs are noisy under load — rerun in a quiet window rather than reporting garbage. |
| Feel probe | `node tools/feel-probe.mjs` | Input→turret latency (frames), 0–30 km/h, brake distance, LMB→muzzle→hit-feedback timing, frame-time distribution. Baseline: `docs/feel-before.json`. |
| Icons | `node tools/genIcons.mjs` | Regenerate per-vehicle top/angle/side icons after any model change. |

Conventions that keep these deterministic: any puppeteer script must launch
Vite with `hmr:false, watch:null` (a concurrent editor save otherwise reloads
the page mid-run); `window.__SHOTS.set(view)` must fully determine the frame
(it resets drag state, skips the boot gate); `window.__DEBUG` exposes
`startBattle, aimAtNearest, slayEnemies, fastForward, spawnKillShell,
playerShellLog, aimState, frameInfo…` for scripted tests.

## 5. The loop & evaluation system (the methodology — replicate this)

This project's quality came from a **critique loop**, not from single-shot
generation. The pattern is orchestrator-agnostic; here is the complete recipe.

### 5.1 The critique loop (one "round")
1. **N independent critics in parallel**, one per dimension, each a fresh
   context with a harsh persona ("art director who shipped three CoD titles"),
   each REQUIRED to gather its own evidence: run the harness, Read the PNGs,
   run probes, drive the game via puppeteer. Score 1–10 + structured problem
   list. **Pass bar 8.5. When uncertain, score lower.** Dimensions used (12):
   lighting_post, terrain_environment, tank_models, effects_combat, hud_ui,
   gameplay_feel, simulation_correctness, controls_gunnery, content_breadth,
   performance_budget, killcam_shotinfo, camo_spotting.
2. **Hard gates** inside critic prompts (auto-cap the score): rectangular
   slab track-runs ⇒ tank_models ≤6.0; any hull/wheel >3cm below terrain
   during a scripted rough-terrain drive ⇒ gameplay_feel ≤5.0; perf budgets
   unmet at dsf2 ⇒ performance_budget <8.5; shot-info card showing any number
   that diverges from the sim event payload ⇒ critical.
3. **One fix agent per failing dimension, in parallel, with strict file
   ownership** (the ownership table lives in each round's prompts; e.g.
   lighting owns `src/engine/`, terrain owns `src/world/`…). A fix agent that
   needs a change outside its files does NOT make it — it "temp-applies" to
   verify, REVERTS, and writes an apply-ready patch to
   `docs/handoff/<dimension>-r<N>.md`.
4. **One round verifier** with full repo access: applies the handoff patches,
   re-runs every gate, Reads the PNGs, deletes consumed handoffs, commits
   `"Critique round N fixes"`.
5. Repeat. **Exit = two consecutive all-clean rounds** (never achieved; see
   scores below) or a round cap, then a blind judge + README.

### 5.2 The independent evaluation (run separately from the loop)
9 auditor lenses with NO memory of the build (environment, vehicle art across
the whole roster, HUD/UX incl. dead-affordance checks, playability via its own
drive-test, sim math vs the research docs, movement, measured performance,
code architecture, completeness vs the commission) → dedup all critical/major
findings → **adversarial verification**: one verifier per finding whose default
stance is "this is wrong or stale," must reproduce it on the current tree or
it is discarded → synthesis committed as `docs/EVALUATION.md`. First run
scored 6.8/10 weighted with 14 confirmed / 10 refuted findings; its confirmed
list drove a full fix round. **This adversarial-verify step is what keeps the
reports honest — do not skip it.**

### 5.3 The pending final judgment — DO THIS FIRST WHEN YOU HAVE CAPACITY
`docs/agents/final-judgment.spec.js` is a complete, ready-to-run spec (written
for Claude's Workflow orchestrator; trivially portable — it is just phases of
parallel agent prompts + JSON schemas). Four phases, deliberately ordered so
the cheapest, most-wanted piece lands first:
1. **Blind side-by-side judge** (never ran — credits died): 13 judges, one per
   view, each judging its PNG as if pinned unlabeled next to a real WoT shot —
   score / which wins / would-it-fool-a-player.
2. 9-lens re-evaluation (fresh auditors).
3. Adversarial verification of all major findings.
4. Synthesis → `docs/EVALUATION-final.md` + update README "Honest status".

### 5.4 Score history (context for expectations)
- First loop (8→12 dimensions as scope grew), 7 rounds: systems dimensions
  cleared or approached the bar — sim math peaked **9.1**, spotting 8.4,
  movement 8.4/8.6, shot-intel 8.4, content 8.5, controls 8.5, perf 8.7 once —
  while art dimensions (lighting, terrain, per-vehicle cohesion, effects)
  plateaued **5–7**. Round averages: 6.8 → 7.23, floor rising, pass-count
  stuck at 1–2/12. The honest read: remaining gap is art ceiling + roster
  variance (critics judge the worst of ~50 vehicles as hard as the best), not
  a bug list. Full per-round history is in the git log commit sequence
  ("Critique round N fixes") and `docs/perf-trend.jsonl`.

## 6. Current state (as of commit `75193dc`)

**Working and verified now:** harness 16+ views green, zero console errors;
controls probe green (direction-aware); both sim selftests green; boot splash
+ staged loading + pre-battle roster screen + keypress gate; deferred world
build (battlefield builds on BATTLE press, chunked across frames); dormant
battle world behind the garage; steering/mouselook sign fix (`40a4b77` — see
the SIGN CONTRACT comments in `movement.js`/`input.js`; do NOT "simplify"
them); flattened community-model layout with fixed paths.

**In-flight work that was interrupted (API instability killed the agents mid-task):**
- **Game feel changes** — probe + baseline committed, but the actual tuning
  (firing weight, throttle bite, damage feedback, audio body) was NOT done.
  `docs/handoff/feel-requests.md` may hold partial notes.
- **Showroom garage camera** — `createShowroomOrbit()` in
  `src/engine/cameraRig.js` is complete-looking dead code (~434 lines):
  per-vehicle bbox hero framing + damped drag orbit + spring-back. Needs
  wiring into the garage (drag only on the 3D view, never UI; `__SHOTS.set`
  must reset it), plus verification. A `tools/garage-camera-probe.mjs` was
  planned, never written.
- **Roster additions** — the previously-rejected-for-NC originals are now
  cleared to add: TigerAce1945 KV expansion (thing:2011570), WindhamGraves
  StuG III (4766359) + Hetzer (4803697), Foolyo89 StuG (3334340), Unseulmot
  KV-2 (203994, separate turret STLs), m_bergman WWII pack (3553160) + the
  unmined half of modern pack (4718232: T-54/55, T-72s, Leopard 1, M60s,
  Centurion, AMX-30), Tank 3D Tiger H1 (printables 1737822), M1RON Tiger I
  (Sketchfab CC-BY-NC — only via a license-intact mirror; Objaverse on
  HuggingFace `allenai/objaverse` worked for prior models; NEVER create
  accounts), free3d personal-use originals (Leopard 2A5DK /417253, Leopard 1
  rig /37240, still2k Panther /97333, zrgyu Panzer IV series /78179 + his King
  Tiger/KV-1/Tiger/Jagdpanther/Ferdinand, tanks3d Tiger /254401, panosdalk
  Pershing/Centurion, leonmetalowiec light tanks).
- **Procedural shape rebuild** — owner verdict: procedural tanks read as
  "rectangles on rectangles." Method that was specced: render each procedural
  vehicle side-by-side at an identical angle against a shipped sourced GLB
  (M1A2 dannzjs, Leo 2A6 buh-late, T-90M minehffd, Leclerc, Merkava, T-80U,
  KF51, Ariete, Type 74 — see `MODEL_SOURCE` in specs.js), iterate geometry
  (lathes/lofts/bevels, NOT subdivision; detail via materials.js normal maps)
  until the silhouette reads real. Priority: Tiger I, Panther G, T-34-85,
  IS-2, M4A3E8, then Leo 2A7, Challenger 2, T-14, K2, Type 99A, Chieftain,
  T-72B3. Keep ≤1.3× current tris; do not regress the trapezoid-track gate.

**Known bugs:**
- **Merkava Mk4 "floating gun"** (user-reported). Investigated: the GLB
  (`public/models/tanks/merkava4_arlassar.glb`) has only Hull + Turret meshes;
  geometry slicing shows NO barrel tube in either (turret's forward extreme is
  19 verts of thin plate; the hull's long +X reach is genuinely hull — Merkava
  is engine-forward). The visible floating barrel is therefore almost
  certainly a **procedural gun stub not hidden by modelLoader's swap sweep**
  (it hides procedural subtrees when a GLB ships; the gun may be parented
  outside the hidden set, so it neither hides nor follows traverse). Verify by
  rendering with turret at two yaw angles; fix in `modelLoader.js`'s hidden-set
  logic or by giving the merkava4 config an explicit gun-hide. `userdrops3.js`
  header documents the intended "gun fused, pitch virtual (kv2 rule)" design.
- Several critic-identified art issues remain open (see the last round's
  handoff docs in `docs/handoff/` and pending tasks in the round-7b/r7 lists).

## 7. Asset pipeline & licensing forensics

- Pipelines: `tools/blend2glb.sh` (Blender 5.2 headless, installed at
  /Applications/Blender.app), assimp for obj/fbx/3mf. STL/print models are
  mm-scale and Z-up — use a proper Z-up→Y-up ROTATION, never a single-axis
  negation (that mirrors the mesh, flips winding, breaks normals; verify
  handedness against an asymmetric feature like the cupola side).
- Sourcing that worked: poly.pizza, OpenGameArt, Thingiverse (direct zips),
  Printables (CC-filter, GraphQL API), itch.io free+licensed, Kenney,
  ambientCG/Poly Haven (textures), **Objaverse mirror on HuggingFace for
  Sketchfab-CC models** (license-intact, no login). Sketchfab/MakerWorld
  downloads are account-gated: never create accounts; the owner can download
  manually into `public/models/community-candidates/user-drops-recovered/`.
- **Rip forensics (still binding — check EVERY sourced mesh):** uploader
  self-admission ("ripped from … by me", tag `ripped`); Gaijin Dagor node
  scheme (`vehicle#track_r_0`, `bone_turret`); WT unit-id textures
  (`us_m1a2_abrams_track_c.png`); Bohemia `_co` maps; hash-named `*_dds`;
  `desirefx_me_*` watermarks (warez site); exact face-count match to a known
  Sketchfab rip via its public API; catalog-pattern uploaders
  (42manako, nazidefenseforceofficial, KojfDiscord, "north", "frugurt",
  "azlyirnizam" are all confirmed rippers). ~53 of ~100 candidate files were
  rejected this way; the evidence style is in `docs/ATTRIBUTION.md` and the
  session's verdict tables. **macOS TCC blocks this app from reading
  ~/Downloads** — user drops must be moved into the repo first.

## 8. Environment gotchas (each cost real time — respect them)

1. nvm PATH (see §2). 2. Port 5000 is macOS AirPlay — never use it. 3. Two
Vite instances must not share a dep cache (stable worktree uses
`cacheDir: '.vite-cache-stable'`). 4. Embedded webview panes deny pointer lock
(`SecurityError`) AND throttle rAF to zero when hidden — the game has a
cursor-aim fallback and an rAF-starvation interval fallback; test real
gameplay in a normal browser. 5. Retina: a "1080p" window at dpr2 renders
2880×1620 — always measure perf at dsf 1 AND 2. 6. Steering/mouselook sign
contract is LOCKED (comments in movement.js/input.js/main.js) — the AI's
bearing-error steering shares the convention; flipping it "back" breaks bots
and desyncs sim from visuals. 7. Headless harness + boot gate: auto-bypass
exists; keep it working or every probe hangs at the splash. 8. `git add -A`
was banned during multi-agent work — with a single agent it is fine again,
but check `git status` first out of habit; agent-shared trees accumulate
surprises.

## 9. Priority queue (in order)

1. **Merkava floating gun** — hypothesis + verification steps in §6. Small, visible, user-reported.
2. **Wire the showroom garage camera** (dead code → feature) + write `tools/garage-camera-probe.mjs`.
3. **Game feel pass** (firing weight first — recoil kick, caliber-scaled shake, reload cue, pen/bounce/non-pen distinct audio; then throttle bite, damage feedback, audio body). Prove with feel-probe before/after vs `docs/feel-before.json`.
4. **Roster additions** from §6's cleared list (batch of 2–4 vehicles per commit; forensics on every mesh).
5. **Procedural shape rebuild** per §6's method (this is the owner's loudest visual complaint).
6. **Run the final judgment** (`docs/agents/final-judgment.spec.js`) once 1–5 have landed; commit `docs/EVALUATION-final.md`; update README Honest status.
7. Optional restart of the critique loop (§5.1) if further polish rounds are wanted — art dimensions are where the headroom is.

## 10. Document index

`README.md` (overview, controls, honest status) · `docs/ARCHITECTURE.md`
(module contracts) · `docs/SCREENSHOT_CONTRACT.md` (view list + rules) ·
`docs/research/*.md` (armor/shells/movement/graphics specs the sim is verified
against; roster + modern-roster visual specs) · `docs/ATTRIBUTION.md` (every
asset + license + provenance) · `docs/EVALUATION.md` (first independent audit)
· `docs/agents/final-judgment.spec.js` (pending final evaluation, ready to
run) · `docs/handoff/` (fix-loop patch convention; unconsumed patches may
remain) · `docs/perf-*.json|jsonl` (performance evidence chain) ·
`shots/` (current contracted screenshots — regenerate, do not trust stale).
