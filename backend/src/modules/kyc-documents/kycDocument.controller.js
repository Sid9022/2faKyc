const {
  getDocumentWorkspace,
  saveDocumentStep,
  updateDocumentProgress,
  finalSubmitDocuments,
  getDevDocumentSubmissions,
  getDevDocumentProgress
} = require("./kycDocument.service");

function getRequestMeta(req) {
  return {
    ipAddress:
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null,
    userAgent: req.headers["user-agent"] || null
  };
}

async function loadDocuments(req, res) {
  try {
    const result = await getDocumentWorkspace(req.params.token);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Load documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load document workspace"
    });
  }
}

async function saveDocument(req, res) {
  try {
    const result = await saveDocumentStep(
      req.params.token,
      req.params.requirementId,
      req.body,
      req.files,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Save document error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to save document"
    });
  }
}

async function saveProgress(req, res) {
  try {
    const result = await updateDocumentProgress(
      req.params.token,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Save progress error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save document progress"
    });
  }
}

async function finalSubmit(req, res) {
  try {
    const result = await finalSubmitDocuments(
      req.params.token,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Final submit documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to final submit documents"
    });
  }
}

async function listDevDocumentSubmissions(req, res) {
  const submissions = await getDevDocumentSubmissions();

  return res.json({
    success: true,
    submissions
  });
}

async function listDevDocumentProgress(req, res) {
  const progress = await getDevDocumentProgress();

  return res.json({
    success: true,
    progress
  });
}

module.exports = {
  loadDocuments,
  saveDocument,
  saveProgress,
  finalSubmit,
  listDevDocumentSubmissions,
  listDevDocumentProgress
};
