// Playable troll mode: switch hero, screenshots, shooting works.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await mkdir('shots', { recursive: true });

async function snap(name) {
  const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}
async function look(dx, dy, dz, atDy, name) {
  await page.evaluate(
    ([dx, dy, dz, atDy]) => {
      const p = window.DB2.player.pos;
      const c = window.DB2.engine.camera;
      c.position.set(p.x + dx, p.y + dy, p.z + dz);
      c.lookAt(p.x, p.y + atDy, p.z);
    },
    [dx, dy, dz, atDy]
  );
  await page.waitForTimeout(350);
  await snap(name);
}

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });

// переключение в меню
await page.evaluate(() => document.querySelector('.h-btn[data-h="troll"]').click());
const sel = await page.evaluate(() => ({
  hero: window.DB2.player.hero,
  saved: localStorage.getItem('db2.hero'),
  active: document.querySelector('.h-btn.active')?.dataset.h,
  droidVisible: window.DB2.player.droidParts[0].visible,
  trollVisible: window.DB2.player.trollParts[0].visible,
}));
console.log('selected:', JSON.stringify(sel));

await page.evaluate(() => document.getElementById('play-btn').click());
await page.evaluate(() => window.DB2.cine.finish());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.DB2.setState('pause'));

await look(0, 1.6, -2.8, 1.1, 'h0-troll-front');
await look(-2.2, 1.5, -2.2, 1.0, 'h1-troll-quarter');
await look(0, 2.2, -1.0, 2.05, 'h2-troll-face');

// стрельба за тролля
await page.evaluate(() => window.DB2.setState('play'));
await page.evaluate(() => (window.DB2.input.fireHeld = true));
await page.waitForTimeout(1200);
await page.evaluate(() => (window.DB2.input.fireHeld = false));
console.log('ammo after firing:', await page.evaluate(() => window.DB2.player.ammo));

// обратно в дроида
await page.evaluate(() => window.DB2.player.setHero('k250'));
console.log('back to droid, trollVisible:', await page.evaluate(() => window.DB2.player.trollParts[0].visible));

await browser.close();
console.log('DONE');
