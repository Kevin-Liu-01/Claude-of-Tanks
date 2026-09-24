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
An assets-only round (tactical-map plates, Garage cards, showcase frames) keeps the previous
`main-<hash>.js`, so the bundle name proves nothing there: the proof is the served
`application-version` meta (`v1.0.0+g<gated sha>`) plus a served-vs-local byte check of every
changed asset (`curl -sI .../<asset>` content-length against `stat -f %z public/<asset>`). Deploys 71
and 74 (2026-09-24) landed this way; a landing script that stops on "the bundle did not change" has
misread such a round.

Garage visual fixes require a real Garage check against the production build,
then against the production URL after deployment. Record the served
`application-version`, selected vehicle, screenshot and receipt together. Do not
report a fix as live based on `origin/main`, a gallery capture or an unbatched
factory test. Refresh an already-open browser before checking a new deployment;
its existing in-memory model belongs to the previously loaded release.

For Griffin Viper, run the following before and after the manual deployment,
using the exact gated commit and a fresh output directory each time:

```sh
node tools/griffin-viper-garage-probe.mjs --url=https://cot.kevinliu.studio \
  --revision=<gated-commit> --out=/absolute/fresh-output
```

For the pre-deployment check, substitute the locally served production build URL.
The probe rejects a stale/dirty release, selects the real carousel card, inspects
the final batched hull cable and repeats after a cached tank switch. Keep the
manual deployment policy above; enabling automatic deploys is not the remedy.

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
| 53 | 2026-09-21 19:13 | d0cbb9fcd | Fixed hydraulic guns spawn aiming, the CV90s are gated against their real references, and the E100 and AMX 56 tracks run clear of the hull | main-B7mSrpyu.js | claude-of-tanks-d4nbu1zre |
| 54 | 2026-09-21 23:22 | 0460f8d33 | Griffin Viper tow cable seated against the hull; real Garage and cached return verified before and after deployment | main-DXwrJhdC.js | claude-of-tanks-jmrm5qgjy |
| 55 | 2026-09-22 02:37 | 5e2258a83 | Ring walls keep their rock and layers past the map edge, camo patterns share one tile on every hull, interior fills regenerated fleet-wide, and the AAA map program | main-G3iXXeVy.js | claude-of-tanks-8al886cua |
| 56 | 2026-09-22 12:33 | 5e90760c9 | The horizon ring's foothills seat on the map's own geology past the square | main-ChDAxloK.js | claude-of-tanks-kdry061vv |
| 57 | 2026-09-22 12:39 | 4edad1a65 | XK2 and K2B share production K2 wheels and seated tracks; latest terrain preserved; owner-approved qualification exceptions; live Garage verified | main-S6D8U7q9.js | claude-of-tanks-mjkfy0tma |
| 58 | 2026-09-22 13:51 | 382e863e3 | The far ranges converge toward the sky behind them, not toward the horizon haze | main-BHxDD7VA.js | claude-of-tanks-funqlx02d |
| 59 | 2026-09-22 14:25 | 168022a5f | Redrock Divide is an enclosed basin, and the far ranges keep a third of their own colour | main-DcZ_nJl0.js | claude-of-tanks-nyb3hllzc |
| 60 | 2026-09-22 17:42 | ed379caac | Road wheels standardized per nation, muzzle holes rebuilt to cost less than carving, unused wheel constructions deleted | main-_q9Ws-pH.js | claude-of-tanks-4ibahpo50 |
| 61 | 2026-09-23 03:10 | cfdbb5771 | Water continues past the square; oversized wheels fixed and one wheel finish for the fleet; hidden barrel recesses closed; Panther G scored, dev hulls and dead code removed | main-0bBg2IQx.js | claude-of-tanks-5dsf0nony |
| 62 | 2026-09-23 03:42 | f6d81dcc0 | Guided salvo racks show the autoloader indicator (ZTZ-100 prototype, Object 695); every hull's multi-round weapons verified | main-BP0MwtKY.js | claude-of-tanks-kvnjpjf5z |
| 63 | 2026-09-23 04:42 | 2733d212e | Sky light on shaded steep faces: slopes turned from the sun carry the rendered sky's colour (Caldera, Skybridge walls no longer black) | main-DmhddWd1.js | claude-of-tanks-ig09tmggj |
| 64 | 2026-09-23 05:03 | 33b1ca54d | Dune ripples follow a local wind field: the sand bands swing, stretch and fade with distance instead of one corduroy (Desert, Oasis) | main-ojTOUN9X.js | claude-of-tanks-jkvrra30j |
| 65 | 2026-09-23 05:55 | 756d92ec7 | Monsoon's corner mound holds its turf and Fjord's corner cliffs are blue-grey gneiss, not plaster (steep-slope layer authoring) | main-CSnQFkR_.js | claude-of-tanks-984usg43u |
| 66 | 2026-09-23 11:56 | ad233e1a1 | Reactive water: a world-anchored GPU shallow-water field carries every hull's wake, churn and splash — bow mound, V wake and a trail that stays where the water was churned (no more hull-frame pattern) | main-CuftFFlP.js | claude-of-tanks-qcienojx0 |
| 68 | 2026-09-23 21:34 | a11e81ea5 | Round 47 map audit: deliberate ground palettes for the too-black maps, a nine-row mesa ring with strata and boulders and textured arid skies for the bland maps, and the coast continuing past the border on Saltmere Bay, Nordhavn Fjord and Saltwind Narrows | main-DLhiYr4d.js | claude-of-tanks-k0c4edqat |
| 69 | 2026-09-24 01:08 | ec3183c89 | Wheels, bores and core structure follow-up: road wheels sized to their pitch on 39 more hulls, the T-72/T-90 families lose their fictional return rollers, the K21 rides the BMP-3 ROK wheel, the M60A2 draws its true 152 mm bore, the m60a1 authority barrel ends on its muzzle marker, and the tank factory core loses its 93 stage wrappers and shadowed builders (byte-identical fleet) | main-nrVXxg0n.js | claude-of-tanks-12wqg4yy8 |
| 70 | 2026-09-24 02:33 | 4b5c42aa4 | Round 48 + 49: the three Verdant clone maps redesigned — Frosthollow as a Carpathian winter valley, Amberford as a Norman river-ford market town, Tarkhan Steppe as a Kazakh grain steppe with a braided wadi and kurgan line — the map QA probes and metrics committed as tools, and the ring pass: sea openings taper wider and headlands slope into the sea instead of standing as slabs, Titan's walls get jointed marker-bed strata, bare upper slopes on Fjord and Whiteout; landing (2026-09-24): Amberford's and Tarkhan's dedicated collision shards recaptured on the combined tree, bots relocate onto holdable ground and flank a closed penetration gate, the three redesigned player pads moved down their approaches (battlePacing 14/124) | main-C2PYCS-e.js | claude-of-tanks-m7zfrwj8k |
| 71 | 2026-09-24 02:46 | 280ac81a1 | Round 50: the redesigned maps' tactical-map plates and Garage cards — Frosthollow's and Tarkhan Steppe's minimap backgrounds re-baked on the new terrain (they still showed the Verdant-clone valleys), and the 4K heroes and picker thumbnails of Frosthollow, Amberford and Tarkhan Steppe re-rendered from the redesigned battlefields | main-C2PYCS-e.js | claude-of-tanks-2e5lhnlqa |
| 72 | 2026-09-24 04:00 | 8d0239dd1 | Round 46c: the 36 hidden vehicle records retired (owner: no hidden tanks) — their donor rows kept as unregistered templates in donorSpecs.ts, the GLB-era pipeline, 14 research tools and one proof pass deleted, the research notes moved to docs/history/research, and the fleet anchors, combat anatomy, marking seats, icons and tank-assets manifest regenerated for the 192 playable models | main-DwTyuLgy.js | claude-of-tanks-bxu3yemoa |
| 73 | 2026-09-24 04:12 | 4a9ea71cc | Round 52: Saltwind Narrows' strand widens from 12 to 20 m (owner decision 20) — a real beach between the hooked bay and the grass, the boat landings kept | main-C2SpygV6.js | claude-of-tanks-mecvyxbpv |
| 74 | 2026-09-24 04:23 | c1db7eb65 | Round 51: the home page and presentation archive frames of Frosthollow, Amberford and Tarkhan Steppe re-staged and re-rendered on the redesigned battlefields (26 renditions; the 4K battle-campaign showcase frames and the landing studio video remain) | main-C2SpygV6.js | claude-of-tanks-5dqqucks1 |
| 75 | 2026-09-24 05:18 | e3ccaaf48 | Round 53: the 4K showcase campaign frames of Frosthollow and Tarkhan Steppe (landing hero, mosaic tiles, README frame) and the landing studio video re-rendered on the redesigned battlefields | main-C2SpygV6.js | claude-of-tanks-411lpq27r |
| 76 | 2026-09-24 06:08 | ce949cac3 | Round 54: the last showcase media of the redesigned maps — the winter lake-duel feature loop, the Frosthollow and Tarkhan hero rails with their mobile proxies, the winter and steppe battle reels and the featured lake-duel frame re-rendered on the new battlefields | main-C2SpygV6.js | claude-of-tanks-45hrgypgj |
| 77 | 2026-09-24 07:37 | d21d087ae | Round 55: Titan Gorge's fine wall partings traced to their detail normal and removed, Nordhavn Fjord's alpine faces get rock outcrops below the treeline, and the horizon ring's forested tone near the coasts aligned with the shore | main-Be20KtqZ.js | claude-of-tanks-25ase1k1h |
| 78 | 2026-09-24 08:32 | 4cef1b4e3 | Round 56: the strands of Saltmere Bay, Nordhavn Fjord and Saltwind Narrows carry a wrack line and debris derived from each shoreline (owner decision 21) | main-B4OQZm9d.js | claude-of-tanks-1fr17io0a |
