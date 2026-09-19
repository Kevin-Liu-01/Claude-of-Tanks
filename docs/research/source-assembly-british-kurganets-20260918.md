# Source-only assembly proposals — Warrior, Griffin, Kurganets

Owner approved correctly assembled supplied comparison targets, actual supplied weapon configurations, and real mechanical openings on 2026-09-18. These are **proposed derived references**, awaiting independent source-only review. No procedural profile, canonical GLB, source registration, scorer, gate, threshold, or existing failed receipt was changed by this preparation. Native geometry was not imported into the placement or correspondence tools.

The new files and complete manifests are in `.qa-dev/tank-run/source-assembly-20260918/`. The original raw and canonical exports remain intact. Canonical axes XYZ, scale 1, and their original raw-to-canonical translation remain unchanged. All assembly operations occur inside that frozen frame.

| ID | Original canonical SHA-256 | Proposed derived SHA-256 | Operation |
|---|---|---|---|
| `fv510_milan_x` | `e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04` | `f9eeb72db9039d2355912ecb85471be2d5559493400eff3d6d211ad9fc366045` | Remove 14 redundant origin-local components, 958 triangles; retain all 73,372 assembled triangles. |
| `griffin50_x` | `62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34` | `1aef6401c01b5d9a6adfc65838c94d350f4aa39afa039709241c426371ca2003` | Rigidly translate 10 displaced door components, 902 triangles; retain all 145,440 triangles. |
| `kurganets25_x` | `a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0` | `417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793` | Rigidly translate 98 displaced access-door/step components, 3,118 triangles; retain all 255,561 triangles. |

## Deterministic selectors and preservation

Each manifest lists every operation's original node name, welded connected-component index, point and triangle counts, original bounds, and ordered oriented-triangle position SHA-256. Connectivity uses 10 µm positional welding; this is an inventory convention, not a geometric deformation. The writer verifies the entire pinned canonical source and each selected component before writing a new private output.

The writer preserves untouched primitive data and appends new buffers for changed primitives. Removal compacts every retained attribute and index, so unused below-floor positions cannot survive as false geometry bounds. Translation changes selected position values only; original normals, triangle winding, materials, hierarchy, and all unrelated attributes are retained.

`validation.json` independently reloads all outputs and compares every expanded triangle attribute against the original. All 470,353 unselected triangles are bit-exact across the three outputs. Griffin and Kurganets translated position values exactly equal Float32(original + measured translation), with maximum rounding below 0.12 µm; every translated normal is unchanged. `replay-proof.json` records byte-identical regeneration and rejection of stale source/component digests before any output write. Original source hashes still match.

The private prepare script reproduces the GLBs; the private validate script records the screenshot hashes and tool hashes in each manifest. The private evidence is not a production/runtime loader.

## Warrior: one assembled door, redundant origin assembly

Selectors removed: `Object_25` component 1; `Object_26` components 8–15; `Object_36` components 5–9. Mounted counterparts remain untouched.

Ten components have a one-to-one vertex and identically oriented triangle correspondence after translation, with maximum position residual 0.22 µm. This includes the full door, both hinge leaves, handles, small latch parts, and placard. The source also contains five circular rear-door hardware components both in the seated door and in the origin-local door assembly.

Four circular pieces are not exact rigid duplicates. `warrior-variant-proof.json` records their bijective vertex maps and identical oriented connectivity. Their XY coordinates agree within 0.067 µm; Z differences occupy only the fixed station and an outboard station 11.4–11.5 mm away. The origin-local cover is extended by that amount, and its connector vertices span the two stations. The unchanged seated assembly already contains the corresponding cover, connector, center fitting, and support. No differing copy is stacked on it.

The raw OBJ-derived GLB has no skins or animations, so animation provenance cannot be recovered. The redundancy finding uses the complete source door assembly, matching topology/stations, and the single mounted receiver; it does not claim recovered animation metadata or floating-point rigid equality for the four variants. Independent review must assess this physical identity before promoting the proposal.

## Griffin: recessed rear receiver, complete door retained

The outer bumper is at approximately z −3.0234 m. The actual asymmetric door opening and fixed hinge receiver are recessed near z −2.2 to −2.3 m. Placing the door at the bumper would be wrong.

Moving selectors are `Object_25` components 0–7 and both `Object_5` viewport surfaces. The latter sit in the displaced door's upper rectangular opening; they are part of its material-separated assembly, not unrelated gear.

The source fixed double-knuckle receivers are `Object_20` components 260–263. Circle fits to their facing caps and the two moving knuckles determine one translation:

`[-0.5964815621274728, 1.305143093732878, -2.3034231065654867] m`

No rotation, scaling, recentering, or candidate fit is applied. The moving assembly already retains the receiver's sloped axis. Upper/lower hinge midpoint residual is 0.157 mm; source cap circle/plane quantization is explicitly recorded in `receiver-fit.json`. The 38.033/38.088 mm moving knuckles fit the 38.167/38.137 mm fixed axial gaps, leaving 0.134/0.050 mm total clearance. The door follows the source's asymmetric chamfered aperture and overlaps its perimeter by roughly 28–33 mm.

## Kurganets: preserve the mixed mesh and its real equipment

Only `Object_39` components 0–97 move. Components 98 onward, including valid hull and optical equipment, remain exactly where the source places them. No triangle is deleted.

The door fits the source rear aperture formed by `Object_23` components 368–374. Existing fixed hinges 72/75 determine the XZ pin axis; their two axial gaps determine Y. One translation is used for the complete displaced door/step assembly:

`[-0.4918696077250789, 1.4916125, -3.6010853218781516] m`

No rotation or scale is applied. The source 38.40/38.45 mm moving knuckles fit both 40.00 mm fixed gaps. Circle-fit residuals are 0.204 mm for the moving source arc and 0.326 mm for the quantized fixed arc. The original chamfers, hatch, handles, attachment hardware, and step remain intact.

A review nuance is retained openly: the translated step terminal tabs (`Object_39` 11/12) lie within 0.886 mm of the corresponding fixed tabs (`Object_23` 38/39). This independently supports the measured assembly station. The exact oriented-triangle duplicate test fails, so both sets of original stock remain; no possible mating hardware was silently deleted. `kurg-step-proof.json` preserves this failed duplicate check for independent interpretation.

## Source-only visual record and remaining qualification

`review/<id>/{before,after}/` contains four unchanged-camera views per state: rear, rear quarter, door close, and door oblique. All 24 originals were personally viewed. `render-views.json` records the cameras, and each manifest records every image hash. Cameras and orthographic scales are identical before/after; Blender 5.2.0 EEVEE neutral clay is used only to inspect assembly, not to qualify game lighting or performance.

The before images show the origin-local door stock and the matching mounted hardware or empty source receiver. The after images show the correctly seated Griffin and Kurganets door assemblies and the unchanged mounted Warrior assembly. Real vents, cage gaps, and unrelated openings remain in the source geometry.

Independent source-only review was requested from the fleet critic. No candidate fidelity score, physical gate, cost budget, or visual rating is granted by this document. After an independently accepted derived source is registered, the original failed source receipts must stay historical, and the procedural candidates must pass fresh comparisons against the assembled targets.
