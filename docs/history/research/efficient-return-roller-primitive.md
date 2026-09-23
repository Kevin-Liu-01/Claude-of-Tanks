# Opt-in efficient return-roller primitive

Status: independent authoring leaf; **no playable profile or factory imports
it yet**. It does not replace the frozen four-Leopard, KF51, K2 or T-14
physical candidates. Those candidates retain their own source/count limits,
station fitting and qualification status.

`efficientReturnRoller({quality,radiusM,axialWidthM,spindleRadiusM,
spindleLengthM})` returns caller-owned `rotor` and `spindle` buffers. Local X
is the axle. The caller supplies the measured shaft placement and existing
roller instance matrices; this leaf never selects vehicle IDs or stations.

The rotor is one closed stepped solid with a rubber crown, symmetric painted
shoulders and raised painted hubs. Its indexed faces form two contiguous
material groups: material 0 is rubber and material 1 is painted wheel metal.
The colored groups are **not independent closed solids** and must not be
split into incomplete collider stock. One instanced rotor uses the two
materials; the separate closed instanced spindle uses painted wheel metal.
All rotor faces have exactly one material. This is three material submissions
per assembly batch, not one submission for each profile ring.

| Quality | Rotor triangles | Closed shaft triangles | Complete per roller | Six instances | Eight instances |
| --- | ---: | ---: | ---: | ---: | ---: |
| HIGH | 128 | 32 | 160 | 960 | 1,280 |
| LOW | 64 | 16 | 80 | 480 | 640 |

The original KIT primitive plus the mounted shaft costs 336 HIGH / 192 LOW
per complete roller (actual KF51 census in the fit checkpoint). The new
leaf's geometry budget includes the shaft and every instance; sharing one
buffer does not erase draw triangles. It replaces overlapping cylinders
with a continuous rotor profile rather than removing required rollers.
HIGH uses rings of 8 / 24 / 24 / 8 sectors plus an 8-sector shaft; LOW uses
4 / 12 / 12 / 4 plus a 4-sector shaft. Closed stitched annuli connect sparse
hubs to denser crowns without overlapping skins. An eight-sector LOW crown
would lose about 7.23 mm of tangent contact at its half-phase on a 95 mm
roller, exceeding the retained 6 mm contact limit. Twelve crown sectors
reduce that theoretical gap to about 3.24 mm without expanding its radius.
Crown radius and full axial width remain exact in both qualities. The smaller LOW shaft
is an inscribed square, not an absent shaft, and its finite receiving section
must remain inside the model's independently fitted hull/hub lap.
The hub circumradius is at least `1.05 * spindleRadius / cos(pi / hubSectors)`:
the rotating hub polygon's **inradius**, not its corner radius, must receive
the stationary shaft. Actual finite rim rays include a positive 0.5 mm
receiving margin through every tested relative phase; the former small-hub
formula is retained as a rejecting geometry control.

## Proof boundary

The focused test uses the KF51 dimensions (95 mm crown radius, 160 mm width,
27 mm shaft radius, 212 mm shaft length) and K2 dimensions (90 / 160 / 26 /
247 mm). It counts actual indexed draw buffers and six/eight real instances;
checks watertight, consistently wound positive-volume stock; rejects missing
caps and missing finish groups; checks complete rotating rotor containment
within the already fitted cylinder; and checks finite shaft/hub overlap,
local receiving-section rays and exact-once resource disposal. Painted
shoulders/hubs have explicit axle-normal UVs with finite non-zero UV area
on every painted triangle; the untextured rubber crown remains a separate
material region. Every fixture includes the exact worst half-phase of its
actual finite crown against the tangent plane, cross-checked against the
analytic polygon maximum; the original eight-sector crown fails the same
6 mm limit. This standalone test has no profile/factory imports and does not
depend on any unpublished roller-fit candidate.

The local receiving rays are **not** new K2/KF51 hull-source audits, and the
instanced scene is **not** a native game rendering. Before any playable opt-in,
the integration must preserve current axle matrices/course/body geometry,
use actual runtime materials, retain correct owners at far LOD, run actual
band/near/far-shoe contact and disposal checks, and complete native/anatomy/
release qualification. A full cylinder is convex, so the tested all-vertex
radial/axial bound also bounds every finite rotor triangle and its full
rotation; it is not a sparse-pose claim about an unknown track course.

No tank-switch latency, full vehicle triangle budget, native appearance, or
fleet completion is claimed by this leaf-only checkpoint. The initial
`.qa-dev/efficient-roller-proof-nJLexE/receipt.json` is explicitly cancelled
before any test child started: the missing-UV/eight-crown draft was not
qualified. Fresh focused/type receipt pending.

The intermediate `.qa-dev/efficient-roller-proof-elAKD8/receipt.json` passed
its then-current geometry/type tests, but is **superseded**: independent
review found that those tests did not establish the sparse hub's complete
all-spin entry around the shaft. The next contract adds that missing finite
physical witness without changing the budget or contact crown. The queued
`CWaCUm` attempt was cancelled before a test child started to correct an
unsupported `BufferAttribute.setYZ` call in the rejecting control; it is
not a passing receipt.

## Verified independent checkpoint

The final `.qa-dev/efficient-roller-proof-FCRfpZ/receipt.json` passes the
standalone focused test and full TypeScript check with unchanged captured
inputs. Four size/quality combinations cover 128 posed stock constructions,
42 rejecting controls and exact 160/80 complete-roller triangle costs.
Measured worst tangent gaps are 0.813 / 3.237 mm for the 95 mm HIGH/LOW
crown and 0.770 / 3.067 mm for the 90 mm crown. Actual old eight-sector
controls fail at 7.231 and 6.851 mm respectively. These are local primitive
tangent-plane checks, not vehicle-specific draw-eligible track contact.

Additional preceding `.qa-dev/efficient-roller-proof-jidNpG/receipt.json`
passes this exact primitive source and types, plus a native procedural KF51
carrier/roller-motion comparison on the unpublished `9c7ea6059` fit. Its test
is preserved byte-for-byte as
`.qa-dev/efficientReturnRoller.native9c7.selftest.mjs.source` (SHA256
`b677fd9c0d83b64cc8934e8783e846848676e07732337039e3361b47f657856c`).
That extra comparison found HIGH old/new gaps 1.170 / 0.813 mm and LOW
7.231 / 3.237 mm across 36 native gear phases, but did not establish the
carrier's rendered eligibility or near/far shoe support. It is additional
9c7-based evidence only, not a dependency of this independently publishable
leaf. Vehicle-specific visible contact, runtime ownership and release remain
pending a separate explicit factory/profile opt-in.
