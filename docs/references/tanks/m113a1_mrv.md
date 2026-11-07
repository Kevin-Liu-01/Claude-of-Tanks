# M113A1 MRV (`m113a1_mrv`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian M113

The M113A1 Medium Reconnaissance Vehicle (48, approved 1978, withdrawn 1996): tier I in the Australia tree's cavalry line
after the FSV (provisional until the same-tier duels run after the regen). Built as the 'mrv' mark of the lane's M113
builder (`src/vehicles/profiles/m113.ts`, `buildM113A1Mrv`; datums `m113Datums.ts`): the M113A1 hull under the Scorpion's
turret, with its buoyancy pods. Spec `australiaSpecs.ts`: a clone of the M41A3's light-tank footing re-enveloped on the
build's datums, the 6V53 of 212 hp, the 76 mm L23A1 firing L32 HESH and L24 HE (the spec's 12.5 t is not a published
figure: none was found **[?]**). Photo packet `aus-m113-20261102.json`; fixture `profiles/australia.selftest.mjs`.
Implementation: DONE; qualification: the packet's envelope PASS, regeneration and critics pending.

### Sources

| Key | Source |
|---|---|
| WA | https://en.wikipedia.org/wiki/M113_armoured_personnel_carriers_in_Australian_service (the Scorpion turret with the 76 mm L23A1; buoyancy aids on the hull's sides and front; 48 built, approved 1978, withdrawn 1996) |
| WV | https://en.wikipedia.org/wiki/Variants_of_the_M113_armored_personnel_carrier (a coaxial and a pintle .30 cal) |
| R | RESEARCH.md (about 45 from about 1978, retired 1996; ADM: about 48 for all the 76 mm vehicles) |
| Photos | Commons `M113A_MRV_at_the_Army_Museum_of_Western_Australia_September_2025.jpg` (`side_R_amwa2025`, right profile: the pods), `M113_Medium_Reconnaissance_Vehicle_at_the_Army_Museum_of_WA_June_2018.jpg`, `M113A_Scorpion.jpg` (rear 3/4 right, "21B"), the Puckapunyal set (front 3/4 left, rear 3/4 right; `Puckapunyal-M113A1-MRV-2-1` an opposing-force scheme with a red star: shape only), the range shoots (`MediumReconnaissanceVehicle_Range_shoot_beast1.JPG`, `MediumReconnaissanceVehicles_Range_shoot.JPG`), `DF-ST-91-06301.jpg` (in service, 1989); Defence image library (running 2020; the 1981 turret roof). No square front view |

### Gap table (photo class)

| # | Photo read | Baseline (the builder's M113A1 hull) | Build |
|---|---|---|---|
| 1 | the low, flat-sided Scorpion turret set well forward, a cupola | the APC's cupola | the faceted aluminium turret on its 1.52 m ring 1.95 m behind the nose: upper and lower front plates sloping back, the sides leaning in, a flat roof; the commander's cupola at the left rear, the gunner's sight on the right, a searchlight box at the left front; a bustle box with two jerrycans |
| 2 | the very short 76 mm | — | the L23A1 1.42 m ahead of the trunnion in a narrow mantlet, a collar at its middle |
| 3 | smoke dischargers on the turret's front (the count is not in the notes **[?]**) | — | four a side on the front cheeks, in two pairs |
| 4 | the coaxial and pintle .30 cal | — | a 12.7 mm M2 on the commander's cupola (the owner 2026-11-03: "make our m113s look much much cooler annd have more firepoweer/tow missiles"; the photographs' .30 before) |
| 5 | slab buoyancy pods on the upper hull's sides and front (`side_R_amwa2025`) | — | two slab panels a side, 0.14 m thick and 0.80 m deep, from the glacis' top to the rear plate; no front pod across the glacis (the folded trim vane stands there) **[?]** |
| 9 | — (owner's request) | — | a twin TOW launcher on the turret's right flank (the owner 2026-11-03: "make our m113s look much much cooler annd have more firepoweer/tow missiles", first-party, not on the service vehicle; m113Datums.ts `M113_TOW`): an armoured two-tube box on two arms from the turret wall, its sight on top, two spare rounds strapped on the roof's rear left; its mouths launch the BGM-71A TOW (430 mm, 320; six rounds: two ready in the box, four stowed) (fleetLauncherMuzzles.ts, launcherTubes 2) |
| 6 | olive drab; call signs such as "21▽B" | — | `paint_m113a1_mrv` "RAAC Three-Tone Woodland": olive drab (#555a34) under brown and black field three-tone (owner 2026-11-03: no plain coats), number 21B on the turret's left flank; the Army's kangaroo |
| 10 | the trim vane's driver's vision notch cut down from its top edge (`front34_L_puckapunyal`) | a plain board | a 0.20 x 0.22 m notch at the hull's left ahead of the driver's periscopes and two 0.07 m square holes, as on the A3 and the M741 (the vane's thick box form on this vehicle is not built **[?]**) |

The proposal gave the MRV the Australian three-tone; the photographs show olive drab, which the build kept until the owner's 2026-11-03 "any tank without a proper camo": the olive drab stays the base under a 1980s field three-tone.

### Datums

The FSV's hull (`M113_BASE`: 4.863 m long, the roof 1.86 m, five 0.61 m road wheels 0.70 m apart, no return rollers;
see [m113a1_fsv.md](m113a1_fsv.md)); the pods' outer faces 1.41 m off the centre line. As built: 2.85 m wide over the pods,
5.168 m long (the muzzle 0.19 m ahead of the nose), 4.13 m to the whips' tips (no published MRV height **[?]**). Gun
depression (`tools/gun-depression-sweep.mjs --no-suit`): 9.7 degrees ahead and abeam; over the front corners 3.9 degrees
(yaw 33-43, the trim vane and the lamp guards); astern of yaw 143, 7.4 degrees (the ramp's hinge line).
