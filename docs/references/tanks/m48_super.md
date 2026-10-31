# M48 Super (`m48_super`) — reference packet

## Current status (release 266, 2026-10-28): a new German M48

Owner, 2026-10-28: "also add the m48 super to germany as well as the kpfz m48 a2 g a2", with three images of the M48
Super (two photographs of the demonstrator, one War Thunder render). Built as the `m48super` mark of
`src/vehicles/profiles/pattonCast.ts` (`buildM48VariantCastSteps`, `M48_VARIANTS.m48super`) on the M48A5's measured hull
and dome and the GA2's fit ([m48a2ga2.md](m48a2ga2.md)); spec `src/vehicles/m48VariantSpecs.ts`, a clone of the M48A5
with its own armour, fire control and engine (fleetBalancePass, ledger entry `m48_super`). Germany tree: the M48 line
at II after the GA2. Implementation: DONE; qualification per the release check.

Exact vehicle: the **M48 Super**, Krauss-Maffei and Wegmann's demonstrator with GLS, offered in 1994 (five prototypes
built, no buyer): an M48A2GA2-standard tank under bolted composite plates and steel skirts, re-engined with the MTU MB
837 diesel of 1,000 hp and a Renk RK 304 gearbox, with the MOLF 48 fire control, a laser rangefinder and a thermal
sight. (Not Rheinmetall's: the owner's photograph credit and later sources agree on Krauss-Maffei/Wegmann.)

### Sources

| Key | Source |
|---|---|
| WP48 | https://en.wikipedia.org/wiki/M48_Patton (offered 1994, five prototypes) |
| WT | https://wiki.warthunder.com/unit/germ_mkpz_super_m48 and https://wikiwiki.jp/warthunder/M48%20Super (53 t, game data; the model's plate layout) |
| Owner | the owner's three images, 2026-10-28: the demonstrator's front left and right side (Military-Today), the War Thunder render |
| GLS | Hunnicutt's photographs of GLS's earlier flat-plate appliqué on a 90 mm M48A1 (how plates wrap the cast turret; not the Super) |
| Local | `~/cot-lanes/m48-variants-266-refs/m48_super/` (the renders and the GLS scans; the owner's photographs are in the conversation only) |

### Differences from the GA2

| Item | Source | Build |
|---|---|---|
| Turret armour | flat plates wrapping the round casting into a faceted box to its roofline: a flat plate over the mantlet level with the cheeks, cheeks raked about 45 degrees back to the flank with a rangefinder port near the top, two facets down each flank to the bustle's corner, the cast roof bare round the cupola, a few large bolts, a flank handrail (WT, owner's photographs) | the gun frame's plate (1.06 x 0.82 m, its collar and two ports); `m48SuperArmour`: per side one prism from its outer faces into the casting, 1.70-2.46 m, cheeks from the plate's edge to 1.36 m half-width, back to z -1.08; two rows of bolts, the ports, the handrails, the number on the flank |
| Skirts | steel skirts over the upper run to the road wheels' tops, their lower edges broad lobes between sharp notches (owner's photographs, WT) | `m48SuperSkirts`: hung from the fender edges 1.50 m down to 0.76 m at six lobes, the front raked up, a flange to the fender's lip |
| Rangefinder | laser (MOLF 48): no M17 ends (WP48) | the ends omitted (the armour covers them) |
| Sight | a sight head at the cupola's front, a sensor mast with a ball on the roof (WT) | a box at the cupola's front with its window; a 0.9 m mast and ball left of the roof's centre |
| Smoke | racks on the turret's rear flanks (WT) | two four-tube banks on the armour's rear shoulders, raked forward and up |
| Searchlight | none (thermal sight) | none |
| Engine | MTU MB 837, 1,000 hp (WP48) | spec 1,050 shown hp; the GA2's deck |
| Weight | 53 t (WT, unverified) | spec |

### Not drawn

No dimensions of the demonstrator are published: the GA2's are kept, widened by the skirts. The MTU installation's own
deck changes are unknown (the GA2's deck is kept).
