// Live articulation gate for the complete garage roster. The static audit
// proves source structure; this probe proves that the selected visual is
// actually seated in the runtime hull/turret/gun/recoil hierarchy.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks++;
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console[ok ? 'log' : 'error'](`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 6500 + Math.floor(Math.random() * 250), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
// A complete-fleet run cold-builds every procedural profile in the browser.
// Leave enough room for the first uncached vehicle on slower CI runners;
// per-vehicle assertions below still fail immediately once the visual is ready.
const VEHICLE_SWITCH_TIMEOUT_MS = 90000;
page.setDefaultTimeout(VEHICLE_SWITCH_TIMEOUT_MS);
const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(String(e)));
page.on('console', (m) => {
  const msg = m.text();
  if (m.type() === 'error' && !msg.includes('favicon')) browserErrors.push(msg);
  if (msg.includes('glb swap failed')) browserErrors.push(msg);
});

try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash`, {
    waitUntil: 'domcontentloaded', timeout: 90000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  const manifest = await page.evaluate(async () => {
    const { ALL_TANK_IDS, TANK_SPECS, MODEL_SOURCE } = await import('/src/vehicles/specs.js');
    return ALL_TANK_IDS.map((id) => ({
      id,
      turretless: TANK_SPECS[id].armor?.turretless === true,
      gunElevationDeg: TANK_SPECS[id].gunElevationDeg,
      gunDepressionDeg: TANK_SPECS[id].gunDepressionDeg,
      source: MODEL_SOURCE[id]?.source || 'procedural',
      cfg: MODEL_SOURCE[id]?.glb || null,
    }));
  });
  const requested = process.argv.slice(2);
  const rows = requested.length ? manifest.filter((r) => requested.includes(r.id)) : manifest;
  check('complete manifest loaded', rows.length === (requested.length || manifest.length), `${rows.length} vehicles`);

  for (const row of rows) {
    const errorStart = browserErrors.length;
    // The full manifest includes registered procedural variants that do not
    // own a visible garage carousel card.  Stage them through the dedicated
    // debug path so the fleet gate audits the runtime visual rather than the
    // UI's selectable-card filter.
    await page.evaluate((id) => window.__DEBUG.stagePedestalTank(id), row.id);
    await page.waitForFunction((id) => {
      const v = window.__DEBUG.pedestalVisual;
      return !!v && v.specId === id && v.root.visible;
    }, { timeout: VEHICLE_SWITCH_TIMEOUT_MS }, row.id);
    if (row.source === 'glb') {
      await page.waitForFunction((id) => {
        const v = window.__DEBUG.pedestalVisual;
        if (!v || v.specId !== id) return false;
        let swapped = false;
        v.root.traverse((o) => { if (o.userData?.__glbSwapped) swapped = true; });
        return swapped;
      }, { polling: 60, timeout: 18000 }, row.id);
    } else await sleep(30);

    const result = await page.evaluate(({ source, cfg, turretless, gunElevationDeg, gunDepressionDeg }) => {
      const visual = window.__DEBUG.pedestalVisual;
      const root = visual.root;
      const hull = root.getObjectByName('rig_hull');
      const turret = root.getObjectByName('rig_turret');
      const gun = root.getObjectByName('rig_gun');
      const recoil = root.getObjectByName('rig_recoil');
      const muzzle = root.getObjectByName('rig_muzzle');
      let swapped = false;
      root.traverse((o) => { if (o.userData?.__glbSwapped) swapped = true; });
      if (!hull || !turret || !gun || !recoil || !muzzle) return { rig: false, swapped };

      const isBelow = (node, ancestor) => {
        for (let p = node; p; p = p.parent) if (p === ancestor) return true;
        return false;
      };
      const findRegex = (sourceText, preferredAncestor = null) => {
        if (!sourceText) return null;
        const re = new RegExp(sourceText, 'i');
        const hits = [];
        root.traverse((o) => { if (re.test(o.name || '')) hits.push(o); });
        return (preferredAncestor && hits.find((o) => isBelow(o, preferredAncestor))) || hits[0] || null;
      };
      const sourceTurret = source === 'glb' && !cfg.fixedMount
        ? findRegex(cfg.turretNode || 'turret') : null;
      const sourceGun = source === 'glb' && cfg.gunNode ? findRegex(cfg.gunNode, recoil) : null;
      const gunMount = root.getObjectByName('gunMount');

      const renderCensus = () => {
        let meshes = 0;
        let triangles = 0;
        const geometries = [];
        root.traverse((o) => {
          if (!(o.isMesh || o.isInstancedMesh) || o.visible === false || !o.geometry) return;
          meshes++;
          geometries.push(o.geometry.uuid);
          const count = o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0;
          triangles += Math.floor(count / 3) * (o.isInstancedMesh ? o.count : 1);
        });
        return JSON.stringify([meshes, triangles, geometries.sort()]);
      };
      const poseSample = (pitchDeg) => {
        gun.rotation.x = -pitchDeg * Math.PI / 180;
        root.updateMatrixWorld(true);
        return {
          direction: visual.gunDirWorld(new Vec()).clone(),
          mountMatrix: gunMount?.matrixWorld.elements.slice() || null,
          census: renderCensus(),
        };
      };
      const matrixChanged = (a, b) => !!a && !!b
        && a.some((value, index) => Math.abs(value - b[index]) > 1e-6);

      const ty = turret.rotation.y;
      const gx = gun.rotation.x;
      turret.rotation.y = 0;
      gun.rotation.x = 0;
      root.updateMatrixWorld(true);
      const Vec = window.__DEBUG.camera.position.constructor;
      const d0 = visual.gunDirWorld(new Vec()).clone();
      turret.rotation.y = 0.35;
      gun.rotation.x = -0.12;
      root.updateMatrixWorld(true);
      const d1 = visual.gunDirWorld(new Vec()).clone();
      turret.rotation.y = 0;
      const down = poseSample(-gunDepressionDeg);
      const level = poseSample(0);
      const up = poseSample(gunElevationDeg);
      turret.rotation.y = ty;
      gun.rotation.x = gx;
      root.updateMatrixWorld(true);

      let proceduralTurretMesh = false;
      let proceduralGunMesh = false;
      turret.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.visible && !/^shadowProxy_|^procShadow_/.test(o.name || '')) {
          proceduralTurretMesh = true;
        }
      });
      recoil.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.visible && !/^shadowProxy_|^procShadow_/.test(o.name || '')) {
          proceduralGunMesh = true;
        }
      });
      return {
        rig: true,
        swapped,
        directionChanged: d0.angleTo(d1) > 0.30,
        yawApplied: Math.abs(Math.atan2(
          Math.sin(Math.atan2(d1.x, d1.z) - Math.atan2(d0.x, d0.z)),
          Math.cos(Math.atan2(d1.x, d1.z) - Math.atan2(d0.x, d0.z)),
        )) > 0.30,
        pitchApplied: d1.y > 0.05,
        legalPitchApplied: turretless || (down.direction.y < -0.01 && up.direction.y > 0.01),
        gunMountSeated: turretless || (!!gunMount && isBelow(gunMount, gun)),
        gunMountMoved: turretless || (matrixChanged(down.mountMatrix, level.mountMatrix)
          && matrixChanged(level.mountMatrix, up.mountMatrix)),
        pitchResourcesStable: down.census === level.census && level.census === up.census,
        directions: [d0.toArray().map((v) => Number(v.toFixed(3))), d1.toArray().map((v) => Number(v.toFixed(3)))],
        sourceTurretSeated: !sourceTurret || isBelow(sourceTurret, turret),
        sourceGunSeated: !sourceGun || isBelow(sourceGun, recoil),
        sourceTurretName: sourceTurret?.name || null,
        sourceGunName: sourceGun?.name || null,
        proceduralTurretMesh,
        proceduralGunMesh,
        fixedContract: !cfg?.fixedMount || turretless,
      };
    }, row);

    check(`${row.id}: rig present`, result.rig === true);
    check(`${row.id}: selected source`, result.swapped === (row.source === 'glb'), `${row.source}`);
    check(`${row.id}: aim articulation`, row.turretless
      || (result.directionChanged && result.yawApplied && result.pitchApplied),
    row.turretless ? 'hull-aimed fixed mount'
      : result.directions ? `${result.directions[0].join(',')} -> ${result.directions[1].join(',')}` : 'missing rig');
    check(`${row.id}: turret hierarchy`, result.sourceTurretSeated !== false, result.sourceTurretName || 'procedural/fixed');
    check(`${row.id}: cannon hierarchy`, result.sourceGunSeated !== false, result.sourceGunName || 'procedural/fused');
    if (row.source === 'procedural') {
      check(`${row.id}: procedural turret visible`, result.proceduralTurretMesh === true);
      check(`${row.id}: procedural cannon visible`, row.turretless || result.proceduralGunMesh === true,
        row.turretless ? 'merged fixed cannon/hull visual' : 'recoil-owned barrel mesh');
      check(`${row.id}: legal pitch range`, result.legalPitchApplied === true,
        row.turretless ? 'hull-aimed fixed mount' : `-${row.gunDepressionDeg}°..+${row.gunElevationDeg}°`);
      check(`${row.id}: moving housing ownership`, result.gunMountSeated === true,
        row.turretless ? 'hull-aimed fixed mount' : 'gunMount below rig_gun');
      check(`${row.id}: moving housing articulation`, result.gunMountMoved === true,
        row.turretless ? 'hull-aimed fixed mount' : 'depression/level/elevation');
      check(`${row.id}: pitch resource stability`, result.pitchResourcesStable === true,
        'mesh/triangle/geometry census unchanged');
    }
    check(`${row.id}: fixed-mount contract`, result.fixedContract !== false);
    check(`${row.id}: no load errors`, browserErrors.length === errorStart,
      browserErrors.slice(errorStart).join(' | '));
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nmodel-rig-probe: ${failures.length}/${checks} failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nmodel-rig-probe: all ${checks} checks passed`);
