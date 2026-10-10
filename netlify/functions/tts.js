const ALLOWED = ['ur', 'en', 'sd', 'ps'];

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  const q = (event.queryStringParameters || {}).q;
  const tl = (event.queryStringParameters || {}).tl || 'ur';
  if (!q || q.length > 250 || !ALLOWED.includes(tl)) return { statusCode: 400, body: 'Bad request' };

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(q)}&tl=${tl}&client=tw-ob`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    if (!response.ok) return { statusCode: 502, body: 'TTS fetch failed' };
    const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
      body: audio,
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('tts failed:', err.message);
    return { statusCode: 502, body: 'TTS error' };
  }
};
