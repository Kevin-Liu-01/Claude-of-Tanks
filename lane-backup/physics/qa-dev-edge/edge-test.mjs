// physics lane scratch (edge stand): does the engine hold an unstable edge? A cube balanced on an edge with a small
// tilt, against the rigid analytic fall (inverted pendulum about the edge, solved numerically).
const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const variant = process.argv.find((a) => a.startsWith('--opts='))?.slice(7);
const opts = variant ? JSON.parse(variant) : {};
function analytic(theta0, a, g = 9.81) {
  // box side a (cube), on an edge: COM at d = a/√2 from the edge, I_edge = m a²/6 + m d² = m (a²/6 + a²/2) = 2/3 m a²
  const d = a / Math.SQRT2, I = (2 / 3) * a * a;
  let th = theta0, w = 0, t = 0; const dt = 1e-4;
  // th: angle of the COM from vertical over the edge; lands when th reaches 45° (pi/4)
  while (th < Math.PI / 4 && t < 20) { const alpha = (g * d / I) * Math.sin(th); w += alpha * dt; th += w * dt; t += dt; }
  return t;
}
const a = 2;
for (const tiltDeg of [0.5, 1, 2, 5, 10]) {
  const world = createRigidWorld({ capacity: 1, kinematicCapacity: 0 });
  world.bindEnvironment({ groundAt: () => 0 });
  const shape = createRigidBox(a / 2, a / 2, a / 2, 2000, opts);
  // rotate about Z by 45° + tilt: balanced on the edge along Z through the origin
  const ang = Math.PI / 4 + tiltDeg * Math.PI / 180;
  const qz = Math.sin(ang / 2), qw = Math.cos(ang / 2);
  // the edge at x=0, y=0: centre at (−sin(tilt)·d, cos(tilt)·d) — place the lowest corner on the ground (the edge spheres' radius aside)
  const d = a / Math.SQRT2, t = tiltDeg * Math.PI / 180;
  const slot = world.spawn(shape, { x: -Math.sin(t) * d, y: Math.cos(t) * d + 0.001, z: 0, qx: 0, qy: 0, qz, qw });
  let fallStep = -1, sleepStep = -1;
  for (let s = 1; s <= 600; s++) {
    world.step();
    // the box's tilt from the balanced pose: angle of its local x axis from the 45° diagonal
    const q = [world.qx[slot], world.qy[slot], world.qz[slot], world.qw[slot]];
    const angNow = 2 * Math.atan2(q[2], q[3]);
    if (fallStep < 0 && Math.abs(angNow - Math.PI / 4) >= Math.PI / 4 - 0.02) fallStep = s;
    if (sleepStep < 0 && world.asleep[slot]) sleepStep = s;
  }
  const q = [world.qx[slot], world.qy[slot], world.qz[slot], world.qw[slot]];
  console.log(`tilt ${tiltDeg}°: engine falls flat at ${fallStep > 0 ? (fallStep / 60).toFixed(2) + ' s' : 'never (10 s)'}, analytic ${analytic(tiltDeg * Math.PI / 180, a).toFixed(2)} s; asleep at ${sleepStep > 0 ? (sleepStep / 60).toFixed(2) + ' s' : '-'}; final angle ${(2 * Math.atan2(q[2], q[3]) * 180 / Math.PI).toFixed(1)}°`);
}
