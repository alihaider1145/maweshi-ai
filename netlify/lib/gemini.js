// Shared Gemini caller. Tries the primary model, then the fallback, inside one total time budget.
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
// Netlify's default function timeout is 10 s. Raise GEMINI_BUDGET_MS only if your plan allows longer.
const BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS) || 9000;

// opts.start  : shared start time, so several calls in one request share one time budget.
// opts.system : if set, sent as the systemInstruction (standing rules the model must follow).
// opts.schema : if set, ask for JSON matching this schema (generationConfig.responseSchema).
// opts.temperature : default 0.2. Low temperature makes the model stick to the language and format rules.
// opts.retryNote : if set, added to the request for every model after the first, saying what was wrong with the first answer.
// opts.accept : if set, a reply that fails accept(text) counts as a failed attempt and the next model is tried.
async function generate(parts, opts = {}) {
  const apiKey = process.env.MAWESHI_GEMINI_KEY;
  if (!apiKey) throw new Error('MAWESHI_GEMINI_KEY is not set on the server');
  const start = opts.start || Date.now();
  let lastError = 'No response';
  for (let i = 0; i < MODELS.length; i++) {
    const remaining = BUDGET_MS - (Date.now() - start);
    if (remaining < 1500) break;
    const timeout = i === 0 ? Math.round(remaining * 0.6) : remaining; // the first model must not eat the whole budget
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[i]}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: i > 0 && opts.retryNote ? [{ text: opts.retryNote }, ...parts] : parts }],
          ...(opts.system && { systemInstruction: { parts: [{ text: opts.system }] } }),
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            ...(opts.schema && { responseMimeType: 'application/json', responseSchema: opts.schema })
          }
        }),
        signal: AbortSignal.timeout(timeout)
      });
      const data = await res.json();
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (!text) lastError = `${MODELS[i]}: empty response`;
        else if (opts.accept && !opts.accept(text)) lastError = `${MODELS[i]}: reply did not match the expected format`;
        else { console.log(MODELS[i], 'ok in', Date.now() - start, 'ms'); return text; }
      } else {
        lastError = `${MODELS[i]}: ${data.error?.message || 'HTTP ' + res.status}`;
      }
    } catch (e) {
      lastError = `${MODELS[i]}: ${e.message}`;
    }
  }
  throw new Error(lastError);
}

module.exports = { generate, BUDGET_MS };
