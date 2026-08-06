---
name: land-round
description: Orchestrator landing protocol for the tank generation program. Use when landing a family agent's round, committing builder/critic results, staging ledger rows, ratifying a re-cert, updating the registry, or when an agent reports DONE and its work must be verified and committed. Triggers - "land the round", "land this agent's results", "commit the wave", "ratify", "stage the ledger".
---

# LAND-ROUND — the orchestrator landing protocol

Source of law: docs/PROGRAM-STATE.md §6 (mechanics) + §13.4 (loop), docs/BUILD-STANDARD.md §F.
Agents NEVER commit — only the orchestrator lands, and only after verifying everything itself.

Env for every node run:
```
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

## 0. Preconditions
- The agent's §F.4 report is in hand AND the packet round section is WRITTEN
  (docs/references/tanks/<id>.md). Landing law: if the packet section is missing, the
  orchestrator writes a landing note — and that costs the round a discipline flag.
- Know which round type this is: build ladder / re-cert ratification / graduation
  (graduation has its own skill: `graduate`) / oracle repair (`oracle-repair`).

## 1. Verify claims yourself (never trust the report's numbers alone)
1. **Hashes** — `node tools/tmp-hashgeo.mjs --ids=<candidate,plus every graduate in the
   same profile file>`. The candidate hash + mesh/vert counts must equal the report;
   every graduate in the file must be byte-identical to the registry table
   (docs/PROGRAM-STATE.md §3). A moved graduate hash = STOP, investigate (foreign
   shared-module WIP moves every family hash — clean-room worktree is the honest frame).
2. **Gate** — `node tools/geometry-gate.mjs --ids=<ids>` reproduces the reported rows;
   frozen graduate rows EXACT. NEVER gate m60a1 / m60a3 / kv2. NEVER record a run
   against a missing/broken reference (FALSE-0 LAW).
3. **Battery spot-checks** as claimed: `node tools/tank-standard-check.mjs --ids=<id>`
   (clip 0/0, contig 0, mg census), `node tools/track-clip-audit.mjs --exact --ids=<id>`
   (band AND shoe columns), `node tools/turret-parent-audit.mjs --ids=<id>`.
4. **Re-freezes only on critic PASS**: a builder's candidate hash is not a freeze. A
   graduate re-freezes only when the independent re-cert verdict (docs/critique/) says
   RE-CERT PASS at that exact hash.

## 2. Staging discipline (the owner's parallel session stages deletions and edits)
- `git status` and `git diff --cached --name-only` BEFORE every commit. Never
  `git commit -a`. Commit precise pathspecs only; hunk-split shared files if needed.
- **Ledger rows (docs/geometry-gate/ledger.json is TOOL-WRITTEN; never hand-edit, never
  stage the whole worktree file)** — index-blob surgery, the stage-ledger-rows.py
  scratchpad pattern:
  1. content = HEAD ledger + the worktree rows for ONLY the named ids + recomputed
     `passed`/`total` counters;
  2. `git hash-object -w <tmpfile>` → blob sha;
  3. `git update-index --cacheinfo 100644,<blob>,docs/geometry-gate/ledger.json`.
  The worktree file is left untouched (other agents' fresh rows survive).
- **Split-staging a shared code file** (e.g. tools/repair_oracles.py holding two batches
  for different landings): build the staged variant from the worktree by cutting the
  held-back block, `git hash-object -w` + `--cacheinfo` it, keep the worktree intact.
- **Cross-file rider grep at every landing**: profile diffs referencing shared symbols
  (BUCKET_DEF entries, cfg.* / S.* params, KIT helpers) must resolve in COMMITTED files —
  grep the committed tree before committing or HEAD lands mid-state.
- Per-id gate JSONs (docs/geometry-gate/<id>.json) stage normally WITH the round.

## 3. Test, commit, push
- `npm test` before EVERY landing (equipment 166 checks + track-geometry) — green or no
  landing.
- Commit message = family + per-tank ledger deltas + verification line (precedent in
  `git log`). One landing = one commit; coupled landings (oracle repair + proc re-lay)
  are ONE commit by law.
- Push after each wave.

## 4. Bookkeeping (same turn, not later)
- Update docs/PROGRAM-STATE.md: §3 registry row (on re-freeze/graduation), §4 fleet
  state, §5/§12 agent status. Every ratification gets a note in the packet AND the
  registry row's notes column.
- LIVING RULEBOOK: fold the round's generalizable law discoveries into
  docs/BUILD-STANDARD.md the turn they arrive (per-packet law bank stays the raw record).
- Icons touched? Follow the ICON TRAP rules (see `graduate` skill §4) — stage only the
  target's 5 icons by exact filename, `git restore public/icons/` for the rest.

## 5. Keep the fleet running
- Respawn the freed family lane immediately (`spawn-builder` skill); 6-8 agents total is
  the proven load, two critics max concurrently for FIFO sanity.
- Dead/stalled agents: SendMessage-resume first (context intact); respawn fresh only if
  the transcript is unrecoverable. Waiter-stalls ("waiting on the watcher") get a
  finalize nudge — stopping to wait ends an agent's run.
- Re-arm the ~25-min heartbeat that re-reads PROGRAM-STATE.md.
