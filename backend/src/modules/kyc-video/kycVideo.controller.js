const {
  startVideoDeclaration,
  uploadVideoDeclaration,
  getVideoDeclarationWorkspace,
  getDevVideoDeclarations,
  getDevVideoAttempts
} = require("./kycVideo.service");

const { getRequestMeta } = require("../../utils/request.util");

async function loadVideoWorkspace(req, res) {
  try {
    const result = await getVideoDeclarationWorkspace(req.params.token);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Load video workspace error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load video declaration workspace"
    });
  }
}

async function startVideoSession(req, res) {
  try {
    const result = await startVideoDeclaration(
      req.params.token,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Start video declaration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start video declaration"
    });
  }
}

async function uploadVideo(req, res) {
  try {
    const result = await uploadVideoDeclaration(
      req.params.token,
      req.body,
      req.file,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Upload video declaration error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to upload video declaration"
    });
  }
}

async function listDevVideoDeclarations(req, res) {
  const declarations = await getDevVideoDeclarations();

  return res.json({
    success: true,
    declarations
  });
}

async function listDevVideoAttempts(req, res) {
  const attempts = await getDevVideoAttempts();

  return res.json({
    success: true,
    attempts
  });
}

module.exports = {
  loadVideoWorkspace,
  startVideoSession,
  uploadVideo,
  listDevVideoDeclarations,
  listDevVideoAttempts
};
