// Droid model inspection v2: wait for landing, camera relative to player.
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
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById('play-btn').click());
// дождаться приземления
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.DB2.setState('pause'));
console.log('player y:', await page.evaluate(() => +window.DB2.player.pos.y.toFixed(2)));

await look(0, 0.95, -2.7, 0.85, 'd0-front'); // робот смотрит в -Z
await look(-2.7, 0.95, 0, 0.85, 'd1-side');
await look(0, 0.95, 2.7, 0.85, 'd2-back');
await look(0, 2.2, -1.0, 2.05, 'd3-face');
await look(-1.6, 1.3, -1.6, 0.85, 'd4-three-quarter');

await browser.close();
console.log('DONE');
