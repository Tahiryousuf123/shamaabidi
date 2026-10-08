import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "backend"))

# Load .env
env_path = root_dir / ".env"
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

from backend.autonomous_pipeline import (
    run_job_research_discovery,
    run_job_professor_matching,
    run_job_funding_and_candidate_verification,
    run_job_email_draft_generation,
)
from backend.database import export_production_state_snapshot

print("=" * 70)
print("1. RUNNING DISCOVERY (TARGET 50 REAL PROFESSORS WITH VERIFIED EMAILS)...")
print("=" * 70)
disc_res = run_job_research_discovery(target_min=50, target_max=50)
print(f"Discovery Result: {disc_res}")

print("\n" + "=" * 70)
print("2. RUNNING PROFESSOR RESEARCH MATCHING...")
print("=" * 70)
match_res = run_job_professor_matching()
print(f"Matching Result: {match_res}")

print("\n" + "=" * 70)
print("3. RUNNING FUNDING & CANDIDATE VERIFICATION...")
print("=" * 70)
fund_res = run_job_funding_and_candidate_verification()
print(f"Verification Result: {fund_res}")

print("\n" + "=" * 70)
print("4. RUNNING EMAIL DRAFT GENERATION (PUSH DIRECT TO GMAIL DRAFTS)...")
print("=" * 70)
draft_res = run_job_email_draft_generation(daily_limit=50)
print(f"Draft Result: {draft_res}")

print("\n" + "=" * 70)
print("5. EXPORTING PRODUCTION STATE SNAPSHOT...")
print("=" * 70)
snapshot = export_production_state_snapshot()
print(f"Total Professors in DB: {len(snapshot.get('professors', []))}")
print(f"Total Drafts in DB: {len(snapshot.get('email_drafts', []))}")

# Check recipients of drafts
sample_drafts = snapshot.get("email_drafts", [])[:10]
print("\nSample Draft Recipients in Gmail:")
for d in sample_drafts:
    print(f" - To: {d.get('recipient_email')} | Subject: {d.get('subject')[:60]}... | Status: {d.get('gmail_sync_status')}")

# Verify no placeholders
placeholders = [d for d in snapshot.get("email_drafts", []) if "verify" in d.get("recipient_email", "").lower()]
print(f"\nTotal Placeholders found: {len(placeholders)} (MUST BE 0)")
