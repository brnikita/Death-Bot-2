// True aiming pose via posing flag + grounded stability check + base anim sanity.
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

// grounded stability over 2s + which base anims got set
await page.waitForTimeout(2000);
const sanity = await page.evaluate(() => {
  const p = window.DB2.player;
  return {
    grounded: p.grounded,
    base: p.baseName,
    running: Object.entries(p.actions)
      .filter(([, a]) => a.isRunning() && a.getEffectiveWeight() > 0.01)
      .map(([k, a]) => `${k}=${a.getEffectiveWeight().toFixed(2)}`),
  };
});
console.log('after 2s idle:', JSON.stringify(sanity));

// full-body aiming pose with gameplay frozen
await page.evaluate(() => {
  const p = window.DB2.player;
  p.posing = true;
  p.setUpper(null);
  p.setUpperActive(false);
  p.setBase('2H_Ranged_Aiming', 0.1);
});
await page.waitForTimeout(800);
await page.evaluate(() => window.DB2.cameraRig.applyMouse(715, 30));
await page.waitForTimeout(300);
await snap('22-aimpose-side');
await page.evaluate(() => window.DB2.cameraRig.applyMouse(715, 0));
await page.waitForTimeout(300);
await snap('23-aimpose-front');

// shooting pose
await page.evaluate(() => window.DB2.player.setBase('2H_Ranged_Shooting', 0.1));
await page.waitForTimeout(600);
await snap('24-shootpose-front');

await browser.close();
