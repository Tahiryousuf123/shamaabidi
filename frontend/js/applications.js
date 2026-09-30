/**
 * Shama Abidi PhD System — PhD Applications CRM Pipeline Module (Section 9)
 */
import { escapeHtml, formatUtcDate } from "./utils.js";

export function renderApplicationsPipeline(applications = []) {
  if (!applications.length) {
    return `<div class="empty-state">No PhD applications created yet. Select a verified professor to initiate a tracked application.</div>`;
  }
  const rows = applications
    .map(
      (app) => `
      <tr>
        <td>#${escapeHtml(app.id)}</td>
        <td><strong>${escapeHtml(app.university_name)}</strong></td>
        <td>${escapeHtml(app.professor_name)}</td>
        <td>${escapeHtml(app.program_name)} (${escapeHtml(app.intake_term)})</td>
        <td><code>${escapeHtml(app.status)}</code></td>
        <td>${formatUtcDate(app.updated_at)}</td>
      </tr>`
    )
    .join("");

  return `
    <table class="crm-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>University</th>
          <th>Supervisor</th>
          <th>Program & Intake</th>
          <th>Pipeline Status</th>
          <th>Last Updated</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
