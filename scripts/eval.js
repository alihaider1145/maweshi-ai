// Benchmark for the presentation slide. Runs the REAL analyze-injury handler (same prompts, same validation gate, same
// model fallback) N times per sample photo and reports what happened.
//
//   MAWESHI_GEMINI_KEY=... node scripts/eval.js [--dir scripts/samples] [--runs 5] [--lang ur-PK] [--animal Cow] [--budget 9000]
//   node scripts/eval.js --dry        <- offline self-test with a FAKE Gemini. Numbers from --dry are NOT results.
//
// Put 3-5 sample photos (.jpg, under about 1 MB each) in scripts/samples/. Results are also saved to scripts/eval-results.json.
//
// WHAT THE NUMBERS MEAN (say this honestly if asked):
// - "JSON validity" = share of Gemini replies (HTTP 200) that passed our gate: valid JSON + right script + no medicine/dose words.
//   Replies that failed the gate are retried on the other model. Field-level repairs are counted separately.
// - Latency is measured on the machine running this script, so it includes your network, not the farmer's phone network.
// - It measures reliability and speed. It does NOT measure whether the advice is medically correct: that needs a vet.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const DRY = args.includes('--dry');
const RUNS = Math.max(1, Number(opt('runs', 5)) || 5);
const LANG = opt('lang', 'ur-PK');
const ANIMAL = opt('animal', 'Cow');
const DIR = path.resolve(opt('dir', path.join(__dirname, 'samples')));
if (opt('budget')) process.env.GEMINI_BUDGET_MS = String(Number(opt('budget')));
if (DRY) process.env.MAWESHI_GEMINI_KEY = 'dry-run';
if (!process.env.MAWESHI_GEMINI_KEY) { console.error('Set MAWESHI_GEMINI_KEY first (or use --dry for an offline self-test).'); process.exit(1); }

const { handler } = require('../netlify/functions/analyze-injury');
const { BUDGET_MS } = require('../netlify/lib/gemini');
const PRIMARY = 'gemini-3.8-flash', FALLBACK = 'gemini-3.5-flash-lite';

// ---- samples ----
function loadSamples() {
  if (DRY) return [{ name: 'dry-1.jpg', b64: 'QUJD' }, { name: 'dry-2.jpg', b64: 'QUJD' }];
  if (!fs.existsSync(DIR)) { console.error(`No sample folder: ${DIR}\nCreate it and add 3-5 .jpg photos.`); process.exit(1); }
  const files = fs.readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f));
  if (!files.length) { console.error(`No .jpg files in ${DIR}`); process.exit(1); }
  return files.map((f) => ({ name: f, b64: fs.readFileSync(path.join(DIR, f)).toString('base64') }))
    .filter((s) => { if (s.b64.length > 1_500_000) { console.warn(`Skipping ${s.name}: over the 1.5 MB request limit (resize it).`); return false; } return true; });
}

// ---- fake Gemini for --dry (shape only, so the script itself can be tested offline) ----
function installDryFetch() {
  let n = 0;
  const good = JSON.stringify({ urgency: 'yellow', animal_visible: true, photo_quality: 'good', emergency_signs: [], needs_more_info: false, follow_up_question: '',
    likely_conditions: [{ name: 'جلد کا زخم', confidence: 'maybe', reason: 'تصویر میں زخم نظر آ رہا ہے' }], first_aid_steps: ['جانور کو سائے میں رکھیں', 'زخم کو صاف پانی سے دھوئیں'],
    do_not: ['زخم کو نہ چھوئیں'], call_vet_when: 'اگر بخار ہو تو ڈاکٹر کو بلائیں', spoken_summary: 'ڈاکٹر کو دکھائیں۔ جانور کو آرام دیں۔' });
  global.fetch = async (url) => {
    n++;
    await new Promise((r) => setTimeout(r, 200 + (n * 137) % 600));
    const text = n % 5 === 0 ? 'not json' : good;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
}

// ---- instrumentation: record every Gemini call and every gate rejection without changing behaviour ----
let calls = [], rejections = 0, answeredBy = null;
function instrument() {
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const t0 = Date.now();
    const model = String(url).includes('3.8-flash') ? PRIMARY : FALLBACK;
    const hasSchema = !!(init && init.body && JSON.parse(init.body).generationConfig.responseSchema);
    try {
      const res = await realFetch(url, init);
      calls.push({ model, status: res.status, ok: res.ok, ms: Date.now() - t0, structured: hasSchema });
      return res;
    } catch (e) { calls.push({ model, status: 0, ok: false, ms: Date.now() - t0, structured: hasSchema, error: e.name }); throw e; }
  };
  const realWarn = console.warn, realLog = console.log, realErr = console.error;
  console.warn = (...a) => { if (/analyze-injury rejected an answer/.test(String(a[0]))) rejections++; };
  console.log = (...a) => { const m = String(a[0]).match(/^gemini-[\w.-]+/); if (m) answeredBy = m[0]; };
  console.error = () => {};
  return () => { console.warn = realWarn; console.log = realLog; console.error = realErr; global.fetch = realFetch; };
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const rate = (n, d) => (d ? `${Math.round((n / d) * 100)}% (${n}/${d})` : 'n/a');
const sec = (ms) => (ms == null ? 'n/a' : (ms / 1000).toFixed(1) + ' s');

(async () => {
  const samples = loadSamples();
  if (DRY) installDryFetch();
  const results = [];
  console.log(`${DRY ? 'DRY RUN (fake Gemini: numbers below are NOT real results)\n' : ''}Evaluating ${samples.length} photo(s) x ${RUNS} runs, lang ${LANG}, budget ${BUDGET_MS} ms\n`);

  for (const sample of samples) {
    for (let i = 1; i <= RUNS; i++) {
      calls = []; rejections = 0; answeredBy = null;
      const restore = instrument();
      const t0 = Date.now();
      let res;
      try { res = await handler({ httpMethod: 'POST', body: JSON.stringify({ animal: ANIMAL, lang: LANG, image: sample.b64 }) }); }
      catch (e) { res = { statusCode: 500, body: '{}' }; }
      const ms = Date.now() - t0;
      restore();
      let j = {}; try { j = JSON.parse(res.body); } catch (e) {}
      const outcome = j.data ? 'structured' : j.text ? 'text' : 'static';
      results.push({ sample: sample.name, run: i, outcome, ms, answeredBy, rejections, repaired: j.data ? j.data.repaired || 0 : 0,
        urgency: j.data ? j.data.urgency : null, calls: [...calls] });
      process.stdout.write(`  ${sample.name} #${i}: ${outcome.padEnd(10)} ${sec(ms).padStart(7)}  ${answeredBy || '-'}${rejections ? `  (${rejections} rejected)` : ''}\n`);
    }
  }

  const n = results.length;
  const structured = results.filter((r) => r.outcome === 'structured');
  const textOnly = results.filter((r) => r.outcome === 'text');
  const staticOnly = results.filter((r) => r.outcome === 'static');
  const allCalls = results.flatMap((r) => r.calls);
  const okSchemaCalls = allCalls.filter((c) => c.structured && c.ok).length;
  const totalRejections = results.reduce((a, r) => a + r.rejections, 0);
  const fallbackRuns = results.filter((r) => r.calls.some((c) => c.model === FALLBACK));
  const rescued = fallbackRuns.filter((r) => r.outcome === 'structured' && r.answeredBy === FALLBACK);
  const apiErrors = allCalls.filter((c) => !c.ok).length;
  const summary = {
    dry: DRY, lang: LANG, runs: n, budgetMs: BUDGET_MS,
    structuredRate: rate(structured.length, n), medianLatencyMs: median(results.map((r) => r.ms)), p95LatencyMs: pct(results.map((r) => r.ms), 95),
    medianStructuredMs: median(structured.map((r) => r.ms)),
    jsonValidity: rate(okSchemaCalls - totalRejections, okSchemaCalls),
    primaryAnsweredFirstTime: rate(results.filter((r) => r.outcome === 'structured' && r.answeredBy === PRIMARY).length, n),
    fallbackModelUsed: rate(fallbackRuns.length, n), fallbackModelRescued: rate(rescued.length, fallbackRuns.length),
    plainTextFallback: rate(textOnly.length, n), staticCard: rate(staticOnly.length, n),
    fieldRepairs: results.reduce((a, r) => a + r.repaired, 0), apiErrors
  };

  console.log(`\n${DRY ? '[DRY RUN - NOT REAL DATA]\n' : ''}| Metric | Result |\n|---|---|`);
  console.log(`| Runs | ${n} (${samples.length} photos x ${RUNS}), language ${LANG} |`);
  console.log(`| Median latency (all runs) | ${sec(summary.medianLatencyMs)} (p95 ${sec(summary.p95LatencyMs)}) |`);
  console.log(`| Median latency (structured answers) | ${sec(summary.medianStructuredMs)} |`);
  console.log(`| Structured answer delivered | ${summary.structuredRate} |`);
  console.log(`| JSON validity (replies passing our gate) | ${summary.jsonValidity} |`);
  console.log(`| Primary model (${PRIMARY}) answered | ${summary.primaryAnsweredFirstTime} |`);
  console.log(`| Fallback model (${FALLBACK}) needed | ${summary.fallbackModelUsed}; rescued ${summary.fallbackModelRescued} |`);
  console.log(`| Plain-text fallback used | ${summary.plainTextFallback} |`);
  console.log(`| Static "see a vet" card shown | ${summary.staticCard} |`);
  console.log(`| Pieces dropped by field-level repair | ${summary.fieldRepairs} |`);
  console.log(`| Gemini HTTP/network errors | ${summary.apiErrors} |`);

  if (!DRY) {
    try { fs.writeFileSync(path.join(__dirname, 'eval-results.json'), JSON.stringify({ summary, results }, null, 2)); console.log('\nSaved scripts/eval-results.json'); } catch (e) {}
  }
  process.exit(0);
})();
