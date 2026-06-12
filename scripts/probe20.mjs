// Dump the knight skeleton: bone names, hierarchy, world positions (T-pose-ish at idle).
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });

const info = await page.evaluate(() => {
  const root = window.DB2.player.root;
  root.updateMatrixWorld(true);
  const out = [];
  const v = { x: 0, y: 0, z: 0 };
  root.traverse((o) => {
    if (o.isBone) {
      const p = o.getWorldPosition(new o.position.constructor());
      out.push({
        name: o.name,
        parent: o.parent?.name,
        children: o.children.filter((c) => c.isBone).map((c) => c.name),
        world: [+(p.x - root.position.x).toFixed(3), +p.y.toFixed(3), +(p.z - root.position.z).toFixed(3)],
      });
    }
  });
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push({ name: o.name, visible: o.visible });
  });
  return { bones: out, meshes };
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
console.log('DONE');
