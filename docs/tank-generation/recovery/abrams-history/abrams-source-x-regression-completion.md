# Abrams X — retained regression completion

Date: 2026-09-07. Scope: the three retained failures from the interrupted
Abrams continuation, not overall tank qualification or publication approval.

This receipt is a **pre-integration worktree snapshot** based on
`519de9de560b8838cdea2ef6e53b9bb9ccb79ef0`. The newer upstream 23-tank batch is
not present in this census. Recompute the counts and regenerate the report
after integrating it; do not apply these numbers to a different registry.
The separate [Abrams implementation receipt](abrams-source-x-variants.md)
continues to own geometry, source comparison and remaining release work.

## Retained failures and resolution

The original ignored diagnostic packet is
`.qa-dev/reports/abrams-remaining-regressions-FPyDmk/`. It is local evidence,
not a committed runtime asset. Its interrupted continuation is not a
successful full `npm test` run.

| Retained log | Original failure | Focused outcome |
| --- | --- | --- |
| `191-garageArchitecture.selftest.mjs.log` | Headless environment construction took 308.5 ms against the 100 ms maximum | Unchanged test passed in a fresh queue-isolated process; subsequent timing-visible run passed at 48.741 ms construction and 103.533 ms cold transaction |
| `204-productStats.selftest.mjs.log` | Published 141/178/180/151 counts disagreed with registry 148/185/187/158 | Reproduced, corrected the static public facts to the measured registry, then passed |
| `436-rosterPolicy.selftest.mjs.log` | 187 saved IDs versus the stale 180 fact | Reproduced, corrected the shared fact and added exact identity/preservation coverage, then passed |

The garage's original limits remain **construction <100 ms** and **cold
transaction <750 ms**. The only garage test change prints the measured maxima
on success. No clock substitution, warmed-up exclusion, retry-until-pass
logic, removed environment or increased budget was introduced. The retained
308.5 ms event was not reproduced in isolation; these runs do not establish
its original cause or guarantee that all future contended runs will pass.

## Exact additive census

| Projection | Baseline | Abrams snapshot | Change |
| --- | ---: | ---: | ---: |
| Production-visible | 141 | 148 | +7 |
| Keyed local-development | 178 | 185 | +7 |
| Saved records | 180 | 187 | +7 |
| Battle/release IDs | 151 | 158 | +7 |
| Development-only | 37 | 37 | 0 |
| Reference-only placeholders | 2 | 2 | 0 |
| Battlefields | 20 | 20 | 0 |

The added identities and retained gameplay donors are explicit, independently
enumerated test expectations:

| Added identity | Retained donor |
| --- | --- |
| `m1a1_x` | `m1a1` |
| `m1a1ha_x` | `m1a1ha` |
| `m1a2_x` | `m1a2` |
| `m1a2_tusk_x` | `m1a2_tusk` |
| `m1a2_sepv2_x` | `m1a2_sepv2` |
| `m1a2_sepv3_x` | `m1a2_sepv3` |
| `ua_m1a1_x` | `ua_m1a1` |

The generated report appends these as rows 181–187. A read-only comparison
against `git show HEAD:docs/VEHICLE-ROSTER.md` verified that **all 180 previous
row strings remain identical and in the same order**. Additive roster
preservation does not imply visual preservation of donor meshes, which is
outside these three regression tests.

## Changes and stronger assertions

- [Product facts](../../src/productStats.ts): changed only the four outdated
  counts. This boot-light module still imports no fleet builders.
- [Product-fact test](../../src/productStats.selftest.mjs): retained existing
  checks; added per-file semantic count assertions, exact ordered saved-ID
  equality for the generated report, consecutive row ordinals, and canonical
  PROD/DEV/REF classification for every row. An unrelated numeral elsewhere
  in a document no longer suffices as evidence for its fleet fact.
- [Roster-policy test](../../src/vehicles/rosterPolicy.selftest.mjs): retained
  existing checks; added no-duplicate guarantees for every catalog, exact
  production/development identity sets, all seven explicit donor mappings,
  and presence of each original and X peer in saved, production, development
  and release catalogs. This is not a count-only expectation bump.
- [Garage test](../../src/ui/garageArchitecture.selftest.mjs): added measured
  success output without changing either timing assertion.
- Synchronized the approved public surfaces: [README](../../README.md),
  [features](../FEATURES.md), [generated roster](../VEHICLE-ROSTER.md),
  [short LLM facts](../../public/llms.txt),
  [full LLM facts](../../public/llms-full.txt),
  [docs LLM facts](../../public/docs/llms.txt) and
  [manifest](../../public/site.webmanifest).

The roster was regenerated with its existing `--write` command, then checked
with `--check`. Public prose describes registry totals independently of gate
status; those totals are not represented as proof of a passing provenance
audit.

## Reproduction commands and observed results

Focused commands ran one at a time through the existing FIFO capture queue:

```sh
node --input-type=module -e 'import {runCapturedCommand} from "./tools/capture-command.mjs"; await runCapturedCommand(process.execPath,["src/ui/garageArchitecture.selftest.mjs"]);'
```

The same wrapper was used for each entry below, passing the listed arguments
to `process.execPath`. Do not outer-wrap `npm test`; its suite owns its queues.

| Child command | Result in this lane |
| --- | --- |
| `node tools/vehicle-roster-report.mjs --write` | PASS, wrote 187 records |
| `node tools/vehicle-roster-report.mjs --check` | PASS, 187 records current; repeated after final public prose edits |
| `node src/productStats.selftest.mjs` | PASS, 148 production / 185 development / 187 saved / 20 battlefields; repeated after final public prose edits |
| `node src/vehicles/rosterPolicy.selftest.mjs` | PASS, 148 production / 187 saved; repeated after final public prose edits |
| `node src/ui/garageArchitecture.selftest.mjs` | PASS unchanged before edits; PASS with timing output at 48.741 ms construction and 103.533 ms cold transaction |
| `git diff --check` on owned paths | PASS |
| `node tools/native-playables-audit.mjs` | Initial FAIL below; PASS after the separately authorized entry-point rename: 158 first-party procedural battle playables, zero runtime GLB or comparison sources |
| `node src/vehicles/abramsSourceXSpecs.selftest.mjs` | PASS after rename: seven exact identities, donor isolation, crew metadata and matching boot-light/eager entry-point bindings |
| `node src/vehicles/fleetLazy.selftest.mjs` | PASS after rename: legacy metadata freshness, 184 demand-owned profiles and a complete 148-production-vehicle demand-loaded construction/disposal sweep |

## Separately authorized provenance naming repair

The additional native-playable audit found 14 Source-labelled builder-map
failures: `profiledProcedurals.ts` and 13 Abrams component/spec selftests.
The production mapping points to `buildAbramsSourceX`; component tests restore
that same builder, and the specs test contains its spelling in an expected
mapping regex. The audit intentionally rejects Source/OwnerSource-labelled
entry points even when `MODEL_SOURCE` says procedural, to prevent an earlier
class of concealed source-rebuild loading paths.

This result was a naming-contract failure, not evidence by itself that a mesh
payload was copied. With explicit additional scope approval, the authored
entry point was renamed to `buildAbramsX` throughout all 16 exact-reference
files (declaration, eager and lazy bindings, and 13 tests), matching existing
native X builders such as `buildLeopard2A7VX` and upstream
`buildChieftainMk10X`. No alias conceals an old entry point. Source-study
filenames, helper names, model IDs, geometry and documentary provenance
remain unchanged; the audit itself was not edited or weakened.

The patch changed 42 lines. A SHA-256 comparison of every file before and
after, reversing only the exact identifier substitution in memory, proved
that **all other bytes of the 16 files were preserved**. A subsequent search
found no old entry-point references in `src/` or `tools/`, and the unchanged
native audit passed. The Abrams specs and existing complete lazy-facade
regressions also passed after the rename. This narrow rename does not certify
complete source fidelity; it satisfies the existing entry-point naming
contract without changing construction.

## Handoff boundary

These three retained regressions are resolved by the focused evidence above.
This lane did **not** run the complete suite, either build, source geometry
gates, anatomy refresh/check, finalized ERA checks or tank release gate.
There is no new visual score, publication waiver, staging, commit or push in
this receipt. A final integrated release still needs its own fresh results.

At this snapshot, SHA-256 of the three test files is:

```text
84c44331f3359bad40de00b74a3d0f152acb8a1de07f3b66f95bc5304cdaf973  src/productStats.selftest.mjs
95c41d7efae20c4f40b9215842e16d07ba88c1ebc3b5b8951f76cf61ddb60f8e  src/ui/garageArchitecture.selftest.mjs
d1fb8334991c70930e12c855a62121ab17105b71b6e7f28862d1d5b0f7199cda  src/vehicles/rosterPolicy.selftest.mjs
```

