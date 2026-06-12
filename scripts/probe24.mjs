// Functional check: spawn queue, shooting, zone crossings, shader program count stability.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await mkdir('shots', { recursive: true });

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });

const programs = () => page.evaluate(() => window.DB2.engine.renderer.info.programs.length);
const p0 = await programs();
console.log('programs after warmup+land:', p0);

// очередь спавна
await page.evaluate(() => {
  const em = window.DB2.enemies;
  const V = window.DB2.player.pos.constructor;
  em.spawnAt(new V(6, 0, 52), 'shambler');
  em.spawnAt(new V(-6, 0, 52), 'runner');
  em.spawnAt(new V(8, 0, 50), 'spitter');
});
const q = await page.evaluate(() => ({
  queued: window.DB2.enemies.spawnQueue.length,
  alive: window.DB2.enemies.aliveCount(),
}));
console.log('queue right after spawnAt:', JSON.stringify(q));
await page.waitForFunction(() => window.DB2.enemies.enemies.length >= 3, null, { timeout: 30000 });
console.log('all 3 spawned over time OK');

// стрельба
await page.evaluate(() => {
  window.DB2.input.fireHeld = true;
});
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.DB2.input.fireHeld = false;
});
const p1 = await programs();
console.log('programs after shooting:', p1, p1 === p0 ? 'STABLE' : 'GREW!');

// телепорт по районам (зоны включаются/выключаются)
for (const [x, z, name] of [[60, 8, 'industrial'], [-60, 10, 'residential'], [0, -66, 'hive'], [0, 58, 'camp']]) {
  await page.evaluate(
    ([x, z]) => {
      const V = window.DB2.player.pos.constructor;
      window.DB2.player.setSpawn(new V(x, 1.5, z));
    },
    [x, z]
  );
  await page.waitForTimeout(1800);
  const pn = await programs();
  console.log(`programs after ${name}:`, pn, pn === p1 ? 'STABLE' : 'CHANGED');
}

// финальный скриншот от третьего лица
const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
await writeFile('shots/d5-gameplay.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('saved d5-gameplay');

const errs = await page.evaluate(() => window.DB2.getState());
console.log('state:', errs);
await browser.close();
console.log('DONE');
