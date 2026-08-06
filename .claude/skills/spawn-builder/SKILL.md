---
name: spawn-builder
description: Compose the brief for a family-builder agent in the tank generation program. Use when spawning or respawning a builder round (gate ladder, photo-parity, density/decoration, graduate-change), when writing an agent mission brief, or when a lane frees up and needs a new tank round. Triggers - "spawn a builder", "respawn the round", "brief the family agent", "start a round on <tank>".
---

# SPAWN-BUILDER — the family-builder brief boilerplate

Every builder brief carries ALL of the boilerplate below verbatim-in-spirit (PROGRAM-STATE
§6/§12), then one of the round-type variants. A brief that predates a law never excuses
missing it — builders re-read docs/BUILD-STANDARD.md at round start.

## The boilerplate (include in EVERY brief)

1. **NEVER commit.** The orchestrator verifies and commits. No checkouts/restores/
   stashes on shared files. NEVER `git stash` in the fleet tree (it sweeps foreign
   concurrent WIP — proven incident); snapshot YOUR OWN file to the scratchpad instead,
   so an external mid-round revert can be recovered from your mirror.
2. **Single-owner file**: one family per agent; you edit ONLY your profile file
   (src/vehicles/profiles/<family>.js or the assigned modernN.js). Foreign uncommitted
   work anywhere in the tree is untouchable. Shared-helper edits (kit.js, tankFactory)
   are opt-in params with byte-identical defaults, proven by sibling hash-holds.
3. **Read first**: docs/BUILD-STANDARD.md (all of it — cite section numbers back),
   docs/GEOMETRY-GATE.md, your tank's packet docs/references/tanks/<id>.md.
4. **Env line** for every node run:
   `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
5. **Own vite on 74xx-77xx.** NEVER 5001/5002 — the owner plays on 5001.
6. **FIFO §F.1 hard rules**: /tmp/cot-shots.lock serializes browser tools. The official
   rigs (track-clip, turret-parent, standard-check, visual-evaluator, tank-critic)
   SELF-TICKET — never wrap them in an external lock hold (deadlocks proven twice).
   Tickets are 15-digit zero-padded. Never clear a live lock (5-min staleness reclaim is
   the tools' own job). Queue timeout is 30 min — retry honestly, never jump. For render
   batches hold ONE ticket with a batch driver on the identical render path
   (tools/tmp-b1b3-critic-batch.mjs pattern).
7. **NEVER stop to wait on watchers/monitors** — stopping ends your run. Run chains
   sequentially in-process.
8. **Graduate hashes to hold** (list them in the brief from PROGRAM-STATE §3): verify
   `node tools/tmp-hashgeo.mjs --ids=<graduates in your file>` BEFORE first edit and at
   close — byte-identical or the round is invalid. Do-not-gate: m60a1, m60a3, kv2.
9. **FALSE-0 LAW**: never record gate runs against missing/broken references; no-oracle
   ids are photo-class (see `photo-round`).
10. **Round close battery** (§F.3): gate line x2 (identical), `tank-standard-check`
    clean, `track-clip-audit --exact` (band AND shoe), `turret-parent-audit`,
    visual-evaluator rig-parity, §B5 yaw-90 pair where turret kit moved, npm test green,
    shots under shots/<round>/, PACKET SECTION WRITTEN before reporting.
11. **§F.4 report format**: per-tank before/after components; per-order done-gates with
    official-rig measurements; honest residuals; worst remaining columns; graduate hash
    proof; law discoveries for the bank. Claims about angles/roundness cite
    visual-evaluator numbers (§D) — eyeballs don't count.

## Round-type variants (append ONE)

### A. Gate ladder (oracle-measured climb toward min >= 90)
- Start from the packet's NEXT list + `node tools/vertex-extract.mjs --id=<id>` (extract
  corners are where every tank starts; if the print is stylized >~2%, REPORT a warp plan
  — never chase a stylized oracle with the build, never run repairs yourself, §E).
- Author from `tools/vertex-workorder.mjs --id=<id>` ABSOLUTE world columns (gate-JSON
  `at` values are camera-frame — never author from them).
- Iterate gate → worst rows → fix; no iteration cap. Respect WIDTH GUARD comments — one
  proud fitting past the width anchor rescales the whole build (§D).
- Log every round in the packet: before→after per component, what moved it, NEXT list.

### B. Photo-parity round (owner screenshot / no-oracle / §B7 region)
Use the `photo-round` skill as the contract: numbered GAP TABLE first (photo read →
baseline read → fix), dims/floaters HOLD line, photo-class self-read table, §B7
divergences certified per-region in the packet.

### C. Density / decoration round (§B3.2)
- Additions ONLY in proven-free mask classes (flush-recess, certified bump envelopes,
  sub-line side cover, ring stations); frozen rows must hold EXACT.
- KIT.fittings only (§I) — hand-authored decoration censuses zero and needs a packet
  justification. National grammar (§H.4): US marks read American (M2 collar class),
  Soviet read NSVT/Kord. MG PHYSICS tone per deck polarity.
- RNG-STREAM STABILITY: append stowage() entries at stream end or hand-stamp — mid-stream
  inserts re-jitter every later priced bag.
- Report the diff-derived changed-view list (§J) — derive from per-view pixel diffs, not
  occlusion reasoning; the critic re-derives it anyway.

### D. Graduate-change round (frozen tank)
- The tank is HASH-FROZEN. Protocol: fix → gate hold x2 (frozen rows EXACT unless the
  change is priced and documented) → request independent re-cert critic (>=9.0 on the
  diff-derived changed views; floor holds) → orchestrator re-freezes the NEW hash — all
  landing in ONE commit.
- Camo-bucket moves reseed bakeDirt mottle (LOCAL frame): pixel-identity is unreachable —
  a full critic re-cert on changed views is mandatory, plan for it.
- Yaw-pair evidence is only valid at the hash it rendered (§J) — re-render after any edit.
- Deliver: candidate hash + mesh/vert counts, changed-view list, before/after pairs
  preserved, re-cert request in the report.
