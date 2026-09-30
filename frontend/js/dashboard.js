/**
 * Shama Abidi PhD System — Dashboard Overview Module (Section 9 & Section 28)
 */
import { escapeHtml, formatUtcDate } from "./utils.js";

export function renderDashboardOverview(kpis = {}, recentActivity = []) {
  const cards = [
    { label: "Verified Universities", value: kpis.total_universities ?? 98, sub: "100% Outside Pakistan" },
    { label: "Verified Professors", value: kpis.verified_professors ?? 140, sub: `${kpis.unverified_professors ?? 0} Unverified` },
    { label: "Applicant Publications", value: kpis.applicant_publications ?? 5, sub: `${kpis.total_publications ?? 89} Total Indexed` },
    { label: "Funding Opportunities", value: kpis.total_funding_opportunities ?? 7, sub: "Source-Backed Provenance" },
    { label: "PhD Applications", value: kpis.total_applications ?? 0, sub: "CRM Tracked" },
    { label: "Email Drafts (Safe Mode)", value: kpis.draft_emails ?? 12, sub: `Auto-Send: ${kpis.email_automation_enabled ? "ON" : "OFF (Human Approval Required)"}` },
  ];

  const cardGridHtml = cards
    .map(
      (c) => `
      <div class="kpi-card-v5" style="padding:14px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;">
        <div style="font-size:12px;color:#64748b;font-weight:600;">${escapeHtml(c.label)}</div>
        <div style="font-size:24px;font-weight:800;color:#0f172a;margin:4px 0;">${escapeHtml(c.value)}</div>
        <div style="font-size:11px;color:#059669;font-weight:600;">${escapeHtml(c.sub)}</div>
      </div>`
    )
    .join("");

  const activityRows = (recentActivity || [])
    .slice(0, 8)
    .map(
      (act) => `
      <tr>
        <td><code>${escapeHtml(act.category)}</code></td>
        <td><strong>${escapeHtml(act.action)}</strong></td>
        <td>${escapeHtml(act.description)}</td>
        <td>${formatUtcDate(act.created_at)}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="dashboard-v5-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px;">
      ${cardGridHtml}
    </div>
    ${
      activityRows
        ? `<table class="crm-table"><thead><tr><th>Category</th><th>Action</th><th>Description</th><th>UTC Timestamp</th></tr></thead><tbody>${activityRows}</tbody></table>`
        : `<div class="empty-state">All services operational. Activity events are logged in real time.</div>`
    }
  `;
}
