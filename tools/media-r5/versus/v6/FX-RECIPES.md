# FX recipes for v6 stills (read from the code, not rendered)

Paths are relative to `tmp/remake/`. The snippets use the `versus.mjs` exports (`fx`, `axes`, `inFrame`, `plate`, `r2`,
`DIMS`, `ground`) and go inside a `SCENES[ID] = () => { ... }` body.

## How a still is sampled (this causes most of all three problems)

- cinema loads the scene at `fxTime` and then calls `capture({ samples: 16, exposureMs: 12, supersample: 1.5 })`
  (`tools/media-production/cinema.mjs:391-396`, `remake/finals-v/jobs-*.json`).
- **Load replays, it does not seek.** It resets the FX and fires every effect at its `tMs` on a fixed 1/60 s grid
  from 0. Each step moves the storyboard actors, emits track dust, flies the shells and ticks every emitter, up to
  `fxTime` (`src/game/studio.ts:53`, `:592`, `:2931-2944`, `:2986-3013`). Track dust, tracers and columns all play
  through.
- **The 12 ms exposure replays a second time.** The sample instants are `T + ((i+0.5)/n - 0.5)*12`, which spans T-5.6
  to T+5.6 ms (`src/game/studioFilmPlan.ts:352-366`). The still replays from 0 to `floor(first sample)` and then steps
  through the samples (`src/game/studioFilm.ts:526-531`, `studio.ts:4326-4327`). An effect fires when the playhead
  crosses its `tMs` (`studio.ts:3040-3062`). n is 16, and only camera or actor motion raises it, up to 64
  (`studioFilm.ts:508-529`, `studioFilmPlan.ts:334-338`).
- **Consequence 1:** an effect authored at `tMs = T` appears only in the samples after T, so at half strength. The
  template's `moment(name, T, age)` and every v6 `moment('hero', T, ...)` are affected. **Rule: author every effect at
  `tMs <= T - 8`.**
- **Consequence 2:** anything moving at v m/s smears v x 12 ms in the still: a coax round at 820 m/s smears 9.8 m and an
  APFSDS round at 1650 m/s smears 20 m.

## 1. Track dust and the rooster tail

**Why it is missing or faint**
- The continuous emitter is there, but it is thin. When `fx.trackDust` is on (the default in cinematic quality,
  `studioFxSettings.ts:25`), every actor with 2 or more track keys emits one packet per side every 0.42 m of travel, on
  the 60 Hz grid (`studio.ts:1751-1760`, `:2830`; `src/fx/cinematicFx.ts:93-94`, `:563-597`).
- Each packet scales with `sp = speed/12` (`src/fx/cinematicRecipes.ts:1077-1100`):
  - the churn lives 0.9-1.6 s at alpha `0.30+0.25sp`;
  - the rising wake appears with probability `0.55+0.35sp`, lives 3.2-6 s, grows to about `3+3.2sp` m, at alpha
    `0.18+0.22sp`;
  - the clods appear only if `sp > 0.45` and never on snow.
- At the template's 5.5 m/s, `sp` is 0.46, so the wake alpha is about 0.28 and the churn about 0.42.
- The alpha ramps in until 12 % of a card's life and fades after 50 % (`src/fx/particles.ts:325`).
- The dust sits at the rear track ends, at `halfLength*0.92` back (`cinematicFx.ts:584`). A nose-on lens therefore sees
  it behind the hull.
- **Snow and sand:** the dust is the ground's own tone. On snow it is `0xe3e9ee`/`0xbac6d0`; on sand it is
  `0xc9b48c`/`0xa38f6c` (`cinematicFx.ts:322-334`). The battle layer on sand or snow adds only a tiny 0.3-0.7 s powder
  (`src/fx/effects.ts:6649-6652`, `:5199-5224`). The result is white on white, or sand on sand.
- **The `dust` effect on an actor misses the tracks.** It lands at the hull centre, at y+0.3
  (`studio.ts:1618-1622`, `:2213-2224`). `dirDeg` defaults to 0, which is world +Z, not the tank's rear.
  `round(count/3)` packets fall within ±1 m (`cinematicFx.ts:994-1000`). At T-220 that puts them under the hull.

**Recipe:** drive at 10-14 m/s, and lay bursts at the rear track ends along the path, aged 0.1-1.5 s.

```js
const SPEED = 12;                                     // m/s: sp = 1, 2.2x the packets of 5.5 m/s, fuller and opaquer
const { f, r } = axes(H), d = DIMS[hero.id];          // H = the hero's facingDeg; d = [halfLength, halfWidth, reach, height]
const hullAt = (ago) => [P[0] - f[0] * SPEED * ago / 1000, P[1] - f[1] * SPEED * ago / 1000];   // P = hero.pos at T
const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: H, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
const track = { actor: 'hero', keys: [key(0, T - 2600, hullAt(2600)), key(1, T + 400, hullAt(-400))] };
const tail = [];
for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
  const p = hullAt(ago);
  for (const s of [-1, 1]) {   // both track ends, where the hull was `ago` ms before the still
    const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * s * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * s * d[1] * 0.8];
    tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(H) }));
  }
}
// scene: fx: { quality: 'cinematic', trackDust: true }, storyboard.actorTracks: [track], effects: [...tail, ...]
```

- `dirDeg` is the direction of travel. The churn and clods fly opposite to it, and the wake drifts with it
  (`cinematicRecipes.ts:1087-1094`).
- At `intensity` 1.3 a packet runs at 16.4 m/s and `sp` reaches 1.37, which is almost the 1.4 cap. Above 1.35 only the
  battle layer grows.
- A packet's `sizeK` is 1.3 (`cinematicFx.ts:999`).
- Old bursts (1-1.5 s) leave the risen wake, and young ones (0.1-0.5 s) leave the low churn.
- **Lens:** put it 30-60° off the nose, so the trail runs out beside the hull.
- **Snow and sand:** rely on light and backdrop, not colour.
  - Put the sun 70-110° off the view, so the shadow side of the dust (puff light `0.52+0.72*sun`, `particles.ts:367`)
    reads grey against sunlit ground.
  - Frame the plume against the hull, trees, rock or sky, not open snow.

## 2. Tracers as separate dashes, not one beam

**Why they merge**
- **The `mg_burst` rounds:** they leave the main-gun muzzle on its line. Round i starts at `2 + i*gapM` m and flies at
  `speedMps` (default 820) with no drag (`studio.ts:2313-2341`, `src/sim/ballistics.ts:200-209`). At the still, round i
  is `2 + i*gapM + speedMps*(T - tMs)/1000` m out, so at T-420 the default burst sits 346-395 m away.
- **The tracer dash:** a tracer is drawn as a dash of `min(streakMax, speed/60)` behind its head, 13.7 m at 820 m/s
  (`src/fx/projectileTracers.ts:96`, `:580`).
  - Only 1 round in 5 is lit for calibres under 15 mm (NATO red), and 1 in 4 for east lineage (green) or autocannon.
  - Every round is lit at 45 mm and up, with dashes up to 12 m (`projectileTracers.ts:82-88`, `:136-139`, `:160-162`).
- **The glare bead:** cinematic quality also puts a glare sprite on **every** live shell, lit or not. It is a white core
  (`exp(-r²*60)*1.6`) on a 0.9 m sprite (`cinematicFx.ts:136-141`, `:733-743`). This is global, with no per-effect switch.
- **The merge:** the 12 ms exposure stretches each bead 9.8 m. With the default `gapM` of 7, the streaks overlap into
  one even line. Seen down the gun line, that chain projects onto the muzzle.
- **The main gun:** `firing_moment` always pushes a static, even bolt from 0.55 to 3.4 m past the muzzle
  (`src/fx/effects.ts:7118-7130`). Its APFSDS core is `0xfff2c0`, near white, at width 0.10 (`effects.ts:602-611`). It
  holds full brightness for 0.3 s (`effects.ts:4935`). No parameter removes it.

**Recipe:** a few rounds, spaced at least 1.5x the dash plus the smear, fired at least 8 ms before T.

```js
// coax laid on the target (it fires along the MAIN gun's line: set turretDeg/gunDeg on the target)
fx('mg_burst', 'foe0', T - 20, { count: 4, gapM: 30, speedMps: 600, caliberMm: 50, spreadDeg: 0.5 }),
// at T the rounds are 14/44/74/104 m out; each lit dash 10 m + 7.2 m smear = 17 m, 13 m gaps; caliberMm >= 45 lights every round
// a true calibre (7.62 / 12.7) lights only round 0: the rest show only the white bead, smeared speedMps*0.012 m
// main gun: no firing_moment if the bolt must go; take muzzle_flash (section 3) plus, for a visible round, a slow dash:
fx('tracer', from3, T - 25, { from: from3, to: plate(MAP, foe, hero.pos).at, shellType: 'APFSDS', speedMps: 500, caliberMm: 120 }),
// from3 = [x, ground + muzzle height, z] at DIMS[id][2] along facingDeg + turretDeg; nothing draws inside 10 m (igniteM)
```

- **Rule:** `gapM >= 1.5 * speedMps * (1/60 + 0.012)`. That gives 34 m at 820 m/s, 25 m at 600 m/s and 14 m at
  320 m/s.
- A job with `"still-exposure-ms": 4` (`cinema.mjs:84`) cuts every smear to a third.

## 3. Muzzle flash: a big orange blast, not a white dot

**Why it is a dot or a glow**
- **Half the samples have no flash.** The flash sits at `tMs = T` (see Consequence 1).
- **At 45-60 ms most of the blast is gone or not yet visible** (`cinematicRecipes.ts:302-415`, with
  `s = clamp(cal/120, 0.35, 1.45)`):
  - **Fire cards** last only 0.07-0.18 s, so at 45-60 ms the short-lived ones are dead.
  - **Jets** last 0.05-0.09 s, so most are dead too.
  - **The propellant ring, the gas cone and the ground fan** last 2-4.8 s. Their alpha only reaches full at 12 % of
    life, which is 0.25-0.6 s (`particles.ts:325`), so at 50 ms they are nearly invisible.
  - **The haze** is born 0.1-0.4 s after the shot.
- **Fire colour:** young fire is white-hot (`hot = 0.45+heat²(2.2-1.6vT)`) and turns orange, then soot, from vT 0.3
  (`particles.ts:423-438`).
- **The battle flash shrinks** (`effects.ts:2773-2796`):
  - down the bore (size `1-0.32axial²`, alpha `1-0.48axial²`);
  - inside 14 m of the lens;
  - it grows up to 2.4x at 29 m.
- **Night** cuts the muzzle cards to 58 % and the exposure to 40 % (`cinematicFx.ts:774-776`).

**Recipe:** a live `muzzle_flash` 40-45 ms before T, the recoil from the actor field, and for a stationary gun an
earlier blast for the ring and dust.

```js
hero.recoilAgeS = 0.04;                                    // recoiled barrel (muzzle_flash does no recoil; studio.ts:2977-2981)
fx('muzzle_flash', 'hero', T - 42, { caliberMm: 160 }),   // in all 16 samples, 36-48 ms old: fire cards at full alpha, orange-yellow; s = 1.33
fx('muzzle_flash', 'hero', T - 600, { caliberMm: 160 }),  // stationary gun only: its fire is dead, its doughnut, gas cone, ground fan and haze now read
// keeping firing_moment instead: fx('firing_moment', 'hero', T - 10, { ageS: 0.04, slot: 0, caliberMm: 160 }) (the bolt stays)
```

- **Geometry:**
  - Lay the bore 50-90° across the view ray. Nose-on, the fireball foreshortens to a dot.
  - Keep the muzzle 14-30 m from the lens.
  - The ground fan needs the muzzle under 4.6 m above the ground 2 m out, and is full at 1.4 m or less
    (`groundK`, `cinematicRecipes.ts:375-378`).
- `muzzle_flash` draws no bolt and has no `ageS`; its age is `T - tMs` (`studio.ts:1934-1948`).

## Columns: do they persist, and why does the top break into blobs?

**Do they persist?** Yes.
- **`explosion` with `size: 'huge'`:** it runs a column emitter from +0.8 s to +60 s, 48 m tall and 5 m wide, plus a
  fire field (to 18 s) and embers. With `cause: 'shot'` the column runs only to +14 s, 30 m by 4 m, with no fire field
  or embers (`cinematicFx.ts:926-941`).
- **`burning` or `tank_kill`:** they feed a burning emitter to the timeline's end, with an 18 m or 26 m column
  (`cinematicFx.ts:943-977`). `burning` also lights the 40 s battle column (`studio.ts:1382-1394`, `effects.ts:722`).

**Why the top breaks into blobs** (`cinematicRecipes.ts:934-957`)
- Each tick spawns 4 puffs at height `r^1.35 * H`, so most are born low.
- `H` is `min(6 + 3.2*age, 48)`. At T = 7 s, fired at 0 (`tMs` clamps at 0, `studioTimeline.ts:175-177`), H is about
  26 m.
- Above H there are only a few cards, each born near H and rising 2-4 m/s for 4.5-10 s. Each card's size is set by its
  birth height, up to about 18 m.
- The cards fade after half their life, and they drift sideways faster the higher they are (`WIND*(0.8+0.06h)`).
- The result is a few large, separate, fading cards. Burning columns behave the same way (`r^1.5`, `H = 4+2.4*age`,
  `:820-833`).

**Fixes**
- Crop the column top out of the frame.
- Or add a second column at the same point, about 1 s later, so its cards fill the gaps:

```js
fx('explosion', colAt.map(r2), 0, { size: 'huge' }),
fx('explosion', [r2(colAt[0] + 0.6), r2(colAt[1] + 0.6)], 1000, { size: 'huge' }),
```

- Or raise `T` (`fxTime` up to 18500, with `durationMs = T + 1500 <= 20000`) and shift every other effect by the same
  amount, for a taller column.

## Caveats

- None of this was rendered. The ages, gaps and speeds are derived from the code.
- Every v6 scene that fires a `moment(..., T, ...)` flashes at half strength until it moves to `T - 8` or earlier.

## A muzzle flash over snow (2026-10-17, vs08's GO QA)

The cinematic muzzle blast (blastRecipes.ts `muzzleBlast`, run when the effect's quality is cinematic) lifts a sheet of
the surface's dust under and ahead of the muzzle. On snow that sheet is sunlit white and reads as a flat blown-out blob
on the ground before the hull; cutting the calibre (it only scales the sheet, never below 0.35) or aging the flash does
not remove it. Over snow, give the flash `quality: 'battle'`: the game's own flash (and the recoil) without the
cinematic blast, its propellant cloud or its ground sheet.
