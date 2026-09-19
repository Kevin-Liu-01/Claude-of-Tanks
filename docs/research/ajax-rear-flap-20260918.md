# Ajax X — source-mounted rear flaps, 2026-09-18

The prior rear-flap failure was real and already present in the old HIGH/LOW census. An earlier summary omitted it. It was not a demonstrated fill dependency: fresh default/HIGH/LOW processes reproduce both unsupported flaps with or without interior fills. The previous box hung at y0.59–0.93 and z−3.53; its unsupported gap was approximately 82.97 mm HIGH /83.87 mm LOW. The source has track stock, not a flap, at those low stations.

## Inputs and bounded correction

Canonical source: `public/models/community-candidates/ajax_x_source.glb`, SHA-256 `506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0`. Source registration and all gate thresholds remain unchanged. Actual `rear.png` and `hero-rearright.png` originals under `.qa-dev/tank-run/final-shadow-review/official14/ajax_x/` were inspected before reconstruction.

Independent component analysis identifies the source flap as a 62-vertex connected component of Object_10, with scalar bounds x[0.9927,1.5654], y[0.8433,1.3614], z[−3.5508,−3.2871]. Whole-source and isolated-component rays distinguish its shaped sheet, inward fold, upper receiving fold, neighboring module and tracks. At x1.32 the exposed source sheet is y0.972607 at z−3.50, y1.145992 at −3.40, and y1.327874 at −3.30. The raised terminal fold reaches y1.3614 around z−3.29 across approximately x1.114–1.34.

The obsolete low box is replaced with closed first-party stock constructed from sparse dimensional stations. The upper fold reaches the existing hull shoulder; no bridge to the old box and no interior-fill support were added. No source triangles, source contours, indices or textures enter runtime.

The right receiving module also required a narrow correction. Its old flat box extended down to y1.10, burying the correctly placed flap. Source Object_10 instead has a sloping underside at y1.18820/z−3.60, y1.302982/z−3.40 and y1.360373/z−3.30, with normal approximately [0,−0.86731,0.49776]. Only that box's bottom face changes; its existing top, width, depth and neighboring modules are retained. This restores the real air above the sloping sheet.

## Native evidence before final regeneration

`src/vehicles/profiles/ajaxRearFlapSeating.selftest.mjs` passes **296 checks across six builds**: default/HIGH/LOW before loading fills, then those same settings with the current fill record loaded. It explicitly asserts registry state, checks whole-scene first-visible source sheet and receiving-plane surfaces, tests finite root-to-hull stock intervals, and confirms the obsolete low flap is absent. Moving the actual flap/fold geometry downward 120 mm breaks the contact witness in all modes; restoring it restores contact.

Both native shoe detail levels are sampled over 16 opposed phases. These are actual transformed vertices and actual closed-sheet face intersections, not a substitute for the final strict triangle/band/shoe audit:

| Quality | Sampled vertices | Rays reaching sheet | Minimum positive air |
|---|---:|---:|---:|
| HIGH | 6,538 | 5,556 | 0.068027 m |
| LOW | 2,968 | 2,514 | 0.070820 m |

Cold and filled results match. All 18 native running-gear meshes retain byte-identical attributes, world matrices and instance matrices in HIGH and LOW. Outside the changed rubber bucket, only the expected receiving module in `hullDetail` changes.

The actual selected 10 m census with the existing loaded fill record reports HIGH 79,812 triangles/45 objects and LOW 47,928/44 objects (60.05%). The fixed limits remain 80,000 HIGH triangles, 85 objects and LOW≤75% HIGH. Regenerated fill records and final visual/strict/cost checks must still be validated by the integration lead.

## Frozen identities and evidence

- Prior profile: `b2cf417d365709d0d27cdbc313bbc95b10ec77a0123ac6da88174f46c978e9ae`.
- Repaired `src/vehicles/profiles/ajaxX.ts`: `3db3d29f8df0badfd5d0eefa700f9b89c14ebaf8e35d2f1489d47dcf991660e0`.
- Focused fixture: `bea2ff63ad4b2aad514e5a022bc0c7e23f2a9ceea5503a95cadd4ad24c349bf3`.
- Private evidence: `.qa-dev/tank-run/ajax-rear-flap/{source-study,flap-calipers,isolated-sheet-calipers,components,native-before,native-final,geometry,freeze}.json`, `focused-r1.log`, and the authenticated previous profile copy. Fresh-process prior cases are separately retained under `.qa-dev/tank-run/fender-cold-filled-census/`.

The profile author performed these source and native checks. Earlier visual acceptance is superseded for the changed rear stock. Fresh filled official14 and Garage views, independent review, anatomy/marking/assets, final strict checks and final cost remain separate integration work. Sabra remains frozen and unchanged during this Ajax correction.
