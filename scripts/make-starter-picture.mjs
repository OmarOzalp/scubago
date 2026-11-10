// The picture Home's card shows at a first launch, before its live scene has drawn itself (assets/images/starter-island.jpg; see
// src/components/home/home-start.ts, STARTER_PICTURE): the real scene, from a web export, as a new install first sees it (Home's island
// at the first level, no animals), photographed the way the card keeps its own pictures (the canvas at twice its size in points).
//
//   npx expo export -p web --output-dir <dist>
//   node scripts/make-starter-picture.mjs <dist> [chromium executable] [playwright-core module]
//
// The scene is the same in light and dark (only the page around it changes), so there is one picture. Run it again when the first
// level's island changes; keep it under about 120 KB (the JPEG quality below).
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const [dist, executable = '/opt/pw-browsers/chromium', module = '/opt/node-tools/node_modules/playwright-core/index.mjs'] = process.argv.slice(2);
if (!dist) { console.error('usage: node scripts/make-starter-picture.mjs <web export dir> [chromium] [playwright-core]'); process.exit(1); }
const { chromium } = await import(module);
const QUALITY = 82, OUT = new URL('../assets/images/starter-island.jpg', import.meta.url);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.css': 'text/css' };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { file = extname(file) ? file : join(dist, 'index.html'); }
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cross-origin-embedder-policy': 'credentialless', 'cross-origin-opener-policy': 'same-origin' }); res.end(readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(join(tmpdir(), 'starter-'));
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: executable, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
try {
  const page = browser.pages()[0] ?? await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => performance.getEntriesByName('scubago:scene-built').length > 0, null, { timeout: 120000 });
  // (its growing in and the first frames' settling over)
  await page.waitForTimeout(4000);
  const canvas = page.locator('canvas').first();
  writeFileSync(OUT, await canvas.screenshot({ type: 'jpeg', quality: QUALITY }));
  console.log(`${OUT.pathname}: ${Math.round(statSync(OUT).size / 1024)} KB`);
} finally {
  await browser.close(); server.close(); rmSync(profile, { recursive: true, force: true });
}
