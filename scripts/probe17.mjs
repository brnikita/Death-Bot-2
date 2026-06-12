// Quality presets: auto-detect, manual switch, FPS counter, game still renders.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.text().includes('[DB2]') && console.log('[console]', m.text()));
await mkdir('shots', { recursive: true });

// NOTE: no ?lowfx — we want the real quality pipeline (SwiftShader must auto-detect LOW)
await page.goto('http://127.0.0.1:5173/?debug');
await page.waitForFunction(() => window.DB2?.ready, null, { timeout: 180000 });

const auto = await page.evaluate(() => ({
  quality: window.DB2.engine.quality,
  shadows: window.DB2.engine.renderer.shadowMap.enabled,
  ao: window.DB2.engine.n8ao ? window.DB2.engine.n8ao.enabled : null,
  ratio: window.DB2.engine.renderer.getPixelRatio(),
  activeBtn: document.querySelector('.q-btn.active')?.dataset.q,
}));
console.log('auto-detected:', JSON.stringify(auto));

// switch to medium via the menu button
await page.evaluate(() => document.querySelector('.q-btn[data-q="medium"]').click());
const med = await page.evaluate(() => ({
  quality: window.DB2.engine.quality,
  shadows: window.DB2.engine.renderer.shadowMap.enabled,
  shadowMapSize: window.DB2.atmosphere.sun.shadow.mapSize.x,
  ao: window.DB2.engine.n8ao ? window.DB2.engine.n8ao.enabled : null,
  ratio: window.DB2.engine.renderer.getPixelRatio(),
  saved: localStorage.getItem('db2.quality'),
}));
console.log('after medium click:', JSON.stringify(med));

// back to low and play
await page.evaluate(() => document.querySelector('.q-btn[data-q="low"]').click());
await page.evaluate(() => document.getElementById('play-btn').click());
await page.waitForTimeout(4000);

const playing = await page.evaluate(() => ({
  state: window.DB2.getState(),
  fpsText: document.getElementById('fps').textContent,
  quality: window.DB2.engine.quality,
}));
console.log('playing:', JSON.stringify(playing));

const data = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
await writeFile('shots/q0-low-playing.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('saved q0-low-playing');

await browser.close();
console.log('DONE');
