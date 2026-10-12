# Physics lane handoff (2026-10-12, stand-down)

Owner row (2026-10-10 00:40): "make turret popping a lot better bc it blows up nicely but then the turret snaps into a
pre-ordained resting position. same with building destruction, just let physics work for these kinds of things".

## Owns
- `src/sim/rigidBody.ts` — deterministic rigid-body engine (contact spheres + box solids, sequential impulses, warm
  start, split impulse, sleep). Box manifold (SAT, face clipping, edge-edge) on physics/box-manifold.
- `src/sim/wreckTurrets.ts` — authoritative wreck-turret body (launch law, profile, settle); used by `state.ts` and
  `authoritativeMatch.ts`.
- `src/vehicles/wreckTurretDriver.ts` + `wreckTurretDriverLoader.ts` — the drawn turret follows its body; loaded lazily.
- `tankFactoryCore.ts` wreck-turret hooks (`ensureTurretDriver`, `launchDestroyedTurret`, `setWreckTurretPose`,
  `awaitWreckTurretPose`); `battleWarmAccess.ts` / `combatWarmComposition.ts` driver preload.
- Wire 5 WRECK_BODY: `src/mp/wire/{constants,messages,quantize,rows}.ts`, `server/match/entityRows.ts`,
  `src/mp/match/interpolation.ts`, `src/mp/presentation/battlePresentation.ts`, `src/mp/host/migrationState.ts`.
- `src/game/killcam.ts` turret replay; `src/fx/debrisPhysics.ts` (debris pool; dcore's collapse code consumes it).
- Receipts: rigidBody, wreckTurrets, wreckTurretDriver, wreckTurretDriverLoader, wire/wreckBody,
  presentation/wreckTurretSync, debrisPhysics, garagePresentation (body semantics), sim-determinism-audit additions.

## Passed (gate / wave, SHA)
- Wave 369: turret pops at 7420887e2 PASSED strongly (after wave 356).
- 218 landing:
  - 7420887e2, then 0474dcd55: lazy driver, because the gallery bundle was +32 KB gzip.
  - Then 1454ebeb0: the materialQuality.selftest:65 window.
  - f17 merged 0474dcd55 into 218 d9e00cdef. 1454ebeb0 was sent to f17 for merge.
  - The 218 tree's bundle budget PASSED: gallery 76 requests / 667,822 gzip; game 126 / 1,158,633.
- Receipts:
  - 31 PASS on 217 + 0474dcd55 (`rcpt-lazy`).
  - On 1454ebeb0 (`rcpt-lazy2`): 16 PASS. eraWholeFitReuse and ownedFittingGeometry hit a child ETIMEDOUT (180 s cap) at load 325-409. Neither failed an assertion, and their anchors are untouched. They are not yet re-confirmed at low load.
- Wave 409 FAILED for bf5439dc1 (box-manifold perf: staticBox, solver order, impact bug). Replaced by 311ca3743.

## Pending (waits on)
- **physics/box-manifold 311ca3743.** It is bit-exact to 879f22cc9 except that both bodies of a contact report landings. It keeps the CPU win: 1.06-1.30 ms vs 1.58-1.69 ms on dcore's pool bench.
  - It waits on **wave 423**: the solver-only barn/house collapse vs dcore's fr-7h/fr-8j. It is packed and waits on the coordinator's launch.
  - Then it rides in dcore's fracture package feat/fracture-r2 (d75b6c4be already has it) for 219+.
- **pop-218**, the turret-pop no-regression check for 879f22cc9/311ca3743 (219+, not a 218 gate). Frame status:
  - A arm (7420887e2) is complete: `wave/strips/pop1-f218/A` plus `pop2-b4/B`. A is deterministic: 122/122 frames are byte-identical across runs.
  - B (1b587928a, `roots/f218`) has pop-kv2, shot-m1 and pop-m1-rest in `pop2-f218/B`.
  - B is missing pop-t90-side and pop-m1-near: another process held port 5461 despite the port mutex.
  - The re-film job was withdrawn at stand-down (`wave/jobs/withdrawn-pop1-f218b.json`).
  - Resume: resubmit that job (it runs `wave/pop-arm.zsh` on the runner's {PORT}), then run `python3 wave/pack-218.py` and send the result to the wave builder.
- **f17:** merge 1454ebeb0 into 218, then re-run materialQuality. f17's workers-step p2p.test.ts timeouts (load about 190): there is no wire-5 coupling, because the rooms Worker's 37-file import closure has no file physics touched.

## Open defects / critic asks
- Wave 369 follow-ups (coordinator):
  - T-90M ~0.7 s end-stand before going over;
  - weathervane tumble in flight;
  - dense-heap settling (thin long boxes jitter on piles: dcore's field hut);
  - whole-match burn-out tick re-measure in fifo2.
- physics/edge-rest-throw 72e970ad2 ("throw clear of its own fireball and hull ends", b5) is HELD and not in any landing.
- dcore's collapseBodies "came down" was marginal on e9b4b8282 + the impact fix (2.26 vs 2.24). Check dcore's package receipt.
- By design of the bundle fix, the gallery damage lab and the garage show the old scripted pop; battles, rooms, the Studio and shots show bodies.
- Tooling defects:
  - The fifo2 port mutex didn't stop a foreign process from taking 5461.
  - .qa-dev/fx-strips-pin.mjs exits 0 when one arm fails. `pop-arm.zsh` checks every case.

## Next (and why)
1. f17 lands 1454ebeb0 in 218. It is the only red from the physics landing.
2. The coordinator launches wave 423. 311ca3743 is dcore's critical path for the fracture package.
3. Re-film the two missing B cases and send pop-218. It is the last turret check before the engine change rides in 219+.
4. Then the edge-stand and weathervane follow-ups: they are the visible critic asks on the turret.

## Branches / SHAs (all pushed)
- physics/rigid-body = physics/lazy-wreck-driver = 1454ebeb0 (218 landing)
- physics/box-manifold = 311ca3743
- physics/edge-rest = 7420887e2
- physics/edge-rest-throw = 72e970ad2 (held)
- physics/debris-pool = 83119990f
- physics/backup-20261012: the lane's gitignored probes and harness, its scripts, packers, job files, receipt summaries and this handoff, under `lane-backup/physics/`. Nothing lands from it.

## Kept in the scratchpad (for pending items only)
- `physics/wt`: box-manifold worktree; owns node_modules and the .qa-dev harness.
- `physics/roots/f218`: B dist.
- `physics/wave/strips/{pop1-f218,pop2-f218,pop2-b4,collapse-fx2}`.
