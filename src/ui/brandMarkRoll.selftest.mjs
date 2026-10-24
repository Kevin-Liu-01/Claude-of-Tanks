// The mark's roll on hover (brandMarkRoll.ts; owner, 2026-10-24: "hovering over claude of tanks guy should play our
// rumbling animation"). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND_MOTION_CSS, LOOP_S, brandMarkMotionSVG } from './brandMarkMotion.ts';
import { brandMarkSVG } from './brandMark.ts';

const source = readFileSync(new URL('./brandMarkRoll.ts', import.meta.url), 'utf8');
// the roll swaps the still drawing for the living one inside the same svg: one box, the same groups, the loop's rules
const still = brandMarkSVG(28), living = brandMarkMotionSVG(28);
const frame = (svg) => /viewBox="([^"]+)" width="(\d+)" height="(\d+)"/.exec(svg).slice(1).join(' ');
assert.equal(frame(living), frame(still), 'the living mark draws in the still mark\'s box: nothing around it moves');
for (const part of ['mk-hull', 'mk-turret', 'mk-crew', 'mk-antenna']) assert.ok(still.includes(part) && living.includes(part), part);
assert.equal((living.match(/class="mk-wheel"/g) ?? []).length, 6);
assert.ok(LOOP_S > 0 && BRAND_MOTION_CSS.includes('prefers-reduced-motion'));
// once per hover, none on touch or under reduced motion, the still drawing back after one loop
assert.match(source, /if \(event\.pointerType === 'touch' \|\| reduced\?\.matches\) return;/);
assert.match(source, /'rolling' in found\.mark\.dataset/, 'a hover during the roll does not restart it');
assert.match(source, /found\.host\.contains\(event\.relatedTarget\)/, 'a move inside the lockup is the same hover');
assert.match(source, /setTimeout\(done, LOOP_S \* 1000\)/);
assert.match(source, /mark\.innerHTML = still;/);
assert.match(source, /import\('\.\/brandMarkMotion\.ts'\)/, 'the motion loads on the first hover, off every shell');
console.log('brandMarkRoll.selftest: ok');
