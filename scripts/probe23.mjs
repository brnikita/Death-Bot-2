// Where do droid parts actually end up in world space?
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(600);
await page.evaluate(() => window.DB2.setState('pause'));

const out = await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  p.model.updateMatrixWorld(true);
  const rows = [];
  p.model.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.parent?.isBone) return;
    const w = o.getWorldPosition(new V());
    const s = o.getWorldScale(new V());
    rows.push({
      geo: o.geometry.type.replace('Geometry', ''),
      bone: o.parent.name,
      world: [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)],
      wscale: +s.x.toFixed(3),
    });
  });
  return { playerPos: [p.pos.x, +p.pos.y.toFixed(2), p.pos.z], rows: rows.slice(0, 14), total: rows.length };
});
console.log(JSON.stringify(out, null, 1));

await browser.close();
console.log('DONE');
