// Giant player: visual check + movement + enemy combat sanity.
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

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });
await page.waitForTimeout(500);
await snap('g0-third-person');

// враг рядом — сравнение масштаба; бьём по гиганту
await page.evaluate(() => {
  const em = window.DB2.enemies;
  const V = window.DB2.player.pos.constructor;
  em.spawnNow(new V(window.DB2.player.pos.x + 5, 0, window.DB2.player.pos.z - 4), 'shambler');
});
await page.waitForTimeout(4500);
const combat = await page.evaluate(() => ({
  hp: Math.round(window.DB2.player.hp),
  enemyState: window.DB2.enemies.enemies[0]?.state,
  dist: +window.DB2.enemies.enemies[0]?.pos.distanceTo(window.DB2.player.pos).toFixed(1),
}));
console.log('combat:', JSON.stringify(combat));
await snap('g1-vs-zombie');

// бег вперёд + выстрелы
await page.evaluate(() => {
  window.DB2.input.keys.add('KeyW');
  window.DB2.input.fireHeld = true;
});
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.DB2.input.keys.delete('KeyW');
  window.DB2.input.fireHeld = false;
});
const after = await page.evaluate(() => ({
  pos: window.DB2.player.pos.toArray().map((v) => +v.toFixed(1)),
  ammo: window.DB2.player.ammo,
  grounded: window.DB2.player.grounded,
}));
console.log('after run+fire:', JSON.stringify(after));
await snap('g2-run-fire');

await browser.close();
console.log('DONE');
