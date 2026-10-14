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
/**
 * Contact across open ground. The player holds while the lines close (fast-forwarded, nothing drawn) until an enemy
 * stands in range on a lane nothing hides (terrain, props or foliage: H.laneClear); failing that within `maxS`, the
 * engagement is staged (H.stageEngagement): the nearest enemies (their AI kept) move onto surveyed open lanes in
 * front of the player, from its spot or an open one near it, and two allies take the ground beside it. The first
 * r14 run drove the player at the nearest enemy and parked it against a Verdant tree line with nothing in sight.
 */
async function toContact(ctx, { rangeM = 450, maxS = 40, stepS = 2, minRangeM = 0, stage = true, enemies = 2, allies = 2, dists } = {}) {
  const natural = await ctx.until((cfg) => {
    const H = window.__MB.H, p = H.player();
    if (!p || !H.live(p)) return { dead: true };
    const discs = H.concealers();
    const eye = H.turretPoint(p);
    const list = H.enemies().sort((a, b) => H.dist(a.state.pos, p.state.pos) - H.dist(b.state.pos, p.state.pos));
    for (const t of list.slice(0, 6)) {
      const d = H.dist(t.state.pos, p.state.pos);
      if (d < cfg.rangeM && d > cfg.minRangeM && H.laneClear(eye, t.state.pos, t.spec?.dims?.heightM ?? 2.4, discs)) {
        return { id: t.id, spec: t.specId, d: Math.round(d), natural: true };
      }
    }
    return null;
  }, { ffStepS: stepS, timeoutS: maxS, label: 'natural contact', args: [{ rangeM, minRangeM }] });
  if (natural || !stage) return natural;
  const staged = await ctx.eval((cfg) => window.__MB.H.stageEngagement(cfg),
    { enemies, allies, ...(dists ? { dists } : {}) });
  ctx.note(staged ? `engagement staged on open ground: ${JSON.stringify(staged)}` : 'no open lane toward the enemy was found');
  await ctx.ff(0.5);
  return staged;
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
  // CTF: the carrier of the ENEMY flag (our side running it home, which the mustShow asks for; it wears the red
  // flagEnemy highlight), else whoever carries a flag. ms.flags lists alpha's flag first, so the director's own
  // flagCarrier follows an enemy that took OUR flag whenever both flags are out (r2 c036-c052).
  ourCarrier: `const own = (ms && ms.perspectiveTeam) || 'alpha'; const fl = (ms && ms.flags) || [];
    const f = fl.find((x) => x.status === 'carried' && x.carrierId && x.team !== own) || fl.find((x) => x.status === 'carried' && x.carrierId);
    return f ? H.info(g.tankById.get(f.carrierId)) : null;`,
  // the flag base that carrier scores at (its own side's), for the same carrier ourCarrier picks
  carrierHome: `const own = (ms && ms.perspectiveTeam) || 'alpha'; const fl = (ms && ms.flags) || [];
    const f = fl.find((x) => x.status === 'carried' && x.carrierId && x.team !== own) || fl.find((x) => x.status === 'carried' && x.carrierId);
    if (!f || !g.tankById.get(f.carrierId)) return null; const home = fl.find((x) => x.team !== f.team);
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
    windowS: 45,
    async run(ctx) {
      // the lead (r4 review of c079): the chase view read as a tank in grass with no action at home-page size. A
      // fight beat instead, filmed in front of or beside the hero, never from behind: enemies 110-155 m out (three,
      // AI kept), three allies beside the player, the gun laid by the aim hook (the external poses free it) and the
      // second after the hero's kill held from beside the wreck looking back at the hero (hit card, burning wreck)
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 170, minRangeM: 80, enemies: 3, allies: 3, dists: [110, 125, 140, 155] })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 3 });
      await ctx.mb('setOnFrame', `
        const st = MB.onFrameState, p = H.player(); if (!p) return;
        st.done = st.done || {};
        for (let i = MB.events.length - 1; i >= Math.max(0, MB.events.length - 8); i--) {
          const ev = MB.events[i];
          if (ev.type !== 'tank:destroyed' || ev.killerId !== p.id || st.done[ev.id] || ev.seq <= (st.seq || 0)) continue;
          st.seq = ev.seq; st.done[ev.id] = true;
          st.wreckCam = { kind: 'between', from: 'entity:' + ev.id, to: 'player', backM: 13, sideM: 8, heightM: 1.7, lookAtFrac: 0.4, lookAtHeightM: 2, fov: 34, smoothS: 0, hud: 'noreticle' };
          st.holdUntil = performance.now() + 2600;
          MB.setCamera(st.wreckCam);
          MB.burstIn([300, 650, 1000, 1500], { type: 'kill-after', victim: ev.id });
          break;
        }
        // hold the wreck pose through the burst even if the window cycles its cameras
        if (st.wreckCam && performance.now() < st.holdUntil && MB.camera !== st.wreckCam && MB.camera?.from !== st.wreckCam.from) MB.setCamera(st.wreckCam);`);
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          // the receiving end: by the hero's target, looking back across the lane at the hero firing
          { kind: 'between', from: 'aimTarget', to: 'player', backM: 16, sideM: 8, heightM: 1.6, lookAtFrac: 0.62, lookAtHeightM: 1.8, fov: 30, smoothS: 0.3, hud: 'noreticle' },
          // the hero at low front three-quarter, both sides
          { kind: 'follow', subject: 'player', azimuthDeg: 38, distM: 13, heightM: 1.0, lookAtHeightM: 1.9, fov: 42, hud: 'noreticle' },
          { kind: 'follow', subject: 'player', azimuthDeg: -42, distM: 12, heightM: 1.1, lookAtHeightM: 1.9, fov: 42, hud: 'noreticle' },
        ],
        cameraEvery: 3,
        triggers: [T.playerFire([35, 70, 120]), T.enemyFireOnScreen([35, 90], 400), T.hitOnScreen([30, 80], 400)],
      });
    },
  },

  'modes/capture_the_flag': {
    hour: 'day',
    windowS: 45,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      // the mustShow is our side running the ENEMY flag home: wait for that first, then settle for any carrier
      const ours = await ctx.until(() => {
        const ms = window.__MB.H.ms(); const own = ms?.perspectiveTeam || 'alpha';
        const f = ms?.flags?.find((x) => x.status === 'carried' && x.carrierId && x.team !== own);
        return f ? { carrier: f.carrierId, flag: f.team, ours: true } : null;
      }, { ffStepS: 3, timeoutS: 300, label: 'the enemy flag carried by our side' });
      const carried = ours || await ctx.until(() => {
        const f = window.__MB.H.ms()?.flags?.find((x) => x.status === 'carried' && x.carrierId);
        return f ? { carrier: f.carrierId, flag: f.team, ours: false } : null;
      }, { ffStepS: 3, timeoutS: 120, label: 'a flag carried' });
      ctx.log('carried', JSON.stringify(carried));
      await settle(ctx, 2);
      const triggers = [T.anyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()];
      // the carrier wears the mode's own flag-carrier highlight (game/juggernautVisual.ts TANK_ENERGY.flagOwn /
      // flagEnemy: additive, strongest on surfaces seen edge-on). Front three-quarter views on a longer lens keep the
      // hull, turret and gun reading as a tank through it (r2 c027); close low views turn it into a glowing shape.
      const front = [
        // ahead of the carrier on its run home, looking back at it: the flag, the carrier's front and its pursuers
        { kind: 'between', from: 'ourCarrier', to: 'carrierHome', backM: -26, sideM: 9, heightM: 1.4, lookAtFrac: 0, lookAtHeightM: 2.0, fov: 32, smoothS: 0.3, hud: 'noreticle' },
        { kind: 'follow', subject: 'ourCarrier', azimuthDeg: 26, distM: 22, heightM: 1.3, fov: 36, headingFrom: 'velocity', hud: 'noreticle' },
        { kind: 'between', from: 'ourCarrier', to: 'carrierHome', backM: -30, sideM: -10, heightM: 1.8, lookAtFrac: 0, lookAtHeightM: 2.0, fov: 32, smoothS: 0.3, hud: 'noreticle' },
      ];
      await ctx.capture({
        label: 'run', windowS: 40, cameras: front, cameraEvery: 3, triggers, everyS: 1.2,
        // hand over to the base camera for the last stretch
        stopWhen: () => {
          const H = window.__MB.H; const c = H.sel('ourCarrier'), h = H.sel('carrierHome');
          return !c || !h || Math.hypot(c.x - h.x, c.z - h.z) < 85;
        },
      });
      const closing = await ctx.eval(() => {
        const H = window.__MB.H; const c = H.sel('ourCarrier'), h = H.sel('carrierHome');
        return c && h ? Math.round(Math.hypot(c.x - h.x, c.z - h.z)) : null;
      });
      ctx.log('closing', JSON.stringify({ distM: closing }));
      if (closing != null && closing < 85) {
        // the flag-base marker ahead of the carrier: from 60 m beyond its own base on a long lens, the base's halo
        // and light column in the foreground and the carrier charging at them with the flag, pursuers behind it
        await ctx.capture({
          label: 'home', windowS: 22, cameraEvery: 3, triggers, everyS: 1.0,
          cameras: [
            { kind: 'between', from: 'carrierHome', to: 'ourCarrier', backM: 60, sideM: 6, heightM: 2.4, lookAtFrac: 1, lookAtHeightM: 1.8, fov: 13, smoothS: 0.35, hud: 'noreticle' },
            front[1],
            { kind: 'between', from: 'carrierHome', to: 'ourCarrier', backM: 45, sideM: -8, heightM: 2.0, lookAtFrac: 0.85, lookAtHeightM: 1.8, fov: 18, smoothS: 0.35, hud: 'noreticle' },
          ],
          stopWhen: () => !window.__MB.H.ms()?.flags?.some((x) => x.status === 'carried'),
        });
      }
    },
  },

  'modes/zone_control': {
    hour: 'day',
    windowS: 40,
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
          // a low crane (r14 run 1's 40-75 m heights left the tanks small on a flat amber disc)
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 210, distM: 58, heightM: 21, lookAtHeightM: 1.5, fov: 44, smoothS: 0, hud: 'noreticle' },
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 300, distM: 50, heightM: 15, lookAtHeightM: 1.5, fov: 46, smoothS: 0, hud: 'noreticle' },
          { kind: 'crane', center: 'contestedZone', azimuthDeg: 120, distM: 66, heightM: 28, lookAtHeightM: 1.5, fov: 42, smoothS: 0, hud: 'noreticle' },
        ],
        cameraEvery: 4,
        triggers: [T.anyFireOnScreen([35, 90], 400), T.hitOnScreen([30, 80], 400), T.killOnScreen()],
      });
    },
  },

  'modes/turbo_ball': {
    hour: 'day',
    windowS: 45,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      // r2 left the ball to the bots and filmed it 110 m out: a lone sphere in a field and the hoop seen from behind.
      // Each round now sets the run up at the enemy goal mouth: no debug call places the ball, so the sim's own ball
      // object (matchModeState.ball) is set down at rest 50 m out from bravo's hoop (alpha scores there:
      // sim/matchModes ballScoringTeam), the player 22 m behind it facing the hoop and the nearest tanks behind the
      // player; the player drives into the ball and jumps on the way (F, the mode jump), and the round ends with
      // the goal (scoring revives every tank at its spawn).
      await ctx.mb('setOnFrame', `
        const p = H.player(), b = H.sel('ball'); if (!p || !b || !H.live(p)) return;
        const st = MB.onFrameState; const d = H.dist(p.state.pos, b);
        if (d < 14 && d > 6 && Math.abs(p.state.speed || 0) > 7 && p.state.grounded !== false
          && (!st.lastJump || performance.now() - st.lastJump > 2500)) { H.tap('selfRight'); st.lastJump = performance.now(); }`);
      const stage = (round) => {
        const H = window.__MB.H, ms = H.ms(), p = H.player();
        if (!ms?.ball || !ms.goals?.length || !H.live(p)) return null;
        const own = ms.perspectiveTeam || 'alpha';
        const goal = ms.goals.find((x) => x.team !== own), home = ms.goals.find((x) => x.team === own);
        if (!goal || !home) return null;
        const len = Math.hypot(home.x - goal.x, home.z - goal.z) || 1;
        const ux = (home.x - goal.x) / len, uz = (home.z - goal.z) / len, lx = uz, lz = -ux;
        const at = (s, l, h = 0) => { const x = goal.x + ux * s + lx * l, z = goal.z + uz * s + lz * l; return [x, H.groundY(x, z) + h, z]; };
        const discs = H.concealers();
        for (const lat of [0, 12, -12, 24, -24, 36, -36]) {
          for (const out of [50, 58, 44, 66]) {
            const [bx, , bz] = at(out, lat), [px, , pz] = at(out + 22, lat * 1.08);
            if (!H.openGround(bx, bz, 6, discs) || !H.openGround(px, pz, 6, discs)) continue;
            const ball = ms.ball;
            ball.x = bx; ball.z = bz; ball.y = H.groundY(bx, bz) + 2.2; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.lastTouchId = null;
            H.place(p, px, pz, Math.atan2(bx - px, bz - pz));
            const others = H.liveTanks().filter((t) => t !== p)
              .sort((a, b) => H.dist(a.state.pos, { x: px, z: pz }) - H.dist(b.state.pos, { x: px, z: pz })).slice(0, 4);
            const pursuers = [];
            others.forEach((t, i) => {
              const [x, , z] = at(out + 22 + 26 + 8 * i, lat + (i % 2 ? -1 : 1) * (9 + 5 * i));
              if (!H.openGround(x, z, 4, discs)) return;
              H.place(t, x, z, Math.atan2(bx - x, bz - z));
              pursuers.push(t.id);
            });
            window.__MB.turboGoals = (ms.score?.alpha ?? 0) + (ms.score?.bravo ?? 0);
            // fixed poses for the round: wide beside the mouth (the hoop and the run in one frame) or through the hoop,
            // each from the first spot whose sight lines to the ball and the hoop nothing blocks
            const ballAt = { x: bx, z: bz }, goalAt = { x: goal.x, z: goal.z };
            // (laneClear skips foliage within 10 m of the eye, so the spot itself must stand clear of every disc)
            const clear = (pos) => { const eye = { x: pos[0], y: pos[1], z: pos[2] };
              return discs.every((c) => Math.hypot(c.x - pos[0], c.z - pos[2]) > c.r + 3)
                && H.laneClear(eye, ballAt, 4.4, discs) && H.laneClear(eye, goalAt, 8, discs); };
            const pick = (options) => options.find(clear) || options[0];
            const wide = { kind: 'fixed', pos: pick([at(out * 0.5, lat + 52, 2.6), at(out * 0.5, lat - 52, 2.6), at(out * 0.62, lat + 44, 3.2), at(out * 0.62, lat - 44, 3.2)]),
              look: at(out * 0.5, lat, 6), fov: 36, hud: 'noreticle' };
            const hoop = { kind: 'fixed', pos: pick([at(-30, lat * 0.2 + 4, 6), at(-30, lat * 0.2 - 4, 6), at(-22, lat * 0.2, 7)]),
              look: at(out - 5, lat, 3), fov: 30, hud: 'noreticle' };
            return { round, ballOutM: out, lateralM: lat, pursuers, goal: goal.team, wide, hoop };
          }
        }
        return null;
      };
      const follow = (azimuthDeg, distM, heightM) => ({ kind: 'follow', subject: 'player', azimuthDeg, distM, heightM, fov: 42, headingFrom: 'velocity', hud: 'noreticle' });
      for (let round = 0; round < 4; round++) {
        const staged = await ctx.eval(stage, round);
        ctx.log(`round ${round + 1}`, JSON.stringify(staged && { ...staged, wide: undefined, hoop: undefined }));
        if (!staged) { ctx.note('no open run at the enemy goal mouth was found'); break; }
        if (round === 0) ctx.note('each round stages the run at the enemy goal: ball (matchModeState.ball) at rest 50 m out, player 22 m behind it, the nearest tanks behind the player');
        const camera = [staged.wide, follow(28, 17, 0.9), staged.hoop, follow(-32, 15, 1.2)][round];
        await ctx.mb('setDrive', { to: 'ball', arriveM: 1, throttle: 1 });
        await ctx.capture({
          label: `ram ${round + 1}`, windowS: 10, cameras: [camera], everyS: 0.7, minGapMs: 300,
          triggers: [{ type: 'mode:ball_hit', who: 'any', onscreen: false, delays: [60, 220, 420, 700] }, T.anyFireOnScreen([30, 80], 300)],
          stopWhen: () => { const s = window.__MB.H.ms()?.score; return !!s && s.alpha + s.bravo > (window.__MB.turboGoals ?? 0); },
        });
        await ctx.mb('setDrive', null);
        await settle(ctx, 1.5);
      }
    },
  },

  'modes/endless_horde': {
    hour: 'sunset',
    windowS: 40,
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
      // r2 staged the wave 260 m out and filmed over the player's shoulder: specks on a horizon. The wave now stands
      // 130-190 m out (four hostiles, their AI kept, so they charge), filmed from in front of the lead hostile and
      // over the defenders on a longer lens
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 200, minRangeM: 90, throttle: 0, enemies: 4, dists: [130, 150, 170, 190] })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          // low, ahead of the lead hostile looking back at it: the charge, the defenders' tracers coming past the lens
          { kind: 'between', from: 'nearestEnemyClear', to: 'player', backM: -18, sideM: 8, heightM: 1.4, lookAtFrac: 0, lookAtHeightM: 1.8, fov: 36, smoothS: 0.3, hud: 'noreticle' },
          // over the defenders toward the wave, longer lens so the hostiles read
          { kind: 'between', from: 'player', to: 'nearestEnemy', backM: 12, sideM: 5, heightM: 3.0, lookAtFrac: 0.55, lookAtHeightM: 1.5, fov: 30, smoothS: 0.3, hud: 'noreticle' },
          { kind: 'follow', subject: 'player', azimuthDeg: 32, distM: 15, heightM: 1.1, fov: 44, hud: 'noreticle' },
        ],
        cameraEvery: 3,
        triggers: [T.playerFire(), T.anyFireOnScreen(), T.hitOnScreen(), T.killOnScreen()],
      });
    },
  },

  'modes/frontline_assault': {
    hour: 'day',
    windowS: 40,
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
    windowS: 40,
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
    windowS: 40,
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
    windowS: 40,
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
    windowS: 50,
    async run(ctx) {
      // close lanes and a low aim (the hull's ammunition sits under the turret ring): a penetrating APFSDS round at
      // 170-230 m is what cooks a rack off; r14's first pass at 260 m with a 2.5 mrad gate fired once in 50 s
      const contact = await toContact(ctx, { rangeM: 320, dists: [160, 175, 190, 150], enemies: 2 });
      ctx.log('contact', JSON.stringify(contact));
      // In Realistic every module a penetrating round crosses is damaged (chance 1, 2.5x damage: sim/damage.ts
      // rollModuleDamage), so one penetration through the ammunition turns the rack red and detonates it. r2-r3's
      // three passes hit staged three-quarter targets on their frontal and spaced armour (nonpen, spaced_absorb,
      // screen_pierce) and never reached a rack. The staged targets now hold still showing a side and a rear
      // quarter, and the gun waits for a 2 mrad lay on the rack.
      // r3 (mp3): a Merkava 3C held side-on took every round as nonpen, its rack low in the rear hull behind the road
      // wheels and skirts. The first lane now goes to an enemy whose rack rides in the turret (a bustle: a thin side
      // over the rounds), and the gun lays on that turret volume.
      let mark = null;
      if (contact?.lanes?.length) {
        const turned = await ctx.eval((ids) => {
          const H = window.__MB.H, g = H.g(), p = H.player(), out = [];
          const bustle = (t) => (t?.spec?.armor?.modules || []).some((b) => b.module === 'ammoRack' && b.turretLocal);
          const lanes = ids.map((id) => g.tankById.get(id)).filter(H.live);
          const swap = H.enemies().filter((t) => bustle(t) && !lanes.includes(t))
            .sort((a, b) => H.dist(a.state.pos, p.state.pos) - H.dist(b.state.pos, p.state.pos))[0];
          if (lanes[0] && !bustle(lanes[0]) && swap) {
            const at = { x: lanes[0].state.pos.x, z: lanes[0].state.pos.z }, was = { x: swap.state.pos.x, z: swap.state.pos.z };
            H.place(swap, at.x, at.z); H.place(lanes[0], was.x, was.z);
            lanes[0] = swap;
          }
          lanes.forEach((t, i) => {
            const toP = Math.atan2(p.state.pos.x - t.state.pos.x, p.state.pos.z - t.state.pos.z);
            H.place(t, t.state.pos.x, t.state.pos.z, i % 2 ? toP + Math.PI - 0.65 : toP + Math.PI / 2);
            H.freezeBot(t);
            out.push({ id: t.id, specId: t.specId, aspect: i % 2 ? 'rear quarter' : 'side', bustleRack: bustle(t) });
          });
          return out;
        }, contact.lanes.map((l) => l.id));
        ctx.note(`staged targets held still, turned to show the shooter a side and a rear quarter: ${JSON.stringify(turned)}`);
        mark = turned.find((t) => t.bustleRack)?.id || turned[0]?.id || null;
      }
      // the sights must see the cook-off: pass 5's scope looked through a birch grove the lane test did not count. The
      // marked target moves, side-on and held, to the nearest spot the sights see clear (H.sightClear)
      if (mark) {
        const sight = await ctx.eval((id) => {
          const H = window.__MB.H, p = H.player(), t = H.g().tankById.get(id);
          if (!p || !H.live(t)) return null;
          const eye = H.turretPoint(p), discs = H.concealers();
          if (H.sightClear(eye, t.state.pos, discs)) return { clear: true, moved: false };
          const d0 = H.dist(p.state.pos, t.state.pos), base = Math.atan2(t.state.pos.x - p.state.pos.x, t.state.pos.z - p.state.pos.z);
          for (const d of [d0, 160, 140, 185, 120]) {
            for (const da of [0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
              const a = base + (da * Math.PI) / 180, x = p.state.pos.x + Math.sin(a) * d, z = p.state.pos.z + Math.cos(a) * d;
              if (!H.openGround(x, z, 6, discs) || !H.sightClear(eye, { x, z }, discs)) continue;
              H.place(t, x, z, Math.atan2(p.state.pos.x - x, p.state.pos.z - z) + Math.PI / 2);
              H.freezeBot(t);
              return { clear: true, moved: true, d: Math.round(d), bearingDeg: da };
            }
          }
          return { clear: false };
        }, mark);
        ctx.log('sight', JSON.stringify(sight));
        if (sight && !sight.clear) ctx.note('no spot within 185 m gave the sights a clear line to the marked target');
      }
      // lay the gun on the ammunition's own volume (Realistic damages modules only, every module hit counts)
      const target = mark ? `entity:${mark}` : 'nearestEnemyClear';
      await ctx.mb('setAim', { target, aimAt: 'ammoRack', aimTurret: true, heightFrac: 0.35, fallback: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 2 });
      // Four passes put rounds into side-on targets and their racks (nonpen, screen_pierce, module hits with no rack
      // damage) and never cooked one off. Pass 5 stages the detonation: on the player's first real hit on the marked
      // target that the damage model does not kill, the target goes up through the QA kill (cause 'ammorack': the pop
      // and the thrown turret, H.killOne) and a burst films the second after.
      await ctx.mb('setOnFrame', `
        const st = MB.onFrameState, p = H.player(); if (!p || st.forced) return;
        const markId = ${JSON.stringify(mark)};
        for (const ev of MB.events) {
          if (ev.seq <= (st.lastSeq || 0)) continue;
          st.lastSeq = ev.seq;
          // (a hit's shooter is its attackerId: game/state.ts emits shell:hit with attackerId and targetId)
          if (ev.type !== 'shell:hit' || ((ev.attackerId ?? ev.shooterId) !== p.id && ev.isPlayer !== true)) continue;
          if (markId && ev.targetId !== markId) continue;
          const t = H.g().tankById.get(ev.targetId); if (!t) continue;
          if (t.combat.destroyed) { st.forced = 'real'; return; }
          if (H.killOne(t, 'ammorack')) { st.forced = t.id; MB.burstIn([60, 160, 320, 600, 900, 1300], { type: 'cook-off', victim: t.id, hitKind: ev.kind }); }
          return;
        }`);
      ctx.note('the ammunition detonation is staged: the player\'s first real hit on the marked target sets it off through the QA kill (cause ammorack, turret thrown); Realistic\'s damage model reached no rack in passes 1-4');
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'scope', target, fallback: 'nearestEnemyClear', zoom: 8, hud: 'full' },
          { kind: 'chase', target, fallback: 'nearestEnemyClear', step: 3, hud: 'full' },
        ],
        cameraEvery: 6,
        triggers: [
          { type: 'tank:destroyed', who: 'player', onscreen: false, delays: [60, 160, 320, 600], burst: true },
          T.playerHit([40, 120]), T.playerFire([35, 80]), T.killOnScreen(),
        ],
      });
    },
  },

  'modes/gun_game': {
    hour: 'sunset',
    windowS: 45,
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
    windowS: 40,
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
    windowS: 45,
    async run(ctx) {
      for (const [name, body] of Object.entries(SEL)) await define(ctx, name, body);
      const air = await ctx.until(() => {
        const p = window.__MB.H.player();
        return p?.aerial?.active ? { kind: p.aerial.kind, y: Math.round(p.aerial.y) } : null;
      }, { timeoutS: 30, label: 'the gunship aloft' });
      ctx.log('aerial', JSON.stringify(air));
      // r2 laid the gimbal on the attackers while the convoy was still out of frame: let the attack close to within
      // 120 m of the convoy first, so the convoy (and the extraction marker it heads for) share the frame with the burst
      const closing = await ctx.until(() => {
        const H = window.__MB.H, ms = H.ms(), p = H.player();
        if (!p) return null;
        const ours = H.liveTanks().filter((t) => t.team === p.team && t !== p);
        let best = Infinity;
        for (const e of H.enemies()) for (const s of ours) best = Math.min(best, H.dist(e.state.pos, s.state.pos));
        return best < 120 ? { closestM: Math.round(best), convoy: ours.length, extraction: !!ms?.zones?.some((z) => z.id === 'extraction') } : null;
      }, { ffStepS: 2, timeoutS: 90, label: 'the attack within 120 m of the convoy' });
      ctx.log('closing', JSON.stringify(closing));
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
    windowS: 45,
    async run(ctx) {
      // r4 (the lead's review of r3's c019: honest but weak at card size, a small distant streak, the launcher cut by the
      // frame edge). The Shillelagh flies its sight line at 208 m/s (velocityMps), so 0.4-0.8 s after launch it is 83-166
      // m downrange. At each launch a fixed lens is set on the missile's own path, about 0.7 s of flight downrange and a
      // few metres off it, looking back up the path: the motor glow and smoke trail come at the lens and cross the frame
      // large through the burst, with the MBT-70 behind them in its launch smoke. The hull is angled 35 degrees off the
      // line of fire (the turret laid down it), so from the path the MBT-70 reads at front three-quarter. The target
      // stands 280-380 m out, so the round is still in flight at 0.8 s.
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 420, minRangeM: 240, dists: [300, 340, 280, 380], enemies: 2 })));
      const angled = await ctx.eval(() => {
        const H = window.__MB.H, p = H.player(), t = H.sel('nearestEnemyClear') || H.sel('nearestEnemy');
        if (!p || !t) return null;
        const bearing = Math.atan2(t.x - p.state.pos.x, t.z - p.state.pos.z);
        H.place(p, p.state.pos.x, p.state.pos.z, bearing + 0.61);
        return { target: t.id, distM: Math.round(H.dist(p.state.pos, t)) };
      });
      ctx.log('hull angled', JSON.stringify(angled));
      const launcherCam = { kind: 'follow', subject: 'player', azimuthDeg: 34, distM: 18, heightM: 1.2, lookAtHeightM: 2, fov: 38, hud: 'hidden' };
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 5 });
      await ctx.mb('setOnFrame', `
        const st = MB.onFrameState, p = H.player(); if (!p) return;
        let m = null;
        for (const s of g.shells) {
          if (!s || s.dead || s.shooterId !== p.id || !s.spec || !s.spec.guided || !s.pos || !s.vel) continue;
          if (!m || (s.ageS || 0) < (m.ageS || 0)) m = s;
        }
        if (m && st.missileId !== m.id) {
          st.missileId = m.id; st.on = true; st.n = (st.n || 0) + 1;
          const sp = Math.hypot(m.vel.x, m.vel.y, m.vel.z) || 1;
          const ux = m.vel.x / sp, uy = m.vel.y / sp, uz = m.vel.z / sp, hx = Math.hypot(ux, uz) || 1, px = uz / hx, pz = -ux / hx;
          // the launch point: the missile's position less its flight so far
          const age = m.ageS || 0, ox = m.pos.x - m.vel.x * age, oy = m.pos.y - m.vel.y * age, oz = m.pos.z - m.vel.z * age;
          const v = [{ d: sp * 0.75 + 12, l: 7, h: 1.2, fov: 30 }, { d: sp * 0.68 + 10, l: -10, h: 3, fov: 34 }][(st.n - 1) % 2];
          const cx = ox + ux * v.d + px * v.l, cz = oz + uz * v.d + pz * v.l;
          const cy = Math.max(H.groundY(cx, cz) + 1.0, oy + uy * v.d + v.h);
          const k = v.d * 0.22;
          MB.setCamera({ kind: 'fixed', pos: [cx, cy, cz], look: [ox + ux * k, oy + uy * k + 0.4, oz + uz * k], fov: v.fov, smoothS: 0, hud: 'hidden' });
          MB.lens = { n: st.n, downrangeM: Math.round(v.d), offM: v.l, speed: Math.round(sp) };
        } else if (!m && st.on) {
          st.on = false;
          MB.setCamera(${JSON.stringify(launcherCam)});
        }`);
      await settle(ctx, 1);
      await ctx.capture({
        cameras: [launcherCam],
        everyS: 0,
        triggers: [{ type: 'shell:fired', who: 'player', onscreen: false, delays: [400, 500, 600, 700, 800], burst: true }],
      });
      ctx.log('lens', JSON.stringify(await ctx.eval(() => window.__MB.lens || null)));
    },
  },

  'mechanics/autoloader': {
    hour: 'sunset',
    windowS: 40,
    async run(ctx) {
      // the lead (r2 review of c001): the chase view read as a hull seen from the rear and the magazine pips vanish at
      // card size. The clip is filmed from external poses at low front three-quarter, 12-20 m, with the HUD up, and
      // the frames come from the clip's follow-up rounds: a player shot within 4 s of the one before (the Abrams X
      // fires its four-round clip 2.3 s apart) bursts on the second shot's muzzle flash with the first round's strike
      // still smoking downrange. The gun lays through the aim hook, free of the camera.
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 260, minRangeM: 120, dists: [180, 200, 220, 160], enemies: 2 })));
      await ctx.mb('setAim', { target: 'nearestEnemyClear' });
      await ctx.mb('setFire', { mode: 'auto', maxErrMrad: 4 });
      await ctx.mb('setOnFrame', `
        const st = MB.onFrameState, p = H.player(); if (!p) return;
        for (const ev of MB.events) {
          if (ev.seq <= (st.lastSeq || 0)) continue;
          st.lastSeq = ev.seq;
          if (ev.type !== 'shell:fired' || ((ev.shooterId ?? ev.attackerId) !== p.id && ev.isPlayer !== true)) continue;
          const t = ev.t ?? 0;
          if (st.lastShotT != null && t - st.lastShotT < 4) MB.burstIn([30, 70, 130, 220], { type: 'clip-follow-up', gapS: Math.round((t - st.lastShotT) * 10) / 10 });
          st.lastShotT = t;
        }`);
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'player', azimuthDeg: 32, distM: 15, heightM: 1.0, lookAtHeightM: 2.0, fov: 40, hud: 'noreticle' },
          { kind: 'follow', subject: 'player', azimuthDeg: -36, distM: 17, heightM: 1.2, lookAtHeightM: 2.0, fov: 40, hud: 'noreticle' },
          // ahead of the hero toward its target, off to one side: the rounds leave toward the lens's flank
          { kind: 'between', from: 'player', to: 'aimTarget', backM: -14, sideM: 10, heightM: 1.3, lookAtFrac: 0, lookAtHeightM: 2.0, fov: 42, smoothS: 0.3, hud: 'noreticle' },
        ],
        cameraEvery: 4,
        everyS: 0,
        triggers: [T.playerHit([40, 100])],
      });
    },
  },

  'mechanics/thermal': {
    hour: 'night',
    windowS: 45,
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
    windowS: 30,
    // r2: r1 had no battle of its own (the entry is a shot-view) and drew a random map and tank (Suzhou Creek, M1A3)
    battle: { specId: 'leo2a7v_x', mapId: 'verdant', gameMode: 'standard' },
    async run(ctx) {
      const contact = await toContact(ctx, { rangeM: 420, minRangeM: 260, dists: [320, 300, 350, 380], enemies: 1 });
      ctx.log('contact', JSON.stringify(contact));
      // the staged target held at its angled three-quarter (about 30 degrees off the line: the staging's own yaw) on a
      // spot the sights see clear of trees (H.sightClear), so the flashlight paints the whole hull
      const mark = contact?.lanes?.[0]?.id || null;
      if (mark) {
        const sight = await ctx.eval((id) => {
          const H = window.__MB.H, p = H.player(), t = H.g().tankById.get(id);
          if (!p || !H.live(t)) return null;
          const eye = H.turretPoint(p), discs = H.concealers();
          H.freezeBot(t);
          if (H.sightClear(eye, t.state.pos, discs)) return { clear: true, moved: false };
          const d0 = H.dist(p.state.pos, t.state.pos), base = Math.atan2(t.state.pos.x - p.state.pos.x, t.state.pos.z - p.state.pos.z);
          for (const d of [d0, 320, 300, 350]) {
            for (const da of [0, 8, -8, 16, -16, 24, -24, 35, -35, 50, -50]) {
              const a = base + (da * Math.PI) / 180, x = p.state.pos.x + Math.sin(a) * d, z = p.state.pos.z + Math.cos(a) * d;
              if (!H.openGround(x, z, 6, discs) || !H.sightClear(eye, { x, z }, discs)) continue;
              H.place(t, x, z, Math.atan2(p.state.pos.x - x, p.state.pos.z - z) + 0.52);
              H.freezeBot(t);
              return { clear: true, moved: true, d: Math.round(d), bearingDeg: da };
            }
          }
          return { clear: false };
        }, mark);
        ctx.log('sight', JSON.stringify(sight));
      }
      // the armour flashlight is the player's setting (H toggles it; off by default)
      await ctx.eval(() => window.__DEBUG.input.setSetting('armorAimOverlay', true));
      const target = mark ? `entity:${mark}` : 'nearestEnemyClear';
      await ctx.mb('setAim', { target, fallback: 'nearestEnemyClear' });
      await settle(ctx, 1.5);
      await ctx.capture({
        // x16 (the increased-zoom step) fills the sight with the painted hull at 300-380 m; x8 as r1
        cameras: [
          { kind: 'scope', target, fallback: 'nearestEnemyClear', zoom: 16, hud: 'full' },
          { kind: 'scope', target, fallback: 'nearestEnemyClear', zoom: 8, hud: 'full' },
        ],
        cameraEvery: 5,
        everyS: 1.2,
        triggers: [T.enemyFireOnScreen([35, 90], 900)],
      });
    },
  },

  'mechanics/bots': {
    hour: 'sunset',
    windowS: 40,
    hud: 'hidden',
    storage: { 'cot.game.teams.v1': JSON.stringify({ standard: { allies: 13, enemies: 14 } }) },
    async run(ctx) {
      // r2 (the lead: tanks bigger, the power cables out of frame). r1's crane stood 95-115 m out and 48-62 m up, and
      // Frontier Basin's 380 kV line (towers 36 m tall through the basin) crossed the frame. The lines now close to
      // 140 m; the crane stands 45-75 m out and 16-26 m up, at the first bearing whose camera and sight line keep clear
      // of the map's pylon spans (read from its scenery: src/world/maps/<id>.ts powerLines) and of the roadside
      // telegraph poles (world.crushables carrying a wire), and alternates with a raised three-quarter follow on the
      // front-line bot.
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const mapId = await ctx.eval(() => window.__DEBUG?.game?.mapId ?? window.__DEBUG?.world?.mapId ?? null);
      let powerLines = [];
      try {
        const src = readFileSync(resolve(process.cwd(), 'src/world/maps', `${mapId || 'frontier'}.ts`), 'utf8');
        for (const m of src.matchAll(/towers:\s*(\[\s*\[[\s\S]*?\]\s*\])\s*,\s*heightM:\s*([\d.]+)/g)) {
          try { powerLines.push({ towers: JSON.parse(m[1]), heightM: Number(m[2]) }); } catch { /* not a plain list */ }
        }
      } catch { powerLines = []; }
      ctx.log('power lines', JSON.stringify({ mapId, lines: powerLines.length }));
      const span = await ctx.until(() => {
        const c = window.__MB.H.sel('fightCenter');
        return c && c.spanM < 140 ? { spanM: Math.round(c.spanM), x: Math.round(c.x), z: Math.round(c.z) } : null;
      }, { ffStepS: 2, timeoutS: 220, label: 'the lines within 140 m' });
      ctx.log('fight', JSON.stringify(span));
      const crane = await ctx.eval((lines) => {
        const H = window.__MB.H, D = H.D(), c = H.sel('fightCenter');
        if (!c) return null;
        const segDist2D = (px, pz, ax, az, bx, bz) => {
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
          return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
        };
        // do the 2-D segments a-b and c-d cross (or come within m metres)?
        const near = (a, b, p, q, m) => {
          const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
          if (ccw(a, p, q) !== ccw(b, p, q) && ccw(a, b, p) !== ccw(a, b, q)) return true;
          return Math.min(segDist2D(a[0], a[1], p[0], p[1], q[0], q[1]), segDist2D(b[0], b[1], p[0], p[1], q[0], q[1]),
            segDist2D(p[0], p[1], a[0], a[1], b[0], b[1]), segDist2D(q[0], q[1], a[0], a[1], b[0], b[1])) < m;
        };
        const poles = (D.world.crushables || []).filter((k) => k.wirePoleIndex != null && !k.toppled).map((k) => [k.x, k.z]);
        for (const distM of [55, 45, 65, 75]) {
          for (const heightM of [20, 16, 26]) {
            for (const deg of [90, -90, 45, -45, 135, -135, 0, 180, 67, -67, 112, -112]) {
              const bearing = (c.yaw || 0) + (deg * Math.PI) / 180;
              const cam = [c.x + Math.sin(bearing) * distM, c.z + Math.cos(bearing) * distM], at = [c.x, c.z];
              if (Math.abs(cam[0]) > 440 || Math.abs(cam[1]) > 440) continue;
              // the pylon spans (25-36 m up) stay above a lens this low that looks down at the fight; they enter the frame
              // near the lens or across the background, so: no span within 35 m of the camera, and none across the view
              // beyond the fight (250 m on from it)
              const len = Math.hypot(at[0] - cam[0], at[1] - cam[1]) || 1;
              const far = [at[0] + ((at[0] - cam[0]) / len) * 250, at[1] + ((at[1] - cam[1]) / len) * 250];
              let clear = true;
              for (const line of lines) {
                for (let i = 0; i + 1 < line.towers.length && clear; i++) {
                  const [p, q] = [line.towers[i], line.towers[i + 1]];
                  if (segDist2D(cam[0], cam[1], p[0], p[1], q[0], q[1]) < 35 || near(at, far, p, q, 0)) clear = false;
                }
              }
              if (!clear) continue;
              // the telegraph wires (about 6 m up between poles some 32 m apart): no pole within 18 m of the sight line
              if (poles.some((pq) => segDist2D(pq[0], pq[1], cam[0], cam[1], at[0], at[1]) < 18)) continue;
              return { azimuthDeg: Math.round((bearing * 180) / Math.PI), distM, heightM, rel: deg, poles: poles.length };
            }
          }
        }
        return null;
      }, powerLines);
      ctx.log('crane', JSON.stringify(crane));
      if (!crane) ctx.note('no crane bearing clear of the power lines and telegraph wires was found; the crane takes the fight axis side-on');
      // the front-line bot: the live non-player tank closest to the other side
      await define(ctx, 'frontBot', `const p = H.player(); let best = null, bd = Infinity;
        for (const t of H.liveTanks()) { if (t === p) continue; for (const e of H.liveTanks()) { if (e.team === t.team) continue;
          const d = H.dist(t.state.pos, e.state.pos); if (d < bd) { bd = d; best = t; } } }
        return H.info(best);`);
      await settle(ctx, 2);
      await ctx.capture({
        cameras: [
          { kind: 'crane', center: 'fightCenter', azimuthDeg: crane ? crane.azimuthDeg : 90, relative: crane ? undefined : 'subject',
            distM: crane ? crane.distM : 60, heightM: crane ? crane.heightM : 20, lookAtHeightM: 1.5, fov: 40, smoothS: 1.0, hud: 'hidden' },
          { kind: 'follow', subject: 'frontBot', azimuthDeg: 35, distM: 26, heightM: 9, lookAtHeightM: 1.5, fov: 40, smoothS: 0.6, hud: 'hidden' },
        ],
        cameraEvery: 4,
        triggers: [T.anyFireOnScreen([35, 90], 300), T.hitOnScreen([30, 80], 300), T.killOnScreen()],
      });
    },
  },

  'mechanics/mobile': {
    hour: 'day',
    windowS: 35,
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
    windowS: 30,
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 520, throttle: 0.5 })));
      await settle(ctx, 1);
      // r2 (the lead: visible flames on the engine deck as well as the smoke). A burning tank's fire column is born at
      // the point where the tank was last struck (fx lastKnownPos, set by a shell hit) and its flame licks rise a
      // metre over it; r1's staged fire came with no hit on the deck, so its flames sat inside the hull and only the
      // smoke rose. A real round now strikes the engine deck first: the nearest enemy, set 70 m off the player's rear
      // quarter with its AI paused, lays on the engine and fires (HE when it carries any) until a round lands.
      const shooter = await ctx.eval(() => {
        const H = window.__MB.H, p = H.player();
        const e = p && H.enemies().sort((a, b) => H.dist(a.state.pos, p.state.pos) - H.dist(b.state.pos, p.state.pos))[0];
        if (!p || !e) return null;
        p.combat.hp = p.combat.maxHp;
        const back = p.state.yaw + Math.PI + 0.45, x = p.state.pos.x + Math.sin(back) * 70, z = p.state.pos.z + Math.cos(back) * 70;
        H.place(e, x, z, Math.atan2(p.state.pos.x - x, p.state.pos.z - z));
        e.aiCtl = null; e.input.throttle = 0; e.input.steer = 0; e.input.brake = true; e.input.fire = false;
        const he = (e.spec?.gun?.shells || []).findIndex((s) => /^HE/.test(s.type || ''));
        if (he >= 0) e.input.shellSlot = he;
        window.__MB.deckShooter = e.id;
        return { id: e.id, specId: e.specId, he: he >= 0 };
      });
      ctx.log('deck shooter', JSON.stringify(shooter));
      if (shooter) {
        await ctx.mb('setOnFrame', `
          const p = H.player(), e = H.g().tankById.get(MB.deckShooter); if (!p || !e || !H.live(e)) return;
          const st = MB.onFrameState; st.t0 = st.t0 || performance.now();
          const m = H.moduleWorld(p, 'engine') || { x: p.state.pos.x, y: p.state.pos.y + 1.4, z: p.state.pos.z };
          if (e.input.aimPoint && e.input.aimPoint.set) e.input.aimPoint.set(m.x, m.y + 0.6, m.z);
          for (const ev of MB.events) {
            if (ev.seq <= (st.seq || 0)) continue;
            st.seq = ev.seq;
            if (ev.type === 'shell:hit' && ev.targetId === p.id && (ev.attackerId ?? ev.shooterId) === e.id) st.hit = ev.kind || 'hit';
          }
          e.input.fire = !st.hit && performance.now() - st.t0 > 1800;`);
        const hit = await ctx.until(() => window.__MB.onFrameState?.hit || null, { timeoutS: 10, label: 'a round on the engine deck' });
        ctx.log('deck hit', JSON.stringify(hit));
        await ctx.mb('setOnFrame', null);
        await ctx.eval(() => {
          const H = window.__MB.H, e = H.g().tankById.get(window.__MB.deckShooter), p = H.player();
          if (e) H.freezeBot(e);
          if (p) p.combat.hp = Math.max(p.combat.hp, Math.round(p.combat.maxHp * 0.8));
        });
        if (hit) ctx.note('a real enemy round struck the engine deck first (the fire column and its flames are born over the last hit), from 70 m off the rear quarter with the shooter\'s AI paused');
      }
      // raised lenses (the deck sits behind the turret): a front three-quarter over the turret and a rear three-quarter
      const cams = [
        { kind: 'follow', subject: 'player', azimuthDeg: 35, distM: 12, heightM: 5.0, lookAtHeightM: 2.0, fov: 44, hud: 'noreticle' },
        { kind: 'follow', subject: 'player', azimuthDeg: 145, distM: 12, heightM: 4.5, lookAtHeightM: 2.0, fov: 44, hud: 'noreticle' },
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
        await ctx.capture({ windowS: 6, everyS: 0.7, max: 8, label: `cooling ${round + 1}` });
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
    windowS: 60,
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
      if (ended) await ctx.capture({ windowS: 35, everyS: 0.3, max: 45, label: 'ending replay' });
    },
  },

  'features/killcam': {
    hour: 'day',
    windowS: 55,
    battle: { specId: 't90m_x', mapId: 'verdant', gameMode: 'standard' },
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 450 })));
      await settle(ctx, 1);
      await ctx.mb('setCamera', { kind: 'game' });
      // r2: r1's one kill shell left the player alive at 1 HP (no penetration: a non-penetrating hit deals no damage)
      // and the window filmed the chase view. The shell is fired again, lower on the hull, until the kill lands and
      // the kill cam starts; only then does the window open
      let started = null;
      for (let attempt = 0; attempt < 4 && !started; attempt++) {
        const yFrac = [0.45, 0.32, 0.55, 0.38][attempt];
        const shot = await ctx.eval((y) => window.__DEBUG.spawnKillShell(y), yFrac);
        ctx.log(`kill shell ${attempt + 1}`, JSON.stringify({ fired: shot, yFrac }));
        started = await ctx.until(() => {
          const MB = window.__MB, p = MB.H.player();
          const ev = MB.events.slice().reverse().find((e) => e.type === 'killcam:start' || (e.type === 'tank:destroyed' && p && e.id === p.id));
          return ev ? { type: ev.type, seq: ev.seq } : null;
        }, { timeoutS: 3, label: `kill shell ${attempt + 1} landing` });
      }
      ctx.log('kill', JSON.stringify(started));
      ctx.note('the player was set to 1 HP and a real enemy shell fired into it (__DEBUG.spawnKillShell), again lower on the hull until it penetrated');
      await ctx.capture({ windowS: 40, everyS: 0.25, max: 50, label: 'kill cam' });
    },
  },

  'mechanics/crushing': {
    hour: 'day',
    windowS: 45,
    battle: { specId: 'leo2a7v_x', mapId: 'verdant', gameMode: 'standard' },
    hud: 'hidden',
    async run(ctx) {
      const runs = await findCrushRuns(ctx, { kinds: ['fenceplank', 'fencepicket', 'fencewattle', 'fencerail'], treeNearM: 14, maxRuns: 4 });
      ctx.log('crush runs', JSON.stringify(runs.map((r) => ({ kind: r.kind, x: Math.round(r.x), z: Math.round(r.z), tree: r.tree }))));
      if (!runs.length) { ctx.note('no fence run with a tree beside it was found'); return; }
      // r4 (first pass: the windows closed before the hull reached the fences, and the 0.9 m lens sat in Verdant's
      // tall grass): the approach is fast-forwarded to 14 m short at speed, and the lens stands above the grass:
      // beyond the fence looking back down the run (the hull comes at it through the boards), or a front three-quarter
      // follow
      for (const [i, run] of runs.entries()) {
        const at = await approachRun(ctx, run, { backM: 60, arriveM: 14 });
        ctx.log(`crush run ${i + 1}`, JSON.stringify(at));
        await ctx.capture({
          windowS: 7, everyS: 0.35, max: 12, label: `crush run ${i + 1} (${run.kind})`,
          cameras: [i % 2 ? { kind: 'follow', subject: 'player', azimuthDeg: -32, distM: 13, heightM: 2.0, lookAtHeightM: 1.3, fov: 44, headingFrom: 'velocity', smoothS: 0.2, hud: 'hidden' }
            : runLens(run, { aheadM: 16, sideM: 7, heightM: 1.9 })],
          triggers: [T.crushOnScreen([30, 90, 180, 300]), { type: 'tank:ram', who: 'player', onscreen: false, delays: [40, 140] }],
          minGapMs: 200,
        });
      }
      ctx.note('player placed 60 m short of each fence run, the approach fast-forwarded at full throttle to 14 m short, then filmed through the crush');
    },
  },

  'mechanics/map-vehicles': {
    hour: 'day',
    windowS: 45,
    battle: { specId: 't90m_x', mapId: 'urban', gameMode: 'standard' },
    hud: 'hidden',
    async run(ctx) {
      const runs = await findCrushRuns(ctx, { kinds: ['sedan', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed'], treeNearM: 0, maxRuns: 4, vehicles: true });
      ctx.log('vehicle runs', JSON.stringify(runs.map((r) => ({ kind: r.kind, x: Math.round(r.x), z: Math.round(r.z), urban: r.urban }))));
      if (!runs.length) { ctx.note('no parked map vehicle was found'); return; }
      // r4: as crushing: the approach fast-forwarded to 13 m short at speed, then a lens beyond the vehicle looking back
      // down the run, or a front three-quarter follow, through the crush
      for (const [i, run] of runs.entries()) {
        const at = await approachRun(ctx, run, { backM: 55, arriveM: 13 });
        ctx.log(`vehicle run ${i + 1}`, JSON.stringify(at));
        await ctx.capture({
          windowS: 7, everyS: 0.35, max: 12, label: `vehicle run ${i + 1} (${run.kind})`,
          cameras: [i % 2 ? { kind: 'follow', subject: 'player', azimuthDeg: -30, distM: 12, heightM: 1.6, lookAtHeightM: 1.3, fov: 46, headingFrom: 'velocity', smoothS: 0.2, hud: 'hidden' }
            : runLens(run, { aheadM: 14, sideM: 6, heightM: 1.6 })],
          triggers: [T.crushOnScreen([30, 90, 180, 320]), { type: 'tank:ram', who: 'player', onscreen: false, delays: [40, 140, 260] }],
          minGapMs: 200,
        });
      }
      ctx.note('player placed 55 m short of each parked vehicle, the approach fast-forwarded at full throttle to 13 m short, then filmed driving over it');
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
    let index = 0;
    for (const o of obstacles) {
      if (!cfg.kinds.includes(o.kind) || o.crushed || o.dead) continue;
      // the record's own footprint: an OBB with hl along (sin yaw, cos yaw) — a fence segment's run, a vehicle's length
      const obb = o.shape2 && o.shape2.kind === 'obb' ? o.shape2 : null;
      const x = obb ? obb.cx : (o.min[0] + o.max[0]) / 2, z = obb ? obb.cz : (o.min[2] + o.max[2]) / 2;
      // stay well away from the enemy side so the run is not interrupted by a fight
      if (Math.hypot(x - enemyX, z - enemyZ) < 350) continue;
      if (Math.abs(x) > 440 || Math.abs(z) > 440) continue;
      let tree = null;
      if (cfg.treeNearM > 0) {
        for (const t of trees) {
          const tx = (t.min[0] + t.max[0]) / 2, tz = (t.min[2] + t.max[2]) / 2;
          const d = Math.hypot(tx - x, tz - z);
          if (d > 3 && d < cfg.treeNearM && (!tree || d < tree.d)) tree = { x: tx, z: tz, d, h: t.max[1] - t.min[1] };
        }
        if (!tree) continue;
      }
      const recordYaw = obb ? obb.yaw : ((o.max[0] - o.min[0]) > (o.max[2] - o.min[2]) ? Math.PI / 2 : 0);
      let heading;
      if (cfg.vehicles) {
        // alternate side-on (over the roof line) and lengthwise runs across the parked vehicles
        heading = recordYaw + (index++ % 2 === 0 ? Math.PI / 2 : 0);
      } else {
        // across the fence; straight at the tree behind it when that still crosses the fence steeply
        const normal = recordYaw + Math.PI / 2;
        heading = normal;
        if (tree) {
          const toTree = Math.atan2(tree.x - x, tree.z - z);
          if (Math.abs(Math.cos(toTree - normal)) >= 0.6) heading = toTree;
          else if (Math.cos(toTree - heading) < 0) heading += Math.PI;
        }
      }
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
      // a street: solid records (buildings, walls) within 35 m; the map-vehicle shot wants the tank pushing up a street
      let urban = 0;
      if (cfg.vehicles) {
        for (const q of obstacles) {
          if (q.crushable || q.crushed || q.dead || q.kind === 'tree' || !q.min || !q.max) continue;
          if ((q.max[1] - q.min[1]) < 2.5) continue;
          const qx = (q.min[0] + q.max[0]) / 2, qz = (q.min[2] + q.max[2]) / 2;
          if (Math.hypot(qx - x, qz - z) < 35) urban++;
        }
      }
      found.push({ kind: o.kind, x, z, heading, urban, tree: tree ? { d: Math.round(tree.d), h: Math.round(tree.h) } : null,
        distFromPlayer: Math.round(Math.hypot(x - p.state.pos.x, z - p.state.pos.z)) });
    }
    found.sort((a, b) => (cfg.vehicles ? b.urban - a.urban : 0) || a.distFromPlayer - b.distFromPlayer);
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

/**
 * Bring the player to a run at speed. r4's first runs started 40-45 m short from a standstill and the windows (wall
 * time, most of it spent in 4K screenshot freezes) ended before the hull reached the fence or the car. The approach is
 * fast-forwarded now (nothing drawn; the latched full throttle drives straight down the run) until the hull is
 * `arriveM` short, so the rendered window opens on the crush itself.
 */
async function approachRun(ctx, run, { backM = 60, arriveM = 14, maxS = 8 } = {}) {
  await stageRun(ctx, run, backM);
  return ctx.until((r, arrive) => {
    const H = window.__MB.H, p = H.player();
    if (!p) return null;
    const d = Math.hypot(p.state.pos.x - r.x, p.state.pos.z - r.z);
    return d < arrive ? { distM: Math.round(d), speedMps: Math.round(Math.abs(p.state.speed) * 10) / 10 } : null;
  }, { ffStepS: 0.2, timeoutS: maxS, label: `the ${run.kind} run`, args: [run, arriveM] });
}

/** A fixed lens beyond a run, low and off to one side, looking back down it at the hull coming through. */
function runLens(run, { aheadM = 15, sideM = 7, heightM = 1.7, fov = 42 } = {}) {
  const ux = Math.sin(run.heading), uz = Math.cos(run.heading), px = uz, pz = -ux;
  return {
    kind: 'fixed', fov, smoothS: 0, hud: 'hidden',
    pos: [run.x + ux * aheadM + px * sideM, null, run.z + uz * aheadM + pz * sideM], heightM,
    look: [run.x - ux * 6, null, run.z - uz * 6], lookHeightM: 1.4,
  };
}

/** Pause the battle through Settings (Esc), open the Sound tab and expand the crew-voice select. */
async function openCrewRadio(ctx) {
  const page = ctx.page;
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cot-set.open', { timeout: 8000 }).catch(() => null);
  // src/ui/settings.ts: tabs .cot-set-tab[data-tab], the Sound tab's crew row .cot-set-crew-row whose flag dropdown
  // (customSelect.ts, created lazily with its flag art) opens .cot-custom-select-list in the page
  const result = await page.evaluate(() => {
    const out = { open: !!document.querySelector('.cot-set.open') };
    const sound = document.querySelector('.cot-set-tab[data-tab="sound"]');
    if (sound) { sound.click(); out.tab = (sound.textContent || '').trim(); }
    return out;
  });
  await page.waitForSelector('.cot-set-crew-row .cot-custom-select-trigger', { timeout: 8000 }).catch(() => null);
  const select = await page.evaluate(() => {
    const row = document.querySelector('.cot-set-crew-row');
    if (!row) return { found: false };
    row.scrollIntoView({ block: 'center' });
    const trigger = row.querySelector('.cot-custom-select-trigger');
    if (trigger) trigger.click();
    return { found: true, trigger: !!trigger, text: (row.textContent || '').trim().slice(0, 80) };
  });
  await page.waitForSelector('.cot-custom-select-list', { visible: true, timeout: 5000 }).catch(() => null);
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
    windowS: 20,
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
    windowS: 20,
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
    windowS: 15,
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
    windowS: 15,
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
    windowS: 15,
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
    windowS: 25,
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
    windowS: 30,
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

// ================================================================================================ roof guns
Object.assign(RECIPES, {
  // Roof weapon stations are on by default (sim/auxiliarySystems.ts: gunOn when the spec carries a gun) and engage
  // spotted enemies in range on a clear lane by themselves; their rounds join game.shells without a bus event, so
  // the frame hook watches the player's own small-calibre shells and freezes a beat after each burst starts.
  'mechanics/roof-guns': {
    hour: 'sunset',
    windowS: 40,
    hud: 'hidden',
    battle: { specId: 'm1a2_sepv3_x', mapId: 'oasis', gameMode: 'standard' },
    async run(ctx) {
      ctx.log('contact', JSON.stringify(await toContact(ctx, { rangeM: 320, dists: [170, 210, 140, 250], enemies: 2, allies: 1 })));
      // the main gun stays laid where it was; only the roof station tracks and fires
      await ctx.mb('setOnFrame', `
        const p = H.player(); if (!p || !H.live(p)) return;
        const st = MB.onFrameState; st.seen = st.seen || new Set(); st.k = st.k || 0;
        for (const s of g.shells) {
          if (!s || s.dead || s.shooterId !== p.id || st.seen.has(s.id)) continue;
          st.seen.add(s.id);
          const cal = s.spec?.caliberMm ?? s.caliberMm ?? 0;
          if (cal > 0 && cal < 40 && performance.now() - (st.last || 0) > 700) {
            st.last = performance.now();
            MB.freezeIn([40, 90, 160][st.k++ % 3], { type: 'roof-gun', caliberMm: cal });
          }
        }`);
      await settle(ctx, 1.5);
      await ctx.capture({
        cameras: [
          { kind: 'follow', subject: 'player', azimuthDeg: 32, distM: 11, heightM: 0.9, lookAtHeightM: 2.6, fov: 35, hud: 'hidden' },
          { kind: 'follow', subject: 'player', azimuthDeg: -38, distM: 10, heightM: 1.1, lookAtHeightM: 2.6, fov: 35, hud: 'hidden' },
        ],
        cameraEvery: 4,
        everyS: 2.5,
        minGapMs: 300,
        triggers: [],
      });
    },
  },
});

// ================================================================================================ spotting
Object.assign(RECIPES, {
  'mechanics/spotting': {
    hour: 'sunset',
    windowS: 35,
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
        // r2: shrubs, not tree groves (r1's 4 m disc was a grove and every lens sat among its trunks), and the column
        // within spotting range (r1's 360 m column was never spotted: spotRange = viewRange - (viewRange - 50) x camo)
        for (const c of discs) {
          if (H.dist(c, p.state.pos) > 240 || c.r > 4) continue;
          const treesNear = (D.world.getObstacles?.() || []).some((o) => (o.kind === 'tree' || o.treeIdx != null) && !o.crushed && !o.dead
            && Math.hypot((o.min[0] + o.max[0]) / 2 - c.x, (o.min[2] + o.max[2]) / 2 - c.z) < c.r + 6);
          if (treesNear) continue;
          const sx = c.x + Math.sin(toEnemy) * c.r * 0.3, sz = c.z + Math.cos(toEnemy) * c.r * 0.3;
          if (Math.abs(sx) > 430 || Math.abs(sz) > 430) continue;
          const sy = H.groundY(sx, sz);
          for (const dist of [250, 230, 270, 210]) {
            for (const lateral of [0, 45, -45, 90, -90]) {
              const px = sx + Math.sin(toEnemy) * dist + Math.cos(toEnemy) * lateral;
              const pz = sz + Math.cos(toEnemy) * dist - Math.sin(toEnemy) * lateral;
              if (Math.abs(px) > 430 || Math.abs(pz) > 430) continue;
              const py = H.groundY(px, pz);
              if (H.raycastBlock({ x: sx, y: sy + 2.6, z: sz }, { x: px, y: py + 1.6, z: pz }, 3) != null) continue;
              if (canopyOnLine(sx, sz, px, pz, c)) continue;
              const score = (sy - py) * 0.6 - Math.abs(dist - 240) / 40 - Math.abs(lateral) / 60;
              if (!best || score > best.score) best = { seat: { x: sx, z: sz, r: c.r }, column: { x: px, z: pz }, score, riseM: Math.round(sy - py), dist, lateral };
            }
          }
        }
        return best;
      });
      ctx.log('spotting plan', JSON.stringify(plan));
      let lens = null;
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
            // held still until spotted (r1's column drove out of range first), then driven straight across
            t.aiCtl = null; t.input.throttle = 0; t.input.steer = 0; t.input.brake = true; t.input.fire = false;
          });
          window.__MB.columnIds = column.map((t) => t.id);
        }, plan);
        await ctx.mb('defineSelector', 'columnLead', 'const id = (window.__MB.columnIds || [])[1] || (window.__MB.columnIds || [])[0]; return id ? H.info(g.tankById.get(id)) : null;');
        ctx.note('player placed in a bush facing the enemy side; three enemy bots placed as a column ~240 m below with their AI paused, held until spotted, then driven straight across');
        const spotted = await ctx.until(() => {
          const D = window.__DEBUG, ids = window.__MB.columnIds || [];
          const team = D.game.player?.team;
          return ids.filter((id) => D.game.spotting?.isSpotted?.(id, team)).length || null;
        }, { ffStepS: 0.5, timeoutS: 30, label: 'the column spotted' });
        ctx.log('spotted', spotted);
        await ctx.eval(() => {
          for (const id of window.__MB.columnIds || []) {
            const t = window.__MB.H.g().tankById.get(id);
            if (t?.input) { t.input.throttle = 0.45; t.input.brake = false; }
          }
        });
        // a raised lens behind and beside the player, outside every bush and tree disc but the seat's own, whose line to
        // the column nothing hides: the tank half-hidden in its bush in the foreground, the column marked beyond
        lens = await ctx.eval((pl) => {
          const H = window.__MB.H, p = H.player(), lead = H.sel('columnLead');
          if (!p || !lead) return null;
          const discs = H.concealers().filter((c) => Math.hypot(c.x - pl.seat.x, c.z - pl.seat.z) > pl.seat.r + 0.5);
          const toward = Math.atan2(lead.x - p.state.pos.x, lead.z - p.state.pos.z), ux = Math.sin(toward), uz = Math.cos(toward), px = uz, pz = -ux;
          for (const back of [10, 13, 8, 16]) {
            for (const side of [6, -6, 9, -9, 3, -3]) {
              for (const h of [5, 6.5, 4, 8]) {
                const x = p.state.pos.x - ux * back + px * side, z = p.state.pos.z - uz * back + pz * side;
                if (discs.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) continue;
                const eye = { x, y: H.groundY(x, z) + h, z };
                if (!H.sightClear(eye, lead, discs)) continue;
                const lx = p.state.pos.x + (lead.x - p.state.pos.x) * 0.55, lz = p.state.pos.z + (lead.z - p.state.pos.z) * 0.55;
                return { kind: 'fixed', pos: [x, eye.y, z], look: [lx, null, lz], lookHeightM: 1.0, fov: 40, smoothS: 0, hud: 'noreticle', back, side, h };
              }
            }
          }
          return null;
        }, plan);
        ctx.log('lens', JSON.stringify(lens && { back: lens.back, side: lens.side, h: lens.h }));
        if (!lens) ctx.note('no raised lens behind the bush saw the column clear; the frames use the over-the-shoulder poses');
      }
      await ctx.capture({
        cameras: [
          ...(lens ? [lens] : []),
          { kind: 'between', from: 'player', to: plan ? 'columnLead' : 'nearestEnemy', backM: 11, sideM: 5, heightM: 5.5, lookAtFrac: 0.7, fov: 40, hud: 'noreticle' },
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
  // DPR 1 and the High preset: two live battles share one headless Chrome (at 4K Ultra the room's host starved)
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); } catch { /* defaults */ }
    // two battles render at once in one headless Chrome: each page counts as focused (the frame loop pauses unfocused pages)
    Document.prototype.hasFocus = function hasFocus() { return true; };
  }, { 'cot.lastTank.v1': tank, 'cot.gfxPreset': 'high', 'cot.locale': 'en-US', 'cot.player.name.v1': name, 'cot.battle.times.v2': '["sunset"]',
    // Standard: a co-op mode seats every player on alpha (src/mp/room/roomPolicy.ts set_game_mode)
    'cot.game.mode.v1': 'standard' });
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
        // Steppe (r14 attempt 6): on Verdant the town and the farm (one farmhouse on the Challenger's drive every time)
        // kept the seats out of each other's sight through attempts 3-5; the steppe's open grass keeps the lanes clear
        ctx.log('host lobby', await setLobby(A.page, 'map', 'steppe'), await setLobby(A.page, 'vehicle', 'challenger_3x'), await setLobby(A.page, 'team', 'alpha'));
        await B.page.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await B.page.waitForFunction(ready, { timeout: 240000, polling: 250 });
        await B.page.waitForFunction(() => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2, { timeout: 60000 });
        ctx.log('guest lobby', await setLobby(B.page, 'team', 'bravo'), await setLobby(B.page, 'vehicle', 't90m_x'));
        // the room is the authority on seats: confirm B sits on bravo, through the team list's own option if needed
        // (r14 attempts 1-2: neither client ever held the other seat)
        const code = invite.searchParams.get('room');
        const seats = () => (ctx.rooms?.room(code)?.room?.players ?? []).map((pl) => `${pl.name ?? pl.id}:${pl.team}`);
        for (let i = 0; i < 20 && !seats().some((s) => /:bravo$/.test(s)); i++) await ctx.sleep(250);
        if (!seats().some((s) => /:bravo$/.test(s))) {
          await B.page.click('.cot-play [data-control="team"] [data-select-trigger]').catch(() => {});
          await ctx.sleep(300);
          await B.page.click('.cot-play [data-control="team"] .menu-select-option[data-value="bravo"]').catch(() => {});
          for (let i = 0; i < 20 && !seats().some((s) => /:bravo$/.test(s)); i++) await ctx.sleep(250);
        }
        ctx.log('room seats', JSON.stringify(seats()), 'lobby mode', await A.page.evaluate(() => document.querySelector('.cot-play .lobby')?.dataset?.mode ?? null));
        if (!seats().some((s) => /:bravo$/.test(s))) ctx.note(`B never took the bravo seat: ${JSON.stringify(seats())}`);
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
          const ms = g.matchModeState;
          return { me: g.player?.specId, team: g.player?.team, tanks: g.tanks.map((t) => `${t.specId}:${t.team}`),
            pos: g.player ? [Math.round(g.player.state.pos.x), Math.round(g.player.state.pos.z)] : null,
            perspective: ms?.perspectiveTeam ?? null, spawns: (ms?.spawns ?? []).map((sp) => `${sp.team}@${Math.round(sp.x)},${Math.round(sp.z)}`) };
        })));
        ctx.log('seated', JSON.stringify(sides));
        // close the distance. A client holds the other seat only once it is spotted (snapshots are filtered for
        // spotting), so both drive to a pair of open spots that see each other across clear ground, 150-190 m apart
        // near the map's centre (r14 attempt 3 drove both to the centre itself and met 40 m apart with Verdant's
        // town between them: two scopes full of walls); without such a pair, at the centre as before
        // Each seat takes the spot on its own side, and a pair whose straight drives from both seats meet nothing
        // solid wins (r14 attempt 4: the Challenger's drive ran into a farmhouse 90 m short, its gun at the travel
        // limit against the wall; the T-90M made its spot)
        const meet = await A.page.evaluate((seats) => {
          const H = window.__MB.H, discs = H.concealers();
          const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
          const eye = (p) => ({ x: p[0], y: H.groundY(p[0], p[1]) + 2.0, z: p[1] });
          const pathClear = (from, to) => {
            if (!from) return false;
            if (H.raycastBlock(eye(from), eye(to), 2) != null) return false;
            const len = d(from, to);
            for (let s = 20; s < len - 10; s += 20) {
              const f = s / len;
              if (!H.openGround(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, 3, [])) return false;
            }
            return true;
          };
          // first: spots each seat reaches in a straight line (140-300 m out toward the other seat, open ground, nothing
          // solid on the way), then the pair 140-340 m apart that see each other (r14 attempt 5: no centre pair had
          // clear drives, and the Challenger stuck on the same farmhouse again)
          if (seats[0] && seats[1]) {
            const reach = (from, toward) => {
              const out = [], base = Math.atan2(toward[0] - from[0], toward[1] - from[1]);
              for (const r of [140, 180, 220, 260, 300]) {
                for (const da of [0, 15, -15, 30, -30, 45, -45]) {
                  const ang = base + (da * Math.PI) / 180, p = [from[0] + Math.sin(ang) * r, from[1] + Math.cos(ang) * r];
                  if (H.openGround(p[0], p[1], 10, discs) && pathClear(from, p)) out.push(p);
                }
              }
              return out;
            };
            const sa = reach(seats[0], seats[1]), sb = reach(seats[1], seats[0]);
            let best = null;
            for (const pa of sa) {
              for (const pb of sb) {
                const dist = d(pa, pb);
                if (dist < 140 || dist > 340) continue;
                if (!H.laneClear(eye(pa), { x: pb[0], z: pb[1] }, 2.4, discs) || !H.laneClear(eye(pb), { x: pa[0], z: pa[1] }, 2.4, discs)) continue;
                const score = -Math.abs(dist - 200);
                if (!best || score > best.score) best = { a: pa.map(Math.round), b: pb.map(Math.round), d: Math.round(dist), paths: [true, true], score, reach: [sa.length, sb.length] };
              }
            }
            if (best) return best;
          }
          let partial = null;
          for (const r of [0, 70, 140, 210, 280]) {
            for (let k = 0; k < (r ? 12 : 1); k++) {
              const a = (k / 12) * Math.PI * 2, cx = Math.sin(a) * r, cz = Math.cos(a) * r;
              for (let j = 0; j < 8; j++) {
                const bearing = (j / 8) * Math.PI;
                for (const half of [85, 75, 95]) {
                  let pa = [cx - Math.sin(bearing) * half, cz - Math.cos(bearing) * half];
                  let pb = [cx + Math.sin(bearing) * half, cz + Math.cos(bearing) * half];
                  if (!H.openGround(pa[0], pa[1], 10, discs) || !H.openGround(pb[0], pb[1], 10, discs)) continue;
                  if (!H.laneClear(eye(pa), { x: pb[0], z: pb[1] }, 2.4, discs) || !H.laneClear(eye(pb), { x: pa[0], z: pa[1] }, 2.4, discs)) continue;
                  if (seats[0] && seats[1] && d(seats[0], pa) + d(seats[1], pb) > d(seats[0], pb) + d(seats[1], pa)) [pa, pb] = [pb, pa];
                  const clear = [pathClear(seats[0], pa), pathClear(seats[1], pb)];
                  const score = Number(clear[0]) + Number(clear[1]);
                  const found = { a: pa.map(Math.round), b: pb.map(Math.round), d: half * 2, centre: [Math.round(cx), Math.round(cz)], paths: clear };
                  if (score === 2) return found;
                  if (!partial || score > partial.score) partial = { ...found, score };
                }
              }
            }
          }
          return partial;
        }, [sides[0]?.pos ?? null, sides[1]?.pos ?? null]);
        ctx.log('meeting spots', JSON.stringify(meet));
        if (!meet) ctx.note('no pair of open spots in sight of each other near the centre: both drove to the centre');
        for (const [c, spot] of [[A, meet?.a], [B, meet?.b]]) {
          await c.page.evaluate((to) => {
            window.__MB.setDrive(to ? { to, arriveM: 5, throttle: 1 } : { to: 'point:0,0', arriveM: 40, throttle: 1 });
            window.__MB.setHud('full');
          }, spot || null);
          await c.page.addStyleTag({ content: '.cot-mp-banner{display:none!important}' });
        }
        let seen = [null, null];
        for (let i = 0; i < 150; i++) {
          // hold for the spot (up to about 45 s of driving), then take the other seat wherever it is in sight
          seen = await Promise.all([A, B].map((c) => c.page.evaluate((patient) => {
            const H = window.__MB.H, p = H.player(), e = H.sel('nearestEnemy'), drive = window.__MB.drive;
            if (patient && drive && !drive.arrived) return null;
            if (p && e && H.dist(p.state.pos, e) < 420) { window.__MB.setDrive(null); return Math.round(H.dist(p.state.pos, e)); }
            return null;
          }, i < 90)));
          if (seen[0] != null && seen[1] != null) break;
          await ctx.sleep(500);
        }
        ctx.log('in sight', JSON.stringify(seen), JSON.stringify(await Promise.all([A, B].map((c) => c.page.evaluate(() => {
          const g = window.__DEBUG.game; return g.player ? [Math.round(g.player.state.pos.x), Math.round(g.player.state.pos.z), g.tanks.length] : null;
        })))));
        if (seen[0] == null || seen[1] == null) ctx.note(`the seats did not both see each other (A ${seen[0]}, B ${seen[1]})`);
        ctx.note('the network-quality banner (.cot-mp-banner) is hidden: it reported the capture machine\'s load, two live battles in one headless Chrome');
        // each client's own chase view with its gun on the other tank (the staging's camera); the last two rounds
        // in the sights
        const view = (kind) => Promise.all([A, B].map((c) => c.page.evaluate((k) => {
          window.__MB.setDrive(null);
          window.__MB.setAim({ target: 'nearestEnemy' });
          window.__MB.setCamera(k === 'scope' ? { kind: 'scope', target: 'nearestEnemy', zoom: 6 } : { kind: 'chase', target: 'nearestEnemy', step: 2 });
        }, kind)));
        await view('chase');
        await ctx.sleep(2500);
        // what each seat's gun and hooks are doing (r14 attempts 2-4 fired no round in 32 tries)
        const aimState = () => Promise.all([A, B].map((c) => c.page.evaluate(() => {
          const MB = window.__MB, H = MB.H, D = H.D(), p = H.player(), e = H.sel('nearestEnemy');
          let errMrad = null;
          try { errMrad = Math.round(D.gunAimError() * 1000); } catch (error) { errMrad = String(error).slice(0, 60); }
          const deg = (r) => (r == null ? null : Math.round(r * 57.3));
          return {
            errMrad, enemyM: p && e ? Math.round(H.dist(p.state.pos, e)) : null, gunLimit: !!p?.state?.gunLimitSpec,
            hullDeg: deg(p?.state?.yaw), turretDeg: deg(p?.state?.turretYaw),
            bearingDeg: p && e ? deg(Math.atan2(e.x - p.state.pos.x, e.z - p.state.pos.z)) : null,
            fireFlag: !!D.flags?.forceFire, shots: MB.fire?.shots ?? null, hookErrors: (MB.hookErrors || []).slice(-3),
          };
        })));
        ctx.log('aim state', JSON.stringify(await aimState()));
        // rounds: one side fires; both pages freeze together a beat after the shot and are captured as a pair
        const dir = ctx.dir;
        for (let round = 0; round < 8; round++) {
          if (round === 6) { await view('scope'); await ctx.sleep(1500); }
          const shooter = round % 2 === 0 ? A : B, other = shooter === A ? B : A;
          const delay = [70, 140, 220][round % 3];
          // a laid gun first (15 mrad, a tank's width at 200 m); after 3 s the round goes whatever the lay
          await shooter.page.evaluate((d) => {
            window.__MB.setFire({ mode: 'once', maxErrMrad: 15 });
            window.__MB.arm({ triggers: [{ type: 'shell:fired', who: 'player', onscreen: false, delays: [d] }], periodicMs: 0 });
          }, delay);
          let frozen = false;
          for (let w = 0; w < 120 && !frozen; w++) {
            if (w === 60) await shooter.page.evaluate(() => { if (window.__MB.fire) { window.__MB.fire.maxErrMrad = 1e6; window.__MB.fire.anyTarget = true; } });
            frozen = (await shooter.page.evaluate(() => window.__MB.poll())).frozen;
            if (!frozen) await ctx.sleep(50);
          }
          if (!frozen) {
            // no shot event reached this page within 6 s: take the pair as it stands
            ctx.note(`round ${round + 1}: no shot within 6 s; paired frame without a shot`);
            if (round === 0) ctx.log('aim state after round 1', JSON.stringify(await aimState()));
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
            '[0]crop=1851:1080:34:0[a];[1]crop=1851:1080:34:0[b];[a][b]hstack', join(dir, out)]);
          spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, files.a), '-i', join(dir, files.b), '-filter_complex',
            '[0]crop=1200:700:360:190[a];[1]crop=1200:700:360:190[b];[a][b]hstack', join(dir, out.replace('.png', '-tight.png'))]);
          appendFileSync(join(dir, 'meta.jsonl'), `${JSON.stringify({ n: k, file: out, label: `pair round ${round + 1}`, reason: { type: 'pair', shooter: shooter === A ? 'A' : 'B', delayMs: delay }, pair: files })}\n`);
          for (const c of [A, B]) await c.page.evaluate(() => { window.__MB.arm(null); window.__MB.resume(); window.__MB.setFire(null); });
          await ctx.sleep(1200);
        }
        ctx.note('two clients of one LAN room on Steppe through the room double (A host alpha Challenger 3, B bravo T-90M); hour: the battle presets of __SHOTS.battleTime("sunset") on both');
      } finally {
        if (A.errors.length || B.errors.length) ctx.note(`client errors: ${[...A.errors, ...B.errors].slice(0, 4).join(' | ')}`);
        await A.context.close().catch(() => {});
        await B.context.close().catch(() => {});
      }
    },
  },
});

export function recipeFor(slot) { return RECIPES[slot] || null; }
