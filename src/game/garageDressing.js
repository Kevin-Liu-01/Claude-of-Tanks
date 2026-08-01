// src/game/garageDressing.js — WORKSHOP SET DRESSING for the garage hangar
// (garage-scene r1). The bay read as a clean showroom: podium + a handful of
// crates. This module turns it into a WORKING tank workshop — benches with
// tools, pegboards, shell racks, spare gun barrels, road-wheel/track stacks,
// a spare turret on blocks, oil drums, jerrycans, welding cart with a faint
// arc glow, cable reels, an engine hoist with a hanging engine block, a big
// wall fan, extra hanging work lamps — and the hero feature: TWO roster tanks
// visibly under repair in the corner bays (one on jack stands with its turret
// craned off a gantry, one with side skirts pulled and leaning on the hull).
//
// Contract with the rest of the game:
//  - 100% procedural (canvas textures + primitives + tankFactory procedural
//    builds) — no downloads, no GLB jobs, shares the stage's texture language
//    via the helpers exported from ui/garageStage.js.
//  - BUILDS LAZILY: created empty, then pump() builds one chunk per idle
//    slice (static clutter → bay A tank → bay B tank) so neither the boot
//    budget nor a tank-switch ever pays for it; ensureBuilt() force-finishes
//    synchronously for deterministic marketing captures (__SHOTS garage).
//  - PEDESTAL READABILITY IS SACRED: everything sits outside the painted
//    KEEP-CLEAR ring, in the r≥14 m wall/corner band, dim (low-albedo mats,
//    one whisper-level fill light, emissive-faked lamp pools) — the hero on
//    the turntable stays the brightest, cleanest read in frame.
//  - CAMERA SAFE: the showroom orbit reaches r≈19.3 m at y≥3.1 m — anything
//    taller than ~2.9 m keeps its whole footprint beyond r≈20 m (the corner
//    bays sit at r 23-26 m), so a free 360° orbit never clips into dressing.
//  - BATTLE COST ZERO: main.js toggles group.visible with the garage spots;
//    hidden subtrees (the dim fill light included) drop out of the render
//    list entirely, so battle frames never cull or draw any of this.
import * as THREE from 'three';
import {
  mulberry32, canvasTexture, dither, makeSignTexture, makeHazardTexture, SIGN_FONT,
} from '../ui/garageStage.js';
import { createTank } from '../vehicles/tankFactory.js';

// Repair-bay residents: procedural-of-record mid-tier heavies (specs.js
// MODEL_SOURCE 'procedural'), so proceduralOnly builds are the SHIPPED look —
// no GLB parse enqueued, textures shared per-spec with the pedestal LRU.
const BAY_A_SPEC = 'tiger1';
const BAY_B_SPEC = 'panther_g';
const BAY_TANK_OPTS = { quality: 'ai', proceduralOnly: true };

/**
 * Build the (initially empty) workshop dressing rig.
 * @param {{anisotropy:number,setupShadowMaterial:Function}} engineCtx
 * @param {THREE.Vector3} pos garage stage center (ground level)
 * @returns {{group:THREE.Group, pump:()=>boolean, ensureBuilt:()=>void,
 *            isBuilt:()=>boolean, dispose:()=>void}}
 */
export function createGarageDressing(engineCtx, pos) {
  const group = new THREE.Group();
  group.name = 'garage_dressing';
  group.position.copy(pos);
  const rng = mulberry32(48151);
  const aniso = (engineCtx && engineCtx.anisotropy) || 4;
  const shadowMat = (m) => {
    if (engineCtx && engineCtx.setupShadowMaterial) engineCtx.setupShadowMaterial(m);
    return m;
  };
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const tankVisuals = [];
  const signTextures = [];

  // --- shared palette (kept LOW-ALBEDO so nothing competes with the hero) ---
  const mat = {
    steelDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.52, metalness: 0.6 }))),
    steelMid: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x41474e, roughness: 0.46, metalness: 0.68 }))),
    steelBright: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.32, metalness: 0.85 }))),
    redCab: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x6e2621, roughness: 0.46, metalness: 0.42 }))),
    redCabDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x4b1a16, roughness: 0.5, metalness: 0.4 }))),
    blueSteel: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2a4257, roughness: 0.48, metalness: 0.5 }))),
    olive: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x424636, roughness: 0.72, metalness: 0.18 }))),
    timber: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x5d4d31, roughness: 0.86, metalness: 0 }))),
    timberDark: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x413620, roughness: 0.88, metalness: 0 }))),
    rubber: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x131517, roughness: 0.94, metalness: 0 }))),
    brass: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x766330, roughness: 0.38, metalness: 0.8 }))),
    safety: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x8a7420, roughness: 0.62, metalness: 0.15 }))),
    extRed: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x77201a, roughness: 0.42, metalness: 0.35 }))),
    bottleGreen: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2d4634, roughness: 0.4, metalness: 0.55 }))),
    bottleBlue: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x2c3f52, roughness: 0.4, metalness: 0.55 }))),
    oily: track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5, metalness: 0.72 }))),
    lamp: track(new THREE.MeshBasicMaterial({ color: 0xe8dcbd })),
  };

  // one-liner mesh placer: shared geometry, tracked once by the caller
  function put(geo, m, x, y, z, ry = 0, rx = 0, rz = 0, s = 1, parent = group, shadows = true) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    if (Array.isArray(s)) mesh.scale.set(s[0], s[1], s[2]);
    else mesh.scale.setScalar(s);
    if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
    parent.add(mesh);
    return mesh;
  }

  // --- tiny canvas textures ---------------------------------------------------
  // pegboard: dark board, peg-hole grid, painted hanging-tool silhouettes —
  // one textured quad reads as a whole wall of wrenches/hammers/pliers.
  function makePegboardTexture() {
    const W = 256, H = 160;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#2e3236';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1a1d20';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = 'rgba(14,16,18,0.8)';
    for (let y = 14; y < H - 8; y += 12) {
      for (let x = 12; x < W - 8; x += 12) g.fillRect(x, y, 2.4, 2.4);
    }
    // painted tool shadows first (slight offset), then the tools
    const tool = (draw) => {
      g.save(); g.translate(2, 3); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.fillStyle = 'rgba(0,0,0,0.45)'; draw(); g.restore();
      g.strokeStyle = '#83898f'; g.fillStyle = '#83898f'; draw();
    };
    g.lineWidth = 5;
    // open-end wrenches (angled bars with C heads)
    for (const [x, y, l, a] of [[30, 26, 52, 0.12], [58, 24, 66, 0.06], [86, 28, 46, 0.16]]) {
      tool(() => {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 14, y + l);
        g.stroke();
        g.beginPath(); g.arc(x, y - 3, 6, 0.6, Math.PI * 1.6); g.stroke();
      });
    }
    // hammer
    tool(() => {
      g.fillRect(120, 22, 8, 56);
      g.fillRect(108, 18, 32, 12);
    });
    // pliers (two arcs)
    tool(() => {
      g.beginPath(); g.moveTo(160, 26); g.quadraticCurveTo(154, 60, 150, 82); g.stroke();
      g.beginPath(); g.moveTo(166, 26); g.quadraticCurveTo(172, 60, 176, 82); g.stroke();
      g.beginPath(); g.arc(163, 24, 7, 0, Math.PI * 2); g.stroke();
    });
    // hand saw
    tool(() => {
      g.beginPath();
      g.moveTo(196, 30); g.lineTo(240, 30); g.lineTo(238, 44); g.lineTo(196, 40);
      g.closePath(); g.fill();
      g.fillRect(190, 26, 8, 22);
    });
    // hex keys + screwdrivers row
    g.lineWidth = 3.5;
    for (let i = 0; i < 7; i++) {
      const x = 34 + i * 14;
      tool(() => {
        g.beginPath(); g.moveTo(x, 104); g.lineTo(x, 128 + (i % 3) * 6); g.stroke();
      });
    }
    // coiled air hose
    tool(() => {
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(196, 116, 14 - i * 4, 0, Math.PI * 2); g.stroke(); }
    });
    // grime
    for (let i = 0; i < 240; i++) {
      g.fillStyle = rng() < 0.6 ? 'rgba(12,14,16,0.25)' : 'rgba(140,148,156,0.08)';
      g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
    }
    dither(g, W, H, rng, 0.05);
    return c;
  }

  // soft radial pool for faked lamp light / under-bay work light
  function makePoolTexture(r0 = 'rgba(255,236,200,0.26)', r1 = 'rgba(255,236,200,0.08)') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 63);
    grad.addColorStop(0, r0);
    grad.addColorStop(0.55, r1);
    grad.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  // worn dashed white paint box — the side-bay floor outline decal
  function makeBayOutlineTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(206,210,214,0.5)';
    g.lineWidth = 7;
    g.setLineDash([26, 18]);
    g.strokeRect(10, 10, S - 20, S - 20);
    g.setLineDash([]);
    // corner Ls painted heavier
    g.lineWidth = 10;
    for (const [x, y, dx, dy] of [[10, 10, 1, 1], [S - 10, 10, -1, 1], [10, S - 10, 1, -1], [S - 10, S - 10, -1, -1]]) {
      g.beginPath();
      g.moveTo(x + dx * 34, y); g.lineTo(x, y); g.lineTo(x, y + dy * 34);
      g.stroke();
    }
    for (let i = 0; i < 200; i++) { // chip the paint
      g.clearRect(rng() * S, rng() * S, 1 + rng() * 4, 1 + rng() * 2);
    }
    return c;
  }

  // rubber tread skid arc
  function makeSkidTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    for (const off of [-14, 14]) {
      g.strokeStyle = 'rgba(18,20,22,0.4)';
      g.lineWidth = 17;
      g.beginPath();
      g.moveTo(6, 118 + off * 0.4);
      g.quadraticCurveTo(120, 96 + off, 250, 22 + off * 0.6);
      g.stroke();
    }
    return c;
  }

  const poolTex = track(canvasTexture(makePoolTexture()));
  const poolMat = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    opacity: 0.5,
  }));
  const stainC = makePoolTexture('rgba(13,13,15,0.5)', 'rgba(13,13,15,0.2)');
  const stainMat = track(new THREE.MeshBasicMaterial({
    map: track(canvasTexture(stainC)), transparent: true, depthWrite: false,
  }));

  // --- shared geometries -------------------------------------------------------
  const G = {
    box1: track(new THREE.BoxGeometry(1, 1, 1)),
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 14)),
    drum: track(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16)),
    shellBody: track(new THREE.CylinderGeometry(0.062, 0.062, 0.72, 10)),
    shellTip: track(new THREE.CylinderGeometry(0.004, 0.058, 0.22, 10)),
    caster: track(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10)),
    lampShade: track(new THREE.CylinderGeometry(0.14, 0.72, 0.52, 18)),
    lampGlow: track(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 18)),
    lampCable: track(new THREE.CylinderGeometry(0.018, 0.018, 1, 6)),
    roadWheel: track(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 18)),
    trackLink: track(new THREE.BoxGeometry(0.34, 0.075, 0.16)),
    jerrycan: track(new THREE.BoxGeometry(0.34, 0.5, 0.17)),
  };

  /** hanging work lamp (dressing only — the pool quad fakes its throw). */
  function workLamp(x, z, poolScale = 5.5, y = 7.4) {
    put(G.lampShade, mat.steelDark, x, y, z);
    const glow = put(G.lampGlow, mat.lamp, x, y - 0.26, z, 0, 0, 0, 1, group, false);
    glow.castShadow = false;
    put(G.lampCable, mat.steelDark, x, y + 0.26 + (10 - y - 0.26) / 2, z, 0, 0, 0, [1, (10 - y - 0.26), 1], group, false);
    if (poolScale > 0.01) {
      const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.032, z);
      pool.scale.setScalar(poolScale);
      group.add(pool);
    }
  }

  /** worn steel workbench with clutter (vice, welder box, grinder, cans). */
  function workbench(x, z, ry) {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    group.add(b);
    put(track(new THREE.BoxGeometry(3.1, 0.11, 0.95)), mat.timber, 0, 0.98, 0, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(3.0, 0.07, 0.85)), mat.steelDark, 0, 0.5, 0, 0, 0, 0, 1, b); // lower shelf
    const legG = track(new THREE.BoxGeometry(0.09, 0.98, 0.09));
    for (const [lx, lz] of [[-1.42, -0.38], [1.42, -0.38], [-1.42, 0.38], [1.42, 0.38]]) {
      put(legG, mat.steelMid, lx, 0.49, lz, 0, 0, 0, 1, b);
    }
    // vice: base + jaw blocks + spindle
    put(track(new THREE.BoxGeometry(0.16, 0.1, 0.22)), mat.steelDark, -1.05, 1.09, 0.18, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(0.22, 0.18, 0.14)), mat.blueSteel, -1.05, 1.22, 0.18, 0, 0, 0, 1, b);
    put(track(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8)), mat.steelBright, -1.05, 1.2, 0.34, 0, Math.PI / 2, 0, 1, b);
    // stick welder box w/ dial + handle
    put(track(new THREE.BoxGeometry(0.52, 0.34, 0.4)), mat.redCab, 0.15, 1.21, -0.05, 0.15, 0, 0, 1, b);
    put(track(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12)), mat.steelBright, 0.15, 1.27, 0.17, 0, 1.42, 0, 1, b);
    // angle grinder on its side
    put(track(new THREE.CylinderGeometry(0.055, 0.065, 0.34, 10)), mat.blueSteel, 0.95, 1.09, 0.22, 0, 0, Math.PI / 2, 1, b);
    put(track(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 14)), mat.steelBright, 1.18, 1.09, 0.22, 0, 0.2, Math.PI / 2, 1, b);
    // oil can + rag pile
    put(track(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 10)), mat.olive, 1.32, 1.14, -0.18, 0, 0, 0, 1, b);
    put(track(new THREE.BoxGeometry(0.3, 0.05, 0.24)), mat.timberDark, -0.42, 1.07, -0.24, 0.5, 0, 0, 1, b);
    return b;
  }

  /** pegboard quad + backing plate flush against a wall. */
  function pegboard(x, y, z, ry, w = 2.5, h = 1.55) {
    const tex = track(canvasTexture(makePegboardTexture(), { aniso }));
    const m = track(shadowMat(new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, metalness: 0.15,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05,
    })));
    const back = put(track(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05)), mat.steelDark, x, y, z, ry, 0, 0, 1, group, false);
    back.castShadow = false;
    const boardGeo = track(new THREE.PlaneGeometry(w, h));
    const board = new THREE.Mesh(boardGeo, m);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    board.translateZ(0.032);
    group.add(board);
  }

  /** rolling drawer toolbox (colorway via mats). */
  function toolChest(x, z, ry, bodyMat, trimMat, s = 1) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.rotation.y = ry;
    t.scale.setScalar(s);
    group.add(t);
    put(track(new THREE.BoxGeometry(1.15, 1.1, 0.62)), bodyMat, 0, 0.72, 0, 0, 0, 0, 1, t);
    put(track(new THREE.BoxGeometry(1.22, 0.06, 0.68)), trimMat, 0, 1.3, 0, 0, 0, 0, 1, t);
    put(track(new THREE.BoxGeometry(1.18, 0.08, 0.64)), trimMat, 0, 0.2, 0, 0, 0, 0, 1, t);
    const face = track(new THREE.BoxGeometry(1.02, 0.2, 0.04));
    const handle = track(new THREE.BoxGeometry(0.5, 0.028, 0.028));
    for (let i = 0; i < 4; i++) {
      put(face, bodyMat, 0, 1.16 - i * 0.25, 0.33, 0, 0, 0, 1, t);
      put(handle, mat.steelBright, 0, 1.2 - i * 0.25, 0.36, 0, 0, 0, 1, t, false);
    }
    for (const [wx, wz] of [[-0.46, -0.24], [0.46, -0.24], [-0.46, 0.24], [0.46, 0.24]]) {
      put(G.caster, mat.steelDark, wx, 0.07, wz, 0, 0, Math.PI / 2, 1, t, false);
    }
    return t;
  }

  /** wall sign: steel plate + stencil board (garageStage language). */
  function wallSign(text, x, y, z, ry, w = 2.0, h = 1.0) {
    const tex = track(canvasTexture(makeSignTexture(rng, text), { aniso }));
    signTextures.push(tex);
    const m = track(shadowMat(new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.13,
      roughness: 0.6, metalness: 0.2,
    })));
    put(track(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05)), mat.steelDark, x, y, z, ry, 0, 0, 1, group, false);
    const board = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), m);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    board.translateZ(0.032);
    group.add(board);
  }

  /** fire extinguisher on a wall bracket. */
  function extinguisher(x, y, z, ry) {
    const e = new THREE.Group();
    e.position.set(x, y, z);
    e.rotation.y = ry;
    group.add(e);
    put(track(new THREE.BoxGeometry(0.05, 0.4, 0.2)), mat.steelDark, -0.09, 0, 0, 0, 0, 0, 1, e, false);
    put(track(new THREE.CylinderGeometry(0.085, 0.085, 0.48, 12)), mat.extRed, 0, 0, 0, 0, 0, 0, 1, e);
    put(track(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8)), mat.steelBright, 0, 0.28, 0, 0, 0, 0, 1, e, false);
    put(track(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI * 1.3)), mat.rubber, 0.06, 0.16, 0, 0, Math.PI / 2, 0.6, 1, e, false);
  }

  const chunks = [];

  // ==========================================================================
  // CHUNK 1 — static workshop clutter on every wall + floor decals
  // ==========================================================================
  chunks.push(function buildCore() {
    // --- one whisper fill so the SE/NE bays never crush to pure black -------
    // (mirrors the west-corner fill in garageStage; rides the dressing group
    // so battle never sees the extra light — see main.js setGarageSpots)
    const bayFill = new THREE.PointLight(0xb9c6d6, 10, 30, 1.8);
    bayFill.position.set(12.5, 6.2, 11.5);
    bayFill.castShadow = false;
    group.add(bayFill);

    // --- EAST WALL (left of frame from the hero cam) ------------------------
    workbench(21.95, -7, -Math.PI / 2);
    pegboard(22.86, 2.62, -7, -Math.PI / 2);
    workLamp(21.6, -7);
    // steel locker pair
    for (const lz of [-11.9, -10.9]) {
      put(track(new THREE.BoxGeometry(0.55, 1.9, 0.95)), mat.olive, 22.35, 0.95, lz, 0, 0, 0, 1);
      put(track(new THREE.BoxGeometry(0.04, 1.7, 0.8)), mat.steelDark, 22.05, 0.95, lz, 0, 0, 0, 1, group, false);
    }
    // shell rack: frame + two rows of standing rounds (instanced)
    {
      const rack = new THREE.Group();
      rack.position.set(22.1, 0, 1.8);
      rack.rotation.y = -Math.PI / 2;
      group.add(rack);
      put(track(new THREE.BoxGeometry(2.3, 0.08, 0.8)), mat.steelMid, 0, 0.06, 0, 0, 0, 0, 1, rack);
      put(track(new THREE.BoxGeometry(2.3, 0.06, 0.7)), mat.steelMid, 0, 0.62, 0, 0, 0, 0, 1, rack);
      const post = track(new THREE.BoxGeometry(0.07, 1.25, 0.07));
      for (const px of [-1.1, 1.1]) {
        put(post, mat.safety, px, 0.62, -0.3, 0, 0, 0, 1, rack);
        put(post, mat.safety, px, 0.62, 0.3, 0, 0, 0, 1, rack);
      }
      const bodies = new THREE.InstancedMesh(G.shellBody, mat.olive, 12);
      const tips = new THREE.InstancedMesh(G.shellTip, mat.brass, 12);
      const M4 = new THREE.Matrix4();
      let i = 0;
      for (const rz of [-0.18, 0.18]) {
        for (let k = 0; k < 6; k++) {
          const sx = -0.95 + k * 0.38 + (rng() - 0.5) * 0.05;
          M4.makeTranslation(sx, 0.46, rz);
          bodies.setMatrixAt(i, M4);
          M4.makeTranslation(sx, 0.93, rz);
          tips.setMatrixAt(i, M4);
          i++;
        }
      }
      bodies.castShadow = tips.castShadow = true;
      rack.add(bodies, tips);
      track(bodies); track(tips);
      // two loose rounds lying on a pallet beside the rack
      put(track(new THREE.BoxGeometry(1.1, 0.1, 0.8)), mat.timberDark, 0.2, 0.05, 0.95, 0.2, 0, 0, 1, rack);
      put(G.shellBody, mat.olive, 0.05, 0.16, 0.95, 0.2, 0, Math.PI / 2, 1, rack);
      put(G.shellBody, mat.olive, 0.35, 0.16, 1.02, 0.35, 0, Math.PI / 2, 1, rack);
    }
    wallSign('BAY 02', 22.9, 5.6, -3.5, -Math.PI / 2, 2.6, 1.3);
    extinguisher(22.84, 1.12, 4.8, -Math.PI / 2);
    // oil drum cluster (one with a hand pump), plus a tipped drum
    for (const [dx, dz, c] of [[21.3, 7.6, mat.redCabDark], [20.5, 8.2, mat.blueSteel], [21.4, 8.7, mat.olive]]) {
      put(G.drum, c, dx, 0.58, dz, rng() * Math.PI);
    }
    put(track(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8)), mat.steelBright, 21.3, 1.35, 7.6, 0, 0, 0, 1, group, false);
    put(G.drum, mat.olive, 20.2, 0.42, 10.1, 0.4, 0, Math.PI / 2); // tipped
    wallSign('FLAMMABLE', 22.9, 3.4, 8.1, -Math.PI / 2, 1.7, 0.85);

    // --- SOUTH WALL (right of frame from the hero cam) ----------------------
    // spare gun barrels on timber X-trestles
    {
      const tre = track(new THREE.BoxGeometry(0.1, 1.15, 0.12));
      for (const tx of [4.2, 7.6]) {
        for (const lean of [-0.42, 0.42]) {
          put(tre, mat.timber, tx, 0.52, 21.3, 0, 0, lean);
          put(tre, mat.timber, tx, 0.52, 21.7, 0, 0, -lean);
        }
        put(track(new THREE.BoxGeometry(0.12, 0.1, 0.7)), mat.timberDark, tx, 0.95, 21.5, 0, 0, 0, 1);
      }
      const barrelG = track(new THREE.CylinderGeometry(0.075, 0.11, 5.4, 12));
      for (const [by, bz, s] of [[1.1, 21.42, 1], [1.1, 21.62, 0.92], [1.32, 21.52, 0.85]]) {
        put(barrelG, mat.oily, 5.9, by, bz, 0, 0, Math.PI / 2, s);
      }
      // muzzle brake on the top barrel
      put(track(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10)), mat.oily, 8.25, 1.32, 21.52, 0, 0, Math.PI / 2);
      workLamp(5.9, 20.7, 5);
    }
    // road-wheel stacks + one leaning wheel
    {
      const wheels = new THREE.InstancedMesh(G.roadWheel, mat.steelMid, 9);
      const tires = new THREE.InstancedMesh(track(new THREE.TorusGeometry(0.38, 0.055, 8, 20)), mat.rubber, 9);
      const M4 = new THREE.Matrix4();
      const E = new THREE.Euler();
      let i = 0;
      for (const [sx, sz, n] of [[1.5, 21.5, 4], [2.5, 21.3, 3]]) {
        for (let k = 0; k < n; k++) {
          M4.makeTranslation(sx, 0.1 + k * 0.175, sz);
          wheels.setMatrixAt(i, M4);
          E.set(Math.PI / 2, 0, 0);
          M4.makeRotationFromEuler(E).setPosition(sx, 0.1 + k * 0.175, sz);
          tires.setMatrixAt(i, M4);
          i++;
        }
      }
      // leaning pair against the wall (near-vertical: axis almost horizontal)
      for (const lx of [3.3, 3.62]) {
        E.set(Math.PI / 2 - 0.2, 0.25, 0);
        M4.makeRotationFromEuler(E).setPosition(lx, 0.42, 22.5);
        wheels.setMatrixAt(i, M4);
        E.set(Math.PI - 0.2, 0.25, 0);
        M4.makeRotationFromEuler(E).setPosition(lx, 0.42, 22.5);
        tires.setMatrixAt(i, M4);
        i++;
      }
      wheels.count = tires.count = i;
      wheels.castShadow = tires.castShadow = true;
      group.add(wheels, tires);
      track(wheels); track(tires);
    }
    // track-link pile on a pallet
    {
      put(track(new THREE.BoxGeometry(1.35, 0.11, 1.0)), mat.timberDark, -1.9, 0.06, 21.2, 0.12);
      const links = new THREE.InstancedMesh(G.trackLink, mat.oily, 20);
      const M4 = new THREE.Matrix4();
      const E = new THREE.Euler();
      for (let i = 0; i < 20; i++) {
        E.set(0, rng() * 0.8 - 0.4 + 0.12, (rng() - 0.5) * 0.2);
        M4.makeRotationFromEuler(E).setPosition(
          -2.25 + (i % 3) * 0.38 + (rng() - 0.5) * 0.06,
          0.16 + Math.floor(i / 6) * 0.085,
          20.9 + (Math.floor(i / 3) % 2) * 0.32 + (rng() - 0.5) * 0.06,
        );
        links.setMatrixAt(i, M4);
      }
      links.castShadow = true;
      group.add(links);
      track(links);
    }
    // spare turret on timber blocks (generic cast dome + gun stub)
    {
      const t = new THREE.Group();
      t.position.set(-6.6, 0, 20.5);
      t.rotation.y = 2.4;
      group.add(t);
      const blockG = track(new THREE.BoxGeometry(0.5, 0.42, 0.5));
      for (const [bx, bz] of [[-0.75, -0.6], [0.75, -0.6], [-0.75, 0.6], [0.75, 0.6]]) {
        put(blockG, mat.timber, bx, 0.21, bz, 0, 0, 0, 1, t);
      }
      const dome = new THREE.Mesh(track(new THREE.SphereGeometry(1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat.olive);
      dome.scale.set(1.15, 0.62, 1);
      dome.position.y = 0.48;
      dome.castShadow = dome.receiveShadow = true;
      t.add(dome);
      put(track(new THREE.CylinderGeometry(1.02, 1.08, 0.18, 20)), mat.olive, 0, 0.44, 0, 0, 0, 0, [1.15, 1, 1], t);
      put(track(new THREE.BoxGeometry(0.5, 0.34, 0.3)), mat.olive, 1.2, 0.72, 0, 0, 0, 0, 1, t); // mantlet
      put(track(new THREE.CylinderGeometry(0.075, 0.09, 2.6, 10)), mat.oily, 2.6, 0.72, 0, 0, 0, Math.PI / 2, 1, t);
      put(track(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 12)), mat.steelDark, 0.35, 1.14, 0.3, 0, 0, 0, 1, t); // cupola stub
    }
    // big workshop wall fan (static) + guard
    {
      const f = new THREE.Group();
      f.position.set(0.8, 6.05, 22.72);
      group.add(f);
      put(track(new THREE.BoxGeometry(0.5, 0.5, 0.3)), mat.steelDark, 0, 0, 0.22, 0, 0, 0, 1, f);
      put(track(new THREE.TorusGeometry(0.95, 0.06, 8, 26)), mat.steelMid, 0, 0, 0, 0, 0, 0, 1, f);
      put(track(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12)), mat.steelDark, 0, 0, 0, Math.PI / 2, 0, 0, 1, f);
      const bladeG = track(new THREE.BoxGeometry(0.26, 0.72, 0.035));
      for (let k = 0; k < 4; k++) {
        const blade = put(bladeG, mat.steelMid, 0, 0, 0.02, 0, 0, (k * Math.PI) / 2 + 0.5, 1, f);
        blade.translateY(0.48);
        blade.rotation.x = 0.28; // blade pitch
      }
      const barG = track(new THREE.BoxGeometry(0.025, 1.9, 0.025));
      for (let k = 0; k < 4; k++) put(barG, mat.steelDark, 0, 0, -0.14, 0, 0, (k * Math.PI) / 4, 1, f, false);
    }
    wallSign('KEEP CLEAR', 10.6, 5.3, 22.9, Math.PI, 2.2, 1.1);
    // welding cart: gas bottles + frame + hose + FAINT ARC GLOW (emissive
    // + additive sprite only — no live light)
    {
      const wc = new THREE.Group();
      wc.position.set(11.4, 0, 19.9);
      wc.rotation.y = -0.7;
      group.add(wc);
      put(track(new THREE.BoxGeometry(0.8, 0.06, 0.5)), mat.steelDark, 0, 0.12, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.BoxGeometry(0.06, 1.15, 0.06)), mat.steelDark, -0.34, 0.7, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.13, 0.13, 1.25, 12)), mat.bottleGreen, -0.15, 0.78, 0, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.115, 0.115, 1.05, 12)), mat.bottleBlue, 0.18, 0.68, 0.02, 0, 0, 0, 1, wc);
      put(track(new THREE.CylinderGeometry(0.045, 0.13, 0.12, 10)), mat.bottleGreen, -0.15, 1.46, 0, 0, 0, 0, 1, wc, false);
      put(track(new THREE.CylinderGeometry(0.04, 0.115, 0.1, 10)), mat.bottleBlue, 0.18, 1.26, 0.02, 0, 0, 0, 1, wc, false);
      put(track(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8)), mat.brass, -0.15, 1.56, 0, 0, 0, 0.5, 1, wc, false);
      for (const [wx2, wz2] of [[-0.3, 0.28], [0.3, 0.28]]) {
        put(track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12)), mat.rubber, wx2, 0.11, wz2, 0, 0, Math.PI / 2, 1, wc);
      }
      // hose coil + stinger hanging off the frame
      put(track(new THREE.TorusGeometry(0.16, 0.022, 6, 16)), mat.rubber, -0.36, 0.95, 0.05, 0, Math.PI / 2, 0, 1, wc, false);
      // faint hot-metal glow where the torch was parked: emissive tip + halo
      const tip = put(track(new THREE.SphereGeometry(0.03, 8, 6)),
        track(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })), 0.42, 0.2, 0.3, 0, 0, 0, 1, wc, false);
      tip.castShadow = false;
      const glowMat = track(new THREE.SpriteMaterial({
        map: track(canvasTexture(makePoolTexture('rgba(255,196,120,0.55)', 'rgba(255,150,60,0.16)'))),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const spark = new THREE.Sprite(glowMat);
      spark.scale.setScalar(0.85);
      spark.position.set(0.42, 0.22, 0.3);
      wc.add(spark);
    }

    // --- WEST + NORTH walls (seen when the free orbit swings behind) --------
    pegboard(-22.86, 2.62, 1.5, Math.PI / 2, 2.9, 1.6); // over the existing bench
    extinguisher(-22.84, 1.12, 3.4, Math.PI / 2);
    // jerrycan row (one tipped)
    {
      const cans = new THREE.InstancedMesh(G.jerrycan, mat.olive, 6);
      const M4 = new THREE.Matrix4();
      const E = new THREE.Euler();
      for (let i = 0; i < 6; i++) {
        if (i === 5) {
          E.set(Math.PI / 2, 0.5, 0);
          M4.makeRotationFromEuler(E).setPosition(-21.0, 0.11, -6.3);
        } else {
          E.set(0, (rng() - 0.5) * 0.4, 0);
          M4.makeRotationFromEuler(E).setPosition(-21.6 + (i % 3) * 0.42, 0.25 + Math.floor(i / 3) * 0.52, -8.4 + Math.floor(i / 3) * 0.05);
        }
        cans.setMatrixAt(i, M4);
      }
      cans.castShadow = true;
      group.add(cans);
      track(cans);
    }
    // cable reels: one upright, one flat with a coil
    {
      const discG = track(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18));
      const coreG = track(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14));
      const up = new THREE.Group();
      up.position.set(-21.2, 0.62, 10.3);
      up.rotation.z = Math.PI / 2;
      group.add(up);
      put(discG, mat.timber, 0, -0.29, 0, 0, 0, 0, 1, up);
      put(discG, mat.timber, 0, 0.29, 0, 0, 0, 0, 1, up);
      put(coreG, mat.timberDark, 0, 0, 0, 0, 0, 0, 1, up);
      const flat = new THREE.Group();
      flat.position.set(-20.4, 0.08, 12.1);
      group.add(flat);
      put(discG, mat.timber, 0, 0, 0, 0, 0, 0, 1, flat);
      put(track(new THREE.TorusGeometry(0.34, 0.05, 8, 18)), mat.rubber, 0, 0.1, 0, 0, 0, 0, 1, flat, false);
    }
    // stacked drums in the SW corner (2-tier on a board)
    {
      for (const [dx, dz, c] of [[-19.4, 19.3, mat.redCabDark], [-18.5, 19.7, mat.olive], [-19.9, 20.2, mat.blueSteel]]) {
        put(G.drum, c, dx, 0.58, dz, rng() * 2);
      }
      put(track(new THREE.BoxGeometry(1.9, 0.06, 1.1)), mat.timberDark, -19.2, 1.19, 19.7, 0.3);
      put(G.drum, mat.steelMid, -19.4, 1.8, 19.6, 1.2);
      put(G.drum, mat.redCabDark, -18.9, 1.8, 20.0, 2.2);
    }
    // engine hoist (shop crane) + hanging engine block, SW
    {
      const eh = new THREE.Group();
      eh.position.set(-14.4, 0, 20.4);
      eh.rotation.y = -2.55;
      group.add(eh);
      const legG = track(new THREE.BoxGeometry(0.09, 0.14, 1.7));
      put(legG, mat.safety, -0.45, 0.07, 0.55, 0, 0, 0, 1, eh);
      put(legG, mat.safety, 0.45, 0.07, 0.55, 0, 0, 0, 1, eh);
      put(track(new THREE.BoxGeometry(1.0, 0.14, 0.12)), mat.safety, 0, 0.07, -0.28, 0, 0, 0, 1, eh);
      put(track(new THREE.BoxGeometry(0.12, 1.7, 0.12)), mat.safety, 0, 0.92, -0.28, 0, 0, 0, 1, eh);
      const boom = put(track(new THREE.BoxGeometry(0.1, 0.14, 1.9)), mat.safety, 0, 1.86, 0.55, 0, 0, 0, 1, eh);
      boom.rotation.x = 0.18;
      put(track(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8)), mat.steelBright, 0, 1.25, 0.28, 0.62, 0, 0, 1, eh); // ram
      // chain + engine block (block + head + pulley)
      put(track(new THREE.CylinderGeometry(0.016, 0.016, 0.55, 6)), mat.steelDark, 0, 1.42, 1.38, 0, 0, 0, 1, eh, false);
      const eng = new THREE.Group();
      eng.position.set(0, 0.85, 1.38);
      eng.rotation.y = 0.4;
      eh.add(eng);
      put(track(new THREE.BoxGeometry(0.62, 0.5, 0.45)), mat.oily, 0, 0, 0, 0, 0, 0, 1, eng);
      put(track(new THREE.BoxGeometry(0.56, 0.16, 0.3)), mat.steelMid, 0, 0.33, 0, 0, 0, 0.06, 1, eng);
      put(track(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12)), mat.steelDark, 0, -0.05, 0.28, Math.PI / 2, 0, 0, 1, eng);
      // drip tray under it
      put(track(new THREE.BoxGeometry(0.8, 0.05, 0.6)), mat.steelDark, 0, 0.03, 1.38, 0, 0, 0, 1, eh);
    }
    // NORTH wall: second bench + red chest + engine on pallet + lamp
    workbench(3.2, -21.85, 0);
    pegboard(3.2, 2.62, -22.86, 0);
    toolChest(6.6, -21.4, 0.15, mat.redCab, mat.redCabDark);
    workLamp(3.2, -21.2);
    {
      put(track(new THREE.BoxGeometry(1.2, 0.11, 0.95)), mat.timberDark, 10.3, 0.06, -20.9, -0.15);
      const eng = new THREE.Group();
      eng.position.set(10.3, 0.42, -20.9);
      eng.rotation.y = 0.9;
      group.add(eng);
      put(track(new THREE.BoxGeometry(0.66, 0.52, 0.48)), mat.oily, 0, 0, 0, 0, 0, 0, 1, eng);
      put(track(new THREE.BoxGeometry(0.6, 0.17, 0.32)), mat.steelMid, 0, 0.34, 0, 0, 0, -0.05, 1, eng);
    }
    // NW: tarp-covered crate stack beside the existing crates
    {
      put(track(new THREE.BoxGeometry(1.6, 1.1, 1.2)), mat.olive, -16.6, 0.55, -19.9, 0.25);
      const tarp = put(track(new THREE.BoxGeometry(1.8, 0.16, 1.4)),
        track(shadowMat(new THREE.MeshStandardMaterial({ color: 0x3f4438, roughness: 0.92, metalness: 0 }))),
        -16.6, 1.16, -19.9, 0.25);
      tarp.rotation.z = 0.04;
    }

    // --- FLOOR: bay outlines, oil, skids, painted spur lane ------------------
    const outlineMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(makeBayOutlineTexture())), transparent: true, depthWrite: false,
    }));
    for (const [bx, bz, ry2, w, h] of [[16.4, -13.6, -0.55, 9.4, 7.2], [15.3, 16.2, -2.03, 9.6, 7.4]]) {
      const q = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), outlineMat);
      q.rotation.set(-Math.PI / 2, 0, ry2);
      q.scale.set(w, h, 1);
      q.position.set(bx, 0.024, bz);
      group.add(q);
    }
    for (const [sx, sz, ss] of [[17.2, -13.2, 3.2], [15.6, 15.8, 3.6], [21.3, -6.4, 2.0], [11.6, 19.2, 1.7], [-14.2, 19.8, 2.2], [3.4, -20.7, 1.9]]) {
      const stain = new THREE.Mesh(track(new THREE.PlaneGeometry(ss, ss)), stainMat);
      stain.rotation.set(-Math.PI / 2, 0, rng() * Math.PI);
      stain.position.set(sx, 0.021 + rng() * 0.004, sz);
      group.add(stain);
    }
    const skidMat = track(new THREE.MeshBasicMaterial({
      map: track(canvasTexture(makeSkidTexture())), transparent: true, depthWrite: false,
    }));
    for (const [kx, kz, kry, kw] of [[8.2, 14.6, -1.15, 9], [12.8, -8.4, 2.5, 8]]) {
      const skid = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 0.5)), skidMat);
      skid.rotation.set(-Math.PI / 2, 0, kry);
      skid.scale.set(kw, kw, 1);
      skid.position.set(kx, 0.027, kz);
      group.add(skid);
    }
    // painted guide spur splitting from the center lane toward bay A
    {
      const laneC = document.createElement('canvas');
      laneC.width = 256; laneC.height = 32;
      const lg2 = laneC.getContext('2d');
      lg2.strokeStyle = 'rgba(196,164,44,0.42)';
      lg2.lineWidth = 12;
      lg2.setLineDash([30, 20]);
      lg2.beginPath();
      lg2.moveTo(0, 16); lg2.lineTo(256, 16);
      lg2.stroke();
      const laneMat = track(new THREE.MeshBasicMaterial({
        map: track(canvasTexture(laneC)), transparent: true, depthWrite: false,
      }));
      const lane = new THREE.Mesh(track(new THREE.PlaneGeometry(11, 1.2)), laneMat);
      lane.rotation.set(-Math.PI / 2, 0, 0.62);
      lane.position.set(11.2, 0.023, -6.8);
      group.add(lane);
    }
  });

  // ==========================================================================
  // CHUNK 2 — BAY A (NE corner): Tiger I on jack stands, turret craned off a
  // gantry. The tank is a real roster build (procedural-of-record), dimmed so
  // the pedestal hero keeps the light.
  // ==========================================================================
  chunks.push(function buildBayA() {
    const vis = createTank(BAY_A_SPEC, engineCtx, { camoSeed: 777, ...BAY_TANK_OPTS });
    tankVisuals.push(vis);
    vis.root.name = 'dressing_tank_a'; // never 'tank_*': scene scans skip it
    vis.root.rotation.y = -0.55;
    vis.root.position.set(17.8, 0.42, -15.5); // hull raised on stands
    group.add(vis.root);
    dimVisual(vis, 0.6);
    // lifted turret: up off the ring, slightly slewed + swaying on the chains
    const tur = vis.root.getObjectByName('rig_turret');
    if (tur) {
      tur.position.y += 0.55;
      tur.rotation.y += 0.14;
      tur.rotation.z += 0.025;
    }
    // jack stands under the four hull corners (tank-local offsets so the
    // stands track the hull placement)
    const standCone = track(new THREE.CylinderGeometry(0.14, 0.3, 0.42, 4));
    const standPost = track(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8));
    const holder = new THREE.Group();
    holder.rotation.y = -0.55;
    holder.position.set(17.8, 0, -15.5);
    group.add(holder);
    for (const [ox, oz] of [[-1.15, -2.2], [1.15, -2.2], [-1.15, 2.2], [1.15, 2.2]]) {
      const s = new THREE.Group();
      s.position.set(ox, 0, oz);
      s.rotation.y = 0.4;
      holder.add(s);
      put(standCone, mat.safety, 0, 0.21, 0, 0, 0, 0, 1, s);
      put(standPost, mat.steelBright, 0, 0.5, 0, 0, 0, 0, 1, s);
      put(track(new THREE.BoxGeometry(0.22, 0.06, 0.14)), mat.steelDark, 0, 0.62, 0, 0, 0, 0, 1, s);
    }
    // gantry crane straddling the bay (worn safety-yellow, hazard tape on the
    // beam) — legs verified outside the orbit camera's reach envelope
    const gan = new THREE.Group();
    gan.position.set(17.8, 0, -15.5);
    gan.rotation.y = -0.55;
    group.add(gan);
    const hazTex = track(canvasTexture(makeHazardTexture(), { aniso, repeat: [4, 1] }));
    const beamMat = track(shadowMat(new THREE.MeshStandardMaterial({
      map: hazTex, roughness: 0.6, metalness: 0.3,
    })));
    const legG = track(new THREE.BoxGeometry(0.14, 4.9, 0.14));
    for (const [lx, lz] of [[-2.4, -3.2], [2.4, -3.2], [-2.4, 3.2], [2.4, 3.2]]) {
      put(legG, mat.safety, lx, 2.45, lz, 0, 0, lx > 0 ? -0.06 : 0.06, 1, gan);
    }
    // A-frame cross braces
    const braceG = track(new THREE.BoxGeometry(0.09, 2.6, 0.09));
    for (const lz of [-3.2, 3.2]) {
      put(braceG, mat.steelMid, -1.2, 1.3, lz, 0, 0, 1.08, 1, gan);
      put(braceG, mat.steelMid, 1.2, 1.3, lz, 0, 0, -1.08, 1, gan);
    }
    put(track(new THREE.BoxGeometry(0.26, 0.3, 7.1)), beamMat, 0, 4.92, 0, 0, 0, 0, 1, gan); // main beam
    put(track(new THREE.BoxGeometry(0.4, 0.06, 7.1)), mat.steelDark, 0, 4.74, 0, 0, 0, 0, 1, gan); // lower flange
    // trolley + chain fall down to the lifted turret roof (~y 3.9 raised)
    put(track(new THREE.BoxGeometry(0.42, 0.3, 0.5)), mat.steelDark, 0, 4.6, 0.4, 0, 0, 0, 1, gan);
    const chainG = track(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6));
    put(chainG, mat.steelBright, -0.16, 4.1, 0.4, 0, 0, 0.12, 1, gan, false);
    put(chainG, mat.steelBright, 0.16, 4.1, 0.4, 0, 0, -0.12, 1, gan, false);
    put(track(new THREE.BoxGeometry(0.3, 0.16, 0.16)), mat.steelDark, 0, 3.72, 0.4, 0, 0, 0, 1, gan); // hook block
    // drop light on a cable from the beam + work pool under the hull
    put(track(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 6)), mat.rubber, 0.05, 3.8, -1.4, 0, 0, 0, 1, gan, false);
    const bulb = put(track(new THREE.SphereGeometry(0.06, 8, 6)), mat.lamp, 0.05, 2.72, -1.4, 0, 0, 0, 1, gan, false);
    bulb.castShadow = false;
    put(track(new THREE.CylinderGeometry(0.09, 0.07, 0.16, 10)), mat.steelDark, 0.05, 2.82, -1.4, 0, 0, 0, 1, gan, false);
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(7.5, 7.5)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(17.4, 0.03, -14.9);
    group.add(pool);
    // shop clutter around the bay: floor jack + toolbox + loose wrench board
    toolChest(14.2, -18.6, -0.4, mat.blueSteel, mat.steelDark, 0.9);
    const jack = new THREE.Group();
    jack.position.set(15.2, 0, -12.4);
    jack.rotation.y = 0.7;
    group.add(jack);
    put(track(new THREE.BoxGeometry(0.7, 0.12, 0.3)), mat.redCab, 0, 0.09, 0, 0, 0, 0, 1, jack);
    put(track(new THREE.BoxGeometry(0.5, 0.08, 0.22)), mat.redCab, -0.05, 0.2, 0, 0, 0, 0.22, 1, jack);
    put(track(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8)), mat.steelDark, 0.35, 0.32, 0, 0, 0, -0.9, 1, jack);
    for (const [wx2, wz2] of [[-0.28, 0.12], [-0.28, -0.12], [0.3, 0.12], [0.3, -0.12]]) {
      put(G.caster, mat.steelDark, wx2, 0.06, wz2, 0, 0, Math.PI / 2, 1, jack, false);
    }
  });

  // ==========================================================================
  // CHUNK 3 — BAY B (SE corner): Panther G with its side skirts pulled off and
  // leaning on the hull, toolboxes + creeper + oil pan around, weld glow.
  // ==========================================================================
  chunks.push(function buildBayB() {
    const vis = createTank(BAY_B_SPEC, engineCtx, { camoSeed: 4242, ...BAY_TANK_OPTS });
    tankVisuals.push(vis);
    vis.root.name = 'dressing_tank_b';
    vis.root.rotation.y = -2.03;
    vis.root.position.set(16.9, 0, 17.7);
    group.add(vis.root);
    dimVisual(vis, 0.55);
    const tur = vis.root.getObjectByName('rig_turret');
    if (tur) tur.rotation.y -= 0.38;            // turret slewed for gun work
    const gun = vis.root.getObjectByName('rig_gun');
    if (gun) gun.rotation.x -= 0.05;            // barrel nudged up
    // side skirts pulled: three plates leaning on the room-facing flank + one
    // against the wall (tank-local frame so they hug the hull line)
    const skirt = new THREE.Group();
    skirt.position.set(16.9, 0, 17.7);
    skirt.rotation.y = -2.03;
    group.add(skirt);
    const plateG = track(new THREE.BoxGeometry(1.7, 0.85, 0.045));
    const plateMat2 = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0x3a3d33, roughness: 0.6, metalness: 0.45,
    })));
    // room-facing flank is tank-local -x at this parking yaw (+x faces the
    // south wall): lean the pulled plates where the orbit camera can see them
    for (const [pz, lean] of [[-1.5, 0.34], [0.1, 0.3], [1.6, 0.38]]) {
      const p = put(plateG, plateMat2, -2.05, 0.42, pz, 0, 0, 0, 1, skirt);
      // face the hull flank, then lean the TOP onto the fender: the lean must
      // be OUTERMOST (about the tank-frame Z), so order ZYX — plain XYZ would
      // spin the plate around its own normal instead.
      p.rotation.order = 'ZYX';
      p.rotation.set(0, Math.PI / 2, -lean);
    }
    // one plate flat on the floor beside the tank
    const flat = put(plateG, plateMat2, -3.1, 0.03, 0.6, 0, 0, 0, 1, skirt);
    flat.rotation.set(-Math.PI / 2, 0, 0.4);
    // toolboxes + tool tray on the engine deck + creeper + oil pan
    toolChest(12.6, 15.4, 2.6, mat.redCab, mat.redCabDark);
    toolChest(14.0, 20.6, -2.0, mat.olive, mat.steelDark, 0.72);
    const tray = put(track(new THREE.BoxGeometry(0.5, 0.07, 0.32)), mat.steelBright, 0.2, 1.72, -2.2, 0.3, 0, 0, 1, skirt);
    tray.castShadow = false;
    put(track(new THREE.CylinderGeometry(0.28, 0.32, 0.09, 14)), mat.oily, 14.9, 0.05, 15.9, 0);
    const creeper = new THREE.Group();
    creeper.position.set(14.35, 0, 17.1);
    creeper.rotation.y = 1.1;
    group.add(creeper);
    put(track(new THREE.BoxGeometry(0.55, 0.05, 1.35)), mat.redCabDark, 0, 0.09, 0, 0, 0, 0, 1, creeper);
    for (const [cx2, cz2] of [[-0.2, -0.55], [0.2, -0.55], [-0.2, 0.55], [0.2, 0.55]]) {
      put(G.caster, mat.steelDark, cx2, 0.045, cz2, 0, 0, Math.PI / 2, 0.7, creeper, false);
    }
    // weld cable from the south-wall cart to a clamp on the leaning skirt,
    // with the faint arc-afterglow at the clamp (emissive + sprite, no light)
    const cableMat2 = track(shadowMat(new THREE.MeshStandardMaterial({
      color: 0x141618, roughness: 0.88, metalness: 0.05,
    })));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(11.6, 0.22, 19.6),
      new THREE.Vector3(13.2, 0.05, 18.6),
      new THREE.Vector3(15.4, 0.05, 17.0),
      new THREE.Vector3(17.35, 0.4, 15.95),
    ]);
    const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 24, 0.035, 7)), cableMat2);
    tube.castShadow = true;
    group.add(tube);
    const weldTip = put(track(new THREE.SphereGeometry(0.028, 8, 6)),
      track(new THREE.MeshBasicMaterial({ color: 0xffe0b0 })), 17.4, 0.45, 15.92, 0, 0, 0, 1, group, false);
    weldTip.castShadow = false;
    const glowMat2 = track(new THREE.SpriteMaterial({
      map: track(canvasTexture(makePoolTexture('rgba(255,208,140,0.5)', 'rgba(255,160,70,0.14)'))),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const spark2 = new THREE.Sprite(glowMat2);
    spark2.scale.setScalar(0.7);
    spark2.position.set(17.4, 0.47, 15.92);
    group.add(spark2);
    // dim work pool under the bay
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 7)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(15.9, 0.03, 16.6);
    group.add(pool);
    workLamp(15.9, 16.6, 0, 7.4); // fixture only — the pool above is its throw
  });

  /** Darken a repair tank so it never competes with the pedestal hero. */
  function dimVisual(vis, k) {
    vis.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.color) m.color.multiplyScalar(k);
        if (m.emissive) m.emissiveIntensity = (m.emissiveIntensity || 1) * 0.4;
      }
    });
  }

  // sign plates bake before the webfont settles — refresh them once it lands
  // (same contract as garageStage's own signs)
  if (document.fonts && !document.fonts.check(SIGN_FONT)) {
    document.fonts.ready
      .then(() => { for (const t of signTextures) t.needsUpdate = true; })
      .catch(() => {});
  }

  let next = 0;
  return {
    group,
    /** Build the next chunk. @returns {boolean} true while more chunks remain */
    pump() {
      if (next >= chunks.length) return false;
      const fn = chunks[next++];
      try { fn(); } catch (e) {
        console.warn(`[garageDressing] chunk '${fn.name}' failed —`, e.message);
      }
      return next < chunks.length;
    },
    /** Force-finish every chunk (deterministic __SHOTS garage capture). */
    ensureBuilt() {
      while (this.pump()) { /* drain */ }
    },
    isBuilt() { return next >= chunks.length; },
    dispose() {
      for (const v of tankVisuals) { try { v.dispose(); } catch (_) { /* shared refs */ } }
      tankVisuals.length = 0;
      for (const o of disposables) if (o && o.dispose) o.dispose();
      disposables.length = 0;
    },
  };
}
