// Generates Russian voice lines via ElevenLabs TTS (eleven_multilingual_v2).
// AI of K-250 — calm female voice; Engineer Haas — deep menacing male voice.
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

// premade voice IDs (the key has no voices_read permission, so use the standard ones)
const AI_VOICE = { name: 'Sarah', voice_id: 'EXAVITQu4vr4xnSDxMaL' };
const HAAS_VOICE = { name: 'Brian', voice_id: 'nPczCjzI2devNBz1zQrb' };
console.log(`AI voice: ${AI_VOICE.name}, Haas voice: ${HAAS_VOICE.name}`);

const LINES = [
  ['voice_ai_boot', AI_VOICE, { stability: 0.75, similarity_boost: 0.6 },
    'Системы К-250 активированы. Цель: инженер Хаас. Приказ: защитить город.'],
  ['voice_ai_wave', AI_VOICE, { stability: 0.75, similarity_boost: 0.6 },
    'Внимание. Обнаружена волна противника.'],
  ['voice_ai_clear', AI_VOICE, { stability: 0.75, similarity_boost: 0.6 },
    'Сектор зачищен. Следуйте к следующей цели.'],
  ['voice_ai_lowhp', AI_VOICE, { stability: 0.6, similarity_boost: 0.6 },
    'Критическое повреждение брони!'],
  ['voice_ai_victory', AI_VOICE, { stability: 0.75, similarity_boost: 0.6 },
    'Угроза устранена. Город спасён. Миссия завершена.'],
  ['voice_haas_intro', HAAS_VOICE, { stability: 0.3, similarity_boost: 0.75, style: 0.7 },
    'Ты пришёл умереть, машина! Этот город станет твоим кладбищем!'],
  ['voice_haas_summon', HAAS_VOICE, { stability: 0.3, similarity_boost: 0.75, style: 0.7 },
    'Восстаньте, мои мёртвые! Разорвите его на части!'],
  ['voice_haas_enrage', HAAS_VOICE, { stability: 0.25, similarity_boost: 0.75, style: 0.8 },
    'Хватит! Я уничтожу тебя сам!'],
  ['voice_haas_death', HAAS_VOICE, { stability: 0.4, similarity_boost: 0.75, style: 0.5 },
    'Нет… мои творения… это… невозможно…'],
];

await mkdir(OUT, { recursive: true });

for (const [name, voice, settings, text] of LINES) {
  const dest = path.join(OUT, `${name}.mp3`);
  if (existsSync(dest)) {
    console.log(`skip (exists): ${name}`);
    continue;
  }
  process.stdout.write(`generating ${name}... `);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings }),
    });
    if (!res.ok) {
      console.log(`FAILED ${res.status}: ${(await res.text()).slice(0, 160)}`);
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
