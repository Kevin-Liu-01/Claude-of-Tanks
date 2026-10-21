# Round 6 versus scenes: the brief for every scene author

In the repository, `versus.mjs`, `versus6.mjs`, `spots.mjs` and this folder of scene modules live in
`tools/media-r5/versus/`. The paths below are the round's workspace as the authors had it: `remake/` is the
git-ignored `shots/media-r5/remake/`, and `tmp/remake/` was an export of the repository. From the repository root
the check is `node tools/media-r5/versus/versus6.mjs check <id>`.

## What the owner asked

The owner wrote this on 2026-10-15 at 17:45, after seeing the round-4 versus stills:

> "i like your other versus too, just make them unique scenes instead of plaigarizing. currently love the sepv3 and
> challenger and merkava and k2 the most, but experiment all with new scenes. great job! these will be our opengraph
> foundations and for marketing"

**What "plagiarizing" means.** Every round-4 still uses the same layout, `versus()` in `remake/versus.mjs`:
- the left tank front-left, driving in toward the middle;
- the right tank behind on the right, holding and firing its coax;
- a burst between them;
- columns and fire behind.

That layout is itself a copy of the owner's f6 Steinburg picture. Each of the ten matchups now gets its own
composition. You are assigned one composition idea per scene: build that, adapting to the map. Never fall back to the
old layout.

**The favourites.** The owner loves vs01 (M1A2 SEPv3 v T-90M), vs02 (Challenger 3 v T-80U), vs05 (Merkava Mk 4 v T-72B3)
and vs03 (K2 v ZTZ-99) "the most". For those four, keep the light, the energy and the large, well-lit tanks; the
composition is still new.

**Where the stills go.** They become the site's social cards (1200x630, the 1.91:1 centre crop of the 16:9 still) and
its marketing. A still must read at thumbnail size, about 600x315 in a feed.

## Standing rules (owner and coordinator)

**What the frame shows**
- Show each tank's front or front three-quarter. Never a rear view. A side profile is fine only in a broadside
  exchange.
- The tanks stand in front and the fire or explosions behind them: the "tank in front, explosion behind" reference.
  No smoke, fire or burst between the lens and a hull. The check flags these.
- Keep both hulls whole and inside the frame: box |x| ≤ 0.97, and |y| ≤ 0.9 so the 1.91:1 crop keeps them.
- Make them large. The hero hull should span at least about 35 % of the frame's width.
- Prefer keeping the bottom-left corner (x < -0.45, y < -0.55) free of a hull's key features, because the social
  card's lockup sits there. This is a preference, not a rule.

**Picture**
- Deep focus: `dof: { enabled: false }` and `chromaticAberration: 0`, as `CLEAN` in versus.mjs sets them.
- The owner liked round 5's "illuminated and highlighted" tanks: the `LIT` grade, with exposure about +0.3, vibrance
  0.14, contrast 1.05 and a deeper vignette. Light the hull fronts: put the sun low and on the lens's side of the
  tanks.

**Effects**
- The owner asks for "more sparks, muzzle flare and debris falling": firing moments, hit sparks on a plate, falling
  debris and embers.
- Never give an effect an id of the form `fx<n>`. Leave effects unnamed; the Studio names them.
- A destroyed vehicle uses the state `wrecked-burnt`, because destroyed vehicles must look crumpled and burnt.

**Wires and maps**
- No overhead wire across the frame. The check flags any conductor a pixel wide at 1440 px.
- Avoid the maps with banned clouds: fjord, polders and copper_mesa.
- Verdant's buildings are the owner's visual bar.

## The tools

All of these are CPU-side. Never render, never take the GPU capture lock, never start a browser.

**Where things live**
- Scene modules go in `remake/v6/<id>.mjs`. Each imports from `../versus.mjs` and registers its scene:
  `SCENES['<id>'] = () => sceneObject;`
- Run every check from the export root through the house cap, which gives a 4 GB heap and a time limit:
  `cd shots/media-r5/tmp/remake && zsh ../capped.zsh 300 node ../../remake/versus6.mjs check <id>[,<id2>]`
- Write `scenes` output only for your own ids. `scenes <id>` writes `remake/scenes-v/<id>.json`, which is safe.
- Never run `final` or `jobs`; the coordinator of this round does.
- Never edit `versus.mjs`, `versus6.mjs`, or another author's files.
- Do not use `rm -rf`.

**What `versus.mjs` exports**

Units are metres and degrees. World X/Z; a bearing of 0 points along +Z and 90 along +X.
- `polar(p, bearingDeg, d)`: a point d metres from p on a bearing.
- `bearingOf(a, b)`: the bearing from a to b.
- `inFrame(o, yaw, side, ahead)`: a point in the frame of a lens at o facing the bearing yaw. `side` is positive to
  the screen's right (in this world, right of +Z is -X); `ahead` is the distance forward.
- `axes(yaw)` gives `{ f, r }`. `wrap(d)` wraps an angle; `r2(v)` rounds to 2 decimals.
- `lensAt(name, eye[x,z], lift, look[x,z], lookH, fovVerticalDeg)`: a fixed camera, ground-relative. Lift and lookH
  are metres above the ground at eye and look.
- `fx(type, at | actorName, tMs, params)`: an effect, either at `[x,z]` (ground-relative) or `[x,y,z]` (absolute),
  or on an actor by name.
- `moment(actorName, tMs, ageS)`: a frozen muzzle flash `ageS` seconds after the shot. 0.045-0.06 reads best.
- `hitFx(map, actor, fromXZ, tMs, kind)`: impact, sparks and hot debris on the plate of `actor` that faces `fromXZ`.
  `kind` is `ricochet` or `penetration`.
- `plate(map, actor, fromXZ)`: the hit point and its normal.
- `ground(map, x, z)` and `modelOf(map)`. The world model has `heightAt`, `supportAt`, `slopeAt`, `wetAt`,
  `hullContacts` and `crushes`.
- `DIMS[specId]`: `[halfLength, halfWidth, muzzleReach, height]` from `tools/media-r5/hull-dims.json`.
- `MOVE_MS` (2600), `SUN_UP`, `CLEAN`, `LIT`.
- Backdrop helpers: `COLUMN`, `FIRE`, `EMBERS`, `FLARE`, `WRECK` and `behind`. They place things relative to the
  pair's mid-point in the lens frame and expect `v.yaw`. You may write your own placements instead.
- `versus(v)` is the old template. Its code (lines ~60-110) shows how tracks, dust, hits and firing are built. Do not
  reuse its layout.
- `check(id)` runs these checks:
  - footprints, slope above 0.2 and water above 0.3;
  - route contacts;
  - the eye inside a building;
  - a tank behind the lens;
  - frame cuts beyond ±0.97;
  - sight blockers from the lens to each hull;
  - a hull seen more than 75° off its nose (rear-ish);
  - effects in front of a hull;
  - overlapping boxes;
  - overhead wires.

  Note that `check` reads only the first two actors as the pair, so put your two duelling tanks first.

**The scene object**

Copy the shape `versus()` returns:

```
{ map, timeOfDay ('day'|'morning'|'golden'|'sunset'|'night'|'dawn'), seed,
  light: { sunAzimuthDeg, sunElevationDeg },
  actors: [ { id, name, pos: [x,z], facingDeg, turretDeg, gunDeg, camo, camoSeed, state?, stateAgeS? } ... ],
  effects: [...], fxTime: T, timeScale: 0,
  storyboard: { version: 1, durationMs: T + 1500, shots: [],
                actorTracks: [ { actor, keys: [ { id, tMs, pos, facingDeg, turretDeg, gunDeg, transition: 'linear' } ] } ] },
  picture: { ...CLEAN, ...LIT, ... }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
  lenses: [ lensAt('a', ...), lensAt('b', ...)? ],
  meta: { id, kind: 'versus-still', pair: '<idA> v <idB>', round: 6, idea: '<one line>' } }
```

- The first lens is the pick. A second lens `b` is optional; the coordinator may film both for the favourites.
- The still is taken at `fxTime` (T, usually 7000 ms, so smoke has risen). A moving tank drives a track over the
  `MOVE_MS` before T and a little past it. Track dust comes from the `dust` effect plus `fx.trackDust`.
- The turret is relative to the hull. +turretDeg lays the gun to the hull's left, which is screen-right from a lens
  ahead of it. Always confirm the side by projection, not by intuition.
- Actor names: the two duellists are `hero` and `foe0`; others are `ally1`, `wreck0` and so on.

**Effects and states**
- The effect types are listed in `tmp/remake/src/game/studio.ts` (EFFECT_TYPES): fire, muzzle_flash, tracer, impact,
  sparks, explosion, tank_kill, dust, engine_smoke, burning, detrack, firing_moment, explosion_moment, mg_burst,
  barrage, armor_scar, exhaust, smoke_screen, flare, embers, debris, shockwave, fire_field.
- Their params are in `tmp/remake/docs/STUDIO.md`. Read it.
- Actor states: intact, engine-smoking, burning, wrecked, wrecked-burnt, turret-popped.

**Maps**
- Every map has a features dump: `remake/spots.mjs` `featuresFile(map)`.
- Overview pictures are in `tmp/remake/public/maps/<map>.webp`.
- The round-4 stills show each map's look at the old eye positions: `remake/deliver-v/<id>-1920.webp`.
- Map sources are in `tmp/remake/src/world/maps/<map>.ts`.
- If you look at any picture, downscale it first (`sips -Z 1000 in --out $TMPDIR/x.png`) and read only what you need.
- A top-down plan of your placement may help: write a small SVG of nearby records, trees, the lens frustum and the
  hulls, and render it with `sips` or `rsvg-convert` if present.

**Tanks.** The ids and paints of the ten pairs are in `remake/versus.mjs`, lines ~180-210. Display names come from
`public/icons/tank-assets.json`, `label.displayName`; never write an id as a caption. A different, fitting paint from
the camo catalog (`camoPattern.*` in `src/ui/i18nCatalog.en-US.json`) is allowed if it suits the map, but keep the
pairs.

## What to deliver, per scene

1. `remake/v6/<id>.mjs`. The id pattern is `vsNN-<map>-<short pair>-r6`, for example
   `vs01-desert-abrams-t90m-r6`.
2. A clean check: no `!` lines, or each remaining one justified in your report.
3. `remake/v6/<id>.md`, one short paragraph covering:
   - the composition;
   - why it differs from the old layout and from the other nine ideas;
   - the lens and the light;
   - the final check output.
4. A report of at most 10 lines in your final message: ids, lenses, one line per composition, any leftover flags.
