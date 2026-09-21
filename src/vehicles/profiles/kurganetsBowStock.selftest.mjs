import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { buildKurganets25X as candidate } from './kurganetsX.ts';
import { buildKurganets25X as restore } from './kurganetsX.ts';
import { KIT } from './kit.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { isTrackShoeMesh } from '../../../tools/track-clip-classification.mjs';
const id = 'kurganets25_x', front = new T.MeshBasicMaterial({ side: T.FrontSide }), double = new T.MeshBasicMaterial({ side: T.DoubleSide });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const visible = h => {
    for (let n = h.object; n; n = n.parent)
        if (!n.visible || n.userData.shadowOnly)
            return false;
    return true;
};
function first(root, p, d, far = 20) {
    return new T.Raycaster(new T.Vector3(...p), new T.Vector3(...d), 0, far).intersectObject(root, true).find(visible);
}
function triangles(g) {
    const p = g.attributes.position, ix = g.index, rows = [];
    for (let i = 0; i < (ix?.count ?? p.count); i += 3)
        rows.push(new T.Triangle(...[0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k))));
    return rows;
}
function geometryHash(g) {
    const h = crypto.createHash('sha256');
    for (const [n, a] of Object.entries(g.attributes).sort()) {
        h.update(n);
        h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
    }
    if (g.index)
        h.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
    return h.digest('hex');
}
function build(builder, quality, mutation) {
    const parts = [];
    registerProfiledBuilders({ [id](P) {
            const mudguard = P.addMudguard;
            P.addMudguard = (label, bucket, g, ...tr) => {
                if (mutation === 'unseat-flap' && g.userData.kurgBowRole === 'front-flap')
                    g.translate(0, -.12, 0);
                const geometry = KIT.xform(g.clone(), ...tr), mesh = new T.Mesh(geometry, double);
                geometry.computeBoundingBox();
                mesh.updateMatrixWorld(true);
                parts.push({ bucket, role: g.userData.kurgBowRole, mesh });
                return mudguard(label, bucket, g, ...tr);
            };
            const add = P.add;
            P.add = (bucket, g, ...tr) => {
                const role = g.userData.kurgBowRole;
                if (mutation === 'wrong-armor-owner' && bucket === 'hull' && role)
                    bucket = 'hullDetail';
                if (mutation === 'delete-skin' && role === 'folded-skin') {
                    g.dispose();
                    return;
                }
                if (mutation === 'unseat-arm' && role === 'side-receiver')
                    g.translate(0, 0, -.2);
                const geometry = KIT.xform(g.clone(), ...tr), mesh = new T.Mesh(geometry, double);
                geometry.computeBoundingBox();
                mesh.updateMatrixWorld(true);
                parts.push({ bucket, role, mesh });
                return add(bucket, g, ...tr);
            };
            builder(P);
            if (mutation === 'fill-gap') {
                const g = KIT.box(2.8, .14, .055);
                g.userData.kurgBowRole = 'negative-gap';
                P.add('hullDetail', g, 0, 1.5, 3.585);
            }
        } });
    let tank;
    try {
        tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242, deferStaticBatch: true });
    }
    finally {
        registerProfiledBuilders({ [id]: restore });
    }
    tank.root.traverse(o => {
        if (o.isLOD) {
            o.autoUpdate = false;
            o.levels.forEach((l, i) => l.object.visible = i === 0);
        }
        if (o.isMesh) {
            if (o.userData.shadowOnly || o.material?.colorWrite === false)
                o.visible = false;
            else
                o.material = front;
        }
    });
    tank.root.updateMatrixWorld(true);
    return { tank, parts, dispose() {
            tank.dispose();
            parts.forEach(p => p.mesh.geometry.dispose());
        } };
}
// Immutable approved-source complete-scene rays, independent of candidate construction.
const firstHits = [[1.75, 3.65387594], [1.2, 3.45380188], [1.3, 3.48914237], [1.4, 3.56525036], [1.46, 3.61091515], [1.5, 3.64135834], [1.55, 3.67941233], [1.6, 3.71496389], [1.65, 3.73216388], [1.7, 3.74936387]];
function sourceProof(b) {
    let maximum = 0;
    for (const x of [-1.3, -1, 0, 1, 1.3])
        for (const [y, z] of firstHits) {
            const hit = first(b.tank.root, [x, y, 5], [0, 0, -1], 2);
            assert.ok(hit, 'broad physical skin is visible');
            const error = Math.abs(hit.point.z - z);
            maximum = Math.max(maximum, error);
            assert.ok(error < .002, `source front ${x}/${y}: ${error}`);
        }
    return maximum;
}
function structuralArmor(built) {
    for (const x of [-1, 0, 1]) {
        const hit = first(built.tank.root, [x, 1.75, 5], [0, 0, -1], 2);
        assert.ok(hit && Math.abs(hit.point.z - 3.65387594) < .002, 'measured receiving armor is exposed');
        assert.equal(hit.object.name, 'hull', 'first visible receiving armor belongs to the hit shell');
    }
    for (const x of [-1, 1]) {
        const hit = first(built.tank.root, [x, 2, 3.70], [0, -1, 0], .5);
        assert.ok(hit && Math.abs(hit.point.y - 1.75988) < .002, 'thin roof continuation is physically exposed');
        assert.equal(hit.object.name, 'hull', 'forward roof continuation belongs to the hit shell');
    }
}
function contains(mesh, p) {
    const d = new T.Vector3(1, 0, 0), hits = new T.Raycaster(new T.Vector3(...p).addScaledVector(d, -6), d, 0, 12).intersectObject(mesh).filter((h, i, a) => !i || Math.abs(h.distance - a[i - 1].distance) > 1e-7), a = hits.filter(h => h.distance < 6 - 1e-6).at(-1), b = hits.find(h => h.distance > 6 + 1e-6);
    return !!a && !!b && a.face.normal.dot(d) < -.001 && b.face.normal.dot(d) > .001;
}
const joints = [
    ...[-1.35, 1.35].map(x => ['front flap receiving root', [x, 1.405, 3.15], ['front-flap', 'hull']]),
    ['tongue/skin', [0, 1.2023, 3.4139], ['central-tongue', 'folded-skin']],
    ['return/skin', [.4, 1.23, 3.43581], ['lower-return', 'folded-skin']],
    ...[-1.5229, 1.5181].flatMap(x => [
        ['arm/skin', [x, 1.25, 3.4210], ['side-receiver', 'folded-skin']],
        ['arm/pivot', [x, 1.65, 3.565], ['side-receiver', 'side-pivot']],
        ['pivot/hull', [x, 1.65, 3.52], ['side-pivot', 'hull']],
    ]),
];
function seats(b) {
    for (const [name, point, roles] of joints)
        for (const role of roles)
            assert.ok(b.parts.some(p => (p.role ?? p.bucket) === role && contains(p.mesh, point)), `${name}: ${role} has positive material at ${point}`);
    return joints.length;
}
function emptySpan(root, y, z, label) {
    const previous = front.side;
    front.side = T.DoubleSide;
    try {
        const start = [-1.3, y, z];
        assert.equal(first(root, start, [1, 0, 0], 2.6), undefined, label + ': no surface crosses span');
        for (const direction of [-1, 1]) {
            const hit = first(root, start, [direction, 0, 0], 10);
            if (!hit)
                continue;
            const normal = hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
            assert.ok(normal.x * direction < 1e-6, label + ': span origin is not enclosed');
        }
    }
    finally {
        front.side = previous;
    }
}
function air(b) {
    emptySpan(b.tank.root, 1.236, 3.46, 'rolled return retains its hollow interior');
    emptySpan(b.tank.root, 1.4, 3.516, 'air behind lower folded skin');
    emptySpan(b.tank.root, 1.5, 3.58, 'air behind upper folded skin');
}
function oldFrontFlap(p) {
    const b = p.mesh.geometry.boundingBox;
    return p.bucket === 'hullRubber' && b.min.z > 3.42 && b.max.z < 3.55 && b.min.y < .9;
}
function preserved(b) {
    const unchanged = b.parts.filter(p => p.bucket !== 'hull' && !p.role && !oldFrontFlap(p)).map(p => [p.bucket, geometryHash(p.mesh.geometry)]);
    const aft = b.parts.filter(p => p.bucket === 'hull').flatMap(p => triangles(p.mesh.geometry).filter(t => Math.max(t.a.z, t.b.z, t.c.z) <= 3 + 1e-7).map(t => [t.a, t.b, t.c].flatMap(v => v.toArray())));
    const gear = [];
    b.tank.root.traverse(o => {
        if (o.isMesh && !o.userData.shadowOnly && /gear|track|wheel|idler|sprocket/i.test(o.name))
            gear.push([o.name, geometryHash(o.geometry), o.matrixWorld.toArray(), o.isInstancedMesh ? sha(Buffer.from(o.instanceMatrix.array.buffer)) : null]);
    });
    return { unchanged: sha(JSON.stringify(unchanged)), aft: sha(JSON.stringify(aft)), gear: sha(JSON.stringify(gear)) };
}
function clearance(b, intrude = false) {
    const stock = b.parts.filter(p => p.bucket === 'hull' || p.role).flatMap(p => triangles(p.mesh.geometry)).filter(t => Math.max(t.a.z, t.b.z, t.c.z) > 3);
    const shoes = [];
    b.tank.root.traverse(o => {
        if (isTrackShoeMesh(o))
            shoes.push(o);
    });
    assert.ok(shoes.length);
    const state = createTankState(getSpec(id), new T.Vector3(), 0), instance = new T.Matrix4(), world = new T.Matrix4();
    let count = 0;
    for (const phase of [0, .023, .057, .101, .149]) {
        state.trackScroll.l = phase;
        state.trackScroll.r = phase;
        b.tank.syncFromState(state, 1);
        b.tank.root.updateMatrixWorld(true);
        for (const shoe of shoes) {
            shoe.geometry.computeBoundingBox();
            for (let i = 0; i < shoe.count; i++) {
                shoe.getMatrixAt(i, instance);
                world.multiplyMatrices(shoe.matrixWorld, instance);
                const box = shoe.geometry.boundingBox.clone().applyMatrix4(world);
                if (box.max.z < 3)
                    continue;
                count++;
                if (intrude) {
                    const p = box.getCenter(new T.Vector3());
                    stock.push(new T.Triangle(p.clone().add(new T.Vector3(.001, 0, 0)), p.clone().add(new T.Vector3(0, .001, 0)), p.clone().add(new T.Vector3(0, 0, .001))));
                    intrude = false;
                }
                for (const t of stock)
                    assert.equal(box.intersectsTriangle(t), false, `moving shoe ${shoe.name}/${i} at phase ${phase}: bounds ${JSON.stringify([box.min.toArray(), box.max.toArray()])} triangle ${JSON.stringify([t.a.toArray(), t.b.toArray(), t.c.toArray()])}`);
            }
        }
    }
    return count;
}
// Authenticated pre-correction stock receipts; private before/after construction
// compares the same expanded stock and actual gear in both quality levels.
// Non-hull stock refreshed for the authorized 2026-09-21 gun/recess correction;
// the original aft-hull and running-gear receipts remain exact.
const originalStock = {
    "high": {
        "unchanged": "d43ff27403d444b5d2c889fe2a350775ec6c31153f144c5f05125a4350aa8ba4",
        "aft": "5a76805eec7e78ee11be9e7561920cc0c14e462ab56ae093c63eec8500f63f97",
        "gear": "48badbb3b5ef75574968e9d6cff466d3c0ceee80709ed457f9348a5659d922af"
    },
    "low": {
        "unchanged": "076787992f85fbe81fec310ced65fb420bf09a463a6321a96e1fcfa205bd718e",
        "aft": "5a76805eec7e78ee11be9e7561920cc0c14e462ab56ae093c63eec8500f63f97",
        "gear": "20e82eee2d923305378bc312db050a4da34d902f3d28ad4e6c1b949de7371a88"
    }
};
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id), 'test must exercise the generated runtime fill');
const report = [];
for (const quality of ['high', 'low']) {
    const built = build(candidate, quality);
    try {
        const stock = preserved(built);
        assert.deepEqual(stock, originalStock[quality], 'unchanged stock, aft hull and actual gear remain exact');
        const maxResidualM = sourceProof(built);
        const finiteJoints = seats(built);
        structuralArmor(built);
        air(built);
        let triangleCount = 0;
        built.tank.root.traverseVisible(object => {
            if (object.isMesh)
                triangleCount += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
        });
        assert.ok(triangleCount <= 80000);
        const movingShoeChecks = clearance(built);
        assert.throws(() => clearance(built, true), assert.AssertionError, 'actual track intrusion is rejected');
        report.push({ quality, filled: hasInteriorFills(id), maxResidualM, finiteJoints, triangleCount, movingShoeChecks, preserved: stock });
    }
    finally {
        built.dispose();
    }
    for (const mutation of ['delete-skin', 'unseat-arm', 'unseat-flap', 'fill-gap', 'wrong-armor-owner']) {
        const changed = build(candidate, quality, mutation);
        try {
            assert.throws(() => mutation === 'wrong-armor-owner' ? structuralArmor(changed) : mutation === 'delete-skin' ? sourceProof(changed) : mutation.startsWith('unseat-') ? seats(changed) : air(changed), assert.AssertionError, mutation + ' must fail');
        }
        finally {
            changed.dispose();
        }
    }
}
assert.ok(report[1].triangleCount <= report[0].triangleCount * .75);
console.log('Kurganets bow loaded source/contact/air/moving-shoe and mutation proof PASS', JSON.stringify(report));
