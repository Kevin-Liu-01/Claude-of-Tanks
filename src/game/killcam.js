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
 *   2. X-RAY  — the victim rendered ghost-translucent (view-dependent fresnel
 *      skin, alpha-over blending that saturates instead of stacking to white,
 *      no depth writes so GTAO never shades a phantom hull), recognizable
 *      internal proxies drawn OVER the skin (ammo cassettes, engine block,
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
import { getSpec, ALL_TANK_IDS } from '../vehicles/specs.js';
import { penAtDistanceMm } from '../sim/ballistics.js';

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
// scratch camera for the x-ray framing solve (fov/aspect set per solve)
const _fitCam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 4000);

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

/**
 * Nominal (un-rolled) penetration of the event's shell at the event's flight
 * distance — the exact baseline the sim's ±25% pen roll was made from
 * (ensurePenRoll: rollUniform(rng, penAtDistanceMm(spec, distM))). Resolved
 * from the attacker's spec so the annotation can print 'roll / nominal'
 * (same helper as shotInfo.js; a bare pen roll beside a 63 mm plate read as
 * a bug to anyone knowing the shell's paper pen, r4 critique).
 * @param {object} ev HitEvent
 * @returns {number} nominal pen in mm (0 when unresolvable)
 */
function nominalPenFor(ev) {
  try {
    const spec = ev.attackerSpecId ? getSpec(ev.attackerSpecId) : null;
    const shells = spec && spec.gun ? spec.gun.shells : null;
    let sh = shells
      ? (shells.find((s) => s.name === ev.shellName && s.type === ev.shellType)
        || shells.find((s) => s.type === ev.shellType))
      : null;
    if (!sh && ev.shellName) {
      // Payload carries no attackerSpecId (staged frames): resolve the shell
      // by exact identity across the whole roster instead of printing the
      // context-free bare roll (r5 critique — 'Pen roll 1027 mm' with no
      // '/ 885' baseline). Only an UNAMBIGUOUS match is trusted: if two guns
      // ship a same-named shell with different pen curves, the baseline is
      // omitted rather than guessed — the panel must never lie.
      let pen = -1;
      for (const id of ALL_TANK_IDS) {
        const g = getSpec(id).gun;
        if (!g || !g.shells) continue;
        for (const c of g.shells) {
          if (c.name !== ev.shellName || c.type !== ev.shellType) continue;
          const p = Math.round(penAtDistanceMm(c, ev.flightDistM || 0));
          if (pen === -1) { pen = p; sh = c; } else if (p !== pen) return 0;
        }
      }
    }
    return sh ? Math.round(penAtDistanceMm(sh, ev.flightDistM || 0)) : 0;
  } catch (_) { return 0; }
}

// ---------------------------------------------------------------------------
// Shared x-ray material set (lazy singleton; depth-tested)
// ---------------------------------------------------------------------------
let S = null;
function sharedMats() {
  if (S) return S;
  const mesh = (color, opacity, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side, toneMapped: false, fog: false,
  });
  // NORMAL-blended variant for the penetration channel/spall/markers:
  // additive geometry over the frosted skin's bright regions sums toward
  // white and vanishes (r5 — the internal path was invisible exactly where
  // the story happens). Alpha-over REPLACES background color, so the hot
  // channel stays saturated over any skin density.
  const nmesh = (color, opacity, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.NormalBlending,
    depthWrite: false, depthTest: true, side, toneMapped: false, fog: false,
  });
  const line = (color, opacity) => new THREE.LineBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false, fog: false,
  });
  // Lit NORMAL-blended material for the internal-component proxies: Lambert
  // shading gives the shapes 3D form, the emissive floor keeps them readable
  // inside the ghost hull. Additive blending is deliberately NOT used here —
  // stacked crew capsules / structure shells summed into featureless white
  // columns that buried the ammo cassettes and engine block (r3 critique);
  // alpha-over keeps each organ a distinct colored silhouette (WT-style),
  // whatever the view angle. Diffuse is still scaled down (sun ~4.5).
  const prox = (hex, opacity, ds, es) => {
    const c = new THREE.Color(hex);
    return new THREE.MeshLambertMaterial({
      color: c.clone().multiplyScalar(ds),
      emissive: c.clone().multiplyScalar(es),
      transparent: true, opacity, blending: THREE.NormalBlending,
      depthWrite: false, depthTest: true, toneMapped: false, fog: false,
    });
  };
  // Ghost hull, War Thunder-class: a view-dependent fresnel skin (alpha rises
  // toward grazing angles → crisp luminous silhouette edges, translucent
  // face-on centers) composited with NORMAL blending. Alpha-over stacking
  // SATURATES toward the skin color — dense mesh regions read as denser
  // frost, never the additive white fog of r4 — and the material writes no
  // depth, so the post chain's GTAO (which samples the shared scene depth
  // buffer) never shades a phantom hull: an earlier depth-prepass variant
  // painted a dark AO-stippled tank silhouette through the skin (live Abrams
  // probe). Internals/boxes/path render AFTER the hull (pb.group renderOrder
  // 12 vs skin 11) so the organs stay crisp regardless of skin density —
  // same layering WT uses.
  const ghost = new THREE.MeshBasicMaterial({
    color: 0x9fd2f2, transparent: true, opacity: 1,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  // Soft radial glow texture (canvas-generated, fully procedural) for the
  // flight tracer: the r6 flight frame read as a bare white ball on an
  // orange stick — no bloom halo, no motion stretch. A sprite with this
  // gradient fakes a bloomed tracer core at any exposure without pushing
  // the HDR buffer over the bloom threshold (the r2 screen-wide-beam trap).
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d');
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,224,168,0.9)');
  grad.addColorStop(0.55, 'rgba(255,176,96,0.30)');
  grad.addColorStop(1.0, 'rgba(255,150,60,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  // Per-victim hull bounds for the depth-graded alpha below — beginXray()
  // writes these every x-ray (uniform VALUE objects shared by reference, so
  // the shader picks the write up whether it compiled before or after).
  const ghostCenter = { value: new THREE.Vector3(0, -1e6, 0) };
  const ghostRad = { value: 6 };
  ghost.onBeforeCompile = (sh) => {
    sh.uniforms.kcCenter = ghostCenter;
    sh.uniforms.kcRad = ghostRad;
    sh.vertexShader = `varying vec3 vKcW;\nvarying vec3 vKcN;\n${sh.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vKcW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        vKcN = mat3(modelMatrix) * (mat3(instanceMatrix) * normal);
      #else
        vKcW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vKcN = mat3(modelMatrix) * normal;
      #endif`);
    sh.fragmentShader =
      `varying vec3 vKcW;\nvarying vec3 vKcN;\nuniform vec3 kcCenter;\nuniform float kcRad;\n${sh.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      {
        vec3 kcV = normalize(cameraPosition - vKcW);
        float kcF = 1.0 - abs(dot(normalize(vKcN), kcV));
        // Depth-graded fresnel (WT x-ray read): faces on the CAMERA side of
        // the hull sit dim, far-side faces brighten — the skin reads as a
        // volume with a lit back wall instead of a flat slab. kcT is the
        // fragment's normalized depth through the victim's bounding sphere.
        float kcNear = distance(cameraPosition, kcCenter) - kcRad;
        float kcT = clamp((distance(cameraPosition, vKcW) - kcNear)
          / max(kcRad * 2.0, 0.001), 0.0, 1.0);
        // Face-on floor 0.06 per layer: the r5 staged Tiger stacked glacis +
        // wheels + tracks + fenders into 8-12 alpha-over layers up front and
        // saturated to a featureless porcelain slab at the old 0.17 floor.
        // 0.06 keeps a dense stack at frost (~0.30-0.45); the grazing term is
        // gained low with a tight exponent so rims stay THIN luminous lines
        // instead of the roof/sponson planes (huge near-grazing areas from
        // the 24-degree vantage) washing out into white sheets.
        diffuseColor.a *= (0.06 + 0.34 * pow(kcF, 2.6)) * mix(0.55, 1.3, kcT);
        diffuseColor.rgb *= 0.72 + 0.26 * kcF;
      }`);
  };
  S = {
    ghost, ghostCenter, ghostRad,
    // Trail intensity is deliberately sub-bloom: additive 1px line at full
    // 0xffb060 pushed the HDR buffer over the bloom threshold and smeared
    // into a screen-wide beam (r2 critique). Halved color × lower alpha keeps
    // the path readable without ever blooming.
    trail: line(0x7d5830, 0.5),
    // x-ray approach ribbon (glow sheath + hot core tubes over the final
    // trail arc): the bare 1px GL line read as a laser-pointer thread at
    // 1080p (r5 critique). Colors stay ≤1 so the ribbon never blooms.
    trailGlow: mesh(0xcf9a4e, 0.22),
    trailCore: mesh(0xffd9a0, 0.7),
    // flight-phase tracer dressing: bloomed-looking halo sprite around the
    // core + a velocity-stretched glow cone trailing it (see begin())
    halo: new THREE.SpriteMaterial({
      map: glowTex, color: 0xffdfae, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      fog: false,
    }),
    tail: mesh(0xffa050, 0.17, THREE.DoubleSide),
    // Un-hit module outlines dropped to a whisper (0.15): the full-bright
    // white wireframe lattice on EVERY box competed with the shell path and
    // read as an engineering debug view (r6 critique). Bright outlines are
    // reserved for hit/destroyed modules and crew casualties.
    edgeDim: line(0x6db4e8, 0.15),
    edgeRed: line(0xff5a4a, 1.0),
    edgeYellow: line(0xffb43c, 1.0),
    edgeCrew: line(0xff7d8a, 1.0),
    // Front-side only, low alpha: DoubleSide box fills stacked front+back
    // faces into an opaque red curtain that hid the running gear (r2).
    fillRed: mesh(0xff2a1a, 0.14, THREE.FrontSide),
    fillYellow: mesh(0xff9a1c, 0.12, THREE.FrontSide),
    fillCrew: mesh(0xff3a55, 0.14, THREE.FrontSide),
    pathIn: nmesh(0xff4a20, 0.85),
    pathOut: mesh(0xffc27a, 0.6),
    pathCore: nmesh(0xffe9b8, 0.95),
    spall: nmesh(0xff8438, 0.16, THREE.DoubleSide),
    frag: nmesh(0xffb060, 0.55),
    marker: nmesh(0xffffff, 0.95),
    core: mesh(0xfff3d0, 1.0),
    streak: mesh(0xffb464, 0.85),
    // Internal proxies: distinct per-kind hues (WT visual language — brass
    // ammo, steel-blue engine, amber fuel) for HEALTHY modules; hit ones
    // override to the yellow/red state tints.
    proxAmmo: prox(0xe0c25e, 0.8, 0.1, 0.34),
    proxEngine: prox(0x4aa8c8, 0.8, 0.1, 0.34),
    proxFuel: prox(0xcf7f3a, 0.8, 0.1, 0.34),
    proxSteel: prox(0x9fb4c4, 0.72, 0.09, 0.28),
    proxRadio: prox(0x6ad0a8, 0.72, 0.09, 0.28),
    proxGreen: prox(0x2fd98c, 0.8, 0.1, 0.34),
    proxYellow: prox(0xffb43c, 0.88, 0.12, 0.44),
    proxRed: prox(0xff4a38, 0.92, 0.13, 0.52),
    // neutral crew slump tint: a destroyed tank must not show a thriving
    // bright-green crew (r5 critique) — survivors of the final blow render
    // as soft steel-blue silhouettes (matching the module color language,
    // r6: opaque gray busts read as untextured mannequins), casualties keep
    // the red state tint.
    proxGrey: prox(0x9fb8cc, 0.42, 0.05, 0.13),
  };
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
  g.renderOrder = 12; // nested Groups reset groupOrder — keep organs over the skin
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
    // cassette rows of standing rounds: brass case + ogive tip per round
    // (r7 critique: bare cylinders read as extruded crates, not shells) over
    // a thin rack tray
    const nx = Math.max(2, Math.min(5, Math.floor(sx / 0.24)));
    const nz = Math.max(2, Math.min(7, Math.floor(sz / 0.24)));
    const r = Math.min(0.055, (sx / nx) * 0.3, (sz / nz) * 0.3);
    const h = sy * 0.62;
    const tipH = Math.min(sy * 0.26, r * 5.5);
    const caseGeo = new THREE.CylinderGeometry(r, r, h, 8);
    const tipGeo = new THREE.CylinderGeometry(r * 0.18, r * 0.94, tipH, 8);
    disposables.push(caseGeo, tipGeo);
    const im = new THREE.InstancedMesh(caseGeo, mat, nx * nz);
    const it = new THREE.InstancedMesh(tipGeo, mat, nx * nz);
    disposables.push(im, it);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = -sx / 2 + (ix + 0.5) * (sx / nx);
        const z = -sz / 2 + (iz + 0.5) * (sz / nz);
        m4.makeTranslation(x, -sy / 2 + sy * 0.06 + h / 2, z);
        im.setMatrixAt(i, m4);
        m4.makeTranslation(x, -sy / 2 + sy * 0.06 + h + tipH / 2, z);
        it.setMatrixAt(i++, m4);
      }
    }
    g.add(im, it);
    put(new THREE.BoxGeometry(sx * 0.98, sy * 0.08, sz * 0.98), 0, -sy / 2 + sy * 0.03, 0);
  } else if (kind === 'engine') {
    // machinery read (r7 critique: flat slab stack): crankcase + narrower
    // head block, transverse cylinder-bank ribs, shrouded cooling fan and
    // twin exhaust manifolds along the flanks
    put(new THREE.BoxGeometry(sx * 0.82, sy * 0.46, sz * 0.84), 0, -sy * 0.2, 0);
    put(new THREE.BoxGeometry(sx * 0.58, sy * 0.34, sz * 0.64), 0, sy * 0.08, 0);
    for (let i = 0; i < 5; i++) {
      put(new THREE.BoxGeometry(sx * 0.66, sy * 0.42, sz * 0.05),
        0, sy * 0.1, -sz * 0.28 + i * (sz * 0.56 / 4));
    }
    const fr = Math.min(sx, sz) * 0.2;
    put(new THREE.CylinderGeometry(fr, fr, sy * 0.09, 16), -sx * 0.2, sy * 0.31, 0);
    put(new THREE.TorusGeometry(fr * 1.15, fr * 0.14, 8, 20),
      -sx * 0.2, sy * 0.31, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(sy * 0.08, sy * 0.08, sz * 0.72, 8),
      sx * 0.37, sy * 0.04, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(sy * 0.08, sy * 0.08, sz * 0.72, 8),
      -sx * 0.37, sy * 0.04, 0, Math.PI / 2, 0, 0);
  } else if (kind === 'fuelTank') {
    const r = Math.max(0.05, Math.min(sy * 0.42, sx * 0.21));
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), -sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    // filler caps + connecting manifold so the drums read as plumbing
    put(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.5, 8), -sx * 0.22, r * 1.05, 0);
    put(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.5, 8), sx * 0.22, r * 1.05, 0);
    put(new THREE.CylinderGeometry(r * 0.16, r * 0.16, sx * 0.44, 6),
      0, 0, sz * 0.28, 0, 0, Math.PI / 2);
  } else if (kind === 'gun') {
    // breech assembly behind the mantlet (r7 critique: turret interior read
    // empty): breech ring where the barrel enters, block with a sliding
    // wedge tail, gun cradle and twin recoil cylinders riding above it
    const br = Math.min(sx, sy);
    put(new THREE.BoxGeometry(sx * 0.6, sy * 0.74, sz * 0.4), 0, 0, -sz * 0.2);
    put(new THREE.BoxGeometry(sx * 0.36, sy * 0.48, sz * 0.16), 0, -sy * 0.04, -sz * 0.46);
    put(new THREE.CylinderGeometry(br * 0.28, br * 0.28, sz * 0.42, 12),
      0, 0, sz * 0.2, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(br * 0.11, br * 0.11, sz * 0.62, 8),
      sx * 0.24, sy * 0.3, sz * 0.06, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(br * 0.11, br * 0.11, sz * 0.62, 8),
      -sx * 0.24, sy * 0.3, sz * 0.06, Math.PI / 2, 0, 0);
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

/**
 * Crew proxy: soft rounded-capsule torso + head sphere. Slimmer and rounder
 * than the r6 flat-topped cylinder busts (which read as untextured gray
 * mannequins) — a quiet tinted silhouette in the same material language as
 * the module proxies.
 */
function addCrewProxy(bb, mat, poseGrp, turretGrp, disposables) {
  const sx = bb.max[0] - bb.min[0];
  const sy = bb.max[1] - bb.min[1];
  const sz = bb.max[2] - bb.min[2];
  const g = proxyGroup(bb, poseGrp, turretGrp);
  const r = Math.min(sx, sz) * 0.26;
  const headR = Math.max(0.05, Math.min(r * 0.8, sy * 0.17));
  const bodyH = sy * 0.58;
  const capR = Math.max(0.04, r * 0.9);
  const body = new THREE.CapsuleGeometry(capR, Math.max(0.02, bodyH - capR * 2), 4, 12);
  const head = new THREE.SphereGeometry(headR, 10, 8);
  disposables.push(body, head);
  const bm = new THREE.Mesh(body, mat);
  bm.position.y = -sy / 2 + bodyH / 2;
  const hm = new THREE.Mesh(head, mat);
  hm.position.y = -sy / 2 + bodyH + headR * 0.8;
  g.add(bm, hm);
}

/**
 * Hull anatomy dressing between the module boxes (r7 critique: the ghost
 * hull read as colored crates, not tank anatomy): a driveshaft spine with
 * u-joint collars running from the engine bay to the opposite hull end,
 * finished with a ribbed transmission block and final-drive stubs. Direction
 * is picked from where the engine sits (rear engine → front drive and vice
 * versa). Pure geometry in the neutral steel tint — it carries no damage
 * state and no label, so it can never contradict the sim.
 * @param {object} armor snapshot armor block (modules bbs, hull frame)
 */
function addDrivetrainProxy(armor, poseGrp, disposables) {
  const mods = armor.modules || [];
  const eng = mods.find((m) => m.module === 'engine' && !m.turretLocal);
  const trk = mods.find((m) => m.module === 'trackL') || mods.find((m) => m.module === 'trackR');
  if (!eng || !trk) return;
  const g = new THREE.Group();
  g.renderOrder = 12; // nested Groups reset groupOrder — keep organs over the skin
  poseGrp.add(g);
  const mat = S.proxSteel;
  const put = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
  };
  const ex = (eng.min[0] + eng.max[0]) / 2;
  const ey = (eng.min[1] + eng.max[1]) / 2;
  const ez = (eng.min[2] + eng.max[2]) / 2;
  const hullFwd = trk.max[2];
  const hullRear = trk.min[2];
  const rearEngine = ez < (hullFwd + hullRear) / 2;
  const face = rearEngine ? eng.max[2] : eng.min[2];   // engine face the shaft leaves
  const endZ = rearEngine
    ? hullFwd - (hullFwd - hullRear) * 0.12
    : hullRear + (hullFwd - hullRear) * 0.12;
  const len = Math.abs(endZ - face);
  if (len < 0.8) return; // engine already spans the hull — nothing to connect
  const shaftY = Math.max(trk.min[1] + 0.3, ey - (eng.max[1] - eng.min[1]) * 0.2);
  const midZ = (face + endZ) / 2;
  put(new THREE.CylinderGeometry(0.07, 0.07, len, 8), ex, shaftY, midZ, Math.PI / 2, 0, 0);
  put(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10),
    ex, shaftY, face + (rearEngine ? 0.06 : -0.06), Math.PI / 2, 0, 0);
  put(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10),
    ex, shaftY, endZ + (rearEngine ? -0.06 : 0.06), Math.PI / 2, 0, 0);
  // transmission block + rib fins + final-drive stubs out toward the sprockets
  const tw = (eng.max[0] - eng.min[0]) * 0.92;
  const th = Math.max(0.3, (eng.max[1] - eng.min[1]) * 0.58);
  const tl = Math.min(0.75, len * 0.34);
  put(new THREE.BoxGeometry(tw, th, tl), ex, shaftY + th * 0.14, endZ);
  for (let i = 0; i < 3; i++) {
    put(new THREE.BoxGeometry(tw * 1.06, th * 0.74, tl * 0.09),
      ex, shaftY + th * 0.18, endZ - tl * 0.3 + i * tl * 0.3);
  }
  put(new THREE.CylinderGeometry(th * 0.28, th * 0.28, tw * 1.5, 10),
    ex, shaftY, endZ, 0, 0, Math.PI / 2);
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
  background:radial-gradient(ellipse 52% 46% at var(--kcvx,50%) var(--kcvy,55%),
    rgba(4,8,12,0) 0%,rgba(4,8,12,0) 22%,rgba(4,8,12,.12) 48%,
    rgba(4,8,12,.26) 76%,rgba(4,8,12,.34) 100%);}
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
.cot-kc-label.ok{color:#8a97a3;border-color:rgba(138,151,163,.5);
  background:rgba(6,9,12,.6);box-shadow:none;font-weight:700;}
.cot-kc-label.ok .s{color:#7d8a96;font-weight:600;}
.cot-kc-dot{position:absolute;width:7px;height:7px;border-radius:50%;
  transform:translate(-50%,-50%);background:currentColor;box-shadow:0 0 9px currentColor;}
.cot-kc-dot.ok{background:transparent;border:1.5px solid currentColor;box-shadow:none;}
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

  // ---- LIGHT-COUNT / PROGRAM STABILITY --------------------------------------
  // three.js recompiles EVERY lit material program when the renderer's light
  // count changes, and compiles brand-new material programs on first render.
  // The r6 replay added point lights at begin()/beginXray() and hid the fx
  // group (whose 2 pooled lights left the count) — a live probe measured a
  // 6.3 s stall between begin() and the first painted kill-cam frame, pure
  // shader recompile. Fix, following the effects.js "dynamic light budget"
  // pattern: a PERMANENT pool of 3 point lights added once at creation
  // (before the first frame ever renders, so the count never changes), plus
  // a one-shot warmup rig that renders every kill-cam material for a few
  // seconds of the first battle so playback always hits the program cache.
  const kcLights = [];
  for (let i = 0; i < 3; i++) {
    const L = new THREE.PointLight(0xffffff, 0, 10, 2);
    L.castShadow = false;
    L.name = `killcamLight${i}`;
    L.position.set(0, -80, 0);
    scene.add(L);
    kcLights.push(L);
  }
  let warmRig = null;
  let warmSteps = 0;
  function buildWarmRig() {
    sharedMats();
    const g = new THREE.Group();
    g.name = 'killcamWarmup';
    g.position.set(0, -80, 0);
    const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0]), 3));
    g.userData.disposables = [box, lineGeo];
    const meshMats = [S.trailGlow, S.trailCore, S.core, S.streak, S.tail,
      S.ghost, S.pathIn, S.pathOut, S.pathCore, S.spall, S.frag, S.marker,
      S.fillRed, S.fillYellow, S.fillCrew, S.proxAmmo, S.proxEngine,
      S.proxFuel, S.proxSteel, S.proxRadio, S.proxGreen, S.proxYellow,
      S.proxRed, S.proxGrey];
    for (const m of meshMats) g.add(new THREE.Mesh(box, m));
    // instanced Lambert variant (ammo cassettes) compiles a separate program
    for (const m of [S.proxAmmo, S.proxYellow, S.proxRed]) {
      const im = new THREE.InstancedMesh(box, m, 1);
      im.setMatrixAt(0, new THREE.Matrix4());
      g.add(im);
    }
    for (const m of [S.trail, S.edgeDim, S.edgeRed, S.edgeYellow, S.edgeCrew]) {
      g.add(new THREE.Line(lineGeo, m));
    }
    g.add(new THREE.Sprite(S.halo));
    // must actually RENDER to compile — frustum-culled objects compile nothing
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  }
  warmRig = buildWarmRig();
  scene.add(warmRig);

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
  let lastBeginWallMs = 0; // onset instrumentation (dead-air audit, r6)

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
      // post-hit crew roster ({name:alive} from the sim's combat state, taken
      // AFTER damage resolved): the x-ray colors casualties from EARLIER hits
      // red too, not just the ones this shell caused.
      crewAlive: target.combat && target.combat.crew ? { ...target.combat.crew } : null,
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
      // retire the one-shot program-warmup rig once the first battle has
      // rendered it for ~1.5 s (sim stepping implies frames are flowing)
      if (warmRig && ++warmSteps > 90) {
        scene.remove(warmRig);
        for (const gm of warmRig.userData.disposables) gm.dispose();
        warmRig = null;
      }
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

    /**
     * Wall-clock timestamp (performance.now()) of the last begin() — lets
     * probes measure dead air between game.result being set and the replay
     * owning the screen (r6: headless fastForward starved RAF and faked a
     * 4.9 s onset; live runs must start the same frame).
     */
    get lastBeginWallMs() { return lastBeginWallMs; },
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
    lastBeginWallMs = performance.now();
    pb = {
      snap, kind, onDone,
      phase: 'flight', t: 0, xt: 0,
      group: new THREE.Group(),
      disposables: [],
      ghostBackup: null,
      labels: [],
      pts: null, cum: null, total: 0, dur: 0, segIdx: 0,
      core: null, streak: null, trailGeo: null,
      halo: null, tail: null, shellLight: null, muzzleLight: null,
      xcam: null,
      fxGroup: null, fxHidden: null,
      vegGroup: null, vegWasVisible: true,
    };
    pb.group.name = 'killcam';
    scene.add(pb.group);

    // Suppress live battle FX for the whole replay: the victim's death
    // fireball/smoke rendered ON TOP of the x-ray ghost, and the dying
    // shell's neon tracer afterglow cut a bloomed beam across the frame
    // (r2 critique). Hide the fx group's CHILDREN, not the group: its 2
    // pooled PointLights must stay in the renderer's light count or every
    // lit material recompiles at replay start (the 6.3 s first-frame stall,
    // see LIGHT-COUNT note). Restored in finish() so the death-cam wreck
    // smoke resumes afterwards.
    pb.fxGroup = scene.getObjectByName('fx') || null;
    pb.fxHidden = null;
    if (pb.fxGroup) {
      pb.fxHidden = [];
      for (const child of pb.fxGroup.children) {
        if (child.isLight || !child.visible) continue;
        child.visible = false;
        pb.fxHidden.push(child);
      }
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
    // roll / nominal: the rolled pen alone (e.g. 986 mm vs a 63 mm plate)
    // reads as a bug without the ±25%-roll baseline it came from
    const penNom = nominalPenFor(ev);
    kv('Pen roll', (ev.penRollMm || 0) > 0
      ? `${Math.round(ev.penRollMm)}${penNom > 0 ? ` / ${penNom}` : ''} mm` : '—');
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

    // Key light on the victim for the WHOLE replay (hoisted out of the x-ray
    // phase, r6: during flight the chased tank sat at frame center as a pure
    // unlit black silhouette). Cool camera-side fill; the fresnel skin is
    // self-lit but the internal proxies (Lambert) and the ground pool under
    // the hull need it, and in flight it lifts the victim out of silhouette.
    // All replay lights come from the PERMANENT kcLights pool (never
    // added/removed — see LIGHT-COUNT note), only retuned here.
    {
      const pose = snap.pose;
      const R = Math.max(9, snap.boundingRadiusM * 3.4);
      const fill = kcLights[0];
      fill.color.setHex(0xdfeaf4);
      fill.intensity = 55;
      fill.distance = R * 4.5;
      fill.position.set(
        pose.pos[0] + (pb.xcam.pos.x - pose.pos[0]) * 0.4,
        pose.pos[1] + snap.heightM * 2.6,
        pose.pos[2] + (pb.xcam.pos.z - pose.pos[2]) * 0.4,
      );
    }

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
        // Flight dressing (r6: 'white ball on an orange stick'):
        //  - halo sprite — soft canvas-gradient glow, reads as tracer bloom
        //    without touching the post chain's bloom threshold
        //  - tail cone — velocity-stretched additive glow trailing the core
        //    (base at the shell, apex ~13 m behind), motion-stretch read
        //  - shell light — warm point light dragged with the tracer so it
        //    actually illuminates terrain/fences/vehicles it passes (WT-style)
        //  - muzzle light — brief cool fill at the shooter so the firing tank
        //    is not a second black silhouette at the start of the chase
        pb.halo = new THREE.Sprite(S.halo);
        pb.halo.scale.set(3.1, 3.1, 1);
        S.halo.opacity = 0.95; // shared mats: undo any axis fade left behind
        S.tail.opacity = 0.17;
        const tailGeo = new THREE.ConeGeometry(0.42, 13, 10, 1, true);
        pb.disposables.push(tailGeo);
        pb.tail = new THREE.Mesh(tailGeo, S.tail);
        pb.group.add(pb.halo, pb.tail);
        // Soft LOCAL pool only: at 120 int / 60 m the ground track lit a
        // long orange carpet across the grass that read as a decal/god-ray
        // (r7 critique) — the tracer core + halo carry the brightness, the
        // light just kisses nearby terrain/fences as the shell passes.
        pb.shellLight = kcLights[1];
        pb.shellLight.color.setHex(0xffc48a);
        pb.shellLight.intensity = 48;
        pb.shellLight.distance = 30;
        pb.muzzleLight = kcLights[2];
        pb.muzzleLight.color.setHex(0xe8f0fa);
        pb.muzzleLight.intensity = 70;
        pb.muzzleLight.distance = 55;
        pb.muzzleLight.position.set(pts[0].x, pts[0].y + 2.5, pts[0].z);
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
    // glow dressing rides the core: halo on it, tail cone stretched back
    // along the velocity (ConeGeometry apex = +Y -> point it at -_d), warm
    // light slightly above the shell so the ground track picks it up
    pb.halo.position.copy(_p);
    pb.tail.position.copy(_p).addScaledVector(_d, -6.4);
    pb.tail.quaternion.setFromUnitVectors(_Y, _s.copy(_d).negate());
    pb.shellLight.position.set(_p.x, _p.y + 0.5, _p.z);
    pb.muzzleLight.intensity = 70 * Math.max(0, 1 - u * 2.2); // fades early

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
    // axis-aligned view fade: within ~25° of the trajectory axis the 13 m
    // tail cone stops reading as a tracer and sweeps a wide orange sheet
    // across the ground (r7 critique — the chase cam itself sits ~13° off
    // axis, so the ribbon showed in every flight frame). The tail is a
    // SIDE-view garnish: it dies entirely near the axis while the halo keeps
    // a floor so the shell stays a glowing ball, and the trail polyline
    // keeps the path a LINE. |dot| covers chasing and head-on alike.
    if (pb.halo) {
      const align = Math.abs(_s.copy(_p).sub(_a).normalize().dot(_d));
      const f = 1 - THREE.MathUtils.smoothstep(align, 0.9, 0.972);
      S.halo.opacity = 0.95 * (0.35 + 0.65 * f);
      S.tail.opacity = 0.17 * f;
      pb.shellLight.intensity = 48 * (0.3 + 0.7 * f);
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
    // Orbit radius tightened ~30% from r5's 2.7×: the victim occupied only a
    // quarter of a mostly-empty frame — WT frames the wreck at 40-60% of
    // frame height. Labels still deconflict at this framing (projectLabels).
    const R = Math.max(6.2, snap.boundingRadiusM * 1.9);
    // ~24° three-quarter elevation: the old R*0.68 vantage read near
    // top-down — the struck hull side was invisible and the silhouette
    // unreadable (r3 critique). Tall grass no longer constrains the
    // sightline: the vegetation layer is hidden for the whole x-ray hold.
    // The camera backs off along the shell path (-0.52) so the penetrated
    // face always faces the lens.
    const off = new THREE.Vector3()
      .addScaledVector(_s, R * 0.88)
      .addScaledVector(dirW, -R * 0.52);
    off.y += R * 0.44;
    const pos = center.clone().add(off);
    if (heightField) {
      const minY = heightField.getHeightAt(pos.x, pos.z) + 1.0;
      if (pos.y < minY) pos.y = minY;
    }
    // look point raised ~6° above hull center: tilts the frame up so the
    // horizon/sky band stays visible at the top instead of an all-ground void
    const xcam = { center, off, pos, look: center.clone().setY(center.y + R * 0.12) };
    fitXrayFrame(snap, xcam);
    return xcam;
  }

  /**
   * Screen-fit solve for the x-ray vantage (r7 critique: the live Abrams
   * x-ray cut the hull off the bottom/right frame edges). The fixed R×1.9
   * orbit radius has no idea how the hull's LONG diagonal projects when the
   * shell path runs nearly along the hull axis, and the terrain clamp can
   * shove the camera up after the framing was chosen. Projects the victim's
   * world bounding box through a scratch camera at the exact poses
   * updateXray() will use — both ends of the orbit drift — then iterates
   * orbit radius (distance) and look height (pitch) until every hull corner
   * sits inside the ~80% safe area with its midline near frame center.
   * Mutates xcam.off / xcam.pos / xcam.look in place; center is untouched
   * (the veil + ghost-shader uniforms key off it).
   */
  function fitXrayFrame(snap, xcam) {
    // Victim bbox from SNAPSHOT pose + spec dims — deliberately not
    // Box3.setFromObject(visual.root): the live visual carries helper nodes
    // (fx anchors, hidden LOD shells) that inflate the box and shoved the
    // solve into a wide empty frame on the staged probe. The oriented hull
    // box (yaw only — pitch/roll are degrees at rest) is what must read.
    const pose = snap.pose;
    let hw;
    let hl;
    try {
      const dims = snap.targetEnt.spec.dims;
      hw = dims.widthM * 0.5 + 0.2;
      // HULL length, not overall: the gun barrel may leave the frame (WT
      // crops barrels too) — fitting the barrel-inclusive box backed the
      // camera off the r5-approved staged framing for nothing
      hl = (dims.hullLengthM || dims.overallLengthM * 0.8) * 0.55;
    } catch (_) {
      hw = hl = Math.max(2, snap.boundingRadiusM || 4);
    }
    const hh = Math.max(1.5, snap.heightM || 2.4) + 0.25;
    const cy = Math.cos(pose.yaw);
    const sy = Math.sin(pose.yaw);
    const corners = [];
    for (let i = 0; i < 8; i++) {
      const lx = i & 1 ? hw : -hw;
      const ly = i & 2 ? hh : 0;
      const lz = i & 4 ? hl : -hl;
      corners.push(new THREE.Vector3(
        pose.pos[0] + lx * cy + lz * sy,
        pose.pos[1] + ly,
        pose.pos[2] - lx * sy + lz * cy,
      ));
    }
    _fitCam.fov = 42; // matches every rig.setExternalPose fov of the hold
    _fitCam.aspect = camera.aspect;
    _fitCam.updateProjectionMatrix();
    const SAFE = 0.8;                          // corners kept inside ±0.8 NDC
    const endAng = ORBIT_RAD_S * XRAY_HOLD_S;  // full drift of the hold
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(21));
    let scale = 1;
    for (let iter = 0; iter < 12; iter++) {
      let worst = 0;
      let midY = 0;
      for (const ang of [0, endAng]) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        _a.set(
          xcam.center.x + (xcam.off.x * ca + xcam.off.z * sa) * scale,
          xcam.center.y + xcam.off.y * scale,
          xcam.center.z + (-xcam.off.x * sa + xcam.off.z * ca) * scale,
        );
        if (heightField) {
          const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
          if (_a.y < minY) _a.y = minY;
        }
        _fitCam.position.copy(_a);
        _fitCam.lookAt(xcam.look);
        _fitCam.updateMatrixWorld(true);
        let lo = Infinity;
        let hi = -Infinity;
        for (const c of corners) {
          _proj.copy(c).project(_fitCam);
          worst = Math.max(worst, Math.abs(_proj.x), Math.abs(_proj.y));
          lo = Math.min(lo, _proj.y);
          hi = Math.max(hi, _proj.y);
        }
        if (ang === 0) midY = (lo + hi) / 2;
      }
      const centered = Math.abs(midY) <= 0.3;
      if (worst <= SAFE && worst >= SAFE * 0.72 && centered) break;
      if (worst <= SAFE && centered && scale <= 1) break; // artistic vantage already fits
      // pitch: steer the look height so the hull's projected midline sits
      // near frame center — a terrain-raised camera otherwise dumps the
      // hull off the bottom edge however far the orbit backs off
      if (!centered) {
        xcam.look.y += THREE.MathUtils.clamp(midY, -0.5, 0.5)
          * tanHalf * xcam.off.length() * scale;
      }
      // distance: track worst -> SAFE in BOTH directions (never closer than
      // the artistic default) — a grow-only step ratcheted on early
      // iterations while the pitch was still settling and locked the staged
      // Tiger into a wide empty frame
      scale = Math.max(1, scale * THREE.MathUtils.clamp(worst / SAFE, 0.72, 1.6));
    }
    if (scale !== 1) xcam.off.multiplyScalar(scale);
    xcam.pos.copy(xcam.center).add(xcam.off);
    if (heightField) {
      const minY = heightField.getHeightAt(xcam.pos.x, xcam.pos.z) + 1.0;
      if (xcam.pos.y < minY) xcam.pos.y = minY;
    }
  }

  function beginXray() {
    if (pb.phase === 'xray') return;
    pb.phase = 'xray';
    pb.xt = 0;
    // retire the flight tracer + its glow dressing (keep the trail arcing
    // into the tank; the victim fill light stays for the hold). Pool lights
    // are only DIMMED, never removed — removal changes the light count and
    // recompiles every lit material mid-replay (LIGHT-COUNT note).
    if (pb.core) {
      pb.group.remove(pb.core, pb.streak, pb.halo, pb.tail);
      pb.shellLight.intensity = 0;
      pb.muzzleLight.intensity = 0;
      pb.core = pb.streak = pb.halo = pb.tail = pb.shellLight = pb.muzzleLight = null;
    }
    // Cap the visible trail to the final ~60 m of arc: the full muzzle-to-hull
    // polyline read as a beam lasering across the whole map during the hold.
    if (pb.trailGeo && pb.cum && pb.pts) {
      let start = 0;
      const keepFrom = pb.total - 60;
      while (start < pb.pts.length - 2 && pb.cum[start + 1] < keepFrom) start++;
      pb.trailGeo.setDrawRange(start, pb.pts.length - start);
      // Rebuild that final arc as a glow ribbon (wide additive sheath + hot
      // core tube per segment): the 1px GL line alone was a dim tan thread
      // at 1080p (r5 critique). A handful of segments — ~60 m of 60 Hz sim
      // points — so the cost is a few dozen cylinders for the hold.
      for (let i = start; i < pb.pts.length - 1; i++) {
        tube(pb.pts[i], pb.pts[i + 1], 0.085, S.trailGlow, pb.group, pb.disposables);
        tube(pb.pts[i], pb.pts[i + 1], 0.03, S.trailCore, pb.group, pb.disposables);
      }
    }

    const snap = pb.snap;
    const ev = snap.ev;
    const armor = snap.armor;
    const pose = snap.pose;

    // 1. ghost-translucent victim — fresnel skin (see sharedMats).
    const vis = snap.targetEnt.visual;
    vis.setVisible(true); // player may have died while scoped (hull hidden)
    pb.ghostBackup = [];
    // Ghost EVERY mesh, including currently-hidden LOD detail levels: the
    // x-ray camera sits close enough to flip LODs mid-hold, and a skipped
    // mesh would pop in with its original dark non-additive material and
    // read as a black hole in the hull. Skin renders at renderOrder 11;
    // everything the kill-cam adds (pb.group: proxies, boxes, shell path,
    // labels' anchor dots) renders AFTER it at groupOrder 12, so the organs
    // stay crisp whatever the local skin density.
    vis.root.traverse((o) => {
      if (o.isMesh) {
        pb.ghostBackup.push([o, o.material, o.renderOrder, o.castShadow]);
        o.material = S.ghost;
        o.renderOrder = 11;
        // the hull's own cast shadow otherwise sits directly beneath the
        // translucent skin and reads THROUGH it as a black tank-shaped void
        // (live Abrams probe) — WT floats the x-ray wreck on lit ground
        o.castShadow = false;
      }
    });
    pb.group.renderOrder = 12; // internals over the skin (groupOrder sort)
    // feed the ghost shader's depth grading this victim's bounding sphere
    S.ghostCenter.value.copy(pb.xcam.center);
    S.ghostRad.value = Math.max(2, snap.boundingRadiusM || 4);

    // 1a. isolate the vehicle for the hold (WT x-ray read): sunlit grass
    // blades under/behind the hull otherwise show straight through the
    // translucent ghost as bright speckle noise. The vegetation layer comes
    // back in finish() for the death cam / next battle.
    pb.vegGroup = scene.getObjectByName('vegetation') || null;
    if (pb.vegGroup) {
      pb.vegWasVisible = pb.vegGroup.visible;
      pb.vegGroup.visible = false;
    }

    // 1b. key light on the wreck: created in begin() for the whole replay
    // (flight included) — cool camera-side fill so the vehicle stays the
    // brightest element in frame; the world-space blackout billboard is GONE
    // (r4: read as a lighting bug). Scene focus comes only from the
    // screen-space DOM veil, centered on the victim in projectLabels().

    // 2. snapshot-posed frame groups (hull + turret), no live-state reads
    const poseGrp = new THREE.Group();
    poseGrp.renderOrder = 12;   // nested Groups reset groupOrder (see above)
    poseGrp.rotation.order = 'YXZ';
    poseGrp.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    poseGrp.rotation.set(-pose.pitch, pose.yaw, pose.roll);
    const turretGrp = new THREE.Group();
    turretGrp.renderOrder = 12;
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
    // hull anatomy between the boxes: driveshaft spine + transmission block
    addDrivetrainProxy(armor, poseGrp, pb.disposables);
    // Crew state honesty (r5: a corpse tank showed a thriving bright-green
    // crew): red for casualties — this shell's crewHit plus anyone already
    // dead in the snapshot's post-hit combat roster — and neutral grey for
    // survivors when the vehicle is a corpse (every replay this camera plays
    // ends in a destruction; healthy green is reserved for live crew on a
    // still-fighting tank).
    const corpse = !!ev.destroyed || pb.kind === 'death' || pb.kind === 'victory';
    const crewAlive = snap.crewAlive || null;
    for (const cb of armor.crew || []) {
      const down = crewHit.has(cb.crew) || (crewAlive && crewAlive[cb.crew] === false);
      addCrewProxy(cb, down ? S.proxRed : corpse ? S.proxGrey : S.proxGreen,
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
      // external approach: wide glow sheath + hot core so the last meters
      // into the plate read as one continuous channel with the ribbon above
      _a.copy(lp).addScaledVector(ld, -4.5);
      tube(_a, lp, 0.06, S.trailGlow, poseGrp, pb.disposables);
      tube(_a, lp, 0.026, S.pathOut, poseGrp, pb.disposables);
      // internal penetration channel, carried to the deepest damaged module
      // (r5: the path dead-ended at the entry dot; thickened + brightened so
      // it stays legible over the frosted skin)
      _b.copy(lp).addScaledVector(ld, innerLen);
      tube(lp, _b, 0.11, S.pathIn, poseGrp, pb.disposables);   // hot sheath
      tube(lp, _b, 0.045, S.pathCore, poseGrp, pb.disposables); // white-hot core
      // terminal glow where the channel stops (the deepest component hit)
      const endGeo = new THREE.SphereGeometry(0.09, 10, 8);
      pb.disposables.push(endGeo);
      const endDot = new THREE.Mesh(endGeo, S.pathCore);
      endDot.position.copy(_b);
      poseGrp.add(endDot);
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
      for (let i = 0; i < 10; i++) {
        const az = (i / 10) * Math.PI * 2 + 0.45;
        const spread = 0.13 + 0.11 * (((i * 37) % 5) / 4);
        const len = innerLen * (0.35 + 0.5 * (((i * 53) % 7) / 6));
        _a.copy(ld)
          .addScaledVector(side, Math.cos(az) * spread)
          .addScaledVector(norm, Math.sin(az) * spread)
          .normalize();
        _b.copy(lp).addScaledVector(_a, len);
        tube(lp, _b, 0.02, S.frag, poseGrp, pb.disposables);
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
    const addLabel = (world, color, main, sub, big, ok) => {
      // ok = the hit left the module functional: the chip is demoted to the
      // dim-gray tier (hollow ring dot, faint leader) so only yellow/red
      // chips carry casualty weight — an 'ok' TRACK R / HIT chip in full
      // white read as a loss at a glance (r4 critique).
      const label = el('div', big ? 'cot-kc-dmg' : `cot-kc-label${ok ? ' ok' : ''}`, d.labelHost);
      let dot = null;
      let line = null;
      if (!big) {
        label.style.color = color;
        label.innerHTML = `${main}<span class="s">${sub}</span>`;
        dot = el('div', `cot-kc-dot${ok ? ' ok' : ''}`, d.labelHost);
        dot.style.color = color;
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', ok ? '0.45' : '0.85');
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
    const MOD_STATE_COLOR = { red: '#ff5a4a', yellow: '#ffb43c', ok: '#8a97a3' };
    for (const m of ev.modulesHit) {
      const seg = anchors.get(`m:${m.module}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      // honest damage number: only the sim's rolled value, never the caliber
      const dmgTxt = Number.isFinite(m.dmg) ? ` −${Math.round(m.dmg)}` : '';
      const ok = m.newState !== 'red' && m.newState !== 'yellow';
      addLabel(_p, MOD_STATE_COLOR[m.newState] || MOD_STATE_COLOR.ok,
        MODULE_LABEL[m.module] || m.module,
        `${MOD_STATE_WORD[m.newState] || 'HIT'}${dmgTxt}`, false, ok);
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
    // screen-space focus veil: keep the radial dim centered on the VICTIM's
    // projected position every frame (a world-space blackout read as a
    // lighting bug — bright road stripe over crushed edges, r4 critique)
    if (dom && pb.xcam) {
      _proj.copy(pb.xcam.center).project(camera);
      dom.root.style.setProperty('--kcvx', `${((_proj.x * 0.5 + 0.5) * 100).toFixed(1)}%`);
      dom.root.style.setProperty('--kcvy', `${((-_proj.y * 0.5 + 0.5) * 100).toFixed(1)}%`);
    }
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
    // the later chip below the earlier one with a 4px gap. Anchor DOTS join
    // as immovable obstacles so the big damage numeral can never sit on a
    // module's leader-dot cluster (r7: −519 HP muddied TRACK R's dot right
    // at the penetration point); a second sweep settles cascades that land
    // a chip on a dot further down.
    const items = [];
    for (const it of pb.labels) {
      if (it.hidden) continue;
      items.push(it);
      if (it.dot) items.push({ left: it.ax - 6, top: it.ay - 6, lw: 12, lh: 12, fixed: true });
    }
    items.sort((a, b) => a.top - b.top);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (a.fixed) continue;
      for (let sweep = 0; sweep < 2; sweep++) {
        for (let j = 0; j < items.length; j++) {
          if (j === i) continue;
          const b = items[j];
          if (!b.fixed && j > i) continue; // later movables resolve on their own turn
          if (a.left < b.left + b.lw + 6 && b.left < a.left + a.lw + 6 &&
              a.top < b.top + b.lh + 4 && b.top < a.top + a.lh + 4) {
            a.top = b.top + b.lh + 4;
          }
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
    rig.setExternalPose(_a, pb.xcam.look, 42);
    projectLabels();
    if (pb.xt >= XRAY_HOLD_S) finish(true);
  }

  function finish(runCallback) {
    if (!active) return;
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('mousedown', onSkipKey, true);
    if (pb) {
      if (pb.ghostBackup) {
        for (const [mesh, mat, ro, cs] of pb.ghostBackup) {
          mesh.material = mat;
          mesh.renderOrder = ro || 0;
          mesh.castShadow = !!cs;
        }
      }
      if (pb.fxHidden) for (const c of pb.fxHidden) c.visible = true; // FX resume
      if (pb.vegGroup) pb.vegGroup.visible = pb.vegWasVisible; // vegetation back
      for (const L of kcLights) L.intensity = 0; // pool dimmed, never removed
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
