const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(os.tmpdir(), 'prepai-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });

/**
 * Resume uploads go to a private temp directory under a random name (the client's
 * filename is never used as a path). The controller verifies the PDF signature and
 * always deletes the temp file after processing.
 */
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.upload`),
});

const uploader = multer({
  storage,
  limits: { fileSize: config.upload.maxBytes, files: 1, fields: 5, parts: 6 },
  fileFilter: (_req, file, cb) => {
    const extOk = path.extname(file.originalname || '').toLowerCase() === '.pdf';
    const mimeOk = ['application/pdf', 'application/x-pdf'].includes(file.mimetype);
    if (!extOk || !mimeOk) return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF files are accepted.'));
    return cb(null, true);
  },
});

function singlePdf(field) {
  const mw = uploader.single(field);
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(413, 'FILE_TOO_LARGE', `File is too large. Maximum size is ${Math.round(config.upload.maxBytes / 1048576)} MB.`));
        }
        return next(AppError.badRequest(`Upload error: ${err.message}`));
      }
      return next(err);
    });
}

async function removeTempFile(file) {
  if (file?.path && file.path.startsWith(UPLOAD_DIR)) {
    await fs.promises.rm(file.path, { force: true }).catch(() => {});
  }
}

module.exports = { singlePdf, removeTempFile, UPLOAD_DIR };
