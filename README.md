# Shama Abidi — International Funded PhD AI Research & Application Management System

An advanced, production-ready AI platform and interactive dashboard built for **Shama Abidi** to autonomously discover, officially verify, analyze, and manage international funded PhD opportunities, supervisors, personalized outreach emails (with strict **Human-in-the-Loop Approval**), and **Gmail OAuth2** inbox tracking.

---

## 📘 Complete Step-by-Step User & Client Walkthrough Guide (English)

The platform consists of **5 Core PhD Workflow Modules** accessible from the left sidebar (on Desktop) or the bottom navigation bar / slide-over menu (on Mobile):

### **Step 1: 📊 Executive Dashboard (Overview)**
1. **Review Key Metrics (Top KPI Cards):**
   - **Officially Verified Funded PhDs:** Displays active positions verified against official university domains (with expired and duplicate listings automatically filtered out).
   - **Avg. Supervisor Evidence Fit (`92.8%`):** Calculated by matching Shama Abidi's verified academic profile against supervisor publications indexed in the Qdrant Vector DB.
   - **Emails Pending Human Approval:** Shows how many personalized outreach or follow-up drafts are waiting for review (`0 Auto-Sent by AI`).
   - **Positive / Interview Replies:** Tracks incoming positive responses and interview invitations from professors.
2. **Inspect the Priority Deadlines & Application Pipeline Table:**
   - View each university, official verification badge (`✓ VERIFIED OFFICIAL` or `⚠ TO VERIFY`), stipend/tuition coverage, fit score, deadline, and current pipeline stage.
3. **Verify Candidate Source-of-Truth (Right Panel):**
   - Displays Shama Abidi's verified credentials (`MS/MPhil`, `CGPA 3.88/4.00`, `IELTS 7.5`) and highlights the **Explicit `TO_VERIFY` / `UNKNOWN` Policy** (ensuring the AI never fabricates missing scores or grant numbers).
4. **Live Security & Immutable Audit Logs (Bottom Panel):**
   - Every system event, verification action, and human approval is permanently logged with a timestamp.
   - Click **"📊 Generate Weekly Report"** to generate and log a fresh weekly executive summary.

---

### **Step 2: 🌍 Global PhD Discovery & Official Verification**
1. **Run the Live Multi-Agent Discovery Pipeline:**
   - Click the blue **"▶ Run Live AI Discovery Agent"** button in the top header (or inside the Discovery tab).
   - Watch the **5-step LangGraph pipeline** execute in real time:
     1. *Node 1:* Global PhD Portal Scraper (`EURAXESS`, `DAAD`, `FindAPhD`, `ETH Zurich`, `Oxford`, `University of Toronto`)
     2. *Node 2:* Official Domain Verifier & Deduplication Filter
     3. *Node 3:* Qdrant Vector DB Supervisor Publication RAG Match
     4. *Node 4:* Strict No-Fabrication Guardrail Check
     5. *Node 5:* Personalized Outreach Draft Queued in `PENDING_HUMAN_APPROVAL`
   - Once finished, a newly discovered **University of Toronto (Connaught International Doctoral Scholarship)** opportunity is added to the top of the table and its email draft is queued for approval.
2. **Search & Filter Opportunities:**
   - Use the search bar and dropdowns to filter by university, country, verification status (`VERIFIED_OFFICIAL`, `TO_VERIFY`, `EXPIRED_FILTERED`), or funding type.
   - Notice how expired calls (e.g., *KU Leuven 2025*) are automatically flagged as `✕ EXPIRED FILTERED` and blocked from active outreach.
3. **Test Live URL Verification & No-Fabrication Rules (Bottom Form):**
   - In the **"Test Official Verification & No-Fabrication Engine Live"** section, enter any PhD position title, university, and official URL.
   - Choose whether to simulate a missing stipend figure (`Expect 'TO_VERIFY'`) or a confirmed stipend (`FULLY_FUNDED`), then click **"✓ Run Official Verifier"**.
   - The engine immediately verifies the academic domain and adds the position without inventing any unverified funding figures.

---

### **Step 3: 👩‍🔬 Supervisor Fit (RAG) — Evidence-Based Analysis**
1. **Select a Target Supervisor:**
   - Click on any professor card on the left (*Prof. Dr. Lukas Meier — ETH Zurich*, *Prof. Sarah Jenkins — University of Oxford*, *Prof. Dr. Klaus Weber — TU Munich*, or *Dr. Hendrik van Dijk — TU Delft*).
2. **Inspect Qdrant-Indexed Publications & Evidence Extracts:**
   - On the right panel, review the professor's recent 2025–2026 peer-reviewed publications and the exact **Verified Evidence Extract** from each paper.
3. **Review Verified Overlap & No-Fabrication Flags:**
   - Read the green **Verified Research Fit** boxes showing exact methodological alignment with Shama Abidi's background.
   - Read the amber **Strict No-Fabrication Report** box, which explicitly marks any unconfirmed detail (such as intake month or internal sub-grant code) as `TO_VERIFY` or `UNKNOWN`.
4. **Jump to Email Draft:**
   - Click **"✉️ Open Personalized Email Draft →"** to open the tailored outreach email for that supervisor.

---

### **Step 4: ✉️ Email Approval Gate (Human-in-the-Loop Control)**
1. **Verify the Hardware/Policy Lock Banner:**
   - At the top of the Email Studio, the system confirms: **AI Auto-Send is Strictly Disabled**. No email can leave the system without human approval.
2. **Review, Edit, or Adjust Tone:**
   - Select any supervisor draft at the top of the editor.
   - Freely edit the **Email Subject Line** or **Email Body**, or click **"🎓 Academic Tone"** / **"⚡ Concise Tone"** to regenerate the phrasing while preserving all No-Fabrication rules.
3. **Check the Pre-Flight No-Fabrication Audit (Right Panel):**
   - Verify that all claims (degree, CGPA, cited supervisor paper, and `[TO_VERIFY]` placeholders) have passed the automated audit.
   - Click **"🔍 Re-Run No-Fabrication Guardrail Check"** at any time to re-validate the text.
4. **Approve & Dispatch via Gmail OAuth2:**
   - Click the green **"✓ Approve & Send via Gmail OAuth2"** button.
   - The status immediately transitions from `⚠ PENDING HUMAN APPROVAL` to `✓ SENT VIA GMAIL OAUTH`, the opportunity stage updates to `EMAIL_SENT`, a 7-day follow-up timer is armed, and your approval is recorded in the Security Audit Log.

---

### **Step 5: 📬 Gmail OAuth & 7–10 Day Auto Follow-Ups**
1. **Monitor Incoming Supervisor Replies:**
   - View synchronized Gmail threads connected via **Google OAuth 2.0** (zero plaintext password storage).
   - Each thread is automatically classified by AI into categories such as `✓ INTERVIEW INVITATION`, `SUPERVISOR REDIRECT`, or `⚠ AWAITING REPLY (8 Days Elapsed)`.
2. **Simulate a Live Incoming Reply (Client Demo Action):**
   - Click **"⚡ Simulate New Supervisor Reply (Live Demo)"** in the top-right corner of the panel.
   - A new reply from *Prof. Dr. Lukas Meier (ETH Zurich)* arrives in real time, and the AI automatically classifies it as `✓ INTERVIEW INVITATION` with confirmed SNSF funding!
3. **Review 7–10 Day Automatic Follow-Up Drafts:**
   - For threads where 7–10 days have elapsed without a response (e.g., *Prof. Dr. Klaus Weber — 8 Days*), the self-hosted `n8n` scheduler automatically prepares a polite follow-up draft and places it in the **Email Approval Gate** (never sent without your approval). Click **"Review Day-8 Follow-Up Draft →"** to inspect and approve it.

---

## ☁️ Deploying to Vercel (Free Hosting)

This project includes a pre-configured [`vercel.json`](./vercel.json) file and is 100% compatible with **Vercel's Free Hobby Plan**:
- **Option A (One-Click Script):** Double-click [`deploy_to_vercel.bat`](./deploy_to_vercel.bat) in this folder, log in to your Vercel account in the browser window that opens, and press `Enter` to get your live `https://...vercel.app` URL.
- **Option B (GitHub Import):** Push this repository to GitHub, go to [vercel.com/new](https://vercel.com/new), select the repository, and click **Deploy**.
