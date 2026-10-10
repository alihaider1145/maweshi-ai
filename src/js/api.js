// The browser sends only plain inputs; the server builds the prompt and calls Gemini.
async function callApi(endpoint, body, ui) {
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
    if (!response.ok || !result.text) throw new Error(result.error || 'Request failed');
    document.getElementById(ui.out).innerHTML = marked.parse(result.text);
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
  if (!photoFile) { alert(t('errPhoto')); return; }
  let image;
  try { image = await shrinkImage(photoFile); } catch (e) { console.error(e); alert(t('errGeneric')); return; }
  callApi('/api/analyze-injury',
    { animal: selected('animals') || 'Cow', lang: currentLang, image, audio: recordings.aid ? recordings.aid.b64 : undefined },
    { loader: 'firstAidLoader', card: 'firstAidCard', out: 'firstAidOutput' });
}

async function recommendBreeding() {
  const inventory = document.getElementById('inventory').value.trim();
  if (!inventory && !recordings.breed) { alert(t('errText')); return; }
  callApi('/api/recommend-breeding',
    { inventory, goal: selected('goals'), lang: currentLang, audio: recordings.breed ? recordings.breed.b64 : undefined },
    { loader: 'breedingLoader', card: 'breedingCard', out: 'breedingOutput' });
}
