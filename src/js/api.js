// The browser sends only plain inputs; the server builds the prompt and calls Gemini.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Model text is untrusted: HTML is escaped before markdown rendering, and links/images are dropped.
// (The renderer signature differs between marked versions: old = (href, title, text), new = one token object. Handle both.)
if (window.marked) marked.use({ renderer: { link: (a, b, c) => (a && typeof a === 'object' ? a.text || '' : c || ''), image: () => '' } });

function renderMarkdown(el, text) {
  if (window.marked) el.innerHTML = marked.parse(escapeHtml(text));
  else el.textContent = text;                       // marked.js failed to load: still show the text
}

// Plain-text version of a structured answer, used when the fancy rendering fails (see triage.js).
function renderTextFallback(result, ui) {
  aidTriage = null;
  if (typeof setCorner === 'function') setCorner(false);
  const text = result.text || (result.data ? triagePlainText(result.data) : '');
  if (!text) throw new Error('nothing to show');
  const out = document.getElementById(ui.out);
  out.textContent = '';
  const box = document.createElement('div');
  box.style.whiteSpace = 'pre-wrap';
  box.textContent = text;
  out.append(box);
}

// Show a result. If the structured renderer throws (broken or unexpected data), fall back to plain text
// (the Step 1 behaviour) instead of crashing. Only if even that is impossible does the caller show the error bar.
function renderResult(result, ui) {
  const out = document.getElementById(ui.out);
  if (!ui.render) { renderMarkdown(out, result.text); return; }
  try {
    ui.render(result);
  } catch (e) {
    console.error('Structured render failed, using plain text instead:', e);
    renderTextFallback(result, ui);
  }
}

let busy = false; // ignore double taps while a request is running
async function callApi(endpoint, body, ui) {
  if (busy) return;
  busy = true;
  hideBanner();
  stopSpeech();                                     // a new request always starts from a clean audio and UI state
  const loader = document.getElementById(ui.loader);
  const card = document.getElementById(ui.card);
  loader.style.display = 'block';
  card.style.display = 'none';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('Server error'); }
    if (!response.ok || !(result.text || result.data)) throw new Error(result.error || 'Request failed');
    renderResult(result, ui);
    if (ui.afterOk) { try { ui.afterOk(result, body); } catch (e) { console.warn('afterOk failed:', e); } }
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    if (ui.onFail) {
      // Last resort for first aid: a static card made only from our own translations (no AI text), never a dead end.
      try { ui.onFail(); card.style.display = 'block'; card.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      catch (e2) { console.error('static card failed:', e2); }
    }
    card.style.display = 'none';
    showError(t('errGeneric'));                     // inline bar, no browser popup
  } finally {
    loader.style.display = 'none';
    busy = false;
  }
}

const AID_UI = { loader: 'firstAidLoader', card: 'firstAidCard', out: 'firstAidOutput', render: showAidResult, onFail: showStaticSafe, afterOk: (r, body) => recordCase(r, body.animal) };

async function analyzeInjury() {
  if (!photoFile) { showError(t('errPhoto')); return; }
  let image;
  try { image = await shrinkImage(photoFile); } catch (e) { console.error(e); showError(t('errGeneric')); return; }
  return callApi('/api/analyze-injury',
    { animal: selected('animals') || 'Cow', lang: currentLang, image, audio: recordings.aid ? recordings.aid.b64 : undefined, recent: recentCases(3) },
    AID_UI);
}

// Step 3: the farmer answered the clarifying question. The conversation is stateless, so we send everything again:
// the photo, the first voice message, the question we were asked, and the answer (typed and/or a short voice clip).
async function submitFollowUp() {
  const question = aidTriage && aidTriage.needs_more_info ? aidTriage.follow_up_question : '';
  if (!question) return;
  const input = document.getElementById('followText');
  const answer = input ? input.value.trim() : '';
  if (!answer && !recordings.follow) { showError(t('followNeed')); return; }
  if (!photoFile) { showError(t('errPhoto')); return; }
  let image;
  try { image = await shrinkImage(photoFile); } catch (e) { console.error(e); showError(t('errGeneric')); return; }
  return callApi('/api/analyze-injury', {
    animal: selected('animals') || 'Cow', lang: currentLang, image,
    audio: recordings.aid ? recordings.aid.b64 : undefined,
    recent: recentCases(3),
    history: [{ question, answer }],
    answerAudio: recordings.follow ? recordings.follow.b64 : undefined
  }, AID_UI);
}

async function recommendBreeding() {
  const inventory = document.getElementById('inventory').value.trim();
  if (!inventory && !recordings.breed) { showError(t('errText')); return; }
  return callApi('/api/recommend-breeding',
    { inventory, goal: selected('goals'), lang: currentLang, audio: recordings.breed ? recordings.breed.b64 : undefined },
    { loader: 'breedingLoader', card: 'breedingCard', out: 'breedingOutput' });
}
