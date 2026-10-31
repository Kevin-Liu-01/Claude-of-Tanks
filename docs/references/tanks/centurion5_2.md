# Centurion Mk 5/2 (`centurion5_2`) — reference packet

## Current status (release 262, 2026-10-27): rebuilt from historical references

Owner, 2026-10-27: "update/redesign the centurions and strv 81 ... turrets and hullls as well based on proper historical
referrences so they will no longer look so chungus". The Mk 5/2 is the `mk5_2` mark of
`src/vehicles/profiles/centurionFamily.ts`. The earlier print-fit packet is `centurion5.md` (the id's schema-1 spelling);
its history is superseded. Implementation: DONE.

Mark identity (W): the Mk 5 up-gunned with the 105 mm L7 (no thermal sleeve), the Browning coaxial gun, the Mk 5's
reshaped roof without the 2-inch bomb thrower, the cupola machine-gun mount (drawn as the fleet MAG 58 station
`centurion5_cupola_machine_gun`: no Browning M1919 class exists; the station replaces the old loader's MAG), the Mk 5's
extra glacis bin beside the link run. Spec overall length 9.83 -> 9.62 m: the L7 stands 2.06 m past the front guards
(the 9.83 m was the 20-pdr's; AC10 gives 2.03 m on the Mk 10's L7). Not modelled: the Dutch ranging gun (W), the Mk 5/1's glacis appliqué. The
searchlight box (a Dutch fitting) is drawn at the owner's request for variant floodlights.

| Item | Old build | Source | Rebuild |
|---|---|---|---|
| Gun | L7 5.15 m with a long sleeve and a mid collar | L7 L/52, concentric evacuator (L7) | 4.74 m from the trunnion, evacuator 45 % along |
| Skirt hem | raised to 0.84 on five panels | ORACLE 0.65 | as the family (0.66, rising at the rear) |
| Roof gun | loader's MAG 58 on a riser | the Mk 5's .30 Browning on the cupola (W) | MAG 58 station on the cupola ring |
| Lights | glacis lamps | armoured headlight boxes; the Delft Mk 5/2 carries a searchlight box at the turret's right front (photograph; a Dutch fitting, W) | armoured headlight boxes with windows and visors; owner 2026-10-27 ("flood lights depending on the variants"): the searchlight box with its louvred front at the right front corner |

### Sources (release 262)

| Key | Source |
|---|---|
| W | https://en.wikipedia.org/wiki/Centurion_(tank) (infobox from the *User Handbook, Centurion Mk 3, 5 and 6*, 1965) |
| SV | https://sv.wikipedia.org/wiki/Stridsvagn_Centurion_i_Sveriges_försvarsmakt |
| FAS | https://man.fas.org/dod-101/sys/land/row/centurion.htm (four double and two single return rollers) |
| RU | https://znanierussia.ru/articles/Центурион_(танк) (76 mm glacis at 57 deg, nose plate at 46 deg) |
| AC3 / AC5 | https://www.armedconflicts.com/-t73133 / https://www.armedconflicts.com/FV4011-Centurion-Mk-5-t73135 |
| Q20 / L7 | https://en.wikipedia.org/wiki/Ordnance_QF_20-pounder / https://en.wikipedia.org/wiki/Royal_Ordnance_L7 |
| TE | https://tanks-encyclopedia.com/centurion-mantletless-turret/ (Discharger No. 1 Mk 1, the loading hatch in the left wall) |
| F81 | https://forum.warthunder.com/t/strv-81b-swedens-second-centurion/359700 (KATF 1960 catalogue, Lindström) |
| ORACLE | the registered Strv 81 model `public/models/community-candidates/strv81_mmdsonic.glb` (md5 5daeeb2de58a7b3b85fa4e60b4595a5f), width-normalised to 3.38 m, measured by raycast sections (lane tools `.qa-dev/cent262/turret-map.mjs`, `skirt-oracle.mjs`, `wheels-oracle.mjs`) |
| Photos (Commons) | Mk 3 Bovington front-left / rear-left (CC BY-SA 4.0); Mk III Swiss side and front (PD); Mk 5/2 Delft head-on and turret front (CC0); Strv 81A/81B period photographs (PD Sweden): `File:Centurion_Mk_3_front-left_2017_Bovington.jpg`, `File:Centurion_Mk_3_rear-left1_2017_Bovington.jpg`, `File:Centurion_MK_III_Seite_-_Schweizer_Armee_-_Steel_Parade_2006.jpg`, `File:Centurion_MK_III_Front_-_Schweizer_Armee_-_Steel_Parade_2006.jpg`, `File:Centurion_Mk._5-2_pic1._5-2.JPG`, `File:Centurion_Mk_5_105mm,_Museumdag_2010_picture-013.jpg`, `File:Strv_81B_(C_V)_1.jpg`, `File:Strv_81B_(C_V)_2.jpg` |

### Shared family gap table (hull frame: +Z forward, ground y 0, hull centred on z 0)

| Item | Old build (print fit, to 261) | Source | Rebuild (262) |
|---|---|---|---|
| Hull length / width | 7.56 / 3.38 (spec) | 7.557 m; 3.38 m over side plates, 3.28 without (W) | 7.61 front guards to rear fittings; 3.384 over the plates |
| Overall height | 2.94 (spec) | 2.94 m (W) | turret roof 2.67, cupola ~2.95 |
| Ground clearance / belly | 0.53 | 0.508 m (W) | 0.51 |
| Glacis | stepped driver plate, deck 1.69 -> 1.51, pointed prow to 3.458 | 76 mm at 57 deg over a 76 mm nose plate at 46 deg, flat in plan (RU, W) | nose edge z 3.62 y 1.08; 57 deg upper plate to the 1.66 roof line at z 2.66; 46 deg nose plate to the belly at z 3.06 |
| Roof / engine deck | 1.66-1.75 loft, deckSplit shelves | roof 1.70, raised louvred deck 1.75-1.80 (ORACLE) | roof 1.70; engine deck 1.765 with two radiator louvre fields, engine/gearbox covers, rear transverse grille |
| Tracks | centres +-1.236, 0.5925 wide | 610 mm (AC3); centres +-1.30 (ORACLE) | centres +-1.30, 0.61 wide |
| Road wheels | r 0.40 at 2.25 / 1.40 / 0.55 / -0.50 / -1.35 / -2.20 | 803 mm (forum citing the handbook); three Horstmann bogies (W) | r 0.40 at 2.36 / 1.48 / 0.52 / -0.36 / -1.32 / -2.20 (0.88 within a bogie, 0.96 between) |
| Idler / sprocket | idler z 3.30 y 0.96 r 0.345; sprocket z -2.95 y 0.99 r 0.37 | ORACLE: idler z 3.27 y 0.96 r 0.34; sprocket z -3.12 y 0.88 | idler z 3.27 y 0.96 r 0.33; sprocket z -3.12 y 0.88 r 0.37 |
| Return rollers | six at y 0.996 r 0.11 | four double + two single (FAS); ORACLE y 1.21 | six at 2.87 / 1.90 / 0.70 / -0.65 / -1.80 / -2.58, y 1.21 r 0.10 |
| Side plates (skirts) | six panels, x 1.61, 1.48 -> 0.60 (Mk 5/2 hem 0.84) | three 6 mm panels a side (forum); ORACLE hem 0.65, rising over the sprocket (0.85 at z -1.8, 1.15 at -2.8) | three panels a side, 1.535 -> 0.66, the rear panel's hem rising to 1.24 over the sprocket, the front panel's edge raked up to the front guard |
| Track guards / bins | fender horns over the idlers | front guard bins with raked faces (Dutch Mk 5/2, Strv 81B photos); long bins on the guards | front guards with raked mudguards, outboard valances and angular bins; long four-door bins flush with the roof beside the turret |
| Turret ring | z 0.35 y 1.78 | 74 in (1.88 m); ORACLE centre z 0.47 | 1.88 m ring centred z 0.47 on the 1.70 roof |
| Turret casting | wedge nose +-0.40 at local z 1.46-1.55, crown 2.50-2.57 plus a 2.75 ridge, shelves to +-1.51 | rounded cast front, broad flat roof, near-vertical walls (photos); ORACLE: walls +-1.20, roof 2.67, front at z 1.40-1.62 | 13-station cast loft: walls +-1.18-1.20, roof 2.67, 1.64 m front face, bustle to local z -2.00 |
| Turret bins | shelves and duffels | bins round the casting, the round loading hatch in the left wall (TE; ORACLE gap at z 0) | one bin on the right, two on the left round the hatch boss, from the bin course (2.00) to the shoulder (2.44) |
| Bustle | lofted bustle with rack | tall flat-faced rear bin (Bovington rear) | 1.72 m wide, 0.38 m deep rear bin up to the roof line |
| Mantlet | slab chin and cloth blocks | large cast mantlet under a canvas cover (photos) | cast mantlet inside a drawn canvas drape, 1.32 m wide, proud of the casting face, moving with the gun |
| Smoke dischargers | Mk 3 three tubes, Mk 5 six | Discharger No. 1 Mk 1: two rows of three on each cheek (TE) | one 2x3 block high on each front corner, turned out 24 deg, with its guard bar |
| Commander's cupola | drum stack with sight vane | all-round vision cupola on the right (W) | 0.80 m cupola base, vision drum with eight periscopes |
| Mantlet cover | slab chin and cloth blocks | canvas cover laced round the opening, a sleeve on the barrel (Bovington, Delft photographs) | a curved cast mantlet under a pleated cover with lacing eyelets, a strapped sleeve, the coaxial gun's boot and the sight's armoured hood |
| Hull kit | | pioneer tools, the auxiliary charging engine's silencer on the left rear guard (forum), the travel lock | tools in clamps on the left bin lids, the silencer box, the folded travel lock, the convoy light box |
