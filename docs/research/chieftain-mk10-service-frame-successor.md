# Chieftain Mk10 X service-frame preservation contract

2026-09-08 — test-only successor to an incompatible historical comparison.
No runtime geometry, lamp annotation, source oracle, armor rule or visual gate
changes in this checkpoint. Both focused tests pass at HIGH and LOW; this is
not a complete-suite or vehicle release certificate.

## The two real historical stages

The [service-frame source receipt](../references/tanks/chieftain_mk10_x.service-frame-source.json)
was captured at 2026-09-07T00:40:45Z. It certifies subtracting that new helper
from the then-current complete model, preserving 317,904 HIGH / 291,504 LOW
draw vertices at 10 micrometre position quantization. Those original counts
and SHA-256 values remain unchanged, both in that receipt and explicitly in
the test's `PRE_FOUNDATION_HISTORY` table.

The owner subsequently requested the Mk5-derived Mk10 foundation. Its
[independent validation](../references/tanks/chieftain_mk10_x.mk5-foundation-validation.json)
records a pre-edit capture at 05:17:43.500Z: all 668 non-foundation emissions
and complete unaffected native meshes remain pinned, while the hull/casting,
horns, permanent Stillbrew classification and two marking seats may change.
Both stages first entered Git together in published commit
`099edfa49603bc473548f6986c8598267a24a4db`; there is no Git predecessor
containing the earlier complete Mk10 builder.

A bounded archive search recovered that original equipment snapshot and the
source/fidelity/geometry receipts, but not the excluded earlier structural
buffers or a complete pre-foundation source/native export. The 155 Mk10
builder copies in the available worktrees reduce to the published source and
later running-gear/LOD WIP, neither of which recovers the early casting.
No prior geometry has been invented to force the old whole-model hash.

## Independent published control

An isolated, unmodified detached worktree of **099edfa49** was constructed
with its own `npm ci --ignore-scripts` installation. Its original unchanged
service-frame test independently fails `318516 !== 317904` at line 106.
The test source SHA is
`473b4a8e5aebed17330df280207dd61a44fe587a0fbabcd76424183a7fe38ae2`.
This is a preserved failure of the already-published baseline, not evidence
that the unrelated seven-target bodywork candidate changed the Chieftain.

A diagnostic copy retained every original source-crown, contact, underside,
air and hull-ownership assertion, but reported the two historical comparison
values rather than asserting them. It captured the complete physical
world-position multiset after subtracting only actual helper vertices:

| Quality | Published post-foundation count | SHA-256 |
|---|---:|---|
| HIGH | 318516 | `e927370c12f00c11a34427869aead2258efaf86dd0ddbcac31ce47b665cbf4bf` |
| LOW | 292116 | `29edd3bbcd982846879d481ca9f66a28c9ed884f5f807a8c63847750a0bacac2` |

Both are 612 draw vertices above the earlier receipt. All the retained
physical assertions passed. A separately installed current-main `c5ca781e2`
control produced exactly these same two counts and hashes. The successor
values come **only** from immutable published099, never from the candidate.

The [successor receipt](../references/tanks/chieftain_mk10_x.published-foundation-preservation.json)
records exact capture times, original test failure, complete hashes for all
24 authored Mk10/foundation/direct-leaf sources, relevant published factory
source hashes, lockfile, installed Three.js 0.185.1 / TypeScript 7.0.2, and
actual Three.js geometry implementation file hashes. Both controls used
Node v24.13.0 and independent dependency directories. Three.js and its
geometry dependency bytes match; the complete npm lockfiles differ and that
difference is explicitly recorded, not concealed as identical dependencies.

Private diagnostic receipts remain in
`cot-chieftain-service-frame-history-20260908/.qa-dev/` as
`mk10-source-099edfa49-count-proof.json` and
`mk10-source-c5ca781e2-count-proof.json`. The immutable control worktree is
`cot-chieftain-service-frame-099-control-20260908`. Neither dependency trees
nor temporary QA files belong in the published commit.

## Narrow active contract

The current test now certifies **preservation of the published post-foundation
successor**, not preservation of the earlier whole Mk10. Its draw-index
multiset, quantization, inclusion of all moving gear and turret stock,
original marking/shadow exclusions, exact helper-subtraction multiplicity,
source/contact/air rays and hull ownership assertions are unchanged.

All 24 complete authored sources must authenticate against published099.
One later source-only annotation is accounted for explicitly:
`b2f3aa9a8` adds the night-lens import and wraps the four existing Mk10 lamp
faces with `markVehicleNightLens(front, 'headlight')`. The helper authenticates
that entire current file, removes exactly those two source-code annotations
only for the source-hash comparison, then requires the complete099 hash.
Actual runtime faces, transforms, lighting metadata and light semantics are
not modified, excluded or rolled back.

The existing `chieftain10XMk5Foundation.selftest.mjs` is unchanged. Its
668-emission, original unaffected-mesh, complete Mk5, source casting, variant
air and ownership contracts continue to apply independently. No older
physical assertion was weakened to accommodate this successor.

Negative controls require a 1 mm actual turret mutation, a translated native
moving-gear instance, an invented service-frame subtraction and unauthorized
family/lamp source mutations to fail. The original source/history receipt
must remain exact as well. These tests cannot certify historical geometric
equality that the later authorized casting revision intentionally removed.

## Focused qualification

`chieftain10XServiceFrame.selftest.mjs` passes at HIGH and LOW with the
unchanged physical source/contact/air/ownership assertions, exact published
successor preservation, six actual physical mutation/subtraction rejection
controls and two complete-source mutation rejection controls.

The unmodified `chieftain10XMk5Foundation.selftest.mjs` independently passes
at HIGH and LOW: immutable Mk5 geometry, all 668 retained Mk10 emissions,
source datums, variant negative space and ownership. Its source SHA remains
`5caa5c349ee126e2060abf7613fc8713028540a9354087e4668e155b6a7cc4ef`.
The FIFO-captured two-test driver exited successfully. The original099 test
failure and both independent capture receipts remain preserved. Full-suite
qualification belongs to the separate final integration run.

## Published-main integration check — 2026-09-08

The two history repairs were rebased onto published
`5a13dadb0a2239a9cb65a092b62f58296f727fb8` and tested together at
`c7a220797711deafe4b650693b1753d7375100a1`. The maintained FIFO selftest
runner passed `historicalT90MLamps`, the complete `sourceXFleet`,
`chieftain10XServiceFrame` and the unchanged `chieftain10XMk5Foundation`
tests from 23:20:21 to 23:22:57 UTC. Source, tools, server, dependency/build
configuration and the new historical receipt were hash-stable throughout.

The integration delta contains only nine test, test-support, suite-registration
and documentary files. Production runtime, package files, public assets and
build configuration are byte-identical to that published base. The sole suite
registration change adds the historical-lamp test; no test is removed or
skipped. A production build was not rerun for this test-only delta. This is
not a full-suite pass or a release certificate for the separate unfinished
bodywork and running-gear candidates.

Private receipt: `published-history-verified-2mhST8/receipt.json`, SHA-256
`4b067bb369550636ae3b2f9de17e78973341885a65c7b47649563ebcb2922c09`.
Driver SHA-256:
`5977c71f91043ba613a9430871e56c7c351711a15dcbbdc0a49d9108760e884d`.
Neither temporary QA files nor dependency trees are included in the checkpoint.
