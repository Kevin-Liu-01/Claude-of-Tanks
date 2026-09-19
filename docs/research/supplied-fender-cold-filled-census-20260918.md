# Supplied fleet fender audit: fresh cold and filled sessions

Date: 2026-09-18. Read-only native audit; no runtime geometry, tolerance, receipt logic or generated asset edits.

The earlier census did detect Ajax. Its saved JSON contains both unsupported rear flaps at HIGH and LOW alongside Warrior and Sabra. My earlier summary omitted Ajax; that reporting error was not a passing audit and was not caused by interior-fill state. The original receipt is preserved at `.qa-dev/tank-run/warrior-mudguard-seat/census.json` (SHA256 `ac6969969322b32f7f1b184fd41a0cd7d536bebc7e7f87b0de3f5eabe24759c8`, 2026-09-18T15:50:13.603Z). Its 12 failed rows cover six real parts across two qualities.

This follow-up executes **78 separate Node processes**: all 13 IDs, omitted/default quality plus explicit HIGH and LOW, each cold and explicitly filled. Each case starts with an empty fill registry and builds only one vehicle. Cold cases never call ensureInteriorFills; filled cases await the selected record and record the actual installed fill meshes. All case identities and process IDs are retained. There were no execution errors, initial resident fill records or within-case profile/core/fill-module drift. Default options match the existing post fixture, including geometryReceipt; default quality is genuinely omitted.

| Vehicle | Registered parts HIGH / LOW | Unsupported HIGH / LOW |
|---|---:|---:|
| ajax_x | 2 / 2 | 2 / 2 |
| kurganets25_x | 4 / 4 | 0 / 0 |
| ztz100_x | 0 / 0 | 0 / 0 |
| fv510_milan_x | 10 / 10 | 0 / 0 |
| griffin50_x | 2 / 2 | 0 / 0 |
| kf41_lynx_x | 0 / 0 | 0 / 0 |
| cv90_mkiv_x | 4 / 4 | 0 / 0 |
| cv90105_tml_x | 4 / 4 | 0 / 0 |
| sabra_mk2_x | 10 / 10 | 0 / 0 |
| aft10_x | 14 / 14 | 0 / 0 |
| bmp3m_dragun125_x | 4 / 4 | 0 / 0 |
| k21_x | 4 / 4 | 0 / 0 |
| type96b_x | 16 / 16 | 0 / 0 |

The table applies identically to cold and filled sessions; default equals HIGH exactly. At these pinned pre-Ajax-repair identities, Ajax is the sole remaining registered-seat failure: both rear flaps have an 82.9699 mm gap at HIGH/default (X 80.0000 mm, Z 22.0001 mm) and an 83.8696 mm gap at LOW (X 80.0000 mm, Z 25.1815 mm), nearest bucket hullDetail. The unchanged limit is 50 mm. All twelve Ajax case/part failures remain recorded; none is waived. Its six cases were completed before the separate author was released to repair Ajax. Warrior and Sabra use their frozen corrected profiles.

ZTZ100 and KF41 have zero registered parts in this audit, so they have no receipt-based seating coverage here; zero failures is not a claim that unregistered geometry has been physically checked. For every other ID, no additional unsupported registered part was found. This is the existing AABB/assembly receipt audit, not a substitute for source-supported finite contact or moving-track collision checks.

The factory computes these receipts from the unmerged authored hull buckets at `tankFactoryCore.ts` around line 10723. It applies generated interior fills afterward, around line 13027, as separate meshes. The fresh-process equality confirms that fills do not hide these seat failures.

Evidence: `.qa-dev/tank-run/fender-cold-filled-census/report.json` (SHA256 `0d2aec18aa525025ac9885d553e8bd3b407099996e8f8985da522daeca490f4b`), `verified-summary.json`, six per-ID JSON/log pairs and authenticated per-profile snapshots in the same directory. All failures are aggregated programmatically rather than reported from selected console rows. Profile identities are listed in the summary; final Ajax repair and full fleet post tests are separate work.
