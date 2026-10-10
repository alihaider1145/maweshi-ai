function speakText(containerId, langSelectId) {
  const container = document.getElementById(containerId);
  const langSelect = document.getElementById(langSelectId);

  if (!container || !container.innerText.trim()) {
    alert("پہلے جواب حاصل کریں۔ / No text available.");
    return;
  }

  const rawText = container.innerText;
  const selectedLang = langSelect ? langSelect.value : 'ur-PK';

  // Clean Markdown formatting symbols (*, #, -, numbers)
  const cleanText = rawText
    .replace(/[\*\#\-\_]/g, '')
    .replace(/[0-9]\./g, '')
    .trim();

  // Route language codes
  let langCode = 'ur'; // Covers Urdu, Hindko, Balochi, Saraiki, Punjabi
  if (selectedLang.startsWith('en')) {
    langCode = 'en';
  } else if (selectedLang.startsWith('sd')) {
    langCode = 'sd';
  } else if (selectedLang.startsWith('ps')) {
    langCode = 'ps';
  }

  // Stop any active playing audio
  if (window.currentAudio) {
    window.currentAudio.pause();
    window.currentAudio = null;
  }

  // Split text into chunks (max 180 chars)
  const textChunks = cleanText.match(/.{1,180}(\s|$)/g) || [cleanText];
  let currentChunkIndex = 0;

  function playNextChunk() {
    if (currentChunkIndex >= textChunks.length) return;

    const chunk = textChunks[currentChunkIndex].trim();
    if (!chunk) {
      currentChunkIndex++;
      playNextChunk();
      return;
    }

    // Direct request to Netlify proxy function
    const audioUrl = `/api/tts?q=${encodeURIComponent(chunk)}&tl=${langCode}`;

    const audio = new Audio(audioUrl);
    window.currentAudio = audio;

    audio.onended = () => {
      currentChunkIndex++;
      playNextChunk();
    };

    audio.onerror = (e) => {
      console.error("Audio proxy playback error:", e);
    };

    audio.play().catch(err => console.warn("Playback prevented:", err));
  }

  playNextChunk();
}