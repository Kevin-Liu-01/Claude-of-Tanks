# Distant mangrove stem contact — 2026-09-09

This is a narrow attachment repair, not completion of the tree/forest artwork.
Runtime checkpoint `5c6a6f852` applies only the four-file source change
`196753a7a` on the published reed release `3cdbf6149`.

## Defect and correction

Production vegetation seed 2001 produced a distant mangrove whose fixed trunk
cap stopped below its seam-corrected crown: none of its 30 cap vertices was
inside a closed crown lobe. The trunk had not changed; the crown had. Both were
already scaled together.

The builder now fits the existing cap into its actual crown. It first preserves
the original horizontal column, then permits a bounded shift of at most one cap
diameter toward a real lobe if necessary. Only the existing cap vertices move;
ground-ring positions, other attributes, crown, RNG, geometry storage, materials,
instances and collision remain unchanged. Degenerate/unsupported future crowns
retain the finite legacy stem rather than crash loading; that fallback is not
considered successful contact by the tests.

The work is construction-only for two library variants, at most 320 triangle
plane checks and bounded centroid sums per variant. There is no added per-frame
operation, retained state, texture, draw family or geometry. This is a source and
geometry budget statement, not a measured whole-game no-regression certificate.

## Executed checks

Local evidence lives under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `mangrove-far-stem-cpu-r1.C0SamB`: tidal/mangrove and far-seam regressions,
  strict changed-runtime complexity, TS7 and cached source Doctor all pass.
  Independent ray tests accept all 46 seeded actual crown/stem variants, their
  cap vertices and interior samples; old detached caps and moved ground vertices
  are negative controls. Actual variants required no horizontal cap shift;
  four malformed fallback controls are reported separately. Existing three-seed
  map population, grounding, collision and lifecycle assertions pass unchanged.
- `mangrove-far-stem-build-r1.9YkVv9`: source-frozen public build passes at
  `196753a7a`; dist index SHA-256
  `2a2aa7fb7d3f89166209879ffaf495a756cd90604af4fc320d4d198cf6eb18b2`.
- `mangrove-contact-integration-r1.IdAypI`: the exact four-file change on the
  reed release passes tidal/mangrove, far-seam and river-reed tests, TS7 and the
  public build. Source/tool fingerprints remain stable. Integrated dist index
  SHA-256 `9391de8893b1ebcc5eab6039b8b84892149c745bcae7aa989236773073a56dfb`.

## Native review and limits

`mangrove-far-stem-native-r1.tPiEmx` retains four personally reviewed native
Chrome/Metal images: baseline/candidate at the same 55-degree context and
7-degree scope poses, 1440×900, DPR 1, High, no quality trim. Both sources and
build artifacts remained pinned. The actual distant instance remained in its
normal far pool at 760 m; no substitute geometry or forced LOD was introduced.

Actual candidate cap Y is `3.197902202606201`, versus baseline
`2.859999895095825`, in both captured poses. Instance transforms, crown bytes,
trunk layout and untouched inputs match. Textures settled; no page/GL/shader
errors or context loss were observed. Owned browsers and previews closed.

The images show a subtle local correction without an obvious whole-scene
regression. Other foliage overlaps the small joins at this distance: the
independent geometry test is stronger contact evidence than these pixels.
These are authored diagnostic views, not a normal driving or performance test.
The scene still needs better forest/shoreline composition and plant variety.

Geometry bytes, triangle counts, materials and reachable textures match per
pose. Whole-scene mesh/instance inventories do not: candidate has two fewer
meshes and 433,200 fewer instance-buffer bytes after ordinary preparation.
Those differences are retained, not attributed as savings from this cap change.
No FPS, whole-world memory parity, all-map visual or physical-iPad claim follows.
