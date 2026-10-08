import assert from 'node:assert/strict';
import { destructibleCastsShadow, destructibleShadowCascades } from './destructibleRenderPolicy.ts';

assert.equal(destructibleCastsShadow({ cls: 'break', h: 0.75, r: 0.55 }), false,
  'small grounded clutter does not multiply CSM submissions');
assert.equal(destructibleCastsShadow({ cls: 'physics', h: 0.92, r: 0.32 }), false,
  'small loose physics props use lighting and GTAO rather than cascaded shadows');
assert.equal(destructibleCastsShadow({ cls: 'break', h: 1.1, r: 1.25, fence: true }), true,
  'fence silhouettes keep dynamic shadows');
assert.equal(destructibleCastsShadow({ cls: 'break', h: 4.1, r: 4, collider: true }), true,
  'destructible structures keep dynamic shadows');
assert.equal(destructibleCastsShadow({ cls: 'topple', h: 2.85, r: 0.48 }), true,
  'toppling poles keep their moving shadows');
assert.equal(destructibleCastsShadow({ castShadow: true, h: 0.2, r: 0.2 }), true,
  'explicit authored policy overrides the automatic threshold');

// (b37) the cascades: low dressing the near two, a man's height to a lorry's the near three, tall and toppling all
assert.equal(destructibleShadowCascades({ cls: 'break', h: 1.1, fence: true }), 0b0011, 'a fence the near cascades');
assert.equal(destructibleShadowCascades({ cls: 'break', h: 1.4 }), 0b0011, 'a sandbag stack the near cascades');
assert.equal(destructibleShadowCascades({ cls: 'break', h: 2.6 }), 0b0111, 'a lorry the near three');
assert.equal(destructibleShadowCascades({ cls: 'break', h: 6.1 }), null, 'a tall stack every cascade');
assert.equal(destructibleShadowCascades({ cls: 'topple', h: 1.0 }), null, 'a toppling actor every cascade');
console.log('destructibleRenderPolicy.selftest: bounded destructible shadow classes passed');
