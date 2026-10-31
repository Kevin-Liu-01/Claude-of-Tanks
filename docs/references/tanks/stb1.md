# STB-1 (`stb1`)

**Exact variant modeled:** STB-1, the first Type 74 prototype (completed September 1969 with STB-2; JGSDF).
Builder: `buildType74Family(P, 'prototype')` in `src/vehicles/profiles/type74Family.ts` (262: the Type 74 family on the
owner's model, below), called from `src/vehicles/profiles/japan.ts` (`buildSTB1`); its gun mount and the turret front
around it: `src/vehicles/profiles/japaneseMantlets.ts` (`addSTB1Mantlet`).

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

**Removed in 262:** the four-cell cheek grilles and the side "rangefinder blisters" came from the third-party STB-1
oracle; neither shows in the 1969 photograph (no side bulges, a smooth front cheek). The raised commander's station and
the remote AA machine gun are sourced and stay.

Receipt: `src/vehicles/japaneseMantlet.selftest.mjs` (the gun stays inside its shield over the whole travel; the
STB-1's and the Type 74's shields are different castings).

**Superseded in 262** by the owner's model (below): the mask is now the model's oval face with its rim and two ports, the
collar short and thick, and the model's six-lens searchlight box rides on the mask's left.

## Hull (262 rebuild)

Owner, 2026-10-27: "we should upgrade the hulls and everything about the tanks too"; Main: the prototype must read as
different from the production tank from the hull up. Builder: `src/vehicles/profiles/type74Family.ts` (the shared hull
on the owner's model, below, and `addPrototypeHullKit`) with the fittings in `src/vehicles/profiles/japaneseHullKit.ts`.
The "after" columns are the final state on the owner's model.

| Feature | STB-1 before (b93941ce9d) | STB-1 source | STB-1 after (262) | Production Type 74 (262) |
|---|---|---|---|---|
| Rear plate | Sloped and tucked (the loft's last station) | Vertical ([wikiwiki](https://wikiwiki.jp/warthunder/STB-2), archived STB-1 text) | Vertical, full section to the stern, with two low tow shackles | Sloped, bolted access door, pipe rail, tow eyes |
| Exhaust | A canister on each rear fender | One mesh-guarded cylinder on the left rear fender **[photo]** | Mesh-guarded silencers on both rear corners and mesh-topped boxes on both rear sponsons (the owner's model) | Muffler covers on both rear side slopes |
| Fuel drums | None | None in the photographs or the owner's model; owner-directed, 2026-10-30: "make the stb 1 have two big fuel barrels and back" | 265: the fleet's two 200 L drums (0.59 m, 0.88 m long, `rearSlopeFuelDrums.ts`) lying across the vertical rear plate 11 cm off it, in 11.5 cm saddles on a welded shelf at 0.90 m on three gussets, their tops (1.61 m) clear of the deck's edge (owner: "raise em a little higher!!"); the gun's curve rides up over them from 168 degrees round (re-swept, about −3.3 for −4.4); the tail lamps moved out onto the sponsons' rear faces beside them | None |
| Track | The Japanese staggered-rib shoe | Chevron grousers where it wraps the idler **[photo]**; the STT test hull first ran Type 61 tracks | The single-pin chevron shoe | Double-pin with end connectors |
| Lamps | A three-lamp bank in an armoured shoe on each shoulder | Cage-guarded boxes at both front corners **[photo]** | A caged twin-headlight box on each front fender cap (three bars) and a hooded lamp on the glacis' right (the owner's model) | Four-lamp boxes, four-bar cages, ribbed mudguards |
| Nose | A dark band and a bar across the lower nose, tow eyes on its underside | A flat glacis with a cable loop and tow fittings on the lower plate **[photo]** | Two tow hooks on the lower plate (the owner's model) | The shared nose, two shackles, the tow cable across the glacis |
| Pioneer tools | None aft | On the left rear deck **[photo]** | A shovel on the left rear deck strip | On the left rear deck strip |
| Smoke dischargers | Turret rear sides | Turret rear sides **[photo]** | Unchanged | Turret front corners |
| Commander's station | Raised two-tier drum with the remote AA machine gun | Raised station, remote AA M2 aimed by periscope ([ja.wikipedia](https://ja.wikipedia.org/wiki/74式戦車)) | 263: the 12.7 mm M2 on a riser sleeve in a pintle socket at the upper tier's right rim (was a 0.82-scale 7.62 mm gun on a bracket) | Low cupola, M2 on a socket at its rim |
| Gun travel | −10/+15 at the gun | Not published | −6/+9 at the gun (the shared figure) with the hull pitch, per-yaw curves | The same |

Not modelled: the STB-1's forward-opening "gunner's hatch" (ja.wikipedia) — which roof hatch the article means is not
clear from the photographs.


## Owner model (262): both tanks rebuilt on it

Owner, 2026-10-27, handing over an STB-1 model: "both the type 74 and stb should be based from this". The model is
"STB_1" by reverie outbreak ([Sketchfab](https://sketchfab.com/3d-models/stb-1-b0f59399010542ae90a2aa9bd5b21e53),
CC-BY-NC-4.0), kept as an authoring oracle only at `public/models/community-candidates/stb_1_owner_20261027.glb`
(gitignored, md5 `464b7e95e6def5a6ea042fbeafbdddec`; `docs/ATTRIBUTION.md`). No vertex, index or texture of it is used:
its stations were measured by rays (inside-out for the turret, outside-in for the hull in the hull's own frame, its
4.9 degree skew to the traversed turret undone) and rebuilt from primitives in `src/vehicles/profiles/type74Family.ts`.

Frame: x and y 0.972 (its tracks' 3.27 m to the published 3.18; Main's 262 ruling keeps the model's own proportions,
see "Height" below), z 0.989 and −0.074 (its 6.85 m hull to our 6.77, nose at +3.37). Until that ruling the build took
y 0.86, which fitted its 2.36 m crown to the sources' 2.25 m with the cupola and stood the hull and turret 11% lower
than the model.

| Station | Model (program units, y 0.972) | Built |
|---|---|---|
| Tub | ±1.00, belly 0.42–0.47 | ±0.98 (the track corridor), belly 0.43 |
| Sponsons | floor 1.21–1.27 over the track's top run; the outer edge at ±1.58; sides sloping 45–50 degrees to the deck edge ±1.27 | floor 1.23, edge ±1.575, 46 degrees to ±1.27; front faces at +2.40 with fender caps over the idlers |
| Deck | 1.57–1.62, flat to the stern | 1.58 |
| Glacis | crest +1.87 at the deck; 21 degrees to the nose's top edge (1.02, +3.35); lower plate 31 degrees to the belly at +2.55–2.65 | crest +1.87, 22 degrees to the nose's top edge (0.99, +3.35), the lower plate 31 degrees |
| Stern | vertical plate at −3.41 from the deck to 0.86; lower plate raked forward to the belly at −3.00 | the same (STB-1); the production tank keeps its sloped plate |
| Rear sponsons | mesh-topped boxes flush with the deck, outer face at ±1.53, z −1.25..−2.55; mesh cylinders behind them | the same (STB-1) |
| Running gear | five road wheels 0.84 m (centres 0.49) on a 1.01 m pitch at +2.00/+0.98/0.00/−1.01/−2.05; idler +3.02, sprocket −2.92 (both raised) | five 0.84 m wheels at +2.00/+0.99/0.00/−1.01/−2.02; idler (+3.00, 0.75), sprocket (−2.95, 0.79) |
| Turret | ring datum 1.59 at z +0.49; 18-station plan ±1.33, +1.49/−2.12; full belt at 0.08–0.27, sides rolling in above; crown flat at 0.71–0.72; bustle undercut from 0.6 of the plan at the foot | the same plan and ten rings (refined to 36 × 19); pivot (0, 1.60, 0.50), crown 2.31 |
| Gun | bore 1.90 (0.29 over the ring), muzzle 4.11 ahead of the trunnion | trunnion (0, 0.29, 1.18) in the turret frame; tube 4.10 (STB-1), 4.27 (Type 74; 3.91 before 266, 0.36 m short of the published 9.42 overall) |
| Mask | an oval face about the bore across the turret front, ±0.55 wide, from the turret's foot nearly to its crown, a dark rim, a port either side of the bore | 263: the turret's own nose inside a 0.475 m channel (the cast shell's wedge round the trunnion, flush with the cheeks, rolling back toward the crown, its top a tongue pitching under a lip of the crown), two ports on its face, a thick collar |
| Searchlight | a six-lens box beside the mask's +x edge, x +0.38..+0.94 in the render frame (263, re-read at the fixed registration; 262 read +0.14..+0.73), 1.80..2.33 high, its face at z 2.29 | 0.56 × 0.53 × 0.28 at (+0.66, bore +0.175), its face 0.61 ahead of the trunnion, riding the gun |

Handedness (Main's 262 ruling: "put each kit item on the side the model shows", a per-tank placement, not a fleet
x-flip): the model is in glTF chirality, and the first 262 build carried its kit over into the program frame
(+x = the vehicle's right), so head-on beside the model the STB-1 read mirrored. The STB-1's handed kit now stands where
the model's does in the render frame, checked on depth renders of the model in the gate's registration
(`~/cot-lanes/stb1-type74-evidence/hand/`): the commander's raised station and remote gun, the gunner's sight head and
its mask port, and the glacis' hooded lamp at −x; the loader's hatch, the round roof vent, the raised driver's hatch,
the searchlight box and the coaxial gun's port at +x; the stern door, its extinguisher handle and the tail lamps (two at
−x, one at +x) likewise. The crew follow their hatches (`internalLayoutRegistry.ts` `stb1ModelSides`; the driver's and
the commander's seeds cross in `japan.ts`). The production Type 74's kit comes from its photographs and keeps the
program frame (BUILD-STANDARD §A).

Height (Main's 262 ruling: the model's own proportions): **the sources' 2.25 m with the cupola is the figure the owner's
model overrides.** At the model's proportions the crown stands at 2.31 m (ring datum 1.60, the 0.714 m shell) and the
deck at 1.58. `dims.heightM` follows the Type 74's rule, the P95 combat height the geometry gate measures on the build:
2.73 m, to the commander's station and its remote gun (the Type 74's is 2.83 m, to its cupola and M2).

### Turret kit and engine deck (263, Main: "the kit where the model has it")

The 262 kit stations were read off the model before its node-frame registration was fixed (the 115.63° yaw,
`procedural-fidelity.html`), and that 25° skew stood every turret item inboard and aft and the engine deck 0.5 m aft.
Re-read in the fixed frame (`~/cot-lanes/stb1-type74-evidence/hz/`: turret-frame height maps, cross-sections and
overlays of the model's dense surface samples on the build's), turret frame (ring datum (0, 1.60, 0.50)) unless noted:

| Item | Model (263) | Built |
|------|-------------|-------|
| Commander's station (−x) | an oval raised station 0.76 × 0.97 at its foot about (−0.39, −0.42), its crown 0.93 over the datum, 0.45 × 0.79 at the top | two oval tiers (0.38 × 0.49 and 0.31 × 0.45 half-axes at the foot), crown 0.92, vision blocks round the foot |
| Commander's sight head | x −0.58..−0.29, z −0.28..−0.12, top 0.976 | 0.29 × 0.10 × 0.16 at (−0.435, top 0.98, −0.20) |
| Remote AA gun | not on the model (sourced: STB-1 and STB-2) | on a bracket on the station's inboard flank, its body top 1.14 |
| Loader's hatch (+x) | round, x +0.28..+0.78, z −0.73..−0.06 | (+0.53, −0.40), ring 0.27 |
| Gunner's sight head (−x) / round vent (+x) | (−0.48, 0.44) / (+0.56, 0.21) | the same |
| Four-pane boxes | a 0.78 × 0.41 × 0.14 slab on each shoulder, z −0.08..+0.70, its face at 45°, toed in 15° with the shell, two rows of two panes | the same, seated by the shell's flank 0.42 up |
| Smoke dischargers | three 0.42 m tubes in a column on a bracket on each rear side, pointing (±0.42, 0.37, 0.83), the top tip at (±1.26, 0.77, −0.46), 0.155 m apart | the same (one `smokeBank` fitting per side, turned into the column) |
| Whips | upright at (±0.99, −1.50), tips 1.55 over the datum | the same |
| Rear roof vents / rear rail | one grille 0.9 across at z −1.65 / a rail 1.50 across 0.12 behind the bustle's face at 0.34–0.52 | two vents 0.44 wide at ±0.235, z −1.64 / the same |
| Engine deck (hull frame) | a three-panel grille 0.90 wide at z −1.25..−2.57, narrow grilles at x ±0.80..1.00 from z −1.00 to −2.25, the sponson items from z −1.00 to −2.45 | the same, a hinged access plate ahead of the large grille at z −1.13 |

Seen head-on and from the side beside the model, the turret now differs only by the sourced remote gun (its body 0.14–0.35 m
over the model's station).

### Roof machine guns (263)

Owner, 2026-10-29: "add mounted machine guns on both of these guys". Both tanks carried a roof gun, but neither read
as mounted. The STB-1's was a 0.82-scale 7.62 mm gun on a bracket beside the station; a blind critic saw it float over
the hatch. Both now carry the fleet's classic emplacement (`type74Family.ts` `pintleSocket` and `roofM2`, after
`nationalRoofWeapon.ts` `nationalPintleSocket`). A socket post stands at the hatch ring's rim, welded to it by a web
plate, with a clamp collar and lock bolt. The full-size 12.7 mm M2 rides its pintle column and cradle, with its
ammunition can, as a working station the auxiliary roof-gun control turns and fires. The STB-1's gun is the sourced
anti-aircraft M2, on the station's upper tier at its right rim; the Type 74's sits at the cupola's front-left rim, clear
of the hatch lid. On the STB-1 the station hid the socket's post, and blind critics read the gun as floating over the
crown on its cradle's arm. It now stands on the fleet's riser (`riser` 0.05: a sleeve and clamp collar over the pintle),
its flange 4 cm over the crown.

The geometry gate's p95 height counts roof weapons (the fidelity page's `bodyExtent` leaves out only thin columns),
and the owner's model has no gun, so the gun lowers this tank's geometry rows: the p95 height 2.74 -> 3.04 m against
`heightM` 2.73, the gate's minimum 55.4 -> 5.1, the turret curves 55.4 -> 29.1. Main's 263 ruling keeps `heightM` at
the body's height, hull and turret without roof weapons, antennas or whips, because bots aim at 0.85 of it and the eye
height reads it.

### The mask shaped by the turret (263)

Owner, 2026-10-28: "make the matnelts a lot better bc they should be like "shaped" by the turret shape instead of
protruding out". On the model the mask is no block: the nose is one rounded casting, 0.36–0.42 m ahead of the trunnion
at the bore. Above the bore it rolls back to 0.22 m. The 262 mask stood up to 1 m proud of that near the crown. The mask is
now the turret's own nose (`type74.md` "The mask shaped by the turret" has the construction, shared with the Type 74).
Head-on beside the model, the front's contour now lies within 5–10 cm of the model's across the mask at every height.
The mask's top runs on as a tongue under a lip of the crown (`type74.md`, "The groove over the mask"), so its outline
reads as the model's panel line rather than an open slot. Its two ports stand 0.10 m over the bore, so their bosses
clear the groove at full elevation.

The nose re-measured (263; the critics' "short, blunt nose"): the 262 shell's rings were measured with the model's
mantlet left out, so its front stopped 0.31 m ahead of the trunnion at the bore. Measured with the nose counted as the
turret's (it is the mask's face now; `~/cot-lanes/stb1-type74-evidence/hz/insets.py`, the model registered as the
visual bar registers it), the model's front stands 10 cm further out on the bore line just under the collar. It stands
5 cm further out 0.49 m to the side and 2.5 cm at 0.85 m, less toward the crown. The three front plan stations now take
those insets at the rings from 0.175 m to 0.564 m over the ring datum. The face stands 0.375 m ahead of the trunnion at
the bore, inside the model's 0.36–0.42 m. The ring 8 cm over the foot takes half the fill and the foot none: with the
whole fill there, the mask's chin came within 25.5 mm of the deck kit at full depression, 7–15° to the left, and that
arc's depression fell to -5.8°. Both per-yaw curves are unchanged. The Type 74 shares the shell.

Conflicts between the model and the sources, settled for the model (the owner's instruction):

- **Searchlight.** The model carries a six-lens searchlight box; ja.wikipedia records a passive night sight on STB-1 and
  the 1969 photograph shows no lamp box. Built per the model.
- **Exhaust.** The model has mesh-guarded cylinders on both rear corners and mesh-topped boxes on both rear sponsons; the
  1969 photograph shows one guarded silencer on the left. Built per the model.
- **Turret flank boxes.** The model carries a four-pane box on each turret flank; no photograph shows them. Built per
  the model.
- **Gun travel.** Neither the model nor any source gives the STB-1's own limits; −6/+9 at the gun (the production
  figure) with the ±8 hydropneumatic hull pitch.

The production Type 74 (`type74.md`) sits on the same hull, running gear and turret shell; the two tanks differ in their
masks (canvas-covered with the cradle searchlight; oval with the box searchlight), sterns (sloped; vertical), exhausts
(muffler covers; mesh boxes and guarded silencers), lamps (recessed four-lamp boxes, ribbed mudguards; caged twin
headlights, plain mudguards), drivers' hatches (flush; raised octagon), roofs (low cupola and M2, smoke at the front
corners, bustle basket; raised station and remote gun, flank boxes, rear-side smoke, roof vents, rear rail) and tracks
(double-pin; chevron single-pin).
