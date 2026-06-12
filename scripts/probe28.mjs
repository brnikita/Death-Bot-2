// Why does the camera collapse into the giant? Track curDist over time.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });

for (let i = 0; i < 6; i++) {
  const s = await page.evaluate(() => {
    const rig = window.DB2.cameraRig;
    const cam = window.DB2.engine.camera;
    return {
      curDist: +rig.curDist.toFixed(2),
      dist: +rig.dist.toFixed(2),
      pitch: +rig.pitch.toFixed(2),
      cam: cam.position.toArray().map((v) => +v.toFixed(1)),
      visible: rig.playerModel?.visible,
    };
  });
  console.log(i, JSON.stringify(s));
  if (i === 1) {
    await page.evaluate(() => {
      const em = window.DB2.enemies;
      const V = window.DB2.player.pos.constructor;
      em.spawnNow(new V(window.DB2.player.pos.x + 5, 0, window.DB2.player.pos.z - 4), 'shambler');
    });
    console.log('-- zombie spawned --');
  }
  await page.waitForTimeout(1500);
}

await browser.close();
console.log('DONE');
