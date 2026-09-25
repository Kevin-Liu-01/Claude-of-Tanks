// Round 69 (2026-09-24): the four desktop light effects run behind their own preset levers, never on the mobile
// tier, and the `?fx=` query is the QA switch (`?fx=off` keeps every pinned capture exact; `?fx=names` keeps only
// the named effects). This receipt pins the policy, the presets that carry the levers and the two consumers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POST_LIGHT_FX_NAMES, POST_LIGHT_FX_OFF, parsePostLightFxQuery, resolvePostLightFx, samePostLightFx,
} from './postLightFxPolicy.ts';
import { PRESETS } from './quality.ts';

const ALL = Object.freeze({ contactShadows: true, groundBounce: true, sunShafts: true, lensFlare: true });

// 1. query parsing
assert.equal(parsePostLightFxQuery(null), null);
assert.equal(parsePostLightFxQuery(''), null);
assert.equal(parsePostLightFxQuery('?nosplash=1&tier=desktop'), null, 'no fx parameter: the preset decides');
for (const q of ['?fx=off', 'fx=0', '?fx=none', '?fx=']) assert.equal(parsePostLightFxQuery(q), 'off', q);
for (const q of ['?fx=on', '?fx=all', '?fx=default', '?fx=1']) assert.equal(parsePostLightFxQuery(q), null, q);
{
  const set = parsePostLightFxQuery('?a=1&fx=contact,flare,bogus');
  assert.ok(set instanceof Set);
  assert.deepEqual([...set].sort(), ['contact', 'flare'], 'unknown names are ignored, not errors');
}
assert.deepEqual(Object.keys(POST_LIGHT_FX_NAMES).sort(), ['bounce', 'contact', 'flare', 'shafts']);

// 2. resolution
assert.deepEqual(resolvePostLightFx(ALL, 'desktop', null), ALL);
assert.deepEqual(resolvePostLightFx(ALL, 'mobile', null), POST_LIGHT_FX_OFF, 'the mobile tier never runs them');
assert.deepEqual(resolvePostLightFx(ALL, 'desktop', 'off'), POST_LIGHT_FX_OFF, '?fx=off');
assert.deepEqual(resolvePostLightFx(ALL, 'desktop', new Set(['contact', 'shafts'])),
  { contactShadows: true, groundBounce: false, sunShafts: true, lensFlare: false }, 'named effects only');
assert.deepEqual(resolvePostLightFx({ contactShadows: true }, 'desktop', new Set(['contact', 'flare'])),
  { contactShadows: true, groundBounce: false, sunShafts: false, lensFlare: false }, 'a name still needs its lever');
assert.deepEqual(resolvePostLightFx({}, 'desktop', null), POST_LIGHT_FX_OFF, 'no levers: nothing runs');
assert.ok(samePostLightFx(resolvePostLightFx(ALL, 'desktop', null), ALL));
assert.ok(!samePostLightFx(POST_LIGHT_FX_OFF, ALL));
assert.ok(Object.isFrozen(resolvePostLightFx(ALL, 'desktop', null)));

// 3. the presets: the three desktop tiers above Low carry every lever; Low and the phones none
for (const name of ['ultra', 'high', 'medium']) {
  const p = PRESETS[name];
  assert.deepEqual([p.contactShadows, p.groundBounce, p.sunShafts, p.lensFlare], [true, true, true, true], name);
}
for (const name of ['low', 'mobile-low', 'mobile', 'mobile-high']) {
  const p = PRESETS[name];
  assert.deepEqual([p.contactShadows, p.groundBounce, p.sunShafts, p.lensFlare], [undefined, undefined, undefined, undefined], name);
}

// 4. the consumers resolve the same policy with the device tier and the page query
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(post, /resolvePostLightFx\(preset, getDeviceTier\(\), currentPostLightFxQuery\(\)\)/, 'post.ts resolves per preset');
assert.match(lighting, /resolvePostLightFx\(preset, getDeviceTier\(\), currentPostLightFxQuery\(\)\)/, 'lighting.ts resolves at creation');
assert.match(lighting, /lightFx\.flags = resolvePostLightFx\(p, getDeviceTier\(\), currentPostLightFxQuery\(\)\);\s*applyGroundBounce\(\);/,
  'a preset change re-resolves the bounce lever');
assert.match(post, /publishAAState\(\);\s*resolveLightFx\(\);/, 'a preset change re-resolves the post levers');
assert.match(post, /sunShafts\.enabled = next\.sunShafts;\s*lensFlare\.enabled = next\.sunShafts \|\| next\.lensFlare;/,
  'the passes follow the levers (the flare pass also clears the shared target)');
assert.match(post, /dataset\.lightFx = /, 'the resolved set is published on the canvas for probes');
assert.match(post, /setLightFx\(overrides\) \{\s*lightFxOverrides = overrides \? \{ \.\.\.overrides \} : null;\s*resolveLightFx\(\);/,
  'the runtime override hook releases to the policy with null');

console.log('postLightFxPolicy.selftest: query parsing, tier / query resolution, preset levers and the two consumers pinned');
