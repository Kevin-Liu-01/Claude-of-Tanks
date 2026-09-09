# Abrams X counter-assault mount — R4

The two urban variants now use independently authored source65 mounting stock,
the three source68 receiving seats, and the relevant source70 feed assembly.
The existing source67 M2, pitching casting, gun linkage, and mantlet lamp remain
unchanged. This is a bounded assembly correction, not whole-tank qualification.

The complete 143-owner OBJ remains unchanged (SHA-256
`85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`).
Its metre frame remains `[-rawX, rawY + .203945, .357965 - rawZ]`.
The runtime reads no source geometry, source topology, or authoring packet.

## Geometry and explicit approximations

- The old two round legs and filled cradle were replaced with folded A-frame
  legs, a slotted channel, stepped saddle, open side receiver, and the measured
  ammunition container with its upper pocket, folded ends, and partial covers.
- Source68's three receiving stocks retain four hexagonal apertures. These
  are receiver-only openings: the separate source65 floor above the central
  two holes remains real material, so those rays are not claimed whole-scene air.
- Complete-source rays confirm a roughly 0.69 mm seam between source65/90 and
  the container end skin. The explicitly approved correction extends only the
  concealed mating face from X .05633 to .05713 m: **0.8 mm**, leaving an actual
  sampled lap of **84.218–111.026 µm**. Exposed planes and surrounding air stay put.
- The 19 source70 links are zero-thickness, two-plane strips. Their measured
  outer folds are retained; a **0.6 mm inward local-Y closure** makes real stock.
  An inferred-tangent draft failed three attachment checks and was replaced
  with all 19 independently measured fold profiles. No cartridges were enlarged
  or moved to hide those gaps.
- Twenty cartridges use measured axes and separate case, shoulder, neck,
  taper, and tip stations. Analytic 12-sided sections smooth the source's
  six-sided cases; sub-0.1 mm source axis drift is omitted. This is not a caliber
  claim. Hidden source-open mating faces are independently closed, and tiny
  transverse warping is an explicitly retained approximation.

The final helper emits **83 uniquely tagged closed stocks / 3,380 triangles**.
All use the existing gun rig and equipment-material path. There is no new
per-frame work, generic filler, duplicated gun, or broadened armor bucket.

## Verification

`src/vehicles/abramsSourceXCounterAssault.selftest.mjs` passes for both
`m1a2_tusk_x` and `m1a2_sepv2_x`, high and low detail, at three yaw/pitch pairs:
**four actual builds / 12 posed combinations**. It checks:

- Closed outward finite stock, normal/UV compatibility, and 83 independent
  provenance tags. The test catches the initial missing-cartridge-UV failure.
- Sixteen independent complete-source surface witnesses against both the
  captured stocks and the actual assembled scene; **five whole-scene air lanes**.
- **Four isolated receiver-hole negatives**, distinct from those whole-scene rays.
- Actual casting-to-receiver, receiver-to-frame, container, and M2 support
  contacts; each of the 19 folded links positively contacts a cartridge through
  all poses. The stepped cartridge has an actual shoulder-air negative control.
- No old leg/cradle duplication. The complete M2 subtree remains byte-identical
  to its pre-edit high/low fixture (`7f45cbdbea6deebadd52a87a4ab0e908a81a2018deb1dcbc2dadfe676f7c79fa`).
  Eight original gun/linkage/lamp emissions retain their exact buffers,
  ordering, buckets, and transforms (`26d077fa4b78950de9071815fa0ea07e42e568964a8a942bde52498f7d356746`).

Code quality passes: 27 functions, no complexity violations, `any`, or `unknown`.
Earlier rejected checks remain archived; they are not retroactively marked pass.

## Retained local evidence

- Source65/68 first surfaces and sections: `.qa-dev/reports/abrams-counter-assault-8rICFU/source.json`.
- Independent source70 folds: `.qa-dev/reports/abrams-citv-support-8tiED2/source.json`.
- Source70 cartridge stations: `.qa-dev/reports/abrams-citv-source-gO1EaR/source.json`.
- Pre-edit M2 and gun fixture: `.qa-dev/reports/abrams-counter-assault-before-LZh7u3/native.json`.
- Final actual construction test: `.qa-dev/reports/abrams-counter-assault-focused-Y8onFb/focused.log`.
- Frozen hashes, counts, approximations, and lap measurements: `.qa-dev/reports/abrams-counter-assault-frozen-Pb9OKh/receipt.json`.

Fresh visual, anatomy, and release qualification remain the integration owner's
responsibility; this focused result does not waive the retained whole-model gates.

