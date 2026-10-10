// Run this BEFORE deploying: checks that both Gemini models accept what Steps 1-2 send.
//   node scripts/smoke.js [photo.jpg]
// Needs the key in the environment:  MAWESHI_GEMINI_KEY
const fs = require('fs');
const { TRIAGE_SCHEMA, parseTriage } = require('../netlify/lib/triage');
const { injuryJsonPrompt, FIRST_AID_RULES } = require('../netlify/lib/prompts');

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const key = process.env.MAWESHI_GEMINI_KEY;
if (!key) { console.error('Set MAWESHI_GEMINI_KEY first (see the instructions).'); process.exit(1); }
const photo = process.argv[2];

async function call(model, body) {
  const t0 = Date.now();
  let res, data;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000) // give up after 60 s instead of waiting forever
    });
    data = await res.json();
  } catch (e) {
    const why = e.name === 'TimeoutError' ? 'no answer after 60 s (slow or blocked network?)' : (e.cause && e.cause.code) || e.message;
    return { ok: false, status: 0, ms: Date.now() - t0, text: '', error: why };
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return { ok: res.ok, status: res.status, ms: Date.now() - t0, text, error: data.error?.message };
}

(async () => {
  const parts = [{ text: injuryJsonPrompt({ animal: 'Cow', lang: 'en-US', hasAudio: false }) }];
  if (photo) parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(photo).toString('base64') } });
  else console.log('(no photo given: the model should answer "unclear photo", which still tests the JSON format)\n');

  for (const model of MODELS) {
    console.log('==', model, '(waiting for Google, can take up to 60 s...)');
    const a = await call(model, { systemInstruction: { parts: [{ text: FIRST_AID_RULES }] }, contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: TRIAGE_SCHEMA } });
    const parsed = a.ok && parseTriage(a.text);
    console.log(`  JSON schema output : ${a.ok ? (parsed ? 'PASS' : 'FAIL (reply is not valid triage JSON)') : 'FAIL (HTTP ' + a.status + ': ' + a.error + ')'}  [${a.ms} ms]`);
    if (parsed) console.log('  urgency/photo      :', parsed.urgency, '/', parsed.photo_quality);
    else if (a.text) console.log('  raw reply          :', a.text.slice(0, 300));

    const b = await call(model, { systemInstruction: { parts: [{ text: 'Answer with exactly one word.' }] }, contents: [{ parts: [{ text: 'Say hello.' }] }] });
    console.log(`  systemInstruction  : ${b.ok ? 'PASS' : 'FAIL (HTTP ' + b.status + ': ' + b.error + ')'}  [${b.ms} ms]\n`);
  }
})();
