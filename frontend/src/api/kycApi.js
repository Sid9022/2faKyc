import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export async function openKycLink(token) {
  const response = await api.get(`/api/public/kyc/${token}`);
  return response.data;
}

export async function submitKycConsent(token, payload) {
  const response = await api.post(`/api/public/kyc/${token}/consent`, payload);
  return response.data;
}

export async function getKycDocuments(token) {
  const response = await api.get(`/api/public/kyc/${token}/documents`);
  return response.data;
}

export async function saveKycDocument(token, requirementId, formData) {
  const response = await api.post(
    `/api/public/kyc/${token}/documents/${requirementId}/save`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return response.data;
}

export async function saveKycDocumentProgress(token, currentStepIndex) {
  const response = await api.post(`/api/public/kyc/${token}/documents/progress`, {
    currentStepIndex
  });

  return response.data;
}

export async function finalSubmitKycDocuments(token) {
  const response = await api.post(
    `/api/public/kyc/${token}/documents/final-submit`
  );

  return response.data;
}

export async function getKycVideoWorkspace(token) {
  const response = await api.get(`/api/public/kyc/${token}/video`);
  return response.data;
}

export async function startKycVideoDeclaration(token, payload) {
  const response = await api.post(`/api/public/kyc/${token}/video/start`, payload);
  return response.data;
}

export async function uploadKycVideoDeclaration(token, formData) {
  const response = await api.post(`/api/public/kyc/${token}/video/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    timeout: 120000
  });

  return response.data;
}

const reviewerHeaders = {
  "x-reviewer-id": "reviewer-001",
  "x-reviewer-name": "Aryan Reviewer"
};

export async function getReviewerCases(status = "") {
  const query = status ? `?status=${status}` : "";

  const response = await api.get(`/api/reviewer/kyc-cases${query}`, {
    headers: reviewerHeaders
  });

  return response.data;
}

export async function getReviewerCaseDetail(kycId) {
  const response = await api.get(`/api/reviewer/kyc-cases/${kycId}`, {
    headers: reviewerHeaders
  });

  return response.data;
}

export async function reviewDocumentSubmission(submissionId, payload) {
  const response = await api.post(
    `/api/reviewer/documents/${submissionId}/review`,
    payload,
    {
      headers: reviewerHeaders
    }
  );

  return response.data;
}

export async function reviewVideoDeclaration(declarationId, payload) {
  const response = await api.post(
    `/api/reviewer/video/${declarationId}/review`,
    payload,
    {
      headers: reviewerHeaders
    }
  );

  return response.data;
}

export async function applyKycFinalDecision(kycId, payload) {
  const response = await api.post(
    `/api/reviewer/kyc-cases/${kycId}/final-decision`,
    payload,
    {
      headers: reviewerHeaders
    }
  );

  return response.data;
}
