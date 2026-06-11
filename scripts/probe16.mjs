// Spawn enemies deliberately inside buildings/cars/trees and verify they get relocated to free spots.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(600);

const result = await page.evaluate(() => {
  const em = window.DB2.enemies;
  const V = window.DB2.player.pos.constructor;
  // заведомо плохие точки: внутри здания на площади, внутри машины, внутри дерева, в заводе
  const badSpots = [
    [-30, -26, 'building plaza'],
    [10, 22, 'car'],
    [-8, 14, 'tree'],
    [62, -2, 'factory'],
    [0, -12, 'R-111 wreck'],
  ];
  const out = [];
  for (const [x, z, label] of badSpots) {
    em.spawnAt(new V(x, 0, z), 'shambler');
    const e = em.enemies[em.enemies.length - 1];
    const moved = Math.hypot(e.pos.x - x, e.pos.z - z);
    out.push({
      label,
      requested: [x, z],
      got: [+e.pos.x.toFixed(1), +e.pos.z.toFixed(1)],
      relocatedBy: +moved.toFixed(1),
      free: em.isSpotFree(e.pos.x, e.pos.z),
    });
  }
  return out;
});
for (const r of result) {
  console.log(
    `${r.label}: requested (${r.requested}) -> spawned (${r.got}), moved ${r.relocatedBy}m, spotFree=${r.free}`
  );
}

// sanity: spawned enemies still chase the player (not stuck inside something)
await page.waitForTimeout(6000);
const chase = await page.evaluate(() => {
  const p = window.DB2.player.pos;
  return window.DB2.enemies.enemies.map((e) => ({
    state: e.state,
    dist: +e.pos.distanceTo(p).toFixed(1),
  }));
});
console.log('after 6s:', JSON.stringify(chase));

await browser.close();
console.log('DONE');
