/**
 * Shama Abidi PhD System — Global Funded PhD Opportunities & Target Regions Module
 * Visualizes positions across all 7 target regions, strictly distinguishes fully funded
 * positions, displays English language exemptions, and prevents non-evidence-backed outreach.
 */
import { escapeHtml, renderVerificationBadge } from "./utils.js";

export function getFundingClassificationBadge(fundingType) {
  const t = (fundingType || "").toUpperCase();
  if (t === "FULLY_FUNDED") {
    return `<span class="badge badge-verified" title="100% Tuition Waiver + Living Stipend Confirmed by Official Evidence">💎 FULLY FUNDED</span>`;
  }
  if (t === "PARTIALLY_FUNDED") {
    return `<span class="badge badge-warning" title="Partial Coverage or Tuition-Only / Stipend-Only">⚠️ PARTIALLY FUNDED</span>`;
  }
  if (t === "UNFUNDED") {
    return `<span class="badge badge-danger" title="Applicant Must Provide External Funding or Bench Fees">🚫 UNFUNDED / SELF-FUNDED</span>`;
  }
  if (t === "NEEDS_REVIEW") {
    return `<span class="badge" style="background:rgba(139,92,246,0.18);color:#c4b5fd;border:1px solid rgba(139,92,246,0.4);" title="Evidence Ambiguous; Requires Manual Review of Official University Portal">🔍 NEEDS REVIEW</span>`;
  }
  return `<span class="badge badge-neutral" title="No Evidence Found; Never Guessed">❓ UNKNOWN</span>`;
}

export function getEnglishExemptionBadge(reqType, exemptionDetails) {
  const r = (reqType || "").toUpperCase();
  if (r === "MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED") {
    return `<span class="badge badge-verified" title="${escapeHtml(exemptionDetails || 'Medium of Instruction Accepted')}">🎓 MOI EXEMPTION ACCEPTED</span>`;
  }
  if (r === "IELTS_TOEFL_REQUIRED") {
    return `<span class="badge badge-neutral" title="Standard IELTS / TOEFL Academic Required">📝 IELTS / TOEFL REQUIRED</span>`;
  }
  return `<span class="badge badge-neutral">❓ ENGLISH UNKNOWN</span>`;
}

export function renderTargetRegionsOverview(regionsSummary = {}) {
  const regionKeys = Object.keys(regionsSummary);
  if (!regionKeys.length) {
    return "";
  }

  const regionCards = regionKeys
    .map((rKey) => {
      const reg = regionsSummary[rKey];
      const isEnabled = reg.is_enabled !== false;
      const count = reg.country_count || (reg.countries ? reg.countries.length : 0);
      const countriesList = (reg.countries || []).join(", ");

      return `
        <div class="item-card" style="border-left: 3px solid ${isEnabled ? 'var(--accent-emerald)' : 'var(--border-color)'};">
          <div class="item-card-header" style="margin-bottom:4px;">
            <div style="font-weight:700;color:#fff;font-size:0.92rem;">
              ${isEnabled ? "🟢" : "⚪"} ${escapeHtml(reg.name || rKey)}
            </div>
            <span class="badge ${isEnabled ? 'badge-verified' : 'badge-neutral'}">
              ${count} Countries ${isEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;line-height:1.4;">
            ${escapeHtml(countriesList)}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-card" style="margin-bottom:20px;">
      <div class="panel-head-inline" style="margin-bottom:12px;">
        <div>
          <h3 style="display:flex;align-items:center;gap:8px;">
            <span>🌐 Configurable Global Target Search Regions (7 Regions)</span>
            <span class="badge badge-verified">67 Target Countries</span>
          </h3>
          <p class="panel-desc">
            Autonomous discovery targets verified universities across 7 geographical regions. Configurable at runtime without system rebuilds.
          </p>
        </div>
        <div style="font-size:0.8rem;color:#fda4af;background:rgba(244,63,94,0.12);padding:6px 12px;border-radius:8px;border:1px solid rgba(244,63,94,0.3);">
          🔒 <strong>STRICT POLICY:</strong> Pakistan is strictly excluded from supervisor discovery.
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
        ${regionCards}
      </div>
    </div>
  `;
}

export function renderGlobalPhDOpportunitiesTable(opportunitiesList = [], onDraftClick = null) {
  if (!opportunitiesList.length) {
    return `<div class="empty-state" style="padding:28px;text-align:center;color:var(--text-muted);">No global PhD opportunities recorded yet. Run scheduled discovery to ingest new verified positions.</div>`;
  }

  const rows = opportunitiesList
    .map((opp) => {
      const isRecommended = Boolean(opp.is_recommended_for_outreach);
      const matchScore = parseFloat(opp.applicant_match_score || 0.0);
      const appUrl = opp.official_application_url;
      const fundUrl = opp.official_funding_url;
      const supUrl = opp.supervisor_profile_url;

      return `
      <tr>
        <td data-label="Region & Country">
          <div style="font-weight:700;color:#fff;">🌍 ${escapeHtml(opp.country)}</div>
          <div style="font-size:0.75rem;color:#93c5fd;margin-top:2px;">${escapeHtml(opp.region || "Global")}</div>
          <div style="font-size:0.73rem;color:var(--text-muted);">${escapeHtml(opp.country_code || "")}</div>
        </td>
        <td data-label="University & Programme">
          <div style="font-weight:700;color:#e2e8f0;">${escapeHtml(opp.university_name)}</div>
          <div style="font-size:0.82rem;color:#6ee7b7;margin-top:3px;font-weight:600;">${escapeHtml(opp.phd_programme)}</div>
          <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;">Field: ${escapeHtml(opp.research_field)}</div>
          <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:3px;">
            Intake: <code>${escapeHtml(opp.intended_intake || "Rolling")}</code> • Deadline: <code>${escapeHtml(opp.deadline_date || "Open")}</code>
          </div>
        </td>
        <td data-label="Supervisor & Contact">
          <div style="font-weight:600;color:#fff;">${escapeHtml(opp.supervisor_name)}</div>
          ${
            opp.supervisor_email
              ? `<div style="font-size:0.78rem;margin-top:2px;"><a href="mailto:${escapeHtml(opp.supervisor_email)}" style="color:#6ee7b7;">${escapeHtml(opp.supervisor_email)}</a></div>`
              : `<div style="font-size:0.74rem;color:var(--text-muted);">Email via Faculty Profile</div>`
          }
          ${
            supUrl
              ? `<div style="margin-top:4px;"><a href="${escapeHtml(supUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.76rem;color:#93c5fd;text-decoration:underline;">🔗 Faculty Profile</a></div>`
              : ""
          }
        </td>
        <td data-label="Funding & Evidence">
          <div style="margin-bottom:4px;">${getFundingClassificationBadge(opp.funding_type)}</div>
          <div style="font-size:0.78rem;color:#f8fafc;margin-top:2px;">
            <strong>Tuition:</strong> ${escapeHtml(opp.tuition_coverage || "UNKNOWN")}
          </div>
          <div style="font-size:0.78rem;color:#cbd5e1;margin-top:1px;">
            <strong>Stipend:</strong> ${escapeHtml(opp.stipend_amount || "Unspecified")} (${escapeHtml(opp.stipend_duration_months || "Duration Unknown")})
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px;">
            Source: ${escapeHtml(opp.funding_source || "University")}
          </div>
          ${
            opp.evidence_text
              ? `<div style="font-size:0.73rem;color:var(--text-secondary);margin-top:4px;background:rgba(15,23,42,0.6);padding:4px 6px;border-radius:4px;border:1px solid var(--border-color);line-height:1.3;">${escapeHtml(opp.evidence_text.slice(0, 140))}${opp.evidence_text.length > 140 ? '...' : ''}</div>`
              : ""
          }
        </td>
        <td data-label="English & Match">
          <div style="margin-bottom:4px;">${getEnglishExemptionBadge(opp.english_requirements, opp.english_exemption_details)}</div>
          <div style="font-size:0.95rem;font-weight:800;color:${matchScore >= 70 ? '#6ee7b7' : '#f59e0b'};">
            ${matchScore}% Match
          </div>
          <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:2px;">
            ${escapeHtml(opp.match_rationale || "Evaluated against Dr. Shama Abidi clinical portfolio")}
          </div>
          <div style="margin-top:6px;">
            ${
              isRecommended
                ? `<span class="badge badge-verified" style="font-weight:700;">⭐ RECOMMENDED FOR OUTREACH</span>`
                : `<span class="badge badge-neutral" style="font-size:0.72rem;">📋 REVIEW REQUIRED</span>`
            }
          </div>
        </td>
        <td data-label="Actions">
          <div style="display:flex;flex-direction:column;gap:5px;">
            ${
              appUrl
                ? `<a href="${escapeHtml(appUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary" style="font-size:0.74rem;text-align:center;">🏛️ Official Portal</a>`
                : ""
            }
            ${
              fundUrl && fundUrl !== appUrl
                ? `<a href="${escapeHtml(fundUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary" style="font-size:0.74rem;text-align:center;">💰 Funding Source</a>`
                : ""
            }
            <button class="btn btn-sm btn-primary" style="font-size:0.74rem;" onclick="openOrCreateDraftForOpportunity('${escapeHtml(opp.id)}')">
              ✉️ Prepare Draft
            </button>
          </div>
        </td>
      </tr>
      `;
    })
    .join("");

  return `
    <div class="table-responsive">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Region & Country</th>
            <th>University & PhD Programme</th>
            <th>Supervisor & Profile</th>
            <th>Funding & Evidence</th>
            <th>English & Match Score</th>
            <th>Outreach Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

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

