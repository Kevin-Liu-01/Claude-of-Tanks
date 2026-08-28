/**
 * Deterministic screenshot recipes. Player boot never transfers this module;
 * the stable __SHOTS facade acquires it on the first explicit capture.
 *
 * The host contract is deliberately dependency-injected so this engineering
 * runtime cannot pull battle/fleet modules back into the ordinary entry graph.
 */
export function createShotViews({
  hud, world, _v1, _v2, _v3, rig, DEG, forcedHudFrame,
  computeDispersionRadM, game, shellCards, scene, closeupStage, orbitPose,
  bus, fx, setPedestalTank, garage, garageDressing, showroom,
  mapEstablishingShot, tankPoseFromState, traceTank, createShell,
  resolveShellHit, createCombatState, mulberry32, VIEW_TIME, killcam,
}) {
  const SHOT_VIEWS = {
  battlefield() {
    hud.setMode('hidden');
    // Elevated SW of the village looking NE across the map: player tank at
    // its spawn in the near field, village mid-frame, enemy arc beyond.
    const h = world.heightField.getHeightAt(-60, -140);
    _v1.set(-60, h + 26, -140);
    _v2.set(80, world.heightField.getHeightAt(80, 160) + 4, 160);
    rig.setExternalPose(_v1, _v2, 55);
  },
  player_view() {
    rig.snapArcade(2, game.player.state.yaw, -12 * DEG);
    forcedHudFrame('battle', {
      distM: 240,
      penRatio: 1.3,
      reload: { t: 3.4, totalS: 6 }, // mid-reload: sweep ring + countdown visible
      shellSlot: 0,
      dispersionRadM: computeDispersionRadM(game.player.spec, game.player.state, 240),
      shells: shellCards,
    });
  },
  spectator_view() {
    const ally = game.tanks.find((ent) => ent && !ent.isPlayer && ent.team !== 'enemy');
    if (!ally) throw new Error('Spectator view requires a living allied vehicle');
    orbitPose(ally, 13.5, 174, 13, 48);
    forcedHudFrame('battle', {
      distM: 210,
      penRatio: null,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      dispersionRadM: computeDispersionRadM(game.player.spec, game.player.state, 210),
      shells: shellCards,
    });
    hud.stageSpectateBar({
      id: ally.id,
      name: ally.displayName || 'SteppeWolf_71',
      vehicle: ally.spec.name,
      specId: ally.specId,
      count: 5,
      index: 2,
    });
  },
  sniper_view() {
    // aim at the nearest enemy bearing WITH a clear sightline. r4: the old
    // check raycast ONE point (heightM*0.6) and accepted any blocker within
    // boundingRadius+1 m of the center — a wall 3 m in front of the hull
    // passed, so the flagship shot framed a nameplate floating over stone.
    // Now turret top, hull center AND both flank edges must all be reachable
    // (no static blocker more than 1 m short of the sample); when no living
    // enemy qualifies, the nearest one is RESTAGED onto surveyed open ground
    // so the contract ("aimed at an enemy") can never capture blind.
    const p = game.player;
    _v1.copy(p.state.pos);
    _v1.y += 2.2;
    // Canopy/bush proxies: world.raycast only sees terrain + prop AABBs, so a
    // bearing through a FOREST passed as "clear" (the r3 shot framed exactly
    // that). Sweep the concealer circles along the sight line too — anything
    // past the scope-corridor fade (~60 m) and short of the tank blocks.
    const conceal = world.getConcealment ? world.getConcealment() : [];
    const clearTo = (ent) => {
      const tp = ent.state.pos;
      const h = ent.spec.dims.heightM;
      const w = (ent.spec.dims.widthM || ent.spec.armor.boundingRadiusM) * 0.42;
      const bx = tp.x - p.state.pos.x;
      const bz = tp.z - p.state.pos.z;
      const flat = Math.max(Math.hypot(bx, bz), 1e-3);
      const inv = 1 / flat;
      const ux = bx * inv, uz = bz * inv;  // bearing unit (XZ)
      const lx = -uz, lz = ux;             // lateral unit ⟂ bearing
      for (const c of conceal) {
        const wx = c.x - _v1.x, wz = c.z - _v1.z;
        const t = wx * ux + wz * uz;
        if (t < 60 || t > flat - 8) continue;
        if (Math.abs(wx * uz - wz * ux) < c.r + 1.2) return false;
      }
      const samples = [
        [0, h * 0.92, 0],                 // turret top
        [0, h * 0.50, 0],                 // hull center
        [0, h * 0.25, 0],                 // lower hull (r4 hud_ui: a crest 2 m
        // short of the hull passed the old -1 m tolerance and hid the tank)
        [lx * w, h * 0.55, lz * w],       // left flank edge
        [-lx * w, h * 0.55, -lz * w],     // right flank edge
      ];
      for (const [ox, oy, oz] of samples) {
        _v2.set(tp.x + ox, tp.y + oy, tp.z + oz);
        _v3.copy(_v2).sub(_v1);
        const dd = _v3.length();
        _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
        const block = world.raycast(_v1, _v3, dd);
        if (block && block.dist < dd - 0.25) return false;
      }
      return true;
    };
    // r4 hud_ui: the x8 frame must catch NO free-standing prop inside ~60 m
    // of the trunnion — a roadside pole or crop-row post crossing the frame
    // edge smears across the optics (scope-edge blur + vignette) and reads
    // as a corrupted capture. Many of these props are VISUAL-ONLY (planted
    // without colliders), so raycasts cannot see them: collect every
    // non-foliage instanced-prop origin near the eye once, then reject any
    // bearing that keeps one inside the near view cone. Foliage/grass is
    // excluded (the scope corridor fade already clears it); tank visuals are
    // excluded via their roots. Colliders get a dense ray fan on top.
    const nearProps = [];
    {
      const tankRoots = new Set();
      for (const t of game.tanks) if (t.visual && t.visual.root) tankRoots.add(t.visual.root);
      scene.traverse((o) => {
        if (!o.isInstancedMesh) return;
        for (let anc = o; anc; anc = anc.parent) if (tankRoots.has(anc)) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const key = mat && mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
        if (/^world-(tree|grass)/.test(key)) return; // corridor fade covers foliage
        o.updateMatrixWorld();
        const arr = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          _v2.set(arr[i * 16 + 12], arr[i * 16 + 13], arr[i * 16 + 14])
            .applyMatrix4(o.matrixWorld);
          const d = Math.hypot(_v2.x - _v1.x, _v2.z - _v1.z);
          if (d > 1 && d < 60) nearProps.push([_v2.x, _v2.z, d]);
        }
      });
    }
    const nearClear = (yaw, pitch) => {
      const hv = (55 / 8) * DEG * 0.55; // half vertical FOV at x8 + pad
      const hh = hv * (16 / 9);         // half horizontal
      for (const [pxp, pzp, d] of nearProps) {
        let da = Math.atan2(pxp - _v1.x, pzp - _v1.z) - yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < hh * 1.6 + 3 / d) return false; // prop in the x8 cone
      }
      for (let s = -4; s <= 4; s++) {
        for (const op of [0, -hv, hv]) {
          const oy = (s / 4) * hh;
          const cp = Math.cos(pitch + op);
          _v3.set(Math.sin(yaw + oy) * cp, Math.sin(pitch + op), Math.cos(yaw + oy) * cp);
          if (world.raycast(_v1, _v3, 15)) return false;
        }
      }
      return true;
    };
    const aimTo = (ent) => {
      const adx = ent.state.pos.x - p.state.pos.x;
      const adz = ent.state.pos.z - p.state.pos.z;
      const ady = (ent.state.pos.y + ent.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
      return [Math.atan2(adx, adz), Math.atan2(ady, Math.hypot(adx, adz))];
    };
    const enemies = game.tanks.filter((ent) =>
      // SYMMETRIC TEAMS: allies spawn 22-44 m away — scope must frame an ENEMY
      ent.team === 'enemy' && ent.state && ent.combat && !ent.combat.destroyed);
    let best = null;
    let bestD = Infinity;
    for (const ent of enemies) {
      const d = ent.state.pos.distanceTo(p.state.pos);
      if (d < bestD && clearTo(ent) && nearClear(...aimTo(ent))) { bestD = d; best = ent; }
    }
    if (!best) {
      // No enemy is genuinely visible from the trunnion: restage the nearest
      // one onto open ground along a surveyed bearing (deterministic sweep —
      // ±75° around the player's hull nose at WoT engagement ranges).
      let near = enemies[0];
      let nearD = Infinity;
      for (const ent of enemies) {
        const d = ent.state.pos.distanceTo(p.state.pos);
        if (d < nearD) { nearD = d; near = ent; }
      }
      const obstacles = world.getObstacles ? world.getObstacles() : [];
      const groundFree = (x, z) => {
        for (const c of conceal) {
          const dx = c.x - x, dz = c.z - z;
          if (dx * dx + dz * dz < (c.r + 4) * (c.r + 4)) return false;
        }
        for (const o of obstacles) {
          if (x > o.min[0] - 3 && x < o.max[0] + 3 &&
              z > o.min[2] - 3 && z < o.max[2] + 3) return false;
        }
        return true;
      };
      // hud_ui r2: the sweep mutates near's REAL state each try — save the
      // original so a fully-failed sweep can restore it instead of leaving
      // the tank at the last FAILED (occluded) position.
      const origX = near.state.pos.x, origY = near.state.pos.y, origZ = near.state.pos.z;
      const origYaw = near.state.yaw;
      outer:
      for (const distM of [300, 240, 360, 190, 150, 420]) {
        for (let k = 0; k < 29; k++) {
          const ang = p.state.yaw +
            (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
          const x = p.state.pos.x + Math.sin(ang) * distM;
          const z = p.state.pos.z + Math.cos(ang) * distM;
          if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
          near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
          near.state.yaw = ang + Math.PI * 0.72; // 3/4 aspect to the player
          if (clearTo(near) && nearClear(...aimTo(near))) { best = near; break outer; }
        }
      }
      if (!best) {
        // hud_ui r2 relaxed sweep: terrain LOS only (turret top + hull
        // center) — map dressing density can over-reject the strict pass
        // wholesale (concealer circles + near-prop cone).
        const terrainClear = (ent) => {
          const tp = ent.state.pos;
          const hh2 = ent.spec.dims.heightM;
          for (const oy of [hh2 * 0.92, hh2 * 0.5]) {
            _v2.set(tp.x, tp.y + oy, tp.z);
            _v3.copy(_v2).sub(_v1);
            const dd = _v3.length();
            _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
            const block = world.raycast(_v1, _v3, dd);
            if (block && block.dist < dd - 0.25) return false;
          }
          return true;
        };
        outer2:
        for (const distM of [300, 240, 360, 190, 150, 420]) {
          for (let k = 0; k < 29; k++) {
            const ang = p.state.yaw +
              (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
            const x = p.state.pos.x + Math.sin(ang) * distM;
            const z = p.state.pos.z + Math.cos(ang) * distM;
            if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
            near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
            near.state.yaw = ang + Math.PI * 0.72;
            if (terrainClear(near)) { best = near; break outer2; }
          }
        }
      }
      if (!best) {
        // TRUE original staging (the old code left the tank at the last
        // FAILED sweep position — captured frames aimed 420 m into an empty
        // hillside)
        near.state.pos.set(origX, origY, origZ);
        near.state.yaw = origYaw;
        best = near;
      }
      best.visual.syncFromState(best.state);
      bestD = best.state.pos.distanceTo(p.state.pos);
    }
    const dx = best.state.pos.x - p.state.pos.x;
    const dz = best.state.pos.z - p.state.pos.z;
    const yaw = Math.atan2(dx, dz);
    const dy = (best.state.pos.y + best.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    rig.snapSniper(8, yaw, pitch);
    forcedHudFrame('sniper', {
      distM: Math.round(bestD),
      // r4 hud_ui: M829A4 vs a Tiger flank is a guaranteed pen — the flagship
      // shot must demonstrate the GREEN indicator state (0.95 showed
      // permanent ambiguous orange).
      penRatio: 1.5,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      zoom: 8,
      dispersionRadM: computeDispersionRadM(p.spec, p.state, bestD),
      shells: shellCards,
    });
  },
  tank_closeup_modern() {
    hud.setMode('hidden');
    // tank_models r2: sun-side close orbit (negative azimuth) — fills the
    // frame and keeps the running gear/M256 collar/skirt panels readable.
    // lighting_post r4: elev 9 -> 15, dist 7 -> 8 — the extra elevation puts
    // the hull-adjacent contact shadow above the hull's own horizon so the
    // closeup actually shows the vehicle grounded (shadow-read fix).
    const hero = game.tankById.get('m1a2');
    // tank_models r6 (minor): a flat background bot ("312") parked right
    // behind the hero undercut the closeup — push any OTHER vehicle inside
    // 55 m a further 30 m out along its own bearing (deterministic, no rng;
    // this view runs after the battlefield capture so wide shots keep their
    // original staging).
    for (const t of game.tanks) {
      if (t === hero || !t.state || !t.visual) continue;
      const ddx = t.state.pos.x - hero.state.pos.x;
      const ddz = t.state.pos.z - hero.state.pos.z;
      const d = Math.hypot(ddx, ddz);
      if (d > 0.01 && d < 55) {
        const s = (d + 30) / d;
        t.state.pos.x = hero.state.pos.x + ddx * s;
        t.state.pos.z = hero.state.pos.z + ddz * s;
        t.state.pos.y = world.heightField.getHeightAt(t.state.pos.x, t.state.pos.z);
        t.visual.syncFromState(t.state);
      }
    }
    closeupStage(hero);
    orbitPose(hero, 8, -42, 15, 45);
  },
  tank_closeup_ww2() {
    hud.setMode('hidden');
    // Sun-lit 3/4 front (tank_models r1): the old azimuth 35 put the running
    // gear and lower hull in their own shadow — the interleaved wheels, track
    // sag and camo bands were unreadable in the judged frame.
    closeupStage(game.tankById.get('tiger1'));
    orbitPose(game.tankById.get('tiger1'), 9, -35, 15, 45); // tank_models r5: elev/fov match the other closeups (shared sun read)
  },
  tank_closeup_t90m() {
    hud.setMode('hidden');
    // tank_models r3: every core roster tank gets a judged closeup — the
    // T-90M shipped unauditable as a carousel thumb.
    closeupStage(game.tankById.get('t90m'));
    orbitPose(game.tankById.get('t90m'), 8, -38, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  tank_closeup_leo2a7() {
    hud.setMode('hidden');
    closeupStage(game.tankById.get('leo2a7'));
    orbitPose(game.tankById.get('leo2a7'), 8, -35, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  detrack() {
    // effects_combat r2: de-track destruction visuals — slumped band, thrown
    // track ribbon, scattered road wheel + fx burst (rubric item).
    hud.setMode('hidden');
    const ent = game.tankById.get('tiger1');
    orbitPose(ent, 10, 120, 10, 45);           // rear-quarter, running gear side
    // effects_combat r1: break the RIGHT track — the 120-deg orbit frames the
    // right flank, and the de-track rework removes the band from the broken
    // side (bare road wheels + ground ribbon must be the side on camera).
    ent.visual.setTrackState('trackR', true);
    bus.emit('module:state', { id: ent.id, module: 'trackR', state: 'red' });
  },
  combat_firing() {
    hud.setMode('hidden');
    const p = game.player;
    // effects_combat r2: pitch 8 → 14 lifts the barrel line onto the sunlit
    // road so the dark tube no longer vanishes against the shadowed bank.
    orbitPose(p, 13, 55, 18, 45); // lighting_post r4: elev 14 -> 18 (left-side shadow readable)
    // effects_combat r4: recoil timelines now advance on the SHARED FX CLOCK
    // (src/fx/clock.ts), which is pinned during __SHOTS.set — repeated
    // syncFromState calls advance 0 s. recoilKick(ageS) takes the composed
    // age directly: backdate the stroke 50 ms so the barrel sits visibly
    // out of battery in the staged still.
    // §5.362: twin-plant players alternate barrels here too — the kick
    // returns the fired barrel's index and the composed flash sits on THAT
    // tip (single-bore: null index, legacy center anchor).
    const fireIdx = p.visual.recoilKick(0.05); // backdate: stroke already 50 ms in
    p.visual.syncFromState(p.state);    // one call to apply the pose
    // controls_gunnery r3: staged flash direction along the real bore axis.
    p.visual.gunMuzzleWorld(_v1, fireIdx != null ? fireIdx : undefined);
    p.visual.gunDirWorld(_v3);
    fx.composeFiringMoment({
      muzzlePos: _v1.clone(),
      dir: _v3.clone(),
      caliberMm: p.spec.gun.caliberMm,
      tracerType: 'APFSDS',
      ageS: 0.05,
    });
  },
  explosion() {
    hud.setMode('hidden');
    // Prefer the third enemy for the original framing, but compact deterministic
    // screenshot rosters may field only one. Always remain team-filtered so an
    // ally can never become the staged victim.
    const victims = game.tanks.filter((t) => t.team === 'enemy');
    const ent = victims[2] || victims[0];
    if (!ent) throw new Error('Explosion view requires at least one enemy tank');
    _v2.copy(ent.state.pos);
    // effects_combat r1: frame center raised (was +1.4) and camera pulled
    // back to 26 m at a shallower 18 deg so fireball + leaning smoke column
    // + debris all fit — the old 22 m / 24 deg framing cropped everything
    // above ~6 m and cut the column.
    _v2.y += 3.2;
    const az = ent.state.yaw + 150 * DEG;
    _v1.set(
      _v2.x + Math.sin(az) * 26 * Math.cos(18 * DEG),
      _v2.y + Math.sin(18 * DEG) * 26 + 1.5,
      _v2.z + Math.cos(az) * 26 * Math.cos(18 * DEG),
    );
    rig.setExternalPose(_v1, _v2, 45);
    fx.composeExplosionMoment({ pos: _v2.clone(), ageS: 0.6 });
    // freeze the ammo-rack turret pop mid-arc — turret visibly airborne
    // above the fireball with spin at the 0.6 s composed moment
    ent.visual.setDestroyed({ pop: true, ageS: 0.6 });
  },
  async garage() {
    hud.setMode('hidden');
    await setPedestalTank('m1a2');
    garage.show('m1a2');
    if (garage.drainThumbs) garage.drainThumbs(); // portraits finished for the capture
    await garageDressing.ensureBuilt(); // deterministic capture: workshop fully dressed
    showroom.reset();
  },
  battlefield_desert() { mapEstablishingShot(); },
  battlefield_winter() { mapEstablishingShot(); },
  battlefield_urban() { mapEstablishingShot(); },
  // MAPS r1
  battlefield_coastal() { mapEstablishingShot(); },
  battlefield_autumn() { mapEstablishingShot(); },
  battlefield_steppe() { mapEstablishingShot(); },
  battlefield_railyard() { mapEstablishingShot(); },
  battlefield_frontier() { mapEstablishingShot(); },
  battlefield_fjord() { mapEstablishingShot(); },
  battlefield_delta() { mapEstablishingShot(); },
  battlefield_badlands() { mapEstablishingShot(); },
  battlefield_monsoon() { mapEstablishingShot(); },
  battlefield_alpine() { mapEstablishingShot(); },
  battlefield_caldera() { mapEstablishingShot(); },
  battlefield_foundry() { mapEstablishingShot(); },
  battlefield_ruinspires() { mapEstablishingShot(); },
  battlefield_blackglass() { mapEstablishingShot(); },
  battlefield_titan_gorge() { mapEstablishingShot(); },
  battlefield_skybridge() { mapEstablishingShot(); },
  // KILL-CAM: deterministic staged x-ray replay frame. A synthetic T-90M
  // flank shot into the player's M1A2 SEPv3 is resolved through the
  // REAL sim pipeline (traceTank + resolveShellHit, seeded rng, throwaway
  // combat state) and handed to the kill-cam's staged x-ray renderer.
  killcam_xray() {
    hud.setMode('hidden');
    const target = game.player;
    const shooter = game.tankById.get('t90m');
    const shellSpec = shooter.spec.gun.shells[0]; // 125 mm APFSDS
    // Synthetic flank muzzle (staged frame): a front-right-quarter shot at
    // 440 m guarantees a penetration whose internal ray crosses track/engine/
    // fuel/ammo boxes — the frame must showcase module damage.
    const flankAz = target.state.yaw + Math.PI / 2 + 0.35;
    _v1.set(
      target.state.pos.x + Math.sin(flankAz) * 440,
      target.state.pos.y + 9,
      target.state.pos.z + Math.cos(flankAz) * 440,
    );
    const pose = tankPoseFromState(target.state);
    // Deterministic candidate scan: fixed aim heights / lateral offsets /
    // seeds, resolved through the REAL pipeline against a throwaway combat
    // state; first candidate that pens with ≥2 module/crew casualties wins.
    const rightX = Math.cos(target.state.yaw);
    const rightZ = -Math.sin(target.state.yaw);
    let ev = null;
    const tryOne = (h, side, seed) => {
      _v2.copy(target.state.pos);
      _v2.y += h;
      _v2.x += rightX * side;
      _v2.z += rightZ * side;
      _v3.copy(_v2).sub(_v1);
      const distM = _v3.length();
      _v3.multiplyScalar(1 / distM);
      const from = _v2.clone().addScaledVector(_v3, -30);
      const to = _v2.clone().addScaledVector(_v3, 30);
      const hits = traceTank(from, to, pose, target.spec.armor, new Set());
      if (!hits.length) return null;
      const shell = createShell(shellSpec, shooter.id, true, from, _v3, 99001);
      shell.distM = distM;
      return resolveShellHit(
        shell,
        { id: target.id, spec: target.spec, state: target.state, combat: createCombatState(target.spec) },
        hits, mulberry32(seed),
      );
    };
    outer:
    for (const seed of [9001, 4242, 555, 77]) {
      for (const h of [0.85, 1.0, 1.2, 1.45]) {
        for (const side of [0, 0.55, -0.55]) {
          const cand = tryOne(h, side, seed);
          if (!cand || cand.kind !== 'pen' || !cand.localPos) continue;
          if (!ev) ev = cand;
          if ((cand.modulesHit.length + cand.crewHit.length) >= 2) { ev = cand; break outer; }
        }
      }
    }
    if (!ev) ev = tryOne(1.05, 0, 4242); // unreachable fallback, keeps recipe total
    ev.attackerName = shooter.spec.name;
    // killcam_shotinfo r3: match live events (state.ts enriches every hit
    // with attackerSpecId) so pen-roll annotations can resolve the shell.
    ev.attackerSpecId = shooter.specId;
    ev.targetName = target.spec.name;
    ev.targetSpecId = target.specId;
    ev.timeS = VIEW_TIME.killcam_xray;
    const traj = [];
    for (let i = 0; i <= 24; i++) {
      traj.push(
        _v1.x + (ev.pos[0] - _v1.x) * (i / 24),
        _v1.y + (ev.pos[1] - _v1.y) * (i / 24),
        _v1.z + (ev.pos[2] - _v1.z) * (i / 24),
      );
    }
    killcam.stageXrayShot({
      ev,
      timeS: ev.timeS,
      trajPts: traj,
      pose: {
        pos: [target.state.pos.x, target.state.pos.y, target.state.pos.z],
        yaw: target.state.yaw,
        pitch: target.state.visualPitch,
        roll: target.state.visualRoll,
        turretYaw: target.state.turretYaw,
        gunPitch: target.state.gunPitch,
      },
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    });
  },
  };
  return SHOT_VIEWS;
}
