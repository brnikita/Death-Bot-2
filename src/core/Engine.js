import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  SMAAEffect,
  HueSaturationEffect,
  BrightnessContrastEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// Профили графики. renderScale — доля от разрешения экрана (главный рычаг на слабых GPU).
const PRESETS = {
  high: { renderScale: Math.min(window.devicePixelRatio, 1.5), shadows: true, shadowMap: 2048, ao: true, smaa: true },
  medium: { renderScale: 1.0, shadows: true, shadowMap: 1024, ao: false, smaa: true },
  low: { renderScale: 0.7, shadows: false, shadowMap: 512, ao: false, smaa: false },
};
const PRESET_ORDER = ['high', 'medium', 'low'];

export class Engine {
  constructor(canvas, { lowfx = false, preserve = false } = {}) {
    this.lowfx = lowfx;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: false,
      preserveDrawingBuffer: preserve,
    });
    this.renderer.setPixelRatio(lowfx ? 0.5 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = !lowfx;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 300);

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.n8ao = null;
    if (!lowfx) {
      this.n8ao = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.n8ao.configuration.aoRadius = 2.0;
      this.n8ao.configuration.distanceFalloff = 4.0;
      this.n8ao.configuration.intensity = 3.0;
      this.n8ao.configuration.halfRes = true;
      this.composer.addPass(this.n8ao);
    }

    this.bloom = new BloomEffect({
      luminanceThreshold: 0.75,
      luminanceSmoothing: 0.25,
      intensity: 1.1,
      mipmapBlur: true,
    });
    const grade = new HueSaturationEffect({ saturation: 0.08 });
    const contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.07 });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.28 });
    this.fxPass = new EffectPass(this.camera, this.bloom, grade, contrast, vignette);
    this.composer.addPass(this.fxPass);
    // SMAA отдельным проходом, чтобы выключать независимо
    this.smaaPass = new EffectPass(this.camera, new SMAAEffect());
    this.composer.addPass(this.smaaPass);

    this.sun = null; // назначается после создания Atmosphere
    this.quality = 'high';
    this.onQualityChange = null;

    // adaptive quality: drop a preset after sustained low FPS (never climbs back to avoid flicker)
    this._lowT = 0;
    this.fps = 60;

    window.addEventListener('resize', () => this.resize());
  }

  /** Определить стартовый профиль по названию GPU (встроенная графика → низкий). */
  detectPreset() {
    let name = '';
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    } catch {
      /* ignore */
    }
    if (/swiftshader|software|basic render/i.test(name)) return 'low';
    if (/intel.*\b(hd|uhd)\s*graphics/i.test(name)) return 'low';
    if (/intel.*iris|apple gpu|adreno|mali/i.test(name)) return 'medium';
    return 'high';
  }

  attachSun(sun) {
    this.sun = sun;
    this.setQuality(this.quality);
  }

  setQuality(preset) {
    if (this.lowfx || !PRESETS[preset]) return;
    const p = PRESETS[preset];
    this.quality = preset;
    this.renderer.setPixelRatio(p.renderScale);
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.n8ao) this.n8ao.enabled = p.ao;
    // последний включённый проход должен рисовать на экран
    this.smaaPass.enabled = p.smaa;
    this.smaaPass.renderToScreen = p.smaa;
    this.fxPass.renderToScreen = !p.smaa;
    if (this.sun) {
      this.sun.castShadow = p.shadows;
      if (this.sun.shadow.mapSize.x !== p.shadowMap) {
        this.sun.shadow.mapSize.set(p.shadowMap, p.shadowMap);
        if (this.sun.shadow.map) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
      }
    }
    // материалы должны перекомпилироваться при выключении теней
    this.scene.traverse((o) => {
      if (o.isMesh && o.material) o.material.needsUpdate = true;
    });
    this.resize();
    if (this.onQualityChange) this.onQualityChange(preset);
    console.info(`[DB2] graphics preset: ${preset.toUpperCase()}`);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render(dt, rawDt = dt) {
    if (rawDt > 0 && rawDt < 5) {
      this.fps += (1 / rawDt - this.fps) * Math.min(1, rawDt * 4); // сглаженный FPS по реальному времени кадра
      const idx = PRESET_ORDER.indexOf(this.quality);
      this._lowT = this.fps < 38 ? this._lowT + rawDt : 0;
      if (this._lowT > 4 && !this.lowfx && idx < PRESET_ORDER.length - 1) {
        this._lowT = -6; // пауза перед следующим понижением
        this.setQuality(PRESET_ORDER[idx + 1]);
        console.info('[DB2] performance: auto-lowered graphics preset');
      }
    }
    this.composer.render(dt);
  }
}
