# Crop backface-lighting correction

## Narrow release scope

Preserve the authored upward lighting normals on both sides of crop cards.
Three's standard DoubleSide path previously inverted them on backfaces,
creating near-black fields when viewed from one side. The existing CSM hook
now removes only that inversion; geometry, palette, alpha/mips, placement,
RNG, material family and texture budgets remain unchanged. A dedicated stable
program key prevents shader-cache aliasing. The focused production-source
regression is registered in the normal selftest suite.

This is the lighting-only implementation from `501b09790`, integrated on
`6bba0ee6d`. The newer low pastoral Verdant horizon remains unchanged.
The unaccepted crop-rhythm, grass-height and road-bank experiments are excluded.

## Native visual evidence

Archive root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

`crop-light-native-retry.PWWA7y` preserves six opposite-face/establishing
images from clean baseline `7a26c2690` and lighting candidate `866d9cb19`.
Root and independent review confirmed the black backface band is gone.
The front PNG is byte-identical, SHA256
`27cf5f505ce965afa11441663b93ab465ee41943bfcea0323cddbd33da257559`.
Both use actual Chrome152 / Apple M5 Max Metal,1440×900 High, exact saved
poses, scale1/trim0, with no page or quality-observation errors.

Crop texture colour and separated rows still need art refinement.
A later six-image lighting-plus-rhythm comparison,
`crop-lit-rhythm-native.3eZXXW`, modestly softened the pattern but still
looked like pale pegs. That experiment remains excluded.

## Retained-resource and render-cost checks

`crop-lighting-residency-r1.AbLR9Z`: baseline and lighting-only candidate
each completed three sweeps over Verdant, Coastal and Saltwind (nine samples
per build),1280×720 DPR1, fixed absolute camera manifest, default settle
and forced-GC policy. Both strict gates pass, including comparison and
repeat boundedness. This is within declared measurement tolerances, not
zero-byte heap equality. Raw logs, source/index/tool/camera fingerprints,
commands and terminal statuses are preserved.

`crop-lighting-frame-cost-r1.5liWti`: both complete Coastal runs pass all
authored-quality, acquisition and comparison gates. Same native backend,
1440×900,75 samples ×3 repeats, synchronized GPU diagnostic:
render median3.3→3.2ms, render p95 3.6→3.5ms; submitted interval
median21.1→21.3ms. These are fixed-workload measurements, not live-game FPS.
Every run submits602 draws/2297367 triangles, with identical scene
172 geometries/32 materials/40 textures and renderer allocation counts
733 geometries/219 textures/329 programs. Neither pair was retried.
All three source roots and both build hashes stayed frozen.

The measured lighting-only root was `f82964857`, whose runtime matches
`866d9cb19`; its build index is
`74a188bc372f2d79db9e0fefb63fe35714390b501f89c8cf132736e8103b373d`.
Baseline build index is
`ac5fedfa0039e00480e653b20a4f26163c1b2a8366a8f644f23238372edc030a`.
Both fresh pairs used unchanged acquisition tools at `a5d12a2f9`.

## Validation boundaries

Final integration on `6bba0ee6d` passed cropLighting, environmentSurfaceColor,
propPlacement, mapQuality, native TypeScript7, core-unused and the normal
public build including i18n validation. Raw receipt/logs:
`crop-lighting-main-check.OoXkKg`. The integrated production file and focused
test match the measured candidate byte-for-byte; source stayed unchanged
during the serial FIFO checks. No tank or generated asset was changed.

Focused crop tests, related surface/placement checks, native TypeScript7,
unused guard and normal private builds have passed on the candidate.
Full-file scanning retains two pre-existing `props.ts` complexity failures.
Doctor49/100 flags controlled local-source `new Function` test fixtures;
there is no network/user input at those sites and no suppression was added.
No all-repository scanner pass is claimed.

These checks support the narrow facing correction. They do not certify
all-map art, physical iPad performance, cold-start night lighting or motion.
Original failed setup, rhythm images and road-bank failures remain preserved.
