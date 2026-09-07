/** Opt-in, bounded observation of the local rendered vehicle only. No game writes. */
export function startMotionSample() {
  window.__COT_MOTION_SAMPLE?.dispose();
  const d = window.__DEBUG;
  if (!d?.game?.player?.visual?.root || !d.camera) throw new Error('motion_probe_unavailable');
  const columns = ['ms', 'x', 'y', 'z', 'yaw', 'pitch', 'roll', 'speed', 'yawRate',
    'suspPitch', 'suspRoll', 'sway', 'rootX', 'rootY', 'rootZ', 'rootPitch', 'rootYaw', 'rootRoll',
    'cameraX', 'cameraY', 'cameraZ', 'cameraPitch', 'cameraYaw', 'cameraRoll', 'reconciliations', 'animationTicks'];
  const buffer = new Float64Array(12000 * columns.length);
  let count = 0, dropped = 0, raf = 0, disposed = false, previousFrame = -1;
  const started = performance.now();
  function sample() {
    if (disposed) return;
    const p = d.game.player;
    const frame = d.frameLoopScheduler?.animationTicks;
    if (Number.isSafeInteger(frame) && frame !== previousFrame &&
        !document.hidden && document.hasFocus() && d.game.phase === 'battle' &&
        d.game.preBattleS <= 0 && !d.game.result && p?.visual && p.state) {
      previousFrame = frame;
      if (count === 12000) dropped++;
      else {
        const s = p.state, r = p.visual.root, c = d.camera;
        let i = count++ * columns.length;
        buffer[i++] = performance.now() - started;
        buffer[i++] = s.pos.x; buffer[i++] = s.pos.y; buffer[i++] = s.pos.z;
        buffer[i++] = s.yaw; buffer[i++] = s.visualPitch; buffer[i++] = s.visualRoll;
        buffer[i++] = s.speed; buffer[i++] = s.yawRate;
        buffer[i++] = s._susp?.p ?? 0; buffer[i++] = s._susp?.r ?? 0;
        buffer[i++] = s._swayEst ?? 0;
        buffer[i++] = r.position.x; buffer[i++] = r.position.y; buffer[i++] = r.position.z;
        buffer[i++] = r.rotation.x; buffer[i++] = r.rotation.y; buffer[i++] = r.rotation.z;
        buffer[i++] = c.position.x; buffer[i++] = c.position.y; buffer[i++] = c.position.z;
        buffer[i++] = c.rotation.x; buffer[i++] = c.rotation.y; buffer[i++] = c.rotation.z;
        buffer[i++] = d.network?.prediction?.reconciliations ?? 0;
        buffer[i] = frame;
      }
    }
    raf = requestAnimationFrame(sample);
  }
  window.__COT_MOTION_SAMPLE = { columns, buffer, get count() { return count; },
    get dropped() { return dropped; }, dispose() { disposed = true; cancelAnimationFrame(raf); } };
  raf = requestAnimationFrame(sample);
}

export function stopMotionSample() {
  const sample = window.__COT_MOTION_SAMPLE;
  if (!sample) return null;
  sample.dispose();
  const rows = Array.from({ length: sample.count }, (_, n) =>
    Array.from(sample.buffer.subarray(n * sample.columns.length, (n + 1) * sample.columns.length)));
  delete window.__COT_MOTION_SAMPLE;
  return { columns: sample.columns, rows, dropped: sample.dropped };
}
