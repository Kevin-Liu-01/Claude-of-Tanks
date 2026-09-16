# M1A2 Abrams UA field kit — 2026-09-15

Owner (2026-09-15, four field photographs of Ukrainian Abrams): "for the ua m1a1 x, change
it to m1a2 UA and make it have a bunch of add ons and attachments like source material
online." The photographs show what the 47th Brigade's tanks actually carry: Soviet Kontakt-1
reactive cassettes on the turret cheeks and flanks and across the glacis, ARAT-style
cassettes on the skirts, a welded anti-drone cage over the whole turret roof, slat screens,
EW jammer masts, and stowage everywhere.

## What changed

- `ua_m1a1_x` is published as **M1A2 Abrams UA** (roster naming pass); the older Ukrainian
  hull (`ua_m1a1`) is "M1A1 SA (Ukraine)".
- `src/vehicles/profiles/abramsSourceXUkraineKit.ts` builds the kit after the finished X
  study (`buildAbramsX` → `options.ukrainian`). Everything is laid on the study's measured
  source planes in the hull frame and re-seated into the turret frame where the turret owns
  it:
  - **Kontakt-1 courses** (`brickCourse`): 4S20-sized cassettes (252 × 132 × 70 mm) laid
    flat on a plane through an orthonormal frame (u along the plane, v up the plane, n
    outward); 7 × 3 on each inclined flank (`RIGHT_SIDE` / `LEFT_SIDE`), 4 × 3 on each
    unequal composite cheek (`RIGHT_CHEEK` / `LEFT_CHEEK`), two 3 × 5 banks on the upper
    glacis (`frontDeck()` plane) either side of the towing eyes. Bodies take the fittings
    finish, a thin dark lid plate marks every cassette face. Grouped as
    `visualEraCluster`s (`ua-m1a2-k1-turret-era`, `ua-m1a2-k1-glacis-era`) and bound to
    depletable gameplay zones (below).
  - **Skirt cassettes** (`ua-m1a2-skirt-era`): the eight TUSK receiving-plate cassettes per
    side with their studs, bound to the two skirt banks.
  - **Gameplay ERA** (`src/vehicles/abramsSourceXUkraineEraArmor.ts`, applied by
    `provisionalArmor` for the `ua_m1a1` donor): eight zones named like the rest of the
    Abrams family — `ua_m1a1_x_turret_era_L/R` (flank courses), `ua_m1a1_x_turret_cheek_era_L/R`,
    `ua_m1a1_x_glacis_era_L/R`, `ua_m1a1_x_skirt_era_L/R` — one outward-wound collision face
    per bank on the cassettes' outer faces, mirroring the kit's planes and course extents
    (Kontakt-1: 5 % KE reduction / 280 mm CE, 12 mm; ARAT: 5 % / 300 mm, 15 mm). The
    `eraGameplayRegistration` receipt demands a gameplay zone behind every visible reactive
    package; the factory binds each course's bodies to the nearest same-owner zone, so a hit
    on a bank strips the visible cassettes. The X profile's stock skin partition
    (`bindAbramsSourceXStockEra`) is skipped for the Ukrainian study: its reactive skirt is
    the external ARAT bank, not a partitioned receiving sheet.
  - **Roof cage**: eight posts on the roof plane, a tube frame at roof + 0.55 m, 13
    longitudinal and 21 transverse rods over the whole roof (x −1.15 … 1.02, z −2.15 … 1.15).
  - **Bustle slat screen**: 27 bars on two rails, hung 0.4 m behind the bustle bags on two
    brackets.
  - **Jammers**: two masts through the cage, a dome jammer on the bustle roof.
  - **Stowage**: two crates under the cage, a rolled camouflage net lashed across the bustle
    rack, tarp rolls and a spare-shoe stack low on the rear deck under the bustle sweep.

## Verification

`src/vehicles/profiles/abramsSourceXUkraineKit.selftest.mjs` (core group) captures the kit at
the builder port by tag: counts per part (66 cassettes + lids on the turret, 30 on the
glacis, 16 skirt cassettes, 8 posts, 4 frame tubes, 34 rods, 27 slats, jammers, stowage),
envelope (inside the 4.08 m TUSK width, below the antenna span, above the skirt bottom), the
cage clears the roof equipment, the slats sit behind the bustle stowage, every one of the 112
cassette bodies projects inside exactly one gameplay bank with its centre half a cassette
behind the plate face, the finished tank's ERA binding receipt maps the three kit sectors onto
the eight zones, and `m1a2_x` builds without a single kit part.
`src/vehicles/eraGameplayRegistration.selftest.mjs` fires the audit APFSDS at every bank:
exposed first hit, exact activation, visible depletion, no reactivation, round reset. `.qa-dev/uakit-place.mjs` (untracked) casts a ray inward through
every turret cassette: all 66 outer-first hits land on the cassette itself 5–8 cm outside the
turret plane. Icons re-rendered with `node tools/genIcons.mjs --ids=ua_m1a1_x`; the
regeneration chain and the release check run in the main worktree.

## Cage rework — 2026-09-15 evening

Owner: "make its cage components much better and more properly attached to the tank instead of
floating." Root cause: the cage's posts, frame and slat brackets were round members built from
seated endpoints and then seated again by `put()`, so they sat 1.5 m inside the hull; only the
lattice boxes rendered, floating over the turret. The cage was rebuilt (`roofCage`): eight posts
standing on the real roof surface (`turretRoofY`, the lower envelope of the turret's roof planes)
on bolted base plates, outrigger arms to a perimeter frame whose forward bay follows the roof down
toward the mantlet, diagonal braces, a rod lattice welded into the frame, mesh walls hanging on both
flanks above the K-1 courses and on the rear, and two struts to the bustle rack's top course; the
roof sits 1.0 m above the turret so the commander's weapon station clears it. The slat screen now
hangs just behind the main rack with its brackets in the rack's third course; the net roll rests on
the rack's top course. Cage and slats live in the `turretOpenLatticeDark` bucket: open lattice is
exterior air for the body rasters (`tools/tank-voxel-body.mjs` excludes `OpenLattice` and, now
unanchored, `ghillie`) — the M1A1 SA (Ukraine)'s ghillie net had sealed its drone cage for the
interior-fill generator, which filled the whole cage as turret interior (the grey side panels the
owner asked to remove). Receipt: post feet on the roof within 2 mm, frame above 3.10 m, forward bay
below 3.20 m, slats behind the rack, brackets in the course, net roll on the top course.

