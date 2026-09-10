# Gameplay draw-submission attribution, September 10

## Bounded diagnostic, not a speed certificate

The existing 923-draw peak lacked object/pass identities. An opt-in
`perfprobe --draw-attribution` mode now observes actual
`renderer.info.render.calls` deltas around `renderBufferDirect`, including
zero-call and multiple-call entries. It preserves the original receiver,
arguments, return/throw behavior and method descriptor. Identity storage is
capped at 4,096; dropped identities, accounting mismatches, observer errors
or failed cleanup invalidate coverage. Normal runtime and uninstrumented
probes do not install it. Instrumented runs explicitly refuse performance
certification and cannot update the performance trend baseline.

The observer uses the sampler's existing admitted callback cohort, including
zero-submission callbacks. Pre-window and terminal pending submissions are
separately discarded rather than silently changing the sampling interval.
Camera identity distinguishes all four CSM cascades; scene identity also
distinguishes the retained late-effects view from the main scene.

## Native acquisition

Evidence: `/private/tmp/cot-interactive-baseline.gsRCvU/`
`gameplay-draw-attribution-r1.json`, SHA256
`78ea138cb73ce692e1eaa735fae3cbf2f192ae951c92880a8503de45c9d6cb8f`.
Acquisition hash:
`3dba94d3e2e779cb4ff799c03016a2c4d2fb91f898d0db07af5c64bdde33ada5`.
Public-build HTML hash:
`033468500976fabefeb700774b2fe2c17271d11445a2b4e2babf37e74e78a216`.
The checkout was `b2aaac31b` with only diagnostic tooling changes; runtime
source hashes matched at both ends. The build hash is recorded separately,
not inferred from the checkout revision.

Chrome151, native ANGLE Metal Apple M5 Max, Verdant, high quality,
1280×720, DPR1, scale1 and trim0. Sixty seconds after control release;
the same pinned fourteen-tank roster, movement, firing and camera-input
protocol used by the preceding qualification packet. No graphics or shadow
cadence setting was reduced.

- 7,070 admitted callbacks; all 2,592,618 counted submissions reconciled.
- 903 identities, zero drops, zero mismatched frames and zero observer errors.
- 2,604,767 observed entries include 12,149 zero-call entries.
- Median/peak draws: 746/810. Peak at 37,775.8 ms: 810 actual calls from
  811 entries, including one zero-call entry.
- The peak includes 136 vehicle-shadow calls and 252 vehicle-color calls.
  Vegetation contributes 56 shadow and 61 color calls. This identifies a
  concrete batching candidate; it does not prove the earlier peak's cause.
- Terminal pending work excludes 788 calls from 789 entries. Original
  wrapper ownership is restored; cleanup errors are empty.

This run did **not** reproduce the historical 923-draw peak. Its strict
budget still fails (median59.9 FPS, p99 25.3 ms), and diagnostic overhead
independently refuses speed certification. The process exits1 accordingly.
Do not use these numbers as an uninstrumented before/after speed comparison.

Next candidate: preserve the exact three authored vehicle shadow proxies
and all four moving cascades, while batching their compatible submissions.
Adoption requires actual native shadow-image and lifecycle verification.
Historical untraced 214–319 ms stalls remain unproven.
