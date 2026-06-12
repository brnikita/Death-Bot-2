// Blue troll boss: face closeup + full body.
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
  await page.waitForTimeout(350);
  await snap(name);
}

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.evaluate(() => window.DB2.cine.finish()); // пропустить интро
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.DB2.startBoss();
});
// дать боссу проснуться и встать
await page.waitForTimeout(5000);
await page.evaluate(() => window.DB2.setState('pause'));

const b = await page.evaluate(() => {
  const p = window.DB2.boss.pos;
  return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), state: window.DB2.boss.state };
});
console.log('boss:', JSON.stringify(b));

// лицо (босс смотрит в +Z после спавна — faceYaw 0)
await look(b.x, b.y + 3.4, b.z + 3.2, b.x, b.y + 2.9, b.z, 't0-troll-face');
// в полный рост
await look(b.x + 5.5, b.y + 3, b.z + 7, b.x, b.y + 2, b.z, 't1-troll-body');

await browser.close();
console.log('DONE');
