# Polders terrain-streaming golden history

This is a test-only repair of a stale authored-height expectation, not a terrain
or streaming change. The unchanged test on `b14388f41bcb30238efd6699dd6e87a244f51f22`
failed only at Polders: expected `701d4611…`, actual `b933cb9c…`.

## Independently executed published history

Every row below executed that revision's actual heightfield and recursively
resolved relative imports from authenticated Git blobs, against the **same
maintained chunk emitter and checks** from the current test. No historical
height algorithm or map recipe was reconstructed by hand.

| Published source | Authored geometry SHA-256 |
| --- | --- |
| `c4351617a679ebc64e83a64571fc8c0d217ca617` — parent of the contour update | `701d4611153e67baea6505fa125c0a185bfdd1dbe2fad6df5ab98791554f722b` |
| `37271a90b67214dd836261a9f019cdc6aaf54d9a` — shared irregular retention-basin contours | `96956e342ce22d4aebc4a43168fc47ea1698d81c3712169cf2c5484e1b6cf49f` |
| `5331e13808550a9628df8d0f18b3cf5c4c0c7a33` — immediate parent of the drainage fix | `96956e342ce22d4aebc4a43168fc47ea1698d81c3712169cf2c5484e1b6cf49f` |
| `56924f7bf31fdc7139f8a1897d686d25603d835b` — safe Polders drainage basins | `b933cb9c4bd67070e904ffe66696ec235014bb53398886534f920f1345bc5f51` |

The initial hypothesis that the immediate parent of `56924f7bf` would reproduce
the oldest golden was explicitly rejected by execution. The earlier published
`37271a90b` change also matters. The latter drainage commit changes both basin
recipes and overlapping authored-lake apron composition; this replay does not
claim to attribute the final digest to only one of those two changes.

All four historical chunk-emitter suffixes (`const CHUNKS = 8` through EOF)
are byte-identical to current source, SHA-256
`2f13524f688bfdf1bd352f73d719ae7f96ad717ae94c45f365858a5077570089`.
The maintained, pre-repair selftest SHA-256 is
`45f17c689b0ba9a6b2e6f847fb84688d9a8aca748c7b9e37cf597a5eef7e5938`.
Execution used Node `v24.13.0` and Three.js `0.185.1`; this is renderer-free
geometry evidence, not a native render or performance measurement.

Relevant authenticated source blobs:

| Revision | `terrain.ts` | `maps/polders.ts` |
| --- | --- | --- |
| `c4351617a` | `b7d2f4c93833ba6fca4a07a726485233907b2f0a` | `1ce81f35630258159be6c9e64076bdf74e4c446f` |
| `37271a90b` / `5331e1380` | `d7d95b538bf1556b6509a1d6b7c63825ef17b126` | `0461bb9b689f00aa4aa55ac1c3ede96694693390` |
| `56924f7bf` | `015b591777465494117941382517a172e8562d2d` | `ff1da61a5b7245ce70b53faaf66795a3c0deebda` |

## Unchanged contracts

Each historical replay checks seed 1337, the spawn chunk and its east neighbor,
plus both opposite map corners. It retains exact padded Float64 fine-grid
equality, startup/live checkpoint counts, all 96/48/24 LOD position/normal/index
bytes and Float64 bounds, direct-sampled far geometry, shared Uint16 topology,
skirts, and all nine east-seam LOD combinations. The existing scheduler,
deadline, camera-reversal, GPU suspension and disposal checks also execute.

The repaired default test still covers all 30 maps. Only Polders' golden changes.
Its additional negative controls reject both superseded published digests and
a one-bit mutation of an actual current position-byte stream. They do not modify
the source geometry or weaken a comparison, tolerance, checkpoint or budget.

Local replay provenance is retained under
`~/.codex/visualizations/2026/environment-recovery-20260907/polders-streaming-history-20260908/`:
`replay.mjs`, four JSON source manifests, and the failed initial-parent
hypothesis. The manifests authenticate all 50/51 executed historical modules
using Git blob IDs plus SHA-256. This local evidence is not a dependency of the
committed selftest; the published commits and the table preserve its history.

Verification command:

```sh
node src/world/terrainStreaming.selftest.mjs
```

## Integration verification

The isolated integration at `41d6cc9a56d5dc3a94af382c4f945c675747e17d`,
on `ea4956cfa0637cb98cf2ba04fc15b9b0b86d5380`, passed the maintained
terrain-streaming, Polders-shoreline, authored-lake-composition and terrain-LOD
selftests on 2026-09-08, 23:50:35–23:51:42 UTC. All tracked source, tool,
server and package inputs were unchanged across the run. Local receipt
`.qa-dev/polders-history-verified-yN3omC/receipt.json` has SHA-256
`8208e28814f34ba6d5b22c81345d40338504371db83af807a11f5e55191b1ef7`.
This test-only checkpoint does not claim a complete fleet release or build.
