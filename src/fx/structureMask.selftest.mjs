// structureMask.selftest.mjs — nothing hangs from a falling building (destruction stream, 2026-10-13; the owner's
// screenshot of a damaged Steinburg building: "these big rectangles pop up").
//
// Filmed on the Steinburg fire station and a town house: from 1.7 s after the collapse began to the fold at 4.2 s, a
// flat panel of dark glazing (the fire station's tower) or of slate roof and gable timbers (the house) stood from the
// eaves down to the heap. The vertex patch's crumble lets the roof ride the front down and the desktop cut discards the
// walls above it; a triangle with a vertex under the eave band and the others over it is spared the cut (it reaches the
// roof), and only its roof vertices rode down — its wall vertex stood where it was, and the triangle hung from it. The
// desktop patch now brings a wall's vertex down to FOLD_ABOVE_FRONT_M over the front (over the cut's ragged band, so
// nothing the cut shows changes); the phone's folds onto the front as before.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COLLAPSE_S, FOLD_ABOVE_FRONT_M, collapseFront, crumbleVertexY, createStructureMask } from './structureMask.ts';

// ---- the law: a straddling roof triangle (the house's: its slope's eave vertex 0.4 m under the eave band, its other two
// on the eave and the ridge) holds together all the way down
{
  const eave = 10.3, ridge = 16.4;
  for (const t of [0.5, 1, 2, 2.9, 3.5, 4.1]) {
    const front = collapseFront(t, eave);
    const low = crumbleVertexY(eave - 0.4, t, eave);
    const atEave = crumbleVertexY(eave, t, eave);
    const top = crumbleVertexY(ridge, t, eave);
    assert.equal(low.roof, false, 'the overhang vertex is under the eave band (wall to the patch)');
    assert.ok(atEave.roof && top.roof, 'the eave and the ridge ride');
    assert.ok(low.y <= front + FOLD_ABOVE_FRONT_M + 1e-9, `t ${t}: the wall vertex is never more than ${FOLD_ABOVE_FRONT_M} m over the front (${low.y.toFixed(2)} vs ${front.toFixed(2)})`);
    // the triangle's extent: no panel standing more than the fold margin over the front once the roof has come down past it
    const hi = Math.max(low.y, atEave.y, top.y);
    if (t >= 3.5) assert.ok(hi <= front + FOLD_ABOVE_FRONT_M + 1e-9, `t ${t}: nothing of it stands over the front (${hi.toFixed(2)} m)`);
  }
  // the old law (the wall vertex fixed): the panel stood 9.9 m high over a front at the base
  assert.ok(eave - 0.4 > collapseFront(4.1, eave) + 5, 'the case the patch failed: the fixed vertex was far over the front');
}

// ---- the tower's glazing: a dark panel from 5.0 m (under a 5.44 m eave) to 10.8 m (over it) — down with the front
{
  const eave = 5.44;
  const b = crumbleVertexY(5.0, 4.1, eave), t = crumbleVertexY(10.8, 4.1, eave);
  assert.ok(b.y <= FOLD_ABOVE_FRONT_M + 1e-9 && t.y < 0.5, `the tower's panel lies on the heap by the end (${b.y.toFixed(2)}, ${t.y.toFixed(2)})`);
}

// ---- a wall under the front is untouched (the cut shows it as it stands); a phone folds the wall onto the front
{
  const eave = 6;
  assert.equal(crumbleVertexY(1.2, 2, eave).y, 1.2, 'a wall vertex under the front stays');
  const front = collapseFront(2, eave);
  assert.equal(crumbleVertexY(5, 2, eave, false).y, front, 'the phone folds the wall onto the front');
  assert.equal(crumbleVertexY(5, 2, eave, true).y, front + FOLD_ABOVE_FRONT_M, 'the desktop brings it to just over it');
  assert.equal(crumbleVertexY(5, 0, eave).y, 5, 'before the fall nothing moves');
}

// ---- the GLSL carries the same law: the desktop patch clamps a wall vertex over the front, the phone's folds it on it
for (const holes of [true, false]) {
  const mask = createStructureMask(8, { holes });
  const material = new THREE.MeshStandardMaterial();
  mask.patch(material);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n', fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}' };
  material.onBeforeCompile(shader, null);
  if (holes) {
    assert.ok(shader.vertexShader.includes(`p.y > front + ${FOLD_ABOVE_FRONT_M.toFixed(2)}`)
      && shader.vertexShader.includes(`p.y = front + ${FOLD_ABOVE_FRONT_M.toFixed(2)};`), 'the desktop vertex patch brings a wall vertex down to the margin');
  } else {
    assert.ok(/else if \( p\.y > front \) \{\s*\/\/[^\n]*\n\s*p\.y = front;/.test(shader.vertexShader), 'the phone patch folds it onto the front');
  }
  assert.ok(shader.vertexShader.includes(`t >= ${COLLAPSE_S.toFixed(2)}`), 'the fold at the end is kept');
}

console.log(`structureMask selftest: a falling building's straddling triangles (the house's roof overhang, the tower's glazing) come down with the front, no panel hangs over the heap; wall vertices kept within ${FOLD_ABOVE_FRONT_M} m of the front on the desktop, folded onto it on a phone — ok`);
