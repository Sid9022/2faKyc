const multer = require("multer");

function isAllowedVideoMimeType(mimeType = "") {
  const normalized = String(mimeType).toLowerCase();

  return (
    normalized.startsWith("video/webm") ||
    normalized.startsWith("video/mp4") ||
    normalized.startsWith("video/quicktime") ||
    normalized.startsWith("video/x-matroska")
  );
}

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    console.log("Incoming video MIME type:", file.mimetype);

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
