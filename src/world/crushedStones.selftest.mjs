// What a crushed stone leaves (the hitbox lane, 2026-10-10; crushedStones.ts). The coordinator's condition on r3's
// crushable low stones: a crushed stone reads physically. It splits and presses into the ground, leaving fragments and a
// scuff that persist, and it never just vanishes. On a sloped ground and a level one:
//   - the layout is deterministic in the stone's place, and two places lay different pieces;
//   - the pressed body stays where the stone stood, lower than it (a fifth to three fifths of its height over the ground)
//     and narrower across the split, but it never vanishes (at least a third of its width, a tenth of its height);
//   - the two flakes lie either side of the split, clear of the body's middle, each tipped outward (its outer edge lower
//     than its inner) and seated on the ground (never floating, sunk at most a third of their own height);
//   - the three chips land beyond the stone's reach and within twice it, seated the same way, none standing higher than
//     the pressed stone;
//   - the pool lays a stone's pieces in a block of its slots, keeps the block through a rematch, draws nothing while no
//     stone is crushed, refuses past its capacity, and a repeated crush never takes a second block;
//   - the scuffs' pool draws nothing until a stone is crushed, lays its disc as the build conformed it, folds it to a
//     point at a rematch and empties when none is left.
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, CircleGeometry, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import {
  STONE_PIECES, StonePiecePool, StoneScuffPool, createCrushedStoneLayout, crushedStoneLayout, stoneFormOf,
} from './crushedStones.ts';

// a stone-like form: a box seated on y = 0 (its foot under the seat line, as the boulder forms flare theirs)
const geometry = new BoxGeometry(2, 1.6, 2).translate(0, 0.3, 0);
const form = stoneFormOf(geometry);
assert.ok(Math.abs(form.halfLocal - Math.SQRT2) < 1e-6 && Math.abs(form.topLocal - 1.1) < 1e-6, 'the form reads its reach and top');

const grounds = {
  level: () => 2,
  slope: (x, z) => 2 + 0.25 * x - 0.1 * z,
};
const p = new Vector3(), q = new Quaternion(), s = new Vector3(), corner = new Vector3();
/** the lowest and highest world y of the form's corners under a matrix, and the matrix's place */
function extent(matrix) {
  let lo = Infinity, hi = -Infinity;
  for (const cx of [-1, 1]) for (const cy of [-0.5, 1.1]) for (const cz of [-1, 1]) {
    corner.set(cx, cy, cz).applyMatrix4(matrix);
    lo = Math.min(lo, corner.y); hi = Math.max(hi, corner.y);
  }
  matrix.decompose(p, q, s);
  return { lo, hi, x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z };
}
for (const [name, ground] of Object.entries(grounds)) {
  for (const [x, z] of [[10, -4], [-33.5, 71.25]]) {
    // the standing stone: 1.5 wide, 0.9 tall, sunk 0.25 under its ground
    const home = new Matrix4().compose(new Vector3(x, ground(x, z) - 0.25, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7),
      new Vector3(1.5, 0.9, 1.5));
    const reach = form.halfLocal * 1.5;
    const rise = ground(x, z) - 0.25 + form.topLocal * 0.9 - ground(x, z);
    const a = crushedStoneLayout(home, form, ground, createCrushedStoneLayout());
    const b = crushedStoneLayout(home, form, ground, createCrushedStoneLayout());
    assert.deepEqual(Array.from(a.body.elements), Array.from(b.body.elements), `${name} (${x}, ${z}): the body is deterministic`);
    a.pieces.forEach((piece, k) => assert.deepEqual(Array.from(piece.matrix.elements), Array.from(b.pieces[k].matrix.elements),
      `${name} (${x}, ${z}): piece ${k} is deterministic`));
    // the body: in place, pressed, never gone
    const body = extent(a.body);
    assert.ok(Math.hypot(body.x - x, body.z - z) < 1e-6, `${name} (${x}, ${z}): the body stays where the stone stood`);
    // (its top over the ground under each of its top corners: on a slope the ground rises with it)
    let bodyTop = -Infinity;
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      corner.set(cx, 1.1, cz).applyMatrix4(a.body);
      bodyTop = Math.max(bodyTop, corner.y - ground(corner.x, corner.z));
    }
    assert.ok(bodyTop > rise * 0.2 && bodyTop < rise * 0.6, `${name} (${x}, ${z}): the body is pressed (${bodyTop.toFixed(2)} of ${rise.toFixed(2)} m)`);
    assert.ok(Math.min(body.sx, body.sz) * form.halfLocal >= reach * 0.33 && body.sy * form.topLocal >= rise * 0.1,
      `${name} (${x}, ${z}): the body never vanishes`);
    // the flakes: either side, clear of the middle, tipped out, seated
    const flakes = a.pieces.slice(0, 2).map((piece) => ({ piece, e: extent(piece.matrix) }));
    const ux = flakes[0].e.x - x, uz = flakes[0].e.z - z, vx = flakes[1].e.x - x, vz = flakes[1].e.z - z;
    assert.ok(ux * vx + uz * vz < 0, `${name} (${x}, ${z}): the flakes lie either side of the split`);
    for (const { piece, e } of flakes) {
      const out = Math.hypot(e.x - x, e.z - z);
      assert.ok(out > reach * 0.5 && out < reach * 1.4, `${name} (${x}, ${z}): a flake lies clear of the body (${(out / reach).toFixed(2)} reach)`);
      // its outer edge lower than its inner: the form's +-1 along the line from the stone's centre
      const ox = (e.x - x) / out, oz = (e.z - z) / out;
      // the tipped form's top corners on each side of its centre, over their ground
      let outerY = -Infinity, innerY = -Infinity;
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        corner.set(cx, 1.1, cz).applyMatrix4(piece.matrix);
        const along = (corner.x - e.x) * ox + (corner.z - e.z) * oz;
        if (along > 0) outerY = Math.max(outerY, corner.y - ground(corner.x, corner.z));
        else innerY = Math.max(innerY, corner.y - ground(corner.x, corner.z));
      }
      assert.ok(outerY < innerY, `${name} (${x}, ${z}): a flake is tipped outward (outer ${outerY.toFixed(2)} < inner ${innerY.toFixed(2)})`);
      const seat = e.y - piece.ground;
      assert.ok(seat <= 1e-9 && -seat <= e.sy * form.topLocal / 3, `${name} (${x}, ${z}): a flake is seated (${seat.toFixed(3)} m)`);
      assert.ok(Math.abs(piece.ground - ground(e.x, e.z)) < 1e-9, `${name} (${x}, ${z}): a flake carries its ground`);
    }
    // the chips: beyond the reach, within twice it, seated
    for (const piece of a.pieces.slice(2)) {
      const e = extent(piece.matrix);
      const out = Math.hypot(e.x - x, e.z - z);
      assert.ok(out >= reach * 0.99 && out <= reach * 2, `${name} (${x}, ${z}): a chip lands round the stone (${(out / reach).toFixed(2)} reach)`);
      const seat = e.y - piece.ground;
      assert.ok(seat <= 1e-9 && -seat <= e.sy * form.topLocal / 3, `${name} (${x}, ${z}): a chip is seated (${seat.toFixed(3)} m)`);
      // a chip never stands over the pressed stone
      let chipTop = -Infinity;
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        corner.set(cx, 1.1, cz).applyMatrix4(piece.matrix);
        chipTop = Math.max(chipTop, corner.y - ground(corner.x, corner.z));
      }
      assert.ok(chipTop <= bodyTop + 0.02, `${name} (${x}, ${z}): a chip (${chipTop.toFixed(2)} m) stands no higher than the pressed stone (${bodyTop.toFixed(2)} m)`);
    }
    if (name === 'slope') {
      // the pieces lie on the slope: each piece's up leans with the ground's normal
      a.pieces[2].matrix.decompose(p, q, s);
      const up = new Vector3(0, 1, 0).applyQuaternion(q);
      assert.ok(up.x < -0.05, `${name}: a chip leans with the slope (up ${up.x.toFixed(2)}, ${up.y.toFixed(2)}, ${up.z.toFixed(2)})`);
    }
  }
  // two places lay different pieces
  const at = (x, z) => crushedStoneLayout(new Matrix4().compose(new Vector3(x, ground(x, z), z), new Quaternion(), new Vector3(1, 1, 1)), form, ground,
    createCrushedStoneLayout());
  assert.notDeepEqual(Array.from(at(1, 1).pieces[2].matrix.elements), Array.from(at(7, -3).pieces[2].matrix.elements), `${name}: places differ`);
}

// the pool
const pool = new StonePiecePool(geometry, new MeshBasicMaterial(), 2, 'test-pieces');
assert.equal(pool.capacity, 2 * STONE_PIECES);
assert.equal(pool.mesh.count, 0); assert.equal(pool.mesh.visible, false, 'an empty pool draws nothing');
assert.ok(pool.mesh.geometry.getAttribute('aRockGround') && pool.mesh.geometry.getAttribute('aRockSlope'), 'a slot carries its ground and slope');
assert.ok(pool.mesh.geometry.getAttribute('position') === geometry.getAttribute('position'), 'the pool shares the form\'s vertices');
const layoutOf = (x) => crushedStoneLayout(new Matrix4().makeTranslation(x, 2, 0), form, grounds.level, createCrushedStoneLayout());
const one = {}, two = {}, three = {};
assert.equal(pool.show(one, layoutOf(0).pieces), true);
assert.equal(pool.mesh.count, STONE_PIECES); assert.equal(pool.mesh.visible, true);
assert.equal(pool.show(one, layoutOf(0).pieces), true, 'a repeated crush is a no-op');
assert.equal(pool.mesh.count, STONE_PIECES, 'a repeated crush never takes a second block');
assert.equal(pool.show(two, layoutOf(20).pieces), true);
assert.equal(pool.mesh.count, 2 * STONE_PIECES);
assert.equal(pool.show(three, layoutOf(40).pieces), false, 'a full pool refuses');
const m = new Matrix4();
pool.mesh.getMatrixAt(STONE_PIECES, m);
assert.ok(Math.abs(m.elements[12] - layoutOf(20).pieces[0].matrix.elements[12]) < 1e-6, 'the second stone\'s block holds its pieces');
pool.hide(two);
pool.mesh.getMatrixAt(STONE_PIECES, m);
assert.ok([0, 1, 2, 4, 5, 6, 8, 9, 10].every((i) => m.elements[i] === 0), 'a rematch hides the stone\'s pieces (zero scale)');
assert.equal(pool.mesh.count, 2 * STONE_PIECES, 'the block is kept while another stone lies crushed');
assert.equal(pool.show(two, layoutOf(20).pieces), true, 'a re-crush lays the same block again');
pool.mesh.getMatrixAt(STONE_PIECES, m);
assert.ok(Math.abs(m.elements[12] - layoutOf(20).pieces[0].matrix.elements[12]) < 1e-6, 'the re-crush keeps its block');
pool.hide(one); pool.hide(two);
assert.equal(pool.crushed, 0);
assert.equal(pool.mesh.count, 0); assert.equal(pool.mesh.visible, false, 'the pool empties when no stone is crushed');
assert.equal(pool.show(three, layoutOf(40).pieces), true, 'an emptied pool takes stones from its first slot again');
pool.mesh.getMatrixAt(0, m);
assert.ok(Math.abs(m.elements[12] - layoutOf(40).pieces[0].matrix.elements[12]) < 1e-6, 'the first block is reused');

// the scuffs' pool
{
  const disc = (x) => {
    const g = new CircleGeometry(1.5, 12).rotateX(-Math.PI / 2).translate(x, 2.05, 0);
    g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
    g.deleteAttribute('normal');
    return g;
  };
  const scuffs = new StoneScuffPool(new MeshBasicMaterial(), 'test-scuffs');
  const a = {}, b = {}, stranger = {};
  scuffs.register(a, disc(0)); scuffs.register(b, disc(10));
  scuffs.seal();
  const geometry = scuffs.mesh.geometry, per = disc(0).getIndex().count, verts = disc(0).attributes.position.count;
  assert.equal(scuffs.mesh.visible, false); assert.equal(geometry.drawRange.count, 0, 'no scuff is drawn before a crush');
  assert.equal(scuffs.show(stranger), false, 'a stone with no disc lays none');
  assert.equal(scuffs.show(b), true);
  assert.equal(scuffs.mesh.visible, true); assert.equal(geometry.drawRange.count, per, 'one disc drawn');
  assert.ok(Math.abs(geometry.attributes.position.getX(0) - 10) < 1e-6, 'the first crush takes the first slot, its disc as conformed');
  assert.equal(scuffs.show(a), true); assert.equal(geometry.drawRange.count, 2 * per);
  scuffs.hide(b);
  const p = geometry.attributes.position;
  let folded = true;
  for (let i = 1; i < verts; i++) folded &&= p.getX(i) === p.getX(0) && p.getY(i) === p.getY(0) && p.getZ(i) === p.getZ(0);
  assert.ok(folded, 'a rematch folds the scuff to a point');
  assert.equal(geometry.drawRange.count, 2 * per, 'the slots stay while another scuff lies');
  scuffs.show(b);
  assert.ok(Math.abs(p.getX(3) - disc(10).attributes.position.getX(3)) < 1e-6, 'a re-crush lays the disc again');
  scuffs.hide(a); scuffs.hide(b);
  assert.equal(scuffs.crushed, 0); assert.equal(scuffs.mesh.visible, false); assert.equal(geometry.drawRange.count, 0, 'empty again');
}

console.log(`crushedStones.selftest: a crushed stone presses into its ground in place (never gone), splits into two flakes tipped `
  + `outward either side and three chips round it, all seated on level and sloped ground and deterministic in its place; the pool `
  + `lays ${STONE_PIECES} pieces a stone in a kept block, draws nothing while no stone is crushed and refuses past its capacity; the `
  + `scuffs lay at a crush, fold at a rematch and draw nothing while no stone is crushed`);
