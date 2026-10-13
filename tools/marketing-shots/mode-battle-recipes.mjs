// Per-slot recipes for tools/marketing-shots/mode-battle-shots.mjs (home page r2, 2026-10-12).
//
// A recipe names the battle (spec, map, mode; defaults come from the shot list's tool.config), the hour, extra
// localStorage seeds (team arrangement, scope vision ...), the HUD treatment, and run(ctx): reach the state the slot
// needs (fast-forwarding the authoritative battle where that is cheap, driving the player through the touch stick
// where the shot needs the player somewhere), then ctx.capture() with cameras and event triggers. Page functions run
// in the game page against window.__DEBUG and window.__MB (mode-battle-director.mjs); they must be self-contained.
//
// Staging used here, all through the QA surface and named in each candidate's notes: fast-forwarding the real battle,
// placing the player (H.place), freezing one bot's AI so it holds a lane, killing all enemies but the last
// (H.killExcept, the way __DEBUG.slayEnemies does), an engine fire (H.igniteEngine), a Gun Game ladder stage
// (H.setWeaponStage through the controller's checkpoint round trip). Everything shown still runs on the real sim.

// ------------------------------------------------------------------------------------------------ trigger sets
const T = {
  playerFire: (delays = [35, 70, 120]) => ({ type: 'shell:fired', who: 'player', onscreen: false, delays }),
  anyFireOnScreen: (delays = [35, 90], maxDistM = 650) => ({ type: 'shell:fired', who: 'any', delays, maxDistM }),
  enemyFireOnScreen: (delays = [35, 90], maxDistM = 650) => ({ type: 'shell:fired', who: 'enemy', delays, maxDistM }),
  hitOnScreen: (delays = [30, 70], maxDistM = 650) => ({ type: 'shell:hit', who: 'any', delays, maxDistM }),
  playerHit: (delays = [40, 120, 260], maxDistM = 1200) => ({ type: 'shell:hit', who: 'player', delays, maxDistM }),
  killOnScreen: (delays = [90, 220, 420], maxDistM = 750) => ({ type: 'tank:destroyed', who: 'any', delays, maxDistM }),
  crushOnScreen: (delays = [40, 120, 240], maxDistM = 120) => ({ type: 'prop:crushed', who: 'any', delays, maxDistM }),
};

// ------------------------------------------------------------------------------------------------ shared steps
/** Fast-forward (no rendering) while the player rolls toward the enemy until one is within range with a clear line. */
async function toContact(ctx, { rangeM = 450, maxS = 180, throttle = 0.75, stepS = 2, minRangeM = 0 } = {}) {
  return ctx.until((cfg) => {
    const H = window.__MB.H, p = H.player();
    if (!p || !H.live(p)) return { dead: true };
    const list = H.enemies().sort((a, b) => H.dist(a.state.pos, p.state.pos) - H.dist(b.state.pos, p.state.pos));
    for (const t of list.slice(0, 6)) {
      const d = H.dist(t.state.pos, p.state.pos);
      if (d < cfg.rangeM && d > cfg.minRangeM && H.clearShot(p, t)) { p.input.throttle = 0; p.input.steer = 0; return { id: t.id, spec: t.specId, d: Math.round(d) }; }
    }
    const goal = list[0];
    if (goal && cfg.throttle > 0) {
      const want = Math.atan2(goal.state.pos.x - p.state.pos.x, goal.state.pos.z - p.state.pos.z);
      let diff = want - p.state.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.input.steer = Math.max(-1, Math.min(1, diff * 2));
      p.input.throttle = Math.abs(diff) > 1 ? 0.3 : cfg.throttle;
    }
    return null;
  }, { ffStepS: stepS, timeoutS: maxS, label: 'contact', args: [{ rangeM, throttle, minRangeM }] });
}

/** Let the rendered battle run a moment so effects spawned during a fast-forward settle before candidates. */
const settle = (ctx, seconds = 2.5) => ctx.sleep(seconds * 1000);

const define = (ctx, name, body) => ctx.mb('defineSelector', name, body);

// selectors shared by several recipes (bodies of (H, D, g, ms) => info | null)
const SEL = {
  // the goal the ball is nearest
  goalNearBall: `const b = ms && ms.ball; if (!b || !ms.goals || !ms.goals.length) return null;
    let best = null, bd = Infinity; for (const q of ms.goals) { const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < bd) { bd = d; best = q; } }
    return best ? H.point(best.x, best.y, best.z, { yaw: Math.atan2(b.x - best.x, b.z - best.z), team: best.team }) : null;`,
  // the enemy (infected) tank nearest to any survivor on the player's team
  infectedLead: `const p = H.player(); if (!p) return null; const ours = H.liveTanks().filter((t) => t.team === p.team);
    let best = null, bd = Infinity; for (const e of H.enemies()) for (const s of ours) { const d = H.dist(e.state.pos, s.state.pos); if (d < bd) { bd = d; best = e; } }
    return H.info(best);`,
  survivorNearInfected: `const p = H.player(); if (!p) return null; const ours = H.liveTanks().filter((t) => t.team === p.team);
    let best = null, bd = Infinity; for (const e of H.enemies()) for (const s of ours) { const d = H.dist(e.state.pos, s.state.pos); if (d < bd) { bd = d; best = s; } }
    return H.info(best);`,
  // the player's own flag base (a CTF carrier runs home to it)
  carrierHome: `const f = ms && ms.flags && ms.flags.find((x) => x.status === 'carried' && x.carrierId); if (!f) return null;
    const c = g.tankById.get(f.carrierId); if (!c) return null; const home = ms.flags.find((x) => x.team !== f.team);
    return home ? H.point(home.baseX, home.baseY, home.baseZ) : null;`,
  // the enemy nearest to the allied convoy (AC-130 escort)
  enemyNearConvoy: `const p = H.player(); if (!p) return null; const ours = H.liveTanks().filter((t) => t.team === p.team && t !== p);
    let best = null, bd = Infinity; for (const e of H.enemies()) for (const s of (ours.length ? ours : [p])) { const d = H.dist(e.state.pos, s.state.pos); if (d < bd) { bd = d; best = e; } }
    return H.info(best);`,
  convoyLead: `const p = H.player(); if (!p) return null; const ours = H.liveTanks().filter((t) => t.team === p.team && t !== p);
    return ours.length ? H.info(ours[0]) : null;`,
};

// ------------------------------------------------------------------------------------------------ recipes
export const RECIPES = {
  // ============================================================== the thirteen modes
  'modes/standard': {
    hour: 'sunset',
    windowS: 80,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 420 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 3 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' },
          { kind: 'chase', target: 'nearestEnemyClear', step: 3, hud: 'full' },
        ],
        cameraEvery: 4,
        triggers: [T.playerFire(), T.enemyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()],
      });
    },
  },

  'modes/capture_the_flag': {
    hour: 'day',
    windowS: 75,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      const carried = await ctx.until(() => {
        const ms = window.__MB.H.ms();
        const f = ms?.flags?.find((x) => x.status === 'carried' && x.carrierId);
        return f ? { carrier: f.carrierId, flag: f.team } : null;
      }, { ffStepS: 3, timeoutS: 360, label: 'a flag carried' });
      ctx.log('carried', JSON.stringify(carried));
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'flagCarrier', azimuthDeg: 28, distM: 15, heightM: 1.3, fov: 40, headingFrom: 'velocity', hud: 'noreticle' },
          { kind: 'follow', subject: 'flagCarrier', azimuthDeg: -32, distM: 13, heightM: 1.0, fov: 42, headingFrom: 'velocity', hud: 'noreticle' },
          { kind: 'between', from: 'flagCarrier', to: 'carrierHome', backM: 12, sideM: 5, heightM: 2.0, lookAtFrac: 0.12, fov: 44, hud: 'noreticle' },
        ],
        cameraEvery: 3,
        triggers: [T.anyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()],
        everyS: 1.2,
        stopWhen: () => !window.__MB.H.ms()?.flags?.some((x) => x.status === 'carried'),
      });
    },
  },

  'modes/zone_control': {
    hour: 'day',
    windowS: 75,
    async run(ctx) {
      const contested = await ctx.until(() => {
        const z = window.__MB.H.ms()?.zones?.find((x) => x.contested);
        return z ? { id: z.id, x: Math.round(z.x), z: Math.round(z.z) } : null;
      }, { ffStepS: 2, timeoutS: 300, label: 'a contested zone' });
      ctx.log('contested', JSON.stringify(contested));
      await ctx.mb('setDrive', { to: 'contestedZone', arriveM: 12, throttle: 0.8 });
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 210, distM: 75, heightM: 40, fov: 42, smoothS: 0, hud: 'noreticle' },
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 300, distM: 62, heightM: 30, fov: 44, smoothS: 0, hud: 'noreticle' },
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 120, distM: 85, heightM: 48, fov: 40, smoothS: 0, hud: 'noreticle' },
        ],
        cameraEvery: 4,
        triggers: [T.anyFireOnScreen([35, 90], 400), T.hitOnScreen([30, 80], 400), T.killOnScreen()],
      });
    },
  },

  'modes/turbo_ball': {
    hour: 'day',
    windowS: 80,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      // drive at the ball and jump (F, the self-right / mode jump) when close
      await ctx.mb('setDrive', { to: 'ball', arriveM: 3, throttle: 1 });
      await ctx.mb('setOnFrame', `
        const p = H.player(), b = H.sel('ball'); if (!p || !b || !H.live(p)) return;
        const st = MB.onFrameState; const d = H.dist(p.state.pos, b);
        if (d < 22 && p.state.grounded !== false && (!st.lastJump || performance.now() - st.lastJump > 2500)) { H.tap('selfRight'); st.lastJump = performance.now(); }`);
      await ctx.until(() => {
        const ms = window.__MB.H.ms();
        const b = ms?.ball;
        if (!b || !ms.goals?.length) return null;
        const d = Math.min(...ms.goals.map((q) => Math.hypot(q.x - b.x, q.z - b.z)));
        return d < 110 ? { goalDistM: Math.round(d) } : null;
      }, { timeoutS: 50, label: 'the ball near a goal' });
      await ctx.capture({
        cameras: [
          { kind: 'between', from: 'goalNearBall', to: 'ball', backM: 14, sideM: 7, heightM: 2.2, lookAtFrac: 0.55, fov: 48, smoothS: 0.3, hud: 'noreticle' },
          { kind: 'follow', subject: 'ball', azimuthDeg: 35, distM: 20, heightM: 1.5, lookAtHeightM: 1.5, fov: 46, headingFrom: 'velocity', hud: 'noreticle' },
          { kind: 'follow', subject: 'player', azimuthDeg: 30, distM: 14, heightM: 0.8, fov: 46, headingFrom: 'velocity', hud: 'noreticle' },
        ],
        cameraEvery: 3,
        everyS: 1.0,
        triggers: [T.anyFireOnScreen([30, 80], 300)],
      });
    },
  },

  'modes/endless_horde': {
    hour: 'sunset',
    windowS: 80,
    async run(ctx) {
      // clear the first waves through the QA kill (credited to the player) so wave 3 marches
      const wave = await ctx.until(() => {
        const H = window.__MB.H, h = H.ms()?.horde;
        if (!h) return null;
        if (h.wave >= 3 && h.alive >= 3) return { wave: h.wave, alive: h.alive };
        if (h.wave < 3 && h.alive > 0) H.D().slayEnemies();
        return null;
      }, { ffStepS: 2, timeoutS: 240, label: 'horde wave 3' });
      ctx.log('wave', JSON.stringify(wave));
      ctx.note('waves 1-2 cleared with __DEBUG.slayEnemies to reach wave 3 quickly');
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380, throttle: 0 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'between', from: 'player', to: 'nearestEnemy', backM: 11, sideM: 5, heightM: 2.2, lookAtFrac: 0.3, fov: 46, hud: 'noreticle' },
          { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' },
          { kind: 'follow', subject: 'player', azimuthDeg: 32, distM: 15, heightM: 1.1, fov: 44, hud: 'noreticle' },
        ],
        cameraEvery: 3,
        triggers: [T.playerFire(), T.anyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()],
      });
    },
  },

  'modes/frontline_assault': {
    hour: 'day',
    windowS: 85,
    async run(ctx) {
      // the assault-trenches variant (sim/assaultLines.ts AssaultTrenchPlan): cross the nearest carved line
      const plan = await ctx.eval(() => {
        const H = window.__MB.H, D = H.D(), p = H.player();
        const lines = D.world?.heightField?.assaultTrenchLines?.lines || [];
        let best = null;
        for (const line of lines) {
          const s = (p.state.pos.x - line.x) * line.ax + (p.state.pos.z - line.z) * line.az;
          if (!best || Math.abs(s) < Math.abs(best.s)) best = { line, s };
        }
        if (!best) return { lines: lines.length, crossing: null };
        const { line, s } = best;
        const lateral = (p.state.pos.x - line.x) * line.lx + (p.state.pos.z - line.z) * line.lz;
        const t = Math.max(-0.55 * line.halfLengthM, Math.min(0.55 * line.halfLengthM, lateral));
        const dirSign = s <= 0 ? 1 : -1;
        const heading = Math.atan2(line.ax * dirSign, line.az * dirSign);
        return { lines: lines.length, crossing: { x: line.x + line.lx * t, z: line.z + line.lz * t, heading, halfLengthM: line.halfLengthM, playerSideM: Math.round(s) } };
      });
      ctx.log('trenches', JSON.stringify(plan));
      if (!plan.crossing) ctx.note('no trench line found ahead of the player; filming the advance instead');
      if (plan.crossing) {
        // stage the player 55 m short of the trench on the approach line, then drive through it
        await ctx.eval((c) => {
          const H = window.__MB.H, p = H.player();
          H.place(p, c.x - Math.sin(c.heading) * 55, c.z - Math.cos(c.heading) * 55, c.heading);
          window.__MB.trenchTarget = [c.x + Math.sin(c.heading) * 60, c.z + Math.cos(c.heading) * 60];
        }, plan.crossing);
        await ctx.ff(1);
        await ctx.eval(() => window.__MB.setDrive({ to: window.__MB.trenchTarget, arriveM: 6, throttle: 0.85 }));
        ctx.note('player placed 55 m short of the first trench line and driven across it');
      } else {
        await ctx.mb('setDrive', { to: 'nearestEnemy', arriveM: 120, throttle: 0.8 });
      }
      await settle(ctx, 1);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'player', azimuthDeg: 28, distM: 15, heightM: 0.9, fov: 44, headingFrom: 'velocity', hud: 'noreticle' },
          { kind: 'follow', subject: 'player', azimuthDeg: -35, distM: 13, heightM: 1.3, fov: 46, headingFrom: 'velocity', hud: 'noreticle' },
        ],
        cameraEvery: 3,
        everyS: 1.0,
        triggers: [T.anyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()],
      });
    },
  },

  'modes/mars': {
    hour: 'night',
    windowS: 70,
    hud: 'hidden',
    async run(ctx) {
      await ctx.mb('setDrive', { heading: null, to: 'nearestEnemy', arriveM: 150, throttle: 1 });
      await ctx.mb('setOnFrame', `
        const p = H.player(); if (!p || !H.live(p)) return;
        const st = MB.onFrameState; const now = performance.now();
        const air = p.state.grounded === false;
        if (!air && (!st.last || now - st.last > 3200)) { H.tap('selfRight'); st.last = now; st.rising = true; }
        if (air && st.rising && (p.state.verticalSpeed ?? 0) <= 0.5) { st.rising = false; MB.freezeIn(0, { type: 'apex' }); }`);
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'player', azimuthDeg: 35, distM: 17, heightM: 0.5, lookAtHeightM: 2.5, fov: 50, headingFrom: 'velocity', hud: 'hidden' },
          { kind: 'follow', subject: 'player', azimuthDeg: -40, distM: 20, heightM: 0.7, lookAtHeightM: 2.0, fov: 52, headingFrom: 'velocity', hud: 'hidden' },
        ],
        cameraEvery: 3,
        everyS: 1.4,
        triggers: [T.anyFireOnScreen()],
      });
    },
  },

  'modes/juggernaut': {
    hour: 'night',
    windowS: 80,
    storage: { 'cot.game.teams.v1': JSON.stringify({ juggernaut: { juggernautRole: 'boss' } }) },
    async run(ctx) {
      const boss = await ctx.eval(() => { const ms = window.__MB.H.ms(); return ms?.boss ? { id: ms.boss.id, isPlayer: ms.boss.id === window.__MB.H.player()?.id } : null; });
      ctx.log('boss', JSON.stringify(boss));
      if (!boss?.isPlayer) ctx.note(`the boss is ${boss?.id ?? 'unknown'}, not the player`);
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 360 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'boss', azimuthDeg: 26, distM: 19, heightM: 1.0, lookAtHeightM: 2.2, fov: 44, hud: 'noreticle' },
          { kind: 'follow', subject: 'boss', azimuthDeg: -34, distM: 17, heightM: 0.8, lookAtHeightM: 2.2, fov: 46, hud: 'noreticle' },
        ],
        cameraEvery: 4,
        triggers: [T.playerFire(), T.enemyFireOnScreen([35, 90], 400), T.hitOnScreen([30, 70], 300)],
      });
    },
  },

  'modes/infected': {
    hour: 'night',
    windowS: 80,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      // the outbreak opens with four infected far across the map: wait until the horde is on the survivors
      const inf = await ctx.until(() => {
        const H = window.__MB.H, i = H.ms()?.infection, p = H.player();
        if (!i || !p) return null;
        const ours = H.liveTanks().filter((t) => t.team === p.team);
        let closest = Infinity;
        for (const e of H.enemies()) for (const s of ours) closest = Math.min(closest, H.dist(e.state.pos, s.state.pos));
        return i.infected >= 3 && i.survivors >= 2 && closest < 170 ? { ...i, closestM: Math.round(closest) } : null;
      }, { ffStepS: 2, timeoutS: 300, label: 'the infected on the survivors' });
      ctx.log('infection', JSON.stringify(inf));
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'infectedLead', azimuthDeg: 22, distM: 16, heightM: 1.1, fov: 44, headingFrom: 'velocity', hud: 'noreticle' },
          { kind: 'between', from: 'survivorNearInfected', to: 'infectedLead', backM: 10, sideM: 4, heightM: 2.0, lookAtFrac: 0.45, fov: 46, hud: 'noreticle' },
        ],
        cameraEvery: 3,
        triggers: [T.anyFireOnScreen([35, 90], 450), T.hitOnScreen([30, 70], 450), T.killOnScreen()],
      });
    },
  },

  'modes/realistic': {
    hour: 'day',
    windowS: 90,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 450 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 2.5 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' },
          { kind: 'scope', target: 'nearestEnemyClear', zoom: 8, hud: 'full' },
        ],
        cameraEvery: 5,
        triggers: [
          { type: 'tank:destroyed', who: 'player', onscreen: false, delays: [60, 160, 320, 600], burst: true },
          T.playerHit([40, 120]), T.playerFire([35, 80]), T.killOnScreen(),
        ],
      });
    },
  },

  'modes/gun_game': {
    hour: 'sunset',
    windowS: 80,
    async run(ctx) {
      const stage = await ctx.eval(() => window.__MB.H.setWeaponStage(window.__MB.H.player(), 3));
      ctx.log('stage', JSON.stringify(stage));
      ctx.note(`ladder stage set to ${stage?.index ?? '?'} (${stage?.name ?? '?'}) through the mode controller's checkpoint`);
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' },
          { kind: 'chase', target: 'nearestEnemyClear', step: 3, hud: 'full' },
        ],
        cameraEvery: 4,
        triggers: [
          { type: 'shell:hit', who: 'player', onscreen: true, maxDistM: 900, delays: [40, 110, 220, 380], burst: true },
          T.playerFire([35, 70]), T.killOnScreen(),
        ],
      });
    },
  },

  'modes/drone': {
    hour: 'day',
    windowS: 45,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 520 })));
      await settle(ctx, 1.5);
      await ctx.eval(() => window.__MB.H.tap('drone'));
      // steer the FPV drone at the nearest enemy through the touch-aim path (the camera aims, the drone follows)
      await ctx.mb('setOnFrame', `
        const p = H.player(); if (!p || !p.aerial || !p.aerial.active || p.aerial.launching) return;
        const t = H.sel('nearestEnemy'); if (!t) return;
        const cam = D.camera; const dir = H.vec(); cam.getWorldDirection(dir);
        const dx = t.x - cam.position.x, dy = (t.y + 1.2) - cam.position.y, dz = t.z - cam.position.z;
        const yawWant = Math.atan2(dx, dz), pitchWant = Math.atan2(dy, Math.hypot(dx, dz));
        const yawCur = Math.atan2(dir.x, dir.z), pitchCur = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        let ey = yawWant - yawCur; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
        const ep = pitchWant - pitchCur;
        const s = D.input.getSettings().sensitivity || 1;
        D.input.addVirtualAim(-ey / (0.0022 * s) * 0.35, -ep / (0.0022 * s) * 0.35);
        D.input.setVirtualMove(0, 1);
        const d = Math.hypot(dx, dy, dz);
        if (d < 70 && !MB.onFrameState.close) { MB.onFrameState.close = true; MB.burstIn([0, 250, 600, 1000], { type: 'dive', distM: Math.round(d) }); }`);
      await ctx.capture({
        cameras: [{ kind: 'game', hud: 'full' }],
        everyS: 1.0,
        triggers: [T.hitOnScreen([30, 90, 200], 300)],
      });
    },
  },

  'modes/ac130': {
    hour: 'night',
    windowS: 70,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      const air = await ctx.until(() => {
        const p = window.__MB.H.player();
        return p?.aerial?.active ? { kind: p.aerial.kind, y: Math.round(p.aerial.y) } : null;
      }, { timeoutS: 30, label: 'the gunship aloft' });
      ctx.log('aerial', JSON.stringify(air));
      await ctx.eval(() => window.__MB.H.tap('shell2'));
      // lay the gimbal on the enemy nearest the convoy, pan through the touch-aim path; fire when on target
      await ctx.mb('setOnFrame', `
        const p = H.player(); if (!p || !p.aerial || !p.aerial.active) return;
        const t = H.sel('enemyNearConvoy'); if (!t) { D.flags.forceFire = false; return; }
        const cam = D.camera; const dir = H.vec(); cam.getWorldDirection(dir);
        if (dir.y > -0.05) return;
        const gy = H.groundY(cam.position.x + dir.x * 300, cam.position.z + dir.z * 300);
        const k = (cam.position.y - gy) / -dir.y;
        const fx = cam.position.x + dir.x * k, fz = cam.position.z + dir.z * k;
        const fwd = H.vec(dir.x, 0, dir.z).normalize(); const right = H.vec(-fwd.z, 0, fwd.x);
        const ex = t.x + 6 - fx, ez = t.z - fz;
        const along = ex * fwd.x + ez * fwd.z, across = ex * right.x + ez * right.z;
        const zoom = 1; const mpp = 2 * Math.max(50, cam.position.y - gy) * Math.tan((55 / zoom) * Math.PI / 360) / 600;
        const s = D.input.getSettings().sensitivity || 1;
        D.input.addVirtualAim((across / mpp) * 0.3 / s, (-along / mpp) * 0.3 / s);
        D.flags.forceFire = Math.hypot(ex, ez) < 14;`);
      await ctx.capture({
        cameras: [{ kind: 'game', hud: 'full' }],
        everyS: 2.0,
        triggers: [
          { type: 'shell:hit', who: 'player', onscreen: true, maxDistM: 2000, delays: [40, 120, 260], burst: true },
          T.playerFire([30]),
        ],
      });
    },
  },

  // ============================================================== mechanics (battle captures)
  'mechanics/missiles': {
    hour: 'sunset',
    windowS: 80,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 700, minRangeM: 280 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 5 });
      await settle(ctx, 1);
      await ctx.capture({
        cameras: [
          { kind: 'between', from: 'aimTarget', to: 'player', backM: 16, sideM: 9, heightM: 1.6, lookAtFrac: 0.35, fov: 40, smoothS: 0.2, hud: 'hidden' },
          { kind: 'between', from: 'player', to: 'aimTarget', backM: 10, sideM: 7, heightM: 2.4, lookAtFrac: 0.5, fov: 40, smoothS: 0.2, hud: 'hidden' },
        ],
        cameraEvery: 4,
        everyS: 0,
        triggers: [{ type: 'shell:fired', who: 'player', onscreen: false, delays: [120, 500, 900, 1400, 1900, 2400], burst: true }],
      });
    },
  },

  'mechanics/autoloader': {
    hour: 'sunset',
    windowS: 75,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 400 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' },
          { kind: 'chase', target: 'nearestEnemyClear', step: 3, hud: 'full' },
        ],
        cameraEvery: 5,
        everyS: 0,
        triggers: [T.playerFire([30, 55, 90]), T.playerHit([40, 100])],
      });
    },
  },

  'mechanics/thermal': {
    hour: 'night',
    windowS: 80,
    storage: { 'cot.scopeVision': 'infrared' },
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 3 });
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'scope', target: 'nearestEnemyClear', zoom: 8, hud: 'full' },
          { kind: 'scope', target: 'nearestEnemyClear', zoom: 4, hud: 'full' },
        ],
        cameraEvery: 4,
        triggers: [T.playerFire([35, 90]), T.killOnScreen([120, 400, 900], 900), T.playerHit([40, 140])],
      });
    },
  },

  'mechanics/armor': {
    hour: 'day',
    windowS: 60,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 520, minRangeM: 250 })));
      // the armour flashlight is the player's setting (H toggles it; off by default)
      await ctx.eval(() => window.__DEBUG.input.setSetting('armorAimOverlay', true));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'scope', target: 'nearestEnemyClear', zoom: 8, hud: 'full' },
          { kind: 'scope', target: 'nearestEnemyClear', zoom: 4, hud: 'full' },
        ],
        cameraEvery: 5,
        everyS: 1.2,
        triggers: [T.enemyFireOnScreen([35, 90], 900)],
      });
    },
  },

  'mechanics/bots': {
    hour: 'sunset',
    windowS: 80,
    hud: 'hidden',
    storage: { 'cot.game.teams.v1': JSON.stringify({ standard: { allies: 13, enemies: 14 } }) },
    async run(ctx) {
      const span = await ctx.until(() => {
        const c = window.__MB.H.sel('fightCenter');
        return c && c.spanM < 320 ? { spanM: Math.round(c.spanM), x: Math.round(c.x), z: Math.round(c.z) } : null;
      }, { ffStepS: 2, timeoutS: 200, label: 'the lines in contact' });
      ctx.log('fight', JSON.stringify(span));
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'crane', center: 'fightCenter', azimuthDeg: 90, relative: 'subject', distM: 115, heightM: 62, fov: 40, smoothS: 1.2, hud: 'hidden' },
          { kind: 'crane', center: 'fightCenter', azimuthDeg: 135, relative: 'subject', distM: 95, heightM: 48, fov: 42, smoothS: 1.2, hud: 'hidden' },
        ],
        cameraEvery: 6,
        triggers: [T.anyFireOnScreen([35, 90], 450), T.hitOnScreen([30, 80], 450), T.killOnScreen()],
      });
    },
  },

  'mechanics/mobile': {
    hour: 'day',
    windowS: 70,
    emulate: {
      viewport: { width: 880, height: 495, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    },
    preset: null,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [{ kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' }],
        triggers: [T.playerFire([35, 90]), T.enemyFireOnScreen(), T.hitOnScreen()],
      });
    },
  },

  'mechanics/consumables': {
    hour: 'day',
    windowS: 50,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 520, throttle: 0.5 })));
      await settle(ctx, 1);
      const cams = [
        { kind: 'follow', subject: 'player', azimuthDeg: 34, distM: 12, heightM: 1.6, lookAtHeightM: 1.8, fov: 44, hud: 'noreticle' },
        { kind: 'follow', subject: 'player', azimuthDeg: 150, distM: 11, heightM: 2.6, lookAtHeightM: 1.6, fov: 46, hud: 'noreticle' },
      ];
      for (let round = 0; round < 2; round++) {
        await ctx.mb('setCamera', cams[round % cams.length]);
        await ctx.eval(() => window.__MB.H.igniteEngine(window.__MB.H.player(), { modules: ['engine', 'transmission'] }));
        ctx.note('engine fire staged on the player (module state, fire ticks and the tank:fire event a real engine hit produces)');
        await ctx.capture({ windowS: 3.5, everyS: 0.8, max: 5, label: `burning ${round + 1}` });
        await ctx.eval(() => { window.__MB.H.tap('consumable3'); });
        await ctx.mb('burstIn', [60, 220, 450, 800, 1300], { type: 'extinguisher' });
        await ctx.capture({ windowS: 2.5, everyS: 0, max: 5, label: `extinguished ${round + 1}` });
        // a second fire while the extinguisher cools down: the bar shows the cooldown under live flames
        await ctx.eval(() => window.__MB.H.igniteEngine(window.__MB.H.player(), { modules: ['engine'] }));
        await ctx.capture({ windowS: 4, everyS: 0.9, max: 5, label: `cooling ${round + 1}` });
      }
    },
  },

  'mechanics/radio': {
    hour: 'sunset',
    windowS: 30,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 3 });
      await ctx.mb('setCamera', { kind: 'chase', target: 'nearestEnemyClear', step: 2, hud: 'full' });
      // a burning wreck in view: fight until the player's first kill, then keep the camera on the wreck
      const kill = await ctx.until(() => {
        const MB = window.__MB;
        const e = MB.events.slice().reverse().find((x) => x.type === 'tank:destroyed' && x.killerId === MB.H.player()?.id);
        return e ? { id: e.id } : null;
      }, { timeoutS: 45, label: 'a kill for a burning wreck' });
      await ctx.mb('setFire', null);
      if (kill) await ctx.mb('setCamera', { kind: 'chase', target: `entity:${kill.id}`, step: 2, hud: 'full' });
      await ctx.sleep(2500);
      await ctx.mb('setCamera', { kind: 'game' });
      const opened = await openCrewRadio(ctx);
      ctx.log('settings', JSON.stringify(opened));
      await ctx.sleep(600);
      await ctx.snap('settings-crew-radio', { settings: opened });
      await ctx.page.keyboard.press('Escape');
    },
  },

  'mechanics/replays': {
    hour: 'sunset',
    windowS: 40,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 380 })));
      const last = await ctx.eval(() => {
        const H = window.__MB.H;
        const t = H.sel('nearestEnemyClear');
        if (!t) return null;
        H.killExcept([t.id]);
        return { id: t.id, spec: t.specId };
      });
      ctx.log('last enemy', JSON.stringify(last));
      ctx.note('every enemy but the nearest was destroyed through the QA kill; the last falls to a real player shell');
      await ctx.mb('setAim', { target: last ? `entity:${last.id}` : 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 2 });
      await ctx.mb('setCamera', { kind: 'chase', target: last ? `entity:${last.id}` : 'nearestEnemyClear', step: 2, hud: 'full' });
      const ended = await ctx.until(() => {
        const MB = window.__MB;
        return MB.events.some((x) => x.type === 'ending:begin' || x.type === 'battle:ended') ? true : null;
      }, { timeoutS: 60, label: 'the last kill' });
      await ctx.mb('setFire', null);
      await ctx.mb('setCamera', { kind: 'game' });
      if (ended) await ctx.capture({ windowS: 14, everyS: 0.35, max: 40, label: 'ending replay' });
    },
  },

  'features/killcam': {
    hour: 'day',
    windowS: 30,
    battle: { specId: 't90m_x', mapId: 'verdant', gameMode: 'standard' },
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 450 })));
      await settle(ctx, 1);
      const shot = await ctx.eval(() => window.__DEBUG.spawnKillShell());
      ctx.log('kill shell', shot);
      ctx.note('the player was set to 1 HP and a real enemy shell fired into it (__DEBUG.spawnKillShell)');
      await ctx.mb('setCamera', { kind: 'game' });
      await ctx.capture({ windowS: 16, everyS: 0.3, max: 50, label: 'kill cam' });
    },
  },

  'mechanics/crushing': {
    hour: 'day',
    windowS: 60,
    battle: { specId: 'leo2a7v_x', mapId: 'verdant', gameMode: 'standard' },
    hud: 'hidden',
    async run(ctx) {
      const runs = await findCrushRuns(ctx, { kinds: ['fenceplank', 'fencepicket', 'fencewattle', 'fencerail'], treeNearM: 14, maxRuns: 4 });
      ctx.log('crush runs', JSON.stringify(runs.map((r) => ({ kind: r.kind, x: Math.round(r.x), z: Math.round(r.z), tree: r.tree }))));
      if (!runs.length) { ctx.note('no fence run with a tree beside it was found'); return; }
      for (const [i, run] of runs.entries()) {
        await stageRun(ctx, run, 45);
        await ctx.capture({
          windowS: 9, everyS: 0.6, max: 12, label: `crush run ${i + 1} (${run.kind})`,
          cameras: [{ kind: 'follow', subject: 'player', azimuthDeg: i % 2 ? -30 : 30, distM: 13, heightM: 0.9, lookAtHeightM: 1.4, fov: 46, headingFrom: 'velocity', smoothS: 0.25, hud: 'hidden' }],
          triggers: [T.crushOnScreen([30, 90, 180])],
          minGapMs: 250,
        });
      }
      ctx.note('player placed 45 m short of each fence run and driven through it at full throttle');
    },
  },

  'mechanics/map-vehicles': {
    hour: 'day',
    windowS: 60,
    battle: { specId: 't90m_x', mapId: 'urban', gameMode: 'standard' },
    hud: 'hidden',
    async run(ctx) {
      const runs = await findCrushRuns(ctx, { kinds: ['sedan', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed'], treeNearM: 0, maxRuns: 4, vehicles: true });
      ctx.log('vehicle runs', JSON.stringify(runs.map((r) => ({ kind: r.kind, x: Math.round(r.x), z: Math.round(r.z) }))));
      if (!runs.length) { ctx.note('no parked map vehicle was found'); return; }
      for (const [i, run] of runs.entries()) {
        // a round into a parked truck first when one stands near the car (it breaks and burns), then drive over the car
        await stageRun(ctx, run, 40);
        await ctx.capture({
          windowS: 9, everyS: 0.6, max: 12, label: `vehicle run ${i + 1} (${run.kind})`,
          cameras: [{ kind: 'follow', subject: 'player', azimuthDeg: i % 2 ? -28 : 28, distM: 12, heightM: 1.0, lookAtHeightM: 1.3, fov: 46, headingFrom: 'velocity', smoothS: 0.25, hud: 'hidden' }],
          triggers: [T.crushOnScreen([30, 90, 180, 320])],
          minGapMs: 250,
        });
      }
      ctx.note('player placed 40 m short of each parked vehicle and driven over it');
    },
  },
};

// ------------------------------------------------------------------------------------------------ helpers
/** Fence runs (or parked vehicles) the player can be driven through: the record, a tree near it, an approach line. */
async function findCrushRuns(ctx, { kinds, treeNearM = 14, maxRuns = 4, vehicles = false }) {
  return ctx.eval((cfg) => {
    const H = window.__MB.H, D = H.D(), p = H.player();
    const obstacles = D.world.getObstacles?.() || [];
    const trees = obstacles.filter((o) => o.kind === 'tree' && !o.crushed && !o.dead);
    const found = [];
    const enemyX = H.enemies().reduce((a, t) => a + t.state.pos.x, 0) / Math.max(1, H.enemies().length);
    const enemyZ = H.enemies().reduce((a, t) => a + t.state.pos.z, 0) / Math.max(1, H.enemies().length);
    for (const o of obstacles) {
      if (!cfg.kinds.includes(o.kind) || o.crushed || o.dead) continue;
      const x = (o.min[0] + o.max[0]) / 2, z = (o.min[2] + o.max[2]) / 2;
      // stay well away from the enemy side so the run is not interrupted by a fight
      if (Math.hypot(x - enemyX, z - enemyZ) < 350) continue;
      if (Math.abs(x) > 440 || Math.abs(z) > 440) continue;
      let tree = null;
      if (cfg.treeNearM > 0) {
        for (const t of trees) {
          const tx = (t.min[0] + t.max[0]) / 2, tz = (t.min[2] + t.max[2]) / 2;
          const d = Math.hypot(tx - x, tz - z);
          if (d < cfg.treeNearM && (!tree || d < tree.d)) tree = { x: tx, z: tz, d, h: t.max[1] - t.min[1] };
        }
        if (!tree) continue;
      }
      // the approach crosses the record's long axis (a fence) or runs along a vehicle's length
      const sx = o.max[0] - o.min[0], sz = o.max[2] - o.min[2];
      const yaw = cfg.vehicles ? (sx > sz ? Math.PI / 2 : 0) : (sx > sz ? 0 : Math.PI / 2);
      // aim through the fence toward the tree side when there is one
      let heading = yaw;
      if (tree) { const toTree = Math.atan2(tree.x - x, tree.z - z); if (Math.cos(toTree - heading) < 0) heading += Math.PI; }
      const sx0 = x - Math.sin(heading) * 45, sz0 = z - Math.cos(heading) * 45;
      const slope = Math.abs(H.groundY(sx0, sz0) - H.groundY(x, z));
      if (slope > 6) continue;
      // nothing solid on the approach line apart from crushables
      let blocked = false;
      for (const q of obstacles) {
        if (q === o || q.crushable || q.crushed || q.dead || q.kind === 'tree') continue;
        const qx = (q.min[0] + q.max[0]) / 2, qz = (q.min[2] + q.max[2]) / 2;
        const ux = Math.sin(heading), uz = Math.cos(heading);
        const along = (qx - sx0) * ux + (qz - sz0) * uz, across = Math.abs((qx - sx0) * uz - (qz - sz0) * ux);
        if (along > 0 && along < 70 && across < 4.5) { blocked = true; break; }
      }
      if (blocked) continue;
      found.push({ kind: o.kind, x, z, heading, tree: tree ? { d: Math.round(tree.d), h: Math.round(tree.h) } : null,
        distFromPlayer: Math.round(Math.hypot(x - p.state.pos.x, z - p.state.pos.z)) });
    }
    found.sort((a, b) => a.distFromPlayer - b.distFromPlayer);
    const picked = [];
    for (const f of found) {
      if (picked.every((q) => Math.hypot(q.x - f.x, q.z - f.z) > 60)) picked.push(f);
      if (picked.length >= cfg.maxRuns) break;
    }
    return picked;
  }, { kinds, treeNearM, maxRuns, vehicles });
}

/** Place the player `backM` short of a run and drive it through at full throttle. */
async function stageRun(ctx, run, backM) {
  await ctx.eval((r, back) => {
    const H = window.__MB.H, p = H.player();
    H.place(p, r.x - Math.sin(r.heading) * back, r.z - Math.cos(r.heading) * back, r.heading);
    window.__MB.runTarget = [r.x + Math.sin(r.heading) * 40, r.z + Math.cos(r.heading) * 40];
  }, run, backM);
  await ctx.ff(0.6);
  await ctx.eval(() => window.__MB.setDrive({ to: window.__MB.runTarget, arriveM: 5, throttle: 1 }));
  await ctx.sleep(400);
}

/** Pause the battle through Settings (Esc), open the Sound tab and expand the crew-voice select. */
async function openCrewRadio(ctx) {
  const page = ctx.page;
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cot-set.open', { timeout: 8000 }).catch(() => null);
  const result = await page.evaluate(() => {
    const out = { open: !!document.querySelector('.cot-set.open') };
    const tabs = [...document.querySelectorAll('.cot-set [role=tab], .cot-set .tabs button, .cot-set nav button')];
    const sound = tabs.find((b) => /sound|audio/i.test(b.textContent || '') || /sound|audio/i.test(b.dataset?.tab || ''));
    if (sound) { sound.click(); out.tab = sound.textContent.trim(); }
    out.tabs = tabs.map((b) => (b.textContent || '').trim()).slice(0, 12);
    return out;
  });
  await ctx.sleep(400);
  const select = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.cot-set label, .cot-set .row, .cot-set .setting')];
    const row = labels.find((l) => /crew/i.test(l.textContent || ''));
    if (!row) return { found: false };
    row.scrollIntoView({ block: 'center' });
    const trigger = row.querySelector('.menu-select-trigger, button[aria-haspopup], select');
    if (trigger && trigger.tagName !== 'SELECT') { trigger.click(); return { found: true, kind: 'menu', text: row.textContent.trim().slice(0, 80) }; }
    return { found: true, kind: trigger ? 'select' : 'none', text: row.textContent.trim().slice(0, 80) };
  });
  return { ...result, select };
}

// ================================================================================================ UI and multi-page slots
// These run as `custom` recipes inside the same capture-lock holds as the battles: the recipe drives the page itself.

/** Boot the Garage and stage a vehicle on a Garage variant (the capture-showcase-r2-ui.mjs garage flow). */
async function openGarage(ctx, { variantId, vehicleId }) {
  const page = ctx.page;
  await page.goto(`${ctx.baseUrl}/?nosplash=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__GARAGE_WORKSHOP && window.__DEBUG, { timeout: 240000, polling: 250 });
  await page.waitForFunction(() => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return stats.architecture?.ready === true && stats.architecture.presented === true;
  }, { timeout: 120000, polling: 250 });
  await page.waitForFunction(() => window.__GARAGE_WORKSHOP.stats().built === true, { timeout: 90000 })
    .catch(() => ctx.note('garage workshop dressing did not finish before the capture'));
  await page.evaluate(async ({ variantId, vehicleId }) => {
    window.__DEBUG.selectGarageTank(vehicleId);
    await window.__DEBUG.stagePedestalTank(vehicleId);
    window.__GARAGE_WORKSHOP.set(variantId);
  }, { variantId, vehicleId });
  await page.waitForFunction(({ variantId, vehicleId }) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return window.__DEBUG.selectedSpecId === vehicleId && stats.selected === variantId
      && stats.architecture?.ready === true && stats.architecture.presented === true;
  }, { timeout: 90000, polling: 250 }, { variantId, vehicleId });
  await page.waitForFunction(() => window.__GARAGE_WORKSHOP.stats().built === true, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await ctx.sleep(2500);
}

/** The Tank Gallery on a vehicle and layer, framed from its hero (elevated front-left) view. */
async function openGallery(ctx, { vehicleId, layer, view = 'hero' }) {
  const page = ctx.page;
  await page.goto(`${ctx.baseUrl}/gallery?id=${vehicleId}&layer=${layer}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__TANK_GALLERY?.ready === true, { timeout: 240000, polling: 250 });
  await page.evaluate(async (args) => {
    await window.__TANK_GALLERY.loadTank(args.vehicleId, { mode: args.layer, view: args.view });
    window.__TANK_GALLERY.frameView(args.view);
  }, { vehicleId, layer, view });
  await page.waitForFunction((args) => {
    const state = window.__TANK_GALLERY.getState();
    return state.selectedId === args.vehicleId && state.mode === args.layer;
  }, { timeout: 60000 }, { vehicleId, layer });
  await page.evaluate(() => document.fonts.ready);
  await ctx.sleep(2500);
}

/** Scene Studio with its Director workspace showing and the site's takes listed. */
async function openStudio(ctx, { map = null } = {}) {
  const page = ctx.page;
  await page.goto(`${ctx.baseUrl}/?studio=1&nogate=1${map ? `&map=${map}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__STUDIO?.active === true, { timeout: 240000, polling: 250 });
  await page.evaluate(() => {
    window.__STUDIO.setRailVisible?.(true);
    document.querySelector('[data-workspace="director"]')?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-site-take]').length > 0, { timeout: 60000 })
    .catch(() => ctx.note('the Director workspace did not list the site takes'));
  await page.evaluate(() => document.fonts.ready);
}

/** The site's s36 barn knockout (a Type 10 knocks out a T-90M on Frontier Basin), actors named for the landing
 *  contract: the hero is the shooter and foe0 the victim; golden hour. */
async function studioLoopScene(root) {
  const { readFileSync } = await import('node:fs');
  const scene = JSON.parse(readFileSync(`${root}/public/media/site50-r14/scenes/s36-barn-knockout.scene.json`, 'utf8'));
  const rename = { hero: 'shooter', foe0: 'victim' };
  const swap = (name) => rename[name] || name;
  for (const actor of scene.actors) actor.name = swap(actor.name);
  for (const effect of scene.effects) if (effect.actor) effect.actor = swap(effect.actor);
  for (const track of scene.storyboard?.actorTracks || []) if (track.actor) track.actor = swap(track.actor);
  if (scene.camera?.target) scene.camera.target = swap(scene.camera.target);
  scene.timeOfDay = 'golden';
  delete scene.still;
  delete scene.stillsExtra;
  return scene;
}

function serviceRecordSeed() {
  const at = Date.UTC(2026, 9, 11, 19);
  const medal = (count, daysAgo) => ({ count, first: at - daysAgo * 86400000, last: at - 3600000 });
  const medals = {
    chain_of_thought: medal(14, 30), step_by_step: medal(9, 26), zero_shot: medal(6, 21), few_shot: medal(11, 28),
    first_blood: medal(41, 40), ace_gunner: medal(7, 18), high_caliber: medal(12, 33), sharpshooter: medal(19, 35),
    long_shot: medal(8, 19), one_shot: medal(5, 12), detonator: medal(9, 22), steel_wall: medal(13, 29),
    close_call: medal(6, 15), eagle_eye: medal(10, 25), flag_runner: medal(4, 9), wave_breaker: medal(3, 6),
    gunship_ace: medal(2, 4), drone_ace: medal(3, 5),
  };
  const history = [{
    id: 'home-r2-battle', at, vehicleId: 'leo2a7v_x', mapId: 'verdant', mode: 'standard', result: 'victory', durationS: 342,
    kills: 5, damage: 9120, shots: 11, hits: 9, bestChain: 4, medals: ['chain_of_thought', 'step_by_step', 'ace_gunner'], achievements: [],
    trace: [{ t: 31, specId: 't90m_x', distM: 820, cause: 'shot' }, { t: 37, specId: 't72b3m_x', distM: 610, cause: 'ammorack' },
      { t: 44, specId: 'ztz99a2', distM: 455, cause: 'shot' }],
  }];
  return {
    'cot.service.v1': JSON.stringify({ version: 1, medals,
      stats: { battles: 212, wins: 131, kills: 688, damage: 812450, bestChain: 6, bestStreak: 11, bestKills: 10, longestKillM: 1460 },
      achievements: { chain_thinker: { tier: 2, at } }, unseen: [], history }),
    'cot.profile.v2': JSON.stringify({ version: 2, matches: 212, wins: 131, losses: 78, draws: 3, kills: 688, damage: 812450, bestDamage: 15230 }),
  };
}

Object.assign(RECIPES, {
  'features/garage': {
    windowS: 50,
    battle: { specId: 'kf51_x' },
    storage: {
      'cot.camo.kf51_x': 'flecktarn',
      'cot.equip.kf51_x': JSON.stringify(['rammer', 'optics', 'spall_liner']),
      'cot.garage.variant': 'verdant_motor_pool',
    },
    async custom(ctx) {
      await openGarage(ctx, { variantId: 'verdant_motor_pool', vehicleId: 'kf51_x' });
      await ctx.snap('garage as staged');
      const tab = await ctx.eval(() => {
        const tabs = [...document.querySelectorAll('[data-technical-view]')];
        const armor = tabs.find((b) => b.dataset.technicalLayer === 'armor') || tabs.find((b) => /armou?r/i.test(b.textContent || ''));
        if (armor) armor.click();
        return { tabs: tabs.map((b) => `${b.dataset.technicalView}:${b.dataset.technicalLayer}:${(b.textContent || '').trim()}`), clicked: armor?.dataset.technicalView ?? null };
      });
      ctx.log('technical tabs', JSON.stringify(tab));
      await ctx.sleep(1200);
      await ctx.snap('garage dossier armor tab', { tabs: tab });
      const loadout = await ctx.eval(() => [...document.querySelectorAll('.eqslot')].map((e) => (e.textContent || '').trim()));
      ctx.log('loadout', JSON.stringify(loadout));
    },
  },

  'mechanics/equipment': {
    windowS: 50,
    battle: { specId: 'k2_x' },
    storage: {
      'cot.equip.k2_x': JSON.stringify(['vstab', 'binoculars']),
      'cot.garage.variant': 'urban_arsenal',
    },
    async custom(ctx) {
      await openGarage(ctx, { variantId: 'urban_arsenal', vehicleId: 'k2_x' });
      const opened = await ctx.page.click('.eqslot[data-slot="2"]').then(() => true).catch(() => false);
      await ctx.page.waitForSelector('.cot-eqpick.open', { timeout: 8000 }).catch(() => ctx.note('the equipment picker did not open'));
      await ctx.sleep(800);
      await ctx.snap('equipment picker on slot 3', { opened });
      for (const cat of ['survival', 'recon', 'mobility']) {
        const chip = await ctx.page.$(`.cot-eqpick .chip[data-cat="${cat}"]`);
        if (!chip) continue;
        await chip.click();
        await ctx.sleep(500);
        const tile = await ctx.page.$('.cot-eqpick .cot-eqtile:not(.remove)');
        if (tile) { await tile.hover(); await ctx.sleep(900); }
        await ctx.snap(`equipment picker ${cat} with a tile hovered`);
      }
    },
  },

  'mechanics/modules': {
    windowS: 40,
    battle: { specId: 'merkava4_barak' },
    async custom(ctx) {
      await openGallery(ctx, { vehicleId: 'merkava4_barak', layer: 'modules' });
      await ctx.snap('gallery modules hero');
      await ctx.eval(() => window.__TANK_GALLERY.frameView('elevated-left'));
      await ctx.sleep(1500);
      await ctx.snap('gallery modules elevated-left');
    },
  },

  'mechanics/dossiers': {
    windowS: 40,
    battle: { specId: 'challenger_3x' },
    async custom(ctx) {
      await openGallery(ctx, { vehicleId: 'challenger_3x', layer: 'armor' });
      await ctx.snap('gallery armor hero');
      await ctx.eval(() => window.__TANK_GALLERY.frameView('elevated-left'));
      await ctx.sleep(1500);
      await ctx.snap('gallery armor elevated-left');
    },
  },

  'mechanics/medals': {
    windowS: 40,
    battle: { specId: 'leo2a7v_x' },
    storage: serviceRecordSeed(),
    async custom(ctx) {
      await openGarage(ctx, { variantId: 'verdant_motor_pool', vehicleId: 'leo2a7v_x' });
      await ctx.page.click('.cot-record-trigger').catch(() => ctx.note('no Service Record trigger'));
      await ctx.page.waitForSelector('.cot-service-record.is-open', { timeout: 10000 }).catch(() => ctx.note('the Service Record did not open'));
      await ctx.page.click('[data-record-tab="medals"]').catch(() => ctx.note('no medals tab'));
      await ctx.sleep(900);
      await ctx.snap('service record medals');
    },
  },

  'mechanics/presets': {
    windowS: 60,
    battle: { specId: 't90m_x' },
    async custom(ctx) {
      await openStudio(ctx);
      await ctx.snap('studio director as opened');
      const loaded = await ctx.eval(async () => {
        const card = document.querySelector('[data-site-take="s21-fields-assault"]');
        if (!card) return { card: false };
        card.scrollIntoView({ block: 'center' });
        card.click();
        for (let i = 0; i < 240 && card.getAttribute('aria-pressed') !== 'true'; i++) await new Promise((r) => setTimeout(r, 250));
        return { card: true, pressed: card.getAttribute('aria-pressed') };
      });
      ctx.log('take', JSON.stringify(loaded));
      await ctx.sleep(2500);
      // the take's explosions land at 0.95, 2.1 and 4.6 s; hold the viewport just after each
      for (const tMs of [1050, 2250, 4200, 4750]) {
        await ctx.eval((t) => { window.__STUDIO.pause?.(); window.__STUDIO.seek(t); }, tMs);
        await ctx.sleep(1200);
        await ctx.snap(`studio s21 at ${tMs} ms`, { seekMs: tMs });
      }
    },
  },

  'features/studio': {
    windowS: 70,
    battle: { specId: 'type10_x' },
    async custom(ctx) {
      const { writeFileSync, mkdirSync, statSync } = await import('node:fs');
      const { join, resolve } = await import('node:path');
      const root = process.cwd();
      const out = resolve(root, 'shots/media-r5/home-r2/studio-loop');
      mkdirSync(out, { recursive: true });
      const scene = await studioLoopScene(root);
      writeFileSync(join(out, 'scene.json'), `${JSON.stringify(scene, null, 1)}\n`);
      await ctx.page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await openStudio(ctx, { map: scene.map });
      const staged = await ctx.eval(async (input) => {
        const S = window.__STUDIO;
        await S.load(input);
        S.setRailVisible?.(true);
        document.querySelector('[data-workspace="director"]')?.click();
        S.pause?.();
        S.seek(0);
        const board = S.getStoryboard();
        return { durationMs: board.durationMs, shots: board.shots.length, actors: S.listActors().map((a) => ({ id: a.id, name: a.name })) };
      }, scene);
      ctx.log('studio loop staged', JSON.stringify(staged));
      await ctx.sleep(2500);
      const master = join(out, 'studio-knockout.webm');
      const recorder = await ctx.page.screencast({ path: master, fps: 30, quality: 24, ffmpegPath: '/opt/homebrew/bin/ffmpeg' });
      await ctx.eval(() => window.__STUDIO.play());
      await ctx.page.waitForFunction('window.__STUDIO.playing === false && window.__STUDIO.fxTimeMs >= window.__STUDIO.durationMs - 1', { timeout: 40000 })
        .catch(() => ctx.note('the Studio loop did not report its end'));
      await ctx.sleep(300);
      await recorder.stop();
      const bytes = statSync(master).size;
      const manifest = {
        version: 1, renderer: { width: 1920, height: 1080, fps: 30 }, scene: 'scene.json',
        source: '/media/site50-r14/scenes/s36-barn-knockout.scene.json (hero -> shooter, foe0 -> victim, golden hour)',
        master: 'studio-knockout.webm', durationMs: staged.durationMs, mimeType: 'video/webm', bytes,
        captureMode: 'studio-ui', workspace: 'director',
        actors: scene.actors.map(({ id, name }) => ({ id, name })),
        effects: scene.effects.map(({ type, actor, tMs }) => ({ type, actor: actor || null, tMs })),
      };
      writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      await ctx.eval(() => { window.__STUDIO.pause?.(); window.__STUDIO.seek(2150); });
      await ctx.sleep(1200);
      await ctx.snap('studio loop poster at 2150 ms');
      ctx.log(`studio loop ${bytes} bytes -> ${master}`);
      ctx.note(`studio loop recorded to ${out} (deliver as features/studio.webm + studio.json after review)`);
    },
  },
});

// ================================================================================================ spotting
Object.assign(RECIPES, {
  'mechanics/spotting': {
    hour: 'sunset',
    windowS: 50,
    async run(ctx) {
      // a bush on the player's side with an open sight line ~300 m toward the enemy, preferring a seat above the column
      const plan = await ctx.eval(() => {
        const H = window.__MB.H, D = H.D(), p = H.player();
        const discs = (D.world.getConcealment?.() || []).filter((c) => !c.dead && c.r >= 1.5 && c.r <= 9);
        const enemies = H.enemies();
        const ex = enemies.reduce((a, t) => a + t.state.pos.x, 0) / Math.max(1, enemies.length);
        const ez = enemies.reduce((a, t) => a + t.state.pos.z, 0) / Math.max(1, enemies.length);
        const toEnemy = Math.atan2(ex - p.state.pos.x, ez - p.state.pos.z);
        const canopyOnLine = (sx, sz, px, pz, skip) => {
          const dx = px - sx, dz = pz - sz, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
          for (const q of discs) {
            if (q === skip) continue;
            const wx = q.x - sx, wz = q.z - sz, along = wx * ux + wz * uz, across = Math.abs(wx * uz - wz * ux);
            if (along > 12 && along < len - 10 && across < q.r + 1) return true;
          }
          return false;
        };
        let best = null;
        for (const c of discs) {
          if (H.dist(c, p.state.pos) > 240) continue;
          const sx = c.x + Math.sin(toEnemy) * c.r * 0.3, sz = c.z + Math.cos(toEnemy) * c.r * 0.3;
          if (Math.abs(sx) > 430 || Math.abs(sz) > 430) continue;
          const sy = H.groundY(sx, sz);
          for (const dist of [300, 270, 330, 240, 360]) {
            for (const lateral of [0, 45, -45, 90, -90]) {
              const px = sx + Math.sin(toEnemy) * dist + Math.cos(toEnemy) * lateral;
              const pz = sz + Math.cos(toEnemy) * dist - Math.sin(toEnemy) * lateral;
              if (Math.abs(px) > 430 || Math.abs(pz) > 430) continue;
              const py = H.groundY(px, pz);
              if (H.raycastBlock({ x: sx, y: sy + 2.6, z: sz }, { x: px, y: py + 1.6, z: pz }, 3) != null) continue;
              if (canopyOnLine(sx, sz, px, pz, c)) continue;
              const score = (sy - py) * 0.6 - Math.abs(dist - 300) / 40 - Math.abs(lateral) / 60;
              if (!best || score > best.score) best = { seat: { x: sx, z: sz, r: c.r }, column: { x: px, z: pz }, score, riseM: Math.round(sy - py), dist, lateral };
            }
          }
        }
        return best;
      });
      ctx.log('spotting plan', JSON.stringify(plan));
      if (!plan) { ctx.note('no bush with an open sight line was found; the slot falls back to a contact frame'); }
      else {
        await ctx.eval((pl) => {
          const H = window.__MB.H, p = H.player();
          const yaw = Math.atan2(pl.column.x - pl.seat.x, pl.column.z - pl.seat.z);
          H.place(p, pl.seat.x, pl.seat.z, yaw);
          const crossing = yaw + Math.PI / 2;
          const column = H.enemies().sort((a, b) => H.dist(a.state.pos, pl.column) - H.dist(b.state.pos, pl.column)).slice(0, 3);
          column.forEach((t, i) => {
            H.place(t, pl.column.x - Math.sin(crossing) * i * 17, pl.column.z - Math.cos(crossing) * i * 17, crossing);
            t.aiCtl = null; t.input.throttle = 0.45; t.input.steer = 0; t.input.brake = false; t.input.fire = false;
          });
          window.__MB.columnIds = column.map((t) => t.id);
        }, plan);
        await ctx.mb('defineSelector', 'columnLead', 'const id = (window.__MB.columnIds || [])[1] || (window.__MB.columnIds || [])[0]; return id ? H.info(g.tankById.get(id)) : null;');
        ctx.note('player placed in a bush facing the enemy side; three enemy bots placed as a column crossing ~300 m below with their AI paused (driving straight)');
        const spotted = await ctx.until(() => {
          const D = window.__DEBUG, ids = window.__MB.columnIds || [];
          const team = D.game.player?.team;
          return ids.filter((id) => D.game.spotting?.isSpotted?.(id, team)).length || null;
        }, { timeoutS: 20, label: 'the column spotted' });
        ctx.log('spotted', spotted);
      }
      await ctx.capture({
        cameras: [
          { kind: 'between', from: 'player', to: plan ? 'columnLead' : 'nearestEnemy', backM: 8, sideM: 3, heightM: 2.0, lookAtFrac: 0.8, fov: 38, hud: 'noreticle' },
          { kind: 'between', from: 'player', to: plan ? 'columnLead' : 'nearestEnemy', backM: 6, sideM: -2.5, heightM: 1.4, lookAtFrac: 0.85, fov: 34, hud: 'noreticle' },
          { kind: 'chase', target: plan ? 'columnLead' : 'nearestEnemy', step: 2, hud: 'full' },
        ],
        cameraEvery: 3,
        everyS: 1.1,
        triggers: [{ type: 'tank:spotted', who: 'any', onscreen: false, delays: [120, 400] }],
      });
    },
  },
});

// ================================================================================================ the two-client room
/** Open one client in its own browser context (own storage), director installed, focus pinned (two live pages). */
async function openClient(ctx, { tank, name }) {
  const context = await ctx.browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((seed) => {
    try { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); } catch { /* defaults */ }
    // two battles render at once in one headless Chrome: each page counts as focused (the frame loop pauses unfocused pages)
    Document.prototype.hasFocus = function hasFocus() { return true; };
  }, { 'cot.lastTank.v1': tank, 'cot.gfxPreset': 'ultra', 'cot.locale': 'en-US', 'cot.player.name.v1': name, 'cot.battle.times.v2': '["sunset"]' });
  await page.evaluateOnNewDocument(ctx.installDirector);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
  return { context, page, errors };
}

/** Set a lobby menu-select (map, vehicle, team, size) the way tools/mp-p2p-e2e.mjs does. */
const setLobby = (page, control, value) => page.evaluate((c, v) => {
  const el = document.querySelector(`.cot-play [data-control="${c}"]`);
  if (!el) return `no ${c} control`;
  if (el.value !== v) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
  return el.value;
}, control, value);

Object.assign(RECIPES, {
  'features/multiplayer': {
    windowS: 200,
    battle: { specId: 'challenger_3x' },
    async custom(ctx) {
      if (!ctx.rooms) { ctx.note('the multiplayer slot needs a run started with --rooms-double'); return; }
      const { spawnSync } = await import('node:child_process');
      const { writeFileSync, appendFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const A = await openClient(ctx, { tank: 'challenger_3x', name: 'Alpha Lead' });
      const B = await openClient(ctx, { tank: 't90m_x', name: 'Bravo Lead' });
      try {
        const ready = () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage';
        await A.page.goto(`${ctx.baseUrl}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await A.page.waitForFunction(ready, { timeout: 240000, polling: 250 });
        await A.page.click('.cot-multiplayer-entry');
        await A.page.waitForFunction(() => document.querySelector('.cot-play')?.classList.contains('show'), { timeout: 30000 });
        await A.page.click('.cot-play .modes [data-mode="lan"]');
        await A.page.waitForFunction(() => document.querySelector('.cot-play .modes [data-mode="lan"]')?.classList.contains('on'), { timeout: 10000 });
        await A.page.evaluate(() => {
          const size = document.querySelector('.cot-play [data-field="create-size"]');
          if (size) size.value = '1';
        });
        await A.page.click('.cot-play [data-action="create"]');
        await A.page.waitForFunction(() => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), { timeout: 30000 });
        const invite = new URL(await A.page.evaluate(() => location.href));
        invite.searchParams.set('nosplash', '1');
        invite.searchParams.set('tier', 'desktop');
        ctx.log('room', invite.searchParams.get('room'));
        ctx.log('host lobby', await setLobby(A.page, 'map', 'verdant'), await setLobby(A.page, 'vehicle', 'challenger_3x'), await setLobby(A.page, 'team', 'alpha'));
        await B.page.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await B.page.waitForFunction(ready, { timeout: 240000, polling: 250 });
        await B.page.waitForFunction(() => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2, { timeout: 60000 });
        ctx.log('guest lobby', await setLobby(B.page, 'team', 'bravo'), await setLobby(B.page, 'vehicle', 't90m_x'));
        await ctx.sleep(800);
        await B.page.click('.cot-play [data-action="ready"]');
        await A.page.click('.cot-play [data-action="ready"]');
        await A.page.waitForFunction(() => !document.querySelector('.cot-play [data-action="start"]')?.disabled, { timeout: 30000 });
        await A.page.click('.cot-play [data-action="start"]');
        const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle'
          && getComputedStyle(document.querySelector('.cot-bl')).display === 'none';
        await Promise.all([A.page.waitForFunction(inBattle, { timeout: 240000, polling: 250 }), B.page.waitForFunction(inBattle, { timeout: 240000, polling: 250 })]);
        for (const client of [A, B]) {
          await client.page.evaluate(async () => {
            const D = window.__DEBUG;
            D.post?.pinDynScale?.(1); D.post?.resetPerfTrims?.(); D.post?.setAdaptiveSuspended?.(true);
            window.__MB.attach();
            window.__MB.setHud('full');
            try { await window.__SHOTS.battleTime('sunset'); } catch { /* the match's own hour stays */ }
          });
        }
        const sides = await Promise.all([A, B].map((c) => c.page.evaluate(() => {
          const g = window.__DEBUG.game;
          return { me: g.player?.specId, team: g.player?.team, tanks: g.tanks.map((t) => `${t.specId}:${t.team}`) };
        })));
        ctx.log('seated', JSON.stringify(sides));
        // close the distance: both drive at each other until the other is within ~330 m (spotted, so drawn)
        for (const c of [A, B]) await c.page.evaluate(() => window.__MB.setDrive({ to: 'nearestEnemy', arriveM: 330, throttle: 1 }));
        for (let i = 0; i < 70; i++) {
          const d = await A.page.evaluate(() => { const H = window.__MB.H, p = H.player(), e = H.sel('nearestEnemy'); return p && e ? Math.round(H.dist(p.state.pos, e)) : null; });
          if (d != null && d < 340) break;
          await ctx.sleep(500);
        }
        for (const c of [A, B]) {
          await c.page.evaluate(() => {
            window.__MB.setDrive(null);
            window.__MB.setAim({ target: 'nearestEnemy' });
            window.__MB.setCamera({ kind: 'scope', target: 'nearestEnemy', zoom: 8 });
          });
        }
        await ctx.sleep(2500);
        // rounds: one side fires; both pages freeze together a beat after the shot and are captured as a pair
        const dir = ctx.dir;
        for (let round = 0; round < 8; round++) {
          const shooter = round % 2 === 0 ? A : B, other = shooter === A ? B : A;
          const delay = [70, 140, 220][round % 3];
          await shooter.page.evaluate((d) => {
            window.__MB.setFire({ mode: 'once', maxErrMrad: 4 });
            window.__MB.arm({ triggers: [{ type: 'shell:fired', who: 'player', onscreen: false, delays: [d] }], periodicMs: 0 });
          }, delay);
          let frozen = false;
          for (let w = 0; w < 120 && !frozen; w++) { frozen = (await shooter.page.evaluate(() => window.__MB.poll())).frozen; if (!frozen) await ctx.sleep(50); }
          if (!frozen) {
            // no shot event reached this page within 6 s: take the pair as it stands
            ctx.note(`round ${round + 1}: no shot within 6 s; paired frame without a shot`);
            await shooter.page.evaluate(() => { window.__MB.arm(null); window.__MB.freezeIn(0, { type: 'pair-noshot' }); });
            for (let w = 0; w < 40 && !(await shooter.page.evaluate(() => window.__MB.poll())).frozen; w++) await ctx.sleep(25);
          }
          await other.page.evaluate(() => window.__MB.freezeIn(0, { type: 'pair' }));
          for (let w = 0; w < 40 && !(await other.page.evaluate(() => window.__MB.poll())).frozen; w++) await ctx.sleep(25);
          const k = ctx.bump();
          const files = { a: `pair${String(k).padStart(3, '0')}-a.png`, b: `pair${String(k).padStart(3, '0')}-b.png` };
          await Promise.all([A.page.screenshot({ path: join(dir, files.a), type: 'png' }), B.page.screenshot({ path: join(dir, files.b), type: 'png' })]);
          // the 24:7 band: full-height halves (all of each HUD) and a tighter centre pair around the targets
          const out = `c${String(k).padStart(3, '0')}.png`;
          spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, files.a), '-i', join(dir, files.b), '-filter_complex',
            '[0]crop=3703:2160:68:0[a];[1]crop=3703:2160:68:0[b];[a][b]hstack', join(dir, out)]);
          spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, files.a), '-i', join(dir, files.b), '-filter_complex',
            '[0]crop=2400:1400:720:380[a];[1]crop=2400:1400:720:380[b];[a][b]hstack', join(dir, out.replace('.png', '-tight.png'))]);
          appendFileSync(join(dir, 'meta.jsonl'), `${JSON.stringify({ n: k, file: out, label: `pair round ${round + 1}`, reason: { type: 'pair', shooter: shooter === A ? 'A' : 'B', delayMs: delay }, pair: files })}\n`);
          for (const c of [A, B]) await c.page.evaluate(() => { window.__MB.arm(null); window.__MB.resume(); window.__MB.setFire(null); });
          await ctx.sleep(1200);
        }
        ctx.note('two clients of one LAN room through the room double (A host alpha Challenger 3, B bravo T-90M); hour: the battle presets of __SHOTS.battleTime("sunset") on both');
      } finally {
        if (A.errors.length || B.errors.length) ctx.note(`client errors: ${[...A.errors, ...B.errors].slice(0, 4).join(' | ')}`);
        await A.context.close().catch(() => {});
        await B.context.close().catch(() => {});
      }
    },
  },
});

export function recipeFor(slot) { return RECIPES[slot] || null; }
