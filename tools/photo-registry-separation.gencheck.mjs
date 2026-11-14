// Tank-generation check (owner 2026-11-12: outside 3D models are comparison bases while a lane builds a tank, never a
// test or a gate). Run by hand with `npm run gen:checks`; no receipt suite, release check or gate runs it.
// The comparison registry as the fidelity page builds it (MODEL_SOURCE's glb entries and every override map it spreads)
// keeps photo-class ids out: a photo id is never also registered against a comparison model, and the geometry
// comparison refuses one that is (rule c).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUPPLIED_SOURCE_REFERENCE_OVERRIDES} from './supplied-source-reference-overrides.mjs';
import {ARES_APC_X_REFERENCE_OVERRIDES} from './ares-apc-x-reference-overrides.ts';
import {OPLOT_BM_X_REFERENCE_OVERRIDES} from './oplot-bm-x-reference-overrides.ts';
import {SECOND_WAVE_X_REFERENCE_OVERRIDES} from './second-wave-x-reference-overrides.ts';
import {ABRAMS_X_REFERENCE_OVERRIDES} from './abrams-x-reference-overrides.ts';
import {T90_X_REFERENCE_OVERRIDES} from './t90-x-reference-overrides.ts';
import {LEOPARD_X_REFERENCE_OVERRIDES} from './leopard-x-reference-overrides.ts';
import {WEST_X_REFERENCE_OVERRIDES} from './west-x-reference-overrides.ts';
import {PHOTO_REFERENCE_IDS,isPhotoReference} from './photo-reference-policy.mjs';
import {assertNoPhotoOverride} from './geometry-gate-policy.mjs';

const page=readFileSync(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
const imports=Object.fromEntries([...page.matchAll(/^import \{ ([A-Z0-9_]+) \} from '\/tools\/([^']+)';/gm)].map(m=>[m[1],m[2]]));
const spread=[...page.match(/const LOCAL_REFERENCE_OVERRIDES = \{([\s\S]*?)\n\}/)[1].matchAll(/\.\.\.([A-Z0-9_]+)/g)].map(m=>m[1]);
const OVERRIDES={SUPPLIED_SOURCE_REFERENCE_OVERRIDES,ARES_APC_X_REFERENCE_OVERRIDES,OPLOT_BM_X_REFERENCE_OVERRIDES,
  SECOND_WAVE_X_REFERENCE_OVERRIDES,ABRAMS_X_REFERENCE_OVERRIDES,T90_X_REFERENCE_OVERRIDES,LEOPARD_X_REFERENCE_OVERRIDES,
  WEST_X_REFERENCE_OVERRIDES};
const OVERRIDE_FILES={SUPPLIED_SOURCE_REFERENCE_OVERRIDES:'supplied-source-reference-overrides.mjs',
  ARES_APC_X_REFERENCE_OVERRIDES:'ares-apc-x-reference-overrides.ts',OPLOT_BM_X_REFERENCE_OVERRIDES:'oplot-bm-x-reference-overrides.ts',
  SECOND_WAVE_X_REFERENCE_OVERRIDES:'second-wave-x-reference-overrides.ts',ABRAMS_X_REFERENCE_OVERRIDES:'abrams-x-reference-overrides.ts',
  T90_X_REFERENCE_OVERRIDES:'t90-x-reference-overrides.ts',LEOPARD_X_REFERENCE_OVERRIDES:'leopard-x-reference-overrides.ts',
  WEST_X_REFERENCE_OVERRIDES:'west-x-reference-overrides.ts'};
// the page spreads exactly these maps, from these files: a new override map on the page fails here until it is read
assert.deepEqual([...spread].sort(),Object.keys(OVERRIDES).sort(),'the fidelity page spreads exactly the override maps read here');
for(const name of spread)assert.equal(imports[name],OVERRIDE_FILES[name],`${name}: imported from ${OVERRIDE_FILES[name]}`);
const registered=new Set([...page.matchAll(/^ {2}([a-z0-9_]+): ?\{ ?source: ?'glb'/gm)].map(m=>m[1]));
for(const map of Object.values(OVERRIDES))for(const id of Object.keys(map))registered.add(id);
// the census reads the registry, not an empty parse
for(const id of ['leo2a6','t64bv1','t64bv_donbas',Object.keys(SUPPLIED_SOURCE_REFERENCE_OVERRIDES)[0]])
  assert(registered.has(id),`${id}: registered (registry census)`);
for(const id of PHOTO_REFERENCE_IDS)assert.equal(registered.has(id),false,`${id}: a photo id keeps no registered comparison model`);
// the T-64s' borrowed comparison models are deregistered (Main 2026-10-31); their siblings keep their own
for(const id of ['t64bm1m','t64bv','t64b1v_2022'])assert.equal(registered.has(id)||!isPhotoReference(id),false,id);
assertNoPhotoOverride([...PHOTO_REFERENCE_IDS,'t64bv1','t64bv_donbas'],registered,isPhotoReference);
assert.throws(()=>assertNoPhotoOverride(['t64bv'],new Set(['t64bv']),isPhotoReference),/cannot override a registered 3D target/);
console.log(`photo-registry-separation: ${PHOTO_REFERENCE_IDS.length} photo ids, none among ${registered.size} registered comparison ids`);
