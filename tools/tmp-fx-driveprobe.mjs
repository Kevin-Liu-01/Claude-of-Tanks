// TEMP effects_combat r1: REAL-TIME keyboard drive probe (suspension, band
// deformation, dust corridor, prints, exhaust, slide roll) on the Tiger
// (fully exposed running gear).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

mkdirSync('shots/fxprobe', { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5992, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.screenshot({ path: `shots/fxprobe/${name}.png` });
  console.log(`[driveprobe] ${name}.png`);
}
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.startBattle('tiger1');
  D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
});
await sleep(3200); // flyby ends
await page.keyboard.down('KeyW');
await sleep(5000); // real-time drive: dust/prints/exhaust accumulate
// live side-on frame WHILE MOVING (external pose set, sim keeps running)
await page.evaluate(() => {
  const D = window.__DEBUG;
  const p = D.game.player;
  const st = p.state;
  const side = { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) };
  const ahead = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) };
  // aim the camera slightly AHEAD so the mid-motion frame keeps the hull centered
  const look = D.rig.aimPoint.clone().set(st.pos.x + ahead.x * 3, st.pos.y + 0.9, st.pos.z + ahead.z * 3);
  const cam = look.clone(); cam.x += side.x * 7.5; cam.z += side.z * 7.5; cam.y += 0.4;
  D.rig.setExternalPose(cam, look, 45);
});
await sleep(120);
await shot('kbd_side_moving');
// rear wake corridor while moving
await page.evaluate(() => {
  const D = window.__DEBUG;
  const st = D.game.player.state;
  const back = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
  const cam = D.rig.aimPoint.clone().set(st.pos.x + back.x * 16, st.pos.y + 4.5, st.pos.z + back.z * 16);
  const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.0, st.pos.z);
  D.rig.setExternalPose(cam, look, 50);
});
await sleep(120);
await shot('kbd_wake_moving');
// hard slide at speed — chase roll
await page.keyboard.down('KeyA');
await sleep(1300);
const roll = await page.evaluate(() => {
  const D = window.__DEBUG;
  const st = D.game.player.state;
  const back = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
  const cam = D.rig.aimPoint.clone().set(st.pos.x + back.x * 12, st.pos.y + 3.4, st.pos.z + back.z * 12);
  const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.3, st.pos.z);
  D.rig.setExternalPose(cam, look, 45);
  return { speed: st.speed.toFixed(1), yawRate: st.yawRate.toFixed(2), swayEst: (st._swayEst || 0).toFixed(4) };
});
console.log('[driveprobe] slide:', JSON.stringify(roll));
await sleep(100);
await shot('kbd_slide_roll');
await page.keyboard.up('KeyA');
await page.keyboard.up('KeyW');
// idle exhaust check: stop, wait, close rear-quarter frame
await sleep(1500);
await page.evaluate(() => {
  const D = window.__DEBUG;
  const st = D.game.player.state;
  const back = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
  const cam = D.rig.aimPoint.clone().set(st.pos.x + back.x * 7 + 2, st.pos.y + 2.4, st.pos.z + back.z * 7);
  const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.4, st.pos.z);
  D.rig.setExternalPose(cam, look, 45);
});
await sleep(120);
await shot('kbd_stopped_rear');
await browser.close();
await server.close();
