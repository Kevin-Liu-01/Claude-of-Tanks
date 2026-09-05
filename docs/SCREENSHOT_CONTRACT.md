# Screenshot Contract

The critic pipeline sees the game ONLY through `node tools/screenshot.mjs`. The game
MUST uphold this contract at all times or the build is considered broken.

## Required globals (set by the game in `src/main.ts` or an imported module)

- `window.__GAME_READY` — set to `true` only after the full scene is loaded and the
  first frame with final lighting/post-processing has rendered.
- `window.__SHOTS` — object with:
  - `views: string[]` — list of deterministic camera/scenario presets.
  - `set(name: string)` — synchronously (or within ~1s) configure the scene for that
    view: position the camera, spawn/trigger any required state (e.g. an explosion),
    freeze randomness so repeated captures look comparable.

## Required views (minimum set — add more freely, never remove)

| view | what it must show |
|---|---|
| `battlefield` | wide establishing shot of the map: terrain, sky, foliage, several tanks |
| `player_view` | standard WoT third-person chase camera behind the player tank, HUD visible |
| `spectator_view` | allied chase camera with the death-state vehicle switcher visible |
| `sniper_view` | first-person gunner zoom with reticle, penetration indicator, HUD |
| `tank_closeup_modern` | close orbit shot of the M1A2 Abrams model, full detail |
| `tank_closeup_ww2` | close orbit shot of the Tiger I (or T-34-85) model, full detail |
| `tank_closeup_t90m` | close orbit shot of the T-90M model, full detail |
| `tank_closeup_leo2a7` | close orbit shot of the Leopard 2A7 model, full detail |
| `combat_firing` | a tank mid-shot: muzzle flash, smoke, tracer visible |
| `explosion` | a vehicle destruction: fireball, debris, smoke column |
| `garage` | the garage/tank-select screen |
| `battlefield_desert` | wide establishing shot of the desert map (dunes, mesas, adobe village, palms) |
| `battlefield_winter` | wide establishing shot of the winter map (snow, frozen lake, birches, overcast) |
| `battlefield_urban` | wide establishing shot of the town map (street grid, rowhouses, rubble) |

## Rules

- No view may depend on user input or wall-clock time; `set(name)` must fully
  determine what is captured ~1.2s later.
- Zero console errors during load and capture. The harness exits non-zero on any.
- Run `node tools/screenshot.mjs` after every change that could affect rendering;
  shots land in `shots/<view>.png` at 1920x1080.

## Public showcase archive

The public image system is a larger, reproducible layer above the minimum critic
views. `tools/marketing-shots/showcase-r2.json` declares exactly 40 current
captures: ten Garage environments, six interface surfaces, nine live feature
states, three vehicle detail views, and twelve battlefield action frames. It
also assigns current imagery to every public page and focused docs manual.

Visual review is required. The publisher tiles the collection into four ordered
contact sheets, ten captures per sheet, so the whole set can be checked for
camera intersections, weak silhouettes, repetitive staging, UI defects, and
effects that erase vehicle readability before the 4K masters are admitted.

```bash
npm run shots:r2:capture
npm run shots:r2:grade
npm run shots:r2:publish
npm run shots:r2:check
```

`public/media/showcase-r2/manifest.json` must report 40 total passing frames,
the five exact collection counts, four process sheets, all 17 public route
assignments, and `firstPartyRuntimeOnly: true`. Landing, docs, Gallery, Studio,
Garage galleries, and loading screens use the current captures. Raw 4K PNGs
remain local evidence; compressed WebP frames, review sheets, and the manifest
are shipped artifacts.

## Public feature loops

The six short feature loops are deterministic Scene Studio captures based on
approved action-campaign sightlines. Capture masters remain local. The publisher
creates a VP9 WebM, a JPEG poster, and a byte receipt for every loop. GIF
duplicates are prohibited because they reproduce the same frames at several
times the transfer and repository cost.

```bash
npm run studio:features:render
npm run studio:features:publish
node tools/marketing-shots/feature-loops.selftest.mjs
```

`public/media/feature-loops-r1/manifest.json` must report six passed loops and
zero failures. Each loop must include two or more identified vehicles, one of the
approved map families, a six-second duration, and matching file-size receipts.
Public pages use WebM for playback and JPEG posters for static or no-script
presentation.
