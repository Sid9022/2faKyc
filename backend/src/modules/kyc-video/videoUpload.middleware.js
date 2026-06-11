const multer = require("multer");
const { ensureTmpDir, generateStoredName } = require("../../utils/fileStorage.util");

function isAllowedVideoMimeType(mimeType = "") {
  const normalized = String(mimeType).toLowerCase();

  return (
    normalized.startsWith("video/webm") ||
    normalized.startsWith("video/mp4") ||
    normalized.startsWith("video/quicktime") ||
    normalized.startsWith("video/x-matroska")
  );
}

/**
 * Disk storage: an 80 MB video no longer occupies 80 MB of heap.
 * Magic-byte validation happens in the service after upload.
 */
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureTmpDir()),
    filename: (req, file, cb) => cb(null, generateStoredName(file.originalname))
  }),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedVideoMimeType(file.mimetype)) {
      return cb(
        new Error(
          `Invalid video type: ${file.mimetype}. Only WEBM, MP4, and MOV video files are allowed.`
        )
      );
    }

    cb(null, true);
  }
});

module.exports = uploadVideo;
