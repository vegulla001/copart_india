/** Pure, independently testable submission policy used by mobile and tests. */
const CHUNK_BYTES = 192 * 1024;
const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;
function delayForAttempt(attempt) {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}
function eligible(job, now) {
  return (job.status === 'queued' || job.status === 'retrying') && job.nextAttemptAt <= now;
}
function categoryFields(category) {
  const specs = {
    construction: [{key:'make', label:'Make'}, {key:'model', label:'Model'}, {key:'year', label:'Year'}],
    agriculture: [{key:'make', label:'Make'}, {key:'model', label:'Model'}, {key:'hours', label:'Engine hours'}]
  };
  return specs[category] || specs.construction;
}
function validateDraft(draft) {
  if (!draft.category || !['construction', 'agriculture'].includes(draft.category)) return 'Select a category';
  if (!String(draft.description || '').trim()) return 'Add an equipment condition description';
  if (!Array.isArray(draft.photos) || draft.photos.length === 0) return 'Add at least one photo';
  for (const photo of draft.photos) {
    if (!photo || !Number.isSafeInteger(photo.size) || photo.size < 1 || photo.size > 25 * 1024 * 1024) return 'Each photo must be between 1 byte and 25 MB';
  }
  for (const field of categoryFields(draft.category)) {
    if (!String(draft.fields?.[field.key] || '').trim()) return `Enter ${field.label}`;
  }
  return null;
}
module.exports = { CHUNK_BYTES, MAX_ATTEMPTS, delayForAttempt, eligible, categoryFields, validateDraft };
