# TML missing-wheel relay: independent review — 2026-09-18

**Scoped PASS for the integrated missing-wheel guard.** Read-only review; no profiles, sources, runtime, fixtures, thresholds or cameras edited. This checks the narrow guard and its authenticated receipts, not general track physics or final visual acceptance.

## Cause and exact preservation

`tankFactoryCore.ts` builds relay stations from the canonical course. CV90105 TML retains measured right stations ending at Z−1.854/+2.146 m; its left ends are −1.978/+2.041 m. Neither left end has a matching live wheel within the existing 1 µm station match. Previously the absent wheel became zero travel, so the relay overwrote valid side-specific influence with rest coordinates. At4.9 s the retained failure puts band vertex2888 at Y.092133127 over the tire undersideY.078851987: 13.281140 mm cut.

The new `if (!wheel) continue` executes before reset/write, preserving the actual side's influence/contact result. Matching-wheel selection, offset handling, tangent computation, writes, zero-offset reset and contact solver are unchanged. There is no vehicle-ID exception, station relocation, new allocation or new per-frame search; the branch skips unnecessary work.

I rehashed every file in `tml-track-relay/freeze.json` (no drift), confirmed the integrated core equals the frozen candidate byte-for-byte, and confirmed live TML profile, loaded fill, loaded-contact helper, rough-field regression and end-ramp regression equal the candidate snapshot. I independently recomputed comparisons from old/new/candidate trace JSON rather than relying only on the summary:

| Receipt, both HIGH/LOW | Outcome |
|---|---|
| Candidate left360-frame band trace vs old | Exact hash match |
| Candidate right360-frame band trace vs new | Exact hash match |
| All three wheel matrix traces | Exact hash match |
| All three reset payloads | Exact match |
| Old / regressed / candidate cut | 0.1 /13.3 /0.1 mm, rounded |
| Candidate steady daylight / travel span | 0 mm /249 mm |

The existing rough-field limits remain 3 mm cut,30 mm steady daylight and at least30 mm suspension travel over6 s. The six-model end-ramp and40-span loaded-contact logs pass without changed assertions. Tests and complete scalar/frame receipts remain under `.qa-dev/tank-run/tml-track-relay/`; `independent-review.json` pins this independent verification. No additional heavy simulation was run for this review.

## Limits and edge cases

- **Mixed matching/nonmatching ends are not established by these receipts.** `relayPinned` remains a union of both authored ends, selected whenever any relay reports movement. A side with one matching live end and one skipped end can still suppress footprint-follow at the skipped end. TML has neither left end matched, so the proven left path passes no mask; its right has both matched. This is an existing mask-design limitation exposed by reviewing the new fallback, not a demonstrated current TML failure. A mixed-end fixture should verify per-applied-relay pinning before claiming generic staggered-course coverage.
- The exact1 µm station match and nearest-rest-Y selection among co-station wheels are unchanged. The guard intentionally falls back when there is no exact station, rather than borrowing an adjacent wheel. It does not prove a relay is valid for an unrelated wheel that happens to share Z.
- TML's constructor-to-reset left band changes96 coordinates by up to45.068227 mm in the old implementation as well. Old/new/candidate reset payloads are equal. The six end-ramp models retain their own exact reset assertion; do not extend that claim to TML or silently discard its original exploratory failure.
- Rough-field cut samples every third simulation frame against a radial tire envelope; trace equality covers every360frame buffer, but neither is a continuous finite-shoe/triangle collision proof. Steady daylight excludes fast transients by the existing test convention. LOW tangent qualification is established here only for the specific TML trace, not the six-model HIGH-only end-ramp suite.
- Full supplied-cohort integrated validation remains the parent's release task. No neutral/source target or rendered-shadow acceptance follows from this runtime guard review.
