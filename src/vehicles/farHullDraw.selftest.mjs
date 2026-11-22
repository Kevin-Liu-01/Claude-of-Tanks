// One draw per far hull (far-hull-273, farHullDraw.ts): past FAR_LOD_ENTER_M a battle build draws its far LOD's stand-ins,
// its far running gear and every live draw one program can carry as one mesh in a copy of its own armour paint. Held here:
// - at 200 m one far hull draw shows; the stand-ins and gear it carries hide, the live draws it carries park, and what it
//   leaves out keeps its own draw, each counted by reason; the colour draws fall well under the far LOD's own;
// - the switch (?farHullDraw=0, window.__FAR_HULL_DEBUG): off, the far LOD draws exactly as it did; on again, the one draw;
// - a live piece's edit is copied in (the merged vertices are the piece's own in its owner's frame), a hidden piece is
//   flagged in its record, and every owner index fits the uniform array;
// - (274) a paint that is a night lens (a searchlight in its mesh) still carries; its copy skips the mask;
// - the program: the far material's whole compile chain then the patch run over three's physical sources without a
//   miss, the vertex stage reads the owner's frame for every model matrix, the vehicle switches become branches, the
//   records drive the paint, roughness, metalness, normal scale, sky light and armour-paint mode;
// - back near, the build draws what the identity build draws (farLod.selftest holds the rest of the near law).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');
const { FAR_LOD_PARKED_LAYER, noteFarLodBuild } = await import('./farLod.ts');
const { FAR_HULL_MAX_PARTS, farHullDrawOf, setFarHullDrawEnabled } = await import('./farHullDraw.ts');

/** The colour draws a camera on layer 0 would make at `dist` (the visible chain, the LOD level the distance picks). */
function draws(visual, dist) {
  visual.root.updateMatrixWorld(true);
  const out = [];
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { let pick = o.levels[0]; for (const l of o.levels) if (dist >= l.distance) pick = l; if (pick) visit(pick.object); return; }
    if (o.isMesh && o.layers.isEnabled(0)) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const groups = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups.length : 1;
      if (materials.some((m) => m.visible && m.colorWrite !== false)) for (let g = 0; g < groups; g++) out.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(visual.root);
  return out;
}
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
const build = (id) => createTank(id, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
  battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' });
const settle = async (visual, state, dist, frames = 2) => {
  for (let i = 0; i < frames; i++) { visual.syncFromState(state, 1 / 30, dist); await new Promise((r) => setTimeout(r, 20)); }
};
const settleFar = async (visual, state, dist = 200) => {
  const until = performance.now() + 30_000;
  // (the one draw builds in a later frame than the stand-ins, each when claimFarLodBuild lets it)
  do await settle(visual, state, dist, 1); while (!visual.root.userData.farLod?.hullDraw && performance.now() < until);
  return visual.root.userData.farLod;
};

const rows = [];
// (274) t80u: its paint carries a searchlight lens (the night mask), and still carries the draw
for (const id of ['m1a2_abrams_sepv3', 't90m', 't80u']) {
  noteFarLodBuild(0, 0);
  await ensureTankBuilder(id);
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  const identity = build(id), dual = build(id);
  await settle(identity, state, 10);
  const info = await settleFar(dual, state);
  assert.ok(info, `${id}: the far LOD was built at 200 m`);
  assert.ok(info.hullDraw && !info.hullDraw.refusal, `${id}: the far hull draw was built (${JSON.stringify(info.hullDraw)})`);
  const mesh = dual.root.getObjectByName('farLodHullDraw');
  assert.ok(mesh?.visible, `${id}: the one draw shows at 200 m`);
  const shown = draws(dual, 200);
  assert.ok(shown.includes(mesh), `${id}: it draws`);
  // what it carries hides (a stand-in, the gear) or parks (a live draw); what it leaves keeps its draw, counted
  const total = Object.values(info.hullDraw.fallbacks).reduce((sum, n) => sum + n, 0);
  assert.equal(info.hullDraw.left.length + Object.entries(info.hullDraw.fallbacks).filter(([k]) => k.startsWith('kind:'))
    .reduce((sum, [, n]) => sum + n, 0), total, `${id}: every fallback is counted by reason`);
  assert.ok(info.hullDraw.live > 0, `${id}: live draws are carried (${info.hullDraw.live})`);
  let parked = 0;
  dual.root.traverse((o) => { if (o.isMesh && o.layers.mask === 1 << FAR_LOD_PARKED_LAYER) parked++; });
  assert.ok(parked >= info.hullSources + info.gearParked + 1, `${id}: the carried live draws park too (${parked})`);
  // the switch: off draws the far LOD as it was, on again the one draw
  setFarHullDrawEnabled(false);
  const before = draws(dual, 200);
  assert.ok(!mesh.visible && before.length > shown.length, `${id}: off, the far LOD's own draws (${before.length} vs ${shown.length})`);
  assert.ok(before.some((o) => o.name === 'farLodHull') && before.some((o) => o.name === 'farLodRunningGear'), `${id}: off, the stand-ins and the gear`);
  setFarHullDrawEnabled(true);
  assert.equal(draws(dual, 200).length, shown.length, `${id}: on again, the same draws`);
  assert.ok(shown.length <= before.length / 3, `${id}: a third of the far LOD's draws or fewer (${before.length} -> ${shown.length})`);
  // the records: every owner fits the uniform array; the merged vertices are the pieces' own
  const piece = mesh.geometry.getAttribute('farPiece');
  let maxPiece = 0;
  for (let i = 0; i < piece.count; i++) maxPiece = Math.max(maxPiece, piece.getX(i));
  assert.ok(maxPiece + 1 === info.hullDraw.carried, `${id}: one record row a carried piece (${maxPiece + 1} / ${info.hullDraw.carried})`);
  // a live edit is copied in: move one vertex of a carried live draw and the merged vertex follows
  {
    const livePiece = farHullDrawOf(mesh).pieces.find((p) => p.live && !p.range && p.geometry.getAttribute('position').count > 3);
    const live = livePiece?.object;
    assert.ok(live, `${id}: a live piece to edit`);
    {
      const p = live.geometry.getAttribute('position');
      // (a piece with a transform of its own is baked into its owner's frame)
      const target = new THREE.Vector3(p.getX(0) + 0.123, p.getY(0), p.getZ(0)).applyMatrix4(livePiece.baked ? live.matrix : new THREE.Matrix4());
      // (an edit rebuilds the draw: read its geometry after)
      const found = () => { const merged = mesh.geometry.getAttribute('position'); for (let i = 0; i < merged.count; i++) if (Math.abs(merged.getX(i) - target.x) < 1e-5 && Math.abs(merged.getY(i) - target.y) < 1e-5 && Math.abs(merged.getZ(i) - target.z) < 1e-5) return true; return false; };
      const was = p.getX(0);
      p.setX(0, p.getX(0) + 0.123); p.needsUpdate = true;
      await settle(dual, state, 200, 1);
      assert.ok(found(), `${id}: an edit of ${live.name} is taken in`);
      assert.ok(farHullDrawOf(mesh).rebuilds >= 1, `${id}: by one rebuild`);
      p.setX(0, was); p.needsUpdate = true;
      await settle(dual, state, 200, 1);
    }
  }
  // the program: the chain and the patch over three's physical sources
  {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    mesh.material.onBeforeCompile(shader, null);
    // (as three compiles it: every chunk expanded, so a matrix a chunk reads is checked too)
    const expand = (t, d = 0) => d > 8 ? t : t.replace(/#include <(\w+)>/g, (w, n) => THREE.ShaderChunk[n] === undefined ? w : expand(THREE.ShaderChunk[n], d + 1));
    const vs = expand(shader.vertexShader), fs = expand(shader.fragmentShader);
    const body = vs.slice(vs.search(/void\s+main\s*\(\s*\)\s*\{/));
    assert.ok(/mat4 farModel = modelMatrix \* uFarParts/.test(body), `${id}: the owner's frame`);
    assert.equal(body.replace(/mat4 farModel = modelMatrix/, '').match(/\bmodelMatrix\b/g), null, `${id}: no model matrix but the owner's in the vertex stage`);
    assert.ok(!/\bmodelViewMatrix\b|\bnormalMatrix\b/.test(body), `${id}: the owner's model-view and normal matrices`);
    for (const token of ['mvPosition = farModelView * mvPosition', 'worldPosition = farModel * worldPosition', 'transformedNormal = farNormalMatrix * transformedNormal']) {
      assert.ok(body.includes(token), `${id}: three's chunks read the owner's frame (${token})`);
    }
    for (const name of ['COT_WHEEL_PAINT_READABILITY', 'COT_GEAR_CAVITY', 'COT_VEHICLE_FLOORLESS', 'COT_NO_FIELD_DUST']) {
      assert.ok(!fs.includes(name), `${id}: ${name} is a branch, not a define`);
    }
    for (const token of ['vFarSurfA.x )', 'roughness * vFarSurfA.y', 'metalness * vFarSurfA.z', 'normalScale * vFarSurfB.y',
      '#define uVehEnvScale vFarSurfA.w', 'farSwitch( 3 )', 'farWeaponDust', 'uFarNightEmissive[ farNight ]', 'nightEmissionTint']) assert.ok(fs.includes(token), `${id}: the fragment reads ${token}`);
    assert.ok(Array.isArray(shader.uniforms.uFarParts.value) && shader.uniforms.uFarParts.value.length === FAR_HULL_MAX_PARTS, `${id}: the owners' uniform`);
    // the branches balance (every brace the switches opened is closed)
    // (over the hooks' text before three's chunks: a chunk's #if branches may each open one function)
    const raw = shader.fragmentShader;
    const opened = (raw.match(/\{/g) ?? []).length, closed = (raw.match(/\}/g) ?? []).length;
    assert.equal(opened, closed, `${id}: the fragment's braces balance`);
    assert.equal((raw.match(/#if/g) ?? []).length, (raw.match(/#endif/g) ?? []).length, `${id}: every #if closes`);
    // a night lens that carries: its copy skips the mask (the lens lights in an emission slot), so no second night block
    assert.equal(mesh.material.userData.nightEmissionMask === true, false, `${id}: the copy is not a night-mask material`);
    assert.ok(!/attribute float nightEmissionMask/.test(shader.vertexShader), `${id}: the program declares no night mask attribute`);
    assert.equal((fs.match(/uniform vec3 nightEmissionWarm/g) ?? []).length, 1, `${id}: the night uniforms declared once`);
    if (id === 't80u') {
      assert.equal(mesh.material.name, 'cot:armor-paint', `${id}: the armour paint carries though it is a night lens`);
      assert.equal(mesh.material.userData.nightEmissionMask, false, `${id}: its copy skips the mask`);
    }
  }
  // the articulation: turn the turret's rig and the draw's owner matrix for it follows (the uniform the program reads)
  {
    const turret = farHullDrawOf(mesh).pieces.find((p) => /turret/i.test(p.owner.name))?.owner;
    assert.ok(turret, `${id}: a piece rides the turret`);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    mesh.material.onBeforeCompile(shader, null);
    const was = turret.rotation.y;
    turret.rotation.y = was + 0.7;
    dual.root.updateMatrixWorld(true);
    mesh.onBeforeRender(null, null, camera, mesh.geometry, mesh.material, null);
    const expected = new THREE.Matrix4().copy(dual.root.matrixWorld).invert().multiply(turret.matrixWorld);
    const parts = shader.uniforms.uFarParts.value;
    assert.ok(parts.some((m) => m.elements.every((v, i) => Math.abs(v - expected.elements[i]) < 1e-6)), `${id}: the turret's owner matrix follows its turn`);
    turret.rotation.y = was;
    dual.root.updateMatrixWorld(true);
  }
  // back near: what the identity build draws
  await settle(dual, state, 10);
  // (every draw's geometry bytes, world matrix, materials and layers: the parked live draws are given back as they were)
  const sign = (o) => {
    const g = o.geometry, digest = createHash('sha256');
    for (const name of Object.keys(g.attributes).sort()) digest.update(name).update(Buffer.from(g.attributes[name].array.buffer, g.attributes[name].array.byteOffset, g.attributes[name].array.byteLength));
    if (g.index) digest.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    return `${o.name}|${digest.digest('hex').slice(0, 12)}|${o.matrixWorld.elements.map((v) => v.toFixed(5)).join(',')}|${materials.map((m) => m.name).join('+')}|${o.layers.mask}`;
  };
  assert.deepEqual(draws(dual, 10).map(sign), draws(identity, 10).map(sign), `${id}: back near, the identity build's draws to the byte`);
  rows.push(`${id}: far LOD ${before.length} draws -> ${shown.length} (carried ${info.hullDraw.carried} of ${info.hullDraw.of}, live ${info.hullDraw.live}, fallbacks ${JSON.stringify(info.hullDraw.fallbacks)})`);
  identity.dispose(); dual.dispose();
}
restoreCanvas();
console.log(`farHullDraw.selftest: ${rows.join('; ')}`);
