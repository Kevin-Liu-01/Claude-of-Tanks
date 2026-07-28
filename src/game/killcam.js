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
 *      depth-tested material set, muzzle-faded so the barrel tip never blows
 *      out), recognizable internal proxies (ammo cassettes, engine block,
 *      fuel drums, crew capsules) tinted green/yellow/red by post-hit state,
 *      the shell path drawn through the hull all the way to the deepest
 *      damaged component with a spall cone at the penetration point, every
 *      module / crew box outlined, hit ones highlighted + DOM-labeled with
 *      leader lines and overlap deconfliction, and an annotation block
 *      (shell, distance, angle, nominal→effective armor, pen roll, damage).
 *      Holds XRAY_HOLD_S, any key/click skips.
 *
 * The camera is driven exclusively through rig.setExternalPose (the rig's
 * external-pose API) — the rig is used, never modified.
 */
import * as THREE from 'three';
import { FONT_STACK, FONT_COND, ensureFonts } from '../ui/fonts.js';

const XRAY_HOLD_S = 7.0;
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

/**
 * Shell display name with a duplicated type token stripped: specs name rounds
 * like 'M829A4 APFSDS', and the header already prints the type badge — never
 * render 'APFSDS · M829A4 APFSDS' (same helper as shotInfo.js).
 * @param {{shellType?:string, shellName?:string}} ev HitEvent
 * @returns {string} cleaned display name ('' when it collapses to the type)
 */
function shellDisplayName(ev) {
  const type = (ev.shellType || '').trim();
  let name = (ev.shellName || '').trim();
  if (type) {
    const esc = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    name = name.replace(new RegExp(`^${esc}\\s+|\\s+${esc}$`, 'i'), '');
    if (name.toUpperCase() === type.toUpperCase()) name = '';
  }
  return name;
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
  // Lit additive material for the internal-component proxies: Lambert shading
  // gives the shapes 3D form, the emissive floor keeps them readable inside
  // the ghost hull — internals must never read as flat unlit silhouettes.
  // Diffuse/emissive are scaled WAY down: the sun runs at intensity ~4.5 and
  // these are additive, so near-full-strength colors stack to pure white.
  const prox = (hex, opacity, ds, es) => {
    const c = new THREE.Color(hex);
    return new THREE.MeshLambertMaterial({
      color: c.clone().multiplyScalar(ds),
      emissive: c.clone().multiplyScalar(es),
      transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, toneMapped: false, fog: false,
    });
  };
  // Ghost hull with a muzzle fade: thin stacked barrel/brake shells otherwise
  // sum (additive, DoubleSide) to a blown-out white stub at the gun tip. The
  // fragment alpha fades to 0 within ~1.4 m of the muzzle point (uniform set
  // per replay in beginXray from the victim's live muzzle anchor).
  const muzzleFade = { value: new THREE.Vector3(0, -1e6, 0) };
  const muzzleFadeShader = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uKcMuzzle = muzzleFade;
      sh.vertexShader = `varying vec3 vKcWorld;\n${sh.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vKcWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vKcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
      sh.fragmentShader = `varying vec3 vKcWorld;\nuniform vec3 uKcMuzzle;\n${sh.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.a *= smoothstep(0.12, 1.4, distance(vKcWorld, uKcMuzzle));`);
    };
    return mat;
  };
  const ghost = muzzleFadeShader(mesh(0x86c8f2, 0.072, THREE.DoubleSide));
  // Faint tier for LOD-wrapped detail greebles (track links, stowage, vents):
  // hundreds of small overlapping shells at full ghost opacity stack additive
  // layers into a milky white mass — they get ~1/3 the alpha instead.
  const ghostDim = muzzleFadeShader(mesh(0x86c8f2, 0.024, THREE.DoubleSide));
  // Soft radial blackout billboarded behind the ghost (WT hangar-void read):
  // canvas radial gradient, NormalBlending so it DARKENS the sunlit terrain
  // the additive hull otherwise blows out against. Procedural — no assets.
  const bdCanvas = document.createElement('canvas');
  bdCanvas.width = bdCanvas.height = 256;
  const bdCtx = bdCanvas.getContext('2d');
  const bdGrad = bdCtx.createRadialGradient(128, 128, 24, 128, 128, 128);
  bdGrad.addColorStop(0, 'rgba(3,7,11,0.52)');
  bdGrad.addColorStop(0.55, 'rgba(3,7,11,0.4)');
  bdGrad.addColorStop(1, 'rgba(3,7,11,0)');
  bdCtx.fillStyle = bdGrad;
  bdCtx.fillRect(0, 0, 256, 256);
  const bdTex = new THREE.CanvasTexture(bdCanvas);
  const backdrop = new THREE.MeshBasicMaterial({
    map: bdTex, color: 0x000000, transparent: true, opacity: 1,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
    toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  S = {
    ghost,
    ghostDim,
    ghostMuzzle: muzzleFade,
    backdrop,
    // Trail intensity is deliberately sub-bloom: additive 1px line at full
    // 0xffb060 pushed the HDR buffer over the bloom threshold and smeared
    // into a screen-wide beam (r2 critique). Halved color × lower alpha keeps
    // the path readable without ever blooming.
    trail: line(0x7d5830, 0.5),
    edgeDim: line(0x6db4e8, 0.5),
    edgeRed: line(0xff5a4a, 1.0),
    edgeYellow: line(0xffb43c, 1.0),
    edgeCrew: line(0xff7d8a, 1.0),
    // Front-side only, low alpha: DoubleSide box fills stacked front+back
    // faces into an opaque red curtain that hid the running gear (r2).
    fillRed: mesh(0xff2a1a, 0.14, THREE.FrontSide),
    fillYellow: mesh(0xff9a1c, 0.12, THREE.FrontSide),
    fillCrew: mesh(0xff3a55, 0.14, THREE.FrontSide),
    pathIn: mesh(0xff5028, 0.4),
    pathOut: mesh(0xffc27a, 0.6),
    pathCore: mesh(0xfff3d0, 0.8),
    spall: mesh(0xffa050, 0.07, THREE.DoubleSide),
    frag: mesh(0xffc27a, 0.35),
    marker: mesh(0xffffff, 0.85),
    core: mesh(0xfff3d0, 1.0),
    streak: mesh(0xffb464, 0.85),
    // Internal proxies: distinct per-kind hues (WT visual language — brass
    // ammo, steel-blue engine, amber fuel) for HEALTHY modules; hit ones
    // override to the yellow/red state tints.
    proxAmmo: prox(0xe0c25e, 0.55, 0.055, 0.13),
    proxEngine: prox(0x4aa8c8, 0.55, 0.055, 0.13),
    proxFuel: prox(0xcf7f3a, 0.55, 0.055, 0.13),
    proxSteel: prox(0x9fb4c4, 0.5, 0.05, 0.11),
    proxRadio: prox(0x6ad0a8, 0.5, 0.05, 0.11),
    proxGreen: prox(0x2fd98c, 0.55, 0.055, 0.13),
    proxYellow: prox(0xffb43c, 0.6, 0.07, 0.17),
    proxRed: prox(0xff4a38, 0.65, 0.08, 0.2),
  };
  S.disposeTex = bdTex; // kept for completeness; singleton lives app-long
  return S;
}

/** Healthy-state proxy material for a module kind (distinct WT-style hues). */
function proxMatFor(kind) {
  switch (kind) {
    case 'ammoRack': return S.proxAmmo;
    case 'engine': return S.proxEngine;
    case 'fuelTank': return S.proxFuel;
    case 'radio': return S.proxRadio;
    case 'gun':
    case 'turretRing': return S.proxSteel;
    case 'optics': return S.proxSteel;
    default: return S.proxGreen;
  }
}

// ---------------------------------------------------------------------------
// Internal-component proxies (recognizable shapes inside the module boxes)
// ---------------------------------------------------------------------------

/** Group centered on a module/crew bounding box, parented to its frame. */
function proxyGroup(bb, poseGrp, turretGrp) {
  const g = new THREE.Group();
  g.position.set(
    (bb.min[0] + bb.max[0]) / 2,
    (bb.min[1] + bb.max[1]) / 2,
    (bb.min[2] + bb.max[2]) / 2,
  );
  (bb.turretLocal ? turretGrp : poseGrp).add(g);
  return g;
}

/**
 * War Thunder-style recognizable internals: ammo cassette rows, ribbed engine
 * block, fuel drums, breech, ring, periscope — tinted by post-hit state.
 * @param {{module:string,min:number[],max:number[],turretLocal:boolean}} bb
 * @param {THREE.Material} mat state-tinted proxy material
 */
function addModuleProxy(bb, mat, poseGrp, turretGrp, disposables) {
  const kind = bb.module;
  if (kind === 'trackL' || kind === 'trackR') return; // real track geometry reads already
  const sx = bb.max[0] - bb.min[0];
  const sy = bb.max[1] - bb.min[1];
  const sz = bb.max[2] - bb.min[2];
  const g = proxyGroup(bb, poseGrp, turretGrp);
  const put = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  if (kind === 'ammoRack') {
    // cassette rows of standing rounds
    const nx = Math.max(2, Math.min(5, Math.floor(sx / 0.24)));
    const nz = Math.max(2, Math.min(7, Math.floor(sz / 0.24)));
    const r = Math.min(0.055, (sx / nx) * 0.3, (sz / nz) * 0.3);
    const h = sy * 0.82;
    const geo = new THREE.CylinderGeometry(r, r, h, 8);
    disposables.push(geo);
    const im = new THREE.InstancedMesh(geo, mat, nx * nz);
    disposables.push(im);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        m4.makeTranslation(
          -sx / 2 + (ix + 0.5) * (sx / nx),
          -sy / 2 + h / 2,
          -sz / 2 + (iz + 0.5) * (sz / nz),
        );
        im.setMatrixAt(i++, m4);
      }
    }
    g.add(im);
  } else if (kind === 'engine') {
    // block + cooling ribs + fan disc
    put(new THREE.BoxGeometry(sx * 0.78, sy * 0.58, sz * 0.8), 0, -sy * 0.14, 0);
    for (let i = 0; i < 4; i++) {
      put(new THREE.BoxGeometry(sx * 0.84, sy * 0.18, sz * 0.09),
        0, sy * 0.18, -sz * 0.32 + i * (sz * 0.64 / 3));
    }
    put(new THREE.CylinderGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.2, sy * 0.1, 14),
      -sx * 0.18, sy * 0.32, 0);
  } else if (kind === 'fuelTank') {
    const r = Math.max(0.05, Math.min(sy * 0.42, sx * 0.21));
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), -sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
  } else if (kind === 'gun') {
    // breech block + recoil cylinder pointing out the front of the box
    put(new THREE.BoxGeometry(sx * 0.72, sy * 0.72, sz * 0.55), 0, 0, -sz * 0.12);
    put(new THREE.CylinderGeometry(Math.min(sx, sy) * 0.2, Math.min(sx, sy) * 0.2, sz * 0.5, 10),
      0, 0, sz * 0.28, Math.PI / 2, 0, 0);
  } else if (kind === 'radio') {
    put(new THREE.BoxGeometry(sx * 0.75, sy * 0.55, sz * 0.7), 0, -sy * 0.12, 0);
    put(new THREE.CylinderGeometry(0.012, 0.012, sy * 0.7, 6), sx * 0.2, sy * 0.24, 0);
  } else if (kind === 'optics') {
    put(new THREE.CylinderGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.2, sy * 0.7, 8),
      0, -sy * 0.05, 0);
    put(new THREE.BoxGeometry(sx * 0.5, sy * 0.22, sz * 0.5), 0, sy * 0.34, 0);
  } else if (kind === 'turretRing') {
    const R = Math.min(sx, sz) * 0.44;
    put(new THREE.TorusGeometry(R, Math.min(sy * 0.3, 0.06), 8, 28), 0, 0, 0, Math.PI / 2, 0, 0);
  } else {
    put(new THREE.BoxGeometry(sx * 0.6, sy * 0.6, sz * 0.6));
  }
}

/** Crew proxy: seated capsule (tapered body cylinder + head sphere). */
function addCrewProxy(bb, mat, poseGrp, turretGrp, disposables) {
  const sx = bb.max[0] - bb.min[0];
  const sy = bb.max[1] - bb.min[1];
  const sz = bb.max[2] - bb.min[2];
  const g = proxyGroup(bb, poseGrp, turretGrp);
  const r = Math.min(sx, sz) * 0.3;
  const headR = Math.max(0.05, Math.min(r * 0.85, sy * 0.2));
  const bodyH = sy * 0.6;
  const body = new THREE.CylinderGeometry(r * 0.8, r, bodyH, 10);
  const head = new THREE.SphereGeometry(headR, 10, 8);
  disposables.push(body, head);
  const bm = new THREE.Mesh(body, mat);
  bm.position.y = -sy / 2 + bodyH / 2;
  const hm = new THREE.Mesh(head, mat);
  hm.position.y = -sy / 2 + bodyH + headR * 0.85;
  g.add(bm, hm);
}

// ---------------------------------------------------------------------------
// DOM overlay (letterbox + title + annotation block + projected labels)
// ---------------------------------------------------------------------------
const KC_CSS = `
.cot-kc{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;
  font-family:${FONT_STACK};color:#e6edf3;}
.cot-kc.on{display:block;}
.cot-kc *{box-sizing:border-box;margin:0;padding:0;}
.cot-kc-veil{position:absolute;inset:0;opacity:0;transition:opacity .5s ease;
  background:radial-gradient(ellipse 62% 55% at 50% 52%,rgba(3,7,11,.20) 0%,rgba(2,5,8,.44) 100%);}
.cot-kc.xr .cot-kc-veil{opacity:1;}
@keyframes cotKcIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
.cot-kc-anim{opacity:0;animation:cotKcIn .35s ease forwards;}
line.cot-kc-anim{animation-name:cotKcInLine;}
@keyframes cotKcInLine{from{opacity:0;}to{opacity:.85;}}
.cot-kc-micro{position:absolute;white-space:nowrap;background:rgba(6,9,12,.6);
  border:1px solid rgba(146,164,180,.25);color:#9fc0da;padding:1px 5px 2px;
  font-family:${FONT_COND};font-stretch:condensed;font-weight:700;font-size:9px;
  letter-spacing:.14em;text-transform:uppercase;line-height:1.2;}
.cot-kc-bart,.cot-kc-barb{position:absolute;left:0;right:0;height:9vh;}
.cot-kc-bart{top:0;background:linear-gradient(180deg,rgba(0,0,0,.94),rgba(0,0,0,.6) 70%,transparent);}
.cot-kc-barb{bottom:0;background:linear-gradient(0deg,#000 38%,rgba(0,0,0,.72) 68%,transparent);}
.cot-kc-title{position:absolute;top:2.4vh;left:50%;transform:translateX(-50%);text-align:center;}
.cot-kc-title .t{font-family:${FONT_COND};font-stretch:condensed;font-weight:800;
  font-size:17px;letter-spacing:.46em;color:#ffd9a0;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.cot-kc-title .s{font-size:10.5px;letter-spacing:.18em;color:#aeb9c4;margin-top:3px;
  font-variant-numeric:tabular-nums;}
.cot-kc-skip{position:absolute;bottom:1.6vh;right:30px;font-family:${FONT_COND};
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
.cot-kc-label{position:absolute;white-space:nowrap;
  background:rgba(6,9,12,.86);border:1px solid currentColor;padding:3px 8px 4px;
  font-family:${FONT_COND};font-stretch:condensed;font-weight:800;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;line-height:1.25;
  box-shadow:0 2px 10px rgba(0,0,0,.6);}
.cot-kc-label .s{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  color:#e8f0f6;font-variant-numeric:tabular-nums;}
.cot-kc-dot{position:absolute;width:7px;height:7px;border-radius:50%;
  transform:translate(-50%,-50%);background:currentColor;box-shadow:0 0 9px currentColor;}
.cot-kc-dmg{position:absolute;font-family:${FONT_COND};
  font-stretch:condensed;font-weight:800;font-size:24px;color:#ffd166;
  letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.9);font-variant-numeric:tabular-nums;}
.cot-kc-leader{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
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
    el('div', 'cot-kc-veil', root); // x-ray backdrop dim (class 'xr' on root)
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
    // leader-line layer sits under the label chips
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'cot-kc-leader');
    root.appendChild(leader);
    const labelHost = el('div', '', root);
    dom = { root, titleT, titleS, hdK, hdW, rows, banner, labelHost, leader };
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
      // Deterministic capture: strip the label reveal animation — the shot
      // harness grabs the frame ~1.2 s after set(), and heavy first-frame
      // work (shader compiles) can delay CSS timelines past the capture.
      if (pb) {
        for (const it of pb.labels) {
          for (const n of [it.label, it.dot, it.line]) {
            if (!n) continue;
            n.classList.remove('cot-kc-anim');
            n.style.animationDelay = '';
          }
        }
      }
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
      backdrop: null,
      fxGroup: null, fxWasVisible: true,
      vegGroup: null, vegWasVisible: true,
    };
    pb.group.name = 'killcam';
    scene.add(pb.group);

    // Suppress live battle FX for the whole replay: the victim's death
    // fireball/smoke rendered ON TOP of the x-ray ghost, and the dying
    // shell's neon tracer afterglow cut a bloomed beam across the frame
    // (r2 critique). The fx module's root group is named 'fx'; hide it and
    // restore in finish() so the death-cam wreck smoke resumes afterwards.
    pb.fxGroup = scene.getObjectByName('fx') || null;
    if (pb.fxGroup) {
      pb.fxWasVisible = pb.fxGroup.visible;
      pb.fxGroup.visible = false;
    }

    // annotation block
    const ev = snap.ev;
    d.titleT.textContent = kind === 'victory' ? 'FINAL BLOW' : 'KILL CAM';
    d.titleS.textContent = kind === 'victory'
      ? `${ev.targetName || ''} destroyed`
      : `destroyed by ${ev.attackerName || 'enemy fire'}`;
    const cleanName = shellDisplayName(ev);
    d.hdK.textContent = cleanName ? `${ev.shellType || ''} · ${cleanName}` : (ev.shellType || '');
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
    d.leader.textContent = '';
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
    // higher vantage (~35°) than the old R*0.4: the sightline clears the
    // tall-grass band instead of dragging bright blades across the ghost
    const off = new THREE.Vector3()
      .addScaledVector(_s, R * 0.88)
      .addScaledVector(dirW, -R * 0.4);
    off.y += R * 0.68;
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
    // Cap the visible trail to the final ~60 m of arc: the full muzzle-to-hull
    // polyline read as a beam lasering across the whole map during the hold.
    if (pb.trailGeo && pb.cum && pb.pts) {
      let start = 0;
      const keepFrom = pb.total - 60;
      while (start < pb.pts.length - 2 && pb.cum[start + 1] < keepFrom) start++;
      pb.trailGeo.setDrawRange(start, pb.pts.length - start);
    }

    const snap = pb.snap;
    const ev = snap.ev;
    const armor = snap.armor;
    const pose = snap.pose;

    // 1. ghost-translucent victim — shared additive/depth-tested material set
    const vis = snap.targetEnt.visual;
    vis.setVisible(true); // player may have died while scoped (hull hidden)
    // fade the ghost out toward the muzzle tip (kills the additive blow-out stub)
    if (vis.gunMuzzleWorld) S.ghostMuzzle.value.copy(vis.gunMuzzleWorld(_p));
    else S.ghostMuzzle.value.set(0, -1e6, 0);
    pb.ghostBackup = [];
    // Ghost EVERY mesh, including currently-hidden LOD detail levels: the
    // x-ray camera sits close enough to flip LODs mid-hold, and a skipped
    // mesh would pop in with its original dark non-additive material and
    // read as a black hole in the hull. LOD-wrapped detail greebles get the
    // faint tier so their dense stacking never washes the hull to white.
    vis.root.traverse((o) => {
      if (o.isMesh) {
        pb.ghostBackup.push([o, o.material]);
        let inLod = false;
        for (let p = o.parent; p && !inLod; p = p.parent) inLod = !!p.isLOD;
        o.material = inLod ? S.ghostDim : S.ghost;
      }
    });

    // 1a. isolate the vehicle for the hold (WT x-ray read): sunlit grass
    // blades under/behind the hull otherwise show straight through the
    // translucent ghost as bright speckle noise. The vegetation layer comes
    // back in finish() for the death cam / next battle.
    pb.vegGroup = scene.getObjectByName('vegetation') || null;
    if (pb.vegGroup) {
      pb.vegWasVisible = pb.vegGroup.visible;
      pb.vegGroup.visible = false;
    }

    // 1b. radial blackout billboard behind the ghost: the additive hull
    // washed to white speckle over sunlit grass — the backdrop darkens what
    // the ghost is composited against (luminance headroom, WT hangar read).
    {
      const R = Math.max(9, snap.boundingRadiusM * 3.4);
      const geo = new THREE.PlaneGeometry(R * 2.4, R * 1.7);
      pb.disposables.push(geo);
      pb.backdrop = new THREE.Mesh(geo, S.backdrop);
      pb.backdrop.renderOrder = -5; // before every additive ghost/proxy layer
      pb.backdrop.position.set(pose.pos[0], pose.pos[1] + snap.heightM * 0.5, pose.pos[2]);
      pb.backdrop.lookAt(pb.xcam.pos);
      pb.group.add(pb.backdrop);
    }

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
      // every module box anchors (hit ones get damage chips, idle key
      // internals get always-on micro-labels — WT-style AMMO/ENGINE/FUEL)
      addBox(mb, `m:${mb.module}`, mat, fill);
    }
    for (const cb of armor.crew || []) {
      const hit = crewHit.has(cb.crew);
      addBox(cb, hit ? `c:${cb.crew}` : null, hit ? S.edgeCrew : S.edgeDim, hit ? S.fillCrew : null);
    }

    // 3b. recognizable internals inside the boxes — ammo cassette rows, ribbed
    // engine block, fuel drums, breech, crew capsules. Healthy modules wear
    // distinct per-kind hues (brass ammo, steel-blue engine, amber fuel);
    // hit ones override to yellow (damaged) / red (destroyed) state tints.
    const stateMat = (state, kind) =>
      state === 'red' ? S.proxRed : state === 'yellow' ? S.proxYellow : proxMatFor(kind);
    for (const mb of armor.modules || []) {
      addModuleProxy(mb, stateMat(modHit.get(mb.module), mb.module), poseGrp, turretGrp, pb.disposables);
    }
    for (const cb of armor.crew || []) {
      addCrewProxy(cb, crewHit.has(cb.crew) ? S.proxRed : S.proxGreen,
        poseGrp, turretGrp, pb.disposables);
    }

    // 4. shell path through the hull: approach tracer, penetration marker, a
    // bright internal segment carried all the way to the DEEPEST damaged
    // component (entry -> ammo rack is the story), and a spall cone with
    // deterministic fragment rays opening from the penetration point.
    if (ev.localPos && ev.localDir) {
      const lp = new THREE.Vector3().fromArray(ev.localPos);
      const ld = new THREE.Vector3().fromArray(ev.localDir).normalize();
      // deepest damaged module/crew center along the internal ray (hull frame)
      const tyaw = pose.turretYaw || 0;
      const tc = Math.cos(tyaw);
      const ts = Math.sin(tyaw);
      let deepest = 0;
      const depthOf = (bb) => {
        let cx = (bb.min[0] + bb.max[0]) / 2;
        const cyy = (bb.min[1] + bb.max[1]) / 2;
        let cz = (bb.min[2] + bb.max[2]) / 2;
        if (bb.turretLocal) { // turret frame -> hull frame
          const rx = cx * tc + cz * ts;
          const rz = -cx * ts + cz * tc;
          cx = rx + armor.turretPivot[0];
          cz = rz + armor.turretPivot[2];
          return _a.set(cx, cyy + armor.turretPivot[1], cz).sub(lp).dot(ld);
        }
        return _a.set(cx, cyy, cz).sub(lp).dot(ld);
      };
      for (const m of ev.modulesHit) {
        const bb = (armor.modules || []).find((b) => b.module === m.module);
        if (bb) deepest = Math.max(deepest, depthOf(bb));
      }
      for (const c of ev.crewHit) {
        const bb = (armor.crew || []).find((b) => b.crew === c);
        if (bb) deepest = Math.max(deepest, depthOf(bb));
      }
      const innerLen = Math.max(1.2, (ev.caliberMm || 100) * 10 / 1000 + 0.6, deepest + 0.35);
      _a.copy(lp).addScaledVector(ld, -4.5);
      tube(_a, lp, 0.022, S.pathOut, poseGrp, pb.disposables);
      _b.copy(lp).addScaledVector(ld, innerLen);
      tube(lp, _b, 0.075, S.pathIn, poseGrp, pb.disposables);   // hot sheath
      tube(lp, _b, 0.028, S.pathCore, poseGrp, pb.disposables); // white-hot core
      // spall cone: apex at the penetration point, opening along the path
      const coneLen = innerLen * 0.8;
      const coneGeo = new THREE.ConeGeometry(coneLen * 0.24, coneLen, 14, 1, true);
      pb.disposables.push(coneGeo);
      const cone = new THREE.Mesh(coneGeo, S.spall);
      cone.position.copy(lp).addScaledVector(ld, coneLen * 0.5);
      cone.quaternion.setFromUnitVectors(_Y, _s.copy(ld).negate());
      poseGrp.add(cone);
      // deterministic fragment rays fanned inside the cone
      const side = new THREE.Vector3().crossVectors(ld, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      const norm = new THREE.Vector3().crossVectors(ld, side);
      for (let i = 0; i < 7; i++) {
        const az = (i / 7) * Math.PI * 2 + 0.45;
        const spread = 0.13 + 0.1 * (((i * 37) % 5) / 4);
        const len = innerLen * (0.35 + 0.5 * (((i * 53) % 7) / 6));
        _a.copy(ld)
          .addScaledVector(side, Math.cos(az) * spread)
          .addScaledVector(norm, Math.sin(az) * spread)
          .normalize();
        _b.copy(lp).addScaledVector(_a, len);
        tube(lp, _b, 0.012, S.frag, poseGrp, pb.disposables);
      }
      const mGeo = new THREE.SphereGeometry(0.1, 10, 8);
      pb.disposables.push(mGeo);
      const marker = new THREE.Mesh(mGeo, S.marker);
      marker.position.copy(lp);
      poseGrp.add(marker);
    }
    poseGrp.updateMatrixWorld(true);

    // 5. DOM labels anchored to the snapshot (static world positions); each
    // chip gets a leader line to its module dot and joins the vertical
    // deconfliction pass in projectLabels(). Every number rendered here comes
    // straight from the sim event — module damage is ev.modulesHit[i].dmg
    // (the actual rolled value damage.js applied); when a payload predates
    // that field the number is OMITTED rather than fabricated.
    const d = ensureDom();
    d.root.classList.add('xr'); // fade in the x-ray backdrop dim
    d.labelHost.textContent = '';
    d.leader.textContent = '';
    pb.labels.length = 0;
    const addLabel = (world, color, main, sub, big) => {
      const label = el('div', big ? 'cot-kc-dmg' : 'cot-kc-label', d.labelHost);
      let dot = null;
      let line = null;
      if (!big) {
        label.style.color = color;
        label.innerHTML = `${main}<span class="s">${sub}</span>`;
        dot = el('div', 'cot-kc-dot', d.labelHost);
        dot.style.color = color;
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', '0.85');
        d.leader.appendChild(line);
      } else {
        label.textContent = main;
      }
      pb.labels.push({ label, dot, line, big: !!big, world: world.clone() });
    };
    /** Idle micro-label (no dot/leader): WT-style always-on internals tag. */
    const addMicro = (world, text) => {
      const label = el('div', 'cot-kc-micro', d.labelHost);
      label.textContent = text;
      pb.labels.push({ label, dot: null, line: null, big: false, micro: true, world: world.clone() });
    };
    const MOD_STATE_WORD = { red: 'DESTROYED', yellow: 'DAMAGED', ok: 'HIT' };
    const MOD_STATE_COLOR = { red: '#ff5a4a', yellow: '#ffb43c', ok: '#8fb8d8' };
    for (const m of ev.modulesHit) {
      const seg = anchors.get(`m:${m.module}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      // honest damage number: only the sim's rolled value, never the caliber
      const dmgTxt = Number.isFinite(m.dmg) ? ` −${Math.round(m.dmg)}` : '';
      addLabel(_p, MOD_STATE_COLOR[m.newState] || MOD_STATE_COLOR.ok,
        MODULE_LABEL[m.module] || m.module,
        `${MOD_STATE_WORD[m.newState] || 'HIT'}${dmgTxt}`);
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
    // idle micro-labels on the key internals the eye needs to identify
    const MICRO = { ammoRack: 'AMMO', engine: 'ENGINE', fuelTank: 'FUEL' };
    for (const key of Object.keys(MICRO)) {
      if (modHit.has(key)) continue; // hit ones already carry a damage chip
      const seg = anchors.get(`m:${key}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addMicro(_p, MICRO[key]);
    }

    // staggered reveal guided from the impact point outward (chips first,
    // micro tags last) — everything is readable well inside the hold window
    _p.set(ev.pos[0], ev.pos[1], ev.pos[2]);
    const ordered = pb.labels.slice().sort((a, b) => {
      if (!!a.micro !== !!b.micro) return a.micro ? 1 : -1;
      return a.world.distanceToSquared(_p) - b.world.distanceToSquared(_p);
    });
    ordered.forEach((it, i) => {
      const delay = `${Math.min(0.6, i * 0.1).toFixed(2)}s`;
      for (const n of [it.label, it.dot, it.line]) {
        if (!n) continue;
        n.classList.add('cot-kc-anim');
        n.style.animationDelay = delay;
      }
    });

    // 6. camera + first label projection
    rig.setExternalPose(pb.xcam.pos, pb.xcam.look, 42);
    projectLabels();
  }

  function projectLabels() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // pass 1: project anchors, compute each chip's desired rect
    for (const it of pb.labels) {
      _proj.copy(it.world).project(camera);
      it.hidden = _proj.z > 1;
      if (it.hidden) continue;
      it.ax = (_proj.x * 0.5 + 0.5) * w;
      it.ay = (-_proj.y * 0.5 + 0.5) * h;
      it.lw = it.label.offsetWidth || 60;
      it.lh = it.label.offsetHeight || 18;
      it.left = it.ax - it.lw / 2;
      // micro tags sit right on their component (no leader line); chips
      // float above their dot; the big damage number hangs below the impact
      it.top = it.big ? it.ay + 14 : it.micro ? it.ay - it.lh / 2 : it.ay - 30 - it.lh;
    }
    // pass 2: vertical deconfliction — when projected rects overlap, cascade
    // the later chip below the earlier one with a 4px gap
    const items = pb.labels.filter((it) => !it.hidden).sort((a, b) => a.top - b.top);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = 0; j < i; j++) {
        const b = items[j];
        if (a.left < b.left + b.lw + 6 && b.left < a.left + a.lw + 6 &&
            a.top < b.top + b.lh + 4 && b.top < a.top + a.lh + 4) {
          a.top = b.top + b.lh + 4;
        }
      }
    }
    // pass 3: write DOM positions + leader lines dot -> chip edge
    for (const it of pb.labels) {
      const off = it.hidden;
      it.label.style.display = off ? 'none' : 'block';
      if (it.dot) it.dot.style.display = off ? 'none' : 'block';
      if (it.line) it.line.style.display = off ? 'none' : 'block';
      if (off) continue;
      it.label.style.left = `${it.left.toFixed(1)}px`;
      it.label.style.top = `${it.top.toFixed(1)}px`;
      if (it.dot) {
        it.dot.style.left = `${it.ax.toFixed(1)}px`;
        it.dot.style.top = `${it.ay.toFixed(1)}px`;
      }
      if (it.line) {
        const below = it.top > it.ay; // chip was cascaded under its anchor
        it.line.setAttribute('x1', it.ax.toFixed(1));
        it.line.setAttribute('y1', it.ay.toFixed(1));
        it.line.setAttribute('x2', (it.left + it.lw / 2).toFixed(1));
        it.line.setAttribute('y2', (below ? it.top : it.top + it.lh).toFixed(1));
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
    if (pb.backdrop) pb.backdrop.lookAt(_a); // keep the blackout camera-facing
    projectLabels();
    if (pb.xt >= XRAY_HOLD_S) finish(true);
  }

  function finish(runCallback) {
    if (!active) return;
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('mousedown', onSkipKey, true);
    if (pb) {
      if (pb.ghostBackup) for (const [mesh, mat] of pb.ghostBackup) mesh.material = mat;
      if (pb.fxGroup) pb.fxGroup.visible = pb.fxWasVisible; // battle FX resume
      if (pb.vegGroup) pb.vegGroup.visible = pb.vegWasVisible; // vegetation back
      for (const g of pb.disposables) g.dispose();
      scene.remove(pb.group);
      pb.group.clear();
    }
    if (dom) {
      dom.root.classList.remove('on');
      dom.root.classList.remove('xr');
      dom.labelHost.textContent = '';
      dom.leader.textContent = '';
    }
    const done = pb ? pb.onDone : null;
    pb = null;
    active = false;
    staged = false;
    if (runCallback && done) done();
  }

  return api;
}
