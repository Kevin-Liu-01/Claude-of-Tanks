// The Garage's numbered hotspots (garageHotspots.ts): four callouts projected from the pedestal tank's own geometry.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera } from 'three';

// a minimal element: what the hotspot layer touches
function element(tag) {
  const node = {
    tag, className: '', hidden: false, dataset: {}, attributes: {}, children: [], style: { transform: '' },
    classes: new Set(),
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
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

const host = Object.assign(element('div'), { clientWidth: 1600, clientHeight: 900 });
const hotspots = createGarageHotspots(host);
const layer = host.children[0];
assert.equal(layer.className, 'cot-hotspots', 'the layer is the stage host\'s first child, under every panel');
assert.equal(layer.attributes['aria-hidden'], 'true', 'the callouts repeat the dossier: decorative');
assert.equal(layer.children.length, 4);

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

console.log('garageHotspots.selftest: four callouts from the tank\'s own geometry, by transform, on the overview only');
