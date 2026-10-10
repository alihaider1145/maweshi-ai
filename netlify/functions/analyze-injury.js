exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.MAWESHI_GEMINI_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY is not set on Netlify server.' }) };
  }
  console.log('KEY CHECK → length:', apiKey.length, '| starts:', apiKey.slice(0, 3), '| ends:', apiKey.slice(-4));

  try {
    const payload = JSON.parse(event.body);
    const models = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
    let lastError = null;

    for (const model of models) {
      const t0 = Date.now();
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000)
        });
        const data = await response.json();
        console.log(model, '→', response.status, 'in', Date.now() - t0, 'ms');
        if (response.ok) {
          return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        }
        lastError = data.error?.message || `HTTP ${response.status}`;
      } catch (e) {
        console.log(model, 'failed after', Date.now() - t0, 'ms:', e.message);
        lastError = `${model}: ${e.message}`;
      }
    }

    return { statusCode: 500, body: JSON.stringify({ error: lastError }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};