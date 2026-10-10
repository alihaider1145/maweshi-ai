// The "form" Gemini must fill in for a first-aid case, plus the ONE validation gate every answer must pass.
// Keys and the enum values (urgency, photo_quality, confidence, emergency_signs) are always English: the app reads them.
// Every other text value is written by the model in the farmer's language.
const { cleanText, normalizeText, checkScript } = require('./script');
const { EMERGENCY_SIGNS, enforceUrgency, unsafeMedical } = require('./safety');

const URGENCY = ['green', 'yellow', 'red'];
const QUALITY = ['good', 'unclear'];
const CONFIDENCE = ['probably', 'maybe', 'unsure'];
const MAX = { conditions: 3, steps: 6, doNot: 4, question: 160 };

const TRIAGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    urgency: { type: 'STRING', enum: URGENCY, description: 'green = minor, red = emergency' },
    animal_visible: { type: 'BOOLEAN', description: 'true only if the animal is clearly visible' },
    photo_quality: { type: 'STRING', enum: QUALITY },
    emergency_signs: {
      type: 'ARRAY', items: { type: 'STRING', enum: EMERGENCY_SIGNS },
      description: 'every emergency sign you see or hear, as codes; empty list if none'
    },
    needs_more_info: { type: 'BOOLEAN', description: 'true only if ONE missing fact stops you choosing a safe answer' },
    follow_up_question: { type: 'STRING', description: 'the single short question, only when needs_more_info is true' },
    likely_conditions: {
      type: 'ARRAY', maxItems: MAX.conditions,
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          confidence: { type: 'STRING', enum: CONFIDENCE },
          reason: { type: 'STRING' }
        },
        required: ['name', 'confidence', 'reason']
      }
    },
    first_aid_steps: { type: 'ARRAY', maxItems: MAX.steps, items: { type: 'STRING' } },
    do_not: { type: 'ARRAY', maxItems: MAX.doNot, items: { type: 'STRING' } },
    call_vet_when: { type: 'STRING' },
    spoken_summary: { type: 'STRING' }
  },
  required: ['urgency', 'animal_visible', 'photo_quality', 'emergency_signs', 'needs_more_info', 'follow_up_question',
    'likely_conditions', 'first_aid_steps', 'do_not', 'call_vet_when', 'spoken_summary']
};

// Same schema, but every free-text field says which language and script to use (language isolation, part 2:
// the instruction is repeated where the model actually writes the text).
function triageSchemaFor(langLabel) {
  const s = JSON.parse(JSON.stringify(TRIAGE_SCHEMA));
  if (!langLabel) return s;
  const tag = `Written in ${langLabel} only. No Latin letters, no other script.`;
  const p = s.properties;
  p.follow_up_question.description += `. ${tag}`;
  p.likely_conditions.items.properties.name.description = tag;
  p.likely_conditions.items.properties.reason.description = tag;
  p.first_aid_steps.items.description = tag;
  p.do_not.items.description = tag;
  p.call_vet_when.description = tag;
  p.spoken_summary.description = tag;
  return s;
}

// Share of text pieces we are willing to throw away before we stop trusting the whole answer (probably the wrong language).
const MAX_DROPPED_SHARE = 0.4;

// The single validation gate. Returns { data } for a usable answer, or { reason } (reason is for logs only).
// opts.allowQuestion=false: the farmer already answered a question, so another question is not allowed.
//
// FIELD-LEVEL REPAIR: every text piece is checked on its own (script letters + medicine/dose words). A piece that fails is
// DROPPED, not "fixed", and the rest of the answer survives. This is safe because dropping text can only remove advice,
// never add it. If too much is dropped, or no first-aid step survives, the whole answer is rejected and the caller
// tries the other model, then the plain-text fallback, then the static card in the browser. data.repaired = pieces dropped.
function checkTriage(text, lang, opts = {}) {
  const allowQuestion = opts.allowQuestion !== false;
  let o;
  try { o = JSON.parse(String(text).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')); } catch { return { reason: 'not valid JSON' }; }
  if (!o || typeof o !== 'object') return { reason: 'not an object' };
  if (!URGENCY.includes(o.urgency) || !QUALITY.includes(o.photo_quality) || typeof o.animal_visible !== 'boolean') return { reason: 'bad enum or boolean' };

  let kept = 0, dropped = 0;
  const dropReasons = [];
  // Normalise one string, then keep it only if it passes both checks.
  const keep = (raw) => {
    const s = normalizeText(typeof raw === 'string' ? raw : '', lang);
    if (!s) return '';
    const problem = (lang && checkScript(s, lang)) || unsafeMedical([s]);
    if (problem) { dropped++; dropReasons.push(problem); return ''; }
    kept++;
    return s;
  };
  const strList = (v, max) => (Array.isArray(v) ? v.slice(0, max + 2).map(keep).filter(Boolean).slice(0, max) : null);

  const steps = strList(o.first_aid_steps, MAX.steps);
  const doNot = strList(o.do_not, MAX.doNot);
  if (!steps || !doNot || !Array.isArray(o.likely_conditions)) return { reason: 'missing lists' };

  const conditions = o.likely_conditions.slice(0, MAX.conditions).map((c) => ({
    name: keep(c && c.name),
    confidence: CONFIDENCE.includes(c && c.confidence) ? c.confidence : 'unsure',
    reason: keep(c && c.reason)
  })).filter((c) => c.name);

  const out = {
    urgency: o.urgency, animal_visible: o.animal_visible, photo_quality: o.photo_quality,
    emergency_signs: Array.isArray(o.emergency_signs) ? o.emergency_signs.filter((x) => EMERGENCY_SIGNS.includes(x)) : [],
    needs_more_info: o.needs_more_info === true,
    follow_up_question: keep(o.follow_up_question).slice(0, MAX.question),
    likely_conditions: conditions, first_aid_steps: steps, do_not: doNot,
    call_vet_when: keep(o.call_vet_when), spoken_summary: keep(o.spoken_summary)
  };

  // Emergency signs force red in code, whatever the model wrote.
  enforceUrgency(out);

  // Too much of the answer was in the wrong script: do not trust what is left.
  if (dropped && dropped / (kept + dropped) > MAX_DROPPED_SHARE) return { reason: `too much text rejected (${dropped} of ${kept + dropped}): ${dropReasons[0]}` };
  // Whole-answer check: catches a complete answer in the wrong language (for Pashto: no Pashto-only letters at all).
  const joined = [out.follow_up_question, out.call_vet_when, out.spoken_summary, ...out.first_aid_steps, ...out.do_not,
    ...out.likely_conditions.flatMap((c) => [c.name, c.reason])].filter(Boolean).join('\n');
  const wholeProblem = lang ? checkScript(joined, lang) : null;
  if (wholeProblem) return { reason: 'script: ' + wholeProblem };

  const retake = !out.animal_visible || out.photo_quality === 'unclear';
  if (out.needs_more_info && !retake) {
    if (!allowQuestion) return { reason: 'asked a second question' };
    if (out.emergency_signs.length) return { reason: 'asked a question during an emergency' };
    if (!out.follow_up_question) return { reason: 'needs_more_info without a usable question' };
    // Asking a question: the advice fields are not needed (and are not shown).
  } else {
    out.needs_more_info = false;
    out.follow_up_question = '';
    // A usable answer needs at least one first-aid step. The summary and the "call a vet when" sentence are optional now
    // (the app builds its own spoken line and always shows the vet button for yellow/red). Exception: unusable photo.
    if (!retake && !out.first_aid_steps.length) return { reason: 'no usable first-aid step' };
  }

  out.repaired = dropped;
  return { data: out };
}

// Returns the cleaned object, or null if the answer is not usable.
function parseTriage(text, lang, opts) {
  const r = checkTriage(text, lang, opts);
  return r.data || null;
}

module.exports = { TRIAGE_SCHEMA, triageSchemaFor, checkTriage, parseTriage, cleanText };
