import * as THREE from 'three';

const SOUNDS = [
  'shot',
  'reload',
  'impact_metal',
  'impact_zombie',
  'footstep',
  'zombie_growl',
  'zombie_attack',
  'zombie_death',
  'zombie_spawn',
  'boss_roar',
  'boss_slam',
  'player_hurt',
  'pickup',
  'music',
  'ambient',
  'voice_ai_boot',
  'voice_ai_wave',
  'voice_ai_clear',
  'voice_ai_lowhp',
  'voice_ai_victory',
  'voice_haas_intro',
  'voice_haas_summon',
  'voice_haas_enrage',
  'voice_haas_death',
];

export class AudioManager {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.scene = scene;
    this.buffers = {};
    this.pool = [];
    for (let i = 0; i < 14; i++) {
      const a = new THREE.PositionalAudio(this.listener);
      a.setRefDistance(5);
      a.setMaxDistance(60);
      a.setRolloffFactor(1.6);
      const holder = new THREE.Object3D();
      holder.add(a);
      scene.add(holder);
      this.pool.push({ a, holder });
    }
    this.music = null;
    this.ambient = null;
  }

  async loadAll() {
    const loader = new THREE.AudioLoader();
    await Promise.all(
      SOUNDS.map(async (name) => {
        try {
          this.buffers[name] = await loader.loadAsync(`assets/audio/${name}.mp3`);
        } catch {
          this.buffers[name] = null; // missing sound -> silent, game still works
        }
      })
    );
  }

  play3d(name, pos, { volume = 1, rate = 1, jitter = 0.07 } = {}) {
    const buf = this.buffers[name];
    if (!buf) return;
    const slot = this.pool.find((s) => !s.a.isPlaying);
    if (!slot) return;
    slot.holder.position.copy(pos);
    slot.a.setBuffer(buf);
    slot.a.setVolume(volume);
    slot.a.setPlaybackRate(rate + (Math.random() - 0.5) * 2 * jitter);
    slot.a.play();
  }

  /** Radio-style voice line: a new line interrupts the previous one. */
  voice(name, volume = 0.95) {
    const buf = this.buffers[name];
    if (!buf) return;
    if (this._voice && this._voice.isPlaying) this._voice.stop();
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf);
    a.setVolume(volume);
    a.play();
    this._voice = a;
  }

  play2d(name, { volume = 1, rate = 1 } = {}) {
    const buf = this.buffers[name];
    if (!buf) return;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    a.play();
  }

  startLoops() {
    if (this.buffers.music && !this.music) {
      this.music = new THREE.Audio(this.listener);
      this.music.setBuffer(this.buffers.music);
      this.music.setLoop(true);
      this.music.setVolume(0.32);
      this.music.play();
    }
    if (this.buffers.ambient && !this.ambient) {
      this.ambient = new THREE.Audio(this.listener);
      this.ambient.setBuffer(this.buffers.ambient);
      this.ambient.setLoop(true);
      this.ambient.setVolume(0.45);
      this.ambient.play();
    }
  }

  resume() {
    if (this.listener.context.state === 'suspended') this.listener.context.resume();
  }
}
