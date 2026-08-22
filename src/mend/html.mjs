/** Shared HTML helpers. Everything rendered into the one-page view goes through escapeHtml. */

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Round for markup so geometry stays stable between runs and readable in a diff. */
export function num(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 10 ** decimals) / 10 ** decimals);
}

/** A caption is what a visualisation degrades to. It is never an empty box. */
export function caption(message, { flagged = false } = {}) {
  return `<p class="vcap${flagged ? ' flagged' : ''}">${escapeHtml(message)}</p>`;
}
