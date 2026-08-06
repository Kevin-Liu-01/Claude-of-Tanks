---
name: oracle-repair
description: Execute or plan an oracle GLB repair batch (warp law v2, BUILD-STANDARD section E) - reference-print warps, turret re-seats, vlo bake excisions, spec true-ups. ORCHESTRATOR LANE ONLY. Triggers - "run the warp", "repair the oracle", "execute batch", "repair_oracles", "normalize the print", "re-seat the turret", "excise the vlo".
---

# ORACLE-REPAIR — §E warp law v2 (orchestrator lane ONLY)

Law: docs/BUILD-STANDARD.md §E (+ §C loader-clamp addendum, §B7 census-frame addendum).
Tooling: tools/repair_oracles.py (append-only recipe registry; node-level surgery,
pristine .bak, byte-idempotent), tools/vertex-extract.mjs, tools/vertex-normalize.mjs.
Builders and critics REPORT normalize plans + literals — they never run repairs or touch
GLBs. Executed exemplars: m26_pershing batch-42 (packet), leo2_revolution vlo de-fusion
(packet r16), fv510 batch-44 (packet).

## Pre-flight (before extending ANYTHING)
1. **Reproduce committed bytes**: run the tank's EXISTING recipe chain against a fresh
   .bak and prove the output byte-equals the committed GLB (shasum) BEFORE adding a
   batch. If it can't reproduce, the chain is stale — stop and reconcile first.
2. **Fresh .bak from committed HEAD bytes** per batch. STALE-BAK signature: census reads
   equal-tris/fewer-verts vs expects → refresh the .bak, NEVER patch expects down.
3. **Census expect guards**: (meshes, verts, tris) counts taken from the current extract
   on committed HEAD bytes; the recipe asserts them before writing.
4. **Which loader clamp binds?** modelLoader normalization is
   `s = min(targetLen/size.z, width*1.08/size.x, height*1.30/size.y)`
   (src/vehicles/modelLoader.js ~2342). Mast-heavy prints bind on HEIGHT — a pure z-warp
   is normalized away until a y-knee releases the clamp. Verify the binding term before
   authoring any warp; judge warps by ROW TERMS (mean/p95/cover/safeScale), NEVER the
   0-floored headline (curve = 100 − 12·mean − 0.6·p95 − 1.5·cover; the 12x mean term
   floors shape-divergent prints at 0 regardless — the fv510 "inert warp" misread).

## Authoring the batch
- Plans come from `node tools/vertex-normalize.mjs --ids=<id>` (piecewise-linear per-axis
  maps in gate meters → GLB-world control-point literals via the extract's affine map).
  WIDTH (gate x) IS NEVER WARPED — it is the safeScale anchor. Monotone maps only.
- Append the batch BEFORE `if __name__` in tools/repair_oracles.py. NEVER flat-assign
  `REPAIRS[id]` over an existing entry — when a recipe supersedes an older one, DEMOTE
  the old one to history with a note and archive its bak as `*.pre-batchNN-history`
  (t84 double-warp lesson: duplicate keys ran a stale batch; python asserts on
  REPAIRS[id] must target the LAST definition site — rindex).
- Landing scripts assert against the FILE on disk, not the in-memory copy they appended.
- **Spec-mirror true-ups** (vertex-extract.mjs pubDims + the userdrops/specs dims row)
  land in the SAME batch as the warp — a dims true-up alone flips gate rows mid-state.

## Verification (every batch, before commit)
1. **Byte-idempotent x2**: run the recipe twice; shasum identical both times, and a
   re-run on already-repaired bytes is a no-op.
2. Census guards pass exactly.
3. **Gate-in-loop** vs a STABLE proc baseline (re-baseline at execution — ledger rows
   drift): documented retune debts are the ONLY acceptable regressions; dims must hold.
   Healthy plan/front/stations = keep the warp and queue the post-warp re-anchor round
   in the family lane (m47 batch-34 / m26 batch-42 precedent).
4. Regenerate the vertex extract on the warped bytes (`--verify` deltas ~0 vs published);
   the re-anchor builder authors from the WARPED extract frame.
5. npm test; land per `land-round` (split-staging if the .py holds a second batch).

## Coupled landings (repair + build move together, ONE commit)
- **VLO-BAKE POLLUTION** (leo2_revolution class): a print's `*_vlo` whole-vehicle LOD
  shell rides the HULL node and bakes at-rest turret into every hull mask; when the proc
  mirrored the bake, the LOD-delete repair ALONE gates 0 (hull-anchored registration
  collapses) — repair + proc re-lay land in one commit. Audit any print carrying
  `_vlo`-suffixed nodes before trusting its hull rows (t64bv1 / t72* / t90* candidates).
  Corollary (§J): a vlo-drop opens honest dark windows — re-audit adjacent furniture
  even where its bytes didn't change.
- **ORACLE-REGISTRATION-PINNED** furniture: followers extension in the three override
  maps + proc re-parent + full re-gate, one landing.

## Simulation before mutation
**REQUEST-INTERCEPTION SIM**: verify candidate repaired bytes against the UNMODIFIED
official gate math via puppeteer request interception (`req.respond()` serving candidate
GLB bytes at the reference URL) — full-fidelity coupled-state verification with zero
shared-file edits (tools/tmp-leo-defuse-gate.mjs / tmp-fv510-warpsim.mjs precedents).
Prove rig parity to the decimal (committed bytes x HEAD tree reproduces the ledger line)
before trusting any simulated number.

## Census gotchas
- **TURRET-FLIP CENSUS FRAME**: a print's TurretMesh can render PI-yawed about the
  turret pivot vs raw glb coords while the Gun subtree does not — glb-frame censuses map
  to gate meaning with x AND z negated for the turret node ONLY. Attribute content by
  station ownership before excising.
- **DEGENERATE SLIVERS**: one zero-area triangle can carry double-digit gate points —
  component censuses list 1-tri components, and excision rounds check them FIRST (free
  wins with differential-sim proof).
- repair_oracles.py is node-level surgery by charter; the sanctioned mesh-byte
  exceptions (slim_radial, py2 rotate, _axis_warp) are census-guarded — anything new in
  that class needs the same guard treatment and a header note.
