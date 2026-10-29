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
(the kit; the default kit is the Longwei's own and builds it byte-identically, geometry digest `d62c832f950d4f38` before
and after), `src/vehicles/profiles/chineseFrontline.ts` (the two on the ZTZ-99A2 / VT-4A1 hull),
`src/vehicles/profiles/nationalModernization.ts` (the two on the T-72 hulls), `src/vehicles/longweiFamilySpecs.ts`
(the specs), fixture `src/vehicles/profiles/longweiFamily.selftest.mjs`.

## The four

| Id | Name | Host hull (kept) | Ring (hull frame) | Turret kit |
|---|---|---|---|---|
| `ztz99a2_qinglong` | ZTZ-99A2 Qinglong (Azure Dragon) | ZTZ-99A2 | 0 / 1.66 / 0.40 (the VT-4A1's station) | 3 x 2 FY-5 grid on each face, two rows of cassettes on each side module, a low remote 12.7 mm station, the GL-5-style suite with a rear launcher pair (4 radar faces, 4 launchers), closed armoured boxes on both flanks and across the rear |
| `vt4a1_baihu` | VT-4A1 Baihu (White Tiger) | VT-4A1 (the same ZTZ-99A2 hull) | 0 / 1.66 / 0.40 | two V-ridged chevron cassettes a face, side-module cassettes, laser-warning receivers in place of the hard-kill suite, the QJC-88 on its pintle, the lidded bins and mesh basket inside a slat screen; its number on the hull's flank as on the VT-4A1 |
| `t72b3_zhuque` | T-72B3 Zhuque (Vermilion Bird) | the Qilin's T-72B3 with its Chinese package and rear rack | 0 / 1.497 / 0.066 (the Qilin's Type 96B ring) | the Longwei's two large dual-reactive modules a face, side-module cassettes, the GL-5-style suite, the QJC-88 on its pintle, closed armoured boxes |
| `t72b3m_xuanwu` | T-72B3M Xuanwu (Black Tortoise) | the Kunlun's T-72B3M with its Chinese package and rear rack | 0 / 1.549 / 0.114 (the Kunlun's) | chevron cassettes, side-module cassettes, two infrared dazzler heads on the side modules' front shoulders with rear laser warners, the QJC-88 on its pintle, the lidded bins and basket |

Each keeps its host's hull armour, hull modules, hull crew, running gear, mobility (3 t heavier for the Longwei turret)
and fire control, and takes the Longwei's turret plates, turret modules, turret crew, trunnion, gun range and turret
drives. The side-module cassettes add two reactive sectors (`turret_side_era_L/R`) the anatomy generator fits over them.
The T-72 hosts' upper-slope fuel drums are left off: the Longwei's long bustle overhangs that slope.

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

The Baihu read 0.296 at VIII and 0.554 at VII (15/17). The Qinglong, at the Longwei turret's own ratings, read 0.287 at IX
and 0.237 at VIII; its heavy kit carries the ZTZ-99A2-class turret (the A2's cheeks 694/974 against the Longwei's
600/850, mantlet 437 against 380: a factor of 1.15 on the turret's main plates), and it reads 0.455 at IX (21/36).

### Gun depression by yaw (measured, `tools/gun-depression-sweep.mjs`)

- Qinglong and Baihu: the full 7 degrees to 140; the engine deck's grilles from 145 (to -3.4), the rear fuel rack from
  164 (to +2.9).
- Zhuque: the glacis corner fittings at 22-33 (to -4.9), the side and deck from 126 (to -4.8), the rear slope drums and
  rack from 160 (to +4.7).
- Xuanwu: the glacis lamp cowls and skirt fronts at 17-53 (to -5.3), the skirts' rear and the engine deck from 117 (to
  -3.6), the rear slope drums and rack from 161 (to +5.2).

Listed heights (ground to the tallest fitting, the roof weapon included, whips left out): Qinglong 3.44 m, Baihu 3.09 m,
Zhuque 2.85 m, Xuanwu 3.39 m. First-party concept records: `docs/references/concepts/longwei-family-20261028.json`
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

## The ZTZ-99A2 hull's bow shoulder (main-reds 261)

The hull the Qinglong and Baihu share with the ZTZ-99A, ZTZ-99A2 and VT-4A1 failed the strict exact track-clip audit on
all of them: 14 front and 44 sweep band cells, the hull mesh at y 1.04-1.10 over z 2.72-3.20. Its bow shoulder
(`buildZTZ99A2Hull`) is one convex body, so its underside ran straight from the 1.18 m station to the bow's 0.96-0.98 m
and passed 5-8 cm inside the track's wrap over the idler (z 2.95, wrap top about 1.16). Raising only the two outboard bow
corners made it worse (57 / 65 cells: the low inner bow corner then spanned the underside across the track). The
bow-side underside now stands at 1.24 m over the idler's station and 1.12-1.14 m at the bow: 0/0/0 on all seven tanks
on this lane. The transverse guard still hangs to 0.98 m ahead of the wrap; a low bow render shows no gap.

## Other Chinese-family reds folded into this head (main-reds 261)

- `type99Armor`: the ring assertion held every ring to the turret underside; since release 240 the ring volume centres on
  the drawn ring's deck (`combatAnatomy.ts` alignTurretRing). The receipt follows that rule.
- `suppliedSourceArmorRegistration`: the Type 96B builds its armour from its own frame (`createType99Armor('type96b_frame')`),
  which the Longwei's 233 and 262 redesigns no longer share; its permanent protection is compared with that frame, as a set.
- `chineseGunMountEraSpent`, `ztz99a2RearService`: since the 241 regen published their rings, the turret seat stands the
  low chevron corners on the seat plane (VT-4A1 0.1514, ZTZ-99A2 0.1525): the receipts read the seated corners.
- `donorStockSeating`: the ZTZ-99A2 hull's louvre bars are 18 mm deep at 7 mm, so their undersides sit 2 mm into the deck
  (they sat 4 mm in) under the same 16 mm proud top.
