# Native T-80 family re-certification

Current authored freezes:

- T-80 `26ca49a8` (52 rendered meshes / 94,356 vertices)
- T-80B `d00cb6f6` (52 rendered meshes / 94,740 vertices)
- T-80BV `455daa6` (52 rendered meshes / 110,796 vertices)
- T-80U `77f9ae78` (43 rendered meshes / 61,979 vertices; unchanged)

## Provenance and preservation decision

- Every playable in the T-80 lineage is repository-authored procedural
  geometry. Private/community GLBs remain visual and measurement oracles;
  no source mesh, vertex/index payload, material, texture, rig or animation
  enters gameplay or the public build.
- The compact turbine hull, front-idler/six-road-wheel/support-roller/rear-
  drive order and one native linked course remain the shared mechanical
  foundation. Each mark keeps its own protection and station identity.
- The old T-80/T-80B/T-80BV rotational `meshDome` and its gate-tuned patch
  boxes are retired. One explicit first-party longitudinal section loft now
  forms the asymmetric low pear casting, including real lower shoulders,
  upper cheek planes, crown falloff and a pinched mantlet throat.

## Current family visual receipt

The current immutable packet is `/private/tmp/t80-family-final-r4`. Each of
T-80, T-80B and T-80BV has 15 paired, 15 yaw0 and 15 yaw90 frames, including
the standardized elevated-left profile. The 14 mandatory view vectors are:

- T-80: `[9.1,9.2,9.1,9.0,9.1,9.0,9.1,9.2,9.2,9.3,9.1,9.3,9.2,9.2]`
  (floor 9.0, mean 9.15).
- T-80B: `[9.2,9.2,9.1,9.1,9.1,9.1,9.1,9.2,9.2,9.3,9.2,9.3,9.2,9.2]`
  (floor 9.1, mean 9.18).
- T-80BV: `[9.2,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.4,9.2,9.4,9.3,9.3]`
  (floor 9.1, mean 9.24).

The T-80 keeps the lightest planted cheek applique, the T-80B carries a
heavier brow and commander package, and the T-80BV carries two irregular
Kontakt-1 levels plus a supported flank return. The family now shares a
layered mantlet, seated Luna/sight housings, two unequal hatch groups,
periscopes, a visible NSVT cradle, angled smoke banks, antenna collars,
supported rear bins/basket and a turbine-specific transom/service field.
Narrow buried armor joints keep the planted cheek cassettes readable against
the casting. The hull now carries a layered inboard nose/service package and
two unequal backed turbine louvre fields rather than broad blank panels.

## Mechanical, ownership and winding receipt

- Deterministic hashes reproduce twice for all three changed variants.
- Strict exact animated-course clearance is 0/0 at the front/rear for the
  continuous band, individual shoes and complete moving sweep on all three.
- The first front-light pass intersected the raised idler shoes by 3 cm. The
  shoulder cassettes were physically raised and the final exact receipt is
  clean; no semantic exemption hides that repair.
- Turret parent audit is 0 stranded / 0 abutting / 0 dangling for all three.
  A rear cable whose middle span stood away from the casting and an old fixed
  deck cable hidden beneath the turret footprint were removed rather than
  defended as decoration.
- Winding audit is 0 reversed / 0 mixed; the stable two-pixel rear-left
  FrontSide difference is 0.00% and no yaw-stranded candidate exists.
- Top-down contiguity is 0 holes. The transom receives a real internal tray,
  and BV's two front pockets close with broad shoulder bridges above the
  idler orbit rather than audit exemptions.
- Muzzle-bore contrast passes all three (35.0 / 35.4 / 39.9).

Yaw evidence shows the complete cast shell, protection, gun/mantlet, cupola
and NSVT assembly, sights, smoke banks, antennas, bins and open basket rotate
together. Glacis hardware, turbine deck, skirts, wheels, tracks, backed
transom and recovery field remain fixed. No fused duplicate, floating
fitting, open sheet or yaw-dependent wound is visible.

## Final native disposition

**PASS / KEEP T-80 `26ca49a8`, T-80B `d00cb6f6`, T-80BV `455daa6`; keep
T-80U `77f9ae78`. Ordered blockers: none.**
