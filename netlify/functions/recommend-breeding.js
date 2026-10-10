const { generate } = require('../lib/gemini');
const { LANGS, GOALS, breedingPrompt } = require('../lib/prompts');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

  const { goal, lang, audio } = b;
  const inventory = typeof b.inventory === 'string' ? b.inventory.replace(/[\r\n"]+/g, ' ').trim().slice(0, 300) : '';
  const audioOk = audio !== undefined && typeof audio === 'string' && audio.length > 0 && audio.length <= 2_600_000 && B64.test(audio);
  if (!GOALS.includes(goal) || !LANGS[lang] || (audio !== undefined && !audioOk) || (!inventory && !audioOk)) {
    return json(400, { error: 'Bad request' });
  }

  const parts = [{ text: breedingPrompt({ inventory, goal, lang, hasAudio: audioOk }) }];
  if (audioOk) parts.push({ inline_data: { mime_type: 'audio/wav', data: audio } });

  try {
    return json(200, { text: await generate(parts) });
  } catch (e) {
    console.error('recommend-breeding failed:', e.message);
    return json(502, { error: 'Service unavailable' });
  }
};
