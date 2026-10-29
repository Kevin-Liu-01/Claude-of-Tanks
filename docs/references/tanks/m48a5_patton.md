# M48A5 Patton — reference packet (release 262 rebuild)

Exact vehicle: **105 mm Gun Tank M48A5**, the US Army's 1975-79 Anniston conversion of M48A1/A3 hulls to the M60's
105 mm M68 gun and AVDS-1790 diesel, in its standard post-1976 fit: the Israeli-designed low-profile cupola with the
commander's 7.62 mm M60D, a second M60D at the loader's hatch, the xenon searchlight over the gun, five return rollers
on the M48A1 hull and no track-tension wheel. Earlier history of this id (the ATModeler print, the 2026-08 builds, the
258 mantlet fix): [m48.md](m48.md).

## Current status

- Updated: 2026-10-27 (lane `item/patton-family-262`, worktree `~/cot-lanes/patton-family-262`, base `b93941ce9d`).
- Owner request: "also should update/redesign the m47, m46, and m48 pattons"; for the batch, "update/redesign ...
  turrets and hullls as well based on proper historical referrences so they will no longer look so chungus". Mid-run,
  2026-10-27: "use this patton for the m48" with `~/Downloads/m48a5_patton.glb`.
- Later the same day: "just redesign the m48 off of the model. add all the equipment, completely update hull and
  shapinngm, etc, reseat equipment annd attachments and add new ones", "match its geometry!", "def smooth it out too.
  match geometry better", "fix therr matnlet and the drum should be oone of its wheels", "make sure to use our proper
  tank generation workfloow".
- Implementation: new hull, turret and gun in `src/vehicles/profiles/pattonCast.ts` (`buildM48A5CastSteps`): landmark
  lofts of the owner model (below), its equipment reseated on them. The old `buildM48` and its configs were deleted
  from `patton.ts`.
- Qualification: the evidence matrix at the end.
- Publication: lane branch only; integration through Claude of Tanks Main (release 262).

## Sources

| Key | Source | Use |
|---|---|---|
| OWNER | `~/Downloads/m48a5_patton.glb`, ater.studio, "M48A5 Patton", https://sketchfab.com/3d-models/m48a5-patton-54472c743ee3489994b0d638c14789f4, Sketchfab Standard licence, sha256 `a7c370976e97612da398735573f810984c48ff57df125c05208971064089c7fc`, 13,253,388 bytes | The owner's chosen shape reference. Separate hull, turret, gun, track and running-gear nodes; metres, ground at y 0, faces -z (registered with `yawOffset: Math.PI`). Local comparison oracle `public/models/tanks/community/m48a5_patton_ater.glb` (gitignored, never shipped) |
| WP48 | https://en.wikipedia.org/wiki/M48_Patton (Hunnicutt 1984 p.438; 2015 p.242) | dimensions, gun limits, conversion history |
| AFV48 | https://afvdatabase.com/usa/m48patton.html | per-variant table: hull length with fenders, track, rollers, idlers |
| WP68 | https://en.wikipedia.org/wiki/M68_tank_gun | M68 tube, eccentric evacuator |
| TMB | https://tankmuseum.org/article/the-patton-family/ | identification (rounded hull front, evacuator halfway down the barrel) |
| Photos | Wikimedia Commons: `Product_Improved_M48A5.jpg` (TACOM 1976, right profile, PD), `M48A5.png` (Anniston 1975, PD), `Family_Day_1981_-_Children_Examining_a_M48_Patton.jpg` (PD), `M48A5_Forsvarsmuseet_01.jpg` (CC BY-SA 4.0, Bene Riobo) | configuration checks |

The ATModeler print (`m48a5_atmodeler.glb`) is retired as the comparison oracle: it has seven road wheels, a 12.6°
pitched tube and a primitive dome (its gate packet read 59.6). Full research notes:
`~/cot-lanes/patton-262-evidence/references-research.md`.

## Source and comparison contract (owner model)

- Mode: supplied-model target (`docs/tank-generation/README.md`, "New tank from this GLB"), existing id `m48a5_patton`
  kept; the owner chose the model's proportions.
- Raw: `~/Downloads/m48a5_patton.glb`, glTF binary, 13,253,388 bytes, sha256 `a7c37097…89c7fc` (full hash in Sources);
  separate nodes `track_L`/`track_R`, `exportChassL1`/`R1` (running gear), `Hull_5`, `Turret_01_4`, `gun_01_Shape_6`;
  no LODs, no duplicate vehicles. Its stowed "drum" on the bustle's right rear is a spare road wheel (owner,
  2026-10-27).
- Oracle (source-world certified, `docs/tank-generation/tool-map.md` §2 and §4): `node tools/source-x-oracle.mjs
  --prepare=<raw> --recipe=.qa-dev/tank-run-m48a5/source-recipe.json` with the recipe `{id: m48a5_patton_x, axes: [-x, y,
  -z], scale: 1, translation: [0, 0, 0]}` bakes `public/models/community-candidates/m48a5_patton_x_source.glb` (gitignored,
  never shipped), sha256 `b54aff317407b292bd4d352a3d60ea0531a36bfbc3c21c698a9ba12ebb495285`, bounds x -1.886..1.835,
  y 0..3.727, z -3.377..5.827, no meshes omitted. Certificate in `tools/source-world-registration.mjs` (turret
  [-0.001963, 1.638327, 0.577502] = the Turret_01_4 node; gun [0, 1.9215, 1.761582] = the gun_01_Shape_6 node's station on
  the tube's measured bore axis, the node origin itself sitting 11 cm over the bore at the shield's face); registration
  in `tools/second-wave-x-reference-overrides.ts` (`qualityBar: 'exemplar'`, the 92 floor; turret Object_12, gun
  Object_16; component masks). No width normalization: the earlier legacy registration (the raw file with
  `yawOffset: Math.PI`) rescaled the model by its 3.72 m width, which the right-front bar inflates, to the published
  3.63 m (a 2.4 % shrink) and read 70.4.
- Transform: rigid only, a 180 deg turn about y (the model faces -z), metres, scale 1, ground at y 0. No per-axis warp.
- Datums (measured on the oracle): ground 0; belly 0.38; turret deck 1.51 with a raised race collar r 1.24 to 1.633;
  driver's deck 1.47-1.53; engine deck crown 1.85; turret yaw centre z 0.58 (the dome's floor circle, r 1.24); gun bore
  axis y 1.921 (the 258 fix's 2.10 was for the old 1.80 deck), gun pivot z 1.7616 (the certificate), muzzle z 5.827; road wheels r 0.33 at
  z 2.049, 1.262, 0.469, -0.309, -1.085, -1.959, y 0.41; return rollers r 0.18 at y 1.123, z 1.544 … -1.671; idler
  z 2.826 y 0.883 r 0.328; sprocket z -2.884 y 1.014 r 0.348; track 0.711 on 2.953 m centres (the model's; the gate measures
  the hull against the certified model's own envelope, `tools/source-dimension-frame.mjs`, as for the other supplied
  models).
- Dimension ruler: `m48a5_patton` joins the source-only fixed frame in `tools/source-dimension-frame.mjs` (selftest line):
  the supplied model's own height, length and width, plus its full physical envelope, replace the published roof height
  and width the model departs from (3.157 m and 3.67 m against 3.06 m and 3.63 m).
- Published versus source: AFV48 hull with fenders 6.871 m (model 6.93); fire height 78.8 in = 2.00 m (model 1.92).
- Rejected source parts: none; the model's fused stowage (bags, boxes) is rebuilt as first-party primitives at its
  measured seats.
- Fittings measured off the model (2026-10-28): whips at (0.71, -0.48) and (-0.31, -1.03) to 3.727 m (our seeded whip
  bows its tip 2 cm, so the bases sit 1-1.5 cm inboard); the M60Ds at the true 1.10 m (scale 1.15) over the model's
  z -0.22..1.11 span, level, on its bores (3.056 commander's, 2.92 loader's), with its back-plate and spade-grip block
  (z -0.215..-0.10), rear-sight leaf (top 3.216 and 3.081) and feed-cover latch; their posts stand under the fittings'
  yokes (z 0.24 up the cupola's flank, z 0.23 on a base plate), not at the model's z 0.44 and 0.425, where our lower
  right shoulder would leave the commander's post 0.4 m in the air; the ammunition boxes are their own (the fitting's can
  is off); the left rangefinder end proud of the casting (x 0.84-1.05; the right one sits half under the cupola); the
  ventilator's drum and dome to 2.57; suspension-arm housings under the hull's edge 0.40 m ahead of each road wheel (x 0.88-1.10, y
  0.36-0.55); the tow cable along the left fender boxes; the short bar on the right front fender (x -1.89..-1.28); lift
  eyes on pads at the roof's front (top 2.64) and rear, just left of the centre line (2.69); the searchlight housing 0.63 deep (z 1.83-2.45);
  rucksacks out to 1.50 (left) and 1.60 (right); the bustle rack floor at 1.99, load 2.03-2.43; the jerrycan leant
  against the dome's left rear; the rear-plate box (x -0.42..0.20, to z -3.25); the driver's hatch at z 2.25 and three
  periscopes at 2.455; the bow towing eyes and shackles at the model's z 3.24, each on a bracket plate back into the nose (in
  plan the ring alone left a pocket against the casting's edge; moving the eyes 4 cm back instead cost the side hull
  trace a point); no lamp hoops (the guard bar is the model's top at 1.51).

## Construction work order (landmark sheet)

- Shape sentence: a cast boat hull whose bilge bulges to 1.33 m half-width at 1.05-1.10 m high, shelves in under the
  track's top run to 1.08 m at 1.25 m (the model's bilge-to-waist slope ran through the belt's inner edge) and rises
  inboard of the track to a deck edge at 1.51 (front) and 1.62 (engine deck), with a raised engine-deck hump 1.85 m high and a boat bow rolling
  down to a 1.07 m nose; an egg-shaped dome 2.48 m wide on its floor, roof 2.54, nose at z 1.86 and tail rolled under to
  -1.51; a thin cast gun shield leaning back 25 deg from 0.43 m ahead of the trunnion; the searchlight on posts ahead of it.
- Hull: 24 landmark stations (keel, chine knee, widest bilge, waist, deck edge, engine-deck hump, crown) read off the
  oracle's sections; the curve between landmarks is a first-party quadratic span with a measured bulge
  (`M48_HULL`). Dome: 23 stations with knots at the floor corner and 18/52/84 % of each station's height plus the roof
  edge (`M48_DOME`), so the loft never twists. HIGH inserts one Catmull-Rom station between rows and shades every span
  as one casting; LOW keeps the measured rows.
- Equipment reseated on the new surfaces (`landmarkSeat` topAt/sideAt): fenders with inner front skirts and idler braces;
  fender boxes; the left front round lid; the right front bar; driver's hatch and three periscopes; headlight groups
  with guards; bow and rear towing eyes; engine-deck hinges; the rear grille doors, tail lights and guards, final
  drives, pintle; low-profile cupola with the domed hatch and the commander's M60D on a rim pintle; loader's hatch with
  hinges and M60D on a post; gunner's sight hood; rangefinder ends; front lifting eye; the bustle rack round the tail
  with the spare road wheel (the running gear's own `m60a3-cast-spoke` construction), bedroll and bags; the ventilator;
  jerrycan; the flank racks (two tiers of ammunition boxes on the left, boxes and a bag on the right) under handrails;
  helmets; antennas; the shield's boss, ports, searchlight posts and rails.

## Gap table — release 260 build vs sources vs release 262 build

| Item | Release 260 build | Source | Release 262 build |
|---|---|---|---|
| Hull length with fenders | 6.79 m | 6.871 m (AFV48); owner model 6.93 | 6.93 m over the hull rig (fender tips, rear grille) |
| Width over tracks | 3.631 | 3.632 m (115 in centres + 28 in track) | track 0.711 on 2.921 centres; 3.685 over the end-wheel hubs |
| Height | 3.749 (top) / 3.09 spec | 3.061 m over the low-profile cupola | roof 2.64, cupola 2.86, spec 3.06 |
| Belly / ground clearance | 0.626 | 0.419 m | 0.43 |
| Turret casting | 2.96 W × 0.99 H × 3.04 L (old print's 1.48 half-width) | owner model: 2.40 W, floor 1.83, roof 2.65, nose z 1.86 to tail -1.12 | 2.36 W × 0.80 H × 3.00 L; floor 1.84, roof 2.64 |
| Turret ring | z 0.563 | 85 in (2.159 m); owner model's ring well centre z ≈ 0.48 | z 0.48, y 1.595 |
| Road wheels | 6, r 0.34 | 6 dual, ~26 in | 6, r 0.33, 0.80 m pitch (owner model) |
| Return rollers | 5 | 5 on M48A1-hull A5s (3 on A2 hulls) | 5 at y 1.15 |
| Track-tension wheel | yes (z -2.487) | absent on M48A3/A5 (AFV48; photos) | none |
| Gun | M68, trunnion 2.10 at z 1.514 (258 owner fix) | 105 mm M68 L/52; overall 9.307 m; axis 2.00 m; eccentric evacuator | on the model's bore 1.921, pivot z 1.7616; muzzle 5.827; the model's stations: tube 0.185 to z 2.79, 0.17 to the collar, square-ended evacuator 3.540-4.110 (0.256 across, 1.5 cm above the bore), chase 0.165 then 0.16, muzzle band 0.172 |
| Gun limits | +20 / -9 (M60A1 donor) | +19 / -9 | +19 / -9, measured depression curve |
| Cupola and MGs | commander M2, loader M60D | low-profile cupola + commander's M60D, loader's M60D | low-profile cupola (r 0.45) + M60D on a post beside it; loader's hatch + M60D on a post; both on the model's bores |
| Searchlight | on the mantlet | over the gun shield | on brackets over the tube, ahead of the shield |
| Smoke dischargers | none | not confirmed on US A5s | none |
| Rear | louvred plate | grille doors on the upper rear plate | grille doors, tail lights, pintle, phone box |

## Evidence matrix (release 262, owner-model round)

| Gate | Status | Revision | Command / artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | raw `a7c37097…` | rigid 180 deg about y, scale 1; datums above from `~/cot-lanes/patton-262-evidence/source-m48a5/` | none |
| Landmark construction (no sampled contours) | PASS | lane WIP | `M48_HULL` 24 rows, `M48_DOME` 23 rows of named knots + span bulges | the dome's lower band undercut is the model's |
| Closed shells | PASS | lane WIP | `.qa-dev/patton262/loft-topology.mjs` (base-shell-integrity): hull and dome, HIGH and LOW: boundary 0, nonmanifold 0, inconsistent 0, crossings 0 | HIGH hull had 6 open cap edges before `preserveCapBoundary` |
| Proportions | PASS | lane WIP | `pattonCastProportions.selftest.mjs`: hull 6.932 x 3.694 m, casting 3.37 x 2.48 x 0.93, 5 rollers, glacis 63.4 | width 1.7 % over the published 3.632 (sprocket hubs) |
| Gun rig parity | PASS | lane WIP | `gun-barrel-align-census --rigs --update`: turretPivot (0, 1.633, 0.58), gunPivot (0, 0.288, 0.934), length 4.313, r 0.0875; M46/M47 rows refreshed too | 0 mm |
| Independent critic | ROUND 1 DONE | r15 | subagent over `cmp/r15/*` (side 7, top 7, front 5, rear 6, turret 6, hull 8, mantlet 7) | fixed in r16: air cleaners, staggered wheels, slim flank racks and rucksacks, MG stations and ammo boxes, shield foot/bow, lamp, brush guards, shackles; the "shallow turret" is the stale turret seat (anatomy regen) |
| Registered geometry gate | 70.0 / 92 (certified frame, round 19); refit, re-queued (round 20) | lane WIP | `geometry-gate.mjs --ids=m48a5_patton` via the capture queue; offline copy `~/cot-lanes/patton-262-evidence/tools/gatesim.py` (same cameras, masks, traces, curve score, slab stations, source ruler; reproduces the real gate within about a point) | estimate after the refit: hull 93.5, whole 92.6, turret 94.5, stations 96.9, dims 95.3 |
| Gun clearance / depression curve | NOT RUN (geometry changed) | | `gun-depression-sweep.mjs --ids=m48a5_patton`, `pattonGunClearance.selftest.mjs` | the 258 curve fails at yaw -161 on the new engine deck |
| Anatomy fixpoint, fills, markings, seats, spare track, ledger | RUNNING | | ids-scoped chain | |
| Release check, icons, hero cards, drawings | NOT RUN | | | |
