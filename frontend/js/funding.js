/**
 * Shama Abidi PhD System — Funding Opportunities & Evidence Provenance Module (Section 9)
 */
import { escapeHtml, renderVerificationBadge } from "./utils.js";

export function renderFundingTable(fundingList = []) {
  if (!fundingList.length) {
    return `<div class="empty-state">No funding opportunities recorded.</div>`;
  }
  const rows = fundingList
    .map(
      (f) => `
      <tr>
        <td><strong>${escapeHtml(f.title || f.funding_program)}</strong></td>
        <td><code>${escapeHtml(f.funding_type || "SCHOLARSHIP")}</code></td>
        <td>${escapeHtml(f.sponsor_agency || "—")}</td>
        <td>${escapeHtml(f.stipend_Estimate || f.stipend_details || "Full Tuition + Stipend")}</td>
        <td>${renderVerificationBadge(f.verification_status, f.confidence_score)}</td>
        <td>${
          f.source_url || f.evidence_url
            ? `<a href="${escapeHtml(f.source_url || f.evidence_url)}" target="_blank" rel="noopener noreferrer">Official Evidence</a>`
            : "—"
        }</td>
      </tr>`
    )
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>Funding Program</th>
          <th>Classification</th>
          <th>Sponsor / Agency</th>
          <th>Coverage & Stipend</th>
          <th>Verification</th>
          <th>Source Provenance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
