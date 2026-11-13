// anatomyViewLinkDispose.selftest.mjs — a Gallery anatomy scene is never disposed while its programs link (round 2 U35;
// 2026-11-02 audit, 16-audio-gallery item 9). Copyright © 2026 Kevin B. Liu.
//
// The anatomy view links a vehicle state's programs before the layer first draws (renderer.compileAsync, which polls
// each material's program until it is ready), and stages the next state's scene beside a showing layer. dropStaged
// (another state's prepare, ensureScene for another key, release) and ensureScene for a new key disposed a scene whose
// link was still pending: three's poll then reads a disposed material's program (WebGLRenderer compileAsync), throws in
// its timer, and the link, with every prepare awaiting it, never settles (the Gallery's loading toast stays and
// waitAnatomyReady hangs). Now a scene leaves the stage at once and is disposed once its link settles.
//
// This runs anatomyView.ts on a stand-in document with its anatomy scene stubbed (a mesh and a material each) and a
// renderer whose compileAsync plays three's: the materials it was given, polled until the test lets the link finish, and
// never resolved once one of them is disposed under it.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

const hook = registerHooks({
  resolve(specifier, context, next) {
    if ((context.parentURL ?? '').endsWith('/src/gallery/anatomyView.ts') && specifier === './anatomyScene.ts') {
      return { url: `data:text/javascript,${encodeURIComponent('export const HIT_VOLUME_COLOR = 0xff3b30; export const buildAnatomyScene = (...args) => globalThis.__cotAnatomyBuild(...args);')}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

// ---- a stand-in document: enough element for the view's toolbar, legend and badges
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {}, removeProperty() {}, cursor: '' };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.offsetHeight = 0;
    this.offsetTop = 0;
    this.offsetWidth = 0;
    this.clientWidth = 800;
    this.clientHeight = 600;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  toggleAttribute() {}
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(...children) { this.children.unshift(...children); }
  insertBefore(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }; }
  focus() {}
}
globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (_ns, tag) => new FakeElement(tag),
  getElementById: () => null,
  head: new FakeElement('head'),
  body: new FakeElement('body'),
  documentElement: new FakeElement('html'),
  activeElement: null,
};

// ---- the stubbed anatomy scenes and a renderer whose compileAsync plays three's poll
const disposed = new Set();
const built = [];
globalThis.__cotAnatomyBuild = () => {
  const material = new THREE.MeshBasicMaterial();
  material.addEventListener('dispose', () => disposed.add(material));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const scene = {
    frames: { root }, surfaces: [], parts: [], stations: [], pickables: [], anchors: [], material,
    setToggles() {}, select() {}, setMetric() {}, setStates() {}, isolate() {}, syncPose() {}, plateCenter: () => false,
    stats: () => ({ triangles: 0, moduleTriangles: 0, crewTriangles: 0, drawables: 0 }),
    dispose() { root.removeFromParent(); material.dispose(); },
  };
  built.push(scene);
  return scene;
};
let linkOpen = false;
const lost = [];
const renderer = {
  domElement: new FakeElement('canvas'),
  autoClear: true,
  render() {},
  compileAsync(root) {
    const materials = new Set();
    root.traverse((object) => { if (object.material) materials.add(object.material); });
    return new Promise((resolve) => {
      const poll = () => {
        // three reads properties.get(material).currentProgram.isReady(): a disposed material has none, so it throws here,
        // in its timer, and the promise never resolves
        if ([...materials].some((material) => disposed.has(material))) { lost.push(root); return; }
        if (linkOpen) resolve(root); else setTimeout(poll, 1);
      };
      setTimeout(poll, 1);
    });
  },
};
const stage = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const { createAnatomyView } = await import('./anatomyView.ts');
const view = createAnatomyView({
  renderer, scene: stage, camera,
  viewport: new FakeElement(), console: new FakeElement(), legend: new FakeElement(),
  onSelect() {}, onToggle() {},
});
const tank = (key) => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  stage.add(root);
  return { id: 'leopard2a4', key, armor: { plates: [] }, caliberMm: 120, modern: true, root };
};
const settled = (promise) => { let done = false; promise.then(() => { done = true; }, () => { done = true; }); return () => done; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // ---- a prepare's scene, replaced by the next state's before its link finished (no layer showing)
  const first = tank('leopard2a4|');
  const firstDone = settled(view.prepare(first));
  await wait(5);
  const second = tank('leopard2a4|plate:hull-front');
  const secondDone = settled(view.prepare(second));
  await wait(5);
  linkOpen = true;
  for (let i = 0; i < 200 && !(firstDone() && secondDone()); i++) await wait(2);
  assert.equal(firstDone(), true, `a prepare whose scene was replaced mid-link still settles (${lost.length} links lost under a disposed material)`);
  assert.equal(secondDone(), true);
  assert.equal(disposed.has(built[0].material), true, 'the replaced scene is disposed once its link settled');
  assert.ok(built[0].frames.root.parent === null, 'and it left the stage at once');

  // ---- a layer shows one state; the next state's staged scene is dropped by a third prepare while it links
  view.show('armor', second);
  linkOpen = false;
  const staged = tank('leopard2a4|plate:turret-front');
  const stagedDone = settled(view.prepare(staged));
  await wait(5);
  const restaged = tank('leopard2a4|plate:turret-side');
  const restagedDone = settled(view.prepare(restaged));
  await wait(5);
  linkOpen = true;
  for (let i = 0; i < 200 && !(stagedDone() && restagedDone()); i++) await wait(2);
  assert.equal(stagedDone(), true, `a staged scene dropped mid-link still lets its prepare settle (the Gallery's loading toast stayed: ${lost.length} links lost)`);
  assert.equal(restagedDone(), true);
  const stagedScene = built.at(-2);
  assert.equal(disposed.has(stagedScene.material), true, 'the dropped staged scene is disposed once its link settled');
  view.show('armor', restaged);
  assert.equal(view.state().counts !== null, true, 'the restaged scene is the one the layer shows');

  // ---- release while a staged scene links: its prepare settles too
  linkOpen = false;
  const leaving = tank('leopard2a4|plate:hull-side');
  const leavingDone = settled(view.prepare(leaving));
  await wait(5);
  view.release();
  linkOpen = true;
  for (let i = 0; i < 200 && !leavingDone(); i++) await wait(2);
  assert.equal(leavingDone(), true, 'a release mid-link lets the staged prepare settle');
  assert.equal(lost.length, 0, 'no link polled a disposed material');
  assert.equal(built.every((scene) => disposed.has(scene.material)), true, 'and every scene the view built is disposed after release');
} finally {
  hook.deregister();
}
console.log('anatomyViewLinkDispose.selftest: a replaced, dropped or released anatomy scene leaves the stage at once and is disposed once its link settles; every prepare settles');
