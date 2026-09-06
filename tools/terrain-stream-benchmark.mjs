import { pathToFileURL } from 'node:url';

function validateScenario(mapId, cpuRate) {
  if (!['verdant', 'winter'].includes(mapId)) throw new Error('terrain benchmark: --map must be verdant or winter');
  if (!Number.isInteger(cpuRate) || cpuRate < 1 || cpuRate > 6) {
    throw new Error('terrain benchmark: --cpu must be an integer from 1 through 6');
  }
  return { mapId, cpuRate };
}

export function parseTerrainBenchmarkArgs(args) {
  let mapId = 'verdant';
  let cpuRate = 1;
  const seen = new Set();
  for (const arg of args) {
    const match = /^(--map|--cpu)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error('terrain benchmark: unknown, malformed, or duplicate option');
    seen.add(match[1]);
    if (match[1] === '--map') mapId = match[2];
    else {
      if (!/^[1-6]$/.test(match[2])) throw new Error('terrain benchmark: --cpu must be an integer from 1 through 6');
      cpuRate = Number(match[2]);
    }
  }
  return validateScenario(mapId, cpuRate);
}

async function createBenchmarkServer(options) {
  const { createServer } = await import('vite');
  return createServer(options);
}

async function launchBenchmarkBrowser(options) {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch(options);
}

async function closeBenchmarkResources(session, browser, server, failed) {
  let cleanupError;
  // Each owner is attempted even if an earlier close rejects. Preserve the
  // primary launch/probe error when cleanup also fails.
  for (const close of [() => session?.detach(), () => browser?.close(), () => server?.close()]) {
    try { await close(); } catch (error) { cleanupError ??= error; }
  }
  if (!failed && cleanupError) throw cleanupError;
}

export async function runTerrainStreamBenchmark({ mapId = 'verdant', cpuRate = 1 } = {}, {
  createServerImpl = createBenchmarkServer,
  launchBrowserImpl = launchBenchmarkBrowser,
} = {}) {
  validateScenario(mapId, cpuRate);
  let server;
  let browser;
  let session;
  let failed = false;
  try {
    server = await createServerImpl({
      root: process.cwd(),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 5910, strictPort: false, hmr: false, watch: null },
    });
    await server.listen();
    const address = server.httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 5910;
    browser = await launchBrowserImpl({
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    session = await page.createCDPSession();
    await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await page.goto(`http://127.0.0.1:${port}/tools/terrain-stream-benchmark.html?map=${mapId}`, {
      waitUntil: 'domcontentloaded', timeout: 120000,
    });
    await page.waitForFunction('window.__TERRAIN_STREAM_BENCH', { timeout: 120000 });
    const report = await page.evaluate(() => window.__TERRAIN_STREAM_BENCH);
    if (report?.scenario?.mapId !== mapId) throw new Error('terrain benchmark: returned map does not match requested scenario');
    return { ...report, scenario: { ...report.scenario, cpuThrottlingRate: cpuRate, cpuThrottlingApplied: true } };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeBenchmarkResources(session, browser, server, failed);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTerrainStreamBenchmark(parseTerrainBenchmarkArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}
