// src/ui/garageStage.js — procedural garage hangar environment for the
// tank-select screen: concrete floor with painted bay markings and grime,
// corrugated-steel walls, ceiling with trusses, wall-mounted flood fixtures
// with real lights, a hazard-striped display podium and workshop props.
// 100% generated (canvas textures + primitive geometry) — no assets.
//
// Usage (integration, src/main.js):
//   const stage = createGarageStage(engineCtx, GARAGE_POS);
//   scene.add(stage.group);
// This replaces the bare pad + apron discs. The two integration-owned
// showcase spotlights can stay — the stage's own fixtures complement them.
import * as THREE from 'three';

// deterministic PRNG (mulberry32) so the hangar is identical every boot
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(c, { srgb = true, aniso = 4, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// fine noise dither pass — kills flat-fill banding under light falloff
function dither(c2d, w, h, rng, alpha = 0.05) {
  const img = c2d.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 255 * alpha;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  c2d.putImageData(img, 0, 0);
}

// --- concrete floor texture: grime, expansion joints, painted bay, treads ---
function makeFloorTexture(rng) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#585b5e';
  g.fillRect(0, 0, S, S);
  // large tonal blotches
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S, r = 30 + rng() * 130;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dk = rng() < 0.5;
    grad.addColorStop(0, dk ? 'rgba(38,40,42,0.16)' : 'rgba(120,124,128,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // oil stains near center bay
  for (let i = 0; i < 7; i++) {
    const x = S / 2 + (rng() - 0.5) * 380, y = S / 2 + (rng() - 0.5) * 380;
    const r = 12 + rng() * 42;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(18,18,20,0.34)');
    grad.addColorStop(0.7, 'rgba(18,18,20,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // expansion joints (4x4 slabs)
  g.strokeStyle = 'rgba(24,26,28,0.75)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo((S / 4) * i, 0); g.lineTo((S / 4) * i, S);
    g.moveTo(0, (S / 4) * i); g.lineTo(S, (S / 4) * i);
  }
  g.stroke();
  g.strokeStyle = 'rgba(150,154,158,0.25)'; // joint highlight edge
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo((S / 4) * i + 2, 0); g.lineTo((S / 4) * i + 2, S);
    g.moveTo(0, (S / 4) * i + 2); g.lineTo(S, (S / 4) * i + 2);
  }
  g.stroke();
  // painted service-bay box around the podium (worn yellow)
  g.strokeStyle = 'rgba(196,164,44,0.55)';
  g.lineWidth = 9;
  g.setLineDash([46, 26]);
  g.strokeRect(S * 0.22, S * 0.22, S * 0.56, S * 0.56);
  g.setLineDash([]);
  // white guide line leading to the bay door
  g.strokeStyle = 'rgba(208,212,216,0.4)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(S / 2, S * 0.78); g.lineTo(S / 2, S * 0.98);
  g.stroke();
  // tank tread scuff arcs through the bay
  for (let k = 0; k < 2; k++) {
    const off = (k - 0.5) * 120;
    g.strokeStyle = 'rgba(30,32,34,0.35)';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(S / 2 + off, S);
    g.quadraticCurveTo(S / 2 + off * 1.3, S * 0.6, S / 2 + off, S * 0.42);
    g.stroke();
    // tread cleat marks inside the scuff
    g.strokeStyle = 'rgba(20,22,24,0.4)';
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const y = S - t * S * 0.58;
      g.beginPath();
      g.moveTo(S / 2 + off - 12, y); g.lineTo(S / 2 + off + 12, y - 6);
      g.stroke();
    }
  }
  // speckle
  for (let i = 0; i < 2600; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(30,32,34,0.2)' : 'rgba(150,155,160,0.14)';
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  dither(g, S, S, rng, 0.06);
  return c;
}

// --- corrugated steel wall texture (vertical ribs + girders + grime) --------
function makeWallTexture(rng) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // base panel color
  g.fillStyle = '#3d4349';
  g.fillRect(0, 0, W, H);
  // vertical corrugation ribs (light/shadow pairs, 16px pitch)
  for (let x = 0; x < W; x += 16) {
    const lg = g.createLinearGradient(x, 0, x + 16, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.10)');
    lg.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    lg.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    lg.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = lg;
    g.fillRect(x, 0, 16, H);
  }
  // horizontal panel seams + girder shadow lines
  for (const y of [H * 0.3, H * 0.62]) {
    g.fillStyle = 'rgba(14,16,18,0.5)';
    g.fillRect(0, y, W, 4);
    g.fillStyle = 'rgba(190,200,210,0.10)';
    g.fillRect(0, y + 4, W, 2);
  }
  // concrete wainscot base band
  g.fillStyle = '#4a4c4e';
  g.fillRect(0, H * 0.86, W, H * 0.14);
  g.fillStyle = 'rgba(20,22,24,0.55)';
  g.fillRect(0, H * 0.86, W, 3);
  // hazard stripe strip on the wainscot
  for (let x = 0; x < W; x += 40) {
    g.fillStyle = (x / 40) % 2 ? '#8a7420' : '#26282a';
    g.beginPath();
    g.moveTo(x, H * 0.905); g.lineTo(x + 20, H * 0.905);
    g.lineTo(x + 40, H * 0.955); g.lineTo(x + 20, H * 0.955);
    g.closePath(); g.fill();
  }
  // rust streaks from seams
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, y0 = H * (0.28 + rng() * 0.36), len = 20 + rng() * 90;
    const lg = g.createLinearGradient(0, y0, 0, y0 + len);
    lg.addColorStop(0, 'rgba(96,62,34,0.30)');
    lg.addColorStop(1, 'rgba(96,62,34,0)');
    g.fillStyle = lg;
    g.fillRect(x, y0, 2 + rng() * 3, len);
  }
  // top grime gradient
  const tg = g.createLinearGradient(0, 0, 0, 90);
  tg.addColorStop(0, 'rgba(10,12,14,0.5)');
  tg.addColorStop(1, 'rgba(10,12,14,0)');
  g.fillStyle = tg;
  g.fillRect(0, 0, W, 90);
  dither(g, W, H, rng, 0.05);
  return c;
}

// hazard-stripe band for the podium rim
function makeHazardTexture() {
  const W = 512, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a22c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c1e20';
  for (let x = -H; x < W + H; x += 64) {
    g.beginPath();
    g.moveTo(x, H); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, H);
    g.closePath(); g.fill();
  }
  // wear
  for (let i = 0; i < 240; i++) {
    g.fillStyle = 'rgba(70,72,74,0.35)';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  return c;
}

/**
 * Build the hangar environment group centered on the garage pedestal.
 * @param {{setupShadowMaterial:Function,anisotropy:number}} engineCtx
 * @param {THREE.Vector3} pos - garage stage center (ground level)
 * @returns {{group:THREE.Group, dispose:Function}}
 */
export function createGarageStage(engineCtx, pos) {
  const rng = mulberry32(90210);
  const group = new THREE.Group();
  group.position.copy(pos);
  const aniso = (engineCtx && engineCtx.anisotropy) || 4;
  const shadowMat = (m) => {
    if (engineCtx && engineCtx.setupShadowMaterial) engineCtx.setupShadowMaterial(m);
    return m;
  };
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const HW = 23; // hangar half-width (camera at +8.2/+8.8 stays well inside)
  const WALL_H = 10;

  // --- floor ---------------------------------------------------------------
  const floorTex = track(canvasTexture(makeFloorTexture(rng), { aniso }));
  const floorMat = shadowMat(new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.55,
  }));
  track(floorMat);
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(HW * 2, HW * 2)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  group.add(floor);

  // subtle contact-glow pool under the podium (fake bounce light)
  const poolC = document.createElement('canvas');
  poolC.width = poolC.height = 256;
  const pg = poolC.getContext('2d');
  const pgrad = pg.createRadialGradient(128, 128, 10, 128, 128, 128);
  pgrad.addColorStop(0, 'rgba(255,238,205,0.30)');
  pgrad.addColorStop(0.55, 'rgba(255,238,205,0.10)');
  pgrad.addColorStop(1, 'rgba(255,238,205,0)');
  pg.fillStyle = pgrad;
  pg.fillRect(0, 0, 256, 256);
  const poolTex = track(canvasTexture(poolC));
  const poolMat = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(20, 20)), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  group.add(pool);

  // --- podium (hazard-striped rim + concrete top) ---------------------------
  const hazTex = track(canvasTexture(makeHazardTexture(), { aniso, repeat: [6, 1] }));
  const podSideMat = shadowMat(new THREE.MeshStandardMaterial({
    map: hazTex, roughness: 0.7, metalness: 0.05,
  }));
  const podTopMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x54575b, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.7,
  }));
  track(podSideMat); track(podTopMat);
  const podium = new THREE.Mesh(
    track(new THREE.CylinderGeometry(6, 6.35, 0.36, 56)),
    [podSideMat, podTopMat, podTopMat],
  );
  podium.position.y = 0.18;
  podium.receiveShadow = true;
  podium.castShadow = true;
  group.add(podium);

  // --- walls + ceiling -------------------------------------------------------
  const wallTexBase = makeWallTexture(rng);
  const wallMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(wallTexBase, { aniso, repeat: [3, 1] })),
    roughness: 0.78, metalness: 0.25, envMapIntensity: 0.35,
  }));
  track(wallMat);
  const wallGeo = track(new THREE.PlaneGeometry(HW * 2, WALL_H));
  for (const [rx, ry, x, z] of [
    [0, 0, 0, -HW],            // north (faces +z, behind the tank in frame)
    [0, Math.PI, 0, HW],       // south
    [0, Math.PI / 2, -HW, 0],  // west (left in frame)
    [0, -Math.PI / 2, HW, 0],  // east
  ]) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.rotation.set(rx, ry, 0);
    wall.position.set(x, WALL_H / 2, z);
    wall.receiveShadow = true;
    group.add(wall);
  }
  const ceilMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x1e2124, roughness: 0.95, metalness: 0.1,
  }));
  track(ceilMat);
  const ceiling = new THREE.Mesh(track(new THREE.PlaneGeometry(HW * 2, HW * 2)), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  group.add(ceiling);
  // roof trusses
  const trussMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x33383d, roughness: 0.6, metalness: 0.5,
  }));
  track(trussMat);
  const trussGeo = track(new THREE.BoxGeometry(HW * 2, 0.5, 0.22));
  for (let i = -1; i <= 1; i++) {
    const truss = new THREE.Mesh(trussGeo, trussMat);
    truss.position.set(0, WALL_H - 0.35, i * 12);
    group.add(truss);
  }

  // --- light fixtures (visible housings + real lights) -----------------------
  const housingMat = shadowMat(new THREE.MeshStandardMaterial({
    color: 0x26292c, roughness: 0.5, metalness: 0.6,
  }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfff2d4 }));
  track(housingMat);
  const target = new THREE.Object3D();
  target.position.set(0, 1.2, 0);
  group.add(target);

  // two hanging highbay lamps over the bay (cone shade + glowing disc)
  const shadeGeo = track(new THREE.CylinderGeometry(0.16, 0.85, 0.6, 20));
  const glowGeo = track(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 20));
  const cableGeo = track(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6));
  for (const [hx, hz] of [[-4.5, -3.5], [5, 2.5]]) {
    const shade = new THREE.Mesh(shadeGeo, housingMat);
    shade.position.set(hx, 7.6, hz);
    const glow = new THREE.Mesh(glowGeo, lampMat);
    glow.position.set(hx, 7.32, hz);
    const cable = new THREE.Mesh(cableGeo, housingMat);
    cable.position.set(hx, 8.7, hz);
    group.add(shade, glow, cable);
    const pt = new THREE.PointLight(0xffe9c4, 42, 26, 1.9);
    pt.position.set(hx, 7.1, hz);
    group.add(pt);
  }

  // three wall floods on the visible (north/west) walls, aimed at the podium
  const floodGeo = track(new THREE.BoxGeometry(0.7, 0.42, 0.3));
  const floodLensGeo = track(new THREE.PlaneGeometry(0.56, 0.3));
  const armGeo = track(new THREE.BoxGeometry(0.1, 0.1, 0.5));
  // (the third housing is dressing only — keeps the scene's total live light
  // count low since three.js evaluates every light in every shader)
  const floods = [
    { p: new THREE.Vector3(-6, 6.8, -HW + 0.3), i: 55 },
    { p: new THREE.Vector3(7, 6.8, -HW + 0.3), i: 55 },
    { p: new THREE.Vector3(-HW + 0.3, 6.8, 4), i: 0 },
  ];
  for (const f of floods) {
    const holder = new THREE.Group();
    holder.position.copy(f.p);
    const arm = new THREE.Mesh(armGeo, housingMat);
    arm.position.z = 0.2;
    const box = new THREE.Mesh(floodGeo, housingMat);
    box.position.z = 0.5;
    const lens = new THREE.Mesh(floodLensGeo, lampMat);
    lens.position.z = 0.66;
    holder.add(arm, box, lens);
    group.add(holder);
    // aim the housing at the podium (lookAt works in world space)
    holder.lookAt(new THREE.Vector3(0, 1.2, 0).add(group.position));
    if (f.i > 0) {
      const spot = new THREE.SpotLight(0xf4ead6, f.i, 46, 0.62, 0.55, 1.5);
      spot.position.copy(f.p);
      spot.target = target;
      group.add(spot);
    }
  }

  // --- props: crates, barrels, tires, tool cabinet, workbench ----------------
  const crateTexC = document.createElement('canvas');
  crateTexC.width = crateTexC.height = 128;
  {
    const g = crateTexC.getContext('2d');
    g.fillStyle = '#6d5a38';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,30,16,0.8)';
    g.lineWidth = 5;
    g.strokeRect(4, 4, 120, 120);
    g.beginPath();
    g.moveTo(4, 4); g.lineTo(124, 124); g.moveTo(124, 4); g.lineTo(4, 124);
    g.stroke();
    for (let i = 0; i < 250; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,22,10,0.25)' : 'rgba(150,130,90,0.2)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 6);
    }
  }
  const crateMat = shadowMat(new THREE.MeshStandardMaterial({
    map: track(canvasTexture(crateTexC, { aniso })), roughness: 0.85, metalness: 0,
  }));
  track(crateMat);
  const crateGeo = track(new THREE.BoxGeometry(1.5, 1.5, 1.5));
  for (const [cx2, cy2, cz2, ry2, s] of [
    [-13, 0.75, -20.5, 0.2, 1],
    [-14.8, 0.6, -19.2, -0.35, 0.8],
    [-13.4, 2.0, -20.3, 0.5, 0.75],
    [16, 0.75, -19.8, 0.1, 1],
  ]) {
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(cx2, cy2, cz2);
    crate.rotation.y = ry2;
    crate.scale.setScalar(s);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
  }
  const barrelGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16));
  for (const [bx, bz, col] of [[-9.5, -20.8, 0x7a2e26], [-8.6, -20.4, 0x2e4d6b], [-9.0, -19.6, 0x5a5f4a]]) {
    const bm = shadowMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.35 }));
    track(bm);
    const barrel = new THREE.Mesh(barrelGeo, bm);
    barrel.position.set(bx, 0.58, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
  }
  // tire stack
  const tireMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.95, metalness: 0 }));
  track(tireMat);
  const tireGeo = track(new THREE.TorusGeometry(0.55, 0.22, 10, 22));
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(-20.6, 0.24 + i * 0.42, -12 + i * 0.06);
    tire.castShadow = true;
    group.add(tire);
  }
  // red tool cabinet + workbench along the west wall
  const cabMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x8c2f28, roughness: 0.4, metalness: 0.45 }));
  track(cabMat);
  const cab = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 1.7, 0.8)), cabMat);
  cab.position.set(-21.8, 0.85, -4);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);
  const benchTopMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x6d5a38, roughness: 0.8 }));
  const benchLegMat = shadowMat(new THREE.MeshStandardMaterial({ color: 0x2c2f32, roughness: 0.55, metalness: 0.5 }));
  track(benchTopMat); track(benchLegMat);
  const benchTop = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.12, 1)), benchTopMat);
  benchTop.position.set(-21.6, 1.0, 1.5);
  benchTop.castShadow = true;
  group.add(benchTop);
  const legGeo = track(new THREE.BoxGeometry(0.1, 1.0, 0.1));
  for (const [lx, lz] of [[-1.55, -0.4], [1.55, -0.4], [-1.55, 0.4], [1.55, 0.4]]) {
    const leg = new THREE.Mesh(legGeo, benchLegMat);
    leg.position.set(-21.6 + lx, 0.5, 1.5 + lz);
    group.add(leg);
  }

  return {
    group,
    dispose() {
      for (const o of disposables) if (o && o.dispose) o.dispose();
    },
  };
}
