// Diff full cacheKeys of duplicate 'skeleton' programs.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });

const before = await page.evaluate(() =>
  window.DB2.engine.renderer.info.programs.filter((p) => p.name === 'skeleton').map((p) => p.cacheKey)
);
await page.evaluate(() => {
  const em = window.DB2.enemies;
  const V = window.DB2.player.pos.constructor;
  em.spawnAt(new V(4, 0, 53), 'shambler');
});
await page.waitForTimeout(2500);
const after = await page.evaluate(() =>
  window.DB2.engine.renderer.info.programs.filter((p) => p.name === 'skeleton').map((p) => p.cacheKey)
);

console.log('skeleton programs before:', before.length, 'after:', after.length);
const fresh = after.filter((k) => !before.includes(k));
if (fresh.length && before.length) {
  const a = before[0];
  const b = fresh[0];
  // показать различающиеся сегменты (ключ — строка с разделителями)
  const sa = a.split(',');
  const sb = b.split(',');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] !== sb[i]) console.log(`segment ${i}: warmup='${sa[i]}' vs new='${sb[i]}'`);
  }
}

await browser.close();
console.log('DONE');
