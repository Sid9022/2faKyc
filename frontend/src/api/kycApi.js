import axios from "axios";

// API base URL resolution:
//   1. If VITE_API_BASE_URL is defined (even as an empty string), use it
//      exactly. An explicit empty value means "use relative URLs" — i.e.
//      rely on the Vite dev proxy or a production reverse proxy.
//   2. Otherwise, in dev, fall back to http://localhost:5000 so the form
//      works without a proxy on the same machine.
//   3. Otherwise, in production, fall back to a relative URL (assumes a
//      reverse proxy forwards /api to the backend).
function resolveApiBaseUrl() {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === "string") return fromEnv;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return "";
}

export const API_BASE_URL = resolveApiBaseUrl();

const AUTH_STORAGE_KEY = "kyc_auth_v1";

// ---------- auth storage ----------

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth) {
  if (auth) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  window.dispatchEvent(new Event("kyc-auth-changed"));
}

export function getCurrentUser() {
  return getStoredAuth()?.user || null;
}

export function getAccessToken() {
  return getStoredAuth()?.accessToken || null;
}

// ---------- axios instance with auth + refresh ----------

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

async function tryRefresh() {
  const auth = getStoredAuth();
  if (!auth?.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/api/auth/refresh`, {
        refreshToken: auth.refreshToken
      })
      .then((response) => {
        if (response.data?.success) {
          const next = {
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken,
            user: response.data.user
          };
          setStoredAuth(next);
          return next;
        }
        setStoredAuth(null);
        return null;
      })
      .catch(() => {
        setStoredAuth(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retried &&
      getStoredAuth()?.refreshToken &&
      !String(original.url).includes("/api/auth/")
    ) {
      original._retried = true;
      const refreshed = await tryRefresh();

      if (refreshed) {
        original.headers.Authorization = `Bearer ${refreshed.accessToken}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  }
);

// ---------- media URL helpers ----------

/**
 * Buyer media: the link token inside the path is the authorization.
 */
export function buyerMediaUrl(relativePath) {
  return relativePath ? `${API_BASE_URL}${relativePath}` : null;
}

/**
 * Reviewer media: <img>/<video> tags cannot send Authorization headers,
 * so the access token rides along as a query parameter.
 */
export function reviewerMediaUrl(relativePath) {
  if (!relativePath) return null;
  const token = getAccessToken();
  return `${API_BASE_URL}${relativePath}?access_token=${encodeURIComponent(token || "")}`;
}

// ---------- auth APIs ----------

export async function login(email, password) {
  const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
    email,
    password
  });

  if (response.data?.success) {
    setStoredAuth({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      user: response.data.user
    });
  }

  return response.data;
}

export async function logout() {
  const auth = getStoredAuth();

  try {
    if (auth?.refreshToken) {
      await axios.post(`${API_BASE_URL}/api/auth/logout`, {
        refreshToken: auth.refreshToken
      });
    }
  } finally {
    setStoredAuth(null);
  }
}

// ---------- buyer (public) APIs ----------

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
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000
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
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });

  return response.data;
}

export async function getKycResubmissionWorkspace(token) {
  const response = await api.get(`/api/public/kyc/${token}/resubmission`);
  return response.data;
}

// ---------- reviewer APIs ----------

export async function getReviewerCases(status = "", pan = "") {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (pan) params.set("pan", pan);
  const query = params.toString();

  const response = await api.get(`/api/reviewer/kyc-cases${query ? `?${query}` : ""}`);
  return response.data;
}

export async function getReviewerCaseDetail(kycId) {
  const response = await api.get(`/api/reviewer/kyc-cases/${kycId}`);
  return response.data;
}

export async function reviewDocumentSubmission(submissionId, payload) {
  const response = await api.post(
    `/api/reviewer/documents/${submissionId}/review`,
    payload
  );
  return response.data;
}

export async function reviewVideoDeclaration(declarationId, payload) {
  const response = await api.post(
    `/api/reviewer/video/${declarationId}/review`,
    payload
  );
  return response.data;
}

export async function applyKycFinalDecision(kycId, payload) {
  const response = await api.post(
    `/api/reviewer/kyc-cases/${kycId}/final-decision`,
    payload
  );
  return response.data;
}

export async function reopenKycCase(kycId) {
  const response = await api.post(`/api/reviewer/kyc-cases/${kycId}/reopen`);
  return response.data;
}

// ---------- admin APIs ----------

export async function getAdminDashboard() {
  const response = await api.get("/api/admin/dashboard");
  return response.data;
}

export async function getAdminKycCases(status = "") {
  const query = status ? `?status=${status}` : "";
  const response = await api.get(`/api/admin/kyc-cases${query}`);
  return response.data;
}

export async function getAdminEntityTypes() {
  const response = await api.get("/api/admin/entity-types");
  return response.data;
}

export async function createAdminRequirement(payload) {
  const response = await api.post("/api/admin/document-requirements", payload);
  return response.data;
}

export async function updateAdminRequirement(id, payload) {
  const response = await api.patch(`/api/admin/document-requirements/${id}`, payload);
  return response.data;
}

export async function getAdminUsers() {
  const response = await api.get("/api/admin/users");
  return response.data;
}

export async function createAdminUser(payload) {
  const response = await api.post("/api/admin/users", payload);
  return response.data;
}

export async function updateAdminUser(id, payload) {
  const response = await api.patch(`/api/admin/users/${id}`, payload);
  return response.data;
}

export async function getAdminSettings() {
  const response = await api.get("/api/admin/settings");
  return response.data;
}

export async function patchAdminSettings(payload) {
  const response = await api.patch("/api/admin/settings", payload);
  return response.data;
}

export async function getAdminEmailLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await api.get(`/api/admin/email-logs${query ? `?${query}` : ""}`);
  return response.data;
}

export async function createManualKyc(payload) {
  const response = await api.post("/api/reviewer/manual-kyc", payload);
  return response.data;
}
