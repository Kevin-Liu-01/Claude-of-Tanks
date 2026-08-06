---
name: spawn-critic
description: Compose the brief for an independent shaded-parity critic in the tank generation program. Use when spawning a graduation adjudication, a re-cert critic for a graduate-change/density/shoe round, or any independent visual verdict. Triggers - "spawn the critic", "re-cert critic", "graduation adjudication", "independent verdict on <tank>", "14-view critic".
---

# SPAWN-CRITIC — the independent critic brief boilerplate

The critic is ADVERSARIAL to the builder's claims: every number in the verdict is the
critic's own run on the OFFICIAL rigs (§D). Model verdicts:
docs/critique/shaded-parity-abrams-density-recert.md and
docs/critique/shaded-parity-leopard-shoe-recert.md. Two critics max concurrently
(FIFO sanity).

## The boilerplate (include in EVERY brief)

1. **NEVER commit, never edit src/ or GLBs**; scratch tooling under tools/tmp-*
   (untracked), evidence under shots/ (gitignored), plus ONE verdict doc:
   `docs/critique/shaded-parity-<topic>.md`.
2. Env: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`; own vite 74xx-77xx (never
   5001/5002); read docs/BUILD-STANDARD.md (§D, §J especially) + the packet(s) first.
3. **FIFO §F.1**: official rigs SELF-TICKET — run them bare, never wrapped. All 14-view
   pair renders under ONE ticket via a batch driver on the identical render path
   (clone tools/tmp-b1b3-critic-batch.mjs / tmp-density-critic-batch.mjs). Zero console
   errors required. NEVER stop to wait on watchers — chains run sequentially in-process.
4. **Hash bracketing**: `node tools/tmp-hashgeo.mjs --ids=<candidates>` BEFORE all
   browser work and AFTER the last render (and after any mid-run landing) — every render
   must be provably at the verdict hashes (§J: yaw-pair evidence is hash-stamped).
   Mid-run landings: path-byte `git diff <a> <b> --stat` over the family's build+harness
   files + a post-landing bracket run keeps in-flight evidence valid.
5. **Gate x2 minimum** (x3 if runs straddle work): rows EXACT to the decimal vs the
   landing ledger; per-id JSONs bit-identical between runs is the gold standard.

## Standing checks table (§F.4 — every verdict carries it, measured by the critic)

| check | bar |
|---|---|
| geometry-gate x2 | frozen/landing rows EXACT both runs |
| tmp-hashgeo bracketing | candidates stable across the whole evidence window |
| track-clip-audit --exact | band 0/0 + shoe 0/0 per zone (shoeVox is the player-visible bar); audit dressingSkipped exclusions, never delete |
| turret-parent-audit | stranded 0 / dangling 0; `abutting` adjudicated on renders (certified ORACLE-REGISTRATION-PINNED classes reproduce exactly) |
| tank-standard-check | clip 0/0, contig 0, census matches packet claims |
| visual-evaluator | RIG PARITY OK every view (a RIG MISMATCH verdict, yaw-proxy > 10°, ABORTS scoring — fix registration first, never score a mismatched pair) |
| §J yaw-90 pairs | re-rendered at the verdict hash for every id whose turret kit changed |

## Scoring laws

- **CHANGED-VIEW LISTS ARE DIFF-DERIVED (§J)**: builders under- AND over-list. Build the
  per-view pixel-diff matrix (proc half, threshold recorded, label band y13-21 excluded)
  vs the superseded baseline; the matrix REPLACES the builder's list — score
  unlisted-but-changed, skip listed-but-unchanged. Diff COUNTS are harness-local: the
  view SET binds, magnitudes never port across harnesses.
- **Severity bar**: graduation = >=9.0 EVERY one of the 14 views (front, frontleft, left,
  rearleft, rear, rearright, right, frontright, top, hero-frontleft, hero-rearright,
  hero-toptilt, close-front, close-roof). Re-cert = every changed view >= its ratified
  score (floor holds; price views UP only on measured structure). Cross-critic severity
  disputes calibrate against the ratified chieftain5 anchor — measurements, not vibes.
- **Sky/hole claims**: banked flood method — bg |px−0x151b20| maxch<=13 AND B−R >= +8
  (blue signature), border flood removed, label band excluded; adjudicate flood deltas by
  locating the exact pixels at 10x, never by count alone (connectivity teeter class).
  Tone claims: ITU-601 luma rects WITH coordinates; read the p90/sd/med triplet.
  Deep-shade zones with zero percentile spread are shadow reads — tint orders are void.
- **Orientation**: critic top pair renders bow at image BOTTOM — gun-overhang check
  before calling turret-front reads.
- **Standing silhouette checks on every verdict**: §B1 slopes/no-staircases (+ turret
  cheeks both sides §B1.1), §B2 contiguity/no-turret-holes, §B3 no-mystery-boxes +
  §B3.1 gun-run prisms (order-rank = silhouette break), §B3.2 density, §B4 track
  containment, §B5 furniture parenting at yaw, §B6 track-run trapezoid, §H.4
  variant-distinctiveness + national MG grammar, §C missing-side (LEFT view vs right).
- Renders are the witness for winding (flood is blind to reversed slabs; masks are
  DoubleSide and hide them).

## Verdict doc format (docs/critique/shaded-parity-<topic>.md)

1. Header: round, landing commit, candidate hashes (mesh/verts), frozen baselines, laws
   governing the round. 2. Provenance (every command yours; tree state; brackets;
   mid-run landings adjudicated). 3. HEADLINE verdict. 4. Standing-check table.
5. Claims audit (packet done-gates re-derived). 6. Diff-derived changed-view matrix.
7. Per-tank verdicts with per-view scores + justifications. 8. Residuals certified
   (none blocking / orders). 9. Law discoveries for the bank.

Verdict vocabulary: RE-CERT PASS (re-freeze <hash>) / GRADUATION PASS / FAIL with
ordered work. Orders must be measurable. The orchestrator re-freezes only on PASS.
