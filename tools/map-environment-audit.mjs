// Deterministic whole-fleet battlefield quality/performance audit.
//
// Usage:
//   node tools/map-environment-audit.mjs
//   node tools/map-environment-audit.mjs --out=/private/tmp/cot-map-audit --shots
//   node tools/map-environment-audit.mjs --maps=verdant,coastal --samples=90
//   node tools/map-environment-audit.mjs --baseline=/path/to/report.json
//   node tools/map-environment-audit.mjs --gate --baseline=/path/to/report.json
//
// The report intentionally combines authored intent (config/features), built
// scene complexity, renderer counters, and steady-frame samples. Screenshots
// are optional because the numeric gate is useful in CI while visual review is
// a release gate owned by humans/critic agents.

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { MAP_IDS } from '../src/world/maps/index.ts';

const args = process.argv.slice(2);
const valueArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const flagArg = (name) => args.includes(`--${name}`);
const ROOT = path.resolve(valueArg('root', process.cwd()));

const requested = valueArg('maps', MAP_IDS.join(','))
  .split(',').map((id) => id.trim()).filter(Boolean);
const unknown = requested.filter((id) => !MAP_IDS.includes(id));
if (unknown.length) throw new Error(`Unknown map ids: ${unknown.join(', ')}`);

const outDir = path.resolve(ROOT, valueArg('out', '.qa-map-environment'));
const captureShots = flagArg('shots');
const enforceGate = flagArg('gate');
const includeInventory = flagArg('inventory');
const width = Number.parseInt(valueArg('width', '1440'), 10);
const height = Number.parseInt(valueArg('height', '900'), 10);
const sampleCount = Math.max(30, Number.parseInt(valueArg('samples', '75'), 10));
const repeats = Math.max(1, Number.parseInt(valueArg('repeats', '3'), 10));
const settleMs = Math.max(250, Number.parseInt(valueArg('settle-ms', '1100'), 10));
const baselinePath = valueArg('baseline', '');
const baseline = baselinePath
  ? JSON.parse(fs.readFileSync(path.resolve(ROOT, baselinePath), 'utf8')) : null;
const baselineById = new Map((baseline?.maps || []).map((row) => [row.id, row]));
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: {
    host: '127.0.0.1', port: 6100 + Math.floor(Math.random() * 500),
    strictPort: false, hmr: false, watch: null,
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  // Uncap rAF for performance certification. Sampling a compositor-locked
  // 60 Hz cadence only reports host/vsync jitter (16.7 vs 18 ms), not whether
  // added world detail changed renderer throughput.
  args: [
    '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-renderer-backgrounding',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) {
    pageErrors.push(message.text());
  }
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  revision: process.env.GIT_COMMIT || null,
  viewport: { width, height, dpr: 1 },
  sampleCount, repeats,
  maps: [],
};

const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
};
const round = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));

async function sampleFrames(count) {
  const frames = await page.evaluate((n) => new Promise((resolve) => {
    const values = [];
    let previous = performance.now();
    let warm = 8;
    const tick = (now) => {
      if (warm > 0) warm--;
      else values.push(now - previous);
      previous = now;
      if (values.length >= n) resolve(values);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
  return {
    medianMs: round(percentile(frames, 0.5)),
    p95Ms: round(percentile(frames, 0.95)),
    p99Ms: round(percentile(frames, 0.99)),
    maxMs: round(Math.max(...frames)),
    fpsMedian: round(1000 / Math.max(0.001, percentile(frames, 0.5)), 1),
  };
}

function combineFrameRuns(runs) {
  const at = (key) => percentile(runs.map((run) => run[key]), 0.5);
  return {
    medianMs: round(at('medianMs')),
    p95Ms: round(at('p95Ms')),
    p99Ms: round(at('p99Ms')),
    maxMs: round(at('maxMs')),
    fpsMedian: round(at('fpsMedian'), 1),
    runs,
  };
}

async function stageMap(mapId) {
  const view = mapId === 'verdant' ? 'battlefield' : `battlefield_${mapId}`;
  await page.evaluate((name) => window.__SHOTS.set(name), view);
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  await page.evaluate(() => new Promise((resolve) => {
    let left = 5;
    const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
}

async function collectMap(mapId, frames) {
  return page.evaluate(({ id, frameStats, includeInventory: withInventory }) => {
    const D = window.__DEBUG;
    const world = D.world;
    const roundValue = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));
    const triangleCount = (geometry) => {
      if (!geometry) return 0;
      const index = geometry.getIndex?.() || geometry.index;
      if (index) return index.count / 3;
      const position = geometry.getAttribute?.('position') || geometry.attributes?.position;
      return position ? position.count / 3 : 0;
    };
    const stats = (root) => {
      const geometries = new Set();
      const materials = new Set();
      const materialUsers = withInventory ? new Map() : null;
      const materialUserDetails = withInventory ? new Map() : null;
      const textures = new Set();
      let nodes = 0;
      let meshNodes = 0;
      let instancedMeshNodes = 0;
      let instances = 0;
      let triangles = 0;
      const materialLineage = (object) => {
        const lineage = [];
        for (let node = object; node && node !== root; node = node.parent) {
          lineage.push(node.name || node.type || 'node');
        }
        return lineage.reverse().join('/');
      };
      const materialBounds = (object) => {
        object.geometry?.computeBoundingBox?.();
        const bounds = object.geometry?.boundingBox;
        return {
          vertices: object.geometry?.attributes?.position?.count || 0,
          bounds: bounds ? [
            Number((bounds.max.x - bounds.min.x).toFixed(2)),
            Number((bounds.max.y - bounds.min.y).toFixed(2)),
            Number((bounds.max.z - bounds.min.z).toFixed(2)),
          ] : [],
        };
      };
      const registerMaterial = (material, object) => {
        if (!material) return;
        materials.add(material);
        if (withInventory) {
          if (!materialUsers.has(material)) materialUsers.set(material, new Set());
          if (!materialUserDetails.has(material)) materialUserDetails.set(material, []);
          materialUsers.get(material).add(materialLineage(object));
          materialUserDetails.get(material).push(materialBounds(object));
        }
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (value?.isTexture) textures.add(value);
        }
      };
      root?.traverse((object) => {
        if (!object.visible) return;
        nodes++;
        if (!object.isMesh && !object.isInstancedMesh) return;
        meshNodes++;
        const count = object.isInstancedMesh ? object.count : 1;
        if (object.isInstancedMesh) instancedMeshNodes++;
        instances += count;
        if (object.geometry) {
          geometries.add(object.geometry);
          triangles += triangleCount(object.geometry) * count;
        }
        const objectMaterials = Array.isArray(object.material)
          ? object.material : [object.material];
        for (const material of objectMaterials) registerMaterial(material, object);
      });
      return {
        nodes, meshNodes, instancedMeshNodes, instances,
        triangles: Math.round(triangles),
        geometries: geometries.size, materials: materials.size, textures: textures.size,
        ...(withInventory ? {
          materialInventory: [...materials].map((material) => ({
            name: material.name || '', type: material.type || '',
            color: material.color?.getHexString?.() || '',
            roughness: material.roughness ?? null,
            textures: Object.keys(material).filter((key) => material[key]?.isTexture).sort(),
            mapSize: material.map
              ? `${material.map.image?.width || material.map.source?.data?.width || 0}x${material.map.image?.height || material.map.source?.data?.height || 0}` : '',
            users: [...(materialUsers.get(material) || [])].sort(),
            userDetails: materialUserDetails.get(material) || [],
          })).sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
          textureInventory: [...textures].map((texture) => ({
            name: texture.name || '',
            width: texture.image?.width || texture.source?.data?.width || 0,
            height: texture.image?.height || texture.source?.data?.height || 0,
            format: texture.format || 0,
          })).sort((a, b) => `${a.width}x${a.height}:${a.name}`.localeCompare(`${b.width}x${b.height}:${b.name}`)),
        } : {}),
      };
    };

    const subtrees = {};
    world.group.children.forEach((child, index) => {
      subtrees[child.name || `child-${index}`] = stats(child);
    });
    const config = world.config;
    const props = config.props || {};
    const vegetation = config.vegetation || {};
    const terrain = config.terrain || {};
    const minimap = world.getMinimapFeatures();
    const structureFamilies = [
      ...(props.plan || []), ...(props.destructibleBuildings || []),
    ];
    const interactionKinds = new Set(world.destructibles.map((record) => record.kind));
    const looseKinds = new Set(world.looseProps.map((record) => record.kind));
    const info = D.renderer.info;
    const waterFeatures = [...(terrain.marshes || []), ...(terrain.lakes || [])];
    const poleStations = world.utilityPolePlacements || [];
    const polePosts = poleStations.flatMap((station) => station.poles || []);
    const fullPoleMesh = world.group.getObjectByName('baked-pole-full');
    const groundedDestructibles = world.destructibles
      .filter((record) => record.groundSupport);
    const groundingReceipts = world.decorationGroundingReceipts || [];
    const utilityPoleQuality = () => ({
      enabled: !!props.telegraph,
      stations: poleStations.length,
      pairedStations: poleStations.filter((station) => station.paired).length,
      singleStations: poleStations.filter((station) => !station.paired).length,
      physicalPosts: polePosts.length,
      sourceTrianglesPerPost: fullPoleMesh ? triangleCount(fullPoleMesh.geometry) : 0,
      maxPairRelief: roundValue(Math.max(0, ...poleStations.map((station) => station.pairRelief))),
      maxAcceptedPairRelief: roundValue(Math.max(0,
        ...poleStations.filter((station) => station.paired)
          .map((station) => station.pairRelief))),
      maxLocalRelief: roundValue(Math.max(0, ...polePosts.map((post) => post.supportSpread))),
      unsupportedPosts: polePosts.filter((post) =>
        Math.abs(post.y - (post.supportMin - 0.035)) > 0.001).length,
      pairedReliefs: poleStations.filter((station) => station.paired)
        .map((station) => roundValue(station.pairRelief)),
      singleReliefs: poleStations.filter((station) => !station.paired)
        .map((station) => roundValue(station.pairRelief)),
    });
    const groundingQuality = () => ({
      destructibleReceipts: groundedDestructibles.length,
      unsupportedDestructibles: groundedDestructibles.filter((record) =>
        record.y > record.groundSupport.min + 0.001).length,
      wideDecorationReceipts: groundingReceipts.length,
      unsupportedWideDecorations: groundingReceipts.filter((record) =>
        record.baseClearance > 0.001).length,
      maxBaseClearance: roundValue(Math.max(0,
        ...groundingReceipts.map((record) => record.baseClearance))),
      kinds: [...new Set(groundingReceipts.map((record) => record.kind))].sort(),
    });
    const waterQuality = () => ({
      features: waterFeatures.length,
      lakes: (terrain.lakes || []).length,
      marshes: (terrain.marshes || []).length,
      liquid: !!(terrain.softLakes || config.splat?.seaLake),
      frozen: !!config.splat?.iceLake,
      softInteraction: !!terrain.softLakes || waterFeatures.some((feature) => feature.depth == null),
    });
    return {
      id,
      name: config.name,
      frames: frameStats,
      // The app renders through a compositor. renderer.info at this point is
      // the final post pass, not the world pass; label it honestly and use
      // scene/subtree family counts for stable complexity gates.
      postPass: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        lines: info.render.lines,
        points: info.render.points,
        programs: info.programs?.length || 0,
        memory: { ...info.memory },
      },
      scene: stats(world.group),
      subtrees,
      quality: {
        map: {
          roads: minimap.roads.length,
          landforms: (terrain.landforms || []).length,
          tacticalBeats: minimap.tacticalBeats.length,
          wallRuns: (props.wallRuns || []).length,
        },
        buildings: {
          placed: minimap.buildings.length,
          authoredPlan: (props.plan || []).length,
          familyCount: new Set(structureFamilies).size,
          destructibleFamilies: (props.destructibleBuildings || []).length,
        },
        decorations: {
          obstacles: world.getObstacles().length,
          colliders: world.getColliders().length,
          destructibles: world.destructibles.length,
          destructibleKinds: interactionKinds.size,
          looseProps: world.looseProps.length,
          looseKinds: looseKinds.size,
          wrecks: world.tankWreckSpots.length,
          craters: props.craters || 0,
          rubblePiles: props.rubblePiles || 0,
          utilityPoles: utilityPoleQuality(),
          grounding: groundingQuality(),
        },
        foliage: {
          configuredSpecies: new Set(vegetation.species || []).size,
          clusters: minimap.treeClusters.length,
          concealers: world.getConcealment().length,
          grassDensity: vegetation.grassDensity || 0,
          bushCount: vegetation.bushCount || 0,
        },
        water: waterQuality(),
      },
    };
  }, { id: mapId, frameStats: frames, includeInventory });
}

function evaluateQuality(row) {
  const q = row.quality;
  const checks = {
    mapAuthorship: q.map.landforms >= 5 && q.map.tacticalBeats === 3
      && q.map.roads >= 2 && q.map.wallRuns >= 6,
    buildingQuality: q.buildings.placed >= 15 && q.buildings.familyCount >= 11
      && q.buildings.destructibleFamilies >= 4,
    decorationQuality: q.decorations.destructibles >= 350
      && q.decorations.destructibleKinds >= 32 && q.decorations.looseProps >= 50
      && q.decorations.wrecks >= 4,
    utilityPoleGrounding: !q.decorations.utilityPoles.enabled
      || (q.decorations.utilityPoles.stations > 0
        && q.decorations.utilityPoles.unsupportedPosts === 0
        && q.decorations.utilityPoles.sourceTrianglesPerPost > 0
        && q.decorations.utilityPoles.sourceTrianglesPerPost <= 3000
        && q.decorations.utilityPoles.maxAcceptedPairRelief <= 0.401),
    decorationGrounding: q.decorations.grounding.unsupportedDestructibles === 0
      && q.decorations.grounding.unsupportedWideDecorations === 0,
    foliageQuality: q.foliage.configuredSpecies >= 2 && q.foliage.concealers >= 20,
    waterQuality: q.water.features === 0 || q.water.liquid || q.water.frozen
      || q.water.softInteraction,
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

async function captureMapShots(mapId) {
  const dir = path.join(outDir, 'shots', mapId);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'establishing.png') });

  const poleDetail = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const stations = world.utilityPolePlacements || [];
    if (!stations.length) return null;
    const paired = stations.filter((station) => station.paired);
    const singles = stations.filter((station) => !station.paired);
    // Titan's reported defect is a pair spanning a gorge shelf. Review the
    // steepest rejected station there; other maps show a retained flat pair
    // when available so both policy branches have visual evidence.
    const pool = world.mapId === 'titan_gorge' && singles.length
      ? singles : paired.length ? paired : stations;
    const station = [...pool].sort((a, b) => b.pairRelief - a.pairRelief)[0];
    const posts = station.poles || [];
    const target = posts.length > 1 ? {
      x: (posts[0].x + posts[1].x) * 0.5,
      z: (posts[0].z + posts[1].z) * 0.5,
    } : posts[0];
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const angle = station.yaw + Math.PI * 0.58;
    const distance = posts.length > 1 ? 30 : 24;
    const x = target.x + Math.sin(angle) * distance;
    const z = target.z + Math.cos(angle) * distance;
    D.camera.position.set(x, Math.max(hAt(x, z) + 5.2, hAt(target.x, target.z) + 6.8), z);
    D.camera.fov = 45;
    D.camera.lookAt(target.x, hAt(target.x, target.z) + 3.5, target.z);
    D.camera.updateProjectionMatrix();
    D.camera.updateMatrixWorld(true);
    world.update(0, D.camera.position);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return { paired: station.paired, pairRelief: station.pairRelief, posts: posts.length };
  });
  if (poleDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.screenshot({ path: path.join(dir, 'utility-poles.png') });
    fs.writeFileSync(path.join(dir, 'utility-poles.json'), `${JSON.stringify(poleDetail, null, 2)}\n`);
  }

  const decorationDetail = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const receipts = world.decorationGroundingReceipts || [];
    const priorities = [
      'beached-boat', 'frozen-rowboat', 'tank-wreck',
      'felled-utility-pole', 'fallen-log', 'stump',
    ];
    let subject = null;
    for (const kind of priorities) {
      subject = receipts.find((receipt) => receipt.kind === kind);
      if (subject) break;
    }
    if (!subject) return null;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const seed = [...world.mapId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const angle = (seed % 360) * Math.PI / 180;
    const distance = subject.kind === 'tank-wreck' ? 16 : 12;
    const x = subject.x + Math.sin(angle) * distance;
    const z = subject.z + Math.cos(angle) * distance;
    D.camera.position.set(x, Math.max(hAt(x, z) + 3.4, hAt(subject.x, subject.z) + 4.2), z);
    D.camera.fov = 46;
    D.camera.lookAt(subject.x, hAt(subject.x, subject.z) + 0.8, subject.z);
    D.camera.updateProjectionMatrix();
    D.camera.updateMatrixWorld(true);
    world.update(0, D.camera.position);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return {
      kind: subject.kind,
      relief: subject.relief,
      baseClearance: subject.baseClearance,
    };
  });
  if (decorationDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.screenshot({ path: path.join(dir, 'grounded-decoration.png') });
    fs.writeFileSync(path.join(dir, 'grounded-decoration.json'),
      `${JSON.stringify(decorationDetail, null, 2)}\n`);
  }

  const details = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const beats = world.config.props?.tacticalBeats || [];
    const waters = [
      ...(world.config.terrain?.lakes || []),
      ...(world.config.terrain?.marshes || []),
    ];
    const setCamera = (target, distance, angle, lift, fov) => {
      const x = target.x + Math.sin(angle) * distance;
      const z = target.z + Math.cos(angle) * distance;
      D.camera.position.set(x, hAt(x, z) + lift, z);
      D.camera.fov = fov;
      D.camera.lookAt(target.x, hAt(target.x, target.z) + 2.4, target.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    };
    if (beats.length) {
      const beat = beats[0];
      const seed = [...world.mapId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      setCamera(beat, 48, (seed % 360) * Math.PI / 180, 7.5, 48);
    }
    return { hasDetail: beats.length > 0, hasWater: waters.length > 0 };
  });
  if (details.hasDetail) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.screenshot({ path: path.join(dir, 'detail.png') });
  }
  const closeups = await page.evaluate(() => {
    const D = window.__DEBUG;
    const world = D.world;
    const hf = world.heightField;
    const hAt = hf.getHeightAtFast || hf.getHeightAt;
    const minimap = world.getMinimapFeatures();
    const setCamera = (target, distance, angle, lift, fov) => {
      const x = target.x + Math.sin(angle) * distance;
      const z = target.z + Math.cos(angle) * distance;
      D.camera.position.set(x, hAt(x, z) + lift, z);
      D.camera.fov = fov;
      D.camera.lookAt(target.x, hAt(target.x, target.z) + 2.3, target.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    };
    const buildings = [...(minimap.buildings || [])]
      .filter((building) => (building.w || 0) <= 36 && (building.d || 0) <= 36)
      .sort((a, b) => ((b.w || 0) * (b.d || 0)) - ((a.w || 0) * (a.d || 0)));
    if (buildings.length) {
      const building = buildings[0];
      // Stand clear of the full footprint. The previous fixed 27 m offset
      // could put this evidence camera inside a large depot or rowhouse and
      // make intact authored walls look missing in the visual gate.
      const footprint = Math.hypot(building.w || 10, building.d || 10);
      setCamera(building, Math.max(27, footprint * 0.9 + 12), Math.PI * 0.72,
        Math.max(4.8, Math.min(8.5, (building.h || 5) * 0.72)), 48);
    }
    return { hasBuilding: buildings.length > 0, hasFoliage: (minimap.treeClusters || []).length > 0 };
  });
  if (closeups.hasBuilding) {
    await new Promise((resolve) => setTimeout(resolve, 320));
    await page.screenshot({ path: path.join(dir, 'building.png') });
  }
  if (closeups.hasFoliage) {
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const clusters = world.getMinimapFeatures().treeClusters || [];
      const cluster = [...clusters].sort((a, b) => (b.r || 0) - (a.r || 0))[0];
      // Place the camera outside the authored stand radius. A fixed offset
      // could land inside a large grove and photograph the back of one alpha
      // card instead of evaluating the tree-line silhouette players see.
      const standRadius = Math.max(8, cluster.r || 18);
      const x = cluster.x - standRadius - 14;
      const z = cluster.z + standRadius * 0.26;
      D.camera.position.set(x, hAt(x, z) + 4.2, z);
      D.camera.fov = 50;
      D.camera.lookAt(cluster.x, hAt(cluster.x, cluster.z) + 3.6, cluster.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await page.screenshot({ path: path.join(dir, 'foliage.png') });
  }
  if (details.hasWater) {
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const waters = [
        ...(world.config.terrain?.lakes || []),
        ...(world.config.terrain?.marshes || []),
      ].sort((a, b) => (b.r || 0) - (a.r || 0));
      const water = waters[0];
      const distance = Math.max(22, (water.r || 40) * 0.92);
      const x = water.x - distance;
      const z = water.z + distance * 0.28;
      D.camera.position.set(x, hAt(x, z) + 6.2, z);
      D.camera.fov = 50;
      D.camera.lookAt(water.x, hAt(water.x, water.z) + 0.5, water.z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.screenshot({ path: path.join(dir, 'water.png') });

    // Exercise the same allocation-free track-contact path used by moving
    // vehicles. This verifies that liquid replaces dry dust with spray and
    // wake marks without adding a water-only renderer family.
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const world = D.world;
      const hf = world.heightField;
      const hAt = hf.getHeightAtFast || hf.getHeightAt;
      const waters = [
        ...(world.config.terrain?.lakes || []),
        ...(world.config.terrain?.marshes || []),
      ].sort((a, b) => (b.r || 0) - (a.r || 0));
      const water = waters[0];
      const x = water.x - Math.max(5, (water.r || 40) * 0.18);
      const z = water.z;
      const y = hAt(x, z) + 0.15;
      D.fx.resetAll();
      D.fx.setFrozen(false);
      for (let i = 0; i < 48; i++) {
        const lane = i % 2 === 0 ? -0.8 : 0.8;
        D.fx.dust({ x: x + lane, y, z: z - 8 + i * 0.34 }, { x: 0, y: 0, z: 1 }, 1);
      }
      D.camera.position.set(x - 12, y + 5.2, z - 15);
      D.camera.fov = 48;
      D.camera.lookAt(x, y + 0.4, z);
      D.camera.updateProjectionMatrix();
      D.camera.updateMatrixWorld(true);
      world.update(0, D.camera.position);
      D.lighting.updateFrustums();
      D.lighting.update(true);
      for (let i = 0; i < 8; i++) D.fx.update(1 / 60, [], D.camera);
      D.fx.setFrozen(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    await page.screenshot({ path: path.join(dir, 'water-interaction.png') });
  }
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  for (const mapId of requested) {
    process.stdout.write(`[map-audit] ${mapId} ... `);
    await stageMap(mapId);
    const frameRuns = [];
    for (let repeat = 0; repeat < repeats; repeat++) frameRuns.push(await sampleFrames(sampleCount));
    const frames = combineFrameRuns(frameRuns);
    const row = await collectMap(mapId, frames);
    row.gate = evaluateQuality(row);
    const before = baselineById.get(mapId);
    if (before) {
      const oldFrames = before.frames;
      const oldScene = before.scene;
      const absoluteBudgetMs = Math.max(0.75, oldFrames.medianMs * 0.08);
      row.baseline = {
        medianDeltaMs: round(frames.medianMs - oldFrames.medianMs),
        p95DeltaMs: round(frames.p95Ms - oldFrames.p95Ms),
        medianBudgetMs: round(absoluteBudgetMs),
        meshNodeDelta: row.scene.meshNodes - oldScene.meshNodes,
        instancedFamilyDelta: row.scene.instancedMeshNodes - oldScene.instancedMeshNodes,
        materialDelta: row.scene.materials - oldScene.materials,
        textureDelta: row.scene.textures - oldScene.textures,
        pass: frames.medianMs <= oldFrames.medianMs + absoluteBudgetMs
          && row.scene.meshNodes <= oldScene.meshNodes + 3
          && row.scene.instancedMeshNodes <= oldScene.instancedMeshNodes + 3
          && row.scene.materials <= oldScene.materials
          && row.scene.textures <= oldScene.textures,
      };
    }
    report.maps.push(row);
    if (captureShots) await captureMapShots(mapId);
    console.log(`${frames.medianMs.toFixed(2)} ms median, ${row.scene.meshNodes} mesh families, ${row.scene.triangles} scene tris`);
  }
  report.summary = {
    mapCount: report.maps.length,
    worstMedianMs: round(Math.max(...report.maps.map((row) => row.frames.medianMs))),
    worstP95Ms: round(Math.max(...report.maps.map((row) => row.frames.p95Ms))),
    maxMeshFamilies: Math.max(...report.maps.map((row) => row.scene.meshNodes)),
    maxSceneTriangles: Math.max(...report.maps.map((row) => row.scene.triangles)),
    baselineFailures: report.maps.filter((row) => row.baseline && !row.baseline.pass).map((row) => row.id),
    qualityFailures: report.maps.filter((row) => !row.gate.pass).map((row) => row.id),
  };
  report.pageErrors = pageErrors;
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[map-audit] wrote ${path.join(outDir, 'report.json')}`);
  if (pageErrors.length) {
    for (const error of pageErrors) console.error(`[map-audit/page] ${error}`);
    process.exitCode = 1;
  }
  if (report.summary.baselineFailures.length) {
    console.error(`[map-audit] performance/complexity gate failed: ${report.summary.baselineFailures.join(', ')}`);
    process.exitCode = 1;
  }
  if (enforceGate && report.summary.qualityFailures.length) {
    console.error(`[map-audit] environment quality gate failed: ${report.summary.qualityFailures.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
