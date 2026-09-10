# Five-tank running-gear preservation — 2026-09-09

Status: local checkpoint, not released. This preserves the composed source and
tests so an interrupted session does not leave them only in a working copy.
Do not count this as the completed fleet track-thickness or performance pass.

## Scope

- Leclerc X: 16 radial sides for LOW wheels; HIGH retains 32.
- Strv 122 X: 48 sides instead of 72 for both qualities. The attempted 36/24
  sections failed the unchanged measured-face tolerance and were not adopted.
- Leopard 2A4M X and KF51 X: fitted return rollers, with stations clearing
  measured suspension compression. KF51 uses its own attached spindle root.
- Leopard 2A5 X: fitted rollers and 14.03 mm inner upper-carrier lining. The
  original near/far shoe course, road-wheel axes and non-running-gear source
  geometry remain protected by differential tests.
- Existing A7V X/Revolution roller and smoke changes remain in place.

## Evidence and limits

The composed driver completed 14 focused checks and typecheck successfully.
Tests include both qualities, finite rotor/spindle attachment, actual clamped
suspension motion, negative controls, historical geometry isolation, and the
A5 lining's unchanged near/far shoe transforms.

The existing native driver completed 120 images: five tanks, HIGH/LOW,
factory/winter, six views each. Inputs remained stable during capture.
Evidence is under `.qa-dev/five-tank-native-20260909/<id>/` in
`/Users/kevinliu/.codex/worktrees/cot-fleet-running-gear-integration-20260909`.
Only selected images have been reviewed; capture completion is not approval
of all 120 images or proof of frame-rate improvement.

Full visual review, composed anatomy/assets and targeted release qualification
remain outstanding. No source meshes or temporary QA files are in this commit.
This checkpoint must not be pushed to main as a passed release yet.

## Follow-up: repeated Leclerc pins and measured native cost

The shared measured-link path now uses eight-sided, fully capped pins instead
of twelve-sided cylinders. Both Leclerc studies use that path; legacy shoes
without the measured cross-section keep their exact original buffers. The
existing Leclerc link test passed its physical pad, connector-air, inward-cap,
course and legacy-buffer assertions after the edit. A new regression adds
explicit per-link ceilings (276 near / 174 far) for both Leclerc studies;
that rerun passed. The Classic geometry test also passed its HIGH/LOW source
frames, real optical/basket air, bore and 48-phase ground checks. The fresh
geometry census passed all four rows; remaining release work is pending. Do not count the
older 120 pictures below as renders of the new pin edit.

The new `.qa-dev/leclerc-pins8-cost-20260909.json` census uses the runtime
preserved at `bb52edb98`. Against the publication tree's pinned
`.qa-dev/fleet-style-review-20260909/triangles.json`, its LOD-selected,
instance-expanded scene totals are:

| ID / mode | Baseline triangles | Candidate triangles | Change |
|---|---:|---:|---:|
| Leclerc X / gallery | 123,496 | 113,128 | -10,368 |
| Classic X / gallery | 127,558 | 116,806 | -10,752 |
| Leclerc X / far bot | 43,322 | 27,578 | -15,744 |
| Classic X / far bot | 26,146 | 26,146 | 0 |

The gallery reductions are 64 triangles per measured shoe across 162 and
168 visible instances respectively. The far-bot modes hide the individual
shoes; Leclerc X's far saving comes from the earlier LOW wheel optimization,
not the hidden pins. Object/instance counts are unchanged. These are scene
costs, not GPU submissions, frame times, or switch-latency acceptance. Both
Leclerc studies now belong to the changed anatomy/assets/release scope.

The original five-tank native captures also contain actual WebGL submission
counts. These are matched HIGH/factory/left views at 14 m and 1200×800,
not frame-time or switching benchmarks:

| ID | Baseline submitted triangles / calls | Five-tank candidate triangles / calls |
|---|---:|---:|
| `leclerc_x` | 126,246 / 45 | 126,246 / 45 |
| `strv122_x` | 151,706 / 40 | 140,954 / 40 |
| `leo2a4m_x` | 79,982 / 41 | 80,438 / 44 |
| `leo2a5_x` | 91,328 / 49 | 91,412 / 52 |
| `kf51_x` | 69,360 / 39 | 69,816 / 42 |

The added rollers cost submissions; those are not reported as an optimization.
Strv 122's decrease is 10,752 submitted triangles in this matched view.
Leclerc's original wheel edit changed LOW only. The baseline manifest is
`.qa-dev/fleet-style-review-20260909/native/tank-assets.json` in the publication
worktree; the candidate manifests are the per-ID paths documented above.
These input-stable records predate the new Leclerc pin edit.

Further full-size views actually reviewed: A4M HIGH/factory left, A5 LOW/winter
left, and KF51 HIGH/factory rear-left. Painted wheel detail and visible lower
wheels remain; this small subset does not certify all joints or roller contact.
Thin track stock is still an open issue, not repaired by the pin-cost edit.
