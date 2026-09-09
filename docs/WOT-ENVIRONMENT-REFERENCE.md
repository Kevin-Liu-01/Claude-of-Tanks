# Reference-driven environment direction — 2026-09-08

Status: research and one Verdant prototype, **not visual acceptance or a release**.
The expanded [whole-map audit and 30-map rollout plan](MAP-BEAUTIFICATION.md)
covers foreground, terrain, structures, vegetation, water, sky and atmosphere.
R13's pointed hills were rejected; R14 still has narrow summit failures and
obvious hedge ribbons. Neither is the art target. The ten additional maps and
night-lighting work already on main are separate from these unfinished horizons.

## Verified primary references

- [Wargaming: Core engine overview](https://worldoftanks.eu/en/news/general-news/update-1-0-graphics-engine-technologies/): substantial visual outland, ecological variation, independently composed map environments.
- [Wargaming: graphics optimization](https://worldoftanks.eu/en/news/general-news/10-graphics-optimisation/): distant billboards preserve baked depth/lighting; expensive terrain blending is precomputed in virtual textures. These are documented 1.0-era techniques, not a claim about today's exact renderer.
- [GDC 2018: Branislau Svihla, Next Level Render](https://www.gdcvault.com/play/1025207/Next-Level-Render-in-World): verified talk abstract describes scalable terrain, water, vegetation and lighting. Full presentation not reviewed; do not invent its heightfield algorithm or LOD distances.
- [Official Prokhorovka map reference](https://worldoftanks.eu/en/content/guide/map-guides/map-guide-prokhorovka/): personally viewed official `prokhorovka_poi_8.jpg`. Wide open cultivated ground, low asymmetrical wooded uplands, vegetation in meaningful groups, subdued distant contrast.
- [Official Mountain Pass reference](https://worldoftanks.eu/en/news/updates/1-24-1-CT1/): personally viewed official `mountain-pass-2-2.jpg`. Connected drainage valley, exposed crags, sheltered conifers, rock-to-gravel transitions, restrained haze.
- [Official desert reference](https://worldoftanks.eu/en/news/general-news/1-18-1-CT-1/): personally viewed official `desert_3_new.jpg`. Bare dune faces, eroded rocky channel, localized water/vegetation and clustered architecture.
- [Official Himmelsdorf reference](https://worldoftanks.eu/en/content/guide/map-guides/map-guide-himmelsdorf/): personally viewed official `himmelsdorf_screenshots_one.jpg`. A dominant castle, connected terraces/routes, restrained stone materials and wooded slopes organize the scene.
- [Wargaming: Oyster Bay development](https://worldoftanks.asia/en/news/general-news/BTS-Oyster-Bay-Map/): the team describes photogrammetry-based landscape models and rebuilding the island around coherent military/port infrastructure while retaining its main gameplay idea. Article text reviewed, not its complete image gallery.

Visual observations above are our analysis of the images, not statements by
Wargaming. No reference image/geometry/texture is imported into the game.

## Apply the look, not the entire engine

1. Author the large forms first: linked asymmetric watersheds, tributary spurs,
   low passes and open sectors. Noise is subordinate, not the composition.
2. Treat mesh rows as sampling only. Independent angular ridges make a ring-shaped
   landscape even when their individual silhouettes contain more randomness.
3. Distinguish woodland from meadow/rock at landscape scale. Tree groups should
   occupy slopes and sheltered ground, with irregular boundaries and open areas;
   they must not form evenly spaced contour hedges or dot-textured bald slopes.
4. Use neutral distance haze, coherent sun/shade and restrained saturation.
   Baked detail must fade with distance; it must not multiply dark marks over fog.
5. Keep different identities: agricultural lowlands, exposed coast, alpine
   catchments, eroded mesa country, wetland flats and industrial/urban skylines.
6. Preserve playable terrain/collision, existing resource ownership and bounded
   rendering. Reuse buffers and bake channels; no wholesale virtual-texturing
   engine, additional real-time lights or fragment noise loops.

## First prototype and acceptance

Verdant alone samples an authored two-dimensional watershed field into the
existing horizon vertices. It leaves the two rim skirts, XZ, topology and all
other maps unchanged. This still performs an extra construction pass: it is not
yet a proven loading optimization. No per-frame work or new GPU resource.

Next: inspect the same wide, ground-level and magnified viewpoints; replace
uniform forest bands with terrain-supported stand composition; then obtain
paired resource/construction/frame measurements. Do not propagate or push
rejected art to main, weaken failed guards, or call screenshot timings a
performance comparison. A good horizon alone does not finish the ground,
vegetation, settlement and sky quality gap across all maps.
