# Shadow work accounting correction — 2026-09-18

The first post-ownership fleet asset test failed on Warrior's shadow ratio.
The old assertion required the selected convex-construction inputs to contain
more than eight times the proxy triangles. Those inputs are deliberately sparse
primary solids, not all the render meshes whose shadow submissions the proxy
replaces. Warrior's actual primary support was 968 triangles versus 194 shadow
triangles; Kurganets, BMP and K21 also failed this original HIGH assertion.
These original failures remain in the private `gun-ownership/shadow-diagnosis`
receipts. They have not been relabeled as passing the original assertion.

Reducing real shadow detail solely to satisfy the richness assumption would
reward an inappropriate denominator. Inflating visible/source geometry or
including arbitrary equipment to increase its count would be equally wrong.
The correction measures the actual near-detail casting workload immediately
before the factory suppresses the detailed casters. It preserves the greater
than eightfold triangle-reduction requirement, the no-increase draw requirement,
and the existing three articulation-owned casters, 120 triangles per caster and
320 triangles per vehicle limits. The original `shadowSourceTriangles` receipt
still means exactly the selected convex-construction geometry; it is not
overwritten with the larger workload count. A separate check ensures the proxy
does not invent more triangles than its support stock.

`measureNearShadowCasterWork` counts enabled casting meshes with visible
materials on camera layer zero, selects one near LOD, expands only active
instances, honors draw ranges and material groups, and deduplicates nested
roots. Invisible ancestors and other LODs cannot inflate the count. Layer
selection applies to each mesh without incorrectly pruning its children.
Unsupported batched-mesh accounting fails explicitly. The diagnostic does not
mutate visibility, LODs, geometry, materials or casting flags. It runs only for
geometry receipts; ordinary player builds do not perform the extra traversal.

This is submitted near-detail geometry before light-frustum culling, not a
measured frame time, a GPU speedup or evidence of a passing battle-performance
probe. Existing performance failures retain their separate disposition.

The focused synthetic fixture uses independently calculable triangle counts,
not a copy of the implementation. Independent review found three overcount
paths in the initial draft: camera layer mismatch, a negative draw start and
an explicitly supplied descendant under a hidden parent. All three now have
negative controls and corrections. Subsequent adversarial review also closed
duplicate LOD references (including a directly supplied descendant), invalid
active instance counts, and visible wireframe submissions. Unsupported forms
now throw instead of reporting an apparent saving.

The structural shadow repair is separate from this measurement correction.
See [the source-support audit](supplied-shadow-support-audit-20260918.md) for
measured broad armor omissions. The helper's selective dark-stock marker
also restores Kurganets, Ajax and TML gun shadows exactly after their real
receivers/sights moved from recoil ownership to the pitching gun mount.
Legacy dark fittings are not globally added to the shadow hull.

The final independent native audit completed at 2026-09-18T14:37:49.805Z:
all 13 supplied-source profiles in both HIGH and LOW passed, with runtime
interior records loaded. Actual `THREE.LOD.update` at camera `(0, 3, 10)` and
a separate pre-suppression submission count matched the diagnostic exactly in
all 26 builds. Every build retained three casters; the largest part was 90
triangles and the largest vehicle total was 228, below the unchanged 120/320
limits. The measured reduction was 47.01–219.24 times, above the unchanged
eightfold requirement. Detailed casting draws fell from 14–22 to three.

The final guard census found distinct native LOD references and no batched or
wireframe shadow submissions. No instanced mesh was an enabled caster in these
26 builds; literal synthetic tests separately verify active-instance expansion
and invalid-capacity rejection. Runtime core, counter, helper and all 13 profile
hashes stayed unchanged throughout the audit. Core SHA-256 was
`4413e67301a705d95269d098f4db339fa7b4de3ac907450cae31215addd360c1`;
counter SHA-256 was
`951fd84ca2a172a00c218b6ec63800a03b5bc978f43f916e2d08658f015ea089`.
The private receipt is
`.qa-dev/tank-run/gun-ownership/shadow-final-guarded-work-audit.json`, with its
independent audit script and log alongside it. The earlier `shadow-diagnosis`
and `shadow-final-work-audit` receipts remain unchanged, and every final row
retains its original source-richness pass or failure. These results validate
shadow submission accounting and bounded proxy cost only; they do not qualify
source fidelity, frame timing or unresolved release gates.
