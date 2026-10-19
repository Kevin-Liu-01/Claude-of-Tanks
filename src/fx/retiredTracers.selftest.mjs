// retiredTracers.selftest.mjs — the pre-October ribbon tracer and the AC-130's old effects are gone, and what used them
// still works (lane ac130-fx-228, 2026-10-19; the owner: "get rid of the old ones we dont want to use the old ones
// anymore").
//   - no module, tool or document references the retired pieces (the ribbon block of effects.ts, aerialTracers.ts and
//     its browser regression, the gunship's Konkurs/ATGM-ribbon path);
//   - the saved scenes keep loading: every `"type": "firing_moment"` (82 uses in 73 files) and every other saved effect
//     type is still a Studio effect with a handler, and firing_moment still composes through fx.composeFiringMoment,
//     whose frozen round is now the projectile tracers' pooled static (tracers.compose);
//   - the AC-130's FX stay battle-only: nothing in the garage boot's static closure reaches the gunship's resolver.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticImportClosure } from '../../tools/static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'dist', '.qa-dev', 'measure', 'public', 'graphify-out']);
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) yield* walk(path);
    else yield path;
  }
}
const textFile = /\.(ts|mjs|js|md|json|html|css)$/;

// ---- no reference to the retired pieces ----
const RETIRED = /aerialTracer|aerial-tracers|Ballistic tracer ribbons|TRACER_PRESETS|writeShellBolt|staticTracers|writeGuidedShell|rememberShellTrail|_atgmCore|_atgmGlow|COMPOSE_VELOCITY|writeGuidedTrail\b|appendGuidedTrailPoint|commitTracerInstances/;
// (r2) and no prose still describes the ribbon as live (the engineering critic's three stale descriptions)
const STALE_PROSE = /tracer ribbons rebuilt|ribbon used by supersonic|fx preset key \(shells doc|ribbon vanished when|tracer ribbons\/lights|the live tracer ribbon|FX \(tracer ribbons/;
const hits = [];
for (const top of ['src', 'tools', 'docs']) {
  for (const path of walk(join(ROOT, top))) {
    const rel = relative(ROOT, path);
    // the GPU regression names the ribbon's object only to assert its absence
    if (rel === SELF || rel === 'tools/gunship-fx.browser.mjs' || !textFile.test(path) || statSync(path).size > 4_000_000) continue;
    const text = readFileSync(path, 'utf8');
    if (RETIRED.test(text)) hits.push(`${rel}: ${text.match(RETIRED)[0]}`);
    if (STALE_PROSE.test(text)) hits.push(`${rel}: ${text.match(STALE_PROSE)[0]}`);
  }
}
assert.deepEqual(hits, [], `retired tracer pieces are still referenced:\n${hits.join('\n')}`);
const effects = readFileSync(join(ROOT, 'src/fx/effects.ts'), 'utf8');
assert.equal(/const TRACER_VERT|const TRACER_FRAG/.test(effects), false, "the ribbon's own shader is gone from effects.ts");
assert.equal(/new THREE\.MeshBasicMaterial\(\{[^}]*\}\);\s*\n\s*const tracerMesh/.test(effects), false);
assert.match(effects, /tracers\.compose\(/, "composeFiringMoment's round is the projectile tracers' static");
assert.match(effects, /gunshipMuzzleFx\(e, gun/, "the gunship's shots take their own muzzle, never a tank cannon's at the lens");

// ---- the saved scenes keep loading ----
const studio = readFileSync(join(ROOT, 'src/game/studio.ts'), 'utf8');
const typesBlock = studio.slice(studio.indexOf('export const EFFECT_TYPES = ['), studio.indexOf('];', studio.indexOf('export const EFFECT_TYPES = [')));
const effectTypes = new Set([...typesBlock.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
assert.ok(effectTypes.has('firing_moment'), 'firing_moment is still a Studio effect id');
assert.match(studio, /firing_moment: fireFiringMoment/, 'with its handler');
assert.match(studio.slice(studio.indexOf('function fireFiringMoment')), /fx\.composeFiringMoment\(/, 'composing through fx.composeFiringMoment');
let firing = 0, files = 0;
const unknown = new Set();
for (const path of walk(join(ROOT, 'tools'))) {
  if (!path.endsWith('.json')) continue;
  const text = readFileSync(path, 'utf8');
  if (!text.includes('"effects"')) continue;
  let scene;
  try { scene = JSON.parse(text); } catch { continue; }
  const list = Array.isArray(scene?.effects) ? scene.effects : [];
  let used = false;
  for (const effect of list) {
    if (typeof effect?.type !== 'string') continue;
    if (effect.type === 'firing_moment') { firing++; used = true; }
    if (!effectTypes.has(effect.type)) unknown.add(`${relative(ROOT, path)}: ${effect.type}`);
  }
  if (used) files++;
}
assert.ok(firing >= 82 && files >= 73, `every saved firing_moment use still resolves (${firing} uses in ${files} scenes)`);
assert.deepEqual([...unknown], [], 'every saved scene effect type is still a Studio effect');
const shots = readFileSync(join(ROOT, 'src/dev/shotViews.ts'), 'utf8');
assert.match(shots, /combat_firing\(\)[\s\S]{0,1400}fx\.composeFiringMoment\(/, 'the __SHOTS combat_firing view still composes its shot');

// ---- (r2) the frontline backdrop's AA fire draws through the projectile tracers, not its September shader ----
{
  const front = readFileSync(join(ROOT, 'src/world/frontlineAtmosphere.ts'), 'utf8');
  assert.doesNotMatch(front, /TRACER_VERT|TRACER_FRAG|frontline-aa-tracers/, "the backdrop's own tracer shader and mesh are gone");
  assert.match(front, /setAmbientRoundSource\(\{/, 'its rounds register as an ambient source');
  assert.match(effects, /ambientRoundSource\(\)\?\.drawRounds\(drawAmbientRound\);/, 'and the effects frame draws them with the rounds in flight');
  const { setAmbientRoundSource, ambientRoundSource } = await import('../world/destructibles.ts');
  const a = { drawRounds() {} }, b = { drawRounds() {} };
  const offA = setAmbientRoundSource(a), offB = setAmbientRoundSource(b);
  offA();
  assert.equal(ambientRoundSource(), b, "a stale unregister leaves the newer source in place");
  offB();
  assert.equal(ambientRoundSource(), null);
}

// ---- battle-only: the garage boot never statically reaches the gunship's FX resolver ----
const closure = staticImportClosure('src/main.ts', { root: ROOT });
for (const file of ['src/fx/gunshipRounds.ts', 'src/fx/projectileTracers.ts', 'src/fx/effects.ts', 'src/fx/missileLooks.ts']) {
  assert.equal(closure.has(file), false, `${file} loads with the battle FX graph, never at boot`);
}

console.log(`retiredTracers: no retired tracer reference; ${firing} firing_moment uses in ${files} saved scenes resolve; the AC-130 FX stay battle-only`);
