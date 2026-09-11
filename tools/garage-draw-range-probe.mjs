// Native diagnostic, not timing: actual completed Garage; pin only the two
// wall-clock CRT animation uniforms, then eight baseline warm frames per pose
// and synchronous control/A/B/negative framebuffer captures.
// Owns the shared FIFO lease; do not wrap in another capture-command lease.
// node tools/garage-draw-range-probe.mjs --url=http://127.0.0.1:4178 --out=/absolute/fresh-directory
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

export function garageDrawRangeUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP(S) URL');
  for (const [key, value] of [['debug', '1'], ['nosplash', '1'], ['tier', 'desktop'], ['gfxreset', '1']]) url.searchParams.set(key, value);
  return url;
}

export function checkGarageDrawRangeReport(report) {
  const failures = [...report.errors];
  if (report.failedRequests?.length || report.failedResponses?.length) failures.push('browser resource requests failed');
  if (!report.hardware?.native || !report.nativeLaunch?.verified) failures.push('native hardware/launch not verified');
  if (report.pairs.length !== 5) failures.push('all five fixed camera pairs required');
  for (const pair of report.pairs) {
    if (pair.error) failures.push(`${pair.name}: ${pair.error}`);
    if (pair.restoreError) failures.push(`${pair.name}: restoration failed: ${pair.restoreError}`);
    if (pair.controlDiffBytes !== 0) failures.push(`${pair.name}: baseline pixels are not stable`);
    if (pair.diffBytes !== 0) failures.push(`${pair.name}: A/B pixel mismatch`);
    if (!(pair.a?.frame?.scope === 'last-completed-post-frame'
      && pair.b?.frame?.scope === 'last-completed-post-frame'
      && pair.b.frame.serial > pair.a.frame.serial)) failures.push(`${pair.name}: missing completed frames`);
    if (!(pair.b?.frame?.calls <= pair.a?.frame?.calls)) failures.push(`${pair.name}: added draw calls`);
    if (!(pair.b?.frame?.triangles <= pair.a?.frame?.triangles)) failures.push(`${pair.name}: added triangles`);
    if (JSON.stringify(pair.a?.residency) !== JSON.stringify(pair.b?.residency)) failures.push(`${pair.name}: residency changed`);
    if (JSON.stringify(pair.a?.view) !== JSON.stringify(pair.b?.view)) failures.push(`${pair.name}: camera/target changed`);
    if (pair.glErrors?.length) failures.push(`${pair.name}: GL error`);
  }
  if (!report.pairs.some(pair => pair.b?.frame?.triangles < pair.a?.frame?.triangles)) failures.push('no real submitted-triangle reduction');
  if (!report.pairs.some(pair => pair.draws?.b?.some(draw => draw.completed && pair.draws.a.some(before =>
    before.completed && before.mesh === draw.mesh && before.camera === draw.camera
      && draw.count < before.count && draw.triangles < before.triangles)))) failures.push('no native trimmed batch submission');
  if (!report.pairs.some(pair => pair.negativeDiffBytes > 0)) failures.push('drop-all negative control did not change pixels');
  return failures;
}

function capturePair({ name, angle, baseCamera }) {
  const { scene, camera, renderer, post, garageDressing, showroom } = window.__DEBUG;
  const gl = renderer.getContext(), result = { name, angle, glErrors: [], images: {}, draws: { a: [], b: [], negative: [] } };
  const savedCamera = camera.clone(), callbacks = [], clockCallbacks = [];
  garageDressing.group.traverse(mesh => {
    if (!mesh.isMesh || mesh.castShadow || !(mesh.userData.staticDrawRangeRuns >= 2 || mesh.userData.workshopNativeClutterBatch)
      || !(mesh.userData.workshopStaticDisplayMerge || mesh.userData.workshopStaticMerge)) return;
    callbacks.push({ mesh, before: mesh.onBeforeRender, after: mesh.onAfterRender,
      start: mesh.geometry.drawRange.start, count: mesh.geometry.drawRange.count,
      nativeBatch:mesh.userData.workshopNativeClutterBatch===true });
  });
  const eligible = new Set(callbacks.map(entry => entry.mesh));
  const savedTarget = renderer.getRenderTarget(), savedFace = renderer.getActiveCubeFace();
  const savedMip = renderer.getActiveMipmapLevel(), savedDirect = renderer.renderBufferDirect;
  const viewport = renderer.getViewport({ copy: value => ({ ...value }) });
  const scissor = renderer.getScissor({ copy: value => ({ ...value }) });
  const scissorTest = renderer.getScissorTest();
  let mode = null;
  const pixels = () => {
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw new Error('expected default output framebuffer');
    const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    for (let i = 0; i < 16; i++) { const error = gl.getError(); if (!error) break; result.glErrors.push(error); }
    return bytes;
  };
  const diff = (a, b) => {
    if (a.length !== b.length) throw new Error('framebuffer dimensions changed');
    let changed = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
    return changed;
  };
  const residency = () => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const texture = value => { if (value?.isTexture) textures.add(value.uuid); };
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry.uuid);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        materials.add(material.uuid); Object.values(material).forEach(texture);
        for (const uniform of Object.values(material.uniforms || {})) {
          if (Array.isArray(uniform?.value)) uniform.value.forEach(texture); else texture(uniform?.value);
        }
      }
    });
    return { geometries: [...geometries].sort(), materials: [...materials].sort(), textures: [...textures].sort(),
      gpu: { ...renderer.info.memory }, programs: (renderer.info.programs || []).map(program => program.id).sort((a, b) => a - b) };
  };
  const render = label => {
    mode = label;
    renderer.setRenderTarget(null); post.render(0);
    const bytes = pixels();
    result.images[label] = renderer.domElement.toDataURL('image/png');
    result[label] = { frame: { ...post.lastCompletedFrame }, residency: residency(), view: {
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray(),
      target: renderer.getRenderTarget()?.uuid ?? null, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
      graphics: { preset: window.__DEBUG.quality.resolvePresetName(), pixelRatio: renderer.getPixelRatio(),
        dynamicScale: post.dynScale, performanceTrim: post.perfTrim, aa: renderer.domElement.dataset.postAa },
    } };
    mode = null;
    return bytes;
  };
  try {
    if (!callbacks.length) throw new Error('no candidate static merged meshes found');
    if (window.__DEBUG.game.phase !== 'garage') throw new Error('expected actual Garage');
    // CRT onBeforeRender samples performance.now(), even for render(0). Keep
    // its original scheduling side effects but compare one identical visible
    // animation phase, without hiding screens or disabling any post pass.
    for (const name of ['garage_battle_archive_screen', 'garage_battle_archive_screen_secondary']) {
      const mesh = garageDressing.group.getObjectByName(name), uniform = mesh?.material?.uniforms?.uTime;
      if (!mesh || !uniform || typeof uniform.value !== 'number') throw new Error(`missing animated CRT: ${name}`);
      const before = mesh.onBeforeRender, time = uniform.value;
      clockCallbacks.push({ mesh, before, uniform, time });
      mesh.onBeforeRender = function (...args) { before.apply(this, args); uniform.value = time; };
    }
    result.pinnedAnimationClocks = clockCallbacks.map(({ mesh, time }) => ({ name: mesh.name, time }));
    result.eligibleMeshes = callbacks.map(({ mesh }) => ({ name: mesh.name, id: mesh.uuid,
      runs: mesh.userData.staticDrawRangeRuns, elements: mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count }));
    camera.position.fromArray(baseCamera.position); camera.quaternion.fromArray(baseCamera.quaternion);
    camera.projectionMatrix.fromArray(baseCamera.projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); camera.updateMatrixWorld(true);
    const center = showroom.debugState().box?.center;
    if (!Array.isArray(center) || center.length !== 3) throw new Error('showroom target unavailable');
    // The same target and projection serve all poses; default keeps its exact
    // authored quaternion. Additional angles include two near-edge sweeps.
    const centerVector = camera.position.clone().fromArray(center);
    const target = camera.position.clone().addScaledVector(camera.getWorldDirection(camera.position.clone()),
      camera.position.distanceTo(centerVector));
    result.orbitTarget = target.toArray();
    if (angle !== 0) {
      const dx = camera.position.x - target.x, dz = camera.position.z - target.z;
      camera.position.set(target.x + dx * Math.cos(angle) - dz * Math.sin(angle), camera.position.y,
        target.z + dx * Math.sin(angle) + dz * Math.cos(angle));
      camera.lookAt(target); camera.updateMatrixWorld(true);
    }
    renderer.renderBufferDirect = function (...args) {
      const mesh = args[4], geometry = args[2], record = mode && eligible.has(mesh) ? {
        mesh: mesh.uuid, camera: args[0].uuid, start: geometry.drawRange.start,
        count: Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : geometry.index?.count ?? geometry.attributes.position.count,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, completed: false,
      } : null;
      try { const value = savedDirect.apply(this, args); if (record) record.completed = true; return value; }
      finally {
        if (record) {
          record.calls = renderer.info.render.calls - record.calls;
          record.triangles = renderer.info.render.triangles - record.triangles;
          if (mesh.userData.workshopNativeClutterBatch) record.count=record.triangles*3;
          (result.draws[mode] ||= []).push(record);
        }
      }
    };
    // Warm the native batched shader and its plain-mesh control before any
    // residency comparison. Both draw the exact same baked buffers; toggling
    // the native marker lets the control submit them as the previous merge.
    for (let i = 0; i < 8; i++) post.render(0);
    for (const entry of callbacks) {
      entry.mesh.onBeforeRender = () => {}; entry.mesh.onAfterRender = () => {};
      if(entry.nativeBatch)entry.mesh.isBatchedMesh=false;
    }
    renderer.setRenderTarget(null);
    for (let i = 0; i < 8; i++) post.render(0);
    const control = render('control'), a = render('a');
    for (const entry of callbacks) {
      entry.mesh.onBeforeRender = entry.before; entry.mesh.onAfterRender = entry.after;
      if(entry.nativeBatch)entry.mesh.isBatchedMesh=true;
    }
    const b = render('b');
    result.controlDiffBytes = diff(control, a); result.diffBytes = diff(a, b);
    for (const entry of callbacks) {
      if(entry.nativeBatch)entry.mesh.isBatchedMesh=false;
      entry.mesh.onBeforeRender = () => { entry.mesh.geometry.setDrawRange(0, 0); };
      entry.mesh.onAfterRender = () => { entry.mesh.geometry.setDrawRange(entry.start, entry.count); };
    }
    const negative = render('negative'); result.negativeDiffBytes = diff(a, negative);
  } catch (error) { result.error = String(error); }
  finally {
    try {
      renderer.renderBufferDirect = savedDirect;
      for (const entry of callbacks) {
        entry.mesh.onBeforeRender = entry.before; entry.mesh.onAfterRender = entry.after;
        if(entry.nativeBatch)entry.mesh.isBatchedMesh=true;
        entry.mesh.geometry.setDrawRange(entry.start, entry.count);
      }
      for (const entry of clockCallbacks) {
        entry.mesh.onBeforeRender = entry.before; entry.uniform.value = entry.time;
      }
      camera.copy(savedCamera); camera.updateMatrixWorld(true);
      renderer.setRenderTarget(null); post.render(0);
    } catch (error) { result.restoreError = String(error); }
    finally {
      renderer.setRenderTarget(savedTarget, savedFace, savedMip);
      renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
      renderer.setScissor(scissor.x, scissor.y, scissor.z, scissor.w);
      renderer.setScissorTest(scissorTest);
    }
  }
  return result;
}

async function main() {
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const requested = option('url'), output = option('out');
  if (!requested || !output) throw new Error('Required --url=http(s)://served-build --out=/absolute/fresh-directory');
  const url = garageDrawRangeUrl(requested);
  const out = resolve(output); await mkdir(out, { recursive: false });
  const report = { protocol: 'garage-static-range-native-rgba-v1', diagnosticOnly: true,
    url: url.href, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    toolHash: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    errors: [], pairs: [], failedRequests: [], failedResponses: [] };
  const lock = createCaptureLock();
  let browser, refresher;
  try {
    await lock.acquire();
    refresher = setInterval(() => lock.refresh(), 30_000); refresher.unref();
    browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', protocolTimeout: 120_000,
      args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
    report.nativeLaunch = verifyNativeBrowserLaunch(browser);
    const page = await browser.newPage(); await page.setViewport(report.viewport);
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => {
      if (response.status() >= 400) report.failedResponses.push({ url: response.url(), status: response.status() });
    });
    const response = await page.goto(url.href, { waitUntil: 'networkidle0', timeout: 120_000 });
    report.buildIndexHash = createHash('sha256').update(await response.buffer()).digest('hex');
    await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.garageDressing?.isBuilt()
      && window.__DEBUG.garageDressing.group.userData.optimizationReceipt, { timeout: 120_000 });
    report.baseCamera = await page.evaluate(() => {
      const camera = window.__DEBUG.camera;
      return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray() };
    });
    report.hardware = await page.evaluate(() => {
      const gl = window.__DEBUG.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
      return { renderer, vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        version: gl.getParameter(gl.VERSION), native: !!renderer && !/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(renderer) };
    });
    for (const [name, angle] of [['default', 0], ['edge-left', -Math.PI / 4], ['quarter', Math.PI / 2],
      ['edge-right', 3 * Math.PI / 4], ['rear', Math.PI]]) {
      const pair = await page.evaluate(capturePair, { name, angle, baseCamera: report.baseCamera });
      for (const [kind, data] of Object.entries(pair.images)) {
        const bytes = Buffer.from(data.split(',')[1], 'base64'), path = `${name}-${kind}.png`;
        await writeFile(resolve(out, path), bytes, { flag: 'wx' });
        pair.images[kind] = { path, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      report.pairs.push(pair);
    }
  } catch (error) { report.errors.push(String(error)); }
  finally {
    try { await browser?.close(); } catch (error) { report.errors.push(`browser cleanup: ${error}`); }
    clearInterval(refresher);
    lock.release();
    report.failures = checkGarageDrawRangeReport(report); report.passed = report.failures.length === 0;
    await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  if (!report.passed) throw new Error(`Garage draw-range gate failed: ${report.failures.join('; ')}`);
  console.log(`Garage draw-range native RGBA gate PASS: ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
