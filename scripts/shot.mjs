// Automated visual test: drives the game in headless Chromium (software rendering)
// and saves canvas captures to shots/. Uses ?debug&lowfx and canvas.toDataURL —
// no GPU, no Playwright screenshot stability waits.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'http://127.0.0.1:5173/?debug&lowfx';
await mkdir('shots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

async function snap(name) {
  const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
console.log('game booted');
await page.waitForTimeout(1500);
await snap('01-menu');

await page.click('#play-btn');
await page.waitForTimeout(1200);
await snap('02-spawn');

await page.evaluate(() => window.DB2.cameraRig.applyMouse(420, -40));
await page.waitForTimeout(400);
await snap('03-look');

await page.keyboard.down('w');
await page.waitForTimeout(1400);
await snap('04-run');

await page.evaluate(() => (window.DB2.input.fireHeld = true));
await page.waitForTimeout(450);
await snap('05-fire');
await page.evaluate(() => (window.DB2.input.fireHeld = false));
await page.keyboard.up('w');

await page.waitForTimeout(3500);
await page.evaluate(() => window.DB2.cameraRig.applyMouse(-300, 20));
await page.waitForTimeout(300);
await snap('06-enemies');

await page.evaluate(() => (window.DB2.input.aimHeld = true));
await page.waitForTimeout(500);
await snap('07-aim');
await page.evaluate(() => (window.DB2.input.aimHeld = false));

await page.evaluate(() => window.DB2.startBoss());
await page.waitForTimeout(2500);
await snap('08-boss');
await page.waitForTimeout(4000);
await snap('09-boss-walk');

const stats = await page.evaluate(() => ({
  state: window.DB2.getState(),
  playerPos: window.DB2.player.pos,
  hp: window.DB2.player.hp,
  enemies: window.DB2.enemies.enemies.length,
  bossActive: window.DB2.boss.active,
  bossHp: window.DB2.boss.hp,
}));
console.log('stats:', JSON.stringify(stats));

await browser.close();
console.log('done');
