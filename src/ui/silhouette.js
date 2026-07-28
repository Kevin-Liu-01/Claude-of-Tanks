// src/ui/silhouette.js — side-view tank silhouette thumbnails, shared by the
// garage carousel and the tech tree. Rendered from a spec's dimensions AND
// class/era so vehicles read differently:
//  - modern MBT: long low hull, side skirts, flat angular turret, slim long
//    gun with a thermal-sleeve bulge
//  - WWII heavy: tall slab-sided hull, exposed overlapped wheels, big boxy
//    centered turret with cupola, thick gun with muzzle brake
//  - WWII medium/light: sloped glacis, rounded dome turret, plain medium gun
// Light-on-dark, WoT carousel style.

/**
 * Draw a silhouette into `canvas` (sets its size).
 * @param {HTMLCanvasElement} canvas
 * @param {{dims:{hullLengthM:number,overallLengthM:number,heightM:number},era:string,class:string}} spec
 *   real TankSpec or a pseudo-spec with just dims/era/class
 * @param {{w?:number,h?:number,color?:string}} [opts] css size + fill color
 */
export function drawSilhouette(canvas, spec, opts = {}) {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const W = opts.w || 108, H = opts.h || 34;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = spec.dims;
  const overall = Math.max(d.overallLengthM, d.hullLengthM);
  const s = (W - 8) / overall;
  const hullLen = d.hullLengthM * s;
  const x0 = 4 + (W - 8 - overall * s) / 2;
  const groundY = H - 2;
  const modern = spec.era !== 'ww2';
  const heavy = spec.class === 'heavy';
  const wheelR = Math.max(2.2, d.heightM * (heavy ? 0.19 : 0.15) * s);
  // modern hulls sit low; ww2 heavies are tall slabs
  const hullH = Math.max(5, d.heightM * (modern ? 0.30 : heavy ? 0.44 : 0.36) * s);
  const hullTop = groundY - wheelR - hullH;
  const turH = Math.max(3.5, d.heightM * (modern ? 0.20 : heavy ? 0.30 : 0.26) * s);
  c.fillStyle = opts.color || 'rgba(206,220,232,0.88)';
  // running gear
  if (modern) {
    // side skirt covering the wheel tops, wheels peeking below
    const n = 7;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.arc(x0 + wheelR + ((i + 0.5) / n) * (hullLen - wheelR * 2), groundY - wheelR, wheelR, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(x0 + 1, groundY - wheelR * 1.7, hullLen - 2, wheelR * 0.9);
  } else {
    const n = heavy ? 8 : 5; // overlapped wheel train on heavies
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.arc(x0 + wheelR + ((i + 0.5) / n) * (hullLen - wheelR * 2), groundY - wheelR, wheelR, 0, Math.PI * 2);
      c.fill();
    }
    // track return run
    c.fillRect(x0 + wheelR * 0.4, groundY - wheelR * 2 - 1, hullLen - wheelR * 0.8, 1.6);
  }
  // hull (front faces right)
  c.beginPath();
  if (modern) {
    // long wedge: sharply raked glacis, low profile
    c.moveTo(x0, hullTop + hullH * 0.3);
    c.lineTo(x0 + hullLen * 0.08, hullTop);
    c.lineTo(x0 + hullLen * 0.62, hullTop);
    c.lineTo(x0 + hullLen, hullTop + hullH * 0.72);
    c.lineTo(x0 + hullLen, hullTop + hullH);
    c.lineTo(x0, hullTop + hullH);
  } else if (heavy) {
    // near-vertical slab box (Tiger/IS profile)
    c.moveTo(x0, hullTop + hullH * 0.12);
    c.lineTo(x0 + hullLen * 0.05, hullTop);
    c.lineTo(x0 + hullLen * 0.95, hullTop);
    c.lineTo(x0 + hullLen, hullTop + hullH * 0.28);
    c.lineTo(x0 + hullLen, hullTop + hullH);
    c.lineTo(x0, hullTop + hullH);
  } else {
    // medium: long sloped glacis (T-34 profile)
    c.moveTo(x0, hullTop + hullH * 0.4);
    c.lineTo(x0 + hullLen * 0.14, hullTop);
    c.lineTo(x0 + hullLen * 0.68, hullTop);
    c.lineTo(x0 + hullLen, hullTop + hullH * 0.95);
    c.lineTo(x0 + hullLen, hullTop + hullH);
    c.lineTo(x0, hullTop + hullH);
  }
  c.closePath();
  c.fill();
  // turret
  const tx = x0 + hullLen * (modern ? 0.30 : heavy ? 0.30 : 0.36);
  const tw = hullLen * (modern ? 0.40 : heavy ? 0.40 : 0.28);
  c.beginPath();
  if (modern) {
    // flat angular slab turret with bustle overhang at the rear
    c.moveTo(tx - tw * 0.08, hullTop);
    c.lineTo(tx + tw * 0.06, hullTop - turH);
    c.lineTo(tx + tw * 0.86, hullTop - turH);
    c.lineTo(tx + tw, hullTop);
    c.closePath();
    c.fill();
  } else if (heavy) {
    // big box turret + commander cupola
    c.rect(tx, hullTop - turH, tw, turH);
    c.fill();
    c.fillRect(tx + tw * 0.18, hullTop - turH - 2.4, tw * 0.3, 2.6);
  } else {
    // rounded dome turret
    c.moveTo(tx, hullTop);
    c.quadraticCurveTo(tx + tw * 0.1, hullTop - turH * 1.15, tx + tw * 0.55, hullTop - turH);
    c.quadraticCurveTo(tx + tw * 0.95, hullTop - turH * 0.85, tx + tw, hullTop);
    c.closePath();
    c.fill();
  }
  // gun barrel from turret front to overall length
  const gy = hullTop - turH * 0.45;
  const gunX0 = tx + tw * 0.8;
  const gunX1 = x0 + overall * s;
  const gunTh = modern ? 2.0 : heavy ? 2.6 : 1.8;
  c.fillRect(gunX0, gy - gunTh / 2, gunX1 - gunX0, gunTh);
  if (modern) {
    // thermal sleeve / bore evacuator bulge mid-barrel
    const bx = gunX0 + (gunX1 - gunX0) * 0.45;
    c.fillRect(bx, gy - gunTh / 2 - 1, (gunX1 - gunX0) * 0.18, gunTh + 2);
  } else if (heavy) {
    // muzzle brake block at the tip
    c.fillRect(gunX1 - 4.5, gy - gunTh / 2 - 1.2, 4.5, gunTh + 2.4);
  }
}
