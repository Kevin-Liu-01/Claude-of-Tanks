# Claude of Tanks launch handoff — hard stop, 2026-09-11

The owner explicitly stopped all implementation and requested this handoff.
Do not resume edits, tests, captures, generation, commits, pushes, deployment,
or worktree cleanup until the owner explicitly asks to continue. This document
records unfinished work; it is not a release record and makes no launch claim.

## Immediate stopped state

- The owned map capture/help process was terminated.
- The remaining map-review agent was interrupted before it started another
  turn. The other two earlier review agents were already absent.
- No owned browser, Vite, Playwright, build, test, or capture process remained
  in the final process scan.
- Other Vite/Chrome processes belonging to different worktrees and unrelated
  repositories were visible and were deliberately not terminated.
- No files were staged, committed, pushed, deployed, reset, cleaned, stashed,
  or deleted after the stop.
- The current fetched `origin/main` at handoff is
  `010faabc2982d6db79a62096c4472efb537eea22`. Fetch again before integration.
- The shared checkout at `/Users/kevinliu/claude-of-tanks` remains unsafe for
  implementation because it contains unrelated dirty/conflicted owner state.
  Do not clean, reset, stash, or commit from it.

## Owner's current visual direction

Commit `1049e4e318b7a2187f98f729b91e772530ce7103` is the visual reference. The
owner said it looked substantially better even on Low quality: its maps,
Verdant horizon/skybox, shadows, environmental density, and overall image
depth are the target. Do not revert the game wholesale to that commit. Restore
its successful presentation selectively on top of current `origin/main` so the
newer loading, memory, caching, streaming, geometry, and resource-lifetime
improvements survive.

The latest owner direction supersedes older notes that preferred the newer
Verdant horizon. Use the older horizon/skybox feeling and strong textured
shadows, while retaining terrain changes that improved traversal, road support,
collision, and useful biome shape. Verdant must still read as rolling French or
European agricultural country rather than a mountain basin.

Required result across the full map catalog:

1. Restore the darker, textured shadowing that gives terrain, tanks, trees,
   buildings, and props visible form instead of a flat ambient wash.
2. Restore the older skybox and horizon character across maps, then keep
   biome-specific landform identity, safe seams, sea openings, and traversal.
3. Finish every map redesign and add back enough vegetation, buildings, rocks,
   utilities, wrecks, farms, debris, shore dressing, and settlement detail that
   no map feels bare.
4. Preserve useful terrain updates. Do not trade navigability, road continuity,
   collision correctness, spawn safety, objective placement, or minimap
   correspondence for distant scenery.
5. Make water substantially darker, more natural, more varied by real-world
   setting, and visibly interactive. The owner specifically rejected the light
   cyan/blue appearance.
6. Keep grass and tree density, but replace the goofy conical tree bases with
   believable trunk collars, roots, and ground contact. Rework tree crowns and
   leaves so close trees have smaller coherent sprays, broken silhouettes,
   value variation, and directional light response rather than luminous blobs,
   flat sheets, or starburst spikes.
7. Add distant treelines across the full height of mountain faces, not only at
   ridge tops. Use several irregular forest belts from lower slopes through
   mid-slopes and selected high shelves, with clearings, recesses, density
   changes, exposed rock, and atmospheric separation. The belts must follow
   the terrain and overlap in depth instead of reading as horizontal cardboard
   strips or identical repeated cones.
8. Keep day/night variety and readable practical lighting. Do not revive the
   cancelled general rain/snow/fog/weather system.
9. Match or beat the old appearance on Low quality while preserving the current
   performance improvements and avoiding measurable frame-time, loading,
   retained-memory, shader-compilation, or resource-count regression.

### New mountain-treeline reference

The owner's latest reference shows forest coverage distributed over the entire
visible mountain face: dense foreground conifers, a lower dark belt, broken
mid-height stands, higher shelf treelines, and sparse upper growth under the
summits. It is not a peak-only fringe.

Reference image at handoff:

`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/codex-clipboard-0a58aeee-ee5e-40ef-847d-ebfb098f5012.png`

This is a temporary macOS path. On explicit resume, copy it to a QA-only
evidence directory before relying on it. Do not commit it as a shipped asset.

A performant implementation should spend the existing horizon geometry or
material budget on several terrain-following canopy masks/bands. Prefer merged
geometry, existing row buffers, deterministic vertex color/mask variation, or
a horizon shader treatment. Do not populate distant mountain faces with
thousands of individual tree objects, add per-frame CPU placement, introduce a
new texture family without measuring residency, or increase draw calls merely
to satisfy the reference.

## Primary current visual candidate — preserve exactly

Worktree:

`/Users/kevinliu/.codex/worktrees/cot-restore-1049-visuals-20260911`

Branch: `codex/restore-1049-visuals-20260911`

Base/HEAD: `010faabc2982d6db79a62096c4472efb537eea22`, equal to the fetched
`origin/main` at stop time.

State: 13 tracked files modified, none staged, no candidate commit. Preserve
every modification. The tracked draft contains 303 insertions and 196
deletions. The interrupted audit invocation also left the untracked
`.qa-map-environment/report.json` (about 1.8 MB) and this handoff document.
Treat the report as partial diagnostic output, not accepted rendered evidence.

Modified files:

- `src/engine/lighting.ts`
- `src/engine/quality.ts`
- `src/engine/quality.selftest.mjs`
- `src/engine/sky.ts`
- `src/fx/effects.ts`
- `src/fx/trackContact.selftest.mjs`
- `src/world/maps/horizon.ts`
- `src/world/horizonVerdant.selftest.mjs`
- `src/world/shallowWater.ts`
- `src/world/shallowWater.selftest.mjs`
- `src/world/waterContact.ts`
- `src/world/vegetation.ts`
- `tools/map-environment-audit.mjs`

### What the draft currently does

- Restores the 1049 shadow-body response with ambient RGB dim
  `[0.80, 0.88, 1.0]` and shadowed specular factor `0.55`. It keeps the current
  stable PCF, cascade lifecycle, instrumentation, and resource handling.
- Gives Low the 1049 shadow allocation and range:
  `[2048, 2048, 1024, 1024]`, maximum distance `380 m`. Higher tiers keep the
  current `520 m` coverage.
- Restores the classic cloud deck altitude (`620 m`) and horizon haze constant
  (`0.00023`) while retaining current sky caching and cleanup.
- Restores the 1049-style horizon row spacing and silhouette profiles for
  default, rolling, escarpment, mesa, and alpine styles. It retains current
  resource ownership, subdivisions, seam protections, sea openings, and
  selected map-specific geology.
- Removes the newer Verdant-only watershed horizon routing and returns Verdant
  to the common rolling/classic material path.
- Adds dark, distinct water profiles for coast, lake, river, marsh, polder,
  fjord, Saltwind, reservoir, oasis, monsoon, and autumn water.
- Adds depth darkening, moving two-scale surface breakup, shore tint, subtle
  crests, bounded specular, and profile-specific waves to the existing shallow
  water shader.
- Strengthens the existing pooled vehicle wake without adding a fluid solver,
  new pool, or unbounded particles.
- Replaces the literal sideways cone roots and wide cone-like trunk pedestals
  on near trees with eased root collars and low tapered root ridges. The parts
  remain merged into the existing instanced bark draw.
- Makes broadleaf cards smaller, more varied in aspect, more tangent to the
  crown, darker through the crown interior, and less vertically biased in
  lighting. This is an unreviewed visual draft.
- Adds `--preset=low|medium|high|ultra` to the map environment audit tool.

### Candidate evidence already captured

These captures predate the final dark-water values and all tree root/leaf
changes. They prove only the earlier horizon direction:

- `/private/tmp/cot-restore-1049-r1/shots/verdant/establishing.png`
- `/private/tmp/cot-restore-1049-r2/shots/desert/establishing.png`
- `/private/tmp/cot-restore-1049-r2/shots/coastal/establishing.png`
- `/private/tmp/cot-restore-1049-r2/shots/coastal/detail.png`
- `/private/tmp/cot-restore-1049-r2/shots/coastal/water-current.png`
- `/private/tmp/cot-restore-1049-r2/shots/coastal/water-interaction.png`
- `/private/tmp/cot-restore-1049-r2/shots/coastal/water-shore-0.png`

Verdant and Desert looked materially closer to the requested older image. The
Coastal captures confirmed that the earlier water revision was still too light
and cyan; the darker second water revision has not been rendered.

### Candidate checks and open failures

Passed before the stop:

- `src/engine/quality.selftest.mjs`
- `src/engine/skyCloudBake.selftest.mjs`
- `src/engine/skyHorizonCache.selftest.mjs`
- `src/fx/trackContact.selftest.mjs`
- `src/world/shallowWater.selftest.mjs` after the final shader/profile edits
- `src/world/treeTrunkQuality.selftest.mjs` after the new root geometry:
  13 species × 3 variants, minimum 98.3/100
- Typecheck/core-unused check after the new root and broadleaf geometry

Known incomplete or failing work:

- `src/world/horizonVerdant.selftest.mjs` and
  `src/world/horizonResources.selftest.mjs` still encode the rejected newer
  horizon hashes/mesa geometry. Replace them only with meaningful safety and
  accepted-art-direction contracts after visual approval; do not simply weaken
  the gates.
- `src/world/horizonMesaSurface.selftest.mjs` passed before the final global
  horizon restoration and must be rerun.
- `src/world/broadleafBranchlets.selftest.mjs` failed during an experimental
  atlas-shrink attempt. The painter behavior was then restored, leaving only a
  comment difference, but the test was deliberately not rerun after the hard
  stop.
- No native rendered evidence exists for the final darker water, root ridges,
  narrowed trunk collars, or revised broadleaf cards.
- No full representative biome sweep, mobile sweep, night sweep, production
  build, complete relevant test suite, or matched performance/memory comparison
  has been completed.
- The new full-height mountain treeline requirement is documented here only;
  it has not been implemented.

## Visual baselines and overlapping map draft

### Exact historical reference

`/Users/kevinliu/.codex/worktrees/cot-visual-baseline-1049e4e-20260911`

Detached at `1049e4e318b7a2187f98f729b91e772530ce7103`, clean. Use it for
matched old captures and source comparison. Never edit or treat it as a branch
to merge.

### Large overlapping map/Frontier draft

`/Users/kevinliu/.codex/worktrees/cot-launch-map-visual-audit-20260911`

Branch `codex/launch-map-visual-audit-20260911`, HEAD `d121db465`, 16 commits
behind current origin, no unique commits, 47 working-tree entries. It overlaps
`lighting.ts`, `horizon.ts`, `terrain.ts`, and `vegetation.ts` with the primary
candidate. It also contains untracked Frontier modules/tests, static shadow
cull code/tests, one research file, and roughly three dozen `.qa-*` scripts.

Do not merge or copy this worktree wholesale. On resume, inspect and extract
only independently useful product work with matched current-main tests and
captures. Keep all `.qa-*` scripts and evidence out of product commits unless a
specific tool is intentionally adopted. Its tracked diff is only 21 insertions
and 5 deletions across six files; the untracked files account for most of its
apparent size.

## Launch-day worktree register

Git reported 598 total worktrees, 316 under
`/Users/kevinliu/.codex/worktrees`, and 27 whose path contains `20260911`.
This is an inventory problem as well as a development problem. Do not delete or
mass-clean any worktree. Git ahead/behind counts cannot establish semantic
equivalence because many changes were rebased, cherry-picked, or published
through successor commits.

The counts below are `behind origin/main / ahead of origin/main`; dirty is the
number of porcelain status entries observed at the stop.

| Worktree | Behind / ahead | Dirty | Required disposition |
|---|---:|---:|---|
| `cot-launch-abrams-construction-20260911` | 4 / 2 | 5 | Preserve exact cache/native-selection evidence; reconcile two local commits before any port. |
| `cot-launch-autumn-publish-20260911` | 16 / 0 | 2 | Historical published checkpoint plus local evidence; no source merge. |
| `cot-launch-chieftain5-track-20260911` | 67 / 1 | 0 | Preserve the fitted Mk5 track/roller commit; port only after current source qualification and tank gates. |
| `cot-launch-final-20260911` | 28 / 1 | 2 | Preserve launch/night-lighting record; inspect the unique commit and dirty evidence separately. |
| `cot-launch-fleet-efficiency-20260911` | 25 / 1 | 5 | Preserve Challenger 1 X efficiency draft; resume only through fleet release gates. |
| `cot-launch-garage-buffer-residency-20260911` | 20 / 2 | 14 | Preserve desktop Garage buffer policy work and evidence; reconcile with current Garage lifetime code. |
| `cot-launch-garage-publish-20260911` | 0 / 0 | 4 | Current-main reference with four untracked QA scripts; product source is clean. |
| `cot-launch-ground-sampler-20260911` | 23 / 13 | 4 | Preserve C1/ground-sampler chain; review commits individually, never merge wholesale. |
| `cot-launch-horizon-surface-20260911` | 23 / 3 | 4 | Preserve Saltwind/shared-ground-water work; compare with the new water/horizon candidate. |
| `cot-launch-immutable-gear-20260911` | 27 / 0 | 0 | Historical branch with no unique commits; current main is authoritative. |
| `cot-launch-k1-armed-qualification-20260911` | 16 / 3 | 15 | Preserve owner-selected armed K1 qualification work; reconcile unique commits and generated evidence. |
| `cot-launch-low-pin-stock-20260911` | 23 / 5 | 110 | High-risk mixed draft. Preserve everything; identify exact tank-owned changes before extracting any subset. |
| `cot-launch-map-view-framing-20260911` | 1 / 0 | 4 | Current successor is in main; retain local evidence only. |
| `cot-launch-map-visual-audit-20260911` | 16 / 0 | 47 | Overlapping map/Frontier draft described above; selective source review only. |
| `cot-launch-material-owners-20260911` | 5 / 0 | 2 | Main contains the successor; retain evidence and do not reapply. |
| `cot-launch-material-residency-20260911` | 21 / 0 | 13 | Preserve river/Monsoon material evidence; compare current main before extracting dirty work. |
| `cot-launch-proto-reference-20260911` | 674 / 0 | 1 | Detached historical oracle; reference only, never merge. |
| `cot-launch-publish-20260911` | 20 / 0 | 0 | Published river checkpoint; historical reference only. |
| `cot-launch-sepv2-source-frame-20260911` | 5 / 1 | 1 | Preserve the owner-selected supplied SEP v2 target and inspect the one unique commit. |
| `cot-launch-t72-material-lifetime-20260911` | 5 / 2 | 2 | Preserve and reconcile T-72 lifetime work against current material ownership. |
| `cot-launch-t90-polish-lifetime-20260911` | 1 / 0 | 13 | Main contains the branch head; inspect dirty T-90 work/evidence without wholesale staging. |
| `cot-launch-track-palette-20260911` | 5 / 0 | 8 | Main contains the successor; retain dirty palette evidence until reconciled. |
| `cot-launch-type99a-muzzle-datum-20260911` | 4 / 0 | 20 | Main contains the branch head, but dirty Type 99A work remains unqualified; preserve all entries. |
| `cot-launch-water-evidence-20260911` | 25 / 2 | 2 | Preserve the two water commits and evidence; compare with the current darker-water candidate. |
| `cot-launch-water-motion-review-20260911` | 16 / 1 | 12 | Preserve actual moving-water review and dirty evidence; do not duplicate pools/effects. |
| `cot-restore-1049-visuals-20260911` | 0 / 0 | 13 | Primary current visual candidate. Preserve and finish here after explicit resume. |
| `cot-visual-baseline-1049e4e-20260911` | 998 / 0 | 0 | Clean detached visual oracle only. |

Before cleanup, create a machine-readable fresh inventory from
`git worktree list --porcelain`, then for every branch record status, ancestry,
patch equivalence, semantic successor, unique source files, generated evidence,
and owning workflow. A branch is removable only after all unique source and
evidence has an acknowledged durable home. Worktree removal requires a separate
owner instruction; this handoff does not authorize it.

## Older worktrees that remain explicitly relevant

The earlier handoff remains authoritative for older history and must be read in
full:

`/Users/kevinliu/.codex/attachments/9b3c116e-2358-4938-8d42-8d7fb40b7f20/pasted-text.txt`

It contains the complete fleet, environment, performance, Studio, recovery,
publication, and cleanup history. The most important still-open physical
worktrees are:

| Workflow | Worktree | State at this stop |
|---|---|---|
| Challenger 3 / 3 X and Strv mixed draft | `cot-challenger-gear-efficiency-20260910` | 20 dirty entries; preserve, do not combine releases. |
| Strv 122 X integration | `cot-type10-durable-release-20260910` | 4 dirty generated entries; earlier anatomy check was interrupted. |
| Performance rollup | `cot-battle-era-audit-20260910` | 5 dirty evidence/doc entries; preserve measurements. |
| Garage draw range | `cot-garage-draw-range-20260910` | 1 dirty entry. |
| Terrain wet layer | `cot-terrain-wet-layer-20260910` | 1 dirty entry. |
| Plaster sharing | `cot-plaster-surface-sharing-20260910` | 2 dirty entries. |
| Player program readiness | `cot-player-program-ready-20260910` | 5 dirty entries. |
| Deployment FX experiment | `cot-fx-program-experiment-20260910` | 2 untracked entries. |
| Frontier crown volume | `cot-frontier-crown-volume-r15-20260910` | 4 untracked tools/evidence entries. |
| Interactive performance | `cot-interactive-performance-20260909` | 15 dirty entries. |
| Far-tree LOD grounding baseline | `cot-tree-lod-grounding-20260910` | Clean at old `465a68f7c`; superseded as implementation base, still useful evidence. |
| Terrain wall-normal candidate | `cot-redrock-road-surface-20260910` | Clean local history; cherry-pick only `5dbfbea3b` after current-main native validation if still needed. |

Also preserve all recovery refs, detached baselines, Studio media, supplied tank
references, and temporary QA evidence listed in the earlier handoff. Do not
assume an old branch is unfinished merely because it is ahead, or finished
merely because it is behind.

## Fleet work still open from this conversation

The environment pass does not replace the fleet handoff. Finish both before
calling the launch complete.

### Challenger 3 X

The owner approved Challenger 3 X itself as the comparison/qualification target
when the external target was missing. Record that decision in the eventual
qualification receipt rather than reopening the same question.

The owner then marked a caved-in rear section of the base turret. The supplied
surface markup selected face 2 on mesh `turret`, local bounds
`[-1.05, 0.10, -3.34]` to `[0, 0.52, -2.55]`, centroid
`[-0.35, 0.25667, -3.05333]`, at neutral hull/turret/gun pose. Challenger 3
without the X treatment was said to look correct.

An isolated completed repair exists at:

`/Users/kevinliu/.codex/worktrees/cot-challenger3x-rear-repair-20260910`

Its relevant commits are:

- `7210a4657` — close Challenger 3 X rear turret cavity under the existing roof
- `e9c4f489f` — isolate timed Garage construction from concurrent fleet workers
- `51eb182f1` — record full validation of the rear cavity repair

The branch is old and far from current main. Do not merge it wholesale. Inspect
and port the bounded repair to a fresh current-main fleet checkpoint, then run
the complete combat-anatomy and targeted tank release sequence.

### K1A1 X

The owner explicitly chose: keep the armed version and compare the roof gun
against its documented photo reference. Do not qualify it against the unarmed
supplied model. Current main already contains commits describing that decision;
reconcile the remaining dirty K1 worktree rather than asking again.

### M1A2 SEP v2 X

The owner explicitly chose the supplied model's roof equipment and antennas
over the conflicting published `3.44 m` height. Preserve that target in the
dimension/source receipt. Current main contains the target-selection fix;
inspect the one remaining unique source-frame commit before deciding whether
anything else is missing.

### Remaining fleet pass

Continue the complete requirements in the older fleet handoff: all new/X tanks,
Leopard 2 Revolution, and named older vehicles require fitted efficient running
gear, correct real-world return rollers, country-appropriate complete visible
track stock, closed chassis/fender/skirt interfaces while retaining lower wheel
visibility, correct camouflage/material ownership, proper bores and mounted
guns, appropriate Shtora equipment, and measured HIGH/LOW plus actual selection
performance. Supplied models remain comparison inputs only; playable vehicles
stay first-party procedural.

Every geometry/profile release still requires:

```text
npm run tank:anatomy:update
npm run tank:anatomy:check
npm run tank:release:check -- --ids=<ids> --gate
```

Do not stage a whole mixed fleet worktree or regenerate the entire fleet when a
targeted independently releasable checkpoint is sufficient.

## Performance gains that must survive

The visual restoration must be layered over current implementations. Preserve:

- staged/lazy construction and first-use preparation already published on main;
- immutable shared tank geometry and material ownership fixes;
- offscreen warmup and shader/program preparation boundaries;
- bounded pools for wakes, tracks, particles, decals, and effects;
- terrain and horizon buffer reuse, finite row/segment budgets, cached samples,
  deterministic generation, and disposal/resource-lifetime ownership;
- current road support, terrain query, collision, map streaming, and vegetation
  partitioning work;
- Garage draw-range, buffer-residency, material-residency, and tank-switching
  gains after they are reconciled with their authoritative current successors;
- Low-tier texture, alpha coverage, foliage stability, and shadow-budget
  constraints;
- zero new per-frame allocation in established hot loops.

Never restore 1049 by checking out whole old files. Compare each visual constant
or algorithm and port the smallest visible behavior while retaining current
caches, guards, ownership, cleanup, tests, and performance fixes.

For each accepted environment batch, compare the same map, seed, camera,
quality tier, light state, and browser build. Record construction time, first
touch, steady frame timing, draw calls, triangles, shader/program count,
texture/buffer count, and retained memory. A prettier still image alone does not
prove the no-regression requirement, and a lower triangle count alone does not
prove better interaction.

## Resume sequence after explicit authorization

1. Fetch `origin/main` and reread project/world/engine/tools skill instructions.
   Do not touch the shared checkout.
2. Preserve the primary visual candidate and review its 13-file diff against
   the newly fetched main. Rebase through a clean integration worktree only
   after the candidate is understood and backed up.
3. Capture matched 1049, current-main, and candidate images on Low first for
   Verdant, Desert/Badlands, Coastal/Fjord, Alpine/Winter, urban/industrial,
   river/delta/marsh, and night maps.
4. Finish the current shadow, sky, horizon, dark-water, wake, root, and leaf
   drafts. Repair meaningful tests; render the final result before accepting.
5. Implement the new full-height mountain-face treeline direction within the
   existing horizon/material budget. Verify lower, middle, and upper slope
   coverage from gameplay and establishing cameras.
6. Review all map-detail worktrees. Extract only current, useful product changes
   and add biome-specific environmental storytelling until every map is fully
   dressed. Exclude experimental QA scripts from release commits.
7. Reconcile the 27 launch-day worktrees and the older named worktrees. Mark
   each as published successor, unique work to port, evidence-only, baseline,
   or still-owned draft. Keep the full 598-worktree inventory until this audit
   is durable.
8. Finish Challenger 3 X, K1A1 X, SEP v2 X, Strv 122 X, and the remainder of
   the fleet handoff as separate verified checkpoints.
9. Run focused checks while iterating, then the relevant world/engine/fleet
   suites, typecheck, production build, native WebGL shader compilation, and
   final full release gates.
10. Compare desktop and representative mobile/tablet performance and retained
    resources. Resolve regressions rather than waiving them.
11. Rebase, integrate, and push only coherent verified commits without force.
    Deploy and verify the public build only after the product and evidence gates
    are green.

## Definition of complete

Completion requires actual rendered approval across the map catalog, natural
dark varied interactive water, old-quality sky/horizon/shadow depth, detailed
non-bare environments, convincing close and distant vegetation including
mountain-face treelines, correct road/spawn/objective behavior, preserved night
readability, all remaining fleet decisions and repairs, green release gates,
and matched evidence showing that current loading, memory, resource, and frame
performance gains remain intact.

At this handoff, that definition has not been met. Work remains deliberately
stopped.
