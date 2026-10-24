// The Garage's numbered hotspots (brand-ui S2, SPEC 12.1.3; the Premiere direction's 05-garage page). Copyright © 2026
// Kevin B. Liu.
// Four callouts on the pedestal tank, placed from anchors projected each rendered Garage frame, each with its real
// values: 1 the gun (calibre, reload), 2 the turret (traverse, elevation and depression), 3 the powerpack (power, power
// to weight), 4 the running gear (top speed, weight). The anchors come from the tank's own geometry, measured once per
// tank: the gun's on its barrel in the rig_gun frame and the turret's on its roof in the rig_turret frame (so each follows
// its part), the rest in the hull's local frame (forward +Z, up +Y); a frame only projects four points and writes four
// transforms.
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

/** A callout's plate is about this wide; it reads inward when reading outward would run under the stations rail (left)
 * or the dossier panel (right), each about this far in from its edge. */
const PLATE_PX = 230;
const RAIL_PX = 220;
const PANEL_PX = 430;

// scratch (no per-frame allocation)
const _box = new Box3();
const _geomBox = new Box3();
const _geomPart = new Box3();
const _inverse = new Matrix4();
const _toRoot = new Matrix4();
const _point = new Vector3();
const _camera = new Vector3();

/** `part`'s bounds in `frame`'s space (each mesh's geometry box carried into it); `part` defaults to the frame itself. */
function localBounds(frame: Object3D, out: Box3, part: Object3D = frame): Box3 {
  out.makeEmpty();
  frame.updateWorldMatrix(true, true);
  _inverse.copy(frame.matrixWorld).invert();
  part.traverse((node) => {
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
  // each anchor: a point in its part's frame (the hull's unless the rig names the part)
  const anchors: Record<HotspotId, { node: Object3D | null; readonly local: Vector3 }> = {
    gun: { node: null, local: new Vector3() }, turret: { node: null, local: new Vector3() },
    engine: { node: null, local: new Vector3() }, tracks: { node: null, local: new Vector3() },
  };
  let sideX = 0;

  function measure(model: Object3D): void {
    measured = model;
    const box = localBounds(model, _box);
    if (box.isEmpty()) { measured = null; return; }
    const { min, max } = box;
    const h = max.y - min.y, l = max.z - min.z;
    const cz = (min.z + max.z) / 2;
    sideX = (max.x - min.x) / 2;
    for (const id of ORDER) anchors[id].node = model;
    anchors.gun.local.set(0, min.y + h * 0.74, max.z - l * 0.2);
    anchors.turret.local.set(0, max.y - h * 0.06, cz - l * 0.06);
    anchors.engine.local.set(0, min.y + h * 0.6, min.z + l * 0.16);
    anchors.tracks.local.set(sideX, min.y + h * 0.16, cz + l * 0.12);
    // the gun's on its barrel a third back from the muzzle (the direction's 1), in its own frame (the barrel runs +Z)
    const gun = model.getObjectByName('rig_gun');
    const gunBox = gun ? localBounds(gun, _geomPart) : null;
    if (gun && gunBox && !gunBox.isEmpty()) {
      anchors.gun.node = gun;
      anchors.gun.local.set((gunBox.min.x + gunBox.max.x) / 2, (gunBox.min.y + gunBox.max.y) / 2,
        gunBox.max.z - (gunBox.max.z - gunBox.min.z) * 0.33);
    }
    // the turret's on its body behind the trunnion: a little over half its height, since a roof weapon station or a
    // sight mast stands well above the roof
    const turret = model.getObjectByName('rig_turret');
    const turretBox = turret ? localBounds(turret, _geomPart) : null;
    if (turret && turretBox && !turretBox.isEmpty()) {
      anchors.turret.node = turret;
      anchors.turret.local.set((turretBox.min.x + turretBox.max.x) / 2, turretBox.min.y + (turretBox.max.y - turretBox.min.y) * 0.55,
        turretBox.min.z + (turretBox.max.z - turretBox.min.z) * 0.4);
    }
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
      anchors.tracks.local.x = _camera.x < 0 ? -sideX : sideX;
      const width = host.clientWidth, height = host.clientHeight;
      let any = false;
      for (const id of ORDER) {
        const spot = spots.get(id);
        if (!spot) continue;
        const anchor = anchors[id];
        _point.copy(anchor.local).applyMatrix4((anchor.node ?? model).matrixWorld).project(camera);
        const visible = _point.z > -1 && _point.z < 1 && Math.abs(_point.x) < 1 && Math.abs(_point.y) < 1;
        spot.el.hidden = !visible;
        if (!visible) continue;
        any = true;
        const x = (_point.x + 1) / 2 * width, y = (1 - _point.y) / 2 * height;
        // each callout reads outward from the stage's centre, unless its plate would then run under a panel
        const left = x < width / 2 ? x - PLATE_PX > RAIL_PX : x + PLATE_PX > width - PANEL_PX;
        if (left !== spot.left) { spot.left = left; spot.el.classList.toggle('l', left); }
        spot.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      }
      layer.hidden = !any;
    },
  };
}
