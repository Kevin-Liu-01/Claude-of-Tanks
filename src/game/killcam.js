/**
 * killcam.js — War Thunder-class kill camera (integration-owned module).
 *
 * CAPTURE: state.ts calls `game.killcam.recordSimStep(game)` every fixed step
 * (shell trajectory points) and `game.killcam.onShellHit(ev, target)` for every
 * resolved HitEvent (clearly-marked KILL-CAM sections there). Everything shown
 * during a replay comes from those snapshots — shooter/target poses, the full
 * trajectory, and the sim-resolved HitEvent (zone, nominal/effective armor,
 * rolls, modules/crew, ammo-rack flag). Nothing is recomputed and nothing
 * reads live AI state during playback.
 *
 * PLAYBACK (main.ts drives it at battle end):
 *  -1. WRECK (killcam r2, death view only, freshKill flag): the player died
 *      THIS moment and the battle is decided — before any replay chrome
 *      moves the camera away, a live-action hold (~2.2 s) keeps the frame on
 *      the player's own tank while the REAL destruction plays out at sim
 *      rate: fx fireball/debris/smoke stay visible and the killcam itself
 *      advances the victim's turret-pop/burn timelines (the sim/visual sync
 *      loop is frozen during replays). Mid-battle deaths get the same beat
 *      OUTSIDE the killcam (main.ts death beat — full-volume audio), so this
 *      phase self-gates on the freshness flag.
 *   0. APPROACH (death view only, killcam_endscreen r1) — eased push-in
 *      orbit from the player's live death view to the killer's position,
 *      landing exactly on the flight chase-cam's first pose (no cuts). A
 *      shock flash + sliding letterbox + staggered chrome open the replay;
 *      a screen-space grade (desaturate + vignette) ramps over the death
 *      view. Exit is a letterbox close + fade-through-black into whatever
 *      follows (ally spectate / end screen), with scene teardown at black.
 *   1. FLIGHT — tracer chase along the captured trajectory from the
 *      killer's muzzle to the victim, at normal replay speed ramping to
 *      ~0.25x slow-mo through the final meters into the penetration.
 *   1b. IMPACT (killcam r2, owner: "show the actual animations of popping
 *      turrets and exploding, especially during kill cam"): the moment the
 *      tracer reaches the plate, the kill plays out LIVE before any
 *      analysis — detonation flash, fx fireball/debris/smoke re-fired on
 *      the restaged victim, the turret-pop arc tumbling at full rate with a
 *      brief ~0.55x dilation through the launch (fx clock scaled via
 *      main.ts), the camera pushed out and eased back onto the x-ray
 *      vantage. Ammo-rack kills toss the turret (pop 1.0), plain kills jolt
 *      it (pop 0.22) — same setDestroyed grammar as live play, GLB and
 *      procedural alike. Emits 'killcam:impact' {cause,pos,timeScale} on the
 *      bus as the additive audio seam for the replayed cinematic blast.
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
 *   3. FINALE (killcam r3, OWN DEATHS ONLY — owner: "shows the tank as it was
 *      before it blew up with the turret still attached, then the skeleton
 *      with shell going through, and then us blowing up and turret coming off
 *      again"): when the player is the victim the IMPACT beat above is
 *      RE-ORDERED to play AFTER the x-ray. The analysis layer is torn down
 *      first (endXrayDressing — ghost skin, veil, internals, chips, light dim
 *      and vegetation hide all released, so nothing phantom survives over the
 *      fireball), then the exact same impact beat runs and exits to the
 *      results. Phase order per replay direction:
 *        own death, shell kill : [wreck] approach [flight] xray impact exit
 *        own death, burn-out   : [wreck] xray exit           (no rack pop —
 *                                the cook-off already played live)
 *        player kill / staged  : approach flight impact xray exit  (r2 order)
 *
 * The camera is driven exclusively through rig.setExternalPose (the rig's
 * external-pose API) — the rig is used, never modified.
 */
import * as THREE from 'three';
import { FONT_STACK, FONT_COND, ensureFonts } from '../ui/fonts.ts';
import { createElement as el, ensureStyle } from '../ui/dom.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { nominalPenFor, shellDisplayName, zoneLabel } from '../ui/hitEventFormat.ts';
import { MODULE_LABEL, CREW_LABEL } from '../ui/moduleRegistry.ts';
import { getSpec } from '../vehicles/specs.js';
import { iconUrl } from '../ui/icons.ts';
import { tierNumeral } from '../ui/battleLoad.ts';
import { isKillcamGhostSurface } from './killcamGhostPolicy.ts';
import {
  addInternalCrewModel,
  addInternalDrivetrainModel,
  addInternalModuleModel,
} from '../vehicles/internalAnatomyVisuals.js';
import {
  alignReplayPoseToShot, captureReplayPose, createReplayFlightTimeline,
  replayDistanceAtTime, replayStateFromPose,
} from './replayPose.ts';

const XRAY_HOLD_S = 7.0;
const FLIGHT_MIN_S = 1.9;
const FLIGHT_MAX_S = 3.4;
// killcam_endscreen r1 — death-sequence cinematography constants:
// APPROACH: eased push-in orbit from the player's live death view toward the
// killer before the shot replays (no cuts — the camera lands EXACTLY on the
// flight chase cam's first pose). SLOWMO: the flight runs at normal replay
// speed and ramps to ~0.25x through the final meters into the penetration
// (WT death-cam retime). EXIT: letterbox close + fade-through-black into
// whatever follows (spectate / end screen).
const APPROACH_S = 1.6;        // push-in orbit duration
const SLOWMO_RATE = 0.25;      // terminal speed factor at the plate
const SLOWMO_START_M = 44;     // ramp begins this far from impact
const SLOWMO_FULL_M = 13;      // fully slow by here
const CONTACT_HOLD_S = 0.12;   // one readable armor-contact beat before impact
const EXIT_HOLD_MS = 430;      // letterbox close + fade-to-black duration
const KILLER_CARD_AT_S = 0.85; // killer card reveal into the x-ray hold
// killcam r2 — live-action destruction beats:
// WRECK: battle-deciding own death — hold on the real exploding wreck before
// the replay (covers fireball 1.1 s + the turret arc ~1.3 s).
// IMPACT: destruction re-fired at the tracer's arrival, measured in
// ANIMATION seconds (the fx clock dilates to IMPACT_SLOWMO through the
// launch window, so the wall window runs ~2.6-2.8 s).
// XRAY BUDGET: shotInfo's buffered battle report force-flushes at 16 s — the
// x-ray hold gives back whatever the live beats spent so the exit fade always
// lands first (floor 4 s keeps the analysis readable).
const WRECK_HOLD_S = 2.15;
const IMPACT_HOLD_S = 2.05;
const IMPACT_SLOWMO = 0.55;     // fx-clock rate through the turret launch
const IMPACT_DRIFT_RAD_S = 0.06; // impact-beat orbital drift (parallax)
const REPLAY_BUDGET_S = 15.0;   // begin() -> exit start, wall clock
// killcam r3 — OWN-DEATH FINALE (owner: "our tank blows up turret pops sure.
// but then it shows kill cam, and shows the tank as it was before it blew up
// with the turret still attached, then the skeleton with shell going through,
// and then us blowing up and turret coming off again"): when the PLAYER is
// the victim the destruction beat moves BEHIND the x-ray, so the replay reads
// restaged-intact approach -> skeleton -> blow up again. FINAL BLOW replays
// (we killed someone) keep the r2 order: impact, then analysis.
const FINALE_HOLD_S = 2.45;      // finale window in ANIM seconds (beat + settle)
const FINALE_RESERVE_S = 3.2;    // wall seconds reserved out of REPLAY_BUDGET_S
const FINALE_XRAY_FLOOR_S = 3.6; // x-ray floor while a finale still has to play
const TRAJ_KEEP = 32;          // shell traces retained (oldest evicted)
const TRAJ_MAX_PTS = 400 * 3;  // ≥ SHELL_MAX_LIFETIME_S at 60 Hz
const ORBIT_RAD_S = 0.05;      // x-ray camera drift
const VICTORY_WINDOW_S = 1.0;  // final blow must be this fresh at battle end

const KC_MODULE_ICON = Object.freeze({
  trackL: 'track', trackR: 'track', engine: 'engine', transmission: 'transmission',
  fuelTank: 'fuelTank', ammoRack: 'ammoRack', gun: 'gun', gunMount: 'gunMount',
  radio: 'radio', optics: 'optics', turretRing: 'turretRing', autoloader: 'autoloader',
  feedSystem: 'feedSystem', missileRack: 'missileRack',
});
const KC_CREW_ICON = Object.freeze({
  commander: 'crewCommander', gunner: 'crewGunner', driver: 'crewDriver', loader: 'crewLoader',
});

function killcamLabelIcon(key, fallback = 'penetration') {
  if (!key) return fallback;
  if (key.startsWith('m:')) return KC_MODULE_ICON[key.slice(2)] || 'repair';
  if (key.startsWith('c:')) return KC_CREW_ICON[key.slice(2)] || 'crew';
  return fallback;
}

const UP = new THREE.Vector3(0, 1, 0);

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

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

// MODULE_LABEL / CREW_LABEL come from ui/moduleRegistry.ts (single source).

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
// DOM overlay (letterbox + title + annotation block + projected labels)
// ---------------------------------------------------------------------------
const KC_CSS = `
.cot-kc{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;isolation:isolate;
  --kc-panel:rgba(7,12,16,.95);--kc-panel-hi:rgba(17,25,31,.96);
  --kc-line:rgba(139,158,173,.3);--kc-line-soft:rgba(139,158,173,.16);
  --kc-muted:#8b9aa6;--kc-text:#e7eef4;--kc-amber:#f2a536;--kc-red:#f05b50;
  font-family:${FONT_STACK};color:var(--kc-text);}
.cot-kc.on{display:block;}
.cot-kc *{box-sizing:border-box;margin:0;padding:0;}
.cot-kc svg{display:block;flex:0 0 auto;}
/* REPLAY OWNS THE SCREEN (r4 critical): while a replay is live, no battle-HUD
   chrome may render over the cinematic — a one-frame race in the integration
   flyby edge-latch (main.ts snapshots kcActive at frame top, the death path
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
.cot-kc-micro{position:absolute;z-index:8;display:flex;align-items:center;gap:5px;white-space:nowrap;
  background:linear-gradient(135deg,rgba(17,25,31,.92),rgba(6,10,14,.94));
  border:1px solid var(--kc-line);border-left:2px solid #86a9bf;color:#b8d3e4;padding:2px 6px 3px;
  font-family:${FONT_COND};font-weight:700;font-size:9px;
  letter-spacing:.14em;text-transform:uppercase;line-height:1.2;
  box-shadow:0 4px 12px rgba(0,0,0,.38);}
.cot-kc-bart,.cot-kc-barb{position:absolute;left:0;right:0;height:9vh;}
.cot-kc-bart{top:0;border-bottom:1px solid rgba(242,165,54,.18);
  background:repeating-linear-gradient(90deg,transparent 0 63px,rgba(139,158,173,.035) 64px),
    linear-gradient(180deg,rgba(1,4,6,.98),rgba(3,7,10,.78) 70%,transparent);}
.cot-kc-barb{bottom:0;border-top:1px solid rgba(242,165,54,.16);
  background:repeating-linear-gradient(90deg,transparent 0 63px,rgba(139,158,173,.03) 64px),
    linear-gradient(0deg,#010304 38%,rgba(3,7,10,.82) 68%,transparent);}
/* ENTRY / EXIT TRANSITIONS (killcam_endscreen r1): the replay never pops in a
   single frame. Entry: the letterbox bars SLIDE shut while title/annot/skip
   fade-slide in staggered behind them (.in); a shock flash (.cot-kc-flash)
   synced to the killing hit whites the frame for ~120 ms and decays. Exit:
   the bars grow to swallow the frame (.out) under a body-level
   fade-through-black (.cot-kc-fadeblk — appended to <body> so it outlives
   the root teardown happening BEHIND it, and z-80 so nothing pops over it).
   Staged harness frames (.now) hard-disable every timeline so captures stay
   deterministic. cancel() strips all of these classes — tested explicitly. */
.cot-kc .cot-kc-bart,.cot-kc .cot-kc-barb{
  transition:transform .5s cubic-bezier(.2,.8,.25,1),height .42s cubic-bezier(.55,.06,.75,.4);}
.cot-kc .cot-kc-bart{transform:translateY(-102%);}
.cot-kc .cot-kc-barb{transform:translateY(102%);}
.cot-kc.in .cot-kc-bart,.cot-kc.in .cot-kc-barb{transform:none;}
.cot-kc.out .cot-kc-bart,.cot-kc.out .cot-kc-barb{height:51vh;
  background:#000;transform:none;}
.cot-kc .cot-kc-title{opacity:0;transform:translate(-50%,-8px);
  transition:opacity .45s ease .28s,transform .45s ease .28s;}
.cot-kc.in .cot-kc-title{opacity:1;transform:translate(-50%,0);}
.cot-kc .cot-kc-skip{opacity:0;transition:opacity .5s ease .85s;}
.cot-kc.in .cot-kc-skip{opacity:1;}
.cot-kc .cot-kc-annot{transition:opacity .5s ease .5s,transform .5s ease .5s;
  opacity:0;transform:translateY(10px);}
.cot-kc.in .cot-kc-annot{opacity:1;transform:none;}
.cot-kc.out .cot-kc-title,.cot-kc.out .cot-kc-annot,.cot-kc.out .cot-kc-skip,
.cot-kc.out .cot-kc-killer,.cot-kc.out .cot-kc-label,.cot-kc.out .cot-kc-micro,
.cot-kc.out .cot-kc-dot,.cot-kc.out .cot-kc-dmg,.cot-kc.out .cot-kc-leader{
  opacity:0 !important;transition:opacity .24s ease !important;}
.cot-kc.now *{transition:none !important;animation:none !important;}
.cot-kc.now .cot-kc-title{opacity:1;transform:translate(-50%,0);}
.cot-kc.now .cot-kc-skip{opacity:1;}
.cot-kc.now .cot-kc-annot{opacity:1;transform:none;}
.cot-kc-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;}
.cot-kc-flash.go{animation:cotKcFlash .36s cubic-bezier(.2,.6,.5,1) forwards;}
@keyframes cotKcFlash{0%{opacity:.94;}33%{opacity:.5;}100%{opacity:0;}}
/* DEATH-VIEW GRADE (killcam_endscreen r1): subtle desaturation + vignette
   ramp over the whole death replay — screen-space only (the post chain is
   not this module's), ramped by CSS opacity so cancel() cleanly restores. */
.cot-kc-grade{position:absolute;inset:0;pointer-events:none;opacity:0;
  transition:opacity 1.2s ease;
  -webkit-backdrop-filter:saturate(.62) contrast(1.05);
  backdrop-filter:saturate(.62) contrast(1.05);
  background:radial-gradient(ellipse 80% 70% at 50% 50%,rgba(0,0,0,0) 50%,
    rgba(6,8,11,.34) 84%,rgba(4,6,9,.5) 100%);}
.cot-kc.grade .cot-kc-grade{opacity:1;}
.cot-kc-fadeblk{position:fixed;inset:0;z-index:80;background:#000;opacity:0;
  pointer-events:none;transition:opacity .42s ease;}
.cot-kc-fadeblk.in{opacity:1;}
.cot-kc-fadeblk.lift{transition:opacity .34s ease;}
/* KILLER CARD (killcam_endscreen r1): who killed you — name, vehicle, shell,
   damage, distance — revealed during the x-ray hold in the Inter/amber HUD
   language. Right side; the armor annotation block owns the left. */
.cot-kc-killer{position:absolute;z-index:9;right:28px;bottom:11.5vh;width:282px;
  background:linear-gradient(145deg,var(--kc-panel-hi),var(--kc-panel) 62%,rgba(5,8,11,.97));
  border:1px solid var(--kc-line);border-right:3px solid var(--kc-red);
  box-shadow:0 16px 38px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.035);
  padding:0 12px 10px;opacity:0;
  transform:translateY(12px);transition:opacity .55s ease,transform .55s ease;
  display:none;}
.cot-kc-killer.on{display:block;}
.cot-kc-killer.rv{opacity:1;transform:none;}
.cot-kc-killer .kk{display:flex;align-items:center;gap:7px;padding:8px 0 6px;
  border-bottom:1px solid var(--kc-line-soft);font-family:${FONT_COND};font-weight:800;font-size:8px;
  letter-spacing:.26em;color:#ff8d83;text-transform:uppercase;}
.cot-kc-killer .kk svg{color:var(--kc-red);filter:drop-shadow(0 0 5px rgba(240,91,80,.48));}
.cot-kc-killer .nm{margin-top:7px;font-weight:800;font-size:14.5px;
  letter-spacing:.01em;color:#f4f8fc;display:flex;align-items:center;gap:8px;}
.cot-kc-killer .nm .sil{width:50px;height:24px;flex:0 0 auto;padding:2px;
  background-repeat:no-repeat;background-position:center;background-size:contain;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.7));
  border:1px solid var(--kc-line-soft);background-color:rgba(139,158,173,.045);}
.cot-kc-killer .nm .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.cot-kc-killer .nm .t i{display:block;font-style:normal;font-family:${FONT_COND};
  font-weight:700;font-size:9px;letter-spacing:.16em;color:#9fb0bf;
  text-transform:uppercase;margin-top:1px;}
.cot-kc-killer .rows{margin-top:7px;display:grid;grid-template-columns:1fr 1fr;
  gap:3px 12px;border-top:1px solid var(--kc-line-soft);padding-top:6px;}
.cot-kc-killer .kv{display:flex;justify-content:space-between;font-size:10.5px;
  color:var(--kc-muted);font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-kc-killer .kv>span,.cot-kc-kv>span{display:flex;align-items:center;gap:5px;}
.cot-kc-killer .kv>span svg,.cot-kc-kv>span svg{color:#71818d;}
.cot-kc-killer .kv b{color:#ffd9a0;font-weight:700;font-family:${FONT_COND};
  letter-spacing:-.01em;}
.cot-kc-killer .kv.dmg b{color:#ffd166;font-size:12px;}
.cot-kc-killer .kv.w{grid-column:1/-1;}
.cot-kc-title{position:absolute;z-index:10;top:1.3vh;left:50%;min-width:330px;
  transform:translateX(-50%);text-align:center;padding:7px 28px 8px;
  background:linear-gradient(90deg,transparent,rgba(6,11,15,.88) 18%,rgba(12,18,23,.94) 50%,rgba(6,11,15,.88) 82%,transparent);
  border-bottom:1px solid rgba(242,165,54,.28);}
.cot-kc-title::before,.cot-kc-title::after{content:"";position:absolute;bottom:-1px;width:48px;height:1px;
  background:var(--kc-amber);opacity:.78;}
.cot-kc-title::before{left:16px;}.cot-kc-title::after{right:16px;}
.cot-kc-title .tl{display:flex;align-items:center;justify-content:center;gap:8px;}
.cot-kc-title .tl svg{color:var(--kc-amber);filter:drop-shadow(0 0 7px rgba(242,165,54,.26));}
.cot-kc-title .t{font-family:${FONT_COND};font-weight:800;
  font-size:15px;letter-spacing:.42em;color:#ffd59b;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.cot-kc-title .s{font-family:${FONT_COND};font-size:9.5px;font-weight:700;
  letter-spacing:.16em;color:#9fadb8;margin-top:3px;text-transform:uppercase;
  font-variant-numeric:tabular-nums;}
.cot-kc-skip{position:absolute;z-index:10;bottom:1.4vh;right:28px;display:flex;align-items:center;
  gap:8px;font-family:${FONT_COND};font-weight:700;font-size:8px;letter-spacing:.18em;
  color:#83919c;text-transform:uppercase;}
.cot-kc-skip .ico{color:#a7b3bd;}
.cot-kc-skip kbd{min-width:58px;padding:3px 6px 4px;border:1px solid var(--kc-line);
  border-bottom-color:rgba(242,165,54,.5);background:rgba(13,20,25,.85);color:#c9d3db;
  font:800 8px/1 ${FONT_COND};letter-spacing:.13em;text-align:center;}
.cot-kc-annot{position:absolute;z-index:9;left:28px;bottom:11.5vh;width:300px;
  background:linear-gradient(145deg,var(--kc-panel-hi),var(--kc-panel) 62%,rgba(5,8,11,.97));
  border:1px solid var(--kc-line);border-left:3px solid var(--kc-amber);
  box-shadow:0 16px 38px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.035);padding:0 0 9px;}
.cot-kc-annot .hd{padding:7px 11px 6px;border-bottom:1px solid var(--kc-line-soft);}
.cot-kc-annot .hd .m{display:flex;align-items:center;gap:6px;margin-bottom:3px;
  font-family:${FONT_COND};font-size:7px;font-weight:800;letter-spacing:.2em;color:#8796a1;text-transform:uppercase;}
.cot-kc-annot .hd .m svg{color:var(--kc-amber);}
.cot-kc-annot .shellrow{display:flex;align-items:center;gap:7px;}
.cot-kc-annot .shellrow>svg{color:#ffd49a;}
.cot-kc-annot .hd .k{font-family:${FONT_COND};font-weight:800;
  font-size:12.5px;letter-spacing:.08em;color:#ffd49a;}
.cot-kc-annot .hd .w{font-size:9.5px;color:#bcc8d1;margin-top:2px;letter-spacing:.03em;}
.cot-kc-rows{padding:6px 11px 0;display:grid;grid-template-columns:1fr 1fr;gap:3px 13px;}
.cot-kc-kv{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--kc-muted);
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
.cot-kc-banner{margin:7px 11px 0;padding:4px 8px;text-align:center;display:none;
  font-family:${FONT_COND};font-weight:800;font-size:11px;
  letter-spacing:.18em;color:#ff8a7d;border:1px solid rgba(240,91,80,.55);
  border-left:3px solid var(--kc-red);background:linear-gradient(90deg,rgba(111,24,18,.42),rgba(62,15,12,.26));}
.cot-kc-banner.on{display:flex;align-items:center;justify-content:center;gap:7px;}
.cot-kc-labelhost{position:absolute;z-index:8;inset:0;overflow:hidden;}
.cot-kc-label{position:absolute;white-space:nowrap;display:flex;align-items:center;gap:7px;
  background:linear-gradient(135deg,rgba(18,26,32,.94),rgba(5,9,12,.96));
  border:1px solid var(--kc-line);border-left:2px solid currentColor;padding:4px 8px 5px;
  font-family:${FONT_COND};font-weight:800;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;line-height:1.25;
  box-shadow:0 7px 18px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.025);}
.cot-kc-label .ico,.cot-kc-micro .ico{display:flex;align-items:center;color:currentColor;}
.cot-kc-label .copy{display:block;min-width:0;}
.cot-kc-label .main{display:block;}
.cot-kc-label .s{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  color:#e8f0f6;font-variant-numeric:tabular-nums;}
.cot-kc-label.ok{color:#8a97a3;border-color:var(--kc-line);border-left-color:currentColor;
  background:linear-gradient(135deg,rgba(16,22,27,.82),rgba(5,8,11,.86));
  box-shadow:0 4px 12px rgba(0,0,0,.34);font-weight:700;}
.cot-kc-label.ok .s{color:#7d8a96;font-weight:600;}
/* r8 near-miss tier (critic: the gray chip language read as a damaged-module
   callout): dashed border, smaller caps, one line, no leader dot — sits ON
   its organ like the micro identity tags, so it can never straddle the hull
   silhouette edge. Informational, never a casualty. */
.cot-kc-label.nm{color:#9fb0bf;border:1px dashed rgba(150,166,180,.48);border-left:2px solid #758896;
  background:rgba(7,12,16,.82);box-shadow:0 4px 12px rgba(0,0,0,.3);font-weight:700;font-size:9.5px;
  letter-spacing:.11em;padding:2px 6px 3px;opacity:.85;}
.cot-kc-label.nm .copy{display:flex;align-items:center;}
.cot-kc-label.nm .s{display:inline;font-size:9.5px;font-weight:600;color:#788695;}
.cot-kc-dot{position:absolute;z-index:8;width:8px;height:8px;border-radius:1px;
  transform:translate(-50%,-50%) rotate(45deg);background:currentColor;box-shadow:0 0 10px currentColor;}
.cot-kc-dot.ok{background:rgba(7,12,16,.8);border:1.5px solid currentColor;box-shadow:none;}
.cot-kc-dmg{position:absolute;z-index:8;display:flex;align-items:center;gap:7px;font-family:${FONT_COND};
  font-weight:800;font-size:25px;color:#ffd166;
  letter-spacing:.045em;text-shadow:0 2px 12px rgba(0,0,0,.9);font-variant-numeric:tabular-nums;
  background:linear-gradient(135deg,rgba(22,27,28,.96),rgba(7,11,14,.96));
  border:1px solid var(--kc-line);border-right:3px solid var(--kc-amber);
  box-shadow:0 9px 22px rgba(0,0,0,.52);padding:10px 10px 5px;line-height:1.1;}
.cot-kc-dmg::before{content:"DAMAGE";position:absolute;top:3px;right:9px;font:800 6.5px/1 ${FONT_COND};
  letter-spacing:.2em;color:#8f9ca6;text-align:right;}
.cot-kc-dmg .ico{color:var(--kc-amber);}
.cot-kc-leader{position:absolute;z-index:7;inset:0;width:100%;height:100%;overflow:visible;}
.cot-kc-flash{z-index:12;}
`;

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
 *   getPlayer:() => ?object, getEntity?:(id:string) => ?object}} deps injected by integration (main.ts)
 * @returns {object} killcam API
 */
export function createKillCam(deps) {
  const { scene, camera, rig, heightField, getPlayer } = deps;
  const getEntity = deps.getEntity
    || ((id) => (typeof window !== 'undefined' && window.__DEBUG && window.__DEBUG.game
      && window.__DEBUG.game.tankById ? window.__DEBUG.game.tankById.get(id) : null));
  // World access for the flight LOS solve (r6 major): terrain/prop raycast +
  // the vegetation concealment discs the spotting sim itself uses. Prefer an
  // injected getter (docs/GUNNERY-CAMERA-SPEC.md wires main.ts to
  // pass `getWorld: () => world`); fall back to the debug handle so the fix
  // is live before the integration dep lands. Resolved lazily per replay —
  // the world object is REPLACED on every map switch.
  const getWorld = deps.getWorld
    || (() => (typeof window !== 'undefined' && window.__DEBUG ? window.__DEBUG.world : null));
  // FX system access (killcam r2): the IMPACT beat re-fires the real
  // destruction sequence (fx.destruction — fireball, debris, smoke column)
  // on the restaged victim. Injected by main.ts (getFx); the debug handle is
  // the pre-integration fallback, and a missing fx system only mutes the
  // particle side of the beat (the turret pop still plays off the visual).
  const getFx = deps.getFx
    || (() => (typeof window !== 'undefined' && window.__DEBUG ? window.__DEBUG.fx : null));

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
    ensureStyle('cot-kc-style', KC_CSS);
    const root = el('div', 'cot-kc');
    document.body.appendChild(root);
    el('div', 'cot-kc-grade', root); // death-view desat + vignette (class 'grade')
    el('div', 'cot-kc-veil', root); // x-ray backdrop dim (class 'xr' on root)
    el('div', 'cot-kc-bart', root);
    el('div', 'cot-kc-barb', root);
    const title = el('div', 'cot-kc-title', root);
    const titleLine = el('div', 'tl', title);
    const titleIcon = el('span', 'ico', titleLine);
    titleIcon.innerHTML = uiIconSVG('autoAim', 13);
    const titleT = el('div', 't', titleLine);
    const titleS = el('div', 's', title);
    const skip = el('div', 'cot-kc-skip', root);
    const skipIcon = el('span', 'ico', skip);
    skipIcon.innerHTML = uiIconSVG('chevronRight', 10);
    const skipKey = el('kbd', '', skip);
    skipKey.textContent = 'ANY KEY';
    const skipText = el('span', '', skip);
    skipText.textContent = 'Skip replay';
    const annot = el('div', 'cot-kc-annot', root);
    const hd = el('div', 'hd', annot);
    const hdMeta = el('div', 'm', hd);
    hdMeta.innerHTML = `${uiIconSVG('battleRecord', 10)}<span>Ballistic analysis</span>`;
    const shellRow = el('div', 'shellrow', hd);
    const shellIcon = el('span', 'ico', shellRow);
    shellIcon.innerHTML = uiIconSVG('shell', 12);
    const hdK = el('div', 'k', shellRow);
    const hdW = el('div', 'w', hd);
    const rows = el('div', 'cot-kc-rows', annot);
    const banner = el('div', 'cot-kc-banner', annot);
    banner.innerHTML = `${uiIconSVG('ammoRack', 11)}<span>AMMO RACK DETONATION</span>`;
    // killer card (death view only — populated per replay in beginXray)
    const killer = el('div', 'cot-kc-killer', root);
    killer.innerHTML = `<div class="kk">${uiIconSVG('skull', 10)}<span>Destroyed by</span></div>` +
      '<div class="nm"><span class="sil"></span><span class="t"><span class="n"></span><i class="v"></i></span></div>' +
      '<div class="rows"></div>';
    const killerRefs = {
      root: killer,
      sil: killer.querySelector('.sil'),
      name: killer.querySelector('.n'),
      veh: killer.querySelector('.v'),
      rows: killer.querySelector('.rows'),
    };
    // shock flash last — it must paint over every overlay child
    const flash = el('div', 'cot-kc-flash', root);
    // leader-line layer sits under the label chips
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'cot-kc-leader');
    root.appendChild(leader);
    const labelHost = el('div', 'cot-kc-labelhost', root);
    dom = {
      root, title, titleT, titleS, skip, hdK, hdW, rows, banner, annot,
      labelHost, leader, flash, killer: killerRefs,
    };
    return dom;
  }

  // body-level fade-through-black for the exit transition — appended lazily,
  // torn down by clearExit()/cancel() so a mid-transition cancel can never
  // strand a black frame over the game.
  let fadeEl = null;
  let exitTimers = [];
  function ensureFade() {
    if (!fadeEl) {
      fadeEl = el('div', 'cot-kc-fadeblk');
      document.body.appendChild(fadeEl);
    }
    return fadeEl;
  }
  function clearExit() {
    for (const t of exitTimers) clearTimeout(t);
    exitTimers.length = 0;
    if (fadeEl) { fadeEl.remove(); fadeEl = null; }
  }

  function resetDomPresentation() {
    if (dom) {
      dom.root.classList.remove('on', 'xr', 'in', 'out', 'grade', 'now');
      dom.flash.classList.remove('go');
      dom.killer.root.classList.remove('on', 'rv');
      dom.labelHost.textContent = '';
      dom.leader.textContent = '';
    }
    document.body.classList.remove('cot-kc-live');
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
      // The killer is a live scene tank, so playback must restage its exact
      // shot-time hull/turret/gun pose too. Without this the frozen visual
      // showed whatever direction the AI turned after firing.
      attackerEnt: rec ? rec.attackerEnt : null,
      attackerPose: rec && rec.attackerPose ? { ...rec.attackerPose, pos: rec.attackerPose.pos.slice() } : null,
      muzzle: rec ? rec.muzzle.slice() : null,
      shotDir: rec ? rec.dir.slice() : null,
      muzzleVelocityMps: rec ? rec.velocityMps : 0,
      firedTimeS: rec ? rec.timeS : 0,
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
        const attackerEnt = getEntity ? getEntity(p.shooterId) : null;
        const attackerPose = attackerEnt && attackerEnt.state
          ? alignReplayPoseToShot(captureReplayPose(attackerEnt.state), p.dir, attackerEnt.spec)
          : null;
        traj.set(p.shellId, {
          pts: [p.muzzlePos[0], p.muzzlePos[1], p.muzzlePos[2]],
          muzzle: p.muzzlePos.slice(),
          dir: p.dir.slice(),
          velocityMps: Number(p.velocityMps) || 0,
          timeS: Number(p.timeS) || 0,
          attackerEnt,
          attackerPose,
        });
      });
      bus.on('shell:expired', (p) => traj.delete(p.shellId));
      bus.on('ui:battleStart', () => {
        traj.clear();
        pendingDeath = pendingVictory = lastHitOnPlayer = null;
        api.cancel();
        spectate.stop(false); // fresh battle never inherits an ally chase
      });
      // SPECTATE lifecycle: the chase ends the moment the battle is decided
      // (the end flow takes the camera) or the phase leaves battle (garage).
      bus.on('battle:ended', () => spectate.stop(true));
      // Pointer/touch controls in the HUD use the same controller as A/D and
      // arrow keys, so the on-screen keycaps are real controls instead of
      // decorative hints. cycle() is a no-op outside spectator mode.
      bus.on('spectate:cycle', (p) => spectate.cycle(p?.direction < 0 ? -1 : 1));
      bus.on('phase:change', (p) => {
        if (!p || p.phase !== 'battle') {
          spectate.stop(true);
          api.cancel();
          return;
        }
        // killcam r2: entering battle clears stale lethal chains through
        // EVERY entry path. The garage flow also emits ui:battleStart
        // (handled above), but debug/probe battles (__DEBUG.startBattle)
        // skip it — a previous battle's pendingDeath then seeded a replay
        // whose targetEnt belonged to a retired roster (stale visual, wrong
        // map pose).
        traj.clear();
        pendingDeath = pendingVictory = lastHitOnPlayer = null;
      });
    },

    /**
     * Called by state.ts once per fixed sim step: append live shell positions
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
     * Called by state.ts for every resolved HitEvent (KILL-CAM capture hook).
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
     * @param {{freshKill?:boolean}} [opts] killcam r2: freshKill marks a
     *   battle-deciding death that happened THIS tick — the replay opens
     *   with the live WRECK hold (the real destruction plays on screen
     *   before the cinematic). Mid-battle deaths get their live beat from
     *   main.ts instead and never set it.
     * @returns {boolean} true if a replay started (caller defers the overlay)
     */
    playForResult(result, timeS, onDone, opts) {
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
      if (!snap || !snap.targetEnt || !snap.targetEnt.visual) {
        // NO-REPLAY DEATH (killcam_endscreen r1): the player died without a
        // captured lethal chain (no hit ever recorded — pure ram/edge cases).
        // The caller falls back to its death cam immediately; the spectate
        // handover still applies when the battle continues. Deferred a tick
        // so the caller's fallback (rig.startDeathCam) runs first — the
        // controller's rig.startSpectate then supersedes it exactly like the
        // replay exit path. maybeStart() self-gates on result/phase/allies.
        if (result === 'defeat') setTimeout(() => spectate.maybeStart(), 80);
        return false;
      }
      begin(snap, kind, onDone, xrayOnly, !!(opts && opts.freshKill));
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
      // Deterministic capture: hard-disable the entry transition timelines
      // (.now kills every transition/animation and pins final states) — the
      // shot harness grabs the frame ~1.2 s after set(), and a bar mid-slide
      // or a half-faded title would smear across captures.
      if (dom) {
        dom.root.classList.add('now');
        dom.flash.classList.remove('go');
        if (pb && pb.isDeathView) dom.killer.root.classList.add('rv');
      }
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
      // The staged capture reveals the killer card after beginXray's first
      // projection. Re-project once with that card visible so screenshots
      // exercise the same reserved-space layout as a live replay frame.
      projectLabels();
    },

    /** @returns {boolean} a replay (or staged frame) is on screen */
    isActive() { return active; },

    /**
     * Hard cleanup — used by __SHOTS.set and battle restarts. Immediate: no
     * exit choreography, and any in-flight exit fade/timers are revoked so a
     * mid-transition cancel can never strand the black frame, the veil or
     * the letterbox (clearExit + the class strip in teardown).
     */
    cancel() {
      clearExit();
      if (active) finish(false);
      else resetDomPresentation();
    },

    /** SPECTATE introspection/driving for probes (active, targetId, cycle). */
    get spectate() { return spectate; },

    /**
     * Advance the replay one render frame (drives camera + labels).
     * @param {number} dt render delta seconds
     */
    update(dt) {
      if (!active || !pb || staged) return;
      if (pb.phase === 'wreck') updateWreck(dt);
      else if (pb.phase === 'approach') updateApproach(dt);
      else if (pb.phase === 'flight') updateFlight(dt);
      else if (pb.phase === 'contact') updateContact(dt);
      else if (pb.phase === 'impact') updateImpact(dt);
      else if (pb.phase === 'xray') updateXray(dt);
      else if (pb.phase === 'exit'
          && performance.now() - (pb.exitWallMs || 0) > EXIT_HOLD_MS + 120) {
        // Wall-clock timers are the primary exit driver, but embedded/background
        // Chromium can discard a timer while rAF continues. The visual update
        // is a second independent clock so a replay can never strand its opaque
        // fade over a still-running battle.
        completeExit();
      }
      // 'exit': the closing letterbox + fade own the screen — camera holds
      // its last x-ray pose; wall-clock timers drive the handover (beginExit)
    },

    /** Debug/testing introspection. */
    get phase() { return pb ? pb.phase : null; },
    get replayInfo() {
      if (!pb) return null;
      const attacker = pb.snap.attackerEnt;
      const root = attacker && attacker.visual ? attacker.visual.root : null;
      return {
        phase: pb.phase,
        attackerId: attacker ? attacker.id : null,
        attackerPose: pb.snap.attackerPose ? pb.snap.attackerPose.pos.slice() : null,
        attackerRenderedPos: root ? root.position.toArray() : null,
        barrelDot: pb.barrelDot,
        muzzle: pb.replayMuzzle ? pb.replayMuzzle.toArray() : null,
        pathStart: pb.pts && pb.pts.length ? pb.pts[0].toArray() : null,
        projectile: pb.core ? pb.core.position.toArray() : null,
        impact: pb.pts && pb.pts.length ? pb.pts[pb.pts.length - 1].toArray() : null,
        flightElapsedS: pb.t,
        flightDurationS: pb.dur,
        flightDistM: pb.flightDist,
        flightTotalM: pb.total,
        contactElapsedS: pb.contactT,
      };
    },

    /**
     * Fx-clock scale for THIS frame (killcam r2): main.ts multiplies the
     * shared fx dt by it, dilating the whole destruction — particles, blast
     * light, timers AND the visual's pop/burn timelines (they age on the
     * same clock) — to ~0.55x through the impact beat's turret launch.
     * 1 in every other phase and outside replays.
     */
    get fxTimeScale() {
      return active && pb && !staged && pb.phase === 'impact'
        ? impactRate(pb.it) : 1;
    },

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
    // click-to-skip stays at every stage: wreck/approach/flight jump to the
    // x-ray payoff (beginXray restages + re-hides fx from any live beat),
    // x-ray starts the exit. A second skip DURING the exit is ignored — the
    // 0.4 s close is already the fastest path out, and re-entering beginExit
    // would double-arm the handover timers.
    // killcam r3: the impact beat now sits on BOTH sides of the x-ray. The
    // r2 beat (player kills) still skips forward into the analysis; the
    // own-death FINALE is the last thing before the results, so it skips
    // straight out. Skipping the x-ray itself cancels a pending finale —
    // "get me out" must never route through another 3 s of cinematic — and
    // teardown() re-applies the settled wreck, so the victim still ends up
    // destroyed however early the skip lands.
    if (pb.phase === 'wreck' || pb.phase === 'approach' || pb.phase === 'flight' || pb.phase === 'contact') {
      beginXray();
    } else if (pb.phase === 'impact') {
      if (pb.isFinale) beginExit();
      else beginXray();
    } else if (pb.phase === 'xray') {
      pb.finalePending = false;
      beginExit();
    }
  }

  function begin(snap, kind, onDone, xrayOnly, freshKill) {
    const d = ensureDom();
    sharedMats();
    active = true;
    staged = false;
    lastBeginWallMs = performance.now();
    // REPORT GATE (r6 critical): announce that the replay owns the screen.
    // state.ts emits battle:ended in the same JS task begin() runs in, and
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
      ghostSeen: null,
      ghostVis: null, ghostSkin: null, // re-assertable skin pass (r3)
      labels: [],
      obstacles: null, // module/crew box screen rects (label repulsion, r3)
      pts: null, cum: null, total: 0, dur: 0, segIdx: 0,
      flightLift: null, // per-sample camera lift (flight LOS solve, r6)
      flightDist: 0, flightTimeline: null, // refresh-rate invariant retime
      contactT: 0, contactDir: null, // readable shell-on-armor transition
      app: null, // death-sequence push-in approach state
      isDeathView: false, // player is the victim (grade + killer card + approach)
      killerShown: false,
      core: null, streak: null, trailGeo: null,
      halo: null, tail: null, shellLight: null, muzzleLight: null,
      xcam: null,
      fxGroup: null, fxHidden: null,
      vegGroup: null, vegWasVisible: true,
      dimmedLights: null, // x-ray backdrop light dim, restored in finish (r4)
      rewreck: null, // wreck look to re-apply in finish() (pre-wreck restage)
      snapPoseState: null, // snapshot pose as a syncFromState-shaped object
      attackerPoseState: null, // shot-time killer pose (restored on teardown)
      attackerRestore: null, // visibility/wreck state lifted for the replay
      replayMuzzle: null, barrelDot: null, // launch-fidelity diagnostics
      wreck: null,   // killcam r2: live WRECK hold state (fresh own death)
      it: 0, itWall: 0, // killcam r2: IMPACT beat clocks (anim / wall)
      impactVis: null,  // victim visual driven through the impact beat
      xrayAng0: 0,      // orbit angle inherited from the impact drift
      xrayHoldS: XRAY_HOLD_S, // trimmed by beginXray to the replay budget
      // killcam r3 own-death finale: the destruction beat plays AFTER the
      // x-ray. finalePending arms the re-order (cleared once it fires or a
      // skip cancels it), isFinale marks the beat currently running as the
      // closing one (exit instead of x-ray), impactAng0 carries the orbit
      // azimuth in from whichever phase handed the beat the camera.
      finalePending: false, isFinale: false, impactAng0: 0,
    };
    pb.group.name = 'killcam';
    scene.add(pb.group);
    pb.fxGroup = scene.getObjectByName('fx') || null;

    // Header/view direction resolved FIRST (killcam r2 — the wreck hold
    // below gates on it). Header branches on the REPLAY DIRECTION, not just
    // the caller's kind param (r5): the staged harness frame runs
    // begin(kind='death') on a player-scored kill and titled it 'KILL CAM /
    // destroyed by <your own tank>' — your kill phrased like your death.
    // victim==player keeps the death phrasing; killer==player reads
    // 'FINAL BLOW / <victim> destroyed'.
    const ev = snap.ev;
    const pEnt = getPlayer();
    const playerIsVictim = !!(pEnt
      && ((ev.targetId != null && ev.targetId === pEnt.id) || snap.targetEnt === pEnt));
    const playerKill = kind === 'victory'
      || (!playerIsVictim && !!(pEnt && ev.attackerId != null && ev.attackerId === pEnt.id));
    pb.isDeathView = playerIsVictim;

    // snapshot pose in syncFromState shape — shared by the pre-wreck restage,
    // the impact beat's per-frame drive and the x-ray re-restage (killcam r2)
    {
      const p0 = snap.pose;
      pb.snapPoseState = {
        pos: new THREE.Vector3(p0.pos[0], p0.pos[1], p0.pos[2]),
        yaw: p0.yaw, visualPitch: p0.pitch, visualRoll: p0.roll,
        turretYaw: p0.turretYaw, gunPitch: p0.gunPitch,
        yawRate: 0, speed: 0, trackScroll: { l: 0, r: 0 },
      };
    }
    restageAttacker();
    // wreck-look bookkeeping for finish() — computed whether or not the
    // restage runs now (the WRECK hold defers it, see restageIntact)
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
      }
    }

    // OWN-DEATH FINALE GATE (killcam r3): the destruction re-plays AFTER the
    // x-ray only when the PLAYER is the victim and a SHELL actually killed
    // them. Requirements, all three load-bearing:
    //   isDeathView — FINAL BLOW replays keep the r2 order (impact first);
    //   !xrayOnly   — a burn-out death's captured shell only LIT the fire, so
    //                 a replayed rack pop would be a lie (and its cook-off
    //                 already played live in the wreck hold / death beat);
    //   rewreck     — the victim's visual is genuinely wrecked, which is what
    //                 lets teardown() own the final look after the beat.
    pb.finalePending = !!(pb.isDeathView && !xrayOnly && pb.rewreck
      && snap.ev.destroyed);

    // WRECK HOLD ELIGIBILITY (killcam r2): a battle-deciding own death whose
    // destruction is still playing on the live visual — the replay opens on
    // it instead of hiding it. Everything the hold defers (fx suppression +
    // pre-wreck restage) is applied at its handover (endWreck) or by
    // beginXray's safety net on skip.
    const wreckHold = !!(freshKill && pb.isDeathView && pb.rewreck);

    if (!wreckHold) {
      // Suppress live battle FX for the replay (r2 critique: the victim's
      // death fireball/smoke rendered ON TOP of the x-ray ghost, and the
      // dying shell's neon tracer afterglow cut a bloomed beam across the
      // frame) — re-shown for the IMPACT beat, hidden again for the x-ray.
      hideFx();
      // PRE-WRECK RESTAGE (r2 major): the replay shows the moment of the
      // hit, but by the time it plays the victim's visual has already been
      // wrecked (burnt materials, turret settled askew / popped onto the
      // deck, gun drooped). Ghosting THAT produced a turretless slab whose
      // hull no longer aligned with the snapshot-posed module frames (r2
      // evidence). Restore the live visual and re-pose it from the SNAPSHOT
      // state; finish() re-applies the wreck (settled, embers cold) so the
      // death cam afterwards is honest again. The sim/visual sync loop is
      // frozen while the replay runs (main.ts step 5), so nothing overwrites
      // the pose.
      restageIntact();
    }
    d.titleT.textContent = playerKill ? 'FINAL BLOW' : 'KILL CAM';
    d.titleS.textContent = playerKill
      ? `${ev.targetName || 'enemy'} destroyed`
      : `destroyed by ${ev.attackerName || 'enemy fire'}`;
    const cleanName = shellDisplayName(ev);
    d.hdK.textContent = cleanName ? `${ev.shellType || ''} · ${cleanName}` : (ev.shellType || '');
    d.hdW.textContent = `${ev.attackerName || 'Enemy'} → ${ev.targetName || ''}`;
    d.rows.textContent = '';
    const statIcon = {
      Distance: 'scope',
      'Impact angle': 'turretRing',
      Armor: 'shield',
      Damage: 'damage',
      Pen: 'penetration',
      Zone: 'autoAim',
    };
    const kv = (k, v, wide) => {
      const r = el('div', `cot-kc-kv${wide ? ' w' : ''}`, d.rows);
      const ks = el('span', '', r);
      ks.innerHTML = `${uiIconSVG(statIcon[k] || 'battleRecord', 10)}<span>${k}</span>`;
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
    // ±25% RNG. With the additive payload field penRollFreshMm (damage.ts
    // stamps the pre-degradation roll, see docs/GUNNERY-CAMERA-SPEC.md) the row prints the
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
    d.killer.root.classList.remove('on', 'rv');
    // ENTRY TRANSITION (killcam_endscreen r1): the overlay mounts with bars
    // parked off-screen, then a forced reflow arms the .in transitions —
    // bars slide shut, title/annot/skip stagger in behind them. The shock
    // flash fires only on the DEATH view (it is synced to the killing hit;
    // a white-out over your own FINAL BLOW read as taking damage).
    d.root.classList.remove('in', 'out', 'now', 'grade');
    d.root.classList.add('on');
    clearExit(); // never inherit a half-finished exit fade
    void d.root.offsetWidth; // commit the parked bar transforms
    d.root.classList.add('in');
    if (pb.isDeathView) {
      d.root.classList.add('grade'); // desat + vignette ramp (death view)
      d.flash.classList.remove('go');
      void d.flash.offsetWidth;
      d.flash.classList.add('go');
    }
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
        // The replayed shell is born at the RESTAGED rendered muzzle, not at
        // an entity origin or a stale trajectory sample. Normally the delta
        // from the captured muzzle is only millimeters; distributing it down
        // the path keeps imported rigs and synthetic probes smooth while the
        // final point remains the sim-resolved armor contact exactly.
        if (pb.replayMuzzle) {
          const correction = pb.replayMuzzle.clone().sub(pts[0]);
          let rawLen = 0;
          const rawCum = new Float32Array(pts.length);
          for (let i = 1; i < pts.length; i++) {
            rawLen += pts[i].distanceTo(pts[i - 1]);
            rawCum[i] = rawLen;
          }
          if (rawLen > 1e-5) {
            for (let i = 0; i < pts.length - 1; i++) {
              pts[i].addScaledVector(correction, 1 - rawCum[i] / rawLen);
            }
          } else {
            pts[0].copy(pb.replayMuzzle);
          }
        }
        pb.pts = pts;
        pb.cum = new Float32Array(pts.length);
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          acc += pts[i].distanceTo(pts[i - 1]);
          pb.cum[i] = acc;
        }
        pb.total = acc;
        pb.dur = THREE.MathUtils.clamp(1.2 + acc * 0.005, FLIGHT_MIN_S, FLIGHT_MAX_S);
        pb.flightTimeline = createReplayFlightTimeline(pb.total, pb.dur, {
          slowRate: SLOWMO_RATE,
          slowStartM: SLOWMO_START_M,
          slowFullM: SLOWMO_FULL_M,
        });
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
        pb.flightDist = 0;
        // WRECK HOLD (killcam r2): a fresh battle-deciding own death plays
        // out LIVE on screen before the replay — the approach follows it.
        if (wreckHold && beginWreck('approach')) return;
        // DEATH SEQUENCE (killcam_endscreen r1): when the PLAYER is the
        // victim, the replay no longer hard-cuts to the killer's muzzle —
        // an eased push-in orbit carries the camera from the player's live
        // death view to the exact first chase-cam pose, then the shot flies.
        if (pb.isDeathView && beginApproach()) return;
        pb.phase = 'flight';
        updateFlight(0); // solve the first camera frame immediately
        return;
      }
    }
    // no flight (fire death / missing trajectory): the fresh cook-off still
    // gets its live beat before the analytical x-ray (killcam r2, ask d —
    // the burn-out variant: muffled fx, no turret toss, expl_burnout sample)
    if (wreckHold && beginWreck('xray')) return;
    beginXray();
  }

  /**
   * Hide every visible non-light child of the fx group (killcam r2 refactor
   * of the begin()-time suppression): pooled PointLights stay in the
   * renderer's light count (LIGHT-COUNT note), pb.fxHidden accumulates
   * whatever THIS call hid so showFx()/teardown can restore exactly it.
   */
  function hideFx() {
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.setReplaySuppressed) fxs.setReplaySuppressed(true);
    if (!pb || !pb.fxGroup) return;
    if (!pb.fxHidden) pb.fxHidden = [];
    for (const child of pb.fxGroup.children) {
      if (child.isLight || !child.visible) continue;
      child.visible = false;
      pb.fxHidden.push(child);
    }
  }

  /** Restore the fx children hideFx() suppressed (impact beat / teardown). */
  function showFx() {
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.setReplaySuppressed) fxs.setReplaySuppressed(false);
    if (!pb || !pb.fxHidden) return;
    for (const c of pb.fxHidden) c.visible = true;
    pb.fxHidden = null;
  }

  /**
   * Put the shooter back at the firing snapshot and solve the rendered bore
   * against the captured launch direction. The second, visual-space solve is
   * important for imported tanks: their GLB barrel rig may carry a small
   * authored correction that logical turretYaw/gunPitch alone cannot see.
   */
  function restageAttacker() {
    if (!pb || !pb.snap) return;
    const snap = pb.snap;
    const ent = snap.attackerEnt;
    const vis = ent && ent !== snap.targetEnt ? ent.visual : null;
    if (!vis || !snap.attackerPose) return;

    const wasDestroyed = !!(vis.isDestroyed && vis.isDestroyed());
    pb.attackerRestore = {
      wasDestroyed,
      wasVisible: vis.root ? vis.root.visible : true,
    };
    if (wasDestroyed && vis.resetDestroyed) vis.resetDestroyed();
    if (vis.setVisible) vis.setVisible(true);

    const pose = {
      ...snap.attackerPose,
      pos: snap.attackerPose.pos.slice(),
    };
    const shot = snap.shotDir && snap.shotDir.length >= 3
      ? new THREE.Vector3().fromArray(snap.shotDir).normalize() : null;
    if (shot) alignReplayPoseToShot(pose, snap.shotDir, ent.spec);

    const actual = new THREE.Vector3();
    const state = replayStateFromPose(pose);
    // Two iterations converge imported-rig offsets while keeping the hull at
    // the exact recorded world position. Casemates spill out-of-arc yaw into
    // the hull, just as alignReplayPoseToShot does for the initial solve.
    for (let i = 0; i < (shot ? 3 : 1); i++) {
      vis.syncFromState(state, 0);
      if (vis.root) vis.root.updateMatrixWorld(true);
      if (!shot || !vis.gunDirWorld) continue;
      vis.gunDirWorld(actual).normalize();
      const yawErr = wrapPi(Math.atan2(shot.x, shot.z) - Math.atan2(actual.x, actual.z));
      const desiredPitch = Math.atan2(shot.y, Math.hypot(shot.x, shot.z));
      const actualPitch = Math.atan2(actual.y, Math.hypot(actual.x, actual.z));
      let turretYaw = state.turretYaw + yawErr;
      const arc = ent.spec && Number.isFinite(ent.spec.gunArcDeg)
        ? Math.abs(ent.spec.gunArcDeg) * Math.PI / 180 : Infinity;
      if (Math.abs(turretYaw) > arc) {
        const clamped = Math.max(-arc, Math.min(arc, turretYaw));
        state.yaw = wrapPi(state.yaw + turretYaw - clamped);
        turretYaw = clamped;
      }
      state.turretYaw = turretYaw;
      const lo = -Math.abs((ent.spec && ent.spec.gunDepressionDeg) || 90) * Math.PI / 180;
      const hi = Math.abs((ent.spec && ent.spec.gunElevationDeg) || 90) * Math.PI / 180;
      state.gunPitch = Math.max(lo, Math.min(hi,
        state.gunPitch + desiredPitch - actualPitch));
    }
    vis.syncFromState(state, 0);
    if (vis.root) vis.root.updateMatrixWorld(true);
    pb.attackerPoseState = state;
    if (vis.gunMuzzleWorld) {
      pb.replayMuzzle = vis.gunMuzzleWorld(new THREE.Vector3()).clone();
    }
    if (shot && vis.gunDirWorld) {
      vis.gunDirWorld(actual).normalize();
      pb.barrelDot = actual.dot(shot);
    }
  }

  /**
   * RESTAGE INTACT (r2 "pre-wreck restage", extended in killcam r3): put the
   * victim back the way it stood the instant BEFORE the killing hit — turret
   * re-seated on its ring, gun level, paint unburnt, pop/ember timelines
   * cleared — and re-pose it from the SNAPSHOT state, with the damage the
   * tank already carried INTO the hit (broken tracks, spent ERA) re-applied
   * so neither the restage nor the ghost ever under-reports what the sim
   * resolved.
   *
   * killcam r3: IDEMPOTENT and SKIP-SAFE. The r2 version early-returned on a
   * not-currently-wrecked visual, so it silently did nothing exactly where
   * the owner's sequence needs a guarantee ("shows the tank as it was before
   * it blew up with the turret still attached"). Every own-death entry point
   * (begin, the WRECK hold handover, the approach, the x-ray, the finale) can
   * now call it and get the pre-hit victim out, whatever order they run in.
   * It also re-asserts visibility — dying while scoped hides the player's own
   * hull, and the replay must not open on an invisible tank.
   *
   * @param {boolean} [prime] force the pose write even when the victim is
   *   already intact. Re-posing an intact hull is not free — it steps the
   *   sway decay and resets the track-scroll layer, which would perturb the
   *   staged `killcam_xray` screenshot contract (whose victim is a LIVE tank
   *   the harness never wrecks) for no gain. The one caller that needs it
   *   anyway is the finale: syncFromState is also what PRIMES the visual's
   *   fx-clock cursor, and that must happen before any re-wreck (see the
   *   beginImpact note). Left false, an already-intact victim is untouched —
   *   exact r2 parity.
   */
  function restageIntact(prime) {
    const vis = pb && pb.snap.targetEnt && pb.snap.targetEnt.visual;
    if (!vis) return;
    const wrecked = !!(vis.isDestroyed && vis.isDestroyed());
    if (wrecked) vis.resetDestroyed();
    if (vis.setVisible) vis.setVisible(true);
    if (!wrecked && !prime) return;
    vis.syncFromState(pb.snapPoseState, 0);
    if (pb.rewreck) {
      for (const m of pb.rewreck.brokenTracks) vis.setTrackState(m, true);
      if (vis.stripEra) for (const pl of pb.rewreck.eraSpent) vis.stripEra(pl);
    }
  }

  // ---------------------------------------------------------------------------
  // WRECK HOLD (killcam r2) — live-action opening on the player's own fresh
  // wreck: the REAL destruction (state.ts setDestroyed + the tank:destroyed
  // fx/audio that fired this same tick) plays at full rate while the camera
  // eases from the death view onto a slow orbit. The sim/visual sync loop is
  // frozen during replays, so the killcam advances the victim's pop/burn
  // timelines itself (syncFromState rides the shared fx clock).
  // ---------------------------------------------------------------------------
  function beginWreck(next) {
    const ent = pb.snap.targetEnt;
    const vis = ent && ent.visual;
    if (!vis || !vis.isDestroyed || !vis.isDestroyed() || !ent.state) return false;
    camera.getWorldDirection(_d);
    pb.wreck = {
      t: 0,
      next,
      vis,
      ent,
      fromPos: camera.position.clone(),
      fromLook: camera.position.clone().addScaledVector(_d, 26),
      fromFov: camera.fov,
    };
    // the flight dressing waits for the replay proper (mirrors beginApproach)
    for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = false;
    if (pb.shellLight) pb.shellLight.intensity = 0;
    if (pb.muzzleLight) pb.muzzleLight.intensity = 0;
    pb.phase = 'wreck';
    updateWreck(0);
    return true;
  }

  function updateWreck(dt) {
    const w = pb.wreck;
    w.t += dt;
    // destruction timelines advance on the fx clock; pose from the entity's
    // LIVE dead state (visual continuity — the snapshot restage happens at
    // the handover, behind the camera move)
    if (w.ent.state) w.vis.syncFromState(w.ent.state, dt);
    // camera: ease from wherever the player died looking onto a slow wreck
    // orbit (death-cam grammar), azimuth-continuous with the entry pose
    const st = w.ent.state;
    const hM = Math.max(1.6, pb.snap.heightM || 2.4);
    _p.set(st.pos.x, st.pos.y + hM * 0.5, st.pos.z);
    const R = Math.max(11, (pb.snap.boundingRadiusM || 4) * 3.0);
    if (w.az === undefined) {
      w.az = Math.atan2(w.fromPos.x - _p.x, w.fromPos.z - _p.z);
    }
    const az = w.az + 0.16 * w.t;
    _a.set(
      _p.x + Math.sin(az) * R * 0.93,
      _p.y + R * 0.34,
      _p.z + Math.cos(az) * R * 0.93,
    );
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    // look slightly above the hull so the turret toss + fireball crown stay
    // framed through their apogee
    _b.set(_p.x, _p.y + hM * 0.45, _p.z);
    const k = THREE.MathUtils.smoothstep(w.t, 0, 0.9);
    _a.lerpVectors(w.fromPos, _a, k);
    _b.lerpVectors(w.fromLook, _b, k);
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.9;
      if (_a.y < minY) _a.y = minY;
    }
    rig.setExternalPose(_a, _b, w.fromFov + (50 - w.fromFov) * k);
    if (w.t >= WRECK_HOLD_S) endWreck();
  }

  /** Hand the wreck hold over to the replay proper (approach/flight/x-ray). */
  function endWreck() {
    const next = pb.wreck ? pb.wreck.next : 'xray';
    pb.wreck = null;
    hideFx();       // deferred begin()-time suppression (see wreckHold)
    restageIntact();  // deferred pre-wreck restage — the replay shows the hit
    if (next === 'approach') {
      if (pb.isDeathView && beginApproach()) return;
      pb.phase = 'flight';
      updateFlight(0);
      return;
    }
    beginXray();
  }

  /**
   * DEATH-SEQUENCE APPROACH (killcam_endscreen r1): eased push-in orbit from
   * the live camera pose (wherever the player died looking) toward the
   * killer's position, landing EXACTLY on the flight chase-cam's first pose
   * so the whole death sequence is one continuous camera move — no cuts, no
   * teleports. Terrain-aware: the blended path is height-clamped every frame
   * and pre-lifted clear of foliage volumes / props with the same clearance
   * solve the flight LOS pass uses (cameraRig collision grammar, read-only).
   * @returns {boolean} false when no meaningful move exists (skip to flight)
   */
  function beginApproach() {
    // killcam r3 (owner: the replay "shows the tank as it was before it blew
    // up with the turret still attached"): the approach is the first frame of
    // the replay proper, so the victim is guaranteed intact HERE — whatever
    // the entry path (fresh wreck hold handover, mid-battle death beat, a
    // skipped beat). Idempotent, so the earlier begin()/endWreck restages
    // stay exactly as they were.
    restageIntact();
    const toPos = new THREE.Vector3();
    const toLook = new THREE.Vector3();
    flightStartPose(toPos, toLook);
    const fromPos = camera.position.clone();
    // a dead-on-top-of-the-muzzle camera has nothing to push through
    if (fromPos.distanceTo(toPos) < 3) return false;
    camera.getWorldDirection(_d);
    const fromLook = fromPos.clone().addScaledVector(_d, 26);
    // lateral sweep axis: the push curves around rather than dollying straight
    _s.copy(toPos).sub(fromPos);
    _s.y = 0;
    const flat = _s.length();
    const side = new THREE.Vector3();
    if (flat > 1e-3) side.crossVectors(_s.multiplyScalar(1 / flat), UP);
    pb.app = {
      t: 0,
      dur: APPROACH_S,
      fromPos,
      fromLook,
      fromFov: camera.fov,
      toPos,
      toLook,
      side,
      sideAmt: THREE.MathUtils.clamp(flat * 0.12, 2.5, 13),
      lift: THREE.MathUtils.clamp(fromPos.distanceTo(toPos) * 0.09, 3.5, 15),
      losLift: 0,
    };
    // clearance pre-solve: the mid-arc must not dip through a canopy or lose
    // its view line — find the smallest extra lift that clears every sample
    const clr = worldClearance();
    if (clr) {
      const N = 9;
      const LIFTS = [0, 2.5, 5, 9, 14];
      let need = 0;
      const cp = new THREE.Vector3();
      const lk = new THREE.Vector3();
      for (let i = 1; i < N; i++) {
        const u = i / (N - 1);
        const k = u * u * u * (u * (u * 6 - 15) + 10);
        cp.lerpVectors(pb.app.fromPos, pb.app.toPos, k)
          .addScaledVector(pb.app.side, Math.sin(Math.PI * k) * pb.app.sideAmt);
        cp.y += Math.sin(Math.PI * k) * pb.app.lift;
        lk.lerpVectors(pb.app.fromLook, pb.app.toLook,
          THREE.MathUtils.smoothstep(u, 0.12, 0.85));
        const baseY = cp.y;
        let liftHere = LIFTS[LIFTS.length - 1]; // best effort if nothing clears
        for (const cand of LIFTS) {
          cp.y = baseY + cand;
          if (clr.clearAt(cp, lk)) { liftHere = cand; break; }
        }
        need = Math.max(need, liftHere);
      }
      pb.app.losLift = need;
    }
    // the tracer has not been fired yet — dress hidden until handover
    for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = false;
    if (pb.shellLight) pb.shellLight.intensity = 0;
    if (pb.muzzleLight) pb.muzzleLight.intensity = 0;
    pb.phase = 'approach';
    updateApproach(0);
    return true;
  }

  function updateApproach(dt) {
    const a = pb.app;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    const k = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep push-in
    _a.lerpVectors(a.fromPos, a.toPos, k)
      .addScaledVector(a.side, Math.sin(Math.PI * k) * a.sideAmt);
    _a.y += Math.sin(Math.PI * k) * a.lift + Math.sin(Math.PI * k) * a.losLift;
    _b.lerpVectors(a.fromLook, a.toLook, THREE.MathUtils.smoothstep(u, 0.12, 0.85));
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.9;
      if (_a.y < minY) _a.y = minY;
    }
    // muzzle glow swells as the camera arrives — the shot is about to re-fire
    if (pb.muzzleLight) pb.muzzleLight.intensity = 70 * THREE.MathUtils.smoothstep(u, 0.78, 1);
    rig.setExternalPose(_a, _b, a.fromFov + (50 - a.fromFov) * k);
    if (u >= 1) {
      for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = true;
      pb.phase = 'flight';
      updateFlight(0);
    }
  }

  /** Flight chase-cam pose at launch (u = 0) — the approach lands on it. */
  function flightStartPose(outPos, outLook) {
    pb.segIdx = 0;
    sampleTraj(0, _p, _d);
    _s.crossVectors(_d, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    outPos.copy(_p).addScaledVector(_d, -9.0).addScaledVector(_s, 2.7);
    outPos.y += 1.35;
    if (pb.flightLift) outPos.y += pb.flightLift[0];
    if (heightField) {
      const minY = heightField.getHeightAt(outPos.x, outPos.z) + 0.8;
      if (outPos.y < minY) outPos.y = minY;
    }
    outLook.copy(_p).addScaledVector(_d, 10).lerp(pb.xcam.center, 0.4);
    pb.segIdx = 0;
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
  /**
   * Shared camera-clearance oracle (killcam_endscreen r1: factored out of
   * solveFlightOcclusion so the death-approach pre-solve reuses it): a pose
   * is CLEAR when it sits outside every vegetation concealment volume and
   * its view line to the look target is not blocked by terrain/props. The
   * occluder data is the world the sim itself uses — nothing invented.
   * @returns {?{clearAt:(cp:THREE.Vector3, lk:THREE.Vector3)=>boolean}}
   */
  function worldClearance() {
    let world = null;
    try { world = getWorld ? getWorld() : null; } catch (_) { world = null; }
    const conceal = (world && world.getConcealment && world.getConcealment()) || [];
    const canRay = !!(world && world.raycast);
    if (!conceal.length && !canRay) return null;
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
    return { clearAt };
  }

  function solveFlightOcclusion() {
    const clr = worldClearance();
    if (!clr || !pb.pts || pb.total <= 0) return null;
    const clearAt = clr.clearAt;
    const N = 13;
    const LIFTS = [0, 2.5, 5, 8, 12, 16, 20];
    const lifts = new Float32Array(N);
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const camP = new THREE.Vector3();
    const look = new THREE.Vector3();
    const sideV = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      // uniform in ARC LENGTH (killcam_endscreen r1): playback is now
      // distance-driven (slow-mo retime), so the lift table is indexed by
      // distance fraction — the old launch-ease mapping would misplace lifts
      const s = u;
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
    pb.t = Math.min(pb.dur, pb.t + Math.max(0, dt));
    // Refresh-rate invariant timing: the normalized lookup contains the
    // whole terminal slow-motion ramp, so it reaches the plate at exactly
    // pb.dur. The previous per-frame integrator treated pb.dur as a baseline
    // and then added slow-mo on top; short shots hit a stall guard and visibly
    // teleported through their final meters.
    pb.flightDist = replayDistanceAtTime(pb.flightTimeline, pb.t);
    const u = pb.total > 0 ? pb.flightDist / pb.total : 1;
    const dist = pb.flightDist;
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
    // The shell has arrived. killcam r2: the kill plays out LIVE (impact
    // beat) before the analytical x-ray takes the frame. killcam r3: on an
    // OWN death that order is inverted — the tank the player just watched
    // arrive intact goes straight to the skeleton, and blows up after it.
    if (u >= 1) beginContact();
  }

  /** Hold the shell on/just inside the plate for a readable rendered frame. */
  function beginContact() {
    if (!pb || pb.phase === 'contact' || pb.phase === 'impact' || pb.phase === 'xray') return;
    pb.phase = 'contact';
    pb.contactT = 0;
    pb.segIdx = Math.max(0, pb.pts.length - 2);
    sampleTraj(pb.total, _p, _d);
    pb.contactDir = _d.clone();
    updateContact(0);
  }

  function updateContact(dt) {
    pb.contactT += Math.max(0, dt);
    const f = Math.min(1, pb.contactT / CONTACT_HOLD_S);
    const sink = 0.22 * THREE.MathUtils.smoothstep(f, 0, 1);
    _p.copy(pb.pts[pb.pts.length - 1]).addScaledVector(pb.contactDir, sink);
    if (pb.core) {
      pb.core.position.copy(_p);
      pb.core.quaternion.setFromUnitVectors(_Y, pb.contactDir);
      pb.core.scale.setScalar(1 - 0.18 * f);
    }
    if (pb.streak) {
      pb.streak.position.copy(_p).addScaledVector(pb.contactDir, -2.6);
      pb.streak.quaternion.setFromUnitVectors(_Y, pb.contactDir);
    }
    if (pb.halo) pb.halo.position.copy(_p);
    if (pb.tail) {
      pb.tail.position.copy(_p).addScaledVector(pb.contactDir, -6.4);
      pb.tail.quaternion.setFromUnitVectors(_Y, _s.copy(pb.contactDir).negate());
    }
    if (pb.shellLight) pb.shellLight.position.set(_p.x, _p.y + 0.5, _p.z);
    rig.setExternalPose(pb.xcam.pos, pb.xcam.look, 42);
    if (f >= 1) {
      if (pb.finalePending) beginXray();
      else beginImpact();
    }
  }

  /**
   * Fx-clock rate through the IMPACT beat (killcam r2): full speed through
   * the detonation flash, ~IMPACT_SLOWMO through the turret launch + tumble
   * (0.22-1.0 s of the pop arc — apogee at 0.62 s), back to full rate for
   * the smoke settle and the x-ray handover. Pure function of the beat's
   * ANIM time so main.ts (fx clock), updateImpact (window) and the visual's
   * own pop timeline (fx-clock driven) all dilate coherently.
   * @param {number} t impact-beat anim time (s)
   * @returns {number} fx dt multiplier (0..1]
   */
  function impactRate(t) {
    const inS = THREE.MathUtils.smoothstep(t, 0.22, 0.42);
    const outS = 1 - THREE.MathUtils.smoothstep(t, 1.0, 1.38);
    return 1 - (1 - IMPACT_SLOWMO) * inS * outS;
  }

  // ---------------------------------------------------------------------------
  // IMPACT BEAT (killcam r2, owner directive: "show the actual animations of
  // popping turrets and exploding, especially during kill cam") — the moment
  // the tracer reaches the plate the destruction is RE-FIRED on the restaged
  // victim and plays live in front of the camera: detonation flash, fx
  // fireball/debris/smoke (fx children re-shown for the beat), the turret-pop
  // arc tumbling off the setDestroyed grammar exactly as in live play (GLB
  // and procedural parity — the GLB turret node is re-parented into turretG
  // at swap time), with a brief fx-clock dilation through the launch. The
  // camera pushes out from the x-ray vantage for the fireball and eases back
  // onto it, so the x-ray hold that follows starts without a cut.
  // ---------------------------------------------------------------------------
  /**
   * X-RAY TEARDOWN (killcam r3): strike the whole analysis layer and hand the
   * frame back to the normally-shaded world, so the own-death FINALE detonates
   * over the real tank instead of over a phantom. Everything beginXray() put
   * up comes down here: the fresnel ghost skin (restored FIRST — setDestroyed
   * lazily captures the victim's current materials for the rematch restore and
   * it must capture the LIVE ones, never the ghost), the internals/boxes/shell
   * path/trail ribbon under pb.group, the DOM veil + damage chips + leader
   * lines, the backdrop light dim and the vegetation hide.
   *
   * The annotation block, the AMMO RACK banner and the killer card deliberately
   * STAY: they are the death's chrome, already revealed during the hold, and
   * the exit choreography is what fades them.
   *
   * Idempotent, and every restore it performs is nulled out behind it so the
   * teardown() path can never double-apply a stale one (a surviving
   * ghostBackup would repaint pristine camo over the wreck it just made).
   */
  function endXrayDressing() {
    if (!pb) return;
    if (pb.ghostBackup) {
      for (const [mesh, mat, ro, cs] of pb.ghostBackup) {
        mesh.material = mat;
        mesh.renderOrder = ro || 0;
        mesh.castShadow = !!cs;
      }
      pb.ghostBackup = null;
    }
    pb.ghostSkin = null;
    pb.ghostSeen = null;
    pb.ghostVis = null;
    // scene dressing: hidden rather than disposed — teardown() still owns the
    // geometry lifetime, and one flag retires trail, ribbon, module boxes,
    // proxies, spall cone and shell path in a single stroke
    pb.group.visible = false;
    if (pb.dimmedLights) {
      for (const [L, i] of pb.dimmedLights) L.intensity = i;
      pb.dimmedLights = null;
    }
    if (pb.vegGroup) {
      pb.vegGroup.visible = pb.vegWasVisible;
      pb.vegGroup = null;
    }
    if (dom) {
      dom.root.classList.remove('xr'); // veil fades out on its own transition
      dom.labelHost.textContent = '';
      dom.leader.textContent = '';
    }
    pb.labels.length = 0;
    pb.obstacles = null;
  }

  function beginImpact() {
    if (!pb || pb.phase === 'impact' || pb.phase === 'exit') return;
    // killcam r3: arriving FROM the x-ray means this is the own-death FINALE —
    // the analysis layer must come down before the destruction re-fires, the
    // orbit azimuth carries over from where the hold left it (no snap back to
    // the solved zero), and the beat exits to the results instead of looping
    // back into an x-ray it already played.
    pb.isFinale = pb.phase === 'xray';
    if (pb.isFinale) {
      pb.impactAng0 = pb.xrayAng0 + ORBIT_RAD_S * pb.xt;
      endXrayDressing();
    } else {
      pb.impactAng0 = 0;
    }
    pb.finalePending = false;
    pb.phase = 'impact';
    pb.it = 0;
    pb.itWall = 0;
    const snap = pb.snap;
    const cause = snap.ev.ammoRacked ? 'ammorack' : 'shot';
    // retire the flight tracer + dressing NOW — the shell no longer exists
    // (same pool-light discipline as beginXray: dim, never remove)
    if (pb.core) {
      pb.group.remove(pb.core, pb.streak, pb.halo, pb.tail);
      pb.shellLight.intensity = 0;
      pb.muzzleLight.intensity = 0;
      pb.core = pb.streak = pb.halo = pb.tail = pb.shellLight = pb.muzzleLight = null;
    }
    // the destruction must be SEEN: battle fx come back for the beat (the
    // x-ray re-hides them), and the victim — restaged to its live pre-hit
    // look for the flight — is wrecked again from t=0 with the same pop
    // grammar the sim used (full toss on racks, ~20% jolt otherwise).
    showFx();
    const vis = snap.targetEnt && snap.targetEnt.visual;
    if (vis) {
      // restageIntact() is the pre-hit state AND the fx-clock cursor PRIME:
      // the visual's last sync was seconds of approach/flight — or, for the
      // r3 finale, a whole x-ray hold — ago, and the first destroyed-sync
      // would swallow that entire gap as one clamped advance; popT jumped
      // straight past the arc and the replayed turret never left its seat
      // (live probe: impact rise 0.00 m while the wreck-hold rise read 2.9).
      // Priming must happen BEFORE the re-wreck, whichever phase we came from.
      restageIntact(true);
      vis.setDestroyed({ pop: !!snap.ev.ammoRacked, ageS: 0 });
      pb.impactVis = vis;
    }
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.destruction) {
      _p.set(snap.pose.pos[0], snap.pose.pos[1], snap.pose.pos[2]);
      fxs.destruction(_p, null, cause);
    }
    // AUDIO SEAM (killcam r2): the live blast/turret-pop samples fired at the
    // real kill (tank:destroyed) — re-emitting that event would double-count
    // kills, so the replayed detonation announces itself on a NEW additive
    // event the sound system subscribes to (sub-drop on this frame, slowed
    // debris/pop accents through the launch).
    if (busRef) {
      busRef.emit('killcam:impact', {
        cause,
        pos: snap.pose.pos.slice(),
        // Audio mirrors the same minimum rate used by impactRate(): the
        // transient stays crisp, then debris/turret-pop samples stretch and
        // pitch down through the visual launch window.
        timeScale: IMPACT_SLOWMO,
      });
    }
    // detonation flash — synced to the killing hit's replayed arrival
    if (dom) {
      dom.flash.classList.remove('go');
      void dom.flash.offsetWidth;
      dom.flash.classList.add('go');
    }
    updateImpact(0);
  }

  function updateImpact(dt) {
    // anim time advances on the SAME dilated clock main.ts scales the fx dt
    // by (fxTimeScale getter reads impactRate(pb.it)) — window, particles
    // and the visual's pop arc stay in lockstep.
    const rate = impactRate(pb.it);
    pb.it += dt * rate;
    pb.itWall += dt;
    // the sim/visual sync loop is frozen during replays (main.ts step 5) —
    // the killcam drives the victim's destruction timelines itself; the
    // internal advance rides the shared fx clock, dt is just the fallback.
    if (pb.impactVis) pb.impactVis.syncFromState(pb.snapPoseState, dt * rate);
    // camera: hold the solved x-ray vantage, pushed out for the fireball and
    // eased back onto it — u runs 0..1 over the beat, the push-out bump is 0
    // at BOTH ends so the flight exit and the x-ray entry meet it exactly.
    // The camera/fov shape stays keyed to IMPACT_HOLD_S whatever the window,
    // so the r3 finale's extra settle tail plays out with the push-out bump
    // already back at zero, parked on the x-ray vantage.
    const u = Math.min(1, pb.it / IMPACT_HOLD_S);
    const bump = Math.sin(Math.PI * Math.min(1, u * 1.12));
    const ang = pb.impactAng0 + IMPACT_DRIFT_RAD_S * pb.it;
    const c = pb.xcam.center;
    const o = pb.xcam.off;
    const scale = 1 + 0.3 * bump;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    _a.set(
      c.x + (o.x * ca + o.z * sa) * scale,
      c.y + o.y * scale + bump * 1.1,
      c.z + (-o.x * sa + o.z * ca) * scale,
    );
    // concussion: a sharp decaying jitter through the first ~0.5 s — additive
    // and deterministic (no rng: staged captures must repeat)
    const shake = 0.16 * Math.exp(-pb.itWall / 0.22);
    if (shake > 0.004) {
      _a.x += Math.sin(pb.itWall * 61.0) * shake;
      _a.y += Math.sin(pb.itWall * 47.0 + 1.7) * shake * 0.7;
      _a.z += Math.cos(pb.itWall * 53.0 + 0.6) * shake;
    }
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    // look rises with the toss so the tumbling turret + fireball crown stay
    // framed, then settles back onto the x-ray look point
    _b.copy(pb.xcam.look);
    _b.y += bump * Math.max(1.2, (pb.snap.heightM || 2.4) * 0.55);
    // fov: detonation punch (fast decay) over the base the x-ray hold uses
    const fov = 42 + 5 * Math.exp(-pb.itWall / 0.16);
    rig.setExternalPose(_a, _b, fov);
    // hand the beat over: window served (anim time), or the wall-clock stall
    // guard (a starved pane must still finish the battle flow). killcam r3 —
    // the own-death FINALE is the last beat of the replay, so it runs the
    // slightly longer FINALE_HOLD_S (fireball + turret arc + a short settle)
    // and goes straight to the exit; the r2 player-kill beat still hands the
    // frame to the analytical x-ray.
    const win = pb.isFinale ? FINALE_HOLD_S : IMPACT_HOLD_S;
    if (pb.it >= win || pb.itWall > win * 2.5) {
      if (pb.isFinale) {
        beginExit();
      } else {
        pb.xrayAng0 = ang; // orbit continuity — the hold inherits the drift
        beginXray();
      }
    }
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
    const sideM = R * 0.88;
    const off = new THREE.Vector3()
      .addScaledVector(_s, sideM)
      .addScaledVector(dirW, -R * 0.52);
    // Both lateral sides tell the same armor/path story, but one can put the
    // live map sun almost exactly behind the victim. The translucent ghost
    // then disappears into a white disc even though the staged x-ray remains
    // fine. Prefer the side whose view axis is farther from the sun; retain
    // the along-path component so the penetrated plate still faces the lens.
    const sun = scene.userData.sunDirWorld;
    if (sun && sun.lengthSq() > 1e-8) {
      const currentSunDot = -off.dot(sun) / Math.max(1e-6, off.length());
      off.addScaledVector(_s, -sideM * 2);
      const flippedSunDot = -off.dot(sun) / Math.max(1e-6, off.length());
      if (flippedSunDot >= currentSunDot) off.addScaledVector(_s, sideM * 2);
    }
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
    // killcam r2 safety net: whatever phase we arrive from, the analytical
    // hold needs the victim in its pre-hit pose (the IMPACT beat re-wrecked
    // it; a skip can land here straight from the WRECK hold) and the battle
    // fx suppressed again (the beats re-showed them so the fireball/smoke
    // could play — r2: the death fireball rendered ON TOP of the ghost).
    // Both are no-ops when flight/approach handed over normally.
    pb.impactVis = null;
    pb.wreck = null;
    restageIntact();
    hideFx();
    // X-RAY BUDGET (killcam r2): the live beats spend seconds the buffered
    // battle report's 16 s watchdog (shotInfo) does not know about — give
    // back whatever they used so exit + killcam:done always land first.
    // Floor keeps the analysis readable; no-beat replays still get the full
    // legacy hold (elapsed ~5 s -> clamped to XRAY_HOLD_S).
    // killcam r3: an own-death replay still owes the frame a FINALE after this
    // hold, so its wall cost is reserved up front. The trim lands on the
    // ANALYSIS, never on the destruction — the owner asked to see the tank
    // blow up again, and a budget squeeze must not be what deletes it.
    pb.xrayHoldS = THREE.MathUtils.clamp(
      REPLAY_BUDGET_S - (pb.finalePending ? FINALE_RESERVE_S : 0)
        - (performance.now() - lastBeginWallMs) / 1000,
      pb.finalePending ? FINALE_XRAY_FLOOR_S : 4.0, XRAY_HOLD_S);
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
    pb.ghostSeen = new WeakSet();
    // Ghost every color-rendering mesh, including currently-hidden LOD detail
    // levels. The x-ray camera sits close enough to flip LODs mid-hold, and a
    // skipped painted mesh would pop in with its original dark non-additive
    // material and read as a black hole in the hull. Non-painting helpers stay
    // excluded. Skin renders at renderOrder 11;
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
        if (!o.isMesh || o.material === S.ghost || pb.ghostSeen.has(o)) return;
        pb.ghostSeen.add(o);
        pb.ghostBackup.push([o, o.material, o.renderOrder, o.castShadow]);
        // Invisible authored shadow hulls stay in the scene with colorWrite
        // disabled. Ghosting them made their coarse convex silhouettes appear
        // as huge cones around barrels and roof fittings. Suspend their shadow
        // only; never turn a non-painting helper into visible x-ray geometry.
        if (!isKillcamGhostSurface(o)) {
          o.castShadow = false;
          return;
        }
        o.material = S.ghost;
        o.renderOrder = 11;
        // the hull's own cast shadow otherwise sits directly beneath the
        // translucent skin and reads THROUGH it as a black tank-shaped
        // void (live Abrams probe) — WT floats the wreck on lit ground
        o.castShadow = false;
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
    // TRACK-HITBOX viz (owner order 2026-08-06: the killcam's track hitboxes
    // read as "a bunch of rectangles"): when the snapshot armor carries the
    // derived trackShapes prisms (specs.attachTrackShapes — the same volumes
    // hit resolution now rolls against), the track module draws as the REAL
    // \____/ silhouette: wireframe prism (side-view polygon at both track
    // faces + connecting rails) and, when hit, tread slats laid ALONG the
    // band perimeter — ground run, approach/departure ramps and raised
    // end-wheel wraps — instead of one full-length box + a flat slab row.
    const addTrackPrism = (shapes, key, mat, fillMat) => {
      // union AABB first: the group is POSITIONED at the prism center so the
      // damage chip's anchor (getWorldPosition) lands on the track itself,
      // exactly like addBox's centered seg.
      const minV = [Infinity, Infinity, Infinity];
      const maxV = [-Infinity, -Infinity, -Infinity];
      for (const shape of shapes) {
        for (const p of shape.poly) {
          minV[0] = Math.min(minV[0], shape.x0, shape.x1);
          maxV[0] = Math.max(maxV[0], shape.x0, shape.x1);
          minV[1] = Math.min(minV[1], p[1]); maxV[1] = Math.max(maxV[1], p[1]);
          minV[2] = Math.min(minV[2], p[0]); maxV[2] = Math.max(maxV[2], p[0]);
        }
      }
      const cx = (minV[0] + maxV[0]) / 2;
      const cy = (minV[1] + maxV[1]) / 2;
      const cz = (minV[2] + maxV[2]) / 2;
      const group = new THREE.Group();
      group.renderOrder = 12; // nested Groups reset groupOrder (see poseGrp)
      group.position.set(cx, cy, cz);
      for (const shape of shapes) {
        const poly = shape.poly;
        const n = poly.length;
        const posArr = [];
        const push = (x, p) => posArr.push(x - cx, p[1] - cy, p[0] - cz);
        for (let i = 0; i < n; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % n];
          push(shape.x0, a); push(shape.x0, b);   // inner face outline
          push(shape.x1, a); push(shape.x1, b);   // outer face outline
          push(shape.x0, a); push(shape.x1, a);   // connecting rail
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        pb.disposables.push(lineGeo);
        group.add(new THREE.LineSegments(lineGeo, mat));
        if (fillMat) {
          // tread slats along the perimeter — the destroyed-track tint reads
          // as the track itself (same link-pitch language as the r6 slats,
          // now following the true loop instead of filling the AABB)
          const xMid = (shape.x0 + shape.x1) / 2 - cx;
          const width = Math.abs(shape.x1 - shape.x0);
          const TH = 0.17; // slat band thickness (band + shoe read)
          for (let i = 0; i < n; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % n];
            const dz = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dz, dy);
            if (len < 0.12) continue;
            const nSl = Math.max(1, Math.min(14, Math.round(len / 0.55)));
            const segL = (len / nSl) * 0.62;
            const slatGeo = new THREE.BoxGeometry(width * 0.96, TH, segL);
            pb.disposables.push(slatGeo);
            const tz = dz / len;
            const ty = dy / len;
            // outward normal of a CCW edge in (z,y) — slats sit half a band
            // INSIDE the hull outline so the ring hugs the real surface
            const onz = ty;
            const ony = -tz;
            for (let k = 0; k < nSl; k++) {
              const s = (k + 0.5) * (len / nSl);
              const slat = new THREE.Mesh(slatGeo, fillMat);
              slat.position.set(
                xMid,
                a[1] + ty * s - ony * (TH / 2) - cy,
                a[0] + tz * s - onz * (TH / 2) - cz,
              );
              slat.rotation.x = Math.atan2(-ty, tz);
              group.add(slat);
            }
          }
        }
      }
      poseGrp.add(group); // tracks are hull-local, never turretLocal
      if (mat === S.edgeDim) group.visible = false; // r8: un-hit = anchors only
      const corners = [];
      for (let i = 0; i < 8; i++) {
        corners.push(new THREE.Vector3(
          i & 1 ? maxV[0] : minV[0],
          i & 2 ? maxV[1] : minV[1],
          i & 4 ? maxV[2] : minV[2],
        ));
      }
      pb.obstacles.push({ parent: poseGrp, corners, key: key || null });
      if (key && !anchors.has(key)) anchors.set(key, group);
    };
    const trackShapesOf = (name) => {
      const list = (armor.trackShapes || []).filter((s) => s.module === name);
      return list.length ? list : null;
    };
    for (const mb of armor.modules || []) {
      const state = effState(mb.module);
      const mat = state === 'red' ? S.edgeRed : state === 'yellow' ? S.edgeYellow : S.edgeDim;
      const fill = state === 'red' ? S.fillRed : state === 'yellow' ? S.fillYellow : null;
      // every module box anchors (hit ones get damage chips, idle key
      // internals get always-on micro-labels — WT-style AMMO/ENGINE/FUEL)
      const prism = (mb.module === 'trackL' || mb.module === 'trackR')
        ? trackShapesOf(mb.module) : null;
      if (prism) addTrackPrism(prism, `m:${mb.module}`, mat, fill);
      else {
        const parts = Array.isArray(mb.parts) && mb.parts.length ? mb.parts : [mb];
        for (const part of parts) {
          addBox({ ...mb, min: part.min, max: part.max }, `m:${mb.module}`, mat, fill);
        }
      }
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
      const parts = Array.isArray(mb.parts) && mb.parts.length ? mb.parts : [mb];
      for (const part of parts) {
        addInternalModuleModel(clampBB({ ...mb, min: part.min, max: part.max }),
          proxMatForState(effState(mb.module)), poseGrp, turretGrp,
          pb.disposables, specEra, victimCalMm, S.proxSteel, armor);
      }
    }
    // hull anatomy between the boxes: driveshaft spine + transmission block
    addInternalDrivetrainModel(armor, poseGrp, pb.disposables, S.proxSteel);
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
      addInternalCrewModel(cb, down ? S.proxRed : corpse ? S.proxGrey : S.proxGreen,
        poseGrp, turretGrp, pb.disposables, armor);
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
    // (the actual rolled value damage.ts applied); when a payload predates
    // that field the number is OMITTED rather than fabricated.
    const d = ensureDom();
    d.root.classList.add('xr'); // fade in the x-ray backdrop dim
    d.labelHost.textContent = '';
    d.leader.textContent = '';
    // KILLER CARD (death view): name, vehicle, shell, damage, distance —
    // every field straight off the snapshot event (nothing recomputed).
    // Revealed by updateXray at KILLER_CARD_AT_S; hidden for FINAL BLOW
    // frames (the annotation block already tells the player-kill story).
    if (pb.isDeathView) {
      let vSpec = null;
      try { vSpec = ev.attackerSpecId ? getSpec(ev.attackerSpecId) : null; } catch (_) { vSpec = null; }
      const kName = ev.attackerName || (vSpec && vSpec.name) || 'Enemy';
      d.killer.name.textContent = kName;
      const tier = ev.attackerSpecId ? tierNumeral(ev.attackerSpecId) : '';
      // vehicle line never repeats the headline: attackerName usually IS the
      // vehicle (state.ts enrichment) — then the line carries the tier alone
      const vehBits = [];
      if (tier) vehBits.push(`Tier ${tier}`);
      if (vSpec && !kName.toLowerCase().includes(vSpec.name.toLowerCase())) vehBits.push(vSpec.name);
      d.killer.veh.textContent = vehBits.join(' · ');
      d.killer.sil.style.backgroundImage = ev.attackerSpecId
        ? `url(${iconUrl(ev.attackerSpecId, 'side_silhouette')})` : 'none';
      d.killer.rows.textContent = '';
      const kkv = (k2, v2, cls2, iconId) => {
        const r2 = el('div', `kv${cls2 ? ` ${cls2}` : ''}`, d.killer.rows);
        const ks2 = el('span', '', r2);
        ks2.innerHTML = `${uiIconSVG(iconId, 10)}<span>${k2}</span>`;
        const vs2 = el('b', '', r2); vs2.textContent = v2;
      };
      const cleanShell = shellDisplayName(ev);
      kkv('Shell', `${ev.shellType || ''}${cleanShell ? ` ${cleanShell}` : ''}`.trim() || '—', 'w', 'shell');
      kkv('Damage', (ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : '0', 'dmg', 'damage');
      kkv('Distance', `${Math.round(ev.flightDistM || 0)} m`, '', 'scope');
      d.killer.root.classList.add('on');
      if (staged) d.killer.root.classList.add('rv'); // deterministic frames skip the reveal timer
    } else {
      d.killer.root.classList.remove('on', 'rv');
    }
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
        const icon = el('span', 'ico', label);
        icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 11);
        const copy = el('span', 'copy', label);
        const mainText = el('span', 'main', copy);
        mainText.textContent = main;
        const subText = el('span', 's', copy);
        subText.textContent = sub;
        dot = el('div', `cot-kc-dot${ok ? ' ok' : ''}`, d.labelHost);
        dot.style.color = color;
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', ok ? '0.45' : '0.85');
        d.leader.appendChild(line);
      } else {
        const icon = el('span', 'ico', label);
        icon.innerHTML = uiIconSVG('damage', 15);
        const value = el('span', 'val', label);
        value.textContent = main;
      }
      pb.labels.push({
        label, dot, line, big: !!big, world: world.clone(), key: key || null,
      });
    };
    /** Idle micro-label (no dot/leader): WT-style always-on internals tag. */
    const addMicro = (world, text, key) => {
      const label = el('div', 'cot-kc-micro', d.labelHost);
      const icon = el('span', 'ico', label);
      icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 9);
      const copy = el('span', 'copy', label);
      copy.textContent = text;
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
      const icon = el('span', 'ico', label);
      icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 9);
      const copy = el('span', 'copy', label);
      const mainText = el('span', 'main', copy);
      mainText.textContent = text;
      const subText = el('span', 's', copy);
      subText.textContent = ' · near miss';
      pb.labels.push({
        label, dot: null, line: null, big: false, micro: true,
        world: world.clone(), key: key || null,
      });
    };
    const MOD_STATE_WORD = { red: 'DESTROYED', yellow: 'DAMAGED', ok: 'HIT' };
    const MOD_STATE_COLOR = { red: '#ff5a4a', yellow: '#ffb43c', ok: '#8a97a3' };
    // A shell can cross more than one physical volume assigned to the same
    // module. The simulation correctly applies both impulses, but the replay
    // should present one final-state callout rather than stacking two TRACK R
    // cards at the same anchor. Preserve total resolved damage and the most
    // severe resulting state.
    const moduleLabels = new Map();
    const stateRank = { ok: 0, yellow: 1, red: 2 };
    for (const m of ev.modulesHit) {
      const prev = moduleLabels.get(m.module);
      if (!prev) {
        moduleLabels.set(m.module, { ...m });
        continue;
      }
      if ((stateRank[m.newState] || 0) > (stateRank[prev.newState] || 0)) {
        prev.newState = m.newState;
      }
      if (Number.isFinite(m.dmg)) prev.dmg = (Number.isFinite(prev.dmg) ? prev.dmg : 0) + m.dmg;
    }
    for (const m of moduleLabels.values()) {
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
    for (const c of new Set(ev.crewHit)) {
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
    // pass 2c: keep projected callouts out of the fixed analysis/killer
    // cards. This matters most in portrait, where the lower-hull labels and
    // the compact ballistic card share the bottom third of the frame. Move a
    // colliding callout toward the unobstructed center instead of letting its
    // text ghost through a panel; leaders retain the anchor relationship.
    let panelRects = [];
    if (dom) {
      const panelEls = [dom.title, dom.skip, dom.annot, dom.killer && dom.killer.root].filter(Boolean);
      panelRects = panelEls
        .filter((node) => getComputedStyle(node).display !== 'none')
        .map((node) => node.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      for (const it of pb.labels) {
        if (it.hidden) continue;
        for (const r of panelRects) {
          if (it.left < r.right + 6 && r.left < it.left + it.lw + 6 &&
              it.top < r.bottom + 6 && r.top < it.top + it.lh + 6) {
            it.top = (r.top + r.bottom) * 0.5 > h * 0.5
              ? r.top - it.lh - 8
              : r.bottom + 8;
          }
        }
      }
    }
    // Geometry and fixed-panel repulsion can move two independently solved
    // labels back onto the same screen row (most visibly the entry-plate and
    // damage cards at the impact point). Run one final bounded label-only
    // separation pass after every other obstacle has settled.
    {
      const priority = (it) => it.big ? 3 : it.micro ? 1 : 2;
      const visible = pb.labels.filter((it) => !it.hidden)
        .sort((a, b) => priority(b) - priority(a) || a.top - b.top || a.left - b.left);
      const minTop = h * 0.095;
      const maxBottom = h * 0.885;
      const hitsPanel = (it, top) => panelRects.some((r) =>
        it.left < r.right + 6 && r.left < it.left + it.lw + 6 &&
        top < r.bottom + 6 && r.top < top + it.lh + 6);
      const placed = [];
      const fits = (it, top) => top >= minTop && top + it.lh <= maxBottom &&
        !hitsPanel(it, top) && !placed.some((other) =>
          it.left < other.left + other.lw + 5 && other.left < it.left + it.lw + 5 &&
          top < other.top + other.lh + 4 && other.top < top + it.lh + 4);
      for (const it of visible) {
        const desired = it.top;
        if (!fits(it, desired)) {
          const candidates = [minTop, maxBottom - it.lh];
          for (const other of placed) {
            if (it.left >= other.left + other.lw + 5 || other.left >= it.left + it.lw + 5) continue;
            candidates.push(other.top - it.lh - 5, other.top + other.lh + 5);
          }
          const valid = candidates.filter((top) => fits(it, top));
          if (valid.length) {
            valid.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
            it.top = valid[0];
          }
        }
        placed.push(it);
      }
    }
    // pass 3: write DOM positions + leader lines dot -> chip edge
    for (const it of pb.labels) {
      const off = it.hidden;
      it.label.style.display = off ? 'none' : 'flex';
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
      // Mobile-safe horizontal clamp: wide labels anchored to terminal road
      // wheels or long barrels used to escape the portrait frame even after
      // the vertical repulsion pass had cleared the fixed cards.
      it.left = Math.min(Math.max(it.left, 8), Math.max(8, w - it.lw - 8));
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
    // xrayAng0: the impact beat's orbital drift carries straight into the
    // hold — the camera never snaps back to the solved zero azimuth (r2)
    const ang = pb.xrayAng0 + ORBIT_RAD_S * pb.xt;
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
    // killer card reveal: a beat into the hold, after the shot has landed
    // and the label cascade started — death view only (populated in beginXray)
    if (!pb.killerShown && pb.isDeathView && pb.xt >= KILLER_CARD_AT_S && dom) {
      pb.killerShown = true;
      dom.killer.root.classList.add('rv');
    }
    // killcam r3: the own-death replay's last act is the destruction itself —
    // the analysis hands the frame to the FINALE, everything else exits.
    if (pb.xt >= pb.xrayHoldS) {
      if (pb.finalePending) beginImpact();
      else beginExit();
    }
  }

  /**
   * EXIT TRANSITION (killcam_endscreen r1): letterbox close + fade-through-
   * black (~EXIT_HOLD_MS) into whatever follows. The scene teardown, the
   * integration onDone (spectate / end overlay setup) and killcam:done all
   * run AT the black frame, so the next state is fully staged before the
   * fade lifts — nothing ever pops mid-frame. Wall-clock timers (not rAF)
   * drive the handover so starved panes still finish the battle flow;
   * clearExit() (cancel path) can revoke every step.
   */
  function beginExit() {
    if (!pb || pb.phase === 'exit') return;
    pb.phase = 'exit';
    pb.exitWallMs = performance.now();
    const d = ensureDom();
    d.root.classList.add('out');
    const f = ensureFade();
    f.classList.remove('lift');
    void f.offsetWidth;
    f.classList.add('in');
    exitTimers.push(setTimeout(completeExit, EXIT_HOLD_MS));
  }

  function completeExit() {
    if (!active || !pb || pb.phase !== 'exit') return;
    teardown(true); // scene restored + onDone + killcam:done, behind black
    const f2 = fadeEl;
    if (!f2) return;
    exitTimers.push(setTimeout(() => {
      f2.classList.add('lift');
      f2.classList.remove('in');
      exitTimers.push(setTimeout(() => {
        if (fadeEl === f2) fadeEl = null;
        f2.remove();
      }, 420));
    }, 50));
  }

  function finish(runCallback) {
    // legacy seam kept for cancel(): immediate teardown, no exit choreography
    teardown(runCallback);
  }

  function teardown(runCallback) {
    if (!active) return;
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('mousedown', onSkipKey, true);
    if (pb) {
      const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
      if (fxs && fxs.setReplaySuppressed) fxs.setReplaySuppressed(false);
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
      // killcam r3: after an own-death FINALE the visual is ALREADY destroyed
      // (the beat just wrecked it from t=0), so setDestroyed no-ops and the
      // wreck hands back mid-arc with hot embers — which is the honest look
      // for a tank the player watched detonate one second ago; the resumed
      // live sync loop settles and cools it from there. The track/ERA
      // re-application below runs on both paths.
      if (pb.rewreck && pb.snap.targetEnt && pb.snap.targetEnt.visual) {
        const vis = pb.snap.targetEnt.visual;
        vis.setDestroyed({ pop: pb.rewreck.pop, ageS: 12 });
        for (const m of pb.rewreck.brokenTracks) vis.setTrackState(m, true);
        if (vis.stripEra) for (const pl of pb.rewreck.eraSpent) vis.stripEra(pl);
      }
      // Release the temporary shot-time killer pose back to its authoritative
      // live state. Mid-battle death replays may hand control to spectate, so
      // leaving the shooter restaged would otherwise create a visual desync.
      if (pb.attackerPoseState && pb.snap.attackerEnt && pb.snap.attackerEnt.visual &&
          pb.snap.attackerEnt.state) {
        const avis = pb.snap.attackerEnt.visual;
        avis.syncFromState(pb.snap.attackerEnt.state, 0);
        if (pb.attackerRestore && pb.attackerRestore.wasDestroyed && avis.setDestroyed) {
          avis.setDestroyed({ pop: false, ageS: 12 });
        }
        if (pb.attackerRestore && !pb.attackerRestore.wasVisible && avis.setVisible) {
          avis.setVisible(false);
        }
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
    // Every transition class and the CSS HUD veil are stripped even if a
    // later cancel sees an already-inactive controller.
    resetDomPresentation();
    const done = pb ? pb.onDone : null;
    const wasDeathView = pb ? pb.isDeathView : false;
    pb = null;
    active = false;
    staged = false;
    if (runCallback && done) done();
    // ALLY SPECTATE (killcam_endscreen r1): after the DEATH replay hands the
    // screen back — battle still live, allies still standing — land in the
    // spectate chase instead of the static wreck orbit the integration
    // onDone just started (rig.startSpectate overrides rig.startDeathCam).
    // No-op when the battle is decided, the player lives, or no ally does.
    if (runCallback && wasDeathView) spectate.maybeStart();
    // REPORT GATE: release — emitted on natural finish, skip AND cancel alike
    // so a buffered battle report can never be lost with the replay. Emitted
    // AFTER onDone so the integration end-overlay (.cot-end) already exists
    // when shotInfo's report renders and pins its footer to it.
    if (busRef) busRef.emit('killcam:done', {});
  }

  // ===========================================================================
  // ALLY SPECTATOR MODE (killcam_endscreen r1)
  // ===========================================================================
  // Entered ONLY from the death-replay exit path above: the player is dead,
  // the battle continues, and living allies remain. The camera work lives in
  // the rig (rig.startSpectate / setSpectateTarget / spectateLook /
  // spectateZoom — eased blends, damped free orbit, collision pull-in); this
  // controller owns target selection, cycling input (←/→ or A/D), the FREE
  // CURSOR ORBIT + wheel zoom (killcam r2 — no button hold, see onMove),
  // auto-advance when the spectated ally dies, and the bus announcements
  // hud.js renders the spectate bar from ('spectate:begin/change/end' —
  // additive events, no main.ts wiring).
  // Battle state is read through window.__DEBUG.game (READ-ONLY — the
  // integration seam sanctioned for this round; no game module is imported).
  const spectate = (() => {
    let on = false;
    let observerAllTeams = false;
    let curId = null;
    let pollId = 0;
    let advanceTimer = 0;
    let lastX = null; // clientX/Y fallback deltas (movementX preferred)
    let lastY = null;
    const gameRef = () => {
      try {
        return (typeof window !== 'undefined' && window.__DEBUG) ? window.__DEBUG.game : null;
      } catch (_) { return null; }
    };
    const livingAllies = () => {
      const g = gameRef();
      if (!g || !Array.isArray(g.tanks)) return [];
      return g.tanks.filter((t) => t && (observerAllTeams || (!t.isPlayer && t.team !== 'enemy'))
        && t.combat && !t.combat.destroyed && t.state && t.visual);
    };
    const entById = (id) => {
      const g = gameRef();
      return g && g.tankById ? g.tankById.get(id) : null;
    };
    function announce(kind, ent, list) {
      if (!busRef || !ent) return;
      busRef.emit(`spectate:${kind}`, {
        id: ent.id,
        name: ent.displayName || null,
        vehicle: ent.spec ? ent.spec.name : String(ent.id),
        specId: ent.specId || null,
        count: list.length,
        index: Math.max(1, list.findIndex((candidate) => candidate.id === ent.id) + 1),
        allTeams: observerAllTeams,
      });
    }
    function retarget(ent, list, first) {
      curId = ent.id;
      if (first) rig.startSpectate(ent);
      else rig.setSpectateTarget(ent);
      announce(first ? 'begin' : 'change', ent, list);
    }
    function cycle(dir) {
      if (!on) return;
      const list = livingAllies();
      if (!list.length) { stop(true); return; }
      let i = list.findIndex((t) => t.id === curId);
      if (i < 0) i = 0; // current target died — dir picks the neighbour
      else i = ((i + dir) % list.length + list.length) % list.length;
      retarget(list[i], list, false);
    }
    function onKey(e) {
      if (!on || e.repeat) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') cycle(1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycle(-1);
    }
    // FREE CURSOR ORBIT (killcam r2, owner: "when were spectating be able to
    // look around tanks using cursor"): moving the mouse orbits the camera
    // around the spectated tank — no button hold. Spectating has no gun to
    // aim, so every mouse motion is free look: full 360° yaw, the rig clamps
    // pitch and eases both (chase free-look feel). movementX/Y works locked
    // AND unlocked (a canvas click mid-spectate re-grabs pointer lock —
    // main.ts battle mousedown — and client deltas die with the cursor);
    // client-delta fallback covers browsers without movement fields.
    function onMove(e) {
      if (!on) return;
      // never orbit behind an open settings panel (read-only introspection —
      // the same seam this controller already reads battle state through)
      try {
        const dbg = typeof window !== 'undefined' ? window.__DEBUG : null;
        if (dbg && dbg.settings && dbg.settings.isOpen && dbg.settings.isOpen()) return;
      } catch (_) { /* no settings surface — orbit freely */ }
      let dx;
      let dy;
      if (typeof e.movementX === 'number' && (e.movementX !== 0 || e.movementY !== 0
        || document.pointerLockElement)) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        dx = lastX === null ? 0 : e.clientX - lastX;
        dy = lastY === null ? 0 : e.clientY - lastY;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx || dy) rig.spectateLook(dx, dy);
    }
    // wheel zooms the orbit (chase-cam grammar; the rig clamps + eases)
    function onWheel(e) {
      if (!on || !e.deltaY || !rig.spectateZoom) return;
      rig.spectateZoom(e.deltaY > 0 ? 1 : -1);
    }
    function watchTarget() {
      if (!on) return;
      const cur = curId != null ? entById(curId) : null;
      const dead = !cur || !cur.combat || cur.combat.destroyed;
      if (dead && !advanceTimer) {
        // let the ally's death read for a beat, then glide to the next
        advanceTimer = setTimeout(() => {
          advanceTimer = 0;
          if (on) cycle(1); // cycle() re-resolves the living list / stops
        }, 900);
      }
    }
    function start() {
      const list = livingAllies();
      if (!list.length) return false;
      on = true;
      lastX = lastY = null;
      retarget(list[0], list, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('wheel', onWheel, { passive: true, capture: true });
      pollId = setInterval(watchTarget, 400);
      return true;
    }
    function stop(emitEnd) {
      if (!on) return;
      on = false;
      observerAllTeams = false;
      curId = null;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      if (pollId) { clearInterval(pollId); pollId = 0; }
      if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = 0; }
      if (rig.stopSpectate) rig.stopSpectate();
      if (emitEnd && busRef) busRef.emit('spectate:end', {});
    }
    return {
      /** Enter spectate iff dead player + live battle + living allies. */
      maybeStart() {
        if (on) return false;
        observerAllTeams = false;
        const g = gameRef();
        const p = getPlayer();
        if (!g || g.result || g.phase !== 'battle') return false;
        if (!p || !p.combat || !p.combat.destroyed) return false;
        return start();
      },
      /** Enter lobby observer mode without requiring an owned/dead tank. */
      startObserver() {
        if (on) return false;
        observerAllTeams = true;
        if (start()) return true;
        observerAllTeams = false;
        return false;
      },
      stop,
      cycle,
      get active() { return on; },
      get targetId() { return on ? curId : null; },
    };
  })();

  return api;
}
