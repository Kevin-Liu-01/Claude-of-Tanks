# controls_gunnery r2 — handoff to other module owners

Done inside owned files (`src/game/input.js`, `src/ui/settings.js`):
- one shot per click / trigger pull (fire is a consumed press edge — a held
  LMB can no longer auto-fire the instant the reload completes; also kills the
  "relock click fires a shot" annoyance, since unlocked presses never latch),
- wheel zoom gated on pointer lock (scrolling any UI no longer steps gun zoom),
- SOUND tab with master / engine / gunfire / ambience / UI sliders persisted
  in `cot.settings.v1` (`volMaster`, `volEngine`, `volCombat`, `volAmbience`,
  `volUi`, all 0..1) and broadcast live as the `'ui:volumes'` bus event
  `{master, engine, combat, ambience, ui}`.

The items below need other modules. Hunks are written against the current
files; item 3 is REQUIRED for the SOUND tab to actually drive the mix.

---

## 1. MAJOR — scoped-in-a-bush renders opaque leaf blobs → `src/world/vegetation.js` (1 hunk + cache-key bump)

Bush camping is core WoT play; WoT fades the occupying bush to
near-transparency in sniper mode. Near-grass suppression already exists
(`uSniperFade` / `uCamPos` uniforms, eased in `update()`), but tree/bush LEAF
CARDS don't use it — a scoped player inside a bush gets screen-filling flat
green cards (`r2b_return_fire.png`).

`foliageMats` (alpha-tested leaf cards) is shared by near-LOD trees AND all
bushes, so one hook patch covers both. Replace `foliageWindHook`:

```js
  const foliageWindHook = (shader) => {
    treeWindHook(shader);
    useAttributeNormal(shader);
    // SNIPER FOLIAGE FADE (controls_gunnery r2): WoT fades the bush the
    // player is scoped inside — screen-door-dither leaf fragments within
    // ~10 m of the camera while uSniperFade > 0 (same eased uniforms as the
    // grass suppression; zero cost in arcade mode where vFolKeep == 1.0).
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uSniperFade = uSniperFade;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform vec3 uCamPos;\nuniform float uSniperFade;\nvarying float vFolKeep;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      {
        vec4 fiw = instanceMatrix * vec4(transformed, 1.0);
        vFolKeep = mix(1.0, smoothstep(4.0, 10.0, distance(fiw.xyz, uCamPos)), uSniperFade);
      }
      #include <project_vertex>`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      if (vFolKeep < 0.999) {
        float fdit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (fdit >= vFolKeep) discard;
      }`);
  };
```

Also bump the program cache key where the material is created:
`fm.customProgramCacheKey = () => 'world-tree-foliage-v5-' + sp;` (was v4).

Notes: the vertex distance uses the wind-displaced vertex, matching the world
position `treeWindHook` already assumes (`instanceMatrix * vec4(...)` — the
vegetation group sits at the world origin). `foliageDepthMats` (shadow pass)
is deliberately NOT faded — a faded bush keeping its shadow is correct and
matches WoT. Verify with the screenshot harness: `sniper_view` must stay
byte-comparable except where a leaf card sat inside 10 m.

## 2. MAJOR — AI inert to incoming fire from outside engage radius → `src/game/state.js` (1 hunk) + `src/game/ai.js` (4 hunks)

Verified by probe: bots shelled from 339 m (normal tier `engageRangeM` = 330)
never returned fire or repositioned in 32 sim-seconds; the same bots fired
within 6 s at 170 m. Getting hit must reveal the shooter and pull bots toward
it (WoT bots and every modern shooter do this).

### 2a. `src/game/state.js` — notify the victim's team on every enemy hit

After the existing lines in the shell-hit resolution function:

```js
  const shooter = game.tankById.get(ev.attackerId);
  if (shooter && shooter.aiCtl) shooter.aiCtl.notifyShellResult(ev);
```

add:

```js
  // UNDER-FIRE REACTION (controls_gunnery r2): being shot reveals the
  // shooter. The victim and teammates within 200 m turn on the attacker even
  // when the shot came from outside their normal engage envelope.
  if (shooter && target && shooter.team !== target.team) {
    for (const ent of game.tanks) {
      if (ent.team !== target.team || !ent.aiCtl || !ent.combat || ent.combat.destroyed) continue;
      if (ent !== target && ent.state.pos.distanceToSquared(target.state.pos) > 200 * 200) continue;
      if (ent.aiCtl.notifyUnderFire) ent.aiCtl.notifyUnderFire(shooter);
    }
  }
```

### 2b. `src/game/ai.js` — constant (near the other tuning constants)

```js
const UNDER_FIRE_WINDOW_S = 15;   // chase/engage window after taking a hit
const UNDER_FIRE_RANGE_BONUS_M = 150; // engage-envelope extension toward the shooter
```

### 2c. `src/game/ai.js` — controller state + spotting bypass

After `let nonPenCount = 0;` add:

```js
  let underFire = null;            // shooter entity revealed by hitting us
  let underFireUntilS = -Infinity; // reaction window end (sim seconds)
```

Replace the `isVisibleToTeam` definition with:

```js
  const isVisibleToTeam = (e) => !spotting || spotting.isSpotted(e.id) ||
    (e === underFire && nowS < underFireUntilS);
```

(Being hit is intel — tracers/muzzle flash — so the spotting gate must not
hide a shooter that just landed a shell on us. `losClear` still demands a
personal LOS ray before firing, so nothing shoots through hills.)

### 2d. `src/game/ai.js` — engage-range extension in `driveEngage`

Replace:

```js
    if (distToTarget > tier.engageRangeM) {
```

with:

```js
    const engageR = tier.engageRangeM +
      (nowS < underFireUntilS ? UNDER_FIRE_RANGE_BONUS_M : 0);
    if (distToTarget > engageR) {
```

### 2e. `src/game/ai.js` — the hook itself + export

Next to `notifyShellResult`:

```js
  /**
   * Reaction to this tank (or a nearby teammate) taking an enemy hit:
   * acquire the shooter past the spotting gate, remember its position, and
   * extend the engage envelope toward it for UNDER_FIRE_WINDOW_S.
   * @param {object} shooterEnt TankEntity that fired the shell
   */
  function notifyUnderFire(shooterEnt) {
    if (!shooterEnt || !shooterEnt.state || !enemyAlive(shooterEnt)) return;
    underFire = shooterEnt;
    underFireUntilS = nowS + UNDER_FIRE_WINDOW_S;
    lastSeen.x = shooterEnt.state.pos.x;
    lastSeen.z = shooterEnt.state.pos.z;
    lastSeenAtS = nowS;
    if (!target || !enemyAlive(target)) {
      target = shooterEnt;
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
    }
    if (mode === 'patrol') mode = 'engage';
  }
```

and add `notifyUnderFire,` to the returned `controller` object.

`MAX_FIRE_RANGE_M` (620) already permits the return shot; the blockers were
acquisition + approach. Acceptance: repeat the r2 probe (fire on a bot from
~340 m) — the bot must return fire or visibly advance within ~10 sim-seconds.

## 3. REQUIRED for SOUND tab — channel volumes → `src/audio/audio.js` (4 hunks)

The settings panel now persists `volMaster/volEngine/volCombat/volAmbience/
volUi` (0..1) in `cot.settings.v1` and emits `'ui:volumes'`
`{master, engine, combat, ambience, ui}` on every slider change. Wire them:

### 3a. after `let masterVolume = 0.8;`

```js
  // SOUND SETTINGS (controls_gunnery r2): channel mix persisted by the
  // settings panel (cot.settings.v1) and live-updated via 'ui:volumes'.
  const chanVol = { engine: 1, combat: 1, ambience: 1, ui: 1 };
  const clamp01 = (v, d) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d);
  try {
    const s = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null');
    if (s && typeof s === 'object') {
      masterVolume = clamp01(s.volMaster, masterVolume);
      chanVol.engine = clamp01(s.volEngine, 1);
      chanVol.combat = clamp01(s.volCombat, 1);
      chanVol.ambience = clamp01(s.volAmbience, 1);
      chanVol.ui = clamp01(s.volUi, 1);
    }
  } catch (_) { /* private mode */ }
  function applyChannelVolumes(smooth) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (bus, v) => (smooth ? bus.gain.setTargetAtTime(v, t, 0.03) : (bus.gain.value = v));
    set(sfxBus, 1.0 * chanVol.combat);
    set(engineBus, 0.75 * chanVol.engine);
    set(ambientBus, 0.55 * chanVol.ambience);
    set(musicBus, 0.9 * chanVol.ui);
  }
```

### 3b. in `buildGraph()`, after the four bus `connect(comp)` lines

```js
    applyChannelVolumes(false);
```

### 3c. in `bindBus()`

```js
    bus.on('ui:volumes', (v) => {
      if (!v) return;
      if (typeof v.master === 'number') setMasterVolume(v.master);
      chanVol.engine = clamp01(v.engine, chanVol.engine);
      chanVol.combat = clamp01(v.combat, chanVol.combat);
      chanVol.ambience = clamp01(v.ambience, chanVol.ambience);
      chanVol.ui = clamp01(v.ui, chanVol.ui);
      applyChannelVolumes(true);
    });
```

### 3d. route UI blips through the UI channel

In `uiClick()` change `spawnVoice(when, 0.1, 0.4, 0, sfxBus)` →
`spawnVoice(when, 0.1, 0.4, 0, musicBus)`, so the Interface slider governs
clicks as well as the garage sting. (`hitConfirm` stays on `sfxBus` — it is
combat feedback.)

## 4. minor — near "visual-only" props fill the scope while shells pass through → `src/world/props.js`

A telegraph pole ~2 m ahead fills a ×4 scope as an untextured slab while the
reticle reads 334 m through it (r2b_after_volley.png). Root cause confirmed in
source: fence runs + telegraph poles are built "(visual only)" — they are in
neither `props.obstacles` nor the `raycast()` prop set, so the server-aim ray
AND the shell legitimately ignore them; only the eye is blocked.

Recommended (cheapest, coherent): give the pole/fence material the same
near-camera screen-door fade as item 1 — reuse `uSniperFade`/`uCamPos`-style
uniforms (world.setSniperFade already forwards the value through map.js, add a
props hook next to the vegetation one), vertex `vKeep = mix(1.0,
smoothstep(1.5, 4.0, distance(worldPos, uCamPos)), uSniperFade)`, fragment
dither-discard as in item 1. These meshes are static merged geometry, so
`worldPosition` is just the transformed vertex.

Alternative (bigger, gameplay-affecting — needs a round decision): promote
poles to real obstacles (push AABBs into `props.obstacles` and the raycast
slab set) so eye, reticle and shell all agree. Do NOT do both.

## 5. minor — turret never fully converges on lateral movers → `src/sim/movement.js`

Probe: re-aiming at a moving IS-2 every 120 ms plateaued at ~0.0088 rad error
for 10 s. The sim's `chaseAngle` snaps exactly once within `rate*dt`, and the
visual turret copies sim state 1:1 (`turretG.rotation.y = state.turretYaw`),
so the residual is the aim POINT moving between fixed steps while the command
is computed from the previous step's pose. Fix with one-step feed-forward in
the turret block of the integrator (around `const wantYawWorld = ...`):

- keep `state.prevWantYawW` (init on first use), compute
  `const wantRate = wrapAngle(wantYawWorld - state.prevWantYawW) / dt;`
  clamped to ±turretRate, then chase toward
  `wantYawWorld + wantRate * dt - state.yaw` instead of
  `wantYawWorld - state.yaw`; store `state.prevWantYawW = wantYawWorld`.

Same pattern for `desiredGun` if pitch shows the same plateau. Note the
in-game fire path already snaps the shot to the server aim point when the
barrel is within ~2° (`tryFire`), so this is feel/HUD honesty, not hit
registration — keep the 2° snap unchanged.
