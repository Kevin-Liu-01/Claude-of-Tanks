# T-64BM1M and the true T-64 base — run packet

Template: [run packet](../../tank-generation/templates/run-packet.md). Route: "New tank from this GLB; name it X" for
`t64bm1m`, then three more new tanks on its base (`t64bv`, `t64b1v_2022`, and the Polish concept `pt64_tur`);
`t64bv1` and `t64bv_donbas` stay as on main.

## Current status

- Updated: 2026-10-28 (lane item/t64bm1m-262, release 262).
- Owner requests (2026-10-27): via Main, verbatim, "add these new tanks using our rigoorous tank generation workflow" and
  "the t64 bm1m should be designed from scratchh as well and serve as inspiratin to properly update our t64s which are
  not based onn t64s rn"; to this lane, on the release-233 `profiles/t64bvX.ts` (a0711ff866): "that true t64 build is bad
  and i dont wnat u tgo use it" (not used: no code, stations or wheel donor); on a first flat raster of the rebuilt
  T-64BV1: "what is this? this looks really bad"; then "i also liked our old t64s that are on main and deployed rn so
  make these new tanks were making fully nnew tnaks"; then "nice yeah lets create a polish t64 variannnt and add it too".
- Consequence: `t64bv1` (T-64BV1) and `t64bv_donbas` (T-64BV mod. 2017) stay exactly as on main (every file of theirs is
  byte-identical to 7d045a7588). The true T-64s are three NEW tanks on one first-party base, named for real variants
  (MilitaryLand, T-64 variants): `t64bm1m` T-64BM1M (Ukraine), `t64bv` T-64BV (USSR), `t64b1v_2022` T-64B1V mod. 2022
  (Ukraine). `t84` and `t84bm_oplot_m` belong to the Oplot lane (untouched); `src/vehicles/ukraine.ts` is untouched too
  (the three register in `src/vehicles/t64FamilySpecs.ts`).
- Implementation: `profiles/t64Foundation.ts` (hull, cast turret, gun, cupola, sights), `t64RunningGear.ts`,
  `t64bm1m.ts`, `t64KontaktFamily.ts`; frame `t64Armor.ts`. See the evidence matrix for receipts.
- Publication: lane branch only; Main integrates release 262.
- Main's rulings (2026-10-28, relaying the owner): every tier approved (T-64BM1M IV 0.577, T-64BV III 0.476, T-64B1V
  mod. 2022 IV 0.571, PT-64 Tur IV 0.570). The source comparison is accepted for each source-backed tank as a
  published-dimension build (the photo/published route; the 42manako print is 6.4 % wide): the T-64BM1M against its
  print, the T-64BV and the T-64B1V mod. 2022 against the T-64 prints, the latter misregistered on main too. The PT-64 Tur
  is a concept (no print). The silhouette dimensions are declared on all four (evidence matrix); re-registering the
  misregistered T-64 prints is a later cleanup, logged in TESTS-OWED and left out of this head.
- Worktree / branch / base: `.claude/worktrees/xenodochial-rubin-4eb6bf`, `item/t64bm1m-262`, origin/main 7d045a7588.

## Scope and preservation

- Mode: independent X (`t64bm1m`) plus two new Kontakt-1 variants on its base.
- Variant matrix:

| ID | Configuration | Own deltas on the T-64 base | Source support |
|---|---|---|---|
| `t64bm1m` | T-64B1 with Nizh, 6TD-1, KT-12.7 (Kharkiv, 2014 Congo order / National Guard) | Nizh glacis (2 x 10), five wedge Nizh blocks a side round the turret face, two rows of crown plates, five Nizh side screens a side, the open rear basket, 902B 4 + 4 on both flanks, L-2G searchlight | 42manako print; Oryx 2021; Army Recognition 2014; MilitaryLand |
| `t64bv` | T-64BV (Soviet, T-64B line, Kontakt-1) | dense K-1 (five glacis courses, a 3 x 12 skirt grid a side, an upright collar and tilted tier round the turret, a roof row), blade, 902B on the left, L-2G, rear box with OPVT, sensor, rack and pack, two drums on the rear plate | Alan Wilson, "T-64BV - Patriot Museum, Kubinka" (CC BY-SA 2.0); 42manako T-64BV1 print |
| `t64b1v_2022` | T-64B1V mod. 2022 (Ukraine): "updated radio, navigation and communication systems, identifiable by a gunner shield and slat armor" (MilitaryLand) | the same dense K-1, no IR light, the night-sight box, digital radio whips and satnav puck, a shielded NSVT, slat screens round the turret rear and the engine compartment | MilitaryLand; VoidWanderer, "T-64BV mod 2017, Kyiv 2021, 16" (CC BY-SA 4.0); the T-64BV Donbas print |

- `pt64_tur` PT-64 Tur (Poland, concept): Poland never fielded the T-64 (the USSR kept it for its own units), so the Tur
  is a first-party what-if, a T-64B1 through Bumar-Łabędy's PT-91 Twardy programme, in the fleet's Polish "Krata"
  language (`polandFrontEra.ts`, the Zubr family): framed ERAWA-2 grids (cassettes 3 cm down in 9 cm welded frames) on
  the glacis (two 4 x 4 fields), two welded cheek boxes a side (3 x 2 each, 17-80 deg, the pair a faceted prow) and the
  leading third of each skirt (2 x 5); the Tellur 81 mm launchers (the PT-91's 2 x 12, one 2 x 6 bank a side), four
  Obra-3 heads, a Drawa-T thermal head, the remote 12.7 mm (WKM-B, Poland's NSV development), a rear stowage box, drums
  and the log; the 5TDFM (850 hp, the T-64BM Bulat's), 45.5 t, Mesko's Pronit APFSDS-T; the Polish three-tone the Zubr
  wears. Owner-authored design record `docs/references/concepts/pt64-tur-20261027.json` (no source print; the release
  gate reads it through `tools/first-party-concept-policy.mjs`).
- Preserved: `t64bv1`, `t64bv_donbas` (main's T-72B3-study builds, their rows, icons, hero cards and receipts).

## Source and comparison contract

- Raw path: `~/cot-lanes/new-tank-refs-262/t-64bm1m.glb`; local registered copy (gitignored)
  `public/models/community-candidates/t64bm1m_42manako.glb` (md5 8e883e6ee23779c4fe02065dee077ea0).
- Raw SHA-256 `c62063d8507a993c4af59cba25cac4cc4995572a859e98c9fc21423fe4c80dfe`, binary glTF, 4,679,284 bytes.
- Credit: "T-64BM1M" by 42manako (Sketchfab), CC-BY-NC-4.0. Measurement oracle only: nothing from it ships
  (docs/ATTRIBUTION.md; NOTICE.md). Every playable part is first-party (Kevin B. Liu, `src/authorship.ts`).
- Inventory (`tools/source-x-oracle.mjs --inspect`): 139 meshes, 16,203 triangles, metres, +X bow, +Y up, +Z the
  vehicle's right; named owners (hull001 > turret001 > mount001 > weapon001), so turret/gun ownership is genuine.
- Source limitations: a game-mod kitbash (the turret rear cage is `slat3002_t-90am-turret`); duplicate meshes
  (`object02`/`object02001`, `wheel17..22`/`wheel17001..22001`, `suporte`/`suporte001`); two stray two-triangle planes
  float 5.7 m up (`gear1-optione002/003`); three return rollers a side; low poly throughout.
- Frame: game = (-zs, ys + 0.0095, xs) (rotY -90 deg, det +1), uniform scale 1. Fidelity registration:
  `tools/procedural-fidelity.html` legacy width-normalised GLB entry (turret001 / mount001, root-level horseshoe,
  searchlight, smoke, rack and stores as turret followers).

### Published dimensions versus the print versus the build

| Datum | Published | Print (scale 1) | Build |
|---|---|---|---|
| Hull length | 6.54 m (T-64B) | 6.55 m | 6.55 m (rear plate -3.212 to the bow mudguard lip 3.17) |
| Width over tracks / track gauge | 3.27 m / 2.73 m (cyclowiki T-64 TTX) | 3.48 m / 2.93 m | 3.27 m / 2.73 m |
| Track width / pitch / links | 540 mm / 164 mm / 78-79 (Kharkiv MicroCAD 2017, s3_66) | 556 mm | 540 mm / 164 mm |
| Width over skirts / Nizh screens | 3.415 m (T-64B) / 3.61 m (BM1M, forum) | 3.64 m / 3.83 m | 3.42 m / 3.61 m |
| Turret roof | 2.17 m | 2.28-2.32 m | 2.19 m |
| Road wheel | 550 mm (T-64 descriptions) | 603 mm | 560 mm |
| Return rollers | four a side (every published description) | three a side | four a side |
| Overall length | 9.225 m (forum) | 9.40 m | 9.225 m (muzzle z 5.85) |

**Conflict (recorded, not hidden):** the print is ~6.4 % wide and ~6 % tall against the published figures while its
hull length matches. One uniform scale cannot reconcile it. The build follows the published figures (lateral 0.933 of
the print, heights 0.96, the turret 0.96 about its ring, the hull length kept), so after the fidelity page's width
normalisation the print reads ~6 % short in the side and plan views against the build. That residual is the print's,
not a build defect, and is reported with the gate results. **Ruling (Main, 2026-10-28):** accepted as published-dimension
builds; the prints' re-registration is a later cleanup. **Ruling (Main, 2026-10-31):** the three prints are
deregistered (none is the reference these builds follow); t64bm1m, t64bv and t64b1v_2022 pass stage A through their
photo packet (`docs/references/photos/t64-20261031.json`, `tools/photo-reference-policy.mjs`). The T-64BV1 and Donbas
prints stay registered for t64bv1 and t64bv_donbas. This closes the 10-28 cleanup.

### Photographs read (citations; none embedded in the repo)

- Oryx, "Welcome to the Jungle: Ukrainian T-64B1Ms" (2021): the Kharkiv line-up of T-64B1Ms (1410525613_ta.jpg) and
  Congolese crews (1742472_900.jpg): Nizh on the turret, the side screens and the crown; the turret bustle; no GLATGM.
- Army Recognition, 31 July 2014: "New modernized main battle tank T-64B1M for the Ukrainian National Guard".
- MilitaryLand, T-64 (2025): veh_t64b1m.jpg (in service): 902B on the rear flank, the rear rack, the side screens.
- Wikimedia Commons: VictorAnyakin "T-64B wheels and track", "T-64B forward wheels suspension", "T-64B rear"
  (CC BY-SA 4.0, 2015); Alan Wilson "T-64B1 - Patriot Museum, Kubinka" (CC BY-SA 2.0, 2017); VoidWanderer
  "T-64BV mod 2017, Kyiv 2021, 16" (CC BY-SA 4.0).

### Where the print and the photographs disagree

- Return rollers: print three a side; photographs and every description four (built four).
- The rear turret cage is a T-90AM slat kitbash in the print; the photographs show a stowage bustle in a bar rack
  (built the bustle and rack).
- Glacis: the print carries 22 Nizh cells in two courses; the clearest photograph (MilitaryLand, snow) reads a plainer
  glacis. Kept the print's two courses (20 cells, clear of the headlights) as the Kharkiv line-up shows boxes there.
- Proportions: see the conflict above.

### Specification sources and conflicts

- Engine: 6TD (MilitaryLand: "Modernization of T-64B1 with 6TD engine and Nizh"), 1,000 hp 6TD (Army Recognition), a
  1,200 hp 6TD-2 (War Thunder forum, weak). Spec: 6TD-1, 1,000 hp, 45 t, 65 km/h.
- Armament: 125 mm 2A46M-1, no gun-launched missile (Oryx); 1A33 FCS retained on some (forum). Rounds: 3BM42 Mango
  APFSDS, 3BK29 HEAT, 3OF26 HE-Frag (names; values are the fleet's tier-IV balance, see Balance).
- Sights: TPN1-49-23 gunner's night sight, TKN-3V commander's (forum). **The brief's "new sights, 2020s upgrade" and
  "2023 Malyshev/KMDB images" found no support**: every source dates the BM1M to the 2013-2016 Congo/National Guard
  programme, and no 2020s BM1M modernisation was found. Not invented.
- Crew 3; autoloader carousel (6ETs10 class): internal layout `sovietMz`.

## Construction work order (as built)

- Gross form: a long, low hull under a 64-degree glacis and a 2 cm nose bar, deck 1.40 m, the deck stepping straight
  back over the transverse engine to a louvred exhaust across the rear plate; deck-height fenders running into big bow
  mudguards rolled round the idler; six small dual road wheels and four return rollers under rubber skirts; a low
  egg-plan cast turret whose cheeks swell over the ring at mid height and whose crown rises from the gun (y 1.78) to
  the hatches (2.19).
- Running gear (`t64RunningGear.ts`): stations 1.947 / 1.175 / 0.271 / -0.484 / -1.302 / -2.144, r 0.28, centre y
  0.335, gauge 2.73, track 0.54 x 0.164 pitch; rollers r 0.10 at z 1.66 / 0.54 / -0.58 / -1.70, y 0.925; idler
  (2.793, 0.73, r 0.29); sprocket (-2.723, 0.68, r 0.317). Own wheel construction (`t64-steel-tyred-dual`, the T-64
  family's nation-wheel donor): steel-tyred halves, the internal rubber ring, twelve dimples, six-bolt hub.
- Turret stations: 28 transverse rings from the print's plan rays and crown map (`DOME`), cheek line y 0.187, crown
  exponent 0.65; `t64DomeHeight` / `t64DomeContains` seat every fitting and reactive cassette on the casting.
- Swept-volume rule: nothing on the deck or shelves rises into the turret's sweep (Nizh blocks from y 1.50, racks
  from y 1.55).

## Evidence matrix

Use PASS / FAIL / NOT RUN / BLOCKED / NOT APPLICABLE (reason). Filled as the lane runs.

| Gate | Status | Revision | Command / artifact | Result |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | ca57b0c7ad | source-x-oracle --inspect; md5 above | 139 meshes, frame above |
| Every registered silhouette / raw aggregate | ACCEPTED (Main 2026-10-28: published-dimension builds) | 08c74305bb | procedural-fidelity --check --board (release try 4) | BM1M 86.0 (whole 87.5, hull 84.2, turret 78.9, gun 92.9, tracks 92.5; views 84-94), mod. 2022 85.2 (turret 73.0), T-64BV 84.3 (fused print: whole 83.7, tracks 87.0); floor 90. Geometry gate: BM1M side/plan 57-74, front 0-4; T-64BV 78.2; mod. 2022 near 0 on its misregistered print (main's mod. 2017: 24.9; T-64BV1: 89.5). The builds follow published dimensions and photographs, not the 6.4 %-wide prints (the BM1M turret is the print's x0.96 about its ring). Ruling: accepted on the photo/published route for all three source-backed ids; re-registering the T-64 prints is a later cleanup (TESTS-OWED). The Tur is a concept: N/A |
| Geometry components / dimension score / 3% check | BM1M PASS; T-64BV, mod. 2022 width-scaled (owed) | this commit | geometry-gate dims rows; `.qa-dev/t64bm1m/silhouette.mjs` | Silhouettes declared (`T64_SILHOUETTE_DIMS`, the gate's rule on each build): height / body length / lit length BM1M 2.788 / 6.557 / 9.405, T-64BV 2.790 / 6.868 / 9.689, mod. 2022 2.819 / 6.774 / 9.410, Tur 2.790 / 6.868 / 9.689 m. Against try 4 the BM1M rows read 0.03-0.07 % (dims 100). The gate scales each build so its box width equals `widthM` before measuring: the T-64BV (3.415 published, over bare skirts) and the mod. 2022 (3.72, carried unsourced from the old mod. 2017 frame) both measure 3.536 m over their Kontakt-1, so the gate scales them 0.966 and 1.052 and every row reads 3.4 % and 4-6 % off. Owed: restate their `widthM` to the build (a combat-frame change: armour fit, contacts, anatomy, dossiers, icon metadata) |
| Independent critic / actual Gallery | PASS (3 rounds) | 65f5be85c4, f3cf753a33 | blind critics (Agent) on rasters | critic 2: BM1M 4-5/10, mod. 2022 5-6/10 -> fixed (R4/R5); critic 3: Tur 6/10 -> fixed (T3); shaded studio renders r2/r3 |
| Winding, closure and intentional negative space | PASS | 08c74305bb | tank-sealed-check --gate; standard-check B2 | sealed 4/4; contiguity 4/4 after the stern shroud and the mod. 2022's cage moves |
| Gun clearance over its own turret (tube ahead of the mask, -6/0/+14 deg, rod negative control) | PASS | 1298ed5bb2 | `node src/vehicles/profiles/t64GunClearance.selftest.mjs` | all four ids |
| Gun over its hull at every yaw on the published curve | PASS | 53961fea79 | `GUN_CLEARANCE_IDS=... node src/vehicles/nationalGunClearance.selftest.mjs` | 4 curves keep 25 mm at every yaw and legal pitch; each bare depression meets the hull (293 s) |
| Depression curves | measured | b4d1e58854 | `tools/gun-depression-sweep.mjs` (26 mm) | -6 ahead/abeam; -4.4 over the mudguard crowns (19-41); +2.7 over the rear-quarter shelf tanks; -2.8 (-2.1 mod. 2022) astern; no mount conflicts |
| Gun barrel alignment | PASS | 65f5be85c4 | gun-barrel-align-census --gate | 0 mm offset, 0 deg, all aligned (no rig rows) |
| Running gear / turret datum receipt | PASS | 1198a46a48 | `node src/vehicles/profiles/t64Foundation.selftest.mjs` | six wheels, four rollers a side, T64_FRAME = T64_DATUMS, all four ids |
| Physical seats and yaw/pitch/recoil ownership | PASS | 53961fea79 | gen-mission-attachment-seats --check | 4/4 PASS |
| Spare track | PASS | 53961fea79 | spare-track-placement-check --update/--check | 4 rows, 0 problems |
| High/low gear motion / strict band+shoe / duplicates | see chain4 / OWED | | track-duplicate-audit; track-clip-audit (release check) | |
| Triangles | measured | | Node build | HIGH: BM1M 119.5k, T-64BV 121.0k, mod. 2022 122.9k, Tur 123.8k |
| Anatomy update / freshness | PASS | 53961fea79 | gen-combat-anatomy to its fixpoint, --check | first sim floors accepted; fills, markings, controls, seats, spare checks PASS |
| Fleet-geometry ledger / gun lines | PASS | 53961fea79 | fleet-geometry-ledger --update; gun-junction-census --update | 4 rows each |
| Generated tables touch only the new ids | PASS | 53961fea79 | decoded diff against main | every modified table differs from main only in the four new ids (row order moved in the Polish groups) |
| Bundle | over by bytes | 1198a46a48 | npm run build; bundle-budget --check | requests within pins; game/cn +5.9 KB raw, +1.46 KB br, entry +50 B; gallery +5.9 KB, +1.39 KB br (the four tanks' boot data): the integrator's re-pin |
| Owner sheets | PASS | 05df1c1339 | `.qa-dev/t64bm1m/compose-t64-sheets.mjs` over studio renders r2/r3/r4 | `~/cot-launch-state/streams/owner-shots/t64bm1m-262-{front34,side,top,turret,rear34,front,line}.png`: each new tank beside its print (BM1M), its kept sibling (T-64BV, mod. 2022) or the Zubr (Tur), and a cited photograph; the line sheet puts the kept pair above the four new tanks |
| Module/visual alignment (volume) | red, as on main | 05df1c1339 | module-visual-align-probe --gate | volume-out +0.90 on all four; main's t72b3, t64bv1 (+0.89) and t80u (+0.87) read the same (turret-basket crew below the turret plates' envelope): the probe's rule |
| Composed release (lane) | FAIL on source comparison only | 08c74305bb | tank:release:check --gate --lane, try 4 (6 h capture wait) | scoring: geometry gate and procedural-fidelity below 90 (row above); every other stage PASS: concept proof (Tur), track clip 4/4, contiguity 4/4 (after a003005349 and 6786816cd4), decor 4/4, sealed 4/4 (0 open, 0 see-through px in 33 views). The fleet-probe stage was run by hand (chain4): all PASS but module-visual-align, red as on main |
| Typecheck / attribution | PASS | f3cf753a33 | node tools/typecheck.mjs; npm run attribution:check | TypeScript 7 clean, oxlint clean; attribution: 225 playable models name Kevin B. Liu, 18,485 tracked files covered |
## Balance

Capability score (RETIER-257 formula recomputed on this tree: 0.35 stats + 0.25 generation + 0.20 era + 0.20 x the
251 tier): T-64BM1M 0.548 (tier IV band 0.502-0.600, median 0.575); T-64BV1 0.476 (III); T-64BV mod. 2017 0.571 (IV).
Proposed: T-64BM1M at IV beside the mod. 2017 (Ukraine tree, `soviet` line, parent `t64bv_donbas`), with the Soviet
fire-control floor and the 259 tier-IV footing its sibling takes (mantlet x1.45, pen 780/709/639, 6.2 s).
**Owner approval (2026-10-27, via Main): "wow great job. all apporoved."** T-64BV1 III, T-64BV mod. 2017 IV, T-64BM1M IV.
After the new-ids ruling the kept pair hold those tiers and the new ids take their twins': `t64bv` 0.476 (III, the
T-64BV1's record), `t64b1v_2022` 0.571 (IV, the mod. 2017's record plus slat weight), `t64bm1m` 0.548 (IV); Main told.

Tech tree (`techTree.selftest` pin e04449d58efb4a62, 13 trees, 224 vehicles): the layout receipt allows one clean
placement each. Russia: `t64bv` tier 3, `t80` line, lane 8, parent `t62_1975` (a sibling of the T-64BV1: any lane under
`t64bv1` sits on its connector to the T-80). Ukraine: `t64bv_donbas` -> `t64b1v_2022` (lane 1) -> `t64bm1m` (lane 0),
the deepest modernisation last (lanes 3+ sit on the Donbas -> M2A3 run). FAMILY_UPGRADES: `t64bv1` -> `t64bv`,
`t64bv1` -> `t64bm1m`, `t64bv_donbas` -> `t64b1v_2022`. The PT-64 Tur scores 0.570 (IV; PT-91M 0.577, mod. 2017
0.572), Poland tree `pt91_side` lane 1 under the T-72M1 Jaguar (lanes 1 and 4+ draw cleanly), the mod. 2017's tier-IV
footing; Main told before READY.

Fairness (`.qa-dev/t64bm1m/fairness.mjs`, the balance-range round robin against every shown-tier gun tank, six seeds,
120 m): T-64BM1M 0.639 (10/12 inside 0.2-0.8; Leopard 2A3 1.0, Chieftain Mk 10 0.917), T-64BV 0.596 at III (9/13;
MBT-70 0, Centurion 5/2 0.833, T-72B 1987 1.0, AMX-40 0.833), T-64B1V mod. 2022 0.667 (10/12).

## Round log

- R1 (ca57b0c7ad): base, BM1M and (then) the T-64BV pair build in Node; first rasters read as a T-64.
- R2: bow mudguards take a turned-down lip; whips 1.55 m; drums behind the rear plate; fender boxes and racks moved out
  of the turret's swept volume.
- Owner on the R2 raster of the rebuilt T-64BV1: "what is this? this looks really bad". Read against the Kubinka T-64BV
  photograph: the Kontakt-1 was far too sparse, the bow mudguards were wire arcs, the hull side a slab.
- Blind critic 1 (BM1M, R1/R2 rasters): hull and running gear read as a T-64; the turret did not (a "fluted lampshade"
  of thin Nizh panels, a closed box bustle, a stalk-mounted NSVT, shelf boxes breaking the glacis line).
- Owner: "make these new tanks were making fully nnew tnaks": the old pair restored; T-64BV and T-64B1V mod. 2022 become
  new ids (1360e5b4f1). Dense Kontakt-1 per the photographs; BM1M wedge blocks and an open basket; deep mudguard flaps;
  no shelf boxes ahead of the turret; the Utyos housing; a tapered mask.
- Defect found and fixed: the eager tool factory (`profiledProcedurals.ts`) lists the Russia keys explicitly, so tools
  built `t64bv` with its donor's (the old T-64BV1's) builder; the key is appended (its R3 rasters were the old tank).
- Blind critic 2 (R3 rasters): BM1M 4-5/10 (turret weakest: the Nizh still a ring of separate tiles, the roof tiles
  scattered, the basket a tall hoop, the smoke banks lost), T-64B1V mod. 2022 5-6/10 (glacis Kontakt-1 a waffle in the
  centre, not the photographs' edge-to-edge shingle courses). R4/R5: the BM1M prow continuous and thick (five blocks edge
  to edge, 0.36-0.46 m deep), the crown slab contiguous, the glacis slab full width (headlights to the bow mudguards),
  the basket a low flat-bar box 0.40 m out, the 902B rows on the last block; the Kontakt-1 glacis in four stepped
  shingle courses edge to edge with the last over the nose; the NSVT's housing encloses its column.
- PT-64 Tur T1/T2: blind critic 3 (6/10: reads as a T-64, the framed glacis "the right Polish idea"): the turret front
  too wide (2.9 m), the frame bars read as engraved lines, the smoke "a loose heap", three warning heads, the skirt grid
  short of the fender. T3: the flank box ends at 80 deg and 0.12 m deep, bars 9 cm proud over cassettes 6 cm, one
  bracketed 2 x 6 Tellur bank a side splayed out of the bore and raised 18 deg, four Obra-3 heads, the skirt grid from
  the skirt's front edge. Its "bright strip between fender and skirt" is the flat rasterizer's back-face cull (the
  shaded studio renders of the same base show the shelf closed).
- Depression sweeps (first pass, 18:11-19:35, all three agree, so the base): -3.84 deg straight ahead (the driver's
  TNPO block stood 10.5 cm proud right under the bore), -0.7 to -1.8 at 22-32 deg (the mudguard headlights on the roll's
  crown), +2.7 over the rear quarter (the right shelf's fuel tanks and the left's SPTA boxes, 0.19-0.21 m: kept, the
  T-64's own rear-quarter stop). Fixed in the base: the TNPO head 5 cm over the plate, the splash board 9 cm, the
  headlights 35 deg down the mudguard roll. Probe after the fix (`.qa-dev/t64bm1m/gunprobe.mjs`, -6 deg): 26.3 mm at
  yaw 0, 35.9 mm at 5-15; at 20-35 the bow mudguard's crown meets the jacket (a front-corner stop, kept). Re-swept.
- Dims (Main, 2026-10-28): the silhouettes are declared in `t64Armor.ts` (`T64_SILHOUETTE_DIMS`, applied after the frame
  strips the donor's), measured in Node with the gate's own rule (`.qa-dev/t64bm1m/silhouette.mjs`; on the BM1M, which
  the gate measures unscaled, the Node and gate numbers agree within 2 mm on height and length, 6 mm on the lit length).
  The anatomy, marking-seat, controls, mission-seat, spare-track, fleet-geometry-ledger and fills checks all PASS on the
  four ids (no generated row moves); `npm run typecheck` clean (the gun-curve record now carries the spec's pair type).
