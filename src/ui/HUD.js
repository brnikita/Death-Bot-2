export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthFill = document.getElementById('healthfill');
    this.ammoEl = document.getElementById('ammo');
    this.ammoMag = document.getElementById('ammo-mag');
    this.kitsEl = document.getElementById('kits');
    this.objectiveEl = document.getElementById('objective');
    this.waveBanner = document.getElementById('wave-banner');
    this.hitmarkerEl = document.getElementById('hitmarker');
    this.bossbar = document.getElementById('bossbar');
    this.bossfill = document.getElementById('bossfill');
    this.damageOverlay = document.getElementById('damage-overlay');
    this.screen = document.getElementById('screen');
    this._hitT = null;
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.mapBase = null;
    this.mapScale = 1;
  }

  /** Bake the static level layout once into an offscreen canvas. */
  initMinimap(statics, worldHalf) {
    const size = this.minimap.width;
    this.mapScale = (size / 2 - 8) / worldHalf;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const ctx = off.getContext('2d');
    const c = size / 2;
    const s = this.mapScale;
    ctx.fillStyle = 'rgba(10,20,24,0.0)';
    ctx.fillRect(0, 0, size, size);
    for (const r of statics) {
      ctx.save();
      ctx.translate(c + r.x * s, c + r.z * s);
      ctx.rotate(-(r.rot || 0));
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect((-r.w / 2) * s, (-r.d / 2) * s, r.w * s, r.d * s);
      ctx.restore();
    }
    this.mapBase = off;
  }

  updateMinimap({ playerPos, viewYaw, enemies, boss, pickups, crates, objective }) {
    const ctx = this.mctx;
    const size = this.minimap.width;
    const c = size / 2;
    const s = this.mapScale;
    ctx.clearRect(0, 0, size, size);
    if (this.mapBase) ctx.drawImage(this.mapBase, 0, 0);

    // crates: yellow squares
    ctx.fillStyle = '#e8d44a';
    for (const p of crates) ctx.fillRect(c + p.x * s - 2, c + p.z * s - 2, 4, 4);

    // pickups: cyan, blinking
    if (Math.floor(performance.now() / 350) % 2 === 0) {
      ctx.fillStyle = '#4ae8ff';
      for (const p of pickups) {
        ctx.beginPath();
        ctx.arc(c + p.x * s, c + p.z * s, 2.4, 0, 7);
        ctx.fill();
      }
    }

    // zombies: red dots
    ctx.fillStyle = '#ff4a3a';
    for (const e of enemies) {
      ctx.beginPath();
      ctx.arc(c + e.x * s, c + e.z * s, 3, 0, 7);
      ctx.fill();
    }

    // boss: big pulsing dot
    if (boss) {
      const pulse = 4.5 + Math.sin(performance.now() / 180) * 1.4;
      ctx.fillStyle = '#ff2210';
      ctx.beginPath();
      ctx.arc(c + boss.x * s, c + boss.z * s, pulse, 0, 7);
      ctx.fill();
    }

    // objective: pulsing gold diamond
    if (objective) {
      const k = 4 + Math.sin(performance.now() / 220) * 1.2;
      ctx.save();
      ctx.translate(c + objective.x * s, c + objective.z * s);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = '#ffce4a';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-k / 2, -k / 2, k, k);
      ctx.restore();
    }

    // player: white view arrow
    ctx.save();
    ctx.translate(c + playerPos.x * s, c + playerPos.z * s);
    ctx.rotate(viewYaw);
    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  show() {
    this.root.classList.remove('hidden');
  }

  setHealth(frac) {
    this.healthFill.style.width = `${Math.max(0, frac * 100)}%`;
    this.healthFill.style.background =
      frac < 0.3 ? 'linear-gradient(90deg,#d83a1f,#ff8c5c)' : 'linear-gradient(90deg,#1fb8d8,#6ef0ff)';
  }

  setAmmo(mag, reloading) {
    this.ammoMag.textContent = reloading ? '--' : mag;
    this.ammoEl.classList.toggle('low', !reloading && mag <= 6);
  }

  setKits(n, max) {
    this.kitsEl.textContent = `РЕМОНТ [+] ${'◆'.repeat(n)}${'◇'.repeat(Math.max(0, max - n))}`;
    this.kitsEl.classList.toggle('empty', n === 0);
  }

  objective(text) {
    this.objectiveEl.textContent = text;
  }

  banner(text) {
    const el = this.waveBanner;
    el.classList.add('hidden');
    el.textContent = text;
    // retrigger CSS animation
    void el.offsetWidth;
    el.classList.remove('hidden');
  }

  hitmarker() {
    this.hitmarkerEl.classList.add('show');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this.hitmarkerEl.classList.remove('show'), 90);
  }

  damageFlash() {
    this.damageOverlay.style.transition = 'none';
    this.damageOverlay.style.opacity = '1';
    requestAnimationFrame(() => {
      this.damageOverlay.style.transition = 'opacity 0.6s';
      this.damageOverlay.style.opacity = '0';
    });
  }

  showBoss(name) {
    document.getElementById('bossname').textContent = name;
    this.bossbar.classList.remove('hidden');
  }

  setBossHealth(frac) {
    this.bossfill.style.width = `${Math.max(0, frac * 100)}%`;
  }

  hideBoss() {
    this.bossbar.classList.add('hidden');
  }

  hideScreen() {
    this.screen.classList.add('hidden');
  }

  showPause(onResume) {
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `
      <div class="panel">
        <h1>ПАУЗА</h1>
        <div class="divider"></div>
        <button id="resume-btn">ПРОДОЛЖИТЬ</button>
      </div>`;
    document.getElementById('resume-btn').addEventListener('click', onResume);
  }

  showEnd(win) {
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = win
      ? `
      <div class="panel">
        <h1>ГОРОД СПАСЁН</h1>
        <div class="divider"></div>
        <p>Инженер Хаас уничтожен. Армия мёртвых рассыпалась в прах.<br/>
        К‑250 в одиночестве стоит среди руин — война наконец окончена.</p>
        <button onclick="location.reload()">ИГРАТЬ СНОВА</button>
      </div>`
      : `
      <div class="panel">
        <h1 class="red">К-250 УНИЧТОЖЕН</h1>
        <div class="divider"></div>
        <p>Броня пробита. Системы отказали.<br/>Город остался без защитника…</p>
        <button onclick="location.reload()">ПОПРОБОВАТЬ СНОВА</button>
      </div>`;
  }
}
