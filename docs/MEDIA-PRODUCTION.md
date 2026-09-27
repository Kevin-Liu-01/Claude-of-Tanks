# Media production

The production suite renders the current game through Scene Studio. It produces native 4K battlefield masters, overlapping shoreline review frames, silent H.264 films, clean stills and branded promo cards in landscape, square and portrait formats. Video advances the simulation by a fixed interval for each encoded frame; rendering speed cannot drop frames or speed up a tank.

Use the repository's Node/npm setup with dependencies installed, and make `ffmpeg`, `ffprobe`, and `cwebp` available on `PATH`. The capture browser uses the project's Puppeteer dependency.

```sh
npm run media:capture -- --task=all --formats=landscape,portrait,square --out=shots/production-current
```

This captures all maps in daylight, surveys every liquid shoreline plus coastal extensions across the full 4 km sea apron and wide sea-mouth views, and stages a six-second Reservoir crossing in Day, Sunset and Night. Inspect `review.html`, the full-size images, shoreline contact sheets, and each film's `motion-sheet.jpg`. Capture coverage records which areas were photographed; it does not certify their appearance. Dry and frozen maps have no liquid shoreline survey.

For another production, save Scene Studio JSON, including `timeOfDay` and a storyboard, then use:

```sh
npm run media:capture -- --task=video --scene=shots/my-scene.json --times=sunset --formats=landscape,portrait,square --fps=60 --frames=360 --out=shots/my-film
npm run media:capture -- --task=maps --maps=coastal,fjord --times=day,sunset,night --out=shots/light-study
npm run media:capture -- --task=shore --maps=coastal --out=shots/coast-review
```

Every batch retains its source fingerprint (including uncommitted rendering code), settings, camera/actor recipes, pixel dimensions, renderer, file hashes and video frame-count verification. `--resume=true` reuses only unchanged, complete results from the same sources and settings. A failed or changed capture cannot be published. Keep runtime code unchanged during a capture. The shared capture lock serializes GPU work; the private server and browser are released when the run ends.

After visual inspection, write `review.json` alongside the receipt. Each map needs an explicit decision, specific notes and every reviewed master/shore/video/poster hash from the receipt:

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

Publishing first verifies the entire reviewed batch and builds all derivatives in a temporary directory. It then updates `public/maps/` (3840×2160 heroes, 1280×720 cards and 512×288 picker images) and `public/media/production-r1/`. When included in a release, the production manifest supplies fresh archive images and their Studio recipes. Without it, the earlier curated archive and its recipes remain available. Map pickers, loading screens, the landing map wall, field manual and README share the new map assets. Publishing is local file generation; deployment is separate.

The PNG masters and sampled video review frames stay in ignored `shots/`. After successful encoding and frame-count verification, redundant video PNGs are removed to bound disk usage. Public files are optimized derivatives, MP4 clips, posters and a portable provenance/review manifest. Films are staged and silent; they are not recordings of live match performance.

## September 27, 2026 production

The reviewed batch is retained locally at `shots/production-20260927-approved/review.html`. Its source fingerprint, per-map inspection notes, reviewed hashes, recipes and asset hashes are in the local `public/media/production-r1/manifest.json`. The capture files, generated manifest, refreshed map rasters and social cards are excluded from this code release. The local review page and PNG masters are ignored by Git.

All 31 daylight map overviews were inspected, together with the following complete liquid shoreline survey. The coastal survey includes the full 4 km water apron, transitions across the playable border and wide views of each sea mouth.

| Map | Inspected views | Areas checked |
| --- | ---: | --- |
| Coastal | 109 | Both beaches, bay, border transitions, extensions and sea mouth |
| Autumn | 18 | Riverbanks, pond and crossing approaches |
| Fjord | 216 | Both sea arms, cliff bases, shallows, extensions and two sea mouths |
| Delta | 14 | Riverbanks, endpoints and causeways |
| Monsoon | 20 | River branches, flooded approaches and crossings |
| Skybridge | 9 | Quarry lake and adjacent basin |
| Polders | 14 | Separate ponds and drainage edges |
| Oasis | 6 | Complete sandy lake perimeter |
| Mangrove | 24 | Both branches, junction, endpoints and separated pools |
| Saltwind | 112 | Bay, headlands, extended beaches and sea mouth |
| Reservoir | 11 | Complete lake perimeter, inlets and pump-house shore |
| **Total** | **553** | |

The final sweep found continuous bank contact after fixing exposed coastal substrate, stepped outer banks, map-border seams and distant shadow squares. Coverage is for the authored water seed captured in this batch; it does not certify every seed or arbitrary camera position beyond the finite outer terrain receiver.

Nine six-second, 30 fps films were inspected using seven sampled times per film, along with all 18 clean/branded posters. The native landscape, portrait and square compositions retain the tank and barrel; spreading wakes evolve behind the tracks without the former static rectangular contact ring. Day, Sunset and Night remain distinct, with intentionally dark Night footage. The generated derivatives remain local. The code release uses the existing packaged map images and rendering clips; it can load a production archive when that batch is included in a later release.
