# Media r5 toolkit

Scene Studio production tools for the r5 media generation ("Around the Clock"): staged
scenes, moving-camera films, motion-blur stills, the site fifty, the HyperFrames films,
posters and the review kit. Kevin personally directs promotional media; nothing here
deploys, and only `docs-media.mjs` (the Filming manual's media, which he asked for on
2026-10-06) writes into `public/media`.

Scripts live here; everything else they generate goes to `shots/media-r5/` (ignored by git).
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
   Motion (owner 2026-10-05: the lens on a fully 3D track, close and far; tanks fast in every
   direction): `moves.mjs` holds the camera moves (swoop, leadReveal, orbitRise, cable, weave,
   overtake) and route patterns (charge, arc, crossing) for `buildShot`'s `routes` (each tank on
   its own curve at speed), `aim` (a stabilised gun), `frame: 'travel'` (riding a swerving tank
   without swinging with it) and `rail: 'spline'` (the Studio's C1 camera rail).
   `route-check.mjs` clears every route of walls, woods, water and the other hulls;
   `previz.mjs --scenes=<dir>` draws each moving scene as a schematic camera's eye beside the map
   and the lens's distance over the take (MP4 + sheet), so choreography is judged before a GPU lease.
   `motion-search.mjs [--ids=]` stages every site-fifty shot that way: road and open-ground routes
   (stopping short of the foes for duels), escorts in a column or a fan, guns on their own targets,
   lens moves by kind (street moves in town), each candidate held to the selftest's bars and scored
   for close-to-far range, climb, front angles and speed; the winners land in the tracked
   `site50-motion.json`, which `siteScene` merges (`SITE50_MOTION=0` restores the old motion).
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
   set, the map's echo tail and ambience bed) and the hero crew's radio calls in its nation's
   language (firing, the round's result, near misses, an ally's kill), placed with the radio
   discipline and kept inside their cut; `score.mjs` keys each call over the engine's intercom
   chain (recorded key-up, static and release) and ducks the beds under speech, metering every
   call against what plays under it in the receipt; `score/music.mjs --cues=<cues>` turns the cue
   sheet into an Eleven Music composition plan and generates the bed
   (`ELEVENLABS_API_KEY_FILE`, cached with a credit ledger); `score/kit.mjs` generates the
   films' sound-design kit (braams in the sheets' chords, a sub boom, a riser, a reverse swell,
   taiko) as Eleven sound effects, several takes each, the best measured take mastered to
   `shots/media-r5/score-kit/kit.json`; `score/score.mjs --cues=<cues> --music=<music-gen.wav>`
   mixes the bed and the sheet's hits from the kit (each on its downbeat; risers and swells
   peaking on theirs; a stop cuts the music) under the game's recorded SFX and masters it. The
   music bills on the account, not in its response headers: read the account's subscription
   for the true spend.
6. **Kit** — `kit-assemble.mjs` collects films, frames, key art, posters and the site
   fifty into `shots/media-r5/kit/manifest.json`; `kit-page.mjs` renders its `index.html`.
7. **Docs** — `docs-media.mjs [--ids=] [--stages=] [--force]` builds the Filming manual's media
   (`public/media/filming-r1`, the one output here that is tracked): eight featured takes at each stage
   whose source exists (round four's loop, engine review 1, the previz, engine review 2, the 4K final),
   their frames strips and cards, the page's figures, its cover and the manual index's card, with a
   manifest of every source. Re-run it as review-r6 and deliver-r6 land, then list the new stages in
   `src/docs/filming.ts`; `src/docs/filming.selftest.mjs` fails until the two agree.

Review helpers: `peek.mjs`, `film-sheet.mjs`, `finals-sheet.mjs`, `mosaic.mjs`,
`plate.mjs`, `strip.mjs`. UI capture scripts for `studio-ui.mjs` live in `ui/`.

`motion-type.selftest.mjs` holds the large-type floor and the copy rules.
