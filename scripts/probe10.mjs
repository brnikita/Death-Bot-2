// Final checks: forced melee, corpse dissolve, audio buffers, boss HUD, full-FX beauty shot.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:5173/?debug';
await mkdir('shots', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function snap(name) {
  const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}

await page.goto(BASE + '&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });

// audio buffers loaded?
const audioCheck = await page.evaluate(() =>
  Object.entries(window.DB2.audio.buffers).map(([k, v]) => `${k}:${v ? 'ok' : 'MISSING'}`).join(' ')
);
console.log('audio:', audioCheck);

await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(600);

// forced melee: spawn zombie, skip awaken
await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  window.DB2.enemies.spawnAt(new V(p.pos.x + 1.6, 0, p.pos.z - 1.6));
  const e = window.DB2.enemies.enemies[0];
  e.state = 'chase';
});
let meleeOk = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  const hp = await page.evaluate(() => Math.round(window.DB2.player.hp));
  if (hp < 100) {
    console.log(`melee damage CONFIRMED: hp=${hp} after ${(i + 1) * 0.4}s`);
    meleeOk = true;
    break;
  }
}
if (!meleeOk) console.log('melee damage STILL BROKEN');
await snap('90-melee-attack');

// kill it, watch dissolve
await page.evaluate(() => window.DB2.enemies.enemies.forEach((e) => !e.dead && e.takeDamage(500, e.pos, null)));
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.DB2.enemies.enemies.length);
  if (n === 0) {
    console.log(`corpse dissolved after ${(i + 1) * 0.5}s`);
    break;
  }
  if (i === 39) console.log('corpse NOT dissolved, count:', n);
}

// boss HUD visibility
await page.evaluate(() => window.DB2.startBoss());
await page.waitForTimeout(1500);
const bossHud = await page.evaluate(() => ({
  visible: !document.getElementById('bossbar').classList.contains('hidden'),
  name: document.getElementById('bossname').textContent,
  objective: document.getElementById('objective').textContent,
}));
console.log('boss HUD:', JSON.stringify(bossHud));

// === full-FX beauty shot (no lowfx): may be slow, give it time ===
await page.goto(BASE);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(4000);
await page.evaluate(() => window.DB2.cameraRig.applyMouse(200, -30));
await page.waitForTimeout(3000);
await snap('91-beauty-fullfx');

await browser.close();
console.log('DONE');
