// Media r5 "Fifty frames": motion blur, camera language, light and explosions with the
// newest main battle tanks. Every frame is a timed moment of a moving Studio scene;
// `exposureMs` is the shutter the film renderer integrates (actors, rail and FX moving),
// so pans keep the tank sharp against streaked ground, long exposures draw tracers, etc.
//   node tools/media-r5/blur50.mjs <outDir> [ids]      -> scene JSON per frame (+ manifest.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShot, fire, kill, pen, burn, smoke, boom, dust, mg, barrage, sparks, flare, embers, debris, shockwave, fireField, huge, smokeScreen, H } from './setups.mjs';
import { SETS, T, pictureFor, setById, filmById, RIG, LIGHT_READY, sunFor } from './sets.mjs';
import { CAST, CAST_NAMES } from './cast.mjs';

const S = (n, id, technique, title, spec) => ({ n, id, technique, title, ...spec });
const hold = c => RIG.hold(c);
// a still-only shot: a held camera (hero frame) over a short timeline
const still = (durMs, cam, rest = {}) => ({ durMs, speed: 0, cam: hold(cam), ...rest });

export const FRAMES = [
  // --- motion blur: pans, tracking, dolly ------------------------------------------------
  S(1, 'b01-pan-runway', 'Panning shot', 'Tele pan at 1/15 s: the SEPv3 platoon sharp, the runway torn into streaks',
    { set: 'kestrel-dawn-runway', film: 't34-runway-pan', tMs: 1500, exposureMs: 66 }),
  S(2, 'b02-lead-runway', 'Lead-car dolly', 'Camera car ahead at 50 km/h, 1/30 s: the platoon charges the lens',
    { set: 'kestrel-dawn-runway', film: 't09-runway-lead', tMs: 1600, exposureMs: 33 }),
  S(3, 'b03-pan-wadi', 'Panning shot', 'Leclerc XLR at 43 km/h through the wadi, panned at 1/20 s',
    { set: 'sirocco-noon-village', film: 't27-wadi-pan', tMs: 900, exposureMs: 50 }),
  S(4, 'b04-pan-ice', 'Panning shot', 'KF51 Panther column across the frozen lake, long-lens pan at 1/15 s',
    { set: 'glacier-dawn-lake', film: 't04-lake-pan', tMs: 1750, exposureMs: 66 }),
  S(5, 'b05-track-ice', 'Tracking shot', 'Car-to-car at ice level, 1/30 s: the lake surface becomes speed lines',
    { set: 'glacier-dawn-lake', film: 't05-lake-track', tMs: 1600, exposureMs: 33 }),
  S(6, 'b06-track-strand', 'Tracking shot', 'Leclerc XLR on the strand at sunset, tracked at 1/25 s',
    { set: 'saltmere-sunset-strand', film: 't15-strand-follow', tMs: 1500, exposureMs: 40 }),
  S(7, 'b07-track-harbor', 'Tracking shot', 'C2 Ariete column on the harbor road, tracked at 1/30 s',
    { set: 'saltwind-day-harbor', film: 't30-harbor-follow', tMs: 1400, exposureMs: 33 }),
  S(8, 'b08-track-night', 'Tracking shot', 'Leopard 2A7V under the street lamps, 1/15 s: every lamp a streak',
    { set: 'steinburg-night-street', film: 't40-street-follow', tMs: 1500, exposureMs: 66 }),
  S(9, 'b09-passby-fjord', 'Pass-by pan', 'Leopard 2A7V passes a metre from the lens at blue hour, 1/30 s',
    { set: 'nordhavn-dusk-fjord', film: 't16-fjord-passby', tMs: 1400, exposureMs: 33 }),
  S(10, 'b10-passby-lighthouse', 'Pass-by pan', 'SEPv3 sweeping past the lighthouse at sunset, 1/25 s',
    { set: 'saltmere-sunset-lighthouse', film: 't14-lighthouse-passby', tMs: 1300, exposureMs: 40 }),
  S(11, 'b11-static-speed', 'Locked-off speed blur', 'Locked-off camera, 1/20 s: the world holds still and the Leopard is a blur',
    { set: 'nordhavn-dusk-fjord', shot: { durMs: 2400, speed: 13, pinMs: 1200,
      cam: hold({ frame: 'world', lookFrame: 'world', side: 9, along: -2, lift: 1.0, fov: 40, lookHero: [0, 0, 1.5] }) }, tMs: 1200, exposureMs: 50 }),
  S(12, 'b12-chase-dust', 'Chase shot', 'Low chase behind the Leclerc XLR through its own dust, 1/30 s',
    { set: 'redrock-golden-canyon', shot: { durMs: 2600, speed: 11, cam: RIG.chase({ side: -2.2, along: [-14, -12], lift: 1.0, fov: 38, look: [0, 20, 1.4] }) }, tMs: 1500, exposureMs: 33 }),
  S(13, 'b13-lead-canyon', 'Lead-car dolly', 'Leclerc XLR wedge charging the camera car down the canyon floor',
    { set: 'redrock-golden-canyon', film: 't11-canyon-lead', tMs: 1500, exposureMs: 33 }),
  S(14, 'b14-orbit-canyon', 'Orbiting follow', 'Camera circling a moving Leclerc: the canyon wheels around it at 1/20 s',
    { set: 'redrock-golden-canyon', film: 't36-canyon-orbit', tMs: 1750, exposureMs: 50 }),
  S(15, 'b15-drone-mars', 'Drone follow', 'Top-down drone over the ZTZ-100 convoy on Olympus Basin, 1/25 s',
    { set: 'olympus-mars-convoy', film: 't37-mars-drone', tMs: 1800, exposureMs: 40 }),
  S(16, 'b16-drone-strand', 'Drone follow', 'Drone over the surf line: Leclerc XLR echelon on the beach at sunset',
    { set: 'saltmere-sunset-strand', film: 't43-strand-drone', shot: { cam: RIG.drone({ side: -9, along: [-12, -6], lift: [14, 12], fov: 44, look: [2, 10, 0] }) }, tMs: 1800, exposureMs: 40 }),
  S(17, 'b17-running-gear', 'Macro tracking', 'Running gear at 30 km/h, 1/30 s: road wheels and track links in motion',
    { set: 'monsoon-morning-ford', shot: { durMs: 2400, speed: 8, cam: RIG.follow({ side: [8.4, 8.1], along: [1.2, 0.8], lift: 0.4, fov: 30, look: [0, -0.8, 0.55] }) }, tMs: 1300, exposureMs: 33 }),
  S(18, 'b18-crane-ice', 'Crane rise', 'Crane rising behind the column: the lake opens beneath the KF51s',
    { set: 'glacier-dawn-lake', film: 't06-lake-crane', tMs: 2200, exposureMs: 33 }),
  // 2026-10-08 (the fifty frames' review on PR #9's maps): the set's gorge-wide pan held the hero 111 m out, a sliver on
  // the deck; a lens 7 m under the deck then saw only the viaduct's side wall with a turret over it, and a 14° lens just
  // over the deck half a frame of that wall (blur-v6). Now a long-lens pan across the gorge (top of the deck 1.7 m,
  // absolute heights): 9° from 60 m, 4.3 m over the deck, aimed over the hull, so the wall keeps the frame's lowest third
  // and the hills behind compress and streak
  S(19, 'b19-viaduct-pan', 'Panning shot', 'C2 Ariete column on the 200 m viaduct, panned from across the gorge',
    { set: 'aegis-morning-viaduct', shot: { durMs: 3200, speed: 6, absY: true, cam: RIG.pan({ side: -60, along: 6, lift: 6, fov: 9, look: [0, 4, 3.5] }) }, tMs: 1600, exposureMs: 40 }),
  S(20, 'b20-fireball-silhouette', 'Explosion', 'HE fireball over the Verdant farmsteads as the T-14 line advances',
    { set: 'verdant-day-assault', lineup: [CAST.t14, CAST.t90m, CAST.t14, CAST.t90m, CAST.kurganets], picture: { preset: 'ember', exposure: -0.35 }, shot: still(1700, { side: 1, along: -24, lift: 0.45, fov: 30, lookHero: [0, 70, 9] }, { effects: [huge(H(0, 72), 900), boom(H(-16, 60), 1100, 'large')] }), tMs: 1250, exposureMs: 8 }),

  // --- motion blur: the lens moves ---------------------------------------------------------
  S(21, 'b21-zoom-burst', 'Zoom burst', 'Zoomed through the exposure as the SEPv3 fires: the frame bursts outward',
    { set: 'steinburg-day-crossroads', shot: { durMs: 1800, speed: 0, effects: [fire('hero', 1170)],
      cam: [{ tMs: 0, side: 6, along: 22, lift: 1.3, fov: 40 }, { tMs: 1140, side: 6, along: 22, lift: 1.3, fov: 40 }, { tMs: 1260, side: 6, along: 22, lift: 1.3, fov: 28 }, { tMs: 'end', side: 6, along: 22, lift: 1.3, fov: 28 }] }, tMs: 1200, exposureMs: 120 }),
  S(22, 'b22-spin', 'Rotational blur', 'Camera rolled 20 degrees inside 1/8 s: Blackglass spins around the KF51',
    { set: 'blackglass-day-towers', shot: { durMs: 1800, speed: 0,
      cam: [{ tMs: 0, side: 6, along: 11, lift: 0.7, fov: 46, roll: -10, lookHero: [0, 0, 1.6] }, { tMs: 1130, side: 6, along: 11, lift: 0.7, fov: 46, roll: -10, lookHero: [0, 0, 1.6] }, { tMs: 1270, side: 6, along: 11, lift: 0.7, fov: 46, roll: 10, lookHero: [0, 0, 1.6] }, { tMs: 'end', side: 6, along: 11, lift: 0.7, fov: 46, roll: 10, lookHero: [0, 0, 1.6] }] }, tMs: 1200, exposureMs: 125 }),
  S(23, 'b23-whip-pan', 'Whip pan', 'Whip pan from one T-14 to the next as the line fires',
    { set: 'verdant-day-assault', lineup: [CAST.t14, CAST.t90m, CAST.t14, CAST.t90m, CAST.kurganets], shot: { durMs: 1800, speed: 0, effects: [burn('foe0', 0), fire('hero', 1000), fire('ally2', 1300)],
      cam: [{ tMs: 0, frame: 'world', side: -12, along: 6, lift: 1.8, fov: 34, lookActor: 'hero', lookHero: [0, 0, 1.8] }, { tMs: 1140, frame: 'world', side: -12, along: 6, lift: 1.8, fov: 34, lookActor: 'hero', lookHero: [0, 0, 1.8] },
        { tMs: 1260, frame: 'world', side: -12, along: 6, lift: 1.8, fov: 34, lookActor: 'ally2', lookHero: [0, 0, 1.8] }, { tMs: 'end', frame: 'world', side: -12, along: 6, lift: 1.8, fov: 34, lookActor: 'ally2', lookHero: [0, 0, 1.8] }] }, tMs: 1200, exposureMs: 50 }),
  S(24, 'b24-dolly-zoom', 'Dolly zoom', 'Vertigo: the camera rushes in while the lens widens, the avenue stretches behind the T-14',
    { set: 'ruinspires-dusk-avenue', shot: { durMs: 1800, speed: 0, keepWidth: true,
      cam: [{ tMs: 0, side: 0.8, along: 34, lift: 1.5, fov: 14, lookHero: [0, 0, 1.6] }, { tMs: 1050, side: 0.8, along: 34, lift: 1.5, fov: 14, lookHero: [0, 0, 1.6] }, { tMs: 1350, side: 0.8, along: 13, lift: 1.5, fov: 14, lookHero: [0, 0, 1.6] }, { tMs: 'end', side: 0.8, along: 13, lift: 1.5, fov: 14, lookHero: [0, 0, 1.6] }] }, tMs: 1200, exposureMs: 250 }),
  S(25, 'b25-shake-impact', 'Shock shake', 'Near miss: the HE round lands beside the Leopard and the camera takes the blast',
    { set: 'steinburg-night-street', shot: { durMs: 1800, speed: 2, effects: [flare([40, 10], 0, { heightM: 100, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), boom(H(-4.5, 3), 1150, 'large'), debris(H(-4.5, 3), 1160, { count: 40, speedMps: 22 })],
      cues: [{ tMs: 1150, durationMs: 500, amplitudeM: 0.22, rollDeg: 3, fovKickDeg: 4, frequencyHz: 18, seed: 7 }],
      cam: RIG.chase({ side: -3, along: [-11, -10], lift: 1.4, fov: 44, look: [0, 30, 2] }) }, tMs: 1220, exposureMs: 40 }),
  S(26, 'b26-turret-whip', 'Turret slew', 'Leclerc XLR slews its turret 100 degrees in a third of a second, 1/15 s',
    { set: 'sirocco-noon-village', shot: { durMs: 1800, speed: 0, turretKeys: [[0, -70], [1050, -70], [1350, 30], [1800, 30]], effects: [burn('foe0', 0)],
      cam: hold({ side: 7, along: 9, lift: 1.2, fov: 40, lookHero: [0, 0, 2] }) }, tMs: 1200, exposureMs: 66 }),
  S(27, 'b27-recoil', 'Recoil and blast', 'T-90M fires: recoil, muzzle blast and the dust ring at 1/25 s',
    { set: 'verdant-day-assault', shot: still(1800, { side: 4.5, along: 9.5, lift: 0.45, fov: 38 }, { effects: [burn('foe0', 0), fire('hero', 1190), shockwave(H(0, 7), 1195, { radiusM: 14 })] }), tMs: 1215, exposureMs: 40 }),
  S(28, 'b28-handheld', 'Handheld chase', 'Handheld behind the Leopard in the burning village, 1/30 s',
    { set: 'frosthollow-night-village', shot: { durMs: 2600, speed: 5, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0)],
      cues: [{ tMs: 0, durationMs: 2600, amplitudeM: 0.06, rollDeg: 1.2, fovKickDeg: 0, frequencyHz: 9, seed: 3 }],
      cam: RIG.chase({ side: -3.5, along: [-14, -12], lift: 2.0, fov: 42, look: [0, 30, 2] }) }, tMs: 1500, exposureMs: 33 }),

  // --- long exposures: light painting ----------------------------------------------------------
  S(29, 'b29-tracers', 'Long exposure', 'Half-second exposure: machine-gun tracers draw lines across Frosthollow',
    { set: 'frosthollow-night-village', shot: still(2000, { side: -3, along: -14, lift: 2.4, fov: 44, lookHero: [0, 40, 2] }, { effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), mg('hero', 900, 18), mg('ally1', 1000, 18), mg('ally2', 1100, 14)] }), tMs: 1250, exposureMs: 500 }),
  S(30, 'b30-salvo-longexp', 'Long exposure', 'Four T-14 and T-90M guns in one half-second frame',
    { set: 'ironworks-night-yard', shot: still(1800, { side: 6, along: 22, lift: 1.0, fov: 40, lookHero: [-6, 0, 1.8] }, { effects: [flare([40, -60], 0, { heightM: 110, burnS: 40, intensity: 1.3, driftMps: 1.2 }), fireField([60, -110], 0), fire('hero', 1000), fire('ally1', 1100), fire('ally2', 1200), fire('ally3', 1300)] }), tMs: 1180, exposureMs: 450 }),
  S(31, 'b31-barrage-longexp', 'Long exposure', 'Counter-battery barrage behind the Ironworks line, 0.4 s exposure',
    { set: 'ironworks-night-yard', shot: still(1800, { side: -14, along: -20, lift: 3, fov: 42, lookHero: [0, 30, 3] }, { effects: [flare(H(0, 40), 0, { heightM: 90, burnS: 40, intensity: 1.4, driftMps: 1.0 }), barrage(H(4, 32), 650, 8, 14)] }), tMs: 1100, exposureMs: 400 }),
  S(32, 'b32-embers', 'Long exposure', 'Embers streaming off a burning T-90M wreck, 1/4 s',
    { set: 'ironworks-night-yard', lineup: [CAST.t14, CAST.t90m], shot: still(2600, { side: 5, along: 10, lift: 1.2, fov: 40, lookHero: [-2, 6, 2] },
      { effects: [flare([40, -60], 0, { heightM: 80, intensity: 1.0 }), burn('ally1', 0), embers('ally1', 0, { rate: 55, rise: 4, durationS: 30 }), fireField([60, -110], 0)] }), tMs: 2000, exposureMs: 250 }),
  S(33, 'b33-flare-fall', 'Long exposure', 'An illumination flare sinks over the snow; its light swings the Leopard\'s shadow',
    { set: 'frosthollow-night-village', shot: still(3200, { side: -10, along: 16, lift: 1.4, fov: 46, lookHero: [2, 4, 6] }, { effects: [flare([-84, -70], 0, { heightM: 110, burnS: 40, launch: true, intensity: 1.4, driftMps: 1.0 }), burn('foe0', 0)] }), tMs: 2400, exposureMs: 500 }),
  S(34, 'b34-headlights', 'Light trails', 'Blacked-out street, headlights on: the Leopard column drawn as light at 1/4 s',
    { set: 'steinburg-night-street', shot: { durMs: 2600, speed: 9, effects: [burn('foe0', 0)], cam: hold({ frame: 'world', lookFrame: 'world', side: -3, along: 34, lift: 1.2, fov: 40, lookHero: [0, 0, 1.4] }) }, tMs: 1500, exposureMs: 400 }),

  // --- camera language (crisp shutter) ---------------------------------------------------------
  S(35, 'b35-silhouette-sun', 'Silhouette', 'SEPv3 column on the sun line at Saltmere',
    { set: 'saltmere-sunset-lighthouse', backlight: { offsetDeg: 4, elevationDeg: 3 }, shot: still(1500, { side: 3, along: 26, lift: 0.4, fov: 30, lookHero: [0, -10, 2.4] }), tMs: 900, exposureMs: 8 }),
  S(36, 'b36-backlit-dust', 'Backlight', 'Leclerc XLR backlit through its own dust at golden hour',
    { set: 'redrock-golden-canyon', backlight: { offsetDeg: 18, elevationDeg: 6 }, shot: { durMs: 2400, speed: 7, cam: RIG.lead({ side: 4, along: [22, 18], lift: 0.8, fov: 34 }) }, tMs: 1600, exposureMs: 16 }),
  // The rack-focus pair keeps its depth of field: the focus change is the frame (the media's one exception to deep focus).
  S(37, 'b37-rack-near', 'Rack focus (near)', 'Focus on the K2 Black Panther in the foreground, the burning T-90M soft',
    { set: 'amberford-golden-ford', picture: { dof: { enabled: true, focusActor: 'hero', fStop: 1.8, sensor: 'super35', anamorphic: 0.4 } },
      shot: still(2600, { side: -3.5, along: -10, lift: 2.6, fov: 26, lookHero: [6, 100, 2] }, { effects: [burn('foe0', 0), smoke('foe0', 0)] }), tMs: 2000, exposureMs: 8 }),
  S(38, 'b38-rack-far', 'Rack focus (far)', 'The same frame racked to the burning T-90M',
    { set: 'amberford-golden-ford', picture: { dof: { enabled: true, focusActor: 'foe0', fStop: 1.8, sensor: 'super35', anamorphic: 0.4 } },
      shot: still(2600, { side: -3.5, along: -10, lift: 2.6, fov: 26, lookHero: [6, 100, 2] }, { effects: [burn('foe0', 0), smoke('foe0', 0)] }), tMs: 2000, exposureMs: 8 }),
  S(39, 'b39-dutch', 'Dutch angle', 'T-14 Armata at a 14 degree Dutch tilt in the Ruinspires',
    { set: 'ruinspires-dusk-avenue', shot: still(1600, { side: 4, along: 8, lift: 0.6, fov: 50, roll: 14, lookHero: [0, 2, 2.2] }, { effects: [burn('foe0', 0), smoke('foe0', 0)] }), tMs: 1000, exposureMs: 8 }),
  S(40, 'b40-ultrawide', 'Ultra-wide worm', 'KF51 Panther gun tube over an ultra-wide lens, towers behind',
    { set: 'blackglass-day-towers', shot: still(1600, { side: 1.6, along: 6.5, lift: 0.4, fov: 88, lookHero: [0, 0, 2.4] }), tMs: 1000, exposureMs: 8 }),
  S(41, 'b41-tele-compress', 'Telephoto compression', 'The SEPv3 platoon stacked by a long lens, 260 m down the runway',
    { set: 'kestrel-dawn-runway', formation: [[0, 0], [1.4, -12], [-1.2, -24], [1.8, -36], [0, -48]], shot: { durMs: 2000, speed: 10, cam: hold({ side: 0.6, along: 62, lift: 1.6, fov: 10, lookHero: [0, -18, 1.8] }) }, tMs: 1200, exposureMs: 16 }),
  S(42, 'b42-ots', 'Over the shoulder', 'Over the T-90M\'s turret toward the burning line',
    { set: 'verdant-day-assault', shot: still(2600, { side: -1.4, along: -5.5, lift: 3.0, fov: 30, lookHero: [-4, 80, 2] }, { effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), boom([-20, 40], 1800, 'large')] }), tMs: 2100, exposureMs: 8 }),
  S(43, 'b43-cookoff', 'Explosion', 'Ammunition cook-off: the T-90M turret leaves the hull',
    { set: 'redrock-golden-kill', shot: still(1400, { side: 18, along: 64, lift: 1.6, fov: 34, lookHero: [3, 72, 3] }, { effects: [fire('hero', 300), pen('foe0', 380), kill('foe0', 430), debris('foe0', 450)] }), tMs: 640, exposureMs: 16 }),
  // 2026-10-08: the hero sat 47 m down the deck, small; now a worm's view 1.2 m over the deck (top 1.7 m) 18 m ahead, the
  // parapets converging on the column behind it
  S(44, 'b44-leading-lines', 'Leading lines', 'Parapets converge on the C2 Ariete column across the Aegis viaduct',
    { set: 'aegis-morning-viaduct', shot: { durMs: 1600, speed: 3, absY: true, cam: hold({ side: 0.4, along: 18, lift: 2.9, fov: 34, lookHero: [0, -12, 2.6] }) }, tMs: 1000, exposureMs: 8 }),
  S(45, 'b45-symmetry', 'Symmetry', 'Head-on down the Kestrel runway: SEPv3 and Leopard 2A7V in perfect symmetry',
    { set: 'kestrel-dawn-runway', lineup: [CAST.sepv3, CAST.leo], formation: [[-6, 0], [6, 0]], shot: still(1600, { side: 6, along: 30, lift: 1.2, fov: 22, lookHero: [6, 0, 1.6] }), tMs: 1000, exposureMs: 8 }),
  S(46, 'b46-reflection', 'Reflection', 'KF51 Panther mirrored in the frozen lake',
    { set: 'glacier-dawn-lake', shot: { durMs: 2000, speed: 3, cam: hold({ side: 7, along: 13, lift: 0.14, fov: 30, lookHero: [0, 0, 0.9] }) }, tMs: 1200, exposureMs: 16 }),
  S(47, 'b47-split-light', 'Split lighting', 'T-14 between foundry fire and moonlight',
    { set: 'ironworks-night-yard', shot: still(1800, { side: 3.2, along: 9, lift: 0.8, fov: 36, lookHero: [0, 0, 1.8] }, { effects: [fireField(H(5, 1), 0, { radiusM: 3 }), embers(H(5, 1), 0), flare([40, -60], 0, { heightM: 80, intensity: 0.8 })] }), tMs: 1300, exposureMs: 8 }),
  S(48, 'b48-blue-hour', 'Blue hour', 'Leopard 2A7V and CV90 Mk IV at the fjord, harbor lights coming on',
    { set: 'nordhavn-dusk-fjord', shot: { durMs: 2400, speed: 3, cam: hold({ side: -20, along: 10, lift: 2, fov: 38, lookHero: [0, -12, 2] }) }, tMs: 1400, exposureMs: 33 }),
  S(49, 'b49-earthrise', 'Scale', 'KF51 Panther under Earthrise',
    { set: 'earthrise-moon', shot: { durMs: 2400, speed: 3, cam: hold({ side: -4, along: -28, lift: 2, fov: 46, lookHero: [0, 60, 12] }) }, tMs: 1400, exposureMs: 33 }),
  S(50, 'b50-mars-scale', 'Scale', 'The ZTZ-100 convoy, small on Olympus Basin',
    { set: 'olympus-mars-convoy', shot: { durMs: 2400, speed: 6, cam: hold({ side: 120, along: 40, lift: 22, fov: 30, lookHero: [0, -20, 0] }) }, tMs: 1400, exposureMs: 33 }),
];

function bearingDeg(from, to) { return (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180 / Math.PI + 360) % 360; }

export function frameScene(fr) {
  const set = setById(fr.set);
  const film = fr.film ? filmById(fr.film).film : null;
  const time = fr.time ?? film?.time ?? set.time;
  const ov = (o) => o ? { ...(o.lineup ? { lineup: o.lineup } : {}), ...(o.formation ? { formation: o.formation, count: o.count } : {}),
    ...(o.anchor ? { anchor: o.anchor } : {}), ...(o.heading != null ? { heading: o.heading } : {}), ...('enemies' in o ? { enemies: o.enemies } : {}) } : {};
  const base = { ...set, ...ov(film), ...ov(fr),
    time: T(time), picture: pictureFor({ ...set, time }, fr.picture ?? {}), light: fr.light ?? set.light };
  const shot = { ...(film ?? {}), ...(fr.shot ?? {}), still: { tMs: fr.tMs, exposureMs: fr.exposureMs } };
  const scene = buildShot(base, shot);
  if (set.autoPlace === false) scene.autoPlace = false;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  if (!fr.backlight && LIGHT_READY) { const az = sunFor(scene, fr.sun ?? film?.sun ?? set.sun, time); if (az != null) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az }; }
  if (fr.backlight) { // put the sun on the lens axis (silhouette) or just off it (rim light)
    const sh = scene.storyboard.shots[0];
    scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: +(bearingDeg(sh.pos, sh.lookAt) + (fr.backlight.offsetDeg ?? 0)).toFixed(1), sunElevationDeg: fr.backlight.elevationDeg ?? 4 };
  }
  const heroId = scene.actors[0]?.id;
  scene.meta = { frame: fr.n, id: fr.id, technique: fr.technique, title: fr.title, set: set.id, map: set.map, time, film: fr.film ?? null,
    hero: heroId, heroName: CAST_NAMES[heroId]?.[0] ?? heroId, exposureMs: fr.exposureMs, tMs: fr.tMs };
  return scene;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? 'shots/media-r5/blur50-scenes';
  const only = process.argv[3]?.split(',');
  mkdirSync(out, { recursive: true });
  const manifest = [];
  for (const fr of FRAMES) {
    if (only && !only.includes(fr.id) && !only.includes(String(fr.n))) continue;
    const scene = frameScene(fr);
    writeFileSync(join(out, `${fr.id}.json`), JSON.stringify(scene, null, 1));
    manifest.push(scene.meta);
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const ids = new Set(FRAMES.map(f => f.id));
  console.log(`${manifest.length} frames -> ${out} (light ${LIGHT_READY ? 'ready' : 'fallback'})${ids.size !== FRAMES.length ? ' DUPLICATE IDS' : ''}`);
}
