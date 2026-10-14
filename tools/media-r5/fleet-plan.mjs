#!/usr/bin/env node
// The fleet takes' plan (owner 2026-10-12: "make a special video for all tanks since it shouldnt be too hard on a wider
// variety of maps and use that everywhere"): every production vehicle that leads none of the site takes (the fifty and
// the owner's nine) leads one of its own. Writes tools/media-r5/fleet-roster.json, which site50.mjs turns into FLEET:
//  - the battlefield: all 33 maps, about five takes each, each nation on the ground it fights on (FIELDS), the maps the
//    fifty never used first;
//  - the set: an anchor the battlefield's own records leave room for (flat, dry, clear for the column and the 90 m ahead
//    where its enemy stands, off the edge, lived-in around), on a road when one passes, 150 m from the map's other takes;
//  - the hour: mostly day, then golden, sunset, morning and night (a night take carries a flare);
//  - the action: one of the fifty's best-scored takes (wave m3, the lower critic counting) as the template for its
//    effects, still and kind; the motion search then plans its routes and lens on its own set;
//  - the cast: allies of its own nation and era, foes of an opposing one (no model on both sides: the Studio paints per
//    model); the paint: the tank's own signature scheme, else its nation's stock coat, the foes their own;
//  - the titles in English and Chinese, from the action and the map's own names (map.<id> in the catalogs).
//   node tools/media-r5/fleet-plan.mjs --fresh [--features=<dir>] [--only=<hero,...>]   (deterministic; afresh after a survey)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/vehicles/tankFactory.ts';
import { PRODUCTION_TANK_IDS, TANK_SPECS } from '../../src/vehicles/specs.ts';
import { signatureCamoPatternId, stockCamoPatternIdFor } from '../../src/vehicles/camoPolicy.ts';
import { MAP_IDS } from '../../src/world/maps/mapIds.ts';
import { anchorsFinder } from './fleet-anchors.mjs';
import { CAST_NAMES } from './cast.mjs';
import { OWNER_NINE, SHOTS, siteScene } from './site50.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const FEATURES = arg('features') ?? process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features');
const OUT = join(HERE, 'fleet-roster.json');
// the roster's motion plans (site50-motion.json) are keyed by take and fit its anchors: planning afresh moves anchors and
// voids them, so an existing roster is kept unless --fresh (single takes move with fleet-replan.mjs)
if (existsSync(OUT) && !process.argv.includes('--fresh') && !arg('only')) {
  console.log(`[fleet-plan] ${OUT} exists; --fresh plans every take again (and voids their motion plans); fleet-replan.mjs moves single takes`);
  process.exit(0);
}
const FIRST_N = 60;

// --- who ------------------------------------------------------------------------------------------------------------
const siteHeroes = [...SHOTS, ...OWNER_NINE].map((shot) => [siteScene(shot).actors[0].id, siteScene(shot).meta.id, shot[0] > 50]);
const led = new Set(siteHeroes.map(([hero]) => hero));
const only = arg('only')?.split(',');
const heroes = PRODUCTION_TANK_IDS.filter((id) => !led.has(id) && (!only || only.includes(id)));
const spec = (id) => TANK_SPECS[id];
// a spec name a title cannot carry as it is: the Type 10's "(TK-X)" reads as the retired X tier (site50.selftest)
const TITLE_NAMES = { type10: { en: 'Type 10 prototype', zh: 'Type 10 原型车' } };
const nameOf = (id) => TITLE_NAMES[id]?.en ?? CAST_NAMES[id]?.[0] ?? spec(id).name;
const zhNameOf = (id) => TITLE_NAMES[id]?.zh ?? nameOf(id);
const EAST = new Set(['Russia', 'USSR/Russia', 'USSR', 'China']);
const old = (id) => ['cold-war', 'ww2'].includes(spec(id).era);
// the opposing force, by side and era (the source-backed models where the fleet has them)
const FOES = {
  westOld: ['t62mv1_x', 't72b_1987_x', 't64bv1'], westNew: ['t72b3_x', 't90a_x', 't80u_x', 't90m_x', 't72b3m_x'],
  eastOld: ['m60a3', 'chieftain5', 'leo1a5'], eastNew: ['leo2a6_x', 'm1a2_x', 'challenger1_x'],
  chinaOld: ['m60a3', 'type74', 'm48'], chinaNew: ['m1a2_x', 'type10_x', 'k2_x'],
};
const foePool = (id) => {
  const n = spec(id).nation;
  if (n === 'China') return old(id) ? FOES.chinaOld : FOES.chinaNew;
  if (EAST.has(n)) return old(id) ? FOES.eastOld : FOES.eastNew;
  return old(id) ? FOES.westOld : FOES.westNew;
};
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// --- where ----------------------------------------------------------------------------------------------------------
// each nation on the ground it fights on; Mars and the Moon take a few of the newest
const FIELDS = {
  Germany: ['polders', 'autumn', 'longleaf', 'verdant', 'frontier', 'ruinspires', 'urban'],
  USA: ['desert', 'badlands', 'copper_mesa', 'airfield', 'frontier', 'steppe'],
  UK: ['coastal', 'saltwind', 'fjord', 'polders', 'railyard'],
  France: ['autumn', 'orchard', 'coastal', 'verdant'],
  Italy: ['caldera', 'cliffbridge', 'orchard'],
  Russia: ['steppe', 'whiteout', 'blackglass', 'foundry', 'winter', 'urban', 'railyard'],
  'USSR/Russia': ['steppe', 'winter', 'blackglass', 'foundry', 'whiteout'],
  USSR: ['winter', 'steppe'],
  China: ['delta', 'mangrove', 'titan_gorge', 'skybridge', 'monsoon'],
  Japan: ['mangrove', 'skybridge', 'cliffbridge', 'monsoon'],
  'South Korea': ['titan_gorge', 'monsoon', 'delta'],
  Poland: ['autumn', 'winter', 'polders', 'longleaf'],
  Sweden: ['whiteout', 'longleaf', 'fjord', 'winter'],
  Israel: ['desert', 'badlands', 'copper_mesa', 'oasis', 'caldera'],
  Ukraine: ['steppe', 'autumn', 'frontier', 'winter'],
};
const SPACE = ['mars', 'moon'];
const FIFTY_MAPS = new Set(['urban', 'verdant', 'alpine', 'oasis', 'fjord', 'monsoon', 'railyard', 'foundry', 'frontier', 'delta', 'winter', 'orchard', 'reservoir']);
const CAP = 7;
const EN = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const ZH = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
const cat = (c, id) => c[`map.${id}`] ?? c.map?.[id];
const mapName = (id) => ({ en: cat(EN, id) ?? id, zh: cat(ZH, id) ?? cat(EN, id) ?? id });

const { anchorsOf } = anchorsFinder(FEATURES);
const rad = (d) => d * Math.PI / 180;

// --- what -----------------------------------------------------------------------------------------------------------
// the fifty's best by wave m3 (the lower critic counting), with the action each one shows (kill: its first round
// knocks out foe0)
const TEMPLATES = [
  [20, 'returnFire'], [7, 'shellfire'], [21, 'assault'], [23, 'hold'], [24, 'kill'], [39, 'fires'], [26, 'onTheMove'],
  [6, 'artillery'], [49, 'column'], [38, 'kill'], [19, 'fires'], [18, 'kill'], [5, 'column'], [4, 'column'],
  [36, 'kill'], [29, 'kill'], [27, 'kill'],
];
const NIGHT_TEMPLATES = [[33, 'night'], [18, 'kill'], [38, 'kill']];
const HOURS = ['day', 'golden', 'day', 'morning', 'day', 'sunset', 'day', 'night', 'day', 'golden'];
const article = (name) => (/^[AEIOU]/i.test(name) || /^[FHLMNRSX](?=[A-Z0-9-]|$)/.test(name) ? 'An' : 'A');
const a = (name) => `${article(name)} ${name}`;
const HOUR_EN = { golden: ' in the evening light', sunset: ' at sunset', morning: ' in the morning', night: ' at night', day: '' };
const HOUR_ZH = { golden: '傍晚，', sunset: '日落时分，', morning: '清晨，', night: '夜间，', day: '' };
function titles(action, name, foe, map, time, zhName = name, zhFoe = foe) {
  const m = mapName(map), h = action === 'night' ? '' : HOUR_EN[time];
  const en = {
    returnFire: `${a(name)} returns fire across ${m.en}${h}`, shellfire: `${a(name)} crosses ${m.en} through shellfire${h}`,
    assault: `${a(name)} leads the assault across ${m.en}${h}`, hold: `${a(name)} holds its ground at ${m.en}${h}`,
    kill: `${a(name)} knocks out ${a(foe).replace(/^A/, 'a').replace(/^An/, 'an')} at ${m.en}${h}`, fires: `${a(name)} fires across ${m.en}${h}`,
    onTheMove: `${a(name)} fires on the move at ${m.en}${h}`, artillery: `${a(name)} charges through artillery at ${m.en}${h}`,
    column: `${a(name)} leads the column through ${m.en}${h}`, night: `${a(name)} advances through ${m.en} at night`,
  }[action];
  // the fifty's Chinese style: 一辆 and a space on each side of a Latin name, the hour first
  // (a space only after a Latin name: 一辆 Leopard 2A5 在…, 一辆 Type 10 原型车在…)
  const p = action === 'night' ? '' : HOUR_ZH[time], n = `一辆 ${zhName}${/[A-Za-z0-9)]$/.test(zhName) ? ' ' : ''}`, f = `一辆 ${zhFoe}`;
  const zh = {
    returnFire: `${p}${n}在${m.zh}还击`, shellfire: `${p}${n}冒着炮火穿越${m.zh}`, assault: `${p}${n}率队突击${m.zh}`,
    hold: `${p}${n}在${m.zh}坚守阵地`, kill: `${p}${n}在${m.zh}击毁${f}`, fires: `${p}${n}在${m.zh}开火`,
    onTheMove: `${p}${n}在${m.zh}行进间射击`, artillery: `${p}${n}冒着炮击冲过${m.zh}`, column: `${p}${n}率领纵队穿过${m.zh}`,
    night: `夜间，${n}穿过${m.zh}推进`,
  }[action];
  return { title: { en, zh }, short: { en: `${name}, ${m.en}`, zh: `${zhName}，${m.zh}` } };
}

// --- plan -----------------------------------------------------------------------------------------------------------
const perMap = new Map(MAP_IDS.map((m) => [m, 0]));
const anchorCache = new Map(), taken = new Map();
// its own grounds first, the least used of them first (the fifty's maps count double, the hash breaking ties), then
// every other battlefield with room, so a ground without a clear set passes the tank to the next
const rankedMaps = (id) => {
  const nation = spec(id).nation, prefs = [...(FIELDS[nation] ?? []), ...(spec(id).era === 'next-generation' && hash(id) % 5 === 0 ? SPACE : [])];
  const cost = (m) => perMap.get(m) * (FIFTY_MAPS.has(m) ? 2 : 1) + (hash(`${id}${m}`) % 100) / 1000;
  const open = (list) => list.filter((m) => MAP_IDS.includes(m) && perMap.get(m) < CAP).sort((p, q) => cost(p) - cost(q));
  const own = open(prefs);
  return [...own, ...open(MAP_IDS.filter((m) => !own.includes(m) && !SPACE.includes(m)))];
};
const anchorFor = (map) => {
  if (!anchorCache.has(map)) anchorCache.set(map, anchorsOf(map));
  const used = taken.get(map) ?? [];
  const spot = anchorCache.get(map).find(([x, z]) => used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) > 150))
    ?? anchorCache.get(map).find(([x, z]) => used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) > 60));
  if (spot) taken.set(map, [...used, spot]);
  return spot ?? null;
};
const allyPool = (id) => PRODUCTION_TANK_IDS.filter((o) => o !== id && spec(o).nation === spec(id).nation && old(o) === old(id));
const roster = [], unplaced = [];
const order = [...heroes].sort((p, q) => (spec(p).nation ?? '').localeCompare(spec(q).nation ?? '') || p.localeCompare(q));
for (const [k, id] of order.entries()) {
  let map = null, spot = null;
  for (const m of rankedMaps(id)) { spot = anchorFor(m); if (spot) { map = m; break; } }
  if (!spot) { unplaced.push(id); continue; }
  perMap.set(map, perMap.get(map) + 1);
  const time = SPACE.includes(map) ? 'day' : HOURS[(k + hash(id)) % HOURS.length];
  const tpls = time === 'night' ? NIGHT_TEMPLATES : TEMPLATES, [template, action] = tpls[(k * 7 + hash(id)) % tpls.length];
  const tpl = SHOTS.find(([m]) => m === template), tplScene = siteScene(tpl);
  const allies = tplScene.actors.filter((x) => x.name.startsWith('ally')).length;
  const mates = allyPool(id).sort((p, q) => hash(`${id}${p}`) - hash(`${id}${q}`));
  const lineup = [id, ...mates.slice(0, allies)];
  const pool = foePool(id).filter((f) => !lineup.includes(f)), start = hash(id) % pool.length;
  const foes = [...pool.slice(start), ...pool.slice(0, start)].slice(0, Math.max(2, tplScene.actors.filter((x) => x.name.startsWith('foe')).length));
  const unit = signatureCamoPatternId(id) ?? stockCamoPatternIdFor(id, spec(id).nation, spec(id).era);
  let enemy = signatureCamoPatternId(foes[0]) ?? stockCamoPatternIdFor(foes[0], spec(foes[0]).nation, spec(foes[0]).era);
  if (enemy === unit) enemy = stockCamoPatternIdFor(foes[0], spec(foes[0]).nation, spec(foes[0]).era);
  const name = nameOf(id), n = FIRST_N + roster.length;
  roster.push({ n, id: `${id.replace(/_/g, '-')}-${map.replace(/_/g, '-')}`, hero: id, nation: spec(id).nation, era: spec(id).era, map, time,
    anchor: [spot[0], spot[1]], heading: spot[2], template, action, lineup, foes, paint: [unit, enemy],
    ...titles(action, name, nameOf(foes[0]), map, time, zhNameOf(id), zhNameOf(foes[0])) });
}
writeFileSync(OUT, `${JSON.stringify(roster, null, 1)}\n`);
// every production vehicle's own take, for wherever the site shows that tank (site-media.mjs builds fleet/index.json from
// it): its fleet take, else its take among the owner's nine, else the first of the fifty it leads
const takes = {};
for (const [hero, id, special] of siteHeroes) if (!special) takes[hero] ??= id;
for (const [hero, id, special] of siteHeroes) if (special) takes[hero] = id;
for (const r of roster) takes[r.hero] = `s${r.n}-${r.id}`;
writeFileSync(join(HERE, 'vehicle-takes.json'), `${JSON.stringify(Object.fromEntries(PRODUCTION_TANK_IDS.filter((v) => takes[v]).map((v) => [v, takes[v]])), null, 1)}\n`);
const maps = [...new Set(roster.map((r) => r.map))];
console.log(`[fleet-plan] ${roster.length} takes for ${heroes.length} tanks on ${maps.length} maps -> ${OUT}`);
console.log(`  per map: ${maps.map((m) => `${m} ${roster.filter((r) => r.map === m).length}`).join(', ')}`);
console.log(`  hours: ${Object.entries(roster.reduce((h, r) => ({ ...h, [r.time]: (h[r.time] ?? 0) + 1 }), {})).map(([t, c]) => `${t} ${c}`).join(', ')}`);
if (unplaced.length) console.log(`  unplaced: ${unplaced.join(', ')}`);
