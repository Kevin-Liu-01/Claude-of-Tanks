# Stridsvagn 103 first-party fixed-mount re-certification

Date: 2026-08-13

Playable id: `strv103`

Freeze: `f4deeb6b` (33 meshes / 66,961 vertices)

## Authorship and reference boundary

The active vehicle is wholly repository-authored procedural geometry from
`src/vehicles/profiles/casemate.js`. Published dimensions, public photographs
and the component inventory in `docs/references/tanks/strv103.md` informed the
design. A retired external print was mounted read-only for the frozen paired
comparison only. No mesh, vertex/index payload, material, texture, UV, rig,
animation, node hierarchy or converted source geometry was copied into the
builder. That print, its runtime/candidate registration and its shipped license
record have now been removed.

## Source-semantic visual sitting

The final evidence packet is
`/private/tmp/strv103-final-r7/strv103/{paired,yaw0,yaw90}`: 15 paired boards,
15 yaw0 frames and 15 yaw90 frames, including the standardized elevated-left
profile. Fresh standard-order appraisal records:

`[9.0, 9.1, 9.0, 9.0, 9.0, 9.0, 9.0, 9.1, 9.0, 9.1, 9.0, 9.1, 9.0, 9.0]`

Floor 9.0; mean 9.03. This is a first-party source-semantic appraisal, not an
independent critic score. The packet preserves the low turretless wedge, fixed
L74, louvred glacis, folded dozer, flotation rim, four-wheel hydropneumatic
stance, compact cupola/MG suite, engine-deck fans and backed rear service face.

## Fixed-mount ownership

The Strv 103 has no physical yawing turret. Accordingly the supplied yaw views
show the correct invariant hull-owned model; no fake visual quarter-turn is
claimed. The sim still exposes its virtual fire-control articulation contract,
and the runtime rig probe passes all 10 checks. The fixed gun, cupola, fittings,
deck kit and rear service package remain visibly seated on the single hull
structure with no stranded, abutting or dangling parent nominee (0/0/0).

## Running gear and geometry gates

- Exactly four large dished road wheels per side.
- Correct Strv exception: front drive sprocket and rear idler.
- Two supported return rollers and one continuous native linked course.
- Exact front/rear band containment: 0/0.
- Exact front/rear shoe containment: 0/0.
- Full moving track sweep: 0/0.
- Winding mode 1: 0 reversed / 0 mixed / 0 deficit pixels.
- Winding mode 2: correctly skipped because the visible model is fixed-mount.
- Muzzle-bore contrast: 53.7, pass.
- Canonical seated MG fitting present; no decoration floats across empty air.

The historical fused-oracle geometry gate remains 37.1 and is explicitly not
represented as a 90+ machine score. Its published-dimension conflicts and lack
of component masks are documented in the tank reference sheet. Live visual,
physical, track, parenting, winding and runtime evidence govern this
first-party restoration without fabricating an oracle-compatible result.

Final disposition: **PASS / KEEP `f4deeb6b`**. Ordered owner-visible blockers:
none for this restoration.
