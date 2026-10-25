// The Garage's numbered hotspots (brand-ui S2, SPEC 12.1.3; the Premiere direction's 05-garage page). Copyright © 2026
// Kevin B. Liu.
// Four callouts on the pedestal tank, placed from anchors projected each rendered Garage frame, each with its real
// values: 1 the gun (calibre, reload), 2 the turret (traverse, elevation and depression), 3 the powerpack (power, power
// to weight), 4 the running gear (top speed, weight). The anchors come from the tank's own geometry, measured once per
// tank: the gun's on its barrel in the rig_gun frame and the turret's on its roof in the rig_turret frame (so each follows
// its part), the rest in the hull's local frame (forward +Z, up +Y).
// Only an accent dot stands on the tank (owner: no text on a tank). A hairline leads from it to its plate, the numeral and
// the values, which stands off the tank: the nearest place above its part (the gun, turret and powerpack), below it (the
// running gear) or beside it that clears the hull's, the turret's and the gun's projected boxes, the panels standing in
// the stage and the other plates. A plate keeps last frame's place while that stays clear, so an orbit moves it smoothly;
// a frame projects 28 points and writes twelve transforms.
import { Box3, Matrix4, Vector3, type LOD, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { uiIconSVG } from './uiIcons.ts';

export type HotspotId = 'gun' | 'turret' | 'engine' | 'tracks';
const ORDER: readonly HotspotId[] = ['gun', 'turret', 'engine', 'tracks'];
const ICONS: Readonly<Record<HotspotId, string>> = { gun: 'gun', turret: 'turretRing', engine: 'engine', tracks: 'track' };

/** One callout's copy: its lead value (display voice) and its second value (data voice). */
export interface HotspotFact { readonly lead: string; readonly more: string }
export type HotspotFacts = Readonly<Record<HotspotId, HotspotFact>>;

/** A rectangle in the stage host's CSS pixels. */
export interface HotspotRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
/** Where the plates may stand: the stage the tank is framed in (viewport CSS pixels), less the panels standing in it. */
export interface HotspotRoom { stage(): HotspotRect; avoid(): readonly (Element | null)[] }

export interface GarageHotspots {
  /** The selected tank's values; null hides the callouts. */
  setFacts(facts: HotspotFacts | null): void;
  /** Place the callouts for this frame; a null model (or hidden) clears them. */
  frame(camera: PerspectiveCamera, model: Object3D | null, shown: boolean): void;
}

/** A plate (showroom.css .cot-hotspot) is this tall; its numeral's disc is twice BADGE across, and the plate's place is the
 *  disc's centre. Before a plate is measured (a hidden layer measures nothing) it counts as PLATE_PX wide. */
const PLATE_H = 30;
const BADGE = 12;
const PLATE_PX = 200;
/** A plate's first try stands GAP from its anchor; each further try steps a ROW up or down, or SLIDE sideways. */
const GAP = 18;
const ROW = PLATE_H + 8;
const SLIDE = 36;
const TRIES = 16;
/** The ways a plate searches from its anchor, in order: upward, downward, or sideways (away from the hull first). */
type Side = 'above' | 'below' | 'beside';
const SIDES: Readonly<Record<HotspotId, readonly Side[]>> = {
  gun: ['above', 'below', 'beside'], turret: ['above', 'beside'], engine: ['above', 'beside'], tracks: ['below', 'beside', 'above'],
};

// scratch (no per-frame allocation)
const _box = new Box3();
const _geomBox = new Box3();
const _geomPart = new Box3();
const _gear = new Box3();
const _turretBody = new Box3();
const _inverse = new Matrix4();
const _toRoot = new Matrix4();
const _point = new Vector3();
const _camera = new Vector3();
const _placed = new Float64Array(ORDER.length * 4);
const _parts = new Float64Array(3 * 4);
const _try = new Float64Array(3);

/** `frame`'s bounds in its own space (each mesh's geometry box carried into it), leaving out the `skip` subtree. */
/**
 * A frame's mesh bounds in its own space. `bodyOnly` leaves out the LOD detail groups: their merged dark-parts mesh
 * carries the whip antennas, metres above the roof, which lifted the turret's and the engine's anchors into the air
 * above the tank (the gauntlet 10-25).
 */
function localBounds(frame: Object3D, out: Box3, skip: Object3D | null = null, bodyOnly = false): Box3 {
  out.makeEmpty();
  frame.updateWorldMatrix(true, true);
  _inverse.copy(frame.matrixWorld).invert();
  const visit = (node: Object3D): void => {
    if (node === skip || (bodyOnly && (node as LOD).isLOD)) return;
    const mesh = node as Mesh;
    if (mesh.isMesh && mesh.visible && mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) {
        _toRoot.multiplyMatrices(_inverse, mesh.matrixWorld);
        out.union(_geomBox.copy(mesh.geometry.boundingBox).applyMatrix4(_toRoot));
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(frame);
  return out;
}

/**
 * A part's body in `frame`'s space: the meshes of the first name (or name prefix, with `prefix`) that the frame holds,
 * else every mesh outside the detail groups, else every mesh.
 */
function bodyBounds(frame: Object3D, out: Box3, names: readonly string[], skip: Object3D | null, prefix = false): Box3 {
  for (const name of names) {
    out.makeEmpty();
    frame.updateWorldMatrix(true, true);
    _inverse.copy(frame.matrixWorld).invert();
    frame.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !mesh.geometry || !(prefix ? mesh.name.startsWith(name) : mesh.name === name)) return;
      for (let up: Object3D | null = node; up && up !== frame; up = up.parent) if (up === skip) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      _toRoot.multiplyMatrices(_inverse, mesh.matrixWorld);
      out.union(_geomBox.copy(mesh.geometry.boundingBox).applyMatrix4(_toRoot));
    });
    if (!out.isEmpty()) return out;
  }
  if (prefix) return out;
  if (!localBounds(frame, out, skip, true).isEmpty()) return out;
  return localBounds(frame, out, skip);
}

interface Spot {
  readonly el: HTMLElement; readonly dot: HTMLElement; readonly lead: HTMLElement;
  readonly value: HTMLElement; readonly more: HTMLElement; readonly num: HTMLElement;
  /** The plate's measured width; whether it reads leftward from its numeral; last frame's place (-1: none); its numeral. */
  width: number; left: boolean; place: number; shownAs: number;
}

/** `room` says where plates may stand (read again when the stage resizes or the values change); without it, anywhere.
 *  The layer goes in before `before` (the host's first panel), so the panels cover it and nothing under them dims it. */
export function createGarageHotspots(host: HTMLElement, room?: HotspotRoom, before: Element | null = host.firstElementChild): GarageHotspots {
  const layer = document.createElement('div');
  layer.className = 'cot-hotspots';
  // the values repeat the dossier's; the drawing is decorative
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  const spots: Spot[] = ORDER.map((id, index) => {
    const dot = document.createElement('div');
    dot.className = 'cot-hotspot-dot';
    const lead = document.createElement('div');
    lead.className = 'cot-hotspot-lead';
    const el = document.createElement('div');
    el.className = 'cot-hotspot';
    el.dataset.hotspot = id;
    el.innerHTML = `<span class="n">${index + 1}</span><span class="v">${uiIconSVG(ICONS[id], 16)}<b></b><small class="num"></small></span>`;
    return { el, dot, lead, value: el.querySelector('b') as HTMLElement, more: el.querySelector('small') as HTMLElement,
      num: el.querySelector('.n') as HTMLElement, width: PLATE_PX, left: false, place: -1, shownAs: index + 1 };
  });
  // the hairlines and dots under every plate
  for (const spot of spots) layer.append(spot.lead, spot.dot);
  for (const spot of spots) layer.append(spot.el);
  host.insertBefore(layer, before);

  let hasFacts = false;
  let measured: Object3D | null = null;
  // the tank's parts as boxes, each in its own frame (the hull's without the turret, the turret's without the gun)
  const parts = [0, 1, 2].map(() => ({ node: null as Object3D | null, box: new Box3() }));
  // each anchor: a point in its part's frame (the hull's unless the rig names the part)
  const anchors: Record<HotspotId, { node: Object3D | null; readonly local: Vector3 }> = {
    gun: { node: null, local: new Vector3() }, turret: { node: null, local: new Vector3() },
    engine: { node: null, local: new Vector3() }, tracks: { node: null, local: new Vector3() },
  };
  let sideX = 0;
  // where plates may stand, read again when the stage resizes or the values change
  let stage: HotspotRect = { x: 0, y: 0, w: 0, h: 0 };
  let avoid: readonly HotspotRect[] = [];
  let roomW = -1, roomH = -1;
  // the hull's projected box this frame (the plates read away from its centre)
  let hullX = 0;

  function measure(model: Object3D): void {
    measured = model;
    const turret = model.getObjectByName('rig_turret');
    const gun = model.getObjectByName('rig_gun');
    // the bodies the anchors stand on: each part's shadow proxy (its armour body without the antennas, weapon stations
    // and fittings that stand metres above the roof), else its body mesh, else every mesh outside the detail groups
    const hull = bodyBounds(model, _box, ['procShadow_hull', 'hull'], turret ?? null);
    if (hull.isEmpty()) { measured = null; return; }
    const gear = bodyBounds(model, _gear, ['gearTrackBand', 'gearRoadWheel'], turret ?? null, true);
    if (gear.isEmpty()) gear.copy(hull);
    for (const spot of spots) spot.place = -1;
    const h = hull.max.y - hull.min.y, l = hull.max.z - hull.min.z;
    sideX = Math.max(gear.max.x, -gear.min.x);
    for (const id of ORDER) anchors[id].node = model;
    anchors.gun.local.set(0, hull.max.y, hull.max.z - l * 0.2);
    anchors.turret.local.set(0, hull.max.y, (hull.min.z + hull.max.z) / 2);
    anchors.engine.local.set(0, hull.min.y + h * 0.9, hull.min.z + l * 0.16);
    anchors.tracks.local.set(sideX, gear.min.y + (gear.max.y - gear.min.y) * 0.35, (gear.min.z + gear.max.z) / 2 + l * 0.12);
    // the gun's on its barrel a third back from the muzzle (the direction's 1), in its own frame (the barrel runs +Z)
    const gunBox = gun ? localBounds(gun, _geomPart) : null;
    if (gun && gunBox && !gunBox.isEmpty()) {
      anchors.gun.node = gun;
      anchors.gun.local.set((gunBox.min.x + gunBox.max.x) / 2, (gunBox.min.y + gunBox.max.y) / 2,
        gunBox.max.z - (gunBox.max.z - gunBox.min.z) * 0.33);
    }
    // the turret's on its body behind the trunnion, a little over half its height
    const turretBox = turret ? bodyBounds(turret, _turretBody, ['procShadow_turret', 'turret'], gun && gun !== turret ? gun : null) : null;
    if (turret && turretBox && !turretBox.isEmpty()) {
      anchors.turret.node = turret;
      anchors.turret.local.set((turretBox.min.x + turretBox.max.x) / 2, turretBox.min.y + (turretBox.max.y - turretBox.min.y) * 0.55,
        turretBox.min.z + (turretBox.max.z - turretBox.min.z) * 0.4);
    }
    // the boxes the plates keep off: one box round a whole tank would stand far wider than its silhouette
    parts[0].node = model;
    parts[0].box.copy(hull).union(gear);
    parts[1].node = turret ?? null;
    if (turretBox) parts[1].box.copy(turretBox);
    parts[2].node = gun ?? null;
    if (gun) localBounds(gun, parts[2].box);
  }

  /** The room and each plate's width (a hidden plate measures nothing, so every plate shows while it is read). */
  function readRoom(width: number, height: number): void {
    roomW = width;
    roomH = height;
    // the room in the host's own pixels; a panel that does not show stands nowhere
    const corner = host.getBoundingClientRect();
    const given = room?.stage();
    stage = given ? { x: given.x - corner.left, y: given.y - corner.top, w: given.w, h: given.h } : { x: 0, y: 0, w: width, h: height };
    avoid = (room?.avoid() ?? []).flatMap((panel) => {
      if (!(panel instanceof HTMLElement) || panel.hidden || !panel.offsetWidth) return [];
      const r = panel.getBoundingClientRect();
      return [{ x: r.left - corner.left, y: r.top - corner.top, w: r.width, h: r.height }];
    });
    layer.hidden = false;
    for (const spot of spots) spot.el.hidden = false;
    for (const spot of spots) spot.width = spot.el.offsetWidth || PLATE_PX;
  }

  /** The parts' boxes on screen (each part's eight corners); false when a corner leaves the view's depth. */
  function outline(camera: PerspectiveCamera, width: number, height: number): boolean {
    for (let index = 0; index < parts.length; index++) {
      const { node, box } = parts[index];
      const at = index * 4;
      _parts[at] = _parts[at + 1] = Infinity;
      _parts[at + 2] = _parts[at + 3] = -Infinity;
      if (!node || box.isEmpty()) continue;
      for (let corner = 0; corner < 8; corner++) {
        _point.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z)
          .applyMatrix4(node.matrixWorld).project(camera);
        if (_point.z < -1 || _point.z > 1) return false;
        const x = (_point.x + 1) / 2 * width, y = (1 - _point.y) / 2 * height;
        _parts[at] = Math.min(_parts[at], x);
        _parts[at + 1] = Math.min(_parts[at + 1], y);
        _parts[at + 2] = Math.max(_parts[at + 2], x);
        _parts[at + 3] = Math.max(_parts[at + 3], y);
      }
    }
    hullX = (_parts[0] + _parts[2]) / 2;
    return true;
  }

  /** Whether a plate spanning x0..x1, y0..y1 stands in the stage, off the tank, the panels and the `count` placed plates. */
  function clear(x0: number, y0: number, x1: number, y1: number, count: number): boolean {
    if (x0 < stage.x || y0 < stage.y || x1 > stage.x + stage.w || y1 > stage.y + stage.h) return false;
    for (let at = 0; at < _parts.length; at += 4) {
      if (x1 > _parts[at] && x0 < _parts[at + 2] && y1 > _parts[at + 1] && y0 < _parts[at + 3]) return false;
    }
    for (const r of avoid) if (x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h) return false;
    for (let i = 0; i < count; i++) {
      const at = i * 4;
      if (x1 + 8 > _placed[at] && x0 - 8 < _placed[at + 2] && y1 + 4 > _placed[at + 1] && y0 - 4 < _placed[at + 3]) return false;
    }
    return true;
  }

  /** Try place `code` (way, try and reading direction: ((way * TRIES + try) << 1) | left) for a plate whose anchor is at
   *  (ax, ay); on success _try holds the numeral's centre and the code. */
  function attempt(id: HotspotId, code: number, ax: number, ay: number, width: number, count: number): boolean {
    const left = (code & 1) === 1;
    const k = (code >> 1) % TRIES;
    const way = SIDES[id][Math.floor((code >> 1) / TRIES)];
    let bx = ax, by = ay;
    if (way === 'above') by = ay - GAP - PLATE_H / 2 - k * ROW;
    else if (way === 'below') by = ay + GAP + PLATE_H / 2 + k * ROW;
    else if (way === 'beside') bx = left ? ax - GAP - k * SLIDE : ax + GAP + k * SLIDE;
    else return false;
    const x0 = left ? bx - width + BADGE : bx - BADGE;
    if (!clear(x0, by - PLATE_H / 2, x0 + width, by + PLATE_H / 2, count)) return false;
    _try[0] = bx;
    _try[1] = by;
    _try[2] = code;
    return true;
  }

  /** Last frame's place while it stays clear, else the nearest clear place, each try reading away from the hull first. */
  function place(spot: Spot, id: HotspotId, ax: number, ay: number, count: number): boolean {
    if (spot.place >= 0 && attempt(id, spot.place, ax, ay, spot.width, count)) return true;
    const out = ax < hullX ? 1 : 0;
    for (let code = 0; code < SIDES[id].length * TRIES * 2; code += 2) {
      if (attempt(id, code | out, ax, ay, spot.width, count) || attempt(id, code | (out ^ 1), ax, ay, spot.width, count)) return true;
    }
    return false;
  }

  return {
    setFacts(facts) {
      hasFacts = !!facts;
      if (!facts) { layer.hidden = true; return; }
      ORDER.forEach((id, index) => {
        spots[index].value.textContent = facts[id].lead;
        spots[index].more.textContent = facts[id].more;
      });
      // new values, new widths: the next frame reads the room again
      roomW = -1;
    },
    frame(camera, model, shown) {
      if (!shown || !hasFacts || !model) { if (!layer.hidden) layer.hidden = true; return; }
      if (model !== measured) measure(model);
      if (!measured) { layer.hidden = true; return; }
      const width = host.clientWidth, height = host.clientHeight;
      if (width !== roomW || height !== roomH) readRoom(width, height);
      // the running gear's callout takes the side the camera sees
      _camera.copy(camera.position);
      model.worldToLocal(_camera);
      anchors.tracks.local.x = _camera.x < 0 ? -sideX : sideX;
      if (!outline(camera, width, height)) { layer.hidden = true; return; }
      let count = 0;
      for (let index = 0; index < ORDER.length; index++) {
        const id = ORDER[index], spot = spots[index];
        const anchor = anchors[id];
        _point.copy(anchor.local).applyMatrix4((anchor.node ?? model).matrixWorld).project(camera);
        const ax = (_point.x + 1) / 2 * width, ay = (1 - _point.y) / 2 * height;
        const visible = _point.z > -1 && _point.z < 1 && Math.abs(_point.x) < 1 && Math.abs(_point.y) < 1
          && place(spot, id, ax, ay, count);
        spot.el.hidden = spot.dot.hidden = spot.lead.hidden = !visible;
        if (!visible) { spot.place = -1; continue; }
        const bx = _try[0], by = _try[1];
        spot.place = _try[2];
        const left = (spot.place & 1) === 1;
        const x0 = left ? bx - spot.width + BADGE : bx - BADGE;
        // the plates that show count 1, 2, 3 in order, never with a gap where one found no room
        if (spot.shownAs !== count + 1) { spot.shownAs = count + 1; spot.num.textContent = String(count + 1); }
        const at = count++ * 4;
        _placed[at] = x0;
        _placed[at + 1] = by - PLATE_H / 2;
        _placed[at + 2] = x0 + spot.width;
        _placed[at + 3] = by + PLATE_H / 2;
        if (left !== spot.left) { spot.left = left; spot.el.classList.toggle('l', left); }
        spot.el.style.transform = `translate3d(${bx.toFixed(1)}px,${by.toFixed(1)}px,0)`;
        spot.dot.style.transform = `translate3d(${ax.toFixed(1)}px,${ay.toFixed(1)}px,0)`;
        const dx = bx - ax, dy = by - ay;
        spot.lead.style.transform = `translate3d(${ax.toFixed(1)}px,${ay.toFixed(1)}px,0) `
          + `rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${Math.hypot(dx, dy).toFixed(1)})`;
      }
      layer.hidden = count === 0;
    },
  };
}
