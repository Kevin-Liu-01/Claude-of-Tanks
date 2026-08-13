# Base T-90 first-party cast-turret and clearance re-certification

The active `t90` playable is entirely repository-authored procedural geometry.
The private comparison model is isolated to measurement and visual review; no
comparison vertices, converted arrays, materials, textures, rig, animation or
runtime wrapper enter the playable.

## Frozen candidate

- Geometry hash: `692a0eb9` (repeatable twice)
- Meshes / vertices: 69 / 114,432
- Fidelity: 90.60 aggregate, every measured silhouette at least 90.55
- Components: whole 91.72, hull 91.93, turret 83.96, gun 92.50, tracks 95.26
- Exact containment: terminal bands 0/0, shoes 0/0, full strict sweep 0/0
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed; one visually null pixel (0.00%)
- Rig: 10/10; muzzle contrast: 103.2
- Evidence: `/private/tmp/t90-clearance-final-r12/t90`, 45 PNGs / 45 hashes

## Geometry and pixel review

The rejected half-sphere primitive is not used. The turret is one explicit
eight-section asymmetric pear/cast loft whose shoulder, crown, mantlet valley
and rear-drop sections are authored in this repository. Irregular buried K-5,
Shtora shoulders, unequal smoke banks, roof stations, NSVT and rear fittings
break up and physically seat on that casting without copying comparison
geometry.

The central sponson underside now clears the complete native return course
while retaining the accepted deck and side silhouette. Six full-size road
wheels remain inside one continuous linked-shoe course with clean idler and
sprocket transitions. The forward spare-link course now follows the glacis on
a visible fixed seat outside the complete turret yaw envelope.

Fresh vector:
`[9.2,9.2,9.1,9.1,9.1,9.1,9.1,9.2,9.2,9.3,9.2,9.3,9.3,9.3]`;
floor 9.1, mean 9.19. All 45 frames were inspected. They show a genuine
quarter-turn: gun/mantlet, complete cast loft, K-5/Shtora, sights, cupolas,
NSVT, smoke, antennas and rear turret package rotate together. Glacis,
forward links, deck, skirts, rear service field, wheels and tracks stay fixed.

No fused duplicate turret, stranded fitting, empty-air decoration, donor
running gear, track collision, open sheet, sky-through wound or yaw-dependent
backface pop is visible. **PASS / KEEP `692a0eb9`; retire `35a932c0` and
`da6f7fba`.**
