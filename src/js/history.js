// Case history. Saved ONLY in this phone's localStorage (animal, date, urgency, one-line summary). The last 3 cases go
// into the next prompt as short background text (api.js -> server). Nothing else is stored; no photo, no audio.
const CASES_KEY = 'maweshiCases';
const MAX_CASES = 20;
const URG_OK = ['green', 'yellow', 'red'];

const validCase = (c) => !!c && typeof c.animal === 'string' && typeof c.date === 'string' && typeof c.summary === 'string' && URG_OK.includes(c.urgency);

function loadCases() {
  try {
    const list = JSON.parse(localStorage.getItem(CASES_KEY) || '[]');
    return Array.isArray(list) ? list.filter(validCase) : [];
  } catch (e) { return []; }                 // storage blocked or data damaged: behave as "no history"
}
function storeCases(list) { try { localStorage.setItem(CASES_KEY, JSON.stringify(list.slice(0, MAX_CASES))); } catch (e) {} }

// The 3 most recent cases, trimmed, in the shape the server expects.
function recentCases(n = 3) {
  return loadCases().slice(0, n).map((c) => ({ animal: c.animal, date: c.date.slice(0, 10), urgency: c.urgency, summary: c.summary.slice(0, 80) }));
}

// One line: the first likely condition, otherwise the start of the spoken summary.
const oneLine = (d) => ((d.likely_conditions[0] && d.likely_conditions[0].name) || String(d.spoken_summary || '')).trim().slice(0, 80);

// Called after a successful answer. Photo retakes and clarifying questions are not cases, so they are not saved.
function recordCase(result, animal) {
  const d = result && result.data;
  if (!d || !validTriage(d) || needsRetake(d) || (d.needs_more_info && d.follow_up_question)) return;
  const summary = oneLine(d);
  if (!summary) return;
  storeCases([{ animal: animal || 'Cow', date: new Date().toISOString().slice(0, 10), urgency: d.urgency, summary }, ...loadCases()]);
}

function renderHistory() {
  const list = document.getElementById('histList');
  if (!list) return;
  const cases = loadCases();
  document.getElementById('histEmpty').hidden = cases.length > 0;
  document.getElementById('histClear').hidden = cases.length === 0;
  list.textContent = '';
  cases.forEach((c) => {
    const u = URGENCY_UI[c.urgency];
    const row = mk('div', 'case case-' + c.urgency);
    const head = mk('div', 'case-head');
    head.append(mk('b', '', `${u.icon} ${t(u.key)}`));
    const date = mk('span', 'case-date', c.date);
    date.dir = 'ltr';
    head.append(date);
    row.append(head, mk('p', 'case-animal', t(String(c.animal).toLowerCase())), mk('p', 'case-sum', c.summary));
    list.append(row);
  });
}

function clearHistory() { try { localStorage.removeItem(CASES_KEY); } catch (e) {} renderHistory(); }
