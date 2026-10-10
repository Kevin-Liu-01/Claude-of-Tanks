#!/usr/bin/env node
// Carry the look of re-built source scenes onto lab-resolved scenes without a new resolve: each actor's paint (by name),
// the film block (shutter, samples), the picture, the still moments and the paint record in meta. Placement, routes,
// lens path and crushes stay exactly as the lab resolved them, so a paint or still change needs no GPU re-resolve
// (media wave m1, 2026-10-07: realistic hero paint, a 90° shutter, 2 ms stills chosen by framing). Writes a new folder;
// the old resolved run stays as it was (every version is kept).
//   node tools/media-r5/carry-look.mjs <sourceScenesDir> <resolvedDir> <outDir>
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [srcDir, resolvedDir, outDir] = process.argv.slice(2);
if (!outDir) throw new Error('usage: carry-look.mjs <sourceScenesDir> <resolvedDir> <outDir>');
mkdirSync(outDir, { recursive: true });
let carried = 0, changed = 0;
for (const f of readdirSync(resolvedDir).filter((f) => f.endsWith('.resolved.json')).sort()) {
  const id = f.replace('.resolved.json', '');
  const srcFile = join(srcDir, `${id}.json`);
  if (!existsSync(srcFile)) { console.log(`${id}: no source scene; copied as resolved`); copyFileSync(join(resolvedDir, f), join(outDir, f)); continue; }
  const src = JSON.parse(readFileSync(srcFile, 'utf8')), res = JSON.parse(readFileSync(join(resolvedDir, f), 'utf8'));
  const before = JSON.stringify(res);
  const camo = new Map(src.actors.map((a) => [a.name, a.camo]));
  for (const a of res.actors) if (camo.has(a.name)) { if (camo.get(a.name) === undefined) delete a.camo; else a.camo = camo.get(a.name); }
  for (const k of ['film', 'picture', 'still', 'stillsExtra']) { if (src[k] === undefined) delete res[k]; else res[k] = src[k]; }
  res.meta = { ...res.meta, paint: src.meta?.paint, still: src.meta?.still, ...(src.meta?.stillsExtra ? { stillsExtra: src.meta.stillsExtra } : {}) };
  // Effect names (2026-10-08): the Studio fires each name once, and a resolve exports the names it gave. The source's own
  // names (the staged beats', site50.mjs beat<n>-…) are carried on by type, time and place, so a resolve made while the
  // beats were named fx<n> loses its clashes. A name still used twice stops the run, since one of the two would never fire.
  const effectKey = (e) => `${e.type}|${Math.round(e.tMs ?? 0)}|${JSON.stringify(e.at ?? null)}|${e.actor ?? ''}`;
  const sourceNames = new Map((src.effects ?? []).filter((e) => e.id).map((e) => [effectKey(e), e.id]));
  for (const e of res.effects ?? []) { const name = sourceNames.get(effectKey(e)); if (name) e.id = name; }
  const names = (res.effects ?? []).map((e) => e.id).filter(Boolean);
  const twice = [...new Set(names.filter((n, k) => names.indexOf(n) !== k))];
  if (twice.length) throw new Error(`${id}: effects share the names ${twice.join(', ')}; one of each would never fire`);
  writeFileSync(join(outDir, f), JSON.stringify(res));
  // the source beside it, for cinema-jobs (picture, still moments)
  copyFileSync(srcFile, join(outDir, `${id}.scene.json`));
  carried++; if (JSON.stringify(res) !== before) changed++;
}
console.log(`${carried} resolved scenes carried to ${outDir}, ${changed} changed`);
