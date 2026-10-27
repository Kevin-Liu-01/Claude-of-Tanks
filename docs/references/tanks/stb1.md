# STB-1 (`stb1`)

**Exact variant modeled:** STB-1, the first Type 74 prototype (completed September 1969 with STB-2; JGSDF).
Builder: `src/vehicles/profiles/japan.ts` (`buildSTB1`); its gun mount and the turret front around it:
`src/vehicles/profiles/japaneseMantlets.ts` (`addSTB1Mantlet`).

## Prototype facts (sourced)

- STB-1 and STB-2 carried a commander-operated remote anti-aircraft machine gun aimed through a periscope; STB-1 alone
  had a semi-automatic loader and a two-speed reverse ([ja.wikipedia 74式戦車](https://ja.wikipedia.org/wiki/74式戦車)).
- STB-1 had a **passive** night sight. It was dropped for cost, and the active near-infrared night equipment (with its
  searchlight) came in from STB-2 on (same source). STB-1 therefore had **no IR searchlight**; the 1969 photograph below
  shows no lamp box or bracket on either side of the mantlet.
- STB-3 got a longer turret with flatter side walls and lost the raised commander's station
  ([ArmedConflicts](https://www.armedconflicts.com/topic/view/660); [en.wikipedia Type 74](https://en.wikipedia.org/wiki/Type_74_tank)).
- Hydropneumatic suspension ([ArmedConflicts](https://www.armedconflicts.com/topic/view/660)). Its own gun limits are not
  published; the build keeps the shared spec travel (−10/+15 at the gun, the hull's ±8 on top).

## Mantlet (261 rebuild)

Owner, 2026-10-27: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets".
No text describes the STB-1's mantlet; the rows below rest on the 1969 Defence Agency photograph (front three-quarter,
hull marked STB-1, reproduced in the [War Thunder forum's Type 74 post](https://forum.warthunder.com/t/type74-tank-74/30705),
"Prototype #1 STB-1") and are marked **[photo]**.

| Feature | Main b93941ce9d (before) | Source | 261 (after) |
|---|---|---|---|
| Gun shield | Scaled sphere "saddle" bulb (1.48 × 0.9 × 0.82 of r 0.26) ahead of a 0.66 × 0.38 m box, taper collar, canvas boot on the tube | A compact rounded cast mask with a deep rounded chin under the gun, laced canvas down its sides **[photo]** | Its own casting: a 0.79 m wide mask on a 0.18 m drum, rounded corners (70–90 mm, rounder than the Type 74's), the chin hanging to −0.18 m ahead of the drum, a parting line round its waist, a narrow laced canvas over the drum |
| Turret front round it | The bulb stood in the dome's face; nothing received it | Rounded cast front **[photo]** | A channel cut into the cast shell: cheek walls 0.41 m either side of the gun with 15 mm seams to the mask, a concave receiver 20 mm behind the drum, trunnion pins into the walls |
| Coaxial MG port | Dark stub right of the saddle | Not described; a capped round port on the mask's upper left **[photo]** | Armoured boss with the MG's muzzle on the upper left (x −0.19) |
| Sight port | None | Not described | A telescope lens boss lower right (x +0.205), inferred from the production layout |
| Lifting eye | None on the mask | A U-eye on the mask's crown **[photo]** | An eye on its crown (x −0.15) |
| IR searchlight | A turret-fixed six-pane searchlight at the right front (x +0.73) with cradle, hood and conduit | None: passive night sight (ja.wikipedia) and no box or bracket **[photo]** | Removed |
| Collar | Taper collar and a canvas boot over the tube root | A plain collar where the tube leaves the mask **[photo]** | A short plain collar with a dust ring and a seal round the barrel |
| Barrel | Bare L7 with fume extractor | Fume extractor, no thermal sleeve **[photo]** | Unchanged (root collar trimmed to sit inside the new collar) |

Program frame (BUILD-STANDARD §A): +x is the vehicle's right.

**Left for the owner (not changed here):** the four-cell cheek grilles and the side "rangefinder blisters" come from the
third-party STB-1 oracle; neither shows in the 1969 photograph (no side bulges, a smooth left cheek). The raised
commander's station and the remote AA machine gun are sourced and stay.

Receipt: `src/vehicles/japaneseMantlet.selftest.mjs` (the gun stays inside its shield over the whole travel; the
STB-1's and the Type 74's shields are different castings).
