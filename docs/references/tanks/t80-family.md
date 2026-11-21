# T-80 family (`t80`, `t80b`, `t80bv`, `ua_t80bv`; release 274)

Lane `item/t80-family-274`. The owner, 2026-11-20: "lets redesign the t80, t80b, t80bv, and their ukrainian counterparts
to be like our t90 fixes - we have old models with certain design styles that make them unique, modern versions of the
base versions of the tanks, and need to make unique versions of them now!" The owner approved the look of the three
marks on 2026-11-20 ("Look OK, carry on") from the lane's before/after stills.

## Outcome

1. **One measured hull.** As the T-90 marks build on their source-X twins (`t90-family.md`), the three early marks build
   on the T-80U X hull, running gear and turbine deck (`profiles/t80uX.ts`, the family's one gate-passing build), as the
   Object 292 already does (the owner, 2026-11-04: "dont use the old t80 hull only use modern new hulls like the nnew t80
   x hulll"). The August print-fitted builder in `profiles/t80.ts` (one loft, three variant branches, the T-80 and T-80B
   nearly identical) is retired. The X builder gained two default-on switches (the U's rubber bow mat and its skirts) and
   an exported gun; `t80u` builds byte-identical.
2. **An early casting.** The three share a new cast turret (`t80-early-cast-r1`, `profiles/t80Marks.ts`): a low wall and
   a broad dome, rounder in plan and 2.4 cm lower at the crown than the U's, on the U's raised race. The photographs show
   the T-80 and T-80B castings as near-identical outside; their identity is the roof furniture.
3. **Each mark's own kit** (below), from 43 Commons photographs (lane evidence `photos/`, `IDENTITY.md`).
4. **The combat frame** (`t80MarkFrames.ts`, run beside the T-90 marks' pass): the twin's dimensions, pivots, barrel,
   track width and measured gun depression; each mark keeps its own plates fitted to them. The T-80BV's six ERA plates
   take the fleet's Kontakt-1 values (`KONTAKT1_ERA`, as the Leopard 2A4 V), replacing the T-80UK's Kontakt-5 values
   the record had copied: its gameplay ERA is the ERA it draws, both ways (`eraSeating`).

## Per-mark identity

The real T-80B's hull is the T-80U's apart from its fittings, so each mark's hull identity is in those fittings.

| | T-80 (1976) | T-80B (1978) | T-80BV (1985) |
|---|---|---|---|
| Gunner's sight | TPD-2-49, low head with shutters, roof left | 1G42 tall box with armoured doors, roof left | as T-80B |
| Right front of roof | long, low rangefinder housing | Kobra (9K112) guidance box, the system's one outside sign | as T-80B, with a 4 x 4 Kontakt-1 grid ahead of it |
| IR searchlight | L-2 Luna on the gun's left, night sight head outboard | L-4 Luna on the gun's right | as T-80B |
| Smoke | none (museum tank) | 902A on the cheeks, 5 left, 4 right | moved to the flanks, 4 a side |
| Turret flank boxes | three, left | two, left | two, left, aft of the smoke |
| Mast | none | DVE-BS at the roof's centre | as T-80B |
| Commander's NSVT | on the cupola | on the cupola | behind the late service's tall shield |
| Turret ERA | none | none | double-stacked Kontakt-1 wedge arrays: 8 columns left cheek, 5 right |
| Glacis | bare, V splash board, lamps, tow cables | as T-80 | Kontakt-1 field tapering 11-10-8-6-4 under the splash board |
| Side screens | narrow painted steel screens, wheels bare | full-length black rubber skirts | as T-80B, a Kontakt-1 row along the top of the front two-thirds |
| Fender noses | bare steel ends, short steel splash plate | wide rubber flaps flaring over the tracks | as T-80B |
| Bow | self-entrenching blade (the U's rubber mat is not fitted) | as T-80 | as T-80 |
| Stern | unditching log | log, rubber mud flaps | log, mud flaps, two 200 L drums on the X cradles |

Turret-side naming follows the spec: `_L` plates and clusters stand at -x, `_R` at +x (the T-80U X's own plates).

## The Ukrainian T-80BV (`ua_t80bv`)

The owner approved its look on 2026-11-20 ("Look OK, carry on"). It is the same tank as the T-80BV in its 2015-24
Ukrainian service fit, built by the same mark builder (`profiles/t80Marks.ts`, mark `ua_t80bv`), so its print-fitted
loft and its share of the T-90-style turret suite in `profiles/ukraine.ts` are retired; it is no longer the Kursk's
sibling. From the T-80BV it differs only where the photographs (lane evidence `photos/t80bv-ukraine/`) show it:

- no L-4 Luna searchlight (dropped in the 2019 upgrade);
- welded mesh baskets on the turret's rear and flanks (2018) in place of the flank boxes;
- a tall pipe-frame, net-covered overhead screen (2022-24);
- an extra 3 x 4 Kontakt-1 brick box on the turret's +x flank;
- the skirt Kontakt-1 row the full length (15 a side, not 10);
- no stern drums and no NSVT shield (both Russian late-service fittings).

Its six ERA plates take the same Kontakt-1 values as the T-80BV's.

## Blind critic (2026-11-20)

Bar: the photo class and a blind critic, as the leo2a4 precedent (Main 2026-11-20: the prints stay registered and their
gate rows are recorded honestly). An independent critic saw only per-id photographs and two flat-shaded builds (sides
mixed; key in the lane evidence `critic/ab-key.json`) and an unlabelled panel of the three new builds.

| id | new build | old build | confidence |
|---|---|---|---|
| t80 | 6/10 | 2/10 | 5 |
| t80b | 7/10 | 2/10 | 5 |
| t80bv | 6/10 | 3/10 | 4 |

It named all three marks from the unlabelled panel; each reads as its own vehicle, the T-80 most weakly (above the
fenders the T-80 and T-80B share casting and hull, as the real tanks do). Its defects, and what became of them: the BV's
drums floated (now tangent on the sloping rear plate); the B's nose flap hung loose (now on the fender's nose); the
snorkel stood off the casting (seated); the BV's Kontakt-1 read as a band (the glacis now has the photographs' V splash
board and chevron courses, the cheek columns stand in V pairs; the skirt row was already there); the gun "too long" (kept:
the T-80U X's measured tube); smoke "on one side" from above (not a defect: 5 and 4, the top view foreshortens one bank).

## Open questions

- The T-80B's 902A tube count (photographs show 4 and 5; no source states it) and whether any 1976 tank carried them.
- The roof mast on the T-80B is read as the DVE-BS crosswind sensor; not confirmed in text.
- The deck and exhaust are the GTD-1000 family's on all four (the photographs show no external difference).
- The T-80BV's drums and NSVT shield are its late Russian service fit (photographs t80bv/02-03); a 1985 factory tank had
  neither.

## Sources

Photographs: Wikimedia Commons, listed with licences in the lane evidence `photos/index.json` (Vitaly V. Kuzmin's Patriot
Park and Army-series sets for the T-80, T-80B and T-80BV). Text: English and Russian Wikipedia (T-80), Janes (2019,
Ukrainian T-80BV upgrade), UkrMilitary (2017).
