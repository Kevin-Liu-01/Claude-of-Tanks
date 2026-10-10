#!/usr/bin/env node
// Build tools/media-production/cinema.mjs job lists from lab-resolved scenes.
//   node tools/media-r5/cinema-jobs.mjs stills <resolvedDir> <outRoot> <jobs.json> [--variants=a,b] [--formats=landscape,portrait,square]
//   node tools/media-r5/cinema-jobs.mjs films  <resolvedDir> <outRoot> <jobs.json> [--resolution=1440] [--formats=landscape] [--proxy=false]
//     [--keep-frames=true] (every frame stays for a master made outside the GPU lease: film-master.mjs)
//   node tools/media-r5/cinema-jobs.mjs blur   <resolvedDir> <outRoot> <jobs.json> [--resolution=2160]   (fifty frames; --still-exposure-ms)
// Still scenes carry cameraVariants (from the campaign); each chosen variant becomes its own resolved scene file.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
const [mode, dir, outRoot, jobsFile, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map(a => { const m = /^--([a-z-]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, true]; }));
const prefixes = opt.only ? String(opt.only).split(',') : null;
const files = readdirSync(dir).filter(f => f.endsWith('.resolved.json') && (!prefixes || prefixes.some(p => f.startsWith(p)))).sort();
const jobs = [];
const sceneDir = resolve(outRoot, 'scenes'); mkdirSync(sceneDir, { recursive: true });
for (const f of files) {
  const name = basename(f, '.resolved.json');
  const scene = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  // The look is the builder's current picture, from the source scene the caller staged beside the resolved one. The
  // lab's resolve fixes placement and timing, not the picture (2026-10-06: deep focus came after review 2 resolved).
  const sourceFile = join(dir, `${name}.scene.json`);
  if (existsSync(sourceFile)) {
    const picture = JSON.parse(readFileSync(sourceFile, 'utf8')).picture;
    if (picture) scene.picture = picture;
  }
  if (mode === 'stills') {
    const source = JSON.parse(readFileSync(join(dir, `${name}.scene.json`), 'utf8'));
    const want = opt.variants ? String(opt.variants).split(',') : null;
    for (const v of source.cameraVariants ?? []) {
      if (want && !want.includes(v.name) && !want.includes(`${name}:${v.name}`)) continue;
      // resolve the variant's ground-relative camera against the resolved scene's absolute camera rule:
      // the lab stores each variant's absolute camera in results.json; prefer it when present.
      const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')).find(r => r.name === name && r.tag === v.name);
      const cam = res?.absCamera ?? null;
      if (!cam) { console.warn(`skip ${name}:${v.name} (no absolute camera in results.json)`); continue; }
      const s = { ...scene, camera: { ...cam, mode: 'fly' } };
      delete s.storyboard;
      const file = join(sceneDir, `${name}--${v.name}.json`);
      writeFileSync(file, JSON.stringify(s, null, 1));
      jobs.push({ scene: file, formats: opt.formats ?? 'landscape', resolution: Number(opt.resolution ?? 2160), film: 'false',
        stills: String(scene.fxTime ?? 0), 'still-samples': Number(opt['still-samples'] ?? 48), supersample: Number(opt.supersample ?? 1.5),
        out: resolve(outRoot, `${name}--${v.name}`) });
    }
  } else if (mode === 'films') {
    const file = join(sceneDir, `${name}.json`);
    writeFileSync(file, JSON.stringify(scene, null, 1));
    jobs.push({ scene: file, formats: opt.formats ?? 'landscape', resolution: Number(opt.resolution ?? 1440),
      fps: Number(scene.film?.fps ?? 30), samples: Number(scene.film?.samples ?? 8), 'max-samples': Number(scene.film?.maxSamples ?? 48),
      shutter: Number(scene.film?.shutterDeg ?? 180), master: opt.master ?? 'prores', proxy: opt.proxy === 'false' ? 'false' : 'true',
      ...(opt['keep-frames'] === 'true' ? { 'keep-frames': 'true' } : {}), out: resolve(outRoot, name) });
  } else if (mode === 'blur') {
    // the fifty frames: a motion-blurred still per scene at its timed moment and its close portrait (stillsExtra), through
    // the film shutter
    const src = JSON.parse(readFileSync(join(dir, `${name}.scene.json`), 'utf8'));
    if (!src.still) continue;
    const file = join(sceneDir, `${name}.json`);
    writeFileSync(file, JSON.stringify(scene, null, 1));
    const E = Number(src.still.exposureMs ?? 0);
    jobs.push({ scene: file, formats: opt.formats ?? 'landscape', resolution: Number(opt.resolution ?? 2160), film: 'false',
      stills: [src.still.tMs, ...(src.stillsExtra ?? [])].join(','), 'still-exposure-ms': E, 'still-samples': Number(opt['still-samples'] ?? (E >= 100 ? 64 : 32)),
      'still-max-samples': Number(opt['still-max-samples'] ?? 128), supersample: Number(opt.supersample ?? 1.25), out: resolve(outRoot, name) });
  } else throw Error('mode must be stills|films|blur');
}
writeFileSync(jobsFile, JSON.stringify(jobs, null, 1));
console.log(`${jobs.length} ${mode} jobs -> ${jobsFile}`);
