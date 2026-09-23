# Actual moving-tank water contact — 2026-09-11

**Bounded contact review accepted; no runtime change.** Real M1A1 movement enters
and reverses out of Delta river and Mangrove marsh water in day and night.
All20 R3 original images were reviewed. Six further Delta R5 originals resolve
the initially ambiguous near-bank immersion without changing the water.

## Frozen source and acquisition

- Runtime source: `d121db465f996eb0e613be04ecf9dd2784cb3ebb`.
- Read-only Autumn production-style private dist index SHA-256:
  `9e5769d677d3fc39d23300495a34f18cc43134c018625328437c60c255f454cd`.
- Evidence root: `/Users/kevinliu/.codex/worktrees/cot-launch-water-motion-review-20260911/.qa-dev/launch/`.
- R3 four-run receipt: `water-motion-native-r3/report.json`, SHA-256
  `bcab4c8b1a1692923641325c2fd2c51b68687649b8f6eeac3631bc9c25f0ecf8`.
- R5 visible-contact receipt: `water-motion-native-r5/report.json`, SHA-256
  `43a847c48483f39dc3217731a2b6cc3ce40ee2c764d40fbe546dfcef0228a937`.
- Original image hashes and contact details:
  `water-motion-native-r3/independent-review.json` and
  `water-motion-native-r5/independent-contact-review.json`.

Native Apple M5 Max,1440×900,DPR1, actual HIGH gameplay, live battle clocks,
source-ready terrain and real W/S keyboard input were retained. One initial
route placement is followed by at least six seconds of real support settlement.
No synthetic splash/dust calls, lowered quality or frozen FX were used. Both
receipts pass with no page/GL errors, unchanged acquisition sources and completed
owned browser/server/lease cleanup. These are short visual/function checks,
not frame-time or memory benchmarks.

## Findings

R3 records139/135 player wet-contact calls in Delta day/night and186/178 in
Mangrove, including64–85 reverse wet calls per run. Other tanks stay104–242m
away. Fixed pool geometry, attributes, indices and finite capacities remain
bounded. Marsh originals show submerged lower running gear, a dry upper hull,
natural droplets/prints, and emergence onto dry land.

Delta's first image looked dry on the near side despite full center coverage.
R5 samples only visible track meshes and visible ancestors. The actual rendered
root follows simulation with normal interpolation. At the two rendered contact
vertices, actual water triangles and the installed height sampler agree within
4.44e-16m. The near-bank material level0 coverage is approximately0.37;
the opposite course is1.0. This asymmetric shoreline coverage explains why one
side is faint. The reverse-in-water original visibly covers the lower course.
The evidence does not identify a missing-water or incorrect tank-position defect.
Level0 sampling is an exact reconstruction of the bound texture's bilinear
sample, not a claim to have read every final GPU fragment or mip level.

The final Delta global print pool still contains distant bots' wet prints;
global zero-decay is not claimed. Player-proximity emissions stop and the local
wake disappears. Mangrove's global wet-print count reaches zero. R2's initial
Mangrove hover was an unsettled QA placement and is absent from R3/R5.

A source concern remains separate: reverse wet spray uses the same hull-forward
vector and rear emitters. The direct reverse still at approximately−5m/s shows
water contact but does not establish a disruptive spray-direction artifact, so
no speculative runtime fix was made. Entry images mark first rear-track wet FX,
not a separately implemented bow-entry splash.

This closes the sampled moving-contact gap left by synthetic FX tests. It does
not certify all water bodies, vehicle depths, mobile tiers, full-map art or
performance. Earlier R1 cancellation, R2 staging limitation, R3 initial Delta
uncertainty and R4 unfiltered-LOD diagnostic are retained as historical evidence;
R5 supplies the final visible-contact refinement.
