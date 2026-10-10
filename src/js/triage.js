// Shows the structured first-aid answer. The app reads the model's fields and acts on them:
// urgency decides the badge and the "call a vet" button, photo problems ask for a new photo,
// and a clarifying question (Step 3) turns the card into a short voice/text conversation turn.
// All text goes in with textContent (never innerHTML) for model output, so it cannot inject HTML.
let aidTriage = null;

// Badge wording comes from our own translations (t), not from the model, so it is always correct.
const URGENCY_UI = {
  green: { icon: '✅', key: 'urgGreen' },
  yellow: { icon: '⚠️', key: 'urgYellow' },
  red: { icon: '🚨', key: 'urgRed' }
};
const CONF_KEY = { probably: 'confProbably', maybe: 'confMaybe', unsure: 'confUnsure' };
const needsRetake = (d) => !d.animal_visible || d.photo_quality === 'unclear';
const confKey = (c) => CONF_KEY[c] || 'confUnsure';

// The server already validates, but the browser re-checks the shape so odd data can never crash the UI.
// If this fails, showAidResult throws and api.js falls back to plain text.
function validTriage(d) {
  const isList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
  return !!d && typeof d === 'object' && !!URGENCY_UI[d.urgency]
    && isList(d.first_aid_steps) && isList(d.do_not)
    && Array.isArray(d.likely_conditions) && d.likely_conditions.every((c) => c && typeof c.name === 'string')
    && (d.call_vet_when === undefined || typeof d.call_vet_when === 'string')
    && (d.spoken_summary === undefined || typeof d.spoken_summary === 'string')
    && (d.follow_up_question === undefined || typeof d.follow_up_question === 'string');
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function section(titleKey, items, ordered) {
  const box = mk('div', 'tri-sec');
  box.append(mk('h3', '', t(titleKey)));
  const list = mk(ordered ? 'ol' : 'ul');
  items.forEach((x) => list.append(mk('li', '', x)));
  box.append(list);
  return box;
}

function vetButton() {
  const b = mk('button', 'vet-cta', '📞 ' + t('vetBtn'));
  b.onclick = () => showScreen('vet');
  return b;
}

// Corner speaker: shown only for a full structured answer; it reads the whole response.
function setCorner(show) {
  const b = document.getElementById('aidReadAll');
  b.hidden = !show;
  document.getElementById('firstAidCard').classList.toggle('has-corner', show);
  refreshAidLabels();
}
function refreshAidLabels() {
  const b = document.getElementById('aidReadAll');
  if (b) { b.title = t('listenFull'); b.setAttribute('aria-label', t('listenFull')); }
}

// Everything the full answer says, in reading order (shared by the corner speaker and the plain-text fallback).
function triageParts(d) {
  const parts = [t(URGENCY_UI[d.urgency].key)];
  if (d.likely_conditions.length) {
    parts.push(t('secConditions'));
    d.likely_conditions.forEach((c) => parts.push(`${c.name}, ${t(confKey(c.confidence))}`, c.reason));
  }
  if (d.first_aid_steps.length) parts.push(t('secSteps'), ...d.first_aid_steps);
  if (d.do_not.length) parts.push(t('secDont'), ...d.do_not);
  if (d.call_vet_when) parts.push(t('secWhen'), d.call_vet_when);
  return parts.filter(Boolean);
}
// Plain text for the fallback view. Never throws: returns '' if the data is too broken to read.
function triagePlainText(d) {
  try { return triageParts(d).join('\n'); } catch (e) { console.error(e); return ''; }
}

// Step 3: the model is unsure, so the app asks ONE short question, speaks it, and lets the farmer answer by voice.
function showFollowUp(d) {
  const out = document.getElementById('firstAidOutput');
  setCorner(false);
  const box = mk('div', 'follow');
  box.append(mk('h3', '', '❓ ' + t('followTitle')));
  box.append(mk('p', 'follow-q', d.follow_up_question));

  // Voice answer: reuses the same recorder as the main mic (voice.js), in its own slot.
  const mic = mk('div', 'mic');
  mic.id = 'mic-follow';
  mic.innerHTML = '<button class="mic-btn" onclick="toggleMic(\'follow\')"><span class="ico">🎤</span> <span class="lbl"></span></button>'
    + '<div class="mic-done" hidden><audio controls></audio><button class="del" onclick="clearRec(\'follow\')"></button></div>'
    + '<p class="mic-err" hidden></p>';
  box.append(mic);

  const input = mk('input');
  input.type = 'text'; input.id = 'followText'; input.maxLength = 300;
  input.placeholder = t('followPh');
  box.append(input);

  const send = mk('button', 'primary', t('followSend'));
  send.onclick = submitFollowUp;
  box.append(send);
  out.append(box);
  updateMicUI('follow');

  // Read the question aloud. If the browser blocks autoplay, nothing breaks: the farmer can tap Listen.
  const listenBtn = document.querySelector('#firstAidCard .listen');
  setTimeout(() => { if (aidTriage === d) speak(d.follow_up_question, listenBtn); }, 250);
}

// result = { data } (structured answer) or { text } (old plain-text fallback).
function showAidResult(result) {
  const out = document.getElementById('firstAidOutput');
  clearRec('follow');                     // the previous follow-up recording (if any) has been sent already
  aidTriage = null;
  out.textContent = '';

  if (!result.data) {                     // fallback: behave exactly like Step 1
    setCorner(false);
    renderMarkdown(out, result.text);
    return;
  }
  if (!validTriage(result.data)) throw new Error('unexpected triage data');
  const d = result.data;
  aidTriage = d;

  if (needsRetake(d)) {                   // do not guess from a bad photo
    setCorner(false);
    const box = mk('div', 'retake');
    box.append(mk('p', '', '📷 ' + t('retake')));
    const b = mk('button', 'primary', '📷 ' + t('camera'));
    b.onclick = openCamera;
    box.append(b);
    out.append(box);
    return;
  }

  if (d.needs_more_info && d.follow_up_question) { showFollowUp(d); return; }

  setCorner(true);
  const u = URGENCY_UI[d.urgency];
  out.append(mk('div', 'urg urg-' + d.urgency, `${u.icon} ${t(u.key)}`));
  if (d.urgency === 'red') out.append(vetButton());   // red: vet button comes first, above the steps

  if (d.likely_conditions.length) {
    const box = mk('div', 'tri-sec');
    box.append(mk('h3', '', t('secConditions')));
    d.likely_conditions.forEach((c) => {
      const row = mk('p', 'cond');
      row.append(mk('b', '', `${c.name} (${t(confKey(c.confidence))})`));
      if (c.reason) row.append(document.createElement('br'), c.reason);
      box.append(row);
    });
    out.append(box);
  }
  if (d.first_aid_steps.length) out.append(section('secSteps', d.first_aid_steps, true));
  if (d.do_not.length) out.append(section('secDont', d.do_not, false));
  if (d.call_vet_when) {
    const box = mk('div', 'tri-sec');
    box.append(mk('h3', '', t('secWhen')), mk('p', '', d.call_vet_when));
    out.append(box);
  }
  if (d.urgency === 'yellow') out.append(vetButton());
}

// Used when the AI answer could not be produced or did not pass our checks. NO AI text and no first-aid advice: only the
// "see a vet" badge, a "try again" line and the vet button, all from our own translations (t). Conservative on purpose.
function showStaticSafe() {
  aidTriage = null;
  clearRec('follow');
  setCorner(false);
  const out = document.getElementById('firstAidOutput');
  out.textContent = '';
  out.append(mk('div', 'urg urg-yellow', `${URGENCY_UI.yellow.icon} ${t('urgYellow')}`));
  out.append(mk('p', 'static-note', t('errGeneric')));
  out.append(vetButton());
}

// Big Listen button = "short" (urgency + summary, or the question). Corner speaker = "full" (everything on screen).
function listenAid(mode, btn) {
  const d = aidTriage;
  if (!d) { speakText('firstAidOutput', btn); return; }
  if (needsRetake(d)) { speak(t('retake'), btn); return; }
  if (d.needs_more_info && d.follow_up_question) { speak(d.follow_up_question, btn); return; }
  if (mode === 'short') { speak(`${t(URGENCY_UI[d.urgency].key)}. ${d.spoken_summary || ''}`, btn); return; }
  speak(triageParts(d).join('. '), btn);
}
