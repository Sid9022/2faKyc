const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const TMP_DIR = path.join(UPLOAD_ROOT, "tmp");

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

function safeFileName(name = "file") {
  const ext = path.extname(name).slice(0, 10);
  const base = path
    .basename(name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);

  return `${base || "file"}${ext}`;
}

function generateStoredName(originalName) {
  return `${Date.now()}-${crypto.randomUUID()}-${safeFileName(originalName)}`;
}

/**
 * Computes sha256 of a file on disk without loading it fully into memory.
 */
async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Moves a temp upload into its final folder. Falls back to copy+unlink
 * if rename crosses devices.
 */
async function moveIntoPlace(tempPath, finalDir, storedName) {
  await fsp.mkdir(finalDir, { recursive: true });
  const finalPath = path.join(finalDir, storedName);

  try {
    await fsp.rename(tempPath, finalPath);
  } catch (error) {
    if (error.code === "EXDEV") {
      await fsp.copyFile(tempPath, finalPath);
      await fsp.unlink(tempPath);
    } else {
      throw error;
    }
  }

  return finalPath;
}

async function removeQuietly(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    // already gone / never created — fine
  }
}

/**
 * Cleans up every temp file multer created for a request.
 * Call on every validation-failure exit path.
 */
async function cleanupRequestFiles(files) {
  const all = [];

  if (!files) return;

  if (Array.isArray(files)) {
    all.push(...files);
  } else if (files.path) {
    all.push(files);
  } else {
    for (const slotFiles of Object.values(files)) {
      all.push(...slotFiles);
    }
  }

  await Promise.all(all.map((file) => removeQuietly(file.path)));
}

module.exports = {
  UPLOAD_ROOT,
  ensureTmpDir,
  safeFileName,
  generateStoredName,
  hashFile,
  moveIntoPlace,
  removeQuietly,
  cleanupRequestFiles
};
