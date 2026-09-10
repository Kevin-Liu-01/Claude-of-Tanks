# Redrock canyon

The requested direction is a canyon, not scattered mesas or a recoloured
mountain ring. The preceding low-shelf pilot was rejected and remains documented
in `BADLANDS-SHELF-PILOT-REVIEW.md`.

## Implementation

One deterministic regional height function defines the north–south valley,
unequal layered walls, flared deployment mouths and two road-connected side
ravines. The playable terrain applies it before constructing road and pad
supports. The distant mesh uses that same function and seats its inner positive
row on the completed playable heightfield. The central walls have steep faces,
wide rock benches and irregular recessed edges; the distant sandy floor has a
warm baked colour instead of the generic dark mesa base. Secondary roads and strongpoints
move onto the canyon floor; the central settlement and deployment anchors stay.

No additional terrain grids, horizon vertices, textures, materials, lights or
frame update loops are introduced. This establishes unchanged allocation/count
budgets, not a full FPS or retained-memory certification.

## Checks before native review

- `badlandsRelief`: two actual ground seeds; all 29 other maps retain exact
  heights, normals and support arrays. Canyon road grades remain below 20.53%;
  measured deployment/strongpoint footprint relief stays below 1.53m.
- `redrockCanyonHorizon`: five ring/ground seed pairs, including production's
  fixed horizon seed; actual indexed triangle probes include square corners and
  angular midpoints. Maximum tested edge mismatch is 2.47m, within the original
  3m gate. Both canyon mouths remain open through the distant mesh.
- Historical playable-relief, horizon resources, Verdant, Titan and Copper
  Quarry regression checks pass. Original terrain/horizon hashes are preserved,
  not regenerated to accept the canyon.
- `mapQuality`: all 30 maps pass. Badlands' prior hill-descriptor-count gate is
  replaced by measured canyon flanks/floor plus explicit ownership; the other
  29 maps keep their descriptor requirement.
- `matchPlacement`: 30 maps, five modes, 2,100 spawn placements and 480
  both-team access routes pass.
- TypeScript, direct public Vite build and asset stripping pass. The unavailable
  localization prehook was not run; this is not a claim that `npm test` or the
  complete `npm run build` lifecycle passed.

## Native review

R1's three actual daylight screenshots were rejected: the valley layout was
correct, but its walls remained too rounded and the pale distant floor read as
a retaining wall. R2 sharpens the central faces and changes only the low,
gentle outland's baked colour. No extra meshes or shader variants were added.

R2 completed on native Chrome/Apple Metal: three 1440×900 daylight originals,
clean GL/program/error checks and complete browser/preview cleanup. Its overhead
view visibly resolves the central layered cliffs and is accepted as the scoped
canyon checkpoint. The two axis-aligned low cameras sit inside tree groves;
they do not certify canyon framing. Clear road-level views accompany the
derived-data refresh. Distant colour/texture uniformity remains a broader
beautification item, not a claim of finished environment art.

Historical shore-mask, Mangrove-palette, village-wear and all-map terrain-LOD
checks pass without changing old goldens. Previously published Frontier/Alpine
relief is projected only for historical fixtures and independently checked at
the same current coordinates, alongside Redrock.

Derived-output refresh is pending. Do not publish terrain with stale Badlands
collision data or map pictures.
