# Leopard smoke-launcher local-frame correction

Implementation checkpoint only; complete anatomy and targeted release remain
with the parent integration. No new source import, vehicle body, gun bore,
launcher bracket, asset refresh or fleet-wide smoke policy is introduced.

## Scope and cause

The owner requested direct primitive/style/attachment improvements across the
new vehicles. This slice covers `leo2a7v_x`, `leo2a6m_x`, `leo2a4m_x` and
`leo2_revolution`: sixteen existing launchers each. Leopard 2A5 X and all other
families retain their existing handlers.

The three X profiles share `leopardX.ts`'s `smokeBank`. Its tube used Euler
pitch −0.48 and yaw ±1.00, but its cap was translated by a freehand owner-frame
offset `(±0.084, 0.052, 0.050)` metres. That offset is not parallel to the actual
rotated tube axis. Revolution repeats the same defect with pitch −0.32, yaw
±0.40 and cap offset `(0, 0.027, 0.079)`, omitting the sideward axis component.
Direct Euler-axis projection gives 26.038 mm and 32.519 mm perpendicular
cap-center errors respectively (not merely distance to a guessed tip point).
These are geometric mismatches, not a claim that every protective cap should
be an open launcher bore.

`cappedSmokeLauncherGeometry` retains each original closed cylinder recipe and
the original protective-cap radius/depth/segments. Both material parts share
one local +Z frame and the same existing mount transform. The cap is centered
on the tube's forward plane, with 6 mm of positive axial overlap and 6 mm
standing outside it. Tube geometry, launcher stations/aim, mount brackets,
material buckets, turret ownership and the intentional capped state remain.
No extra per-launcher mesh or triangle is added.

## Inputs and proof

The isolated branch started at freshly fetched published main
`560397d07fe13bdd4d29709b462931373544fd69` (the newer-than-requested commit is
UI overlay work). Independent `npm ci --ignore-scripts` installed 529 packages;
it did not alter another worktree's dependencies. Original input SHA-256:

| File | SHA-256 |
|---|---|
| `profiles/leopardX.ts` | `b6b20e050fcf830332f39b2885e4b283ec726bc435a00c851f923e6d32acf8a1` |
| `profiles/leopardRevolution.ts` | `272a7c20df1f718f1d98c34d6b75c9ea7d2122a3797ab3c9ce5b8026e13d5417` |
| `package-lock.json` | `53b8f49d80b0a51e9b77d46f11b68f69aeb27f73b46d1c7ad281c27cc8f3b1e0` |

The focused test constructs each actual native procedural tank at HIGH and
LOW, including a control that replays the exact old cap-only offset and
primitive. It checks emitted body/cap triangles, both sides, original sixteen
launchers, finite five-ray end-face contact, four turret yaw poses, original
aim/stations, retained geometry/material/instance buffers, and no new meshes.
All non-cap authored geometry is byte-compared. Cap triangles must actually
exist in the merged native dark mesh before their rows are isolated for the
retained-stock comparison; this is not a test of a detached helper only.
The merged dark bucket uses multiset rows of position/normal/UV components
quantized at `1e-5`; every other native geometry buffer and each non-cap
authored emission are compared by exact attribute/index hashes. This is not
a claim of bitwise equality for the deliberately translated cap vertices.

The old freehand placements remain rejecting witnesses. New sideways and
coaxial-but-detached cap mutations must also fail. The queued focused driver
hashes runtime, tools, dependency manifests and itself before/after; its ignored
receipt is the exact executed-input record. This Node proof does not assert
rendered appearance, source silhouette qualification or tank-switch latency.

The first focused run (`.qa-dev/smoke-frame-focused-7wn9uE`, input
`21e2ee530276f2b73f7eb927bed64734a516d85f4457c3780738cd95a9f9cfa3`, unchanged)
failed before geometric checks because the fixture expected five transform
values, while the existing `equip` wrapper explicitly emits a sixth zero-roll
value. The expectation now includes that exact zero; no runtime change or
alignment tolerance was made in response. The failed receipt is retained.

The second run (`.qa-dev/smoke-frame-focused-OqNTrx`, input
`e3ba67dfeec71b66e00d72c2b92d1b09a44a49bf6ceb59cd2a3e4a3448db91ec`, unchanged)
reached the actual merged-cap check, then rejected a rendered material-name
expectation: this geometry-receipt path deliberately supplies unnamed
nonrendering materials. The check now compares the exact live builder's
`mats.dark` object identity, keeping the asserted material role and merged
bucket unchanged. It does not claim actual camo pixels from a Node adapter.
This false receipt is also retained; runtime and physical tolerances did not
change.

The third run (`.qa-dev/smoke-frame-focused-v2gkf0`, input
`c1e36a2ca1baaaa34524fb2d1923b27b682c5fc86f50a2db811ff5a14ec696a3`, unchanged)
completed the three X profiles' checks, then found that Revolution's existing
wrapper omits the zero-roll argument instead of explicitly passing it. The
fixture now compares each cap's complete emitted transform tuple directly to
its immediately preceding body's tuple, while separately requiring zero roll.
This preserves both wrappers' exact conventions and does not alter geometry.

## Focused result — PASS

Fair driver session 56256 exited 0. Receipt:
`.qa-dev/smoke-frame-focused-vTQmaG/receipt.json`. Complete input digest before
and after: `0994cd22cd17212a74ca3840c4ed44dcc1e9070fb258793a9ff89124c984a4a0`.

- 16 actual procedural builds: four IDs × two qualities × old/current cap mode.
- 128 current launcher-quality records (64 unique launchers); 512 posed pairs.
- 128 original off-axis placements rejected; 16 sideways/detached mutations
  rejected without relaxed tolerances.
- Actual old maximum axis errors: 26.03784 mm on the three X profiles and
  32.51912 mm on Revolution. Corrected maximum: `4.3906108277855603e-8` m.
- Each actual cap is present in the merged native dark bucket, on the original
  turret owner. Every original tube/aim/station and other authored emission is
  byte-identical. Native retained geometry, material assignment, local matrices
  and instance buffers compare unchanged; no additional triangles or meshes.

The runtime stayed unchanged through the fixture corrections. No full npm
suite, native renders or global assets were run in this slice; final
rendered/anatomy/targeted-release qualification is still required. No claim is
made that this small attachment correction resolves overall tank-switch lag.
