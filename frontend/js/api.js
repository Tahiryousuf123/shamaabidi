/**
 * Shama Abidi PhD System — Versioned REST API Client (Section 8 & Section 9)
 * Communicates with /api/v1/* endpoints with Bearer token support and standardized error handling.
 */

const TOKEN_STORAGE_KEY = "shama_phd_access_token";
const REFRESH_STORAGE_KEY = "shama_phd_refresh_token";
const USER_STORAGE_KEY = "shama_phd_current_user";

export function getStoredAccessToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

export function setStoredSession(accessToken, refreshToken, userObj) {
  if (accessToken) sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  if (refreshToken) sessionStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
  if (userObj) sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userObj));
}

export function clearStoredSession() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(REFRESH_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const token = getStoredAccessToken();
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errCode = payload?.error?.code || `HTTP_${response.status}`;
    const errMsg = payload?.error?.message || response.statusText || "Request failed";
    const err = new Error(errMsg);
    err.code = errCode;
    err.status = response.status;
    err.details = payload?.error?.details || {};
    throw err;
  }
  return payload;
}

export const ApiV1 = {
  login: (email, password, totpCode = null) =>
    apiRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, totp_code: totpCode }),
    }),
  logout: () => apiRequest("/api/v1/auth/logout", { method: "POST" }),
  me: () => apiRequest("/api/v1/auth/me"),
  dashboard: () => apiRequest("/api/v1/dashboard"),
  universities: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/universities${qs ? `?${qs}` : ""}`);
  },
  createUniversity: (data) =>
    apiRequest("/api/v1/universities", { method: "POST", body: JSON.stringify(data) }),
  professors: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/professors${qs ? `?${qs}` : ""}`);
  },
  createProfessor: (data) =>
    apiRequest("/api/v1/professors", { method: "POST", body: JSON.stringify(data) }),
  verifyProfessor: (professorId, data) =>
    apiRequest(`/api/v1/professors/${professorId}/verify`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  publications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/publications${qs ? `?${qs}` : ""}`);
  },
  funding: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/funding${qs ? `?${qs}` : ""}`);
  },
  applications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/applications${qs ? `?${qs}` : ""}`);
  },
  createApplication: (data) =>
    apiRequest("/api/v1/applications", { method: "POST", body: JSON.stringify(data) }),
  transitionApplicationStatus: (appId, newStatus, reason) =>
    apiRequest(`/api/v1/applications/${appId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ new_status: newStatus, reason }),
    }),
  emails: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/emails${qs ? `?${qs}` : ""}`);
  },
  createEmailDraft: (data) =>
    apiRequest("/api/v1/emails/drafts", { method: "POST", body: JSON.stringify(data) }),
  approveEmail: (emailId, reviewNotes = "Approved via dashboard") =>
    apiRequest(`/api/v1/emails/${emailId}/approve`, {
      method: "POST",
      body: JSON.stringify({ review_notes: reviewNotes }),
    }),
  sendEmail: (emailId, idempotencyKey = null) =>
    apiRequest(`/api/v1/emails/${emailId}/send`, {
      method: "POST",
      body: JSON.stringify({ idempotency_key: idempotencyKey }),
    }),
  recordEmailReply: (emailId, data) =>
    apiRequest(`/api/v1/emails/${emailId}/reply`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  followups: () => apiRequest("/api/v1/followups"),
  scheduleFollowup: (data) =>
    apiRequest("/api/v1/followups", { method: "POST", body: JSON.stringify(data) }),
  tasks: () => apiRequest("/api/v1/tasks"),
  createTask: (data) =>
    apiRequest("/api/v1/tasks", { method: "POST", body: JSON.stringify(data) }),
  jobs: () => apiRequest("/api/v1/jobs"),
  triggerJob: (jobKey, idempotencyKey = null) =>
    apiRequest(`/api/v1/jobs/${jobKey}/trigger`, {
      method: "POST",
      body: JSON.stringify({ idempotency_key: idempotencyKey }),
    }),
  auditLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/v1/audit${qs ? `?${qs}` : ""}`);
  },
};
