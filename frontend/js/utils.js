/**
 * Shama Abidi PhD System — Frontend Utilities Module (Section 9)
 * Safe DOM escaping (XSS protection), date formatting, badges, and notifications.
 */

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatUtcDate(isoString) {
  if (!isoString) return "—";
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return escapeHtml(isoString);
    return dt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return escapeHtml(isoString);
  }
}

export function renderVerificationBadge(status, confidenceScore = null) {
  const normalized = String(status || "UNVERIFIED").toUpperCase();
  const palette = {
    VERIFIED: { bg: "#dcfce7", fg: "#166534", label: "VERIFIED" },
    NEEDS_REVIEW: { bg: "#fef9c3", fg: "#854d0e", label: "NEEDS REVIEW" },
    UNVERIFIED: { bg: "#f1f5f9", fg: "#475569", label: "UNVERIFIED" },
    OUTDATED: { bg: "#ffedd5", fg: "#9a3412", label: "OUTDATED" },
    REJECTED: { bg: "#fee2e2", fg: "#991b1b", label: "REJECTED" },
  };
  const style = palette[normalized] || palette.UNVERIFIED;
  const scoreSuffix =
    confidenceScore !== null && confidenceScore !== undefined
      ? ` (${Math.round(Number(confidenceScore))}%)`
      : "";
  return `<span class="badge-verification" style="background:${style.bg};color:${style.fg};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">${escapeHtml(
    style.label + scoreSuffix
  )}</span>`;
}

export function showNotification(message, level = "info") {
  const existing = document.getElementById("shama-toast-banner");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.id = "shama-toast-banner";
  banner.setAttribute("role", "status");
  const colors = {
    info: "#1e40af",
    success: "#065f46",
    warning: "#92400e",
    error: "#991b1b",
  };
  banner.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;background:${
    colors[level] || colors.info
  };color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.22);`;
  banner.textContent = message;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4500);
}

export function debounce(fn, waitMs = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
