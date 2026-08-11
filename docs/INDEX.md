# INDEX — where everything lives

(2026-08-09. The navigation hub for the repo. Nothing here is law — it points at the
law. If a path listed here ever disagrees with docs/PROGRAM-STATE.md, PROGRAM-STATE
wins.)

## Start here (new session / new device)

1. **docs/PROGRAM-STATE.md** — THE registry + takeover handbook. §13 is the resume
   protocol: clone → npm install → npm test → read PROGRAM-STATE + BUILD-STANDARD +
   GEOMETRY-GATE → respawn §12 rounds → land per §6 → heartbeat.
2. **docs/BUILD-STANDARD.md** — the LIVING RULEBOOK (§A-§J). Every builder/critic
   re-reads it at round start; every lesson lands here the turn it arrives.
3. **docs/GEOMETRY-GATE.md** — the measured gate spec + graduation amendments. Wins over
   BUILD-STANDARD on conflict.
4. The tank you're touching: **docs/references/tanks/<id>.md** — the packet is the
   tank's single source of truth.

Skills (in .claude/skills/ — operational checklists distilled from the law):
`land-round` (orchestrator landings) · `spawn-builder` (family agent briefs) ·
`spawn-critic` (independent verdict briefs) · `graduate` (§10 + flip-era) ·
`oracle-repair` (§E warp law v2) · `onboard-oracle` (bradley flow) · `photo-round`
(no-oracle / §B7 flow).

## Program documents (docs/)

| Doc | What it is |
|---|---|
| PROGRAM-STATE.md | Fleet registry (graduate hashes §3, fleet state §4), orchestrator mechanics §6, directive log §8, incident lessons §9, respawn briefs §12, resume loop §13 |
| BUILD-STANDARD.md | Owner-ratified build laws §A geometry, §B silhouette identity (B1 slopes, B2 contiguity, B3 decoration/guns/density, B4 tracks, B5 parenting, B6 run shape, B7 ref-wrong), §C craft, §D measurement discipline, §E oracle repairs, §F round protocol, §G done, §H rigs, §I KIT fittings, §J critic laws |
| GEOMETRY-GATE.md | Gate components + scoring math, caps case law, orientation truth, anti-gaming rules, §10 graduation amendments (three maps, helper-expanded, trim clamp) |
| PROGRAM-STATE-base21.md | The base-21 modernization roster: exact no-oracle id pool (table A — never gate), oracle-holding originals (table B), slice status + next slices |
| DESIGN.md | Architecture: runtime build pipeline, measurement stack, program loop, oracle lifecycle (file:line anchors) |
| LESSONS.md | The incident narrative behind the laws — prose onboarding |
| ATTRIBUTION.md | Every sourced asset: author/source/license/files; evaluation + judging records; NC quarantine; oracle drops |
| handoff/tank-generation-program.md | The 2026-08-02 full program manual (mission, toolchain §5, doctrine §7, per-tank loop §8, §10 graduation worked example) — PROGRAM-STATE supersedes its fleet state |
| references/tanks/<id>.md | Per-tank PACKETS (101 files): dims sources, oracle provenance/defects/caps, round history, freezes, banked orders |
| references/vertex/<id>.json | vertex-extract outputs — authoring extracts (polylines, stations, landmarks, affine maps) |
| references/profiles/<id>.json | mask-trace profile data used by some builds |
| critique/ | Independent critic verdicts (shaded-parity-*.md, recert-*.md) — the visual gate's paper trail |
| geometry-gate/ | Tool-written: <id>.json work orders + ledger.json (NEVER hand-edit; stage via cacheinfo surgery, PROGRAM-STATE §6) |
| licenses/ | Per-asset license records (community/<slug>.LICENSE-RECORD.txt, sketchfab snapshots) |
| research/ | Pre-build research: tank-roster.md (specs provenance), armor-penetration.md, shells-ballistics.md, movement-physics.md, spotting, modern-roster.md, graphics-aaa.md |
| ARCHITECTURE.md | The original locked 9-module build contract for the game engine itself |
| MODULES.md | Internal module-damage system (hitboxes, resolution, balance tables) |
| DECORATIONS.md | The decoration/fittings system doc (decorations.js + KIT lineage) |
| EVALUATION.md | Independent audit snapshot of the whole game (2026-07-27) |
| SCREENSHOT_CONTRACT.md | The __GAME_READY / staged-frames contract every build must uphold |
| QA-ARCHIVE.md | Durable index for performance/mobile rounds, raw logs, screenshots, post-round campaigns, retention status, and archive procedure |
| MOBILE-QA.md | Sustained-performance Lap protocol, ratified budgets, Rig A/Rig B rules, and the complete rounds 0–31 evidence ledger |
| DEV-PERF-TRACE.md | DEV flight-recorder schema plus normal, CPU-constrained, and software-renderer probe procedures |
| THREE-PERF-OPTIONS.md | Evidence-led Three.js/library replacement shortlist and locally rejected approaches |
| qa-evidence-manifest.json | SHA-256 inventory of current local QA artifacts; `tracked:false` entries still need durable byte storage |
| STUDIO.md | Scene Studio staging rig + scripted-shot API |
| GUNNERY-CAMERA-SPEC.md | Camera/aim coupling spec (empirically derived from the deployed build) |
| RECOVERED-FLEET.md | The 2026-07-29 recovered-fleet integration report |
| HANDOFF-FABLE.md | The 2026-07-30 corrective handoff that launched the rebuild-to-reference program |
| readme/, brand-proofs/, cert-*/perf-*/quietcert-* | README images; brand render proofs; perf/cert artifacts (quietcert lane, PROGRAM-STATE §10) |
| agents/final-judgment.spec.js | Agent-written judgment spec (historical) |

## The measurement tools (tools/)

Official rigs (§D: done-gates measure on these ONLY; all self-manage vite 74xx-77xx;
browser-render rigs self-ticket the /tmp/cot-shots.lock FIFO — never wrap them):

| Tool | Run | Output |
|---|---|---|
| geometry-gate.mjs | `node tools/geometry-gate.mjs --ids=a,b` | docs/geometry-gate/<id>.json + ledger merge; the score of record |
| tmp-tank-critic.mjs | `--id=<id>` | shots/critic-<id>/ — the official 14 shaded pairs |
| visual-evaluator.mjs | `--id=<id> [--views=...] [--selftest]` | shots/visual-eval-<id>/ report.json + overlays; exit 2 = RIG MISMATCH aborts scoring |
| track-clip-audit.mjs | `--exact --ids=<id>` | band+shoe vox per zone; shots/track-clip*.json |
| turret-parent-audit.mjs | `--ids=<id>` | stranded/dangling/abutting; shots/turret-parent.json |
| tank-standard-check.mjs | `--ids=<id>` / `--fixture` | aggregate gate/clip/contig/census line |
| tmp-hashgeo.mjs | `--ids=a,b` | geometry hash + mesh/vert counts (freeze verification) |
| vertex-extract.mjs | `--id=<id>` | docs/references/vertex/<id>.json |
| vertex-workorder.mjs | `--id=<id> [--rows=][--top=]` | absolute-world per-column work order (stdout) |
| vertex-normalize.mjs | `[--ids=] [--verify]` | warp-plan literals for repair batches |
| repair_oracles.py | `inspect <glb>` / `repair <id>` | oracle repairs (orchestrator lane, §E) |
| t14-source-bake.py | `--verify` / `--write` | deterministic compact T-14 exact-source payload; verifies source SHA, semantic groups and donor-gear exclusion |
| tmp-modelsource-dump.mjs | `node tools/tmp-modelsource-dump.mjs [out.json]` | runtime MODEL_SOURCE dump (load-prove; helper-expanded mirrors) |
| genIcons.mjs | `--ids=<id>` / `--tanks <id>` | 8 hashed assets per tank + manifest (views, silhouettes, hit/armor/module diagrams) |
| tank-assets-check.mjs | `--ids=<id>` | Fleet completeness, hashes/dimensions, live geometry+metadata freshness, cannon-bore gate |
| tank-release-check.mjs | `--ids=<id> [--gate]` | Asset+bore gate → tank standard → npm test → private build |
| muzzle-bore-probe.mjs | `--ids=<id>` / `--all` | Straight-on muzzle renders, center rays, contrast metrics, PNG + JSON evidence |
| screenshot.mjs | `node tools/screenshot.mjs` | the 20-view game screenshot contract |
| mobilelap.mjs | `node tools/mobilelap.mjs --out <scorecard>` | deterministic station-by-station mobile budget scorecard |
| dev-perf-probe.mjs | `npm run perf:dev -- --profile=normal\|constrained\|software --out=<json>` | full DEV trace, first-10-second metrics, CPU profile, and synthetic-freeze falsification |
| qa-evidence-manifest.mjs | `node tools/qa-evidence-manifest.mjs` | byte-size/SHA-256/media/tracking inventory for all local QA evidence roots |
| perfprobe.mjs / quietcert.mjs | — | perf budgets; quiet-machine certification (refuses contention) |
| strip-nc-assets.mjs | (via npm run build) | scrubs NC-quarantine assets from public artifacts |

Law-cited tmp rigs (tmp-* is normally scratch, but these are load-bearing citations —
do not delete without updating the laws that cite them):

| Rig | Cited by / for |
|---|---|
| tmp-hashgeo.{mjs,html} | the freeze instrument itself (PROGRAM-STATE §3) |
| tmp-tank-critic.{mjs,html} | official pairs + graduate CRITIC_REFERENCE_OVERRIDES map (§10) |
| tmp-modelsource-dump.{mjs,html} | §10 load-prove + HELPER-EXPANDED law |
| tmp-b1b3-critic-batch.mjs (+ tmp-density-critic-batch.mjs, tmp-cheekgun-critic-batch.mjs) | §F.1 one-ticket batch-driver pattern |
| tmp-leo-photoclass.{html,mjs} / tmp-ww2-photoclass.{html,mjs} | PHOTO-CLASS FLOW law (no-oracle lane rig) |
| tmp-lod-envelope-probe.{mjs,html} | invisible-LOD envelope law (§C addendum) |
| tmp-leo-defuse-*.mjs | §E request-interception sim precedent (vlo de-fusion) |
| tmp-fv510-warpsim.mjs | §E warp-sim precedent (height-clamp keying law) |
| tmp-uk-*/tmp-abrams-*/tmp-rev-*/tmp-a5r* etc. | per-round diagnosis rigs — packet-cited evidence, diagnosis-only (never verdict evidence, §D) |

## Source layout (what an agent may touch)

```
src/vehicles/profiles/<family>.js   ← builders edit ONLY their own file
src/vehicles/profiles/kit.js        ← shared KIT/FITTINGS (opt-in params, byte-identical defaults)
src/vehicles/tankFactory.js         ← createTank pipeline (orchestrator-guarded)
src/vehicles/specs.js + userdrops*.js + variants.js  ← specs/MODEL_SOURCE (single-owner per lane)
src/vehicles/modelLoader.js         ← GLB ingestion/normalization
src/vehicles/materials.js           ← camo/materials; decorations.js ← legacy decor seam
public/models/tanks/community/      ← committable oracles (+ recovered/, quarantine/ = NC local-only;
                                       community-candidates/ = gitignored staging, >100MB GLBs live here)
public/icons/                       ← genIcons output (ICON TRAP staging discipline)
shots/                              ← gitignored evidence; docs/geometry-gate/ ← tool-written scores
```

## Standing environment rules (short form — law in PROGRAM-STATE §2)

- Env for every node run: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
- Owner plays on port 5001; tools own 74xx-77xx.
- /tmp/cot-shots.lock FIFO: official tools self-ticket; 15-digit tickets; never wrap,
  never clear a live lock.
- Agents never commit; ledger is tool-written; never gate m60a1/m60a3/kv2; FALSE-0 law.
- npm test (equipment 166 + track-geometry) before every landing.
- THE ONE ABSOLUTE RULE: no assets extracted from commercial games, ever.
