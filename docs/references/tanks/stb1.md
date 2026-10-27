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
  published; the build takes the production gun's −6/+9 (262), the hull's ±8 hydropneumatic pitch on top.

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

## Hull (262 rebuild)

Owner, 2026-10-27: "we should upgrade the hulls and everything about the tanks too"; Main: the prototype must read as
different from the production tank from the hull up. Builder: `addSTB1HullBody` / `addSTB1HullHardwareAndRunningGear`
(`src/vehicles/profiles/japan.ts`) with the fittings in `src/vehicles/profiles/japaneseHullKit.ts`.

| Feature | STB-1 before (b93941ce9d) | STB-1 source | STB-1 after (262) | Production Type 74 (262) |
|---|---|---|---|---|
| Rear plate | Sloped and tucked (the loft's last station) | Vertical ([wikiwiki](https://wikiwiki.jp/warthunder/STB-2), archived STB-1 text) | Vertical, full section to the stern, with two low tow shackles | Sloped, bolted access door, pipe rail, tow eyes |
| Exhaust | A canister on each rear fender | One mesh-guarded cylinder on the left rear fender **[photo]** | One silencer in a mesh guard (hoops and bars) on the left rear fender; a locker on the right | Muffler covers on both rear fenders |
| Track | The Japanese staggered-rib shoe | Chevron grousers where it wraps the idler **[photo]**; the STT test hull first ran Type 61 tracks | The single-pin chevron shoe | Double-pin with end connectors |
| Lamps | A three-lamp bank in an armoured shoe on each shoulder | Cage-guarded boxes at both front corners **[photo]** | A taller, narrower caged box on each front fender (three bars; marker and two headlights) | Four-lamp boxes, four-bar cages |
| Nose | A dark band and a bar across the lower nose, tow eyes on its underside | A flat glacis with a cable loop and tow fittings on the lower plate **[photo]** | The band and bar replaced by two clevis shackles on the nose plate; the cable loop kept | Straight crease, chamfered lower corners, two shackles |
| Pioneer tools | None aft | On the left rear deck **[photo]** | A shovel on the left rear deck, between the radiator field and the silencer | On the left fender |
| Smoke dischargers | Turret rear sides | Turret rear sides **[photo]** | Unchanged | Turret front corners |
| Commander's station | Raised two-tier drum with the remote AA machine gun | Raised station, remote AA M2 aimed by periscope ([ja.wikipedia](https://ja.wikipedia.org/wiki/74式戦車)) | Unchanged | Low cupola, M2 on a pintle |
| Gun travel | −10/+15 at the gun | Not published | −6/+9 at the gun (the shared figure) with the hull pitch, per-yaw curves | The same |

Not modelled: the STB-1's forward-opening "gunner's hatch" (ja.wikipedia) — which roof hatch the article means is not
clear from the photographs.

