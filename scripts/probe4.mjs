// Control experiment: same camera, three poses — Idle / 2H_Ranged_Aiming / Cheer.
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

async function pose(clip, name) {
  const running = await page.evaluate((c) => {
    const p = window.DB2.player;
    p.setBase(c, 0.05);
    return p.baseKey;
  }, clip);
  await page.waitForTimeout(900);
  const w = await page.evaluate(() =>
    Object.entries(window.DB2.player.actions)
      .filter(([, a]) => a.isRunning() && a.getEffectiveWeight() > 0.05)
      .map(([k, a]) => `${k}=${a.getEffectiveWeight().toFixed(2)}`)
  );
  console.log(clip, '-> key:', running, 'running:', w.join(', '));
  await snap(name);
}

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(1000);

await page.evaluate(() => {
  const p = window.DB2.player;
  p.posing = true;
  p.setUpper(null);
  p.setUpperActive(false);
  window.DB2.input.aimHeld = true; // closer camera
  window.DB2.cameraRig.applyMouse(715, 40); // side view
});
await page.waitForTimeout(600);

await pose('Idle', '30-pose-idle');
await pose('2H_Ranged_Aiming', '31-pose-aim');
await pose('Cheer', '32-pose-cheer');

await browser.close();
