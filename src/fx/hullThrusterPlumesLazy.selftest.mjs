#!/usr/bin/env node
// hullThrusterPlumesLazy.selftest: the air spin's thruster plumes (thrust-flips-277) are battle-only FX in their own
// chunk, not the entry (integ/278, owed from 277: 1,787 B brotli of the 277 entry's +4,419 B; Main's ruling: make it lazy
// and re-pin the entry budget down).
//
// 1. No source value-imports src/fx/hullThrusterPlumes.ts statically (a type import is erased): main.ts loads it with a
//    dynamic import in a lazy runtime owner.
// 2. main.ts preloads it as the battle phase begins (the plumes draw only in that phase: battlePresentationRuntime.ts),
//    and the presentation reads the loaded runtime through a getter (null until it is in).
// Reverted control: main.ts's 277 static `import { createHullThrusterPlumes } from './fx/hullThrusterPlumes.ts'` is red at 1.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../..', import.meta.url).pathname;
const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// 1. no static value import anywhere in src
{
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-n', '-I', '-F', 'hullThrusterPlumes.ts', '--', 'src'], { cwd: root, encoding: 'utf8' });
  } catch (error) { if (error.status !== 1) throw error; }
  const statics = out.split('\n').filter(Boolean)
    .filter((line) => /\bfrom\s+['"][^'"]*hullThrusterPlumes\.ts['"]/.test(line) && !/\bimport\s+type\b/.test(line));
  assert.deepEqual(statics, [], 'no source imports the plumes statically (they are battle-only FX, kept out of the entry)');
}

// 2. main.ts loads them lazily as a battle begins; the presentation reads them through a getter
{
  const main = read('src/main.ts');
  assert.match(main, /const thrusterPlumes = createLazyRuntimeOwner\(\(\) => import\('\.\/fx\/hullThrusterPlumes\.ts'\)/,
    'main.ts holds the plumes in a lazy runtime owner');
  assert.match(main, /Reflect\.get\(Object\(payload\), 'phase'\) === 'battle'\) void thrusterPlumes\.preload\(\)/,
    'the chunk loads as the battle phase begins');
  assert.match(main, /thrusterPlumes: \(\) => thrusterPlumes\.current,/, 'the presentation reads the loaded runtime');
  const presentation = read('src/game/battlePresentationRuntime.ts');
  assert.match(presentation, /const plumes = game\.phase === 'battle' \? thrusterPlumes\(\) : null;/,
    'the plumes draw only in the battle phase, once loaded');
}

console.log('hullThrusterPlumesLazy.selftest: PASS (the plumes are a battle-phase chunk; no static import)');
