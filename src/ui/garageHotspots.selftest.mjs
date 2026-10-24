// The Garage's numbered hotspots (garageHotspots.ts): four callouts projected from the pedestal tank's own geometry, a dot
// on each part and its plate off the tank's outline.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';

// a minimal element: what the hotspot layer touches
function element(tag) {
  const node = {
    tag, className: '', hidden: false, dataset: {}, attributes: {}, children: [], style: { transform: '' },
    classes: new Set(),
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...children) { this.children.push(...children); },
    prepend(child) { this.children.unshift(child); },
    insertBefore(child, before) { const at = this.children.indexOf(before); this.children.splice(at < 0 ? 0 : at, 0, child); },
    get firstElementChild() { return this.children[0] ?? null; },
    classList: null,
    set innerHTML(html) {
      this._html = html;
      this.b = element('b'); this.small = element('small');
    },
    get innerHTML() { return this._html; },
    querySelector(selector) { return selector === 'b' ? this.b : selector === 'small' ? this.small : null; },
    textContent: '',
  };
  node.classList = { toggle: (name, on) => (on ? node.classes.add(name) : node.classes.delete(name)) };
  return node;
}
globalThis.document = { createElement: element };
const { createGarageHotspots } = await import('./garageHotspots.ts');

globalThis.HTMLElement = class {};
// a panel standing in the stage, at viewport (x, y), w by h
const panel = (x, y, w, h) => Object.assign(new HTMLElement(), {
  hidden: false, offsetWidth: w, getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h }),
});
const host = Object.assign(element('div'), { clientWidth: 1600, clientHeight: 900, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
let avoid = [];
const hotspots = createGarageHotspots(host, { stage: () => ({ x: 0, y: 0, w: 1600, h: 900 }), avoid: () => avoid });
const layer = host.children[0];
assert.equal(layer.className, 'cot-hotspots', 'the layer is the stage host\'s first child, under every panel');
assert.equal(layer.attributes['aria-hidden'], 'true', 'the callouts repeat the dossier: decorative');
assert.equal(layer.children.length, 12, 'four hairlines and four dots under four plates');

// a tank-sized box: 3.6 m wide, 2.4 m tall, 9 m long (forward +Z), on the floor
const tank = new Object3D();
const hull = new Mesh(new BoxGeometry(3.6, 2.4, 9), new MeshBasicMaterial());
hull.position.set(0, 1.2, 0);
tank.add(hull);
tank.updateMatrixWorld(true);
const camera = new PerspectiveCamera(40, 1600 / 900, 0.1, 200);
camera.position.set(14, 5, -3);
camera.lookAt(0, 1.2, 0);
camera.updateMatrixWorld(true);

hotspots.frame(camera, tank, true);
assert.equal(layer.hidden, true, 'no facts yet: nothing shows');
const facts = {
  gun: { lead: '120 mm', more: '5.7 s reload' }, turret: { lead: '38°/s', more: '+21 / −10°' },
  engine: { lead: '1500 hp', more: '23.7 hp/t' }, tracks: { lead: '60 km/h', more: '76 t' },
};
hotspots.setFacts(facts);
hotspots.frame(camera, tank, true);
assert.equal(layer.hidden, false, 'the callouts show on the overview');
const spot = (id) => layer.children.find((child) => child.dataset.hotspot === id);
for (const id of ['gun', 'turret', 'engine', 'tracks']) {
  assert.equal(spot(id).hidden, false, `${id} projects inside the stage`);
  assert.match(spot(id).style.transform, /^translate3d\(-?[\d.]+px,-?[\d.]+px,0\)$/, `${id} is placed by transform alone`);
}
assert.equal(spot('gun').b.textContent, '120 mm');
assert.equal(spot('tracks').small.textContent, '76 t');
const x = (id) => Number(/translate3d\((-?[\d.]+)px/.exec(spot(id).style.transform)[1]);
// the camera stands at +X looking toward the tank's front-left: the gun (front, +Z) and the powerpack (rear) sit apart
assert.notEqual(Math.round(x('gun')), Math.round(x('engine')), 'the gun and the powerpack land at the two ends');

const ORDER = ['gun', 'turret', 'engine', 'tracks'];
const dot = (id) => layer.children.filter((child) => child.className === 'cot-hotspot-dot')[ORDER.indexOf(id)];
const lead = (id) => layer.children.filter((child) => child.className === 'cot-hotspot-lead')[ORDER.indexOf(id)];
const at = (el) => /translate3d\((-?[\d.]+)px,(-?[\d.]+)px/.exec(el.style.transform).slice(1).map(Number);
// a plate before it is measured counts 200 px wide; its numeral's centre is its place, the plate reading away from it
const plate = (id) => {
  const [bx, by] = at(spot(id));
  const x0 = spot(id).classes.has('l') ? bx - 200 + 12 : bx - 12;
  return [x0, by - 15, x0 + 200, by + 15];
};
// each mesh's box on screen: a plate may stand in the gaps between the parts, never on one
const outlines = (model) => {
  const rects = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.computeBoundingBox();
    const { min, max } = node.geometry.boundingBox;
    const xs = [], ys = [];
    for (let c = 0; c < 8; c++) {
      const p = new Vector3(c & 1 ? max.x : min.x, c & 2 ? max.y : min.y, c & 4 ? max.z : min.z).applyMatrix4(node.matrixWorld).project(camera);
      xs.push((p.x + 1) / 2 * 1600); ys.push((1 - p.y) / 2 * 900);
    }
    rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  return rects;
};
const outline = (model) => outlines(model).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const meets = (a, b) => a[2] > b[0] && a[0] < b[2] && a[3] > b[1] && a[1] < b[3];
const offTheTank = (model, label) => {
  for (const id of ORDER) {
    if (spot(id).hidden) continue;
    for (const part of outlines(model)) {
      assert.ok(!meets(plate(id), part), `${label}: ${id}'s plate stands off the tank (${plate(id).map(Math.round)} vs ${part.map(Math.round)})`);
    }
    for (const other of ORDER) {
      if (other !== id && !spot(other).hidden) assert.ok(!meets(plate(id), plate(other)), `${label}: ${id} and ${other} do not overlap`);
    }
    // the hairline runs from the dot to the numeral
    const [ax, ay] = at(dot(id)), [bx, by] = at(spot(id));
    assert.deepEqual(at(lead(id)), [ax, ay], `${label}: ${id}'s hairline starts at its dot`);
    const length = Number(/scaleX\(([\d.]+)\)/.exec(lead(id).style.transform)[1]);
    assert.ok(Math.abs(length - Math.hypot(bx - ax, by - ay)) < 0.2, `${label}: ${id}'s hairline reaches its numeral`);
  }
};
offTheTank(tank, 'box tank');
for (const id of ['gun', 'turret', 'engine']) assert.ok(plate(id)[3] <= outline(tank)[1], `${id}'s plate stands above the tank`);
assert.ok(plate('tracks')[1] >= outline(tank)[3], "the running gear's plate stands below the tank");

// a panel where the running gear's plate stood: it moves clear of it, still off the tank
const below = plate('tracks')[1] - 4;
avoid = [panel(0, below, 1600, 900 - below), null];
hotspots.setFacts(facts);
hotspots.frame(camera, tank, true);
assert.equal(spot('tracks').hidden, false, 'the running gear finds room beside the tank');
assert.ok(plate('tracks')[3] <= below, 'clear of the panel');
offTheTank(tank, 'with a panel below');
avoid = [];
hotspots.setFacts(facts);

// the running gear's callout takes the side the camera sees
camera.position.set(-14, 5, -3);
camera.lookAt(0, 1.2, 0);
camera.updateMatrixWorld(true);
hotspots.frame(camera, tank, true);
assert.equal(spot('tracks').hidden, false);

hotspots.frame(camera, tank, false);
assert.equal(layer.hidden, true, 'off the overview, over Deploy or folded: hidden');
hotspots.frame(camera, null, true);
assert.equal(layer.hidden, true, 'between tanks: hidden');
hotspots.setFacts(null);
hotspots.frame(camera, tank, true);
assert.equal(layer.hidden, true, 'no tank selected: hidden');

// a rigged tank: the gun's callout sits on its barrel, a third back from the muzzle, in the gun's own frame
const rigged = new Object3D();
const body = new Mesh(new BoxGeometry(3.6, 1.6, 7), new MeshBasicMaterial());
body.position.set(0, 0.8, 0);
const turretNode = new Object3D();
turretNode.name = 'rig_turret';
turretNode.position.set(0, 1.6, 0);
const turretShell = new Mesh(new BoxGeometry(2.4, 0.8, 3), new MeshBasicMaterial());
turretShell.position.set(0, 0.4, 0);
const gunNode = new Object3D();
gunNode.name = 'rig_gun';
gunNode.position.set(0, 0.5, 1);
const barrel = new Mesh(new BoxGeometry(0.2, 0.2, 6), new MeshBasicMaterial());
barrel.position.set(0, 0, 3);
gunNode.add(barrel);
turretNode.add(turretShell, gunNode);
rigged.add(body, turretNode);
rigged.updateMatrixWorld(true);
hotspots.setFacts(facts);
camera.position.set(14, 5, -3);
camera.lookAt(0, 1.2, 0);
camera.updateMatrixWorld(true);
hotspots.frame(camera, rigged, true);
// the barrel runs z 0..6 in the gun frame: a third back from the muzzle is z 4.02, in the world (0, 2.1, 5.02)
const expected = new Vector3(0, 2.1, 5.02).project(camera);
const px = (expected.x + 1) / 2 * 1600, py = (1 - expected.y) / 2 * 900;
const [gx, gy] = at(dot('gun'));
assert.ok(Math.abs(gx - px) < 1 && Math.abs(gy - py) < 1, `the gun's dot sits on the barrel (${gx},${gy} vs ${px.toFixed(1)},${py.toFixed(1)})`);
offTheTank(rigged, 'rigged tank');

console.log('garageHotspots.selftest: four callouts from the tank\'s own geometry, a dot on each part and its plate off the tank, by transform, on the overview only');
