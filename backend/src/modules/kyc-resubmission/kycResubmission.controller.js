const {
  getResubmissionWorkspace
} = require("./kycResubmission.service");

async function loadResubmissionWorkspace(req, res) {
  try {
    const result = await getResubmissionWorkspace(req.params.token);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Load resubmission workspace error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load resubmission workspace"
    });
  }
}

module.exports = {
  loadResubmissionWorkspace
};
