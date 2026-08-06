---
name: graduate
description: Execute the graduation protocol (GEOMETRY-GATE section 10, flip-era variant) when a tank passes the dual gate, or run the graduate-change re-freeze flow for an already-frozen tank. Triggers - "graduate <tank>", "run section 10", "retire the registration", "re-freeze", "freeze hash", "graduate-change".
---

# GRADUATE — §10 graduation + the flip-era variant

Law: docs/GEOMETRY-GATE.md (§10 amendments), docs/handoff/tank-generation-program.md §10
(worked example), docs/PROGRAM-STATE.md §3 (registry + mirror maps). Recent executed
examples: m26_pershing / m1a2_sepv2 / centurion3 packet GRADUATED entries.

## Preconditions (dual gate — no exceptions)
1. `node tools/geometry-gate.mjs --ids=<id>` x2: every component >= 90, runs identical.
2. Independent critic >= 9.0 on ALL 14 views AT THE CANDIDATE HASH (fresh adjudication
   doc in docs/critique/ — any geometry edit after the verdict invalidates it).
3. Turntable eyeball done (orientation, articulation, fabrication truth).
4. Candidate hash verified yourself: `node tools/tmp-hashgeo.mjs --ids=<id>`
   (hash + meshes/verts recorded).

## The ONE commit (all steps land together)

1. **Retire the runtime registration.** The spec keeps NO GLB source; the procedural
   build ships in every flavor. Flip-era tanks are usually already retired at the fleet
   flip (c487188) — then this step is a VERIFICATION: check the id is excluded from the
   userdrops SOURCED lists (e.g. USERDROP6_SOURCED_IDS) rather than an edit.
2. **Three-map mirrors** (measurement continues against the on-disk oracle):
   - tools/procedural-fidelity.html → LOCAL_REFERENCE_OVERRIDES
   - tools/visual-evaluator-page.html → CRITIC_REFERENCE_OVERRIDES (committed; the §D
     evaluator ABORTS on graduates without it)
   - tools/tmp-tank-critic.html → CRITIC_REFERENCE_OVERRIDES
   **Mirror the HELPER-EXPANDED runtime config, never the surface call** (the gunNode
   incident: userdrops5's `articulated` helper injects `gunNode:'^Gun'`; dropping it
   cratered leo2a5 to min 0 at load-prove). Dump the runtime truth with
   `node tools/tmp-modelsource-dump.mjs` (full-chain import for donor order) and mirror
   THAT object literally.
3. **Variants backfill check**: if variants.js VARIANT_TANK_IDS carries rows based on
   this id, backfill them; otherwise record "no variants backfill / verified impossible"
   in the packet (m1a2/chieftain5 precedent wording).
4. **Icons x5 — THE ICON TRAP**: genIcons rewrites ALL ~520 icons from the live tree.
   Regenerate from a CLEAN HEAD WORKTREE when the live tree carries agent WIP:
   `git worktree add <scratch> HEAD`, symlink node_modules into it, run
   `node tools/genIcons.mjs --tanks <id>` there, copy the 5 PNGs back by exact filename
   (`<id>_top.png`, `<id>_top_silhouette.png`, `<id>_angle.png`, `<id>_side.png`,
   `<id>_side_silhouette.png`), stage ONLY those five, `git restore public/icons/` for
   anything else, remove the worktree.
5. **Packet GRADUATED entry** (docs/references/tanks/<id>.md): date, graduate number,
   dual-gate lines (gate x2 + critic floor/verdict doc), FREEZE HASH (meshes/verts,
   orchestrator-verified), §10 steps performed, residual carry-list with owners.
6. **Registry**: add the row to docs/PROGRAM-STATE.md §3 (id | hash | notes) and update
   §4 fleet state.
7. **Mark the CUSTOM chip** in the garage roster metadata (older protocol step — verify
   it's present for the id's tab).
8. `npm test` green; commit the precise paths; push.

## Load-prove (after the commit)
`node tools/tmp-modelsource-dump.mjs` → the id is ABSENT from the glb map, AND the gate
still measures via the mirrors (`node tools/geometry-gate.mjs --ids=<id>` reproduces the
frozen row). A gate run that writes a false 0 here means a mirror is wrong — fix before
anything else lands. Freeze verification forever after is by geometry hash
(tmp-hashgeo), never by trusting a re-gate against a possibly-missing ref.

## Graduate-change protocol (already-frozen tank needs an edit)
fix → gate hold x2 (frozen rows EXACT unless priced+documented) → independent re-cert
critic >= 9.0 on the DIFF-DERIVED changed views (floor holds) → re-freeze the NEW hash —
all in ONE commit, registry §3 row updated with the ratification note.
- Camo-bucket re-parents/moves reseed bakeDirt mottle → pixel-identity unreachable →
  full critic re-cert required (rest-pixel-diff proof only certifies NON-camo moves).
- ORACLE-REGISTRATION-PINNED fixes are COUPLED: followers extension in the three maps +
  proc re-parent + full re-gate in the same landing.
- Oracle-repair couplings (vlo-drop class): repair alone gates 0 — both halves land in
  ONE commit (see `oracle-repair`).
- Fleet-wide instrument changes (e.g. the invisible-LOD fix) that hold pixels
  byte-identical may mass re-freeze all graduates with an old→new hash table in the
  landing commit — gate amendments that only drift frozen rows UP refresh the ledger
  without re-certification.
