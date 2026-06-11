// Diagnose: true full-body aiming pose, gun orientation, and animation mask weights.
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
await page.waitForTimeout(600);

// 1) full-body aiming clip, no masking
await page.evaluate(() => {
  const p = window.DB2.player;
  p.setUpper(null);
  p.setUpperActive(false);
  p.setBase('2H_Ranged_Aiming', 0.1);
});
await page.waitForTimeout(700);

// side view (orbit ~90deg)
await page.evaluate(() => window.DB2.cameraRig.applyMouse(715, 30));
await page.waitForTimeout(400);
await snap('20-aim-full-side');

// front view (+90 more)
await page.evaluate(() => window.DB2.cameraRig.applyMouse(715, 0));
await page.waitForTimeout(400);
await snap('21-aim-full-front');

// 2) check which track names exist in the aiming clip + masked variants
const info = await page.evaluate(() => {
  const p = window.DB2.player;
  const clip = p.clips['2H_Ranged_Aiming'];
  const names = clip.tracks.map((t) => t.name);
  const upper = p.getAction('2H_Ranged_Aiming', 'upper').getClip().tracks.length;
  const lower = p.getAction('Idle', 'lower').getClip().tracks.length;
  const total = clip.tracks.length;
  const weights = Object.entries(p.actions)
    .filter(([, a]) => a.isRunning())
    .map(([k, a]) => `${k}=${a.getEffectiveWeight().toFixed(2)}`);
  return { sampleTracks: names.slice(0, 12), total, upperTrackCount: upper, idleLowerTrackCount: lower, running: weights };
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
