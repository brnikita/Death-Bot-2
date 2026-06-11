import * as THREE from 'three';

const ARENA = 56; // half-extent of playable area

export class Level {
  constructor(scene, physics, assets) {
    this.scene = scene;
    this.physics = physics;
    this.assets = assets;
    this.flickerLights = [];
    this.fires = [];
    this.litWindows = [];
    this.crates = [];
    this.beacons = [];
    this.mapStatics = [];
    this.time = 0;
    this.nightF = 0;

    this.playerSpawn = new THREE.Vector3(0, 1.2, 38);
    this.bossSpawn = new THREE.Vector3(0, 0, -40);
    this.spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      this.spawnPoints.push(new THREE.Vector3(Math.cos(a) * 42, 0, Math.sin(a) * 42));
    }

    this.build();
  }

  mapRect(x, z, w, d, rot, color) {
    this.mapStatics.push({ type: 'rect', x, z, w, d, rot, color });
  }

  build() {
    const { scene, physics, assets } = this;

    // ---------- Ground ----------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      assets.pbr('asphalt_04', { repeat: [20, 20], color: 0xb8a890 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    physics.addBox(0, -0.5, 0, 140, 1, 140);

    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(15, 40),
      assets.pbr('concrete_floor_worn_02', { repeat: [5, 5], color: 0xcfc4b2 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    scene.add(plaza);

    // ---------- Ruined buildings ----------
    const buildings = [
      [-44, -42, 16, 18, 13, 0.1, 'concrete_panels'],
      [44, -40, 13, 12, 15, -0.15, 'concrete_wall_008'],
      [-47, 4, 11, 14, 19, 0, 'brick_wall_09'],
      [48, 6, 12, 16, 17, 0.05, 'concrete_panels'],
      [-40, 43, 14, 10, 12, -0.2, 'concrete_wall_008'],
      [42, 44, 15, 13, 13, 0.12, 'brick_wall_09'],
      [12, 48, 13, 15, 10, 0, 'concrete_panels'],
      [-16, 47, 11, 9, 10, 0.08, 'concrete_wall_008'],
      [20, -47, 12, 11, 10, -0.05, 'brick_wall_09'],
      [-22, -46, 10, 13, 11, 0.15, 'concrete_panels'],
      [-28, -18, 9, 8, 9, 0.5, 'brick_wall_09'],
      [30, 22, 10, 9, 8, -0.4, 'concrete_wall_008'],
      [-30, 24, 8, 7, 9, 0.3, 'concrete_panels'],
    ];
    for (const [x, z, w, h, d, rot, mat] of buildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }

    // ---------- Wreck of R-111 ----------
    this.addWreck(0, -12);
    this.mapRect(0, -12, 6, 4, 0.4, '#8a5a30');

    // ---------- Containers ----------
    const rust = () => assets.pbr('rusty_metal_03', { repeat: [2, 1], metalness: 0.35, roughness: 0.85 });
    const containers = [
      [16, 8, 0.5, false],
      [-19, -6, -0.3, false],
      [-17.5, -5.2, -0.25, true],
      [24, -18, 1.2, false],
      [-8, 20, 2.4, false],
      [34, -30, 0.9, false],
      [-34, 34, 1.8, false],
    ];
    for (const [x, z, rot, stacked] of containers) {
      const y = stacked ? 2.4 + 1.2 : 1.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 6), rust());
      box.position.set(x, y, z);
      box.rotation.y = rot;
      box.castShadow = box.receiveShadow = true;
      scene.add(box);
      physics.addBox(x, y, z, 2.4, 2.4, 6, rot);
      if (!stacked) this.mapRect(x, z, 2.4, 6, rot, '#a06a30');
    }

    // ---------- Rubble (neutral gray — just debris, not interactable) ----------
    const rubbleMat = assets.pbr('cracked_concrete', { repeat: [2, 2], color: 0x9d9890 });
    const rubbleSpots = [
      [-10, -24, 2.2], [12, -26, 1.7], [-25, 16, 2.5], [27, 20, 1.9],
      [-30, -12, 1.6], [7, 16, 1.4], [21, 2, 1.8], [-5, 36, 2.0],
      [38, 12, 2.1], [-38, -28, 1.8], [14, 34, 1.5], [-14, -38, 1.9],
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
      scene.add(pile);
      physics.addBox(x, s * 0.3, z, s * 1.8, s * 0.7, s * 1.8);
    }

    // ---------- Concrete barriers ----------
    const barrierMat = assets.pbr('concrete_floor_worn_02', { repeat: [1, 0.5], color: 0xc8bfae });
    const barriers = [
      [-6, 8, 0.4], [-4.4, 8.3, 0.5], [9, -3, -0.7], [10.5, -2.2, -0.6],
      [-11, -9, 1.2], [18, 26, 0.2], [-22, 30, -0.8], [28, -8, 1.4],
    ];
    for (const [x, z, rot] of barriers) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.5), barrierMat);
      b.position.set(x, 0.55, z);
      b.rotation.y = rot;
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
      physics.addBox(x, 0.55, z, 2.2, 1.1, 0.5, rot);
    }

    // ---------- Wrecked vehicles ----------
    const carSpots = [
      [10, 22, 0.4, 0x6a3a2a], [-15, 12, 2.2, 0x3a4a5a], [25, -24, 1.0, 0x5a5a3a],
      [-28, -32, -0.6, 0x4a3a4a], [36, 30, 2.8, 0x2a3a2a], [-36, 12, 1.5, 0x6a5a30],
      [5, -32, 0.1, 0x3a3a3a], [-12, 42, -1.2, 0x5a3030],
    ];
    for (const [x, z, rot, color] of carSpots) {
      this.addCar(x, z, rot, color);
      this.mapRect(x, z, 2, 4.4, rot, '#4a525c');
    }
    this.addTank(-22, -22, 0.8);
    this.mapRect(-22, -22, 3, 5.4, 0.8, '#44503c');

    // ---------- Downed drones, antenna ----------
    this.addDrone(8, 6);
    this.addDrone(-18, 26);
    this.addDrone(30, 8);
    this.addAntenna(40, -12);

    // ---------- Dead trees ----------
    const treeSpots = [
      [-8, 14], [13, -14], [-20, 4], [22, 14], [-26, 38], [33, 38],
      [-40, 22], [44, 20], [-44, -12], [30, -38], [-6, -42], [16, 42],
      [42, -26], [-34, -42],
    ];
    for (const [x, z] of treeSpots) this.addDeadTree(x, z);

    // ---------- Shrubs ----------
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4a4a30, roughness: 1 });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 17 + Math.random() * 36;
      const s = 0.35 + Math.random() * 0.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), shrubMat);
      bush.position.set(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
      bush.scale.y = 0.6;
      bush.rotation.y = Math.random() * 3;
      bush.castShadow = true;
      scene.add(bush);
    }

    // ---------- Dry grass tufts (instanced) ----------
    this.addGrass();

    // ---------- Supply crates (shootable!) ----------
    const crateSpots = [
      [4, 12, 0.3], [-14, -16, 1.1], [20, -6, 2.0], [-24, 8, 0.7],
      [12, -38, 1.5], [-4, 28, 0.2],
    ];
    for (const [x, z, rot] of crateSpots) this.addCrate(x, z, rot);

    // ---------- Fires (placed on clear ground, away from props) ----------
    this.addFire(5, -7);
    this.addFire(-21, 19);
    this.addFire(27, -15);
    this.addFire(-10, 33);

    // ---------- Boss gate ----------
    this.addBossGate(0, -45);
    this.mapRect(0, -45, 11, 2, 0, '#c03020');

    // ---------- Street lamps ----------
    this.addLamp(-12, 4, false);
    this.addLamp(14, 18, true);
    this.addLamp(-8, -30, true);
    this.addLamp(26, 34, false);
    this.addLamp(-32, -2, false);

    // ---------- Bounds ----------
    physics.addBox(0, 7, -ARENA - 2, 130, 18, 2);
    physics.addBox(0, 7, ARENA + 2, 130, 18, 2);
    physics.addBox(-ARENA - 2, 7, 0, 2, 18, 130);
    physics.addBox(ARENA + 2, 7, 0, 2, 18, 130);
  }

  addRuinedBuilding(x, z, w, h, d, rotY, matSlug) {
    const { scene, physics, assets } = this;
    const g = new THREE.Group();

    const wallMat = assets.pbr(matSlug, { repeat: [Math.max(1, w / 4), Math.max(1, h / 4)] });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    shell.position.y = h / 2;
    shell.castShadow = shell.receiveShadow = true;
    g.add(shell);

    const topMat = assets.pbr('cracked_concrete', { repeat: [w / 4, 1] });
    const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.18, d * 0.8), topMat);
    top.position.set((Math.random() - 0.5) * w * 0.2, h + h * 0.09, (Math.random() - 0.5) * d * 0.15);
    top.rotation.y = (Math.random() - 0.5) * 0.25;
    top.castShadow = true;
    g.add(top);

    // windows only on the lower 3/4 so lit ones never clip into the broken top
    const facing = new THREE.Vector3(-x, 0, -z).normalize();
    const cols = Math.floor(w / 2.2);
    const rows = Math.max(1, Math.floor((h * 0.75) / 2.6));
    const winGeo = new THREE.PlaneGeometry(1.1, 1.5);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.25, metalness: 0.8 });
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (Math.random() < 0.25) continue;
        const lit = Math.random() < 0.12;
        let mat = dark;
        if (lit) {
          mat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.9, 0.5),
            emissiveIntensity: 1.2,
          });
          this.litWindows.push(mat);
        }
        const win = new THREE.Mesh(winGeo, mat);
        const u = (cx + 0.5) / cols - 0.5;
        const v = ((cy + 0.7) / rows) * 0.72;
        if (Math.abs(facing.z) > Math.abs(facing.x)) {
          win.position.set(u * w * 0.86, v * h, (d / 2 + 0.03) * Math.sign(facing.z));
          if (facing.z < 0) win.rotation.y = Math.PI;
        } else {
          win.position.set((w / 2 + 0.03) * Math.sign(facing.x), v * h, u * d * 0.86);
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

    const torso = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 2.8), rust);
    torso.position.set(0, 1.1, 0);
    torso.rotation.set(0.18, 0.4, -0.22);
    g.add(torso);

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

    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 0.9), rust);
    arm.position.set(-2.6, 0.45, 1.6);
    arm.rotation.y = 0.5;
    arm.rotation.z = 0.08;
    g.add(arm);

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
  }

  addCar(x, z, rot, color) {
    const { scene, physics } = this;
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.75 });
    const darkGlass = new THREE.MeshStandardMaterial({ color: 0x0a0d10, metalness: 0.8, roughness: 0.3 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), paint);
    body.position.y = 0.58;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), darkGlass);
    cabin.position.set(0, 1.05, -0.2);
    g.add(cabin);
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.32, wz);
      g.add(w);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    physics.addBox(x, 0.75, z, 1.9, 1.5, 4.4, rot);
  }

  addTank(x, z, rot) {
    const { scene, physics, assets } = this;
    const rust = assets.pbr('rusty_metal_03', { repeat: [1.5, 1], metalness: 0.4, roughness: 0.9, color: 0x6a7058 });
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 5.0), rust);
    hull.position.y = 0.85;
    g.add(hull);
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 5.2), rust);
      track.position.set(side * 1.45, 0.35, 0);
      g.add(track);
    }
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.55, 12), rust);
    turret.position.set(0, 1.6, -0.3);
    g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 8), rust);
    barrel.rotation.x = Math.PI / 2 - 0.06;
    barrel.position.set(0, 1.7, 1.6);
    g.add(barrel);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    physics.addBox(x, 1, z, 3.4, 2, 5.4, rot);
  }

  addDrone(x, z) {
    const { scene } = this;
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: 0.7, roughness: 0.5 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), dark);
    core.position.y = 0.22;
    core.scale.y = 0.6;
    g.add(core);
    for (const a of [0.785, 2.36]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.12), dark);
      arm.position.y = 0.25;
      arm.rotation.y = a;
      g.add(arm);
    }
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3300, emissiveIntensity: 0.5 })
    );
    eye.position.set(0, 0.28, 0.29);
    g.add(eye);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.set(0.12, Math.random() * 3, -0.08);
    scene.add(g);
  }

  addAntenna(x, z) {
    const { scene, physics } = this;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.8, roughness: 0.45 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 17, 8), dark);
    mast.position.set(x, 8.5, z);
    mast.castShadow = true;
    scene.add(mast);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2 - i * 0.5, 0.08, 0.08), dark);
      bar.position.set(x, 5 + i * 4, z);
      bar.rotation.y = i * 0.6;
      scene.add(bar);
    }
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2222, emissiveIntensity: 2 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), beaconMat);
    beacon.position.set(x, 17.1, z);
    scene.add(beacon);
    this.beacons.push(beaconMat);
    physics.addBox(x, 8.5, z, 0.7, 17, 0.7);
  }

  addDeadTree(x, z) {
    const { scene, physics } = this;
    const bark = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 });
    const g = new THREE.Group();
    const h = 2.6 + Math.random() * 1.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, h, 7), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (Math.random() - 0.5) * 0.16;
    g.add(trunk);
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branches; i++) {
      const bl = 0.8 + Math.random() * 1.1;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, bl, 5), bark);
      const ang = Math.random() * Math.PI * 2;
      const by = h * (0.55 + Math.random() * 0.4);
      b.position.set(Math.cos(ang) * bl * 0.35, by, Math.sin(ang) * bl * 0.35);
      b.rotation.set(Math.cos(ang) * 1.0, 0, Math.sin(ang) * -1.0);
      g.add(b);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    scene.add(g);
    physics.addBox(x, h / 2, z, 0.4, h, 0.4);
  }

  addGrass() {
    const COUNT = 240;
    const geo = new THREE.PlaneGeometry(0.5, 0.45);
    geo.translate(0, 0.22, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a7a4a,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(geo, mat, COUNT * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16.5 + Math.random() * 37;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ry = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.9;
      for (const extra of [0, Math.PI / 2]) {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, ry + extra, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  addCrate(x, z, rot) {
    const { scene, physics } = this;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.8, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x4a5a3a, metalness: 0.3, roughness: 0.7 })
    );
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.1, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x041417, emissive: 0x2ee8ff, emissiveIntensity: 1.8 })
    );
    stripe.position.y = 0.12;
    g.add(stripe);
    g.position.set(x, 0.4, z);
    g.rotation.y = rot;
    scene.add(g);
    const body3d = physics.addBox(x, 0.4, z, 1.1, 0.8, 0.7, rot);
    const col = body3d.collider(0);
    this.crates.push({ mesh: g, body: body3d, collider: col, pos: new THREE.Vector3(x, 0.4, z) });
  }

  crateByCollider(handle) {
    return this.crates.find((c) => c.collider && c.collider.handle === handle) || null;
  }

  breakCrate(crate) {
    const i = this.crates.indexOf(crate);
    if (i === -1) return;
    this.crates.splice(i, 1);
    this.scene.remove(crate.mesh);
    this.physics.world.removeRigidBody(crate.body);
  }

  addFire(x, z) {
    const light = new THREE.PointLight(0xff6622, 14, 13, 2);
    light.position.set(x, 0.8, z);
    this.scene.add(light);
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

  update(dt, nightF = 0) {
    this.time += dt;
    this.nightF = nightF;
    for (const f of this.fires) {
      f.light.intensity = f.base * (0.75 + Math.sin(this.time * 11 + f.light.position.x) * 0.12 + Math.random() * 0.2);
    }
    for (const fl of this.flickerLights) {
      fl.t -= dt;
      if (fl.t <= 0) {
        const base = fl.base * (0.5 + nightF * 1.2);
        const on = Math.random() > 0.32;
        fl.light.intensity = on ? base * (0.6 + Math.random() * 0.6) : 0.3;
        fl.mat.emissiveIntensity = on ? 1.2 + nightF * 1.4 : 0.08;
        fl.t = on ? 0.06 + Math.random() * 0.4 : 0.04 + Math.random() * 0.12;
      }
    }
    // windows glow brighter at night
    const winI = 0.7 + nightF * 2.6;
    for (const m of this.litWindows) m.emissiveIntensity = winI;
    // antenna beacon blink
    for (const b of this.beacons) {
      b.emissiveIntensity = (Math.sin(this.time * 2.4) > 0.4 ? 2.5 : 0.15) * (0.5 + nightF * 0.8);
    }
  }
}
