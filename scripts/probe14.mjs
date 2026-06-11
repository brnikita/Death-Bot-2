// Close-ups of suspected X-shaped artifacts: grass tufts, tents, drones.
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

async function look(camX, camY, camZ, atX, atY, atZ, name) {
  await page.evaluate(
    ([cx, cy, cz, ax, ay, az]) => {
      const c = window.DB2.engine.camera;
      c.position.set(cx, cy, cz);
      c.lookAt(ax, ay, az);
    },
    [camX, camY, camZ, atX, atY, atZ]
  );
  await page.waitForTimeout(300);
  await snap(name);
}

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(800);
await page.evaluate(() => window.DB2.setState('pause')); // freeze, free camera

// tent at camp (-5, 62)
await look(-2, 2.5, 66, -5, 0.8, 62, 'c0-tent');
// grass: open field around (30, 44) — high angle like the player sees it
await look(28, 4, 48, 33, 0, 42, 'c1-grass');
// drone at hive (8, -52)
await look(10, 2, -49.5, 8, 0.2, -52, 'c2-drone');
// camp overview (what the player sees at spawn)
await look(0, 6, 72, 0, 1, 55, 'c3-camp-overview');

await browser.close();
console.log('DONE');
