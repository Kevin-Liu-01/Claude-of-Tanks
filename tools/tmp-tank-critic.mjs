#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const ids = (arg('ids', arg('id', 'isu122s')) || '').split(',').map((v) => v.trim()).filter(Boolean);
const finalEvidence = process.argv.includes('--final');
const profileEvidence = process.argv.includes('--profile');
const outRoot = path.resolve(arg('out', 'shots'));
const port = Number(arg('port', '4197'));
const pagePath = arg('page', 'tools/tmp-tank-critic.html').replace(/^\//, '');
const extraQuery = new URLSearchParams(arg('query', ''));

const vite = spawn(path.resolve('node_modules/.bin/vite'), [
  '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', (b) => { viteLog += b; });
vite.stderr.on('data', (b) => { viteLog += b; });

async function waitForServer() {
  const url = `http://127.0.0.1:${port}/${pagePath}`;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready on ${port}\n${viteLog}`);
}

const decode = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
async function writeFrames(dir, frames) {
  await mkdir(dir, { recursive: true });
  await Promise.all(Object.entries(frames).map(([name, url]) =>
    writeFile(path.join(dir, `${name}.png`), decode(url))));
}

let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu-sandbox'] });
  for (const id of ids) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));
    const query = new URLSearchParams({
      id,
      ...(finalEvidence ? { final: '1' } : {}),
      ...(profileEvidence ? { profile: '1' } : {}),
    });
    for (const [key, value] of extraQuery) query.set(key, value);
    await page.goto(`http://127.0.0.1:${port}/${pagePath}?${query}`, {
      waitUntil: 'networkidle0', timeout: 120_000,
    });
    await page.waitForFunction(() => window.__CRITIC_READY === true, { timeout: 120_000 });
    const payload = await page.evaluate(() => ({
      pairs: window.__CRITIC_PAIRS,
      yaw0: window.__CRITIC_YAW0,
      yaw90: window.__CRITIC_YAW90,
    }));
    const modelOut = finalEvidence ? path.join(outRoot, id) : path.join(outRoot, `critic-${id}`);
    if (finalEvidence) {
      await writeFrames(path.join(modelOut, 'paired'), payload.pairs);
      await writeFrames(path.join(modelOut, 'yaw0'), payload.yaw0);
      await writeFrames(path.join(modelOut, 'yaw90'), payload.yaw90);
    } else {
      await writeFrames(modelOut, payload.pairs);
    }
    if (errors.length) throw new Error(`${id} browser errors:\n${errors.join('\n')}`);
    console.log(`${id}: ${Object.keys(payload.pairs).length} paired${finalEvidence ? ` + ${Object.keys(payload.yaw0).length} yaw0 + ${Object.keys(payload.yaw90).length} yaw90` : ''}`);
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  vite.kill('SIGTERM');
}
