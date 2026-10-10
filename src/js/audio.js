// Text-to-speech. Chain: our /api/tts (Google Translate voice) -> the browser's own voice -> a clear message.
// Every failure ends in a visible, translated message and a reset Listen button. It never just switches off.
let speakToken = 0, speakBtn = null;

function setSpeakUI(btn, playing) {
  if (!btn) return;
  btn.classList.toggle('playing', playing);
  btn.querySelector('.ico').textContent = playing ? '⏹' : '🔊';
  const lbl = btn.querySelector('.lbl'); // the corner speaker icon has no text label
  if (lbl) lbl.textContent = t(playing ? 'stop' : (btn.dataset.idle || 'listen'));
}

function stopSpeech() {
  speakToken++;
  if (window.currentAudio) { window.currentAudio.pause(); window.currentAudio = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  setSpeakUI(speakBtn, false);
  speakBtn = null;
}

function speakText(containerId, btn) {
  const container = document.getElementById(containerId);
  speak(container ? container.innerText : '', btn);
}

function speakHelp(key, btn) { speak(t(key), btn); }

// Which voice each language uses.
//   server = language code for /api/tts (Google Translate), web = language tag for the browser's own voice.
//   approx = we have NO voice for this language and borrow the Urdu voice (MVP): a close but not identical language.
// Google may not offer a voice for every code below (Pashto and Sindhi are not guaranteed). We do not guess:
// if the server voice fails once, the app remembers that and uses the browser voice, or says plainly there is none.
const TTS_VOICES = {
  en:  { server: 'en', web: 'en-US' },
  ur:  { server: 'ur', web: 'ur-PK' },
  sd:  { server: 'sd', web: 'sd-PK' },
  ps:  { server: 'ps', web: 'ps-AF' },
  pa:  { server: 'ur', web: 'ur-PK', approx: true },
  skr: { server: 'ur', web: 'ur-PK', approx: true },
  hno: { server: 'ur', web: 'ur-PK', approx: true },
  bal: { server: 'ur', web: 'ur-PK', approx: true }
};
// Set to false to NEVER read Punjabi/Saraiki/Hindko/Balochi in an Urdu voice (they become text only, with a note).
const ALLOW_APPROX_VOICE = true;

// server voice code -> time it last failed. Remembered in localStorage for 30 minutes, so after one failure (for example
// Google has no Pashto voice) the next tap says so at once instead of starting, failing and switching off a second later.
const TTS_DOWN_KEY = 'maweshiTtsDown';
const ttsDown = {};
try { Object.assign(ttsDown, JSON.parse(localStorage.getItem(TTS_DOWN_KEY) || '{}')); } catch (e) {}
const saveTtsDown = () => { try { localStorage.setItem(TTS_DOWN_KEY, JSON.stringify(ttsDown)); } catch (e) {} };
const serverDown = (code) => ttsDown[code] && Date.now() - ttsDown[code] < 30 * 60 * 1000;
if (window.speechSynthesis) speechSynthesis.getVoices();   // warms the browser's voice list

// Remove characters that corrupt speech: invisible/control characters, markdown marks, list numbers, foreign scripts.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200D-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uFFFC\uFFFD]/g;
function cleanForSpeech(rawText, base) {
  let s = String(rawText || '').replace(INVISIBLE, '');
  if (base !== 'en') s = s.replace(/[A-Za-z\u0900-\u097F]+/g, ' ');       // Latin and Devanagari cannot be read by these voices
  return s.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/gm, '').replace(/[*#_`>]/g, '').replace(/\n+/g, '. ').replace(/\s{2,}/g, ' ').trim();
}

// Short pieces, cut at sentence ends where possible (the server voice accepts only short text).
function makeChunks(text, max = 180) {
  const sentences = (text.match(/[^.!?۔؟]+[.!?۔؟]*\s*/g) || [text]).map((x) => x.trim()).filter(Boolean);   // no lookbehind: older phones
  const out = []; let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const sen of sentences) {
    if (sen.length > max) {                                              // very long sentence: cut at spaces
      push();
      for (const w of sen.split(/\s+/)) { if ((cur + ' ' + w).length > max) push(); cur += (cur ? ' ' : '') + w.slice(0, max); }
      push();
    } else if ((cur + ' ' + sen).length > max) { push(); cur = sen; }
    else cur += (cur ? ' ' : '') + sen;
  }
  push();
  return out;
}

function noVoice(myToken) {
  if (myToken !== undefined && myToken !== speakToken) return;
  stopSpeech();
  showBanner(t('voiceNA'), 'info');
}

function speak(rawText, btn) {
  if (btn && btn === speakBtn) { stopSpeech(); return; }   // second tap = stop
  stopSpeech();
  const base = currentLang.split('-')[0];
  const text = cleanForSpeech(rawText, base);
  if (!text) return;
  const v = TTS_VOICES[base] || TTS_VOICES.ur;
  if (v.approx && !ALLOW_APPROX_VOICE) { showBanner(t('voiceNA'), 'info'); return; }
  // Known to have no voice at all (server voice failed recently AND the browser has none): say so now, keep the text on screen.
  if (serverDown(v.server) && (!window.speechSynthesis || !hasWebVoice(v.web))) { showBanner(t('voiceNA'), 'info'); return; }
  hideBanner();

  const myToken = speakToken;
  speakBtn = btn;
  setSpeakUI(btn, true);
  const chunks = makeChunks(text);
  let i = 0;

  function next() {
    if (myToken !== speakToken) return;
    if (i >= chunks.length) { stopSpeech(); return; }
    if (serverDown(v.server)) { webSpeak(chunks.slice(i), v.web, myToken); return; }
    const idx = i++;
    const audio = new Audio(`/api/tts?q=${encodeURIComponent(chunks[idx])}&tl=${v.server}`);
    window.currentAudio = audio;
    let done = false, timer = null;
    const finish = () => { done = true; clearTimeout(timer); };
    const fail = (e) => {
      if (done || myToken !== speakToken) return;
      finish();
      if (e && e.name === 'NotAllowedError') { stopSpeech(); return; }   // browser blocked autoplay: not a voice problem
      ttsDown[v.server] = Date.now(); saveTtsDown();                     // remember, so the next tap goes straight to the fallback
      console.warn('Server voice failed for', v.server, e && (e.name || e.type));
      webSpeak(chunks.slice(idx), v.web, myToken);
    };
    audio.onended = () => { if (done) return; finish(); next(); };
    audio.onerror = fail;
    audio.onplaying = () => clearTimeout(timer);
    timer = setTimeout(() => fail(), 8000);                              // never started: treat as failed
    audio.play().catch(fail);
  }
  next();
}

// Fallback voice: the browser's built-in Web Speech API. A voice for the language may not be installed.
function hasWebVoice(webLang) {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voices.length) return true;                                       // list not loaded yet: try anyway
  const prefix = webLang.split('-')[0].toLowerCase();
  return voices.some((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(prefix));
}

function webSpeak(pieces, webLang, myToken) {
  if (myToken !== speakToken) return;
  if (!window.speechSynthesis || !pieces.length || !hasWebVoice(webLang)) { noVoice(myToken); return; }
  const prefix = webLang.split('-')[0].toLowerCase();
  const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(prefix));
  pieces.forEach((piece, n) => {
    const u = new SpeechSynthesisUtterance(piece);
    u.lang = webLang;
    if (voice) u.voice = voice;
    let started = false;
    u.onstart = () => { started = true; };
    if (n === pieces.length - 1) u.onend = () => { if (myToken === speakToken) stopSpeech(); };
    u.onerror = (e) => {
      if (myToken !== speakToken || e.error === 'canceled' || e.error === 'interrupted') return;
      console.warn('Browser voice error:', e.error);
      if (started) stopSpeech(); else noVoice(myToken);
    };
    speechSynthesis.speak(u);
  });
}
