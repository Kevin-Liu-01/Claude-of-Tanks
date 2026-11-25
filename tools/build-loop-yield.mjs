// The one yield a Node build loop awaits between builds (roadlife-retention-277, 2026-11-24; it joins fills-leak-276's).
// First-party tooling: Kevin B. Liu.
//
// A loop that builds world after world (or tank after tank) chained only through awaits that resolve at once never leaves
// its job: the microtask queue never drains and the event loop never turns. Two releases wait on that turn:
//   - V8 keeps a WeakRef's target alive until the job that made or read it ends. A world build makes ~230 WeakRefs
//     (engine/renderLayers.ts's shadow-caster list, engine/shadowCasterProxies.ts's caster owners), so every map's meshes
//     and geometry stayed reachable past every GC (roadLife.selftest: external memory 1.2 -> 10.2 GiB over 7 maps, peak
//     8.13 GiB; a forced gc() freed nothing).
//   - Node runs N-API finalizers, which free native memory such as a napi-rs canvas's pixels, in a later macrotask
//     (gen-interior-fills --all: ~120 MB an id, 31 GB resident).
// A macrotask yield ends the job and runs the queued finalizers. Await it between builds, once the last build is dropped.
// tools/build-loop-yield.selftest.mjs pins the WeakRef half; tools/gen-interior-fills-memory.selftest.mjs the finalizers'.

/** Yield one macrotask so the finished build's WeakRef targets and native memory can be freed. */
export function betweenBuilds() { return new Promise((done) => setImmediate(done)); }
