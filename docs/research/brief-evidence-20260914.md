# Brief evidence table (2026-09-14, deploy 13 = 24418ce08 / bundle main-BRGBR8Ne.js)

Owner brief items with the check that proves each one on the current tree.
All measurements below were re-run on 2026-09-14 00:50–00:53 PDT.

## Tracks and wheels

`.qa-dev/track-band-evidence.mjs` reads `runningGearReceipts[0]` of every
build (`trackTh` = shoe band thickness; `trackShoeDimensions` = pad/web/horn
heights; `nativeWheelPatterns` = the steel dish motif):

| id | band (m) | pad | web | wheel pattern |
| --- | --- | --- | --- | --- |
| t72b3_x, t72b3m_x, t72bu_x, t72b_1987_x, t62mv1_x | 0.030 | 0.036 | 0.018 | pressed-six |
| t80u_x, t90_x, t90a_x, t90a_vladimir_x, t90m_x, t90ms_x, t90sm_x | 0.030 | 0.036 | 0.018 | pressed-six |
| t90a_burlak_x | 0.030 | 0.036 | 0.018 | deep-dish-eight (source variant) |
| t14_x | 0.068 (own measured shoe) | 0.018 | 0.012 | armored-hub-six |
| amx30_x, amx40_x | 0.024 (fleet band) | 0.035 / 0.028 | 0.014 / 0.035 | scalloped-six |
| chieftain5_x | 0.024 (fleet band) | 0.030 | 0.032 | pressed-eight |
| m1a2_x (reference) | 0.024 | 0.030 | 0.012 | split-rim-ten |

Every Russian X tank carries the thick 0.030 band with the measured 0.036 pad
and 0.018 web; none draws a fully rubber wheel (every one has a pressed steel
dish motif, with the Burlak and T-14 keeping their source-specific dishes).
The four ids the earlier note skipped (amx30_x, chieftain5_x, amx40_x,
t90m_x) carry the standard: the three western ones on the fleet 0.024 band,
t90m_x on the Russian 0.030 band. `trackShoeDimensions.selftest.mjs` pins the
family originals and the measured stock.

## Machine-gun census

`node tools/tank-standard-check.mjs --ids=…` (decor column = `mgN+Md`):

| id | census | gate |
| --- | --- | --- |
| chieftain5_x | mg1 | 94.4/92 PASS |
| ariete | mg1 | 83.1/90 (source-fidelity score, pre-existing) |
| ariete_c1 / ariete_c2 | mg2 / mg1 | pre-existing scores |
| isu152 / isu122s | mg1 / mg1 (DShK) | 91.3 / 90.7 ≥ 90 (track clip flags pre-existing) |
| kf51 / kf51_x / kf51b | mg1 / mg1 / mg1 | 90.4/90 PASS, 93.7/92 PASS, procedural-only |

The census has no Ariete exception: the tool states "An absent MG is not a
census exception" and counts the Ariete's real gun. Chieftain 5 X counts its
hand-authored gun. Both ISU casemates carry a DShK.

## KF51

`kf51`, `kf51b` and `kf51_x` are Production rows in `docs/VEHICLE-ROSTER.md`
(rows 115, 116, 175) with geometry-gate ledger rows; kf51 scores 90.4 against
the 90 floor and kf51_x 93.7 against the 92 exemplar bar.

## Deploys

`.github/workflows/` holds only `localization.yml` (commit ecfde6264
"retire the GitHub deploy workflow"). Deploys 11, 12 and 13 were manual
Vercel CLI deploys from the gate checkout (`vercel pull` → `vercel build
--prod` → `vercel deploy --prebuilt --prod`), each verified on production
with the render-truth probe.

## Visual state against the 1049e4e reference (identical external poses)

Reference dev server at 1049e4e vs deploy 13, `.qa-dev/ref-ab-shot.mjs`,
1920×1080, bands = mean |Δluminance| along x (sharpness proxy):

| map | sky band lum ref / now | ground gradient ref / now |
| --- | --- | --- |
| verdant | 202.4 / 202.2 (identical) | 20.8 / 13.3 and 32.2 / 19.8 |
| alpine | 179.7 / 179.3 (identical) | 10.1 / 7.7 and 23.6 / 17.1 |
| fjord | 165.9 / 165.6 (identical) | 19.5 / 15.4 and 25.0 / 13.4 |

Sky and horizon are at parity. Ground micro-contrast rose 13–24 % with
deploy 12 (RCAS floor 0.5 under TAA, brighter keys) but still sits below the
reference's un-antialiased frame; the remaining gap is the temporal AA box
filter, and the next lever is a higher RCAS floor (sweep in progress) or a
sharper current-frame reconstruction in the TAA resolve. Trees, tree bases
and leaves were reworked in ecfde6264 (trunk flares, roots, leaf atlases);
the rim forests came back with the 20 m spawn clearance; water passes 3–5
and the fleet primitive review are documented in the sibling notes.
