// Generates game SFX/ambience via ElevenLabs sound-generation API.
// Reads ELEVENLABS_API_KEY from .env. Skips files that already exist.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'audio');

const env = await readFile(path.join(ROOT, '.env'), 'utf8');
const KEY = env.match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
if (!KEY) {
  console.error('ELEVENLABS_API_KEY not found in .env');
  process.exit(1);
}

const SOUNDS = [
  ['shot', 'single sci-fi energy blaster rifle shot, punchy laser zap with bass thump, very short', 0.8],
  ['reload', 'futuristic rifle reload: magazine out, energy cell click in, charging hum', 1.6],
  ['impact_metal', 'bullet ricochet impact on concrete and metal with small sparks, short', 0.7],
  ['impact_zombie', 'wet fleshy bullet impact squelch, short', 0.6],
  ['footstep', 'single heavy robotic metal footstep on concrete, servo whir, very short', 0.5],
  ['zombie_growl', 'raspy undead zombie growl, menacing', 1.6],
  ['zombie_attack', 'aggressive zombie snarl with claw swipe whoosh', 1.2],
  ['zombie_death', 'zombie death groan collapsing to the ground', 1.6],
  ['zombie_spawn', 'undead rising from the ground, bones rattling, dirt and debris falling', 2.0],
  ['boss_roar', 'huge demonic monster roar, deep and terrifying, reverberating', 2.6],
  ['boss_slam', 'massive ground slam impact with shockwave and falling debris', 1.5],
  ['player_hurt', 'robot taking damage: metallic clang with electric short-circuit buzz, short', 0.8],
  ['pickup', 'positive sci-fi energy pickup chime, bright, short', 0.8],
  ['ambient', 'desolate post-apocalyptic wind blowing through city ruins, distant creaking metal, faint embers crackling, seamless ambience', 20],
  ['music', 'dark tense industrial electronic combat music, driving percussion, ominous synth bass, cinematic, seamless loop', 22],
];

await mkdir(OUT, { recursive: true });

for (const [name, prompt, dur] of SOUNDS) {
  const dest = path.join(OUT, `${name}.mp3`);
  if (existsSync(dest)) {
    console.log(`skip (exists): ${name}`);
    continue;
  }
  process.stdout.write(`generating ${name}... `);
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, duration_seconds: dur, prompt_influence: 0.45 }),
    });
    if (!res.ok) {
      console.log(`FAILED ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}
console.log('done');
