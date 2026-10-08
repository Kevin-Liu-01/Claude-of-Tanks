# Complete playable-fleet surface audit — 2026-10-06

This census accounts for **220 playable IDs and 440 HIGH/LOW builds**, with 0 build errors. It includes every X variant. It does not claim that every vehicle is repaired or visually accepted.

Historical authored repair/regeneration scope: 68 IDs. Current integration scope: 74 IDs before the separately reported return-facet follow-up. Source snapshot HEAD: `1156f3cdd3183e00f0e3e8fe9eea1ceecaaedff8`.

Input fingerprint before runtime imports: `891b19fa1c9287be4187f58a3af3a396604ed4b09e48d8030a92907249c6239d`. End fingerprint: `445bda926d067120c740887ee37f1508b1df47e429b4f1c6289cbbaf31d212a7`. Frozen-input result: **False**.

Inputs changed after the captured startup manifest; inspect the exact paths/hashes in `fleet-dispositions.json`. This run must not qualify those later inputs.

Fresh targeted supplements replace only their listed vehicle rows: leopard-clip-final.json (4 builds, input-stable); residual-repairs-final.json (14 builds, input-stable); last-three-final.json (6 builds, input-stable). The original 440-build source-change rejection remains recorded. Zero-length vertex-on-edge candidates were reclassified from saved native triangle pairs after the independent Dragun control exposed a diagnostic false positive.

**Source adjudication update:** captured `P.add` calls can be discarded by later replacements. Twenty IDs now have bounded HIGH/LOW drawable-buffer correspondence and generator-level review, including explicit post-assembly transform proofs; T90 has eight discarded donor parts, and K2's fifty cap-edge flags are separately adjudicated. See [SOURCE-ADJUDICATION.md](SOURCE-ADJUDICATION.md). Raw counts below remain historical nominations, including discarded geometry.

## How to read this ledger

`C` counts parts with strict noncoplanar crossings, `T` topology candidates, and `F` warped or concave facet candidates. Each cell is HIGH/LOW. A count is a review nomination, not a severity score. Composite stock joins and intentional cast/reentrant geometry remain explicit; raw witnesses are preserved.

Native visual review is pending. Detailed per-part classifications, source locations, coordinates and example triangles are in [fleet-dispositions.json](fleet-dispositions.json).

| Vehicle ID | Repair scope | C | T | F | Current disposition |
|---|---|---:|---:|---:|---|
| m1a1 | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a1ha | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a2 | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a2_tusk | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a2_sepv2 | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a2_sepv3 | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| m1a3 | Audited | 0/0 | 0/0 | 16/16 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| abramsx | Scoped repair | 0/0 | 0/0 | 31/31 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t62mv1 | Audited | 0/0 | 1/1 | 0/0 | LIVE CAST LATHE END LOOPS; assembly coverage pending |
| t64bv1 | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72b3m | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72bu | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pt91m | Audited | 0/0 | 1/1 | 0/0 | LIVE CAST LATHE END LOOPS; assembly coverage pending |
| t80 | Audited | 0/0 | 1/1 | 1/1 | LIVE CAST PROFILE AND END LOOPS; assembly coverage pending |
| t80b | Audited | 0/0 | 1/1 | 1/1 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t80bv | Audited | 0/0 | 1/1 | 0/0 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t80u | Audited | 0/0 | 0/0 | 2/2 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| t84 | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90 | Audited | 0/0 | 4/4 | 2/2 | 8 DISCARDED DONOR PARTS; 3 LIVE OPEN-BOTTOM STOCKS |
| t90a | Scoped repair | 0/0 | 1/1 | 1/1 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t90a_vladimir | Audited | 0/0 | 3/3 | 4/4 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t90a_burlak | Scoped repair | 0/0 | 4/4 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t90sm | Scoped repair | 0/0 | 1/1 | 7/7 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t90m | Audited | 0/0 | 4/4 | 15/15 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t90ms | Scoped repair | 0/0 | 1/1 | 7/7 | 9 DISCARDED DONOR PARTS; rebuilt shell facets need review |
| t90m_proryv | Audited | 0/0 | 4/4 | 15/15 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| strv81 | Audited | 0/0 | 0/0 | 11/11 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| udes03 | Scoped repair | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| strv103a | Scoped repair | 0/0 | 0/0 | 19/19 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| strv103 | Scoped repair | 0/0 | 0/0 | 14/14 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cv90 | Scoped repair | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cv90_x | Scoped repair | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cv90105_tml_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| strv122 | Audited | 0/0 | 0/0 | 12/12 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cv90_mkiv | Scoped repair | 0/0 | 0/0 | 23/23 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cv90_mkiv_x | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| kv2 | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| chieftain5 | Scoped repair | 0/0 | 1/1 | 20/20 | 28 DISCARDED DONOR PARTS; live new turret facets need review |
| chieftain_mk10 | Scoped repair | 0/0 | 1/1 | 24/24 | 24 DISCARDED DONOR PARTS; live new turret facets need review |
| challenger1 | Audited | 0/0 | 0/0 | 12/12 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| fv4034 | Scoped repair | 0/0 | 0/0 | 28/28 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| challenger2 | Scoped repair | 0/0 | 0/0 | 28/28 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| challenger2e | Scoped repair | 0/0 | 0/0 | 28/28 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_challenger2 | Scoped repair | 0/0 | 0/0 | 28/28 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| challenger_3 | Audited | 0/0 | 0/0 | 13/13 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| challenger_3x | Audited | 0/0 | 0/0 | 13/13 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| k2 | Scoped repair | 0/0 | 50/50 | 6/6 | CAP SUBDIVISIONS ADJUDICATED; native chin repair tested; visuals pending |
| k1a1 | Audited | 0/0 | 1/1 | 2/2 | LIVE OPEN-BOTTOM LOFT; roof facets remain separate review |
| stb1 | Scoped repair | 0/0 | 0/0 | 13/13 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| type74 | Audited | 0/0 | 0/0 | 1/1 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| type90 | Audited | 0/0 | 2/2 | 6/6 | SOURCE TRANSFORM VERIFIED; 2 LIVE OPEN-BOTTOM WALLS |
| type90a | Audited | 0/0 | 2/2 | 8/8 | SOURCE TRANSFORM VERIFIED; 2 LIVE OPEN-BOTTOM WALLS |
| type10 | Scoped repair | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type10b | Scoped repair | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| m2a2_bradley | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| bmp2 | Audited | 0/0 | 1/1 | 0/0 | LIVE CAST END LOOPS; assembly coverage pending |
| spz_puma | Scoped repair | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| spz_puma_s1 | Audited | 0/0 | 0/0 | 24/24 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type89_light_tiger | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type89 | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| dardo | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| lrmv_lynx | Scoped repair | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| carro45t | Scoped repair | 0/0 | 0/0 | 0/0 | NO SCREENED CANDIDATE; native visual acceptance not run |
| ariete | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ariete_c1 | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ariete_c2 | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ariete_c1_x | Audited | 0/0 | 0/0 | 33/33 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ariete_c2_x | Audited | 0/0 | 0/0 | 33/33 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| amx40 | Scoped repair | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo1a5 | Audited | 3/3 | 0/0 | 12/12 | SOURCE-CONFIRMED RESIDUAL OR SUBMILLIMETRE CANDIDATE; native review pending |
| leopard2_proto | Scoped repair | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a4 | Audited | 0/0 | 0/0 | 0/0 | NO SCREENED CANDIDATE; native visual acceptance not run |
| leo2a4_otco | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a4m | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a5 | Audited | 0/0 | 0/0 | 12/12 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a5_a5nl | Audited | 0/0 | 0/0 | 12/12 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a6 | Audited | 0/0 | 0/0 | 16/16 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a6m | Audited | 2/2 | 0/0 | 14/14 | SOURCE-CONFIRMED RESIDUAL OR SUBMILLIMETRE CANDIDATE; native review pending |
| leo2_revolution_proto | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2_revolution | Audited | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a7v | Audited | 0/0 | 2/2 | 16/16 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| leclerc | Scoped repair | 0/0 | 0/0 | 11/11 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leclerc_xlr | Scoped repair | 0/0 | 0/0 | 17/17 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| amx56 | Scoped repair | 0/0 | 0/0 | 19/19 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type59 | Audited | 0/0 | 2/2 | 0/1 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ztz85_iii | Scoped repair | 0/0 | 0/0 | 0/0 | NO SCREENED CANDIDATE; native visual acceptance not run |
| type99a | Audited | 0/0 | 0/0 | 14/14 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type96b_x | Scoped repair | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type96_72_long | Scoped repair | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type96_80_feng | Scoped repair | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type96_72m_lei | Scoped repair | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| aft10_x | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ztz99a2_prototype | Scoped repair | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ztz99a2 | Scoped repair | 0/0 | 0/0 | 16/16 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| vt4a1 | Scoped repair | 0/0 | 0/0 | 14/14 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type100 | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ztz100_x | Audited | 0/0 | 1/1 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ztz100_prototype | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| mbt70 | Scoped repair | 0/0 | 0/0 | 15/15 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t14 | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| kf51 | Audited | 0/0 | 0/0 | 14/14 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| kf51b | Scoped repair | 0/0 | 0/0 | 0/0 | REPAIRED STOCK MAPPED TO NATIVE; visual/release pending |
| fv510 | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| fv510_milan | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| fv510_milan_x | Audited | 0/0 | 1/1 | 10/10 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ajax_x | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ares_apc_x | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| m60a1 | Audited | 0/0 | 12/12 | 8/8 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| merkava1b | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava2b | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava2d | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| sabra_mk2_x | Scoped repair | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava3c | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava3d | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava3d_x | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava4_x | Audited | 1/1 | 1/1 | 5/5 | SOURCE-ADJUDICATED COMPOSITE JOINS; native appearance pending |
| merkava4b | Audited | 0/0 | 1/1 | 35/35 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| namer_ifv | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| merkava4_trophy | Audited | 1/1 | 2/2 | 7/7 | SOURCE-ADJUDICATED COMPOSITE JOINS; native appearance pending |
| merkava4_barak | Audited | 1/1 | 1/1 | 6/6 | SOURCE-ADJUDICATED COMPOSITE JOINS; native appearance pending |
| amx30 | Audited | 0/0 | 0/0 | 5/5 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| amx30b2 | Audited | 0/0 | 0/0 | 5/5 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| m48 | Scoped repair | 0/0 | 3/3 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| m60a2 | Audited | 0/0 | 0/0 | 21/21 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| vickers_mk1 | Audited | 0/0 | 0/0 | 12/12 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| centurion3 | Audited | 0/0 | 0/0 | 11/11 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| centurion5 | Audited | 0/0 | 0/0 | 11/11 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| m46_patton | Audited | 0/0 | 4/4 | 2/2 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| m47_patton | Audited | 0/0 | 9/9 | 5/5 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| m60a3 | Audited | 0/0 | 12/12 | 8/8 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ua_t64bv | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_t80bv | Audited | 0/0 | 1/1 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ua_t80u_kursk | Audited | 0/0 | 1/1 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| ua_t84_oplot_m | Audited | 0/0 | 1/1 | 3/3 | LIVE OPEN-BOTTOM TURRET PRISM; assembly coverage pending |
| ua_m1a1 | Scoped repair | 0/0 | 0/0 | 23/23 | NATIVE RETURN-FACET REPAIR TESTED; final visuals pending |
| leo2a6_ua | Audited | 2/2 | 0/0 | 14/14 | SOURCE-CONFIRMED RESIDUAL OR SUBMILLIMETRE CANDIDATE; native review pending |
| object695_x | Scoped repair | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72m1_jaguar | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72_rys | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pt91_twardy | Audited | 0/0 | 1/1 | 2/2 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| pl01 | Audited | 0/0 | 1/1 | 10/10 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| borsuk | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pl01_105 | Audited | 0/0 | 1/1 | 10/10 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| k2b | Scoped repair | 0/0 | 2/2 | 25/25 | NATIVE CHIN/SHELL REPAIRS TESTED; visuals pending |
| bmp3_rok | Audited | 0/0 | 1/1 | 1/1 | 5 DISCARDED TURRET DONOR PARTS; remaining facets need review |
| ua_m2a3_bradley | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| bmpt_terminator2 | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| bwp1 | Audited | 0/0 | 1/1 | 1/1 | 5 DISCARDED TURRET DONOR PARTS; remaining facets need review |
| marder1a3 | Audited | 0/0 | 1/1 | 3/3 | 8 DISCARDED DONOR PARTS; live cast end loops remain |
| m3a3_bradley | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| bmp3 | Audited | 0/0 | 1/1 | 1/1 | LIVE CAST END LOOPS; assembly coverage pending |
| bmp3m_dragun125_x | Scoped repair | 0/0 | 1/1 | 4/4 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| kurganets25_x | Scoped repair | 0/0 | 2/2 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| tos1a_tagil | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| upior | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| bmpt_t90 | Scoped repair | 0/0 | 1/1 | 2/2 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| m551_sheridan | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| m551a1_tts | Audited | 0/0 | 0/0 | 3/3 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a7v_x | Audited | 0/0 | 1/1 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| leo2a6m_x | Audited | 0/0 | 3/3 | 2/2 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| leo2a4m_x | Audited | 0/0 | 1/1 | 2/2 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| leo2a5_x | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| k2_x | Scoped repair | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| kf51_x | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90a_x | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90a_vladimir_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90m_x | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90sm_x | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t14_x | Audited | 0/0 | 1/1 | 13/13 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| griffin50_x | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| kf41_lynx_x | Scoped repair | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| k21_x | Scoped repair | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| leo2a6_x | Audited | 0/0 | 0/0 | 11/11 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| k1a1_x | Scoped repair | 0/0 | 50/50 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| amx30_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t62mv1_x | Audited | 0/0 | 0/0 | 1/1 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| t72b_1987_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t80u_x | Audited | 0/0 | 0/0 | 2/2 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| leclerc_x | Audited | 0/0 | 7/7 | 3/3 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| leclerc_classic_x | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| chieftain_mk10_x | Audited | 0/0 | 1/1 | 6/6 | TOPOLOGY/CROSSING CANDIDATES; source/native adjudication pending |
| t72b3_x | Audited | 0/0 | 0/0 | 1/1 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| jpz_e100_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type10_x | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type90_x | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| amx40_x | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| strv122_x | Audited | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72b3m_x | Audited | 0/0 | 0/0 | 2/2 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| challenger1_x | Scoped repair | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t72bu_x | Audited | 0/0 | 0/0 | 2/2 | CAST/ASYMMETRIC FAMILY; residual metrics need individual adjudication |
| chieftain5_x | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90a_burlak_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| t90ms_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| m1a2_x | Scoped repair | 1/1 | 3/3 | 4/4 | SOURCE-ADJUDICATED TUB/STERN JOINS; native appearance pending |
| m1a2_tusk_x | Scoped repair | 1/1 | 3/3 | 4/4 | SOURCE-ADJUDICATED TUB/STERN JOINS; native appearance pending |
| m1a2_sepv2_x | Scoped repair | 1/1 | 3/3 | 4/4 | SOURCE-ADJUDICATED TUB/STERN JOINS; native appearance pending |
| m1a2_sepv3_x | Scoped repair | 1/1 | 3/3 | 4/4 | SOURCE-ADJUDICATED TUB/STERN JOINS; native appearance pending |
| ua_m1a1_x | Scoped repair | 1/1 | 3/3 | 3/3 | SOURCE-ADJUDICATED TUB/STERN JOINS; native appearance pending |
| griffin_viper | Audited | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| spz_puma_s1_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| type89_x | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| amx10p | Audited | 0/0 | 0/0 | 2/2 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| amx10p_25 | Audited | 0/0 | 0/0 | 4/4 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| marder2 | Scoped repair | 0/0 | 0/0 | 1/1 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| m6_linebacker | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_t80u_modern | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_t72b3m_modern | Audited | 0/0 | 0/0 | 6/6 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_t72b3m_hetman_ii | Scoped repair | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ua_t72b3_modern | Audited | 0/0 | 0/0 | 5/5 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pl_t80u_modern | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pl_t72b3m_modern | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pl_t72b3_modern | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| pl_t72b3_zubr_ii | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cn_t80u_modern | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cn_t72b3m_modern | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| cn_t72b3_modern | Audited | 0/0 | 0/0 | 9/9 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ru_t80u_modern | Audited | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ru_t72b3m_modern | Audited | 0/0 | 0/0 | 8/8 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
| ru_t72b3_modern | Audited | 0/0 | 0/0 | 7/7 | FACET/REENTRANT/MIRROR CANDIDATES; source/native adjudication pending |
