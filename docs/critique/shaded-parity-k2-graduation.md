# K2 — independent §B8 graduation verdict (R26, 2026-08-08)

**PASS.** All fourteen reference/procedural views meet the >=9.0 bar at
freeze candidate `827d5ffc`. Geometry gate: 90.1 minimum, every component
>=90. Evidence: `shots/k2-leclerc-loft-r26/`.

| View | Score |
|---|---:|
| close-front | 9.1 |
| close-roof | 9.1 |
| hero-frontleft | 9.2 |
| hero-rearright | 9.1 |
| hero-toptilt | 9.1 |
| view-front | 9.0 |
| view-frontleft | 9.2 |
| view-frontright | 9.1 |
| view-left | 9.1 |
| view-rearleft | 9.1 |
| view-rear | 9.0 |
| view-rearright | 9.1 |
| view-right | 9.1 |
| view-top | 9.0 |

Floor **9.0**; mean **9.09**. The final socket collars and nested mantlet
steps resolve direct-front flatness; staggered round cage members and in-field
rear fittings resolve the dead-rear regularity; measured Object_15/Object_21
subdivisions and unequal lid latches bring top hierarchy to the threshold.
No sub-9 regression was observed. Remaining simplification in outer-cheek,
rear-service, and secondary roof furniture is non-blocking.

## Sole-native terminal re-certification — 2026-08-13

The fleet exact audit invalidated the historical `8/36` band and `14/42`
shoe allowance. K2 already had a complete native front idler and rear final
drive inside `buildRunningGear`, then added two large rubber cylinders and
two inner face cylinders at the same terminal centers. Those overlays were
not suspension components; they were static duplicate wheels intersecting
the articulated wrap.

The four duplicate terminal cylinders are removed. The actual native end
mechanisms now receive the wider native face and restrained painted-steel
tone, keeping their profile legibility with no second solid in either shoe
sweep. All six road wheels, ISU knuckles/arms, hull, turret and equipment are
unchanged.

- Freeze **`765d7460`** x2 (62 meshes / 114,996 vertices).
- Geometry gate **90.1** (90.6 / 90.1 / 90.6 / 90.7 / 95.9 / 100).
- Exact band / shoe / strict moving-sweep receipt **0/0/0**.
- Parent 0/0/0; winding 0 reversed / 0 mixed, zero yaw candidates; runtime
  articulation 10/10; muzzle-bore contrast 120.1.
- `/private/tmp/k2-native-terminal-final-r1/k2` contains 15 authored, 15
  yaw0 and 15 yaw90 views including elevated-left profile: **45 PNGs / 45
  distinct hashes**. The local comparison GLB was unavailable to the live
  fidelity renderer, so no fabricated fresh paired score is claimed.

The mechanical order is explicit: **front free idler -> six road wheels ->
three return rollers / ISU arms -> rear toothed final drive -> one continuous
linked-shoe course**. The playable remains wholly repository-authored.

**PASS / KEEP `765d7460`; retire `827d5ffc`.**
