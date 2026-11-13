import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createNamedHolds } from './namedHolds.ts';

// 2026-11-02 audit R4 (TAA has two owners): post.ts's preset listener gated temporal AA, and the Studio film snapshotted
// `taa.enabled` / `upscaler.temporalAccumulation`, forced them off and wrote the snapshot back on leave. A preset change
// (or a context restore's applyGraphicsRecovery) mid-film turned TAA back on under the film's accumulation, and the
// film's leave then restored its stale snapshot over the new preset; post's own `taaEnabled` and dataset.postAa said TAA
// was on while the pass was off. Now the preset listener is the pass's one owner and the film holds it off by name.
// The receipt source-executes post.ts's production owner.

const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const film = readFileSync(new URL('../game/studioFilm.ts', import.meta.url), 'utf8');
function between(source, start, end) {
  const first = source.indexOf(start);
  assert.notEqual(first, -1, `missing production start: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.notEqual(last, -1, `missing production end: ${end}`);
  return source.slice(first, last);
}

assert.doesNotMatch(film, /post\.taa\.enabled\s*=|post\.upscaler\.temporalAccumulation\s*=/, 'the film writes neither field');
assert.match(film, /temporalHold = post\.holdTemporalAA\('studio-film'\)/);
assert.match(film, /state\.temporalHold\.release\(\);/);

const owner = between(post, "  /** The temporal AA's effective state", '\n  });') + '\n  });';
const publish = between(post, '  const publishAAState = (): void => {', '\n  };') + '\n  };';
const create = new Function('createNamedHolds', stripTypeScriptTypes(`function make() {
  let taaEnabled = true;
  let taaHeld = false;
  let msaaSamples = 4;
  const renderer = { domElement: { dataset: {} } };
  const taa = { enabled: true, resets: 0, resetHistory() { this.resets += 1; } };
  const upscaler = { temporalAccumulation: true };
  ${publish}
  ${owner}
  return {
    taa, upscaler, dataset: renderer.domElement.dataset,
    preset(on) { taaEnabled = on; applyTemporalAA(); },
    hold: (reason) => taaHolds.acquire(reason),
  };
}`) + '\nreturn make();');

{
  const p = create(createNamedHolds);
  const filmHold = p.hold('studio-film');
  assert.equal(p.taa.enabled, false, 'the film holds the pass off');
  assert.equal(p.upscaler.temporalAccumulation, false, 'and the temporal floor');
  assert.equal(p.dataset.postAa, 'smaa-high+fsr1', 'the published AA state is the effective one');
  p.preset(true); // a preset change (or applyGraphicsRecovery) mid-film
  assert.equal(p.taa.enabled, false, 'a preset change mid-film does not turn TAA on under the accumulation');
  p.preset(false); // the new preset has no TAA
  filmHold.release();
  assert.equal(p.taa.enabled, false, 'leaving restores the current preset, not the film\'s stale snapshot');
  p.preset(true);
  assert.equal(p.taa.enabled, true);
  assert.equal(p.upscaler.temporalAccumulation, true);
  assert.equal(p.dataset.postAa, 'taa+smaa-high+fsr1');
  const again = p.hold('studio-film');
  again.release(); again.release();
  assert.equal(p.taa.enabled, true, 'a handle releases once');
  assert.ok(p.taa.resets >= 4, 'every change reseeds the history');
}

// ---- (round 2 U30) the QA tools hold it off by name too, never writing the pass ----
// (literal paths: the selftest cache keys this receipt on each tool it reads)
for (const [tool, source] of [
  ['shadow-cache-truth', readFileSync(new URL('../../tools/shadow-cache-truth.mjs', import.meta.url), 'utf8')],
  ['shadow-render-truth', readFileSync(new URL('../../tools/shadow-render-truth.mjs', import.meta.url), 'utf8')],
  ['render-stability-audit', readFileSync(new URL('../../tools/render-stability-audit.mjs', import.meta.url), 'utf8')],
]) {
  assert.doesNotMatch(source, /\btaa\.enabled\s*=[^=]|temporalAccumulation\s*=[^=]/, `${tool} writes neither field`);
  assert.match(source, /holdTemporalAA\('qa'\)/, `${tool} holds temporal AA off through post's owner`);
  assert.match(source, /\.release\(\)/, `${tool} releases its hold`);
}
{
  // a QA comparison over a Studio film's hold: each releases its own
  const p = create(createNamedHolds);
  const film = p.hold('studio-film');
  const qa = p.hold('qa');
  qa.release();
  assert.equal(p.taa.enabled, false, 'the film still holds it off when the tool lets go');
  p.preset(false);
  const qa2 = p.hold('qa');
  film.release();
  qa2.release();
  assert.equal(p.taa.enabled, false, 'and the tool restores no stale snapshot over the preset that changed meanwhile');
  p.preset(true);
  assert.equal(p.taa.enabled, true);
}

console.log('temporalAaHolds selftest: one TAA owner; a Studio film and the QA tools hold it off by name and restore nothing stale');
