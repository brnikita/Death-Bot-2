// Which shader programs appear during first combat?
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });

const list = () =>
  page.evaluate(() =>
    window.DB2.engine.renderer.info.programs.map((p) => `${p.name}#${p.cacheKey.length}:${p.cacheKey.slice(0, 40)}`)
  );
const before = await list();

await page.evaluate(() => {
  const em = window.DB2.enemies;
  const V = window.DB2.player.pos.constructor;
  em.spawnAt(new V(4, 0, 53), 'shambler');
  em.spawnAt(new V(-4, 0, 53), 'runner');
  em.spawnAt(new V(6, 0, 51), 'spitter');
  window.DB2.input.fireHeld = true;
});
await page.waitForTimeout(3500);
await page.evaluate(() => (window.DB2.input.fireHeld = false));

const after = await list();
const newOnes = after.filter((k) => !before.includes(k));
console.log('before:', before.length, 'after:', after.length);
for (const n of newOnes) console.log('NEW:', n);

await browser.close();
console.log('DONE');
