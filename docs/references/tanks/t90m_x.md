# T-90M X — owner-source inventory

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**97.56429956277442**, minimum whole view **97.51675310915113**, and raw
geometry minimum **93.14513510569317**: [exact fidelity](t90m_x.fidelity.json),
[exact geometry](../../geometry-gate/t90m_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero. Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

The independent `buildT90MX` and focused actual-geometry tests are
implemented. An earlier scoped 2026-09-06 proof recorded fidelity 97.60 and
primary geometry 93.1; every valid component/view is ≥92, official band/shoe/
full-sweep intersections and body-contiguity holes are zero, and actual
visible MG census is one. Fleet-wide release integration subsequently passed.
The existing T-90M variants remain unchanged.

Independent shaded review found and closed an overfilled forward RWS housing:
the new clipped/stepped original housing preserves the source's real forward
and crescent air. Held-out high/low source rays and the fresh neutral board
confirm the repair; the exact-visible MG uses the original authored receiver
and barrel surfaces rather than a marker-only census waiver.
The [full fidelity receipt](t90m_x.fidelity.json) preserves the exact tool row.
The [engine-deck scalar receipt](t90m_x.engine-deck.json) pins the separate
sloped lids, spine, grille vanes and actual source ray witnesses.

Latest CPU refinement (after eighth proof): the independent
[hull-end scalar receipt](t90m_x.hull-ends.json) pins the new source-shaped
fenders, inner hanging plates, rear drums, inclined supports and cross-drum
pipe. The corresponding authored helper is `t90MXHullEnds.ts`.
The source's aft turret roof is broad and nearly level: at X 0.90/Z −0.80,
Y is 1.96962, while the forward shoulder at X 0.90/Z 0.507 is 1.92279.
The original sectioned shell now has station-dependent roof bevels matching
those actual rays, not a uniformly deep chamfer. The source internal rotating
neck radius is 1.05396 m, distinct from the exterior turret bearing seat.
The separate canvas cradle cover reaches Z 2.00585; original positive cloth
skins and side flaps retain the underside and barrel opening and pitch with
the mantlet. The rear basket has a short left corner and a long swept right
return, rather than a centered rectangular fence. None of these surfaces is
copied from source geometry. Subsequent numerical capture and final release passed.

## Source and provenance

Owner archive `t-90m.zip`, SHA-256
`2f8ab99994f55611cc53926233146f10411d005fd0651496c0bb00374f108303`.
Its `source/T-90M.fbx` SHA-256 is
`bcb94f3e4e815aa5c18025e34ce12a3e5f42fd1047a60fd8539691c729c2351f`.
The 205,998-triangle geometry and title match
[T-90M by minehffd](https://sketchfab.com/3d-models/t-90m-2e31a3cf16b04f0180b9387df5198c9a),
whose primary listing declares CC Attribution. The FBX records a Blender
4.2.8 export; the archive includes conventional separately authored PBR maps.
No confirmed commercial-game extraction evidence was found. Source assets
remain local-only comparison inputs and must not enter a playable asset path.

## Unmodified geometry inventory

- 119 mesh nodes, 205,998 triangles, no animation actions.
- Source Blender world is Z-up with the cannon pointing toward **negative X**.
- Whole raw envelope: X -9.984768…6.224649, Y -3.062158…3.121351,
  Z -1.482856…3.381938.
- Uniform width registration to 3.78 m gives 2.9739 m total height including
  furniture and 9.9089 m overall length. These are raw measurements, not
  accepted published dimensions or permission to compress roof hardware.
- `Hull chassis` and `Turret` are independent top-level meshes. Native hull
  children carry paired road wheels, separate track courses and fender kit.
- Six road-wheel stations are paired within each of six wheel meshes.
- `Main barrel` is an actual child of `Turret`; its local origin is
  (-1.850282, 0, -0.075305) relative to the turret. Its raw world trunnion
  is (-1.977298, 0.026368, 1.147996).
- The turret world origin is (-0.127017, 0.026368, 1.223301).
- Some mantlet components remain separate turret-owned meshes and must be
  explicitly audited before gun-pitch comparison; naming alone is not proof
  that the complete mantlet follows the barrel.

The raw hull body spans 10.742244 source units longitudinally. Its bounding
planes, external rear drums and fender tips must be measured separately before
declaring hull-centred normalization. The older repaired T-90M oracle is not
the authoring source for this addition.

Required certification: independent source-measured primitive hull/turret,
92 minimum in every valid source component/view, dimensions within 3%,
source-specific hardware, native single moving shoe course, seated armor,
positive body skins, independent shaded review and normal anatomy/release
gates. No source vertices, indices, textures or material payloads may ship.

## Final structural registration

The game-axis map is `(-sourceY, sourceZ, -sourceX)`. The intact closed
237-vertex main hull establishes structural Z ±3.43. Scale XY is
0.6113032889 and longitudinal scale is 0.6386001888, applied equally to the
hull, barrel, rear drums, cage and roof fittings. There is no separate gun
length correction and no reuse of the old repaired oracle.

| Source-fit measurement | Metres |
| --- | ---: |
| Structural hull length | 6.8600 |
| Exterior hull length including hardware | 7.8329 |
| Exterior width / complete overall length | 3.7800 / 10.3513 |
| Complete roof-equipment height | 2.9739 |
| Main turret shell width / length | 2.9532 / 4.0230 |
| Main turret roof / external chin | 2.0309 / about 1.37 |
| Muzzle Z / bore Y | 6.2542 / 1.60825 |

These external dimensions describe this source after structural-hull
registration, not independently published real-world overall dimensions.
The source turret includes a hidden internal column down to Y 0.879 within
the hull. That internal structure is not evidence of an exposed low chin.
The physical yaw seat uses the measured ring `(0.018092,1.336748,-0.104459)`;
the gun uses the meaningful native pivot `(0.001973,1.608251,1.140604)`.
Comparison grouping retains every neutral source face and follows original
turret ancestry; the main barrel, mantlet and coax are grouped by physical
ownership for pitch. There were no animation actions in the input.

Runtime geometry is a new closed tub, long low welded turret, individually
seated cheek modules, ammunition bustle, real open rear/side cage bars,
six measured native wheel stations, paired rear fuel drums, asymmetric
commander/optic/RWS stations and mast. The source's geometry/materials are
never loaded in play. The hash-checking `tools/t90x-source-oracle.py` only
recreates the ignored local comparison GLB and its numeric JSON receipt.

## Native shoe dimensional evidence

The unchanged canonical source's straight ground course measures 0.03338 m
through its outside shoe and 0.087072 m through the central guide. Its pin
row spans Y 0.003…0.03095 m, centred at approximately 0.017 m. The generic
single-pin family shoe is 0.308 m deep including its guide and does not fit
this supplied model. The X profile therefore supplies independent pad,
grouser, web, guide and pin dimensions to the same native shoe constructor.
Its actual generated shoe measures 0.086 m radially; the guide still projects
centrally, and there is exactly one moving shoe course. The selected family,
surface pattern, pitch, width and native animation remain intact.

This optional dimensional API does not change any existing family default.
`src/vehicles/trackShoeDimensions.selftest.mjs` pins the actual pre-change
shoe geometry hashes for the original T-90M, T-90A, M1A2 and Leopard 2A5,
checks default identity for every track family, rejects invalid dimensions,
and measures the new shoe vertices. The third scoped comparison improved
the T-90M X track profile from 88.32 to 93.16. Its valid turret/hull component
floors remain unmet; this is not overall release certification.

The source-only filtered body extent is 7.686 m long and 2.828 m high,
measured by the shared 1024-pixel/P95 geometry pipeline. The 6.86 m structural
hull, 7.8329 m complete equipment envelope and 2.0309 m main shell roof remain
separately recorded. Native face-depth tuning changes only the dish/hub
axial depth; the native tire, axle, wheel radius and moving shoe course are
unchanged. Shallow pressed faces are added through the existing native
suspension-bound face-layer API, so they cannot remain parked when a wheel
moves or is thrown.

The source road-wheel hardware's actual outboard X is 1.66133 m. The
focused native-shoe test measures the added pressed faces/rims/hubs/bolts
and requires all twelve instances to share the actual tire's rotation and
terrain-conformed Y/Z translation. It also retains the pre-change original
fleet shoe, tire, disc and inset buffer hashes.

The driver hatch is independently measured as 0.5211 × 0.0158 × 0.385 m
at (0.002,1.3456,1.6383); this source has one central periscope, not the
draft's generic three-window layout. The corrected rear drum body measures
0.8383 m axially, 0.5832 m vertically and 0.6092 m longitudinally. Its
retaining straps are about 0.064 m wide, at X 0.329 and 0.810 on the right
drum and mirrored on the left. Real asymmetric rear covers, seated grille
frames, hinge barrels and fasteners supplement the closed structural deck.

The source hanging side plate has inner/outer X 1.73214/1.75236 m at
ordinary stations and a lower edge near Y 0.745 m. Only the forward module
projects to X 1.83854 m. These are separate thin, seated solids, not the
draft's deep blocks. The intact source return curve reaches Y 1.04540 m;
its separate hidden return-roller meshes are absent. Three native support
circles at Z −1.65/0.37/2.096, Y 0.9354 and radius 0.101 m are explicitly
**inferred mechanical supports**, not claimed source mesh measurements.
Their inferred 0.188 m depth is inset from the shoe lane. The independent
outer track surface (source maximum Y 1.07880 m) remains the comparison
target. Thermal sleeves and the measured 0.11216 m-radius evacuator recoil
with the gun; the actual mantlet does not.

## Seventh local proof and physical corrections

The source glacis face is 2.0354 m wide, with three stepped fields spanning
approximately Z 1.949–2.168, 2.182–2.687 and 2.704–3.456 m. Rear turret
ERA supports top out at 1.600 m; separate narrow stowage cases rise to
1.947 m. Treating both as a full-depth 1.94 m wedge was incorrect. New
sections are original closed primitives; no source polygons are reused.

The seventh local proof passes every valid fidelity view (95.54 aggregate)
and official exact strict front/rear/full-sweep bands and shoes all zero.
At that seventh checkpoint, primary geometry remained unqualified at 81.5/92,
especially fixed-world
front and plan contours. Dimensions 100 and floater 100 do not override
those failures. Actual-mesh rays pin the stepped glacis field.

## Independent carrier and outer-curtain refinement

The five outer curtains are separate from the inner upper plates: their
main skins span right X 1.83690–1.84887 m, with scalloped hems at
Y 0.42440 m and upper rail Y 1.32474 m. Their Z intervals are
−1.14978…−0.49198, −0.46946…0.18835, 0.19725…0.85505,
0.86214…1.51994 and 1.53518…2.19298 m. The front terminal cuts up to
Y 0.75055 m at Z 3.16029 m. The rear rack uses 3.06 mm horizontal
bars over Z −3.08622…−1.10804 m, with genuinely open standoff air.

Independent owner-source triangle/ray checks identify the outboard turret
carriers as canted solids with folded outer returns, not filled AABBs.
Top-ray witnesses (X,Z → Y) include −1.45/0.50 → 1.88519,
−1.60/0.50 → 1.83105 and −1.73/0.80 → 1.64384 m. These are
pinned against actual first-party meshes with 24 mm tolerances. The ERA
course is centered at the measured X 0.018092 m turret datum, preserving
its 36.184 mm left/right world-coordinate offset.

## Gameplay binding follow-up

The eight inherited ERA zones bind the unchanged actual glacis, forward side
curtains and cheek cassettes. The rearmost reactive cheek pair—not stowage
boxes—owns each `side_era` zone. Passive aft curtain/cage, hanging rails and
folded supports remain fixed. See [the exact-face binding audit](t90-x-era-binding.md);
fresh anatomy and shaded release evidence subsequently passed with this repair.
