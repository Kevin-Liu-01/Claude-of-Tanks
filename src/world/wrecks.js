// src/world/wrecks.js — DESTRUCTIBLES r1: REAL-ROSTER TANK WRECKS as static
// battlefield dressing.
//
// The old props.js hulks were generic box sketches; the owner asked for the
// map wrecks to be "our actual tank models". This module builds a roster
// vehicle through the live factory (src/vehicles/tankFactory.js), applies the
// settled destroyed pose via the factory's own wreck machinery
// (setDestroyed({pop, ageS: large}) — the exact precedent the killcam uses:
// wreckSeat capture, askew turret, drooped gun), then BAKES the posed
// hierarchy down to one static merged BufferGeometry with charred/rusted
// vertex colors and disposes the live visual. A whole map's wrecks render as
// ONE mesh on the props layer's matte vertex-color material — a handful of
// draw calls total instead of a live tank's dozens, no articulation, no
// per-frame cost, no tank materials/textures retained.
//
// Contract notes:
//  - createTank is called with proceduralOnly: true — synchronous procedural
//    build (no async GLB swap, no GLB textures), and attachTankDecorations
//    HARD-SKIPS on that flag, so this path never interacts with the
//    decoration system or the geometry-gate metrology guards. tankFactory
//    itself is NOT modified — the bake is a pure consumer.
//  - Wrecks are DRESSING: props.js gives them solid obstacles + colliders;
//    they are never in game.tanks, never spotted, never on the minimap.
//  - Failure-tolerant: profile builders are actively iterated by the
//    fidelity program — any per-id build failure returns null and the caller
//    just skips that wreck (a map with fewer wrecks beats a crashed build).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTank } from '../vehicles/fleetFactory.js';
import { VEHICLE_ERAS } from '../vehicles/taxonomy.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// cheap deterministic 3D value hash for the char/rust paint (no noise dep —
// wrecks.js must stay import-light to avoid world<->vehicles cycles)
function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
// Static battlefield wrecks are never inspection heroes. Match the proven
// low-geometry battle handoff used by live tanks beyond 66 m: retain the
// load-bearing road-wheel/tire silhouettes, but omit sub-wheel recesses,
// return rollers and end-wheel fasteners that disappear under the charred
// track band at gameplay scale.
const WRECK_FINE_GEAR = /^(?:gearRoadWheel.*(?:Inset|Ring|Rim|Bowl|Hub|Dish|Recess)|gearReturnRoller|gearEndWheelHardware)/;

/** true when o and every ancestor up to (incl.) root renders */
function chainVisible(o, root) {
  for (let n = o; n; n = n.parent) {
    if (n.visible === false) return false;
    if (n === root) return true;
  }
  return true; // detached-under-root should not happen; keep permissive
}

/**
 * Build one roster tank as a settled, burnt wreck and bake it to a single
 * static geometry (position/normal/color, base at y=0, XZ centered on the
 * hull origin, facing local +z like the live tank).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {string} specId roster vehicle id ('tiger1', 'm1a2', ...)
 * @param {{seed?: number, pop?: boolean}} [opts] pop=true = ammo-rack wreck
 *   (turret tossed beside the ring), else unseated-askew turret
 * @returns {?{geo: THREE.BufferGeometry, hx: number, hz: number, h: number,
 *   tris: number}} null on any build failure
 */
export function bakeTankWreck(engineCtx, specId, opts = {}) {
  const seed = (opts.seed ?? 1) | 0;
  const rng = mulberry32(seed ^ 0x5eed);
  let visual = null;
  try {
    visual = createTank(specId, engineCtx, {
      camoSeed: 4000 + (seed % 997),
      quality: 'low',          // texture tier only — silhouette stays hero
      proceduralOnly: true,    // synchronous, no GLB, decor hard-skips
    });
    // settled wreck pose through the factory's own machinery: ageS far past
    // every timeline => turret settled (popped beside the ring or unseated
    // askew), gun drooped, burn timeline fully aged.
    visual.setDestroyed({ pop: !!opts.pop, ageS: 1000 });
    visual.root.updateMatrixWorld(true);
    const rootInv = _m.copy(visual.root.matrixWorld).invert().clone();

    const geos = [];
    const proxyGeos = []; // the tank's own low-poly SHADOW PROXIES, same pose
    const expandInstanced = (o) => {
      const src = o.geometry;
      const rel = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
      const inst = new THREE.Matrix4();
      const n = Math.min(o.count, 400);
      for (let i = 0; i < n; i++) {
        o.getMatrixAt(i, inst);
        const g = src.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(rel, inst));
        geos.push(g);
      }
    };
    const _sz = new THREE.Vector3();
    visual.root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const simplifiedTrackPads = o.name === 'gearTrackPadsSimplified';
      const hasSimplifiedTrackSibling = o.name === 'gearTrackPads'
        && o.parent?.children.some((child) => child.name === 'gearTrackPadsSimplified');
      // Wreck dressing bakes the existing 22-triangle distance shoe instead
      // of expanding the 164-196 triangle inspection shoe hundreds of times.
      // Both LOD levels share the exact instance matrices, width and grouser
      // peak, so this changes neither the course nor the visible silhouette.
      if (hasSimplifiedTrackSibling) return;
      if (!simplifiedTrackPads && !chainVisible(o, visual.root)) return;
      if (WRECK_FINE_GEAR.test(o.name || '')) return;
      const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m0 && m0.colorWrite === false) {
        // PERF: the factory's articulation-aware low-poly shadow proxies —
        // bake them separately as the wreck's SHADOW caster so the three CSM
        // cascades never re-draw the full hulk (the proxies already sit in
        // the settled wreck pose; this is the same trick live tanks use).
        const g = o.geometry.clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
        proxyGeos.push(g);
        return;
      }
      if (m0 && m0.transparent && m0.map) return; // decal planes etc.
      if (o.isInstancedMesh) { expandInstanced(o); return; }
      // PERF: wrecks are DRESSING — sub-fitting greebles (periscopes, hooks,
      // lamps, sub-35 cm fittings) never read on a charred hulk at gameplay
      // distance but dominate the triangle bill. Skip small parts by size.
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      o.geometry.boundingBox.getSize(_sz);
      const diag = Math.hypot(_sz.x, _sz.y, _sz.z);
      if (diag < 0.35) return;
      const g = o.geometry.clone()
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
      geos.push(g);
    });
    if (!geos.length) throw new Error('no bakeable geometry');

    // normalize attribute sets for the merge: position + normal only
    const normd = [];
    for (const g of geos) {
      let gg = g.index ? g.toNonIndexed() : g;
      if (!gg.attributes.normal) gg.computeVertexNormals();
      for (const key of Object.keys(gg.attributes)) {
        if (key !== 'position' && key !== 'normal') gg.deleteAttribute(key);
      }
      gg.morphAttributes = {};
      gg.clearGroups();
      normd.push(gg);
    }
    const merged = mergeGeometries(normd, false);
    if (!merged) throw new Error('merge failed');

    // ---- charred/rusted wreck paint (vertex colors, matte 'baked' mat) ----
    // Language matches the props charPaint hulks: scorched brown-black body,
    // clustered rust bloom, ash-lightened upward faces, subtle panel drift.
    const pos = merged.attributes.position;
    const nrm = merged.attributes.normal;
    const nV = pos.count;
    const col = new Float32Array(nV * 3);
    // stay inside the PROVEN charPaint value band (props.js r7 hulks:
    // v 0.055-0.105) — the first cut carried an up-facing "ash" bonus to
    // ~0.16 albedo which tonemapped to TAN under a 3.5+ sun (steppe/verdant
    // frame review); charred steel must stay near-black even sunlit.
    const rustPhase = rng() * 40;
    for (let i = 0; i < nV; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const up = Math.max(0, nrm.getY(i));
      const panel = hash3(Math.round(px * 2.4) * 0.5, Math.round(py * 2.4) * 0.5, Math.round(pz * 2.4) * 0.5);
      const grain = hash3(px * 9.1, py * 9.1, pz * 9.1);
      const rustN = hash3(px * 1.7 + rustPhase, py * 1.9, pz * 1.7 - rustPhase);
      let r, g2, b;
      if (rustN > 0.80 && up < 0.85) { // clustered rust bloom on sides
        const rl = 0.085 + grain * 0.075;
        r = rl * 1.75; g2 = rl * 0.9; b = rl * 0.55;
      } else {
        const v = 0.046 + panel * 0.022 + grain * 0.017 + up * up * 0.020; // faint ash caps
        r = v * 1.05; g2 = v; b = v * 0.93;
      }
      col[i * 3] = r; col[i * 3 + 1] = g2; col[i * 3 + 2] = b;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // shadow-caster geometry from the factory proxies (position only)
    let shadowGeo = null;
    if (proxyGeos.length) {
      const pn = [];
      for (const g of proxyGeos) {
        let gg = g.index ? g.toNonIndexed() : g;
        for (const key of Object.keys(gg.attributes)) {
          if (key !== 'position') gg.deleteAttribute(key);
        }
        gg.morphAttributes = {};
        gg.clearGroups();
        pn.push(gg);
      }
      shadowGeo = mergeGeometries(pn, false);
      for (const g of pn) g.dispose();
    }

    // base to y=0 (dead suspension settle happens at placement time)
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    merged.translate(0, -bb.min.y, 0);
    if (shadowGeo) shadowGeo.translate(0, -bb.min.y, 0);
    const out = {
      geo: merged,
      shadowGeo,
      hx: (bb.max.x - bb.min.x) / 2,
      hz: (bb.max.z - bb.min.z) / 2,
      h: bb.max.y - bb.min.y,
      tris: (merged.attributes.position.count / 3) | 0,
    };
    for (const g of normd) g.dispose();
    return out;
  } catch (e) {
    console.warn(`[wrecks] bake failed for ${specId}:`, e && e.message);
    return null;
  } finally {
    if (visual) {
      try { visual.dispose(); } catch (_) { /* never break a world build */ }
    }
  }
}

/**
 * Era-appropriate wreck id pools (base-roster procedural ids only — always
 * registered, always buildable without a GLB fetch).
 * @param {string} era canonical vehicle era
 * @returns {string[]}
 */
export function wreckPool(era) {
  if (era === VEHICLE_ERAS.INTERWAR || era === VEHICLE_ERAS.WORLD_WAR_II) {
    return ['tiger1', 'panther_g', 't34_85', 'm4a3e8', 'is2', 'kv2'];
  }
  if (era === VEHICLE_ERAS.COLD_WAR) {
    return ['m60a1', 'm48', 't80u', 'type74', 'leo1a5', 'chieftain5',
      'type59', 'strv103', 'm1a1', 'bmp2'];
  }
  return ['m1a2', 't90m', 'leo2a7', 't90a', 'challenger2', 'leclerc',
    'merkava3d', 'k2', 'type99a', 'type10', 'kf51', 'ariete', 'pt91m', 'strv122'];
}

/**
 * Build lightweight local-space battlefield debris for a baked tank wreck:
 * torn track-pad runs, detached road wheels, armor panels and tow-cable scrap.
 * All pieces merge into the wreck mesh (zero extra draw calls / idle work).
 * The exact vehicle silhouette and any popped turret still come from
 * bakeTankWreck; these are the missing secondary destruction cues around it.
 *
 * @param {number} seed
 * @param {{modern?:boolean}} [opts]
 * @returns {{geo:THREE.BufferGeometry,tris:number}}
 */
export function bakeWreckDebris(seed, opts = {}) {
  const rng = mulberry32((seed ^ 0x71ac5eed) >>> 0);
  const modern = opts.modern !== false;
  const parts = [];

  function colored(geo, family = 'char') {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
    }
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const grain = 0.78 + rng() * 0.38;
      const rust = family === 'rust' || (family === 'char' && rng() < 0.12);
      const base = rust ? [0.16, 0.072, 0.034]
        : family === 'rubber' ? [0.028, 0.026, 0.024] : [0.064, 0.057, 0.051];
      colors[i * 3] = base[0] * grain;
      colors[i * 3 + 1] = base[1] * grain;
      colors[i * 3 + 2] = base[2] * grain;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.clearGroups();
    g.morphAttributes = {};
    parts.push(g);
  }

  // Two visibly torn track runs: irregular pads snake away from opposite hull
  // corners, with gaps and flipped shoes instead of intact ribbon geometry.
  for (const side of [-1, 1]) {
    const count = (modern ? 10 : 8) + ((rng() * 5) | 0);
    const startX = side * (modern ? 2.05 : 1.65);
    const startZ = (rng() - 0.5) * 2.2;
    const dir = (side > 0 ? 0.45 : Math.PI + 0.45) + (rng() - 0.5) * 1.2;
    for (let i = 0; i < count; i++) {
      if (i > 2 && rng() < 0.16) continue;
      const t = i * (modern ? 0.48 : 0.42);
      const x = startX + Math.sin(dir) * t + Math.sin(i * 0.8) * 0.16;
      const z = startZ + Math.cos(dir) * t + Math.cos(i * 0.63) * 0.14;
      const pad = new THREE.BoxGeometry(modern ? 0.50 : 0.43, 0.09, modern ? 0.31 : 0.27);
      pad.rotateY(dir + (rng() - 0.5) * 0.36);
      pad.rotateX((rng() - 0.5) * 0.22);
      pad.rotateZ((rng() - 0.5) * 0.18);
      pad.translate(x, 0.07 + rng() * 0.05, z);
      colored(pad, i % 5 === 0 ? 'rust' : 'char');
    }
  }

  // Detached road wheels: a mix of flat, leaning and nearly upright discs.
  const wheelCount = (modern ? 4 : 3) + ((rng() * 3) | 0);
  for (let i = 0; i < wheelCount; i++) {
    const r = (modern ? 0.34 : 0.29) + rng() * 0.12;
    const wheel = new THREE.CylinderGeometry(r, r, 0.18 + rng() * 0.10, 10, 1);
    const upright = rng() < 0.45;
    wheel.rotateZ(upright ? Math.PI / 2 + (rng() - 0.5) * 0.35 : (rng() - 0.5) * 0.22);
    wheel.rotateY(rng() * Math.PI);
    const a = rng() * Math.PI * 2, rr = 2.7 + rng() * 3.2;
    wheel.translate(Math.sin(a) * rr, upright ? r : 0.12, Math.cos(a) * rr);
    colored(wheel, 'rubber');
    // Exposed steel hub keeps a detached wheel readable against charred soil.
    const hub = new THREE.CylinderGeometry(r * 0.36, r * 0.36, 0.205, 9, 1);
    hub.rotateZ(upright ? Math.PI / 2 + (rng() - 0.5) * 0.35 : 0);
    hub.rotateY(rng() * Math.PI);
    hub.translate(Math.sin(a) * rr, upright ? r : 0.13, Math.cos(a) * rr);
    colored(hub, 'rust');
  }

  // Armor skirts, grilles and stowage panels thrown beyond the burn scar.
  const panelCount = 4 + ((rng() * 4) | 0);
  for (let i = 0; i < panelCount; i++) {
    const w = 0.45 + rng() * 0.75, d = 0.28 + rng() * 0.58;
    const panel = new THREE.BoxGeometry(w, 0.045 + rng() * 0.045, d);
    panel.rotateX((rng() - 0.5) * 0.45);
    panel.rotateY(rng() * Math.PI);
    panel.rotateZ((rng() - 0.5) * 0.32);
    const a = rng() * Math.PI * 2, rr = 2.0 + rng() * 4.0;
    panel.translate(Math.sin(a) * rr, 0.08 + rng() * 0.12, Math.cos(a) * rr);
    colored(panel, rng() < 0.35 ? 'rust' : 'char');
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('wreck debris merge failed');
  const tris = (merged.attributes.position.count / 3) | 0;
  for (const g of parts) g.dispose();
  return { geo: merged, tris };
}
