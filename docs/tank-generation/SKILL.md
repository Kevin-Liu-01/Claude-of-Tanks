---
name: tank-generation-handbook
description: Reconstruct, edit, verify, and hand off first-party procedural tanks from supplied models, photographs, and Gallery surface markup.
---

# Tank-generation procedure

## Purpose
<!-- agent-docs:fill:purpose -->
Give the next agent a complete, evidence-backed route from an owner's tank
request to an authored playable model, without depending on chat memory.
This is a repository instruction page reached through the root agent index,
not a separately installed global plugin or an autonomous publication grant.

## Read order
<!-- agent-docs:fill:model -->
Read [README](README.md), [workflow](workflow.md), [quality gates](quality-gates.md),
the current [fleet style/performance priority](fleet-style-performance-priority.md),
the root [agent index](../../AGENTS.md), and [vehicle skill](../../src/vehicles/SKILL.md).
Read the full applicable [build standard](../BUILD-STANDARD.md) and
[geometry gate](../GEOMETRY-GATE.md), respecting the chronology note in README.
Load [geometry methods](geometry-methods.md) for construction and the
[tool map](tool-map.md) before commands. Existing per-tank and batch packets
override guesses about what was already built, not current gate failures.

## Execution
<!-- agent-docs:fill:tasks -->
1. Inspect branch, dirty state and current task. Isolate broad work; never clean
   or blanket-stage the shared checkout. Record exact owned IDs/files.
2. Fill the [run packet](templates/run-packet.md), retaining the owner's source,
   target, naming, derivation, proportion and publication decisions.
3. Hash and inspect sources; freeze independent registration and actual source
   ownership. Resolve incompatible targets before committing to broad geometry.
4. Author measured primary solids and real negative space. Establish proportions
   before detail; reuse mechanics and quality-aware primitives, not an unrequested
   donor silhouette. Record high/low geometry cost before adding micro-detail.
5. Add physically seated, correctly parented equipment and combat surfaces.
   Verify both sides, articulation, moving tracks, and live/spent/reset ERA.
6. Iterate measured outlines, geometry, native shaded comparisons and an
   independent critic. Keep failed experiments and invalidated receipts honest.
7. Integrate exact lazy IDs, gameplay metadata, anatomy, markings and generated
   assets. Run the complete required validation and cold/warm/rapid tank-switch
   performance checks; preserve originals and report per-ID coverage.
8. Show the actual procedural path and write a resumable handoff. Publish only
   when requested and within the verified/explicitly authorized scope.

## Patterns and stop conditions
<!-- agent-docs:fill:patterns -->
Assign one writer per profile/shared registry; independent critics do not edit
the build they score. Serialize heavy capture work through the existing queue.
Use the [prompt pack](prompt-pack.md) for bounded specialist briefs. Every round
has a goal, a check, the next geometry action, and an honest stop/handoff state.
Do not pause merely because one iteration failed: diagnose and continue safe
in-scope fixes. Stop for an unresolved owner target, missing required source,
new publication authority, or a contradictory gate that needs adjudication.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Surface-export `remove` is not an instruction to delete an attachment the owner
asked to move. A rendered donor is not proof of a new build. A fused source is
not proof of separate component ownership. Parenting is not physical contact.
A silhouette average is not a minimum-view pass. A source-real hole is not a
continuity-zero pass. An as-is push is not qualification. Pending work belongs
in the handoff, not hidden behind “done.”
