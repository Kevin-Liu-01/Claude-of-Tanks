# Media production

> **Owner-directed media (2026-09-29):** Kevin withdrew the recent promotional
> image/video rollout and restored the earlier public media. Keep the refreshed
> map photographs. Future promotional production, selection, and publication
> must follow Kevin’s explicit creative direction; an existing recipe or automated
> review does not authorize a new campaign. The tooling below remains available
> for those directed sessions. Historical publication descriptions are not the
> current public-media selection.


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
npm run media:capture -- --task=maps --maps=alpine,fjord,desert --times=dawn,golden,dusk --sun=back --out=shots/backlit-study
npm run media:capture -- --task=shore --maps=coastal --out=shots/coast-review
```

`--times` accepts every Scene Studio time: `dawn`, `morning`, `day`, `golden`, `sunset`, `dusk` (blue hour) and
`night` ([Studio light](STUDIO.md#light-times-of-day-and-sun-direction)); Mars and the Moon render their authored day
for every time. For the map overviews, `--sun=back|rim|side|front` turns each map's sun against its own overview camera
(`back` = the camera looks into the sun: backlit relief and rim-lit edges; `rim` = 32° off that axis, keeping the
disc out of frame; `side` = across the frame; `front` = behind the camera) and adds the mode to the file names;
`map` (the default) keeps the authored bearing. A film or a `--scene` carries its own `light` block instead.
`--port` serves the capture on another port (default 5378).

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

## Cinema masters

`tools/media-production/cinema.mjs` renders a Scene Studio scene through the film renderer
([STUDIO.md → Film renderer](STUDIO.md#film-renderer)): every output frame integrates shutter
samples in linear HDR (real motion blur on tanks, wheels and tracks, tracers, debris and camera
moves), jittered sub-pixel samples replace TAA, speed ramps from the scene's `film.speed` keys
slow the action, and storyboard cuts never fall inside a shutter. It writes the lossless PNG
sequence, a ProRes 422 HQ master (`prores_ks -profile:v 3`, 10-bit 4:2:2, BT.709 tags) and an
H.264 High proxy (CRF 14, 4:2:0, fast start), a one-frame-per-second motion sheet, and optional
supersampled stills.

```sh
# 4K trailer master of a scene's whole storyboard, landscape plus native portrait/square
npm run media:cinema -- --scene=shots/my-scene.json --resolution=2160 --fps=24 \
  --samples=16 --max-samples=64 --shutter=180 --formats=landscape,portrait,square --out=shots/cinema-my-scene
# a slow-motion beat (speed keys in the scene's film block), 1080p preview proxy only
npm run media:cinema -- --scene=shots/my-scene.json --start-ms=8000 --end-ms=12000 --master=none --out=shots/cinema-preview
# supersampled key art at two instants, no film
npm run media:cinema -- --scene=shots/my-scene.json --resolution=2160 --film=false --stills=4200,9700 \
  --still-samples=32 --supersample=1.5 --out=shots/cinema-stills
```

Options: `--formats` (default: the scene's production format; other formats use the Studio's
reviewed reframing), `--resolution` 1080/1440/2160 (short side), `--fps` 24/30/60,
`--samples` 1–64 per frame (1 = no motion blur), `--max-samples` adaptive ceiling (≤ 128),
`--shutter` 0–360°, `--filter` gaussian/box, `--shake` 0–2 (camera-cue scale),
`--start-ms`/`--end-ms` (timeline range),
`--frames` (limit, for benchmarks), `--stills` (timeline ms list), `--still-samples`,
`--still-exposure-ms` 0–1000 (motion-blur stills integrated around each instant) with
`--still-max-samples` (adaptive ceiling, ≤ 128),
`--supersample` 1–2 (stills), `--film=false` (stills only), `--master=prores|none`,
`--proxy=true|false`, `--keep-frames=true` (keep every PNG; by default only the sheet frames
remain after the encodes verify), `--resume=true`, `--port`, `--cache-dir`. Settings default
to the scene's `film` block, then 30 fps, 180°, 8 samples (adaptive to 64), gaussian.
`--jobs=jobs.json` renders an array of jobs (the same keys without `--`, each with its own `out`)
in one browser session under one capture lock, for example
`[{"scene": "shots/kill.json", "resolution": 2160, "fps": 24, "samples": 12, "max-samples": 64,
"shake": 0.5, "out": "shots/cinema-kill"}]`.

Frames stream from the page to the private dev server as PNG blobs (encoded off the page's main
thread), so a 4K frame never crosses the DevTools protocol as base64. The receipt
(`cinema-receipt.json`) records the source digest and revision, the GPU, every film's framed
scene, per-frame timeline/shutter instants, sample counts, image motion and render time,
per-frame PNG digests plus a sequence digest, the ffprobe results (frame count, size, codec,
colour tags) and SHA-256 of every master, proxy, still and review frame. `--resume=true` reuses
complete films and stills only when the sources and settings are unchanged; a partial film
renders again from its first frame (frames depend on the whole shutter history, so a film is
never stitched from two runs). The shared capture lock serializes GPU work. A batch too long for
one lease runs as several: `--lease-min=<minutes>` ends the lease before a film that would carry
it past the budget (the estimate is the longest take so far, a film with the stills after it) and
exits 75, and a `--resume=true` re-run renders the rest; `--ticket-stamp=<ms>` joins the capture
queue at that place, so every lease of the batch rejoins at its first ticket's place, behind the
holds it yielded to (`tools/media-r5/site50-finals.mjs --keep-place --yield-holds=2`: after each
lease two other holds take and release the lock first, the coordinator's share for the finals of
2026-10-07). The synchronous encodes renew the lock before each step. A browser call that times out
(10 minutes) ends the batch with its error recorded, because the browser is wedged; the finals runner
sets that job aside, renders the rest, and retries it at the end alone in a fresh browser. cinema
owns SIGTERM once its dev server is up (Vite's own handler would exit 143 before the lock is
released), so a stopped batch always ends its lease.

Throughput, measured 2026-10-01 on the lane machine (Apple silicon GPU through headless Chrome and
ANGLE/Metal) with the two-tank desert duel (fast rail moves, firing, a kill), in seconds per output
frame. *Draw* is the time inside `renderFilmFrame` (the GPU finishes inside the readback); *wall*
is the honest planning figure and adds the browser's PNG encode, the transfer and the digests.

| Output | Samples per frame | Draw s/frame | Wall s/frame |
| --- | --- | ---: | ---: |
| 1920×1080 | 1 (no blur) | 0.011 | 0.31 |
| 1920×1080 | 8 | 0.059 | 0.48 |
| 1920×1080 | 16 | 0.142 | 0.60 |
| 1920×1080 | 8, adaptive to 64 (mean 29.6) | 0.308 | 0.89 |
| 1920×1080 | 16, adaptive to 64, 0.2× ramp (mean 20.7) | 0.162 | 0.66 |
| 3840×2160 | 1 | 0.018 | 1.29 |
| 3840×2160 | 8 | 0.067 | 1.44 |
| 3840×2160 | 16 | 0.156 | 1.59 |

At 2160p the browser's PNG encoder (about 1.2 s a frame) dominates, so extra samples cost little:
a 10 s, 24 fps 4K shot at 16 samples takes about 6–7 minutes before the encodes.

Recommended trailer masters: `--resolution=2160 --fps=24 --shutter=180 --samples=12
--max-samples=64 --filter=gaussian --master=prores --proxy=true`. Kill shots and heavy
camera-shake cues usually read better with `--shake=0.5` (or `film.shake` in the scene): motion
blur turns a preview-sized jolt into a long smear. Slow motion comes from `film.speed` keys in the
scene (for example 0.2× from 400 ms before a kill to 1 s after), rendered at 16 samples. Key art:
`--film=false --stills=<ms,...> --still-samples=32 --supersample=1.5`; a panning key frame with a
sharp tracked tank and a streaked world adds `--still-exposure-ms=33` (1/30 s; 125 for 1/8 s)
`--still-max-samples=128`. `--shake` (0–2) scales the
storyboard's camera cues for the film only.

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

## October 8, 2026 framing for the site fifty

Blind critics judge the 4K finals and the engine reviews on the gauntlet's terms: two model-distinct critics, and the
lower critic's score counts. Since the reference library came back, every wave also carries blind pairs against real
photographs of each hero's type. The packet builders and the hash-chained ledger live in `shots/media-r5/gauntlet/`
(local, not committed).

- **Wave m1 (the first four finals).** It scored 4.33. The tanks read as toys, the smear read as a filter, and the
  framing left each tank small, cut or behind something.
- **Wave m2 (the same takes re-rendered).** With realistic hero paint, a 90° shutter and 2 ms stills chosen by framing,
  it scored 4.55; clarity rose most. The blind pairs identified the real photograph 16 times in 16, from the vehicles'
  surfacing and the sprite effects.
- **Composition wave c1 (all fifty takes).** On engine review 3, at 3 frames each, it scored 3.78.
  `gauntlet/calibrate-composition.mjs` holds the lens record against the critics' flags:
  - the score falls with the lens's look-down (rank correlation −0.63), its height (−0.57) and its distance (−0.46);
  - a look-down of 18° or more is marked a bad angle 91 % of the time;
  - the frames marked GOOD hold the lens about 2 m up and level, 11–18 m out, with the hull 40–55 % of the frame's
    height, centred and whole.

`lens-check.mjs` now records, for each sample:
- the lens's pitch and height;
- the hull's screen box;
- the largest thing in the foreground, both over the whole frame and in the zone under the hull.

`motion-search.mjs` scores each candidate on the share of the take in that sweet spot, minus the share the critics
mark. Range comes from distance at a low height and from dolly zooms, not from climbing. A candidate whose lens passes
inside any record is rejected outright; `site50.selftest.mjs` holds the same rule for every take.

`tools/media-r5/site50.mjs` reflects a placed burst that would land between the lens and a routed hull to the far side of
the hull, moving its debris with it.

On the record, the re-plan raised the sweet-spot share from 0.16 to 0.71 and cut the bad share from 0.68 to 0.14. The
plan it replaced is kept at `shots/media-r5/tmp/site50-motion-r7.json`.

The shared GPU follows the coordinator's scheme. Priority tickets queue FIFO in their own band. The media lane takes its
fairness slot, 1791397979999, once two other holds have run since its last lease:
- the finals runner: `--keep-place=1791397979999 --yield-holds=2`;
- the lab: `--ticket-stamp=1791397979999 --yield-holds=2`, plus `--yield-first` when another media lease has just ended.
