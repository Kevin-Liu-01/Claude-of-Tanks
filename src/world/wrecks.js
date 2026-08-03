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
import { createTank } from '../vehicles/tankFactory.js';

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
      if (!chainVisible(o, visual.root)) return; // hidden placeholders/decals
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
 * @param {string} era 'ww2' | 'modern'
 * @returns {string[]}
 */
export function wreckPool(era) {
  return era === 'modern'
    ? ['m1a2', 't90m', 'leo2a7', 'm1a1', 't90a', 'strv103']
    : ['tiger1', 'panther_g', 't34_85', 'm4a3e8', 'is2', 'kv2'];
}
