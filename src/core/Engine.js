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

export class Engine {
  constructor(canvas, { lowfx = false, preserve = false } = {}) {
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

    // adaptive quality: drop a tier after sustained low FPS (never climbs back to avoid flicker)
    this.qualityTier = 0; // 0 high, 1 medium, 2 low
    this._fpsAcc = 0;
    this._fpsN = 0;
    this._lowT = 0;

    this.bloom = new BloomEffect({
      luminanceThreshold: 0.75,
      luminanceSmoothing: 0.25,
      intensity: 1.1,
      mipmapBlur: true,
    });
    const grade = new HueSaturationEffect({ saturation: 0.08 });
    const contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.07 });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.28 });
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, grade, contrast, vignette, new SMAAEffect())
    );

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render(dt) {
    if (dt > 0 && dt < 1) {
      this._lowT = 1 / dt < 45 ? this._lowT + dt : 0;
      if (this._lowT > 3 && this.qualityTier < 2) {
        this.qualityTier++;
        this._lowT = 0;
        if (this.qualityTier === 1) {
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.1));
          this.resize();
          console.info('[DB2] performance: switched to MEDIUM quality');
        } else {
          if (this.n8ao) this.n8ao.enabled = false;
          this.renderer.setPixelRatio(1.0);
          this.renderer.shadowMap.enabled = false;
          this.resize();
          console.info('[DB2] performance: switched to LOW quality');
        }
      }
    }
    this.composer.render(dt);
  }
}
