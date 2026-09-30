/**
 * Shama Abidi PhD System — Universities Directory Module (Section 9)
 */
import { escapeHtml, renderVerificationBadge } from "./utils.js";

export function renderUniversitiesTable(universities = []) {
  if (!universities.length) {
    return `<div class="empty-state">No universities match the current filter criteria.</div>`;
  }
  const rows = universities
    .map(
      (u) => `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.country)}</td>
        <td><code>${escapeHtml(u.official_domain || "—")}</code></td>
        <td>${renderVerificationBadge(u.verification_status, u.confidence_score)}</td>
        <td>${
          u.source_url
            ? `<a href="${escapeHtml(u.source_url)}" target="_blank" rel="noopener noreferrer">Official Registry</a>`
            : "—"
        }</td>
      </tr>`
    )
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>University Name</th>
          <th>Country</th>
          <th>Official Domain</th>
          <th>Verification Status</th>
          <th>Provenance Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
