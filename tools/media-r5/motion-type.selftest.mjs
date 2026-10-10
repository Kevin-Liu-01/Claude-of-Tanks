import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject, MIN_TYPE, TITLE_KINDS } from './motion/build.mjs';
import { TOOL } from './paths.mjs';

// Owner direction 2026-10-02: promotional films carry large type only (no eyebrows, kickers, sub-lines, spec lines
// or HUD labels) and nothing names a fleet tier. These receipts hold the motion type floor and the copy.
const titles = [
  { kind: 'logo', start: 0, dur: 2 },
  { kind: 'section', text: 'DAWN', start: 2, dur: 2 },
  { kind: 'stat', num: 219, label: 'Tanks', start: 4, dur: 2 },
  { kind: 'line', text: 'Physical ballistics. Real armor.', start: 6, dur: 2 },
  { kind: 'tank', name: 'Leopard 2A7V', start: 8, dur: 1.25 },
];
const shots = [{ id: 'a', src: 'assets/shots/a.mp4', start: 0, dur: 10 }];
const formats = [
  { name: 'landscape', width: 1920, height: 1080, letterbox: 2.39 },
  { name: 'portrait', width: 1080, height: 1920, letterbox: 0, typeScale: 1.25 },
  { name: 'landscape 4K', width: 3840, height: 2160, letterbox: 2.39 },
];
for (const f of formats) {
  const { files } = buildProject(null, { ...f, fps: 30, duration: 12, shots, titles, flashes: [{ t: 2, frames: 2 }], endcard: { start: 10 } });
  const scale = (f.height > f.width ? f.width / 1080 : f.width / 1920) * (f.typeScale ?? 1);
  const sizes = Object.values(files).flatMap(html => [...html.matchAll(/font-size:(\d+)px/g)].map(m => Number(m[1])));
  assert.ok(sizes.length >= 8, `${f.name}: the titles and end card declare their type sizes`);
  const floor = Math.round(MIN_TYPE * scale);
  assert.deepEqual(sizes.filter(px => px < floor), [], `${f.name}: no line is set below ${MIN_TYPE}px at 1080p (${floor}px here)`);
  const markup = Object.values(files).join('\n');
  for (const cls of ['kick', 'sub', 'spec', 'hud', 'fine', 'cta', 'clock', 'grid-t', 'tank-c']) {
    assert.ok(!new RegExp(`class="${cls}"|id="${cls}"|\\.${cls}\\{`).test(markup), `${f.name}: no '${cls}' element survives in the large-type system`);
  }
  assert.ok(markup.includes('cot.kevinliu.studio'), `${f.name}: the end card carries the site address`);
  assert.ok(!/monospace/.test(markup), `${f.name}: no monospace micro-labels`);
}
assert.throws(() => buildProject(null, { width: 1920, height: 1080, duration: 4, shots, titles: [{ kind: 'bar', text: 'x', start: 0, dur: 1 }] }),
  /not part of the large-type system/, 'retired lower-bar titles are rejected rather than drawn');
assert.deepEqual([...TITLE_KINDS].sort(), ['line', 'logo', 'section', 'stat', 'tank']);

// Copy and EDLs: no fleet-tier naming ("X fleet", "X tanks", "· X") anywhere in the toolkit's words.
const words = [];
const walk = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(?:mjs|json|md)$/.test(e.name) && !e.name.endsWith('.selftest.mjs')) words.push([p, readFileSync(p, 'utf8')]);
  }
};
walk(TOOL);
const tier = /\bX[ -](?:fleet|tanks?|replicas?|MBTs?|IFVs?)\b|· X\b|'X'|"X fleet"/i;
assert.deepEqual(words.filter(([, text]) => tier.test(text)).map(([p]) => p), [], 'no toolkit copy names the X tier');
const posters = JSON.parse(readFileSync(join(TOOL, 'motion/posters.json'), 'utf8'));
assert.ok(posters.every(p => Object.entries(p).filter(([k]) => k.startsWith('art')).every(([, v]) => v.startsWith('shots/media-r5/'))),
  'poster art is addressed relative to the repo, never by an absolute checkout path');
assert.ok(posters.every(p => !('tank' in p || 'clock' in p || 'map' in p || 'timeLabel' in p)), 'posters carry no caption fields');

console.log(`motion-type.selftest: ${formats.length} formats hold the ${MIN_TYPE}px floor; ${words.length} toolkit files, ${posters.length} posters, no tier naming`);
