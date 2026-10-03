# Selective PR #9 follow-up — 2026-10-02

PR reviewed at `d189c4c22770c0808d37144f062f4a22341be827`. This batch preserves
current fleet designs, paint and balance instead of importing the PR wholesale.

## Incorporated improvements

| PR commit | Change | Current evidence |
| --- | --- | --- |
| `4a9afb27f` | Regenerate Worker declarations locally instead of tracking roughly 31k lines | Both Worker clean-install/typecheck/test chains PASS |
| `a342b260b` | Boot-light solo roster planning; avoid eager solo authority import | Typecheck PASS; closure regression pending in combined suite |
| `ade047a96` | Finite decal bounds and frustum culling, temporarily restored for covered warm draw | Typecheck and focused warm regression PASS |
| `76c7298a2` | Warm-up removes only its own temporary scars in finally | Typecheck and focused warm regression PASS |
| `ef7719d30` | Small generated auxiliary-gun capability summary for Garage | Regenerated from current 219 vehicles; full and roof inventories retained |
| `12f6209b0` | Remove unreachable workshop/horizon code and unused wire/room/server exports | Local import audit, typecheck, wire, interest-tier, room-policy, jetty and collision-key checks PASS; profile deletions already incorporated in earlier batch |
| `4eed2890c` | AMX 56 field kit gets finite spaced armor matching visible panels | Source-only patch adapted; both finite armor/trace regressions PASS; current manifest retained for regeneration |
| `d08285a33` | Lane-volume test uses full-body Type 10 X for zero-leak fixture, retains AMX 56 lane geometry fixture | Test PASS; raw AMX 56 exterior-kit air finding remains recorded, not relabeled as zero |

The validated fleet-pass helper, digest and ledger refactors were also copied
from the comparison overlay: HIGH, LOW, DEFAULT and ledger receipts all PASS
against unchanged `1aff79733` geometry. Their validation report is
`.qa-dev/pr9-integration/helper-validation.json` in the integration worktree.

## Corrected test defects

- The source-armor test now genuinely starts before metadata finalization.
- ZTZ-100 fill-air tests use the production fill decoder rather than a copied
  base64 decoder; physical blocked-bore and synthetic negative tests remain.
- The decal resolver assertion scopes the complete FX initializer rather than
  searching only its first 320 characters. Production ownership test PASS.
- Ariete C2 retains its existing `sig_ariete_c2` stock scheme; only C1 is expected
  to use `service_ariete_c1`. C2's identity was independently read on baseline
  `1e6b4b738`, rather than inferred from the candidate's test failure.

## Inherited failures and limits

The frozen `1aff79733` run finished all 1,243 checks with 30 failures. Its final report is
`.qa-dev/pr9-integration/rebased-full-suite.json` in the integration worktree; the failure list is copied to
`.qa-dev/pr9-followup/frozen-suite-failures-final.json`. Twenty-five of those failures have subsequently
passed focused candidate reruns; five remain unresolved.
Eight fast failures also reproduce
on clean baseline `1e6b4b738`: fleet balance; sourced-palette map coverage;
foundry map coverage; moon track-palette aliases; sky-environment hash;
collision-manifest map coverage; bot-water endpoint; and the now-fixed decal
resolver text assertion. See `.qa-dev/pr9-followup/inherited-fast-checks.json`
and its individual logs. No balance exemptions, weaker budgets, or fabricated
passes have been imported. The full run additionally reports world-event and
battle-pacing failures; those need isolated characterization.

The earlier three-ID release probe passed E100 X and T90MS X geometry but failed
T62MV1 X's hybrid reference comparison. Its fidelity step also failed. Retain
those raw outcomes separately from native closure passes and this new batch.
These changes have not yet been pushed or deployed.

## Additional PR test cleanup under validation

Adapted `8d57d76ef`, `9b26dfe60`, `80db3827b` and the explicit Moon/cliff-route
additions from `adc865de4` in 17 world-test files (about 1,300 lines removed).
This retires historical map/config projections and a Foundry parent fixture;
it does not delete runtime maps or accept arbitrary current hashes. Remaining
checks use current registry coverage, native Canvas pigment measurements,
feature-on/off terrain comparisons, protected roads/water/deployment areas,
finite skyline caps, resource lifetime, determinism and negative controls.
The conflicting broadleaf patch was excluded; current map geometry and
material sources remain unchanged. All sixteen affected world tests passed in the isolated candidate checkout.
The complete 17-test report, including the sky-cache check, is
`.qa-dev/pr9-followup/map-receipts.json`; every entry has exit code 0.
These focused passes do not retroactively change the frozen combined full-suite result; a new combined run remains required.

From `125729301`, the sky-cache test now checks the shipped lunar Earth
uniform wiring and still executes the actual cache/bake state owner, replacing
its obsolete pre-Earth source hash. The PR's collision-shard uniform size ceiling
was not imported: replacing every map's individual ceiling with 8.5 MB would
materially relax several existing storage limits and needs a separate budget
review. Sky-cache validation also passed in that focused batch.

The `f6f50caa9` road-admission, bridge compound-record and orbital-settlement
fixture corrections were adapted after checking their current runtime contracts.
All three passed on the candidate in `.qa-dev/pr9-followup/pl01-turret-r1.json`.
Physical deck/parapet/abutment bounds and the 64-part wire split stay enforced;
structure coverage now requires four distinct families.
