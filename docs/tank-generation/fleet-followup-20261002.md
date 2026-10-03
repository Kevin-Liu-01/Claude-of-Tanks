# Fleet follow-up — 2026-10-02

Status: source implementation and first visual pass complete; regeneration and
physical/release checks in progress. NOT PUBLISHED.
Branch `codex/pr9-general-and-fleet-followup`, isolated worktree
`/Users/kevinliu/.codex/worktrees/pr9-general-improvements/claude-of-tanks`.
Base `1aff79733001601086689097b0092dc45cfa63a7`; the previous PR #9 integration
remains frozen in its own worktree while its full suite completes.

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
scoped release gate. All are pending for this new batch. Prior main/deploy
authorization persists; inherited failures require fresh baseline evidence.

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
