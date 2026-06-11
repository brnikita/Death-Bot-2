// Deterministic spitter cast test (skip awaken).
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(600);

await page.evaluate(() => {
  const pl = window.DB2.player;
  const V = pl.pos.constructor;
  window.DB2.enemies.spawnAt(new V(pl.pos.x + 2, 0, pl.pos.z - 8), 'spitter');
  window.DB2.enemies.enemies[0].state = 'chase';
});

let ok = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({
    st: window.DB2.enemies.enemies[0]?.state,
    proj: window.DB2.enemies.projectiles.length,
    hp: Math.round(window.DB2.player.hp),
  }));
  if (s.proj > 0 || s.hp < 100) {
    console.log('SPITTER OK:', JSON.stringify(s));
    ok = true;
    break;
  }
  if (i % 10 === 0) console.log('...', JSON.stringify(s));
}
if (!ok) console.log('SPITTER BROKEN');
await browser.close();
