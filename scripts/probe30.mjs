// Healing system: repair kit on Q, pickup collection into reserve.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForFunction(() => window.DB2.player.grounded, null, { timeout: 30000 });

// ранить и активировать ремонт
const start = await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = 30;
  p.hud.setHealth(0.3);
  p.sinceDamage = 0; // чтобы пассивная регенерация не мешала замеру
  window.DB2.input.pressed.add('KeyQ');
  return { hp: p.hp, kits: p.kits, kitsHud: document.getElementById('kits').textContent };
});
console.log('before:', JSON.stringify(start));

await page.waitForFunction(() => window.DB2.player.repairT > 0, null, { timeout: 10000 });
console.log('repair started, kits:', await page.evaluate(() => window.DB2.player.kits));
await page.waitForFunction(() => window.DB2.player.repairT <= 0, null, { timeout: 30000 });
const after = await page.evaluate(() => ({
  hp: Math.round(window.DB2.player.hp),
  kits: window.DB2.player.kits,
  kitsHud: document.getElementById('kits').textContent,
}));
console.log('after repair:', JSON.stringify(after));

// подбор ремкомплекта в запас
await page.evaluate(() => {
  const p = window.DB2.player;
  window.DB2.enemies.spawnPickup(p.pos.clone());
});
await page.waitForFunction(() => window.DB2.player.kits === 1, null, { timeout: 15000 });
console.log('pickup collected into reserve:', await page.evaluate(() => document.getElementById('kits').textContent));

// Q при полном HP не тратит комплект
const noWaste = await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = p.maxHp;
  window.DB2.input.pressed.add('KeyQ');
  return true;
});
await page.waitForTimeout(1200);
console.log('kits after Q at full hp (must stay 1):', await page.evaluate(() => window.DB2.player.kits));

await browser.close();
console.log('DONE');
