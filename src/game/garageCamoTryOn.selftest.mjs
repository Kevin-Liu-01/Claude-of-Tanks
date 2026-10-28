import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageCamoTryOn } from './garageCamoTryOn.ts';

// The camo try-on (INTERACTION-REDESIGN B): a preview returns before it paints, paints the hull's camo albedos only, a
// newer preview cancels an older one, leaving restores the worn maps, the tile cache stays bounded and never drops a
// tile a material shows, and a worn paint's tile holds until its bake settles.

const camo = new THREE.Texture();
camo.colorSpace = THREE.SRGBColorSpace;
camo.wrapS = camo.wrapT = THREE.RepeatWrapping;
camo.channel = 1;
const rubber = new THREE.Texture();
const hull = new THREE.MeshStandardMaterial({ map: camo });
const turret = new THREE.MeshStandardMaterial({ map: camo });
const tyre = new THREE.MeshStandardMaterial({ map: rubber });
const bare = new THREE.MeshStandardMaterial();
const root = new THREE.Group();
for (const material of [hull, turret, tyre, bare]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
root.add(new THREE.Mesh(new THREE.BufferGeometry(), [hull, tyre]));

let painted = [];
let changes = 0;
const queue = [];
const flush = () => { while (queue.length) queue.shift().run(); };
const tryOn = createGarageCamoTryOn({
  paint: (worn, selection, canvas) => {
    if (worn !== camo) return false;
    painted.push(selection);
    assert.equal(canvas.width, 256, 'the try-on tile is 256 px');
    return true;
  },
  onChange: () => { changes++; },
  schedule: (callback) => {
    const job = { run: () => { if (!job.cancelled) callback(); }, cancelled: false };
    queue.push(job);
    return () => { job.cancelled = true; };
  },
  createCanvas: () => ({ width: 0, height: 0 }),
});

// a preview returns at once and paints on the next task
tryOn.preview(root, 'desert');
assert.deepEqual(painted, [], 'preview paints nothing in its own call');
assert.ok(hull.map === camo);
flush();
assert.deepEqual(painted, ['desert'], 'one tile per worn albedo and selection');
assert.ok(hull.map !== camo, 'the hull wears the tile');
assert.ok(hull.map === turret.map, 'every material on the albedo shares its tile');
assert.ok(tyre.map === rubber, 'rubber stays rubber');
assert.ok(bare.map === null);
assert.equal(hull.map.colorSpace, camo.colorSpace, 'the tile samples as the worn texture does');
assert.equal(hull.map.wrapS, camo.wrapS);
assert.equal(hull.map.channel, camo.channel);
assert.equal(tryOn.trying, 'desert');
assert.ok(changes > 0);

// a newer preview cancels one not yet painted
painted = [];
tryOn.preview(root, 'winter');
tryOn.preview(root, 'urban');
flush();
assert.deepEqual(painted, ['urban'], 'the cancelled try-on never painted');

// a pointer sweeping back repaints nothing
painted = [];
tryOn.preview(root, 'desert');
flush();
assert.deepEqual(painted, [], 'a kept tile is reused');

// leaving restores the worn maps with no paint
tryOn.preview(root, null);
assert.ok(hull.map === camo, 'leaving puts the worn paint back at once');
assert.ok(turret.map === camo);
assert.equal(tryOn.trying, null);

// the tile cache stays bounded and keeps the tile on screen
for (let i = 0; i < 20; i++) { tryOn.preview(root, `p${i}`); flush(); }
const shownTile = hull.map;
assert.ok(shownTile && shownTile !== camo);
tryOn.preview(root, 'p0');
flush();
assert.ok(painted.filter((id) => id === 'p0').length >= 2, 'the oldest tiles were dropped (p0 painted again)');
tryOn.preview(root, null);

// a worn paint's tile holds through a leave until its bake settles
tryOn.wear(root, 'tropical');
flush();
const wornTile = hull.map;
assert.ok(wornTile !== camo);
tryOn.preview(root, null);
flush();
assert.ok(hull.map === wornTile, 'the worn paint keeps its tile until the bake lands');
tryOn.preview(root, 'night');
flush();
assert.ok(hull.map !== wornTile, 'another paint can still be tried meanwhile');
tryOn.preview(root, null);
flush();
assert.ok(hull.map === wornTile, 'and leaving returns to the worn tile');
tryOn.settle('tropical');
assert.ok(hull.map === camo, 'the bake landed: the worn texture is back');
assert.equal(tryOn.trying, null);

// another tank drops the hold and gives the old one back its maps
const other = new THREE.Group();
tryOn.wear(root, 'digital');
flush();
tryOn.preview(other, null);
assert.ok(hull.map === camo, 'switching tanks restores the old hero');
assert.equal(tryOn.trying, null);

console.log('garageCamoTryOn selftest: PASS');
