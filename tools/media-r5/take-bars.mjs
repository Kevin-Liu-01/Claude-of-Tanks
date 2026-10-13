// Every per-take bar the site takes are held to (site50.selftest's, 2026-10-02 onward), as a list of problems instead
// of the first failed assertion, so the fleet's selftest, the motion search's re-plans and a chain's plan check share
// one definition. A take passes with an empty list.
//   import { takeBars } from './take-bars.mjs'; takeBars(shot) -> ['s61-…: the hero stays in frame (0.81)', …]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAP_IDS } from '../../src/world/maps/mapIds.ts';
import { CAST } from './cast.mjs';
import { DUR, KINDS, LOOP_MS, XFADE_MS, beatCoverage, siteScene } from './site50.mjs';
import { blockedFraction, heroInFrameFraction } from './camera-clearance.mjs';
import { propProblems, routeProblems, waterBlocks } from './route-check.mjs';
import { worldModel } from './world-model.mjs';
import { lensReport } from './lens-check.mjs';
import { STUDIO_MAX_ACTOR_KEYS, STUDIO_MAX_CAMERA_SHOTS } from './setups.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const HOURS = new Set(['morning', 'day', 'golden', 'sunset', 'night']);
const ONE_SHOT = new Set(['fire', 'tank_kill', 'impact', 'explosion', 'barrage', 'debris', 'shockwave', 'mg_burst']);
const COMBAT = new Set(['fire', 'tank_kill', 'impact', 'explosion', 'barrage', 'mg_burst']);
const BURNING = new Set(['burning', 'engine_smoke', 'fire_field']);
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const trackAt = (keys, t, f) => { let i = 0; while (i < keys.length - 2 && keys[i + 1].tMs <= t) i++; const a = keys[i], b = keys[i + 1] ?? a; const u = Math.min(1, Math.max(0, (t - a.tMs) / Math.max(1, b.tMs - a.tMs))); return a[f] + (b[f] - a[f]) * u; };
const features = new Map();
const featuresOf = (map) => {
  if (!features.has(map)) { const f = join(SHOTS_DIR, 'features', `features-${map}.json`); features.set(map, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null); }
  return features.get(map);
};

/** The take's problems against every per-take bar; `cast` widens the tanks a non-foe may be (the fleet's own heroes). */
export function takeBars(shot, { cast = new Set(Object.values(CAST)), scene = siteScene(shot) } = {}) {
  const [n, id, kind, title] = shot, out = [], no = (ok, what) => { if (!ok) out.push(`${scene.meta?.id ?? id}: ${what}`); };
  no(KINDS.includes(kind), 'kind');
  no(/^[A-Z]/.test(title) && title.length >= 12 && !/[.]$/.test(title), 'a plain sentence-case title');
  no(!/\bX\b|X[ -]?(fleet|tank)/i.test(title), 'no fleet-tier naming');
  no(MAP_IDS.includes(scene.map), `${scene.map} is a battlefield`);
  no(HOURS.has(scene.meta.time), `a planned hour (${scene.meta.time})`);
  if (scene.meta.time === 'night') no(scene.effects.some((e) => e.type === 'flare'), 'a night fight is lit by a flare');
  no(scene.picture?.dof?.enabled === false, 'deep focus');
  no(scene.picture?.chromaticAberration === 0, 'no colour fringing');
  no(scene.meta.id === `s${String(n).padStart(2, '0')}-${id}`, 'its id');
  const dur = scene.storyboard.durationMs, ramp = Array.isArray(scene.film?.speed) && scene.film.speed.length > 0;
  no(ramp || dur === DUR, `one ${DUR} ms take`);
  no(scene.film.fps === 30, '30 fps');
  no(scene.storyboard.shots.length >= 2, 'a moving lens');
  const inFrame = heroInFrameFraction(scene), blocked = blockedFraction(scene);
  no(inFrame >= 0.9, `the hero stays in frame (${inFrame.toFixed(2)})`);
  no(blocked <= 0.1, `the lens clears the buildings (${blocked.toFixed(2)} blocked)`);
  const feat = featuresOf(scene.map), model = feat && worldModel(feat), tracks = scene.storyboard.actorTracks ?? [];
  if (feat && tracks.length) {
    const bad = routeProblems(scene, feat, { water: waterBlocks(scene) }).filter((p) => !/^foe\d+(\+foe\d+)?$/.test(p.actor));
    no(!bad.length, `the routes clear walls, woods, water and the other hulls (${bad.map((p) => `${p.actor} ${p.what}`).join('; ')})`);
  }
  if (model && tracks.length) {
    const props = propProblems(scene, model).filter((p) => !/^foe\d+$/.test(p.actor));
    no(!props.length, `the routes crush what they can and meet nothing else (${props.map((p) => `${p.actor} ${p.what}`).join('; ')})`);
    const lens = lensReport(scene, model);
    no(lens.blocked <= 0.05, `the lens sees the hero past the props (${(lens.blocked * 100).toFixed(0)} %: ${lens.worst.map((w) => `${w.tMs} ms ${w.by}`).join(', ')})`);
    no(lens.inside === 0, `the lens never passes inside a building, wall or prop (${(lens.inside * 100).toFixed(0)} %)`);
    const cov = beatCoverage(scene, model);
    no(cov.some(Boolean), `a burst in the frame at one beat at least (${cov})`);
  }
  no(scene.meta.still.tMs > 0 && scene.meta.still.tMs < dur, 'the still moment lies inside the take');
  for (const a of scene.actors.filter((x) => !x.name.startsWith('foe'))) no(cast.has(a.id), `${a.name} is a cast tank (${a.id})`);
  const types = new Set(scene.effects.map((e) => e.type));
  no([...types].some((t) => COMBAT.has(t)), 'something fires, hits or explodes');
  for (const fx of scene.effects.filter((e) => e.actor)) no(scene.actors.some((a) => a.name === fx.actor), `${fx.type} at ${fx.tMs} ms belongs to a staged tank (${fx.actor})`);
  no(scene.actors.some((a) => a.name.startsWith('foe') && /burn/.test(a.state ?? '')) || [...types].some((t) => BURNING.has(t)), 'something burns');
  for (const fx of scene.effects.filter((e) => e.type === 'explosion')) no(fx.params?.cause === 'shot', `the blast at ${fx.tMs} ms is a shot`);
  if (!ramp) for (const fx of scene.effects.filter((e) => ONE_SHOT.has(e.type))) no(fx.tMs >= XFADE_MS && fx.tMs <= dur - XFADE_MS, `${fx.type} at ${fx.tMs} ms sits in the loop body`);
  // turrets: keyed, within the Studio's caps, the seam law for hulls that stay put, a real turret's speed, knockout rounds laid
  const sb = scene.storyboard;
  no(['sectors', 'flank', 'lens'].includes(scene.meta.turrets?.style), 'a turret style');
  no(sb.shots.length <= STUDIO_MAX_CAMERA_SHOTS && sb.shots.at(-1).tMs === sb.durationMs, `the lens fits the Studio's ${STUDIO_MAX_CAMERA_SHOTS} keys and runs to the end`);
  for (const tr of tracks) no(tr.keys.length <= STUDIO_MAX_ACTOR_KEYS && tr.keys.at(-1).tMs === sb.durationMs, `${tr.actor}'s track fits ${STUDIO_MAX_ACTOR_KEYS} keys and runs to the end`);
  const heroKeys = tracks.find((tr) => tr.actor === 'hero')?.keys;
  const moving = heroKeys && (() => { const at = (t) => { let i = 0; while (i < heroKeys.length - 2 && heroKeys[i + 1].tMs <= t) i++; return heroKeys[i].pos; }; const a = at(0), b = at(LOOP_MS); return Math.hypot(b[0] - a[0], b[1] - a[1]) > 5; })();
  for (const a of scene.actors.filter((x) => !x.name.startsWith('foe'))) {
    const keys = tracks.find((tr) => tr.actor === a.name)?.keys;
    if (!(keys?.length > 2)) { out.push(`${scene.meta.id}: ${a.name}'s turret is keyed`); continue; }
    for (let t = 0; t <= XFADE_MS && !moving; t += 50) {
      const seam = Math.abs(wrap(trackAt(keys, t, 'turretDeg') - trackAt(keys, t + LOOP_MS, 'turretDeg')));
      if (seam >= 0.5) { out.push(`${scene.meta.id}: ${a.name}'s turret at ${t} ms differs from ${t + LOOP_MS} ms by ${seam.toFixed(2)}°`); break; }
    }
    let fastest = 0;
    for (let i = 1; i < keys.length; i++) fastest = Math.max(fastest, Math.abs(wrap(keys[i].turretDeg - keys[i - 1].turretDeg)) / ((keys[i].tMs - keys[i - 1].tMs) / 1000));
    no(fastest <= 70, `${a.name} traverses at ${fastest.toFixed(0)}°/s`);
  }
  for (const k of scene.effects.filter((e) => e.type === 'tank_kill')) {
    const shotFx = scene.effects.filter((e) => e.type === 'fire' && !e.actor.startsWith('foe') && e.tMs <= k.tMs && e.tMs >= k.tMs - 400).at(-1);
    if (!shotFx) continue;
    const keys = tracks.find((tr) => tr.actor === shotFx.actor).keys, foe = scene.actors.find((f) => f.name === k.actor);
    let i = 0; while (i < keys.length - 2 && keys[i + 1].tMs <= shotFx.tMs) i++;
    const pos = keys[i].pos, want = wrap(Math.atan2(foe.pos[0] - pos[0], foe.pos[1] - pos[1]) * 180 / Math.PI - trackAt(keys, shotFx.tMs, 'facingDeg'));
    no(Math.abs(wrap(trackAt(keys, shotFx.tMs, 'turretDeg') - want)) < 3, `${shotFx.actor}'s knockout round is laid on ${k.actor}`);
  }
  // every effect fires: the Studio names unnamed effects fx<n> in time order and fires each name once
  let seq = 1;
  const names = [...(scene.effects ?? [])].sort((a, b) => (a.tMs ?? 0) - (b.tMs ?? 0)).map((e) => {
    const name = e.id || `fx${seq++}`, m = /^fx(\d+)$/.exec(name);
    if (m) seq = Math.max(seq, Number(m[1]) + 1);
    return name;
  });
  const twice = names.filter((x, k) => names.indexOf(x) !== k);
  no(!twice.length, `effects share the Studio names ${[...new Set(twice)].join(', ')}`);
  return out;
}

// node tools/media-r5/take-bars.mjs <n,n,...>: the named takes' problems, one line each; exit 1 when any has one
import { fileURLToPath as toPath } from 'node:url';
if (process.argv[1] && toPath(import.meta.url) === process.argv[1]) {
  const { FLEET, OWNER_NINE, SHOTS } = await import('./site50.mjs');
  const { PRODUCTION_TANK_IDS } = await import('../../src/vehicles/specs.ts');
  const want = new Set((process.argv[2] ?? '').split(',').filter(Boolean).map(Number));
  const cast = new Set([...Object.values(CAST), ...PRODUCTION_TANK_IDS]);
  let bad = 0;
  for (const shot of [...SHOTS, ...OWNER_NINE, ...FLEET].filter(([n]) => want.has(n))) {
    const problems = takeBars(shot, { cast });
    bad += problems.length ? 1 : 0;
    console.log(problems.length ? problems.join('\n') : `s${String(shot[0]).padStart(2, '0')}-${shot[1]}: clear`);
  }
  console.log(`== ${want.size - bad}/${want.size} clear`);
  process.exit(bad ? 1 : 0);
}
