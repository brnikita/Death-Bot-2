// Precise: raycast kill pipeline (enemy placed exactly on the crosshair line),
// zombie melee damage, death/dissolve, boss charge on a clear line.
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
await page.waitForTimeout(600);

// === 1. place zombie exactly on the camera ray ===
await page.evaluate(() => {
  const cam = window.DB2.engine.camera;
  const V = window.DB2.player.pos.constructor;
  const fwd = cam.getWorldDirection(new V());
  const pos = cam.getWorldPosition(new V()).addScaledVector(fwd, 8);
  pos.y = 0;
  window.DB2.enemies.spawnAt(pos);
});
await page.waitForTimeout(2500);
const hpBefore = await page.evaluate(() => window.DB2.enemies.enemies[0].hp);
await page.evaluate(() => (window.DB2.input.fireHeld = true));
await page.waitForTimeout(700);
await snap('80-shooting-direct');
const hpMid = await page.evaluate(() => window.DB2.enemies.enemies[0]?.hp);
await page.waitForTimeout(2500);
await page.evaluate(() => (window.DB2.input.fireHeld = false));
const killResult = await page.evaluate(() => ({
  kills: window.DB2.enemies.killCount,
  hpLeft: window.DB2.enemies.enemies[0]?.hp,
  state: window.DB2.enemies.enemies[0]?.state,
}));
console.log(`zombie hp: ${hpBefore} -> ${hpMid} ; final:`, JSON.stringify(killResult));
await snap('81-zombie-dead');
await page.waitForTimeout(4000);
const dissolved = await page.evaluate(() => window.DB2.enemies.enemies.length);
console.log('enemies after dissolve:', dissolved);

// === 2. melee damage ===
await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  window.DB2.enemies.spawnAt(new V(p.pos.x + 1.5, 0, p.pos.z - 1.5));
});
await page.waitForTimeout(11000);
const meleeHp = await page.evaluate(() => Math.round(window.DB2.player.hp));
console.log('player hp after melee window:', meleeHp);
await snap('82-melee');

// === 3. boss charge on clear line ===
await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = 100;
  window.DB2.enemies.enemies.forEach((e) => !e.dead && e.die());
  window.DB2.startBoss();
  p.pos.set(10, 1, -20);
  p.body.setNextKinematicTranslation({ x: 10, y: 1, z: -20 });
});
await page.waitForTimeout(7000); // awaken
await page.evaluate(() => {
  const b = window.DB2.boss;
  b.chargeCD = 0;
  b.summonCD = 999;
  b.volleyCD = 999;
});
const seen = new Set();
let chargeShot = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({
    st: window.DB2.boss.state,
    php: Math.round(window.DB2.player.hp),
    d: +window.DB2.boss.pos.distanceTo(window.DB2.player.pos).toFixed(1),
  }));
  seen.add(s.st);
  if (s.st === 'charge' && !chargeShot) {
    chargeShot = true;
    await snap('83-boss-charge');
  }
  if (seen.has('charge') && s.st !== 'charge' && s.st !== 'charge_tele') {
    console.log('after charge: player hp =', s.php, 'dist =', s.d);
    break;
  }
}
console.log('boss states seen:', [...seen].join(', '));
await snap('84-final');

await browser.close();
console.log('DONE');
