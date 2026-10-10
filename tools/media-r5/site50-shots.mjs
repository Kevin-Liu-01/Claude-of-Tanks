#!/usr/bin/env node
// The site fifty as code (owner 2026-10-03: "since we can save these and show them as code, we should be able to
// preserve them and iterate on them"). Every shot's exact Studio scene — the resolved scene a render is made from:
// placement, paint, turret keys, lens path, effects, picture, film — lives in tools/media-r5/site50-shots/<id>.json.
// It is tracked: git history is each shot's version history, and a diff shows what an iteration changed.
// library.json keeps, per shot, its scene versions and its render rounds: which scene (sha256) and which renderer
// commit made each render, where the render is kept, and whether a later round superseded it. Renders are never
// deleted: a superseded round moves under shots/media-r5/site50/versions/<round>/, so iterations stay comparable.
//   node tools/media-r5/site50-shots.mjs snapshot <version> [--note=...]       copy the current resolved scenes in
//   node tools/media-r5/site50-shots.mjs changed                               ids needing a render (new or changed
//                                                                              scene, or a superseded render)
//   node tools/media-r5/site50-shots.mjs rendered <round> <ids|all> [--renderer=<commit>] [--note=...]
//   node tools/media-r5/site50-shots.mjs archive <round> <ids|all> [--note=why it was superseded]
// [--from=shots/media-r5/site50/resolved-v2] picks the resolved scenes.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO, SHOTS } from './paths.mjs';

const LIB = join(REPO, 'tools/media-r5/site50-shots'), MANIFEST = join(LIB, 'library.json');
const SITE = join(SHOTS, 'site50'), VERSIONS = join(SITE, 'versions');
const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true']; }));
const args = rest.filter(a => !a.startsWith('--'));
const from = resolve(flags.from ?? join(SITE, 'resolved-v2'));
const sha = text => createHash('sha256').update(text).digest('hex');
const load = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { shots: {} });
const save = lib => writeFileSync(MANIFEST, `${JSON.stringify(lib, null, 1)}\n`);
// the shot's code, formatted stably (one key per line, so a diff reads field by field)
const codeOf = id => `${JSON.stringify(JSON.parse(readFileSync(join(from, `${id}.resolved.json`), 'utf8')), null, 1)}\n`;
const currentIds = () => readdirSync(from).filter(f => /^s\d\d-.*\.resolved\.json$/.test(f)).map(f => f.replace('.resolved.json', '')).sort();
const pick = spec => (spec === 'all' ? currentIds() : [...new Set(spec.split(',').flatMap(p => currentIds().filter(id => id.startsWith(p))))]);
const head = () => execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
const stamp = new Date().toISOString();

if (cmd === 'snapshot') {
  const [version] = args, lib = load();
  if (!version) throw new Error('snapshot <version>');
  mkdirSync(LIB, { recursive: true });
  let changed = 0;
  for (const id of currentIds()) {
    const code = codeOf(id), hash = sha(code), scene = JSON.parse(code), m = scene.meta ?? {};
    writeFileSync(join(LIB, `${id}.json`), code);
    const entry = lib.shots[id] ??= { versions: [], renders: [] };
    Object.assign(entry, { title: m.title, map: scene.map, time: m.time, hero: m.hero, paint: m.paint, turrets: m.turrets?.style, still: m.still });
    if (entry.versions.at(-1)?.sha256 === hash) continue;
    entry.versions.push({ version, sha256: hash, at: stamp, ...(flags.note ? { note: flags.note } : {}) });
    changed++;
  }
  save(lib);
  console.log(`${version}: ${currentIds().length} shots in ${LIB}, ${changed} with a new scene version`);
} else if (cmd === 'changed') {
  const lib = load();
  console.log(currentIds().filter(id => {
    const live = (lib.shots[id]?.renders ?? []).filter(r => !r.superseded).at(-1);
    return !live || live.sceneSha256 !== sha(codeOf(id));
  }).join(','));
} else if (cmd === 'rendered') {
  const [round, spec] = args, lib = load();
  const ids = pick(spec);
  for (const id of ids) {
    const entry = lib.shots[id], hash = sha(codeOf(id));
    if (!entry || entry.versions.at(-1)?.sha256 !== hash) throw new Error(`${id}: snapshot the scene before recording its render`);
    entry.renders.push({ round, sceneVersion: entry.versions.at(-1).version, sceneSha256: hash, renderer: flags.renderer ?? head(), at: stamp,
      kept: 'shots/media-r5/site50/{renders,deliver}', ...(flags.note ? { note: flags.note } : {}) });
  }
  save(lib);
  console.log(`${round}: ${ids.length} renders recorded`);
} else if (cmd === 'archive') {
  const [round, spec] = args, lib = load();
  let moved = 0;
  for (const id of pick(spec)) {
    for (const [kind, sub] of [['renders/films', 'films'], ['renders/stills', 'stills'], ['renders/films-portrait', 'films-portrait'], ['deliver', 'deliver']]) {
      const src = join(SITE, kind, id), dst = join(VERSIONS, round, sub, id);
      if (!existsSync(src)) continue;
      if (existsSync(dst)) throw new Error(`${dst} exists: archive under another round`);
      mkdirSync(join(VERSIONS, round, sub), { recursive: true });
      renameSync(src, dst); moved++;
    }
    for (const r of (lib.shots[id]?.renders ?? []).filter(x => x.round === round)) {
      r.kept = `shots/media-r5/site50/versions/${round}`;
      r.superseded = { at: stamp, ...(flags.note ? { why: flags.note } : {}) };
    }
  }
  save(lib);
  console.log(`${round}: ${moved} render folders kept under ${join(VERSIONS, round)}`);
} else throw new Error('commands: snapshot <version> | changed | rendered <round> <ids|all> | archive <round> <ids|all>');
