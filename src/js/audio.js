function speakText(containerId, langSelectId) {
  const rawText = document.getElementById(containerId).innerText;
  const selectedLang = document.getElementById(langSelectId).value;

  if (!rawText.trim()) {
    alert("پہلے جواب حاصل کریں۔");
    return;
  }

  const cleanText = rawText
    .replace(/[\*\#\-\_]/g, '')
    .replace(/[0-9]\./g, '')
    .trim();

  let langCode = 'ur';
  if (selectedLang.startsWith('sd')) {
    langCode = 'sd';
  }

  if (window.currentAudio) {
    window.currentAudio.pause();
    window.currentAudio = null;
  }

  const textChunks = cleanText.match(/.{1,180}(\s|$)/g) || [cleanText];
  let currentChunkIndex = 0;

  function playNextChunk() {
    if (currentChunkIndex >= textChunks.length) return;

    const chunk = encodeURIComponent(textChunks[currentChunkIndex]);
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${chunk}&tl=${langCode}&client=tw-ob`;

    const audio = new Audio(audioUrl);
    window.currentAudio = audio;

    audio.onended = () => {
      currentChunkIndex++;
      playNextChunk();
    };

    audio.onerror = () => {
      fallbackSpeechSynthesis(cleanText);
    };

    audio.play().catch(() => {
      fallbackSpeechSynthesis(cleanText);
    });
  }

  playNextChunk();
}

function fallbackSpeechSynthesis(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ur-PK';
    window.speechSynthesis.speak(utterance);
  }
}