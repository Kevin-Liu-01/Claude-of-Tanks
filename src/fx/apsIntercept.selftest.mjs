// apsIntercept.selftest.mjs — the APS interception reads as an interceptor, not a dirt hit (261; premiere-battle on live
// 259: an ERA tile's dark burst, then the round's orange-brown column, no bright frame). Reads effects.ts: the
// 'aps:intercept' listener plays apsIntercept alone (no ERA impact, no plate burst); its flash is the additive flash
// pool's, one or two frames at 60 Hz and small; its puff is grey-white; its steel falls cold. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');

// the listener: the interceptor's own look, nothing borrowed from a tile or a warhead's hull burst
const listener = source.slice(source.indexOf("onFxEvent(bus, 'aps:intercept'"), source.indexOf("onFxEvent(bus, 'shell:expired'"));
assert.ok(listener.length > 0, 'the aps:intercept listener exists');
assert.match(listener, /apsIntercept\(_v3, _v4,/, 'the listener plays apsIntercept');
assert.doesNotMatch(listener, /impact\('era'/, 'no ERA tile burst');
assert.doesNotMatch(listener, /plateBurst\(/, "no warhead's plate burst (its column read as soil)");

// the recipe
const start = source.indexOf('function apsIntercept(');
const body = source.slice(start, source.indexOf('\n  }\n', start));
assert.ok(start > 0 && body.length > 0, 'apsIntercept is defined');
const [num, den = '1'] = source.match(/const APS_FLASH_LIFE_S = ([0-9.]+(?: \/ [0-9.]+)?);/)[1].split(' / ');
const life = Number(num) / Number(den);
assert.ok(life > 0 && life * 60 <= 2 + 1e-9, `the flash lives one or two frames at 60 Hz (${(life * 60).toFixed(2)})`);
const flashAt = body.indexOf("particles.emit('flash'");
assert.ok(flashAt > 0 && flashAt < body.indexOf('sparkFan('), 'the flash is the first thing drawn, before the fragments');
assert.match(body.slice(0, flashAt), /_puffO\.life = APS_FLASH_LIFE_S;/, 'the flash takes the two-frame life');
const size1 = Number(body.slice(0, flashAt).match(/_puffO\.size1 = ([0-9.]+) \* dk;/)[1]);
assert.ok(size1 <= 1.0, `the flash is small (${size1} m at its end before the distance boost; a hit flash is 1.6 m)`);

// the puff: grey-white (bright, nearly unsaturated), never the soil's or the ERA tile's brown, in the propellant pool
// (torn powder smoke that outlives the shared smoke ring's churn), alive one to two seconds
const smoke = body.match(/col3\((0x[0-9a-f]{6}), _puffO\.col0\); col3\((0x[0-9a-f]{6}), _puffO\.col1\);[^\n]*\n[^\n]*\n\s*particles\.emit\('psmoke', _puffO\);/i);
assert.ok(smoke, "the recipe ends on a puff in the propellant pool ('psmoke')");
assert.doesNotMatch(body, /impactSmoke\(/, "no shared-ring cotton puff (impactSmoke): a busy battle's smoke ring overwrites it");
const puffLife = body.slice(body.lastIndexOf('for (let i = 0; i < 6; i++)'), smoke.index).match(/_puffO\.life = ([0-9.]+) \+ rng\(\) \* ([0-9.]+);/);
assert.ok(puffLife && Number(puffLife[1]) >= 1 && Number(puffLife[1]) + Number(puffLife[2]) <= 2.5, 'the puff hangs one to two seconds');
for (const hex of smoke.slice(1, 3)) {
  const n = parseInt(hex, 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  assert.ok((r + g + b) / 3 > 0.65, `the puff ${hex} is light`);
  assert.ok(max - min < 0.08, `the puff ${hex} is grey, not brown`);
}
// the fragments: hot streaks off the hull, and steel chips that fall cold (not the ERA tile's hot bricks)
assert.ok((body.match(/sparkFan\(pos, normal,/g) ?? []).length >= 2, 'two fragment fans');
assert.match(body, /_debO\.hot = 0;/, 'the steel falls cold');
console.log(`apsIntercept.selftest: the flash ${(life * 60).toFixed(1)} frames at 60 Hz, ${size1} m; a grey-white propellant puff; no ERA tile, no plate burst`);
