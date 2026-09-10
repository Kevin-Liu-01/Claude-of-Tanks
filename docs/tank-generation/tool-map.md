# Tank-generation tool and ownership map

Verified against the repository at `099edfa49603bc473548f6986c8598267a24a4db`
(2026-09-07). This is a practical route map, not a claim that every historical
tool supports every new ID. Read the current implementation before invoking
an unfamiliar command: several tools start a browser even with `--help`.
The [build standard](../BUILD-STANDARD.md) and
[geometry gate](../GEOMETRY-GATE.md) own acceptance requirements.

## 1. Read the right instructions

| Work | Instruction owner |
|---|---|
| Repository scope, shared-worktree safety | [AGENTS.md](../../AGENTS.md), [root skill](../../SKILL.md) |
| Procedural identity, factories, armor, rigs | [Vehicle skill](../../src/vehicles/SKILL.md) |
| Gallery, saved views, surface-markup packets | [Gallery skill](../../src/gallery/SKILL.md) |
| Simulation collision and damage changes | [Simulation skill](../../src/sim/SKILL.md) |
| Capture, geometry, release tooling | [Tools skill](../../tools/SKILL.md) |
| Three.js rendering/performance audit | [improve-threejs](../../.agents/skills/improve-threejs/SKILL.md) |
| Durable documentation | Session skill `agent-docs`; discover its current installed location |
| Interactive visual inspection | Session browser skill appropriate to the available browser; project routing names `agent-browser` |
| Explicit publish request | Session skill `commit-and-push`; do not publish as a side effect of a build request |

Read an applicable skill completely before acting; read its required references
yourself, not through a subagent's summary. External skills are environment
dependencies, not files assumed to exist in a fresh clone. Record unavailable
skills and the scoped fallback. Use committed browser regression tools for
repeatable captures; their Puppeteer implementation is not permission to
replace the interactive browser's governing skill.

## 2. Intake and source-only measurements

First record `git status --short`, `git rev-parse HEAD`, exact IDs, source file
paths, and user-approved reference priorities in an isolated worktree. List
archive contents before choosing or extracting a model (`unzip -l`); do not
silently substitute another similarly named file. Keep raw files outside the
repository or in a confirmed ignored quarantine. Store a SHA-256, selection
reason, coordinate recipe, measured datums, source credits, and uncertainty in
the reference packet. Source hashes are not proof of redistribution rights.

The general local inspector is [source-x-oracle.mjs](../../tools/source-x-oracle.mjs):

```sh
node tools/source-x-oracle.mjs --inspect=/absolute/path/model.glb --report=.qa-dev/tank-run/source-inventory.json
node tools/source-x-oracle.mjs --prepare=/absolute/path/model.glb --recipe=.qa-dev/tank-run/source-recipe.json --report=.qa-dev/tank-run/source-registration.json
```

These accept unpacked GLB, FBX, or OBJ, not ZIP or an arbitrary folder. The
inspection records mesh names, triangles, bounds, and world matrices. Textures
are stubbed: this is a geometry inventory, not a textured-source rendering.
Preparation requires a reviewed JSON recipe with:

```json
{
  "id": "example_x",
  "sourceSha256": "REPLACE_WITH_THE_RAW_FILE_SHA256",
  "axes": ["x", "y", "z"],
  "scale": 1,
  "translation": [0, 0, 0]
}
```

This is a schema example, not usable registration values. `axes` is a signed
source-axis permutation with determinant +1; scale is positive and uniform;
translation is in canonical metres. Choose all values from the source, before
judging the candidate. Optional `includeRoots` needs `selectionReason`.
`exactDuplicateMeshes` additionally proves every omitted world triangle exists
in retained geometry; it is not a generic clutter-removal switch. Preparation
writes only ignored `public/models/community-candidates/<id>_source.glb` and
verifies the raw hash. Never stage that export as a playable asset.

Specialist recipes exist, but carry historical assumptions:

| Tool | Actual scope / caution |
|---|---|
| [leopard-source-study.py](../../tools/leopard-source-study.py) | Blender `--background --python … -- --model=<file> --id=<id> --axes=<signed,axes> --output-json=<path>`; optional `--select`, `--target-width`, `--normalization-scale`, `--render-dir`. Study dimensions and selection first; never independently rescale each component. |
| [revolution-source-oracle.py](../../tools/revolution-source-oracle.py) | Blender script with `--model`, `--output-json`, optional `--output-glb`; source-specific, not a universal import recipe. |
| [t14-x-source-study.py](../../tools/t14-x-source-study.py) | Blender script with `--source`, `--out`, optional `--render`, `--oracle`; uses the Armata source's interpretation. |
| [west-x-source-oracle.mjs](../../tools/west-x-source-oracle.mjs) | Positional `<mk4\|mk3d\|k2\|kf51> <unpacked-input>`; fixed historical source and pose recipes. |
| [vertex-extract.mjs](../../tools/vertex-extract.mjs) | `--ids=<csv>`, optional `--out=<dir> --res=2560`; legacy internal registration table. Register and verify a new source before relying on its output. |
| [source-slab-study.mjs](../../tools/source-slab-study.mjs) | Hardcoded KF51 diagnostic, **not** a general `--id` command. Reusable primitive: [section-slab-bounds.mjs](../../tools/section-slab-bounds.mjs). |

Blender is an external prerequisite; discover its executable rather than
assuming a machine-specific path. Run heavy source studies through the queue
below. Commit concise scalar measurements and authored decisions, not dumped
source positions/indices or an automated remeshing of the supplied asset.

## 3. Authoring and integration owners

| Layer | Current code / contract |
|---|---|
| Closed hull/turret sections | [sectionSolid.ts](../../src/vehicles/profiles/sectionSolid.ts): strictly increasing Z stations, equal-count counter-clockwise XY rings, explicit correspondence, triangulated end caps. Caller authors all sections. |
| Slabs, tubes, fittings, running gear | [kit.ts](../../src/vehicles/profiles/kit.ts), `KIT`, `FITTINGS`, `orientedSlab`; use the typed [TankBuilderPort](../../src/vehicles/tankFactoryCore.ts), not unchecked options. |
| Real sight recess example | [leopardX.ts](../../src/vehicles/profiles/leopardX.ts), `opticPocket`: separate reveals, floor and rear bulkhead; no face secretly spanning the window. |
| Integrated shoulder/gear example | [t14X.ts](../../src/vehicles/profiles/t14X.ts): source-specific closed tub, shoulders and one canonical running-gear assembly. |
| Explicit family derivation example | [chieftainXFoundation.ts](../../src/vehicles/profiles/chieftainXFoundation.ts): shared first-party construction vocabulary with variant-specific measurements, not two overlaid whole tanks. |
| Structural vs cosmetic addition | `P.add` / `P.addExternalArmor` / `P.addCupola` versus `P.addEquipment`; cosmetics must not silently inflate armor hitboxes. `P.addMudguard` records bodywork ownership. |
| ERA state and exact face ownership | [sourceEraCover.ts](../../src/vehicles/profiles/sourceEraCover.ts), [eraHitFaces.ts](../../src/vehicles/profiles/eraHitFaces.ts); partition cover/backing, bind destructible clusters and match armor IDs. Test intact and spent states. |
| Wheels and belts | [wheelPatterns.ts](../../src/vehicles/wheelPatterns.ts), [trackPatterns.ts](../../src/vehicles/trackPatterns.ts), [suspensionPatterns.ts](../../src/vehicles/suspensionPatterns.ts); one suspension-owned moving assembly, no static duplicate course. |
| Boot-light spec registration | [fleetSpecRegistry.ts](../../src/vehicles/fleetSpecRegistry.ts), [specContracts.ts](../../src/vehicles/specContracts.ts), [specs.ts](../../src/vehicles/specs.ts). Existing batch examples: [sourceXFleetSpecs.ts](../../src/vehicles/sourceXFleetSpecs.ts), [sourceXSecondWaveSpecs.ts](../../src/vehicles/sourceXSecondWaveSpecs.ts). |
| Exact-ID demand loading | [fleetManifest.ts](../../src/vehicles/fleetManifest.ts) maps ID → owner; [fleetFactory.ts](../../src/vehicles/fleetFactory.ts) loads that owner; [profileBuilderAdapter.ts](../../src/vehicles/profileBuilderAdapter.ts) is shared conversion. Eager audits use [tankFactory.ts](../../src/vehicles/tankFactory.ts). |
| Gameplay geometry | [combatAnatomy.ts](../../src/vehicles/combatAnatomy.ts), authored plate/ERA definitions and [sourceXAuxArmor.ts](../../src/vehicles/sourceXAuxArmor.ts). Main-shell calibration does not repair inherited auxiliary skirts, cheeks, or phantom donor turrets. |
| Catalog and presentation | [taxonomy.ts](../../src/vehicles/taxonomy.ts), [tier.ts](../../src/vehicles/tier.ts), [fleetOrder.ts](../../src/vehicles/fleetOrder.ts), [tankAssets.ts](../../src/vehicles/tankAssets.ts), [authorship.ts](../../src/authorship.ts). Preserve existing IDs, user ordering, and old asset records. |

For new X work, combat rules may use an explicitly selected donor; geometry
must follow the approved independent-build or first-party-family contract.
Do not silently reuse a donor builder because its registry metadata is handy.
Check both eager and lazy creation at high/low detail, deterministic seeds,
parenting, yaw, gun pitch/recoil, disposal, and absence of source fetches.

## 4. Register the measurement oracle, not a runtime source

The fidelity page reads QA-only overrides from
[procedural-fidelity.html](../../tools/procedural-fidelity.html), including
the [second-wave table](../../tools/second-wave-x-reference-overrides.ts).
Use `qualityBar: 'exemplar'` for these new reference-backed builds. Where
appropriate, [source-world-registration.mjs](../../tools/source-world-registration.mjs)
pins canonical bytes and actual hull/turret/gun datums, preventing per-candidate
normalization. [source-dimension-frame.mjs](../../tools/source-dimension-frame.mjs)
owns source-frame dimension comparisons. Keep the recipe and canonical hash
coupled; a missing local oracle is unavailable evidence, not a pass.

Fused source meshes cannot honestly supply separately articulated component
masks. Declare that limitation; do not invent node ownership to improve a
score. Whole silhouettes, source proportions, running gear, actual native
articulation and independent visual review still apply.

Two current capability gaps matter:

- `source-world-registration-local.mjs` does not import the second-wave
  override table while iterating the expanded certificate registry. It is not
  a ready all-X audit. Use the registered fidelity/geometry path, or repair
  and test the diagnostic separately before claiming its coverage.
- `visual-evaluator-page.html` still has a separate legacy critic registration
  table, not the X source-world integration. A successful fidelity registration
  does **not** automatically enable faithful 14-view evaluator comparisons.
  Check source path, canonical hash, rig and camera equivalence for the exact
  ID. Missing coverage needs a tested tooling change, not a substituted donor.

## 5. Queue-safe execution

[capture-lock.mjs](../../tools/capture-lock.mjs) owns the ordinary shared FIFO
(`/tmp/cot-shots.lock`, `/tmp/cot-shots.queue`). Never create an alternate lock
to bypass contention, delete another owner's ticket, or nest lock ownership.
Use [capture-command.mjs](../../tools/capture-command.mjs) for otherwise-unlocked
heavy commands. It exports an API, not a command-line dispatcher. From repo root:

```sh
capture_tank_step() {
  node --input-type=module -e 'import {runCapturedCommand} from "./tools/capture-command.mjs"; const [command,...args]=process.argv.slice(1); await runCapturedCommand(command,args);' "$@"
}
```

| Invocation ownership | Examples |
|---|---|
| Wrap once with `capture_tank_step` | `source-x-oracle`, Blender studies, `vertex-workorder`, `geometry-gate`, `procedural-fidelity`, `genIcons`, anatomy generators/check command, asset/centering/module probes, heavy standalone tests, public/private builds |
| Invoke directly; owns its queue or child phases | `track-clip-audit`, `turret-parent-audit`, `winding-audit`, `visual-evaluator`, `tank-standard-check`, `tank-release-check` |
| Do not put the whole suite under a lock | `npm test`: pre/core/post children include their own captures. The runner itself is sequential, not a global queue owner. |

Recheck imports when a tool changes. A standalone selftest may now acquire the
queue internally; wrapping such a test deadlocks. Record PID, worktree, port,
command, start/end, exit status and output paths for every run. Stop only
servers/browsers you started, unless the user asks to keep a preview alive.

## 6. Repeatable measured round and final integration

Replace `example_x` with the explicit changed-ID list. These are real current
flags; each command requires its source/registry prerequisites above.

```sh
capture_tank_step node tools/vertex-workorder.mjs --id=example_x --top=14
capture_tank_step node tools/procedural-fidelity.mjs --ids=example_x --check --board --neutral-board
capture_tank_step node tools/geometry-gate.mjs --ids=example_x --check
node tools/track-clip-audit.mjs --ids=example_x --exact --strict
node tools/turret-parent-audit.mjs --ids=example_x
node tools/winding-audit.mjs --ids=example_x --check
```

The workorder converts camera-frame columns into absolute authoring coordinates;
do not author from unconverted gate JSON `at` values. Geometry writes
`docs/geometry-gate/<id>.json` and merges the ledger. Fidelity writes reports
under `.qa-dev/reports` and optional boards under `shots/procedural-fidelity`.
Track reports include both band and visible shoe sweeps. Read result contents:
not every diagnostic's zero exit code means every measured category passed.

Once exact-ID evaluator registration has been verified, use
`node tools/visual-evaluator.mjs --id=example_x` directly. It produces 14-view
angle, contour and roundness overlays under `shots/visual-eval-example_x`;
it is not an independent human-style 9/10 verdict. Have a separate reviewer
inspect the exact candidate's full view set and actual Gallery. Historical
`tmp-tank-critic.mjs` is absent from this baseline; do not prescribe it as a
working command or count bespoke diagnostic crops as official certification.

After geometry stops changing, run the required coupled generation sequence:

Check the selected presentation center during preflight as well as in release.
If added/removed opaque stock changes its centroid, regenerate only the affected
native anchors and their paired projections with
`capture_tank_step node tools/presentation-centering.mjs --update --ids=example_x`,
then regenerate the selected assets below. This mode preserves every unselected
source byte and rejects missing/nonfinite measurements, ambiguous rows and
concurrent source edits. It is **not** a check pass: run the unchanged rendered
and exported centering checks after regeneration. `--sync-assets` instead keeps
existing anchors and requires already-current hash-verified images; it cannot
repair an off-center anchor. Unscoped `--update` still regenerates the whole fleet.

```sh
capture_tank_step npm run tank:anatomy:update
capture_tank_step npm run tank:anatomy:check
capture_tank_step npm run tank:assets -- --ids=example_x
npm run tank:release:check -- --ids=example_x --gate
capture_tank_step npm run typecheck
capture_tank_step npm run build
capture_tank_step npm run attribution:check
```

Anatomy update deliberately refreshes **all** playable armor/module/crew cards
and generated marking-seat receipts. Targeted assets then regenerate the nine
views plus the angle thumbnail for changed IDs only. Preserve unrelated hero,
top, side, silhouette and marking files. Selective generation requires an
existing complete `public/icons/tank-assets.json`; `--allow-partial` is for
scratch output, not a loophole for an incomplete production manifest.

[tank-release-plan.mjs](../../tools/tank-release-plan.mjs) is the current
executable release composition: anatomy freshness, presentation centering,
module alignment/hits, assets, duplicate tracks, muzzle bore, barrel circularity,
strict source fidelity, fresh geometry/standard checks, full `npm test`, and
private build. It stops at the first failure. Public build and attribution
above are additional checks; never describe later skipped stages as passed.

Generated ownership is explicit: anatomy/marking-seat `*.generated.ts` groups,
their registries/loaders, geometry JSON/ledger and asset manifest/images belong
to their generators. Never hand-edit generated payloads to turn a gate green.
Write focused tests into [selftest-suites.mjs](../../tools/selftest-suites.mjs),
including old-model preservation, true negative-space rays, ERA spent-state
backing, attachment seats, gear motion, and exact collision ownership.

Keep temporary reports, source payloads, local previews and failed experiments
outside the publish set. Commit only an explicit reviewed path list after an
actual publish request; rebase in an isolated clean integration worktree and
repeat affected checks. Record failure, unavailable and not-run separately.
An authorized as-is publication does not change any failed quality verdict.

## 7. Do not assume pending Abrams tooling is available

The later seven-model SEP V2-derived Abrams X family was separate WIP when this
map was written. Its source-reference scripts, recipes, run IDs and tests are
not part of this baseline. Existing `abramsx` is a different production vehicle.
Discover a tool in the target branch before invoking it; neither an old task's
local worktree path nor a remembered successful prefix constitutes a reusable
release certificate for a new tank.
