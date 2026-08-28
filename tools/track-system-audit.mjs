#!/usr/bin/env node
// Fleet-wide running-gear gate. The static phase verifies the one canonical
// closed course that drives belts, shoes, grousers, sprocket teeth and wheel
// lanes. --battle additionally deploys every requested vehicle onto a real
// battlefield and checks the live, terrain-conformed instance matrices.
// --turning drives a neutral-steer maneuver before that measurement so the
// detailed shoe layer cannot hide a hull-roll / differential-scroll split
// from the canonical belt course.
// --round settles each vehicle on a deterministic convex cylindrical course
// and captures both sides for mandatory visual review of the complete shoe run.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.js');

const idArg = process.argv.find((arg) => arg.startsWith('--ids='));
const mapArg = process.argv.find((arg) => arg.startsWith('--maps='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const roundShotsArg = process.argv.find((arg) => arg.startsWith('--round-shots='));
const battleShotsArg = process.argv.find((arg) => arg.startsWith('--battle-shots='));
const runTurning = process.argv.includes('--turning');
const runBattle = process.argv.includes('--battle') || runTurning;
const runRound = process.argv.includes('--round');
const skipStatic = process.argv.includes('--skip-static');
const ids = idArg
  ? idArg.slice(6).split(',').map((id) => id.trim()).filter(Boolean)
  : [...ALL_TANK_IDS];
const maps = (mapArg ? mapArg.slice(7) : 'badlands')
  .split(',').map((id) => id.trim()).filter(Boolean);
const roundShotsDir = roundShotsArg?.slice('--round-shots='.length)
  || 'shots/track-round-audit';
const battleShotsDir = battleShotsArg?.slice('--battle-shots='.length) || null;

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7700 + Math.floor(Math.random() * 150),
    strictPort: false,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const staticRows = [];
const roundRows = [];
const battleRows = [];
let failed = false;
try {
  if (!skipStatic) {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    for (const [index, id] of ids.entries()) {
      await page.goto(
        `http://localhost:${port}/tools/track-system-audit.html?id=${encodeURIComponent(id)}`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction('window.__TRACK_SYSTEM_READY === true', { polling: 40 });
      const result = await page.evaluate('window.__TRACK_SYSTEM_AUDIT');
      staticRows.push(result);
      if (!result.pass) failed = true;
      const shoes = result.units?.reduce((sum, unit) => sum + unit.shoeCountPerSide * 2, 0) || 0;
      console.log(`[track-system ${String(index + 1).padStart(3)}/${ids.length}] ${id.padEnd(20)} `
        + `${result.pass ? 'PASS' : 'FAIL'} ${result.units?.length || 0} course(s), ${shoes} shoes`);
      for (const failure of result.failures || []) console.error(`  - ${failure}`);
      if (result.error) console.error(`  - ${result.error.split('\n')[0]}`);
    }
    await page.close();
  }

  if (runRound) {
    mkdirSync(roundShotsDir, { recursive: true });
    const roundPage = await browser.newPage();
    roundPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    roundPage.setDefaultTimeout(180000);
    for (const [index, id] of ids.entries()) {
      for (const view of ['left', 'right']) {
        await roundPage.goto(
          `http://localhost:${port}/tools/track-system-audit.html?id=${encodeURIComponent(id)}`
            + `&round=1&view=${view}`,
          { waitUntil: 'domcontentloaded' },
        );
        await roundPage.waitForFunction(
          'window.__TRACK_SYSTEM_READY === true && window.__TRACK_ROUND_READY === true',
          { polling: 40 },
        );
        const result = await roundPage.evaluate(() => ({
          staticAudit: window.__TRACK_SYSTEM_AUDIT,
          roundAudit: window.__TRACK_ROUND_AUDIT,
        }));
        const screenshot = resolve(roundShotsDir, `${id}-${view}.png`);
        await roundPage.screenshot({ path: screenshot });
        const pass = result.staticAudit?.pass === true && !result.roundAudit?.error;
        roundRows.push({ id, view, screenshot, pass, ...result.roundAudit });
        if (!pass) failed = true;
        console.log(`[track-round  ${String(index + 1).padStart(3)}/${ids.length}] `
          + `${id.padEnd(20)} ${view.padEnd(5)} ${pass ? 'PASS' : 'FAIL'} -> ${screenshot}`);
        if (result.roundAudit?.error) console.error(`  - ${result.roundAudit.error.split('\n')[0]}`);
      }
    }
    await roundPage.close();
  }

  if (runBattle) {
    if (battleShotsDir) mkdirSync(battleShotsDir, { recursive: true });
    const battlePage = await browser.newPage();
    battlePage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    battlePage.setDefaultTimeout(240000);
    let pageError = null;
    battlePage.on('pageerror', (error) => { pageError = String(error?.message || error); });
    await battlePage.goto(`http://localhost:${port}/?nosplash=1`, { waitUntil: 'domcontentloaded' });
    await battlePage.waitForFunction('window.__GAME_READY === true', { polling: 100 });
    await battlePage.evaluate(() => {
      window.__DEBUG.flags.rosterExact = true;
    });
    for (const [index, id] of ids.entries()) {
      const mapId = maps[index % maps.length];
      pageError = null;
      await battlePage.evaluate(({ tankId, battlefield }) => {
        const debug = window.__DEBUG;
        debug.rig.release();
        // Keep a valid 4v4 control roster around the audited player. A forced
        // list containing only the player is filtered by pickParticipants and
        // leaves team assignment with no non-player entities.
        debug.flags.forceRoster = debug.game.allTanks
          .map((entity) => entity.specId)
          .filter((specId) => specId !== tankId)
          .slice(0, 7);
        debug.flags.rosterExact = true;
        debug.startBattle(tankId, battlefield);
      }, { tankId: id, battlefield: mapId });
      await battlePage.waitForFunction(
        (tankId) => window.__DEBUG.game.phase === 'battle'
          && window.__DEBUG.game.player?.specId === tankId
          && window.__DEBUG.game.player?.visual?.root,
        { polling: 50 },
        id,
      );
      await battlePage.evaluate(() => new Promise((resolve) => {
        // Let the suspension and map-support solve settle before sampling the
        // shoe-to-heightfield clearance. Eight presentation frames was
        // scheduler-sensitive on the heaviest hulls: the same course could be
        // measured before or after its final few centimetres of vertical
        // support travel. Require a short stable window, with a bounded
        // fallback so a genuinely moving/unsupported vehicle still gets
        // audited instead of hanging the fleet run.
        let frames = 0;
        let stableFrames = 0;
        let previousY = null;
        const step = () => {
          frames++;
          const y = window.__DEBUG.game.player?.visual?.root?.position?.y;
          if (Number.isFinite(y) && previousY !== null && Math.abs(y - previousY) < 0.0001) {
            stableFrames++;
          } else {
            stableFrames = 0;
          }
          previousY = Number.isFinite(y) ? y : previousY;
          if ((frames >= 30 && stableFrames >= 8) || frames >= 120) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }));
      if (runTurning) {
        // Sample during the maneuver, not after the chassis roll and
        // left/right scroll differential have relaxed back to rest.
        await battlePage.keyboard.down('KeyA');
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }
      const result = await battlePage.evaluate(async ({ tankId, battlefield, turning }) => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const debug = window.__DEBUG;
        const root = debug.game.player.visual.root;
        root.updateMatrixWorld(true);
        const objects = [];
        root.traverse((object) => {
          if (object.userData?.runningGear) objects.push(object);
        });
        const unitIds = [...new Set(objects
          .map((object) => object.userData.runningGearUnitId)
          .filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
        const failures = [];
        const units = [];
        const state = debug.game.player.state;
        const trackScrollDifferentialM = Math.abs(
          (state.trackScroll?.l || 0) - (state.trackScroll?.r || 0));
        if (turning && trackScrollDifferentialM < 0.08) {
          failures.push(`turning maneuver produced only ${trackScrollDifferentialM.toFixed(3)} m track differential`);
        }
        const heightAt = debug.world?.heightField?.getHeightAt?.bind(debug.world.heightField);
        if (!heightAt) failures.push('battlefield height sampler unavailable');

        for (const unitId of unitIds) {
          const pads = objects.find((object) => object.name === 'gearTrackPads'
            && object.userData.runningGearUnitId === unitId);
          const bands = objects.filter((object) => /^gearTrackBand[LR]$/.test(object.name)
            && object.userData.runningGearUnitId === unitId);
          const tires = objects.filter((object) => /^gearRoadWheel(?:Tires|Discs)$/.test(object.name)
            && object.userData.runningGearUnitId === unitId);
          const suspension = objects.find((object) => object.name === 'gearSuspensionLinks'
            && object.userData.runningGearUnitId === unitId);
          const suspensionJoints = objects.find((object) => object.name === 'gearSuspensionJointBosses'
            && object.userData.runningGearUnitId === unitId);
          const unitFailures = [];
          if (!pads) unitFailures.push('missing live shoe course');
          if (bands.length !== 2) unitFailures.push(`live belt count ${bands.length}`);
          if (!tires.length) unitFailures.push('missing live wheel train');
          if (!suspension) unitFailures.push('missing live suspension linkage layer');
          if (!suspensionJoints) unitFailures.push('missing live suspension joint layer');
          let suspensionMaxAxleGap = null;
          if (suspension) {
            const expectedLinks = suspension.userData.suspensionStationCount * 2;
            if (suspension.count !== expectedLinks) {
              unitFailures.push(`live suspension link count ${suspension.count} != ${expectedLinks}`);
            }
            if (!suspension.userData.suspensionPattern) {
              unitFailures.push('live suspension pattern receipt missing');
            }
            if (suspension.userData.suspensionGeometryProfile !== 'tapered-forged-arm-v1') {
              unitFailures.push('live suspension linkage is not a tapered forged arm');
            }
            if (suspension.userData.suspensionPlacement !== 'inboard-behind-road-wheel') {
              unitFailures.push('live suspension linkage is not behind the wheel backs');
            }
            if (suspension.castShadow) {
              unitFailures.push('live suspension linkage layer casts dynamic shadows');
            }
            const linkMatrix = new THREE.Matrix4();
            const wheelMatrix = new THREE.Matrix4();
            const axleEnd = new THREE.Vector3();
            const wheelCenter = new THREE.Vector3();
            let maxGap = 0;
            for (let linkIndex = 0; linkIndex < suspension.count; linkIndex++) {
              suspension.getMatrixAt(linkIndex, linkMatrix);
              axleEnd.set(0, 0, 0.5).applyMatrix4(linkMatrix);
              let nearest = Infinity;
              for (const wheelLayer of tires) {
                for (let wheelIndex = 0; wheelIndex < wheelLayer.count; wheelIndex++) {
                  wheelLayer.getMatrixAt(wheelIndex, wheelMatrix);
                  wheelCenter.setFromMatrixPosition(wheelMatrix);
                  if (Math.sign(wheelCenter.x) !== Math.sign(axleEnd.x)) continue;
                  nearest = Math.min(nearest,
                    Math.hypot(wheelCenter.y - axleEnd.y, wheelCenter.z - axleEnd.z));
                }
              }
              maxGap = Math.max(maxGap, nearest);
            }
            suspensionMaxAxleGap = maxGap;
            if (!Number.isFinite(maxGap) || maxGap > 0.035) {
              unitFailures.push(`live suspension-to-wheel axle gap ${maxGap.toFixed(3)} m`);
            }
          }
          if (suspensionJoints) {
            const expectedJoints = suspensionJoints.userData.suspensionStationCount * 4;
            if (suspensionJoints.count !== expectedJoints) {
              unitFailures.push(`live suspension joint count ${suspensionJoints.count} != ${expectedJoints}`);
            }
            if (suspensionJoints.userData.suspensionGeometryProfile !== 'stepped-forged-boss-v1') {
              unitFailures.push('live suspension endpoints are not stepped forged bosses');
            }
            if (suspensionJoints.userData.suspensionPlacement !== 'inboard-behind-road-wheel') {
              unitFailures.push('live suspension joints are not behind the wheel backs');
            }
            if (suspensionJoints.castShadow) {
              unitFailures.push('live suspension joint layer casts dynamic shadows');
            }
          }
          if (pads) {
            pads.geometry.computeBoundingBox();
            const count = pads.userData.trackShoeCountPerSide;
            const pitch = pads.userData.trackShoePitchM;
            const expectedBandGap = pads.userData.trackShoeBandGapM;
            const expectedCenterOffset = pads.userData.trackShoeCenterOffsetM;
            const instance = new THREE.Matrix4();
            const world = new THREE.Matrix4();
            const bandWorldInverse = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const bandA = new THREE.Vector3();
            const bandB = new THREE.Vector3();
            const bandDelta = new THREE.Vector3();
            const shoeDelta = new THREE.Vector3();
            let collapsed = 0;
            let maxGapRatio = 0;
            let maxShoeBandGapError = 0;
            const shoeLayerRelativeOffsetYZMBySide = [];
            const shoeBandGapErrors = [];
            let minShoeBandDistance = Infinity;
            let maxShoeBandDistance = 0;
            const nearGroundBySide = [0, 0];
            let minClearance = Infinity;
            let maxNearClearance = -Infinity;
            for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
              const poses = [];
              const band = bands.find((candidate) =>
                candidate.userData.runningGearSide === (sideIndex ? 1 : -1));
              const bandSegments = [];
              if (band) {
                bandWorldInverse.copy(band.matrixWorld).invert();
                const layerRelative = bandWorldInverse.clone().multiply(pads.matrixWorld);
                const layerOffsetYZ = Math.hypot(
                  layerRelative.elements[13], layerRelative.elements[14]);
                shoeLayerRelativeOffsetYZMBySide.push(Number(layerOffsetYZ.toFixed(5)));
                if (layerOffsetYZ > 0.002) {
                  const sideName = sideIndex ? 'right' : 'left';
                  unitFailures.push(`${sideName} shoe layer wrapper offset ${layerOffsetYZ.toFixed(3)} m`);
                }
                const attr = band.geometry.getAttribute('position');
                const localSegments = [];
                let courseMinY = Infinity;
                let courseMaxY = -Infinity;
                // trackBandGeo emits four non-indexed quads (24 vertices) per
                // course segment; the first quad is the outer face. Average
                // its outer/inner width endpoints to recover the LIVE
                // deformed center course in belt-local coordinates.
                for (let offset = 0; offset + 23 < attr.count; offset += 24) {
                  // Midpoint between outer and inner faces recovers the belt
                  // centerline. Comparing against the authored radial center
                  // offset avoids a false error at sharp mitered wrap joints,
                  // where the nearest point on one outer face is not the
                  // originating segment's normal projection.
                  bandA.set(0,
                    (attr.getY(offset + 2) + attr.getY(offset + 6)) / 2,
                    (attr.getZ(offset + 2) + attr.getZ(offset + 6)) / 2);
                  bandB.set(0,
                    (attr.getY(offset) + attr.getY(offset + 8)) / 2,
                    (attr.getZ(offset) + attr.getZ(offset + 8)) / 2);
                  courseMinY = Math.min(courseMinY, bandA.y, bandB.y);
                  courseMaxY = Math.max(courseMaxY, bandA.y, bandB.y);
                  localSegments.push([bandA.clone(), bandB.clone()]);
                }
                const lowerRunCeiling = courseMinY + (courseMaxY - courseMinY) * 0.38;
                for (const [localA, localB] of localSegments) {
                  const dz = localB.z - localA.z;
                  const dy = localB.y - localA.y;
                  const midpointY = (localA.y + localB.y) / 2;
                  // The screenshot failure is a second, independently
                  // flattened SHOE course along the loaded run. End wraps
                  // deliberately miter between neighboring segment normals,
                  // so nearest-line distance is ambiguous there even when
                  // the render is correct. Gate only low, mostly-horizontal
                  // loaded spans; they have one unambiguous belt centerline.
                  const lowerRun = midpointY <= lowerRunCeiling
                    && Math.abs(dy) <= Math.abs(dz) * 0.85;
                  bandSegments.push({
                    a: localA,
                    b: localB,
                    lowerRun,
                  });
                }
              }
              for (let i = 0; i < count; i++) {
                pads.getMatrixAt(sideIndex * count + i, instance);
                instance.decompose(position, quaternion, scale);
                if (scale.lengthSq() < 0.1) collapsed++;
                poses.push(position.clone());
                if (!heightAt || scale.lengthSq() < 0.1) continue;
                world.multiplyMatrices(pads.matrixWorld, instance);
                const box = pads.geometry.boundingBox.clone().applyMatrix4(world);
                const center = box.getCenter(new THREE.Vector3());
                if (Number.isFinite(expectedCenterOffset) && bandSegments.length) {
                  let nearest = Infinity;
                  let nearestSegment = null;
                  const shoeCenter = position.setFromMatrixPosition(world)
                    .applyMatrix4(bandWorldInverse);
                  for (const segment of bandSegments) {
                    const { a, b } = segment;
                    bandDelta.subVectors(b, a);
                    const denom = Math.max(bandDelta.lengthSq(), 1e-9);
                    const t = Math.max(0, Math.min(1,
                      shoeDelta.subVectors(shoeCenter, a).dot(bandDelta) / denom));
                    shoeDelta.copy(a).addScaledVector(bandDelta, t);
                    // Radial seating is a side-elevation (Y/Z) relationship.
                    // A family may deliberately move shoes a few centimetres
                    // outboard in X to expose end pins; counting that lateral
                    // lane offset as belt separation produces a false gap.
                    const distance = Math.hypot(
                      shoeCenter.y - shoeDelta.y,
                      shoeCenter.z - shoeDelta.z,
                    );
                    if (distance < nearest) {
                      nearest = distance;
                      nearestSegment = segment;
                    }
                  }
                  if (nearestSegment?.lowerRun) {
                    const courseError = Math.abs(nearest - expectedCenterOffset);
                    minShoeBandDistance = Math.min(minShoeBandDistance, nearest);
                    maxShoeBandDistance = Math.max(maxShoeBandDistance, nearest);
                    shoeBandGapErrors.push(courseError);
                    maxShoeBandGapError = Math.max(maxShoeBandGapError, courseError);
                  }
                }
                const clearance = box.min.y - heightAt(center.x, center.z);
                minClearance = Math.min(minClearance, clearance);
                // Battle support keeps the rendered hull a small distance
                // above the sampled heightfield (and the value varies by a
                // few centimetres while suspension settles on cross-slopes).
                // Treat shoes inside that support envelope as terrain-seated;
                // the independent negative-clearance gate below remains the
                // strict protection against actual terrain penetration.
                if (clearance < 0.16) {
                  nearGroundBySide[sideIndex]++;
                  maxNearClearance = Math.max(maxNearClearance, clearance);
                }
              }
              for (let i = 0; i < poses.length; i++) {
                const gap = poses[i].distanceTo(poses[(i + 1) % poses.length]);
                maxGapRatio = Math.max(maxGapRatio, gap / pitch);
              }
            }
            if (collapsed) unitFailures.push(`${collapsed} live shoes collapsed`);
            if (maxGapRatio > 2.15) unitFailures.push(`terrain course gap ${maxGapRatio.toFixed(2)}× pitch`);
            shoeBandGapErrors.sort((a, b) => a - b);
            const p95ShoeBandGapError = shoeBandGapErrors.length
              ? shoeBandGapErrors[Math.min(shoeBandGapErrors.length - 1,
                Math.floor(shoeBandGapErrors.length * 0.95))]
              : Infinity;
            if (!Number.isFinite(expectedBandGap) || !Number.isFinite(expectedCenterOffset)) {
              unitFailures.push('shoe-to-belt clearance receipt missing');
            } else if (shoeBandGapErrors.length < 4) {
              unitFailures.push(`only ${shoeBandGapErrors.length} loaded-run shoes measurable`);
            } else if (p95ShoeBandGapError > 0.025) {
              unitFailures.push(`shoe-to-belt p95 course error ${p95ShoeBandGapError.toFixed(3)} m`);
            }
            if (Number.isFinite(minClearance) && minClearance < -0.085) {
              unitFailures.push(`shoe penetrates map terrain ${(-minClearance).toFixed(3)} m`);
            }
            if (heightAt) {
              for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
                if (nearGroundBySide[sideIndex] < 2) {
                  const side = sideIndex ? 'right' : 'left';
                  unitFailures.push(`${side} track has only ${nearGroundBySide[sideIndex]} terrain-seated shoes`);
                }
              }
            }
            units.push({
              unitId, shoeCountPerSide: count,
              maxGapRatio: Number(maxGapRatio.toFixed(3)),
              maxShoeBandGapErrorM: Number(maxShoeBandGapError.toFixed(4)),
              p95ShoeBandGapErrorM: Number(p95ShoeBandGapError.toFixed(4)),
              loadedRunShoesMeasured: shoeBandGapErrors.length,
              shoeLayerRelativeOffsetYZMBySide,
              shoeBandDistanceRangeM: [
                Number(minShoeBandDistance.toFixed(4)),
                Number(maxShoeBandDistance.toFixed(4)),
              ],
              expectedShoeCenterOffsetM: Number(expectedCenterOffset.toFixed(4)),
              minTerrainClearanceM: Number.isFinite(minClearance) ? Number(minClearance.toFixed(3)) : null,
              maxNearTerrainClearanceM: Number.isFinite(maxNearClearance)
                ? Number(maxNearClearance.toFixed(3)) : null,
              terrainSeatedShoesBySide: {
                left: nearGroundBySide[0],
                right: nearGroundBySide[1],
              },
              suspensionPattern: suspension?.userData.suspensionPattern || null,
              suspensionLinks: suspension?.count || 0,
              suspensionMaxAxleGapM: Number.isFinite(suspensionMaxAxleGap)
                ? Number(suspensionMaxAxleGap.toFixed(4)) : null,
              failures: unitFailures,
            });
          } else {
            units.push({ unitId, failures: unitFailures });
          }
          failures.push(...unitFailures.map((failure) => `unit ${unitId}: ${failure}`));
        }
        return {
          id: tankId,
          mapId: battlefield,
          turning,
          motion: {
            speedMps: Number((state.speed || 0).toFixed(3)),
            yawRateRadS: Number((state.yawRate || 0).toFixed(4)),
            visualRollRad: Number((state.visualRoll || 0).toFixed(4)),
            trackScrollDifferentialM: Number(trackScrollDifferentialM.toFixed(3)),
          },
          units,
          failures,
          pass: unitIds.length > 0 && failures.length === 0,
        };
      }, { tankId: id, battlefield: mapId, turning: runTurning });
      if (battleShotsDir) {
        await battlePage.evaluate(async () => {
          const THREE = await import('/node_modules/three/build/three.module.js');
          const debug = window.__DEBUG;
          const root = debug.game.player.visual.root;
          root.updateMatrixWorld(true);
          const eye = root.localToWorld(new THREE.Vector3(-9.5, 1.8, 0));
          const target = root.localToWorld(new THREE.Vector3(0, 0.75, 0));
          debug.rig.setExternalPose(eye, target, 38);
        });
        result.screenshot = resolve(battleShotsDir,
          `${id}-${mapId}${runTurning ? '-turning' : ''}.png`);
        await battlePage.screenshot({ path: result.screenshot });
      }
      if (runTurning) await battlePage.keyboard.up('KeyA');
      if (pageError) {
        result.failures.push(`page error: ${pageError}`);
        result.pass = false;
      }
      battleRows.push(result);
      if (!result.pass) failed = true;
      console.log(`[track-map    ${String(index + 1).padStart(3)}/${ids.length}] ${id.padEnd(20)} `
        + `${mapId.padEnd(10)} ${result.pass ? 'PASS' : 'FAIL'}`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
    }
    await battlePage.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const outputPath = outputArg?.slice('--output='.length) || 'shots/track-system-audit.json';
mkdirSync('shots', { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  ids,
  maps: runBattle ? maps : [],
  static: staticRows,
  round: roundRows,
  battle: battleRows,
  pass: !failed,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[track-system] ${report.pass ? 'PASS' : 'FAIL'} — ${staticRows.length} static / `
  + `${roundRows.length} round-course views / ${battleRows.length} battle-map vehicles -> ${outputPath}`);
if (failed) process.exitCode = 2;
