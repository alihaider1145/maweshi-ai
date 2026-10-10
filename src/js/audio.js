let speakToken = 0, speakBtn = null;

function setSpeakUI(btn, playing) {
  if (!btn) return;
  btn.classList.toggle('playing', playing);
  btn.querySelector('.ico').textContent = playing ? '⏹' : '🔊';
  btn.querySelector('.lbl').textContent = t(playing ? 'stop' : (btn.dataset.idle || 'listen'));
}

function stopSpeech() {
  speakToken++;
  if (window.currentAudio) { window.currentAudio.pause(); window.currentAudio = null; }
  setSpeakUI(speakBtn, false);
  speakBtn = null;
}

function speakText(containerId, btn) {
  const container = document.getElementById(containerId);
  speak(container ? container.innerText : '', btn);
}

function speakHelp(key, btn) { speak(t(key), btn); }

function speak(rawText, btn) {
  if (btn && btn === speakBtn) { stopSpeech(); return; }   // second tap = stop
  stopSpeech();
  const cleanText = (rawText || '').replace(/[\*\#\-\_]/g, '').replace(/[0-9]\./g, '').trim();
  if (!cleanText) return;

  // Google TTS has no Balochi, Hindko, Saraiki or Shahmukhi-Punjabi voice, so those use the Urdu voice (MVP).
  const base = currentLang.split('-')[0];
  const langCode = ['en', 'sd', 'ps'].includes(base) ? base : 'ur';

  const myToken = speakToken;
  speakBtn = btn;
  setSpeakUI(btn, true);
  const chunks = cleanText.match(/.{1,180}(\s|$)/g) || [cleanText];
  let i = 0;
  function next() {
    if (myToken !== speakToken) return;
    if (i >= chunks.length) { stopSpeech(); return; }
    const chunk = chunks[i++].trim();
    if (!chunk) return next();
    const audio = new Audio(`/api/tts?q=${encodeURIComponent(chunk)}&tl=${langCode}`);
    window.currentAudio = audio;
    audio.onended = next;
    audio.onerror = () => { if (myToken === speakToken) stopSpeech(); };
    audio.play().catch(() => { if (myToken === speakToken) stopSpeech(); });
  }
  next();
}
