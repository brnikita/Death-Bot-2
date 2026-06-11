// Close-up inspection: aiming pose / gun orientation, and the boss up close.
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

page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
const btnState = await page.evaluate(() => {
  const b = document.getElementById('play-btn');
  return { exists: !!b, disabled: b?.disabled, text: b?.textContent };
});
console.log('button:', JSON.stringify(btnState));
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(800);

// aiming pose, normal view
await page.evaluate(() => (window.DB2.input.aimHeld = true));
await page.waitForTimeout(700);
await snap('10-aim-back');

// front-side view of the aiming pose: orbit camera half-turn
await page.evaluate(() => window.DB2.cameraRig.applyMouse(1450, 60));
await page.waitForTimeout(500);
await snap('11-aim-front');

// firing pose close
await page.evaluate(() => {
  window.DB2.input.fireHeld = true;
});
await page.waitForTimeout(400);
await snap('12-fire-front');
await page.evaluate(() => {
  window.DB2.input.fireHeld = false;
  window.DB2.input.aimHeld = false;
});

// teleport player to the boss gate and trigger boss
await page.evaluate(() => {
  const p = window.DB2.player;
  p.pos.set(0, 1, -18);
  p.body.setNextKinematicTranslation({ x: 0, y: 1, z: -18 });
  window.DB2.startBoss();
  window.DB2.cameraRig.applyMouse(-1450, -60); // look back toward -z
});
await page.waitForTimeout(2200);
await snap('13-boss-close');
await page.waitForTimeout(3500);
await snap('14-boss-approach');

const info = await page.evaluate(() => {
  const slot = window.DB2.player.model.getObjectByName('handslot.r');
  const m = window.DB2.player.muzzle.getWorldPosition(new window.DB2.player.muzzle.position.constructor());
  return {
    muzzleWorld: { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) },
    playerPos: window.DB2.player.pos,
    bossPos: window.DB2.boss.pos,
    bossState: window.DB2.boss.state,
    upper: window.DB2.player.upperName,
    base: window.DB2.player.baseName,
  };
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
