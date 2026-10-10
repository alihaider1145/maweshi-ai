const { generate } = require('../lib/gemini');
const { LANGS, ANIMALS, injuryPrompt } = require('../lib/prompts');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const okB64 = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && B64.test(s);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request' }); }

  const { animal, lang, image, audio } = b;
  if (!ANIMALS.includes(animal) || !LANGS[lang] || !okB64(image, 1_500_000) || (audio !== undefined && !okB64(audio, 2_600_000))) {
    return json(400, { error: 'Bad request' });
  }

  const parts = [{ text: injuryPrompt({ animal, lang, hasAudio: !!audio }) }, { inline_data: { mime_type: 'image/jpeg', data: image } }];
  if (audio) parts.push({ inline_data: { mime_type: 'audio/wav', data: audio } });

  try {
    return json(200, { text: await generate(parts) });
  } catch (e) {
    console.error('analyze-injury failed:', e.message);
    return json(502, { error: 'Service unavailable' });
  }
};
