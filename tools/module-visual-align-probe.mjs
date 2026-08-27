// tools/module-visual-align-probe.mjs — ARMOR/MODULE hitboxes vs the BUILT
// VISUAL (module_hitbox r1). The fidelity program re-lofted every hull/turret
// from measured curves; the armor models (plates + module boxes) are authored
// separately in the spec files and can go stale — shots aimed at rendered
// features then miss the armor envelope or roll the wrong module.
//
// For each vehicle this probe builds the real pedestal visual (GLB swap
// awaited), scans rendered vertices in the hull-local frame classified by rig
// subtree (rig_turret vs hull) and measures:
//   deckY   — p95 top of hull-subtree verts in the engine bay's z-band
//   sideX   — p95 |x| of hull verts in the upper-hull y-band at mid z
//   trackX  — max |x| of low-band verts (running gear)
//   hullZ   — hull-subtree z extents (barrel excluded via rig_gun)
//   tBaseY  — min y of turret verts (rig_gun excluded)
// and compares against the armor model:
//   roof gap    = visual deckY − armor plate the deck ray actually strikes
//   side gap    = visual sideX − armor side-plate x at that height
//   track gap   = visual trackX − track box outer |x|
//   ring gap    = visual tBaseY − turretRing box y-band
// Any |gap| > TOL (0.15 m) flags the vehicle.
//
// Usage: node tools/module-visual-align-probe.mjs [--ids=a,b] [--json out] [--gate]
// By default this is an audit. --gate exits non-zero when a playable vehicle
// drifts, so tank:release:check can make the anatomy pass mandatory.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const eq = args.find((a) => a.startsWith('--ids='));
const requested = eq ? eq.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : '';
const gate = args.includes('--gate');
const TOL = 0.15;
const FACE_TOL = 0.035;
const MIN_VOLUME_DEPTH_M = 0.05;

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 7300 + Math.floor(Math.random() * 200), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

const rows = [];
try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  const manifest = await page.evaluate(async () => {
    const { ALL_TANK_IDS, TANK_SPECS, MODEL_SOURCE } = await import('/src/vehicles/specs.js');
    return ALL_TANK_IDS
      .filter((id) => TANK_SPECS[id] && TANK_SPECS[id].armor)
      .map((id) => ({ id, source: (MODEL_SOURCE[id] && MODEL_SOURCE[id].source) || 'procedural' }));
  });
  const list = requested ? manifest.filter((r) => requested.includes(r.id)) : manifest;
  console.log(`[mod-align] scanning ${list.length} vehicles (visual vs armor model)`);

  for (const row of list) {
    try {
      await page.evaluate(async (id) => {
        if (window.__DEBUG.stagePedestalTank) {
          await window.__DEBUG.stagePedestalTank(id);
        } else {
          window.__DEBUG.selectGarageTank(id);
        }
      }, row.id);
      await page.waitForFunction((id) => {
        const v = window.__DEBUG.pedestalVisual;
        return !!v && v.specId === id && v.root.visible;
      }, { timeout: 25000 }, row.id);
      if (row.source === 'glb') {
        await page.waitForFunction((id) => {
          const v = window.__DEBUG.pedestalVisual;
          if (!v || v.specId !== id) return false;
          let swapped = false;
          v.root.traverse((o) => { if (o.userData && o.userData.__glbSwapped) swapped = true; });
          return swapped;
        }, { polling: 80, timeout: 20000 }, row.id).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 40));
      }

      const scan = await page.evaluate(async (id) => {
        const { TANK_SPECS } = await import('/src/vehicles/specs.js');
        const { COMBAT_ANATOMY_CALIBRATIONS } = await import('/src/vehicles/combatAnatomyCalibrations.js');
        const armor = TANK_SPECS[id].armor;
        const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
        const v = window.__DEBUG.pedestalVisual;
        const root = v.root;
        root.updateMatrixWorld(true);
        const THREE = window.__DEBUG.THREE ||
          (await import('/node_modules/three/build/three.module.js'));
        const invRoot = root.matrixWorld.clone().invert();
        const rel = new THREE.Matrix4();
        const pt = new THREE.Vector3();

        const visible = (o) => {
          for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
          return true;
        };
        const subtreeOf = (o) => {
          for (let p = o; p && p !== root; p = p.parent) {
            if (p.name === 'rig_gun' || p.name === 'rig_recoil') return 'gun';
            if (p.name === 'rig_turret') return 'turret';
          }
          return 'hull';
        };

        // gather classified hull-local points
        const hull = [], turret = [];
        root.traverse((o) => {
          if (!o.geometry) return;
          if (o.material && o.material.colorWrite === false) return;
          if (!visible(o)) return;
          const pa = o.geometry.getAttribute && o.geometry.getAttribute('position');
          if (!pa) return;
          const sub = subtreeOf(o);
          if (sub === 'gun') return;
          const dst = sub === 'turret' ? turret : hull;
          if (o.isInstancedMesh) {
            const inst = new THREE.Matrix4();
            const per = Math.max(1, Math.floor(pa.count / 48));
            for (let i = 0; i < o.count; i++) {
              o.getMatrixAt(i, inst);
              const e = inst.elements;
              if (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10]) < 1e-5) continue;
              rel.multiplyMatrices(o.matrixWorld, inst).premultiply(invRoot);
              for (let k = 0; k < pa.count; k += per) {
                pt.fromBufferAttribute(pa, k).applyMatrix4(rel);
                dst.push(pt.x, pt.y, pt.z);
              }
            }
          } else if (o.isMesh) {
            rel.multiplyMatrices(invRoot, o.matrixWorld);
            const step = Math.max(1, Math.floor(pa.count / 20000));
            for (let i = 0; i < pa.count; i += step) {
              pt.fromBufferAttribute(pa, i).applyMatrix4(rel);
              dst.push(pt.x, pt.y, pt.z);
            }
          }
        });
        if (!hull.length) return { error: 'no hull points' };

        const p95 = (arr) => {
          if (!arr.length) return NaN;
          arr.sort((a, b) => a - b);
          return arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
        };

        // hull z extents + height
        let zMin = Infinity, zMax = -Infinity, yMax = -Infinity;
        for (let i = 0; i < hull.length; i += 3) {
          const z = hull[i + 2], y = hull[i + 1];
          if (z < zMin) zMin = z;
          if (z > zMax) zMax = z;
          if (y > yMax) yMax = y;
        }

        // module boxes of record
        const box = (n) => (armor.modules || []).find((m) => m.module === n);
        const eng = box('engine');
        const trkR = box('trackR') || box('trackL');
        const ring = box('turretRing');

        // deckY: p95 of hull tops inside the ENGINE box z band, |x| < 40% width
        const deckYs = [];
        if (eng) {
          let xLim = 0;
          for (let i = 0; i < hull.length; i += 3) xLim = Math.max(xLim, Math.abs(hull[i]));
          xLim *= 0.4;
          for (let i = 0; i < hull.length; i += 3) {
            const x = hull[i], y = hull[i + 1], z = hull[i + 2];
            if (z >= eng.min[2] && z <= eng.max[2] && Math.abs(x) < xLim) deckYs.push(y);
          }
        }
        const deckY = p95(deckYs);

        // trackX: max |x| in the low band (y < 0.35 * hull yMax)
        let trackX = 0;
        const yBand = yMax * 0.35;
        for (let i = 0; i < hull.length; i += 3) {
          if (hull[i + 1] < yBand) trackX = Math.max(trackX, Math.abs(hull[i]));
        }

        // sideX: p95 |x| of hull verts in the upper-hull band at mid z
        const sideXs = [];
        for (let i = 0; i < hull.length; i += 3) {
          const y = hull[i + 1], z = hull[i + 2];
          if (y > yMax * 0.55 && y < yMax * 0.9 && Math.abs(z) < (zMax - zMin) * 0.2) {
            sideXs.push(Math.abs(hull[i]));
          }
        }
        const sideX = p95(sideXs);

        // turret base y (excluding gun subtree)
        let tBaseY = NaN;
        if (turret.length) {
          const tys = [];
          for (let i = 1; i < turret.length; i += 3) tys.push(turret[i]);
          tys.sort((a, b) => a - b);
          tBaseY = tys[Math.min(tys.length - 1, Math.floor(tys.length * 0.02))];
        }

        // armor-side references — trace the DECK RAY through the armor model
        // exactly like a plunging shell: straight down at the engine bay center.
        const { traceTank } = await import('/src/sim/armor.js');
        const pose = {
          pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
        };
        let roofPlateY = NaN, deckRayModules = [];
        if (eng) {
          const cx = (eng.min[0] + eng.max[0]) / 2;
          const cz = (eng.min[2] + eng.max[2]) / 2;
          const hits = traceTank(
            new THREE.Vector3(cx, 20, cz), new THREE.Vector3(cx, -1, cz), pose, armor, new Set());
          for (const h of hits) {
            if (h.kind === 'plate' && h.plate.kind !== 'era' && !isFinite(roofPlateY)) {
              roofPlateY = h.point.y;
            }
            if (h.kind === 'module') deckRayModules.push(h.module);
          }
        }

        // armor side-plate x at the upper-hull band (side ray at mid z)
        let sidePlateX = NaN;
        {
          const y = yMax * 0.72;
          const hits = traceTank(
            new THREE.Vector3(20, y, 0), new THREE.Vector3(-20, y, 0), pose, armor, new Set());
          for (const h of hits) {
            if (h.kind === 'plate' && h.plate.kind !== 'era') { sidePlateX = h.point.x; break; }
          }
        }

        const boundsOf = (plates) => {
          const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
          for (const plate of plates || []) {
            if ((plate.kind || 'main') !== 'main') continue;
            if (/^(?:hull|turret)_(?:hatch|cupola)_\d+_/.test(plate.name || '')) continue;
            for (const point of plate.verts || []) {
              for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], point[axis]);
                max[axis] = Math.max(max[axis], point[axis]);
              }
            }
          }
          return Number.isFinite(min[0]) ? { min, max } : null;
        };
        const faceGap = (actual, target, skipFloor = false) => {
          if (!actual || !target) return 0;
          let gap = 0;
          for (let axis = 0; axis < 3; axis++) {
            if (!(skipFloor && axis === 1)) gap = Math.max(gap, Math.abs(actual.min[axis] - target.min[axis]));
            gap = Math.max(gap, Math.abs(actual.max[axis] - target.max[axis]));
          }
          return gap;
        };
        const hullArmor = boundsOf(armor.hullPlates);
        const turretArmor = boundsOf(armor.turretPlates);
        const structureGap = (frame, receipts, plates) => {
          let gap = 0;
          for (let index = 0; index < (receipts || []).length; index++) {
            const kind = receipts[index].kind || 'roof_structure';
            const prefix = `${frame}_${kind}_${String(index + 1).padStart(2, '0')}_`;
            const actual = boundsOf((plates || []).filter((plate) =>
              String(plate.name || '').startsWith(prefix)));
            gap = Math.max(gap, faceGap(actual, receipts[index]));
          }
          return gap;
        };
        const hullStructureGap = structureGap('hull', calibration?.hullStructures, armor.hullPlates);
        const turretStructureGap = structureGap('turret', calibration?.turretStructures, armor.turretPlates);
        let moduleShapeGap = 0;
        for (const shape of calibration?.moduleShapes || []) {
          const actual = (armor.modules || []).find((entry) =>
            entry.module === shape.module && !!entry.turretLocal === !!shape.turretLocal);
          if (!actual || !Array.isArray(actual.parts) || actual.parts.length !== shape.parts.length) {
            moduleShapeGap = Infinity;
            break;
          }
          for (let index = 0; index < shape.parts.length; index++) {
            moduleShapeGap = Math.max(moduleShapeGap, faceGap(actual.parts[index], shape.parts[index]));
          }
        }
        let trackGap = 0;
        for (const [name, side] of [['trackL', 'left'], ['trackR', 'right']]) {
          const module = (armor.modules || []).find((entry) => entry.module === name);
          trackGap = Math.max(trackGap, faceGap(module, calibration?.tracks?.[side]));
        }
        let volumeOverflow = 0;
        let minVolumeDepth = Infinity;
        for (const entry of [...(armor.modules || []), ...(armor.crew || [])]) {
          if (entry.module === 'trackL' || entry.module === 'trackR') continue;
          const externalVolume = entry.external === true || entry.module === 'optics'
            || entry.module === 'turretRing' || entry.module === 'gunMount';
          const envelope = entry.turretLocal ? turretArmor : hullArmor;
          const shapes = Array.isArray(entry.parts) && entry.parts.length ? entry.parts : [entry];
          for (const shape of shapes) {
            for (let axis = 0; axis < 3; axis++) {
              // Visible external systems legitimately include thin glass,
              // sight windows, ring plates and mantlet faces. The minimum
              // interior-volume depth gate is not meaningful for them.
              if (!externalVolume) {
                minVolumeDepth = Math.min(minVolumeDepth, shape.max[axis] - shape.min[axis]);
              }
              if (!envelope || externalVolume) continue;
              volumeOverflow = Math.max(
                volumeOverflow,
                envelope.min[axis] - shape.min[axis],
                shape.max[axis] - envelope.max[axis],
              );
            }
          }
        }
        const receipt = {
          hullFaceGap: faceGap(hullArmor, calibration?.hull, true),
          turretFaceGap: calibration?.turret ? faceGap(turretArmor, calibration.turret) : 0,
          structureFaceGap: Math.max(hullStructureGap, turretStructureGap),
          moduleShapeGap,
          trackFaceGap: trackGap,
          volumeOverflow: Math.max(0, volumeOverflow),
          minVolumeDepth: Number.isFinite(minVolumeDepth) ? minVolumeDepth : 0,
        };

        return {
          deckY, trackX, sideX, tBaseY, hullZ: [zMin, zMax], yMax,
          roofPlateY, sidePlateX, deckRayModules,
          receipt,
          armor: {
            trackBoxX: trkR ? Math.max(Math.abs(trkR.min[0]), Math.abs(trkR.max[0])) : NaN,
            ringY: ring ? [ring.min[1], ring.max[1]] : null,
            ringTurretLocal: ring ? !!ring.turretLocal : false,
            turretPivotY: (armor.turretPivot || [0, 0, 0])[1],
            engineZ: eng ? [eng.min[2], eng.max[2]] : null,
          },
        };
      }, row.id);

      if (scan.error) { rows.push({ id: row.id, error: scan.error }); continue; }

      const ringY = scan.armor.ringY
        ? (scan.armor.ringTurretLocal
          ? [scan.armor.ringY[0] + scan.armor.turretPivotY, scan.armor.ringY[1] + scan.armor.turretPivotY]
          : scan.armor.ringY)
        : null;
      const gaps = {
        roof: isFinite(scan.roofPlateY) && isFinite(scan.deckY) ? scan.deckY - scan.roofPlateY : NaN,
        side: isFinite(scan.sidePlateX) && isFinite(scan.sideX) ? scan.sideX - scan.sidePlateX : NaN,
        track: isFinite(scan.armor.trackBoxX) ? scan.trackX - scan.armor.trackBoxX : NaN,
        ring: ringY && isFinite(scan.tBaseY)
          ? (scan.tBaseY < ringY[0] - TOL ? scan.tBaseY - ringY[0]
            : scan.tBaseY > ringY[1] + TOL ? scan.tBaseY - ringY[1] : 0)
          : NaN,
        deckOverArmor: !isFinite(scan.roofPlateY), // deck ray missed armor entirely
      };
      const receipt = scan.receipt || {};
      const flags = [];
      if (receipt.hullFaceGap > FACE_TOL) flags.push(`hull-face+${receipt.hullFaceGap.toFixed(3)}`);
      if (receipt.turretFaceGap > FACE_TOL) flags.push(`turret-face+${receipt.turretFaceGap.toFixed(3)}`);
      if (receipt.trackFaceGap > FACE_TOL) flags.push(`track-face+${receipt.trackFaceGap.toFixed(3)}`);
      if (receipt.structureFaceGap > FACE_TOL) flags.push(`structure-face+${receipt.structureFaceGap.toFixed(3)}`);
      if (receipt.moduleShapeGap > FACE_TOL) flags.push(`module-shape+${receipt.moduleShapeGap.toFixed(3)}`);
      if (receipt.volumeOverflow > TOL) flags.push(`volume-out+${receipt.volumeOverflow.toFixed(2)}`);
      if (receipt.minVolumeDepth < MIN_VOLUME_DEPTH_M) flags.push(`shallow-${receipt.minVolumeDepth.toFixed(3)}`);
      rows.push({
        id: row.id, source: row.source, receipt, diagnostics: gaps,
        deckRayModules: scan.deckRayModules, flags,
      });
      console.log(
        `  ${row.id.padEnd(20)}${flags.length ? 'DRIFT ' : 'ok    '}` +
        ` hull ${receipt.hullFaceGap.toFixed(3)}` +
        ` turret ${receipt.turretFaceGap.toFixed(3)}` +
        ` track ${receipt.trackFaceGap.toFixed(3)}` +
        ` structure ${receipt.structureFaceGap.toFixed(3)}` +
        ` modules ${receipt.moduleShapeGap.toFixed(3)}` +
        ` overflow ${receipt.volumeOverflow.toFixed(2)}` +
        ` depth ${receipt.minVolumeDepth.toFixed(2)}` +
        (flags.length ? `  [${flags.join(' ')}]` : ''),
      );
    } catch (e) {
      rows.push({ id: row.id, error: String((e && e.message) || e) });
      console.error(`  ${row.id.padEnd(20)} ERROR ${String((e && e.message) || e).slice(0, 110)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

const drift = rows.filter((r) => r.flags && r.flags.length);
console.log(`\n[mod-align] ${rows.length} scanned, ${drift.length} failing calibrated anatomy receipts`);
if (pageErrors.length) console.error(`[mod-align] page errors:\n  ${pageErrors.slice(0, 4).join('\n  ')}`);
if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), tolM: TOL, rows }, null, 1)}\n`);
  console.log(`[mod-align] wrote ${jsonOut}`);
}
if (gate && (drift.length || rows.some((row) => row.error) || pageErrors.length)) process.exitCode = 2;
