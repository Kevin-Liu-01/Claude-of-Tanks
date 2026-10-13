// Page-side capture director for tools/marketing-shots/mode-battle-shots.mjs (home page r2, 2026-10-12).
//
// installModeBattleDirector() is handed to page.evaluateOnNewDocument, so it runs before the game boots and must stay
// self-contained (Puppeteer serializes it; nothing from module scope reaches the page). It owns:
//   - a freezable frame clock: requestAnimationFrame is wrapped so a capture can hold the exact frame an event
//     produced (a muzzle flash, a hit, a crush) while the harness takes its screenshot, then resume with the time spent
//     frozen removed from the game's timestamps, so the battle carries on as if nothing had happened;
//   - per-frame hooks: scripted driving through the touch stick (input.setVirtualMove), gun laying (the player's aim
//     point under an external camera, rig.snapArcade / rig.snapSniper otherwise) with fire through __DEBUG.flags.forceFire,
//     and cinematic camera poses through rig.setExternalPose;
//   - triggers: bus events (shell:fired, shell:hit, tank:destroyed, prop:crushed, ...) that land on screen schedule a
//     freeze a few milliseconds later; a periodic trigger fills the gaps.
// Everything it drives is the game's own QA surface (window.__DEBUG); it never edits gameplay rules.

export function installModeBattleDirector() {
  if (window.__MB) return;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nowMs = () => performance.now();
  const TAU = Math.PI * 2;
  const wrapPi = (a) => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const MB = {
    frozen: false, freezeAtMs: Infinity, pending: null, frozenAtMs: 0, offsetMs: 0, held: [],
    lastFrameTs: -1, lastHookWall: 0, frames: 0, hookErrors: [], armed: null, lastFreezeMs: -Infinity,
    lastPeriodicMs: -Infinity, events: [], eventSeq: 0, meta: null, frozenCount: 0, attachedBus: null,
    camera: null, cameraState: null, aim: null, fire: null, drive: null, onFrame: null, selectors: {},
    hudMode: 'full', notes: [],
  };
  window.__MB = MB;

  // ---------------------------------------------------------------- frame clock
  function wrap(cb) {
    return (ts) => {
      if (MB.frozen) { MB.held.push(cb); return; }
      if (ts !== MB.lastFrameTs) {
        MB.lastFrameTs = ts;
        MB.frames++;
        runHooks();
      }
      cb(ts - MB.offsetMs);
      if (!MB.frozen && nowMs() >= MB.freezeAtMs) freeze();
    };
  }
  window.requestAnimationFrame = (cb) => nativeRaf(wrap(cb));

  function freeze() {
    MB.frozen = true;
    MB.frozenAtMs = nowMs();
    MB.freezeAtMs = Infinity;
    MB.lastFreezeMs = MB.frozenAtMs;
    MB.frozenCount++;
    try { MB.meta = describe(MB.pending); } catch (error) { MB.meta = { reason: MB.pending, error: String(error) }; }
    MB.pending = null;
  }
  MB.resume = () => {
    if (!MB.frozen) return false;
    MB.offsetMs += nowMs() - MB.frozenAtMs;
    MB.frozen = false;
    // gaps between candidates count from the resume: the screenshot's own time never shortens the play between frames
    MB.lastFreezeMs = nowMs();
    const held = MB.held;
    MB.held = [];
    for (const cb of held) nativeRaf(wrap(cb));
    return true;
  };
  /** Freeze the first frame rendered at least `ms` from now (no-op while a freeze is pending or held). */
  MB.freezeIn = (ms, reason) => {
    if (MB.frozen || MB.freezeAtMs !== Infinity) return false;
    MB.freezeAtMs = nowMs() + Math.max(0, ms);
    MB.pending = reason || { type: 'manual' };
    return true;
  };
  MB.poll = () => ({ frozen: MB.frozen, meta: MB.frozen ? MB.meta : null, frames: MB.frames,
    hookErrors: MB.hookErrors.slice(-3), pending: MB.freezeAtMs !== Infinity });

  // ---------------------------------------------------------------- helpers (H)
  const H = {};
  MB.H = H;
  H.D = () => window.__DEBUG;
  H.g = () => window.__DEBUG?.game;
  H.ms = () => window.__DEBUG?.game?.matchModeState || null;
  H.vec = (x = 0, y = 0, z = 0) => window.__DEBUG.camera.position.clone().set(x, y, z);
  H.groundY = (x, z) => {
    try { return window.__DEBUG.world.heightField.getHeightAt(x, z); } catch { return 0; }
  };
  H.live = (t) => !!(t && t.state && t.combat && !t.combat.destroyed && t.modeActive !== false);
  H.liveTanks = () => (H.g()?.tanks || []).filter(H.live);
  H.player = () => H.g()?.player || null;
  H.isEnemy = (t) => { const p = H.player(); return !!(t && p && t.team !== p.team); };
  H.enemies = () => H.liveTanks().filter(H.isEnemy);
  H.allies = () => { const p = H.player(); return H.liveTanks().filter((t) => t !== p && p && t.team === p.team); };
  H.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  H.info = (t) => {
    if (!t?.state) return null;
    const s = t.state, sp = s.speed || 0;
    return { id: t.id, specId: t.specId, team: t.team, x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw,
      vx: Math.sin(s.yaw) * sp, vz: Math.cos(s.yaw) * sp, speed: sp, h: t.spec?.dims?.heightM ?? 2.4,
      len: t.spec?.dims?.hullLengthM ?? 7, ent: t };
  };
  H.point = (x, y, z, extra = {}) => ({ x, y: y ?? H.groundY(x, z), z, yaw: 0, vx: 0, vz: 0, speed: 0, h: 2.4, len: 0, ...extra });
  H.nearest = (from, list) => {
    let best = null, bestD = Infinity;
    for (const t of list) { const d = H.dist(from, t.state ? t.state.pos : t); if (d < bestD) { bestD = d; best = t; } }
    return best;
  };
  H.raycastBlock = (a, b, margin = 1) => {
    // distance to the first world hit on the segment a->b (null when clear); world.raycast(origin, dir, maxDist)
    const D = H.D();
    const o = H.vec(a.x, a.y, a.z), d = H.vec(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length();
    if (len < 1e-3) return null;
    d.multiplyScalar(1 / len);
    try {
      const hit = D.world.raycast(o, d, Math.max(0, len - margin));
      return hit && Number.isFinite(hit.dist) ? hit.dist : null;
    } catch { return null; }
  };
  H.turretPoint = (t) => {
    const v = H.vec();
    try { t.visual.gunPivotWorld(v); return { x: v.x, y: v.y, z: v.z }; } catch { return { x: t.state.pos.x, y: t.state.pos.y + 2, z: t.state.pos.z }; }
  };
  H.clearShot = (from, to) => {
    const a = H.turretPoint(from), b = { x: to.state.pos.x, y: to.state.pos.y + (to.spec?.dims?.heightM ?? 2.4) * 0.5, z: to.state.pos.z };
    const block = H.raycastBlock(a, b, 3);
    return block == null;
  };
  H.project = (p) => {
    const D = H.D();
    const v = H.vec(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z);
    const cam = D.camera;
    const distM = v.distanceTo(cam.position);
    v.project(cam);
    return { x: v.x, y: v.y, z: v.z, distM, onScreen: v.z < 1 && Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.94 };
  };
  /** Teleport a tank (bot or player) to (x, z) facing yaw; it settles under the normal movement step. */
  H.place = (t, x, z, yaw = null) => {
    const y = H.groundY(x, z);
    const s = t.state;
    s.pos.set(x, y, z);
    if (yaw != null) s.yaw = wrapPi(yaw);
    s.speed = 0; s.verticalSpeed = 0; s.yawRate = 0; s.turretYawRate = 0;
    if (s._ride) { s._ride.y = y; s._ride.v = 0; s._ride.supportY = NaN; s._ride.groundV = 0; s._ride.airTime = 0; }
    if (s._spring) { s._spring.recoilVX = 0; s._spring.recoilVZ = 0; }
    if (s.aimPoint?.set) s.aimPoint.set(x + Math.sin(s.yaw) * 250, y + 2.5, z + Math.cos(s.yaw) * 250);
    if (t.input?.aimPoint?.copy && s.aimPoint) t.input.aimPoint.copy(s.aimPoint);
    try { t.visual?.syncFromState?.(s); } catch { /* visual optional */ }
  };
  // ---- open lanes: a sight line that neither terrain/props (world.raycast) nor foliage (concealment discs) blocks
  H.concealers = () => { try { return (H.D().world.getConcealment?.() || []).filter((c) => !c.dead); } catch { return []; } };
  H.laneClear = (eye, to, h = 2.4, discs = H.concealers()) => {
    const gy = H.groundY(to.x, to.z);
    for (const f of [0.3, 0.6, 0.9]) if (H.raycastBlock(eye, { x: to.x, y: gy + h * f, z: to.z }, 2) != null) return false;
    const dx = to.x - eye.x, dz = to.z - eye.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    for (const c of discs) {
      const wx = c.x - eye.x, wz = c.z - eye.z, along = wx * ux + wz * uz;
      if (along < 10 || along > len - 4) continue;
      // foliage matters near either end: it fills the foreground or covers the target. Mid-field, a 2.5 m sight
      // line passes under canopies and over the lane's shrubs at frame scale (r14: on Verdant every 200 m line
      // crossed some disc, so the stricter tests found no lane at all); terrain, buildings and props still block
      // through the raycast above.
      if (along > 30 && along < len - 40) continue;
      if (Math.abs(wx * uz - wz * ux) < c.r + 1.0) return false;
    }
    return true;
  };
  /** Ground a tank can sit on: inside the map, flat enough, no solid record within `clearM` nor foliage on it. */
  H.openGround = (x, z, clearM = 7, discs = H.concealers()) => {
    if (Math.abs(x) > 440 || Math.abs(z) > 440) return false;
    const y = H.groundY(x, z), s = 4;
    if (Math.abs(H.groundY(x + s, z) - y) > 1.6 || Math.abs(H.groundY(x, z + s) - y) > 1.6) return false;
    for (const c of discs) if (Math.hypot(c.x - x, c.z - z) < c.r + 1.5) return false;
    const obstacles = H.D().world.getObstacles?.() || [];
    for (const o of obstacles) {
      if (o.crushed || o.dead || o.crushable) continue;
      if (x > o.min[0] - clearM && x < o.max[0] + clearM && z > o.min[2] - clearM && z < o.max[2] + clearM) return false;
    }
    return true;
  };
  /**
   * Stage an engagement across open ground (the promo tool's surveyed-lane staging, 2026-09): from the player's spot,
   * or an open spot near it, find lanes toward the enemy that nothing hides, and move the nearest live enemies (their
   * AI kept) onto them; two allies take open ground beside the player. Returns what moved.
   */
  H.stageEngagement = ({ dists = [260, 220, 300, 180, 340], enemies: wantEnemies = 2, allies: wantAllies = 2, spotSearchM = [0, 40, 80, 130, 180] } = {}) => {
    const p = H.player();
    if (!H.live(p)) return null;
    const discs = H.concealers();
    const foes = H.enemies();
    const cx = foes.reduce((a, t) => a + t.state.pos.x, 0) / Math.max(1, foes.length);
    const cz = foes.reduce((a, t) => a + t.state.pos.z, 0) / Math.max(1, foes.length);
    const eyeH = (p.spec?.dims?.heightM ?? 2.4) * 0.92;
    const spots = [];
    for (const r of spotSearchM) {
      for (let k = 0; k < (r ? 10 : 1); k++) {
        const a = (k / 10) * Math.PI * 2;
        spots.push({ x: p.state.pos.x + Math.sin(a) * r, z: p.state.pos.z + Math.cos(a) * r });
      }
    }
    // then open ground forward along the line to the enemy (a spawn in the woods: Verdant, r14)
    for (const f of [0.2, 0.32, 0.44]) {
      const bx = p.state.pos.x + (cx - p.state.pos.x) * f, bz = p.state.pos.z + (cz - p.state.pos.z) * f;
      for (const r of [0, 45, 90]) {
        for (let k = 0; k < (r ? 8 : 1); k++) {
          const a = (k / 8) * Math.PI * 2;
          spots.push({ x: bx + Math.sin(a) * r, z: bz + Math.cos(a) * r });
        }
      }
    }
    for (const spot of spots) {
      if (spot !== spots[0] && !H.openGround(spot.x, spot.z, 9, discs)) continue;
      const eye = { x: spot.x, y: H.groundY(spot.x, spot.z) + eyeH, z: spot.z };
      const toward = Math.atan2(cx - spot.x, cz - spot.z);
      const lanes = [];
      for (const d of dists) {
        for (const lat of [0, 9, -9, 18, -18, 27, -27, 36, -36, 45, -45]) {
          const yaw = toward + lat * Math.PI / 180;
          const q = { x: spot.x + Math.sin(yaw) * d, z: spot.z + Math.cos(yaw) * d };
          if (!H.openGround(q.x, q.z, 6, discs) || !H.laneClear(eye, q, 2.4, discs)) continue;
          if (lanes.every((l) => Math.hypot(l.x - q.x, l.z - q.z) > 35)) lanes.push({ ...q, d, yaw });
          if (lanes.length >= wantEnemies) break;
        }
        if (lanes.length >= wantEnemies) break;
      }
      if (!lanes.length) continue;
      const moved = { spot: spot === spots[0] ? 'kept' : 'moved', lanes: [], allies: [] };
      if (spot !== spots[0]) H.place(p, spot.x, spot.z, toward);
      const nearest = foes.slice().sort((a, b) => H.dist(a.state.pos, spot) - H.dist(b.state.pos, spot));
      lanes.forEach((lane, i) => {
        const t = nearest[i];
        if (!t) return;
        // angled about 30 degrees off the line to the player: a three-quarter target, never a flat side
        H.place(t, lane.x, lane.z, lane.yaw + Math.PI + (i % 2 ? -0.52 : 0.52));
        moved.lanes.push({ id: t.id, specId: t.specId, d: Math.round(lane.d) });
      });
      const friends = H.allies().sort((a, b) => H.dist(a.state.pos, spot) - H.dist(b.state.pos, spot)).slice(0, wantAllies);
      friends.forEach((t, i) => {
        const side = (i % 2 ? -1 : 1) * (14 + 6 * Math.floor(i / 2));
        const x = spot.x + Math.cos(toward) * side - Math.sin(toward) * 6, z = spot.z - Math.sin(toward) * side - Math.cos(toward) * 6;
        if (!H.openGround(x, z, 4, discs)) return;
        H.place(t, x, z, toward);
        moved.allies.push(t.id);
      });
      return moved;
    }
    return null;
  };
  /** Destroy every live enemy except `keepIds` the way __DEBUG.slayEnemies does (the last one is left for a real shell). */
  H.killExcept = (keepIds = [], cause = 'shot') => {
    const D = H.D(), g = H.g();
    let n = 0;
    for (const t of H.enemies()) {
      if (keepIds.includes(t.id)) continue;
      t.combat.hp = 0; t.combat.destroyed = true; t.combat.fire.burning = false;
      if (t._destroyedAnnounced) continue;
      t._destroyedAnnounced = true;
      try { t.visual?.setDestroyed?.({ pop: cause === 'ammorack' }); } catch { /* visual optional */ }
      try { g._wreckTurrets?.launch(t, cause, Math.round(g.timeS * 60)); } catch { /* optional */ }
      D.bus.emit('tank:destroyed', { id: t.id, specId: t.specId, pos: [t.state.pos.x, t.state.pos.y, t.state.pos.z], killerId: g.player ? g.player.id : null, cause });
      n++;
    }
    return n;
  };
  /** Stage an engine fire on a tank, as a real engine hit starts one (module state + fire ticks + the bus events). */
  H.igniteEngine = (t, { ticks = 40, modules = ['engine'] } = {}) => {
    const D = H.D();
    t.combat.fire.burning = true; t.combat.fire.ticksLeft = ticks; t.combat.fire.tickTimer = 0;
    for (const name of modules) {
      const m = t.combat.modules?.[name];
      if (m) { m.state = m.state === 'red' ? 'red' : 'yellow'; if (typeof m.hp === 'number' && typeof m.maxHp === 'number') m.hp = Math.min(m.hp, m.maxHp * 0.45); }
      D.bus.emit('module:state', { id: t.id, module: name, state: m?.state || 'yellow', source: 'hit' });
    }
    D.bus.emit('tank:fire', { id: t.id, burning: true });
    return true;
  };
  /** Gun Game: put a tank on ladder stage `stage` through the controller's own checkpoint round trip. */
  H.setWeaponStage = (t, stage) => {
    const g = H.g(), ctl = g.matchModeController;
    const per = ctl?.ruleset?.gunGame?.killsPerWeapon;
    if (!ctl || !per) return null;
    const cp = ctl.captureCheckpoint(g.timeS);
    const kills = new Map(cp.weaponKills);
    kills.set(t.id, stage * per);
    cp.weaponKills = [...kills];
    ctl.restoreCheckpoint(cp);
    g.matchModeState = ctl.serialize(g.player.id);
    return g.matchModeState.weaponStage || null;
  };
  H.tap = (action) => { H.D().input.tapVirtual(action); return action; };
  H.freezeBot = (t) => { if (!t) return; t.aiCtl = null; t.input.throttle = 0; t.input.steer = 0; t.input.brake = true; t.input.fire = false; t.state.speed = 0; };
  H.modeSummary = () => {
    const ms = H.ms();
    if (!ms) return null;
    const out = { id: ms.id, score: ms.score, target: ms.target };
    if (ms.flags?.length) out.flags = ms.flags.map((f) => ({ team: f.team, status: f.status, carrierId: f.carrierId }));
    if (ms.zones?.length) out.zones = ms.zones.map((z) => ({ id: z.id, owner: z.owner, contested: z.contested, control: Math.round((z.control || 0) * 100) / 100 }));
    if (ms.ball) out.ball = { x: Math.round(ms.ball.x), z: Math.round(ms.ball.z), y: Math.round(ms.ball.y * 10) / 10 };
    if (ms.horde) out.horde = { wave: ms.horde.wave, alive: ms.horde.alive, total: ms.horde.total };
    if (ms.line) out.line = ms.line;
    if (ms.boss) out.boss = { id: ms.boss.id, hp: Math.round(ms.boss.hp) };
    if (ms.infection) out.infection = ms.infection;
    if (ms.weaponStage) out.weaponStage = ms.weaponStage;
    if (ms.pickups?.length) out.pickups = ms.pickups.filter((p) => p.active).length;
    return out;
  };

  // ---------------------------------------------------------------- selectors
  // A selector names a subject: a built-in key, 'entity:<id>', 'point:x,z' / 'point:x,y,z', or a recipe-defined
  // selector (MB.defineSelector(name, source) where source is the body of (H, D, g, ms) => info|null).
  const builtins = {
    player: () => H.info(H.player()),
    nearestEnemy: () => { const p = H.player(); return p ? H.info(H.nearest(p.state.pos, H.enemies())) : null; },
    nearestEnemyClear: () => {
      // the nearest enemy nothing hides (terrain, props or foliage), memoised per frame: three hooks ask each frame
      if (MB.clearMemo && MB.clearMemo.frame === MB.frames) return MB.clearMemo.value;
      const p = H.player();
      let value = null;
      if (p) {
        const discs = H.concealers();
        const eye = H.turretPoint(p);
        const list = H.enemies().sort((a, b) => H.dist(a.state.pos, p.state.pos) - H.dist(b.state.pos, p.state.pos));
        for (const t of list.slice(0, 8)) {
          if (H.laneClear(eye, t.state.pos, t.spec?.dims?.heightM ?? 2.4, discs)) { value = H.info(t); break; }
        }
      }
      MB.clearMemo = { frame: MB.frames, value };
      return value;
    },
    aimTarget: () => H.info(MB.aimTargetId ? H.g()?.tankById?.get(MB.aimTargetId) : null),
    flagCarrier: () => {
      const ms = H.ms(); const f = ms?.flags?.find((x) => x.status === 'carried' && x.carrierId);
      return f ? H.info(H.g().tankById.get(f.carrierId)) : null;
    },
    ball: () => { const b = H.ms()?.ball; return b ? H.point(b.x, b.y, b.z, { vx: b.vx, vz: b.vz, speed: Math.hypot(b.vx, b.vz), yaw: Math.atan2(b.vx, b.vz), h: 3 }) : null; },
    boss: () => { const b = H.ms()?.boss; return b ? H.info(H.g().tankById.get(b.id)) : null; },
    contestedZone: () => {
      const zs = H.ms()?.zones || [];
      const z = zs.find((x) => x.contested) || zs[0];
      return z ? H.point(z.x, z.y, z.z, { id: z.id }) : null;
    },
    fightCenter: () => {
      const p = H.player(); if (!p) return null;
      const ours = H.liveTanks().filter((t) => t.team === p.team), theirs = H.enemies();
      let best = null, bestD = Infinity;
      for (const a of ours) for (const b of theirs) {
        const d = H.dist(a.state.pos, b.state.pos);
        if (d < bestD) { bestD = d; best = [a, b]; }
      }
      if (!best) return null;
      const [a, b] = best;
      const x = (a.state.pos.x + b.state.pos.x) / 2, z = (a.state.pos.z + b.state.pos.z) / 2;
      return H.point(x, null, z, { yaw: Math.atan2(b.state.pos.x - a.state.pos.x, b.state.pos.z - a.state.pos.z), spanM: bestD, aId: a.id, bId: b.id });
    },
    lastPlayerShell: () => {
      const g = H.g(), p = H.player(); if (!g || !p) return null;
      for (let i = g.shells.length - 1; i >= 0; i--) {
        const s = g.shells[i];
        if (s && !s.dead && s.shooterId === p.id && s.pos) {
          const v = s.vel || { x: 0, y: 0, z: 0 };
          return H.point(s.pos.x, s.pos.y, s.pos.z, { vx: v.x, vz: v.z, speed: Math.hypot(v.x, v.z), yaw: Math.atan2(v.x, v.z), h: 0.5, shellId: s.id });
        }
      }
      return null;
    },
  };
  MB.defineSelector = (name, source) => { MB.selectors[name] = new Function('H', 'D', 'g', 'ms', source); return true; };
  H.sel = (sel) => {
    if (!sel) return null;
    if (typeof sel === 'object') return sel;
    const D = H.D(), g = H.g(), ms = H.ms();
    if (MB.selectors[sel]) { try { return MB.selectors[sel](H, D, g, ms); } catch (error) { note('selector ' + sel + ': ' + error); return null; } }
    if (builtins[sel]) return builtins[sel]();
    if (sel.startsWith('entity:')) return H.info(g?.tankById?.get(sel.slice(7)));
    if (sel.startsWith('point:')) {
      const n = sel.slice(6).split(',').map(Number);
      return n.length === 3 ? H.point(n[0], n[1], n[2]) : H.point(n[0], null, n[1]);
    }
    return null;
  };
  function note(text) { MB.notes.push(String(text)); if (MB.notes.length > 50) MB.notes.shift(); }

  // ---------------------------------------------------------------- hooks
  function runHooks() {
    const D = window.__DEBUG;
    const g = D?.game;
    if (!D || !g) return;
    const wall = nowMs();
    const dt = clamp((wall - (MB.lastHookWall || wall)) / 1000, 0, 0.1);
    MB.lastHookWall = wall;
    // the battle hooks need a live battle; the clock's own triggers also run through the ending replay
    const hooks = g.phase === 'battle'
      ? [['drive', driveHook], ['camera', cameraHook], ['aim', aimHook], ['fire', fireHook], ['custom', customHook], ['periodic', periodicHook]]
      : [['periodic', periodicHook]];
    for (const [name, fn] of hooks) {
      try { fn(D, g, dt); } catch (error) {
        MB.hookErrors.push(`${name}: ${error && error.stack ? error.stack.split('\n').slice(0, 2).join(' | ') : error}`);
        if (MB.hookErrors.length > 20) MB.hookErrors.shift();
      }
    }
  }

  // driving through the touch stick: MB.setDrive({ to: [x, z] | sel, throttle, arriveM, reverse }) / null
  MB.setDrive = (spec) => { MB.drive = spec ? { arriveM: 6, throttle: 1, ...spec, arrived: false } : null; if (!spec) H.D()?.input?.setVirtualMove(0, 0); return true; };
  function driveHook(D) {
    const spec = MB.drive;
    if (!spec) return;
    const p = D.game.player;
    if (!H.live(p)) { D.input.setVirtualMove(0, 0); return; }
    let tx, tz;
    if (Array.isArray(spec.to)) { tx = spec.to[0]; tz = spec.to[1]; }
    else if (spec.to) { const s = H.sel(spec.to); if (!s) { D.input.setVirtualMove(0, 0); return; } tx = s.x; tz = s.z; }
    else if (spec.heading != null) { tx = p.state.pos.x + Math.sin(spec.heading) * 100; tz = p.state.pos.z + Math.cos(spec.heading) * 100; }
    else return;
    const dx = tx - p.state.pos.x, dz = tz - p.state.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < spec.arriveM && spec.heading == null) {
      spec.arrived = true;
      D.input.setVirtualMove(0, spec.holdThrottle ?? 0);
      return;
    }
    const want = Math.atan2(dx, dz);
    const yaw = spec.reverse ? wrapPi(p.state.yaw + Math.PI) : p.state.yaw;
    const diff = wrapPi(want - yaw);
    // TankInput steer is positive hull yaw and the stick's x is screen-right: steer = -x
    const steer = clamp(diff * 2.2, -1, 1) * (spec.reverse ? -1 : 1);
    const throttle = (spec.reverse ? -1 : 1) * spec.throttle * (Math.abs(diff) > 1.1 ? 0.35 : 1);
    D.input.setVirtualMove(-steer, throttle);
  }

  // gun laying: MB.setAim({ target: sel, leadShellSlot }) / null. Under the game's own cameras the camera aims
  // (cameraHook chase/scope); under an external pose the player's aim point is written directly.
  MB.setAim = (spec) => { MB.aim = spec ? { ...spec } : null; return true; };
  function leadPoint(p, t) {
    const pivot = H.turretPoint(p);
    const slot = clamp(p.combat?.shellSlot ?? 0, 0, (p.spec?.gun?.shells?.length || 1) - 1);
    const shell = p.spec?.gun?.shells?.[slot];
    const vel = shell?.velocityMps || 1500;
    // MB.setAim({ aimAt: 'ammoRack' }) lays the gun on a module's own volume (spec.armor.modules) instead of the hull
    const module = MB.aim?.aimAt && t.ent ? H.moduleWorld(t.ent, MB.aim.aimAt) : null;
    const ox = module ? module.x - t.x : 0, oz = module ? module.z - t.z : 0;
    let ax = t.x + ox, az = t.z + oz;
    const ay = module ? module.y : t.y + t.h * (MB.aim?.heightFrac ?? 0.5);
    for (let i = 0; i < 2; i++) {
      const travel = Math.hypot(ax - pivot.x, ay - pivot.y, az - pivot.z) / vel;
      ax = t.x + ox + t.vx * travel; az = t.z + oz + t.vz * travel;
    }
    return { x: ax, y: ay, z: az, pivot };
  }
  /** World centre of a tank's largest module box of that name (src/vehicles/specHelpers.ts ModuleBox). */
  H.moduleWorld = (t, name) => {
    const boxes = (t?.spec?.armor?.modules || []).filter((b) => b.module === name && b.min && b.max);
    if (!boxes.length) return null;
    const volume = (b) => Math.abs((b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]));
    const b = boxes.reduce((a, c) => (volume(c) > volume(a) ? c : a));
    let lx = (b.min[0] + b.max[0]) / 2, ly = (b.min[1] + b.max[1]) / 2, lz = (b.min[2] + b.max[2]) / 2;
    if (b.turretLocal) {
      const pivotLocal = t.spec.armor.turretPivot || [0, 0, 0];
      const ty = t.state.turretYaw || 0, c = Math.cos(ty), s = Math.sin(ty);
      const rx = lx * c + lz * s, rz = -lx * s + lz * c;
      lx = pivotLocal[0] + rx; ly = pivotLocal[1] + ly; lz = pivotLocal[2] + rz;
    }
    const y = t.state.yaw || 0, c = Math.cos(y), s = Math.sin(y);
    return { x: t.state.pos.x + lx * c + lz * s, y: t.state.pos.y + ly, z: t.state.pos.z - lx * s + lz * c };
  };
  function aimHook(D) {
    const spec = MB.aim;
    if (!spec) return;
    const p = D.game.player;
    if (!H.live(p)) return;
    // the gun stays on the nearest enemy while no target is clear (fire still waits for a clear one: fireHook)
    const t = H.sel(spec.target) || (spec.fallback === false ? null : H.sel(spec.fallback || 'nearestEnemy'));
    MB.aimTargetId = t?.id ?? null;
    if (!t) return;
    const lp = leadPoint(p, t);
    MB.aimLead = lp;
    if (D.rig.externalActive && p.input?.aimPoint?.set) p.input.aimPoint.set(lp.x, lp.y, lp.z);
  }

  // fire: MB.setFire({ mode: 'auto' | 'once' | 'off', maxErrMrad }) through the QA forceFire flag
  MB.setFire = (spec) => { MB.fire = spec ? { maxErrMrad: 6, ...spec, shots: 0 } : null; if (!spec && H.D()?.flags) H.D().flags.forceFire = false; return true; };
  function fireHook(D) {
    const spec = MB.fire;
    if (!spec) return;
    const p = D.game.player;
    if (!H.live(p) || spec.mode === 'off') { D.flags.forceFire = false; return; }
    const err = typeof D.gunAimError === 'function' ? D.gunAimError() : 0;
    const t = MB.aim ? H.sel(MB.aim.target) : null;
    // with a gun-laying target named, fire only while that target exists (r14 run 1 fired into its own allies' backs)
    if (MB.aim && !t && !spec.anyTarget) { D.flags.forceFire = false; return; }
    const clear = !spec.requireClear || !t?.ent || H.clearShot(p, t.ent);
    D.flags.forceFire = (spec.mode === 'auto' || (spec.mode === 'once' && spec.shots < 1)) && err * 1000 <= spec.maxErrMrad && clear;
  }

  MB.setOnFrame = (source) => { MB.onFrame = source ? new Function('H', 'D', 'g', 'MB', 'dt', source) : null; MB.onFrameState = {}; return true; };
  function customHook(D, g, dt) { if (MB.onFrame) MB.onFrame(H, D, g, MB, dt); }

  // ---------------------------------------------------------------- cameras
  // MB.setCamera(spec): { kind: 'game' } leaves the rig alone; 'chase' snaps the arcade camera onto a target each frame
  // (the gun follows the camera); 'scope' snaps the sight; 'follow' poses an external camera relative to a subject's
  // heading; 'between' sits behind one subject looking at another; 'crane' looks down on a point from a world or
  // team-relative bearing; 'fixed' holds a pose.
  MB.setCamera = (spec) => {
    MB.camera = spec ? { ...spec } : null;
    MB.cameraState = null;
    if (spec?.hud) MB.setHud(spec.hud);
    const D = H.D();
    if (D?.rig && (!spec || spec.kind === 'game' || spec.kind === 'chase' || spec.kind === 'scope')) D.rig.release();
    return true;
  };
  function smoothTo(state, key, target, dt, smoothS) {
    if (!state[key] || !smoothS) { state[key] = { ...target }; return state[key]; }
    const k = 1 - Math.exp(-dt / Math.max(0.01, smoothS));
    const cur = state[key];
    cur.x += (target.x - cur.x) * k; cur.y += (target.y - cur.y) * k; cur.z += (target.z - cur.z) * k;
    return cur;
  }
  function headingOf(s, spec) {
    if (spec.headingDeg != null) return spec.headingDeg * Math.PI / 180;
    if (spec.headingFrom === 'velocity' && s.speed > 1.5) return Math.atan2(s.vx, s.vz);
    return s.yaw || 0;
  }
  function liftAboveGround(pos, minAbove) {
    const gy = H.groundY(pos.x, pos.z);
    if (pos.y < gy + minAbove) pos.y = gy + minAbove;
    return pos;
  }
  function followPose(spec, s) {
    const heading = headingOf(s, spec);
    const base = (spec.azimuthDeg ?? 35) * Math.PI / 180;
    const look = {
      x: s.x + (s.vx || 0) * (spec.lookAheadS ?? 0.25),
      y: s.y + (spec.lookAtHeightM ?? s.h * 0.55),
      z: s.z + (s.vz || 0) * (spec.lookAheadS ?? 0.25),
    };
    const tries = spec.avoid === false ? [0] : [0, 12, -12, 24, -24, 36, -36, 50, -50];
    let pick = null;
    for (const extra of tries) {
      const a = heading + base + extra * Math.PI / 180;
      const dist = spec.distM ?? 14;
      const cam = { x: s.x + Math.sin(a) * dist, z: s.z + Math.cos(a) * dist, y: 0 };
      const gy = H.groundY(cam.x, cam.z);
      cam.y = spec.heightAbove === 'subject' ? s.y + (spec.heightM ?? 1.6) : Math.max(gy + (spec.heightM ?? 1.6), s.y + (spec.minRelHeightM ?? -1));
      liftAboveGround(cam, spec.groundMinM ?? 0.6);
      const block = H.raycastBlock(look, cam, 0.5);
      if (block == null || block > dist - 1.5) { pick = cam; break; }
      if (!pick) pick = cam;
    }
    if (spec.lateralShiftM) {
      // move the look point sideways so the subject sits off-centre (rule of thirds)
      const a = Math.atan2(look.x - pick.x, look.z - pick.z) + Math.PI / 2;
      look.x += Math.sin(a) * spec.lateralShiftM; look.z += Math.cos(a) * spec.lateralShiftM;
    }
    return { cam: pick, look };
  }
  function betweenPose(spec, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, px = uz, pz = -ux;
    const cam = {
      x: a.x - ux * (spec.backM ?? 9) + px * (spec.sideM ?? 3),
      z: a.z - uz * (spec.backM ?? 9) + pz * (spec.sideM ?? 3),
      y: 0,
    };
    cam.y = Math.max(H.groundY(cam.x, cam.z) + (spec.heightM ?? 2.2), a.y + (spec.minRelHeightM ?? 0.5));
    const f = spec.lookAtFrac ?? 0.35;
    const look = { x: a.x + dx * f, z: a.z + dz * f, y: 0 };
    look.y = (spec.lookAtY === 'ground' ? H.groundY(look.x, look.z) : a.y + (b.y - a.y) * f) + (spec.lookAtHeightM ?? 1.5);
    return { cam: liftAboveGround(cam, 0.6), look };
  }
  function cranePose(spec, c) {
    let bearing = (spec.azimuthDeg ?? 210) * Math.PI / 180;
    if (spec.relative === 'subject') bearing += c.yaw || 0;
    const cam = { x: c.x + Math.sin(bearing) * (spec.distM ?? 80), z: c.z + Math.cos(bearing) * (spec.distM ?? 80), y: 0 };
    cam.y = Math.max(H.groundY(cam.x, cam.z), c.y) + (spec.heightM ?? 45);
    const look = { x: c.x, y: c.y + (spec.lookAtHeightM ?? 2), z: c.z };
    return { cam, look };
  }
  function cameraHook(D, g, dt) {
    const spec = MB.camera;
    if (!spec || spec.kind === 'game') return;
    const p = g.player;
    const st = MB.cameraState || (MB.cameraState = {});
    if (spec.kind === 'chase' || spec.kind === 'scope') {
      if (!H.live(p)) return;
      // a camera never drops back to the bare rig while its named target is momentarily hidden: it follows the
      // nearest enemy until that target is clear again (r14: scope frames fell back to the chase orbit)
      const t = H.sel(spec.target || MB.aim?.target || 'nearestEnemy') || (spec.fallback === false ? null : H.sel(spec.fallback || 'nearestEnemy'));
      if (!t) return;
      MB.aimTargetId = t.id ?? MB.aimTargetId;
      if (spec.kind === 'scope') {
        const lp = leadPoint(p, t);
        const yaw = Math.atan2(lp.x - lp.pivot.x, lp.z - lp.pivot.z);
        const pitch = Math.atan2(lp.y - lp.pivot.y, Math.hypot(lp.x - lp.pivot.x, lp.z - lp.pivot.z));
        D.rig.snapSniper(spec.zoom ?? 8, yaw + (spec.yawOffsetDeg ?? 0) * Math.PI / 180, pitch + (spec.pitchOffsetDeg ?? 0) * Math.PI / 180);
        return;
      }
      // chase: point the arcade orbit (and so the gun) at the lead point; two solves converge the pitch
      const lp = leadPoint(p, t);
      let yaw = Math.atan2(lp.x - p.state.pos.x, lp.z - p.state.pos.z) + (spec.yawOffsetDeg ?? 0) * Math.PI / 180;
      let pitch = (spec.pitchDeg ?? -3) * Math.PI / 180;
      for (let i = 0; i < 2; i++) {
        D.rig.snapArcade(spec.step ?? 2, yaw, pitch);
        const c = D.camera.position;
        if (spec.aimThroughCentre === false) break;
        yaw = Math.atan2(lp.x - c.x, lp.z - c.z);
        pitch = Math.atan2(lp.y - c.y, Math.hypot(lp.x - c.x, lp.z - c.z));
      }
      D.rig.snapArcade(spec.step ?? 2, yaw, pitch);
      return;
    }
    let pose = null;
    if (spec.kind === 'fixed') pose = { cam: { x: spec.pos[0], y: spec.pos[1], z: spec.pos[2] }, look: { x: spec.look[0], y: spec.look[1], z: spec.look[2] } };
    else if (spec.kind === 'follow') { const s = H.sel(spec.subject || 'player'); if (s) pose = followPose(spec, s); }
    else if (spec.kind === 'between') {
      const a = H.sel(spec.from || 'player'), b = H.sel(spec.to || 'nearestEnemy');
      if (a && b) pose = betweenPose(spec, a, b);
    } else if (spec.kind === 'crane') { const c = H.sel(spec.center || 'fightCenter'); if (c) pose = cranePose(spec, c); }
    if (!pose) return;
    const cam = smoothTo(st, 'cam', pose.cam, dt, spec.smoothS ?? 0.4);
    const look = smoothTo(st, 'look', pose.look, dt, spec.lookSmoothS ?? spec.smoothS ?? 0.25);
    liftAboveGround(cam, spec.groundMinM ?? 0.5);
    D.rig.setExternalPose(H.vec(cam.x, cam.y, cam.z), H.vec(look.x, look.y, look.z), spec.fov ?? 42);
  }

  // ---------------------------------------------------------------- HUD visibility
  // 'full' keeps the live HUD; 'noreticle' hides the reticle canvas only (external poses put the gun's reticle
  // wherever the camera happens to project it); 'hidden' hides the whole battle UI for a clean cinematic frame.
  MB.setHud = (mode) => {
    MB.hudMode = mode;
    let style = document.getElementById('mb-hud-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'mb-hud-style';
      style.textContent = [
        'html.mb-hud-noreticle .cot-hud > .cot-ret{visibility:hidden!important}',
        'html.mb-hud-hidden .cot-hud,html.mb-hud-hidden .cot-dp,html.mb-hud-hidden .cot-si-stats,',
        'html.mb-hud-hidden .cot-hints,html.mb-hud-hidden .cot-medal-toasts,html.mb-hud-hidden #cot-perfhud,',
        'html.mb-hud-hidden .cot-touch,html.mb-hud-hidden .cot-mode-status,html.mb-hud-hidden .cot-mp-strip{display:none!important}',
        // the opt-in frame-rate/link readout (hud.ts .cot-net, the perf meter setting) is telemetry, not the player's HUD
        '#cot-perfhud,.cot-debug-hud,.cot-hud .cot-net{display:none!important}',
      ].join('');
      document.head.appendChild(style);
    }
    document.documentElement.classList.toggle('mb-hud-noreticle', mode === 'noreticle');
    document.documentElement.classList.toggle('mb-hud-hidden', mode === 'hidden');
    return mode;
  };

  // ---------------------------------------------------------------- events and triggers
  const EVENT_TYPES = ['shell:fired', 'shell:hit', 'tank:destroyed', 'prop:crushed', 'tank:fire', 'module:state',
    'tank:spotted', 'player:spotted', 'battle:ended', 'ending:begin', 'ending:done', 'tank:ram', 'tank:impact',
    'killcam:start', 'killcam:done', 'player:reload',
    // the match modes' own events (game/state.ts drains matchModes emit('mode_x') onto the bus as 'mode:x')
    'mode:ball_hit', 'mode:goal_scored', 'mode:flag_taken', 'mode:flag_captured', 'mode:flag_dropped'];
  const COPY = ['shooterId', 'id', 'targetId', 'attackerId', 'killerId', 'cause', 'kind', 'isPlayer', 'shellType',
    'shellName', 'caliberMm', 'rocket', 'destroyed', 'ammoRacked', 'fireStarted', 'damage', 'module', 'state',
    'burning', 'team', 'speedMps', 'beat', 'specId', 'shellId', 'muzzleIndex', 'by'];
  MB.attach = () => {
    const D = window.__DEBUG;
    if (!D?.bus?.on) return false;
    if (MB.attachedBus === D.bus) return true;
    MB.attachedBus = D.bus;
    for (const type of EVENT_TYPES) {
      try { D.bus.on(type, (payload) => onEvent(type, payload)); } catch { /* unknown event names are fine */ }
    }
    return true;
  };
  function onEvent(type, p) {
    const g = H.g();
    const e = { seq: ++MB.eventSeq, type, wall: nowMs(), t: g?.timeS ?? null };
    if (p && typeof p === 'object') {
      for (const key of COPY) if (p[key] !== undefined && (typeof p[key] !== 'object' || p[key] === null)) e[key] = p[key];
      const pos = p.muzzlePos || p.pos || p.point;
      if (pos) e.pos = Array.isArray(pos) || ArrayBuffer.isView(pos) ? [pos[0], pos[1], pos[2]] : (pos.x !== undefined ? [pos.x, pos.y, pos.z] : undefined);
      if (!e.pos && (type === 'tank:fire' || type === 'module:state') && p.id) {
        const t = g?.tankById?.get(p.id);
        if (t?.state) e.pos = [t.state.pos.x, t.state.pos.y + 1.5, t.state.pos.z];
      }
      // a ram or shot on the Turbo Ball happens where the ball is; a flag event where its carrier is
      if (!e.pos && type === 'mode:ball_hit') { const b = H.ms()?.ball; if (b) e.pos = [b.x, b.y, b.z]; }
      if (!e.pos && type.startsWith('mode:flag') && p.by) {
        const t = g?.tankById?.get(p.by);
        if (t?.state) e.pos = [t.state.pos.x, t.state.pos.y + 1.5, t.state.pos.z];
      }
    }
    MB.events.push(e);
    if (MB.events.length > 600) MB.events.splice(0, 200);
    if (type === 'shell:fired' && MB.fire) {
      const p = H.player();
      if (p && (e.shooterId === p.id || e.isPlayer === true)) MB.fire.shots = (MB.fire.shots || 0) + 1;
    }
    if (MB.armed) maybeTrigger(e);
  }
  function whoMatches(rule, e) {
    const p = H.player();
    const actor = e.shooterId ?? e.attackerId ?? e.killerId ?? e.by ?? e.id;
    if (!rule.who || rule.who === 'any') return true;
    if (rule.who === 'player') return !!p && (actor === p.id || e.isPlayer === true);
    if (rule.who === 'notPlayer') return !!p && actor !== p.id;
    if (rule.who === 'subject') { const s = H.sel(MB.camera?.subject || MB.camera?.from || 'player'); return !!s && actor === s.id; }
    if (rule.who === 'victimPlayer') return !!p && (e.targetId === p.id || e.id === p.id);
    if (rule.who === 'enemy' || rule.who === 'ally') {
      const t = H.g()?.tankById?.get(actor);
      return !!t && (rule.who === 'enemy' ? H.isEnemy(t) : !H.isEnemy(t));
    }
    if (typeof rule.who === 'string' && rule.who.startsWith('id:')) return actor === rule.who.slice(3);
    return true;
  }
  function maybeTrigger(e) {
    const arm = MB.armed;
    if (MB.frozen || MB.freezeAtMs !== Infinity || MB.burstQueue?.length) return;
    if (nowMs() - MB.lastFreezeMs < (arm.minGapMs ?? 450)) return;
    for (const rule of arm.triggers || []) {
      if (rule.type !== e.type) continue;
      if (rule.kinds && !rule.kinds.includes(e.kind)) continue;
      if (rule.filter && !new Function('e', 'H', `return (${rule.filter});`)(e, H)) continue;
      if (!whoMatches(rule, e)) continue;
      let proj = null;
      if (rule.onscreen !== false && e.pos) {
        proj = H.project(e.pos);
        if (!proj.onScreen || proj.distM > (rule.maxDistM ?? 700)) continue;
        if (rule.minDistM && proj.distM < rule.minDistM) continue;
      }
      rule.n = (rule.n || 0) + 1;
      const delays = rule.delays || [40];
      if (rule.burst) {
        const base = nowMs() - MB.offsetMs;
        const screen = proj ? [Math.round(proj.x * 100) / 100, Math.round(proj.y * 100) / 100, Math.round(proj.distM)] : null;
        MB.burstQueue = delays.slice().sort((a, b) => a - b).map((d) => ({ at: base + d,
          reason: { type: e.type, delayMs: d, seq: e.seq, burst: true, actor: e.shooterId ?? e.attackerId ?? e.killerId ?? e.by ?? e.id, kind: e.kind, cause: e.cause, screen } }));
        return;
      }
      const delay = delays[(rule.n - 1) % delays.length];
      MB.freezeIn(delay, { type: e.type, delayMs: delay, seq: e.seq, actor: e.shooterId ?? e.attackerId ?? e.killerId ?? e.by ?? e.id,
        kind: e.kind, cause: e.cause, screen: proj ? [Math.round(proj.x * 100) / 100, Math.round(proj.y * 100) / 100, Math.round(proj.distM)] : null });
      return;
    }
  }
  function periodicHook() {
    const arm = MB.armed;
    if (!arm || MB.frozen || MB.freezeAtMs !== Infinity) return;
    if (MB.burstQueue?.length) {
      const next = MB.burstQueue[0];
      if (nowMs() - MB.offsetMs >= next.at) { MB.burstQueue.shift(); MB.freezeIn(0, next.reason); }
      return;
    }
    if (!arm.periodicMs) return;
    const now = nowMs();
    if (now - Math.max(MB.lastFreezeMs, MB.lastPeriodicMs, arm.armedAt) < arm.periodicMs) return;
    MB.lastPeriodicMs = now;
    MB.freezeIn(0, { type: 'periodic' });
  }
  MB.arm = (config) => {
    MB.armed = config ? { ...config, armedAt: nowMs() } : null;
    MB.lastPeriodicMs = nowMs();
    if (!config) MB.burstQueue = [];
    return true;
  };
  /** Queue freezes at these offsets (ms of game-presentation time) from now, e.g. around a scripted action. */
  MB.burstIn = (delays, reason = {}) => {
    const base = nowMs() - MB.offsetMs;
    MB.burstQueue = delays.slice().sort((a, b) => a - b).map((d) => ({ at: base + d, reason: { type: 'burst', delayMs: d, ...reason } }));
    return MB.burstQueue.length;
  };

  // ---------------------------------------------------------------- frame description
  function describe(reason) {
    const D = H.D(), g = H.g();
    const cam = D.camera;
    const dir = H.vec(); cam.getWorldDirection(dir);
    const p = H.player();
    const onScreen = { player: 0, enemy: 0 };
    let nearestOnScreen = Infinity;
    for (const t of H.liveTanks()) {
      if (t === p && D.rig.mode === 'SNIPER') continue;
      const pr = H.project([t.state.pos.x, t.state.pos.y + 1.2, t.state.pos.z]);
      if (!pr.onScreen || pr.distM > 900) continue;
      onScreen[t.team === p?.team ? 'player' : 'enemy']++;
      if (t !== p) nearestOnScreen = Math.min(nearestOnScreen, pr.distM);
    }
    let shellsOnScreen = 0;
    for (const s of g.shells || []) {
      if (!s || s.dead || !s.pos) continue;
      const pr = H.project([s.pos.x, s.pos.y, s.pos.z]);
      if (pr.onScreen && pr.distM < 800) shellsOnScreen++;
    }
    const recent = {};
    const wall = nowMs();
    for (let i = MB.events.length - 1; i >= 0 && wall - MB.events[i].wall < 1500; i--) {
      const ev = MB.events[i];
      if (ev.pos) { const pr = H.project(ev.pos); if (!pr.onScreen || pr.distM > 800) continue; }
      recent[ev.type] = (recent[ev.type] || 0) + 1;
    }
    let burningOnScreen = 0;
    for (const t of g.tanks || []) {
      if (!t?.state || !t.combat) continue;
      const burning = t.combat.fire?.burning || (t.combat.destroyed && t.visual);
      if (!burning) continue;
      const pr = H.project([t.state.pos.x, t.state.pos.y + 1, t.state.pos.z]);
      if (pr.onScreen && pr.distM < 700) burningOnScreen++;
    }
    const subject = MB.camera?.subject ? H.sel(MB.camera.subject) : null;
    return {
      reason, timeS: Math.round((g.timeS || 0) * 100) / 100, frame: MB.frames, wallMs: Math.round(wall),
      camera: { kind: MB.camera?.kind || 'game', rigMode: D.rig.mode, external: !!D.rig.externalActive,
        pos: [cam.position.x, cam.position.y, cam.position.z].map((v) => Math.round(v * 10) / 10),
        dir: [dir.x, dir.y, dir.z].map((v) => Math.round(v * 100) / 100), fov: Math.round(cam.fov * 10) / 10 },
      player: p ? { id: p.id, specId: p.specId, hp: Math.round(p.combat.hp), destroyed: !!p.combat.destroyed,
        pos: [p.state.pos.x, p.state.pos.y, p.state.pos.z].map((v) => Math.round(v)), speed: Math.round((p.state.speed || 0) * 10) / 10,
        burning: !!p.combat.fire?.burning, reloadT: Math.round((p.combat.reload?.t || 0) * 10) / 10,
        magazine: p.combat.magazine ? { rounds: p.combat.magazine.rounds, capacity: p.combat.magazine.capacity } : null,
        shellSlot: p.combat.shellSlot ?? null, aerial: p.aerial?.active ? { kind: p.aerial.kind, y: Math.round(p.aerial.y) } : null } : null,
      killcam: !!D.killcam?.isActive?.(),
      subject: subject ? { id: subject.id ?? null, distM: Math.round(cam.position.distanceTo(H.vec(subject.x, subject.y, subject.z))) } : null,
      onScreen, nearestOnScreenM: Number.isFinite(nearestOnScreen) ? Math.round(nearestOnScreen) : null,
      shellsOnScreen, burningOnScreen, recent, mode: H.modeSummary(),
      dynScale: D.post?.dynScale ?? null, canvas: [D.renderer.domElement.width, D.renderer.domElement.height],
      hud: MB.hudMode,
    };
  }
}
