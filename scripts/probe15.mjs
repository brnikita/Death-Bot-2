// Player-eye verification of the camp + drone closeup.
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
await page.evaluate(() => window.DB2.setState('pause'));

// eye-level looks at both tents
await look(0, 1.7, 58, -5, 0.7, 62, 'd0-tent-left-eye');
await look(1, 1.7, 67, 5, 0.7, 63, 'd1-tent-right-eye');
// drone closeup
await look(9.5, 1.5, -50, 8, 0.2, -52, 'd2-drone-new');

await browser.close();
console.log('DONE');
