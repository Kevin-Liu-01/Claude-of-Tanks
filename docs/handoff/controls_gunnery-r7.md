# controls_gunnery r7 — handoff (non-owned files)

Owned fixes already landed in `src/ui/settings.js` (kill-cam-aware panel: bus-tracked
`killcam:begin`/`killcam:done` window suppresses the pointer-unlock auto-open, the
focus/resume veil and the Esc-menu action while a replay owns the screen, closes an
already-open panel on replay start, and absorbs the ANY-KEY-skip keypress with a 250 ms
done-grace). Four changes below need non-owned files. Item 1 is the REQUIRED companion
to the settings.js major fix; items 2–4 are the critic's minors.

---

## 1. src/main.js — `isBattleActive` must report false once the local player is dead
**(MAJOR — required: settings menu auto-opened over the death kill-cam)**

`game.phase` stays `'battle'` while the dead player spectates (team fight continues), so
settings.js's pointer-unlock heuristic treated the death branch's `exitPointerLock()`
(main.js ~1356) as an Esc press and threw the options menu over the kill-cam on every
pointer-locked death. settings.js now suppresses this itself whenever a replay is live,
but the no-replay death path (no captured killing shell, e.g. burn-out → straight to the
death cam) still needs the callback to tell the truth.

At main.js:711, replace:

```js
  isBattleActive: () => game.phase === 'battle' && !game.result,
```

with:

```js
  // controls_gunnery r7: 'battle active' for settings-panel purposes means THE
  // PLAYER is still fighting. phase stays 'battle' while the dead player
  // spectates, and the old check let the panel's pointer-unlock heuristic read
  // the death branch's exitPointerLock as an Esc press — the options menu
  // opened over the kill-cam on every pointer-locked death. Dying hands off to
  // the death cam with a free cursor, like WoT.
  isBattleActive: () => game.phase === 'battle' && !game.result &&
    !!(game.player && game.player.combat && !game.player.combat.destroyed),
```

`isBattleActive` is referenced nowhere else in main.js; inside settings.js this also
correctly stops the dead spectator from getting the click-to-resume veil / relock-on-close
pointer grab. Verified live via a temp-applied copy (see probe below): death while
pointer-locked no longer opens the panel, ANY-KEY skip works, Esc during the death cam
still opens the menu deliberately.

---

## 2. src/ui/hud.js — hit-confirm/bounce reticle ticks nearly invisible
**(minor — thin pale ticks vanish against bright scenes at 1080p)**

In `drawHitMark` (hud.js ~1278–1306), replace the single stroked pass:

```js
    const a = 1 - age / 1.4;
    const scaleIn = age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1;
    const r1 = (13 + age * 30) * scaleIn;
    const r2 = r1 + 10;
    ctx.strokeStyle = hitMark.bounced
      ? `rgba(190,202,214,${(0.9 * a).toFixed(3)})`
      : `rgba(255,152,54,${(0.95 * a).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + q * Math.PI / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      ctx.moveTo(view.cx + ca * r1, view.cy + sa * r1);
      ctx.lineTo(view.cx + ca * r2, view.cy + sa * r2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
```

with a two-pass draw (dark outline under the colored ticks, full-strength flash for the
first 300 ms, then a sharper linear tail — reads instantly on any background):

```js
    // controls_gunnery r7: two-stage fade — full punch for the first 300 ms,
    // then the tail. A dark outline pass under the colored ticks replaces the
    // old 2px shadowBlur; the thin pale marks vanished on sunlit walls.
    const a = age < 0.3 ? 1 : 1 - (age - 0.3) / 1.1;
    const scaleIn = age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1;
    const r1 = (13 + age * 30) * scaleIn;
    const r2 = r1 + 14;
    ctx.lineCap = 'round';
    for (const pass of [
      { c: `rgba(10,14,18,${(0.85 * a).toFixed(3)})`, lw: 8 },
      { c: hitMark.bounced
          ? `rgba(216,226,236,${a.toFixed(3)})`
          : `rgba(255,158,44,${a.toFixed(3)})`, lw: 5 },
    ]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.lw;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const ang = Math.PI / 4 + q * Math.PI / 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.moveTo(view.cx + ca * r1, view.cy + sa * r1);
        ctx.lineTo(view.cx + ca * r2, view.cy + sa * r2);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
```

Verify with `window.__DEBUG.forceHitMark(false)` / `forceHitMark(true)` over the
`player_view` staging (bright building background).

---

## 3. src/ui/hud.js — world-anchored damage labels clip at the frame edge
**(minor — 'NO PENETRATION' rendered as 'ENETRATION' hugging x=0)**

In `pushDamageNumber` (hud.js ~2612–2618), the stacking loop resolves label-vs-label
collisions but never frame bounds. `.cot-dmgnum` is x-centered via
`transform: translate(-50%, …)`, so clamp the projected point after the stacking loop —
insert between the `for (let guard …) { … }` loop and `liveNums.push({ x, y, … })`:

```js
    // controls_gunnery r7: clamp into the frame — a hit near the viewport edge
    // rendered its label half offscreen ('ENETRATION' at x≈0). Labels are
    // x-centered (translateX(-50%)); 90 px covers half of the widest text
    // ('NO PENETRATION'), 40/60 px keep the float-up animation on screen.
    x = Math.min(Math.max(x, 90), w - 90);
    y = Math.min(Math.max(y, 40), h - 60);
```

(`w`/`h` are the module-level HUD canvas dims already used by `project()`, which produces
`_sx/_sy` in the same space.)

---

## 4. src/game/ai.js — easy/normal bots land 100% of aimed shots on the player at range
**(minor — 5/5 hits for 2784 dmg in 40 s on 'normal' reads as aimbot punishment)**

Three edits, all in `src/game/ai.js`:

**(a)** Tier table (~line 53): add a `playerSpreadMult` knob —

```js
  easy:   { fireFactor: 0.6, reactionS: 1.2, aimErrMult: 2.0, playerSpreadMult: 1.3, probeLevel: 0, engageRangeM: 300, holdRangeM: 180, coverIQ: 0.35 },
  normal: { fireFactor: 0.9, reactionS: 0.7, aimErrMult: 1.4, playerSpreadMult: 1.0, probeLevel: 1, engageRangeM: 400, holdRangeM: 240, coverIQ: 0.7  },
  hard:   { fireFactor: 1.2, reactionS: 0.3, aimErrMult: 1.0, playerSpreadMult: 0,   probeLevel: 2, engageRangeM: 500, holdRangeM: 300, coverIQ: 1.0  },
```

**(b)** Persistent error state (next to `blindYawRad`/`blindPitchRad`, ~line 323):

```js
  // controls_gunnery r7: extra spread vs the HUMAN at range on sub-hard tiers
  // (see resampleAimError) — resampled on the same cadence so streaks break.
  let playerYawRad = 0;
  let playerPitchRad = 0;
```

and in `resampleAimError()` (after the blind-fire samples, ~line 394):

```js
    // controls_gunnery r7: normal bots went 5/5 on a stationary player —
    // aimbot punishment, not pressure. ~4.5/3.0 mrad sigma vs the player
    // beyond 150 m ≈ +20-25% effective dispersion at 250 m on 'normal'
    // (higher on easy via playerSpreadMult); hard keeps its laser and
    // bot-vs-bot lays are untouched.
    playerYawRad = gauss(rng) * 0.0045;
    playerPitchRad = gauss(rng) * 0.0030;
```

**(c)** Application site — directly after the tier error is added to the lay
(`_vD.y += errPitchRad * dist;`, ~line 1144), insert:

```js
    // controls_gunnery r7: player-only range spread (see resampleAimError) —
    // ramps in over 150→300 m so close brawls stay exactly as lethal.
    if (target.isPlayer && tier.playerSpreadMult > 0 && dist > 150) {
      const ramp = Math.min(1, (dist - 150) / 150) * tier.playerSpreadMult;
      _vD.x += px * playerYawRad * dist * ramp;
      _vD.z += pz * playerYawRad * dist * ramp;
      _vD.y += playerPitchRad * dist * ramp;
    }
```

Expected effect at 227 m on 'normal': lateral sigma grows from ~0.39 m to ~0.65 m —
streaks become 3–4/5 with more bounces/partials instead of 5/5 center-mass, while
suppression pressure (shell volume) is unchanged. `hard` is byte-identical.
