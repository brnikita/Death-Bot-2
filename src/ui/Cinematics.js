import * as THREE from 'three';

/**
 * Внутриигровые заставки: полёт камеры по контрольным точкам с чёрными
 * кинополосами и субтитрами. Пропуск — ПРОБЕЛ / Enter / клик.
 * Кадр: { from:[x,y,z], to:[x,y,z], look:[x,y,z], look2?:[x,y,z], dur, text }
 */
export class Cinematics {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.shots = [];
    this.idx = 0;
    this.t = 0;
    this.onDone = null;
    this.root = document.getElementById('cine');
    this.subEl = document.getElementById('cine-sub');
    this._skip = (e) => {
      if (!this.active) return;
      if (e.type === 'mousedown' || e.code === 'Space' || e.code === 'Enter') this.finish();
    };
  }

  play(shots, onDone) {
    this.shots = shots;
    this.idx = 0;
    this.t = 0;
    this.onDone = onDone;
    this.active = true;
    this.root.classList.add('on');
    this.subEl.textContent = shots[0].text || '';
    window.addEventListener('keydown', this._skip);
    window.addEventListener('mousedown', this._skip);
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('on');
    window.removeEventListener('keydown', this._skip);
    window.removeEventListener('mousedown', this._skip);
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }

  update(dt) {
    if (!this.active) return;
    const shot = this.shots[this.idx];
    this.t += dt;
    const k = Math.min(1, this.t / shot.dur);
    const e = k * k * (3 - 2 * k); // smoothstep
    this.camera.position.set(
      shot.from[0] + (shot.to[0] - shot.from[0]) * e,
      shot.from[1] + (shot.to[1] - shot.from[1]) * e,
      shot.from[2] + (shot.to[2] - shot.from[2]) * e
    );
    const lk = shot.look2
      ? new THREE.Vector3(
          shot.look[0] + (shot.look2[0] - shot.look[0]) * e,
          shot.look[1] + (shot.look2[1] - shot.look[1]) * e,
          shot.look[2] + (shot.look2[2] - shot.look[2]) * e
        )
      : new THREE.Vector3(...shot.look);
    this.camera.lookAt(lk);

    if (this.t >= shot.dur) {
      this.idx++;
      this.t = 0;
      if (this.idx >= this.shots.length) this.finish();
      else this.subEl.textContent = this.shots[this.idx].text || '';
    }
  }
}
