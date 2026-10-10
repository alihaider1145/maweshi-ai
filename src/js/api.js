const PROMPT_LANG = {
  'en-US': 'English',
  'hno-PK': 'Hindko (written strictly in Shahmukhi / Arabic-based script)',
  'bal-PK': 'Balochi (written strictly in Balochi Arabic script)',
  'pa-PK': 'Punjabi (in Shahmukhi/Arabic script)',
  'ps-PK': 'Pashto (in Pashto script)',
  'sd-PK': 'Sindhi (in Sindhi Arabic script)',
  'skr-PK': 'Saraiki (in Arabic/Urdu script)',
  'ur-PK': 'simple Urdu (in Urdu script)'
};

const LANG_RULE = (lang) => lang === 'en-US'
  ? 'Respond in clear, simple English.'
  : `Respond STRICTLY in ${PROMPT_LANG[lang]}. Do NOT output English letters or Latin script. Transliterate veterinary terms into the local script.`;

async function callGemini(endpoint, parts, ui) {
  const loader = document.getElementById(ui.loader);
  const card = document.getElementById(ui.card);
  loader.style.display = 'block';
  card.style.display = 'none';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 150) || 'Server error'); }
    if (!response.ok || !result.candidates) throw new Error(result.error || t('errGeneric'));
    document.getElementById(ui.out).innerHTML = marked.parse(result.candidates[0].content.parts[0].text);
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    alert(t('errGeneric'));
  } finally {
    loader.style.display = 'none';
  }
}

async function analyzeInjury() {
  const file = photoFile;
  if (!file) { alert(t('errPhoto')); return; }
  const animal = selected('animals') || 'Cow';
  const prompt = `You are a livestock care specialist helping a farmer with a sick ${animal}.
${LANG_RULE(currentLang)}
Use short, simple sentences a farmer with no schooling can follow. Use these four numbered section headings, translated into the response language:
1. Likely cause of the illness or wound
2. Immediate first aid
3. Cleanliness and precautions
4. When to call a vet${recordings.aid ? '\nThe farmer also recorded a voice message in their own language describing what is wrong. Listen to it carefully and use it together with the photo.' : ''}`;
  const data = await shrinkImage(file);
  const parts = [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data } }];
  if (recordings.aid) parts.push({ inline_data: { mime_type: 'audio/wav', data: recordings.aid.b64 } });
  callGemini('/api/analyze-injury', parts,
    { loader: 'firstAidLoader', card: 'firstAidCard', out: 'firstAidOutput' });
}

async function recommendBreeding() {
  const inventory = document.getElementById('inventory').value.trim();
  if (!inventory && !recordings.breed) { alert(t('errText')); return; }
  const prompt = `You are an expert livestock breeding consultant for Pakistani farmers.
Available livestock: ${inventory || '(see the voice message)'}${recordings.breed ? '\nThe farmer also recorded a voice message in their own language describing their animals and needs. Listen to it and use it.' : ''}
Farmer goal: ${selected('goals')}
${LANG_RULE(currentLang)}
Use short, simple sentences. Use these three numbered section headings, translated into the response language:
1. Best pairing
2. Benefits for the offspring
3. Important precautions`;
  const parts = [{ text: prompt }];
  if (recordings.breed) parts.push({ inline_data: { mime_type: 'audio/wav', data: recordings.breed.b64 } });
  callGemini('/api/recommend-breeding', parts,
    { loader: 'breedingLoader', card: 'breedingCard', out: 'breedingOutput' });
}
