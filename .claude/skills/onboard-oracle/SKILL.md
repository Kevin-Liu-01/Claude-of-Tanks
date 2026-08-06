---
name: onboard-oracle
description: Onboard a new community reference GLB as a measurement oracle (the bradley flow) - license verification, placement, ATTRIBUTION entry, MODEL_SOURCE registration, vertex extract, gate baseline. Use when the owner drops a new GLB, when a tank gets a new/replacement oracle, or for oracle-sourcing lanes. Triggers - "onboard the oracle", "new GLB drop", "register the reference", "bradley flow", "oracle for <tank>".
---

# ONBOARD-ORACLE — the bradley flow (orchestrator lane)

Precedents: m2a2_bradley (ATTRIBUTION "AFV oracle drop 2026-08-04"), fv510_warrior +
spz_puma + the base-21 oracle wave (ATTRIBUTION 2026-08-06 sections). New oracles are
measurement/influence references for our own procedural builds — NOT shipped visuals
unless separately decided.

## 1. Provenance gate (before the file enters the repo)
- **THE ONE ABSOLUTE RULE: no assets extracted from commercial games, ever.** Inspect
  the binary's embedded metadata (`asset.extras`, scene/node names, title). A title or
  description naming a game ("... (War Thunder)", "from World of Tanks") = REFUSE and do
  not copy the file, regardless of any CC tag — the uploader cannot license the studio's
  model (type_89 refusal, Leopard-2A4-OTCO-2026-07 precedent). Ripper-tool texture names
  (`Tex_NNNN_0.dds`, hash-named dds) are a rip signature.
- **License verify FROM THE BINARY**: 42manako-style Sketchfab exports embed author +
  license + source URL in `asset.extras` — verify there, quote it in the records.
  - CC-BY / CC0 / CC-BY-SA → committable.
  - CC-BY-NC / NC-SA / ND / unverifiable → LOCAL-ONLY QUARANTINE (never ship; goes to
    quarantine/recovered paths; strip-nc-assets covers public builds).
- **GitHub 100MB rule**: files > 100MB (t14 armara, 223MB) live in
  `public/models/community-candidates/` (gitignored staging) LOCAL-ONLY — commit the
  small onboarding EXTRACTS instead; the GLB itself is never pushed.

## 2. Placement + records
- File → `public/models/tanks/community/<name>.glb` (committable licenses).
- **docs/ATTRIBUTION.md row/section**: asset name, author + profile URL, source URL,
  license (+ "verified from embedded asset.extras"), file path, role (oracle for <id>).
- License record file where the wave convention uses one:
  `docs/licenses/community/<slug>.LICENSE-RECORD.txt`.
- Packet section in docs/references/tanks/<id>.md: provenance + what this oracle
  replaces (the superseded print's caps stay recorded as historical).

## 3. Registration (the harness must load it exactly like the game would)
- MODEL_SOURCE row (userdrops*.js pattern / src/vehicles/specs.js:1690): turretNode /
  gunNode regexes, autoPivot, yawOffset, flip — derived from the node tree.
- **HELPER-EXPANDED LAW**: registration helpers inject fields; whenever this oracle's
  config is mirrored anywhere (graduate maps, harness overrides), mirror the
  FULLY-EXPANDED runtime config from `node tools/tmp-modelsource-dump.mjs`, never the
  surface call (gunNode incident).
- Articulation sanity: turret yaw + gun node found (fused-gun prints register with the
  gun virtual — kv2 rule); wrong-facing prints get an oracle-side rotate, never a
  mirrored build.

## 4. Vertex extract (REG)
`node tools/vertex-extract.mjs --id=<id>` → docs/references/vertex/<id>.json (commit it).
Read off and record in the packet:
- stylization factors vs published dims (>~2% → plan a §E normalization batch BEFORE any
  build chases it);
- which loader min() clamp binds (len vs width*1.08 vs height*1.30) — mast-heavy prints
  bind on height (fv510 lesson);
- landmark corners (ring axis, deck/belly breakpoints) for the family builder;
- counts (meshes/verts/tris) — these become §E census guards.

## 5. Gate baseline x2
`node tools/geometry-gate.mjs --ids=<id>` TWICE — rows identical; this is the honest
baseline the family lane climbs from. FALSE-0 LAW: if the reference fails to load or
register, fix the registration first — never record a broken-ref run in the ledger.
Then `npm test`, land per `land-round` (files + ATTRIBUTION + packet + extract + ledger
row in one commit).

## 6. Special cases
- **Replacing a graduate's oracle** (t72b3m re-oracle candidate): a graduate swap is a
  full re-gate + re-cert protocol (graduate-change law) — the frozen hash only moves via
  a ratified critic PASS.
- **Replacing a retired/short print** (fv510): the old print's certified caps stay
  historical in the packet; the live round's gap table becomes the re-verify checklist
  under the new measured frame; expect the curve-row ladder to come alive again.
- **New-vehicle drops** (spz_puma): oracle onboarding is step (c) of the full build-up —
  spec row first, profile home decision, then this flow, then the photo-class/gate round,
  then icons + tech-tree row.
- Owner-named recipe donors ("use the bradley on puma") go in the builder brief, not the
  oracle records.
