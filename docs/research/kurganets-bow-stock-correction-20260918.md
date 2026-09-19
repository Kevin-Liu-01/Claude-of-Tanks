# Kurganets folded bow correction

The independent final review held the frontal views at 8.7/10. The source's broad folded plate, lower return and side ends were missing from the native smooth wedge. This correction changes the forward receiving hull, those measured attachments and the two incorrectly placed front flaps. Rear stock, turret, gun ownership, suspension and all actual wheel/track buffers remain unchanged. Final rendered acceptance is still a separate independent review.

The approved assembled comparison remains `kurganets25_x_assembled_20260918.glb`, SHA256 `417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793`. No registration, camera, threshold or source geometry changed. Source FrontSide and DoubleSide first hits agree: the visible relief is physical stock, not a reversed face or painted hole.

## Source observations and construction

| Source stock | Independent scalar observations | Procedural construction |
| --- | --- | --- |
| Object_6, component 186 | Width 3.214 m; main rake about 37.3°; lower face Y1.2014/Z3.4141, fold Y1.5940/Z3.7129, top Y1.7190/Z3.7559 | Thin closed folded extrusion, separate narrower 1.7124 m lower tongue |
| Object_6, components 166–168 | Three separate thick backing plates; upper bevel reaches Y1.7561/Z3.6426 | Central and side closed stock with their own bevels, preserving space behind the forward skin |
| Object_6, component 164 | Hollow rolled lower return, width 3.2198 m; outer section spans Y1.1858–1.2864 and Z3.4141–3.5020 | Closed annular extrusion; 0.4 mm concealed lap joins the skin while retaining the actual interior air |
| Object_6, components 151/176 and 148/173 | Narrow 19.5 mm side webs; source arm and skin overlap about 1.5 mm at Y1.25; finite upper pivots meet the hull | Thin arms plus measured pivot stock, rather than a broad bridge through air |
| Object_39 roof and Object_23 forward lip | Main roof terminates at Z3.6133/Y1.7717; approximately 8 mm lip continues to Z3.7129, narrower edge return to Z3.7324 | Separate thin lip and return. Roof beyond Z3.4 moves only the measured 4–6 mm; earlier roof planes remain unchanged |
| Object_23, component 843 | Front flap width 0.5166 m, Y1.0735–1.4280, Z3.1328–3.3086; sloping receiving root and thin hanging end | Two source-scale closed compound flaps replace the old forward flat boxes; rear flaps and outer armor bays remain unchanged |

The former cap extended 90.6 mm ahead of the source skin at X0.6/Y1.5. The former front flaps hid the plate ends by 41.8 mm. Keeping either would bury the restored relief. The terminal receiving hull now follows the source's true rising lower boundary; its broad lower width starts near Z3.3516, preserving clearance above the front track turn.

The thick receiving plates and the thin forward roof continuation use the structural `hull` bucket, so armor hits, body anatomy and hull shadow support include their physical boundary. The hinged folded skin, hollow return and narrow attachment hardware use equipment buckets; the flaps retain rubber ownership. The focused fixture requires the exposed backing and roof first hits to belong to the actual hull mesh and rejects an otherwise identical equipment-only mutation.

The profile uses only independent primitive section parameters. It does not load, copy or ship source geometry, topology, materials or textures.

## Verification and retained failures

The private cold HIGH/LOW before/after proof passes 50 complete-scene source first hits per quality, maximum residual 0.000084 mm, 10 positive-volume joints, actual hollow/behind-plate air and 116 conservative moving-shoe bounding-box versus stock-triangle checks per quality. Unchanged primitive stock, complete aft hull and actual gear buffers/matrices match the authenticated pre-correction profile. Cold counts are 59,058 HIGH and 38,476 LOW; these are provisional until the regenerated runtime fill is loaded.

The focused fixture also rejects removed skin, separated arms, a lowered/unseated flap, solid stock inserted into the real air and a triangle deliberately intruding into an actual moving-shoe envelope. Its air probe checks DoubleSide intersections and enclosed origins; a FrontSide-only ray could miss the exit of a box containing its starting point. That deficient negative was preserved as `focused-r4.log` and repaired in the test, without changing the physical candidate.

Other retained failures include the initial flat-flap occlusion, an early receiving-hull width transition intersecting a conservative shoe bound, and a fixture interceptor that omitted `addMudguard` stock. The latter was instrumentation: the complete native scene already contained the flap. The corrected test records that builder path explicitly. These are historical failures, not accepted final results.

Private authenticated originals, full source-only scalar studies and before/after native receipts reside under `.qa-dev/tank-run/kurganets-final-bow/`. `profile-before.ts`, `study.json`, `receivers.json`, `roof-facets.json`, `flaps.json`, `flap-component.json` and every failed log are retained. Public source binaries and private payloads remain excluded from the commit.

The one-ID fill write produces 23 boxes / 276 triangles. Every other fill group and the loader retain their exact bytes. The loaded HIGH/LOW bow fixture passes every source, seat, air, structural ownership and deliberate failure check; final visible counts are 59,334 and 38,752 triangles (65.31%). Its gear, unchanged-stock and aft-hull hashes remain equal to the authenticated pre-correction profile. The existing rear-door and roof-mast fixtures also pass with these fills.

A separate older rear-detail fixture still expected the former central ramp at Z−3.5766. The original failure is retained. The approved source ray is Z−3.582115911 (Object_39, face1749); preserved pre-bow and current HIGH/LOW native rays are identical at Z−3.582185030, only 0.0691 mm from the source. The fixture now uses the nominal source-derived skin datum Z−3.582185 with its original 1 mm tolerance. Both the corrected rear-detail fixture and the existing attachment-seat fixture pass. The private `rear-fixture-proof.json` retains all four native rays and the original failing expectation. Final fixture identities are retained in the private freeze record. Root owns subsequent all-fleet anatomy/technical diagrams, Kurganets presentation assets, strict track/bore/source gates and fresh fourteen-view plus actual Garage review. Earlier frontal visual acceptance remains withdrawn until that review passes.


Final author-side freeze: profile SHA256 `79710d6efa22dba24c9bb543dd613ec4b13553ee1c0d592866ba0472212eed96`; fill SHA256 `b70b1cc24abf4d1c6c5897d47395ec553b73373e08ae98e8845f6762ae8da13b`; new bow test `747e3bacdfbe0cd01f1aa019dbafe7afe0b696aaa9c526ae1316c84da30a91bc`; corrected rear-detail test `9c53cc7f0c3682f99c137ad0da32ef0c69c0e5c4bae7d9e03fee7491151ca667`. All five focused fixtures and `npm run typecheck` pass. Strict profile metrics report 40 functions, zero violations and no explicit any/unknown. The earlier compiler launcher failure occurred before compilation because it named an obsolete executable; its log is retained separately. The final private `freeze.json` binds the actual source, core, materials, loader, profile, fills and test identities to these outcomes.
