# Exact composition of the two Merkava end-return seams

This is **test-only source authentication**, not runtime normalization,
geometry removal, a paint inverse or release permission. It follows the
[Mk3D finite-plane correction](merkava3d-front-return-finite-plane-correction.md)
and [Mk4 fitted end returns](merkava4-x-end-return-checkpoint.md).

Both independent physical tests originally removed their own helper import
and call before comparing the complete shared `merkavaX.ts` to SHA-256
`a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6`.
Combining both authorized additions necessarily leaves the sibling's two
lines behind. The original one-seam hashes still fail on the composed source;
the new focused control retains both failures rather than refreshing a golden.

`merkavaXEndReturnHistory.test-support.mjs` recognizes only these exact seams:

| Owner | Required location | Complete corrected helper SHA-256 |
|---|---|---|
| `merkava3d_x` | Immediately after its own `addMerkavaXShoulderReturns` call | `31f87c0c11deb1fc86f5fa1ffede512494f2cf2fec0e0e1a555626889c3c5479` |
| `merkava4_x` | Immediately after its own `addMerkavaXShoulderReturns` call | `28c6b33721161a0c601b1e561a58c635e6d0c242b4be45a7fce6a67ba66da39d` |

The symbol must occur exactly twice: one exact import and one exact anchored
call. Every present helper's entire source is authenticated before its two
lines are removed. The calling physical test's owner must actually be emitted.
The complete remaining shared source must still match the original `a7cb…`
hash. No other line, material, profile, geometry, parameter or helper is exempt.

The dedicated controls reject unauthorized whole-profile text, missing and
duplicate imports/calls, relocation into the other vehicle's builder, moving
a call before its required anchor, modified helper bytes and an unknown owner.
Independent single-sibling and composed profiles both recover the same old
hash. Every actual physical test below the original authentication prefix is
unchanged: real new/retained stock, finite contacts and plane separation,
complete near/far/merged movement, lower-air exceptions, bounds, camo/ownership,
ERA persistence and all old negative controls remain on the actual candidate.

## Focused verification

The composed tree based on `43cf5c9fb872a55d7717ee3b02a99caf83c8e24f`
passed the three focused files through separate fair-capture leases (driver
session 75061, exit 0):

- History authentication: both owners, 19 rejecting negative controls, and
  both original single-seam failures retained.
- Mk3D: both qualities, 168 finite contacts, 12 old-gap witnesses, 520 sampled
  poses, 242,088 actual instances, 48 cap-plane comparisons and 10 negative
  controls.
- Mk4: both qualities, 276 finite contacts, 24 old-gap witnesses, 520 sampled
  poses, 237,896 actual instances, 48 cap-plane comparisons and 10 negative
  controls.

The physical results match the corrected independent candidates. The pose
coverage is finite, not a continuous-time or arbitrary-terrain certificate.
This commit changes only test authentication, its registry row and this proof;
no runtime or render input changes.

The separate native receipts document the corrected runtime, not this later
test-only source tree. The final combined source/dependency tree still needs
the parent's fresh anatomy and complete targeted release. This helper cannot
turn those pending checks into passes.
