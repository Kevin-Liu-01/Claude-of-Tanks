// The Garage's numbered hotspots (brand-ui S2, SPEC 12.1.3; the Premiere direction's 05-garage page). Copyright © 2026
// Kevin B. Liu.
// Four callouts on the pedestal tank, placed from anchors projected each rendered Garage frame, each with its real
// values: 1 the gun (calibre, reload), 2 the turret (traverse, elevation and depression), 3 the powerpack (power, power
// to weight), 4 the running gear (top speed, weight). The anchors come from the tank's own geometry in its local frame
// (forward +Z, up +Y), measured once per tank; a frame only projects four points and writes four transforms.
import { Box3, Matrix4, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';

export type HotspotId = 'gun' | 'turret' | 'engine' | 'tracks';
const ORDER: readonly HotspotId[] = ['gun', 'turret', 'engine', 'tracks'];

/** One callout's copy: its lead value (display voice) and its second value (data voice). */
export interface HotspotFact { readonly lead: string; readonly more: string }
export type HotspotFacts = Readonly<Record<HotspotId, HotspotFact>>;

export interface GarageHotspots {
  /** The selected tank's values; null hides the callouts. */
  setFacts(facts: HotspotFacts | null): void;
  /** Place the callouts for this frame; a null model (or hidden) clears them. */
  frame(camera: PerspectiveCamera, model: Object3D | null, shown: boolean): void;
}

// scratch (no per-frame allocation)
const _box = new Box3();
const _geomBox = new Box3();
const _inverse = new Matrix4();
const _toRoot = new Matrix4();
const _point = new Vector3();
const _camera = new Vector3();

/** The model's bounds in its own frame (each mesh's geometry box carried into the root's local space). */
function localBounds(root: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  root.updateWorldMatrix(true, true);
  _inverse.copy(root.matrixWorld).invert();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    _toRoot.multiplyMatrices(_inverse, mesh.matrixWorld);
    out.union(_geomBox.copy(mesh.geometry.boundingBox).applyMatrix4(_toRoot));
  });
  return out;
}

export function createGarageHotspots(host: HTMLElement): GarageHotspots {
  const layer = document.createElement('div');
  layer.className = 'cot-hotspots';
  // the values repeat the dossier's; the drawing is decorative
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  const spots = new Map<HotspotId, { el: HTMLElement; lead: HTMLElement; more: HTMLElement; left: boolean }>();
  ORDER.forEach((id, index) => {
    const el = document.createElement('div');
    el.className = 'cot-hotspot';
    el.dataset.hotspot = id;
    el.innerHTML = `<span class="n">${index + 1}</span><span class="v"><b></b><small class="num"></small></span>`;
    spots.set(id, { el, lead: el.querySelector('b') as HTMLElement, more: el.querySelector('small') as HTMLElement, left: false });
    layer.append(el);
  });
  host.prepend(layer);

  let hasFacts = false;
  let measured: Object3D | null = null;
  const anchors: Record<HotspotId, Vector3> = { gun: new Vector3(), turret: new Vector3(), engine: new Vector3(), tracks: new Vector3() };
  let sideX = 0;

  function measure(model: Object3D): void {
    measured = model;
    const box = localBounds(model, _box);
    if (box.isEmpty()) { measured = null; return; }
    const { min, max } = box;
    const h = max.y - min.y, l = max.z - min.z;
    const cz = (min.z + max.z) / 2;
    sideX = (max.x - min.x) / 2;
    anchors.gun.set(0, min.y + h * 0.74, max.z - l * 0.08);
    anchors.turret.set(0, max.y - h * 0.06, cz - l * 0.06);
    anchors.engine.set(0, min.y + h * 0.6, min.z + l * 0.16);
    anchors.tracks.set(sideX, min.y + h * 0.16, cz + l * 0.12);
  }

  return {
    setFacts(facts) {
      hasFacts = !!facts;
      if (!facts) { layer.hidden = true; return; }
      for (const id of ORDER) {
        const spot = spots.get(id);
        if (!spot) continue;
        spot.lead.textContent = facts[id].lead;
        spot.more.textContent = facts[id].more;
      }
    },
    frame(camera, model, shown) {
      if (!shown || !hasFacts || !model) { if (!layer.hidden) layer.hidden = true; return; }
      if (model !== measured) measure(model);
      if (!measured) { layer.hidden = true; return; }
      // the running gear's callout takes the side the camera sees
      _camera.copy(camera.position);
      model.worldToLocal(_camera);
      anchors.tracks.x = _camera.x < 0 ? -sideX : sideX;
      const width = host.clientWidth, height = host.clientHeight;
      let any = false;
      for (const id of ORDER) {
        const spot = spots.get(id);
        if (!spot) continue;
        _point.copy(anchors[id]).applyMatrix4(model.matrixWorld).project(camera);
        const visible = _point.z > -1 && _point.z < 1 && Math.abs(_point.x) < 1 && Math.abs(_point.y) < 1;
        spot.el.hidden = !visible;
        if (!visible) continue;
        any = true;
        const x = (_point.x + 1) / 2 * width, y = (1 - _point.y) / 2 * height;
        // each callout reads outward from the stage's centre
        const left = x < width / 2;
        if (left !== spot.left) { spot.left = left; spot.el.classList.toggle('l', left); }
        spot.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      }
      layer.hidden = !any;
    },
  };
}
