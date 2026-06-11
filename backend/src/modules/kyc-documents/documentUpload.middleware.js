const multer = require("multer");
const { ensureTmpDir, generateStoredName } = require("../../utils/fileStorage.util");

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
];

/**
 * Disk storage: files stream to uploads/tmp instead of buffering in RAM.
 * Real content validation (magic bytes) happens in the service after upload;
 * the MIME check here is only a cheap early filter.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureTmpDir()),
    filename: (req, file, cb) => cb(null, generateStoredName(file.originalname))
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG, WEBP, and PDF files are allowed.")
      );
    }

    cb(null, true);
  }
});

module.exports = upload;
