/**
 * Shama Abidi PhD System — Security Settings, RBAC & Audit Trail Module (Section 9 & Section 17)
 */
import { escapeHtml, formatUtcDate } from "./utils.js";

export function renderAuditTrailTable(auditLogs = []) {
  if (!auditLogs.length) {
    return `<div class="empty-state">No audit log entries found for the current filter.</div>`;
  }
  const rows = auditLogs
    .map(
      (l) => `
      <tr>
        <td>#${escapeHtml(l.id)}</td>
        <td><code>${escapeHtml(l.actor_role)}</code> (User #${escapeHtml(l.actor_user_id ?? "SYS")})</td>
        <td><strong>${escapeHtml(l.action)}</strong></td>
        <td><code>${escapeHtml(l.entity_type)}:${escapeHtml(l.entity_id)}</code></td>
        <td>${escapeHtml(l.ip_address || "127.0.0.1")}</td>
        <td>${formatUtcDate(l.created_at)}</td>
      </tr>`
    )
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>Audit ID</th>
          <th>Actor & Role</th>
          <th>Action</th>
          <th>Target Entity</th>
          <th>IP Address</th>
          <th>UTC Timestamp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
