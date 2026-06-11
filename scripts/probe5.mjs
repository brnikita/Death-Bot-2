// Macro close-ups of the gun in the aiming pose with different orientations.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'http://127.0.0.1:5173/?debug&lowfx';
await mkdir('shots', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function snap(name) {
  const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(800);

// freeze in aiming pose, then pause the loop so we can place the camera manually
await page.evaluate(() => {
  const p = window.DB2.player;
  p.posing = true;
  p.setUpper(null);
  p.setUpperActive(false);
  p.setBase('2H_Ranged_Aiming', 0.05);
});
await page.waitForTimeout(900);
await page.evaluate(() => window.DB2.setState('pause'));

async function gunShot(rx, ry, rz, scale, name) {
  await page.evaluate(
    ([rx, ry, rz, s]) => {
      const p = window.DB2.player;
      const gun = p.muzzle.parent;
      gun.rotation.set(rx, ry, rz);
      gun.scale.setScalar(s);
      // place camera: side-front of the character, chest height
      const c = window.DB2.engine.camera;
      const base = p.root.position;
      c.position.set(base.x + 1.6, base.y + 1.1, base.z - 1.6);
      c.lookAt(base.x, base.y + 0.9, base.z);
    },
    [rx, ry, rz, scale]
  );
  await page.waitForTimeout(250);
  await snap(name);
}

await gunShot(0, 0, 0, 1.8, '40-gun-r000');
await gunShot(Math.PI / 2, 0, 0, 1.8, '41-gun-rx90');
await gunShot(-Math.PI / 2, 0, 0, 1.8, '42-gun-rx-90');
await gunShot(0, Math.PI / 2, 0, 1.8, '43-gun-ry90');

await browser.close();
