// TEMP lighting_post r6: dump the terrain's COMPILED fragment shader — does it
// contain shadow sampling at all? Compare against a grass material program.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const vite = await createServer({
  server: { port: 5706, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5706/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const res = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const gl = D.renderer.getContext();
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const terr = world.children.find((c) => c.name === 'terrain');
  let terrMat = null;
  terr.traverse((o) => { if (!terrMat && o.isMesh && o.material && o.material.isMeshStandardMaterial) terrMat = o.material; });
  const veg = world.children.find((c) => c.name === 'vegetation');
  let vegMat = null;
  veg.traverse((o) => { if (!vegMat && o.isInstancedMesh && o.castShadow && o.receiveShadow && o.material.isMeshStandardMaterial) vegMat = o.material; });

  const analyze = (mat, label) => {
    if (!mat) return { label, err: 'no mat' };
    const props = D.renderer.properties.get(mat);
    const prog = props && (props.currentProgram || props.program);
    if (!prog) return { label, err: 'no program', keys: Object.keys(props || {}) };
    let fsrc = '';
    try { fsrc = gl.getShaderSource(prog.fragmentShader); } catch (e) { return { label, err: String(e) }; }
    const count = (re) => (fsrc.match(re) || []).length;
    return {
      label,
      matUuidShort: mat.uuid.slice(0, 6),
      progId: prog.id,
      hasUSE_SHADOWMAP: /#define USE_SHADOWMAP/.test(fsrc),
      hasUSE_CSM: /#define USE_CSM/.test(fsrc),
      csmCascades: (fsrc.match(/#define CSM_CASCADES (\d+)/) || [])[1],
      numDirLights: (fsrc.match(/#define NUM_DIR_LIGHTS (\d+)/) || [])[1],
      numDirShadows: (fsrc.match(/#define NUM_DIR_LIGHT_SHADOWS (\d+)/) || [])[1],
      getShadowCalls: count(/getShadow\(/g),
      dirShadowMapDecl: /directionalShadowMap/.test(fsrc),
      cotSunVis: /cotSunVis/.test(fsrc),
      samplerCount: count(/uniform sampler/g),
      receiveShadowDefine: /#define USE_SHADOWMAP/.test(fsrc),
    };
  };
  return [analyze(terrMat, 'terrain'), analyze(vegMat, 'veg-caster')];
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
await vite.close();
