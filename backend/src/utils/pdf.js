const { PDFParse, PasswordException, InvalidPDFException } = require('pdf-parse');
const AppError = require('./AppError');
const { cleanExtractedText } = require('./files');

const MAX_PAGES = 10;
const MIN_TEXT_CHARS = 100;

/**
 * Extract text from a PDF buffer. Rejects encrypted, corrupt, image-only and empty PDFs
 * with user-facing messages. Parsing runs in pdf.js (no code execution from the PDF).
 */
async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const result = await parser.getText({ first: MAX_PAGES, pageJoiner: '' });
    const text = cleanExtractedText(result.text);
    if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
      throw AppError.validation(
        'Could not extract readable text from this PDF. Scanned or image-only resumes are not supported — please upload a text-based PDF.',
      );
    }
    return { text, pageCount: result.total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof PasswordException || err?.name === 'PasswordException') {
      throw AppError.validation('Password-protected PDFs are not supported.');
    }
    if (err instanceof InvalidPDFException || err?.name === 'InvalidPDFException') {
      throw AppError.validation('The file is not a valid PDF or is corrupted.');
    }
    throw AppError.validation('The PDF could not be read. Please export it again and retry.');
  } finally {
    await parser.destroy().catch(() => {});
  }
}

module.exports = { extractPdfText, MAX_PAGES };
