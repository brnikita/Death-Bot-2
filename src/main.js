import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Physics } from './core/Physics.js';
import { Input } from './core/Input.js';
import { Assets } from './core/AssetLoader.js';
import { Atmosphere } from './world/Atmosphere.js';
import { Level } from './world/Level.js';
import { VFX } from './fx/VFX.js';
import { AudioManager } from './audio/AudioManager.js';
import { HUD } from './ui/HUD.js';
import { Player } from './entities/Player.js';
import { ThirdPersonCamera } from './entities/ThirdPersonCamera.js';
import { EnemyManager } from './entities/Enemy.js';
import { Boss } from './entities/Boss.js';

const FIXED_DT = 1 / 60;
const WAVES = [4, 6, 9];
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const LOWFX = PARAMS.has('lowfx');

async function boot() {
  const canvas = document.getElementById('game');
  const playBtn = document.getElementById('play-btn');
  const hud = new HUD();

  const engine = new Engine(canvas, { lowfx: LOWFX, preserve: DEBUG });
  const assets = new Assets();
  const [physics] = await Promise.all([
    Physics.create(),
    assets.loadAll((f) => {
      playBtn.textContent = `ЗАГРУЗКА… ${Math.round(f * 100)}%`;
    }),
  ]);

  const input = new Input(canvas, DEBUG);
  const atmosphere = new Atmosphere(engine.scene, assets.hdri);
  const level = new Level(engine.scene, physics, assets);
  const vfx = new VFX(engine.scene);
  const audio = new AudioManager(engine.camera, engine.scene);
  await audio.loadAll();

  const cameraRig = new ThirdPersonCamera(engine.camera, physics);
  const player = new Player(assets.models.knight, engine.scene, physics, cameraRig, vfx, audio, hud);
  player.setSpawn(level.playerSpawn);
  cameraRig.playerModel = player.root;

  const enemies = new EnemyManager(assets.models.minion, engine.scene, physics, vfx, audio);
  const boss = new Boss(assets.models.warrior, engine.scene, physics, vfx, audio, hud, enemies);

  // game director state
  let state = 'menu'; // menu | play | pause | over
  let wave = 0;
  let waveT = 2.5;
  let bossStarted = false;
  let trickleT = 18;

  const enemyLookup = (handle) => {
    const e = enemies.byCollider(handle);
    if (e) return e;
    if (boss.collider && boss.collider.handle === handle) return boss;
    return null;
  };

  player.onDeath = () => {
    setTimeout(() => {
      state = 'over';
      document.exitPointerLock();
      hud.showEnd(false);
    }, 1900);
  };

  boss.onDeath = () => {
    state = 'over';
    document.exitPointerLock();
    hud.hideBoss();
    hud.showEnd(true);
  };

  function spawnWave(n) {
    const pts = [...level.spawnPoints].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const base = pts[i % pts.length];
      const p = base.clone();
      p.x += (Math.random() - 0.5) * 3;
      p.z += (Math.random() - 0.5) * 3;
      p.y = 0;
      enemies.spawnAt(p);
    }
  }

  function director(dt) {
    if (bossStarted) {
      trickleT -= dt;
      if (trickleT <= 0 && enemies.aliveCount() < 3 && !boss.dead) {
        trickleT = 20;
        spawnWave(2);
      }
      return;
    }
    if (wave < WAVES.length) {
      if (enemies.aliveCount() === 0) {
        waveT -= dt;
        if (waveT <= 0) {
          wave++;
          hud.banner(`ВОЛНА ${wave}`);
          hud.objective(`ВОЛНА ${wave} / ${WAVES.length} — УНИЧТОЖЬТЕ НЕЖИТЬ`);
          spawnWave(WAVES[wave - 1]);
          waveT = 3.5;
        }
      }
    } else if (enemies.aliveCount() === 0) {
      bossStarted = true;
      hud.banner('ИНЖЕНЕР ХААС');
      hud.objective('УНИЧТОЖЬТЕ ИНЖЕНЕРА — СПАСИТЕ ГОРОД');
      boss.spawn(level.bossSpawn);
      cameraRig.addTrauma(0.55);
    }
  }

  // ---------- start / pause ----------
  playBtn.disabled = false;
  playBtn.textContent = 'НАЧАТЬ МИССИЮ';
  playBtn.addEventListener('click', () => {
    audio.resume();
    audio.startLoops();
    hud.hideScreen();
    hud.show();
    hud.setHealth(1);
    hud.setAmmo(30, false);
    hud.objective('ЗАЧИСТИТЕ ПЛОЩАДЬ');
    state = 'play';
    input.lock();
  });

  input.onUnlock = () => {
    if (state === 'play') {
      state = 'pause';
      hud.showPause(() => {
        hud.hideScreen();
        state = 'play';
        input.lock();
      });
    }
  };

  // debug hooks for automated testing
  if (DEBUG) {
    window.DB2 = {
      engine,
      player,
      cameraRig,
      enemies,
      boss,
      level,
      input,
      audio,
      getState: () => state,
      setState: (s) => (state = s),
      startBoss: () => {
        wave = WAVES.length;
        enemies.enemies.forEach((e) => !e.dead && e.die());
      },
      ready: true,
    };
  }

  // ---------- main loop ----------
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (state === 'play') {
      const mouse = input.consumeMouse();
      cameraRig.applyMouse(mouse.x, mouse.y);

      acc += dt;
      while (acc >= FIXED_DT) {
        player.fixedUpdate(FIXED_DT, input, enemyLookup);
        enemies.update(FIXED_DT, player);
        boss.update(FIXED_DT, player);
        physics.step();
        director(FIXED_DT);
        acc -= FIXED_DT;
      }

      cameraRig.update(dt, player.pos, player.collider);
      level.update(dt);
      atmosphere.update(dt);
      vfx.update(dt);
      input.endFrame();
    } else if (state === 'menu' || state === 'pause' || state === 'over') {
      // slow idle orbit on menu
      if (state === 'menu') {
        const t = now * 0.00012;
        engine.camera.position.set(Math.sin(t) * 26, 9, Math.cos(t) * 26);
        engine.camera.lookAt(0, 2, -8);
      }
      level.update(dt);
      atmosphere.update(dt);
      vfx.update(dt);
    }

    engine.render(dt);
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error('[DeathBot2] boot failed:', e);
  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = 'ОШИБКА ЗАГРУЗКИ';
});
