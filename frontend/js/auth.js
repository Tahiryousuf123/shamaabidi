/**
 * Shama Abidi PhD System — Authentication & Role-Based Access Module (Section 6 & Section 9)
 */
import { ApiV1, clearStoredSession, getStoredUser, setStoredSession } from "./api.js";
import { escapeHtml, showNotification } from "./utils.js";

export async function loginWithCredentials(email, password, totpCode = null) {
  const res = await ApiV1.login(email, password, totpCode);
  setStoredSession(res.access_token, res.refresh_token, res.user);
  showNotification(`Signed in as ${res.user.full_name} (${res.user.role})`, "success");
  return res.user;
}

export async function logoutCurrentUser() {
  try {
    await ApiV1.logout();
  } catch {
    // Ignore network error on logout
  }
  clearStoredSession();
  showNotification("Signed out and session token revoked.", "info");
}

export function canMutateData() {
  const user = getStoredUser();
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "RESEARCHER";
}

export function isAdminUser() {
  const user = getStoredUser();
  return Boolean(user && user.role === "ADMIN");
}

export function renderAuthStatusChip() {
  const user = getStoredUser();
  if (!user) {
    return `<span class="auth-chip auth-chip-guest">Role: Authenticated Session Ready</span>`;
  }
  return `<span class="auth-chip auth-chip-active">${escapeHtml(user.full_name)} · <strong>${escapeHtml(
    user.role
  )}</strong></span>`;
}
