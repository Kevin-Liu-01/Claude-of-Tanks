# Type 10 Kaitaku (`type10_dozer`) — packet

First-party JGSDF Type 10 breaching variant: the modern Type 10 (`type10`, the independent X build, profiles/type10X.ts)
with the dozer kit (profiles/type10Dozer.ts) and a field kit (profiles/type10DozerFieldKit.ts). Builder
`buildType10Dozer` in profiles/japan.ts; spec in type10DozerSpecs.ts; appliqué datums and plates in type10DozerArmor.ts.

## Current status

- Updated: 2026-10-22.
- Owner requests, verbatim, in order:
  - 2026-10-21: "make a new type 10 variannt based off the version with a dozer!"
  - 2026-10-22: "oops the type 10 dozer shoouldve applied to the most modern type 10 design we had, u applied it to the
    wrong next gen moodel instead of the "modern" model"
  - 2026-10-22: "make it have 2 unique auto cannnonn turrets, a bunch of new cages and side armor and turret armor and
    lights and equipment", then "sorry they should be machine guns not autocannons", "also add a giant flootlight next to
    gun to left of it", "where the old machine gunn was on the original type 10, add annother euqipment light", "put thee
    flood light on other side of gun and give this a unique name for a variannt instad of just "dozer"".
- ID and display name: `type10_dozer` (never re-keyed), "Type 10 Kaitaku" (開拓, land-clearing); "Type 10 (Dozer)",
  "Type 10 Dozer" and "Kaitaku" are search aliases.
- Base: in the Garage, "Type 10" (`type10`) is the Modern-era production tank; "Type 10 (TK-X)" (`type10_tk_x`) is the
  Modern-era prototype status build (its schema-1 id was `type10`) and "Type 10B" (`type10b`) the Next Generation
  concept. The first build of this variant (release 238) sat on the TK-X; it now sits on `type10`.
- Qualification: owner light checks (typecheck, build, one blind critic); no suites or censuses.

## Base and spec

- type10DozerSpecs.ts clones `type10` once the second-wave X registry has run (fleetRegistration imports it after it):
  type10's armour, frame, dims (its silhouette oracle rows stripped) and gun rig (no combat gun-rig row, as type10). Its
  own stats (2650 HP, 1200 hp, 50 t, 66 / 30 km/h, 44 and 46 deg/s, 36 deg/s pitch), number '24', paint
  `paint_type10_dozer`, tier X, assault role and roster slot are unchanged; type10, type10_tk_x and type10b finalize
  byte-identical and match their ledger digests.
- The builder is `buildType10X(P, { remoteM2: false })` (type10's own 12.7 mm station left off), then the dozer kit and
  the field kit. modern3.ts is back to its pre-dozer Type 10.
- Look: the variant dresses as type10 (decorations.ts DECOR_TWIN: type10's manifest and seed) with the bow, the stations,
  the cheek kit and the bins reserved from the decor; type10's turret marking seat and native wheels.

## Dozer kit (type10Dozer.ts)

- Seats re-derived from type10X.ts `TYPE10_X_BOW_SECTIONS` (exported, numbers unchanged): plate A (floor from the belly
  at z 2.90 to the crease at y 0.72) and plate B (the crease to the nose, y 1.146, z 3.615), both facing forward and down.
  type10's gun at its 10 degree stop sweeps only 0.15-0.25 m over its beak, and any beak seat drove the lowered rams
  through the nose, so the TK-X kit's beak rams could not be kept.
- Push arms pinned on plate A at x +-0.67 (between the tow eyes and the tub's flank), hinge at hull (y 0.566, z 3.198).
- Rams on plate B midway between the inner and outer spare-link pairs (x +-0.462, type10XBow.ts link stations), just
  under the nose; barrel and rod follow the two poses (closed 0.533 m, open 0.679 m). Hoses from bulkhead fittings above
  each clevis pad. The spare links and tow eyes stay.
- Same blade (3.29 m, 0.84 m along its face). Stowed: tipped back 32 degrees, cutting edge at (y 0.52, z 4.62), top
  y 1.238; lowest kit vertex y 0.413 over the hull's 0.393 m floor (sim-floor panYM 0.368 is the skirt hem). Lowered
  (presentation only, `spec.visual.dozerBlade = 'lowered'`): turned 19.8 degrees about the hinge, edge 4 cm off the ground.
- Clearances (lane probes): no kit vertex inside the hull deeper than 5 mm in either pose (the pads, cheeks and fittings
  embed 4 mm by design); ribs and end plates 0.2 m clear of the mudguard folds.

## Field kit (type10DozerFieldKit.ts)

- Two remote machine-gun turrets on raised rings on the rear roof, each a working auxiliary station at its true calibre
  (sourceMachineGun): a 12.7 mm M2-pattern gun on an open cradle (left; ready box, sight head) and a 7.62 mm gun in an
  enclosed armoured mini-turret (right; side sight, cooling sleeve, boresighted searchlight on its pitch). Traverse
  arcs and per-yaw depression from tools/roof-station-arcs.mjs: 12.7 mm -117..131 degrees, 7.62 mm -103..251, each
  blocked only toward the other station and a mast (2 degree / 0.01 rad margins).
- A giant floodlight (0.54 m drum, armoured doors open) beside the main gun on its right (-x), on a yoke bolted to the
  right cheek's raked face and top; its inner edge 0.38 m off the mantlet. (First fitted on the left, moved on the
  owner's word; the coaxial gun's port is on the left.)
- An equipment light on the original Type 10's 12.7 mm ring by the cupola: a slewing lamp head on a short mast.
- Cages: the modern field cage on the turret's rear two thirds (modernFieldCage.ts) and slat screens on the hull's rear
  flanks.
- Bolted appliqué with raised rims: four modules a side on the hull skirts, two wall modules and a cheek module a side on
  the turret; spaced plates over them in the spec (hull 100 / 280 mm KE / CE, turret 140 / 360).
- Smoke: a four-tube bank a side on the rear turret modules (8 charges, as the TK-X build carried; type10 draws none).
- Work lamps on the forward turret modules and over the bustle; stowage bins on the front fenders.

## Blind critic (one round, 2026-10-22)

Six randomised before/after pairs (before: the release-238 TK-X build; after: this build before its fix round), three
type10 reference views, key sealed until scoring. The after build read as the modern Type 10 underneath in 6 of 6 pairs,
won 4, tied 1 and lost the bow close-up; verdict "yes, it reads as the modern Type 10 with a seated blade". Fix round:
the raised blade read as a plate pressed on the nose with its arms and rams hidden (in 3D it stood 0.29 m off), so it
stands 0.12 m further out (edge z 4.50 -> 4.62). The end plate "clipping" the skirt's front corner is perspective (no
contact within 0.2 m).
