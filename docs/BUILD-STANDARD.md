# TANK BUILD STANDARD — the one checklist (owner-ratified laws, 2026-08-03)

Every tank ships when it meets ALL of this. Builders self-check every round;
critics carry these as standing checks; the orchestrator lands nothing that
regresses them. This file supersedes scattered per-packet law restatements —
packets cite it. If this file and GEOMETRY-GATE.md disagree, GEOMETRY-GATE.md
wins and this file needs a patch.

## A. Geometry (the measured gate)
- `node tools/geometry-gate.mjs --ids=<id>` — every component ≥90
  (hullCurves, wholeCurves, turretCurves, stations, dims, floaters). Min is
  the headline. Dims sovereign to PUBLISHED dims (1% grace then −8/pct).
  Certified oracle-defect caps are the only exemption, never covering dims.
- Author from `tools/vertex-workorder.mjs` ABSOLUTE world columns (gate-JSON
  `at` values are camera-frame — never author from them).
- Registration counterweight: dims anchors symmetric about the ref's own
  12%-band mid, at the ref's own band heights.
- heightM p95 budget: ≤4 side columns above published height, aligned with
  the ref's own spikes.

## B. Silhouette identity (owner laws — all four are gate-blocking)
1. FRONT SLOPES: follow the reference's slopes — no flat fronts where the
   real vehicle rakes (M1 glacis is the canonical example).
2. NO EMPTY AREAS / CONTIGUITY: no hollow pockets, no see-through voids, no
   gaps between masses, at ALL angles including top-down. Turrets are
   contiguous volumes; every standoff mass reads attached (mounts,
   brackets, contact shadows). Circular geometry reads circular in plan.
   NO TURRET HOLES: top-down and 55° tilt renders show filled decks — any
   sky/background reading through the hull or turret interior is a failure.
3. DECORATION MINIMUM: roof MACHINE GUNS are MANDATORY (multiple allowed
   and encouraged; add a tastefully-integrated pintle MG even where the ref
   lacks one — critics must not penalize that as parity deviation). Dress
   flat areas from: lights, ropes/tow cables, ladders, ERA/armor blocks,
   wooden trunks, canisters, bags, smoke launchers, railings/holders,
   crates, duffels, antennas. Use `KIT` fittings (kit.js) — don't hand-roll.
4. TRACK CONTAINMENT: tracks never clip through the bow/stern — wrap arcs
   stay clear of hull solids (plates, fenders, flaps). Tracks are the
   two-layer shoe system (pads + inner chain/guide horns) riding real
   wheels; no clipping, no floating bands.
   Check: `node tools/track-clip-audit.mjs --exact --ids=<id>` ≤ ~60 voxels
   per zone (kv2-graduate band); 0 is the target for new builds.

## C. Craft laws (mask economy + render truth)
- PALE-REFUND by default on every new thin member; paired refunds at razor
  margins; pintle-gun silhouette allowance ≤0.4 gate pts/tank.
- MG PHYSICS: sky-backed guns read pale top-lit (≥2px edges, 35-45px runs,
  receiver MASS not a stick, sky silhouette); pale-deck roof guns invert —
  dark crown-riding lines.
- Winding audit on every new slab (backface culling eats reversed slabs
  from top); probe corners after compound rotations; AABB framing on
  fittings (never change the model AABB with decoration).
- Tone work hits the ORDERED class (floor-cliff regimes) — overshoot
  inverts the law. Material splits are free where geometry is priced
  (rear-visible content below the idler-wrap line writes side-mask
  bottoms — split materials instead).
- Shadow-proxy meshes ARE in gate masks (overrideMaterial defeats
  colorWrite:false).

## D. Measurement discipline (claims law)
- Done-gates measure on the OFFICIAL rigs only: gate runs +
  `tools/tmp-tank-critic.mjs --id=<id>` pairs. Bespoke harnesses are
  diagnosis-only. Custom crops never count as verdict evidence.
- Sky/air claims: MASK-METHOD (bg |px−0x151b20| maxch ≤13 + rect). Tone
  claims: ITU-601 luma rects WITH coordinates. Banked numbers re-derive
  from current renders before re-use.
- REF-RENDER OUTRANKS ROW ANALYSIS; ref-silhouette permit; perspective-
  volume verified in hero views.

## E. Oracle repairs (orchestrator lane ONLY — warp law v2)
- Fresh `.bak` from committed HEAD bytes per batch (equal-tris/fewer-verts
  census mismatch = STALE-BAK signature — refresh, never patch expects
  down). Legacy recipes demote to history when the baseline advances.
- Never flat-assign `REPAIRS[id]` over an existing entry.
- Every batch verifies IN THE GATE against a stable proc build before
  commit; documented retune debts are the only acceptable regressions.
- Builders/critics REPORT normalize plans + literals; they never run
  repairs or touch GLBs.

## F. Round protocol (uniform for every family agent)
1. One agent per profile file (single-owner). NEVER commit. Env:
   `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`; own vite
   74xx-77xx; FIFO lock respected.
2. Graduates in your file are HASH-FROZEN: verify with
   `node tools/tmp-hashgeo.mjs --ids=<graduates>` before reporting;
   shared-helper edits are opt-in params with byte-identical defaults.
   Do-not-gate list: m60a1, m60a3, kv2.
3. Every round ends with: gate line ×2, standard-check clean
   (`node tools/tank-standard-check.mjs --ids=<id>`), packet round section
   WRITTEN (landing law — orchestrator writes a landing note if missing,
   and that costs the round a discipline flag), shots under shots/<round>/.
4. Report format: per-tank before/after components, per-order done-gates
   with official-rig measurements, honest residuals, worst remaining
   columns, graduate hash proof, law discoveries for the bank.

## G. Definition of DONE (unchanged, dual gate)
Geometry ≥90 every component + independent critic ≥9.0 EVERY view (same
vehicle, same tier) + turntable eyeball + graduation per GEOMETRY-GATE.md
§10 in the same commit. Any geometry edit invalidates a prior critic
verdict.

## H. RIG STANDARD (owner directive 2026-08-03: standard + family rigs)
Tanks are built as RIGS, not bespoke mesh piles. Three layers:

1. **BASE RIG** (KIT layer, kit.js): every tank exposes the same skeleton —
   hull loft (station-profile driven), running gear (wheelZs/wheelR/idler/
   sprocket + the two-layer track system), turret ring + yaw pivot, gun
   assembly (trunnion/mantlet/tube/muzzle) with elevation pivot, fittings
   mounts (KIT.fittings consumers), family material slots. The gate's
   articulation poses and the game's damage/recoil systems assume this
   skeleton — a build that fights it is wrong even at 90+.

2. **FAMILY RIG** (one per family file): similar tanks SHARE one
   parameterized rig — abrams varieties (m1a1/m1a1ha/m1a2/tejas/tusk/
   abramsx/sepv2), leopard varieties (leo2a4/a5/a6/a7/a7v/revolution/
   proto), merkavas (1b/2b/2d/3b/3c/3d/4/4b), t-series lineages
   (t54/t62/t64/t72/t80/t84/t90 chains), pattons (m26/m45/m46/m47/m48/
   m60s), centurions, IS-line. A variant is a PARAM DELTA on its family
   rig (dims, turret planform, skirt/ERA kit, fittings selection, era
   dressing) — not a new loft. Litmus: adding the next variant of a family
   should be <150 lines of params, not a re-author. The t80/t80b/t80bv
   batch (russia r25) and merkava_batch4() are the live exemplars.

3. **MIGRATION RULE**: graduates are hash-frozen — they adopt the family
   rig ONLY inside a graduate-change round (fix → gate hold → critic
   re-cert → re-freeze, one commit), never as a side effect. New builds
   and rebuilds go through the family rig from birth; a family's first
   rig-conformant build defines the rig (document its param surface in the
   family packet). Orchestrator schedules rig-consolidation rounds per
   family once ≥2 variants pass the gate.

## I. KIT.fittings usage (§B3/§B4 workflow — kit-fittings round)
Decoration is a WORKFLOW, not per-tank authorship: use
`KIT.fittings.<fn>` (src/vehicles/profiles/kit.js) — hand-authored
decorations need a packet justification.
- Library: `pintleMG` (M2/DShK/NSVT/MAG classes, tone
  'two-tone'/'pale'/'dark' per MG PHYSICS deck polarity, optional AA ring /
  ammo / shield), `stowageRack`, `towCable`, `jerryCans`,
  `spareTrackLinks`, `lightCluster`, `smokeBank`, `antennaWhip`,
  `unditchingLog`. All deterministic (seed param, no Math.random), material
  slots come from the caller's own family mats.
- Call pattern (in a profile builder):
  `import { KIT, FITTINGS } from './kit.js';`
  `const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2' });`
  `mg.position.set(x, roofY, z); P.turretG.add(mg);`
  (`KIT.fittings` is the same object on every runtime path; the `FITTINGS`
  import is the spelling that also survives synchronous top-level
  createTank rigs — kit.js evaluates inside the tankFactory module cycle,
  see the attach-site note in kit.js.)
  Anchor the WHOLE stamped envelope (`group.userData.aabb`) INSIDE the
  hull/turret AABB — fittings must never change the model AABB (§C).
- Census (§B3 machine check): every fitting mesh carries
  `userData.fitting`; `node tools/tank-standard-check.mjs --ids=<id>`
  requires mg ≥ 1 fitting instance and reports the dressing count, plus the
  §B2 top-down hole scan (0 enclosed cells). Hand-authored decoration
  censuses ZERO — migrate it or justify it in the packet.
- Library self-test: `node tools/tank-standard-check.mjs --fixture`
  (marker coverage, AABB stamp, seed determinism, top-down winding).
