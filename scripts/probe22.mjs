// Compare bone world scales at rest vs while animation plays.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });

const dump = await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  const names = ['head', 'chest', 'spine', 'hips', 'upperarml', 'lowerarml', 'upperlegl', 'footl'];
  const get = () => {
    p.model.updateMatrixWorld(true);
    const out = {};
    p.model.traverse((o) => {
      if (o.isBone && names.includes(o.name)) {
        const s = o.getWorldScale(new V());
        const w = o.getWorldPosition(new V());
        out[o.name] = { scale: [+s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4)], y: +w.y.toFixed(3) };
      }
    });
    return out;
  };
  const atRestNow = get(); // mixer уже мог отыграть? (menu: fixedUpdate не зовётся)
  p.mixer.update(0.5);
  const afterAnim = get();
  // масштаб самого root/Rig
  let rig = null;
  p.model.traverse((o) => {
    if (!rig && o.name === 'Rig') rig = o;
  });
  const rigScale = rig ? rig.getWorldScale(new V()).x : null;
  return { atRestNow, afterAnim, rigScale, modelScale: p.model.scale.x };
});
console.log(JSON.stringify(dump, null, 1));

await browser.close();
console.log('DONE');
