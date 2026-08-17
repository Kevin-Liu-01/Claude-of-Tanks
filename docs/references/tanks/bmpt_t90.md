# bmpt_t90 — BMPT T-90 (§5.363 new-id lane packet)

## Owner order (verbatim)

> "add a bmp terminator 2 where it has an even crazier beefier two autocannon
> turret with even more equipment and decorations and even some era on a t90
> hull"

## Id decision

- **Id**: `bmpt_t90` — displayName **"BMPT T-90"**, shortName "BMPT T-90"
  (aliases: Terminator 3, BMPT-90, T-90 Terminator), nation **Russia**,
  tier **10** (one over bmpt_terminator2's 9 — the beefier variant).
- **Class**: FALSE-0 / photo-class. No oracle exists and none was invented;
  the id is NEVER gated (ledger absence = the bmpt_terminator2 / kf51b
  class). Geometry-gate was not run and no gate JSON exists — by design.
- **Geometry hash (banked)**: `9fa066b8` (76 meshes / 123,244 verts,
  tools/tmp-hashgeo.mjs).

## Construction (grammar sources)

- **Hull — the certified T-90A donor**, called as `T90_PROFILES.t90a.build(P)`
  from `src/vehicles/profiles/t90.js` (the shared-export path — the exact
  `T72_PROFILES.t72b3m` precedent bmpt_terminator2 already uses in this
  file). The donor supplies the §5.75-family loft hull, K-5 glacis cassette
  courses, §5.262 six-wheel rubber running gear, guarded bow/stern light
  clusters, split unditching log + stern fuel drums, fender kit and the
  certified thin skirt band. Donor bytes UNTOUCHED (t90a `b5995708`
  byte-held before/after).
- **Donor-bucket law (new finding)**: the t90a dome also dresses through
  `turretTrack` (spare-track course, reaching x ±1.41 / z −1.54),
  `turretCupola` and `turretEquipment` — buckets the shared
  `clearUpperStructure` helper does NOT clear (t72/bmp2/bradley donors never
  use them; widening the shared helper would strip live donor equipment on
  the other residents and break their hashes). `addTerminatorT90Station`
  clears those three buckets locally. Receipt: pre-fix turret envelope
  x ±1.413 / z −1.538 → post-fix x ±1.341 / z −1.13.
- **Station — the bmpt_terminator2 grammar sized UP** (profile-local, in
  `addTerminatorT90Station`):
  - Turntable r 1.22 + base skirt slab (vs the clone's 1.16), housing
    0.96 × 0.52 × 1.52 with a distinct roof step (vs 0.72 × 0.44 × 1.20).
  - **Twin 30 mm at x ±0.20** (clone: ±0.16 — the wider "beefier" spacing),
    cradles + taper collars + sleeve sections + brake rings + tip dots per
    tube; `P.muzzleZ 3.37`.
  - **QUAD Ataka racks BOTH flanks** — the §5.360-ratified grammar
    (arm / underslung block / hanger webs / SEPARATED tubes / clamp collars /
    PROUD light caps / recessed dark mouths / rear plates) **doubled to
    2 columns × 2 rows = 8 tubes total** (7-8 cm real air between every
    pair; top strap clamps both columns).
  - **Station ERA** ("even some era"): K-5 class wedge clamshells hugging
    both cheeks (the t90a eraRuCheeks read), a staggered two-course brick
    cassette field on the sloped face, flank tiles on the walls.
  - **Full sensor suite** (all `P.addEquipment` — the owner's equipment
    system; combatAnatomy source-lint clean): pano square-post + box head
    (§5.269 bar, no funnel), gunner hood + brow at the face, LWR pair on the
    roof-step corners, met mast (shoe/post/cross-arm) rear-left.
  - **Equipment/decorations**: NSVT pintle (census mg1), doubled smoke
    program (4-tube fore banks on cheek seats + 3-tube aft banks on slab
    seats), bustle stowage rack + jerry cans + spare track links, whip pair
    on wing shelves (§B5 seat law), grab rails with posts both walls, feed
    humps, cable trunk + hood run, service lids + latches, BMPT-90 decal on
    the vertical right wall (§5.04).
- **Hull program (this build's own, §5.350 class)**: 8 skirt ERA panels per
  side (bottoms hold the certified 0.98 skirt line — **§B9 wheel exposure
  preserved**), top ERA strips lapping the fender edge, rubber fore/rear
  sections outboard of the 1.70 track-outer line, and **twin AG-17 bow
  pods** (hull-fixed equipment: buried seat, armored pod, stub tube with
  explicit dark mouth, drum feed lapped into the pod wall).

## Spec (src/vehicles/afvFamily.js)

- `variant('bmpt_t90', 't90a')` — the clone convention (armor rides the
  donor layout, turretPivot [0, 1.40, 0.15]); station re-seats the rig at
  exactly those anchors (§5.361 rig-anchor law).
- Stats: bmpt_terminator2's frame up a notch — hp 2400, 1130 hp plant,
  48.0 t, 60/18 km/h, traverse 60°/s, elevation +45/−5.
- **Gun**: 30 mm, reloadS 0.30 (the §5.330 "super fast" class),
  `muzzles: [{x:−0.20},{x:+0.20}]` — the §5.330 knob; pairs with the landed
  alternating-recoil system (recoilRig.selftest green with this id).
  Shells: 3UBR8 ×500 @0.30, **9M120-1 Ataka-T ×8** (the quad racks), 3UOF8
  ×500.
- **Dims (honest, node-measured — tools/tmp-bmpt-t90-measure.mjs)**: hull
  6.86 published (measured span 6.90), overall 7.56 (twin tips +4.109 /
  stern −3.455), width 3.78, height 2.90 (solid pano-cap crown; whips
  mask-filtered per the §D whip-rough law). silhouette* rows carry the
  measured values.

## §5.287 wiring checklist (every file)

| File | Row |
| --- | --- |
| src/vehicles/afvFamily.js | AFV_FAMILY_IDS + spec (variant of t90a) |
| src/vehicles/profiles/afvFamily.js | `addTerminatorT90Station` + `buildBMPTT90` + registry row + T90_PROFILES import |
| src/vehicles/tier.js | `bmpt_t90: 10` |
| src/vehicles/tankLabels.js | displayName/shortName/aliases |
| src/vehicles/vehicleMarkings.js | `anchor('hull','left',0.44,0.60,0.22,1)` — the skirt-ERA panel field (station walls sit behind the Ataka columns) |
| src/vehicles/combatAnatomyCalibrations.js | bmpt_t90 row spliced (+56 append; see cross-lane note) |
| public/icons/ | 9 asset views + manifest rows (genIcons --ids=bmpt_t90) |
| roster/garage | none needed — mirrors bmpt_terminator2 (dynamic country/tier/name ordering; garageOrder.selftest green) |
| profiledProcedurals | automatic (AFV_FAMILY_PROFILES spread) |

## Gates & receipts (shots/bmpt-t90/)

- **npm test**: full chain **EXIT 0** (tier.selftest sees 116 tanks incl.
  bmpt_t90; tankAssets/combatAnatomy/vehicleMarkings/garageOrder/recoilRig
  all green).
- **tank-standard-check --ids=bmpt_t90**: **clip 0/0 + 0/0 strict** (§B4),
  **contig holes 0** (§B2), **census mg1+15d** (§B3). Gate column reads "no
  gate json" — the FALSE-0/photo-class expected state.
- **§B3.1 ×2 twin bores**: muzzle-bore probe reads tagged 2 / rims 2 /
  discs 2, contrast 99.2 — **byte-for-byte the same class output as the
  certified bmpt_terminator2 (8f9f4bcd) run** (its §5.360 ratification is
  the twin-class baseline; the probe's single-bore assertion predates the
  §5.330 knob). Receipts: bore_probe_bmpt_t90.png +
  bore_probe_terminator2_baseline.png. Pixel proof: muzzle-endon renders
  show both recessed mouths with depth parallax (geometry, not paint).
- **§B5**: turret-parent-audit — **0 stranded / 0 abutting / 0 dangling**;
  yaw90 render set shows the complete station (housing, quad racks, ERA,
  sensors, smoke, stowage, whips) rotating as ONE package over an unmoved
  hull.
- **§B9**: skirt-panel bottoms at the certified 0.98 line; wheels read at
  every side/garage angle (view-left/right, garage card).
- **Renders (21 files)**: garage card (angle asset) + 6 angles
  (front/rear/left/right/top + hero pair) + station-close + muzzle-endon,
  each also at yaw90, + 2 bore-probe receipts.

## Guards (byte-held, hashgeo before/after)

bmpt_terminator2 **8f9f4bcd** (the §5.360-certified hash) — plus all
afvFamily residents (bmp3_rok 496f3528*, ua_m2a3_bradley 60fa6a20,
upior_ifv e2cf8368*, marder1a3 d25cfa80*, m3a3_bradley 9c545ac0,
spz_puma 849316b4, bmp3 2aeae00, upior ab1ff935) and all t90-line residents
(t90 e33a00c8, t90a b5995708, t90ms 68539120, t90a_burlak e509a8c2, pt91m
7738f7a2, t90sm a4b8aac4, t90a_vladimir c99262b0, t90m 2b7d896d) — every
row identical before/after this lane's edits.

\* bmp3_rok / upior_ifv / marder1a3 hashes reflect the marder-residue
lane's live uncommitted WIP in this shared checkout (their fenced regions);
this lane held them byte-exact through its own edits.

## Cross-lane notes (live-tree documentation)

- At build time `gen-combat-anatomy --check` reported six PRE-EXISTING
  drifts (leo2a4m, leo2a6m, kf51b, bmp3_rok, upior_ifv, marder1a3) from the
  leopard and marder-residue lanes' in-flight work. This lane spliced ONLY
  the bmpt_t90 row onto the committed calibration file (+56 append) — the
  foreign rows were deliberately NOT regenerated. After those lanes landed
  (§5.366, mid-lane merge), the check re-ran **PASS 116/116 current** —
  the spliced row is exactly what a fresh regen produces.
- HEAD moved twice during the lane (896384ed → c13e67c3 → 7b85fe43). After
  the second move every verdict was RE-BOUND on the current tree: markers
  intact, bmpt_t90 hash 9fa066b8 reproduced, guards spot-held
  (bmpt_terminator2 8f9f4bcd / t90a b5995708 / t90m 2b7d896d), full npm
  chain EXIT 0.
- Delivery is UNCOMMITTED-UNSTAGED per order; the index was left empty.

## Lane tools

- tools/tmp-bmpt-t90-measure.mjs — node smoke-build + AABB dims receipts
  (--meshes dumps per-mesh turret envelopes; found the turretTrack residue).
- tools/tmp-bmpt-t90-shots.{html,mjs} — the receipt render harness
  (angles/heroes/muzzle-endon/station-close, ?yaw=deg).
