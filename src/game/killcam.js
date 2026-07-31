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
 *      fuel drums, crew capsules) tinted WHITE/yellow/red by post-hit state
 *      (WT convention — identity lives in shapes + chips, never the tint),
 *      the shell path drawn through the hull all the way to the deepest
 *      damaged component with a spall cone at the penetration point plus
 *      causal fragment streaks to every damaged module/crew slot, every
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
import { MODULE_LABEL, CREW_LABEL } from '../ui/moduleRegistry.js';
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

// MODULE_LABEL / CREW_LABEL come from ui/moduleRegistry.js (single source).

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
  // r8 per-band opacity shaping (critic: 'decapitated' ghosts + hot tracks).
  // World-space y of the victim's turret-ring plane and running-gear top
  // line, written per x-ray in beginXray(). Defaults are inert (no boost,
  // no dim) so the warmup rig and any pre-x-ray render stay unchanged.
  const ghostRingY = { value: 1e7 };
  const ghostGearY = { value: -1e7 };
  ghost.onBeforeCompile = (sh) => {
    sh.uniforms.kcCenter = ghostCenter;
    sh.uniforms.kcRad = ghostRad;
    sh.uniforms.kcRingY = ghostRingY;
    sh.uniforms.kcGearY = ghostGearY;
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
      `varying vec3 vKcW;\nvarying vec3 vKcN;\nuniform vec3 kcCenter;\nuniform float kcRad;\nuniform float kcRingY;\nuniform float kcGearY;\n${sh.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      {
        vec3 kcV = normalize(cameraPosition - vKcW);
        // Degenerate-normal guard FIRST (r3): the performance-budget kit
        // merge ships GLB hull meshes WITHOUT a normal attribute (m1a2/t90m
        // audit: 4 merged meshes each) — the attribute defaults to (0,0,0),
        // normalize() NaNs, and NaN alpha painted the whole live-Abrams
        // ghost as a solid black silhouette. Zero-length normals fall back
        // to a soft face-on read instead of exploding.
        float kcNL = length(vKcN);
        vec3 kcN = kcNL > 1e-5 ? vKcN / kcNL : kcV;
        // clamped: |dot| of two unit vectors can exceed 1.0 by float error
        // (guaranteed when kcN == kcV), kcF goes -1e-7, and pow(negative,
        // 2.2) is NaN in GLSL — that NaN painted the merged kit meshes as
        // per-pixel black stipple
        float kcF = clamp(1.0 - abs(dot(kcN, kcV)), 0.0, 1.0);
        // Depth-graded fresnel (WT x-ray read): faces on the CAMERA side of
        // the hull sit dim, far-side faces brighten — the skin reads as a
        // volume with a lit back wall instead of a flat slab. kcT is the
        // fragment's normalized depth through the victim's bounding sphere.
        float kcNear = distance(cameraPosition, kcCenter) - kcRad;
        float kcT = clamp((distance(cameraPosition, vKcW) - kcNear)
          / max(kcRad * 2.0, 0.001), 0.0, 1.0);
        // r3 fidelity rework (the live GLB Abrams read as a near-turretless
        // slab): GLB victims are ONE smooth-normal mesh, so the old single
        // pow(kcF,2.6) term lit only a hair-thin band while every face-on
        // panel sat at the 0.06 floor — invisible over sunlit grass. The
        // multi-part procedural Tiger only read because 8-12 hull layers
        // alpha-stacked. Three terms make density mesh-count-INDEPENDENT:
        //   - plate shading: a top-lit structural tone (kcTop) so roof /
        //     side / glacis separate as distinct frost densities and the
        //     turret mass reads as a VOLUME, not a veil;
        //   - wide body fresnel (pow 2.2) for the soft WT frost falloff;
        //   - a TIGHT bright rim (pow 7) — the crisp luminous silhouette
        //     line WT draws around hull, turret and gun. Alpha carries the
        //     rim (NormalBlending saturates toward the skin color and can
        //     never bloom); rgb stays <=1.0 for the post chain.
        float kcRimW = pow(kcF, 2.2);
        float kcRimT = pow(kcF, 7.0);
        float kcTop = kcNL > 1e-5 ? clamp(kcN.y * 0.5 + 0.5, 0.0, 1.0) : 0.6;
        // r8 per-band shaping (critic: both the Tiger and the live Abrams
        // read as DECAPITATED hulls while the track runs burned hot cyan).
        // Density here is layer-count-driven: an 8-12 layer procedural hull
        // stack saturates while the 1-2 shell turret sits at the face-on
        // floor (~0.08 alpha) and vanishes over the dimmed backdrop; track
        // runs stack the MOST layers (links + wheels + band + skirt) and
        // blow out. Two world-y bands fix both ends without any per-mesh
        // naming assumptions: fragments above the victim's turret-ring
        // plane (kcRingY) get a flat opacity floor so a single-shell turret
        // matches hull density, and fragments below the running-gear top
        // line (kcGearY) are dimmed so stacked links stop reading as slabs.
        // beginXray() writes both planes from the SNAPSHOT armor spec.
        float kcTur = smoothstep(kcRingY - 0.25, kcRingY + 0.3, vKcW.y);
        float kcGear = 1.0 - smoothstep(kcGearY - 0.05, kcGearY + 0.28, vKcW.y);
        diffuseColor.a *= (0.075 + 0.235 * kcTur + 0.10 * kcTop + 0.16 * kcRimW + 0.52 * kcRimT)
          * mix(0.68, 1.22, kcT) * mix(1.0, 0.4, kcGear);
        diffuseColor.rgb *= 0.52 + 0.10 * kcTur + 0.13 * kcTop + 0.09 * kcRimW + 0.26 * kcRimT;
      }`);
  };
  S = {
    ghost, ghostCenter, ghostRad, ghostRingY, ghostGearY,
    // Trail intensity is deliberately sub-bloom: additive 1px line at full
    // 0xffb060 pushed the HDR buffer over the bloom threshold and smeared
    // into a screen-wide beam (r2 critique). Halved color × lower alpha keeps
    // the path readable without ever blooming.
    trail: line(0x7d5830, 0.5),
    // x-ray approach ribbon (glow sheath + hot core tubes over the final
    // trail arc): the bare 1px GL line read as a laser-pointer thread at
    // 1080p (r5 critique). Colors stay ≤1 so the ribbon never blooms.
    // r2: split into near/far tiers — the uniform 60 m beam read as a
    // pass-through laser with no directionality (r2 critique); the far tail
    // is thin and faint, ramping into the bright near segment at the plate.
    trailGlow: mesh(0xcf9a4e, 0.22),
    trailCore: mesh(0xffd9a0, 0.7),
    trailGlowFar: mesh(0xcf9a4e, 0.09),
    trailCoreFar: mesh(0xffd9a0, 0.3),
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
    // causal fragment tiers (r3): streaks from the pen point to each module /
    // crew slot the sim payload damaged — brightness follows the post-hit
    // state so a detonated rack reads hotter than a nicked engine.
    fragRed: nmesh(0xff5a40, 0.92),
    fragYellow: nmesh(0xffc46a, 0.7),
    fragCrew: nmesh(0xff8a96, 0.8),
    marker: nmesh(0xffffff, 0.95),
    core: mesh(0xfff3d0, 1.0),
    streak: mesh(0xffb464, 0.85),
    // Internal proxies, STATE-coded (r3 — WT convention: white intact,
    // yellow damaged, red destroyed). The r2 identity hues (brass ammo, teal
    // engine, amber fuel) read as damage states to genre-literate players —
    // an amber fuel cell implied a hit the sim never resolved. Identity now
    // lives in the shapes + label chips only.
    proxIntact: prox(0xd8e4ee, 0.78, 0.1, 0.3),
    // r8: steel accent darkened (0x9fb4c4/es .28 sat within ~15% of the
    // intact tint — fins/straps/fan alpha-mushed into the main mass and the
    // organs read as 'tan loaf-boxes and plain crates', critic) so the
    // mechanical detail separates as a distinct darker metal.
    proxSteel: prox(0x7e94a8, 0.74, 0.07, 0.17),
    proxGreen: prox(0x2fd98c, 0.8, 0.1, 0.34),
    proxYellow: prox(0xffb43c, 0.88, 0.12, 0.44),
    proxRed: prox(0xff4a38, 0.92, 0.13, 0.52),
    // neutral crew slump tint: a destroyed tank must not show a thriving
    // bright-green crew (r5 critique) — survivors of the final blow render
    // as soft steel-blue silhouettes (matching the module color language,
    // r6: opaque gray busts read as untextured mannequins), casualties keep
    // the red state tint. r2: 0.42 -> 0.58 opacity + brighter emissive —
    // grey figures vanished entirely over a dense (bright) skin stack on the
    // live Abrams death frame ("no crew figures render").
    proxGrey: prox(0x9fb8cc, 0.58, 0.06, 0.2),
  };
  // vertex-color fades (r5): the flight tail cone dies toward its far end and
  // the x-ray trail polyline fades where it enters frame — additive blending
  // multiplies by vertex color, so a black vertex is simply invisible.
  // Geometries without a color attribute read the WebGL default (0,0,0) and
  // render nothing, which only ever affects the off-screen warmup rig.
  S.tail.vertexColors = true;
  S.trail.vertexColors = true;
  return S;
}

/**
 * Proxy material for a module's POST-HIT state (r3 — WT color language:
 * white intact / yellow damaged / red destroyed). Identity comes from the
 * proxy shapes and the label chips, never from the tint — an amber "fuel
 * hue" on an untouched tank read as damage the sim never resolved.
 */
function proxMatForState(state) {
  return state === 'red' ? S.proxRed
    : state === 'yellow' ? S.proxYellow
      : S.proxIntact;
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
 * War Thunder-style recognizable internals: ammo stowage, ribbed engine
 * block, fuel storage, breech, ring, periscope — tinted by post-hit state.
 * The ammo/fuel kit is selected per spec layout + era (r2 minor: an Abrams
 * showed a WWII open tray of vertical brass amidships and external-style
 * fuel drums — WT models per-vehicle stowage):
 *   - turret-local ammoRack           -> bustle racks behind a blast door
 *   - hull ammoRack on a modern spec  -> autoloader carousel ring
 *   - hull ammoRack, WWII             -> open tray of standing rounds
 *   - fuelTank on a modern spec       -> baffled internal fuel cell
 * @param {{module:string,min:number[],max:number[],turretLocal:boolean}} bb
 * @param {THREE.Material} mat state-tinted proxy material
 * @param {string} era spec.era of the victim ('modern' selects modern kits)
 * @param {number} calMm victim's own gun caliber — ammo rounds are scaled to
 *   it (r6: fixed-cap cassette shells read a fidelity notch under WT; a
 *   caliber-true radius with counts derived from the free run keeps an 88 mm
 *   Tiger tray slim and a 125 mm carousel dense). 0 keeps legacy caps.
 */
function addModuleProxy(bb, mat, poseGrp, turretGrp, disposables, era, calMm) {
  const kind = bb.module;
  if (kind === 'trackL' || kind === 'trackR') return; // real track geometry reads already
  const modern = era === 'modern';
  // caliber-true CASE radius (case sits ~8% over the projectile diameter)
  const rCal = calMm > 0 ? (calMm / 2000) * 1.08 : 0;
  const sx = bb.max[0] - bb.min[0];
  const sy = bb.max[1] - bb.min[1];
  const sz = bb.max[2] - bb.min[2];
  const g = proxyGroup(bb, poseGrp, turretGrp);
  // Optional material override (r5): mechanical accents (fins, fan shroud,
  // exhaust runs, straps) render in the neutral steel tint so the shapes
  // separate inside the ghost — a single tint alpha-mushed multi-part organs
  // into one slab. The state color still owns each module's main mass, so
  // the WT white/yellow/red language is untouched.
  const put = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, m2 = mat) => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, m2);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  /** Instanced case+tip round set from a placement list [{x,y,z,rx}]. */
  const rounds = (r, caseH, tipH, list, tilt = 0) => {
    const caseGeo = new THREE.CylinderGeometry(r, r, caseH, 8);
    const tipGeo = new THREE.CylinderGeometry(r * 0.18, r * 0.94, tipH, 8);
    disposables.push(caseGeo, tipGeo);
    const im = new THREE.InstancedMesh(caseGeo, mat, list.length);
    const it = new THREE.InstancedMesh(tipGeo, mat, list.length);
    disposables.push(im, it);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const off = new THREE.Vector3();
    list.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, tilt));
      off.set(0, (caseH + tipH) / 2, 0).applyQuaternion(q);
      m4.compose(v.set(p.x, p.y, p.z), q, s);
      im.setMatrixAt(i, m4);
      m4.compose(v.set(p.x + off.x, p.y + off.y, p.z + off.z), q, s);
      it.setMatrixAt(i, m4);
    });
    g.add(im, it);
  };
  if (kind === 'ammoRack' && bb.turretLocal) {
    // modern bustle stowage (Abrams/Leo lineage): horizontal rounds racked
    // nose-forward in layered rows, sealed off by a blast-door bulkhead at
    // the fighting-compartment face of the box. Row/column counts derive
    // from the caliber-true round size (r6) so the rack reads dense + slim.
    const rT = rCal > 0 ? rCal : 0.05;
    const nx = Math.max(2, Math.min(8, Math.floor(sx / Math.max(0.13, rT * 2.7))));
    const ny = Math.max(1, Math.min(3, Math.floor(sy / Math.max(0.15, rT * 3.1))));
    const r = Math.min(rT, (sx / nx) * 0.36, (sy / ny) * 0.36);
    const caseH = sz * 0.52;
    const tipH = Math.min(sz * 0.2, r * 5.5);
    const list = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        list.push({
          x: -sx / 2 + (ix + 0.5) * (sx / nx),
          y: -sy / 2 + (iy + 0.5) * (sy / ny),
          z: -sz * 0.08,
          rx: Math.PI / 2, // cylinder +Y -> +Z: rounds lie nose-forward
        });
      }
    }
    rounds(r, caseH, tipH, list);
    // rack shelves between the layers + the blast-door bulkhead + steel
    // side-cheek plates (r8: the charge tubes read loose without the rack
    // frame holding them)
    for (let iy = 1; iy < ny; iy++) {
      put(new THREE.BoxGeometry(sx * 0.96, sy * 0.03, sz * 0.7),
        0, -sy / 2 + iy * (sy / ny), -sz * 0.08);
    }
    put(new THREE.BoxGeometry(sx * 0.96, sy * 0.94, 0.05), 0, 0, sz / 2 - 0.03);
    for (const xf of [-1, 1]) {
      put(new THREE.BoxGeometry(0.03, sy * 0.9, sz * 0.7),
        xf * (sx / 2 - 0.015), 0, -sz * 0.08, 0, 0, 0, S.proxSteel);
    }
  } else if (kind === 'ammoRack' && modern) {
    // modern hull autoloader carousel (T-72/T-90 lineage): ring of charges
    // standing in a rotating tray around the turret basket axis. Charge
    // radius is caliber-true and the ring count follows the circumference
    // (r6) — a 125 mm carousel packs ~14-16 slim charges, never 10 fat ones.
    const R = Math.max(0.22, Math.min(sx, sz) * 0.36);
    const rT = rCal > 0 ? rCal : 0.055;
    const n = Math.max(8, Math.min(18, Math.round((Math.PI * 2 * R) / Math.max(0.11, rT * 2.9))));
    const r = Math.min(rT, R * 0.3);
    const caseH = sy * 0.5;
    const tipH = Math.min(sy * 0.2, r * 5.5);
    const list = [];
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2;
      list.push({ x: Math.cos(az) * R, y: -sy / 2 + sy * 0.1 + caseH / 2, z: Math.sin(az) * R });
    }
    rounds(r, caseH, tipH, list);
    // carousel tray disc + rim
    put(new THREE.CylinderGeometry(R * 1.28, R * 1.28, sy * 0.1, 18), 0, -sy / 2 + sy * 0.05, 0);
    put(new THREE.TorusGeometry(R * 1.24, Math.min(sy * 0.08, 0.045), 8, 24),
      0, -sy / 2 + sy * 0.16, 0, Math.PI / 2, 0, 0);
  } else if (kind === 'ammoRack') {
    // WWII open tray: rows of standing rounds (brass case + ogive tip, r7
    // critique: bare cylinders read as extruded crates) over a thin rack
    // tray. Round radius caliber-true, grid pitch derived from it (r6).
    const rT = rCal > 0 ? rCal : 0.055;
    const nx = Math.max(2, Math.min(6, Math.floor(sx / Math.max(0.12, rT * 3.0))));
    const nz = Math.max(2, Math.min(8, Math.floor(sz / Math.max(0.12, rT * 3.0))));
    const r = Math.min(rT, (sx / nx) * 0.32, (sz / nz) * 0.32);
    const h = sy * 0.62;
    const tipH = Math.min(sy * 0.26, r * 5.5);
    const list = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        list.push({
          x: -sx / 2 + (ix + 0.5) * (sx / nx),
          y: -sy / 2 + sy * 0.06 + h / 2,
          z: -sz / 2 + (iz + 0.5) * (sz / nz),
        });
      }
    }
    rounds(r, h, tipH, list);
    put(new THREE.BoxGeometry(sx * 0.98, sy * 0.08, sz * 0.98), 0, -sy / 2 + sy * 0.03, 0);
  } else if (kind === 'fuelTank' && modern) {
    // modern internal fuel: STRAPPED CYLINDRICAL CELLS (r8 — the r5 box cell
    // still read as a plain crate during the 7 s hold, critic). Two fat
    // rounded cells with domed ends filling the volume, each cradled on
    // steel saddles under two proud wrap-around strap ribs, plus a filler
    // neck + cap on one cell and a feed line exiting the base. Cylinder
    // silhouettes read as tankage at ghost range where a box reads as cargo.
    const steel = S.proxSteel;
    const nCell = sx > sy * 1.7 ? 2 : 1; // narrow bays get one big cell
    const xOffs = nCell === 2 ? [-0.22, 0.22] : [0];
    const r = Math.max(0.07, Math.min(sy * 0.42, (sx / nCell) * 0.36, sz * 0.4));
    const cl = sz * 0.78;
    for (const xf of xOffs) {
      const cx = sx * xf;
      put(new THREE.CylinderGeometry(r, r, cl, 14), cx, -sy * 0.03, 0, Math.PI / 2, 0, 0);
      put(new THREE.SphereGeometry(r, 12, 8), cx, -sy * 0.03, cl / 2);
      put(new THREE.SphereGeometry(r, 12, 8), cx, -sy * 0.03, -cl / 2);
      for (const zf of [-0.24, 0.24]) {
        put(new THREE.TorusGeometry(r * 1.04, r * 0.11, 6, 18),
          cx, -sy * 0.03, sz * zf, 0, 0, 0, steel);
        // saddle cradle feet under each strap station
        put(new THREE.BoxGeometry(r * 1.7, Math.max(0.04, sy * 0.5 - r * 0.4), r * 0.5),
          cx, -sy * 0.03 - r * 0.78, sz * zf, 0, 0, 0, steel);
      }
    }
    const fr = Math.min(sx, sz) * 0.11;
    put(new THREE.CylinderGeometry(fr * 0.55, fr * 0.55, sy * 0.24, 8),
      sx * xOffs[xOffs.length - 1], sy * 0.3, sz * 0.1, 0, 0, 0, steel);
    put(new THREE.CylinderGeometry(fr, fr, sy * 0.07, 10),
      sx * xOffs[xOffs.length - 1], sy * 0.43, sz * 0.1, 0, 0, 0, steel);
    put(new THREE.CylinderGeometry(fr * 0.4, fr * 0.4, sz * 0.55, 6),
      -sx * 0.1, -sy * 0.34, 0, Math.PI / 2, 0, 0, steel);
  } else if (kind === 'engine') {
    // machinery read (r5 critique: 'plain gray box with two cylinders'):
    // crankcase + narrower head with twin rocker covers, transverse
    // cylinder-bank fins, a shrouded cooling fan (ring + blade disc + hub)
    // sunk into the deck and twin flank exhaust manifolds with riser elbows.
    // Fins/fan/exhaust wear the steel accent so the assembly separates into
    // recognizable machinery instead of alpha-mushing into one slab.
    const steel = S.proxSteel;
    // r8 silhouette pass (critic: read as a 'tan loaf' at ghost range): the
    // crankcase gains an oil pan step, the cooling fan grows to deck-fan
    // scale with visible radial blades in its shroud, an air-cleaner drum
    // rides the head, and the flank exhaust manifolds thicken with riser
    // elbows — block + fan ring + manifolds now read at silhouette level.
    put(new THREE.BoxGeometry(sx * 0.84, sy * 0.42, sz * 0.8), 0, -sy * 0.22, 0);
    put(new THREE.BoxGeometry(sx * 0.58, sy * 0.14, sz * 0.58), 0, -sy * 0.44, 0, 0, 0, 0, steel);
    put(new THREE.BoxGeometry(sx * 0.54, sy * 0.3, sz * 0.6), 0, sy * 0.06, 0);
    put(new THREE.BoxGeometry(sx * 0.16, sy * 0.1, sz * 0.56),
      -sx * 0.15, sy * 0.25, 0, 0, 0, 0, steel);
    put(new THREE.BoxGeometry(sx * 0.16, sy * 0.1, sz * 0.56),
      sx * 0.15, sy * 0.25, 0, 0, 0, 0, steel);
    for (let i = 0; i < 5; i++) {
      put(new THREE.BoxGeometry(sx * 0.68, sy * 0.4, sz * 0.045),
        0, sy * 0.04, -sz * 0.26 + i * (sz * 0.52 / 4), 0, 0, 0, steel);
    }
    const fr = Math.min(sx, sz) * 0.27;
    put(new THREE.TorusGeometry(fr * 1.12, fr * 0.14, 8, 24),
      -sx * 0.2, sy * 0.34, 0, Math.PI / 2, 0, 0, steel);
    put(new THREE.CylinderGeometry(fr, fr, sy * 0.04, 18), -sx * 0.2, sy * 0.31, 0);
    for (let b = 0; b < 5; b++) {
      put(new THREE.BoxGeometry(fr * 1.9, sy * 0.03, fr * 0.24),
        -sx * 0.2, sy * 0.345, 0, 0, (b / 5) * Math.PI, 0, steel);
    }
    put(new THREE.CylinderGeometry(fr * 0.22, fr * 0.22, sy * 0.14, 8),
      -sx * 0.2, sy * 0.39, 0, 0, 0, 0, steel);
    // air-cleaner drum on the head, opposite the fan
    put(new THREE.CylinderGeometry(fr * 0.5, fr * 0.5, sx * 0.3, 10),
      sx * 0.24, sy * 0.3, -sz * 0.18, 0, 0, Math.PI / 2, steel);
    for (const side of [-1, 1]) {
      put(new THREE.CylinderGeometry(sy * 0.095, sy * 0.095, sz * 0.7, 8),
        side * sx * 0.38, sy * 0.04, 0, Math.PI / 2, 0, 0, steel);
      for (let i = 0; i < 3; i++) {
        put(new THREE.CylinderGeometry(sy * 0.06, sy * 0.06, sx * 0.18, 6),
          side * sx * 0.3, sy * 0.14, -sz * 0.2 + i * sz * 0.2,
          0, 0, side * (Math.PI / 2.7), steel);
      }
    }
  } else if (kind === 'fuelTank') {
    const r = Math.max(0.05, Math.min(sy * 0.42, sx * 0.21));
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), -sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(r, r, sz * 0.85, 10), sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    // filler caps + connecting manifold so the drums read as plumbing
    put(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.5, 8), -sx * 0.22, r * 1.05, 0);
    put(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.5, 8), sx * 0.22, r * 1.05, 0);
    put(new THREE.CylinderGeometry(r * 0.16, r * 0.16, sx * 0.44, 6),
      0, 0, sz * 0.28, 0, 0, Math.PI / 2);
    // strap ribs around each drum (r5: at x-ray range the pair still read as
    // one slab) — steel bands stand slightly proud of the drum shells
    for (const zf of [-0.26, 0.26]) {
      put(new THREE.TorusGeometry(r * 1.05, r * 0.1, 6, 16),
        -sx * 0.22, 0, sz * zf, 0, 0, 0, S.proxSteel);
      put(new THREE.TorusGeometry(r * 1.05, r * 0.1, 6, 16),
        sx * 0.22, 0, sz * zf, 0, 0, 0, S.proxSteel);
    }
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
 * Crew proxy: seated human silhouette — torso capsule with a shoulder bar
 * across its top, a clearly-necked head sphere and a slightly proud helmet
 * dome over it. The r6 single-capsule + ball figures read as featureless
 * "bowling pins" (critique) — the shoulder lobe and helmet brim give the
 * silhouette the two-lobe human read WT's crew ghosts have, still in the
 * same quiet tinted material language as the module proxies.
 */
function addCrewProxy(bb, mat, poseGrp, turretGrp, disposables) {
  const sx = bb.max[0] - bb.min[0];
  const sy = bb.max[1] - bb.min[1];
  const sz = bb.max[2] - bb.min[2];
  const g = proxyGroup(bb, poseGrp, turretGrp);
  const r = Math.min(sx, sz) * 0.26;
  const headR = Math.max(0.05, Math.min(r * 0.62, sy * 0.15));
  const torsoH = sy * 0.52;
  const capR = Math.max(0.04, r * 0.78);
  const shoulderSpan = Math.max(0.06, Math.min(sx, sz) * 0.46);
  const body = new THREE.CapsuleGeometry(capR, Math.max(0.02, torsoH - capR * 2), 4, 10);
  const shoulder = new THREE.CapsuleGeometry(capR * 0.55, shoulderSpan, 4, 8);
  const head = new THREE.SphereGeometry(headR, 10, 8);
  const helmet = new THREE.SphereGeometry(headR * 1.24, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  disposables.push(body, shoulder, head, helmet);
  const bm = new THREE.Mesh(body, mat);
  bm.position.y = -sy / 2 + torsoH / 2;
  const sm = new THREE.Mesh(shoulder, mat);
  sm.rotation.z = Math.PI / 2;
  sm.position.y = -sy / 2 + torsoH - capR * 0.5;
  const neckY = -sy / 2 + torsoH + headR * 1.05;
  const hm = new THREE.Mesh(head, mat);
  hm.position.y = neckY;
  const em = new THREE.Mesh(helmet, mat);
  em.position.y = neckY + headR * 0.1;
  em.scale.set(1, 0.8, 1);
  g.add(bm, sm, hm, em);
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
/* REPLAY OWNS THE SCREEN (r4 critical): while a replay is live, no battle-HUD
   chrome may render over the cinematic — a one-frame race in the integration
   flyby edge-latch (main.js snapshots kcActive at frame top, the death path
   begins the replay mid-frame, the stale latch then un-veiled the HUD for the
   whole replay: team panels/kill feed/minimap/reticle over flight AND x-ray,
   photographed 1-of-2 live runs). Declarative defense: begin() stamps
   body.cot-kc-live, finish() removes it — !important beats any inline
   veilHud(false) a later caller writes, so the chrome CANNOT come back while
   the replay is active whatever the caller ordering. .cot-hud contains every
   battle element incl. the damage panel + shot-info layer; .cot-si-stats is
   the battle report (already killcam:done-gated, veiled here for parity). */
body.cot-kc-live .cot-hud{display:none !important;}
body.cot-kc-live .cot-si-stats{visibility:hidden !important;}
/* X-RAY BACKDROP SCRIM (r4 major): the old veil was a pure edge vignette —
   0% dim at the victim — so sunlit grass behind the ghost stayed at full
   luminance and the fresnel skin washed out to a milky blob (staged Tiger
   evidence; the same treatment read fine over a dark dirt road). The veil now
   darkens the WHOLE frame (WT armor-viewer read) with the focus falloff kept:
   ~14% at the victim rising to ~52% at the frame edge, over a light-dim of
   the 3D scene itself (beginXray dims sun/hemi so terrain drops BEFORE the
   translucent skin blends over it — the unlit ghost material keeps its own
   brightness, making ghost contrast scene-luminance-INVARIANT). */
.cot-kc-veil{position:absolute;inset:0;opacity:0;transition:opacity .5s ease;
  background:radial-gradient(ellipse 56% 50% at var(--kcvx,50%) var(--kcvy,55%),
    rgba(5,9,14,.14) 0%,rgba(5,9,14,.17) 26%,rgba(5,9,14,.28) 54%,
    rgba(5,9,14,.42) 78%,rgba(5,9,14,.52) 100%);}
.cot-kc.xr .cot-kc-veil{opacity:1;}
@keyframes cotKcIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
.cot-kc-anim{opacity:0;animation:cotKcIn .35s ease forwards;}
line.cot-kc-anim{animation-name:cotKcInLine;}
@keyframes cotKcInLine{from{opacity:0;}to{opacity:.85;}}
.cot-kc-micro{position:absolute;white-space:nowrap;background:rgba(6,9,12,.6);
  border:1px solid rgba(146,164,180,.25);color:#9fc0da;padding:1px 5px 2px;
  font-family:${FONT_COND};font-weight:700;font-size:9px;
  letter-spacing:.14em;text-transform:uppercase;line-height:1.2;}
.cot-kc-bart,.cot-kc-barb{position:absolute;left:0;right:0;height:9vh;}
.cot-kc-bart{top:0;background:linear-gradient(180deg,rgba(0,0,0,.94),rgba(0,0,0,.6) 70%,transparent);}
.cot-kc-barb{bottom:0;background:linear-gradient(0deg,#000 38%,rgba(0,0,0,.72) 68%,transparent);}
.cot-kc-title{position:absolute;top:2.4vh;left:50%;transform:translateX(-50%);text-align:center;}
.cot-kc-title .t{font-family:${FONT_COND};font-weight:800;
  font-size:17px;letter-spacing:.46em;color:#ffd9a0;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.cot-kc-title .s{font-size:10.5px;letter-spacing:.18em;color:#aeb9c4;margin-top:3px;
  font-variant-numeric:tabular-nums;}
.cot-kc-skip{position:absolute;bottom:1.6vh;right:30px;font-family:${FONT_COND};
  font-weight:700;font-size:10.5px;letter-spacing:.26em;color:#93a1ad;}
.cot-kc-annot{position:absolute;left:28px;bottom:11.5vh;width:272px;
  background:linear-gradient(180deg,rgba(10,14,18,.9),rgba(6,9,12,.92));
  border:1px solid rgba(146,164,180,.32);border-left:2px solid #ffb04a;
  box-shadow:0 6px 24px rgba(0,0,0,.55);padding:0 0 8px;}
.cot-kc-annot .hd{padding:6px 10px 5px;border-bottom:1px solid rgba(146,164,180,.18);}
.cot-kc-annot .hd .k{font-family:${FONT_COND};font-weight:800;
  font-size:13px;letter-spacing:.1em;color:#ffcf8a;}
.cot-kc-annot .hd .w{font-size:10.5px;color:#c6d2dc;margin-top:2px;letter-spacing:.03em;}
.cot-kc-rows{padding:5px 10px 0;display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;}
.cot-kc-kv{display:flex;justify-content:space-between;font-size:10.5px;color:#8a97a3;
  font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-kc-kv b{color:#e4edf4;font-weight:700;font-family:${FONT_COND};letter-spacing:-.01em;}
/* r8: the pen row spans the card on ONE line (it wrapped into a mangled
   two-line label/value jumble); the ERA/screens qualifier is a suffix chip
   and a dim caption legends the number format once. */
.cot-kc-kv.w{grid-column:1/-1;}
.cot-kc-kv.pen b{white-space:nowrap;}
.cot-kc-kv b .q{display:inline-block;margin-left:6px;padding:0 3px 1px;
  border:1px solid currentColor;font-size:8px;letter-spacing:.12em;
  vertical-align:1.5px;line-height:1.25;font-weight:800;}
.cot-kc-pencap{grid-column:1/-1;font-size:8.5px;color:#5f6d7a;letter-spacing:.05em;
  text-align:right;margin-top:-2px;}
.cot-kc-banner{margin:7px 10px 0;padding:3px 8px;text-align:center;display:none;
  font-family:${FONT_COND};font-weight:800;font-size:11px;
  letter-spacing:.2em;color:#ff6a5a;border:1px solid rgba(255,106,90,.7);
  background:rgba(120,20,10,.35);}
.cot-kc-banner.on{display:block;}
.cot-kc-label{position:absolute;white-space:nowrap;
  background:rgba(6,9,12,.86);border:1px solid currentColor;padding:3px 8px 4px;
  font-family:${FONT_COND};font-weight:800;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;line-height:1.25;
  box-shadow:0 2px 10px rgba(0,0,0,.6);}
.cot-kc-label .s{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  color:#e8f0f6;font-variant-numeric:tabular-nums;}
.cot-kc-label.ok{color:#8a97a3;border-color:rgba(138,151,163,.5);
  background:rgba(6,9,12,.6);box-shadow:none;font-weight:700;}
.cot-kc-label.ok .s{color:#7d8a96;font-weight:600;}
/* r8 near-miss tier (critic: the gray chip language read as a damaged-module
   callout): dashed border, smaller caps, one line, no leader dot — sits ON
   its organ like the micro identity tags, so it can never straddle the hull
   silhouette edge. Informational, never a casualty. */
.cot-kc-label.nm{color:#9fb0bf;border:1px dashed rgba(150,166,180,.55);
  background:rgba(6,9,12,.72);box-shadow:none;font-weight:700;font-size:9.5px;
  letter-spacing:.11em;padding:2px 6px 3px;opacity:.85;}
.cot-kc-label.nm .s{display:inline;font-size:9.5px;font-weight:600;color:#788695;}
.cot-kc-dot{position:absolute;width:7px;height:7px;border-radius:50%;
  transform:translate(-50%,-50%);background:currentColor;box-shadow:0 0 9px currentColor;}
.cot-kc-dot.ok{background:transparent;border:1.5px solid currentColor;box-shadow:none;}
.cot-kc-dmg{position:absolute;font-family:${FONT_COND};
  font-weight:800;font-size:24px;color:#ffd166;
  letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.9);font-variant-numeric:tabular-nums;
  background:rgba(6,9,12,.6);border:1px solid rgba(255,209,102,.4);
  padding:1px 9px 2px;line-height:1.2;}
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
  // World access for the flight LOS solve (r6 major): terrain/prop raycast +
  // the vegetation concealment discs the spotting sim itself uses. Prefer an
  // injected getter (docs/handoff/killcam_shotinfo-r6.md wires main.js to
  // pass `getWorld: () => world`); fall back to the debug handle so the fix
  // is live before the integration dep lands. Resolved lazily per replay —
  // the world object is REPLACED on every map switch.
  const getWorld = deps.getWorld
    || (() => (typeof window !== 'undefined' && window.__DEBUG ? window.__DEBUG.world : null));

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
    const meshMats = [S.trailGlow, S.trailCore, S.trailGlowFar, S.trailCoreFar,
      S.core, S.streak, S.tail,
      S.ghost, S.pathIn, S.pathOut, S.pathCore, S.spall, S.frag, S.fragRed,
      S.fragYellow, S.fragCrew, S.marker,
      S.fillRed, S.fillYellow, S.fillCrew, S.proxIntact,
      S.proxSteel, S.proxGreen, S.proxYellow,
      S.proxRed, S.proxGrey];
    for (const m of meshMats) g.add(new THREE.Mesh(box, m));
    // instanced Lambert variant (ammo cassettes) compiles a separate program
    for (const m of [S.proxIntact, S.proxYellow, S.proxRed]) {
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
  let busRef = null;      // bound in bindBus — replay lifecycle announcements
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
      // post-hit module states + spent ERA tiles: the pre-wreck restage in
      // begin() re-poses the LIVE visual for the ghost — broken tracks and
      // stripped ERA the tank already carried must be re-applied to it (and
      // to the wreck again in finish()) so the ghost never under-reports
      // damage the sim resolved.
      moduleStates: target.combat && target.combat.modules
        ? Object.fromEntries(Object.entries(target.combat.modules)
          .map(([k, v]) => [k, v.state]))
        : null,
      eraSpent: target.combat && target.combat.eraSpent
        ? [...target.combat.eraSpent] : [],
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
      busRef = bus;
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
    // REPORT GATE (r6 critical): announce that the replay owns the screen.
    // state.js emits battle:ended in the same JS task begin() runs in, and
    // shotInfo.js used to render its full-screen battle report on that event
    // immediately — the z-71 DEFEAT panel buried the still-playing z-60
    // flight + x-ray hold. shotInfo now BUFFERS the report while a replay is
    // live and flushes it on killcam:done (emitted in finish() below).
    if (busRef) busRef.emit('killcam:begin', { kind });
    pb = {
      snap, kind, onDone,
      phase: 'flight', t: 0, xt: 0,
      group: new THREE.Group(),
      disposables: [],
      ghostBackup: null,
      ghostVis: null, ghostSkin: null, // re-assertable skin pass (r3)
      labels: [],
      obstacles: null, // module/crew box screen rects (label repulsion, r3)
      pts: null, cum: null, total: 0, dur: 0, segIdx: 0,
      flightLift: null, // per-sample camera lift (flight LOS solve, r6)
      core: null, streak: null, trailGeo: null,
      halo: null, tail: null, shellLight: null, muzzleLight: null,
      xcam: null,
      fxGroup: null, fxHidden: null,
      vegGroup: null, vegWasVisible: true,
      dimmedLights: null, // x-ray backdrop light dim, restored in finish (r4)
      rewreck: null, // wreck look to re-apply in finish() (pre-wreck restage)
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

    // PRE-WRECK RESTAGE (r2 major): the replay shows the moment of the hit,
    // but by the time it plays the victim's visual has already been wrecked
    // (burnt materials, turret settled askew / popped onto the deck, gun
    // drooped). Ghosting THAT produced a turretless slab whose hull no longer
    // aligned with the snapshot-posed module frames — fuel drums and
    // drivetrain blocks rendered half OUTSIDE the silhouette on the live
    // Abrams death (r2 evidence). Restore the live visual and re-pose it from
    // the SNAPSHOT state (position, yaw, attitude, turret yaw, gun pitch) for
    // the whole replay; finish() re-applies the wreck (settled, embers cold)
    // together with the snapshot's broken tracks and spent ERA so the death
    // cam afterwards is honest again. The sim/visual sync loop is frozen
    // while the replay runs (main.js step 5), so nothing overwrites the pose.
    {
      const vis0 = snap.targetEnt && snap.targetEnt.visual;
      if (vis0 && vis0.isDestroyed && vis0.isDestroyed()) {
        const deadTrack = (m) =>
          (snap.moduleStates && snap.moduleStates[m] === 'red') ||
          (snap.ev.modulesHit || []).some((x) => x.module === m && x.newState === 'red');
        pb.rewreck = {
          pop: !!snap.ev.ammoRacked,
          brokenTracks: ['trackL', 'trackR'].filter(deadTrack),
          eraSpent: snap.eraSpent || [],
        };
        vis0.resetDestroyed();
        const p0 = snap.pose;
        vis0.syncFromState({
          pos: new THREE.Vector3(p0.pos[0], p0.pos[1], p0.pos[2]),
          yaw: p0.yaw, visualPitch: p0.pitch, visualRoll: p0.roll,
          turretYaw: p0.turretYaw, gunPitch: p0.gunPitch,
          yawRate: 0, speed: 0, trackScroll: { l: 0, r: 0 },
        }, 0);
        // damage the tank HAD at the hit stays visible on the live ghost
        for (const m of pb.rewreck.brokenTracks) vis0.setTrackState(m, true);
        if (vis0.stripEra) for (const pl of pb.rewreck.eraSpent) vis0.stripEra(pl);
      }
    }

    // annotation block
    const ev = snap.ev;
    // Header branches on the REPLAY DIRECTION, not just the caller's kind
    // param (r5): the staged harness frame runs begin(kind='death') on a
    // player-scored kill and titled it 'KILL CAM / destroyed by <your own
    // tank>' — your kill phrased like your death. victim==player keeps the
    // death phrasing; killer==player reads 'FINAL BLOW / <victim> destroyed'.
    const pEnt = getPlayer();
    const playerIsVictim = !!(pEnt
      && ((ev.targetId != null && ev.targetId === pEnt.id) || snap.targetEnt === pEnt));
    const playerKill = kind === 'victory'
      || (!playerIsVictim && !!(pEnt && ev.attackerId != null && ev.attackerId === pEnt.id));
    d.titleT.textContent = playerKill ? 'FINAL BLOW' : 'KILL CAM';
    d.titleS.textContent = playerKill
      ? `${ev.targetName || 'enemy'} destroyed`
      : `destroyed by ${ev.attackerName || 'enemy fire'}`;
    const cleanName = shellDisplayName(ev);
    d.hdK.textContent = cleanName ? `${ev.shellType || ''} · ${cleanName}` : (ev.shellType || '');
    d.hdW.textContent = `${ev.attackerName || 'Enemy'} → ${ev.targetName || ''}`;
    d.rows.textContent = '';
    const kv = (k, v, wide) => {
      const r = el('div', `cot-kc-kv${wide ? ' w' : ''}`, d.rows);
      const ks = el('span', '', r); ks.textContent = k;
      const vs = el('b', '', r); vs.textContent = v;
      return r;
    };
    kv('Distance', `${Math.round(ev.flightDistM || 0)} m`);
    kv('Impact angle', `${Math.round(ev.impactAngleDeg || 0)}°`);
    // 'N → M mm eff.' labels the angle-adjusted number (r5: nominal vs
    // effective was unlabeled — the most educational stat read as opaque);
    // hits that resolved on an external module (optics, gun barrel) state
    // the truth instead of a bare em-dash armor story (r5 major).
    const hasArm = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
    const extNoArm = !hasArm && !!ev.zone
      && ['optics', 'gun', 'gun_barrel', 'trackL', 'trackR'].includes(ev.zone);
    kv('Armor', hasArm
      ? `${Math.round(ev.nominalMm || 0)} → ${Math.round(ev.effectiveMm || 0)} mm eff.`
      : extNoArm ? 'external — no armor' : '—');
    // roll / nominal: the rolled pen alone (e.g. 986 mm vs a 63 mm plate)
    // reads as a bug without the ±25%-roll baseline it came from.
    // ERA/screen honesty (r6 major): penRollMm is the shell's RESIDUAL pen —
    // ERA tiles and spaced screens already cut it in-event before the main
    // plate test — and a bare 461/898 on an ERA'd glacis read as a broken
    // ±25% RNG. With the additive payload field penRollFreshMm (damage.js
    // stamps the pre-degradation roll, see docs/handoff) the row prints the
    // cut explicitly: 'fresh → residual / nominal · ERA'. Payloads without
    // the field still get the qualifier whenever the event itself proves a
    // cut happened (eraPlate set, or a residual mathematically impossible
    // from a ±25% roll) — nothing is ever recomputed or guessed.
    kv('Damage', `${Math.round(ev.damage || 0)}`);
    // r8 presentation (critic: 'Pen roll' wrapped into a mangled two-line
    // label/value jumble and the three numbers carried no legend): the row
    // now spans the full card width on ONE line ('Pen' label, nowrap value),
    // the ERA/screens qualifier rides as an unbreakable suffix chip, and a
    // dim caption states the format once ('fresh → after ERA / nominal').
    const penNom = nominalPenFor(ev);
    const penRoll = Math.round(ev.penRollMm || 0);
    const penFresh = Math.round(ev.penRollFreshMm || 0);
    const penCut = penFresh > penRoll + 1;
    const penQual = ev.eraPlate ? 'ERA'
      : (penRoll > 0 && (penCut
        || (penNom > 0 && penRoll < penNom * 0.75 - 2))) ? 'SCREENS' : '';
    {
      const r = kv('Pen', penRoll > 0
        ? `${penCut ? `${penFresh} → ` : ''}${penRoll}${penNom > 0 ? ` / ${penNom}` : ''} mm`
        : '—', true);
      r.classList.add('pen');
      if (penQual) {
        const q = el('span', 'q', r.querySelector('b'));
        q.textContent = penQual;
        q.style.color = penQual === 'ERA' ? '#ffb43c' : '#9fb0bf';
      }
      const legend = penCut
        ? `fresh → after ${penQual === 'ERA' ? 'ERA' : 'screens'} / nominal`
        : penRoll > 0 && penNom > 0 ? 'roll / nominal' : '';
      r.title = legend ? `Penetration (mm): ${legend}` : 'Penetration roll at impact';
      if (legend) el('div', 'cot-kc-pencap', d.rows).textContent = legend;
    }
    kv('Zone', zoneLabel(ev.zone), true);
    d.banner.classList.toggle('on', !!ev.ammoRacked);
    d.labelHost.textContent = '';
    d.leader.textContent = '';
    d.root.classList.add('on');
    // REPLAY OWNS THE SCREEN: css-level HUD veil that no later veilHud(false)
    // caller can undo (see KC_CSS note) — removed in finish()
    document.body.classList.add('cot-kc-live');

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
        pb.flightLift = solveFlightOcclusion();
        // trail polyline (drawRange grows with the shell); full-white vertex
        // colors during flight — beginXray rewrites them into the tail fade
        const posAttr = new Float32Array(pts.length * 3);
        pts.forEach((v, i) => { posAttr[i * 3] = v.x; posAttr[i * 3 + 1] = v.y; posAttr[i * 3 + 2] = v.z; });
        pb.trailGeo = new THREE.BufferGeometry();
        pb.trailGeo.setAttribute('position', new THREE.BufferAttribute(posAttr, 3));
        pb.trailGeo.setAttribute('color',
          new THREE.BufferAttribute(new Float32Array(pts.length * 3).fill(1), 3));
        pb.trailGeo.setDrawRange(0, 1);
        pb.disposables.push(pb.trailGeo);
        pb.group.add(new THREE.Line(pb.trailGeo, S.trail));
        // tracer core: an APFSDS long-rod DART — thin tapered rod + cone
        // tip, no sphere (r5: the shell read as a fat glowing baton with a
        // bulbous white ball at the tip; WT renders a needle with a fading
        // trail). Radial thickness is camera-distance-scaled in updateFlight.
        const rodGeo = new THREE.CylinderGeometry(0.032, 0.02, 1.05, 8, 1, true);
        const tipGeo = new THREE.ConeGeometry(0.032, 0.3, 8);
        const streakGeo = new THREE.CylinderGeometry(0.02, 0.007, 5.0, 6, 1, true);
        pb.disposables.push(rodGeo, tipGeo, streakGeo);
        pb.core = new THREE.Group();
        const rodMesh = new THREE.Mesh(rodGeo, S.core);
        const tipMesh = new THREE.Mesh(tipGeo, S.core);
        tipMesh.position.y = 0.675; // cone base seated on the rod's front
        pb.core.add(rodMesh, tipMesh);
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
        pb.halo.scale.set(1.7, 1.7, 1); // r5: 3.1 read as a bulb around the dart
        S.halo.opacity = 0.95; // shared mats: undo any axis fade left behind
        S.tail.opacity = 0.17;
        // tail cone slimmed ~55% and vertex-faded to NOTHING at its far end
        // (r5: the hard-edged orange cone was the 'baton' half of the read) —
        // additive blending multiplies by vertex color, so black = invisible
        const tailGeo = new THREE.ConeGeometry(0.19, 10, 10, 1, true);
        {
          const tp = tailGeo.getAttribute('position');
          const tc = new Float32Array(tp.count * 3);
          for (let vi = 0; vi < tp.count; vi++) {
            // apex (+Y, the far tail end) -> 0, base (at the shell) -> 1
            const v = Math.pow(THREE.MathUtils.clamp(0.5 - tp.getY(vi) / 10, 0, 1), 1.4);
            tc[vi * 3] = tc[vi * 3 + 1] = tc[vi * 3 + 2] = v;
          }
          tailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
        }
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

  /**
   * FLIGHT LOS SOLVE (r6 major): the chase camera rode a fixed 6-9 m offset
   * with only a terrain floor — a trajectory skimming a foliage clump parked
   * the entire 2.6 s slow-mo INSIDE the canopy (screen full of leaf cards +
   * lens flare, victim invisible until the x-ray; live capture
   * shots/critic_r6_ks/b_flight.png). Before the flight starts this samples
   * the exact camera poses updateFlight() will visit and, wherever a pose
   * sits inside a vegetation concealment volume or has its view line to the
   * look target blocked by terrain/props, finds the smallest vertical lift
   * that clears it. Lifts are neighbor-maxed (the camera is already climbing
   * BEFORE it reaches an occluded stretch) and lerped during playback; the
   * x-ray blend fades them out through the same k-lerp that lands the pose,
   * so the handover stays seamless. Occluder data is the world the sim
   * itself uses — world.raycast (heightfield + prop AABBs) and the spotting
   * system's vegetation concealment discs — nothing here is invented.
   * @returns {?Float32Array} lift meters per sample, or null when clear
   */
  function solveFlightOcclusion() {
    let world = null;
    try { world = getWorld ? getWorld() : null; } catch (_) { world = null; }
    const conceal = (world && world.getConcealment && world.getConcealment()) || [];
    const canRay = !!(world && world.raycast);
    if ((!conceal.length && !canRay) || !pb.pts || pb.total <= 0) return null;
    const N = 13;
    const LIFTS = [0, 2.5, 5, 8, 12, 16, 20];
    const lifts = new Float32Array(N);
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const camP = new THREE.Vector3();
    const look = new THREE.Vector3();
    const sideV = new THREE.Vector3();
    const ray = new THREE.Vector3();
    /** Camera pose acceptable: outside foliage volumes, view line open. */
    const clearAt = (cp, lk) => {
      // 1. inside a foliage clump? Discs are 2D (x,z,r) — bushes (add>=0.2)
      // occlude a low band, tree canopies an elevated one (trunk gaps below
      // ~1.8 m read fine; canopy tops out ~11.5 m across the tree kits).
      for (const c of conceal) {
        const dx = cp.x - c.x;
        const dz = cp.z - c.z;
        const rr = c.r + 0.9;
        if (dx * dx + dz * dz > rr * rr) continue;
        const gy = heightField ? heightField.getHeightAt(c.x, c.z) : cp.y - 100;
        const lo = c.add >= 0.2 ? gy - 1 : gy + 1.8;
        const hi = c.add >= 0.2 ? gy + 3.2 : gy + 11.5;
        if (cp.y > lo && cp.y < hi) return false;
      }
      // 2. view line to the look target blocked by terrain or a building?
      // 80% guard distance: the look point sits near/inside the victim, and
      // the victim's own surroundings must not fail an otherwise clean pose.
      if (canRay) {
        ray.copy(lk).sub(cp);
        const d = ray.length();
        if (d > 2 && world.raycast(cp, ray.multiplyScalar(1 / d), d * 0.8)) return false;
      }
      return true;
    };
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const s = 1 - Math.pow(1 - u, 2.15); // same ease as updateFlight
      sampleTraj(s * pb.total, pos, dir);
      sideV.crossVectors(dir, UP);
      if (sideV.lengthSq() < 1e-6) sideV.set(1, 0, 0); else sideV.normalize();
      camP.copy(pos).addScaledVector(dir, -(6.4 + 2.6 * (1 - u))).addScaledVector(sideV, 2.7);
      camP.y += 1.35;
      if (heightField) {
        const minY = heightField.getHeightAt(camP.x, camP.z) + 0.8;
        if (camP.y < minY) camP.y = minY;
      }
      look.copy(pos).addScaledVector(dir, 10).lerp(pb.xcam.center, 0.4 + 0.35 * u);
      const baseY = camP.y;
      let lift = LIFTS[LIFTS.length - 1]; // best effort if nothing clears
      for (const cand of LIFTS) {
        camP.y = baseY + cand;
        if (clearAt(camP, look)) { lift = cand; break; }
      }
      lifts[i] = lift;
    }
    pb.segIdx = 0; // sampleTraj cache back to the launch segment for playback
    let any = 0;
    for (let i = 0; i < N; i++) any = Math.max(any, lifts[i]);
    if (any === 0) return null; // clean path — skip the per-frame lerp
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      sm[i] = Math.max(lifts[Math.max(0, i - 1)], lifts[i], lifts[Math.min(N - 1, i + 1)]);
    }
    return sm;
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
    pb.core.quaternion.setFromUnitVectors(_Y, _d); // dart noses along the velocity
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

    // chase camera: behind + beside the tracer, blending into the x-ray pose.
    // r2 cinematography fix: the old 8.5-15.5 m trail distance + look-at 16 m
    // past the shell framed NEITHER shooter nor victim — the tracer was a
    // small off-center streak in an empty landscape. The camera now rides a
    // tight, near-constant 6-9 m offset (constant tracer screen size) and the
    // look target is BIASED TOWARD THE VICTIM (WT read: the destination tank
    // rises into center frame while the shell holds the lower third).
    _s.crossVectors(_d, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    const k = THREE.MathUtils.smoothstep(u, 0.78, 1);
    _a.copy(_p).addScaledVector(_d, -(6.4 + 2.6 * (1 - u))).addScaledVector(_s, 2.7);
    _a.y += 1.35;
    // occlusion lift (r6): solved once in begin() — the chase arcs OVER
    // foliage clumps / buildings instead of chasing through them; the k-lerp
    // to the x-ray pose below fades the lift out naturally.
    if (pb.flightLift) {
      const fi = Math.min(0.999999, u) * (pb.flightLift.length - 1);
      const i0 = Math.floor(fi);
      _a.y += pb.flightLift[i0] + (pb.flightLift[i0 + 1] - pb.flightLift[i0]) * (fi - i0);
    }
    // look-at: shell's forward point pulled toward the victim center — the
    // pull strengthens over the flight so the kill frame is always in view
    _b.copy(_p).addScaledVector(_d, 10);
    _b.lerp(pb.xcam.center, 0.4 + 0.35 * u);
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
      // near-constant screen thickness (r5: the tracer swelled into a fat
      // baton as the chase closed into the x-ray blend): radial scale tracks
      // camera range — full at the 8 m chase, thinning to ~45% point-blank
      const th = THREE.MathUtils.clamp(_a.distanceTo(_p) / 8, 0.45, 1.15);
      pb.core.scale.set(th, 1, th);
      pb.streak.scale.set(th, 1, th);
      pb.tail.scale.set(th, 1, th);
      pb.halo.scale.set(1.7 * th, 1.7 * th, 1);
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
    // x-ray dressing thickness follows the SOLVED orbit radius (r5: fixed
    // radii read as a fat baton at the tight Tiger-class orbit): ~1 at an
    // 8.5 m orbit, floored/capped so huge and tiny victims both stay legible.
    const rQ = THREE.MathUtils.clamp(
      (pb.xcam && pb.xcam.off ? pb.xcam.off.length() : 8.5) / 8.5, 0.8, 1.5);
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
      // terrain-aware trim (r4): a low grazing arc could leave kept points
      // skimming (or, on a rising slope, visually inside) the ground — the
      // beam then reads as if the shell emerged from the terrain. Drop every
      // kept point up to the LAST one without ~0.6 m of clearance; the final
      // two points (the plate arrival) are always kept.
      if (heightField) {
        for (let i = start; i < pb.pts.length - 3; i++) {
          const p = pb.pts[i];
          if (p.y < heightField.getHeightAt(p.x, p.z) + 0.6) start = i + 1;
        }
      }
      pb.trailGeo.setDrawRange(start, pb.pts.length - start);
      // Fade the kept polyline's TAIL (r5): vertex colors ramp from black
      // where the line enters frame to full at the plate, so the trail dies
      // away instead of hard-starting as a laser at the frame edge.
      const colA = pb.trailGeo.getAttribute('color');
      if (colA) {
        const c0 = pb.cum[start];
        const span = Math.max(1e-3, pb.total - c0);
        for (let i = 0; i < pb.pts.length; i++) {
          const f = THREE.MathUtils.clamp((pb.cum[i] - c0) / span, 0, 1);
          const v = f * f;
          colA.setXYZ(i, v, v, v);
        }
        colA.needsUpdate = true;
      }
      // Rebuild the final arc as a glow ribbon (sheath + hot core tube per
      // segment): the 1px GL line alone was a dim tan thread at 1080p (r5).
      // r2: the ribbon is now a TAPERED ~26 m — the uniform 60 m beam read
      // as a pass-through laser with no travel direction. Radius and tier
      // (far = thin/faint, near = wide/bright) ramp toward the plate, so the
      // approach reads as a tracer ARRIVING, clearly split from the shorter
      // internal penetration channel by the entry marker + spall burst.
      // r5: radii ~40% slimmer and orbit-scaled — the old ribbon fattened
      // into the baton read at close orbit.
      const RIB_M = 26;
      let rs = start;
      const ribFrom = pb.total - RIB_M;
      while (rs < pb.pts.length - 2 && pb.cum[rs + 1] < ribFrom) rs++;
      for (let i = rs; i < pb.pts.length - 1; i++) {
        const f = THREE.MathUtils.clamp((pb.cum[i] - ribFrom) / RIB_M, 0, 1);
        tube(pb.pts[i], pb.pts[i + 1], (0.017 + 0.034 * f) * rQ,
          f > 0.5 ? S.trailGlow : S.trailGlowFar, pb.group, pb.disposables);
        tube(pb.pts[i], pb.pts[i + 1], (0.008 + 0.011 * f) * rQ,
          f > 0.5 ? S.trailCore : S.trailCoreFar, pb.group, pb.disposables);
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
    // r3: extracted + RE-ASSERTED every x-ray frame (updateXray) — the
    // perf-budget GLB kit deferral parents add-on meshes (TUSK kit: 93
    // meshes on the live probe) into the visual ASYNCHRONOUSLY, and a
    // one-shot traverse left them wearing their lit materials: the ghost
    // rendered as a black add-on shell over an invisible hull.
    pb.ghostVis = vis;
    pb.ghostSkin = () => {
      pb.ghostVis.root.traverse((o) => {
        if (o.isMesh && o.material !== S.ghost) {
          pb.ghostBackup.push([o, o.material, o.renderOrder, o.castShadow]);
          o.material = S.ghost;
          o.renderOrder = 11;
          // the hull's own cast shadow otherwise sits directly beneath the
          // translucent skin and reads THROUGH it as a black tank-shaped
          // void (live Abrams probe) — WT floats the wreck on lit ground
          o.castShadow = false;
        }
      });
    };
    pb.ghostSkin();
    pb.group.renderOrder = 12; // internals over the skin (groupOrder sort)
    // feed the ghost shader's depth grading this victim's bounding sphere
    S.ghostCenter.value.copy(pb.xcam.center);
    S.ghostRad.value = Math.max(2, snap.boundingRadiusM || 4);
    // r8 per-band opacity planes (see the shader note in sharedMats): the
    // turret-floor band starts at the SNAPSHOT armor's turret-ring height,
    // the gear-dim band tops out at the track modules' bb ceiling — both
    // straight from the spec the sim itself rolled against, nothing tuned
    // per vehicle. Fallbacks derive from the spec height when a layout
    // carries no turret pivot / track boxes.
    {
      const hM = Math.max(1.4, snap.heightM || 2.4);
      S.ghostRingY.value = pose.pos[1]
        + (armor.turretPivot ? armor.turretPivot[1] : hM * 0.62);
      let gearTop = 0;
      for (const mb of armor.modules || []) {
        if (mb.module === 'trackL' || mb.module === 'trackR') {
          gearTop = Math.max(gearTop, mb.max[1]);
        }
      }
      S.ghostGearY.value = pose.pos[1] + (gearTop > 0 ? gearTop : hM * 0.3);
    }

    // 1a. isolate the vehicle for the hold (WT x-ray read): sunlit grass
    // blades under/behind the hull otherwise show straight through the
    // translucent ghost as bright speckle noise. The vegetation layer comes
    // back in finish() for the death cam / next battle.
    pb.vegGroup = scene.getObjectByName('vegetation') || null;
    if (pb.vegGroup) {
      pb.vegWasVisible = pb.vegGroup.visible;
      pb.vegGroup.visible = false;
    }

    // 1a-bis. BACKDROP LIGHT DIM (r4 major — scene-luminance-invariant ghost):
    // the fresnel skin is translucent, so whatever sits behind it leaks
    // through the alpha blend — over sunlit grass the hull washed out to a
    // milky low-contrast blob while the identical treatment read crisp over a
    // dark dirt road. WT darkens the whole world behind its x-ray; here the
    // sun cascades + ambient hemisphere are dimmed for the hold so the
    // TERRAIN drops before the skin blends over it, while the ghost material
    // itself (unlit MeshBasicMaterial, toneMapped:false) keeps every bit of
    // its own brightness. Intensity writes are pure uniform updates — light
    // COUNT never changes, so no material recompiles (LIGHT-COUNT note).
    // Exact originals restored in finish().
    pb.dimmedLights = [];
    scene.traverse((o) => {
      if ((o.isDirectionalLight || o.isHemisphereLight) && o.intensity > 0) {
        pb.dimmedLights.push([o, o.intensity]);
        o.intensity *= o.isHemisphereLight ? 0.42 : 0.30;
      }
    });
    // pull the victim fill light in tight: at R*4.5 it pooled a bright disc
    // of terrain around the wreck that fought the scrim — the hold only
    // needs it on the hull volume (internals are Lambert-lit)
    kcLights[0].distance = Math.max(10, snap.boundingRadiusM * 2.4);

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

    // 3. module + crew boxes (hit ones highlighted, rest faint).
    // State honesty (r3): box tint follows the POST-HIT module state from the
    // snapshot's combat roster (moduleStates) — a rack detonated by an
    // EARLIER shell must read red too, exactly like the proxies inside it.
    // This shell's own casualties (modulesHit) are the fallback for staged /
    // legacy snapshots that carry no roster.
    const modHit = new Map();
    for (const m of ev.modulesHit) modHit.set(m.module, m.newState);
    const crewHit = new Set(ev.crewHit);
    const effState = (name) => {
      const s = (snap.moduleStates && snap.moduleStates[name]) || modHit.get(name);
      return s === 'red' || s === 'yellow' ? s : null;
    };
    const anchors = new Map(); // labelKey -> anchor object
    pb.obstacles = []; // module/crew boxes as label-repulsion obstacles
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
      // r8: un-hit boxes draw NO outline at all — even at the r6 whisper
      // alpha the straight EdgesGeometry lattice read as raw debug box edges
      // on the hull rear (critic). WT draws none: identity lives in the
      // organ shapes + micro tags; bright outlines stay reserved for hit /
      // destroyed modules and crew casualties. The (invisible) seg is kept
      // as the label anchor its chips project from.
      if (mat === S.edgeDim) seg.visible = false;
      if (fillMat) {
        if (key === 'm:trackL' || key === 'm:trackR') {
          // Destroyed/damaged TRACK tint as tread segments (r6 minor): one
          // box fill across the ~7 m run painted the whole hull side as a
          // flat salmon slab. A row of slats inside the same module AABB —
          // gaps at track-link pitch — reads as the track itself while the
          // red edge outline still owns the full module footprint.
          const n = Math.max(5, Math.min(12, Math.round(sz / 0.55)));
          const segL = (sz / n) * 0.62;
          const slatGeo = new THREE.BoxGeometry(sx * 0.96, sy * 0.9, segL);
          pb.disposables.push(slatGeo);
          for (let i = 0; i < n; i++) {
            const slat = new THREE.Mesh(slatGeo, fillMat);
            slat.position.set(seg.position.x, seg.position.y,
              bb.min[2] + (i + 0.5) * (sz / n));
            parent.add(slat);
          }
        } else {
          const fill = new THREE.Mesh(boxGeo, fillMat);
          fill.position.copy(seg.position);
          parent.add(fill);
        }
      }
      // obstacle record for the screen-space label repulsion pass (r3):
      // local corners now, world corners once poses are final (below).
      // r4: keyed — projectLabels re-anchors each chip's dot/leader to the
      // screen-projected centroid of ITS OWN module rect (anchor fidelity).
      const corners = [];
      for (let i = 0; i < 8; i++) {
        corners.push(new THREE.Vector3(
          i & 1 ? bb.max[0] : bb.min[0],
          i & 2 ? bb.max[1] : bb.min[1],
          i & 4 ? bb.max[2] : bb.min[2],
        ));
      }
      pb.obstacles.push({ parent, corners, key: key || null });
      if (key && !anchors.has(key)) anchors.set(key, seg);
    };
    for (const mb of armor.modules || []) {
      const state = effState(mb.module);
      const mat = state === 'red' ? S.edgeRed : state === 'yellow' ? S.edgeYellow : S.edgeDim;
      const fill = state === 'red' ? S.fillRed : state === 'yellow' ? S.fillYellow : null;
      // every module box anchors (hit ones get damage chips, idle key
      // internals get always-on micro-labels — WT-style AMMO/ENGINE/FUEL)
      addBox(mb, `m:${mb.module}`, mat, fill);
    }
    for (const cb of armor.crew || []) {
      const hit = crewHit.has(cb.crew);
      // always keyed (r6): near-miss chips anchor to un-hit crew boxes too
      addBox(cb, `c:${cb.crew}`, hit ? S.edgeCrew : S.edgeDim, hit ? S.fillCrew : null);
    }

    // 3b. recognizable internals inside the boxes — ammo stowage (bustle /
    // carousel / WWII tray per spec layout + era), ribbed engine block, fuel
    // cell or drums, breech, crew capsules. Healthy modules wear distinct
    // per-kind hues (brass ammo, steel-blue engine, amber fuel); hit ones
    // override to yellow (damaged) / red (destroyed) state tints.
    const specEra = (snap.targetEnt && snap.targetEnt.spec && snap.targetEnt.spec.era) || '';
    // defensive proxy clamp (r2): internals may never protrude through the
    // hull silhouette — hull-local volumes are intersected with the spec's
    // own dims box before geometry is built (turret-local boxes ride the
    // turret frame and stay authored). No-op for spec-conform layouts.
    const specDims = snap.targetEnt && snap.targetEnt.spec ? snap.targetEnt.spec.dims : null;
    const clampBB = (bb) => {
      if (!specDims || bb.turretLocal) return bb;
      const hx = specDims.widthM / 2 + 0.03;
      const hz = (specDims.hullLengthM || specDims.overallLengthM * 0.8) / 2 + 0.08;
      const hy = specDims.heightM + 0.05;
      const min = [Math.max(bb.min[0], -hx), Math.max(bb.min[1], -0.05), Math.max(bb.min[2], -hz)];
      const max = [Math.min(bb.max[0], hx), Math.min(bb.max[1], hy), Math.min(bb.max[2], hz)];
      if (min[0] >= max[0] || min[1] >= max[1] || min[2] >= max[2]) return bb;
      return { ...bb, min, max };
    };
    // victim's own gun caliber sizes its ammo proxies (r6, best-effort)
    let victimCalMm = 0;
    try {
      const sh0 = snap.targetEnt.spec.gun.shells[0];
      victimCalMm = (sh0 && sh0.caliberMm) || 0;
    } catch (_) { victimCalMm = 0; }
    for (const mb of armor.modules || []) {
      addModuleProxy(clampBB(mb), proxMatForState(effState(mb.module)),
        poseGrp, turretGrp, pb.disposables, specEra, victimCalMm);
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
    const nearMiss = []; // spall-brushed but undamaged internals (labeled in 5)
    if (ev.localPos && ev.localDir) {
      const lp = new THREE.Vector3().fromArray(ev.localPos);
      const ld = new THREE.Vector3().fromArray(ev.localDir).normalize();
      // deepest damaged module/crew center along the internal ray (hull frame)
      const tyaw = pose.turretYaw || 0;
      const tc = Math.cos(tyaw);
      const ts = Math.sin(tyaw);
      let deepest = 0;
      /** Module/crew box center in the HULL frame (turret boxes rotated). */
      const centerOf = (bb, out) => {
        const cx = (bb.min[0] + bb.max[0]) / 2;
        const cyy = (bb.min[1] + bb.max[1]) / 2;
        const cz = (bb.min[2] + bb.max[2]) / 2;
        if (bb.turretLocal) { // turret frame -> hull frame
          return out.set(
            cx * tc + cz * ts + armor.turretPivot[0],
            cyy + armor.turretPivot[1],
            -cx * ts + cz * tc + armor.turretPivot[2],
          );
        }
        return out.set(cx, cyy, cz);
      };
      const depthOf = (bb) => centerOf(bb, _a).sub(lp).dot(ld);
      for (const m of ev.modulesHit) {
        const bb = (armor.modules || []).find((b) => b.module === m.module);
        if (bb) deepest = Math.max(deepest, depthOf(bb));
      }
      for (const c of ev.crewHit) {
        const bb = (armor.crew || []).find((b) => b.crew === c);
        if (bb) deepest = Math.max(deepest, depthOf(bb));
      }
      const innerLen = Math.max(1.2, (ev.caliberMm || 100) * 10 / 1000 + 0.6, deepest + 0.35);
      // NEAR-MISS pass (r6 minor): a clean pen with no module/crew casualties
      // left the 7 s hold telling no story beyond the −HP tag. Record the
      // un-hit internals whose boxes the spall cone geometrically brushes —
      // the SAME lp/ld/armor boxes the cone render and causal streaks use,
      // so nothing is invented — and dim-label them 'NEAR MISS' in step 5.
      // No damage is implied: the chips take the demoted gray 'ok' tier.
      if (ev.kind === 'pen' || ev.kind === 'he_pen') {
        const spallTan = 0.26; // rendered cone opens at r=0.24·len (+ margin)
        const consider = (bb, kkey, klabel) => {
          centerOf(bb, _a).sub(lp);
          const along = _a.dot(ld);
          if (along < 0.12 || along > innerLen + 0.3) return;
          _b.copy(ld).multiplyScalar(along);
          const radial = _a.sub(_b).length();
          const half = ((bb.max[0] - bb.min[0]) + (bb.max[1] - bb.min[1])
            + (bb.max[2] - bb.min[2])) / 6; // mean half-extent
          const reach = along * spallTan + 0.12;
          if (radial - half < reach) nearMiss.push({ key: kkey, label: klabel, score: radial - half });
        };
        for (const mb of armor.modules || []) {
          // tracks are external gear; the turret RING encircles the whole
          // basket — 'brushed' is near-universally true on any turret-area
          // pen and its box coincides with the gun's in screen space (the
          // chip clipped behind GUN on the live probe). Both stay silent.
          if (mb.module === 'trackL' || mb.module === 'trackR'
            || mb.module === 'turretRing') continue;
          if (modHit.has(mb.module)) continue;
          consider(mb, `m:${mb.module}`, MODULE_LABEL[mb.module] || mb.module);
        }
        for (const cb of armor.crew || []) {
          if (crewHit.has(cb.crew)) continue;
          if (crewAlive && crewAlive[cb.crew] === false) continue; // earlier casualty — red proxy tells that
          consider(cb, `c:${cb.crew}`, CREW_LABEL[cb.crew] || cb.crew);
        }
        nearMiss.sort((a, b) => a.score - b.score);
        nearMiss.length = Math.min(nearMiss.length,
          (ev.modulesHit.length + ev.crewHit.length) >= 3 ? 2 : 3);
      }
      // external approach: the last meters into the plate. r4 rework — the
      // old single 4.5 m tube was a uniform thick rod that hard-cut at the
      // frame edge; on the staged Tiger it read as a beam rising OUT OF THE
      // GROUND at the lower-left corner. The approach is now (a) terrain-
      // lifted: the tail is shortened until it clears the ground line by
      // ~0.7 m, and (b) tapered + tier-faded over its far ~65%: radius ramps
      // toward the plate and the far half drops to the faint far-tier
      // materials, so the beam reads as a tracer ARRIVING and simply fades
      // where it leaves frame instead of anchoring to the terrain.
      {
        poseGrp.updateMatrixWorld(true);
        const lpW = poseGrp.localToWorld(lp.clone());
        const ldW = ld.clone().transformDirection(poseGrp.matrixWorld);
        let APP = 5.2;
        if (heightField) {
          for (; APP > 1.6; APP -= 0.4) {
            const wy = lpW.y - ldW.y * APP;
            if (wy > heightField.getHeightAt(
              lpW.x - ldW.x * APP, lpW.z - ldW.z * APP) + 0.7) break;
          }
        }
        const sa = new THREE.Vector3();
        const sb = new THREE.Vector3();
        const SEGS = 4;
        for (let i = 0; i < SEGS; i++) {
          const t0 = i / SEGS;          // 0 at the tail, 1 at the plate
          const t1 = (i + 1) / SEGS;
          sa.copy(lp).addScaledVector(ld, -APP * (1 - t0));
          sb.copy(lp).addScaledVector(ld, -APP * (1 - t1));
          const tm = (t0 + t1) / 2;
          const far = tm < 0.55;
          tube(sa, sb, (0.009 + 0.026 * tm) * rQ,
            far ? S.trailGlowFar : S.trailGlow, poseGrp, pb.disposables);
          tube(sa, sb, (0.004 + 0.012 * tm) * rQ,
            far ? S.trailCoreFar : S.pathOut, poseGrp, pb.disposables);
        }
      }
      // internal penetration channel, carried to the deepest damaged module.
      // r5 rework ('fat glowing baton with a bulbous white sphere at the
      // tip'): a TAPERED long-rod dart — widest at the breach, needling down
      // toward the deepest component — finished with a small cone tip instead
      // of a terminal glow ball. Radii sit ~55% under the old baton and scale
      // with the solved orbit radius so the dart stays legible on big hulls.
      _b.copy(lp).addScaledVector(ld, innerLen);
      const dart = (r0, r1, mat) => {
        const g = new THREE.CylinderGeometry(r1, r0, innerLen, 8, 1, true);
        pb.disposables.push(g);
        const m = new THREE.Mesh(g, mat);
        m.position.copy(lp).addScaledVector(ld, innerLen * 0.5);
        m.quaternion.setFromUnitVectors(_Y, ld);
        poseGrp.add(m);
      };
      dart(0.048 * rQ, 0.024 * rQ, S.pathIn);   // hot sheath
      dart(0.021 * rQ, 0.01 * rQ, S.pathCore);  // white-hot core
      // cone tip at the deepest component hit — the dart's point, no bulb
      const tipG = new THREE.ConeGeometry(0.024 * rQ, 0.16 * rQ, 8);
      pb.disposables.push(tipG);
      const tip = new THREE.Mesh(tipG, S.pathCore);
      tip.position.copy(_b).addScaledVector(ld, 0.08 * rQ);
      tip.quaternion.setFromUnitVectors(_Y, ld);
      poseGrp.add(tip);
      // spall cone: apex at the penetration point, opening along the path
      const coneLen = innerLen * 0.8;
      const coneGeo = new THREE.ConeGeometry(coneLen * 0.24, coneLen, 14, 1, true);
      pb.disposables.push(coneGeo);
      const cone = new THREE.Mesh(coneGeo, S.spall);
      cone.position.copy(lp).addScaledVector(ld, coneLen * 0.5);
      cone.quaternion.setFromUnitVectors(_Y, _s.copy(ld).negate());
      poseGrp.add(cone);
      // deterministic fragment rays fanned inside the cone (short, dim —
      // ambient spall texture; the CAUSAL streaks below carry the story)
      const side = new THREE.Vector3().crossVectors(ld, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      const norm = new THREE.Vector3().crossVectors(ld, side);
      for (let i = 0; i < 6; i++) {
        const az = (i / 6) * Math.PI * 2 + 0.45;
        const spread = 0.15 + 0.12 * (((i * 37) % 5) / 4);
        const len = innerLen * (0.28 + 0.34 * (((i * 53) % 7) / 6));
        _a.copy(ld)
          .addScaledVector(side, Math.cos(az) * spread)
          .addScaledVector(norm, Math.sin(az) * spread)
          .normalize();
        _b.copy(lp).addScaledVector(_a, len);
        tube(lp, _b, 0.018, S.frag, poseGrp, pb.disposables);
      }
      // CAUSAL fragment cone (r3, WT's signature read): thin streaks opening
      // from the penetration point to EVERY module / crew slot this shell's
      // resolved payload damaged, so the kill's cause is told by geometry,
      // not only by the text chips. Streak tier follows the sim state — red
      // (destroyed) hottest and thickest, yellow warm, an 'ok' graze dim —
      // and red/yellow components get a terminal spark where the streaks
      // land. Endpoints come from the same armor boxes the sim rolled
      // against; nothing here is invented.
      {
        const fs = new THREE.Vector3();
        const fn = new THREE.Vector3();
        const fd = new THREE.Vector3();
        const fe = new THREE.Vector3();
        const fc = new THREE.Vector3();
        const fragTo = (bb, mat, n, r, spark) => {
          centerOf(bb, fc);
          const L = Math.max(0.5, fc.distanceTo(lp));
          fd.copy(fc).sub(lp).multiplyScalar(1 / L);
          fs.crossVectors(fd, UP);
          if (fs.lengthSq() < 1e-6) fs.set(1, 0, 0); else fs.normalize();
          fn.crossVectors(fd, fs);
          for (let k = 0; k < n; k++) {
            // deterministic jitter (no rng — staged captures must repeat)
            const j1 = ((k * 73 + 31) % 17) / 16 - 0.5;
            const j2 = ((k * 41 + 7) % 13) / 12 - 0.5;
            const len = L * (0.86 + 0.3 * (((k * 53) % 5) / 4));
            fe.copy(fd)
              .addScaledVector(fs, j1 * 0.24)
              .addScaledVector(fn, j2 * 0.24)
              .normalize()
              .multiplyScalar(len)
              .add(lp);
            tube(lp, fe, k === 0 ? r * 1.35 : r, mat, poseGrp, pb.disposables);
          }
          if (spark) {
            const sGeo = new THREE.SphereGeometry(0.075, 8, 6);
            pb.disposables.push(sGeo);
            const sm = new THREE.Mesh(sGeo, mat);
            sm.position.copy(fc);
            poseGrp.add(sm);
          }
        };
        for (const m of ev.modulesHit) {
          const bb = (armor.modules || []).find((b) => b.module === m.module);
          if (!bb) continue;
          const mat = m.newState === 'red' ? S.fragRed
            : m.newState === 'yellow' ? S.fragYellow : S.frag;
          fragTo(bb, mat, m.newState === 'red' ? 4 : 3,
            m.newState === 'red' ? 0.026 : 0.019,
            m.newState === 'red' || m.newState === 'yellow');
        }
        for (const c of ev.crewHit) {
          const bb = (armor.crew || []).find((b) => b.crew === c);
          if (bb) fragTo(bb, S.fragCrew, 3, 0.019, true);
        }
      }
      // entry marker halved (r5: the 0.1 m ball read as a bulb on the dart)
      const mGeo = new THREE.SphereGeometry(0.05 * rQ, 10, 8);
      pb.disposables.push(mGeo);
      const marker = new THREE.Mesh(mGeo, S.marker);
      marker.position.copy(lp);
      poseGrp.add(marker);
    }
    poseGrp.updateMatrixWorld(true);
    // finalize label-repulsion obstacles: world-space corners (static for the
    // whole hold — only the camera moves, so projection happens per frame)
    for (const ob of pb.obstacles) {
      for (const c of ob.corners) ob.parent.localToWorld(c);
      ob.parent = null;
    }

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
    const addLabel = (world, color, main, sub, big, ok, key) => {
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
      pb.labels.push({
        label, dot, line, big: !!big, world: world.clone(), key: key || null,
      });
    };
    /** Idle micro-label (no dot/leader): WT-style always-on internals tag. */
    const addMicro = (world, text, key) => {
      const label = el('div', 'cot-kc-micro', d.labelHost);
      label.textContent = text;
      pb.labels.push({
        label, dot: null, line: null, big: false, micro: true,
        world: world.clone(), key: key || null,
      });
    };
    /**
     * Near-miss tag (r8): the old gray damage-chip language (dot + leader +
     * two-line chip) read as a damaged-module callout at a glance and one
     * clipped against the hull top edge on the live Abrams replay (critic).
     * Rendered as a dashed one-line tag that sits ON its organ like the
     * micro identity tags — always inside the silhouette, never straddling
     * its edge — visibly informational, never a casualty.
     */
    const addNearMiss = (world, text, key) => {
      const label = el('div', 'cot-kc-label nm', d.labelHost);
      label.innerHTML = `${text}<span class="s"> · near miss</span>`;
      pb.labels.push({
        label, dot: null, line: null, big: false, micro: true,
        world: world.clone(), key: key || null,
      });
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
        `${MOD_STATE_WORD[m.newState] || 'HIT'}${dmgTxt}`, false, ok, `m:${m.module}`);
    }
    for (const c of ev.crewHit) {
      const seg = anchors.get(`c:${c}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addLabel(_p, '#ff7d8a', CREW_LABEL[c] || c, 'KNOCKED OUT', false, false, `c:${c}`);
    }
    // ENTRY-PLATE chip (r6 minor): the struck zone is ALWAYS annotated at the
    // penetration point — a clean pen with no module/crew casualties used to
    // hold 7 s with nothing but the −HP tag. Zone / plate thickness / outcome
    // word all come straight off the payload (zone, physicalMm, kind).
    if (ev.zone && ev.localPos) {
      const KIND_WORD = {
        pen: 'PENETRATED', he_pen: 'PENETRATED', ricochet: 'RICOCHET',
        nonpen: 'NO PENETRATION', era: 'STOPPED BY ERA',
        spaced_absorb: 'ABSORBED', screen_pierce: 'PASSED THROUGH',
        he_splash: 'SPLASH',
      };
      const mm = (ev.physicalMm || 0) > 0 ? ` · ${Math.round(ev.physicalMm)} mm` : '';
      _p.set(ev.pos[0], ev.pos[1], ev.pos[2]);
      addLabel(_p, '#ffb04a', zoneLabel(ev.zone),
        `${KIND_WORD[ev.kind] || 'HIT'}${mm}`, false, false, null);
    }
    // near-miss chips (r6 minor, collected in step 4): internals the spall
    // cone brushed but the sim left untouched — demoted gray tier, so they
    // can never read as casualties next to the yellow/red damage chips.
    for (const nm of nearMiss) {
      const seg = anchors.get(nm.key);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addNearMiss(_p, nm.label, nm.key);
    }
    if ((ev.damage || 0) > 0) {
      _p.set(ev.pos[0], ev.pos[1], ev.pos[2]);
      addLabel(_p, '', `−${Math.round(ev.damage)} HP`, '', true);
    }
    // idle micro-labels on the key internals the eye needs to identify
    const MICRO = { ammoRack: 'AMMO', engine: 'ENGINE', fuelTank: 'FUEL' };
    for (const key of Object.keys(MICRO)) {
      if (modHit.has(key)) continue; // hit ones already carry a damage chip
      if (nearMiss.some((n) => n.key === `m:${key}`)) continue; // NEAR MISS chip owns it
      const seg = anchors.get(`m:${key}`);
      if (!seg) continue;
      seg.getWorldPosition(_p);
      addMicro(_p, MICRO[key], `m:${key}`);
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
    let vcy = h * 0.5; // victim's projected screen y (label side preference)
    if (dom && pb.xcam) {
      _proj.copy(pb.xcam.center).project(camera);
      dom.root.style.setProperty('--kcvx', `${((_proj.x * 0.5 + 0.5) * 100).toFixed(1)}%`);
      dom.root.style.setProperty('--kcvy', `${((-_proj.y * 0.5 + 0.5) * 100).toFixed(1)}%`);
      vcy = (-_proj.y * 0.5 + 0.5) * h;
    }
    // pass 0 (r4): project every module/crew box to a screen rect once —
    // these feed BOTH the repulsion pass (2b) and the per-key ANCHOR rects:
    // each chip's dot/leader snaps to the projected centroid of its OWN
    // module's rect instead of the box's 3D center point, whose projection
    // drifted onto neighbouring assemblies (the AMMO RACK chip's leader
    // ended near the turret ring while the orange bin sat mid-hull).
    const maxArea = 0.18 * w * h;
    const obs = [];
    const anchorRect = new Map(); // obstacle key -> screen rect
    if (pb.obstacles) {
      for (const ob of pb.obstacles) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        let behind = false;
        for (const c of ob.corners) {
          _proj.copy(c).project(camera);
          if (_proj.z > 1) { behind = true; break; }
          const sx = (_proj.x * 0.5 + 0.5) * w;
          const sy = (-_proj.y * 0.5 + 0.5) * h;
          if (sx < x0) x0 = sx;
          if (sx > x1) x1 = sx;
          if (sy < y0) y0 = sy;
          if (sy > y1) y1 = sy;
        }
        if (behind) continue;
        const area = (x1 - x0) * (y1 - y0);
        // full-length track bands exceed the cap in both roles: undodgeable
        // as obstacles, and their rect centroid says nothing about the hit
        if (ob.key && !anchorRect.has(ob.key) && area <= maxArea * 1.4) {
          anchorRect.set(ob.key, { x0, y0, x1, y1 });
        }
        if (area <= maxArea) obs.push({ x0, y0, x1, y1 });
      }
    }
    // pass 1: project anchors, compute each chip's desired rect. r4 side
    // preference: chips whose module sits in the LOWER half of the victim
    // hang BELOW their dot — a mid-hull ammo bin's chip no longer floats
    // above the turret where it read as a turret-ammo callout.
    for (const it of pb.labels) {
      _proj.copy(it.world).project(camera);
      it.hidden = _proj.z > 1;
      if (it.hidden) continue;
      it.ax = (_proj.x * 0.5 + 0.5) * w;
      it.ay = (-_proj.y * 0.5 + 0.5) * h;
      const ar = it.key ? anchorRect.get(it.key) : null;
      if (ar) {
        it.ax = (ar.x0 + ar.x1) / 2;
        it.ay = (ar.y0 + ar.y1) / 2;
      }
      it.lw = it.label.offsetWidth || 60;
      it.lh = it.label.offsetHeight || 18;
      it.left = it.ax - it.lw / 2;
      it.below = !it.big && !it.micro && it.ay > vcy + 6;
      // micro tags sit right on their component (no leader line); chips
      // float above (lower-hull modules: below) their dot; the big damage
      // number hangs below the impact
      it.top = it.big ? it.ay + 14
        : it.micro ? it.ay - it.lh / 2
          : it.below ? it.ay + 26 : it.ay - 30 - it.lh;
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
    // pass 2b: module-geometry repulsion (r3 — the AMMO RACK chip sat ON the
    // ammo shells it labeled). Chips slide UP along their leader lines until
    // clear of any projected module/crew box they intersect, capped at ~130px
    // of lift so a chip never orphans from its dot (huge rects like the
    // full-length track bands are undodgeable anyway — the near-opaque chip
    // plates keep text legible there). The big damage numeral and the micro
    // identity tags are exempt: the numeral belongs AT the impact point (its
    // r3 backing plate carries legibility over any fill — dodging the
    // track-band rect flung it to the screen bottom), micro tags sit on
    // their organ by design.
    if (obs.length) {
      for (let sweep = 0; sweep < 2; sweep++) {
        for (const it of pb.labels) {
          if (it.hidden || it.micro || it.big) continue;
          const minTop = it.ay - 30 - it.lh - 130; // lift cap: dot stays close
          const maxTop = it.ay + 26 + 130;         // drop cap (below-side chips)
          for (const r of obs) {
            if (it.left < r.x1 + 4 && r.x0 < it.left + it.lw + 4 &&
                it.top < r.y1 + 3 && r.y0 < it.top + it.lh + 3) {
              // dodge AWAY from the hull on the chip's own side (r4): below-
              // side chips slide further down, above-side chips further up —
              // repulsion may never flip a chip back across the silhouette
              it.top = it.below
                ? Math.min(maxTop, r.y1 + 8)
                : Math.max(minTop, r.y0 - it.lh - 8);
            }
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
      // r8 frame-safe clamp: a chip anchored high (raised barrel tip, tall
      // AA mount) could slide under the top letterbox bar and clip (the
      // live Abrams GUN tag, critic) — labels stay inside the letterboxed
      // picture area whatever the anchor projection does.
      if (!it.big) {
        it.top = Math.min(Math.max(it.top, h * 0.095), h * 0.885 - it.lh);
      }
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
    // late-attached meshes (async GLB kit deferral) join the ghost skin the
    // frame they arrive — see the r3 note at pb.ghostSkin
    if (pb.ghostSkin) pb.ghostSkin();
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
      // PRE-WRECK RESTAGE release: re-apply the wreck look the replay
      // temporarily lifted (must run AFTER the ghost-material restore above —
      // setDestroyed lazily captures current materials for the rematch
      // restore, and it must capture the LIVE ones, never the ghost).
      // Settled pose + cooled embers: by replay end the destruction is old.
      if (pb.rewreck && pb.snap.targetEnt && pb.snap.targetEnt.visual) {
        const vis = pb.snap.targetEnt.visual;
        vis.setDestroyed({ pop: pb.rewreck.pop, ageS: 12 });
        for (const m of pb.rewreck.brokenTracks) vis.setTrackState(m, true);
        if (vis.stripEra) for (const pl of pb.rewreck.eraSpent) vis.stripEra(pl);
      }
      if (pb.fxHidden) for (const c of pb.fxHidden) c.visible = true; // FX resume
      if (pb.vegGroup) pb.vegGroup.visible = pb.vegWasVisible; // vegetation back
      // backdrop light dim released — exact pre-x-ray intensities back (r4)
      if (pb.dimmedLights) for (const [L, i] of pb.dimmedLights) L.intensity = i;
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
    // release the css-level HUD veil (counterpart of begin()'s stamp)
    document.body.classList.remove('cot-kc-live');
    const done = pb ? pb.onDone : null;
    pb = null;
    active = false;
    staged = false;
    if (runCallback && done) done();
    // REPORT GATE: release — emitted on natural finish, skip AND cancel alike
    // so a buffered battle report can never be lost with the replay. Emitted
    // AFTER onDone so the integration end-overlay (.cot-end) already exists
    // when shotInfo's report renders and pins its footer to it.
    if (busRef) busRef.emit('killcam:done', {});
  }

  return api;
}
