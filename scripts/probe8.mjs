// Deterministic combat: spawn zombies next to the player, verify kills, melee damage,
// pickups, and boss specials (summon / volley / charge / whirl).
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

const aimAtNearest = () =>
  page.evaluate(() => {
    const p = window.DB2.player;
    const targets = window.DB2.enemies.enemies.filter((e) => !e.dead);
    const boss = window.DB2.boss;
    let t = null;
    let best = 1e9;
    for (const e of targets) {
      const d = e.pos.distanceTo(p.pos);
      if (d < best) {
        best = d;
        t = e.pos;
      }
    }
    if (!t && boss.active && !boss.dead) t = boss.pos;
    if (!t) return false;
    const rig = window.DB2.cameraRig;
    const dx = t.x - p.pos.x;
    const dz = t.z - p.pos.z;
    rig.yaw = Math.atan2(-dx, -dz);
    rig.pitch = 0.0;
    return true;
  });

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(600);

// === 1. zombies right in front ===
await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  window.DB2.enemies.spawnAt(new V(p.pos.x, 0, p.pos.z - 5));
  window.DB2.enemies.spawnAt(new V(p.pos.x + 2.5, 0, p.pos.z - 6));
});
await page.waitForTimeout(2500); // awaken anim
await aimAtNearest();
await snap('70-zombies-awaken');

await page.evaluate(() => (window.DB2.input.fireHeld = true));
for (let i = 0; i < 16; i++) {
  await aimAtNearest();
  await page.waitForTimeout(280);
  if (i === 2) await snap('71-shooting-zombie');
  if (i === 8) await snap('72-zombie-dying');
}
await page.evaluate(() => (window.DB2.input.fireHeld = false));
const fight = await page.evaluate(() => ({
  kills: window.DB2.enemies.killCount,
  alive: window.DB2.enemies.aliveCount(),
  pickups: window.DB2.enemies.pickups.length,
}));
console.log('close combat:', JSON.stringify(fight));

// === 2. melee: spawn one adjacent, stand still ===
await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  window.DB2.enemies.spawnAt(new V(p.pos.x + 1.2, 0, p.pos.z - 1.5));
});
await page.waitForTimeout(9000);
const melee = await page.evaluate(() => Math.round(window.DB2.player.hp));
console.log('player hp after zombie melee:', melee);
await snap('73-zombie-attacks');

// === 3. boss specials ===
await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = 100;
  window.DB2.enemies.enemies.forEach((e) => !e.dead && e.die());
  p.pos.set(0, 1, -10);
  p.body.setNextKinematicTranslation({ x: 0, y: 1, z: -10 });
  window.DB2.startBoss();
});
await page.waitForTimeout(6000); // awaken (slow under swiftshader)

// phase 2 behaviours: summon + volley (stay far)
await page.evaluate(() => {
  const b = window.DB2.boss;
  b.hp = 850; // phase 2
  b.summonCD = 0;
  b.volleyCD = 0;
});
const seen = new Set();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({
    st: window.DB2.boss.state,
    proj: window.DB2.boss.projectiles.length,
    minions: window.DB2.enemies.aliveCount(),
    php: Math.round(window.DB2.player.hp),
  }));
  seen.add(s.st);
  if (s.st === 'volley' || s.proj > 0) {
    await snap('74-boss-volley');
    break;
  }
}
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ st: window.DB2.boss.state, minions: window.DB2.enemies.aliveCount() }));
  seen.add(s.st);
  if (s.st === 'summon' || s.minions > 0) {
    await page.waitForTimeout(2000);
    await snap('75-boss-summon');
    break;
  }
}

// charge: move player far, reset CD
await page.evaluate(() => {
  const p = window.DB2.player;
  p.pos.set(0, 1, -8);
  p.body.setNextKinematicTranslation({ x: 0, y: 1, z: -8 });
  window.DB2.boss.chargeCD = 0;
  window.DB2.boss.summonCD = 99;
  window.DB2.boss.volleyCD = 99;
});
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(350);
  const s = await page.evaluate(() => ({ st: window.DB2.boss.state, php: Math.round(window.DB2.player.hp) }));
  seen.add(s.st);
  if (s.st === 'charge') {
    await page.waitForTimeout(400);
    await snap('76-boss-charge');
  }
  if (s.st === 'walk' && seen.has('charge')) break;
}

// whirl: phase 3, player close
await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = 100;
  const b = window.DB2.boss;
  b.hp = 300;
  b.whirlCD = 0;
  p.pos.set(b.pos.x + 4, 1, b.pos.z + 2);
  p.body.setNextKinematicTranslation({ x: b.pos.x + 4, y: 1, z: b.pos.z + 2 });
});
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(350);
  const s = await page.evaluate(() => ({ st: window.DB2.boss.state, php: Math.round(window.DB2.player.hp) }));
  seen.add(s.st);
  if (s.st === 'whirl') {
    await page.waitForTimeout(500);
    await snap('77-boss-whirl');
    break;
  }
}

const final = await page.evaluate(() => ({
  php: Math.round(window.DB2.player.hp),
  minions: window.DB2.enemies.aliveCount(),
}));
console.log('states seen:', [...seen].join(', '));
console.log('final:', JSON.stringify(final));

await browser.close();
console.log('DONE');
