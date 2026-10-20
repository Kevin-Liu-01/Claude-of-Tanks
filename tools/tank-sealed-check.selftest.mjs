import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { alphaCutNetting } from './tank-surface-collect.mjs';

// Sealed-hull check (2026-09-13): the software rasteriser must call a closed box
// sealed from every census view, an inside-out box open/inside-out from every
// view, and a mirrored (negative-determinant) placement sealed — exactly what
// the GPU's front-face rule renders. Then two real tanks: the base M1A2 is
// sealed and holds its ledger row, kf51_u's ghillie suit is netting and its
// hull holds its see-through row, and the release plan carries the step.
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
// Netting is counted apart and see-through gates (2026-10-16): the synthetic net over the closed box is netting only;
// undeclared, every one of its pixels is the hull's see-through and the gate fails (the 226 class); a roof hole and a
// glass fin under the net read exactly as they do with the net hidden, and both fail.
const net = (label) => selfTest.stdout.match(new RegExp(`${label}: open (\\d+), see-through (\\d+) in \\d+ views, netting (\\d+), gate (pass|FAIL)`))?.slice(1);
const [nOpen, nThrough, nNet, nGate] = net('netting declared'), undeclared = net('netting undeclared');
assert.deepEqual([nOpen, nThrough, nGate], ['0', '0', 'pass'], 'declared netting is neither an opening nor see-through');
assert.ok(Number(nNet) > 0, 'the census counts the sky between the strands as netting');
assert.deepEqual(undeclared, ['0', nNet, '0', 'FAIL'], 'an undeclared alpha-cut net is the hull\'s see-through and fails');
const [holeBare, holeNet] = [net('roof hole, net hidden'), net('roof hole under netting')];
assert.ok(Number(holeBare[0]) > 0 && holeNet[0] === holeBare[0] && holeNet[3] === 'FAIL', 'a hole behind netting is as open as without it');
const [glassBare, glassNet] = [net('glass fin, net hidden'), net('glass fin under netting')];
assert.ok(Number(glassBare[1]) > 0 && glassNet[1] === glassBare[1] && glassNet[3] === 'FAIL', 'netting never absorbs see-through');
// the netting predicate: declared by the builder, alpha-cut, non-armour
const mesh = (name, userData, material) => Object.assign(new THREE.Mesh(new THREE.BufferGeometry(), material), { name, userData });
const cut = new THREE.MeshStandardMaterial({ alphaTest: 0.5 }), solid = new THREE.MeshStandardMaterial(), blended = new THREE.MeshStandardMaterial({ alphaTest: 0.5, transparent: true, opacity: 0.5 });
const lattice = { continuityRole: 'open-lattice', combatHitboxRole: 'nonArmor' };
for (const [object, expected, why] of [
  [mesh('kf51b_ghillie_hull_net', lattice, cut), true, 'the suit net'],
  [mesh('decor_turret_foliage', { combatHitboxRole: 'nonArmor' }, cut), true, 'decor cut branches'],
  [mesh('decor_hull_net_coarse', { combatHitboxRole: 'nonArmor' }, cut), true, 'the decor net\'s coarse level'],
  [mesh('kf51b_ghillie_hull_net', lattice, solid), false, 'an opaque lattice is a surface'],
  [mesh('kf51b_ghillie_hull_net', lattice, blended), false, 'blended glass is never netting'],
  [mesh('kf51b_ghillie_hull_net', {}, cut), false, 'an undeclared alpha-cut mesh'],
  [mesh('kf51b_ghillie_hull_net', { ...lattice, combatHitboxRole: 'armor' }, cut), false, 'armour is never netting'],
  [mesh('decor_hull_mesh', { combatHitboxRole: 'nonArmor' }, cut), false, 'wire-grid panels are not nets'],
]) assert.equal(alphaCutNetting(object, object.material), expected, why);

const ledger = JSON.parse(readFileSync('docs/geometry-gate/sealed.json', 'utf8'));
assert.ok(Object.keys(ledger.tanks).length >= 150, 'the ledger covers the playable fleet');
assert.equal(ledger.tanks.m1a1_abrams_hc.sealed, true, 'the base Abrams is a sealed reference');
const sealedCount = Object.values(ledger.tanks).filter((row) => row.sealed).length;
assert.ok(sealedCount >= 150, `at least 150 sealed tanks in the ledger (${sealedCount})`);
for (const [id, row] of Object.entries(ledger.tanks)) assert.ok(Number.isFinite(row.seeThroughPx), `${id}: every row carries a see-through baseline`);
const netted = Object.entries(ledger.tanks).filter(([, row]) => row.netSeeThroughPx > 0).map(([id]) => id);
assert.ok(netted.length >= 35 && netted.includes('kf51_u'), `the ghillie rows are re-baselined with netting apart (${netted.length})`);

const gate = run('--ids=m1a1_abrams_hc,kf51_u', '--ledger=docs/geometry-gate/sealed.json', '--gate');
assert.equal(gate.status, 0, `ledger gate exit ${gate.status}\n${gate.stdout}\n${gate.stderr}`);
assert.match(gate.stdout, /^m1a1_abrams_hc: SEALED — .* ledger: sealed, holds; see-through \d+ px \(ledger \d+\), holds/m);
const kf51 = gate.stdout.match(/^kf51_u: SEALED — .* see-through px (\d+) in \d+ views, netting px (\d+) in \d+ views, .* ledger: sealed, holds; see-through \d+ px \(ledger (\d+)\), holds/m);
assert.ok(kf51, `kf51_u holds its row with the suit counted as netting\n${gate.stdout}`);
assert.ok(Number(kf51[2]) > 3000 && Number(kf51[1]) <= Number(kf51[3]) + 12, 'kf51_u: thousands of netting px, its hull at its see-through row');

const plan = readFileSync('tools/tank-release-plan.mjs', 'utf8');
assert.match(plan, /cpu\('tank-sealed-check',selected,'--ledger=docs\/geometry-gate\/sealed.json'/, 'the release plan runs the sealed check with the ledger');
console.log(`tank-sealed-check.selftest: rasteriser self-test with netting, hole-behind-netting and glass cases, netting predicate, ledger (${sealedCount} sealed of ${Object.keys(ledger.tanks).length}, ${netted.length} netted rows), M1A2/kf51_u gate and release-plan wiring PASS`);
