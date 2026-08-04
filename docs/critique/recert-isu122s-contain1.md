# isu122s GRADUATE RE-CERT contain1 (casemate containment round) — 2026-08-03

Scope: dual-gate graduate (freeze b472e956, r11 critic 9.0+ all views over
eleven rounds), re-cert of CHANGED regions per the graduate-change protocol
(§H.3): laneCut corridor {x 0.82, front 2.40..2.955 floor 1.31, rear ≤−2.70
floor 1.28}, bow furniture −0.215x onto the core, wing skins to the core
edge (1.21 → 0.80), front-plate tier + hullRubber face-skin L-splits
(over-track thirds bottom 1.120 → 1.20), fwd fender flange 1.4665 → 1.4795
(13 mm outboard, inside the certified 1.451..1.485 window), channel-AO clip
aoZ [−2.305, 2.38]. Graduation cert stands for unchanged views/members.

Renders: fresh `node tools/tmp-tank-critic.mjs --id=isu122s` →
shots/critic-isu122s/ (14 views, zero console errors). All 14 views
BYTE-IDENTICAL to the builder's shots/critic-isu122s-contain1/ set — the
builder's self-audit rects were computed on exactly the state I judged.
Baseline discipline: HEAD-bytes worktree render (hash **b472e956**, 34
meshes / 368162 verts — the graduation freeze reproduced exactly) gave me a
true graduation-look diff and re-derived every banked number
(tmp-recert-crops/-pxprobe/-diff/-ab/-ab2/-skyscan-isu122s tools).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact --ids=isu122s`: **front 0 / rear 0**.
  The HEAD-bytes baseline reproduces the packet's BEFORE exactly (front
  **401** / rear **215**, rig_hull 210 + 104 + 28 breakdown) — the fix's
  whole point, confirmed on the official tool in both directions.
- `tools/geometry-gate.mjs` + `tools/tank-standard-check.mjs`: gate min
  **90.1**, components **90.3/90.1/100/94.9/98.3/100** — the graduation
  line EXACT, twice in my own session. Contiguity **0 holes** (§B2 machine
  scan), clip 0/0 ✓. Decor `mg0+0d ✗` is the carried packet justification
  (hand-authored DShK anatomy predates KIT.fittings) — not a new failure.
- `tools/tmp-hashgeo.mjs`: **fdb91d50 (34 meshes / 368714 verts)** — the
  packet's re-freeze hash exactly (supersedes b472e956, +552 verts).
- `tools/visual-evaluator.mjs --id=isu122s`: exit 0, rigParity verdict OK,
  **no RIG MISMATCH** (worst yawProxy 4.7° close-roof / 3.9° close-front,
  both certified-identical to the baseline run; ortho views ≤1.1°).
  Evidence at shots/visual-eval-isu122s/. Baseline evaluator run in the
  worktree, proximity-matched per flagged edge: **zero truly-new flags on
  every focus view** (front 0, close-front 0, left 0, right 0, rear 0,
  top 0; front/rear both "0 flagged, worst Δ0.0°").
- r11 certified rect battery re-derived on MY fresh pairs
  (tmp-isu122s-r11-rects.py): headline **proc PLATE R p50 73.7 / iqr 3.9**
  vs ref face-plate R **73.6 / 4.4** (quantile-for-quantile match; r11
  banked 73.6/3.6 class) — **p95 87.6** is the disclosed vacated-columns
  delta, toward the ref's own 101.0 tail; **tub flare p50 81.9** = banked
  81.8 class EXACT; flank skins / ground comb / drum slots / wheel faces /
  tub gaps BYTE-IDENTICAL between baseline and containment renders;
  **proc brakeX iqr 10.7 on the HEAD-bytes baseline too** — the bank's
  28.6 was stale (§D re-derivation law), not a regression. Proven myself.

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.2 | Lane columns swap the graduation-era wing-skin cover for track pads — dead-front the band+shoes own every vacated column (pixel diff confined to px 712-864/1039-1207 lane zones; plate center byte-identical). No new enclosed-bg (scan: header letter-holes + a 6px certified AA-seam pair at the flap-edge columns, baseline-identical); exact-bg 0. L-split invisible: union above y 1.20 identical, kept tier byte-alike (73.7/3.9). Evaluator 23 edges matched, 0 flagged. Crest/shackles/mantlet/hooks untouched. |
| close-front | 9.2 | The money view: bow furniture (racks/rail/pad/drum/stem/conduit) reads as the same certified composition sitting 21.5 cm inboard on the core — attached, contact shadows intact; the print-true open channel reads RIGHT: idler wrap + pads sweep visibly under the sponson lip where the covered shelf used to sit, wrap arc round and unbroken at 3x, zero clipping at 1x. Enclosed-bg clusters all baseline-identical (under-hull wheel-shadow pockets, content-dark). Truly-new evaluator flags: 0. |
| left | 9.1 | 127 diff px TOTAL — the quietest changed view. Bow and stern wraps clean at 3x (grouser silhouette, no plate crossing the arcs); flange step edge-on sub-pixel; certified under-sponson channel openings (55 exact-bg px at y 368-371) BYTE-IDENTICAL to graduation — carried cert, not containment work. Rect battery byte-identical. |
| right | 9.1 | Mirror: 194 diff px, all flange-tip class ((1202,310)-(1223,337)); wraps clean, drums keep their certified bellies over the untouched rear flange piece. tub flare 81.9 EXACT, brakeX 10.7 stale-bank-proven, comb/drum/wheel rects byte-identical. Truly-new flags: 0. |
| rear | 9.1 | The largest visual change (6.5k diff px, symmetric): the loft wall that filled each lane is gone; lanes now read open channel under a sponson shelf with the flap/shoe row below — attached, symmetric, MORE print-true. No sky: enclosed-bg = header text only, exact-bg 0. Evaluator 22 matched, 0 flagged, truly-new 0. AO strip rear end unchanged (aoZ clip is bow-only). Manholes/studs/drums certified-state. |
| top (supporting, plan) | 9.0 | §B2: machine top-down scan 0 enclosed cells ✓; pads own the vacated wing-band plan (bow A/B), beak keeps full graduated width beyond z 2.955 (no notch growth). RESIDUAL (disclosed): two 2×3 px exact-background slits at the corridor gap (px 913/1005, y 396-398 — pad-gap aligned with the 37 mm core↔band lane gap), 12 px total, NEW vs baseline 0. Dark-slot context, sub-visible at 1x; the honest open-channel read the doc mandates ("the channel is SUPPOSED to be open"), though the ref covers its own channel (no ref permit). Not the §B2 hull/turret-interior hole class; official machine check passes. |

Supporting (non-focus, checked): hero-toptilt — wrap-zone channel sections
now open with pads visible inside, consistent with the certified mid-hull
channel grammar; its enclosed-bg clusters byte-identical to baseline.
hero-rearright — the evaluator's 3.247 m² "enclosed-void" is the
barrel-over-deck perspective overlap chain (its own printed caveat;
diagonal cluster chain px 895→1067, baseline-identical; §B2 machine 0).
Quarter views carry ONE truly-new evaluator class: a symmetric
rearleft/rearright pair (Δ−14.1°/+13.9°, len 0.43 m, noise 0.58°) at the
stern wing-floor line (~world y 1.40) — the new sponson-shelf shading edge
vs the ref's own mudguard fall; interior line, attached, silhouette
unbroken; recorded as a priced parity deviation alongside the certified
stern classes around it, not gate-blocking. All other quarter/hero flags
match baseline classes at proximity.

## RE-CERT: YES

All focus views ≥9.0 (front 9.2, close-front 9.2, left 9.1, right 9.1,
rear 9.1; top 9.0 supporting). Bow and stern show zero track clipping at
1x from every angle (0/0 exact audit, 401/215 baseline reproduced), every
moved member (furniture group, wing skins, L-split tiers, flange, AO strip)
reads attached, the print-true open channel is an upgrade on the
graduation-era covered wing band, and the graduation look survives
untouched everywhere else (14/14 byte-compared, diffs confined to
lane/wrap/furniture zones; certified battery reproduced). Gate 90.1 line +
fdb91d50 hash match the packet. Re-freeze at the orchestrator's landing is
approved from the critic side. No coordinate orders.

Residuals (declared, priced, non-blocking): the 12 px plan-view channel
slits (top); the stern wing-floor Δ14° interior shading pair
(rearleft/rearright); pre-existing carried classes — mg0+0d fittings
census (packet), drum slotX dark read, partial rear circles, crest right
+8.2, mottle grain ≥6x — all under the graduation cert.
