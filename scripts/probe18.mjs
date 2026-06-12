// Round 4: detect page reloads + sample loop vars over time.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('load', () => console.log('[PAGE LOAD EVENT]', new Date().toISOString()));

await page.goto('http://127.0.0.1:5173/?debug');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });
await page.evaluate(() => {
  window.__marker = 'alive';
  document.getElementById('play-btn').click();
});

for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({
    marker: window.__marker || 'GONE-RELOADED',
    ready: !!window.DB2?.ready,
    vars: window.DB2?.loopVars?.(),
    ticks: window.__fpsTick || 0,
    text: document.getElementById('fps')?.textContent,
    state: window.DB2?.getState?.(),
  }));
  console.log(i, JSON.stringify(r));
}

await browser.close();
console.log('DONE');
