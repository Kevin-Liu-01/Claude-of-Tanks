#!/usr/bin/env node
// The films' stat cards follow the game's own product totals (2026-10-12: the round-14 trailer and cut-30 said "219
// tanks" while the site, from src/productStats.ts, says 220). For each film: the edl.json stat entries and the count-up
// tweens baked into compositions/titles.html, matched by the card's label (Tanks -> productionVehicles, Battlefields
// -> battlefields). Prints what changed; a film without stat cards is left alone.
//   node tools/media-r5/motion/film-stats-sync.mjs <film...> [--stats=src/productStats.ts]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MOTION, REPO } from '../paths.mjs';

const args = process.argv.slice(2);
const statsFile = resolve(REPO, (args.find((a) => a.startsWith('--stats=')) ?? '--stats=src/productStats.ts').slice(8));
const films = args.filter((a) => !a.startsWith('--'));
if (!films.length) throw new Error('usage: film-stats-sync.mjs <film...> [--stats=src/productStats.ts]');
const src = readFileSync(statsFile, 'utf8');
const stat = (key) => Number(src.match(new RegExp(`\\b${key}: (\\d+),`))?.[1]);
const WANT = { Tanks: stat('productionVehicles'), Battlefields: stat('battlefields') };
if (!WANT.Tanks || !WANT.Battlefields) throw new Error(`no totals in ${statsFile}`);
for (const film of films) {
  const dir = join(MOTION, film), changes = [];
  const edlFile = join(dir, 'edl.json');
  if (existsSync(edlFile)) {
    const edl = JSON.parse(readFileSync(edlFile, 'utf8'));
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'stat' && WANT[node.label] && node.num !== WANT[node.label]) { changes.push(`edl ${node.label} ${node.num} -> ${WANT[node.label]}`); node.num = WANT[node.label]; }
      Object.values(node).forEach(walk);
    };
    walk(edl);
    if (changes.length) writeFileSync(edlFile, `${JSON.stringify(edl, null, 1)}\n`);
  }
  const titlesFile = join(dir, 'compositions/titles.html');
  if (existsSync(titlesFile)) {
    const before = readFileSync(titlesFile, 'utf8');
    let html = before;
    const labels = {};
    for (const m of html.matchAll(/<div id="(t\d+)"[^>]*class="[^"]*ttl-stat[^"]*"[^>]*><div class="inner"><div class="num">[^<]*<\/div><div class="lab">([^<]+)<\/div>/g)) labels[m[1]] = m[2].trim();
    for (const [id, label] of Object.entries(labels)) {
      if (!WANT[label]) continue;
      html = html.replace(new RegExp(`(tl\\.to\\(\\{ v: 0 \\}, \\{ v: )(\\d+)(,[^\\n]*#${id} \\.num)`), (all, a, n, b) => {
        if (Number(n) !== WANT[label]) changes.push(`titles #${id} ${label} ${n} -> ${WANT[label]}`);
        return `${a}${WANT[label]}${b}`;
      });
    }
    if (html !== before) writeFileSync(titlesFile, html);
  }
  console.log(`${film}: ${changes.length ? changes.join('; ') : 'stat cards already match'} (tanks ${WANT.Tanks}, battlefields ${WANT.Battlefields})`);
}
