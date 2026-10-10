let currentLang = 'ur-PK';
let photoFile = null;

async function shrinkImage(file, maxSide = 1024, quality = 0.7) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

function setPhoto(file) {
  photoFile = file;
  const preview = document.getElementById('preview');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
}

function previewImage(event) {
  const file = event.target.files[0];
  if (file) setPhoto(file);
}

function showScreen(id) {
  stopSpeech();
  document.querySelectorAll('.screen').forEach(el => el.hidden = el.id !== id);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.s === id));
  window.scrollTo(0, 0);
}

function pickOne(groupId, btnClass) {
  document.getElementById(groupId).addEventListener('click', e => {
    const b = e.target.closest('.' + btnClass); if (!b) return;
    document.querySelectorAll('#' + groupId + ' .' + btnClass).forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
}
const selected = (groupId) => (document.querySelector('#' + groupId + ' .on') || {}).dataset?.v;

function renderVets() {
  const matches = VETS.filter(v => v.langs.includes(currentLang.split('-')[0]));
  const list = matches.length ? matches : VETS.filter(v => v.langs.includes('ur'));
  const note = document.getElementById('vetNote');
  note.hidden = matches.length > 0;
  note.textContent = t('vetNone');
  document.getElementById('vetList').innerHTML = list.map(v => {
    const wa = v.phone.replace('+', '');
    const hrs = v.hours === '24' ? t('open24') : v.hours;
    return `<div class="vet"><h3 dir="ltr" style="text-align:start">${v.name}</h3>
      <p dir="ltr" style="text-align:start">${v.area}</p><p>${hrs}${v.home ? ' · ' + t('home') : ''}</p>
      <div class="acts"><a class="c" href="tel:${v.phone}">📞 ${t('call')}</a>
      <a class="w" href="https://wa.me/${wa}" target="_blank" rel="noopener">${t('wa')}</a></div></div>`;
  }).join('');
}

function setLang(code) {
  currentLang = code;
  const L = LANGS.find(l => l.code === code) || LANGS[0];
  document.documentElement.lang = code.split('-')[0];
  document.documentElement.dir = L.rtl ? 'rtl' : 'ltr';
  document.getElementById('langName').textContent = L.name;
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  document.querySelectorAll('#langGrid button').forEach(b => b.classList.toggle('on', b.dataset.c === code));
  renderVets();
  stopSpeech();
  document.querySelectorAll('[data-idle]').forEach(b => b.querySelector('.lbl').textContent = t(b.dataset.idle));
  ['aid', 'breed'].forEach(updateMicUI);
  document.getElementById('picker').hidden = true;
  try { localStorage.setItem('lang', code); } catch (e) {}
}

function openPicker() { document.getElementById('picker').hidden = false; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('langGrid').innerHTML = LANGS.map(l => `<button data-c="${l.code}">${l.name}</button>`).join('');
  document.getElementById('langGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLang(b.dataset.c); });
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.s)));
  pickOne('animals', 'animal'); pickOne('goals', 'goal');
  let saved = null; try { saved = localStorage.getItem('lang'); } catch (e) {}
  if (saved && LANGS.some(l => l.code === saved)) setLang(saved); else { setLang('ur-PK'); openPicker(); }
});
