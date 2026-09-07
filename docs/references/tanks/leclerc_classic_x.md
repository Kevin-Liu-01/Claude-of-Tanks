# Leclerc X — independent older supplied-file reconstruction

Status (2026-09-07): geometry frozen after the final aft-fold scoped proof.
Raw fidelity98.54449425350678 and raw geometry93.75965200216521 pass, with
every registered valid view at least92, all strict band/shoe/front/rear/sweep
checks0, continuity0 and actual roof-MG1. The first failed proof is retained
below as historical evidence. Complete mandatory anatomy, presentation/assets
and release integration remain pending; this is scoped qualification only.
Runtime ID `leclerc_classic_x`. User requested both supplied Leclerc files as
separately named playable X models and confirmed supplied-file proportions take
priority. `leclerc_x` is the separate **Char Leclerc X** reconstruction.

## Reference and provenance

Local comparison-only input: `leclerc_tank.glb`, SHA-256
`5af3259ad6273c967e3a81b7f785a177478f87e8690376e696f827f133549707`.
The [older June-2024 model](https://sketchfab.com/3d-models/leclerc-tank-732a16cdf688490698ba4231921ece03)
is credited to andertan and declares CC BY 4.0. The same author's later
[Char Leclerc revision](https://sketchfab.com/3d-models/char-leclerc-84a0918d2f534c2eb003ab3cb3029c03)
describes a retexture. Neither file establishes an S1/S2/XLR historical label;
none is invented here. These are distinct supplied model revisions, not proof
of two distinct real-world production standards.

The older file has 936 nodes, 473 mesh primitives, 20 materials, no animations,
and mostly sibling objects. No source positions, indices, connectivity, UVs,
textures, or source rig are copied into the runtime. Kevin B. Liu remains the
first-party procedural author under the project authorship record.

Root-produced canonical comparison file:
`public/models/community-candidates/leclerc_classic_x_source.glb`, SHA-256
`e1a3fa18589075da9fbe0bd19fb504ca1e3d579eae52b926c1d73a43e432e4f0`.
The complete quarter/rear/side/front and detail-top source stills in ignored
`.qa-dev/reports/leclerc_classic_x-source-*.png` were inspected before the
first candidate comparison. The top still crops the far tube and is not used
as complete-envelope evidence.

## Approved physical frame

Raw source world axes are +Y up and +X forward. The proper rotation is
`[X,Y,Z] -> [-Z,Y,X]`, uniform scale `1.1540932860777133`, followed by translation
`[-0.0613031917366245,-0.13786858366183144,-0.3801902062961502]`.
Scale anchors the actual paired forward guards' full width to 3.600 m; their
raw span is 3.119331897540895 m. Ground comes from the source track minimum.
The hull center uses actual aft fuel-carry bracket and forward guard extrema,
not the long gun or the arbitrary source object origins.

Full source frame: X ±1.800 m; hull Z ±3.71963792937 m; muzzle
Z 6.31453175175 m; highest fitting Y 3.19835755241 m. Thus hull length is
7.43927585874 m and full gun-forward length 10.03416968112 m. Main structural
turret roof is Y 2.4667723048 m, distinct from the panoramic head at 2.886042 m
and highest antenna stocks. These supplied proportions are not a claim of
agreement with published physical vehicle dimensions or filtered P95 metrology.

Inner circular bearing Object173 provides the yaw-axis X/Z; chosen bearing
height gives `[-.0162842395776,1.47698078437,.561125178827]`. Outer collar187 is
about 4 mm offset in X/Z and is retained honestly. The flat hierarchy has no
pitch rig: the measured circular gun axis is X .00612553759845 / Y1.95678372667;
Z2.45012127254 is an inferred pitch joint at the visible rear tube attachment,
not a recovered internal trunnion.

## Semantic comparison ownership

All source geometry remains included. Existing primitive numbers identify
whole original meshes, never extracted triangle subsets:

- Gun: 714,715,717,719,720,722,723 (tube, rear bore disk, forward ring and MRS).
- Turret: 187; all existing meshes in 677–690, 725–859 and 865–875.
- Running gear: all existing meshes in 191–229, including track courses197/229.
- Hull: every remaining mesh. In particular 692–712 are front guards/fittings,
  861/863 are hull skirt sheets, and 877–935 are hull/internal details despite
  appearing after the turret in the flat source list.

Object728 is named `gun.001` but occupies the long central roof/spine behind
the actual tube, not the firing barrel; it remains a turret follower. The
main turret mesh includes a fused forward housing. The runtime separates a
closed pitching mount at the inferred joint without claiming the source has
a separately authored pitch mesh.

## Independent construction and retained air

The older file differs from Char in hull length, paired-wheel spacing, source
longitudinal wheel offsets, forward guard span, round main tube and MRS forms.
No old vehicle builder is called or transformed. Shared low-level closed
loft/lathe and suspension primitives are permitted only with this file's own
measurements. Required negative spaces include the gunner window, panoramic
mouth, port roof well, open rear rail basket, central tire grooves, true track
connector gaps and open main bore.

The main tube's front cavity is physically open to its actual source disk at
Z4.60643577576; mouth inner radius is approximately84.34 mm. It is not forced
to a nominal120 mm caliber opening. Published caliber and source opening
proportions are distinct evidence. Root owns eventual oracle conversion,
integration, mandatory anatomy/technical assets and complete release gates.

## First-draft physical checks and disclosed departures

The actual registered factory, not a donor-mapped substitute, is tested in
both high and low detail. The gun muzzle marker is exactly
`[.00612553759845,1.95678372667,6.31453175175]`; the actual world envelope,
independent left/right road-wheel stations, optical first surfaces and true
air, recessed basket floor and deep circular bore are checked. Actual gear
updates across48 fractional-link phases retain ground contact and all axes.

The initial custom track course mistakenly passed endpoint wheel radii to the
course helper while changing only the separate `trackR` fields. This made the
links about24mm too long and43mm too tall. Explicit independently measured
course radii now leave fore/aft full-link extrema within6mm of the source;
the native finite rigid-link upper envelope retains a documented16mm excess
(20mm test bound), without shrinking the physical idlers or moving axles.

Source guard692 itself intersects the unmodified source track229: at
X1.4/Y.98 its stock interval is Z3.332559..3.453760, while the track interval
is3.316791..3.373569. The native preserves the external front and roof planes
but replaces only this concealed, impossible solid with a closed8mm folded
shell and real internal track air. Parent approved this construction repair;
the oracle, visible dimensions, masks and strict gates are unchanged. The
initial strict CPU failure (126 front/sweep band voxels,4 shoe voxels) was
retained in task evidence. The corrected front/rear/full-sweep scan reports
zero band and shoe intersections.

All four actual rear carry stocks160/253/257/259 use their measured broad
cheeks and92.583mm stepped center channels, not an empty box or a single
generic bracket. Front caps694/712 retain their shallow roof, steep face and
13mm lip instead of the initial incorrectly sloping wedge.

## First complete proof and bounded roof correction

The first full proof at2026-09-06T22:31:51.517Z retained raw fidelity
96.05923937509766: whole98.4957776313, hull98.3576248830,
turret96.4459648458, gun83.0944398687 **FAIL**, tracks96.6973153751.
Geometry retained hull93.4558674219, whole93.5477252938,
turret91.8153775935 **FAIL**, stations96.9284200176, dimensions0 **FAIL**,
floaters100. Official front/rear/full-sweep track bands and shoes were all0,
continuity0, and the actual native machine-gun census1. Exact original rows
remain in ignored `.qa-dev/reports/leclerc_classic_x-classic-first-batch-`
`fidelity.json` and `geometry.json`; later results must not overwrite them.

Two source-specific comparison contracts were corrected independently of
physical geometry. The initial dimensional report compared filtered source
and native heights (both2.8785525m) with the structural roof2.4667723m, and
filtered hull spans (both7.1117180m) with full physical7.4392759m. This ID now
uses the existing hash-certified source-only fixed ruler, paired instrument
definitions, and three additional complete physical-envelope guards. No
candidate scaling, reference deformation, threshold or raster change is made.

The initial direct gun masks included the native pitching mount beginning
Z1.975m, whereas the source gun owners beginZ2.4501213m: its mantlet is fused
into complete turret Object689. Direct areas1564/1875 and bounds138×16/154×17
were not semantic peers. Classic now uses the existing **scored exposed
cannon-overhang** policy, not a missing/N/A gun score. Its initial exposed
areas1013/1017 and equal90×15 bounds corroborated the independently tested
barrel stations and muzzle. All complete source owners, whole views,
hull/turret cardinal components and tracks remain present and mandatory.

Post-baseline physical roof work restores Object725's actual145mm-deep port
coaming, raised inner bevel and canted forward closure, and the separate
16-sided crew support. The609mm crew cap687 now has its actual2.453546m
outer annulus, stepped smaller central boss, depressed channels and ten
raised radial lands instead of a solid disk at its narrow central maximum.
The non-source, gameplay-required supported MG is explicitly reseated39mm
lower on the corrected cap; it is not claimed as a source feature. The small
central mast746 retains its measured130.91mm-wide enlarged head and forward
inclined underside rather than the initial false pointed cone.

The rear basket now uses diagonal corner stock with positively joined bends,
the actual269.12mm difference between its left/right forward ends, and the
thin chamfered source floor748 around the retained raised plate842. The floor
is given6.30mm closed native stock (source plane/frame separation) instead of
shipping a one-sided source sheet. Genuine cage air stays open. Principal
roof curved transitions and radial-land corners remain independently ruled
approximations; the exact floor, rim, coaming air, mast head and basket corner
held-outs are tested on the actual high/low factory. Their fresh proof is
recorded below, separately from the subsequent exposed rear-fold correction.

The paired bow lamps243/281 now retain their independently different canted
roofs and lateral positions, two marker pockets and curved recessed closed
lenses247/285, rather than a mirrored solid headlight box. Exact center first
surfaces, hood crowns and real forward air are checked. Source401's canted
rear plate now mounts the upturned exhaust411; the latter has its221.31mm
outer diameter,192.77mm clear mouth, floorY1.53314364 and rimY1.648367.
The bend uses an original smooth quarter-circle primitive between measured
endpoint sections; fine source tessellation and bevel variations are not
copied. High/low tests verify the mounting face, open throat, floor and rim.
The complete source/current strict CPU front/rear/sweep checks remain0 after
these equipment additions.

The roof/equipment proof at2026-09-06T23:08:10.301Z passed raw fidelity
98.50148376252378: whole98.8912704891671, hull98.56543232175947,
turret97.77245686600445, scored exposed gun99.64920339721746 and
tracks96.6973153751055. All required whole/component views passed. Geometry
passed minimum93.73923869500841: hull95.18486962220787,
whole95.53304058798669, turret93.73923869500841,
stations97.81994693146484, dimensions100, floaters100. Official strict
bands/shoes/front/rear/sweep were all0, continuity0 and actual MG census1.
Exact rows remain in ignored `.qa-dev/reports/leclerc_classic_x-roof-equipment-`
`fidelity.json` and `geometry.json`.

Independent neutral and complete-source review still found an exposed aft
roof mismatch, which was not waived by these passing scores. The overlying
canted bin804 actually covers much of the apparent discrepancy and is left
unchanged. Outside it, source725 is absent atX1.25/Z−1.90, where the first
source surface is lower turret689 atY2.052643; the old rectangular native
terrace rose to about2.339. The exposed central fold atX−.13/Z−1.90 is
Y2.208530 instead of a flat2.344 roof. A new original three-cell closed
plane construction preserves the measured two-stage aft folds and the
clipped outboard footprint; its forward bevel atX1.30/Z−.60 isY2.256898.
No source triangles or connectivity are reused. The original concealed
Y2.14 lower stock remains for attachment (up to17.85mm thicker than the
source sheet), without extending the visible outer footprint.

The exposed mast support856 is now its actual215.08×115×373.15mm closed
stock, including the37.68mm-deep rear pocket and separate backing at
Z−2.048056. It contacts both the retained mast foot and forward roof; it is
not a new inferred pedestal. Full high/low tests retain the older optical,
barrel, gear and48-phase contact witnesses and add genuine outer-corner
air, fold planes, pocket depth, support engagement and unchanged bin
witnesses. Strict CPU bands/shoes remain0; source frame and overall bounds
are unchanged. The final aft-fold proof at2026-09-06T23:21:59.403Z passed
raw fidelity98.54449425350678: whole98.87459870871407,
hull98.56543232175947, turret98.01668493671227, scored exposed
gun99.64920339721746 and tracks96.6973153751055. Every required view
passed. Final geometry minimum93.75965200216521 comprises
hull95.18486962220787, whole95.53304058798669,
turret93.75965200216521, stations97.81994693146484,
dimensions100 and floaters100. Official strict bands/shoes/front/rear/sweep
remain0, continuity0 and actual MG census1. Immutable ignored receipts are
`.qa-dev/reports/leclerc_classic_x-final-aft-fold-fidelity.json` and
`leclerc_classic_x-final-aft-fold-geometry.json`. Geometry is frozen; mandatory
fleet asset/anatomy/release integration remains a separate parent workflow.

The source omits an exposed roof weapon. A small supported, recoil-independent
roof MG is an explicit native-only gameplay addition; it is not claimed to
be source geometry. Return-roller stock, internal roots and minor closures
remain bounded construction estimates. Fine grille bars, fasteners and some
small roof hardware are simplified or omitted. The native casting is more
regularly faceted than the supplied model; passing outline scores do not
assert identical fine surface tessellation or material fidelity.
