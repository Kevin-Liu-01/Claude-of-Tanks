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

## Derived-data release

`redrock-derived-refresh-r1.p545nm` completed on native Chrome/Apple Metal with
unchanged source/build pins, clean GL/program/error checks and complete owned
browser/preview/FIFO cleanup. Receipt SHA256:
`83d4c9f90d393e5ee416c493563c22465dc8bc98653fe35b30fa6382e0259663`.

Both clear road-eye originals at 1440×900 show the unequal tiered walls, open
valley and grounded near roads/props. The canonical hero was captured at actual
3840×2160/DPR1, then encoded with the maintained 512×288 thumbnail recipe. The
minimap is an actual 440×440 textured scene capture. Both reviewers accepted
these as the scoped canyon checkpoint. Large empty stretches, repeated rock
strata and uniform distant silhouettes remain on the environment-art backlog.

Only Badlands' collision shard, its index entry and three image assets changed.
The other 29 index entries/shards and 87 image assets remain byte-exact. The
shared minimap URL owner invalidates only Badlands' old raster cache.

| Badlands collision output | Before | Canyon |
| --- | ---: | ---: |
| Encoded bytes | 814,657 | 780,524 |
| Movement obstacles | 2,840 | 2,643 |
| Shell colliders | 2,676 | 2,475 |
| Concealers | 1,888 | 1,698 |

Unchanged seeded placement rules accept different props/trees on the changed
terrain. The exact census is regenerated, not tolerance-relaxed. Existing
per-map and total collision-storage ceilings are unchanged. Construction/frame
timing and constrained-device performance were not certified by the artwork
capture; unchanged mesh/texture budgets are not a substitute for those tests.

Final release checks completed on September 10 in
`redrock-final-release-20260910.UclbtW`: collision codec, lazy loader, exact
dedicated-world census, all-map/all-mode placement, minimap orientation/runtime,
map-art guards and signaling all passed. TypeScript, the direct public Vite
build and asset stripping passed. Built index SHA256:
`3b4d70d78fafe264d5d32d76b881c64c9cc9bca634064b3aab6f62ab5e3805e5`.
The build contains byte-identical copies of all three installed Badlands images
and the `north-up-v7-redrock-canyon-v1` minimap URL revision. Build warnings
about existing large chunks remain; no complete npm lifecycle or physical-device
performance certification is implied.

## Material refinement — September 10

Independent inspection of the native hero and clear road-eye view identifies
two conspicuous repetitions, not a need for more geometry. The terrain shader's
roughly 26m dune-bed sine applies albedo and normal variation across the whole
flat floor and never fades out. The canyon checkpoint enabled it through
`rippleAmp: 0.28`, although this valley is an alluvial canyon floor rather than
an erg. Cliff bands combine the small repeated sandstone tile with another
world-height sine/caprock layer. The horizon has its own mesa banding.

The accepted material refinement changes four existing Badlands controls:
`rippleAmp` .28 → .045, `strata` .14 → .035, rock luminance contrast .72 → .34
(midpoint .47 → .43), and horizon banding .16 → .045. Geometry, routes,
placement, lighting and all other maps remain unchanged. No shader work,
textures, materials, meshes or per-frame owners were added.

`redrock-material-compare-r1.Ke9iUJ` captures the exact previously shipped
absolute camera positions/quaternions/projections, including the 68° hero FOV.
Receipt SHA256:
`6a2ed305e2a4914d4e9ec742a4fa9cf54f719c3733632d2b3bdef6530f11bcbc`.
Both 1440×900 road views and the actual 3840×2160 hero show much less floor-wide
striping and quieter cliff bedding. Native Chrome/Apple Metal reports clean
GL/program/page checks, unchanged source/build pins and complete owned cleanup.
The capture receipt intentionally does not confer art or performance approval;
the narrow visual judgment is recorded here after viewing the actual images.

The matching textured minimap is 440×440; the maintained thumbnail is 512×288.
Only these three Badlands assets change. All 31 collision files, 87 sibling
images and the map-art registry remain byte-exact. The shared minimap URL owner
invalidates only Badlands' raster cache (`north-up-v7-redrock-material-v2`).
Hero/thumbnail/minimap encoded sizes fall from 894,422/31,020/76,626 bytes to
788,668/25,144/71,282 bytes; dimensions remain unchanged.

Eleven focused material, canyon, historical-palette, mask, horizon-resource and
all-map terrain-LOD tests pass without changing original fixture goldens.
TypeScript, direct public Vite build and asset stripping pass; acquisition build
index SHA256 is `56155e5504df9d4d791b93d5a727bcc2b86b6dd70661cc54aac8d95df0809fe2`.
These are not full npm-lifecycle or constrained-device FPS/retained-memory gates.

Remaining art work is explicit: the road still has regular corrugation, the
floor has sparse empty stretches, and broad cliff surfaces remain too uniform.
This is a scoped improvement, not completion of the environment beautification.
