# National modernization concepts — implementation and qualification

Baseline: 6a72e1fc6. Branch codex/national-modernization-20261001 in cot-ifv-identity-20260925.
Owner explicitly confirmed 12 concepts: T-80U, T-72B3M and T-72B3 derivatives for Ukraine, Poland, China and Russia. Russia receives the strongest engine/protection package. Concepts are labeled in public names. Existing originals remain.

Also rebuild t72b3m with the T-90SM upper assembly; bmpt_terminator2 (tier IX) with T-80U hull and reshaped turret; t62mv1_x with the T-72B 1987 turret and matching 125 mm weapon; ua_t64bv with supported foliage, net and cages.

## Sources and design interpretation

- [Bumar PT-91M2 manufacturer](https://www.bumar.gliwice.pl/strefa-militarna/o/MBT%20PT-91M2): modular ERA, bar armor, panoramic sight, remote 12.7 mm station, modern powerpack. Polish concepts use compact vertical tile fields, clipped bustle and NATO camouflage.
- [Rosoboronexport T-90MS brochure](https://roe.ru/pdfs/pdf_4436.pdf): search confirmed remote weapon; full PDF fetch unavailable. Runtime SM turret already has independent first-party source-study geometry. Russian concepts add deepest side protection, long armored bustle, field cases, upgraded engine and reload tuning.
- [China Military VT4 feature](https://eng.chinamil.com.cn/MEDIA/Videos/10197710.html): 125 mm VT4/VT4A1 family. Chinese concepts use swept shoulder fairings and paired optical housings; these are original design choices, not claims about an exact service configuration or functional APS.
- [Ukrainian manufacturer annual report](https://ukroboronprom.com.ua/storage/documents/report_eng.pdf): modernization program context. Ukrainian concepts use field stowage, spaced screens, thermal observation and physical foliage. Exact service-model correspondence is not claimed.

No external mesh runtime loading. Existing native T-80U/T-72B3M/T-72B3 hulls and T-90SM upper assembly are expressly authorized donors. Each hull preserves its original running gear. Turret transplant copies gun, turret plates, crew and modules while retaining hull owners. Concepts use meters and +Z forward.

## Implementation and evidence

- 12 national concept registrations, all tier X / next-generation, in four grouped national families. Distinct bustle dimensions, armor banks, sensors, field equipment, and factory schemes. Russia gets heavier side pods, additional lower protection, 1500 hp, and faster reload tuning.
- Existing three hulls preserved exactly by high/low position-buffer fingerprints. The SM turret extraction leaves its original complete builder intact; concept derivatives replace its aft bins with authored bustles and cages.
- All 12 have one independent 12.7 mm station and named ammunition. Hull/turret crews and module ownership are transposed with the donor frames. T-80 concepts retain turbine powerpack descriptions; SM and 1987 turret hybrids use owner-directed AZ carousel layouts.
- Independent review found and resolved missing side ERA sectors, T-62 sensor/cage contact gaps, Polish armor supports, Ukrainian screen supports, original SM bin/cage intersection, and generic cargo floating behind fuel drums. The concept profiles now own their complete external equipment.
- Actual garage front/rear captures: `.qa-dev/national-modernization/review.html`, 32 images at 1280 × 900. Refreshed after cargo fix; independent static image review found no remaining attachment blocker. Articulation evidence is separate.

## Final qualification

Baseline: 6a72e1fc6. This batch remains local and uncommitted; it has not been pushed or deployed.

| Check | Final result | Evidence under `.qa-dev/national-modernization/` |
|---|---|---|
| All 12 concept strict standards | PASS 12/12: design dimensions, track clearance, cover continuity, equipment counts | `finished-standard.log` |
| Full combat anatomy regeneration and verification | PASS: 217 receipts, zero module alignment failures; 108 dimension warnings retained | `finished-anatomy-update.log`, `finished-anatomy-check.log` |
| Updated concept assets and centering | PASS | `qualification-final-generation.json` |
| All 16 sealed surfaces | PASS, 33 views each; sealed ledger refreshed | `sealed.log`, `sealed.json` |
| All 16 module visual alignment, muzzle bore and circularity | PASS | `module-visual.log`, `muzzle-bore.log`, `circularity.log` |
| Focused donor, articulation, named ammunition, tier, roster and balance checks | PASS; high/low ERA removal and reset preserve donor hull | `final-focused.log`, `finished-standard.log` |
| Type checking and final production build | PASS | `typecheck.log`, `finished-build.log`, `qualification-final.json` |
| Full 16-vehicle release gate | BLOCKED at source scoring | `release.log` |

The full release attempt stops source scoring because comparison files for t72b3m, t62mv1_x, and ua_t64bv are unavailable. BMPT has no local reference and no numerical fidelity result. These four source comparisons remain unverified; their complete strict release standards are not claimed as passed. The 12 explicitly approved original concepts use their frozen design datums rather than numerical real-vehicle comparison, and all twelve passed their separate strict standard. No source-comparison exception was inferred from earlier approvals for unrelated vehicles.

The full suite was not rerun unbounded because of the previously observed memory runaway in awSecondWaveGeometry.selftest.mjs. Focused regression results do not represent a full-suite pass.

### Resolved defects and visual evidence

The initial strict pass caught missing marking anchors, a duplicated census label on the SM remote gun support, and 16 mm track-shoe contact at two skirt brackets. Repairs added marking anchors, correctly classified the support while retaining the real remote gun, raised the brackets 40 mm, and added supported thin fender extensions. Independent image review then caught a 37.5 mm support gap; outboard drop straps now overlap both brackets and armor cassettes. The wheel cavities remain open. The final frozen rerun has zero track band/shoe contacts and zero unexpected cover-continuity cells on all twelve concepts. An intermediate run invalidated by an edit during checking is superseded, not counted as a pass.

`review.html` contains 46 actual in-game garage images: 32 front/rear views covering all 16 vehicles and 14 rotated/elevated/depressed views covering seven representative assemblies. All twelve concept static views and articulation views were refreshed after the final fittings repairs. Independent review of eight fresh front/rear views found no remaining disconnected fittings or stock intersections.

The 22-selection garage probe recorded selection median 79 ms, p95 131 ms, max 139 ms, with zero selection long tasks/freezes. Startup dressing separately recorded three long frames (p95 1144.6 ms). Startup performance remains an open limitation; this local desktop measurement is not a mobile or production timing guarantee.

Earlier failed reports remain for audit. The authoritative final generation, strict-standard and build results are `qualification-final.json` and `qualification-final-generation.json`.
