# Media production

The production suite renders the current game through Scene Studio. It produces native 4K battlefield masters, overlapping shoreline review frames, map-boundary review frames, silent H.264 films, clean stills and branded promo cards in landscape, square and portrait formats. Video advances the simulation by a fixed interval for each encoded frame; rendering speed cannot drop frames or speed up a tank.

Use the repository's Node/npm setup with dependencies installed, and make `ffmpeg`, `ffprobe`, and `cwebp` available on `PATH`. The capture browser uses the project's Puppeteer dependency.

```sh
npm run media:capture -- --task=all --formats=landscape,portrait,square --out=shots/production-current
```

This captures all maps in daylight, surveys every liquid shoreline plus coastal extensions across the full 4 km sea apron and wide sea-mouth views, and stages a six-second Reservoir crossing in Day, Sunset and Night. Every map also gets 18 boundary frames: driving and raised views at eight edges/corners, plus two wide overviews. Inspect `review.html`, the full-size images, shoreline and landscape contact sheets, and each film's `motion-sheet.jpg`. Capture coverage records which areas were photographed; it does not certify their appearance. Dry and frozen maps have no liquid shoreline survey.

For another production, save Scene Studio JSON, including `timeOfDay` and a storyboard, then use:

```sh
npm run media:capture -- --task=video --scene=shots/my-scene.json --times=sunset --formats=landscape,portrait,square --fps=60 --frames=360 --out=shots/my-film
npm run media:capture -- --task=maps --maps=coastal,fjord --times=day,sunset,night --out=shots/light-study
npm run media:capture -- --task=shore --maps=coastal --out=shots/coast-review
```

Every batch retains its source fingerprint (including uncommitted rendering code), settings, camera/actor recipes, pixel dimensions, renderer, file hashes and video frame-count verification. `--resume=true` reuses only unchanged, complete results from the same sources and settings. A failed or changed capture cannot be published. Keep runtime code unchanged during a capture. The shared capture lock serializes GPU work; the private server and browser are released when the run ends. Studio settles cloud history at the requested capture viewport without advancing actors or FX, so a still or first encoded frame does not inherit the previous camera's cloud history.

After visual inspection, write `review.json` alongside the receipt. Each map needs an explicit decision, specific notes and every reviewed master/boundary/shore/video/poster hash from the receipt:

```json
{
  "sourceDigest": "copy from receipt",
  "reviewedAt": "ISO timestamp",
  "notes": "Scope and any limits of the inspection",
  "maps": {
    "coastal": { "accepted": true, "notes": "Inspected all shoreline views, mouth and overview.", "hashes": ["reviewed SHA-256 values"] }
  }
}
```

```sh
npm run media:publish -- --receipt=shots/production-current/all-receipt.json --review=shots/production-current/review.json
npm run og:images -- --only=docs-worlds,docs-rendering
```

Publishing first verifies the entire reviewed batch and builds all derivatives in a temporary directory. It then updates `public/maps/` (3840×2160 heroes, 1280×720 cards and 512×288 picker images) and `public/media/production-r1/`. When included in a release, the production manifest supplies fresh archive images and their Studio recipes. Without it, the earlier curated archive and its recipes remain available. Map pickers, loading screens, the landing map wall, field manual and README share the new map assets. The landing page selects a thumbnail, card or full master for its viewport instead of downloading ten 4K images on a phone. Fresh battlefield overviews replace earlier overviews of the same maps in the archive; staged action images remain available.

Map-only or subset publications preserve existing films, posters, untouched maps and their Studio recipes. The manifest records their original source revision, review and asset hashes under `retainedBatches`, and validates those files before replacing any output. A new photo batch does not re-certify older footage. Publishing is local file generation; deployment is separate.

The PNG masters and sampled video review frames stay in the ignored output directory (`shots/` or `.qa-dev/`). After successful encoding and frame-count verification, redundant video PNGs are removed to bound disk usage. Public files are optimized derivatives, MP4 clips, posters and a portable provenance/review manifest. Films are staged and silent; they are not recordings of live match performance.

## September 27, 2026 production

The final shoreline/landscape batch is retained locally at `.qa-dev/shoreline-r2/release-review-4/review.html`, with matching-camera comparisons at `.qa-dev/shoreline-r2/comparison/index.html`. Its source fingerprint, per-map inspection notes, reviewed hashes, recipes and asset hashes are in `review.json` beside the batch and the local `public/media/production-r1/manifest.json`. The capture files, generated media manifest, refreshed map photos and social cards were initially excluded from the code release, then committed separately in `8dfa4448d` at the owner’s request. Functional minimaps and dedicated collision manifests for changed maps are included. The local review pages and PNG masters are ignored by Git.

All 31 daylight map overviews and all 558 boundary frames were inspected, together with the following complete liquid shoreline survey. The coastal survey includes the full 4 km water apron, transitions across the playable border and wide views of each sea mouth.

| Map | Inspected views | Areas checked |
| --- | ---: | --- |
| Coastal | 110 | Three unequal coves, headlands, border transitions, extensions and sea mouth |
| Autumn | 18 | Riverbanks, pond and crossing approaches |
| Fjord | 213 | Both sea arms, cliff bases, shallows, extensions and two sea mouths |
| Delta | 14 | Riverbanks, endpoints and causeways |
| Monsoon | 20 | River branches, flooded approaches and crossings |
| Skybridge | 9 | Quarry lake and adjacent basin |
| Polders | 14 | Separate ponds and drainage edges |
| Oasis | 6 | Complete sandy lake perimeter |
| Mangrove | 24 | Both branches, junction, endpoints and separated pools |
| Saltwind | 107 | Bay, headlands, extended beaches and sea mouth |
| Reservoir | 11 | Complete lake perimeter, inlets and pump-house shore |
| **Total** | **546** | |

The final sweep found continuous bank contact after restoring Coastal's original unequal coves and fixing exposed coastal substrate, stepped outer banks, map-border seams and distant shadow squares. The near, middle and distant terrain share the world's terrain material and lighting; terrain folds and supported props continue across the boundary. Red Rock Divide now carries unequal canyon terraces, side washes and graded mouths into the outer landscape. Coverage is for the authored water seed captured in this batch; it does not certify every seed or arbitrary camera position beyond the finite outer terrain receiver.

Three six-second, 30 fps landscape films were inspected using seven sampled times per film, along with all 18 clean/branded landscape, portrait and square posters. The compositions retain the tank and barrel; spreading wakes evolve behind the tracks without the former static rectangular contact ring. Day, Sunset and Night remain distinct, with intentionally dark Night footage. The generated derivatives were subsequently included in `8dfa4448d`; original masters and review frames remain local.

The complete test suite, TypeScript check and production build pass. Historical terrain and road snapshots retain their original inputs through a hash-verified baseline fixture; current physical continuity and collision checks remain separate. A controlled 60-second Red Rock mobile-preset comparison had a 16.9 ms median frame time before and after, with p95 changing from 23.0 to 23.1 ms. Both runs missed the harness's median-60/p5-45 FPS budgets. The more constrained mobile soak also misses five timing budgets on both revisions, and its different map selections prevent a causal performance comparison. These desktop emulation checks are not physical-phone certification. React Doctor remains at 44/100 with existing repository debt; its two additional findings are dynamic-function checks in local selftests, with no new runtime findings.

## September 29, 2026 map photography refresh

All 31 maps were freshly captured at native 3840×2160 using the current renderer, with one reviewed daylight overview per map (Mars retains its galaxy sky). Saltwind’s production camera now looks toward the harbor and bay from the inland ridge. The capture receipt and full masters are local at `.qa-dev/maps-refresh-r3/final/`; the public manifest records the source fingerprint, recipes and reviewed hashes. Every composition was inspected in three-image contact strips, with additional master inspection for Coastal, Red Rock Divide and Saltwind. This is a photo review of those camera views, not a repeat of the earlier exhaustive shoreline survey.

The 93 generated map images supply the map pickers, Scene Studio, battle loading screens, website map wall, media archive, field manual and README. The rendering and worlds social cards were regenerated from the new photos. The three catalogued films and their posters retain their earlier provenance; they were not re-recorded for this still-image refresh.
