# The Longwei family — reference packet (release 264)

Owner, verbatim (2026-10-28, after the 262 renders of the rebuilt Longwei): "make 4 new chinnese tannks combining
variations of vt4a1, qilin, kunlun, annd ztz 99a2 with modernized versions of the lonngwei turret which i like the
shape of".

Four original PLA game concepts, named for the Four Symbols. Each is a fleet hull, kept exactly, under the ZTZ-99
Longwei's release-262 arrowhead turret: its welded core, the two wedges swept 37 degrees off square to the side modules,
the slim cast mantlet, the bustle and the 6.454 m 125 mm gun, unchanged in shape. Each carries a modernized kit of its
own. None is a historical vehicle; the hosts and the Longwei carry the historical grounding
(`docs/references/tanks/ztz99_longwei.md` §262, the ZTZ-99A2 and VT-4A1 packets, and the national modernization record
for the Qilin and Kunlun).

Code: `src/vehicles/longweiFamilyConfig.ts` (the members), `src/vehicles/profiles/longwei.ts` `buildLongweiTurret`
(the kit; the default kit is the Longwei's own: it built the Longwei byte-identically, digest `d62c832f950d4f38`, until
the face fit and the envelope fix below, which change the Longwei too), `src/vehicles/profiles/chineseFrontline.ts` (the two on the ZTZ-99A2 / VT-4A1 hull),
`src/vehicles/profiles/nationalModernization.ts` (the two on the T-72 hulls), `src/vehicles/longweiFamilySpecs.ts`
(the specs), fixture `src/vehicles/profiles/longweiFamily.selftest.mjs`.

## The four

| Id | Name | Host hull (kept) | Ring (hull frame) | Turret kit |
|---|---|---|---|---|
| `ztz99a2_qinglong` | ZTZ-99A2 Qinglong (Azure Dragon) | ZTZ-99A2 | 0 / 1.66 / 0.40 (the VT-4A1's station) | 3 x 2 FY-5 grid on each face, two rows of cassettes on each side module, a low remote 12.7 mm station, the GL-5-style suite with a rear launcher pair (4 radar faces, 4 launchers), closed armoured boxes on both flanks and across the rear |
| `vt4a1_baihu` | VT-4A1 Baihu (White Tiger) | VT-4A1 (the same ZTZ-99A2 hull) | 0 / 1.66 / 0.40 | two V-ridged chevron cassettes a face, side-module cassettes, a big searchlight right of the gun, laser-warning receivers in place of the hard-kill suite, the QJC-88 on its pintle, the lidded bins and mesh basket inside a slat screen; its number on the hull's flank as on the VT-4A1 |
| `t72b3_zhuque` | T-72B3 Zhuque (Vermilion Bird) | the Qilin's T-72B3 with its Chinese package and rear rack | 0 / 1.497 / 0.066 (the Qilin's Type 96B ring) | the Longwei's two large dual-reactive modules a face, side-module cassettes, the GL-5-style suite, the QJC-88 on its pintle, closed armoured boxes |
| `t72b3m_xuanwu` | T-72B3M Xuanwu (Black Tortoise) | the Kunlun's T-72B3M with its Chinese package and rear rack | 0 / 1.549 / 0.114 (the Kunlun's) | four columns of three small tiles on each face, side-module cassettes, two infrared dazzler heads on the side modules' front shoulders with rear laser warners, the QJC-88 on its pintle, the lidded bins and basket |

Each keeps its host's hull armour, hull modules, hull crew, running gear, mobility (3 t heavier for the Longwei turret)
and fire control, and takes the Longwei's turret plates, turret modules, turret crew, trunnion, gun range and turret
drives. The side-module cassettes add two reactive sectors (`turret_side_era_L/R`) the anatomy generator fits over them.
The T-72 hosts' upper-slope fuel drums are left off: the Longwei's long bustle overhangs that slope.

### The cheek faces (owner 2026-10-28)

Owner, verbatim: "make the squares on frront cheeks adjusted properly so its not weird and properly varies. also add a
big floodlight on thhe baihu". The cheek face is a planar trapezoid, level along its bottom and rising from 0.28 m at
the throat to 0.62 m at the outer corner. The cassettes were boxes laid on it: their inner top corners stood up to 1 cm
past the face's top edge, and their outer tops left a wedge of bare face under it. Each cassette is now a block whose four
corners lie on the face (`faceCassette`), 80 mm proud, 25 mm over its bottom and 45 mm under its top edge (clear of the
bolt row), from |x| 0.36 by the throat to 1.47, 5 cm inside the outer corner, so every top runs parallel to the edge. The
rows take fixed shares of each column's height, and the columns' widths follow the face's height (`cheekFaceColumns`):
narrow by the throat, broad at the corner. The tiled kits take as many columns as make each tile square
(`squareColumnCount`). Each of the four wears its own pattern: the Zhuque the Longwei's two modules, the Qinglong two rows
of square FY-5 tiles, the Baihu two V-ridged chevrons (24 degrees off each half, the ridge capped at 12 cm), the Xuanwu
one row of square blocks. The Longwei keeps its two modules, now face-fitted too.

The Baihu's floodlight (`addLongweiFloodlight` on `gunFloodlight.ts`, the fleet's gun-floodlight pattern): a 0.34 m
drum, 0.28 m deep (half again the Luna's), right of the gun over the cheek's top on the bracket out of the mantlet, in a
yoke (a saddle under the drum, a cheek either side with trunnion bosses) and behind a guard grille, pitching with the gun.
Every part of it clears the wedge's top by 2.5 cm or more at full depression.

### Seating on the ZTZ-99A2 hull

That hull's turrets sit down in a ring well: the deck round its ring stands at 1.667 m, over their 1.56 m pivot. On the
VT-4A1's ring height the Longwei's mantlet chin stood on the drawn seat race (`turretSeatRace.ts`) at every pitch ahead:
the depression sweep read a whole-gun floor of +6 degrees at yaw 0-5, a standing conflict no stop cures. Seated as the
Longwei seats on its own hull, 0.07 m over the deck round the ring (pivot 1.7374 m), the conflict went but the blind
critics saw a dark band under the turret. The Qinglong and Baihu seat it at 1.66 m: the mantlet chin keeps 3 cm over the
race at full depression and the core's underside rides 1.3 cm over the deck round the ring.

### Fire control and fairness (balance range, shown-tier MBT peers)

With the Longwei's own tier-VI fire control the T-72 pair read 0.25 (Zhuque, 10/16 pairs inside 0.2-0.8) and 0.24
(Xuanwu, 8/16) at tier VII, where their hosts read 0.51 (Qilin) and 0.56 (Kunlun). A modernized turret keeps its host's
125 mm fire control and ammunition: Zhuque 0.427 (15/16), Xuanwu 0.419 (16/16).

Round 2 (the face-fitted cassettes, the Baihu's side cassettes, the 1.66 m seat on the ZTZ-99A2 hull), at the proposed
tiers: Zhuque 0.414 (16/17 pairs inside 0.2-0.8) and Xuanwu 0.404 (17/17) at VII; Baihu 0.706 (14/17) at VII, where
VIII reads 0.444 but only 12/29 inside; Qinglong 0.531 (15/36) at IX on the Longwei turret's own ratings. Round 1 had
uprated the Qinglong's turret 1.15 times (it read 0.24-0.29 at VIII-IX with half its faces bare); with full faces that
uprate read 0.694 (7/36), so it is gone.

### Gun depression by yaw (measured, `tools/gun-depression-sweep.mjs`, round 2; no mount conflict on any)

- Qinglong and Baihu (the same curve at the 1.66 m seat): the full 7 degrees ahead; the hull's armour at 32-46 (to -6.1)
  and from 126 (to -2.1), its rear fittings from 162 (to +4.1).
- Zhuque: the glacis fittings at 22-33 (to -4.9), the side armour from 126 (to -4.8), the rear deck from 157 (to -6.8).
- Xuanwu: the glacis fittings and the skirts' fronts at 17-53 (to -5.3), the skirts' rear from 117 (to -3.6), the rear
  deck from 155 (to -4.6).
- With the hosts' slope drums off, the T-72 pair's guns depress over the rear (round 1 stopped them at +4.7 and +5.2).

Listed heights (ground to the tallest fitting, the roof weapon included, whips left out): Qinglong 3.28 m, Baihu 3.01 m,
Zhuque 2.85 m, Xuanwu 2.90 m. First-party concept records: `docs/references/concepts/longwei-family-20261028.json`
(`tools/first-party-concept-check.mjs`: all four PASS, their envelopes within 3% at both qualities).

Signatures (appended after production's camouflage ids, so no saved index moves): Qinglong Azure Digital, Baihu
Desert Digital, Zhuque Red Earth, Xuanwu Night Digital.

Tree (China, Special, proposed for Main's and the owner's ruling with the fairness lines): Zhuque, Xuanwu and Baihu at
VII beside the Qilin and Kunlun, Qinglong at IX.

### Blind critic round 1 and what changed

Zhuque PASS, Qinglong PASS; Xuanwu and Baihu FAIL. Changes: the T-72 hosts' slope drums came off (the bustle rode on
them); the slat screen is flat slats 9 cm apart (it read as a railing); the side cassettes are thicker and contiguous (they
read as cards); the chevron cassettes turn 16 degrees (the Baihu read as the Longwei repainted) and the Baihu takes the
side cassettes; the Qinglong's remote station sits low in a casemate (its pedestal stood too tall); the Xuanwu takes the
QJC-88 on its pintle in place of a remote 30 mm (top-heavy) and drops the screen; its coat is lighter (the side modules'
shape was lost); the two on the ZTZ-99A2 hull seat at 1.66 m (the dark band) and keep the Longwei's insignia anchor (the
raised anchor put the numbers on the corner facet).

### Blind critic round 2 and what changed

Baihu PASS (7-8). Qinglong FAIL: its 3 x 2 grid read as louvre strips, the tiles four times as wide as tall on the long
low face; the tiled kits now size their columns to make square tiles (the Xuanwu's three rows would have read the same,
so it takes one row). Zhuque FAIL (it passed round 1): the outermost block's end stood flush with the corner, a fin; the
field now ends 5 cm inside it. The lids read as loose slats (inset 8 % and 8 mm proud now), the blocks as flush plates
(65 mm then, 80 mm now). The Baihu's lamp read as perched, its lens as a pipe mouth (the yoke and the guard grille), its
slat screen as an empty fence (it guards only the rear bins and basket now, two rolled tarpaulins on the basket), and the
meteorological mast's bare cross bar as a stray post (a sensor head and vane). The Longwei's stills predate its markings
fix and showed its hull numbers gone; they stand on its skirt band again (`vehicleMarkingIncludesPermanentHullArmor`).
Not this lane's geometry, left as they are: the ZTZ-99A2 hull's rear drums, black rear skirt panels and glacis fins, the
Qilin hull's rear drum cradle, the fleet's mission dress on the bustle roof.

### Blind critic rounds 3-5 and the final verdicts

Round 3 (the square tiles, the yoke, the trimmed screen): Longwei PASS (7-8; its markings back on the skirt band),
Qinglong PASS (8), Baihu PASS (7-8); Zhuque FAIL (kit readability 6: its two big modules merged into the Red Earth coat,
its bustle boxes read as plain walls), Xuanwu FAIL (its cheek row a near-black band on the Night Digital coat, a decor tarp
roll over its smoke banks). The Zhuque and Xuanwu take `blockCamo`: each cheek block and bustle box its own patch of the
camouflage (userData.camoUvOffset, the Sabra Mk 2 cheek covers' precedent), so a busy or dark coat no longer runs straight
across them. Round 4: Zhuque PASS (7-8), Xuanwu FAIL (build quality 6: the decor tarp roll in the smoke banks and the decor
smoke pair standing above the roofline as a comb). The Longwei's own decor rule (no decor smoke pair, no tarp or net roll on
a turret side: `decorations.ts`, release 262) now covers every family member; all four had drawn both rows. Final round
on the decor-ruled builds: Qinglong PASS (7-8), Zhuque PASS (7), Xuanwu PASS (7-8); Baihu FAIL (kit readability 6: its
chevrons read as flat slabs), its ridge now 24 degrees off each half (12 cm at most) with `blockCamo`, then Baihu PASS
(7-8). Every member's last verdict is on its shipped geometry.

Left as they are, named by the critics and not this lane's geometry: the ZTZ-99A2 hull's rear drums, black rear skirt
panels and glacis fins; the Qilin hull's rear drum cradle; the fleet's mission dress on the bustle roof; the camouflage's
staircase shear on sloped faces (the reference Longwei shows it: the shared face-box projection); the GL-5-style radar
housings reading like sight heads (the Longwei's own suite, unchanged since 262).

## The ZTZ-99A2 hull's bow shoulder (main-reds 261)

The hull the Qinglong and Baihu share with the ZTZ-99A, ZTZ-99A2 and VT-4A1 failed the strict exact track-clip audit on
all of them: 14 front and 44 sweep band cells, the hull mesh at y 1.04-1.10 over z 2.72-3.20. Its bow shoulder
(`buildZTZ99A2Hull`) is one convex body, so its underside ran straight from the 1.18 m station to the bow's 0.96-0.98 m
and passed 5-8 cm inside the track's wrap over the idler (z 2.95, wrap top about 1.16). Raising only the two outboard bow
corners made it worse (57 / 65 cells: the low inner bow corner then spanned the underside across the track). The
bow-side underside now stands at 1.24 m over the idler's station and 1.12-1.14 m at the bow: 0/0/0 on all seven tanks
on this lane. The transverse guard still hangs to 0.98 m ahead of the wrap; a low bow render shows no gap.

## Envelope honesty: the Longwei and the T-54 family (teammate request, 2026-10-28)

The anatomy's armour envelope is the box round the `hull` and `turret` buckets, and every authored plate is mapped onto
it. Main's census of the old builds flagged the Longwei's stern rack and bow sheets and the Type 59's small hull
fittings. The 262 rebuilds carried the same fault in other parts: the Longwei's fender shelves, front fender boxes, hood
cheeks and skirts stood in `hull` (the envelope 3.71 x 7.58 m against its 3.40 x 7.12 m armour shell), and so did the
T-54 family's fender shelves, scoops, lips and rear flaps (3.30 x 6.08 against 2.14 x 6.00). The sheet metal is now
painted bodywork (`hullFixedPaintedBodywork`: silhouette and paint kept), the Longwei's skirts are spaced armour
(`addExternalArmor`) and its stern rack is equipment. The census reads no growth on either hull.

## Other Chinese-family reds folded into this head (main-reds 261)

- `type99Armor`: the ring assertion held every ring to the turret underside; since release 240 the ring volume centres on
  the drawn ring's deck (`combatAnatomy.ts` alignTurretRing). The receipt follows that rule.
- `suppliedSourceArmorRegistration`: the Type 96B builds its armour from its own frame (`createType99Armor('type96b_frame')`),
  which the Longwei's 233 and 262 redesigns no longer share; its permanent protection is compared with that frame, as a set.
- `chineseGunMountEraSpent`, `ztz99a2RearService`: since the 241 regen published their rings, the turret seat stands the
  low chevron corners on the seat plane (VT-4A1 0.1514, ZTZ-99A2 0.1525): the receipts read the seated corners.
- `donorStockSeating`: the ZTZ-99A2 hull's louvre bars are 18 mm deep at 7 mm, so their undersides sit 2 mm into the deck
  (they sat 4 mm in) under the same 16 mm proud top.
