// Numeric: barrel direction in player-local space for each gun rotation, in the aim pose.
// Plus a facing-convention screenshot at faceYaw=0 from a camera at +z.
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

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(800);

// freeze in aim pose, faceYaw = 0
await page.evaluate(() => {
  const p = window.DB2.player;
  p.posing = true;
  p.faceYaw = 0;
  p.setUpper(null);
  p.setUpperActive(false);
  p.setBase('2H_Ranged_Aiming', 0.05);
});
await page.waitForTimeout(900);
await page.evaluate(() => window.DB2.setState('pause'));

// facing check: camera at +z of player looking toward -z
await page.evaluate(() => {
  const p = window.DB2.player;
  const c = window.DB2.engine.camera;
  c.position.set(p.pos.x, p.pos.y + 1.2, p.pos.z + 3.2);
  c.lookAt(p.pos.x, p.pos.y + 0.9, p.pos.z);
});
await page.waitForTimeout(250);
await snap('50-faceyaw0-from-plusZ');

// numeric barrel directions
const report = await page.evaluate(() => {
  const p = window.DB2.player;
  const gun = p.muzzle.parent;
  const THREEV = p.pos.constructor; // Vector3
  const results = {};
  const variants = {
    'r000': [0, 0, 0],
    'rx+90': [Math.PI / 2, 0, 0],
    'rx-90': [-Math.PI / 2, 0, 0],
    'ry+90': [0, Math.PI / 2, 0],
    'ry-90': [0, -Math.PI / 2, 0],
    'rz+90': [0, 0, Math.PI / 2],
  };
  for (const [key, [rx, ry, rz]] of Object.entries(variants)) {
    gun.rotation.set(rx, ry, rz);
    gun.updateWorldMatrix(true, true);
    const m = p.muzzle.getWorldPosition(new THREEV());
    const g = gun.getWorldPosition(new THREEV());
    const d = m.sub(g).normalize();
    // player-local (faceYaw=0, so world == local here)
    results[key] = { x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2) };
  }
  gun.rotation.set(0, 0, 0);
  return results;
});
console.log('barrel directions (player local, faceYaw=0):', JSON.stringify(report, null, 1));

await browser.close();
