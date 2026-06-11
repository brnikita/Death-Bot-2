export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthFill = document.getElementById('healthfill');
    this.ammoEl = document.getElementById('ammo');
    this.ammoMag = document.getElementById('ammo-mag');
    this.objectiveEl = document.getElementById('objective');
    this.waveBanner = document.getElementById('wave-banner');
    this.hitmarkerEl = document.getElementById('hitmarker');
    this.bossbar = document.getElementById('bossbar');
    this.bossfill = document.getElementById('bossfill');
    this.damageOverlay = document.getElementById('damage-overlay');
    this.screen = document.getElementById('screen');
    this._hitT = null;
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
