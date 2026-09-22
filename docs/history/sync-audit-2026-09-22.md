# Shared-main sync audit — 2026-09-22 UTC

Window: 2026-09-14 00:00 PDT through the snapshot at 2026-09-21 23:30 PDT.
Audited main: `0940aa499076844efdd6366a36d2bf2c85b894d0`.
Remote main was checked again during the audit. This is a bounded history and
source-integration audit, not certification of every rendered feature.

## Findings

No lost feature was confirmed in the reviewed integrations. No corrective
runtime rollback or bulk branch merge was needed. The repository and live
site had previously differed: the Viper cable fix was pushed before deployment.
Deployment 54 now serves `v1.0.0+g0460f8d33`; `0940aa499` adds its garage regression
and evidence documentation. See [DEPLOYS.md](../DEPLOYS.md).

The owner assigned continuing shadow work to Claude during this audit. The
published shadow files were traced through history, but no shadow code was
changed or visual shadow acceptance claimed here. Active Claude work must be
finished and published by its owner; its local presence is not a lost commit.

## Inventory and method

- 350 distinct commits were found using `git log --all --reflog` in the window.
  169 are ancestors of audited main. Of the other 181, 117 are retained only by
  reflogs and 64 remain reachable from refs. These include rebases, stash
  snapshots and intermediate drafts, not 181 independent missing features.
- 101 local `origin/main` reflog positions were checked for ancestry between
  successive observations. No observed non-fast-forward update was found.
  Local reflogs cannot prove what happened between fetches or on other machines.
- All 1,159 local refs and 417 worktree registrations were inventoried read-only.
  48 checkouts had tracked modifications; most predate the window. Old worktree
  registrations are not evidence of 417 active tasks. No worktree was reset,
  deleted, staged or cleaned by this audit.
- A fresh `git ls-remote --heads origin` returned only `refs/heads/main`; there
  was no additional current GitHub branch waiting to be folded in.
- Stable patch IDs, whole-tree IDs, changed-source comparisons and the seven
  main merge resolutions were inspected. A history match establishes where
  work landed; later source changes still need behavioral review.

The raw local inventory, equivalence tables and merge diffs are retained in
the audit worktree's ignored `.qa-dev/sync-audit-20260922/`. They include machine
paths and draft metadata and are not production assets.

## Equivalent published snapshots

These pairs have identical **whole Git trees**, not just matching titles:

| Retained branch snapshot | Published main commit | Work |
| --- | --- | --- |
| `a826a05ff` | `cd7164da8` | Round 32: turretless aim, camos, night horizons, rockfield, TOS end wraps, respawn bookkeeping |
| `fd9e175f7` | `f41c93e6c` | Rocket jump, self-right, desktop controls, structure support |
| `a2200676e` | `4655e21cc` | Authored Factory paints and national colors |
| `6d1a1a434` | `e3ad8b6a1` | Hull wakes and near-vehicle shadow policy |
| `1b827f075` | `952a205e7` | Pinch guard and build stamp |
| `7eb22d3b3` | `d464a813f` | Trackpad zoom and Garage sidebars |
| `a5995a1f1` | `d0b637bce` | Hitboxes, fly-over and wreck momentum |
| `0cfecba4d` | `bc588917a` | Vista layers and ring forest |
| `98111a8c7` | `54ae214f7` | Namer wheel relief |
| `01f29e1a8` | `ef250522b` | Trophy hull closure |

Additional source comparisons:

| Retained snapshot → main | Evidence |
| --- | --- |
| `949cab6c6` → `d0cbb9fcd` | Entire source/tools tree identical; only three geometry gate JSON records differ, reflecting later measured receipts. Hydraulic aim and track-lane work retained. |
| `e39316f68` → `990966c05` | All 119 changed source paths identical. Brand marks and integrated HUD work retained. |
| `828f935d4` → `e3fc71582` | All 13 changed source paths identical. Horizon texture work retained. |
| `30e3ba926` → `6432c05ef` | All four changed source paths identical. Sky/horizon work retained. |
| `3162126e9` → `8388bda3f` | All 42 changed source paths identical. Rulesets and campaign retained. |
| `16052e65e` → `0ce614a2c` | All three changed source paths identical; documentation migration retained. |
| `cdb045b29` → `c4a8d7b4a` | Changed source identical except the main version additionally registers the HUD consumable regression. Korean tiers and XK2 turret retained. |
| `bf632f794` → `acc04bb30` | Mars changes retained; the only changed-source difference adds the incoming desktop headlight budget. |
| `4e5d48ba2` → `ce677147e` | Sides-switch work retained alongside incoming headlight and test-registration additions. |

Older reflog revisions of these batches are intermediate edits. Restoring
them wholesale would replace later work with an earlier version.

## Fleet overlaps and intentional replacements

The Israeli/Ares source comparisons were reviewed beyond commit names:

| Draft → published | Integration finding |
| --- | --- |
| `cb2a3e5f5` → `5d36e7cf9` | Trophy glacis changed source is identical. |
| `1a1f16516` → `e59fb19b6` | Barak fitting/running-gear additions retained while Trophy gained measured lamps, keel and folded rear guards. |
| `13f0cae5b` → `25d4fdbc0` | Trophy portal additions retained alongside Barak bow/end-stock work. |
| `03a0ea6e2` → `a468bbbf8` | Namer source additions retained alongside Trophy portal and smoke-bank work. |
| `0697974d6` → `25f8fda8e` | Barak rear stock retained; shared family dispatch combines Trophy and Barak exceptions instead of overwriting either. |
| `d608bfe11` → `570c0f55e` | Modern Israeli additions retained alongside supplied-fleet registrations, layouts and corrected totals. |
| `c4be38930` → `98c53a671` | Ares source geometry retained; roster/channel totals and registrations include intervening fleet additions. |

The two September 18 supplied-fleet stashes are checkpoints preceding the
integrated fleet in `547457932` and `d307cecd2`, followed by qualification and
detail fixes. They were preserved, not reapplied over the qualified fleet.
Every added factory line in stash `16f149f55` remains in the current factory.
Of 24 nongenerated source modules saved with the earlier stash, 23 remain at
the same path; the combined `kurganetsOdztzX.ts` draft is superseded by the
separate `kurganetsX.ts` and `ztz100X.ts` builders. Temporary regional probes
were not treated as missing runtime work.

Current behavior intentionally differs from several earlier drafts:

- Barak's source-open entrance was closed by the owner's later instruction in
  `a6fa51e18`; restoring the old open version would undo that decision.
- Trophy's trial wide belly box, including an unpublished narrower-box edit,
  was superseded by the measured lower keel in `ef250522b` and retained in the
  integrated family. The current builder calls `trophyMerkavaLowerKeel()`.
- The later Type 100 Chinese IFV design (`3811a5838`) supersedes older hull/turret
  experiments; Prototype and Object 695 missile roles (`fa47ba0d3`, `11408b43d`)
  supersede their previous shared configuration.
- Later owner revisions to Ariete, Griffin, Kurganets, MBT-70 and the Korean
  lineup are present in `11408b43d`, `4d0923016`, `efa05dc47` and `c4a8d7b4a`.
  Their tests remain in the ordered release suite.

The seven merge commits reviewed were `2f87132f7`, `292619753`, `81dc47337`,
`49340b0d4`, `e091f4c00`, `c61db17e3` and `d307cecd2`. Three had no remerge
resolution delta. Two resolve generated tank assets. The remaining two combine
fleet/map totals, camo receipts, Object 695 and supplied-fleet registrations.
No side was dropped in the inspected source resolutions.

## Work still owned elsewhere

At the snapshot, Claude's `r35-fills` worktree at `0460f8d33` had a modified
`tools/gen-interior-fills.mjs` and untracked `tools/track-lane-boxes.mjs`.
The edits extract shared track-lane calculation; they were neither committed
nor part of main. `r35-maps` was clean at the same base. These are active work,
not recovery candidates. Shadows remain with Claude per the owner's message.

Recent dirty Israeli worktrees contained older fill records, the Trophy body
policy and a trial belly-width change. The body policy already exists on main;
the box-width experiment is superseded by the measured keel. Generated draft
records must not replace later qualified records.

## Publication safeguards and limits

[The shared-main procedure](../DEVELOPMENT.md#publishing-to-shared-main) is linked
from both agent entrypoints. `tools/shared-main-preflight.mjs` checks actual
remote ancestry, clean scope, validated commit and overlapping files. It catches
an accidental whole-file rollback even when the proposed push is fast-forward.
Review acknowledgment is pinned to the current main revision; it does not
automatically prove the review or tests occurred. Normal Git push still rejects
a race after preflight. No hook or production deployment setting was changed.

The runtime at audited main is unchanged from the previously gated Viper fix:
that release passed 1,131 suite checks and the complete targeted tank release
procedure. The new publishing tool has separate two-clone regression coverage.
That regression, repository hygiene, local-import integrity and the changed
tools' complexity gate all pass. No production source or performance policy
was edited by the audit.
The earlier production Garage probe passed after deployment 54 and includes the
served version, normal selection, static batching and cached return.

This audit cannot prove every visual result is correct, recover unreachable
objects already pruned on another machine, or certify future concurrent edits.
No unreviewed draft was merged merely to make the branch inventory appear clean.
