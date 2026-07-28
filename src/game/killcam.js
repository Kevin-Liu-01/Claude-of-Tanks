/**
 * killcam.js — War Thunder-class kill camera (integration-owned module).
 *
 * CAPTURE: state.js calls `game.killcam.recordSimStep(game)` every fixed step
 * (shell trajectory points) and `game.killcam.onShellHit(ev, target)` for every
 * resolved HitEvent (clearly-marked KILL-CAM sections there). Everything shown
 * during a replay comes from those snapshots — shooter/target poses, the full
 * trajectory, and the sim-resolved HitEvent (zone, nominal/effective armor,
 * rolls, modules/crew, ammo-rack flag). Nothing is recomputed and nothing
 * reads live AI state during playback.
 *
 * PLAYBACK (main.js drives it at battle end):
 *   1. FLIGHT — slow-mo tracer chase along the captured trajectory from the
 *      killer's muzzle to the victim.
 *   2. X-RAY  — the victim rendered ghost-translucent (shared additive,
 *      depth-tested material set), the shell path drawn through the hull
 *      (hull-local entry point + direction from the HitEvent), every module /
 *      crew box outlined, hit ones highlighted + DOM-labeled with damage, and
 *      an annotation block (shell, distance, angle, nominal→effective armor,
 *      pen roll, damage). Holds XRAY_HOLD_S, any key/click skips.
 *
 * The camera is driven exclusively through rig.setExternalPose (the rig's
 * external-pose API) — the rig is used, never modified.
 */
import * as THREE from 'three';
import { FONT_STACK, FONT_COND, ensureFonts } from '../ui/fonts.js';

const XRAY_HOLD_S = 4.0;
const FLIGHT_MIN_S = 1.9;
const FLIGHT_MAX_S = 3.4;
const TRAJ_KEEP = 32;          // shell traces retained (oldest evicted)
const TRAJ_MAX_PTS = 400 * 3;  // ≥ SHELL_MAX_LIFETIME_S at 60 Hz
const ORBIT_RAD_S = 0.05;      // x-ray camera drift
const VICTORY_WINDOW_S = 1.0;  // final blow must be this fresh at battle end

const UP = new THREE.Vector3(0, 1, 0);

// module-scope scratch — no per-frame allocation
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _Y = new THREE.Vector3(0, 1, 0);

const MODULE_LABEL = {
  trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel Tank',
  ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics',
  turretRing: 'Turret Ring',
};
const CREW_LABEL = { commander: 'Commander', gunner: 'Gunner', driver: 'Driver', loader: 'Loader' };

/** 'turret_cheek_R' -> 'turret cheek R' (same formatter as shotInfo.js). */
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone
    .replace(/_(R|L)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
}

// ---------------------------------------------------------------------------
// Shared x-ray material set (lazy singleton; additive + depth-tested)
// ---------------------------------------------------------------------------
let S = null;
function sharedMats() {
  if (S) return S;
  const mesh = (color, opacity, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side, toneMapped: false, fog: false,
  });
  const line = (color, opacity) => new THREE.LineBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false, fog: false,
  });
  S = {
    ghost: mesh(0x86c8f2, 0.11, THREE.DoubleSide),
    trail: line(0xffb060, 0.55),
    edgeDim: line(0x6db4e8, 0.55),
    edgeRed: line(0xff5a4a, 1.0),
    edgeYellow: line(0xffb43c, 1.0),
    edgeCrew: line(0xff7d8a, 1.0),
    fillRed: mesh(0xff2a1a, 0.22, THREE.DoubleSide),
    fillYellow: mesh(0xff9a1c, 0.2, THREE.DoubleSide),
    fillCrew: mesh(0xff3a55, 0.22, THREE.DoubleSide),
    pathIn: mesh(0xff3020, 1.0),
    pathOut: mesh(0xffc27a, 0.7),
    marker: mesh(0xffffff, 0.9),
    core: mesh(0xfff3d0, 1.0),
    streak: mesh(0xffb464, 0.85),
  };
  return S;
}

// ---------------------------------------------------------------------------
// DOM overlay (letterbox + title + annotation block + projected labels)
// ---------------------------------------------------------------------------
const KC_CSS = `
.cot-kc{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;
  font-family:${FONT_STACK};color:#e6edf3;}
.cot-kc.on{display:block;}
.cot-kc *{box-sizing:border-box;margin:0;padding:0;}
.cot-kc-bart,.cot-kc-barb{position:absolute;left:0;right:0;height:9vh;}
.cot-kc-bart{top:0;background:linear-gradient(180deg,rgba(0,0,0,.94),rgba(0,0,0,.6) 70%,transparent);}
.cot-kc-barb{bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.94),rgba(0,0,0,.6) 70%,transparent);}
.cot-kc-title{position:absolute;top:2.4vh;left:50%;transform:translateX(-50%);text-align:center;}
.cot-kc-title .t{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;
  font-size:17px;letter-spacing:.46em;color:#ffd9a0;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.cot-kc-title .s{font-size:10.5px;letter-spacing:.18em;color:#aeb9c4;margin-top:3px;
  font-variant-numeric:tabular-nums;}
.cot-kc-skip{position:absolute;bottom:3.1vh;right:30px;font-family:${FONT_COND};
  font-stretch:condensed;font-weight:700;font-size:10.5px;letter-spacing:.26em;color:#93a1ad;}
.cot-kc-annot{position:absolute;left:28px;bottom:11.5vh;width:272px;
  background:linear-gradient(180deg,rgba(10,14,18,.9),rgba(6,9,12,.92));
  border:1px solid rgba(146,164,180,.32);border-left:2px solid #ffb04a;
  box-shadow:0 6px 24px rgba(0,0,0,.55);padding:0 0 8px;}
.cot-kc-annot .hd{padding:6px 10px 5px;border-bottom:1px solid rgba(146,164,180,.18);}
.cot-kc-annot .hd .k{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;
  font-size:13px;letter-spacing:.1em;color:#ffcf8a;}
.cot-kc-annot .hd .w{font-size:10.5px;color:#c6d2dc;margin-top:2px;letter-spacing:.03em;}
.cot-kc-rows{padding:5px 10px 0;display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;}
.cot-kc-kv{display:flex;justify-content:space-between;font-size:10.5px;color:#8a97a3;
  font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-kc-kv b{color:#e4edf4;font-weight:700;font-family:${FONT_COND};font-stretch:condensed;}
.cot-kc-banner{margin:7px 10px 0;padding:3px 8px;text-align:center;display:none;
  font-family:${FONT_COND};font-stretch:condensed;font-weight:800;font-size:11px;
  letter-spacing:.2em;color:#ff6a5a;border:1px solid rgba(255,106,90,.7);
  background:rgba(120,20,10,.35);}
.cot-kc-banner.on{display:block;}
.cot-kc-label{position:absolute;transform:translate(-50%,-135%);white-space:nowrap;
  background:rgba(6,9,12,.86);border:1px solid currentColor;padding:3px 8px 4px;
  font-family:${FONT_COND};font-stretch:condensed;font-weight:800;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;line-height:1.25;
  box-shadow:0 2px 10px rgba(0,0,0,.6);}
.cot-kc-label .s{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  color:#e8f0f6;font-variant-numeric:tabular-nums;}
.cot-kc-dot{position:absolute;width:7px;height:7px;border-radius:50%;
  transform:translate(-50%,-50%);background:currentColor;box-shadow:0 0 9px currentColor;}
.cot-kc-dmg{position:absolute;transform:translate(-50%,30%);font-family:${FONT_COND};
  font-stretch:condensed;font-weight:800;font-size:24px;color:#ffd166;
  letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.9);font-variant-numeric:tabular-nums;}
`;

function ensureStyle() {
  if (!document.getElementById('cot-kc-style')) {
    const st = document.createElement('style');
    st.id = 'cot-kc-style';
    st.textContent = KC_CSS;
    document.head.appendChild(st);
  }
}

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

/** Cylinder mesh between two points (local space of `parent`). */
function tube(a, b, radius, mat, parent, disposables) {
  _s.copy(b).sub(a);
  const len = _s.length();
  if (len < 1e-4) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 6, 1, true);
  disposables.push(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(_s, 0.5);
  m.quaternion.setFromUnitVectors(_Y, _s.multiplyScalar(1 / len));
  parent.add(m);
  return m;
}

/**
 * Create the kill-cam controller.
 * @param {{scene:THREE.Scene, camera:THREE.PerspectiveCamera,
 *   rig:{setExternalPose:Function}, heightField:{getHeightAt:Function},
 *   getPlayer:() => ?object}} deps injected by integration (main.js)
 * @returns {object} killcam API
 */
export function createKillCam(deps) {
  const { scene, camera, rig, heightField, getPlayer } = deps;

  // ---- capture state ----
  const traj = new Map(); // shellId -> { pts:number[], muzzle:[3] }
  let pendingDeath = null;    // lethal shell snapshot, target = player
  let pendingVictory = null;  // lethal shell snapshot, attacker = player
  let lastHitOnPlayer = null; // fallback for fire deaths (x-ray only)

  // ---- playback state ----
  let active = false;
  let staged = false;
  let pb = null; // playback bundle
  let dom = null;

  function ensureDom() {
    if (dom) return dom;
    ensureFonts();
    ensureStyle();
    const root = el('div', 'cot-kc');
    document.body.appendChild(root);
    el('div', 'cot-kc-bart', root);
    el('div', 'cot-kc-barb', root);
    const title = el('div', 'cot-kc-title', root);
    const titleT = el('div', 't', title);
    const titleS = el('div', 's', title);
    const skip = el('div', 'cot-kc-skip', root);
    skip.textContent = 'ANY KEY — SKIP';
    const annot = el('div', 'cot-kc-annot', root);
    const hd = el('div', 'hd', annot);
    const hdK = el('div', 'k', hd);
    const hdW = el('div', 'w', hd);
    const rows = el('div', 'cot-kc-rows', annot);
    const banner = el('div', 'cot-kc-banner', annot);
    banner.textContent = 'AMMO RACK DETONATION';
    const labelHost = el('div', '', root);
    dom = { root, titleT, titleS, hdK, hdW, rows, banner, labelHost };
    return dom;
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  /** Deep-enough snapshot of a resolved HitEvent + victim pose. */
  function makeSnapshot(ev, target) {
    const rec = traj.get(ev.shellId);
    let pts = null;
    if (rec && rec.pts.length >= 3) {
      pts = rec.pts.slice();
      pts.push(ev.pos[0], ev.pos[1], ev.pos[2]);
    }
    const st = target.state;
    return {
      ev: {
        ...ev,
        pos: ev.pos.slice(),
        normal: ev.normal ? ev.normal.slice() : [0, 1, 0],
        modulesHit: (ev.modulesHit || []).map((m) => ({ ...m })),
        crewHit: (ev.crewHit || []).slice(),
        localPos: ev.localPos ? ev.localPos.slice() : null,
        localDir: ev.localDir ? ev.localDir.slice() : null,
      },
      timeS: ev.timeS || 0,
      trajPts: pts,
      pose: {
        pos: [st.pos.x, st.pos.y, st.pos.z],
        yaw: st.yaw, pitch: st.visualPitch, roll: st.visualRoll,
        turretYaw: st.turretYaw, gunPitch: st.gunPitch,
      },
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    };
  }

  const api = {
    /**
     * Subscribe to capture-side bus events (shell muzzles, cleanup).
     * @param {{on:Function}} bus the game event bus
     */
    bindBus(bus) {
      bus.on('shell:fired', (p) => {
        if (traj.size >= TRAJ_KEEP) traj.delete(traj.keys().next().value);
        traj.set(p.shellId, {
          pts: [p.muzzlePos[0], p.muzzlePos[1], p.muzzlePos[2]],
          muzzle: p.muzzlePos.slice(),
        });
      });
      bus.on('shell:expired', (p) => traj.delete(p.shellId));
      bus.on('ui:battleStart', () => {
        traj.clear();
        pendingDeath = pendingVictory = lastHitOnPlayer = null;
        api.cancel();
      });
    },

    /**
     * Called by state.js once per fixed sim step: append live shell positions
     * to their trajectory traces (KILL-CAM capture hook).
     * @param {object} game game state ({shells})
     */
    recordSimStep(game) {
      for (const shell of game.shells) {
        if (shell.dead) continue;
        const rec = traj.get(shell.id);
        if (rec && rec.pts.length < TRAJ_MAX_PTS) {
          rec.pts.push(shell.pos.x, shell.pos.y, shell.pos.z);
        }
      }
    },

    /**
     * Called by state.js for every resolved HitEvent (KILL-CAM capture hook).
     * Snapshots lethal chains for the player-death and victory replays.
     * @param {object} ev enriched HitEvent @param {?object} target TankEntity
     */
    onShellHit(ev, target) {
      if (!target || !target.state || !ev.localPos) return;
      const player = getPlayer();
      if (!player) return;
      if (ev.targetId === player.id) {
        lastHitOnPlayer = makeSnapshot(ev, target);
        if (ev.destroyed) pendingDeath = lastHitOnPlayer;
      } else if (ev.attackerId === player.id && ev.destroyed) {
        pendingVictory = makeSnapshot(ev, target);
      }
    },

    /**
     * Start the end-of-battle cinematic if a matching snapshot exists.
     * @param {'victory'|'defeat'} result battle result
     * @param {number} timeS current sim time (freshness gate for victory)
     * @param {Function} onDone called when the replay finishes or is skipped
     * @returns {boolean} true if a replay started (caller defers the overlay)
     */
    playForResult(result, timeS, onDone) {
      let snap = null;
      let kind = 'death';
      let xrayOnly = false;
      if (result === 'defeat') {
        snap = pendingDeath || lastHitOnPlayer;
        xrayOnly = !pendingDeath; // died to fire: show the shell that lit it
      } else if (result === 'victory') {
        kind = 'victory';
        if (pendingVictory && timeS - pendingVictory.timeS <= VICTORY_WINDOW_S) {
          snap = pendingVictory;
        }
      }
      if (!snap || !snap.targetEnt || !snap.targetEnt.visual) return false;
      begin(snap, kind, onDone, xrayOnly);
      return true;
    },

    /**
     * Deterministic staged x-ray (screenshot view `killcam_xray`): jump
     * straight to the frozen x-ray frame of a pre-resolved snapshot.
     * @param {object} snap snapshot shaped like makeSnapshot's output
     */
    stageXrayShot(snap) {
      api.cancel();
      begin(snap, 'death', null, true);
      staged = true; // update() never auto-finishes a staged frame
    },

    /** @returns {boolean} a replay (or staged frame) is on screen */
    isActive() { return active; },

    /** Hard cleanup — used by __SHOTS.set and battle restarts. */
    cancel() { if (active) finish(false); },

    /**
     * Advance the replay one render frame (drives camera + labels).
     * @param {number} dt render delta seconds
     */
    update(dt) {
      if (!active || !pb || staged) return;
      if (pb.phase === 'flight') updateFlight(dt);
      else updateXray(dt);
    },

    /** Debug/testing introspection. */
    get phase() { return pb ? pb.phase : null; },
  };

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  function onSkipKey() {
    if (!active || !pb || staged) return;
    if (pb.phase === 'flight') beginXray();
    else finish(true);
  }

  function begin(snap, kind, onDone, xrayOnly) {
    const d = ensureDom();
    sharedMats();
    active = true;
    staged = false;
    pb = {
      snap, kind, onDone,
      phase: 'flight', t: 0, xt: 0,
      group: new THREE.Group(),
      disposables: [],
      ghostBackup: null,
      labels: [],
      pts: null, cum: null, total: 0, dur: 0, segIdx: 0,
      core: null, streak: null, trailGeo: null,
      xcam: null,
    };
    pb.group.name = 'killcam';
    scene.add(pb.group);

    // annotation block
    const ev = snap.ev;
    d.titleT.textContent = kind === 'victory' ? 'FINAL BLOW' : 'KILL CAM';
    d.titleS.textContent = kind === 'victory'
      ? `${ev.targetName || ''} destroyed`
      : `destroyed by ${ev.attackerName || 'enemy fire'}`;
    d.hdK.textContent = `${ev.shellType || ''} · ${ev.shellName || ''}`;
    d.hdW.textContent = `${ev.attackerName || 'Enemy'} → ${ev.targetName || ''}`;
    d.rows.textContent = '';
    const kv = (k, v) => {
      const r = el('div', 'cot-kc-kv', d.rows);
      const ks = el('span', '', r); ks.textContent = k;
      const vs = el('b', '', r); vs.textContent = v;
    };
    kv('Distance', `${Math.round(ev.flightDistM || 0)} m`);
    kv('Impact angle', `${Math.round(ev.impactAngleDeg || 0)}°`);
    kv('Armor', (ev.nominalMm || 0) > 0
      ? `${Math.round(ev.nominalMm)} → ${Math.round(ev.effectiveMm || 0)} mm` : '—');
    kv('Pen roll', (ev.penRollMm || 0) > 0 ? `${Math.round(ev.penRollMm)} mm` : '—');
    kv('Damage', `${Math.round(ev.damage || 0)}`);
    kv('Zone', zoneLabel(ev.zone));
    d.banner.classList.toggle('on', !!ev.ammoRacked);
    d.labelHost.textContent = '';
    d.root.classList.add('on');

    window.addEventListener('keydown', onSkipKey, true);
    window.addEventListener('mousedown', onSkipKey, true);

    // precompute the x-ray camera (flight blends into it)
    pb.xcam = computeXrayCam(snap);

    // flight setup
    const raw = snap.trajPts;
    if (!xrayOnly && raw && raw.length >= 6) {
      const pts = [];
      for (let i = 0; i < raw.length; i += 3) {
        const v = new THREE.Vector3(raw[i], raw[i + 1], raw[i + 2]);
        if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 1e-6) pts.push(v);
      }
      if (pts.length >= 2) {
        pb.pts = pts;
        pb.cum = new Float32Array(pts.length);
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          acc += pts[i].distanceTo(pts[i - 1]);
          pb.cum[i] = acc;
        }
        pb.total = acc;
        pb.dur = THREE.MathUtils.clamp(1.2 + acc * 0.005, FLIGHT_MIN_S, FLIGHT_MAX_S);
        // trail polyline (drawRange grows with the shell)
        const posAttr = new Float32Array(pts.length * 3);
        pts.forEach((v, i) => { posAttr[i * 3] = v.x; posAttr[i * 3 + 1] = v.y; posAttr[i * 3 + 2] = v.z; });
        pb.trailGeo = new THREE.BufferGeometry();
        pb.trailGeo.setAttribute('position', new THREE.BufferAttribute(posAttr, 3));
        pb.trailGeo.setDrawRange(0, 1);
        pb.disposables.push(pb.trailGeo);
        pb.group.add(new THREE.Line(pb.trailGeo, S.trail));
        // tracer core + streak
        const coreGeo = new THREE.SphereGeometry(0.14, 10, 8);
        const streakGeo = new THREE.CylinderGeometry(0.05, 0.02, 5.5, 6, 1, true);
        pb.disposables.push(coreGeo, streakGeo);
        pb.core = new THREE.Mesh(coreGeo, S.core);
        pb.streak = new THREE.Mesh(streakGeo, S.streak);
        pb.group.add(pb.core, pb.streak);
        pb.phase = 'flight';
        updateFlight(0); // solve the first camera frame immediately
        return;
      }
    }
    beginXray();
  }

  /** Sample the trajectory polyline at arc length `dist`. */
  function sampleTraj(dist, outPos, outDir) {
    const pts = pb.pts;
    const cum = pb.cum;
    let i = pb.segIdx;
    if (cum[i] > dist) i = 0;
    while (i < pts.length - 2 && cum[i + 1] < dist) i++;
    pb.segIdx = i;
    const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
    const f = THREE.MathUtils.clamp((dist - cum[i]) / segLen, 0, 1);
    outPos.copy(pts[i]).lerp(pts[i + 1], f);
    outDir.copy(pts[i + 1]).sub(pts[i]).multiplyScalar(1 / segLen);
    return i;
  }

  function updateFlight(dt) {
    pb.t += dt;
    const u = Math.min(1, pb.t / pb.dur);
    const s = 1 - Math.pow(1 - u, 2.15); // fast launch, slow-mo into impact
    const dist = s * pb.total;
    const idx = sampleTraj(dist, _p, _d);
    pb.trailGeo.setDrawRange(0, Math.max(2, idx + 2));
    pb.core.position.copy(_p);
    pb.streak.position.copy(_p).addScaledVector(_d, -2.6);
    pb.streak.quaternion.setFromUnitVectors(_Y, _d);

    // chase camera: behind + beside the tracer, blending into the x-ray pose
    _s.crossVectors(_d, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    const k = THREE.MathUtils.smoothstep(u, 0.78, 1);
    _a.copy(_p).addScaledVector(_d, -(8.5 + 7 * (1 - u))).addScaledVector(_s, 3.4);
    _a.y += 1.6;
    _b.copy(_p).addScaledVector(_d, 16);
    if (k > 0) {
      _a.lerp(pb.xcam.pos, k);
      _b.lerp(pb.xcam.look, k);
    }
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.8;
      if (_a.y < minY) _a.y = minY;
    }
    rig.setExternalPose(_a, _b, 50 - 8 * k);
    if (u >= 1) beginXray();
  }

  /** Deterministic x-ray vantage from the snapshot (side-on to the path). */
  function computeXrayCam(snap) {
    const pose = snap.pose;
    const center = new THREE.Vector3(pose.pos[0], pose.pos[1] + snap.heightM * 0.55, pose.pos[2]);
    _e.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ');
    _q.setFromEuler(_e);
    const dirW = snap.ev.localDir
      ? new THREE.Vector3().fromArray(snap.ev.localDir).applyQuaternion(_q).normalize()
      : new THREE.Vector3().fromArray(snap.ev.normal).negate();
    _s.crossVectors(dirW, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    const R = Math.max(8.5, snap.boundingRadiusM * 2.7);
    const off = new THREE.Vector3()
      .addScaledVector(_s, R * 0.92)
      .addScaledVector(dirW, -R * 0.42);
    off.y += R * 0.4;
    const pos = center.clone().add(off);
    if (heightField) {
      const minY = heightField.getHeightAt(pos.x, pos.z) + 1.0;
      if (pos.y < minY) pos.y = minY;
    }
    return { center, off, pos, look: center.clone() };
  }

  function beginXray() {
    if (pb.phase === 'xray') return;
    pb.phase = 'xray';
    pb.xt = 0;
    // retire the flight tracer (keep the trail arcing into the tank)
    if (pb.core) { pb.group.remove(pb.core, pb.streak); pb.core = pb.streak = null; }

    const snap = pb.snap;
    const ev = snap.ev;
    const armor = snap.armor;
    const pose = snap.pose;

    // 1. ghost-translucent victim — shared additive/depth-tested material set
    const vis = snap.targetEnt.visual;
    vis.setVisible(true); // player may have died while scoped (hull hidden)
    pb.ghostBackup = [];
    vis.root.traverse((o) => {
      if (o.isMesh && o.visible) {
        pb.ghostBackup.push([o, o.material]);
        o.material = S.ghost;
      }
    });

    // 2. snapshot-posed frame groups (hull + turret), no live-state reads
    const poseGrp = new THREE.Group();
    poseGrp.rotation.order = 'YXZ';
    poseGrp.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    poseGrp.rotation.set(-pose.pitch, pose.yaw, pose.roll);
    const turretGrp = new THREE.Group();
    turretGrp.position.set(armor.turretPivot[0], armor.turretPivot[1], armor.turretPivot[2]);
    turretGrp.rotation.y = pose.turretYaw;
    poseGrp.add(turretGrp);
    pb.group.add(poseGrp);

    // 3. module + crew boxes (hit ones highlighted, rest faint)
    const modHit = new Map();
    for (const m of ev.modulesHit) modHit.set(m.module, m.newState);
    const crewHit = new Set(ev.crewHit);
    const anchors = new Map(); // labelKey -> anchor object
    const addBox = (bb, key, mat, fillMat) => {
      const sx = bb.max[0] - bb.min[0];
      const sy = bb.max[1] - bb.min[1];
      const sz = bb.max[2] - bb.min[2];
      const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeo);
      pb.disposables.push(boxGeo, edges);
      const seg = new THREE.LineSegments(edges, mat);
      seg.position.set((bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2);
      const parent = bb.turretLocal ? turretGrp : poseGrp;
      parent.add(seg);
      if (fillMat) {
        const fill = new THREE.Mesh(boxGeo, fillMat);
        fill.position.copy(seg.position);
        parent.add(fill);
      }
      if (key && !anchors.has(key)) anchors.set(key, seg);
    };
    for (const mb of armor.modules || []) {
      const state = modHit.get(mb.module);
      const mat = state === 'red' ? S.edgeRed : state === 'yellow' ? S.edgeYellow : S.edgeDim;
      const fill = state === 'red' ? S.fillRed : state === 'yellow' ? S.fillYellow : null;
      addBox(mb, state ? `m:${mb.module}` : null, mat, fill);
    }
    for (const cb of armor.crew || []) {
      const hit = crewHit.has(cb.crew);
      addBox(cb, hit ? `c:${cb.crew}` : null, hit ? S.edgeCrew : S.edgeDim, hit ? S.fillCrew : null);
    }

    // 4. shell path through the hull (hull-local entry point + direction)
    if (ev.localPos && ev.localDir) {
      const lp = new THREE.Vector3().fromArray(ev.localPos);
      const ld = new THREE.Vector3().fromArray(ev.localDir).normalize();
      const innerLen = Math.max(1.2, (ev.caliberMm || 100) * 10 / 1000 + 0.6);
      _a.copy(lp).addScaledVector(ld, -4.5);
      tube(_a, lp, 0.022, S.pathOut, poseGrp, pb.disposables);
      _b.copy(lp).addScaledVector(ld, innerLen);
      tube(lp, _b, 0.055, S.pathIn, poseGrp, pb.disposables);
      const mGeo = new THREE.SphereGeometry(0.1, 10, 8);
      pb.disposables.push(mGeo);
      const marker = new THREE.Mesh(mGeo, S.marker);
      marker.position.copy(lp);
      poseGrp.add(marker);
    }
    poseGrp.updateMatrixWorld(true);

    // 5. DOM labels anchored to the snapshot (static world positions)
    const d = ensureDom();
    d.labelHost.textContent = '';
    pb.labels.length = 0;
    const addLabel = (world, color, main, sub, big) => {
      const label = el('div', big ? 'cot-kc-dmg' : 'cot-kc-label', d.labelHost);
      let dot = null;
      if (!big) {
        label.style.color = color;
        label.innerHTML = `${main}<span class="s">${sub}</span>`;
        dot = el('div', 'cot-kc-dot', d.labelHost);
        dot.style.color = color;
      } else {
        label.textContent = main;
      }
      pb.labels.push({ label, dot, world: world.clone() });
    };
    const modDmg = Math.round(ev.caliberMm || 0); // moduleDmg default (§2.2)
    for (const m of ev.modulesHit) {
      const seg = anchors.get(`m:${m.module}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addLabel(_p, m.newState === 'red' ? '#ff5a4a' : '#ffb43c',
        MODULE_LABEL[m.module] || m.module,
        `${m.newState === 'red' ? 'DESTROYED' : 'DAMAGED'} −${modDmg}`);
    }
    for (const c of ev.crewHit) {
      const seg = anchors.get(`c:${c}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addLabel(_p, '#ff7d8a', CREW_LABEL[c] || c, 'KNOCKED OUT');
    }
    if ((ev.damage || 0) > 0) {
      _p.set(ev.pos[0], ev.pos[1], ev.pos[2]);
      addLabel(_p, '', `−${Math.round(ev.damage)} HP`, '', true);
    }

    // 6. camera + first label projection
    rig.setExternalPose(pb.xcam.pos, pb.xcam.look, 42);
    projectLabels();
  }

  function projectLabels() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const it of pb.labels) {
      _proj.copy(it.world).project(camera);
      const behind = _proj.z > 1;
      const x = (_proj.x * 0.5 + 0.5) * w;
      const y = (-_proj.y * 0.5 + 0.5) * h;
      it.label.style.display = behind ? 'none' : 'block';
      it.label.style.left = `${x.toFixed(1)}px`;
      it.label.style.top = `${y.toFixed(1)}px`;
      if (it.dot) {
        it.dot.style.display = behind ? 'none' : 'block';
        it.dot.style.left = `${x.toFixed(1)}px`;
        it.dot.style.top = `${y.toFixed(1)}px`;
      }
    }
  }

  function updateXray(dt) {
    pb.xt += dt;
    const ang = ORBIT_RAD_S * pb.xt;
    const c = pb.xcam.center;
    const o = pb.xcam.off;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    _a.set(c.x + o.x * ca + o.z * sa, c.y + o.y, c.z - o.x * sa + o.z * ca);
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    rig.setExternalPose(_a, c, 42);
    projectLabels();
    if (pb.xt >= XRAY_HOLD_S) finish(true);
  }

  function finish(runCallback) {
    if (!active) return;
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('mousedown', onSkipKey, true);
    if (pb) {
      if (pb.ghostBackup) for (const [mesh, mat] of pb.ghostBackup) mesh.material = mat;
      for (const g of pb.disposables) g.dispose();
      scene.remove(pb.group);
      pb.group.clear();
    }
    if (dom) {
      dom.root.classList.remove('on');
      dom.labelHost.textContent = '';
    }
    const done = pb ? pb.onDone : null;
    pb = null;
    active = false;
    staged = false;
    if (runCallback && done) done();
  }

  return api;
}
