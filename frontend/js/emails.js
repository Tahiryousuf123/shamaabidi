/**
 * Shama Abidi PhD System — Human-Approved Email Workflow Module (Section 9 & Section 14)
 * Enforces explicit human review: DRAFT -> APPROVED -> SENT -> REPLIED.
 */
import { escapeHtml, formatUtcDate } from "./utils.js";

export function renderEmailsSafetyTable(emails = []) {
  if (!emails.length) {
    return `<div class="empty-state">No email drafts in queue.</div>`;
  }
  const rows = emails
    .map((e) => {
      const status = String(e.status || e.approval_status || "DRAFT").toUpperCase();
      return `
      <tr>
        <td>
          <strong>${escapeHtml(e.professor_name)}</strong>
          <div style="font-size:11px;color:#64748b;">${escapeHtml(e.recipient_email)}</div>
        </td>
        <td>${escapeHtml(e.subject || e.subject_line)}</td>
        <td><code>${escapeHtml(status)}</code></td>
        <td><span style="color:#059669;font-weight:700;">HUMAN APPROVAL MANDATORY</span></td>
        <td>${formatUtcDate(e.sent_at || e.approved_at || e.created_at)}</td>
      </tr>`;
    })
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>Recipient Professor</th>
          <th>Subject Line</th>
          <th>Workflow Status</th>
          <th>Safety Policy</th>
          <th>Timestamp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
