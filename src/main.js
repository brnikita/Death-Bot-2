import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Physics } from './core/Physics.js';
import { Input } from './core/Input.js';
import { Assets } from './core/AssetLoader.js';
import { Atmosphere } from './world/Atmosphere.js';
import { Level } from './world/Level.js';
import { Wildlife } from './world/Wildlife.js';
import { VFX } from './fx/VFX.js';
import { AudioManager } from './audio/AudioManager.js';
import { HUD } from './ui/HUD.js';
import { Cinematics } from './ui/Cinematics.js';
import { Player } from './entities/Player.js';
import { ThirdPersonCamera } from './entities/ThirdPersonCamera.js';
import { EnemyManager } from './entities/Enemy.js';
import { Boss } from './entities/Boss.js';

const FIXED_DT = 1 / 60;
// миссии по районам: состав волн — { тип: количество }
const STAGES = [
  { district: 'plaza', waves: [{ shambler: 4 }, { shambler: 4, runner: 2 }] },
  { district: 'industrial', waves: [{ shambler: 3, runner: 3 }, { shambler: 4, spitter: 2 }] },
  { district: 'residential', waves: [{ runner: 4, spitter: 2 }, { shambler: 5, runner: 3, spitter: 2 }] },
  { district: 'hive', boss: true },
];
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const LOWFX = PARAMS.has('lowfx');

// ---------- заставки (полёты камеры с субтитрами) ----------
const CINE_INTRO = [
  {
    from: [10, 44, -26], to: [4, 26, 6], look: [0, 2, 0],
    dur: 5, text: 'Война окончена. Боевая машина Р-111 повержена. Но создатель машины не принял поражения…',
  },
  {
    from: [14, 16, -38], to: [4, 9, -52], look: [0, 4, -78],
    dur: 4.5, text: 'В комплексе HIVE инженер Хаас переделал собственное тело. Теперь мёртвые встают по его сигналу.',
  },
  {
    from: [7, 7, 67], to: [2.6, 2.4, 61.5], look: [0, 1.6, 58],
    dur: 4.5, text: 'К-250 снова в строю. Это последняя миссия.',
  },
];
const CINE_MID = [
  {
    from: [-38, 26, 38], to: [-56, 15, 26], look: [-60, 2, 10],
    dur: 4.5, text: 'Сигнал Хааса усиливается. Заражение расползается по жилым кварталам.',
  },
  {
    from: [-24, 12, -22], to: [-4, 17, -38], look: [0, 5, -72],
    dur: 4.5, text: 'Источник — комплекс HIVE. Времени почти не осталось.',
  },
];
const cineEnd = (bossPos) => [
  {
    from: [bossPos.x + 9, bossPos.y + 3.5, bossPos.z + 9], to: [bossPos.x - 7, bossPos.y + 4.5, bossPos.z + 8],
    look: [bossPos.x, bossPos.y + 1.5, bossPos.z],
    dur: 5, text: 'Инженер Хаас уничтожен. Сигнал мёртвых затихает.',
  },
  {
    from: [0, 9, -48], to: [0, 32, -16], look: [0, 6, 30],
    dur: 5, text: 'Город будет жить. К-250 выполнил свою миссию.',
  },
];

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
  engine.attachSun(atmosphere.sun);

  // профиль графики: сохранённый выбор или автоопределение по GPU
  const qButtons = [...document.querySelectorAll('.q-btn')];
  const markQuality = (q) => qButtons.forEach((b) => b.classList.toggle('active', b.dataset.q === q));
  if (!LOWFX) {
    const startQ = localStorage.getItem('db2.quality') || engine.detectPreset();
    engine.setQuality(startQ);
    markQuality(startQ);
    engine.onQualityChange = markQuality; // авто-понижение тоже подсвечиваем
    qButtons.forEach((b) =>
      b.addEventListener('click', () => {
        engine.setQuality(b.dataset.q);
        localStorage.setItem('db2.quality', b.dataset.q);
      })
    );
  }
  const level = new Level(engine.scene, physics, assets);
  const wildlife = new Wildlife(engine.scene);
  const vfx = new VFX(engine.scene);
  hud.initMinimap(level.mapStatics, 95);
  const audio = new AudioManager(engine.camera, engine.scene);
  await audio.loadAll();

  const cameraRig = new ThirdPersonCamera(engine.camera, physics);
  const player = new Player(assets.models.knight, engine.scene, physics, cameraRig, vfx, audio, hud);
  player.setSpawn(level.playerSpawn);
  cameraRig.playerModel = player.root;

  const enemies = new EnemyManager(
    { minion: assets.models.minion, rogue: assets.models.rogue, mage: assets.models.mage },
    engine.scene,
    physics,
    vfx,
    audio
  );
  const boss = new Boss(assets.models.warrior, engine.scene, physics, vfx, audio, hud, enemies);

  const cine = new Cinematics(engine.camera);

  // game director state
  let state = 'menu'; // menu | cine | play | pause | over
  let stageIdx = 0;
  let stageWave = 0;
  let stagePhase = 'travel'; // travel | combat | done
  let waveT = 2;
  let bossStarted = false;
  let trickleT = 18;

  const enemyLookup = (handle) => {
    const e = enemies.byCollider(handle);
    if (e) return e;
    if (boss.collider && boss.collider.handle === handle) return boss;
    const crate = level.crateByCollider(handle);
    if (crate) {
      return {
        isCrate: true,
        takeDamage: (dmg, point) => {
          level.breakCrate(crate);
          vfx.burst(point, new THREE.Vector3(0, 1, 0), 0x7fe8ff, 18, 5);
          audio.play3d('impact_metal', crate.pos, { volume: 0.7 });
          enemies.spawnPickup(crate.pos.clone());
        },
      };
    }
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
    // заставка №3: финал
    state = 'cine';
    audio.voice('voice_ai_victory');
    hud.hideBoss();
    hud.root.classList.add('hidden');
    cine.play(cineEnd(boss.pos), () => {
      state = 'over';
      document.exitPointerLock();
      hud.showEnd(true);
    });
  };

  /** Spawn a wave composition around a district center. */
  function spawnWave(composition, center) {
    let i = 0;
    for (const [type, n] of Object.entries(composition)) {
      for (let k = 0; k < n; k++) {
        const a = (i / 8) * Math.PI * 2 + Math.random();
        const r = 14 + Math.random() * 8;
        const p = center.clone();
        p.x += Math.cos(a) * r;
        p.z += Math.sin(a) * r;
        p.y = 0;
        p.x = THREE.MathUtils.clamp(p.x, -88, 88);
        p.z = THREE.MathUtils.clamp(p.z, -88, 88);
        enemies.spawnAt(p, type);
        i++;
      }
    }
  }

  function director(dt) {
    if (bossStarted) {
      trickleT -= dt;
      if (trickleT <= 0 && enemies.aliveCount() < 3 && !boss.dead) {
        trickleT = 20;
        spawnWave({ shambler: 1, runner: 1 }, level.districts.hive.center);
      }
      return;
    }

    const stage = STAGES[stageIdx];
    const district = level.districts[stage.district];

    if (stage.boss) {
      // финальный этап: дойти до комплекса HIVE
      if (stagePhase === 'travel') {
        hud.objective(`ИДИТЕ К ЦЕЛИ: ${district.name}`);
        if (player.pos.distanceTo(district.center) < district.radius) {
          bossStarted = true;
          hud.banner('ИНЖЕНЕР ХААС');
          hud.objective('УНИЧТОЖЬТЕ ИНЖЕНЕРА — СПАСИТЕ ГОРОД');
          boss.spawn(level.bossSpawn);
          cameraRig.addTrauma(0.55);
        }
      }
      return;
    }

    if (stagePhase === 'travel') {
      hud.objective(`ИДИТЕ К ЦЕЛИ: ${district.name}`);
      if (player.pos.distanceTo(district.center) < district.radius) {
        stagePhase = 'combat';
        stageWave = 0;
        waveT = 1.2;
      }
    } else if (stagePhase === 'combat') {
      if (enemies.aliveCount() === 0) {
        waveT -= dt;
        if (waveT <= 0) {
          if (stageWave < stage.waves.length) {
            stageWave++;
            hud.banner(`${district.name} — ВОЛНА ${stageWave}`);
            hud.objective(`${district.name}: ВОЛНА ${stageWave} / ${stage.waves.length}`);
            audio.voice('voice_ai_wave');
            spawnWave(stage.waves[stageWave - 1], district.center);
            waveT = 3.5;
          } else {
            // район зачищен
            audio.voice('voice_ai_clear');
            stageIdx++;
            stagePhase = 'travel';
            const next = level.districts[STAGES[stageIdx].district];
            hud.banner(`СЕКТОР ЗАЧИЩЕН`);
            hud.objective(`ИДИТЕ К ЦЕЛИ: ${next.name}`);
            // заставка №2: середина кампании (после промзоны)
            if (stageIdx === 2) {
              state = 'cine';
              hud.root.classList.add('hidden');
              cine.play(CINE_MID, () => {
                hud.show();
                state = 'play';
              });
            }
          }
        }
      }
    }
  }

  function currentObjectivePos() {
    if (bossStarted) return boss.dead ? null : boss.pos;
    const stage = STAGES[stageIdx];
    return level.districts[stage.district].center;
  }

  // ---------- GPU warmup ----------
  // Один реальный кадр через композер со ВСЕЙ сценой (без фрустум-куллинга):
  // компилируются все варианты шейдеров и загружаются все текстуры в видеопамять.
  // Без этого первый показ зоны/врага/выстрела вызывал фриз на слабых GPU.
  playBtn.textContent = 'ПОДГОТОВКА…';
  {
    for (const z of level.zones) z.group.visible = true;
    // шаблоны врагов и босс — чтобы их шейдеры тоже попали в кадр прогрева
    const temp = new THREE.Group();
    temp.position.set(0, -200, 0);
    for (const key of ['minion', 'rogue', 'mage', 'warrior']) {
      if (assets.models[key]) temp.add(assets.models[key].scene);
    }
    engine.scene.add(temp);
    boss.root.visible = true;
    const wp = new THREE.Vector3(0, -190, 0);
    vfx.muzzle(wp);
    vfx.tracer(wp, wp.clone().setY(-189));
    vfx.burst(wp, null);
    vfx.ring(wp);
    // по одному врагу каждого типа: у их клонов свои варианты материалов
    enemies.spawnNow(new THREE.Vector3(20, 0, 40), 'shambler');
    enemies.spawnNow(new THREE.Vector3(22, 0, 40), 'runner');
    enemies.spawnNow(new THREE.Vector3(24, 0, 40), 'spitter');

    const culled = [];
    engine.scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isSprite) && o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    engine.render(1 / 60);
    for (const o of culled) o.frustumCulled = true;

    boss.root.visible = false;
    for (const e of enemies.enemies) e.dispose();
    enemies.enemies.length = 0;
    engine.scene.remove(temp);
    level.updateZones(level.playerSpawn);
  }

  // ---------- start / pause ----------
  playBtn.disabled = false;
  playBtn.textContent = 'НАЧАТЬ МИССИЮ';
  playBtn.addEventListener('click', () => {
    audio.resume();
    audio.startLoops();
    audio.voice('voice_ai_boot');
    hud.hideScreen();
    input.lock();
    // заставка №1: вступление, затем бой
    state = 'cine';
    cine.play(CINE_INTRO, () => {
      hud.show();
      hud.setHealth(1);
      hud.setAmmo(30, false);
      hud.setKits(player.kits, player.maxKits);
      hud.objective('ИДИТЕ К ЦЕЛИ: ПЛОЩАДЬ');
      state = 'play';
    });
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
      atmosphere,
      cine,
      getState: () => state,
      setState: (s) => (state = s),
      startBoss: () => {
        stageIdx = STAGES.length - 1;
        stagePhase = 'travel';
        enemies.enemies.forEach((e) => !e.dead && e.die());
        bossStarted = true;
        boss.spawn(level.bossSpawn);
      },
      ready: true,
    };
  }

  // ---------- main loop ----------
  const fpsEl = document.getElementById('fps');
  let fpsT = 0;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.max((now - last) / 1000, 0); // реальное время кадра, без ограничения
    let dt = Math.min(rawDt, 0.05);
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
      atmosphere.update(dt, player.pos);
      level.update(dt, atmosphere.nightF, player.pos);
      level.updateZones(player.pos);
      wildlife.update(dt);
      vfx.update(dt);
      hud.updateMinimap({
        playerPos: player.pos,
        viewYaw: -cameraRig.yaw,
        enemies: enemies.enemies.filter((e) => !e.dead).map((e) => e.pos),
        boss: boss.active && !boss.dead ? boss.pos : null,
        pickups: enemies.pickups.map((p) => p.m.position),
        crates: level.crates.map((cr) => cr.pos),
        objective: currentObjectivePos(),
      });
      input.endFrame();
    } else if (state === 'cine') {
      input.consumeMouse(); // сбрасываем накопленную дельту, чтобы камеру не дёрнуло после заставки
      cine.update(dt);
      player.mixer.update(dt); // герой дышит в кадре, а не застывает
      atmosphere.update(dt, engine.camera.position);
      level.update(dt, atmosphere.nightF, engine.camera.position);
      level.updateZones(engine.camera.position); // зоны вокруг камеры, а не игрока
      wildlife.update(dt);
      vfx.update(dt);
      input.endFrame();
    } else if (state === 'menu' || state === 'pause' || state === 'over') {
      // slow idle orbit on menu
      if (state === 'menu') {
        const t = now * 0.00012;
        engine.camera.position.set(Math.sin(t) * 34, 12, Math.cos(t) * 34);
        engine.camera.lookAt(0, 2, -8);
      }
      atmosphere.update(dt, player.pos);
      level.update(dt, atmosphere.nightF, player.pos);
      wildlife.update(dt);
      vfx.update(dt);
    }

    fpsT += rawDt;
    if (fpsT > 0.5) {
      fpsT = 0;
      const f = Math.round(engine.fps);
      fpsEl.textContent = `${f} FPS`;
      fpsEl.className = f >= 45 ? '' : f >= 28 ? 'warn' : 'bad';
    }

    engine.render(dt, rawDt);
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error('[DeathBot2] boot failed:', e);
  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = 'ОШИБКА ЗАГРУЗКИ';
});
