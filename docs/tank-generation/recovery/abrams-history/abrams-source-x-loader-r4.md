# Abrams Source X — loader assembly R4

This is a bounded replacement of the old loader foot/pintle, receiver/feed/stock/grip and two outer shield groups. The existing loader barrel, its local matrix and its complete parent-group rest transform are preserved exactly. Inboard loader and commander shields are outside this correction.

## Evidence and ownership

The complete owner-supplied SEP v2 OBJ remains unchanged (SHA-256 `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`). All 143 owners participate in complete-source first-hit and air queries. The canonical metre frame is `[-rawX, rawY + .203945, .357965 - rawZ]`. Independent scalar/plane studies, not source vertices, topology, UVs or textures, drive the new authored stock.

The unchanged loader local frame has canonical origin `[.840, 2.69153, -.06037]` and yaw `atan2(.829, .559)`. Source98 supplies the base and bearing; source97 the intervening fork and shields; source99 the cradle, guides, pins and feed holder; source102 the receiver and open rear stock; source100/101 the directly seated container and feed; source103 the two inclined panes.

The pre-edit `Equipment.ts` and full high/low emission inventory were retained before wiring in ignored packet `abrams-loader-before-sKRV8p`. The regression authenticates the exact old barrel buffer and matrix, whole loader-group matrix, and 26 unrelated shield emissions, including their ordering and transforms. The parent’s CROWS/CITV tests independently derive their exclusions from older immutable fixtures rather than blessing a new candidate hash.

## Physical corrections

- Source99’s thin folded leaves and open guide replace deep rectangular brackets. The mounting chain uses the real thin source98 base, bearing rim, separate source97 fork floor, transverse pins, cradle saddle, raising feet and receiving eyes.
- The receiver cover retains its wide rear side bulge but narrows before the forward section. The tiny source4098 curved rod is a rod, not its filled bounding rectangle.
- The rear stock includes separately authored return stock and two real open loops. Complete-source empty lanes through and beside the descending loop remain empty.
- The two outer shields use the source’s inclination and thick glazing; unrelated shield stations remain unchanged.
- The container lid uses the actual source100/0 and100/82 thin rear leaves and alternating rolled knuckles. Independent packet `abrams-loader-hinge-source-KB31ut` measures the approximately 3.72 mm knuckle radius and sloped axis. Three opposing finite complete-source rays through the approximately 0.57 mm cap seams are empty: the supplied model has no axle through those locations. A concealed 0.8 mm-radius native axle is an explicitly approved mechanical accommodation, not a source-measured part; the surrounding slots remain open.

The mount/weapon subset contains 40 closed mounting stocks (1,192 triangles) and 36 closed weapon stocks (2,408 triangles), plus the unchanged barrel. Small curved sections are analytic approximations: faceted round receiving eyes, a spline rear loop, and sparse-station curved rods. These do not claim exact source tessellation. The independent full-scene test bounds selected first-surface residuals at 3.5 mm; it does not claim every micro-fastener is source-exact.

The separately frozen container/feed helper contains 79 closed stocks (1,958 triangles). Its source-held-out surface residual is at most 32.763 µm, with four additional hinge surfaces bounded at 0.15 mm. Its independent contact graph proves all 79 parts reach the existing mount/weapon through finite stock intersections. Three approved small accommodations are explicit: an 8 mm container foot extends 1.5 mm downward across the source’s approximately 1.2 mm tray gap, a 2 mm receiving pin supports the source-disconnected belt, and the 0.8 mm-radius hinge axle connects the alternating knuckles. The container foot has 0.292 mm actual tray overlap. These are not attributed to supplied source geometry.

## Frozen focused verification

`src/vehicles/abramsSourceXLoader.selftest.mjs` checks high/low builds of all seven conventional Abrams X IDs at three turret/main-gun poses. It uses actual visible first-party meshes, excludes hidden LOD/shadow/marking meshes, and keeps physical glazing in the ray targets. It checks closed outward stock, fixed complete-source surfaces and air, actual positive mounting contacts, and exact barrel/other-shield preservation. All source targets predate the corresponding construction.

The first collar topology rejection was retained: an independently generated cylinder had an unpaired periodic seam at local X=0. The replacement uses one closed sixteen-point ring at each axial station; no source, datum or acceptance tolerance changed.

The final integrated test passed with all helpers frozen, in `abrams-loader-focused-final.log` (exit 0). It covers all seven high/low builds at three poses: 42 actual posed scenes, 402 original source surfaces (maximum error 1.739685 mm), 252 feed surfaces (32.7628 µm), 168 hinge surfaces (45.9403 µm), and 546 complete-source air checks. The unchanged barrel buffer/local placement/group transform and 26 unrelated shield emissions remain exact. The separately checked 33-part shield helper passes its 12 applicable urban poses, including both toe/link/fork receiving chains, canted thick panes, source first surfaces, real air and the two CITV approach lanes.

Final log SHA-256: `56727e874919da47b0c29a7094d76c3f65cf324a5ddf988ed235e9d939a66938`; integrated test SHA-256: `a22f4429a0afbf1dba6128501f933428e74b401fb981d0e5164f0284000a2d09`.

The final urban replacement comprises 188 authored stocks: 40 mount, 36 weapon, 79 container/feed and 33 outer-shield parts, plus the unchanged barrel. Nonurban variants omit the 33 outer-shield parts. These counts identify only this bounded assembly, not the complete tank.

Anatomy, generated cards/assets, full-scene visual comparisons and release gates remain parent-owned; this focused result does not waive their existing failures or establish whole-vehicle acceptance.

Two intermediate combined runs are separately retained. The first rejected a test name-prefix collision, resolved by the distinct `LoaderSourceFeedAssembly` provenance prefix without changing geometry. The second crossed an unfinished shield link and rejected its clockwise contour before scene construction. Neither is reported as a source-surface pass. The final combined test contains six independent complete-scene container/feed first-hit targets bounded at 0.2 mm and a true inter-round negative-space ray, plus four source hinge targets bounded at 0.15 mm and six radial air approaches outside the explicitly authored axle.

