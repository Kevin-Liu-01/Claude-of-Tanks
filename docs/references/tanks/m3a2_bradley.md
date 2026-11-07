# M3A2 Bradley (`m3a2_bradley`)

**Exact variant modeled:** M3A2 (ODS) Bradley Cavalry Fighting Vehicle, US Army, 1988 on (the ODS fit after 1991):
the M2A2's hull and two-man 25 mm turret with the A2 package (bolted spaced appliqué, skirts, the TOW twin launcher on
the turret's left), no firing ports, two scouts and more ammunition inside.

## Release 269: the M2A2 and M3A2 designs swapped

The owner, 2026-11-05: "the m3a2 bradley USA should be m2a2 bradley, and our current m2a2 bradley usa should be the m3a2
bradley". Since 269 the M3A2 is the shared hull under the turret measured from the owner's supplied model, with its flank
dressing and crew bags (`src/vehicles/modern3.ts` `buildBradleySourceTurretIfv`, the M2A2's 268 build; packet
[m2a2_bradley.md](m2a2_bradley.md)), on the source turret's datums (`modern3Specs.ts` `bradleySourceArmorInput`, the M2A2
row's family base). The classic turret described below is the M2A2's (`modern3.ts` `buildM2A2Bradley`; its gun datums,
envelope and rear stops set on the M2A2 in `m3a2BradleySpecs.ts`). The M3A2 keeps its id, name, tier, the M3's stowed
loads and its number B-31. The sections below record the 268 build.

## Release 270: compared to the source turret's model

Main, 2026-11-06: "The comparison registration follows the owner's swap. m3a2_bradley takes the source turret's model".
The M3A2 is measured against the 42manako M2 Bradley print the source turret was measured from
(`/models/tanks/community/m2_bradley_ifv.glb`, pinned 0d3f779a…; `tools/procedural-fidelity.html`, turret node
`^turret_lod$`, autoPivot, the registration the M2A2 used), not a photo packet: its 268/269 packet
(`docs/references/photos/m3a2-bradley-20261102.json`) is retired, and the M2A2 (now the classic turret) proves its own
packet. Scores on 2026-11-06: procedural-fidelity 89.4 (H92 T78 G100 R88); geometry gate 34.1/90 (hull 45.3, whole 34.1,
turret 64.2, stations 49.1, dims 44.9, floaters 100), the M2A2's 268 row on the same build to within 0.02.

## Why it exists (release 268)

The owner, 2026-11-02, after release 268 rebuilt the Bradley family from his supplied model: "also make a new variant
of the bradley based on the old turret we had before doing this. i liked the shape and all the stuff arounnd it". The
coordinator ruled the same day: a new playable id, the M3A2 (the M3 cavalry vehicle carried the M2A2's turret), its
spec the M2A2's with only the real M3 deltas, at the M2A2's tier, beside it on the Bradley line.

## Construction

- **Hull:** the shared Bradley family hull, rebuilt in place by release 268 from the owner's measured source
  (`src/vehicles/modern3.ts` `buildBradleyHull` and `bradleyFlankDressing(P, { turretSeat: false })`; packet
  [m2a2_bradley.md](m2a2_bradley.md)). Not forked: every hull change reaches the M3A2 with the other Bradleys.
- **Turret:** main's `m2a2_bradley` turret at **7cc204ab32** and everything mounted on and around it, extracted verbatim
  into `src/vehicles/profiles/bradleyClassicTurret.ts` (provenance by line: the ring collar and core
  modern3.ts 2529-2539, the roof risers 2559-2570, the shell, kit, TOW pod and M242 2571-2983, the flash suppressor
  2985-3001, and the turret-owned seat pan and collar of `bradleyFlankDressing` 3129-3137). Its datums (gun pivot,
  barrel, armour envelope, TOW mouths) live in `src/vehicles/bradleyClassicTurretLayout.ts`.
- **Mirror:** 7cc204ab32's family was mirrored (its TOW pod, ISU and mast cluster on −X, the vehicle's right). The
  real Bradley carries the TOW on the turret's LEFT (+X; forward +Z, up +Y), as the owner's source and the rebuilt
  family do. Every x of the turret is 7cc204ab32's negated: mirrored coordinates, never a negative scale (the frustum
  core, chin wedge, seat pan and collar are symmetric; the smoke banks take the mirrored splay). The gun pivot goes from
  [−0.075, 0.375, 0.60] to [0.075, 0.375, 0.60].
- **One deliberate change:** the TOW pod is turret stock, where 7cc204ab32 hung it on the gun mount. At rest it stands
  exactly where it stood (its gun-frame coordinates plus the gun pivot); it no longer elevates with the 25 mm, which
  drove it into the hull roof (7cc204ab32's m2a2_bradley gun sweep: 181 of 181 yaws blocked with mount conflicts). The
  real launcher is raised by its own mechanism, not slaved to the gun. Its mouths fire from the turret frame
  (`fleetLauncherMuzzles.ts`).
- **Ring:** the turret stands on the family's ring datum, `BRADLEY_TURRET_RING` (x −0.14, z −0.40, on the 2.06 m deck
  crown; the spec's `armor.turretPivot` is the M2A2's). The old turret keeps its own proportions (not re-measured to
  the source); the seat pan and collar follow the deck under the ring (`ClassicTurretRing.deckY`).
- **Decoration:** the M3A2 draws the M2A2's decoration kit and seed (`decorations.ts` `DECOR_TWIN`).
- Known non-mirrors: the bustle rack's random fill and the whips' rake are fittings' own seeded layouts, placed at the
  mirrored seats; the stowage lumps follow the build's random stream, as every Bradley's do.

## Spec deltas from `m2a2_bradley` (`src/vehicles/m3a2BradleySpecs.ts`)

| Field | M2A2 | M3A2 | Source |
|---|---|---|---|
| name | M2A2 Bradley | M3A2 Bradley | — |
| 25 mm stowed (M919 APFSDS-T / M792 HEI-T) | 225 / 300 | 375 / 500 (× 1500/900) | Wikipedia "M3 Bradley": 1,500 rounds (300 ready); "M2 Bradley": 900 |
| TOW stowed | 7 | 12 | Wikipedia "M3 Bradley": "12 rounds (2 in launcher)"; "M2 Bradley": 7 |
| armor.gunPivot | [−0.06, 0.465, 0.60] (268 family) | [0.075, 0.375, 0.60] | 7cc204ab32 m2a2 [−0.075, 0.375, 0.60], mirrored |
| armor.gunBarrel.lengthM | 2.17 | 2.30 | 7cc204ab32 m2a2 |
| turret envelope tw / tFrontZ / tRearZ / tH | 0.98 / 1.15 / −1.20 / 0.88 | 0.82 / 0.98 / −1.05 / 0.87 | 7cc204ab32 m2a2 |
| gun.launcherMuzzles | the family's | turret (1.045, 0.415 / 0.175, 0.83) | the pod's collars |
| gunPitchByYawDeg | none | full −9 to 148 deg, −6.7 to −3.3 over the rear 149-180 | gun-depression-sweep, 26 mm keep: the barrel over the raised troop roof (2.24 m) from the classic 2.435 m axis |
| dims | 6.55 / 3.28 / 2.98, silhouette rows | 6.55 / 3.28 / 2.97, no silhouette rows | Wikipedia "M3 Bradley": 6.55 m, 3.28 m without the armour kit, 2.97 m (117 in) |
| role doctrine (`roleProfiles.ts`) | support | recon (hull traverse 47 vs 44.5, turret 66 vs 67.2) | the M3 is "an armored reconnaissance and scout vehicle" (Wikipedia); the M3A3 takes recon |
| balancePeerOf | — | m2a2_bradley | the same gun, rounds and armour: one vote in the balance audit's medians |
| visual.number | C-21 | B-31 | — |

Unchanged: tier (II), hp, mobility, armour thicknesses, gun calibre and ballistics, reloads, launcher tubes (2), no
roof machine gun. Not modelled: the M3's two scouts (game crew stays driver, gunner, commander), the covered firing
ports (the shared hull shows none).

## References

Comparison target since 270: the 42manako print (above). Release 268 and 269 proved the photo packet
`docs/references/photos/m3a2-bradley-20261102.json` (retired in 270, in git history); the photographs below are its.

1. https://commons.wikimedia.org/wiki/File:M2A2_ODS-SA_Bradley_Fighting_Vehicle.JPG — public domain (US Army); the M2A2
   ODS exterior the M3A2 ODS shares
2. https://commons.wikimedia.org/wiki/File:M2A2_Bradley.jpg — CC BY-SA 4.0, Matt Zalewski; left side, TOW stowed
3. https://commons.wikimedia.org/wiki/File:Mechanized_infantry_syria.jpg — public domain (US Army); rear three-quarter
4. https://commons.wikimedia.org/wiki/File:M3A2_Bradleys_Iraq.jpg — public domain (DoD); captioned M3A2s, Samarra 2004
5. https://en.wikipedia.org/wiki/M3_Bradley and https://en.wikipedia.org/wiki/M2_Bradley — loads, crew, dimensions
6. https://www.globalsecurity.org/military/systems/ground/m2-specs.htm — "2 Cavalry Scouts"

Lane evidence (not in git): `~/cot-lanes/abrams-bradley-268-evidence/research/m3a2_bradley/` (photos, sources, notes),
`~/cot-lanes/abrams-bradley-268-evidence/D/` (renders, the turret comparison against 7cc204ab32, checks).
