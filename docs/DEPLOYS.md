# Production deploys

Production is `https://cot.kevinliu.studio` (Vercel project `kl01s-projects/claude-of-tanks`).
Deploys are manual, from the detached gate checkout after its gate is green, with the Vercel
CLI: `vercel pull --yes --environment=production` → `vercel build --prod` →
`vercel deploy --prebuilt --prod`. There is no CI deploy: the GitHub deploy workflow was
removed on 2026-09-14 (its last run had failed on an invalid `VERCEL_TOKEN` secret), and the
owner's standing rule is that nothing deploys without a green gate and a person running it.

Each deploy carries Vercel metadata (`title`, `githubCommitMessage`, `githubCommitRef`,
`githubCommitSha`, …) so the Vercel deployments list reads
`main · deploy N: <title> (<head> — <commit subject>)` instead of a bare URL. The script that
does this lives in the session scratchpad (`deploy-prod.sh <number> "<title>"`) and appends a
row here; commit the row with the deploy's docs.

Bundle = the hashed entry chunk served by production after the deploy (`main-<hash>.js`), the
quickest proof that the live site is the gate build.

| # | date (PDT) | head | title | bundle | deployment |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-09-12 17:27 | fc74695d3 | frontline atmosphere owner beside the weather owner | — | — |
| 2 | 2026-09-12 20:24 | 74908c849 | Frontline Assault mode, hearth smoke over inhabited chimneys | main-yvGCl_HL.js | — |
| 3 | 2026-09-12 21:24 | 4ca44df2e | door lanterns and corner quoins on catalog buildings | main-BuNIr2A9.js | claude-of-tanks-7fdj5qujj |
| 4 | 2026-09-12 22:52 | 43eabc9cf | ground litter and campaign progress receipts in the release suites | main-DUxlLNjx.js | claude-of-tanks-3hh96jlpi |
| 5 | 2026-09-12 23:24 | d6526becf | per-map log and yard-dressing caps (environment density pass 2) | — | — |
| 6 | 2026-09-13 10:02 | 3bddcdea3 | garage draw-range receipt stubs, TAA cost receipt, tank decoration plan | main-QsEt1zcd.js | claude-of-tanks-sxt5581rz |
| 7 | 2026-09-13 10:55 | e92767fac | joinery only on panes seated on the envelope wall (Ruinspires build fix) | main-DkI8qo1J.js | claude-of-tanks-e7q1ouzj5 |
| 8 | 2026-09-13 12:03 | 7b2812870 | tank decoration batch 1 — real stowage plans for the modern heroes | — | — |
| 9 | 2026-09-13 13:20 | 846462bfc | garage workshop exhibits get their stowage | — | — |
| 10 | 2026-09-13 16:24 | 47bd1c876 | sealed-hull check, geometry fixes, armour overlay inflation | — | — |
| 11 | 2026-09-13 19:29 | 967523860 | trench constructor additions declared to the road history projections | — | — |
| 12 | 2026-09-13 21:47 | 471c7b709 | TAA-aware RCAS floor and key/fill lighting toward the 1049e4e look | main-CqOcRcpE.js | — |
| 13 | 2026-09-14 00:45 | 24418ce08 | interior fills, wheel and bodywork review, countdown, water pass 5 | main-BRGBR8Ne.js | — |
| 14 | 2026-09-14 01:26 | 26afcb04a | temporal AA off by default on the desktop tiers | main-mc8IgTrh.js | — |
| 15 | 2026-09-14 02:03 | 1ebbfc3d1 | water pass 6: vehicles push wake rings and churn into the water | main-Crs4rLYy.js | — |
| 16 | 2026-09-14 03:51 | fe9d98125 | environment richness and campaign flavour pass, foliage shade back to 1049e4e | main-B7lqtmGI.js | claude-of-tanks-dfun8lmuy |
