# Screenshot Contract

The critic pipeline sees the game ONLY through `node tools/screenshot.mjs`. The game
MUST uphold this contract at all times or the build is considered broken.

## Required globals (set by the game in `src/main.js` or an imported module)

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

## Public presentation archive

The public image system is a larger, reproducible layer above the minimum critic
views. `tools/marketing-shots/scenes-presentation-r1/` contains 50 Scene Studio
compositions spanning all sixteen maps, vehicle families, recoil, tracers,
impacts, destruction, debris, wrecks, and track separation. The deterministic
game harness contributes 11 interface/system frames. The publisher compresses
those captures and writes the public provenance manifest:

```bash
node tools/marketing-shots/gen-presentation-r1.mjs
node tools/marketing-shots/shoot.mjs \
  --scenes tools/marketing-shots/scenes-presentation-r1 \
  --out shots/presentation-r1/raw --width 1600
node tools/screenshot.mjs \
  --out shots/presentation-r1/ui-raw \
  --views garage,player_view,sniper_view,tank_closeup_modern,combat_firing,explosion,battlefield_foundry,killcam_xray \
  --width 1920 --height 1080
node tools/marketing-shots/capture-presentation-ui.mjs
node tools/marketing-shots/publish-presentation-r1.mjs
```

`public/media/presentation-r1/manifest.json` must report 50 Studio frames, 11
interface frames, 61 total frames, and `firstPartyRuntimeOnly: true`. Landing,
docs, Gallery, and Studio consume that one manifest through the shared media
archive component. Raw PNGs remain local capture evidence; compressed WebP
frames and the manifest are the shipped artifacts.
