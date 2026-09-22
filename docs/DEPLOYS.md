# Production deploys

Production is `https://cot.kevinliu.studio` (Vercel project `kl01s-projects/claude-of-tanks`).
Deploys are manual, from the detached gate checkout after its gate is green, with the Vercel
CLI: `vercel pull --yes --environment=production` → `vercel build --prod` →
`vercel deploy --prebuilt --prod`. There is no CI deploy: the GitHub deploy workflow was
removed on 2026-09-14 (its last run had failed on an invalid `VERCEL_TOKEN` secret), and the
owner's standing rule is that nothing deploys without a green gate and a person running it.

Deploys 3–20 were made from a detached, dirty gate checkout, so Vercel recorded them as
`ref HEAD, dirty` with no branch link and the dashboard lists them by id with the source
"vercel deploy" (deployment metadata is immutable, so those rows stay that way). From deploy
21 the deploy runs in a clean clone on branch `main` (`deploy-prod-main.sh <number> "<title>"`
in the session scratchpad: fetch, reset to origin/main, `vercel pull`, `vercel build --prod`,
restore package-lock.json, `vercel deploy --prebuilt --prod`) and passes the branch-link
metadata Vercel documents for CLI deploys — `githubDeployment=1`, `githubCommitRef=main`,
the commit sha and subject, and the linked repository's name and ids — so the list reads
`main · deploy N: <title>` and the production branch owns the deployment. `title` and
`gateHead` ride along as before; the script appends the row below.

**Git auto-deploys are off.** `vercel.json` carries
`"git": { "deploymentEnabled": { "main": false, "codex/*": false } }` (2026-09-15, owner: the
Aug 26 – Sep 10 commit storm built 1,220 times — one Vercel build per pushed commit, ~1,400 billed
build minutes). A push never builds; production changes only through the prebuilt CLI deploy
above, once per round after the gate, which uploads a local build and consumes no Vercel build
minutes. Preview deployments for `codex/*` branches are off for the same reason. The Ignored Build
Step is deliberately not used — one gate, not two. To check: `vercel ls claude-of-tanks --scope
kl01s-projects` must list only the intentional deployments in this table.

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
| 17 | 2026-09-14 13:10 | 88f235a41 | owner rulings batch: Challenger paired wheels, T-72B3M X closure, fills to zero, night, horizon smoke, campaign ladder | main-BHi1e83C.js | claude-of-tanks-amws1rzf5 |
| 18 | 2026-09-14 20:51 | 4748e33f0 | wheels read again, tracks wrap the road wheels, phone boot and touch fixes | main-CquDnnhm.js | claude-of-tanks-bn66bd817 |
| 19 | 2026-09-14 21:04 | 8388bda3f | every mode plays by its own ruleset; campaign operations with difficulty, clocks and stars | main-wgQRTYGc.js | claude-of-tanks-9salxlpk1 |
| 20 | 2026-09-14 22:44 | 35656f236 | mobile toolbar taps under a steering thumb, campaign in the service record, BRIEF button, cleanup slices | main-D2byEoBu.js | claude-of-tanks-awxosmmku |
| 21 | 2026-09-15 14:39 | e7b7580d6 | tactical map, Revolution recess, fills to zero, era stowage, settlement details | main-CgudSgmE.js | claude-of-tanks-qrgjn1vsx |
| 22 | 2026-09-15 16:25 | 0f866ab62 | distant smoke plumes, map previews carry the front, fast checks | main-Dg5H_mkN.js | claude-of-tanks-gbt8yvqkd |
| 23 | 2026-09-15 20:12 | 5b314176b | roster names, M1A2 Abrams UA kit, Type 100, smoke-free previews, team arrangement | main-DLyO1mF-.js | claude-of-tanks-7vw3e22k1 |
| 24 | 2026-09-15 20:46 | 084c60292 | camo labels follow the renamed hulls | main-PgCLN_4U.js | claude-of-tanks-jiqcvprgz |
| 25 | 2026-09-15 23:39 | 6da591544 | SEPv3 Trophy configuration, Ukrainian Abrams cages, Turbo Ball rules, respawn countdown, tiers | main-S1eOJif3.js | claude-of-tanks-nozrmuxf2 |
| 26 | 2026-09-16 11:16 | 5277398bf | SEPv3 full side armour, German garage order, T-90MS X Shtora emitters | main-Cu72iRIN.js | claude-of-tanks-9ex9s4ewi |
| 27 | 2026-09-16 12:13 | f44249ba0 | M1A1 SA (Ukraine) cage gains the fine rod layers | main-BNZqsPyu.js | claude-of-tanks-rcge3huoz |
| 28 | 2026-09-16 13:22 | 4bcd8eec4 | Leclerc XLR and AMX 56 studies at tier X, blue Shtora lenses on the T-90MS X | main-CZSgaV3D.js | claude-of-tanks-djdbaa6x1 |
| 29 | 2026-09-16 15:20 | da2a30ead | Type 100 rebuilt from the ZTZ-100 reference set | main-CF9R4110.js | claude-of-tanks-c3562xe51 |
| 30 | 2026-09-16 16:40 | 71d9637dc | T-90M X painted cradle cover, reviving modes skip the death cam and kill cam | main-Qj9kzwOa.js | claude-of-tanks-rmlizvpa0 |
| 31 | 2026-09-16 19:18 | fdf9158c3 | Type 100 remade (T-90M hull grammar, T-14 turret grammar, IFV prow); Turbo Ball hides consumable slots | main-XeSMiX4A.js | claude-of-tanks-89jab6hjw |
| 32 | 2026-09-16 20:09 | 15e9a203c | Turbo Ball jump (F) and recoil launch, impact knock and faster rams everywhere | main-Lf4gZaXE.js | claude-of-tanks-4kznbqoor |
| 33 | 2026-09-17 23:05 | 2b869b9d0 | X-standard tracks and reseated wheels fleet-wide, ZTZ-100 and Type 100 IFV, objective-driven bots, wreck-bound smoke, fortifications on every map | main-DxfDEKBx.js | claude-of-tanks-gdr6mn59w |
| 34 | 2026-09-18 00:59 | f11b4b6ea | Fire trenches carved into every map, rosters that advance across sessions, the suspension simulation as a receipt | main-Bn_6Nqry.js | claude-of-tanks-1u6b51q72 |
| 35 | 2026-09-18 01:39 | 10f340faa | Matchmaking rotates through the contemporary eras: fresh vehicles before any repeat | main-DpR4Bmsy.js | claude-of-tanks-7jqqc23zk |
| 36 | 2026-09-18 02:30 | c7901d34d | Horde and Frontline waves defend with one nation: the formation is the enemy side | main-DKcoaDiE.js | claude-of-tanks-3ssaic8lw |
| 37 | 2026-09-18 12:01 | b08328157 | Track ramps pivot with the outer road wheels instead of sticking to them | main-BfPJm92l.js | claude-of-tanks-anpyk2z2y |
| 38 | 2026-09-18 20:28 | 271c6b92e | Object 695: a tier X Russian IFV with the fleet's most powerful belt | main-CboA7afe.js | claude-of-tanks-qfx57es2l |
| 39 | 2026-09-19 00:20 | 9b5220851 | Night headlights on both sides and missile loads that match the tubes | main-DQqX3_vA.js | claude-of-tanks-ro7fpewp0 |
| 40 | 2026-09-19 01:57 | ce677147e | Sides switch: 7 v 7, 14 v 14 or a custom field for every solo mode | main-BewY3N46.js | claude-of-tanks-efiozvxib |
| 41 | 2026-09-19 02:30 | 6432c05ef | Night starfield and moon, crisper clouds and textured horizon ranges | main-g7IFqypA.js | claude-of-tanks-qx7dzrpxd |
| 42 | 2026-09-19 04:38 | acc04bb30 | Mars mode on the Olympus Basin station, with the OpenAI, xAI and Gemini skins | main-DUIiO2jL.js | claude-of-tanks-7m6acm8m8 |
| 43 | 2026-09-19 14:37 | bc588917a | Vista pass: seated rim bands, layered horizon ranges and a real ring forest | main-H6vhWs3Y.js | claude-of-tanks-8v7j562ta |
| 44 | 2026-09-19 19:09 | d0b637bce | Hitboxes with real tops, fly-over without invisible walls, and wrecks that keep their momentum | main-CNX6aWV9.js | claude-of-tanks-3k8zh03tk |
| 45 | 2026-09-19 20:50 | d464a813f | Trackpad pinch and scroll zoom by travel, and persistent Garage sidebars down to 900 px | main-DbMA90Uk.js | claude-of-tanks-bltb1l48q |
| 46 | 2026-09-20 12:21 | 952a205e7 | Pinch-zoom guard installed at boot for every device, and a clean build stamp | main-ORM88aeN.js | claude-of-tanks-nnglffupl |
| 47 | 2026-09-21 00:47 | e3ad8b6a1 | Vehicle wakes replace the water rings, and tank shadows are grounded | main-CZc5ZQWx.js | claude-of-tanks-2qk7tqqhp |
| 48 | 2026-09-21 03:21 | 4655e21cc | Structures are floors, rocket jump and desktop keybinds; tank paints become selectable camos with national schemes | main-D1Ifdjb3.js | claude-of-tanks-8s4cbgmnd |
| 49 | 2026-09-21 04:15 | e3fc71582 | Every horizon ring keeps its texture past the rim, and Redrock loses its dark band | main-BbEtjO2P.js | claude-of-tanks-lj8oxh8iy |
| 50 | 2026-09-21 16:45 | cd7164da8 | Turretless tanks aim as one sight, Turbo Ball shows unlimited rounds, camo Factory returns with a deduplicated catalog, night horizons stop glowing, Redrock's outland gets rocks | main-CxECc2CL.js | claude-of-tanks-lag2owsbf |
| 51 | 2026-09-21 17:22 | 990966c05 | OpenAI, X and Gemini camos scatter like Claude; the HUD consumable tray keeps its cooldown writes retained (PR #8) | main-CpZILhQ1.js | claude-of-tanks-cn6pzwx68 |
| 52 | 2026-09-21 18:17 | c4a8d7b4a | Parallel-session fleet work since deploy 51: revise Korean lineup and XK2 turret | main-D8BaZJiA.js | claude-of-tanks-7eyvto6lp |
