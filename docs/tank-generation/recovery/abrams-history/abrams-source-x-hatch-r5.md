# Abrams X commander hatch — R5 source-backed correction

This is a focused construction receipt, not a release or fourteen-view visual
pass. It uses the selected OBJ and rigid canonical registration pinned in
[the working contract](abrams-source-x.md). No external geometry is loaded by
the playable builder.

## Source observations and implementation

The R4 roof review identified a missing upper hatch layer. Sparse measurements
of source owner 96 distinguish three structures, rather than one cylinder:

| Structure | Source measurement | Native construction |
| --- | --- | --- |
| Lower lid | 529.05 mm wide, 485.59 mm fore/aft | Independently authored elliptical lathe profile |
| Raised cap | Y 2.695435–2.713295 m | 17.86 mm thick symmetric polygonal stock |
| Receiving crossbar | 482.69 × 86.89 × 48.88 mm | Narrow solid joining lid to raised cap |

The cap's six longitudinal width stations and the lid's small analytic radial
profile are design measurements, not retained source triangles. High and low
quality use separate lathe segment counts. The lower circular coaming belongs
to source owner 84 and is correctly round: it is intentionally not reshaped.

The new cap and crossbar are turret-owned equipment. Their thin overlap with
the lid is receiving contact, not a broad pedestal. The fore and aft spaces
under the raised cap remain open. Existing unrelated hatch, roof and weapon
stock remains subject to independently retained pre-edit preservation tests.

## Evidence and limits

Ignored source-only diagnostic:
`.qa-dev/reports/abrams-hatch-r5-A0QdzS/source.json`, produced by
`.qa-dev/abrams-hatch-study-r5.mjs`. It authenticates the selected OBJ and checks
the complete 143-owner scene, not just an isolated target surface.

Held-out complete-source witnesses include cap-top Y 2.713294983 m at
X/Z (-0.508, -0.45) and (-0.75, -0.25); clear 70 mm horizontal rays beneath
the cap at Y 2.66, Z -0.47/-0.17; the actual receiving stock; and the exposed
lower-rim first hit at Y 2.571403194 m near X/Z (-0.63, -0.105).

`src/vehicles/abramsSourceXHatches.selftest.mjs` passes all seven actual models
at both quality levels and three articulated poses: 14 builds, 42 poses.
It checks full-scene first hits and negative space, elliptical dimensions,
receiving continuity and finite geometry. These are finite sampled witnesses,
not proof of every surface or every continuous motion phase.

The independently retained R2 equipment fixture (SHA-256
`e0a281ce1c67c720a0bd842162123ccf71e826717e1e833b68e9a0be6099d0aa`)
provides the unrelated-equipment counterfactual. Diagnostic packet
`.qa-dev/reports/abrams-crows-r5-preservation-WS7bxH/receipt.json` proves
all 12 old/new subsets equal after excluding only the explicitly replaced
lid/cap stock and previously audited replacement components. Later feed
changes require a fresh narrowly scoped counterfactual; candidate hashes alone
must not be used to bless unrelated changes.

Fresh fixed-camera shaded review, geometry/fidelity runs, anatomy and asset
regeneration remain required for this revision. Fine source underside ribs
are approximated by the lid profile and are not claimed to be reproduced.

