// weaponFinish.selftest.mjs — the fleet's weapon finish (fleet-weapons lane, 2026-10-09).
//
// Owner: "make sure all our autocannons and machine guns look good too. some are drab and plain colored or dont have
// camo applied on right". The census of all 220 hulls found every gun in one flat colour (1,146 weapon meshes in the
// hardware gunmetal, 536 in the flat fitting paint, every ammunition can in the scheme tint), six remote stations whose
// armoured bodies fell back to the gunmetal through an unknown fitting slot ('turret'), and the T-90MS Tagil tower's
// optic housing squeezing the whole camouflage tile onto each 0.2 m face. This receipt holds the rule:
// - the weapon-finish textures are deterministic; the crease-edge bake marks a box's twelve edges and a tube's rims,
//   never a face diagonal or the seam between smooth facets; the wear shader term is injected and keyed;
// - an unknown fitting slot throws, and no profile names the bucket 'turret' as a fitting slot;
// - on rendered builds of every weapon grammar (crew pintle guns, American and open-yoke remote stations, measured
//   source stations, the field roof weapon, exact source-measured guns, the Tagil tower) no weapon mesh is a flat
//   single colour: steel is weapon steel with its grain UVs and wear attributes, cans and rounds the ammunition drab with
//   their drab and brass vertex colours, housings and shields the hull camouflage at the fleet's metre-scale density;
// - geometry-receipt builds are untouched (no weapon materials, no wear attributes: the fleet ledgers stay put), and
//   every weapon material is released on dispose.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { createTank, KIT } from './tankFactory.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import {
  WEAPON_EDGE_BARY, WEAPON_EDGE_INVH, WEAPON_STEEL_UV_REPEATS_PER_M, bakeWeaponEdgeWear, installWeaponEdgeWear,
  weaponFinishTextures,
} from './weaponFinish.ts';
import { FITTINGS } from './profiles/kit.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';

// ---- textures: deterministic and in range -----------------------------------------------------------------------
{
  const tex = weaponFinishTextures();
  assert.equal(weaponFinishTextures(), tex, 'the textures are built once and shared');
  const digest = (t) => createHash('sha256').update(t.image.data).digest('hex').slice(0, 16);
  const digests = { albedo: digest(tex.albedo), rough: digest(tex.rough), normal: digest(tex.normal) };
  assert.deepEqual(digests, { albedo: 'c08b792a2afb3444', rough: '0ad59fa92829bdf3', normal: '281b1fe8cab57a05' }, `weapon-finish textures ${JSON.stringify(digests)}`);
  assert.equal(tex.albedo.colorSpace, THREE.SRGBColorSpace, 'the albedo multiplier is sRGB');
  assert.equal(tex.rough.colorSpace, THREE.NoColorSpace, 'the rough/metal/chip map is linear data');
  let lo = 255, hi = 0;
  for (let i = 1; i < tex.albedo.image.data.length; i += 4) { lo = Math.min(lo, tex.albedo.image.data[i]); hi = Math.max(hi, tex.albedo.image.data[i]); }
  assert.ok(hi - lo >= 40, `the albedo carries visible break-up (green ${lo}..${hi})`);
  assert.ok(lo >= 150, `and stays a multiplier near white (no black holes: min ${lo})`);
}

// ---- crease-edge bake ---------------------------------------------------------------------------------------------
{
  const box = new THREE.BoxGeometry(0.3, 0.1, 0.5).toNonIndexed();
  assert.equal(bakeWeaponEdgeWear(box), 24, 'a box: two crease edges per triangle (its twelve edges, both sides)');
  const invH = box.getAttribute(WEAPON_EDGE_INVH), bary = box.getAttribute(WEAPON_EDGE_BARY);
  for (let t = 0; t < invH.count / 3; t++) {
    let zeros = 0;
    for (let e = 0; e < 3; e++) if (invH.getComponent(t * 3, e) === 0) zeros++;
    assert.equal(zeros, 1, `box triangle ${t}: exactly its diagonal is no crease`);
    for (let v = 0; v < 3; v++) assert.equal(bary.getComponent(t * 3 + v, v), 1, 'each corner carries its own barycentric axis');
  }
  // a capped 16-sided tube: the facet seams (22.5 degrees) are smooth, the two rims are creases
  const tube = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 16, 1, false).toNonIndexed();
  const marked = bakeWeaponEdgeWear(tube);
  assert.equal(marked, 16 * 2 * 2, `a capped tube marks both rims from both sides only (${marked})`);
  // an open tube mouth is a boundary: still worn
  const open = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 16, 1, true).toNonIndexed();
  assert.equal(bakeWeaponEdgeWear(open), 16 * 2, 'an open tube marks its two mouths');
  assert.throws(() => bakeWeaponEdgeWear(new THREE.BoxGeometry()), /non-indexed/, 'indexed input is refused');
}

// ---- the wear shader term ---------------------------------------------------------------------------------------
{
  const material = new THREE.MeshStandardMaterial();
  material.customProgramCacheKey = () => 'veh-ambient-floor-v5';
  installWeaponEdgeWear(material, 0x8f8c84, 0.34, 0.85);
  installWeaponEdgeWear(material, 0x8f8c84, 0.34, 0.85);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>',
  };
  material.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader, new RegExp(`attribute vec3 ${WEAPON_EDGE_BARY}`), 'the bake attributes reach the vertex stage');
  assert.match(shader.fragmentShader, /fwidth\( ed \)/, 'the band fades where it is under a pixel');
  assert.equal((shader.fragmentShader.match(/weaponEdgeDistance\(\) \{/g) ?? []).length, 1, 'installed once');
  assert.ok(shader.uniforms.uWeaponWornColor && shader.uniforms.uWeaponWearCore, 'wear uniforms bound');
  assert.match(material.customProgramCacheKey(), /^veh-ambient-floor-v5\|weapon-wear-v1/, 'the program key keeps the vehicle key and adds the wear');
  material.dispose();
}

// ---- unknown fitting slots throw; no profile names a bucket as a slot ------------------------------------------
{
  const mats = { hull: new THREE.MeshStandardMaterial(), detail: new THREE.MeshStandardMaterial(), dark: new THREE.MeshStandardMaterial(),
    glass: new THREE.MeshStandardMaterial(), shadow: new THREE.MeshStandardMaterial() };
  assert.throws(() => FITTINGS.openYokeRws({ mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower' }), /unknown material slot 'turret'/,
    'a bucket name is not a fitting material slot');
  // receipt (non-rendering) builds keep the station body in the fitting paint, byte-identical; a rendered set (it carries
  // the weapon steel) paints the body with the hull and the gun in weapon steel
  const plain = FITTINGS.openYokeRws({ mats, sizeStandard: 'k2b-compact-tower' });
  let detailMeshes = 0;
  plain.traverse((o) => { if (o.isMesh && o.material === mats.detail) detailMeshes++; });
  assert.ok(detailMeshes >= 1, 'a receipt build keeps the station body in the fitting paint');
  const weaponSteel = new THREE.MeshStandardMaterial();
  weaponSteel.userData = { weaponFinish: 'weaponSteel', weaponUvScale: WEAPON_STEEL_UV_REPEATS_PER_M };
  const rendered = FITTINGS.openYokeRws({ mats: { ...mats, weaponSteel }, sizeStandard: 'k2b-compact-tower' });
  let hullMeshes = 0, steelMeshes = 0, flatMeshes = 0;
  rendered.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === mats.hull) hullMeshes++;
    if (o.material === weaponSteel) steelMeshes++;
    if (o.material === mats.detail || o.material === mats.dark) flatMeshes++;
  });
  assert.ok(hullMeshes >= 1 && steelMeshes >= 1, `a rendered station paints its body with the hull and its gun in weapon steel (${hullMeshes}/${steelMeshes})`);
  assert.equal(flatMeshes, 0, 'no rendered station mesh keeps the flat fitting paint or hardware gunmetal');
  weaponSteel.dispose();
  const dir = new URL('./profiles/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/bodySlot:\s*'(turret|gun|gunMount)'/.test(text), `${file}: bodySlot names a material slot, never a bucket`);
  }
}

// ---- rendered builds: no flat weapon mesh -------------------------------------------------------------------------
const registered = new Set();
const released = new Set();
const engineCtx = {
  anisotropy: 1,
  setupShadowMaterial(material, hook) {
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
    material.onBeforeCompile = (shader) => { shader.uniforms.CSM_cascades = { value: [] }; hook?.(shader); };
    registered.add(material);
    return material;
  },
  releaseShadowMaterial(material) { released.add(material); return true; },
};
// one hull per weapon grammar: crew pintle guns (M1A1), the American RWS (M1A2), open-yoke stations (CV90, Type 89,
// VT-4A1), a measured source station (T-72B3M), the field roof weapon (Griffin 50), exact source-measured guns (Sabra,
// BMP-3M Dragun, Ares, Merkava Barak), the Tagil tower (T-90MS), an IFV's gun steel (M2A2 Bradley)
const IDS = ['m1a1', 'm1a2', 'cv90', 'type89_light_tiger', 'vt4a1', 't72b3m', 'griffin50_x', 'sabra_mk2_x',
  'bmp3m_dragun125_x', 'ares_apc_x', 'merkava4_barak', 't90ms', 'm2a2_bradley'];
const isWeaponMesh = (o) => {
  for (let q = o; q; q = q.parent) {
    const fitting = q.userData?.fitting;
    if (fitting === 'pintleMG' || fitting === 'openYokeRws' || fitting === 'auxiliaryWeapon') return true;
    if (/^sourceMachineGun_/.test(q.name || '')) return true;
  }
  return false;
};
// The camouflage density is a vehicle-frame quantity: a mesh inside a scaled group (the Griffin's reduced turret scales
// its stations' groups by 0.81) carries UVs projected for its vehicle-frame size, so measure in the tank root's frame.
function uvDensityMedian(mesh, root) {
  const geometry = mesh.geometry;
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), index = geometry.index;
  const n = index ? index.count : pos.count, samples = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const [i0, i1, i2] = [t, t + 1, t + 2].map((k) => (index ? index.getX(k) : k));
    a.fromBufferAttribute(pos, i0).applyMatrix4(toRoot); b.fromBufferAttribute(pos, i1).applyMatrix4(toRoot);
    c.fromBufferAttribute(pos, i2).applyMatrix4(toRoot);
    const world = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    if (world < 1e-9) continue;
    const uvArea = Math.abs((uv.getX(i1) - uv.getX(i0)) * (uv.getY(i2) - uv.getY(i0)) - (uv.getX(i2) - uv.getX(i0)) * (uv.getY(i1) - uv.getY(i0))) / 2;
    samples.push([Math.sqrt(uvArea / world), world]); total += world;
  }
  samples.sort((x, y) => x[0] - y[0]);
  let acc = 0;
  for (const [d, w] of samples) { acc += w; if (acc >= total / 2) return d; }
  return 0;
}
const rgbOf = (geometry) => { const c = geometry.getAttribute('color'); return c ? [c.getX(0), c.getY(0), c.getZ(0)] : null; };
const restoreCanvas = installCanvasFixture();
const visuals = [];
const tally = { steel: 0, worn: 0, ammo: 0, paint: 0, other: 0 };
try {
  for (const id of IDS) {
    const visual = createTank(id, engineCtx, { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
    visuals.push(visual);
    let weaponMeshes = 0;
    visual.root.traverse((o) => {
      if (!o.isMesh || !isWeaponMesh(o)) return;
      const material = o.material;
      const name = material?.name ?? '';
      weaponMeshes++;
      assert.ok(name !== 'cot:gunmetal' && name !== 'cot:fitting-paint',
        `${id}/${o.name}: a weapon mesh is never the flat hardware gunmetal or the flat fitting paint (${name})`);
      if (name === 'cot:weapon-steel') {
        tally.steel++;
        assert.ok(material.map && material.roughnessMap && material.normalMap, `${id}/${o.name}: weapon steel carries its maps`);
        // merged weapon geometry (one triangle per three vertices) bakes the wear; an authored indexed solid keeps its
        // positions and index (the fingerprints hash them) and takes the grain alone
        if (!o.geometry.index) {
          tally.worn++;
          assert.ok(o.geometry.getAttribute(WEAPON_EDGE_BARY) && o.geometry.getAttribute(WEAPON_EDGE_INVH), `${id}/${o.name}: the wear is baked`);
        }
        assert.ok(o.geometry.getAttribute('uv'), `${id}/${o.name}: the grain has its UVs`);
        assert.ok(registered.has(material), `${id}/${o.name}: weapon steel joins the cascade registration`);
        assert.equal(material.userData.weaponUvScale, WEAPON_STEEL_UV_REPEATS_PER_M);
      } else if (name === 'cot:ammo-drab') {
        tally.ammo++;
        const rgb = rgbOf(o.geometry);
        assert.ok(rgb && rgb.some((v) => v < 0.9), `${id}/${o.name}: the can's drab or the rounds' brass is in its vertex colours`);
        assert.ok(material.vertexColors, `${id}/${o.name}: the ammunition material reads its vertex colours`);
      } else if (name === 'cot:armor-paint') {
        tally.paint++;
        const uv = o.geometry.getAttribute('uv'), pos = o.geometry.getAttribute('position');
        assert.ok(uv && o.geometry.getAttribute('color'), `${id}/${o.name}: painted housings carry camouflage UVs and vertex colours`);
        // the camouflage density: the area-weighted median of sqrt(UV area / world area) is the fleet's repeats per metre
        const density = uvDensityMedian(o, visual.root);
        assert.ok(Math.abs(density - CAMO_UV_REPEATS_PER_M) < CAMO_UV_REPEATS_PER_M * 0.15,
          `${id}/${o.name}: camouflage projected at the fleet density (${density.toFixed(3)} per metre)`);
      } else {
        tally.other++;
        assert.ok(/optic-glass|gear-shadow/.test(name), `${id}/${o.name}: only glass and gear shadow may be untextured (${name})`);
      }
    });
    assert.ok(weaponMeshes >= 1, `${id}: weapon meshes were covered (${weaponMeshes})`);
  }
  // the T-90MS Tagil tower: the optic housing projects the camouflage at the fleet density (was 4.6 a metre)
  const t90ms = visuals[IDS.indexOf('t90ms')];
  const housing = t90ms.root.getObjectByName('t90msTagilTowerOpticHousing');
  assert.ok(housing, 't90ms: the Tagil optic housing exists');
  {
    const density = uvDensityMedian(housing, t90ms.root);
    assert.ok(Math.abs(density - CAMO_UV_REPEATS_PER_M) < 0.05, `t90ms: the optic housing projects the camouflage at the fleet density (${density.toFixed(3)} per metre, was 4.6)`);
  }
} finally {
  for (const visual of visuals) visual.dispose();
  restoreCanvas();
}
assert.ok(tally.steel >= 20 && tally.worn >= tally.steel * 0.8 && tally.ammo >= 6 && tally.paint >= 10, `the grammars were covered ${JSON.stringify(tally)}`);
const leaked = [...registered].filter((material) => /weapon-steel|ammo-drab/.test(material.name) && !released.has(material));
assert.equal(leaked.length, 0, 'every weapon-finish material is released on dispose');

// ---- geometry-receipt builds are untouched ------------------------------------------------------------------------
{
  const receipt = createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true });
  let wear = 0, finish = 0;
  receipt.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry.getAttribute(WEAPON_EDGE_BARY)) wear++;
    if (/weapon-steel|ammo-drab/.test(o.material?.name ?? '')) finish++;
  });
  receipt.dispose();
  assert.equal(wear + finish, 0, 'a geometry-receipt build carries no weapon finish (the fleet ledgers stay byte-identical)');
}
void KIT;
console.log(`weaponFinish.selftest: ${IDS.length} hulls, ${JSON.stringify(tally)} weapon meshes, no flat weapon mesh, `
  + 'unknown slots refused, the Tagil optic at the fleet camouflage density, receipt builds untouched PASS');
