# T-64BM1M and the true T-64 base — run packet

Template: [run packet](../../tank-generation/templates/run-packet.md). Route: "New tank from this GLB; name it X" for
`t64bm1m`, then "Do the whole family" for the T-64s rebuilt on its base (`t64bv1`, `t64bv_donbas`).

## Current status

- Updated: 2026-10-27 (lane item/t64bm1m-262, release 262).
- Owner requests (2026-10-27): via Main, verbatim, "add these new tanks using our rigoorous tank generation workflow" and
  "the t64 bm1m should be designed from scratchh as well and serve as inspiratin to properly update our t64s which are
  not based onn t64s rn"; to this lane, on the release-233 `profiles/t64bvX.ts` (a0711ff866): "that true t64 build is bad
  and i dont wnat u tgo use it" (not used: no code, stations or wheel donor); on a first flat raster of the rebuilt
  T-64BV1: "what is this? this looks really bad"; then "i also liked our old t64s that are on main and deployed rn so
  make these new tanks were making fully nnew tnaks".
- Consequence: `t64bv1` (T-64BV1) and `t64bv_donbas` (T-64BV mod. 2017) stay exactly as on main (every file of theirs is
  byte-identical to 7d045a7588). The true T-64s are three NEW tanks on one first-party base, named for real variants
  (MilitaryLand, T-64 variants): `t64bm1m` T-64BM1M (Ukraine), `t64bv` T-64BV (USSR), `t64b1v_2022` T-64B1V mod. 2022
  (Ukraine). `t84` and `t84bm_oplot_m` belong to the Oplot lane (untouched); `src/vehicles/ukraine.ts` is untouched too
  (the three register in `src/vehicles/t64FamilySpecs.ts`).
- Implementation: `profiles/t64Foundation.ts` (hull, cast turret, gun, cupola, sights), `t64RunningGear.ts`,
  `t64bm1m.ts`, `t64KontaktFamily.ts`; frame `t64Armor.ts`. See the evidence matrix for receipts.
- Publication: lane branch only; Main integrates release 262.
- Worktree / branch / base: `.claude/worktrees/xenodochial-rubin-4eb6bf`, `item/t64bm1m-262`, origin/main 7d045a7588.

## Scope and preservation

- Mode: independent X (`t64bm1m`) plus two new Kontakt-1 variants on its base.
- Variant matrix:

| ID | Configuration | Own deltas on the T-64 base | Source support |
|---|---|---|---|
| `t64bm1m` | T-64B1 with Nizh, 6TD-1, KT-12.7 (Kharkiv, 2014 Congo order / National Guard) | Nizh glacis (2 x 10), five wedge Nizh blocks a side round the turret face, two rows of crown plates, five Nizh side screens a side, the open rear basket, 902B 4 + 4 on both flanks, L-2G searchlight | 42manako print; Oryx 2021; Army Recognition 2014; MilitaryLand |
| `t64bv` | T-64BV (Soviet, T-64B line, Kontakt-1) | dense K-1 (five glacis courses, a 3 x 12 skirt grid a side, an upright collar and tilted tier round the turret, a roof row), blade, 902B on the left, L-2G, rear box with OPVT, sensor, rack and pack, two drums on the rear plate | Alan Wilson, "T-64BV - Patriot Museum, Kubinka" (CC BY-SA 2.0); 42manako T-64BV1 print |
| `t64b1v_2022` | T-64B1V mod. 2022 (Ukraine): "updated radio, navigation and communication systems, identifiable by a gunner shield and slat armor" (MilitaryLand) | the same dense K-1, no IR light, the night-sight box, digital radio whips and satnav puck, a shielded NSVT, slat screens round the turret rear and the engine compartment | MilitaryLand; VoidWanderer, "T-64BV mod 2017, Kyiv 2021, 16" (CC BY-SA 4.0); the T-64BV Donbas print |

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
not a build defect, and is reported with the gate results.

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
| Every registered silhouette / raw aggregate | NOT RUN | | procedural-fidelity / geometry-gate | |
| Geometry components / dimension score / 3% check | NOT RUN | | geometry-gate | |
| Independent critic / actual Gallery | NOT RUN | | blind critics (Agent) | |
| Winding, closure and intentional negative space | NOT RUN | | tank-sealed-check | |
| Gun clearance over its own turret (tube ahead of the mask, -6/0/+14 deg, rod negative control) | PASS | WIP | `node src/vehicles/profiles/t64GunClearance.selftest.mjs` | 16.9-21.2 cm (BM1M 16.9 cm from the Nizh) |
| Running gear / turret datum receipt | PASS | WIP | `node src/vehicles/profiles/t64RunningGearTurretCenter.selftest.mjs` | six wheels, four rollers a side, all three |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | track-clip-audit, track-duplicate-audit | |
| Return rollers / track thickness / chassis closure | NOT RUN | | wheel-review | |
| Triangles | measured | | Node build | HIGH 119.5k (BM1M), 124.4k (mod. 2017) before LOW |
| Live/spent/reset ERA / permanent backing | NOT RUN | | | |
| Anatomy update / freshness | NOT RUN | | tank:anatomy:update / check | |
| Composed release (lane) | NOT RUN | | tank:release:check --ids --gate --lane | |
| Typecheck / attribution | NOT RUN | | | |

## Balance

Capability score (RETIER-257 formula recomputed on this tree: 0.35 stats + 0.25 generation + 0.20 era + 0.20 x the
251 tier): T-64BM1M 0.548 (tier IV band 0.502-0.600, median 0.575); T-64BV1 0.476 (III); T-64BV mod. 2017 0.571 (IV).
Proposed: T-64BM1M at IV beside the mod. 2017 (Ukraine tree, `soviet` line, parent `t64bv_donbas`), with the Soviet
fire-control floor and the 259 tier-IV footing its sibling takes (mantlet x1.45, pen 780/709/639, 6.2 s).
**Owner approval (2026-10-27, via Main): "wow great job. all apporoved."** T-64BV1 III, T-64BV mod. 2017 IV, T-64BM1M IV
(parent `t64bv_donbas`, FAMILY_UPGRADES `t64bv1` -> `t64bm1m`).

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
