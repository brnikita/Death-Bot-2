import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const MODELS = {
  knight: 'assets/models/Knight.glb',
  minion: 'assets/models/Skeleton_Minion.glb',
  warrior: 'assets/models/Skeleton_Warrior.glb',
};

const TEXTURE_SETS = [
  'asphalt_04',
  'concrete_floor_worn_02',
  'cracked_concrete',
  'concrete_wall_008',
  'concrete_panels',
  'rusty_metal_03',
  'metal_plate_02',
  'brick_wall_09',
];

export class Assets {
  constructor() {
    this.models = {};
    this.textures = {}; // slug -> { map, normalMap, roughnessMap }
    this.hdri = null;
  }

  async loadAll(onProgress = () => {}) {
    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const rgbeLoader = new RGBELoader();

    const jobs = [];
    let done = 0;
    const total = Object.keys(MODELS).length + TEXTURE_SETS.length * 3 + 1;
    const tick = () => onProgress(++done / total);

    for (const [key, url] of Object.entries(MODELS)) {
      jobs.push(
        gltfLoader.loadAsync(url).then((g) => {
          this.models[key] = g;
          tick();
        })
      );
    }

    for (const slug of TEXTURE_SETS) {
      const set = {};
      this.textures[slug] = set;
      const load = (file, key, srgb) =>
        texLoader.loadAsync(`assets/textures/${slug}/${file}`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          set[key] = t;
          tick();
        });
      jobs.push(load('Diffuse.jpg', 'map', true));
      jobs.push(load('nor_gl.jpg', 'normalMap', false));
      jobs.push(load('Rough.jpg', 'roughnessMap', false));
    }

    jobs.push(
      rgbeLoader.loadAsync('assets/hdri/industrial_sunset_02_puresky_2k.hdr').then((t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        this.hdri = t;
        tick();
      })
    );

    await Promise.all(jobs);
  }

  /** PBR material from a downloaded PolyHaven set. Textures are cloned so repeat can differ per use. */
  pbr(slug, { repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = 0 } = {}) {
    const src = this.textures[slug];
    const maps = {};
    for (const key of ['map', 'normalMap', 'roughnessMap']) {
      const t = src[key].clone();
      t.repeat.set(repeat[0], repeat[1]);
      maps[key] = t;
    }
    return new THREE.MeshStandardMaterial({
      ...maps,
      color,
      roughness,
      metalness,
    });
  }
}
