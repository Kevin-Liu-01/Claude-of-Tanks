# T-80 family (`t80`, `t80b`, `t80bv`, `ua_t80bv`, `t80u_kursk`, `t84`, the `t80uk` Shtora; release 274)

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
| Stern | unditching log, two 200 L drums on the X cradles, a ZIP box on each fender tail | as T-80, rubber mud flaps | as T-80B |

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
- no NSVT shield (a Russian late-service fitting);
- a strapped pair of 20 L cans on the right fender tail in place of that side's ZIP box.

Its six ERA plates take the same Kontakt-1 values as the T-80BV's.

## The T-80U Kursk (`t80u_kursk`)

The owner approved its look on 2026-11-20 after three rounds of stills. It is the T-80U X build whole
(`profiles/t80uKursk.ts` on `buildT80UX`), in a 2022 Ukrainian field fit, replacing the print-fitted loft and the
T-90-style turret suite in `profiles/ukraine.ts` (retired with `sovietChevronEra.ts` and two selftests). The owner's ask:
"a ton of era at front of turret, on top of turret, on sideskirts and upper glacis and different machine guns and 2
machine guns", then "the log and 2 other rear things".

- **Kontakt-1 over the K-5:** 133 bricks, laid with the T-80 marks' `k1` helper: 32 on the upper glacis over the K-5
  sheet (clear of the gun's depression line, the handles, lamps and splash strip), 33 on each skirt in two rows (the
  bricks over the track's climb to the idler and sprocket are left off), 35 on the turret roof and cheeks (14 left, 21
  right), each seated on the casting by raycast and clear of the hatches, sights, gun channel and smoke.
- **Two roof guns:** an M2 on the commander's station (in place of the T-80U's NSVT) and an M240 on a riding-cradle
  pintle at the gunner's post. Ammunition: 12.7x99 mm NATO M8 API and the default 7.62x51 mm. No photograph shows
  either gun on a T-80U; they are the owner's request.
- **Rear kit:** the unditching log on chains, two 200 L drums on the stern cradles, a stowage crate on each rear flank
  of the turret.
- **Field dress:** woodland netting over the turret's rear roof, a Ukrainian flag on the snorkel bracket, yellow and
  blue paint on the fender noses, two canvas bands on the barrel.
- **Drone dock:** the M240 stands on the T-80U's dock seat and Kontakt-1 fills the front roof, so the dock moves to the
  rear left behind the commander's cupola (turret -0.45, 0.559, -0.95). The M2 keeps -169 to +117 deg of traverse, off
  the dock (`roofStationArcs.ts`).

### Combat record

`t80MarkFrames.ts` gives the Kursk the T-80U's armour record whole at its own 1.04 protection factor, in place of the
plates measured on the retired loft, plus six Kontakt-1 plates (one per drawn cluster, `KONTAKT1_ERA` 0.05 KE / 280 mm
CE) over the T-80U's K-5 (0.20 / 400). Before and after (KE / CE mm):

| | before | after |
|---|---|---|
| Upper glacis | 499 / 572 | 499 / 572, K-5 and now Kontakt-1 over it |
| Turret cheeks | 572 / 624 | 572 / 624, K-5 and Kontakt-1 |
| Mantlet | 364 / 416 | 528 / 603 (the T-80U's, x 1.04) |
| Turret sides | 312 / 364 | 312 / 364 |
| Skirts | 2 plates, 8 | the T-80U's skirts, Kontakt-1 over them |
| ERA plates | old drawn K-5 (12 glacis, 69 turret) | T-80U X K-5 (16 glacis, 18 turret) + Kontakt-1 |

HP 2350, 12 modules and 3 crew are unchanged; the roof-gun module follows the M2.

## The T-84 (`t84`, Object 478DU2)

The owner signed off its look on 2026-11-20 (round 1). The base T-84 (Malyshev, mid-1990s), not the Oplot. It replaces
the Oplot concept on the T-72B3M (2016) hull (`profiles/oplotModern.ts`, its `t84OplotTurret` selftest, its netting row
and the concept's hybrid frame in `fleetRenewalSpecs.ts`, all retired) with `profiles/t84.ts` on the T-80U X hull and
running gear, which the real tank shares with the T-80UD.

What the photographs show (Commons "Танк Т-84" and "Object 478DU4 IDEX1999 Abu-Dhabi"; btvt, en- and uk-wiki), and the
build draws:

- **A welded turret**, not cast: the base T-84 had the angular welded turret from IDEX-1995; only the earliest 478DU
  prototypes kept the T-80UD's casting. Flat walls, a blunt wedge front, no armoured bustle, a tube rack across the back
  with a tarpaulin roll, boxes and the snorkel. It stands on the T-80U's ring and carries the T-80U's gun and trunnion.
- **Built-in Kontakt-5**: flat boxes over each cheek's roof and three along each wedge face (not the T-80U's
  clamshell); the T-80U's glacis V with its splash board; thick blocks on each skirt's three front sections.
- **Shtora-1** dazzlers either side of the mantlet (`shtora.ts`); two banks of six smoke tubes at the turret's rear
  sides; the remotely laid KT-12.7 (a working NSVT station) over the commander's cupola; the 1G46 head on the gunner's side.
- **The 6TD-2 diesel deck** in place of the gas turbine's (`buildT80UXHullBase` gains a `turbineDeck` switch, on by
  default): an intake grille behind the turret, two radiator grilles, and the wide, shallow louvred exhaust across the
  top of the rear plate. The two 200 L drums and the unditching log below it.

Combat record (`t80MarkFrames.ts`, in the same late pass as the marks, so the vehicles built from the T-84's record keep
theirs; every other spec is byte-identical, checked by hashing all of them): the T-80U's frame (dimensions, pivots,
barrel, plates, modules, crew) at the T-84's own protection by plate name. With the hybrid gone the hull plates are the
T-84's own record's, not the T-72B3M chassis's: the glacis 450/500 to 480/550 KE/CE and the lower front 100 to 120; the
turret (cheeks 550/600, mantlet 508/580, sides 300/350) and hp 2250 are unchanged. Kontakt-5: glacis 0.20/450, turret and
skirt fronts 0.20/400. Its gun curve is measured over its own stern (up to +7.5 deg over the drums).

## Stern stowage (2026-11-20)

The owner asked for the T-90 marks' rear kit on every new T-80 ("the fuel cans and other stuff at back"). All four marks
now carry the two 200 L drums on the T-80U X stern cradles (`addT90CradleDrums`, as the T-90 marks and the Kursk) and a
ZIP box on each fender tail, level on the tail's lip ahead of the drums with a foot and a bracket plate down to the slope.
The Ukrainian tank's right-hand box is a strapped pair of 20 L cans. The photographs show drums only on the T-80BV's late
Russian service; on the others they follow the owner's request. The T-80U's gun-depression curve, which the marks and the
Kursk had copied, was measured without drums, so the gun could pass through them over the rear quarters (the T-80BV's
already could). Each now has its own curve, measured with its stowage on (`tools/gun-depression-sweep.mjs`, keep 26 mm;
`t80MarkFrames.ts`): from 148 to 169 deg the gun rides up to 7.5 deg (7.7 on the Ukrainian tank's can side) to clear
the drums, and the fender-tail boxes and cans hold it at -3.5 to -4.6 deg just ahead of that. The three Soviet marks share
one curve.

## The T-80UK's Shtora-1 emitters (`t80uk`, 2026-11-21)

The command fit (`profiles/t80ukCommandFit.ts`) carried the Shtora-1's laser-warning heads but not its two TShU-1-7
infrared emitters. Photographs t80uk/01 and 03 place them 0.80 m either side of the gun, standing out ahead of the
Kontakt-5 horseshoe with their centres level with the top of the mantlet: a squat box whose front is the round window,
pin-fin heat sinks down both flanks and under the belly (drawn as rib packs), a flat sun hood, held in a U-cradle at the
head of an arm that runs back over the horseshoe into the casting. The body and lens are the fleet's OTShU vocabulary
(`shtora.ts`), so the night pass lights them as every Shtora; each arm is seated by a ray on the casting, not on a
reactive container. Drawn only: no gameplay reads Shtora.

## Segmented rubber skirts and the rubber's tile (2026-11-21, lane `t80-skirts-274`)

Kevin, from a garage screenshot: "for the t80s fix these rubber sideskirts they look so bad and the texture repeating is
too jarring." There were two causes:
- **The shapes.** Each skirt was one flat slab, or seven nearly coplanar sheets, laid along the apron line.
- **The texture.** The fleet rubber's detail maps (`rubberSurface.ts`) are one 0.4 m tile, so its grime blotches repeated
  about fourteen times down a skirt.

The fix has two parts:
- **Separate sheets.** `profiles/rubberSkirt.ts` hangs a run of separate sheets on a caller's hang line. Each sheet
  has a gap to its neighbour, its own steel clamp strip and bolt row under the fender lip, a foot that kicks out and
  twists along its length, lower corners that curl up and a beaded hem. Every variation is a fixed hash of the sheet,
  so no two neighbours catch the light alike. The T-80U X apron (`t80uX.ts`, painted) takes five armoured panels
  forward and two rubber sheets aft, on the T-80U and everything built on its hull. The B marks take seven black
  sheets a side; on the Ukrainian BV the sheets under its Kontakt-1 row carry no clamp of their own. The forward panels
  are stiff (small lean and flare), so the T-84's Kontakt-5 blocks stay proud of them, and the two rear sheets hang
  loose. The marks now hang them on the T-80U X's own apron line (`t80uXApronAt`, `t80uXApronX`), not a copy of it. The
  Object 292 no longer draws the T-80U X apron: its own rubber skirt always covered it, and the leaning sheets poked
  through.
- **The T-80BV's skirt Kontakt-1.** Kevin, on the stills: "remove the goofy squares on top o the sideskirts". The
  T-80BV's row of ten containers a side is gone, and with it the `skirt_era_L/R` gameplay plates (`t80MarkFrames.ts`),
  so the drawn ERA still equals the spec. The Ukrainian BV keeps its row of fifteen.
- **The tile.** The rubber material carries `COT_RUBBER_TILES`, and `materials.ts` `RUBBER_TILES_GLSL` samples each
  map a second time on UVs turned 35° and scaled 0.731. It blends the two samples by a 0.9 m value noise and rescales
  about the map's mean, so the grain keeps its contrast. This applies fleet-wide to tyres, flaps, mats and skirts. It
  adds three samples per map on rubber fragments and compiles no new program variant.

Per-sheet UV offsets cannot come from a profile: `tankFactoryCore` `applyRubberSurfaceUVs` re-projects every rubber
part from its merged hull-frame positions.

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
  neither. The other marks' drums are the owner's request, not photographed.

## Sources

Photographs: Wikimedia Commons, listed with licences in the lane evidence `photos/index.json` (Vitaly V. Kuzmin's Patriot
Park and Army-series sets for the T-80, T-80B and T-80BV). Text: English and Russian Wikipedia (T-80), Janes (2019,
Ukrainian T-80BV upgrade), UkrMilitary (2017).
