import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Sealed-hull check (2026-09-13): the software rasteriser must call a closed box
// sealed from every census view, an inside-out box open/inside-out from every
// view, and a mirrored (negative-determinant) placement sealed — exactly what
// the GPU's front-face rule renders. Then two real tanks: the base M1A2 is
// sealed and holds its ledger row, and the release plan carries the step.
const run = (...args) => spawnSync(process.execPath, ['tools/tank-sealed-check.mjs', ...args], { encoding: 'utf8' });
const selfTest = run('--self-test');
assert.equal(selfTest.status, 0, `self-test exit ${selfTest.status}\n${selfTest.stdout}\n${selfTest.stderr}`);
assert.match(selfTest.stdout, /closed box: open 0, inside-out 0, affected views 0\/33/);
assert.match(selfTest.stdout, /inside-out box: open \d+, inside-out \d+, affected views 33\/33/);
assert.match(selfTest.stdout, /mirrored box: open 0, inside-out 0, affected views 0\/33/);
// Gun bores are open by design (2026-10-14): an inside-out tube reads as an opening until a physical mouth frame masks
// it, every masked pixel is one the unmasked census called open, and the same frame moved aside masks nothing.
const bore = (label) => selfTest.stdout.match(new RegExp(`${label}: open (\\d+), inside-out (\\d+), bore px (\\d+)`))?.slice(1).map(Number);
const [rawOpen, rawInverted, rawMasked] = bore('bore unmasked'), [maskOpen, maskInverted, maskMasked] = bore('bore masked');
assert.ok(rawOpen + rawInverted > 0 && rawMasked === 0, 'the unmasked bore reads as an opening');
assert.equal(maskOpen + maskInverted, 0, 'the masked bore is not an opening');
assert.equal(maskMasked, rawOpen + rawInverted, 'the mask removes exactly the bore pixels');
assert.deepEqual(bore('bore mask aside'), [rawOpen, rawInverted, 0], 'a mouth frame beside the tube masks nothing');

const ledger = JSON.parse(readFileSync('docs/geometry-gate/sealed.json', 'utf8'));
assert.ok(Object.keys(ledger.tanks).length >= 150, 'the ledger covers the playable fleet');
assert.equal(ledger.tanks.m1a1_abrams_hc.sealed, true, 'the base Abrams is a sealed reference');
const sealedCount = Object.values(ledger.tanks).filter((row) => row.sealed).length;
assert.ok(sealedCount >= 150, `at least 150 sealed tanks in the ledger (${sealedCount})`);

const gate = run('--ids=m1a1_abrams_hc,abramsx', '--ledger=docs/geometry-gate/sealed.json', '--gate');
assert.equal(gate.status, 0, `ledger gate exit ${gate.status}\n${gate.stdout}\n${gate.stderr}`);
assert.match(gate.stdout, /^m1a1_abrams_hc: SEALED — .* ledger: sealed, holds/m);
assert.match(gate.stdout, /^abramsx: SEALED — .* ledger: sealed, holds/m);

const plan = readFileSync('tools/tank-release-plan.mjs', 'utf8');
assert.match(plan, /cpu\('tank-sealed-check',selected,'--ledger=docs\/geometry-gate\/sealed.json'/, 'the release plan runs the sealed check with the ledger');
console.log(`tank-sealed-check.selftest: rasteriser self-test, ledger (${sealedCount} sealed of ${Object.keys(ledger.tanks).length}), M1A2/Abrams X gate and release-plan wiring PASS`);
