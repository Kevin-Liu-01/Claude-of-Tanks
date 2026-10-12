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

---

# physics lane — RESUME (updated 2026-10-10 ~07:40)

Owner (00:40): "make turret popping a lot better bc it blows up nicely but then the turret snaps into a pre-ordained
resting position. same with building destruction, just let physics work for these kinds of things".

- Worktree: $SP/physics/wt, branch physics/rigid-body pushed at 4ce5473d8 (main 786e24b97 merged).
- physics/debris-pool 83119990f (dcore's engine+pool branch; dcore merged an earlier head into feat/collapse-bodies).
- Sparse main worktree for inherited-red checks: $SP/physics/mainwt (detached bc14a08b6, src/tools/server/shots only).
- Scratch probes in wt/.qa-dev/ (gitignored): turret-strip.mjs, live-pop-probe.mjs, pop-hitch-probe.mjs,
  wreck-bandwidth.mjs, mp-soak-wreck.mjs, affected-receipts.mjs, wedge-creep.mjs (+ wedge-dbg/speed, rigidBodyDbg.ts),
  fx-strips-pin.mjs (+ patient-lock, fx-locate, clip-motion).
- Coordinator = "main". dcore = a96bf062744e577cc. f17 = adfc0f4b4b146f0f7. Wave builder = aa82a418c089d23bb.

## Done since 05:55
- d77bffc23: the flying turret keeps its rig's fitted scale (T-90M family 0.95 x 0.65 x 0.913); reset restores it.
- 83119990f (engine): wedged piles rest — shared SAT axis per box pair (bodies and kinematic hulls), sphere's own depth
  capped at the overlap; static contacts warm started by sphere, corner features by place; speculative corners; no edge
  kick, no support veto. 300 random piles all sleep < 20 s. rigidBody.selftest has 40 of them.
- 9462e9dab killcam replays the live turret track; b23e61110 lazy age-0 driver start.
- Bandwidth (14v14 bots, Verdant, 20 kills): WRECK_BODY 165 B/s avg per all-seeing viewer (0.64 % of rows), peak 1.1 KB/s.
  Sent to f17.

## Receipts
- Pass 1 (183, at 9462e9dab): 181 PASS; equipmentDamage FAIL (scale bug, fixed); fidelity-visibility FAIL inherited
  (same assertion on main bc14a08b6: $SP/physics/rcpt/fidelity-main.log). Summary $SP/physics/rcpt/summary.txt.
- Pass 2 (42 receipts reaching engine/visual, at 4ce5473d8): running, $SP/physics/rcpt2/summary.txt (pacing/bots last).

- Pass 3 (878 node receipts whose import closure reaches the 33 changed files, never run in pass 1/2; text readers and
  non-vehicle first): $SP/physics/rcpt3/summary.txt, workers receipts5.zsh (launched by bg task after pass 2). 3 browser
  lease receipts held back ($SP/physics/receipt-lease3.txt) for fifo2/f17. a4cb8862e: garagePresentation receipt
  updated to the body semantics (it asserted the canned arc's spin).

## Status 10:30
- Receipts: 1,066 unique PASS over passes 1-3 (+ garagePresentation standalone at a4cb8862e). 10 fleet-geometry reds
  (need gitignored public/models: identical without assets on both sides) + 3 browser-lease receipts handed to f17's
  merged-tree closure (coordinator's ruling: don't re-run fleet geometry ourselves).
- Builds: physics/roots/a2 = main 786e24b97 (built in $SP/physics/mainwt, now a full checkout), physics/roots/b2 =
  a4cb8862e. b2 sanity strips in $SP/physics/strips/b2check (T-90/M1/plain kill OK).
- fifo2: physics-pop1-b2 + physics-pop2-b2 (split 'pop-wave', stamp 1791397983225, priority) -> $SP/physics/wave/strips/
  pop{1,2}-b2 (+ .done); physics-cost-tick-hitch (timing, stamp 1791397983289) -> $SP/physics/cost/out (sim-tick.jsonl,
  hitch/hitch-summary.json, job.log). Don't change wt's sim code or mainwt before the cost job runs (it reads both trees).
- Next: when the wave strips land, build the packet for the wave builder (aa82a418c089d23bb), copy the coordinator;
  read the cost results; then f17 gets the landing sha (wire 5 in its own batch).

## Blocked / next
- DISK critical (9.7 GB at 07:38). B dist b1 pruned; wave jobs physics-pop{1,2}-b1 withdrawn (files in
  $SP/physics/wave/jobs/withdrawn-*). When disk allows: `zsh $SP/physics/build-b.zsh b2` (build1 lock), then
  `node $SP/physics/wave/submit-pop.mjs --b=b2`.
- Coordinator rulings pending: priority band for the wave; cost gate (v3 vs sim-tick CPU A/B + pop-hitch probe).
- Then: f17 landing sha with gate results (wire 5 in its own batch; f17 runs wire/mp/pacing/readers on the merged tree).

## Status 11:05
- Wave strips landed (pop1-b2 446 s, pop2-b2 489 s). One root, APFS clones: physics/wave/strips/pop-wave/{A,B}/<case>, with
  manifest.json. Sent to wave builder aa82a418c089d23bb (+ coordinator) at 11:04. Review sheets: physics/wave/strips/sheets.
  B: T-90M turret tumbles off beside the hull, M1A2 falls back askew onto its own deck, KV-2 topples onto the ground;
  shot-m1 plain kill: A and B match.
- Cost job physics-cost-tick-hitch is pending (~20th, behind the priority band). Outputs go to physics/cost/out.
  Don't touch wt sim code or mainwt until it has run.
- Next: wave verdict -> fix anything flagged in the after-defects; cost results -> report; then f17 gets the landing sha.
- 11:15: merge-tree a4cb8862e x origin/main 16422db6a is clean (only tools/selftest-suites.mjs on both sides).
  f17 hand-off draft: physics/f17-handoff-draft.txt (fill in wave no. + cost numbers).
  Profile bench (.qa-dev/profile-bench2.mjs): median turret profile 0.07-0.11 ms; outliers are GC (124 ms
  mark-compact after the fleet load), so the profile is not a kill-time hitch.
  Validation hitch run (B only, load 60): 2 long frames, 150.8 ms at kill3+180 ms and 239.8 ms at kill4+1.6 s, not at
  kill 1, so not a first-use compile. Compare A vs B in the real job before acting.

## 12:20 wave 356 FAILED (drops: t90 -0.8/-1.2 zoom, m1-near zoom -0.7; kv2 +0.8/+1.0) -> fix on physics/edge-rest
- Defects: T-90M "hangs" 0.9-2.2 s, then stands on its rim and rolls along the deck; M1A2 stands on its end
  1.2-1.6 s, then lands level and seated on its own hull; KV-2 stands on its end gun-up 2.2-3.0 s; tosses only
  2-4 m, inside the fireball.
- Causes (scratch probes in wt-edge/.qa-dev: edge-test, edge-stats, edge-trace, end-stand, end-trace,
  rest-margins, outline-dump, outline-fleet, flank):
  - The box contact layout: flat flank and bustle faces a real turret doesn't have; the T-90M box roof sits 0.6 m
    above its real roof (the sight).
  - Sleep froze near-balanced bodies (a box 0.5 deg off its edge slept balanced).
  - The weak throw.
  - Damping and friction are not pinning anything: edge falls match the analytic pendulum to within 2%.
- Fix 79c77a94a (worktree $SP/physics/wt-edge, branch physics/edge-rest from a4cb8862e, NOT pushed yet):
  - Throw = sqrt(2*160 kJ/kg*charge*(0.6-1.4)/turretKg), capped 8-19 m/s; side 1.8-4.4 m/s; tumble 1.4-3.6 rad/s.
  - Contact points on the armour envelope (42 directions plus a base grid); the box part gains a `points` option.
  - Sleep veto when a body speeds up during its quiet window.
  - Selftests updated: rigidBody (edge tip time, contact points), wreckTurrets (throw scaling, outline, flank,
    bustle).
- b3 = 79c77a94a built (roots/b3). b2 pruned. Old wave strips pruned.
- Re-film: fifo2 physics-pop1-b3 + physics-pop2-b3 (A=a2, B=b3, stamp ...225 priority, split pop-wave), strips in
  wave/strips/pop{1,2}-b3. Cameras changed: m1-near back to 34 m (lookAt y 6), kv2 lookAt y 5.5, m1-rest wide
  (160,7.5,412) fov 55. Wave 356's cameras are kept in wave/pop-scenes-w356.mjs.
- Cost job swapped: physics-cost-tick-hitch3 (same stamp ...289) measures wt-edge/b3 vs mainwt/a2. The old job's
  file is in cost/withdrawn-cost-tick-hitch.json.
- Receipts: receipts-edge.zsh (1 worker, nice 19) over edge/run-list.txt (153 behavioural receipts) ->
  rcpt-edge/summary.txt.
- Next: when the strips land, build the pop-wave packet (manifest as before), send it to the builder + coordinator.
  After PASS: fast-forward physics/rigid-body to physics/edge-rest (push), then hand f17 the sha.

## COLD-RESUME STATE (12:45, owner leaving; written for a restarted session)
Branches (all pushed, trees clean):
- physics/rigid-body = a4cb8862e (the wave 356 build; wire 5; NOT the landing candidate any more)
- physics/edge-rest = 79c77a94a (fix for wave 356, pushed). Worktree: $SP/physics/wt-edge (node_modules -> wt's).
  The landing candidate. When the wave PASSes, fast-forward physics/rigid-body to it:
  cd $SP/physics/wt && git fetch origin && git merge --ff-only origin/physics/edge-rest && git push origin physics/rigid-body
- physics/debris-pool = 83119990f (dcore merged it into feat/collapse-bodies already).
Dists: roots/a2 = main 786e24b97 (A); roots/b3 = 79c77a94a (B). (b2 pruned.)
Queued fifo2 (status: node $SP/fifo2/bin/status.mjs | grep physics):
- physics-pop1-b3 DONE ok 12:21 -> wave/strips/pop1-b3 (pop-t90-side, pop-m1-near; A+B)
- physics-pop2-b3 pending, stamp ...225 priority, split pop-wave -> wave/strips/pop2-b3 (pop-kv2, shot-m1, pop-m1-rest)
- physics-cost-tick-hitch3 pending, timing, stamp ...289 -> cost/out (sim-tick.jsonl, hitch/hitch-summary.json, job.log)
Next steps, in order:
1. When pop2-b3's done file has its "exit" line: python3 $SP/physics/wave/pack-wave2.py  (clones both parts into
   wave/strips/pop-wave2/{A,B}/<case>, writes manifest.json, review sheets in wave/strips/sheets2). Look at the sheets.
   Known: the T-90M case (pop1-b3 B) lands upright on its bustle at 2.7 s, stands about 0.5 s and topples by 4.1 s.
   The M1A2 flies about 10 m high and lies on the ground right of the hull.
2. Send the wave builder (aa82a418c089d23bb) the root wave/strips/pop-wave2 + manifest, with the coordinator ("main")
   copied, the same way wave 356 went.
3. Receipts: a detached worker (pid 45213, receipts-edge.zsh, nice 19) runs edge/run-list.txt (153 behavioural
   receipts) on wt-edge -> rcpt-edge/summary.txt. 42 PASS so far, 0 FAIL. If it dies, relaunch the same way; it skips
   PASSes; prune a dangling claim dir first.
4. After the wave PASSes and the cost job is read: ff physics/rigid-body (above), then SendMessage f17
   (adfc0f4b4b146f0f7) with the draft in physics/f17-handoff-draft.txt. Update the numbers: bandwidth on b3 is
   wreckBps 174.9 (0.66 % of rows), peak 1.16 KB/s, 20 kills, 18 bodies (edge/bandwidth-b3.txt). Merge-tree against
   origin/main must stay clean.
Open question (physics): end stands on the bustle can still happen. A 2.8 m tall turret falls slowly from near
vertical (about 1-2 s, physically right). Ideas if critics flag it again: a narrower end footing (no stable end
stance), soil compliance, a launch-law tumble bias. Measure with .qa-dev/edge-stats.mjs (endOver05s) and
.qa-dev/studio-pop-probe.mjs.

## 14:00 update (supersedes the cold-resume steps' build/strip names)
- pop1-b3 filmed OK, but its T-90M lands upright on its bustle and stands about 0.5 s before toppling. pop2-b3 TIMED
  OUT (Studio boot >300 s at load 186) and is pruned; its re-run pop2-b3r was withdrawn.
- New commit 7420887e2 (physics/edge-rest, pushed): the outline's upper end points stand back by 7 % of the length
  (at least 0.2 m), so a turret planted on an end has no footing there and goes over at once. Selftest: upright on
  its bustle it is going over within 0.8 s and down within 3 s.
- b4 build (7420887e2) launched detached at 13:57 (build-tree.zsh b4; waiting on build1, held by costland).
  When roots/b4 exists:
    node $SP/physics/wave/submit-pop.mjs --a=a2 --b=b4 --stamp=1791397983225   (pop1-b4 + pop2-b4, both arms)
    then re-point the cost job to b4 (withdraw physics-cost-tick-hitch3, resubmit cost-job3 with b4 + 7420887e2 at
    the same stamp ...289) and prune roots/b3.
- pack-wave2.py reads pop1-b3/pop2-b3: change `parts` to pop1-b4/pop2-b4 and the after sha to 7420887e2 before
  packing.
- Receipts worker (detached, pid 45213) runs on wt-edge. It started on 79c77a94a and picks up 7420887e2 for later
  receipts. At the end, re-run the wreckTurrets, rigidBody, driver and garagePresentation receipts on the head.

## 14:40 QUIET (coordinator 14:35): all my CPU work paused
- PAUSED with kill -STOP: receipt worker zsh 45213 and its child node 16795 (server/roadCrossingSweep.selftest.mjs).
  After the coordinator says "QUIET over": kill -CONT 45213 16795. fifo2 is paused: don't submit or edit jobs.
- The b4 wave packet went to the wave builder at 14:31 (strips/pop-wave2 + manifest); critics run after QUIET.
- b5 (held; the coordinator said don't film it yet): branch physics/edge-rest-throw, pushed, worktree $SP/physics/wt
  (switched from physics/rigid-body; the local physics/rigid-body branch is still at a4cb8862e). It raises the throw:
  250 kJ/kg, floor 9 m/s, side 2.2-4.8 m/s. To film it: TREE=$SP/physics/wt zsh build-tree.zsh b5, then
  submit-pop.mjs --a=a2 --b=b5 --stamp=1791397983225 (consider raising the cameras' look-at by about 2 m).
- Receipts so far on the fix: 73+ PASS, 0 FAIL (rcpt-edge/summary.txt).
- 14:45 wave builder: pop-wave2 = WAVE 369 (replaces 356). Packing waits for QUIET to end. Sheets at
  0.2/0.5/1/1.5/2/2.5/3/3.5/4/6 s, zoom strips for the new cameras, m1-rest one full-res still per arm. The B
  description is kept out of the brief. Verdict goes to me + the coordinator.
- 16:32 QUIET over (it ended 15:05, but the message came late): resumed 45213 + 16795 with kill -CONT. Wave 369 is
  being packed and critics launch next. Receipts: 74 PASS, 0 FAIL. At the end, re-run garagePresentation and
  equipmentDamage on the wt-edge head (7420887e2 touched wreckTurrets after they passed on 79c77a94a).
- Wave 369 packed (10-frame sheets 0.2-6 s, zoom strips 0.3-5 s, 10 s rest still); critics launched by the
  coordinator. Builder at pack time: B's turrets clear the fireball and land off the hull (T-90M right of the hull
  by 3.5 s, KV-2 left of it by about 2.3 s, M1A2 beside it in the rest still); A's drop back onto their decks.
- Turn ended at the coordinator's request (20-agent cap; critics need the slot). No harness watchers or monitors of
  mine are running. Only the detached receipt worker (45213, nice 19) keeps going. The coordinator will message me
  when wave 369's verdict and physics-cost-tick-hitch4 land. On resume: read this file, then rcpt-edge/summary.txt,
  cost/out/*, and the verdict.
- 00:12 the full behavioural pass FINISHED: 153/153 PASS, 0 FAIL (rcpt-edge/summary.txt; early receipts ran on
  79c77a94a, later ones on 7420887e2). A detached head pass (receipts-head.zsh, 8 turret-reading receipts on
  7420887e2) writes rcpt-edge/head-summary.txt.

## 04:10 (10-11) WAVE 369 PASSES (b4 @ 7420887e2): m1-near +3.1 (zoom +3.4), t90-side +2.3 (zoom +2.8), kv2 zoom +3.2
   (full +0.5), shot-kill control flat, no drops. b5 is not needed for this landing.
- Head re-check on 7420887e2: 8/8 PASS (rcpt-edge/head-summary.txt); the full pass is 153/153.
- LANDING once physics-cost-tick-hitch4 reads within budget (18th pending at 04:09, stamp ...289):
  1. read cost/out/sim-tick.jsonl (A vs B, kills / no kills) and cost/out/hitch/hitch-summary.json (frames > 33 ms,
     kill frames, B - A);
  2. cd $SP/physics/wt && git fetch origin && git switch physics/rigid-body && git merge --ff-only origin/physics/edge-rest
     && git push origin physics/rigid-body   (wt is on physics/edge-rest-throw now; switch it first);
  3. SendMessage f17 (adfc0f4b4b146f0f7): sha 7420887e2, wave 369 PASS, receipts 153 + head 8, determinism, MP,
     bandwidth (175 B/s, 0.66 %, peak 1.16 KB/s), merge-tree clean, cost numbers; wire 5 in its own batch; the fleet
     geometry + 3 lease receipts go to f17's merged-tree closure. Draft: physics/f17-handoff-draft.txt.
- Critics' follow-ups for a LATER round (not blockers): (a) turrets fly gun-up "like a weathervane": more tumble about
  the long axis; (b) an occasional ~0.7 s end-stand on the T-90M. Do them on a new branch from 7420887e2 in wt (NOT
  wt-edge, whose tree the cost job reads). b5 (physics/edge-rest-throw 72e970ad2) can be the base if a stronger throw
  is wanted. Shot-kill FX notes belong to FX (fx/8's 8o/8p).

## 08:00 (10-11) dcore's thin-piece jitter: FIXED on physics/box-manifold 879f22cc9 (pushed; from 7420887e2; worktree
   $SP/physics/wt is on this branch now)
- Three engine faults:
  (1) plain box pairs met only through spheres, so crossed rafters passed through each other -> box manifold (face
      clip up to 4 points / edge-edge), also vs kinematic boxes; own-points boxes (turrets) keep spheres;
      FEATURE_CACHE 32; restsOnBody uses pairContacts;
  (2) restitution/impact measured after earlier contacts' warm starts (pumping; a heavy slab on light beams spun
      them to 28 rad/s) -> warm starts in a 2nd pass;
  (3) the inertia floor: least principal inertia >= greatest/20.
- dcore's shed probe: field hut 41-45/45 (was 9-20), lean-to 42/42. Turret rest stats unchanged (200 launches each).
  rigidBody.selftest adds 3 tests (the old engine fails all 3). Receipts on the branch: wreckTurrets, driver,
  garagePresentation, equipmentDamage, wreckTurretSync, determinism, world-events scenarios, debris, rigidBody PASS.
  The world-events audit failed once under load 89, then passed twice (rc 0).
- NOT in the landing (7420887e2). It lands with dcore's fracture work or a later physics round (needs its own wave
  if turret visuals are re-judged). Message sent to dcore.
- Landing still waits only on physics-cost-tick-hitch4.
- 08:50 dcore: box-manifold merged as 4b4d59f00 into feat/prop-fracture; their collapsePieces receipt failed the
  "rowhouse: nothing faster than a fall" check (24.3 m/s). Diagnosed in my sparse scratch worktree $SP/physics/wt-frac
  (detached 4b4d59f00, src/tools/server only; its rigidBody.ts has a DBG accessor, never commit there):
  - not an engine fault: whole-pool energy never rises in any advance on the merged engine (the pre-merge engine
    shows +5..88 kJ jumps); the part speed is the 22.4 t gable's rim speed inherited at the crack (v + w x r).
  - dcore's fixes (sent): lever from the piece COM (r - rot(q, pieceShape(p).com)), and the fracture keeps K = 0.7 of
    the spin -> fastest 16.1 m/s, the receipt PASSes. No change to physics/box-manifold.
  - When dcore confirms: python3 prune.py is refused for worktrees -> remove wt-frac with
    `git worktree remove $SP/physics/wt-frac` (my own scratch; nothing else references it).
- 09:05 dcore confirmed: the crack fix is in feat/prop-fracture 973e5624a (rowhouse 16.4 m/s, collapsePieces PASS).
  box-manifold rides in the fracture head 231a1ca27 (filming vs main). wt-frac removed (git worktree remove).

## 09:15 (10-11) LANDING HANDED OFF
- Cost (physics-cost-tick-hitch4): authority tick no-kill 1.799 vs 1.788 ms (equal); 8 burn-outs 1.872 vs 2.095 ms
  (+0.22 mean, p50 +0.14, p95 +0.52, worst unchanged); frame hitch A vs B indistinguishable (load 52-72). The
  coordinator: within budget, no veto.
- physics/rigid-body fast-forwarded to 7420887e2 (plain push a4cb8862e..7420887e2). f17 has the landing sha with the
  gate results; wire 5 lands in its own batch. Main moved 47 commits (ddd34385c); merge-tree clean; 5 shared files
  flagged to f17 (effects.ts, state.ts, authoritativeMatch.ts, tankFactoryCore.ts, selftest-suites.mjs).
- Profile of the burn-out tick (cost/prof/*.cpuprofile): the turret work is about 0.26 ms/tick. About 46 % of it is
  kinematic: wreckTurrets.step builds boxes for all 28 tanks every tick, plus setKinematic and kinematicContacts.
  Sleeper bookkeeping: updateSpheres for all bodies every step. Ground sampling is NOT a hotspot (corrected to the
  coordinator after my wrong guess).
- NEXT physics round (with box-manifold 879f22cc9): (1) kinematic boxes only for tanks within reach of a body,
  (2) skip sleepers' pose/sphere updates outside their support/mover checks, then re-measure the burn-out tick
  (sim-tick.mjs --kills A/B). Also the critics' follow-ups: weathervane (more tumble about the long axis) and the
  occasional ~0.7 s T-90M end stand.
- 09:25 f17: 7420887e2 lands alone in its own batch: after 215 (pushes within the hour), before or after 216 per the
  coordinator. f17 merges onto then-current main and runs the closure (readers of the 5 shared files, wire, mp,
  pacing, the 3 browser receipts via fifo2, fleet geometry with public/models). The 4 bore-length receipts stay red
  until weapons' muzzle-crown item (inherited). Nothing pending on me until f17 or the coordinator report, or the
  next physics round.

## 15:50 (10-11) debris-pool perf round: physics/box-manifold bf5439dc1 (pushed; worktree $SP/physics/wt on it)
- dcore's ask: the fracture landing's cost gate failed (collapse p99 +39 ms; pool advance ~3.3 ms a frame).
- Changes:
  - sleepers free (no refresh; putToSleep finalizes; compaction moves sphere centres);
  - Jacobian solver (cJac stride 36; fused velocity loop; the pseudo loop on J);
  - tight bounds from the solids; plain-box pairs skip sphere loops; SAT early exit; partWorld cache;
  - staticBox (obb/record-bounds prisms by manifold);
  - feature cache keyed by slot generation (FEATURE_STRIDE 10);
  - kinematic bounds (kExt) and kinematicNear; wreckTurrets builds hull boxes only near bodies (gatherBodies);
  - RigidWorld.contactCount.
- CPU (not wall clock: load 50-100): dcore pool-bench 1.38-1.43 -> 0.76-0.89 ms/step; heap 5.35 -> 1.95; settle suite
  1.79 -> 0.52 (settling unchanged); turret world 0.16 -> 0.13 ms/tick.
- Probes: $SP/physics/perf/ (pool-bench-trace.mjs; base copy rigidBody.879f22cc9.ts; staged versions pre-*.ts);
  wt-frac2 = sparse scratch of feat/prop-fracture c375d26f0 (bench tree; its rigidBody.ts gets swapped for A/B,
  .qa-dev/heap-bench.mjs, settle-suite.mjs). Remove wt-frac2 when done (git worktree remove --force after unlinking
  node_modules).
- dcore's collapseBodies "came down" check is marginal (2.02 vs < 2.016; chaos band 1.75-2.02): I suggested widening it.
- Open follow-ups:
  - dense heaps settle slowly (heavy-on-light jitter, 8 iterations): mass-ratio handling or shock propagation;
  - the critics' weathervane and T-90M end-stand items;
  - whole-match burn-out tick re-measure in a fifo2 timing slot on the merged head.

## 17:30 (10-11) WAVE 409 FAILED box-manifold (bf5439dc1 on dcore's head e9b4b8282 vs fr-7h ae3557331); 218 GATE
- Wave 409: barn cases dropped (door standing whole under a tilted slab about 5 s; roof one dead-level unbroken lid on neat
  stubs; little rubble). fr-7h (ae3557331) ALREADY contains 879f22cc9; 7h -> 7i differ only by bf5439dc1.
- Findings:
  - (a) a manifold contact sits on one body only, so the other body's landing went unreported (fewer cracks:
    cottage 10 -> 7, tavern 11 -> 7, rowhouse 22 -> 14). Present since 879f22cc9.
  - (b) bf5439dc1's staticBox (stubs by manifold) makes pieces rest flat on stub tops.
  - (c) the base engine's 560 impacts >= 2 m/s a run against 130 now: the base's were inflated by the warm-start bug
    (more dust and cracks).
  - (d) the standing door looks like chaos plus a balanced released piece with no kick.
  - The synthetic heap metric (physics/perf/heap-metric.mjs, 12 runs over the real pipeline) shows no clear 879 vs bf
    difference.
- WIP fix: local commit ab64c2040 on physics/box-manifold, NOT pushed. Impact reports for both bodies; staticBox off;
  the sweep order on the reach sphere (as 879), with tight bounds only culling. Needs validation, then a barn re-film vs
  fr-7h (A = roots sfh = ae3557331; B = e9b4b8282 + fix) plus turret pops vs 7420887e2, then the wave builder.
- 218 GATE (coordinator, 18:15 ask): land/fracture-218 1b587928a (local commit, pushed later by dcore/f17) carries
  879f22cc9 without bf5439dc1. 13 receipts PASS (physics/rcpt-218/summary.txt). Built roots/f218.
  - fifo2 physics-pop1-f218 / pop2-f218 (A = roots/b4 7420887e2, B = roots/f218, stamp ...242 priority) ->
    wave/strips/pop{1,2}-f218.
  - When both land: pack like pop-wave2 (pack-wave2.py with parts pop1-f218/pop2-f218, after = 1b587928a), send to the
    wave builder aa82a418c089d23bb + the coordinator as the 218 no-regression check for 879f22cc9.
  - Worktree $SP/physics/wt-218 (full checkout, node_modules symlinked): remove after the gate (unlink node_modules first).

## 18:25 (10-11) box-manifold fix un-parked (coordinator: the fracture's critical path)
- 50a00e79c (pushed): perf kept; staticBox off; sweep order and static query as 879; full SAT; 879 warm-start matching;
  impact reports for both bodies.
- 311ca3743 (pushed, HEAD of physics/box-manifold): 879's solver back. Bit-exact to 879f22cc9 except the impact fix
  (collapsePieces: 54 per-piece outcomes identical without the fix). CPU on dcore's bench 1.06-1.30 ms vs 879's
  1.58-1.69. Receipts PASS.
- dcore took 50a00e79c into feat/fracture-r2 5db797ee6 (package: caps restored + release tumble). Asked them to add
  311ca3743 before their sfh build and films (...230).
- Solver-only check (dcore's ask): B = e9b4b8282 + 311ca3743 = roots/fx2 2d6278e5c (worktree $SP/physics/wt-fx1).
  - fifo2 physics-barn-fx2 (verdant: fr-barn, fr-barn-far, fr-barn-ap) and physics-house-fx2 (urban: fr-house,
    fr-house-near), dcore's harness s1/fr-strip-one.zsh, label B, out wave/strips/{barn,house}-fx2. Joined to split
    physics-f218 (behind pop1/pop2-f218).
  - A frames: barn = destruction/s1/strips/fr-7h/B (ae3557331); house = destruction/s1/strips/fr-8j/A (ae3557331).
  - Packet: A from those dirs, B from mine; manifest with "solver-only: B = A's head + physics 311ca3743".
- The f218 turret-pop films (879 engine) are valid for 311ca3743: turret pops are bit-exact (the Studio driver uses
  sphere contacts and kinematic hulls; the impact fix doesn't touch turret-hull contacts).
- 18:40 dcore has 311ca3743 in the package feat/fracture-r2 d75b6c4be (29 receipts green); package films fr-7p/8p/9p
  and hitches house8/barn8 at ...230 after roots/sfh rebuilds.
- My queue (all one unit physics-f218, mutex physics, serial): pop1-f218, pop2-f218, barn-fx2, house-fx2 at ...242.
  When they land:
  (1) python3 $SP/physics/wave/pack-218.py -> strips/pop-218 (turret pops, A = 7420887e2, B = 1b587928a/879 engine);
  (2) python3 $SP/physics/wave/pack-fx2.py -> strips/collapse-fx2 (A = dcore's fr-7h/fr-8j frames, B = fx2).
  Send both roots + manifests to the wave builder aa82a418c089d23bb, copying the coordinator.

## 19:50 (10-11) 218 bundle-budget fix landed: 0474dcd55 (coordinator's urgent ask)
- physics/rigid-body fast-forwarded 7420887e2 -> 0474dcd55 (plain push); also physics/lazy-wreck-driver (wt-edge).
  tankFactoryCore reaches the driver only through src/vehicles/wreckTurretDriverLoader.ts (dynamic import; driver made
  at the first kill after load; before it the scripted pop). Loaded beside the battle warm runtime in
  src/game/battleWarmAccess.ts (every battle path: solo, rooms, Studio, shots, debug); combatWarmComposition retries in
  scheduleDeferred and awaits it in warmStudioPipeline. Gallery damage lab + garage = scripted pop (as 217).
- bundle-budget --check on 217 063ab1a12 + 0474dcd55 (local merge be6464871): PASS. Gallery 75 req / 665,349 gz
  (budget 77 / 688,561), game 125 / 1,156,016 (128 / 1,187,589). Closures in physics/bb218-closures.txt (dist pruned).
- 31 receipts PASS on be6464871: physics/rcpt-lazy/summary.txt. New receipt wreckTurretDriverLoader.selftest.
- Sent f17 (adfc0f4b4b146f0f7) + coordinator. 217-alone comparison build (wt-fx1 detached at 063ab1a12, build-tree.zsh
  b217) withdrawn while the coordinator holds build1 (coordinator-217-release-freeze 19:43); re-run after the freeze if
  anyone wants exact deltas: TREE=$SP/physics/wt-fx1 zsh build-tree.zsh b217.
- collapse-fx2 packet sent to the wave builder: packed as wave 423 (waiting on the coordinator's launch).
- Still pending at ...242: pop1-f218 / pop2-f218 -> python3 wave/pack-218.py -> wave builder (+ coordinator).
- Pruned roots/bb218 and roots/fx2. Keep roots/b4 + roots/f218 (pop jobs need them) and wt (pop harness).

## 21:50 (10-11) materialQuality red fixed: 1454ebeb0; pop films half-failed
- f17's 218 (d9e00cdef = 217 + 0474dcd55 + 350 + crush + dcore's receipt fixes): materialQuality.selftest:65 window
  (setDestroyed -> prepareBurnt within 350 chars). Fix 1454ebeb0 moves ensureTurretDriver() beside
  startWreckPresentation. physics/rigid-body + physics/lazy-wreck-driver at 1454ebeb0. Sent f17 + coordinator.
  Source-reader receipts on the fix: physics/rcpt-lazy2/summary.txt (tell f17 only if red).
- Wire-5 vs rooms Worker: no coupling (37-file closure of cloudflare/rooms/src + test/p2p.test.ts has no physics-touched
  file, no src/mp/wire). Told f17.
- pop1-f218: A only (B lost port 5461); pop2-f218: B only (A frame detached, harness exit 0). Fresh A == wave 369's
  7420887e2 arm byte-for-byte (122/122) -> pop2 A from pop2-b4/B. Missing B re-filmed: fifo2 physics-pop1-f218b
  (wave/pop-arm.zsh, roots/f218, slot port, stamp ...242 priority, splitOf pop-wave) -> wave/strips/pop1-f218b.
  When it lands: python3 wave/pack-218.py (rewritten; v1 kept as pack-218.v1.py) -> send pop-218 to the wave builder
  (+ coordinator) as the 219+ fracture-package turret-pop check (not a 218 gate).
- wt-fx1 is detached at 063ab1a12 (the withdrawn b217 comparison build).
- 22:13 source-reader receipts on the fix (rcpt-lazy2): 16 PASS; eraWholeFitReuse + ownedFittingGeometry FAIL by child
  ETIMEDOUT (spawnSync 180 s cap) at load 325-409; their source anchors (ERA memo, fitting ownership) are untouched.
  Load-gated re-run (load < 120): receipts-lazy3.zsh -> physics/rcpt-lazy3/summary.txt.
- 00:10 (10-12) the harness waiter for pop1-f218b hit its 2 h cap (job still pending, ~8th, load ~330). Detached
  wave/autopack-218.zsh packs pop-218 when it lands (log wave/autopack-218.log: PACKED / B ARM FAILED). Then send
  strips/pop-218 + manifest + sheets-218 to the wave builder (+ coordinator) as the 219+ fracture-package turret-pop check.
  rcpt-lazy3 (eraWholeFitReuse, ownedFittingGeometry) still waiting for load < 120.
