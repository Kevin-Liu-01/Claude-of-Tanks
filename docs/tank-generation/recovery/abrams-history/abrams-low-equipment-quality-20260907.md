# Abrams source X low-equipment recipe — 2026-09-07

The corrected bounded low-quality recipe removes **8,448 authored equipment triangles from SEP V2 X** (43,068 → 34,620; 19.62%) while retaining all **885 equipment parts**. Every high-quality equipment buffer, bound, name, bucket and local pose remains byte-identical in all six distinct configurations. This is an equipment-construction receipt, not a whole-scene or native performance pass.

## Scope

Five existing source-reconstruction modules changed: `abramsSourceXEquipment`, `Containers`, `Loader`, `Crows` and `CounterAssault` under `src/vehicles/profiles/`, plus the pure `compactRoundMember` cap-retriangulation helper. Their high branch is unchanged. An attempted `Hatches` subdivision change was withdrawn; that file is byte-identical to its pre-optimization version.

- Low can bodies and handle legs retain their independent molded boundaries, handle openings, receiving feet and recessed soles; 6mm corner fillets use three samples instead of five and four bevel-depth rows instead of six.
- The loader's 8.3mm rear loop retains the same closed analytic spline, at 32 × 6 subdivisions instead of 64 × 10.
- The main tube retains every axial station, open bore and muzzle lip, using 20 circular segments instead of 40. Large hatch/coaming stock uses 20 segments; the shaped commander lid retains its original 32 low segments. Small smoke annuli use eight segments and remain physically open.
- Small CROWS round optics/bearings/lenses retain their separate recessed/glass layers, axes and attachment stocks. No folded carrier contour or optical opening is replaced with a solid box.
- All 20 counter-assault cartridges retain their four profile stations and tips, using eight radial sides instead of twelve. Their 19 folded links are unchanged.
- Basket courses retain eight low radial sides to satisfy the unchanged 0.8mm source chord limit; small handles/side guards use six. Those 58 scoped LOW rails retain every position, normal, UV and lateral triangle of their corresponding polygon cylinder, with only redundant planar cap-center fans retriangulated. The wider mast support remains at its previous eight low sides.

No bags, cloth roles, equipment component count, ARAT tile/bracket, shield, CITV, weapon-group placement, Loader M240 barrel, counter-assault M2, permanent gun linkage, armor spec or source asset was changed.

## Authenticated primitive counts

Before recipes and their six SHA-256 identities are retained in ignored local `equipment-before-sources.json` (including the now-unchanged hatch module). The before census loads those retained recipes through test-only module hooks, not the candidate. Raw files live in `.qa-dev/fleet-style-performance-20260907/`: `equipment-cost-before.json`, intermediate `equipment-cost-after.json` / `equipment-cost-final.json`, and the earlier primitive receipt `equipment-cost-final-qualified.json` (**22:31:06.756Z**). That earlier receipt's six-sided basket was subsequently rejected by the independent rack chord gate; it is not the final source-qualified recipe. The table below is the current `abramsSourceXEquipmentQuality.selftest.mjs` result after restoring eight sides and exact cap retriangulation. The committed test fixture records historical hashes and bounds, not transferred source vertices.

| Distinct configuration | Parts, unchanged | High, unchanged | Low before | Low final | Low saved |
|---|---:|---:|---:|---:|---:|
| A1 (`m1a1_x`, `m1a1ha_x`) | 398 | 22,886 | 20,118 | 15,806 | 4,312 |
| A2 (`m1a2_x`) | 416 | 24,400 | 21,632 | 17,320 | 4,312 |
| TUSK (`m1a2_tusk_x`) | 767 | 39,240 | 35,360 | 29,504 | 5,856 |
| SEP V2 (`m1a2_sepv2_x`) | 885 | 48,660 | 43,068 | 34,620 | 8,448 |
| SEP V3 (`m1a2_sepv3_x`) | 489 | 29,556 | 25,836 | 20,620 | 5,216 |
| Ukrainian A1 (`ua_m1a1_x`) | 398 | 22,886 | 20,118 | 15,806 | 4,312 |

SEP V2 has 121 changed low buffers, all inside the explicit subdivision-name scope. Maximum changed AABB component is **1.608mm**, on a small side guard; smoke extrema change by up to 1.551mm. These are bound extrema, **not a surface-error bound**. A 20-sided 537mm-radius coaming has a theoretical 6.611mm circle-to-chord sag; native low-shape review and existing source-ray tolerances remain separate requirements. No held-out source values or tolerances were reset.

## Validation and limits

- Independent container tests pass both qualities: four real handle openings, 32 air rays, 16 positive stock rays, closed manifold stocks, unchanged source-foot receiving laps, and six actual whole-model articulated poses.
- Independent loader tests pass all seven IDs at both qualities across 42 poses: immutable barrel/group/shield contracts, 402 source surface checks, 546 air checks and actual receiving contacts.
- Independent counter-assault tests pass two urban IDs at both qualities: 83 closed stocks, four real receiving holes, all 20 cartridges/19 seated links, source surfaces/air and unchanged M2/linkage geometry.
- The new equipment-quality regression passes all six high and low configurations: all high buffers and all untouched low buffers, every low name/bucket/pose, real low closed stock and bore, bounds and triangle reduction. Deleted-wall and filled-bore mutants fail as required.
- Exact cap-retriangulation differential passes 12 solids and 96 axial receiving rays, preserving all attributes/lateral indices, closed stock and UV ownership. A deleted-cap physical mutant fails. A separate 720-angle radial probe measures 0.783991mm error on the corrected eight-sided rack and rejects the six-sided predecessor at 1.379892mm against the original 0.8mm limit. Restoring the 44 courses costs 352 triangles; exact cap retriangulation saves 232, for a net 120-triangle increase per configuration.
- The original rack source geometry stage passes 90 stocks, 2,769 canonical faces and 13,510 surface checks: maximum actual LOW error is 0.722869mm under the unchanged 0.8mm limit. The earlier later-stage HIGH historical R4 aggregate failure was separately repaired by integration's scoped historical reconstruction, without replacing its expected hashes. The complete `abramsSourceXRackArmor` suite now passes its original HIGH/LOW R4 identities and live armor/air scenarios in the source-stable `integration-preservation-0TnBIp` checkpoint. The isolated LOW equipment result was not used as a substitute for that full rerun.
- CROWS/CITV historical low aggregate hashes retain their old expected values; all 12 / 14 historical aggregates pass. A test-only adapter supplies historical hashes **only for the exact authorized low subdivision names**; high never uses it. That historical adapter does not validate candidate geometry. The new current-buffer regression and independent physical tests above do so separately. CITV's actual source faces, air and receiving-contact tests also pass.
- Complete Equipment tests pass all seven IDs at both qualities across three poses, preserving source panes, folded CROWS support and real mast/case contacts and air.
- All five changed runtime modules pass the strict function complexity checks. React Doctor baseline was captured by integration (49/100); the changed-scope scan remains an integration check.

The pre-existing shaped commander lid has inward lathe winding (high signed volume −0.006741m³). Repairing that would alter high/source geometry, so its attempted subdivision change was withdrawn instead of weakening the new positive-stock check. The lid is byte-identical to before and is **not included** in the new closed-stock certificate. This inherited issue is separate follow-up work, not a hidden passing result.

The [material report](fleet-material-finish-20260907.md) records the source-bound eight-view SEP V2 native pilot, including visible non-camouflaged bags. That pilot is not a full equipment close-up, whole-fleet native pass, switch-latency result or final-budget receipt. The frozen **95,000 low scene / 35,000 low running-gear** budgets are unchanged and must be checked from actual LOD-selected, instance-expanded geometry after all shared gear work settles. Combat-anatomy update/check and targeted release gates remain integration responsibilities.

