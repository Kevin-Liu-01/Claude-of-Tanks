# National modernization — fitted shoulders, mantlets and equipment, revision 5

## Owner direction and state

Owned worktree `/Users/kevinliu/.codex/worktrees/cot-ifv-identity-20260925`, branch `codex/national-modernization-20261001`, baseline `0f2b700cde04251914294e2e3e254788ef0d22ab`.

The owner requested twelve visually distinct national modernization programs, permitted hull edits, required retaining fenders and working roof weapons/ERA/equipment, then clarified that the T-72 ancestry must remain obvious beneath the additions. Four supplied example images establish the low native hull, curved track guards and compact cast turret beneath bolt-on armor. Existing T-80U donor variants remain recognizable turbine-chassis derivatives. Revision 3 superseded the unpublished revision 2 independent welded hull/turret rebuilds. The owner then approved those native hull and cast-turret bases and requested full assemblies around the turret and thick modern skirts wrapping around the track shoulders. Revision 4 preserves those approved cores and expands their surrounding structures. The owner then identified visible fender/skirt gaps and asked for closer mantlet fit and substantially more roof/bustle equipment; revision 5 addresses those requests without replacing the approved bases.

This revision remains local. The earlier shared T-90SM-body revision is on main at the baseline above. Existing originals are preserved; no external meshes enter playable geometry. No exact real-vehicle numerical fidelity score is claimed for these owner-directed concepts.

## Construction

Small explicit exports reuse the exact original primary hull tubs/collars, running gear and front/rear guards from T-80U X, T-72B3M X and T-72B3 X. Original builders retain their emission order. The regression asserts inclusion of every original hull-core vertex, HIGH/LOW mechanical datums and paired fender records. Obsolete curtains/ERA are not copied beneath replacement packages.

`nationalDonorCore.ts` builds compact rounded turret courses with independent dimensions per concept and an actual gun opening. National profiles now add continuous finite cheek-to-flank housings with rear bridges, cabinets, cages and equipment. Permanent layered side armor remains when ERA is spent. The shaped skirts have thick backing, chamfered joints, support rails and front/rear returns that turn inward beyond the native track courses. The cast shoulder and lower dome remain visible. The common ring overlaps the cast floor by 5 mm; the mantlet is pitch-owned, barrel recoil is separate, and the 12.7 mm roof station has its own working yaw/pitch rig and continuous receiver/barrel socket.

| Nation | T-80U foundation | T-72B3M foundation | T-72B3 foundation |
|---|---|---|---|
| Ukraine | Zoria: closed assault wrap around the cast core | Hetman: connected cheek/flank armor and deeper command rear | Sich: lower armored frame, open upper cage and leafy ghillie |
| Poland | Husarz: broad cheek/pannier frame and wide open basket | Wilk: deepest panniers, armored bustle and three ERAWA courses | Zubr: compact enclosing frame, fine tiles and short rack |
| China | Yun: swept arrowhead housings joining a short bustle | Kunlun: deep side housings and open rear maintenance frame | Qilin: compact enclosing chevron housings |
| Russia | Bars-M: continuous heavy wrap, fan ERA and round sensors | Bulat-M: deepest connected enclosure, command bustle and lower skirt packets | Bastion-M: compact armored frame, broad cheek cassettes and short basket |

All twelve remain explicitly named concepts, tier X/next generation, with unchanged balance and stronger Russian packages. Main gun 125 mm; independently articulated 12.7 mm roof stations retain named ammunition (Ukraine/Russia B-32 API, Poland M2 AP, China Type 54 API).

## Reference contract

The concept design document is `docs/references/concepts/national-modernization-20261001.json`; `tools/first-party-concept-policy.mjs` enforces declared dimensions and mechanical datums. Manufacturer references from revision 1/2 remain inspiration. The four owner images, including the War Thunder T-72M2 Moderna image, are visual direction only, not an exact model target. Downloaded review copies stay local in `.qa-dev/national-redesign/t72-owner-references/`; their URLs are retained in the concept document.

## Revision 5 construction and evidence

- Continuous finite shoulder covers overlap the actual native fenders and permanent skirt carriers, following front/rear folds. Original fenders and wheel mechanics remain unchanged.
- Full-width pitch-owned main-gun shields reduce the previous 125 mm cheek gaps to a 9 mm working seam. The rear seal and front cuff elevate with the gun. Recoil remains separate.
- National rear-wing cabinets, utility cases, tool racks, guarded optics, cables, straps, cargo floors and canvas stores use measured physical seats. Hatches and negative spaces remain accessible.
- The shared roof-gun trunnion/fork rises 50 mm above its earlier seat; the deck base remains seated. Country antennas, optics and packs were repositioned as necessary to preserve the complete .18 rad depression/.75 rad elevation envelope.
- Russian and Chinese ERA receiving rays use a frozen permanent-housing snapshot. Russian upper ERA no longer sits against earlier cassettes/lids.
- The independent geometry diagnostic samples all 12 actual emitted country fixture sets and shared roof-weapon solids at 2-degree yaw increments and ten pitch samples, including receiver edges and muzzle skin: zero barrel/body contacts in `rws-fit-all-final.jsonl`. This is a sampled clearance check, not continuous collision certification.
- Generated interior fill: all 12 residual 0 L, 48 boxes/576 triangles total. Updated final dimensions and centering are measured from HIGH/LOW builds.
- Integrated HIGH/LOW seam, native-core, fender, gun-aperture, roof-seat and full-turret sweep regression passed for all twelve. The skirt test removes ERA first, checks at least 150 mm of permanent backing, and probes both fitted shoulders at 100 mm longitudinal intervals. Main-gun seam checks use the common receiving region in depressed, neutral and elevated poses. The independent moving-track sweeps passed in HIGH and LOW with zero band, shoe or swept overlaps.
- Revision 5 produced 204 real 1280 px Garage screenshots: seventeen views per vehicle, including neutral and articulated poses, plain paint, and live/spent/reset ERA. All six ERA sectors removed and restored on each vehicle. The independent critic reviewed 108 views across all twelve and found no material visual blocker. The initial Zoria quarter capture caught the loader; it was replaced after waiting for actual loader dismissal and inspected clean. Images and the browseable review are local in `.qa-dev/national-redesign/`.
- Real Garage cold selections measured 95.7–143.8 ms (113.2 ms mean), warm selections 7–16.5 ms (10.87 ms mean), and the rapid switch completed in 53.4 ms with the requested final tank. The cache stayed at its six-entry cap. These are desktop development observations at served `v1.0.0+g0f2b700cd.dirty`, not mobile or production guarantees.
- Full typecheck and controls inventory passed. Full-fleet anatomy regeneration (217 vehicles/651 technical cards) and twelve icon sets completed. The subsequent full anatomy check and targeted release chain remain in progress; no publication qualification is claimed yet.

Revision 4's 204 Garage captures are retained locally under `.qa-dev/national-redesign/revision4-before/`. Revision 5 evidence is recorded by `rev5-verify.mjs` and `rev5-finish.mjs`, with source hash guards to invalidate runs if geometry changes during validation. A Russian file reversion during agent work was detected and restored from the bounded writer's changes; cause unconfirmed. Final restored source SHA256 before validation: `7aeb6e9db9c06c5b71252fade0cd68a71d2a6e5a2ae79f07a861d60d35766dc9`. Recovery source is retained locally; later source hashes, rather than that recovery file alone, determine receipt validity.

## Retained history

Revision 2 passed 12 HIGH/LOW moving-track sweeps and physical gun/roof/sweep checks, but was superseded by the owner's ancestry clarification. Its final anatomy check failed because the late RWS socket/height edits made 12 geometry and 12 metadata image receipts stale. This was not a geometry pass; no release ran. Those results are retained in local `finish-results.json`, `final-anatomy-check.log` and older screenshots for audit context, and are not reused to qualify revision 4. Revision 3 preserved the native hulls and cast cores, passed HIGH/LOW gun/roof/rotation checks and zero-leak fill generation, and supplied the owner-approved bases; its superseded appearance is not reused as revision 4 evidence.

Revision 4 passed the integrated physical regression and both HIGH/LOW strict track sweeps (zero overlaps), then produced 204 real Garage views and cold/warm/rapid switch results. Its final anatomy update was deliberately stopped after the owner requested revision 5. Those receipts are superseded. Revision 5 initially caught a Chinese rear shoulder gap; the covers were extended through the end folds. Its initial common mantlet seam sample ran beyond the shortest Chinese cheek while elevated; the regression now samples the actual shared lower seating region, while retaining the separate open gun corridor and pitch checks.


### Additional-pair integration

The owner subsequently confirmed preservation of the earlier T-90SM-based Hetman and Zubr as two additional tanks, without replacing these twelve designs. See `national-legacy-pair-20261001.md`. The 217-vehicle full anatomy check completed successfully at 2026-10-01T21:56:48Z. Its subsequent release attempt was invalidated by new source files arriving during the frozen-input concept test and was stopped; it is not a valid completed release result. Final integration rechecks all fourteen affected IDs and the expanded 219-vehicle fleet.
