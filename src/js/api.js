function getLanguagePromptName(langCode) {
  switch(langCode) {
    case 'en-US':
      return "English language";
    case 'hno-PK':
      return "Hindko language (written strictly in Shahmukhi / Arabic-based script)";
    case 'bal-PK':
      return "Balochi language (written strictly in Balochi Arabic script)";
    case 'pa-PK':
      return "Punjabi language (in Shahmukhi/Arabic script)";
    case 'ps-PK':
      return "Pashto language (in Pashto script)";
    case 'sd-PK':
      return "Sindhi language (in Sindhi Arabic script)";
    case 'skr-PK':
      return "Saraiki language (in Arabic/Urdu script)";
    default:
      return "simple Urdu language (in Urdu script)";
  }
}

async function analyzeInjury() {
  const fileInput = document.getElementById('injuryImage');
  const animalType = document.getElementById('animalType').value;
  const selectedLang = document.getElementById('voiceLangFirstAid').value;
  const loader = document.getElementById('firstAidLoader');
  const outputCard = document.getElementById('firstAidCard');
  const outputDiv = document.getElementById('firstAidOutput');

  if (!fileInput.files[0]) {
    alert("براہ کرم پہلے تصویر منتخب کریں۔");
    return;
  }

  loader.style.display = 'block';
  outputCard.style.display = 'none';

  try {
    const file = fileInput.files[0];
    const base64Data = await shrinkImage(file);

    const langName = getLanguagePromptName(selectedLang);

    const prompt = `You are a livestock care specialist for farmers.
    Target Language: ${langName}

    CRITICAL INSTRUCTIONS:
    - If Target Language is English, respond purely in clear English.
    - If Target Language is not English, respond STRICTLY in ${langName}. DO NOT output any English letters, Latin script, or bracketed English terms. Transliterate all veterinary or medical terms into the local script.
    Format your response clearly using Markdown:
    1. **بیماری یا زخم کی ممکنہ وجہ**
    2. **فوری ابتدائی طبی امداد**
    3. **احتیاط اور صفائی**
    4. **ڈاکٹر سے مشورہ**`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
        ]
      }]
    };

    const response = await fetch('/api/analyze-injury', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 150) || 'Server error'); }
    if (response.ok && result.candidates) {
      const text = result.candidates[0].content.parts[0].text;
      outputDiv.innerHTML = marked.parse(text);
      outputCard.style.display = 'block';
    } else {
      throw new Error(result.error || "خطا پیش آگئی");
    }
  } catch (err) {
    alert("خرابی: " + err.message);
  } finally {
    loader.style.display = 'none';
  }
}

async function recommendBreeding() {
  const inventory = document.getElementById('inventory').value;
  const goal = document.getElementById('targetGoal').value;
  const selectedLang = document.getElementById('voiceLangBreeding').value;
  const loader = document.getElementById('breedingLoader');
  const outputCard = document.getElementById('breedingCard');
  const outputDiv = document.getElementById('breedingOutput');

  if (!inventory.trim()) {
    alert("براہ کرم اپنے پاس موجود جانوروں کے نام لکھیں۔");
    return;
  }

  loader.style.display = 'block';
  outputCard.style.display = 'none';

  try {
    const langName = getLanguagePromptName(selectedLang);
    const prompt = `You are an expert livestock breeding consultant for local Pakistani farmers.
Available Livestock: ${inventory}
Farmer Goal: ${goal}

CRITICAL INSTRUCTION: Respond STRICTLY in ${langName}. DO NOT include any English alphabets.

Format using Markdown:
1. **بہترین جوڑا**
2. **آنے والے بچے کے فوائد**
3. **ضروری احتیاط**`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch('/api/recommend-breeding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 150) || 'Server error'); }
    if (response.ok && result.candidates) {
      const text = result.candidates[0].content.parts[0].text;
      outputDiv.innerHTML = marked.parse(text);
      outputCard.style.display = 'block';
    } else {
      throw new Error(result.error || "خطا پیش آگئی");
    }
  } catch (err) {
    alert("خرابی: " + err.message);
  } finally {
    loader.style.display = 'none';
  }
}