// Full regression for world v2: districts, mission flow, enemy types, voices, minimap.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'http://127.0.0.1:5173/?debug&lowfx';
await mkdir('shots', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

async function snap(name, id = 'game') {
  const data = await page.evaluate((cid) => document.getElementById(cid).toDataURL('image/png'), id);
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}

const tp = (x, z) =>
  page.evaluate(
    ([x, z]) => {
      const p = window.DB2.player;
      p.pos.set(x, 1, z);
      p.body.setNextKinematicTranslation({ x, y: 1, z });
    },
    [x, z]
  );

await page.goto(URL);
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 120000 });

// voices loaded?
const voiceCheck = await page.evaluate(() =>
  Object.entries(window.DB2.audio.buffers)
    .filter(([k]) => k.startsWith('voice_'))
    .map(([k, v]) => `${k}:${v ? 'ok' : 'MISS'}`)
    .join(' ')
);
console.log('voices:', voiceCheck);

await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(1000);
await snap('b0-camp-start');

// run north along the road
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
await snap('b1-road');

// plaza combat trigger
await tp(0, 5);
let combat = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({
    alive: window.DB2.enemies.aliveCount(),
    obj: document.getElementById('objective').textContent,
  }));
  if (s.alive > 0) {
    combat = true;
    console.log('plaza combat started:', JSON.stringify(s));
    break;
  }
}
if (!combat) console.log('PLAZA COMBAT DID NOT START');
await page.waitForTimeout(3000);
await page.evaluate(() => window.DB2.cameraRig.applyMouse(500, 0));
await snap('b2-plaza-wave');
await snap('b3-minimap', 'minimap');

// enemy types sanity: spawn one of each near player and list
await page.evaluate(() => {
  const p = window.DB2.player;
  const V = p.pos.constructor;
  window.DB2.enemies.spawnAt(new V(p.pos.x + 5, 0, p.pos.z - 5), 'runner');
  window.DB2.enemies.spawnAt(new V(p.pos.x - 5, 0, p.pos.z - 6), 'spitter');
});
await page.waitForTimeout(3500);
const types = await page.evaluate(() =>
  window.DB2.enemies.enemies.map((e) => `${e.typeKey}:${e.state}`).join(' ')
);
console.log('enemies:', types);
await snap('b4-enemy-types');

// spitter should cast: wait and check projectiles
let spitOk = false;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.DB2.enemies.projectiles.length);
  if (n > 0) {
    spitOk = true;
    await snap('b5-spitter-projectile');
    break;
  }
}
console.log('spitter projectile:', spitOk ? 'OK' : 'NOT SEEN');

// industrial district
await page.evaluate(() => window.DB2.enemies.enemies.forEach((e) => !e.dead && e.die()));
await tp(48, 4);
await page.evaluate(() => {
  window.DB2.cameraRig.yaw = -1.4; // look east
});
await page.waitForTimeout(600);
await snap('b6-industrial');

// residential
await tp(-46, 8);
await page.evaluate(() => {
  window.DB2.cameraRig.yaw = 1.5; // look west
});
await page.waitForTimeout(600);
await snap('b7-residential');

// hive + boss
await page.evaluate(() => window.DB2.enemies.enemies.forEach((e) => !e.dead && e.die()));
await tp(0, -50);
await page.evaluate(() => {
  window.DB2.cameraRig.yaw = 0;
  window.DB2.startBoss();
});
await page.waitForTimeout(2500);
await snap('b8-hive-boss');

const final = await page.evaluate(() => ({
  state: window.DB2.getState(),
  bossActive: window.DB2.boss.active,
  zonesVisible: window.DB2.level.zones.map((z) => z.group.visible).join(','),
  tier: window.DB2.engine.qualityTier,
}));
console.log('final:', JSON.stringify(final));

await browser.close();
console.log('DONE');
