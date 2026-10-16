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
   **A take's own sound** (owner 2026-10-09, "make sure our videos have audio"): `take-audio.mjs
   <deliverDir> [ids]` scores each delivered site-fifty take from its scene, with no music:
   - `sfx-cues.mjs --take` derives the cues. Every sound pans against the lens's right at its instant, every
     moving hull (the hero, then the three nearest the lens) runs its own family's engine at its family's pitch
     over its track set, and burning wrecks and fire fields play the game's fire loops. Each key gives distance
     and pan every 100 ms.
   - `score.mjs --music=none` mixes it. The take's sheet sets `gameLaw`, so each recording is levelled exactly as
     the game levels it: the cue's own gain and distance law (`soundCues.ts`, `audioMath.ts`) on its bus's level
     (`mixPolicy.ts`), with the game's speech duck. The films' one compressed law let three hulls' engines rival
     the guns and a distant blast outweigh a close cannon.
   - The 6.6 s mix is mastered to -16 LUFS, looped exactly as `site-loops.mjs` loops the picture (the last
     0.6 s into the head, at equal power), and muxed into every delivered video with the picture copied bit for
     bit: AAC 256/160 kbit/s in the MP4s and Opus in the WebM. `<id>-audio.wav` and `<id>.audio.json` (cues,
     master, every file's hashes) ship beside them.
   - `site50-encoder.mjs --audio` runs it after each delivery. Decoded recordings are cached in
     `shots/media-r5/score-cache`.
   - Checks: `shots/media-r5/tmp/av-offset.mjs` (sync within a frame) and `stem-split.zsh` /
     `cue-contribution.zsh` (which layer carries a mix).
6. **Kit** — `kit-assemble.mjs` collects films, frames, key art, posters and the site
   fifty into `shots/media-r5/kit/manifest.json`; `kit-page.mjs` renders its `index.html`.
7. **Docs** — `docs-media.mjs [--ids=] [--stages=] [--force]` builds the Filming manual's media
   (`public/media/filming-r1`, the one output here that is tracked): eight featured takes at each stage
   whose source exists (round four's loop, engine review 1, the previz, engine review 2, the 4K final),
   their frames strips and cards, the page's figures, its cover and the manual index's card, with a
   manifest of every source. Re-run it as review-r6 and deliver-r6 land, then list the new stages in
   `src/docs/filming.ts`; `src/docs/filming.selftest.mjs` fails until the two agree.

**Finals encodes** (`site50-encoder.mjs`, launch night): several encoders can share a round. Each claims a take, or a
take's master, through `<renders>/films/<id>/.encoding` (atomic; a dead pid's claim is taken over), and `--nice`
sets their children's priority. `site-loops.mjs` builds every format's seamless loop as a stream: the tail comes from
a second seeked read of the master, so an encode holds about 18 frames of 4K, not the whole take. The single read
held 6.5–7.6 GB an encode and helped fill the machine's swap on 2026-10-10.

**Master filter** (`master-filter.mjs`, optional): when `COT_MASTER_FILTER` names an executable (or
`shots/media-r5/master-filter` exists), `site-loops.mjs` and `site-media.mjs` pass each still and film master
through it once (`<filter> still <in.png> <out.png> <id>`, `<filter> film <in> <out.mov> <id>`) and encode the
deliveries from its output. Unset, the masters are used as rendered and the deliveries are unchanged; a filter that
fails stops the run. The picture publishers use the same filter: `bake-minimap-assets.mjs`,
`field-guide-capture.mjs` and `marketing-shots/generate-og-images.mjs` hand their own encode to
`filterPublishedImage` (kept as is unless the filter changes the picture), and `media-production/publish.mjs` and the
`marketing-shots/publish-*` gallery publishers filter each source picture before cwebp. `master-filter.selftest.mjs`
holds the contract.

Review helpers: `peek.mjs`, `film-sheet.mjs`, `finals-sheet.mjs`, `mosaic.mjs`,
`plate.mjs`, `strip.mjs`. UI capture scripts for `studio-ui.mjs` live in `ui/`.

`motion-type.selftest.mjs` holds the large-type floor and the copy rules.

## Re-making the site's media

Every take, frame and film on the site can be made again from this folder (owner 2026-10-12: "keep our code for these
videos and setup preserved so we can always tweak them"). The renders and the footage stay in `shots/media-r5/`,
outside git; what makes them is here.

- **The takes.** `site50-shots/<id>.json` is each site-fifty take's exact Studio scene, the resolved one its 4K final
  rendered from: placement, paint, turret keys, lens path, effects, picture and film, one key per line, so git history
  is the take's history. `site50-shots/library.json` keeps each take's scene versions (sha256, date, note) and its
  render rounds (which version, which renderer commit, where the render is kept). `site50-shots.mjs` records them:
  `snapshot <version>` after a resolve, `changed` for the takes a round must render, `rendered <round> <ids>` after
  it. A take's source is `site50.mjs`, with `sets.mjs`, `setups.mjs`, `cast.mjs`, `moves.mjs` and
  `site50-motion.json`.
- **The fifty frames.** `blur50-shots/<id>.json` holds each frame's resolved scene the same way, the one its 2160p
  still rendered from. `blur50.mjs` is their source.
- **The films.** `films/<film>/` keeps the eight HyperFrames projects (the trailer, lineup, cut-30, vertical-15, the
  Studio feature and the three poster sets) as they were last rendered: the edit (`edl.json`), the compositions, the
  cue sheets, the scenes each cut was scored against and the music plan. The generated music bed is
  `music/music-gen.wv`: the bed is 32-bit float, which FLAC cannot hold exactly, so it is kept as WavPack, which
  decodes to the same bytes. To work on a film:
  1. `node tools/media-r5/films/restore.mjs [film ...]` recreates `shots/media-r5/motion/<film>/`: the sources, the
     bed decoded to `music/music-gen.wav`, the brand marks, fonts and grain in `assets/` (`--dry` shows the plan; a
     file you changed there is kept unless `--force`).
  2. `node tools/media-r5/motion/sync-footage.mjs --renders=renders,renders-r13,renders-r14` links the footage.
  3. `zsh tools/media-r5/motion/recut.zsh <film> <tag>` re-cuts the score over the bed and renders (`RENDERS=` names
     the render rounds), or `zsh tools/media-r5/motion/rerender.zsh <film>` renders it as it is, after a titles or
     edit change. Both keep the previous render as `renders/<film>-<MMDD-HHMM>.mp4`, sync the stat cards to
     `src/productStats.ts` (`motion/film-stats-sync.mjs`) and render under the capture lock (`with-capture-lock.mjs`).
     The posters: `node tools/media-r5/motion/posters-build.mjs tools/media-r5/motion/posters-v2.json` lays them out
     with their art from the takes' stills, then `node tools/media-r5/motion/render.mjs posters-land
     --snap=0.5,1.5,…` renders them (poster i is the frame at i + 0.5 s).
  4. Copy the changed sources back into `films/<film>/` and commit them (a new bed: `ffmpeg -i music/music-gen.wav
     -c:a wavpack -compression_level 3 music/music-gen.wv`).
  The Studio feature has no bed: its mix came before the score tools.
- **The score.** `score/` makes the sound: `sfx-cues.mjs` the cues, `score.mjs` the mix, `music.mjs` the Eleven
  Music bed, `kit.mjs` the sound-design kit. The crews' radio calls share one ledger per round, `VOICE_LEDGER=<file>`
  (round 14's is `shots/media-r5/site50/voice-ledger-r14.json`): each slot speaks its least-used line and take, and no
  line takes more than its share. Set it for `take-audio.mjs` and for a film's re-cut alike.
- **The render chain.** `site50.mjs shots/media-r5/site50/scenes` writes the source scenes; `lab.mjs --scenes=<dir>
  --out=<dir> --resolve-only=1` resolves them on the GPU; `carry-look.mjs <sources> <resolved> <out>` carries a
  paint, film or picture change onto resolved scenes without a new resolve; `site50-finals.mjs <resolved>
  --tag=<round> --skip-loops` renders the 4K films and stills through `tools/media-production/cinema.mjs`;
  `site50-encoder.mjs <renders> <deliver> --audio` makes every site format and gives each take its sound
  (`take-audio.mjs`).
- **The site swap.** `site-media/picks.json` picks the takes and what each page, the game and the social cards show.
  On an export of main, `site-media.mjs --root=<tree>` builds `public/media/<collection>` from the deliveries,
  `site-media-wire.mjs --root=<tree>` points the pages, the game and the docs at it, `site-media/docs-copy.py` moves
  the repository docs, and `site-media/retire.mjs` and `site-media/prune-keys.mjs` remove the media and the catalog
  keys the swap orphaned.
- **The Studio.** The Studio's Director lists every take as a preset, ready to load, change and film again:
  `site-media.mjs` writes each take's scene and `scenes/index.json`, and the Director's list in
  `src/ui/studioProductionPanel.ts` is a separate change in flight (until it lands, `site-media-wire.mjs` stops at
  its "Studio takes index" block).
