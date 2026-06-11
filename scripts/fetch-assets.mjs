// Downloads CC0 assets: PolyHaven PBR textures + HDRI, KayKit animated characters.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'public', 'assets');

const TEXTURES = [
  'asphalt_04',
  'concrete_floor_worn_02',
  'cracked_concrete',
  'concrete_wall_008',
  'concrete_panels',
  'rusty_metal_03',
  'metal_plate_02',
  'brick_wall_09',
];
const MAPS = ['Diffuse', 'nor_gl', 'Rough', 'AO'];
const HDRI = 'industrial_sunset_02_puresky';

const KAYKIT_BASE =
  'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf';
const CHARACTERS = ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue'];

async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`skip (exists): ${path.basename(dest)}`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`ok: ${path.relative(ROOT, dest)} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// --- Textures ---
for (const slug of TEXTURES) {
  const res = await fetch(`https://api.polyhaven.com/files/${slug}`);
  if (!res.ok) {
    console.error(`FILES API FAILED for ${slug}: ${res.status}`);
    continue;
  }
  const files = await res.json();
  for (const map of MAPS) {
    const entry = files[map]?.['1k']?.jpg;
    if (!entry) {
      console.warn(`no ${map} for ${slug}`);
      continue;
    }
    await download(entry.url, path.join(ROOT, 'textures', slug, `${map}.jpg`));
  }
}

// --- HDRI ---
{
  const res = await fetch(`https://api.polyhaven.com/files/${HDRI}`);
  const files = await res.json();
  const url = files.hdri?.['2k']?.hdr?.url;
  if (!url) throw new Error('HDRI url not found');
  await download(url, path.join(ROOT, 'hdri', `${HDRI}_2k.hdr`));
}

// --- KayKit characters ---
for (const name of CHARACTERS) {
  await download(`${KAYKIT_BASE}/${name}.glb`, path.join(ROOT, 'models', `${name}.glb`));
}

console.log('done');
