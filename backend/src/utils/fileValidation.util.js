const fs = require("fs");

/**
 * Magic-byte validation. The client-supplied MIME type is untrusted;
 * we read the actual file header and verify it matches an allowed type.
 */

function readHeader(filePath, length = 16) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function detectImageOrPdf(header) {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (header.length >= 5 && header.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  return null;
}

function detectVideo(header) {
  // EBML header => webm/mkv
  if (
    header.length >= 4 &&
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    return "video/webm";
  }

  // ISO BMFF: bytes 4-8 are "ftyp" => mp4/mov
  if (header.length >= 8 && header.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }

  return null;
}

function validateDocumentFile(filePath) {
  const detected = detectImageOrPdf(readHeader(filePath));
  return {
    isValid: Boolean(detected),
    detectedType: detected
  };
}

function validateVideoFile(filePath) {
  const detected = detectVideo(readHeader(filePath));
  return {
    isValid: Boolean(detected),
    detectedType: detected
  };
}

module.exports = {
  validateDocumentFile,
  validateVideoFile
};
