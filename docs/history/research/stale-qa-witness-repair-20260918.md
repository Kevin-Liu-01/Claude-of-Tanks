# Stale QA witness repair — 2026-09-18

Scope: two existing test files only. No runtime geometry, material, source registration, policy, thresholds, or golden hashes changed. This is test maintenance, not new visual acceptance. Original failed logs and pre-edit tests remain in `.qa-dev/tank-run/stale-qa-repair/`.

## Historical AW roof equipment

`awSecondWaveGeometry.selftest.mjs` now imports the actual `censusEquipment` and `roofEquipmentVerdict` exports instead of extracting obsolete implementation strings with regular expressions. T90 X, T90A Burlak X and T90MS X must remain unregistered in the approved configuration manifest. Their ordinary rule still requires at least one real MG and rejects invalid markers. Actual native HIGH/LOW NSVT/source-weapon checks remain, including temporarily removing the owner-added T90 NSVT and proving its historical empty mount fails. New live-census negatives reject empty, hidden, zero-opacity, undrawn and collapsed stock; visible finite stock is the positive control.

The full focused AW test passed in `focused.log`. That combined run then failed the stale Griffin shadow datum, preserved below.

## Warrior: asymmetric restored source flange

The old symmetric ±2.05 m caster reference predates restored left flange stock. Source `fv510_milan_x_source.glb` SHA-256 `e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04` has 38 actual Object_27 upper-flange vertices at X=-2.1026399136, Y=1.7628200054 in the measured sections. This is the flange datum, not a claim that it is the entire source's outermost corrugation point. Current authored right armor remains +2.10; mirroring the left value to the right would be incorrect.

Actual loaded HIGH/LOW armor and caster calipers in `warrior-witness.json` confirm caster minX=-2.0526399612 and maxX=+2.0499997139. The test changes only the left expected extent to -2.05264 and adds exact 50 mm inset/real-armor/asymmetry checks (2 µm numeric error bound). The original 0.5 mm extent tolerance remains unchanged. The initial overly broad source-vertex selection failed and remains in `warrior-witness.log`; corrected exact section selection passed in `warrior-witness-r2.log`.

## Griffin: corrected belly changes the baseline support

Authenticated historical profile SHA-256 `27ddd343d08f7006cc6074305e5455e5da59be5a1d0dfae879df2c69b4b841f5` reproduces the old support extension under the same current factory and loaded fills in both qualities. Current profile SHA-256 is `524b3bd1caa66e3070ccfb98ebfce4a6b2791a54b1139c3c2a5484748e96ec7d`. The approved assembled source SHA-256 is `1aef6401c01b5d9a6adfc65838c94d350f4aa39afa039709241c426371ca2003`.

For unchanged direction (0.614382030,-0.770833333,0.168376643):

| Actual support | Historical | Corrected |
|---|---:|---:|
| Baseline hull dot product | 0.553763456 | 0.725232244 |
| External armor dot product | 0.919398899 | 0.919398899 |
| Armor minus hull | 0.365635443 | 0.194166655 |
| Inset caster dot product | 0.859006877 | 0.854010518 |

The entire external-armor position buffer is identical: SHA-256 `0dee76b70053d1fbee8bbd75de3048243f3f51d3590a4f9bdfb761a75a668669`. The new baseline winner is hull [1.139600039,0.565599978,2.738300085]. Source Object_20 component62 has the exact Y/Z knee at X=.753400028 and the retained 1.139600039 belly half-width at other stations. The current scalar-section corner combines those measured datums; it is a fitted source-derived section, not an exact complete source vertex. Selector, triangle digest and source coordinates are saved in `griffin-source-authentication.json`; native old/current winners are in `griffin-witness.json`.

Only the stale extension expectation changes to .194166655 m. The same 1 mm agreement test, 100 mm maximum inset loss test, strict inside-armor test, direction, baseline mesh list, three shadow draws, per-part/total triangle budgets, and all legacy byte-exact caster hashes remain. This does not certify moving shadows or pixels.

Final shadow rerun **PASS**: all 32 actual loaded builds (13 supplied profiles plus 3 legacy controls, HIGH and LOW), with all exact legacy hashes and existing coverage/draw/triangle limits retained. Evidence: `shadow-r2.log` and `completion.json`. The capture lease has been released.
