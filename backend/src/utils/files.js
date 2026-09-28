const path = require('node:path');

const PDF_MAGIC = Buffer.from('%PDF-');

/** Keep only a safe display name: no directories, no control or shell characters. */
function sanitizeFilename(name, fallback = 'resume.pdf') {
  const base = path.basename(String(name || '')).normalize('NFKC');
  const cleaned = base
    .replace(/[^\w.\- ()]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[.\s]+/, '')
    .slice(0, 100)
    .trim();
  return cleaned || fallback;
}

/** Check the file signature instead of trusting the client-provided MIME type or extension. */
function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  // The header must appear within the first 1024 bytes per the PDF spec.
  const head = buffer.subarray(0, Math.min(1024, buffer.length));
  return head.indexOf(PDF_MAGIC) !== -1;
}

/** Normalise extracted text: strip control characters and collapse whitespace. */
function cleanExtractedText(text) {
  return String(text || '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/-- \d+ of \d+ --/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sanitizeFilename, hasPdfSignature, cleanExtractedText };
