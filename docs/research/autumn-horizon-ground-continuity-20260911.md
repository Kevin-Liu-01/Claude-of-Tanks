# Autumn near-horizon ground continuity

Autumn's low perimeter view stretched the angular forest atlas across a near hill. Replacing it with a brightened grass sample removed stripes but produced a uniformly mustard slope: the sourced albedo was multiplied by the horizon's existing baked tint and unlit response.

The accepted revision draws only the two nearest existing horizon bands with the world's existing terrain material. It uses the same source albedo, normals, light and shadow setup as the foreground. The original outer bands keep their original material. No material or texture is cloned. The existing live resource declaration retains the borrowed splat textures, and normal whole-world disposal deduplicates both owners.

The first positive seam row is fitted to the real square terrain boundary using the bounded Redrock seam minimax method with pinned square corners. The buried row and all farther rows keep their original positions. The two near bands retain their geometric triangles, with their old downward winding explicitly reversed for the shared front-side terrain material. No triangle is removed.

## Scope and evidence

- Native matched development renders: `.qa-dev/launch/horizon-surface-native-r8/report.json`, native ANGLE Metal on Apple M5 Max, 1440×900, DPR 1, pinned high quality.
- Seven Autumn before/after pairs: original shore49, establishing, four low perimeter directions, and actual battle night shore49. Parent and a separate critic accepted this scoped change. East/west views are substantially tree-occluded and do not prove their entire perimeter seams.
- Five Redrock/Alpine/Coastal control pairs in the same run were RGBA-identical. All 21 camera/state/height-query receipts matched; all within-scene controls were stable and cleanup completed without errors.
- All seven Autumn resource receipts matched. This is not a frame-time or global resource-ceiling qualification. The combined raw report remains failed because the separate, unaccepted Saltwind sea candidate changes geometry and has resource-history differences.
- Focused tests cover actual material identity, shared-texture preservation and exactly-once disposal, unchanged geometric triangles/outer indices, upward near winding, original atlas retention, and bounded actual terrain seam error across three seeds. The original Redrock path is retained when corner pinning is disabled.

## Cost and limits

There is no added mesh, geometry, triangle, material or texture owner. The horizon now has two material groups, adding one group draw when rendered. The near bands run the existing terrain shader rather than the former basic horizon shader; GPU time has not been qualified from these images or counts. Seam construction adds approximately 13,700–15,100 terrain queries once per Autumn build, not each frame.

The scoped change does not include Saltwind sea work, global launch performance ceilings, or all-map visual certification. Rejected R2–R7 images and the R7 material-gain trial remain preserved in local QA evidence.
