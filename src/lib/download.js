/**
 * Triggers a browser download for a Blob and revokes the temporary URL.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Picks the right file extension for a recorded blob.
 *
 * Browsers cannot mux MP4 in JavaScript without a library, so Safari's MP4
 * recording is downloaded as .mp4 and everything else as .webm.
 */
export function extensionForBlob(blob) {
  const type = blob?.type || '';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Builds a safe, human-readable download filename. */
export function recordingFilename(beatId, extension, video) {
  const kind = video ? 'video' : 'audio';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `yougotbars-${kind}-${beatId || 'session'}-${stamp}.${extension}`;
}
