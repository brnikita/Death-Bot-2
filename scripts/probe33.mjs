// 5 levels: market district visuals + full campaign progression (teleport + auto-kill).
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
await page.evaluate(() => window.DB2.cine.finish());
await page.waitForFunction(() => window.DB2.getState() === 'play', null, { timeout: 15000 });

// вид на рынок
await page.evaluate(() => window.DB2.setState('pause'));
await page.evaluate(() => {
  const c = window.DB2.engine.camera;
  window.DB2.level.updateZones({ x: 58, z: -48 });
  c.position.set(46, 7, -34);
  c.lookAt(58, 1, -48);
});
await page.waitForTimeout(400);
await snap('m0-market');
await page.evaluate(() => window.DB2.setState('play'));

// прогон кампании: телепорт в район -> ждём волну -> убиваем всех
const objectives = [];
for (let lvl = 0; lvl < 4; lvl++) {
  const district = await page.evaluate(() => {
    const obj = document.getElementById('objective').textContent;
    return obj;
  });
  objectives.push(district);
  // телепорт к текущей цели
  await page.evaluate(() => {
    const names = ['plaza', 'industrial', 'residential', 'market', 'hive'];
    const obj = document.getElementById('objective').textContent;
    const d = Object.values(window.DB2.level.districts).find((d) => obj.includes(d.name));
    const V = window.DB2.player.pos.constructor;
    window.DB2.player.setSpawn(new V(d.center.x, 1.5, d.center.z));
  });
  // ждём начала боя и зачищаем волны мгновенно, пока сектор не пройден
  await page.waitForFunction(
    () => window.DB2.enemies.aliveCount() > 0,
    null, { timeout: 120000 }
  );
  const cleared = await page.evaluate(async () => {
    const em = window.DB2.enemies;
    // подождать и убивать всех, пока директор не переключит уровень
    return new Promise((resolve) => {
      let safety = 0;
      const iv = setInterval(() => {
        em.spawnQueue.length = 0;
        em.enemies.forEach((e) => !e.dead && e.takeDamage(99999, e.pos));
        const obj = document.getElementById('objective').textContent;
        if (++safety > 600) { clearInterval(iv); resolve('TIMEOUT ' + obj); }
        if (/ЦЕЛЬ/.test(obj) && em.aliveCount() === 0 && window.DB2.getState() !== 'cine') {
          // травел-фаза следующего уровня?
          clearInterval(iv);
          resolve(obj);
        }
        if (window.DB2.getState() === 'cine') window.DB2.cine.finish();
      }, 300);
    });
  });
  console.log(`level ${lvl + 1} cleared ->`, cleared);
}

// финал: уровень 5 — босс
await page.evaluate(() => {
  const V = window.DB2.player.pos.constructor;
  window.DB2.player.setSpawn(new V(0, 1.5, -60));
});
await page.waitForFunction(() => window.DB2.boss.active, null, { timeout: 60000 });
console.log('boss spawned on level 5 OK');
console.log('objectives seen:', JSON.stringify(objectives));

await browser.close();
console.log('DONE');
