// Full combat simulation: fight zombies, take damage, boss fight, win & lose screens.
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
    rig.pitch = -0.02;
    return true;
  });

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());

// --- wave 1: wait for spawn, move player near them ---
await page.waitForTimeout(3500);
const spawned = await page.evaluate(() => {
  const p = window.DB2.player;
  p.pos.set(-18, 1, -12);
  p.body.setNextKinematicTranslation({ x: -18, y: 1, z: -12 });
  return window.DB2.enemies.enemies.length;
});
console.log('wave1 enemies:', spawned);
await page.waitForTimeout(4000);

await aimAtNearest();
await page.waitForTimeout(300);
await snap('60-zombie-incoming');

// shoot nearest enemies for 4s, re-aiming every 300ms
await page.evaluate(() => (window.DB2.input.fireHeld = true));
for (let i = 0; i < 14; i++) {
  await aimAtNearest();
  await page.waitForTimeout(300);
  if (i === 4) await snap('61-combat-tracers');
}
await page.evaluate(() => (window.DB2.input.fireHeld = false));

const afterFight = await page.evaluate(() => ({
  kills: window.DB2.enemies.killCount,
  alive: window.DB2.enemies.aliveCount(),
  playerHp: Math.round(window.DB2.player.hp),
  ammo: window.DB2.player.ammo,
  ammoHud: document.getElementById('ammo-mag').textContent,
  healthW: document.getElementById('healthfill').style.width,
}));
console.log('after fight:', JSON.stringify(afterFight));
await snap('62-after-fight');

// --- let a zombie reach and hit us (stand still 10s) ---
await page.waitForTimeout(9000);
const hits = await page.evaluate(() => ({ hp: Math.round(window.DB2.player.hp), alive: window.DB2.enemies.aliveCount() }));
console.log('after standing still:', JSON.stringify(hits));
await snap('63-zombie-melee');

// --- boss fight ---
await page.evaluate(() => {
  const p = window.DB2.player;
  p.hp = 100;
  p.pos.set(0, 1, -16);
  p.body.setNextKinematicTranslation({ x: 0, y: 1, z: -16 });
  window.DB2.startBoss();
});
await page.waitForTimeout(1500);
await aimAtNearest();
await snap('64-boss-awaken');

// log boss state machine for ~24s while firing at it
await page.evaluate(() => (window.DB2.input.fireHeld = true));
const states = [];
for (let i = 0; i < 48; i++) {
  await aimAtNearest();
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => ({
    st: window.DB2.boss.state,
    hp: window.DB2.boss.hp,
    php: Math.round(window.DB2.player.hp),
    minions: window.DB2.enemies.aliveCount(),
  }));
  states.push(`${s.st}:${s.hp}:p${s.php}:m${s.minions}`);
  if (i === 10) await snap('65-boss-fight');
  if (i === 30) await snap('66-boss-phase2');
}
await page.evaluate(() => (window.DB2.input.fireHeld = false));
console.log('boss timeline:', states.filter((v, i) => i % 4 === 0).join(' | '));

// finish him -> win screen
await page.evaluate(() => {
  window.DB2.boss.hp = 20;
  window.DB2.input.fireHeld = true;
});
await page.waitForTimeout(2500);
await page.evaluate(() => (window.DB2.input.fireHeld = false));
await page.waitForTimeout(4000);
const winState = await page.evaluate(() => ({
  state: window.DB2.getState(),
  bossDead: window.DB2.boss.dead,
  screenVisible: !document.getElementById('screen').classList.contains('hidden'),
  screenText: document.querySelector('#screen h1')?.textContent,
}));
console.log('win check:', JSON.stringify(winState));

// --- lose screen (fresh page) ---
await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(500);
await page.evaluate(() => window.DB2.player.takeDamage(250, window.DB2.player.pos));
await page.waitForTimeout(2600);
const loseState = await page.evaluate(() => ({
  state: window.DB2.getState(),
  dead: window.DB2.player.dead,
  screenText: document.querySelector('#screen h1')?.textContent,
}));
console.log('lose check:', JSON.stringify(loseState));
await snap('67-death-pose');

// --- camera wall collision ---
await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(500);
const camTest = await page.evaluate(async () => {
  const p = window.DB2.player;
  // back against the south building wall, camera looking north -> camera must not clip into wall
  p.pos.set(8, 1, 29.5);
  p.body.setNextKinematicTranslation({ x: 8, y: 1, z: 29.5 });
  window.DB2.cameraRig.yaw = 0; // camera offset toward +z (into the building at z=31)
  await new Promise((r) => setTimeout(r, 700));
  return { curDist: +window.DB2.cameraRig.curDist.toFixed(2), normalDist: 4.7 };
});
console.log('camera collision:', JSON.stringify(camTest));
await snap('68-camera-wall');

await browser.close();
console.log('ALL DONE');
