// src/vehicles/decorations.js — cosmetic external-stowage / fittings kit for
// the whole fleet ("decoration system", 2026-07 round).
//
// WHAT THIS IS: a library of parameterized decoration builders (cupolas, roof
// MGs, stowage, tow cables, fuel drums, netting, …), a per-tank manifest table
// (curated ids + era/nation defaults so EVERY tank dresses), and a placement
// engine that anchors each piece against the tank's REAL as-built geometry by
// raycast probing — never spec fractions alone — so nothing floats and
// nothing interpenetrates.
//
// ARCHITECTURE LAW (non-negotiable — the fleet metrology program depends on
// every clause):
//  * Every decoration mesh lives under a dedicated group: `rig_decor_hull`
//    (child of rig_hull) or `rig_decor_turret` (child of rig_turret, so
//    turret decor yaws with the turret).
//  * Decor is a COSMETIC layer: it is HARD-SKIPPED when tankFactory builds
//    with `proceduralOnly` (the geometry-gate / shaded-parity flag), and
//    auto-skipped on metrology stub engine contexts (see resolveDecorMode),
//    so the gate lab's REFERENCE builds stay bare too. The geometry-gate
//    ledger must be byte-identical before/after this module exists.
//  * In-game builds (garage pedestal, battle, studio, icon generator) get
//    decor ON by default — no call-site changes required.
//  * Per-tank selection is DETERMINISTIC, seeded by SPEC ID only (never
//    camoSeed): the same tank always wears the same kit; variation lives
//    ACROSS the fleet, stability per vehicle.
//  * Placement guards: WIDTH GUARD (no piece may reach past
//    dims.widthM/2 + 0.05 m — the loader's width clamp must never fire on
//    account of cosmetics), GUN GUARD (the full-depression bore swept across
//    every turret yaw must clear every hull piece), TURRET-SWEEP GUARD (hull
//    decor inside the swept annulus stays below the turret's lowest skirt),
//    and a 5-point seat probe (uneven/occupied surfaces are rejected — which
//    also de-dupes against profile-authored greebles like the M60's
//    searchlight: an occupied roof spot simply doesn't probe flat).
//  * PERF: static decor merges into ONE BufferGeometry per material family
//    per parent group (≈4-9 added draws/tank), budgeted ≤ 3000 added
//    triangles per tank, castShadow OFF (the fleet's shadow proxies carry
//    silhouettes; per-mesh casters are swept off on both procedural and GLB
//    paths), LOD-wrapped at the same 150 m greeble horizon tankFactory uses.
//  * WRECKS: decor materials are per-visual MeshStandardMaterials chained
//    through the same ambient-floor hook pattern createTankMaterials uses,
//    so tankFactory.setDestroyed's existing traversal wraps them with the
//    burn mask and decor chars in lockstep with the hull (listen-only —
//    nothing here touches the burn driver).
//
// No top-level side effects; canvas textures are created lazily (plain-node
// imports — the track-geometry selftest imports tankFactory — must stay
// safe).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  vehicleAmbientFloorHook, getKitPaintTexture, getSharedRoughnessTexture,
} from './materials.js';

// ---------------------------------------------------------------------------
// Deterministic seeding — spec id ONLY (mandate: stable per vehicle).
// ---------------------------------------------------------------------------

function mulberry32(a){a|=0;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Geometry helpers (self-contained twins of the tankFactory primitives —
// deliberately NOT imported from tankFactory: that module imports us).
// Segment counts run one notch under the hull builders': decoration is
// greeble-class and budgeted (~3k tris/tank).
// ---------------------------------------------------------------------------

function xform(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = Array.isArray(s) ? s : [s, s, s];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sc[0], sc[1], sc[2]),
  );
  geo.applyMatrix4(m);
  return geo;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylY = (rT, rB, h, seg = 10) => new THREE.CylinderGeometry(rT, rB, h, seg);
const cylX = (r, len, seg = 10, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, 0, 0, Math.PI / 2);
const cylZ = (r, len, seg = 10, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, Math.PI / 2, 0, 0);
const sph = (r, w = 9, h = 6) => new THREE.SphereGeometry(r, w, h);
const capX = (r, len, seg = 8) =>
  xform(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.01), 2, seg), 0, 0, 0, 0, 0, Math.PI / 2);
const torus = (r, tube, seg = 10, tSeg = 5, arc = Math.PI * 2) =>
  xform(new THREE.TorusGeometry(r, tube, tSeg, seg, arc), 0, 0, 0, Math.PI / 2, 0, 0);
// torus in its native XY plane (vertical rings: bail handles, end loops)
const torusV = (r, tube, seg = 10, tSeg = 5, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, tube, tSeg, seg, arc);
const lathe = (profile, seg = 16) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), seg);

// World-scale box-projected UVs (same recipe as tankFactory.boxUV) so the
// shared weave/wood canvases keep a uniform texel density across pieces.
function boxUV(geo, scale = 1.1) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const triCount = (geo) => ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) | 0;

// Per-piece baked shade: tone jitter + a soft downward-face AO so merged
// families don't read as one flat injection-molded color (the same trick
// tankFactory.bakeDirt plays on the camo shells, minus the dust ramp).
function bakeShade(geo, tone = 1, ao = 0.3) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nyv = nor.getY(i);
    const a = (1 - Math.max(0, -nyv) * ao) * (1 - Math.max(0, nyv) * ao * 0.25);
    col[i * 3] = tone * a; col[i * 3 + 1] = tone * a; col[i * 3 + 2] = tone * a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Tinted variant (rgb multipliers) — one merged family can carry several
// authored colors (fuel-tan vs water-green jerrycans, helmet OD).
function bakeTint(geo, r, g, b, ao = 0.3) {
  bakeShade(geo, 1, ao);
  const col = geo.attributes.color;
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
  }
  return geo;
}

// shift/rotate every part of a kit in its local frame (builder helper)
function xformParts(parts, x, y, z, rx = 0, ry = 0, rz = 0, from = 0) {
  for (let i = from; i < parts.length; i++) xform(parts[i].geo, x, y, z, rx, ry, rz);
  return parts;
}

function partsBBox(parts) {
  const bb = new THREE.Box3();
  const t = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    t.copy(p.geo.boundingBox);
    bb.union(t);
  }
  return bb;
}

// ---------------------------------------------------------------------------
// Shared canvas detail textures (lazy, module-cached, shared across tanks —
// textures MAY be shared; MATERIALS never are: the burn hook needs per-visual
// material instances).
// ---------------------------------------------------------------------------

const _texCache = new Map();
function canvasTex(key, size, paint) {
  if (_texCache.has(key)) return _texCache.get(key);
  if (typeof document === 'undefined') { _texCache.set(key, null); return null; } // node safety
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}

// woven canvas / burlap: two thread directions + macro tone blotches
function weaveTex() {
  return canvasTex('decor-weave', 128, (g, S) => {
    g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x51ab);
    for (let y = 0; y < S; y += 2) {
      g.fillStyle = `rgba(60,52,40,${0.05 + 0.07 * ((y >> 1) & 1)})`;
      g.fillRect(0, y, S, 1);
    }
    for (let x = 0; x < S; x += 3) {
      g.fillStyle = 'rgba(255,250,240,0.06)';
      g.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S, r = 8 + rng() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${rng() < 0.5 ? '30,26,18' : '235,228,210'},0.10)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

// crate wood: planks + grain
function woodTex() {
  return canvasTex('decor-wood', 128, (g, S) => {
    g.fillStyle = '#8d7a5e'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x77d1);
    const plank = S / 4;
    for (let p = 0; p < 4; p++) {
      g.fillStyle = `rgba(70,50,28,${0.10 + rng() * 0.12})`;
      g.fillRect(0, p * plank, S, 2);
      for (let i = 0; i < 22; i++) {
        const y = p * plank + 3 + rng() * (plank - 5);
        g.strokeStyle = `rgba(${rng() < 0.6 ? '92,68,40' : '150,120,80'},${0.12 + rng() * 0.15})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + (rng() - 0.5) * 3);
        g.stroke();
      }
    }
  });
}

// camouflage netting: open diagonal mesh with garnish rags; alpha = holes
function netTex() {
  return canvasTex('decor-net', 128, (g, S) => {
    g.clearRect(0, 0, S, S);
    const rng = mulberry32(0x4e7a);
    g.strokeStyle = 'rgba(58,62,40,0.95)';
    g.lineWidth = 2;
    for (let d = -S; d < S * 2; d += 9) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d + S, S); g.stroke();
      g.beginPath(); g.moveTo(d + S, 0); g.lineTo(d, S); g.stroke();
    }
    for (let i = 0; i < 170; i++) { // garnish scrim rags
      const x = rng() * S, y = rng() * S;
      g.fillStyle = rng() < 0.5 ? 'rgba(72,82,46,0.92)' : (rng() < 0.5 ? 'rgba(96,92,54,0.92)' : 'rgba(52,58,38,0.92)');
      g.save();
      g.translate(x, y); g.rotate(rng() * Math.PI);
      g.fillRect(-4 - rng() * 5, -2, 8 + rng() * 10, 4);
      g.restore();
    }
  });
}

// welded wire grid (bustle baskets / mesh cages): straight open cross-hatch
function gridTex() {
  return canvasTex('decor-grid', 64, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(70,74,78,0.98)';
    g.lineWidth = 1.6;
    for (let d = 0; d <= S; d += 8) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d, S); g.stroke();
      g.beginPath(); g.moveTo(0, d); g.lineTo(S, d); g.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// Engine-context probe — the metrology/live discriminator.
//
// Same probe materials.js captureGlbEngineCtx uses: a REAL game context's
// setupShadowMaterial stamps USE_CSM onto a throwaway material. Metrology
// surfaces (procedural-fidelity lab & its geometry gate, shaded-parity
// boards, rig-QA pages) pass `(m) => m` stubs — decor auto-skips there so
// even the gate's REFERENCE builds (which don't pass proceduralOnly) can
// never wear kit. Pages with NO ctx at all (icon generator) are NOT
// metrology — they render the game's shipped look and stay decorated.
// ---------------------------------------------------------------------------

const CTX_PROBED = new WeakMap(); // engineCtx -> boolean (real CSM ctx)
function isRealShadowCtx(engineCtx) {
  if (!engineCtx || typeof engineCtx.setupShadowMaterial !== 'function') return false;
  if (CTX_PROBED.has(engineCtx)) return CTX_PROBED.get(engineCtx);
  let real = false;
  try {
    const probe = new THREE.MeshStandardMaterial();
    engineCtx.setupShadowMaterial(probe);
    real = !!(probe.defines && probe.defines.USE_CSM);
    probe.dispose();
  } catch (e) { real = false; }
  CTX_PROBED.set(engineCtx, real);
  return real;
}

/**
 * Should this build wear decorations?
 * @param {{proceduralOnly?:boolean, decor?:boolean}} opts createTank opts
 * @param {?object} engineCtx
 * @returns {boolean}
 */
export function resolveDecorMode(opts = {}, engineCtx = null) {
  if (opts.proceduralOnly) return false;          // metrology contract — hard skip
  if (opts.decor === false) return false;          // explicit off
  if (opts.decor === true) return true;            // explicit on (decoration board)
  // auto: a ctx that OFFERS setupShadowMaterial but fails the CSM probe is a
  // measurement stub (fidelity lab / parity boards / thumb booth) — skip.
  // Real game ctx or no ctx at all (icon generator) -> decorate.
  if (engineCtx && typeof engineCtx.setupShadowMaterial === 'function' && !isRealShadowCtx(engineCtx)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-visual decoration materials.
//
// Per-visual (never shared) because tankFactory.setDestroyed wraps every
// rendered material with THAT tank's burn driver — a shared material would
// trip applyBurnHook's ownership guard and drop the second tank's decor to
// the flat shared-burnt swap. The ambient-floor hook is chained through
// setupShadowMaterial on real contexts and assigned directly otherwise —
// byte-identical to the createTankMaterials pattern (same shared program
// cache key), so decor materials survive the same clone/CSM paths and stay
// readable in shade like the rest of the vehicle.
// ---------------------------------------------------------------------------

function buildDecorMaterials(spec, engineCtx) {
  const setup = isRealShadowCtx(engineCtx)
    ? (m) => {
      engineCtx.setupShadowMaterial(m, vehicleAmbientFloorHook);
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    }
    : (m) => {
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    };

  const made = {};
  const defs = {
    // scheme-painted steel kit: the shared per-spec kit-paint canvas keeps
    // bolt-on hardware in the ACTIVE camo pattern's tonal family and live-
    // repaints with garage pattern switches (same texture the ARAT/stowage
    // add-on path uses — crews spray hard kit, never soft kit).
    kit: () => ({
      map: getKitPaintTexture(spec), roughnessMap: getSharedRoughnessTexture(spec),
      roughness: 0.86, metalness: 0.06, vertexColors: true, envMapIntensity: 0.35,
    }),
    // dark oily gunmetal: MGs, cables, tools, shackles, track links
    steel: () => ({
      color: 0x33363a, roughness: 0.62, metalness: 0.35,
      roughnessMap: getSharedRoughnessTexture(spec),
      vertexColors: true, envMapIntensity: 0.35,
    }),
    wood: () => ({
      map: woodTex(), color: 0x97815f, roughness: 0.9, metalness: 0.02,
      vertexColors: true, envMapIntensity: 0.15,
    }),
    canvas: () => ({
      map: weaveTex(), color: 0x8a8560, roughness: 0.96, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    burlap: () => ({
      map: weaveTex(), color: 0xab9468, roughness: 0.98, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.1,
    }),
    rubber: () => ({
      color: 0x232425, roughness: 0.94, metalness: 0.04,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    cans: () => ({ // authored-color hardware (jerrycans): tint baked per piece
      color: 0xffffff, roughness: 0.72, metalness: 0.12,
      roughnessMap: getSharedRoughnessTexture(spec),
      vertexColors: true, envMapIntensity: 0.3,
    }),
    net: () => ({
      map: netTex(), color: 0xb0b68c, roughness: 0.95, metalness: 0.0,
      alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.1,
    }),
    mesh: () => ({ // wire-grid panels (baskets, cages)
      map: gridTex(), color: 0x7c7e74, roughness: 0.7, metalness: 0.35,
      alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.25,
    }),
    lens: () => ({ // optic faces / vision blocks / searchlight glass
      color: 0x161d23, roughness: 0.28, metalness: 0.6, envMapIntensity: 0.55,
      vertexColors: true,
    }),
  };
  return {
    get(key) {
      if (!made[key]) {
        const def = defs[key]();
        if (!def.map) delete def.map; // node safety (no canvas available)
        made[key] = setup(new THREE.MeshStandardMaterial(def));
        made[key].name = `Decor_${key}`;
      }
      return made[key];
    },
    all: () => made,
  };
}

// ---------------------------------------------------------------------------
// THE KIT LIBRARY.
//
// Every builder: ({ rng, ...params }) => [{ mat:<family>, geo }] in
// PIECE-LOCAL frame — origin at the SEAT (contact point), +Z the piece's
// forward, +Y up. The placer positions the parts on the tank and merges per
// material family. `parts.meta` may carry mount hints for the slot resolver.
// ---------------------------------------------------------------------------

export const DECOR_KITS = {

  // -- commander's cupola upgrade: raised vision-block ring ------------------
  cupola({ rng, v = 'ring' }) {
    const parts = [];
    const tone = 0.92 + rng() * 0.14;
    if (v === 'ring') {              // low vision-block ring + closed lid
      const r = 0.30;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r * 0.94, 0], [r, 0.02], [r, 0.16], [r * 0.9, 0.19], [r * 0.62, 0.215], [0.001, 0.225]], 16), tone) });
      for (let i = 0; i < 7; i++) {   // vision blocks
        const a = (i / 7) * Math.PI * 2;
        parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.085, 0.05, 0.03), Math.sin(a) * (r - 0.006), 0.105, Math.cos(a) * (r - 0.006), 0, a, 0), 0.9) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.02, 0.16), 0, 0.232, -0.1), tone) }); // lid hinge spine
    } else if (v === 'drum') {       // taller drum cupola (early pattern)
      const r = 0.27;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r, 0], [r, 0.24], [r * 0.93, 0.27], [r * 0.5, 0.30], [0.001, 0.305]], 16), tone) });
      for (let i = 0; i < 5; i++) {   // vision slits
        const a = (i / 5) * Math.PI * 2 + 0.3;
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.10, 0.035, 0.025), Math.sin(a) * r, 0.17, Math.cos(a) * r, 0, a, 0), 0.55) });
      }
    } else {                          // 'split': ring + open lid leaned on the hinge
      const r = 0.28;
      const lidR = r * 0.55;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r * 0.95, 0], [r, 0.05], [r, 0.13], [r * 0.6, 0.16], [0.001, 0.165]], 16), tone) });
      // lid disc pivoted AT ITS EDGE on the ring rim (open ~68 deg)
      const lid = cylY(lidR, lidR, 0.028, 12);
      xform(lid, 0, 0, lidR);                        // hinge at disc edge
      xform(lid, 0, 0, 0, -68 * D2R, 0, 0);          // swing open
      parts.push({ mat: 'kit', geo: bakeShade(xform(lid, 0, 0.165, -r * 0.72), tone * 1.05) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.07, 0.03, 0.05), 0, 0.155, -r * 0.8), 0.55) }); // hinge block
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.04, 0.01, 8, 4), 0, 0.17, r * 0.35), 0.55) }); // grab ring
    }
    return parts;
  },

  // -- openable-looking hatch cover with hinges -------------------------------
  hatch({ rng, v = 'round' }) {
    const tone = 0.9 + rng() * 0.16;
    const parts = [];
    if (v === 'round') {
      const r = 0.25;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r, 0], [r, 0.035], [r * 0.86, 0.055], [r * 0.3, 0.07], [0.001, 0.075]], 14), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.028, 0.11), 0, 0.02, r * 0.9), 0.62) });    // hinge block
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.045, 0.011, 8, 4), 0, 0.078, -r * 0.4), 0.6) }); // grab ring
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.08, 0.02, 0.05), 0, 0.03, -r * 0.88), tone) });      // latch lug
    } else { // rect twin-panel
      const w = 0.42, d = 0.34;
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, 0.05, d), 0, 0.025, 0), tone) });
      for (const s of [-1, 1]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.02, 0.07, 6), s * w * 0.3, 0.03, d / 2 + 0.015), 0.6) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.1, 0.022, 0.04), 0, 0.058, -d * 0.28), 0.65) });   // handle
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.09, 0.06, 0.09), w * 0.28, 0.08, d * 0.1), tone * 1.05) }); // periscope stub
    }
    return parts;
  },

  // -- roof AAMG: .50 M2 / DShK, pintle or ring, with/without gun shield ------
  aamg({ rng, v = 'm2', shield = false, ring = false }) {
    const parts = [];
    const steel = (geo, t = 0.6) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.06) });
    const kit = (geo, t = 0.95) => parts.push({ mat: 'kit', geo: bakeShade(geo, t) });
    const H = 0.30;                          // pintle head height above seat
    if (ring) {                              // ring mount: rail + 3 standoffs
      steel(xform(torus(0.33, 0.016, 16, 4), 0, 0.10, 0), 0.55);
      for (let i = 0; i < 3; i++) {
        const a = i * (Math.PI * 2 / 3) + 0.5;
        steel(xform(cylY(0.014, 0.014, 0.10, 5), Math.sin(a) * 0.33, 0.05, Math.cos(a) * 0.33), 0.5);
      }
    }
    steel(xform(cylY(0.03, 0.038, H, 8), 0, H / 2, 0), 0.5);                  // pintle post
    steel(xform(cylX(0.028, 0.09, 6), 0, H, 0), 0.55);                        // cradle trunnion
    const recY = H + 0.055;
    const gunFrom = parts.length;            // parts from here ride the cradle
    if (v === 'dshk') {
      steel(xform(box(0.11, 0.12, 0.42), 0, recY, -0.05), 0.62);              // receiver
      steel(xform(cylZ(0.026, 0.62, 8), 0, recY + 0.01, 0.48), 0.58);         // barrel
      steel(xform(cylZ(0.042, 0.20, 8), 0, recY + 0.01, 0.28), 0.5);          // finned sleeve
      steel(xform(cylZ(0.055, 0.075, 8, 0.028), 0, recY + 0.01, 0.80), 0.55); // muzzle booster
      steel(xform(box(0.05, 0.14, 0.05), 0, recY - 0.12, -0.24, 0.5), 0.5);   // spade grips
      kit(xform(box(0.09, 0.12, 0.24), -0.115, recY + 0.01, 0.02), 0.7);      // drum/belt box
    } else {                                  // Browning M2HB
      steel(xform(box(0.095, 0.115, 0.46), 0, recY, -0.02), 0.62);            // receiver
      steel(xform(cylZ(0.021, 0.56, 8), 0, recY + 0.012, 0.46), 0.58);        // barrel
      steel(xform(cylZ(0.034, 0.24, 8), 0, recY + 0.012, 0.29), 0.52);        // barrel jacket
      steel(xform(box(0.032, 0.05, 0.07), 0, recY + 0.09, -0.20), 0.5);       // buffer/rear sight
      steel(xform(box(0.05, 0.11, 0.045), 0, recY - 0.11, -0.23, 0.55), 0.5); // grips
      kit(xform(box(0.075, 0.11, 0.24), 0.10, recY - 0.01, 0.03), 0.72);      // ammo can
    }
    if (shield) {
      kit(xform(box(0.5, 0.32, 0.022), 0, recY + 0.09, 0.15), 0.9);
      kit(xform(box(0.16, 0.12, 0.02), 0, recY + 0.30, 0.15), 0.9);           // sight riser
      for (const s of [-1, 1]) {      // mounting struts back to the cradle
        steel(xform(box(0.024, 0.024, 0.16), s * 0.14, recY + 0.04, 0.06), 0.5);
      }
    }
    // gun + shield stowed muzzle-up ~7 deg about the trunnion; mount stays plumb
    for (let i = gunFrom; i < parts.length; i++) {
      xform(parts[i].geo, 0, -H, 0);
      xform(parts[i].geo, 0, 0, 0, -7 * D2R, 0, 0);
      xform(parts[i].geo, 0, H, 0);
    }
    return parts;
  },

  // -- roof lights: IR searchlight (large/small) + convoy light ----------------
  light({ rng, v = 'ir_large' }) {
    const parts = [];
    const tone = 0.9 + rng() * 0.12;
    if (v === 'convoy') {
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.02, 0.024, 0.1, 6), 0, 0.05, 0), 0.55) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.045, 0.09, 8), 0, 0.13, 0.008), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(cylZ(0.038, 0.012, 8), 0, 0.13, 0.056), 1) });
      return parts;
    }
    const R = v === 'ir_large' ? 0.19 : 0.115;   // drum radius
    const D = v === 'ir_large' ? 0.30 : 0.19;    // drum depth
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.16, 0.035, 0.16), 0, 0.018, 0), tone) }); // base plate
    for (const s of [-1, 1]) { // yoke arms — stop at the drum axle line
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, R + 0.045, 0.045), s * (R + 0.014), (R + 0.045) / 2 + 0.02, 0), 0.55) });
    }
    parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(R, D, 14), 0, R + 0.07, -D * 0.18), tone) });            // drum
    parts.push({ mat: 'steel', geo: bakeShade(xform(torus(R * 0.99, 0.014, 14, 4), 0, R + 0.07, D * 0.32, Math.PI / 2, 0, 0), 0.55) }); // face rim
    parts.push({ mat: 'lens', geo: bakeShade(xform(cylZ(R * 0.93, 0.018, 14), 0, R + 0.07, D * 0.325), 1) });   // glass
    if (v === 'ir_large') { // cable conduit
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.012, 0.012, R + 0.05, 5), R + 0.04, (R + 0.05) / 2, 0.03), 0.5) });
    }
    return parts;
  },

  // -- antenna set: whip short/long, star command antenna, helmet gag ----------
  antenna({ rng, v = 'whip_short', helmet = false }) {
    const parts = [];
    parts.push({ mat: 'kit', geo: bakeShade(lathe([[0.045, 0], [0.05, 0.02], [0.03, 0.05], [0.022, 0.09]], 8), 0.85) });
    if (v === 'star') {
      const H = 1.15;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.008, 0.011, H, 5), 0, H / 2 + 0.08, 0), 0.5) });
      for (let i = 0; i < 6; i++) { // star tines
        const a = (i / 6) * Math.PI * 2;
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.004, 0.004, 0.34, 3), Math.sin(a) * 0.115, H + 0.06, Math.cos(a) * 0.115, Math.cos(a) * 0.62, 0, -Math.sin(a) * 0.62), 0.5) });
      }
    } else {
      const H = v === 'whip_long' ? 1.75 : 1.15;
      const lean = (rng() - 0.5) * 0.14;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.006, 0.012, H, 5), Math.sin(lean) * H * 0.4, H / 2 + 0.07, 0, 0, 0, lean), 0.5) });
      if (helmet) {
        parts.push({ mat: 'kit', geo: bakeTint(xform(sph(0.115, 9, 6), Math.sin(lean) * H * 0.78, H + 0.02, 0, 0, 0, 0, [1, 0.74, 1]), 0.55, 0.58, 0.42) });
      }
    }
    return parts;
  },

  // -- gunner's sight head / periscope hood ------------------------------------
  sight({ rng, v = 'peri' }) {
    const tone = 0.92 + rng() * 0.1;
    const parts = [];
    if (v === 'peri') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.14, 0.09, 0.12), 0, 0.045, 0), tone) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.12, 0.05, 0.10), 0, 0.112, -0.012, -14 * D2R), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.09, 0.028, 0.012), 0, 0.112, 0.05, -14 * D2R), 1) });
    } else { // 'doghouse' primary-sight hood
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.26, 0.14, 0.30), 0, 0.07, 0), tone) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.26, 0.09, 0.12), 0, 0.175, -0.07, -26 * D2R), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.18, 0.05, 0.014), 0, 0.10, 0.152), 1) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.28, 0.016, 0.02), 0, 0.148, 0.14), 0.6) }); // brow rail
    }
    return parts;
  },

  // -- add-on applique armor plate (bolted) -------------------------------------
  applique({ rng, v = 'rect', w = 0.9, h = 0.5 }) {
    const parts = [];
    const tone = 0.95 + rng() * 0.1;
    const t = 0.045;
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, t), 0, h / 2, t / 2), tone) });
    if (v === 'wedge') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w * 0.78, h * 0.7, t), 0, h * 0.42, t * 1.45), tone * 1.03) });
    }
    const bx = w / 2 - 0.06, by = h - 0.06;
    for (const [px, py] of [[-bx, 0.06], [bx, 0.06], [-bx, by], [bx, by], [0, by], [0, 0.06]]) {
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.016, 0.02, 6), px, py, t + 0.008), 0.58) });
    }
    return parts;
  },

  // -- smoke grenade launcher cluster: 4/6/8 tubes, angled, turret-side --------
  smoke({ rng, v = '6' }) {
    const n = parseInt(v, 10) || 6;
    const parts = [];
    const tone = 0.9 + rng() * 0.1;
    const rows = n > 6 ? 2 : 1;
    const per = Math.ceil(n / rows);
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(per * 0.082 + 0.06, 0.10, 0.06), 0, 0.05, -0.01), tone) }); // wedge bracket
    for (let i = 0; i < n; i++) {
      const row = (i / per) | 0;
      const k = i % per;
      const x = (k - (per - 1) / 2) * 0.082;
      const y = 0.115 + row * 0.078;
      const cant = (k - (per - 1) / 2) * 6 * D2R;   // fanned tubes
      const g = cylZ(0.032, 0.21, 8);
      xform(g, 0, 0, 0.075);                        // tube forward of its pivot
      // dark muzzle cap disc crisps the tube read at gameplay distance
      const cap = xform(cylZ(0.0335, 0.014, 8), 0, 0, 0.185);
      xform(g, 0, 0, 0, -34 * D2R, cant, 0);        // elevated + fanned
      xform(cap, 0, 0, 0, -34 * D2R, cant, 0);
      parts.push({ mat: 'kit', geo: bakeShade(xform(g, x, y, 0.02), tone * (0.94 + rng() * 0.1)) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cap, x, y, 0.02), 0.4) });
    }
    return parts;
  },

  // -- stowage boxes: wood crate / steel bin / long fender box ------------------
  bin({ rng, v = 'steel', w = 0.55, h = 0.28, d = 0.4 }) {
    const parts = [];
    if (v === 'crate') {
      parts.push({ mat: 'wood', geo: bakeShade(boxUV(xform(box(w, h, d), 0, h / 2, 0), 2.2), 0.9 + rng() * 0.2) });
      for (const sy of [0.14, 0.9]) { // batten frames
        parts.push({ mat: 'wood', geo: bakeShade(boxUV(xform(box(w + 0.022, 0.035, d + 0.022), 0, h * sy, 0), 2.2), 0.68) });
      }
    } else if (v === 'long') { // fender-length box with proud lid
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, d), 0, h / 2, 0), 0.94 + rng() * 0.1) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w * 1.012, 0.03, d * 1.03), 0, h + 0.012, 0), 1.04) });
      for (const fx of [-w * 0.32, w * 0.32]) { // hasp straps
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.03, h * 0.8, 0.012), fx, h * 0.45, d / 2 + 0.007), 0.6) });
      }
    } else { // steel bin, rounded lid + clasp
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h * 0.8, d), 0, h * 0.4, 0), 0.95 + rng() * 0.08) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylX(d * 0.49, w * 0.99, 10), 0, h * 0.8, 0), 1.03) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.03, 0.05), 0, h * 0.8 + d * 0.45, 0), 0.6) });
    }
    return parts;
  },

  // -- rolled tarp / canvas roll --------------------------------------------------
  tarp({ rng, v = 'fat', len = 0.9 }) {
    const parts = [];
    const R = v === 'fat' ? 0.125 : 0.085;
    const tone = 0.85 + rng() * 0.25;
    const body = boxUV(capX(R, len, 9), 2.6);
    const pos = body.attributes.position;  // sag the ends a touch
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, pos.getY(i) - Math.pow(Math.abs(x) / (len / 2 + 0.01), 2) * 0.02);
    }
    body.computeVertexNormals();
    parts.push({ mat: 'canvas', geo: bakeShade(xform(body, 0, R * 0.92, 0), tone) });
    for (const s of [-0.3, 0.3]) { // cinch straps
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.006, 0.011, 9, 4), s * len, R * 0.92, 0, 0, Math.PI / 2, 0), 0.42) });
    }
    return parts;
  },

  // -- camo netting: rolled bundle or draped flat patch ---------------------------
  camonet({ rng, v = 'roll', len = 1.0, w = 0.9 }) {
    const parts = [];
    if (v === 'roll') {
      const R = 0.135;
      const body = boxUV(capX(R, len, 9), 2.0);
      const pos = body.attributes.position;   // lumpy roll
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = 1 + 0.12 * Math.sin(x * 9.1 + 2) * Math.sin(y * 7 + z * 8);
        pos.setY(i, y * k); pos.setZ(i, z * k);
      }
      body.computeVertexNormals();
      parts.push({ mat: 'canvas', geo: bakeShade(xform(body, 0, R, 0), 0.6 + rng() * 0.1) });
      // net skin wrapped over the top half (open half-cylinder shell)
      const wrap = new THREE.CylinderGeometry(R + 0.012, R + 0.012, len * 0.94, 10, 1, true, -Math.PI / 2, Math.PI);
      xform(wrap, 0, 0, 0, 0, 0, Math.PI / 2);
      parts.push({ mat: 'net', geo: bakeShade(boxUV(xform(wrap, 0, R, 0), 1.8), 0.95) });
      for (const s of [-0.32, 0.02, 0.34]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.014, 0.01, 9, 4), s * len, R, 0, 0, Math.PI / 2, 0), 0.45) });
      }
    } else { // draped flat patch (alpha-tested sheet with sag + hang)
      const g = new THREE.PlaneGeometry(w, len, 7, 7);
      xform(g, 0, 0, 0, -Math.PI / 2, 0, 0);
      const pos = g.attributes.position;
      const seed = rng() * 10;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (len / 2));
        pos.setY(i, 0.06 + 0.05 * Math.sin(x * 6 + seed) * Math.cos(z * 5 - seed) - edge * edge * 0.11);
      }
      g.computeVertexNormals();
      parts.push({ mat: 'net', geo: bakeShade(boxUV(g, 1.4), 1.0 + rng() * 0.15, 0.12) });
    }
    return parts;
  },

  // -- unditching log (rear-strapped beam, axis X) ---------------------------------
  log({ rng, len = 2.4 }) {
    const parts = [];
    const R = 0.115;
    parts.push({ mat: 'wood', geo: bakeShade(boxUV(cylX(R, len, 9, R * 0.94), 2.0), 0.6 + rng() * 0.12) });
    for (const s of [-1, 1]) {
      parts.push({ mat: 'wood', geo: bakeShade(xform(cylX(R * 0.88, 0.03, 9), s * (len / 2 + 0.012), 0, 0), 0.95) }); // pale end cut
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.008, 0.013, 9, 4), s * len * 0.31, 0, 0, 0, Math.PI / 2, 0), 0.42) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.028, 0.10, 0.012), s * len * 0.31, -R * 0.5, R + 0.02), 0.42) }); // strap tail
    }
    return parts;
  },

  // -- soft stowage: rucksack / bedroll / duffel cluster -----------------------------
  packs({ rng, n = 3 }) {
    const parts = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const kind = rng();
      const tone = 0.52 + rng() * 0.34;
      if (kind < 0.4) {        // rucksack: squashed sphere + flap
        const w = 0.26 + rng() * 0.06, h = 0.3 + rng() * 0.07, d = 0.2;
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(sph(0.5), x, h * 0.42, 0, rng() * 0.5 - 0.2, rng(), 0, [w, h * 0.62, d]), 2.4), tone) });
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(box(w * 0.75, 0.06, d * 1.02), x, h * 0.6, 0, -0.3), 2.4), tone * 0.88) });
        x += w * 0.95;
      } else if (kind < 0.75) { // bedroll
        const len = 0.5 + rng() * 0.15;
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(capX(0.085, len, 8), x, 0.085, 0, 0, (rng() - 0.5) * 0.5, 0), 2.6), tone) });
        x += 0.26;
      } else {                  // duffel
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(capX(0.11, 0.42, 8), x, 0.11, 0.02, 0, rng() * 0.8, 0), 2.6), tone) });
        x += 0.3;
      }
    }
    xformParts(parts, -x / 2 + 0.12, 0, 0);
    return parts;
  },

  // -- turret bustle basket (rod frame + mesh + soft contents) -----------------------
  // Local frame: open face toward +Z (bolts to the bustle), extends -Z.
  basket({ rng, w = 1.2, d = 0.42, h = 0.34 }) {
    const parts = [];
    const rod = 0.016;
    const st = (geo) => parts.push({ mat: 'steel', geo: bakeShade(geo, 0.5 + rng() * 0.06) });
    for (const y of [h * 0.3, h]) {          // rails
      st(xform(cylX(rod, w, 5), 0, y, -d));
      for (const s of [-1, 1]) st(xform(cylZ(rod, d, 5), s * w / 2, y, -d / 2));
    }
    for (let i = 0; i <= 4; i++) {           // verticals on the outer face
      st(xform(cylY(rod * 0.9, rod * 0.9, h, 4), -w / 2 + (i / 4) * w, h / 2, -d));
    }
    for (const s of [-1, 1]) st(xform(cylY(rod * 0.9, rod * 0.9, h, 4), s * w / 2, h / 2, -d * 0.04));
    // floor + rear + side wire-grid panels
    parts.push({ mat: 'mesh', geo: bakeShade(boxUV(xform(new THREE.PlaneGeometry(w * 0.98, d * 0.94, 1, 1), 0, h * 0.31, -d / 2, -Math.PI / 2, 0, 0), 5.5), 0.85) });
    parts.push({ mat: 'mesh', geo: bakeShade(boxUV(xform(new THREE.PlaneGeometry(w * 0.98, h * 0.66, 1, 1), 0, h * 0.63, -d), 5.5), 0.85) });
    for (const s of [-1, 1]) {
      parts.push({ mat: 'mesh', geo: bakeShade(boxUV(xform(new THREE.PlaneGeometry(d * 0.92, h * 0.62, 1, 1), s * w / 2, h * 0.62, -d / 2, 0, Math.PI / 2, 0), 5.5), 0.85) });
    }
    // contents: soft lumps riding above the floor
    parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(sph(0.5), -w * 0.22, h * 0.62, -d * 0.55, 0.3, 0.5, 0, [0.36, 0.22, 0.3]), 2.4), 0.85 + rng() * 0.2) });
    parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(sph(0.5), w * 0.24, h * 0.60, -d * 0.5, -0.2, 0.9, 0, [0.32, 0.20, 0.26]), 2.4), 0.7 + rng() * 0.2) });
    parts.meta = { basket: true, w, d, h };
    return parts;
  },

  // -- tow cable run with end loops (axis X; slots lay it fore-aft) ------------------
  cable({ rng, len = 2.2, sag = 0.05 }) {
    const parts = [];
    const R = 0.032; // reads as a heavy wire rope at gameplay distance
    const pts = [];
    const seed = rng() * 6;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(
        (t - 0.5) * len,
        R + 0.012 + Math.abs(Math.sin(t * 7 + seed)) * 0.02,   // lazy over-clamp lie
        Math.sin(t * Math.PI) * sag + Math.sin(t * 11 + seed) * 0.012,
      ));
    }
    parts.push({ mat: 'steel', geo: bakeShade(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, R, 5, false), 0.46) });
    for (const s of [-1, 1]) { // swaged eye loops + ferrules
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.07, 0.024, 10, 5), s * (len / 2 + 0.07), R + 0.01, 0), 0.52) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.04, 0.11, 7), s * (len / 2 - 0.02), R + 0.012, 0), 0.55) });
    }
    for (const s of [-0.3, 0, 0.31]) { // hull clamp blocks
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.06, 0.06, 0.055), s * len, 0.03, 0), 0.72) });
    }
    return parts;
  },

  // -- spare track link run (built flat in the X/Y plane, +Z outward) -----------------
  tracks({ rng, n = 5, linkW = 0.42 }) {
    const parts = [];
    const pitch = 0.15;
    for (let i = 0; i < n; i++) {
      const y = (i - (n - 1) / 2) * pitch;
      // alternating tone + per-link cant so the run reads as LINKS, not a slab
      const tone = ((i % 2 ? 0.58 : 0.42) + rng() * 0.08) * 0.72;
      const cant = (rng() - 0.5) * 0.05;
      const from = parts.length;
      parts.push({ mat: 'steel', geo: bakeShade(box(linkW, pitch * 0.74, 0.055), tone) });
      // twin center guide horns
      for (const hx of [-linkW * 0.13, linkW * 0.13]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.045, 0.07, 0.055), hx, 0, 0.055), tone * 0.85) });
      }
      // grouser bar proud across the pad face
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(linkW * 0.98, 0.034, 0.024), 0, -pitch * 0.24, 0.038), tone * 1.3) });
      // end connectors (pin bosses) at both edges
      for (const s of [-1, 1]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.026, 0.026, pitch * 0.8, 6), s * (linkW / 2 - 0.02), 0, 0.012), tone * 1.15) });
      }
      xformParts(parts, 0, y, 0.028, 0, 0, cant, from);
    }
    parts.meta = { runH: n * pitch };
    return parts;
  },

  // -- pioneer tools on fender clamps (laid along +Z, fanned across X) ---------------
  tools({ rng, set = ['shovel', 'axe', 'crowbar'] }) {
    const parts = [];
    const wood = (geo, t = 1) => parts.push({ mat: 'wood', geo: bakeShade(geo, t) });
    const st = (geo, t = 0.55) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.05) });
    set.forEach((tool, idx) => {
      const lane = (idx - (set.length - 1) / 2) * 0.115;
      const from = parts.length;
      const tone = 0.68 + rng() * 0.16; // worn dull handles, never fresh lumber
      if (tool === 'shovel') {
        wood(xform(cylZ(0.016, 0.78, 5), 0, 0.03, 0), tone);
        st(xform(box(0.13, 0.02, 0.19), 0, 0.03, 0.45));
        st(xform(box(0.05, 0.028, 0.05), 0, 0.03, -0.42));
      } else if (tool === 'axe') {
        wood(xform(cylZ(0.015, 0.62, 5), 0, 0.03, 0), tone);
        st(xform(box(0.03, 0.05, 0.15), 0, 0.032, 0.30));
        st(xform(box(0.085, 0.045, 0.05), 0.02, 0.032, 0.33));
      } else if (tool === 'sledge') {
        wood(xform(cylZ(0.017, 0.7, 5), 0, 0.035, 0), tone);
        st(xform(box(0.07, 0.07, 0.14), 0, 0.035, 0.33));
      } else { // crowbar
        st(xform(cylZ(0.012, 0.75, 5), 0, 0.026, 0), 0.5);
        st(xform(cylZ(0.012, 0.09, 5), 0, 0.052, 0.37, 0.6), 0.5);
      }
      for (const cz of [-0.2, 0.24]) { // clamp blocks
        parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.05, 0.05, 0.035), 0, 0.026, cz), 0.88) });
      }
      xformParts(parts, lane, 0, (rng() - 0.5) * 0.1, 0, 0, 0, from);
    });
    return parts;
  },

  // -- tow hooks / shackles (bolted to a vertical plate, +Z outward) ------------------
  shackles({ rng, v = 'hook' }) {
    const parts = [];
    const tone = 0.55 + rng() * 0.1;
    if (v === 'hook') { // cast C-hook on a base plate
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.16, 0.16, 0.03), 0, 0, 0.015), 0.9) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.055, 0.022, 9, 5, Math.PI * 1.5), 0, -0.005, 0.075, 0, 0, -0.6), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.026, 0.06, 7), 0, 0.045, 0.045), tone) });
    } else { // D-shackle + pin through welded lugs
      for (const s of [-1, 1]) {
        parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.028, 0.09, 0.075), s * 0.05, 0, 0.038), 0.88) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.016, 0.15, 6), 0, 0.012, 0.075), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.05, 0.016, 9, 4, Math.PI), 0, -0.005, 0.075, 0, 0, Math.PI), tone) });
    }
    return parts;
  },

  // -- external fuel drums --------------------------------------------------------
  // twin: two longitudinal 200 L drums as one piece, brackets down (deck-seat).
  // single: one TRANSVERSE drum (axis X), rear-plate cantilever mount.
  drums({ rng, v = 'twin', _W = 0 }) {
    const parts = [];
    const R = 0.28, L = 0.85;
    const drum = (cx, transverse) => {
      const tone = 0.86 + rng() * 0.18;
      const body = transverse ? cylX(R, L, 14) : cylZ(R, L, 14);
      parts.push({ mat: 'kit', geo: bakeShade(xform(body, cx, 0, 0), tone) });
      for (const rz of [-L * 0.27, L * 0.27]) { // rolling ribs
        const rib = transverse
          ? xform(torusV(R + 0.011, 0.012, 14, 4), cx + rz, 0, 0, 0, Math.PI / 2, 0)
          : xform(torus(R + 0.011, 0.012, 14, 4), cx, 0, rz, Math.PI / 2, 0, 0);
        parts.push({ mat: 'kit', geo: bakeShade(rib, tone * 0.92) });
      }
      const bungAt = transverse ? [cx + L * 0.31, R * 0.86, 0.1] : [cx + R * 0.4, R * 0.86, L * 0.31];
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.035, 0.035, 0.03, 7), ...bungAt), 0.5) });
      // cradle brackets + straps
      for (const b of [-L * 0.3, L * 0.3]) {
        const strap = transverse
          ? xform(torusV(R + 0.014, 0.009, 12, 4, Math.PI), cx + b, 0, 0, 0, Math.PI / 2, 0)
          : xform(torus(R + 0.014, 0.009, 12, 4, Math.PI), cx, 0, b, Math.PI / 2, 0, 0);
        parts.push({ mat: 'steel', geo: bakeShade(strap, 0.42) });
        const bx = transverse ? cx + b : cx;
        const bz = transverse ? 0 : b;
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.06, R * 0.5, 0.05), bx, -R * 0.72, bz), 0.45) });
      }
    };
    if (v === 'twin') {
      const cx = _W ? Math.max(R + 0.07, _W / 2 - R - 0.16) : R + 0.07;
      drum(-cx, false);
      drum(cx, false);
      parts.metaCx = cx;
    } else {
      drum(0, true);
    }
    // rebase: piece origin at the BRACKET BASE (drum axis at +R) so slots
    // seat it like every other kit
    xformParts(parts, 0, R + 0.01, 0);
    parts.meta = { mount: v === 'twin' ? 'deck' : 'rearFace', centerY: R + 0.01, clearY: R };
    return parts;
  },

  // -- jerrycan rack (fuel tan / water green) ---------------------------------------
  jerry({ rng, n = 3, water = true }) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.20;
      const isWater = water && i === n - 1;
      const tint = isWater ? [0.24, 0.30, 0.22] : [0.45, 0.37, 0.24];
      parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.17, 0.44, 0.33), x, 0.22, 0), ...tint) });
      for (const s of [-1, 1]) { // X-stamp ribs
        parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.012, 0.36, 0.05), x + s * 0.086, 0.21, 0, 38 * D2R), tint[0] * 1.08, tint[1] * 1.08, tint[2] * 1.08) });
        parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.012, 0.36, 0.05), x + s * 0.086, 0.21, 0, -38 * D2R), tint[0] * 1.08, tint[1] * 1.08, tint[2] * 1.08) });
      }
      for (const h of [-0.05, 0, 0.05]) { // triple handles
        parts.push({ mat: 'cans', geo: bakeTint(xform(cylZ(0.011, 0.12, 4), x, 0.465, h), tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9) });
      }
      parts.push({ mat: 'cans', geo: bakeTint(xform(cylY(0.028, 0.028, 0.05, 6), x - 0.05, 0.46, -0.11), tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8) }); // spout
    }
    const W = n * 0.20 + 0.06; // rack frame
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.03, 0.4), 0, 0.015, 0), 0.5) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.05, 0.02), 0, 0.28, -0.18), 0.5) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.05, 0.02), 0, 0.28, 0.18), 0.5) });
    for (const sx of [-1, 1]) { // diagonal braces back to the hull plate
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.025, 0.3, 0.025), sx * W * 0.42, 0.13, -0.19, 0.6, 0, 0), 0.45) });
    }
    return parts;
  },

  // -- spare road wheel (radius matched to the tank's own gear) -----------------------
  wheel({ rng, r = 0.31, flat = true, rubberRim = true }) {
    const parts = [];
    const W = Math.max(0.14, r * 0.42);
    const rimR = r * (rubberRim ? 0.8 : 0.95);
    parts.push({
      mat: 'kit',
      geo: bakeShade(lathe([
        [0.05, 0.005], [0.05, W * 0.3], [r * 0.35, W * 0.34], [r * 0.55, W * 0.16],
        [rimR, W * 0.42], [rimR, W * 0.9], [r * 0.4, W], [0.05, W],
      ], 16), 0.9 + rng() * 0.12),
    });
    if (rubberRim) {
      parts.push({ mat: 'rubber', geo: bakeShade(xform(cylY(r, r, W * 0.7, 16), 0, W * 0.6, 0), 1) });
    }
    for (let i = 0; i < 6; i++) { // hub bolts
      const a = (i / 6) * Math.PI * 2;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.02, 0.02, 0.03, 5), Math.sin(a) * r * 0.2, W + 0.008, Math.cos(a) * r * 0.2), 0.55) });
    }
    if (!flat) xformParts(parts, 0, r, -W / 2, Math.PI / 2, 0, 0); // upright against a plate
    return parts;
  },

  // -- exhaust shroud / muffler (axis Z along the fender) ------------------------------
  exhaust({ rng, v = 'muffler', len = 0.9 }) {
    const parts = [];
    const tone = 0.7 + rng() * 0.15; // heat-scorched paint
    if (v === 'muffler') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.105, len, 12), 0, 0.105, 0), tone * 0.82) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.042, 0.22, 7), 0.015, 0.12, -len / 2 - 0.06, 0.5, 0, 0), 0.42) }); // tail kick
      for (const s of [-0.3, 0.3]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.11, 0.01, 12, 4), 0, 0.105, s * len, Math.PI / 2, 0, 0), 0.4) });
      }
    } else { // perforated heat shield over a pipe
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.07, len, 9), 0, 0.09, 0), 0.4) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.105, len * 0.92, 9), 0, 0.105, 0), tone) });
      for (const s of [-0.25, 0.25]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, 0.09, 0.03), 0.1, 0.05, s * len), 0.45) });
      }
    }
    return parts;
  },

  // -- sandbag applique (glacis stack) ---------------------------------------------
  sandbags({ rng, rows = 2, perRow = 4, w = 1.2 }) {
    const parts = [];
    for (let r = 0; r < rows; r++) {
      const n = perRow - (r % 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (w / perRow);
        const tone = 0.78 + rng() * 0.3;
        const g = sph(0.5, 8, 5);
        xform(g, 0, 0, 0, 0, 0, (rng() - 0.5) * 0.4, [w / perRow * 0.6, 0.105, 0.21]);
        parts.push({ mat: 'burlap', geo: bakeShade(boxUV(xform(g, x, 0.085 + r * 0.14, -r * 0.055), 2.8), tone) });
      }
    }
    return parts;
  },

  // -- welded patch plate (+Z outward) ------------------------------------------------
  patch({ rng, w = 0.5, h = 0.4 }) {
    const parts = [];
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, 0.024), 0, 0, 0.012), 1.03 + rng() * 0.06) });
    const bead = 0.016;
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(bead, w + 0.02, 5), 0, h / 2, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(bead, w + 0.02, 5), 0, -h / 2, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(bead, bead, h + 0.02, 5), w / 2, 0, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(bead, bead, h + 0.02, 5), -w / 2, 0, 0.022), 0.72) });
    return parts;
  },

  // -- slat / wire-mesh standoff armor section (modern; faces +Z, struts -Z) -----------
  slat({ rng, w = 1.5, h = 0.55, mesh = false }) {
    const parts = [];
    const frame = 0.02;
    const st = (geo, t = 0.55) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.05) });
    st(xform(box(w, frame * 1.7, frame * 1.7), 0, h / 2, 0));
    st(xform(box(w, frame * 1.7, frame * 1.7), 0, -h / 2, 0));
    st(xform(box(frame * 1.7, h, frame * 1.7), -w / 2, 0, 0));
    st(xform(box(frame * 1.7, h, frame * 1.7), w / 2, 0, 0));
    if (mesh) {
      parts.push({ mat: 'mesh', geo: bakeShade(boxUV(new THREE.PlaneGeometry(w * 0.97, h * 0.94, 1, 1), 5.5), 0.85) });
    } else {
      const n = Math.max(5, Math.round(w / 0.115));
      for (let i = 1; i < n; i++) {
        st(xform(box(0.016, h * 0.94, 0.05), -w / 2 + (i / n) * w, 0, 0), 0.6);
      }
    }
    for (const s of [-0.38, 0.38]) { // standoff struts toward the hull
      st(xform(cylZ(0.016, 0.3, 5), s * w, 0, -0.16), 0.5);
    }
    return parts;
  },

  // -- barrel travel lock, stowed folded on the deck -----------------------------------
  travelLock({ rng }) {
    const parts = [];
    const tone = 0.9 + rng() * 0.1;
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.14, 0.06, 0.12), 0, 0.03, 0), tone) });
    for (const s of [-1, 1]) { // folded A-frame arms lying aft
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.024, 0.52, 7), s * 0.06, 0.075, -0.28, 0, s * 0.12, 0), tone) });
    }
    parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.055, 0.015, 9, 4, Math.PI), 0, 0.06, -0.52, 0, 0, Math.PI), 0.55) }); // saddle claw
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.015, 0.13, 5), 0, 0.05, 0.03), 0.55) });
    return parts;
  },

  // -- ration / small-stores box stack ---------------------------------------------------
  rations({ rng, n = 2 }) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const w = 0.34 - i * 0.04;
      parts.push({
        mat: 'wood',
        geo: bakeShade(boxUV(xform(box(w, 0.14, 0.24), (rng() - 0.5) * 0.05, 0.07 + i * 0.142, (rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.3, 0), 2.6), 0.86 + rng() * 0.2),
      });
    }
    return parts;
  },

  // -- bucket hung on a rear hook ---------------------------------------------------------
  bucket({ rng }) {
    const parts = [];
    parts.push({ mat: 'steel', geo: bakeShade(lathe([[0.075, 0], [0.09, 0.02], [0.115, 0.20], [0.105, 0.21], [0.088, 0.205]], 11), 0.62 + rng() * 0.1) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.1, 0.007, 10, 4, Math.PI), 0, 0.21, 0), 0.5) }); // bail up
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, 0.06, 0.014), 0, 0.30, 0.02), 0.5) });          // hook tab
    return parts;
  },

  // -- chain segment hanging off a bow shackle --------------------------------------------
  chain({ rng, links = 6 }) {
    const parts = [];
    for (let i = 0; i < links; i++) {
      const y = -i * 0.05;
      parts.push({
        mat: 'steel',
        geo: bakeShade(xform(torusV(0.026, 0.008, 8, 4), (rng() - 0.5) * 0.006, y, 0, 0, i % 2 ? Math.PI / 2 : 0, 0), 0.5),
      });
    }
    return parts;
  },
};

// Kit metadata for the catalog board / docs (era tags + variant lists).
export const DECOR_KIT_INFO = {
  cupola: { label: "Commander's cupola ring", eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'ring' }, { v: 'drum' }, { v: 'split' }] },
  hatch: { label: 'Hatch cover w/ hinges', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'round' }, { v: 'rect' }] },
  aamg: { label: 'Roof AA MG', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'm2' }, { v: 'm2', shield: true }, { v: 'dshk' }, { v: 'dshk', ring: true }] },
  light: { label: 'Roof light', eras: ['coldwar', 'modern'], variants: [{ v: 'ir_large' }, { v: 'ir_small' }, { v: 'convoy' }] },
  antenna: { label: 'Antenna set', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'whip_short' }, { v: 'whip_long' }, { v: 'star' }, { v: 'whip_short', helmet: true }] },
  sight: { label: 'Sight head / periscope', eras: ['coldwar', 'modern'], variants: [{ v: 'peri' }, { v: 'doghouse' }] },
  applique: { label: 'Add-on armor plate', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'rect' }, { v: 'wedge' }] },
  smoke: { label: 'Smoke launcher cluster', eras: ['coldwar', 'modern'], variants: [{ v: '4' }, { v: '6' }, { v: '8' }] },
  bin: { label: 'Stowage box', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'crate' }, { v: 'steel' }, { v: 'long', w: 1.1, h: 0.24, d: 0.3 }] },
  tarp: { label: 'Rolled tarp / canvas', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'fat' }, { v: 'thin' }] },
  camonet: { label: 'Camo net bundle', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'roll' }, { v: 'drape' }] },
  log: { label: 'Unditching log', eras: ['ww2', 'coldwar'], variants: [{}] },
  packs: { label: 'Rucksacks / bedrolls', eras: ['ww2', 'coldwar', 'modern'], variants: [{ n: 2 }, { n: 3 }, { n: 4 }] },
  basket: { label: 'Bustle basket', eras: ['ww2', 'coldwar', 'modern'], variants: [{ w: 1.0 }, { w: 1.3 }] },
  cable: { label: 'Tow cable', eras: ['ww2', 'coldwar', 'modern'], variants: [{ len: 1.8 }, { len: 2.6 }] },
  tracks: { label: 'Spare track links', eras: ['ww2', 'coldwar', 'modern'], variants: [{ n: 4 }, { n: 6 }] },
  tools: { label: 'Pioneer tools', eras: ['ww2', 'coldwar', 'modern'], variants: [{ set: ['shovel', 'axe'] }, { set: ['shovel', 'sledge', 'crowbar'] }] },
  shackles: { label: 'Tow hooks / shackles', eras: ['ww2', 'coldwar', 'modern'], variants: [{ v: 'hook' }, { v: 'shackle' }] },
  drums: { label: 'External fuel drums', eras: ['ww2', 'coldwar'], variants: [{ v: 'single' }, { v: 'twin' }] },
  jerry: { label: 'Jerrycan rack', eras: ['ww2', 'coldwar', 'modern'], variants: [{ n: 2 }, { n: 3 }] },
  wheel: { label: 'Spare road wheel', eras: ['ww2', 'coldwar'], variants: [{ flat: true }, { flat: false }] },
  exhaust: { label: 'Exhaust shroud / muffler', eras: ['ww2', 'coldwar'], variants: [{ v: 'muffler' }, { v: 'shield' }] },
  sandbags: { label: 'Sandbag applique', eras: ['ww2'], variants: [{ rows: 2 }, { rows: 3, perRow: 5 }] },
  patch: { label: 'Welded patch plate', eras: ['ww2', 'coldwar'], variants: [{}] },
  slat: { label: 'Slat / mesh armor section', eras: ['modern'], variants: [{ mesh: false }, { mesh: true }] },
  travelLock: { label: 'Barrel travel lock (stowed)', eras: ['coldwar', 'modern'], variants: [{}] },
  rations: { label: 'Ration box stack', eras: ['ww2', 'coldwar', 'modern'], variants: [{ n: 2 }] },
  bucket: { label: 'Bucket', eras: ['ww2', 'coldwar'], variants: [{}] },
  chain: { label: 'Chain segment', eras: ['ww2', 'coldwar', 'modern'], variants: [{ links: 6 }] },
};

// ---------------------------------------------------------------------------
// ERA + MANIFESTS
// ---------------------------------------------------------------------------

// Cold-war override set (specs only carry ww2|modern; these ids read as the
// transitional generation: IR searchlights, DShK/M2 AA mounts, drums on the
// Soviet school).
const COLDWAR_IDS = new Set([
  'm60a1', 'm60a3', 'm48', 't54', 't55', 't62', 'type59', 'centurion3',
  'centurion5', 'centurion', 'chieftain5', 'chieftain_mk10', 'charioteer',
  'leo1a5', 'type74', 't80u', 'amx30', 'm103', 'conqueror', 'is7',
  'object279', 'is6b', 'strv103', 'strv103a', 'challenger1',
]);

export function decorEra(spec) {
  if (COLDWAR_IDS.has(spec.id)) return 'coldwar';
  return spec.era === 'modern' ? 'modern' : 'ww2';
}

const SOVIET_RE = /USSR|Russia|China/i;
const US_RE = /USA/i;

// Slot grammar (resolved by the placement engine):
//   rearDeck | fender | glacis | glacisLow | hullSideTop | hullSide |
//   hullRear (drums) | hullRearLow | hullRearHang | hullRearCage | bowPair |
//   bowChain | turretRoof | turretRear | turretRearFrame | turretSide |
//   turretSidePlate | turretCheekPair
// Entries: { kit, p:probability, v:params, slot:[name, args] }. `p` rolls are
// drawn deterministically IN ORDER for every entry whether or not the piece
// lands, so one skip never reshuffles the rest of the tank.
function defaultManifest(spec, rng) {
  const era = decorEra(spec);
  const sov = SOVIET_RE.test(spec.nation || '');
  const us = US_RE.test(spec.nation || '');
  const casemate = !!(spec.armor && spec.armor.turretless);
  const M = [];

  // ---- turret / roof kit ----
  if (!casemate) {
    M.push({ kit: 'packs', p: 0.85, v: { n: 2 + ((rng() * 2) | 0) }, slot: ['turretRear', {}] });
    M.push({ kit: 'tarp', p: 0.6, v: { v: rng() < 0.5 ? 'fat' : 'thin', len: 0.7 }, slot: ['turretSide', { side: rng() < 0.5 ? -1 : 1 }] });
    M.push({ kit: 'antenna', p: 0.9, v: { v: rng() < 0.25 && era !== 'ww2' ? 'whip_long' : 'whip_short', helmet: us && era === 'ww2' && rng() < 0.18 }, slot: ['turretRoof', { rear: true, side: 1 }] });
    if (era !== 'ww2') {
      M.push({ kit: 'smoke', p: 0.75, v: { v: rng() < 0.4 ? '4' : '6' }, slot: ['turretCheekPair', {}] });
      M.push({ kit: 'aamg', p: era === 'coldwar' ? 0.75 : 0.5, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.4, ring: !sov && rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
      M.push({ kit: 'light', p: 0.35, v: { v: 'ir_small' }, slot: ['turretRoof', { rear: false, side: 1 }] });
    } else {
      M.push({ kit: 'aamg', p: us ? 0.65 : 0.2, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
      M.push({ kit: 'hatch', p: 0.4, v: { v: rng() < 0.6 ? 'round' : 'rect' }, slot: ['turretRoof', { rear: false, side: -1 }] });
    }
    M.push({ kit: 'tracks', p: era === 'ww2' ? 0.5 : 0.3, v: { n: 4, linkW: Math.min(0.5, spec.dims.widthM * 0.13) }, slot: ['turretSidePlate', { side: -1 }] });
    M.push({ kit: 'camonet', p: 0.45, v: { v: 'roll', len: 0.9 }, slot: ['turretRear', { low: true }] });
  } else {
    M.push({ kit: 'antenna', p: 0.9, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] });
    M.push({ kit: 'aamg', p: era === 'ww2' ? 0.35 : 0.7, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.5 }, slot: ['turretRoof', { rear: true, side: -1 }] });
    M.push({ kit: 'packs', p: 0.8, v: { n: 2 }, slot: ['rearDeck', { spread: 0.4 }] });
    M.push({ kit: 'camonet', p: 0.5, v: { v: 'roll', len: 1.1 }, slot: ['rearDeck', {}] });
    // fixed-bore vehicles: the rear deck sits outside any gun sweep — the
    // stowed travel lock is period kit on long-gun TDs
    M.push({ kit: 'travelLock', p: 0.6, v: {}, slot: ['rearDeck', { center: true, back: true, small: true }] });
  }

  // ---- hull kit ----
  M.push({ kit: 'cable', p: 0.85, v: { len: Math.min(2.6, spec.dims.hullLengthM * 0.36) }, slot: ['hullSideTop', { side: 1 }] });
  M.push({ kit: 'bin', p: 0.8, v: { v: era === 'ww2' ? 'crate' : 'long', w: era === 'ww2' ? 0.55 : 0.9, h: 0.24, d: 0.34 }, slot: ['fender', { side: -1, zFrac: -0.25 }] });
  M.push({ kit: 'tools', p: 0.75, v: { set: rng() < 0.5 ? ['shovel', 'axe'] : ['shovel', 'sledge', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.1, along: true }] });
  M.push({ kit: 'jerry', p: era === 'ww2' ? 0.6 : 0.45, v: { n: 2 + (rng() < 0.4 ? 1 : 0) }, slot: ['rearDeck', { corner: 1 }] });
  M.push({ kit: 'tarp', p: 0.7, v: { v: 'fat', len: Math.min(1.2, spec.dims.widthM * 0.35) }, slot: ['rearDeck', { corner: -1 }] });
  M.push({ kit: 'shackles', p: 0.9, v: { v: rng() < 0.5 ? 'hook' : 'shackle' }, slot: ['bowPair', {}] });
  M.push({ kit: 'tracks', p: era === 'ww2' ? 0.6 : 0.4, v: { n: 5, linkW: Math.min(0.5, spec.dims.widthM * 0.14) }, slot: ['glacis', {}] });
  if (sov && era !== 'modern') {
    M.push({ kit: 'drums', p: 0.75, v: { v: rng() < 0.6 ? 'twin' : 'single' }, slot: ['hullRear', {}] });
    M.push({ kit: 'log', p: 0.6, v: { len: Math.min(2.8, spec.dims.widthM * 0.82) }, slot: ['hullRearLow', {}] });
  } else {
    M.push({ kit: 'wheel', p: 0.4, v: {}, slot: ['rearDeck', { corner: 1, back: true }] });
  }
  if (us && era === 'ww2') {
    M.push({ kit: 'sandbags', p: 0.45, v: { rows: 2, perRow: 4, w: spec.dims.widthM * 0.5 }, slot: ['glacisLow', {}] });
  }
  if (era === 'modern') {
    M.push({ kit: 'camonet', p: 0.4, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] });
    M.push({ kit: 'bin', p: 0.5, v: { v: 'steel', w: 0.5, h: 0.3, d: 0.4 }, slot: ['rearDeck', { corner: -1, back: true }] });
    M.push({ kit: 'applique', p: 0.3, v: { v: 'rect', w: 0.8, h: 0.42 }, slot: ['hullSide', { side: 1, zFrac: -0.05 }] });
  }
  M.push({ kit: 'bucket', p: era === 'modern' ? 0.15 : 0.35, v: {}, slot: ['hullRearHang', {}] });
  M.push({ kit: 'rations', p: 0.35, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] });
  M.push({ kit: 'chain', p: 0.3, v: { links: 5 }, slot: ['bowChain', {}] });
  return M;
}

// Curated per-tank manifests: marquee/composition tanks get an authored,
// period-documented loadout replacing the era default. Fleet profile agents
// may REQUEST changes here (docs/DECORATIONS.md carries the ask process) —
// this table is decorations-owned.
const TANK_MANIFESTS = {
  // --- WW2 ---
  tiger1: () => [
    { kit: 'cable', p: 1, v: { len: 2.7, sag: 0.05 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7, sag: 0.04 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.52 }, slot: ['glacis', {}] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.05, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'long', w: 1.15, h: 0.22, d: 0.3 }, slot: ['fender', { side: -1, zFrac: -0.2 }] },
    // Tiger's full-width flat roof sits barely under the -6.5° rear sweep:
    // tall kit hangs LOW on the rear plate, soft kit lies on the fender line
    { kit: 'jerry', p: 1, v: { n: 3, water: false }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['fender', { side: -1, zFrac: -0.38 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'hatch', p: 1, v: { v: 'round' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'bucket', p: 1, v: {}, slot: ['hullRearHang', {}] },
    { kit: 'patch', p: 1, v: { w: 0.45, h: 0.4 }, slot: ['hullSide', { side: -1, zFrac: 0.15 }] },
    { kit: 'tracks', p: 1, v: { n: 3, linkW: 0.5 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 3, linkW: 0.5 }, slot: ['turretSidePlate', { side: -1 }] },
  ],
  t34_85: () => [
    { kit: 'drums', p: 1, v: { v: 'single' }, slot: ['hullRear', {}] },
    { kit: 'log', p: 1, v: { len: 2.5 }, slot: ['hullRearLow', {}] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.55, h: 0.3, d: 0.42 }, slot: ['fender', { side: -1, zFrac: -0.3 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.5, h: 0.26, d: 0.4 }, slot: ['fender', { side: 1, zFrac: -0.35 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.2, along: true }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.5 }, slot: ['glacis', { side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 0.9 }, slot: ['turretSide', { side: -1 }] },
  ],
  m4a3e8: (s, rng) => [
    { kit: 'sandbags', p: 1, v: { rows: 2, perRow: 4, w: 1.5 }, slot: ['glacisLow', {}] },
    { kit: 'aamg', p: 1, v: { v: 'm2' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', {}] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.0 }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'jerry', p: 1, v: { n: 3 }, slot: ['hullRearRack', { x: -0.16 }] },
    { kit: 'cable', p: 1, v: { len: 2.0 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.0, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.55, h: 0.26, d: 0.4 }, slot: ['fender', { side: 1, zFrac: 0.3 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.42 }, slot: ['hullSide', { side: -1, zFrac: 0.3 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short', helmet: rng() < 0.5 }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true, back: true }] },
  ],
  kv2: () => [
    { kit: 'drums', p: 1, v: { v: 'single' }, slot: ['hullRear', {}] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.6, h: 0.3, d: 0.45 }, slot: ['fender', { side: 1, zFrac: -0.3 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.2 }, slot: ['fender', { side: -1, zFrac: -0.25 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', {}] },
    { kit: 'tools', p: 1, v: { set: ['sledge', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.25, along: true }] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'hatch', p: 1, v: { v: 'round' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'bucket', p: 1, v: {}, slot: ['hullRearHang', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.2 }, slot: ['turretSide', { side: -1 }] },
  ],
  isu152: () => [
    { kit: 'drums', p: 1, v: { v: 'twin' }, slot: ['hullRear', {}] },
    { kit: 'log', p: 1, v: { len: 2.7 }, slot: ['hullRearLow', {}] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', { side: -1 }] },
    { kit: 'aamg', p: 1, v: { v: 'dshk', ring: true }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['rearDeck', { spread: 0.5 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.1 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.1, along: true }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['rearDeck', { corner: 1 }] },
  ],
  // --- Cold war ---
  m60a1: () => [
    { kit: 'aamg', p: 1, v: { v: 'm2', shield: true }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'basket', p: 1, v: { w: 1.35, d: 0.4, h: 0.32 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: 0.17 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: -1, zFrac: 0.05, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'long', w: 1.0, h: 0.22, d: 0.3 }, slot: ['fender', { side: 1, zFrac: -0.25 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'tarp', p: 1, v: { v: 'thin', len: 0.8 }, slot: ['rearDeck', { center: true, back: true, small: true }] },
  ],
  is7: () => [
    { kit: 'aamg', p: 1, v: { v: 'dshk', ring: true }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', {}] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.1 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.15, along: true }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: false, side: -1 }] },
  ],
  type74: () => [
    { kit: 'aamg', p: 1, v: { v: 'm2' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'smoke', p: 1, v: { v: '6' }, slot: ['turretCheekPair', {}] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  // --- Modern ---
  leo2a4: () => [
    // Dense field camouflage uses equipment-like fabric geometry only:
    // three tied rolls and two armor-hugging open-mesh side veils.
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.70 }, slot: ['turretRear', { low: true }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.45 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.45 }, slot: ['turretSide', { side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.80, w: 1.05 }, slot: ['turretVeil', { side: 1 }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.80, w: 1.05 }, slot: ['turretVeil', { side: -1 }] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.5 }, slot: ['hullSideTop', { side: 1 }] },
  ],
  leo2a6: () => [
    { kit: 'basket', p: 1, v: { w: 1.5, d: 0.4, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.15, w: 0.95 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.55, h: 0.3, d: 0.4 }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: -0.17 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  k2: (s) => [
    { kit: 'basket', p: 1, v: { w: 1.3, d: 0.38, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.0, w: 0.85 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.5, h: 0.28, d: 0.38 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.44 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'slat', p: 1, v: { w: Math.min(1.7, s.dims.widthM * 0.5), h: 0.5 }, slot: ['hullRearCage', {}] },
  ],
  m1a2: () => [
    { kit: 'basket', p: 1, v: { w: 1.4, d: 0.42, h: 0.32 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.1 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  m1a2_tusk: () => [
    // Urban hard kit only: no foliage or grass-like camouflage geometry.
    { kit: 'basket', p: 1, v: { w: 1.75, d: 0.48, h: 0.36 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 5 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.70, h: 0.36, d: 0.48 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: -1, zFrac: -0.05, along: true }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: 1 }] },
    { kit: 'rations', p: 1, v: { n: 3 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  m1a2_sepv2: () => [
    { kit: 'basket', p: 1, v: { w: 1.65, d: 0.46, h: 0.35 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.66, h: 0.34, d: 0.46 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.12, along: true }] },
  ],
  m1a2_sepv3: () => [
    { kit: 'basket', p: 1, v: { w: 1.70, d: 0.47, h: 0.35 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.72, h: 0.35, d: 0.48 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.10, along: true }] },
    { kit: 'rations', p: 1, v: { n: 3 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  t90m: () => [
    { kit: 'log', p: 1, v: { len: 2.6 }, slot: ['hullRearLow', {}] },
    { kit: 'drums', p: 1, v: { v: 'twin' }, slot: ['hullRear', {}] },
    { kit: 'cable', p: 1, v: { len: 2.3 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.5, h: 0.26, d: 0.36 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
  ],
};

/** Resolve the manifest rows for one spec (curated table or era default). */
export function decorManifestFor(spec, rng) {
  const curated = TANK_MANIFESTS[spec.id];
  return curated ? curated(spec, rng) : defaultManifest(spec, rng);
}

// ---------------------------------------------------------------------------
// PLACEMENT ENGINE
// ---------------------------------------------------------------------------

const DECOR_LOD_DIST = 150; // same greeble horizon tankFactory uses
const GEAR_NAME_RE = /wheel|sprocket|idler|roller|road|track|tread/i;

// probe target collector: visible, color-writing, non-instanced meshes under
// `group`, excluding running gear (by name), decor itself, and LOD levels > 0.
function probeTargets(group) {
  const out = [];
  group.updateWorldMatrix(true, false);
  const visit = (o) => {
    if (o.visible === false) return;
    if (o.name && o.name.startsWith('rig_decor')) return;
    if (o.isLOD) { if (o.levels.length && o.levels[0].object) visit(o.levels[0].object); return; }
    if (o.isMesh && !o.isInstancedMesh && o.geometry) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.colorWrite !== false && !GEAR_NAME_RE.test(o.name || '')) out.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of group.children) visit(c);
  for (const o of out) o.updateWorldMatrix(true, false);
  return out;
}

function makeProber(group, targets) {
  const ray = new THREE.Raycaster();
  ray.far = 80;
  const orig = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const hitLocal = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const nrm = new THREE.Vector3();
  const nm3 = new THREE.Matrix3();
  function cast(oLocal, dLocal) {
    group.updateWorldMatrix(true, false);
    inv.copy(group.matrixWorld).invert();
    orig.copy(oLocal).applyMatrix4(group.matrixWorld);
    dir.copy(dLocal).transformDirection(group.matrixWorld);
    ray.set(orig, dir);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    hitLocal.copy(h.point).applyMatrix4(inv);
    if (h.face) {
      nm3.getNormalMatrix(h.object.matrixWorld);
      nrm.copy(h.face.normal).applyMatrix3(nm3).normalize(); // -> world
      nrm.transformDirection(inv);                            // -> group local
    } else nrm.set(0, 1, 0);
    return { p: hitLocal.clone(), n: nrm.clone(), dist: h.distance };
  }
  return {
    top(x, z, fromY) { return cast(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)); },
    side(y, z, side, fromX) { return cast(new THREE.Vector3(fromX * side, y, z), new THREE.Vector3(-side, 0, 0)); },
    zface(x, y, dirZ, fromZ) { return cast(new THREE.Vector3(x, y, fromZ), new THREE.Vector3(0, 0, dirZ)); },
  };
}

// 5-point footprint seat: MAX height wins (nothing sinks into slots), spread
// rejects occupied/steep surfaces (this is the greeble de-dupe: an existing
// searchlight/periscope in the footprint blows the spread and the slot walks
// on). Returns { y, n, spread } or null.
function seatProbe(prober, cx, cz, w, d, fromY, maxSpread = 0.16) {
  const pts = [[0, 0], [-w * 0.4, -d * 0.4], [w * 0.4, -d * 0.4], [-w * 0.4, d * 0.4], [w * 0.4, d * 0.4]];
  let top = -Infinity, bot = Infinity;
  let n = null;
  for (const [dx, dz] of pts) {
    const h = prober.top(cx + dx, cz + dz, fromY);
    if (!h) return null;
    if (h.p.y > top) { top = h.p.y; n = h.n; }
    if (h.p.y < bot) bot = h.p.y;
  }
  if (top - bot > maxSpread) return null;
  return { y: top, n, spread: top - bot };
}

// piece record for guard bookkeeping: local-frame AABB after placement.
function placedBox(parts, pos, rot) {
  const bb = partsBBox(parts);
  const m = new THREE.Matrix4().compose(
    pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1),
  );
  const out = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
    out.expandByPoint(v.set(x, y, z).applyMatrix4(m));
  }
  return out;
}

// per-part placed boxes (gun-guard granularity: no empty-corner false hits)
function placedPartBoxes(parts, pos, rot) {
  const m = new THREE.Matrix4().compose(
    pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1),
  );
  const v = new THREE.Vector3();
  return parts.map((p) => {
    p.geo.computeBoundingBox();
    const b = p.geo.boundingBox;
    const out = new THREE.Box3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      out.expandByPoint(v.set(x, y, z).applyMatrix4(m));
    }
    return out;
  });
}

function clonePartList(parts) {
  return parts.map((p) => ({ mat: p.mat, geo: p.geo.clone() }));
}
function disposePartList(parts) {
  for (const p of parts) p.geo.dispose();
}

/**
 * Attach the decoration kit to a built tank visual.
 *
 * Called by tankFactory's seam (procedural tanks: at build; GLB tanks: after
 * the model swap so anchors probe the REAL rendered geometry). Idempotent per
 * root. Never throws — cosmetics must not take down a build.
 *
 * @param {object} a
 * @param {THREE.Object3D} a.root   tank root (rig groups' parent)
 * @param {THREE.Group} a.hullG     rig_hull
 * @param {THREE.Group} a.turretG   rig_turret
 * @param {object}      a.spec      TankSpec
 * @param {?object}     a.engineCtx EngineCtx
 * @param {Array}       a.disposables tankFactory's disposal list (decor
 *                                  geometry + materials die with the visual)
 * @param {{proceduralOnly?:boolean, decor?:boolean}} [a.opts]
 * @param {() => boolean} [a.isDestroyed] live-wreck guard (never dress a wreck)
 * @returns {?object} summary { pieces, tris, drawCalls, skipped } or null
 */
export function attachTankDecorations(a) {
  const { root, hullG, turretG, spec, engineCtx, disposables = [], opts = {} } = a;
  try {
    if (!root || root.userData.__decorApplied) return null;
    if (!resolveDecorMode(opts, engineCtx)) return null;
    if (a.isDestroyed && a.isDestroyed()) return null;
    root.userData.__decorApplied = true;

    const rng = mulberry32(fnv1a(`decor:${spec.id}`));
    const mats = buildDecorMaterials(spec, engineCtx);
    const dims = spec.dims;
    const armor = spec.armor;
    const W = dims.widthM, H = dims.heightM;
    const L = dims.hullLengthM || dims.overallLengthM * 0.8;
    const pivot = armor.turretPivot;
    const casemate = !!armor.turretless;

    // --- probers over the real geometry -----------------------------------
    const hullTargets = probeTargets(hullG);
    const turretTargets = probeTargets(turretG);
    if (!hullTargets.length && !turretTargets.length) return null;
    const hullP = makeProber(hullG, hullTargets.length ? hullTargets : turretTargets);
    const turP = makeProber(turretG, turretTargets.length ? turretTargets : hullTargets);

    // --- guard precomputation ---------------------------------------------
    // Turret swept annulus + PER-RADIAL-BAND lowest turret surface: the
    // mantlet hangs low near the ring while the bustle bottom rides high —
    // one global minimum would ban the classic sponson-edge stowage line
    // (the real Tiger's cables) for a mantlet it can never touch. Hull decor
    // inside the sweep only needs to clear the bands it actually sits under.
    // Casemates skip the sweep (nothing yaws).
    let sweepR = 0;
    let turretMinY = 0.10;                    // global (relative to pivot)
    const bandMinY = [Infinity, Infinity, Infinity]; // r/sweepR: <0.5, 0.5-0.8, >0.8
    {
      const v = new THREE.Vector3();
      const bb = new THREE.Box3();
      const inv = new THREE.Matrix4();
      const m = new THREE.Matrix4();
      const samples = [];
      turretG.updateWorldMatrix(true, false);
      inv.copy(turretG.matrixWorld).invert();
      for (const o of turretTargets) {
        let underGun = false; // gun subtree pitches — the gun guard owns it
        for (let p = o; p && p !== turretG; p = p.parent) if (p.name === 'rig_gun') { underGun = true; break; }
        if (underGun) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        bb.copy(o.geometry.boundingBox);
        m.multiplyMatrices(inv, o.matrixWorld);
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          v.set(x, y, z).applyMatrix4(m);
          const r = Math.hypot(v.x, v.z);
          sweepR = Math.max(sweepR, r);
          if (v.y < turretMinY) turretMinY = v.y;
          samples.push([r, v.y]);
        }
      }
      sweepR = Math.min(sweepR || W * 0.45, dims.overallLengthM * 0.5); // sanity
      for (const [r, y] of samples) {
        const i = r < sweepR * 0.5 ? 0 : (r < sweepR * 0.8 ? 1 : 2);
        if (y < bandMinY[i]) bandMinY[i] = y;
      }
      for (let i = 0; i < 3; i++) if (!Number.isFinite(bandMinY[i])) bandMinY[i] = 0.12;
    }

    // Gun full-depression bore envelope, swept across every yaw. Hull decor
    // within reach must clear the bore cylinder.
    const dep = (spec.gunDepressionDeg ?? 8) * D2R;
    const gunPiv = armor.gunPivot || [0, 0, 0];
    const boreY0 = pivot[1] + gunPiv[1];
    const boreRho = Math.hypot(gunPiv[0], gunPiv[2]);
    const boreLen = (armor.gunBarrel && armor.gunBarrel.lengthM) || 4;
    const boreR = ((armor.gunBarrel && armor.gunBarrel.radiusM) || 0.08) * 1.15 + 0.02;
    const boreReach = boreRho + boreLen * Math.cos(dep) + 0.2;
    const boreYAt = (r) => boreY0 - Math.max(0, r - boreRho) * Math.tan(dep);
    // guards evolve as turret decor lands: baskets legally extend the bustle
    let sweepRLive = sweepR;
    let turretMinYLive = turretMinY;

    const widthGuardOK = (bb, zExtra = 0) => {
      if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048) return false;
      const zLim = dims.overallLengthM / 2 + 0.4 + zExtra;
      return bb.min.z > -zLim && bb.max.z < zLim;
    };
    // GUN GUARD — full-depression bore corridor across every yaw, resolved
    // the way a PLAYER would see it: a piece fails only when a bore-bundle
    // ray meets the DECOR before any of the tank's own plates. (Tall flat
    // decks — Sherman/Tiger/M60 rear arcs — already skim or eat the bore;
    // geometry the hull occludes first can never render as decor-through-
    // barrel.) The cheap analytic cone check accepts the clear-by-height
    // majority before any rays fire.
    const _gray = new THREE.Ray();
    const _ghit = new THREE.Vector3();
    const guardRay = new THREE.Raycaster();
    const gunGuardOK = (boxes, seatY = null) => {
      void seatY;
      // analytic quick-accept: every PART fully under the depressed bore cone
      let clear = true;
      for (const bb of boxes) {
        for (const x of [bb.min.x, bb.max.x, (bb.min.x + bb.max.x) / 2]) {
          for (const z of [bb.min.z, bb.max.z, (bb.min.z + bb.max.z) / 2]) {
            const r = Math.hypot(x - pivot[0], z - pivot[2]);
            if (r > boreReach || r < boreRho * 0.5) continue;
            if (bb.max.y > boreYAt(r) - boreR - 0.03) { clear = false; break; }
          }
          if (!clear) break;
        }
        if (!clear) break;
      }
      if (clear) return true;
      // first-hit ray test: bore bundle (center + 4 sleeve-radius offsets)
      const yaws = casemate ? [0] : Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
      const sinD = Math.sin(dep), cosD = Math.cos(dep);
      hullG.updateWorldMatrix(true, false);
      const toWorld = hullG.matrixWorld;
      for (const yaw of yaws) {
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const ox = pivot[0] + gunPiv[0] * cy + gunPiv[2] * sy;
        const oz = pivot[2] - gunPiv[0] * sy + gunPiv[2] * cy;
        const oy = boreY0;
        const dx = sy * cosD, dyy = -sinD, dz = cy * cosD;
        const sideV = [cy, 0, -sy];                       // ⟂ bearing, horizontal
        // up = dir × side (unit: dir and side are unit and orthogonal)
        const ux = dyy * sideV[2], uy = dz * sideV[0] - dx * sideV[2], uz = -dyy * sideV[0];
        for (const [a, b] of [[0, 0], [boreR, 0], [-boreR, 0], [0, boreR], [0, -boreR]]) {
          _gray.origin.set(
            ox + sideV[0] * a + ux * b,
            oy + uy * b,
            oz + sideV[2] * a + uz * b,
          );
          _gray.direction.set(dx, dyy, dz);
          let tBox = Infinity;
          for (const bb of boxes) {
            const hit = _gray.intersectBox(bb, _ghit);
            if (hit) tBox = Math.min(tBox, _ghit.distanceTo(_gray.origin));
          }
          if (!Number.isFinite(tBox) || tBox > boreLen + 0.15) continue;
          // does the tank's own geometry eat the ray first?
          guardRay.ray.origin.copy(_gray.origin).applyMatrix4(toWorld);
          guardRay.ray.direction.copy(_gray.direction).transformDirection(toWorld);
          guardRay.far = tBox - 0.02;
          guardRay.near = 0.1;
          const blocked = guardRay.intersectObjects(hullTargets, false).length > 0;
          if (!blocked) { gunGuardOK.lastYaw = Math.round(yaw / D2R); return false; } // decor first-hit
        }
      }
      return true;
    };
    const sweepGuardOK = (bb) => {
      if (casemate) return true;
      // closest horizontal approach of the box to the yaw axis (edges count,
      // not just corners — a long cable's mid-span is its nearest point)
      const rMin = Math.hypot(
        Math.max(0, bb.min.x - pivot[0], pivot[0] - bb.max.x),
        Math.max(0, bb.min.z - pivot[2], pivot[2] - bb.max.z),
      );
      let rMax = 0;
      for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
        rMax = Math.max(rMax, Math.hypot(x - pivot[0], z - pivot[2]));
      }
      if (rMin > sweepRLive + 0.07) return true;
      // clear the lowest turret surface among the radial bands overlapped
      let minY = Infinity;
      const n0 = rMin / Math.max(sweepR, 1e-3), n1 = rMax / Math.max(sweepR, 1e-3);
      if (n0 < 0.5) minY = Math.min(minY, bandMinY[0]);
      if (n1 > 0.5 && n0 < 0.8) minY = Math.min(minY, bandMinY[1]);
      if (n1 > 0.8) minY = Math.min(minY, bandMinY[2]);
      if (!Number.isFinite(minY)) minY = turretMinYLive;
      return bb.max.y <= pivot[1] + minY - 0.035;
    };

    // --- collision ledgers (hull & turret frames kept apart) ---------------
    const placedHull = [];
    const placedTurret = [];
    const overlaps = (bb, ledger) => ledger.some((o) => bb.intersectsBox(o));

    // --- spare-wheel radius: measured off the real gear ---------------------
    let wheelR = 0.31;
    {
      let best = null;
      const s = new THREE.Vector3();
      hullG.traverse((o) => {
        if (!o.geometry) return;
        const wheelish = o.isInstancedMesh || GEAR_NAME_RE.test(o.name || '');
        if (!wheelish) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        o.geometry.boundingBox.getSize(s);
        const ext = [s.x, s.y, s.z].sort((p, q) => p - q);
        const r = (ext[1] + ext[2]) / 4;
        if (r > 0.16 && r < 0.62 && ext[1] / Math.max(ext[2], 1e-3) > 0.7 && ext[0] < r * 1.7) {
          if (!best || r > best) best = r;
        }
      });
      if (best) wheelR = Math.min(0.45, best);
    }

    // --- deck landmarks ------------------------------------------------------
    const topFrom = H + 1.5;
    const deckProbe = (x, z) => hullP.top(x, z, topFrom);
    const sternZ = -L / 2;
    let rearDeckY = H * 0.6;
    {
      const ys = [];
      for (let i = 0; i <= 6; i++) {
        const z = sternZ + 0.2 + (i / 6) * Math.max(0.4, (pivot[2] - sweepR - 0.25) - sternZ - 0.3);
        const h = deckProbe(0, z);
        if (h) ys.push(h.p.y);
      }
      if (ys.length) { ys.sort((p, q) => p - q); rearDeckY = ys[(ys.length / 2) | 0]; }
    }

    // --- placement bookkeeping ----------------------------------------------
    const budget = { tris: 0, max: 3000 };
    const buckets = { hull: new Map(), turret: new Map() };
    const summary = { pieces: [], tris: 0, skipped: [] };
    let basketAnchor = null; // set by turretRearFrame; used by onBasket packs

    /** Commit one built kit at pos/rot under hull|turret. */
    function commit(name, parts, frame, pos, rot, ledger, { allowOverlap = false, seatY = null, zExtra = 0 } = {}) {
      let tris = 0;
      for (const p of parts) tris += triCount(p.geo);
      if (budget.tris + tris > budget.max) { summary.skipped.push([name, 'budget']); disposePartList(parts); return false; }
      const bb = placedBox(parts, pos, rot);
      if (frame === 'hull') {
        if (!widthGuardOK(bb, zExtra)) { summary.skipped.push([name, 'width']); disposePartList(parts); return false; }
        if (!gunGuardOK(placedPartBoxes(parts, pos, rot), seatY)) { summary.skipped.push([name, `gun@${gunGuardOK.lastYaw ?? 'cone'}`]); gunGuardOK.lastYaw = null; disposePartList(parts); return false; }
        if (!sweepGuardOK(bb)) { summary.skipped.push([name, 'sweep']); disposePartList(parts); return false; }
      } else {
        // turret frame: the WIDTH guard applies to the yaw-0 footprint (the
        // committed plan width the loader measures); radial reach may extend
        // the existing bustle envelope a bounded amount (baskets), since a
        // yawed turret legally overhangs the hull like the bustle itself.
        let rMax = 0;
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
          rMax = Math.max(rMax, Math.hypot(x, z));
        }
        if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048) {
          summary.skipped.push([name, 'turret-width']); disposePartList(parts); return false;
        }
        if (rMax > sweepR + 0.55) {
          summary.skipped.push([name, 'turret-reach']); disposePartList(parts); return false;
        }
        sweepRLive = Math.max(sweepRLive, rMax);
        turretMinYLive = Math.min(turretMinYLive, bb.min.y);
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
          const rn = Math.hypot(x, z) / Math.max(sweepR, 1e-3);
          const bi = rn < 0.5 ? 0 : (rn < 0.8 ? 1 : 2);
          if (bb.min.y < bandMinY[bi]) bandMinY[bi] = bb.min.y;
        }
      }
      if (!allowOverlap && overlaps(bb, ledger)) { summary.skipped.push([name, 'overlap']); disposePartList(parts); return false; }
      ledger.push(bb);
      budget.tris += tris;
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const map = buckets[frame];
      for (const p of parts) {
        p.geo.applyMatrix4(m);
        if (!map.has(p.mat)) map.set(p.mat, []);
        map.get(p.mat).push(p.geo);
      }
      summary.pieces.push({ kit: name, frame, tris });
      return true;
    }

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const E = (rx = 0, ry = 0, rz = 0) => new THREE.Euler(rx, ry, rz);

    // fender line: walk inboard from the width guard until a fender-height
    // top face answers (sponson/fender tops live in [0.35H, 0.85H])
    const fenderX = (side) => {
      // pass 1: true track-guard band (low fenders); pass 2: sponson roofline
      for (const [y0, y1] of [[H * 0.32, H * 0.62], [H * 0.62, H * 0.86]]) {
        for (const fx of [W / 2 - 0.14, W / 2 - 0.22, W / 2 - 0.30]) {
          for (const z of [L * 0.3, L * 0.16, -L * 0.18, 0]) {
            const h = deckProbe(side * fx, z);
            if (h && h.p.y > y0 && h.p.y < y1 && h.n.y > 0.75) return fx;
          }
        }
      }
      return null;
    };

    const SLOTS = {
      rearDeck(args, parts, name) {
        const bb = partsBBox(parts);
        const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
        const xs = args.center ? 0 : (args.corner || 1) * Math.max(0, W / 2 - 0.34 - w / 2);
        let z0 = args.back
          ? sternZ + d / 2 + 0.2
          : Math.max(sternZ + d / 2 + 0.16, pivot[2] - sweepR - d / 2 - (args.small ? 0.5 : 0.24));
        if (casemate) z0 = sternZ + d / 2 + 0.25 + (args.back ? 0 : 0.3);
        for (const dz of [0, -0.25, 0.28, -0.5]) {
          const seat = seatProbe(hullP, xs, z0 + dz, w, d, topFrom, 0.28);
          if (!seat) continue;
          const yaw = (rng() - 0.5) * 0.16 + (args.spread ? (rng() - 0.5) * 0.8 : 0);
          if (commit(name, parts, 'hull', V(xs, seat.y - 0.012, z0 + dz), E(0, yaw, 0), placedHull, { seatY: seat.y })) return true;
        }
        disposePartList(parts);
        return false;
      },
      fender(args, parts, name) {
        const fx = fenderX(args.side);
        if (fx === null) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        // auto-orient: the LONG axis always runs fore-aft along the fender
        const rot90 = (bb.max.x - bb.min.x) > (bb.max.z - bb.min.z) * 1.15;
        const w = rot90 ? bb.max.z - bb.min.z : bb.max.x - bb.min.x;   // across
        const d = rot90 ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;   // along
        const z = (args.zFrac ?? 0) * L;
        const seat = seatProbe(hullP, args.side * fx, z, Math.min(w, 0.34), Math.min(d, 0.4), topFrom, 0.26);
        if (!seat) { disposePartList(parts); return false; }
        const yaw = (rot90 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.08;
        return commit(name, parts, 'hull', V(args.side * fx, seat.y - 0.012, z), E(0, yaw, 0), placedHull, { seatY: seat.y });
      },
      glacis(args, parts, name) {
        const x = (args.side || 0) * W * (casemate ? 0.22 : 0.16);
        for (const zf of [0.36, 0.42, 0.3]) {
          const z = L * zf;
          const h = deckProbe(x, z);
          if (!h || h.n.y < 0.3 || h.n.y > 0.985 || Math.abs(h.n.x) > 0.4) continue;
          const pitch = Math.atan2(h.n.z, h.n.y);
          if (commit(name, clonePartList(parts), 'hull', V(x, h.p.y + 0.015, z), E(pitch, 0, 0), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        // near-vertical bow plates (Tiger driver plate): hang the run flat
        // against the plate instead of lying on it, LOW (under the bow bore)
        for (const yf of [0.42, 0.5]) {
          const y = H * yf;
          const h = hullP.zface(x, y, -1, L / 2 + 1.6);
          if (!h || h.n.z < 0.5) continue;
          const pitch = Math.atan2(-h.n.y, h.n.z);
          if (commit(name, clonePartList(parts), 'hull', V(x, y, h.p.z + 0.012), E(pitch, 0, 0), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      glacisLow(args, parts, name) {
        for (const zf of [0.44, 0.48, 0.4]) {
          const z = L * zf;
          const h = deckProbe(0, z);
          if (!h) continue;
          const pitch = Math.atan2(h.n.z, Math.max(h.n.y, 0.2));
          if (commit(name, clonePartList(parts), 'hull', V(0, h.p.y + 0.01, z), E(pitch * 0.85, 0, 0), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      hullSideTop(args, parts, name) {
        const fx = fenderX(args.side) ?? (W / 2 - 0.2);
        for (const z0 of [0.1, -0.4]) {
          const seat = seatProbe(hullP, args.side * fx, z0, 0.2, 1.2, topFrom, 0.3);
          if (!seat) continue;
          if (commit(name, clonePartList(parts), 'hull', V(args.side * fx, seat.y - 0.004, z0 * 0.5),
            E(0, Math.PI / 2, 0), placedHull, { seatY: seat.y })) {
            disposePartList(parts);
            return true;
          }
        }
        // fallback 1: hang the run nearly FLAT on the upper hull side plate
        // (the classic Tiger cable line) — under the roof, inside the width
        for (const yf of [0.6, 0.52]) {
          const y = H * yf;
          const h = hullP.side(y, 0, args.side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.55) continue;
          if (commit(name, clonePartList(parts), 'hull', V(h.p.x + args.side * 0.012, y, 0),
            E(0, Math.PI / 2, args.side * 1.35), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        // fallback 2: horizontal run across the lower bow plate (Tiger bow
        // spare cable) — the bore never reaches this low forward
        {
          const y = H * 0.42;
          const h = hullP.zface(0, y, -1, L / 2 + 1.6);
          if (h && h.n.z > 0.3) {
            const pitch = Math.atan2(-h.n.y, h.n.z);
            if (commit(name, clonePartList(parts), 'hull', V(0, y, h.p.z + 0.04),
              E(pitch + Math.PI / 2 * 0.92, 0, 0), placedHull)) {
              disposePartList(parts);
              return true;
            }
          }
        }
        disposePartList(parts);
        return false;
      },
      // low cantilever rack on the rear plate: jerrycans & tall kit on tanks
      // whose flat rear decks sit inside the full-depression bore sweep
      hullRearRack(args, parts, name) {
        const bb = partsBBox(parts);
        const ph = bb.max.y - bb.min.y;
        const topY = Math.min(rearDeckY - 0.02, boreYAt(Math.abs(sternZ - pivot[2])) - boreR - 0.05);
        const y = topY - ph;
        if (y < H * 0.22) { disposePartList(parts); return false; }
        const h = hullP.zface((args.x || 0) * W, Math.max(H * 0.3, y + ph * 0.4), 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V((args.x || 0) * W, y, h.p.z - (bb.max.z - bb.min.z) / 2 - 0.03),
          E(), placedHull, { seatY: y, zExtra: 0.35 });
      },
      hullSide(args, parts, name) {
        // plate flat against the upper hull side (spare tracks, patches)
        const z = (args.zFrac ?? 0) * L;
        for (const yf of [0.55, 0.62, 0.48]) {
          const y = H * yf;
          const h = hullP.side(y, z, args.side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.7) continue;
          if (commit(name, clonePartList(parts), 'hull', V(h.p.x + args.side * 0.006, y, z),
            E(0, args.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      hullRear(args, parts, name) {
        const meta = parts.meta || {};
        if (meta.mount === 'deck') { // twin longitudinal drums at the deck edges
          const bb = partsBBox(parts);
          const d = bb.max.z - bb.min.z;
          const cx = parts.metaCx || 0.35;
          for (const dz of [0, 0.25, 0.5]) {
            const z = sternZ + d / 2 + 0.12 + dz;
            // per-drum footprints (the raised center hatch line stays out of
            // the probe); sloped soviet decks pitch the whole rack
            const sL = seatProbe(hullP, -cx, z, 0.4, d * 0.7, topFrom, 0.42);
            const sR = seatProbe(hullP, cx, z, 0.4, d * 0.7, topFrom, 0.42);
            if (!sL || !sR) continue;
            const seatY = Math.max(sL.y, sR.y);
            const n = sL.y > sR.y ? sL.n : sR.n;
            const pitch = n ? Math.atan2(n.z, Math.max(n.y, 0.4)) : 0;
            if (commit(name, parts, 'hull', V(0, seatY - 0.012, z), E(pitch * 0.8, 0, 0), placedHull,
              { seatY, zExtra: 0.3 })) return true;
          }
          disposePartList(parts);
          return false;
        }
        // single transverse drum cantilevered off the rear plate (piece origin
        // at bracket base -> drum axis rides meta.centerY above the commit y)
        const cY = meta.centerY || 0.29;
        const axisY = Math.max(H * 0.34 + cY,
          Math.min(rearDeckY - 0.04, boreYAt(Math.abs(sternZ - pivot[2])) - boreR - (meta.clearY || 0.28) - 0.06));
        const h = hullP.zface(0, axisY, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, axisY - cY, h.p.z - (meta.clearY || 0.28) - 0.04), E(), placedHull,
          { seatY: axisY - cY, zExtra: 0.4 });
      },
      hullRearLow(args, parts, name) {
        const y = Math.max(H * 0.33, rearDeckY * 0.62);
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.16), E(0, 0, (rng() - 0.5) * 0.04), placedHull,
          { seatY: y, zExtra: 0.35 });
      },
      hullRearHang(args, parts, name) {
        const y = rearDeckY * 0.82;
        const h = hullP.zface(W * 0.26, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        return commit(name, parts, 'hull', V(W * 0.26, y - (bb.max.y - bb.min.y), h.p.z - 0.09), E(), placedHull,
          { zExtra: 0.3 });
      },
      hullRearCage(args, parts, name) {
        const y = rearDeckY * 0.72;
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.28), E(0, Math.PI, 0), placedHull,
          { seatY: y - 0.25, zExtra: 0.45 });
      },
      bowPair(args, parts, name) {
        let ok = false;
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          let done = false;
          for (const yf of [0.3, 0.38, 0.24]) {
            const y = H * yf;
            const h = hullP.zface(s * W * 0.28, y, -1, L / 2 + 1.6);
            if (!h || h.n.z < 0.3) continue;
            const pitch = Math.atan2(-h.n.y, h.n.z); // bolt flush to the bow plate
            if (commit(name, cl, 'hull', V(s * W * 0.28, y, h.p.z + 0.005), E(pitch, 0, 0), placedHull)) { done = true; break; }
          }
          if (!done) disposePartList(cl);
          ok = ok || done;
        }
        disposePartList(parts);
        return ok;
      },
      bowChain(args, parts, name) {
        const y = H * 0.3;
        const h = hullP.zface(-W * 0.28, y, -1, L / 2 + 1.6);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(-W * 0.28, y - 0.02, h.p.z + 0.05), E(), placedHull);
      },
      // ---- turret slots ----
      turretRoof(args, parts, name) {
        const zBase = args.rear ? -Math.max(0.3, sweepR * 0.36) : Math.max(0.24, sweepR * 0.26);
        const xBase = (args.side || 1) * Math.max(0.28, W * 0.1);
        const bb = partsBBox(parts);
        const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
        // casemate roofs are big sloped plates: looser flatness gate
        const spread = casemate ? 0.3 : 0.12;
        const minNy = casemate ? 0.6 : 0.8;
        const cands = [[0, 0], [-0.15, -0.1], [0.15, 0.12], [0, -0.24], [-0.1, 0.2], [0.24, 0], [-0.24, 0.06], [0.1, -0.34], [-0.3, -0.2]];
        if (casemate) cands.push([0, -0.7], [0.25, -0.6], [-0.25, -0.85], [0, 0.5], [0.3, 0.45]);
        for (const [dx, dz] of cands) {
          const x = xBase + dx, z = zBase + dz;
          if (Math.abs(x) < 0.24 && z > 0 && !casemate) continue; // gun corridor
          const seat = seatProbe(turP, x, z, Math.min(w, 0.42), Math.min(d, 0.42), 3.5, spread);
          if (!seat || seat.n.y < minNy) continue;
          if (commit(name, parts, 'turret', V(x, seat.y - 0.008, z), E(0, (rng() - 0.5) * 0.2, 0), placedTurret)) return true;
        }
        disposePartList(parts);
        return false;
      },
      turretRear(args, parts, name) {
        const bb = partsBBox(parts);
        const d = bb.max.z - bb.min.z;
        if (args.onBasket && basketAnchor) {
          return commit(name, parts, 'turret',
            V(basketAnchor.x, basketAnchor.y + 0.02, basketAnchor.z - (basketAnchor.d || 0.4) / 2),
            E(0, (rng() - 0.5) * 0.3, 0), placedTurret, { allowOverlap: true });
        }
        for (const back of [0.1, 0.3, 0.55]) {
          const z = -(sweepR * 0.55 + back) - d * 0.2;
          const seat = seatProbe(turP, 0, z, Math.min(bb.max.x - bb.min.x, 0.5), Math.min(d, 0.35), 3.5, 0.2);
          if (!seat) continue;
          if (commit(name, parts, 'turret', V(0, seat.y - 0.01, z), E(0, (rng() - 0.5) * 0.3, 0), placedTurret)) return true;
        }
        disposePartList(parts);
        return false;
      },
      // Open-mesh veil bonded to a turret side. Rotation maps the kit's
      // horizontal X/Z sheet onto the vertical Y/Z armor face.
      turretVeil(args, parts, name) {
        const side = args.side || 1;
        const zs = args.rear ? [-1.25, -0.95, -1.55, -0.65] : [-0.2, -0.45, 0.05];
        for (const z of zs) {
          for (const yf of args.high ? [0.56, 0.48] : [0.35, 0.5]) {
            const y = Math.max(0.26, pivotTopY() * yf);
            const h = turP.side(y, z, side, W / 2 + 1);
            if (!h || Math.abs(h.n.x) < 0.55) continue;
            if (commit(name, parts, 'turret', V(h.p.x + side * 0.075, y, z),
              E(0, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2), placedTurret,
              { allowOverlap: true })) return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretRearFrame(args, parts, name) {
        // basket bolts to the bustle rear face (open face +Z toward the turret)
        const meta = parts.meta || {};
        for (const yf of [0.3, 0.45, 0.2]) {
          const h = turP.zface(0, Math.max(0.14, (pivotTopY() - 0) * yf), 1, -sweepR - 1.4);
          if (!h || h.n.z > -0.25) continue;
          const y = Math.max(0.1, h.p.y - (meta.h || 0.32) * 0.4);
          if (commit(name, parts, 'turret', V(0, y, h.p.z + 0.01), E(), placedTurret)) {
            basketAnchor = { x: 0, y: y + (meta.h || 0.32) * 0.35, z: h.p.z - 0.02, d: meta.d || 0.4 };
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretSide(args, parts, name) {
        const bb = partsBBox(parts);
        const out = (bb.max.z - bb.min.z) * 0.35;
        for (const z of [-0.2, -0.45, 0.05]) {
          for (const yf of [0.35, 0.5]) {
            const y = Math.max(0.18, pivotTopY() * yf);
            const h = turP.side(y, z, args.side, W / 2 + 1);
            if (!h || Math.abs(h.n.x) < 0.55) continue;
            if (commit(name, clonePartList(parts), 'turret', V(h.p.x + args.side * out * 0.3, y - 0.06, z),
              E(0, args.side > 0 ? Math.PI / 2 : -Math.PI / 2, (rng() - 0.5) * 0.1), placedTurret)) {
              disposePartList(parts);
              return true;
            }
          }
        }
        disposePartList(parts);
        return false;
      },
      turretSidePlate(args, parts, name) {
        for (const z of [0.05, -0.25]) {
          const y = Math.max(0.2, pivotTopY() * 0.45);
          const h = turP.side(y, z, args.side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.6) continue;
          if (commit(name, clonePartList(parts), 'turret', V(h.p.x + args.side * 0.035, y, z),
            E(0, args.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), placedTurret)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretCheekPair(args, parts, name) {
        let ok = false;
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          let done = false;
          for (const [z, yf] of [[0.3, 0.5], [0.2, 0.42], [0.36, 0.6]]) {
            const y = Math.max(0.24, pivotTopY() * yf);
            const h = turP.side(y, z, s, W / 2 + 1);
            if (!h) continue;
            const yaw = s > 0 ? Math.PI / 2 + 0.55 : -Math.PI / 2 - 0.55; // fan forward
            if (commit(name, cl, 'turret', V(h.p.x + s * 0.03, y, z), E(0, yaw, 0), placedTurret)) { done = true; break; }
          }
          if (!done) disposePartList(cl);
          ok = ok || done;
        }
        disposePartList(parts);
        return ok;
      },
    };

    // turret roof height above the pivot (probed once, cached)
    let _pivotTopY = null;
    function pivotTopY() {
      if (_pivotTopY !== null) return _pivotTopY;
      const h = seatProbe(turP, 0, -Math.max(0.2, sweepR * 0.3), 0.3, 0.3, 3.5, 0.5)
        || seatProbe(turP, 0, 0, 0.3, 0.3, 3.5, 0.6);
      _pivotTopY = h ? Math.max(0.3, h.y) : Math.max(0.3, H - pivot[1]);
      return _pivotTopY;
    }

    // ---- resolve the manifest ---------------------------------------------
    const manifest = decorManifestFor(spec, rng);
    for (const row of manifest) {
      // deterministic dice: EVERY row draws its roll + jitter seed up front,
      // so a failed placement can never reshuffle later pieces
      const roll = rng();
      const jitterSeed = (rng() * 0x7fffffff) | 0;
      if (roll > (row.p ?? 1)) continue;
      const kitFn = DECOR_KITS[row.kit];
      const slotFn = SLOTS[row.slot[0]];
      if (!kitFn || !slotFn) continue;
      let parts;
      try {
        const localRng = mulberry32(fnv1a(`${spec.id}:${row.kit}:${row.slot[0]}`) ^ jitterSeed);
        const v = { ...(row.v || {}) };
        if (row.kit === 'wheel') v.r = wheelR;
        if (row.kit === 'drums') v._W = W;
        parts = kitFn({ rng: localRng, ...v });
      } catch (e) { continue; }
      try {
        const before = summary.skipped.length;
        const ok = slotFn(row.slot[1] || {}, parts, row.kit);
        // slots log commit-guard skips themselves; a silent false is a probe
        // miss (no anchor surface answered) — record it so nothing hides
        if (!ok && summary.skipped.length === before) summary.skipped.push([row.kit, 'probe']);
      } catch (e) {
        summary.skipped.push([row.kit, `slot:${e.message}`]);
        try { disposePartList(parts); } catch (_) { /* already consumed */ }
      }
    }

    // ---- merge per family per frame + attach --------------------------------
    let drawCalls = 0;
    for (const [frame, map] of Object.entries(buckets)) {
      if (!map.size) continue;
      const parent = frame === 'hull' ? hullG : turretG;
      const g = new THREE.Group();
      g.name = frame === 'hull' ? 'rig_decor_hull' : 'rig_decor_turret';
      for (const [matKey, geos] of map) {
        const nonIndexed = geos.map((x) => (x.index ? x.toNonIndexed() : x));
        const merged = mergeGeometries(nonIndexed, false);
        for (const x of nonIndexed) x.dispose();
        for (const x of geos) if (!x.attributes || x !== merged) x.dispose();
        if (!merged) continue;
        disposables.push(merged);
        const mesh = new THREE.Mesh(merged, mats.get(matKey));
        mesh.name = `decor_${frame}_${matKey}`;
        // PERF: the fleet's shadow story is proxy-based (procedural proxies /
        // GLB buildShadowProxy) with per-mesh casters swept off — decor
        // follows the same contract. receiveShadow keeps the kit grounded.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData.__decor = true;
        mesh.userData.combatHitboxRole = 'equipment';
        // LOD: decor vanishes at the fleet's greeble horizon
        const lod = new THREE.LOD();
        lod.addLevel(mesh, 0);
        lod.addLevel(new THREE.Object3D(), DECOR_LOD_DIST, 0.1);
        g.add(lod);
        drawCalls++;
      }
      parent.add(g);
      g.userData.combatHitboxRole = 'equipment';
    }
    for (const m of Object.values(mats.all())) disposables.push(m);

    summary.tris = budget.tris;
    summary.drawCalls = drawCalls;
    root.userData.__decorSummary = summary;
    return summary;
  } catch (e) {
    try { console.warn(`[decorations] ${spec && spec.id}: attach failed —`, e.message); } catch (_) { /* noop */ }
    return null;
  }
}

export { buildDecorMaterials, DECOR_LOD_DIST };
