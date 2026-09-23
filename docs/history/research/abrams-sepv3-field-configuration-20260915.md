# M1A2 Abrams SEPv3 field configuration — 2026-09-15

Owner: "make the m1a2 sepv3 look much better and much more detailed. it needs to be better than
the sepv2 in terms of detail." The X study (`m1a2_sepv3_x`, public name M1A2 Abrams SEPv3) was the
SEP v2 source study with a low-profile CROWS and one small rear box; the SEP v2 study carried the
urban kit (ARAT tiles, loader shields, counter-assault mount, belly add-on) and read far richer.

## What changed

- `src/vehicles/profiles/abramsSourceXSepv3Kit.ts` builds the fielded M1A2C over the finished
  study, in the hull frame on the study's measured planes (`abramsSourceXKitBase.ts`):
  - **Trophy HV**: a launcher assembly on each inclined flank (wall plate on the measured side plane
    with four bolts, four arms, the launcher body with armoured lid, dark countermeasure face and two
    MEFP muzzles with rims, a bumper bar, a cable run to the roof; outer face at 1.79 m inside the
    1.83 m skirt line), four radar panels (a forward pair flush on the composite cheeks, a rear pair on
    posts at the rack's rear corners facing rearward-outward) and two counterweights strapped to the
    bustle rack extension's rear stiles.
  - **UAAPU**: the under-armour auxiliary power unit on the left rear sponson (1.30 × 0.62 × 0.40 m
    on the fender, top 1.80 m under the 1.887 m rack floor so the turret sweeps clear), louvred exhaust,
    stack, access door with hinges and latches, lifting eyes, bolt row, rear grille. The right rear
    sponson carries a stowage box on the service cover (replacing the study's old right-rear box).
  - **Roof electronics**: Trophy controller and conduit, two ammunition data link boxes, GPS antenna,
    wind sensor; **fender stowage**: the tow cable clamped along the left fender, pioneer tools on the
    right, two water cans on the right rear fender; **skirt furniture**: hinge strips and D-handles on
    all sixteen receiving plates; **turret side bins** on the rear quarters behind the launchers.
  - The study now carries the SEP v2's full rear loadout (extended rack, three bags, four containers
    and receivers, the tall electronic mast) — `rearEquipmentCooperativeSteps(C, curvedArat || sepv3)`.
- **Urban set (owner 2026-09-16, "add all the side turret and sideskirt armor and attachments")**:
  the study is now an urban-armour configuration (`urbanArmor` in `abramsSourceXConfiguration`):
  rectangular ARAT cassettes on all sixteen skirt plates (`reactiveSkirts`, bound to the
  `m1a2_sepv3_skirt_era_L/R` zones), the turret ARAT courses with brackets (`turretArat`) — the rear
  course leaves stations 1–3 open on each side where the Trophy launcher assembly sits
  (`rearAratCourse(…, trophy)`), the fore courses complete — bound to `m1a2_sepv3_turret_era_L/R`;
  the belly add-on, the counter-assault M2 mount on the mantlet and the loader's and commander's
  shields. The spec width follows the TUSK's rectangular set (4.063 m) and the donor's partitioned
  skirt skin is dropped (the cassettes are the reactive skirt). The kit's skirt furniture and turret
  side bins gave way to the tiles.
- Kit parts: 123 tagged (`sepv3Kit`) over 60 urban parts and the ~60 loadout parts.

## Verification

`src/vehicles/profiles/abramsSourceXSepv3Kit.selftest.mjs` (core group): every count, the rear ARAT
stations [0, 4, 5, 6] per side with complete fore courses, the four ERA zones bound to visible
cassettes, the envelope
(skirt line, below the CROWS-LP head, above the fenders; skirt furniture a few centimetres proud),
the launchers clear the inclined walls at their lowest edge and stop at the skirt line, the APU stands
on the left fender under the rack floor behind the turret ring, the counterweights hang behind the
rack extension, the SEP v2 and M1A2 studies carry no SEPv3 part. Interior fills regenerated for the
study (the closed boxes are body); per-id chain (centring, anatomy, marking seats, icons); release
check.

## Kit seating trap (found here, fixed in both kits)

A round member built from **seated** endpoints and then put with a seated centre is translated by
the turret offset twice: the first Ukrainian cage's posts, frame tubes and slat brackets sat 1.5 m
inside the hull while the lattice (boxes with centres) floated where it belonged. Members are now
authored in the hull frame and `putKit` seats the geometry once.
