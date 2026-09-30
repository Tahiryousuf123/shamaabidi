/**
 * Shama Abidi PhD System — Background Automation Jobs Monitor Module (Section 9 & Section 10)
 */
import { escapeHtml, formatUtcDate } from "./utils.js";

export function renderJobsMonitor(jobs = [], recentRuns = []) {
  const jobRows = jobs
    .map(
      (j) => `
      <tr>
        <td><code>${escapeHtml(j.job_key || j.job_id)}</code></td>
        <td><strong>${escapeHtml(j.name || j.job_name)}</strong></td>
        <td><code>${escapeHtml(j.schedule_cron || j.schedule_interval)}</code></td>
        <td>${j.is_enabled !== false ? '<span style="color:#059669;font-weight:700;">ENABLED</span>' : '<span style="color:#dc2626;font-weight:700;">DISABLED</span>'}</td>
        <td><code>${escapeHtml(j.last_status || "SUCCESS")}</code></td>
        <td>${formatUtcDate(j.last_run_at || j.last_run)}</td>
      </tr>`
    )
    .join("");

  const runRows = (recentRuns || [])
    .slice(0, 10)
    .map(
      (r) => `
      <tr>
        <td>#${escapeHtml(r.id)}</td>
        <td><code>${escapeHtml(r.idempotency_key)}</code></td>
        <td><strong>${escapeHtml(r.status)}</strong></td>
        <td>${escapeHtml(r.duration_ms ?? 0)} ms</td>
        <td>${formatUtcDate(r.started_at)}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="margin-bottom:16px;">
      <h4>Registered Background Workers (Isolated from HTTP Request Threads)</h4>
      <table class="crm-table">
        <thead>
          <tr><th>Job Key</th><th>Name</th><th>Cron Schedule</th><th>State</th><th>Last Status</th><th>Last Run (UTC)</th></tr>
        </thead>
        <tbody>${jobRows}</tbody>
      </table>
    </div>
    ${
      runRows
        ? `<div><h4>Recent Idempotent Job Runs</h4><table class="crm-table"><thead><tr><th>Run ID</th><th>Idempotency Key</th><th>Status</th><th>Duration</th><th>Started At</th></tr></thead><tbody>${runRows}</tbody></table></div>`
        : ""
    }
  `;
}
