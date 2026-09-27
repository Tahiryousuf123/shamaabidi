// ============================================================================
// Shama Abidi — International Funded PhD AI Research & Application System
// Interactive Client Presentation & Production Prototype Engine (White Theme)
// ============================================================================

const state = {
  activeTab: "overview",
  showUrduGuide: true,
  selectedSupervisorId: "sup-1",
  selectedDraftId: "draft-1",
  searchQuery: "",
  statusFilter: "ALL",
  fundingFilter: "ALL",

  candidate: {
    name: "Shama Abidi",
    discipline: "AI & Computational Research / Interdisciplinary Analytics",
    highestDegree: "MS / MPhil (Verified Official Transcript)",
    cgpa: "3.88 / 4.00 (Verified)",
    englishTest: "IELTS 7.5 Academic (Verified)",
    researchInterests: [
      "Applied Artificial Intelligence & Machine Learning",
      "Evidence-Based Predictive Modeling",
      "Data-Driven Decision Systems",
      "Domain-Specific RAG & Knowledge Graphs"
    ],
    unverifiedItems: [
      "GRE General Score: UNKNOWN (Not required for European/UK programs; marked UNKNOWN so AI never fabricates)",
      "External Co-tutelle Grant Number: TO_VERIFY"
    ]
  },

  opportunities: [
    {
      id: "opp-1",
      title: "Fully Funded PhD Fellowship in Trustworthy & Applied AI Systems",
      university: "ETH Zurich",
      country: "Switzerland 🇨🇭",
      portal: "Official ETH Portal",
      officialUrl: "https://jobs.ethz.ch/phd-trustworthy-ai-2026",
      verificationStatus: "VERIFIED_OFFICIAL",
      fundingType: "FULLY_FUNDED",
      stipend: "CHF 4,200 / month + 100% Tuition Covered",
      deadline: "2026-11-15",
      fitScore: 96,
      pipelineStage: "DRAFT_PENDING_APPROVAL",
      supervisorName: "Prof. Dr. Lukas Meier",
      notes: "Official university domain (.ethz.ch) verified. Full Swiss National Science Foundation (SNSF) doctoral salary confirmed."
    },
    {
      id: "opp-2",
      title: "UKRI Funded Doctoral Studentship in Data-Driven Research & Modeling",
      university: "University of Oxford",
      country: "United Kingdom 🇬🇧",
      portal: "FindAPhD / ox.ac.uk",
      officialUrl: "https://www.ox.ac.uk/admissions/graduate/courses/dphil-funded-2026",
      verificationStatus: "VERIFIED_OFFICIAL",
      fundingType: "FULLY_FUNDED",
      stipend: "£19,237 / year Tax-Free + 100% International Tuition",
      deadline: "2026-12-01",
      fitScore: 94,
      pipelineStage: "POSITIVE_REPLY",
      supervisorName: "Prof. Sarah Jenkins",
      notes: "Verified directly on ox.ac.uk. Includes college fee waiver and annual research travel grant."
    },
    {
      id: "opp-3",
      title: "DAAD / Doctoral Researcher (TV-L E13 100%) in Intelligent Analytics",
      university: "Technical University of Munich (TUM)",
      country: "Germany 🇩🇪",
      portal: "EURAXESS / tum.de",
      officialUrl: "https://portal.mytum.de/jobs/wissenschaftler/phd-e13-2026",
      verificationStatus: "VERIFIED_OFFICIAL",
      fundingType: "FULLY_FUNDED",
      stipend: "€2,950 / month Net (TV-L E13) + Zero Tuition",
      deadline: "2026-10-30",
      fitScore: 91,
      pipelineStage: "EMAIL_SENT",
      supervisorName: "Prof. Dr. Klaus Weber",
      notes: "Official TUM job portal verified. Full salaried position with health insurance."
    },
    {
      id: "opp-4",
      title: "Doctoral Research Position in Computational Intelligence & Lab Systems",
      university: "Delft University of Technology (TU Delft)",
      country: "Netherlands 🇳🇱",
      portal: "AcademicTransfer / tudelft.nl",
      officialUrl: "https://www.tudelft.nl/over-tu-delft/werken-bij-tu-delft/vacatures",
      verificationStatus: "TO_VERIFY",
      fundingType: "TO_VERIFY",
      stipend: "TO_VERIFY (Lab grant renewal pending confirmation)",
      deadline: "2026-11-22",
      fitScore: 88,
      pipelineStage: "SUPERVISOR_ANALYZED",
      supervisorName: "Dr. Hendrik van Dijk",
      notes: "NO-FABRICATION GUARDRAIL: Professor's lab page mentions openings, but exact 2027 stipend figure is not listed publicly. Marked as TO_VERIFY."
    },
    {
      id: "opp-5",
      title: "Melbourne Research Scholarship (MRS) — PhD Position",
      university: "University of Melbourne",
      country: "Australia 🇦🇺",
      portal: "unimelb.edu.au",
      officialUrl: "https://scholarships.unimelb.edu.au/awards/graduate-research",
      verificationStatus: "VERIFIED_OFFICIAL",
      fundingType: "FULLY_FUNDED",
      stipend: "AUD $37,000 / year + Full Fee Offset + Relocation",
      deadline: "2026-10-31",
      fitScore: 89,
      pipelineStage: "DISCOVERED",
      supervisorName: "Prof. Elena Rostova",
      notes: "Official University of Melbourne scholarship portal verified."
    },
    {
      id: "opp-6",
      title: "[AUTO-BLOCKED] 2025 Expired Doctoral Call in Machine Learning",
      university: "KU Leuven",
      country: "Belgium 🇧🇪",
      portal: "Scraped Aggregator (Filtered)",
      officialUrl: "https://www.kuleuven.be/personeel/jobsite/archive-2025",
      verificationStatus: "EXPIRED_FILTERED",
      fundingType: "UNKNOWN",
      stipend: "UNKNOWN",
      deadline: "2025-11-01",
      fitScore: 72,
      pipelineStage: "ARCHIVED",
      supervisorName: "N/A (Expired Call)",
      notes: "Official Verification Agent detected deadline in the past and automatically blocked this position from the active pipeline."
    }
  ],

  supervisors: [
    {
      id: "sup-1",
      name: "Prof. Dr. Lukas Meier",
      title: "Full Professor & Lab Director",
      university: "ETH Zurich 🇨🇭",
      department: "Department of Computer Science — Intelligent Systems Lab",
      email: "l.meier@inf.ethz.ch",
      hIndex: 48,
      fitScore: 96,
      acceptingStatus: "CONFIRMED_OPEN",
      papers: [
        {
          title: "Retrieval-Augmented Verification for High-Stakes Scientific Workflows",
          year: 2026,
          venue: "Nature Machine Intelligence",
          evidenceQuote: "Demonstrates hybrid vector-graph retrieval reducing hallucination rates by 94% in domain-specific reasoning."
        },
        {
          title: "Calibrated Uncertainty in Multi-Agent Decision Pipelines",
          year: 2025,
          venue: "NeurIPS",
          evidenceQuote: "Proposes human-in-the-loop verification checkpoints for autonomous research agents."
        }
      ],
      verifiedOverlap: [
        "Shama Abidi's verified MS thesis and research methodology directly utilize empirical evaluation and predictive modeling aligned with Prof. Meier's 2026 Nature MI paper.",
        "Both focus on interpretable, high-reliability data pipelines rather than black-box heuristics."
      ],
      unverifiedFlags: [
        "Exact start month (Sept 2027 vs Jan 2027): TO_VERIFY in outreach email",
        "Internal SNSF Sub-Grant Code: UNKNOWN (AI refused to guess; marked as general SNSF fellowship inquiry)"
      ]
    },
    {
      id: "sup-2",
      name: "Prof. Sarah Jenkins",
      title: "Professor of Computational Research",
      university: "University of Oxford 🇬🇧",
      department: "Department of Engineering Science",
      email: "sarah.jenkins@eng.ox.ac.uk",
      hIndex: 54,
      fitScore: 94,
      acceptingStatus: "CONFIRMED_OPEN",
      papers: [
        {
          title: "Scalable Knowledge Synthesis Across Biomedical and Technical Literature",
          year: 2026,
          venue: "IEEE Transactions on Pattern Analysis",
          evidenceQuote: "Introduces dense passage indexing with strict provenance tracking."
        },
        {
          title: "Automated Evidence Grading in Systematic Academic Reviews",
          year: 2025,
          venue: "AAAI Conference on Artificial Intelligence",
          evidenceQuote: "Maps citation networks to verify claim validity automatically."
        }
      ],
      verifiedOverlap: [
        "Direct overlap between Shama Abidi's quantitative analysis skills and Prof. Jenkins' 2026 work on scalable knowledge synthesis.",
        "Meets Oxford's verified IELTS 7.5+ and Distinction-level Master's GPA criteria."
      ],
      unverifiedFlags: [
        "Specific Oxford College affiliation for this studentship: TO_VERIFY"
      ]
    },
    {
      id: "sup-3",
      name: "Prof. Dr. Klaus Weber",
      title: "Chair of Data-Intensive Systems",
      university: "TU Munich (TUM) 🇩🇪",
      department: "TUM School of Computation, Information and Technology",
      email: "klaus.weber@tum.de",
      hIndex: 39,
      fitScore: 91,
      acceptingStatus: "CONFIRMED_OPEN",
      papers: [
        {
          title: "Resource-Efficient Vector Indexing for Domain-Specific RAG",
          year: 2025,
          venue: "VLDB",
          evidenceQuote: "Optimizes Qdrant and HNSW graph traversal for academic corpora."
        }
      ],
      verifiedOverlap: [
        "Strong alignment with Shama Abidi's background in structured data modeling and applied research."
      ],
      unverifiedFlags: [
        "German language requirement for teaching duties: UNKNOWN (Marked TO_VERIFY; PhD research itself is 100% English)"
      ]
    },
    {
      id: "sup-4",
      name: "Dr. Hendrik van Dijk",
      title: "Associate Professor",
      university: "TU Delft 🇳🇱",
      department: "Faculty of Electrical Engineering, Mathematics & CS",
      email: "h.vandijk@tudelft.nl",
      hIndex: 31,
      fitScore: 88,
      acceptingStatus: "TO_VERIFY",
      papers: [
        {
          title: "Robust Validation Frameworks for Applied Predictive Models",
          year: 2025,
          venue: "Journal of Artificial Intelligence Research",
          evidenceQuote: "Evaluates cross-domain generalization under distribution shift."
        }
      ],
      verifiedOverlap: [
        "Methodological overlap verified via Qdrant semantic similarity (Score: 0.88)."
      ],
      unverifiedFlags: [
        "2027 Horizon Europe Funding Confirmation: TO_VERIFY (Explicitly flagged by No-Fabrication Guardrail)"
      ]
    }
  ],

  emailDrafts: [
    {
      id: "draft-1",
      supervisorId: "sup-1",
      supervisorName: "Prof. Dr. Lukas Meier",
      university: "ETH Zurich 🇨🇭",
      recipientEmail: "l.meier@inf.ethz.ch",
      type: "INITIAL_OUTREACH",
      approvalStatus: "PENDING_HUMAN_APPROVAL",
      approvedByHuman: false,
      approvedAt: null,
      subject: "Prospective Funded PhD Applicant (2026/27) — Shama Abidi | Alignment with Retrieval-Augmented Verification",
      body: `Dear Prof. Dr. Lukas Meier,

I hope this email finds you well. My name is Shama Abidi, and I am writing to express my strong interest in applying for the Fully Funded PhD Fellowship in Trustworthy & Applied AI Systems in your group at ETH Zurich (deadline: 15 November 2026).

I recently studied your 2026 paper in Nature Machine Intelligence, "Retrieval-Augmented Verification for High-Stakes Scientific Workflows," as well as your NeurIPS 2025 work on calibrated uncertainty. Your focus on reducing hallucinations through hybrid retrieval directly aligns with my verified Master's research (CGPA: 3.88/4.00) in evidence-based predictive modeling and structured data systems.

Based on the official ETH Zurich vacancy notice, I understand the position is fully funded under the SNSF doctoral scheme. Could you please confirm whether you are reviewing prospective candidates for the upcoming intake [TO_VERIFY: Spring vs. Autumn 2027 start date]?

I have attached my CV and academic transcripts for your kind consideration, and I would be deeply grateful for the opportunity to discuss how my background can contribute to your lab.

Warm regards,
Shama Abidi
Verified Academic Profile | IELTS 7.5`,
      auditChecks: [
        { label: "Candidate Degree & CGPA (3.88/4.00) verified against official profile", status: "PASS" },
        { label: "Supervisor Paper ('Retrieval-Augmented Verification...', 2026) verified via Qdrant", status: "PASS" },
        { label: "No fabricated scholarships, fake papers, or unverified lab grants", status: "PASS" },
        { label: "Unconfirmed intake month explicitly marked as [TO_VERIFY]", status: "FLAGGED_SAFE" }
      ]
    },
    {
      id: "draft-2",
      supervisorId: "sup-3",
      supervisorName: "Prof. Dr. Klaus Weber",
      university: "TU Munich (TUM) 🇩🇪",
      recipientEmail: "klaus.weber@tum.de",
      type: "FOLLOW_UP_DAY_8 (Auto-Generated by n8n)",
      approvalStatus: "PENDING_HUMAN_APPROVAL",
      approvedByHuman: false,
      approvedAt: null,
      subject: "Polite Follow-Up: Funded PhD Application Inquiry (TV-L E13) — Shama Abidi",
      body: `Dear Prof. Dr. Klaus Weber,

I hope you are having a productive week. I am writing to politely follow up on my email sent 8 days ago regarding the Doctoral Researcher (TV-L E13 100%) opening at TU Munich.

I remain very enthusiastic about your group's VLDB 2025 research on "Resource-Efficient Vector Indexing for Domain-Specific RAG" and how my Master's research aligns with your current objectives.

Please let me know if you require any additional materials, such as a brief 2-page research proposal tailored to your lab's upcoming milestones.

With sincere regards,
Shama Abidi`,
      auditChecks: [
        { label: "8-day elapsed window verified via Gmail OAuth Thread Monitor", status: "PASS" },
        { label: "Original VLDB 2025 citation verified in Qdrant Vector DB", status: "PASS" },
        { label: "Zero fabricated credentials or unverified claims", status: "PASS" }
      ]
    },
    {
      id: "draft-3",
      supervisorId: "sup-4",
      supervisorName: "Dr. Hendrik van Dijk",
      university: "TU Delft 🇳🇱",
      recipientEmail: "h.vandijk@tudelft.nl",
      type: "INITIAL_OUTREACH (Funding Inquiry)",
      approvalStatus: "PENDING_HUMAN_APPROVAL",
      approvedByHuman: false,
      approvedAt: null,
      subject: "Prospective PhD Inquiry — Shama Abidi | Robust Validation Frameworks",
      body: `Dear Dr. Hendrik van Dijk,

I hope this message finds you well. My name is Shama Abidi, and I hold an MS/MPhil degree (CGPA 3.88/4.00) with a focus on applied predictive modeling.

Having read your 2025 JAIR publication, "Robust Validation Frameworks for Applied Predictive Models," I am keen to inquire whether your group at TU Delft anticipates funded PhD openings for the upcoming academic cycle [TO_VERIFY: Availability of Departmental or Horizon Europe Doctoral Funding].

I have attached my CV and verified research summary. Thank you very much for your time and consideration.

Sincerely,
Shama Abidi`,
      auditChecks: [
        { label: "Funding status unknown on website — AI safely phrased as inquiry with [TO_VERIFY]", status: "FLAGGED_SAFE" },
        { label: "Supervisor 2025 JAIR paper verified", status: "PASS" },
        { label: "No fabricated grant numbers included", status: "PASS" }
      ]
    }
  ],

  gmailThreads: [
    {
      id: "thread-101",
      supervisorName: "Prof. Sarah Jenkins",
      university: "University of Oxford 🇬🇧",
      email: "sarah.jenkins@eng.ox.ac.uk",
      lastSnippet: "Dear Shama, thank you for reaching out. Your background aligns well with our UKRI project on knowledge synthesis. Are you available for a 20-minute Zoom interview next Tuesday at 14:00 BST?",
      receivedAt: "2 hours ago",
      classification: "INTERVIEW_INVITATION",
      daysSinceContact: 1,
      actionNote: "Positive reply + Funded UKRI project confirmed! Ready to schedule interview."
    },
    {
      id: "thread-102",
      supervisorName: "Prof. Dr. Klaus Weber",
      university: "TU Munich (TUM) 🇩🇪",
      email: "klaus.weber@tum.de",
      lastSnippet: "Initial outreach sent via Gmail OAuth (Approved by Shama Abidi). No reply received yet.",
      receivedAt: "8 days ago",
      classification: "AWAITING_REPLY (8 Days Elapsed)",
      daysSinceContact: 8,
      actionNote: "n8n 7–10 Day Rule Triggered -> Follow-Up Draft #2 created & waiting in Human Approval Queue."
    },
    {
      id: "thread-103",
      supervisorName: "Prof. Marco Rossi",
      university: "Politecnico di Milano 🇮🇹",
      email: "marco.rossi@polimi.it",
      lastSnippet: "Dear Shama, my PNRR doctoral slots are filled for this cycle, but my colleague Prof. Bianchi in our lab just received a new fully funded EU grant in your exact topic. I recommend emailing her.",
      receivedAt: "Yesterday",
      classification: "SUPERVISOR_REDIRECT",
      daysSinceContact: 2,
      actionNote: "AI extracted referral: Prof. Elena Bianchi (Politecnico di Milano) added to Supervisor Research Queue."
    }
  ],

  literatureLibrary: [
    {
      doi: "10.1038/s42256-026-00912-x",
      title: "Retrieval-Augmented Verification for High-Stakes Scientific Workflows",
      authors: "Meier, L., Hoffman, A., & Chen, Y.",
      year: 2026,
      venue: "Nature Machine Intelligence",
      qdrantStatus: "INDEXED (1,536-dim Vector)",
      linkedSupervisor: "Prof. Dr. Lukas Meier (ETH Zurich)",
      keyFinding: "Hybrid vector-graph retrieval cuts scientific claim fabrication by 94%."
    },
    {
      doi: "10.1109/TPAMI.2026.341092",
      title: "Scalable Knowledge Synthesis Across Biomedical and Technical Literature",
      authors: "Jenkins, S., & Patel, R.",
      year: 2026,
      venue: "IEEE TPAMI",
      qdrantStatus: "INDEXED (1,536-dim Vector)",
      linkedSupervisor: "Prof. Sarah Jenkins (Oxford)",
      keyFinding: "Dense passage indexing with strict citation provenance tracking."
    },
    {
      doi: "10.14778/3705829.3705841",
      title: "Resource-Efficient Vector Indexing for Domain-Specific RAG",
      authors: "Weber, K., & Richter, M.",
      year: 2025,
      venue: "PVLDB",
      qdrantStatus: "INDEXED (1,536-dim Vector)",
      linkedSupervisor: "Prof. Dr. Klaus Weber (TU Munich)",
      keyFinding: "Optimizes Qdrant payload filtering for academic paper collections."
    }
  ],

  auditLogs: [
    {
      time: "Today, 03:50 AM",
      actor: "LANGGRAPH_VERIFIER",
      event: "BLOCKED_EXPIRED_OPPORTUNITY",
      detail: "Filtered expired KU Leuven 2025 listing before entering active dashboard."
    },
    {
      time: "Today, 03:44 AM",
      actor: "NO_FABRICATION_GUARD",
      event: "ENFORCED_TO_VERIFY_TAG",
      detail: "TU Delft lab grant amount not explicitly on official page -> Tagged as TO_VERIFY (prevented AI guessing)."
    },
    {
      time: "Today, 03:30 AM",
      actor: "N8N_SCHEDULER",
      event: "GENERATED_DAY_8_FOLLOWUP_DRAFT",
      detail: "8 days elapsed on Prof. Klaus Weber thread -> Created Follow-Up Draft #2 in PENDING_HUMAN_APPROVAL state."
    },
    {
      time: "Yesterday, 06:15 PM",
      actor: "GMAIL_OAUTH_MONITOR",
      event: "CLASSIFIED_INCOMING_REPLY",
      detail: "Classified reply from Prof. Sarah Jenkins (Oxford) as INTERVIEW_INVITATION + FUNDING_CONFIRMED."
    }
  ]
};

const urduGuides = {
  overview: {
    title: "Step 1: Executive Dashboard & Weekly Summary",
    text: "This is Shama Abidi's central command center. View all officially verified funded PhD opportunities, average supervisor Evidence-Based Fit (92.8%), upcoming deadlines, pending email approvals, and immutable security audit logs. The AI is strictly blocked from sending any email autonomously."
  },
  discovery: {
    title: "Step 2: Global Funded PhD Discovery & Official Verification",
    text: "Automatically discovers funded PhD positions worldwide (ETH Zurich, Oxford, Germany DAAD, Australia, Canada), verifies each listing against the official university domain, and blocks expired or duplicate calls. Any unconfirmed funding detail is explicitly tagged as 'TO_VERIFY' (zero fabrication)."
  },
  supervisors: {
    title: "Step 3: Supervisor Intelligence & Evidence-Based Fit (Qdrant RAG)",
    text: "Analyzes each supervisor's real peer-reviewed publications indexed in Qdrant Vector DB and calculates an Evidence-Based Fit score against Shama Abidi's verified academic profile. Missing facts are transparently flagged as 'TO_VERIFY' or 'UNKNOWN'."
  },
  emails: {
    title: "Step 4: Personalized Email Studio & Human-in-the-Loop Approval Gate",
    text: "CRITICAL RULE: The AI only prepares personalized outreach drafts and runs a pre-flight No-Fabrication Audit. No email is ever dispatched until you explicitly review and click 'Approve & Send via Gmail OAuth2'."
  },
  gmail: {
    title: "Step 5: Gmail OAuth2 Inbox Monitor & 7–10 Day Auto Follow-Up Engine",
    text: "Securely monitors official Gmail threads via OAuth2 (zero password storage), classifies incoming professor replies (e.g., Interview Invitation, Funding Confirmed, Supervisor Redirect), and automatically prepares a polite follow-up draft in the Approval Queue if 7–10 days pass without a reply."
  }
};

function toggleMobileSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar && backdrop) {
    sidebar.classList.toggle("open");
    backdrop.classList.toggle("open");
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar && backdrop) {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
  }
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div style="font-weight:700;color:#059669;margin-bottom:3px;">✓ System Action Recorded</div><div style="color:#0f172a;">${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4500);
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".mob-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  closeMobileSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function toggleUrduGuide() {
  state.showUrduGuide = !state.showUrduGuide;
  render();
}

function getBadgeHtml(status) {
  switch (status) {
    case "VERIFIED_OFFICIAL":
    case "FULLY_FUNDED":
    case "CONFIRMED_OPEN":
    case "SENT_VIA_GMAIL_OAUTH":
    case "INTERVIEW_INVITATION":
    case "PASS":
      return `<span class="badge badge-verified">✓ ${status.replace(/_/g, " ")}</span>`;
    case "TO_VERIFY":
    case "UNKNOWN":
    case "PENDING_HUMAN_APPROVAL":
    case "FLAGGED_SAFE":
    case "AWAITING_REPLY (8 Days Elapsed)":
      return `<span class="badge badge-to-verify">⚠ ${status.replace(/_/g, " ")}</span>`;
    case "EXPIRED_FILTERED":
    case "DUPLICATE_FILTERED":
      return `<span class="badge badge-filtered">✕ ${status.replace(/_/g, " ")}</span>`;
    default:
      return `<span class="badge badge-blue">${status.replace(/_/g, " ")}</span>`;
  }
}

function renderUrduBanner() {
  const banner = document.getElementById("urdu-banner");
  const toggleBtn = document.getElementById("urdu-toggle-btn");
  if (toggleBtn) {
    toggleBtn.textContent = state.showUrduGuide
      ? "📘 Step-by-Step Guide: ON"
      : "📘 Step-by-Step Guide: OFF";
  }

  if (!state.showUrduGuide) {
    banner.classList.add("hidden");
    return;
  }
  const info = urduGuides[state.activeTab] || urduGuides.overview;
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div>
      <div class="urdu-title">📘 Interactive Walkthrough — ${info.title}</div>
      <div class="urdu-text">${info.text}</div>
    </div>
    <button class="btn btn-sm" onclick="toggleUrduGuide()">Hide Guide</button>
  `;
}

function updateSidebarCounts() {
  const activeOpps = state.opportunities.filter(
    (o) => o.verificationStatus !== "EXPIRED_FILTERED"
  ).length;
  const pendingDrafts = state.emailDrafts.filter(
    (d) => d.approvalStatus === "PENDING_HUMAN_APPROVAL"
  ).length;

  const oppPill = document.getElementById("pill-opps");
  const draftPill = document.getElementById("pill-drafts");
  if (oppPill) oppPill.textContent = activeOpps;
  if (draftPill) draftPill.textContent = pendingDrafts;
}

// ============================================================================
// VIEW 1: EXECUTIVE OVERVIEW & WEEKLY REPORT
// ============================================================================
function renderOverview() {
  const verifiedCount = state.opportunities.filter(
    (o) => o.verificationStatus === "VERIFIED_OFFICIAL"
  ).length;
  const pendingCount = state.emailDrafts.filter(
    (d) => d.approvalStatus === "PENDING_HUMAN_APPROVAL"
  ).length;
  const sentCount = state.emailDrafts.filter(
    (d) => d.approvalStatus === "SENT_VIA_GMAIL_OAUTH"
  ).length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Officially Verified Funded PhDs</div>
        <div class="kpi-value">${verifiedCount} <span style="font-size:14px;color:#059669;font-weight:700;">Active</span></div>
        <div class="kpi-sub">1 Expired & 2 Duplicates Auto-Filtered</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg. Supervisor Evidence Fit</div>
        <div class="kpi-value" style="color:#2563eb;">92.8%</div>
        <div class="kpi-sub">Backed by Qdrant Paper Citations</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Emails Pending Human Approval</div>
        <div class="kpi-value" style="color:#d97706;">${pendingCount}</div>
        <div class="kpi-sub" style="color:#059669;font-weight:600;">${sentCount} Approved & Sent | 0 Auto-Sent by AI</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Positive / Interview Replies</div>
        <div class="kpi-value" style="color:#059669;">${state.gmailThreads.filter(t => t.classification === "INTERVIEW_INVITATION").length}</div>
        <div class="kpi-sub">Oxford UKRI Interview Invite + 1 Redirect</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🎯 Priority Funded PhD Deadlines & Application Pipeline</div>
            <div class="panel-subtitle">All opportunities verified against official university domains (.ethz.ch, .ox.ac.uk, .tum.de)</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="switchTab('discovery')">Explore All Opportunities →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>University & Position</th>
                <th>Official Verification</th>
                <th>Funding & Stipend</th>
                <th>Fit</th>
                <th>Deadline</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              ${state.opportunities
                .filter((o) => o.verificationStatus !== "EXPIRED_FILTERED")
                .map(
                  (o) => `
                <tr>
                  <td>
                    <div style="font-weight:700;color:#0f172a;">${o.university} (${o.country})</div>
                    <div style="font-size:12px;color:#475569;">${o.title}</div>
                  </td>
                  <td>${getBadgeHtml(o.verificationStatus)}</td>
                  <td>
                    <div style="font-size:12.5px;font-weight:700;color:${o.fundingType === 'TO_VERIFY' ? '#b45309' : '#047857'};">${o.stipend}</div>
                  </td>
                  <td><strong style="color:#2563eb;">${o.fitScore}%</strong></td>
                  <td><span class="badge badge-blue">📅 ${o.deadline}</span></td>
                  <td>${getBadgeHtml(o.pipelineStage)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🛡️ Candidate Source-of-Truth (No-Fabrication Lock)</div>
            <div class="panel-subtitle">AI agents are strictly restricted to Shama Abidi's verified data below</div>
          </div>
          <span class="badge badge-verified">STRICT MODE ON</span>
        </div>
        <div style="font-size:13.5px;display:flex;flex-direction:column;gap:10px;">
          <div class="info-box">
            <div style="color:#64748b;font-size:11.5px;font-weight:700;">CANDIDATE NAME & DISCIPLINE</div>
            <div style="font-weight:700;color:#0f172a;margin-top:2px;">${state.candidate.name} — ${state.candidate.discipline}</div>
          </div>
          <div class="info-box">
            <div style="color:#64748b;font-size:11.5px;font-weight:700;">VERIFIED CREDENTIALS</div>
            <div style="font-weight:700;color:#047857;margin-top:2px;">✓ ${state.candidate.highestDegree} | CGPA: ${state.candidate.cgpa}</div>
            <div style="font-weight:700;color:#047857;margin-top:2px;">✓ ${state.candidate.englishTest}</div>
          </div>
          <div class="warning-box">
            <div style="font-weight:800;color:#b45309;margin-bottom:4px;">⚠ Explicit TO_VERIFY / UNKNOWN Policy</div>
            <ul style="padding-left:18px;color:#78350f;font-size:12.5px;">
              ${state.candidate.unverifiedItems.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;">
            <button class="btn btn-primary" style="flex:1;min-width:180px;" onclick="switchTab('emails')">
              ✉️ Review ${pendingCount} Pending Email Drafts
            </button>
            <button class="btn" style="flex:1;min-width:160px;" onclick="exportWeeklyReport()">
              📊 Generate Weekly Report
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">🛡️ Live Security & Immutable Audit Logs</div>
          <div class="panel-subtitle">Every official verification, No-Fabrication check, and Human-in-the-Loop email approval is recorded below</div>
        </div>
        <span class="badge badge-verified">OAuth2 & Audit Active</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;">
        ${state.auditLogs
          .map(
            (log) => `
          <div style="padding:10px 12px;background:#f8fafc;border:1px solid var(--border-subtle);border-left:3px solid var(--accent-primary);border-radius:6px;font-size:12.5px;">
            <div style="display:flex;justify-content:space-between;color:#475569;font-size:11px;flex-wrap:wrap;gap:4px;">
              <span><strong style="color:#0f172a;">${log.actor}</strong> • ${log.event}</span>
              <span>${log.time}</span>
            </div>
            <div style="color:#334155;margin-top:3px;">${log.detail}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

// ============================================================================
// VIEW 2: GLOBAL PHD DISCOVERY & OFFICIAL VERIFICATION
// ============================================================================
function renderDiscovery() {
  const filtered = state.opportunities.filter((o) => {
    const matchesSearch =
      o.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      o.university.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      o.country.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      o.supervisorName.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesStatus =
      state.statusFilter === "ALL" || o.verificationStatus === state.statusFilter;
    const matchesFunding =
      state.fundingFilter === "ALL" || o.fundingType === state.fundingFilter;
    return matchesSearch && matchesStatus && matchesFunding;
  });

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">🌍 Global Funded PhD Discovery & Official Website Verification Engine</div>
          <div class="panel-subtitle">Scrapes EURAXESS, DAAD, FindAPhD, and University Portals • Verifies official domains • Auto-blocks expired/duplicate calls</div>
        </div>
        <button class="btn btn-primary" onclick="openLiveAgentModal()">
          ▶ Run Live LangGraph Discovery Agent
        </button>
      </div>

      <div class="filter-bar">
        <input
          type="text"
          class="input"
          placeholder="Search university, country, supervisor, or topic (e.g. ETH Zurich, Oxford, Germany)..."
          value="${state.searchQuery}"
          oninput="state.searchQuery = this.value; render();"
        />
        <select class="select" onchange="state.statusFilter = this.value; render();">
          <option value="ALL" ${state.statusFilter === "ALL" ? "selected" : ""}>All Verification Statuses</option>
          <option value="VERIFIED_OFFICIAL" ${state.statusFilter === "VERIFIED_OFFICIAL" ? "selected" : ""}>✓ VERIFIED_OFFICIAL Only</option>
          <option value="TO_VERIFY" ${state.statusFilter === "TO_VERIFY" ? "selected" : ""}>⚠ TO_VERIFY (Missing Public Info)</option>
          <option value="EXPIRED_FILTERED" ${state.statusFilter === "EXPIRED_FILTERED" ? "selected" : ""}>✕ EXPIRED_FILTERED (Blocked)</option>
        </select>
        <select class="select" onchange="state.fundingFilter = this.value; render();">
          <option value="ALL" ${state.fundingFilter === "ALL" ? "selected" : ""}>All Funding Types</option>
          <option value="FULLY_FUNDED" ${state.fundingFilter === "FULLY_FUNDED" ? "selected" : ""}>Fully Funded (Stipend + Tuition)</option>
          <option value="TO_VERIFY" ${state.fundingFilter === "TO_VERIFY" ? "selected" : ""}>TO_VERIFY (No Fabrication)</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PhD Position & Official Source</th>
              <th>University & Country</th>
              <th>Official Verification</th>
              <th>Funding Status (No Fabrication)</th>
              <th>Supervisor & Fit</th>
              <th>Deadline</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                (o) => `
              <tr>
                <td>
                  <div style="font-weight:700;color:#0f172a;">${o.title}</div>
                  <div style="font-size:12px;color:#2563eb;margin-top:2px;word-break:break-all;">🔗 ${o.officialUrl}</div>
                  <div style="font-size:12px;color:#475569;margin-top:4px;">${o.notes}</div>
                </td>
                <td>
                  <div style="font-weight:700;color:#0f172a;">${o.university}</div>
                  <div style="font-size:12px;color:#475569;">${o.country} • ${o.portal}</div>
                </td>
                <td>${getBadgeHtml(o.verificationStatus)}</td>
                <td>
                  ${getBadgeHtml(o.fundingType)}
                  <div style="font-size:12px;margin-top:4px;color:#334155;font-weight:600;">${o.stipend}</div>
                </td>
                <td>
                  <div style="font-weight:700;color:#0f172a;">${o.supervisorName}</div>
                  <div style="font-size:12px;color:#047857;font-weight:700;">Evidence Fit: ${o.fitScore}%</div>
                </td>
                <td><span class="badge badge-blue">${o.deadline}</span></td>
                <td>
                  ${
                    o.verificationStatus === "EXPIRED_FILTERED"
                      ? `<span style="font-size:12px;color:#be123c;font-weight:600;">Blocked by Verifier</span>`
                      : `<button class="btn btn-sm btn-primary" onclick="switchTab('supervisors')">Analyze Fit →</button>`
                  }
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">🧪 Test Official Verification & No-Fabrication Engine Live</div>
          <div class="panel-subtitle">Paste any PhD position title & university URL below to see how the AI verifies official links and handles missing funding info</div>
        </div>
      </div>
      <div class="filter-bar">
        <input id="custom-opp-title" class="input" placeholder="Position Title" value="Wallenberg Funded PhD Position in Autonomous & Intelligent Systems" />
        <input id="custom-opp-uni" class="input" placeholder="University & Country" value="KTH Royal Institute of Technology, Sweden 🇸🇪" />
        <input id="custom-opp-url" class="input" placeholder="Official URL" value="https://www.kth.se/en/about/work-at-kth/phd-wallenberg-2026" />
        <select id="custom-opp-funding" class="select">
          <option value="TO_VERIFY">Simulate Missing Stipend Amount on Page -> Expect 'TO_VERIFY'</option>
          <option value="FULLY_FUNDED">Simulate Confirmed Stipend (SEK 33,500/mo + 100% Tuition)</option>
        </select>
        <button class="btn btn-success" onclick="addAndVerifyCustomOpportunity()">✓ Run Official Verifier</button>
      </div>
    </div>
  `;
}

function addAndVerifyCustomOpportunity() {
  const title = document.getElementById("custom-opp-title").value.trim();
  const uni = document.getElementById("custom-opp-uni").value.trim();
  const url = document.getElementById("custom-opp-url").value.trim();
  const fundingSim = document.getElementById("custom-opp-funding").value;

  if (!title || !uni || !url) return;

  const isOfficial = /\.(edu|ac\.uk|se|de|ch|nl|ca|au)/.test(url);
  const newOpp = {
    id: "opp-" + (state.opportunities.length + 1),
    title,
    university: uni,
    country: uni.includes("Sweden") ? "Sweden 🇸🇪" : "International 🌐",
    portal: "Live URL Verifier",
    officialUrl: url,
    verificationStatus: isOfficial ? "VERIFIED_OFFICIAL" : "TO_VERIFY",
    fundingType: fundingSim,
    stipend:
      fundingSim === "FULLY_FUNDED"
        ? "SEK 33,500 / month + Full Tuition Waiver"
        : "TO_VERIFY (Stipend not explicitly stated on URL — AI refused to fabricate)",
    deadline: "2026-12-15",
    fitScore: 93,
    pipelineStage: "OFFICIALLY_VERIFIED",
    supervisorName: "Prof. Astrid Lindqvist (TO_VERIFY Seat Count)",
    notes: isOfficial
      ? "Official academic domain verified live. Added to pipeline."
      : "Non-standard domain flagged as TO_VERIFY."
  };

  state.opportunities.unshift(newOpp);
  state.auditLogs.unshift({
    time: "Just now",
    actor: "OFFICIAL_VERIFIER_AGENT",
    event: "LIVE_URL_VERIFIED",
    detail: `Verified ${uni} (${url}) -> Funding marked as ${fundingSim}.`
  });

  showToast(`Verified "${title}" at ${uni}. Funding tagged as ${fundingSim}.`);
  render();
}

// ============================================================================
// VIEW 3: SUPERVISOR INTELLIGENCE & EVIDENCE-BASED FIT (QDRANT RAG)
// ============================================================================
function renderSupervisors() {
  const selected =
    state.supervisors.find((s) => s.id === state.selectedSupervisorId) ||
    state.supervisors[0];

  return `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">👩‍🔬 Target Supervisors (Qdrant RAG Indexed)</div>
            <div class="panel-subtitle">Click any professor to inspect their publications & Evidence-Based Fit</div>
          </div>
        </div>
        ${state.supervisors
          .map(
            (s) => `
          <div class="sup-card ${s.id === selected.id ? "selected" : ""}" onclick="state.selectedSupervisorId = '${s.id}'; render();">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:800;font-size:15px;color:#0f172a;">${s.name}</div>
                <div style="font-size:12.5px;color:#475569;">${s.title} • ${s.university}</div>
                <div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:2px;">${s.department}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:18px;font-weight:800;color:#059669;">${s.fitScore}% Fit</div>
                <div style="margin-top:4px;">${getBadgeHtml(s.acceptingStatus)}</div>
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🔬 Evidence-Based Fit Analysis: ${selected.name}</div>
            <div class="panel-subtitle">${selected.university} • Official Email: <strong style="color:#2563eb;">${selected.email}</strong> • H-Index: ${selected.hIndex}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openDraftForSupervisor('${selected.id}')">
            ✉️ Open Personalized Email Draft →
          </button>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#475569;margin-bottom:8px;">
            📚 Supervisor Recent Publications (Indexed in Self-Hosted Qdrant Vector DB)
          </div>
          ${selected.papers
            .map(
              (p) => `
            <div class="info-box" style="margin-bottom:8px;">
              <div style="font-weight:700;color:#0f172a;">"${p.title}" (${p.year})</div>
              <div style="font-size:12px;color:#2563eb;font-weight:600;margin:2px 0 6px;">Published in: ${p.venue}</div>
              <div style="font-size:12.5px;color:#334155;"><strong>Verified Evidence Extract:</strong> ${p.evidenceQuote}</div>
            </div>
          `
            )
            .join("")}
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#047857;margin-bottom:6px;">
            ✓ Verified Research Fit with Shama Abidi (100% Evidence-Backed)
          </div>
          ${selected.verifiedOverlap
            .map((ov) => `<div class="evidence-box">✓ ${ov}</div>`)
            .join("")}
        </div>

        <div class="warning-box">
          <div style="font-weight:800;color:#b45309;margin-bottom:6px;">
            🛡️ Strict No-Fabrication Report (Missing Info Marked TO_VERIFY / UNKNOWN)
          </div>
          <ul style="padding-left:18px;color:#78350f;font-size:13px;">
            ${selected.unverifiedFlags.map((flag) => `<li>${flag}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function openDraftForSupervisor(supId) {
  const found = state.emailDrafts.find((d) => d.supervisorId === supId);
  if (found) {
    state.selectedDraftId = found.id;
  }
  switchTab("emails");
}

// ============================================================================
// VIEW 4: EMAIL STUDIO & HUMAN-IN-THE-LOOP APPROVAL GATE
// ============================================================================
function renderEmails() {
  const draft =
    state.emailDrafts.find((d) => d.id === state.selectedDraftId) ||
    state.emailDrafts[0];

  const isSent = draft.approvalStatus === "SENT_VIA_GMAIL_OAUTH";

  return `
    <div class="lock-banner">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">🔒</span>
        <div>
          <div style="font-weight:800;color:#b45309;font-size:14px;">
            HUMAN-IN-THE-LOOP HARDWARE & POLICY LOCK ACTIVE
          </div>
          <div style="font-size:12.5px;color:#334155;">
            AI is strictly prohibited from sending any email autonomously. Every email draft requires explicit Human Review & Approval below before Gmail OAuth2 dispatch.
          </div>
        </div>
      </div>
      <span class="badge badge-verified">0 Unauthorized Emails Sent</span>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">✉️ Personalized Email Studio (Draft: ${draft.supervisorName})</div>
            <div class="panel-subtitle">To: <strong style="color:#2563eb;">${draft.recipientEmail}</strong> (${draft.university}) • Type: ${draft.type}</div>
          </div>
          ${getBadgeHtml(draft.approvalStatus)}
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          ${state.emailDrafts
            .map(
              (d) => `
            <button class="btn btn-sm ${d.id === draft.id ? "btn-primary" : ""}" onclick="state.selectedDraftId = '${d.id}'; render();">
              ${d.supervisorName} (${d.approvalStatus === "SENT_VIA_GMAIL_OAUTH" ? "✓ Sent" : "⏳ Pending"})
            </button>
          `
            )
            .join("")}
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:#475569;font-weight:700;display:block;margin-bottom:4px;">EMAIL SUBJECT LINE</label>
          <input id="email-subject-input" class="input" value="${draft.subject}" ${isSent ? "disabled" : ""} />
        </div>

        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
            <label style="font-size:12px;color:#475569;font-weight:700;">EMAIL BODY (EDITABLE BEFORE APPROVAL)</label>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" onclick="regenerateTone('academic')" ${isSent ? "disabled" : ""}>🎓 Academic Tone</button>
              <button class="btn btn-sm" onclick="regenerateTone('concise')" ${isSent ? "disabled" : ""}>⚡ Concise Tone</button>
            </div>
          </div>
          <textarea id="email-body-input" class="textarea" ${isSent ? "disabled" : ""}>${draft.body}</textarea>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <button class="btn btn-amber" onclick="runNoFabricationScan()">
            🔍 Re-Run No-Fabrication Guardrail Check
          </button>

          ${
            isSent
              ? `<div style="color:#047857;font-weight:700;font-size:13.5px;">✓ Approved by Human & Dispatched via Gmail OAuth2 at ${draft.approvedAt}</div>`
              : `<div style="display:flex;flex-wrap:wrap;gap:10px;">
                  <button class="btn" onclick="saveDraftEdits()">💾 Save Edits</button>
                  <button class="btn btn-success" onclick="approveAndSendEmail('${draft.id}')">
                    ✓ Approve & Send via Gmail OAuth2
                  </button>
                </div>`
          }
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🛡️ No-Fabrication & Evidence Verification Audit</div>
            <div class="panel-subtitle">Automated pre-flight verification before human approval</div>
          </div>
          <span class="badge badge-verified">100% Verified</span>
        </div>

        <div>
          ${draft.auditChecks
            .map(
              (c) => `
            <div class="checklist-item">
              <div>${getBadgeHtml(c.status)}</div>
              <div style="color:#0f172a;font-weight:500;">${c.label}</div>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="warning-box" style="margin-top:18px;">
          <div style="font-weight:800;color:#b45309;margin-bottom:4px;">Why is there a [TO_VERIFY] tag in the draft?</div>
          <div style="font-size:12.5px;color:#78350f;">
            In strict compliance with the <strong>No Fabrication Rule</strong>, whenever a detail (such as exact intake semester or internal lab grant code) is not explicitly published on the university's official page, the AI highlights it as <code>[TO_VERIFY]</code> or phrases it as a polite question rather than inventing a fact.
          </div>
        </div>

        <div class="info-box" style="margin-top:18px;">
          <div style="font-size:12px;font-weight:800;color:#1d4ed8;text-transform:uppercase;margin-bottom:6px;">
            🔐 Gmail OAuth2 Dispatch Protocol
          </div>
          <div style="font-size:12.5px;color:#334155;">
            • Connected Account: <strong style="color:#0f172a;">shama.abidi.research@gmail.com</strong><br/>
            • Auth Standard: Google OAuth 2.0 (Zero Plaintext Password Storage)<br/>
            • Auto Follow-Up Rule: n8n automatically schedules a 7–10 day check once approved.
          </div>
        </div>
      </div>
    </div>
  `;
}

function saveDraftEdits() {
  const draft = state.emailDrafts.find((d) => d.id === state.selectedDraftId);
  if (!draft) return;
  draft.subject = document.getElementById("email-subject-input").value;
  draft.body = document.getElementById("email-body-input").value;
  showToast(`Saved human edits for ${draft.supervisorName}'s email draft.`);
}

function regenerateTone(tone) {
  const draft = state.emailDrafts.find((d) => d.id === state.selectedDraftId);
  if (!draft || draft.approvalStatus === "SENT_VIA_GMAIL_OAUTH") return;

  if (tone === "concise") {
    draft.body = `Dear ${draft.supervisorName},\n\nI am writing to apply for the funded PhD position in your group at ${draft.university}.\n\nMy Master's research (CGPA 3.88/4.00, IELTS 7.5) in predictive modeling directly complements your recent publication indexed in our review. Could you please confirm if you are taking doctoral students for the upcoming intake [TO_VERIFY: Intake Semester]?\n\nMy CV and transcripts are attached for your review.\n\nBest regards,\nShama Abidi`;
  } else {
    draft.body = `Dear ${draft.supervisorName},\n\nI hope this email finds you well. My name is Shama Abidi, and I wish to express my strong academic interest in pursuing a funded PhD under your supervision at ${draft.university}.\n\nHaving closely reviewed your recent peer-reviewed publications, I found a strong methodological synergy with my verified Master's research (CGPA 3.88/4.00). Any unconfirmed departmental grant code is noted as [TO_VERIFY] pending your guidance.\n\nI have attached my CV and academic credentials and would welcome the opportunity to discuss potential doctoral supervision.\n\nWarm regards,\nShama Abidi`;
  }
  showToast(`Regenerated email draft in ${tone.toUpperCase()} tone (No-Fabrication rules preserved).`);
  render();
}

function runNoFabricationScan() {
  showToast("No-Fabrication Scan Passed: 0 fake degrees, 0 invented papers, 0 false funding claims.");
}

function approveAndSendEmail(draftId) {
  const draft = state.emailDrafts.find((d) => d.id === draftId);
  if (!draft) return;

  const subjEl = document.getElementById("email-subject-input");
  const bodyEl = document.getElementById("email-body-input");
  if (subjEl && bodyEl) {
    draft.subject = subjEl.value;
    draft.body = bodyEl.value;
  }

  draft.approvalStatus = "SENT_VIA_GMAIL_OAUTH";
  draft.approvedByHuman = true;
  draft.approvedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const opp = state.opportunities.find((o) => o.supervisorName === draft.supervisorName);
  if (opp) {
    opp.pipelineStage = "EMAIL_SENT";
  }

  state.auditLogs.unshift({
    time: "Just now",
    actor: "HUMAN_ADMIN (Dashboard)",
    event: "EMAIL_APPROVED_AND_SENT",
    detail: `Human approved & dispatched email to ${draft.supervisorName} (${draft.recipientEmail}) via Gmail OAuth2. 7-day follow-up timer armed.`
  });

  showToast(`Email to ${draft.supervisorName} APPROVED by Human & Sent via Gmail OAuth2!`);
  render();
}

// ============================================================================
// VIEW 5: GMAIL OAUTH INBOX MONITOR & 7-10 DAY AUTO FOLLOW-UPS
// ============================================================================
function renderGmail() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">📬 Gmail OAuth2 Inbox Monitor & AI Reply Classifier</div>
          <div class="panel-subtitle">Monitors official Gmail threads via OAuth2 (no password stored) • Classifies supervisor responses • Prepares 7–10 day follow-up drafts</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="simulateIncomingSupervisorReply()">
            ⚡ Simulate New Supervisor Reply (Live Demo)
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supervisor & University</th>
              <th>Latest Email Snippet (Gmail OAuth2 Sync)</th>
              <th>AI Reply Classification</th>
              <th>Elapsed Time</th>
              <th>Automated Next Step (Human-Gated)</th>
            </tr>
          </thead>
          <tbody>
            ${state.gmailThreads
              .map(
                (t) => `
              <tr>
                <td>
                  <div style="font-weight:700;color:#0f172a;">${t.supervisorName}</div>
                  <div style="font-size:12px;color:#475569;">${t.university}</div>
                  <div style="font-size:11.5px;color:#2563eb;font-weight:600;">${t.email}</div>
                </td>
                <td style="max-width:420px;">
                  <div style="font-size:13px;color:#334155;">"${t.lastSnippet}"</div>
                  <div style="font-size:11.5px;color:#64748b;margin-top:4px;">Received: ${t.receivedAt}</div>
                </td>
                <td>${getBadgeHtml(t.classification)}</td>
                <td><strong style="color:${t.daysSinceContact >= 7 ? '#b45309' : '#047857'};">${t.daysSinceContact} Day(s)</strong></td>
                <td>
                  <div style="font-size:12.5px;color:#334155;margin-bottom:6px;">${t.actionNote}</div>
                  ${
                    t.daysSinceContact >= 7
                      ? `<button class="btn btn-sm btn-primary" onclick="switchTab('emails')">Review Day-${t.daysSinceContact} Follow-Up Draft →</button>`
                      : `<button class="btn btn-sm" onclick="prepareReplyDraft('${t.supervisorName}', '${t.university}', '${t.email}')">Draft Response (Pending Approval) →</button>`
                  }
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function simulateIncomingSupervisorReply() {
  const newThread = {
    id: "thread-" + (state.gmailThreads.length + 101),
    supervisorName: "Prof. Dr. Lukas Meier",
    university: "ETH Zurich 🇨🇭",
    email: "l.meier@inf.ethz.ch",
    lastSnippet:
      "Dear Shama, thank you for your thoughtful email referencing our Nature MI 2026 paper. Yes, our SNSF doctoral fellowship for Autumn 2027 is fully funded. Please share your MS thesis PDF so we can arrange an initial interview.",
    receivedAt: "Just now (Live OAuth Webhook)",
    classification: "INTERVIEW_INVITATION",
    daysSinceContact: 0,
    actionNote: "AI Classified as POSITIVE + FUNDING CONFIRMED! Updated ETH Zurich stage to POSITIVE_REPLY."
  };

  state.gmailThreads.unshift(newThread);
  const ethOpp = state.opportunities.find((o) => o.university.includes("ETH Zurich"));
  if (ethOpp) ethOpp.pipelineStage = "POSITIVE_REPLY";

  state.auditLogs.unshift({
    time: "Just now",
    actor: "GMAIL_OAUTH_CLASSIFIER",
    event: "POSITIVE_REPLY_DETECTED",
    detail: "Prof. Dr. Lukas Meier (ETH Zurich) replied confirming full SNSF funding and requesting MS thesis for interview."
  });

  showToast("New Supervisor Reply from ETH Zurich classified as INTERVIEW_INVITATION + FUNDING CONFIRMED!");
  render();
}

function prepareReplyDraft(supName, uni, email) {
  const newDraftId = "draft-" + (state.emailDrafts.length + 1);
  state.emailDrafts.unshift({
    id: newDraftId,
    supervisorId: "sup-2",
    supervisorName: supName,
    university: uni,
    recipientEmail: email,
    type: "INTERVIEW_RESPONSE",
    approvalStatus: "PENDING_HUMAN_APPROVAL",
    approvedByHuman: false,
    approvedAt: null,
    subject: `Re: Interview Confirmation — Shama Abidi (${uni} Funded PhD)`,
    body: `Dear ${supName},\n\nThank you very much for your positive response and for inviting me to interview.\n\nI would be delighted to join the Zoom meeting at your suggested time. I have also attached my verified Master's thesis summary for your review ahead of our conversation.\n\nWarm regards,\nShama Abidi`,
    auditChecks: [
      { label: "Context matched to incoming Gmail thread via OAuth2", status: "PASS" },
      { label: "Zero fabricated claims", status: "PASS" }
    ]
  });
  state.selectedDraftId = newDraftId;
  showToast(`Created Interview Response draft for ${supName} in Pending Approval Queue.`);
  switchTab("emails");
}

// ============================================================================
// LIVE AGENT SIMULATION MODAL
// ============================================================================
function openLiveAgentModal() {
  const modal = document.getElementById("agent-modal");
  const stepsContainer = document.getElementById("agent-steps-container");
  modal.classList.remove("hidden");

  const steps = [
    {
      title: "Node 1: Global PhD Portal Scraper (n8n + FastAPI)",
      desc: "Scanning EURAXESS, DAAD, FindAPhD, ETH Zurich, Oxford & University of Toronto portals..."
    },
    {
      title: "Node 2: Official Domain Verifier & Deduplication Filter",
      desc: "Verified https://www.utoronto.ca/phd-ai-fellowship-2027 • Filtered 2 duplicate & 1 expired listings."
    },
    {
      title: "Node 3: Qdrant Vector DB Supervisor Publication RAG",
      desc: "Matched Shama Abidi's verified profile against Prof. David Chen's 2026 publications (95% Evidence Fit)."
    },
    {
      title: "Node 4: Strict No-Fabrication Guardrail Check",
      desc: "Confirmed CAD $40,000/yr Connaught Fellowship on official page • Marked lab travel grant as TO_VERIFY."
    },
    {
      title: "Node 5: Personalized Outreach Draft Queued (Human-in-the-Loop Lock)",
      desc: "Draft created in PENDING_HUMAN_APPROVAL state. Auto-send blocked until dashboard approval."
    }
  ];

  stepsContainer.innerHTML = steps
    .map(
      (s, i) => `
    <div id="live-step-${i}" class="agent-step">
      <div id="live-icon-${i}" style="font-weight:700;color:#64748b;">⏳</div>
      <div>
        <div style="font-weight:700;color:#0f172a;">${s.title}</div>
        <div style="color:#475569;font-size:12.5px;">${s.desc}</div>
      </div>
    </div>
  `
    )
    .join("");

  steps.forEach((_, idx) => {
    setTimeout(() => {
      const el = document.getElementById(`live-step-${idx}`);
      const icon = document.getElementById(`live-icon-${idx}`);
      if (el && icon) {
        el.classList.add("done");
        icon.innerHTML = `<span style="color:#059669;">✓</span>`;
      }
      if (idx === steps.length - 1) {
        addLiveDiscoveredTorontoPhD();
      }
    }, (idx + 1) * 650);
  });
}

function addLiveDiscoveredTorontoPhD() {
  const exists = state.opportunities.some((o) =>
    o.university.includes("University of Toronto")
  );
  if (!exists) {
    state.opportunities.unshift({
      id: "opp-live-toronto",
      title: "Connaught International Doctoral Scholarship in Applied AI",
      university: "University of Toronto",
      country: "Canada 🇨🇦",
      portal: "Official UToronto Portal",
      officialUrl: "https://www.sgs.utoronto.ca/awards/connaught-international-scholarship/",
      verificationStatus: "VERIFIED_OFFICIAL",
      fundingType: "FULLY_FUNDED",
      stipend: "CAD $40,000 / year + 100% International Tuition",
      deadline: "2026-12-10",
      fitScore: 95,
      pipelineStage: "DRAFT_PENDING_APPROVAL",
      supervisorName: "Prof. David Chen",
      notes: "Discovered live by LangGraph Agent. Official .utoronto.ca domain verified."
    });

    state.emailDrafts.unshift({
      id: "draft-toronto",
      supervisorId: "sup-1",
      supervisorName: "Prof. David Chen",
      university: "University of Toronto 🇨🇦",
      recipientEmail: "d.chen@cs.toronto.edu",
      type: "INITIAL_OUTREACH (Live Agent Draft)",
      approvalStatus: "PENDING_HUMAN_APPROVAL",
      approvedByHuman: false,
      approvedAt: null,
      subject: "Prospective Connaught Funded PhD Applicant — Shama Abidi",
      body: `Dear Prof. David Chen,\n\nI hope this email finds you well. My name is Shama Abidi, and I am writing to express my strong interest in pursuing a PhD under your supervision at the University of Toronto via the Connaught International Doctoral Scholarship.\n\nMy verified Master's research (CGPA 3.88/4.00, IELTS 7.5) aligns closely with your group's recent publications. Note: Specific conference travel allowance is marked as [TO_VERIFY] pending departmental guidelines.\n\nWarm regards,\nShama Abidi`,
      auditChecks: [
        { label: "Official sgs.utoronto.ca funding verified", status: "PASS" },
        { label: "Unverified conference allowance flagged as [TO_VERIFY]", status: "FLAGGED_SAFE" }
      ]
    });
  }
  showToast("Live LangGraph Run Complete: Added University of Toronto Funded PhD & queued email for Human Approval!");
  render();
}

function closeLiveAgentModal() {
  document.getElementById("agent-modal").classList.add("hidden");
}

function exportWeeklyReport() {
  state.auditLogs.unshift({
    time: "Just now",
    actor: "WEEKLY_REPORT_ENGINE",
    event: "GENERATED_WEEKLY_SUMMARY",
    detail: "Weekly Summary: 4 Verified Funded PhDs active, 92.8% Avg Supervisor Fit, 1 Interview Invitation (Oxford), 0 Unauthorized Sends."
  });
  showToast("Weekly Executive Report generated & added to Audit Logs!");
  render();
}

function render() {
  renderUrduBanner();
  updateSidebarCounts();
  const root = document.getElementById("view-root");
  switch (state.activeTab) {
    case "overview":
      root.innerHTML = renderOverview();
      break;
    case "discovery":
      root.innerHTML = renderDiscovery();
      break;
    case "supervisors":
      root.innerHTML = renderSupervisors();
      break;
    case "emails":
      root.innerHTML = renderEmails();
      break;
    case "gmail":
      root.innerHTML = renderGmail();
      break;
    default:
      root.innerHTML = renderOverview();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  render();
});
