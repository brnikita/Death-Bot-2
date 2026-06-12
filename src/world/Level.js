import * as THREE from 'three';

const ARENA = 92; // half-extent of playable area (map ~200x200)

export class Level {
  constructor(scene, physics, assets) {
    this.scene = scene;
    this.physics = physics;
    this.assets = assets;
    this.crates = [];
    this.beacons = [];
    this.mapStatics = [];
    this.zones = [];
    this.time = 0;
    this.nightF = 0;

    // Пул PointLight'ов постоянного размера: лампы/костры по карте — лишь "точки
    // света" (lightSpots), а реальные источники получают 4 ближайшие к игроку.
    // Число источников в сцене никогда не меняется → three.js не перекомпилирует
    // шейдеры на лету (это вызывало фризы при подгрузке зон).
    this.lightSpots = [];
    this.poolLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.position.y = -100;
      scene.add(l);
      this.poolLights.push(l);
    }

    // one shared emissive material for every lit window on the map
    this.litWinMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color().setHSL(0.09, 0.9, 0.5),
      emissiveIntensity: 1.2,
    });
    this.darkWinMat = new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.25, metalness: 0.8 });

    this.playerSpawn = new THREE.Vector3(0, 1.2, 58);
    this.bossSpawn = new THREE.Vector3(0, 0, -72);

    // районы — миссии идут по ним
    this.districts = {
      plaza: { name: 'ПЛОЩАДЬ', center: new THREE.Vector3(0, 0, 0), radius: 24 },
      industrial: { name: 'ПРОМЗОНА', center: new THREE.Vector3(60, 0, 8), radius: 24 },
      residential: { name: 'ЖИЛОЙ КВАРТАЛ', center: new THREE.Vector3(-60, 0, 10), radius: 24 },
      market: { name: 'СТАРЫЙ РЫНОК', center: new THREE.Vector3(58, 0, -48), radius: 24 },
      hive: { name: 'КОМПЛЕКС HIVE', center: new THREE.Vector3(0, 0, -66), radius: 24 },
    };

    this.spawnPoints = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      this.spawnPoints.push(new THREE.Vector3(Math.cos(a) * 50, 0, Math.sin(a) * 50));
    }

    this.build();
  }

  /** Zone = a group whose meshes are hidden when the player is far (poor man's streaming). */
  zone(cx, cz, r) {
    const group = new THREE.Group();
    this.scene.add(group);
    this.zones.push({ group, cx, cz, r });
    return group;
  }

  updateZones(playerPos) {
    for (const z of this.zones) {
      const dx = playerPos.x - z.cx;
      const dz = playerPos.z - z.cz;
      z.group.visible = dx * dx + dz * dz < (z.r + 58) * (z.r + 58);
    }
  }

  mapRect(x, z, w, d, rot, color) {
    this.mapStatics.push({ type: 'rect', x, z, w, d, rot, color });
  }

  build() {
    const { scene, physics, assets } = this;

    // ---------- Ground ----------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      assets.pbr('asphalt_04', { repeat: [30, 30], color: 0xb8a890 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    physics.addBox(0, -0.5, 0, 200, 1, 200);

    // ---------- Roads (dark asphalt strips) ----------
    this.addRoad(0, 62, 0, -78, 7); // главная: лагерь -> площадь -> HIVE
    this.addRoad(0, 0, 62, 8, 6.5); // на восток, в промзону
    this.addRoad(0, 0, -62, 10, 6.5); // на запад, в жилой квартал
    this.addRoad(62, 8, 58, -48, 6); // из промзоны на юг, к старому рынку
    // грунтовые тропинки
    this.addPath(6, 14, 26, 34, 2.2);
    this.addPath(-8, -18, -34, -40, 2.2);
    this.addPath(14, -10, 40, -28, 2);
    this.addPath(-12, 22, -38, 44, 2);

    // dirt patches
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6b543c, roughness: 1 });
    for (const [x, z, r] of [[12, 30, 3.5], [-20, -30, 4], [35, -20, 3], [-40, 36, 4.5], [50, 30, 3], [-15, 50, 3.5]]) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 18), dirtMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.012, z);
      patch.receiveShadow = true;
      scene.add(patch);
    }

    // ================= ПЛОЩАДЬ (центр) =================
    const plazaZone = this.zone(0, 0, 40);
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(15, 40),
      assets.pbr('concrete_floor_worn_02', { repeat: [5, 5], color: 0xcfc4b2 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    plazaZone.add(plaza);

    this.addWreck(0, -12, plazaZone);
    this.mapRect(0, -12, 6, 4, 0.4, '#8a5a30');

    const plazaBuildings = [
      [-30, -26, 13, 14, 11, 0.1, 'concrete_panels'],
      [30, -24, 12, 11, 12, -0.15, 'concrete_wall_008'],
      [-32, 18, 10, 12, 14, 0, 'brick_wall_09'],
      [33, 20, 11, 13, 12, 0.05, 'concrete_panels'],
    ];
    for (const [x, z, w, h, d, rot, mat] of plazaBuildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat, plazaZone);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }

    this.addContainers(plazaZone, [
      [16, 8, 0.5, false],
      [-19, -6, -0.3, false],
      [-17.5, -5.2, -0.25, true],
    ]);
    this.addBarriers(plazaZone, [
      [-6, 8, 0.4], [-4.4, 8.3, 0.5], [9, -3, -0.7], [10.5, -2.2, -0.6], [-11, -9, 1.2],
    ]);
    this.addRubbleSpots(plazaZone, [[-10, -20, 2.0], [12, -22, 1.7], [-22, 12, 2.2], [22, 12, 1.6], [7, 16, 1.4]]);
    this.addCrate(4, 12, 0.3, plazaZone);
    this.addCrate(-14, -16, 1.1, plazaZone);
    this.addFire(5, -7, plazaZone);
    this.addFire(-21, 19, plazaZone);
    this.addLamp(-12, 4, false, plazaZone);
    this.addLamp(14, 18, true, plazaZone);

    // ================= ПРОМЗОНА (восток) =================
    const ind = this.zone(60, 8, 40);
    this.addFactory(62, -2, ind);
    this.mapRect(62, -2, 22, 15, 0, '#7a6a50');
    this.addChimney(72, 6, ind);
    this.addStorageTanks(52, 22, ind);
    this.addPipeRack(58, 12, 70, 18, ind);
    this.addContainers(ind, [
      [48, -8, 0.9, false],
      [49.5, -6.8, 0.85, true],
      [70, 22, 0.2, false],
      [44, 14, 1.4, false],
    ]);
    this.addRubbleSpots(ind, [[52, 2, 2.0], [68, 14, 1.8], [46, 26, 1.5]]);
    this.addTank(46, -16, 0.8, ind);
    this.mapRect(46, -16, 3, 5.4, 0.8, '#44503c');
    this.addCrate(56, 18, 0.5, ind);
    this.addCrate(68, -8, 1.2, ind);
    this.addFire(57, 4, ind);
    this.addLamp(52, 8, true, ind);
    const indBuilding = [78, 22, 11, 12, 10, 0.2, 'concrete_wall_008'];
    this.addRuinedBuilding(...indBuilding, ind);
    this.mapRect(78, 22, 11, 10, 0.2, '#6a7077');

    // ================= ЖИЛОЙ КВАРТАЛ (запад) =================
    const res = this.zone(-60, 10, 42);
    const houses = [
      [-50, 0, 0.1], [-62, -6, -0.2], [-72, 4, 0.4], [-52, 20, -0.1], [-66, 24, 0.25], [-76, 16, 0],
    ];
    for (const [x, z, rot] of houses) {
      this.addHouse(x, z, rot, res);
      this.mapRect(x, z, 5.5, 6.5, rot, '#7a5a48');
    }
    const resBuildings = [
      [-44, 34, 12, 13, 10, 0.1, 'brick_wall_09'],
      [-78, -12, 10, 10, 12, -0.2, 'concrete_panels'],
    ];
    for (const [x, z, w, h, d, rot, mat] of resBuildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat, res);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }
    this.addPlayground(-58, 12, res);
    this.addCrate(-54, 6, 0.8, res);
    this.addCrate(-68, 16, 0.1, res);
    this.addFire(-63, -2, res);
    this.addLamp(-56, 16, true, res);
    this.addLamp(-70, 0, false, res);

    // ================= СТАРЫЙ РЫНОК (юго-восток) =================
    const market = this.zone(58, -48, 40);
    const stalls = [
      [50, -42, 0.2], [56, -41, 0.15], [62, -43, -0.1],
      [50, -52, 1.75], [57, -54, 1.6], [64, -52, 1.8],
    ];
    for (const [x, z, rot] of stalls) {
      this.addStall(x, z, rot, market);
      this.mapRect(x, z, 3.2, 2, rot, '#8a6a3a');
    }
    this.addContainers(market, [
      [44, -58, 0.4, false],
      [70, -46, 1.1, false],
      [71.5, -44.8, 1.0, true],
    ]);
    this.addBarriers(market, [[48, -47, 0.3], [60, -48, -0.5], [66, -58, 1.0]]);
    this.addRubbleSpots(market, [[46, -38, 1.8], [68, -54, 2.0], [54, -60, 1.6]]);
    this.addCarcass(52, -47);
    this.addCrate(47, -50, 0.6, market);
    this.addCrate(63, -39, 1.3, market);
    this.addFire(55, -47, market);
    this.addFire(66, -50, market);
    this.addLamp(52, -44, true, market);
    this.addLamp(62, -56, false, market);
    const marketBuildings = [
      [42, -66, 11, 11, 10, 0.2, 'brick_wall_09'],
      [74, -60, 12, 12, 10, -0.15, 'concrete_panels'],
    ];
    for (const [x, z, w, h, d, rot, mat] of marketBuildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat, market);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }

    // ================= КОМПЛЕКС HIVE (север) =================
    const hive = this.zone(0, -66, 42);
    this.addBossGate(0, -78, hive);
    this.mapRect(0, -78, 11, 2, 0, '#c03020');
    this.addAntenna(14, -62, hive);
    this.addAntenna(-14, -64, hive);
    this.addAntenna(4, -72, hive);
    // серверные монолиты
    for (const [x, z, rot] of [[-8, -58, 0.3], [8, -56, -0.2], [-3, -68, 0.1], [12, -70, 0.5]]) {
      this.addServerMonolith(x, z, rot, hive);
      this.mapRect(x, z, 2.2, 3.2, rot, '#3a4a40');
    }
    this.addDrone(8, -52, hive);
    this.addDrone(-12, -54, hive);
    this.addDrone(2, -62, hive);
    this.addRubbleSpots(hive, [[-18, -58, 2.0], [18, -64, 1.8]]);
    this.addCrate(-6, -52, 0.7, hive);
    this.addFire(10, -58, hive);
    const hiveBuildings = [
      [-26, -72, 12, 14, 11, 0.15, 'concrete_panels'],
      [26, -70, 11, 12, 10, -0.1, 'concrete_wall_008'],
    ];
    for (const [x, z, w, h, d, rot, mat] of hiveBuildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat, hive);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }

    // ================= ЛАГЕРЬ (юг, старт) =================
    const camp = this.zone(0, 60, 32);
    this.addSandbags(camp, [
      [-4, 52, 0.2], [4, 52, -0.2], [-7, 56, 1.2], [7, 56, -1.2],
    ]);
    this.addTent(-5, 62, 0.4, camp);
    this.addTent(5, 63, -0.3, camp);
    this.addFire(0, 56, camp);
    this.addCrate(-2, 66, 0.9, camp);
    this.addLamp(3, 58, true, camp);
    const campBuildings = [
      [-22, 68, 11, 9, 10, 0.2, 'brick_wall_09'],
      [22, 70, 12, 11, 10, -0.1, 'concrete_panels'],
      [-2, 80, 14, 12, 9, 0, 'concrete_wall_008'],
    ];
    for (const [x, z, w, h, d, rot, mat] of campBuildings) {
      this.addRuinedBuilding(x, z, w, h, d, rot, mat, camp);
      this.mapRect(x, z, w, d, rot, '#6a7077');
    }

    // ================= Разбросанное по всей карте =================
    const carSpots = [
      [10, 22, 0.4, 0x6a3a2a], [-15, 12, 2.2, 0x3a4a5a], [25, -24, 1.0, 0x5a5a3a],
      [-28, -32, -0.6, 0x4a3a4a], [36, 30, 2.8, 0x2a3a2a], [-36, 12, 1.5, 0x6a5a30],
      [5, -32, 0.1, 0x3a3a3a], [-12, 42, -1.2, 0x5a3030], [2, 36, 1.6, 0x46525c],
      [44, 4, 0.3, 0x5a4a2a], [-48, 22, 2.0, 0x32424a], [-4, -44, 0.8, 0x4a4438],
    ];
    for (const [x, z, rot, color] of carSpots) {
      this.addCar(x, z, rot, color);
      this.mapRect(x, z, 2, 4.4, rot, '#4a525c');
    }

    const treeSpots = [
      [-8, 14], [13, -14], [-20, 4], [22, 14], [-26, 38], [33, 38], [-40, 22], [44, 20],
      [-44, -12], [30, -38], [-6, -42], [16, 42], [42, -26], [-34, -42], [54, 34], [-54, 38],
      [70, -12], [-70, 28], [-16, 66], [18, 60], [36, -46], [-30, -52],
    ];
    for (const [x, z] of treeSpots) this.addDeadTree(x, z);

    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4a4a30, roughness: 1 });
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 70;
      const s = 0.35 + Math.random() * 0.55;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), shrubMat);
      bush.position.set(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
      bush.scale.y = 0.6;
      bush.rotation.y = Math.random() * 3;
      bush.castShadow = true;
      scene.add(bush);
    }

    this.addGrass(620, 88);

    // туши животных у дорог
    this.addCarcass(8, 40);
    this.addCarcass(-10, -26);
    this.addCarcass(38, 12);
    this.addCarcass(-44, 4);

    this.addRubbleSpots(null, [[38, -40, 2.0], [-38, -28, 1.8], [14, 34, 1.5], [-14, -38, 1.9], [50, 44, 2.2], [-50, -44, 1.7]]);

    this.addLamp(-8, 34, false, null);
    this.addLamp(8, -34, true, null);
    this.addLamp(-2, -52, false, null);

    // ---------- Bounds ----------
    physics.addBox(0, 9, -ARENA - 2, 200, 22, 2);
    physics.addBox(0, 9, ARENA + 2, 200, 22, 2);
    physics.addBox(-ARENA - 2, 9, 0, 2, 22, 200);
    physics.addBox(ARENA + 2, 9, 0, 2, 22, 200);
  }

  // ===================== helpers =====================

  parentOf(zoneGroup) {
    return zoneGroup || this.scene;
  }

  addRoad(x1, z1, x2, z2, width) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const mat = this.assets.pbr('asphalt_04', { repeat: [1.4, len / 7], color: 0x55504a });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(dx, -dz) + Math.PI;
    road.position.set((x1 + x2) / 2, 0.015, (z1 + z2) / 2);
    road.receiveShadow = true;
    this.scene.add(road);
  }

  addPath(x1, z1, x2, z2, width) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6e5740, roughness: 1 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = -Math.atan2(dx, -dz) + Math.PI;
    p.position.set((x1 + x2) / 2, 0.013, (z1 + z2) / 2);
    p.receiveShadow = true;
    this.scene.add(p);
  }

  addRuinedBuilding(x, z, w, h, d, rotY, matSlug, zoneGroup = null) {
    const { physics, assets } = this;
    const g = new THREE.Group();

    const wallMat = assets.pbr(matSlug, { repeat: [Math.max(1, w / 4), Math.max(1, h / 4)] });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    shell.position.y = h / 2;
    shell.castShadow = shell.receiveShadow = true;
    g.add(shell);

    // карнизы между этажами — деталь силуэта
    const trimMat = assets.pbr('concrete_floor_worn_02', { repeat: [w / 3, 0.3], color: 0xa8a094 });
    for (const fy of [0.34, 0.67]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.22, d + 0.35), trimMat);
      trim.position.y = h * fy;
      trim.castShadow = true;
      g.add(trim);
    }

    const topMat = assets.pbr('cracked_concrete', { repeat: [w / 4, 1] });
    const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.18, d * 0.8), topMat);
    top.position.set((Math.random() - 0.5) * w * 0.2, h + h * 0.09, (Math.random() - 0.5) * d * 0.15);
    top.rotation.y = (Math.random() - 0.5) * 0.25;
    top.castShadow = true;
    g.add(top);

    // крышная техника
    if (Math.random() < 0.7) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.8, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.6, roughness: 0.5 })
      );
      ac.position.set((Math.random() - 0.5) * w * 0.4, h + 0.4, (Math.random() - 0.5) * d * 0.4);
      ac.castShadow = true;
      g.add(ac);
    }
    if (Math.random() < 0.5) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x6a5a48, metalness: 0.4, roughness: 0.7 })
      );
      tank.position.set((Math.random() - 0.5) * w * 0.35, h + 0.7, (Math.random() - 0.5) * d * 0.35);
      tank.castShadow = true;
      g.add(tank);
    }

    // окна: тёмные — одним InstancedMesh, горящие — общим материалом
    const facing = new THREE.Vector3(-x, 0, -z).normalize();
    const cols = Math.floor(w / 2.2);
    const rows = Math.max(1, Math.floor((h * 0.75) / 2.6));
    const winGeo = new THREE.PlaneGeometry(1.1, 1.5);
    const darkTransforms = [];
    const litTransforms = [];
    const dummy = new THREE.Object3D();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (Math.random() < 0.25) continue;
        const u = (cx + 0.5) / cols - 0.5;
        const v = ((cy + 0.7) / rows) * 0.72;
        if (Math.abs(facing.z) > Math.abs(facing.x)) {
          dummy.position.set(u * w * 0.86, v * h, (d / 2 + 0.03) * Math.sign(facing.z));
          dummy.rotation.set(0, facing.z < 0 ? Math.PI : 0, 0);
        } else {
          dummy.position.set((w / 2 + 0.03) * Math.sign(facing.x), v * h, u * d * 0.86);
          dummy.rotation.set(0, facing.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        }
        dummy.updateMatrix();
        (Math.random() < 0.12 ? litTransforms : darkTransforms).push(dummy.matrix.clone());
      }
    }
    for (const [list, mat] of [
      [darkTransforms, this.darkWinMat],
      [litTransforms, this.litWinMat],
    ]) {
      if (!list.length) continue;
      const inst = new THREE.InstancedMesh(winGeo, mat, list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    // дверной проём на фасаде
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2.3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.9 })
    );
    if (Math.abs(facing.z) > Math.abs(facing.x)) {
      door.position.set(0, 1.15, (d / 2 + 0.05) * Math.sign(facing.z));
    } else {
      door.position.set((w / 2 + 0.05) * Math.sign(facing.x), 1.15, 0);
      door.rotation.y = Math.PI / 2;
    }
    g.add(door);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.parentOf(zoneGroup).add(g);
    physics.addBox(x, h / 2, z, w, h, d, rotY);
  }

  addHouse(x, z, rot, zoneGroup) {
    const { physics, assets } = this;
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 6.5), assets.pbr('brick_wall_09', { repeat: [2, 1.2] }));
    walls.position.y = 1.6;
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    // двускатная крыша из двух наклонных плит
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3830, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 7.1), roofMat);
      slope.position.set(side * 1.35, 3.85, 0);
      slope.rotation.z = -side * 0.62;
      slope.castShadow = true;
      g.add(slope);
    }
    // окна и дверь
    const winMat = Math.random() < 0.4 ? this.litWinMat : this.darkWinMat;
    for (const wx of [-1.5, 1.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), winMat);
      win.position.set(wx, 1.7, 3.28);
      g.add(win);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }));
    door.position.set(0, 1.0, 3.28);
    g.add(door);

    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.parentOf(zoneGroup).add(g);
    physics.addBox(x, 1.6, z, 5.5, 3.2, 6.5, rot);
  }

  addFactory(x, z, zoneGroup) {
    const { physics, assets } = this;
    const g = new THREE.Group();
    const wallMat = assets.pbr('metal_plate_02', { repeat: [5, 2], color: 0x9a9890 });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 15), wallMat);
    hall.position.y = 4.5;
    hall.castShadow = hall.receiveShadow = true;
    g.add(hall);
    // пилообразная крыша
    const roofMat = assets.pbr('rusty_metal_03', { repeat: [3, 1] });
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 15.4), roofMat);
      tooth.position.set(-8 + i * 5.4, 10.2, 0);
      tooth.rotation.z = 0.45;
      tooth.castShadow = true;
      g.add(tooth);
    }
    // ворота
    const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 5.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.8 }));
    gate.position.set(-3, 2.7, 7.6);
    g.add(gate);
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffaa00, emissiveIntensity: 1.2 })
    );
    stripe.position.set(-3, 5.7, 7.62);
    g.add(stripe);

    g.position.set(x, 0, z);
    this.parentOf(zoneGroup).add(g);
    physics.addBox(x, 4.5, z, 22, 9, 15);
  }

  addChimney(x, z, zoneGroup) {
    const chimney = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, 19, 14),
      this.assets.pbr('brick_wall_09', { repeat: [3, 6] })
    );
    chimney.position.set(x, 9.5, z);
    chimney.castShadow = true;
    this.parentOf(zoneGroup).add(chimney);
    this.physics.addBox(x, 9.5, z, 3, 19, 3);
    this.mapRect(x, z, 3, 3, 0, '#7a4a3a');
  }

  addStorageTanks(x, z, zoneGroup) {
    const mat = this.assets.pbr('rusty_metal_03', { repeat: [2, 1], metalness: 0.45, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 6.5, 16), mat);
      t.rotation.z = Math.PI / 2;
      t.position.set(x + i * 4.4, 1.9, z + i * 0.6);
      t.castShadow = t.receiveShadow = true;
      this.parentOf(zoneGroup).add(t);
      this.physics.addBox(x + i * 4.4, 1.9, z + i * 0.6, 6.5, 3.8, 3.8);
      this.mapRect(x + i * 4.4, z + i * 0.6, 6.5, 3.8, 0, '#8a5a38');
    }
  }

  addPipeRack(x1, z1, x2, z2, zoneGroup) {
    const g = this.parentOf(zoneGroup);
    const mat = this.assets.pbr('metal_plate_02', { repeat: [4, 0.5], color: 0x8a7a60 });
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    for (const dy of [2.6, 3.3]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, len, 10), mat);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = -Math.atan2(dz, dx);
      pipe.position.set((x1 + x2) / 2, dy, (z1 + z2) / 2);
      pipe.castShadow = true;
      g.add(pipe);
    }
    // опоры
    const n = Math.floor(len / 5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), mat);
      leg.position.set(px, 1.7, pz);
      leg.castShadow = true;
      g.add(leg);
      this.physics.addBox(px, 1.7, pz, 0.3, 3.4, 0.3);
    }
  }

  addServerMonolith(x, z, rot, zoneGroup) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.4, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x14181a, metalness: 0.8, roughness: 0.35 })
    );
    body.position.y = 1.7;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const slits = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22ff66, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 })
    );
    slits.position.set(0, 1.8, 0.62);
    g.add(slits);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.parentOf(zoneGroup).add(g);
    this.physics.addBox(x, 1.7, z, 2.2, 3.4, 1.2, rot);
  }

  addSandbags(zoneGroup, spots) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a8a66, roughness: 1 });
    for (const [x, z, rot] of spots) {
      const g = new THREE.Group();
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 4 - r; i++) {
          const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), mat);
          bag.rotation.z = Math.PI / 2;
          bag.position.set(-0.9 + i * 0.62 + r * 0.3, 0.2 + r * 0.4, 0);
          bag.castShadow = true;
          g.add(bag);
        }
      }
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      this.parentOf(zoneGroup).add(g);
      this.physics.addBox(x, 0.5, z, 2.6, 1.0, 0.6, rot);
    }
  }

  addTent(x, z, rot, zoneGroup) {
    // ridge tent: two slabs leaning into each other (same pattern as the house roofs)
    const mat = new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 1 });
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 3.0), mat);
      slab.position.set(side * 0.58, 0.72, 0);
      slab.rotation.z = -side * 1.02;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
    }
    // back wall (triangle approximated by a thin box rotated 45°)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.06), mat);
    back.position.set(0, 0.62, -1.45);
    back.rotation.z = Math.PI / 4;
    g.add(back);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.parentOf(zoneGroup).add(g);
    this.physics.addBox(x, 0.7, z, 2.2, 1.4, 3.0, rot);
  }

  addPlayground(x, z, zoneGroup) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x7a4438, metalness: 0.6, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8), metal);
      pole.position.set(side * 1.4, 1.2, 0);
      pole.castShadow = true;
      g.add(pole);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 2.35;
    g.add(bar);
    for (const sx of [-0.6, 0.6]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), metal);
      chain.position.set(sx, 1.6, 0);
      chain.rotation.x = 0.15;
      g.add(chain);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), metal);
      seat.position.set(sx, 0.85, 0.12);
      g.add(seat);
    }
    g.position.set(x, 0, z);
    this.parentOf(zoneGroup).add(g);
    this.physics.addBox(x, 1.2, z, 3, 2.4, 0.4);
  }

  addCarcass(x, z) {
    const g = new THREE.Group();
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.9 });
    // тёмное пятно
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a201a, roughness: 1, transparent: true, opacity: 0.8 })
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.014;
    g.add(stain);
    // рёбра
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.05, 0.035, 6, 12, Math.PI), bone);
      rib.position.set(0, 0.1, -0.5 + i * 0.26);
      rib.rotation.set(0, 0, 0.15);
      rib.castShadow = true;
      g.add(rib);
    }
    // хребет и череп
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), bone);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.08, 0.1);
    g.add(spine);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), bone);
    skull.position.set(0.05, 0.14, 1.0);
    skull.scale.set(0.8, 0.7, 1.2);
    g.add(skull);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
  }

  addContainers(zoneGroup, list) {
    const { physics, assets } = this;
    for (const [x, z, rot, stacked] of list) {
      const y = stacked ? 2.4 + 1.2 : 1.2;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.4, 6),
        assets.pbr('rusty_metal_03', { repeat: [2, 1], metalness: 0.35, roughness: 0.85 })
      );
      box.position.set(x, y, z);
      box.rotation.y = rot;
      box.castShadow = box.receiveShadow = true;
      this.parentOf(zoneGroup).add(box);
      physics.addBox(x, y, z, 2.4, 2.4, 6, rot);
      if (!stacked) this.mapRect(x, z, 2.4, 6, rot, '#a06a30');
    }
  }

  addBarriers(zoneGroup, list) {
    const mat = this.assets.pbr('concrete_floor_worn_02', { repeat: [1, 0.5], color: 0xc8bfae });
    for (const [x, z, rot] of list) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.5), mat);
      b.position.set(x, 0.55, z);
      b.rotation.y = rot;
      b.castShadow = b.receiveShadow = true;
      this.parentOf(zoneGroup).add(b);
      this.physics.addBox(x, 0.55, z, 2.2, 1.1, 0.5, rot);
    }
  }

  addRubbleSpots(zoneGroup, list) {
    const rubbleMat = this.assets.pbr('cracked_concrete', { repeat: [2, 2], color: 0x9d9890 });
    for (const [x, z, s] of list) {
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
      this.parentOf(zoneGroup).add(pile);
      this.physics.addBox(x, s * 0.3, z, s * 1.8, s * 0.7, s * 1.8);
    }
  }

  addWreck(x, z, zoneGroup) {
    const { physics, assets } = this;
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
    this.parentOf(zoneGroup).add(g);
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

  addTank(x, z, rot, zoneGroup = null) {
    const { physics, assets } = this;
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
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.55, 16), rust);
    turret.position.set(0, 1.6, -0.3);
    g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 10), rust);
    barrel.rotation.x = Math.PI / 2 - 0.06;
    barrel.position.set(0, 1.7, 1.6);
    g.add(barrel);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.parentOf(zoneGroup).add(g);
    physics.addBox(x, 1, z, 3.4, 2, 5.4, rot);
  }

  addDrone(x, z, zoneGroup = null) {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: 0.7, roughness: 0.5 });
    // scorch mark under the crash site
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1, transparent: true, opacity: 0.75 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.012;
    g.add(scorch);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), dark);
    core.position.y = 0.24;
    core.scale.y = 0.55;
    g.add(core);
    // four arms with rotor rings — reads as a crashed quadcopter
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x3a4248, metalness: 0.6, roughness: 0.6 });
    for (const a of [0.785, 2.36]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.12), dark);
      arm.position.y = 0.24;
      arm.rotation.y = a;
      g.add(arm);
      for (const end of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 14), rotorMat);
        ring.position.set(Math.cos(a) * 0.75 * end, 0.24, -Math.sin(a) * 0.75 * end);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
    }
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 8),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3300, emissiveIntensity: 0.5 })
    );
    eye.position.set(0, 0.3, 0.33);
    g.add(eye);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * 3;
    g.rotation.z = -0.07;
    this.parentOf(zoneGroup).add(g);
  }

  addAntenna(x, z, zoneGroup = null) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.8, roughness: 0.45 });
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 17, 8), dark);
    mast.position.y = 8.5;
    mast.castShadow = true;
    g.add(mast);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2 - i * 0.5, 0.08, 0.08), dark);
      bar.position.y = 5 + i * 4;
      bar.rotation.y = i * 0.6;
      g.add(bar);
    }
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2222, emissiveIntensity: 2 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), beaconMat);
    beacon.position.y = 17.1;
    g.add(beacon);
    this.beacons.push(beaconMat);
    g.position.set(x, 0, z);
    this.parentOf(zoneGroup).add(g);
    this.physics.addBox(x, 8.5, z, 0.7, 17, 0.7);
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

  /** Transparent texture with a few tapering grass blades — without it the crossed
   *  quads render as solid X shapes lying on the ground. */
  static grassTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 9; i++) {
      const bx = 6 + i * 6 + (Math.random() - 0.5) * 3;
      const lean = (Math.random() - 0.5) * 10;
      const h = 28 + Math.random() * 30;
      const hue = 45 + Math.random() * 18;
      ctx.strokeStyle = `hsl(${hue}, ${30 + Math.random() * 20}%, ${30 + Math.random() * 14}%)`;
      ctx.lineWidth = 1.6 + Math.random();
      ctx.beginPath();
      ctx.moveTo(bx, 64);
      ctx.quadraticCurveTo(bx + lean * 0.4, 64 - h * 0.6, bx + lean, 64 - h);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  addGrass(count, maxR) {
    const geo = new THREE.PlaneGeometry(0.55, 0.5);
    geo.translate(0, 0.25, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: Level.grassTexture(),
      alphaTest: 0.4,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(geo, mat, count * 2);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let idx = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16.5 + Math.random() * (maxR - 16.5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ry = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.9;
      const shade = 0.75 + Math.random() * 0.45;
      for (const extra of [0, Math.PI / 2]) {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, ry + extra, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
        inst.setColorAt(idx, color.setScalar(shade));
        idx++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  addCrate(x, z, rot, zoneGroup = null) {
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
    this.parentOf(zoneGroup).add(g);
    const body3d = this.physics.addBox(x, 0.4, z, 1.1, 0.8, 0.7, rot);
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
    crate.mesh.parent.remove(crate.mesh);
    this.physics.world.removeRigidBody(crate.body);
  }

  addFire(x, z, zoneGroup = null) {
    this.lightSpots.push({ x, y: 0.8, z, color: 0xff6622, base: 14, range: 13, kind: 'fire' });
    const debris = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0xff3300, emissiveIntensity: 1.4, roughness: 1 })
    );
    debris.position.set(x, 0.25, z);
    debris.scale.y = 0.6;
    this.parentOf(zoneGroup).add(debris);
  }

  addLamp(x, z, flicker, zoneGroup = null) {
    const parent = this.parentOf(zoneGroup);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222a30, metalness: 0.8, roughness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.2, 8), mat);
    pole.position.set(x, 2.6, z);
    pole.castShadow = true;
    parent.add(pole);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x10151a,
      emissive: flicker ? 0xbfdfff : 0x000000,
      emissiveIntensity: flicker ? 1.6 : 0,
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.3), headMat);
    head.position.set(x + 0.35, 5.2, z);
    parent.add(head);
    this.physics.addBox(x, 2.6, z, 0.25, 5.2, 0.25);
    if (flicker) {
      this.lightSpots.push({
        x: x + 0.35, y: 5.0, z,
        color: 0xbfdfff, base: 6, range: 11,
        kind: 'lamp', mat: headMat, t: 0, on: true,
      });
    }
  }

  /** Рыночный прилавок: столешница, стойки и тканевый навес. */
  addStall(x, z, rot, zoneGroup = null) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({
      color: [0x8a3a30, 0x3a5a6a, 0x6a6a30][Math.floor(Math.random() * 3)],
      roughness: 0.95,
    });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 1.1), wood);
    counter.position.y = 0.45;
    counter.castShadow = true;
    g.add(counter);
    for (const sx of [-1.35, 1.35]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), wood);
      post.position.set(sx, 1.1, -0.4);
      post.castShadow = true;
      g.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 1.7), cloth);
    canopy.position.set(0, 2.2, 0.1);
    canopy.rotation.x = 0.18;
    canopy.castShadow = true;
    g.add(canopy);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.parentOf(zoneGroup).add(g);
    this.physics.addBox(x, 0.45, z, 3, 0.9, 1.1, rot);
  }

  addBossGate(x, z, zoneGroup = null) {
    const { assets } = this;
    const parent = this.parentOf(zoneGroup);
    const mat = assets.pbr('metal_plate_02', { repeat: [1, 3], metalness: 0.7, roughness: 0.5, color: 0x8a8f96 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), mat);
      pylon.position.set(x + side * 4.5, 4.5, z);
      pylon.castShadow = true;
      parent.add(pylon);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 8.4),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a14, emissiveIntensity: 2.5 })
      );
      stripe.position.set(x + side * 4.5, 4.5, z + 0.82);
      parent.add(stripe);
      this.physics.addBox(x + side * 4.5, 4.5, z, 1.6, 9, 1.6);
    }
    const arch = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.2, 1.8), mat);
    arch.position.set(x, 9.2, z);
    arch.castShadow = true;
    parent.add(arch);
  }

  update(dt, nightF = 0, playerPos = null) {
    this.time += dt;
    this.nightF = nightF;

    // мерцание материалов ламп (дёшево — это юниформы, не источники света)
    for (const s of this.lightSpots) {
      if (s.kind !== 'lamp') continue;
      s.t -= dt;
      if (s.t <= 0) {
        s.on = Math.random() > 0.32;
        s.mat.emissiveIntensity = s.on ? 1.2 + nightF * 1.4 : 0.08;
        s.t = s.on ? 0.06 + Math.random() * 0.4 : 0.04 + Math.random() * 0.12;
      }
    }

    // 4 ближайших к игроку огня получают реальные PointLight'ы из пула
    if (playerPos) {
      for (const s of this.lightSpots) {
        const dx = s.x - playerPos.x;
        const dz = s.z - playerPos.z;
        s.d2 = dx * dx + dz * dz;
      }
      const near = [...this.lightSpots].sort((a, b) => a.d2 - b.d2);
      for (let i = 0; i < this.poolLights.length; i++) {
        const l = this.poolLights[i];
        const s = near[i];
        if (!s || s.d2 > 65 * 65) {
          l.intensity = 0;
          continue;
        }
        l.position.set(s.x, s.y, s.z);
        l.color.setHex(s.color);
        l.distance = s.range;
        l.intensity =
          s.kind === 'fire'
            ? s.base * (0.75 + Math.sin(this.time * 11 + s.x) * 0.12 + Math.random() * 0.2)
            : s.on
              ? s.base * (0.5 + nightF * 1.2) * (0.6 + Math.random() * 0.4)
              : 0.3;
      }
    }

    this.litWinMat.emissiveIntensity = 0.7 + nightF * 2.6;
    for (const b of this.beacons) {
      b.emissiveIntensity = (Math.sin(this.time * 2.4) > 0.4 ? 2.5 : 0.15) * (0.5 + nightF * 0.8);
    }
  }
}
