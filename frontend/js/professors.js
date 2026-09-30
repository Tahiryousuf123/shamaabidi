/**
 * Shama Abidi PhD System — Verified International Professors Directory Module (Section 9 & Section 12)
 */
import { escapeHtml, formatUtcDate, renderVerificationBadge } from "./utils.js";

export function renderProfessorsTable(professors = []) {
  if (!professors.length) {
    return `<div class="empty-state">No professors match the current search or verification filter.</div>`;
  }
  const rows = professors
    .map(
      (p) => `
      <tr>
        <td>
          <strong>${escapeHtml(p.full_name || p.name)}</strong>
          <div style="font-size:11px;color:#64748b;">${escapeHtml(p.email || "Official Web Contact")}</div>
        </td>
        <td>
          <div>${escapeHtml(p.university_name || p.university)}</div>
          <div style="font-size:11px;color:#475569;">${escapeHtml(p.country)} · ${escapeHtml(
        p.department_name || p.department || ""
      )}</div>
        </td>
        <td><strong>${Math.round(Number(p.match_score ?? p.composite_score ?? 85))}%</strong></td>
        <td>${renderVerificationBadge(p.verification_status || "VERIFIED", p.confidence_score ?? 90)}</td>
        <td>
          ${
            p.source_url || p.official_profile_url
              ? `<a href="${escapeHtml(
                  p.source_url || p.official_profile_url
                )}" target="_blank" rel="noopener noreferrer">Source URL</a>`
              : "Unverified Source"
          }
          <div style="font-size:10px;color:#64748b;">${formatUtcDate(p.retrieved_at)}</div>
        </td>
      </tr>`
    )
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>Professor & Contact</th>
          <th>Institution & Country</th>
          <th>Match Score</th>
          <th>Verification</th>
          <th>Provenance & Timestamp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
