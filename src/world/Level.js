import * as THREE from 'three';

const ARENA = 37; // half-extent of playable area

export class Level {
  constructor(scene, physics, assets) {
    this.scene = scene;
    this.physics = physics;
    this.assets = assets;
    this.flickerLights = [];
    this.fires = [];
    this.time = 0;

    this.playerSpawn = new THREE.Vector3(0, 1.2, 24);
    this.bossSpawn = new THREE.Vector3(0, 0, -27);
    this.spawnPoints = [
      new THREE.Vector3(-24, 0, -18),
      new THREE.Vector3(24, 0, -16),
      new THREE.Vector3(-26, 0, 8),
      new THREE.Vector3(26, 0, 10),
      new THREE.Vector3(-14, 0, 26),
      new THREE.Vector3(16, 0, 26),
      new THREE.Vector3(-8, 0, -26),
      new THREE.Vector3(10, 0, -26),
    ];

    this.build();
  }

  build() {
    const { scene, physics, assets } = this;

    // ---------- Ground ----------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 96),
      assets.pbr('asphalt_04', { repeat: [13, 13], color: 0xb8a890 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    physics.addBox(0, -0.5, 0, 96, 1, 96);

    // Worn concrete plaza in the middle
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(14, 40),
      assets.pbr('concrete_floor_worn_02', { repeat: [5, 5], color: 0xcfc4b2 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    scene.add(plaza);

    // ---------- Ruined buildings around the perimeter ----------
    const buildings = [
      // [x, z, w, h, d, rotY, mat]
      [-28, -28, 14, 16, 12, 0.1, 'concrete_panels'],
      [28, -27, 12, 11, 14, -0.15, 'concrete_wall_008'],
      [-30, 2, 10, 13, 18, 0, 'brick_wall_09'],
      [31, 4, 11, 15, 16, 0.05, 'concrete_panels'],
      [-26, 28, 13, 9, 11, -0.2, 'concrete_wall_008'],
      [27, 28, 14, 12, 12, 0.12, 'brick_wall_09'],
      [8, 31, 12, 14, 9, 0, 'concrete_panels'],
      [-10, 31, 10, 8, 9, 0.08, 'concrete_wall_008'],
      [14, -31, 11, 10, 9, -0.05, 'brick_wall_09'],
    ];
    for (const [x, z, w, h, d, rot, mat] of buildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat);
    }

    // ---------- Wreck of R-111 (story centerpiece) ----------
    this.addWreck(0, -10);

    // ---------- Containers ----------
    const rust = () => assets.pbr('rusty_metal_03', { repeat: [2, 1], metalness: 0.35, roughness: 0.85 });
    const containers = [
      [13, 6, 0.5, false],
      [-15, -4, -0.3, false],
      [-13.5, -3.2, -0.25, true], // stacked
      [18, -14, 1.2, false],
      [-6, 16, 2.4, false],
    ];
    for (const [x, z, rot, stacked] of containers) {
      const y = stacked ? 2.4 + 1.2 : 1.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 6), rust());
      box.position.set(x, y, z);
      box.rotation.y = rot;
      box.castShadow = box.receiveShadow = true;
      this.scene.add(box);
      physics.addBox(x, y, z, 2.4, 2.4, 6, rot);
    }

    // ---------- Rubble piles ----------
    const rubbleMat = assets.pbr('cracked_concrete', { repeat: [2, 2], color: 0xb5ab9a });
    const rubbleSpots = [
      [-8, -18, 2.2],
      [9, -20, 1.7],
      [-19, 12, 2.5],
      [21, 16, 1.9],
      [-22, -10, 1.6],
      [5, 12, 1.4],
      [16, 0, 1.8],
      [-4, 28, 2.0],
    ];
    for (const [x, z, s] of rubbleSpots) {
      const pile = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s * (0.35 + Math.random() * 0.4), 0), rubbleMat);
        rock.position.set((Math.random() - 0.5) * s * 1.6, s * 0.18 + Math.random() * 0.15 * s, (Math.random() - 0.5) * s * 1.6);
        rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        rock.scale.y = 0.55;
        rock.castShadow = rock.receiveShadow = true;
        pile.add(rock);
      }
      pile.position.set(x, 0, z);
      this.scene.add(pile);
      physics.addBox(x, s * 0.3, z, s * 1.8, s * 0.7, s * 1.8);
    }

    // ---------- Concrete barriers near the plaza ----------
    const barrierMat = assets.pbr('concrete_floor_worn_02', { repeat: [1, 0.5], color: 0xc8bfae });
    const barriers = [
      [-5, 6, 0.4],
      [-3.4, 6.3, 0.5],
      [7, -2, -0.7],
      [8.5, -1.2, -0.6],
      [-9, -7, 1.2],
    ];
    for (const [x, z, rot] of barriers) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.5), barrierMat);
      b.position.set(x, 0.55, z);
      b.rotation.y = rot;
      b.castShadow = b.receiveShadow = true;
      this.scene.add(b);
      physics.addBox(x, 0.55, z, 2.2, 1.1, 0.5, rot);
    }

    // ---------- Fires (light + ember sources) ----------
    this.addFire(2.8, -8.2);
    this.addFire(-16, 10);
    this.addFire(19, -12.5);

    // ---------- Boss gate (north) ----------
    this.addBossGate(0, -32);

    // ---------- Street lamps (dead, one flickering) ----------
    this.addLamp(-10, 2, false);
    this.addLamp(11, 14, false);
    this.addLamp(-6, -24, true);

    // ---------- Arena bounds (invisible) ----------
    physics.addBox(0, 5, -ARENA - 2, 90, 14, 2);
    physics.addBox(0, 5, ARENA + 2, 90, 14, 2);
    physics.addBox(-ARENA - 2, 5, 0, 2, 14, 90);
    physics.addBox(ARENA + 2, 5, 0, 2, 14, 90);
  }

  addRuinedBuilding(x, z, w, h, d, rotY, matSlug) {
    const { scene, physics, assets } = this;
    const g = new THREE.Group();

    const wallMat = assets.pbr(matSlug, { repeat: [Math.max(1, w / 4), Math.max(1, h / 4)] });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    shell.position.y = h / 2;
    shell.castShadow = shell.receiveShadow = true;
    g.add(shell);

    // Broken top floor — offset smaller box, slightly rotated
    const topMat = assets.pbr('cracked_concrete', { repeat: [w / 4, 1] });
    const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.18, d * 0.8), topMat);
    top.position.set((Math.random() - 0.5) * w * 0.2, h + h * 0.09, (Math.random() - 0.5) * d * 0.15);
    top.rotation.y = (Math.random() - 0.5) * 0.25;
    top.castShadow = true;
    g.add(top);

    // Window grid on the facade facing the arena
    const facing = new THREE.Vector3(-x, 0, -z).normalize();
    const cols = Math.floor(w / 2.2);
    const rows = Math.floor(h / 2.6);
    const winGeo = new THREE.PlaneGeometry(1.1, 1.5);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.25, metalness: 0.8 });
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (Math.random() < 0.25) continue; // blown-out hole
        const lit = Math.random() < 0.1;
        const mat = lit
          ? new THREE.MeshStandardMaterial({
              color: 0x000000,
              emissive: new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.9, 0.5),
              emissiveIntensity: 2.2,
            })
          : dark;
        const win = new THREE.Mesh(winGeo, mat);
        const u = (cx + 0.5) / cols - 0.5;
        const v = (cy + 0.7) / rows;
        // place on the +z or +x face depending on dominant facing axis
        if (Math.abs(facing.z) > Math.abs(facing.x)) {
          win.position.set(u * w * 0.86, v * h * 0.9, (d / 2 + 0.03) * Math.sign(facing.z));
          if (facing.z < 0) win.rotation.y = Math.PI;
        } else {
          win.position.set((w / 2 + 0.03) * Math.sign(facing.x), v * h * 0.9, u * d * 0.86);
          win.rotation.y = facing.x > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        g.add(win);
      }
    }

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
    physics.addBox(x, h / 2, z, w, h, d, rotY);
  }

  addWreck(x, z) {
    const { scene, physics, assets } = this;
    const rust = assets.pbr('rusty_metal_03', { repeat: [2, 2], metalness: 0.4, roughness: 0.9 });
    const g = new THREE.Group();

    // torso — half-buried, tilted
    const torso = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 2.8), rust);
    torso.position.set(0, 1.1, 0);
    torso.rotation.set(0.18, 0.4, -0.22);
    g.add(torso);

    // head — dented sphere, dark eye socket
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), rust);
    head.position.set(2.6, 2.5, 0.4);
    head.scale.set(1, 0.85, 0.95);
    g.add(head);
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2200, emissiveIntensity: 0.7 })
    );
    eye.position.set(3.25, 2.6, 0.95);
    eye.rotation.y = 0.6;
    g.add(eye);

    // arm thrown forward
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 0.9), rust);
    arm.position.set(-2.6, 0.45, 1.6);
    arm.rotation.y = 0.5;
    arm.rotation.z = 0.08;
    g.add(arm);

    // shoulder fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1.6), rust);
    fin.position.set(-1.6, 2.6, -0.7);
    fin.rotation.z = 0.5;
    g.add(fin);

    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    scene.add(g);
    physics.addBox(x, 1.4, z, 5.5, 3.2, 3.4, 0.4);

    // Faded warning stencil "Р-111" — emissive plate on torso
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x553311, roughness: 1 })
    );
    plate.position.set(x + 0.2, 1.7, z + 1.62);
    plate.rotation.x = -0.1;
    scene.add(plate);
  }

  addFire(x, z) {
    const light = new THREE.PointLight(0xff6622, 14, 13, 2);
    light.position.set(x, 0.8, z);
    this.scene.add(light);

    // burning debris
    const debris = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0xff3300, emissiveIntensity: 1.4, roughness: 1 })
    );
    debris.position.set(x, 0.25, z);
    debris.scale.y = 0.6;
    this.scene.add(debris);

    this.fires.push({ light, base: 14 });
  }

  addLamp(x, z, flicker) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222a30, metalness: 0.8, roughness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.2, 8), mat);
    pole.position.set(x, 2.6, z);
    pole.castShadow = true;
    this.scene.add(pole);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x10151a,
      emissive: flicker ? 0xbfdfff : 0x000000,
      emissiveIntensity: flicker ? 1.6 : 0,
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.3), headMat);
    head.position.set(x + 0.35, 5.2, z);
    this.scene.add(head);
    this.physics.addBox(x, 2.6, z, 0.25, 5.2, 0.25);

    if (flicker) {
      const l = new THREE.PointLight(0xbfdfff, 6, 11, 2);
      l.position.set(x + 0.35, 5.0, z);
      this.scene.add(l);
      this.flickerLights.push({ light: l, mat: headMat, base: 6, t: 0 });
    }
  }

  addBossGate(x, z) {
    const { scene, assets } = this;
    const mat = assets.pbr('metal_plate_02', { repeat: [1, 3], metalness: 0.7, roughness: 0.5, color: 0x8a8f96 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), mat);
      pylon.position.set(x + side * 4.5, 4.5, z);
      pylon.castShadow = true;
      scene.add(pylon);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 8.4),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a14, emissiveIntensity: 2.5 })
      );
      stripe.position.set(x + side * 4.5, 4.5, z + 0.82);
      scene.add(stripe);
      this.physics.addBox(x + side * 4.5, 4.5, z, 1.6, 9, 1.6);
    }
    const arch = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.2, 1.8), mat);
    arch.position.set(x, 9.2, z);
    arch.castShadow = true;
    scene.add(arch);
  }

  update(dt) {
    this.time += dt;
    for (const f of this.fires) {
      f.light.intensity = f.base * (0.75 + Math.sin(this.time * 11 + f.light.position.x) * 0.12 + Math.random() * 0.2);
    }
    for (const fl of this.flickerLights) {
      fl.t -= dt;
      if (fl.t <= 0) {
        const on = Math.random() > 0.32;
        fl.light.intensity = on ? fl.base * (0.6 + Math.random() * 0.6) : 0.3;
        fl.mat.emissiveIntensity = on ? 1.6 : 0.08;
        fl.t = on ? 0.06 + Math.random() * 0.4 : 0.04 + Math.random() * 0.12;
      }
    }
  }
}
