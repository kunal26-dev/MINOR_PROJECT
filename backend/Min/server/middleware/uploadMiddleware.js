const multer = require('multer');
const AppError = require('../utils/appError');
const { ALLOWED_FILE_TYPES, getExtension } = require('../utils/fileHelpers');

const maxSizeMb = Number(process.env.MAX_FILE_SIZE_MB) > 0 ? Number(process.env.MAX_FILE_SIZE_MB) : 20;

// Validate both the extension and the MIME type
const fileFilter = (req, file, cb) => {
  const ext = getExtension(file.originalname);
  const allowedMimes = ALLOWED_FILE_TYPES[ext];
  if (!allowedMimes) {
    return cb(
      new AppError(
        `Unsupported file format ".${ext}". Allowed: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}`,
        400
      )
    );
  }
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new AppError(`File type "${file.mimetype}" does not match the .${ext} extension`, 400));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: maxSizeMb * 1024 * 1024, files: 1 },
});

// Expects the file in the multipart/form-data field named "file"
const uploadSingle = upload.single('file');

const pdfFilter = (req, file, cb) => {
  const ext = getExtension(file.originalname);
  if (ext !== 'pdf' || file.mimetype !== 'application/pdf') {
    return cb(new AppError('Only PDF files are allowed', 400));
  }
  cb(null, true);
};

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: pdfFilter,
  limits: { fileSize: maxSizeMb * 1024 * 1024, files: 1 },
});

const uploadPdfSingle = pdfUpload.single('file');

module.exports = { uploadSingle, uploadPdfSingle, maxSizeMb };
