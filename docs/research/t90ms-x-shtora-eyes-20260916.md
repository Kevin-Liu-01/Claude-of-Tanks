# T-90MS X — OTShU emitters on the turret-front housings (2026-09-16)

Owner (with a screenshot of the study's turret front): "add proper shtora eyes to these on the
t90ms tagil." The two housings flanking the gun (`aps()` in `src/vehicles/profiles/t90msX.ts`, at
x ±0.6735, y 2.095, z 1.65–1.86 in the hull frame) carried blank dark face plates. The plates are
replaced by the shared OTShU-1-7 emitter set (`addShtoraEyes`, `profiles/shtora.ts`): housing, ring
and red night lens (registered with the vehicle night lighting), three louvre bars, side plates and
the lower bracket, at scale 0.9 so the set sits inside the 0.44 m housing front with the lens face
proud of the old plate line. Fills regenerated for the study (WATERTIGHT); per-id chain; receipts
(second-wave optics, night lighting, Soviet aux armour, second-wave ERA, the T-90MS X gun base /
mast / hull ends, second-wave geometry, visible wheel faces).

**Blue lenses (owner, later the same day: "make the t-90ms tagil have blue shtora eyes").** `addShtoraEyes`
takes `lens: 'red' | 'blue'`; the blue tint (0x0c2a5a, emissive 0x1a4a9a) is a second cached material on
the port (`_shtoraBlue`), still registered as a `shtora` night lens. The T-90MS X passes `lens: 'blue'`;
every other Shtora carrier keeps the OTShU red.

