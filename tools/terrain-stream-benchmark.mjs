import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5910, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : 5910;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tools/terrain-stream-benchmark.html`, {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction('window.__TERRAIN_STREAM_BENCH', { timeout: 120000 });
  const report = await page.evaluate(() => window.__TERRAIN_STREAM_BENCH);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
