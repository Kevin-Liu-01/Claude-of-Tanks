# Fleet follow-up — 2026-10-02

Status: complete implemented batch prepared for the owner's requested main
push, with refreshed generated records and inspected captures. The failed and
incomplete checks below remain open; this is not a fully qualified release.
Branch `codex/pr9-general-and-fleet-followup`, isolated worktree
`/Users/kevinliu/.codex/worktrees/pr9-general-improvements/claude-of-tanks`.
Rebased cleanly onto `origin/main` at `ea639952b`, then `d2a160d1c`, on
2026-10-03. The latter includes the national crew-voice update. The earlier
PR #9 integration remains frozen at `1aff79733001601086689097b0092dc45cfa63a7`;
its complete 1,243-check run finished with 30 failures. Twenty-five subsequently
passed focused reruns, while five remain unresolved (listed in the companion
`pr9-general-followup-20261002.md`). Post-rebase typecheck passes.

## Owner's exact scope

Stable IDs and saved selections are preserved. These are owner-directed edits
to first-party designs; historical source comparisons retain their actual
outcome and cannot be relabeled as passes after intentional design deviations.

| Change | IDs / target |
| --- | --- |
| Russia order | `ru_t80u_modern`, `ru_t72b3m_modern`, `ru_t72b3_modern`, `t14` ahead of `t90ms` |
| 10% smaller | `object695_x`, `bmp3m_dragun125_x`, `kurganets25_x` |
| Object 695 factory camouflage | Replace its small digital pattern with a deliberate large-scale field pattern |
| 5% larger | `t90a_vladimir`, `t90m`, `t90sm`, `bmpt_t90`, `t90`, `t90a_burlak`, `t90m_proryv`, `t90ms` |
| Additional 10% hull length | `t90m`, `t90m_proryv`; retain round wheels and unstretched gun/turret |
| Burlak label | `t90a_burlak`: T-90A Burlak Prototype |
| Chinese names | `ztz99a2_prototype`: ZTZ-99A; `type99a`: ZTZ-99 Longwei (owner confirmed original concept) |
| Chinese mantlets | `vt4a1`, `ztz99a2`, `ztz99a2_prototype`: fitted articulated gun assembly filling the existing recess naturally |
| Poland order | `pl01_105`, then `pl01`, ahead of the national variants |
| PL-01 105 armor kit | Substantial fitted side armor, cages and equipment inspired by Warrior MILAN; preserve lower wheel visibility |
| National turret seating | Lower all 14 variants below to remove excessive exposed ring; preserve clearance during yaw and pitch |
| T-84 Oplot | `t84`: T-72B3M obr. 2016 (`t72b3m_x`) hull, new angular/squarish turret |
| Upiór | `upior`: raise and redesign turret as a modern IFV turret; improve tracks and add substantial fitted side armor/cages/equipment |

China's complete left-to-right order, including the owner's deliberate
cross-tier placements:
`vt4a1`, `ztz99a2`, `ztz99a2_prototype`, `cn_t72b3_modern`,
`cn_t72b3m_modern`, `cn_t80u_modern`, `type96b_x`, `type96_80_feng`,
`type96_72m_lei`, `aft10_x`, `ztz100_x`, `type100`, `ztz100_prototype`,
`type96_72_long`, `type99a`, `ztz85_iii`, `type59`.

National seating scope: `ua_t80u_modern`, `ua_t72b3m_modern`,
`ua_t72b3_modern`, `pl_t80u_modern`, `pl_t72b3m_modern`,
`pl_t72b3_modern`, `cn_t80u_modern`, `cn_t72b3m_modern`,
`cn_t72b3_modern`, `ru_t80u_modern`, `ru_t72b3m_modern`,
`ru_t72b3_modern`, `ua_t72b3m_hetman_ii`, `pl_t72b3_zubr_ii`.
Upiór is explicitly raised, not included in that lowering request.

## Construction and verification contract

Record before/after dimensions, pivots, shell bounds, contact hull and muzzles.
Resizing must update physical metadata and animation frames exactly once.
Additional hull length must reposition suspension stations without oval wheels.
Retain all current fenders, national identities, roof weapons, real cage gaps,
and articulated mounts. Add solid armor to combat surfaces; cosmetic equipment
uses equipment buckets and semantic material roles. No broad hidden filler.

Before publication: HIGH/LOW physical checks; yaw/pitch/recoil and moving gear;
live/spent/reset ERA; full anatomy update/check; scoped assets and ledger;
actual Garage/gallery views and switching; typecheck, tests, both builds and
scoped release gate. Actual outcomes and remaining work are recorded below;
the generation commands alone are not release qualification.

## Parallel task scope (one writer, serial implementation)

Review the broader PR #9 against current main, retaining only justified
improvements. Generated Worker declarations account for about 31k deleted lines;
that is repository churn, not runtime performance evidence. Preserve current
fleet/paint/gameplay; do not merge the entire PR or import its balance exemption.
Record each selected commit, adapted files and actual validation separately.

## First-pass evidence (2026-10-02)

- `npm run typecheck`: PASS, including the unused-symbol audit.
- `garageOrder.selftest.mjs`: PASS for the exact cross-tier China order,
  Russia/Poland prefixes and normalized aliases.
- Native playable provenance audit: PASS, 219 first-party procedural playables.
- Baseline: clean `1e6b4b738179721483f647ef04fe6ee3b249849f`, measured HIGH/LOW
  before edits. All eleven new resize targets have the expected shell bounds;
  the T-90AM/Proryv hull longitudinal bounds include their additional 1.10 factor.
- 31 HIGH/LOW builds measured. Eight vehicles captured in front, angle, side and
  top at 512 px; initial front/angle checks viewed for Upior, Oplot, PL-01 105,
  both national exemplars, VT4A1 and the ZTZ-99A prototype. These are preliminary
  portraits, not the final 1280 px qualification or a deployed Garage proof.
- Polish cassette geometry and finite spaced armor share one pure layout;
  open cage screens deliberately retain no blanket armor face. Upior's side
  Spike housing has a genuinely recessed mouth aligned to its launch registry.
- Oplot preserves the T-72B3M 2016 hull, uses a new separated-cheek turret and
  independently registered reactive cassette sectors. Anatomy must regenerate
  the actual cassette hit triangles before release.

Local evidence: `.qa-dev/pr9-followup/{before,after}.json`, `previews/`,
`typecheck-final-source.log`, `native-audit.log`, `focused-tests.json`.
The before/after geometry report predates the final Oplot ERA sector names;
that registration and generated anatomy are verified in the later checks.

## Additional owner edits: Oplot cover and PL-01 105 nose

- Oplot now has foliage enabled on its rebuilt hull and turret: separate
  fender patches, skirt drapes, welded-roof panels, covered strapped stores,
  flank foliage and a rear cage net. The old T-84 blanket dimensions were
  replaced with the new donor/turret datums. The cupola, gunner sight, roof MG,
  gun channel, engine grille and driver remain open. Net and two leaf colors
  merge into three meshes per owning rig.
- PL-01 105's cassette crown and continuous mounting return now meet the
  actual upper-glacis plane (1.975 m at z=1.30, 1.46 m at z=3.425).
  Closed cassette end caps and finite combat triangles use the same stations.
  Forward cage rows terminate on a raked nose, with the bottom 0.65 m aft of
  the upper carrier. Upior retains its own level side kit.
- Typecheck and diff whitespace check PASS. The focused escort, ghillie,
  Oplot donor and Object 695 checks all PASS. The escort test checks every
  finite plate against HIGH/LOW rendered stock and confirms the removed upper
  corners are also absent from damage traces. Oplot cloth seating, open roof
  weapon/sight lanes and turret-following checks PASS. 1280 px angle/side
  captures completed; the side view confirms the descending PL-01 armor crown
  and raked cage nose. Front/top review also completed; full regeneration is
  repeated after the following turret package.
  Evidence: `.qa-dev/pr9-followup/latest.json`, `latest-angle/`, `latest-side/`.

## Regeneration and raw closure status

The full anatomy update completed all 219 IDs and 657 technical views. Its
subsequent check passed combat anatomy, mudguard/fender seating and marking
checks, then stopped on Oplot's stale portrait-fit metadata. Scoped portrait
regeneration is required before repeating the complete anatomy check. The
latest two geometry edits also require refreshed anatomy and assets.

An independent 32-ID water scan found 30 failures; the unchanged baseline
was scanned with identical checker files. Six candidate IDs changed from a
baseline pass to a failure: T-90SM, BMPT T-90, T-90 obr. 1992, T-90MS, PL-01 105
and Oplot. Uniform resizes preserve stock but may change voxel sampling;
that is a hypothesis to test, not a pass exemption. Other failures mix
existing kit air with changed geometry and remain unclassified. Raw reports
are `.qa-dev/pr9-followup/{water-check,water-comparison}.json`; do not replace
these with a blanket zero-leak claim or broad invisible filler.

The default-resolution closure recheck remains red: Oplot 104.42 L and
PL-01 105 8.30 L. The PL-01 measurement predates its final turret equipment
package; that revision has not yet had another 25 mm water scan. The
uniform-resize diagnostic at 0.02625 m is zero for
T-90SM and BMPT T-90, but T-90 obr. 1992 still measures 0.07 L and T-90MS
4.03 L. This supports sampling sensitivity for part of the findings; it
does not overturn any default-resolution failure. Raw diagnostic files are
`latest-water.json` and `uniform-voxel-diagnostic.json` in the same evidence folder.

## Final PL-01 105 turret package

The owner additionally requested substantial turret equipment, lights and gun
assemblies. The 105 now carries guarded white/IR cheek lamps on supported
crossmembers, two faceted mission pods with eight additional smoke tubes,
braced bustle baskets with strapped stores and rear cameras, a low screened
electronics enclosure and two compact warning heads. Its existing M2 CROWS
now uses the shared articulated remote-gun mechanism, an armored shield and a
connected ammunition feed. The base PL-01 is unchanged.

The new tests check actual bracket-to-shell contact, unobstructed white-light
apertures, smoke ownership during traverse, and main-gun/CROWS firing clearance
at multiple poses in HIGH and LOW. The earlier CROWS test retains its hull
floor, roof and length constraints; its width now includes the already requested
side cage. The first run reached the final base-vehicle control before failing
because the Node test omitted `geometryReceipt`; that harness defect is fixed
and the final rerun is recorded separately.

Actual 1280-by-900 angle, roof and side captures were inspected:
`.qa-dev/pr9-followup/pl01-turret-{angle,top,side}/views/pl01_105-battle11.png`.
The equipment, supported baskets, clear hatches and tapered side assemblies
are visible. These are procedural game renders, not generated illustrations.

## Publication scope and unresolved checks

On 2026-10-03 the owner explicitly requested: “commit and push origin main
everything, these pl01 and oplot, then all this”, followed by the complete
Russia/China/Poland/14-national/Oplot/Upior batch listed above. Publication is
limited to this implemented batch and the reviewed PR #9 follow-up. This
request is recorded alongside the disclosed red closure/reference results and
incomplete combined rerun; it does not turn those results into passes or waive
future unrelated work. No unrelated shared-checkout changes are included.

Remaining full-suite failures are fleet balance, collision-manifest map budgets,
bot navigation at a water/drop boundary, multiplayer world-event evidence and
battle pacing. The first three reproduce on the clean baseline; the latter two
still need isolated baseline characterization. Existing source-comparison and
default-resolution closure failures also remain, including the PL-01/Oplot
measurements above. Final generated-record and release-command outcomes are
appended below when they finish.

## Regenerated records audit

The final regeneration completed all 219 combat-anatomy and marking records,
657 technical images, and scoped presentation assets for 33 IDs. An independent
diff audit found no vehicle metadata changes outside those 33 IDs. All 835
changed image files, including thumbnails, match their registered byte counts
and SHA-256 hashes. The geometry ledger measured 32 IDs in HIGH and LOW; 31
ledger rows changed (the AMX 56 panel hitbox correction leaves its visual
geometry unchanged). All runtime inventory, anatomy and marking-row changes
also stay within the requested scope.

The two final PL-01 tests, generated auxiliary-gun consistency check and all 15
owner-concept checks passed. PL-01 105's final control summary has 32 smoke
apertures, driving lights and one articulated roof gun. These passes do not
resolve the separately recorded water/reference or wider-suite failures.

The same serial run completed all 33 final 1280 px portraits, typecheck,
private and public production builds, and attribution audit successfully.
The anatomy check rejected an unsynchronized Oplot presentation projection
after its generated anatomy and marking checks passed. The saved images are
fresh; the remaining correction is to synchronize the runtime projection with
the hash-verified native capture and repeat the anatomy check. The failed
attempt is retained in `.qa-dev/pr9-followup/presentation-v3.json`.

### Final projection correction and landing checks

The missing runtime projection records were regenerated from the successful
v3 native image captures, after validating every selected asset's hash and
size. This changed 27 projection envelopes and preserved every rendered body
anchor and every unselected source row. The direct consistency assertion from
the failed audit now passes for all 219 runtime/manifest records. This repairs
the mismatch; importing a captured envelope is not a new native centering pass.

After the final rebase, typecheck/unused-symbol checks, exact Garage ordering
and all 13 crew-voice pack policy checks pass. The two production builds and
attribution audit passed in v3 before that final crew-voice rebase.

The owner requested the complete push now. The v4 read-only follow-up remains
queued: native centering, the 15 concept checks, the complete anatomy check,
post-rebase builds, then `npm run tank:release:check -- --ids=<33 scoped IDs>
--gate`. The release command acquires its own queue after the preceding lease
ends. No complete release pass, new combined full-suite pass, or deployment is
claimed. Local continuation: `.qa-dev/pr9-followup/projection-repair-owner.log`,
`projection-repair.json` and `release-v4.json`.
