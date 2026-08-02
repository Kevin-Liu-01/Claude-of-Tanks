# TANK GENERATION PROGRAM — COMPLETE HANDOFF

Written 2026-08-02 at commit `e191bb2`. This is the full manual for finishing
the from-scratch tank rebuild program: replace every reference-GLB-registered
tank with our OWN procedural build that passes the dual gate, using the vertex
toolchain, with every lesson the program has learned so far. Read this whole
document before touching a profile. The gate defines done — not effort, not
iteration count, not "looks close".

---

## 1. Mission and definition of done

Every tank in the fleet ships as a **procedural build** authored in
`src/vehicles/profiles/*.js`, measured against its community reference GLB
(the "oracle") until it passes **BOTH** gates, then the GLB registration is
retired ("graduation"). The oracles are scaffolding; the product is our own
geometry.

A tank is DONE when:

1. **Geometric gate** — `node tools/geometry-gate.mjs --ids=<id>` reports
   **every component ≥ 90**: `hullCurves`, `wholeCurves`, `turretCurves`,
   `stations`, `dims`, `floaters`. The minimum is the headline. Nothing
   averages away a failure. Certified oracle-defect caps (§6) are the only
   exemption and NEVER cover `dims`.
2. **Visual gate** — an independent critic scores the shaded board
   (`tools/procedural-fidelity.html?id=<id>&board=1`) **≥ 9.0/10 on every
   view**: "same vehicle, same tier" against the reference render. Geometry
   ≥90 with a failed critic means readability/material work, not silhouette
   work. Any geometry edit invalidates a prior critic verdict — re-run BOTH.
3. **Mandatory turntable review** — a human-grade eyeball of the board
   (orientation, articulation, no floaters, believable fabrication) before
   any sheet ships or any landing is reported. Curve scores alone never
   certify a tank (§7.2 explains why).
4. **Graduation** executed per §10 in the same commit as the pass.

Spec of record: `docs/GEOMETRY-GATE.md`. If this handoff and that file ever
disagree, GEOMETRY-GATE.md wins and this file needs a patch.

## 2. The rules that outrank everything

- **THE ONE ABSOLUTE RULE: no assets extracted from commercial games. Ever.**
  A perfect model with WoT/WT provenance is a rejection (precedent:
  thing:2329090 Maus, rejected). Provenance for every oracle lives in the
  packet + `docs/ATTRIBUTION.md`.
- **Vertex-freedom ruling (owner, 2026-08-01)**: reference geometry may be
  analyzed directly — vertices, corners, cross-sections — used as the basis
  for the build, and scaled 100% to published real-vehicle dims. Oracle
  repairs may axis-warp stylized prints to published dims. The gate's
  measurement pipeline is unchanged: a vertex-informed build still passes
  only by matching the measured reference through the same mask pipeline.
  Published dims stay sovereign.
- **The ledger is tool-written** (`docs/geometry-gate/ledger.json`). Hand
  edits are a program violation. A gate run against a missing reference
  writes a false 0 row — never record those.
- This is a private, local project. Never publish, never create accounts.

## 3. Fleet state at handoff (85 ledger rows, min component)

**Graduated (dual gate passed, GLB registration retired):**
`m60a1` 90.7 · `kv2` 90.2 · `m60a3` 90.0
Graduates are freeze-verified by geometry hash (`tools/tmp-hashgeo.mjs`),
not by re-gating (§10).

**Full geometric pass, awaiting critic + graduation — IN UNCOMMITTED WORK:**
`isu122s` 90.6 (hull 90.6 / whole 90.6 / turret 100 / stations 95.1 /
dims 99.7 / floaters 100). This sits in the parked casemate work (§4).
Closest thing to a free win in the whole program.

**80–90 (one push from the geometric gate):**
`leo2a6` 88.5 (parked leopard work) · `merkava3c` 84.8 · `merkava3b` 83.4
(both parked merkava work).

**60–80:** `isu152` 72.4 · `leo2a5` 69.0 · `merkava3d` 67.8 ·
`jpz_e100` 66.5 · `m47_patton` 66.1 · `kf51` 63.6 · `m46_patton` 63.2
(certified tube cap) · `merkava1b` 62.5.

**50–60:** `t72b3m` 58.2 · `t64bv1` 55.2 · `m1a1_aim` 53.6 ·
`t72b_1987` 51.4 (certified tube-ceiling cap).

**40–50:** `t90a` 49.5 · `t95` 49.3 · `m1a1`/`m1a1ha` 49.2 ·
`m1a2_tejas` 49.1 · `t62mv1` 47.9 · `sturmtiger` 47.7 ·
`leo2_revolution` 45.9 · `chieftain5` 44.9 · `sherman_jumbo` 43.2 ·
`pziii_konserwa` 42.7 · `t90a_vladimir` 42.2.

**30–40:** `merkava2b` 39.9 · `pt91m` 39.7 · `t72bu` 39.4 · `t90sm` 37.9 ·
`strv103` 37.1 · `t34_85_cad` 35.5 · `merkava2d` 34.9 · `merkava4b` 34.6 ·
`m1a2` 32.3 · `challenger1` 32.2 · `newc_pziii` 32.1 · `jagdtiger` 31.1.

**Under 30 (real rebuilds needed):** `tiger2` 29.2 · `m26_pershing` 25.3
(headline is DIMS — patton-pack oracle scale repair is mid-flight in the
parked work) · `centurion5` 24.3 · `centurion3` 22.9 · `m45_patton` 22.6
(same dims situation) · `leclerc` 21.9 · `t80u` 20.0 · `newc_tiger` 19.2 ·
`leichttraktor` 15.9 · `is6b` 6.8 · `is3` 3.0 · `abramsx` 1.3 · `comet` 0.5
· `charioteer` 0.4.

**Zero rows (28 tanks — untriaged):** `t90m, recon_tank, q_heavy, object279,
merkava4, m1a2_tusk, fv510, leo2a7v, m1a2_sepv2, type90, is3_bergman,
challenger_cruiser, leopard2_proto, ariete, type74, is7, t44, t54, type59,
t80, t80b, t80bv, amx30, amx30b2, m48, m60a2, vickers_mk1, t84`.
A zero row means one of: (a) no serious rebuild attempt yet, (b) broken
registration (wrong `MODEL_SOURCE` node names / autoPivot), (c) a defective
oracle that needs a repair batch, or (d) a build so far off it registers
nothing. Rows where `dims=0` alongside hull>0 (t54, type59, m48, m60a2,
vickers_mk1, amx30) usually mean the BUILD is wildly out of scale or the
oracle is — run vertex-extract first and compare stylization factors before
authoring anything (§5.1). Triage each with a gate run + board BEFORE
scheduling work; do not assume the bucket.

93 packets exist in `docs/references/tanks/` — most zero-row tanks already
have provenance and notes. Read the packet before starting any tank.

## 4. FIRST TASK — adjudicate the parked uncommitted work

The working tree carries uncommitted work from earlier family agents that
were stopped mid-round. **The committed ledger rows for these tanks were
measured against this uncommitted state** — do not blindly revert anything.

Inventory (`git status`):

- `src/vehicles/profiles/casemate.js` — includes the isu122s FULL PASS and
  isu152 72.4. Packet updates for isu152 are also dirty.
- `src/vehicles/profiles/leopard.js` — leo2a6 88.5 and leo2a5/others.
- `src/vehicles/profiles/merkava.js` — merkava3c 84.8 / merkava3b 83.4 (+
  dirty packets for both).
- `docs/references/profiles/{m26_pershing,m45_patton,m46_patton,m47_patton}.json`
  — patton/pershing oracle-scale work mid-flight (explains the 25.3/22.6
  dims headlines).
- `public/models/tanks/community/recovered/{pt91m,t62_bergman,t64bv1,t72b3m,
  t72bu,t90a_vladimir,t90sm}.glb` + `variants/t90a_xarchenko_variant.glb` —
  **oracle normalization state the committed russia ledger numbers depend
  on.** If these were reverted, the committed scores would be measured
  against different oracles.
- `docs/procedural-fidelity-report.{json,md}` — stale harness outputs;
  regenerate rather than reason about.

Procedure:

1. For the GLBs: run the repair recipes' idempotency/census check
   (`tools/repair_oracles.py` is append-only, pristine-`.bak`,
   byte-idempotent by design — re-running a batch on an already-repaired
   file must be a no-op). If the dirty bytes are the canonical batch output,
   COMMIT them with the batch id in the message. If not explainable, stop
   and investigate before any gate run — every score depends on oracle
   bytes.
2. For each parked profile family: `node tools/geometry-gate.mjs --ids=<family>`
   to confirm the tree still reproduces the ledger numbers, render boards,
   do the turntable review, then land the family with its packets in one
   commit (message: family + ledger deltas). The owner previously parked
   these pending review — the review IS this step; land what passes it,
   rebuild what does not.
3. isu122s immediately proceeds to critic + graduation (§10).

## 5. The tech — our own toolchain, with exact commands

Environment for every node invocation:
`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`.
All headless tools launch their own vite on **74xx–77xx. Never 5001/5002**
(owner plays on 5001). `/tmp/cot-shots.lock` serializes the repo's
browser-driving tools — they queue on it themselves; never delete a live
lock, never run two lock-holding tools in parallel by force.

### 5.1 `tools/vertex-extract.mjs` — read the oracle's actual geometry
Parses the reference GLB directly (no browser), replicates the game loader's
registration (turretNode/gunNode/yawOffset/autoPivot from `MODEL_SOURCE` +
width safeScale + -Z-forward flip), and writes
`docs/references/vertex/<id>.json`: silhouette polylines per view/part at
~4.5 mm/px, the gate's 14 station sections, deck/belly landmark corners,
turret ring/crown numbers, the dims-measurement replica (12% body filter,
p95 roof, 0.35 m plan band), TRUE stylization factors vs published dims, and
the glb-world↔gate-world affine map. **This is where every tank starts.**
Build from extract corners — NOT from PLANS z-maps or eyeballed prints.

### 5.2 `tools/vertex-normalize.mjs` — plan oracle repairs
`node tools/vertex-normalize.mjs --ids=a,b` prints per-axis piecewise-linear
warp plans (gate meters → GLB-world control points) that bring a stylized
print to published dims; paste the emitted python literals into a NEW batch
in `tools/repair_oracles.py` (append-only, byte-idempotent, census-guarded,
pristine `.bak` kept). `--verify` re-extracts and asserts measured ≈
published. Width (gate x) is NEVER warped — it is the safeScale anchor.
Russia precedent: nine oracles from +5..+47% stylization to ±1.3%.

### 5.3 `tools/vertex-workorder.mjs` — the builder's numbers
`node tools/vertex-workorder.mjs --id=<id> [--rows=side_whole,...] [--top=14]`
One headless gate run; dumps BOTH models' 96-column curves for every scored
row in ABSOLUTE world coordinates plus worst-first per-column error lists.
Author directly against these z/x values. Read-only; own vite. (Its plan
orientation pick and vertical/plan ground-anchoring were fixed 2026-08-01/02
— older packets' plan-row digests written before those fixes are suspect;
re-run rather than trust them. Known symptom: phantom "basket runs" beyond
the real turret end.)

### 5.4 `tools/geometry-gate.mjs` — the score of record
`node tools/geometry-gate.mjs --ids=<id[,id...]>` → `docs/geometry-gate/<id>.json`
(per-column work orders in `worst`) + tool-written ledger update. Drives
`tools/procedural-fidelity.html?id=<id>&geo=1`. Gate internals you must
know before arguing with a number: registration is translation-only and
computed ONCE per view from the HULL curves then reused for whole/turret
rows (a floating or displaced turret cannot self-register); coverage counts
both directions (excess geometry is as visible as missing); score is
`100 − 12·meanPct − 0.6·p95Pct − 1.5·coverPct`; stations are 14 slices on
the model's own side-hull z-range with a trimmed mean; dims give 1% grace
then −8/percent; floaters scan 5 articulation poses for disconnected
islands >400 px.

### 5.5 Boards and sheets
`tools/procedural-fidelity.html?id=<id>&board=1` renders the shaded parity
board (9 fixed views + articulation strip + turntable). Every landing gets a
frame-reviewed board saved under `shots/<round>/after/`. `shots/`, `*.bak`,
`tools/tmp-*.mjs|.html`, and `public/models/tanks/candidates-gen2/` are
gitignored — evidence stays local, and candidates-gen2 zips exceed GitHub's
100 MB limit (this has broken a push before; never force-add it).

### 5.6 `tools/tmp-hashgeo.mjs` — graduate freeze verification
`node tools/tmp-hashgeo.mjs --ids=m60a1,m60a3,kv2` prints procedural geometry
hashes. Graduates are hash-frozen; any intentional change to a graduate
re-runs gate + critic and re-freezes in the same commit.

### 5.7 `tools/genIcons.mjs` — THE ICON TRAP
`node tools/genIcons.mjs --ids=<id>` REWRITES ALL ~520 icons from the current
working tree, not just the target's. After running it:
`git add public/icons/<id>_*.png` (the 5 target icons only), then
`git restore public/icons/`. Violating this has shipped dirty-tree icons for
unrelated tanks twice.

## 6. Certified oracle-defect caps (the only gate exemptions)

Some references are physically defective (fused rigs, yawed bodies,
short/long-modelled barrels). If a component is PROVABLY capped by an oracle
defect: document the cap in the packet, queue a rigid-transform repair batch
if possible, and the build must then match published dims + the undamaged
views. Standing case law:

- A cap never excuses `dims`.
- Hull-anchored registration means a short-barrelled oracle caps ONLY
  `wholeCurves`. A cap claiming more on such an oracle is invalid.
- A fused tube authored provably LONG (m46: reused m26 tube, +6.6%) caps
  `wholeCurves` + exactly the plan turret columns the tube occupies —
  listed per-column in the packet. Side turret rows are NOT covered.
- Certified residuals exist for gear-fade print artifacts (t90a class) —
  check the packet before re-fighting a certified column.
- t64bv1 turret rail: measured strut = −12.9 turret, drop = −3–4, keep = 0
  → kept as documented oracle parity; drop it if the visual critic vetoes.

## 7. Doctrine — the laws written in blood

### 7.1 Orientation truth (three layers, ALL required)
t62mv1 shipped with its hull BACKWARDS and turret at the stern while scoring
~70 — translation-only registration is blind to fore-aft mirroring, and the
owner caught it on sight ("bruh be better at identifying these things").
(1) Builder-side vertex asserts: bow direction and turret-seat sign derived
from reference vertices (gun-forward at yaw 0 = +z) must match the build;
turret underside must not penetrate the hull deck beyond the ring recess.
(2) Gate v11 mirror check: side+plan hull curves re-scored mirrored; a
decisively better mirror fit hard-zeros the row (`orientationFlip: true`).
KNOWN LIMIT: near-symmetric silhouettes (T-62-class low wedges) evade it.
(3) Mandatory turntable review before any sheet ships. The root cause was
ultimately fixed AT THE ORACLE (`_rotate_mesh_180y`) — when a reference
itself faces −z, repair the oracle, don't mirror the build.

### 7.2 Plate-fill rule (owner directive, KV-2 case)
Any plate/shelf/lip added for silhouette parity must read as SOLID
FABRICATION at close-up — no hollow backs, no floating single-sided panels,
no voids between plate and parent. Close the volume or extend to hull
contact; webs/gussets where a real vehicle would have them. Fills stay
WITHIN the certified silhouette (gate scores must not move); graduates
re-gate and re-freeze after any fill. COUNTER-LESSON (chieftain5): a full
bin-to-fender fill regressed front_whole 47.3→45.6 because the reference's
own bin floats — "the certified silhouette owns that air." Web at the fender
plane instead. Match the reference's voids, don't out-solid it.

### 7.3 Edge-on prism law (stations)
Station cameras render a ~0.52 m clipped slab; an axis-aligned long thin
prism presents only its end caps and is INVISIBLE at mid-span slices. Any
sidewall strip / full-length fender lip / rail authored as one long prism
silently depresses `stations` width rows. Author segmented (per-bin boxes
with real end faces, like actual stowage). Measured: t62mv1 stations
54.2→76.1 from segmentation alone.

### 7.4 Measurement mechanics that decide scores
- **1024-px plan column slivers**: features near a column boundary need a
  full pixel — a tube of r 0.112 m reads as missing; 0.118 reads. Check the
  extract before chasing a phantom plan miss.
- **hullLengthM quantization**: the trace quantizes ~11 cm when a long gun
  pins the frame; a true span straddling a column boundary can read >1% off.
  The dims width measure uses lit-pixel extent (~2–3 cm) — lengths don't.
  A `flap`/end-plate nudge that moves the span off the boundary is a
  legitimate guard (t72b3m precedent), silhouette-neutral only.
- **12% body filter**: side-body columns need band >12% of height to count
  toward hullLengthM/heightM — an evacuator or antenna can silently extend
  the measured hull if it crosses the threshold (t72bu: evac r capped 0.132;
  at 0.134 hullLengthM read 7.97).
- **Whip antennas don't count toward width; skirts and fenders DO** (published
  widths include them).

### 7.5 Family constants (banked, reuse before deriving)
- Soviet/Russia: V-hull belly ~0.30 (BUT verify per tank — t72b3m ref is
  0.42), tub + segmented fender lips, track pads +0.04 past trackW/2,
  twin-stack/trough front checks.
- **Mantlet-slot dip**: every T-72/T-90 print dips to ~1.75–1.94 at
  front-center; a symmetric lathe apex reads +0.4 there. Author a squat dome
  + off-center furniture (Sosna tower / cupola own the p95 roof), never a
  tall symmetric apex.
- Lathed tubes need seam rings ≤0.36 m spacing or the curve rows read
  faceting.
- UK (ukHull): lofted mudguard solids heal hollow-plate reads across the
  family (one loft healed five tanks).
- Casemates: `fixedMount` gives vacuous turret 100 via spec — hull rows are
  everything (isu122s proves the family can pass).

## 8. The per-tank loop

1. Read the packet (`docs/references/tanks/<id>.md`) — provenance, caps,
   prior rounds' NEXT list. Read the family constants above.
2. `vertex-extract` the oracle. Compare stylization factors vs published
   dims. If the print is stylized >~2%, plan a normalization batch
   (§5.2) BEFORE building — never chase a stylized oracle with the build.
3. Author/rework the profile in `src/vehicles/profiles/<family>.js` from
   extract corners and station targets. Respect WIDTH GUARD comments —
   exceeding committed max width silently rescales the whole tank in the
   loader.
4. `vertex-workorder --id=<id>` → fix the worst rows by absolute coordinates.
5. `geometry-gate --ids=<id>` → repeat 3–4 until every component ≥90.
   There is no iteration cap. Log each round in the packet (before→after
   per component + what moved it + NEXT list). Packets are the program's
   state — a fresh agent must be able to resume from packet + ledger alone
   (proven: agents have been respawned from packets after transcript loss).
6. Board render → turntable review (§7.1 layer 3).
7. Independent visual critic ≥9.0/10 every view (fresh eyes — not the
   builder grading itself).
8. Graduate (§10) in the pass commit.

## 9. Working agreements (non-negotiable)

- **Agents never commit.** The orchestrator verifies (parse, gate re-run,
  ledger cross-check, board eyeball) and commits precise paths per round.
  Precedent for every commit message: family + per-tank ledger deltas +
  verification line.
- File ownership per agent; one family per agent; parallel agents never
  share a profile file. Foreign uncommitted work in the tree is untouchable.
- Own vite per tool run (74xx–77xx). Quiesce heavy workloads while the owner
  is playing on 5001.
- Bank state in packets continuously; assume the session can die anytime.
- Icons: §5.7 staging rule, every time.
- Full `npm test` + zero console errors before any round lands; the
  screenshot-contract staged frames (`killcam_xray` etc.) must stay intact.

## 10. Graduation procedure (worked example: m60a1, commit 0f5cd55)

When a tank passes BOTH gates + turntable review, in ONE commit:

1. Retire the GLB registration: in the userdrops registration
   (`src/vehicles/userdrops5.js` pattern) the spec keeps NO `source()` call —
   the procedural build ships in every flavor. The recovered GLB FILE stays
   on disk (it remains the measurement oracle; the harness has no
   graduate-reference override yet, so freeze verification is by geometry
   hash — `tools/tmp-hashgeo.mjs` — not by re-gate; a gate run against a
   missing reference writes a false 0).
2. Mark the CUSTOM chip in the garage roster metadata.
3. Regenerate the tank's 5 icons with the §5.7 staging discipline.
4. Record the freeze hash + graduation date in the packet.
5. Ledger row stays (tool-written) as the frozen pass of record.

## 11. Suggested execution order

1. §4 adjudication: oracles GLB reconciliation → land casemate (isu122s →
   graduate), leopard, merkava, patton-profile work that passes review.
2. Harvest the 80–90 band: leo2a6, merkava3c, merkava3b — each is one
   focused round from the geometric gate.
3. 60–80 band by family batches (casemate isu152 + jpz_e100/sturmtiger with
   the isu122s recipe; merkava3d/1b with the 3c recipe; patton pair after
   the oracle scale repair lands; kf51).
4. Russia long tail with the banked mantlet-dip/sliver lessons (t72b3m 58.2
   leads; packets carry exact NEXT lists per tank).
5. Abrams family (m1a1 hull is already 90.1 — the turret is the whole fight;
   fix once, propagate to the m1a1ha/m1a2_tejas clones).
6. Triage the 28 zero rows (§3) — classify each as unstarted / registration
   bug / oracle defect / scale mismatch before scheduling. Expect several to
   need repair batches (t54/type59/amx30-class dims=0).
7. Sub-30 rebuilds last, families together (centurions+comet+charioteer with
   ukHull; IS family; abramsx via the masked-registration gate option noted
   in its packet).

Fleet-worst today is 0 (28 untriaged rows); fleet-worst among ATTEMPTED
tanks is t90sm 37.9. The program ends when the ledger's minimum row is ≥90,
every graduate is hash-frozen, and no tank registers a reference GLB at
load. The gate is deliberately far ahead of the fleet — that is the point:
it is the definition of done, not a description of today.
