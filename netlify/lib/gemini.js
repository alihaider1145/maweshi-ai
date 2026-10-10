// Shared Gemini caller. Tries the primary model, then the fallback, inside one total time budget.
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
// Netlify's default function timeout is 10 s. Raise GEMINI_BUDGET_MS only if your plan allows longer.
const BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS) || 9000;

async function generate(parts) {
  const apiKey = process.env.MAWESHI_GEMINI_KEY;
  if (!apiKey) throw new Error('MAWESHI_GEMINI_KEY is not set on the server');
  const start = Date.now();
  let lastError = 'No response';
  for (let i = 0; i < MODELS.length; i++) {
    const remaining = BUDGET_MS - (Date.now() - start);
    if (remaining < 1500) break;
    const timeout = i === 0 ? Math.round(remaining * 0.7) : remaining;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[i]}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: AbortSignal.timeout(timeout)
      });
      const data = await res.json();
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (text) return text;
        lastError = `${MODELS[i]}: empty response`;
      } else {
        lastError = `${MODELS[i]}: ${data.error?.message || 'HTTP ' + res.status}`;
      }
    } catch (e) {
      lastError = `${MODELS[i]}: ${e.message}`;
    }
  }
  throw new Error(lastError);
}

module.exports = { generate };
