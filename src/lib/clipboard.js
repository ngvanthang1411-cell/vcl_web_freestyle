/**
 * Clipboard helper with a fallback for non-secure contexts.
 *
 * navigator.clipboard is only exposed on HTTPS / localhost. On plain HTTP over
 * a LAN IP the API is missing, so we fall back to a hidden textarea plus
 * document.execCommand('copy').
 *
 * @param {string} text
 * @returns {Promise<boolean>} true if the text was copied.
 */
export async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }

  if (typeof document === 'undefined' || !document.body) return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
