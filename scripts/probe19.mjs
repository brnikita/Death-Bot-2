// Production build smoke test against vite preview (port 4173).
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const fails = [];
page.on('requestfailed', (r) => fails.push(r.url()));
page.on('response', (r) => r.status() >= 400 && fails.push(`${r.status()} ${r.url()}`));
await mkdir('shots', { recursive: true });

await page.goto('http://127.0.0.1:4173/?debug');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });
console.log('boot OK, quality:', await page.evaluate(() => window.DB2.engine.quality));

await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(3000);
const s = await page.evaluate(() => ({
  state: window.DB2.getState(),
  playerY: +window.DB2.player.pos.y.toFixed(2),
}));
console.log('playing:', JSON.stringify(s));
console.log('failed requests:', fails.length ? fails : 'none');

const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
await writeFile('shots/q1-prod-build.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('saved q1-prod-build');

await browser.close();
console.log('DONE');
