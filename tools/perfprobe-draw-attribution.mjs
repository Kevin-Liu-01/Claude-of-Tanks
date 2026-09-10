/** Serialized into the page. Observation only; the sampler owns counters/frame boundaries. */
export function installPerfDrawAttribution() {
  const limit = 4096, renderer = window.__DEBUG?.renderer;
  const globalDescriptor = Object.getOwnPropertyDescriptor(window, '__PERF_DRAW_ATTRIBUTION');
  const ids = new WeakMap(), tuples = new WeakMap(), absent = {};
  const metadata = [], counts = new Float64Array(limit), touched = new Uint16Array(limit);
  const errors = [];
  let nextId = 0, touchedCount = 0, active = false, result = null, cleanup = null;
  let original, descriptor, installed = false, frames = 0, expectedTotal = 0, observedTotal = 0;
  let calls = 0, entries = 0, zero = 0, multi = 0, dropped = 0, identityDrops = 0;
  let totalEntries = 0, totalZero = 0, totalMulti = 0, preWindowDiscardedCalls = 0;
  let peak = null, mismatchFrames = 0, errorCount = 0;
  const error = message => {
    errorCount++;
    if (errors.length >= 16) return;
    try { errors.push(String(message).slice(0, 240)); }
    catch { errors.push('Unserializable observation error'); }
  };
  const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
  const id = value => {
    if (!object(value)) return null;
    if (!ids.has(value)) ids.set(value, ++nextId);
    return ids.get(value);
  };
  const label = value => typeof value === 'string' ? value.slice(0, 120) : '';
  function path(value) {
    const names = [];
    for (let node = value, depth = 0; node && depth < 16; node = node.parent, depth++) {
      if (node.name) names.push(label(node.name));
    }
    return names.reverse().join('/').slice(0, 640);
  }
  function identity(args) {
    // Weak-key tuple cache avoids a newly allocated string key on every draw.
    let node = tuples;
    for (let index = 0; index < 6; index++) {
      const key = object(args[index]) ? args[index] : absent;
      let next = node.get(key);
      if (index === 5) {
        if (next !== undefined) return next;
        if (metadata.length >= limit) return -1;
        const [camera, scene, geometry, material, mesh, group] = args;
        const shadowIndex = window.__DEBUG?.lighting?.csm?.lights
          ?.findIndex(light => light.shadow?.camera === camera) ?? -1;
        next = metadata.length;
        metadata.push({ identity: next, objectId: id(mesh), objectName: label(mesh?.name),
          objectType: label(mesh?.type), ancestorPath: path(mesh), sceneId: id(scene),
          sceneName: label(scene?.name), sceneType: label(scene?.type), cameraId: id(camera),
          cameraName: label(camera?.name), shadowCascade: shadowIndex >= 0 ? shadowIndex : null,
          geometryId: id(geometry), materialId: id(material), materialName: label(material?.name),
          materialType: label(material?.type), groupStart: group?.start ?? null,
          groupCount: Number.isFinite(group?.count) ? group.count : null });
        node.set(key, next); return next;
      }
      if (!next) {
        if (metadata.length >= limit) return -1;
        next = new WeakMap(); node.set(key, next);
      }
      node = next;
    }
  }
  function readCalls() {
    const value = renderer?.info?.render?.calls;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid renderer draw counter');
    return value;
  }
  function observed(...args) {
    if (!active) return Reflect.apply(original, this, args);
    let before = null, key = -1;
    entries++;
    try { before = readCalls(); key = identity(args); } catch (failure) { error(failure); }
    try { return Reflect.apply(original, this, args); }
    catch (failure) { error('Original draw threw'); throw failure; }
    finally {
      try {
        const after = readCalls(), delta = before === null ? null : after - before;
        if (!Number.isSafeInteger(delta) || delta < 0) error('Unusable direct-draw counter delta');
        else {
          calls += delta;
          if (delta === 0) zero++;
          if (delta > 1) multi++;
          if (key < 0) { dropped += delta; identityDrops++; }
          else if (delta > 0) {
            if (counts[key] === 0) touched[touchedCount++] = key;
            counts[key] += delta;
          }
        }
      } catch (failure) { error(failure); }
    }
  }
  function clearFrame() {
    for (let index = 0; index < touchedCount; index++) counts[touched[index]] = 0;
    touchedCount = 0; calls = 0; entries = 0; zero = 0; multi = 0; dropped = 0;
  }
  const api = {
    start() {
      if (cleanup || result || frames) { error('Invalid attribution start boundary'); return; }
      preWindowDiscardedCalls += calls; clearFrame(); active = true;
    },
    frame(now, expectedCalls) {
      if (!active) { error('Frame outside active attribution'); return; }
      if (renderer?.renderBufferDirect !== observed) error('Direct-draw observer ownership lost');
      const valid = Number.isFinite(now) && Number.isSafeInteger(expectedCalls) && expectedCalls >= 0;
      if (!valid || expectedCalls !== calls || dropped) mismatchFrames++;
      frames++; observedTotal += calls; expectedTotal += valid ? expectedCalls : 0;
      totalEntries += entries; totalZero += zero; totalMulti += multi;
      if (valid && (!peak || expectedCalls > peak.expectedCalls)) {
        const rows = [];
        for (let index = 0; index < touchedCount; index++) {
          const key = touched[index]; rows.push({ ...metadata[key], calls: counts[key] });
        }
        rows.sort((a, b) => b.calls - a.calls || a.identity - b.identity);
        peak = { atMs: now, expectedCalls, observedCalls: calls, droppedCalls: dropped,
          entries, zeroCallEntries: zero, multiCallEntries: multi, rows };
      }
      clearFrame();
    },
    finish() {
      if (result) return result;
      if (renderer?.renderBufferDirect !== observed) error('Direct-draw observer ownership lost');
      active = false;
      result = { protocol: 'perfprobe-draw-attribution-v1', pass: installed && frames > 0
        && mismatchFrames === 0 && identityDrops === 0 && errorCount === 0,
        frames, expectedCalls: expectedTotal, observedCalls: observedTotal, entries: totalEntries,
        zeroCallEntries: totalZero, multiCallEntries: totalMulti, mismatchFrames,
        identityLimit: limit, identities: metadata.length, identityDrops, errorCount, errors: errors.slice(),
        preWindowDiscardedCalls, peak,
        outOfWindow: { calls, entries, zeroCallEntries: zero, multiCallEntries: multi, droppedCalls: dropped },
        coverage: 'Admitted sampler callbacks only; terminal pending draws are explicitly excluded. CPU submission counters, not GPU duration.' };
      clearFrame(); return result;
    },
    stop() {
      if (cleanup) return cleanup;
      active = false;
      let restored = true;
      try {
        if (installed) {
          if (renderer.renderBufferDirect !== observed) restored = false;
          else if (descriptor) Object.defineProperty(renderer, 'renderBufferDirect', descriptor);
          else restored = Reflect.deleteProperty(renderer, 'renderBufferDirect');
        }
        if (window.__PERF_DRAW_ATTRIBUTION !== api) restored = false;
        else if (globalDescriptor) Object.defineProperty(window, '__PERF_DRAW_ATTRIBUTION', globalDescriptor);
        else restored = Reflect.deleteProperty(window, '__PERF_DRAW_ATTRIBUTION') && restored;
      } catch (failure) { restored = false; error(failure); }
      cleanup = { restored, installed, errors: errors.slice() }; return cleanup;
    },
  };
  try {
    original = renderer?.renderBufferDirect;
    if (typeof original !== 'function') throw new Error('Missing renderBufferDirect');
    descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect');
    Object.defineProperty(renderer, 'renderBufferDirect', descriptor
      ? { ...descriptor, value: observed } : { value: observed, writable: true, configurable: true });
    installed = true;
  } catch (failure) { error(failure); }
  try {
    Object.defineProperty(window, '__PERF_DRAW_ATTRIBUTION', {
      value: api, writable: globalDescriptor?.writable ?? true,
      configurable: globalDescriptor?.configurable ?? true,
      enumerable: globalDescriptor?.enumerable ?? true,
    });
  } catch (failure) {
    // A locked diagnostic slot must not leave an unreachable draw wrapper.
    if (installed && renderer.renderBufferDirect === observed) {
      if (descriptor) Object.defineProperty(renderer, 'renderBufferDirect', descriptor);
      else Reflect.deleteProperty(renderer, 'renderBufferDirect');
    }
    throw failure;
  }
}
