# Media r5 toolkit

Scene Studio production tools for the r5 media generation ("Around the Clock"): staged
scenes, moving-camera films, motion-blur stills, the site fifty, the HyperFrames films,
posters and the review kit. Kevin personally directs promotional media; nothing here
publishes to `public/media` or deploys.

Scripts live here; everything they generate goes to `shots/media-r5/` (ignored by git).
Run from the repo root.

## Pipeline

1. **Scenes** — `sets.mjs` stages the newest main battle tanks (`cast.mjs`) on the maps;
   `setups.mjs` is the DSL (hero-frame cameras, cruising tanks, hero-relative effects).
   Builders write scene JSON:
   - `campaign.mjs stills|films <out>` — key-art stills and the trailer's film shots
   - `blur50.mjs <out>` — the fifty frames (timed moments with an exposure)
   - `reveal.mjs <out>` — the lineup orbits
   - `site50.mjs <out>` — the site fifty: one continuous 6.6 s take per shot plus a still
   Set `MEDIA_R5_LIGHT=1` so times of day and sun placement use the Studio light lane.
2. **Lab** — `lab.mjs --scenes=<dir> --out=<dir> --film-frames=5` previews scenes under
   the shared GPU lock (`--lease=budget --lease-min=14`), with autoPlace, sightline and
   path-obstacle notes; `--scout=<maps>` and `--features=<maps>` survey new battlefields;
   `--resolve-only=1` writes the resolved scenes the final renders use.
3. **Finals** — `cinema-jobs.mjs films|blur|stills <resolved> <out> <jobs.json>` builds
   job lists for `tools/media-production/cinema.mjs --jobs=<jobs.json>` (pass a private
   `--cache-dir`). `site-loops.mjs <renders>` turns site-fifty renders into seamless loops
   (WebM, MP4, phone MP4), posters and stills in the site's formats.
4. **Motion** — `motion/` generates the HyperFrames films: `edl-gen.mjs` (trailer),
   `cuts-gen.mjs c30|v15`, `lineup-gen.mjs`, `studio-feature-gen.mjs`, then `build.mjs
   <project>` and `render.mjs`. `sync-footage.mjs` copies film proxies into the projects;
   `posters-build.mjs` lays out the posters. Large type only (`motion/design.md`).
5. **Sound** (nothing synthesized, owner 2026-10-05) — `score/sfx-cues.mjs` derives a film's
   effect cues from its EDL with the game's own resolvers (gun class, engine family, track
   set, the map's echo tail and ambience bed); `score/music.mjs --cues=<cues>` turns the cue
   sheet into an Eleven Music composition plan and generates the bed
   (`ELEVENLABS_API_KEY_FILE`, cached with a credit ledger); `score/score.mjs --cues=<cues>
   --music=<music-gen.wav>` mixes it under the game's recorded SFX and masters it.
6. **Kit** — `kit-assemble.mjs` collects films, frames, key art, posters and the site
   fifty into `shots/media-r5/kit/manifest.json`; `kit-page.mjs` renders its `index.html`.

Review helpers: `peek.mjs`, `film-sheet.mjs`, `finals-sheet.mjs`, `mosaic.mjs`,
`plate.mjs`, `strip.mjs`. UI capture scripts for `studio-ui.mjs` live in `ui/`.

`motion-type.selftest.mjs` holds the large-type floor and the copy rules.
