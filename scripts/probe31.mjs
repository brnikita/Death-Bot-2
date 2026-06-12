// Cinematics: intro plays after START, skip works, end cinematic on boss death.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await mkdir('shots', { recursive: true });

async function snap(name) {
  const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await writeFile(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', name);
}

await page.goto('http://127.0.0.1:5173/?debug&lowfx');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('play-btn').click());

// интро: состояние cine, полосы, субтитры
await page.waitForTimeout(1500);
const intro = await page.evaluate(() => ({
  state: window.DB2.getState(),
  cineActive: window.DB2.cine.active,
  cineOn: document.getElementById('cine').classList.contains('on'),
  sub: document.getElementById('cine-sub').textContent.slice(0, 40),
}));
console.log('intro:', JSON.stringify(intro));
await snap('c0-intro-shot1');
// в software-рендере время идёт ~14x медленнее — ужимаем кадры для теста
await page.evaluate(() => window.DB2.cine.shots.forEach((s) => (s.dur = 0.6)));

// второй кадр интро
await page.waitForFunction(() => window.DB2.cine.idx >= 1 || !window.DB2.cine.active, null, { timeout: 60000 });
await snap('c1-intro-shot2');
console.log('sub2:', await page.evaluate(() => document.getElementById('cine-sub').textContent.slice(0, 40)));

// пропуск пробелом
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await page.waitForTimeout(300);
const afterSkip = await page.evaluate(() => ({
  state: window.DB2.getState(),
  cineOn: document.getElementById('cine').classList.contains('on'),
  hudVisible: !document.getElementById('hud').classList.contains('hidden'),
}));
console.log('after skip:', JSON.stringify(afterSkip));

// финальная заставка: запускаем напрямую через onDeath-колбэк босса
await page.evaluate(() => {
  window.DB2.boss.pos.set(0, 0, -66);
  window.DB2.boss.onDeath();
});
await page.waitForTimeout(1200);
const end = await page.evaluate(() => ({
  state: window.DB2.getState(),
  sub: document.getElementById('cine-sub').textContent.slice(0, 40),
}));
console.log('end cine:', JSON.stringify(end));
await snap('c2-end-shot1');

// дождаться конца (или пропустить) → экран победы
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await page.waitForTimeout(400);
const final = await page.evaluate(() => ({
  state: window.DB2.getState(),
  screenShown: !document.getElementById('screen').classList.contains('hidden'),
  screenText: document.getElementById('screen').textContent.slice(0, 60).trim(),
}));
console.log('final:', JSON.stringify(final));

await browser.close();
console.log('DONE');
