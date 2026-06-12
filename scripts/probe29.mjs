import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  const w = p.muzzle.getWorldPosition(new V());
  return { parent: p.muzzle.parent?.name, world: w.toArray().map((v) => +v.toFixed(2)) };
});
console.log(JSON.stringify(r));
await browser.close();
console.log('DONE');
