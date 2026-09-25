# Return-roller audit — 2026-09-25 (FSP-03)

Owner ruling 2026-09-25: "Add and verify return rollers across the full fleet wherever the actual
vehicle has them; preserve genuinely rollerless suspensions." Fleet built at HIGH with the geometry
receipt on the round-90 tree (`1179f1013`, 192 playable ids; the eight archived ww2/casemate ids
handled by the deletion lane were skipped): **45 hulls carried zero return-roller stations**, up from
the eleven the FSP-03 row named, because the 2026-09-23 round-46 commits (`8296ef5c3`, `97d05adc0`)
emptied every T-72/T-90 station on the reading "the real T-72/T-90 running gear has no return
rollers; the track rides the road wheels". That reading is contradicted by the repo's own source
studies (the T-90A X source `support wheels` node measures three rollers per side, the T-90A
Vladimir X and TOS-1A packets record three per side) and by the published record (FAS/GlobalSecurity
T-72: "six large, die-cast, rubber-coated road wheels and three track return rollers"). The T-62
(FM 100-2-3) and the T-54/Type 59 line remain the rollerless Soviet suspensions.

Method: the `tools/wheel-inventory.mjs --all` roster; a scratch station probe counting the instanced
`gearReturnRoller*` layers per side; a scratch upward-raycast lane-ceiling probe (five x-samples
inside each track lane, 0.1 m z-steps between the road wheels, non-gear opaque stock only) giving
the lowest fender/sponson/skirt surface a roller-carried run must clear; and the measured shoe crest
(+0.035…+0.056 m above the band centreline). Rollers were only added where a real roller (radius
0.10–0.12 m) fits between the wheel tops and that ceiling with the run crest at least 3.5 cm clear;
every other eligible hull is recorded as deferred with the measurement, never faked.

Counts: **38 hulls gained verified rollers** (12 restored source-measured stations, 26 fitted),
**6 kept rollerless** (real vehicle rollerless), **1 concept kept rollerless by chassis derivation**,
**1 hull deferred** (Challenger 1: no physical room without a belt re-loft). Legend: Y = real vehicle
carries return rollers; N = rollerless.

| id | vehicle | real rollers | count / placement (per side) | source | action |
|---|---|---|---|---|---|
| t62mv1 | T-62MV-1 | N | bare top run | FM 100-2-3 T-62 entry; packet t62mv1.md ("NO return rollers") | kept rollerless |
| t62mv1_x | T-62MV-1 X | N | bare top run | same | kept rollerless |
| type59 | Type 59 | N | T-54 chassis, bare top run | USMC Iraq Country Handbook A-21/22 (T-54/55 line) | kept rollerless |
| stb1 | STB-1 (Type 74 prototype) | N | 5 large wheels, no rollers | Type 74 chassis; packet type74.md (militaryfactory: "no track return rollers") | kept rollerless |
| type74 | Type 74 | N | 5 large wheels, no rollers | packet type74.md (militaryfactory) | kept rollerless |
| jpz_e100_x | Jagdpanzer E-100 X (concept) | N (by derivation) | E-100 / Tiger II carriage, overlapping wheels, no rollers | lonesentry Tiger II / Jagdtiger carriage; concept — design decision, no production claim | kept rollerless |
| t90a_x | T-90A X | Y | 3: Z −1.6497 / 0.3703 / 2.0961, axle Y 1.00456, r 0.1107 (source `support wheels` node) | packet t90a_x.md | restored (97d05adc0 reversed) |
| t90a_vladimir_x | T-90A Vladimir X | Y | 3: Z −1.55863 / 0.39502 / 2.39302, Y 0.98969, r 0.11452 | packet t90a_vladimir_x.md | restored |
| t90m_x | T-90M X | Y | 3 inferred supports: Z −1.65 / 0.37 / 2.096, Y 0.9354, r 0.101 | packet t90m_x.md | restored |
| t90sm_x | T-90SM X | Y | 3 inferred supports: Z −1.65 / 0.37 / 2.096, Y 1.055, r 0.11 | packet t90sm_x.md | restored |
| t90_x | T-90 X | Y | 3: Z −1.5033 / 0.1714 / 1.8367, Y 1.07865, r 0.12335 | t90AwX.ts pre-2026-09-23 stations | restored |
| t90a_burlak_x | T-90A Burlak X | Y | 3 (T-90 X chassis) | t90BurlakX.ts | restored |
| t90ms_x | T-90MS X | Y | 3: Z −1.5043 / 0.1704 / 1.8357, Y 1.07865, r 0.12335 | t90msX.ts | restored |
| tos1a_tagil | TOS-1A Tagil | Y | 3 (shares the T-90MS X chassis) | packet tos1a_tagil.md ("three return rollers per side") | restored |
| t72b_1987_x | T-72B obr. 1987 X | Y | 3: Z −1.30 / 0.37 / 1.74, Y 0.941–0.951, r 0.095 | t72b1987X.ts | restored |
| t72b3_x | T-72B3 X | Y | 3: Z −1.5191 / 0.349 / 1.945, Y 0.98965, r 0.10905 | t72b3X.ts | restored |
| t72b3m_x | T-72B3M X | Y | 3: Z −1.78 / 0.05 / 1.85, Y 1.16, r 0.12 | t72b3mX.ts | restored |
| t72bu_x | T-72BU X | Y | 3: Z −1.63 / 0.21 / 1.91, Y 0.902, r 0.092 | t72buX.ts | restored |
| t72b3m | T-72B3M | Y | 3 fitted: Z −2.92 / −1.05 / 0.55 (source law 4.6/51.5/91.6 % of the wheel span), Y 0.97, r 0.10; ceiling 1.22 | FAS T-72; T-90A X source law | added |
| bmpt_terminator2 | BMPT Terminator 2 | Y | 3 (shares the T-72B3M gear) | T-72 chassis | added |
| t72bu | T-72BU | Y | 3 fitted: Z −1.88 / 0.19 / 1.97, Y 0.99, r 0.10; ceiling 1.198 | FAS T-72 | added |
| t90 | T-90 | Y | 3 fitted: Z −1.76 / 0.11 / 1.71, Y 0.95, r 0.10; ceiling 1.17 | packet t90.md family; FAS T-72 | added |
| t90a | T-90A | Y | 3 fitted: Z −1.62 / 0.25 / 1.85, Y 0.94, r 0.10; ceiling 1.145 | T-90A X source | added |
| t90a_burlak | T-90A Burlak | Y | 3 (shares the T-90A gear; side sheets clear the shoe edge by 3.1 cm) | T-90A X source | added |
| bmpt_t90 | BMPT (T-90 hull) | Y | 3 (shares the T-90A gear) | T-90 chassis | added |
| t90a_vladimir | T-90A Vladimir | Y | 3 fitted: Z −2.71 / −0.84 / 0.76, Y 0.97, r 0.10; ceiling 1.22 | packet t90a_vladimir_x.md (three per side) | added |
| t90sm | T-90SM | Y | 3 fitted: Z −1.70 / 0.20 / 1.82, Y 0.955, r 0.10; ceiling 1.14 | packet t90sm_x.md | added |
| t90ms | T-90MS | Y | 3 fitted: Z −1.60 / 0.25 / 1.83, Y 0.90, r 0.10; ceiling 1.22 | t90msX.ts | added |
| t90m | T-90M | Y | 3 fitted: Z −1.48 / 0.20 / 1.65, Y 0.86, r 0.10 (undersized 0.31 m fleet wheels, run behind the 0.92 skirt hem) | packet t90m_x.md | added |
| t90m_proryv | T-90M Proryv | Y | 3 (shares the T-90M hull) | same | added |
| pt91m | PT-91M Pendekar | Y | 3 fitted: Z −1.79 / 0.08 / 1.68, Y 0.935, r 0.10; ceiling 1.16 | T-72 chassis (packet pt91m.md notes its rollers) | added |
| pt91_twardy | PT-91 Twardy | Y | 3 fitted: Z −1.76 / 0.16 / 1.80, Y 0.935, r 0.10; ceiling 1.14 | T-72 chassis | added |
| t72m1_jaguar | T-72M1 Jaguar | Y | 3 fitted: Z −1.82 / 0.10 / 1.74, Y 0.95, r 0.10; ceiling 1.18 | T-72 chassis | added |
| ztz85_iii | ZTZ-85-III | Y | 3 fitted over the wheel pairs: Z 0.63 / −0.93 / −2.49, Y 0.87, r 0.10; ceiling 1.10 | tank-afv Type 85 ("three return rollers"); Tank Encyclopedia ZTZ96 ("three return rollers per side") | added |
| ztz99a2 | ZTZ-99A2 | Y | 4 fitted, even: Z ±0.53 / ±1.60, Y 0.95, r 0.10; ceiling 1.246 | Army Recognition Type 99A ("four-track return rollers") | added |
| ztz99a2_prototype | ZTZ-99A2 prototype | Y | 4 (shares the 99A2 hull) | same | added |
| vt4a1 | VT-4A1 | Y | 4 via the shared certified ZTZ-99A2 chassis (owner decision in chineseFrontline.ts); published count unresolved: Al-Khalid/MBT-2000 lineage 3 (army-guide "track-return rollers"), VT-1A "four" (militaryfactory) | army-technology VT4 ("track return rollers") | added (count recorded as unresolved) |
| strv103 | Strv 103 | Y | 2 fitted: Z ±0.85, Y 1.06, r 0.10 (the Strv 103A layout) | packet strv103a.md ("2 return rollers") | added |
| object695_x | Object 695 (Kurganets-25) X | Y | 4 fitted: Z −1.70 / −0.74 / 0.26 / 1.22, Y 1.031, r 0.105 under the measured 1.15 return course | tank-afv Kurganets-25 ("four return rollers as shown in the rare photos of the chassis without armour"); source omits the meshes | added (packet corrected) |
| pl01 | PL-01 | Y (chassis) | 3 fitted, even: Z ±1.45 / 0, Y 1.00, r 0.10 — count unpublished, design decision | Wikipedia PL-01 (CV90120-T chassis); army-guide CV90120 ("track return rollers") | added (count = design decision) |
| pl01_105 | PL-01 105 | Y (chassis) | 3 (shares the PL-01 hull) | same | added |
| centurion3 | Centurion Mk 3 | Y | 6 fitted: Z 2.41 / 1.52 / 0.63 / −0.26 / −1.15 / −2.04, Y 0.996, r 0.11; the concealed over-track shoulder (`deckCorridor.floor`) lifted 1.08 → 1.21 | army-guide Centurion ("six track-return rollers, the four dual roller centre ones and the single front and rear ones which support the inside of the track only") | added |
| centurion5 | Centurion Mk 5 | Y | 6 (shares the Centurion hull) | same | added |
| strv81 | Strv 81 | Y | 6 (Centurion Mk 3 hull) | same | added |
| challenger1 | Challenger 1 | Y | 4 per the repo packet (challenger1_x.md: "six road wheels/four return rollers per side"; published sources spread 2–4) | packet challenger1_x.md; army-guide FV4030 | **deferred**: the fleet hull's belt line (`beltTop` 1.02) is the sponson floor, 0.16 m over the 0.861 wheel tops — a real roller needs ≥ 0.28 m; the bow/tail rakes terminate on that belt line, so lifting it is a hull re-loft, not a gear fit. challenger1_x already carries three. |

Open findings recorded, not acted on (outside the zero-station brief): the repo's CV90 family
(cv90, cv90_mkiv, cv90_mkiv_x, cv90105_tml_x) carries five rollers while army-guide records the
standard CV90 as having "no track-return rollers" (only the CV90120 is rollered); the in-repo
type99a carries three where the published Type 99A count is four; kurganets25_x carries five
where tank-afv counts four; the delisted `buildT72B87NativeTyped` builder in t72.ts keeps its
empty station list (not playable).

Verification per changed id: scratch station probe (rollers/side as tabled), lane-ceiling probe
(crest under every ceiling by the margins above), `npm run typecheck`, the family receipts,
`tools/wheel-review.mjs --gate`, the track receipts, `tools/tank-sealed-check.mjs`, then the
presentation-centering / combat-anatomy / icon regeneration and the per-id release checks; the
whole-model digests that moved (`t90XEraBindings`, `sourceXSovietAuxArmor`, `tos1aTagil`,
`t72b3mXSideMounts` ledger, `object695X` triangle ceiling) were re-pinned with dated notes.

Eye-check (dev-server track-audit page, 1600 x 900, left elevation, every changed family): on the
T-72/T-90 fleet and X hulls, the Chinese hulls, PL-01, Object 695 X and the Strv 103 the raised run and
its rollers sit behind the skirts / side modules exactly as on the real vehicles — nothing protrudes
through a skirt, fender or hem, and the loaded runs and end-wheel wraps are unchanged; on the Centurion
family the run now rides level under the lifted sponson shoulder instead of sagging onto the wheel tops,
and the dark skirt-slot plates visible on the Mk 3 render are pre-existing (identical in a capture of the
pre-change tree). Lane-ceiling probe after the edits: every crest 3.2-27 cm under its ceiling, every
roller 1.4-9 cm above its wheel tops.
