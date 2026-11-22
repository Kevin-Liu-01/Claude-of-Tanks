# Object 292 — run packet

## Current status

- Updated: 2026-11-04. Lane item/russia-152 (batch contract: docs/history/research/russia-152-269.md).
- Owner request: "object 292 for a full line of 152 mm variant tanks" (2026-11-04); superseding the same day: "use our proper
  tank generation procedure and dont use the old t80 hull only use modern new hulls like the nnew t80 x hulll".
- ID and display name: object292, "Object 292" (Obj. 292); tier VII (Main 2026-11-04), USSR, modern, prototype.
- Implementation status: rebuilt on the T-80U X hull and casting (profiles/object292X.ts); the legacy-builder build
  (profiles/object292.ts on profiles/t80.ts) is removed and t80.ts restored to its base bytes.
- Qualification status: photo-class (docs/references/photos/russia-152-20261104.json, fixture
  src/vehicles/profiles/russia152.selftest.mjs). The round audits, the anatomy update and the release gate are owed on the
  X rebuild (evidence matrix).
- Publication status / exact authority: lane branch only; Main integrates. No deploy.
- Worktree / branch / baseline commit: ~/cot-lanes/russia-152, item/russia-152, base f98c38c63c (the 269 audio stack).
- Current next action: its own depression curve from the sweep, the regeneration chain and the release gate.
- Blocking choices / known failures: none open; the critics' residual likeness notes are in the round log.

## Scope and preservation

- Mode: derivative by recipe reuse ("Make Mk10 based on Mk5 X"): the T-80U X construction functions at their own datums,
  no second whole tank stacked; the Object 292's own box, cheek blocks, hood, roof kit, glacis fit and LP-83.
- Owned files: profiles/object292X.ts, the object292 rows of russia152Specs.ts, russia152Frames.ts (OBJECT292_FRAME), the
  packet target. profiles/t80uX.ts gains exports only (buildT80UXHullBase, buildT80UXCasting, T80U_X_YAW,
  T80U_X_TRUNNION): t80u, t80uk, t72_rys and every build on buildT80UXHull keep their bytes (mesh digest, the READY).
- Protected original IDs: t80u and the whole T-80 family (t80, t80b, t80bv, t80u, t80uk, t80u_kursk, ua_t80bv, ...): high
  and low digests of the base and lane trees.
- Explicitly excluded: the LP-83's loading mechanism (never fitted), the coaxial PKT (not fitted), any ERA bricks.
- Variant matrix: object292 = T-80U X hull base (hull, rubber bow apron, rubber skirts, fenders, running gear, engine deck
  with the empty drum cradles) + the T-80BV pattern's Kontakt-1 studs (no bricks), headlights and splash strip on its
  glacis + the T-80U X casting + the welded box (body as wide as the casting, bustle over the engine deck), the raked
  steel cheek blocks in a V, the hood over the gun's root, cupola right, gunner's sight box left + the LP-83. Uncertainty:
  the hull's T-80BV-v-T-80U differences (sources split: GlobalSecurity T-80BV, andrei-bt T-80U); the X hull's measured
  T-80U glacis and apron match the Kubinka photographs.

## Source and comparison contract

- Actual raw path / archive member: NOT APPLICABLE (photographic target; no supplied model).
- Raw SHA-256 / format / size: NOT APPLICABLE (no supplied file); photographs hashed in the evidence folder
  (~/cot-lanes/russia-152-evidence/refs/object292: Commons Object_292_1-4 by Kuzmin, Wilson Kubinka 2017).
- Source credits: Wikimedia Commons (Kuzmin; Wilson), CC licences recorded in the photo packet's sources.
- Approved target: the real vehicle as Kubinka keeps it.
- Owner decisions with dates: 2026-11-04 (the line); 2026-11-04 (the X hull, the procedure).
- Canonical oracle path and SHA-256: NOT APPLICABLE (photo route; a registered oracle would refuse the packet).
- Signed axis transform / handedness / uniform scale / translation: NOT APPLICABLE (no source mesh).
- Datums: the T-80U X's own (profiles/t80uX.ts): ground 0, hull 6.72 m (stern to -3.525 at the drum cradles), 3.60 m
  over the fenders, the casting's ring at y 1.6166 (1.55158 + the 0.065 raised race), z 0.0719; the trunnion at y 1.8214,
  z 1.4199 (the casting's own embrasure); the LP-83's muzzle at z 6.86 (3.5 m past the nose, the Kubinka photographs); the
  box's roof 0.74 m over the ring (2.36 m), flush with the casting's crown.
- Published dimensions versus native: published (infoboxes, unsourced) 3.525 m wide, 2.193 m high, 46 t; native 3.60 m
  (the T-80U X fenders, 3.622 m over the rubber skirts), 10.385 m over the gun (no length published), box roof 2.36 m,
  whip tip 3.786 m.
- Unresolved conflicts: none blocking.

## Construction work order

- Gross form: a T-80U X hull with a T-80BV-pattern glacis under a T-80U casting carrying a tall flat-sided welded box.
- Hull, glacis, skirts: buildT80UXHullBase (no Kontakt-5); 4 x 7 stud pairs along the glacis normal (the hull core's
  stations), headlights in guards at z 2.62, the splash strip at z 2.40.
- Turret: buildT80UXCasting; the box (prism stations z -2.22..0.58, half-width 1.22-1.42, floor 0.06-0.34, roof 0.74); the
  hood (z 0.45-1.12, half-width 0.50-0.40, roof 0.74-0.60); the square steel cheek boxes (0.86 x 0.46 x 0.55, yawed 0.45 rad
  from x 0.40 z 1.20) with seam strips and lifting eyes.
- Running gear: the T-80U X's measured six wheels, three return rollers a side, the Russian X track standard.
- Primitives: the T-80U X recipes, sectionSolid prisms, KIT boxes and cylinders; the LP-83 from profiles/gun152.ts inside
  the T-80U X's own trunnion block (cylX round the pitch axis: its envelope holds at every pitch).
- Budget: 98,031 triangles at high (the sealed check; the T-80U X 98,418).
- Material roles: hull/turret body paint; rubber apron and skirts (the T-80U X's own); glass on the sights.
- Intentional negative spaces: the casting's gun embrasure (x +-0.222).
- Permanent armour: the cheek blocks are turret armour (the x1.35 cheek and mantlet ratings); no ERA.
- Equipment seats: the roof kit stands on the box's roof; the root collar fits inside the embrasure.
- Gameplay plates: the T-80U X hull plates without ERA (the BV's ratings), the box turret's modernArmor plates
  (russia152Specs.ts); depression by yaw: the T-80U X's table until the gate's sweep measures the LP-83's.
- Naming/tier/lazy factory: group russia152; tech tree lane 9 after the T-80U.

## Evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | NOT APPLICABLE (photographic target) | | | |
| Every registered silhouette / raw aggregate | NOT APPLICABLE (no registered oracle) | | | |
| Geometry components / dimension score / 3% check | NOT RUN | X rebuild | node tools/photo-reference-check.mjs --ids=object292 | |
| Independent 14-view critic / actual Gallery | PASS round 4 (3/3 matched, X rebuild); round 5 owed | raster/r8set, r10 | critics/r4/TALLY.md | likeness yes/partly/partly |
| Winding, closure and intentional negative space | PASS (sealed); winding in the gate | round 5 | node tools/tank-sealed-check.mjs --ids=object292 --ledger=docs/geometry-gate/sealed.json (logs/sealed-x.json) | open px 0 in 0/33 views; inside-out 44 px in 0 views; bore masked |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | node tools/turret-parent-audit.mjs --ids=object292 | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | node tools/track-clip-audit.mjs --ids=object292 --exact --strict | |
| Actual return rollers / track thickness / chassis-side closure | NOT RUN (inherits the T-80U X's) | | | |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | 96,630 tris (raster) |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | |
| Live/spent/reset ERA / permanent backing | NOT APPLICABLE (no ERA) | | | |
| Main/aux armor finite rays / modules / crew | NOT RUN | | npm run tank:anatomy:update | |
| Markings, colors, bores, actual roof weapon | NOT RUN | | | packet: 0 roof MGs |
| Original-model/record preservation | NOT RUN (X rebuild) | | scripts/mesh-digest.mjs base v lane | |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | npm run tank:regen:changed -- --ids=... | |
| Composed release / complete tests / typecheck | NOT RUN | | npm run tank:release:check -- --ids=... --gate --lane | |
| Public and private builds / attribution | NOT RUN | | npm run attribution:check | |

## Round log

- Rounds 1-3 (2026-11-04, legacy T-80BV builder): blind critics matched 3/3 each round; likeness "partly": the box too
  narrow over a saucer turret, the cheek blocks small, the hull clean, an upright post at the stern.
- Round 4 (2026-11-04, owner's ruling): rebuilt on the T-80U X hull and casting; the box at the casting's full width with
  near-vertical flanks, the cheek blocks raised in a V, the T-80U X's apron, rubber skirts and empty drum cradles (the
  Kubinka photographs), the commander's cupola moved to the right (the T-80's seating). Renders raster/r8. Next: audits,
  critic round 4.
- Round 4 critics (raster/r8set): matched 3/3, the lineup told apart 3/3 (5/5 confidence on the 292); notes: the cheek
  blocks read as raked fins, the cradle sleeve fat, the skirts over the wheels' tops, no front flaps, sparse studs.
- Round 5 (e70aeb4f09, raster/r9): square steel cheek boxes, the box flush and lower (roof 0.74), a modest sleeve, studs
  across the glacis in eight double columns, Kubinka's deep rubber skirts and front flaps.
- Round 6 (53a7320c33): the gun-depression sweep found the LP-83's 0.24 m recoiling root on the deck (elevation over 8
  degrees at yaw 0-55, every pitch at 132-180): the root slimmed to 0.15 m inside the T-80U X's trunnion block; the 292
  joins nationalGunClearance on its own measured curve.
- Release 272 (owner 2026-11-11: "give the molot and obj 292 actual camos"): stock coat `paint_object292` (Soviet
  Three-Tone Woodland: a pale sand `#968f6b` base under grey-green `#66714f` and near-black `#2b2e2c` bands, `nato`,
  scale 0.45), the three-tone the surviving tank wore at Kubinka before its plain green repaint (the owner's Patriot Park
  photograph, image 7 of 2026-11-05); was `national_ru`, plain green.
- Release 274, lane object292-275 (Kevin 2026-11-21: "we also need to update the object 292 a lot to look more realistic
  and make its turret better and update its rubber sideskirts too", then "fix the turret cheeks and mantlet fully too";
  his look OK on round 3, "Looks good"): a photo round against the five Kubinka photographs and close crops of them.
  - Weight imitators: they are not a wall round the casting but plain welded steel boxes in place of the T-80BV's
    turret Kontakt-1 rack. A wedge box on each front cheek has its big face sloped back about 45 degrees over a short
    upright lip, and stands clear of the mantlet. Behind it, three shallow flat panels a side hang on the casting's
    flank, following its curve and leaning in with it. Their tops sit 0.18 m under the crown, so the dome rises over
    them. The joints between them are open, with the weld seams set back, and the panels carry bolt heads and a bottom
    lip.
  - Mantlet: the reworked casting's tall housing round the trunnions, standing proud of the nose between the cheek
    boxes. It is an elliptic drum across the embrasure, 0.80 m wide, its section 0.28 m high and 0.22 m deep, centred
    7 cm over the pitch axis. Its underside stays 0.21 m under the axis at every pitch, 2.5 cm over the highest deck
    point it sweeps as the turret turns. It has bolted face plates and trunnion caps.
  - Bustle box: its front is a raked wedge from the casting to the roof. The rear module is welded on behind a seam at
    z -1.60: 3 cm wider each side and 3 cm taller, its floor a little lower, with two bolted blow-out panels on its
    roof. The service hatch and the ventilator move onto the forward box. The whip is 3 cm shorter, so its tip holds
    at 3.786 m.
  - Skirts: the T-80 family's shared segmented rubber run (profiles/rubberSkirt.ts, t80-skirts-274) replaces this
    build's own band and nine sheets, and the T-80U X base skirts are off. There are six even sheets and a short one
    at the nose, black rubber, each hung from under the fender lip (x 1.700) to its foot (x 1.735 before the sheet's
    own lean) at 0.50 m. The width over them is 3.65 m (packet 3.622, within 1%).
  - Front flaps: lofted in nine stations across the fender, sagging between their corners with a wavy foot, and
    shorter (foot 0.70 m, was 0.63 m).
  - Gun: unchanged, a plain tube with clamp bands and no fume extractor (every photograph).
  - Not done: the spare track links on the lower rear plate (Kuzmin's rear photograph). The plate is a 44 degree slope
    with tow hooks across it.
  - Blind critic on round 1 (read-only, six views X/Y, key sealed per view): the lane won the cheek blocks and the
    skirts. The critic's front-rake and flap orders were taken. Round 3 then replaced the cheek wall entirely.
  - russia152.selftest: the hull-width clause now lets Kubinka's own skirt run sit up to 8 cm inside the T-80U X's
    leaning sheets or 3 cm outside them.

- object292-cheeks-275 (Kevin 2026-11-22, his two surface markups on the flat rear faces at turret-local z 1.098; his
  look picks from the lane's mockup: cast noses, jammer and laser warner, curved cast shield):
  - Cheeks: the marked faces were the backs of the T-80U X casting's two nose prisms (profiles/t80uX.ts casting(),
    covered by its ERA there, bare here). The 292 now builds without them (buildT80UXCasting cheekNoses false) and lofts
    its own cast noses from the shell's own section (T80U_X_CAST_ROWS): from 18 cm inside the shell at 4 mm in, out of
    its end at z 1.108, narrowing and dropping to a rounded nose at z 1.48, the inner walls at x 0.44 either side of the
    mantlet, the foot rising 3 cm off the deck the turret sweeps. A CPU ray probe sees 0.112 m2 of the old flat backs
    and none after. The welded wedge boxes stay on the noses.
  - Sensors: the fleet's shared Shtora-1 OTShU jammer pair (profiles/shtora.ts, the T-84's: armoured box, red lens
    in its rim, lid), each on a two-leg bolted bracket on its nose ahead of the wedge box, with a laser-warning head on
    its outboard rear corner. The Kubinka tank carried no Shtora: this is Kevin's ask, not the photographs.
  - Smoke: the T-80BV's eight 902B Tucha tubes, four a side on the casting's upper flank behind the wedge boxes
    (z 0.40-0.64), raked up and out on brackets over a rail and marked as smoke sockets, so the salvo is the eight
    drawn (it was the decor's generic pair of eight; the fleet's drawn-smoke rule, decorations.ts drawsOwnSmoke, keeps
    the pair off a build with marked tubes). The Kubinka photographs show none (the
    launchers are off, as on most museum pieces); the smoke-salvo lane asked for the BV's.
  - Mantlet: a cast shield whose face is a cylinder (r 0.31 m) about the trunnion axis, 0.82 m wide with chamfered
    ends, so it keeps an even gap to the noses at every pitch; trunnion caps with bolt rings, the centre insert's weld
    seams, a brow lip, the coax port to the gun's right and the auxiliary sight aperture under a hood to its left. Its
    underside stays 0.203 m under the axis from -5 to +15 degrees.
  - Gun assembly: a bolted cradle flange where the barrel enters the shield, the recoil housing (the old root drum's
    envelope, underside 0.175 m under the bore) with two clamp bands and a guide key, then the step and cone to the
    thermal sleeve. The published depression curve stays (a fresh sweep at 26 mm is at or deeper than it everywhere).
- Camo (object292-cheeks-275, Kevin 2026-11-22: "russian woodland type camo suits obj 292 much better too"): stock in the shared Russian Woodland (paint_ru_t80u_modern, the T-80U Bars-M family's green, black and
  brown); the 272 Kubinka three-tone (paint_object292) stays in the catalog and is the spec's Factory coat.

## Publication receipt (only if requested)

- Not requested; the lane's READY to Main carries the branch, sha and receipts.
