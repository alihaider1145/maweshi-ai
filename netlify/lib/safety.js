// Code-level safety rules. The prompt asks the model to follow them; this file ENFORCES them, so we do not
// rely on the model alone.
//
// NEEDS VET REVIEW: every list and rule in this file is a conservative draft written by developers, not by a
// veterinarian. It lowers risk; it does not make the app safe for real-world use.

// Codes the model must report in `emergency_signs`. ANY of them forces urgency = "red" in code.
const EMERGENCY_SIGNS = [
  'cannot_stand',          // cannot stand / lying down and not getting up
  'heavy_bleeding',
  'breathing_difficulty',
  'bloated_belly',         // swollen or bloated abdomen
  'collapse_or_fits',
  'sudden_death_or_many_sick',
  'fmd_signs',             // mouth/feet blisters with drooling or limping (possible foot-and-mouth disease)
  'lumpy_skin_signs',      // firm skin lumps with fever (possible lumpy skin disease)
  'anthrax_signs'          // sudden death with bleeding from body openings (possible anthrax)
];

// If the model reported any emergency sign, urgency becomes red no matter what else it said.
function enforceUrgency(data) {
  const signs = (data.emergency_signs || []).filter((s) => EMERGENCY_SIGNS.includes(s));
  data.emergency_signs = signs;
  if (signs.length && data.urgency !== 'red') data.urgency = 'red';
  return data;
}

// Best-effort denylist: medicine names and dose patterns must never reach the farmer.
// It only covers names we thought of, in English and common Urdu spellings. It is a safety net, not a guarantee.
const DRUG_WORDS = [
  'oxytetracycline', 'tetracycline', 'penicillin', 'amoxicillin', 'ampicillin', 'ceftriaxone', 'enrofloxacin', 'ciprofloxacin',
  'streptomycin', 'gentamicin', 'tylosin', 'sulfa', 'sulpha', 'ivermectin', 'albendazole', 'levamisole', 'fenbendazole',
  'oxytocin', 'diclofenac', 'meloxicam', 'ketoprofen', 'flunixin', 'paracetamol', 'ibuprofen', 'aspirin', 'dexamethasone',
  'prednisolone', 'antibiotic', 'painkiller', 'steroid', 'dewormer'
];
const DRUG_ARABIC = [
  'اینٹی بائیوٹک', 'اینٹی بایوٹک', 'پینسلین', 'ٹیٹراسائیکلین', 'آکسی ٹیٹرا', 'آئیورمیکٹن', 'پیراسیٹامول', 'ڈیکسامیتھاسون',
  'ملی گرام', 'ملی لیٹر', 'ایم ایل', 'ایم جی', 'ملي ګرام', 'ملي ليټر', 'ملي گرام'
];
const LATIN_RE = new RegExp(`\\b(?:${DRUG_WORDS.join('|')})`, 'i');
const DOSE_RE = /\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg|cc|iu|gm|kg\/|units?)\b/i;

// Returns a short reason if any text looks like a medicine name or a dose, otherwise null.
function unsafeMedical(texts) {
  for (const raw of texts) {
    const s = String(raw || '');
    if (LATIN_RE.test(s)) return 'medicine name (latin)';
    if (DOSE_RE.test(s)) return 'dose pattern';
    for (const w of DRUG_ARABIC) if (s.includes(w)) return 'medicine/dose word (arabic script)';
  }
  return null;
}

module.exports = { EMERGENCY_SIGNS, enforceUrgency, unsafeMedical };
