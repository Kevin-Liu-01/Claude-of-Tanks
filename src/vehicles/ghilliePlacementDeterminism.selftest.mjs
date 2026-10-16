// A camouflage suit lays the same cloth however busy the process and the machine are (2026-10-11, the coordinator's
// determinism ruling on the netting lane's finding): ghillieSuit.ts's armour probe used to size its grids from a measured
// bounds pass, and a suit built after other tanks in the same process, on a loaded machine, intermittently came out with
// cloth missing or moved (leclerc_sxxi's deck nets lost their left halves; m1a1_abrams_fep's turret net hung into the gun
// corridor in a loaded fleet run). The probe now uses one fixed window round the owner's origin.
//
// This receipt builds each suited hull twice, in separate child processes: alone on an idle process (the reference),
// and after a run of other hulls (suited ones among them) with the event loop yielded between builds while CPU burners
// load the machine. Every suit mesh (`<id>_ghillie_*`) must come out identical: the same meshes, vertex counts and
// positions (to 0.01 mm). A difference names the hull and the mesh.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TARGETS = ['m1a1_abrams_fep', 'leo2a6_ua', 'pt91a_twardy'];
// built first in the loaded child: suited and unsuited hulls of every family the fleet's suits sit on
const OTHERS = ['ua_m1a1', 'leo2a2', 't90am', 'strv103b', 'm1a1_abrams_hc', 't84', 't84bm_oplot_m', 'strv121'];
const BURNERS = 3;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function suitDigest(createTank, id) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
  // let any deferred work of the build settle before reading (both modes read the same settled build)
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  tank.root.updateMatrixWorld(true);
  const meshes = [];
  tank.root.traverse((o) => {
    if (!o.isMesh || !o.name?.includes('_ghillie_') || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < pos.array.length; i++) {
      h = Math.imul(h ^ Math.round(pos.array[i] * 1e5), 16777619) >>> 0;
    }
    meshes.push(`${o.name}:${pos.count}:${h.toString(16)}`);
  });
  tank.dispose?.();
  meshes.sort();
  return meshes;
}

async function child(mode, id) {
  const { installCanvasFixture } = await import('./canvasFixture.test-support.mjs');
  installCanvasFixture();
  const { createTank } = await import('./tankFactory.ts');
  if (mode === 'loaded') {
    for (const other of OTHERS) {
      const tank = createTank(other, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      tank.dispose?.();
    }
  }
  process.stdout.write(`${JSON.stringify(await suitDigest(createTank, id))}\n`);
}

function runChild(mode, id) {
  const r = spawnSync(process.execPath, [SELF, `--child=${mode}`, `--id=${id}`],
    { encoding: 'utf8', timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, `${mode} build of ${id} exited ${r.status}: ${r.error ?? ''}\n${(r.stderr || '').slice(-2000)}`);
  const line = r.stdout.trim().split('\n').pop();
  return JSON.parse(line);
}

if (arg('child')) {
  await child(arg('child'), arg('id'));
} else {
  const reference = new Map(TARGETS.map((id) => [id, runChild('fresh', id)]));
  for (const [id, meshes] of reference) assert.ok(meshes.length > 0, `${id} builds its suit (no _ghillie_ mesh found)`);
  const burners = Array.from({ length: BURNERS }, () => spawn(process.execPath, ['-e', 'for (;;) {}'], { stdio: 'ignore' }));
  try {
    for (const id of TARGETS) {
      const loaded = runChild('loaded', id);
      assert.deepEqual(loaded, reference.get(id),
        `${id}: the suit laid after ${OTHERS.length} other hulls under ${BURNERS} CPU burners matches the idle build`);
    }
  } finally {
    for (const b of burners) b.kill('SIGKILL');
  }
  console.log(`ghilliePlacementDeterminism.selftest: ${TARGETS.length} suited hulls lay identical cloth alone and after `
    + `${OTHERS.length} other hulls under ${BURNERS} CPU burners (${[...reference.values()].reduce((n, m) => n + m.length, 0)} suit meshes)`);
}
