# TANK GENERATION PROGRAM — STATE REGISTRY + TAKEOVER HANDBOOK
(written 2026-08-05 at the owner's takeover order; supersedes nothing —
this INDEXES the living law docs, it does not replace them)

## 0. Doc map (where the law lives)
- **docs/BUILD-STANDARD.md** — the LIVING RULEBOOK (owner-ratified build
  laws §A-§I; owner standing directive: keep editing it as lessons land).
- **docs/GEOMETRY-GATE.md** — the measured gate, §10 graduation protocol,
  amendments (three-map retirement, trim-boundary interp clamp).
- **docs/references/tanks/<id>.md** — per-tank PACKETS: round history,
  certified caps/classes, banked orders, freeze entries. The packet is the
  tank's single source of truth.
- **docs/critique/** — independent critic verdicts (shaded-parity-*).
- **docs/ATTRIBUTION.md** — oracle licenses (CC-BY / NC-SA quarantine).
- **docs/geometry-gate/** — tool-written gate rows + ledger.json (NEVER
  hand-edit; stage rows via index-blob surgery, see §6 below).

## 1. Mission + definition of DONE
Every tank in the ~88-row ledger ships as a procedural build in
src/vehicles/profiles/*.js, measured against its community reference GLB
until passing BOTH gates, then graduated per §10. A tank is DONE when:
(1) `node tools/geometry-gate.mjs --ids=<id>` reports every component >=90
(hullCurves, wholeCurves, turretCurves, stations, dims, floaters; certified
oracle-defect caps never cover dims); (2) independent critic >=9.0/10 on
EVERY of 14 views of shaded pairs; (3) turntable eyeball; (4) §10
graduation in the same commit. Program ends when ledger min >=90
fleet-wide, every graduate hash-frozen, no tank registers a reference GLB
at load.

## 2. ABSOLUTE RULES (verbatim-critical)
- THE ONE ABSOLUTE RULE: no assets extracted from commercial games, ever.
- Private local project — never publish, never create accounts.
- docs/geometry-gate/ledger.json is TOOL-WRITTEN only.
- NEVER gate m60a1 / m60a3 / kv2 (kv2's oracle is unrecoverable by design —
  freeze-hash verification only).
- FALSE-0 LAW: never record gate runs against missing/broken references.
- Owner plays on port 5001 — headless tools use their own vite 74xx-77xx.
- /tmp/cot-shots.lock FIFO serializes browser tools. Official tools
  SELF-TICKET — never wrap them in an external lock (deadlocks proven).
  Tickets 15-digit zero-padded. Never clear a live lock; 5-min staleness
  reclaim per the tools' law.
- Agents NEVER commit; the orchestrator verifies rigs+hashes+packets and
  commits precise paths. One family per agent; profile files single-owner.
- ICON TRAP: genIcons rewrites all ~520 icons — use `--tanks <id>` and/or
  stage ONLY the target's 5 icons by exact filename, `git restore
  public/icons/` for the rest. Regenerate from a CLEAN HEAD WORKTREE when
  the live tree carries agent WIP (symlink node_modules into the worktree).
- recovered/* GLBs are NC-SA LOCAL-ONLY QUARANTINE (see ATTRIBUTION.md).
- Env for EVERY node run: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
- npm test before every landing (166 equipment checks + track-geometry).

## 3. GRADUATE REGISTRY (26 graduates, hash-frozen)
Freeze = deterministic geometry hash via `node tools/tmp-hashgeo.mjs
--ids=...` (camoSeed 4242 pinned build; FNV-1a over position buffers +
world matrices, mesh-order independent). Graduate-change protocol: fix ->
gate hold x2 -> independent re-cert critic >=9.0 on changed views ->
re-freeze NEW hash, all in ONE commit.

| id | hash | notes |
|---|---|---|
| m60a1 | fbf9f4cc | never gated |
| m60a3 | 051c454c | never gated |
| kv2 | 382b2310 | freeze-verify only |
| leo2a6 | f25dad51 | |
| m1a1 | 66f953e4 | cheek+gun re-cert RATIFIED (floor 9.1) |
| m1a1ha | cd209f68 | cheek+gun re-cert RATIFIED (floor 9.1) |
| m1a2_tejas | 25304310 | cheek+gun re-cert RATIFIED (floor 9.1) |
| merkava3b | 8bb8d984 | gun-run re-cert RATIFIED (floor 9.1) |
| merkava3c | b7318b10 | gun-run re-cert RATIFIED (floor 9.1) |
| kf51 | 1452024b | |
| isu122s | 60b08d10 | |
| isu152 | 8e2f75c0 | |
| merkava3d | 6b97616c | re-frozen 0e47256 |
| pt91m | 2cf10e23 | |
| t72b3m | 1e1ca4b8 | |
| merkava1b | 470f3665 | re-frozen 0e47256 |
| m1a2 | b78279b4 | cheek+gun re-cert RATIFIED (floor 9.1) |
| chieftain5 | 94c09bb0 | |
| t84 | 04707a9c | |
| m47_patton | 53b6123a | |
| leo2a5 | 2f9d0af0 | |
| leo2_revolution | b53a16f8 | r19 tone re-cert RATIFIED (floor 9.0, mean 9.11) — the revolution arc fully settled | r18 RE-CERT RATIFIED (§B7 photo-class, floor 9.0 x14); batch-43 wing excision EXECUTED — gate 0.2 -> 62.8 (§B7 cap = genuine real-vs-print divergence only: the print has no solid side modules). Next: P-R1/P-R2 tone round; the capped row is the print's honest limit under the owner ruling | de-fusion RE-CERT RATIFIED (floor 9.0 x14 at the coupled 88.9); retune round owed (88.9 -> 90+, P-1 fore-ring tells folded in) |
| m46_patton | 90ebf864 | |
| centurion3 | fea56ecc | GRADUATED fd2c365 (24th, Centurion line's first) |
| m1a2_sepv2 | b74366ac | 25th graduate; cheek+gun re-cert RATIFIED (floor 9.1) |
| m26_pershing | 2f579de8 | GRADUATED 2026-08-05 (26th; floor 9.0 x14 second sitting; warp->re-anchor->retune arc) |

*ALL 24 hashes above re-frozen 2026-08-05 by the INVISIBLE-LOD ENVELOPE
fix (de-track kit now lazy-built; LOD0 pixels byte-identical x12, gates
held, old->new table in the landing commit). leo2_revolution keeps its
ratified 1993cfb1 pre-fix baseline: HEAD carries the mid-retune WIP sweep
(hash drift expected; resolves + re-freezes at the retune landing, which
must hash on the POST-LOD-FIX factory).

Mirror maps (graduates + flip-era tanks measure via these, NOT runtime
registration): tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES,
tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES (committed),
tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES (committed at the
takeover sweep decec28). §10 LESSON: mirror
the HELPER-EXPANDED config, never the surface call (the gunNode incident —
userdrops5's `articulated` helper includes `gunNode:'^Gun'`; dropping it
cratered leo2a5 to min 0 at load-prove). Load-prove = `node
tools/tmp-modelsource-dump.mjs` shows the id ABSENT from the glb map +
gate still measures via mirror.

## 4. FLEET STATE at handoff (ledger 2026-08-05, 23/88 pass — revolution
honestly parked at 88.9 pending its retune)
- **Gate-PASS awaiting visual ladder / adjudication**: challenger1 90.2
  (critic floor 7.0, chieftain-exact recipe one round behind), centurion5
  90.7 (floor 7.0, O3 cast-turret round) — uk round-4 agent ON IT.
  m1a2_sepv2 GRADUATED (25th).
- **80-90 band**: m60a2 86.3 (ceiling 87.5 — cert decision pending),
  bradley 84.7, bmp2 84.0 (ceiling), m45_patton 81.2 (stop-rule closed).
- **80-90 additions (misc r3 CLOSED, ceiling-measured ~84-85 each)**:
  type90 83.6 (station lane class binds; 3.69 band-solver col =
  orchestrator lane), ariete 82.3 (wrap break LANDED via lane-local fill
  — the sanctioned non-circular mechanism; cover/frame-lock certified).
- **70-80**: t64bv1 73.4, t90a_vladimir 71.4. m26_pershing 90.4 GATE
  GRADUATED (26th, 2f579de8). X-brace architecture conflict remains an
  orchestrator ruling item (stations-law open track zone).
- **Russia tail**: t72b_1987 56.0 CEILING-CERTIFIED (print drum-band cap),
  t90sm 56.4 (AA-teeter binds), t62mv1 63.7 (fade-cap ceiling ~77-81),
  t72bu ~55-70 certified-ceiling — ORACLE
  DECISION PENDING (orchestrator lane).
- **BASE-21 MODERNIZATION WORKSTREAM (owner directive 2026-08-06: "the
  21 original base-game customs (Sherman, Tiger I, T-34-85, Leopard
  2A4/2A7, T-14, Challenger 2, etc.) need to begin being worked on
  because the current models are wholly ancient")**: these predate the
  oracle program — most have NO ledger row (no reference GLB; leo2a7v 0,
  t80u 75.4 and t90m 81.7 are exceptions with oracles). Mechanics: (a)
  identify the exact 21-id roster from TANK_SPECS (first triage task);
  (b) per-family PHOTO-CLASS modernization rounds under the full current
  rulebook (§B1-§B7, §C) as lanes free — the visual critic is the bar
  where no oracle exists (false-0 law: never gate without a reference);
  (c) parallel oracle-sourcing lane (community CC models only, bradley
  flow — THE ONE ABSOLUTE RULE stands). FIRST SLICE DONE (2026-08-06): leo2a4 REBUILT
  photo-class (the first base-21 modernization — new buildLeo2A4, all
  batteries clean from 83/436-clip mg0 ancient state; spec 9.67 true-up
  landed); leo2a7v re-laid on the V3 rig (dims 100, clips 0/0, certified
  proportional ceiling; §E re-source request filed in packet);
  PHOTO-CLASS FLOW law banked (tmp-leo-photoclass rig = the no-oracle
  lane mechanism for the remaining base-21 slices).
- **OWNER PUNCH LIST 2 (2026-08-06 pm, four screenshots)**: (1) fv510
  photo-parity round 2 (real Warrior photo: angular welded turret w/
  sloped faces, front-corner smoke banks, 3 whips, loaded rear bins,
  skirts-over-wheels, glacis lights) — uk lane; (2) sepv2/sepv3/tusk
  REBASED on the m1a1 family build + real kits (ERA/TUSK/CROWS) +
  §B3.2 density on ALL abrams — abrams lane; (3) revolution turret
  see-through sides/ring ("disembodied") — relayed to the LIVE leopard
  agent; (4) leclerc turret front = steep rake down to a small flat
  strip — misc lane; (5) russia §B3.2 decorations + MG/RWS density —
  russia lane.
- **OWNER PUNCH LIST (2026-08-06, five rounds spawned)**: (1) DONE — ariete+leclerc left sides FIXED (reversed-winding class
  decoded: mirror loops hand slabs inward faces, FrontSide-culled but
  DoubleSide-mask visible; orientedSlab guard landed; gates held exact;
  leclerc bonus: contig 0, mg1, §B3.1 gun root. OPEN CARRIERS: t80u,
  type90, type74 — next misc/russia rounds);
  (2) merkava guns DONE — MG251/253 runs de-prismed all 8 marks (frozen
  rows EXACT; 3b/3c candidates 8bb8d984/b7318b10 pending re-cert critic;
  mk4 evac surfaced at station; 4b +3.1 stations); abrams DONE — cheeks raked family-wide (A/B curve-identity proofs),
  gun runs de-prismed x8, AIM on the family shell (46.3 honest: family
  mandate vs short print, cert extension filed), TUSK/abramsx actively
  batched; FIVE graduate candidates pending the family re-cert critic;
  (3)+(4) folded into the abrams round above; (5)
  russia-wide §B3.1 prism sweep; (6) DONE — fv510 Warrior BUILT ACTUAL (photo class: offset
  turret, RARDEN §B3.1 cylinders + perforated hider, slat cages, skirts,
  GPMG, mg1+13d; dims 100, batteries clean; hash 6bfcee8). Oracle
  adjudicated HONEST-0 (print -10.9% short + shape-divergent); batch-44
  warp EXECUTED (hold lifted, height-clamp root cause) — frame honest
  (cover 1.12%, safeScale 1.0), headline stays print-capped: the
  photo-class build is the truth, visual critic is fv510's bar.
- **OWNER PRIORITY (2026-08-05): fv510 Warrior marked a PERFECT CANDIDATE
  for a full round** — next open family-lane slot takes it (its repair
  recipe was incident-disabled; re-adjudicate the oracle first, §E).
- **Zero/low rows** (triage lane): recon_tank ruling, q_heavy/t30 walls, merkava2b 39.6 / 2d 34.9 / 4 0 / 4b 34.1 (family rebuilds),
  t54 winding repair, m48 pitch, type74+t80bv scaleToOverall ruling.

## 5. IN-FLIGHT AGENTS (SUPERSEDED BY §12 — the 2026-08-05 device
handover interrupted these; respawn per §12)
1. DONE+RATIFIED: abrams dual critic (m1a1ha f5c556dc, sepv2 §10 run).
2. DONE+RATIFIED: revolution re-cert (1993cfb1); retune round SPAWNED
   (hull 88.9 -> 90+ + P-1 fore-ring tells + P-2).
3. **misc r3**: type90 ladder + ariete wrap-break attempt.
4. **russia tail-3**: t62mv1 decode + t90sm §B1 loft rework.
5. **patton re-anchor**: m26 post-warp re-anchor from the WARPED extract
   (dims 91.9 -> 100 via proc M2 band lift to the 3.08 spec).
6. **uk round-4**: challenger1 + centurion5 visual ladders toward
   adjudication (26th/27th candidates). MUST hold centurion3 bf0a45e8.

## 6. ORCHESTRATOR MECHANICS (how landings actually work)
- **Pathspec/hunk-split commits**: the owner's parallel session stages
  deletions and edits shared files — check `git diff --cached --name-only`
  before every commit; never `git commit -a`. For tool-written JSON
  (ledger) stage surgical row updates WITHOUT touching the worktree file:
  build content = HEAD + target rows, then `git hash-object -w` +
  `git update-index --cacheinfo 100644,<blob>,<path>` (script:
  scratchpad stage-ledger-rows.py pattern — HEAD rows + worktree rows for
  the named ids + recomputed passed/total).
- **Split-staging a shared code file** (e.g. repair_oracles.py holding two
  batches for different landings): build the staged variant from the
  worktree by cutting the held-back block, hash-object + cacheinfo, keep
  the worktree intact.
- **Cross-file rider grep at every landing**: profile diffs referencing
  symbols (BUCKET_DEF entries, cfg.*/S.* params) must resolve in COMMITTED
  files — grep before committing or HEAD lands mid-state.
- **Oracle repairs (warp law v2, §E)**: fresh .bak from committed HEAD
  bytes; PRE-FLIGHT: run the existing chain and prove it reproduces
  committed bytes BEFORE extending; batches before `if __name__`;
  byte-idempotent shasum x2; census expect guards; gate-in-loop vs stable
  baseline; demotion notes when a recipe supersedes (archive old bak as
  *.pre-batchNN-history). Spec-mirror true-ups (vertex-extract.mjs
  pubDims) land in the SAME batch as their userdrops spec edit.
- **Agent brief boilerplate** (every spawn): NEVER commit; single-owner
  file; env line; own vite 74xx-77xx; FIFO hard rules; NEVER stop to wait
  on watchers (stopping ends the run — run chains sequentially
  in-process); graduate hashes to hold; false-0; read BUILD-STANDARD
  first; §F.4 report format; packets WRITTEN before reporting.
- **Infrastructure deaths**: SendMessage-resume first (context intact);
  respawn fresh only if the transcript is unrecoverable. Waiter-stalls
  (agent stops "to wait") get a finalize nudge via SendMessage.

## 7. MY-LANE QUEUE (orchestrator work, ripeness order at handoff)
1. Land the six in-flight agents' results (per §5 protocols).
2. t72bu oracle decision (certified-ceiling ~55-70; packet has the
   evidence; options: warp batch vs ceiling-cert vs re-source).
3. m60a2 cert decision (86.3 vs ceiling 87.5).
4. Fleet flip wave 2 (donor/0-row ids as builds land) + full fleet gate
   sweep (post-amendment ledger refresh; expect frozen-row drift-up
   refreshes, no re-cert needed per the amendment).
5. Band-solver front mirror for type90 (flagged orchestrator-lane by misc
   r2: the 3.68 col, ~0.28x2).
6. Smaller rulings: t54 winding repair (scout-gen2-t54.md), m48 pitch +
   _region_pitch, scaleToOverall ruling (type74+t80bv), workorder
   shared-box promote, mask-island certs, contact-alias, tejas drift 89.4,
   recon_tank ruling, fv510/q_heavy/t30 walls, RIM-FLOOR fleet lighting
   term, padHug frozen-centurion coupling, mg FITTINGS migrations (§I),
   shoe-envelope audit extension.

## 8. OWNER DIRECTIVE LOG (this program's history; all codified as law)
1. §B5 turret furniture parenting (sepv3/merkavas/t72b3m rear-turret kit
   must rotate) — LAW + fleet audit tool; DONE for named tanks.
2. §B6 track silhouette \\________/ (chieftain front) — LAW; DONE.
3. §B1 Abrams sloped turret fronts (with photo) — LAW; DONE.
4. LIVING RULEBOOK: continuously edit the generating rules — ONGOING.
5. AFV love (bradley/bmp2) + owner-downloaded m2_bradley_ifv.glb
   (CC-BY-4.0, ATTRIBUTION.md) — oracle landed; bands 84.7/84.0.
6. CUSTOM tab completeness (t80, type10, type99a, leo1a5, t14, t72b3,
   challenger2, type74, pt-91, k2, chieftain mk10, sepv3-from-abrams) —
   DONE (roster 70).
7. t84 turret seat (batch-40 compound warp) — DONE, graduated.
8. c1 ariete broken turret — rebuilt; ladder ongoing (78.5).
9. kf51 turret front — DONE, graduated 3ae9b70c.
10. §B1 NO-STAIRCASES (screenshot) — LAW.
11. §B1 SLOPE-MOTIVATES-THE-MASS — LAW.
12. §B3 NO-MYSTERY-BOXES (merkavas/t-xx/sepv3, especially guns) — LAW;
    merkava pod-tells re-certed + re-frozen; sepv2 swept (candidate 25).
13. m1a1ha rear tracks/gaps (screenshot) — fixed, pending re-cert critic.
14. leo2_revolution fused turret (screenshot) — coupled de-fusion LANDED
    c9ddba0 (honest 88.9; retune round owed).
15. Scale: "many more agents open building tanks" — 6 in flight at
    handoff; keep respawning freed family lanes on every landing.
16. Takeover order (2026-08-05): this document + full commit/push.

## 9. INCIDENT LESSONS (codified; the mechanism lives in the named law)
- gunNode/helper-expansion (§10 lesson, GEOMETRY-GATE.md + §3 above).
- t84 double-warp: python asserts on REPAIRS[id] must target the LAST
  definition site (rindex) — duplicate keys ran a stale batch and
  double-warped; restore from fresh .bak = committed bytes.
- Assert-after-append bug: landing scripts must assert against the FILE,
  not the in-memory copy they just appended to.
- Stale staged deletions (owner's parallel session) swept into commits
  twice — hence the §6 pathspec/cacheinfo discipline, always.
- genIcons on a live tree with agent WIP times out / bakes WIP geometry —
  clean HEAD worktree + symlinked node_modules + --tanks filter.
- zsh word-splitting: `for t in $VAR` treats the string as one word — use
  `${=VAR}`.
- FIFO: foreign plain-FILE lock wedged the dir-lock FIFO — all lock tools
  patched (rmdir -> ENOTDIR -> unlink). Self-locking tools deadlock inside
  external wrappers (two incidents). 16-digit tickets queue-jump the
  15-digit sort. Under fleet load, official runs die at the 30-min queue
  timeout — retry honestly; one-ticket batch drivers for render batches.
- Vite serves LIVE bytes at navigation time — a queued driver renders the
  tree as of lock-acquisition; treat in-flight runs as measuring the
  current tree.
- Browser-pane screenshots read black on this box — verify visuals via
  repo puppeteer tools (tools/tmp-*.mjs), never pane screenshots.
- Cross-critic calibration: the ratified chieftain5 anchor governs
  severity disputes; adjudicate with measurements, not vibes.
- Agents stopping to "wait on watchers/monitors" end their own runs — the
  brief boilerplate forbids it; nudge stalled agents to run chains
  sequentially in-process.
- Critic top-pair orientation: bow = image bottom (gun-overhang check
  before calling turret-front reads).
- ORACLE-REGISTRATION-PINNED class: when the REF keeps furniture
  hull-side, the fix is coupled (followers extension in the three maps +
  proc re-parent + full re-gate in ONE landing).
- Camo-bucket moves reseed bakeDirt mottle (LOCAL frame) — pixel-diff
  unreachable; full critic re-cert required.

## 10. PERF/CERT SIDE-LANE (background)
tools/quietcert.mjs waits for a genuinely quiet machine to certify the
perf budget (docs/cert-r6-* artifacts; contended attempts REFUSED by
design). Under constant fleet load it may never find a window — that is
honest; do not relax its stamps. Re-launch overnight when agent load
drops: `nohup node tools/quietcert.mjs >> docs/quietcert-r6.log 2>&1 &`

## 11. SESSION CHRONOLOGY 2026-08-05 (the takeover-day landings, in order)
0e47256 merkava re-cert PASS x4 — pod tells certified, four re-freezes
(1fda7dbd/87ba249c/4880b0a4/93e7b4eb). 8cfa546 patton m26/m45 band (m45
59.4->81.2; m26 warp request filed). 0eeaced misc push-2 (type90 79.0,
ariete 78.5 ceiling-measured). 0c37688 russia tail-2 (t90sm 46.9,
t72b_1987 56.0 ceiling-certified). a6c01ed rulebook six-law bank.
bc17984 m26 batch-42 warp EXECUTED (print cured, 74.8, dims 91.9 =
re-anchor debt; heightM 3.08 true-up). fd2c365 GRADUATION centurion3
(24th, bf0a45e8). c9ddba0 leo2_revolution coupled vlo de-fusion (honest
88.9). e85e546 abrams round (m1a1ha rear-fix + sepv2 §B3). 588fe43 this
registry + §10 helper-expansion amendment. decec28 takeover sweep (full
tree). 636d3e4 GRADUATION m1a2_sepv2 (25th, b489ba14) + m1a1ha f5c556dc
and revolution 1993cfb1 re-certs RATIFIED + §J critic laws. 92f5817 uk
round-4 (ch1 90.1 orders delivered, c5 chamfer grammar law).

## 12. INTERRUPTED ROUNDS — respawn briefs for a new device
This session's background agents die with the machine. Their WIP (if any)
is snapshot-committed; each line below is the respawn mission. Use the §6
agent-brief boilerplate (never-commit, single-owner file, env line, vite
74xx-77xx, FIFO §F.1, never-wait-on-watchers, graduate hashes, false-0,
read BUILD-STANDARD+packets first, §F.4 report).
1. DONE pre-handover (landed in 2a6094b, report verified): misc r3 —
   type90 83.6, ariete 82.3, both ceiling-measured; eight laws banked in
   packets (1024-PARITY PROBE, FRUSTUM-HALFWIDTH, LANE-LOCAL FILL, etc.).
   Next misc round = orchestrator band-solver col + certified classes.
2. DONE (landed post-handover): russia tail-3 — t62mv1 63.7 (+15.8, stale
   crown caps retired, drum row decoded, dims 100), t90sm 56.4 (+9.5,
   dims 100, clips 0/0; AA-teeter family binds ~2-4 pts variance).
   Ceilings: t62mv1 ~77-81 (print rear-gear fade certified). Next russia
   round: t62mv1 side-row ladder under the fade cap.
3. DONE: m26 re-anchor landed — 74.8 -> 90.4 GATE PASS x2 (first-ever
   pass; dims 100; registration -0.002/0.001; clips 0/0 band + shoe;
   cheekPod deleted; bow = certified print-class near-vertical glacis, no
   further warp). Candidate hash f348ecd5. PENDING GRADUATION
   ADJUDICATION (14-view critic = new-device spawn; would be the 26th).
4. uk round-5 (uk.js): ch1 (gate wall 90.1, spare 0.1) O6 shading family +
   close-roof camo + dead-rear MG; c5 crown-tab pair + plateau-vs-pear
   casting + top clutter. Self-read >=8.9 every view -> request
   adjudication (26th/27th). Hold chieftain5 5117b9a8 / centurion3
   bf0a45e8.
5. DONE PENDING RE-CERT: revolution r17 retune landed — 88.9 -> 91.2
   PASS x2 (honest deck shelf, mast-column riser, belly 0.338, P-1 tells
   mask-free, P-2 proven cast-shadow). Candidate 323228f8; re-cert critic
   = new device's first spawn (all 14 views; camo reseeds).
6. DONE: m1a2 §B3 re-cert PASS — re-frozen 248a8468 (bytes were already
   at HEAD via the handover snapshot; ratification landed).
7. DONE (landed post-handover): INVISIBLE-LOD ENVELOPE fix — root cause
   was the de-track destruction kit parked hidden at thrown pose (not
   LOD); now lazy-built on first throw. 12/12 render pairs byte-identical
   (incl. detrack visuals), gates held, 24-graduate mass re-freeze landed.
   Follow-ups for family lanes: procShadow_gun oversize true-ups (t84
   +1.80m, m46 +1.60, kf51 +1.16, leo2a6 +1.09, kv2 +0.84, ariete +0.25);
   icons re-frame tighter at next genIcons per tank.
8. DONE (landed post-handover): shoe-envelope audit shipped — instance
   sampling with >=1.5cm depth bar + dressingSkipped conformance
   exclusion; bandVox output backward-compatible; m1a1ha + 15 negative
   controls clean. FINDINGS = the new §B4 queue (graduate-change flow,
   re-run --ids fresh before acting; full table in the audit report/log):
   BLIND SPOTS ranked — kf51 front 387 (glacis toe, render-confirmed) +
   rear 184; leo2a6 316+192; leo2a5 308+126; isu152 264+50; merkava1b
   140; t72b3m 112+24; t84 near-blind front 162; merkava3d 32; 3b/3c 18;
   t62mv1/t90sm/t90m 12-18; isu122s 8. Worse-than-band severity: t90a
   608, t64bv1, t72bu, bradley rear 121, chieftain_mk10 44.
Plus the standing my-lane queue in §7.

## 13. HOW TO RESUME FROM A NEW DEVICE (the loop protocol)
1) Clone; `npm install`; verify `npm test` (166 + track-geometry).
2) Read this file, BUILD-STANDARD.md, GEOMETRY-GATE.md.
3) Respawn §12 rounds (one agent per profile file; two critics max
   concurrently for FIFO sanity; 6-8 agents total is the proven load).
4) Land on notification: verify hashes yourself (tmp-hashgeo), pathspec/
   cacheinfo commits (§6), re-freezes only on critic PASS, §10 on
   graduation PASS, push after each wave, update §3/§4/§5 rows here.
5) Re-arm a ~25-min heartbeat that re-reads this file as the handoff.
The owner's standing orders: keep going with everything, many agents,
LIVING RULEBOOK (every lesson lands in BUILD-STANDARD the turn it
arrives), never gate m60a1/m60a3/kv2, never false-0, owner port 5001.
